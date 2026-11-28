import {
  getCommunityMemoryToken,
  setCommunityMemoryToken,
} from './communityClient';
import { getAdmin2AuthHeaders } from './admin2Client';
import type { CommunitySelfProfile, PublicCommunityPost } from '../types/community';
import type {
  ContestAdminOverview,
  ContestEditableContent,
  ContestEntryEligibility,
  ContestMonthRecord,
  ContestMonthStatus,
  ContestPrizeTier,
  ContestPublicOverview,
  ContestViewRecordResult,
  PublicContestEntry,
} from '../types/contest';
import { parseApiJsonResponse } from '../utils/httpResponse';

function buildCommunityHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'CoffeenaduCommunity',
  };
  if (includeJson) headers['Content-Type'] = 'application/json';
  const token = getCommunityMemoryToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function buildAdminHeaders(includeJson = false): Promise<Record<string, string>> {
  return getAdmin2AuthHeaders(
    includeJson ? { 'Content-Type': 'application/json' } : {}
  );
}

async function readJsonSafe<T extends object>(
  resp: Response
): Promise<T & { ok?: boolean; error?: string }> {
  try {
    const rawText = await resp.text();
    return parseApiJsonResponse<T>(resp.status, resp.headers.get('content-type'), rawText);
  } catch {
    return parseApiJsonResponse<T>(resp.status, resp.headers.get('content-type'), '');
  }
}

export async function fetchContestOverview(): Promise<ContestPublicOverview> {
  const resp = await fetch('/api/public/contest/overview', {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await readJsonSafe<ContestPublicOverview>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to load contest overview.');
  }
  return data;
}

export async function fetchContestEntryStats(slugOrId: string): Promise<{
  ok: boolean;
  entry: PublicContestEntry;
  monthLabelEn: string;
  monthLabelKn: string;
  monthStatus: ContestMonthStatus;
  isMonthOpen: boolean;
} | null> {
  try {
    const resp = await fetch(
      `/api/public/contest/entries/${encodeURIComponent(slugOrId)}`,
      { credentials: 'include', cache: 'no-store' }
    );
    if (!resp.ok) return null;
    const data = await readJsonSafe<{
      ok: boolean;
      entry: PublicContestEntry;
      monthLabelEn: string;
      monthLabelKn: string;
      monthStatus: ContestMonthStatus;
      isMonthOpen: boolean;
    }>(resp);
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

export async function recordContestArticleView(
  slugOrId: string,
  options?: { isAdminPreview?: boolean }
): Promise<ContestViewRecordResult | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'CoffeenaduCommunity',
    };
    if (options?.isAdminPreview) {
      headers['X-Admin-Preview'] = '1';
    }
    const resp = await fetch(
      `/api/public/contest/entries/${encodeURIComponent(slugOrId)}/view`,
      {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({}),
      }
    );
    if (!resp.ok) return null;
    const data = await readJsonSafe<ContestViewRecordResult>(resp);
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

export interface SubmitContestNewsInput {
  contributorName: string;
  mobileNumber?: string;
  switchContributor?: boolean;
  title: string;
  description: string;
  location: string;
  photos?: string[];
  confirmOriginalNews: boolean;
  clientSubmissionId?: string;
}

export interface SubmitContestNewsResult {
  ok: boolean;
  duplicatePrevented?: boolean;
  profile: CommunitySelfProfile;
  post: PublicCommunityPost;
  entry: PublicContestEntry;
  permanentPath: string;
}

export async function submitContestNewsEntry(
  input: SubmitContestNewsInput
): Promise<SubmitContestNewsResult> {
  const tryRecoverPublishedEntry = async (): Promise<SubmitContestNewsResult | null> => {
    try {
      const overview = await fetchContestOverview();
      const targetTitle = input.title.trim().toLowerCase();
      const recentMatch = overview.allEligibleEntries.find(
        (e) =>
          e.title.trim().toLowerCase() === targetTitle &&
          Date.now() - Date.parse(e.publishedAt) < 10 * 60_000
      );
      if (recentMatch) {
        return {
          ok: true,
          duplicatePrevented: true,
          profile: {
            fullName: recentMatch.contributorName,
            maskedMobile: '',
            registeredAt: recentMatch.publishedAt,
            status: 'active',
            totalPosts: 1,
          },
          post: {
            id: recentMatch.postId,
            slug: recentMatch.slug,
            authorName: recentMatch.contributorName,
            title: recentMatch.title,
            category: 'monthly-news-contest',
            description: recentMatch.summary || input.description,
            location: recentMatch.location,
            photos: recentMatch.thumbnailUrl ? [recentMatch.thumbnailUrl] : [],
            createdAt: recentMatch.publishedAt,
            updatedAt: recentMatch.publishedAt,
            viewsCount: recentMatch.totalPageViews,
            sharesCount: 0,
            isOwner: true,
          },
          entry: recentMatch,
          permanentPath: `/community/${recentMatch.slug}`,
        };
      }
    } catch {
      // Ignore recovery check failure
    }
    return null;
  };

  let resp: Response;
  try {
    resp = await fetch('/api/public/contest/submit', {
      method: 'POST',
      credentials: 'include',
      headers: buildCommunityHeaders(true),
      body: JSON.stringify(input),
    });
  } catch (networkErr) {
    const recovered = await tryRecoverPublishedEntry();
    if (recovered) return recovered;
    throw networkErr;
  }

  const data = await readJsonSafe<SubmitContestNewsResult & { token?: string | null }>(resp);
  if (!resp.ok || !data.ok) {
    if (resp.status >= 500) {
      const recovered = await tryRecoverPublishedEntry();
      if (recovered) return recovered;
    }
    throw new Error(data.error || 'ಸುದ್ದಿ ಪ್ರಕಟಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.');
  }
  if (data.token) {
    setCommunityMemoryToken(data.token);
  }
  return data;
}

export async function fetchAdminContestOverview(
  monthKey?: string
): Promise<ContestAdminOverview> {
  const query = monthKey ? `?month=${encodeURIComponent(monthKey)}` : '';
  const resp = await fetch(`/api/admin2/contest/overview${query}`, {
    credentials: 'include',
    headers: await buildAdminHeaders(false),
    cache: 'no-store',
  });
  const data = await readJsonSafe<ContestAdminOverview>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to load admin contest management data.');
  }
  return data;
}

export async function updateAdminContestContent(
  payload: Partial<ContestEditableContent>
): Promise<ContestEditableContent> {
  const resp = await fetch('/api/admin2/contest/content', {
    method: 'PUT',
    credentials: 'include',
    headers: await buildAdminHeaders(true),
    body: JSON.stringify(payload),
  });
  const data = await readJsonSafe<{ ok: boolean; contentConfig: ContestEditableContent }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to save Contest content settings.');
  }
  return data.contentConfig;
}

