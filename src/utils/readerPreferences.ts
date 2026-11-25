import type { NewsArticle } from '../types/news';
import { stripRichTextToPlainText } from './richText';

export type PublicThemeMode = 'light' | 'dark';
export type ReadingFontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface ReadingPreferences {
  fontScale: ReadingFontScale;
  comfortMode: boolean;
  reducedMotion: boolean;
}

export interface SavedArticleSnapshot {
  id: string;
  titleKannada: string;
  summaryKannada: string;
  category: NewsArticle['category'];
  location: string;
  publishedDate: string;
  publishedTime: string;
  readTimeMinutes: number;
  imageUrl?: string;
  imageKey?: NewsArticle['imageKey'];
  savedAt: number;
}

export interface HistoryArticleSnapshot extends SavedArticleSnapshot {
  readAt: number;
}

export interface ReaderNotificationSettings {
  browserEnabled: boolean;
  breakingOnly: boolean;
  localCategoryAlerts: boolean;
  frequency: 'instant' | 'digest';
}

export interface InAppNotificationItem {
  id: string;
  articleId: string;
  title: string;
  category: string;
  location: string;
  createdAt: number;
  read: boolean;
}

export interface NewsletterSubscriptionState {
  subscribed: boolean;
  contact: string;
  channel: 'email' | 'whatsapp';
  frequency: 'daily' | 'breaking';
  categories: string[];
  updatedAt: number;
}

const THEME_KEY = 'cn_public_theme_v1';
const READING_PREFS_KEY = 'cn_reading_prefs_v1';
const BOOKMARKS_KEY = 'cn_bookmarks_v1';
const HISTORY_KEY = 'cn_reading_history_v1';
const NOTIF_PREFS_KEY = 'cn_notifications_prefs_v1';
const NOTIF_ITEMS_KEY = 'cn_notification_feed_v1';
const NOTIFIED_IDS_KEY = 'cn_notified_breaking_ids_v1';
const NEWSLETTER_KEY = 'cn_newsletter_sub_v1';

export function readInitialPublicTheme(): PublicThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export function persistPublicTheme(theme: PublicThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore
  }
  try {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch {
    // Ignore
  }
}

export function readReadingPreferences(): ReadingPreferences {
  const defaults: ReadingPreferences = {
    fontScale: 'md',
    comfortMode: false,
    reducedMotion: false,
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(READING_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ReadingPreferences>;
    return {
      fontScale:
        parsed.fontScale === 'sm' ||
        parsed.fontScale === 'md' ||
        parsed.fontScale === 'lg' ||
        parsed.fontScale === 'xl'
          ? parsed.fontScale
          : 'md',
      comfortMode: Boolean(parsed.comfortMode),
      reducedMotion: Boolean(parsed.reducedMotion),
    };
  } catch {
    return defaults;
  }
}

export function persistReadingPreferences(prefs: ReadingPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(READING_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore
  }
  try {
    if (prefs.reducedMotion) {
      document.documentElement.classList.add('cn-reduced-motion');
    } else {
      document.documentElement.classList.remove('cn-reduced-motion');
    }
  } catch {
    // Ignore
  }
}

function toSnapshot(article: NewsArticle): SavedArticleSnapshot {
  return {
    id: article.id,
    titleKannada: stripRichTextToPlainText(article.titleKannada),
    summaryKannada: stripRichTextToPlainText(article.summaryKannada),
    category: article.category,
    location: article.location,
    publishedDate: article.publishedDate,
    publishedTime: article.publishedTime,
    readTimeMinutes: article.readTimeMinutes,
    imageUrl: article.imageThumbUrl || article.imageUrl,
    imageKey: article.imageKey,
    savedAt: Date.now(),
  };
}

export function readBookmarks(): SavedArticleSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedArticleSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function toggleArticleBookmark(article: NewsArticle): {
  bookmarks: SavedArticleSnapshot[];
  saved: boolean;
} {
  const current = readBookmarks();
  const exists = current.some((b) => b.id === article.id);
  const next = exists
    ? current.filter((b) => b.id !== article.id)
    : [toSnapshot(article), ...current].slice(0, 60);
  try {
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return { bookmarks: next, saved: !exists };
}

export function removeBookmarkById(articleId: string): SavedArticleSnapshot[] {
  const next = readBookmarks().filter((b) => b.id !== articleId);
  try {
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function readReadingHistory(): HistoryArticleSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryArticleSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function recordReadingHistoryEntry(article: NewsArticle): HistoryArticleSnapshot[] {
  const current = readReadingHistory().filter((h) => h.id !== article.id);
  const entry: HistoryArticleSnapshot = {
    ...toSnapshot(article),
    readAt: Date.now(),
  };
  const next = [entry, ...current].slice(0, 30);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function clearReadingHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore
  }
}

export function readNotificationSettings(): ReaderNotificationSettings {
  const defaults: ReaderNotificationSettings = {
    browserEnabled: false,
    breakingOnly: true,
    localCategoryAlerts: true,
    frequency: 'instant',
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ReaderNotificationSettings>;
    return {
      browserEnabled: Boolean(parsed.browserEnabled),
      breakingOnly: parsed.breakingOnly !== false,
      localCategoryAlerts: parsed.localCategoryAlerts !== false,
      frequency: parsed.frequency === 'digest' ? 'digest' : 'instant',
    };
  } catch {
    return defaults;
  }
}

export function persistNotificationSettings(settings: ReaderNotificationSettings): void {
  try {
    window.localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}

export function readNotificationFeed(): InAppNotificationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTIF_ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InAppNotificationItem[]) : [];
  } catch {
    return [];
  }
}

export function persistNotificationFeed(items: InAppNotificationItem[]): void {
  try {
    window.localStorage.setItem(NOTIF_ITEMS_KEY, JSON.stringify(items.slice(0, 25)));
  } catch {
    // Ignore
  }
}

export function readNotifiedArticleIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(NOTIFIED_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function markArticleIdsNotified(ids: string[]): void {
  try {
    const existing = Array.from(readNotifiedArticleIds());
    const merged = Array.from(new Set([...ids, ...existing])).slice(0, 100);
    window.localStorage.setItem(NOTIFIED_IDS_KEY, JSON.stringify(merged));
  } catch {
    // Ignore
  }
}

export function readNewsletterSubscription(): NewsletterSubscriptionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NEWSLETTER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NewsletterSubscriptionState;
  } catch {
    return null;
  }
}

export function persistNewsletterSubscription(state: NewsletterSubscriptionState | null): void {
  try {
    if (!state) {
      window.localStorage.removeItem(NEWSLETTER_KEY);
    } else {
      window.localStorage.setItem(NEWSLETTER_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore
  }
}
