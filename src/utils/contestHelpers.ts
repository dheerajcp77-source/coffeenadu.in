import type {
  AdminContestEntryView,
  AdminContestParticipantView,
  ContestEditableContent,
  ContestEditableContentSnapshot,
  ContestEntryRecord,
  ContestFaqItem,
  ContestMonthRecord,
  ContestPrizeTier,
  ContestRuleItem,
  ContestSectionKey,
  ContestUserLeaderboardEntry,
  ContestWinnerRecord,
  PublicContestEntry,
  PublicContestWinner,
} from '../types/contest.ts';

export const CONTEST_OFFICIAL_NAME = 'COFFEENADU – MOST VIEWED NEWS CHALLENGE 2026';
export const CONTEST_KANNADA_HEADING =
  'ನಿಮ್ಮ ಸುದ್ದಿ ಹೆಚ್ಚು ಜನರಿಗೆ ತಲುಪಲಿ – ₹1,500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ!';
export const CONTEST_KANNADA_SUBTITLE =
  'ನಿಮ್ಮೂರಿನ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ, ಎಲ್ಲರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ ಮತ್ತು ತಿಂಗಳ ವಿಜೇತರಾಗಿ!';
export const CONTEST_TARGET_AREA =
  'Koppa, Sringeri, Jayapura, Balehonnur and surrounding Malnad villages';
export const CONTEST_PUBLIC_URL = 'https://coffeenadu.in/contest';
export const CONTEST_CATEGORY_ID = 'monthly-news-contest' as const;

export const ROLLING_VIEW_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours rolling window
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+05:30

const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_NAMES_KN = [
  'ಜನವರಿ',
  'ಫೆಬ್ರವರಿ',
  'ಮಾರ್ಚ್',
  'ಏಪ್ರಿಲ್',
  'ಮೇ',
  'ಜೂನ್',
  'ಜುಲೈ',
  'ಆಗಸ್ಟ್',
  'ಸೆಪ್ಟೆಂಬರ್',
  'ಅಕ್ಟೋಬರ್',
  'ನವೆಂಬರ್',
  'ಡಿಸೆಂಬರ್',
];

export function createDefaultContestPrizes(): ContestPrizeTier[] {
  return [
    {
      rank: 1,
      labelEn: '1st Prize — Most Viewed Eligible News',
      labelKn: 'ಪ್ರಥಮ ಬಹುಮಾನ — ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆ',
      amountInr: 800,
      type: 'views',
    },
    {
      rank: 2,
      labelEn: '2nd Prize — Second Most Viewed News',
      labelKn: 'ದ್ವಿತೀಯ ಬಹುಮಾನ — 2ನೇ ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆ',
      amountInr: 400,
      type: 'views',
    },
    {
      rank: 3,
      labelEn: '3rd Prize — Third Most Viewed News',
      labelKn: 'ತೃತೀಯ ಬಹುಮಾನ — 3ನೇ ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆ',
      amountInr: 200,
      type: 'views',
    },
    {
      rank: 4,
      labelEn: '4th Prize — Best Quality Original News (Admin Selection)',
      labelKn: '4ನೇ ಬಹುಮಾನ — ಅತ್ಯುತ್ತಮ ಗುಣಮಟ್ಟದ ಮೂಲ ಸುದ್ದಿ (ಆಡ್ಮಿನ್ ಆಯ್ಕೆ)',
      amountInr: 100,
      type: 'quality',
    },
  ];
}

export function isLegacyDefaultFivePrizeStructure(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length !== 5) return false;
  const legacyAmounts = [200, 100, 75, 75, 50];
  return legacyAmounts.every((expected, idx) => {
    const tier = raw[idx] as Partial<ContestPrizeTier> | undefined;
    return Number(tier?.amountInr) === expected;
  });
}

export function upgradeActiveMonthPrizesIfLegacy(month: ContestMonthRecord): boolean {
  if (!month || month.status === 'finalized') return false;
  const prizes = Array.isArray(month.prizes) ? month.prizes : [];
  if (isLegacyDefaultFivePrizeStructure(prizes) || prizes.length !== 4) {
    month.prizes = isLegacyDefaultFivePrizeStructure(prizes)
      ? createDefaultContestPrizes()
      : normalizeContestPrizes(prizes);
    if (Array.isArray(month.winners)) {
      month.winners = month.winners.filter((w) => w.rank >= 1 && w.rank <= 4);
    }
    return true;
  }
  const rank4 = prizes.find((p) => p.rank === 4);
  if (rank4 && rank4.type !== 'quality') {
    month.prizes = normalizeContestPrizes(prizes);
    return true;
  }
  return false;
}

export function normalizeContestPrizes(raw?: Partial<ContestPrizeTier>[] | null): ContestPrizeTier[] {
  const defaults = createDefaultContestPrizes();
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
  if (isLegacyDefaultFivePrizeStructure(raw)) return defaults;
  return defaults.map((def) => {
    const found = raw.find((item) => Number(item?.rank) === def.rank);
    if (!found) return def;
    const amt = Number(found.amountInr);
    return {
      rank: def.rank,
      labelEn: typeof found.labelEn === 'string' && found.labelEn.trim() ? found.labelEn.trim() : def.labelEn,
      labelKn: typeof found.labelKn === 'string' && found.labelKn.trim() ? found.labelKn.trim() : def.labelKn,
      amountInr: Number.isFinite(amt) && amt >= 0 ? Math.round(amt) : def.amountInr,
      type: def.type,
    };
  });
}

export function upgradeLegacyContestContentDefaults(
  content: ContestEditableContent | null | undefined
): ContestEditableContent {
  const defaults = createDefaultContestEditableContent();
  if (!content) return defaults;
  const legacyHeading = 'ನಿಮ್ಮ ಸುದ್ದಿ ಹೆಚ್ಚು ಜನರಿಗೆ ತಲುಪಲಿ – ₹500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ!';
  const legacyBannerKn =
    'ಈ ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆ ಚಾಲ್ತಿಯಲ್ಲಿದೆ! ಈಗಲೇ ನಿಮ್ಮೂರಿನ ಮೂಲ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ ₹500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ.';
  const legacyBannerEn =
    'This month’s news challenge is open! Publish original local news and compete for ₹500 in monthly cash rewards.';
  const legacyPromoBadge = 'ಈ ತಿಂಗಳ ₹500 ನಗದು ಬಹುಮಾನ!';

  const upgradedRules = Array.isArray(content.competitionRules)
    ? content.competitionRules.map((rule) => {
        if (
          rule.id === 'rule-6' &&
          (rule.titleKn.includes('5ನೇ') || rule.titleKn.includes('₹50') || rule.descKn.includes('5ನೇ ಬಹುಮಾನ'))
        ) {
          return defaults.competitionRules[5];
        }
        return rule;
      })
    : defaults.competitionRules;

  return {
    ...content,
    mainHeadingKn:
      content.mainHeadingKn === legacyHeading ? defaults.mainHeadingKn : content.mainHeadingKn,
    announcementBannerKn:
      content.announcementBannerKn === legacyBannerKn
        ? defaults.announcementBannerKn
        : content.announcementBannerKn,
    announcementBannerEn:
      content.announcementBannerEn === legacyBannerEn
        ? defaults.announcementBannerEn
        : content.announcementBannerEn,
    homepagePromoBadgeKn:
      content.homepagePromoBadgeKn === legacyPromoBadge
        ? defaults.homepagePromoBadgeKn
        : content.homepagePromoBadgeKn,
    homepagePromoHeadingKn:
      content.homepagePromoHeadingKn === legacyHeading
        ? defaults.homepagePromoHeadingKn
        : content.homepagePromoHeadingKn,
    competitionRules: upgradedRules,
  };
}

