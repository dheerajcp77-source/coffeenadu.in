import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_MAP,
  type CommunityFeedTabId,
} from '../constants/communityCategories';
import type {
  CommunityCategoryId,
  CommunityPostRecord,
  PublicCommunityPost,
} from '../types/community';
import { matchesLocality } from './platformHelpers';

export const COMMUNITY_PUBLIC_ORIGIN = 'https://coffeenadu.in';
export const MAX_COMMUNITY_PHOTOS = 3;
export const MAX_COMMUNITY_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB max per photo

const VALID_CATEGORY_SET = new Set<string>(COMMUNITY_CATEGORIES.map((c) => c.id));

export function isValidCommunityCategory(value: unknown): value is CommunityCategoryId {
  return typeof value === 'string' && VALID_CATEGORY_SET.has(value);
}

/**
 * Normalizes an Indian 10-digit mobile number (starts with 6-9).
 * Strips +91, leading 0, spaces, hyphens, and parentheses.
 * Returns null if invalid.
 */
export function normalizeCommunityMobile(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D+/g, '');
  let ten = digits;
  if (ten.length === 12 && ten.startsWith('91')) {
    ten = ten.slice(2);
  } else if (ten.length === 11 && ten.startsWith('0')) {
    ten = ten.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(ten)) {
    return null;
  }
  return ten;
}

/**
 * Masks a 10-digit mobile number for the user's own profile screen (e.g. ******3456).
 */
export function maskMobileNumber(mobile: string): string {
  const clean = String(mobile || '').replace(/\D+/g, '');
  if (clean.length < 4) return '******';
  return `${'*'.repeat(Math.max(6, clean.length - 4))}${clean.slice(-4)}`;
}

/**
 * Generates a permanent, URL-safe slug combining ASCII title words (when present)
 * with a deterministic-safe unique suffix so Kannada-only titles also produce crisp URLs.
 */
export function generateCommunitySlug(title: string, uniqueToken: string): string {
  const ascii = String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 46)
    .replace(/-+$/g, '');

  const suffix = String(uniqueToken || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8) || 'post';

  return ascii ? `${ascii}-${suffix}` : `post-${suffix}`;
}

/**
 * Strict privacy projection for public API responses.
 * NEVER copies authorUserId, mobileNumber, hiddenReason, or any private fields.
 */
export function toPublicCommunityPost(
  record: CommunityPostRecord,
  viewerUserId?: string | null
): PublicCommunityPost {
  return {
    id: record.id,
    slug: record.slug,
    authorName: record.authorName,
    title: record.title,
    category: record.category,
    description: record.description,
    location: record.location,
    photos: Array.isArray(record.photos) ? [...record.photos] : [],
    price: record.price ? record.price : undefined,
    optionalPublicContact: record.optionalPublicContact
      ? record.optionalPublicContact
      : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    viewsCount: Number.isFinite(record.viewsCount) ? record.viewsCount : 0,
    sharesCount: Number.isFinite(record.sharesCount) ? record.sharesCount : 0,
    isOwner: Boolean(viewerUserId && record.authorUserId === viewerUserId),
  };
}

/**
 * Builds the permanent public share URL for a community post.
 * Example: https://coffeenadu.in/community/post-title-a1b2c3
 */
export function buildCommunityPostPublicUrl(slugOrId: string, origin?: string): string {
  const cleanOrigin = (origin || COMMUNITY_PUBLIC_ORIGIN).replace(/\/+$/, '');
  return `${cleanOrigin}/community/${encodeURIComponent(slugOrId)}`;
}

/**
 * Builds natural Kannada + Coffeenadu WhatsApp share text for a community post.
 */
