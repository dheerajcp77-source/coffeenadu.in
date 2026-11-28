/**
 * Shared Cloudflare Pages Store for Coffeenadu Community & Monthly News Contest.
 *
 * Root Fix:
 * - Unifies Community posts and Contest entries into ONE shared state across
 *   `_cfCommunity.ts` and `_cfContest.ts` so every contest article automatically
 *   appears in the Unified Community Feed, `/contest` leaderboard, and Admin Panel.
 * - Persists mutations and hydrates reads directly from Google Apps Script
 *   (`APPS_SCRIPT_WEBAPP_URL` + `APPS_SCRIPT_API_SECRET`) whenever configured,
 *   eliminating Cloudflare Worker per-isolate/per-POP data divergence.
 * - Uploads public Base64 photos to Google Drive (`/api/media/drive/<fileId>`)
 *   when Apps Script is configured instead of dropping photos.
 */

import type {
  CommunityPostRecord,
  CommunityReportRecord,
  CommunityUserPrivate,
} from '../src/types/community';
import type {
  ContestAuditLogRecord,
  ContestEntryRecord,
  ContestMonthRecord,
  ContestSuspiciousAlert,
} from '../src/types/contest';
import {
  MAX_COMMUNITY_PHOTOS,
  validateCommunityPhotoInput,
} from '../src/utils/communityHelpers';
import {
  createInitialContestMonthRecord,
  normalizeEntryScoreFields,
} from '../src/utils/contestHelpers';

export interface PagesEnvLike {
  APPS_SCRIPT_WEBAPP_URL?: string;
  APPS_SCRIPT_API_SECRET?: string;
}

export interface CfCommunitySession {
  tokenHash: string;
  userId: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface CfContestViewBucket {
  entryId: string;
  visitorHash: string;
  lastEligibleAtMs: number;
  hitCount: number;
}

export interface CfSharedCommunityContestState {
  users: CommunityUserPrivate[];
  sessions: CfCommunitySession[];
  posts: CommunityPostRecord[];
  reports: CommunityReportRecord[];
  activeMonthKey: string;
  months: ContestMonthRecord[];
  entries: ContestEntryRecord[];
  viewBuckets: CfContestViewBucket[];
  alerts: ContestSuspiciousAlert[];
  auditLogs: ContestAuditLogRecord[];
}

export interface CfDeltaPayload {
  user?: CommunityUserPrivate;
  session?: CfCommunitySession;
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
  viewBuckets?: CfContestViewBucket[];
}

const CF_SHARED_CACHE_KEY = 'https://coffeenadu.internal/cf-shared-community-contest-v2';
const UNIVERSAL_STORE_NEWS_ID = 'cn_sys_community_contest_store_v1';
const DEFAULT_APPS_SCRIPT_OWNER_EMAIL = 'shwethashwethak85@gmail.com';
const SNAPSHOT_TTL_MS = 1_500;
const APPS_SCRIPT_TIMEOUT_MS = 18_000;
const CHUNK_CHAR_SIZE = 32_000;

let sharedMemState: CfSharedCommunityContestState | null = null;
let lastHydratedAtMs = 0;
let dedicatedActionsUnsupported = false;

function isValidAppsScriptExecUrl(url: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/i.test(url.trim());
}

export function getCfAppsScriptConfig(env?: PagesEnvLike): {
  webAppUrl: string;
  apiSecret: string;
  configured: boolean;
} {
  const webAppUrl = (env?.APPS_SCRIPT_WEBAPP_URL || '').trim();
  const apiSecret = (env?.APPS_SCRIPT_API_SECRET || '').trim();
  const configured = Boolean(
    webAppUrl && isValidAppsScriptExecUrl(webAppUrl) && apiSecret.length >= 12
  );
  return { webAppUrl, apiSecret, configured };
}

export async function callSharedAppsScriptGet<T>(
  env: PagesEnvLike | undefined,
  action: string,
  params?: Record<string, string>
): Promise<T> {
  const cfg = getCfAppsScriptConfig(env);
  if (!cfg.configured) {
    throw new Error('Apps Script is not configured.');
  }
  const url = new URL(cfg.webAppUrl);
  url.searchParams.set('action', action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, v);
      }
    }
  }
  const fetchInit: RequestInit = { method: 'GET', redirect: 'follow' };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    fetchInit.signal = AbortSignal.timeout(APPS_SCRIPT_TIMEOUT_MS);
  }
  const resp = await fetch(url.toString(), fetchInit);
  const text = await resp.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Apps Script returned non-JSON response (${resp.status}) while running GET ${action}.`
    );
  }
}

export async function callSharedAppsScriptPost<T>(
  env: PagesEnvLike | undefined,
  action: string,
  body: Record<string, unknown>,
  adminEmail = ''
): Promise<T> {
  const cfg = getCfAppsScriptConfig(env);
  if (!cfg.configured) {
    throw new Error('Apps Script is not configured.');
  }
  const effectiveAdminEmail = (adminEmail || '').trim() || DEFAULT_APPS_SCRIPT_OWNER_EMAIL;
  const fetchInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      action,
      apiSecret: cfg.apiSecret,
      adminEmail: effectiveAdminEmail,
    }),
    redirect: 'follow',
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    fetchInit.signal = AbortSignal.timeout(APPS_SCRIPT_TIMEOUT_MS);
  }
  const resp = await fetch(cfg.webAppUrl, fetchInit);
  const text = await resp.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Apps Script returned non-JSON response (${resp.status}) while running ${action}.`
    );
  }
}

