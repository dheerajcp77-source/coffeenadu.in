import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, RequestHandler, Response } from 'express';
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_MALNAD_LOCALITIES,
  DEFAULT_WEATHER_CONFIG,
  KANNADA_WORD_PUZZLES,
  PLATFORM_MODULES,
  STARTER_PLATFORM_QUIZZES,
  STARTER_VERIFIED_PUBLIC_LISTINGS,
  STARTER_WEATHER_LOGS,
} from '../constants/platformCatalog.ts';
import type { AdminPermission } from '../types/admin2.ts';
import type {
  DirectoryModuleId,
  HomepageSectionConfig,
  ListingStatus,
  LocalityOption,
  PlatformAnalyticsSummary,
  PlatformListing,
  PlatformQuiz,
  PlatformReport,
  QuizLeaderboardEntry,
  WeatherConfig,
  WeatherRainfallRecord,
} from '../types/platform.ts';
import {
  matchesLocality,
  sanitizePlatformUrl,
  scoreQuizAttempt,
  sortLeaderboard,
} from '../utils/platformHelpers.ts';
import type { Admin2Request } from './admin2Backend.ts';

interface PlatformDailyAnalytics {
  date: string; // YYYY-MM-DD
  pageViews: number;
  visitorHashes: string[];
  whatsappShares: number;
  enquiries: number;
  mobileEvents: number;
  desktopEvents: number;
}

interface PlatformStoreState {
  version: number;
  localities: LocalityOption[];
  homepageSections: HomepageSectionConfig[];
  listings: PlatformListing[];
  reports: PlatformReport[];
  quizzes: PlatformQuiz[];
  leaderboard: QuizLeaderboardEntry[];
  weatherConfig: WeatherConfig;
  weatherLogs: WeatherRainfallRecord[];
  searchTerms: Record<string, number>;
  sectionVisits: Record<string, number>;
  locationActivity: Record<string, number>;
  analyticsByDay: Record<string, PlatformDailyAnalytics>;
  activeVisitors: Record<string, number>; // visitorHash -> lastSeenMs
}

const VALID_DIRECTORY_MODULES = new Set<string>(
  PLATFORM_MODULES.filter((m) => m.isDirectoryModule).map((m) => m.id)
);

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function cleanText(raw: unknown, maxLen = 500): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function cleanMultilineText(raw: unknown, maxLen = 4000): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLen);
}

function getTodayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || '127.0.0.1';
}

