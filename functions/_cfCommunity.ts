/**
 * Standalone Cloudflare Pages handler for /api/community/* and /api/admin2/community/*
 * Shares unified Community + Contest state via _cfCommunityContestStore and persists
 * durably to Google Apps Script + Drive whenever configured.
 */

import type {
  AdminCommunityPostView,
  AdminCommunityUserSummary,
  CommunityCategoryId,
  CommunityPostRecord,
  CommunityPostStatus,
  CommunityReportRecord,
  CommunitySelfProfile,
  CommunityUserPrivate,
  CommunityUserStatus,
} from '../src/types/community';
import {
  filterCommunityPosts,
  generateCommunitySlug,
  isValidCommunityCategory,
  maskMobileNumber,
  normalizeCommunityMobile,
  toPublicCommunityPost,
} from '../src/utils/communityHelpers';
import {
  handlePostDeletedInSharedState,
  loadSharedCommunityContestState,
  persistPublicPhotosOnCf,
  persistSharedCommunityContestDelta,
  syncContestEntriesWithPost,
  type CfSharedCommunityContestState,
  type PagesEnvLike,
} from './_cfCommunityContestStore';

const SESSION_COOKIE_NAME = 'cn_community_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

function randomHex(byteCount = 16): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function jsonResp(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...extraHeaders,
    },
  });
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

async function resolveSession(
  request: Request,
  state: CfSharedCommunityContestState,
  requireCsrf = false
): Promise<{ user: CommunityUserPrivate; tokenHash: string } | null> {
  const authHeader = (request.headers.get('authorization') || '').trim();
  let token = '';
  let viaCookie = false;
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(request);
    token = (cookies[SESSION_COOKIE_NAME] || '').trim();
    viaCookie = Boolean(token);
  }
  if (!token) return null;

  if (requireCsrf && viaCookie) {
    const xrw = (request.headers.get('x-requested-with') || '').trim();
    if (xrw !== 'CoffeenaduCommunity') return null;
  }

  const hash = await sha256Hex(token);
  const now = Date.now();
  const sess = state.sessions.find((s) => s.tokenHash === hash && s.expiresAtMs > now);
  if (!sess) return null;
  const user = state.users.find((u) => u.id === sess.userId);
  if (!user) return null;
  return { user, tokenHash: hash };
}

function buildSelfProfile(
  user: CommunityUserPrivate,
  state: CfSharedCommunityContestState
): CommunitySelfProfile {
  return {
    fullName: user.fullName,
    maskedMobile: maskMobileNumber(user.mobileNumber),
    registeredAt: user.registeredAt,
    status: user.status,
    totalPosts: state.posts.filter((p) => p.authorUserId === user.id && p.status !== 'removed')
      .length,
  };
}

