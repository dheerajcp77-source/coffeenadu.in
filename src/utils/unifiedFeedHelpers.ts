import { COMMUNITY_CATEGORY_MAP } from '../constants/communityCategories.ts';
import { DEFAULT_FEED_CATEGORIES, PLATFORM_MODULE_MAP } from '../constants/platformCatalog.ts';
import type { CommunityCategoryId, PublicCommunityPost } from '../types/community.ts';
import type { NewsArticle, NewsCategory, ProgramEvent } from '../types/news.ts';
import type {
  DirectoryModuleId,
  FeedCategoryConfig,
  FeedCategoryId,
  HomepageAnnouncementConfig,
  PlatformListing,
} from '../types/platform.ts';
import { matchesLocality } from './platformHelpers.ts';
import { stripRichTextToPlainText } from './richText.ts';

export type UnifiedFeedSource = 'news' | 'community' | 'platform' | 'event';

export interface UnifiedFeedItem {
  key: string; // `${source}:${id}` for guaranteed deduplication
  id: string;
  source: UnifiedFeedSource;
  title: string;
  description: string;
  categoryLabelKn: string;
  categoryLabelEn: string;
  feedCategories: FeedCategoryId[]; // Supports multi-tagging (e.g., ['news', 'agriculture'])
  location: string;
  authorName: string;
  isOfficialBrand: boolean; // True for Coffeenadu editorial/verified notices -> displays Coffeenadu logo
  publishedTimestamp: number;
  publishedDateLabel: string;
  images: string[];
  priceLabel?: string;
  /** Strictly optional user-provided public contact; NEVER private registered mobile numbers. */
  publicContact?: string;
  canonicalPath: string;
  viewCount: number;
  verified?: boolean;
  newsArticle?: NewsArticle;
  communityPost?: PublicCommunityPost;
  platformListing?: PlatformListing;
  programEvent?: ProgramEvent;
}

export interface UnifiedFeedFilterOptions {
  categoryId: FeedCategoryId;
  location: string;
  searchQuery: string;
  sort: 'latest' | 'popular';
}

const NEWS_CATEGORY_TO_FEED: Record<NewsCategory, { kn: string; en: string; tags: FeedCategoryId[] }> = {
  Local: { kn: 'ಸ್ಥಳೀಯ ಸುದ್ದಿ', en: 'Local News', tags: ['news', 'local'] },
  Malnad: { kn: 'ಮಲೆನಾಡು ಸುದ್ದಿ', en: 'Malnad News', tags: ['news', 'malnad'] },
  Agriculture: { kn: 'ಕೃಷಿ ಸುದ್ದಿ', en: 'Agriculture News', tags: ['news', 'agriculture'] },
  Health: { kn: 'ಆರೋಗ್ಯ ಸುದ್ದಿ', en: 'Health News', tags: ['news', 'health'] },
  Entertainment: { kn: 'ಮನರಂಜನೆ', en: 'Entertainment', tags: ['news', 'entertainment'] },
  Crime: { kn: 'ಅಪರಾಧ ಸುದ್ದಿ', en: 'Crime News', tags: ['news', 'crime'] },
  General: { kn: 'ಸಾಮಾನ್ಯ ಸುದ್ದಿ', en: 'General News', tags: ['news', 'general'] },
  Politics: { kn: 'ರಾಜಕೀಯ ಸುದ್ದಿ', en: 'Politics', tags: ['news', 'politics'] },
  Sports: { kn: 'ಕ್ರೀಡೆ', en: 'Sports', tags: ['news', 'sports'] },
  Special: { kn: 'ವಿಶೇಷ ವರದಿ', en: 'Special Report', tags: ['news', 'special', 'malnad'] },
  State: { kn: 'ರಾಜ್ಯ ಸುದ್ದಿ', en: 'State News', tags: ['news', 'state'] },
  Nation: { kn: 'ರಾಷ್ಟ್ರೀಯ ಸುದ್ದಿ', en: 'National News', tags: ['news', 'nation'] },
  'Civic & Roads': { kn: 'ನಾಗರಿಕ ಮತ್ತು ರಸ್ತೆ', en: 'Civic & Roads', tags: ['news', 'civic-roads', 'local'] },
  Education: { kn: 'ಶಿಕ್ಷಣ ಸುದ್ದಿ', en: 'Education News', tags: ['news', 'education'] },
  Culture: { kn: 'ಸಂಸ್ಕೃತಿ', en: 'Culture', tags: ['news', 'culture', 'malnad'] },
};

