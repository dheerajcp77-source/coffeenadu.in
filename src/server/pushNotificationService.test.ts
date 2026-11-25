import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArticlePushPayload,
  buildDailyDigestPushPayload,
  createDefaultPushPreferences,
  dispatchToSubscribersWithPruning,
  matchesArticlePushPreferences,
  selectArticlesForDailyDigest,
  validatePushSubscriptionInput,
  type StoredPushSubscription,
} from './pushNotificationService';

function makeStoredSub(overrides: Partial<StoredPushSubscription> = {}): StoredPushSubscription {
  return {
    id: 'sub-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/sample-token-123',
    expirationTime: null,
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
    preferences: createDefaultPushPreferences(),
    digestTimeLocal: '08:00',
    timezone: 'Asia/Kolkata',
    deliveredArticleIds: [],
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
    ...overrides,
  };
}

test('validatePushSubscriptionInput accepts valid HTTPS Web Push subscription and blocks SSRF/HTTP targets', () => {
  const valid = validatePushSubscriptionInput({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  });
  assert.equal(valid.valid, true);

  const httpRejected = validatePushSubscriptionInput({
    endpoint: 'http://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  });
  assert.equal(httpRejected.valid, false);

  const localhostRejected = validatePushSubscriptionInput({
    endpoint: 'https://localhost:3000/push',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  });
  assert.equal(localhostRejected.valid, false);

  const privateIpRejected = validatePushSubscriptionInput({
    endpoint: 'https://192.168.1.25/push',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  });
  assert.equal(privateIpRejected.valid, false);
});

test('matchesArticlePushPreferences respects breaking, category, and all modes', () => {
  const agriOnly = {
    breakingNews: false,
    dailyDigest: false,
    localNews: false,
    agricultureUpdates: true,
    events: false,
  };
  assert.equal(matchesArticlePushPreferences(agriOnly, 'Agriculture', 'breaking'), true);
  assert.equal(matchesArticlePushPreferences(agriOnly, 'Local', 'breaking'), false);
  assert.equal(matchesArticlePushPreferences(agriOnly, 'Local', 'all'), true);

  const optedOutAll = {
    breakingNews: false,
    dailyDigest: false,
    localNews: false,
    agricultureUpdates: false,
    events: false,
  };
  assert.equal(matchesArticlePushPreferences(optedOutAll, 'Local', 'all'), false);
});

test('buildArticlePushPayload formats clean Kannada headline, official coffeenadu.in URL, and strips HTML', () => {
  const payload = JSON.parse(
    buildArticlePushPayload({
      articleId: 'koppa-rain-alert',
      title: '<b>ಕೊಪ್ಪದಲ್ಲಿ ಭಾರಿ ಮಳೆ ಎಚ್ಚರಿಕೆ</b>',
      summary: '<i>ಜಿಲ್ಲಾಡಳಿತದಿಂದ ಮುನ್ನೆಚ್ಚರಿಕೆ</i>',
      location: 'ಕೊಪ್ಪ (Koppa)',
      mode: 'breaking',
    })
  ) as Record<string, string>;

  assert.ok(payload.title.includes('ಕೊಪ್ಪದಲ್ಲಿ ಭಾರಿ ಮಳೆ ಎಚ್ಚರಿಕೆ'));
  assert.ok(!payload.title.includes('<b>'));
  assert.equal(payload.url, 'https://coffeenadu.in/?article=koppa-rain-alert');
  assert.equal(payload.image, 'https://coffeenadu.in/api/article-image/koppa-rain-alert');
});

test('selectArticlesForDailyDigest and buildDailyDigestPushPayload never fabricate headlines when empty or stale', () => {
  const now = Date.now();
  assert.equal(selectArticlesForDailyDigest([], now).length, 0);
  assert.equal(buildDailyDigestPushPayload([]), null);

  const staleOnly = [
    {
      id: 'old-news',
      titleKannada: 'ಹಳೆಯ ಸುದ್ದಿ',
      summaryKannada: 'ವಿವರ',
      category: 'Local',
      location: 'ಕೊಪ್ಪ',
      publishedTimestamp: now - 72 * 60 * 60 * 1000,
    },
  ];
  assert.equal(selectArticlesForDailyDigest(staleOnly, now, 36).length, 0);

  const recent = [
    {
      id: 'today-1',
      titleKannada: '<b>ಕೊಪ್ಪದಲ್ಲಿ ಕಾಫಿ ಬೆಲೆ ಏರಿಕೆ</b>',
      summaryKannada: 'ವಿವರ',
      category: 'Agriculture',
      location: 'ಕೊಪ್ಪ',
      publishedTimestamp: now - 2 * 60 * 60 * 1000,
    },
  ];
  const selected = selectArticlesForDailyDigest(recent, now, 36);
  assert.equal(selected.length, 1);

  const digestPayload = JSON.parse(buildDailyDigestPushPayload(selected)!) as Record<string, string>;
  assert.equal(digestPayload.title, 'Coffeenadu News – ಇಂದಿನ ಪ್ರಮುಖ ಸುದ್ದಿಗಳು');
  assert.ok(digestPayload.body.includes('ಕೊಪ್ಪದಲ್ಲಿ ಕಾಫಿ ಬೆಲೆ ಏರಿಕೆ'));
});

test('dispatchToSubscribersWithPruning skips duplicates, removes 404/410 endpoints, and preserves transient 500 endpoints', async () => {
  const alreadySent = makeStoredSub({
    id: 'already',
    endpoint: 'https://fcm.googleapis.com/fcm/send/already',
    deliveredArticleIds: ['art-99'],
  });
  const okSub = makeStoredSub({
    id: 'ok',
    endpoint: 'https://fcm.googleapis.com/fcm/send/ok',
  });
  const goneSub = makeStoredSub({
    id: 'gone',
    endpoint: 'https://fcm.googleapis.com/fcm/send/gone',
  });
  const transientErrSub = makeStoredSub({
    id: 'err',
    endpoint: 'https://fcm.googleapis.com/fcm/send/err',
  });

  const { updatedSubscribers, summary } = await dispatchToSubscribersWithPruning(
    [alreadySent, okSub, goneSub, transientErrSub],
    {
      payloadJson: '{"title":"Test"}',
      articleId: 'art-99',
      predicate: () => true,
      dispatcher: async (sub) => {
        if (sub.endpoint.endsWith('/ok')) return { ok: true };
        if (sub.endpoint.endsWith('/gone')) return { ok: false, statusCode: 410, gone: true };
        return { ok: false, statusCode: 500, gone: false, error: 'Upstream timeout' };
      },
    }
  );

  assert.equal(summary.skippedAlreadyDelivered, 1);
  assert.equal(summary.targeted, 3);
  assert.equal(summary.sent, 1);
  assert.equal(summary.pruned, 1);
  assert.equal(summary.failed, 1);
  assert.deepEqual(
    updatedSubscribers.map((s) => s.id),
    ['already', 'ok', 'err']
  );
  assert.ok(updatedSubscribers.find((s) => s.id === 'ok')?.deliveredArticleIds.includes('art-99'));
});
