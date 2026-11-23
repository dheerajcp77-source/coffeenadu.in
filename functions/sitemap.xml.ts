/**
 * Cloudflare Pages Function: /sitemap.xml reverse proxy
 *
 * The Admin 2.0 SEO panel links directly to `/sitemap.xml` on the current origin.
 * This function proxies GET/HEAD requests for `/sitemap.xml` to the existing
 * CoffeeNadu News Express backend without modifying the backend itself.
 */

const DEFAULT_BACKEND_ORIGIN = 'https://coffeenad-news.ai.studio';
const UPSTREAM_TIMEOUT_MS = 20_000;

interface PagesEnv {
  BACKEND_ORIGIN?: string;
}

interface PagesFunctionContext {
  request: Request;
  env: PagesEnv;
}

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

function resolveBackendOrigin(env: PagesEnv | undefined): URL {
  const raw = (env?.BACKEND_ORIGIN || '').trim();
  if (raw) {
    try {
      const parsed = new URL(raw);
      const hostname = parsed.hostname.toLowerCase();
      const isUnsafeHost =
        hostname === 'localhost' ||
        hostname === '0.0.0.0' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
      if (parsed.protocol === 'https:' && !isUnsafeHost) {
        return new URL(parsed.origin);
      }
    } catch {
      // Fall back to default trusted backend origin
    }
  }
  return new URL(DEFAULT_BACKEND_ORIGIN);
}

async function proxySitemap(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const incomingUrl = new URL(request.url);
  const backendOrigin = resolveBackendOrigin(env);
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
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return new Response(
      isTimeout
        ? 'Upstream backend timed out while generating sitemap.xml.'
        : 'Unable to reach the CoffeeNadu News backend service for sitemap.xml.',
      {
        status: isTimeout ? 504 : 502,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      }
    );
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
  return proxySitemap(context);
}

export async function onRequestHead(context: PagesFunctionContext): Promise<Response> {
  return proxySitemap(context);
}
