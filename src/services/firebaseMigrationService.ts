import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type Timestamp,
} from 'firebase/firestore';
import { KOPPA_LOCATIONS, NEWS_CATEGORIES } from '../constants/newsData';
import { db } from '../firebase';
import type { ImageKey, NewsArticle, NewsCategory, ProgramEvent } from '../types/news';
import {
  clearFirestoreQuotaExceeded,
  isFirestoreQuotaError,
  markFirestoreQuotaExceeded,
} from './firestoreOptimizer';
import {
  migrateBatchToSheetsViaServer,
  verifyMigrationViaServer,
  type MigrationRecordFailure,
  type VerifyMigrationResponse,
} from './sheetsStorageClient';

export type MigrationRunStatus =
  | 'idle'
  | 'exporting_firebase'
  | 'paused_quota'
  | 'paused_user'
  | 'export_complete_ready_to_migrate'
  | 'migrating_to_sheets'
  | 'verifying'
  | 'verified_complete'
  | 'completed_with_failures';

export type RecordMigrationState =
  | 'exported'
  | 'migrated'
  | 'duplicate'
  | 'verified'
  | 'failed';

export interface MigrationRecordAudit {
  id: string;
  entityType: 'article' | 'event';
  title: string;
  category: string;
  publishedDate: string;
  hadBase64Image: boolean;
  hadImageUrl: boolean;
  state: RecordMigrationState;
  error?: string;
}

export interface MigrationCheckpoint {
  version: number;
  source: 'firebase_paginated' | 'json_import';
  status: MigrationRunStatus;
  startedAt: string;
  updatedAt: string;
  statusMessage: string;
  lastError: string | null;

  // Phase 1: Paginated read-only Firebase export cursors & totals
  totalArticlesInFirebase: number | null;
  totalEventsInFirebase: number | null;
  articlesLastDocId: string | null;
  eventsLastDocId: string | null;
  articlesExportComplete: boolean;
  eventsExportComplete: boolean;
  firestorePagesRead: number;

  // Staged historical records (persisted in IndexedDB so Base64 images survive reloads & quota pauses)
  articles: NewsArticle[];
  events: ProgramEvent[];
  categories: string[];

  // Phase 2: Per-record migration tracking
  migratedArticleIds: string[];
  duplicateArticleIds: string[];
  failedArticles: MigrationRecordFailure[];
  migratedEventIds: string[];
  duplicateEventIds: string[];
  failedEvents: MigrationRecordFailure[];
  migratedDriveImagesCount: number;
  categoriesAddedCount: number;

  // Phase 3: Verification results (NEVER complete until verified!)
  verification: VerifyMigrationResponse | null;
}

const DB_NAME = 'coffeenadu_migration_db';
const DB_VERSION = 1;
const STORE_NAME = 'checkpoints';
const CHECKPOINT_KEY = 'active_firebase_to_sheets_v2';
const FIRESTORE_EXPORT_PAGE_SIZE = 10; // Small quota-friendly pages
const SHEETS_MIGRATE_BATCH_SIZE = 3; // Safe for Drive Base64 uploads within Apps Script limits
const REMOVED_LEGACY_ARTICLE_IDS = new Set(['koppa-fog-advisory-01']);

const VALID_IMAGE_KEYS: ImageKey[] = [
  'none',
  'koppa-landscape',
  'malnad-hills',
  'coffee-estate',
  'health-medical',
  'entertainment-stage',
  'crime-alert',
  'general-news',
  'politics-assembly',
  'sports-stadium',
  'special-feature',
  'state-civic',
  'nation-parliament',
  'tunga-bridge',
  'education-library',
  'malnad-culture',
];

function openMigrationDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadMigrationCheckpoint(): Promise<MigrationCheckpoint | null> {
  const database = await openMigrationDb();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CHECKPOINT_KEY);
      req.onsuccess = () => {
        const val = req.result as MigrationCheckpoint | undefined;
        resolve(val && val.version === 2 ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveMigrationCheckpoint(checkpoint: MigrationCheckpoint): Promise<void> {
  const database = await openMigrationDb();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(checkpoint, CHECKPOINT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearMigrationCheckpoint(): Promise<void> {
  const database = await openMigrationDb();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(CHECKPOINT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function createEmptyCheckpoint(
  source: 'firebase_paginated' | 'json_import' = 'firebase_paginated'
): MigrationCheckpoint {
  const now = new Date().toISOString();
  return {
    version: 2,
    source,
    status: 'idle',
    startedAt: now,
    updatedAt: now,
    statusMessage: 'Ready to begin full historical Firebase export.',
    lastError: null,
    totalArticlesInFirebase: null,
    totalEventsInFirebase: null,
    articlesLastDocId: null,
    eventsLastDocId: null,
    articlesExportComplete: false,
    eventsExportComplete: false,
    firestorePagesRead: 0,
    articles: [],
    events: [],
    categories: [...NEWS_CATEGORIES],
    migratedArticleIds: [],
    duplicateArticleIds: [],
    failedArticles: [],
    migratedEventIds: [],
    duplicateEventIds: [],
    failedEvents: [],
    migratedDriveImagesCount: 0,
    categoriesAddedCount: 0,
    verification: null,
  };
}

function timestampToMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as Timestamp).toMillis();
  }
  return undefined;
}

function sanitizeImageKey(value: unknown): ImageKey {
  if (typeof value === 'string' && VALID_IMAGE_KEYS.includes(value as ImageKey)) {
    return value as ImageKey;
  }
  return 'none';
}

function mapFirestoreDocToArticle(docId: string, data: Record<string, unknown>): NewsArticle {
  const rawCategory = typeof data.category === 'string' && data.category.trim() ? data.category.trim() : 'Local';
  const category = (NEWS_CATEGORIES.includes(rawCategory as NewsCategory)
    ? rawCategory
    : rawCategory) as NewsCategory;

  return {
    id: docId, // Always preserve original Firebase document ID as canonical permanent ID
    titleKannada: typeof data.titleKannada === 'string' ? data.titleKannada : '',
    summaryKannada: typeof data.summaryKannada === 'string' ? data.summaryKannada : '',
    bodyKannada: Array.isArray(data.bodyKannada)
      ? data.bodyKannada.filter((p): p is string => typeof p === 'string')
      : [],
    category,
    location: typeof data.location === 'string' && data.location.trim() ? data.location : KOPPA_LOCATIONS[0],
    publishedDate: typeof data.publishedDate === 'string' ? data.publishedDate : '',
    publishedTime: typeof data.publishedTime === 'string' ? data.publishedTime : '',
    publishedTimestamp:
      typeof data.publishedTimestamp === 'number'
        ? data.publishedTimestamp
        : timestampToMs(data.createdAt),
    readTimeMinutes: typeof data.readTimeMinutes === 'number' ? data.readTimeMinutes : 1,
    reporter: typeof data.reporter === 'string' && data.reporter.trim() ? data.reporter : 'Coffeenadu Desk',
    imageKey: sanitizeImageKey(data.imageKey),
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
    imageThumbUrl: typeof data.imageThumbUrl === 'string' && data.imageThumbUrl ? data.imageThumbUrl : undefined,
    imageDriveId: typeof data.imageDriveId === 'string' && data.imageDriveId ? data.imageDriveId : undefined,
    imageCaption: typeof data.imageCaption === 'string' && data.imageCaption ? data.imageCaption : undefined,
    isFeatured: Boolean(data.isFeatured),
    authorUid: typeof data.authorUid === 'string' ? data.authorUid : undefined,
    viewCount: typeof data.viewCount === 'number' && Number.isFinite(data.viewCount) ? data.viewCount : 0,
    watermarkApplied: Boolean(data.watermarkApplied),
  };
}

function mapFirestoreDocToEvent(docId: string, data: Record<string, unknown>): ProgramEvent {
  return {
    id: docId, // Preserve original Firebase document ID
    titleKannada: typeof data.titleKannada === 'string' ? data.titleKannada : '',
    descriptionKannada: typeof data.descriptionKannada === 'string' ? data.descriptionKannada : '',
    eventDate: typeof data.eventDate === 'string' ? data.eventDate : '',
    eventTime: typeof data.eventTime === 'string' ? data.eventTime : '10:00 AM',
    location: typeof data.location === 'string' && data.location.trim() ? data.location : KOPPA_LOCATIONS[0],
    organizer: typeof data.organizer === 'string' && data.organizer.trim() ? data.organizer : 'Coffeenadu Desk',
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
    imageThumbUrl: typeof data.imageThumbUrl === 'string' && data.imageThumbUrl ? data.imageThumbUrl : undefined,
    imageDriveId: typeof data.imageDriveId === 'string' && data.imageDriveId ? data.imageDriveId : undefined,
    authorUid: typeof data.authorUid === 'string' ? data.authorUid : undefined,
    createdTimestamp: timestampToMs(data.createdAt),
    viewCount: typeof data.viewCount === 'number' && Number.isFinite(data.viewCount) ? data.viewCount : 0,
    watermarkApplied: Boolean(data.watermarkApplied),
  };
}

function addUniqueStrings(base: string[], incoming: string[]): string[] {
  const set = new Set(base);
  for (const item of incoming) {
    if (item) set.add(item);
  }
  return Array.from(set);
}

function mergeFailures(
  existing: MigrationRecordFailure[],
  incoming: MigrationRecordFailure[],
  succeededIds: Set<string>
): MigrationRecordFailure[] {
  const map = new Map<string, MigrationRecordFailure>();
  for (const f of existing) {
    if (!succeededIds.has(f.id)) {
      map.set(f.id, f);
    }
  }
  for (const f of incoming) {
    map.set(f.id, f);
  }
  return Array.from(map.values());
}

export interface MigrationProgressSnapshot {
  totalKnownRecords: number;
  exportedRecords: number;
  remainingToExport: number | null;
  completedMigrationRecords: number;
  remainingToMigrate: number;
  verifiedRecords: number;
  failedRecords: number;
  duplicateRecords: number;
  overallProgressPct: number;
  exportComplete: boolean;
  isFullyVerifiedComplete: boolean;
}

export function computeMigrationProgress(cp: MigrationCheckpoint): MigrationProgressSnapshot {
  const exportedArticles = cp.articles.length;
  const exportedEvents = cp.events.length;
  const exportedRecords = exportedArticles + exportedEvents;

  const knownArticles = cp.articlesExportComplete
    ? exportedArticles
    : Math.max(exportedArticles, cp.totalArticlesInFirebase ?? exportedArticles);
  const knownEvents = cp.eventsExportComplete
    ? exportedEvents
    : Math.max(exportedEvents, cp.totalEventsInFirebase ?? exportedEvents);
  const totalKnownRecords = knownArticles + knownEvents;

  const exportComplete = cp.articlesExportComplete && cp.eventsExportComplete;
  const remainingToExport = exportComplete
    ? 0
    : cp.totalArticlesInFirebase !== null && cp.totalEventsInFirebase !== null
    ? Math.max(0, totalKnownRecords - exportedRecords)
    : null;

  const doneArticles = new Set([...cp.migratedArticleIds, ...cp.duplicateArticleIds]);
  const doneEvents = new Set([...cp.migratedEventIds, ...cp.duplicateEventIds]);
  const completedMigrationRecords = doneArticles.size + doneEvents.size;
  const remainingToMigrate = Math.max(0, exportedRecords - completedMigrationRecords);

  const verifiedRecords = cp.verification
    ? cp.verification.verifiedNewsIds.length + cp.verification.verifiedEventIds.length
    : 0;
  const mismatchCount = cp.verification
    ? cp.verification.mismatchedNews.length +
      cp.verification.mismatchedEvents.length +
      cp.verification.missingNewsIds.length +
      cp.verification.missingEventIds.length
    : 0;

  const failedRecords = cp.failedArticles.length + cp.failedEvents.length + mismatchCount;
  const duplicateRecords = cp.duplicateArticleIds.length + cp.duplicateEventIds.length;

  const isFullyVerifiedComplete = Boolean(
    exportComplete &&
      exportedRecords > 0 &&
      failedRecords === 0 &&
      cp.verification?.fullyVerifiedComplete === true
  );

  // Weighted progress: 40% export, 45% Sheets+Drive upload, 15% verification
  let overallProgressPct = 0;
  if (isFullyVerifiedComplete) {
    overallProgressPct = 100;
  } else if (totalKnownRecords > 0) {
    const exportRatio = exportComplete ? 1 : Math.min(0.95, exportedRecords / totalKnownRecords);
    const migrateRatio = exportedRecords > 0 ? Math.min(1, completedMigrationRecords / Math.max(totalKnownRecords, exportedRecords)) : 0;
    const verifyRatio = cp.verification
      ? Math.min(1, verifiedRecords / Math.max(totalKnownRecords, exportedRecords))
      : 0;
    overallProgressPct = Math.min(99, Math.round(exportRatio * 40 + migrateRatio * 45 + verifyRatio * 15));
  }

  return {
    totalKnownRecords,
    exportedRecords,
    remainingToExport,
    completedMigrationRecords,
    remainingToMigrate,
    verifiedRecords,
    failedRecords,
    duplicateRecords,
    overallProgressPct,
    exportComplete,
    isFullyVerifiedComplete,
  };
}

/**
 * PHASE 1: Complete Read-Only Paginated Export from Firebase Firestore.
 * Uses documentId() cursors so every single historical article & event is retrieved
 * deterministically and can resume after quota resets without re-reading earlier docs.
 * NEVER writes, updates, or deletes anything in Firebase.
 */
export async function runPaginatedFirebaseExport(
  initialCheckpoint: MigrationCheckpoint,
  options: {
    onProgress: (cp: MigrationCheckpoint) => void;
    shouldPause: () => boolean;
  }
): Promise<MigrationCheckpoint> {
  let cp: MigrationCheckpoint = {
    ...initialCheckpoint,
    source: 'firebase_paginated',
    status: 'exporting_firebase',
    lastError: null,
    updatedAt: new Date().toISOString(),
  };

  const emit = async (next: MigrationCheckpoint) => {
    cp = { ...next, updatedAt: new Date().toISOString() };
    await saveMigrationCheckpoint(cp);
    options.onProgress(cp);
  };

  await emit({
    ...cp,
    statusMessage: 'Checking total historical news and events count in Firebase Firestore (read-only)...',
  });

  // Step 1a: Cheap aggregation count (1 read per 1,000 docs) so progress indicator shows exact total
  try {
    if (cp.totalArticlesInFirebase === null && !cp.articlesExportComplete) {
      const articlesCountSnap = await getCountFromServer(collection(db, 'articles'));
      cp.totalArticlesInFirebase = articlesCountSnap.data().count;
    }
    if (cp.totalEventsInFirebase === null && !cp.eventsExportComplete) {
      const eventsCountSnap = await getCountFromServer(collection(db, 'events'));
      cp.totalEventsInFirebase = eventsCountSnap.data().count;
    }
    clearFirestoreQuotaExceeded();
    await emit({
      ...cp,
      statusMessage: `Discovered ${cp.totalArticlesInFirebase ?? '?'} historical articles and ${cp.totalEventsInFirebase ?? '?'} historical events in Firebase.`,
    });
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
      await emit({
        ...cp,
        status: 'paused_quota',
        lastError:
          'Firebase daily free read quota is currently exhausted. Your checkpoint has been preserved — resume after quota resets tomorrow (or migrate any already-exported records now).',
        statusMessage: 'Paused due to Firebase daily free read quota limit. Progress saved safely.',
      });
      return cp;
    }
    // Non-quota count error (e.g. older offline cache) — proceed with paginated reads directly
  }

  // Step 1b: Paginate ALL historical `articles` by documentId()
  const articleMap = new Map<string, NewsArticle>(cp.articles.map((a) => [a.id, a]));
  const categorySet = new Set<string>(cp.categories);

  while (!cp.articlesExportComplete) {
    if (options.shouldPause()) {
      await emit({
        ...cp,
        status: 'paused_user',
        statusMessage: `Export paused by admin after ${articleMap.size} articles. Click Resume Migration anytime.`,
      });
      return cp;
    }

    try {
      const pageQuery = cp.articlesLastDocId
        ? query(
            collection(db, 'articles'),
            orderBy(documentId()),
            startAfter(cp.articlesLastDocId),
            limit(FIRESTORE_EXPORT_PAGE_SIZE)
          )
        : query(
            collection(db, 'articles'),
            orderBy(documentId()),
            limit(FIRESTORE_EXPORT_PAGE_SIZE)
          );

      const snap = await getDocs(pageQuery);
      clearFirestoreQuotaExceeded();

      if (snap.empty) {
        cp.articlesExportComplete = true;
        cp.totalArticlesInFirebase = articleMap.size;
        await emit({
          ...cp,
          articles: Array.from(articleMap.values()),
          categories: Array.from(categorySet),
          statusMessage: `Exported all ${articleMap.size} historical articles from Firebase. Moving to events...`,
        });
        break;
      }

      for (const docSnap of snap.docs) {
        if (REMOVED_LEGACY_ARTICLE_IDS.has(docSnap.id)) continue;
        const mapped = mapFirestoreDocToArticle(docSnap.id, docSnap.data() as Record<string, unknown>);
        articleMap.set(mapped.id, mapped);
        if (mapped.category) categorySet.add(mapped.category);
      }

      const lastDoc = snap.docs[snap.docs.length - 1];
      cp.articlesLastDocId = lastDoc.id;
      cp.firestorePagesRead += 1;

      if (snap.docs.length < FIRESTORE_EXPORT_PAGE_SIZE) {
        cp.articlesExportComplete = true;
        cp.totalArticlesInFirebase = articleMap.size;
      }

      await emit({
        ...cp,
        articles: Array.from(articleMap.values()),
        categories: Array.from(categorySet),
        statusMessage: `Exported ${articleMap.size}${cp.totalArticlesInFirebase ? ` / ${cp.totalArticlesInFirebase}` : ''} historical articles from Firebase...`,
      });
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markFirestoreQuotaExceeded(err);
        await emit({
          ...cp,
          articles: Array.from(articleMap.values()),
          categories: Array.from(categorySet),
          status: 'paused_quota',
          lastError: `Firebase daily free read limit reached after exporting ${articleMap.size} articles (cursor saved at ID "${cp.articlesLastDocId || 'start'}"). Resume after daily quota resets — zero progress lost.`,
          statusMessage: `Paused by Firebase quota at ${articleMap.size} exported articles. Progress saved.`,
        });
        return cp;
      }
      const msg = err instanceof Error ? err.message : 'Unexpected Firestore export error.';
      await emit({
        ...cp,
        articles: Array.from(articleMap.values()),
        categories: Array.from(categorySet),
        status: 'paused_user',
        lastError: `Firebase article export interrupted: ${msg}. Progress saved — safe to resume.`,
        statusMessage: 'Export interrupted. Progress saved — click Resume to continue.',
      });
      return cp;
    }
  }

  // Step 1c: Paginate ALL historical `events` by documentId()
  const eventMap = new Map<string, ProgramEvent>(cp.events.map((e) => [e.id, e]));

  while (!cp.eventsExportComplete) {
    if (options.shouldPause()) {
      await emit({
        ...cp,
        status: 'paused_user',
        statusMessage: `Export paused by admin after ${articleMap.size} articles and ${eventMap.size} events.`,
      });
      return cp;
    }

    try {
      const pageQuery = cp.eventsLastDocId
        ? query(
            collection(db, 'events'),
            orderBy(documentId()),
            startAfter(cp.eventsLastDocId),
            limit(FIRESTORE_EXPORT_PAGE_SIZE)
          )
        : query(
            collection(db, 'events'),
            orderBy(documentId()),
            limit(FIRESTORE_EXPORT_PAGE_SIZE)
          );

      const snap = await getDocs(pageQuery);
      clearFirestoreQuotaExceeded();

      if (snap.empty) {
        cp.eventsExportComplete = true;
        cp.totalEventsInFirebase = eventMap.size;
        await emit({
          ...cp,
          events: Array.from(eventMap.values()),
          statusMessage: `Full Firebase export complete: ${articleMap.size} articles, ${eventMap.size} events, ${categorySet.size} categories.`,
        });
        break;
      }

      for (const docSnap of snap.docs) {
        const mapped = mapFirestoreDocToEvent(docSnap.id, docSnap.data() as Record<string, unknown>);
        eventMap.set(mapped.id, mapped);
      }

      const lastDoc = snap.docs[snap.docs.length - 1];
      cp.eventsLastDocId = lastDoc.id;
      cp.firestorePagesRead += 1;

      if (snap.docs.length < FIRESTORE_EXPORT_PAGE_SIZE) {
        cp.eventsExportComplete = true;
        cp.totalEventsInFirebase = eventMap.size;
      }

      await emit({
        ...cp,
        events: Array.from(eventMap.values()),
        statusMessage: `Exported ${eventMap.size}${cp.totalEventsInFirebase ? ` / ${cp.totalEventsInFirebase}` : ''} historical events from Firebase...`,
      });
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markFirestoreQuotaExceeded(err);
        await emit({
          ...cp,
          events: Array.from(eventMap.values()),
          status: 'paused_quota',
          lastError: `Firebase daily free read limit reached after exporting ${articleMap.size} articles and ${eventMap.size} events. Resume after daily quota resets — zero progress lost.`,
          statusMessage: `Paused by Firebase quota at ${articleMap.size} articles & ${eventMap.size} events. Progress saved.`,
        });
        return cp;
      }
      const msg = err instanceof Error ? err.message : 'Unexpected Firestore events export error.';
      await emit({
        ...cp,
        events: Array.from(eventMap.values()),
        status: 'paused_user',
        lastError: `Firebase event export interrupted: ${msg}. Progress saved — safe to resume.`,
        statusMessage: 'Export interrupted. Progress saved — click Resume to continue.',
      });
      return cp;
    }
  }

  await emit({
    ...cp,
    articles: Array.from(articleMap.values()),
    events: Array.from(eventMap.values()),
    categories: Array.from(categorySet),
    status: 'export_complete_ready_to_migrate',
    statusMessage: `Firebase read-only export finished (${articleMap.size} articles, ${eventMap.size} events). Ready for Sheets & Drive migration.`,
  });

  return cp;
}

