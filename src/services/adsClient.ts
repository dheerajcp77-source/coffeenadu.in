import type {
  AdStatus,
  Advertisement,
  AdvertisementPayload,
  AdvertisementStats,
} from '../types/ads';
import { resolveActiveAdminBearerToken } from './admin2Client';
import { isSheetsStorageActive, uploadImageToDriveViaServer } from './sheetsStorageClient';

type ActiveAdsListener = (state: {
  ads: Advertisement[];
  loaded: boolean;
  error: string;
}) => void;

const activeAdsListeners = new Set<ActiveAdsListener>();
let activeAdsCache: Advertisement[] = [];
let activeAdsLoaded = false;
let activeAdsError = '';
let activeAdsInFlight: Promise<Advertisement[]> | null = null;
let lastFetchedAt = 0;

function notifyActiveAdsListeners() {
  const snapshot = {
    ads: activeAdsCache,
    loaded: activeAdsLoaded,
    error: activeAdsError,
  };
  for (const listener of activeAdsListeners) {
    listener(snapshot);
  }
}

export function subscribeToActiveAds(listener: ActiveAdsListener): () => void {
  activeAdsListeners.add(listener);
  listener({
    ads: activeAdsCache,
    loaded: activeAdsLoaded,
    error: activeAdsError,
  });
  return () => {
    activeAdsListeners.delete(listener);
  };
}

export async function loadActiveAds(forceRefresh = false): Promise<Advertisement[]> {
  const freshEnough = activeAdsLoaded && !forceRefresh && Date.now() - lastFetchedAt < 45_000;
  if (freshEnough) {
    return activeAdsCache;
  }
  if (activeAdsInFlight && !forceRefresh) {
    return activeAdsInFlight;
  }

  activeAdsInFlight = (async () => {
    try {
      const resp = await fetch('/api/ads', {
        headers: { Accept: 'application/json' },
        cache: forceRefresh ? 'no-store' : 'default',
      });
      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || !contentType.includes('application/json')) {
        throw new Error(`Unable to load advertisements (${resp.status}).`);
      }
      const json = (await resp.json()) as {
        ok?: boolean;
        items?: Advertisement[];
        error?: string;
      };
      if (!json.ok || !Array.isArray(json.items)) {
        throw new Error(json.error || 'Invalid advertisements response.');
      }
      activeAdsCache = json.items;
      activeAdsLoaded = true;
      activeAdsError = '';
      lastFetchedAt = Date.now();
      notifyActiveAdsListeners();
      return activeAdsCache;
    } catch (err) {
      activeAdsError =
        err instanceof Error ? err.message : 'Unable to load advertisements.';
      activeAdsLoaded = true;
      notifyActiveAdsListeners();
      return activeAdsCache;
    } finally {
      activeAdsInFlight = null;
    }
  })();

  return activeAdsInFlight;
}

export async function fetchActiveAdById(idOrNumber: string): Promise<Advertisement | null> {
  try {
    const resp = await fetch(`/api/ads/${encodeURIComponent(idOrNumber)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { ok?: boolean; item?: Advertisement };
    if (!json.ok || !json.item) return null;
    return json.item;
  } catch {
    return null;
  }
}

export async function trackAdInteraction(
  adId: string,
  type: 'view' | 'click'
): Promise<void> {
  if (!adId) return;
  try {
    await fetch(`/api/ads/${encodeURIComponent(adId)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
      keepalive: true,
    });
  } catch {
    // Non-fatal analytics tracking
  }
}

async function adsAdminFetch<T>(
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await resolveActiveAdminBearerToken();
  const resp = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const json = contentType.includes('application/json')
    ? ((await resp.json()) as T & { ok?: boolean; error?: string })
    : null;

  if (!resp.ok || !json || json.ok === false) {
    throw new Error(json?.error || `Advertisement request failed (${resp.status}).`);
  }
  return json;
}

export async function fetchAdminAds(): Promise<{
  ads: Advertisement[];
  stats: AdvertisementStats;
  nextAdNumber: string;
  todayYmd: string;
}> {
  return adsAdminFetch('/api/admin2/ads');
}

