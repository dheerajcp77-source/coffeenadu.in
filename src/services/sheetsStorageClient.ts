import { auth } from '../firebase';
import type { ExtraNewsPhoto, ImageKey, NewsArticle, NewsCategory, ProgramEvent } from '../types/news';
import { unpackBodyAndExtraPhotos } from '../utils/extraPhotos';
import { resolveEffectiveLeadState } from '../utils/featuredLead';
import { getAdmin2MemoryToken } from './admin2Client';

export interface StorageStatusResponse {
  mode: 'google_sheets' | 'firebase_fallback';
  configured: boolean;
  cacheTtlMinutes: number;
}

export interface StorageQuotaTelemetry {
  dayKey: string;
  appsScriptCallsToday: number;
  cacheHitsToday: number;
  cacheMissesToday: number;
  batchedViewFlushesToday: number;
  totalViewsAggregatedToday: number;
  driveProxyFetchesToday: number;
  driveProxyCacheHitsToday: number;
  pendingViewsCount: number;
  cachedDriveImagesCount: number;
  cacheHitRatePct: number;
  dailyFreeLimitCalls: number;
  lastAppsScriptSuccessAt: string | null;
  lastError: string | null;
  lastFlushAt: string | null;
}

export interface AdminStorageHealthResponse {
  ok: boolean;
  configured: boolean;
  status: string;
  message?: string;
  error?: string;
  spreadsheetName?: string;
  totalNews?: number;
  deletedNews?: number;
  totalEvents?: number;
  totalCategories?: number;
  availableBackups?: number;
  lastBackupAt?: string;
  backupStatus?: string;
  imageStorageStatus?: string;
  migrationStatus?: string;
  serverTime?: string;
  recentLogs?: Array<{
    logId: string;
    timestamp: string;
    action: string;
    entityType: string;
    entityId: string;
    adminEmail: string;
    details: string;
  }>;
  quota: StorageQuotaTelemetry;
}

export interface BackupListItem {
  fileId: string;
  fileName: string;
  tier: 'daily' | 'monthly';
  sizeBytes: number;
  createdAt: string;
  createdTimestamp: number;
}

export interface BackupPreviewResponse {
  ok: boolean;
  fileId: string;
  fileName: string;
  exportedAt: string;
  newsCount: number;
  eventsCount: number;
  categoriesCount: number;
  previewNews: Array<{
    newsId: string;
    title: string;
    category: string;
    location: string;
    publishedDate: string;
    views: number;
    status: string;
    existsInCurrent: boolean;
    isDeletedInCurrent: boolean;
  }>;
  error?: string;
}

interface RawSheetsNewsItem {
  newsId: string;
  title: string;
  description: string;
  fullContent: string[];
  category: string;
  location: string;
  language?: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  imageCaption?: string;
  imageKey?: string;
  extraImages?: ExtraNewsPhoto[];
  watermarkApplied?: boolean;
  author?: string;
  authorUid?: string;
  publishedDate?: string;
  publishedTime?: string;
  publishedTimestamp?: number;
  readTimeMinutes?: number;
  views?: number;
  featured?: boolean | string;
  featuredUntil?: number | string;
  tags?: string;
}

interface RawSheetsEventItem {
  eventId: string;
  titleKannada: string;
  descriptionKannada: string;
  eventDate: string;
  eventTime: string;
  location: string;
  organizer: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  watermarkApplied?: boolean;
  authorUid?: string;
  views?: number;
  createdAt?: string;
}

let cachedStatus: { value: StorageStatusResponse; expiresAt: number } | null = null;

export async function getStorageBackendStatus(forceRefresh = false): Promise<StorageStatusResponse> {
  if (!forceRefresh && cachedStatus && Date.now() < cachedStatus.expiresAt) {
    return cachedStatus.value;
  }
  try {
    const resp = await fetch('/api/storage/status', {
      headers: { Accept: 'application/json' },
    });
    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (resp.ok && contentType.includes('application/json')) {
      const data = (await resp.json()) as StorageStatusResponse;
      if (data && (data.mode === 'google_sheets' || data.mode === 'firebase_fallback')) {
        cachedStatus = { value: data, expiresAt: Date.now() + 2 * 60 * 1000 };
        return data;
      }
    }
  } catch {
    // Fallback cleanly
  }
  return { mode: 'firebase_fallback', configured: false, cacheTtlMinutes: 7 };
}

export async function isSheetsStorageActive(): Promise<boolean> {
  const status = await getStorageBackendStatus();
  return status.configured && status.mode === 'google_sheets';
}

