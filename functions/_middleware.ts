/**
 * Cloudflare Pages Edge Middleware: Article & Event Open Graph / Twitter Card Metadata
 *
 * Ensures social link-preview crawlers (WhatsApp, Facebook, X/Twitter, Telegram, LinkedIn)
 * receive article-specific Open Graph and Twitter Card tags directly in raw HTML without
 * needing client-side JavaScript execution.
 *
 * Uses BACKEND_ORIGIN when configured to a healthy Express server, or falls back directly
 * to Google Apps Script (APPS_SCRIPT_WEBAPP_URL + APPS_SCRIPT_API_SECRET) in Cloudflare.
 * All non-article routes, `/api/*`, `/sitemap.xml`, and static assets pass through untouched.
 */

import {
  callAppsScriptGet,
  getAppsScriptConfig,
  resolveConfiguredBackendOrigin,
  resolvePublicOrigin,
  sanitizeSheetsEventItem,
  sanitizeSheetsNewsItem,
  type PagesEnv,
  type SheetsEventItem,
  type SheetsNewsItem,
} from './_cfBackend';

const METADATA_FETCH_TIMEOUT_MS = 5_000;
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const DEFAULT_SITE_TITLE = 'Coffeenadu News — Koppa Taluk Local Kannada News';
const DEFAULT_SITE_DESCRIPTION =
  'Local Koppa Taluk news publishing portal featuring English navigation and fast-loading Kannada news updates across categories.';

interface PagesMiddlewareContext {
  request: Request;
  env: PagesEnv;
  next: () => Promise<Response>;
}

interface RawSheetsNewsItem {
  newsId?: string;
  title?: string;
  description?: string;
  fullContent?: string[] | string;
  category?: string;
  location?: string;
  imageUrl?: string;
  imageDriveId?: string;
  imageKey?: string;
  publishedDate?: string;
}

interface RawSheetsEventItem {
  eventId?: string;
  titleKannada?: string;
  descriptionKannada?: string;
  eventDate?: string;
  eventTime?: string;
  location?: string;
  imageUrl?: string;
  imageDriveId?: string;
}

interface ResolvedPageMetadata {
  pageTitle: string;
  ogTitle: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  canonicalUrl: string;
  ogType: 'article' | 'website';
  publishedDate?: string;
}

