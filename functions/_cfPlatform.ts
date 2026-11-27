/**
 * Standalone Cloudflare Pages handler for /api/platform/* and /api/admin2/platform/*
 * Keeps coffeenadu.in Cloudflare deployment 100% functional even without BACKEND_ORIGIN.
 */

import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FEED_CATEGORIES,
  DEFAULT_HOMEPAGE_ANNOUNCEMENT,
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_MALNAD_LOCALITIES,
  DEFAULT_WEATHER_CONFIG,
  KANNADA_WORD_PUZZLES,
  PLATFORM_MODULES,
  STARTER_PLATFORM_QUIZZES,
  STARTER_VERIFIED_PUBLIC_LISTINGS,
} from '../src/constants/platformCatalog';
import type {
  DirectoryModuleId,
  FeedCategoryConfig,
  FeedCategoryId,
  HomepageAnnouncementConfig,
  HomepageSectionConfig,
  ListingStatus,
  LocalityOption,
  PlatformDisplaySettings,
  PlatformListing,
  PlatformQuiz,
  PlatformReport,
  QuizLeaderboardEntry,
  WeatherConfig,
  WeatherRainfallRecord,
} from '../src/types/platform';
import {
  matchesLocality,
  sanitizePlatformUrl,
  scoreQuizAttempt,
  sortLeaderboard,
} from '../src/utils/platformHelpers';

interface CfPlatformState {
  localities: LocalityOption[];
  homepageSections: HomepageSectionConfig[];
  homepageAnnouncement: HomepageAnnouncementConfig;
  feedCategories: FeedCategoryConfig[];
  displaySettings: PlatformDisplaySettings;
  listings: PlatformListing[];
  reports: PlatformReport[];
  quizzes: PlatformQuiz[];
  leaderboard: QuizLeaderboardEntry[];
  weatherConfig: WeatherConfig;
  weatherLogs: WeatherRainfallRecord[];
  searchTerms: Record<string, number>;
  sectionVisits: Record<string, number>;
  locationActivity: Record<string, number>;
  pageViews: number;
  whatsappShares: number;
  enquiries: number;
  mobileEvents: number;
  desktopEvents: number;
  uniqueSessions: string[];
}

const VALID_DIRECTORY_MODULES = new Set<string>(
  PLATFORM_MODULES.filter((m) => m.isDirectoryModule).map((m) => m.id)
);

const CF_PLATFORM_CACHE_KEY = 'https://coffeenadu.internal/cf-platform-state-v1';

let cfState: CfPlatformState | null = null;

const VALID_CF_FEED_IDS = new Set<FeedCategoryId>(DEFAULT_FEED_CATEGORIES.map((c) => c.id));

function mergeCfFeedCategories(raw?: FeedCategoryConfig[]): FeedCategoryConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_FEED_CATEGORIES.map((c) => ({ ...c }));
  }
  const seen = new Set<FeedCategoryId>();
  const defaultMap = new Map(DEFAULT_FEED_CATEGORIES.map((c) => [c.id, c]));
  const merged: FeedCategoryConfig[] = [];
  for (const item of raw) {
    if (!item || !VALID_CF_FEED_IDS.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const fb = defaultMap.get(item.id)!;
    merged.push({
      id: item.id,
      labelKn: item.labelKn || fb.labelKn,
      labelEn: item.labelEn || fb.labelEn,
      icon: item.icon || fb.icon,
      enabled: item.id === 'all' ? true : item.enabled !== false,
      order: item.id === 'all' ? 1 : Number.isFinite(Number(item.order)) ? Number(item.order) : merged.length + 1,
    });
  }
  for (const fb of DEFAULT_FEED_CATEGORIES) {
    if (!seen.has(fb.id)) merged.push({ ...fb, order: merged.length + 1 });
  }
  merged.sort((a, b) => (a.id === 'all' ? -1 : b.id === 'all' ? 1 : a.order - b.order));
  return merged.map((c, idx) => ({ ...c, order: idx + 1 }));
}

