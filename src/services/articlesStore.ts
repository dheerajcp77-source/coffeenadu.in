import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { KOPPA_LOCATIONS, NEWS_CATEGORIES, SEED_ARTICLES } from '../constants/seedArticles';
import {
  OperationType,
  auth,
  db,
  ensureFreshVerifiedToken,
  handleFirestoreError,
} from '../firebase';
import type { ExtraNewsPhoto, ImageKey, NewsArticle, NewsCategory } from '../types/news';
import {
  packBodyWithExtraPhotos,
  sanitizeExtraPhotos,
  unpackBodyAndExtraPhotos,
} from '../utils/extraPhotos';
import {
  isArticleActivelyFeatured,
  normalizeFeaturedUntil,
  serializeLeadMetaToTags,
} from '../utils/featuredLead';
import {
  sanitizeInlineRichTextHtml,
  sanitizeRichTextHtml,
  stripRichTextToPlainText,
} from '../utils/richText';
import { validateCustomEnglishSlugInput } from '../utils/slug';
import { applyWatermarkToImageSrc } from '../utils/watermark';
import {
  clearFirestoreQuotaExceeded,
  dedupeInFlight,
  getCachedValue,
  invalidateCacheByPrefix,
  isFirestoreQuotaError,
  isQuotaCooldownActive,
  markFirestoreQuotaExceeded,
  setCachedValue,
} from './firestoreOptimizer';
import {
  createNewsViaSheets,
  deleteNewsViaSheets,
  fetchNewsByIdFromSheets,
  fetchNewsPageFromSheets,
  isSheetsStorageActive,
  recordAggregatedViewOnServer,
  toggleNewsLeadViaSheets,
  updateNewsViaSheets,
} from './sheetsStorageClient';

export const ARTICLES_PAGE_SIZE = 15;
const ARTICLES_CACHE_TTL_MS = 5 * 60 * 1000;
const SINGLE_ARTICLE_CACHE_TTL_MS = 10 * 60 * 1000;
const ADMINS_CACHE_TTL_MS = 15 * 60 * 1000;
const ARTICLES_LIST_CACHE_KEY = 'articles:feed_v1';
const ADMINS_LIST_CACHE_KEY = 'admins:directory_v1';

export interface ArticleMutationInput {
  customSlug?: string;
  titleKannada: string;
  summaryKannada: string;
  bodyKannada: string[];
  category: NewsCategory;
  location: string;
  reporter: string;
  imageKey: ImageKey;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  imageCaption?: string;
  extraImages?: ExtraNewsPhoto[];
  isFeatured: boolean;
  featuredUntil?: number;
  watermarkApplied?: boolean;
}

export interface AdminDirectoryEntry {
  uid: string;
  label: string;
  addedBy: string;
}

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

function sanitizeCategory(value: unknown): NewsCategory {
  if (typeof value === 'string' && NEWS_CATEGORIES.includes(value as NewsCategory)) {
    return value as NewsCategory;
  }
  return 'Local';
}

function sanitizeImageKey(value: unknown): ImageKey {
  if (typeof value === 'string' && VALID_IMAGE_KEYS.includes(value as ImageKey)) {
    return value as ImageKey;
  }
  return 'none';
}

function parseArticleTimestamp(dateStr: string, timeStr: string, fallbackOffsetMs = 0): number {
  const parsed = new Date(`${dateStr} ${timeStr}`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getTime();
  }
  const dateOnly = new Date(dateStr);
  if (!Number.isNaN(dateOnly.getTime())) {
    return dateOnly.getTime() + fallbackOffsetMs;
  }
  return Date.now() - fallbackOffsetMs;
}

const REMOVED_LEGACY_ARTICLE_IDS = new Set(['koppa-fog-advisory-01']);

function sortArticlesForFeed(list: NewsArticle[]): NewsArticle[] {
  const nowMs = Date.now();
  return [...list].sort((a, b) => {
    const featDiff =
      Number(isArticleActivelyFeatured(b, nowMs)) - Number(isArticleActivelyFeatured(a, nowMs));
    if (featDiff !== 0) return featDiff;
    const tsA = a.publishedTimestamp ?? parseArticleTimestamp(a.publishedDate, a.publishedTime);
    const tsB = b.publishedTimestamp ?? parseArticleTimestamp(b.publishedDate, b.publishedTime);
    return tsB - tsA;
  });
}

