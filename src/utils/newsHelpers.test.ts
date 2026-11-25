import test from 'node:test';
import assert from 'node:assert/strict';
import type { NewsArticle } from '../types/news';
import {
  getAdjacentArticles,
  getBreakingNewsArticles,
  getSameLocationArticles,
  getSmartRecommendations,
  getTrendingArticles,
  searchArticlesAdvanced,
  splitTextForHighlight,
} from './newsHelpers';
import { buildArticlePublicUrl, getDeepLinkShareOrigin, PUBLIC_SHARE_ORIGIN } from './slug';

function makeArticle(overrides: Partial<NewsArticle>): NewsArticle {
  return {
    id: 'art-1',
    titleKannada: 'ಕೊಪ್ಪದಲ್ಲಿ ಭಾರಿ ಮಳೆ',
    summaryKannada: 'ಕೊಪ್ಪ ತಾಲೂಕಿನಲ್ಲಿ ಮಳೆ ಚುರುಕು',
    bodyKannada: ['ಕೊಪ್ಪ ತಾಲೂಕಿನಾದ್ಯಂತ ಉತ್ತಮ ಮಳೆ ಸುರಿದಿದೆ.'],
    category: 'Local',
    location: 'ಕೊಪ್ಪ (Koppa)',
    publishedDate: '24 Nov 2026',
    publishedTime: '10:00 AM',
    publishedTimestamp: 1795500000000,
    readTimeMinutes: 2,
    reporter: 'Desk',
    viewCount: 0,
    ...overrides,
  };
}

test('getTrendingArticles ranks by real viewCount and flags view-ranked vs fallback', () => {
  const zeroViews = [
    makeArticle({ id: 'a1', publishedTimestamp: 100 }),
    makeArticle({ id: 'a2', publishedTimestamp: 200 }),
  ];
  const fallbackRes = getTrendingArticles(zeroViews, 2);
  assert.equal(fallbackRes.isViewRanked, false);
  assert.deepEqual(
    fallbackRes.items.map((x) => x.id),
    ['a2', 'a1']
  );

  const withViews = [
    makeArticle({ id: 'a1', viewCount: 15, publishedTimestamp: 100 }),
    makeArticle({ id: 'a2', viewCount: 42, publishedTimestamp: 50 }),
    makeArticle({ id: 'a3', viewCount: 42, publishedTimestamp: 90 }),
  ];
  const rankedRes = getTrendingArticles(withViews, 3);
  assert.equal(rankedRes.isViewRanked, true);
  assert.deepEqual(
    rankedRes.items.map((x) => x.id),
    ['a3', 'a2', 'a1']
  );
});

test('getBreakingNewsArticles prioritizes actively featured articles', () => {
  const now = 1_700_000_000_000;
  const list = [
    makeArticle({ id: 'regular', isFeatured: false, publishedTimestamp: now }),
    makeArticle({ id: 'featured-active', isFeatured: true, featuredUntil: now + 60_000 }),
    makeArticle({ id: 'featured-expired', isFeatured: true, featuredUntil: now - 10_000 }),
  ];
  const breaking = getBreakingNewsArticles(list, now, 5);
  assert.deepEqual(
    breaking.map((a) => a.id),
    ['featured-active']
  );
});

test('getSmartRecommendations excludes current article and prioritizes category + location + history', () => {
  const current = makeArticle({ id: 'curr', category: 'Agriculture', location: 'ಜಯಪುರ' });
  const a1 = makeArticle({ id: 'same-cat-loc', category: 'Agriculture', location: 'ಜಯಪುರ' });
  const a2 = makeArticle({ id: 'same-cat', category: 'Agriculture', location: 'ಶೃಂಗೇರಿ' });
  const a3 = makeArticle({ id: 'diff', category: 'Sports', location: 'ಚಿಕ್ಕಮಗಳೂರು' });

  const recs = getSmartRecommendations(current, [current, a3, a2, a1], [{ category: 'Agriculture', location: 'ಜಯಪುರ' }], 3);
  assert.equal(recs.length, 3);
  assert.equal(recs[0].id, 'same-cat-loc');
  assert.equal(recs[1].id, 'same-cat');
  assert.ok(!recs.some((r) => r.id === 'curr'));
});

test('getSameLocationArticles and getAdjacentArticles return accurate neighbors', () => {
  const a1 = makeArticle({ id: '1', location: 'ಕೊಪ್ಪ (Koppa)' });
  const a2 = makeArticle({ id: '2', location: 'ಜಯಪುರ (Jayapura)' });
  const a3 = makeArticle({ id: '3', location: 'ಕೊಪ್ಪ' });
  const ordered = [a1, a2, a3];

  const sameLoc = getSameLocationArticles(a1, ordered, 4);
  assert.deepEqual(
    sameLoc.map((a) => a.id),
    ['3']
  );

  const adj = getAdjacentArticles(a2, ordered);
  assert.equal(adj.previous?.id, '1');
  assert.equal(adj.next?.id, '3');
});

test('searchArticlesAdvanced filters Kannada, English, category, location, and timeframe accurately', () => {
  const now = new Date('2026-11-24T12:00:00Z').getTime();
  const todayArticle = makeArticle({
    id: 'today-coffee',
    titleKannada: 'ಕೊಪ್ಪದಲ್ಲಿ ಕಾಫಿ ಬೆಲೆ ಏರಿಕೆ',
    category: 'Agriculture',
    location: 'ಕೊಪ್ಪ (Koppa)',
    publishedTimestamp: now - 3600_000,
    publishedDate: '24 Nov 2026',
  });
  const oldSportsArticle = makeArticle({
    id: 'old-sports',
    titleKannada: 'ಶೃಂಗೇರಿ ಕ್ರಿಕೆಟ್ ಟೂರ್ನಿ',
    category: 'Sports',
    location: 'ಶೃಂಗೇರಿ (Sringeri)',
    publishedTimestamp: now - 15 * 24 * 3600_000,
    publishedDate: '09 Nov 2026',
  });

  const filtered = searchArticlesAdvanced(
    [todayArticle, oldSportsArticle],
    {
      query: 'ಕಾಫಿ',
      category: 'Agriculture',
      location: 'ಕೊಪ್ಪ (Koppa)',
      timeframe: 'Today',
    },
    now
  );
  assert.deepEqual(
    filtered.map((a) => a.id),
    ['today-coffee']
  );
});

test('splitTextForHighlight marks matching terms cleanly without HTML', () => {
  const segments = splitTextForHighlight('Koppa Taluk Coffee Market Update', 'coffee market');
  const matched = segments.filter((s) => s.match).map((s) => s.text.toLowerCase());
  assert.deepEqual(matched, ['coffee', 'market']);
});

test('buildArticlePublicUrl always uses official coffeenadu.in domain', () => {
  assert.equal(getDeepLinkShareOrigin(), PUBLIC_SHARE_ORIGIN);
  assert.equal(
    buildArticlePublicUrl('koppa-rain-2026'),
    'https://coffeenadu.in/?article=koppa-rain-2026'
  );
});