export async function handleCfCommunityApi(
  request: Request,
  url: URL,
  isAuthorizedAdmin: () => Promise<{ ok: boolean; email?: string }>,
  env?: PagesEnvLike
): Promise<Response | null> {
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (!pathname.startsWith('/api/community') && !pathname.startsWith('/api/admin2/community')) {
    return null;
  }

  try {
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const isAdminRoute = pathname.startsWith('/api/admin2/community');
  const state = await loadSharedCommunityContestState(env, isMutation || isAdminRoute);

  const readJson = async () => {
    try {
      return (await request.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  // ---------------- AUTH ----------------
  if (pathname === '/api/community/auth/register' && method === 'POST') {
    const body = await readJson();
    const fullName = cleanSingleLine(body.fullName, 80);
    const mobile = normalizeCommunityMobile(body.mobileNumber);
    if (fullName.length < 2) {
      return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.' }, 400);
    }
    if (!mobile) {
      return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.' }, 400);
    }

    const nowIso = new Date().toISOString();
    let user = state.users.find((u) => u.mobileNumber === mobile);
    if (user) {
      if (user.status === 'suspended') {
        return jsonResp(
          { ok: false, error: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.' },
          403
        );
      }
      user.fullName = fullName;
      user.lastActiveAt = nowIso;
    } else {
      user = {
        id: `cuser-${Date.now().toString(36)}-${randomHex(4)}`,
        fullName,
        mobileNumber: mobile,
        registeredAt: nowIso,
        lastActiveAt: nowIso,
        status: 'active',
      };
      state.users.unshift(user);
    }

    const rawToken = randomHex(32);
    const nowMs = Date.now();
    state.sessions = state.sessions.filter((s) => s.expiresAtMs > nowMs);
    const session = {
      tokenHash: await sha256Hex(rawToken),
      userId: user.id,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + SESSION_TTL_MS,
    };
    state.sessions.push(session);

    try {
      await persistSharedCommunityContestDelta(env, state, { user, session });
    } catch (err) {
      return jsonResp(
        {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'ನೋಂದಣಿ ಮಾಹಿತಿಯನ್ನು ಶಾಶ್ವತವಾಗಿ ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
        },
        502
      );
    }

    const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
    const isHttps = url.protocol === 'https:';
    const cookie = [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
      'Path=/',
      `Max-Age=${maxAgeSec}`,
      'HttpOnly',
      isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
    ].join('; ');

    return jsonResp(
      { ok: true, token: rawToken, profile: buildSelfProfile(user, state) },
      200,
      { 'Set-Cookie': cookie }
    );
  }

  if (pathname === '/api/community/auth/me' && method === 'GET') {
    const resolved = await resolveSession(request, state, false);
    if (!resolved || resolved.user.status === 'suspended') {
      return jsonResp({ ok: true, authenticated: false, profile: null });
    }
    return jsonResp({
      ok: true,
      authenticated: true,
      profile: buildSelfProfile(resolved.user, state),
    });
  }

  if (pathname === '/api/community/auth/profile' && method === 'PUT') {
    const resolved = await resolveSession(request, state, true);
    if (!resolved) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಮೊದಲು ನೋಂದಣಿ ಮಾಡಿ.' }, 401);
    const body = await readJson();
    const fullName = cleanSingleLine(body.fullName, 80);
    if (fullName.length < 2) {
      return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಸರಿಯಾದ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.' }, 400);
    }
    resolved.user.fullName = fullName;
    resolved.user.lastActiveAt = new Date().toISOString();
    const updatedPosts: CommunityPostRecord[] = [];
    const updatedEntries = [];
    for (const p of state.posts) {
      if (p.authorUserId === resolved.user.id) {
        p.authorName = fullName;
        p.updatedAt = resolved.user.lastActiveAt;
        updatedPosts.push(p);
        updatedEntries.push(...syncContestEntriesWithPost(state, p));
      }
    }
    try {
      await persistSharedCommunityContestDelta(env, state, {
        user: resolved.user,
        extraPosts: updatedPosts,
        extraContestEntries: updatedEntries,
      });
    } catch {
      return jsonResp({ ok: false, error: 'ಪ್ರೊಫೈಲ್ ನವೀಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.' }, 502);
    }
    return jsonResp({ ok: true, profile: buildSelfProfile(resolved.user, state) });
  }

  if (pathname === '/api/community/auth/logout' && method === 'POST') {
    const resolved = await resolveSession(request, state, true);
    if (resolved) {
      state.sessions = state.sessions.filter((s) => s.tokenHash !== resolved.tokenHash);
      await persistSharedCommunityContestDelta(
        env,
        state,
        { revokeSessionTokenHash: resolved.tokenHash },
        { bestEffort: true }
      );
    }
    return jsonResp({ ok: true }, 200, {
      'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly`,
    });
  }

  // ---------------- PUBLIC POSTS ----------------
  if (pathname === '/api/community/posts' && method === 'GET') {
    const resolved = await resolveSession(request, state, false);
    const viewerUserId = resolved?.user.id || null;
    const published = state.posts
      .filter((p) => p.status === 'published')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((p) => toPublicCommunityPost(p, viewerUserId));

    const filtered = filterCommunityPosts(published, {
      tab: (url.searchParams.get('tab') || 'all') as never,
      category: (url.searchParams.get('category') || 'all') as CommunityCategoryId | 'all',
      location: url.searchParams.get('location') || 'all',
      nearbyLocation: url.searchParams.get('nearby') || 'all',
      query: url.searchParams.get('q') || '',
    });
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 60), 1), 200);
    return jsonResp({ ok: true, total: filtered.length, posts: filtered.slice(0, limit) });
  }

  if (pathname === '/api/community/my-posts' && method === 'GET') {
    const resolved = await resolveSession(request, state, false);
    if (!resolved) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಮೊದಲು ನೋಂದಣಿ ಮಾಡಿ.' }, 401);
    const myPosts = state.posts
      .filter((p) => p.authorUserId === resolved.user.id && p.status !== 'removed')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((p) => ({ ...toPublicCommunityPost(p, resolved.user.id), status: p.status }));
    return jsonResp({ ok: true, posts: myPosts });
  }

  if (pathname === '/api/community/posts' && method === 'POST') {
    const resolved = await resolveSession(request, state, true);
    if (!resolved) return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಮೊದಲು ನೋಂದಣಿ ಮಾಡಿ.' }, 401);
    if (resolved.user.status === 'suspended') {
      return jsonResp({ ok: false, error: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.' }, 403);
    }

    const body = await readJson();
    const title = cleanSingleLine(body.title, 150);
    const category = body.category;
    const description = cleanMultiline(body.description, 3000);
    const location = cleanSingleLine(body.location, 100);
    const price = cleanSingleLine(body.price, 80);
    const optionalPublicContact = cleanSingleLine(body.optionalPublicContact, 80);

    if (title.length < 3 || !isValidCommunityCategory(category) || description.length < 5 || location.length < 2) {
      return jsonResp({ ok: false, error: 'ದಯವಿಟ್ಟು ಎಲ್ಲಾ ಅಗತ್ಯ ವಿವರಗಳನ್ನು ಸರಿಯಾಗಿ ಭರ್ತಿ ಮಾಡಿ.' }, 400);
    }

    const photoResult = await persistPublicPhotosOnCf(env, body.photos);
    if (!photoResult.ok) {
      return jsonResp({ ok: false, error: photoResult.error }, photoResult.storageFailure ? 502 : 400);
    }

    const nowIso = new Date().toISOString();
    const post: CommunityPostRecord = {
      id: `cpost-${Date.now().toString(36)}-${randomHex(4)}`,
      slug: generateCommunitySlug(title, randomHex(4)),
      authorUserId: resolved.user.id,
      authorName: resolved.user.fullName,
      title,
      category,
      description,
      location,
      photos: photoResult.photos,
      price: price || undefined,
      optionalPublicContact: optionalPublicContact || undefined,
      status: 'published',
      createdAt: nowIso,
      updatedAt: nowIso,
      viewsCount: 0,
      sharesCount: 0,
    };

    state.posts.unshift(post);
    resolved.user.lastActiveAt = nowIso;

    try {
      await persistSharedCommunityContestDelta(env, state, {
        user: resolved.user,
        post,
      });
    } catch {
      return jsonResp(
        {
          ok: false,
          error: 'ಮಾಹಿತಿಯನ್ನು ಶಾಶ್ವತವಾಗಿ ಉಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        },
        502
      );
    }
    return jsonResp({ ok: true, post: toPublicCommunityPost(post, resolved.user.id) }, 201);
  }

  const singlePostMatch = pathname.match(/^\/api\/community\/posts\/([^/]+)$/);
  if (singlePostMatch) {
    const key = decodeURIComponent(singlePostMatch[1]);
    if (method === 'GET') {
      const freshState = await loadSharedCommunityContestState(env, true);
      const resolved = await resolveSession(request, freshState, false);
      const post = freshState.posts.find(
        (p) =>
          p.status === 'published' &&
          (p.slug.toLowerCase() === key.toLowerCase() || p.id.toLowerCase() === key.toLowerCase())
      );
      if (!post) return jsonResp({ ok: false, error: 'ಪ್ರಕಟಣೆ ಲಭ್ಯವಿಲ್ಲ.' }, 404);
      post.viewsCount = (post.viewsCount || 0) + 1;
      await persistSharedCommunityContestDelta(env, freshState, { post }, { bestEffort: true });
      return jsonResp({ ok: true, post: toPublicCommunityPost(post, resolved?.user.id || null) });
    }

    if (method === 'PUT') {
      const resolved = await resolveSession(request, state, true);
      if (!resolved) return jsonResp({ ok: false, error: 'Unauthorized' }, 401);
      const post = state.posts.find((p) => p.id === key);
      if (!post || post.status === 'removed') return jsonResp({ ok: false, error: 'Not found' }, 404);
      if (post.authorUserId !== resolved.user.id) return jsonResp({ ok: false, error: 'Forbidden' }, 403);

      const body = await readJson();
      post.title = cleanSingleLine(body.title ?? post.title, 150);
      if (isValidCommunityCategory(body.category)) post.category = body.category;
      post.description = cleanMultiline(body.description ?? post.description, 3000);
      post.location = cleanSingleLine(body.location ?? post.location, 100);
      if (body.price !== undefined) post.price = cleanSingleLine(body.price, 80) || undefined;
      if (body.optionalPublicContact !== undefined) {
        post.optionalPublicContact = cleanSingleLine(body.optionalPublicContact, 80) || undefined;
      }
      if (body.photos !== undefined) {
        const photoResult = await persistPublicPhotosOnCf(env, body.photos);
        if (!photoResult.ok) {
          return jsonResp({ ok: false, error: photoResult.error }, photoResult.storageFailure ? 502 : 400);
        }
        post.photos = photoResult.photos;
      }
      post.updatedAt = new Date().toISOString();
      const updatedEntries = syncContestEntriesWithPost(state, post);
      try {
        await persistSharedCommunityContestDelta(env, state, {
          post,
          extraContestEntries: updatedEntries,
        });
      } catch {
        return jsonResp({ ok: false, error: 'ಪ್ರಕಟಣೆ ನವೀಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.' }, 502);
      }
      return jsonResp({ ok: true, post: toPublicCommunityPost(post, resolved.user.id) });
    }

    if (method === 'DELETE') {
      const resolved = await resolveSession(request, state, true);
      if (!resolved) return jsonResp({ ok: false, error: 'Unauthorized' }, 401);
      const idx = state.posts.findIndex((p) => p.id === key);
      if (idx === -1) return jsonResp({ ok: false, error: 'Not found' }, 404);
      if (state.posts[idx].authorUserId !== resolved.user.id) {
        return jsonResp({ ok: false, error: 'Forbidden' }, 403);
      }
      const deletedId = state.posts[idx].id;
      state.posts.splice(idx, 1);
      const syncRes = handlePostDeletedInSharedState(state, deletedId);
      try {
        await persistSharedCommunityContestDelta(env, state, {
          deletePostId: deletedId,
          deleteContestEntryByPostId: syncRes.deletedByPostId,
          extraContestEntries: syncRes.updatedEntries,
        });
      } catch {
        return jsonResp({ ok: false, error: 'ಪ್ರಕಟಣೆ ಅಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.' }, 502);
      }
      return jsonResp({ ok: true });
    }
  }

  const shareMatch = pathname.match(/^\/api\/community\/posts\/([^/]+)\/share$/);
  if (shareMatch && method === 'POST') {
    const key = decodeURIComponent(shareMatch[1]);
    const post = state.posts.find((p) => p.id === key || p.slug === key);
    if (post && post.status === 'published') {
      post.sharesCount = (post.sharesCount || 0) + 1;
      await persistSharedCommunityContestDelta(env, state, { post }, { bestEffort: true });
    }
    return jsonResp({ ok: true });
  }

  const reportMatch = pathname.match(/^\/api\/community\/posts\/([^/]+)\/report$/);
  if (reportMatch && method === 'POST') {
    const key = decodeURIComponent(reportMatch[1]);
    const post = state.posts.find((p) => p.id === key || p.slug === key);
    if (!post) return jsonResp({ ok: false, error: 'Not found' }, 404);
    const body = await readJson();
    const reason = cleanSingleLine(body.reason, 180);
    if (!reason) return jsonResp({ ok: false, error: 'Reason required.' }, 400);
    const rep: CommunityReportRecord = {
      id: `crep-${Date.now().toString(36)}-${randomHex(4)}`,
      postId: post.id,
      postTitle: post.title,
      reason,
      details: cleanMultiline(body.details, 800) || undefined,
      createdAt: new Date().toISOString(),
      status: 'open',
    };
    state.reports.unshift(rep);
    try {
      await persistSharedCommunityContestDelta(env, state, { report: rep });
    } catch {
      return jsonResp({ ok: false, error: 'ವರದಿ ಸಲ್ಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.' }, 502);
    }
    return jsonResp({ ok: true, id: rep.id }, 201);
  }

  // ---------------- ADMIN-ONLY ENDPOINTS ----------------
  if (isAdminRoute) {
    const admin = await isAuthorizedAdmin();
    if (!admin.ok) {
      return jsonResp({ ok: false, error: 'Admin authorization required.' }, 401);
    }
    const adminEmail = admin.email || 'admin@coffeenadu.in';

    if (pathname === '/api/admin2/community/users' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const statusFilter = (url.searchParams.get('status') || 'all').trim();
      const users: AdminCommunityUserSummary[] = state.users
        .map((u) => {
          const ups = state.posts.filter((p) => p.authorUserId === u.id);
          return {
            id: u.id,
            fullName: u.fullName,
            mobileNumber: u.mobileNumber,
            registeredAt: u.registeredAt,
            lastActiveAt: u.lastActiveAt,
            status: u.status,
            suspendedReason: u.suspendedReason,
            totalPosts: ups.length,
            publishedPosts: ups.filter((p) => p.status === 'published').length,
            hiddenPosts: ups.filter((p) => p.status !== 'published').length,
          };
        })
        .filter((u) => {
          if (statusFilter !== 'all' && u.status !== statusFilter) return false;
          if (q) return u.fullName.toLowerCase().includes(q) || u.mobileNumber.includes(q);
          return true;
        });
      return jsonResp({
        ok: true,
        users,
        totals: {
          totalUsers: state.users.length,
          activeUsers: state.users.filter((u) => u.status === 'active').length,
          suspendedUsers: state.users.filter((u) => u.status === 'suspended').length,
          totalPosts: state.posts.length,
          publishedPosts: state.posts.filter((p) => p.status === 'published').length,
          openReports: state.reports.filter((r) => r.status === 'open').length,
        },
      });
    }

    const userPostsMatch = pathname.match(/^\/api\/admin2\/community\/users\/([^/]+)\/posts$/);
    if (userPostsMatch && method === 'GET') {
      const user = state.users.find((u) => u.id === decodeURIComponent(userPostsMatch[1]));
      if (!user) return jsonResp({ ok: false, error: 'User not found' }, 404);
      const posts: AdminCommunityPostView[] = state.posts
        .filter((p) => p.authorUserId === user.id)
        .map((p) => ({
          ...p,
          authorMobileNumber: user.mobileNumber,
          openReportsCount: state.reports.filter((r) => r.postId === p.id && r.status === 'open')
            .length,
        }));
      return jsonResp({ ok: true, user, posts });
    }

    const userStatusMatch = pathname.match(/^\/api\/admin2\/community\/users\/([^/]+)\/status$/);
    if (userStatusMatch && method === 'PATCH') {
      const user = state.users.find((u) => u.id === decodeURIComponent(userStatusMatch[1]));
      if (!user) return jsonResp({ ok: false, error: 'User not found' }, 404);
      const body = await readJson();
      const nextStatus: CommunityUserStatus = body.status === 'suspended' ? 'suspended' : 'active';
      user.status = nextStatus;
      user.suspendedReason =
        nextStatus === 'suspended' ? cleanSingleLine(body.reason, 200) || undefined : undefined;
      if (nextStatus === 'suspended') {
        state.sessions = state.sessions.filter((s) => s.userId !== user.id);
      }
      try {
        await persistSharedCommunityContestDelta(
          env,
          state,
          {
            user,
            revokeSessionsForUserId: nextStatus === 'suspended' ? user.id : undefined,
          },
          { adminEmail }
        );
      } catch (err) {
        return jsonResp(
          { ok: false, error: err instanceof Error ? err.message : 'Failed to update user status.' },
          502
        );
      }
      return jsonResp({ ok: true, user });
    }

    if (pathname === '/api/admin2/community/posts' && method === 'GET') {
      const userMap = new Map(state.users.map((u) => [u.id, u]));
      const posts: AdminCommunityPostView[] = state.posts.map((p) => ({
        ...p,
        authorMobileNumber: userMap.get(p.authorUserId)?.mobileNumber || '',
        openReportsCount: state.reports.filter((r) => r.postId === p.id && r.status === 'open')
          .length,
      }));
      return jsonResp({ ok: true, posts });
    }

    const postStatusMatch = pathname.match(/^\/api\/admin2\/community\/posts\/([^/]+)\/status$/);
    if (postStatusMatch && method === 'PATCH') {
      const post = state.posts.find((p) => p.id === decodeURIComponent(postStatusMatch[1]));
      if (!post) return jsonResp({ ok: false, error: 'Post not found' }, 404);
      const body = await readJson();
      const allowed: CommunityPostStatus[] = ['published', 'hidden', 'removed'];
      post.status = allowed.includes(body.status as CommunityPostStatus)
        ? (body.status as CommunityPostStatus)
        : 'published';
      post.hiddenReason =
        post.status !== 'published' ? cleanSingleLine(body.reason, 200) || undefined : undefined;
      post.updatedAt = new Date().toISOString();
      const updatedEntries = syncContestEntriesWithPost(state, post);
      try {
        await persistSharedCommunityContestDelta(
          env,
          state,
          {
            post,
            extraContestEntries: updatedEntries,
          },
          { adminEmail }
        );
      } catch (err) {
        return jsonResp(
          { ok: false, error: err instanceof Error ? err.message : 'Failed to update post status.' },
          502
        );
      }
      return jsonResp({ ok: true, post });
    }

    const adminPostDel = pathname.match(/^\/api\/admin2\/community\/posts\/([^/]+)$/);
    if (adminPostDel && method === 'DELETE') {
      const idx = state.posts.findIndex((p) => p.id === decodeURIComponent(adminPostDel[1]));
      if (idx === -1) return jsonResp({ ok: false, error: 'Post not found' }, 404);
      const deletedId = state.posts[idx].id;
      state.posts.splice(idx, 1);
      const syncRes = handlePostDeletedInSharedState(state, deletedId);
      try {
        await persistSharedCommunityContestDelta(
          env,
          state,
          {
            deletePostId: deletedId,
            deleteContestEntryByPostId: syncRes.deletedByPostId,
            extraContestEntries: syncRes.updatedEntries,
          },
          { adminEmail }
        );
      } catch (err) {
        return jsonResp(
          { ok: false, error: err instanceof Error ? err.message : 'Failed to delete post.' },
          502
        );
      }
      return jsonResp({ ok: true });
    }

    if (pathname === '/api/admin2/community/reports' && method === 'GET') {
      return jsonResp({ ok: true, reports: state.reports });
    }

    const repPatch = pathname.match(/^\/api\/admin2\/community\/reports\/([^/]+)$/);
    if (repPatch && method === 'PATCH') {
      const rep = state.reports.find((r) => r.id === decodeURIComponent(repPatch[1]));
      if (!rep) return jsonResp({ ok: false, error: 'Report not found' }, 404);
      const body = await readJson();
      rep.status = body.status === 'dismissed' ? 'dismissed' : 'resolved';
      rep.resolvedAt = new Date().toISOString();
      rep.resolvedBy = adminEmail;
      try {
        await persistSharedCommunityContestDelta(env, state, { report: rep }, { adminEmail });
      } catch (err) {
        return jsonResp(
          { ok: false, error: err instanceof Error ? err.message : 'Failed to update report.' },
          502
        );
      }
      return jsonResp({ ok: true, report: rep });
    }

    if (pathname === '/api/admin2/community/export' && method === 'GET') {
      return new Response(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            users: state.users,
            posts: state.posts,
            reports: state.reports,
          },
          null,
          2
        ),
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="coffeenadu-community-backup-${new Date().toISOString().slice(0, 10)}.json"`,
          },
        }
      );
    }
  }

  return null;
  } catch (err) {
    console.error('[CF Community API] Unhandled exception:', err);
    return jsonResp(
      {
        ok: false,
        error:
          err instanceof Error && err.message
            ? err.message
            : 'ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯೆ ದೋಷ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      },
      500
    );
  }
}