function mergeUniqueArticles(existing: NewsArticle[], incoming: NewsArticle[]): NewsArticle[] {
  const map = new Map<string, NewsArticle>();
  for (const item of existing) {
    if (!REMOVED_LEGACY_ARTICLE_IDS.has(item.id)) {
      map.set(item.id, item);
    }
  }
  for (const item of incoming) {
    if (!REMOVED_LEGACY_ARTICLE_IDS.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return sortArticlesForFeed(Array.from(map.values()));
}

function mapDocToArticle(docId: string, data: Record<string, unknown>): NewsArticle {
  const unpacked = unpackBodyAndExtraPhotos(data.bodyKannada, data.extraImages);
  return {
    id: typeof data.id === 'string' ? data.id : docId,
    titleKannada: typeof data.titleKannada === 'string' ? data.titleKannada : '',
    summaryKannada: typeof data.summaryKannada === 'string' ? data.summaryKannada : '',
    bodyKannada: unpacked.bodyKannada,
    category: sanitizeCategory(data.category),
    location: typeof data.location === 'string' ? data.location : KOPPA_LOCATIONS[0],
    publishedDate: typeof data.publishedDate === 'string' ? data.publishedDate : '',
    publishedTime: typeof data.publishedTime === 'string' ? data.publishedTime : '',
    publishedTimestamp:
      typeof data.publishedTimestamp === 'number' ? data.publishedTimestamp : undefined,
    readTimeMinutes: typeof data.readTimeMinutes === 'number' ? data.readTimeMinutes : 1,
    reporter: typeof data.reporter === 'string' ? data.reporter : 'Coffeenadu Desk',
    imageKey: sanitizeImageKey(data.imageKey),
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
    imageCaption:
      typeof data.imageCaption === 'string' && data.imageCaption ? data.imageCaption : undefined,
    extraImages: unpacked.extraImages.length > 0 ? unpacked.extraImages : undefined,
    isFeatured: Boolean(data.isFeatured),
    featuredUntil: normalizeFeaturedUntil(data.featuredUntil),
    authorUid: typeof data.authorUid === 'string' ? data.authorUid : undefined,
    viewCount: typeof data.viewCount === 'number' && Number.isFinite(data.viewCount) ? data.viewCount : 0,
    watermarkApplied: Boolean(data.watermarkApplied),
  };
}

function sanitizePayloadFields(input: ArticleMutationInput) {
  const titleKannada = sanitizeInlineRichTextHtml(input.titleKannada, false).slice(0, 1500);
  const plainTitle = stripRichTextToPlainText(titleKannada);
  const bodyKannada = input.bodyKannada
    .map((p) => sanitizeRichTextHtml(p).trim())
    .filter((p) => Boolean(p && stripRichTextToPlainText(p)))
    .slice(0, 60);
  const plainBodyText = bodyKannada.map((p) => stripRichTextToPlainText(p)).join(' ');
  const rawSummary = sanitizeInlineRichTextHtml(input.summaryKannada, true);
  const summaryKannada = (
    stripRichTextToPlainText(rawSummary)
      ? rawSummary
      : stripRichTextToPlainText(bodyKannada[0] || '')
  ).slice(0, 2500);

  if (!plainTitle || !stripRichTextToPlainText(summaryKannada) || bodyKannada.length === 0) {
    throw new Error('Kannada headline and full report are required.');
  }

  const location = (input.location.trim() || KOPPA_LOCATIONS[0]).slice(0, 60);
  const reporter = (input.reporter.trim() || 'Coffeenadu Desk').slice(0, 100);
  const category = sanitizeCategory(input.category);
  const imageKey = sanitizeImageKey(input.imageKey);
  const imageUrl = input.imageUrl?.trim() || '';
  const cleanCaption = sanitizeInlineRichTextHtml(input.imageCaption || '', false);
  const imageCaption = stripRichTextToPlainText(cleanCaption) ? cleanCaption.slice(0, 1000) : '';

  if (imageUrl.length > 350000) {
    throw new Error('Selected photo is still too large. Please choose a smaller photo.');
  }

  const readTimeMinutes = Math.min(
    120,
    Math.max(1, Math.ceil(plainBodyText.length / 450))
  );

  const isFeatured = Boolean(input.isFeatured);
  const featuredUntil = isFeatured ? normalizeFeaturedUntil(input.featuredUntil) : undefined;
  const extraImages = sanitizeExtraPhotos(input.extraImages);

  return {
    titleKannada,
    summaryKannada,
    bodyKannada,
    category,
    location,
    reporter,
    imageKey,
    imageUrl,
    imageCaption,
    extraImages,
    isFeatured,
    featuredUntil,
    readTimeMinutes,
    watermarkApplied: Boolean(imageUrl && input.watermarkApplied),
  };
}

// Shared reactive articles store (eliminates duplicate reads across routes/components)
let sharedArticles: NewsArticle[] = [];
let sharedArticlesLoaded = false;
let sharedHasMoreArticles = false;
let lastArticleCursorDoc: QueryDocumentSnapshot<DocumentData> | null = null;
let lastArticleCursorTimestamp: number | null = null;
let sheetsArticlesPage = 1;

type ArticlesStoreListener = (state: {
  articles: NewsArticle[];
  loaded: boolean;
  hasMore: boolean;
}) => void;

const storeListeners = new Set<ArticlesStoreListener>();

function emitArticlesState(): void {
  const payload = {
    articles: sharedArticles,
    loaded: sharedArticlesLoaded,
    hasMore: sharedHasMoreArticles,
  };
  storeListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Ignore listener errors
    }
  });
}

function updateSharedArticlesCache(list: NewsArticle[], hasMore: boolean): void {
  sharedArticles = list;
  sharedArticlesLoaded = true;
  sharedHasMoreArticles = hasMore;
  setCachedValue(ARTICLES_LIST_CACHE_KEY, list, ARTICLES_CACHE_TTL_MS, { hasMore });
  for (const item of list.slice(0, 30)) {
    setCachedValue(`articles:item:${item.id}`, item, SINGLE_ARTICLE_CACHE_TTL_MS);
  }
  emitArticlesState();
}

export function subscribeToArticlesState(listener: ArticlesStoreListener): () => void {
  storeListeners.add(listener);
  listener({
    articles: sharedArticles,
    loaded: sharedArticlesLoaded,
    hasMore: sharedHasMoreArticles,
  });
  return () => {
    storeListeners.delete(listener);
  };
}

