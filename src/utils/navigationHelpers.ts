export type ContestSectionId = 'leaderboard' | 'rules' | 'winners';

export interface ParsedAppLocationTarget {
  /** Clean pathname without ?query or #hash, normalized without trailing slash (except '/') */
  pathname: string;
  /** Query string including leading '?' when present, otherwise '' */
  search: string;
  /** Hash fragment without leading '#' (e.g. 'leaderboard') */
  hash: string;
  /** Full canonical path+search+hash for history.pushState */
  fullPath: string;
}

/**
 * Parses an internal SPA navigation target cleanly into pathname, search, and hash.
 * Guarantees `pathname` never accidentally retains `#hash` or `?query` fragments.
 */
export function parseAppLocationTarget(targetPath: string): ParsedAppLocationTarget {
  const raw = String(targetPath || '/').trim() || '/';
  const normalizedInput = raw.startsWith('/') ? raw : `/${raw}`;

  let pathname = '/';
  let search = '';
  let hash = '';

  try {
    const parsed = new URL(normalizedInput, 'https://coffeenadu.in');
    pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    search = parsed.search || '';
    hash = parsed.hash ? parsed.hash.replace(/^#+/, '') : '';
  } catch {
    const hashIdx = normalizedInput.indexOf('#');
    const beforeHash = hashIdx >= 0 ? normalizedInput.slice(0, hashIdx) : normalizedInput;
    hash = hashIdx >= 0 ? normalizedInput.slice(hashIdx + 1) : '';
    const searchIdx = beforeHash.indexOf('?');
    const rawPath = searchIdx >= 0 ? beforeHash.slice(0, searchIdx) : beforeHash;
    search = searchIdx >= 0 ? beforeHash.slice(searchIdx) : '';
    pathname = rawPath.replace(/\/+$/, '') || '/';
  }

  const hashSuffix = hash ? `#${hash}` : '';
  return {
    pathname,
    search,
    hash,
    fullPath: `${pathname}${search}${hashSuffix}`,
  };
}

export function parseContestHashSection(hashOrUrlFragment: string): ContestSectionId | null {
  const clean = String(hashOrUrlFragment || '')
    .replace(/^#+/, '')
    .trim()
    .toLowerCase();
  if (clean === 'leaderboard' || clean === 'rules' || clean === 'winners') {
    return clean;
  }
  return null;
}