/**
 * PHASE 2: Batched Idempotent Migration of Staged Records into Google Sheets + Google Drive.
 * Uploads Base64 photos to Google Drive (CoffeeNadu_News_Images), prevents duplicates via
 * original Firebase document IDs, and checkpoints after every batch.
 */
export async function runSheetsAndDriveMigration(
  initialCheckpoint: MigrationCheckpoint,
  options: {
    onProgress: (cp: MigrationCheckpoint) => void;
    shouldPause: () => boolean;
    retryFailedOnly?: boolean;
  }
): Promise<MigrationCheckpoint> {
  let cp: MigrationCheckpoint = {
    ...initialCheckpoint,
    status: 'migrating_to_sheets',
    lastError: null,
    verification: null, // Must re-verify after any new writes
    updatedAt: new Date().toISOString(),
  };

  const emit = async (next: MigrationCheckpoint) => {
    cp = { ...next, updatedAt: new Date().toISOString() };
    await saveMigrationCheckpoint(cp);
    options.onProgress(cp);
  };

  const alreadyDoneArticles = new Set([...cp.migratedArticleIds, ...cp.duplicateArticleIds]);
  const alreadyDoneEvents = new Set([...cp.migratedEventIds, ...cp.duplicateEventIds]);
  const failedArticleIds = new Set(cp.failedArticles.map((f) => f.id));
  const failedEventIds = new Set(cp.failedEvents.map((f) => f.id));

  const pendingArticles = options.retryFailedOnly
    ? cp.articles.filter((a) => failedArticleIds.has(a.id))
    : cp.articles.filter((a) => !alreadyDoneArticles.has(a.id));

  const pendingEvents = options.retryFailedOnly
    ? cp.events.filter((e) => failedEventIds.has(e.id))
    : cp.events.filter((e) => !alreadyDoneEvents.has(e.id));

  if (options.retryFailedOnly) {
    cp.failedArticles = [];
    cp.failedEvents = [];
  }

  await emit({
    ...cp,
    statusMessage: `Uploading ${pendingArticles.length} pending articles and ${pendingEvents.length} pending events to Google Sheets & Google Drive...`,
  });

  // Migrate Articles in small safe batches (3 at a time so Base64 -> Drive uploads never time out)
  let categoriesSynced = false;
  for (let i = 0; i < pendingArticles.length; i += SHEETS_MIGRATE_BATCH_SIZE) {
    if (options.shouldPause()) {
      await emit({
        ...cp,
        status: 'paused_user',
        statusMessage: 'Migration paused by admin. Progress saved — click Resume Migration anytime.',
      });
      return cp;
    }

    const chunk = pendingArticles.slice(i, i + SHEETS_MIGRATE_BATCH_SIZE);
    const completedBefore = cp.migratedArticleIds.length + cp.duplicateArticleIds.length;
    await emit({
      ...cp,
      statusMessage: `Migrating articles ${completedBefore + 1}–${Math.min(completedBefore + chunk.length, cp.articles.length)} of ${cp.articles.length} (uploading Base64 photos to Google Drive)...`,
    });

    try {
      const res = await migrateBatchToSheetsViaServer({
        articles: chunk,
        events: [],
        categories: !categoriesSynced ? cp.categories : [],
      });
      categoriesSynced = true;

      const succeeded = new Set([...res.migratedNewsIds, ...res.duplicateNewsIds]);
      cp.migratedArticleIds = addUniqueStrings(cp.migratedArticleIds, res.migratedNewsIds);
      cp.duplicateArticleIds = addUniqueStrings(cp.duplicateArticleIds, res.duplicateNewsIds);
      cp.failedArticles = mergeFailures(cp.failedArticles, res.failedNews, succeeded);
      cp.migratedDriveImagesCount += res.migratedImages;
      cp.categoriesAddedCount += res.categoriesAdded;

      await emit(cp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch upload error.';
      await emit({
        ...cp,
        status: 'paused_user',
        lastError: `Upload interrupted on article batch (${chunk.map((c) => c.id).join(', ')}): ${msg}. All previous batches are safely saved — click Resume to continue.`,
        statusMessage: 'Upload interrupted. Checkpoint saved — safe to resume.',
      });
      return cp;
    }
  }

  // Migrate Events in small safe batches
  for (let j = 0; j < pendingEvents.length; j += SHEETS_MIGRATE_BATCH_SIZE) {
    if (options.shouldPause()) {
      await emit({
        ...cp,
        status: 'paused_user',
        statusMessage: 'Migration paused by admin. Progress saved — click Resume Migration anytime.',
      });
      return cp;
    }

    const chunk = pendingEvents.slice(j, j + SHEETS_MIGRATE_BATCH_SIZE);
    const completedBefore = cp.migratedEventIds.length + cp.duplicateEventIds.length;
    await emit({
      ...cp,
      statusMessage: `Migrating events ${completedBefore + 1}–${Math.min(completedBefore + chunk.length, cp.events.length)} of ${cp.events.length}...`,
    });

    try {
      const res = await migrateBatchToSheetsViaServer({
        articles: [],
        events: chunk,
        categories: !categoriesSynced ? cp.categories : [],
      });
      categoriesSynced = true;

      const succeeded = new Set([...res.migratedEventIds, ...res.duplicateEventIds]);
      cp.migratedEventIds = addUniqueStrings(cp.migratedEventIds, res.migratedEventIds);
      cp.duplicateEventIds = addUniqueStrings(cp.duplicateEventIds, res.duplicateEventIds);
      cp.failedEvents = mergeFailures(cp.failedEvents, res.failedEvents, succeeded);
      cp.migratedDriveImagesCount += res.migratedImages;
      cp.categoriesAddedCount += res.categoriesAdded;

      await emit(cp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch upload error.';
      await emit({
        ...cp,
        status: 'paused_user',
        lastError: `Upload interrupted on event batch (${chunk.map((c) => c.id).join(', ')}): ${msg}. All previous batches are safely saved — click Resume to continue.`,
        statusMessage: 'Upload interrupted. Checkpoint saved — safe to resume.',
      });
      return cp;
    }
  }

  return cp;
}

/**
 * PHASE 3: End-to-End Verification against Live Google Sheets Rows.
 * Confirms every exported article & event exists in Sheets with preserved publishing date,
 * category, content, and Google Drive image reference before ever claiming completion.
 */
export async function runMigrationVerification(
  initialCheckpoint: MigrationCheckpoint,
  onProgress: (cp: MigrationCheckpoint) => void
): Promise<MigrationCheckpoint> {
  let cp: MigrationCheckpoint = {
    ...initialCheckpoint,
    status: 'verifying',
    lastError: null,
    statusMessage: `Verifying all ${initialCheckpoint.articles.length} articles and ${initialCheckpoint.events.length} events directly against Google Sheets...`,
    updatedAt: new Date().toISOString(),
  };

  await saveMigrationCheckpoint(cp);
  onProgress(cp);

  const exportComplete = cp.articlesExportComplete && cp.eventsExportComplete;

  try {
    const verification = await verifyMigrationViaServer({
      expectedNews: cp.articles.map((a) => ({
        id: a.id,
        title: a.titleKannada,
        category: a.category,
        publishedDate: a.publishedDate,
        hadBase64Image: Boolean(a.imageUrl && a.imageUrl.startsWith('data:image/')),
        hadImageUrl: Boolean(a.imageUrl),
      })),
      expectedEvents: cp.events.map((e) => ({
        id: e.id,
        title: e.titleKannada,
        eventDate: e.eventDate,
        hadBase64Image: Boolean(e.imageUrl && e.imageUrl.startsWith('data:image/')),
        hadImageUrl: Boolean(e.imageUrl),
      })),
      exportComplete,
    });

      const verifiedNewsSet = new Set(verification.verifiedNewsIds);
      const verifiedEventSet = new Set(verification.verifiedEventIds);

      // Reconcile verified IDs into completed sets (fixes checkpoints from earlier Apps Script deployments)
      const reconciledMigratedArticles = addUniqueStrings(
        cp.migratedArticleIds,
        verification.verifiedNewsIds.filter((id) => !cp.duplicateArticleIds.includes(id))
      );
      const reconciledMigratedEvents = addUniqueStrings(
        cp.migratedEventIds,
        verification.verifiedEventIds.filter((id) => !cp.duplicateEventIds.includes(id))
      );
      const reconciledFailedArticles = cp.failedArticles.filter((f) => !verifiedNewsSet.has(f.id));
      const reconciledFailedEvents = cp.failedEvents.filter((f) => !verifiedEventSet.has(f.id));

      const hasFailures =
        reconciledFailedArticles.length > 0 ||
        reconciledFailedEvents.length > 0 ||
        verification.missingNewsIds.length > 0 ||
        verification.missingEventIds.length > 0 ||
        verification.mismatchedNews.length > 0 ||
        verification.mismatchedEvents.length > 0;

      let nextStatus: MigrationRunStatus;
      let nextMessage: string;

      if (verification.fullyVerifiedComplete && !hasFailures) {
        nextStatus = 'verified_complete';
        nextMessage = `Migration 100% Verified Complete: ${verification.verifiedNewsIds.length} historical news articles and ${verification.verifiedEventIds.length} events verified in Google Sheets & Drive.`;
      } else if (!exportComplete) {
        nextStatus = 'paused_quota';
        nextMessage = `Partial verification complete (${verification.verifiedNewsIds.length} news & ${verification.verifiedEventIds.length} events confirmed in Sheets), but Firebase historical export is NOT finished yet. Resume after quota resets to migrate remaining records.`;
      } else {
        nextStatus = 'completed_with_failures';
        nextMessage = `Verification found issues: ${verification.missingNewsIds.length + verification.missingEventIds.length} missing, ${verification.mismatchedNews.length + verification.mismatchedEvents.length} mismatched, ${reconciledFailedArticles.length + reconciledFailedEvents.length} failed. Review the report and retry failed records.`;
      }

      cp = {
        ...cp,
        migratedArticleIds: reconciledMigratedArticles,
        migratedEventIds: reconciledMigratedEvents,
        failedArticles: reconciledFailedArticles,
        failedEvents: reconciledFailedEvents,
        status: nextStatus,
        statusMessage: nextMessage,
        verification,
        updatedAt: new Date().toISOString(),
      };
    await saveMigrationCheckpoint(cp);
    onProgress(cp);
    return cp;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to run verification.';
    cp = {
      ...cp,
      status: 'completed_with_failures',
      lastError: `Verification failed: ${msg}. Do not assume migration is complete until verification succeeds.`,
      statusMessage: 'Verification could not complete. Click Verify Migrated Records to retry.',
      updatedAt: new Date().toISOString(),
    };
    await saveMigrationCheckpoint(cp);
    onProgress(cp);
    return cp;
  }
}

/**
 * Builds an itemized audit list of every historical record for the Migration Report UI & exports.
 */
export function buildDetailedAuditRecords(cp: MigrationCheckpoint): MigrationRecordAudit[] {
  const verifiedNewsSet = new Set(cp.verification?.verifiedNewsIds || []);
  const missingNewsSet = new Set(cp.verification?.missingNewsIds || []);
  const mismatchedNewsMap = new Map(
    (cp.verification?.mismatchedNews || []).map((m) => [m.id, m.reason])
  );
  const failedNewsMap = new Map(cp.failedArticles.map((f) => [f.id, f.reason]));
  const migratedNewsSet = new Set(cp.migratedArticleIds);
  const dupNewsSet = new Set(cp.duplicateArticleIds);

  const articleAudits: MigrationRecordAudit[] = cp.articles.map((a) => {
    let state: RecordMigrationState = 'exported';
    let error: string | undefined;

    if (failedNewsMap.has(a.id)) {
      state = 'failed';
      error = failedNewsMap.get(a.id);
    } else if (mismatchedNewsMap.has(a.id)) {
      state = 'failed';
      error = `Verification mismatch: ${mismatchedNewsMap.get(a.id)}`;
    } else if (missingNewsSet.has(a.id)) {
      state = 'failed';
      error = 'Missing from Google Sheet during post-migration verification';
    } else if (verifiedNewsSet.has(a.id)) {
      state = 'verified';
    } else if (dupNewsSet.has(a.id)) {
      state = 'duplicate';
    } else if (migratedNewsSet.has(a.id)) {
      state = 'migrated';
    }

    return {
      id: a.id,
      entityType: 'article',
      title: a.titleKannada || a.id,
      category: a.category,
      publishedDate: a.publishedDate || '',
      hadBase64Image: Boolean(a.imageUrl && a.imageUrl.startsWith('data:image/')),
      hadImageUrl: Boolean(a.imageUrl),
      state,
      error,
    };
  });

  const verifiedEvSet = new Set(cp.verification?.verifiedEventIds || []);
  const missingEvSet = new Set(cp.verification?.missingEventIds || []);
  const mismatchedEvMap = new Map(
    (cp.verification?.mismatchedEvents || []).map((m) => [m.id, m.reason])
  );
  const failedEvMap = new Map(cp.failedEvents.map((f) => [f.id, f.reason]));
  const migratedEvSet = new Set(cp.migratedEventIds);
  const dupEvSet = new Set(cp.duplicateEventIds);

  const eventAudits: MigrationRecordAudit[] = cp.events.map((e) => {
    let state: RecordMigrationState = 'exported';
    let error: string | undefined;

    if (failedEvMap.has(e.id)) {
      state = 'failed';
      error = failedEvMap.get(e.id);
    } else if (mismatchedEvMap.has(e.id)) {
      state = 'failed';
      error = `Verification mismatch: ${mismatchedEvMap.get(e.id)}`;
    } else if (missingEvSet.has(e.id)) {
      state = 'failed';
      error = 'Missing from Google Sheet during post-migration verification';
    } else if (verifiedEvSet.has(e.id)) {
      state = 'verified';
    } else if (dupEvSet.has(e.id)) {
      state = 'duplicate';
    } else if (migratedEvSet.has(e.id)) {
      state = 'migrated';
    }

    return {
      id: e.id,
      entityType: 'event',
      title: e.titleKannada || e.id,
      category: 'Programs & Events',
      publishedDate: e.eventDate || '',
      hadBase64Image: Boolean(e.imageUrl && e.imageUrl.startsWith('data:image/')),
      hadImageUrl: Boolean(e.imageUrl),
      state,
      error,
    };
  });

  return [...articleAudits, ...eventAudits];
}

export function buildMigrationReportJson(cp: MigrationCheckpoint): string {
  const progress = computeMigrationProgress(cp);
  const records = buildDetailedAuditRecords(cp);
  const report = {
    generatedAt: new Date().toISOString(),
    migrationStatus: cp.status,
    isFullyVerifiedComplete: progress.isFullyVerifiedComplete,
    firebaseExportComplete: progress.exportComplete,
    summary: {
      totalKnownRecords: progress.totalKnownRecords,
      exportedArticles: cp.articles.length,
      exportedEvents: cp.events.length,
      categoriesFound: cp.categories.length,
      migratedNewArticles: cp.migratedArticleIds.length,
      duplicateSkippedArticles: cp.duplicateArticleIds.length,
      migratedNewEvents: cp.migratedEventIds.length,
      duplicateSkippedEvents: cp.duplicateEventIds.length,
      base64PhotosUploadedToDrive: cp.migratedDriveImagesCount,
      verifiedRecords: progress.verifiedRecords,
      failedRecords: progress.failedRecords,
    },
    verification: cp.verification,
    successfulRecords: records.filter((r) => r.state === 'verified' || r.state === 'migrated' || r.state === 'duplicate'),
    failedRecords: records.filter((r) => r.state === 'failed'),
    pendingRecords: records.filter((r) => r.state === 'exported'),
  };
  return JSON.stringify(report, null, 2);
}

export function buildMigrationReportCsv(cp: MigrationCheckpoint): string {
  const records = buildDetailedAuditRecords(cp);
  const headers = ['firebaseDocId', 'type', 'title', 'category', 'publishedDate', 'hadBase64Photo', 'status', 'errorReason'];
  const lines = [headers.join(',')];
  for (const r of records) {
    const vals = [
      r.id,
      r.entityType,
      r.title,
      r.category,
      r.publishedDate,
      r.hadBase64Image ? 'YES' : 'NO',
      r.state.toUpperCase(),
      r.error || '',
    ];
    lines.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}
