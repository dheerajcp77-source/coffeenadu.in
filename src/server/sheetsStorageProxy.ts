import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express, NextFunction, Request, Response } from 'express';
import type { ExtraNewsPhoto } from '../types/news.ts';
import {
  packBodyWithExtraPhotos,
  sanitizeExtraPhotos,
  unpackBodyAndExtraPhotos,
} from '../utils/extraPhotos.ts';
import {
  normalizeFeaturedUntil,
  parseSheetBoolean,
  resolveEffectiveLeadState,
  serializeLeadMetaToTags,
} from '../utils/featuredLead.ts';
import { validateCustomEnglishSlugInput } from '../utils/slug.ts';

const CACHE_TTL_MS = 7 * 60 * 1000; // 7 minutes (within required 5–10 min window)
const VIEW_FLUSH_INTERVAL_MS = 60 * 1000; // Batch flush views every 60 seconds
const VIEW_FLUSH_BATCH_THRESHOLD = 10; // Or immediately once 10 views accumulate
const MAX_RETRY_ATTEMPTS = 3;

const OWNER_ADMIN_EMAILS = new Set([
  'shwethashwethak85@gmail.com',
  'dheerajcp77@gmail.com',
]);

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

export interface VerifiedAdminUser {
  uid: string;
  email: string;
  displayName?: string;
}

export interface AdminRequest extends Request {
  verifiedAdmin?: VerifiedAdminUser;
}

export type ExternalAdminVerifier = (
  bearerToken: string,
  req: Request
) => Promise<VerifiedAdminUser | null>;

export type StorageEventHook = (event: {
  type: 'news_created' | 'news_updated' | 'news_deleted' | 'image_uploaded' | 'backup_created' | 'backup_restored' | 'view_recorded' | 'error';
  actorEmail?: string;
  entityId?: string;
  details: string;
}) => void;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  expiresAt: number;
}

interface QuotaTelemetry {
  dayKey: string;
  appsScriptCallsToday: number;
  cacheHitsToday: number;
  cacheMissesToday: number;
  batchedViewFlushesToday: number;
  totalViewsAggregatedToday: number;
  driveProxyFetchesToday: number;
  driveProxyCacheHitsToday: number;
  lastAppsScriptSuccessAt: string | null;
  lastError: string | null;
  lastFlushAt: string | null;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

interface LeadStoryOverride {
  featured: boolean;
  featuredUntil?: number;
  updatedAt: number;
  updatedBy?: string;
}

export interface ArticleViewRecordMeta {
  title?: string;
  category?: string;
  location?: string;
  publishedDate?: string;
  baselineViews?: number;
  cachedSheetsViewsBefore?: number;
}

export type ArticleViewRecorder = (
  articleId: string,
  meta: ArticleViewRecordMeta
) => { views: number; lastViewedAt: string };

export type ArticleViewOverlayProvider = (articleId: string, sheetsViewsWithPending: number) => number;

function resolveCacheDirs(baseDataDir: string) {
  const driveCacheDir = path.join(baseDataDir, 'drive-image-cache');
  const snapshotPath = path.join(baseDataDir, 'sheets-cache-snapshot.json');
  const leadOverridesPath = path.join(baseDataDir, 'lead-story-overrides.json');
  const pendingViewsPath = path.join(baseDataDir, 'pending-views.json');
  try {
    fs.mkdirSync(driveCacheDir, { recursive: true });
    return { driveCacheDir, snapshotPath, leadOverridesPath, pendingViewsPath };
  } catch {
    const tmpBase = path.join(os.tmpdir(), 'coffeenadu-sheets-cache');
    const tmpDrive = path.join(tmpBase, 'drive-image-cache');
    fs.mkdirSync(tmpDrive, { recursive: true });
    return {
      driveCacheDir: tmpDrive,
      snapshotPath: path.join(tmpBase, 'sheets-cache-snapshot.json'),
      leadOverridesPath: path.join(tmpBase, 'lead-story-overrides.json'),
      pendingViewsPath: path.join(tmpBase, 'pending-views.json'),
    };
  }
}

function getAppsScriptConfig() {
  const webAppUrl = (process.env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  const apiSecret = (process.env.APPS_SCRIPT_API_SECRET || '').trim();
  const configured = Boolean(
    webAppUrl &&
      /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/i.test(webAppUrl) &&
      apiSecret.length >= 12
  );
  return { webAppUrl, apiSecret, configured };
}

/**
 * Generates canonical Google Drive image URLs directly from a Drive file ID
 * (no third-party or external image CDN required).
 */
export function buildGoogleDriveImageUrls(fileId: string) {
  const cleanId = encodeURIComponent(fileId.trim());
  return {
    proxyUrl: `/api/media/drive/${cleanId}`,
    driveThumbnailUrl: `https://drive.google.com/thumbnail?id=${cleanId}&sz=w1600`,
    driveViewUrl: `https://drive.google.com/uc?export=view&id=${cleanId}`,
  };
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseMonthIndex(abbr: string): number {
  const lower = abbr.slice(0, 3).toLowerCase();
  return SHORT_MONTHS.findIndex((m) => m.toLowerCase() === lower);
}

/**
 * Extracts a canonical YYYY-MM-DD calendar date key from strings like:
 * - "18 Nov 2026"
 * - "2026-11-18"
 * - "Wed Nov 18 2026 00:00:00 GMT+0530 (印度標準時間)"
 * - "2026-11-18T00:00:00.000Z"
 */
function normalizeCalendarDateKey(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';

  // Already YYYY-MM-DD
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // JS Date.toString() from Google Sheets cell auto-parsing: "Wed Nov 18 2026 00:00:00 GMT+0530 (...)"
  const jsDateMatch = value.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (jsDateMatch) {
    const mIdx = parseMonthIndex(jsDateMatch[1]);
    if (mIdx >= 0) {
      return `${jsDateMatch[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(jsDateMatch[2])).padStart(2, '0')}`;
    }
  }

  // "18 Nov 2026" or "18 November 2026"
  const dmyMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dmyMatch) {
    const mIdx = parseMonthIndex(dmyMatch[2]);
    if (mIdx >= 0) {
      return `${dmyMatch[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(dmyMatch[1])).padStart(2, '0')}`;
    }
  }

  // "Nov 18, 2026"
  const mdyMatch = value.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdyMatch) {
    const mIdx = parseMonthIndex(mdyMatch[1]);
    if (mIdx >= 0) {
      return `${mdyMatch[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(mdyMatch[2])).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
    return parts;
  }
  return '';
}

function normalizeDisplayDate(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  // If Google Sheets auto-parsed into a JS Date string or ISO string, format cleanly as "18 Nov 2026"
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
  // Google Sheets turns "05:14 PM" into "Sat Dec 30 1899 17:14:00 GMT+0521 (...)"
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

function sanitizeSheetsNewsItem(item: SheetsNewsItem, nowMs = Date.now()): SheetsNewsItem {
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

function sanitizeSheetsEventItem(item: SheetsEventItem): SheetsEventItem {
  return {
    ...item,
    eventDate: normalizeEventDateIso(item.eventDate),
    eventTime: normalizeDisplayTime(item.eventTime),
  };
}

function readFirebasePublicApiKey(): string {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { apiKey?: string };
    return typeof parsed.apiKey === 'string' ? parsed.apiKey : '';
  } catch {
    return '';
  }
}

export class SheetsStorageManager {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly verifiedTokenCache = new Map<string, { admin: VerifiedAdminUser; expiresAt: number }>();
  private readonly pendingNewsViews = new Map<string, number>();
  private readonly pendingEventViews = new Map<string, number>();
  private readonly leadOverrides = new Map<string, LeadStoryOverride>();
  private readonly driveCacheDir: string;
  private readonly snapshotPath: string;
  private readonly leadOverridesPath: string;
  private readonly pendingViewsPath: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushingViews = false;
  private externalAdminVerifier: ExternalAdminVerifier | null = null;
  private eventHook: StorageEventHook | null = null;
  private articleViewRecorder: ArticleViewRecorder | null = null;
  private articleViewOverlayProvider: ArticleViewOverlayProvider | null = null;

  private telemetry: QuotaTelemetry = {
    dayKey: getTodayKey(),
    appsScriptCallsToday: 0,
    cacheHitsToday: 0,
    cacheMissesToday: 0,
    batchedViewFlushesToday: 0,
    totalViewsAggregatedToday: 0,
    driveProxyFetchesToday: 0,
    driveProxyCacheHitsToday: 0,
    lastAppsScriptSuccessAt: null,
    lastError: null,
    lastFlushAt: null,
  };

  constructor(baseDataDir: string) {
    const dirs = resolveCacheDirs(baseDataDir);
    this.driveCacheDir = dirs.driveCacheDir;
    this.snapshotPath = dirs.snapshotPath;
    this.leadOverridesPath = dirs.leadOverridesPath;
    this.pendingViewsPath = dirs.pendingViewsPath;
    this.hydrateSnapshotFromDisk();
    this.hydrateLeadOverridesFromDisk();
    this.hydratePendingViewsFromDisk();
    this.startViewBatchFlusher();
  }

  private rollDayIfNeeded(): void {
    const today = getTodayKey();
    if (this.telemetry.dayKey !== today) {
      this.telemetry = {
        ...this.telemetry,
        dayKey: today,
        appsScriptCallsToday: 0,
        cacheHitsToday: 0,
        cacheMissesToday: 0,
        batchedViewFlushesToday: 0,
        totalViewsAggregatedToday: 0,
        driveProxyFetchesToday: 0,
        driveProxyCacheHitsToday: 0,
      };
    }
  }

  public isConfigured(): boolean {
    return getAppsScriptConfig().configured;
  }

  private hydrateSnapshotFromDisk(): void {
    try {
      if (!fs.existsSync(this.snapshotPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf8')) as Record<
        string,
        CacheEntry<unknown>
      >;
      if (raw && typeof raw === 'object') {
        for (const [key, entry] of Object.entries(raw)) {
          if (entry && entry.data !== undefined && typeof entry.fetchedAt === 'number') {
            this.cache.set(key, entry);
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  private persistSnapshotToDisk(): void {
    try {
      const serializable: Record<string, CacheEntry<unknown>> = {};
      for (const [key, entry] of this.cache.entries()) {
        if (key.startsWith('news:') || key.startsWith('events:') || key === 'categories' || key === 'settings') {
          serializable[key] = entry;
        }
      }
      fs.writeFileSync(this.snapshotPath, JSON.stringify(serializable), 'utf8');
    } catch {
      // Non-fatal
    }
  }

  private hydrateLeadOverridesFromDisk(): void {
    try {
      if (!fs.existsSync(this.leadOverridesPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.leadOverridesPath, 'utf8')) as Record<
        string,
        LeadStoryOverride
      >;
      if (raw && typeof raw === 'object') {
        for (const [newsId, entry] of Object.entries(raw)) {
          if (entry && typeof entry.featured === 'boolean') {
            this.leadOverrides.set(newsId, {
              featured: entry.featured,
              featuredUntil: normalizeFeaturedUntil(entry.featuredUntil),
              updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
              updatedBy: typeof entry.updatedBy === 'string' ? entry.updatedBy : undefined,
            });
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  private persistLeadOverridesToDisk(): void {
    try {
      const obj: Record<string, LeadStoryOverride> = {};
      for (const [newsId, entry] of this.leadOverrides.entries()) {
        obj[newsId] = entry;
      }
      fs.writeFileSync(this.leadOverridesPath, JSON.stringify(obj, null, 2), 'utf8');
    } catch {
      // Non-fatal
    }
  }

  private hydratePendingViewsFromDisk(): void {
    try {
      if (!fs.existsSync(this.pendingViewsPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.pendingViewsPath, 'utf8')) as {
        news?: Record<string, number>;
        events?: Record<string, number>;
      };
      if (raw?.news && typeof raw.news === 'object') {
        for (const [id, count] of Object.entries(raw.news)) {
          const n = Number(count);
          if (/^[a-zA-Z0-9_-]{1,128}$/.test(id) && Number.isFinite(n) && n > 0) {
            this.pendingNewsViews.set(id, Math.floor(n));
          }
        }
      }
      if (raw?.events && typeof raw.events === 'object') {
        for (const [id, count] of Object.entries(raw.events)) {
          const n = Number(count);
          if (/^[a-zA-Z0-9_-]{1,128}$/.test(id) && Number.isFinite(n) && n > 0) {
            this.pendingEventViews.set(id, Math.floor(n));
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  private persistPendingViewsToDisk(): void {
    try {
      const payload = {
        news: Object.fromEntries(this.pendingNewsViews.entries()),
        events: Object.fromEntries(this.pendingEventViews.entries()),
      };
      const tmp = `${this.pendingViewsPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
      fs.renameSync(tmp, this.pendingViewsPath);
    } catch {
      // Non-fatal
    }
  }

  public setArticleViewHooks(
    recorder: ArticleViewRecorder,
    overlayProvider: ArticleViewOverlayProvider
  ): void {
    this.articleViewRecorder = recorder;
    this.articleViewOverlayProvider = overlayProvider;
  }

  public findCachedNewsItem(newsId: string): SheetsNewsItem | null {
    const cleanId = newsId.trim();
    if (!cleanId) return null;
    const singleEntry = this.cache.get(`news:id:${cleanId}`)?.data as { item?: SheetsNewsItem } | undefined;
    if (singleEntry?.item && singleEntry.item.newsId === cleanId) {
      return singleEntry.item;
    }
    for (const [key, entry] of this.cache.entries()) {
      if (!key.startsWith('news:list:')) continue;
      const listVal = entry.data as { items?: SheetsNewsItem[] } | undefined;
      const found = Array.isArray(listVal?.items)
        ? listVal.items.find((it) => it && it.newsId === cleanId)
        : undefined;
      if (found) return found;
    }
    return null;
  }

  public getCachedArticleViewsMap(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, entry] of this.cache.entries()) {
      if (!key.startsWith('news:')) continue;
      const val = entry.data as { items?: SheetsNewsItem[]; item?: SheetsNewsItem } | undefined;
      if (Array.isArray(val?.items)) {
        for (const it of val.items) {
          if (it?.newsId) {
            const total = (Number(it.views) || 0) + (this.pendingNewsViews.get(it.newsId) || 0);
            out[it.newsId] = Math.max(out[it.newsId] || 0, total);
          }
        }
      }
      if (val?.item?.newsId) {
        const total = (Number(val.item.views) || 0) + (this.pendingNewsViews.get(val.item.newsId) || 0);
        out[val.item.newsId] = Math.max(out[val.item.newsId] || 0, total);
      }
    }
    for (const [id, pending] of this.pendingNewsViews.entries()) {
      out[id] = Math.max(out[id] || 0, pending);
    }
    return out;
  }

