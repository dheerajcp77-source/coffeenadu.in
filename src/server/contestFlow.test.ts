import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { CommunityBackend } from './communityBackend';
import { ContestBackend } from './contestBackend';

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
