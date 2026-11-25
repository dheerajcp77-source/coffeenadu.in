/* CoffeeNadu News & Admin 2.0 Service Worker
 * Security policy:
 * - NEVER cache /api/* responses, administrator credentials, auth tokens,
 *   Firebase/Google auth endpoints, Apps Script calls, or authenticated pages.
 * - Cache ONLY static public shell assets (JS/CSS bundles, icons, fonts).
 */

const CACHE_VERSION = 'coffeenadu-shell-v2';
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
<html lang="kn">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#10243D" />
  <title>Offline — Coffeenadu ${isAdminRoute ? 'Admin' : 'News'}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #10243D; color: #F8FAFC; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
    .card { max-width: 440px; width: 100%; background: #162B47; border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 28px; text-align: center; box-shadow: 0 20px 45px rgba(0,0,0,0.35); }
    .badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #D9A441; margin-bottom: 10px; }
    h1 { margin: 0 0 8px; font-size: 20px; color: #FFFFFF; }
    p { margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #CBD5E1; }
    .kn { font-size: 13px; color: #E2E8F0; margin-bottom: 20px; }
    button { background: #D9A441; color: #10243D; border: 0; border-radius: 10px; padding: 11px 22px; font-size: 14px; font-weight: 700; cursor: pointer; }
    button:hover { background: #E5B65C; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Coffeenadu ${isAdminRoute ? 'Admin 2.0' : 'News'}</div>
    <h1>No Internet Connection</h1>
    <p>${
      isAdminRoute
        ? 'For security, Coffeenadu Admin does not cache private dashboard data or sessions offline. Reconnect to the internet and tap Retry.'
        : 'You appear to be offline. Reconnect to load the latest Koppa Taluk & Malnad Kannada news updates.'
    }</p>
    ${
      isAdminRoute
        ? ''
        : '<p class="kn">ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಕಡಿತಗೊಂಡಿದೆ. ತಾಜಾ ಕೊಪ್ಪ ಹಾಗೂ ಮಲೆನಾಡು ಸುದ್ದಿಗಳಿಗಾಗಿ ದಯವಿಟ್ಟು ಮರುಪ್ರಯತ್ನಿಸಿ.</p>'
    }
    <button type="button" onclick="window.location.reload()">Retry · ಮರುಪ್ರಯತ್ನಿಸಿ</button>
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

// Web Push incoming alert handler
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Coffeenadu News',
    body: 'ತಾಜಾ ಕೊಪ್ಪ ಹಾಗೂ ಮಲೆನಾಡು ಸುದ್ದಿಗಳು ಲಭ್ಯವಿವೆ.',
    url: '/',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    image: undefined,
    tag: 'coffeenadu-news-alert',
    articleId: '',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: typeof parsed.title === 'string' && parsed.title ? parsed.title : payload.title,
          body: typeof parsed.body === 'string' && parsed.body ? parsed.body : payload.body,
          url: typeof parsed.url === 'string' && parsed.url ? parsed.url : '/',
          icon: typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : '/pwa-192x192.png',
          badge: typeof parsed.badge === 'string' && parsed.badge ? parsed.badge : '/pwa-192x192.png',
          image: typeof parsed.image === 'string' && parsed.image ? parsed.image : undefined,
          tag: typeof parsed.tag === 'string' && parsed.tag ? parsed.tag : payload.tag,
          articleId: typeof parsed.articleId === 'string' ? parsed.articleId : '',
        };
      }
    } catch {
      try {
        const rawText = event.data.text();
        if (rawText) payload.body = rawText.slice(0, 240);
      } catch {
        // Keep default payload
      }
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    renotify: Boolean(payload.tag),
    data: {
      url: payload.url,
      articleId: payload.articleId,
    },
  };
  if (payload.image) {
    options.image = payload.image;
  }

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Notification click handler: opens target article/route in existing tab or new window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = (event.notification.data && event.notification.data.url) || '/';
  let targetPath = '/';
  try {
    const parsed = new URL(rawTarget, self.location.origin);
    targetPath = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    targetPath = '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            client.postMessage({ type: 'COFFEENADU_OPEN_URL', url: targetPath });
            if ('focus' in client) {
              await client.focus();
            }
            if ('navigate' in client && clientUrl.pathname !== '/admin') {
              await client.navigate(targetPath).catch(() => undefined);
            }
            return client;
          }
        } catch {
          // Try next client
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }
      return undefined;
    })
  );
});