export function createEmptySharedState(now = new Date()): CfSharedCommunityContestState {
  const initialMonth = createInitialContestMonthRecord(now);
  return {
    users: [],
    sessions: [],
    posts: [],
    reports: [],
    activeMonthKey: initialMonth.monthKey,
    months: [initialMonth],
    entries: [],
    viewBuckets: [],
    alerts: [],
    auditLogs: [],
  };
}

function normalizeLoadedState(
  raw: Partial<CfSharedCommunityContestState> | null | undefined,
  now = new Date()
): CfSharedCommunityContestState {
  const months =
    Array.isArray(raw?.months) && raw.months.length > 0
      ? raw.months
      : [createInitialContestMonthRecord(now)];

  // Extend untouched empty Nov 2026 bootstrap month cleanly to Dec 2026 if needed
  const entries = Array.isArray(raw?.entries)
    ? raw.entries.map((entry) => {
        normalizeEntryScoreFields(entry);
        return entry;
      })
    : [];
  if (
    months.length === 1 &&
    months[0].monthKey === '2026-11' &&
    months[0].endsAtIso === '2026-11-30T23:59:59+05:30' &&
    !months[0].winnersPublished &&
    (!Array.isArray(months[0].winners) || months[0].winners.length === 0) &&
    entries.length === 0
  ) {
    const extended = createInitialContestMonthRecord(now);
    months[0] = {
      ...months[0],
      monthKey: extended.monthKey,
      displayLabelEn: extended.displayLabelEn,
      displayLabelKn: extended.displayLabelKn,
      startsAtIso: extended.startsAtIso,
      endsAtIso: extended.endsAtIso,
      status: 'open',
      updatedAt: now.toISOString(),
    };
  }

  const nowMs = now.getTime();
  for (const m of months) {
    if (m.status === 'open' && nowMs > Date.parse(m.endsAtIso)) {
      m.status = 'closed';
      m.updatedAt = now.toISOString();
    }
  }

  const activeMonthKey =
    typeof raw?.activeMonthKey === 'string' &&
    months.some((m) => m.monthKey === raw.activeMonthKey)
      ? raw.activeMonthKey
      : months[0].monthKey;

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
  };
}

