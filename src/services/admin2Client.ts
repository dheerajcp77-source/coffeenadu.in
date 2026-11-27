import { auth } from '../firebase';
import {
  notifyAndroidSessionCleared,
  notifyAndroidSessionStarted,
} from './androidVaultBridge';
import type {
  Admin2AccountPublic,
  Admin2AnalyticsSummary,
  Admin2AuditLog,
  Admin2AutomationItem,
  Admin2LoginHistoryItem,
  Admin2ManagedDraft,
  Admin2MediaAsset,
  Admin2Notification,
  Admin2NotificationPreferences,
  Admin2RecentViewedArticle,
  Admin2SessionInfo,
  Admin2SessionUser,
  Admin2WebsiteSettings,
  AdminPermission,
  AdminRole,
  AiStudioResponse,
  AiStudioTool,
  ArticleCmsOverlay,
  ArticleSeoMeta,
} from '../types/admin2';

// Security rule: Admin 2.0 session Bearer token is held in JS memory ONLY (never localStorage/sessionStorage).
let admin2MemoryToken: string | null = null;

export function setAdmin2MemoryToken(token: string | null): void {
  admin2MemoryToken = token && token.trim() ? token.trim() : null;
  if (admin2MemoryToken) {
    notifyAndroidSessionStarted(admin2MemoryToken);
  } else {
    notifyAndroidSessionCleared();
  }
}

export function getAdmin2MemoryToken(): string | null {
  return admin2MemoryToken;
}

export function clearAdmin2MemoryToken(): void {
  admin2MemoryToken = null;
  notifyAndroidSessionCleared();
}

export async function resolveActiveAdminBearerToken(): Promise<string> {
  if (admin2MemoryToken) {
    return admin2MemoryToken;
  }
  const fbUser = auth.currentUser;
  if (fbUser) {
    return fbUser.getIdToken();
  }
  throw new Error('Please sign in to CoffeeNadu News Admin 2.0 first.');
}

