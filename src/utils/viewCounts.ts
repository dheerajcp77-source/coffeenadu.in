export function toSafeNonNegativeInt(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
}

/**
 * Resolves the effective admin view count for a news article by preserving the
 * highest value between the article's stored/historical count (Google Sheets /
 * Firestore / local archive) and the live server views ledger.
 */
export function resolveArticleViewCount(
  storedViewCount: unknown,
  serverViewsById: Record<string, number> | null | undefined,
  articleId: string
): number {
  const stored = toSafeNonNegativeInt(storedViewCount);
  const live = serverViewsById ? toSafeNonNegativeInt(serverViewsById[articleId]) : 0;
  return Math.max(stored, live);
}

/**
 * Resolves the effective admin view/impression count for an advertisement by
 * preserving historical `ad.views` alongside tracked `impressions`.
 */
export function resolveAdViewCount(
  adViews: unknown,
  trackedImpressions?: unknown
): number {
  return Math.max(toSafeNonNegativeInt(adViews), toSafeNonNegativeInt(trackedImpressions));
}

export function sumViewCounts(values: ReadonlyArray<unknown>): number {
  let total = 0;
  for (const val of values) {
    total += toSafeNonNegativeInt(val);
  }
  return total;
}

export function formatAdminViewCount(value: unknown): string {
  return toSafeNonNegativeInt(value).toLocaleString('en-IN');
}