function createInitialCfState(): CfPlatformState {
  return {
    localities: DEFAULT_MALNAD_LOCALITIES.map((l) => ({ ...l })),
    homepageSections: DEFAULT_HOMEPAGE_SECTIONS.map((s) => ({ ...s })),
    homepageAnnouncement: {
      ...DEFAULT_HOMEPAGE_ANNOUNCEMENT,
      buttons: DEFAULT_HOMEPAGE_ANNOUNCEMENT.buttons.map((b) => ({ ...b })),
    },
    feedCategories: DEFAULT_FEED_CATEGORIES.map((c) => ({ ...c })),
    displaySettings: { ...DEFAULT_DISPLAY_SETTINGS },
    listings: STARTER_VERIFIED_PUBLIC_LISTINGS.map((l) => ({ ...l })),
    reports: [],
    quizzes: STARTER_PLATFORM_QUIZZES.map((q) => ({ ...q })),
    leaderboard: [],
    weatherConfig: { ...DEFAULT_WEATHER_CONFIG },
    weatherLogs: [],
    searchTerms: {},
    sectionVisits: {},
    locationActivity: {},
    pageViews: 0,
    whatsappShares: 0,
    enquiries: 0,
    mobileEvents: 0,
    desktopEvents: 0,
    uniqueSessions: [],
  };
}

async function ensureCfState(): Promise<CfPlatformState> {
  if (cfState) return cfState;
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      const hit = await cache.match(CF_PLATFORM_CACHE_KEY);
      if (hit) {
        const parsed = (await hit.json()) as Partial<CfPlatformState>;
        const init = createInitialCfState();
        cfState = {
          ...init,
          ...parsed,
          feedCategories: mergeCfFeedCategories(parsed.feedCategories),
          displaySettings: parsed.displaySettings
            ? { ...init.displaySettings, ...parsed.displaySettings, showViewCounts: Boolean(parsed.displaySettings.showViewCounts) }
            : init.displaySettings,
        };
        return cfState;
      }
    }
  } catch {
    // ignore edge cache read errors
  }
  cfState = createInitialCfState();
  return cfState;
}

async function persistCfState(state: CfPlatformState): Promise<void> {
  cfState = state;
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      await cache.put(
        CF_PLATFORM_CACHE_KEY,
        new Response(JSON.stringify(state), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      );
    }
  } catch {
    // ignore edge cache write errors
  }
}

function cleanText(raw: unknown, maxLen = 400): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function jsonResp(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function computeModuleCounts(state: CfPlatformState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const mod of PLATFORM_MODULES) counts[mod.id] = 0;
  for (const item of state.listings) {
    if (item.status === 'approved') {
      counts[item.module] = (counts[item.module] || 0) + 1;
    }
  }
  counts.games = state.quizzes.filter((q) => q.active).length;
  counts.weather = state.weatherLogs.length;
  return counts;
}