export function mapSheetsItemToArticle(item: RawSheetsNewsItem): NewsArticle {
  const leadState = resolveEffectiveLeadState(item);
  const unpacked = unpackBodyAndExtraPhotos(item.fullContent, item.extraImages);
  return {
    id: item.newsId,
    titleKannada: item.title || '',
    summaryKannada: item.description || '',
    bodyKannada: unpacked.bodyKannada,
    category: (item.category || 'Local') as NewsCategory,
    location: item.location || 'ಕೊಪ್ಪ',
    publishedDate: item.publishedDate || '',
    publishedTime: item.publishedTime || '',
    publishedTimestamp: Number(item.publishedTimestamp) || undefined,
    readTimeMinutes: Number(item.readTimeMinutes) || 1,
    reporter: item.author || 'Coffeenadu Desk',
    imageKey: (item.imageKey || 'none') as ImageKey,
    imageUrl: item.imageUrl || undefined,
    imageThumbUrl: item.imageThumbUrl || undefined,
    imageDriveId: item.imageDriveId || undefined,
    imageCaption: item.imageCaption || undefined,
    extraImages: unpacked.extraImages.length > 0 ? unpacked.extraImages : undefined,
    isFeatured: leadState.isFeatured,
    featuredUntil: leadState.featuredUntil,
    tags: typeof item.tags === 'string' ? item.tags : undefined,
    authorUid: item.authorUid || undefined,
    viewCount: Number(item.views) || 0,
    watermarkApplied: Boolean(item.watermarkApplied),
  };
}

