import type {
  DirectoryModuleId,
  HomepageSectionConfig,
  ListingStatus,
  LocalityOption,
  PlatformAnalyticsSummary,
  PlatformBootstrapPayload,
  PlatformListing,
  PlatformQuiz,
  PlatformReport,
  QuizLeaderboardEntry,
  UserSavedBundle,
  WeatherConfig,
  WeatherRainfallRecord,
} from '../types/platform';
import { getAdmin2AuthHeaders } from './admin2Client';

const SAVED_STORAGE_KEY = 'coffeenadu_platform_saved_v1';
const SESSION_STORAGE_KEY = 'coffeenadu_platform_session_v1';

function getOrCreateSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = `cn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return '';
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// =========================================================
// CLIENT SAVED ITEMS STORAGE
// =========================================================

export function loadSavedBundle(): UserSavedBundle {
  try {
    const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
    if (!raw) {
      return { articles: [], businesses: [], jobs: [], marketplace: [], otherListings: [] };
    }
    const parsed = JSON.parse(raw) as Partial<UserSavedBundle>;
    return {
      articles: Array.isArray(parsed.articles) ? parsed.articles : [],
      businesses: Array.isArray(parsed.businesses) ? parsed.businesses : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      marketplace: Array.isArray(parsed.marketplace) ? parsed.marketplace : [],
      otherListings: Array.isArray(parsed.otherListings) ? parsed.otherListings : [],
    };
  } catch {
    return { articles: [], businesses: [], jobs: [], marketplace: [], otherListings: [] };
  }
}

export function saveSavedBundle(bundle: UserSavedBundle): void {
  try {
    window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    // ignore quota issues
  }
}

export function toggleSavedListingInBundle(
  bundle: UserSavedBundle,
  module: DirectoryModuleId,
  listingId: string
): UserSavedBundle {
  const bucketKey: keyof UserSavedBundle =
    module === 'businesses'
      ? 'businesses'
      : module === 'jobs'
        ? 'jobs'
        : module === 'marketplace'
          ? 'marketplace'
          : 'otherListings';
  const current = bundle[bucketKey];
  const exists = current.includes(listingId);
  const nextBucket = exists ? current.filter((id) => id !== listingId) : [listingId, ...current];
  const next: UserSavedBundle = { ...bundle, [bucketKey]: nextBucket };
  saveSavedBundle(next);
  return next;
}

// =========================================================
// PUBLIC PLATFORM API CALLS
// =========================================================

export async function fetchPlatformBootstrap(): Promise<PlatformBootstrapPayload> {
  const res = await fetch('/api/platform/bootstrap', { credentials: 'same-origin' });
  return parseJson<PlatformBootstrapPayload>(res);
}

export async function fetchPlatformListings(params?: {
  module?: string;
  category?: string;
  location?: string;
  q?: string;
  featured?: boolean;
  limit?: number;
}): Promise<{ ok: boolean; total: number; listings: PlatformListing[] }> {
  const qs = new URLSearchParams();
  if (params?.module) qs.set('module', params.module);
  if (params?.category) qs.set('category', params.category);
  if (params?.location) qs.set('location', params.location);
  if (params?.q) qs.set('q', params.q);
  if (params?.featured) qs.set('featured', '1');
  if (params?.limit) qs.set('limit', String(params.limit));
  const res = await fetch(`/api/platform/listings?${qs.toString()}`);
  return parseJson(res);
}

export async function recordListingEnquiry(
  listingId: string,
  type: 'call' | 'whatsapp' | 'apply'
): Promise<void> {
  try {
    await fetch(`/api/platform/listings/${encodeURIComponent(listingId)}/enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
  } catch {
    // non-blocking analytics
  }
}

