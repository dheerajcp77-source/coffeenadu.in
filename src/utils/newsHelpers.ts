import type { FilterCategory, NewsArticle } from '../types/news';
import { isArticleActivelyFeatured } from './featuredLead';
import { stripRichTextToPlainText } from './richText';

export type TimeframeFilter = 'All' | 'Today' | 'Yesterday' | 'This Week';

export interface AdvancedSearchFilters {
  query: string;
  category: FilterCategory;
  location: string;
  timeframe: TimeframeFilter;
}

export function parseArticleDateToMidnight(dateStr: string, timestamp?: number): number | null {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
    const dt = new Date(timestamp);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  }
  const parsed = new Date((dateStr || '').trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

export function matchesTimeframe(
  article: NewsArticle,
  timeframe: TimeframeFilter,
  nowMs = Date.now()
): boolean {
  if (timeframe === 'All') return true;
  const articleMidnight = parseArticleDateToMidnight(
    article.publishedDate,
    article.publishedTimestamp
  );
  if (articleMidnight === null) return false;

  const now = new Date(nowMs);
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((todayMidnight - articleMidnight) / (24 * 60 * 60 * 1000));

  if (timeframe === 'Today') return diffDays === 0;
  if (timeframe === 'Yesterday') return diffDays === 1;
  return diffDays >= 0 && diffDays <= 6;
}

function normalizePlaceToken(value: string): string {
  return (value || '').trim().toLowerCase();
}

export function locationsMatch(a: string, b: string): boolean {
  if (!b || b === 'All') return true;
  const na = normalizePlaceToken(a);
  const nb = normalizePlaceToken(b);
  if (!na) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Selects real breaking / top-priority articles for the Breaking News Strip.
 * Uses actively featured articles first, falling back to latest published stories
 * without ever fabricating headlines.
 */
export function getBreakingNewsArticles(
  articles: NewsArticle[],
  nowMs = Date.now(),
  maxCount = 8
): NewsArticle[] {
  if (!articles.length) return [];
  const featured = articles.filter((a) => isArticleActivelyFeatured(a, nowMs));
  if (featured.length > 0) {
    return featured.slice(0, maxCount);
  }
  return [...articles]
    .sort((a, b) => (b.publishedTimestamp ?? 0) - (a.publishedTimestamp ?? 0))
    .slice(0, Math.min(maxCount, 5));
}

export interface TrendingResult {
  items: NewsArticle[];
  isViewRanked: boolean;
}

/**
 * Computes Trending News purely from real viewCount data.
 * If no article has recorded views yet (> 0), clearly flags `isViewRanked: false`
 * so the UI labels it accurately as "Latest Popular Picks" without inventing counts.
 */
export function getTrendingArticles(articles: NewsArticle[], maxCount = 5): TrendingResult {
  if (!articles.length) return { items: [], isViewRanked: false };
  const withViews = articles.filter((a) => (a.viewCount ?? 0) > 0);
  if (withViews.length > 0) {
    const sorted = [...articles]
      .sort((a, b) => {
        const viewDiff = (b.viewCount ?? 0) - (a.viewCount ?? 0);
        if (viewDiff !== 0) return viewDiff;
        return (b.publishedTimestamp ?? 0) - (a.publishedTimestamp ?? 0);
      })
      .slice(0, maxCount);
    return { items: sorted, isViewRanked: true };
  }

  const latestFallback = [...articles]
    .sort((a, b) => (b.publishedTimestamp ?? 0) - (a.publishedTimestamp ?? 0))
    .slice(0, maxCount);
  return { items: latestFallback, isViewRanked: false };
}

/**
 * Smart article recommendation ranking using category, location, reading history affinities,
 * and recency — without fabricating external scores.
 */
export function getSmartRecommendations(
  current: NewsArticle,
  allArticles: NewsArticle[],
  historyArticles: Pick<NewsArticle, 'category' | 'location'>[] = [],
  maxCount = 4
): NewsArticle[] {
  const categoryBoost = new Map<string, number>();
  const locationBoost = new Map<string, number>();
  for (const h of historyArticles) {
    categoryBoost.set(h.category, (categoryBoost.get(h.category) || 0) + 1);
    const loc = normalizePlaceToken(h.location);
    if (loc) locationBoost.set(loc, (locationBoost.get(loc) || 0) + 1);
  }

  return allArticles
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      let score = 0;
      if (candidate.category === current.category) score += 50;
      if (locationsMatch(candidate.location, current.location)) score += 35;
      score += Math.min(20, (categoryBoost.get(candidate.category) || 0) * 4);
      score += Math.min(15, (locationBoost.get(normalizePlaceToken(candidate.location)) || 0) * 3);
      if ((candidate.viewCount ?? 0) > 0) {
        score += Math.min(15, Math.log10((candidate.viewCount ?? 0) + 1) * 5);
      }
      const ts = candidate.publishedTimestamp ?? 0;
      return { candidate, score, ts };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.ts - a.ts;
    })
    .slice(0, maxCount)
    .map((entry) => entry.candidate);
}

