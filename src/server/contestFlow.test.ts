import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { CommunityBackend } from './communityBackend';
import { ContestBackend } from './contestBackend';
import {
  mergeCommunityAndContestStates,
  normalizeCloudSnapshotState,
} from './appsScriptCommunitySync';

function createTestServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-contest-test-'));
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const fakeAdminAuth = () => {
    return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as express.Request & { admin2User?: { email: string } }).admin2User = {
        email: 'moderator@coffeenadu.in',
      };
      next();
    };
  };

  const community = new CommunityBackend(tmpDir, fakeAdminAuth);
  const contest = new ContestBackend(tmpDir, community, fakeAdminAuth);
  community.mountRoutes(app);
  contest.mountRoutes(app);

  return { app, tmpDir };
}

test('contest submit and admin disqualify/reinstate flow works end-to-end with audit logs', async () => {
  const { app, tmpDir } = createTestServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Submit a contest news entry cleanly (text-only)
    const submitResp = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributorName: 'Ramesh Koppa',
        mobileNumber: '9876543210',
        title: 'Jayapura Rural Water Tank Renovation Completed',
        description:
          'Local residents and panchayat members in Jayapura completed the community drinking water tank cleaning and pipeline repair today.',
        location: 'ಜಯಪುರ',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(submitResp.status, 201);
    const submitJson = (await submitResp.json()) as {
      ok: boolean;
      entry: { id: string; postId: string; eligibility?: string };
      permanentPath: string;
    };
    assert.equal(submitJson.ok, true);
    assert.ok(submitJson.entry.id);
    assert.ok(submitJson.permanentPath.startsWith('/community/'));

    // 2. Short disqualification reason fails with clean JSON 400
    const badReasonResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(submitJson.entry.id)}/eligibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eligibility: 'disqualified', reason: 'no' }),
      }
    );
    assert.equal(badReasonResp.status, 400);
    const badReasonJson = (await badReasonResp.json()) as { ok: boolean; error: string };
    assert.equal(badReasonJson.ok, false);
    assert.ok(badReasonJson.error.length > 5);

    // 3. Disqualify duplicate news by postId (or entryId) with hidePost=true
    const disqResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(submitJson.entry.postId)}/eligibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eligibility: 'disqualified',
          reason: 'Duplicate news submission',
          hidePost: true,
        }),
      }
    );
    assert.equal(disqResp.status, 200);
    const disqJson = (await disqResp.json()) as {
      ok: boolean;
      entry: { eligibility: string; disqualificationReason: string; disqualifiedBy: string };
    };
    assert.equal(disqJson.ok, true);
    assert.equal(disqJson.entry.eligibility, 'disqualified');
    assert.equal(disqJson.entry.disqualificationReason, 'Duplicate news submission');
    assert.equal(disqJson.entry.disqualifiedBy, 'moderator@coffeenadu.in');

    // Confirm public leaderboard excludes disqualified entry & audit log recorded actorEmail
    const publicResp = await fetch(`${baseUrl}/api/public/contest/overview`);
    const publicJson = (await publicResp.json()) as {
      ok: boolean;
      allEligibleEntries: Array<{ id: string }>;
    };
    assert.equal(
      publicJson.allEligibleEntries.some((e) => e.id === submitJson.entry.id),
      false
    );

    const adminResp = await fetch(`${baseUrl}/api/admin2/contest/overview`);
    const adminJson = (await adminResp.json()) as {
      ok: boolean;
      auditLogs: Array<{ action: string; actorEmail: string }>;
    };
    assert.equal(adminJson.auditLogs[0].action, 'entry.disqualify');
    assert.equal(adminJson.auditLogs[0].actorEmail, 'moderator@coffeenadu.in');

    // 4. Reinstate restores eligibility and published post status
    const reinResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(submitJson.entry.id)}/eligibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eligibility: 'eligible' }),
      }
    );
    assert.equal(reinResp.status, 200);
    const publicAfterReinstate = await fetch(`${baseUrl}/api/public/contest/overview`);
    const publicAfterJson = (await publicAfterReinstate.json()) as {
      allEligibleEntries: Array<{ id: string }>;
    };
    assert.equal(
      publicAfterJson.allEligibleEntries.some((e) => e.id === submitJson.entry.id),
      true
    );

    // 5. Missing entry returns structured 404 JSON
    const missingResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/nonexistent-entry-id/eligibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eligibility: 'disqualified', reason: 'Duplicate news' }),
      }
    );
    assert.equal(missingResp.status, 404);
    const missingJson = (await missingResp.json()) as { ok: boolean; error: string };
    assert.equal(missingJson.ok, false);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3-state separation: disqualifying with hidePost=false removes from contest leaderboard while keeping article published in Community Feed', async () => {
  const { app, tmpDir } = createTestServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const submitResp = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributorName: 'Kiran Sringeri',
        mobileNumber: '9123456789',
        title: 'Sringeri Temple Road Streetlight Maintenance Completed',
        description:
          'New LED streetlights have been installed along the Sringeri main road near the bus stand for pedestrian safety.',
        location: 'ಶೃಂಗೇರಿ',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(submitResp.status, 201);
    const submitJson = (await submitResp.json()) as {
      ok: boolean;
      entry: { id: string; postId: string; slug: string };
    };

    // Disqualify with hidePost: false (default behavior: Published but contest disqualified)
    const disqResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(submitJson.entry.id)}/eligibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eligibility: 'disqualified',
          reason: 'Not eligible for monthly contest prize category',
          hidePost: false,
        }),
      }
    );
    assert.equal(disqResp.status, 200);

    // 1. Removed from public contest leaderboard immediately
    const contestResp = await fetch(`${baseUrl}/api/public/contest/overview`);
    const contestJson = (await contestResp.json()) as {
      allEligibleEntries: Array<{ id: string }>;
    };
    assert.equal(
      contestJson.allEligibleEntries.some((e) => e.id === submitJson.entry.id),
      false
    );

    // 2. Still visible in public Community Feed!
    const feedResp = await fetch(`${baseUrl}/api/community/posts`);
    const feedJson = (await feedResp.json()) as {
      posts: Array<{ id: string; slug: string }>;
    };
    assert.equal(
      feedJson.posts.some((p) => p.id === submitJson.entry.postId),
      true
    );

    // 3. Disqualifying with hidePost: true (or unpublishing) removes from Community Feed too
    const hideResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(submitJson.entry.id)}/eligibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eligibility: 'disqualified',
          reason: 'Duplicate news submission',
          hidePost: true,
        }),
      }
    );
    assert.equal(hideResp.status, 200);

    const feedAfterHideResp = await fetch(`${baseUrl}/api/community/posts`);
    const feedAfterHideJson = (await feedAfterHideResp.json()) as {
      posts: Array<{ id: string }>;
    };
    assert.equal(
      feedAfterHideJson.posts.some((p) => p.id === submitJson.entry.postId),
      false
    );
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('article view counting enforces 24h rolling deduplication, admin preview exclusion, bot filtering, and avoids GET double-increment', async () => {
  const { app, tmpDir } = createTestServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const submitResp = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributorName: 'Harish Balehonnur',
        mobileNumber: '9988776655',
        title: 'Balehonnur Bridge Approach Road Drainage Work Starts',
        description:
          'Drainage repair work along the Balehonnur bridge approach road began this morning to prevent monsoon waterlogging.',
        location: 'ಬಾಳೆಹೊನ್ನೂರು',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(submitResp.status, 201);
    const { entry } = (await submitResp.json()) as {
      entry: { id: string; postId: string; slug: string };
    };

    // 1. Opening the community post detail page via GET does NOT double-increment contest post viewsCount
    const getDetail1 = await fetch(`${baseUrl}/api/community/posts/${encodeURIComponent(entry.slug)}`);
    assert.equal(getDetail1.status, 200);
    const detailJson1 = (await getDetail1.json()) as { post: { viewsCount: number } };
    assert.equal(detailJson1.post.viewsCount, 0);

    // 2. First genuine visitor view increments both eligibleViews (1) and totalPageViews (1)
    const view1Resp = await fetch(
      `${baseUrl}/api/public/contest/entries/${encodeURIComponent(entry.slug)}/view`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/125.0 Mobile Safari/537.36',
        },
        body: JSON.stringify({ visitorToken: 'visitor-device-alpha-12345' }),
      }
    );
    assert.equal(view1Resp.status, 200);
    const view1Json = (await view1Resp.json()) as {
      countedEligible: boolean;
      countedReason: string;
      eligibleViews: number;
      totalPageViews: number;
    };
    assert.equal(view1Json.countedEligible, true);
    assert.equal(view1Json.countedReason, 'counted');
    assert.equal(view1Json.eligibleViews, 1);
    assert.equal(view1Json.totalPageViews, 1);

    // 3. Repeated refresh by same visitor within 24h increments totalPageViews (2) but NOT eligibleViews (1)
    const view2Resp = await fetch(
      `${baseUrl}/api/public/contest/entries/${encodeURIComponent(entry.slug)}/view`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/125.0 Mobile Safari/537.36',
        },
        body: JSON.stringify({ visitorToken: 'visitor-device-alpha-12345' }),
      }
    );
    const view2Json = (await view2Resp.json()) as {
      countedEligible: boolean;
      countedReason: string;
      eligibleViews: number;
      totalPageViews: number;
    };
    assert.equal(view2Json.countedEligible, false);
    assert.equal(view2Json.countedReason, 'duplicate_24h');
    assert.equal(view2Json.eligibleViews, 1);
    assert.equal(view2Json.totalPageViews, 2);

    // 4. Admin preview (?preview=1) is excluded from both eligibleViews and totalPageViews
    const adminPreviewResp = await fetch(
      `${baseUrl}/api/public/contest/entries/${encodeURIComponent(entry.slug)}/view?preview=1`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        },
        body: JSON.stringify({ visitorToken: 'visitor-device-beta-67890', preview: true }),
      }
    );
    const adminPreviewJson = (await adminPreviewResp.json()) as {
      countedEligible: boolean;
      countedReason: string;
      eligibleViews: number;
      totalPageViews: number;
    };
    assert.equal(adminPreviewJson.countedEligible, false);
    assert.equal(adminPreviewJson.countedReason, 'admin_excluded');
    assert.equal(adminPreviewJson.eligibleViews, 1);
    assert.equal(adminPreviewJson.totalPageViews, 2);

    // 5. Known bot User-Agent is filtered
    const botResp = await fetch(
      `${baseUrl}/api/public/contest/entries/${encodeURIComponent(entry.slug)}/view`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
        body: JSON.stringify({ visitorToken: 'bot-visitor-token-999' }),
      }
    );
    const botJson = (await botResp.json()) as {
      countedEligible: boolean;
      countedReason: string;
      eligibleViews: number;
    };
    assert.equal(botJson.countedEligible, false);
    assert.equal(botJson.countedReason, 'bot_filtered');
    assert.equal(botJson.eligibleViews, 1);

    // 6. Community post viewsCount is synced with totalPageViews (2)
    const getDetailAfter = await fetch(
      `${baseUrl}/api/community/posts/${encodeURIComponent(entry.slug)}`
    );
    const detailAfterJson = (await getDetailAfter.json()) as { post: { viewsCount: number } };
    assert.equal(detailAfterJson.post.viewsCount, 2);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('reporting system saves community, contest, and editorial news reports, prevents duplicates, and supports admin resolution', async () => {
  const { app, tmpDir } = createTestServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Report an editorial news article from the Unified Feed / ArticleDetailView
    const rep1Resp = await fetch(
      `${baseUrl}/api/community/posts/editorial-news-article-101/report`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'ತಪ್ಪು ಅಥವಾ ದಾರಿತಪ್ಪಿಸುವ ಮಾಹಿತಿ (False / Misleading)',
          details: 'Location name in the second paragraph needs correction.',
          postTitle: 'Koppa Taluk Heavy Rainfall Update',
          targetType: 'news',
        }),
      }
    );
    assert.equal(rep1Resp.status, 201);
    const rep1Json = (await rep1Resp.json()) as {
      ok: boolean;
      id: string;
      duplicatePrevented: boolean;
    };
    assert.equal(rep1Json.ok, true);
    assert.equal(rep1Json.duplicatePrevented, false);
    assert.ok(rep1Json.id);

    // 2. Accidental duplicate report with same target + reason within 10 minutes is prevented
    const repDupResp = await fetch(
      `${baseUrl}/api/community/posts/editorial-news-article-101/report`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'ತಪ್ಪು ಅಥವಾ ದಾರಿತಪ್ಪಿಸುವ ಮಾಹಿತಿ (False / Misleading)',
          details: 'Duplicate click',
          postTitle: 'Koppa Taluk Heavy Rainfall Update',
          targetType: 'news',
        }),
      }
    );
    assert.equal(repDupResp.status, 200);
    const repDupJson = (await repDupResp.json()) as {
      ok: boolean;
      id: string;
      duplicatePrevented: boolean;
    };
    assert.equal(repDupJson.ok, true);
    assert.equal(repDupJson.duplicatePrevented, true);
    assert.equal(repDupJson.id, rep1Json.id);

    // 3. Admin fetches all reports and sees the report with reason, details, and targetType
    const adminReportsResp = await fetch(`${baseUrl}/api/admin2/community/reports`);
    assert.equal(adminReportsResp.status, 200);
    const adminReportsJson = (await adminReportsResp.json()) as {
      ok: boolean;
      reports: Array<{
        id: string;
        postId: string;
        postTitle: string;
        targetType?: string;
        reason: string;
        details?: string;
        status: string;
      }>;
    };
    assert.equal(adminReportsJson.ok, true);
    assert.equal(adminReportsJson.reports.length, 1);
    assert.equal(adminReportsJson.reports[0].postId, 'editorial-news-article-101');
    assert.equal(adminReportsJson.reports[0].targetType, 'news');
    assert.equal(
      adminReportsJson.reports[0].details,
      'Location name in the second paragraph needs correction.'
    );
    assert.equal(adminReportsJson.reports[0].status, 'open');

    // 4. Admin marks report as resolved and report history is preserved
    const resolveResp = await fetch(
      `${baseUrl}/api/admin2/community/reports/${encodeURIComponent(rep1Json.id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      }
    );
    assert.equal(resolveResp.status, 200);

    const adminReportsAfterResp = await fetch(`${baseUrl}/api/admin2/community/reports`);
    const adminReportsAfterJson = (await adminReportsAfterResp.json()) as {
      reports: Array<{ id: string; status: string; resolvedAt?: string }>;
    };
    assert.equal(adminReportsAfterJson.reports.length, 1);
    assert.equal(adminReportsAfterJson.reports[0].status, 'resolved');
    assert.ok(adminReportsAfterJson.reports[0].resolvedAt);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Super Admin Manual View Score Management and Editable Contest Content work end-to-end', async () => {
  const { app, tmpDir } = createTestServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Submit two contest entries (Sandeep & Santosh)
    const sub1 = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributorName: 'Sandeep Koppa',
        mobileNumber: '9845011111',
        title: 'Koppa Bus Stand Roof Repair Completed Ahead of Monsoon',
        description:
          'The Koppa town bus stand platform roof repair and commuter seating upgrade was completed today.',
        location: 'ಕೊಪ್ಪ',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(sub1.status, 201);
    const entry1 = ((await sub1.json()) as { entry: { id: string; slug: string } }).entry;

    const sub2 = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributorName: 'Santosh Sringeri',
        mobileNumber: '9845022222',
        switchContributor: true,
        title: 'Sringeri College Students Win District Science Exhibition',
        description:
          'Students from Sringeri won first place at the district level rural innovation and science exhibition.',
        location: 'ಶೃಂಗೇರಿ',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(sub2.status, 201);
    const entry2 = ((await sub2.json()) as { entry: { id: string; slug: string } }).entry;

    // 2. Give entry1 one genuine view so entry1 is initially #1
    await fetch(`${baseUrl}/api/public/contest/entries/${encodeURIComponent(entry1.slug)}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/125.0 Mobile Safari/537.36',
      },
      body: JSON.stringify({ visitorToken: 'genuine-reader-1' }),
    });

    // 3. Super Admin sets manual display score of entry2 to 150
    const scoreResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(entry2.id)}/score`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitionDisplayScore: 150 }),
      }
    );
    assert.equal(scoreResp.status, 200);
    const scoreJson = (await scoreResp.json()) as {
      ok: boolean;
      entry: {
        genuineEligibleViews: number;
        manualScoreAdjustment: number;
        competitionDisplayScore: number;
      };
    };
    assert.equal(scoreJson.ok, true);
    assert.equal(scoreJson.entry.genuineEligibleViews, 0);
    assert.equal(scoreJson.entry.manualScoreAdjustment, 150);
    assert.equal(scoreJson.entry.competitionDisplayScore, 150);

    // 4. Public leaderboard immediately ranks entry2 at #1 with 150 displayed views
    const pubOverview1 = await fetch(`${baseUrl}/api/public/contest/overview`);
    const pubJson1 = (await pubOverview1.json()) as {
      topFour: Array<{ id: string; rank: number; eligibleViews: number }>;
    };
    assert.equal(pubJson1.topFour[0].id, entry2.id);
    assert.equal(pubJson1.topFour[0].rank, 1);
    assert.equal(pubJson1.topFour[0].eligibleViews, 150);

    // 5. Restoring genuine-view ranking resets manual adjustments while preserving entry1's genuine view
    const adminOverview = await fetch(`${baseUrl}/api/admin2/contest/overview`);
    const adminJson = (await adminOverview.json()) as {
      selectedMonth: { monthKey: string };
    };
    const resetResp = await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(adminJson.selectedMonth.monthKey)}/reset-scores`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    assert.equal(resetResp.status, 200);

    const pubOverview2 = await fetch(`${baseUrl}/api/public/contest/overview`);
    const pubJson2 = (await pubOverview2.json()) as {
      topFour: Array<{ id: string; rank: number; eligibleViews: number }>;
    };
    assert.equal(pubJson2.topFour[0].id, entry1.id);
    assert.equal(pubJson2.topFour[0].eligibleViews, 1);

    // 6. Editable Contest Content save & version restore
    const updateContentResp = await fetch(`${baseUrl}/api/admin2/contest/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mainHeadingKn: 'ಕಾಫಿನಾಡು ಮಲೆನಾಡು ಸುದ್ದಿ ಸ್ಪರ್ಧೆ – ವಿಶೇಷ ಆವೃತ್ತಿ',
        showAnnouncementBanner: false,
        announcementBannerKn: 'ಈ ತಿಂಗಳ ವಿಶೇಷ ಪ್ರಕಟಣೆ!',
      }),
    });
    assert.equal(updateContentResp.status, 200);

    const pubOverview3 = await fetch(`${baseUrl}/api/public/contest/overview`);
    const pubJson3 = (await pubOverview3.json()) as {
      contentConfig: {
        version: number;
        mainHeadingKn: string;
        showAnnouncementBanner: boolean;
        announcementBannerKn: string;
      };
    };
    assert.equal(pubJson3.contentConfig.version, 2);
    assert.equal(
      pubJson3.contentConfig.mainHeadingKn,
      'ಕಾಫಿನಾಡು ಮಲೆನಾಡು ಸುದ್ದಿ ಸ್ಪರ್ಧೆ – ವಿಶೇಷ ಆವೃತ್ತಿ'
    );
    assert.equal(pubJson3.contentConfig.showAnnouncementBanner, false);

    const restoreContentResp = await fetch(`${baseUrl}/api/admin2/contest/content/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1 }),
    });
    assert.equal(restoreContentResp.status, 200);
    const restoredJson = (await restoreContentResp.json()) as {
      ok: boolean;
      contentConfig: { version: number; showAnnouncementBanner: boolean };
    };
    assert.equal(restoredJson.ok, true);
    assert.equal(restoredJson.contentConfig.version, 3);
    assert.equal(restoredJson.contentConfig.showAnnouncementBanner, true);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('₹1,500 4-prize structure preserves 4th Prize admin quality selection, blocks disqualified winners, and opens next month with 4 prizes', async () => {
  const { app, tmpDir } = createTestServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Public overview exposes exact 4 prizes totaling ₹1,500
    const overviewResp = await fetch(`${baseUrl}/api/public/contest/overview`);
    assert.equal(overviewResp.status, 200);
    const overviewJson = (await overviewResp.json()) as {
      ok: boolean;
      activeMonth: {
        monthKey: string;
        prizes: Array<{ rank: number; type: string; amountInr: number }>;
      };
    };
    assert.equal(overviewJson.activeMonth.prizes.length, 4);
    assert.deepEqual(
      overviewJson.activeMonth.prizes.map((p) => [p.rank, p.type, p.amountInr]),
      [
        [1, 'views', 800],
        [2, 'views', 400],
        [3, 'views', 200],
        [4, 'quality', 100],
      ]
    );

    // 2. Submit two contest articles; disqualify the second one
    const subA = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributorName: 'Ananya Koppa',
        mobileNumber: '9845033333',
        title: 'Koppa Organic Coffee Growers Cooperative Wins National Export Award',
        description:
          'Smallholder coffee growers from Koppa taluk received a national quality certification for eco-friendly shade-grown robusta.',
        location: 'ಕೊಪ್ಪ',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(subA.status, 201);
    const entryA = ((await subA.json()) as { entry: { id: string } }).entry;

    const subB = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributorName: 'Mahesh Narve',
        mobileNumber: '9845044444',
        switchContributor: true,
        title: 'Copied Promotional Ad Post for Test Disqualification',
        description:
          'This entry is submitted solely to verify that disqualified entries cannot be selected for any monthly contest prize.',
        location: 'ನಾರ್ವೆ',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(subB.status, 201);
    const entryB = ((await subB.json()) as { entry: { id: string } }).entry;

    await fetch(`${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(entryB.id)}/eligibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eligibility: 'disqualified', reason: 'Promotional content' }),
    });

    const monthKey = overviewJson.activeMonth.monthKey;

    // 3. Selecting a disqualified article as 4th Prize quality winner is rejected (400)
    const disqWinnerResp = await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(monthKey)}/winners`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winners: [{ rank: 4, entryId: entryB.id, selectionNote: 'Should be rejected' }],
        }),
      }
    );
    assert.equal(disqWinnerResp.status, 400);

    // 4. Selecting eligible article as 4th Prize Best Quality Original News (₹100) succeeds & ignores rank 5
    const validWinnerResp = await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(monthKey)}/winners`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winners: [
            {
              rank: 4,
              entryId: entryA.id,
              selectionNote: 'Original field reporting with strong local impact',
              paymentStatus: 'processing',
            },
            {
              rank: 5,
              entryId: entryA.id,
              selectionNote: 'Removed 5th prize must be ignored on active months',
            },
          ],
        }),
      }
    );
    assert.equal(validWinnerResp.status, 200);
    const savedMonth = ((await validWinnerResp.json()) as {
      month: {
        winners: Array<{
          rank: number;
          prizeType: string;
          prizeAmountInr: number;
          paymentStatus: string;
          selectionNote?: string;
        }>;
      };
    }).month;
    assert.equal(savedMonth.winners.length, 1);
    assert.equal(savedMonth.winners[0].rank, 4);
    assert.equal(savedMonth.winners[0].prizeType, 'quality');
    assert.equal(savedMonth.winners[0].prizeAmountInr, 100);
    assert.equal(savedMonth.winners[0].paymentStatus, 'processing');

    // 5. Open next month creates fresh 4-prize ₹1,500 month with zero carry-over
    const openNextResp = await fetch(`${baseUrl}/api/admin2/contest/months/open-next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(openNextResp.status, 201);
    const nextMonth = ((await openNextResp.json()) as {
      month: { prizes: Array<{ amountInr: number }> };
    }).month;
    assert.equal(nextMonth.prizes.length, 4);
    assert.equal(
      nextMonth.prizes.reduce((s, p) => s + p.amountInr, 0),
      1500
    );
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Community publishing supports Text+Image, Text-Only, and Image-Only posts while blocking empty posts and isolating contest rules', async () => {
  const { app, tmpDir } = createTestServer();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const validPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  try {
    // 1. Register community user
    const regResp = await fetch(`${baseUrl}/api/community/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Prakash Koppa', mobileNumber: '9845055555' }),
    });
    assert.equal(regResp.status, 200);
    const { token } = (await regResp.json()) as { token: string };
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 2. Completely empty post (no text, no photo) must be rejected (400)
    const emptyResp = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: '',
        description: '',
        category: 'public-info',
        location: 'ಕೊಪ್ಪ',
        photos: [],
      }),
    });
    assert.equal(emptyResp.status, 400);

    // 3. Image-Only post (empty title + empty description + 1 valid PNG) succeeds (201)
    const imgOnlyResp = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: '',
        description: '',
        category: 'public-info',
        location: 'ಕೊಪ್ಪ',
        photos: [validPngDataUrl],
      }),
    });
    assert.equal(imgOnlyResp.status, 201);
    const imgOnlyJson = (await imgOnlyResp.json()) as {
      ok: boolean;
      post: { id: string; slug: string; title: string; description: string; photos: string[] };
    };
    assert.equal(imgOnlyJson.ok, true);
    assert.equal(imgOnlyJson.post.title, '');
    assert.equal(imgOnlyJson.post.description, '');
    assert.equal(imgOnlyJson.post.photos.length, 1);
    assert.ok(imgOnlyJson.post.slug.length > 5);

    // 4. Text-Only post succeeds (201)
    const textOnlyResp = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'ಕೊಪ್ಪ ಪಟ್ಟಣದಲ್ಲಿ ವಿದ್ಯುತ್ ವ್ಯತ್ಯಯ ಮಾಹಿತಿ',
        description: 'ನಾಳೆ ಬೆಳಿಗ್ಗೆ 10 ರಿಂದ ಮಧ್ಯಾಹ್ನ 2 ಗಂಟೆಯವರೆಗೆ ಮಾರ್ಗ ನಿರ್ವಹಣೆ ಕಾರಣ ವಿದ್ಯುತ್ ವ್ಯತ್ಯಯ.',
        category: 'public-info',
        location: 'ಕೊಪ್ಪ',
        photos: [],
      }),
    });
    assert.equal(textOnlyResp.status, 201);

    // 5. Text + Image post succeeds (201)
    const textImgResp = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'ಜಯಪುರದಲ್ಲಿ ಮಳೆ ನಂತರದ ದೃಶ್ಯ',
        description: 'ಜಯಪುರ ಸುತ್ತಮುತ್ತ ಸಂಜೆ ಉತ್ತಮ ಮಳೆಯಾಗಿದೆ.',
        category: 'events',
        location: 'ಜಯಪುರ',
        photos: [validPngDataUrl],
      }),
    });
    assert.equal(textImgResp.status, 201);

    // 6. Verify feed returns all 3 posts and Monthly Contest does NOT include image-only community posts
    const feedResp = await fetch(`${baseUrl}/api/community/posts`);
    const feedJson = (await feedResp.json()) as { posts: Array<{ id: string }> };
    assert.equal(feedJson.posts.length, 3);

    const contestResp = await fetch(`${baseUrl}/api/public/contest/overview`);
    const contestJson = (await contestResp.json()) as { allEligibleEntries: unknown[] };
    assert.equal(contestJson.allEligibleEntries.length, 0);

    // 7. Contest submit still rejects image-only entries with empty headline/description
    const imgContestResp = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        contributorName: 'Prakash Koppa',
        mobileNumber: '9845055555',
        title: '',
        description: '',
        location: 'ಕೊಪ್ಪ',
        photos: [validPngDataUrl],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(imgContestResp.status, 400);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('mergeCommunityAndContestStates merges Cloudflare/Apps Script posts and contest score adjustments cleanly with local Express state', () => {
  const local = normalizeCloudSnapshotState({
    posts: [
      {
        id: 'cpost-local-1',
        slug: 'local-post-1',
        authorUserId: 'cuser-1',
        authorName: 'Local User',
        title: 'Local News Item',
        category: 'public-info',
        description: 'Published in AI Studio preview',
        location: 'ಕೊಪ್ಪ',
        photos: [],
        status: 'published',
        createdAt: '2026-11-28T09:00:00Z',
        updatedAt: '2026-11-28T09:00:00Z',
        viewsCount: 5,
        sharesCount: 1,
      },
    ],
    entries: [
      {
        id: 'centry-shared-1',
        postId: 'cpost-cf-1',
        slug: 'cf-contest-post-1',
        competitionMonth: '2026-12',
        contributorUserId: 'cuser-cf',
        contributorName: 'CF Contributor',
        title: 'Cloudflare Contest Article',
        summary: 'Submitted live on coffeenadu.in',
        location: 'ಶೃಂಗೇರಿ',
        publishedAt: '2026-11-28T08:00:00Z',
        eligibility: 'eligible',
        totalPageViews: 10,
        eligibleViews: 8,
        genuineEligibleViews: 8,
        manualScoreAdjustment: 0,
        competitionDisplayScore: 8,
        suspiciousBlockedViews: 0,
        suspiciousFlagged: false,
        createdAt: '2026-11-28T08:00:00Z',
        updatedAt: '2026-11-28T08:05:00Z',
      },
    ],
  });

  const remote = normalizeCloudSnapshotState({
    posts: [
      {
        id: 'cpost-cf-1',
        slug: 'cf-contest-post-1',
        authorUserId: 'cuser-cf',
        authorName: 'CF Contributor',
        title: 'Cloudflare Contest Article',
        category: 'monthly-news-contest',
        description: 'Submitted live on coffeenadu.in with Drive photo',
        location: 'ಶೃಂಗೇರಿ',
        photos: ['/api/media/drive/abcDriveFileId123'],
        status: 'published',
        createdAt: '2026-11-28T08:00:00Z',
        updatedAt: '2026-11-28T08:00:00Z',
        viewsCount: 15,
        sharesCount: 3,
      },
    ],
    entries: [
      {
        id: 'centry-shared-1',
        postId: 'cpost-cf-1',
        slug: 'cf-contest-post-1',
        competitionMonth: '2026-12',
        contributorUserId: 'cuser-cf',
        contributorName: 'CF Contributor',
        title: 'Cloudflare Contest Article',
        summary: 'Submitted live on coffeenadu.in',
        location: 'ಶೃಂಗೇರಿ',
        publishedAt: '2026-11-28T08:00:00Z',
        eligibility: 'eligible',
        totalPageViews: 15,
        eligibleViews: 6,
        genuineEligibleViews: 6,
        manualScoreAdjustment: 25,
        competitionDisplayScore: 31,
        suspiciousBlockedViews: 0,
        suspiciousFlagged: false,
        createdAt: '2026-11-28T08:00:00Z',
        updatedAt: '2026-11-28T10:00:00Z', // newer manual adjustment from live site
      },
    ],
  });

  const merged = mergeCommunityAndContestStates(local, remote);
  assert.equal(merged.posts.length, 2);
  assert.ok(merged.posts.some((p) => p.id === 'cpost-cf-1' && p.photos[0] === '/api/media/drive/abcDriveFileId123'));
  assert.ok(merged.posts.some((p) => p.id === 'cpost-local-1'));

  const mergedEntry = merged.entries.find((e) => e.id === 'centry-shared-1');
  assert.ok(mergedEntry);
  // Preserves highest genuine views (8) AND newer manual adjustment (+25) -> display score 33
  assert.equal(mergedEntry.genuineEligibleViews, 8);
  assert.equal(mergedEntry.manualScoreAdjustment, 25);
  assert.equal(mergedEntry.competitionDisplayScore, 33);
});

test('30-Day Unlimited Publishing & Automatic User Views Leaderboard: covers all 15 scenarios (multi-article sum, dedupe, disqualify/hide/delete exclusions, period freeze, participation toggle, participant exclusion, RBAC, export, idempotency, privacy)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-contest-30day-'));
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Enforce real admin header check to verify unauthorized access rejection (Scenario 10 & 11)
  const guardedAdminAuth = () => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.headers['x-test-admin'] !== 'super-admin-ok') {
        res.status(401).json({ ok: false, error: 'Unauthorized admin access' });
        return;
      }
      (req as express.Request & { admin2User?: { email: string } }).admin2User = {
        email: 'admin@coffeenadu.in',
      };
      next();
    };
  };

  const community = new CommunityBackend(tmpDir, guardedAdminAuth);
  const contest = new ContestBackend(tmpDir, community, guardedAdminAuth);
  community.mountRoutes(app);
  contest.mountRoutes(app);

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-test-admin': 'super-admin-ok',
  };

  try {
    // Scenario 1 & 2: User A publishes 5 distinct articles; User B publishes 2 distinct articles
    const userAEntries: Array<{ id: string; postId: string; slug: string }> = [];
    let userAToken = '';
    for (let i = 1; i <= 5; i += 1) {
      const resp = await fetch(`${baseUrl}/api/public/contest/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userAToken ? { Authorization: `Bearer ${userAToken}` } : {}),
        },
        body: JSON.stringify({
          contributorName: 'Anil Koppa',
          mobileNumber: i === 1 ? '9845090001' : undefined,
          title: `Anil Koppa Local Report Number ${i} on Rural Infrastructure`,
          description: `Detailed original field report number ${i} describing community road repair and water supply progress in Koppa taluk.`,
          location: 'ಕೊಪ್ಪ',
          photos: [],
          confirmOriginalNews: true,
          clientSubmissionId: `csub-userA-${i}`,
        }),
      });
      assert.equal(resp.status, 201, `User A article ${i} should publish cleanly`);
      const body = (await resp.json()) as {
        ok: boolean;
        token?: string;
        entry: { id: string; postId: string; slug: string };
      };
      if (body.token) userAToken = body.token;
      userAEntries.push(body.entry);
    }

    // Scenario 15 (Idempotency): Resubmitting with same clientSubmissionId does NOT create duplicate
    const retryResp = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        contributorName: 'Anil Koppa',
        title: 'Anil Koppa Local Report Number 5 on Rural Infrastructure',
        description:
          'Detailed original field report number 5 describing community road repair and water supply progress in Koppa taluk.',
        location: 'ಕೊಪ್ಪ',
        photos: [],
        confirmOriginalNews: true,
        clientSubmissionId: 'csub-userA-5',
      }),
    });
    assert.equal(retryResp.status, 200);
    const retryJson = (await retryResp.json()) as { ok: boolean; duplicatePrevented?: boolean; entry: { id: string } };
    assert.equal(retryJson.duplicatePrevented, true);
    assert.equal(retryJson.entry.id, userAEntries[4].id);

    const userBEntries: Array<{ id: string; postId: string; slug: string }> = [];
    let userBToken = '';
    for (let i = 1; i <= 2; i += 1) {
      const resp = await fetch(`${baseUrl}/api/public/contest/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userBToken ? { Authorization: `Bearer ${userBToken}` } : {}),
        },
        body: JSON.stringify({
          contributorName: 'Bhavana Sringeri',
          mobileNumber: i === 1 ? '9845090002' : undefined,
          switchContributor: i === 1 ? true : undefined,
          title: `Bhavana Sringeri Community Update Number ${i} on Local Schools`,
          description: `Original local update number ${i} highlighting student library upgrades and solar lighting in Sringeri villages.`,
          location: 'ಶೃಂಗೇರಿ',
          photos: [],
          confirmOriginalNews: true,
          clientSubmissionId: `csub-userB-${i}`,
        }),
      });
      assert.equal(resp.status, 201);
      const body = (await resp.json()) as {
        ok: boolean;
        token?: string;
        entry: { id: string; postId: string; slug: string };
      };
      if (body.token) userBToken = body.token;
      userBEntries.push(body.entry);
    }

    // Verify all 7 articles appear in Community Feed
    const feedResp = await fetch(`${baseUrl}/api/community/posts`);
    const feedJson = (await feedResp.json()) as { posts: Array<{ id: string }> };
    assert.equal(feedJson.posts.length, 7);

    // Scenario 3, 4, 5, 6: Record unique views across User A's 5 articles (total 5) vs User B's 2 articles (total 3)
    const recordUniqueView = async (slug: string, visitorToken: string, ipOctet: number) => {
      const r = await fetch(`${baseUrl}/api/public/contest/entries/${encodeURIComponent(slug)}/view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile Safari/537.36',
          'X-Forwarded-For': `103.42.19.${ipOctet}`,
        },
        body: JSON.stringify({ visitorToken }),
      });
      return (await r.json()) as { countedEligible: boolean; countedReason: string; eligibleViews: number };
    };

    // Give each of User A's 5 articles 1 unique view (total = 5 across 5 articles)
    for (let i = 0; i < 5; i += 1) {
      const v = await recordUniqueView(userAEntries[i].slug, `reader-A-${i}`, 10 + i);
      assert.equal(v.countedEligible, true);
      assert.equal(v.eligibleViews, 1);
    }
    // Same visitor refreshing User A's article 1 within 24h must NOT duplicate
    const dupView = await recordUniqueView(userAEntries[0].slug, 'reader-A-0', 10);
    assert.equal(dupView.countedEligible, false);
    assert.equal(dupView.countedReason, 'duplicate_24h');

    // Give User B's article 1 three unique views (single article = 3 > any single User A article of 1,
    // but User A's combined total = 5 > User B's combined total = 3!)
    for (let i = 0; i < 3; i += 1) {
      const v = await recordUniqueView(userBEntries[0].slug, `reader-B-${i}`, 50 + i);
      assert.equal(v.countedEligible, true);
    }

    // Verify public userLeaderboard ranks User A (#1, 5 views, 5 articles) above User B (#2, 3 views, 2 articles)
    // AND verify individual article views were NOT overwritten
    const pubOverviewResp = await fetch(`${baseUrl}/api/public/contest/overview`);
    const pubOverview = (await pubOverviewResp.json()) as {
      activeMonth: { monthKey: string; periodId?: string };
      userLeaderboard: Array<{
        rank: number;
        participantKey: string;
        displayName: string;
        totalVerifiedViews: number;
        eligibleArticleCount: number;
      }>;
      allEligibleEntries: Array<{ id: string; eligibleViews: number }>;
    };
    assert.equal(pubOverview.userLeaderboard.length, 2);
    assert.equal(pubOverview.userLeaderboard[0].displayName, 'Anil Koppa');
    assert.equal(pubOverview.userLeaderboard[0].rank, 1);
    assert.equal(pubOverview.userLeaderboard[0].totalVerifiedViews, 5);
    assert.equal(pubOverview.userLeaderboard[0].eligibleArticleCount, 5);
    assert.equal(pubOverview.userLeaderboard[1].displayName, 'Bhavana Sringeri');
    assert.equal(pubOverview.userLeaderboard[1].rank, 2);
    assert.equal(pubOverview.userLeaderboard[1].totalVerifiedViews, 3);
    assert.equal(pubOverview.userLeaderboard[1].eligibleArticleCount, 2);

    // Individual article views remain 1 for User A's first article and 3 for User B's first article
    assert.equal(
      pubOverview.allEligibleEntries.find((e) => e.id === userAEntries[0].id)?.eligibleViews,
      1
    );
    assert.equal(
      pubOverview.allEligibleEntries.find((e) => e.id === userBEntries[0].id)?.eligibleViews,
      3
    );

    // Privacy check: zero mobile numbers or raw userIds in public userLeaderboard
    const pubLeaderboardStr = JSON.stringify(pubOverview.userLeaderboard);
    assert.equal(pubLeaderboardStr.includes('9845090001'), false);
    assert.equal(pubLeaderboardStr.includes('9845090002'), false);
    assert.equal(pubLeaderboardStr.includes('cuser_'), false);

    // Scenario 7 & 11: User B cannot edit/delete User A's article or call admin routes without admin auth
    const unauthDelete = await fetch(
      `${baseUrl}/api/community/posts/${encodeURIComponent(userAEntries[0].postId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userBToken}` },
      }
    );
    assert.equal(unauthDelete.status, 403);

    const unauthAdminRoute = await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(pubOverview.activeMonth.monthKey)}/participation`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }
    );
    assert.equal(unauthAdminRoute.status, 401);

    // Scenario 8: Disqualifying 1 article of User A immediately reduces User A's total from 5 -> 4
    const disqResp = await fetch(
      `${baseUrl}/api/admin2/contest/entries/${encodeURIComponent(userAEntries[4].id)}/eligibility`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ eligibility: 'disqualified', reason: 'Off-topic submission', hidePost: false }),
      }
    );
    assert.equal(disqResp.status, 200);

    // Scenario 8b: Unpublishing/hiding 1 article of User A immediately reduces User A's total from 4 -> 3
    const hideResp = await fetch(
      `${baseUrl}/api/admin2/community/posts/${encodeURIComponent(userAEntries[3].postId)}/status`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ status: 'hidden', reason: 'Temporarily hidden by moderator' }),
      }
    );
    assert.equal(hideResp.status, 200);

    // Scenario 8c: Author deleting 1 article of User A immediately reduces User A's total from 3 -> 2
    const selfDeleteResp = await fetch(
      `${baseUrl}/api/community/posts/${encodeURIComponent(userAEntries[2].postId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userAToken}` },
      }
    );
    assert.equal(selfDeleteResp.status, 200);

    const afterExclusions = (await (await fetch(`${baseUrl}/api/public/contest/overview`)).json()) as {
      userLeaderboard: Array<{ displayName: string; totalVerifiedViews: number; eligibleArticleCount: number }>;
    };
    // Now User B (3 views) ranks #1 and User A (2 remaining eligible published articles, 2 views) ranks #2!
    assert.equal(afterExclusions.userLeaderboard[0].displayName, 'Bhavana Sringeri');
    assert.equal(afterExclusions.userLeaderboard[0].totalVerifiedViews, 3);
    assert.equal(afterExclusions.userLeaderboard[1].displayName, 'Anil Koppa');
    assert.equal(afterExclusions.userLeaderboard[1].totalVerifiedViews, 2);
    assert.equal(afterExclusions.userLeaderboard[1].eligibleArticleCount, 2);

    // Scenario 12: Admin excludes User B from leaderboard -> User A becomes #1, then reinstate restores User B
    const adminOverview1 = (await (
      await fetch(`${baseUrl}/api/admin2/contest/overview`, { headers: adminHeaders })
    ).json()) as {
      participants: Array<{ userId: string; displayName: string }>;
    };
    const userBRecord = adminOverview1.participants.find((p) => p.displayName === 'Bhavana Sringeri');
    assert.ok(userBRecord);

    const monthKey = pubOverview.activeMonth.monthKey;
    const excludeResp = await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(monthKey)}/participants/${encodeURIComponent(userBRecord.userId)}/eligibility`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ eligible: false, reason: 'Temporary review hold' }),
      }
    );
    assert.equal(excludeResp.status, 200);

    const afterUserExclude = (await (await fetch(`${baseUrl}/api/public/contest/overview`)).json()) as {
      userLeaderboard: Array<{ displayName: string }>;
    };
    assert.equal(afterUserExclude.userLeaderboard.length, 1);
    assert.equal(afterUserExclude.userLeaderboard[0].displayName, 'Anil Koppa');

    // Reinstate User B
    const reinstateResp = await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(monthKey)}/participants/${encodeURIComponent(userBRecord.userId)}/eligibility`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ eligible: true }),
      }
    );
    assert.equal(reinstateResp.status, 200);

    // Scenario 10: Admin disables competition participation -> new submit blocked (403); re-enable allows it
    const pauseResp = await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(monthKey)}/participation`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ enabled: false }),
      }
    );
    assert.equal(pauseResp.status, 200);

    const blockedSubmit = await fetch(`${baseUrl}/api/public/contest/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        contributorName: 'Anil Koppa',
        title: 'Blocked While Participation Is Disabled',
        description: 'This article must be rejected while competition participation is paused by admin.',
        location: 'ಕೊಪ್ಪ',
        photos: [],
        confirmOriginalNews: true,
      }),
    });
    assert.equal(blockedSubmit.status, 403);

    await fetch(
      `${baseUrl}/api/admin2/contest/months/${encodeURIComponent(monthKey)}/participation`,
      {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ enabled: true }),
      }
    );

    // Scenario 13: Admin exports user leaderboard in CSV & JSON
    const csvResp = await fetch(
      `${baseUrl}/api/admin2/contest/export?month=${encodeURIComponent(monthKey)}&format=csv&scope=leaderboard`,
      { headers: adminHeaders }
    );
    assert.equal(csvResp.status, 200);
    const csvText = await csvResp.text();
    assert.ok(csvText.includes('Rank,Competition Period,Participant Name,Mobile (Admin Only)'));
    assert.ok(csvText.includes('Bhavana Sringeri'));
    assert.ok(csvText.includes('Anil Koppa'));

    const jsonExportResp = await fetch(
      `${baseUrl}/api/admin2/contest/export?month=${encodeURIComponent(monthKey)}&format=json&scope=leaderboard`,
      { headers: adminHeaders }
    );
    assert.equal(jsonExportResp.status, 200);
    const jsonExport = (await jsonExportResp.json()) as {
      scope: string;
      userLeaderboard: Array<{ displayName: string; totalVerifiedViews: number }>;
    };
    assert.equal(jsonExport.scope, 'leaderboard');
    assert.equal(jsonExport.userLeaderboard.length, 2);

    // Scenario 9: Opening next 30-day period freezes historical leaderboard & isolates new period views
    const openNextResp = await fetch(`${baseUrl}/api/admin2/contest/months/open-next`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ startDateIso: '2027-01-01T00:00:00+05:30', durationDays: 30 }),
    });
    assert.equal(openNextResp.status, 201);

    // A new unique view on an old-period article must NOT enter the new period and must NOT alter the frozen historical leaderboard
    await recordUniqueView(userAEntries[0].slug, 'late-visitor-after-close-999', 99);

    const newPeriodPub = (await (await fetch(`${baseUrl}/api/public/contest/overview`)).json()) as {
      userLeaderboard: unknown[];
    };
    assert.equal(newPeriodPub.userLeaderboard.length, 0);

    const oldPeriodAdmin = (await (
      await fetch(`${baseUrl}/api/admin2/contest/overview?month=${encodeURIComponent(monthKey)}`, {
        headers: adminHeaders,
      })
    ).json()) as {
      selectedMonth: {
        status: string;
        frozenUserLeaderboard?: Array<{ displayName: string; totalVerifiedViews: number }>;
      };
      userLeaderboard: Array<{ displayName: string; totalVerifiedViews: number }>;
    };
    assert.equal(oldPeriodAdmin.selectedMonth.status, 'closed');
    assert.ok(oldPeriodAdmin.selectedMonth.frozenUserLeaderboard);
    assert.equal(oldPeriodAdmin.userLeaderboard[0].displayName, 'Bhavana Sringeri');
    assert.equal(oldPeriodAdmin.userLeaderboard[0].totalVerifiedViews, 3);
    assert.equal(oldPeriodAdmin.userLeaderboard[1].displayName, 'Anil Koppa');
    assert.equal(oldPeriodAdmin.userLeaderboard[1].totalVerifiedViews, 2);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});