function mergeTwoStates(
  remote: CfSharedCommunityContestState,
  local: CfSharedCommunityContestState | null
): CfSharedCommunityContestState {
  if (!local) return remote;

  // Merge users by id
  const userMap = new Map<string, CommunityUserPrivate>();
  for (const u of [...local.users, ...remote.users]) {
    if (!u?.id) continue;
    const prev = userMap.get(u.id);
    if (!prev || (u.lastActiveAt || '') >= (prev.lastActiveAt || '')) {
      userMap.set(u.id, u);
    }
  }

  // Merge sessions by tokenHash
  const nowMs = Date.now();
  const sessionMap = new Map<string, CfCommunitySession>();
  for (const s of [...local.sessions, ...remote.sessions]) {
    if (!s?.tokenHash || s.expiresAtMs <= nowMs) continue;
    sessionMap.set(s.tokenHash, s);
  }

  // Merge posts by id (union of remote & local)
  const postMap = new Map<string, CommunityPostRecord>();
  for (const p of local.posts) {
    if (p?.id) postMap.set(p.id, p);
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

  // Merge entries by id (union of remote & local)
  const entryMap = new Map<string, ContestEntryRecord>();
  for (const le of local.entries) {
    if (le?.id) {
      normalizeEntryScoreFields(le);
      entryMap.set(le.id, le);
    }
  }
  for (const re of remote.entries) {
    if (!re?.id) continue;
    const le = entryMap.get(re.id);
    if (!le) {
      normalizeEntryScoreFields(re);
      entryMap.set(re.id, re);
    } else {
      const newer = (le.updatedAt || '') > (re.updatedAt || '') ? le : re;
      const merged: ContestEntryRecord = {
        ...newer,
        eligibleViews: Math.max(Number(re.eligibleViews) || 0, Number(le.eligibleViews) || 0),
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
    if (!prev || r.status === 'resolved') {
      reportMap.set(r.id, r);
    }
  }

  // Merge months by monthKey
  const monthMap = new Map<string, ContestMonthRecord>();
  for (const m of [...local.months, ...remote.months]) {
    if (!m?.monthKey) continue;
    const prev = monthMap.get(m.monthKey);
    if (!prev || (m.updatedAt || '') >= (prev.updatedAt || '')) {
      monthMap.set(m.monthKey, m);
    }
  }

  // Merge alerts by id
  const alertMap = new Map<string, ContestSuspiciousAlert>();
  for (const a of [...local.alerts, ...remote.alerts]) {
    if (!a?.id) continue;
    alertMap.set(a.id, a);
  }

  // Merge auditLogs by id
  const auditMap = new Map<string, ContestAuditLogRecord>();
  for (const l of [...local.auditLogs, ...remote.auditLogs]) {
    if (!l?.id) continue;
    auditMap.set(l.id, l);
  }

  const bucketMap = new Map<string, CfContestViewBucket>();
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
  state: CfSharedCommunityContestState
): CfSharedCommunityContestState {
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
  };
}

async function loadStateFromUniversalNewsRow(
  env: PagesEnvLike | undefined
): Promise<CfSharedCommunityContestState | null> {
  try {
    const res = await callSharedAppsScriptGet<{
      ok?: boolean;
      item?: {
        newsId?: string;
        fullContent?: string[] | string;
      };
    }>(env, 'getNewsById', { newsId: UNIVERSAL_STORE_NEWS_ID });
    if (!res?.ok || !res.item) return null;
    const rawContent = Array.isArray(res.item.fullContent)
      ? res.item.fullContent.join('')
      : String(res.item.fullContent || '');
    if (!rawContent.trim()) return null;
    const parsed = JSON.parse(rawContent) as Partial<CfSharedCommunityContestState>;
    return normalizeLoadedState(parsed);
  } catch {
    return null;
  }
}

async function saveStateToUniversalNewsRow(
  env: PagesEnvLike | undefined,
  state: CfSharedCommunityContestState,
  adminEmail?: string
): Promise<void> {
  const compact = buildCompactStateForUniversalRow(state);
  const serialized = JSON.stringify(compact);
  const chunks = splitStringIntoChunks(serialized, CHUNK_CHAR_SIZE);
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

  const updateRes = await callSharedAppsScriptPost<{ ok?: boolean; error?: string }>(
    env,
    'updateNews',
    {
      newsId: UNIVERSAL_STORE_NEWS_ID,
      data: articleData,
    },
    effectiveEmail
  );

  if (updateRes?.ok) return;

  await callSharedAppsScriptPost<{ ok?: boolean; error?: string }>(
    env,
    'createNews',
    {
      data: articleData,
    },
    effectiveEmail
  );
}

async function writeEdgeCache(state: CfSharedCommunityContestState): Promise<void> {
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      await cache.put(
        CF_SHARED_CACHE_KEY,
        new Response(JSON.stringify(state), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      );
    }
  } catch {
    // ignore edge cache write error
  }
}

async function readEdgeCache(): Promise<CfSharedCommunityContestState | null> {
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      const hit = await cache.match(CF_SHARED_CACHE_KEY);
      if (hit) {
        const parsed = (await hit.json()) as Partial<CfSharedCommunityContestState>;
        return normalizeLoadedState(parsed);
      }
    }
  } catch {
    // ignore edge cache read error
  }
  return null;
}

