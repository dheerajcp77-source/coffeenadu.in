import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { AdminPermission } from '../types/admin2';
import type {
  AdminContestEntryView,
  ContestAdminOverview,
  ContestAuditLogRecord,
  ContestEditableContent,
  ContestEntryEligibility,
  ContestEntryRecord,
  ContestMonthRecord,
  ContestMonthStatus,
  ContestPrizeTier,
  ContestPublicOverview,
  ContestSuspiciousAlert,
  ContestSystemDiagnosticRecord,
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
  buildAdminContestParticipants,
  buildUserViewsLeaderboard,
  compute30DayPeriodBounds,
  computeCompetitionDisplayScore,
  createDefaultContestEditableContent,
  createDefaultContestPrizes,
  createDefaultMonthRecord,
  createInitialContestMonthRecord,
  detectSuspiciousTrafficPattern,
  getEntryCompetitionDisplayScore,
  getGenuineEligibleViews,
  getIstMonthBounds,
  getIstMonthKey,
  getManualScoreAdjustment,
  getNextIstMonthKey,
  isContestAcceptingEntries,
  isContestMonthOpen,
  isEligibleRolling24hVisit,
  isLikelyBotUserAgent,
  normalizeContestPrizes,
  normalizeEntryScoreFields,
  rankEligibleContestEntries,
  restoreContestContentFromHistory,
  sanitizeContestEditableContent,
  toPublicContestEntry,
  toPublicContestWinner,
  upgradeActiveMonthPrizesIfLegacy,
  upgradeLegacyContestContentDefaults,
} from '../utils/contestHelpers';
import type { CommunityBackend } from './communityBackend';
import type { AppsScriptCommunityContestCoordinator } from './appsScriptCommunitySync';

export interface ContestViewBucketRecord {
  entryId: string;
  visitorHash: string;
  lastEligibleAtMs: number;
  hitCount: number;
}

export interface ContestStoreState {
  version: 1;
  activeMonthKey: string;
  months: ContestMonthRecord[];
  entries: ContestEntryRecord[];
  viewBuckets: ContestViewBucketRecord[];
  alerts: ContestSuspiciousAlert[];
  auditLogs: ContestAuditLogRecord[];
  contentConfig: ContestEditableContent;
  diagnostics: ContestSystemDiagnosticRecord[];
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
const MAX_DIAGNOSTICS = 200;

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
  private cloudSync?: AppsScriptCommunityContestCoordinator;
  private stateVersion = 0;
  private cachedPublicOverview: {
    fingerprint: string;
    cachedAtMs: number;
    payload: ContestPublicOverview;
  } | null = null;

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

  public attachCloudSync(sync: AppsScriptCommunityContestCoordinator): void {
    this.cloudSync = sync;
  }

  public getStoreState(): {
    activeMonthKey: string;
    months: ContestMonthRecord[];
    entries: ContestEntryRecord[];
    viewBuckets: ContestViewBucketRecord[];
    alerts: ContestSuspiciousAlert[];
    auditLogs: ContestAuditLogRecord[];
    contentConfig: ContestEditableContent;
    diagnostics: ContestSystemDiagnosticRecord[];
  } {
    return {
      activeMonthKey: this.state.activeMonthKey,
      months: this.state.months,
      entries: this.state.entries,
      viewBuckets: this.state.viewBuckets,
      alerts: this.state.alerts,
      auditLogs: this.state.auditLogs,
      contentConfig: this.state.contentConfig,
      diagnostics: this.state.diagnostics,
    };
  }

