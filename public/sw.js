// Service Worker for Sea Battle PWA
// Minimal: caches app shell for fast launch, network-first for dynamic content

const CACHE_NAME = 'sea-battle-v1';
const SHELL_FILES = [
  '/',
  '/style.css',
  '/dist/app.js',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: cache shell files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API/socket, cache-first for static assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Skip non-GET, socket.io, and API calls
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/auth/')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((response) => {
        // Update cache with fresh response
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached); // Offline fallback to cache
      return cached || fetchPromise;
    })
  );
});
