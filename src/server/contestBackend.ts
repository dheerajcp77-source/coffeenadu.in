import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { AdminPermission } from '../types/admin2';
import type {
  AdminContestEntryView,
  ContestAdminOverview,
  ContestAuditLogRecord,
  ContestEntryEligibility,
  ContestEntryRecord,
  ContestMonthRecord,
  ContestMonthStatus,
  ContestPrizeTier,
  ContestPublicOverview,
  ContestSuspiciousAlert,
  ContestViewRecordResult,
  ContestWinnerRecord,
  PublicContestEntry,
  PublicContestWinner,
} from '../types/contest';
import {
  CONTEST_KANNADA_HEADING,
  CONTEST_KANNADA_SUBTITLE,
  CONTEST_OFFICIAL_NAME,
  CONTEST_PUBLIC_URL,
  CONTEST_TARGET_AREA,
  ROLLING_VIEW_WINDOW_MS,
  createDefaultContestPrizes,
  createDefaultMonthRecord,
  createInitialContestMonthRecord,
  detectSuspiciousTrafficPattern,
  getIstMonthBounds,
  getIstMonthKey,
  getNextIstMonthKey,
  isContestMonthOpen,
  isEligibleRolling24hVisit,
  isLikelyBotUserAgent,
  normalizeContestPrizes,
  rankEligibleContestEntries,
  toPublicContestEntry,
  toPublicContestWinner,
} from '../utils/contestHelpers';
import type { CommunityBackend } from './communityBackend';

interface ContestViewBucketRecord {
  entryId: string;
  visitorHash: string;
  lastEligibleAtMs: number;
  hitCount: number;
}

interface ContestStoreState {
  version: 1;
  activeMonthKey: string;
  months: ContestMonthRecord[];
  entries: ContestEntryRecord[];
  viewBuckets: ContestViewBucketRecord[];
  alerts: ContestSuspiciousAlert[];
  auditLogs: ContestAuditLogRecord[];
}

interface RateHitSample {
  ts: number;
  visitorHash: string;
}