function makeCfId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildListingFromBody(
  body: Record<string, unknown>,
  status: ListingStatus
): PlatformListing | null {
  const module = cleanText(body.module, 40) as DirectoryModuleId;
  const title = cleanText(body.title, 180);
  const description = cleanText(body.description || body.summary, 4000);
  if (!VALID_DIRECTORY_MODULES.has(module) || title.length < 3 || !description) return null;
  const nowIso = new Date().toISOString();
  const priceNum =
    body.price !== undefined && body.price !== null && String(body.price).trim() !== ''
      ? Number(body.price)
      : null;

  return {
    id: makeCfId(module.slice(0, 4)),
    module,
    title,
    titleEn: cleanText(body.titleEn, 180) || undefined,
    category: cleanText(body.category, 80) || 'general',
    subcategory: cleanText(body.subcategory, 80) || undefined,
    summary: cleanText(body.summary || description, 300),
    description,
    location: cleanText(body.location, 80) || 'Koppa',
    address: cleanText(body.address, 240) || undefined,
    mapUrl: sanitizePlatformUrl(typeof body.mapUrl === 'string' ? body.mapUrl : '') || undefined,
    phone: cleanText(body.phone, 24) || undefined,
    whatsapp: cleanText(body.whatsapp, 24) || undefined,
    email: cleanText(body.email, 120) || undefined,
    website: sanitizePlatformUrl(typeof body.website === 'string' ? body.website : '') || undefined,
    imageUrl: sanitizePlatformUrl(typeof body.imageUrl === 'string' ? body.imageUrl : '') || undefined,
    price: Number.isFinite(priceNum) ? priceNum : null,
    priceLabel: cleanText(body.priceLabel, 60) || undefined,
    negotiable: Boolean(body.negotiable),
    employer: cleanText(body.employer, 140) || undefined,
    qualification: cleanText(body.qualification, 160) || undefined,
    salary: cleanText(body.salary, 80) || undefined,
    applicationDeadline: cleanText(body.applicationDeadline, 40) || undefined,
    applyUrl: sanitizePlatformUrl(typeof body.applyUrl === 'string' ? body.applyUrl : '') || undefined,
    openingHours: cleanText(body.openingHours, 80) || undefined,
    weeklyHoliday: cleanText(body.weeklyHoliday, 60) || undefined,
    emergency24x7: Boolean(body.emergency24x7),
    verified: Boolean(body.verified) && status === 'approved',
    featured: Boolean(body.featured) && status === 'approved',
    status,
    sourceAttribution: cleanText(body.sourceAttribution, 140) || undefined,
    lastUpdatedLabel: cleanText(body.lastUpdatedLabel, 80) || undefined,
    documentUrl: sanitizePlatformUrl(typeof body.documentUrl === 'string' ? body.documentUrl : '') || undefined,
    discountText: cleanText(body.discountText, 80) || undefined,
    validUntil: cleanText(body.validUntil, 40) || undefined,
    grievanceStatus: module === 'grievances' ? 'open' : undefined,
    lostOrFound: (['lost', 'found'].includes(String(body.lostOrFound || ''))
      ? String(body.lostOrFound)
      : '') as PlatformListing['lostOrFound'],
    propertyType: (['rent', 'sale', 'lease', 'estate', 'land', 'room'].includes(String(body.propertyType || ''))
      ? String(body.propertyType)
      : '') as PlatformListing['propertyType'],
    areaSize: cleanText(body.areaSize, 80) || undefined,
    submittedByUid: cleanText(body.submittedByUid, 128) || undefined,
    submittedByName: cleanText(body.submittedByName, 120) || undefined,
    submittedByContact: cleanText(body.submittedByContact, 60) || undefined,
    views: 0,
    callClicks: 0,
    whatsappClicks: 0,
    applyClicks: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function handleCfPublicPlatformRoute(
  request: Request,
  url: URL
): Promise<Response | null> {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/platform/')) return null;

  const state = await ensureCfState();
  const method = request.method.toUpperCase();

  if (pathname === '/api/platform/bootstrap' && method === 'GET') {
    const approved = state.listings.filter((l) => l.status === 'approved');
    const popularSearches = Object.entries(state.searchTerms)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return jsonResp({
      ok: true,
      localities: state.localities.filter((l) => l.active),
      homepageSections: [...state.homepageSections].sort((a, b) => a.order - b.order),
      homepageAnnouncement: state.homepageAnnouncement,
      feedCategories: [...state.feedCategories].sort((a, b) => a.order - b.order),
      displaySettings: state.displaySettings,
      moduleCounts: computeModuleCounts(state),
      featuredListings: approved.slice(0, 80),
      popularSearches,
      weatherConfig: state.weatherConfig,
      latestWeatherLogs: state.weatherLogs.slice(0, 12),
      activeQuizCount: state.quizzes.filter((q) => q.active).length,
    });
  }

  if (pathname === '/api/platform/listings' && method === 'GET') {
    const module = cleanText(url.searchParams.get('module'), 40);
    const category = cleanText(url.searchParams.get('category'), 80).toLowerCase();
    const location = cleanText(url.searchParams.get('location'), 80);
    const q = cleanText(url.searchParams.get('q'), 120).toLowerCase();
    let items = state.listings.filter((l) => l.status === 'approved');
    if (module && module !== 'all') items = items.filter((l) => l.module === module);
    if (category && category !== 'all') items = items.filter((l) => l.category.toLowerCase() === category);
    if (location && location.toLowerCase() !== 'all') {
      items = items.filter((l) => matchesLocality(l.location, location));
    }
    if (q) {
      items = items.filter((l) =>
        `${l.title} ${l.titleEn || ''} ${l.summary} ${l.description} ${l.location}`
          .toLowerCase()
          .includes(q)
      );
    }
    return jsonResp({ ok: true, total: items.length, listings: items.slice(0, 120) });
  }

  const enquiryMatch = pathname.match(/^\/api\/platform\/listings\/([^/]+)\/enquiry$/);
  if (enquiryMatch && method === 'POST') {
    const id = decodeURIComponent(enquiryMatch[1]);
    const body = await readBody(request);
    const item = state.listings.find((l) => l.id === id);
    if (item) {
      if (body.type === 'call') item.callClicks += 1;
      else if (body.type === 'whatsapp') item.whatsappClicks += 1;
      else if (body.type === 'apply') item.applyClicks += 1;
      state.enquiries += 1;
      await persistCfState(state);
    }
    return jsonResp({ ok: true });
  }

  if (pathname === '/api/platform/submissions' && method === 'POST') {
    const body = await readBody(request);
    if (body.website_hp && String(body.website_hp).trim() !== '') {
      return jsonResp({ ok: true, queued: true });
    }
    const listing = buildListingFromBody(body, 'pending');
    if (!listing) {
      return jsonResp({ ok: false, error: 'Please complete title, module, and description.' }, 400);
    }
    state.listings.unshift(listing);
    await persistCfState(state);
    return jsonResp(
      {
        ok: true,
        listing,
        message: 'Submitted successfully. Your listing is pending admin verification.',
      },
      201
    );
  }

  if (pathname === '/api/platform/my-submissions' && method === 'GET') {
    const uid = cleanText(url.searchParams.get('uid'), 128);
    const mine = uid ? state.listings.filter((l) => l.submittedByUid === uid) : [];
    return jsonResp({ ok: true, listings: mine });
  }

  if (pathname === '/api/platform/reports' && method === 'POST') {
    const body = await readBody(request);
    const listingId = cleanText(body.listingId, 120);
    const listing = state.listings.find((l) => l.id === listingId);
    if (!listing) return jsonResp({ ok: false, error: 'Listing not found.' }, 404);
    const report: PlatformReport = {
      id: makeCfId('rep'),
      listingId: listing.id,
      listingTitle: listing.title,
      module: listing.module,
      reason: cleanText(body.reason, 120) || 'Incorrect info',
      details: cleanText(body.details, 1000),
      reporterName: cleanText(body.reporterName, 100) || undefined,
      reporterContact: cleanText(body.reporterContact, 60) || undefined,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    state.reports.unshift(report);
    await persistCfState(state);
    return jsonResp({ ok: true, report }, 201);
  }

  if (pathname === '/api/platform/games' && method === 'GET') {
    return jsonResp({
      ok: true,
      quizzes: state.quizzes.filter((q) => q.active),
      wordPuzzles: KANNADA_WORD_PUZZLES,
      leaderboard: sortLeaderboard(state.leaderboard).slice(0, 20),
    });
  }

  const quizSubmitMatch = pathname.match(/^\/api\/platform\/games\/([^/]+)\/submit$/);
  if (quizSubmitMatch && method === 'POST') {
    const id = decodeURIComponent(quizSubmitMatch[1]);
    const quiz = state.quizzes.find((q) => q.id === id && q.active);
    if (!quiz) return jsonResp({ ok: false, error: 'Quiz not found.' }, 404);
    const body = await readBody(request);
    const answers = Array.isArray(body.answers) ? body.answers.map(Number) : [];
    const result = scoreQuizAttempt(quiz, answers);
    const entry: QuizLeaderboardEntry = {
      id: makeCfId('qscore'),
      quizId: quiz.id,
      playerName: cleanText(body.playerName, 60) || 'Malnad Reader',
      location: cleanText(body.location, 60) || 'Koppa',
      score: result.score,
      total: result.total,
      durationSec: Math.max(1, Math.min(3600, Math.round(Number(body.durationSec) || 30))),
      createdAt: new Date().toISOString(),
    };
    state.leaderboard.push(entry);
    await persistCfState(state);
    return jsonResp({
      ok: true,
      result,
      entry,
      leaderboard: sortLeaderboard(state.leaderboard).slice(0, 20),
    });
  }

  if (pathname === '/api/platform/analytics/event' && method === 'POST') {
    const body = await readBody(request);
    const sessionId = cleanText(body.sessionId, 64);
    if (sessionId && !state.uniqueSessions.includes(sessionId)) {
      state.uniqueSessions.push(sessionId);
      if (state.uniqueSessions.length > 5000) state.uniqueSessions.shift();
    }
    if (body.device === 'mobile') state.mobileEvents += 1;
    else state.desktopEvents += 1;
    if (body.type === 'page_view') {
      state.pageViews += 1;
      const mod = cleanText(body.module, 40);
      if (mod) state.sectionVisits[mod] = (state.sectionVisits[mod] || 0) + 1;
    } else if (body.type === 'whatsapp_share') {
      state.whatsappShares += 1;
    } else if (body.type === 'search') {
      const term = cleanText(body.searchTerm, 80).toLowerCase();
      if (term.length >= 2) state.searchTerms[term] = (state.searchTerms[term] || 0) + 1;
    }
    const loc = cleanText(body.location, 60);
    if (loc && loc.toLowerCase() !== 'all') {
      state.locationActivity[loc] = (state.locationActivity[loc] || 0) + 1;
    }
    await persistCfState(state);
    return jsonResp({ ok: true });
  }

  return jsonResp({ ok: false, error: 'Platform route not found.' }, 404);
}

export async function handleCfAdminPlatformRoute(
  request: Request,
  url: URL,
  adminEmail: string
): Promise<Response | null> {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/admin2/platform/')) return null;

  const state = await ensureCfState();
  const method = request.method.toUpperCase();

  if (pathname === '/api/admin2/platform/overview' && method === 'GET') {
    return jsonResp({
      ok: true,
      analytics: {
        totalUniqueVisitors: state.uniqueSessions.length,
        dailyVisitors: state.uniqueSessions.length,
        weeklyVisitors: state.uniqueSessions.length,
        monthlyVisitors: state.uniqueSessions.length,
        activeVisitorsApprox: Math.min(state.uniqueSessions.length, 5),
        totalPageViews: state.pageViews,
        totalWhatsappShares: state.whatsappShares,
        totalEnquiries: state.enquiries,
        deviceBreakdown: { mobile: state.mobileEvents, desktop: state.desktopEvents },
        topSearchTerms: Object.entries(state.searchTerms)
          .map(([term, count]) => ({ term, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12),
        popularSections: Object.entries(state.sectionVisits)
          .map(([module, visits]) => ({ module, visits }))
          .sort((a, b) => b.visits - a.visits)
          .slice(0, 12),
        locationActivity: Object.entries(state.locationActivity)
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        moduleCounts: computeModuleCounts(state),
        pendingSubmissionsCount: state.listings.filter((l) => l.status === 'pending').length,
        openReportsCount: state.reports.filter((r) => r.status === 'open').length,
        quizAttemptsCount: state.leaderboard.length,
        recentSubmissions: state.listings.slice(0, 10),
      },
      localities: state.localities,
      homepageSections: [...state.homepageSections].sort((a, b) => a.order - b.order),
      homepageAnnouncement: state.homepageAnnouncement,
      feedCategories: [...state.feedCategories].sort((a, b) => a.order - b.order),
      displaySettings: state.displaySettings,
      weatherConfig: state.weatherConfig,
    });
  }

  if (pathname === '/api/admin2/platform/listings' && method === 'GET') {
    const module = cleanText(url.searchParams.get('module'), 40);
    const status = cleanText(url.searchParams.get('status'), 30);
    let items = [...state.listings];
    if (module && module !== 'all') items = items.filter((l) => l.module === module);
    if (status && status !== 'all') items = items.filter((l) => l.status === status);
    return jsonResp({ ok: true, total: items.length, listings: items });
  }

  if (pathname === '/api/admin2/platform/listings' && method === 'POST') {
    const body = await readBody(request);
    const listing = buildListingFromBody(body, (body.status as ListingStatus) || 'approved');
    if (!listing) return jsonResp({ ok: false, error: 'Invalid listing payload.' }, 400);
    state.listings.unshift(listing);
    await persistCfState(state);
    return jsonResp({ ok: true, listing }, 201);
  }

  const listingModMatch = pathname.match(/^\/api\/admin2\/platform\/listings\/([^/]+)\/moderate$/);
  if (listingModMatch && method === 'PATCH') {
    const id = decodeURIComponent(listingModMatch[1]);
    const item = state.listings.find((l) => l.id === id);
    if (!item) return jsonResp({ ok: false, error: 'Listing not found.' }, 404);
    const body = await readBody(request);
    if (typeof body.status === 'string') item.status = body.status as ListingStatus;
    if (typeof body.verified === 'boolean') item.verified = body.verified;
    if (typeof body.featured === 'boolean') item.featured = body.featured;
    if (typeof body.grievanceStatus === 'string') {
      item.grievanceStatus = body.grievanceStatus as PlatformListing['grievanceStatus'];
    }
    item.updatedAt = new Date().toISOString();
    await persistCfState(state);
    return jsonResp({ ok: true, listing: item });
  }

  const listingIdMatch = pathname.match(/^\/api\/admin2\/platform\/listings\/([^/]+)$/);
  if (listingIdMatch) {
    const id = decodeURIComponent(listingIdMatch[1]);
    const idx = state.listings.findIndex((l) => l.id === id);
    if (idx === -1) return jsonResp({ ok: false, error: 'Listing not found.' }, 404);
    if (method === 'PUT') {
      const body = await readBody(request);
      const rebuilt = buildListingFromBody(
        { ...state.listings[idx], ...body },
        (body.status as ListingStatus) || state.listings[idx].status
      );
      if (!rebuilt) return jsonResp({ ok: false, error: 'Invalid listing update.' }, 400);
      state.listings[idx] = { ...state.listings[idx], ...rebuilt, id };
      await persistCfState(state);
      return jsonResp({ ok: true, listing: state.listings[idx] });
    }
    if (method === 'DELETE') {
      state.listings.splice(idx, 1);
      await persistCfState(state);
      return jsonResp({ ok: true });
    }
  }

  if (pathname === '/api/admin2/platform/homepage-sections') {
    if (method === 'GET') {
      return jsonResp({
        ok: true,
        sections: [...state.homepageSections].sort((a, b) => a.order - b.order),
      });
    }
    if (method === 'PUT') {
      const body = await readBody(request);
      if (Array.isArray(body.sections)) {
        state.homepageSections = body.sections as HomepageSectionConfig[];
        await persistCfState(state);
      }
      return jsonResp({ ok: true, sections: state.homepageSections });
    }
  }

  if (pathname === '/api/admin2/platform/announcement') {
    if (method === 'GET') {
      return jsonResp({ ok: true, announcement: state.homepageAnnouncement });
    }
    if (method === 'PUT') {
      const body = await readBody(request);
      const raw = (body.announcement || body) as Partial<HomepageAnnouncementConfig>;
      state.homepageAnnouncement = {
        ...state.homepageAnnouncement,
        ...raw,
        enabled: Boolean(raw.enabled),
        updatedAt: new Date().toISOString(),
      };
      await persistCfState(state);
      return jsonResp({ ok: true, announcement: state.homepageAnnouncement });
    }
  }

  if (pathname === '/api/admin2/platform/feed-categories') {
    if (method === 'GET') {
      return jsonResp({
        ok: true,
        feedCategories: [...state.feedCategories].sort((a, b) => a.order - b.order),
      });
    }
    if (method === 'PUT') {
      const body = await readBody(request);
      if (Array.isArray(body.feedCategories) && body.feedCategories.length > 0) {
        state.feedCategories = mergeCfFeedCategories(body.feedCategories as FeedCategoryConfig[]);
        await persistCfState(state);
      }
      return jsonResp({ ok: true, feedCategories: state.feedCategories });
    }
  }

  if (pathname === '/api/admin2/platform/display-settings') {
    if (method === 'GET') {
      return jsonResp({ ok: true, displaySettings: state.displaySettings });
    }
    if (method === 'PUT') {
      const body = await readBody(request);
      const raw = (body.displaySettings || body) as Partial<PlatformDisplaySettings>;
      state.displaySettings = {
        showViewCounts: Boolean(raw.showViewCounts),
        showBreakingTicker: raw.showBreakingTicker !== false,
        showTrendingSection: raw.showTrendingSection !== false,
        showCategoryGrid: raw.showCategoryGrid !== false,
        showCommunityFeed: raw.showCommunityFeed !== false,
        updatedAt: new Date().toISOString(),
      };
      await persistCfState(state);
      return jsonResp({ ok: true, displaySettings: state.displaySettings });
    }
  }

  if (pathname === '/api/admin2/platform/locations') {
    if (method === 'GET') return jsonResp({ ok: true, localities: state.localities });
    if (method === 'POST') {
      const body = await readBody(request);
      const nameEn = cleanText(body.nameEn, 80);
      if (!nameEn) return jsonResp({ ok: false, error: 'Locality name required.' }, 400);
      const loc: LocalityOption = {
        id: nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-') || makeCfId('loc'),
        nameEn,
        nameKn: cleanText(body.nameKn, 80) || nameEn,
        taluk: cleanText(body.taluk, 80) || 'Koppa',
        active: true,
      };
      state.localities.push(loc);
      await persistCfState(state);
      return jsonResp({ ok: true, locality: loc, localities: state.localities }, 201);
    }
  }

  const locDelMatch = pathname.match(/^\/api\/admin2\/platform\/locations\/([^/]+)$/);
  if (locDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(locDelMatch[1]);
    state.localities = state.localities.filter((l) => l.id !== id);
    await persistCfState(state);
    return jsonResp({ ok: true, localities: state.localities });
  }

  if (pathname === '/api/admin2/platform/quizzes') {
    if (method === 'GET') {
      return jsonResp({
        ok: true,
        quizzes: state.quizzes,
        leaderboard: sortLeaderboard(state.leaderboard).slice(0, 30),
      });
    }
    if (method === 'POST') {
      const body = await readBody(request);
      const nowIso = new Date().toISOString();
      const quiz: PlatformQuiz = {
        id: makeCfId('quiz'),
        titleKn: cleanText(body.titleKn, 160),
        titleEn: cleanText(body.titleEn || body.titleKn, 160),
        descriptionKn: cleanText(body.descriptionKn, 240),
        descriptionEn: cleanText(body.descriptionEn, 240),
        category: 'malnad',
        scheduleType: (['always', 'daily', 'weekly'].includes(String(body.scheduleType || ''))
          ? String(body.scheduleType)
          : 'always') as PlatformQuiz['scheduleType'],
        active: body.active !== false,
        questions: Array.isArray(body.questions) ? (body.questions as PlatformQuiz['questions']) : [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.quizzes.unshift(quiz);
      await persistCfState(state);
      return jsonResp({ ok: true, quiz }, 201);
    }
  }

  const quizIdMatch = pathname.match(/^\/api\/admin2\/platform\/quizzes\/([^/]+)$/);
  if (quizIdMatch) {
    const id = decodeURIComponent(quizIdMatch[1]);
    const quiz = state.quizzes.find((q) => q.id === id);
    if (!quiz) return jsonResp({ ok: false, error: 'Quiz not found.' }, 404);
    if (method === 'PUT') {
      const body = await readBody(request);
      if (typeof body.active === 'boolean') quiz.active = body.active;
      if (typeof body.titleKn === 'string') quiz.titleKn = cleanText(body.titleKn, 160);
      if (typeof body.titleEn === 'string') quiz.titleEn = cleanText(body.titleEn, 160);
      quiz.updatedAt = new Date().toISOString();
      await persistCfState(state);
      return jsonResp({ ok: true, quiz });
    }
    if (method === 'DELETE') {
      state.quizzes = state.quizzes.filter((q) => q.id !== id);
      await persistCfState(state);
      return jsonResp({ ok: true });
    }
  }

  if (pathname === '/api/admin2/platform/reports' && method === 'GET') {
    return jsonResp({ ok: true, reports: state.reports });
  }

  const repPatchMatch = pathname.match(/^\/api\/admin2\/platform\/reports\/([^/]+)$/);
  if (repPatchMatch && method === 'PATCH') {
    const id = decodeURIComponent(repPatchMatch[1]);
    const rep = state.reports.find((r) => r.id === id);
    if (!rep) return jsonResp({ ok: false, error: 'Report not found.' }, 404);
    const body = await readBody(request);
    if (typeof body.status === 'string') {
      rep.status = body.status as PlatformReport['status'];
      rep.resolvedAt = new Date().toISOString();
      rep.resolvedBy = adminEmail;
      await persistCfState(state);
    }
    return jsonResp({ ok: true, report: rep });
  }

  if (pathname === '/api/admin2/platform/weather' && method === 'GET') {
    return jsonResp({ ok: true, config: state.weatherConfig, logs: state.weatherLogs });
  }

  if (pathname === '/api/admin2/platform/weather/logs' && method === 'POST') {
    const body = await readBody(request);
    const log: WeatherRainfallRecord = {
      id: makeCfId('rain'),
      location: cleanText(body.location, 80) || 'Koppa',
      dateYmd: cleanText(body.dateYmd, 20) || new Date().toISOString().slice(0, 10),
      rainfallMm: Math.max(0, Number(body.rainfallMm) || 0),
      tempMinC: body.tempMinC !== undefined && body.tempMinC !== '' ? Number(body.tempMinC) : null,
      tempMaxC: body.tempMaxC !== undefined && body.tempMaxC !== '' ? Number(body.tempMaxC) : null,
      conditionKn: cleanText(body.conditionKn, 120) || 'ಮೋಡ ಕವಿದ ವಾತಾವರಣ',
      conditionEn: cleanText(body.conditionEn, 120) || 'Cloudy / Rain',
      advisoryKn: cleanText(body.advisoryKn, 260) || undefined,
      advisoryEn: cleanText(body.advisoryEn, 260) || undefined,
      sourceAttribution: cleanText(body.sourceAttribution, 140) || 'Coffeenadu Local Rain Gauge',
      updatedAt: new Date().toISOString(),
    };
    state.weatherLogs.unshift(log);
    await persistCfState(state);
    return jsonResp({ ok: true, log }, 201);
  }

  const weatherDelMatch = pathname.match(/^\/api\/admin2\/platform\/weather\/logs\/([^/]+)$/);
  if (weatherDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(weatherDelMatch[1]);
    state.weatherLogs = state.weatherLogs.filter((w) => w.id !== id);
    await persistCfState(state);
    return jsonResp({ ok: true });
  }

  return jsonResp({ ok: false, error: 'Admin platform endpoint not found.' }, 404);
}