export async function loadInitialArticles(options?: {
  forceRefresh?: boolean;
  pageSize?: number;
}): Promise<{
  articles: NewsArticle[];
  hasMore: boolean;
  fromCache: boolean;
  quotaExceeded?: boolean;
}> {
  const pageSize = options?.pageSize ?? ARTICLES_PAGE_SIZE;

  if (!options?.forceRefresh) {
    if (sharedArticlesLoaded && sharedArticles.length > 0) {
      const freshMem = getCachedValue<NewsArticle[]>(ARTICLES_LIST_CACHE_KEY);
      if (freshMem) {
        return {
          articles: sharedArticles,
          hasMore: sharedHasMoreArticles,
          fromCache: true,
        };
      }
    }

    const cached = getCachedValue<NewsArticle[]>(ARTICLES_LIST_CACHE_KEY);
    if (cached && cached.data.length > 0) {
      const cleaned = sortArticlesForFeed(
        cached.data.filter((a) => !REMOVED_LEGACY_ARTICLE_IDS.has(a.id))
      );
      sharedArticles = cleaned;
      sharedArticlesLoaded = true;
      sharedHasMoreArticles = Boolean(cached.hasMore);
      if (!lastArticleCursorTimestamp && cleaned.length > 0) {
        const minTs = Math.min(...cleaned.map((a) => a.publishedTimestamp ?? Number.MAX_SAFE_INTEGER));
        lastArticleCursorTimestamp = minTs < Number.MAX_SAFE_INTEGER ? minTs : null;
      }
      emitArticlesState();
      void syncArticleViewCountsFromServer();
      return {
        articles: cleaned,
        hasMore: sharedHasMoreArticles,
        fromCache: true,
      };
    }
  }

  if (isQuotaCooldownActive()) {
    const stale = getCachedValue<NewsArticle[]>(ARTICLES_LIST_CACHE_KEY, { allowStale: true });
    const fallback = stale?.data?.length
      ? sortArticlesForFeed(stale.data.filter((a) => !REMOVED_LEGACY_ARTICLE_IDS.has(a.id)))
      : sharedArticles.length > 0
      ? sharedArticles
      : sortArticlesForFeed(SEED_ARTICLES);
    sharedArticles = fallback;
    sharedArticlesLoaded = true;
    sharedHasMoreArticles = Boolean(stale?.hasMore);
    emitArticlesState();
    return {
      articles: fallback,
      hasMore: sharedHasMoreArticles,
      fromCache: true,
      quotaExceeded: true,
    };
  }

  return dedupeInFlight(`loadInitialArticles:${pageSize}:${Boolean(options?.forceRefresh)}`, async () => {
    if (await isSheetsStorageActive()) {
      try {
        const res = await fetchNewsPageFromSheets({
          page: 1,
          limit: pageSize,
          forceRefresh: Boolean(options?.forceRefresh),
        });
        clearFirestoreQuotaExceeded();
        sheetsArticlesPage = 1;
        const cleaned = res.articles.filter((a) => !REMOVED_LEGACY_ARTICLE_IDS.has(a.id));
        const list = cleaned.length > 0 ? sortArticlesForFeed(cleaned) : sortArticlesForFeed(SEED_ARTICLES);
        updateSharedArticlesCache(list, res.hasMore);
        return { articles: list, hasMore: res.hasMore, fromCache: res.fromCache };
      } catch {
        const stale = getCachedValue<NewsArticle[]>(ARTICLES_LIST_CACHE_KEY, { allowStale: true });
        if (stale?.data?.length) {
          const fallback = sortArticlesForFeed(
            stale.data.filter((a) => !REMOVED_LEGACY_ARTICLE_IDS.has(a.id))
          );
          sharedArticles = fallback;
          sharedArticlesLoaded = true;
          sharedHasMoreArticles = Boolean(stale.hasMore);
          emitArticlesState();
          return { articles: fallback, hasMore: sharedHasMoreArticles, fromCache: true };
        }
      }
    }

    const path = 'articles';
    try {
      const articlesQuery = query(
        collection(db, path),
        orderBy('publishedTimestamp', 'desc'),
        limit(pageSize)
      );
      const snapshot = await getDocs(articlesQuery);
      clearFirestoreQuotaExceeded();

      if (snapshot.empty) {
        const seed = sortArticlesForFeed(SEED_ARTICLES);
        lastArticleCursorDoc = null;
        lastArticleCursorTimestamp = null;
        updateSharedArticlesCache(seed, false);
        return { articles: seed, hasMore: false, fromCache: false };
      }

      lastArticleCursorDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
      const rawList = snapshot.docs
        .map((snap) => mapDocToArticle(snap.id, snap.data() as Record<string, unknown>))
        .filter((article) => !REMOVED_LEGACY_ARTICLE_IDS.has(article.id));

      const hasMore = snapshot.docs.length === pageSize;
      const list = rawList.length > 0 ? sortArticlesForFeed(rawList) : sortArticlesForFeed(SEED_ARTICLES);

      const timestamps = rawList
        .map((a) => a.publishedTimestamp)
        .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts));
      lastArticleCursorTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;

      updateSharedArticlesCache(list, hasMore);
      return { articles: list, hasMore, fromCache: false };
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      } else {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch {
          // Recorded for diagnostics; gracefully fall back to cached articles
        }
      }

      const stale = getCachedValue<NewsArticle[]>(ARTICLES_LIST_CACHE_KEY, { allowStale: true });
      const fallback = stale?.data?.length
        ? sortArticlesForFeed(stale.data.filter((a) => !REMOVED_LEGACY_ARTICLE_IDS.has(a.id)))
        : sharedArticles.length > 0
        ? sharedArticles
        : sortArticlesForFeed(SEED_ARTICLES);
      sharedArticles = fallback;
      sharedArticlesLoaded = true;
      sharedHasMoreArticles = Boolean(stale?.hasMore);
      emitArticlesState();
      return {
        articles: fallback,
        hasMore: sharedHasMoreArticles,
        fromCache: true,
        quotaExceeded: isFirestoreQuotaError(error),
      };
    }
  });
}

