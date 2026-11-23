/**
 * Shared helpers for Featured Lead Story status & auto-expiry timer.
 *
 * Works seamlessly across:
 * 1) Google Sheets + Apps Script (stores compact metadata tokens in `tags` so timers
 *    and untick fixes work immediately even on existing deployed Apps Script Web Apps,
 *    plus dedicated `featuredUntil` support when redeployed).
 * 2) Firestore fallback (`featuredUntil` epoch ms field).
 * 3) Client real-time auto-removal when the timer expires.
 */

const LEAD_UNTIL_PREFIX = 'leadUntil:';
const LEAD_OFF_TOKEN = 'leadOff:1';

export function parseSheetBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized === 'TRUE' || normalized === '1' || normalized === 'YES';
  }
  return false;
}

export function normalizeFeaturedUntil(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.floor(num);
}

export interface ParsedLeadTagMeta {
  featuredUntil?: number;
  leadDisabled: boolean;
  cleanTags: string;
}

/**
 * Extracts internal lead-story timer / disable tokens from a comma-separated `tags` string.
 */
export function parseLeadMetaFromTags(rawTags?: string | null): ParsedLeadTagMeta {
  const text = typeof rawTags === 'string' ? rawTags.trim() : '';
  if (!text) {
    return { featuredUntil: undefined, leadDisabled: false, cleanTags: '' };
  }

  let featuredUntil: number | undefined;
  let leadDisabled = false;
  const userTags: string[] = [];

  for (const part of text.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower.startsWith(LEAD_UNTIL_PREFIX.toLowerCase())) {
      const ts = normalizeFeaturedUntil(token.slice(LEAD_UNTIL_PREFIX.length));
      if (ts) featuredUntil = ts;
    } else if (lower === LEAD_OFF_TOKEN.toLowerCase()) {
      leadDisabled = true;
    } else {
      userTags.push(token);
    }
  }

  return {
    featuredUntil,
    leadDisabled,
    cleanTags: userTags.join(', '),
  };
}

/**
 * Merges lead-story state into a comma-separated `tags` string (preserving any existing user tags).
 * - When `isFeatured === true` and `featuredUntil` is set: writes `leadUntil:<epochMs>` and removes `leadOff:1`.
 * - When `isFeatured === true` and no timer: removes both `leadUntil:...` and `leadOff:1`.
 * - When `isFeatured === false`: removes `leadUntil:...` and writes `leadOff:1` so even older
 *   deployed Apps Script instances reliably reflect the un-featured state immediately.
 */
export function serializeLeadMetaToTags(
  existingTags: string | undefined | null,
  options: { isFeatured: boolean; featuredUntil?: number }
): string {
  const { cleanTags } = parseLeadMetaFromTags(existingTags);
  const tokens: string[] = cleanTags
    ? cleanTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const validUntil = normalizeFeaturedUntil(options.featuredUntil);
  if (options.isFeatured) {
    if (validUntil) {
      tokens.push(`${LEAD_UNTIL_PREFIX}${validUntil}`);
    }
  } else {
    tokens.push(LEAD_OFF_TOKEN);
  }

  return tokens.join(', ').slice(0, 300);
}

/**
 * Resolves the effective featured status and optional expiry timestamp from a raw record
 * (combining explicit `featured`/`isFeatured`, `featuredUntil`, and `tags` tokens).
 */
export function resolveEffectiveLeadState(
  raw: {
    featured?: unknown;
    isFeatured?: unknown;
    featuredUntil?: unknown;
    tags?: string | null;
  },
  nowMs = Date.now()
): { isFeatured: boolean; featuredUntil?: number } {
  const tagMeta = parseLeadMetaFromTags(raw.tags);
  const rawFeatured =
    raw.featured !== undefined
      ? parseSheetBoolean(raw.featured)
      : raw.isFeatured !== undefined
      ? parseSheetBoolean(raw.isFeatured)
      : false;

  const featuredUntil = normalizeFeaturedUntil(raw.featuredUntil) ?? tagMeta.featuredUntil;

  // Explicit untick override wins even if an older sheet row still had TRUE
  if (!rawFeatured || tagMeta.leadDisabled) {
    return { isFeatured: false, featuredUntil: undefined };
  }

  // Auto-expire if timer has elapsed
  if (featuredUntil && featuredUntil <= nowMs) {
    return { isFeatured: false, featuredUntil };
  }

  return { isFeatured: true, featuredUntil };
}

/**
 * Returns true ONLY if the article is pinned as Lead Story AND its timer (if set) has not expired.
 */
export function isArticleActivelyFeatured(
  article: { isFeatured?: boolean; featuredUntil?: number },
  nowMs = Date.now()
): boolean {
  if (!article.isFeatured) return false;
  const until = normalizeFeaturedUntil(article.featuredUntil);
  if (!until) return true;
  return until > nowMs;
}

export function formatRemainingLeadTime(featuredUntil: number, nowMs = Date.now()): string {
  const remainingMs = featuredUntil - nowMs;
  if (remainingMs <= 0) return 'Expired';

  const totalMinutes = Math.ceil(remainingMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m left`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remMinutes > 0 ? `${totalHours}h ${remMinutes}m left` : `${totalHours}h left`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h left` : `${days}d left`;
}

export function formatLeadExpiryDateTime(featuredUntil: number): string {
  try {
    return new Date(featuredUntil).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date(featuredUntil).toISOString();
  }
}
