import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTEST_PUBLIC_URL,
  ROLLING_VIEW_WINDOW_MS,
  buildAdminContestParticipants,
  buildContestArticleShareText,
  buildContestPageShareText,
  buildUserViewsLeaderboard,
  compute30DayPeriodBounds,
  computeCompetitionDisplayScore,
  computeCountdownParts,
  createDefaultContestEditableContent,
  createDefaultContestPrizes,
  createInitialContestMonthRecord,
  detectSuspiciousTrafficPattern,
  getIstMonthBounds,
  getIstMonthKey,
  getNextIstMonthKey,
  isContestAcceptingEntries,
  isContestMonthOpen,
  isEligibleRolling24hVisit,
  isLikelyBotUserAgent,
  rankEligibleContestEntries,
  restoreContestContentFromHistory,
  sanitizeContestEditableContent,
  toPublicContestEntry,
  toPublicContestWinner,
  upgradeActiveMonthPrizesIfLegacy,
} from './contestHelpers.ts';
import type { ContestEntryRecord, ContestMonthRecord, ContestWinnerRecord } from '../types/contest.ts';

test('default contest prizes total exactly ₹1,500 with 3 view prizes and 1 admin-selected 4th quality prize', () => {
  const prizes = createDefaultContestPrizes();
  assert.equal(prizes.length, 4);
  assert.equal(
    prizes.reduce((acc, p) => acc + p.amountInr, 0),
    1500
  );
  assert.deepEqual(
    prizes.map((p) => p.amountInr),
    [800, 400, 200, 100]
  );
  assert.deepEqual(
    prizes.map((p) => p.type),
    ['views', 'views', 'views', 'quality']
  );
  assert.equal(prizes[3].rank, 4);
  assert.equal(prizes[3].type, 'quality');
});

test('upgradeActiveMonthPrizesIfLegacy upgrades legacy ₹500 5-prize open months while keeping finalized historical months untouched', () => {
  const legacyPrizes = [
    { rank: 1 as const, type: 'views' as const, labelEn: '1st', labelKn: '1', amountInr: 200 },
    { rank: 2 as const, type: 'views' as const, labelEn: '2nd', labelKn: '2', amountInr: 100 },
    { rank: 3 as const, type: 'views' as const, labelEn: '3rd', labelKn: '3', amountInr: 75 },
    { rank: 4 as const, type: 'views' as const, labelEn: '4th', labelKn: '4', amountInr: 75 },
    { rank: 5 as const, type: 'quality' as const, labelEn: '5th', labelKn: '5', amountInr: 50 },
  ];
  const openMonth: ContestMonthRecord = {
    ...createInitialContestMonthRecord(),
    status: 'open',
    prizes: legacyPrizes.map((p) => ({ ...p })),
  };
  assert.equal(upgradeActiveMonthPrizesIfLegacy(openMonth), true);
  assert.deepEqual(
    openMonth.prizes.map((p) => [p.rank, p.type, p.amountInr]),
    [
      [1, 'views', 800],
      [2, 'views', 400],
      [3, 'views', 200],
      [4, 'quality', 100],
    ]
  );

  const finalizedHistoricalMonth: ContestMonthRecord = {
    ...createInitialContestMonthRecord(),
    monthKey: '2026-10',
    status: 'finalized',
    prizes: legacyPrizes.map((p) => ({ ...p })),
  };
  assert.equal(upgradeActiveMonthPrizesIfLegacy(finalizedHistoricalMonth), false);
  assert.equal(finalizedHistoricalMonth.prizes.length, 5);
  assert.equal(
    finalizedHistoricalMonth.prizes.reduce((s, p) => s + p.amountInr, 0),
    500
  );
});

test('IST month key and boundaries respect UTC+05:30 timezone transitions', () => {
  // 2026-11-30 19:00 UTC is already 2026-12-01 00:30 IST!
  const dec1Ist = new Date('2026-11-30T19:00:00Z');
  assert.equal(getIstMonthKey(dec1Ist), '2026-12');
  assert.equal(getNextIstMonthKey('2026-12'), '2027-01');

  const bounds = getIstMonthBounds('2026-11');
  assert.equal(bounds.startsAtIso, '2026-11-01T00:00:00+05:30');
  assert.equal(bounds.endsAtIso, '2026-11-30T23:59:59+05:30');
  assert.equal(bounds.displayLabelEn, 'November 2026');
});

