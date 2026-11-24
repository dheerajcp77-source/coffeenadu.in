import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, ChevronRight, Clock, Loader2, MessageSquare } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { ArticleDetailView } from './components/ArticleDetailView';
import { ArticleShareBar } from './components/ArticleShareBar';
import { BusTimingsSection } from './components/BusTimingsSection';
import { CategoryBar, getCategoryShortIcon } from './components/CategoryBar';
import { CoffeeCupLogo } from './components/CoffeeCupLogo';
import { FeaturedLeadCarousel } from './components/FeaturedLeadCarousel';
import { FloatingScrollAd } from './components/FloatingScrollAd';
import { Header } from './components/Header';
import { HomepageAdSlot } from './components/HomepageAdSlot';
import { HomepagePopupAd } from './components/HomepagePopupAd';
import { LocalAdsSection } from './components/LocalAdsSection';
import { NewsImage } from './components/NewsImage';
import { PrivacyScreenGuard } from './components/PrivacyScreenGuard';
import { ProgramsEventsSection } from './components/ProgramsEventsSection';
import { RightRail } from './components/RightRail';
import { SupportChatSection } from './components/SupportChatSection';
import { WebsiteEntryAd } from './components/WebsiteEntryAd';
import { WhatsAppGroupBanner } from './components/WhatsAppGroupBanner';
import {
  NEWS_CATEGORIES,
  getKannadaLocationLabel,
  matchesSelectedLocation,
  resolveArticleImage,
} from './constants/newsData';
import {
  fetchActiveAdById,
  loadActiveAds,
  subscribeToActiveAds,
} from './services/adsClient';
import {
  getArticleByIdFromFirestore,
  loadInitialArticles,
  loadMoreArticles,
  subscribeToArticlesState,
} from './services/articlesStore';
import {
  checkReaderThreadSummaryOnce,
  getOrCreateReaderThreadId,
} from './services/chatStore';
import {
  getEventByIdFromFirestore,
  loadInitialEvents,
  loadMoreEvents,
  subscribeToEventsState,
} from './services/eventsStore';
import { subscribeToQuotaStatus, type QuotaStatus } from './services/firestoreOptimizer';
import type { AdPlatformSettings, Advertisement } from './types/ads';
import type { FilterCategory, NewsArticle, ProgramEvent, SupportThread } from './types/news';
import { createDefaultAdPlatformSettings } from './utils/adHelpers';
import { isArticleActivelyFeatured } from './utils/featuredLead';
import { sanitizeRichTextHtml, stripRichTextToPlainText } from './utils/richText';

type TimeframeFilter = 'All' | 'Today' | 'Yesterday' | 'This Week';

function isAdminPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/admin' || normalized.startsWith('/admin/');
}

function isBusTimingsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/bus-timings' || normalized.startsWith('/bus-timings/');
}

function isEventsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/events' || normalized.startsWith('/events/');
}

function isChatPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/chat' || normalized.startsWith('/chat/');
}

function isAdsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/ads' || normalized.startsWith('/ads/');
}

