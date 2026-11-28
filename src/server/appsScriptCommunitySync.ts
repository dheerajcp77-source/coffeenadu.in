/**
 * Bidirectional Google Apps Script & Google Drive sync coordinator for
 * Express (`server.ts`) Community & Monthly Contest backends.
 *
 * Uses the EXACT same Apps Script endpoints and universal row fallback
 * (`getCommunityContestSnapshot`, `upsertCommunityContestDelta`,
 * `cn_sys_community_contest_store_v1`, `uploadPublicCommunityImage` / `uploadImage`)
 * as Cloudflare Pages (`functions/_cfCommunityContestStore.ts`), so user-published
 * community news, photos, reports, and monthly contest entries stay seamlessly in
 * sync between https://coffeenadu.in (Cloudflare) and AI Studio (Express).
 */

import type {
  CommunityPostRecord,
  CommunityReportRecord,
  CommunityUserPrivate,
} from '../types/community.ts';
import type {
  ContestAuditLogRecord,
  ContestEditableContent,
  ContestEntryRecord,
  ContestMonthRecord,
  ContestSuspiciousAlert,
  ContestSystemDiagnosticRecord,
} from '../types/contest.ts';
import {
  createDefaultContestEditableContent,
  createInitialContestMonthRecord,
  normalizeEntryScoreFields,
  sanitizeContestEditableContent,
  upgradeActiveMonthPrizesIfLegacy,
  upgradeLegacyContestContentDefaults,
} from '../utils/contestHelpers.ts';
import type { AppsScriptConfig } from './sheetsStorageProxy.ts';