export async function loadSharedCommunityContestState(
  env?: PagesEnvLike,
  forceRefresh = false
): Promise<CfSharedCommunityContestState> {
  const cfg = getCfAppsScriptConfig(env);
  const nowMs = Date.now();

  if (!sharedMemState) {
    const edgeCached = await readEdgeCache();
    if (edgeCached) {
      sharedMemState = edgeCached;
    }
  }

  if (cfg.configured) {
    if (!forceRefresh && sharedMemState && nowMs - lastHydratedAtMs < SNAPSHOT_TTL_MS) {
      return sharedMemState;
    }

    if (!dedicatedActionsUnsupported) {
      try {
        const snap = await callSharedAppsScriptPost<{
          ok?: boolean;
          error?: string;
          community?: {
            users?: CommunityUserPrivate[];
            sessions?: CfCommunitySession[];
            posts?: CommunityPostRecord[];
            reports?: CommunityReportRecord[];
          };
          contest?: {
            activeMonthKey?: string;
            months?: ContestMonthRecord[];
            entries?: ContestEntryRecord[];
            alerts?: ContestSuspiciousAlert[];
            auditLogs?: ContestAuditLogRecord[];
            viewBuckets?: CfContestViewBucket[];
          };
        }>(env, 'getCommunityContestSnapshot', {});

        if (snap?.ok) {
          const hydrated = normalizeLoadedState({
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
          });
          sharedMemState = mergeTwoStates(hydrated, sharedMemState);
          lastHydratedAtMs = Date.now();
          await writeEdgeCache(sharedMemState);
          return sharedMemState;
        }
        if (snap?.error && /Unknown POST action/i.test(snap.error)) {
          dedicatedActionsUnsupported = true;
        }
      } catch (err) {
        console.warn('[CF CommunityContest] Apps Script snapshot fetch failed:', err);
      }
    }

    // Universal fallback using getNewsById('cn_sys_community_contest_store_v1') on existing Code.gs
    const universalHydrated = await loadStateFromUniversalNewsRow(env);
    if (universalHydrated) {
      sharedMemState = mergeTwoStates(universalHydrated, sharedMemState);
      lastHydratedAtMs = Date.now();
      await writeEdgeCache(sharedMemState);
      return sharedMemState;
    }
  }

  if (sharedMemState) return sharedMemState;
  const cached = await readEdgeCache();
  if (cached) {
    sharedMemState = cached;
    return sharedMemState;
  }
  sharedMemState = createEmptySharedState();
  return sharedMemState;
}

export async function persistSharedCommunityContestDelta(
  env: PagesEnvLike | undefined,
  state: CfSharedCommunityContestState,
  delta: CfDeltaPayload,
  options?: { bestEffort?: boolean; adminEmail?: string }
): Promise<void> {
  sharedMemState = state;
  lastHydratedAtMs = Date.now();
  await writeEdgeCache(state);

  const cfg = getCfAppsScriptConfig(env);
  if (!cfg.configured) return;

  const { extraPosts, extraContestEntries, ...primaryDelta } = delta;
  const effectiveEmail = (options?.adminEmail || '').trim() || DEFAULT_APPS_SCRIPT_OWNER_EMAIL;

  if (!dedicatedActionsUnsupported) {
    try {
      const sendDelta = async (payload: Record<string, unknown>) => {
        const res = await callSharedAppsScriptPost<{ ok?: boolean; error?: string }>(
          env,
          'upsertCommunityContestDelta',
          payload,
          effectiveEmail
        );
        if (!res?.ok) {
          if (res?.error && /Unknown POST action/i.test(res.error)) {
            dedicatedActionsUnsupported = true;
          }
          throw new Error(res?.error || 'Failed to save community/contest record to Google Sheets.');
        }
      };

      await sendDelta(primaryDelta);
      if (Array.isArray(extraPosts) && extraPosts.length > 0) {
        for (const p of extraPosts) {
          await sendDelta({ post: p });
        }
      }
      if (Array.isArray(extraContestEntries) && extraContestEntries.length > 0) {
        for (const e of extraContestEntries) {
          await sendDelta({ contestEntry: e });
        }
      }
      return;
    } catch (err) {
      console.warn(
        '[CF CommunityContest] Dedicated delta persistence failed, falling back to universal row:',
        err
      );
    }
  }

  // Universal fallback: persist full state into the existing News sheet via updateNews/createNews
  try {
    await saveStateToUniversalNewsRow(env, state, effectiveEmail);
  } catch (err) {
    console.warn('[CF CommunityContest] Universal row persistence warning:', err);
  }
}

