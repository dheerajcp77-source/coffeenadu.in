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
import { createInitialContestMonthRecord } from '../src/utils/contestHelpers';

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
const SNAPSHOT_TTL_MS = 3_000;
const APPS_SCRIPT_TIMEOUT_MS = 18_000;

let sharedMemState: CfSharedCommunityContestState | null = null;
let lastHydratedAtMs = 0;

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
  const fetchInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      action,
      apiSecret: cfg.apiSecret,
      adminEmail,
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
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
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
  // If remote Apps Script has data or local is empty, remote is authoritative.
  // Also preserve any local-only records created in the current isolate if remote hadn't received them yet.
  const remotePostIds = new Set(remote.posts.map((p) => p.id));
  const remoteEntryIds = new Set(remote.entries.map((e) => e.id));
  const remoteUserIds = new Set(remote.users.map((u) => u.id));
  const remoteSessionHashes = new Set(remote.sessions.map((s) => s.tokenHash));

  if (remote.posts.length === 0 && remote.entries.length === 0 && (local.posts.length > 0 || local.entries.length > 0)) {
    // Only preserve if remote returned empty while local had items? No—if an admin deleted the last post on remote,
    // remote IS authoritative when hydrated cleanly. Simply return remote!
    return remote;
  }

  void remotePostIds;
  void remoteEntryIds;
  void remoteUserIds;
  void remoteSessionHashes;
  return remote;
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

  if (cfg.configured) {
    if (!forceRefresh && sharedMemState && nowMs - lastHydratedAtMs < SNAPSHOT_TTL_MS) {
      return sharedMemState;
    }
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
      if (snap?.error) {
        console.warn('[CF CommunityContest] Apps Script snapshot error:', snap.error);
      }
    } catch (err) {
      console.warn('[CF CommunityContest] Apps Script snapshot fetch failed:', err);
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

  const sendDelta = async (payload: Record<string, unknown>) => {
    const res = await callSharedAppsScriptPost<{ ok?: boolean; error?: string }>(
      env,
      'upsertCommunityContestDelta',
      payload,
      options?.adminEmail || ''
    );
    if (!res?.ok) {
      throw new Error(res?.error || 'Failed to save community/contest record to Google Sheets.');
    }
  };

  try {
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
  } catch (err) {
    if (options?.bestEffort) {
      console.warn('[CF CommunityContest] Best-effort persistence skipped:', err);
      return;
    }
    throw err;
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
  const outPhotos: string[] = [];

  for (let i = 0; i < rawPhotos.length; i++) {
    const item = rawPhotos[i];
    const check = validateCommunityPhotoInput(item);
    if (!check.ok) {
      return { ok: false, photos: [], error: check.error || 'ಅಮಾನ್ಯ ಫೋಟೋ ಫೈಲ್.' };
    }

    if (check.kind === 'existing-media') {
      outPhotos.push(String(item).trim());
      continue;
    }

    if (check.kind === 'data-url') {
      const dataUrl = String(item).trim();
      if (!cfg.configured) {
        outPhotos.push(dataUrl);
        continue;
      }

      const ext = check.ext || 'jpg';
      const mimeType = check.mime || 'image/jpeg';
      try {
        const uploaded = await callSharedAppsScriptPost<{
          ok?: boolean;
          fileId?: string;
          error?: string;
        }>(env, 'uploadPublicCommunityImage', {
          mimeType,
          base64Data: dataUrl,
          fileName: `community_${Date.now().toString(36)}_${i + 1}.${ext}`,
        });
        if (!uploaded?.ok || !uploaded.fileId) {
          return {
            ok: false,
            photos: [],
            storageFailure: true,
            error:
              uploaded?.error ||
              'ಫೋಟೋವನ್ನು Google Drive ನಲ್ಲಿ ಶಾಶ್ವತವಾಗಿ ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
          };
        }
        outPhotos.push(`/api/media/drive/${encodeURIComponent(uploaded.fileId)}`);
      } catch (err) {
        return {
          ok: false,
          photos: [],
          storageFailure: true,
          error:
            err instanceof Error
              ? err.message
              : 'ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        };
      }
    }
  }

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