export interface SyncCommunitySession {
  tokenHash: string;
  userId: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface SyncContestViewBucket {
  entryId: string;
  visitorHash: string;
  lastEligibleAtMs: number;
  hitCount: number;
}

export interface CombinedCommunityContestState {
  users: CommunityUserPrivate[];
  sessions: SyncCommunitySession[];
  posts: CommunityPostRecord[];
  reports: CommunityReportRecord[];
  activeMonthKey: string;
  months: ContestMonthRecord[];
  entries: ContestEntryRecord[];
  viewBuckets: SyncContestViewBucket[];
  alerts: ContestSuspiciousAlert[];
  auditLogs: ContestAuditLogRecord[];
  contentConfig: ContestEditableContent;
  diagnostics: ContestSystemDiagnosticRecord[];
}

export interface CloudDeltaPayload {
  user?: CommunityUserPrivate;
  session?: SyncCommunitySession;
  revokeSessionTokenHash?: string;
  revokeSessionsForUserId?: string;
  post?: CommunityPostRecord;
  extraPosts?: CommunityPostRecord[];
  deletePostId?: string;
  report?: CommunityReportRecord;
  activeMonthKey?: string;
  contestMonth?: ContestMonthRecord;
  contestEntry?: ContestEntryRecord;
  extraContestEntries?: ContestEntryRecord[];
  deleteContestEntryByPostId?: string;
  contestAlert?: ContestSuspiciousAlert;
  contestAuditLog?: ContestAuditLogRecord;
  viewBuckets?: SyncContestViewBucket[];
  contentConfig?: ContestEditableContent;
  diagnostic?: ContestSystemDiagnosticRecord;
}

export interface CommunityStateAdapter {
  getStoreState: () => {
    users: CommunityUserPrivate[];
    sessions: SyncCommunitySession[];
    posts: CommunityPostRecord[];
    reports: CommunityReportRecord[];
  };
  applyMergedStoreState: (next: {
    users: CommunityUserPrivate[];
    sessions: SyncCommunitySession[];
    posts: CommunityPostRecord[];
    reports: CommunityReportRecord[];
  }) => void;
}

export interface ContestStateAdapter {
  getStoreState: () => {
    activeMonthKey: string;
    months: ContestMonthRecord[];
    entries: ContestEntryRecord[];
    viewBuckets: SyncContestViewBucket[];
    alerts: ContestSuspiciousAlert[];
    auditLogs: ContestAuditLogRecord[];
    contentConfig: ContestEditableContent;
    diagnostics: ContestSystemDiagnosticRecord[];
  };
  applyMergedStoreState: (next: {
    activeMonthKey: string;
    months: ContestMonthRecord[];
    entries: ContestEntryRecord[];
    viewBuckets: SyncContestViewBucket[];
    alerts: ContestSuspiciousAlert[];
    auditLogs: ContestAuditLogRecord[];
    contentConfig: ContestEditableContent;
    diagnostics: ContestSystemDiagnosticRecord[];
  }) => void;
}

const UNIVERSAL_STORE_NEWS_ID = 'cn_sys_community_contest_store_v1';
const DEFAULT_APPS_SCRIPT_OWNER_EMAIL = 'shwethashwethak85@gmail.com';
const SNAPSHOT_TTL_MS = 2_000;
const FETCH_TIMEOUT_MS = 15_000;
const CHUNK_CHAR_SIZE = 32_000;

export function normalizeCloudSnapshotState(
  raw: Partial<CombinedCommunityContestState> | null | undefined,
  now = new Date()
): CombinedCommunityContestState {
  const months =
    Array.isArray(raw?.months) && raw.months.length > 0
      ? raw.months.map((m) => ({ ...m }))
      : [createInitialContestMonthRecord(now)];

  const entries = Array.isArray(raw?.entries)
    ? raw.entries.map((entry) => {
        const clone = { ...entry };
        normalizeEntryScoreFields(clone);
        return clone;
      })
    : [];

  const nowMs = now.getTime();
  for (const m of months) {
    if (m.status === 'open' && nowMs > Date.parse(m.endsAtIso)) {
      m.status = 'closed';
      m.updatedAt = now.toISOString();
    }
    upgradeActiveMonthPrizesIfLegacy(m);
  }

  const activeMonthKey =
    typeof raw?.activeMonthKey === 'string' &&
    months.some((m) => m.monthKey === raw.activeMonthKey)
      ? raw.activeMonthKey
      : months[0].monthKey;

  const contentConfig = upgradeLegacyContestContentDefaults(
    sanitizeContestEditableContent(
      raw?.contentConfig,
      createDefaultContestEditableContent(now.toISOString()),
      raw?.contentConfig?.updatedBy || 'system',
      false
    )
  );

  return {
    users: Array.isArray(raw?.users) ? raw.users : [],
    sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
    posts: Array.isArray(raw?.posts) ? raw.posts : [],
    reports: Array.isArray(raw?.reports) ? raw.reports : [],
    activeMonthKey,
    months,
    entries,
    viewBuckets: Array.isArray(raw?.viewBuckets) ? raw.viewBuckets : [],
    alerts: Array.isArray(raw?.alerts) ? raw.alerts : [],
    auditLogs: Array.isArray(raw?.auditLogs) ? raw.auditLogs : [],
    contentConfig,
    diagnostics: Array.isArray(raw?.diagnostics) ? raw.diagnostics : [],
  };
}

/**
 * Pure, deterministic state merger that unions local Express records with
 * remote Apps Script / Cloudflare records without losing user posts, views,
 * manual score adjustments, disqualifications, or historical winners.
 */
export function mergeCommunityAndContestStates(
  local: CombinedCommunityContestState,
  remote: CombinedCommunityContestState
): CombinedCommunityContestState {
  // Merge users by id
  const userMap = new Map<string, CommunityUserPrivate>();
  for (const u of [...local.users, ...remote.users]) {
    if (!u?.id) continue;
    const prev = userMap.get(u.id);
    if (!prev || (u.lastActiveAt || '') >= (prev.lastActiveAt || '')) {
      userMap.set(u.id, u);
    }
  }

  // Merge non-expired sessions by tokenHash
  const nowMs = Date.now();
  const sessionMap = new Map<string, SyncCommunitySession>();
  for (const s of [...local.sessions, ...remote.sessions]) {
    if (!s?.tokenHash || s.expiresAtMs <= nowMs) continue;
    sessionMap.set(s.tokenHash, s);
  }

  // Merge posts by id
  const postMap = new Map<string, CommunityPostRecord>();
  for (const lp of local.posts) {
    if (lp?.id) postMap.set(lp.id, lp);
  }
  for (const rp of remote.posts) {
    if (!rp?.id) continue;
    const lp = postMap.get(rp.id);
    if (!lp) {
      postMap.set(rp.id, rp);
    } else {
      const newer = (lp.updatedAt || '') > (rp.updatedAt || '') ? lp : rp;
      postMap.set(rp.id, {
        ...newer,
        viewsCount: Math.max(Number(rp.viewsCount) || 0, Number(lp.viewsCount) || 0),
        sharesCount: Math.max(Number(rp.sharesCount) || 0, Number(lp.sharesCount) || 0),
      });
    }
  }
  const mergedPosts = Array.from(postMap.values()).sort(
    (a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
  );

  // Merge contest entries by id
  const entryMap = new Map<string, ContestEntryRecord>();
  for (const le of local.entries) {
    if (le?.id) {
      const clone = { ...le };
      normalizeEntryScoreFields(clone);
      entryMap.set(clone.id, clone);
    }
  }
  for (const re of remote.entries) {
    if (!re?.id) continue;
    const le = entryMap.get(re.id);
    if (!le) {
      const clone = { ...re };
      normalizeEntryScoreFields(clone);
      entryMap.set(clone.id, clone);
    } else {
      const newer = (le.updatedAt || '') > (re.updatedAt || '') ? le : re;
      const mergedGenuine = Math.max(
        Number(re.genuineEligibleViews ?? re.eligibleViews) || 0,
        Number(le.genuineEligibleViews ?? le.eligibleViews) || 0
      );
      const merged: ContestEntryRecord = {
        ...newer,
        eligibleViews: mergedGenuine,
        genuineEligibleViews: mergedGenuine,
        totalPageViews: Math.max(Number(re.totalPageViews) || 0, Number(le.totalPageViews) || 0),
        suspiciousBlockedViews: Math.max(
          Number(re.suspiciousBlockedViews) || 0,
          Number(le.suspiciousBlockedViews) || 0
        ),
        suspiciousFlagged: Boolean(re.suspiciousFlagged || le.suspiciousFlagged),
      };
      normalizeEntryScoreFields(merged);
      entryMap.set(re.id, merged);
    }
  }
  const mergedEntries = Array.from(entryMap.values()).sort(
    (a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '')
  );

  // Merge reports by id
  const reportMap = new Map<string, CommunityReportRecord>();
  for (const r of [...local.reports, ...remote.reports]) {
    if (!r?.id) continue;
    const prev = reportMap.get(r.id);
    if (!prev || (r.status !== 'open' && prev.status === 'open')) {
      reportMap.set(r.id, r);
    }
  }

  // Merge months by monthKey
  const monthMap = new Map<string, ContestMonthRecord>();
  for (const m of [...local.months, ...remote.months]) {
    if (!m?.monthKey) continue;
    const prev = monthMap.get(m.monthKey);
    if (!prev || (m.updatedAt || '') >= (prev.updatedAt || '')) {
      const clone = { ...m };
      upgradeActiveMonthPrizesIfLegacy(clone);
      monthMap.set(clone.monthKey, clone);
    }
  }

  // Merge alerts by id
  const alertMap = new Map<string, ContestSuspiciousAlert>();
  for (const a of [...local.alerts, ...remote.alerts]) {
    if (!a?.id) continue;
    const prev = alertMap.get(a.id);
    if (!prev || (a.status !== 'open' && prev.status === 'open')) {
      alertMap.set(a.id, a);
    }
  }

  // Merge audit logs by id
  const auditMap = new Map<string, ContestAuditLogRecord>();
  for (const l of [...local.auditLogs, ...remote.auditLogs]) {
    if (!l?.id) continue;
    auditMap.set(l.id, l);
  }

  // Merge diagnostics by id
  const diagMap = new Map<string, ContestSystemDiagnosticRecord>();
  for (const d of [...(local.diagnostics || []), ...(remote.diagnostics || [])]) {
    if (!d?.id) continue;
    diagMap.set(d.id, d);
  }

  // Merge view buckets by entryId:visitorHash
  const bucketMap = new Map<string, SyncContestViewBucket>();
  for (const b of [...(remote.viewBuckets || []), ...(local.viewBuckets || [])]) {
    if (!b?.entryId || !b?.visitorHash) continue;
    const key = `${b.entryId}:${b.visitorHash}`;
    const prev = bucketMap.get(key);
    if (!prev || b.lastEligibleAtMs > prev.lastEligibleAtMs) {
      bucketMap.set(key, b);
    }
  }

  const mergedMonths = Array.from(monthMap.values());
  const activeMonthKey =
    remote.activeMonthKey && mergedMonths.some((m) => m.monthKey === remote.activeMonthKey)
      ? remote.activeMonthKey
      : local.activeMonthKey;

  const contentConfig =
    (local.contentConfig?.version || 1) > (remote.contentConfig?.version || 1) ||
    ((local.contentConfig?.version || 1) === (remote.contentConfig?.version || 1) &&
      (local.contentConfig?.updatedAt || '') > (remote.contentConfig?.updatedAt || ''))
      ? local.contentConfig
      : remote.contentConfig || local.contentConfig;

  return {
    users: Array.from(userMap.values()),
    sessions: Array.from(sessionMap.values()),
    posts: mergedPosts,
    reports: Array.from(reportMap.values()),
    activeMonthKey,
    months: mergedMonths,
    entries: mergedEntries,
    viewBuckets: Array.from(bucketMap.values()),
    alerts: Array.from(alertMap.values()),
    auditLogs: Array.from(auditMap.values()).sort(
      (a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || '')
    ),
    contentConfig,
    diagnostics: Array.from(diagMap.values()).sort(
      (a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || '')
    ),
  };
}

function splitStringIntoChunks(str: string, chunkSize = CHUNK_CHAR_SIZE): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += chunkSize) {
    chunks.push(str.slice(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : ['{}'];
}

function buildCompactStateForUniversalRow(
  state: CombinedCommunityContestState
): CombinedCommunityContestState {
  const nowMs = Date.now();
  return {
    users: state.users.slice(0, 500),
    sessions: state.sessions.filter((s) => s.expiresAtMs > nowMs).slice(-300),
    posts: state.posts.slice(0, 300),
    reports: state.reports.slice(0, 200),
    activeMonthKey: state.activeMonthKey,
    months: state.months.slice(0, 24),
    entries: state.entries.slice(0, 300),
    viewBuckets: state.viewBuckets.slice(-800),
    alerts: state.alerts.slice(0, 100),
    auditLogs: state.auditLogs.slice(0, 150),
    contentConfig: state.contentConfig,
    diagnostics: (state.diagnostics || []).slice(0, 100),
  };
}

export class AppsScriptCommunityContestCoordinator {
  private communityAdapter: CommunityStateAdapter | null = null;
  private contestAdapter: ContestStateAdapter | null = null;
  private lastSyncedAtMs = 0;
  private inFlightSync: Promise<void> | null = null;
  private dedicatedActionsUnsupported = false;

  constructor(private readonly getConfig: () => AppsScriptConfig) {}

  public bindBackends(
    communityAdapter: CommunityStateAdapter,
    contestAdapter: ContestStateAdapter
  ): void {
    this.communityAdapter = communityAdapter;
    this.contestAdapter = contestAdapter;
  }

  public isConfigured(): boolean {
    return this.getConfig().configured;
  }

  private getLocalCombinedState(): CombinedCommunityContestState | null {
    if (!this.communityAdapter || !this.contestAdapter) return null;
    const comm = this.communityAdapter.getStoreState();
    const cont = this.contestAdapter.getStoreState();
    return {
      users: comm.users,
      sessions: comm.sessions,
      posts: comm.posts,
      reports: comm.reports,
      activeMonthKey: cont.activeMonthKey,
      months: cont.months,
      entries: cont.entries,
      viewBuckets: cont.viewBuckets,
      alerts: cont.alerts,
      auditLogs: cont.auditLogs,
      contentConfig: cont.contentConfig,
      diagnostics: cont.diagnostics,
    };
  }

  private async callGet<T>(action: string, params?: Record<string, string>): Promise<T> {
    const cfg = this.getConfig();
    if (!cfg.configured) throw new Error('Apps Script is not configured.');
    const url = new URL(cfg.webAppUrl);
    url.searchParams.set('action', action);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }
    const resp = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await resp.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Apps Script returned non-JSON response (${resp.status}) on GET ${action}.`);
    }
  }

  private async callPost<T>(
    action: string,
    body: Record<string, unknown>,
    adminEmail = ''
  ): Promise<T> {
    const cfg = this.getConfig();
    if (!cfg.configured) throw new Error('Apps Script is not configured.');
    const effectiveAdminEmail = (adminEmail || '').trim() || DEFAULT_APPS_SCRIPT_OWNER_EMAIL;
    const resp = await fetch(cfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        action,
        apiSecret: cfg.apiSecret,
        adminEmail: effectiveAdminEmail,
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await resp.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Apps Script returned non-JSON response (${resp.status}) on POST ${action}.`);
    }
  }