  private resolveEffectiveNewsViews(newsId: string, baseSheetViews: unknown): number {
    const withPending = (Number(baseSheetViews) || 0) + (this.pendingNewsViews.get(newsId) || 0);
    return this.articleViewOverlayProvider
      ? this.articleViewOverlayProvider(newsId, withPending)
      : withPending;
  }

  private setLeadOverride(
    newsId: string,
    featured: boolean,
    featuredUntil: number | undefined,
    updatedBy?: string
  ): void {
    const cleanId = String(newsId || '').trim();
    if (!cleanId) return;
    this.leadOverrides.set(cleanId, {
      featured: Boolean(featured),
      featuredUntil: featured ? normalizeFeaturedUntil(featuredUntil) : undefined,
      updatedAt: Date.now(),
      updatedBy,
    });
    this.persistLeadOverridesToDisk();
  }

  private clearLeadOverride(newsId: string): void {
    const cleanId = String(newsId || '').trim();
    if (!cleanId) return;
    if (this.leadOverrides.delete(cleanId)) {
      this.persistLeadOverridesToDisk();
    }
  }

  private sanitizeWithLeadOverride(item: SheetsNewsItem, nowMs = Date.now()): SheetsNewsItem {
    const base = sanitizeSheetsNewsItem(item, nowMs);
    const override = this.leadOverrides.get(base.newsId);
    if (!override) return base;

    const validUntil = override.featured ? normalizeFeaturedUntil(override.featuredUntil) : undefined;
    const isActive = override.featured && (!validUntil || validUntil > nowMs);
    return {
      ...base,
      featured: isActive,
      featuredUntil: isActive ? validUntil : undefined,
      tags: serializeLeadMetaToTags(base.tags, {
        isFeatured: isActive,
        featuredUntil: isActive ? validUntil : undefined,
      }),
    };
  }