const COMMUNITY_CATEGORY_TO_FEED: Record<CommunityCategoryId, FeedCategoryId[]> = {
  'my-shop': ['community', 'businesses'],
  'for-sale': ['community', 'marketplace'],
  'lost-item': ['community', 'lost-found'],
  'found-item': ['community', 'lost-found'],
  'my-service': ['community', 'services'],
  jobs: ['community', 'jobs'],
  events: ['community', 'events'],
  'house-land': ['community', 'property'],
  'agri-products': ['community', 'agriculture', 'marketplace'],
  'vehicle-sale': ['community', 'vehicles', 'marketplace'],
  'training-tuition': ['community', 'education'],
  'public-info': ['community', 'public-info'],
  'other-info': ['community', 'general'],
};

const PLATFORM_MODULE_TO_FEED: Record<DirectoryModuleId, FeedCategoryId[]> = {
  businesses: ['businesses', 'local'],
  jobs: ['jobs'],
  marketplace: ['marketplace'],
  agriculture: ['agriculture'],
  education: ['education'],
  health: ['health'],
  schemes: ['schemes', 'public-info'],
  tourism: ['tourism', 'malnad'],
  property: ['property'],
  community: ['community', 'public-info'],
  'lost-found': ['lost-found', 'community'],
  grievances: ['civic-roads', 'public-info', 'local'],
  services: ['services', 'local'],
  offers: ['offers', 'marketplace', 'businesses'],
  contacts: ['contacts', 'public-info', 'services'],
  documents: ['schemes', 'public-info'],
};

function parseTimestampSafe(value?: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function formatReadableDateTime(ts: number, fallbackDate?: string, fallbackTime?: string): string {
  if (ts > 0) {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ts));
    } catch {
      // fall through
    }
  }
  return [fallbackDate, fallbackTime].filter(Boolean).join(' · ') || 'Recent';
}

function isSafeImageSrc(src?: string): boolean {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:image/')
  );
}

/**
 * Builds the unified Coffeenadu Community feed from all real published content sources:
 * News Articles, Community Submissions, Approved Malnad Directory Listings, and Events.
 * Strictly deduplicates items and NEVER copies private registration phone numbers.
 */