  private async fetchRemoteSnapshot(): Promise<CombinedCommunityContestState | null> {
    if (!this.dedicatedActionsUnsupported) {
      try {
        const snap = await this.callPost<{
          ok?: boolean;
          error?: string;
          community?: {
            users?: CommunityUserPrivate[];
            sessions?: SyncCommunitySession[];
            posts?: CommunityPostRecord[];
            reports?: CommunityReportRecord[];
          };
          contest?: {
            activeMonthKey?: string;
            months?: ContestMonthRecord[];
            entries?: ContestEntryRecord[];
            alerts?: ContestSuspiciousAlert[];
            auditLogs?: ContestAuditLogRecord[];
            viewBuckets?: SyncContestViewBucket[];
            contentConfig?: ContestEditableContent;
            diagnostics?: ContestSystemDiagnosticRecord[];
          };
        }>('getCommunityContestSnapshot', {});

        if (snap?.ok) {
          return normalizeCloudSnapshotState({
            users: snap.community?.users,
            sessions: snap.community?.sessions,
            posts: snap.community?.posts,
            reports: snap.community?.reports,
            activeMonthKey: snap.contest?.activeMonthKey,
            months: snap.contest?.months,
            entries: snap.contest?.entries,
            alerts: snap.contest?.alerts,
            auditLogs: snap.contest?.auditLogs,
            viewBuckets: snap.contest?.viewBuckets,
            contentConfig: snap.contest?.contentConfig,
            diagnostics: snap.contest?.diagnostics,
          });
        }
        if (snap?.error && /Unknown POST action/i.test(snap.error)) {
          this.dedicatedActionsUnsupported = true;
        }
      } catch (err) {
        console.warn('[AppsScriptSync] Dedicated snapshot fetch warning:', err);
      }
    }

    // Universal row fallback (compatible with older Code.gs deployments)
    try {
      const res = await this.callGet<{
        ok?: boolean;
        item?: { fullContent?: string[] | string };
      }>('getNewsById', { newsId: UNIVERSAL_STORE_NEWS_ID });
      if (!res?.ok || !res.item) return null;
      const rawContent = Array.isArray(res.item.fullContent)
        ? res.item.fullContent.join('')
        : String(res.item.fullContent || '');
      if (!rawContent.trim()) return null;
      const parsed = JSON.parse(rawContent) as Partial<CombinedCommunityContestState>;
      return normalizeCloudSnapshotState(parsed);
    } catch {
      return null;
    }
  }

