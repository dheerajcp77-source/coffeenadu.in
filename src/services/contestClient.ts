import {
  getCommunityMemoryToken,
  setCommunityMemoryToken,
} from './communityClient';
import { getAdmin2AuthHeaders } from './admin2Client';
import type { CommunitySelfProfile, PublicCommunityPost } from '../types/community';
import type {
  ContestAdminOverview,
  ContestEntryEligibility,
  ContestMonthRecord,
  ContestMonthStatus,
  ContestPrizeTier,
  ContestPublicOverview,
  ContestViewRecordResult,
  PublicContestEntry,
} from '../types/contest';

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

async function readJsonSafe<T>(resp: Response): Promise<T & { ok?: boolean; error?: string }> {
  try {
    return (await resp.json()) as T & { ok?: boolean; error?: string };
  } catch {
    return { ok: false, error: 'ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯೆ ದೋಷ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.' } as T & {
      ok?: boolean;
      error?: string;
    };
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
  const resp = await fetch('/api/public/contest/submit', {
    method: 'POST',
    credentials: 'include',
    headers: buildCommunityHeaders(true),
    body: JSON.stringify(input),
  });
  const data = await readJsonSafe<SubmitContestNewsResult & { token?: string | null }>(resp);
  if (!resp.ok || !data.ok) {
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

export async function updateAdminContestEntryEligibility(
  entryId: string,
  eligibility: ContestEntryEligibility,
  reason?: string
): Promise<void> {
  const resp = await fetch(
    `/api/admin2/contest/entries/${encodeURIComponent(entryId)}/eligibility`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: await buildAdminHeaders(true),
      body: JSON.stringify({ eligibility, reason }),
    }
  );
  const data = await readJsonSafe<{ ok: boolean }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to update entry eligibility.');
  }
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
  monthKey?: string
): Promise<ContestMonthRecord> {
  const resp = await fetch('/api/admin2/contest/months/open-next', {
    method: 'POST',
    credentials: 'include',
    headers: await buildAdminHeaders(true),
    body: JSON.stringify({ monthKey }),
  });
  const data = await readJsonSafe<{ ok: boolean; month: ContestMonthRecord }>(resp);
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Failed to open next competition month.');
  }
  return data.month;
}

export async function downloadAdminContestExport(
  monthKey: string,
  format: 'csv' | 'json'
): Promise<void> {
  const resp = await fetch(
    `/api/admin2/contest/export?month=${encodeURIComponent(monthKey)}&format=${format}`,
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
  a.download = `coffeenadu-contest-${monthKey}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
