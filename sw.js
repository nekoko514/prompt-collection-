// プロンプト置き場 — Service Worker
// Strategy:
//   - Network-first for HTML/navigation (always try fresh first)
//   - Stale-while-revalidate for static assets (fast load + background update)
//   - Cache-only fallback when offline

const VERSION = 'v2';
const CACHE_NAME = `prompt-collection-${VERSION}`;

// Minimal precache: index + manifest + icons. Card pages and per-card images
// are fetched on demand and cached opportunistically.
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './ogp.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isHTMLRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET on same origin
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML so updates show immediately
  if (isHTMLRequest(req)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        if (res && res.ok && res.status < 400) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Optional: receive a message from page to skip waiting and activate immediately
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
