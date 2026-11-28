import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { AdminPermission } from '../types/admin2.ts';
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
} from '../types/community.ts';
import {
  MAX_COMMUNITY_PHOTOS,
  filterCommunityPosts,
  generateCommunitySlug,
  isValidCommunityCategory,
  maskMobileNumber,
  normalizeCommunityMobile,
  toPublicCommunityPost,
  validateCommunityPhotoInput,
} from '../utils/communityHelpers.ts';
import type { Admin2Request } from './admin2Backend.ts';

interface CommunitySessionRecord {
  tokenHash: string;
  userId: string;
  createdAtMs: number;
  expiresAtMs: number;
}

interface CommunityStoreState {
  version: number;
  users: CommunityUserPrivate[];
  sessions: CommunitySessionRecord[];
  posts: CommunityPostRecord[];
  reports: CommunityReportRecord[];
}

const SESSION_COOKIE_NAME = 'cn_community_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || '127.0.0.1';
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      result[k] = decodeURIComponent(v);
    } catch {
      result[k] = v;
    }
  }
  return result;
}

function hasValidImageMagicBytes(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  if (mime === 'image/webp') {
    return (
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}

export class CommunityBackend {
  private readonly storePath: string;
  private readonly backupPath: string;
  private readonly uploadsDir: string;
  private state: CommunityStoreState;
  private readonly rateBuckets = new Map<string, number[]>();
  private readonly postDeletedListeners: Array<(postId: string) => void> = [];

  constructor(
    dataDir: string,
    private readonly authFactory: (perm?: AdminPermission) => RequestHandler
  ) {
    this.storePath = path.join(dataDir, 'community-store.json');
    this.backupPath = path.join(dataDir, 'community-store.backup.json');
    this.uploadsDir = path.resolve(dataDir, 'community-uploads');
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.state = this.loadState();
  }

  private createDefaultState(): CommunityStoreState {
    return {
      version: 1,
      users: [],
      sessions: [],
      posts: [],
      reports: [],
    };
  }

  private loadState(): CommunityStoreState {
    const tryRead = (filePath: string): CommunityStoreState | null => {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CommunityStoreState>;
      const defaults = this.createDefaultState();
      return {
        version: 1,
        users: Array.isArray(parsed.users) ? parsed.users : defaults.users,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : defaults.sessions,
        posts: Array.isArray(parsed.posts) ? parsed.posts : defaults.posts,
        reports: Array.isArray(parsed.reports) ? parsed.reports : defaults.reports,
      };
    };

    try {
      const primary = tryRead(this.storePath);
      if (primary) return primary;
    } catch {
      // Fallback to rotating backup if primary is unreadable
    }
    try {
      const backup = tryRead(this.backupPath);
      if (backup) return backup;
    } catch {
      // Fall through to clean state
    }
    return this.createDefaultState();
  }

  private persistState(): void {
    const dir = path.dirname(this.storePath);
    fs.mkdirSync(dir, { recursive: true });
    const serialized = JSON.stringify(this.state, null, 2);

    // Keep rotating backup of last known good state
    if (fs.existsSync(this.storePath)) {
      try {
        fs.copyFileSync(this.storePath, this.backupPath);
      } catch {
        // Non-fatal backup copy error
      }
    }

    const tmp = `${this.storePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, serialized, 'utf8');
    fs.renameSync(tmp, this.storePath);
  }

  public onPostDeleted(listener: (postId: string) => void): void {
    this.postDeletedListeners.push(listener);
  }

  private emitPostDeleted(postId: string): void {
    for (const listener of this.postDeletedListeners) {
      try {
        listener(postId);
      } catch {
        // Non-fatal listener error
      }
    }
  }

  private checkRateLimit(bucketKey: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const list = (this.rateBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
    if (list.length >= maxRequests) {
      this.rateBuckets.set(bucketKey, list);
      return false;
    }
    list.push(now);
    this.rateBuckets.set(bucketKey, list);
    return true;
  }

  private isSecureRequest(req: Request): boolean {
    const fwdProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
    return req.secure || fwdProto.includes('https');
  }

  private setSessionCookie(req: Request, res: Response, rawToken: string): void {
    const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
    const secure = this.isSecureRequest(req);
    const cookieParts = [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
      'Path=/',
      `Max-Age=${maxAgeSec}`,
      'HttpOnly',
      secure ? 'SameSite=None' : 'SameSite=Lax',
    ];
    if (secure) {
      cookieParts.push('Secure', 'Partitioned');
    }
    res.setHeader('Set-Cookie', cookieParts.join('; '));
  }

  private clearSessionCookie(req: Request, res: Response): void {
    const secure = this.isSecureRequest(req);
    const cookieParts = [
      `${SESSION_COOKIE_NAME}=`,
      'Path=/',
      'Max-Age=0',
      'HttpOnly',
      secure ? 'SameSite=None' : 'SameSite=Lax',
    ];
    if (secure) {
      cookieParts.push('Secure', 'Partitioned');
    }
    res.setHeader('Set-Cookie', cookieParts.join('; '));
  }

  private extractRawToken(req: Request): { token: string | null; viaCookie: boolean } {
    const authHeader = String(req.headers.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const t = authHeader.slice(7).trim();
      if (t) return { token: t, viaCookie: false };
    }
    const cookies = parseCookies(req);
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    if (cookieToken && cookieToken.trim()) {
      return { token: cookieToken.trim(), viaCookie: true };
    }
    return { token: null, viaCookie: false };
  }

  private verifyCsrfIfCookieAuth(req: Request, viaCookie: boolean): boolean {
    if (!viaCookie) return true;
    const xrw = String(req.headers['x-requested-with'] || '').trim();
    if (xrw === 'CoffeenaduCommunity') return true;
    const origin = String(req.headers.origin || '').trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    if (origin && host) {
      try {
        return new URL(origin).host === host;
      } catch {
        return false;
      }
    }
    return false;
  }

  private resolveSessionUser(
    req: Request,
    requireMutationCsrf = false
  ): { user: CommunityUserPrivate; tokenHash: string } | null {
    const { token, viaCookie } = this.extractRawToken(req);
    if (!token) return null;
    if (requireMutationCsrf && !this.verifyCsrfIfCookieAuth(req, viaCookie)) {
      return null;
    }

    const hash = sha256(token);
    const now = Date.now();
    const session = this.state.sessions.find((s) => s.tokenHash === hash && s.expiresAtMs > now);
    if (!session) return null;

    const user = this.state.users.find((u) => u.id === session.userId);
    if (!user) return null;

    return { user, tokenHash: hash };
  }

  private buildSelfProfile(user: CommunityUserPrivate): CommunitySelfProfile {
    const totalPosts = this.state.posts.filter(
      (p) => p.authorUserId === user.id && p.status !== 'removed'
    ).length;
    return {
      fullName: user.fullName,
      maskedMobile: maskMobileNumber(user.mobileNumber),
      registeredAt: user.registeredAt,
      status: user.status,
      totalPosts,
    };
  }

  private processUploadedPhotos(rawPhotos: unknown): { ok: boolean; photos: string[]; error?: string } {
    if (!Array.isArray(rawPhotos) || rawPhotos.length === 0) {
      return { ok: true, photos: [] };
    }
    if (rawPhotos.length > MAX_COMMUNITY_PHOTOS) {
      return {
        ok: false,
        photos: [],
        error: `ಗರಿಷ್ಠ ${MAX_COMMUNITY_PHOTOS} ಫೋಟೋಗಳನ್ನು ಮಾತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಬಹುದು.`,
      };
    }

    const savedUrls: string[] = [];
    for (const item of rawPhotos) {
      const check = validateCommunityPhotoInput(item);
      if (!check.ok) {
        return { ok: false, photos: [], error: check.error || 'ಅಮಾನ್ಯ ಫೋಟೋ ಫೈಲ್.' };
      }

      if (check.kind === 'existing-media') {
        savedUrls.push(String(item).trim());
        continue;
      }

      if (check.kind === 'data-url' && check.base64Body && check.mime && check.ext) {
        const buffer = Buffer.from(check.base64Body, 'base64');
        if (!hasValidImageMagicBytes(buffer, check.mime)) {
          return {
            ok: false,
            photos: [],
            error: 'ದಯವಿಟ್ಟು ಸರಿಯಾದ JPG, PNG ಅಥವಾ WebP ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.',
          };
        }

        const filename = `cm_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}.${check.ext}`;
        const resolvedPath = path.resolve(this.uploadsDir, filename);
        if (!resolvedPath.startsWith(this.uploadsDir + path.sep)) {
          return { ok: false, photos: [], error: 'Invalid file destination.' };
        }
        fs.writeFileSync(resolvedPath, buffer);
        savedUrls.push(`/api/community/media/${filename}`);
      }
    }

    return { ok: true, photos: savedUrls };
  }

  private cleanupUnusedMedia(urlsToCheck: string[]): void {
    const referenced = new Set<string>();
    for (const post of this.state.posts) {
      for (const p of post.photos) referenced.add(p);
    }
    for (const url of urlsToCheck) {
      if (referenced.has(url)) continue;
      const m = url.match(/^\/api\/community\/media\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))$/);
      if (!m) continue;
      const resolved = path.resolve(this.uploadsDir, m[1]);
      if (resolved.startsWith(this.uploadsDir + path.sep) && fs.existsSync(resolved)) {
        try {
          fs.unlinkSync(resolved);
        } catch {
          // Non-fatal cleanup error
        }
      }
    }
  }

  /**
   * Used by server-side OG metadata injection for permanent `/community/:slug` links.
   */
  public getPublicPostBySlugOrId(slugOrId: string) {
    const key = String(slugOrId || '').trim().toLowerCase();
    if (!key) return null;
    const found = this.state.posts.find(
      (p) =>
        p.status === 'published' &&
        (p.slug.toLowerCase() === key || p.id.toLowerCase() === key)
    );
    return found ? toPublicCommunityPost(found, null) : null;
  }

  /**
   * Internal admin-only lookup used by ContestBackend to show contributor mobile numbers
   * exclusively inside the Admin Dashboard (never on public APIs).
   */
  public getPrivateMobileByUserId(userId: string): string {
    const user = this.state.users.find((u) => u.id === userId);
    return user?.mobileNumber || '';
  }

  /**
   * Internal lookup used by ContestBackend to resolve published/hidden contest posts.
   */
  public getInternalPostByIdOrSlug(idOrSlug: string): CommunityPostRecord | null {
    const key = String(idOrSlug || '').trim().toLowerCase();
    if (!key) return null;
    return (
      this.state.posts.find(
        (p) => p.id.toLowerCase() === key || p.slug.toLowerCase() === key
      ) || null
    );
  }

  /**
   * Keeps the existing CommunityPostRecord view count aligned when contest views increment.
   */
  public syncContestPostTotalViews(postId: string, totalViews: number): void {
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return;
    if (totalViews > (post.viewsCount || 0)) {
      post.viewsCount = totalViews;
      this.persistState();
    }
  }

  /**
   * Reuses the EXISTING community registration/session pipeline (Full Name + Mobile Number,
   * NO OTP, NO fee) for Monthly News Contest contributors.
   */
  public resolveOrRegisterContestContributor(
    req: Request,
    res: Response,
    input: { fullName?: unknown; mobileNumber?: unknown; switchContributor?: boolean }
  ):
    | {
        ok: true;
        user: CommunityUserPrivate;
        token: string | null;
        profile: CommunitySelfProfile;
      }
    | { ok: false; status: number; error: string } {
    const existingSession =
      input.switchContributor === true ? null : this.resolveSessionUser(req, false);
    const providedName = cleanSingleLine(input.fullName, 80);
    const providedMobile = normalizeCommunityMobile(input.mobileNumber);

    if (
      existingSession &&
      (!providedMobile || providedMobile === existingSession.user.mobileNumber)
    ) {
      if (existingSession.user.status === 'suspended') {
        return {
          ok: false,
          status: 403,
          error:
            'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. ಹೆಚ್ಚಿನ ಮಾಹಿತಿಗಾಗಿ ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ಸಂಪರ್ಕಿಸಿ.',
        };
      }
      if (providedName.length >= 2) {
        existingSession.user.fullName = providedName;
      }
      existingSession.user.lastActiveAt = new Date().toISOString();
      this.persistState();
      return {
        ok: true,
        user: existingSession.user,
        token: null,
        profile: this.buildSelfProfile(existingSession.user),
      };
    }

    const ip = getClientIp(req);
    if (!this.checkRateLimit(`creg:${ip}`, 30, 60 * 60 * 1000)) {
      return {
        ok: false,
        status: 429,
        error: 'ದಯವಿಟ್ಟು ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      };
    }

    if (providedName.length < 2) {
      return {
        ok: false,
        status: 400,
        error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 2 ಅಕ್ಷರಗಳು).',
      };
    }
    if (!providedMobile) {
      return {
        ok: false,
        status: 400,
        error: 'ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ (ಬಹುಮಾನ ಸಂಪರ್ಕಕ್ಕಾಗಿ ಅಗತ್ಯ).',
      };
    }

    const nowIso = new Date().toISOString();
    let user = this.state.users.find((u) => u.mobileNumber === providedMobile);
    if (user) {
      if (user.status === 'suspended') {
        return {
          ok: false,
          status: 403,
          error:
            'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. ಹೆಚ್ಚಿನ ಮಾಹಿತಿಗಾಗಿ ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ಸಂಪರ್ಕಿಸಿ.',
        };
      }
      user.fullName = providedName;
      user.lastActiveAt = nowIso;
    } else {
      user = {
        id: makeId('cuser'),
        fullName: providedName,
        mobileNumber: providedMobile,
        registeredAt: nowIso,
        lastActiveAt: nowIso,
        status: 'active',
      };
      this.state.users.unshift(user);
    }

    const nowMs = Date.now();
    this.state.sessions = this.state.sessions.filter((s) => s.expiresAtMs > nowMs);
    const userSessions = this.state.sessions.filter((s) => s.userId === user.id);
    if (userSessions.length >= 5) {
      const oldest = userSessions.sort((a, b) => a.createdAtMs - b.createdAtMs)[0];
      this.state.sessions = this.state.sessions.filter((s) => s.tokenHash !== oldest.tokenHash);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    this.state.sessions.push({
      tokenHash: sha256(rawToken),
      userId: user.id,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + SESSION_TTL_MS,
    });

    this.persistState();
    this.setSessionCookie(req, res, rawToken);

    return {
      ok: true,
      user,
      token: rawToken,
      profile: this.buildSelfProfile(user),
    };
  }

  /**
   * Publishes a Monthly News Contest article directly through the existing community
   * publishing store under the dedicated `monthly-news-contest` category.
   */
  public createContestPostInternal(
    req: Request,
    user: CommunityUserPrivate,
    input: {
      title: unknown;
      description: unknown;
      location: unknown;
      photos?: unknown;
      contributorName?: unknown;
    }
  ):
    | {
        ok: true;
        post: CommunityPostRecord;
        publicPost: ReturnType<typeof toPublicCommunityPost>;
        duplicatePrevented?: boolean;
      }
    | { ok: false; status: number; error: string } {
    const ip = getClientIp(req);
    if (!this.checkRateLimit(`cpost:${user.id}:${ip}`, 20, 60 * 60 * 1000)) {
      return {
        ok: false,
        status: 429,
        error: 'ಒಂದು ಗಂಟೆಯಲ್ಲಿ ಗರಿಷ್ಠ ಮಿತಿ ತಲುಪಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.',
      };
    }

    const title = cleanSingleLine(input.title, 160);
    const description = cleanMultiline(input.description, 4000);
    const location = cleanSingleLine(input.location, 100);
    const providedAuthorName = cleanSingleLine(input.contributorName, 80);

    if (title.length < 5) {
      return {
        ok: false,
        status: 400,
        error: 'ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾದ ಸುದ್ದಿ ಶೀರ್ಷಿಕೆಯನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 5 ಅಕ್ಷರಗಳು).',
      };
    }
    if (description.length < 20) {
      return {
        ok: false,
        status: 400,
        error: 'ದಯವಿಟ್ಟು ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಯ ವಿವರಣೆಯನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 20 ಅಕ್ಷರಗಳು).',
      };
    }
    if (location.length < 2) {
      return {
        ok: false,
        status: 400,
        error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಊರು / ಸ್ಥಳವನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
      };
    }

    const nowMs = Date.now();
    const duplicate = this.state.posts.find(
      (p) =>
        p.authorUserId === user.id &&
        p.category === 'monthly-news-contest' &&
        p.title.toLowerCase() === title.toLowerCase() &&
        nowMs - Date.parse(p.createdAt) < 60_000
    );
    if (duplicate) {
      return {
        ok: true,
        duplicatePrevented: true,
        post: duplicate,
        publicPost: toPublicCommunityPost(duplicate, user.id),
      };
    }

    const photoResult = this.processUploadedPhotos(input.photos);
    if (!photoResult.ok) {
      return {
        ok: false,
        status: 400,
        error: photoResult.error || 'ಅಮಾನ್ಯ ಫೋಟೋ ಫೈಲ್.',
      };
    }

    const nowIso = new Date().toISOString();
    const id = makeId('cpost');
    const uniqueToken = crypto.randomBytes(4).toString('hex');
    const slug = generateCommunitySlug(title, uniqueToken);

    const newPost: CommunityPostRecord = {
      id,
      slug,
      authorUserId: user.id,
      authorName: providedAuthorName.length >= 2 ? providedAuthorName : user.fullName,
      title,
      category: 'monthly-news-contest',
      description,
      location,
      photos: photoResult.photos,
      status: 'published',
      createdAt: nowIso,
      updatedAt: nowIso,
      viewsCount: 0,
      sharesCount: 0,
    };

    this.state.posts.unshift(newPost);
    user.lastActiveAt = nowIso;
    this.persistState();

    return {
      ok: true,
      post: newPost,
      publicPost: toPublicCommunityPost(newPost, user.id),
    };
  }

  public mountRoutes(app: Express): void {
    // -------------------------------------------------------------------------
    // PUBLIC MEDIA SERVING (strictly confined to community-uploads/)
    // -------------------------------------------------------------------------
    app.get('/api/community/media/:filename', (req, res) => {
      const filename = String(req.params.filename || '').trim();
      if (!/^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(filename)) {
        res.status(400).json({ ok: false, error: 'Invalid media filename.' });
        return;
      }
      const resolved = path.resolve(this.uploadsDir, filename);
      if (!resolved.startsWith(this.uploadsDir + path.sep) || !fs.existsSync(resolved)) {
        res.status(404).json({ ok: false, error: 'Photo not found.' });
        return;
      }
      const ext = path.extname(filename).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      fs.createReadStream(resolved).pipe(res);
    });

    // -------------------------------------------------------------------------
    // SIMPLE USER REGISTRATION & SESSION (Full Name + Mobile Number, NO OTP)
    // -------------------------------------------------------------------------
    app.post('/api/community/auth/register', (req, res) => {
      const ip = getClientIp(req);
      if (!this.checkRateLimit(`creg:${ip}`, 30, 60 * 60 * 1000)) {
        res.status(429).json({
          ok: false,
          error: 'ದಯವಿಟ್ಟು ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        });
        return;
      }

      const fullName = cleanSingleLine(req.body?.fullName, 80);
      const mobile = normalizeCommunityMobile(req.body?.mobileNumber);

      if (fullName.length < 2) {
        res.status(400).json({
          ok: false,
          error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 2 ಅಕ್ಷರಗಳು).',
        });
        return;
      }
      if (!mobile) {
        res.status(400).json({
          ok: false,
          error: 'ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.',
        });
        return;
      }

      const nowIso = new Date().toISOString();
      let user = this.state.users.find((u) => u.mobileNumber === mobile);

      if (user) {
        if (user.status === 'suspended') {
          res.status(403).json({
            ok: false,
            error:
              'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. ಹೆಚ್ಚಿನ ಮಾಹಿತಿಗಾಗಿ ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ಸಂಪರ್ಕಿಸಿ.',
          });
          return;
        }
        user.fullName = fullName;
        user.lastActiveAt = nowIso;
      } else {
        user = {
          id: makeId('cuser'),
          fullName,
          mobileNumber: mobile,
          registeredAt: nowIso,
          lastActiveAt: nowIso,
          status: 'active',
        };
        this.state.users.unshift(user);
      }

      // Prune expired sessions and limit to 5 active sessions per user
      const nowMs = Date.now();
      this.state.sessions = this.state.sessions.filter((s) => s.expiresAtMs > nowMs);
      const userSessions = this.state.sessions.filter((s) => s.userId === user.id);
      if (userSessions.length >= 5) {
        const oldest = userSessions.sort((a, b) => a.createdAtMs - b.createdAtMs)[0];
        this.state.sessions = this.state.sessions.filter((s) => s.tokenHash !== oldest.tokenHash);
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      this.state.sessions.push({
        tokenHash: sha256(rawToken),
        userId: user.id,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + SESSION_TTL_MS,
      });

      this.persistState();
      this.setSessionCookie(req, res, rawToken);

      res.json({
        ok: true,
        token: rawToken,
        profile: this.buildSelfProfile(user),
      });
    });

    app.get('/api/community/auth/me', (req, res) => {
      const resolved = this.resolveSessionUser(req, false);
      if (!resolved) {
        res.json({ ok: true, authenticated: false, profile: null });
        return;
      }
      if (resolved.user.status === 'suspended') {
        res.json({ ok: true, authenticated: false, suspended: true, profile: null });
        return;
      }
      res.json({
        ok: true,
        authenticated: true,
        profile: this.buildSelfProfile(resolved.user),
      });
    });

    app.put('/api/community/auth/profile', (req, res) => {
      const resolved = this.resolveSessionUser(req, true);
      if (!resolved) {
        res.status(401).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಮೊದಲು ನೋಂದಣಿ ಮಾಡಿ.' });
        return;
      }
      const fullName = cleanSingleLine(req.body?.fullName, 80);
      if (fullName.length < 2) {
        res.status(400).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಸರಿಯಾದ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.' });
        return;
      }

      resolved.user.fullName = fullName;
      resolved.user.lastActiveAt = new Date().toISOString();

      // Update contributor display name across their posts
      for (const post of this.state.posts) {
        if (post.authorUserId === resolved.user.id) {
          post.authorName = fullName;
        }
      }

      this.persistState();
      res.json({ ok: true, profile: this.buildSelfProfile(resolved.user) });
    });

    app.post('/api/community/auth/logout', (req, res) => {
      const resolved = this.resolveSessionUser(req, true);
      if (resolved) {
        this.state.sessions = this.state.sessions.filter(
          (s) => s.tokenHash !== resolved.tokenHash
        );
        this.persistState();
      }
      this.clearSessionCookie(req, res);
      res.json({ ok: true });
    });

    // -------------------------------------------------------------------------
    // PUBLIC COMMUNITY FEED & SINGLE PERMANENT POST ROUTE (STRICT PRIVACY WALL)
    // -------------------------------------------------------------------------
    app.get('/api/community/posts', (req, res) => {
      const resolved = this.resolveSessionUser(req, false);
      const viewerUserId = resolved?.user.id || null;

      const published = this.state.posts
        .filter((p) => p.status === 'published')
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((p) => toPublicCommunityPost(p, viewerUserId));

      const filtered = filterCommunityPosts(published, {
        tab: (req.query.tab ? String(req.query.tab) : 'all') as never,
        category: (req.query.category ? String(req.query.category) : 'all') as
          | CommunityCategoryId
          | 'all',
        location: req.query.location ? String(req.query.location) : 'all',
        nearbyLocation: req.query.nearby ? String(req.query.nearby) : 'all',
        query: req.query.q ? String(req.query.q) : '',
      });

      const limit = Math.min(Math.max(Number(req.query.limit || 60), 1), 200);
      res.json({
        ok: true,
        total: filtered.length,
        posts: filtered.slice(0, limit),
      });
    });

    app.get('/api/community/posts/:slugOrId', (req, res) => {
      const key = String(req.params.slugOrId || '').trim().toLowerCase();
      const resolved = this.resolveSessionUser(req, false);
      const viewerUserId = resolved?.user.id || null;

      const post = this.state.posts.find(
        (p) =>
          p.status === 'published' &&
          (p.slug.toLowerCase() === key || p.id.toLowerCase() === key)
      );
      if (!post) {
        res.status(404).json({ ok: false, error: 'ಈ ಸಮುದಾಯ ಪ್ರಕಟಣೆ ಲಭ್ಯವಿಲ್ಲ.' });
        return;
      }

      post.viewsCount = (post.viewsCount || 0) + 1;
      this.persistState();

      res.json({
        ok: true,
        post: toPublicCommunityPost(post, viewerUserId),
      });
    });

    app.post('/api/community/posts/:id/share', (req, res) => {
      const post = this.state.posts.find(
        (p) => p.id === req.params.id || p.slug === req.params.id
      );
      if (post && post.status === 'published') {
        post.sharesCount = (post.sharesCount || 0) + 1;
        this.persistState();
      }
      res.json({ ok: true });
    });

    app.post('/api/community/posts/:id/report', (req, res) => {
      const ip = getClientIp(req);
      if (!this.checkRateLimit(`crep:${ip}`, 15, 60 * 60 * 1000)) {
        res.status(429).json({
          ok: false,
          error: 'ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        });
        return;
      }

      const post = this.state.posts.find(
        (p) => p.id === req.params.id || p.slug === req.params.id
      );
      if (!post) {
        res.status(404).json({ ok: false, error: 'ಪ್ರಕಟಣೆ ಕಂಡುಬಂದಿಲ್ಲ.' });
        return;
      }

      const reason = cleanSingleLine(req.body?.reason, 180);
      const details = cleanMultiline(req.body?.details, 800);
      if (!reason) {
        res.status(400).json({ ok: false, error: 'ದಯವಿಟ್ಟು ವರದಿಯ ಕಾರಣವನ್ನು ಆಯ್ಕೆಮಾಡಿ.' });
        return;
      }

      const report: CommunityReportRecord = {
        id: makeId('crep'),
        postId: post.id,
        postTitle: post.title,
        reason,
        details: details || undefined,
        createdAt: new Date().toISOString(),
        status: 'open',
      };
      this.state.reports.unshift(report);
      this.persistState();
      res.status(201).json({ ok: true, id: report.id });
    });

    // -------------------------------------------------------------------------
    // USER SUBMISSIONS & DASHBOARD (IMMEDIATE PUBLISH — NO ADMIN APPROVAL!)
    // -------------------------------------------------------------------------
    app.get('/api/community/my-posts', (req, res) => {
      const resolved = this.resolveSessionUser(req, false);
      if (!resolved) {
        res.status(401).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಮೊದಲು ನೋಂದಣಿ ಮಾಡಿ.' });
        return;
      }

      const myPosts = this.state.posts
        .filter((p) => p.authorUserId === resolved.user.id && p.status !== 'removed')
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((p) => ({
          ...toPublicCommunityPost(p, resolved.user.id),
          status: p.status,
        }));

      res.json({ ok: true, posts: myPosts });
    });

    app.post('/api/community/posts', (req, res) => {
      const resolved = this.resolveSessionUser(req, true);
      if (!resolved) {
        res.status(401).json({
          ok: false,
          error: 'ಮಾಹಿತಿ ಸೇರಿಸಲು ದಯವಿಟ್ಟು ಮೊದಲು ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ.',
        });
        return;
      }
      if (resolved.user.status === 'suspended') {
        res.status(403).json({
          ok: false,
          error: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.',
        });
        return;
      }

      const ip = getClientIp(req);
      if (!this.checkRateLimit(`cpost:${resolved.user.id}:${ip}`, 20, 60 * 60 * 1000)) {
        res.status(429).json({
          ok: false,
          error: 'ಒಂದು ಗಂಟೆಯಲ್ಲಿ ಗರಿಷ್ಠ ಮಿತಿ ತಲುಪಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.',
        });
        return;
      }

      const title = cleanSingleLine(req.body?.title, 150);
      const category = req.body?.category;
      const description = cleanMultiline(req.body?.description, 3000);
      const location = cleanSingleLine(req.body?.location, 100);
      const price = cleanSingleLine(req.body?.price, 80);
      const optionalPublicContact = cleanSingleLine(req.body?.optionalPublicContact, 80);

      if (title.length < 3) {
        res.status(400).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಮಾಹಿತಿಯ ಶೀರ್ಷಿಕೆಯನ್ನು ನಮೂದಿಸಿ.' });
        return;
      }
      if (!isValidCommunityCategory(category)) {
        res.status(400).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಸೂಕ್ತ ವಿಭಾಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ.' });
        return;
      }
      if (category === 'monthly-news-contest') {
        res.status(400).json({
          ok: false,
          error:
            'ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆಯ ಸುದ್ದಿಗಳನ್ನು ದಯವಿಟ್ಟು /contest ಪುಟದ ಮೂಲಕವೇ ಪ್ರಕಟಿಸಿ.',
        });
        return;
      }
      if (description.length < 5) {
        res.status(400).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಮಾಹಿತಿಯ ವಿವರಣೆಯನ್ನು ನಮೂದಿಸಿ.' });
        return;
      }
      if (location.length < 2) {
        res.status(400).json({ ok: false, error: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಊರು / ಸ್ಥಳವನ್ನು ಆಯ್ಕೆಮಾಡಿ.' });
        return;
      }

      // Duplicate submission protection within 60 seconds
      const nowMs = Date.now();
      const duplicate = this.state.posts.find(
        (p) =>
          p.authorUserId === resolved.user.id &&
          p.category === category &&
          p.title.toLowerCase() === title.toLowerCase() &&
          nowMs - Date.parse(p.createdAt) < 60_000
      );
      if (duplicate) {
        res.status(200).json({
          ok: true,
          duplicatePrevented: true,
          post: toPublicCommunityPost(duplicate, resolved.user.id),
        });
        return;
      }

      const photoResult = this.processUploadedPhotos(req.body?.photos);
      if (!photoResult.ok) {
        res.status(400).json({ ok: false, error: photoResult.error });
        return;
      }

      const nowIso = new Date().toISOString();
      const id = makeId('cpost');
      const uniqueToken = crypto.randomBytes(4).toString('hex');
      const slug = generateCommunitySlug(title, uniqueToken);

      const newPost: CommunityPostRecord = {
        id,
        slug,
        authorUserId: resolved.user.id,
        authorName: resolved.user.fullName,
        title,
        category,
        description,
        location,
        photos: photoResult.photos,
        price: price || undefined,
        optionalPublicContact: optionalPublicContact || undefined,
        status: 'published', // PUBLISH IMMEDIATELY — NO ADMIN APPROVAL
        createdAt: nowIso,
        updatedAt: nowIso,
        viewsCount: 0,
        sharesCount: 0,
      };

      this.state.posts.unshift(newPost);
      resolved.user.lastActiveAt = nowIso;
      this.persistState();

      res.status(201).json({
        ok: true,
        post: toPublicCommunityPost(newPost, resolved.user.id),
      });
    });

    app.put('/api/community/posts/:id', (req, res) => {
      const resolved = this.resolveSessionUser(req, true);
      if (!resolved) {
        res.status(401).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಮೊದಲು ನೋಂದಣಿ ಮಾಡಿ.' });
        return;
      }
      if (resolved.user.status === 'suspended') {
        res.status(403).json({ ok: false, error: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ.' });
        return;
      }

      const post = this.state.posts.find((p) => p.id === req.params.id);
      if (!post || post.status === 'removed') {
        res.status(404).json({ ok: false, error: 'ಪ್ರಕಟಣೆ ಕಂಡುಬಂದಿಲ್ಲ.' });
        return;
      }
      if (post.authorUserId !== resolved.user.id) {
        res.status(403).json({
          ok: false,
          error: 'ನೀವು ನಿಮ್ಮ ಸ್ವಂತ ಪ್ರಕಟಣೆಗಳನ್ನು ಮಾತ್ರ ಸಂಪಾದಿಸಬಹುದು.',
        });
        return;
      }

      const title = cleanSingleLine(req.body?.title ?? post.title, 150);
      const category = req.body?.category ?? post.category;
      const description = cleanMultiline(req.body?.description ?? post.description, 3000);
      const location = cleanSingleLine(req.body?.location ?? post.location, 100);
      const price =
        req.body?.price !== undefined ? cleanSingleLine(req.body.price, 80) : post.price || '';
      const optionalPublicContact =
        req.body?.optionalPublicContact !== undefined
          ? cleanSingleLine(req.body.optionalPublicContact, 80)
          : post.optionalPublicContact || '';

      if (title.length < 3 || !isValidCommunityCategory(category) || description.length < 5 || location.length < 2) {
        res.status(400).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಎಲ್ಲಾ ಅಗತ್ಯ ವಿವರಗಳನ್ನು ಸರಿಯಾಗಿ ಭರ್ತಿ ಮಾಡಿ.' });
        return;
      }

      const previousPhotos = [...post.photos];
      if (req.body?.photos !== undefined) {
        const photoResult = this.processUploadedPhotos(req.body.photos);
        if (!photoResult.ok) {
          res.status(400).json({ ok: false, error: photoResult.error });
          return;
        }
        post.photos = photoResult.photos;
      }

      post.title = title;
      post.category = category;
      post.description = description;
      post.location = location;
      post.price = price || undefined;
      post.optionalPublicContact = optionalPublicContact || undefined;
      post.updatedAt = new Date().toISOString();
      resolved.user.lastActiveAt = post.updatedAt;

      this.persistState();
      this.cleanupUnusedMedia(previousPhotos);

      res.json({
        ok: true,
        post: toPublicCommunityPost(post, resolved.user.id),
      });
    });

    app.delete('/api/community/posts/:id', (req, res) => {
      const resolved = this.resolveSessionUser(req, true);
      if (!resolved) {
        res.status(401).json({ ok: false, error: 'ದಯವಿಟ್ಟು ಮೊದಲು ನೋಂದಣಿ ಮಾಡಿ.' });
        return;
      }

      const idx = this.state.posts.findIndex((p) => p.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ ok: false, error: 'ಪ್ರಕಟಣೆ ಕಂಡುಬಂದಿಲ್ಲ.' });
        return;
      }
      const post = this.state.posts[idx];
      if (post.authorUserId !== resolved.user.id) {
        res.status(403).json({
          ok: false,
          error: 'ನೀವು ನಿಮ್ಮ ಸ್ವಂತ ಪ್ರಕಟಣೆಗಳನ್ನು ಮಾತ್ರ ಅಳಿಸಬಹುದು.',
        });
        return;
      }

      const removedPhotos = [...post.photos];
      const deletedId = post.id;
      this.state.posts.splice(idx, 1);
      this.persistState();
      this.cleanupUnusedMedia(removedPhotos);
      this.emitPostDeleted(deletedId);

      res.json({ ok: true });
    });

    // -------------------------------------------------------------------------
    // ADMIN-ONLY PRIVATE REGISTERED USERS & MODERATION ENDPOINTS
    // -------------------------------------------------------------------------
    const requireAdminRead = this.authFactory('dashboard.view');
    const requireAdminManage = this.authFactory('messaging.manage');

    app.get('/api/admin2/community/users', requireAdminRead, (req, res) => {
      const q = String(req.query.q || '').trim().toLowerCase();
      const statusFilter = String(req.query.status || 'all').trim();

      const summaries: AdminCommunityUserSummary[] = this.state.users
        .map((u) => {
          const userPosts = this.state.posts.filter((p) => p.authorUserId === u.id);
          return {
            id: u.id,
            fullName: u.fullName,
            mobileNumber: u.mobileNumber,
            registeredAt: u.registeredAt,
            lastActiveAt: u.lastActiveAt,
            status: u.status,
            suspendedReason: u.suspendedReason,
            totalPosts: userPosts.length,
            publishedPosts: userPosts.filter((p) => p.status === 'published').length,
            hiddenPosts: userPosts.filter((p) => p.status !== 'published').length,
          };
        })
        .filter((u) => {
          if (statusFilter !== 'all' && u.status !== statusFilter) return false;
          if (q) {
            return (
              u.fullName.toLowerCase().includes(q) ||
              u.mobileNumber.includes(q.replace(/\D+/g, '') || q)
            );
          }
          return true;
        })
        .sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt));

      res.json({
        ok: true,
        users: summaries,
        totals: {
          totalUsers: this.state.users.length,
          activeUsers: this.state.users.filter((u) => u.status === 'active').length,
          suspendedUsers: this.state.users.filter((u) => u.status === 'suspended').length,
          totalPosts: this.state.posts.length,
          publishedPosts: this.state.posts.filter((p) => p.status === 'published').length,
          openReports: this.state.reports.filter((r) => r.status === 'open').length,
        },
      });
    });

    app.get('/api/admin2/community/users/:id/posts', requireAdminRead, (req, res) => {
      const user = this.state.users.find((u) => u.id === req.params.id);
      if (!user) {
        res.status(404).json({ ok: false, error: 'Registered user not found.' });
        return;
      }

      const posts: AdminCommunityPostView[] = this.state.posts
        .filter((p) => p.authorUserId === user.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((p) => ({
          ...p,
          authorMobileNumber: user.mobileNumber,
          openReportsCount: this.state.reports.filter(
            (r) => r.postId === p.id && r.status === 'open'
          ).length,
        }));

      res.json({
        ok: true,
        user: {
          id: user.id,
          fullName: user.fullName,
          mobileNumber: user.mobileNumber,
          registeredAt: user.registeredAt,
          lastActiveAt: user.lastActiveAt,
          status: user.status,
          suspendedReason: user.suspendedReason,
        },
        posts,
      });
    });

    app.patch('/api/admin2/community/users/:id/status', requireAdminManage, (req, res) => {
      const user = this.state.users.find((u) => u.id === req.params.id);
      if (!user) {
        res.status(404).json({ ok: false, error: 'Registered user not found.' });
        return;
      }

      const nextStatus: CommunityUserStatus =
        req.body?.status === 'suspended' ? 'suspended' : 'active';
      user.status = nextStatus;
      user.suspendedReason =
        nextStatus === 'suspended' ? cleanSingleLine(req.body?.reason, 200) || undefined : undefined;

      // Revoke active sessions immediately when suspending a user
      if (nextStatus === 'suspended') {
        this.state.sessions = this.state.sessions.filter((s) => s.userId !== user.id);
      }

      this.persistState();
      res.json({ ok: true, user });
    });

    app.get('/api/admin2/community/posts', requireAdminRead, (req, res) => {
      const statusFilter = String(req.query.status || 'all').trim();
      const q = String(req.query.q || '').trim().toLowerCase();
      const userMap = new Map(this.state.users.map((u) => [u.id, u]));

      const posts: AdminCommunityPostView[] = this.state.posts
        .map((p) => ({
          ...p,
          authorMobileNumber: userMap.get(p.authorUserId)?.mobileNumber || '',
          openReportsCount: this.state.reports.filter(
            (r) => r.postId === p.id && r.status === 'open'
          ).length,
        }))
        .filter((p) => {
          if (statusFilter !== 'all' && p.status !== statusFilter) return false;
          if (q) {
            return (
              p.title.toLowerCase().includes(q) ||
              p.authorName.toLowerCase().includes(q) ||
              p.authorMobileNumber.includes(q) ||
              p.location.toLowerCase().includes(q)
            );
          }
          return true;
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      res.json({ ok: true, posts });
    });

    app.patch('/api/admin2/community/posts/:id/status', requireAdminManage, (req, res) => {
      const post = this.state.posts.find((p) => p.id === req.params.id);
      if (!post) {
        res.status(404).json({ ok: false, error: 'Community post not found.' });
        return;
      }
      const allowed: CommunityPostStatus[] = ['published', 'hidden', 'removed'];
      const nextStatus = allowed.includes(req.body?.status)
        ? (req.body.status as CommunityPostStatus)
        : 'published';
      post.status = nextStatus;
      post.hiddenReason =
        nextStatus !== 'published' ? cleanSingleLine(req.body?.reason, 200) || undefined : undefined;
      post.updatedAt = new Date().toISOString();
      this.persistState();
      res.json({ ok: true, post });
    });

    app.delete('/api/admin2/community/posts/:id', requireAdminManage, (req, res) => {
      const idx = this.state.posts.findIndex((p) => p.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ ok: false, error: 'Community post not found.' });
        return;
      }
      const removedPhotos = [...this.state.posts[idx].photos];
      const deletedId = this.state.posts[idx].id;
      this.state.posts.splice(idx, 1);
      this.persistState();
      this.cleanupUnusedMedia(removedPhotos);
      this.emitPostDeleted(deletedId);
      res.json({ ok: true });
    });

    app.get('/api/admin2/community/reports', requireAdminRead, (_req, res) => {
      res.json({ ok: true, reports: this.state.reports });
    });

    app.patch('/api/admin2/community/reports/:id', requireAdminManage, (req: Admin2Request, res) => {
      const report = this.state.reports.find((r) => r.id === req.params.id);
      if (!report) {
        res.status(404).json({ ok: false, error: 'Report not found.' });
        return;
      }
      report.status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
      report.resolvedAt = new Date().toISOString();
      report.resolvedBy = req.admin2User?.email || 'admin';
      this.persistState();
      res.json({ ok: true, report });
    });

    app.get('/api/admin2/community/export', requireAdminRead, (_req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="coffeenadu-community-backup-${new Date().toISOString().slice(0, 10)}.json"`
      );
      res.send(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            users: this.state.users,
            posts: this.state.posts,
            reports: this.state.reports,
          },
          null,
          2
        )
      );
    });
  }
}