test('isContestMonthOpen stops counting strictly after IST deadline', () => {
  const month = {
    status: 'open' as const,
    startsAtIso: '2026-11-01T00:00:00+05:30',
    endsAtIso: '2026-11-30T23:59:59+05:30',
  };
  const inside = Date.parse('2026-11-15T12:00:00+05:30');
  const after = Date.parse('2026-12-01T00:00:01+05:30');
  assert.equal(isContestMonthOpen(month, inside), true);
  assert.equal(isContestMonthOpen(month, after), false);
  assert.equal(isContestMonthOpen({ ...month, status: 'closed' }, inside), false);
});

test('rolling 24-hour view deduplication blocks repeated refreshes within 24h', () => {
  const t0 = 1_700_000_000_000;
  assert.equal(isEligibleRolling24hVisit(undefined, t0), true);
  assert.equal(isEligibleRolling24hVisit(t0, t0 + 60_000), false); // 1 min later
  assert.equal(isEligibleRolling24hVisit(t0, t0 + ROLLING_VIEW_WINDOW_MS - 1), false);
  assert.equal(isEligibleRolling24hVisit(t0, t0 + ROLLING_VIEW_WINDOW_MS), true);
});

test('isLikelyBotUserAgent filters crawlers/scripts while allowing genuine browsers', () => {
  assert.equal(isLikelyBotUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)'), true);
  assert.equal(isLikelyBotUserAgent('WhatsApp/2.23.20.0'), true);
  assert.equal(isLikelyBotUserAgent('curl/8.4.0'), true);
  assert.equal(isLikelyBotUserAgent(''), true);
  assert.equal(
    isLikelyBotUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    ),
    false
  );
});

test('detectSuspiciousTrafficPattern flags cookie rotation and burst spikes', () => {
  assert.equal(
    detectSuspiciousTrafficPattern({
      ipHitsOnArticleLast10m: 2,
      distinctVisitorsFromSameIpLast15m: 1,
      articleTotalHitsLast5m: 4,
    }),
    null
  );
  const highSpike = detectSuspiciousTrafficPattern({
    ipHitsOnArticleLast10m: 9,
    distinctVisitorsFromSameIpLast15m: 10,
    articleTotalHitsLast5m: 15,
  });
  assert.equal(highSpike?.suspicious, true);
  assert.equal(highSpike?.severity, 'high');
});

test('privacy projections strip contributorUserId, mobile numbers, and payment details', () => {
  const entry: ContestEntryRecord = {
    id: 'ce-1',
    postId: 'post-1',
    slug: 'koppa-student-award-abc1',
    competitionMonth: '2026-11',
    contributorUserId: 'usr-secret-123',
    contributorName: 'Ramesh Koppa',
    title: 'ಕೊಪ್ಪ ಶಾಲಾ ವಿದ್ಯಾರ್ಥಿಗೆ ರಾಜ್ಯ ಮಟ್ಟದ ಪ್ರಶಸ್ತಿ',
    summary: 'ವಿದ್ಯಾರ್ಥಿ ಸಾಧನೆ',
    location: 'ಕೊಪ್ಪ',
    publishedAt: '2026-11-10T10:00:00+05:30',
    eligibility: 'eligible',
    totalPageViews: 140,
    eligibleViews: 85,
    suspiciousBlockedViews: 12,
    suspiciousFlagged: false,
    createdAt: '2026-11-10T10:00:00+05:30',
    updatedAt: '2026-11-10T10:00:00+05:30',
  };
  const pubEntry = toPublicContestEntry(entry, 1);
  assert.equal('contributorUserId' in pubEntry, false);
  assert.equal('suspiciousBlockedViews' in pubEntry, false);
  assert.equal(pubEntry.eligibleViews, 85);
  assert.equal(pubEntry.totalPageViews, 140);

  const winner: ContestWinnerRecord = {
    rank: 1,
    prizeType: 'views',
    prizeLabelEn: '1st Prize',
    prizeLabelKn: 'ಪ್ರಥಮ ಬಹುಮಾನ',
    prizeAmountInr: 800,
    entryId: 'ce-1',
    postId: 'post-1',
    articleSlug: 'koppa-student-award-abc1',
    articleTitle: entry.title,
    contributorName: 'Ramesh Koppa',
    contributorMobileNumber: '9845012345',
    eligibleViews: 85,
    paymentStatus: 'paid',
    paymentDate: '2026-12-02',
    paymentReference: 'UPI-123456',
  };
  const pubWinner = toPublicContestWinner(winner);
  assert.equal('contributorMobileNumber' in pubWinner, false);
  assert.equal('paymentStatus' in pubWinner, false);
  assert.equal('paymentReference' in pubWinner, false);
  assert.equal(pubWinner.prizeAmountInr, 800);
});