export function mapSheetsItemToEvent(item: RawSheetsEventItem): ProgramEvent {
  return {
    id: item.eventId,
    titleKannada: item.titleKannada || '',
    descriptionKannada: item.descriptionKannada || '',
    eventDate: item.eventDate || '',
    eventTime: item.eventTime || '10:00 AM',
    location: item.location || 'ಕೊಪ್ಪ',
    organizer: item.organizer || 'Koppa Taluk Committee',
    imageUrl: item.imageUrl || undefined,
    imageThumbUrl: item.imageThumbUrl || undefined,
    imageDriveId: item.imageDriveId || undefined,
    authorUid: item.authorUid || undefined,
    createdTimestamp: item.createdAt ? new Date(item.createdAt).getTime() : undefined,
    viewCount: Number(item.views) || 0,
    watermarkApplied: Boolean(item.watermarkApplied),
  };
}

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const admin2Token = getAdmin2MemoryToken();
  if (admin2Token) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin2Token}`,
    };
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to /admin first.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchNewsPageFromSheets(options: {
  page?: number;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<{ articles: NewsArticle[]; hasMore: boolean; total: number; fromCache: boolean }> {
  const params = new URLSearchParams();
  params.set('page', String(options.page || 1));
  params.set('limit', String(options.limit || 15));
  if (options.forceRefresh) params.set('refresh', '1');

  const resp = await fetch(`/api/storage/news?${params.toString()}`, {
    cache: options.forceRefresh ? 'no-store' : 'default',
  });
  const json = (await resp.json()) as {
    ok?: boolean;
    items?: RawSheetsNewsItem[];
    hasMore?: boolean;
    total?: number;
    fromCache?: boolean;
    error?: string;
  };
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Failed to load news from Google Sheets.');
  }
  return {
    articles: (json.items || []).map(mapSheetsItemToArticle),
    hasMore: Boolean(json.hasMore),
    total: Number(json.total) || 0,
    fromCache: Boolean(json.fromCache),
  };
}

export async function fetchNewsByIdFromSheets(newsId: string): Promise<NewsArticle | null> {
  const resp = await fetch(`/api/storage/news/${encodeURIComponent(newsId)}`);
  if (resp.status === 404) return null;
  const json = (await resp.json()) as { ok?: boolean; item?: RawSheetsNewsItem };
  if (!resp.ok || !json.ok || !json.item) return null;
  return mapSheetsItemToArticle(json.item);
}

export async function fetchEventsPageFromSheets(options: {
  page?: number;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<{ events: ProgramEvent[]; hasMore: boolean; total: number; fromCache: boolean }> {
  const params = new URLSearchParams();
  params.set('page', String(options.page || 1));
  params.set('limit', String(options.limit || 20));
  if (options.forceRefresh) params.set('refresh', '1');

  const resp = await fetch(`/api/storage/events?${params.toString()}`);
  const json = (await resp.json()) as {
    ok?: boolean;
    items?: RawSheetsEventItem[];
    hasMore?: boolean;
    total?: number;
    fromCache?: boolean;
    error?: string;
  };
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Failed to load events from Google Sheets.');
  }
  return {
    events: (json.items || []).map(mapSheetsItemToEvent),
    hasMore: Boolean(json.hasMore),
    total: Number(json.total) || 0,
    fromCache: Boolean(json.fromCache),
  };
}

export async function fetchEventByIdFromSheets(eventId: string): Promise<ProgramEvent | null> {
  const resp = await fetch(`/api/storage/events/${encodeURIComponent(eventId)}`);
  if (resp.status === 404) return null;
  const json = (await resp.json()) as { ok?: boolean; item?: RawSheetsEventItem };
  if (!resp.ok || !json.ok || !json.item) return null;
  return mapSheetsItemToEvent(json.item);
}

export interface RecordedViewResponse {
  ok: boolean;
  views: number;
  lastViewedAt: string;
}

export async function recordAggregatedViewOnServer(
  type: 'article' | 'event',
  id: string,
  meta?: {
    title?: string;
    category?: string;
    location?: string;
    publishedDate?: string;
    baselineViews?: number;
  }
): Promise<RecordedViewResponse | null> {
  const payload = JSON.stringify({
    type,
    id,
    ...(meta?.title ? { title: meta.title } : {}),
    ...(meta?.category ? { category: meta.category } : {}),
    ...(meta?.location ? { location: meta.location } : {}),
    ...(meta?.publishedDate ? { publishedDate: meta.publishedDate } : {}),
    ...(typeof meta?.baselineViews === 'number' && Number.isFinite(meta.baselineViews)
      ? { baselineViews: meta.baselineViews }
      : {}),
  });

  const retryDelays = [250, 650];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const resp = await fetch('/api/storage/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        cache: 'no-store',
        keepalive: true,
      });

      if (resp.ok) {
        const json = (await resp.json().catch(() => null)) as {
          ok?: boolean;
          views?: number;
          lastViewedAt?: string;
        } | null;
        if (json?.ok && typeof json.views === 'number' && Number.isFinite(json.views)) {
          return {
            ok: true,
            views: json.views,
            lastViewedAt: json.lastViewedAt || new Date().toISOString(),
          };
        }
        return {
          ok: true,
          views: (meta?.baselineViews ?? 0) + 1,
          lastViewedAt: new Date().toISOString(),
        };
      }

      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        return null;
      }
    } catch {
      // Retry on transient network errors
    }

    if (attempt < retryDelays.length) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }
  return null;
}

export async function uploadImageToDriveViaServer(input: {
  base64Data: string;
  thumbBase64?: string;
  mimeType?: string;
  fileName?: string;
}): Promise<{
  fileId: string;
  thumbFileId: string;
  imageUrl: string;
  imageThumbUrl: string;
  deduplicated: boolean;
}> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/upload-image', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const json = (await resp.json()) as {
    ok?: boolean;
    fileId?: string;
    thumbFileId?: string;
    imageUrl?: string;
    imageThumbUrl?: string;
    deduplicated?: boolean;
    error?: string;
  };
  if (!resp.ok || !json.ok || !json.fileId || !json.imageUrl) {
    throw new Error(json.error || 'Failed to upload photo to Google Drive.');
  }
  return {
    fileId: json.fileId,
    thumbFileId: json.thumbFileId || json.fileId,
    imageUrl: json.imageUrl,
    imageThumbUrl: json.imageThumbUrl || json.imageUrl,
    deduplicated: Boolean(json.deduplicated),
  };
}

export async function createNewsViaSheets(payload: Record<string, unknown>): Promise<NewsArticle> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/news', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json = (await resp.json()) as { ok?: boolean; item?: RawSheetsNewsItem; error?: string };
  if (!resp.ok || !json.ok || !json.item) {
    throw new Error(json.error || 'Unable to publish news to Google Sheets.');
  }
  return mapSheetsItemToArticle(json.item);
}

export async function updateNewsViaSheets(
  newsId: string,
  payload: Record<string, unknown>
): Promise<NewsArticle> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch(`/api/storage/admin/news/${encodeURIComponent(newsId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  const json = (await resp.json()) as { ok?: boolean; item?: RawSheetsNewsItem; error?: string };
  if (!resp.ok || !json.ok || !json.item) {
    throw new Error(json.error || 'Unable to update news in Google Sheets.');
  }
  return mapSheetsItemToArticle(json.item);
}

export async function toggleNewsLeadViaSheets(
  newsId: string,
  options: { isFeatured: boolean; featuredUntil?: number; existingTags?: string }
): Promise<{ featured: boolean; featuredUntil?: number; tags: string; item?: NewsArticle }> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch(`/api/storage/admin/news/${encodeURIComponent(newsId)}/lead`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      featured: options.isFeatured,
      isFeatured: options.isFeatured,
      featuredUntil: options.isFeatured ? options.featuredUntil ?? '' : '',
      tags: options.existingTags ?? '',
    }),
  });
  const json = (await resp.json()) as {
    ok?: boolean;
    featured?: boolean;
    featuredUntil?: number;
    tags?: string;
    item?: RawSheetsNewsItem;
    error?: string;
  };
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Unable to update Lead Story status.');
  }
  return {
    featured: Boolean(json.featured),
    featuredUntil: json.featuredUntil,
    tags: typeof json.tags === 'string' ? json.tags : '',
    item: json.item ? mapSheetsItemToArticle(json.item) : undefined,
  };
}

