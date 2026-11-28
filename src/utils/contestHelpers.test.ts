import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTEST_PUBLIC_URL,
  ROLLING_VIEW_WINDOW_MS,
  buildContestArticleShareText,
  buildContestPageShareText,
  computeCountdownParts,
  createDefaultContestPrizes,
  createInitialContestMonthRecord,
  detectSuspiciousTrafficPattern,
  getIstMonthBounds,
  getIstMonthKey,
  getNextIstMonthKey,
  isContestMonthOpen,
  isEligibleRolling24hVisit,
  isLikelyBotUserAgent,
  rankEligibleContestEntries,
  toPublicContestEntry,
  toPublicContestWinner,
} from './contestHelpers.ts';
import type { ContestEntryRecord, ContestWinnerRecord } from '../types/contest.ts';

test('default contest prizes total exactly ₹500 with 4 view prizes and 1 quality prize', () => {
  const prizes = createDefaultContestPrizes();
  assert.equal(prizes.length, 5);
  assert.equal(
    prizes.reduce((acc, p) => acc + p.amountInr, 0),
    500
  );
  assert.deepEqual(
    prizes.map((p) => p.amountInr),
    [200, 100, 75, 75, 50]
  );
  assert.equal(prizes[4].type, 'quality');
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
    prizeAmountInr: 200,
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
  assert.equal(pubWinner.prizeAmountInr, 200);
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