function parseArticleDateToMidnight(dateStr: string, timestamp?: number): number | null {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
    const dt = new Date(timestamp);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  }
  const parsed = new Date(dateStr.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

function formatDateLabelFromMidnight(midnightMs: number): string {
  return new Date(midnightMs).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface DateWiseArticleGroup {
  key: string;
  heading: string;
  subLabel?: string;
  sortDayMs: number;
  articles: NewsArticle[];
}

function groupArticlesByDate(list: NewsArticle[]): DateWiseArticleGroup[] {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const groupsMap = new Map<string, DateWiseArticleGroup>();

  for (const article of list) {
    const midnight = parseArticleDateToMidnight(article.publishedDate, article.publishedTimestamp);
    const sortDayMs = midnight ?? 0;
    const formattedDate = midnight !== null ? formatDateLabelFromMidnight(midnight) : article.publishedDate || 'Archive';
    const diffDays = midnight !== null ? Math.round((todayMidnight - midnight) / oneDayMs) : null;

    let heading = formattedDate;
    let subLabel: string | undefined;
    if (diffDays === 0) {
      heading = 'Today';
      subLabel = formattedDate;
    } else if (diffDays === 1) {
      heading = 'Yesterday';
      subLabel = formattedDate;
    }

    const key = midnight !== null ? String(midnight) : `date:${formattedDate}`;
    const existing = groupsMap.get(key);
    if (existing) {
      existing.articles.push(article);
    } else {
      groupsMap.set(key, {
        key,
        heading,
        subLabel,
        sortDayMs,
        articles: [article],
      });
    }
  }

  return Array.from(groupsMap.values())
    .sort((a, b) => b.sortDayMs - a.sortDayMs)
    .map((group) => ({
      ...group,
      articles: [...group.articles].sort(
        (a, b) => (b.publishedTimestamp ?? 0) - (a.publishedTimestamp ?? 0)
      ),
    }));
}

function matchesTimeframe(article: NewsArticle, timeframe: TimeframeFilter): boolean {
  if (timeframe === 'All') return true;

  const articleMidnight = parseArticleDateToMidnight(
    article.publishedDate,
    article.publishedTimestamp
  );
  if (articleMidnight === null) return false;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((todayMidnight - articleMidnight) / (24 * 60 * 60 * 1000));

  if (timeframe === 'Today') {
    return diffDays === 0;
  }
  if (timeframe === 'Yesterday') {
    return diffDays === 1;
  }
  // This Week (last 7 days including today)
  return diffDays >= 0 && diffDays <= 6;
}

function readArticleIdFromUrl(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('article');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function readEventIdFromUrl(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('event');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function readAdIdFromUrl(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('ad');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function readAdPreviewTokenFromUrl(): string | null {
  try {
    const token = new URLSearchParams(window.location.search).get('preview');
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

function ArticleLoadingSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading selected article"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
    >
      <div className="flex items-center justify-between gap-4 pb-6 border-b border-stone-200">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-stone-600 hover:text-[#0F274A] cursor-pointer px-2 -ml-2 min-h-[40px]"
        >
          ← Back to Feed
        </button>
        <div className="h-8 w-36 rounded-md bg-stone-200 animate-pulse" />
      </div>
      <div className="py-8 max-w-3xl mx-auto space-y-5">
        <div className="h-4 w-56 rounded bg-stone-200 animate-pulse" />
        <div className="h-9 w-full rounded bg-stone-200 animate-pulse" />
        <div className="h-9 w-4/5 rounded bg-stone-200 animate-pulse" />
        <div className="h-5 w-full rounded bg-stone-100 animate-pulse" />
        <div className="aspect-[16/9] w-full rounded-md bg-stone-200 animate-pulse" />
        <div className="space-y-3 pt-2">
          <div className="h-4 w-full rounded bg-stone-100 animate-pulse" />
          <div className="h-4 w-11/12 rounded bg-stone-100 animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-stone-100 animate-pulse" />
        </div>
      </div>
    </main>
  );
}

function FeedLoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading latest news" className="space-y-4">
      <div className="rounded-2xl h-[250px] sm:h-[275px] bg-slate-200 animate-pulse" />
      {[1, 2, 3, 4].map((idx) => (
        <div
          key={idx}
          className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-3.5 sm:gap-4"
        >
          <div className="w-24 h-20 sm:w-36 sm:h-24 shrink-0 rounded-lg bg-slate-200 animate-pulse" />
          <div className="flex-1 space-y-2.5">
            <div className="h-3 w-28 rounded bg-slate-200 animate-pulse" />
            <div className="h-4 w-full rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [articlesLoaded, setArticlesLoaded] = useState<boolean>(false);
  const [hasMoreArticles, setHasMoreArticles] = useState<boolean>(false);
  const [loadingMoreArticles, setLoadingMoreArticles] = useState<boolean>(false);
  const [events, setEvents] = useState<ProgramEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState<boolean>(false);
  const [hasMoreEvents, setHasMoreEvents] = useState<boolean>(false);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState<boolean>(false);
  const [directEvent, setDirectEvent] = useState<ProgramEvent | null>(null);
  const [directEventLoading, setDirectEventLoading] = useState<boolean>(() =>
    Boolean(readEventIdFromUrl())
  );
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>({
    quotaExceeded: false,
    lastErrorAt: 0,
    cooldownUntil: 0,
    message: '',
  });
  const [readerThread, setReaderThread] = useState<SupportThread | null>(null);
  const readerThreadId = useMemo(() => getOrCreateReaderThreadId(), []);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(() =>
    readArticleIdFromUrl()
  );
  const [directArticle, setDirectArticle] = useState<NewsArticle | null>(null);
  const [directArticleLoading, setDirectArticleLoading] = useState<boolean>(() =>
    Boolean(readArticleIdFromUrl())
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() =>
    readEventIdFromUrl()
  );
  const [activeAds, setActiveAds] = useState<Advertisement[]>([]);
  const [adSettings, setAdSettings] = useState<AdPlatformSettings>(() =>
    createDefaultAdPlatformSettings()
  );
  const [adsLoaded, setAdsLoaded] = useState<boolean>(false);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(() =>
    readAdIdFromUrl()
  );
  const [selectedAdPreviewToken, setSelectedAdPreviewToken] = useState<string | null>(() =>
    readAdPreviewTokenFromUrl()
  );
  const [directAd, setDirectAd] = useState<Advertisement | null>(null);
  const [isDirectAdPreview, setIsDirectAdPreview] = useState<boolean>(false);
  const [directAdLoading, setDirectAdLoading] = useState<boolean>(() =>
    Boolean(readAdIdFromUrl())
  );
  const [entryOverlayActive, setEntryOverlayActive] = useState<boolean>(false);
  const [leadNowMs, setLeadNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    // Prune only legacy pre-PWA CacheStorage buckets (never touch active CoffeeNadu PWA cache or Service Worker)
    try {
      if ('caches' in window && window.caches && typeof window.caches.keys === 'function') {
        void window.caches
          .keys()
          .then((keys) =>
            Promise.allSettled(
              keys
                .filter((key) => !key.startsWith('coffeenadu-admin-shell-'))
                .map((key) => window.caches.delete(key))
            )
          )
          .catch(() => {
            // Ignore restricted storage/iframe CacheStorage errors
          });
      }
    } catch {
      // Ignore cache cleanup errors
    }

    const handlePopState = () => {
      setPathname(window.location.pathname);
      setSelectedArticleId(readArticleIdFromUrl());
      setSelectedEventId(readEventIdFromUrl());
      setSelectedAdId(readAdIdFromUrl());
      setSelectedAdPreviewToken(readAdPreviewTokenFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Subscribe to in-memory shared stores & quota monitor (0 Firestore reads)
  useEffect(() => {
    const unsubArticles = subscribeToArticlesState((state) => {
      setArticles(state.articles);
      setArticlesLoaded(state.loaded);
      setHasMoreArticles(state.hasMore);
    });
    const unsubEvents = subscribeToEventsState((state) => {
      setEvents(state.events);
      setEventsLoaded(state.loaded);
      setHasMoreEvents(state.hasMore);
    });
    const unsubAds = subscribeToActiveAds((state) => {
      setActiveAds(state.ads);
      setAdSettings(state.settings);
      setAdsLoaded(state.loaded);
    });
    const unsubQuota = subscribeToQuotaStatus((nextStatus) => {
      setQuotaStatus(nextStatus);
    });
    return () => {
      unsubArticles();
      unsubEvents();
      unsubAds();
      unsubQuota();
    };
  }, []);

  const adminRouteActive = isAdminPath(pathname);
  const busTimingsActiveCheck = isBusTimingsPath(pathname);
  const eventsActiveCheck = isEventsPath(pathname);
  const chatActiveCheck = isChatPath(pathname);
  const adsActiveCheck = isAdsPath(pathname);

  // Load active local advertisements on public routes
  useEffect(() => {
    if (adminRouteActive) return;
    void loadActiveAds();
  }, [adminRouteActive]);

  // Lazy-load initial news feed ONLY when viewing the public news feed (never on /admin, /events, /bus-timings, /chat, /ads, or direct ?article=id)
  useEffect(() => {
    if (
      adminRouteActive ||
      busTimingsActiveCheck ||
      eventsActiveCheck ||
      chatActiveCheck ||
      adsActiveCheck ||
      selectedArticleId ||
      selectedAdId
    ) {
      return;
    }
    void loadInitialArticles();
  }, [
    adminRouteActive,
    busTimingsActiveCheck,
    eventsActiveCheck,
    chatActiveCheck,
    adsActiveCheck,
    selectedArticleId,
    selectedAdId,
  ]);

  // Lazy-load initial events list ONLY when visiting /events without a direct ?event=id
  useEffect(() => {
    if (adminRouteActive || !eventsActiveCheck || selectedEventId) {
      return;
    }
    void loadInitialEvents();
  }, [adminRouteActive, eventsActiveCheck, selectedEventId]);

  // Lightweight cached check for reader chat unread badge (0 reads unless reader actually started a thread)
  useEffect(() => {
    if (adminRouteActive) return;
    let cancelled = false;
    void checkReaderThreadSummaryOnce(readerThreadId).then((thread) => {
      if (!cancelled) {
        setReaderThread(thread);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [adminRouteActive, readerThreadId, chatActiveCheck]);

  // Direct single-doc lookup for shared article URLs (1 read max, or 0 if cached)
  useEffect(() => {
    if (!selectedArticleId) {
      setDirectArticle(null);
      setDirectArticleLoading(false);
      return;
    }

    const fromList = articles.find((a) => a.id === selectedArticleId);
    if (fromList) {
      setDirectArticle(fromList);
      setDirectArticleLoading(false);
      return;
    }

    let cancelled = false;
    setDirectArticle(null);
    setDirectArticleLoading(true);

    void getArticleByIdFromFirestore(selectedArticleId)
      .then((found) => {
        if (cancelled) return;
        setDirectArticle(found);
        setDirectArticleLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setDirectArticleLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedArticleId, articles]);

  // Direct single-doc lookup for shared program/event URLs (1 read max, or 0 if cached)
  useEffect(() => {
    if (!eventsActiveCheck || !selectedEventId) {
      setDirectEvent(null);
      setDirectEventLoading(false);
      return;
    }

    const fromList = events.find((ev) => ev.id === selectedEventId);
    if (fromList) {
      setDirectEvent(fromList);
      setDirectEventLoading(false);
      return;
    }

    let cancelled = false;
    setDirectEvent(null);
    setDirectEventLoading(true);

    void getEventByIdFromFirestore(selectedEventId)
      .then((found) => {
        if (cancelled) return;
        setDirectEvent(found);
        setDirectEventLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setDirectEventLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventsActiveCheck, selectedEventId, events]);

  // Direct single-ad lookup for shared advertisement URLs (/ads?ad=<id>&preview=<token>)
  useEffect(() => {
    if (!selectedAdId) {
      setDirectAd(null);
      setIsDirectAdPreview(false);
      setDirectAdLoading(false);
      return;
    }

    if (!selectedAdPreviewToken) {
      const fromList = activeAds.find(
        (a) =>
          a.id === selectedAdId ||
          a.adNumber.toUpperCase() === selectedAdId.toUpperCase() ||
          (a.sharing?.customSlug && a.sharing.customSlug.toLowerCase() === selectedAdId.toLowerCase())
      );
      if (fromList) {
        setDirectAd(fromList);
        setIsDirectAdPreview(false);
        setDirectAdLoading(false);
        return;
      }
    }

    let cancelled = false;
    setDirectAd(null);
    setDirectAdLoading(true);
    void fetchActiveAdById(selectedAdId, selectedAdPreviewToken)
      .then((res) => {
        if (cancelled) return;
        setDirectAd(res?.ad ?? null);
        setIsDirectAdPreview(Boolean(res?.isPreview));
        if (res?.settings) setAdSettings(res.settings);
        setDirectAdLoading(false);
      })
      .catch(() => {
        if (!cancelled) setDirectAdLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAdId, selectedAdPreviewToken, activeAds]);

  const handleLoadMoreArticles = async () => {
    if (loadingMoreArticles || !hasMoreArticles) return;
    setLoadingMoreArticles(true);
    try {
      await loadMoreArticles();
    } finally {
      setLoadingMoreArticles(false);
    }
  };

  const handleLoadMoreEvents = async () => {
    if (loadingMoreEvents || !hasMoreEvents) return;
    setLoadingMoreEvents(true);
    try {
      await loadMoreEvents();
    } finally {
      setLoadingMoreEvents(false);
    }
  };

  const navigateTo = (targetPath: string, instantScroll = false) => {
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== targetPath) {
      window.history.pushState({}, '', targetPath);
      setPathname(targetPath.split('?')[0] || '/');
    }
    window.scrollTo({ top: 0, behavior: instantScroll ? 'auto' : 'smooth' });
  };

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((article) => {
      if (activeCategory !== 'All' && article.category !== activeCategory) {
        return false;
      }
      if (!matchesSelectedLocation(article.location, selectedLocation)) {
        return false;
      }
      if (!matchesTimeframe(article, timeframe)) {
        return false;
      }
      if (q) {
        const haystack = [
          stripRichTextToPlainText(article.titleKannada),
          stripRichTextToPlainText(article.summaryKannada),
          article.category,
          article.location,
          article.reporter,
          ...article.bodyKannada.map((part) => stripRichTextToPlainText(part)),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
  }, [articles, activeCategory, selectedLocation, timeframe, searchQuery]);

  const selectedArticle = useMemo(() => {
    if (!selectedArticleId) return null;
    const fromFeed = articles.find((a) => a.id === selectedArticleId);
    if (fromFeed) return fromFeed;
    if (directArticle && directArticle.id === selectedArticleId) {
      return directArticle;
    }
    return null;
  }, [articles, selectedArticleId, directArticle]);

  const isWaitingForSelectedArticle = Boolean(
    selectedArticleId && !selectedArticle && (!articlesLoaded || directArticleLoading)
  );

  const relatedArticles = useMemo(() => {
    if (!selectedArticle) return [];
    return articles
      .filter(
        (a) => a.id !== selectedArticle.id && a.category === selectedArticle.category
      )
      .slice(0, 3);
  }, [articles, selectedArticle]);

  const busTimingsActive = isBusTimingsPath(pathname);
  const eventsActive = isEventsPath(pathname);
  const chatActive = isChatPath(pathname);
  const adsActive = isAdsPath(pathname);
  const isSpecialRoute = busTimingsActive || eventsActive || chatActive || adsActive;

  const handleSelectCategory = (category: FilterCategory) => {
    setActiveCategory(category);
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    if (isSpecialRoute || window.location.search) {
      navigateTo('/');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleResetHome = () => {
    setActiveCategory('All');
    setSelectedLocation('All');
    setTimeframe('All');
    setSearchQuery('');
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    if (isSpecialRoute || window.location.search) {
      navigateTo('/');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenArticle = (article: NewsArticle) => {
    setSelectedEventId(null);
    setSelectedAdId(null);
    setDirectArticle(article);
    setDirectArticleLoading(false);
    setSelectedArticleId(article.id);
    navigateTo(`/?article=${encodeURIComponent(article.id)}`, true);
  };

  const handleCloseArticle = () => {
    setSelectedArticleId(null);
    setDirectArticle(null);
    setDirectArticleLoading(false);
    navigateTo('/', true);
  };

  const handleOpenEvent = (ev: ProgramEvent) => {
    setSelectedArticleId(null);
    setSelectedAdId(null);
    setSelectedEventId(ev.id);
    navigateTo(`/events?event=${encodeURIComponent(ev.id)}`);
  };

  const handleCloseEvent = () => {
    setSelectedEventId(null);
    navigateTo('/events');
  };

  const handleJumpToBusTimings = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    navigateTo('/bus-timings');
  };

  const handleJumpToEvents = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    navigateTo('/events');
  };

  const handleJumpToChat = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    navigateTo('/chat');
  };

  const handleJumpToAds = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    void loadActiveAds();
    navigateTo('/ads');
  };

  const handleOpenAd = (ad: Advertisement) => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdPreviewToken(null);
    setIsDirectAdPreview(false);
    setDirectAd(ad);
    setDirectAdLoading(false);
    setSelectedAdId(ad.id);
    navigateTo(`/ads?ad=${encodeURIComponent(ad.sharing?.customSlug || ad.id)}`, true);
  };

  const handleCloseAd = () => {
    setSelectedAdId(null);
    setSelectedAdPreviewToken(null);
    setIsDirectAdPreview(false);
    setDirectAd(null);
    setDirectAdLoading(false);
    navigateTo('/ads');
  };

  // Real-time auto-removal of expired Lead Stories without requiring a page reload
  useEffect(() => {
    let earliestExpiry = Number.POSITIVE_INFINITY;
    for (const article of articles) {
      if (
        article.isFeatured &&
        typeof article.featuredUntil === 'number' &&
        article.featuredUntil > leadNowMs &&
        article.featuredUntil < earliestExpiry
      ) {
        earliestExpiry = article.featuredUntil;
      }
    }
    if (!Number.isFinite(earliestExpiry)) return;
    const delayMs = Math.max(1000, Math.min(60000, earliestExpiry - leadNowMs + 500));
    const timer = window.setTimeout(() => {
      setLeadNowMs(Date.now());
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [articles, leadNowMs]);

  const leadArticles = useMemo(
    () => filteredArticles.filter((a) => isArticleActivelyFeatured(a, leadNowMs)),
    [filteredArticles, leadNowMs]
  );
  const dateGroups = useMemo(() => groupArticlesByDate(filteredArticles), [filteredArticles]);

  if (isAdminPath(pathname)) {
    return (
      <AdminPanel
        articles={articles}
        onNavigateHome={() => navigateTo('/')}
      />
    );
  }

  return (
    <PrivacyScreenGuard enabled={!isAdminPath(pathname)}>
      <div className="min-h-screen flex flex-col bg-[#F2F5F8] text-slate-900">
        <WhatsAppGroupBanner variant="top-bar" />
        <Header
          activeCategory={activeCategory}
          isBusTimingsView={busTimingsActive}
          isEventsView={eventsActive}
          isChatView={chatActive}
          isAdsView={adsActive || Boolean(selectedAdId)}
          onSelectCategory={handleSelectCategory}
          onResetHome={handleResetHome}
          onJumpToBusTimings={handleJumpToBusTimings}
          onJumpToEvents={handleJumpToEvents}
          onJumpToAds={handleJumpToAds}
        />

        {!selectedArticleId && !selectedAdId && !isSpecialRoute && (
          <CategoryBar
            activeCategory={activeCategory}
            isAdsView={adsActive || Boolean(selectedAdId)}
            onSelectCategory={handleSelectCategory}
            onJumpToAds={handleJumpToAds}
            selectedLocation={selectedLocation}
            onSelectLocation={setSelectedLocation}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        )}

        {busTimingsActive ? (
          <main className="flex-1">
            <BusTimingsSection onBackToNews={handleResetHome} />
          </main>
        ) : eventsActive ? (
          <main className="flex-1">
            <ProgramsEventsSection
              events={events}
              directEvent={directEvent}
              isLoading={selectedEventId ? directEventLoading && !directEvent : !eventsLoaded}
              selectedEventId={selectedEventId}
              hasMoreEvents={hasMoreEvents}
              loadingMoreEvents={loadingMoreEvents}
              quotaExceeded={quotaStatus.quotaExceeded}
              onLoadMoreEvents={handleLoadMoreEvents}
              onSelectEvent={handleOpenEvent}
              onCloseEvent={handleCloseEvent}
              onBackToNews={handleResetHome}
            />
            {!selectedEventId && activeAds.length > 0 && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
                <HomepageAdSlot
                  ads={activeAds}
                  settings={adSettings}
                  position="custom"
                  customPosition="after_events"
                  onOpenAd={handleOpenAd}
                  onViewAllAds={handleJumpToAds}
                />
              </div>
            )}
          </main>
        ) : chatActive ? (
          <main className="flex-1">
            <SupportChatSection onBackToNews={handleResetHome} />
          </main>
        ) : adsActive || selectedAdId ? (
          <main className="flex-1">
            <LocalAdsSection
              ads={activeAds}
              settings={adSettings}
              directAd={directAd}
              isDirectPreview={isDirectAdPreview}
              isLoading={selectedAdId ? directAdLoading && !directAd : !adsLoaded}
              selectedAdId={selectedAdId}
              onSelectAd={handleOpenAd}
              onCloseAd={handleCloseAd}
              onBackToNews={handleResetHome}
            />
          </main>
        ) : selectedArticleId ? (
          <div className="flex-1 bg-white">
            {selectedArticle ? (
              <ArticleDetailView
                key={selectedArticle.id}
                article={selectedArticle}
                relatedArticles={relatedArticles}
                activeAds={activeAds}
                adSettings={adSettings}
                onBack={handleCloseArticle}
                onSelectArticle={handleOpenArticle}
                onSelectAd={handleOpenAd}
              />
            ) : isWaitingForSelectedArticle ? (
              <ArticleLoadingSkeleton onBack={handleCloseArticle} />
            ) : (
              <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
                <h1 className="text-lg font-bold text-slate-900">
                  Selected article could not be found
                </h1>
                <p className="text-sm text-slate-600">
                  This story may have been removed or moved by the editorial desk.
                </p>
                <button
                  type="button"
                  onClick={handleCloseArticle}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] rounded-lg cursor-pointer min-h-[40px]"
                >
                  Back to Latest News
                </button>
              </main>
            )}
          </div>
        ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6">
          {/* Custom Top Banner Homepage Ad Slot */}
          {activeAds.length > 0 && (
            <HomepageAdSlot
              ads={activeAds}
              settings={adSettings}
              position="custom"
              customPosition="top_banner"
              onOpenAd={handleOpenAd}
              onViewAllAds={handleJumpToAds}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left/Main Timeline Feed (8 cols on desktop, full width on mobile) */}
            <div className="lg:col-span-8">
              {/* Section Heading & Timeframe Filter Row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-2 w-3 h-3 rounded-full border-2 border-amber-400 bg-white shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <h1 className="text-lg sm:text-xl font-extrabold text-[#0F274A] tracking-tight">
                      {activeCategory === 'All'
                        ? 'Koppa Latest Updates'
                        : `${activeCategory} Updates`}
                    </h1>
                    <div
                      className="h-1 w-20 bg-amber-400 rounded-full mt-1"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {/* Segmented Timeframe Control */}
                <div
                  role="group"
                  aria-label="Filter by timeframe"
                  className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-1 self-start sm:self-auto"
                >
                  {(['All', 'Today', 'Yesterday', 'This Week'] as TimeframeFilter[]).map(
                    (tf) => {
                      const active = timeframe === tf;
                      return (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setTimeframe(tf)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-[#0F274A] text-white'
                              : 'text-slate-600 hover:text-slate-950'
                          }`}
                        >
                          {active && <Calendar className="w-3.5 h-3.5" aria-hidden="true" />}
                          <span>{tf}</span>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {quotaStatus.quotaExceeded && (
                <div
                  role="status"
                  className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-950"
                >
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="font-kannada leading-relaxed">
                    Daily live database read limit temporarily reached. Showing saved news stories — live sync resumes automatically after quota reset.
                  </p>
                </div>
              )}

              {!articlesLoaded ? (
                <FeedLoadingSkeleton />
              ) : filteredArticles.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                  <h2 className="text-base font-bold text-slate-900 mb-1.5">
                    No matching updates found
                  </h2>
                  <p className="text-sm text-slate-600 mb-4">
                    Try clearing your search or switching back to all Koppa Taluk updates.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetHome}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] rounded-lg transition-colors cursor-pointer min-h-[40px]"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="relative pl-6 sm:pl-7">
                  {/* Continuous vertical timeline rail */}
                  <div
                    className="absolute left-[5px] top-0 bottom-4 w-px bg-slate-300"
                    aria-hidden="true"
                  />

                  <div className="space-y-6">
                    {/* Sliding Featured Lead Stories Carousel */}
                    <FeaturedLeadCarousel
                      leadArticles={leadArticles}
                      onOpenArticle={handleOpenArticle}
                    />

                    {/* Homepage Advertisement Section — Below Main Headline/Lead Section */}
                    {activeAds.length > 0 && (
                      <HomepageAdSlot
                        ads={activeAds}
                        settings={adSettings}
                        position="below_headline"
                        onOpenAd={handleOpenAd}
                        onViewAllAds={handleJumpToAds}
                      />
                    )}

                    {/* Date-Wise Sections: Today, Yesterday, and older dates */}
                    {dateGroups.map((group, groupIdx) => (
                      <div key={group.key} className="space-y-6">
                        <section
                          aria-label={`${group.heading} news`}
                          className="space-y-3"
                        >
                        <div className="relative flex items-center justify-between gap-3 pt-1">
                          <span
                            className="absolute -left-6 sm:-left-7 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#0F274A] border-2 border-amber-400 z-10"
                            aria-hidden="true"
                          />
                          <div className="flex items-baseline gap-2.5">
                            <h2 className="text-sm sm:text-base font-extrabold text-[#0F274A] tracking-tight">
                              {group.heading}
                            </h2>
                            {group.subLabel && (
                              <span className="text-xs font-medium text-slate-500">
                                {group.subLabel}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                            {group.articles.length}{' '}
                            {group.articles.length === 1 ? 'story' : 'stories'}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {group.articles.map((article, index) => {
                            const imgSrc = resolveArticleImage(article);
                            const isAccentNode = index % 2 === 1;
                            return (
                              <div key={article.id} className="relative">
                                <span
                                  className={`absolute -left-6 sm:-left-7 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 bg-white z-10 ${
                                    isAccentNode ? 'border-amber-400' : 'border-slate-400'
                                  }`}
                                  aria-hidden="true"
                                />

                                <article
                                  onClick={() => handleOpenArticle(article)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleOpenArticle(article);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className="group bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3 sm:p-4 shadow-2xs transition-colors flex items-center gap-3.5 sm:gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]"
                                >
                                  {/* Left Thumbnail */}
                                  <div className="w-28 h-24 sm:w-40 sm:h-28 shrink-0 rounded-lg overflow-hidden bg-slate-950 border border-slate-200">
                                    {imgSrc ? (
                                      <NewsImage
                                        src={imgSrc}
                                        alt={stripRichTextToPlainText(article.titleKannada)}
                                        fitMode="contain-blur"
                                        aspectClass="w-full h-full"
                                        watermarkApplied={Boolean(article.watermarkApplied && article.imageUrl)}
                                        className="h-full"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-[#0F274A] bg-slate-100 p-2 text-center">
                                        {getCategoryShortIcon(article.category)}
                                        <span className="text-[10px] font-semibold mt-1 text-slate-600">
                                          {article.category}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Center Content */}
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                                      <span className="text-[#0F274A]">{article.category}</span>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-kannada">{getKannadaLocationLabel(article.location)}</span>
                                      {isArticleActivelyFeatured(article, leadNowMs) && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="text-amber-700">Featured</span>
                                        </>
                                      )}
                                    </div>

                                    <h3
                                      className="article-rich-content article-rich-inline-compact font-kannada text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#0F274A] transition-colors leading-snug line-clamp-2"
                                      dangerouslySetInnerHTML={{
                                        __html: sanitizeRichTextHtml(article.titleKannada),
                                      }}
                                    />

                                    <div
                                      className="article-rich-content article-rich-inline-compact font-kannada text-xs text-slate-600 line-clamp-1"
                                      dangerouslySetInnerHTML={{
                                        __html: sanitizeRichTextHtml(article.summaryKannada),
                                      }}
                                    />

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                      <div className="flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                                        <span className="inline-flex items-center gap-1">
                                          <Clock className="w-3 h-3" aria-hidden="true" />
                                          <span>{article.publishedDate}</span>
                                        </span>
                                        <span aria-hidden="true">·</span>
                                        <span>{article.publishedTime}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>{article.readTimeMinutes} min read</span>
                                      </div>

                                      <ArticleShareBar article={article} compact variant="light" />
                                    </div>

                                    <WhatsAppGroupBanner variant="inline-news" />
                                  </div>

                                  {/* Right Chevron Affordance */}
                                  <div
                                    className="hidden sm:flex w-8 h-8 rounded-full bg-slate-100 text-slate-700 group-hover:bg-[#0F274A] group-hover:text-white transition-colors items-center justify-center shrink-0"
                                    aria-hidden="true"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </div>
                                </article>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      {/* Homepage Advertisement Section — Between News Sections (after first group) */}
                      {groupIdx === 0 && activeAds.length > 0 && (
                        <HomepageAdSlot
                          ads={activeAds}
                          settings={adSettings}
                          position="between_news"
                          onOpenAd={handleOpenAd}
                          onViewAllAds={handleJumpToAds}
                        />
                      )}
                    </div>
                    ))}
                  </div>

                  {hasMoreArticles && (
                    <div className="pt-5 flex justify-center">
                      <button
                        type="button"
                        onClick={handleLoadMoreArticles}
                        disabled={loadingMoreArticles}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#0F274A] bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-colors cursor-pointer disabled:opacity-60 min-h-[42px]"
                      >
                        {loadingMoreArticles ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Loading older stories...</span>
                          </>
                        ) : (
                          <span>Load More News</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Rail (4 cols on desktop, stacks below on mobile) */}
            <div id="koppa-right-rail" className="lg:col-span-4">
              <RightRail
                selectedLocation={selectedLocation}
                onSelectLocation={(loc) => {
                  setSelectedLocation(loc);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                activeAds={activeAds}
                adSettings={adSettings}
                onOpenAd={handleOpenAd}
                onViewAllAds={handleJumpToAds}
              />
            </div>
          </div>

          {/* Homepage Advertisement Section — Above Footer */}
          {activeAds.length > 0 && (
            <HomepageAdSlot
              ads={activeAds}
              settings={adSettings}
              position="above_footer"
              onOpenAd={handleOpenAd}
              onViewAllAds={handleJumpToAds}
            />
          )}
        </main>
      )}

      <footer className="border-t border-slate-200 bg-white mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-20 sm:py-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 font-masthead text-lg font-bold text-[#0F274A]">
                <CoffeeCupLogo className="w-7 h-7 shrink-0" />
                <span>Coffeenadu News</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Koppa Taluk, Chikkamagaluru District · English navigation, Kannada reporting
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
              {NEWS_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleSelectCategory(cat)}
                  className="hover:text-[#0F274A] transition-colors cursor-pointer whitespace-nowrap"
                >
                  {cat}
                </button>
              ))}
              <button
                type="button"
                onClick={handleJumpToAds}
                className="font-semibold text-amber-800 hover:underline cursor-pointer whitespace-nowrap"
              >
                Local Ads
              </button>
              <button
                type="button"
                onClick={handleJumpToBusTimings}
                className="font-semibold text-[#0F274A] hover:underline cursor-pointer whitespace-nowrap"
              >
                Bus Timings
              </button>
              <button
                type="button"
                onClick={handleJumpToEvents}
                className="font-semibold text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
              >
                Programs &amp; Events
              </button>
              <button
                type="button"
                onClick={handleJumpToChat}
                className="font-semibold text-[#0F274A] hover:underline cursor-pointer whitespace-nowrap"
              >
                Message Admin
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="text-center py-2">
              <p className="text-base sm:text-lg md:text-xl font-semibold tracking-tight text-[#0F274A]">
                Developed &amp; Managed by{' '}
                <span className="font-extrabold text-[#0F274A] border-b-2 border-amber-400 pb-0.5">
                  Dheeraj
                </span>
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-center sm:text-left text-[11px] sm:text-xs text-slate-500">
              <p className="font-medium text-slate-600">
                © 2026 CoffeeNadu News. All rights reserved.
              </p>
              <p className="leading-relaxed">
                Unauthorized copying, screenshotting, downloading, or redistribution of news content and photos is prohibited.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Optional Website Entry Advertisement Overlay */}
      <WebsiteEntryAd
        ads={activeAds}
        settings={adSettings}
        onOpenAd={handleOpenAd}
        disabled={
          adsActive ||
          Boolean(selectedAdId) ||
          Boolean(selectedAdPreviewToken) ||
          chatActive
        }
        onActiveChange={setEntryOverlayActive}
      />

      {/* Optional Main Homepage Popup Advertisement */}
      <HomepagePopupAd
        ads={activeAds}
        settings={adSettings}
        onOpenAd={handleOpenAd}
        entryOverlayActive={entryOverlayActive}
        disabled={
          isSpecialRoute ||
          Boolean(selectedArticleId) ||
          Boolean(selectedAdId) ||
          Boolean(selectedEventId)
        }
      />

      {/* Article Reading / Scroll Popup Advertisement */}
      <FloatingScrollAd
        ads={activeAds}
        settings={adSettings}
        onOpenAd={handleOpenAd}
        articleId={selectedArticle ? selectedArticle.id : null}
        disabled={adsActive || Boolean(selectedAdId) || chatActive || entryOverlayActive}
      />

      {/* Floating Message Admin Button at Bottom-Right Corner */}
      {!chatActive && (
        <button
          type="button"
          onClick={handleJumpToChat}
          aria-label="Message Coffeenadu Admin"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#0F274A] hover:bg-[#173a6e] border border-amber-400/50 rounded-xl shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer min-h-[44px]"
        >
          <MessageSquare className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
          <span className="font-kannada whitespace-nowrap">Message · ಸಂದೇಶ</span>
          {readerThread?.unreadByReader && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-extrabold bg-amber-400 text-[#0F274A] rounded">
              Reply
            </span>
          )}
        </button>
      )}
      </div>
    </PrivacyScreenGuard>
  );
}
