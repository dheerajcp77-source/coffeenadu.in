/**
 * Cloudflare Pages Function: /api/* hybrid router & reverse proxy
 *
 * - If BACKEND_ORIGIN is configured to a live, non-deprecated Express backend,
 *   proxies `/api/*` requests to it while preserving methods, headers, cookies, and streams.
 * - If BACKEND_ORIGIN is unset, deprecated (e.g. dead preview origins), unreachable,
 *   or returns a dead HTML 404/5xx page, seamlessly executes the route directly in
 *   Cloudflare Pages Functions using APPS_SCRIPT_WEBAPP_URL & APPS_SCRIPT_API_SECRET.
 */

import {
  handleApiDirectOnCloudflare,
  isDeadUpstreamHtmlResponse,
  resolveConfiguredBackendOrigin,
  type PagesFunctionContext,
} from '../_cfBackend';

const UPSTREAM_TIMEOUT_MS = 20_000;

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

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const incomingUrl = new URL(request.url);

  if (incomingUrl.pathname !== '/api' && !incomingUrl.pathname.startsWith('/api/')) {
    return jsonErrorResponse(400, 'Invalid API proxy path.');
  }

  const backendOrigin = resolveConfiguredBackendOrigin(env);
  if (!backendOrigin) {
    return handleApiDirectOnCloudflare(context);
  }

  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, backendOrigin);
  if (
    targetUrl.origin !== backendOrigin.origin ||
    (targetUrl.pathname !== '/api' && !targetUrl.pathname.startsWith('/api/'))
  ) {
    return jsonErrorResponse(400, 'Invalid API proxy destination.');
  }

  const method = request.method.toUpperCase();
  // Clone non-GET/HEAD requests before reading request.body so direct fallback can read the body safely
  const fallbackRequest =
    method !== 'GET' && method !== 'HEAD' && request.body !== null ? request.clone() : request;

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
  } catch {
    return handleApiDirectOnCloudflare({ ...context, request: fallbackRequest });
  }

  // Never forward dead upstream 404/5xx HTML pages (e.g. expired preview hosts)
  if (isDeadUpstreamHtmlResponse(upstreamResponse)) {
    try {
      await upstreamResponse.body?.cancel();
    } catch {
      // Ignore cancel error
    }
    return handleApiDirectOnCloudflare({ ...context, request: fallbackRequest });
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