export async function getAdmin2AuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await resolveActiveAdminBearerToken();
  return {
    Accept: 'application/json',
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

const ADMIN2_FETCH_TIMEOUT_MS = 25_000;

async function admin2Fetch<T>(
  url: string,
  options: { method?: string; body?: unknown; requireAuth?: boolean; keepalive?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (options.requireAuth !== false) {
    const token = await resolveActiveAdminBearerToken();
    headers.Authorization = `Bearer ${token}`;
  }
  const fetchInit: RequestInit = {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
    keepalive: options.keepalive,
  };
  if (
    !options.keepalive &&
    typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.timeout === 'function'
  ) {
    fetchInit.signal = AbortSignal.timeout(ADMIN2_FETCH_TIMEOUT_MS);
  }

  let resp: Response;
  try {
    resp = await fetch(url, fetchInit);
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('Request timed out while contacting the admin backend. Please try again.');
    }
    throw new Error('Unable to reach the CoffeeNadu News admin backend.');
  }

  if (resp.status === 204) {
    return {} as T;
  }

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const isJsonResponse = contentType.includes('application/json') || contentType.includes('+json');

  let json: (T & { ok?: boolean; error?: string }) | null = null;
  if (isJsonResponse) {
    try {
      json = (await resp.json()) as T & { ok?: boolean; error?: string };
    } catch {
      json = null;
    }
  }

  if (!resp.ok) {
    throw new Error(json?.error || `Request failed (${resp.status})`);
  }

  if (!isJsonResponse || !json) {
    throw new Error(
      'Admin API returned an unexpected non-JSON response. Please verify the API proxy is active.'
    );
  }

  return json;
}

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------

export interface RememberedLoginInfo {
  remembered: boolean;
  email?: string;
  fullName?: string;
  authProvider?: 'admin2_password' | 'firebase';
}

export async function loginAdmin2WithPassword(
  email: string,
  password: string,
  rememberMe = false
): Promise<{
  ok: boolean;
  token: string;
  user: Admin2SessionUser;
}> {
  const res = await admin2Fetch<{ ok: boolean; token: string; user: Admin2SessionUser }>(
    '/api/admin2/auth/login',
    { method: 'POST', body: { email, password, rememberMe }, requireAuth: false }
  );
  if (res.ok && res.token) {
    setAdmin2MemoryToken(res.token);
  }
  return res;
}

export async function exchangeFirebaseForAdmin2Session(
  idToken: string,
  rememberMe = false
): Promise<{
  ok: boolean;
  token: string;
  user: Admin2SessionUser;
}> {
  const res = await admin2Fetch<{ ok: boolean; token: string; user: Admin2SessionUser }>(
    '/api/admin2/auth/firebase-exchange',
    { method: 'POST', body: { idToken, rememberMe }, requireAuth: false }
  );
  if (res.ok && res.token) {
    setAdmin2MemoryToken(res.token);
  }
  return res;
}

export async function fetchRememberedLoginState(): Promise<RememberedLoginInfo> {
  try {
    const res = await admin2Fetch<{ ok: boolean } & RememberedLoginInfo>(
      '/api/admin2/auth/remembered',
      { method: 'GET', requireAuth: false }
    );
    return res.ok && res.remembered
      ? {
          remembered: true,
          email: res.email,
          fullName: res.fullName,
          authProvider: res.authProvider,
        }
      : { remembered: false };
  } catch {
    return { remembered: false };
  }
}

export async function loginAdmin2WithRememberedDevice(email?: string): Promise<{
  ok: boolean;
  token: string;
  user: Admin2SessionUser;
}> {
  const res = await admin2Fetch<{ ok: boolean; token: string; user: Admin2SessionUser }>(
    '/api/admin2/auth/login-remembered',
    { method: 'POST', body: { email: email || '' }, requireAuth: false }
  );
  if (res.ok && res.token) {
    setAdmin2MemoryToken(res.token);
  }
  return res;
}

export async function forgetRememberedDevice(): Promise<void> {
  try {
    await admin2Fetch('/api/admin2/auth/forget-device', {
      method: 'POST',
      requireAuth: false,
    });
  } catch {
    // Non-fatal
  }
}

export async function activateAdmin2Account(token: string, password: string): Promise<{
  ok: boolean;
  email: string;
  message: string;
}> {
  return admin2Fetch('/api/admin2/auth/activate', {
    method: 'POST',
    body: { token, password },
    requireAuth: false,
  });
}

export async function resetAdmin2Password(token: string, password: string): Promise<{
  ok: boolean;
  email: string;
  message: string;
}> {
  return admin2Fetch('/api/admin2/auth/reset-password', {
    method: 'POST',
    body: { token, password },
    requireAuth: false,
  });
}

export async function fetchAdmin2Me(): Promise<Admin2SessionUser | null> {
  try {
    const res = await admin2Fetch<{ ok: boolean; user?: Admin2SessionUser }>('/api/admin2/auth/me');
    return res.ok && res.user ? res.user : null;
  } catch {
    return null;
  }
}

export async function logoutAdmin2Session(
  reason = 'user_logout',
  clearRemembered = false
): Promise<void> {
  const activeToken = admin2MemoryToken;
  clearAdmin2MemoryToken();
  if (!activeToken) return;
  try {
    await fetch('/api/admin2/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeToken}`,
      },
      body: JSON.stringify({ reason, clearRemembered }),
      cache: 'no-store',
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Non-fatal
  }
}

export function revokeAdmin2SessionKeepalive(reason = 'window_close'): void {
  const activeToken = admin2MemoryToken;
  if (!activeToken) return;
  clearAdmin2MemoryToken();
  try {
    void fetch('/api/admin2/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeToken}`,
      },
      body: JSON.stringify({ reason, clearRemembered: false }),
      cache: 'no-store',
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Non-fatal
  }
}

export async function setOwnAdmin2Password(password: string): Promise<{ ok: boolean; message: string }> {
  return admin2Fetch('/api/admin2/auth/set-own-password', {
    method: 'POST',
    body: { password },
  });
}

// -----------------------------------------------------------------------------
// 1. DASHBOARD OVERVIEW
// -----------------------------------------------------------------------------

export interface Admin2DashboardResponse {
  ok: boolean;
  articles: {
    total: number;
    published: number;
    drafts: number;
    scheduled: number;
    archived: number;
    eventsCount: number;
  };
  traffic: {
    todayVisitors: number;
    todayPageViews: number;
    totalPageViews14d: number;
    totalSheetViews: number;
    dailySeries: Array<{
      date: string;
      pageViews: number;
      uniqueVisitors: number;
      articleReads: number;
    }>;
  };
  popularArticles: Array<{
    id: string;
    title: string;
    category: string;
    location: string;
    publishedDate: string;
    views: number;
  }>;
  recentlyViewedArticles: Admin2RecentViewedArticle[];
  recentActivity: Admin2AuditLog[];
  recentNotifications: Admin2Notification[];
  unreadNotifications: number;
  systemStatus: {
    sheetsConnected: boolean;
    appsScriptStatus: string;
    appsScriptCallsToday: number;
    dailyFreeLimitCalls: number;
    cacheHitRatePct: number;
    driveCachedFiles: number;
    driveCachedBytes: number;
    latestBackupAt: string | null;
    backupStatus: string;
    availableBackups: number;
    automationsActive: number;
    automationsTotal: number;
    automationsErrored: number;
  };
}

export async function fetchAdmin2Dashboard(): Promise<Admin2DashboardResponse> {
  return admin2Fetch('/api/admin2/dashboard');
}

// -----------------------------------------------------------------------------
// 2 & 3. CMS DRAFTS, SCHEDULE, ARCHIVE & OVERLAYS
// -----------------------------------------------------------------------------

export interface Admin2CmsStateResponse {
  ok: boolean;
  drafts: Admin2ManagedDraft[];
  overlays: Record<string, ArticleCmsOverlay>;
  archivedSnapshots: Array<Record<string, unknown> & { id: string }>;
}

export async function fetchAdmin2CmsState(): Promise<Admin2CmsStateResponse> {
  return admin2Fetch('/api/admin2/cms/state');
}

export async function createAdmin2Draft(payload: Partial<Admin2ManagedDraft>): Promise<{
  ok: boolean;
  draft: Admin2ManagedDraft;
}> {
  return admin2Fetch('/api/admin2/cms/drafts', { method: 'POST', body: payload });
}

export async function updateAdmin2Draft(
  id: string,
  payload: Partial<Admin2ManagedDraft>
): Promise<{ ok: boolean; draft: Admin2ManagedDraft }> {
  return admin2Fetch(`/api/admin2/cms/drafts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload,
  });
}

export async function publishAdmin2Draft(id: string): Promise<{ ok: boolean; newsId: string }> {
  return admin2Fetch(`/api/admin2/cms/drafts/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
  });
}