function stripMarkupToPlainText(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncateText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  const sliced = value.slice(0, maxLen - 1).trim();
  const lastSpace = sliced.lastIndexOf(' ');
  const cleanCut = lastSpace > maxLen * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${cleanCut.trim()}…`;
}

function extractFirstParagraph(fullContent: string[] | string | undefined): string {
  if (!fullContent) return '';
  if (Array.isArray(fullContent)) {
    for (const part of fullContent) {
      if (typeof part !== 'string') continue;
      if (part.includes('__COFFEENADU_EXTRA_PHOTOS__')) continue;
      const plain = stripMarkupToPlainText(part);
      if (plain) return plain;
    }
    return '';
  }
  return stripMarkupToPlainText(fullContent);
}

function buildVersionParam(imageDriveId?: string, imageUrl?: string): string {
  const driveId = (imageDriveId || '').trim();
  if (/^[a-zA-Z0-9_-]{6,120}$/.test(driveId)) {
    return `?v=${encodeURIComponent(driveId.slice(0, 16))}`;
  }
  const url = (imageUrl || '').trim();
  if (url.startsWith('/api/media/drive/')) {
    const extracted = url.replace('/api/media/drive/', '').split('?')[0].trim();
    if (/^[a-zA-Z0-9_-]{6,120}$/.test(extracted)) {
      return `?v=${encodeURIComponent(extracted.slice(0, 16))}`;
    }
  }
  return '';
}

function extractMetaContentFromHtml(html: string, propertyName: string): string {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta\\s+(?:property|name)=["']${escaped}["']\\s+content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern);
  if (!match?.[1]) return '';
  return stripMarkupToPlainText(match[1]);
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T | null> {
  try {
    const fetchInit: RequestInit = {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      fetchInit.signal = AbortSignal.timeout(METADATA_FETCH_TIMEOUT_MS);
    }
    const resp = await fetch(url, fetchInit);
    if (!resp.ok) return null;
    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

function buildArticleMetaFromItem(
  item: RawSheetsNewsItem,
  articleId: string,
  publicOrigin: string
): ResolvedPageMetadata {
  const canonicalUrl = `${publicOrigin}/?article=${encodeURIComponent(articleId)}`;
  const cleanHeadline = stripMarkupToPlainText(item.title) || DEFAULT_SITE_TITLE;
  const cleanSummary =
    stripMarkupToPlainText(item.description) ||
    extractFirstParagraph(item.fullContent) ||
    DEFAULT_SITE_DESCRIPTION;

  const hasFeaturedImage = Boolean(
    (typeof item.imageUrl === 'string' && item.imageUrl.trim()) ||
      (typeof item.imageDriveId === 'string' && item.imageDriveId.trim()) ||
      (typeof item.imageKey === 'string' && item.imageKey.trim() && item.imageKey !== 'none')
  );

  const versionParam = buildVersionParam(item.imageDriveId, item.imageUrl);
  const imageUrl = hasFeaturedImage
    ? `${publicOrigin}/api/article-image/${encodeURIComponent(articleId)}${versionParam}`
    : `${publicOrigin}/api/og-default-image`;

  return {
    pageTitle:
      cleanHeadline === DEFAULT_SITE_TITLE
        ? DEFAULT_SITE_TITLE
        : `${cleanHeadline} — Coffeenadu News`,
    ogTitle: cleanHeadline,
    description: truncateText(cleanSummary, 280),
    imageUrl,
    imageAlt: cleanHeadline,
    canonicalUrl,
    ogType: 'article',
    publishedDate: typeof item.publishedDate === 'string' ? item.publishedDate : undefined,
  };
}

function buildEventMetaFromItem(
  item: RawSheetsEventItem,
  eventId: string,
  publicOrigin: string
): ResolvedPageMetadata | null {
  const canonicalUrl = `${publicOrigin}/events?event=${encodeURIComponent(eventId)}`;
  const cleanTitle = stripMarkupToPlainText(item.titleKannada);
  if (!cleanTitle) return null;
  const cleanDesc =
    stripMarkupToPlainText(item.descriptionKannada) || DEFAULT_SITE_DESCRIPTION;
  const hasEventImage = Boolean(
    (typeof item.imageUrl === 'string' && item.imageUrl.trim()) ||
      (typeof item.imageDriveId === 'string' && item.imageDriveId.trim())
  );
  const versionParam = buildVersionParam(item.imageDriveId, item.imageUrl);

  return {
    pageTitle: `${cleanTitle} — Coffeenadu Programs`,
    ogTitle: cleanTitle,
    description: truncateText(cleanDesc, 280),
    imageUrl: hasEventImage
      ? `${publicOrigin}/api/event-image/${encodeURIComponent(eventId)}${versionParam}`
      : `${publicOrigin}/api/og-default-image`,
    imageAlt: cleanTitle,
    canonicalUrl,
    ogType: 'article',
  };
}

async function resolveArticleMetadata(
  articleId: string,
  backendOrigin: URL | null,
  env: PagesEnv | undefined,
  publicOrigin: string
): Promise<ResolvedPageMetadata | null> {
  const canonicalUrl = `${publicOrigin}/?article=${encodeURIComponent(articleId)}`;

  // 1. If a healthy Express BACKEND_ORIGIN is configured, try it first
  if (backendOrigin) {
    const sheetsUrl = new URL(
      `/api/storage/news/${encodeURIComponent(articleId)}`,
      backendOrigin
    ).toString();
    const payload = await fetchJsonWithTimeout<{ ok?: boolean; item?: RawSheetsNewsItem }>(sheetsUrl);

    if (payload?.ok && payload.item) {
      return buildArticleMetaFromItem(payload.item, articleId, publicOrigin);
    }

    try {
      const expressUrl = new URL(
        `/?article=${encodeURIComponent(articleId)}`,
        backendOrigin
      ).toString();
      const fetchInit: RequestInit = {
        method: 'GET',
        headers: { Accept: 'text/html', 'User-Agent': 'CoffeeNadu-Edge-Meta/1.0' },
        redirect: 'follow',
      };
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        fetchInit.signal = AbortSignal.timeout(METADATA_FETCH_TIMEOUT_MS);
      }
      const resp = await fetch(expressUrl, fetchInit);
      if (resp.ok) {
        const html = await resp.text();
        const ogType = extractMetaContentFromHtml(html, 'og:type');
        const ogTitleRaw = extractMetaContentFromHtml(html, 'og:title');
        const ogDescRaw = extractMetaContentFromHtml(html, 'og:description');
        const ogImageRaw = extractMetaContentFromHtml(html, 'og:image');

        if (ogType === 'article' && ogTitleRaw && ogTitleRaw !== DEFAULT_SITE_TITLE) {
          const cleanHeadline =
            ogTitleRaw.replace(/\s+[—-]\s+Coffeenadu News$/i, '').trim() || ogTitleRaw;
          const hasArticleImage = ogImageRaw.includes('/api/article-image/');
          return {
            pageTitle: `${cleanHeadline} — Coffeenadu News`,
            ogTitle: cleanHeadline,
            description: truncateText(ogDescRaw || DEFAULT_SITE_DESCRIPTION, 280),
            imageUrl: hasArticleImage
              ? `${publicOrigin}/api/article-image/${encodeURIComponent(articleId)}`
              : `${publicOrigin}/api/og-default-image`,
            imageAlt: cleanHeadline,
            canonicalUrl,
            ogType: 'article',
          };
        }
      }
    } catch {
      // Fall through to direct Apps Script lookup
    }
  }

  // 2. Direct Apps Script lookup in standalone Cloudflare Pages mode
  if (getAppsScriptConfig(env).configured) {
    try {
      const res = await callAppsScriptGet<{ ok?: boolean; item?: SheetsNewsItem }>(
        env,
        'getNewsById',
        { newsId: articleId }
      );
      if (res?.ok && res.item) {
        const sanitized = sanitizeSheetsNewsItem(res.item);
        return buildArticleMetaFromItem(sanitized, articleId, publicOrigin);
      }
    } catch {
      // Fall through to default metadata
    }
  }

  return null;
}

async function resolveEventMetadata(
  eventId: string,
  backendOrigin: URL | null,
  env: PagesEnv | undefined,
  publicOrigin: string
): Promise<ResolvedPageMetadata | null> {
  if (backendOrigin) {
    const eventsUrl = new URL(
      `/api/storage/events/${encodeURIComponent(eventId)}`,
      backendOrigin
    ).toString();
    const payload = await fetchJsonWithTimeout<{ ok?: boolean; item?: RawSheetsEventItem }>(eventsUrl);
    if (payload?.ok && payload.item) {
      return buildEventMetaFromItem(payload.item, eventId, publicOrigin);
    }
  }

  if (getAppsScriptConfig(env).configured) {
    try {
      const res = await callAppsScriptGet<{ ok?: boolean; item?: SheetsEventItem }>(
        env,
        'getEventById',
        { eventId }
      );
      if (res?.ok && res.item) {
        const sanitized = sanitizeSheetsEventItem(res.item);
        return buildEventMetaFromItem(sanitized, eventId, publicOrigin);
      }
    } catch {
      // Fall through to default metadata
    }
  }

  return null;
}

function injectMetadataIntoHtml(
  html: string,
  meta: ResolvedPageMetadata,
  publicOrigin: string
): string {
  const safePageTitle = escapeHtmlAttr(meta.pageTitle);
  const safeOgTitle = escapeHtmlAttr(meta.ogTitle);
  const safeDesc = escapeHtmlAttr(meta.description);
  const safeImg = escapeHtmlAttr(meta.imageUrl);
  const safeImgAlt = escapeHtmlAttr(meta.imageAlt);
  const safeUrl = escapeHtmlAttr(meta.canonicalUrl);

  let cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safePageTitle}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, '');

  const jsonLd =
    meta.ogType === 'article'
      ? `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: meta.ogTitle,
          description: meta.description,
          image: [meta.imageUrl],
          mainEntityOfPage: meta.canonicalUrl,
          ...(meta.publishedDate ? { datePublished: meta.publishedDate } : {}),
          publisher: {
            '@type': 'NewsMediaOrganization',
            name: 'Coffeenadu News',
            url: `${publicOrigin}/`,
          },
        }).replace(/</g, '\\u003c')}</script>`
      : '';

  const shareOriginScript = `<script>window.__COFFEENADU_SHARE_ORIGIN__=${JSON.stringify(publicOrigin)};</script>`;

  const metaBlock = [
    `<meta name="description" content="${safeDesc}" />`,
    `<link rel="canonical" href="${safeUrl}" />`,
    `<meta property="og:site_name" content="Coffeenadu News" />`,
    `<meta property="og:locale" content="kn_IN" />`,
    `<meta property="og:type" content="${meta.ogType}" />`,
    `<meta property="og:title" content="${safeOgTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:image" content="${safeImg}" />`,
    `<meta property="og:image:secure_url" content="${safeImg}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${safeImgAlt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:url" content="${safeUrl}" />`,
    `<meta name="twitter:title" content="${safeOgTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeImg}" />`,
    `<meta name="twitter:image:alt" content="${safeImgAlt}" />`,
    jsonLd,
    shareOriginScript,
  ]
    .filter(Boolean)
    .join('\n    ');

  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, `    ${metaBlock}\n  </head>`);
  }
  return `${metaBlock}\n${cleaned}`;
}

export async function onRequest(context: PagesMiddlewareContext): Promise<Response> {
  const { request, env, next } = context;
  const method = request.method.toUpperCase();

  if (method !== 'GET' && method !== 'HEAD') {
    return next();
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/.well-known/') ||
    /\.[a-zA-Z0-9]{1,8}$/.test(pathname)
  ) {
    return next();
  }

  const publicOrigin = resolvePublicOrigin(env);

  const shortcutMatch = pathname.match(/^\/(?:article|news)\/([^/?#]+)\/?$/i);
  if (shortcutMatch?.[1]) {
    let decodedId = shortcutMatch[1];
    try {
      decodedId = decodeURIComponent(shortcutMatch[1]).trim();
    } catch {
      decodedId = shortcutMatch[1].trim();
    }
    if (VALID_ID_PATTERN.test(decodedId)) {
      return Response.redirect(
        `${publicOrigin}/?article=${encodeURIComponent(decodedId)}`,
        301
      );
    }
    return Response.redirect(`${publicOrigin}/`, 301);
  }

  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const isContestRoute = normalizedPath === '/contest';
  const rawArticleId =
    normalizedPath === '/' ? (url.searchParams.get('article') || '').trim() : '';
  const rawEventId =
    normalizedPath === '/events' ? (url.searchParams.get('event') || '').trim() : '';

  const hasValidArticleId = Boolean(rawArticleId && VALID_ID_PATTERN.test(rawArticleId));
  const hasValidEventId = Boolean(rawEventId && VALID_ID_PATTERN.test(rawEventId));

  if (!hasValidArticleId && !hasValidEventId && !isContestRoute) {
    return next();
  }

  const assetResponse = await next();
  const contentType = (assetResponse.headers.get('content-type') || '').toLowerCase();
  if (!assetResponse.ok || !contentType.includes('text/html')) {
    return assetResponse;
  }

  const backendOrigin = resolveConfiguredBackendOrigin(env);

  const resolvedMeta = isContestRoute
    ? {
        pageTitle:
          'COFFEENADU – MOST VIEWED NEWS CHALLENGE 2026 | ₹500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ!',
        ogTitle:
          'COFFEENADU – MOST VIEWED NEWS CHALLENGE 2026 | ₹500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ!',
        description:
          'ನಿಮ್ಮ ಸುದ್ದಿ ಹೆಚ್ಚು ಜನರಿಗೆ ತಲುಪಲಿ – ₹500 ನಗದು ಬಹುಮಾನ ಗೆಲ್ಲಿ! ನಿಮ್ಮೂರಿನ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ, ಎಲ್ಲರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ ಮತ್ತು ತಿಂಗಳ ವಿಜೇತರಾಗಿ (ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು).',
        imageUrl: `${publicOrigin}/api/og-default-image`,
        imageAlt: 'Coffeenadu Most Viewed News Challenge 2026',
        canonicalUrl: `${publicOrigin}/contest`,
        ogType: 'website' as const,
      }
    : hasValidArticleId
    ? await resolveArticleMetadata(rawArticleId, backendOrigin, env, publicOrigin)
    : await resolveEventMetadata(rawEventId, backendOrigin, env, publicOrigin);

  const finalMeta: ResolvedPageMetadata = resolvedMeta || {
    pageTitle: DEFAULT_SITE_TITLE,
    ogTitle: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    imageUrl: `${publicOrigin}/api/og-default-image`,
    imageAlt: DEFAULT_SITE_TITLE,
    canonicalUrl: hasValidArticleId
      ? `${publicOrigin}/?article=${encodeURIComponent(rawArticleId)}`
      : `${publicOrigin}/events?event=${encodeURIComponent(rawEventId)}`,
    ogType: 'website',
  };

  const rawHtml = await assetResponse.text();
  const injectedHtml = injectMetadataIntoHtml(rawHtml, finalMeta, publicOrigin);

  const headers = new Headers(assetResponse.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  headers.delete('content-length');
  headers.delete('etag');

  return new Response(method === 'HEAD' ? null : injectedHtml, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}
