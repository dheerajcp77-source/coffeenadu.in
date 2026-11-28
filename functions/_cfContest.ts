/**
 * Standalone Cloudflare Pages handler for /api/public/contest/* and /api/admin2/contest/*
 * Preserves canonical contest types, rolling 24h view dedupe, and strict privacy wall.
 */

import type {
  AdminContestEntryView,
  ContestAdminOverview,
  ContestAuditLogRecord,
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
  createDefaultMonthRecord,
  createInitialContestMonthRecord,
  detectSuspiciousTrafficPattern,
  getIstMonthBounds,
  getIstMonthKey,
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
} from '../src/utils/communityHelpers';

interface CfContestViewBucket {
  entryId: string;
  visitorHash: string;
  lastEligibleAtMs: number;
  hitCount: number;
}

interface CfContestState {
  activeMonthKey: string;
  months: ContestMonthRecord[];
  entries: ContestEntryRecord[];
  privateMobiles: Record<string, string>;
  viewBuckets: CfContestViewBucket[];
  alerts: ContestSuspiciousAlert[];
  auditLogs: ContestAuditLogRecord[];
}

const CF_CONTEST_CACHE_KEY = 'https://coffeenadu.internal/cf-contest-state-v1';
const VISITOR_COOKIE_NAME = 'cn_contest_vid';

let memState: CfContestState | null = null;
const burstMap = new Map<string, Array<{ ts: number; visitorHash: string }>>();
const articleHitsMap = new Map<string, number[]>();

function createEmptyState(): CfContestState {
  const initialMonth = createInitialContestMonthRecord();
  return {
    activeMonthKey: initialMonth.monthKey,
    months: [initialMonth],
    entries: [],
    privateMobiles: {},
    viewBuckets: [],
    alerts: [],
    auditLogs: [],
  };
}

async function ensureState(): Promise<CfContestState> {
  if (memState) return memState;
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      const hit = await cache.match(CF_CONTEST_CACHE_KEY);
      if (hit) {
        const parsed = (await hit.json()) as Partial<CfContestState>;
        const months =
          Array.isArray(parsed.months) && parsed.months.length > 0
            ? parsed.months
            : [createInitialContestMonthRecord()];
        memState = {
          activeMonthKey:
            typeof parsed.activeMonthKey === 'string' &&
            months.some((m) => m.monthKey === parsed.activeMonthKey)
              ? parsed.activeMonthKey
              : months[0].monthKey,
          months,
          entries: Array.isArray(parsed.entries) ? parsed.entries : [],
          privateMobiles:
            parsed.privateMobiles && typeof parsed.privateMobiles === 'object'
              ? parsed.privateMobiles
              : {},
          viewBuckets: Array.isArray(parsed.viewBuckets) ? parsed.viewBuckets : [],
          alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        };
        return memState;
      }
    }
  } catch {
    // ignore edge cache read failure
  }
  memState = createEmptyState();
  return memState;
}

async function persistState(state: CfContestState): Promise<void> {
  memState = state;
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (cache) {
      await cache.put(
        CF_CONTEST_CACHE_KEY,
        new Response(JSON.stringify(state), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      );
    }
  } catch {
    // ignore edge cache write failure
  }
}

