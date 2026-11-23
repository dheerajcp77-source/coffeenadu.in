/* CoffeeNadu Admin 2.0 Service Worker
 * Security policy:
 * - NEVER cache /api/* responses, administrator credentials, auth tokens,
 *   Firebase/Google auth endpoints, Apps Script calls, or authenticated pages.
 * - Cache ONLY static public shell assets (JS/CSS bundles, icons, fonts).
 */

const CACHE_VERSION = 'coffeenadu-admin-shell-v1';
const STATIC_SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
  '/favicon.ico',
];

const NEVER_CACHE_PATH_PREFIXES = [
  '/api/',
  '/.well-known/',
  '/sitemap.xml',
  '/@',
  '/src/',
  '/node_modules/',
];

const NEVER_CACHE_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'www.googleapis.com',
  'accounts.google.com',
];

function isSensitiveOrDynamicRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (request.headers.get('authorization')) return true;
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    return true;
  }
  if (
    url.origin === self.location.origin &&
    NEVER_CACHE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return true;
  }
  return false;
}

function isStaticShellAsset(url) {
  if (url.origin !== self.location.origin) {
    return (
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com'
    );
  }
  if (STATIC_SHELL_ASSETS.includes(url.pathname)) return true;
  if (url.pathname.startsWith('/assets/')) return true;
  return /\.(?:woff2?|ttf|svg|png|ico|webp)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.allSettled(
          STATIC_SHELL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' })))
        )
      )
      .then(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Strict NetworkOnly bypass for APIs, auth endpoints, Vite dev modules, and sensitive routes
  if (isSensitiveOrDynamicRequest(request, url)) {
    return;
  }

  // Navigation requests (including /admin and /): always fetch fresh from network
  // Never store authenticated admin HTML in CacheStorage.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        const isAdminRoute = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
        return new Response(
          `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0B192C" />
  <title>Offline — CoffeeNadu ${isAdminRoute ? 'Admin' : 'News'}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0B192C; color: #F8FAFC; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
    .card { max-width: 420px; width: 100%; background: #111C2E; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 28px; text-align: center; box-shadow: 0 20px 45px rgba(0,0,0,0.35); }
    .badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #FBBF24; margin-bottom: 10px; }
    h1 { margin: 0 0 10px; font-size: 20px; color: #FFFFFF; }
    p { margin: 0 0 20px; font-size: 14px; line-height: 1.55; color: #CBD5E1; }
    button { background: #F59E0B; color: #0B192C; border: 0; border-radius: 10px; padding: 11px 20px; font-size: 14px; font-weight: 700; cursor: pointer; }
    button:hover { background: #FBBF24; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">CoffeeNadu ${isAdminRoute ? 'Admin 2.0' : 'News'}</div>
    <h1>No Internet Connection</h1>
    <p>${
      isAdminRoute
        ? 'For security, CoffeeNadu Admin does not cache private dashboard data or sessions offline. Reconnect to the internet and tap Retry.'
        : 'You appear to be offline. Reconnect to load the latest Koppa Taluk Kannada news updates.'
    }</p>
    <button type="button" onclick="window.location.reload()">Retry Connection</button>
  </div>
</body>
</html>`,
          {
            status: 503,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          }
        );
      })
    );
    return;
  }

  // Static shell assets only: stale-while-revalidate with guaranteed Response fallback
  if (isStaticShellAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => cached || new Response('', { status: 503, statusText: 'Offline' }));

        return cached || networkPromise;
      })
    );
  }
});

// Notification click handler for opt-in admin alerts
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url.includes('/admin')) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
