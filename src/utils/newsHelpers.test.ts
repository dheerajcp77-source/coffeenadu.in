import test from 'node:test';
import assert from 'node:assert/strict';
import type { NewsArticle } from '../types/news';
import {
  buildKannadaArticleShareText,
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

test('buildKannadaArticleShareText bolds Kannada headline, omits description, and preserves location, official URL, and promo lines', () => {
  const article = makeArticle({
    id: 'koppa-coffee-price-2026',
    titleKannada: '<b>ಕೊಪ್ಪದಲ್ಲಿ ಕಾಫಿ ಧಾರಣೆ ಏರಿಕೆ</b>',
    summaryKannada: 'ಅರೇಬಿಕಾ ಹಾಗೂ ರೊಬಸ್ಟಾ ಕಾಫಿ ಬೆಲೆಯಲ್ಲಿ ಗಮನಾರ್ಹ ಹೆಚ್ಚಳ ಕಂಡುಬಂದಿದೆ.',
    location: 'ಕೊಪ್ಪ (Koppa)',
  });
  const url = buildArticlePublicUrl(article.id);
  const text = buildKannadaArticleShareText(article, url, article.location);

  assert.ok(text.includes('*ಕೊಪ್ಪದಲ್ಲಿ ಕಾಫಿ ಧಾರಣೆ ಏರಿಕೆ*'));
  assert.ok(!text.includes('ಅರೇಬಿಕಾ ಹಾಗೂ ರೊಬಸ್ಟಾ ಕಾಫಿ ಬೆಲೆಯಲ್ಲಿ ಗಮನಾರ್ಹ ಹೆಚ್ಚಳ ಕಂಡುಬಂದಿದೆ.'));
  assert.ok(text.includes('📍 ಕೊಪ್ಪ (Koppa) · Coffeenadu News'));
  assert.ok(text.includes('https://coffeenadu.in/?article=koppa-coffee-price-2026'));
  assert.ok(text.includes('www.coffeenadu.in'));
  assert.ok(!text.includes('<b>'));
  assert.ok(!text.includes('.run.app'));
});

test('dedupeInFlight shares a single concurrent promise for identical keys', async () => {
  const { dedupeInFlight } = await import('../services/firestoreOptimizer');
  let callCount = 0;
  const factory = async () => {
    callCount += 1;
    await new Promise((r) => setTimeout(r, 15));
    return { ok: true, count: callCount };
  };
  const [r1, r2, r3] = await Promise.all([
    dedupeInFlight('test:status', factory),
    dedupeInFlight('test:status', factory),
    dedupeInFlight('test:status', factory),
  ]);
  assert.equal(callCount, 1);
  assert.deepEqual(r1, { ok: true, count: 1 });
  assert.deepEqual(r2, { ok: true, count: 1 });
  assert.deepEqual(r3, { ok: true, count: 1 });
});

test('Cloudflare standalone API handler returns valid Admin2 and public contracts', async () => {
  const { handleApiDirectOnCloudflare, signCfToken } = await import('../../functions/_cfBackend');
  const env = {
    ADMIN2_SESSION_SECRET: 'test-secret-key-for-cf-unit-tests',
  };

  // 1. Public article feedback GET & POST contract
  const fbGetRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/public/article-feedback/art-101', { method: 'GET' }),
    env,
  });
  assert.equal(fbGetRes.status, 200);
  const fbGetJson = (await fbGetRes.json()) as {
    ok: boolean;
    articleId: string;
    counts: { helpful: number; informative: number; correction: number; lastUpdatedAt: string };
  };
  assert.equal(fbGetJson.ok, true);
  assert.equal(fbGetJson.articleId, 'art-101');
  assert.equal(typeof fbGetJson.counts.helpful, 'number');

  // 2. Public bus-agent conversational slot filling contract
  const busRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/bus-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'ಕೊಪ್ಪದಿಂದ ಬಸ್ ಬೇಕು' }),
    }),
    env,
  });
  assert.equal(busRes.status, 200);
  const busJson = (await busRes.json()) as {
    status: string;
    origin?: string;
    matchedRoutes: unknown[];
  };
  assert.equal(busJson.status, 'needs_destination');
  assert.equal(busJson.origin, 'Koppa');
  assert.ok(Array.isArray(busJson.matchedRoutes));

  // 3. Mint signed cn2cf.* admin token and test Admin2 settings, notifications, admins, ads, analytics, security
  const token = await signCfToken(
    {
      id: 'owner-shwethashwethak85',
      email: 'shwethashwethak85@gmail.com',
      fullName: 'Shwetha K',
      role: 'super_admin',
      permissions: ['settings.manage', 'admins.manage', 'ads.manage', 'analytics.view', 'security.view'],
      protectedSuperAdmin: true,
      authProvider: 'firebase',
      sid: 'cf-test-session',
      exp: Date.now() + 3600_000,
    },
    env
  );

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  const settingsRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/admin2/settings', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ siteName: 'CoffeeNadu News' }),
    }),
    env,
  });
  assert.equal(settingsRes.status, 200);
  const settingsJson = (await settingsRes.json()) as {
    ok: boolean;
    settings: {
      siteName: string;
      canonicalBaseUrl: string;
      watermarkLogoEnabled: boolean;
    };
  };
  assert.equal(settingsJson.ok, true);
  assert.equal(settingsJson.settings.siteName, 'CoffeeNadu News');
  assert.equal(settingsJson.settings.canonicalBaseUrl, 'https://coffeenadu.in');
  assert.equal(typeof settingsJson.settings.watermarkLogoEnabled, 'boolean');

  const notifRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/admin2/notifications', {
      method: 'GET',
      headers: authHeaders,
    }),
    env,
  });
  assert.equal(notifRes.status, 200);
  const notifJson = (await notifRes.json()) as {
    ok: boolean;
    preferences: { publishingSuccess: boolean; storageWarnings: boolean };
  };
  assert.equal(notifJson.ok, true);
  assert.equal(typeof notifJson.preferences.publishingSuccess, 'boolean');
  assert.equal(typeof notifJson.preferences.storageWarnings, 'boolean');

  const adminsRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/admin2/admins', {
      method: 'GET',
      headers: authHeaders,
    }),
    env,
  });
  assert.equal(adminsRes.status, 200);
  const adminsJson = (await adminsRes.json()) as {
    ok: boolean;
    accounts: Array<{ hasPassword: boolean; activeSessionCount: number }>;
  };
  assert.equal(adminsJson.ok, true);
  assert.equal(typeof adminsJson.accounts[0].hasPassword, 'boolean');
  assert.equal(typeof adminsJson.accounts[0].activeSessionCount, 'number');

  const adsAnalyticsRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/admin2/ads/analytics', {
      method: 'GET',
      headers: authHeaders,
    }),
    env,
  });
  assert.equal(adsAnalyticsRes.status, 200);
  const adsAnalyticsJson = (await adsAnalyticsRes.json()) as {
    ok: boolean;
    totals: { ctrPct: number };
    series: unknown[];
    perAd: unknown[];
  };
  assert.equal(adsAnalyticsJson.ok, true);
  assert.equal(typeof adsAnalyticsJson.totals.ctrPct, 'number');
  assert.ok(Array.isArray(adsAnalyticsJson.series));
  assert.ok(Array.isArray(adsAnalyticsJson.perAd));

  // 4. Standalone Local Ads CRUD & Settings on Cloudflare
  const createAdRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/admin2/ads', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Malnad Coffee Estate Tools',
        advertiserName: 'Koppa Agro Traders',
        category: 'Agriculture / Coffee Estate',
        status: 'active',
      }),
    }),
    env,
  });
  assert.equal(createAdRes.status, 200);
  const createAdJson = (await createAdRes.json()) as {
    ok: boolean;
    ad: { id: string; adNumber: string; title: string; effectiveStatus: string };
  };
  assert.equal(createAdJson.ok, true);
  assert.equal(createAdJson.ad.adNumber, 'AD001');
  assert.equal(createAdJson.ad.effectiveStatus, 'active');

  const listAdsRes = await handleApiDirectOnCloudflare({
    request: new Request('https://coffeenadu.in/api/admin2/ads', {
      method: 'GET',
      headers: authHeaders,
    }),
    env,
  });
  assert.equal(listAdsRes.status, 200);
  const listAdsJson = (await listAdsRes.json()) as {
    ok: boolean;
    ads: unknown[];
    stats: { total: number; active: number };
    settings: { globalPlacementsEnabled: Record<string, boolean>; customCategories: string[] };
  };
  assert.equal(listAdsJson.ok, true);
  assert.equal(listAdsJson.stats.total, 1);
  assert.equal(listAdsJson.stats.active, 1);
  assert.equal(typeof listAdsJson.settings.globalPlacementsEnabled.homepageSection, 'boolean');
  assert.ok(Array.isArray(listAdsJson.settings.customCategories));
});