export async function loadMoreArticles(
  pageSize = ARTICLES_PAGE_SIZE
): Promise<{ articles: NewsArticle[]; hasMore: boolean; quotaExceeded?: boolean }> {
  if (!sharedHasMoreArticles || isQuotaCooldownActive()) {
    return {
      articles: sharedArticles,
      hasMore: sharedHasMoreArticles,
      quotaExceeded: isQuotaCooldownActive(),
    };
  }

  return dedupeInFlight(`loadMoreArticles:${lastArticleCursorTimestamp ?? sheetsArticlesPage}`, async () => {
    if (await isSheetsStorageActive()) {
      try {
        const nextPage = sheetsArticlesPage + 1;
        const res = await fetchNewsPageFromSheets({ page: nextPage, limit: pageSize });
        sheetsArticlesPage = nextPage;
        const nextBatch = res.articles.filter((a) => !REMOVED_LEGACY_ARTICLE_IDS.has(a.id));
        const merged = mergeUniqueArticles(sharedArticles, nextBatch);
        updateSharedArticlesCache(merged, res.hasMore);
        return { articles: merged, hasMore: res.hasMore };
      } catch {
        return { articles: sharedArticles, hasMore: sharedHasMoreArticles };
      }
    }

    const path = 'articles';
    try {
      let paginatedQuery;
      if (lastArticleCursorDoc) {
        paginatedQuery = query(
          collection(db, path),
          orderBy('publishedTimestamp', 'desc'),
          startAfter(lastArticleCursorDoc),
          limit(pageSize)
        );
      } else if (lastArticleCursorTimestamp !== null) {
        paginatedQuery = query(
          collection(db, path),
          orderBy('publishedTimestamp', 'desc'),
          startAfter(lastArticleCursorTimestamp),
          limit(pageSize)
        );
      } else {
        sharedHasMoreArticles = false;
        emitArticlesState();
        return { articles: sharedArticles, hasMore: false };
      }

      const snapshot = await getDocs(paginatedQuery);
      clearFirestoreQuotaExceeded();

      if (snapshot.empty) {
        sharedHasMoreArticles = false;
        updateSharedArticlesCache(sharedArticles, false);
        return { articles: sharedArticles, hasMore: false };
      }

      lastArticleCursorDoc = snapshot.docs[snapshot.docs.length - 1] ?? lastArticleCursorDoc;
      const nextBatch = snapshot.docs
        .map((snap) => mapDocToArticle(snap.id, snap.data() as Record<string, unknown>))
        .filter((article) => !REMOVED_LEGACY_ARTICLE_IDS.has(article.id));

      const timestamps = nextBatch
        .map((a) => a.publishedTimestamp)
        .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts));
      if (timestamps.length > 0) {
        lastArticleCursorTimestamp = Math.min(...timestamps);
      }

      const hasMore = snapshot.docs.length === pageSize;
      const merged = mergeUniqueArticles(sharedArticles, nextBatch);
      updateSharedArticlesCache(merged, hasMore);
      return { articles: merged, hasMore };
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
        return { articles: sharedArticles, hasMore: sharedHasMoreArticles, quotaExceeded: true };
      }
      return { articles: sharedArticles, hasMore: sharedHasMoreArticles };
    }
  });
}

