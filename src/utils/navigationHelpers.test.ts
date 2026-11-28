import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAppLocationTarget,
  parseContestHashSection,
} from './navigationHelpers.ts';

test('parseAppLocationTarget strips ?query and #hash cleanly from pathname', () => {
  const contestLeaderboard = parseAppLocationTarget('/contest#leaderboard');
  assert.equal(contestLeaderboard.pathname, '/contest');
  assert.equal(contestLeaderboard.search, '');
  assert.equal(contestLeaderboard.hash, 'leaderboard');
  assert.equal(contestLeaderboard.fullPath, '/contest#leaderboard');

  const contestRulesSlash = parseAppLocationTarget('/contest/#rules');
  assert.equal(contestRulesSlash.pathname, '/contest');
  assert.equal(contestRulesSlash.hash, 'rules');

  const articleLink = parseAppLocationTarget('/?article=news-123');
  assert.equal(articleLink.pathname, '/');
  assert.equal(articleLink.search, '?article=news-123');
  assert.equal(articleLink.hash, '');
  assert.equal(articleLink.fullPath, '/?article=news-123');

  const communitySlug = parseAppLocationTarget('/community/koppa-road-update-abc1/');
  assert.equal(communitySlug.pathname, '/community/koppa-road-update-abc1');
  assert.equal(communitySlug.fullPath, '/community/koppa-road-update-abc1');
});

test('parseContestHashSection validates supported contest anchors safely', () => {
  assert.equal(parseContestHashSection('#leaderboard'), 'leaderboard');
  assert.equal(parseContestHashSection('rules'), 'rules');
  assert.equal(parseContestHashSection('#WINNERS'), 'winners');
  assert.equal(parseContestHashSection('#unknown'), null);
  assert.equal(parseContestHashSection(''), null);
});
