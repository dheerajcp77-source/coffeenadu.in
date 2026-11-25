/**
 * Cloudflare Pages Function: /sitemap.xml
 *
 * Proxies to BACKEND_ORIGIN when configured to a live Express server, or generates
 * the complete XML sitemap directly from Google Apps Script in Cloudflare Pages mode.
 */

import {
  callAppsScriptGet,
  fetchAllPublishedNewsDirect,
  getAppsScriptConfig,
  isDeadUpstreamHtmlResponse,
  resolveConfiguredBackendOrigin,
  resolvePublicOrigin,
  type PagesFunctionContext,
  type SheetsEventItem,
} from './_cfBackend';

const UPSTREAM_TIMEOUT_MS = 18_000;

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoDate(value?: string | number): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value.trim());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

async function generateDirectSitemap(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const publicOrigin = resolvePublicOrigin(env);
  const todayIso = new Date().toISOString().slice(0, 10);

  const entries: Array<{ loc: string; lastmod?: string; changefreq: string; priority: string }> = [
    { loc: `${publicOrigin}/`, lastmod: todayIso, changefreq: 'hourly', priority: '1.0' },
    { loc: `${publicOrigin}/events`, lastmod: todayIso, changefreq: 'daily', priority: '0.8' },
    { loc: `${publicOrigin}/bus-timings`, lastmod: todayIso, changefreq: 'weekly', priority: '0.7' },
    { loc: `${publicOrigin}/ads`, lastmod: todayIso, changefreq: 'daily', priority: '0.7' },
  ];

  if (getAppsScriptConfig(env).configured) {
    try {
      const [articles, eventsRes] = await Promise.all([
        fetchAllPublishedNewsDirect(env, false).catch(() => []),
        callAppsScriptGet<{ ok?: boolean; items?: SheetsEventItem[] }>(env, 'getEvents', {
          page: 1,
          limit: 100,
        }).catch(() => ({ ok: false, items: [] as SheetsEventItem[] })),
      ]);

      for (const article of articles) {
        if (!article.newsId) continue;
        entries.push({
          loc: `${publicOrigin}/?article=${encodeURIComponent(article.newsId)}`,
          lastmod: toIsoDate(article.publishedTimestamp) || toIsoDate(article.updatedDate) || todayIso,
          changefreq: 'daily',
          priority: article.featured ? '0.9' : '0.8',
        });
      }

      const events = Array.isArray(eventsRes?.items) ? eventsRes.items : [];
      for (const ev of events) {
        if (!ev.eventId) continue;
        entries.push({
          loc: `${publicOrigin}/events?event=${encodeURIComponent(ev.eventId)}`,
          lastmod: toIsoDate(ev.updatedAt) || toIsoDate(ev.eventDate) || todayIso,
          changefreq: 'weekly',
          priority: '0.7',
        });
      }
    } catch {
      // Return static entries if Apps Script query fails transiently
    }
  }

  const urlsXml = entries
    .map((entry) => {
      const lastmodXml = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '';
      return `  <url><loc>${escapeXml(entry.loc)}</loc>${lastmodXml}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>\n`;

  return new Response(method === 'HEAD' ? null : xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=900',
    },
  });
}

async function handleSitemap(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const incomingUrl = new URL(request.url);
  const backendOrigin = resolveConfiguredBackendOrigin(env);

  if (!backendOrigin) {
    return generateDirectSitemap(context);
  }

  const targetUrl = new URL('/sitemap.xml', backendOrigin);
  const upstreamHeaders = new Headers();
  const accept = request.headers.get('accept');
  if (accept) upstreamHeaders.set('accept', accept);
  const userAgent = request.headers.get('user-agent');
  if (userAgent) upstreamHeaders.set('user-agent', userAgent);
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host);
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(/:$/, ''));

  const fetchInit: RequestInit = {
    method,
    headers: upstreamHeaders,
    redirect: 'manual',
  };

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    fetchInit.signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl.toString(), fetchInit);
  } catch {
    return generateDirectSitemap(context);
  }

  const contentType = (upstreamResponse.headers.get('content-type') || '').toLowerCase();
  if (
    isDeadUpstreamHtmlResponse(upstreamResponse) ||
    !upstreamResponse.ok ||
    !contentType.includes('xml')
  ) {
    try {
      await upstreamResponse.body?.cancel();
    } catch {
      // Ignore cancel error
    }
    return generateDirectSitemap(context);
  }

  const responseHeaders = new Headers();
  const hadContentEncoding = upstreamResponse.headers.has('content-encoding');
  upstreamResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(lower)) return;
    if (lower === 'content-encoding' || (hadContentEncoding && lower === 'content-length')) {
      return;
    }
    responseHeaders.append(key, value);
  });

  const hasNoBody =
    method === 'HEAD' || upstreamResponse.status === 204 || upstreamResponse.status === 304;

  return new Response(hasNoBody ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  return handleSitemap(context);
}

export async function onRequestHead(context: PagesFunctionContext): Promise<Response> {
  return handleSitemap(context);
}