  public applyMergedStoreState(next: {
    activeMonthKey: string;
    months: ContestMonthRecord[];
    entries: ContestEntryRecord[];
    viewBuckets: ContestViewBucketRecord[];
    alerts: ContestSuspiciousAlert[];
    auditLogs: ContestAuditLogRecord[];
    contentConfig: ContestEditableContent;
    diagnostics: ContestSystemDiagnosticRecord[];
  }): void {
    this.state = {
      version: 1,
      activeMonthKey: next.activeMonthKey,
      months: next.months,
      entries: next.entries,
      viewBuckets: next.viewBuckets,
      alerts: next.alerts,
      auditLogs: next.auditLogs,
      contentConfig: next.contentConfig,
      diagnostics: next.diagnostics,
    };
    this.stateVersion += 1;
    this.cachedPublicOverview = null;
    this.persistState();
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
      contentConfig: createDefaultContestEditableContent(),
      diagnostics: [],
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
      const contentConfig = sanitizeContestEditableContent(
        parsed.contentConfig,
        createDefaultContestEditableContent(),
        parsed.contentConfig?.updatedBy || 'system',
        false
      );
      return {
        version: 1,
        activeMonthKey,
        months,
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        viewBuckets: Array.isArray(parsed.viewBuckets) ? parsed.viewBuckets : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        contentConfig,
        diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [],
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
    this.stateVersion += 1;
    this.cachedPublicOverview = null;
  }

  private getUserDirectory(): Map<string, { fullName: string; status: 'active' | 'suspended' }> {
    const map = new Map<string, { fullName: string; status: 'active' | 'suspended' }>();
    for (const u of this.communityBackend.getAllUsersInternal()) {
      if (u?.id) {
        map.set(u.id, { fullName: u.fullName, status: u.status });
      }
    }
    return map;
  }

  private isLinkedPostPublished(postId: string): boolean {
    const post = this.communityBackend.getInternalPostByIdOrSlug(postId);
    return Boolean(post && post.status === 'published');
  }

  private freezeMonthUserLeaderboard(month: ContestMonthRecord, nowIso: string): void {
    const entries = this.getEntriesForMonth(month.monthKey);
    month.frozenUserLeaderboard = buildUserViewsLeaderboard({
      month,
      entries,
      isPostPublished: (postId) => this.isLinkedPostPublished(postId),
      userDirectory: this.getUserDirectory(),
      forceRecompute: true,
    });
    month.frozenAt = nowIso;
  }

  private computePublicOverviewFingerprint(nowMs: number): string {
    const commState = this.communityBackend.getStoreState();
    const postSig = commState.posts
      .filter((p) => p.category === 'monthly-news-contest')
      .map((p) => `${p.id}:${p.status}:${p.updatedAt}`)
      .join('|');
    const userSig = commState.users
      .map((u) => `${u.id}:${u.status}:${u.fullName}`)
      .join('|');
    const minuteBucket = Math.floor(nowMs / 60_000);
    return `${this.stateVersion}#${minuteBucket}#${postSig}#${userSig}`;
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
    const anyReq = req as Request & {
      admin2User?: { email?: string };
      adminUser?: { email?: string };
    };
    return anyReq.admin2User?.email || anyReq.adminUser?.email || 'admin@coffeenadu.in';
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

  public appendDiagnostic(
    operationType: ContestSystemDiagnosticRecord['operationType'],
    category: ContestSystemDiagnosticRecord['category'],
    message: string,
    recoveryStatus: ContestSystemDiagnosticRecord['recoveryStatus'] = 'verified',
    recordId?: string
  ): void {
    if (!Array.isArray(this.state.diagnostics)) {
      this.state.diagnostics = [];
    }
    this.state.diagnostics.unshift({
      id: makeId('cdiag'),
      timestamp: new Date().toISOString(),
      operationType,
      recordId,
      category,
      message: cleanSingleLine(message, 400),
      recoveryStatus,
    });
    if (this.state.diagnostics.length > MAX_DIAGNOSTICS) {
      this.state.diagnostics = this.state.diagnostics.slice(0, MAX_DIAGNOSTICS);
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
        this.freezeMonthUserLeaderboard(month, now.toISOString());
        month.status = 'closed';
        month.updatedAt = now.toISOString();
        changed = true;
      }
      if (upgradeActiveMonthPrizesIfLegacy(month)) {
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
    return normalizeEntryScoreFields(entry);
  }

  private getEntriesForMonth(monthKey: string): ContestEntryRecord[] {
    return this.state.entries
      .filter((e) => e.competitionMonth === monthKey)
      .map((e) => this.syncEntryMetaWithPost(e));
  }

  private buildPublicOverview(now = new Date()): ContestPublicOverview {
    const nowMs = now.getTime();
    const activeMonth = this.ensureActiveMonthSynced(now);
    const fingerprint = this.computePublicOverviewFingerprint(nowMs);
    if (
      this.cachedPublicOverview &&
      this.cachedPublicOverview.fingerprint === fingerprint &&
      nowMs - this.cachedPublicOverview.cachedAtMs < 3_000
    ) {
      return {
        ...this.cachedPublicOverview.payload,
        serverNowIso: now.toISOString(),
      };
    }

    const monthEntries = this.getEntriesForMonth(activeMonth.monthKey);
    const publishedMonthEntries = monthEntries.filter((e) =>
      this.isLinkedPostPublished(e.postId)
    );
    const publicEntries: PublicContestEntry[] = rankEligibleContestEntries(publishedMonthEntries);
    const topThree = publicEntries.slice(0, 3);
    const userDirectory = this.getUserDirectory();
    const userLeaderboard = buildUserViewsLeaderboard({
      month: activeMonth,
      entries: monthEntries,
      isPostPublished: (postId) => this.isLinkedPostPublished(postId),
      userDirectory,
    });

    const publishedWinners: PublicContestWinner[] = activeMonth.winnersPublished
      ? [...activeMonth.winners]
          .sort((a, b) => a.rank - b.rank)
          .map((w) => toPublicContestWinner(w))
      : [];

    const qualityWinner =
      publishedWinners.find((w) => w.prizeType === 'quality') || null;

    const totalBudgetInr = activeMonth.prizes.reduce((s, p) => s + p.amountInr, 0);

    const previousMonths = this.state.months
      .filter(
        (m) =>
          (m.winnersPublished && m.winners.length > 0) ||
          (m.monthKey !== activeMonth.monthKey &&
            m.status !== 'open' &&
            Array.isArray(m.frozenUserLeaderboard) &&
            m.frozenUserLeaderboard.length > 0)
      )
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((m) => ({
        monthKey: m.monthKey,
        periodId: m.periodId || m.monthKey,
        displayLabelEn: m.displayLabelEn,
        displayLabelKn: m.displayLabelKn,
        startsAtIso: m.startsAtIso,
        endsAtIso: m.endsAtIso,
        status: m.status,
        winners: m.winnersPublished
          ? [...m.winners]
              .sort((a, b) => a.rank - b.rank)
              .map((w) => toPublicContestWinner(w))
          : [],
        userLeaderboard: Array.isArray(m.frozenUserLeaderboard)
          ? m.frozenUserLeaderboard
          : undefined,
      }));

    const contentConfig = upgradeLegacyContestContentDefaults(
      this.state.contentConfig || createDefaultContestEditableContent(now.toISOString())
    );

    const payload: ContestPublicOverview = {
      competitionName: contentConfig.mainHeadingEn || CONTEST_OFFICIAL_NAME,
      kannadaHeading: contentConfig.mainHeadingKn || CONTEST_KANNADA_HEADING,
      kannadaSubtitle: contentConfig.subtitleKn || CONTEST_KANNADA_SUBTITLE,
      targetArea: contentConfig.introEn || CONTEST_TARGET_AREA,
      contestUrl: CONTEST_PUBLIC_URL,
      contentConfig,
      activeMonth: {
        monthKey: activeMonth.monthKey,
        periodId: activeMonth.periodId || activeMonth.monthKey,
        durationDays: activeMonth.durationDays || 30,
        displayLabelEn: activeMonth.displayLabelEn,
        displayLabelKn: activeMonth.displayLabelKn,
        startsAtIso: activeMonth.startsAtIso,
        endsAtIso: activeMonth.endsAtIso,
        status: activeMonth.status,
        participationEnabled: activeMonth.participationEnabled !== false,
        isAcceptingEntries: isContestAcceptingEntries(activeMonth, nowMs),
        totalBudgetInr,
        prizes: activeMonth.prizes,
        winnersPublished: activeMonth.winnersPublished,
        publishedWinners,
      },
      userLeaderboard,
      totalParticipantsCount: userLeaderboard.length,
      topThree,
      topFour: topThree,
      fourthQualityWinner: qualityWinner,
      fifthQualityWinner: qualityWinner,
      allEligibleEntries: publicEntries,
      totalEligibleCount: publicEntries.length,
      previousMonths,
      serverNowIso: now.toISOString(),
    };

    this.cachedPublicOverview = {
      fingerprint,
      cachedAtMs: nowMs,
      payload,
    };
    return payload;
  }

  private buildAdminOverview(requestedMonthKey?: string): ContestAdminOverview {
    const activeMonth = this.ensureActiveMonthSynced();
    const selectedMonth =
      (requestedMonthKey &&
        this.state.months.find((m) => m.monthKey === requestedMonthKey)) ||
      activeMonth;

    const rawMonthEntries = this.getEntriesForMonth(selectedMonth.monthKey);

    // Compute organic genuine-view ranks among eligible entries
    const genuineEligibleSorted = [...rawMonthEntries]
      .filter((e) => e.eligibility === 'eligible')
      .sort((a, b) => {
        const diff = getGenuineEligibleViews(b) - getGenuineEligibleViews(a);
        if (diff !== 0) return diff;
        return Date.parse(a.publishedAt || '0') - Date.parse(b.publishedAt || '0');
      });
    const genuineRankMap = new Map<string, number>();
    genuineEligibleSorted.forEach((e, idx) => genuineRankMap.set(e.id, idx + 1));

    // Sort by active competition_display_score DESC, then earliest publishedAt ASC
    const monthEntries = [...rawMonthEntries].sort((a, b) => {
      if (a.eligibility !== b.eligibility) {
        return a.eligibility === 'eligible' ? -1 : 1;
      }
      const diff = getEntryCompetitionDisplayScore(b) - getEntryCompetitionDisplayScore(a);
      if (diff !== 0) return diff;
      return Date.parse(a.publishedAt || '0') - Date.parse(b.publishedAt || '0');
    });

    const displayEligibleSorted = monthEntries.filter((e) => e.eligibility === 'eligible');
    const currentRankMap = new Map<string, number>();
    displayEligibleSorted.forEach((e, idx) => currentRankMap.set(e.id, idx + 1));

    const monthEntryIds = new Set(monthEntries.map((e) => e.id));
    const alerts = this.state.alerts.filter(
      (a) => a.competitionMonth === selectedMonth.monthKey || monthEntryIds.has(a.entryId)
    );

    const entriesWithMobile: AdminContestEntryView[] = monthEntries.map((entry) => {
      normalizeEntryScoreFields(entry);
      const post = this.communityBackend.getInternalPostByIdOrSlug(entry.postId);
      const openAlertsCount = alerts.filter(
        (a) => a.entryId === entry.id && a.status === 'open'
      ).length;
      const genuine = getGenuineEligibleViews(entry);
      const adjustment = getManualScoreAdjustment(entry);
      const displayScore = computeCompetitionDisplayScore(genuine, adjustment);
      return {
        ...entry,
        genuineEligibleViews: genuine,
        genuine_eligible_views: genuine,
        manualScoreAdjustment: adjustment,
        manual_score_adjustment: adjustment,
        competitionDisplayScore: displayScore,
        competition_display_score: displayScore,
        currentRank: currentRankMap.get(entry.id) ?? null,
        genuineRank: genuineRankMap.get(entry.id) ?? null,
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
    const totalEligibleViews = entriesWithMobile.reduce(
      (s, e) => s + (e.genuineEligibleViews || 0),
      0
    );
    const totalCompetitionDisplayScore = entriesWithMobile.reduce(
      (s, e) => s + (e.competitionDisplayScore || 0),
      0
    );
    const manuallyAdjustedEntries = entriesWithMobile.filter(
      (e) => e.manualScoreAdjustment !== 0
    ).length;
    const totalPageViews = entriesWithMobile.reduce((s, e) => s + (e.totalPageViews || 0), 0);
    const suspiciousBlockedViews = entriesWithMobile.reduce(
      (s, e) => s + (e.suspiciousBlockedViews || 0),
      0
    );
    const openAlerts = alerts.filter((a) => a.status === 'open').length;

    const monthsSorted = [...this.state.months].sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );

    const allUsers = this.communityBackend.getAllUsersInternal();
    const userDirectory = this.getUserDirectory();
    const userLeaderboard = buildUserViewsLeaderboard({
      month: selectedMonth,
      entries: rawMonthEntries,
      isPostPublished: (postId) => this.isLinkedPostPublished(postId),
      userDirectory,
    });
    const participants = buildAdminContestParticipants({
      month: selectedMonth,
      entriesWithMobile,
      allUsers,
      userLeaderboard,
    });
    const eligibleParticipants = userLeaderboard.length;

    return {
      activeMonthKey: activeMonth.monthKey,
      months: monthsSorted,
      selectedMonth,
      contentConfig: upgradeLegacyContestContentDefaults(
        this.state.contentConfig || createDefaultContestEditableContent()
      ),
      diagnostics: (this.state.diagnostics || []).slice(0, 80),
      entries: entriesWithMobile,
      participants,
      userLeaderboard,
      alerts,
      auditLogs: this.state.auditLogs.slice(0, 120),
      summary: {
        totalEntries: entriesWithMobile.length,
        eligibleEntries,
        disqualifiedEntries,
        totalParticipants: participants.filter((p) => p.totalArticleCount > 0).length,
        eligibleParticipants,
        totalPageViews,
        totalEligibleViews,
        totalCompetitionDisplayScore,
        manuallyAdjustedEntries,
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
    app.get('/api/public/contest/overview', async (_req, res) => {
      try {
        await this.cloudSync?.syncIfNeeded();
        res.json({ ok: true, ...this.buildPublicOverview(new Date()) });
      } catch (err) {
        console.error('[ContestBackend] public overview failed:', err);
        res.status(500).json({ ok: false, error: 'Failed to load contest overview.' });
      }
    });

    app.get('/api/public/contest/entries/:slugOrId', async (req, res) => {
      try {
        await this.cloudSync?.syncIfNeeded();
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
      } catch (err) {
        console.error('[ContestBackend] entry fetch failed:', err);
        res.status(500).json({ ok: false, error: 'Failed to load contest article.' });
      }
    });

    // -------------------------------------------------------------------------
    // SECURE SERVER-SIDE VIEW COUNTER (ROLLING 24H DEDUPE + ANTI-ABUSE)
    // -------------------------------------------------------------------------
    app.post('/api/public/contest/entries/:slugOrId/view', async (req, res) => {
      try {
      await this.cloudSync?.syncIfNeeded();
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
        normalizeEntryScoreFields(entry);
        const displayScore = getEntryCompetitionDisplayScore(entry);
        const payload: ContestViewRecordResult = {
          ok: true,
          entryId: entry.id,
          slug: entry.slug,
          competitionMonth: entry.competitionMonth,
          countedEligible,
          countedReason,
          eligibleViews: displayScore,
          competitionDisplayScore: displayScore,
          competition_display_score: displayScore,
          totalPageViews: Math.max(entry.totalPageViews, displayScore),
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
          this.freezeMonthUserLeaderboard(month, now.toISOString());
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
      entry.lastEligibleViewAt = now.toISOString();
      normalizeEntryScoreFields(entry);
      this.communityBackend.syncContestPostTotalViews(
        entry.postId,
        Math.max(entry.totalPageViews, getEntryCompetitionDisplayScore(entry))
      );
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
      void this.cloudSync?.pushDelta({
        contestEntry: entry,
        viewBuckets: this.state.viewBuckets.filter((b) => b.entryId === entry.id).slice(-20),
      });
      respond(true, 'counted');
      } catch (err) {
        console.error('[ContestBackend] view counter failed:', err);
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: 'Failed to record article view.' });
        }
      }
    });

    // -------------------------------------------------------------------------
    // PUBLIC CONTEST NEWS SUBMISSION (REUSES EXISTING COMMUNITY USER & POST STORE)
    // -------------------------------------------------------------------------
    app.post('/api/public/contest/submit', async (req, res) => {
      try {
      await this.cloudSync?.syncIfNeeded();
      const ip = getClientIp(req);
      if (!this.checkSimpleIpRate(`csub:${ip}`, 40, 60 * 60 * 1000)) {
        res.status(429).json({
          ok: false,
          error: 'ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        });
        return;
      }

      const now = new Date();
      const activeMonth = this.ensureActiveMonthSynced(now);
      if (activeMonth.participationEnabled === false) {
        res.status(403).json({
          ok: false,
          error:
            'ಈ ಸ್ಪರ್ಧೆಯ ಸುದ್ದಿ ಸ್ವೀಕಾರವನ್ನು ಆಡ್ಮಿನ್ ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿಲ್ಲಿಸಿದ್ದಾರೆ. (Competition participation is currently paused by administrator.)',
        });
        return;
      }
      if (!isContestAcceptingEntries(activeMonth, now.getTime())) {
        res.status(400).json({
          ok: false,
          error:
            'ಈ ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆಯ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ. ಮುಂದಿನ ಸ್ಪರ್ಧೆ ಆರಂಭವಾದಾಗ ದಯವಿಟ್ಟು ಪ್ರಕಟಿಸಿ.',
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

      const rawSubmissionId = cleanSingleLine(req.body?.clientSubmissionId, 80);
      const clientSubmissionId = /^[a-zA-Z0-9_-]{8,80}$/.test(rawSubmissionId)
        ? rawSubmissionId
        : undefined;

      // Idempotent duplicate-retry check by clientSubmissionId (prevents double-click / retry duplicates
      // while allowing unlimited distinct articles by the same registered user).
      if (clientSubmissionId) {
        const existingIdempotentEntry = this.state.entries.find(
          (e) =>
            e.contributorUserId === contributorRes.user.id &&
            e.clientSubmissionId === clientSubmissionId
        );
        if (existingIdempotentEntry) {
          const existingPost = this.communityBackend.getInternalPostByIdOrSlug(
            existingIdempotentEntry.postId
          );
          if (existingPost) {
            res.status(200).json({
              ok: true,
              duplicatePrevented: true,
              token: contributorRes.token,
              profile: contributorRes.profile,
              post: {
                id: existingPost.id,
                slug: existingPost.slug,
                authorName: existingPost.authorName,
                title: existingPost.title,
                category: existingPost.category,
                description: existingPost.description,
                location: existingPost.location,
                photos: existingPost.photos,
                createdAt: existingPost.createdAt,
                updatedAt: existingPost.updatedAt,
                viewsCount: existingPost.viewsCount,
                sharesCount: existingPost.sharesCount,
                isOwner: true,
              },
              entry: toPublicContestEntry(existingIdempotentEntry),
              permanentPath: `/community/${encodeURIComponent(existingPost.slug)}`,
            });
            return;
          }
        }
      }

      const postRes = await this.communityBackend.createContestPostInternal(
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
          clientSubmissionId,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        this.state.entries.unshift(entry);
        this.persistState();
      }

      await this.cloudSync?.pushDelta(
        {
          user: contributorRes.user,
          post: postRes.post,
          contestEntry: entry,
          contestMonth: activeMonth,
          activeMonthKey: this.state.activeMonthKey,
        },
        { awaitRemote: true }
      );

      res.status(postRes.duplicatePrevented ? 200 : 201).json({
        ok: true,
        duplicatePrevented: Boolean(postRes.duplicatePrevented),
        token: contributorRes.token,
        profile: contributorRes.profile,
        post: postRes.publicPost,
        entry: toPublicContestEntry(entry),
        permanentPath: `/community/${encodeURIComponent(postRes.post.slug)}`,
      });
      } catch (err) {
        console.error('[ContestBackend] contest submit failed:', err);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: 'ಸುದ್ದಿ ಪ್ರಕಟಿಸುವಾಗ ಸರ್ವರ್ ದೋಷ ಉಂಟಾಯಿತು. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
          });
        }
      }
    });

    // -------------------------------------------------------------------------
    // ADMIN DASHBOARD — MONTHLY REWARDS MANAGEMENT (PROTECTED + AUDIT LOGGED)
    // -------------------------------------------------------------------------
    app.get(
      '/api/admin2/contest/overview',
      this.authFactory('dashboard.view'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const monthParam =
            typeof req.query.month === 'string' ? req.query.month.trim() : undefined;
          res.json({ ok: true, ...this.buildAdminOverview(monthParam) });
        } catch (err) {
          console.error('[ContestBackend] admin overview failed:', err);
          res.status(500).json({ ok: false, error: 'Failed to load admin contest overview.' });
        }
      }
    );

    app.patch(
      '/api/admin2/contest/entries/:id/eligibility',
      this.authFactory('news.edit'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const targetKey = decodeURIComponent(String(req.params.id || '')).trim();
          const entry = this.state.entries.find(
            (e) => e.id === targetKey || e.postId === targetKey
          );
          if (!entry) {
            res.status(404).json({ ok: false, error: 'Contest entry not found.' });
            return;
          }
          const eligibility: ContestEntryEligibility =
            req.body?.eligibility === 'disqualified' ? 'disqualified' : 'eligible';
          const reason = cleanSingleLine(req.body?.reason, 240);
          const hidePost = req.body?.hidePost === true;

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

          if (eligibility === 'disqualified' && hidePost) {
            this.communityBackend.setPostStatusInternal(entry.postId, 'hidden', reason);
          } else {
            const linkedPost = this.communityBackend.getInternalPostByIdOrSlug(entry.postId);
            if (linkedPost && linkedPost.status === 'hidden') {
              this.communityBackend.setPostStatusInternal(entry.postId, 'published');
            }
          }

          this.appendAuditLog(
            actor,
            eligibility === 'disqualified' ? 'entry.disqualify' : 'entry.reinstate',
            `${eligibility === 'disqualified' ? 'Disqualified' : 'Reinstated'} "${entry.title}"${
              reason ? ` (${reason})` : ''
            }${
              eligibility === 'disqualified'
                ? hidePost
                  ? ' [unpublished from Community Feed]'
                  : ' [kept published in Community Feed]'
                : ' [published in Community Feed]'
            }`,
            entry.competitionMonth,
            entry.id
          );
          this.persistState();
          const syncedPost = this.communityBackend.getInternalPostByIdOrSlug(entry.postId) || undefined;
          await this.cloudSync?.pushDelta(
            {
              contestEntry: entry,
              post: syncedPost,
              contestAuditLog: this.state.auditLogs[0],
            },
            { adminEmail: actor, awaitRemote: true }
          );

          res.json({ ok: true, entry });
        } catch (err) {
          console.error('[ContestBackend] eligibility update failed:', err);
          if (!res.headersSent) {
            res.status(500).json({
              ok: false,
              error:
                err instanceof Error ? err.message : 'Failed to update entry eligibility.',
            });
          }
        }
      }
    );

    app.patch(
      '/api/admin2/contest/entries/:id/score',
      this.authFactory('news.edit'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const targetKey = decodeURIComponent(String(req.params.id || '')).trim();
          const entry = this.state.entries.find(
            (e) => e.id === targetKey || e.postId === targetKey || e.slug === targetKey
          );
          if (!entry) {
            res.status(404).json({ ok: false, error: 'Contest entry not found.' });
            return;
          }

          normalizeEntryScoreFields(entry);
          const genuine = getGenuineEligibleViews(entry);
          const previousAdjustment = getManualScoreAdjustment(entry);
          const previousDisplayScore = computeCompetitionDisplayScore(genuine, previousAdjustment);

          let nextAdjustment = previousAdjustment;
          let isReset = false;

          if (req.body?.reset === true) {
            nextAdjustment = 0;
            isReset = true;
          } else if (
            req.body?.competitionDisplayScore !== undefined ||
            req.body?.competition_display_score !== undefined
          ) {
            const rawTarget = Number(
              req.body?.competitionDisplayScore ?? req.body?.competition_display_score
            );
            if (!Number.isFinite(rawTarget) || rawTarget < 0) {
              res.status(400).json({
                ok: false,
                error: 'Competition display score must be a non-negative integer.',
              });
              return;
            }
            const targetDisplay = Math.max(0, Math.floor(rawTarget));
            nextAdjustment = targetDisplay - genuine;
          } else if (
            req.body?.manualScoreAdjustment !== undefined ||
            req.body?.manual_score_adjustment !== undefined
          ) {
            const rawAdj = Number(
              req.body?.manualScoreAdjustment ?? req.body?.manual_score_adjustment
            );
            if (!Number.isFinite(rawAdj)) {
              res.status(400).json({
                ok: false,
                error: 'Manual score adjustment must be a valid integer.',
              });
              return;
            }
            if (genuine + Math.trunc(rawAdj) < 0) {
              res.status(400).json({
                ok: false,
                error: 'Final competition display score cannot be negative.',
              });
              return;
            }
            nextAdjustment = Math.trunc(rawAdj);
          } else if (req.body?.delta !== undefined) {
            const rawDelta = Number(req.body.delta);
            if (!Number.isFinite(rawDelta)) {
              res.status(400).json({
                ok: false,
                error: 'Score delta must be a valid integer.',
              });
              return;
            }
            const nextDisplay = Math.max(0, previousDisplayScore + Math.trunc(rawDelta));
            nextAdjustment = nextDisplay - genuine;
          } else {
            res.status(400).json({
              ok: false,
              error:
                'Provide competitionDisplayScore, manualScoreAdjustment, delta, or reset: true.',
            });
            return;
          }

          const actor = this.getAdminActorEmail(req);
          const nowIso = new Date().toISOString();
          entry.manualScoreAdjustment = nextAdjustment;
          entry.manual_score_adjustment = nextAdjustment;
          entry.manualScoreUpdatedBy = actor;
          entry.manualScoreUpdatedAt = nowIso;
          entry.updatedAt = nowIso;
          normalizeEntryScoreFields(entry);

          const nextDisplayScore = getEntryCompetitionDisplayScore(entry);
          this.communityBackend.syncContestPostTotalViews(
            entry.postId,
            Math.max(entry.totalPageViews, nextDisplayScore)
          );

          this.appendAuditLog(
            actor,
            isReset ? 'entry.score_reset' : 'entry.score_adjust',
            `${
              isReset ? 'Reset manual score adjustment' : 'Updated competition display score'
            } for "${entry.title}" (${entry.contributorName}): genuine_eligible_views=${genuine}, manual_score_adjustment ${
              previousAdjustment >= 0 ? `+${previousAdjustment}` : previousAdjustment
            } -> ${
              nextAdjustment >= 0 ? `+${nextAdjustment}` : nextAdjustment
            }, competition_display_score ${previousDisplayScore} -> ${nextDisplayScore}`,
            entry.competitionMonth,
            entry.id
          );
          this.persistState();
          await this.cloudSync?.pushDelta(
            {
              contestEntry: entry,
              contestAuditLog: this.state.auditLogs[0],
            },
            { adminEmail: actor, awaitRemote: true }
          );

          res.json({
            ok: true,
            entry,
            previous: {
              genuineEligibleViews: genuine,
              manualScoreAdjustment: previousAdjustment,
              competitionDisplayScore: previousDisplayScore,
            },
            updated: {
              genuineEligibleViews: genuine,
              manualScoreAdjustment: nextAdjustment,
              competitionDisplayScore: nextDisplayScore,
            },
          });
        } catch (err) {
          console.error('[ContestBackend] manual score update failed:', err);
          if (!res.headersSent) {
            res.status(500).json({
              ok: false,
              error:
                err instanceof Error ? err.message : 'Failed to update competition display score.',
            });
          }
        }
      }
    );

    app.post(
      '/api/admin2/contest/months/:monthKey/reset-scores',
      this.authFactory('news.edit'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const monthKey = String(req.params.monthKey || '').trim();
          const monthEntries = this.state.entries.filter(
            (e) => e.competitionMonth === monthKey
          );
          const actor = this.getAdminActorEmail(req);
          const nowIso = new Date().toISOString();
          let resetCount = 0;
          const touched: ContestEntryRecord[] = [];

          for (const entry of monthEntries) {
            if (getManualScoreAdjustment(entry) !== 0) {
              entry.manualScoreAdjustment = 0;
              entry.manual_score_adjustment = 0;
              entry.manualScoreUpdatedBy = actor;
              entry.manualScoreUpdatedAt = nowIso;
              entry.updatedAt = nowIso;
              normalizeEntryScoreFields(entry);
              touched.push(entry);
              resetCount += 1;
            }
          }

          this.appendAuditLog(
            actor,
            'month.scores_reset',
            `Restored all ${resetCount} manually adjusted article(s) in ${monthKey} to genuine-view rankings.`,
            monthKey
          );
          this.persistState();
          await this.cloudSync?.pushDelta(
            {
              extraContestEntries: touched,
              contestAuditLog: this.state.auditLogs[0],
            },
            { adminEmail: actor, awaitRemote: true }
          );
          res.json({ ok: true, resetCount });
        } catch (err) {
          console.error('[ContestBackend] reset month scores failed:', err);
          if (!res.headersSent) {
            res.status(500).json({
              ok: false,
              error: 'Failed to restore genuine-view rankings.',
            });
          }
        }
      }
    );

    app.patch(
      '/api/admin2/contest/alerts/:id',
      this.authFactory('security.view'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
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
          await this.cloudSync?.pushDelta(
            { contestAlert: alert, contestAuditLog: this.state.auditLogs[0] },
            { adminEmail: actor, awaitRemote: true }
          );
          res.json({ ok: true, alert });
        } catch (err) {
          console.error('[ContestBackend] alert review failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to update alert status.' });
          }
        }
      }
    );

    app.put(
      '/api/admin2/contest/months/:monthKey/config',
      this.authFactory('settings.manage'),
      async (req, res) => {
        try {
        await this.cloudSync?.syncIfNeeded();
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
        const wasOpen = month.status === 'open';
        const nowIso = new Date().toISOString();

        month.startsAtIso = startsAtIso;
        month.endsAtIso = endsAtIso;
        month.prizes = nextPrizes;
        month.status = requestedStatus;
        if (typeof req.body?.participationEnabled === 'boolean') {
          month.participationEnabled = req.body.participationEnabled;
        }
        if (req.body?.durationDays !== undefined) {
          const parsedDays = Math.round(Number(req.body.durationDays));
          if (Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= 365) {
            month.durationDays = parsedDays;
          }
        }
        if (wasOpen && requestedStatus !== 'open') {
          this.freezeMonthUserLeaderboard(month, nowIso);
        } else if (requestedStatus === 'open') {
          month.frozenUserLeaderboard = undefined;
          month.frozenAt = undefined;
        }
        month.allowCarryOver = Boolean(req.body?.allowCarryOver);
        month.updatedAt = nowIso;

        const budget = nextPrizes.reduce((s, p) => s + p.amountInr, 0);
        const actor = this.getAdminActorEmail(req);
        this.appendAuditLog(
          actor,
          'month.config',
          `Updated ${month.displayLabelEn} dates/prizes (Budget: ₹${budget}, Status: ${month.status}, Participation: ${
            month.participationEnabled === false ? 'Disabled' : 'Enabled'
          })`,
          month.monthKey
        );
        this.persistState();
        await this.cloudSync?.pushDelta(
          { contestMonth: month, contestAuditLog: this.state.auditLogs[0] },
          { adminEmail: actor, awaitRemote: true }
        );
        res.json({ ok: true, month });
        } catch (err) {
          console.error('[ContestBackend] month config failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to save month configuration.' });
          }
        }
      }
    );

    app.patch(
      '/api/admin2/contest/months/:monthKey/participation',
      this.authFactory('settings.manage'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const month = this.state.months.find((m) => m.monthKey === req.params.monthKey);
          if (!month) {
            res.status(404).json({ ok: false, error: 'Competition period not found.' });
            return;
          }
          const enabled = Boolean(req.body?.enabled);
          const actor = this.getAdminActorEmail(req);
          month.participationEnabled = enabled;
          month.updatedAt = new Date().toISOString();

          this.appendAuditLog(
            actor,
            enabled ? 'month.participation_enabled' : 'month.participation_disabled',
            `${enabled ? 'Enabled' : 'Disabled'} public competition participation for ${month.displayLabelEn}`,
            month.monthKey
          );
          this.persistState();
          await this.cloudSync?.pushDelta(
            { contestMonth: month, contestAuditLog: this.state.auditLogs[0] },
            { adminEmail: actor, awaitRemote: true }
          );
          res.json({ ok: true, month });
        } catch (err) {
          console.error('[ContestBackend] participation toggle failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to update participation status.' });
          }
        }
      }
    );

    app.patch(
      '/api/admin2/contest/months/:monthKey/participants/:userId/eligibility',
      this.authFactory('news.edit'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const month = this.state.months.find((m) => m.monthKey === req.params.monthKey);
          if (!month) {
            res.status(404).json({ ok: false, error: 'Competition period not found.' });
            return;
          }
          const userId = decodeURIComponent(String(req.params.userId || '')).trim();
          if (!userId) {
            res.status(400).json({ ok: false, error: 'Missing participant userId.' });
            return;
          }
          const eligible = req.body?.eligible === true;
          const reason = cleanSingleLine(req.body?.reason, 240);
          if (!eligible && reason.length < 3) {
            res.status(400).json({
              ok: false,
              error: 'Please enter a brief reason (min 3 chars) for excluding this participant.',
            });
            return;
          }

          const excluded = new Set(Array.isArray(month.excludedUserIds) ? month.excludedUserIds : []);
          const reasons: Record<string, string> = { ...(month.excludedUserReasons || {}) };
          if (eligible) {
            excluded.delete(userId);
            delete reasons[userId];
          } else {
            excluded.add(userId);
            reasons[userId] = reason;
          }

          const nowIso = new Date().toISOString();
          month.excludedUserIds = Array.from(excluded);
          month.excludedUserReasons = reasons;
          if (month.status !== 'open') {
            this.freezeMonthUserLeaderboard(month, nowIso);
          }
          month.updatedAt = nowIso;

          const actor = this.getAdminActorEmail(req);
          const userRec = this.communityBackend
            .getAllUsersInternal()
            .find((u) => u.id === userId);
          const displayName = userRec?.fullName || userId;
          this.appendAuditLog(
            actor,
            eligible ? 'participant.reinstate' : 'participant.exclude',
            `${eligible ? 'Reinstated' : 'Excluded'} participant "${displayName}" on ${month.displayLabelEn} leaderboard${
              !eligible ? ` (${reason})` : ''
            }`,
            month.monthKey,
            userId
          );
          this.persistState();
          await this.cloudSync?.pushDelta(
            { contestMonth: month, contestAuditLog: this.state.auditLogs[0] },
            { adminEmail: actor, awaitRemote: true }
          );
          res.json({ ok: true, month });
        } catch (err) {
          console.error('[ContestBackend] participant eligibility update failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to update participant eligibility.' });
          }
        }
      }
    );

    app.put(
      '/api/admin2/contest/months/:monthKey/winners',
      this.authFactory('news.publish'),
      async (req, res) => {
        try {
        await this.cloudSync?.syncIfNeeded();
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

        const allowedRanks = month.status === 'finalized' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
        for (const item of rawWinners) {
          const rank = Number(item?.rank);
          if (!allowedRanks.includes(rank)) continue;
          const entryId = String(item?.entryId || '').trim();
          const entry = this.state.entries.find(
            (e) => e.id === entryId && e.competitionMonth === month.monthKey
          );
          if (!entry) continue;
          if (entry.eligibility !== 'eligible') {
            res.status(400).json({
              ok: false,
              error: `Disqualified article "${entry.title}" cannot be selected as a contest winner.`,
            });
            return;
          }

          const tier =
            month.prizes.find((p) => p.rank === rank) ||
            defaultPrizes[Math.min(rank - 1, defaultPrizes.length - 1)];
          const isQualityPrize =
            tier.type === 'quality' || (month.status !== 'finalized' && rank === 4) || rank === 5;
          const amountInr =
            item?.prizeAmountInr !== undefined && Number.isFinite(Number(item?.prizeAmountInr))
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
            prizeType: isQualityPrize ? 'quality' : 'views',
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
            eligibleViews: getEntryCompetitionDisplayScore(entry),
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
        await this.cloudSync?.pushDelta(
          { contestMonth: month, contestAuditLog: this.state.auditLogs[0] },
          { adminEmail: actor, awaitRemote: true }
        );
        res.json({ ok: true, month });
        } catch (err) {
          console.error('[ContestBackend] winners save failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to save winners.' });
          }
        }
      }
    );

    app.post(
      '/api/admin2/contest/months/:monthKey/finalize',
      this.authFactory('news.publish'),
      async (req, res) => {
        try {
        await this.cloudSync?.syncIfNeeded();
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
          rankedPublic.slice(0, 3).forEach((pub, idx) => {
            const rawEntry = this.state.entries.find((e) => e.id === pub.id);
            if (!rawEntry) return;
            const rank = (idx + 1) as 1 | 2 | 3;
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
              eligibleViews: getEntryCompetitionDisplayScore(rawEntry),
              paymentStatus: 'pending',
              selectedBy: actor,
              selectedAt: nowIso,
            });
          });
          month.winners = autoWinners;
        }

        this.freezeMonthUserLeaderboard(month, nowIso);
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
          `Finalized ${month.displayLabelEn} winners & froze 30-day leaderboard (${month.frozenUserLeaderboard?.length ?? 0} participants; Publicly announced: ${month.winnersPublished ? 'Yes' : 'No'})`,
          month.monthKey
        );
        this.persistState();
        await this.cloudSync?.pushDelta(
          { contestMonth: month, contestAuditLog: this.state.auditLogs[0] },
          { adminEmail: actor, awaitRemote: true }
        );
        res.json({ ok: true, month });
        } catch (err) {
          console.error('[ContestBackend] finalize failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to finalize competition month.' });
          }
        }
      }
    );

    app.patch(
      '/api/admin2/contest/months/:monthKey/publish-winners',
      this.authFactory('news.publish'),
      async (req, res) => {
        try {
        await this.cloudSync?.syncIfNeeded();
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
        await this.cloudSync?.pushDelta(
          { contestMonth: month, contestAuditLog: this.state.auditLogs[0] },
          { adminEmail: actor, awaitRemote: true }
        );
        res.json({ ok: true, month });
        } catch (err) {
          console.error('[ContestBackend] publish winners failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to update winner publication visibility.' });
          }
        }
      }
    );

    app.post(
      '/api/admin2/contest/months/open-next',
      this.authFactory('settings.manage'),
      async (req, res) => {
        try {
        await this.cloudSync?.syncIfNeeded();
        const actor = this.getAdminActorEmail(req);
        const nowIso = new Date().toISOString();
        const requestedKey = cleanSingleLine(req.body?.monthKey, 32);
        const startDateIso = cleanSingleLine(req.body?.startDateIso, 40);
        const rawDurationDays = Number(req.body?.durationDays);
        const use30DayCustom =
          Boolean(startDateIso) ||
          (Number.isFinite(rawDurationDays) && rawDurationDays >= 1 && rawDurationDays <= 365);

        let nextKey: string;
        let bounds: {
          startsAtIso: string;
          endsAtIso: string;
          displayLabelEn: string;
          displayLabelKn: string;
          periodId?: string;
          durationDays?: number;
        };

        if (use30DayCustom) {
          const p = compute30DayPeriodBounds(
            startDateIso || undefined,
            Number.isFinite(rawDurationDays) ? rawDurationDays : 30
          );
          nextKey = /^[a-zA-Z0-9_-]{4,32}$/.test(requestedKey) ? requestedKey : p.periodId;
          bounds = p;
        } else {
          nextKey = /^\d{4}-\d{2}$/.test(requestedKey)
            ? requestedKey
            : getNextIstMonthKey(this.state.activeMonthKey);
          const calBounds = getIstMonthBounds(nextKey);
          bounds = { ...calBounds, periodId: nextKey, durationDays: 30 };
        }

        for (const m of this.state.months) {
          if (m.status === 'open' && m.monthKey !== nextKey) {
            this.freezeMonthUserLeaderboard(m, nowIso);
            m.status = 'closed';
            m.updatedAt = nowIso;
          }
        }

        let nextMonth = this.state.months.find((m) => m.monthKey === nextKey);
        if (!nextMonth) {
          const prev = this.state.months.find(
            (m) => m.monthKey === this.state.activeMonthKey
          );
          const prizes = normalizeContestPrizes(req.body?.prizes ?? prev?.prizes);
          nextMonth = {
            monthKey: nextKey,
            periodId: bounds.periodId || nextKey,
            durationDays: bounds.durationDays || 30,
            competitionName: CONTEST_OFFICIAL_NAME,
            displayLabelEn: bounds.displayLabelEn,
            displayLabelKn: bounds.displayLabelKn,
            startsAtIso: bounds.startsAtIso,
            endsAtIso: bounds.endsAtIso,
            status: 'open',
            participationEnabled: true,
            excludedUserIds: [],
            excludedUserReasons: {},
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
          nextMonth.participationEnabled = true;
          nextMonth.frozenUserLeaderboard = undefined;
          nextMonth.frozenAt = undefined;
          nextMonth.updatedAt = nowIso;
        }

        this.state.activeMonthKey = nextMonth.monthKey;

        this.appendAuditLog(
          actor,
          'month.open_next',
          `Opened new competition period ${nextMonth.displayLabelEn} (previous period leaderboard frozen & archived, zero automatic carry-over)`,
          nextMonth.monthKey
        );
        this.persistState();
        await this.cloudSync?.pushDelta(
          {
            activeMonthKey: this.state.activeMonthKey,
            contestMonth: nextMonth,
            contestAuditLog: this.state.auditLogs[0],
          },
          { adminEmail: actor, awaitRemote: true }
        );
        res.status(201).json({ ok: true, month: nextMonth });
        } catch (err) {
          console.error('[ContestBackend] open-next failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to open next competition month.' });
          }
        }
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
        const scope =
          String(req.query.scope || 'entries').toLowerCase() === 'leaderboard'
            ? 'leaderboard'
            : 'entries';
        const overview = this.buildAdminOverview(monthKey);

        if (scope === 'leaderboard') {
          if (format === 'json') {
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="coffeenadu-leaderboard-${overview.selectedMonth.monthKey}.json"`
            );
            res.json({
              exportedAt: new Date().toISOString(),
              scope: 'leaderboard',
              period: {
                monthKey: overview.selectedMonth.monthKey,
                periodId: overview.selectedMonth.periodId || overview.selectedMonth.monthKey,
                displayLabelEn: overview.selectedMonth.displayLabelEn,
                startsAtIso: overview.selectedMonth.startsAtIso,
                endsAtIso: overview.selectedMonth.endsAtIso,
                status: overview.selectedMonth.status,
              },
              summary: overview.summary,
              userLeaderboard: overview.userLeaderboard || [],
              participants: overview.participants || [],
            });
            return;
          }

          const lbHeader = [
            'Rank',
            'Competition Period',
            'Participant Name',
            'Mobile (Admin Only)',
            'Leaderboard Eligibility',
            'Total Verified Views',
            'Total Genuine Views',
            'Eligible News Published',
            'Total News Published',
            'Disqualified News',
            'Last View Achieved At',
            'Exclusion Reason',
          ];
          const lbRows = [lbHeader.map(csvEscape).join(',')];
          for (const p of overview.participants || []) {
            if (p.totalArticleCount === 0 && p.rank === null) continue;
            lbRows.push(
              [
                p.rank !== null ? String(p.rank) : '-',
                overview.selectedMonth.displayLabelEn,
                p.displayName,
                p.mobileNumber,
                p.leaderboardEligible ? 'eligible' : 'excluded',
                p.totalVerifiedViews,
                p.totalGenuineViews,
                p.eligibleArticleCount,
                p.totalArticleCount,
                p.disqualifiedArticleCount,
                p.lastViewAchievedAt || '',
                p.exclusionReason || '',
              ]
                .map(csvEscape)
                .join(',')
            );
          }
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="coffeenadu-leaderboard-${overview.selectedMonth.monthKey}.csv"`
          );
          res.send(`\uFEFF${lbRows.join('\n')}`);
          return;
        }

        if (format === 'json') {
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="coffeenadu-contest-${overview.selectedMonth.monthKey}.json"`
          );
          res.json({
            exportedAt: new Date().toISOString(),
            month: overview.selectedMonth,
            summary: overview.summary,
            userLeaderboard: overview.userLeaderboard || [],
            participants: overview.participants || [],
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

    app.put(
      '/api/admin2/contest/content',
      this.authFactory('settings.manage'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const actor = this.getAdminActorEmail(req);
          const updated = sanitizeContestEditableContent(
            req.body as Partial<ContestEditableContent>,
            this.state.contentConfig,
            actor,
            true
          );
          this.state.contentConfig = updated;
          this.appendAuditLog(
            actor,
            'content.update',
            `Published Contest Content & Settings v${updated.version} (Heading: "${updated.mainHeadingKn.slice(0, 48)}")`,
            this.state.activeMonthKey
          );
          this.appendDiagnostic(
            'content_update',
            'info',
            `Published contest content v${updated.version} by ${actor}`,
            'verified'
          );
          this.persistState();
          await this.cloudSync?.pushDelta(
            { contentConfig: updated, contestAuditLog: this.state.auditLogs[0] },
            { adminEmail: actor, awaitRemote: true }
          );
          res.json({ ok: true, contentConfig: updated });
        } catch (err) {
          console.error('[ContestBackend] content update failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to save contest content settings.' });
          }
        }
      }
    );

    app.post(
      '/api/admin2/contest/content/restore',
      this.authFactory('settings.manage'),
      async (req, res) => {
        try {
          await this.cloudSync?.syncIfNeeded();
          const actor = this.getAdminActorEmail(req);
          const rawVersion = Number(req.body?.version);
          const targetVersion = Number.isFinite(rawVersion) ? rawVersion : undefined;
          const restored = restoreContestContentFromHistory(
            this.state.contentConfig,
            targetVersion,
            actor
          );
          if (!restored) {
            res.status(400).json({
              ok: false,
              error: 'No previous content version is available to restore.',
            });
            return;
          }
          this.state.contentConfig = restored;
          this.appendAuditLog(
            actor,
            'content.restore',
            `Restored previous Contest Content & Settings (now v${restored.version})`,
            this.state.activeMonthKey
          );
          this.appendDiagnostic(
            'content_update',
            'info',
            `Restored previous contest content snapshot (now v${restored.version}) by ${actor}`,
            'verified'
          );
          this.persistState();
          await this.cloudSync?.pushDelta(
            { contentConfig: restored, contestAuditLog: this.state.auditLogs[0] },
            { adminEmail: actor, awaitRemote: true }
          );
          res.json({ ok: true, contentConfig: restored });
        } catch (err) {
          console.error('[ContestBackend] content restore failed:', err);
          if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Failed to restore previous contest content.' });
          }
        }
      }
    );
  }
}
