import type { NewsArticle } from '../types/news';
import type {
  HomepageSectionConfig,
  PlatformLanguage,
  PlatformListing,
  PlatformModuleId,
  PlatformQuiz,
  PlatformSearchResultItem,
  QuizLeaderboardEntry,
} from '../types/platform';
import { PLATFORM_MODULE_MAP } from '../constants/platformCatalog';
import { stripRichTextToPlainText } from './richText';

/**
 * Bilingual text picker (Kannada primary by default).
 */
export function pickLangText(kn: string, en: string, lang: PlatformLanguage): string {
  if (lang === 'en') {
    return (en || kn || '').trim();
  }
  return (kn || en || '').trim();
}

/**
 * Safe external URL validator: allows only http:// and https:// URLs.
 */
export function sanitizePlatformUrl(raw?: string | null): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Normalizes a phone number into digits suitable for tel: or wa.me links.
 */
export function normalizeIndianPhone(raw?: string | null): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  // Short statutory emergency numbers (e.g. 100, 101, 108, 112, 1912)
  if (digits.length >= 3 && digits.length <= 5) {
    return digits;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits.slice(0, 15);
}

export function buildWhatsappContactUrl(phone?: string | null, message?: string): string {
  const digits = normalizeIndianPhone(phone);
  if (!digits || digits.length < 10) return '';
  const textParam = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${textParam}`;
}

export function buildTelUrl(phone?: string | null): string {
  const digits = normalizeIndianPhone(phone);
  if (!digits) return '';
  if (digits.length <= 5) return `tel:${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `tel:+${digits}`;
  return `tel:${digits}`;
}

const LOCALITY_SYNONYMS: Record<string, string[]> = {
  koppa: ['koppa', 'ಕೊಪ್ಪ'],
  jayapura: ['jayapura', 'ಜಯಪುರ'],
  hariharapura: ['hariharapura', 'ಹರಿಹರಪುರ'],
  sringeri: ['sringeri', 'ಶೃಂಗೇರಿ'],
  balehonnur: ['balehonnur', 'ಬಾಳೆಹೊನ್ನೂರು'],
  'nr-pura': ['n.r. pura', 'nr pura', 'narasimharajapura', 'ಎನ್.ಆರ್. ಪುರ', 'ನರಸಿಂಹರಾಜಪುರ'],
  basarikatte: ['basarikatte', 'ಬಸರಿಕಟ್ಟೆ'],
  kudregundi: ['kudregundi', 'ಕುದುರೆಗುಂಡಿ'],
  narve: ['narve', 'ನಾರ್ವೆ'],
  megur: ['megur', 'ಮೆಗೂರು'],
  chikkamagaluru: ['chikkamagaluru', 'chikmagalur', 'ಚಿಕ್ಕಮಗಳೂರು'],
};

/**
 * Checks whether a text/location matches the selected Malnad locality (supports Kannada + English).
 */
export function matchesLocality(
  itemLocation: string | undefined,
  selectedLocation: string | undefined
): boolean {
  const selected = String(selectedLocation || '').trim().toLowerCase();
  if (!selected || selected === 'all' || selected === 'ಎಲ್ಲಾ') return true;

  const target = String(itemLocation || '').trim().toLowerCase();
  if (!target) return false;
  if (target.includes(selected) || selected.includes(target)) return true;

  for (const aliases of Object.values(LOCALITY_SYNONYMS)) {
    const selectedMatches = aliases.some((a) => selected.includes(a) || a.includes(selected));
    if (selectedMatches) {
      return aliases.some((a) => target.includes(a));
    }
  }
  return false;
}

export interface SearchEverythingInput {
  query: string;
  moduleFilter?: PlatformModuleId | 'all';
  locationFilter?: string;
  articles: NewsArticle[];
  listings: PlatformListing[];
  busRoutes?: Array<{ id: string; title: string; routeSummary: string; location?: string }>;
  events?: Array<{ id: string; title: string; location?: string; date?: string; description?: string }>;
  limit?: number;
}

/**
 * Unified Search Everything engine across News, all Platform Directory modules,
 * Bus Routes, and Programs & Events — bilingual Kannada & English scoring.
 */
export function searchPlatformEverything(
  input: SearchEverythingInput
): PlatformSearchResultItem[] {
  const rawQuery = String(input.query || '').trim().toLowerCase();
  const tokens = rawQuery
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const moduleFilter = input.moduleFilter || 'all';
  const locationFilter = input.locationFilter || 'all';
  const limit = input.limit ?? 60;

  const results: PlatformSearchResultItem[] = [];

  const scoreFields = (
    primary: string,
    secondary: string,
    body: string,
    featured?: boolean
  ): number => {
    if (tokens.length === 0) return featured ? 15 : 10;
    const p = primary.toLowerCase();
    const s = secondary.toLowerCase();
    const b = body.toLowerCase();
    let score = 0;
    let matchedTokens = 0;

    if (p.includes(rawQuery)) score += 60;
    else if (s.includes(rawQuery)) score += 35;
    else if (b.includes(rawQuery)) score += 20;

    for (const token of tokens) {
      if (p.includes(token)) {
        score += 25;
        matchedTokens += 1;
      } else if (s.includes(token)) {
        score += 14;
        matchedTokens += 1;
      } else if (b.includes(token)) {
        score += 8;
        matchedTokens += 1;
      }
    }

    if (matchedTokens === 0) return 0;
    if (matchedTokens === tokens.length) score += 15;
    if (featured) score += 5;
    return score;
  };

  // 1. News articles
  if (moduleFilter === 'all' || moduleFilter === 'news') {
    for (const article of input.articles) {
      if (!matchesLocality(article.location, locationFilter)) continue;
      const plainTitle = stripRichTextToPlainText(article.titleKannada || '');
      const plainSummary = stripRichTextToPlainText(article.summaryKannada || '');
      const sc = scoreFields(
        plainTitle,
        `${article.category || ''} ${article.location || ''} ${article.reporter || ''}`,
        `${plainSummary} ${article.tags || ''}`,
        Boolean(article.isFeatured)
      );
      if (sc > 0) {
        results.push({
          id: `news-${article.id}`,
          module: 'news',
          articleId: article.id,
          title: plainTitle,
          subtitle: article.category,
          summary: plainSummary,
          location: article.location,
          category: article.category,
          route: `/?article=${encodeURIComponent(article.id)}`,
          imageUrl: article.imageUrl,
          dateLabel: article.publishedDate,
          score: sc,
        });
      }
    }
  }

  // 2. Platform Listings (all approved directory modules)
  for (const listing of input.listings) {
    if (listing.status !== 'approved') continue;
    if (moduleFilter !== 'all' && listing.module !== moduleFilter) continue;
    if (!matchesLocality(listing.location, locationFilter)) continue;

    const modMeta = PLATFORM_MODULE_MAP[listing.module];
    const sc = scoreFields(
      `${listing.title} ${listing.titleEn || ''}`,
      `${listing.category} ${listing.location} ${listing.employer || ''} ${modMeta?.titleEn || ''} ${modMeta?.titleKn || ''}`,
      `${listing.summary} ${listing.description} ${(listing.tags || []).join(' ')}`,
      listing.featured
    );
    if (sc > 0) {
      results.push({
        id: `listing-${listing.id}`,
        module: listing.module,
        listingId: listing.id,
        title: listing.title,
        subtitle: listing.titleEn || modMeta?.titleEn,
        summary: listing.summary || listing.description.slice(0, 140),
        location: listing.location,
        category: listing.category,
        route: `${modMeta?.route || '/explore'}?item=${encodeURIComponent(listing.id)}`,
        imageUrl: listing.imageUrl,
        priceLabel: listing.priceLabel || (listing.price ? `₹${listing.price.toLocaleString('en-IN')}` : undefined),
        badgeText: listing.verified ? 'Verified' : undefined,
        score: sc,
      });
    }
  }

  // 3. Bus Routes
  if ((moduleFilter === 'all' || moduleFilter === 'transport') && input.busRoutes) {
    for (const bus of input.busRoutes) {
      if (bus.location && !matchesLocality(bus.location, locationFilter)) continue;
      const sc = scoreFields(bus.title, `bus transport ಬಸ್ ${bus.location || ''}`, bus.routeSummary);
      if (sc > 0) {
        results.push({
          id: `bus-${bus.id}`,
          module: 'transport',
          title: bus.title,
          subtitle: 'Bus Timings · ಬಸ್ ಸಮಯ',
          summary: bus.routeSummary,
          location: bus.location || 'Koppa',
          route: '/bus-timings',
          score: sc,
        });
      }
    }
  }

  // 4. Programs & Events
  if ((moduleFilter === 'all' || moduleFilter === 'events') && input.events) {
    for (const ev of input.events) {
      if (ev.location && !matchesLocality(ev.location, locationFilter)) continue;
      const sc = scoreFields(ev.title, `event festival ಕಾರ್ಯಕ್ರಮ ${ev.location || ''}`, ev.description || '');
      if (sc > 0) {
        results.push({
          id: `event-${ev.id}`,
          module: 'events',
          title: ev.title,
          subtitle: ev.date || 'Upcoming Event',
          summary: ev.description || '',
          location: ev.location || 'Koppa',
          route: `/events?event=${encodeURIComponent(ev.id)}`,
          dateLabel: ev.date,
          score: sc,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export interface ContextualRecommendationBundle {
  businesses: PlatformListing[];
  jobs: PlatformListing[];
  marketplace: PlatformListing[];
  services: PlatformListing[];
  schemesAndHealth: PlatformListing[];
}

/**
 * Recommends relevant local ecosystem items for an article page, prioritizing
 * listings that match the article's location (e.g. Koppa, Jayapura, Sringeri)
 * and featured/verified status.
 */
export function getContextualPlatformRecommendations(
  articleLocation: string | undefined,
  articleCategory: string | undefined,
  listings: PlatformListing[]
): ContextualRecommendationBundle {
  const approved = listings.filter((l) => l.status === 'approved');

  const rankForArticle = (items: PlatformListing[], maxCount: number): PlatformListing[] => {
    const catLower = String(articleCategory || '').toLowerCase();
    return [...items]
      .sort((a, b) => {
        const aLoc = matchesLocality(a.location, articleLocation) ? 10 : 0;
        const bLoc = matchesLocality(b.location, articleLocation) ? 10 : 0;
        const aCat = catLower && (a.category.toLowerCase().includes(catLower) || a.title.toLowerCase().includes(catLower)) ? 4 : 0;
        const bCat = catLower && (b.category.toLowerCase().includes(catLower) || b.title.toLowerCase().includes(catLower)) ? 4 : 0;
        const aFeat = (a.featured ? 3 : 0) + (a.verified ? 2 : 0);
        const bFeat = (b.featured ? 3 : 0) + (b.verified ? 2 : 0);
        const scoreDiff = bLoc + bCat + bFeat - (aLoc + aCat + aFeat);
        if (scoreDiff !== 0) return scoreDiff;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, maxCount);
  };

  return {
    businesses: rankForArticle(
      approved.filter((l) => l.module === 'businesses'),
      4
    ),
    jobs: rankForArticle(
      approved.filter((l) => l.module === 'jobs'),
      3
    ),
    marketplace: rankForArticle(
      approved.filter((l) => l.module === 'marketplace'),
      4
    ),
    services: rankForArticle(
      approved.filter((l) => l.module === 'services'),
      3
    ),
    schemesAndHealth: rankForArticle(
      approved.filter(
        (l) =>
          l.module === 'health' ||
          l.module === 'schemes' ||
          l.module === 'tourism' ||
          l.module === 'agriculture'
      ),
      4
    ),
  };
}

/**
 * Pure quiz scoring utility.
 */
export function scoreQuizAttempt(
  quiz: PlatformQuiz,
  selectedAnswers: number[]
): { score: number; total: number; percentage: number } {
  const total = quiz.questions.length;
  if (total === 0) return { score: 0, total: 0, percentage: 0 };
  let score = 0;
  for (let i = 0; i < total; i += 1) {
    if (selectedAnswers[i] === quiz.questions[i].correctIndex) {
      score += 1;
    }
  }
  const percentage = Math.round((score / total) * 100);
  return { score, total, percentage };
}

/**
 * Sorts leaderboard entries by highest score, then fastest completion time.
 */
export function sortLeaderboard(entries: QuizLeaderboardEntry[]): QuizLeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    const ratioA = a.total > 0 ? a.score / a.total : 0;
    const ratioB = b.total > 0 ? b.score / b.total : 0;
    if (ratioB !== ratioA) return ratioB - ratioA;
    if (b.score !== a.score) return b.score - a.score;
    return a.durationSec - b.durationSec;
  });
}

/**
 * Orders and filters enabled homepage sections cleanly.
 */
export function getOrderedEnabledHomepageSections(
  sections: HomepageSectionConfig[]
): HomepageSectionConfig[] {
  return [...sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
}