export async function restoreAdminContestContentVersion(
  version?: number
): Promise<ContestEditableContent> {
  const resp = await fetch('/api/admin2/contest/content/restore', {
    method: 'POST',
    credentials: 'include',
    headers: await buildAdminHeaders(true),
    body: JSON.stringify({ version }),
  });
  const data = await readJsonSafe<{ ok: boolean; contentConfig: ContestEditableContent }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to restore previous Contest content version.');
  }
  return data.contentConfig;
}

export async function updateAdminContestEntryEligibility(
  entryId: string,
  eligibility: ContestEntryEligibility,
  reason?: string,
  options?: { hidePost?: boolean }
): Promise<void> {
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (eligibility === 'disqualified' && cleanReason.length < 3) {
    throw new Error('Please enter at least 3 characters for the disqualification reason.');
  }
  const resp = await fetch(
    `/api/admin2/contest/entries/${encodeURIComponent(entryId)}/eligibility`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({
        eligibility,
        reason: cleanReason || undefined,
        hidePost: options?.hidePost === true,
      }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to update entry eligibility.');
  }
}

export interface UpdateAdminContestEntryScorePayload {
  competitionDisplayScore?: number;
  competition_display_score?: number;
  manualScoreAdjustment?: number;
  manual_score_adjustment?: number;
  delta?: number;
  reset?: boolean;
}

export async function updateAdminContestEntryScore(
  entryId: string,
  payload: UpdateAdminContestEntryScorePayload
): Promise<{
  ok: boolean;
  entry: {
    id: string;
    genuineEligibleViews: number;
    genuine_eligible_views: number;
    manualScoreAdjustment: number;
    manual_score_adjustment: number;
    competitionDisplayScore: number;
    competition_display_score: number;
  };
}> {
  const resp = await fetch(
    `/api/admin2/contest/entries/${encodeURIComponent(entryId)}/score`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify(payload),
    }
  );
  const data = await readJsonSafe<{
    ok: boolean;
    entry: {
      id: string;
      genuineEligibleViews: number;
      genuine_eligible_views: number;
      manualScoreAdjustment: number;
      manual_score_adjustment: number;
      competitionDisplayScore: number;
      competition_display_score: number;
    };
  }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to update competition display score.');
  }
  return data;
}

export async function resetAdminContestMonthScores(
  monthKey: string
): Promise<{ ok: boolean; resetCount: number }> {
  const resp = await fetch(
    `/api/admin2/contest/months/${encodeURIComponent(monthKey)}/reset-scores`,
    {
      method: 'POST',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({}),
    }
  );
  const data = await readJsonSafe<{ ok: boolean; resetCount: number }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to restore original genuine-view rankings.');
  }
  return data;
}

