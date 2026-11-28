import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Check,
  ExternalLink,
  Flag,
  Link2,
  MapPin,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { DEFAULT_FEED_CATEGORIES } from '../../constants/platformCatalog';
import type { NewsArticle, ProgramEvent } from '../../types/news';
import type {
  FeedCategoryConfig,
  FeedCategoryId,
  PlatformLanguage,
  PlatformListing,
} from '../../types/platform';
import type { PublicCommunityPost } from '../../types/community';
import { buildKannadaArticleShareText } from '../../utils/newsHelpers';
import type { UnifiedFeedItem } from '../../utils/unifiedFeedHelpers';
import { CoffeeCupLogo } from '../CoffeeCupLogo';

interface UnifiedCommunityFeedProps {
  items: UnifiedFeedItem[];
  totalUnfilteredCount: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  language: PlatformLanguage;
  activeCategoryId: FeedCategoryId;
  feedCategories?: FeedCategoryConfig[];
  selectedLocation: string;
  searchQuery: string;
  sort: 'latest' | 'popular';
  onSortChange: (sort: 'latest' | 'popular') => void;
  showViewCounts?: boolean;
  onResetFilters: () => void;
  onAddInfoClick: () => void;
  onOpenArticle: (article: NewsArticle) => void;
  onOpenCommunityPost: (post: PublicCommunityPost) => void;
  onOpenPlatformListing: (listing: PlatformListing) => void;
  onOpenEvent: (ev: ProgramEvent) => void;
  onReportItem: (item: UnifiedFeedItem) => void;
  isItemSaved: (item: UnifiedFeedItem) => boolean;
  onToggleSaveItem: (item: UnifiedFeedItem) => void;
  onShareTracked?: (item: UnifiedFeedItem) => void;
  /** Optional clearly-labelled admin ad slot rendered cleanly between feed items */
  renderInlineAd?: (slotIndex: number) => React.ReactNode;
}

const PAGE_SIZE = 12;

