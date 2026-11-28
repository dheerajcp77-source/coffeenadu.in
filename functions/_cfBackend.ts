/**
 * Shared Cloudflare Pages serverless backend for CoffeeNadu News.
 *
 * Bridges directly to Google Apps Script (Google Sheets + Google Drive),
 * Google Identity Toolkit (Firebase Auth token verification), Google Drive image CDN,
 * Hudkoo live bus schedules, and optional Gemini AI studio without requiring a separate
 * always-on Node.js server when BACKEND_ORIGIN is unset or unavailable.
 */

import firebaseConfig from '../firebase-applet-config.json';
import { handleCfAdminPlatformRoute, handleCfPublicPlatformRoute } from './_cfPlatform';
import { handleCfCommunityApi } from './_cfCommunity';
import { handleCfContestApi } from './_cfContest';

export interface PagesEnv {
  BACKEND_ORIGIN?: string;
  PUBLIC_SITE_URL?: string;
  APPS_SCRIPT_WEBAPP_URL?: string;
  APPS_SCRIPT_API_SECRET?: string;
  EXTRA_ADMIN_EMAILS?: string;
  ADMIN2_SESSION_SECRET?: string;
  SESSION_SECRET?: string;
  GEMINI_API_KEY?: string;
  FIREBASE_API_KEY?: string;
  ASSETS?: {
    fetch: (input: Request | string) => Promise<Response>;
  };
}

export interface PagesFunctionContext {
  request: Request;
  env: PagesEnv;
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<unknown>) => void;
  next?: () => Promise<Response>;
}

const CANONICAL_PUBLIC_ORIGIN = 'https://coffeenadu.in';
const CACHE_TTL_MINUTES = 7;
const APPS_SCRIPT_TIMEOUT_MS = 18_000;
const EDGE_READ_CACHE_TTL_SECONDS = 90;
const BUS_CACHE_TTL_SECONDS = 21_600; // 6 hours
const REMEMBERED_COOKIE_NAME = 'cn_admin2_rem';
const GEMINI_EDITORIAL_MODEL = 'gemini-4-hydrogen';

// Legacy dead origins that must never receive blind proxy traffic when unhealthy/unset
const DEPRECATED_BACKEND_HOSTS = new Set(['coffeenad-news.ai.studio']);

const OWNER_ADMIN_EMAILS = new Set([
  'shwethashwethak85@gmail.com',
  'dheerajcp77@gmail.com',
]);

const RESERVED_ARTICLE_SLUGS = new Set([
  'admin',
  'ads',
  'events',
  'bus-timings',
  'chat',
  'api',
  'assets',
  'index',
  'login',
  'businesses',
  'jobs',
  'marketplace',
  'agriculture',
  'education',
  'health',
  'schemes',
  'tourism',
  'property',
  'community',
  'lost-found',
  'grievances',
  'services',
  'weather',
  'games',
  'offers',
  'contacts',
  'documents',
  'account',
  'explore',
  'search',
]);

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  super_admin: [
    'dashboard.view',
    'news.create',
    'news.edit',
    'news.publish',
    'news.archive',
    'news.delete',
    'news.lead',
    'ads.manage',
    'events.manage',
    'media.manage',
    'messaging.manage',
    'analytics.view',
    'seo.manage',
    'ai.use',
    'automations.manage',
    'admins.manage',
    'storage.manage',
    'backups.manage',
    'security.view',
    'settings.manage',
  ],
  admin: [
    'dashboard.view',
    'news.create',
    'news.edit',
    'news.publish',
    'news.archive',
    'news.lead',
    'ads.manage',
    'events.manage',
    'media.manage',
    'messaging.manage',
    'analytics.view',
    'seo.manage',
    'ai.use',
    'storage.manage',
    'backups.manage',
  ],
};

const EXTRA_PHOTOS_SENTINEL_PREFIX = '__COFFEENADU_EXTRA_PHOTOS__:';
const LEAD_UNTIL_PREFIX = 'leadUntil:';
const LEAD_OFF_TOKEN = 'leadOff:1';
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

let runtimeEphemeralSecret: string | null = null;
let cfReadCacheEpoch = 1;

function getDefaultEdgeCache(): Cache | null {
  try {
    const cacheStorage = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return cacheStorage?.default ?? null;
  } catch {
    return null;
  }
}

export function resolveTrustedOrigin(raw: string | undefined, fallback: string): URL {
  const trimmed = (raw || '').trim();
  if (trimmed) {
    try {
      const parsed = new URL(trimmed);
      const hostname = parsed.hostname.toLowerCase();
      const isUnsafeHost =
        hostname === 'localhost' ||
        hostname === '0.0.0.0' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
      if (parsed.protocol === 'https:' && !isUnsafeHost) {
        return new URL(parsed.origin);
      }
    } catch {
      // Invalid URL; fall back below
    }
  }
  return new URL(fallback);
}

/**
 * Resolves an optional Express BACKEND_ORIGIN only when explicitly configured to a live,
 * non-deprecated HTTPS host. Never defaults to a dead preview domain.
 */
export function resolveConfiguredBackendOrigin(env: PagesEnv | undefined): URL | null {
  const raw = (env?.BACKEND_ORIGIN || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (DEPRECATED_BACKEND_HOSTS.has(hostname)) {
      return null;
    }
    const isUnsafeHost =
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    if (parsed.protocol === 'https:' && !isUnsafeHost) {
      return new URL(parsed.origin);
    }
  } catch {
    return null;
  }
  return null;
}

export function resolvePublicOrigin(env: PagesEnv | undefined): string {
  return resolveTrustedOrigin(env?.PUBLIC_SITE_URL, CANONICAL_PUBLIC_ORIGIN).origin;
}

let cfRuntimeAppsScriptUrl = '';
let cfRuntimeAppsScriptSecret = '';

function isValidAppsScriptExecUrl(url: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/i.test(url.trim());
}

export function getAppsScriptConfig(env: PagesEnv | undefined): {
  webAppUrl: string;
  apiSecret: string;
  configured: boolean;
} {
  const envUrl = (env?.APPS_SCRIPT_WEBAPP_URL || '').trim();
  const envSecret = (env?.APPS_SCRIPT_API_SECRET || '').trim();
  const webAppUrl = isValidAppsScriptExecUrl(envUrl) ? envUrl : cfRuntimeAppsScriptUrl;
  const apiSecret = envSecret.length >= 12 ? envSecret : cfRuntimeAppsScriptSecret;
  const configured = Boolean(
    webAppUrl &&
      isValidAppsScriptExecUrl(webAppUrl) &&
      apiSecret.length >= 12
  );
  return { webAppUrl, apiSecret, configured };
}

export function isDeadUpstreamHtmlResponse(resp: Response): boolean {
  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  if (resp.status === 404 && contentType.includes('text/html')) {
    return true;
  }
  if (resp.status >= 500) {
    return true;
  }
  return false;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, must-revalidate',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

export function jsonErrorResponse(status: number, error: string): Response {
  return jsonResponse({ ok: false, error }, status);
}

function parseSheetBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized === 'TRUE' || normalized === '1' || normalized === 'YES';
  }
  return false;
}

function normalizeFeaturedUntil(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.floor(num);
}

function parseLeadMetaFromTags(rawTags?: string | null): {
  featuredUntil?: number;
  leadDisabled: boolean;
  cleanTags: string;
} {
  const text = typeof rawTags === 'string' ? rawTags.trim() : '';
  if (!text) return { featuredUntil: undefined, leadDisabled: false, cleanTags: '' };

  let featuredUntil: number | undefined;
  let leadDisabled = false;
  const userTags: string[] = [];

  for (const part of text.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower.startsWith(LEAD_UNTIL_PREFIX.toLowerCase())) {
      const ts = normalizeFeaturedUntil(token.slice(LEAD_UNTIL_PREFIX.length));
      if (ts) featuredUntil = ts;
    } else if (lower === LEAD_OFF_TOKEN.toLowerCase()) {
      leadDisabled = true;
    } else {
      userTags.push(token);
    }
  }
  return { featuredUntil, leadDisabled, cleanTags: userTags.join(', ') };
}

function serializeLeadMetaToTags(
  existingTags: string | undefined | null,
  options: { isFeatured: boolean; featuredUntil?: number }
): string {
  const { cleanTags } = parseLeadMetaFromTags(existingTags);
  const tokens = cleanTags
    ? cleanTags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];
  const validUntil = normalizeFeaturedUntil(options.featuredUntil);
  if (options.isFeatured) {
    if (validUntil) tokens.push(`${LEAD_UNTIL_PREFIX}${validUntil}`);
  } else {
    tokens.push(LEAD_OFF_TOKEN);
  }
  return tokens.join(', ').slice(0, 300);
}

function resolveEffectiveLeadState(
  raw: { featured?: unknown; isFeatured?: unknown; featuredUntil?: unknown; tags?: string | null },
  nowMs = Date.now()
): { isFeatured: boolean; featuredUntil?: number } {
  const tagMeta = parseLeadMetaFromTags(raw.tags);
  const rawFeatured =
    raw.featured !== undefined
      ? parseSheetBoolean(raw.featured)
      : raw.isFeatured !== undefined
      ? parseSheetBoolean(raw.isFeatured)
      : false;
  const featuredUntil = normalizeFeaturedUntil(raw.featuredUntil) ?? tagMeta.featuredUntil;

  if (!rawFeatured || tagMeta.leadDisabled) {
    return { isFeatured: false, featuredUntil: undefined };
  }
  if (featuredUntil && featuredUntil <= nowMs) {
    return { isFeatured: false, featuredUntil };
  }
  return { isFeatured: true, featuredUntil };
}

function parseMonthIndex(abbr: string): number {
  const lower = abbr.slice(0, 3).toLowerCase();
  return SHORT_MONTHS.findIndex((m) => m.toLowerCase() === lower);
}

function normalizeCalendarDateKey(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const jsDateMatch = value.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (jsDateMatch) {
    const mIdx = parseMonthIndex(jsDateMatch[1]);
    if (mIdx >= 0) {
      return `${jsDateMatch[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(jsDateMatch[2])).padStart(2, '0')}`;
    }
  }
  const dmyMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dmyMatch) {
    const mIdx = parseMonthIndex(dmyMatch[2]);
    if (mIdx >= 0) {
      return `${dmyMatch[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(dmyMatch[1])).padStart(2, '0')}`;
    }
  }
  const mdyMatch = value.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdyMatch) {
    const mIdx = parseMonthIndex(mdyMatch[1]);
    if (mIdx >= 0) {
      return `${mdyMatch[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(mdyMatch[2])).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  }
  return '';
}

function normalizeDisplayDate(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.includes('GMT') || /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const key = normalizeCalendarDateKey(value);
    if (key) {
      const [y, m, d] = key.split('-').map(Number);
      return `${String(d).padStart(2, '0')} ${SHORT_MONTHS[m - 1]} ${y}`;
    }
  }
  return value;
}

function normalizeDisplayTime(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.includes('1899') || value.includes('GMT')) {
    const timeMatch = value.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
    if (timeMatch) {
      let hours = Number(timeMatch[1]);
      const mins = timeMatch[2];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${String(hours).padStart(2, '0')}:${mins} ${ampm}`;
    }
  }
  return value;
}

function normalizeEventDateIso(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return normalizeCalendarDateKey(value) || value;
}

interface ExtraNewsPhoto {
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  caption?: string;
  watermarkApplied?: boolean;
}

function sanitizeExtraPhotos(input: unknown): ExtraNewsPhoto[] {
  if (!Array.isArray(input)) return [];
  const cleaned: ExtraNewsPhoto[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const imageUrl = typeof item.imageUrl === 'string' ? item.imageUrl.trim() : '';
    if (!imageUrl || imageUrl.length > 350000) continue;
    const imageThumbUrl =
      typeof item.imageThumbUrl === 'string' && item.imageThumbUrl.trim()
        ? item.imageThumbUrl.trim().slice(0, 2000)
        : undefined;
    const imageDriveId =
      typeof item.imageDriveId === 'string' && item.imageDriveId.trim()
        ? item.imageDriveId.trim().slice(0, 128)
        : undefined;
    const caption =
      typeof item.caption === 'string' && item.caption.trim()
        ? item.caption.trim().slice(0, 500)
        : undefined;
    cleaned.push({
      imageUrl,
      ...(imageThumbUrl ? { imageThumbUrl } : {}),
      ...(imageDriveId ? { imageDriveId } : {}),
      ...(caption ? { caption } : {}),
      watermarkApplied: item.watermarkApplied !== false,
    });
    if (cleaned.length >= 6) break;
  }
  return cleaned;
}

function unpackBodyAndExtraPhotos(
  rawBody: unknown,
  explicitExtraImages?: unknown
): { bodyKannada: string[]; extraImages: ExtraNewsPhoto[] } {
  const explicit = sanitizeExtraPhotos(explicitExtraImages);
  const rawList = Array.isArray(rawBody)
    ? rawBody.filter((item): item is string => typeof item === 'string')
    : [];
  const bodyKannada: string[] = [];
  let packedExtras: ExtraNewsPhoto[] = [];
  for (const entry of rawList) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(EXTRA_PHOTOS_SENTINEL_PREFIX)) {
      try {
        const parsed = JSON.parse(trimmed.slice(EXTRA_PHOTOS_SENTINEL_PREFIX.length));
        const sanitized = sanitizeExtraPhotos(parsed);
        if (sanitized.length > 0) packedExtras = sanitized;
      } catch {
        // Ignore malformed sentinel
      }
      continue;
    }
    bodyKannada.push(entry);
  }
  return {
    bodyKannada,
    extraImages: explicit.length > 0 ? explicit : packedExtras,
  };
}

function packBodyWithExtraPhotos(paragraphs: string[], extraImages?: ExtraNewsPhoto[]): string[] {
  const cleanBody = paragraphs.filter(
    (p) => typeof p === 'string' && !p.trim().startsWith(EXTRA_PHOTOS_SENTINEL_PREFIX)
  );
  const cleanExtras = sanitizeExtraPhotos(extraImages);
  if (cleanExtras.length === 0) return cleanBody;
  return [...cleanBody, `${EXTRA_PHOTOS_SENTINEL_PREFIX}${JSON.stringify(cleanExtras)}`];
}

function validateCustomEnglishSlugInput(raw: string): { slug: string; error?: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { slug: '' };
  const slug = trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  if (!slug) {
    return {
      slug: '',
      error: 'Please use English letters and numbers for the custom URL (for example: article 1 or koppa-coffee-price).',
    };
  }
  if (RESERVED_ARTICLE_SLUGS.has(slug)) {
    return {
      slug: '',
      error: `"${slug}" is a reserved website route. Please choose a different English URL.`,
    };
  }
  return { slug };
}

export interface SheetsNewsItem {
  newsId: string;
  title: string;
  description: string;
  fullContent: string[];
  category: string;
  location: string;
  language: string;
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  imageCaption?: string;
  imageKey: string;
  extraImages?: ExtraNewsPhoto[];
  watermarkApplied: boolean;
  author: string;
  authorUid?: string;
  publishedDate: string;
  publishedTime: string;
  publishedTimestamp: number;
  updatedDate?: string;
  readTimeMinutes: number;
  status: string;
  views: number;
  featured: boolean;
  featuredUntil?: number;
  tags?: string;
}

export interface SheetsEventItem {
  eventId: string;
  titleKannada: string;
  descriptionKannada: string;
  eventDate: string;
  eventTime: string;
  location: string;
  organizer: string;
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  watermarkApplied: boolean;
  authorUid?: string;
  views: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export function sanitizeSheetsNewsItem(item: SheetsNewsItem, nowMs = Date.now()): SheetsNewsItem {
  const leadState = resolveEffectiveLeadState(item, nowMs);
  const unpacked = unpackBodyAndExtraPhotos(item.fullContent, item.extraImages);
  return {
    ...item,
    fullContent: unpacked.bodyKannada,
    extraImages: unpacked.extraImages.length > 0 ? unpacked.extraImages : undefined,
    publishedDate: normalizeDisplayDate(item.publishedDate),
    publishedTime: normalizeDisplayTime(item.publishedTime),
    featured: leadState.isFeatured,
    featuredUntil: leadState.featuredUntil,
    tags: typeof item.tags === 'string' ? item.tags : '',
  };
}

export function sanitizeSheetsEventItem(item: SheetsEventItem): SheetsEventItem {
  return {
    ...item,
    eventDate: normalizeEventDateIso(item.eventDate),
    eventTime: normalizeDisplayTime(item.eventTime),
  };
}

export async function callAppsScriptGet<T>(
  env: PagesEnv | undefined,
  action: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const cfg = getAppsScriptConfig(env);
  if (!cfg.configured) {
    throw new Error(
      'Google Apps Script env vars (APPS_SCRIPT_WEBAPP_URL and APPS_SCRIPT_API_SECRET) are not configured in Cloudflare Pages.'
    );
  }
  const url = new URL(cfg.webAppUrl);
  url.searchParams.set('action', action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v) !== '') {
        url.searchParams.set(k, String(v));
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
      `Apps Script returned non-JSON response (${resp.status}). Verify deployment Execute as "Me" and Access "Anyone".`
    );
  }
}

