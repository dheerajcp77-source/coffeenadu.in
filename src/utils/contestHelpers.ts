import type {
  ContestEntryRecord,
  ContestMonthRecord,
  ContestPrizeTier,
  ContestWinnerRecord,
  PublicContestEntry,
  PublicContestWinner,
} from '../types/contest.ts';

export const CONTEST_OFFICIAL_NAME = 'COFFEENADU – MOST VIEWED NEWS CHALLENGE 2026';
export const CONTEST_KANNADA_HEADING =
  'ನಿಮ್ಮ ಸುದ್ದಿ ಹೆಚ್ಚು ಜನರಿಗೆ ತಲುಪಲಿ – ₹500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ!';
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
      amountInr: 200,
      type: 'views',
    },
    {
      rank: 2,
      labelEn: '2nd Prize — Second Most Viewed News',
      labelKn: 'ದ್ವಿತೀಯ ಬಹುಮಾನ — 2ನೇ ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆ',
      amountInr: 100,
      type: 'views',
    },
    {
      rank: 3,
      labelEn: '3rd Prize — Third Most Viewed News',
      labelKn: 'ತೃತೀಯ ಬಹುಮಾನ — 3ನೇ ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆ',
      amountInr: 75,
      type: 'views',
    },
    {
      rank: 4,
      labelEn: '4th Prize — Fourth Most Viewed News',
      labelKn: '4ನೇ ಬಹುಮಾನ — 4ನೇ ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆ',
      amountInr: 75,
      type: 'views',
    },
    {
      rank: 5,
      labelEn: '5th Prize — Best Quality Original News (Admin Selection)',
      labelKn: '5ನೇ ಬಹುಮಾನ — ಅತ್ಯುತ್ತಮ ಮೂಲ ಸುದ್ದಿ (ಸಂಪಾದಕರ ಆಯ್ಕೆ)',
      amountInr: 50,
      type: 'quality',
    },
  ];
}

export function normalizeContestPrizes(raw?: Partial<ContestPrizeTier>[] | null): ContestPrizeTier[] {
  const defaults = createDefaultContestPrizes();
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
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

export function createDefaultMonthRecord(monthKey: string): ContestMonthRecord {
  const bounds = getIstMonthBounds(monthKey);
  const nowIso = new Date().toISOString();
  return {
    monthKey,
    competitionName: CONTEST_OFFICIAL_NAME,
    displayLabelEn: bounds.displayLabelEn,
    displayLabelKn: bounds.displayLabelKn,
    startsAtIso: bounds.startsAtIso,
    endsAtIso: bounds.endsAtIso,
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

export function buildContestPageShareText(monthLabelKn?: string): string {
  const monthLine = monthLabelKn ? ` (${monthLabelKn})` : '';
  return [
    `🏆 *${CONTEST_OFFICIAL_NAME}*${monthLine}`,
    '',
    `✨ ${CONTEST_KANNADA_HEADING}`,
    `${CONTEST_KANNADA_SUBTITLE}`,
    '',
    '💰 ತಿಂಗಳ ಒಟ್ಟು ಬಹುಮಾನ: ₹500',
    '🥇 1st: ₹200 | 🥈 2nd: ₹100 | 🥉 3rd: ₹75 | 🏅 4th: ₹75 | ⭐ 5th (ಉತ್ತಮ ಸುದ್ದಿ): ₹50',
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
    `ನೀವು ಕೂಡ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ ₹500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ: ${CONTEST_PUBLIC_URL}`,
  ].join('\n');
}