  private invalidateReadCaches(): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith('news:') || key.startsWith('events:') || key === 'health' || key === 'settings') {
        this.cache.delete(key);
      }
    }
    this.persistSnapshotToDisk();
  }

  private startViewBatchFlusher(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flushPendingViews();
    }, VIEW_FLUSH_INTERVAL_MS);
    this.flushTimer.unref?.();
  }

  private async fetchWithRetry<T>(
    url: string,
    init?: RequestInit,
    attempts = MAX_RETRY_ATTEMPTS
  ): Promise<T> {
    this.rollDayIfNeeded();
    let lastErr: unknown;

    for (let i = 0; i < attempts; i += 1) {
      try {
        this.telemetry.appsScriptCallsToday += 1;
        const resp = await fetch(url, {
          ...init,
          redirect: 'follow',
          signal: AbortSignal.timeout(18000),
        });

        if (resp.status === 429 || resp.status >= 500) {
          throw new Error(`Apps Script HTTP ${resp.status}`);
        }

        const text = await resp.text();
        let json: T;
        try {
          json = JSON.parse(text) as T;
        } catch {
          throw new Error(
            'Apps Script returned non-JSON response. Verify Web App deployment is set to Execute as "Me" and Access "Anyone".'
          );
        }

        this.telemetry.lastAppsScriptSuccessAt = new Date().toISOString();
        this.telemetry.lastError = null;
        return json;
      } catch (err) {
        lastErr = err;
        if (i < attempts - 1) {
          const backoffMs = 400 * Math.pow(2, i);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    this.telemetry.lastError = msg;
    throw new Error(msg);
  }

  public async callAppsScriptGet<T>(
    action: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const cfg = getAppsScriptConfig();
    if (!cfg.configured) {
      throw new Error('Google Apps Script Web App URL and API secret are not configured yet.');
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
    return this.fetchWithRetry<T>(url.toString(), { method: 'GET' });
  }

  public async callAppsScriptPost<T>(
    action: string,
    body: Record<string, unknown>,
    adminEmail?: string
  ): Promise<T> {
    const cfg = getAppsScriptConfig();
    if (!cfg.configured) {
      throw new Error('Google Apps Script Web App URL and API secret are not configured yet.');
    }
    const payload = {
      ...body,
      action,
      apiSecret: cfg.apiSecret,
      adminEmail: adminEmail || '',
    };
    const result = await this.fetchWithRetry<T>(cfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return result;
  }

  private async getCachedOrFetch<T>(
    cacheKey: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
    forceRefresh = false
  ): Promise<{ data: T; fromCache: boolean; stale?: boolean }> {
    this.rollDayIfNeeded();
    const existing = this.cache.get(cacheKey) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (!forceRefresh && existing && now < existing.expiresAt) {
      this.telemetry.cacheHitsToday += 1;
      return { data: existing.data, fromCache: true };
    }

    const inFlight = this.inFlight.get(cacheKey) as Promise<T> | undefined;
    if (inFlight) {
      const data = await inFlight;
      return { data, fromCache: false };
    }

    this.telemetry.cacheMissesToday += 1;
    const task = fetcher()
      .then((fresh) => {
        this.cache.set(cacheKey, {
          data: fresh,
          fetchedAt: Date.now(),
          expiresAt: Date.now() + ttlMs,
        });
        this.persistSnapshotToDisk();
        return fresh;
      })
      .finally(() => {
        this.inFlight.delete(cacheKey);
      });

    this.inFlight.set(cacheKey, task);

    try {
      const data = await task;
      return { data, fromCache: false };
    } catch (err) {
      // Stale-cache resilience if Google Apps Script is temporarily unreachable
      if (existing) {
        return { data: existing.data, fromCache: true, stale: true };
      }
      throw err;
    }
  }

  public recordView(
    entityType: 'article' | 'event',
    id: string,
    _visitorKey?: string,
    meta?: Omit<ArticleViewRecordMeta, 'cachedSheetsViewsBefore'>
  ): { ok: boolean; views: number; lastViewedAt: string } {
    const cleanId = id.trim();
    const nowIso = new Date().toISOString();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanId)) {
      return { ok: false, views: 0, lastViewedAt: nowIso };
    }

    this.rollDayIfNeeded();

    const cachedItem = entityType === 'article' ? this.findCachedNewsItem(cleanId) : null;
    const cachedBefore =
      entityType === 'article'
        ? (Number(cachedItem?.views) || 0) + (this.pendingNewsViews.get(cleanId) || 0)
        : 0;

    if (entityType === 'event' || this.isConfigured()) {
      const targetMap = entityType === 'article' ? this.pendingNewsViews : this.pendingEventViews;
      targetMap.set(cleanId, (targetMap.get(cleanId) || 0) + 1);
      this.persistPendingViewsToDisk();
    }

    this.telemetry.totalViewsAggregatedToday += 1;

    let confirmedViews = cachedBefore + 1;
    let lastViewedAt = nowIso;

    if (entityType === 'article' && this.articleViewRecorder) {
      const recorded = this.articleViewRecorder(cleanId, {
        title: meta?.title || cachedItem?.title,
        category: meta?.category || cachedItem?.category,
        location: meta?.location || cachedItem?.location,
        publishedDate: meta?.publishedDate || cachedItem?.publishedDate,
        baselineViews: meta?.baselineViews,
        cachedSheetsViewsBefore: cachedBefore,
      });
      confirmedViews = recorded.views;
      lastViewedAt = recorded.lastViewedAt;
    } else {
      this.emitEvent({
        type: 'view_recorded',
        entityId: cleanId,
        details: `${entityType}:${cleanId}`,
      });
    }

    if (this.isConfigured() && this.getPendingViewsCount() >= VIEW_FLUSH_BATCH_THRESHOLD) {
      void this.flushPendingViews();
    }

    return { ok: true, views: confirmedViews, lastViewedAt };
  }

  public getPendingViewsCount(): number {
    let total = 0;
    for (const v of this.pendingNewsViews.values()) total += v;
    for (const v of this.pendingEventViews.values()) total += v;
    return total;
  }

  public async flushPendingViews(): Promise<{ flushed: boolean; count: number }> {
    if (!this.isConfigured() || this.isFlushingViews) {
      return { flushed: false, count: 0 };
    }
    const newsSnapshot = Object.fromEntries(this.pendingNewsViews.entries());
    const eventSnapshot = Object.fromEntries(this.pendingEventViews.entries());
    const newsKeys = Object.keys(newsSnapshot);
    const eventKeys = Object.keys(eventSnapshot);
    if (newsKeys.length === 0 && eventKeys.length === 0) {
      return { flushed: false, count: 0 };
    }

    this.isFlushingViews = true;
    // Clear pending counts optimistically; restore on failure
    this.pendingNewsViews.clear();
    this.pendingEventViews.clear();
    this.persistPendingViewsToDisk();

    try {
      await this.callAppsScriptPost('batchUpdateViews', {
        newsViews: newsSnapshot,
        eventViews: eventSnapshot,
      });
      // Apply flushed view deltas into cached responses in-place so view counts stay accurate without extra Sheets reads
      for (const [cacheKey, entry] of this.cache.entries()) {
        const val = entry.data as Record<string, unknown> | null;
        if (!val || typeof val !== 'object') continue;
        if (cacheKey.startsWith('news:')) {
          if (Array.isArray(val.items)) {
            for (const raw of val.items as SheetsNewsItem[]) {
              const delta = newsSnapshot[raw.newsId];
              if (delta) raw.views = (Number(raw.views) || 0) + delta;
            }
          }
          if (val.item && typeof val.item === 'object') {
            const single = val.item as SheetsNewsItem;
            const delta = newsSnapshot[single.newsId];
            if (delta) single.views = (Number(single.views) || 0) + delta;
          }
        } else if (cacheKey.startsWith('events:')) {
          if (Array.isArray(val.items)) {
            for (const raw of val.items as SheetsEventItem[]) {
              const delta = eventSnapshot[raw.eventId];
              if (delta) raw.views = (Number(raw.views) || 0) + delta;
            }
          }
          if (val.item && typeof val.item === 'object') {
            const single = val.item as SheetsEventItem;
            const delta = eventSnapshot[single.eventId];
            if (delta) single.views = (Number(single.views) || 0) + delta;
          }
        }
      }
      this.persistSnapshotToDisk();
      this.telemetry.batchedViewFlushesToday += 1;
      this.telemetry.lastFlushAt = new Date().toISOString();
      return { flushed: true, count: newsKeys.length + eventKeys.length };
    } catch {
      // Restore deltas so no view count is ever lost
      for (const [k, v] of Object.entries(newsSnapshot)) {
        this.pendingNewsViews.set(k, (this.pendingNewsViews.get(k) || 0) + v);
      }
      for (const [k, v] of Object.entries(eventSnapshot)) {
        this.pendingEventViews.set(k, (this.pendingEventViews.get(k) || 0) + v);
      }
      this.persistPendingViewsToDisk();
      return { flushed: false, count: 0 };
    } finally {
      this.isFlushingViews = false;
    }
  }

  public async lookupShareMetadata(
    collectionName: 'articles' | 'events',
    docId: string
  ): Promise<{
    id: string;
    titleKannada: string;
    summaryKannada: string;
    category: string;
    location: string;
    imageKey: string;
    imageUrl: string;
    watermarkApplied: boolean;
  } | null> {
    if (!this.isConfigured()) return null;
    try {
      if (collectionName === 'articles') {
        const { data } = await this.getCachedOrFetch<{ ok: boolean; item?: SheetsNewsItem }>(
          `news:id:${docId}`,
          CACHE_TTL_MS,
          () => this.callAppsScriptGet('getNewsById', { newsId: docId })
        );
        if (data?.ok && data.item) {
          return {
            id: data.item.newsId,
            titleKannada: data.item.title,
            summaryKannada: data.item.description,
            category: data.item.category || 'Local',
            location: data.item.location || 'ಕೊಪ್ಪ',
            imageKey: data.item.imageKey || 'none',
            imageUrl: data.item.imageUrl || '',
            watermarkApplied: Boolean(data.item.watermarkApplied && data.item.imageUrl),
          };
        }
      } else {
        const { data } = await this.getCachedOrFetch<{ ok: boolean; item?: SheetsEventItem }>(
          `events:id:${docId}`,
          CACHE_TTL_MS,
          () => this.callAppsScriptGet('getEventById', { eventId: docId })
        );
        if (data?.ok && data.item) {
          return {
            id: data.item.eventId,
            titleKannada: data.item.titleKannada,
            summaryKannada: data.item.descriptionKannada,
            category: 'Entertainment',
            location: data.item.location || 'ಕೊಪ್ಪ',
            imageKey: 'entertainment-stage',
            imageUrl: data.item.imageUrl || '',
            watermarkApplied: Boolean(data.item.watermarkApplied && data.item.imageUrl),
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  public setExternalAdminVerifier(verifier: ExternalAdminVerifier): void {
    this.externalAdminVerifier = verifier;
  }

  public setEventHook(hook: StorageEventHook): void {
    this.eventHook = hook;
  }

  private emitEvent(event: Parameters<StorageEventHook>[0]): void {
    if (!this.eventHook) return;
    try {
      this.eventHook(event);
    } catch {
      // Non-fatal
    }
  }

  public async verifyFirebaseTokenRaw(idToken: string): Promise<{
    uid: string;
    email: string;
    emailVerified: boolean;
    displayName: string;
  } | null> {
    const apiKey = readFirebasePublicApiKey();
    if (!apiKey || !idToken) return null;
    try {
      const lookupResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!lookupResp.ok) return null;
      const json = (await lookupResp.json()) as {
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

  public async verifyAdminToken(req: AdminRequest, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ error: 'Administrator authentication token required.' });
      return;
    }

    // 1. Check Admin 2.0 session verifier first (handles cn2.* session tokens & RBAC accounts)
    if (this.externalAdminVerifier) {
      try {
        const externalAdmin = await this.externalAdminVerifier(idToken, req);
        if (externalAdmin) {
          req.verifiedAdmin = externalAdmin;
          next();
          return;
        }
        // If it was explicitly a cn2.* token and failed verification, reject immediately
        if (idToken.startsWith('cn2.')) {
          res.status(401).json({ error: 'Invalid or expired Admin 2.0 session. Please sign in again.' });
          return;
        }
      } catch {
        if (idToken.startsWith('cn2.')) {
          res.status(401).json({ error: 'Unable to verify Admin 2.0 session.' });
          return;
        }
      }
    }

    const tokenHash = crypto.createHash('sha256').update(idToken).digest('hex');
    const cached = this.verifiedTokenCache.get(tokenHash);
    if (cached && Date.now() < cached.expiresAt) {
      req.verifiedAdmin = cached.admin;
      next();
      return;
    }

    const apiKey = readFirebasePublicApiKey();
    if (!apiKey) {
      res.status(500).json({ error: 'Authentication verification configuration missing.' });
      return;
    }

    try {
      const account = await this.verifyFirebaseTokenRaw(idToken);
      if (!account) {
        res.status(401).json({ error: 'Invalid or expired admin session. Please sign in again.' });
        return;
      }

      if (!account.uid || !account.email || !account.emailVerified) {
        res.status(403).json({ error: 'Verified administrator email is required.' });
        return;
      }

      // Check owner allowlist (or configured extra admins in env)
      const extraAdmins = (process.env.EXTRA_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const isAllowed = OWNER_ADMIN_EMAILS.has(account.email) || extraAdmins.includes(account.email);

      if (!isAllowed) {
        res.status(403).json({ error: `Account ${account.email} is not authorized for administrative storage controls.` });
        return;
      }

      const adminUser: VerifiedAdminUser = {
        uid: account.uid,
        email: account.email,
        displayName: account.displayName || account.email,
      };
      this.verifiedTokenCache.set(tokenHash, {
        admin: adminUser,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      req.verifiedAdmin = adminUser;
      next();
    } catch {
      res.status(500).json({ error: 'Unable to verify administrator session right now.' });
    }
  }

  public getCachedDriveFileCount(): number {
    try {
      return fs.readdirSync(this.driveCacheDir).filter((f) => !f.endsWith('.meta.json')).length;
    } catch {
      return 0;
    }
  }

  public getDriveCacheStats(): { fileCount: number; totalBytes: number } {
    try {
      const files = fs.readdirSync(this.driveCacheDir).filter((f) => !f.endsWith('.meta.json'));
      let totalBytes = 0;
      for (const f of files) {
        try {
          totalBytes += fs.statSync(path.join(this.driveCacheDir, f)).size;
        } catch {
          // Ignore individual stat error
        }
      }
      return { fileCount: files.length, totalBytes };
    } catch {
      return { fileCount: 0, totalBytes: 0 };
    }
  }

  public getTelemetrySnapshot() {
    this.rollDayIfNeeded();
    const totalCacheOps = this.telemetry.cacheHitsToday + this.telemetry.cacheMissesToday;
    return {
      ...this.telemetry,
      pendingViewsCount: this.getPendingViewsCount(),
      cachedDriveImagesCount: this.getCachedDriveFileCount(),
      cacheHitRatePct: totalCacheOps > 0 ? Math.round((this.telemetry.cacheHitsToday / totalCacheOps) * 100) : 100,
      dailyFreeLimitCalls: 20000,
      configured: this.isConfigured(),
    };
  }

  public invalidateAllCaches(): void {
    this.invalidateReadCaches();
  }

  public async getAllNewsForAdmin(forceRefresh = false): Promise<SheetsNewsItem[]> {
    if (!this.isConfigured()) return [];
    const { data } = await this.getCachedOrFetch<{
      ok: boolean;
      items?: SheetsNewsItem[];
      total?: number;
    }>(
      'news:list:admin:all',
      CACHE_TTL_MS,
      async () => {
        const collected: SheetsNewsItem[] = [];
        let page = 1;
        while (page <= 10) {
          const res = await this.callAppsScriptGet<{
            ok: boolean;
            items?: SheetsNewsItem[];
            hasMore?: boolean;
          }>('getPublishedNews', { page, limit: 50 });
          const batch = Array.isArray(res.items) ? res.items : [];
          collected.push(...batch);
          if (!res.hasMore || batch.length === 0) break;
          page += 1;
        }
        return { ok: true, items: collected, total: collected.length };
      },
      forceRefresh
    );
    const nowMs = Date.now();
    return (data?.items || []).map((item) => ({
      ...this.sanitizeWithLeadOverride(item, nowMs),
      views: this.resolveEffectiveNewsViews(item.newsId, item.views),
    }));
  }

  public async getAllEventsForAdmin(forceRefresh = false): Promise<SheetsEventItem[]> {
    if (!this.isConfigured()) return [];
    const { data } = await this.getCachedOrFetch<{
      ok: boolean;
      items?: SheetsEventItem[];
    }>(
      'events:list:admin:all',
      CACHE_TTL_MS,
      () => this.callAppsScriptGet('getEvents', { page: 1, limit: 100 }),
      forceRefresh
    );
    return (data?.items || []).map((ev) => ({
      ...sanitizeSheetsEventItem(ev),
      views: (Number(ev.views) || 0) + (this.pendingEventViews.get(ev.eventId) || 0),
    }));
  }

  public async createNewsFromServer(
    rawPayload: Record<string, unknown>,
    actorEmail: string
  ): Promise<{ ok: boolean; newsId?: string; item?: SheetsNewsItem; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Google Sheets backend is not configured.' };
    }
    const body = { ...rawPayload };
    const desiredFeatured = parseSheetBoolean(body.featured !== undefined ? body.featured : body.isFeatured);
    const desiredFeaturedUntil = desiredFeatured ? normalizeFeaturedUntil(body.featuredUntil) : undefined;
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

    const result = await this.callAppsScriptPost<{
      ok?: boolean;
      newsId?: string;
      item?: SheetsNewsItem;
      error?: string;
    }>('createNews', { data: body }, actorEmail);

    if (result?.ok) {
      const createdId = result.newsId || result.item?.newsId;
      if (createdId) {
        this.setLeadOverride(createdId, desiredFeatured, desiredFeaturedUntil, actorEmail);
      }
      this.invalidateReadCaches();
      this.emitEvent({
        type: 'news_created',
        actorEmail,
        entityId: createdId,
        details: String(body.title || result.newsId || 'Article published'),
      });
    }
    return {
      ok: Boolean(result?.ok),
      newsId: result?.newsId || result?.item?.newsId,
      item: result?.item ? this.sanitizeWithLeadOverride(result.item, Date.now()) : undefined,
      error: result?.error,
    };
  }

  public async deleteNewsFromServer(
    newsId: string,
    actorEmail: string,
    permanent = false
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Google Sheets backend is not configured.' };
    }
    const result = await this.callAppsScriptPost<{ ok?: boolean; error?: string }>(
      'deleteNews',
      { newsId, permanent },
      actorEmail
    );
    if (result?.ok) {
      this.clearLeadOverride(newsId);
      this.invalidateReadCaches();
      this.emitEvent({
        type: 'news_deleted',
        actorEmail,
        entityId: newsId,
        details: permanent ? `Permanently deleted ${newsId}` : `Archived/removed ${newsId}`,
      });
    }
    return { ok: Boolean(result?.ok), error: result?.error };
  }

  public async triggerBackupFromServer(actorEmail: string): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Google Sheets backend is not configured.' };
    }
    await this.flushPendingViews();
    const res = await this.callAppsScriptPost<Record<string, unknown>>('createBackup', {}, actorEmail);
    if (res?.ok) {
      this.emitEvent({
        type: 'backup_created',
        actorEmail,
        details: `Backup completed (${String(res.fileName || 'Google Drive snapshot')})`,
      });
    }
    return res;
  }

  public async getAdminStatsFromServer(actorEmail?: string): Promise<Record<string, unknown> | null> {
    if (!this.isConfigured()) return null;
    try {
      const { data } = await this.getCachedOrFetch<Record<string, unknown>>(
        'admin:stats:summary',
        3 * 60 * 1000,
        () => this.callAppsScriptPost('getAdminStats', {}, actorEmail)
      );
      return data;
    } catch {
      return null;
    }
  }

  public async pingAppsScript(actorEmail?: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    if (!this.isConfigured()) {
      return { ok: false, latencyMs: 0, error: 'Apps Script not configured' };
    }
    try {
      await this.callAppsScriptPost('getAdminStats', {}, actorEmail);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Ping failed',
      };
    }
  }

  public mountRoutes(app: Express): void {
    const verifyAdmin = (req: AdminRequest, res: Response, next: NextFunction) => {
      void this.verifyAdminToken(req, res, next);
    };

    // 1. Public storage backend mode & health status (no secrets exposed)
    app.get('/api/storage/status', (_req, res) => {
      this.rollDayIfNeeded();
      res.json({
        mode: this.isConfigured() ? 'google_sheets' : 'firebase_fallback',
        configured: this.isConfigured(),
        cacheTtlMinutes: Math.round(CACHE_TTL_MS / 60000),
      });
    });

    // 2. Public paginated news feed (5–10 min server cache, never hits Sheets per visitor)
    app.get('/api/storage/news', async (req, res) => {
      if (!this.isConfigured()) {
        res.status(503).json({ ok: false, configured: false, error: 'Google Sheets backend not configured yet.' });
        return;
      }
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
      const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const featured = req.query.featured === 'true';
      const force = req.query.refresh === '1';

      const cacheKey = `news:list:${page}:${limit}:${category}:${location}:${q}:${featured}`;
      try {
        const { data, fromCache, stale } = await this.getCachedOrFetch<{
          ok: boolean;
          items: SheetsNewsItem[];
          total: number;
          page: number;
          limit: number;
          hasMore: boolean;
        }>(
          cacheKey,
          CACHE_TTL_MS,
          () =>
            this.callAppsScriptGet('getPublishedNews', {
              page,
              limit,
              category: category || undefined,
              location: location || undefined,
              q: q || undefined,
              featured: featured ? 'true' : undefined,
            }),
          force
        );

        // Merge any pending un-flushed view counts cleanly into response, normalize Sheet dates,
        // and evaluate Lead Story timers live against Date.now() even when served from RAM cache.
        const nowMs = Date.now();
        let itemsWithLiveViews = (data.items || []).map((item) => ({
          ...this.sanitizeWithLeadOverride(item, nowMs),
          views: this.resolveEffectiveNewsViews(item.newsId, item.views),
        }));

        if (featured) {
          itemsWithLiveViews = itemsWithLiveViews.filter((item) => item.featured);
        }

        itemsWithLiveViews.sort((a, b) => {
          const featDiff = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
          if (featDiff !== 0) return featDiff;
          return (Number(b.publishedTimestamp) || 0) - (Number(a.publishedTimestamp) || 0);
        });

        // Node server already caches Sheets responses for 7 minutes; avoid stale browser HTTP cache after admin edits
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.json({
          ...data,
          items: itemsWithLiveViews,
          fromCache,
          stale: Boolean(stale),
        });
      } catch (err) {
        res.status(502).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to load news from Google Sheets.',
        });
      }
    });

    // 3. Public single news article by newsId
    app.get('/api/storage/news/:newsId', async (req, res) => {
      if (!this.isConfigured()) {
        res.status(503).json({ ok: false, configured: false, error: 'Google Sheets backend not configured yet.' });
        return;
      }
      const newsId = String(req.params.newsId || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(newsId)) {
        res.status(400).json({ ok: false, error: 'Invalid newsId.' });
        return;
      }
      try {
        const { data, fromCache } = await this.getCachedOrFetch<{ ok: boolean; item?: SheetsNewsItem }>(
          `news:id:${newsId}`,
          CACHE_TTL_MS,
          () => this.callAppsScriptGet('getNewsById', { newsId })
        );
        if (!data?.ok || !data.item) {
          res.status(404).json({ ok: false, error: 'Article not found.' });
          return;
        }
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.json({
          ok: true,
          item: {
            ...this.sanitizeWithLeadOverride(data.item, Date.now()),
            views: this.resolveEffectiveNewsViews(newsId, data.item.views),
          },
          fromCache,
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load article.' });
      }
    });

    // 4. Public paginated Events
    app.get('/api/storage/events', async (req, res) => {
      if (!this.isConfigured()) {
        res.status(503).json({ ok: false, configured: false, error: 'Google Sheets backend not configured yet.' });
        return;
      }
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const force = req.query.refresh === '1';

      try {
        const { data, fromCache } = await this.getCachedOrFetch<{
          ok: boolean;
          items: SheetsEventItem[];
          total: number;
          page: number;
          limit: number;
          hasMore: boolean;
        }>(
          `events:list:${page}:${limit}`,
          CACHE_TTL_MS,
          () => this.callAppsScriptGet('getEvents', { page, limit }),
          force
        );
        const itemsWithLiveViews = (data.items || []).map((ev) => ({
          ...sanitizeSheetsEventItem(ev),
          views: (Number(ev.views) || 0) + (this.pendingEventViews.get(ev.eventId) || 0),
        }));
        res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
        res.json({ ...data, items: itemsWithLiveViews, fromCache });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load events.' });
      }
    });

    app.get('/api/storage/events/:eventId', async (req, res) => {
      if (!this.isConfigured()) {
        res.status(503).json({ ok: false, configured: false, error: 'Google Sheets backend not configured yet.' });
        return;
      }
      const eventId = String(req.params.eventId || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(eventId)) {
        res.status(400).json({ ok: false, error: 'Invalid eventId.' });
        return;
      }
      try {
        const { data } = await this.getCachedOrFetch<{ ok: boolean; item?: SheetsEventItem }>(
          `events:id:${eventId}`,
          CACHE_TTL_MS,
          () => this.callAppsScriptGet('getEventById', { eventId })
        );
        if (!data?.ok || !data.item) {
          res.status(404).json({ ok: false, error: 'Event not found.' });
          return;
        }
        res.json({
          ok: true,
          item: {
            ...sanitizeSheetsEventItem(data.item),
            views: (Number(data.item.views) || 0) + (this.pendingEventViews.get(eventId) || 0),
          },
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load event.' });
      }
    });

    // 5. Public view counter (persists every genuine view on server & aggregates Sheets batch flushes)
    const handleViewRecord = (req: Request, res: Response, forcedId?: string) => {
      const entityType = req.body?.type === 'event' ? 'event' : 'article';
      const rawId = forcedId ?? (typeof req.body?.id === 'string' ? req.body.id : '');
      const id = rawId.trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        res.status(400).json({ ok: false, error: 'Invalid or missing id' });
        return;
      }
      const baselineRaw = Number(req.body?.baselineViews);
      const result = this.recordView(entityType, id, undefined, {
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        category: typeof req.body?.category === 'string' ? req.body.category : undefined,
        location: typeof req.body?.location === 'string' ? req.body.location : undefined,
        publishedDate: typeof req.body?.publishedDate === 'string' ? req.body.publishedDate : undefined,
        baselineViews: Number.isFinite(baselineRaw) && baselineRaw >= 0 ? Math.floor(baselineRaw) : undefined,
      });
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      res.status(200).json({
        ok: result.ok,
        aggregated: true,
        type: entityType,
        id,
        views: result.views,
        lastViewedAt: result.lastViewedAt,
      });
    };

    app.post('/api/storage/views', (req, res) => {
      handleViewRecord(req, res);
    });

    app.post('/api/articles/:id/view', (req, res) => {
      handleViewRecord(req, res, String(req.params.id || ''));
    });

    // 6. Disk-Cached Google Drive Image Proxy (100% Google Drive — no external image CDN)
    app.get('/api/media/drive/:fileId', async (req, res) => {
      const fileId = String(req.params.fileId || '').trim();
      if (!/^[a-zA-Z0-9_-]{10,120}$/.test(fileId)) {
        res.status(400).end();
        return;
      }

      const sizeVariant = req.query.size === 'thumb' ? 'thumb' : 'full';
      const cacheKey = sizeVariant === 'thumb' ? `${fileId}_thumb` : fileId;

      this.rollDayIfNeeded();
      const cacheFile = path.join(this.driveCacheDir, cacheKey);
      const metaFile = path.join(this.driveCacheDir, `${cacheKey}.meta.json`);

      try {
        if (fs.existsSync(cacheFile) && fs.existsSync(metaFile)) {
          const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { contentType?: string };
          this.telemetry.driveProxyCacheHitsToday += 1;
          res.setHeader('Content-Type', meta.contentType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
          res.setHeader('X-CoffeeNadu-Cache', 'HIT');
          res.sendFile(cacheFile);
          return;
        }
      } catch {
        // Proceed to fetch from Google Drive
      }

      // Fetch once directly from Google Drive and cache on disk so thousands of readers
      // never hammer Google Drive directly.
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
            signal: AbortSignal.timeout(10000),
          });
          const ct = upstream.headers.get('content-type') || '';
          if (upstream.ok && ct.startsWith('image/')) {
            const buf = Buffer.from(await upstream.arrayBuffer());
            if (buf.length > 0 && buf.length < 8 * 1024 * 1024) {
              this.telemetry.driveProxyFetchesToday += 1;
              try {
                fs.writeFileSync(cacheFile, buf);
                fs.writeFileSync(metaFile, JSON.stringify({ contentType: ct, cachedAt: Date.now() }), 'utf8');
              } catch {
                // Non-fatal
              }
              res.setHeader('Content-Type', ct);
              res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
              res.setHeader('X-CoffeeNadu-Cache', 'MISS');
              res.send(buf);
              return;
            }
          }
        } catch {
          // Try next official Google Drive endpoint
        }
      }

      res.status(404).end();
    });

    // =========================================================================
    // PROTECTED ADMIN ROUTES (Verified Admin ID Token -> Server-Only Secret)
    // =========================================================================

    app.get('/api/storage/admin/health', verifyAdmin, async (_req, res) => {
      this.rollDayIfNeeded();
      const baseQuota = {
        ...this.telemetry,
        pendingViewsCount: this.getPendingViewsCount(),
        cachedDriveImagesCount: this.getCachedDriveFileCount(),
        cacheHitRatePct:
          this.telemetry.cacheHitsToday + this.telemetry.cacheMissesToday > 0
            ? Math.round(
                (this.telemetry.cacheHitsToday /
                  (this.telemetry.cacheHitsToday + this.telemetry.cacheMissesToday)) *
                  100
              )
            : 100,
        dailyFreeLimitCalls: 20000,
      };

      if (!this.isConfigured()) {
        res.json({
          ok: true,
          configured: false,
          status: 'not_configured',
          message:
            'Deploy apps-script/Code.gs and add APPS_SCRIPT_WEBAPP_URL + APPS_SCRIPT_API_SECRET in Secrets to activate Google Sheets & Drive storage.',
          quota: baseQuota,
        });
        return;
      }

      try {
        const stats = await this.callAppsScriptPost<Record<string, unknown>>(
          'getAdminStats',
          {},
          (_req as AdminRequest).verifiedAdmin?.email
        );
        res.json({
          ...stats,
          configured: true,
          quota: baseQuota,
        });
      } catch (err) {
        res.status(502).json({
          ok: false,
          configured: true,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unable to reach Apps Script Web App.',
          quota: baseQuota,
        });
      }
    });

    app.post('/api/storage/admin/news', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
        const rawCustomSlug =
          typeof body.newsId === 'string' && body.newsId.trim()
            ? body.newsId.trim()
            : typeof body.customSlug === 'string' && body.customSlug.trim()
            ? body.customSlug.trim()
            : '';

        if (rawCustomSlug) {
          const validation = validateCustomEnglishSlugInput(rawCustomSlug);
          if (validation.error || !validation.slug) {
            res.status(400).json({
              ok: false,
              error: validation.error || 'Invalid custom English URL.',
            });
            return;
          }

          // Collision check works even against an already-deployed Apps Script Web App
          try {
            const existing = await this.callAppsScriptGet<{ ok?: boolean; item?: SheetsNewsItem }>(
              'getNewsById',
              { newsId: validation.slug }
            );
            if (existing?.ok && existing.item) {
              res.status(409).json({
                ok: false,
                error: `The custom English URL "${validation.slug}" is already used by another article. Please choose a different English URL.`,
              });
              return;
            }
          } catch {
            // If lookup fails transiently, continue and let Apps Script handle create
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

        const result = await this.callAppsScriptPost<{
          ok?: boolean;
          newsId?: string;
          item?: SheetsNewsItem;
          deduplicated?: boolean;
          error?: string;
        }>('createNews', { data: body }, req.verifiedAdmin?.email);

        if (!result?.ok) {
          res.status(400).json({ ok: false, error: result?.error || 'Create news failed.' });
          return;
        }

        if (body.isCustomSlug && result.deduplicated) {
          res.status(409).json({
            ok: false,
            error: `The custom English URL "${body.newsId}" is already used by another article. Please choose a different English URL.`,
          });
          return;
        }

        const createdId = result.newsId || result.item?.newsId;
        if (createdId) {
          this.setLeadOverride(createdId, desiredFeatured, desiredFeaturedUntil, req.verifiedAdmin?.email);
        }
        this.invalidateReadCaches();
        this.emitEvent({
          type: 'news_created',
          actorEmail: req.verifiedAdmin?.email,
          entityId: createdId,
          details: String(body.title || result.newsId || 'Article published'),
        });
        res.status(201).json({
          ...result,
          item: result.item ? this.sanitizeWithLeadOverride(result.item, Date.now()) : undefined,
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Create news failed.' });
      }
    });

    app.put('/api/storage/admin/news/:newsId', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const cleanNewsId = String(req.params.newsId || '').trim();
        const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};

        // Guard against oversized base64 imageUrl overflowing Google Sheets 50,000-char cell limit
        // when the article already has a Google Drive file ID.
        if (
          typeof body.imageUrl === 'string' &&
          body.imageUrl.startsWith('data:image/') &&
          body.imageUrl.length > 45000 &&
          typeof body.imageDriveId === 'string' &&
          body.imageDriveId.trim()
        ) {
          body.imageUrl = `/api/media/drive/${encodeURIComponent(body.imageDriveId.trim())}`;
        }

        let hasLeadUpdate = false;
        let desiredFeatured = false;
        let desiredFeaturedUntil: number | undefined;
        if (
          body.featured !== undefined ||
          body.isFeatured !== undefined ||
          body.featuredUntil !== undefined
        ) {
          hasLeadUpdate = true;
          desiredFeatured = parseSheetBoolean(
            body.featured !== undefined ? body.featured : body.isFeatured
          );
          desiredFeaturedUntil = desiredFeatured
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

        const result = await this.callAppsScriptPost<{
          ok?: boolean;
          item?: SheetsNewsItem;
          error?: string;
        }>(
          'updateNews',
          { newsId: cleanNewsId, data: body },
          req.verifiedAdmin?.email
        );

        if (!result?.ok) {
          res.status(400).json({ ok: false, error: result?.error || 'Update news failed.' });
          return;
        }

        // Persist authoritative Lead Story state so even older deployed Apps Script versions
        // or duplicate/cached sheet rows can NEVER revert a Lead Story removal after cache TTL.
        if (hasLeadUpdate) {
          this.setLeadOverride(cleanNewsId, desiredFeatured, desiredFeaturedUntil, req.verifiedAdmin?.email);
        }

        this.invalidateReadCaches();
        this.emitEvent({
          type: 'news_updated',
          actorEmail: req.verifiedAdmin?.email,
          entityId: cleanNewsId,
          details: String(body.title || cleanNewsId || 'Article updated'),
        });
        res.json({
          ...result,
          item: result?.item ? this.sanitizeWithLeadOverride(result.item, Date.now()) : undefined,
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Update news failed.' });
      }
    });

    // Dedicated 1-click Lead Story pin/unpin & timer endpoint (never touches images or body)
    app.patch('/api/storage/admin/news/:newsId/lead', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const cleanNewsId = String(req.params.newsId || '').trim();
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanNewsId)) {
          res.status(400).json({ ok: false, error: 'Invalid newsId.' });
          return;
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
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

        // 1. Immediately persist authoritative Lead Story state on the server
        this.setLeadOverride(cleanNewsId, desiredFeatured, desiredFeaturedUntil, req.verifiedAdmin?.email);

        // 2. Also sync to Google Sheets via Apps Script (best-effort if older deployment)
        let updatedItem: SheetsNewsItem | undefined;
        try {
          const result = await this.callAppsScriptPost<{
            ok?: boolean;
            item?: SheetsNewsItem;
            error?: string;
          }>(
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
            req.verifiedAdmin?.email
          );
          if (result?.ok && result.item) {
            updatedItem = this.sanitizeWithLeadOverride(result.item, Date.now());
          }
        } catch {
          // Authoritative server override already persisted; Sheets will still reflect cleanly
        }

        this.invalidateReadCaches();
        this.emitEvent({
          type: 'news_updated',
          actorEmail: req.verifiedAdmin?.email,
          entityId: cleanNewsId,
          details: desiredFeatured ? `Pinned to Lead Story: ${cleanNewsId}` : `Removed from Lead Story: ${cleanNewsId}`,
        });

        res.json({
          ok: true,
          newsId: cleanNewsId,
          featured: desiredFeatured,
          featuredUntil: desiredFeaturedUntil,
          tags: serializedTags,
          item: updatedItem,
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Unable to update Lead Story state.' });
      }
    });

    app.delete('/api/storage/admin/news/:newsId', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const cleanNewsId = String(req.params.newsId || '').trim();
        const result = await this.callAppsScriptPost(
          'deleteNews',
          { newsId: cleanNewsId, permanent: req.query.permanent === '1' },
          req.verifiedAdmin?.email
        );
        this.clearLeadOverride(cleanNewsId);
        this.invalidateReadCaches();
        this.emitEvent({
          type: 'news_deleted',
          actorEmail: req.verifiedAdmin?.email,
          entityId: String(req.params.newsId || ''),
          details: req.query.permanent === '1' ? 'Article permanently deleted' : 'Article deleted',
        });
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Delete news failed.' });
      }
    });

    app.post('/api/storage/admin/events', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const result = await this.callAppsScriptPost(
          'createEvent',
          { data: req.body },
          req.verifiedAdmin?.email
        );
        this.invalidateReadCaches();
        res.status(201).json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Create event failed.' });
      }
    });

    app.put('/api/storage/admin/events/:eventId', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const result = await this.callAppsScriptPost(
          'updateEvent',
          { eventId: req.params.eventId, data: req.body },
          req.verifiedAdmin?.email
        );
        this.invalidateReadCaches();
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Update event failed.' });
      }
    });

    app.delete('/api/storage/admin/events/:eventId', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const result = await this.callAppsScriptPost(
          'deleteEvent',
          { eventId: req.params.eventId },
          req.verifiedAdmin?.email
        );
        this.invalidateReadCaches();
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Delete event failed.' });
      }
    });

    app.post('/api/storage/admin/upload-image', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const uploaded = await this.callAppsScriptPost<{
          ok: boolean;
          fileId?: string;
          thumbFileId?: string;
          deduplicated?: boolean;
          error?: string;
        }>(
          'uploadImage',
          {
            base64Data: req.body?.base64Data,
            thumbBase64: req.body?.thumbBase64,
            mimeType: req.body?.mimeType || 'image/jpeg',
            fileName: req.body?.fileName || `coffeenadu-${Date.now()}.jpg`,
          },
          req.verifiedAdmin?.email
        );

        if (!uploaded.ok || !uploaded.fileId) {
          res.status(502).json({ ok: false, error: uploaded.error || 'Drive image upload failed.' });
          return;
        }

        // Warm local Drive proxy disk cache immediately so first visitor gets instant HIT!
        try {
          const cleanB64 = String(req.body?.base64Data || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
          if (cleanB64) {
            fs.writeFileSync(path.join(this.driveCacheDir, uploaded.fileId), Buffer.from(cleanB64, 'base64'));
            fs.writeFileSync(
              path.join(this.driveCacheDir, `${uploaded.fileId}.meta.json`),
              JSON.stringify({ contentType: req.body?.mimeType || 'image/jpeg', cachedAt: Date.now() }),
              'utf8'
            );
          }
          const cleanThumb = String(req.body?.thumbBase64 || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
          if (cleanThumb && uploaded.thumbFileId && uploaded.thumbFileId !== uploaded.fileId) {
            fs.writeFileSync(path.join(this.driveCacheDir, uploaded.thumbFileId), Buffer.from(cleanThumb, 'base64'));
            fs.writeFileSync(
              path.join(this.driveCacheDir, `${uploaded.thumbFileId}.meta.json`),
              JSON.stringify({ contentType: 'image/jpeg', cachedAt: Date.now() }),
              'utf8'
            );
          }
        } catch {
          // Non-fatal
        }

        const fullUrls = buildGoogleDriveImageUrls(uploaded.fileId);
        const resolvedThumbId = uploaded.thumbFileId || uploaded.fileId;
        const thumbUrls = buildGoogleDriveImageUrls(resolvedThumbId);

        this.emitEvent({
          type: 'image_uploaded',
          actorEmail: req.verifiedAdmin?.email,
          entityId: uploaded.fileId,
          details: `${String(req.body?.fileName || 'photo.jpg')} uploaded to Google Drive`,
        });

        res.status(201).json({
          ok: true,
          fileId: uploaded.fileId,
          thumbFileId: resolvedThumbId,
          imageUrl: fullUrls.proxyUrl,
          imageThumbUrl: thumbUrls.proxyUrl,
          driveUrl: fullUrls.driveThumbnailUrl,
          driveViewUrl: fullUrls.driveViewUrl,
          deduplicated: Boolean(uploaded.deduplicated),
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Image upload failed.' });
      }
    });

    app.post('/api/storage/admin/flush-views', verifyAdmin, async (_req, res) => {
      const result = await this.flushPendingViews();
      res.json({ ok: true, ...result });
    });

    app.post('/api/storage/admin/backup-now', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        await this.flushPendingViews();
        const result = await this.callAppsScriptPost('createBackup', {}, req.verifiedAdmin?.email);
        this.emitEvent({
          type: 'backup_created',
          actorEmail: req.verifiedAdmin?.email,
          details: 'Manual Google Drive backup completed',
        });
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Backup failed.' });
      }
    });

    app.get('/api/storage/admin/backups', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const result = await this.callAppsScriptPost('listBackups', {}, req.verifiedAdmin?.email);
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Unable to list backups.' });
      }
    });

    app.post('/api/storage/admin/backups/preview', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const result = await this.callAppsScriptPost(
          'previewBackup',
          { fileId: req.body?.fileId },
          req.verifiedAdmin?.email
        );
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Unable to preview backup.' });
      }
    });

    app.post('/api/storage/admin/backups/restore', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const result = await this.callAppsScriptPost(
          'restoreBackup',
          {
            fileId: req.body?.fileId,
            mode: req.body?.mode || 'deleted_only',
            selectedIds: Array.isArray(req.body?.selectedIds) ? req.body.selectedIds : [],
          },
          req.verifiedAdmin?.email
        );
        this.invalidateReadCaches();
        this.emitEvent({
          type: 'backup_restored',
          actorEmail: req.verifiedAdmin?.email,
          entityId: String(req.body?.fileId || ''),
          details: `Backup restored (mode: ${String(req.body?.mode || 'deleted_only')})`,
        });
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Restore failed.' });
      }
    });

    app.get('/api/storage/admin/export', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const result = await this.callAppsScriptPost('exportAll', {}, req.verifiedAdmin?.email);
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Export failed.' });
      }
    });

    app.post('/api/storage/admin/migrate-batch', verifyAdmin, async (req: AdminRequest, res) => {
      try {
        const incomingArticles = Array.isArray(req.body?.articles) ? req.body.articles : [];
        const incomingEvents = Array.isArray(req.body?.events) ? req.body.events : [];
        const result = await this.callAppsScriptPost<Record<string, unknown>>(
          'migrateBatch',
          {
            articles: incomingArticles,
            events: incomingEvents,
            categories: Array.isArray(req.body?.categories) ? req.body.categories : [],
          },
          req.verifiedAdmin?.email
        );

        // Backwards-compatible reconciliation when an earlier deployed Code.gs doesn't return ID arrays
        if (result?.ok) {
          const hasNewsIdArrays =
            Array.isArray(result.migratedNewsIds) || Array.isArray(result.duplicateNewsIds);
          if (!hasNewsIdArrays && incomingArticles.length > 0) {
            const importedN = Number(result.importedNews) || 0;
            const skippedN = Number(result.skippedNews) || 0;
            const ids = incomingArticles
              .map((a: { id?: string; newsId?: string }) => String(a?.newsId || a?.id || '').trim())
              .filter(Boolean);
            if (importedN + skippedN >= ids.length) {
              result.migratedNewsIds = importedN > 0 ? ids : [];
              result.duplicateNewsIds = importedN === 0 && skippedN > 0 ? ids : [];
              result.failedNews = [];
            }
          }
          const hasEventIdArrays =
            Array.isArray(result.migratedEventIds) || Array.isArray(result.duplicateEventIds);
          if (!hasEventIdArrays && incomingEvents.length > 0) {
            const importedE = Number(result.importedEvents) || 0;
            const skippedE = Number(result.skippedEvents) || 0;
            const ids = incomingEvents
              .map((e: { id?: string; eventId?: string }) => String(e?.eventId || e?.id || '').trim())
              .filter(Boolean);
            if (importedE + skippedE >= ids.length) {
              result.migratedEventIds = importedE > 0 ? ids : [];
              result.duplicateEventIds = importedE === 0 && skippedE > 0 ? ids : [];
              result.failedEvents = [];
            }
          }
        }

        this.invalidateReadCaches();
        res.json(result);
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Migration batch failed.' });
      }
    });

    app.post('/api/storage/admin/verify-migration', verifyAdmin, async (req: AdminRequest, res) => {
      const expectedNews = Array.isArray(req.body?.expectedNews)
        ? (req.body.expectedNews as Array<{
            id: string;
            title?: string;
            category?: string;
            publishedDate?: string;
            hadBase64Image?: boolean;
            hadImageUrl?: boolean;
          }>)
        : [];
      const expectedEvents = Array.isArray(req.body?.expectedEvents)
        ? (req.body.expectedEvents as Array<{
            id: string;
            title?: string;
            eventDate?: string;
            hadBase64Image?: boolean;
            hadImageUrl?: boolean;
          }>)
        : [];
      const exportComplete = Boolean(req.body?.exportComplete);

      try {
        // First try Apps Script native verifyMigration (present in latest Code.gs)
        let nativeResult: Record<string, unknown> | null = null;
        try {
          const raw = await this.callAppsScriptPost<Record<string, unknown>>(
            'verifyMigration',
            { expectedNews, expectedEvents, exportComplete },
            req.verifiedAdmin?.email
          );
          if (raw && raw.ok === true) {
            nativeResult = raw;
          }
        } catch {
          // Fall through to server-side live verification via exportAll
        }

        if (nativeResult) {
          res.json(nativeResult);
          return;
        }

        // Seamless server-side live verification fallback via exportAll (works with ANY Code.gs version!)
        const exported = await this.callAppsScriptPost<{
          ok?: boolean;
          data?: {
            news?: SheetsNewsItem[];
            events?: SheetsEventItem[];
            categories?: unknown[];
          };
          error?: string;
        }>('exportAll', {}, req.verifiedAdmin?.email);

        if (!exported?.ok || !exported.data) {
          res.status(502).json({
            ok: false,
            error: exported?.error || 'Unable to read live Google Sheets rows for verification.',
          });
          return;
        }

        const liveNewsRows = Array.isArray(exported.data.news)
          ? exported.data.news.map(sanitizeSheetsNewsItem)
          : [];
        const liveEventsRows = Array.isArray(exported.data.events)
          ? exported.data.events.map(sanitizeSheetsEventItem)
          : [];
        const liveCategories = Array.isArray(exported.data.categories) ? exported.data.categories : [];

        const newsById = new Map<string, SheetsNewsItem>();
        for (const row of liveNewsRows) {
          if (row.newsId) newsById.set(String(row.newsId), row);
        }
        const eventsById = new Map<string, SheetsEventItem>();
        for (const row of liveEventsRows) {
          if (row.eventId) eventsById.set(String(row.eventId), row);
        }

        const verifiedNewsIds: string[] = [];
        const missingNewsIds: string[] = [];
        const mismatchedNews: Array<{ id: string; title: string; reason: string }> = [];

        for (const exp of expectedNews) {
          const id = String(exp?.id || '').trim();
          if (!id) continue;
          const row = newsById.get(id);
          if (!row) {
            missingNewsIds.push(id);
            continue;
          }
          const issues: string[] = [];
          if (!row.title) issues.push('Missing title');
          if (!Array.isArray(row.fullContent) || row.fullContent.length === 0) {
            issues.push('Empty body content');
          }
          if (exp.category && String(row.category || '').trim() !== String(exp.category).trim()) {
            issues.push(`Category mismatch (expected ${exp.category}, got ${row.category})`);
          }
          if (exp.publishedDate) {
            const expKey = normalizeCalendarDateKey(exp.publishedDate);
            const rowKey = normalizeCalendarDateKey(row.publishedDate);
            if (expKey && rowKey && expKey !== rowKey) {
              issues.push(`Publishing date mismatch (expected ${exp.publishedDate}, got ${row.publishedDate})`);
            }
          }
          if (exp.hadBase64Image) {
            if (!row.imageDriveId) {
              issues.push('Base64 photo was not uploaded to Google Drive');
            } else if (String(row.imageUrl || '').startsWith('data:image/')) {
              issues.push('Raw Base64 image still stored in Sheet instead of Drive reference');
            }
          } else if (exp.hadImageUrl && !row.imageUrl) {
            issues.push('Missing image reference');
          }

          if (issues.length > 0) {
            mismatchedNews.push({ id, title: row.title || exp.title || id, reason: issues.join('; ') });
          } else {
            verifiedNewsIds.push(id);
          }
        }

        const verifiedEventIds: string[] = [];
        const missingEventIds: string[] = [];
        const mismatchedEvents: Array<{ id: string; title: string; reason: string }> = [];

        for (const expEv of expectedEvents) {
          const evId = String(expEv?.id || '').trim();
          if (!evId) continue;
          const evRow = eventsById.get(evId);
          if (!evRow) {
            missingEventIds.push(evId);
            continue;
          }
          const evIssues: string[] = [];
          if (!evRow.titleKannada) evIssues.push('Missing event title');
          if (expEv.eventDate) {
            const expKey = normalizeCalendarDateKey(expEv.eventDate);
            const rowKey = normalizeCalendarDateKey(evRow.eventDate);
            if (expKey && rowKey && expKey !== rowKey) {
              evIssues.push(`Event date mismatch (expected ${expEv.eventDate}, got ${evRow.eventDate})`);
            }
          }
          if (expEv.hadBase64Image && !evRow.imageDriveId) {
            evIssues.push('Base64 event photo was not uploaded to Google Drive');
          } else if (expEv.hadImageUrl && !evRow.imageUrl) {
            evIssues.push('Missing event image reference');
          }

          if (evIssues.length > 0) {
            mismatchedEvents.push({
              id: evId,
              title: evRow.titleKannada || expEv.title || evId,
              reason: evIssues.join('; '),
            });
          } else {
            verifiedEventIds.push(evId);
          }
        }

        const totalExpected = expectedNews.length + expectedEvents.length;
        const allVerified =
          totalExpected > 0 &&
          missingNewsIds.length === 0 &&
          mismatchedNews.length === 0 &&
          missingEventIds.length === 0 &&
          mismatchedEvents.length === 0;
        const fullyVerifiedComplete = Boolean(exportComplete && allVerified);

        res.json({
          ok: true,
          allVerified,
          fullyVerifiedComplete,
          exportComplete,
          verifiedNewsIds,
          missingNewsIds,
          mismatchedNews,
          verifiedEventIds,
          missingEventIds,
          mismatchedEvents,
          totalNewsInSheet: liveNewsRows.length,
          totalEventsInSheet: liveEventsRows.length,
          totalCategoriesInSheet: liveCategories.length,
          verifiedAt: new Date().toISOString(),
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Migration verification failed.' });
      }
    });

    // Helper endpoint so admin can easily copy the Apps Script Code.gs from inside /admin
    app.get('/api/storage/admin/apps-script-source', verifyAdmin, (_req, res) => {
      try {
        const codePath = path.resolve(process.cwd(), 'apps-script/Code.gs');
        const code = fs.readFileSync(codePath, 'utf8');
        res.json({ ok: true, code });
      } catch {
        res.status(404).json({ ok: false, error: 'apps-script/Code.gs not found.' });
      }
    });
  }
}
