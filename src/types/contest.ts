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

export interface ContestMonthRecord {
  monthKey: string; // YYYY-MM in IST (e.g., "2026-11")
  competitionName: string;
  displayLabelEn: string;
  displayLabelKn: string;
  startsAtIso: string; // ISO string with IST offset (+05:30)
  endsAtIso: string; // ISO string with IST offset (+05:30)
  status: ContestMonthStatus;
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

export interface ContestPublicOverview {
  competitionName: string;
  kannadaHeading: string;
  kannadaSubtitle: string;
  targetArea: string;
  contestUrl: string;
  activeMonth: {
    monthKey: string;
    displayLabelEn: string;
    displayLabelKn: string;
    startsAtIso: string;
    endsAtIso: string;
    status: ContestMonthStatus;
    isAcceptingEntries: boolean;
    totalBudgetInr: number;
    prizes: ContestPrizeTier[];
    winnersPublished: boolean;
    publishedWinners: PublicContestWinner[];
  };
  topFour: PublicContestEntry[];
  fifthQualityWinner: PublicContestWinner | null;
  allEligibleEntries: PublicContestEntry[];
  totalEligibleCount: number;
  previousMonths: Array<{
    monthKey: string;
    displayLabelEn: string;
    displayLabelKn: string;
    status: ContestMonthStatus;
    winners: PublicContestWinner[];
  }>;
  serverNowIso: string;
}

export interface ContestAdminOverview {
  activeMonthKey: string;
  months: ContestMonthRecord[];
  selectedMonth: ContestMonthRecord;
  entries: AdminContestEntryView[];
  alerts: ContestSuspiciousAlert[];
  auditLogs: ContestAuditLogRecord[];
  summary: {
    totalEntries: number;
    eligibleEntries: number;
    disqualifiedEntries: number;
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