test('rankEligibleContestEntries excludes disqualified entries and sorts by eligibleViews DESC', () => {
  const base: Omit<ContestEntryRecord, 'id' | 'slug' | 'eligibleViews' | 'eligibility'> = {
    postId: 'p',
    competitionMonth: '2026-11',
    contributorUserId: 'u',
    contributorName: 'Author',
    title: 'News',
    summary: 'Summary',
    location: 'ಕೊಪ್ಪ',
    publishedAt: '2026-11-10T10:00:00+05:30',
    totalPageViews: 100,
    suspiciousBlockedViews: 0,
    suspiciousFlagged: false,
    createdAt: '2026-11-10T10:00:00+05:30',
    updatedAt: '2026-11-10T10:00:00+05:30',
  };
  const ranked = rankEligibleContestEntries([
    { ...base, id: 'a', slug: 'a', eligibleViews: 40, eligibility: 'eligible' },
    { ...base, id: 'b', slug: 'b', eligibleViews: 999, eligibility: 'disqualified' },
    { ...base, id: 'c', slug: 'c', eligibleViews: 120, eligibility: 'eligible' },
  ]);
  assert.deepEqual(
    ranked.map((r) => [r.id, r.rank]),
    [
      ['c', 1],
      ['a', 2],
    ]
  );
});

test('countdown and share URLs include permanent /contest and /community/:slug links', () => {
  const cd = computeCountdownParts('2026-11-30T23:59:59+05:30', Date.parse('2026-11-29T23:59:59+05:30'));
  assert.equal(cd.expired, false);
  assert.equal(cd.days, 1);

  assert.ok(buildContestPageShareText('ನವೆಂಬರ್ 2026').includes(CONTEST_PUBLIC_URL));
  assert.ok(
    buildContestArticleShareText({
      title: 'ಕೊಪ್ಪ ಸುದ್ದಿ',
      slug: 'koppa-news-123',
      location: 'ಕೊಪ್ಪ',
      contributorName: 'ಕಿರಣ್',
    }).includes('https://coffeenadu.in/community/koppa-news-123')
  );
});

test('createInitialContestMonthRecord extends through December 31 when launched in late November', () => {
  const launchNow = new Date('2026-11-28T03:00:00Z');
  const initial = createInitialContestMonthRecord(launchNow);
  assert.equal(initial.monthKey, '2026-12');
  assert.equal(initial.endsAtIso, '2026-12-31T23:59:59+05:30');
  assert.equal(isContestMonthOpen(initial, launchNow.getTime()), true);
  const cd = computeCountdownParts(initial.endsAtIso, launchNow.getTime());
  assert.equal(cd.expired, false);
  assert.ok(cd.days >= 30);
});

test('editable contest content versioning and restoreContestContentFromHistory work cleanly', () => {
  const v1 = createDefaultContestEditableContent();
  assert.equal(v1.version, 1);

  const v2 = sanitizeContestEditableContent(
    {
      mainHeadingKn: 'ಕಾಫಿನಾಡು ವಿಶೇಷ ಸುದ್ದಿ ಸ್ಪರ್ಧೆ 2026',
      showAnnouncementBanner: false,
      announcementBannerKn: 'ವಿಶೇಷ ಪ್ರಕಟಣೆ: ಈ ತಿಂಗಳ ಬಹುಮಾನ ₹500',
    },
    v1,
    'shwethashwethak85@gmail.com',
    true
  );
  assert.equal(v2.version, 2);
  assert.equal(v2.mainHeadingKn, 'ಕಾಫಿನಾಡು ವಿಶೇಷ ಸುದ್ದಿ ಸ್ಪರ್ಧೆ 2026');
  assert.equal(v2.showAnnouncementBanner, false);
  assert.equal(v2.previousVersions?.length, 1);
  assert.equal(v2.previousVersions?.[0].version, 1);

  const restored = restoreContestContentFromHistory(v2, 1, 'shwethashwethak85@gmail.com');
  assert.ok(restored);
  assert.equal(restored.version, 3);
  assert.equal(restored.mainHeadingKn, v1.mainHeadingKn);
  assert.equal(restored.showAnnouncementBanner, true);
});