export function getSameLocationArticles(
  current: NewsArticle,
  allArticles: NewsArticle[],
  maxCount = 4
): NewsArticle[] {
  return allArticles
    .filter((a) => a.id !== current.id && locationsMatch(a.location, current.location))
    .slice(0, maxCount);
}

export function getAdjacentArticles(
  current: NewsArticle,
  orderedArticles: NewsArticle[]
): { previous: NewsArticle | null; next: NewsArticle | null } {
  const idx = orderedArticles.findIndex((a) => a.id === current.id);
  if (idx === -1) return { previous: null, next: null };
  return {
    previous: idx > 0 ? orderedArticles[idx - 1] : null,
    next: idx < orderedArticles.length - 1 ? orderedArticles[idx + 1] : null,
  };
}

export function searchArticlesAdvanced(
  articles: NewsArticle[],
  filters: AdvancedSearchFilters,
  nowMs = Date.now(),
  locationMatcher: (articleLoc: string, selectedLoc: string) => boolean = locationsMatch
): NewsArticle[] {
  const q = filters.query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  return articles.filter((article) => {
    if (filters.category !== 'All' && article.category !== filters.category) {
      return false;
    }
    if (!locationMatcher(article.location, filters.location)) {
      return false;
    }
    if (!matchesTimeframe(article, filters.timeframe, nowMs)) {
      return false;
    }
    if (terms.length > 0) {
      const haystack = [
        stripRichTextToPlainText(article.titleKannada),
        stripRichTextToPlainText(article.summaryKannada),
        article.category,
        article.location,
        article.reporter,
        article.tags || '',
        ...article.bodyKannada.map((part) => stripRichTextToPlainText(part)),
      ]
        .join(' ')
        .toLowerCase();

      return terms.every((term) => haystack.includes(term));
    }
    return true;
  });
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/**
 * Splits plain text into safe segments so matching search terms can be highlighted
 * using React `<mark>` nodes without raw HTML injection.
 */
export function splitTextForHighlight(text: string, query: string): TextSegment[] {
  const cleanText = text || '';
  const cleanQuery = (query || '').trim();
  if (!cleanQuery || !cleanText) {
    return [{ text: cleanText, match: false }];
  }

  const terms = Array.from(
    new Set(
      cleanQuery
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  ).slice(0, 6);

  if (terms.length === 0) {
    return [{ text: cleanText, match: false }];
  }

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = cleanText.split(regex);
  if (parts.length <= 1) {
    return [{ text: cleanText, match: false }];
  }

  const lowerTerms = new Set(terms.map((t) => t.toLowerCase()));
  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      match: lowerTerms.has(part.toLowerCase()),
    }));
}

export const SHARE_PROMO_FOOTER = [
  '📰 *ಕೊಪ್ಪದ ಎಲ್ಲಾ ಸ್ಥಳೀಯ ಸುದ್ದಿಗಳಿಗಾಗಿ!*',
  '',
  'ಪ್ರತಿದಿನದ ಸುದ್ದಿ, ಬಸ್ ಸಮಯ, ಕಾರ್ಯಕ್ರಮಗಳು ಮತ್ತು ಪ್ರಮುಖ ಮಾಹಿತಿಗಾಗಿ ನಮ್ಮ ವೆಬ್‌ಸೈಟ್ www.coffeenadu.in ಗೆ ಭೇಟಿ ನೀಡಿ.',
  '',
  '📲 *ಈ ಸುದ್ದಿಯನ್ನು ನಿಮ್ಮ ಸ್ನೇಹಿತರು, ಕುಟುಂಬದವರು ಹಾಗೂ ಇತರ WhatsApp ಗ್ರೂಪ್‌ಗಳಲ್ಲಿ ಶೇರ್ ಮಾಡಿ.*',
].join('\n');

export function truncateShareSummary(summary: string, maxLength = 220): string {
  const clean = (summary || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength - 1).trim();
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.trim()}…`;
}

export function buildKannadaArticleShareText(
  article: Pick<NewsArticle, 'id' | 'titleKannada' | 'summaryKannada' | 'location'>,
  articleUrl: string,
  locationLabel?: string
): string {
  const plainTitle = stripRichTextToPlainText(article.titleKannada)
    .replace(/^\*+|\*+$/g, '')
    .trim();
  const place = (locationLabel || article.location || 'ಕೊಪ್ಪ').trim();

  const lines: string[] = [
    `*${plainTitle}*`,
    '',
    `📍 ${place} · Coffeenadu News`,
    articleUrl,
    '',
    SHARE_PROMO_FOOTER,
  ];
  return lines.join('\n');
}