export async function deleteNewsViaSheets(newsId: string): Promise<void> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch(`/api/storage/admin/news/${encodeURIComponent(newsId)}`, {
    method: 'DELETE',
    headers,
  });
  const json = (await resp.json()) as { ok?: boolean; error?: string };
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Unable to delete news from Google Sheets.');
  }
}

export async function createEventViaSheets(payload: Record<string, unknown>): Promise<ProgramEvent> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json = (await resp.json()) as { ok?: boolean; item?: RawSheetsEventItem; error?: string };
  if (!resp.ok || !json.ok || !json.item) {
    throw new Error(json.error || 'Unable to create event in Google Sheets.');
  }
  return mapSheetsItemToEvent(json.item);
}

export async function updateEventViaSheets(
  eventId: string,
  payload: Record<string, unknown>
): Promise<ProgramEvent> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch(`/api/storage/admin/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  const json = (await resp.json()) as { ok?: boolean; item?: RawSheetsEventItem; error?: string };
  if (!resp.ok || !json.ok || !json.item) {
    throw new Error(json.error || 'Unable to update event in Google Sheets.');
  }
  return mapSheetsItemToEvent(json.item);
}

export async function deleteEventViaSheets(eventId: string): Promise<void> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch(`/api/storage/admin/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers,
  });
  const json = (await resp.json()) as { ok?: boolean; error?: string };
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Unable to delete event from Google Sheets.');
  }
}

export async function fetchStorageAdminHealth(): Promise<AdminStorageHealthResponse> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/health', { headers });
  const json = (await resp.json()) as AdminStorageHealthResponse;
  if (!resp.ok && !json.quota) {
    throw new Error(json.error || 'Unable to check storage status.');
  }
  return json;
}

export async function triggerBackupNowViaServer(): Promise<{
  ok: boolean;
  jsonFileName?: string;
  csvFileName?: string;
  articleCount?: number;
  eventCount?: number;
  availableBackupsCount?: number;
  createdAt?: string;
  error?: string;
}> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/backup-now', { method: 'POST', headers });
  const json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Backup creation failed.');
  }
  return json;
}

export async function fetchAvailableBackupsViaServer(): Promise<BackupListItem[]> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/backups', { headers });
  const json = (await resp.json()) as { ok?: boolean; backups?: BackupListItem[]; error?: string };
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Unable to fetch backup list.');
  }
  return json.backups || [];
}

export async function previewBackupViaServer(fileId: string): Promise<BackupPreviewResponse> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/backups/preview', {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileId }),
  });
  const json = (await resp.json()) as BackupPreviewResponse;
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Unable to preview backup.');
  }
  return json;
}

export async function restoreBackupViaServer(input: {
  fileId: string;
  mode: 'all' | 'selected' | 'deleted_only';
  selectedIds?: string[];
}): Promise<{
  ok: boolean;
  restoredCount: number;
  skippedCount: number;
  safetyBackupFileName: string;
}> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/backups/restore', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Restore operation failed.');
  }
  return json;
}

export async function exportAllFromSheetsViaServer(): Promise<{
  data: Record<string, unknown>;
  csv: string;
}> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/export', { headers });
  const json = (await resp.json()) as {
    ok?: boolean;
    data?: Record<string, unknown>;
    csv?: string;
    error?: string;
  };
  if (!resp.ok || !json.ok || !json.data) {
    throw new Error(json.error || 'Unable to export news.');
  }
  return { data: json.data, csv: json.csv || '' };
}

export interface MigrationRecordFailure {
  id: string;
  title: string;
  reason: string;
}

export interface MigrateBatchResponse {
  importedNews: number;
  skippedNews: number;
  importedEvents: number;
  skippedEvents: number;
  migratedImages: number;
  categoriesAdded: number;
  migratedNewsIds: string[];
  duplicateNewsIds: string[];
  failedNews: MigrationRecordFailure[];
  migratedEventIds: string[];
  duplicateEventIds: string[];
  failedEvents: MigrationRecordFailure[];
  totalNewsInSheet: number;
  totalEventsInSheet: number;
}

