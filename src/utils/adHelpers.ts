import {
  AD_CATEGORIES,
  AD_CTA_LABELS,
  DEFAULT_KANNADA_SHARE_TEMPLATE,
  type AdDeviceTarget,
  type AdPlacementSlotKey,
  type AdPlacementsConfig,
  type AdPlatformSettings,
  type AdPriority,
  type Advertisement,
  type AdvertisementStats,
} from '../types/ads';
import { PUBLIC_SHARE_ORIGIN, getDeepLinkShareOrigin } from './slug.ts';

const VALID_AD_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function mergeAdCategories(customCategories?: string[] | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cat of [...AD_CATEGORIES, ...(customCategories || [])]) {
    const clean = String(cat || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function createDefaultAdPlacements(): AdPlacementsConfig {
  return {
    articlePopup: {
      enabled: false,
      scrollTriggerPercent: 50,
      size: 'compact',
      position: 'bottom-left',
      delaySeconds: 1,
    },
    endOfArticle: {
      enabled: false,
      position: 'before_related',
    },
    homepagePopup: {
      enabled: false,
      delaySeconds: 3,
      position: 'center',
      design: 'card',
      frequency: 'once_per_session',
    },
    websiteEntry: {
      enabled: false,
      delaySeconds: 0,
      minDurationSeconds: 3,
      layout: 'large',
    },
    homepageSection: {
      enabled: false,
      position: 'below_headline',
      customPosition: 'right_rail',
    },
    articleInline: {
      enabled: false,
      belowHeadline: false,
      belowSummary: false,
      betweenParagraphs: false,
      paragraphIndex: 2,
      aboveSharing: false,
    },
  };
}

export function createDefaultAdPlatformSettings(): AdPlatformSettings {
  return {
    rotationMode: 'both',
    rotationSpeedSeconds: 5,
    maxAdsPerPlacement: 6,
    rotationOrder: 'priority',
    avoidRepeatInSession: true,
    defaultShareMessage: DEFAULT_KANNADA_SHARE_TEMPLATE,
    customCategories: [],
    approvalWorkflowEnabled: false,
    defaultDisplayFrequency: 'once_per_session',
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

export function getCurrentIstHm(nowMs = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(nowMs));
    const h = parts.find((p) => p.type === 'hour')?.value;
    const m = parts.find((p) => p.type === 'minute')?.value;
    if (h && m) return `${h === '24' ? '00' : h}:${m}`;
  } catch {
    // Fallback below
  }
  const dt = new Date(nowMs);
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export function getCurrentIstDayOfWeek(nowMs = Date.now()): number {
  try {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
    }).format(new Date(nowMs));
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    if (wd in map) return map[wd];
  } catch {
    // Fallback below
  }
  return new Date(nowMs).getDay();
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

export function isValidTimeHm(value: string | undefined | null): value is string {
  return Boolean(value && VALID_HM_RE.test(value.trim()));
}

export function isAdExpired(
  ad: Pick<Advertisement, 'expiryDate' | 'schedule'>,
  todayYmd = getTodayIstYmd(),
  nowHm = getCurrentIstHm()
): boolean {
  if (!isValidYmd(ad.expiryDate)) return false;
  if (ad.expiryDate < todayYmd) return true;
  if (ad.expiryDate === todayYmd && isValidTimeHm(ad.schedule?.expiryTime)) {
    return nowHm > ad.schedule!.expiryTime!.trim();
  }
  return false;
}

export function isAdScheduledFuture(
  ad: Pick<Advertisement, 'publishDate' | 'schedule'>,
  todayYmd = getTodayIstYmd(),
  nowHm = getCurrentIstHm()
): boolean {
  if (!isValidYmd(ad.publishDate)) return false;
  if (ad.publishDate > todayYmd) return true;
  if (ad.publishDate === todayYmd && isValidTimeHm(ad.schedule?.startTime)) {
    return nowHm < ad.schedule!.startTime!.trim();
  }
  return false;
}

export function matchesAdRecurringWindow(
  ad: Pick<Advertisement, 'schedule'>,
  dayOfWeek = getCurrentIstDayOfWeek(),
  nowHm = getCurrentIstHm()
): boolean {
  const days = ad.schedule?.daysOfWeek;
  if (Array.isArray(days) && days.length > 0 && !days.includes(dayOfWeek)) {
    return false;
  }
  const dailyStart = ad.schedule?.dailyStartTime?.trim();
  const dailyEnd = ad.schedule?.dailyEndTime?.trim();
  if (isValidTimeHm(dailyStart) && isValidTimeHm(dailyEnd)) {
    if (dailyStart <= dailyEnd) {
      if (nowHm < dailyStart || nowHm > dailyEnd) return false;
    } else {
      // Overnight window e.g. 22:00 to 06:00
      if (nowHm < dailyStart && nowHm > dailyEnd) return false;
    }
  } else if (isValidTimeHm(dailyStart)) {
    if (nowHm < dailyStart) return false;
  } else if (isValidTimeHm(dailyEnd)) {
    if (nowHm > dailyEnd) return false;
  }
  return true;
}

export function isAdCurrentlyActive(
  ad: Pick<Advertisement, 'status' | 'publishDate' | 'expiryDate' | 'schedule' | 'approvalStatus'>,
  todayYmd = getTodayIstYmd(),
  nowHm = getCurrentIstHm(),
  dayOfWeek = getCurrentIstDayOfWeek()
): boolean {
  if (ad.status !== 'active') return false;
  if (ad.approvalStatus === 'pending_approval' || ad.approvalStatus === 'rejected') {
    return false;
  }
  if (isAdExpired(ad, todayYmd, nowHm)) return false;
  if (isAdScheduledFuture(ad, todayYmd, nowHm)) return false;
  if (!matchesAdRecurringWindow(ad, dayOfWeek, nowHm)) return false;
  return true;
}

export type EffectiveAdLifecycle = 'active' | 'inactive' | 'paused' | 'expired' | 'draft' | 'scheduled';

export function getAdLifecycleState(
  ad: Pick<Advertisement, 'status' | 'publishDate' | 'expiryDate' | 'schedule'>,
  todayYmd = getTodayIstYmd(),
  nowHm = getCurrentIstHm()
): EffectiveAdLifecycle {
  if (ad.status === 'draft') return 'draft';
  if (isAdExpired(ad, todayYmd, nowHm)) return 'expired';
  if (ad.status === 'paused') return 'paused';
  if (ad.status === 'inactive') return 'inactive';
  if (isAdScheduledFuture(ad, todayYmd, nowHm)) return 'scheduled';
  return 'active';
}

export function computeAdStats(
  ads: Advertisement[],
  todayYmd = getTodayIstYmd(),
  nowHm = getCurrentIstHm()
): AdvertisementStats {
  let active = 0;
  let inactive = 0;
  let scheduled = 0;
  let expired = 0;
  let draft = 0;
  let pendingApproval = 0;

  for (const ad of ads) {
    if (ad.approvalStatus === 'pending_approval') {
      pendingApproval += 1;
    }
    const lifecycle = getAdLifecycleState(ad, todayYmd, nowHm);
    if (lifecycle === 'draft') {
      draft += 1;
    } else if (lifecycle === 'expired') {
      expired += 1;
    } else if (lifecycle === 'inactive' || lifecycle === 'paused') {
      inactive += 1;
    } else if (lifecycle === 'scheduled') {
      scheduled += 1;
    } else {
      active += 1;
    }
  }

  return {
    total: ads.length,
    active,
    inactive,
    scheduled,
    expired,
    draft,
    pendingApproval,
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

export function buildAdPublicUrl(
  adId: string,
  origin?: string,
  previewToken?: string
): string {
  const base = (
    origin !== undefined ? origin : getDeepLinkShareOrigin() || PUBLIC_SHARE_ORIGIN
  ).replace(/\/+$/, '');
  const baseUrl = `${base}/ads?ad=${encodeURIComponent(adId)}`;
  if (previewToken && previewToken.trim()) {
    return `${baseUrl}&preview=${encodeURIComponent(previewToken.trim())}`;
  }
  return baseUrl;
}

export function buildAdKannadaShareMessage(
  ad: Pick<Advertisement, 'title' | 'sharing'>,
  shareUrl: string,
  defaultTemplate = DEFAULT_KANNADA_SHARE_TEMPLATE
): string {
  const rawTemplate =
    ad.sharing?.customShareMessage && ad.sharing.customShareMessage.trim()
      ? ad.sharing.customShareMessage
      : defaultTemplate && defaultTemplate.trim()
      ? defaultTemplate
      : DEFAULT_KANNADA_SHARE_TEMPLATE;

  const cleanTitle = ad.title.replace(/<[^>]+>/g, '').trim();
  return rawTemplate
    .replace(/\[ADVERTISEMENT TITLE\]/gi, cleanTitle)
    .replace(/\[ADVERTISEMENT URL\]/gi, shareUrl);
}

export function resolveAdCtaAction(ad: Advertisement): {
  label: string;
  href: string;
  trackType: 'whatsapp' | 'phone' | 'website' | 'directions' | 'click';
  isExternal: boolean;
} {
  const ctaType = ad.ctaType || 'learn_more';
  const label = (ad.ctaLabel && ad.ctaLabel.trim()) || AD_CTA_LABELS[ctaType] || 'View Advertisement';
  const customUrl = sanitizeExternalWebsiteUrl(ad.ctaUrl);
  const websiteHref = sanitizeExternalWebsiteUrl(ad.websiteUrl);
  const telHref = ad.contactNumber ? buildTelHref(ad.contactNumber) : '';
  const waHref = ad.whatsappNumber ? buildWhatsAppAdHref(ad.whatsappNumber, ad) : '';

  if (ctaType === 'whatsapp_now' && waHref) {
    return { label, href: waHref, trackType: 'whatsapp', isExternal: true };
  }
  if (ctaType === 'call_now' && telHref) {
    return { label, href: telHref, trackType: 'phone', isExternal: false };
  }
  if (ctaType === 'visit_website' && (customUrl || websiteHref)) {
    return { label, href: customUrl || websiteHref, trackType: 'website', isExternal: true };
  }
  if (ctaType === 'get_directions' && customUrl) {
    return { label, href: customUrl, trackType: 'directions', isExternal: true };
  }
  if (ctaType === 'contact_now') {
    if (waHref) return { label, href: waHref, trackType: 'whatsapp', isExternal: true };
    if (telHref) return { label, href: telHref, trackType: 'phone', isExternal: false };
  }
  if (customUrl) {
    return { label, href: customUrl, trackType: 'website', isExternal: true };
  }
  return {
    label,
    href: '',
    trackType: 'click',
    isExternal: false,
  };
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

export function detectVisitorDevice(): 'desktop' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth || 1024;
  if (width < 768) return 'mobile';
  if (typeof navigator !== 'undefined' && /mobile|iphone|android|ipad|ipod/i.test(navigator.userAgent)) {
    return width < 960 ? 'mobile' : 'desktop';
  }
  return 'desktop';
}

export function getPlacementBadgesForAd(ad: Advertisement): string[] {
  const p = ad.placements;
  if (!p) return ['Legacy Auto'];
  const labels: string[] = [];
  if (p.articlePopup?.enabled) labels.push('Article Popup');
  if (p.endOfArticle?.enabled) labels.push('End of Article');
  if (p.homepagePopup?.enabled) labels.push('Homepage Popup');
  if (p.websiteEntry?.enabled) labels.push('Entry Overlay');
  if (p.homepageSection?.enabled) labels.push(`Homepage (${p.homepageSection.position.replace('_', ' ')})`);
  if (p.articleInline?.enabled) labels.push('Article Inline');
  return labels.length > 0 ? labels : ['Directory Only'];
}

export function isAdEligibleForPlacement(
  ad: Advertisement,
  placement: AdPlacementSlotKey,
  options?: {
    device?: 'desktop' | 'mobile';
    settings?: AdPlatformSettings | null;
    homepagePosition?: 'below_headline' | 'between_news' | 'above_footer' | 'custom';
    inlineSlot?: 'belowHeadline' | 'belowSummary' | 'betweenParagraphs' | 'aboveSharing';
    ignoreImpressionCap?: boolean;
  }
): boolean {
  if (!isAdCurrentlyActive(ad)) return false;

  const settings = options?.settings;
  if (settings && settings.globalPlacementsEnabled && settings.globalPlacementsEnabled[placement] === false) {
    return false;
  }

  const device = options?.device || detectVisitorDevice();
  const targetDevice: AdDeviceTarget = ad.targetDevice || 'all';
  if (targetDevice !== 'all' && targetDevice !== device) {
    return false;
  }

  if (!options?.ignoreImpressionCap && hasExceededVisitorImpressionCap(ad, settings)) {
    return false;
  }

  // Legacy ads created before per-placement checkboxes preserve their original placements cleanly
  if (!ad.placements) {
    if (placement === 'articlePopup') return true;
    if (placement === 'endOfArticle') return true;
    if (placement === 'homepageSection') {
      return !options?.homepagePosition || options.homepagePosition === 'below_headline';
    }
    return false;
  }

  const cfg = ad.placements[placement];
  if (!cfg || !cfg.enabled) return false;

  if (placement === 'homepageSection' && options?.homepagePosition) {
    return ad.placements.homepageSection.position === options.homepagePosition;
  }

  if (placement === 'articleInline' && options?.inlineSlot) {
    return Boolean(ad.placements.articleInline[options.inlineSlot]);
  }

  return true;
}

const AD_IMPRESSIONS_STORAGE_KEY = 'cn_ad_fair_counts_v1';
const AD_VISITOR_IMPRESSIONS_KEY = 'cn_ad_visitor_impressions_v1';
const AD_RECENT_PLACEMENT_KEY = 'cn_ad_recent_placement_v1';

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

export function readVisitorImpressionCounts(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AD_VISITOR_IMPRESSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {
    // Ignore restricted localStorage
  }
  return {};
}

export function incrementLocalVisitorImpression(adId: string): void {
  if (typeof window === 'undefined' || !adId) return;
  try {
    const counts = readVisitorImpressionCounts();
    counts[adId] = (Number(counts[adId]) || 0) + 1;
    window.localStorage.setItem(AD_VISITOR_IMPRESSIONS_KEY, JSON.stringify(counts));
  } catch {
    // Ignore
  }
  try {
    const sCounts = readSessionImpressions();
    sCounts[adId] = (Number(sCounts[adId]) || 0) + 1;
    writeSessionImpressions(sCounts);
  } catch {
    // Ignore
  }
}

export function hasExceededVisitorImpressionCap(
  ad: Pick<Advertisement, 'id' | 'maxImpressionsPerVisitor'>,
  settings?: AdPlatformSettings | null
): boolean {
  const cap =
    typeof ad.maxImpressionsPerVisitor === 'number' && ad.maxImpressionsPerVisitor > 0
      ? ad.maxImpressionsPerVisitor
      : settings && settings.defaultMaxImpressionsPerVisitor > 0
      ? settings.defaultMaxImpressionsPerVisitor
      : 0;
  if (cap <= 0) return false;
  const counts = readVisitorImpressionCounts();
  return (Number(counts[ad.id]) || 0) >= cap;
}

function readRecentForPlacement(placementKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(AD_RECENT_PLACEMENT_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return typeof map?.[placementKey] === 'string' ? map[placementKey] : null;
  } catch {
    return null;
  }
}

export function rememberRecentForPlacement(placementKey: string, adId: string): void {
  if (typeof window === 'undefined' || !adId) return;
  try {
    const raw = window.sessionStorage.getItem(AD_RECENT_PLACEMENT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[placementKey] = adId;
    window.sessionStorage.setItem(AD_RECENT_PLACEMENT_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

const PRIORITY_WEIGHT: Record<AdPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function selectRotatedAdsForPlacement(
  ads: Advertisement[],
  settings: AdPlatformSettings | null | undefined,
  placementKey: AdPlacementSlotKey,
  options?: {
    homepagePosition?: 'below_headline' | 'between_news' | 'above_footer' | 'custom';
    inlineSlot?: 'belowHeadline' | 'belowSummary' | 'betweenParagraphs' | 'aboveSharing';
    maxAds?: number;
  }
): Advertisement[] {
  const eligible = ads.filter((ad) =>
    isAdEligibleForPlacement(ad, placementKey, {
      settings,
      homepagePosition: options?.homepagePosition,
      inlineSlot: options?.inlineSlot,
    })
  );
  if (eligible.length === 0) return [];

  const maxLimit = Math.max(
    1,
    options?.maxAds ?? settings?.maxAdsPerPlacement ?? 6
  );
  const order = settings?.rotationOrder || 'priority';
  const avoidRepeat = settings?.avoidRepeatInSession !== false;
  const sessionCounts = readSessionImpressions();
  const recentSlotKey = `${placementKey}:${options?.homepagePosition || options?.inlineSlot || 'default'}`;
  const lastShownId = avoidRepeat ? readRecentForPlacement(recentSlotKey) : null;

  const sorted = [...eligible].sort((a, b) => {
    // Prefer not repeating the exact last shown ad first when alternatives exist
    if (avoidRepeat && eligible.length > 1 && lastShownId) {
      if (a.id === lastShownId && b.id !== lastShownId) return 1;
      if (b.id === lastShownId && a.id !== lastShownId) return -1;
    }

    if (order === 'priority') {
      const pDiff =
        (PRIORITY_WEIGHT[b.priority || 'medium'] || 2) -
        (PRIORITY_WEIGHT[a.priority || 'medium'] || 2);
      if (pDiff !== 0) return pDiff;
      const wDiff = (b.rotation?.weight || 1) - (a.rotation?.weight || 1);
      if (wDiff !== 0) return wDiff;
    }

    // Balance visibility across session impressions
    const countDiff = (Number(sessionCounts[a.id]) || 0) - (Number(sessionCounts[b.id]) || 0);
    if (countDiff !== 0) return countDiff;

    if (order === 'random') {
      return Math.random() - 0.5;
    }
    return b.publishDate.localeCompare(a.publishDate);
  });

  if (order === 'random' && sorted.length > 1) {
    // Shuffle within same session-count bucket when random order is chosen
    for (let i = sorted.length - 1; i > 0; i--) {
      if (avoidRepeat && lastShownId && sorted[i].id === lastShownId) continue;
      const j = Math.floor(Math.random() * (i + 1));
      if (avoidRepeat && lastShownId && sorted[j].id === lastShownId) continue;
      const tmp = sorted[i];
      sorted[i] = sorted[j];
      sorted[j] = tmp;
    }
  }

  return sorted.slice(0, maxLimit);
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
