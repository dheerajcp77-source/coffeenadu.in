import type { ExtraNewsPhoto } from '../types/news';

export const MAX_EXTRA_NEWS_PHOTOS = 6;
const EXTRA_PHOTOS_SENTINEL_PREFIX = '__COFFEENADU_EXTRA_PHOTOS__:';

export function sanitizeExtraPhotos(input: unknown): ExtraNewsPhoto[] {
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

    if (cleaned.length >= MAX_EXTRA_NEWS_PHOTOS) break;
  }

  return cleaned;
}

export function isExtraPhotosSentinel(paragraph: string): boolean {
  return typeof paragraph === 'string' && paragraph.trim().startsWith(EXTRA_PHOTOS_SENTINEL_PREFIX);
}

/**
 * Extracts clean body paragraphs and any packed extra photos from a Google Sheets `fullContent` array.
 * Keeps compatibility with already-deployed Google Apps Script Web Apps without requiring redeploy.
 */
export function unpackBodyAndExtraPhotos(
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
        if (sanitized.length > 0) {
          packedExtras = sanitized;
        }
      } catch {
        // Ignore malformed sentinel cleanly
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

/**
 * Packs optional extra photos as a single hidden metadata entry at the end of `fullContent`
 * when saving to Google Sheets so existing Apps Script deployments persist them automatically.
 */
export function packBodyWithExtraPhotos(
  paragraphs: string[],
  extraImages?: ExtraNewsPhoto[]
): string[] {
  const cleanBody = paragraphs.filter((p) => typeof p === 'string' && !isExtraPhotosSentinel(p));
  const cleanExtras = sanitizeExtraPhotos(extraImages);
  if (cleanExtras.length === 0) {
    return cleanBody;
  }
  return [...cleanBody, `${EXTRA_PHOTOS_SENTINEL_PREFIX}${JSON.stringify(cleanExtras)}`];
}