function getAuthorInitials(name: string): string {
  const clean = (name || '').trim();
  if (!clean) return 'C';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function buildAbsoluteShareUrl(canonicalPath: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.coffeenadu.in';
  if (canonicalPath.startsWith('http://') || canonicalPath.startsWith('https://')) {
    return canonicalPath;
  }
  return `${origin}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`;
}

export const UnifiedCommunityFeed: React.FC<UnifiedCommunityFeedProps> = ({
  items,
  totalUnfilteredCount,
  loading,
  error,
  onRetry,
  language,
  activeCategoryId,
  feedCategories,
  selectedLocation,
  searchQuery,
  sort,
  onSortChange,
  showViewCounts = false,
  onResetFilters,
  onAddInfoClick,
  onOpenArticle,
  onOpenCommunityPost,
  onOpenPlatformListing,
  onOpenEvent,
  onReportItem,
  isItemSaved,
  onToggleSaveItem,
  onShareTracked,
  renderInlineAd,
}) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Reset pagination smoothly when filter/sort changes
  const filterSignature = `${activeCategoryId}|${selectedLocation}|${searchQuery}|${sort}`;
  const [lastSig, setLastSig] = useState(filterSignature);
  if (filterSignature !== lastSig) {
    setLastSig(filterSignature);
    setVisibleCount(PAGE_SIZE);
  }

  const activeCategoryMeta = useMemo(() => {
    const list =
      feedCategories && feedCategories.length > 0 ? feedCategories : DEFAULT_FEED_CATEGORIES;
    return list.find((c) => c.id === activeCategoryId) || list[0];
  }, [feedCategories, activeCategoryId]);

  const hasActiveFilter =
    activeCategoryId !== 'all' ||
    (selectedLocation !== '' && selectedLocation !== 'All') ||
    searchQuery.trim() !== '';

  // Deduplicated slice for pagination
  const visibleItems = useMemo(() => {
    const seen = new Set<string>();
    const out: UnifiedFeedItem[] = [];
    for (const item of items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      out.push(item);
      if (out.length >= visibleCount) break;
    }
    return out;
  }, [items, visibleCount]);

  const remainingCount = Math.max(0, items.length - visibleItems.length);

  const handleOpenItem = (item: UnifiedFeedItem) => {
    if (item.source === 'news' && item.newsArticle) {
      onOpenArticle(item.newsArticle);
    } else if (item.source === 'community' && item.communityPost) {
      onOpenCommunityPost(item.communityPost);
    } else if (item.source === 'platform' && item.platformListing) {
      onOpenPlatformListing(item.platformListing);
    } else if (item.source === 'event' && item.programEvent) {
      onOpenEvent(item.programEvent);
    }
  };

  const handleCopyLink = async (item: UnifiedFeedItem) => {
    const url = buildAbsoluteShareUrl(item.canonicalPath);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedKey(item.key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === item.key ? null : prev));
    }, 2000);
  };

  const handleShareWhatsApp = (item: UnifiedFeedItem) => {
    const url = buildAbsoluteShareUrl(item.canonicalPath);
    let text: string;
    if (item.source === 'news' && item.newsArticle) {
      // STRICT PRESERVATION: Bold headline + NO description + promo footer for ALL news articles!
      text = buildKannadaArticleShareText(item.newsArticle, url, item.location);
    } else {
      const priceLine = item.priceLabel ? `\n💰 ${item.priceLabel}` : '';
      text = `*${item.title}*\n📍 ${item.location} · ${item.categoryLabelKn}${priceLine}\n${url}\n\nCOFFEENADU COMMUNITY | ಕಾಫಿನಾಡು ಸಮುದಾಯ`;
    }

    onShareTracked?.(item);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async (item: UnifiedFeedItem) => {
    const url = buildAbsoluteShareUrl(item.canonicalPath);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: item.title,
          text: item.source === 'news' ? item.title : `${item.title} — ${item.location}`,
          url,
        });
        onShareTracked?.(item);
        return;
      } catch {
        // User cancelled or unsupported; fallback to WhatsApp
      }
    }
    handleShareWhatsApp(item);
  };

  return (
    <section
      aria-label="Coffeenadu Community Feed"
      data-testid="unified-community-feed"
      className="space-y-4"
    >
      {/* Main Feed Masthead Bar */}
      <div className="rounded-2xl border border-[#E7DFCE] dark:border-[#2E2922] bg-white dark:bg-[#1A1815] px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[#1C1917] dark:text-[#FBF9F5] flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>COFFEENADU COMMUNITY</span>
            <span className="text-[#C5932B] dark:text-[#E2B44B] font-normal" aria-hidden="true">
              |
            </span>
            <span className="font-kannada text-[#926710] dark:text-[#E6BC5C]">
              ಕಾಫಿನಾಡು ಸಮುದಾಯ
            </span>
          </h1>
          <p className="text-xs text-[#6B6052] dark:text-[#A89C8B] mt-0.5">
            {hasActiveFilter ? (
              <span>
                {language === 'kn' ? activeCategoryMeta?.labelKn : activeCategoryMeta?.labelEn}
                {selectedLocation !== 'All' ? ` · ${selectedLocation}` : ''}
                {searchQuery.trim() ? ` · “${searchQuery.trim()}”` : ''} ·{' '}
                <strong className="text-[#1C1917] dark:text-[#FBF9F5] tabular-nums">
                  {items.length}
                </strong>{' '}
                {language === 'kn' ? 'ಪೋಸ್ಟ್‌ಗಳು' : 'posts'}
              </span>
            ) : (
              <span>
                {language === 'kn'
                  ? `ಮಲೆನಾಡಿನ ಸುದ್ದಿ, ಅಂಗಡಿಗಳು, ಖರೀದಿ–ಮಾರಾಟ, ಉದ್ಯೋಗ, ಕೃಷಿ ಮತ್ತು ಸಮುದಾಯ ಮಾಹಿತಿ (${totalUnfilteredCount})`
                  : `Unified Malnad feed: Local news, shops, buy & sell, jobs, farming & community updates (${totalUnfilteredCount})`}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Show Most Viewed sort ONLY if Admin explicitly enabled showViewCounts */}
          {showViewCounts && (
            <div
              role="group"
              aria-label="Sort feed"
              className="inline-flex rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] bg-[#F6F2E9] dark:bg-[#14120F] p-0.5 text-xs font-bold"
            >
              <button
                type="button"
                onClick={() => onSortChange('latest')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer min-h-[36px] ${
                  sort === 'latest'
                    ? 'bg-white dark:bg-[#26211B] text-[#1C1917] dark:text-[#FBF9F5] shadow-2xs'
                    : 'text-[#6B6052] dark:text-[#A89C8B] hover:text-[#1C1917] dark:hover:text-white'
                }`}
              >
                {language === 'kn' ? 'ಇತ್ತೀಚಿನ' : 'Latest'}
              </button>
              <button
                type="button"
                onClick={() => onSortChange('popular')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer min-h-[36px] ${
                  sort === 'popular'
                    ? 'bg-white dark:bg-[#26211B] text-[#1C1917] dark:text-[#FBF9F5] shadow-2xs'
                    : 'text-[#6B6052] dark:text-[#A89C8B] hover:text-[#1C1917] dark:hover:text-white'
                }`}
              >
                {language === 'kn' ? 'ಜನಪ್ರಿಯ' : 'Popular'}
              </button>
            </div>
          )}

          {hasActiveFilter && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DFC996] dark:border-[#4A3B22] bg-[#FAF7F0] dark:bg-[#221E18] text-xs font-bold text-[#1C1917] dark:text-[#FBF9F5] hover:bg-[#F3EBD8] dark:hover:bg-[#2D261C] cursor-pointer min-h-[40px]"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#926710] dark:text-[#E6BC5C]" />
              <span>{language === 'kn' ? 'ಎಲ್ಲಾ ತೋರಿಸಿ' : 'Show All'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onAddInfoClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#C5932B] to-[#DEB04B] hover:from-[#B3831E] hover:to-[#D4A238] text-[#171411] text-xs font-extrabold transition-all cursor-pointer min-h-[40px] font-kannada shadow-2xs"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>{language === 'kn' ? 'ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ' : 'Add Info'}</span>
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-sm font-semibold text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer min-h-[40px]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{language === 'kn' ? 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' : 'Retry'}</span>
            </button>
          )}
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {loading && items.length === 0 && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading community feed">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="rounded-2xl border border-[#E7DFCE] dark:border-[#2E2922] bg-white dark:bg-[#1A1815] p-5 space-y-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#EFE9DC] dark:bg-[#26221C]" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-36 rounded bg-[#EFE9DC] dark:bg-[#26221C]" />
                  <div className="h-3 w-52 rounded bg-[#EFE9DC] dark:bg-[#26221C]" />
                </div>
              </div>
              <div className="h-5 w-4/5 rounded bg-[#EFE9DC] dark:bg-[#26221C]" />
              <div className="h-3.5 w-full rounded bg-[#EFE9DC] dark:bg-[#26221C]" />
              <div className="h-56 w-full rounded-xl bg-[#EFE9DC] dark:bg-[#26221C]" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-[#E7DFCE] dark:border-[#2E2922] bg-white dark:bg-[#1A1815] p-8 sm:p-10 text-center space-y-4">
          <h2 className="font-kannada text-lg font-extrabold text-[#1C1917] dark:text-[#FBF9F5]">
            {language === 'kn'
              ? 'ಈ ವಿಭಾಗದಲ್ಲಿ ಸದ್ಯ ಯಾವುದೇ ಪೋಸ್ಟ್ ಲಭ್ಯವಿಲ್ಲ'
              : 'No posts match this filter yet'}
          </h2>
          <p className="font-kannada text-sm text-[#6B6052] dark:text-[#A89C8B] max-w-md mx-auto">
            {language === 'kn'
              ? 'ಎಲ್ಲಾ ಮಾಹಿತಿಯನ್ನು ನೋಡಲು ಫಿಲ್ಟರ್ ತೆರವುಗೊಳಿಸಿ ಅಥವಾ ನಿಮ್ಮ ಊರಿನ ಮಾಹಿತಿಯನ್ನು ಮೊದಲ ಬಾರಿಗೆ ಸೇರಿಸಿ.'
              : 'Reset filters to view the full Malnad feed, or be the first to share local information in this category.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1C1917] hover:bg-[#2E2922] dark:bg-[#2A241B] dark:hover:bg-[#383024] text-[#FBF9F5] border border-[#3A3122] text-xs sm:text-sm font-bold cursor-pointer min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4 text-[#E6BC5C]" />
                <span>{language === 'kn' ? 'ಎಲ್ಲಾ ಪೋಸ್ಟ್ ನೋಡಿ' : 'Reset Filters'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onAddInfoClick}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#C5932B] to-[#DEB04B] hover:from-[#B3831E] hover:to-[#D4A238] text-[#171411] text-xs sm:text-sm font-extrabold cursor-pointer min-h-[44px] font-kannada"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{language === 'kn' ? 'ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ' : 'Add Your Information'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Unified Social Feed Cards — Uncropped Full Images, Clear Editorial vs Community Distinction, Zero Visible View Counts */}
      {visibleItems.length > 0 && (
        <div className="space-y-5">
          {visibleItems.map((item, idx) => {
            const saved = isItemSaved(item);
            const copied = copiedKey === item.key;
            const validImages = item.images.filter((src) => !brokenImages[`${item.key}:${src}`]);
            const categoryLabel =
              language === 'kn' ? item.categoryLabelKn : item.categoryLabelEn;
            const isEditorialNews = item.source === 'news';

            return (
              <React.Fragment key={item.key}>
                <article
                  data-testid="community-feed-card"
                  data-source={item.source}
                  className={`rounded-2xl border bg-white dark:bg-[#1A1815] shadow-2xs transition-colors overflow-hidden ${
                    isEditorialNews
                      ? 'border-[#E2D6BE] dark:border-[#3A3122] hover:border-[#C5932B]/70 dark:hover:border-[#E2B44B]/60'
                      : 'border-[#E7DFCE] dark:border-[#2E2922] hover:border-[#C5932B]/60 dark:hover:border-[#E2B44B]/50'
                  }`}
                >
                  {/* Threads-Style Post Layout: Avatar + Thread Line + Author/Content/Optional Media */}
                  <div className="px-4 pt-4 pb-4 sm:px-5 sm:pt-5 flex items-stretch gap-3">
                    {/* Left Thread Column */}
                    <div className="flex flex-col items-center shrink-0">
                      {item.isOfficialBrand ? (
                        <CoffeeCupLogo className="w-10 h-10 shrink-0" />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="w-10 h-10 rounded-full bg-[#1C1917] dark:bg-[#2C251B] text-[#E6BC5C] font-bold text-xs flex items-center justify-center shrink-0 ring-1 ring-[#DFC996] dark:ring-[#5A4728]"
                        >
                          {getAuthorInitials(item.authorName)}
                        </div>
                      )}
                      <div
                        aria-hidden="true"
                        className="mt-2 w-[2px] flex-1 rounded-full bg-[#EAE2D0] dark:bg-[#2E2922]"
                      />
                    </div>

                    {/* Right Thread Content Column */}
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-[#1C1917] dark:text-[#FBF9F5] truncate">
                              {item.authorName}
                            </span>
                            {item.verified && (
                              <ShieldCheck
                                className="w-4 h-4 text-[#B88623] dark:text-[#E6BC5C] shrink-0"
                                aria-label="Verified editorial desk"
                              />
                            )}
                            <span className="text-[11px] font-bold text-[#926710] dark:text-[#E6BC5C]">
                              ·{' '}
                              {item.isContestEntry
                                ? language === 'kn'
                                  ? 'ಸ್ಪರ್ಧಾ ಸುದ್ದಿ · Contest Entry'
                                  : 'Contest Entry'
                                : isEditorialNews
                                  ? language === 'kn'
                                    ? 'ಸುದ್ದಿ'
                                    : 'Editorial'
                                  : language === 'kn'
                                    ? 'ಸಮುದಾಯ'
                                    : 'Community'}
                            </span>
                          </div>

                          <p className="text-xs text-[#6B6052] dark:text-[#A89C8B] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="font-bold text-[#926710] dark:text-[#E2B44B] font-kannada">
                              {categoryLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 font-kannada">
                              <MapPin
                                className="w-3 h-3 shrink-0 text-[#8B7D6B] dark:text-[#A89C8B]"
                                aria-hidden="true"
                              />
                              {item.location}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums text-[#7C7060] dark:text-[#988C7B]">
                              {item.publishedDateLabel}
                            </span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onToggleSaveItem(item)}
                          aria-label={saved ? 'Remove bookmark' : 'Save post'}
                          title={saved ? 'Saved' : 'Save post'}
                          className={`p-2 rounded-xl border transition-colors cursor-pointer min-h-[40px] min-w-[40px] inline-flex items-center justify-center shrink-0 ${
                            saved
                              ? 'bg-[#FBF4E3] dark:bg-[#D4A238]/15 border-[#DFC996] dark:border-[#D4A238]/40 text-[#926710] dark:text-[#E6BC5C]'
                              : 'bg-transparent border-transparent hover:bg-[#F5F0E4] dark:hover:bg-[#26221B] text-[#6B6052] dark:text-[#A89C8B]'
                          }`}
                        >
                          {saved ? (
                            <BookmarkCheck className="w-4 h-4" />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Threads Text Body (omitted completely for pure image-only posts — zero empty placeholders) */}
                      {(item.title.trim() || item.description.trim() || item.priceLabel) && (
                        <div className="space-y-1.5">
                          {item.title.trim() && (
                            <h2 className="font-kannada text-base sm:text-lg font-extrabold text-[#1C1917] dark:text-[#FBF9F5] leading-snug">
                              <button
                                type="button"
                                onClick={() => handleOpenItem(item)}
                                className="text-left hover:text-[#926710] dark:hover:text-[#E6BC5C] transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
                              >
                                {item.title}
                              </button>
                            </h2>
                          )}

                          {item.description.trim() && (
                            <p
                              className={`font-kannada text-sm text-[#3F3830] dark:text-[#D9D0C1] leading-relaxed whitespace-pre-line ${
                                validImages.length === 0 ? 'line-clamp-6' : 'line-clamp-3'
                              }`}
                            >
                              {item.description}
                            </p>
                          )}

                          {item.priceLabel && (
                            <div className="pt-0.5 text-xs sm:text-sm">
                              <span className="font-extrabold text-[#926710] dark:text-[#E6BC5C] tabular-nums">
                                {language === 'kn' ? 'ಬೆಲೆ:' : 'Price:'} {item.priceLabel}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Card Media: ONLY rendered when user uploaded a real, valid image */}
                      {validImages.length > 0 && (
                        <div className="pt-1">
                          {validImages.length === 1 ? (
                            <button
                              type="button"
                              onClick={() => handleOpenItem(item)}
                              className="block w-full overflow-hidden rounded-xl border border-[#EAE2D1] dark:border-[#2E2922] bg-[#F5F1E8] dark:bg-[#14120F] cursor-pointer"
                            >
                              <img
                                src={validImages[0]}
                                alt={item.title.trim() || `${item.authorName} — ${categoryLabel}`}
                                loading="lazy"
                                decoding="async"
                                data-testid="feed-card-image"
                                onError={() =>
                                  setBrokenImages((prev) => ({
                                    ...prev,
                                    [`${item.key}:${validImages[0]}`]: true,
                                  }))
                                }
                                className="w-full h-auto max-h-[640px] object-contain mx-auto block"
                              />
                            </button>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {validImages.slice(0, 3).map((imgSrc, imgIdx) => (
                                <button
                                  key={imgSrc}
                                  type="button"
                                  onClick={() => handleOpenItem(item)}
                                  className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#EAE2D1] dark:border-[#2E2922] bg-[#F5F1E8] dark:bg-[#14120F] flex items-center justify-center cursor-pointer"
                                >
                                  <img
                                    src={imgSrc}
                                    alt={`${item.title.trim() || item.authorName} (${imgIdx + 1})`}
                                    loading="lazy"
                                    decoding="async"
                                    data-testid="feed-card-image"
                                    onError={() =>
                                      setBrokenImages((prev) => ({
                                        ...prev,
                                        [`${item.key}:${imgSrc}`]: true,
                                      }))
                                    }
                                    className="w-full h-full object-contain"
                                  />
                                  {imgIdx === 2 && validImages.length > 3 && (
                                    <span className="absolute inset-0 bg-[#1C1917]/75 text-[#E6BC5C] font-extrabold text-sm flex items-center justify-center">
                                      +{validImages.length - 3}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action Bar (NO view counts shown unless admin explicitly turns showViewCounts ON) */}
                  <div className="px-3.5 sm:px-5 py-2.5 border-t border-[#EFE8D8] dark:border-[#2A251E] bg-[#FAF7F0]/80 dark:bg-[#151310]/90 flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenItem(item)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1C1917] hover:bg-[#2F2A24] dark:bg-gradient-to-r dark:from-[#C5932B] dark:to-[#DEB04B] dark:hover:from-[#B3831E] dark:hover:to-[#D4A238] text-[#FBF9F5] dark:text-[#171411] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#E6BC5C] dark:text-[#171411]" />
                        <span className={language === 'kn' ? 'font-kannada' : ''}>
                          {item.source === 'news'
                            ? language === 'kn'
                              ? 'ಸಂಪೂರ್ಣ ಸುದ್ದಿ'
                              : 'Read Article'
                            : language === 'kn'
                              ? 'ವಿವರ ನೋಡಿ'
                              : 'Open Post'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareWhatsApp(item)}
                        aria-label={`Share ${item.title.trim() || item.authorName} on WhatsApp`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DFC996] dark:border-[#4A3B22] bg-[#FBF4E3] dark:bg-[#262015] text-[#8A6110] dark:text-[#E6BC5C] hover:bg-[#F5E8C8] dark:hover:bg-[#32291A] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopyLink(item)}
                        aria-label={`Copy permanent link for ${item.title.trim() || item.authorName}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] bg-white dark:bg-[#201D18] text-[#1C1917] dark:text-[#F0E9DC] hover:bg-[#F5F0E4] dark:hover:bg-[#2B261E] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#926710] dark:text-[#E6BC5C]" />
                            <span>{language === 'kn' ? 'ಕಾಪಿ ಆಯಿತು' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            <span>{language === 'kn' ? 'ಲಿಂಕ್' : 'Copy Link'}</span>
                          </>
                        )}
                      </button>

                      {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                        <button
                          type="button"
                          onClick={() => void handleNativeShare(item)}
                          aria-label="Share"
                          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[#6B6052] dark:text-[#A89C8B] hover:bg-[#F3EDE0] dark:hover:bg-[#26221B] text-xs font-semibold cursor-pointer min-h-[40px]"
                        >
                          <span>{language === 'kn' ? 'ಹಂಚಿ' : 'Share'}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {showViewCounts && item.viewCount > 0 && (
                        <span className="text-[11px] font-semibold text-[#6B6052] dark:text-[#A89C8B] tabular-nums">
                          {item.viewCount.toLocaleString('en-IN')}{' '}
                          {language === 'kn' ? 'ವೀಕ್ಷಣೆ' : 'views'}
                        </span>
                      )}

                      {(item.source === 'news' ||
                        item.source === 'community' ||
                        item.source === 'platform') && (
                        <button
                          type="button"
                          onClick={() => onReportItem(item)}
                          aria-label={`Report ${item.title}`}
                          data-testid={`feed-report-btn-${item.id}`}
                          title={language === 'kn' ? 'ದೂರು ಸಲ್ಲಿಸಿ' : 'Report post'}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[#6B6052] dark:text-[#A89C8B] hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors cursor-pointer min-h-[40px]"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            {language === 'kn' ? 'ದೂರು' : 'Report'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>

                {/* Clearly Labelled Admin Advertisement Slot interleaved cleanly */}
                {renderInlineAd && (idx === 3 || idx === 9) && renderInlineAd(idx === 3 ? 0 : 1)}
              </React.Fragment>
            );
          })}

          {/* Reliable Load More Pagination */}
          {remainingCount > 0 && (
            <div className="pt-2 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-[#1A1815] border border-[#DFC996] dark:border-[#4A3B22] hover:border-[#C5932B] dark:hover:border-[#E2B44B] text-sm font-extrabold text-[#1C1917] dark:text-[#FBF9F5] shadow-2xs transition-colors cursor-pointer min-h-[46px]"
              >
                <span className={language === 'kn' ? 'font-kannada' : ''}>
                  {language === 'kn'
                    ? `ಇನ್ನಷ್ಟು ಪೋಸ್ಟ್‌ಗಳನ್ನು ನೋಡಿ (${remainingCount} ಬಾಕಿ)`
                    : `Load More Posts (${remainingCount} more)`}
                </span>
              </button>
              <p className="text-[11px] text-[#6B6052] dark:text-[#A89C8B] tabular-nums">
                {language === 'kn'
                  ? `${items.length} ರಲ್ಲಿ ${visibleItems.length} ತೋರಿಸಲಾಗುತ್ತಿದೆ`
                  : `Showing ${visibleItems.length} of ${items.length}`}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