test('computeCompetitionDisplayScore prevents negative display scores while preserving genuine views', () => {
  assert.equal(computeCompetitionDisplayScore(25, 50), 75);
  assert.equal(computeCompetitionDisplayScore(25, -10), 15);
  assert.equal(computeCompetitionDisplayScore(25, -100), 0);
});

test('compute30DayPeriodBounds creates exact 30-day IST window and isContestAcceptingEntries enforces participationEnabled', () => {
  const bounds = compute30DayPeriodBounds('2026-12-01T10:00:00+05:30', 30);
  assert.equal(bounds.durationDays, 30);
  assert.equal(bounds.startsAtIso, '2026-12-01T00:00:00+05:30');
  assert.equal(bounds.endsAtIso, '2026-12-30T23:59:59+05:30');

  const month = {
    status: 'open' as const,
    startsAtIso: bounds.startsAtIso,
    endsAtIso: bounds.endsAtIso,
    participationEnabled: true,
  };
  const midMs = Date.parse('2026-12-15T12:00:00+05:30');
  assert.equal(isContestAcceptingEntries(month, midMs), true);
  assert.equal(isContestAcceptingEntries({ ...month, participationEnabled: false }, midMs), false);
});

test('buildUserViewsLeaderboard sums verified views across unlimited articles per user, breaks ties deterministically, includes 0-view users, excludes disqualified/hidden/suspended/excluded, and strips PII', () => {
  const mkEntry = (
    overrides: Partial<ContestEntryRecord> & {
      id: string;
      contributorUserId: string;
      contributorName: string;
      eligibleViews: number;
    }
  ): ContestEntryRecord => ({
    postId: `post-${overrides.id}`,
    slug: `slug-${overrides.id}`,
    competitionMonth: '2026-12',
    title: `Article ${overrides.id}`,
    summary: 'Summary',
    location: 'ಕೊಪ್ಪ',
    publishedAt: '2026-12-02T10:00:00+05:30',
    eligibility: 'eligible',
    totalPageViews: overrides.eligibleViews,
    genuineEligibleViews: overrides.eligibleViews,
    manualScoreAdjustment: 0,
    competitionDisplayScore: overrides.eligibleViews,
    suspiciousBlockedViews: 0,
    suspiciousFlagged: false,
    createdAt: '2026-12-02T10:00:00+05:30',
    updatedAt: '2026-12-02T10:00:00+05:30',
    ...overrides,
  });

  const entries: ContestEntryRecord[] = [
    // User A: 4 eligible articles = 300 + 700 + 400 + 600 = 2000 views
    mkEntry({ id: 'a1', contributorUserId: 'usr-A', contributorName: 'User A', eligibleViews: 300 }),
    mkEntry({ id: 'a2', contributorUserId: 'usr-A', contributorName: 'User A', eligibleViews: 700 }),
    mkEntry({ id: 'a3', contributorUserId: 'usr-A', contributorName: 'User A', eligibleViews: 400 }),
    mkEntry({ id: 'a4', contributorUserId: 'usr-A', contributorName: 'User A', eligibleViews: 600 }),
    // User A also has a disqualified article (5000 views) and a hidden post (4000 views) — MUST be excluded
    mkEntry({
      id: 'a5-disq',
      contributorUserId: 'usr-A',
      contributorName: 'User A',
      eligibleViews: 5000,
      eligibility: 'disqualified',
    }),
    mkEntry({
      id: 'a6-hidden',
      contributorUserId: 'usr-A',
      contributorName: 'User A',
      eligibleViews: 4000,
    }),
    // User B: 2 eligible articles = 1100 + 500 = 1600 views (lower combined total than User A despite 1100 single article!)
    mkEntry({
      id: 'b1',
      contributorUserId: 'usr-B',
      contributorName: 'User B',
      eligibleViews: 1100,
      lastEligibleViewAt: '2026-12-05T10:00:00+05:30',
    }),
    mkEntry({
      id: 'b2',
      contributorUserId: 'usr-B',
      contributorName: 'User B',
      eligibleViews: 500,
      lastEligibleViewAt: '2026-12-06T10:00:00+05:30',
    }),
    // User C: tied with User B at 1600 views, but achieved EARLIER (Dec 4 vs Dec 6) -> ranks above User B!
    mkEntry({
      id: 'c1',
      contributorUserId: 'usr-C',
      contributorName: 'User C',
      eligibleViews: 1600,
      lastEligibleViewAt: '2026-12-04T09:00:00+05:30',
    }),
    // User D: 0 views eligible participant -> MUST still appear without duplicates
    mkEntry({
      id: 'd1',
      contributorUserId: 'usr-D',
      contributorName: 'User D',
      eligibleViews: 0,
    }),
    // User E: suspended user -> MUST be excluded
    mkEntry({
      id: 'e1',
      contributorUserId: 'usr-E',
      contributorName: 'Suspended E',
      eligibleViews: 9999,
    }),
    // User F: admin-excluded user -> MUST be excluded
    mkEntry({
      id: 'f1',
      contributorUserId: 'usr-F',
      contributorName: 'Excluded F',
      eligibleViews: 8888,
    }),
  ];

  const testMonth: ContestMonthRecord = {
    ...createInitialContestMonthRecord(new Date('2026-12-01T10:00:00+05:30')),
    monthKey: '2026-12',
    periodId: '2026-12',
    status: 'open',
    excludedUserIds: ['usr-F'],
    excludedUserReasons: { 'usr-F': 'Policy violation' },
  };
  const userDirectory = new Map<string, { fullName: string; status: 'active' | 'suspended' }>([
    ['usr-A', { fullName: 'User A', status: 'active' }],
    ['usr-B', { fullName: 'User B', status: 'active' }],
    ['usr-C', { fullName: 'User C', status: 'active' }],
    ['usr-D', { fullName: 'User D', status: 'active' }],
    ['usr-E', { fullName: 'Suspended E', status: 'suspended' }],
    ['usr-F', { fullName: 'Excluded F', status: 'active' }],
  ]);

  const leaderboard = buildUserViewsLeaderboard({
    month: testMonth,
    entries,
    userDirectory,
    isPostPublished: (postId) => postId !== 'post-a6-hidden',
  });

  assert.deepEqual(
    leaderboard.map((row) => [row.rank, row.displayName, row.totalVerifiedViews, row.eligibleArticleCount]),
    [
      [1, 'User A', 2000, 4],
      [2, 'User C', 1600, 1],
      [3, 'User B', 1600, 2],
      [4, 'User D', 0, 1],
    ]
  );

  // Verify individual article views were NEVER overwritten by user totals
  assert.equal(entries[0].eligibleViews, 300);
  assert.equal(entries[1].eligibleViews, 700);

  // Strict privacy check: no raw userId or mobile numbers in serialized public leaderboard
  const serialized = JSON.stringify(leaderboard);
  assert.equal(serialized.includes('usr-A'), false);
  assert.equal(serialized.includes('usr-B'), false);
  assert.equal(serialized.includes('mobile'), false);

  // Admin participant directory preserves full audit details including excluded/suspended
  const entriesWithMobile = entries.map((e) => ({
    ...e,
    contributorMobileNumber: '9845010000',
    postStatus: e.postId === 'post-a6-hidden' ? 'hidden' : 'published',
    openAlertsCount: 0,
    genuineEligibleViews: e.eligibleViews,
    genuine_eligible_views: e.eligibleViews,
    manualScoreAdjustment: 0,
    manual_score_adjustment: 0,
    competitionDisplayScore: e.eligibleViews,
    competition_display_score: e.eligibleViews,
  }));
  const adminParticipants = buildAdminContestParticipants({
    month: testMonth,
    entriesWithMobile,
    allUsers: [
      { id: 'usr-A', fullName: 'User A', mobileNumber: '9845010001', status: 'active' },
      { id: 'usr-E', fullName: 'Suspended E', mobileNumber: '9845010005', status: 'suspended' },
      { id: 'usr-F', fullName: 'Excluded F', mobileNumber: '9845010006', status: 'active' },
    ],
    userLeaderboard: leaderboard,
  });
  const userAAdmin = adminParticipants.find((p) => p.userId === 'usr-A');
  assert.ok(userAAdmin);
  assert.equal(userAAdmin.rank, 1);
  assert.equal(userAAdmin.totalVerifiedViews, 2000);
  assert.equal(userAAdmin.eligibleArticleCount, 4);
  assert.equal(userAAdmin.totalArticleCount, 6);
  const userFAdmin = adminParticipants.find((p) => p.userId === 'usr-F');
  assert.equal(userFAdmin?.leaderboardEligible, false);
  assert.equal(userFAdmin?.rank, null);
  assert.equal(userFAdmin?.exclusionReason, 'Policy violation');
});



