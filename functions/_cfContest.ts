/**
 * Standalone Cloudflare Pages handler for /api/public/contest/* and /api/admin2/contest/*
 * Unifies Contest submissions with Community posts/users via _cfCommunityContestStore,
 * persists durably to Google Apps Script + Drive, and guarantees every published article
 * appears to all visitors, Unified Community Feed, and Admin Dashboard.
 */

import type { CommunityPostRecord, CommunityUserPrivate } from '../src/types/community';
import type {
  AdminContestEntryView,
  ContestAdminOverview,
  ContestEntryEligibility,
  ContestEntryRecord,
  ContestMonthRecord,
  ContestMonthStatus,
  ContestPublicOverview,
  ContestSuspiciousAlert,
  ContestViewRecordResult,
  ContestWinnerRecord,
} from '../src/types/contest';
import {
  CONTEST_CATEGORY_ID,
  CONTEST_KANNADA_HEADING,
  CONTEST_KANNADA_SUBTITLE,
  CONTEST_OFFICIAL_NAME,
  CONTEST_PUBLIC_URL,
  CONTEST_TARGET_AREA,
  ROLLING_VIEW_WINDOW_MS,
  createDefaultContestPrizes,
  createInitialContestMonthRecord,
  detectSuspiciousTrafficPattern,
  getIstMonthBounds,
  getNextIstMonthKey,
  isContestMonthOpen,
  isEligibleRolling24hVisit,
  isLikelyBotUserAgent,
  normalizeContestPrizes,
  rankEligibleContestEntries,
  toPublicContestEntry,
  toPublicContestWinner,
} from '../src/utils/contestHelpers';
import {
  generateCommunitySlug,
  maskMobileNumber,
  normalizeCommunityMobile,
  toPublicCommunityPost,
} from '../src/utils/communityHelpers';
import {
  loadSharedCommunityContestState,
  persistPublicPhotosOnCf,
  persistSharedCommunityContestDelta,
  syncContestEntriesWithPost,
  type CfSharedCommunityContestState,
  type PagesEnvLike,
} from './_cfCommunityContestStore';

const VISITOR_COOKIE_NAME = 'cn_contest_vid';
const SESSION_COOKIE_NAME = 'cn_community_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const burstMap = new Map<string, Array<{ ts: number; visitorHash: string }>>();
const articleHitsMap = new Map<string, number[]>();

function makeId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