export async function createAdminAd(payload: AdvertisementPayload): Promise<{
  ad: Advertisement;
  stats: AdvertisementStats;
  nextAdNumber: string;
}> {
  const res = await adsAdminFetch<{
    ok: boolean;
    ad: Advertisement;
    stats: AdvertisementStats;
    nextAdNumber: string;
  }>('/api/admin2/ads', {
    method: 'POST',
    body: payload,
  });
  void loadActiveAds(true);
  return res;
}

export async function updateAdminAd(
  id: string,
  payload: AdvertisementPayload
): Promise<{
  ad: Advertisement;
  stats: AdvertisementStats;
}> {
  const res = await adsAdminFetch<{
    ok: boolean;
    ad: Advertisement;
    stats: AdvertisementStats;
  }>(`/api/admin2/ads/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload,
  });
  void loadActiveAds(true);
  return res;
}

export async function toggleAdminAdStatus(
  id: string,
  status: AdStatus
): Promise<{
  ad: Advertisement;
  stats: AdvertisementStats;
}> {
  const res = await adsAdminFetch<{
    ok: boolean;
    ad: Advertisement;
    stats: AdvertisementStats;
  }>(`/api/admin2/ads/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { status },
  });
  void loadActiveAds(true);
  return res;
}

export async function deleteAdminAd(id: string): Promise<{
  deletedId: string;
  stats: AdvertisementStats;
  nextAdNumber: string;
}> {
  const res = await adsAdminFetch<{
    ok: boolean;
    deletedId: string;
    stats: AdvertisementStats;
    nextAdNumber: string;
  }>(`/api/admin2/ads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  void loadActiveAds(true);
  return res;
}

async function decodeCleanImageFile(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback below
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected advertisement image.'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Processes and uploads an advertisement image WITHOUT adding any CoffeeNadu logo,
 * "2X" text, watermark, or overlay. Preserves the advertiser's original image intact.
 */
export async function processAndUploadAdImage(file: File): Promise<{
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  uploadedToDrive: boolean;
}> {
  const isImage =
    (file.type && file.type.startsWith('image/')) ||
    /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '');
  if (!isImage) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }

  const source = await decodeCleanImageFile(file);
  const preserveTransparency = file.type === 'image/png' || file.type === 'image/webp';
  const outMime = preserveTransparency ? 'image/png' : 'image/jpeg';

  try {
    const renderCleanVariant = (maxDim: number, quality: number, forceJpeg = false): string => {
      const longest = Math.max(source.width, source.height, 1);
      const scale = longest > maxDim ? maxDim / longest : 1;
      const targetWidth = Math.max(1, Math.round(source.width * scale));
      const targetHeight = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Image processing is not supported in this browser.');
      }
      const usePng = preserveTransparency && !forceJpeg;
      if (!usePng) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      source.draw(ctx, targetWidth, targetHeight);
      return usePng
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', quality);
    };

    let fullDataUrl = renderCleanVariant(1400, 0.88);
    if (fullDataUrl.length > 2_400_000) {
      fullDataUrl = renderCleanVariant(1400, 0.86, true);
    }

    const thumbDataUrl = renderCleanVariant(480, 0.78, true);

    const sheetsActive = await isSheetsStorageActive();
    if (sheetsActive) {
      const uploaded = await uploadImageToDriveViaServer({
        base64Data: fullDataUrl,
        thumbBase64: thumbDataUrl,
        mimeType: fullDataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
        fileName: `coffeenadu-ad-${Date.now()}.${fullDataUrl.startsWith('data:image/png') ? 'png' : 'jpg'}`,
      });
      return {
        imageUrl: uploaded.imageUrl,
        imageThumbUrl: uploaded.imageThumbUrl,
        imageDriveId: uploaded.fileId,
        uploadedToDrive: true,
      };
    }

    const fallbackUploaded = await adsAdminFetch<{
      ok: boolean;
      imageUrl: string;
      imageThumbUrl?: string;
    }>('/api/admin2/ads/upload-image', {
      method: 'POST',
      body: {
        base64Data: fullDataUrl,
        thumbBase64: thumbDataUrl,
      },
    });

    return {
      imageUrl: fallbackUploaded.imageUrl,
      imageThumbUrl: fallbackUploaded.imageThumbUrl,
      uploadedToDrive: false,
    };
  } finally {
    source.cleanup();
  }
}