export async function persistPublicPhotosOnCf(
  env: PagesEnvLike | undefined,
  rawPhotos: unknown
): Promise<{ ok: boolean; photos: string[]; error?: string; storageFailure?: boolean }> {
  if (!Array.isArray(rawPhotos) || rawPhotos.length === 0) {
    return { ok: true, photos: [] };
  }
  if (rawPhotos.length > MAX_COMMUNITY_PHOTOS) {
    return {
      ok: false,
      photos: [],
      error: `ಗರಿಷ್ಠ ${MAX_COMMUNITY_PHOTOS} ಫೋಟೋಗಳು ಮಾತ್ರ.`,
    };
  }

  const cfg = getCfAppsScriptConfig(env);
  const validated: Array<{
    index: number;
    kind: 'existing-media' | 'data-url';
    raw: string;
    ext: string;
    mime: string;
  }> = [];

  for (let i = 0; i < rawPhotos.length; i++) {
    const item = rawPhotos[i];
    const check = validateCommunityPhotoInput(item);
    if (!check.ok) {
      return { ok: false, photos: [], error: check.error || 'ಅಮಾನ್ಯ ಫೋಟೋ ಫೈಲ್.' };
    }
    validated.push({
      index: i,
      kind: check.kind || 'existing-media',
      raw: String(item).trim(),
      ext: check.ext || 'jpg',
      mime: check.mime || 'image/jpeg',
    });
  }

  const outPhotos = await Promise.all(
    validated.map(async (entry) => {
      if (entry.kind === 'existing-media' || !cfg.configured) {
        return entry.raw;
      }
      try {
        const cleanBase64 = entry.raw.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const uploaded = await callSharedAppsScriptPost<{
          ok?: boolean;
          fileId?: string;
          error?: string;
        }>(
          env,
          'uploadImage',
          {
            mimeType: entry.mime,
            base64Data: cleanBase64,
            fileName: `community_${Date.now().toString(36)}_${entry.index + 1}.${entry.ext}`,
          },
          DEFAULT_APPS_SCRIPT_OWNER_EMAIL
        );
        if (uploaded?.ok && uploaded.fileId) {
          return `/api/media/drive/${encodeURIComponent(uploaded.fileId)}`;
        }
      } catch (err) {
        console.warn('[CF CommunityContest] Drive upload fallback to inline data URL:', err);
      }
      return entry.raw;
    })
  );

  return { ok: true, photos: outPhotos };
}

export function syncContestEntriesWithPost(
  state: CfSharedCommunityContestState,
  post: CommunityPostRecord
): ContestEntryRecord[] {
  const touched: ContestEntryRecord[] = [];
  for (const entry of state.entries) {
    if (entry.postId !== post.id) continue;
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
      touched.push(entry);
    }
  }
  return touched;
}

export function handlePostDeletedInSharedState(
  state: CfSharedCommunityContestState,
  postId: string
): { deletedByPostId?: string; updatedEntries: ContestEntryRecord[] } {
  const updatedEntries: ContestEntryRecord[] = [];
  let removedAny = false;

  state.entries = state.entries.filter((entry) => {
    if (entry.postId !== postId) return true;
    const month = state.months.find((m) => m.monthKey === entry.competitionMonth);
    if (month?.status === 'finalized') {
      entry.eligibility = 'disqualified';
      entry.disqualificationReason = entry.disqualificationReason || 'Source post deleted';
      entry.updatedAt = new Date().toISOString();
      updatedEntries.push(entry);
      return true;
    }
    removedAny = true;
    return false;
  });

  return {
    deletedByPostId: removedAny ? postId : undefined,
    updatedEntries,
  };
}
