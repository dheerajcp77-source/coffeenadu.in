/**
 * Cloudflare Pages Function: /api/* reverse proxy
 *
 * Proxies all same-origin `/api/*` requests from the Cloudflare Pages frontend
 * to the existing CoffeeNadu News Express backend while preserving HTTP methods,
 * query strings, request bodies, auth headers, cookies, redirects, and binary streams.
 *
 * Secrets (such as APPS_SCRIPT_API_SECRET) remain strictly on the Express backend.
 */

const DEFAULT_BACKEND_ORIGIN = 'https://coffeenad-news.ai.studio';
const UPSTREAM_TIMEOUT_MS = 25_000;

interface PagesEnv {
  BACKEND_ORIGIN?: string;
}

interface PagesFunctionContext {
  request: Request;
  env: PagesEnv;
  params: Record<string, string | string[]>;
}

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'cdn-loop',
  'true-client-ip',
]);

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

function jsonErrorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function extractSetCookies(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof extended.getSetCookie === 'function') {
    return extended.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function rewriteSetCookieForProxyOrigin(cookie: string, backendHostname: string): string {
  // Preserve host-only cookies (such as cn_admin2_rem) and strip only Domain attributes
  // targeting the upstream backend host so the browser stores them for the Pages origin.
  const escapedHost = backendHostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const domainPattern = new RegExp(`;\\s*Domain=\\.?${escapedHost}(?=;|$)`, 'gi');
  return cookie.replace(domainPattern, '');
}

function rewriteLocationHeader(
  locationValue: string,
  backendOrigin: URL,
  incomingOrigin: string
): string {
  try {
    const resolved = new URL(locationValue, backendOrigin);
    if (
      resolved.origin === backendOrigin.origin &&
      (resolved.pathname === '/api' || resolved.pathname.startsWith('/api/'))
    ) {
      return `${incomingOrigin}${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
  } catch {
    // Preserve non-URL or relative redirect locations as-is
  }
  return locationValue;
}

function buildUpstreamRequestHeaders(request: Request, incomingUrl: URL): Headers {
  const upstreamHeaders = new Headers();

  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_REQUEST_HEADERS.has(lower) || lower.startsWith('cf-')) {
      return;
    }
    upstreamHeaders.set(key, value);
  });

  // Preserve original client IP and origin metadata for backend audit logs,
  // analytics referrer/IP tracking, Secure cookie checks, and share-origin detection.
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) {
    const existingFwd = upstreamHeaders.get('x-forwarded-for');
    upstreamHeaders.set(
      'x-forwarded-for',
      existingFwd ? `${existingFwd}, ${clientIp}` : clientIp
    );
  }
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host);
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(/:$/, ''));

  return upstreamHeaders;
}

function buildProxyResponseHeaders(
  upstreamHeaders: Headers,
  backendOrigin: URL,
  incomingOrigin: string
): Headers {
  const responseHeaders = new Headers();
  const hadContentEncoding = upstreamHeaders.has('content-encoding');

  upstreamHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(lower) || lower === 'set-cookie') {
      return;
    }
    // Cloudflare Workers automatically decompresses upstream responses;
    // forwarding content-encoding (or the compressed content-length) corrupts browser decoding.
    if (lower === 'content-encoding' || (hadContentEncoding && lower === 'content-length')) {
      return;
    }
    if (lower === 'location') {
      responseHeaders.set('location', rewriteLocationHeader(value, backendOrigin, incomingOrigin));
      return;
    }
    responseHeaders.append(key, value);
  });

  const setCookies = extractSetCookies(upstreamHeaders);
  for (const cookie of setCookies) {
    responseHeaders.append(
      'set-cookie',
      rewriteSetCookieForProxyOrigin(cookie, backendOrigin.hostname)
    );
  }

  return responseHeaders;
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'TimeoutError' || err.name === 'AbortError';
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const incomingUrl = new URL(request.url);

  if (incomingUrl.pathname !== '/api' && !incomingUrl.pathname.startsWith('/api/')) {
    return jsonErrorResponse(400, 'Invalid API proxy path.');
  }

  const backendOrigin = resolveBackendOrigin(env);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, backendOrigin);

  // Guard against path traversal or host confusion escaping the fixed backend /api prefix.
  if (
    targetUrl.origin !== backendOrigin.origin ||
    (targetUrl.pathname !== '/api' && !targetUrl.pathname.startsWith('/api/'))
  ) {
    return jsonErrorResponse(400, 'Invalid API proxy destination.');
  }

  const method = request.method.toUpperCase();
  const upstreamHeaders = buildUpstreamRequestHeaders(request, incomingUrl);

  const fetchInit: RequestInit & { duplex?: 'half' } = {
    method,
    headers: upstreamHeaders,
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD' && request.body !== null) {
    fetchInit.body = request.body;
    fetchInit.duplex = 'half';
  }

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    fetchInit.signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl.toString(), fetchInit);
  } catch (err) {
    if (isTimeoutError(err)) {
      return jsonErrorResponse(
        504,
        'The CoffeeNadu News backend timed out while processing the request.'
      );
    }
    return jsonErrorResponse(502, 'Unable to reach the CoffeeNadu News backend service.');
  }

  const responseHeaders = buildProxyResponseHeaders(
    upstreamResponse.headers,
    backendOrigin,
    incomingUrl.origin
  );

  const hasNoBody =
    method === 'HEAD' || upstreamResponse.status === 204 || upstreamResponse.status === 304;

  return new Response(hasNoBody ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