export function buildCommunityShareText(
  post: Pick<PublicCommunityPost, 'title' | 'category' | 'location' | 'slug' | 'id'>,
  origin?: string
): string {
  const url = buildCommunityPostPublicUrl(post.slug || post.id, origin);
  const catLabel = COMMUNITY_CATEGORY_MAP[post.category]?.labelKn || 'ಸಮುದಾಯ ಮಾಹಿತಿ';
  return [
    `*${post.title}*`,
    '',
    `📌 ${catLabel} · 📍 ${post.location}`,
    `🔗 ${url}`,
    '',
    `COFFEENADU COMMUNITY – ನಮ್ಮ ಮಲೆನಾಡು ಸಮುದಾಯ`,
  ].join('\n');
}

export function buildCommunityWhatsappUrl(
  post: Pick<PublicCommunityPost, 'title' | 'category' | 'location' | 'slug' | 'id'>,
  origin?: string
): string {
  return `https://wa.me/?text=${encodeURIComponent(buildCommunityShareText(post, origin))}`;
}

/**
 * Validates a data URL or safe local media path for uploaded community photos.
 * Only allows JPEG, PNG, and WebP images up to MAX_COMMUNITY_PHOTO_BYTES,
 * or already-saved `/api/community/media/<safe-filename>` paths.
 */
export function validateCommunityPhotoInput(input: unknown): {
  ok: boolean;
  kind?: 'existing-media' | 'data-url';
  mime?: string;
  base64Body?: string;
  ext?: string;
  error?: string;
} {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, error: 'Empty image value.' };
  }
  const trimmed = input.trim();

  // Existing server-hosted media URL
  if (/^\/api\/community\/media\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(trimmed)) {
    return { ok: true, kind: 'existing-media' };
  }

  // Data URL check (strict allowlist: jpeg, png, webp — never svg/html!)
  const match = trimmed.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return {
      ok: false,
      error: 'JPG, PNG ಅಥವಾ WebP ಫೋಟೋ ಮಾತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಬಹುದು.',
    };
  }

  const rawMime = match[1].toLowerCase();
  const mime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const base64Body = match[2];
  const approxBytes = Math.floor((base64Body.length * 3) / 4);

  if (approxBytes <= 0 || approxBytes > MAX_COMMUNITY_PHOTO_BYTES) {
    return {
      ok: false,
      error: 'ಪ್ರತಿ ಫೋಟೋ ಗರಿಷ್ಠ 2 MB ಒಳಗಿರಬೇಕು.',
    };
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { ok: true, kind: 'data-url', mime, base64Body, ext };
}

/**
 * Filters public community posts by feed tab, exact category, location, and search query.
 */
export function filterCommunityPosts(
  posts: PublicCommunityPost[],
  opts: {
    tab?: CommunityFeedTabId;
    category?: CommunityCategoryId | 'all';
    location?: string;
    nearbyLocation?: string;
    query?: string;
  }
): PublicCommunityPost[] {
  const q = String(opts.query || '').trim().toLowerCase();
  const tab = opts.tab || 'all';
  const category = opts.category || 'all';
  const locFilter = opts.location && opts.location !== 'all' ? opts.location : '';
  const nearbyLoc = tab === 'nearby' && opts.nearbyLocation && opts.nearbyLocation !== 'all'
    ? opts.nearbyLocation
    : '';

  return posts.filter((post) => {
    if (category !== 'all' && post.category !== category) {
      return false;
    }

    if (tab !== 'all' && tab !== 'nearby') {
      const meta = COMMUNITY_CATEGORY_MAP[post.category];
      if (!meta || meta.feedGroup !== tab) {
        return false;
      }
    }

    if (locFilter && !matchesLocality(post.location, locFilter)) {
      return false;
    }

    if (nearbyLoc && !matchesLocality(post.location, nearbyLoc)) {
      return false;
    }

    if (q) {
      const catMeta = COMMUNITY_CATEGORY_MAP[post.category];
      const haystack = [
        post.title,
        post.description,
        post.location,
        post.authorName,
        post.price || '',
        catMeta?.labelKn || '',
        catMeta?.labelEn || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

export function formatCommunityDateKn(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  try {
    return new Date(ts).toLocaleDateString('kn-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}