export async function submitPublicListing(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; listing: PlatformListing; message: string }> {
  const res = await fetch('/api/platform/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function fetchMySubmissions(
  uid: string
): Promise<{ ok: boolean; listings: PlatformListing[] }> {
  const res = await fetch(`/api/platform/my-submissions?uid=${encodeURIComponent(uid)}`);
  return parseJson(res);
}

export async function submitListingReport(payload: {
  listingId: string;
  reason: string;
  details: string;
  reporterName?: string;
  reporterContact?: string;
}): Promise<{ ok: boolean; report: PlatformReport }> {
  const res = await fetch('/api/platform/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function fetchPlatformGames(): Promise<{
  ok: boolean;
  quizzes: PlatformQuiz[];
  wordPuzzles: Array<{ id: string; wordKn: string; syllables: string[]; hintKn: string; hintEn: string }>;
  leaderboard: QuizLeaderboardEntry[];
}> {
  const res = await fetch('/api/platform/games');
  return parseJson(res);
}

export async function submitQuizAnswers(
  quizId: string,
  payload: { answers: number[]; playerName: string; location: string; durationSec: number }
): Promise<{
  ok: boolean;
  result: { score: number; total: number; percentage: number };
  leaderboard: QuizLeaderboardEntry[];
}> {
  const res = await fetch(`/api/platform/games/${encodeURIComponent(quizId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export function trackPlatformEvent(payload: {
  type: 'page_view' | 'whatsapp_share' | 'search';
  module?: string;
  searchTerm?: string;
  location?: string;
}): void {
  try {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    void fetch('/api/platform/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        device: isMobile ? 'mobile' : 'desktop',
        sessionId: getOrCreateSessionId(),
      }),
      keepalive: true,
    });
  } catch {
    // non-blocking
  }
}

// =========================================================
// ADMIN 2.0 PLATFORM MANAGEMENT CALLS
// =========================================================

export async function fetchAdminPlatformOverview(): Promise<{
  ok: boolean;
  analytics: PlatformAnalyticsSummary;
  localities: LocalityOption[];
  homepageSections: HomepageSectionConfig[];
  weatherConfig: WeatherConfig;
}> {
  const res = await fetch('/api/admin2/platform/overview', {
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function fetchAdminPlatformListings(params?: {
  module?: string;
  status?: string;
  q?: string;
}): Promise<{ ok: boolean; total: number; listings: PlatformListing[] }> {
  const qs = new URLSearchParams();
  if (params?.module) qs.set('module', params.module);
  if (params?.status) qs.set('status', params.status);
  if (params?.q) qs.set('q', params.q);
  const res = await fetch(`/api/admin2/platform/listings?${qs.toString()}`, {
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function createAdminPlatformListing(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; listing: PlatformListing }> {
  const res = await fetch('/api/admin2/platform/listings', {
    method: 'POST',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function updateAdminPlatformListing(
  id: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; listing: PlatformListing }> {
  const res = await fetch(`/api/admin2/platform/listings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function moderateAdminPlatformListing(
  id: string,
  patch: {
    status?: ListingStatus;
    verified?: boolean;
    featured?: boolean;
    grievanceStatus?: 'open' | 'in_review' | 'resolved';
  }
): Promise<{ ok: boolean; listing: PlatformListing }> {
  const res = await fetch(`/api/admin2/platform/listings/${encodeURIComponent(id)}/moderate`, {
    method: 'PATCH',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function deleteAdminPlatformListing(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin2/platform/listings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function saveAdminHomepageSections(
  sections: HomepageSectionConfig[]
): Promise<{ ok: boolean; sections: HomepageSectionConfig[] }> {
  const res = await fetch('/api/admin2/platform/homepage-sections', {
    method: 'PUT',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sections }),
  });
  return parseJson(res);
}

export async function addAdminLocality(payload: {
  nameEn: string;
  nameKn: string;
  taluk: string;
}): Promise<{ ok: boolean; localities: LocalityOption[] }> {
  const res = await fetch('/api/admin2/platform/locations', {
    method: 'POST',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function deleteAdminLocality(
  id: string
): Promise<{ ok: boolean; localities: LocalityOption[] }> {
  const res = await fetch(`/api/admin2/platform/locations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function fetchAdminQuizzes(): Promise<{
  ok: boolean;
  quizzes: PlatformQuiz[];
  leaderboard: QuizLeaderboardEntry[];
}> {
  const res = await fetch('/api/admin2/platform/quizzes', {
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function createAdminQuiz(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; quiz: PlatformQuiz }> {
  const res = await fetch('/api/admin2/platform/quizzes', {
    method: 'POST',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function updateAdminQuiz(
  id: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; quiz: PlatformQuiz }> {
  const res = await fetch(`/api/admin2/platform/quizzes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function deleteAdminQuiz(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin2/platform/quizzes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function fetchAdminReports(): Promise<{ ok: boolean; reports: PlatformReport[] }> {
  const res = await fetch('/api/admin2/platform/reports', {
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function updateAdminReportStatus(
  id: string,
  status: 'open' | 'resolved' | 'dismissed'
): Promise<{ ok: boolean; report: PlatformReport }> {
  const res = await fetch(`/api/admin2/platform/reports/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  });
  return parseJson(res);
}

export async function fetchAdminWeather(): Promise<{
  ok: boolean;
  config: WeatherConfig;
  logs: WeatherRainfallRecord[];
}> {
  const res = await fetch('/api/admin2/platform/weather', {
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}

export async function addAdminWeatherLog(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; log: WeatherRainfallRecord }> {
  const res = await fetch('/api/admin2/platform/weather/logs', {
    method: 'POST',
    headers: await getAdmin2AuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function deleteAdminWeatherLog(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin2/platform/weather/logs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await getAdmin2AuthHeaders(),
  });
  return parseJson(res);
}