export async function reviewAdminContestAlert(
  alertId: string,
  status: 'open' | 'investigated' | 'dismissed',
  adminNote?: string
): Promise<void> {
  const resp = await fetch(
    `/api/admin2/contest/alerts/${encodeURIComponent(alertId)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({ status, adminNote }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to update alert status.');
  }
}

export async function updateAdminContestMonthConfig(
  monthKey: string,
  payload: {
    startsAtIso: string;
    endsAtIso: string;
    prizes: ContestPrizeTier[];
    status: ContestMonthStatus;
    allowCarryOver?: boolean;
    participationEnabled?: boolean;
    durationDays?: number;
  }
): Promise<ContestMonthRecord> {
  const resp = await fetch(
    `/api/admin2/contest/months/${encodeURIComponent(monthKey)}/config`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify(payload),
    }
  );
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to save month configuration.');
  }
  return data.month;
}

export async function toggleAdminContestParticipation(
  monthKey: string,
  enabled: boolean
): Promise<ContestMonthRecord> {
  const resp = await fetch(
    `/api/admin2/contest/months/${encodeURIComponent(monthKey)}/participation`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({ enabled }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to update competition participation status.');
  }
  return data.month;
}

export async function updateAdminContestParticipantEligibility(
  monthKey: string,
  userId: string,
  eligible: boolean,
  reason?: string
): Promise<ContestMonthRecord> {
  const resp = await fetch(
    `/api/admin2/contest/months/${encodeURIComponent(monthKey)}/participants/${encodeURIComponent(userId)}/eligibility`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({
        eligible,
        reason: typeof reason === 'string' && reason.trim() ? reason.trim() : undefined,
      }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to update participant eligibility.');
  }
  return data.month;
}

export interface AdminWinnerSelectionInput {
  rank: 1 | 2 | 3 | 4 | 5;
  entryId: string;
  prizeAmountInr: number;
  selectionNote?: string;
  paymentStatus: 'pending' | 'processing' | 'paid';
  paymentDate?: string;
  paymentReference?: string;
}

export async function saveAdminContestWinners(
  monthKey: string,
  winners: AdminWinnerSelectionInput[]
): Promise<ContestMonthRecord> {
  const resp = await fetch(
    `/api/admin2/contest/months/${encodeURIComponent(monthKey)}/winners`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({ winners }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to save winners.');
  }
  return data.month;
}

export async function finalizeAdminContestMonth(
  monthKey: string,
  publishWinners: boolean
): Promise<ContestMonthRecord> {
  const resp = await fetch(
    `/api/admin2/contest/months/${encodeURIComponent(monthKey)}/finalize`,
    {
      method: 'POST',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({ publishWinners }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to finalize competition month.');
  }
  return data.month;
}

export async function toggleAdminContestWinnersPublished(
  monthKey: string,
  published: boolean
): Promise<ContestMonthRecord> {
  const resp = await fetch(
    `/api/admin2/contest/months/${encodeURIComponent(monthKey)}/publish-winners`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({ published }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to update winner publication visibility.');
  }
  return data.month;
}

export async function openNextAdminContestMonth(
  options?: string | { monthKey?: string; startDateIso?: string; durationDays?: number }
): Promise<ContestMonthRecord> {
  const body =
    typeof options === 'string'
      ? { monthKey: options }
      : {
          monthKey: options?.monthKey,
          startDateIso: options?.startDateIso,
          durationDays: options?.durationDays,
        };
  const resp = await fetch('/api/admin2/contest/months/open-next', {
    method: 'POST',
    credentials: 'include',
    headers: await buildAdminHeaders(true),
    body: JSON.stringify(body),
  });
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to open next competition period.');
  }
  return data.month;
}

export async function downloadAdminContestExport(
  monthKey: string,
  format: 'csv' | 'json',
  scope: 'entries' | 'leaderboard' = 'entries'
): Promise<void> {
  const scopeQuery = scope === 'leaderboard' ? '&scope=leaderboard' : '';
  const resp = await fetch(
    `/api/admin2/contest/export?month=${encodeURIComponent(monthKey)}&format=${format}${scopeQuery}`,
    {
      credentials: 'include',
      headers: await buildAdminHeaders(false),
    }
  );
  if (!resp.ok) {
    throw new Error('Failed to export competition statistics.');
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    scope === 'leaderboard'
      ? `coffeenadu-leaderboard-${monthKey}.${format}`
      : `coffeenadu-contest-${monthKey}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