function hashVisitor(ip: string, ua: string, sessionId?: string): string {
  const basis = sessionId ? `s:${sessionId}` : `ip:${ip}|ua:${ua.slice(0, 80)}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

function isListingExpired(listing: PlatformListing): boolean {
  if (!listing.expiresAt) return false;
  const ts = Date.parse(listing.expiresAt);
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
}

export class PlatformBackend {
  private readonly storePath: string;
  private state: PlatformStoreState;
  private readonly rateBuckets = new Map<string, number[]>();

  constructor(
    dataDir: string,
    private readonly authFactory: (perm?: AdminPermission) => RequestHandler
  ) {
    this.storePath = path.join(dataDir, 'platform-store.json');
    this.state = this.loadState();
  }

  private createDefaultState(): PlatformStoreState {
    return {
      version: 1,
      localities: DEFAULT_MALNAD_LOCALITIES.map((l) => ({ ...l })),
      homepageSections: DEFAULT_HOMEPAGE_SECTIONS.map((s) => ({ ...s })),
      listings: STARTER_VERIFIED_PUBLIC_LISTINGS.map((l) => ({ ...l })),
      reports: [],
      quizzes: STARTER_PLATFORM_QUIZZES.map((q) => ({
        ...q,
        questions: q.questions.map((qq) => ({ ...qq, options: qq.options.map((o) => ({ ...o })) })),
      })),
      leaderboard: [],
      weatherConfig: { ...DEFAULT_WEATHER_CONFIG },
      weatherLogs: STARTER_WEATHER_LOGS.map((w) => ({ ...w })),
      searchTerms: {},
      sectionVisits: {},
      locationActivity: {},
      analyticsByDay: {},
      activeVisitors: {},
    };
  }

  private loadState(): PlatformStoreState {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PlatformStoreState>;
        const defaults = this.createDefaultState();
        return {
          ...defaults,
          ...parsed,
          localities:
            Array.isArray(parsed.localities) && parsed.localities.length > 0
              ? parsed.localities
              : defaults.localities,
          homepageSections:
            Array.isArray(parsed.homepageSections) && parsed.homepageSections.length > 0
              ? parsed.homepageSections
              : defaults.homepageSections,
          listings: Array.isArray(parsed.listings) ? parsed.listings : defaults.listings,
          reports: Array.isArray(parsed.reports) ? parsed.reports : [],
          quizzes:
            Array.isArray(parsed.quizzes) && parsed.quizzes.length > 0
              ? parsed.quizzes
              : defaults.quizzes,
          leaderboard: Array.isArray(parsed.leaderboard) ? parsed.leaderboard : [],
          weatherConfig: parsed.weatherConfig
            ? { ...defaults.weatherConfig, ...parsed.weatherConfig }
            : defaults.weatherConfig,
          weatherLogs: Array.isArray(parsed.weatherLogs) ? parsed.weatherLogs : [],
          searchTerms: parsed.searchTerms && typeof parsed.searchTerms === 'object' ? parsed.searchTerms : {},
          sectionVisits: parsed.sectionVisits && typeof parsed.sectionVisits === 'object' ? parsed.sectionVisits : {},
          locationActivity:
            parsed.locationActivity && typeof parsed.locationActivity === 'object'
              ? parsed.locationActivity
              : {},
          analyticsByDay:
            parsed.analyticsByDay && typeof parsed.analyticsByDay === 'object'
              ? parsed.analyticsByDay
              : {},
          activeVisitors: {},
        };
      }
    } catch (err) {
      console.error('[PlatformBackend] Failed to load platform-store.json, using defaults:', err);
    }
    const fresh = this.createDefaultState();
    this.saveState(fresh);
    return fresh;
  }

  private saveState(targetState: PlatformStoreState = this.state): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const serializable = {
        ...targetState,
        activeVisitors: {}, // keep ephemeral out of disk churn
      };
      const tmpPath = `${this.storePath}.tmp-${process.pid}`;
      fs.writeFileSync(tmpPath, JSON.stringify(serializable, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.storePath);
    } catch (err) {
      console.error('[PlatformBackend] Failed to save platform-store.json:', err);
    }
  }

  private checkRateLimit(key: string, maxPerWindow: number, windowMs: number): boolean {
    const now = Date.now();
    const list = (this.rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (list.length >= maxPerWindow) {
      this.rateBuckets.set(key, list);
      return false;
    }
    list.push(now);
    this.rateBuckets.set(key, list);
    return true;
  }

  private getOrCreateTodayAnalytics(): PlatformDailyAnalytics {
    const today = getTodayYmd();
    if (!this.state.analyticsByDay[today]) {
      this.state.analyticsByDay[today] = {
        date: today,
        pageViews: 0,
        visitorHashes: [],
        whatsappShares: 0,
        enquiries: 0,
        mobileEvents: 0,
        desktopEvents: 0,
      };
    }
    return this.state.analyticsByDay[today];
  }

  private computeApprovedModuleCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const mod of PLATFORM_MODULES) {
      counts[mod.id] = 0;
    }
    for (const item of this.state.listings) {
      if (item.status === 'approved' && !isListingExpired(item)) {
        counts[item.module] = (counts[item.module] || 0) + 1;
      }
    }
    counts.games = this.state.quizzes.filter((q) => q.active).length;
    counts.weather = this.state.weatherLogs.length;
    return counts;
  }

  private buildAnalyticsSummary(): PlatformAnalyticsSummary {
    const now = Date.now();
    // Prune active visitors older than 10 minutes
    for (const [hash, ts] of Object.entries(this.state.activeVisitors)) {
      if (now - ts > 10 * 60 * 1000) {
        delete this.state.activeVisitors[hash];
      }
    }

    const days = Object.values(this.state.analyticsByDay);
    const todayYmd = getTodayYmd();
    const sevenDaysAgo = new Date(now - 6 * 86400 * 1000).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now - 29 * 86400 * 1000).toISOString().slice(0, 10);

    const allVisitors = new Set<string>();
    const weeklyVisitors = new Set<string>();
    const monthlyVisitors = new Set<string>();
    let dailyVisitors = 0;
    let totalPageViews = 0;
    let totalWhatsappShares = 0;
    let totalEnquiries = 0;
    let mobile = 0;
    let desktop = 0;

    for (const day of days) {
      totalPageViews += day.pageViews || 0;
      totalWhatsappShares += day.whatsappShares || 0;
      totalEnquiries += day.enquiries || 0;
      mobile += day.mobileEvents || 0;
      desktop += day.desktopEvents || 0;
      const hashes = Array.isArray(day.visitorHashes) ? day.visitorHashes : [];
      for (const h of hashes) {
        allVisitors.add(h);
        if (day.date >= sevenDaysAgo) weeklyVisitors.add(h);
        if (day.date >= thirtyDaysAgo) monthlyVisitors.add(h);
      }
      if (day.date === todayYmd) {
        dailyVisitors = hashes.length;
      }
    }

    const topSearchTerms = Object.entries(this.state.searchTerms)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const popularSections = Object.entries(this.state.sectionVisits)
      .map(([module, visits]) => ({ module, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 12);

    const locationActivity = Object.entries(this.state.locationActivity)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const pendingSubmissions = this.state.listings.filter((l) => l.status === 'pending');

    return {
      totalUniqueVisitors: allVisitors.size,
      dailyVisitors,
      weeklyVisitors: weeklyVisitors.size,
      monthlyVisitors: monthlyVisitors.size,
      activeVisitorsApprox: Object.keys(this.state.activeVisitors).length,
      totalPageViews,
      totalWhatsappShares,
      totalEnquiries,
      deviceBreakdown: { mobile, desktop },
      topSearchTerms,
      popularSections,
      locationActivity,
      moduleCounts: this.computeApprovedModuleCounts(),
      pendingSubmissionsCount: pendingSubmissions.length,
      openReportsCount: this.state.reports.filter((r) => r.status === 'open').length,
      quizAttemptsCount: this.state.leaderboard.length,
      recentSubmissions: [...this.state.listings]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    };
  }

  private normalizeListingInput(
    body: Record<string, unknown>,
    defaultStatus: ListingStatus
  ): { ok: true; listing: Omit<PlatformListing, 'id' | 'views' | 'callClicks' | 'whatsappClicks' | 'applyClicks' | 'createdAt' | 'updatedAt'> } | { ok: false; error: string } {
    const module = cleanText(body.module, 40) as DirectoryModuleId;
    if (!VALID_DIRECTORY_MODULES.has(module)) {
      return { ok: false, error: 'Invalid module selected.' };
    }
    const title = cleanText(body.title, 180);
    if (title.length < 3) {
      return { ok: false, error: 'Title must be at least 3 characters.' };
    }
    const summary = cleanText(body.summary || body.description, 320);
    const description = cleanMultilineText(body.description || body.summary, 4000);
    if (!description) {
      return { ok: false, error: 'Description is required.' };
    }
    const category = cleanText(body.category, 80) || 'general';
    const location = cleanText(body.location, 80) || 'Koppa';

    const priceNum =
      body.price !== undefined && body.price !== null && String(body.price).trim() !== ''
        ? Number(body.price)
        : null;

    const website = sanitizePlatformUrl(typeof body.website === 'string' ? body.website : '');
    const mapUrl = sanitizePlatformUrl(typeof body.mapUrl === 'string' ? body.mapUrl : '');
    const applyUrl = sanitizePlatformUrl(typeof body.applyUrl === 'string' ? body.applyUrl : '');
    const documentUrl = sanitizePlatformUrl(typeof body.documentUrl === 'string' ? body.documentUrl : '');
    const imageUrl = sanitizePlatformUrl(typeof body.imageUrl === 'string' ? body.imageUrl : '');

    const rawTags = Array.isArray(body.tags)
      ? body.tags.map((t) => cleanText(t, 40)).filter(Boolean).slice(0, 12)
      : typeof body.tags === 'string'
        ? body.tags
            .split(',')
            .map((t) => cleanText(t, 40))
            .filter(Boolean)
            .slice(0, 12)
        : [];

    const rawGallery = Array.isArray(body.gallery)
      ? body.gallery
          .map((u) => sanitizePlatformUrl(typeof u === 'string' ? u : ''))
          .filter(Boolean)
          .slice(0, 6)
      : [];

    return {
      ok: true,
      listing: {
        module,
        title,
        titleEn: cleanText(body.titleEn, 180) || undefined,
        category,
        subcategory: cleanText(body.subcategory, 80) || undefined,
        summary: summary || description.slice(0, 180),
        description,
        location,
        address: cleanText(body.address, 260) || undefined,
        mapUrl: mapUrl || undefined,
        phone: cleanText(body.phone, 24) || undefined,
        whatsapp: cleanText(body.whatsapp, 24) || undefined,
        email: cleanText(body.email, 120) || undefined,
        website: website || undefined,
        imageUrl: imageUrl || undefined,
        gallery: rawGallery.length > 0 ? rawGallery : undefined,
        tags: rawTags.length > 0 ? rawTags : undefined,
        price: Number.isFinite(priceNum) ? priceNum : null,
        priceLabel: cleanText(body.priceLabel, 60) || undefined,
        negotiable: Boolean(body.negotiable),
        condition: (['new', 'used', 'refurbished'].includes(String(body.condition || ''))
          ? String(body.condition)
          : '') as PlatformListing['condition'],
        employer: cleanText(body.employer, 140) || undefined,
        jobType: (['government', 'private', 'part-time', 'contract'].includes(String(body.jobType || ''))
          ? String(body.jobType)
          : '') as PlatformListing['jobType'],
        qualification: cleanText(body.qualification, 180) || undefined,
        experience: cleanText(body.experience, 100) || undefined,
        salary: cleanText(body.salary, 100) || undefined,
        applicationDeadline: cleanText(body.applicationDeadline, 40) || undefined,
        applyUrl: applyUrl || undefined,
        openingHours: cleanText(body.openingHours, 100) || undefined,
        weeklyHoliday: cleanText(body.weeklyHoliday, 60) || undefined,
        emergency24x7: Boolean(body.emergency24x7),
        verified: Boolean(body.verified),
        featured: Boolean(body.featured),
        status: defaultStatus,
        subscriptionPlan: (['free', 'standard', 'featured'].includes(String(body.subscriptionPlan || ''))
          ? String(body.subscriptionPlan)
          : 'free') as PlatformListing['subscriptionPlan'],
        expiresAt: cleanText(body.expiresAt, 40) || undefined,
        sourceAttribution: cleanText(body.sourceAttribution, 160) || undefined,
        lastUpdatedLabel: cleanText(body.lastUpdatedLabel, 80) || undefined,
        documentUrl: documentUrl || undefined,
        fileType: cleanText(body.fileType, 40) || undefined,
        discountText: cleanText(body.discountText, 80) || undefined,
        validUntil: cleanText(body.validUntil, 40) || undefined,
        grievanceStatus: (['open', 'in_review', 'resolved'].includes(String(body.grievanceStatus || ''))
          ? String(body.grievanceStatus)
          : module === 'grievances'
            ? 'open'
            : undefined) as PlatformListing['grievanceStatus'],
        lostOrFound: (['lost', 'found'].includes(String(body.lostOrFound || ''))
          ? String(body.lostOrFound)
          : '') as PlatformListing['lostOrFound'],
        propertyType: (['rent', 'sale', 'lease', 'estate', 'land', 'room'].includes(
          String(body.propertyType || '')
        )
          ? String(body.propertyType)
          : '') as PlatformListing['propertyType'],
        areaSize: cleanText(body.areaSize, 80) || undefined,
        submittedByUid: cleanText(body.submittedByUid, 128) || undefined,
        submittedByName: cleanText(body.submittedByName, 120) || undefined,
        submittedByContact: cleanText(body.submittedByContact, 60) || undefined,
      },
    };
  }

  public mountRoutes(app: Express): void {
    // =========================================================
    // PUBLIC PLATFORM ROUTES
    // =========================================================

    app.get('/api/platform/bootstrap', (_req: Request, res: Response) => {
      const moduleCounts = this.computeApprovedModuleCounts();
      const approvedListings = this.state.listings
        .filter((l) => l.status === 'approved' && !isListingExpired(l))
        .sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt.localeCompare(a.createdAt));

      const popularSearches = Object.entries(this.state.searchTerms)
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      res.json({
        ok: true,
        localities: this.state.localities.filter((l) => l.active),
        homepageSections: [...this.state.homepageSections].sort((a, b) => a.order - b.order),
        moduleCounts,
        featuredListings: approvedListings.slice(0, 80),
        popularSearches,
        weatherConfig: this.state.weatherConfig,
        latestWeatherLogs: [...this.state.weatherLogs]
          .sort((a, b) => b.dateYmd.localeCompare(a.dateYmd) || b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 12),
        activeQuizCount: this.state.quizzes.filter((q) => q.active).length,
      });
    });

    app.get('/api/platform/listings', (req: Request, res: Response) => {
      const module = cleanText(req.query.module, 40);
      const category = cleanText(req.query.category, 80).toLowerCase();
      const location = cleanText(req.query.location, 80);
      const q = cleanText(req.query.q, 120).toLowerCase();
      const featuredOnly = req.query.featured === '1' || req.query.featured === 'true';
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);

      let items = this.state.listings.filter(
        (l) => l.status === 'approved' && !isListingExpired(l)
      );

      if (module && module !== 'all') {
        items = items.filter((l) => l.module === module);
      }
      if (category && category !== 'all') {
        items = items.filter((l) => l.category.toLowerCase() === category);
      }
      if (location && location.toLowerCase() !== 'all') {
        items = items.filter((l) => matchesLocality(l.location, location));
      }
      if (featuredOnly) {
        items = items.filter((l) => l.featured);
      }
      if (q) {
        items = items.filter((l) => {
          const hay =
            `${l.title} ${l.titleEn || ''} ${l.summary} ${l.description} ${l.location} ${l.category} ${l.employer || ''} ${(l.tags || []).join(' ')}`.toLowerCase();
          return hay.includes(q);
        });
      }

      items.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          Number(b.verified) - Number(a.verified) ||
          b.createdAt.localeCompare(a.createdAt)
      );

      res.json({
        ok: true,
        total: items.length,
        listings: items.slice(0, limit),
      });
    });

    app.get('/api/platform/listings/:id', (req: Request, res: Response) => {
      const id = cleanText(req.params.id, 120);
      const item = this.state.listings.find((l) => l.id === id && l.status === 'approved');
      if (!item) {
        res.status(404).json({ ok: false, error: 'Listing not found.' });
        return;
      }
      item.views = (item.views || 0) + 1;
      this.saveState();
      res.json({ ok: true, listing: item });
    });

    app.post('/api/platform/listings/:id/enquiry', (req: Request, res: Response) => {
      const id = cleanText(req.params.id, 120);
      const type = cleanText(req.body?.type, 24);
      const item = this.state.listings.find((l) => l.id === id && l.status === 'approved');
      if (!item) {
        res.status(404).json({ ok: false, error: 'Listing not found.' });
        return;
      }
      if (type === 'call') item.callClicks = (item.callClicks || 0) + 1;
      else if (type === 'whatsapp') item.whatsappClicks = (item.whatsappClicks || 0) + 1;
      else if (type === 'apply') item.applyClicks = (item.applyClicks || 0) + 1;

      const day = this.getOrCreateTodayAnalytics();
      day.enquiries += 1;
      this.saveState();
      res.json({ ok: true });
    });

    app.post('/api/platform/submissions', (req: Request, res: Response) => {
      // Honeypot anti-spam check
      if (req.body?.website_hp && String(req.body.website_hp).trim() !== '') {
        res.status(200).json({ ok: true, queued: true });
        return;
      }
      const ip = getClientIp(req);
      if (!this.checkRateLimit(`submit:${ip}`, 15, 60 * 60 * 1000)) {
        res.status(429).json({
          ok: false,
          error: 'Too many submissions from this device. Please try again later.',
        });
        return;
      }

      const normalized = this.normalizeListingInput(
        (req.body || {}) as Record<string, unknown>,
        'pending'
      );
      if (!normalized.ok) {
        res.status(400).json({ ok: false, error: normalized.error });
        return;
      }

      const nowIso = new Date().toISOString();
      const newListing: PlatformListing = {
        ...normalized.listing,
        id: makeId(normalized.listing.module.slice(0, 4)),
        verified: false,
        featured: false,
        status: 'pending',
        views: 0,
        callClicks: 0,
        whatsappClicks: 0,
        applyClicks: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.state.listings.unshift(newListing);
      this.saveState();

      res.status(201).json({
        ok: true,
        listing: newListing,
        message: 'Submitted successfully. Your listing is pending admin verification before going live.',
      });
    });

    app.get('/api/platform/my-submissions', (req: Request, res: Response) => {
      const uid = cleanText(req.query.uid, 128);
      if (!uid) {
        res.json({ ok: true, listings: [] });
        return;
      }
      const mine = this.state.listings
        .filter((l) => l.submittedByUid === uid)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({ ok: true, listings: mine });
    });

    app.post('/api/platform/reports', (req: Request, res: Response) => {
      const ip = getClientIp(req);
      if (!this.checkRateLimit(`report:${ip}`, 15, 60 * 60 * 1000)) {
        res.status(429).json({ ok: false, error: 'Too many reports submitted. Try again later.' });
        return;
      }
      const listingId = cleanText(req.body?.listingId, 120);
      const reason = cleanText(req.body?.reason, 120);
      const details = cleanMultilineText(req.body?.details, 1000);
      const listing = this.state.listings.find((l) => l.id === listingId);
      if (!listing) {
        res.status(404).json({ ok: false, error: 'Listing not found.' });
        return;
      }
      if (!reason) {
        res.status(400).json({ ok: false, error: 'Please select a reason for the report.' });
        return;
      }
      const report: PlatformReport = {
        id: makeId('rep'),
        listingId: listing.id,
        listingTitle: listing.title,
        module: listing.module,
        reason,
        details,
        reporterName: cleanText(req.body?.reporterName, 100) || undefined,
        reporterContact: cleanText(req.body?.reporterContact, 60) || undefined,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      this.state.reports.unshift(report);
      this.saveState();
      res.status(201).json({ ok: true, report });
    });

    app.get('/api/platform/games', (_req: Request, res: Response) => {
      const activeQuizzes = this.state.quizzes.filter((q) => q.active);
      res.json({
        ok: true,
        quizzes: activeQuizzes,
        wordPuzzles: KANNADA_WORD_PUZZLES,
        leaderboard: sortLeaderboard(this.state.leaderboard).slice(0, 20),
      });
    });

    app.post('/api/platform/games/:id/submit', (req: Request, res: Response) => {
      const id = cleanText(req.params.id, 120);
      const quiz = this.state.quizzes.find((q) => q.id === id && q.active);
      if (!quiz) {
        res.status(404).json({ ok: false, error: 'Quiz not found or inactive.' });
        return;
      }
      const answers = Array.isArray(req.body?.answers)
        ? req.body.answers.map((v: unknown) => Number(v))
        : [];
      const playerName = cleanText(req.body?.playerName, 60) || 'Malnad Reader';
      const location = cleanText(req.body?.location, 60) || 'Koppa';
      const durationSec = Math.max(1, Math.min(3600, Math.round(Number(req.body?.durationSec) || 30)));

      const result = scoreQuizAttempt(quiz, answers);
      const entry: QuizLeaderboardEntry = {
        id: makeId('qscore'),
        quizId: quiz.id,
        playerName,
        location,
        score: result.score,
        total: result.total,
        durationSec,
        createdAt: new Date().toISOString(),
      };
      this.state.leaderboard.push(entry);
      if (this.state.leaderboard.length > 200) {
        this.state.leaderboard = sortLeaderboard(this.state.leaderboard).slice(0, 150);
      }
      this.saveState();

      res.json({
        ok: true,
        result,
        entry,
        leaderboard: sortLeaderboard(this.state.leaderboard).slice(0, 20),
      });
    });

    app.post('/api/platform/analytics/event', (req: Request, res: Response) => {
      const eventType = cleanText(req.body?.type, 40);
      const moduleName = cleanText(req.body?.module, 40);
      const searchTerm = cleanText(req.body?.searchTerm, 80).toLowerCase();
      const location = cleanText(req.body?.location, 60);
      const device = req.body?.device === 'mobile' ? 'mobile' : 'desktop';
      const sessionId = cleanText(req.body?.sessionId, 64);

      const visitorHash = hashVisitor(
        getClientIp(req),
        String(req.headers['user-agent'] || ''),
        sessionId || undefined
      );
      this.state.activeVisitors[visitorHash] = Date.now();

      const day = this.getOrCreateTodayAnalytics();
      if (!day.visitorHashes.includes(visitorHash)) {
        day.visitorHashes.push(visitorHash);
      }
      if (device === 'mobile') day.mobileEvents += 1;
      else day.desktopEvents += 1;

      if (eventType === 'page_view') {
        day.pageViews += 1;
        if (moduleName) {
          this.state.sectionVisits[moduleName] = (this.state.sectionVisits[moduleName] || 0) + 1;
        }
      } else if (eventType === 'whatsapp_share') {
        day.whatsappShares += 1;
      } else if (eventType === 'search' && searchTerm.length >= 2) {
        this.state.searchTerms[searchTerm] = (this.state.searchTerms[searchTerm] || 0) + 1;
      }

      if (location && location.toLowerCase() !== 'all') {
        this.state.locationActivity[location] = (this.state.locationActivity[location] || 0) + 1;
      }

      this.saveState();
      res.json({ ok: true });
    });

    // =========================================================
    // PROTECTED ADMIN 2.0 PLATFORM ROUTES
    // =========================================================

    app.get(
      '/api/admin2/platform/overview',
      this.authFactory('dashboard.view'),
      (_req: Admin2Request, res: Response) => {
        res.json({
          ok: true,
          analytics: this.buildAnalyticsSummary(),
          localities: this.state.localities,
          homepageSections: [...this.state.homepageSections].sort((a, b) => a.order - b.order),
          weatherConfig: this.state.weatherConfig,
        });
      }
    );

    app.get(
      '/api/admin2/platform/listings',
      this.authFactory('dashboard.view'),
      (req: Admin2Request, res: Response) => {
        const module = cleanText(req.query.module, 40);
        const status = cleanText(req.query.status, 30);
        const q = cleanText(req.query.q, 120).toLowerCase();

        let items = [...this.state.listings];
        if (module && module !== 'all') {
          items = items.filter((l) => l.module === module);
        }
        if (status && status !== 'all') {
          items = items.filter((l) => l.status === status);
        }
        if (q) {
          items = items.filter((l) =>
            `${l.title} ${l.titleEn || ''} ${l.location} ${l.category} ${l.summary}`
              .toLowerCase()
              .includes(q)
          );
        }

        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        res.json({ ok: true, total: items.length, listings: items });
      }
    );

    app.post(
      '/api/admin2/platform/listings',
      this.authFactory('news.create'),
      (req: Admin2Request, res: Response) => {
        const requestedStatus = (['approved', 'pending', 'rejected', 'expired', 'sold'].includes(
          String(req.body?.status || '')
        )
          ? String(req.body.status)
          : 'approved') as ListingStatus;
        const normalized = this.normalizeListingInput(
          (req.body || {}) as Record<string, unknown>,
          requestedStatus
        );
        if (!normalized.ok) {
          res.status(400).json({ ok: false, error: normalized.error });
          return;
        }
        const nowIso = new Date().toISOString();
        const listing: PlatformListing = {
          ...normalized.listing,
          id: makeId(normalized.listing.module.slice(0, 4)),
          views: 0,
          callClicks: 0,
          whatsappClicks: 0,
          applyClicks: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        this.state.listings.unshift(listing);
        this.saveState();
        res.status(201).json({ ok: true, listing });
      }
    );

    app.put(
      '/api/admin2/platform/listings/:id',
      this.authFactory('news.edit'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 120);
        const idx = this.state.listings.findIndex((l) => l.id === id);
        if (idx === -1) {
          res.status(404).json({ ok: false, error: 'Listing not found.' });
          return;
        }
        const existing = this.state.listings[idx];
        const status = (['approved', 'pending', 'rejected', 'expired', 'sold'].includes(
          String(req.body?.status || '')
        )
          ? String(req.body.status)
          : existing.status) as ListingStatus;
        const normalized = this.normalizeListingInput(
          { ...existing, ...(req.body || {}) },
          status
        );
        if (!normalized.ok) {
          res.status(400).json({ ok: false, error: normalized.error });
          return;
        }
        const updated: PlatformListing = {
          ...existing,
          ...normalized.listing,
          id: existing.id,
          views: existing.views,
          callClicks: existing.callClicks,
          whatsappClicks: existing.whatsappClicks,
          applyClicks: existing.applyClicks,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        };
        this.state.listings[idx] = updated;
        this.saveState();
        res.json({ ok: true, listing: updated });
      }
    );

    app.patch(
      '/api/admin2/platform/listings/:id/moderate',
      this.authFactory('news.edit'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 120);
        const item = this.state.listings.find((l) => l.id === id);
        if (!item) {
          res.status(404).json({ ok: false, error: 'Listing not found.' });
          return;
        }
        if (
          typeof req.body?.status === 'string' &&
          ['approved', 'pending', 'rejected', 'expired', 'sold'].includes(req.body.status)
        ) {
          item.status = req.body.status as ListingStatus;
        }
        if (typeof req.body?.verified === 'boolean') item.verified = req.body.verified;
        if (typeof req.body?.featured === 'boolean') item.featured = req.body.featured;
        if (
          typeof req.body?.grievanceStatus === 'string' &&
          ['open', 'in_review', 'resolved'].includes(req.body.grievanceStatus)
        ) {
          item.grievanceStatus = req.body.grievanceStatus as PlatformListing['grievanceStatus'];
        }
        item.updatedAt = new Date().toISOString();
        this.saveState();
        res.json({ ok: true, listing: item });
      }
    );

    app.delete(
      '/api/admin2/platform/listings/:id',
      this.authFactory('news.delete'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 120);
        const before = this.state.listings.length;
        this.state.listings = this.state.listings.filter((l) => l.id !== id);
        if (this.state.listings.length === before) {
          res.status(404).json({ ok: false, error: 'Listing not found.' });
          return;
        }
        this.saveState();
        res.json({ ok: true });
      }
    );

    // Homepage Sections Configurator
    app.get(
      '/api/admin2/platform/homepage-sections',
      this.authFactory('dashboard.view'),
      (_req: Admin2Request, res: Response) => {
        res.json({
          ok: true,
          sections: [...this.state.homepageSections].sort((a, b) => a.order - b.order),
        });
      }
    );

    app.put(
      '/api/admin2/platform/homepage-sections',
      this.authFactory('settings.manage'),
      (req: Admin2Request, res: Response) => {
        const incoming = Array.isArray(req.body?.sections) ? req.body.sections : null;
        if (!incoming || incoming.length === 0) {
          res.status(400).json({ ok: false, error: 'Sections array is required.' });
          return;
        }
        const cleaned: HomepageSectionConfig[] = incoming.map((s: Record<string, unknown>, idx: number) => ({
          id: cleanText(s.id, 60) || `sec-${idx + 1}`,
          module: cleanText(s.module, 40) as HomepageSectionConfig['module'],
          enabled: Boolean(s.enabled),
          order: Number.isFinite(Number(s.order)) ? Number(s.order) : idx + 1,
          titleKn: cleanText(s.titleKn, 140),
          titleEn: cleanText(s.titleEn, 140),
          descriptionKn: cleanText(s.descriptionKn, 260),
          descriptionEn: cleanText(s.descriptionEn, 260),
          maxItems: Math.min(Math.max(Number(s.maxItems) || 4, 1), 12),
        }));
        cleaned.sort((a, b) => a.order - b.order);
        this.state.homepageSections = cleaned;
        this.saveState();
        res.json({ ok: true, sections: cleaned });
      }
    );

    // Localities / Villages Manager
    app.get(
      '/api/admin2/platform/locations',
      this.authFactory('dashboard.view'),
      (_req: Admin2Request, res: Response) => {
        res.json({ ok: true, localities: this.state.localities });
      }
    );

    app.post(
      '/api/admin2/platform/locations',
      this.authFactory('settings.manage'),
      (req: Admin2Request, res: Response) => {
        const nameEn = cleanText(req.body?.nameEn, 80);
        const nameKn = cleanText(req.body?.nameKn, 80) || nameEn;
        const taluk = cleanText(req.body?.taluk, 80) || 'Koppa';
        if (nameEn.length < 2) {
          res.status(400).json({ ok: false, error: 'Locality English name is required.' });
          return;
        }
        const id = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || makeId('loc');
        if (this.state.localities.some((l) => l.id === id)) {
          res.status(409).json({ ok: false, error: 'Locality already exists.' });
          return;
        }
        const loc: LocalityOption = { id, nameEn, nameKn, taluk, active: true };
        this.state.localities.push(loc);
        this.saveState();
        res.status(201).json({ ok: true, locality: loc, localities: this.state.localities });
      }
    );

    app.delete(
      '/api/admin2/platform/locations/:id',
      this.authFactory('settings.manage'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 80);
        this.state.localities = this.state.localities.filter((l) => l.id !== id);
        this.saveState();
        res.json({ ok: true, localities: this.state.localities });
      }
    );

    // Quizzes & Games Manager
    app.get(
      '/api/admin2/platform/quizzes',
      this.authFactory('dashboard.view'),
      (_req: Admin2Request, res: Response) => {
        res.json({
          ok: true,
          quizzes: this.state.quizzes,
          leaderboard: sortLeaderboard(this.state.leaderboard).slice(0, 30),
        });
      }
    );

    app.post(
      '/api/admin2/platform/quizzes',
      this.authFactory('news.create'),
      (req: Admin2Request, res: Response) => {
        const titleKn = cleanText(req.body?.titleKn, 160);
        const titleEn = cleanText(req.body?.titleEn, 160) || titleKn;
        if (titleKn.length < 3) {
          res.status(400).json({ ok: false, error: 'Quiz title is required.' });
          return;
        }
        const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
        const questions = rawQuestions
          .filter((q: Record<string, unknown>) => cleanText(q.questionKn || q.questionEn, 300))
          .map((q: Record<string, unknown>, idx: number) => ({
            id: cleanText(q.id, 40) || `q-${idx + 1}`,
            questionKn: cleanText(q.questionKn || q.questionEn, 300),
            questionEn: cleanText(q.questionEn || q.questionKn, 300),
            options: Array.isArray(q.options)
              ? q.options.slice(0, 4).map((o: Record<string, unknown>) => ({
                  kn: cleanText(o?.kn || o?.en, 120),
                  en: cleanText(o?.en || o?.kn, 120),
                }))
              : [],
            correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
            explanationKn: cleanText(q.explanationKn, 260) || undefined,
            explanationEn: cleanText(q.explanationEn, 260) || undefined,
          }));
        const nowIso = new Date().toISOString();
        const quiz: PlatformQuiz = {
          id: makeId('quiz'),
          titleKn,
          titleEn,
          descriptionKn: cleanText(req.body?.descriptionKn, 260),
          descriptionEn: cleanText(req.body?.descriptionEn, 260),
          category: (['malnad', 'kannada', 'general', 'agriculture', 'daily'].includes(
            String(req.body?.category || '')
          )
            ? String(req.body.category)
            : 'malnad') as PlatformQuiz['category'],
          scheduleType: (['always', 'daily', 'weekly'].includes(String(req.body?.scheduleType || ''))
            ? String(req.body.scheduleType)
            : 'always') as PlatformQuiz['scheduleType'],
          active: req.body?.active !== false,
          questions,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        this.state.quizzes.unshift(quiz);
        this.saveState();
        res.status(201).json({ ok: true, quiz });
      }
    );

    app.put(
      '/api/admin2/platform/quizzes/:id',
      this.authFactory('news.edit'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 120);
        const quiz = this.state.quizzes.find((q) => q.id === id);
        if (!quiz) {
          res.status(404).json({ ok: false, error: 'Quiz not found.' });
          return;
        }
        if (typeof req.body?.active === 'boolean') quiz.active = req.body.active;
        if (typeof req.body?.titleKn === 'string') quiz.titleKn = cleanText(req.body.titleKn, 160);
        if (typeof req.body?.titleEn === 'string') quiz.titleEn = cleanText(req.body.titleEn, 160);
        if (typeof req.body?.descriptionKn === 'string') {
          quiz.descriptionKn = cleanText(req.body.descriptionKn, 260);
        }
        if (typeof req.body?.descriptionEn === 'string') {
          quiz.descriptionEn = cleanText(req.body.descriptionEn, 260);
        }
        if (
          typeof req.body?.scheduleType === 'string' &&
          ['always', 'daily', 'weekly'].includes(req.body.scheduleType)
        ) {
          quiz.scheduleType = req.body.scheduleType as PlatformQuiz['scheduleType'];
        }
        if (Array.isArray(req.body?.questions)) {
          quiz.questions = req.body.questions.map((q: Record<string, unknown>, idx: number) => ({
            id: cleanText(q.id, 40) || `q-${idx + 1}`,
            questionKn: cleanText(q.questionKn || q.questionEn, 300),
            questionEn: cleanText(q.questionEn || q.questionKn, 300),
            options: Array.isArray(q.options)
              ? q.options.slice(0, 4).map((o: Record<string, unknown>) => ({
                  kn: cleanText(o?.kn || o?.en, 120),
                  en: cleanText(o?.en || o?.kn, 120),
                }))
              : [],
            correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
            explanationKn: cleanText(q.explanationKn, 260) || undefined,
            explanationEn: cleanText(q.explanationEn, 260) || undefined,
          }));
        }
        quiz.updatedAt = new Date().toISOString();
        this.saveState();
        res.json({ ok: true, quiz });
      }
    );

    app.delete(
      '/api/admin2/platform/quizzes/:id',
      this.authFactory('news.delete'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 120);
        this.state.quizzes = this.state.quizzes.filter((q) => q.id !== id);
        this.saveState();
        res.json({ ok: true });
      }
    );

    // Reports Moderation
    app.get(
      '/api/admin2/platform/reports',
      this.authFactory('dashboard.view'),
      (_req: Admin2Request, res: Response) => {
        res.json({ ok: true, reports: this.state.reports });
      }
    );

    app.patch(
      '/api/admin2/platform/reports/:id',
      this.authFactory('news.edit'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 120);
        const rep = this.state.reports.find((r) => r.id === id);
        if (!rep) {
          res.status(404).json({ ok: false, error: 'Report not found.' });
          return;
        }
        const nextStatus = cleanText(req.body?.status, 24);
        if (['open', 'resolved', 'dismissed'].includes(nextStatus)) {
          rep.status = nextStatus as PlatformReport['status'];
          rep.resolvedAt = new Date().toISOString();
          rep.resolvedBy = req.admin2User?.email || 'admin';
        }
        this.saveState();
        res.json({ ok: true, report: rep });
      }
    );

    // Weather & Rainfall Logs
    app.get(
      '/api/admin2/platform/weather',
      this.authFactory('dashboard.view'),
      (_req: Admin2Request, res: Response) => {
        res.json({
          ok: true,
          config: this.state.weatherConfig,
          logs: [...this.state.weatherLogs].sort((a, b) => b.dateYmd.localeCompare(a.dateYmd)),
        });
      }
    );

    app.post(
      '/api/admin2/platform/weather/logs',
      this.authFactory('news.create'),
      (req: Admin2Request, res: Response) => {
        const location = cleanText(req.body?.location, 80) || 'Koppa';
        const dateYmd = cleanText(req.body?.dateYmd, 20) || getTodayYmd();
        const rainfallMm = Math.max(0, Math.min(2000, Number(req.body?.rainfallMm) || 0));
        const tempMinC =
          req.body?.tempMinC !== undefined && req.body?.tempMinC !== ''
            ? Number(req.body.tempMinC)
            : null;
        const tempMaxC =
          req.body?.tempMaxC !== undefined && req.body?.tempMaxC !== ''
            ? Number(req.body.tempMaxC)
            : null;
        const record: WeatherRainfallRecord = {
          id: makeId('rain'),
          location,
          dateYmd,
          rainfallMm,
          tempMinC: Number.isFinite(tempMinC) ? tempMinC : null,
          tempMaxC: Number.isFinite(tempMaxC) ? tempMaxC : null,
          conditionKn: cleanText(req.body?.conditionKn, 120) || 'ಮೋಡ ಕವಿದ ವಾತಾವರಣ',
          conditionEn: cleanText(req.body?.conditionEn, 120) || 'Cloudy / Rain',
          advisoryKn: cleanText(req.body?.advisoryKn, 260) || undefined,
          advisoryEn: cleanText(req.body?.advisoryEn, 260) || undefined,
          sourceAttribution: cleanText(req.body?.sourceAttribution, 140) || 'Coffeenadu Local Rain Gauge',
          updatedAt: new Date().toISOString(),
        };
        this.state.weatherLogs.unshift(record);
        this.saveState();
        res.status(201).json({ ok: true, log: record });
      }
    );

    app.delete(
      '/api/admin2/platform/weather/logs/:id',
      this.authFactory('news.delete'),
      (req: Admin2Request, res: Response) => {
        const id = cleanText(req.params.id, 120);
        this.state.weatherLogs = this.state.weatherLogs.filter((w) => w.id !== id);
        this.saveState();
        res.json({ ok: true });
      }
    );

    app.get(
      '/api/admin2/platform/export',
      this.authFactory('settings.manage'),
      (_req: Admin2Request, res: Response) => {
        res.json({
          ok: true,
          exportedAt: new Date().toISOString(),
          data: {
            localities: this.state.localities,
            homepageSections: this.state.homepageSections,
            listings: this.state.listings,
            quizzes: this.state.quizzes,
            weatherLogs: this.state.weatherLogs,
            reports: this.state.reports,
          },
        });
      }
    );
  }
}