function makeId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
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

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function jsonResp(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, must-revalidate',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function syncMonths(state: CfContestState, now = new Date()): ContestMonthRecord {
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

export async function handleCfContestApi(
  request: Request,
  url: URL,
  verifyAdmin: () => Promise<{ ok: boolean; email?: string }>
): Promise<Response | null> {
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (
    !pathname.startsWith('/api/public/contest/') &&
    !pathname.startsWith('/api/admin2/contest/')
  ) {
    return null;
  }

  const state = await ensureState();
  const activeMonth = syncMonths(state);

  if (pathname === '/api/public/contest/overview' && method === 'GET') {
    const publicEntries = rankEligibleContestEntries(
      state.entries.filter((e) => e.competitionMonth === activeMonth.monthKey)
    );
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
    const key = decodeURIComponent(entryStatsMatch[1]).toLowerCase();
    const entry = state.entries.find(
      (e) =>
        e.id.toLowerCase() === key ||
        e.postId.toLowerCase() === key ||
        e.slug.toLowerCase() === key
    );
    if (!entry) return jsonResp({ ok: false, error: 'Contest entry not found.' }, 404);
    const month = state.months.find((m) => m.monthKey === entry.competitionMonth);
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
      await persistState(state);
      return buildRes(false, 'bot_filtered');
    }

    entry.totalPageViews += 1;
    entry.lastViewedAt = now.toISOString();
    entry.updatedAt = now.toISOString();

    if (entry.eligibility !== 'eligible') {
      await persistState(state);
      return buildRes(false, 'disqualified');
    }
    if (!month || !isContestMonthOpen(month, nowMs)) {
      await persistState(state);
      return buildRes(false, 'month_closed');
    }

    const cookies = parseCookies(request);
    let cookieId = cookies[VISITOR_COOKIE_NAME];
    let setCookieHeader: string | undefined;
    if (!cookieId || !/^[a-f0-9]{24,64}$/i.test(cookieId)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      cookieId = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
      state.alerts.unshift({
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
      });
      await persistState(state);
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
      await persistState(state);
      return buildRes(false, 'duplicate_24h', setCookieHeader);
    }

    entry.eligibleViews += 1;
    if (bucket) {
      bucket.lastEligibleAtMs = nowMs;
      bucket.hitCount += 1;
    } else {
      state.viewBuckets.push(
        { entryId: entry.id, visitorHash, lastEligibleAtMs: nowMs, hitCount: 1 },
        { entryId: entry.id, visitorHash: devHash, lastEligibleAtMs: nowMs, hitCount: 1 }
      );
    }
    await persistState(state);
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
    const name = cleanSingleLine(body.contributorName, 80);
    const mobile = normalizeCommunityMobile(body.mobileNumber);
    const title = cleanSingleLine(body.title, 160);
    const description = String(body.description ?? '').trim().slice(0, 4000);
    const location = cleanSingleLine(body.location, 100);

    if (name.length < 2) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.' }, 400);
    if (!mobile) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.' }, 400);
    if (title.length < 5) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಸುದ್ದಿ ಶೀರ್ಷಿಕೆಯನ್ನು ನಮೂದಿಸಿ.' }, 400);
    if (description.length < 20) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಸುದ್ದಿಯ ವಿವರಣೆಯನ್ನು ನಮೂದಿಸಿ.' }, 400);
    if (location.length < 2) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಊರನ್ನು ಆಯ್ಕೆಮಾಡಿ.' }, 400);

    const nowIso = new Date().toISOString();
    const userId = makeId('cuser');
    const postId = makeId('cpost');
    const slug = generateCommunitySlug(title, postId.slice(-6));
    state.privateMobiles[userId] = mobile;

    const entry: ContestEntryRecord = {
      id: makeId('centry'),
      postId,
      slug,
      competitionMonth: activeMonth.monthKey,
      contributorUserId: userId,
      contributorName: name,
      title,
      summary: description.slice(0, 220),
      location,
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
    await persistState(state);

    return jsonResp(
      {
        ok: true,
        profile: {
          fullName: name,
          maskedMobile: maskMobileNumber(mobile),
          registeredAt: nowIso,
          status: 'active',
          totalPosts: 1,
        },
        post: {
          id: postId,
          slug,
          authorName: name,
          title,
          category: CONTEST_CATEGORY_ID,
          description,
          location,
          photos: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          isOwner: true,
        },
        entry: toPublicContestEntry(entry),
        permanentPath: `/community/${encodeURIComponent(slug)}`,
      },
      201
    );
  }

  if (pathname.startsWith('/api/admin2/contest/')) {
    const auth = await verifyAdmin();
    if (!auth.ok) return jsonResp({ ok: false, error: 'Unauthorized' }, 401);
    const actor = auth.email || 'admin@coffeenadu.in';

    if (pathname === '/api/admin2/contest/overview' && method === 'GET') {
      const reqMonth = url.searchParams.get('month') || activeMonth.monthKey;
      const selectedMonth =
        state.months.find((m) => m.monthKey === reqMonth) || activeMonth;
      const alerts = state.alerts.filter(
        (a) => a.competitionMonth === selectedMonth.monthKey
      );
      const entries: AdminContestEntryView[] = state.entries
        .filter((e) => e.competitionMonth === selectedMonth.monthKey)
        .map((e) => ({
          ...e,
          contributorMobileNumber: state.privateMobiles[e.contributorUserId] || '',
          postStatus: 'published',
          openAlertsCount: alerts.filter((a) => a.entryId === e.id && a.status === 'open')
            .length,
        }));
      const overview: ContestAdminOverview = {
        activeMonthKey: activeMonth.monthKey,
        months: [...state.months].sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
        selectedMonth,
        entries,
        alerts,
        auditLogs: state.auditLogs.slice(0, 100),
        summary: {
          totalEntries: entries.length,
          eligibleEntries: entries.filter((e) => e.eligibility === 'eligible').length,
          disqualifiedEntries: entries.filter((e) => e.eligibility === 'disqualified').length,
          totalPageViews: entries.reduce((s, e) => s + e.totalPageViews, 0),
          totalEligibleViews: entries.reduce((s, e) => s + e.eligibleViews, 0),
          suspiciousBlockedViews: entries.reduce((s, e) => s + e.suspiciousBlockedViews, 0),
          openAlerts: alerts.filter((a) => a.status === 'open').length,
        },
      };
      return jsonResp({ ok: true, ...overview });
    }

    const eligMatch = pathname.match(/^\/api\/admin2\/contest\/entries\/([^/]+)\/eligibility$/);
    if (eligMatch && method === 'PATCH') {
      const entry = state.entries.find((e) => e.id === decodeURIComponent(eligMatch[1]));
      if (!entry) return jsonResp({ ok: false, error: 'Not found' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const eligibility: ContestEntryEligibility =
        body.eligibility === 'disqualified' ? 'disqualified' : 'eligible';
      entry.eligibility = eligibility;
      entry.disqualificationReason =
        eligibility === 'disqualified' ? cleanSingleLine(body.reason, 240) : undefined;
      entry.updatedAt = new Date().toISOString();
      state.auditLogs.unshift({
        id: makeId('caud'),
        timestamp: new Date().toISOString(),
        actorEmail: actor,
        action: eligibility === 'disqualified' ? 'entry.disqualify' : 'entry.reinstate',
        competitionMonth: entry.competitionMonth,
        targetId: entry.id,
        details: `Updated "${entry.title}" -> ${eligibility}`,
      });
      await persistState(state);
      return jsonResp({ ok: true, entry });
    }

    const pubMatch = pathname.match(/^\/api\/admin2\/contest\/months\/([^/]+)\/publish-winners$/);
    if (pubMatch && method === 'PATCH') {
      const m = state.months.find((x) => x.monthKey === decodeURIComponent(pubMatch[1]));
      if (!m) return jsonResp({ ok: false, error: 'Month not found' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      m.winnersPublished = Boolean(body.published);
      m.updatedAt = new Date().toISOString();
      await persistState(state);
      return jsonResp({ ok: true, month: m });
    }

    const cfgMatch = pathname.match(/^\/api\/admin2\/contest\/months\/([^/]+)\/config$/);
    if (cfgMatch && method === 'PUT') {
      const m = state.months.find((x) => x.monthKey === decodeURIComponent(cfgMatch[1]));
      if (!m) return jsonResp({ ok: false, error: 'Month not found' }, 404);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      m.startsAtIso = String(body.startsAtIso || m.startsAtIso);
      m.endsAtIso = String(body.endsAtIso || m.endsAtIso);
      m.prizes = normalizeContestPrizes(body.prizes as never);
      if (['open', 'closed', 'finalized'].includes(String(body.status))) {
        m.status = body.status as ContestMonthStatus;
      }
      m.updatedAt = new Date().toISOString();
      await persistState(state);
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
      const next: ContestWinnerRecord[] = [];
      for (const item of body.winners || []) {
        const rank = Number(item.rank);
        if (![1, 2, 3, 4, 5].includes(rank)) continue;
        const entry = state.entries.find((e) => e.id === String(item.entryId || ''));
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
          contributorMobileNumber: state.privateMobiles[entry.contributorUserId] || '',
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
      await persistState(state);
      return jsonResp({ ok: true, month: m });
    }

    if (pathname === '/api/admin2/contest/months/open-next' && method === 'POST') {
      const nextKey = getNextIstMonthKey(state.activeMonthKey);
      const bounds = getIstMonthBounds(nextKey);
      const nowIso = new Date().toISOString();
      for (const x of state.months) {
        if (x.status === 'open') x.status = 'closed';
      }
      const nextMonth: ContestMonthRecord = {
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
      state.activeMonthKey = nextKey;
      await persistState(state);
      return jsonResp({ ok: true, month: nextMonth }, 201);
    }
  }

  return null;
}