function randomHex(byteCount = 16): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanSingleLine(raw: unknown, maxLen = 200): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function cleanMultiline(raw: unknown, maxLen = 4000): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLen);
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function jsonResp(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function csvEscape(value: unknown): string {
  const str = String(value ?? '').replace(/"/g, '""');
  return /[",\r\n]/.test(str) ? `"${str}"` : str;
}

function syncMonths(state: CfSharedCommunityContestState, now = new Date()): ContestMonthRecord {
  const nowMs = now.getTime();
  for (const m of state.months) {
    if (m.status === 'open' && nowMs > Date.parse(m.endsAtIso)) {
      m.status = 'closed';
      m.updatedAt = now.toISOString();
    }
  }
  let active = state.months.find((m) => m.monthKey === state.activeMonthKey);
  if (!active) {
    active = createInitialContestMonthRecord(now);
    state.months.unshift(active);
    state.activeMonthKey = active.monthKey;
  }
  return active;
}

async function resolveCommunitySessionUser(
  request: Request,
  state: CfSharedCommunityContestState
): Promise<CommunityUserPrivate | null> {
  const authHeader = (request.headers.get('authorization') || '').trim();
  let token = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(request);
    token = (cookies[SESSION_COOKIE_NAME] || '').trim();
  }
  if (!token) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const sess = state.sessions.find((s) => s.tokenHash === hash && s.expiresAtMs > now);
  if (!sess) return null;
  return state.users.find((u) => u.id === sess.userId) || null;
}

function syncMonthEntriesWithPosts(state: CfSharedCommunityContestState, monthKey: string): ContestEntryRecord[] {
  const postMap = new Map(state.posts.map((p) => [p.id, p]));
  return state.entries
    .filter((e) => e.competitionMonth === monthKey)
    .map((entry) => {
      const post = postMap.get(entry.postId);
      if (post) syncContestEntriesWithPost(state, post);
      return entry;
    });
}

function buildAdminOverviewPayload(
  state: CfSharedCommunityContestState,
  activeMonth: ContestMonthRecord,
  requestedMonthKey?: string
): ContestAdminOverview {
  const selectedMonth =
    (requestedMonthKey && state.months.find((m) => m.monthKey === requestedMonthKey)) ||
    activeMonth;
  const monthEntries = syncMonthEntriesWithPosts(state, selectedMonth.monthKey).sort((a, b) => {
    if (a.eligibility !== b.eligibility) {
      return a.eligibility === 'eligible' ? -1 : 1;
    }
    if (b.eligibleViews !== a.eligibleViews) {
      return b.eligibleViews - a.eligibleViews;
    }
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });

  const entryIds = new Set(monthEntries.map((e) => e.id));
  const alerts = state.alerts.filter(
    (a) => a.competitionMonth === selectedMonth.monthKey || entryIds.has(a.entryId)
  );
  const userMap = new Map(state.users.map((u) => [u.id, u]));
  const postMap = new Map(state.posts.map((p) => [p.id, p]));

  const entries: AdminContestEntryView[] = monthEntries.map((e) => ({
    ...e,
    contributorMobileNumber: userMap.get(e.contributorUserId)?.mobileNumber || '',
    postStatus: postMap.get(e.postId)?.status || 'published',
    openAlertsCount: alerts.filter((a) => a.entryId === e.id && a.status === 'open').length,
  }));

  return {
    activeMonthKey: activeMonth.monthKey,
    months: [...state.months].sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    selectedMonth,
    entries,
    alerts,
    auditLogs: state.auditLogs.slice(0, 120),
    summary: {
      totalEntries: entries.length,
      eligibleEntries: entries.filter((e) => e.eligibility === 'eligible').length,
      disqualifiedEntries: entries.filter((e) => e.eligibility === 'disqualified').length,
      totalPageViews: entries.reduce((s, e) => s + (e.totalPageViews || 0), 0),
      totalEligibleViews: entries.reduce((s, e) => s + (e.eligibleViews || 0), 0),
      suspiciousBlockedViews: entries.reduce((s, e) => s + (e.suspiciousBlockedViews || 0), 0),
      openAlerts: alerts.filter((a) => a.status === 'open').length,
    },
  };
}

export async function handleCfContestApi(
  request: Request,
  url: URL,
  verifyAdmin: () => Promise<{ ok: boolean; email?: string }>,
  env?: PagesEnvLike
): Promise<Response | null> {
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (
    !pathname.startsWith('/api/public/contest/') &&
    !pathname.startsWith('/api/admin2/contest/')
  ) {
    return null;
  }

  // Always force-refresh authoritative snapshot for contest overview, submit, and admin views
  // so every browser, mobile phone, and admin panel stays 100% synchronized.
  const forceFresh =
    method !== 'GET' ||
    pathname === '/api/public/contest/overview' ||
    pathname.startsWith('/api/admin2/contest/');

  const state = await loadSharedCommunityContestState(env, forceFresh);
  const activeMonth = syncMonths(state);

  if (pathname === '/api/public/contest/overview' && method === 'GET') {
    const monthEntries = syncMonthEntriesWithPosts(state, activeMonth.monthKey);
    const publicEntries = rankEligibleContestEntries(monthEntries);
    const publishedWinners = activeMonth.winnersPublished
      ? [...activeMonth.winners]
          .sort((a, b) => a.rank - b.rank)
          .map((w) => toPublicContestWinner(w))
      : [];
    const fifthQualityWinner =
      publishedWinners.find((w) => w.prizeType === 'quality') || null;
    const totalBudgetInr = activeMonth.prizes.reduce((s, p) => s + p.amountInr, 0);

    const overview: ContestPublicOverview = {
      competitionName: CONTEST_OFFICIAL_NAME,
      kannadaHeading: CONTEST_KANNADA_HEADING,
      kannadaSubtitle: CONTEST_KANNADA_SUBTITLE,
      targetArea: CONTEST_TARGET_AREA,
      contestUrl: CONTEST_PUBLIC_URL,
      activeMonth: {
        monthKey: activeMonth.monthKey,
        displayLabelEn: activeMonth.displayLabelEn,
        displayLabelKn: activeMonth.displayLabelKn,
        startsAtIso: activeMonth.startsAtIso,
        endsAtIso: activeMonth.endsAtIso,
        status: activeMonth.status,
        isAcceptingEntries: isContestMonthOpen(activeMonth),
        totalBudgetInr,
        prizes: activeMonth.prizes,
        winnersPublished: activeMonth.winnersPublished,
        publishedWinners,
      },
      topFour: publicEntries.slice(0, 4),
      fifthQualityWinner,
      allEligibleEntries: publicEntries,
      totalEligibleCount: publicEntries.length,
      previousMonths: state.months
        .filter((m) => m.winnersPublished && m.winners.length > 0)
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        .map((m) => ({
          monthKey: m.monthKey,
          displayLabelEn: m.displayLabelEn,
          displayLabelKn: m.displayLabelKn,
          status: m.status,
          winners: [...m.winners]
            .sort((a, b) => a.rank - b.rank)
            .map((w) => toPublicContestWinner(w)),
        })),
      serverNowIso: new Date().toISOString(),
    };
    return jsonResp({ ok: true, ...overview });
  }

  const entryStatsMatch = pathname.match(/^\/api\/public\/contest\/entries\/([^/]+)$/);
  if (entryStatsMatch && method === 'GET') {
    const freshState = await loadSharedCommunityContestState(env, true);
    const key = decodeURIComponent(entryStatsMatch[1]).toLowerCase();
    const entry = freshState.entries.find(
      (e) =>
        e.id.toLowerCase() === key ||
        e.postId.toLowerCase() === key ||
        e.slug.toLowerCase() === key
    );
    if (!entry) return jsonResp({ ok: false, error: 'Contest entry not found.' }, 404);
    const linkedPost = freshState.posts.find((p) => p.id === entry.postId);
    if (linkedPost) syncContestEntriesWithPost(freshState, linkedPost);
    const month = freshState.months.find((m) => m.monthKey === entry.competitionMonth);
    return jsonResp({
      ok: true,
      entry: toPublicContestEntry(entry),
      monthLabelEn: month?.displayLabelEn || entry.competitionMonth,
      monthLabelKn: month?.displayLabelKn || entry.competitionMonth,
      monthStatus: month?.status || 'closed',
      isMonthOpen: month ? isContestMonthOpen(month) : false,
    });
  }

  const viewMatch = pathname.match(/^\/api\/public\/contest\/entries\/([^/]+)\/view$/);
  if (viewMatch && method === 'POST') {
    const key = decodeURIComponent(viewMatch[1]).toLowerCase();
    const entry = state.entries.find(
      (e) =>
        e.id.toLowerCase() === key ||
        e.postId.toLowerCase() === key ||
        e.slug.toLowerCase() === key
    );
    if (!entry) return jsonResp({ ok: false, error: 'Contest entry not found.' }, 404);

    const linkedPost = state.posts.find((p) => p.id === entry.postId);
    if (linkedPost) syncContestEntriesWithPost(state, linkedPost);

    const now = new Date();
    const nowMs = now.getTime();
    const month = state.months.find((m) => m.monthKey === entry.competitionMonth);

    const buildRes = (
      countedEligible: boolean,
      countedReason: ContestViewRecordResult['countedReason'],
      setCookie?: string
    ) =>
      jsonResp(
        {
          ok: true,
          entryId: entry.id,
          slug: entry.slug,
          competitionMonth: entry.competitionMonth,
          countedEligible,
          countedReason,
          eligibleViews: entry.eligibleViews,
          totalPageViews: entry.totalPageViews,
        },
        200,
        setCookie ? { 'set-cookie': setCookie } : undefined
      );

    if (
      url.searchParams.get('preview') === '1' ||
      request.headers.get('x-admin-preview') === '1'
    ) {
      return buildRes(false, 'admin_excluded');
    }

    const ua = request.headers.get('user-agent') || '';
    if (isLikelyBotUserAgent(ua)) {
      entry.suspiciousBlockedViews += 1;
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestEntry: entry },
        { bestEffort: true }
      );
      return buildRes(false, 'bot_filtered');
    }

    entry.totalPageViews += 1;
    entry.lastViewedAt = now.toISOString();
    entry.updatedAt = now.toISOString();
    if (linkedPost && entry.totalPageViews > (linkedPost.viewsCount || 0)) {
      linkedPost.viewsCount = entry.totalPageViews;
    }

    if (entry.eligibility !== 'eligible') {
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestEntry: entry, post: linkedPost },
        { bestEffort: true }
      );
      return buildRes(false, 'disqualified');
    }
    if (!month || !isContestMonthOpen(month, nowMs)) {
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestEntry: entry, post: linkedPost },
        { bestEffort: true }
      );
      return buildRes(false, 'month_closed');
    }

    const cookies = parseCookies(request);
    let cookieId = cookies[VISITOR_COOKIE_NAME];
    let setCookieHeader: string | undefined;
    if (!cookieId || !/^[a-f0-9]{24,64}$/i.test(cookieId)) {
      cookieId = randomHex(16);
      setCookieHeader = `${VISITOR_COOKIE_NAME}=${cookieId}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=None; Partitioned`;
    }

    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';
    const ipHash = (await sha256Hex(`cfip:${ip}`)).slice(0, 24);
    const uaHash = (await sha256Hex(`cfua:${ua.slice(0, 120)}`)).slice(0, 24);
    const visitorHash = (await sha256Hex(`cfvid:${cookieId}:${ipHash}:${uaHash}`)).slice(0, 32);
    const devHash = (await sha256Hex(`cfdev:${ipHash}:${uaHash}`)).slice(0, 32);

    const bKey = `${entry.id}:${ipHash}`;
    const samples = (burstMap.get(bKey) || []).filter((s) => nowMs - s.ts < 15 * 60 * 1000);
    samples.push({ ts: nowMs, visitorHash });
    burstMap.set(bKey, samples);

    const artHits = (articleHitsMap.get(entry.id) || []).filter(
      (ts) => nowMs - ts < 5 * 60 * 1000
    );
    artHits.push(nowMs);
    articleHitsMap.set(entry.id, artHits);

    const pattern = detectSuspiciousTrafficPattern({
      ipHitsOnArticleLast10m: samples.filter((s) => nowMs - s.ts < 10 * 60 * 1000).length,
      distinctVisitorsFromSameIpLast15m: new Set(samples.map((s) => s.visitorHash)).size,
      articleTotalHitsLast5m: artHits.length,
    });
    if (pattern?.suspicious) {
      entry.suspiciousBlockedViews += 1;
      entry.suspiciousFlagged = true;
      const alert: ContestSuspiciousAlert = {
        id: makeId('calert'),
        entryId: entry.id,
        articleSlug: entry.slug,
        articleTitle: entry.title,
        competitionMonth: entry.competitionMonth,
        severity: pattern.severity,
        reason: pattern.reason,
        blockedCount: 1,
        detectedAt: now.toISOString(),
        status: 'open',
      };
      state.alerts.unshift(alert);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestEntry: entry, post: linkedPost, contestAlert: alert },
        { bestEffort: true }
      );
      return buildRes(false, 'suspicious_blocked', setCookieHeader);
    }

    const bucket = state.viewBuckets.find(
      (b) => b.entryId === entry.id && (b.visitorHash === visitorHash || b.visitorHash === devHash)
    );
    if (
      bucket &&
      !isEligibleRolling24hVisit(bucket.lastEligibleAtMs, nowMs, ROLLING_VIEW_WINDOW_MS)
    ) {
      bucket.hitCount += 1;
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestEntry: entry, post: linkedPost, viewBuckets: [bucket] },
        { bestEffort: true }
      );
      return buildRes(false, 'duplicate_24h', setCookieHeader);
    }

    entry.eligibleViews += 1;
    let bucketsDelta;
    if (bucket) {
      bucket.lastEligibleAtMs = nowMs;
      bucket.hitCount += 1;
      bucketsDelta = [bucket];
    } else {
      const b1 = { entryId: entry.id, visitorHash, lastEligibleAtMs: nowMs, hitCount: 1 };
      const b2 = {
        entryId: entry.id,
        visitorHash: devHash,
        lastEligibleAtMs: nowMs,
        hitCount: 1,
      };
      state.viewBuckets.push(b1, b2);
      bucketsDelta = [b1, b2];
    }
    await persistSharedCommunityContestDelta(
      env,
      state,
      { contestEntry: entry, post: linkedPost, viewBuckets: bucketsDelta },
      { bestEffort: true }
    );
    return buildRes(true, 'counted', setCookieHeader);
  }

  if (pathname === '/api/public/contest/submit' && method === 'POST') {
    if (!isContestMonthOpen(activeMonth)) {
      return jsonResp({ ok: false, error: 'ಈ ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆಯ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ.' }, 400);
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResp({ ok: false, error: 'Invalid request body.' }, 400);
    }
    if (body.confirmOriginalNews !== true) {
      return jsonResp(
        { ok: false, error: 'ದಯವಿಟ್ಟು ಇದು ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿ ಎಂದು ದೃಢೀಕರಿಸಿ.' },
        400
      );
    }

    const switchContributor = body.switchContributor === true;
    const existingSessionUser = switchContributor
      ? null
      : await resolveCommunitySessionUser(request, state);
    const providedName = cleanSingleLine(body.contributorName, 80);
    const providedMobile = normalizeCommunityMobile(body.mobileNumber);

    const title = cleanSingleLine(body.title, 160);
    const description = cleanMultiline(body.description, 4000);
    const location = cleanSingleLine(body.location, 100);

    if (title.length < 5) {
      return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಸುದ್ದಿ ಶೀರ್ಷಿಕೆಯನ್ನು ನಮೂದಿಸಿ.' }, 400);
    }
    if (description.length < 20) {
      return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಸುದ್ದಿಯ ವಿವರಣೆಯನ್ನು ನಮೂದಿಸಿ.' }, 400);
    }
    if (location.length < 2) {
      return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಊರನ್ನು ಆಯ್ಕೆಮಾಡಿ.' }, 400);
    }

    const nowIso = new Date().toISOString();
    let contributorUser: CommunityUserPrivate | undefined;
    let rawToken: string | null = null;
    let newSession;

    if (
      existingSessionUser &&
      (!providedMobile || providedMobile === existingSessionUser.mobileNumber)
    ) {
      if (existingSessionUser.status === 'suspended') {
        return jsonResp(
          { ok: false, error: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.' },
          403
        );
      }
      if (providedName.length >= 2) {
        existingSessionUser.fullName = providedName;
      }
      existingSessionUser.lastActiveAt = nowIso;
      contributorUser = existingSessionUser;
    } else {
      if (providedName.length < 2) {
        return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.' }, 400);
      }
      if (!providedMobile) {
        return jsonResp(
          { ok: false, error: 'ದಯವಿಟ್ಟು 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.' },
          400
        );
      }

      contributorUser = state.users.find((u) => u.mobileNumber === providedMobile);
      if (contributorUser) {
        if (contributorUser.status === 'suspended') {
          return jsonResp(
            { ok: false, error: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.' },
            403
          );
        }
        contributorUser.fullName = providedName;
        contributorUser.lastActiveAt = nowIso;
      } else {
        contributorUser = {
          id: `cuser-${Date.now().toString(36)}-${randomHex(4)}`,
          fullName: providedName,
          mobileNumber: providedMobile,
          registeredAt: nowIso,
          lastActiveAt: nowIso,
          status: 'active',
        };
        state.users.unshift(contributorUser);
      }

      rawToken = randomHex(32);
      const nowMs = Date.now();
      state.sessions = state.sessions.filter((s) => s.expiresAtMs > nowMs);
      newSession = {
        tokenHash: await sha256Hex(rawToken),
        userId: contributorUser.id,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + SESSION_TTL_MS,
      };
      state.sessions.push(newSession);
    }

    const authorDisplayName =
      providedName.length >= 2 ? providedName : contributorUser.fullName;

    // Duplicate prevention within 60s
    const nowMs = Date.now();
    const duplicatePost = state.posts.find(
      (p) =>
        p.authorUserId === contributorUser!.id &&
        p.category === CONTEST_CATEGORY_ID &&
        p.title.toLowerCase() === title.toLowerCase() &&
        nowMs - Date.parse(p.createdAt) < 60_000
    );
    if (duplicatePost) {
      const existingEntry = state.entries.find((e) => e.postId === duplicatePost.id);
      if (existingEntry) {
        return jsonResp({
          ok: true,
          duplicatePrevented: true,
          token: rawToken,
          profile: {
            fullName: contributorUser.fullName,
            maskedMobile: maskMobileNumber(contributorUser.mobileNumber),
            registeredAt: contributorUser.registeredAt,
            status: contributorUser.status,
            totalPosts: state.posts.filter(
              (p) => p.authorUserId === contributorUser!.id && p.status !== 'removed'
            ).length,
          },
          post: toPublicCommunityPost(duplicatePost, contributorUser.id),
          entry: toPublicContestEntry(existingEntry),
          permanentPath: `/community/${encodeURIComponent(duplicatePost.slug)}`,
        });
      }
    }

    const photoResult = await persistPublicPhotosOnCf(env, body.photos);
    if (!photoResult.ok) {
      return jsonResp(
        { ok: false, error: photoResult.error },
        photoResult.storageFailure ? 502 : 400
      );
    }

    const postId = `cpost-${Date.now().toString(36)}-${randomHex(4)}`;
    const slug = generateCommunitySlug(title, randomHex(4));

    const post: CommunityPostRecord = {
      id: postId,
      slug,
      authorUserId: contributorUser.id,
      authorName: authorDisplayName,
      title,
      category: CONTEST_CATEGORY_ID,
      description,
      location,
      photos: photoResult.photos,
      status: 'published',
      createdAt: nowIso,
      updatedAt: nowIso,
      viewsCount: 0,
      sharesCount: 0,
    };
    state.posts.unshift(post);

    const entry: ContestEntryRecord = {
      id: makeId('centry'),
      postId,
      slug,
      competitionMonth: activeMonth.monthKey,
      contributorUserId: contributorUser.id,
      contributorName: authorDisplayName,
      title,
      summary: description.slice(0, 220),
      location,
      thumbnailUrl: photoResult.photos[0] || undefined,
      publishedAt: nowIso,
      eligibility: 'eligible',
      totalPageViews: 0,
      eligibleViews: 0,
      suspiciousBlockedViews: 0,
      suspiciousFlagged: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.entries.unshift(entry);

    try {
      await persistSharedCommunityContestDelta(env, state, {
        user: contributorUser,
        session: newSession,
        post,
        contestEntry: entry,
        activeMonthKey: activeMonth.monthKey,
      });
    } catch (err) {
      return jsonResp(
        {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'ಸುದ್ದಿಯನ್ನು ಶಾಶ್ವತವಾಗಿ ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        },
        502
      );
    }

    const extraHeaders: Record<string, string> = {};
    if (rawToken) {
      const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
      const isHttps = url.protocol === 'https:';
      extraHeaders['Set-Cookie'] = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
        'Path=/',
        `Max-Age=${maxAgeSec}`,
        'HttpOnly',
        isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
      ].join('; ');
    }

    return jsonResp(
      {
        ok: true,
        token: rawToken,
        profile: {
          fullName: contributorUser.fullName,
          maskedMobile: maskMobileNumber(contributorUser.mobileNumber),
          registeredAt: contributorUser.registeredAt,
          status: contributorUser.status,
          totalPosts: state.posts.filter(
            (p) => p.authorUserId === contributorUser!.id && p.status !== 'removed'
          ).length,
        },
        post: toPublicCommunityPost(post, contributorUser.id),
        entry: toPublicContestEntry(entry),
        permanentPath: `/community/${encodeURIComponent(slug)}`,
      },
      201,
      extraHeaders
    );
  }

  if (pathname.startsWith('/api/admin2/contest/')) {
    const auth = await verifyAdmin();
    if (!auth.ok) return jsonResp({ ok: false, error: 'Unauthorized' }, 401);
    const actor = auth.email || 'admin@coffeenadu.in';

    if (pathname === '/api/admin2/contest/overview' && method === 'GET') {
      const reqMonth = url.searchParams.get('month') || activeMonth.monthKey;
      return jsonResp({
        ok: true,
        ...buildAdminOverviewPayload(state, activeMonth, reqMonth),
      });
    }

    const eligMatch = pathname.match(/^\/api\/admin2\/contest\/entries\/([^/]+)\/eligibility$/);
    if (eligMatch && method === 'PATCH') {
      const entry = state.entries.find((e) => e.id === decodeURIComponent(eligMatch[1]));
      if (!entry) return jsonResp({ ok: false, error: 'Not found' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const eligibility: ContestEntryEligibility =
        body.eligibility === 'disqualified' ? 'disqualified' : 'eligible';
      const reason = cleanSingleLine(body.reason, 240);
      if (eligibility === 'disqualified' && reason.length < 3) {
        return jsonResp(
          { ok: false, error: 'Please enter a brief disqualification reason for the audit record.' },
          400
        );
      }
      const nowIso = new Date().toISOString();
      entry.eligibility = eligibility;
      entry.disqualificationReason = eligibility === 'disqualified' ? reason : undefined;
      entry.disqualifiedBy = eligibility === 'disqualified' ? actor : undefined;
      entry.disqualifiedAt = eligibility === 'disqualified' ? nowIso : undefined;
      entry.updatedAt = nowIso;
      const auditLog = {
        id: makeId('caud'),
        timestamp: nowIso,
        actorEmail: actor,
        action: eligibility === 'disqualified' ? 'entry.disqualify' : 'entry.reinstate',
        competitionMonth: entry.competitionMonth,
        targetId: entry.id,
        details: `Updated "${entry.title}" -> ${eligibility}${reason ? ` (${reason})` : ''}`,
      };
      state.auditLogs.unshift(auditLog);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestEntry: entry, contestAuditLog: auditLog },
        { adminEmail: actor }
      );
      return jsonResp({ ok: true, entry });
    }

    const alertMatch = pathname.match(/^\/api\/admin2\/contest\/alerts\/([^/]+)$/);
    if (alertMatch && method === 'PATCH') {
      const alert = state.alerts.find((a) => a.id === decodeURIComponent(alertMatch[1]));
      if (!alert) return jsonResp({ ok: false, error: 'Suspicious alert not found.' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      alert.status =
        body.status === 'dismissed'
          ? 'dismissed'
          : body.status === 'investigated'
          ? 'investigated'
          : 'open';
      alert.adminNote = cleanSingleLine(body.adminNote, 240) || alert.adminNote;
      alert.reviewedBy = actor;
      alert.reviewedAt = new Date().toISOString();
      const auditLog = {
        id: makeId('caud'),
        timestamp: alert.reviewedAt,
        actorEmail: actor,
        action: 'alert.review',
        competitionMonth: alert.competitionMonth,
        targetId: alert.id,
        details: `Marked alert for "${alert.articleTitle}" as ${alert.status}`,
      };
      state.auditLogs.unshift(auditLog);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestAlert: alert, contestAuditLog: auditLog },
        { adminEmail: actor }
      );
      return jsonResp({ ok: true, alert });
    }

    const pubMatch = pathname.match(/^\/api\/admin2\/contest\/months\/([^/]+)\/publish-winners$/);
    if (pubMatch && method === 'PATCH') {
      const m = state.months.find((x) => x.monthKey === decodeURIComponent(pubMatch[1]));
      if (!m) return jsonResp({ ok: false, error: 'Month not found' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      m.winnersPublished = Boolean(body.published);
      m.updatedAt = new Date().toISOString();
      const auditLog = {
        id: makeId('caud'),
        timestamp: m.updatedAt,
        actorEmail: actor,
        action: m.winnersPublished ? 'winners.publish' : 'winners.hide',
        competitionMonth: m.monthKey,
        details: `${m.winnersPublished ? 'Published' : 'Hidden'} public winner announcement for ${m.displayLabelEn}`,
      };
      state.auditLogs.unshift(auditLog);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestMonth: m, contestAuditLog: auditLog },
        { adminEmail: actor }
      );
      return jsonResp({ ok: true, month: m });
    }

    const cfgMatch = pathname.match(/^\/api\/admin2\/contest\/months\/([^/]+)\/config$/);
    if (cfgMatch && method === 'PUT') {
      const m = state.months.find((x) => x.monthKey === decodeURIComponent(cfgMatch[1]));
      if (!m) return jsonResp({ ok: false, error: 'Month not found' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const startsAtIso = String(body.startsAtIso || m.startsAtIso).trim();
      const endsAtIso = String(body.endsAtIso || m.endsAtIso).trim();
      if (
        !Number.isFinite(Date.parse(startsAtIso)) ||
        !Number.isFinite(Date.parse(endsAtIso)) ||
        Date.parse(endsAtIso) <= Date.parse(startsAtIso)
      ) {
        return jsonResp({ ok: false, error: 'End date must be strictly after start date.' }, 400);
      }
      m.startsAtIso = startsAtIso;
      m.endsAtIso = endsAtIso;
      m.prizes = normalizeContestPrizes(body.prizes as never);
      if (['open', 'closed', 'finalized'].includes(String(body.status))) {
        m.status = body.status as ContestMonthStatus;
      }
      m.allowCarryOver = Boolean(body.allowCarryOver);
      m.updatedAt = new Date().toISOString();
      const auditLog = {
        id: makeId('caud'),
        timestamp: m.updatedAt,
        actorEmail: actor,
        action: 'month.config',
        competitionMonth: m.monthKey,
        details: `Updated ${m.displayLabelEn} configuration (Status: ${m.status})`,
      };
      state.auditLogs.unshift(auditLog);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestMonth: m, contestAuditLog: auditLog },
        { adminEmail: actor }
      );
      return jsonResp({ ok: true, month: m });
    }

    const winMatch = pathname.match(/^\/api\/admin2\/contest\/months\/([^/]+)\/winners$/);
    if (winMatch && method === 'PUT') {
      const m = state.months.find((x) => x.monthKey === decodeURIComponent(winMatch[1]));
      if (!m) return jsonResp({ ok: false, error: 'Month not found' }, 404);
      const body = (await request.json().catch(() => ({}))) as {
        winners?: Array<Record<string, unknown>>;
      };
      const nowIso = new Date().toISOString();
      const defaultPrizes = createDefaultContestPrizes();
      const userMap = new Map(state.users.map((u) => [u.id, u]));
      const next: ContestWinnerRecord[] = [];
      for (const item of body.winners || []) {
        const rank = Number(item.rank);
        if (![1, 2, 3, 4, 5].includes(rank)) continue;
        const entry = state.entries.find(
          (e) => e.id === String(item.entryId || '') && e.competitionMonth === m.monthKey
        );
        if (!entry) continue;
        const tier = m.prizes.find((p) => p.rank === rank) || defaultPrizes[rank - 1];
        next.push({
          rank: rank as 1 | 2 | 3 | 4 | 5,
          prizeType: rank === 5 ? 'quality' : 'views',
          prizeLabelEn: tier.labelEn,
          prizeLabelKn: tier.labelKn,
          prizeAmountInr: Number(item.prizeAmountInr) || tier.amountInr,
          entryId: entry.id,
          postId: entry.postId,
          articleSlug: entry.slug,
          articleTitle: entry.title,
          contributorName: entry.contributorName,
          contributorMobileNumber: userMap.get(entry.contributorUserId)?.mobileNumber || '',
          eligibleViews: entry.eligibleViews,
          selectionNote: cleanSingleLine(item.selectionNote, 240) || undefined,
          paymentStatus:
            item.paymentStatus === 'paid'
              ? 'paid'
              : item.paymentStatus === 'processing'
              ? 'processing'
              : 'pending',
          paymentDate: cleanSingleLine(item.paymentDate, 40) || undefined,
          paymentReference: cleanSingleLine(item.paymentReference, 120) || undefined,
          selectedAt: nowIso,
          selectedBy: actor,
        });
      }
      m.winners = next.sort((a, b) => a.rank - b.rank);
      m.updatedAt = nowIso;
      const auditLog = {
        id: makeId('caud'),
        timestamp: nowIso,
        actorEmail: actor,
        action: 'winners.save',
        competitionMonth: m.monthKey,
        details: `Saved ${m.winners.length} winner selection(s) for ${m.displayLabelEn}`,
      };
      state.auditLogs.unshift(auditLog);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestMonth: m, contestAuditLog: auditLog },
        { adminEmail: actor }
      );
      return jsonResp({ ok: true, month: m });
    }

    const finMatch = pathname.match(/^\/api\/admin2\/contest\/months\/([^/]+)\/finalize$/);
    if (finMatch && method === 'POST') {
      const m = state.months.find((x) => x.monthKey === decodeURIComponent(finMatch[1]));
      if (!m) return jsonResp({ ok: false, error: 'Competition month not found.' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const nowIso = new Date().toISOString();
      const userMap = new Map(state.users.map((u) => [u.id, u]));

      if (m.winners.length === 0) {
        const rankedPublic = rankEligibleContestEntries(
          syncMonthEntriesWithPosts(state, m.monthKey)
        );
        const defaultPrizes = createDefaultContestPrizes();
        const autoWinners: ContestWinnerRecord[] = [];
        rankedPublic.slice(0, 4).forEach((pub, idx) => {
          const rawEntry = state.entries.find((e) => e.id === pub.id);
          if (!rawEntry) return;
          const rank = (idx + 1) as 1 | 2 | 3 | 4;
          const tier = m.prizes.find((p) => p.rank === rank) || defaultPrizes[idx];
          autoWinners.push({
            rank,
            prizeType: 'views',
            prizeLabelEn: tier.labelEn,
            prizeLabelKn: tier.labelKn,
            prizeAmountInr: tier.amountInr,
            entryId: rawEntry.id,
            postId: rawEntry.postId,
            articleSlug: rawEntry.slug,
            articleTitle: rawEntry.title,
            contributorName: rawEntry.contributorName,
            contributorMobileNumber: userMap.get(rawEntry.contributorUserId)?.mobileNumber || '',
            eligibleViews: rawEntry.eligibleViews,
            paymentStatus: 'pending',
            selectedBy: actor,
            selectedAt: nowIso,
          });
        });
        m.winners = autoWinners;
      }

      m.status = 'finalized';
      m.finalizedAt = nowIso;
      m.finalizedBy = actor;
      if (typeof body.publishWinners === 'boolean') {
        m.winnersPublished = body.publishWinners;
      }
      m.updatedAt = nowIso;

      const auditLog = {
        id: makeId('caud'),
        timestamp: nowIso,
        actorEmail: actor,
        action: 'month.finalize',
        competitionMonth: m.monthKey,
        details: `Finalized ${m.displayLabelEn} winners (Publicly announced: ${
          m.winnersPublished ? 'Yes' : 'No'
        })`,
      };
      state.auditLogs.unshift(auditLog);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestMonth: m, contestAuditLog: auditLog },
        { adminEmail: actor }
      );
      return jsonResp({ ok: true, month: m });
    }

    if (pathname === '/api/admin2/contest/months/open-next' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const reqKey = cleanSingleLine(body.monthKey, 16);
      const nextKey = /^\d{4}-\d{2}$/.test(reqKey)
        ? reqKey
        : getNextIstMonthKey(state.activeMonthKey);
      const bounds = getIstMonthBounds(nextKey);
      const nowIso = new Date().toISOString();
      let closedPrev: ContestMonthRecord | undefined;
      for (const x of state.months) {
        if (x.status === 'open' && x.monthKey !== nextKey) {
          x.status = 'closed';
          x.updatedAt = nowIso;
          closedPrev = x;
        }
      }
      let nextMonth = state.months.find((x) => x.monthKey === nextKey);
      if (!nextMonth) {
        nextMonth = {
          monthKey: nextKey,
          competitionName: CONTEST_OFFICIAL_NAME,
          displayLabelEn: bounds.displayLabelEn,
          displayLabelKn: bounds.displayLabelKn,
          startsAtIso: bounds.startsAtIso,
          endsAtIso: bounds.endsAtIso,
          status: 'open',
          prizes: activeMonth.prizes,
          winners: [],
          winnersPublished: false,
          allowCarryOver: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        state.months.unshift(nextMonth);
      } else {
        nextMonth.status = 'open';
        nextMonth.updatedAt = nowIso;
      }
      state.activeMonthKey = nextKey;
      const auditLog = {
        id: makeId('caud'),
        timestamp: nowIso,
        actorEmail: actor,
        action: 'month.open_next',
        competitionMonth: nextMonth.monthKey,
        details: `Opened ${nextMonth.displayLabelEn} contest cycle`,
      };
      state.auditLogs.unshift(auditLog);
      if (closedPrev) {
        await persistSharedCommunityContestDelta(
          env,
          state,
          { contestMonth: closedPrev },
          { adminEmail: actor }
        );
      }
      await persistSharedCommunityContestDelta(
        env,
        state,
        { contestMonth: nextMonth, activeMonthKey: nextKey, contestAuditLog: auditLog },
        { adminEmail: actor }
      );
      return jsonResp({ ok: true, month: nextMonth }, 201);
    }

    if (pathname === '/api/admin2/contest/export' && method === 'GET') {
      const monthKey = (url.searchParams.get('month') || state.activeMonthKey).trim();
      const format =
        String(url.searchParams.get('format') || 'csv').toLowerCase() === 'json'
          ? 'json'
          : 'csv';
      const overview = buildAdminOverviewPayload(state, activeMonth, monthKey);
      if (format === 'json') {
        return new Response(
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              month: overview.selectedMonth,
              summary: overview.summary,
              entries: overview.entries,
              alerts: overview.alerts,
            },
            null,
            2
          ),
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="coffeenadu-contest-${overview.selectedMonth.monthKey}.json"`,
            },
          }
        );
      }

      const header = [
        'Rank',
        'Month',
        'Article Title',
        'Contributor Name',
        'Contributor Mobile (Admin Only)',
        'Location',
        'Eligibility',
        'Eligible Views',
        'Total Page Views',
        'Suspicious Blocked Views',
        'Published At',
        'Disqualification Reason',
        'Permanent URL',
      ];
      const rows = [header.map(csvEscape).join(',')];
      let rankCounter = 0;
      for (const e of overview.entries) {
        const rankLabel = e.eligibility === 'eligible' ? String(++rankCounter) : '-';
        rows.push(
          [
            rankLabel,
            e.competitionMonth,
            e.title,
            e.contributorName,
            e.contributorMobileNumber,
            e.location,
            e.eligibility,
            e.eligibleViews,
            e.totalPageViews,
            e.suspiciousBlockedViews,
            e.publishedAt,
            e.disqualificationReason || '',
            `https://coffeenadu.in/community/${e.slug}`,
          ]
            .map(csvEscape)
            .join(',')
        );
      }
      return new Response(`\uFEFF${rows.join('\n')}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="coffeenadu-contest-${overview.selectedMonth.monthKey}.csv"`,
        },
      });
    }
  }

  return null;
}