  public async syncIfNeeded(force = false): Promise<void> {
    if (!this.isConfigured() || !this.communityAdapter || !this.contestAdapter) return;
    const nowMs = Date.now();
    if (!force && nowMs - this.lastSyncedAtMs < SNAPSHOT_TTL_MS) return;

    if (this.inFlightSync) {
      await this.inFlightSync;
      return;
    }

    this.inFlightSync = (async () => {
      try {
        const remote = await this.fetchRemoteSnapshot();
        if (!remote) return;
        const local = this.getLocalCombinedState();
        if (!local) return;
        const merged = mergeCommunityAndContestStates(local, remote);
        this.communityAdapter?.applyMergedStoreState({
          users: merged.users,
          sessions: merged.sessions,
          posts: merged.posts,
          reports: merged.reports,
        });
        this.contestAdapter?.applyMergedStoreState({
          activeMonthKey: merged.activeMonthKey,
          months: merged.months,
          entries: merged.entries,
          viewBuckets: merged.viewBuckets,
          alerts: merged.alerts,
          auditLogs: merged.auditLogs,
          contentConfig: merged.contentConfig,
          diagnostics: merged.diagnostics,
        });
        this.lastSyncedAtMs = Date.now();
      } catch (err) {
        console.warn('[AppsScriptSync] Cloud sync failed (continuing with local state):', err);
      } finally {
        this.inFlightSync = null;
      }
    })();

    await this.inFlightSync;
  }