export async function createArticleInFirestore(
  uid: string,
  input: ArticleMutationInput
): Promise<string> {
  const clean = sanitizePayloadFields(input);
  const slugValidation = validateCustomEnglishSlugInput(input.customSlug || '');
  if (slugValidation.error) {
    throw new Error(slugValidation.error);
  }
  const customNewsId = slugValidation.slug || undefined;

  await ensureFreshVerifiedToken(auth.currentUser);

  if (await isSheetsStorageActive()) {
    const serializedTags = serializeLeadMetaToTags('', {
      isFeatured: clean.isFeatured,
      featuredUntil: clean.featuredUntil,
    });
    const created = await createNewsViaSheets({
      newsId: customNewsId,
      isCustomSlug: Boolean(customNewsId),
      title: clean.titleKannada,
      description: clean.summaryKannada,
      fullContent: packBodyWithExtraPhotos(clean.bodyKannada, clean.extraImages),
      extraImages: clean.extraImages,
      category: clean.category,
      location: clean.location,
      language: 'kn',
      imageUrl: clean.imageUrl || '',
      imageThumbUrl: input.imageThumbUrl || '',
      imageDriveId: input.imageDriveId || '',
      imageCaption: clean.imageCaption || '',
      imageKey: clean.imageKey,
      watermarkApplied: clean.watermarkApplied,
      author: clean.reporter,
      authorUid: uid,
      readTimeMinutes: clean.readTimeMinutes,
      featured: clean.isFeatured,
      isFeatured: clean.isFeatured,
      featuredUntil: clean.featuredUntil ?? '',
      tags: serializedTags,
    });
    const updatedList = mergeUniqueArticles([created], sharedArticles);
    updateSharedArticlesCache(updatedList, sharedHasMoreArticles);
    return created.id;
  }

  const now = new Date();
  const id = customNewsId || `news-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`;
  const docPath = `articles/${id}`;
  if (customNewsId) {
    try {
      const existingSnap = await getDoc(doc(db, 'articles', id));
      if (existingSnap.exists()) {
        throw new Error(
          `The custom English URL "${id}" is already used by another article. Please choose a different English URL.`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('already used by another article')) {
        throw error;
      }
    }
  }
  const publishedDate = now
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .slice(0, 30);
  const publishedTime = now
    .toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    })
    .slice(0, 30);
  const publishedTimestamp = now.getTime();

  const docPayload: Record<string, unknown> = {
    id,
    titleKannada: clean.titleKannada,
    summaryKannada: clean.summaryKannada,
    bodyKannada: clean.bodyKannada,
    category: clean.category,
    location: clean.location,
    publishedDate,
    publishedTime,
    publishedTimestamp,
    readTimeMinutes: clean.readTimeMinutes,
    reporter: clean.reporter,
    imageKey: clean.imageKey,
    isFeatured: clean.isFeatured,
    authorUid: uid,
    viewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (clean.imageUrl) {
    docPayload.imageUrl = clean.imageUrl;
    docPayload.watermarkApplied = clean.watermarkApplied;
  } else {
    docPayload.watermarkApplied = false;
  }
  if (clean.imageCaption) {
    docPayload.imageCaption = clean.imageCaption;
  }
  if (clean.extraImages.length > 0) {
    docPayload.extraImages = clean.extraImages;
  }
  if (clean.isFeatured && clean.featuredUntil) {
    docPayload.featuredUntil = clean.featuredUntil;
  }

  try {
    await setDoc(doc(db, 'articles', id), docPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }

  const createdArticle: NewsArticle = {
    id,
    titleKannada: clean.titleKannada,
    summaryKannada: clean.summaryKannada,
    bodyKannada: clean.bodyKannada,
    category: clean.category,
    location: clean.location,
    publishedDate,
    publishedTime,
    publishedTimestamp,
    readTimeMinutes: clean.readTimeMinutes,
    reporter: clean.reporter,
    imageKey: clean.imageKey,
    imageUrl: clean.imageUrl || undefined,
    imageCaption: clean.imageCaption || undefined,
    extraImages: clean.extraImages.length > 0 ? clean.extraImages : undefined,
    isFeatured: clean.isFeatured,
    featuredUntil: clean.featuredUntil,
    authorUid: uid,
    viewCount: 0,
    watermarkApplied: clean.watermarkApplied,
  };
  const updatedList = mergeUniqueArticles([createdArticle], sharedArticles);
  updateSharedArticlesCache(updatedList, sharedHasMoreArticles);
  return id;
}

export async function updateArticleInFirestore(
  _uid: string,
  articleId: string,
  input: ArticleMutationInput
): Promise<void> {
  const clean = sanitizePayloadFields(input);
  await ensureFreshVerifiedToken(auth.currentUser);

  if (await isSheetsStorageActive()) {
    const existing = sharedArticles.find((item) => item.id === articleId);
    const serializedTags = serializeLeadMetaToTags(existing?.tags, {
      isFeatured: clean.isFeatured,
      featuredUntil: clean.featuredUntil,
    });
    const updated = await updateNewsViaSheets(articleId, {
      title: clean.titleKannada,
      description: clean.summaryKannada,
      fullContent: packBodyWithExtraPhotos(clean.bodyKannada, clean.extraImages),
      extraImages: clean.extraImages,
      category: clean.category,
      location: clean.location,
      imageUrl: clean.imageUrl || '',
      imageThumbUrl: input.imageThumbUrl || '',
      imageDriveId: input.imageDriveId || '',
      imageCaption: clean.imageCaption || '',
      imageKey: clean.imageKey,
      watermarkApplied: Boolean(clean.imageUrl && clean.watermarkApplied),
      author: clean.reporter,
      readTimeMinutes: clean.readTimeMinutes,
      featured: clean.isFeatured,
      isFeatured: clean.isFeatured,
      featuredUntil: clean.featuredUntil ?? '',
      tags: serializedTags,
    });
    const normalizedUpdated: NewsArticle = {
      ...updated,
      bodyKannada: clean.bodyKannada,
      extraImages: clean.extraImages.length > 0 ? clean.extraImages : undefined,
      isFeatured: clean.isFeatured,
      featuredUntil: clean.featuredUntil,
      tags: serializedTags,
    };
    invalidateCacheByPrefix(ARTICLES_LIST_CACHE_KEY);
    invalidateCacheByPrefix(`articles:item:${articleId}`);
    const nextList = sortArticlesForFeed(
      sharedArticles.map((item) => (item.id === articleId ? normalizedUpdated : item))
    );
    updateSharedArticlesCache(nextList, sharedHasMoreArticles);
    return;
  }

  const docPath = `articles/${articleId}`;
  try {
    await updateDoc(doc(db, 'articles', articleId), {
      titleKannada: clean.titleKannada,
      summaryKannada: clean.summaryKannada,
      bodyKannada: clean.bodyKannada,
      category: clean.category,
      location: clean.location,
      reporter: clean.reporter,
      imageKey: clean.imageKey,
      imageUrl: clean.imageUrl ? clean.imageUrl : deleteField(),
      imageCaption: clean.imageCaption ? clean.imageCaption : deleteField(),
      extraImages: clean.extraImages.length > 0 ? clean.extraImages : deleteField(),
      isFeatured: clean.isFeatured,
      featuredUntil: clean.isFeatured && clean.featuredUntil ? clean.featuredUntil : deleteField(),
      readTimeMinutes: clean.readTimeMinutes,
      watermarkApplied: clean.imageUrl ? clean.watermarkApplied : false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }

  invalidateCacheByPrefix(`articles:item:${articleId}`);
  const nextList = sortArticlesForFeed(
    sharedArticles.map((item) =>
      item.id === articleId
        ? {
            ...item,
            titleKannada: clean.titleKannada,
            summaryKannada: clean.summaryKannada,
            bodyKannada: clean.bodyKannada,
            category: clean.category,
            location: clean.location,
            reporter: clean.reporter,
            imageKey: clean.imageKey,
            imageUrl: clean.imageUrl || undefined,
            imageCaption: clean.imageCaption || undefined,
            extraImages: clean.extraImages.length > 0 ? clean.extraImages : undefined,
            isFeatured: clean.isFeatured,
            featuredUntil: clean.featuredUntil,
            readTimeMinutes: clean.readTimeMinutes,
            watermarkApplied: Boolean(clean.imageUrl && clean.watermarkApplied),
          }
        : item
    )
  );
  updateSharedArticlesCache(nextList, sharedHasMoreArticles);
}

export async function toggleArticleLeadStory(
  articleId: string,
  isFeatured: boolean,
  featuredUntil?: number
): Promise<void> {
  await ensureFreshVerifiedToken(auth.currentUser);
  const existing = sharedArticles.find((item) => item.id === articleId);
  const validUntil = isFeatured ? normalizeFeaturedUntil(featuredUntil) : undefined;

  if (await isSheetsStorageActive()) {
    const res = await toggleNewsLeadViaSheets(articleId, {
      isFeatured,
      featuredUntil: validUntil,
      existingTags: existing?.tags,
    });
    invalidateCacheByPrefix(ARTICLES_LIST_CACHE_KEY);
    invalidateCacheByPrefix(`articles:item:${articleId}`);
    const nextList = sortArticlesForFeed(
      sharedArticles.map((item) =>
        item.id === articleId
          ? {
              ...item,
              isFeatured: res.featured,
              featuredUntil: res.featuredUntil,
              tags: res.tags,
            }
          : item
      )
    );
    updateSharedArticlesCache(nextList, sharedHasMoreArticles);
    return;
  }

  const docPath = `articles/${articleId}`;
  try {
    await updateDoc(doc(db, 'articles', articleId), {
      isFeatured,
      featuredUntil: isFeatured && validUntil ? validUntil : deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }

  invalidateCacheByPrefix(ARTICLES_LIST_CACHE_KEY);
  invalidateCacheByPrefix(`articles:item:${articleId}`);
  const nextList = sortArticlesForFeed(
    sharedArticles.map((item) =>
      item.id === articleId
        ? {
            ...item,
            isFeatured,
            featuredUntil: validUntil,
          }
        : item
    )
  );
  updateSharedArticlesCache(nextList, sharedHasMoreArticles);
}

export async function getArticleByIdFromFirestore(articleId: string): Promise<NewsArticle | null> {
  const cleanId = articleId.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanId) || REMOVED_LEGACY_ARTICLE_IDS.has(cleanId)) {
    return null;
  }

  // 1. Check already loaded articles in memory
  const inMemory = sharedArticles.find((a) => a.id === cleanId);
  if (inMemory) return inMemory;

  // 2. Check fresh per-article cache
  const itemCacheKey = `articles:item:${cleanId}`;
  const cachedItem = getCachedValue<NewsArticle>(itemCacheKey);
  if (cachedItem) {
    return cachedItem.data;
  }

  // 3. Check cached feed list before hitting network
  const feedCache = getCachedValue<NewsArticle[]>(ARTICLES_LIST_CACHE_KEY, { allowStale: true });
  const inFeedCache = feedCache?.data?.find((a) => a.id === cleanId);
  if (inFeedCache && (feedCache?.isFresh || isQuotaCooldownActive())) {
    return inFeedCache;
  }

  if (isQuotaCooldownActive()) {
    const staleItem = getCachedValue<NewsArticle>(itemCacheKey, { allowStale: true });
    if (staleItem) return staleItem.data;
    return SEED_ARTICLES.find((a) => a.id === cleanId) ?? null;
  }

  return dedupeInFlight(itemCacheKey, async () => {
    if (await isSheetsStorageActive()) {
      try {
        const fromSheets = await fetchNewsByIdFromSheets(cleanId);
        if (fromSheets) {
          setCachedValue(itemCacheKey, fromSheets, SINGLE_ARTICLE_CACHE_TTL_MS);
          return fromSheets;
        }
      } catch {
        // Fall through to cached or seed fallback
      }
    }

    try {
      const snap = await getDoc(doc(db, 'articles', cleanId));
      clearFirestoreQuotaExceeded();
      if (snap.exists()) {
        const mapped = mapDocToArticle(snap.id, snap.data() as Record<string, unknown>);
        setCachedValue(itemCacheKey, mapped, SINGLE_ARTICLE_CACHE_TTL_MS);
        return mapped;
      }
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      }
      const staleItem = getCachedValue<NewsArticle>(itemCacheKey, { allowStale: true });
      if (staleItem) return staleItem.data;
      if (inFeedCache) return inFeedCache;
    }
    return SEED_ARTICLES.find((a) => a.id === cleanId) ?? null;
  });
}

export async function removeLegacyFogArticleIfPresent(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      if (window.sessionStorage.getItem('coffeenadu_fog_purged') === '1') return;
      window.sessionStorage.setItem('coffeenadu_fog_purged', '1');
    } catch {
      // Proceed cleanly
    }
  }
  if (isQuotaCooldownActive() || !auth.currentUser) return;
  try {
    if (await isSheetsStorageActive()) return;
    await ensureFreshVerifiedToken(auth.currentUser);
    for (const legacyId of REMOVED_LEGACY_ARTICLE_IDS) {
      await deleteDoc(doc(db, 'articles', legacyId));
    }
  } catch {
    // Filtered from client display regardless
  }
}