const VISITOR_COOKIE_NAME = 'cn_contest_vid';
const VISITOR_COOKIE_TTL_SEC = 180 * 24 * 60 * 60; // 180 days
const MAX_STORED_VIEW_BUCKETS = 30_000;
const MAX_AUDIT_LOGS = 500;
const MAX_ALERTS = 300;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function cleanSingleLine(raw: unknown, maxLen = 220): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function parseCookies(req: Request): Record<string, string> {
  const header = String(req.headers.cookie || '');
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class ContestBackend {
  private readonly storePath: string;
  private readonly backupPath: string;
  private readonly hmacSecret: string;
  private state: ContestStoreState;
  private readonly ipEntrySamples = new Map<string, RateHitSample[]>();
  private readonly articleSamples = new Map<string, number[]>();
  private readonly ipBucketTracker = new Map<string, number[]>();

  constructor(
    dataDir: string,
    private readonly communityBackend: CommunityBackend,
    private readonly authFactory: (permission?: AdminPermission) => RequestHandler
  ) {
    this.storePath = path.join(dataDir, 'contest-store.json');
    this.backupPath = path.join(dataDir, 'contest-store.bak.json');
    this.hmacSecret =
      (process.env.CONTEST_HASH_SECRET || process.env.SESSION_SECRET || '').trim() ||
      `coffeenadu-contest-${crypto.createHash('sha256').update(dataDir).digest('hex').slice(0, 24)}`;
    this.state = this.loadState();
    this.ensureActiveMonthSynced();
    this.communityBackend.onPostDeleted((postId) => {
      this.handlePostDeleted(postId);
    });
  }

  private handlePostDeleted(postId: string): void {
    const before = this.state.entries.length;
    this.state.entries = this.state.entries.filter((entry) => {
      if (entry.postId !== postId) return true;
      const month = this.state.months.find((m) => m.monthKey === entry.competitionMonth);
      // Preserve finalized month records for audit history, mark disqualified
      if (month?.status === 'finalized') {
        entry.eligibility = 'disqualified';
        entry.disqualificationReason = entry.disqualificationReason || 'Source post deleted';
        entry.updatedAt = new Date().toISOString();
        return true;
      }
      return false;
    });
    if (this.state.entries.length !== before || before > 0) {
      this.persistState();
    }
  }

  private createDefaultState(): ContestStoreState {
    const initialMonth = createInitialContestMonthRecord();
    return {
      version: 1,
      activeMonthKey: initialMonth.monthKey,
      months: [initialMonth],
      entries: [],
      viewBuckets: [],
      alerts: [],
      auditLogs: [],
    };
  }

  private loadState(): ContestStoreState {
    const tryRead = (filePath: string): ContestStoreState | null => {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw.trim()) return null;
      const parsed = JSON.parse(raw) as Partial<ContestStoreState>;
      if (!parsed || typeof parsed !== 'object') return null;
      const months =
        Array.isArray(parsed.months) && parsed.months.length > 0
          ? parsed.months
          : [createInitialContestMonthRecord()];
      const activeMonthKey =
        typeof parsed.activeMonthKey === 'string' &&
        months.some((m) => m.monthKey === parsed.activeMonthKey)
          ? parsed.activeMonthKey
          : months[0].monthKey;
      return {
        version: 1,
        activeMonthKey,
        months,
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        viewBuckets: Array.isArray(parsed.viewBuckets) ? parsed.viewBuckets : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      };
    };

    try {
      const primary = tryRead(this.storePath);
      if (primary) return primary;
    } catch {
      // fallback to backup
    }
    try {
      const backup = tryRead(this.backupPath);
      if (backup) return backup;
    } catch {
      // fallback to default
    }
    return this.createDefaultState();
  }

  private persistState(): void {
    const dir = path.dirname(this.storePath);
    fs.mkdirSync(dir, { recursive: true });

    const cutoffMs = Date.now() - 45 * 24 * 60 * 60 * 1000;
    if (this.state.viewBuckets.length > MAX_STORED_VIEW_BUCKETS) {
      this.state.viewBuckets = this.state.viewBuckets
        .filter((b) => b.lastEligibleAtMs >= cutoffMs)
        .slice(-MAX_STORED_VIEW_BUCKETS);
    }

    const serialized = JSON.stringify(this.state, null, 2);
    if (fs.existsSync(this.storePath)) {
      try {
        fs.copyFileSync(this.storePath, this.backupPath);
      } catch {
        // non-fatal
      }
    }
    const tmp = `${this.storePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, serialized, 'utf8');
    fs.renameSync(tmp, this.storePath);
  }

  private hashVisitor(rawValue: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(rawValue)
      .digest('hex')
      .slice(0, 32);
  }

  private isSecureRequest(req: Request): boolean {
    const fwdProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
    return req.secure || fwdProto.includes('https');
  }

  private resolveOrMintVisitorCookie(req: Request, res: Response): string {
    const cookies = parseCookies(req);
    const existing = cookies[VISITOR_COOKIE_NAME];
    if (existing && /^[a-f0-9]{24,64}$/i.test(existing)) {
      return existing;
    }
    const freshId = crypto.randomBytes(16).toString('hex');
    const secure = this.isSecureRequest(req);
    const parts = [
      `${VISITOR_COOKIE_NAME}=${freshId}`,
      'Path=/',
      `Max-Age=${VISITOR_COOKIE_TTL_SEC}`,
      'HttpOnly',
      secure ? 'SameSite=None' : 'SameSite=Lax',
    ];
    if (secure) {
      parts.push('Secure', 'Partitioned');
    }
    res.append('Set-Cookie', parts.join('; '));
    return freshId;
  }

  private getAdminActorEmail(req: Request): string {
    const anyReq = req as Request & { adminUser?: { email?: string } };
    return anyReq.adminUser?.email || 'admin@coffeenadu.in';
  }

  private appendAuditLog(
    actorEmail: string,
    action: string,
    details: string,
    competitionMonth: string,
    targetId?: string
  ): void {
    this.state.auditLogs.unshift({
      id: makeId('caud'),
      timestamp: new Date().toISOString(),
      actorEmail,
      action,
      competitionMonth,
      targetId,
      details,
    });
    if (this.state.auditLogs.length > MAX_AUDIT_LOGS) {
      this.state.auditLogs = this.state.auditLogs.slice(0, MAX_AUDIT_LOGS);
    }
  }

  private ensureActiveMonthSynced(now = new Date()): ContestMonthRecord {
    let changed = false;
    const nowMs = now.getTime();

    // If the empty initial Nov 2026 bootstrap month exists with zero submissions/winners,
    // extend it through Dec 31, 2026 so contributors have a full December window.
    if (
      this.state.months.length === 1 &&
      this.state.activeMonthKey === '2026-11' &&
      this.state.months[0].monthKey === '2026-11' &&
      this.state.months[0].endsAtIso === '2026-11-30T23:59:59+05:30' &&
      !this.state.months[0].winnersPublished &&
      this.state.months[0].winners.length === 0 &&
      this.state.entries.length === 0
    ) {
      const extended = createInitialContestMonthRecord(now);
      this.state.months[0] = {
        ...this.state.months[0],
        monthKey: extended.monthKey,
        displayLabelEn: extended.displayLabelEn,
        displayLabelKn: extended.displayLabelKn,
        startsAtIso: extended.startsAtIso,
        endsAtIso: extended.endsAtIso,
        status: 'open',
        updatedAt: now.toISOString(),
      };
      this.state.activeMonthKey = extended.monthKey;
      changed = true;
    }

    for (const month of this.state.months) {
      if (month.status === 'open' && nowMs > Date.parse(month.endsAtIso)) {
        month.status = 'closed';
        month.updatedAt = now.toISOString();
        changed = true;
      }
    }

    let active = this.state.months.find((m) => m.monthKey === this.state.activeMonthKey);
    if (!active) {
      const currentKey = getIstMonthKey(now);
      active = this.state.months.find((m) => m.monthKey === currentKey);
      if (!active) {
        active = createInitialContestMonthRecord(now);
        this.state.months.unshift(active);
      }
      this.state.activeMonthKey = active.monthKey;
      changed = true;
    }

    if (changed) {
      this.persistState();
    }
    return active;
  }

  private syncEntryMetaWithPost(entry: ContestEntryRecord): ContestEntryRecord {
    const post = this.communityBackend.getInternalPostByIdOrSlug(entry.postId);
    if (!post) return entry;
    let dirty = false;
    if (post.title !== entry.title) {
      entry.title = post.title;
      dirty = true;
    }
    if (post.authorName !== entry.contributorName) {
      entry.contributorName = post.authorName;
      dirty = true;
    }
    if (post.location !== entry.location) {
      entry.location = post.location;
      dirty = true;
    }
    const nextSummary = post.description.slice(0, 220);
    if (nextSummary !== entry.summary) {
      entry.summary = nextSummary;
      dirty = true;
    }
    const nextThumb = post.photos?.[0] || undefined;
    if (nextThumb !== entry.thumbnailUrl) {
      entry.thumbnailUrl = nextThumb;
      dirty = true;
    }
    if (post.status !== 'published' && entry.eligibility === 'eligible') {
      entry.eligibility = 'disqualified';
      entry.disqualificationReason =
        entry.disqualificationReason || 'Removed or hidden by moderator';
      dirty = true;
    }
    if (dirty) {
      entry.updatedAt = new Date().toISOString();
    }
    return entry;
  }

  private getEntriesForMonth(monthKey: string): ContestEntryRecord[] {
    return this.state.entries
      .filter((e) => e.competitionMonth === monthKey)
      .map((e) => this.syncEntryMetaWithPost(e));
  }

  private buildPublicOverview(now = new Date()): ContestPublicOverview {
    const activeMonth = this.ensureActiveMonthSynced(now);
    const monthEntries = this.getEntriesForMonth(activeMonth.monthKey);
    const publicEntries: PublicContestEntry[] = rankEligibleContestEntries(monthEntries);
    const topFour = publicEntries.slice(0, 4);

    const publishedWinners: PublicContestWinner[] = activeMonth.winnersPublished
      ? [...activeMonth.winners]
          .sort((a, b) => a.rank - b.rank)
          .map((w) => toPublicContestWinner(w))
      : [];

    const fifthQualityWinner =
      publishedWinners.find((w) => w.prizeType === 'quality') || null;

    const totalBudgetInr = activeMonth.prizes.reduce((s, p) => s + p.amountInr, 0);

    const previousMonths = this.state.months
      .filter((m) => m.winnersPublished && m.winners.length > 0)
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((m) => ({
        monthKey: m.monthKey,
        displayLabelEn: m.displayLabelEn,
        displayLabelKn: m.displayLabelKn,
        status: m.status,
        winners: [...m.winners]
          .sort((a, b) => a.rank - b.rank)
          .map((w) => toPublicContestWinner(w)),
      }));

    return {
      competitionName: CONTEST_OFFICIAL_NAME,
      kannadaHeading: CONTEST_KANNADA_HEADING,
      kannadaSubtitle: CONTEST_KANNADA_SUBTITLE,
      targetArea: CONTEST_TARGET_AREA,
      contestUrl: CONTEST_PUBLIC_URL,
      activeMonth: {
        monthKey: activeMonth.monthKey,
        displayLabelEn: activeMonth.displayLabelEn,
        displayLabelKn: activeMonth.displayLabelKn,
        startsAtIso: activeMonth.startsAtIso,
        endsAtIso: activeMonth.endsAtIso,
        status: activeMonth.status,
        isAcceptingEntries: isContestMonthOpen(activeMonth, now.getTime()),
        totalBudgetInr,
        prizes: activeMonth.prizes,
        winnersPublished: activeMonth.winnersPublished,
        publishedWinners,
      },
      topFour,
      fifthQualityWinner,
      allEligibleEntries: publicEntries,
      totalEligibleCount: publicEntries.length,
      previousMonths,
      serverNowIso: now.toISOString(),
    };
  }

  private buildAdminOverview(requestedMonthKey?: string): ContestAdminOverview {
    const activeMonth = this.ensureActiveMonthSynced();
    const selectedMonth =
      (requestedMonthKey &&
        this.state.months.find((m) => m.monthKey === requestedMonthKey)) ||
      activeMonth;

    const monthEntries = this.getEntriesForMonth(selectedMonth.monthKey).sort((a, b) => {
      if (a.eligibility !== b.eligibility) {
        return a.eligibility === 'eligible' ? -1 : 1;
      }
      if (b.eligibleViews !== a.eligibleViews) {
        return b.eligibleViews - a.eligibleViews;
      }
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });

    const monthEntryIds = new Set(monthEntries.map((e) => e.id));
    const alerts = this.state.alerts.filter(
      (a) => a.competitionMonth === selectedMonth.monthKey || monthEntryIds.has(a.entryId)
    );

    const entriesWithMobile: AdminContestEntryView[] = monthEntries.map((entry) => {
      const post = this.communityBackend.getInternalPostByIdOrSlug(entry.postId);
      const openAlertsCount = alerts.filter(
        (a) => a.entryId === entry.id && a.status === 'open'
      ).length;
      return {
        ...entry,
        contributorMobileNumber: this.communityBackend.getPrivateMobileByUserId(
          entry.contributorUserId
        ),
        postStatus: post?.status || 'published',
        openAlertsCount,
      };
    });

    const eligibleEntries = entriesWithMobile.filter((e) => e.eligibility === 'eligible').length;
    const disqualifiedEntries = entriesWithMobile.filter(
      (e) => e.eligibility === 'disqualified'
    ).length;
    const totalEligibleViews = entriesWithMobile.reduce((s, e) => s + (e.eligibleViews || 0), 0);
    const totalPageViews = entriesWithMobile.reduce((s, e) => s + (e.totalPageViews || 0), 0);
    const suspiciousBlockedViews = entriesWithMobile.reduce(
      (s, e) => s + (e.suspiciousBlockedViews || 0),
      0
    );
    const openAlerts = alerts.filter((a) => a.status === 'open').length;

    const monthsSorted = [...this.state.months].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );

    return {
      activeMonthKey: activeMonth.monthKey,
      months: monthsSorted,
      selectedMonth,
      entries: entriesWithMobile,
      alerts,
      auditLogs: this.state.auditLogs.slice(0, 120),
      summary: {
        totalEntries: entriesWithMobile.length,
        eligibleEntries,
        disqualifiedEntries,
        totalPageViews,
        totalEligibleViews,
        suspiciousBlockedViews,
        openAlerts,
      },
    };
  }

  private findEntryBySlugOrId(slugOrId: string): ContestEntryRecord | null {
    const key = String(slugOrId || '').trim().toLowerCase();
    if (!key) return null;
    const entry = this.state.entries.find(
      (e) =>
        e.id.toLowerCase() === key ||
        e.postId.toLowerCase() === key ||
        e.slug.toLowerCase() === key
    );
    return entry ? this.syncEntryMetaWithPost(entry) : null;
  }

  private isAdminPreviewRequest(req: Request): boolean {
    if (String(req.query.preview || '') === '1') return true;
    if (String(req.headers['x-admin-preview'] || '') === '1') return true;
    const auth = String(req.headers.authorization || '').trim();
    if (
      auth.toLowerCase().startsWith('bearer ') &&
      String(req.headers['x-contest-admin-view'] || '') === '1'
    ) {
      return true;
    }
    return false;
  }

  private checkSimpleIpRate(bucketKey: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const list = (this.ipBucketTracker.get(bucketKey) || []).filter(
      (ts) => now - ts < windowMs
    );
    if (list.length >= maxRequests) {
      this.ipBucketTracker.set(bucketKey, list);
      return false;
    }
    list.push(now);
    this.ipBucketTracker.set(bucketKey, list);
    return true;
  }

  public mountRoutes(app: Express): void {
    // -------------------------------------------------------------------------
    // PUBLIC CONTEST OVERVIEW & LEADERBOARD (STRICT PRIVACY WALL, ZERO ADS)
    // -------------------------------------------------------------------------
    app.get('/api/public/contest/overview', (_req, res) => {
      res.json({ ok: true, ...this.buildPublicOverview(new Date()) });
    });

    app.get('/api/public/contest/entries/:slugOrId', (req, res) => {
      const entry = this.findEntryBySlugOrId(req.params.slugOrId);
      if (!entry) {
        res.status(404).json({ ok: false, error: 'Contest entry not found.' });
        return;
      }
      const month = this.state.months.find((m) => m.monthKey === entry.competitionMonth);
      res.json({
        ok: true,
        entry: toPublicContestEntry(entry),
        monthLabelEn: month?.displayLabelEn || entry.competitionMonth,
        monthLabelKn: month?.displayLabelKn || entry.competitionMonth,
        monthStatus: month?.status || 'closed',
        isMonthOpen: month ? isContestMonthOpen(month) : false,
      });
    });

    // -------------------------------------------------------------------------
    // SECURE SERVER-SIDE VIEW COUNTER (ROLLING 24H DEDUPE + ANTI-ABUSE)
    // -------------------------------------------------------------------------
    app.post('/api/public/contest/entries/:slugOrId/view', (req, res) => {
      const entry = this.findEntryBySlugOrId(req.params.slugOrId);
      if (!entry) {
        res.status(404).json({ ok: false, error: 'Contest entry not found.' });
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();
      const month = this.state.months.find((m) => m.monthKey === entry.competitionMonth);

      const respond = (
        countedEligible: boolean,
        countedReason: ContestViewRecordResult['countedReason']
      ) => {
        const payload: ContestViewRecordResult = {
          ok: true,
          entryId: entry.id,
          slug: entry.slug,
          competitionMonth: entry.competitionMonth,
          countedEligible,
          countedReason,
          eligibleViews: entry.eligibleViews,
          totalPageViews: entry.totalPageViews,
        };
        res.json(payload);
      };

      // 1. Exclude admin previews completely
      if (this.isAdminPreviewRequest(req)) {
        respond(false, 'admin_excluded');
        return;
      }

      // 2. Exclude bots & crawlers
      const userAgent = String(req.headers['user-agent'] || '');
      if (isLikelyBotUserAgent(userAgent)) {
        entry.suspiciousBlockedViews = (entry.suspiciousBlockedViews || 0) + 1;
        this.persistState();
        respond(false, 'bot_filtered');
        return;
      }

      // 3. Record genuine page load in totalPageViews
      entry.totalPageViews = (entry.totalPageViews || 0) + 1;
      entry.lastViewedAt = now.toISOString();
      entry.updatedAt = now.toISOString();
      this.communityBackend.syncContestPostTotalViews(entry.postId, entry.totalPageViews);

      // 4. Stop counting eligible views if disqualified or deadline passed
      if (entry.eligibility !== 'eligible') {
        this.persistState();
        respond(false, 'disqualified');
        return;
      }
      if (!month || !isContestMonthOpen(month, nowMs)) {
        if (month && month.status === 'open' && nowMs > Date.parse(month.endsAtIso)) {
          month.status = 'closed';
          month.updatedAt = now.toISOString();
        }
        this.persistState();
        respond(false, 'month_closed');
        return;
      }

      // 5. Privacy-conscious visitor identity: HttpOnly cookie + salted HMAC-SHA256 fingerprint
      const cookieId = this.resolveOrMintVisitorCookie(req, res);
      const clientIp = getClientIp(req);
      const ipHash = this.hashVisitor(`ip:${clientIp}`);
      const uaHash = this.hashVisitor(`ua:${userAgent.slice(0, 120)}`);
      const visitorHash = this.hashVisitor(`vid:${cookieId}:${ipHash}:${uaHash}`);
      const deviceFallbackHash = this.hashVisitor(`dev:${ipHash}:${uaHash}`);

      // 6. Burst & cookie-rotation spike detection
      const ipEntryKey = `${entry.id}:${ipHash}`;
      const ipSamples = (this.ipEntrySamples.get(ipEntryKey) || []).filter(
        (s) => nowMs - s.ts < 15 * 60 * 1000
      );
      ipSamples.push({ ts: nowMs, visitorHash });
      this.ipEntrySamples.set(ipEntryKey, ipSamples);

      const ipHitsLast10m = ipSamples.filter((s) => nowMs - s.ts < 10 * 60 * 1000).length;
      const distinctVisitorsFromSameIpLast15m = new Set(
        ipSamples.map((s) => s.visitorHash)
      ).size;

      const artSamples = (this.articleSamples.get(entry.id) || []).filter(
        (ts) => nowMs - ts < 5 * 60 * 1000
      );
      artSamples.push(nowMs);
      this.articleSamples.set(entry.id, artSamples);

      const suspicious = detectSuspiciousTrafficPattern({
        ipHitsOnArticleLast10m: ipHitsLast10m,
        distinctVisitorsFromSameIpLast15m,
        articleTotalHitsLast5m: artSamples.length,
      });

      if (suspicious?.suspicious) {
        entry.suspiciousBlockedViews = (entry.suspiciousBlockedViews || 0) + 1;
        entry.suspiciousFlagged = true;

        const recentSameAlert = this.state.alerts.find(
          (a) =>
            a.entryId === entry.id &&
            a.status === 'open' &&
            nowMs - Date.parse(a.detectedAt) < 15 * 60 * 1000
        );
        if (recentSameAlert) {
          recentSameAlert.blockedCount += 1;
        } else {
          this.state.alerts.unshift({
            id: makeId('calert'),
            entryId: entry.id,
            articleSlug: entry.slug,
            articleTitle: entry.title,
            competitionMonth: entry.competitionMonth,
            severity: suspicious.severity,
            reason: suspicious.reason,
            blockedCount: 1,
            detectedAt: now.toISOString(),
            status: 'open',
          });
          if (this.state.alerts.length > MAX_ALERTS) {
            this.state.alerts = this.state.alerts.slice(0, MAX_ALERTS);
          }
        }
        this.persistState();
        respond(false, 'suspicious_blocked');
        return;
      }

      // 7. Rolling 24-hour deduplication (max 1 eligible view per visitor per article per 24h)
      const existingBucket = this.state.viewBuckets.find(
        (b) =>
          b.entryId === entry.id &&
          (b.visitorHash === visitorHash || b.visitorHash === deviceFallbackHash)
      );

      if (
        existingBucket &&
        !isEligibleRolling24hVisit(
          existingBucket.lastEligibleAtMs,
          nowMs,
          ROLLING_VIEW_WINDOW_MS
        )
      ) {
        existingBucket.hitCount += 1;
        this.persistState();
        respond(false, 'duplicate_24h');
        return;
      }

      // Eligible unique view!
      entry.eligibleViews = (entry.eligibleViews || 0) + 1;
      if (existingBucket) {
        existingBucket.lastEligibleAtMs = nowMs;
        existingBucket.hitCount += 1;
      } else {
        this.state.viewBuckets.push(
          {
            entryId: entry.id,
            visitorHash,
            lastEligibleAtMs: nowMs,
            hitCount: 1,
          },
          {
            entryId: entry.id,
            visitorHash: deviceFallbackHash,
            lastEligibleAtMs: nowMs,
            hitCount: 1,
          }
        );
      }

      this.persistState();
      respond(true, 'counted');
    });

    // -------------------------------------------------------------------------
    // PUBLIC CONTEST NEWS SUBMISSION (REUSES EXISTING COMMUNITY USER & POST STORE)
    // -------------------------------------------------------------------------
    app.post('/api/public/contest/submit', (req, res) => {
      const ip = getClientIp(req);
      if (!this.checkSimpleIpRate(`csub:${ip}`, 15, 60 * 60 * 1000)) {
        res.status(429).json({
          ok: false,
          error: 'ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        });
        return;
      }

      const now = new Date();
      const activeMonth = this.ensureActiveMonthSynced(now);
      if (!isContestMonthOpen(activeMonth, now.getTime())) {
        res.status(400).json({
          ok: false,
          error:
            'ಈ ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆಯ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ. ಮುಂದಿನ ತಿಂಗಳ ಸ್ಪರ್ಧೆ ಆರಂಭವಾದಾಗ ದಯವಿಟ್ಟು ಪ್ರಕಟಿಸಿ.',
        });
        return;
      }

      if (req.body?.confirmOriginalNews !== true) {
        res.status(400).json({
          ok: false,
          error:
            'ದಯವಿಟ್ಟು ಇದು ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಯಾಗಿದ್ದು ಜಾಹೀರಾತು/ಮಾರಾಟ/ಕಳೆದುಹೋದ ವಸ್ತು ಪ್ರಕಟಣೆಯಲ್ಲ ಎಂದು ದೃಢೀಕರಿಸಿ.',
        });
        return;
      }

      const contributorRes = this.communityBackend.resolveOrRegisterContestContributor(
        req,
        res,
        {
          fullName: req.body?.contributorName,
          mobileNumber: req.body?.mobileNumber,
          switchContributor: req.body?.switchContributor === true,
        }
      );
      if (!contributorRes.ok) {
        res.status(contributorRes.status).json({
          ok: false,
          error: contributorRes.error,
        });
        return;
      }

      const postRes = this.communityBackend.createContestPostInternal(
        req,
        contributorRes.user,
        {
          title: req.body?.title,
          description: req.body?.description,
          location: req.body?.location,
          photos: req.body?.photos,
          contributorName: req.body?.contributorName,
        }
      );
      if (!postRes.ok) {
        res.status(postRes.status).json({
          ok: false,
          error: postRes.error,
        });
        return;
      }

      let entry = this.state.entries.find((e) => e.postId === postRes.post.id);
      if (!entry) {
        const nowIso = now.toISOString();
        entry = {
          id: makeId('centry'),
          postId: postRes.post.id,
          slug: postRes.post.slug,
          competitionMonth: activeMonth.monthKey,
          contributorUserId: contributorRes.user.id,
          contributorName: postRes.post.authorName,
          title: postRes.post.title,
          summary: postRes.post.description.slice(0, 220),
          location: postRes.post.location,
          thumbnailUrl: postRes.post.photos?.[0] || undefined,
          publishedAt: postRes.post.createdAt,
          eligibility: 'eligible',
          totalPageViews: 0,
          eligibleViews: 0,
          suspiciousBlockedViews: 0,
          suspiciousFlagged: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        this.state.entries.unshift(entry);
        this.persistState();
      }

      res.status(postRes.duplicatePrevented ? 200 : 201).json({
        ok: true,
        duplicatePrevented: Boolean(postRes.duplicatePrevented),
        token: contributorRes.token,
        profile: contributorRes.profile,
        post: postRes.publicPost,
        entry: toPublicContestEntry(entry),
        permanentPath: `/community/${encodeURIComponent(postRes.post.slug)}`,
      });
    });

    // -------------------------------------------------------------------------
    // ADMIN DASHBOARD — MONTHLY REWARDS MANAGEMENT (PROTECTED + AUDIT LOGGED)
    // -------------------------------------------------------------------------
    app.get(
      '/api/admin2/contest/overview',
      this.authFactory('dashboard.view'),
      (req, res) => {
        const monthParam =
          typeof req.query.month === 'string' ? req.query.month.trim() : undefined;
        res.json({ ok: true, ...this.buildAdminOverview(monthParam) });
      }
    );

    app.patch(
      '/api/admin2/contest/entries/:id/eligibility',
      this.authFactory('news.edit'),
      (req, res) => {
        const entry = this.state.entries.find((e) => e.id === req.params.id);
        if (!entry) {
          res.status(404).json({ ok: false, error: 'Contest entry not found.' });
          return;
        }
        const eligibility: ContestEntryEligibility =
          req.body?.eligibility === 'disqualified' ? 'disqualified' : 'eligible';
        const reason = cleanSingleLine(req.body?.reason, 240);

        if (eligibility === 'disqualified' && reason.length < 3) {
          res.status(400).json({
            ok: false,
            error: 'Please enter a brief disqualification reason for the audit record.',
          });
          return;
        }

        const actor = this.getAdminActorEmail(req);
        const nowIso = new Date().toISOString();
        entry.eligibility = eligibility;
        entry.disqualificationReason = eligibility === 'disqualified' ? reason : undefined;
        entry.disqualifiedBy = eligibility === 'disqualified' ? actor : undefined;
        entry.disqualifiedAt = eligibility === 'disqualified' ? nowIso : undefined;
        entry.updatedAt = nowIso;

        this.appendAuditLog(
          actor,
          eligibility === 'disqualified' ? 'entry.disqualify' : 'entry.reinstate',
          `${eligibility === 'disqualified' ? 'Disqualified' : 'Reinstated'} "${entry.title}"${
            reason ? ` (${reason})` : ''
          }`,
          entry.competitionMonth,
          entry.id
        );
        this.persistState();

        res.json({ ok: true, entry });
      }
    );

    app.patch(
      '/api/admin2/contest/alerts/:id',
      this.authFactory('security.view'),
      (req, res) => {
        const alert = this.state.alerts.find((a) => a.id === req.params.id);
        if (!alert) {
          res.status(404).json({ ok: false, error: 'Suspicious alert not found.' });
          return;
        }
        const status =
          req.body?.status === 'dismissed'
            ? 'dismissed'
            : req.body?.status === 'investigated'
            ? 'investigated'
            : 'open';
        const adminNote = cleanSingleLine(req.body?.adminNote, 240);
        const actor = this.getAdminActorEmail(req);

        alert.status = status;
        alert.adminNote = adminNote || alert.adminNote;
        alert.reviewedBy = actor;
        alert.reviewedAt = new Date().toISOString();

        this.appendAuditLog(
          actor,
          'alert.review',
          `Marked suspicious traffic alert for "${alert.articleTitle}" as ${status}`,
          alert.competitionMonth,
          alert.id
        );
        this.persistState();
        res.json({ ok: true, alert });
      }
    );

    app.put(
      '/api/admin2/contest/months/:monthKey/config',
      this.authFactory('settings.manage'),
      (req, res) => {
        const month = this.state.months.find((m) => m.monthKey === req.params.monthKey);
        if (!month) {
          res.status(404).json({ ok: false, error: 'Competition month not found.' });
          return;
        }

        const startsAtIso = String(req.body?.startsAtIso || month.startsAtIso).trim();
        const endsAtIso = String(req.body?.endsAtIso || month.endsAtIso).trim();
        if (
          !Number.isFinite(Date.parse(startsAtIso)) ||
          !Number.isFinite(Date.parse(endsAtIso)) ||
          Date.parse(endsAtIso) <= Date.parse(startsAtIso)
        ) {
          res.status(400).json({
            ok: false,
            error: 'End date must be strictly after start date.',
          });
          return;
        }

        const nextPrizes: ContestPrizeTier[] = normalizeContestPrizes(
          req.body?.prizes ?? month.prizes
        );
        const allowedStatuses: ContestMonthStatus[] = ['open', 'closed', 'finalized'];
        const requestedStatus = allowedStatuses.includes(req.body?.status)
          ? (req.body.status as ContestMonthStatus)
          : month.status;

        month.startsAtIso = startsAtIso;
        month.endsAtIso = endsAtIso;
        month.prizes = nextPrizes;
        month.status = requestedStatus;
        month.allowCarryOver = Boolean(req.body?.allowCarryOver);
        month.updatedAt = new Date().toISOString();

        const budget = nextPrizes.reduce((s, p) => s + p.amountInr, 0);
        const actor = this.getAdminActorEmail(req);
        this.appendAuditLog(
          actor,
          'month.config',
          `Updated ${month.displayLabelEn} dates/prizes (Budget: ₹${budget}, Status: ${month.status})`,
          month.monthKey
        );
        this.persistState();
        res.json({ ok: true, month });
      }
    );

    app.put(
      '/api/admin2/contest/months/:monthKey/winners',
      this.authFactory('news.publish'),
      (req, res) => {
        const month = this.state.months.find((m) => m.monthKey === req.params.monthKey);
        if (!month) {
          res.status(404).json({ ok: false, error: 'Competition month not found.' });
          return;
        }

        const rawWinners = Array.isArray(req.body?.winners) ? req.body.winners : [];
        const actor = this.getAdminActorEmail(req);
        const nowIso = new Date().toISOString();
        const updatedWinners: ContestWinnerRecord[] = [];
        const defaultPrizes = createDefaultContestPrizes();

        for (const item of rawWinners) {
          const rank = Number(item?.rank);
          if (![1, 2, 3, 4, 5].includes(rank)) continue;
          const entryId = String(item?.entryId || '').trim();
          const entry = this.state.entries.find(
            (e) => e.id === entryId && e.competitionMonth === month.monthKey
          );
          if (!entry) continue;

          const tier =
            month.prizes.find((p) => p.rank === rank) || defaultPrizes[rank - 1];
          const amountInr = Number.isFinite(Number(item?.prizeAmountInr))
            ? Math.max(0, Math.round(Number(item.prizeAmountInr)))
            : tier.amountInr;

          const paymentStatus =
            item?.paymentStatus === 'paid'
              ? 'paid'
              : item?.paymentStatus === 'processing'
              ? 'processing'
              : 'pending';

          updatedWinners.push({
            rank: rank as 1 | 2 | 3 | 4 | 5,
            prizeType: rank === 5 ? 'quality' : 'views',
            prizeLabelEn: tier.labelEn,
            prizeLabelKn: tier.labelKn,
            prizeAmountInr: amountInr,
            entryId: entry.id,
            postId: entry.postId,
            articleSlug: entry.slug,
            articleTitle: entry.title,
            contributorName: entry.contributorName,
            contributorMobileNumber: this.communityBackend.getPrivateMobileByUserId(
              entry.contributorUserId
            ),
            eligibleViews: entry.eligibleViews,
            selectionNote: cleanSingleLine(item?.selectionNote, 240) || undefined,
            paymentStatus,
            paymentDate: cleanSingleLine(item?.paymentDate, 40) || undefined,
            paymentReference: cleanSingleLine(item?.paymentReference, 120) || undefined,
            selectedBy: actor,
            selectedAt: nowIso,
          });
        }

        month.winners = updatedWinners.sort((a, b) => a.rank - b.rank);
        month.updatedAt = nowIso;

        this.appendAuditLog(
          actor,
          'winners.save',
          `Saved ${month.winners.length} winner selection(s) & payment statuses for ${month.displayLabelEn}`,
          month.monthKey
        );
        this.persistState();
        res.json({ ok: true, month });
      }
    );

    app.post(
      '/api/admin2/contest/months/:monthKey/finalize',
      this.authFactory('news.publish'),
      (req, res) => {
        const month = this.state.months.find((m) => m.monthKey === req.params.monthKey);
        if (!month) {
          res.status(404).json({ ok: false, error: 'Competition month not found.' });
          return;
        }

        const actor = this.getAdminActorEmail(req);
        const nowIso = new Date().toISOString();

        if (month.winners.length === 0) {
          const rankedPublic = rankEligibleContestEntries(
            this.getEntriesForMonth(month.monthKey)
          );
          const defaultPrizes = createDefaultContestPrizes();
          const autoWinners: ContestWinnerRecord[] = [];
          rankedPublic.slice(0, 4).forEach((pub, idx) => {
            const rawEntry = this.state.entries.find((e) => e.id === pub.id);
            if (!rawEntry) return;
            const rank = (idx + 1) as 1 | 2 | 3 | 4;
            const tier = month.prizes.find((p) => p.rank === rank) || defaultPrizes[idx];
            autoWinners.push({
              rank,
              prizeType: 'views',
              prizeLabelEn: tier.labelEn,
              prizeLabelKn: tier.labelKn,
              prizeAmountInr: tier.amountInr,
              entryId: rawEntry.id,
              postId: rawEntry.postId,
              articleSlug: rawEntry.slug,
              articleTitle: rawEntry.title,
              contributorName: rawEntry.contributorName,
              contributorMobileNumber: this.communityBackend.getPrivateMobileByUserId(
                rawEntry.contributorUserId
              ),
              eligibleViews: rawEntry.eligibleViews,
              paymentStatus: 'pending',
              selectedBy: actor,
              selectedAt: nowIso,
            });
          });
          month.winners = autoWinners;
        }

        month.status = 'finalized';
        month.finalizedAt = nowIso;
        month.finalizedBy = actor;
        if (typeof req.body?.publishWinners === 'boolean') {
          month.winnersPublished = req.body.publishWinners;
        }
        month.updatedAt = nowIso;

        this.appendAuditLog(
          actor,
          'month.finalize',
          `Finalized ${month.displayLabelEn} winners (Publicly announced: ${month.winnersPublished ? 'Yes' : 'No'})`,
          month.monthKey
        );
        this.persistState();
        res.json({ ok: true, month });
      }
    );

    app.patch(
      '/api/admin2/contest/months/:monthKey/publish-winners',
      this.authFactory('news.publish'),
      (req, res) => {
        const month = this.state.months.find((m) => m.monthKey === req.params.monthKey);
        if (!month) {
          res.status(404).json({ ok: false, error: 'Competition month not found.' });
          return;
        }
        const publish = Boolean(req.body?.published);
        const actor = this.getAdminActorEmail(req);
        month.winnersPublished = publish;
        month.updatedAt = new Date().toISOString();

        this.appendAuditLog(
          actor,
          publish ? 'winners.publish' : 'winners.hide',
          `${publish ? 'Published' : 'Hidden'} public winner announcement for ${month.displayLabelEn}`,
          month.monthKey
        );
        this.persistState();
        res.json({ ok: true, month });
      }
    );

    app.post(
      '/api/admin2/contest/months/open-next',
      this.authFactory('settings.manage'),
      (req, res) => {
        const actor = this.getAdminActorEmail(req);
        const nowIso = new Date().toISOString();
        const requestedKey = cleanSingleLine(req.body?.monthKey, 16);
        const nextKey = /^\d{4}-\d{2}$/.test(requestedKey)
          ? requestedKey
          : getNextIstMonthKey(this.state.activeMonthKey);

        for (const m of this.state.months) {
          if (m.status === 'open' && m.monthKey !== nextKey) {
            m.status = 'closed';
            m.updatedAt = nowIso;
          }
        }

        let nextMonth = this.state.months.find((m) => m.monthKey === nextKey);
        if (!nextMonth) {
          const prev = this.state.months.find(
            (m) => m.monthKey === this.state.activeMonthKey
          );
          const bounds = getIstMonthBounds(nextKey);
          const prizes = normalizeContestPrizes(req.body?.prizes ?? prev?.prizes);
          nextMonth = {
            monthKey: nextKey,
            competitionName: CONTEST_OFFICIAL_NAME,
            displayLabelEn: bounds.displayLabelEn,
            displayLabelKn: bounds.displayLabelKn,
            startsAtIso: bounds.startsAtIso,
            endsAtIso: bounds.endsAtIso,
            status: 'open',
            prizes,
            winners: [],
            winnersPublished: false,
            allowCarryOver: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          this.state.months.unshift(nextMonth);
        } else {
          nextMonth.status = 'open';
          nextMonth.updatedAt = nowIso;
        }

        this.state.activeMonthKey = nextMonth.monthKey;

        this.appendAuditLog(
          actor,
          'month.open_next',
          `Opened new competition month ${nextMonth.displayLabelEn} (previous articles preserved in archive, zero automatic carry-over)`,
          nextMonth.monthKey
        );
        this.persistState();
        res.status(201).json({ ok: true, month: nextMonth });
      }
    );

    app.get(
      '/api/admin2/contest/export',
      this.authFactory('analytics.view'),
      (req, res) => {
        const monthKey =
          typeof req.query.month === 'string' && req.query.month.trim()
            ? req.query.month.trim()
            : this.state.activeMonthKey;
        const format =
          String(req.query.format || 'csv').toLowerCase() === 'json' ? 'json' : 'csv';
        const overview = this.buildAdminOverview(monthKey);

        if (format === 'json') {
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="coffeenadu-contest-${overview.selectedMonth.monthKey}.json"`
          );
          res.json({
            exportedAt: new Date().toISOString(),
            month: overview.selectedMonth,
            summary: overview.summary,
            entries: overview.entries,
            alerts: overview.alerts,
          });
          return;
        }

        const header = [
          'Rank',
          'Month',
          'Article Title',
          'Contributor Name',
          'Contributor Mobile (Admin Only)',
          'Location',
          'Eligibility',
          'Eligible Views',
          'Total Page Views',
          'Suspicious Blocked Views',
          'Published At',
          'Disqualification Reason',
          'Permanent URL',
        ];
        const rows = [header.map(csvEscape).join(',')];
        let rankCounter = 0;
        for (const e of overview.entries) {
          const rankLabel = e.eligibility === 'eligible' ? String(++rankCounter) : '-';
          rows.push(
            [
              rankLabel,
              e.competitionMonth,
              e.title,
              e.contributorName,
              e.contributorMobileNumber,
              e.location,
              e.eligibility,
              e.eligibleViews,
              e.totalPageViews,
              e.suspiciousBlockedViews,
              e.publishedAt,
              e.disqualificationReason || '',
              `https://coffeenadu.in/community/${e.slug}`,
            ]
              .map(csvEscape)
              .join(',')
          );
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="coffeenadu-contest-${overview.selectedMonth.monthKey}.csv"`
        );
        res.send(`\uFEFF${rows.join('\n')}`);
      }
    );
  }
}