export interface VerifyMigrationExpectationNews {
  id: string;
  title: string;
  category: string;
  publishedDate: string;
  hadBase64Image: boolean;
  hadImageUrl: boolean;
}

export interface VerifyMigrationExpectationEvent {
  id: string;
  title: string;
  eventDate: string;
  hadBase64Image: boolean;
  hadImageUrl: boolean;
}

export interface VerifyMigrationResponse {
  ok: boolean;
  allVerified: boolean;
  fullyVerifiedComplete: boolean;
  exportComplete: boolean;
  verifiedNewsIds: string[];
  missingNewsIds: string[];
  mismatchedNews: MigrationRecordFailure[];
  verifiedEventIds: string[];
  missingEventIds: string[];
  mismatchedEvents: MigrationRecordFailure[];
  totalNewsInSheet: number;
  totalEventsInSheet: number;
  totalCategoriesInSheet: number;
  verifiedAt: string;
}

export async function migrateBatchToSheetsViaServer(input: {
  articles: NewsArticle[];
  events: ProgramEvent[];
  categories?: string[];
}): Promise<MigrateBatchResponse> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/migrate-batch', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Migration batch failed.');
  }
  return {
    importedNews: Number(json.importedNews) || 0,
    skippedNews: Number(json.skippedNews) || 0,
    importedEvents: Number(json.importedEvents) || 0,
    skippedEvents: Number(json.skippedEvents) || 0,
    migratedImages: Number(json.migratedImages) || 0,
    categoriesAdded: Number(json.categoriesAdded) || 0,
    migratedNewsIds: Array.isArray(json.migratedNewsIds) ? json.migratedNewsIds : [],
    duplicateNewsIds: Array.isArray(json.duplicateNewsIds) ? json.duplicateNewsIds : [],
    failedNews: Array.isArray(json.failedNews) ? json.failedNews : [],
    migratedEventIds: Array.isArray(json.migratedEventIds) ? json.migratedEventIds : [],
    duplicateEventIds: Array.isArray(json.duplicateEventIds) ? json.duplicateEventIds : [],
    failedEvents: Array.isArray(json.failedEvents) ? json.failedEvents : [],
    totalNewsInSheet: Number(json.totalNewsInSheet) || 0,
    totalEventsInSheet: Number(json.totalEventsInSheet) || 0,
  };
}

export async function verifyMigrationViaServer(input: {
  expectedNews: VerifyMigrationExpectationNews[];
  expectedEvents: VerifyMigrationExpectationEvent[];
  exportComplete: boolean;
}): Promise<VerifyMigrationResponse> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/verify-migration', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || 'Migration verification failed.');
  }
  return {
    ok: true,
    allVerified: Boolean(json.allVerified),
    fullyVerifiedComplete: Boolean(json.fullyVerifiedComplete),
    exportComplete: Boolean(json.exportComplete),
    verifiedNewsIds: Array.isArray(json.verifiedNewsIds) ? json.verifiedNewsIds : [],
    missingNewsIds: Array.isArray(json.missingNewsIds) ? json.missingNewsIds : [],
    mismatchedNews: Array.isArray(json.mismatchedNews) ? json.mismatchedNews : [],
    verifiedEventIds: Array.isArray(json.verifiedEventIds) ? json.verifiedEventIds : [],
    missingEventIds: Array.isArray(json.missingEventIds) ? json.missingEventIds : [],
    mismatchedEvents: Array.isArray(json.mismatchedEvents) ? json.mismatchedEvents : [],
    totalNewsInSheet: Number(json.totalNewsInSheet) || 0,
    totalEventsInSheet: Number(json.totalEventsInSheet) || 0,
    totalCategoriesInSheet: Number(json.totalCategoriesInSheet) || 0,
    verifiedAt: String(json.verifiedAt || new Date().toISOString()),
  };
}

export async function flushPendingViewsViaServer(): Promise<{ flushed: boolean; count: number }> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/flush-views', { method: 'POST', headers });
  const json = await resp.json();
  return { flushed: Boolean(json.flushed), count: Number(json.count) || 0 };
}

export async function fetchAppsScriptSourceCode(): Promise<string> {
  const headers = await getAdminAuthHeaders();
  const resp = await fetch('/api/storage/admin/apps-script-source', { headers });
  const json = (await resp.json()) as { ok?: boolean; code?: string; error?: string };
  if (!resp.ok || !json.ok || !json.code) {
    throw new Error(json.error || 'Unable to load Apps Script source.');
  }
  return json.code;
}