export function createDefaultMonthRecord(monthKey: string): ContestMonthRecord {
  const bounds = getIstMonthBounds(monthKey);
  const nowIso = new Date().toISOString();
  return {
    monthKey,
    periodId: monthKey,
    durationDays: 30,
    competitionName: CONTEST_OFFICIAL_NAME,
    displayLabelEn: bounds.displayLabelEn,
    displayLabelKn: bounds.displayLabelKn,
    startsAtIso: bounds.startsAtIso,
    endsAtIso: bounds.endsAtIso,
    status: 'open',
    participationEnabled: true,
    excludedUserIds: [],
    excludedUserReasons: {},
    prizes: createDefaultContestPrizes(),
    winners: [],
    winnersPublished: false,
    allowCarryOver: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Builds the initial active competition month record on fresh setup.
 * If fewer than 10 days remain in the current IST month (e.g. launching late Nov 2026),
 * sets the active competition through the last day of the following IST month (e.g. 31 Dec 2026)
 * starting immediately today in IST so contributors get a full competition window.
 */
export function createInitialContestMonthRecord(now: Date = new Date()): ContestMonthRecord {
  const currentKey = getIstMonthKey(now);
  const currentBounds = getIstMonthBounds(currentKey);
  const remainingMs = Date.parse(currentBounds.endsAtIso) - now.getTime();
  const minInitialWindowMs = 10 * 24 * 60 * 60 * 1000;

  if (remainingMs >= minInitialWindowMs) {
    return createDefaultMonthRecord(currentKey);
  }

  const nextKey = getNextIstMonthKey(currentKey);
  const nextBounds = getIstMonthBounds(nextKey);
  const istDate = new Date(now.getTime() + IST_OFFSET_MS);
  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istDate.getUTCDate()).padStart(2, '0');
  const nowIso = now.toISOString();

  return {
    monthKey: nextKey,
    competitionName: CONTEST_OFFICIAL_NAME,
    displayLabelEn: nextBounds.displayLabelEn,
    displayLabelKn: nextBounds.displayLabelKn,
    startsAtIso: `${yyyy}-${mm}-${dd}T00:00:00+05:30`,
    endsAtIso: nextBounds.endsAtIso,
    status: 'open',
    prizes: createDefaultContestPrizes(),
    winners: [],
    winnersPublished: false,
    allowCarryOver: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Returns the YYYY-MM month key in India Standard Time (IST, UTC+05:30).
 */
export function getIstMonthKey(date: Date = new Date()): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Computes exact IST opening (1st 00:00:00+05:30) and closing (last day 23:59:59+05:30)
 * timestamps for a given YYYY-MM competition month.
 */
export function getIstMonthBounds(monthKey: string): {
  startsAtIso: string;
  endsAtIso: string;
  displayLabelEn: string;
  displayLabelKn: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const year = match ? Number(match[1]) : nowIst.getUTCFullYear();
  const monthIdx = match ? Math.max(0, Math.min(11, Number(match[2]) - 1)) : nowIst.getUTCMonth();
  const mm = String(monthIdx + 1).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const dd = String(lastDay).padStart(2, '0');

  return {
    startsAtIso: `${year}-${mm}-01T00:00:00+05:30`,
    endsAtIso: `${year}-${mm}-${dd}T23:59:59+05:30`,
    displayLabelEn: `${MONTH_NAMES_EN[monthIdx]} ${year}`,
    displayLabelKn: `${MONTH_NAMES_KN[monthIdx]} ${year}`,
  };
}

export function getNextIstMonthKey(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return getIstMonthKey();
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export const COMPETITION_DEFAULT_DURATION_DAYS = 30;

/**
 * Computes an exact N-day (default 30-day) competition period window in IST (UTC+05:30).
 * Start is inclusive 00:00:00+05:30 on startDate, End is inclusive 23:59:59+05:30 on day (start + durationDays - 1).
 * For example, 30 days starting 2026-11-01 runs 2026-11-01T00:00:00+05:30 through 2026-11-30T23:59:59+05:30.
 */
export function compute30DayPeriodBounds(
  startDateIsoOrYmd?: string,
  durationDays: number = COMPETITION_DEFAULT_DURATION_DAYS,
  now: Date = new Date()
): {
  periodId: string;
  startsAtIso: string;
  endsAtIso: string;
  displayLabelEn: string;
  displayLabelKn: string;
  durationDays: number;
} {
  const safeDays = Math.max(1, Math.min(365, Math.round(Number(durationDays) || 30)));
  let startY: number;
  let startM: number; // 0-indexed
  let startD: number;

  const ymdMatch =
    typeof startDateIsoOrYmd === 'string'
      ? /^(\d{4})-(\d{2})-(\d{2})/.exec(startDateIsoOrYmd.trim())
      : null;

  if (ymdMatch) {
    startY = Number(ymdMatch[1]);
    startM = Math.max(0, Math.min(11, Number(ymdMatch[2]) - 1));
    startD = Math.max(1, Math.min(31, Number(ymdMatch[3])));
  } else if (startDateIsoOrYmd && Number.isFinite(Date.parse(startDateIsoOrYmd))) {
    const parsedIst = new Date(Date.parse(startDateIsoOrYmd) + IST_OFFSET_MS);
    startY = parsedIst.getUTCFullYear();
    startM = parsedIst.getUTCMonth();
    startD = parsedIst.getUTCDate();
  } else {
    const nowIst = new Date(now.getTime() + IST_OFFSET_MS);
    startY = nowIst.getUTCFullYear();
    startM = nowIst.getUTCMonth();
    startD = nowIst.getUTCDate();
  }

  const startUtc = new Date(Date.UTC(startY, startM, startD));
  const endUtc = new Date(Date.UTC(startY, startM, startD + safeDays - 1));

  const sY = startUtc.getUTCFullYear();
  const sM = String(startUtc.getUTCMonth() + 1).padStart(2, '0');
  const sD = String(startUtc.getUTCDate()).padStart(2, '0');
  const eY = endUtc.getUTCFullYear();
  const eM = String(endUtc.getUTCMonth() + 1).padStart(2, '0');
  const eD = String(endUtc.getUTCDate()).padStart(2, '0');

  const sameMonth = sY === eY && startUtc.getUTCMonth() === endUtc.getUTCMonth();
  const displayLabelEn = sameMonth
    ? `${MONTH_NAMES_EN[startUtc.getUTCMonth()]} ${sY} (${safeDays} Days)`
    : `${sD} ${MONTH_NAMES_EN[startUtc.getUTCMonth()].slice(0, 3)} – ${eD} ${MONTH_NAMES_EN[endUtc.getUTCMonth()].slice(0, 3)} ${eY}`;
  const displayLabelKn = sameMonth
    ? `${MONTH_NAMES_KN[startUtc.getUTCMonth()]} ${sY} (${safeDays} ದಿನ)`
    : `${sD} ${MONTH_NAMES_KN[startUtc.getUTCMonth()]} – ${eD} ${MONTH_NAMES_KN[endUtc.getUTCMonth()]} ${eY}`;

  return {
    periodId: `${sY}-${sM}-${sD}_p${safeDays}d`,
    startsAtIso: `${sY}-${sM}-${sD}T00:00:00+05:30`,
    endsAtIso: `${eY}-${eM}-${eD}T23:59:59+05:30`,
    displayLabelEn,
    displayLabelKn,
    durationDays: safeDays,
  };
}

export function isContestMonthOpen(
  month: Pick<ContestMonthRecord, 'status' | 'startsAtIso' | 'endsAtIso'>,
  nowMs: number = Date.now()
): boolean {
  if (month.status !== 'open') return false;
  const startMs = Date.parse(month.startsAtIso);
  const endMs = Date.parse(month.endsAtIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return nowMs >= startMs && nowMs <= endMs;
}

/**
 * Checks whether the competition period is both open within its IST time window
 * AND has participation enabled by administrators (`participationEnabled !== false`).
 */
export function isContestAcceptingEntries(
  month: Pick<ContestMonthRecord, 'status' | 'startsAtIso' | 'endsAtIso' | 'participationEnabled'>,
  nowMs: number = Date.now()
): boolean {
  if (month.participationEnabled === false) return false;
  return isContestMonthOpen(month, nowMs);
}

export function computeCountdownParts(
  endsAtIso: string,
  nowMs: number = Date.now()
): {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const endMs = Date.parse(endsAtIso);
  if (!Number.isFinite(endMs) || endMs <= nowMs) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const diffSec = Math.floor((endMs - nowMs) / 1000);
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;
  return { expired: false, days, hours, minutes, seconds };
}

const KNOWN_BOT_UA_PATTERN =
  /\b(bot|crawler|spider|slurp|mediapartners|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|discordbot|bingpreview|googlebot|yandex|baiduspider|duckduckbot|curl|wget|python-requests|python-urllib|aiohttp|axios|node-fetch|postmanruntime|insomnia|scrapy|phantomjs|lighthouse|pagespeed|pingdom|uptimerobot|datadog|statuscake|monitor)\b/i;

/**
 * Filters known crawlers, link-preview fetchers, CLI scripts, and monitoring bots.
 * Allows genuine desktop/mobile browsers cleanly.
 */
export function isLikelyBotUserAgent(userAgent: string | undefined | null): boolean {
  const ua = String(userAgent ?? '').trim();
  if (!ua || ua.length < 12) return true;
  return KNOWN_BOT_UA_PATTERN.test(ua);
}

/**
 * Determines whether a visitor's visit qualifies under the rolling 24-hour rule.
 */
export function isEligibleRolling24hVisit(
  lastEligibleAtMs: number | undefined,
  nowMs: number = Date.now(),
  windowMs: number = ROLLING_VIEW_WINDOW_MS
): boolean {
  if (!Number.isFinite(lastEligibleAtMs) || !lastEligibleAtMs) return true;
  return nowMs - lastEligibleAtMs >= windowMs;
}

/**
 * Evaluates burst traffic signals for suspicious automated spikes.
 * Returns a human-readable alert reason if suspicious, or null if normal.
 */
export function detectSuspiciousTrafficPattern(params: {
  ipHitsOnArticleLast10m: number;
  distinctVisitorsFromSameIpLast15m: number;
  articleTotalHitsLast5m: number;
}): { suspicious: boolean; severity: 'medium' | 'high'; reason: string } | null {
  if (params.distinctVisitorsFromSameIpLast15m >= 8) {
    return {
      suspicious: true,
      severity: 'high',
      reason: `Repeated distinct-cookie visits (${params.distinctVisitorsFromSameIpLast15m}) from a single network within 15 minutes.`,
    };
  }
  if (params.ipHitsOnArticleLast10m >= 15) {
    return {
      suspicious: true,
      severity: 'medium',
      reason: `Excessive rapid requests (${params.ipHitsOnArticleLast10m} hits in 10 minutes) from one network on a single contest article.`,
    };
  }
  if (params.articleTotalHitsLast5m >= 120) {
    return {
      suspicious: true,
      severity: 'high',
      reason: `Sudden abnormal traffic spike (${params.articleTotalHitsLast5m} hits in 5 minutes) flagged for admin verification.`,
    };
  }
  return null;
}

/**
 * Returns the genuine 24-hour unique organic eligible views for an entry.
 */
export function getGenuineEligibleViews(
  record: Partial<
    Pick<
      ContestEntryRecord,
      'eligibleViews' | 'genuineEligibleViews' | 'genuine_eligible_views'
    >
  >
): number {
  const raw =
    record.genuine_eligible_views ??
    record.genuineEligibleViews ??
    record.eligibleViews ??
    0;
  return Math.max(0, Math.floor(Number(raw) || 0));
}

/**
 * Returns the Super Admin manual score adjustment (integer, defaults to 0).
 */
export function getManualScoreAdjustment(
  record: Partial<
    Pick<ContestEntryRecord, 'manualScoreAdjustment' | 'manual_score_adjustment'>
  >
): number {
  const raw = record.manual_score_adjustment ?? record.manualScoreAdjustment ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/**
 * Calculates:
 * competition_display_score = Math.max(0, genuine_eligible_views + manual_score_adjustment)
 * Prevents negative scores.
 */
export function computeCompetitionDisplayScore(
  genuineEligibleViews: number,
  manualScoreAdjustment: number
): number {
  const genuine = Math.max(0, Math.floor(Number(genuineEligibleViews) || 0));
  const adjustment = Number.isFinite(Number(manualScoreAdjustment))
    ? Math.trunc(Number(manualScoreAdjustment))
    : 0;
  return Math.max(0, genuine + adjustment);
}

/**
 * Returns the final competition display score for an entry.
 */
export function getEntryCompetitionDisplayScore(
  record: Partial<
    Pick<
      ContestEntryRecord,
      | 'eligibleViews'
      | 'genuineEligibleViews'
      | 'genuine_eligible_views'
      | 'manualScoreAdjustment'
      | 'manual_score_adjustment'
    >
  >
): number {
  return computeCompetitionDisplayScore(
    getGenuineEligibleViews(record),
    getManualScoreAdjustment(record)
  );
}

/**
 * Synchronizes genuine_eligible_views, manual_score_adjustment, and competition_display_score
 * fields on a ContestEntryRecord in-place while preserving genuine organic eligibleViews.
 */
export function normalizeEntryScoreFields(record: ContestEntryRecord): ContestEntryRecord {
  const genuine = Math.max(0, Math.floor(Number(record.eligibleViews) || 0));
  const adjustment = getManualScoreAdjustment(record);
  const displayScore = computeCompetitionDisplayScore(genuine, adjustment);

  record.eligibleViews = genuine;
  record.genuineEligibleViews = genuine;
  record.genuine_eligible_views = genuine;
  record.manualScoreAdjustment = adjustment;
  record.manual_score_adjustment = adjustment;
  record.competitionDisplayScore = displayScore;
  record.competition_display_score = displayScore;
  return record;
}

/**
 * Strictly sanitizes a ContestEntryRecord for public APIs.
 * NEVER exposes contributorUserId, mobile numbers, manual score adjustment internals, or moderation internals.
 * Public `eligibleViews` and `competitionDisplayScore` reflect `competition_display_score`.
 */
export function toPublicContestEntry(
  record: ContestEntryRecord,
  rank?: number
): PublicContestEntry {
  const displayScore = getEntryCompetitionDisplayScore(record);
  const rawTotalViews = Math.max(0, Math.floor(Number(record.totalPageViews) || 0));
  return {
    id: record.id,
    postId: record.postId,
    slug: record.slug,
    competitionMonth: record.competitionMonth,
    contributorName: record.contributorName,
    title: record.title,
    summary: record.summary,
    location: record.location,
    thumbnailUrl: record.thumbnailUrl || undefined,
    publishedAt: record.publishedAt,
    eligibleViews: displayScore,
    competitionDisplayScore: displayScore,
    competition_display_score: displayScore,
    totalPageViews: Math.max(rawTotalViews, displayScore),
    ...(typeof rank === 'number' ? { rank } : {}),
  };
}

/**
 * Strictly sanitizes a ContestWinnerRecord for public announcements & Previous Winners.
 * Strips mobile number, payment status, payment date, and payment reference.
 */
export function toPublicContestWinner(record: ContestWinnerRecord): PublicContestWinner {
  return {
    rank: record.rank,
    prizeType: record.prizeType,
    prizeLabelEn: record.prizeLabelEn,
    prizeLabelKn: record.prizeLabelKn,
    prizeAmountInr: Math.max(0, Math.floor(Number(record.prizeAmountInr) || 0)),
    entryId: record.entryId,
    articleSlug: record.articleSlug,
    articleTitle: record.articleTitle,
    contributorName: record.contributorName,
    eligibleViews: Math.max(0, Math.floor(Number(record.eligibleViews) || 0)),
    selectionNote: record.selectionNote || undefined,
  };
}

/**
 * Ranks eligible contest entries by competition_display_score DESC, then earliest publishedAt ASC
 * (fair tie-breaking for earlier original reporting).
 */
export function rankEligibleContestEntries(entries: ContestEntryRecord[]): PublicContestEntry[] {
  return entries
    .filter((entry) => entry.eligibility === 'eligible')
    .sort((a, b) => {
      const diff = getEntryCompetitionDisplayScore(b) - getEntryCompetitionDisplayScore(a);
      if (diff !== 0) return diff;
      return Date.parse(a.publishedAt || '0') - Date.parse(b.publishedAt || '0');
    })
    .map((entry, idx) => toPublicContestEntry(entry, idx + 1));
}

/**
 * Generates a deterministic, non-PII opaque UI key for a participant within a competition period.
 * Uses FNV-1a 32-bit hashing so it works identically in Node.js, browsers, and Cloudflare Workers
 * without exposing raw contributorUserId, mobile number, or email.
 */
export function createOpaqueParticipantKey(periodId: string, contributorUserId: string): string {
  const input = `${periodId}::${contributorUserId}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i * 31);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `p_${part1}${part2}`;
}

export interface BuildUserLeaderboardOptions {
  month: Pick<
    ContestMonthRecord,
    | 'monthKey'
    | 'periodId'
    | 'displayLabelEn'
    | 'displayLabelKn'
    | 'startsAtIso'
    | 'endsAtIso'
    | 'status'
    | 'excludedUserIds'
    | 'frozenUserLeaderboard'
  >;
  entries: ContestEntryRecord[];
  /** Optional predicate verifying the linked CommunityPostRecord is still published (excludes hidden/removed/deleted posts). */
  isPostPublished?: (postId: string) => boolean;
  /** Optional map of userId -> latest registered profile metadata (displayName, status). */
  userDirectory?: Map<string, { fullName: string; status: 'active' | 'suspended' }>;
  /** When true, bypasses frozen snapshot and recomputes live (used when capturing a fresh snapshot on close/finalize). */
  forceRecompute?: boolean;
}

/**
 * Computes the automatic user-aggregated 30-day Views Leaderboard:
 *   USER TOTAL VIEWS = SUM(competitionDisplayScore of all eligible published articles by that user in this period).
 *
 * Rules strictly enforced:
 * - Never overwrites individual article view counts.
 * - Excludes disqualified, unpublished/hidden/removed/deleted articles, suspended users, and admin-excluded users.
 * - Excludes articles belonging to other competition periods.
 * - Includes eligible registered participants even when their total views is 0 (zero duplicate rows per user).
 * - Deterministic tie-breaking:
 *   1. totalVerifiedViews DESC
 *   2. Earlier achievement of total (lastViewAchievedAt ASC when views > 0)
 *   3. eligibleArticleCount DESC
 *   4. Earliest firstPublishedAt ASC
 *   5. displayName ASC
 * - Preserves immutable frozen snapshot when period is closed/finalized unless `forceRecompute` is true.
 * - Strictly public-safe output (NEVER contains contributorUserId, mobile number, or email).
 */
export function buildUserViewsLeaderboard(
  options: BuildUserLeaderboardOptions
): ContestUserLeaderboardEntry[] {
  const { month, entries, isPostPublished, userDirectory, forceRecompute = false } = options;

  if (
    !forceRecompute &&
    month.status !== 'open' &&
    Array.isArray(month.frozenUserLeaderboard) &&
    month.frozenUserLeaderboard.length > 0
  ) {
    return month.frozenUserLeaderboard.map((row, idx) => ({
      ...row,
      rank: idx + 1,
    }));
  }

  const periodId = month.periodId || month.monthKey;
  const excludedSet = new Set(
    Array.isArray(month.excludedUserIds) ? month.excludedUserIds : []
  );

  interface UserAgg {
    userId: string;
    displayName: string;
    latestEntryMs: number;
    totalVerifiedViews: number;
    eligibleArticleCount: number;
    lastViewAchievedMs: number;
    lastViewAchievedAt?: string;
    firstPublishedMs: number;
    firstPublishedAt?: string;
    articles: Array<{
      id: string;
      slug: string;
      title: string;
      eligibleViews: number;
      publishedAt: string;
    }>;
  }

  const aggMap = new Map<string, UserAgg>();

  for (const entry of entries) {
    if (!entry || entry.competitionMonth !== month.monthKey) continue;
    if (entry.eligibility !== 'eligible') continue;
    if (isPostPublished && !isPostPublished(entry.postId)) continue;

    const uid = String(entry.contributorUserId || '').trim();
    if (!uid) continue;
    if (excludedSet.has(uid)) continue;

    const userRecord = userDirectory?.get(uid);
    if (userRecord && userRecord.status === 'suspended') continue;

    const entryScore = getEntryCompetitionDisplayScore(entry);
    const publishedMs = Date.parse(entry.publishedAt || '') || 0;
    const viewAchievedIso =
      entryScore > 0
        ? entry.lastEligibleViewAt || entry.lastViewedAt || entry.publishedAt
        : undefined;
    const viewAchievedMs = viewAchievedIso ? Date.parse(viewAchievedIso) || 0 : 0;

    let agg = aggMap.get(uid);
    if (!agg) {
      agg = {
        userId: uid,
        displayName: userRecord?.fullName || entry.contributorName || 'Contributor',
        latestEntryMs: publishedMs,
        totalVerifiedViews: 0,
        eligibleArticleCount: 0,
        lastViewAchievedMs: 0,
        lastViewAchievedAt: undefined,
        firstPublishedMs: publishedMs || Number.MAX_SAFE_INTEGER,
        firstPublishedAt: entry.publishedAt || undefined,
        articles: [],
      };
      aggMap.set(uid, agg);
    }

    // Prefer registered profile display name; otherwise most recent article contributorName
    if (userRecord?.fullName) {
      agg.displayName = userRecord.fullName;
    } else if (publishedMs >= agg.latestEntryMs && entry.contributorName) {
      agg.displayName = entry.contributorName;
      agg.latestEntryMs = publishedMs;
    }

    agg.totalVerifiedViews += entryScore;
    agg.eligibleArticleCount += 1;

    if (publishedMs > 0 && publishedMs < agg.firstPublishedMs) {
      agg.firstPublishedMs = publishedMs;
      agg.firstPublishedAt = entry.publishedAt;
    }

    if (entryScore > 0 && viewAchievedMs > agg.lastViewAchievedMs) {
      agg.lastViewAchievedMs = viewAchievedMs;
      agg.lastViewAchievedAt = viewAchievedIso;
    }

    agg.articles.push({
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      eligibleViews: entryScore,
      publishedAt: entry.publishedAt,
    });
  }

  const sorted = Array.from(aggMap.values()).sort((a, b) => {
    // 1. Highest total verified views first
    const viewsDiff = b.totalVerifiedViews - a.totalVerifiedViews;
    if (viewsDiff !== 0) return viewsDiff;

    // 2. When tied on positive views, earlier achievement of that total wins
    if (a.totalVerifiedViews > 0 && b.totalVerifiedViews > 0) {
      const aAchieved = a.lastViewAchievedMs || Number.MAX_SAFE_INTEGER;
      const bAchieved = b.lastViewAchievedMs || Number.MAX_SAFE_INTEGER;
      if (aAchieved !== bAchieved) return aAchieved - bAchieved;
    }

    // 3. More eligible articles published wins
    const countDiff = b.eligibleArticleCount - a.eligibleArticleCount;
    if (countDiff !== 0) return countDiff;

    // 4. Earlier first participation wins
    const firstDiff = a.firstPublishedMs - b.firstPublishedMs;
    if (firstDiff !== 0) return firstDiff;

    // 5. Deterministic alphabetical tie-breaker
    return a.displayName.localeCompare(b.displayName);
  });

  return sorted.map((agg, idx) => ({
    rank: idx + 1,
    participantKey: createOpaqueParticipantKey(periodId, agg.userId),
    displayName: agg.displayName,
    totalVerifiedViews: agg.totalVerifiedViews,
    eligibleArticleCount: agg.eligibleArticleCount,
    competitionPeriodId: periodId,
    competitionPeriodLabelEn: month.displayLabelEn,
    competitionPeriodLabelKn: month.displayLabelKn,
    lastViewAchievedAt: agg.lastViewAchievedAt,
    firstPublishedAt: agg.firstPublishedAt,
    topArticles: [...agg.articles]
      .sort((a, b) => {
        const d = b.eligibleViews - a.eligibleViews;
        if (d !== 0) return d;
        return Date.parse(a.publishedAt || '0') - Date.parse(b.publishedAt || '0');
      })
      .slice(0, 5),
  }));
}

/**
 * Builds the Admin-only participants list combining all contest entries in `month`
 * with all registered community users so admins can inspect every participant,
 * view individual articles & per-article views, and toggle participant eligibility.
 */
export function buildAdminContestParticipants(params: {
  month: ContestMonthRecord;
  entriesWithMobile: AdminContestEntryView[];
  allUsers: Array<{
    id: string;
    fullName: string;
    mobileNumber: string;
    status: 'active' | 'suspended';
  }>;
  userLeaderboard: ContestUserLeaderboardEntry[];
}): AdminContestParticipantView[] {
  const { month, entriesWithMobile, allUsers, userLeaderboard } = params;
  const periodId = month.periodId || month.monthKey;
  const excludedSet = new Set(
    Array.isArray(month.excludedUserIds) ? month.excludedUserIds : []
  );
  const excludedReasons = month.excludedUserReasons || {};

  const rankByParticipantKey = new Map<string, number>();
  userLeaderboard.forEach((row) => rankByParticipantKey.set(row.participantKey, row.rank));

  const userMap = new Map<
    string,
    { id: string; fullName: string; mobileNumber: string; status: 'active' | 'suspended' }
  >();
  for (const u of allUsers) {
    if (u?.id) userMap.set(u.id, u);
  }

  const entriesByUser = new Map<string, AdminContestEntryView[]>();
  for (const entry of entriesWithMobile) {
    const uid = entry.contributorUserId;
    if (!uid) continue;
    const list = entriesByUser.get(uid) || [];
    list.push(entry);
    entriesByUser.set(uid, list);
  }

  // Union of all registered users + any userId present in entries
  const allUserIds = new Set<string>([...userMap.keys(), ...entriesByUser.keys()]);
  const rows: AdminContestParticipantView[] = [];

  for (const userId of allUserIds) {
    const userRec = userMap.get(userId);
    const userEntries = (entriesByUser.get(userId) || []).sort((a, b) => {
      if (a.eligibility !== b.eligibility) return a.eligibility === 'eligible' ? -1 : 1;
      return (
        (b.competitionDisplayScore ?? b.eligibleViews) -
        (a.competitionDisplayScore ?? a.eligibleViews)
      );
    });

    const eligiblePublished = userEntries.filter(
      (e) => e.eligibility === 'eligible' && e.postStatus === 'published'
    );
    const disqualifiedCount = userEntries.filter(
      (e) => e.eligibility !== 'eligible' || e.postStatus !== 'published'
    ).length;

    const isSuspended = userRec?.status === 'suspended';
    const isExcluded = excludedSet.has(userId);
    const leaderboardEligible = !isSuspended && !isExcluded;

    const totalVerifiedViews = leaderboardEligible
      ? eligiblePublished.reduce(
          (sum, e) => sum + (e.competitionDisplayScore ?? getEntryCompetitionDisplayScore(e)),
          0
        )
      : 0;
    const totalGenuineViews = eligiblePublished.reduce(
      (sum, e) => sum + (e.genuineEligibleViews ?? getGenuineEligibleViews(e)),
      0
    );

    let lastViewAchievedAt: string | undefined;
    let lastViewMs = 0;
    let firstPublishedAt: string | undefined;
    let firstPublishedMs = Number.MAX_SAFE_INTEGER;

    for (const e of eligiblePublished) {
      const pubMs = Date.parse(e.publishedAt || '') || 0;
      if (pubMs > 0 && pubMs < firstPublishedMs) {
        firstPublishedMs = pubMs;
        firstPublishedAt = e.publishedAt;
      }
      const score = e.competitionDisplayScore ?? getEntryCompetitionDisplayScore(e);
      if (score > 0) {
        const vIso = e.lastEligibleViewAt || e.lastViewedAt || e.publishedAt;
        const vMs = Date.parse(vIso || '') || 0;
        if (vMs > lastViewMs) {
          lastViewMs = vMs;
          lastViewAchievedAt = vIso;
        }
      }
    }

    const pKey = createOpaqueParticipantKey(periodId, userId);
    const rank =
      leaderboardEligible && eligiblePublished.length > 0
        ? rankByParticipantKey.get(pKey) ?? null
        : null;

    rows.push({
      rank,
      userId,
      displayName:
        userRec?.fullName || userEntries[0]?.contributorName || 'Registered Contributor',
      mobileNumber: userRec?.mobileNumber || userEntries[0]?.contributorMobileNumber || '',
      userStatus: userRec?.status || 'active',
      leaderboardEligible,
      exclusionReason: isExcluded
        ? excludedReasons[userId] || 'Excluded by admin'
        : isSuspended
        ? 'Account suspended'
        : undefined,
      totalVerifiedViews,
      totalGenuineViews,
      eligibleArticleCount: eligiblePublished.length,
      totalArticleCount: userEntries.length,
      disqualifiedArticleCount: disqualifiedCount,
      lastViewAchievedAt,
      firstPublishedAt,
      articles: userEntries,
    });
  }

  return rows.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;
    const viewsDiff = b.totalVerifiedViews - a.totalVerifiedViews;
    if (viewsDiff !== 0) return viewsDiff;
    const artDiff = b.totalArticleCount - a.totalArticleCount;
    if (artDiff !== 0) return artDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function buildContestPageShareText(monthLabelKn?: string): string {
  const monthLine = monthLabelKn ? ` (${monthLabelKn})` : '';
  return [
    `🏆 *${CONTEST_OFFICIAL_NAME}*${monthLine}`,
    '',
    `✨ ${CONTEST_KANNADA_HEADING}`,
    `${CONTEST_KANNADA_SUBTITLE}`,
    '',
    '💰 ತಿಂಗಳ ಒಟ್ಟು ಬಹುಮಾನ: ₹1,500',
    '🥇 1st: ₹800 | 🥈 2nd: ₹400 | 🥉 3rd: ₹200 | ⭐ 4th (ಉತ್ತಮ ಗುಣಮಟ್ಟದ ಸುದ್ದಿ): ₹100',
    '🆓 ಪ್ರವೇಶ ಶುಲ್ಕವಿಲ್ಲ — ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಮಲೆನಾಡು ಭಾಗದ ಎಲ್ಲರಿಗೂ ಮುಕ್ತ ಅವಕಾಶ!',
    '',
    `👉 ಈಗಲೇ ಭಾಗವಹಿಸಿ: ${CONTEST_PUBLIC_URL}`,
  ].join('\n');
}

export function buildContestArticleShareText(entry: {
  title: string;
  slug: string;
  location: string;
  contributorName: string;
}): string {
  const articleUrl = `https://coffeenadu.in/community/${encodeURIComponent(entry.slug)}`;
  return [
    `🏆 *${entry.title}*`,
    `📍 ${entry.location} · ✍️ ${entry.contributorName}`,
    '',
    `ಈ ಸುದ್ದಿ "COFFEENADU – MOST VIEWED NEWS CHALLENGE 2026" ಸ್ಪರ್ಧೆಯಲ್ಲಿ ಭಾಗವಹಿಸಿದೆ!`,
    `ಸಂಪೂರ್ಣ ಸುದ್ದಿ ಓದಿ ಮತ್ತು ಇತರರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ 👇`,
    articleUrl,
    '',
    `ನೀವು ಕೂಡ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ ₹1,500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ: ${CONTEST_PUBLIC_URL}`,
  ].join('\n');
}

export const DEFAULT_CONTEST_SECTION_ORDER: ContestSectionKey[] = [
  'hero',
  'notice',
  'prizes',
  'leaderboard',
  'rules',
  'faqs',
  'winners',
];

export function createDefaultContestRules(): ContestRuleItem[] {
  return [
    {
      id: 'rule-1',
      titleKn: '1. ಉಚಿತ ಭಾಗವಹಿಸುವಿಕೆ (No Entry Fee)',
      descKn:
        'ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಸುತ್ತಮುತ್ತಲಿನ ಮಲೆನಾಡು ಪ್ರದೇಶದ ಯಾರಾದರೂ ಉಚಿತವಾಗಿ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ ಭಾಗವಹಿಸಬಹುದು.',
      titleEn: '1. Free Participation (No Entry Fee)',
      descEn:
        'Anyone from Koppa, Sringeri, Jayapura, Balehonnur and surrounding Malnad villages can participate for free.',
    },
    {
      id: 'rule-2',
      titleKn: '2. ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಗಳಿಗೆ ಮಾತ್ರ ಅವಕಾಶ',
      descKn:
        'ಸುದ್ದಿಗಳು ಮೂಲ, ನಿಖರ ಹಾಗೂ ಸ್ಥಳೀಯ ಜನರಿಗೆ ಉಪಯುಕ್ತವಾಗಿರಬೇಕು. ನಕಲಿ ಸುದ್ದಿ, ಕಾಪಿ-ಪೇಸ್ಟ್, ದ್ವೇಷಪೂರಿತ ಅಥವಾ ದಾರಿತಪ್ಪಿಸುವ ವಿಷಯಗಳನ್ನು ಅನರ್ಹಗೊಳಿಸಲಾಗುತ್ತದೆ.',
      titleEn: '2. Original Local News Only',
      descEn:
        'Articles must be original, factual, and locally relevant. Fake, copy-pasted, hateful, or misleading posts will be disqualified.',
    },
    {
      id: 'rule-3',
      titleKn: '3. ಜಾಹೀರಾತು / ಮಾರಾಟ / ಕಳೆದುಹೋದ ವಸ್ತುಗಳಿಗೆ ಪ್ರತ್ಯೇಕ ವಿಭಾಗ',
      descKn:
        'ಅಂಗಡಿ ಪ್ರಚಾರ, ಮಾರಾಟ ಪ್ರಕಟಣೆಗಳು, ಜಾಹೀರಾತುಗಳು ಮತ್ತು ಕಳೆದುಹೋದ/ಸಿಕ್ಕ ವಸ್ತುಗಳ ಮಾಹಿತಿ ಸ್ಪರ್ಧೆಗೆ ಅರ್ಹವಲ್ಲ. ಅವುಗಳನ್ನು ಎಂದಿನಂತೆ ಸಮುದಾಯ ವಿಭಾಗದಲ್ಲಿ ಪ್ರಕಟಿಸಿ.',
      titleEn: '3. Separate Section for Sales / Ads / Lost & Found',
      descEn:
        'Commercial advertisements, sales listings, and lost & found notices are not eligible for the contest; post them in the regular Community Feed.',
    },
    {
      id: 'rule-4',
      titleKn: '4. ಪ್ರಾಮಾಣಿಕ ವೀಕ್ಷಣೆ ಲೆಕ್ಕಾಚಾರ (24-Hour Unique View Rule)',
      descKn:
        'ಪ್ರತಿ ಓದುಗರಿಂದ 24 ಗಂಟೆಯಲ್ಲಿ ಗರಿಷ್ಠ 1 ಅರ್ಹ ವೀಕ್ಷಣೆ ಮಾತ್ರ ಲೆಕ್ಕವಾಗುತ್ತದೆ. ಪದೇ ಪದೇ ಪುಟ ರಿಫ್ರೆಶ್ ಮಾಡುವುದು, ಬಾಟ್ ಅಥವಾ ಕೃತಕ ಟ್ರಾಫಿಕ್ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಫಿಲ್ಟರ್ ಆಗುತ್ತದೆ.',
      titleEn: '4. Fair 24-Hour Unique View Rule',
      descEn:
        'Maximum 1 eligible competition view per visitor per article within a rolling 24-hour window. Repeated refreshes and bot traffic are filtered.',
    },
    {
      id: 'rule-5',
      titleKn: '5. 30 ದಿನಗಳ ಸ್ಪರ್ಧಾ ಅವಧಿ ಮತ್ತು ಅನಿಯಮಿತ ಸುದ್ದಿ ಪ್ರಕಟಣೆ (Unlimited Publishing)',
      descKn:
        'ಪ್ರತಿ ನೋಂದಾಯಿತ ಬಳಕೆದಾರರು 30 ದಿನಗಳ ಸ್ಪರ್ಧಾ ಅವಧಿಯಲ್ಲಿ ಎಷ್ಟು ಬೇಕಾದರೂ ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಗಳನ್ನು ಪ್ರಕಟಿಸಬಹುದು. ಆ ಅವಧಿಯಲ್ಲಿ ಪ್ರಕಟವಾದ ನಿಮ್ಮ ಎಲ್ಲಾ ಅರ್ಹ ಸುದ್ದಿಗಳ ಪರಿಶೀಲಿತ ವೀಕ್ಷಣೆಗಳು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸೇರಿ ನಿಮ್ಮ ಒಟ್ಟು ವೀಕ್ಷಣೆ (Total Verified Views) ಲೆಕ್ಕವಾಗುತ್ತದೆ.',
      titleEn: '5. 30-Day Period & Unlimited Original News Publishing',
      descEn:
        'Every registered user can publish unlimited original local news articles during the active 30-day competition period. Verified views across all your eligible articles automatically sum into your total user leaderboard score.',
    },
    {
      id: 'rule-6',
      titleKn: '6. 4ನೇ ಅತ್ಯುತ್ತಮ ಗುಣಮಟ್ಟದ ಮೂಲ ಸುದ್ದಿ ಬಹುಮಾನ (₹100 — ಆಡ್ಮಿನ್ ಆಯ್ಕೆ)',
      descKn:
        'ಮೊದಲ 3 ಬಹುಮಾನಗಳು ಅತಿ ಹೆಚ್ಚು ಅರ್ಹ ವೀಕ್ಷಣೆ ಆಧಾರಿತವಾಗಿದ್ದು (₹800, ₹400, ₹200), 4ನೇ ಬಹುಮಾನವನ್ನು (₹100) ಮೂಲತನ, ನಿಖರತೆ ಮತ್ತು ಸ್ಥಳೀಯ ಉಪಯುಕ್ತತೆ ಆಧರಿಸಿ ಆಡ್ಮಿನ್ ಪ್ರತ್ಯೇಕವಾಗಿ ಆಯ್ಕೆ ಮಾಡುತ್ತಾರೆ.',
      titleEn: '6. 4th Prize — Best Quality Original News (₹100 — Admin Selection)',
      descEn:
        'Prizes 1–3 are awarded by highest eligible competition score (₹800, ₹400, ₹200), while the 4th prize (₹100) is selected manually by admins for best quality original reporting.',
    },
    {
      id: 'rule-7',
      titleKn: '7. ಗೌಪ್ಯತೆ ಮತ್ತು ವಿಜೇತರ ಪರಿಶೀಲನೆ',
      descKn:
        'ಸುದ್ದಿ ಪ್ರಕಟಿಸುವಾಗ ನೀಡುವ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಸಾರ್ವಜನಿಕವಾಗಿ ಎಲ್ಲಿಯೂ ಕಾಣಿಸುವುದಿಲ್ಲ. ಬಹುಮಾನ ವಿತರಣೆಗೆ ಮುನ್ನ ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆ ನಡೆಸಿ ನೇರವಾಗಿ ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.',
      titleEn: '7. Privacy & Winner Verification',
      descEn:
        'Contributor mobile numbers are strictly private and never shown publicly. Admins verify and contact winners directly for payout.',
    },
    {
      id: 'rule-8',
      titleKn: '8. ಅಂತಿಮ ನಿರ್ಧಾರ',
      descKn:
        'ಅನುಮಾನಾಸ್ಪದ ಟ್ರಾಫಿಕ್ ಅಥವಾ ನಿಯಮ ಉಲ್ಲಂಘನೆ ಕಂಡುಬಂದಲ್ಲಿ ಲೇಖನವನ್ನು ಅನರ್ಹಗೊಳಿಸುವ ಹಕ್ಕು ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ತಂಡಕ್ಕೆ ಇರುತ್ತದೆ.',
      titleEn: '8. Final Editorial Decision',
      descEn:
        'Coffeenadu Admin reserves the final right to disqualify entries with suspicious traffic or rule violations.',
    },
  ];
}

export function createDefaultContestFaqs(): ContestFaqItem[] {
  return [
    {
      id: 'faq-1',
      questionKn: 'ಈ ಸ್ಪರ್ಧೆಯಲ್ಲಿ ಭಾಗವಹಿಸಲು ಯಾವುದೇ ಶುಲ್ಕವಿದೆಯೇ?',
      answerKn:
        'ಇಲ್ಲ, ಭಾಗವಹಿಸುವಿಕೆ ಸಂಪೂರ್ಣ ಉಚಿತ. ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯೊಂದಿಗೆ ನೇರವಾಗಿ ಸುದ್ದಿ ಪ್ರಕಟಿಸಬಹುದು.',
      questionEn: 'Is there any entry fee to participate in the contest?',
      answerEn:
        'No, participation is 100% free. You can submit your news directly with your name and 10-digit mobile number.',
    },
    {
      id: 'faq-2',
      questionKn: 'ನನ್ನ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಇತರ ಓದುಗರಿಗೆ ಕಾಣಿಸುತ್ತದೆಯೇ?',
      answerKn:
        'ಖಂಡಿತ ಇಲ್ಲ. ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಸಂಪೂರ್ಣ ಗೌಪ್ಯವಾಗಿದ್ದು, ಬಹುಮಾನ ವಿತರಣೆಗಾಗಿ ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ತಂಡಕ್ಕೆ ಮಾತ್ರ ಲಭ್ಯವಿರುತ್ತದೆ.',
      questionEn: 'Will my mobile number be visible to the public?',
      answerEn:
        'Never. Your mobile number is kept strictly private and is only visible to the Coffeenadu Admin team for prize verification.',
    },
    {
      id: 'faq-3',
      questionKn: 'ಒಬ್ಬ ಬಳಕೆದಾರರು 30 ದಿನಗಳ ಅವಧಿಯಲ್ಲಿ ಎಷ್ಟು ಸುದ್ದಿಗಳನ್ನು ಪ್ರಕಟಿಸಬಹುದು?',
      answerKn:
        'ಯಾವುದೇ ಮಿತಿಯಿಲ್ಲ! ನೋಂದಾಯಿತ ಬಳಕೆದಾರರು 30 ದಿನಗಳ ಸ್ಪರ್ಧಾ ಅವಧಿಯಲ್ಲಿ ಎಷ್ಟು ಬೇಕಾದರೂ ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಗಳನ್ನು ಪ್ರಕಟಿಸಬಹುದು. ನಿಮ್ಮ ಎಲ್ಲಾ ಅರ್ಹ ಸುದ್ದಿಗಳ ಒಟ್ಟು ಪರಿಶೀಲಿತ ವೀಕ್ಷಣೆಗಳು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಲೀಡರ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ಸೇರಿಕೊಳ್ಳುತ್ತವೆ.',
      questionEn: 'How many news articles can a registered user publish in a 30-day period?',
      answerEn:
        'Unlimited! Every registered user can publish as many original local news articles as they want during the active 30-day period, and verified views across all eligible articles automatically add up on the leaderboard.',
    },
  ];
}

export function createDefaultContestEditableContent(
  nowIso: string = new Date().toISOString()
): ContestEditableContent {
  return {
    version: 1,
    updatedAt: nowIso,
    updatedBy: 'system',
    mainHeadingEn: CONTEST_OFFICIAL_NAME,
    mainHeadingKn: CONTEST_KANNADA_HEADING,
    subtitleKn: CONTEST_KANNADA_SUBTITLE,
    subtitleEn:
      'Publish original local news from your town or village, share with readers, and win monthly cash prizes!',
    introKn:
      'ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಸುತ್ತಮುತ್ತಲಿನ ಮಲೆನಾಡು ಗ್ರಾಮಗಳಿಗಾಗಿ ವಿಶೇಷ ಮಾಸಿಕ ಸ್ಪರ್ಧೆ · ಯಾವುದೇ ಪ್ರವೇಶ ಶುಲ್ಕವಿಲ್ಲ · ಶೂನ್ಯ ಜಾಹೀರಾತು ಪುಟ',
    introEn: CONTEST_TARGET_AREA,
    participationInstructionsKn:
      'ನಿಮ್ಮೂರಿನ ಮೂಲ ಸುದ್ದಿ, ಶೀರ್ಷಿಕೆ, ಸ್ಥಳ ಮತ್ತು ಫೋಟೋ (ಐಚ್ಛಿಕ) ಸೇರಿಸಿ ಪ್ರಕಟಿಸಿ. ಪ್ರಕಟವಾದ ನಂತರ WhatsApp ಮೂಲಕ ಹಂಚಿಕೊಂಡು ಹೆಚ್ಚು ಓದುಗರಿಗೆ ತಲುಪಿಸಿ.',
    participationInstructionsEn:
      'Submit your original local news with title, location, and optional photo, then share the permanent link via WhatsApp.',
    announcementBannerKn:
      'ಈ ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆ ಚಾಲ್ತಿಯಲ್ಲಿದೆ! ಈಗಲೇ ನಿಮ್ಮೂರಿನ ಮೂಲ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ ₹1,500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ.',
    announcementBannerEn:
      'This month’s news challenge is open! Publish original local news and compete for ₹1,500 in monthly cash rewards.',
    showAnnouncementBanner: true,
    homepagePromoBadgeKn: 'ಈ ತಿಂಗಳ ₹1,500 ನಗದು ಬಹುಮಾನ!',
    homepagePromoHeadingKn: CONTEST_KANNADA_HEADING,
    homepagePromoSubtitleKn:
      'ನಿಮ್ಮೂರಿನ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ, ಎಲ್ಲರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ ಮತ್ತು ತಿಂಗಳ ವಿಜೇತರಾಗಿ — ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಸುತ್ತಮುತ್ತಲಿನ ಮಲೆನಾಡು ಗ್ರಾಮಗಳಿಗಾಗಿ ಉಚಿತ ಮಾಸಿಕ ಸ್ಪರ್ಧೆ.',
    homepagePromoButtonKn: 'ಸ್ಪರ್ಧೆಯಲ್ಲಿ ಭಾಗವಹಿಸಿ',
    showHomepagePromo: true,
    pageDescriptionKn:
      'ಸುದ್ದಿ ತೆರೆಯಿರಿ ಮತ್ತು ನಿಮ್ಮ ಸ್ನೇಹಿತರೊಂದಿಗೆ ಹಂಚಿಕೊಂಡು ವೀಕ್ಷಣೆ ಹೆಚ್ಚಿಸಿ',
    pageDescriptionEn:
      'Open any article and share with your friends and local groups to grow readership.',
    eligibilityCriteriaKn: [
      'ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿ ಮಾತ್ರ (ಜಾಹೀರಾತು/ಮಾರಾಟ/ಕಳೆದುಹೋದ ವಸ್ತು ಪ್ರಕಟಣೆಯಲ್ಲ)',
      'ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಅಥವಾ ಮಲೆನಾಡು ಭಾಗಕ್ಕೆ ಸಂಬಂಧಿಸಿರಬೇಕು',
      'ಒಬ್ಬ ಓದುಗರಿಂದ 24 ಗಂಟೆಯಲ್ಲಿ 1 ಅರ್ಹ ವೀಕ್ಷಣೆ ಮಾತ್ರ ಲೆಕ್ಕವಾಗುತ್ತದೆ',
    ],
    eligibilityCriteriaEn: [
      'Original local news only (no advertisements, sales, or lost & found listings)',
      'Relevant to Koppa, Sringeri, Jayapura, Balehonnur, or surrounding Malnad region',
      'Maximum 1 eligible view per visitor per article within a rolling 24-hour window',
    ],
    competitionRules: createDefaultContestRules(),
    closingDateNoticeKn:
      'ತಿಂಗಳ ಕೊನೆಯ ದಿನ ರಾತ್ರಿ 11:59 (IST) ಕ್ಕೆ ಸ್ಪರ್ಧೆಯ ವೀಕ್ಷಣೆ ಲೆಕ್ಕಾಚಾರ ಮುಕ್ತಾಯವಾಗುತ್ತದೆ.',
    countdownLabelOpenKn: 'ತಿಂಗಳ ಸ್ಪರ್ಧೆ ಮುಕ್ತಾಯಕ್ಕೆ ಬಾಕಿ ಸಮಯ',
    countdownLabelClosedKn: 'ಈ ತಿಂಗಳ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ',
    winnerAnnouncementHeadingKn: 'ಈ ತಿಂಗಳ ವಿಜೇತರನ್ನು ತಿಂಗಳ ಅಂತ್ಯದಲ್ಲಿ ಪ್ರಕಟಿಸಲಾಗುವುದು',
    winnerAnnouncementNoteKn:
      'ಪ್ರತಿ ತಿಂಗಳ ಸ್ಪರ್ಧೆ ಮುಕ್ತಾಯಗೊಂಡು ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆ ಪೂರ್ಣಗೊಂಡ ನಂತರ ವಿಜೇತರ ಹೆಸರು, ವಿಜೇತ ಸುದ್ದಿ ಮತ್ತು ಬಹುಮಾನದ ವಿವರಗಳನ್ನು ಇಲ್ಲಿ ಶಾಶ್ವತವಾಗಿ ಪ್ರಕಟಿಸಲಾಗುತ್ತದೆ.',
    previousWinnersHeadingKn: 'ಹಿಂದಿನ ತಿಂಗಳ ವಿಜೇತರು (Previous Winners)',
    previousWinnersSubtitleKn: 'Official Hall of Winners',
    faqs: createDefaultContestFaqs(),
    buttonLabels: {
      participateBtnKn: 'Submit News & Participate (ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ)',
      leaderboardBtnEn: 'View Leaderboard',
      rulesBtnEn: 'Read Competition Rules',
      previousWinnersBtnEn: 'Previous Winners',
      shareContestBtnEn: 'Share Contest',
    },
    importantNoticeKn:
      'ಗಮನಿಸಿ: ಸ್ಪರ್ಧೆಯಿಂದ ಅನರ್ಹಗೊಂಡ ಸುದ್ದಿಗಳು ಲೀಡರ್‌ಬೋರ್ಡ್‌ನಿಂದ ಮಾತ್ರ ಹೊರಗುಳಿಯುತ್ತವೆ; ಆಡ್ಮಿನ್ ಅನ್‌ಪಬ್ಲಿಶ್ ಮಾಡದ ಹೊರತು ಸಮುದಾಯ ಫೀಡ್‌ನಲ್ಲಿ ಓದುಗರಿಗೆ ಲಭ್ಯವಿರುತ್ತವೆ.',
    importantNoticeEn:
      'Note: Disqualified contest entries are removed only from the active contest leaderboard and remain visible in the Community Feed unless unpublished by an administrator.',
    showImportantNotice: true,
    footerInfoKn:
      'ಕಾಫಿನಾಡು ಮಾಸಿಕ ಸುದ್ದಿ ಸ್ಪರ್ಧೆ · ಮಲೆನಾಡಿನ ಜನರ ಧ್ವನಿ · ಯಾವುದೇ ಪ್ರವೇಶ ಶುಲ್ಕವಿಲ್ಲ',
    footerInfoEn:
      'Coffeenadu Monthly News Challenge · Voice of Malnad · Zero Entry Fee',
    sectionOrder: [...DEFAULT_CONTEST_SECTION_ORDER],
    hiddenSections: [],
    previousVersions: [],
  };
}

function cleanTextField(val: unknown, fallback: string, maxLen = 1200): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').trim();
  return trimmed ? trimmed.slice(0, maxLen) : fallback;
}

export function sanitizeContestEditableContent(
  input: Partial<ContestEditableContent> | null | undefined,
  previous?: ContestEditableContent | null,
  actorEmail = 'admin@coffeenadu.in',
  recordHistory = false
): ContestEditableContent {
  const nowIso = new Date().toISOString();
  const base = previous
    ? { ...createDefaultContestEditableContent(nowIso), ...previous }
    : createDefaultContestEditableContent(nowIso);

  if (!input || typeof input !== 'object') {
    return base;
  }

  const allowedSections = new Set<ContestSectionKey>(DEFAULT_CONTEST_SECTION_ORDER);
  const rawOrder = Array.isArray(input.sectionOrder) ? input.sectionOrder : base.sectionOrder;
  const normalizedOrder: ContestSectionKey[] = [];
  for (const key of rawOrder) {
    if (allowedSections.has(key as ContestSectionKey) && !normalizedOrder.includes(key as ContestSectionKey)) {
      normalizedOrder.push(key as ContestSectionKey);
    }
  }
  for (const defKey of DEFAULT_CONTEST_SECTION_ORDER) {
    if (!normalizedOrder.includes(defKey)) {
      normalizedOrder.push(defKey);
    }
  }

  const rawHidden = Array.isArray(input.hiddenSections)
    ? input.hiddenSections
    : base.hiddenSections;
  const normalizedHidden = rawHidden.filter((k): k is ContestSectionKey =>
    allowedSections.has(k as ContestSectionKey)
  );

  const normalizedRules: ContestRuleItem[] =
    Array.isArray(input.competitionRules) && input.competitionRules.length > 0
      ? input.competitionRules
          .map((r, i) => ({
            id: cleanTextField(r?.id, `rule-${i + 1}`, 40),
            titleKn: cleanTextField(r?.titleKn, `ನಿಯಮ ${i + 1}`, 240),
            descKn: cleanTextField(r?.descKn, '', 800),
            titleEn: typeof r?.titleEn === 'string' ? r.titleEn.trim().slice(0, 240) : undefined,
            descEn: typeof r?.descEn === 'string' ? r.descEn.trim().slice(0, 800) : undefined,
          }))
          .filter((r) => Boolean(r.titleKn && r.descKn))
      : base.competitionRules;

  const normalizedFaqs: ContestFaqItem[] =
    Array.isArray(input.faqs)
      ? input.faqs
          .map((f, i) => ({
            id: cleanTextField(f?.id, `faq-${i + 1}`, 40),
            questionKn: cleanTextField(f?.questionKn, '', 300),
            answerKn: cleanTextField(f?.answerKn, '', 1000),
            questionEn:
              typeof f?.questionEn === 'string' ? f.questionEn.trim().slice(0, 300) : undefined,
            answerEn:
              typeof f?.answerEn === 'string' ? f.answerEn.trim().slice(0, 1000) : undefined,
          }))
          .filter((f) => Boolean(f.questionKn && f.answerKn))
      : base.faqs;

  const eligibilityKn = Array.isArray(input.eligibilityCriteriaKn)
    ? input.eligibilityCriteriaKn
        .map((s) => String(s || '').trim().slice(0, 400))
        .filter(Boolean)
    : base.eligibilityCriteriaKn;

  const eligibilityEn = Array.isArray(input.eligibilityCriteriaEn)
    ? input.eligibilityCriteriaEn
        .map((s) => String(s || '').trim().slice(0, 400))
        .filter(Boolean)
    : base.eligibilityCriteriaEn;

  const historyList: ContestEditableContentSnapshot[] = Array.isArray(base.previousVersions)
    ? [...base.previousVersions]
    : [];

  if (recordHistory && previous) {
    const { previousVersions: _ignored, ...snapshotContent } = base;
    historyList.unshift({
      version: base.version || 1,
      updatedAt: base.updatedAt || nowIso,
      updatedBy: base.updatedBy || actorEmail,
      content: snapshotContent,
    });
  }

  return {
    version: recordHistory ? (base.version || 1) + 1 : base.version || 1,
    updatedAt: nowIso,
    updatedBy: actorEmail,
    mainHeadingEn: cleanTextField(input.mainHeadingEn, base.mainHeadingEn, 240),
    mainHeadingKn: cleanTextField(input.mainHeadingKn, base.mainHeadingKn, 240),
    subtitleKn: cleanTextField(input.subtitleKn, base.subtitleKn, 400),
    subtitleEn: cleanTextField(input.subtitleEn, base.subtitleEn, 400),
    introKn: cleanTextField(input.introKn, base.introKn, 600),
    introEn: cleanTextField(input.introEn, base.introEn, 600),
    participationInstructionsKn: cleanTextField(
      input.participationInstructionsKn,
      base.participationInstructionsKn,
      1000
    ),
    participationInstructionsEn: cleanTextField(
      input.participationInstructionsEn,
      base.participationInstructionsEn,
      1000
    ),
    announcementBannerKn: cleanTextField(
      input.announcementBannerKn,
      base.announcementBannerKn,
      600
    ),
    announcementBannerEn: cleanTextField(
      input.announcementBannerEn,
      base.announcementBannerEn,
      600
    ),
    showAnnouncementBanner:
      typeof input.showAnnouncementBanner === 'boolean'
        ? input.showAnnouncementBanner
        : base.showAnnouncementBanner,
    homepagePromoBadgeKn: cleanTextField(
      input.homepagePromoBadgeKn,
      base.homepagePromoBadgeKn,
      180
    ),
    homepagePromoHeadingKn: cleanTextField(
      input.homepagePromoHeadingKn,
      base.homepagePromoHeadingKn,
      300
    ),
    homepagePromoSubtitleKn: cleanTextField(
      input.homepagePromoSubtitleKn,
      base.homepagePromoSubtitleKn,
      600
    ),
    homepagePromoButtonKn: cleanTextField(
      input.homepagePromoButtonKn,
      base.homepagePromoButtonKn,
      120
    ),
    showHomepagePromo:
      typeof input.showHomepagePromo === 'boolean'
        ? input.showHomepagePromo
        : base.showHomepagePromo,
    pageDescriptionKn: cleanTextField(input.pageDescriptionKn, base.pageDescriptionKn, 600),
    pageDescriptionEn: cleanTextField(input.pageDescriptionEn, base.pageDescriptionEn, 600),
    eligibilityCriteriaKn: eligibilityKn.length > 0 ? eligibilityKn : base.eligibilityCriteriaKn,
    eligibilityCriteriaEn: eligibilityEn.length > 0 ? eligibilityEn : base.eligibilityCriteriaEn,
    competitionRules: normalizedRules.length > 0 ? normalizedRules : base.competitionRules,
    closingDateNoticeKn: cleanTextField(
      input.closingDateNoticeKn,
      base.closingDateNoticeKn,
      400
    ),
    countdownLabelOpenKn: cleanTextField(
      input.countdownLabelOpenKn,
      base.countdownLabelOpenKn,
      180
    ),
    countdownLabelClosedKn: cleanTextField(
      input.countdownLabelClosedKn,
      base.countdownLabelClosedKn,
      180
    ),
    winnerAnnouncementHeadingKn: cleanTextField(
      input.winnerAnnouncementHeadingKn,
      base.winnerAnnouncementHeadingKn,
      300
    ),
    winnerAnnouncementNoteKn: cleanTextField(
      input.winnerAnnouncementNoteKn,
      base.winnerAnnouncementNoteKn,
      800
    ),
    previousWinnersHeadingKn: cleanTextField(
      input.previousWinnersHeadingKn,
      base.previousWinnersHeadingKn,
      240
    ),
    previousWinnersSubtitleKn: cleanTextField(
      input.previousWinnersSubtitleKn,
      base.previousWinnersSubtitleKn,
      240
    ),
    faqs: normalizedFaqs,
    buttonLabels: {
      participateBtnKn: cleanTextField(
        input.buttonLabels?.participateBtnKn,
        base.buttonLabels.participateBtnKn,
        140
      ),
      leaderboardBtnEn: cleanTextField(
        input.buttonLabels?.leaderboardBtnEn,
        base.buttonLabels.leaderboardBtnEn,
        100
      ),
      rulesBtnEn: cleanTextField(
        input.buttonLabels?.rulesBtnEn,
        base.buttonLabels.rulesBtnEn,
        100
      ),
      previousWinnersBtnEn: cleanTextField(
        input.buttonLabels?.previousWinnersBtnEn,
        base.buttonLabels.previousWinnersBtnEn,
        100
      ),
      shareContestBtnEn: cleanTextField(
        input.buttonLabels?.shareContestBtnEn,
        base.buttonLabels.shareContestBtnEn,
        100
      ),
    },
    importantNoticeKn: cleanTextField(input.importantNoticeKn, base.importantNoticeKn, 800),
    importantNoticeEn: cleanTextField(input.importantNoticeEn, base.importantNoticeEn, 800),
    showImportantNotice:
      typeof input.showImportantNotice === 'boolean'
        ? input.showImportantNotice
        : base.showImportantNotice,
    footerInfoKn: cleanTextField(input.footerInfoKn, base.footerInfoKn, 400),
    footerInfoEn: cleanTextField(input.footerInfoEn, base.footerInfoEn, 400),
    sectionOrder: normalizedOrder,
    hiddenSections: normalizedHidden,
    previousVersions: historyList.slice(0, 10),
  };
}

export function restoreContestContentFromHistory(
  current: ContestEditableContent,
  targetVersion?: number,
  actorEmail = 'admin@coffeenadu.in'
): ContestEditableContent | null {
  const history = Array.isArray(current.previousVersions) ? current.previousVersions : [];
  if (history.length === 0) return null;

  const targetIdx =
    typeof targetVersion === 'number'
      ? history.findIndex((snap) => snap.version === targetVersion)
      : 0;
  if (targetIdx === -1) return null;

  const selected = history[targetIdx];
  const remainingHistory = history.filter((_, idx) => idx !== targetIdx);
  const nowIso = new Date().toISOString();

  return {
    ...selected.content,
    version: (current.version || 1) + 1,
    updatedAt: nowIso,
    updatedBy: actorEmail,
    previousVersions: remainingHistory.slice(0, 10),
  };
}