export function buildUnifiedCommunityFeed(input: {
  articles?: NewsArticle[];
  communityPosts?: PublicCommunityPost[];
  platformListings?: PlatformListing[];
  events?: ProgramEvent[];
}): UnifiedFeedItem[] {
  const seenKeys = new Set<string>();
  const items: UnifiedFeedItem[] = [];

  // 1. News articles
  for (const article of input.articles || []) {
    const key = `news:${article.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const catInfo = NEWS_CATEGORY_TO_FEED[article.category] || {
      kn: article.category || 'ಸುದ್ದಿ',
      en: article.category || 'News',
      tags: ['news', 'general'] as FeedCategoryId[],
    };

    const images: string[] = [];
    if (isSafeImageSrc(article.imageUrl)) images.push(article.imageUrl as string);
    if (Array.isArray(article.extraImages)) {
      for (const extra of article.extraImages) {
        if (isSafeImageSrc(extra?.imageUrl) && !images.includes(extra.imageUrl)) {
          images.push(extra.imageUrl);
        }
      }
    }

    const ts =
      article.publishedTimestamp && article.publishedTimestamp > 0
        ? article.publishedTimestamp
        : parseTimestampSafe(article.publishedDate);

    const plainTitle = stripRichTextToPlainText(article.titleKannada);
    const plainSummary = stripRichTextToPlainText(article.summaryKannada || article.bodyKannada?.[0] || '');

    items.push({
      key,
      id: article.id,
      source: 'news',
      title: plainTitle,
      description: plainSummary,
      categoryLabelKn: catInfo.kn,
      categoryLabelEn: catInfo.en,
      feedCategories: catInfo.tags,
      location: article.location || 'ಕೊಪ್ಪ (Koppa)',
      authorName: article.reporter?.trim() || 'Coffeenadu News Desk',
      isOfficialBrand: true,
      publishedTimestamp: ts,
      publishedDateLabel: [article.publishedDate, article.publishedTime].filter(Boolean).join(' · ') || formatReadableDateTime(ts),
      images,
      canonicalPath: `/?article=${encodeURIComponent(article.id)}`,
      viewCount: Number(article.viewCount || 0),
      verified: true,
      newsArticle: article,
    });
  }

  // 2. Public Community submissions (already privacy-sanitized on server, double-guarded here)
  for (const post of input.communityPosts || []) {
    const key = `community:${post.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const meta = COMMUNITY_CATEGORY_MAP[post.category];
    const tags = COMMUNITY_CATEGORY_TO_FEED[post.category] || ['community', 'general'];
    const ts = parseTimestampSafe(post.createdAt);
    const images = Array.isArray(post.photos) ? post.photos.filter((p) => isSafeImageSrc(p)) : [];

    items.push({
      key,
      id: post.id,
      source: 'community',
      title: post.title,
      description: post.description,
      categoryLabelKn: meta?.labelKn || 'ಸಮುದಾಯ ಮಾಹಿತಿ',
      categoryLabelEn: meta?.labelEn || 'Community Info',
      feedCategories: tags,
      location: post.location || 'ಕೊಪ್ಪ',
      authorName: post.authorName || 'ಸಮುದಾಯ ಸದಸ್ಯರು',
      isOfficialBrand: false,
      publishedTimestamp: ts,
      publishedDateLabel: formatReadableDateTime(ts),
      images,
      priceLabel: post.price?.trim() || undefined,
      // Do not display phone numbers directly in the community feed cards
      publicContact: undefined,
      canonicalPath: `/community/${encodeURIComponent(post.slug)}`,
      viewCount: Number(post.viewsCount || 0),
      communityPost: post,
    });
  }

  // 3. Approved Malnad Platform listings (shops, jobs, marketplace, agriculture, services, tourism, etc.)
  for (const listing of input.platformListings || []) {
    if (listing.status !== 'approved') continue;
    const key = `platform:${listing.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const modMeta = PLATFORM_MODULE_MAP[listing.module];
    const baseTags = PLATFORM_MODULE_TO_FEED[listing.module] || ['general'];
    const tags: FeedCategoryId[] = [...baseTags];
    // Tag vehicle marketplace listings under vehicles too
    const catLower = `${listing.category} ${listing.title} ${listing.titleEn || ''}`.toLowerCase();
    if (
      listing.module === 'marketplace' &&
      (catLower.includes('vehicle') ||
        catLower.includes('bike') ||
        catLower.includes('scooter') ||
        catLower.includes('jeep') ||
        catLower.includes('car') ||
        catLower.includes('ವಾಹನ'))
    ) {
      if (!tags.includes('vehicles')) tags.push('vehicles');
    }

    const images: string[] = [];
    if (isSafeImageSrc(listing.imageUrl)) images.push(listing.imageUrl as string);
    if (Array.isArray(listing.gallery)) {
      for (const img of listing.gallery) {
        if (isSafeImageSrc(img) && !images.includes(img)) images.push(img);
      }
    }

    const ts = parseTimestampSafe(listing.createdAt || listing.updatedAt);
    const priceLabel =
      listing.priceLabel?.trim() ||
      (typeof listing.price === 'number' && listing.price > 0
        ? `₹${listing.price.toLocaleString('en-IN')}`
        : undefined);

    const authorName =
      listing.employer?.trim() ||
      listing.sourceAttribution?.trim() ||
      listing.submittedByName?.trim() ||
      'Coffeenadu Malnad Directory';

    items.push({
      key,
      id: listing.id,
      source: 'platform',
      title: listing.title,
      description: listing.summary || listing.description,
      categoryLabelKn: modMeta?.titleKn || listing.category,
      categoryLabelEn: modMeta?.titleEn || listing.category,
      feedCategories: tags,
      location: listing.location || 'Koppa',
      authorName,
      isOfficialBrand: Boolean(listing.verified || !listing.submittedByName),
      publishedTimestamp: ts,
      publishedDateLabel: listing.lastUpdatedLabel || formatReadableDateTime(ts),
      images,
      priceLabel,
      // Do not display phone numbers directly in the unified community feed cards
      publicContact: undefined,
      canonicalPath: `${modMeta?.route || `/${listing.module}`}?item=${encodeURIComponent(listing.id)}`,
      viewCount: Number(listing.views || 0),
      verified: Boolean(listing.verified),
      platformListing: listing,
    });
  }

  // 4. Published Program Events
  for (const ev of input.events || []) {
    const key = `event:${ev.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const ts =
      ev.createdTimestamp && ev.createdTimestamp > 0
        ? ev.createdTimestamp
        : parseTimestampSafe(ev.eventDate);
    const images = isSafeImageSrc(ev.imageUrl) ? [ev.imageUrl as string] : [];

    items.push({
      key,
      id: ev.id,
      source: 'event',
      title: ev.titleKannada,
      description: ev.descriptionKannada,
      categoryLabelKn: 'ಕಾರ್ಯಕ್ರಮ',
      categoryLabelEn: 'Event',
      feedCategories: ['events', 'local', 'community'],
      location: ev.location || 'ಕೊಪ್ಪ',
      authorName: ev.organizer?.trim() || 'Coffeenadu Events',
      isOfficialBrand: true,
      publishedTimestamp: ts,
      publishedDateLabel: [ev.eventDate, ev.eventTime].filter(Boolean).join(' · ') || formatReadableDateTime(ts),
      images,
      canonicalPath: `/events?event=${encodeURIComponent(ev.id)}`,
      viewCount: Number(ev.viewCount || 0),
      verified: true,
      programEvent: ev,
    });
  }

  // Order by latest publication timestamp descending
  items.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);
  return items;
}

export function filterUnifiedCommunityFeed(
  items: UnifiedFeedItem[],
  options: UnifiedFeedFilterOptions
): UnifiedFeedItem[] {
  const query = (options.searchQuery || '').trim().toLowerCase();
  const terms = query ? query.split(/\s+/).filter(Boolean) : [];
  const location = (options.location || 'All').trim();

  const filtered = items.filter((item) => {
    if (options.categoryId && options.categoryId !== 'all') {
      if (!item.feedCategories.includes(options.categoryId)) {
        return false;
      }
    }

    if (location && location.toLowerCase() !== 'all') {
      if (!matchesLocality(item.location, location)) {
        return false;
      }
    }

    if (terms.length > 0) {
      const hay = [
        item.title,
        item.description,
        item.categoryLabelKn,
        item.categoryLabelEn,
        item.location,
        item.authorName,
        item.priceLabel || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!terms.every((t) => hay.includes(t))) {
        return false;
      }
    }

    return true;
  });

  if (options.sort === 'popular') {
    return [...filtered].sort((a, b) => {
      if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
      return b.publishedTimestamp - a.publishedTimestamp;
    });
  }

  return [...filtered].sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);
}

