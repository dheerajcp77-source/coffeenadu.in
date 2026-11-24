import type { Advertisement, AdvertisementStats } from '../types/ads';
import { PUBLIC_SHARE_ORIGIN, getDeepLinkShareOrigin } from './slug';

const VALID_AD_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns today's YYYY-MM-DD string in India Standard Time (Asia/Kolkata)
 * so publish/expiry windows match Koppa Taluk local dates consistently.
 */
export function getTodayIstYmd(nowMs = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(nowMs));
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback below
  }
  const dt = new Date(nowMs);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToYmd(baseYmd: string, days: number): string {
  const parts = baseYmd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return getTodayIstYmd(Date.now() + days * 86_400_000);
  }
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return dt.toISOString().slice(0, 10);
}

export function isValidYmd(value: string | undefined | null): value is string {
  if (!value || !VALID_AD_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isAdExpired(
  ad: Pick<Advertisement, 'expiryDate'>,
  todayYmd = getTodayIstYmd()
): boolean {
  if (!isValidYmd(ad.expiryDate)) return false;
  return ad.expiryDate < todayYmd;
}

export function isAdScheduledFuture(
  ad: Pick<Advertisement, 'publishDate'>,
  todayYmd = getTodayIstYmd()
): boolean {
  if (!isValidYmd(ad.publishDate)) return false;
  return ad.publishDate > todayYmd;
}

export function isAdCurrentlyActive(
  ad: Pick<Advertisement, 'status' | 'publishDate' | 'expiryDate'>,
  todayYmd = getTodayIstYmd()
): boolean {
  if (ad.status !== 'active') return false;
  if (isAdExpired(ad, todayYmd)) return false;
  if (isAdScheduledFuture(ad, todayYmd)) return false;
  return true;
}

export type EffectiveAdLifecycle = 'active' | 'inactive' | 'expired' | 'draft' | 'scheduled';

export function getAdLifecycleState(
  ad: Pick<Advertisement, 'status' | 'publishDate' | 'expiryDate'>,
  todayYmd = getTodayIstYmd()
): EffectiveAdLifecycle {
  if (ad.status === 'draft') return 'draft';
  if (isAdExpired(ad, todayYmd)) return 'expired';
  if (ad.status === 'inactive') return 'inactive';
  if (isAdScheduledFuture(ad, todayYmd)) return 'scheduled';
  return 'active';
}

export function computeAdStats(
  ads: Advertisement[],
  todayYmd = getTodayIstYmd()
): AdvertisementStats {
  let active = 0;
  let inactive = 0;
  let expired = 0;
  let draft = 0;

  for (const ad of ads) {
    if (ad.status === 'draft') {
      draft += 1;
    } else if (isAdExpired(ad, todayYmd)) {
      expired += 1;
    } else if (ad.status === 'inactive') {
      inactive += 1;
    } else {
      active += 1;
    }
  }

  return {
    total: ads.length,
    active,
    inactive,
    expired,
    draft,
  };
}

export function formatAdNumber(sequenceNum: number): string {
  const safeNum = Math.max(1, Math.floor(sequenceNum));
  return `AD${String(safeNum).padStart(3, '0')}`;
}

export function sanitizeExternalWebsiteUrl(raw: string | undefined | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Reject invalid or unsafe protocols (javascript:, data:, etc.)
  }
  return '';
}

export function sanitizePhoneDigits(raw: string | undefined | null): string {
  return (raw || '').replace(/[^\d+]/g, '').slice(0, 20);
}

export function buildWhatsAppAdHref(
  whatsappNumber: string,
  ad: Pick<Advertisement, 'adNumber' | 'title'>
): string {
  const digits = whatsappNumber.replace(/\D/g, '');
  if (!digits) return '';
  const normalizedDigits = digits.length === 10 ? `91${digits}` : digits;
  const plainTitle = ad.title.replace(/<[^>]+>/g, '').trim();
  const msg = `Hello, I saw your advertisement (${ad.adNumber}: ${plainTitle}) on CoffeeNadu News.`;
  return `https://wa.me/${normalizedDigits}?text=${encodeURIComponent(msg)}`;
}

export function buildTelHref(phoneNumber: string): string {
  const cleaned = sanitizePhoneDigits(phoneNumber);
  if (!cleaned) return '';
  return `tel:${cleaned}`;
}

export function buildAdPublicUrl(adId: string, origin?: string): string {
  const base = (
    origin !== undefined ? origin : getDeepLinkShareOrigin() || PUBLIC_SHARE_ORIGIN
  ).replace(/\/+$/, '');
  return `${base}/ads?ad=${encodeURIComponent(adId)}`;
}

export function formatReadableAdDate(ymd: string): string {
  if (!isValidYmd(ymd)) return ymd || '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const AD_IMPRESSIONS_STORAGE_KEY = 'cn_ad_fair_counts_v1';

function readSessionImpressions(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(AD_IMPRESSIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // Ignore restricted sessionStorage
  }
  return {};
}

function writeSessionImpressions(counts: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AD_IMPRESSIONS_STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // Ignore restricted sessionStorage
  }
}

/**
 * Fair least-recently-shown rotation so every active advertisement receives balanced visibility.
 */
export function selectFairRotatedAd(
  activeAds: Advertisement[],
  excludeIds: string[] = []
): Advertisement | null {
  if (!activeAds || activeAds.length === 0) return null;
  const excludeSet = new Set(excludeIds);
  const candidates = activeAds.filter((a) => !excludeSet.has(a.id));
  const pool = candidates.length > 0 ? candidates : activeAds;

  if (pool.length === 1) {
    const only = pool[0];
    const counts = readSessionImpressions();
    counts[only.id] = (counts[only.id] || 0) + 1;
    writeSessionImpressions(counts);
    return only;
  }

  const counts = readSessionImpressions();
  let minCount = Number.POSITIVE_INFINITY;
  let leastShown: Advertisement[] = [];

  for (const ad of pool) {
    const c = Number(counts[ad.id]) || 0;
    if (c < minCount) {
      minCount = c;
      leastShown = [ad];
    } else if (c === minCount) {
      leastShown.push(ad);
    }
  }

  const chosen = leastShown[Math.floor(Math.random() * leastShown.length)] || pool[0];
  counts[chosen.id] = (Number(counts[chosen.id]) || 0) + 1;
  writeSessionImpressions(counts);
  return chosen;
}

export function orderAdsForFairSlider(activeAds: Advertisement[]): Advertisement[] {
  if (activeAds.length <= 1) return activeAds;
  const counts = readSessionImpressions();
  let bestIdx = 0;
  let bestCount = Number.POSITIVE_INFINITY;
  activeAds.forEach((ad, idx) => {
    const c = Number(counts[ad.id]) || 0;
    if (c < bestCount) {
      bestCount = c;
      bestIdx = idx;
    }
  });
  return [...activeAds.slice(bestIdx), ...activeAds.slice(0, bestIdx)];
}
