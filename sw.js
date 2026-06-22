/* Tasbih Counter service worker
   Strategy:
   - HTML / navigation requests  → network-first (always show the latest deploy,
     fall back to cache only when offline)
   - other same-origin assets    → stale-while-revalidate (fast load, refresh in
     the background so updates are picked up on the next open)
   Bump CACHE_VERSION on each release to evict the old cache. */
const CACHE_VERSION = 'tasbih-v11';

self.addEventListener('install', (event) => {
  // Don't auto-activate. Wait until the page tells us to (via the update
  // banner) so the user isn't interrupted by a surprise reload.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Treat page navigations (and the HTML doc) as network-first.
  const isNavigation =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (_) {
          const cached = await caches.match(req);
          return cached || caches.match('./index.html');
        }
      })()
    );
    return;
  }

  // Only manage our own assets; let cross-origin (CDN, API) pass through.
  if (!sameOrigin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