  private async saveToUniversalRow(
    state: CombinedCommunityContestState,
    adminEmail?: string
  ): Promise<void> {
    const compact = buildCompactStateForUniversalRow(state);
    const chunks = splitStringIntoChunks(JSON.stringify(compact), CHUNK_CHAR_SIZE);
    const effectiveEmail = (adminEmail || '').trim() || DEFAULT_APPS_SCRIPT_OWNER_EMAIL;
    const articleData = {
      newsId: UNIVERSAL_STORE_NEWS_ID,
      title: 'Coffeenadu Community & Contest State Store',
      description: 'Internal durable storage record for Coffeenadu Community & Monthly Contest.',
      fullContent: chunks,
      category: 'System',
      location: 'ಕೊಪ್ಪ',
      language: 'kn',
      status: 'archived',
      featured: false,
      isFeatured: false,
    };

    const updateRes = await this.callPost<{ ok?: boolean; error?: string }>(
      'updateNews',
      { newsId: UNIVERSAL_STORE_NEWS_ID, data: articleData },
      effectiveEmail
    );
    if (updateRes?.ok) return;

    await this.callPost<{ ok?: boolean; error?: string }>(
      'createNews',
      { data: articleData },
      effectiveEmail
    );
  }

  public async pushDelta(
    delta: CloudDeltaPayload,
    options?: { adminEmail?: string; awaitRemote?: boolean }
  ): Promise<void> {
    if (!this.isConfigured()) return;

    const run = async () => {
      const { extraPosts, extraContestEntries, ...primaryDelta } = delta;
      const effectiveEmail = (options?.adminEmail || '').trim() || DEFAULT_APPS_SCRIPT_OWNER_EMAIL;

      if (!this.dedicatedActionsUnsupported) {
        try {
          const send = async (payload: Record<string, unknown>) => {
            const res = await this.callPost<{ ok?: boolean; error?: string }>(
              'upsertCommunityContestDelta',
              payload,
              effectiveEmail
            );
            if (!res?.ok) {
              if (res?.error && /Unknown POST action/i.test(res.error)) {
                this.dedicatedActionsUnsupported = true;
              }
              throw new Error(res?.error || 'Apps Script delta persistence failed.');
            }
          };

          await send(primaryDelta);
          if (Array.isArray(extraPosts)) {
            for (const p of extraPosts) {
              await send({ post: p });
            }
          }
          if (Array.isArray(extraContestEntries)) {
            for (const e of extraContestEntries) {
              await send({ contestEntry: e });
            }
          }
          this.lastSyncedAtMs = Date.now();
          return;
        } catch (err) {
          console.warn(
            '[AppsScriptSync] Dedicated delta push failed, falling back to universal row:',
            err
          );
        }
      }

      const combined = this.getLocalCombinedState();
      if (!combined) return;
      try {
        await this.saveToUniversalRow(combined, effectiveEmail);
        this.lastSyncedAtMs = Date.now();
      } catch (err) {
        console.warn('[AppsScriptSync] Universal row push warning:', err);
      }
    };

    if (options?.awaitRemote) {
      await run();
    } else {
      void run();
    }
  }

  public async uploadPhotoToDrive(
    base64Data: string,
    mime: string,
    ext: string
  ): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const fileName = `community_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    try {
      const uploaded = await this.callPost<{
        ok?: boolean;
        fileId?: string;
        error?: string;
      }>(
        'uploadImage',
        {
          mimeType: mime,
          base64Data,
          fileName,
        },
        DEFAULT_APPS_SCRIPT_OWNER_EMAIL
      );
      if (uploaded?.ok && uploaded.fileId) {
        return `/api/media/drive/${encodeURIComponent(uploaded.fileId)}`;
      }
    } catch (err) {
      console.warn('[AppsScriptSync] Google Drive photo upload fallback to local disk:', err);
    }
    return null;
  }
}
