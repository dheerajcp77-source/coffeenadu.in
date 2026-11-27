import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAdminViewCount,
  resolveAdViewCount,
  resolveArticleViewCount,
  sumViewCounts,
  toSafeNonNegativeInt,
} from './viewCounts.ts';

test('toSafeNonNegativeInt handles invalid, negative, and decimal inputs safely', () => {
  assert.equal(toSafeNonNegativeInt(undefined), 0);
  assert.equal(toSafeNonNegativeInt(null), 0);
  assert.equal(toSafeNonNegativeInt(-42), 0);
  assert.equal(toSafeNonNegativeInt(Number.NaN), 0);
  assert.equal(toSafeNonNegativeInt('128.9'), 128);
});

test('resolveArticleViewCount preserves historical stored count when live ledger is empty or lower', () => {
  assert.equal(resolveArticleViewCount(1450, {}, 'old-story-1'), 1450);
  assert.equal(resolveArticleViewCount(1450, { 'old-story-1': 12 }, 'old-story-1'), 1450);
  assert.equal(resolveArticleViewCount(1450, undefined, 'old-story-1'), 1450);
});

test('resolveArticleViewCount picks higher live server count when views grow', () => {
  assert.equal(resolveArticleViewCount(1450, { 'old-story-1': 1525 }, 'old-story-1'), 1525);
  assert.equal(resolveArticleViewCount(0, { 'fresh-story': 88 }, 'fresh-story'), 88);
});

test('resolveAdViewCount preserves both legacy ad.views and tracked impressions', () => {
  assert.equal(resolveAdViewCount(920, 0), 920);
  assert.equal(resolveAdViewCount(0, 415), 415);
  assert.equal(resolveAdViewCount(920, 1280), 1280);
  assert.equal(resolveAdViewCount(undefined, undefined), 0);
});

test('sumViewCounts totals heterogeneous numeric inputs accurately', () => {
  assert.equal(sumViewCounts([100, 250, undefined, null, -5, '45']), 395);
});

test('formatAdminViewCount formats numbers cleanly using Indian locale grouping', () => {
  assert.equal(formatAdminViewCount(125400), '1,25,400');
  assert.equal(formatAdminViewCount(0), '0');
});