export async function backfillArticleWatermarks(articles: NewsArticle[]): Promise<number> {
  if (isQuotaCooldownActive()) return 0;
  const candidates = articles.filter((a) => Boolean(a.imageUrl?.trim()) && !a.watermarkApplied);
  if (candidates.length === 0) return 0;

  await ensureFreshVerifiedToken(auth.currentUser);
  let processed = 0;

  for (const article of candidates) {
    if (!article.imageUrl || isQuotaCooldownActive()) break;
    try {
      const watermarkedDataUrl = await applyWatermarkToImageSrc(article.imageUrl);
      await updateDoc(doc(db, 'articles', article.id), {
        imageUrl: watermarkedDataUrl,
        watermarkApplied: true,
        updatedAt: serverTimestamp(),
      });
      processed += 1;
      sharedArticles = sharedArticles.map((item) =>
        item.id === article.id ? { ...item, imageUrl: watermarkedDataUrl, watermarkApplied: true } : item
      );
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markFirestoreQuotaExceeded(err);
        break;
      }
      // Skip items that cannot be re-encoded in browser (canvas component still renders watermark)
    }
  }

  if (processed > 0) {
    updateSharedArticlesCache(sharedArticles, sharedHasMoreArticles);
  }
  return processed;
}

export async function deleteArticleInFirestore(_uid: string, articleId: string): Promise<void> {
  await ensureFreshVerifiedToken(auth.currentUser);

  if (await isSheetsStorageActive()) {
    await deleteNewsViaSheets(articleId);
    const remaining = sharedArticles.filter((a) => a.id !== articleId);
    invalidateCacheByPrefix(`articles:item:${articleId}`);
    updateSharedArticlesCache(remaining, sharedHasMoreArticles);
    return;
  }

  const docPath = `articles/${articleId}`;
  try {
    await deleteDoc(doc(db, 'articles', articleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }

  const remaining = sharedArticles.filter((a) => a.id !== articleId);
  invalidateCacheByPrefix(`articles:item:${articleId}`);
  updateSharedArticlesCache(remaining, sharedHasMoreArticles);
}

export function applyConfirmedArticleViewCount(
  articleId: string,
  confirmedViews: number
): void {
  const cleanId = articleId.trim();
  if (!cleanId || !Number.isFinite(confirmedViews) || confirmedViews < 0) return;

  let changedInFeed = false;
  if (sharedArticles.some((item) => item.id === cleanId)) {
    sharedArticles = sharedArticles.map((item) => {
      if (item.id !== cleanId) return item;
      const nextViews = Math.max(item.viewCount ?? 0, confirmedViews);
      if (nextViews === (item.viewCount ?? 0)) return item;
      changedInFeed = true;
      return { ...item, viewCount: nextViews };
    });
    if (changedInFeed) {
      updateSharedArticlesCache(sharedArticles, sharedHasMoreArticles);
    }
  }

  const itemCacheKey = `articles:item:${cleanId}`;
  const cachedSingle = getCachedValue<NewsArticle>(itemCacheKey, { allowStale: true });
  if (cachedSingle?.data) {
    const nextViews = Math.max(cachedSingle.data.viewCount ?? 0, confirmedViews);
    if (nextViews !== (cachedSingle.data.viewCount ?? 0)) {
      setCachedValue(
        itemCacheKey,
        { ...cachedSingle.data, viewCount: nextViews },
        SINGLE_ARTICLE_CACHE_TTL_MS
      );
    }
  }
}

export async function syncArticleViewCountsFromServer(): Promise<Record<string, number> | null> {
  try {
    const resp = await fetch('/api/articles/views', { cache: 'no-store' });
    if (!resp.ok) return null;
    const json = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      viewsById?: Record<string, number>;
    } | null;
    if (!json?.ok || !json.viewsById || typeof json.viewsById !== 'object') {
      return null;
    }

    const viewsById = json.viewsById;
    let changed = false;
    if (sharedArticles.length > 0) {
      sharedArticles = sharedArticles.map((item) => {
        const serverViews = viewsById[item.id];
        if (typeof serverViews === 'number' && Number.isFinite(serverViews)) {
          const nextViews = Math.max(item.viewCount ?? 0, serverViews);
          if (nextViews !== (item.viewCount ?? 0)) {
            changed = true;
            return { ...item, viewCount: nextViews };
          }
        }
        return item;
      });
      if (changed) {
        updateSharedArticlesCache(sharedArticles, sharedHasMoreArticles);
      }
    }

    for (const [id, serverViews] of Object.entries(viewsById)) {
      if (typeof serverViews !== 'number' || !Number.isFinite(serverViews)) continue;
      const itemCacheKey = `articles:item:${id}`;
      const cachedSingle = getCachedValue<NewsArticle>(itemCacheKey, { allowStale: true });
      if (cachedSingle?.data) {
        const nextViews = Math.max(cachedSingle.data.viewCount ?? 0, serverViews);
        if (nextViews !== (cachedSingle.data.viewCount ?? 0)) {
          setCachedValue(
            itemCacheKey,
            { ...cachedSingle.data, viewCount: nextViews },
            SINGLE_ARTICLE_CACHE_TTL_MS
          );
        }
      }
    }

    return viewsById;
  } catch {
    return null;
  }
}

export async function recordArticleView(
  articleOrId: string | NewsArticle
): Promise<number | null> {
  const cleanId = (typeof articleOrId === 'string' ? articleOrId : articleOrId.id).trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanId)) return null;

  const providedArticle = typeof articleOrId === 'string' ? null : articleOrId;
  const cachedSingle = getCachedValue<NewsArticle>(`articles:item:${cleanId}`, { allowStale: true });
  const fromShared = sharedArticles.find((a) => a.id === cleanId) || cachedSingle?.data || null;
  const refArticle = providedArticle || fromShared;
  const baselineViews = Math.max(
    0,
    Number(providedArticle?.viewCount ?? 0),
    Number(fromShared?.viewCount ?? 0)
  );

  // Always record every genuine view on the backend API (no referrer, session, or IP limits)
  const serverResult = await recordAggregatedViewOnServer('article', cleanId, {
    title: refArticle ? stripRichTextToPlainText(refArticle.titleKannada) : undefined,
    category: refArticle?.category,
    location: refArticle?.location,
    publishedDate: refArticle?.publishedDate,
    baselineViews,
  });

  let firestoreConfirmed = false;
  const sheetsActive = await isSheetsStorageActive();
  if (!sheetsActive && !isQuotaCooldownActive()) {
    try {
      await updateDoc(doc(db, 'articles', cleanId), {
        viewCount: increment(1),
      });
      firestoreConfirmed = true;
    } catch {
      // Non-fatal if article exists only in local store/seed or Firestore quota/offline
    }
  }

  if (serverResult?.ok) {
    applyConfirmedArticleViewCount(cleanId, serverResult.views);
    return serverResult.views;
  }

  if (firestoreConfirmed) {
    const fallbackViews = baselineViews + 1;
    applyConfirmedArticleViewCount(cleanId, fallbackViews);
    return fallbackViews;
  }

  return null;
}