export async function callAppsScriptPost<T>(
  env: PagesEnv | undefined,
  action: string,
  body: Record<string, unknown>,
  adminEmail?: string
): Promise<T> {
  const cfg = getAppsScriptConfig(env);
  if (!cfg.configured) {
    throw new Error(
      'Google Apps Script env vars (APPS_SCRIPT_WEBAPP_URL and APPS_SCRIPT_API_SECRET) are not configured in Cloudflare Pages.'
    );
  }
  const payload = {
    ...body,
    action,
    apiSecret: cfg.apiSecret,
    adminEmail: adminEmail || '',
  };
  const fetchInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
      `Apps Script returned non-JSON response (${resp.status}). Verify deployment Execute as "Me" and Access "Anyone".`
    );
  }
}

async function fetchAppsScriptNewsWithEdgeCache(
  env: PagesEnv | undefined,
  params: {
    page: number;
    limit: number;
    category?: string;
    location?: string;
    q?: string;
    featured?: boolean;
  },
  forceRefresh = false
): Promise<{
  ok: boolean;
  items: SheetsNewsItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  fromCache: boolean;
}> {
  const cache = getDefaultEdgeCache();
  const cacheUrl = new URL('https://cf-edge-cache.coffeenadu.invalid/apps-script-news');
  cacheUrl.searchParams.set('epoch', String(cfReadCacheEpoch));
  cacheUrl.searchParams.set('page', String(params.page));
  cacheUrl.searchParams.set('limit', String(params.limit));
  if (params.category) cacheUrl.searchParams.set('category', params.category);
  if (params.location) cacheUrl.searchParams.set('location', params.location);
  if (params.q) cacheUrl.searchParams.set('q', params.q);
  if (params.featured) cacheUrl.searchParams.set('featured', 'true');

  if (!forceRefresh && cache) {
    try {
      const hit = await cache.match(cacheUrl.toString());
      if (hit) {
        const parsed = (await hit.json()) as {
          ok: boolean;
          items: SheetsNewsItem[];
          total: number;
          page: number;
          limit: number;
          hasMore: boolean;
        };
        if (parsed?.ok && Array.isArray(parsed.items)) {
          return { ...parsed, fromCache: true };
        }
      }
    } catch {
      // Fall through to fresh fetch
    }
  }

  const raw = await callAppsScriptGet<{
    ok: boolean;
    items: SheetsNewsItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
    error?: string;
  }>(env, 'getPublishedNews', {
    page: params.page,
    limit: params.limit,
    category: params.category || undefined,
    location: params.location || undefined,
    q: params.q || undefined,
    featured: params.featured ? 'true' : undefined,
  });

  if (!raw?.ok) {
    throw new Error(raw?.error || 'Failed to read published news from Apps Script.');
  }

  if (cache) {
    try {
      await cache.put(
        cacheUrl.toString(),
        new Response(JSON.stringify(raw), {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${EDGE_READ_CACHE_TTL_SECONDS}`,
          },
        })
      );
    } catch {
      // Non-fatal cache write failure
    }
  }

  const filteredItems = Array.isArray(raw.items)
    ? raw.items.filter((it) => !String(it?.newsId || '').startsWith('cn_sys_'))
    : [];

  return {
    ok: true,
    items: filteredItems,
    total: Number(raw.total) || 0,
    page: Number(raw.page) || params.page,
    limit: Number(raw.limit) || params.limit,
    hasMore: Boolean(raw.hasMore),
    fromCache: false,
  };
}

export async function fetchAllPublishedNewsDirect(
  env: PagesEnv | undefined,
  forceRefresh = false
): Promise<SheetsNewsItem[]> {
  const collected: SheetsNewsItem[] = [];
  let page = 1;
  while (page <= 10) {
    const res = await fetchAppsScriptNewsWithEdgeCache(
      env,
      { page, limit: 50 },
      forceRefresh
    );
    const batch = Array.isArray(res.items) ? res.items : [];
    collected.push(...batch);
    if (!res.hasMore || batch.length === 0) break;
    page += 1;
  }
  const nowMs = Date.now();
  return collected.map((item) => sanitizeSheetsNewsItem(item, nowMs));
}

async function invalidateEdgeReadCaches(newsId?: string): Promise<void> {
  const prevEpoch = cfReadCacheEpoch;
  cfReadCacheEpoch += 1;
  const cache = getDefaultEdgeCache();
  if (!cache) return;
  try {
    const epochsToClear = new Set<number>([1, prevEpoch, cfReadCacheEpoch]);
    const keys: string[] = [];
    for (const ep of epochsToClear) {
      keys.push(
        `https://cf-edge-cache.coffeenadu.invalid/apps-script-news?epoch=${ep}&page=1&limit=15`,
        `https://cf-edge-cache.coffeenadu.invalid/apps-script-news?epoch=${ep}&page=1&limit=50`,
        `https://cf-edge-cache.coffeenadu.invalid/apps-script-news?epoch=${ep}&page=2&limit=15`,
        `https://cf-edge-cache.coffeenadu.invalid/apps-script-news?epoch=${ep}&page=2&limit=50`
      );
    }
    keys.push(
      'https://cf-edge-cache.coffeenadu.invalid/apps-script-news?page=1&limit=15',
      'https://cf-edge-cache.coffeenadu.invalid/apps-script-news?page=1&limit=50',
      'https://cf-edge-cache.coffeenadu.invalid/apps-script-events?page=1&limit=20'
    );
    if (newsId) {
      keys.push(`https://cf-edge-cache.coffeenadu.invalid/apps-script-news-id/${encodeURIComponent(newsId)}`);
    }
    await Promise.allSettled(keys.map((k) => cache.delete(k)));
  } catch {
    // Non-fatal
  }
}

// ============================================================================
// CRYPTO & ADMIN SESSION / FIREBASE TOKEN VERIFICATION
// ============================================================================

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(str));
}

