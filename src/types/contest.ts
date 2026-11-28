export type ContestMonthStatus = 'open' | 'closed' | 'finalized';

export type ContestEntryEligibility = 'eligible' | 'disqualified';

export type ContestPrizeType = 'views' | 'quality';

export type ContestPaymentStatus = 'pending' | 'processing' | 'paid';

export interface ContestPrizeTier {
  rank: 1 | 2 | 3 | 4 | 5;
  labelEn: string;
  labelKn: string;
  amountInr: number;
  type: ContestPrizeType;
}

export interface ContestWinnerRecord {
  rank: 1 | 2 | 3 | 4 | 5;
  prizeType: ContestPrizeType;
  prizeLabelEn: string;
  prizeLabelKn: string;
  prizeAmountInr: number;
  entryId: string;
  postId: string;
  articleSlug: string;
  articleTitle: string;
  contributorName: string;
  /** Strictly admin-only — NEVER serialized to public endpoints. */
  contributorMobileNumber?: string;
  eligibleViews: number;
  selectionNote?: string;
  paymentStatus: ContestPaymentStatus;
  paymentDate?: string;
  paymentReference?: string;
  selectedBy?: string;
  selectedAt?: string;
}

/**
 * Public-safe winner announcement projection.
 * NEVER contains mobile numbers, payment details, or private IDs.
 */
export interface PublicContestWinner {
  rank: 1 | 2 | 3 | 4 | 5;
  prizeType: ContestPrizeType;
  prizeLabelEn: string;
  prizeLabelKn: string;
  prizeAmountInr: number;
  entryId: string;
  articleSlug: string;
  articleTitle: string;
  contributorName: string;
  eligibleViews: number;
  selectionNote?: string;
}

export interface ContestUserLeaderboardArticleSummary {
  id: string;
  slug: string;
  title: string;
  eligibleViews: number;
  publishedAt: string;
}

/**
 * Strictly public-safe aggregated participant row for the 30-day Automatic User Views Leaderboard.
 * NEVER exposes contributorUserId, mobile number, email, or private credentials.
 */
export interface ContestUserLeaderboardEntry {
  rank: number;
  /** Non-PII opaque key derived from period + participant for stable UI rendering. */
  participantKey: string;
  displayName: string;
  totalVerifiedViews: number;
  eligibleArticleCount: number;
  competitionPeriodId: string;
  competitionPeriodLabelEn: string;
  competitionPeriodLabelKn: string;
  lastViewAchievedAt?: string;
  firstPublishedAt?: string;
  topArticles?: ContestUserLeaderboardArticleSummary[];
}

export interface ContestMonthRecord {
  monthKey: string; // YYYY-MM in IST (e.g., "2026-11") or unique period key
  periodId?: string; // Unique competition period ID (defaults to monthKey for backward compatibility)
  durationDays?: number; // Exact competition period duration in days (default 30)
  competitionName: string;
  displayLabelEn: string;
  displayLabelKn: string;
  startsAtIso: string; // ISO string with IST offset (+05:30)
  endsAtIso: string; // ISO string with IST offset (+05:30)
  status: ContestMonthStatus;
  /** Server-enforced toggle allowing admins to pause or resume contest submissions. Default: true. */
  participationEnabled?: boolean;
  /** Admin-controlled list of contributorUserIds excluded from this period's user leaderboard. */
  excludedUserIds?: string[];
  excludedUserReasons?: Record<string, string>;
  /** Frozen leaderboard snapshot captured when a competition period closes or finalizes. */
  frozenUserLeaderboard?: ContestUserLeaderboardEntry[];
  frozenAt?: string;
  prizes: ContestPrizeTier[];
  winners: ContestWinnerRecord[];
  winnersPublished: boolean;
  allowCarryOver?: boolean;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  finalizedBy?: string;
}

