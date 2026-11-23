import firebaseConfig from '../../firebase-applet-config.json';

const CACHE_PREFIX = 'coffeenadu_fs_cache_v1:';
const QUOTA_COOLDOWN_MS = 60 * 1000;

export const FIRESTORE_QUOTA_UPGRADE_URL = `https://console.firebase.google.com/project/${encodeURIComponent(
  firebaseConfig.projectId
)}/firestore/databases/${encodeURIComponent(
  firebaseConfig.firestoreDatabaseId
)}/data?openUpgradeDialog=true`;

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  hasMore?: boolean;
}

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export interface QuotaStatus {
  quotaExceeded: boolean;
  lastErrorAt: number;
  cooldownUntil: number;
  message: string;
}

let quotaStatus: QuotaStatus = {
  quotaExceeded: false,
  lastErrorAt: 0,
  cooldownUntil: 0,
  message: '',
};

const quotaListeners = new Set<(status: QuotaStatus) => void>();

function notifyQuotaListeners(): void {
  const snapshot = { ...quotaStatus };
  quotaListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener errors
    }
  });
}

export function subscribeToQuotaStatus(listener: (status: QuotaStatus) => void): () => void {
  quotaListeners.add(listener);
  listener({ ...quotaStatus });
  return () => {
    quotaListeners.delete(listener);
  };
}

export function getQuotaStatus(): QuotaStatus {
  return { ...quotaStatus };
}

export function isQuotaCooldownActive(): boolean {
  return quotaStatus.quotaExceeded && Date.now() < quotaStatus.cooldownUntil;
}

export function isFirestoreQuotaError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error ?? '');
  const lower = raw.toLowerCase();
  const code = (error as { code?: string })?.code?.toLowerCase() || '';
  return (
    code === 'resource-exhausted' ||
    lower.includes('quota exceeded') ||
    lower.includes('resource-exhausted') ||
    lower.includes('resource_exhausted') ||
    lower.includes('free daily read units') ||
    lower.includes('429')
  );
}

export function markFirestoreQuotaExceeded(error?: unknown): void {
  const now = Date.now();
  const raw = error instanceof Error ? error.message : String(error || '');
  quotaStatus = {
    quotaExceeded: true,
    lastErrorAt: now,
    cooldownUntil: now + QUOTA_COOLDOWN_MS,
    message: raw.includes('Free daily read units')
      ? 'Daily free Firebase Firestore read quota has been reached. Showing cached content until the quota resets.'
      : 'Firebase Firestore daily read limit temporarily reached. Showing cached data cleanly.',
  };
  notifyQuotaListeners();
}

export function clearFirestoreQuotaExceeded(): void {
  if (!quotaStatus.quotaExceeded) return;
  quotaStatus = {
    quotaExceeded: false,
    lastErrorAt: 0,
    cooldownUntil: 0,
    message: '',
  };
  notifyQuotaListeners();
}

function readStorageEnvelope<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed && typeof parsed.cachedAt === 'number' && parsed.data !== undefined) {
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch {
    // Ignore storage read/parse errors
  }
  return null;
}

/**
 * Strips very large base64 image data URLs only if localStorage hits its browser size limit,
 * keeping all article/event text and smaller images cached safely.
 */
function compactLargeImagesForStorage<T>(data: T): T {
  if (Array.isArray(data)) {
    return data.slice(0, 25).map((item) => {
      if (item && typeof item === 'object') {
        const rec = { ...(item as Record<string, unknown>) };
        if (typeof rec.imageUrl === 'string' && rec.imageUrl.startsWith('data:') && rec.imageUrl.length > 50000) {
          delete rec.imageUrl;
        }
        return rec;
      }
      return item;
    }) as unknown as T;
  }
  if (data && typeof data === 'object') {
    const rec = { ...(data as Record<string, unknown>) };
    if (typeof rec.imageUrl === 'string' && rec.imageUrl.startsWith('data:') && rec.imageUrl.length > 50000) {
      delete rec.imageUrl;
    }
    return rec as T;
  }
  return data;
}

export function getCachedValue<T>(
  key: string,
  options?: { allowStale?: boolean }
): { data: T; isFresh: boolean; cachedAt: number; hasMore?: boolean } | null {
  const inMem = memoryCache.get(key) as CacheEnvelope<T> | undefined;
  const envelope = inMem ?? readStorageEnvelope<T>(key);
  if (!envelope) return null;

  const isFresh = Date.now() < envelope.expiresAt;
  if (!isFresh && !options?.allowStale) {
    return null;
  }
  return {
    data: envelope.data,
    isFresh,
    cachedAt: envelope.cachedAt,
    hasMore: envelope.hasMore,
  };
}

export function setCachedValue<T>(
  key: string,
  data: T,
  ttlMs: number,
  meta?: { hasMore?: boolean }
): void {
  const now = Date.now();
  const envelope: CacheEnvelope<T> = {
    data,
    cachedAt: now,
    expiresAt: now + ttlMs,
    hasMore: meta?.hasMore,
  };
  memoryCache.set(key, envelope);

  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(envelope));
  } catch {
    try {
      const compactEnvelope: CacheEnvelope<T> = {
        ...envelope,
        data: compactLargeImagesForStorage(data),
      };
      window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(compactEnvelope));
    } catch {
      // Ignore if browser storage is full/disabled
    }
  }
}

export function invalidateCacheKey(key: string): void {
  memoryCache.delete(key);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch {
    // Ignore storage removal errors
  }
}

export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
  if (typeof window === 'undefined') return;
  try {
    const fullPrefix = `${CACHE_PREFIX}${prefix}`;
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        keysToDelete.push(k);
      }
    }
    keysToDelete.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore storage errors
  }
}

export function dedupeInFlight<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const promise = fetcher().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}