/**
 * Checks if the admin-controlled announcement banner should currently be displayed,
 * honoring enabled toggle and optional YYYY-MM-DD start/end schedule dates.
 */
export function isAnnouncementScheduledActive(
  config: HomepageAnnouncementConfig | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!config || !config.enabled) return false;
  const hasContent = Boolean(
    config.headingKn?.trim() || config.headingEn?.trim() || config.descriptionKn?.trim() || config.descriptionEn?.trim()
  );
  if (!hasContent) return false;

  const todayYmd = new Date(nowMs).toISOString().slice(0, 10);
  if (config.startDate && /^\d{4}-\d{2}-\d{2}$/.test(config.startDate.trim())) {
    if (todayYmd < config.startDate.trim()) return false;
  }
  if (config.endDate && /^\d{4}-\d{2}-\d{2}$/.test(config.endDate.trim())) {
    if (todayYmd > config.endDate.trim()) return false;
  }
  return true;
}

/**
 * Returns enabled feed categories ordered by admin configuration,
 * always ensuring 'all' stays present and first so visitors can reset the feed.
 */
export function getOrderedEnabledFeedCategories(
  categories?: FeedCategoryConfig[] | null
): FeedCategoryConfig[] {
  const source =
    Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_FEED_CATEGORIES;

  const enabled = source
    .filter((c) => c.enabled || c.id === 'all')
    .sort((a, b) => {
      if (a.id === 'all') return -1;
      if (b.id === 'all') return 1;
      return a.order - b.order;
    });

  if (!enabled.some((c) => c.id === 'all')) {
    const defaultAll = DEFAULT_FEED_CATEGORIES.find((c) => c.id === 'all');
    if (defaultAll) enabled.unshift(defaultAll);
  }

  return enabled;
}