export async function deleteAdmin2Draft(id: string): Promise<{ ok: boolean }> {
  return admin2Fetch(`/api/admin2/cms/drafts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function archiveLiveArticle(
  articleId: string,
  articleSnapshot: Record<string, unknown>
): Promise<{ ok: boolean }> {
  return admin2Fetch(`/api/admin2/cms/articles/${encodeURIComponent(articleId)}/archive`, {
    method: 'POST',
    body: { articleSnapshot },
  });
}

export async function restoreArchivedArticle(articleId: string): Promise<{ ok: boolean; newsId: string }> {
  return admin2Fetch(`/api/admin2/cms/articles/${encodeURIComponent(articleId)}/restore`, {
    method: 'POST',
  });
}

export async function updateArticleCmsMeta(
  articleId: string,
  meta: { language?: 'Kannada' | 'English' | 'Bilingual'; seo?: ArticleSeoMeta }
): Promise<{ ok: boolean; overlay: ArticleCmsOverlay }> {
  return admin2Fetch(`/api/admin2/cms/articles/${encodeURIComponent(articleId)}/meta`, {
    method: 'PUT',
    body: meta,
  });
}

// -----------------------------------------------------------------------------
// 5. AI NEWS STUDIO
// -----------------------------------------------------------------------------

export async function runAiNewsStudio(payload: {
  tool: AiStudioTool;
  sourceMaterial: string;
  headlineHint?: string;
  category?: string;
  location?: string;
  tone?: string;
}): Promise<AiStudioResponse> {
  return admin2Fetch('/api/admin2/ai/assist', {
    method: 'POST',
    body: payload,
  });
}

// -----------------------------------------------------------------------------
// 6. MEDIA CENTRE
// -----------------------------------------------------------------------------

export async function fetchAdmin2Media(): Promise<{
  ok: boolean;
  assets: Admin2MediaAsset[];
  folders: string[];
  duplicateHashes: string[];
  driveCache: { fileCount: number; totalBytes: number };
}> {
  return admin2Fetch('/api/admin2/media');
}

export async function registerAdmin2MediaAsset(payload: {
  imageUrl: string;
  thumbUrl?: string;
  driveFileId?: string;
  fileName: string;
  folder: string;
  mimeType: string;
  sizeBytes?: number;
  sha256?: string;
  watermarkApplied: boolean;
  middleOverlayApplied: boolean;
  processingHistory?: string[];
}): Promise<{ ok: boolean; duplicateOf: string | null }> {
  return admin2Fetch('/api/admin2/media/register', { method: 'POST', body: payload });
}

export async function moveAdmin2MediaToFolder(
  imageUrl: string,
  folder: string
): Promise<{ ok: boolean; folders: string[] }> {
  return admin2Fetch('/api/admin2/media/folder', { method: 'PATCH', body: { imageUrl, folder } });
}

export async function createAdmin2MediaFolder(name: string): Promise<{ ok: boolean; folders: string[] }> {
  return admin2Fetch('/api/admin2/media/folders', { method: 'POST', body: { name } });
}

// -----------------------------------------------------------------------------
// 8. NOTIFICATION CENTRE
// -----------------------------------------------------------------------------

export async function fetchAdmin2Notifications(): Promise<{
  ok: boolean;
  notifications: Admin2Notification[];
  unreadCount: number;
  preferences: Admin2NotificationPreferences;
}> {
  return admin2Fetch('/api/admin2/notifications');
}

export async function markAdmin2NotificationRead(opts: { id?: string; all?: boolean }): Promise<{
  ok: boolean;
  unreadCount: number;
}> {
  return admin2Fetch('/api/admin2/notifications/read', { method: 'POST', body: opts });
}

export async function updateAdmin2NotificationPrefs(
  prefs: Partial<Admin2NotificationPreferences>
): Promise<{ ok: boolean; preferences: Admin2NotificationPreferences }> {
  return admin2Fetch('/api/admin2/notifications/preferences', { method: 'PUT', body: prefs });
}

// -----------------------------------------------------------------------------
// 9. ANALYTICS CENTRE
// -----------------------------------------------------------------------------

export async function fetchAdmin2Analytics(days: number): Promise<Admin2AnalyticsSummary & { ok: boolean }> {
  return admin2Fetch(`/api/admin2/analytics?days=${encodeURIComponent(String(days))}`);
}

// -----------------------------------------------------------------------------
// 10. SEO MANAGEMENT
// -----------------------------------------------------------------------------

export interface Admin2SeoAuditItem {
  articleId: string;
  title: string;
  category: string;
  publishedDate: string;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  imageAltText: string;
  focusKeyword: string;
  hasImage: boolean;
  jsonLdValid: boolean;
  score: number;
  issues: string[];
}

export interface Admin2SeoAuditResponse {
  ok: boolean;
  siteDefaults: {
    canonicalBaseUrl: string;
    defaultSeoTitle: string;
    defaultMetaDescription: string;
    sitemapUrl: string;
  };
  summary: {
    totalChecked: number;
    averageScore: number;
    missingAltCount: number;
    warningCount: number;
    sitemapValid: boolean;
    openGraphEnabled: boolean;
    jsonLdEnabled: boolean;
  };
  items: Admin2SeoAuditItem[];
}

export async function fetchAdmin2SeoAudit(): Promise<Admin2SeoAuditResponse> {
  return admin2Fetch('/api/admin2/seo/audit');
}

export async function saveArticleSeoMeta(articleId: string, seo: ArticleSeoMeta): Promise<{ ok: boolean }> {
  return admin2Fetch(`/api/admin2/seo/article/${encodeURIComponent(articleId)}`, {
    method: 'PUT',
    body: seo,
  });
}

// -----------------------------------------------------------------------------
// 11. AUTOMATION CENTRE
// -----------------------------------------------------------------------------

export async function fetchAdmin2Automations(): Promise<{
  ok: boolean;
  automations: Admin2AutomationItem[];
}> {
  return admin2Fetch('/api/admin2/automations');
}

export async function updateAdmin2Automation(
  id: string,
  payload: { enabled?: boolean; config?: Record<string, string | number | boolean> }
): Promise<{ ok: boolean; automation: Admin2AutomationItem }> {
  return admin2Fetch(`/api/admin2/automations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function runAdmin2AutomationNow(id: string): Promise<{
  ok: boolean;
  summary: string;
  automation: Admin2AutomationItem;
}> {
  return admin2Fetch(`/api/admin2/automations/${encodeURIComponent(id)}/run`, {
    method: 'POST',
  });
}

// -----------------------------------------------------------------------------
// 12. ADMINISTRATOR MANAGEMENT (RBAC)
// -----------------------------------------------------------------------------

export async function fetchAdmin2Accounts(): Promise<{
  ok: boolean;
  accounts: Admin2AccountPublic[];
}> {
  return admin2Fetch('/api/admin2/admins');
}

export async function createAdmin2Account(payload: {
  fullName: string;
  email: string;
  role: AdminRole;
  customRoleLabel?: string;
  permissions: AdminPermission[];
}): Promise<{
  ok: boolean;
  account: Admin2AccountPublic;
  activationToken: string;
  activationPath: string;
  expiresInHours: number;
}> {
  return admin2Fetch('/api/admin2/admins', { method: 'POST', body: payload });
}

export async function updateAdmin2Account(
  id: string,
  payload: {
    fullName?: string;
    role?: AdminRole;
    customRoleLabel?: string;
    permissions?: AdminPermission[];
    status?: 'active' | 'suspended';
  }
): Promise<{ ok: boolean; account: Admin2AccountPublic }> {
  return admin2Fetch(`/api/admin2/admins/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function issueAdmin2ResetLink(id: string): Promise<{
  ok: boolean;
  kind: 'activate' | 'reset';
  token: string;
  path: string;
  expiresInHours: number;
}> {
  return admin2Fetch(`/api/admin2/admins/${encodeURIComponent(id)}/reset-link`, {
    method: 'POST',
  });
}

export async function revokeAdmin2AccountSessions(id: string): Promise<{
  ok: boolean;
  revokedCount: number;
}> {
  return admin2Fetch(`/api/admin2/admins/${encodeURIComponent(id)}/revoke-sessions`, {
    method: 'POST',
  });
}

export async function deleteAdmin2Account(id: string): Promise<{ ok: boolean }> {
  return admin2Fetch(`/api/admin2/admins/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// -----------------------------------------------------------------------------
// 15. SECURITY & AUDIT LOGS
// -----------------------------------------------------------------------------

export async function fetchAdmin2SecurityOverview(): Promise<{
  ok: boolean;
  sessions: Admin2SessionInfo[];
  auditLogs: Admin2AuditLog[];
  loginHistory: Admin2LoginHistoryItem[];
  securityAlerts: Admin2Notification[];
}> {
  return admin2Fetch('/api/admin2/security/overview');
}

export async function revokeAdmin2SingleSession(sessionId: string): Promise<{ ok: boolean }> {
  return admin2Fetch(`/api/admin2/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {
    method: 'POST',
  });
}

// -----------------------------------------------------------------------------
// 16 & 17. WEBSITE SETTINGS & SYSTEM HEALTH
// -----------------------------------------------------------------------------

export async function fetchAdmin2Settings(): Promise<{ ok: boolean; settings: Admin2WebsiteSettings }> {
  return admin2Fetch('/api/admin2/settings');
}

export async function saveAdmin2Settings(
  settings: Partial<Admin2WebsiteSettings>
): Promise<{ ok: boolean; settings: Admin2WebsiteSettings }> {
  return admin2Fetch('/api/admin2/settings', { method: 'PUT', body: settings });
}

export interface Admin2HealthResponse {
  ok: boolean;
  server: {
    status: string;
    uptimeSeconds: number;
    nodeVersion: string;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    timestamp: string;
  };
  integrations: {
    googleSheetsConfigured: boolean;
    appsScriptLastSuccessAt: string | null;
    appsScriptLastError: string | null;
    appsScriptCallsToday: number;
    dailyFreeLimitCalls: number;
    cacheHitRatePct: number;
    pendingViewsCount: number;
    driveCacheFiles: number;
    driveCacheBytes: number;
    geminiAiReady: boolean;
    geminiModel: string;
    sitemapRoute: string;
    ping: { ok: boolean; latencyMs: number; error?: string } | null;
  };
  security: {
    activeAdminSessions: number;
    totalAdminAccounts: number;
    protectedSuperAdmins: number;
    auditLogEntries: number;
  };
}

export async function fetchAdmin2Health(withPing = false): Promise<Admin2HealthResponse> {
  return admin2Fetch(`/api/admin2/health${withPing ? '?ping=1' : ''}`);
}