export interface ContestEntryRecord {
  id: string;
  postId: string; // Links directly to CommunityPostRecord.id (no duplicate article store)
  slug: string; // Permanent /community/<slug> URL
  competitionMonth: string; // YYYY-MM (IST)
  contributorUserId: string; // PRIVATE — never exposed publicly
  contributorName: string; // Public display name
  title: string;
  summary: string;
  location: string;
  thumbnailUrl?: string;
  publishedAt: string;
  eligibility: ContestEntryEligibility;
  disqualificationReason?: string;
  disqualifiedBy?: string;
  disqualifiedAt?: string;
  totalPageViews: number;
  /** Genuine 24-hour unique organic eligible views (never overwritten by manual score edits). */
  eligibleViews: number;
  genuineEligibleViews?: number;
  genuine_eligible_views?: number;
  /** Super Admin manual score adjustment (integer, default 0). */
  manualScoreAdjustment?: number;
  manual_score_adjustment?: number;
  /** Final competition display score = Math.max(0, genuine_eligible_views + manual_score_adjustment). */
  competitionDisplayScore?: number;
  competition_display_score?: number;
  manualScoreUpdatedBy?: string;
  manualScoreUpdatedAt?: string;
  suspiciousBlockedViews: number;
  suspiciousFlagged: boolean;
  lastViewedAt?: string;
  /** Timestamp of the most recent verified eligible view counted for this article (used for tie-breaking). */
  lastEligibleViewAt?: string;
  /** Optional client-generated idempotency key to prevent duplicate articles on double-click/network retries. */
  clientSubmissionId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Strictly sanitized public contest entry.
 * NEVER includes contributorUserId, mobile numbers, visitor hashes, IP data, or manual adjustment internals.
 * `eligibleViews` and `competitionDisplayScore` reflect the final `competition_display_score`.
 */
export interface PublicContestEntry {
  id: string;
  postId: string;
  slug: string;
  competitionMonth: string;
  contributorName: string;
  title: string;
  summary: string;
  location: string;
  thumbnailUrl?: string;
  publishedAt: string;
  eligibleViews: number;
  competitionDisplayScore?: number;
  competition_display_score?: number;
  totalPageViews: number;
  rank?: number;
}

export interface AdminContestEntryView extends ContestEntryRecord {
  contributorMobileNumber: string; // Admin-only reference
  postStatus: string;
  openAlertsCount: number;
  genuineEligibleViews: number;
  genuine_eligible_views: number;
  manualScoreAdjustment: number;
  manual_score_adjustment: number;
  competitionDisplayScore: number;
  competition_display_score: number;
  currentRank?: number | null;
  genuineRank?: number | null;
}

export interface AdminContestParticipantView {
  rank: number | null;
  userId: string;
  displayName: string;
  mobileNumber: string;
  userStatus: 'active' | 'suspended';
  leaderboardEligible: boolean;
  exclusionReason?: string;
  totalVerifiedViews: number;
  totalGenuineViews: number;
  eligibleArticleCount: number;
  totalArticleCount: number;
  disqualifiedArticleCount: number;
  lastViewAchievedAt?: string;
  firstPublishedAt?: string;
  articles: AdminContestEntryView[];
}

export interface ContestSuspiciousAlert {
  id: string;
  entryId: string;
  articleSlug: string;
  articleTitle: string;
  competitionMonth: string;
  reason: string;
  severity: 'medium' | 'high';
  blockedCount: number;
  detectedAt: string;
  status: 'open' | 'investigated' | 'dismissed';
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ContestAuditLogRecord {
  id: string;
  timestamp: string;
  actorEmail: string;
  action: string;
  competitionMonth: string;
  targetId?: string;
  details: string;
}

export interface ContestRuleItem {
  id: string;
  titleKn: string;
  descKn: string;
  titleEn?: string;
  descEn?: string;
}

export interface ContestFaqItem {
  id: string;
  questionKn: string;
  answerKn: string;
  questionEn?: string;
  answerEn?: string;
}

export type ContestSectionKey =
  | 'hero'
  | 'notice'
  | 'prizes'
  | 'leaderboard'
  | 'rules'
  | 'faqs'
  | 'winners';

export interface ContestEditableContentSnapshot {
  version: number;
  updatedAt: string;
  updatedBy: string;
  content: Omit<ContestEditableContent, 'previousVersions'>;
}

export interface ContestEditableContent {
  version: number;
  updatedAt: string;
  updatedBy: string;
  mainHeadingEn: string;
  mainHeadingKn: string;
  subtitleKn: string;
  subtitleEn: string;
  introKn: string;
  introEn: string;
  participationInstructionsKn: string;
  participationInstructionsEn: string;
  announcementBannerKn: string;
  announcementBannerEn: string;
  showAnnouncementBanner: boolean;
  homepagePromoBadgeKn: string;
  homepagePromoHeadingKn: string;
  homepagePromoSubtitleKn: string;
  homepagePromoButtonKn: string;
  showHomepagePromo: boolean;
  pageDescriptionKn: string;
  pageDescriptionEn: string;
  eligibilityCriteriaKn: string[];
  eligibilityCriteriaEn: string[];
  competitionRules: ContestRuleItem[];
  closingDateNoticeKn: string;
  countdownLabelOpenKn: string;
  countdownLabelClosedKn: string;
  winnerAnnouncementHeadingKn: string;
  winnerAnnouncementNoteKn: string;
  previousWinnersHeadingKn: string;
  previousWinnersSubtitleKn: string;
  faqs: ContestFaqItem[];
  buttonLabels: {
    participateBtnKn: string;
    leaderboardBtnEn: string;
    rulesBtnEn: string;
    previousWinnersBtnEn: string;
    shareContestBtnEn: string;
  };
  importantNoticeKn: string;
  importantNoticeEn: string;
  showImportantNotice: boolean;
  footerInfoKn: string;
  footerInfoEn: string;
  sectionOrder: ContestSectionKey[];
  hiddenSections: ContestSectionKey[];
  previousVersions?: ContestEditableContentSnapshot[];
}

export interface ContestSystemDiagnosticRecord {
  id: string;
  timestamp: string;
  operationType:
    | 'mobile_registration'
    | 'news_publish'
    | 'contest_submit'
    | 'image_upload'
    | 'view_count'
    | 'report_submit'
    | 'score_update'
    | 'content_update'
    | 'cloud_sync';
  recordId?: string;
  category: 'info' | 'warning' | 'error';
  message: string;
  recoveryStatus: 'verified' | 'recovered_fallback' | 'action_required';
}

export interface ContestPublicOverview {
  competitionName: string;
  kannadaHeading: string;
  kannadaSubtitle: string;
  targetArea: string;
  contestUrl: string;
  contentConfig?: ContestEditableContent;
  activeMonth: {
    monthKey: string;
    periodId?: string;
    durationDays?: number;
    displayLabelEn: string;
    displayLabelKn: string;
    startsAtIso: string;
    endsAtIso: string;
    status: ContestMonthStatus;
    participationEnabled?: boolean;
    isAcceptingEntries: boolean;
    totalBudgetInr: number;
    prizes: ContestPrizeTier[];
    winnersPublished: boolean;
    publishedWinners: PublicContestWinner[];
  };
  /** Automatic 30-day user-aggregated leaderboard (sums all eligible articles per registered user). */
  userLeaderboard?: ContestUserLeaderboardEntry[];
  totalParticipantsCount?: number;
  topThree?: PublicContestEntry[];
  topFour: PublicContestEntry[];
  fourthQualityWinner?: PublicContestWinner | null;
  fifthQualityWinner: PublicContestWinner | null;
  allEligibleEntries: PublicContestEntry[];
  totalEligibleCount: number;
  previousMonths: Array<{
    monthKey: string;
    periodId?: string;
    displayLabelEn: string;
    displayLabelKn: string;
    startsAtIso?: string;
    endsAtIso?: string;
    status: ContestMonthStatus;
    winners: PublicContestWinner[];
    userLeaderboard?: ContestUserLeaderboardEntry[];
  }>;
  serverNowIso: string;
}

export interface ContestAdminOverview {
  activeMonthKey: string;
  months: ContestMonthRecord[];
  selectedMonth: ContestMonthRecord;
  contentConfig?: ContestEditableContent;
  diagnostics?: ContestSystemDiagnosticRecord[];
  entries: AdminContestEntryView[];
  participants?: AdminContestParticipantView[];
  userLeaderboard?: ContestUserLeaderboardEntry[];
  alerts: ContestSuspiciousAlert[];
  auditLogs: ContestAuditLogRecord[];
  summary: {
    totalEntries: number;
    eligibleEntries: number;
    disqualifiedEntries: number;
    totalParticipants?: number;
    eligibleParticipants?: number;
    totalPageViews: number;
    totalEligibleViews: number;
    totalCompetitionDisplayScore?: number;
    manuallyAdjustedEntries?: number;
    suspiciousBlockedViews: number;
    openAlerts: number;
  };
}

export interface ContestViewRecordResult {
  ok: boolean;
  entryId: string;
  slug: string;
  competitionMonth: string;
  countedEligible: boolean;
  countedReason:
    | 'counted'
    | 'duplicate_24h'
    | 'bot_filtered'
    | 'admin_excluded'
    | 'suspicious_blocked'
    | 'month_closed'
    | 'disqualified';
  eligibleViews: number;
  competitionDisplayScore?: number;
  competition_display_score?: number;
  totalPageViews: number;
}