function base64UrlDecodeToBytes(b64u: string): Uint8Array | null {
  try {
    const normalized = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const binary = atob(normalized + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function base64UrlDecodeToString(b64u: string): string | null {
  const bytes = base64UrlDecodeToBytes(b64u);
  if (!bytes) return null;
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function getSigningSecretMaterial(env: PagesEnv | undefined): string {
  const configured =
    (env?.ADMIN2_SESSION_SECRET || '').trim() ||
    (env?.SESSION_SECRET || '').trim() ||
    (env?.APPS_SCRIPT_API_SECRET ? `cn2cf:${env.APPS_SCRIPT_API_SECRET.trim()}` : '');
  if (configured) return configured;

  if (!runtimeEphemeralSecret) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    runtimeEphemeralSecret = base64UrlEncodeBytes(buf);
  }
  return runtimeEphemeralSecret;
}

async function getHmacKey(env: PagesEnv | undefined, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const secret = getSigningSecretMaterial(env);
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

interface CfSessionPayload {
  id: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'admin';
  permissions: string[];
  protectedSuperAdmin: boolean;
  authProvider: 'firebase';
  sid: string;
  exp: number;
}

export async function signCfToken(payload: CfSessionPayload, env: PagesEnv | undefined): Promise<string> {
  const encoded = base64UrlEncodeString(JSON.stringify(payload));
  const key = await getHmacKey(env, 'sign');
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded));
  const sig = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
  return `cn2cf.${encoded}.${sig}`;
}

async function verifyCfToken(
  token: string,
  env: PagesEnv | undefined
): Promise<CfSessionPayload | null> {
  if (!token.startsWith('cn2cf.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sigB64] = parts;
  const sigBytes = base64UrlDecodeToBytes(sigB64);
  if (!sigBytes) return null;

  try {
    const key = await getHmacKey(env, 'verify');
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      new TextEncoder().encode(encoded)
    );
    if (!valid) return null;
    const rawJson = base64UrlDecodeToString(encoded);
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson) as CfSessionPayload;
    if (!parsed?.email || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getExtraAdminSet(env: PagesEnv | undefined): Set<string> {
  return new Set(
    (env?.EXTRA_ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAuthorizedEmail(email: string, env: PagesEnv | undefined): boolean {
  const lower = email.trim().toLowerCase();
  return OWNER_ADMIN_EMAILS.has(lower) || getExtraAdminSet(env).has(lower);
}

export async function verifyFirebaseTokenRaw(
  idToken: string,
  env: PagesEnv | undefined
): Promise<{
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
} | null> {
  const apiKey = (env?.FIREBASE_API_KEY || firebaseConfig.apiKey || '').trim();
  if (!apiKey || !idToken) return null;
  try {
    const fetchInit: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      fetchInit.signal = AbortSignal.timeout(6000);
    }
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      fetchInit
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
      }>;
    };
    const account = json.users?.[0];
    const email = (account?.email || '').trim().toLowerCase();
    const uid = account?.localId || '';
    if (!uid || !email) return null;
    return {
      uid,
      email,
      emailVerified: Boolean(account?.emailVerified),
      displayName: account?.displayName || email,
    };
  } catch {
    return null;
  }
}

interface VerifiedAdmin {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'admin';
  permissions: string[];
  protectedSuperAdmin: boolean;
  authProvider: 'firebase';
  sessionId: string;
}

async function authenticateAdminRequest(
  request: Request,
  env: PagesEnv | undefined
): Promise<{ admin: VerifiedAdmin } | { errorResponse: Response }> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { errorResponse: jsonErrorResponse(401, 'Administrator authentication token required.') };
  }

  if (token.startsWith('cn2cf.')) {
    const payload = await verifyCfToken(token, env);
    if (!payload || !isAuthorizedEmail(payload.email, env)) {
      return {
        errorResponse: jsonErrorResponse(
          401,
          'Invalid or expired admin session. Please sign in again.'
        ),
      };
    }
    return {
      admin: {
        id: payload.id,
        uid: payload.id,
        email: payload.email,
        fullName: payload.fullName,
        role: payload.role,
        permissions: payload.permissions,
        protectedSuperAdmin: payload.protectedSuperAdmin,
        authProvider: 'firebase',
        sessionId: payload.sid,
      },
    };
  }

  // Legacy Express-signed cn2.* token cannot be verified in standalone Cloudflare mode without BACKEND_ORIGIN
  if (token.startsWith('cn2.')) {
    return {
      errorResponse: jsonErrorResponse(
        401,
        'Your admin session expired or belongs to another server. Please sign in again.'
      ),
    };
  }

  const fb = await verifyFirebaseTokenRaw(token, env);
  if (!fb) {
    return {
      errorResponse: jsonErrorResponse(
        401,
        'Invalid or expired Google/Firebase sign-in. Please sign in again.'
      ),
    };
  }
  if (!fb.emailVerified) {
    return {
      errorResponse: jsonErrorResponse(403, 'Verified administrator email is required.'),
    };
  }
  if (!isAuthorizedEmail(fb.email, env)) {
    return {
      errorResponse: jsonErrorResponse(
        403,
        `Account ${fb.email} is not authorized for CoffeeNadu News administration.`
      ),
    };
  }

  const owner = OWNER_ADMIN_EMAILS.has(fb.email);
  return {
    admin: {
      id: fb.uid,
      uid: fb.uid,
      email: fb.email,
      fullName: fb.displayName || fb.email,
      role: owner ? 'super_admin' : 'admin',
      permissions: owner ? [...ROLE_DEFAULT_PERMISSIONS.super_admin] : [...ROLE_DEFAULT_PERMISSIONS.admin],
      protectedSuperAdmin: owner,
      authProvider: 'firebase',
      sessionId: `fb-${fb.uid.slice(0, 12)}`,
    },
  };
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function buildRememberedSetCookie(token: string, maxAgeSeconds: number): string {
  return `${REMEMBERED_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/admin2/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function buildClearRememberedSetCookie(): string {
  return `${REMEMBERED_COOKIE_NAME}=; Path=/api/admin2/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ============================================================================
// HUDKOO LIVE BUS TIMINGS (CF WORKER DIRECT)
// ============================================================================

interface RawHudkooTiming {
  timing_id: number;
  departure_time: string;
  bus_name: string | null;
  remarks: string | null;
  from_place_name_en?: string | null;
  from_place_name_kn?: string | null;
  is_active?: boolean;
}

interface RawHudkooPlace {
  title_id: number;
  place_id: number;
  title_en: string;
  title_kn: string;
  is_active?: boolean;
  routes?: Array<{
    route_id: number;
    route_name: string;
    description: string;
    is_active?: boolean;
  }>;
}

function formatDepartureTime(time24: string): string {
  const parts = (time24 || '').trim().split(':');
  const hourNum = Number(parts[0]);
  const minStr = (parts[1] || '00').padStart(2, '0');
  if (Number.isNaN(hourNum)) return time24;
  const period = hourNum >= 12 ? 'PM' : 'AM';
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
  return `${String(hour12).padStart(2, '0')}:${minStr} ${period}`;
}

async function handleBusTimingsDirect(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requestedTitleId = Number(url.searchParams.get('titleId')) || 1;
  const cache = getDefaultEdgeCache();
  const edgeKey = `https://cf-edge-cache.coffeenadu.invalid/bus-timings?titleId=${requestedTitleId}`;

  if (cache) {
    try {
      const hit = await cache.match(edgeKey);
      if (hit) return hit;
    } catch {
      // Proceed to live fetch
    }
  }

  try {
    const placesResp = await fetch('https://hudkoo.com/api/bus/main-places', {
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
    });
    if (!placesResp.ok) {
      return jsonErrorResponse(502, 'Bus timings directory is temporarily unavailable.');
    }
    const rawPlaces = ((await placesResp.json()) as RawHudkooPlace[]).filter(
      (p) => p.is_active !== false
    );
    if (!Array.isArray(rawPlaces) || rawPlaces.length === 0) {
      return jsonErrorResponse(502, 'Bus timings directory is temporarily unavailable.');
    }

    const places = rawPlaces.map((p) => ({
      titleId: p.title_id,
      placeId: p.place_id,
      nameEn: p.title_en.trim(),
      nameKn: p.title_kn.trim(),
      routeCount: (p.routes || []).filter((r) => r.is_active !== false).length,
    }));

    const activeRaw = rawPlaces.find((p) => p.title_id === requestedTitleId) || rawPlaces[0];
    const activePlace = places.find((p) => p.titleId === activeRaw.title_id) || places[0];
    const activeRoutes = (activeRaw.routes || []).filter((r) => r.is_active !== false);

    const routes = await Promise.all(
      activeRoutes.map(async (route) => {
        try {
          const detailResp = await fetch(
            `https://hudkoo.com/api/bus/routes/${route.route_id}/details`,
            {
              signal:
                typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
            }
          );
          if (!detailResp.ok) {
            return {
              routeId: route.route_id,
              routeName: route.route_name.trim(),
              description: route.description.trim(),
              timings: [],
            };
          }
          const detailJson = (await detailResp.json()) as { timings?: RawHudkooTiming[] };
          const timings = (detailJson.timings || [])
            .filter((t) => t.is_active !== false)
            .sort((a, b) => a.departure_time.localeCompare(b.departure_time))
            .map((t) => ({
              timingId: t.timing_id,
              departureTime: formatDepartureTime(t.departure_time),
              departureTime24: t.departure_time.slice(0, 5),
              busName: (t.bus_name || '').trim(),
              remarks: (t.remarks || '').trim(),
              fromPlaceEn: (t.from_place_name_en || '').trim() || activeRaw.title_en.trim(),
              fromPlaceKn: (t.from_place_name_kn || '').trim() || activeRaw.title_kn.trim(),
            }));
          return {
            routeId: route.route_id,
            routeName: route.route_name.trim(),
            description: route.description.trim(),
            timings,
          };
        } catch {
          return {
            routeId: route.route_id,
            routeName: route.route_name.trim(),
            description: route.description.trim(),
            timings: [],
          };
        }
      })
    );

    const body = JSON.stringify({ places, activePlace, routes });
    const response = new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=1800, s-maxage=${BUS_CACHE_TTL_SECONDS}`,
      },
    });
    if (cache) {
      try {
        await cache.put(edgeKey, response.clone());
      } catch {
        // Non-fatal
      }
    }
    return response;
  } catch (err) {
    return jsonErrorResponse(
      502,
      err instanceof Error ? err.message : 'Unable to load bus timings right now.'
    );
  }
}

interface CfBusPlaceAlias {
  key: string;
  labelEn: string;
  labelKn: string;
  aliases: string[];
}

const CF_BUS_PLACE_ALIASES: CfBusPlaceAlias[] = [
  { key: 'koppa', labelEn: 'Koppa', labelKn: 'ಕೊಪ್ಪ', aliases: ['koppa', 'ಕೊಪ್ಪ'] },
  { key: 'shivamogga', labelEn: 'Shivamogga', labelKn: 'ಶಿವಮೊಗ್ಗ', aliases: ['shivamogga', 'shimoga', 'shivamoga', 'ಶಿವಮೊಗ್ಗ'] },
  { key: 'bengaluru', labelEn: 'Bengaluru', labelKn: 'ಬೆಂಗಳೂರು', aliases: ['bengaluru', 'bangalore', 'blr', 'ಬೆಂಗಳೂರು'] },
  { key: 'mangaluru', labelEn: 'Mangaluru', labelKn: 'ಮಂಗಳೂರು', aliases: ['mangaluru', 'mangalore', 'mlr', 'ಮಂಗಳೂರು'] },
  { key: 'chikkamagaluru', labelEn: 'Chikkamagaluru', labelKn: 'ಚಿಕ್ಕಮಗಳೂರು', aliases: ['chikkamagaluru', 'chikmagalur', 'chikamagaluru', 'ಚಿಕ್ಕಮಗಳೂರು'] },
  { key: 'sringeri', labelEn: 'Sringeri', labelKn: 'ಶೃಂಗೇರಿ', aliases: ['sringeri', 'shringeri', 'ಶೃಂಗೇರಿ'] },
  { key: 'thirthahalli', labelEn: 'Thirthahalli', labelKn: 'ತೀರ್ಥಹಳ್ಳಿ', aliases: ['thirthahalli', 'therthahalli', 'tirthahalli', 'ತೀರ್ಥಹಳ್ಳಿ'] },
  { key: 'balehonnur', labelEn: 'Balehonnur', labelKn: 'ಬಾಳೆಹೊನ್ನೂರು', aliases: ['balehonnuru', 'balehonnur', 'ಬಾಳೆಹೊನ್ನೂರು'] },
  { key: 'nrpura', labelEn: 'N.R. Pura', labelKn: 'ಎನ್.ಆರ್ ಪುರ', aliases: ['n.r. pura', 'n.r pura', 'nr pura', 'nrpura', 'narasimharajapura', 'ಎನ್.ಆರ್ ಪುರ', 'ನರಸಿಂಹರಾಜಪುರ'] },
  { key: 'jayapura', labelEn: 'Jayapura', labelKn: 'ಜಯಪುರ', aliases: ['jayapura', 'ಜಯಪುರ'] },
  { key: 'horanadu', labelEn: 'Horanadu', labelKn: 'ಹೊರನಾಡು', aliases: ['horanadu', 'ಹೊರನಾಡು'] },
  { key: 'kalasa', labelEn: 'Kalasa', labelKn: 'ಕಳಸ', aliases: ['kalasa', 'ಕಳಸ'] },
  { key: 'agumbe', labelEn: 'Agumbe', labelKn: 'ಆಗುಂಬೆ', aliases: ['agumbe', 'ಆಗುಂಬೆ'] },
  { key: 'udupi', labelEn: 'Udupi', labelKn: 'ಉಡುಪಿ', aliases: ['udupi', 'ಉಡುಪಿ'] },
  { key: 'hariharapura', labelEn: 'Hariharapura', labelKn: 'ಹರಿಹರಪುರ', aliases: ['hariharapura', 'ಹರಿಹರಪುರ'] },
  { key: 'karkala', labelEn: 'Karkala', labelKn: 'ಕಾರ್ಕಳ', aliases: ['karkala', 'ಕಾರ್ಕಳ'] },
  { key: 'tarikere', labelEn: 'Tarikere', labelKn: 'ತರೀಕೆರೆ', aliases: ['tarikere', 'ತರೀಕೆರೆ'] },
  { key: 'birur', labelEn: 'Birur', labelKn: 'ಬೀರೂರು', aliases: ['birur', 'ಬೀರೂರು'] },
  { key: 'bhadravathi', labelEn: 'Bhadravathi', labelKn: 'ಭದ್ರಾವತಿ', aliases: ['bhadravathi', 'bhadravati', 'ಭದ್ರಾವತಿ'] },
  { key: 'sagara', labelEn: 'Sagara', labelKn: 'ಸಾಗರ', aliases: ['sagara', 'sagar', 'ಸಾಗರ'] },
  { key: 'mysuru', labelEn: 'Mysuru', labelKn: 'ಮೈಸೂರು', aliases: ['mysuru', 'mysore', 'ಮೈಸೂರು'] },
  { key: 'dharmasthala', labelEn: 'Dharmasthala', labelKn: 'ಧರ್ಮಸ್ಥಳ', aliases: ['dharmasthala', 'ಧರ್ಮಸ್ಥಳ'] },
  { key: 'basarikatte', labelEn: 'Basarikatte', labelKn: 'ಬಸರಿಕಟ್ಟೆ', aliases: ['basarikatte', 'basrikatte', 'ಬಸರಿಕಟ್ಟೆ'] },
  { key: 'aldur', labelEn: 'Aldur', labelKn: 'ಆಲ್ದೂರು', aliases: ['aldur', 'ಆಲ್ದೂರು'] },
  { key: 'hebri', labelEn: 'Hebri', labelKn: 'ಹೆಬ್ರಿ', aliases: ['hebri', 'ಹೆಬ್ರಿ'] },
  { key: 'kadur', labelEn: 'Kadur', labelKn: 'ಕಡೂರು', aliases: ['kadur', 'ಕಡೂರು'] },
];

function resolveCfPlaceAlias(raw: string): CfBusPlaceAlias | null {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!lower) return null;
  for (const entry of CF_BUS_PLACE_ALIASES) {
    if (entry.aliases.some((a) => lower.includes(a.toLowerCase()))) {
      return entry;
    }
  }
  return null;
}

function getCfTimeBucket(time24: string | undefined, formatted: string): 'morning' | 'afternoon' | 'evening' {
  let hour24 = 0;
  if (time24 && /^\d{1,2}:\d{2}/.test(time24)) {
    hour24 = Number(time24.split(':')[0]);
  } else {
    const isPm = formatted.endsWith('PM');
    const hourPart = Number(formatted.split(':')[0]);
    hour24 = isPm ? (hourPart === 12 ? 12 : hourPart + 12) : hourPart === 12 ? 0 : hourPart;
  }
  if (hour24 >= 4 && hour24 < 12) return 'morning';
  if (hour24 >= 12 && hour24 < 17) return 'afternoon';
  return 'evening';
}

async function handleBusAgentDirect(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  let directOrigin = typeof body.origin === 'string' ? body.origin.trim() : '';
  let directDestination = typeof body.destination === 'string' ? body.destination.trim() : '';
  const timePref =
    body.timePreference === 'morning' ||
    body.timePreference === 'afternoon' ||
    body.timePreference === 'evening'
      ? body.timePreference
      : 'all';

  const messageObjects: Array<{ role?: string; text?: string }> = Array.isArray(body.messages)
    ? (body.messages as Array<{ role?: string; text?: string }>)
    : typeof body.message === 'string' && body.message.trim()
    ? [{ role: 'user', text: body.message.trim() }]
    : [];

  if ((!directOrigin || !directDestination) && messageObjects.length > 0) {
    for (const msg of messageObjects) {
      if (!msg || typeof msg !== 'object' || msg.role !== 'user') continue;
      const txt = String(msg.text || '').trim();
      if (!txt) continue;
      const sepMatch = txt.match(/(.+?)(?:\s+to\s+|\s*->\s*|\s*→\s*|ದಿಂದ\s*|ಯಿಂದ\s*|ನಿಂದ\s+)(.+)/i);
      if (sepMatch) {
        const leftRaw = sepMatch[1].replace(/\bfrom\b/gi, '').trim();
        const rightRaw = sepMatch[2].trim();
        const leftAlias = resolveCfPlaceAlias(leftRaw);
        const rightAlias = resolveCfPlaceAlias(rightRaw);
        if (leftAlias || leftRaw) {
          directOrigin = leftAlias ? leftAlias.labelEn : leftRaw;
        }
        const isGenericFiller = /^(ಬಸ್|ಬೇಕು|ಯಾವಾಗ|ವೇಳಾಪಟ್ಟಿ|ಸಮಯ|bus|buses|timing|timings|schedule|please|\s)+$/i.test(
          rightRaw
        );
        if (rightAlias) {
          directDestination = rightAlias.labelEn;
        } else if (rightRaw && !isGenericFiller) {
          directDestination = rightRaw;
        }
      } else {
        const hit = resolveCfPlaceAlias(txt);
        if (hit) {
          if (!directOrigin) directOrigin = hit.labelEn;
          else if (!directDestination && hit.labelEn.toLowerCase() !== directOrigin.toLowerCase()) {
            directDestination = hit.labelEn;
          }
        }
      }
    }
  }

  if (!directOrigin && !directDestination) {
    return jsonResponse({
      status: 'needs_both',
      reply:
        'Please enter 1. From Where and 2. To Where (e.g., Koppa to Shivamogga).\nದಯವಿಟ್ಟು ೧. ಎಲ್ಲಿಂದ ಮತ್ತು ೨. ಎಲ್ಲಿಗೆ ಹೋಗಬೇಕೆಂದು ನಮೂದಿಸಿ (ಉದಾ: ಕೊಪ್ಪದಿಂದ ಶಿವಮೊಗ್ಗ).',
      timePreference: timePref,
      matchedRoutes: [],
    });
  }
  if (directOrigin && !directDestination) {
    const origEntry = resolveCfPlaceAlias(directOrigin);
    const label = origEntry ? `${origEntry.labelEn} (${origEntry.labelKn})` : directOrigin;
    return jsonResponse({
      status: 'needs_destination',
      origin: origEntry?.labelEn || directOrigin,
      timePreference: timePref,
      reply: `2. To Where? Where would you like to go from ${label}?\n೨. ಎಲ್ಲಿಗೆ? ನೀವು ${origEntry?.labelKn || directOrigin} ನಿಂದ ಎಲ್ಲಿಗೆ ಪ್ರಯಾಣಿಸಲು ಬಯಸುತ್ತೀರಿ?`,
      matchedRoutes: [],
    });
  }
  if (!directOrigin && directDestination) {
    const destEntry = resolveCfPlaceAlias(directDestination);
    const label = destEntry ? `${destEntry.labelEn} (${destEntry.labelKn})` : directDestination;
    return jsonResponse({
      status: 'needs_origin',
      destination: destEntry?.labelEn || directDestination,
      timePreference: timePref,
      reply: `1. From Where? Where are you departing from to reach ${label}?\n೧. ಎಲ್ಲಿಂದ? ನೀವು ${destEntry?.labelKn || directDestination} ತಲುಪಲು ಎಲ್ಲಿಂದ ಹೊರಡುತ್ತಿದ್ದೀರಿ?`,
      matchedRoutes: [],
    });
  }

  const origAlias = resolveCfPlaceAlias(directOrigin);
  const destAlias = resolveCfPlaceAlias(directDestination);
  const origTerms = origAlias ? origAlias.aliases.map((a) => a.toLowerCase()) : [directOrigin.toLowerCase()];
  const destTerms = destAlias ? destAlias.aliases.map((a) => a.toLowerCase()) : [directDestination.toLowerCase()];
  const originLabel = origAlias ? `${origAlias.labelEn} (${origAlias.labelKn})` : directOrigin;
  const destLabel = destAlias ? `${destAlias.labelEn} (${destAlias.labelKn})` : directDestination;

  try {
    const placesResp = await fetch('https://hudkoo.com/api/bus/main-places', {
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
    });
    if (!placesResp.ok) {
      return jsonErrorResponse(502, 'Bus timings directory is temporarily unavailable.');
    }
    const rawPlaces = ((await placesResp.json()) as RawHudkooPlace[]).filter(
      (p) => p.is_active !== false
    );
    const matchingPlaces = rawPlaces.filter((p) => {
      const hay = `${p.title_en} ${p.title_kn}`.toLowerCase();
      return origTerms.some((t) => hay.includes(t));
    });
    const candidatePlaces = matchingPlaces.length > 0 ? matchingPlaces : rawPlaces.slice(0, 6);

    const matchedRoutes: Array<{
      placeNameEn: string;
      placeNameKn: string;
      routeId: number;
      routeTitle: string;
      routeSubtitle?: string;
      fromPlaceLabel: string;
      matchType: 'direct' | 'via';
      timings: Array<{
        timingId: number;
        departureTime: string;
        departureTime24: string;
        busName: string;
        remarks: string;
        fromPlaceEn: string;
        fromPlaceKn: string;
      }>;
    }> = [];

    for (const place of candidatePlaces) {
      const activeRoutes = (place.routes || []).filter((r) => r.is_active !== false);
      for (const route of activeRoutes) {
        const routeText = `${place.title_en} ${place.title_kn} ${route.route_name} ${route.description}`.toLowerCase();
        if (!destTerms.some((t) => routeText.includes(t))) continue;
        try {
          const detailResp = await fetch(
            `https://hudkoo.com/api/bus/routes/${route.route_id}/details`,
            {
              signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
            }
          );
          if (!detailResp.ok) continue;
          const detailJson = (await detailResp.json()) as { timings?: RawHudkooTiming[] };
          const timings = (detailJson.timings || [])
            .filter((t) => t.is_active !== false)
            .sort((a, b) => a.departure_time.localeCompare(b.departure_time))
            .map((t) => ({
              timingId: t.timing_id,
              departureTime: formatDepartureTime(t.departure_time),
              departureTime24: t.departure_time.slice(0, 5),
              busName: (t.bus_name || '').trim(),
              remarks: (t.remarks || '').trim(),
              fromPlaceEn: (t.from_place_name_en || '').trim() || place.title_en.trim(),
              fromPlaceKn: (t.from_place_name_kn || '').trim() || place.title_kn.trim(),
            }))
            .filter((t) => {
              if (timePref !== 'all' && getCfTimeBucket(t.departureTime24, t.departureTime) !== timePref) {
                return false;
              }
              return origTerms.some((term) => `${t.fromPlaceEn} ${t.fromPlaceKn}`.toLowerCase().includes(term));
            });

          if (timings.length > 0) {
            matchedRoutes.push({
              placeNameEn: place.title_en.trim(),
              placeNameKn: place.title_kn.trim(),
              routeId: route.route_id,
              routeTitle: route.route_name.trim() || route.description.trim(),
              routeSubtitle: route.description.trim() || undefined,
              fromPlaceLabel: `Departs from ${place.title_en.trim()} → ${destAlias?.labelEn || directDestination}`,
              matchType: 'direct',
              timings,
            });
          }
        } catch {
          // Continue checking other routes
        }
      }
    }

    const totalBuses = matchedRoutes.reduce((sum, r) => sum + r.timings.length, 0);
    const reply =
      totalBuses > 0
        ? `Found ${totalBuses} direct bus${totalBuses === 1 ? '' : 'es'} from ${originLabel} to ${destLabel} across ${matchedRoutes.length} route${matchedRoutes.length === 1 ? '' : 's'}.\n${originLabel} ನಿಂದ ${destLabel} ಗೆ ${totalBuses} ನೇರ ಬಸ್‌ಗಳು ಲಭ್ಯವಿವೆ.`
        : `No direct bus route from ${originLabel} to ${destLabel} was found in the current schedule.\n${originLabel} ನಿಂದ ${destLabel} ಗೆ ಪ್ರಸ್ತುತ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ನೇರ ಬಸ್ ಮಾರ್ಗ ಕಂಡುಬಂದಿಲ್ಲ.`;

    return jsonResponse({
      status: 'ready',
      reply,
      origin: originLabel,
      destination: destLabel,
      timePreference: timePref,
      matchedRoutes,
      suggestedHubs: totalBuses === 0 ? ['Koppa', 'Jayapura', 'Balehonnur', 'Sringeri'] : [],
    });
  } catch (err) {
    return jsonErrorResponse(
      502,
      err instanceof Error ? err.message : 'Unable to load bus schedules right now.'
    );
  }
}

// ============================================================================
// GOOGLE DRIVE & OG IMAGE STREAMING (CF WORKER DIRECT)
// ============================================================================

async function fetchDriveImageResponse(
  fileId: string,
  sizeVariant: 'thumb' | 'full'
): Promise<Response | null> {
  if (!/^[a-zA-Z0-9_-]{10,120}$/.test(fileId)) return null;
  const cache = getDefaultEdgeCache();
  const edgeUrl = `https://cf-edge-cache.coffeenadu.invalid/drive/${encodeURIComponent(fileId)}?size=${sizeVariant}`;

  if (cache) {
    try {
      const hit = await cache.match(edgeUrl);
      if (hit) return hit;
    } catch {
      // Proceed to fetch from Google Drive
    }
  }

  const widthParam = sizeVariant === 'thumb' ? 'w480' : 'w1600';
  const encodedId = encodeURIComponent(fileId);
  const candidates = [
    `https://drive.google.com/thumbnail?id=${encodedId}&sz=${widthParam}`,
    `https://lh3.googleusercontent.com/d/${encodedId}=${widthParam}`,
    `https://drive.google.com/uc?export=view&id=${encodedId}`,
  ];

  for (const upstreamUrl of candidates) {
    try {
      const upstream = await fetch(upstreamUrl, {
        redirect: 'follow',
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
      });
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (upstream.ok && ct.startsWith('image/')) {
        const bytes = await upstream.arrayBuffer();
        if (bytes.byteLength > 0 && bytes.byteLength < 8 * 1024 * 1024) {
          const resp = new Response(bytes, {
            status: 200,
            headers: {
              'content-type': ct,
              'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
              'x-coffeenadu-cache': 'EDGE',
            },
          });
          if (cache) {
            try {
              await cache.put(edgeUrl, resp.clone());
            } catch {
              // Non-fatal
            }
          }
          return resp;
        }
      }
    } catch {
      // Try next Google Drive URL format
    }
  }
  return null;
}

async function fetchFallbackAssetImage(
  request: Request,
  env: PagesEnv | undefined
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const assetUrl = `${incomingUrl.origin}/pwa-512x512.png`;
  try {
    if (env?.ASSETS?.fetch) {
      const res = await env.ASSETS.fetch(assetUrl);
      if (res.ok) return res;
    }
    const direct = await fetch(assetUrl);
    if (direct.ok) return direct;
  } catch {
    // Fall through
  }
  return new Response(null, { status: 404 });
}

function extractDriveIdFromImageUrl(imageUrl: string, explicitDriveId?: string): string {
  const direct = (explicitDriveId || '').trim();
  if (/^[a-zA-Z0-9_-]{10,120}$/.test(direct)) return direct;
  const proxyMatch = (imageUrl || '').match(/\/api\/media\/drive\/([a-zA-Z0-9_-]{10,120})/);
  return proxyMatch?.[1] || '';
}

async function handleEntityOgImage(
  kind: 'article' | 'event' | 'default',
  entityId: string,
  request: Request,
  env: PagesEnv | undefined
): Promise<Response> {
  if (kind !== 'default' && entityId && getAppsScriptConfig(env).configured) {
    try {
      let imageUrl = '';
      let driveId = '';
      if (kind === 'article') {
        const res = await callAppsScriptGet<{ ok?: boolean; item?: SheetsNewsItem }>(
          env,
          'getNewsById',
          { newsId: entityId }
        );
        if (res?.ok && res.item) {
          imageUrl = res.item.imageUrl || '';
          driveId = extractDriveIdFromImageUrl(imageUrl, res.item.imageDriveId);
        }
      } else {
        const res = await callAppsScriptGet<{ ok?: boolean; item?: SheetsEventItem }>(
          env,
          'getEventById',
          { eventId: entityId }
        );
        if (res?.ok && res.item) {
          imageUrl = res.item.imageUrl || '';
          driveId = extractDriveIdFromImageUrl(imageUrl, res.item.imageDriveId);
        }
      }

      if (driveId) {
        const driveResp = await fetchDriveImageResponse(driveId, 'full');
        if (driveResp) return driveResp;
      }
      if (/^https:\/\//i.test(imageUrl)) {
        const remote = await fetch(imageUrl, { redirect: 'follow' });
        const ct = (remote.headers.get('content-type') || '').toLowerCase();
        if (remote.ok && ct.startsWith('image/')) {
          return new Response(remote.body, {
            status: 200,
            headers: {
              'content-type': ct,
              'cache-control': 'public, max-age=3600',
            },
          });
        }
      }
    } catch {
      // Fall through to site brand fallback
    }
  }
  return fetchFallbackAssetImage(request, env);
}

// ============================================================================
// STANDALONE CLOUDFLARE LOCAL ADS STORE & DEFAULT SETTINGS
// ============================================================================

function getDefaultAdPlatformSettings() {
  return {
    rotationMode: 'both' as const,
    rotationSpeedSeconds: 5,
    maxAdsPerPlacement: 6,
    rotationOrder: 'priority' as const,
    avoidRepeatInSession: true,
    defaultShareMessage:
      '*{adTitle}*\nAdvertiser ID: {adNumber}\n\n{adDescription}\n\nContact: {contactInfo}\nLocation: {location}\n\nView full advertisement:\n{adUrl}\n\n— CoffeeNadu News Local Ads',
    customCategories: [] as string[],
    approvalWorkflowEnabled: false,
    defaultDisplayFrequency: 'once_per_session' as const,
    defaultMaxImpressionsPerVisitor: 0,
    globalPlacementsEnabled: {
      articlePopup: true,
      endOfArticle: true,
      homepagePopup: true,
      websiteEntry: true,
      homepageSection: true,
      articleInline: true,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

interface CfStoredAdRecord {
  id: string;
  adNumber: string;
  title: string;
  advertiserName: string;
  businessType: string;
  category: string;
  description: string;
  tagline: string;
  imageUrl: string;
  imagePath: string;
  additionalImages: string[];
  aspectRatioPreset: string;
  contactPhone: string;
  whatsappNumber: string;
  whatsappPrefilledMessage: string;
  websiteUrl: string;
  googleMapsLocation: string;
  address: string;
  email: string;
  ctaButtonText: string;
  ctaActionType: string;
  placements: {
    articlePopup: boolean;
    endOfArticle: boolean;
    homepagePopup: boolean;
    websiteEntry: boolean;
    homepageSection: boolean;
    articleInline: boolean;
  };
  targetCategories: string[];
  targetLocations: string[];
  targetArticleIds: string[];
  targetDevice: string;
  startDate: string;
  endDate: string;
  status: string;
  approvalStatus: string;
  priority: string;
  priorityOrder: number;
  featuredSponsor: boolean;
  displayFrequency: string;
  maxImpressionsPerVisitor: number;
  popupDelaySeconds: number;
  popupAutoCloseSeconds: number;
  allowSkipImmediately: boolean;
  sponsoredBadgeText: string;
  paymentStatus: string;
  priceAmount: number;
  paymentNotes: string;
  impressions: number;
  uniqueImpressions: number;
  clicks: number;
  whatsappClicks: number;
  phoneClicks: number;
  websiteClicks: number;
  directionsClicks: number;
  shareClicks: number;
  desktopImpressions: number;
  mobileImpressions: number;
  placementStats: Record<string, { impressions: number; clicks: number }>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

let cfAdsList: CfStoredAdRecord[] = [];
let cfAdSettings = getDefaultAdPlatformSettings();
let cfAdsHydrated = false;

const CF_ADS_CACHE_KEY = 'https://cf-edge-cache.coffeenadu.invalid/local-ads-store-v1';

async function ensureCfAdsStoreHydrated(): Promise<void> {
  if (cfAdsHydrated) return;
  cfAdsHydrated = true;
  const cache = getDefaultEdgeCache();
  if (!cache) return;
  try {
    const hit = await cache.match(CF_ADS_CACHE_KEY);
    if (hit) {
      const parsed = (await hit.json()) as {
        ads?: CfStoredAdRecord[];
        settings?: ReturnType<typeof getDefaultAdPlatformSettings>;
      };
      if (Array.isArray(parsed?.ads)) {
        cfAdsList = parsed.ads;
      }
      if (parsed?.settings && typeof parsed.settings === 'object') {
        cfAdSettings = {
          ...getDefaultAdPlatformSettings(),
          ...parsed.settings,
          globalPlacementsEnabled: {
            ...getDefaultAdPlatformSettings().globalPlacementsEnabled,
            ...(parsed.settings.globalPlacementsEnabled || {}),
          },
        };
      }
    }
  } catch {
    // Non-fatal
  }
}

async function persistCfAdsStore(): Promise<void> {
  const cache = getDefaultEdgeCache();
  if (!cache) return;
  try {
    await cache.put(
      CF_ADS_CACHE_KEY,
      new Response(JSON.stringify({ ads: cfAdsList, settings: cfAdSettings }), {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=2592000',
        },
      })
    );
  } catch {
    // Non-fatal
  }
}

function computeCfNextAdNumber(): string {
  let maxNum = 0;
  for (const ad of cfAdsList) {
    const m = String(ad.adNumber || '').match(/AD0*(\d+)/i);
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `AD${String(maxNum + 1).padStart(3, '0')}`;
}

function computeCfEffectiveStatus(ad: CfStoredAdRecord, todayYmd: string): string {
  if (ad.status === 'draft' || ad.status === 'inactive') return ad.status;
  if (ad.endDate && ad.endDate < todayYmd) return 'expired';
  if (ad.startDate && ad.startDate > todayYmd) return 'scheduled';
  return 'active';
}

function buildCfAdminAdsPayload() {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const enriched = cfAdsList.map((ad) => {
    const effectiveStatus = computeCfEffectiveStatus(ad, todayYmd);
    const mergedViews = Math.max(
      Number((ad as { views?: number }).views) || 0,
      Number(ad.impressions) || 0
    );
    const ctrPct = mergedViews > 0 ? Math.round((ad.clicks / mergedViews) * 1000) / 10 : 0;
    return {
      ...ad,
      views: mergedViews,
      impressions: mergedViews,
      effectiveStatus,
      ctrPct,
    };
  });
  const stats = {
    total: enriched.length,
    active: enriched.filter((a) => a.effectiveStatus === 'active').length,
    inactive: enriched.filter((a) => a.effectiveStatus === 'inactive').length,
    scheduled: enriched.filter((a) => a.effectiveStatus === 'scheduled').length,
    expired: enriched.filter((a) => a.effectiveStatus === 'expired').length,
    draft: enriched.filter((a) => a.effectiveStatus === 'draft').length,
    pendingApproval: enriched.filter((a) => a.approvalStatus === 'pending').length,
  };
  return {
    ok: true,
    ads: enriched,
    items: enriched,
    stats,
    nextAdNumber: computeCfNextAdNumber(),
    todayYmd,
    settings: cfAdSettings,
  };
}

function getDefaultWebsiteSettings(publicOrigin: string) {
  return {
    siteName: 'Coffeenadu News',
    siteTagline: 'Koppa Taluk Local Kannada News Portal',
    canonicalBaseUrl: publicOrigin,
    defaultLanguage: 'Kannada' as const,
    whatsappNumber: '+919448000000',
    whatsappGroupUrl: '',
    defaultSeoTitle: 'Coffeenadu News — Koppa Taluk Local Kannada News',
    defaultMetaDescription:
      'Local Koppa Taluk news publishing portal featuring English navigation and fast-loading Kannada news updates across categories.',
    ga4MeasurementId: '',
    searchConsoleSiteUrl: publicOrigin,
    watermarkLogoEnabled: true,
    watermarkMiddleTextEnabled: true,
    watermarkMiddleText: 'COFFEENADU NEWS',
    breakingTickerNotice: '',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

function getDefaultNotificationPreferences() {
  return {
    publishingSuccess: true,
    publishingFailure: true,
    imageProcessing: true,
    backupAlerts: true,
    storageWarnings: true,
    automationErrors: true,
    adminSecurityActivity: true,
    readerMessages: true,
  };
}

function stripMarkup(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const cfLiveArticleViewsMap: Record<string, number> = {};

function buildAnalyticsFromNews(news: SheetsNewsItem[], days = 14, publicOrigin = CANONICAL_PUBLIC_ORIGIN) {
  const safeDays = Math.min(90, Math.max(7, Number(days) || 14));
  const dailySeries: Array<{
    date: string;
    pageViews: number;
    uniqueVisitors: number;
    articleReads: number;
  }> = [];
  const today = new Date();
  for (let i = safeDays - 1; i >= 0; i -= 1) {
    const dt = new Date(today.getTime() - i * 86_400_000);
    dailySeries.push({
      date: dt.toISOString().slice(0, 10),
      pageViews: 0,
      uniqueVisitors: 0,
      articleReads: 0,
    });
  }

  let totalSheetArticleViews = 0;
  const catCounts = new Map<string, { articles: number; views: number }>();

  const topArticles = news
    .map((item) => {
      const views = Math.max(
        Number(item.views) || 0,
        Number(cfLiveArticleViewsMap[item.newsId]) || 0
      );
      totalSheetArticleViews += views;
      const cat = item.category || 'Local';
      const c = catCounts.get(cat) || { articles: 0, views: 0 };
      c.articles += 1;
      c.views += views;
      catCounts.set(cat, c);

      const loc = item.location || 'ಕೊಪ್ಪ';

      return {
        id: item.newsId,
        title: stripMarkup(item.title),
        category: cat,
        location: loc,
        publishedDate: item.publishedDate || '',
        views,
      };
    })
    .sort((a, b) => b.views - a.views);

  const categoryPerformance = Array.from(catCounts.entries())
    .map(([category, v]) => ({
      category,
      articles: v.articles,
      views: v.views,
    }))
    .sort((a, b) => b.views - a.views);

  return {
    rangeDays: safeDays,
    dailySeries,
    totals: {
      pageViews: 0,
      uniqueVisitors: 0,
      articleReads: totalSheetArticleViews,
      totalSheetArticleViews,
      totalPublishedArticles: news.length,
    },
    trafficSources: [] as Array<{ source: string; count: number; pct: number }>,
    deviceBreakdown: [] as Array<{ device: string; count: number; pct: number }>,
    categoryPerformance,
    topArticles: topArticles.slice(0, 12),
    recentlyViewedArticles: topArticles.slice(0, 8).map((a) => ({
      ...a,
      viewedAt: new Date().toISOString(),
    })),
    ga4Connected: false,
    ga4MeasurementId: '',
    searchConsoleConnected: true,
    searchConsoleSiteUrl: publicOrigin,
  };
}

// ============================================================================
// MAIN DIRECT CLOUDFLARE API ROUTER
// ============================================================================

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleApiDirectOnCloudflare(
  context: PagesFunctionContext
): Promise<Response> {
  try {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const publicOrigin = resolvePublicOrigin(env);
  let appsScriptCfg = getAppsScriptConfig(env);

  // 1. Health & Public Storage Status
  if (pathname === '/api/health' && method === 'GET') {
    return jsonResponse({ ok: true, runtime: 'cloudflare-pages' });
  }

  if (pathname === '/api/storage/status' && method === 'GET') {
    return jsonResponse({
      mode: appsScriptCfg.configured ? 'google_sheets' : 'firebase_fallback',
      configured: appsScriptCfg.configured,
      cacheTtlMinutes: CACHE_TTL_MINUTES,
      runtime: 'cloudflare-pages',
    });
  }

  if (pathname === '/api/share-config' && method === 'GET') {
    return jsonResponse({
      customDomain: publicOrigin,
      deepLinkOrigin: publicOrigin,
      customDomainSupportsDeepLinks: true,
    });
  }

  // 2. Public Bus Timings, Bus AI Agent & Drive/Entity Images
  if (pathname === '/api/bus-timings' && method === 'GET') {
    return handleBusTimingsDirect(request);
  }

  if (pathname === '/api/bus-agent' && method === 'POST') {
    return handleBusAgentDirect(request);
  }

  if (pathname === '/api/og-default-image' && (method === 'GET' || method === 'HEAD')) {
    return handleEntityOgImage('default', '', request, env);
  }

  const articleImgMatch = pathname.match(/^\/api\/article-image\/([^/]+)$/);
  if (articleImgMatch && (method === 'GET' || method === 'HEAD')) {
    const articleId = decodeURIComponent(articleImgMatch[1]).trim();
    return handleEntityOgImage('article', articleId, request, env);
  }

  const eventImgMatch = pathname.match(/^\/api\/event-image\/([^/]+)$/);
  if (eventImgMatch && (method === 'GET' || method === 'HEAD')) {
    const eventId = decodeURIComponent(eventImgMatch[1]).trim();
    return handleEntityOgImage('event', eventId, request, env);
  }

  const adImgMatch = pathname.match(/^\/api\/ad-image\/([^/]+)$/);
  if (adImgMatch && (method === 'GET' || method === 'HEAD')) {
    return handleEntityOgImage('default', '', request, env);
  }

  const driveMatch = pathname.match(/^\/api\/media\/drive\/([^/]+)$/);
  if (driveMatch && (method === 'GET' || method === 'HEAD')) {
    const fileId = decodeURIComponent(driveMatch[1]).trim();
    if (!/^[a-zA-Z0-9_-]{10,120}$/.test(fileId)) {
      return new Response(null, { status: 400 });
    }
    const sizeVariant = url.searchParams.get('size') === 'thumb' ? 'thumb' : 'full';
    const resp = await fetchDriveImageResponse(fileId, sizeVariant);
    if (!resp) return new Response(null, { status: 404 });
    return method === 'HEAD'
      ? new Response(null, { status: 200, headers: resp.headers })
      : resp;
  }

  // 3. Public News & Events (Google Sheets / Apps Script direct)
  if (pathname === '/api/storage/news' && method === 'GET') {
    if (!appsScriptCfg.configured) {
      return jsonResponse(
        {
          ok: false,
          configured: false,
          error:
            'APPS_SCRIPT_WEBAPP_URL and APPS_SCRIPT_API_SECRET are not configured on Cloudflare Pages yet.',
        },
        503
      );
    }
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 15));
    const category = (url.searchParams.get('category') || '').trim();
    const location = (url.searchParams.get('location') || '').trim();
    const q = (url.searchParams.get('q') || '').trim();
    const featured = url.searchParams.get('featured') === 'true';
    const force = url.searchParams.get('refresh') === '1';

    try {
      const data = await fetchAppsScriptNewsWithEdgeCache(
        env,
        { page, limit, category, location, q, featured },
        force
      );
      const nowMs = Date.now();
      let items = (data.items || []).map((it) => sanitizeSheetsNewsItem(it, nowMs));
      if (featured) {
        items = items.filter((it) => it.featured);
      }
      items.sort((a, b) => {
        const featDiff = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
        if (featDiff !== 0) return featDiff;
        return (Number(b.publishedTimestamp) || 0) - (Number(a.publishedTimestamp) || 0);
      });
      return jsonResponse({
        ...data,
        items,
      });
    } catch (err) {
      return jsonErrorResponse(
        502,
        err instanceof Error ? err.message : 'Unable to load news from Google Sheets.'
      );
    }
  }

  const newsByIdMatch = pathname.match(/^\/api\/storage\/news\/([^/]+)$/);
  if (newsByIdMatch && method === 'GET') {
    if (!appsScriptCfg.configured) {
      return jsonResponse(
        { ok: false, configured: false, error: 'Google Sheets backend not configured yet.' },
        503
      );
    }
    const newsId = decodeURIComponent(newsByIdMatch[1]).trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(newsId)) {
      return jsonErrorResponse(400, 'Invalid newsId.');
    }
    try {
      const res = await callAppsScriptGet<{ ok?: boolean; item?: SheetsNewsItem }>(
        env,
        'getNewsById',
        { newsId }
      );
      if (!res?.ok || !res.item) {
        return jsonErrorResponse(404, 'Article not found.');
      }
      return jsonResponse({
        ok: true,
        item: sanitizeSheetsNewsItem(res.item, Date.now()),
        fromCache: false,
      });
    } catch (err) {
      return jsonErrorResponse(
        502,
        err instanceof Error ? err.message : 'Failed to load article.'
      );
    }
  }

  if (pathname === '/api/storage/events' && method === 'GET') {
    if (!appsScriptCfg.configured) {
      return jsonResponse(
        { ok: false, configured: false, error: 'Google Sheets backend not configured yet.' },
        503
      );
    }
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    try {
      const res = await callAppsScriptGet<{
        ok?: boolean;
        items?: SheetsEventItem[];
        total?: number;
        page?: number;
        limit?: number;
        hasMore?: boolean;
        error?: string;
      }>(env, 'getEvents', { page, limit });
      if (!res?.ok) {
        return jsonErrorResponse(502, res?.error || 'Failed to load events.');
      }
      return jsonResponse({
        ...res,
        items: (res.items || []).map(sanitizeSheetsEventItem),
        fromCache: false,
      });
    } catch (err) {
      return jsonErrorResponse(
        502,
        err instanceof Error ? err.message : 'Failed to load events.'
      );
    }
  }

  const eventByIdMatch = pathname.match(/^\/api\/storage\/events\/([^/]+)$/);
  if (eventByIdMatch && method === 'GET') {
    if (!appsScriptCfg.configured) {
      return jsonResponse(
        { ok: false, configured: false, error: 'Google Sheets backend not configured yet.' },
        503
      );
    }
    const eventId = decodeURIComponent(eventByIdMatch[1]).trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(eventId)) {
      return jsonErrorResponse(400, 'Invalid eventId.');
    }
    try {
      const res = await callAppsScriptGet<{ ok?: boolean; item?: SheetsEventItem }>(
        env,
        'getEventById',
        { eventId }
      );
      if (!res?.ok || !res.item) {
        return jsonErrorResponse(404, 'Event not found.');
      }
      return jsonResponse({
        ok: true,
        item: sanitizeSheetsEventItem(res.item),
      });
    } catch (err) {
      return jsonErrorResponse(
        502,
        err instanceof Error ? err.message : 'Failed to load event.'
      );
    }
  }

  // 4. Public Views
  const articleViewMatch = pathname.match(/^\/api\/articles\/([^/]+)\/view$/);
  if ((pathname === '/api/storage/views' || articleViewMatch) && method === 'POST') {
    const body = await readJsonBody(request);
    const entityType = body.type === 'event' ? 'event' : 'article';
    const rawId = articleViewMatch
      ? decodeURIComponent(articleViewMatch[1])
      : typeof body.id === 'string'
      ? body.id
      : '';
    const id = rawId.trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      return jsonErrorResponse(400, 'Invalid or missing id');
    }
    const baselineRaw = Number(body.baselineViews);
    const prevTracked = entityType === 'article' ? Number(cfLiveArticleViewsMap[id]) || 0 : 0;
    const baseViews = Math.max(
      prevTracked,
      Number.isFinite(baselineRaw) && baselineRaw >= 0 ? Math.floor(baselineRaw) : 0
    );
    const views = baseViews + 1;
    if (entityType === 'article') {
      cfLiveArticleViewsMap[id] = views;
    }

    if (appsScriptCfg.configured) {
      const flushTask = callAppsScriptPost(
        env,
        'batchUpdateViews',
        entityType === 'event' ? { newsViews: {}, eventViews: { [id]: 1 } } : { newsViews: { [id]: 1 }, eventViews: {} }
      ).catch(() => undefined);
      if (typeof waitUntil === 'function') {
        waitUntil(flushTask);
      }
    }

    return jsonResponse({
      ok: true,
      aggregated: true,
      type: entityType,
      id,
      views,
      lastViewedAt: new Date().toISOString(),
    });
  }

  if (pathname === '/api/articles/views' && method === 'GET') {
    const viewsById: Record<string, number> = { ...cfLiveArticleViewsMap };
    if (!appsScriptCfg.configured) {
      return jsonResponse({ ok: true, viewsById });
    }
    try {
      const news = await fetchAllPublishedNewsDirect(env, false);
      for (const item of news) {
        const sheetViews = Number(item.views) || 0;
        viewsById[item.newsId] = Math.max(viewsById[item.newsId] || 0, sheetViews);
      }
      return jsonResponse({ ok: true, viewsById });
    } catch {
      return jsonResponse({ ok: true, viewsById });
    }
  }

  // 5. Public Local Ads Safe Standalone Endpoints
  if (pathname === '/api/ads' && method === 'GET') {
    await ensureCfAdsStoreHydrated();
    const todayYmd = new Date().toISOString().slice(0, 10);
    const activeAds = cfAdsList
      .map((ad) => ({
        ...ad,
        effectiveStatus: computeCfEffectiveStatus(ad, todayYmd),
        ctrPct: ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 1000) / 10 : 0,
      }))
      .filter((ad) => ad.effectiveStatus === 'active' && ad.approvalStatus === 'approved');
    return jsonResponse({
      ok: true,
      ads: activeAds,
      items: activeAds,
      settings: cfAdSettings,
      todayYmd,
      total: activeAds.length,
    });
  }

  const adTrackMatch = pathname.match(/^\/api\/ads\/([^/]+)\/track$/);
  if (adTrackMatch && method === 'POST') {
    await ensureCfAdsStoreHydrated();
    const idOrNum = decodeURIComponent(adTrackMatch[1]).trim();
    const body = await readJsonBody(request);
    const ad = cfAdsList.find(
      (a) => a.id === idOrNum || a.adNumber.toLowerCase() === idOrNum.toLowerCase()
    );
    if (ad) {
      if (body.eventType === 'impression') {
        ad.impressions = (ad.impressions || 0) + 1;
        ad.uniqueImpressions = (ad.uniqueImpressions || 0) + 1;
      } else {
        ad.clicks = (ad.clicks || 0) + 1;
      }
      await persistCfAdsStore();
    }
    return jsonResponse({ ok: true, tracked: Boolean(ad) });
  }

  if (pathname.startsWith('/api/ads/') && method === 'GET') {
    await ensureCfAdsStoreHydrated();
    const idOrNum = decodeURIComponent(pathname.slice('/api/ads/'.length)).trim();
    const todayYmd = new Date().toISOString().slice(0, 10);
    const ad = cfAdsList.find(
      (a) => a.id === idOrNum || a.adNumber.toLowerCase() === idOrNum.toLowerCase()
    );
    if (!ad) {
      return jsonErrorResponse(404, 'Advertisement not found.');
    }
    return jsonResponse({
      ok: true,
      ad: {
        ...ad,
        effectiveStatus: computeCfEffectiveStatus(ad, todayYmd),
        ctrPct: ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 1000) / 10 : 0,
      },
      settings: cfAdSettings,
    });
  }

  const feedbackGetMatch = pathname.match(/^\/api\/public\/article-feedback\/([^/]+)$/);
  if (feedbackGetMatch && method === 'GET') {
    const articleId = decodeURIComponent(feedbackGetMatch[1]).trim();
    return jsonResponse({
      ok: true,
      articleId,
      counts: { helpful: 0, informative: 0, correction: 0, lastUpdatedAt: '' },
    });
  }
  if (pathname === '/api/public/article-feedback' && method === 'POST') {
    const body = await readJsonBody(request);
    const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : '';
    const feedbackType =
      body.type === 'helpful' || body.type === 'informative' || body.type === 'correction'
        ? body.type
        : 'helpful';
    const counts = {
      helpful: feedbackType === 'helpful' ? 1 : 0,
      informative: feedbackType === 'informative' ? 1 : 0,
      correction: feedbackType === 'correction' ? 1 : 0,
      lastUpdatedAt: new Date().toISOString(),
    };
    return jsonResponse({ ok: true, articleId, counts });
  }
  if (
    (pathname === '/api/public/newsletter/subscribe' ||
      pathname === '/api/public/newsletter/unsubscribe') &&
    method === 'POST'
  ) {
    return jsonResponse({ ok: true });
  }

  // ============================================================================
  // 6. ADMIN 2.0 AUTHENTICATION ENDPOINTS
  // ============================================================================

  if (pathname === '/api/admin2/auth/remembered' && method === 'GET') {
    const cookies = parseCookies(request);
    const cookieTok = cookies[REMEMBERED_COOKIE_NAME] || '';
    const verified = cookieTok ? await verifyCfToken(cookieTok, env) : null;
    if (!verified || !isAuthorizedEmail(verified.email, env)) {
      return jsonResponse({ ok: true, remembered: false });
    }
    return jsonResponse({
      ok: true,
      remembered: true,
      email: verified.email,
      fullName: verified.fullName,
      authProvider: 'firebase',
    });
  }

  if (pathname === '/api/admin2/auth/forget-device' && method === 'POST') {
    return jsonResponse(
      { ok: true },
      200,
      { 'set-cookie': buildClearRememberedSetCookie() }
    );
  }

  if (pathname === '/api/admin2/auth/login-remembered' && method === 'POST') {
    const cookies = parseCookies(request);
    const cookieTok = cookies[REMEMBERED_COOKIE_NAME] || '';
    const verified = cookieTok ? await verifyCfToken(cookieTok, env) : null;
    if (!verified || !isAuthorizedEmail(verified.email, env)) {
      return jsonResponse(
        {
          ok: false,
          error: 'Saved device login has expired or was revoked. Please sign in with Google.',
        },
        401,
        { 'set-cookie': buildClearRememberedSetCookie() }
      );
    }

    const body = await readJsonBody(request);
    const requestedEmail = String(body.email || '').trim().toLowerCase();
    if (requestedEmail && verified.email.toLowerCase() !== requestedEmail) {
      return jsonErrorResponse(
        401,
        'Saved login belongs to a different account. Sign in with Google to switch accounts.'
      );
    }

    const sessionPayload: CfSessionPayload = {
      ...verified,
      sid: `cf-${crypto.randomUUID()}`,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    };
    const token = await signCfToken(sessionPayload, env);
    const remPayload: CfSessionPayload = {
      ...sessionPayload,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    const remToken = await signCfToken(remPayload, env);

    return jsonResponse(
      {
        ok: true,
        token,
        user: {
          id: sessionPayload.id,
          email: sessionPayload.email,
          fullName: sessionPayload.fullName,
          role: sessionPayload.role,
          permissions: sessionPayload.permissions,
          protectedSuperAdmin: sessionPayload.protectedSuperAdmin,
          authProvider: 'firebase',
          sessionId: sessionPayload.sid,
        },
      },
      200,
      { 'set-cookie': buildRememberedSetCookie(remToken, 30 * 24 * 60 * 60) }
    );
  }

  if (pathname === '/api/admin2/auth/firebase-exchange' && method === 'POST') {
    const body = await readJsonBody(request);
    const authHeader = request.headers.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const idToken = String(body.idToken || bearer || '').trim();
    const rememberMe = Boolean(body.rememberMe);

    if (!idToken || idToken.startsWith('cn2.') || idToken.startsWith('cn2cf.')) {
      return jsonErrorResponse(400, 'Valid Firebase authentication token is required.');
    }

    const fb = await verifyFirebaseTokenRaw(idToken, env);
    if (!fb || !fb.emailVerified) {
      return jsonErrorResponse(401, 'Invalid or unverified Google/Firebase sign-in.');
    }

    if (!isAuthorizedEmail(fb.email, env)) {
      return jsonErrorResponse(
        403,
        `Signed in as ${fb.email}, which does not have administrator permissions for CoffeeNadu News.`
      );
    }

    const owner = OWNER_ADMIN_EMAILS.has(fb.email);
    const role: 'super_admin' | 'admin' = owner ? 'super_admin' : 'admin';
    const permissions = owner
      ? [...ROLE_DEFAULT_PERMISSIONS.super_admin]
      : [...ROLE_DEFAULT_PERMISSIONS.admin];
    const sid = `cf-${crypto.randomUUID()}`;

    const sessionPayload: CfSessionPayload = {
      id: fb.uid,
      email: fb.email,
      fullName: fb.displayName || fb.email,
      role,
      permissions,
      protectedSuperAdmin: owner,
      authProvider: 'firebase',
      sid,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    };

    const token = await signCfToken(sessionPayload, env);
    const headers: Record<string, string> = {};
    if (rememberMe) {
      const remToken = await signCfToken(
        { ...sessionPayload, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 },
        env
      );
      headers['set-cookie'] = buildRememberedSetCookie(remToken, 30 * 24 * 60 * 60);
    } else {
      headers['set-cookie'] = buildClearRememberedSetCookie();
    }

    return jsonResponse(
      {
        ok: true,
        token,
        user: {
          id: sessionPayload.id,
          email: sessionPayload.email,
          fullName: sessionPayload.fullName,
          role: sessionPayload.role,
          permissions: sessionPayload.permissions,
          protectedSuperAdmin: sessionPayload.protectedSuperAdmin,
          authProvider: 'firebase',
          sessionId: sessionPayload.sid,
        },
      },
      200,
      headers
    );
  }

  if (pathname === '/api/admin2/auth/login' && method === 'POST') {
    return jsonErrorResponse(
      400,
      'Email/password Admin 2.0 accounts require BACKEND_ORIGIN Express server. Please use "Continue with Google" to sign in.'
    );
  }

  if (
    (pathname === '/api/admin2/auth/activate' || pathname === '/api/admin2/auth/reset-password') &&
    method === 'POST'
  ) {
    return jsonErrorResponse(
      400,
      'Password account activation/reset requires BACKEND_ORIGIN. Please sign in with Google.'
    );
  }

  const resolveEffectiveCfEnv = (): PagesEnv | undefined => {
    const cfg = getAppsScriptConfig(env);
    return cfg.configured
      ? {
          ...env,
          APPS_SCRIPT_WEBAPP_URL: cfg.webAppUrl,
          APPS_SCRIPT_API_SECRET: cfg.apiSecret,
        }
      : env;
  };

  if (pathname.startsWith('/api/platform/')) {
    const platformResp = await handleCfPublicPlatformRoute(request, url);
    if (platformResp) return platformResp;
  }

  if (pathname.startsWith('/api/community/')) {
    const communityResp = await handleCfCommunityApi(
      request,
      url,
      async () => ({ ok: false }),
      resolveEffectiveCfEnv()
    );
    if (communityResp) return communityResp;
  }

  if (pathname.startsWith('/api/public/contest/')) {
    const contestResp = await handleCfContestApi(
      request,
      url,
      async () => ({ ok: false }),
      resolveEffectiveCfEnv()
    );
    if (contestResp) return contestResp;
  }

  // ============================================================================
  // 7. PROTECTED ADMIN ROUTES (/api/storage/admin/* and /api/admin2/*)
  // ============================================================================

  if (pathname.startsWith('/api/storage/admin/') || pathname.startsWith('/api/admin2/')) {
    const authResult = await authenticateAdminRequest(request, env);
    if ('errorResponse' in authResult) {
      return authResult.errorResponse;
    }
    const admin = authResult.admin;

    // Allow verified admin requests to supply X-Apps-Script-Url and X-Apps-Script-Secret headers
    const hdrAppsScriptUrl = (request.headers.get('x-apps-script-url') || '').trim();
    const hdrAppsScriptSecret = (request.headers.get('x-apps-script-secret') || '').trim();
    if (isValidAppsScriptExecUrl(hdrAppsScriptUrl) && hdrAppsScriptSecret.length >= 12) {
      cfRuntimeAppsScriptUrl = hdrAppsScriptUrl;
      cfRuntimeAppsScriptSecret = hdrAppsScriptSecret;
    }
    const activeAppsScriptCfg = getAppsScriptConfig(env);
    appsScriptCfg = activeAppsScriptCfg;

    if (pathname.startsWith('/api/admin2/platform/')) {
      const adminPlatformResp = await handleCfAdminPlatformRoute(request, url, admin.email);
      if (adminPlatformResp) return adminPlatformResp;
    }

    if (pathname.startsWith('/api/admin2/community/')) {
      const adminCommunityResp = await handleCfCommunityApi(
        request,
        url,
        async () => ({
          ok: true,
          email: admin.email,
        }),
        resolveEffectiveCfEnv()
      );
      if (adminCommunityResp) return adminCommunityResp;
    }

    if (pathname.startsWith('/api/admin2/contest/')) {
      const adminContestResp = await handleCfContestApi(
        request,
        url,
        async () => ({
          ok: true,
          email: admin.email,
        }),
        resolveEffectiveCfEnv()
      );
      if (adminContestResp) return adminContestResp;
    }

    if (pathname === '/api/admin2/auth/me' && method === 'GET') {
      return jsonResponse({ ok: true, user: admin });
    }

    if (pathname === '/api/admin2/auth/logout' && method === 'POST') {
      return jsonResponse({ ok: true, revoked: true });
    }

    // ---- Storage Admin Routes ----

    if (pathname === '/api/storage/admin/health' && method === 'GET') {
      const baseQuota = {
        dayKey: new Date().toISOString().slice(0, 10),
        appsScriptCallsToday: 0,
        cacheHitsToday: 0,
        cacheMissesToday: 0,
        batchedViewFlushesToday: 0,
        totalViewsAggregatedToday: 0,
        driveProxyFetchesToday: 0,
        driveProxyCacheHitsToday: 0,
        pendingViewsCount: 0,
        cachedDriveImagesCount: 0,
        cacheHitRatePct: 100,
        dailyFreeLimitCalls: 20000,
        lastAppsScriptSuccessAt: null as string | null,
        lastError: null as string | null,
        lastFlushAt: null as string | null,
      };

      if (!activeAppsScriptCfg.configured) {
        return jsonResponse({
          ok: true,
          configured: false,
          status: 'not_configured',
          message:
            'Paste your Apps Script Web App URL and API Secret below (or add APPS_SCRIPT_WEBAPP_URL and APPS_SCRIPT_API_SECRET in Cloudflare Pages Environment Variables) to activate Google Sheets & Drive backups.',
          quota: baseQuota,
        });
      }

      try {
        const stats = await callAppsScriptPost<Record<string, unknown>>(
          env,
          'getAdminStats',
          {},
          admin.email
        );
        return jsonResponse({
          ...stats,
          ok: stats?.ok !== false,
          configured: true,
          quota: {
            ...baseQuota,
            lastAppsScriptSuccessAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to reach Apps Script Web App.';
        return jsonResponse(
          {
            ok: false,
            configured: true,
            status: 'error',
            error: msg,
            quota: {
              ...baseQuota,
              lastError: msg,
            },
          },
          502
        );
      }
    }

    if (pathname === '/api/storage/admin/configure' && method === 'POST') {
      const body = await readJsonBody(request);
      const webAppUrl = typeof body.webAppUrl === 'string' ? body.webAppUrl.trim() : '';
      const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim() : '';

      if (!isValidAppsScriptExecUrl(webAppUrl)) {
        return jsonErrorResponse(
          400,
          'Valid Apps Script Web App URL (https://script.google.com/macros/s/.../exec) is required.'
        );
      }
      if (apiSecret.length < 12) {
        return jsonErrorResponse(400, 'Apps Script API Secret must be at least 12 characters.');
      }

      cfRuntimeAppsScriptUrl = webAppUrl;
      cfRuntimeAppsScriptSecret = apiSecret;
      await invalidateEdgeReadCaches();

      const baseQuota = {
        dayKey: new Date().toISOString().slice(0, 10),
        appsScriptCallsToday: 1,
        cacheHitsToday: 0,
        cacheMissesToday: 0,
        batchedViewFlushesToday: 0,
        totalViewsAggregatedToday: 0,
        driveProxyFetchesToday: 0,
        driveProxyCacheHitsToday: 0,
        pendingViewsCount: 0,
        cachedDriveImagesCount: 0,
        cacheHitRatePct: 100,
        dailyFreeLimitCalls: 20000,
        lastAppsScriptSuccessAt: new Date().toISOString(),
        lastError: null as string | null,
        lastFlushAt: null as string | null,
      };

      try {
        const stats = await callAppsScriptPost<Record<string, unknown>>(
          env,
          'getAdminStats',
          {},
          admin.email
        );
        return jsonResponse({
          ...stats,
          ok: stats?.ok !== false,
          configured: true,
          quota: baseQuota,
        });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to reach Apps Script Web App with supplied credentials.';
        return jsonResponse(
          {
            ok: false,
            configured: true,
            status: 'error',
            error: msg,
            quota: {
              ...baseQuota,
              lastError: msg,
            },
          },
          502
        );
      }
    }

    if (pathname === '/api/storage/admin/news' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const rawBody = await readJsonBody(request);
      const body: Record<string, unknown> = { ...rawBody };

      const rawCustomSlug =
        typeof body.newsId === 'string' && body.newsId.trim()
          ? body.newsId.trim()
          : typeof body.customSlug === 'string' && body.customSlug.trim()
          ? body.customSlug.trim()
          : '';
      if (rawCustomSlug) {
        const validation = validateCustomEnglishSlugInput(rawCustomSlug);
        if (validation.error || !validation.slug) {
          return jsonErrorResponse(400, validation.error || 'Invalid custom English URL.');
        }
        try {
          const existing = await callAppsScriptGet<{ ok?: boolean; item?: SheetsNewsItem }>(
            env,
            'getNewsById',
            { newsId: validation.slug }
          );
          if (existing?.ok && existing.item) {
            return jsonErrorResponse(
              409,
              `The custom English URL "${validation.slug}" is already used by another article.`
            );
          }
        } catch {
          // Ignore lookup error and continue
        }
        body.newsId = validation.slug;
        body.isCustomSlug = true;
      }

      const desiredFeatured = parseSheetBoolean(
        body.featured !== undefined ? body.featured : body.isFeatured
      );
      const desiredFeaturedUntil = desiredFeatured
        ? normalizeFeaturedUntil(body.featuredUntil)
        : undefined;
      body.featured = desiredFeatured;
      body.isFeatured = desiredFeatured;
      body.featuredUntil = desiredFeaturedUntil ?? '';
      body.tags = serializeLeadMetaToTags(typeof body.tags === 'string' ? body.tags : '', {
        isFeatured: desiredFeatured,
        featuredUntil: desiredFeaturedUntil,
      });

      if (Array.isArray(body.fullContent)) {
        const cleanExtras = sanitizeExtraPhotos(body.extraImages);
        body.fullContent = packBodyWithExtraPhotos(
          body.fullContent.filter((p: unknown): p is string => typeof p === 'string'),
          cleanExtras
        );
        body.extraImages = cleanExtras;
      }

      try {
        const result = await callAppsScriptPost<{
          ok?: boolean;
          newsId?: string;
          item?: SheetsNewsItem;
          deduplicated?: boolean;
          error?: string;
        }>(env, 'createNews', { data: body }, admin.email);

        if (!result?.ok) {
          return jsonErrorResponse(400, result?.error || 'Create news failed.');
        }
        if (body.isCustomSlug && result.deduplicated) {
          return jsonErrorResponse(
            409,
            `The custom English URL "${String(body.newsId)}" is already used by another article.`
          );
        }
        await invalidateEdgeReadCaches(result.newsId || result.item?.newsId);
        return jsonResponse(
          {
            ...result,
            item: result.item ? sanitizeSheetsNewsItem(result.item, Date.now()) : undefined,
          },
          201
        );
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Create news failed.');
      }
    }

    const adminNewsLeadMatch = pathname.match(/^\/api\/storage\/admin\/news\/([^/]+)\/lead$/);
    if (adminNewsLeadMatch && method === 'PATCH') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const cleanNewsId = decodeURIComponent(adminNewsLeadMatch[1]).trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanNewsId)) {
        return jsonErrorResponse(400, 'Invalid newsId.');
      }
      const body = await readJsonBody(request);
      const desiredFeatured = parseSheetBoolean(
        body.featured !== undefined ? body.featured : body.isFeatured
      );
      const desiredFeaturedUntil = desiredFeatured
        ? normalizeFeaturedUntil(body.featuredUntil)
        : undefined;
      const serializedTags = serializeLeadMetaToTags(typeof body.tags === 'string' ? body.tags : '', {
        isFeatured: desiredFeatured,
        featuredUntil: desiredFeaturedUntil,
      });

      try {
        const result = await callAppsScriptPost<{
          ok?: boolean;
          item?: SheetsNewsItem;
          error?: string;
        }>(
          env,
          'updateNews',
          {
            newsId: cleanNewsId,
            data: {
              featured: desiredFeatured,
              isFeatured: desiredFeatured,
              featuredUntil: desiredFeaturedUntil ?? '',
              tags: serializedTags,
            },
          },
          admin.email
        );
        if (!result?.ok) {
          return jsonErrorResponse(400, result?.error || 'Unable to update Lead Story state.');
        }
        await invalidateEdgeReadCaches(cleanNewsId);
        return jsonResponse({
          ok: true,
          newsId: cleanNewsId,
          featured: desiredFeatured,
          featuredUntil: desiredFeaturedUntil,
          tags: serializedTags,
          item: result.item ? sanitizeSheetsNewsItem(result.item, Date.now()) : undefined,
        });
      } catch (err) {
        return jsonErrorResponse(
          502,
          err instanceof Error ? err.message : 'Unable to update Lead Story state.'
        );
      }
    }

    const adminNewsIdMatch = pathname.match(/^\/api\/storage\/admin\/news\/([^/]+)$/);
    if (adminNewsIdMatch && method === 'PUT') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const cleanNewsId = decodeURIComponent(adminNewsIdMatch[1]).trim();
      const body = { ...(await readJsonBody(request)) };
      if (
        typeof body.imageUrl === 'string' &&
        body.imageUrl.startsWith('data:image/') &&
        body.imageUrl.length > 45000 &&
        typeof body.imageDriveId === 'string' &&
        body.imageDriveId.trim()
      ) {
        body.imageUrl = `/api/media/drive/${encodeURIComponent(body.imageDriveId.trim())}`;
      }
      if (
        body.featured !== undefined ||
        body.isFeatured !== undefined ||
        body.featuredUntil !== undefined
      ) {
        const desiredFeatured = parseSheetBoolean(
          body.featured !== undefined ? body.featured : body.isFeatured
        );
        const desiredFeaturedUntil = desiredFeatured
          ? normalizeFeaturedUntil(body.featuredUntil)
          : undefined;
        body.featured = desiredFeatured;
        body.isFeatured = desiredFeatured;
        body.featuredUntil = desiredFeaturedUntil ?? '';
        body.tags = serializeLeadMetaToTags(typeof body.tags === 'string' ? body.tags : '', {
          isFeatured: desiredFeatured,
          featuredUntil: desiredFeaturedUntil,
        });
      }
      if (Array.isArray(body.fullContent)) {
        const cleanExtras = sanitizeExtraPhotos(body.extraImages);
        body.fullContent = packBodyWithExtraPhotos(
          body.fullContent.filter((p: unknown): p is string => typeof p === 'string'),
          cleanExtras
        );
        body.extraImages = cleanExtras;
      }

      try {
        const result = await callAppsScriptPost<{
          ok?: boolean;
          item?: SheetsNewsItem;
          error?: string;
        }>(env, 'updateNews', { newsId: cleanNewsId, data: body }, admin.email);
        if (!result?.ok) {
          return jsonErrorResponse(400, result?.error || 'Update news failed.');
        }
        await invalidateEdgeReadCaches(cleanNewsId);
        return jsonResponse({
          ...result,
          item: result.item ? sanitizeSheetsNewsItem(result.item, Date.now()) : undefined,
        });
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Update news failed.');
      }
    }

    if (adminNewsIdMatch && method === 'DELETE') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const cleanNewsId = decodeURIComponent(adminNewsIdMatch[1]).trim();
      try {
        const result = await callAppsScriptPost(
          env,
          'deleteNews',
          { newsId: cleanNewsId, permanent: url.searchParams.get('permanent') === '1' },
          admin.email
        );
        await invalidateEdgeReadCaches(cleanNewsId);
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Delete news failed.');
      }
    }

    if (pathname === '/api/storage/admin/events' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const body = await readJsonBody(request);
      try {
        const result = await callAppsScriptPost(env, 'createEvent', { data: body }, admin.email);
        await invalidateEdgeReadCaches();
        return jsonResponse(result, 201);
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Create event failed.');
      }
    }

    const adminEventIdMatch = pathname.match(/^\/api\/storage\/admin\/events\/([^/]+)$/);
    if (adminEventIdMatch && method === 'PUT') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const eventId = decodeURIComponent(adminEventIdMatch[1]).trim();
      const body = await readJsonBody(request);
      try {
        const result = await callAppsScriptPost(
          env,
          'updateEvent',
          { eventId, data: body },
          admin.email
        );
        await invalidateEdgeReadCaches();
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Update event failed.');
      }
    }

    if (adminEventIdMatch && method === 'DELETE') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const eventId = decodeURIComponent(adminEventIdMatch[1]).trim();
      try {
        const result = await callAppsScriptPost(env, 'deleteEvent', { eventId }, admin.email);
        await invalidateEdgeReadCaches();
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Delete event failed.');
      }
    }

    if (pathname === '/api/storage/admin/upload-image' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const body = await readJsonBody(request);
      try {
        const uploaded = await callAppsScriptPost<{
          ok: boolean;
          fileId?: string;
          thumbFileId?: string;
          deduplicated?: boolean;
          error?: string;
        }>(
          env,
          'uploadImage',
          {
            base64Data: body.base64Data,
            thumbBase64: body.thumbBase64,
            mimeType: body.mimeType || 'image/jpeg',
            fileName: body.fileName || `coffeenadu-${Date.now()}.jpg`,
          },
          admin.email
        );
        if (!uploaded.ok || !uploaded.fileId) {
          return jsonErrorResponse(502, uploaded.error || 'Drive image upload failed.');
        }
        const resolvedThumbId = uploaded.thumbFileId || uploaded.fileId;
        return jsonResponse(
          {
            ok: true,
            fileId: uploaded.fileId,
            thumbFileId: resolvedThumbId,
            imageUrl: `/api/media/drive/${encodeURIComponent(uploaded.fileId)}`,
            imageThumbUrl: `/api/media/drive/${encodeURIComponent(resolvedThumbId)}`,
            driveUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(uploaded.fileId)}&sz=w1600`,
            driveViewUrl: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(uploaded.fileId)}`,
            deduplicated: Boolean(uploaded.deduplicated),
          },
          201
        );
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Image upload failed.');
      }
    }

    if (pathname === '/api/storage/admin/flush-views' && method === 'POST') {
      return jsonResponse({ ok: true, flushed: false, count: 0 });
    }

    if (pathname === '/api/storage/admin/backup-now' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      try {
        const result = await callAppsScriptPost(env, 'createBackup', {}, admin.email);
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Backup failed.');
      }
    }

    if (pathname === '/api/storage/admin/backups' && method === 'GET') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      try {
        const result = await callAppsScriptPost(env, 'listBackups', {}, admin.email);
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(
          502,
          err instanceof Error ? err.message : 'Unable to list backups.'
        );
      }
    }

    if (pathname === '/api/storage/admin/backups/preview' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const body = await readJsonBody(request);
      try {
        const result = await callAppsScriptPost(
          env,
          'previewBackup',
          { fileId: body.fileId },
          admin.email
        );
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(
          502,
          err instanceof Error ? err.message : 'Unable to preview backup.'
        );
      }
    }

    if (pathname === '/api/storage/admin/backups/restore' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const body = await readJsonBody(request);
      try {
        const result = await callAppsScriptPost(
          env,
          'restoreBackup',
          {
            fileId: body.fileId,
            mode: body.mode || 'deleted_only',
            selectedIds: Array.isArray(body.selectedIds) ? body.selectedIds : [],
          },
          admin.email
        );
        await invalidateEdgeReadCaches();
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Restore failed.');
      }
    }

    if (pathname === '/api/storage/admin/export' && method === 'GET') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      try {
        const result = await callAppsScriptPost(env, 'exportAll', {}, admin.email);
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Export failed.');
      }
    }

    if (pathname === '/api/storage/admin/migrate-batch' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const body = await readJsonBody(request);
      try {
        const result = await callAppsScriptPost(
          env,
          'migrateBatch',
          {
            articles: Array.isArray(body.articles) ? body.articles : [],
            events: Array.isArray(body.events) ? body.events : [],
            categories: Array.isArray(body.categories) ? body.categories : [],
          },
          admin.email
        );
        await invalidateEdgeReadCaches();
        return jsonResponse(result);
      } catch (err) {
        return jsonErrorResponse(
          502,
          err instanceof Error ? err.message : 'Migration batch failed.'
        );
      }
    }

    if (pathname === '/api/storage/admin/verify-migration' && method === 'POST') {
      if (!appsScriptCfg.configured) {
        return jsonErrorResponse(503, 'Google Apps Script is not configured on Cloudflare Pages.');
      }
      const body = await readJsonBody(request);
      try {
        const raw = await callAppsScriptPost<Record<string, unknown>>(
          env,
          'verifyMigration',
          {
            expectedNews: Array.isArray(body.expectedNews) ? body.expectedNews : [],
            expectedEvents: Array.isArray(body.expectedEvents) ? body.expectedEvents : [],
            exportComplete: Boolean(body.exportComplete),
          },
          admin.email
        );
        return jsonResponse(raw);
      } catch (err) {
        return jsonErrorResponse(
          502,
          err instanceof Error ? err.message : 'Migration verification failed.'
        );
      }
    }

    if (pathname === '/api/storage/admin/apps-script-source' && method === 'GET') {
      return jsonErrorResponse(
        404,
        'apps-script/Code.gs source file is stored in your project repository.'
      );
    }

    // ---- Admin 2.0 Dashboard & Control Center Routes ----

    if (pathname === '/api/admin2/dashboard' && method === 'GET') {
      try {
        const [news, eventsRes, stats] = await Promise.all([
          appsScriptCfg.configured
            ? fetchAllPublishedNewsDirect(env, false)
            : Promise.resolve([] as SheetsNewsItem[]),
          appsScriptCfg.configured
            ? callAppsScriptGet<{ ok?: boolean; items?: SheetsEventItem[] }>(env, 'getEvents', {
                page: 1,
                limit: 100,
              }).catch(() => ({ ok: false, items: [] as SheetsEventItem[] }))
            : Promise.resolve({ ok: false, items: [] as SheetsEventItem[] }),
          appsScriptCfg.configured
            ? callAppsScriptPost<Record<string, unknown>>(env, 'getAdminStats', {}, admin.email).catch(
                () => null
              )
            : Promise.resolve(null),
        ]);

        const events = Array.isArray(eventsRes?.items) ? eventsRes.items : [];
        const analytics = buildAnalyticsFromNews(news, 14);
        const recentLogs = Array.isArray(stats?.recentLogs)
          ? (stats.recentLogs as Array<{
              logId?: string;
              timestamp?: string;
              action?: string;
              entityType?: string;
              entityId?: string;
              adminEmail?: string;
              details?: string;
            }>)
          : [];

        const recentActivity = recentLogs.slice(0, 10).map((l, idx) => ({
          id: l.logId || `log-${idx}`,
          timestamp: l.timestamp || new Date().toISOString(),
          actorEmail: l.adminEmail || admin.email,
          actorRole: 'super_admin',
          action: l.action || 'SYNC',
          targetType: l.entityType || 'news',
          targetId: l.entityId || '',
          details: l.details || '',
          severity: 'info',
        }));

        return jsonResponse({
          ok: true,
          articles: {
            total: news.length,
            published: news.length,
            drafts: 0,
            scheduled: 0,
            archived: 0,
            eventsCount: events.length,
          },
          traffic: {
            todayVisitors: 0,
            todayPageViews: 0,
            totalPageViews14d: 0,
            totalSheetViews: analytics.totals.totalSheetArticleViews,
            dailySeries: analytics.dailySeries,
          },
          popularArticles: analytics.topArticles.slice(0, 6),
          recentlyViewedArticles: analytics.recentlyViewedArticles.slice(0, 8),
          recentActivity,
          recentNotifications: [],
          unreadNotifications: 0,
          systemStatus: {
            sheetsConnected: appsScriptCfg.configured,
            appsScriptStatus: appsScriptCfg.configured
              ? stats?.ok !== false
                ? 'connected'
                : 'degraded'
              : 'not_configured',
            appsScriptCallsToday: 0,
            dailyFreeLimitCalls: 20000,
            cacheHitRatePct: 100,
            driveCachedFiles: 0,
            driveCachedBytes: 0,
            latestBackupAt: (stats?.lastBackupAt as string) || null,
            backupStatus:
              (stats?.backupStatus as string) ||
              (appsScriptCfg.configured ? 'Ready' : 'Not configured'),
            availableBackups: Number(stats?.availableBackups) || 0,
            automationsActive: 0,
            automationsTotal: 0,
            automationsErrored: 0,
          },
        });
      } catch (err) {
        return jsonErrorResponse(
          502,
          err instanceof Error ? err.message : 'Unable to assemble dashboard overview.'
        );
      }
    }

    if (pathname === '/api/admin2/health' && method === 'GET') {
      const withPing = url.searchParams.get('ping') === '1';
      let ping: { ok: boolean; latencyMs: number; error?: string } | null = null;
      let lastError: string | null = null;

      if (withPing) {
        const start = Date.now();
        if (!appsScriptCfg.configured) {
          ping = {
            ok: false,
            latencyMs: 0,
            error:
              'APPS_SCRIPT_WEBAPP_URL and APPS_SCRIPT_API_SECRET are not set in Cloudflare Pages Environment Variables.',
          };
        } else {
          try {
            await callAppsScriptPost(env, 'getAdminStats', {}, admin.email);
            ping = { ok: true, latencyMs: Date.now() - start };
          } catch (err) {
            lastError = err instanceof Error ? err.message : 'Ping failed';
            ping = { ok: false, latencyMs: Date.now() - start, error: lastError };
          }
        }
      }

      return jsonResponse({
        ok: true,
        server: {
          status: 'healthy',
          uptimeSeconds: 0,
          nodeVersion: 'Cloudflare Edge Worker',
          memoryRssMb: 0,
          memoryHeapUsedMb: 0,
          timestamp: new Date().toISOString(),
        },
        integrations: {
          googleSheetsConfigured: appsScriptCfg.configured,
          appsScriptLastSuccessAt: appsScriptCfg.configured ? new Date().toISOString() : null,
          appsScriptLastError: lastError,
          appsScriptCallsToday: 0,
          dailyFreeLimitCalls: 20000,
          cacheHitRatePct: 100,
          pendingViewsCount: 0,
          driveCacheFiles: 0,
          driveCacheBytes: 0,
          geminiAiReady: Boolean((env?.GEMINI_API_KEY || '').trim()),
          geminiModel: GEMINI_EDITORIAL_MODEL,
          sitemapRoute: '/sitemap.xml',
          ping,
        },
        security: {
          activeAdminSessions: 1,
          totalAdminAccounts: 2,
          protectedSuperAdmins: 2,
          auditLogEntries: 0,
        },
      });
    }

    if (pathname === '/api/admin2/cms/state' && method === 'GET') {
      return jsonResponse({
        ok: true,
        drafts: [],
        overlays: {},
        archivedSnapshots: [],
      });
    }

    if (pathname === '/api/admin2/analytics' && method === 'GET') {
      try {
        const days = Number(url.searchParams.get('days')) || 14;
        const news = appsScriptCfg.configured ? await fetchAllPublishedNewsDirect(env, false) : [];
        return jsonResponse({ ok: true, ...buildAnalyticsFromNews(news, days, publicOrigin) });
      } catch (err) {
        return jsonErrorResponse(
          502,
          err instanceof Error ? err.message : 'Unable to assemble analytics.'
        );
      }
    }

    if (pathname === '/api/admin2/seo/audit' && method === 'GET') {
      try {
        const news = appsScriptCfg.configured ? await fetchAllPublishedNewsDirect(env, false) : [];
        const items = news.map((art) => {
          const title = stripMarkup(art.title);
          const desc = stripMarkup(art.description);
          const hasImage = Boolean(art.imageUrl || art.imageDriveId);
          const issues: string[] = [];
          if (!title) issues.push('Missing headline');
          if (!desc || desc.length < 25) issues.push('Short meta description');
          if (!hasImage) issues.push('No featured photograph');
          const score = Math.max(40, 100 - issues.length * 15);
          return {
            articleId: art.newsId,
            title,
            category: art.category || 'Local',
            publishedDate: art.publishedDate || '',
            seoTitle: `${title} — Coffeenadu News`,
            metaDescription: desc.slice(0, 160),
            canonicalUrl: `${publicOrigin}/?article=${encodeURIComponent(art.newsId)}`,
            ogTitle: title,
            ogDescription: desc.slice(0, 160),
            imageAltText: art.imageCaption || title,
            focusKeyword: art.category || 'Koppa News',
            hasImage,
            jsonLdValid: Boolean(title),
            score,
            issues,
          };
        });
        const avg =
          items.length > 0
            ? Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length)
            : 100;
        return jsonResponse({
          ok: true,
          siteDefaults: {
            canonicalBaseUrl: publicOrigin,
            defaultSeoTitle: 'Coffeenadu News — Koppa Taluk Local Kannada News',
            defaultMetaDescription:
              'Local Koppa Taluk news publishing portal featuring English navigation and fast-loading Kannada news updates across categories.',
            sitemapUrl: `${publicOrigin}/sitemap.xml`,
          },
          summary: {
            totalChecked: items.length,
            averageScore: avg,
            missingAltCount: items.filter((i) => !i.imageAltText).length,
            warningCount: items.filter((i) => i.issues.length > 0).length,
            sitemapValid: true,
            openGraphEnabled: true,
            jsonLdEnabled: true,
          },
          items,
        });
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'SEO audit failed.');
      }
    }

    if (pathname === '/api/admin2/media' && method === 'GET') {
      try {
        const news = appsScriptCfg.configured ? await fetchAllPublishedNewsDirect(env, false) : [];
        const assets = news
          .filter((a) => Boolean(a.imageUrl || a.imageDriveId))
          .map((a) => ({
            id: a.imageDriveId || a.newsId,
            imageUrl: a.imageUrl || `/api/media/drive/${encodeURIComponent(a.imageDriveId || '')}`,
            thumbUrl: a.imageThumbUrl || a.imageUrl || '',
            driveFileId: a.imageDriveId || '',
            fileName: `${a.newsId}.jpg`,
            folder: a.category || 'General News',
            mimeType: 'image/jpeg',
            watermarkApplied: Boolean(a.watermarkApplied),
            middleOverlayApplied: Boolean(a.watermarkApplied),
            uploadedAt: a.publishedDate || '',
            usageArticles: [
              {
                articleId: a.newsId,
                title: stripMarkup(a.title) || a.newsId,
                role: 'main' as const,
              },
            ],
            processingHistory: [
              'Stored in Google Drive & indexed via Google Sheets',
              a.watermarkApplied
                ? 'CoffeeNadu circular logo + watermark applied'
                : 'Original media record',
            ],
          }));
        return jsonResponse({
          ok: true,
          assets,
          folders: ['General News', 'Lead Stories', 'Extra Photos', 'Programs & Events'],
          duplicateHashes: [],
          driveCache: { fileCount: assets.length, totalBytes: 0 },
        });
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'Unable to load media.');
      }
    }

    if (pathname === '/api/admin2/notifications' && method === 'GET') {
      return jsonResponse({
        ok: true,
        notifications: [],
        unreadCount: 0,
        preferences: getDefaultNotificationPreferences(),
      });
    }

    if (pathname === '/api/admin2/notifications/read' && method === 'POST') {
      return jsonResponse({ ok: true, unreadCount: 0 });
    }

    if (pathname === '/api/admin2/notifications/preferences' && method === 'PUT') {
      const body = await readJsonBody(request);
      const defaults = getDefaultNotificationPreferences();
      return jsonResponse({
        ok: true,
        preferences: {
          publishingSuccess:
            body.publishingSuccess !== undefined ? Boolean(body.publishingSuccess) : defaults.publishingSuccess,
          publishingFailure:
            body.publishingFailure !== undefined ? Boolean(body.publishingFailure) : defaults.publishingFailure,
          imageProcessing:
            body.imageProcessing !== undefined ? Boolean(body.imageProcessing) : defaults.imageProcessing,
          backupAlerts:
            body.backupAlerts !== undefined ? Boolean(body.backupAlerts) : defaults.backupAlerts,
          storageWarnings:
            body.storageWarnings !== undefined ? Boolean(body.storageWarnings) : defaults.storageWarnings,
          automationErrors:
            body.automationErrors !== undefined ? Boolean(body.automationErrors) : defaults.automationErrors,
          adminSecurityActivity:
            body.adminSecurityActivity !== undefined
              ? Boolean(body.adminSecurityActivity)
              : defaults.adminSecurityActivity,
          readerMessages:
            body.readerMessages !== undefined ? Boolean(body.readerMessages) : defaults.readerMessages,
        },
      });
    }

    if (pathname === '/api/admin2/automations' && method === 'GET') {
      return jsonResponse({ ok: true, automations: [] });
    }

    if (pathname === '/api/admin2/admins' && method === 'GET') {
      return jsonResponse({
        ok: true,
        accounts: Array.from(OWNER_ADMIN_EMAILS).map((email, idx) => ({
          id: `owner-${idx + 1}`,
          fullName: email,
          email,
          role: 'super_admin',
          permissions: [...ROLE_DEFAULT_PERMISSIONS.super_admin],
          status: 'active',
          protectedSuperAdmin: true,
          hasPassword: false,
          createdAt: new Date().toISOString(),
          createdBy: 'system',
          lastLoginAt: email === admin.email ? new Date().toISOString() : undefined,
          activeSessionCount: email === admin.email ? 1 : 0,
        })),
      });
    }

    if (pathname === '/api/admin2/security/overview' && method === 'GET') {
      const nowIso = new Date().toISOString();
      return jsonResponse({
        ok: true,
        sessions: [
          {
            id: admin.sessionId,
            accountId: admin.id,
            email: admin.email,
            fullName: admin.fullName,
            role: admin.role,
            createdAt: nowIso,
            lastSeenAt: nowIso,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
            ip: request.headers.get('cf-connecting-ip') || 'edge',
            userAgent: request.headers.get('user-agent') || 'Cloudflare Edge',
            isCurrent: true,
          },
        ],
        auditLogs: [],
        loginHistory: [],
        securityAlerts: [],
      });
    }

    if (pathname === '/api/admin2/settings' && method === 'GET') {
      return jsonResponse({
        ok: true,
        settings: getDefaultWebsiteSettings(publicOrigin),
      });
    }

    if (pathname === '/api/admin2/settings' && method === 'PUT') {
      const body = await readJsonBody(request);
      const defaults = getDefaultWebsiteSettings(publicOrigin);
      return jsonResponse({
        ok: true,
        settings: {
          ...defaults,
          ...body,
          updatedAt: new Date().toISOString(),
          updatedBy: admin.email,
        },
      });
    }

    if (pathname === '/api/admin2/ads' && method === 'GET') {
      await ensureCfAdsStoreHydrated();
      return jsonResponse(buildCfAdminAdsPayload());
    }

    if (pathname === '/api/admin2/ads' && method === 'POST') {
      await ensureCfAdsStoreHydrated();
      const body = await readJsonBody(request);
      const todayYmd = new Date().toISOString().slice(0, 10);
      const nowIso = new Date().toISOString();
      const adNumber = computeCfNextAdNumber();
      const rawPlacements =
        body.placements && typeof body.placements === 'object'
          ? (body.placements as Record<string, unknown>)
          : {};
      const newAd: CfStoredAdRecord = {
        id: `cf-ad-${crypto.randomUUID()}`,
        adNumber,
        title: String(body.title || 'Untitled Advertisement').trim(),
        advertiserName: String(body.advertiserName || '').trim(),
        businessType: String(body.businessType || '').trim(),
        category: String(body.category || 'Local Business').trim(),
        description: String(body.description || '').trim(),
        tagline: String(body.tagline || '').trim(),
        imageUrl: String(body.imageUrl || '').trim(),
        imagePath: String(body.imagePath || '').trim(),
        additionalImages: Array.isArray(body.additionalImages)
          ? body.additionalImages.map(String)
          : [],
        aspectRatioPreset: String(body.aspectRatioPreset || 'banner_16_9'),
        contactPhone: String(body.contactPhone || '').trim(),
        whatsappNumber: String(body.whatsappNumber || '').trim(),
        whatsappPrefilledMessage: String(body.whatsappPrefilledMessage || '').trim(),
        websiteUrl: String(body.websiteUrl || '').trim(),
        googleMapsLocation: String(body.googleMapsLocation || '').trim(),
        address: String(body.address || '').trim(),
        email: String(body.email || '').trim(),
        ctaButtonText: String(body.ctaButtonText || 'Contact on WhatsApp').trim(),
        ctaActionType: String(body.ctaActionType || 'whatsapp').trim(),
        placements: {
          articlePopup: Boolean(rawPlacements.articlePopup),
          endOfArticle: rawPlacements.endOfArticle !== false,
          homepagePopup: Boolean(rawPlacements.homepagePopup),
          websiteEntry: Boolean(rawPlacements.websiteEntry),
          homepageSection: rawPlacements.homepageSection !== false,
          articleInline: Boolean(rawPlacements.articleInline),
        },
        targetCategories: Array.isArray(body.targetCategories)
          ? body.targetCategories.map(String)
          : [],
        targetLocations: Array.isArray(body.targetLocations)
          ? body.targetLocations.map(String)
          : [],
        targetArticleIds: Array.isArray(body.targetArticleIds)
          ? body.targetArticleIds.map(String)
          : [],
        targetDevice: String(body.targetDevice || 'all'),
        startDate: String(body.startDate || todayYmd),
        endDate: String(body.endDate || '2027-12-31'),
        status: String(body.status || 'active'),
        approvalStatus: String(body.approvalStatus || 'approved'),
        priority: String(body.priority || 'normal'),
        priorityOrder: Number(body.priorityOrder) || 10,
        featuredSponsor: Boolean(body.featuredSponsor),
        displayFrequency: String(body.displayFrequency || 'once_per_session'),
        maxImpressionsPerVisitor: Number(body.maxImpressionsPerVisitor) || 0,
        popupDelaySeconds: Number(body.popupDelaySeconds) || 2,
        popupAutoCloseSeconds: Number(body.popupAutoCloseSeconds) || 0,
        allowSkipImmediately: body.allowSkipImmediately !== false,
        sponsoredBadgeText: String(body.sponsoredBadgeText || 'Sponsored · ಸ್ಥಳೀಯ ಜಾಹೀರಾತು'),
        paymentStatus: String(body.paymentStatus || 'paid'),
        priceAmount: Number(body.priceAmount) || 0,
        paymentNotes: String(body.paymentNotes || ''),
        impressions: 0,
        uniqueImpressions: 0,
        clicks: 0,
        whatsappClicks: 0,
        phoneClicks: 0,
        websiteClicks: 0,
        directionsClicks: 0,
        shareClicks: 0,
        desktopImpressions: 0,
        mobileImpressions: 0,
        placementStats: {},
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: admin.email,
      };
      cfAdsList.unshift(newAd);
      await persistCfAdsStore();
      return jsonResponse({
        ok: true,
        ad: {
          ...newAd,
          effectiveStatus: computeCfEffectiveStatus(newAd, todayYmd),
          ctrPct: 0,
        },
      });
    }

    if (pathname === '/api/admin2/ads/settings' && method === 'GET') {
      await ensureCfAdsStoreHydrated();
      return jsonResponse({
        ok: true,
        settings: cfAdSettings,
      });
    }

    if (pathname === '/api/admin2/ads/settings' && method === 'PUT') {
      await ensureCfAdsStoreHydrated();
      const body = await readJsonBody(request);
      const rawGlobal =
        body.globalPlacementsEnabled && typeof body.globalPlacementsEnabled === 'object'
          ? (body.globalPlacementsEnabled as Record<string, unknown>)
          : {};
      cfAdSettings = {
        ...cfAdSettings,
        ...body,
        customCategories: Array.isArray(body.customCategories)
          ? body.customCategories.map(String)
          : cfAdSettings.customCategories,
        globalPlacementsEnabled: {
          ...cfAdSettings.globalPlacementsEnabled,
          ...(Object.keys(rawGlobal).length > 0
            ? {
                articlePopup: Boolean(rawGlobal.articlePopup),
                endOfArticle: Boolean(rawGlobal.endOfArticle),
                homepagePopup: Boolean(rawGlobal.homepagePopup),
                websiteEntry: Boolean(rawGlobal.websiteEntry),
                homepageSection: Boolean(rawGlobal.homepageSection),
                articleInline: Boolean(rawGlobal.articleInline),
              }
            : {}),
        },
        updatedAt: new Date().toISOString(),
        updatedBy: admin.email,
      };
      await persistCfAdsStore();
      return jsonResponse({
        ok: true,
        settings: cfAdSettings,
      });
    }

    if (pathname === '/api/admin2/ads/upload-image' && method === 'POST') {
      const body = await readJsonBody(request);
      const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
      if (!dataUrl.startsWith('data:image/')) {
        return jsonErrorResponse(400, 'Valid image dataUrl is required.');
      }
      return jsonResponse({
        ok: true,
        imageUrl: dataUrl,
        imagePath: `inline-${Date.now()}`,
      });
    }

    if (pathname === '/api/admin2/ads/analytics' && method === 'GET') {
      await ensureCfAdsStoreHydrated();
      const rawRange = url.searchParams.get('range') || 'weekly';
      const range =
        rawRange === 'daily' || rawRange === 'weekly' || rawRange === 'monthly' || rawRange === 'all'
          ? rawRange
          : 'weekly';
      const todayYmd = new Date().toISOString().slice(0, 10);
      const perAd = cfAdsList.map((ad) => ({
        id: ad.id,
        adNumber: ad.adNumber,
        title: ad.title,
        advertiserName: ad.advertiserName,
        category: ad.category,
        effectiveStatus: computeCfEffectiveStatus(ad, todayYmd),
        impressions: ad.impressions || 0,
        uniqueImpressions: ad.uniqueImpressions || 0,
        clicks: ad.clicks || 0,
        ctrPct: ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 1000) / 10 : 0,
        whatsappClicks: ad.whatsappClicks || 0,
        phoneClicks: ad.phoneClicks || 0,
        websiteClicks: ad.websiteClicks || 0,
        directionsClicks: ad.directionsClicks || 0,
        shareClicks: ad.shareClicks || 0,
        desktopImpressions: ad.desktopImpressions || 0,
        mobileImpressions: ad.mobileImpressions || 0,
      }));
      const totalImpressions = perAd.reduce((acc, a) => acc + a.impressions, 0);
      const totalClicks = perAd.reduce((acc, a) => acc + a.clicks, 0);
      return jsonResponse({
        ok: true,
        range,
        totals: {
          impressions: totalImpressions,
          uniqueVisitors: perAd.reduce((acc, a) => acc + a.uniqueImpressions, 0),
          clicks: totalClicks,
          ctrPct:
            totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0,
          whatsappClicks: perAd.reduce((acc, a) => acc + a.whatsappClicks, 0),
          phoneClicks: perAd.reduce((acc, a) => acc + a.phoneClicks, 0),
          websiteClicks: perAd.reduce((acc, a) => acc + a.websiteClicks, 0),
          directionsClicks: perAd.reduce((acc, a) => acc + a.directionsClicks, 0),
          shareClicks: perAd.reduce((acc, a) => acc + a.shareClicks, 0),
          desktopImpressions: perAd.reduce((acc, a) => acc + a.desktopImpressions, 0),
          mobileImpressions: perAd.reduce((acc, a) => acc + a.mobileImpressions, 0),
        },
        byPlacement: {},
        series: [],
        perAd,
        bestPerformingAd: perAd[0] || null,
      });
    }

    const adActionMatch = pathname.match(
      /^\/api\/admin2\/ads\/([^/]+)(?:\/(duplicate|status|placements|approval))?$/
    );
    if (adActionMatch) {
      await ensureCfAdsStoreHydrated();
      const targetId = decodeURIComponent(adActionMatch[1]).trim();
      const subAction = adActionMatch[2] || '';
      const todayYmd = new Date().toISOString().slice(0, 10);
      const idx = cfAdsList.findIndex((a) => a.id === targetId || a.adNumber === targetId);
      if (idx === -1) {
        return jsonErrorResponse(404, 'Advertisement not found.');
      }

      if (!subAction && method === 'DELETE') {
        cfAdsList.splice(idx, 1);
        await persistCfAdsStore();
        return jsonResponse({ ok: true });
      }

      if (!subAction && method === 'PUT') {
        const body = await readJsonBody(request);
        const existing = cfAdsList[idx];
        const updated: CfStoredAdRecord = {
          ...existing,
          ...body,
          id: existing.id,
          adNumber: existing.adNumber,
          placements:
            body.placements && typeof body.placements === 'object'
              ? { ...existing.placements, ...(body.placements as Record<string, boolean>) }
              : existing.placements,
          updatedAt: new Date().toISOString(),
        };
        cfAdsList[idx] = updated;
        await persistCfAdsStore();
        return jsonResponse({
          ok: true,
          ad: {
            ...updated,
            effectiveStatus: computeCfEffectiveStatus(updated, todayYmd),
            ctrPct:
              updated.impressions > 0
                ? Math.round((updated.clicks / updated.impressions) * 1000) / 10
                : 0,
          },
        });
      }

      if (subAction === 'duplicate' && method === 'POST') {
        const src = cfAdsList[idx];
        const nowIso = new Date().toISOString();
        const dup: CfStoredAdRecord = {
          ...src,
          id: `cf-ad-${crypto.randomUUID()}`,
          adNumber: computeCfNextAdNumber(),
          title: `${src.title} (Copy)`,
          status: 'draft',
          impressions: 0,
          uniqueImpressions: 0,
          clicks: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        cfAdsList.unshift(dup);
        await persistCfAdsStore();
        return jsonResponse({
          ok: true,
          ad: {
            ...dup,
            effectiveStatus: computeCfEffectiveStatus(dup, todayYmd),
            ctrPct: 0,
          },
        });
      }

      if (subAction === 'status' && method === 'PATCH') {
        const body = await readJsonBody(request);
        if (typeof body.status === 'string') {
          cfAdsList[idx].status = body.status;
          cfAdsList[idx].updatedAt = new Date().toISOString();
          await persistCfAdsStore();
        }
        const updated = cfAdsList[idx];
        return jsonResponse({
          ok: true,
          ad: {
            ...updated,
            effectiveStatus: computeCfEffectiveStatus(updated, todayYmd),
            ctrPct:
              updated.impressions > 0
                ? Math.round((updated.clicks / updated.impressions) * 1000) / 10
                : 0,
          },
        });
      }

      if (subAction === 'placements' && method === 'PATCH') {
        const body = await readJsonBody(request);
        if (body.placements && typeof body.placements === 'object') {
          cfAdsList[idx].placements = {
            ...cfAdsList[idx].placements,
            ...(body.placements as Record<string, boolean>),
          };
          cfAdsList[idx].updatedAt = new Date().toISOString();
          await persistCfAdsStore();
        }
        const updated = cfAdsList[idx];
        return jsonResponse({
          ok: true,
          ad: {
            ...updated,
            effectiveStatus: computeCfEffectiveStatus(updated, todayYmd),
            ctrPct:
              updated.impressions > 0
                ? Math.round((updated.clicks / updated.impressions) * 1000) / 10
                : 0,
          },
        });
      }

      if (subAction === 'approval' && method === 'PATCH') {
        const body = await readJsonBody(request);
        if (typeof body.approvalStatus === 'string') {
          cfAdsList[idx].approvalStatus = body.approvalStatus;
          cfAdsList[idx].updatedAt = new Date().toISOString();
          await persistCfAdsStore();
        }
        const updated = cfAdsList[idx];
        return jsonResponse({
          ok: true,
          ad: {
            ...updated,
            effectiveStatus: computeCfEffectiveStatus(updated, todayYmd),
            ctrPct:
              updated.impressions > 0
                ? Math.round((updated.clicks / updated.impressions) * 1000) / 10
                : 0,
          },
        });
      }
    }

    if (pathname === '/api/admin2/ai/assist' && method === 'POST') {
      const apiKey = (env?.GEMINI_API_KEY || '').trim();
      const disclaimer =
        'AI-generated draft strictly grounded in your supplied source notes. Remains a draft until reviewed and approved by an authorized editor.';
      if (!apiKey) {
        return jsonErrorResponse(
          503,
          'GEMINI_API_KEY is not configured in Cloudflare Pages Environment Variables.'
        );
      }
      const body = await readJsonBody(request);
      const sourceMaterial = String(body.sourceMaterial || '').trim();
      const tool = String(body.tool || 'draft_kannada').trim();
      if (!sourceMaterial || sourceMaterial.length < 10) {
        return jsonErrorResponse(400, 'Please select an AI tool and provide source material (at least 10 characters).');
      }
      try {
        const prompt = [
          'You are the senior editorial desk assistant for CoffeeNadu News (Koppa Taluk, Chikkamagaluru, Karnataka).',
          'STRICT JOURNALISM RULES: Use ONLY facts explicitly in the supplied source material. Never invent quotes, names, or numbers.',
          `Task Tool: ${tool}`,
          'Return valid JSON with applicable keys from: {"headline":"...","summary":"...","paragraphs":["..."],"options":["..."],"seoTitle":"...","metaDescription":"...","captionKn":"...","captionEn":"...","altText":"...","verificationFindings":[{"claim":"...","status":"supported","note":"..."}]}.',
          '',
          'Source Material:',
          sourceMaterial.slice(0, 10000),
        ].join('\n');

        const gemResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EDITORIAL_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
              },
            }),
          }
        );
        if (!gemResp.ok) {
          return jsonErrorResponse(502, `Gemini API error (${gemResp.status}).`);
        }
        const gemJson = (await gemResp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText =
          gemJson.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim() || '';

        let structured: Record<string, unknown> | undefined;
        try {
          structured = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          structured = undefined;
        }

        let outputText = rawText;
        if (structured) {
          const parts: string[] = [];
          if (typeof structured.headline === 'string' && structured.headline) parts.push(structured.headline);
          if (typeof structured.summary === 'string' && structured.summary) parts.push(structured.summary);
          if (Array.isArray(structured.paragraphs) && structured.paragraphs.length > 0) {
            parts.push(structured.paragraphs.map((p) => String(p)).join('\n\n'));
          }
          if (typeof structured.seoTitle === 'string' && structured.seoTitle) {
            parts.push(`SEO Title: ${structured.seoTitle}`);
          }
          if (typeof structured.metaDescription === 'string' && structured.metaDescription) {
            parts.push(`Meta Description: ${structured.metaDescription}`);
          }
          if (typeof structured.captionKn === 'string' && structured.captionKn) {
            parts.push(`Kannada Caption: ${structured.captionKn}`);
          }
          if (typeof structured.captionEn === 'string' && structured.captionEn) {
            parts.push(`English Caption: ${structured.captionEn}`);
          }
          if (typeof structured.altText === 'string' && structured.altText) {
            parts.push(`Image Alt Text: ${structured.altText}`);
          }
          if (Array.isArray(structured.options) && structured.options.length > 0) {
            parts.push(structured.options.map((o, i) => `${i + 1}. ${String(o)}`).join('\n'));
          }
          if (parts.length > 0) outputText = parts.join('\n\n');
        }

        return jsonResponse({
          ok: true,
          tool,
          model: GEMINI_EDITORIAL_MODEL,
          outputText,
          structured,
          disclaimer,
        });
      } catch (err) {
        return jsonErrorResponse(502, err instanceof Error ? err.message : 'AI assist failed.');
      }
    }
  }

  return jsonErrorResponse(
    404,
    'Endpoint not available in standalone Cloudflare mode. Set BACKEND_ORIGIN to your live Express backend URL for full CMS/Ads features.'
  );
  } catch (err) {
    console.error('[CF Direct API] Unhandled exception:', err);
    return jsonErrorResponse(
      500,
      err instanceof Error && err.message
        ? err.message
        : 'ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯೆ ದೋಷ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.'
    );
  }
}