export async function listAdminRecordsFromFirestore(
  forceRefresh = false
): Promise<AdminDirectoryEntry[]> {
  if (!forceRefresh) {
    const cached = getCachedValue<AdminDirectoryEntry[]>(ADMINS_LIST_CACHE_KEY);
    if (cached) {
      return cached.data;
    }
  }

  if (isQuotaCooldownActive()) {
    const stale = getCachedValue<AdminDirectoryEntry[]>(ADMINS_LIST_CACHE_KEY, { allowStale: true });
    if (stale) return stale.data;
  }

  const path = 'admins';
  return dedupeInFlight(ADMINS_LIST_CACHE_KEY, async () => {
    try {
      const snap = await getDocs(query(collection(db, path), limit(50)));
      clearFirestoreQuotaExceeded();
      const entries = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          uid: typeof data.uid === 'string' ? data.uid : d.id,
          label: typeof data.label === 'string' ? data.label : 'Editor',
          addedBy: typeof data.addedBy === 'string' ? data.addedBy : '',
        };
      });
      setCachedValue(ADMINS_LIST_CACHE_KEY, entries, ADMINS_CACHE_TTL_MS);
      return entries;
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
        const stale = getCachedValue<AdminDirectoryEntry[]>(ADMINS_LIST_CACHE_KEY, {
          allowStale: true,
        });
        if (stale) return stale.data;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  });
}

export async function addAdminRecordInFirestore(
  currentUid: string,
  targetUid: string,
  label: string
): Promise<void> {
  const cleanUid = targetUid.trim();
  const cleanLabel = label.trim().slice(0, 100);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanUid)) {
    throw new Error('Please enter a valid Firebase User UID.');
  }
  if (!cleanLabel) {
    throw new Error('Please enter an editor name or label.');
  }
  const docPath = `admins/${cleanUid}`;
  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      uid: cleanUid,
      label: cleanLabel,
      addedBy: currentUid,
      createdAt: serverTimestamp(),
    });
    invalidateCacheByPrefix('admins:');
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function removeAdminRecordInFirestore(targetUid: string): Promise<void> {
  const docPath = `admins/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'admins', targetUid));
    invalidateCacheByPrefix('admins:');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
