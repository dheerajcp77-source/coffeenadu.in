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
