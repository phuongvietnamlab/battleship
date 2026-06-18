// Service Worker for Sea Battle PWA
// Network-first for HTML (so a new deploy is picked up immediately), cache-first
// for hashed static assets (app.js?v=, style.css?v= — the hash changes per
// deploy, so the URL itself busts the cache).

const CACHE_NAME = 'sea-battle-v2';

// Install: take over as soon as possible. No precache of '/' — the fetch
// handler is network-first for HTML, so precaching would only risk staleness.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: drop any cache that isn't the current version (purges the old
// stale-cache-first entries from sea-battle-v1) and claim open clients.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Only handle http/https — chrome-extension:// and other schemes cannot be cached
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/auth/')) return;

  // Network-first for page navigations / HTML: always fetch the latest
  // index.html so its fresh ?v= asset hashes are honored. Fall back to cache
  // only when offline. This is what stops the "fixed but still old until I F5
  // a few times" behavior (the old SW returned cached HTML first).
  if (e.request.mode === 'navigate' || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request).then((c) => c || caches.match('/')))
    );
    return;
  }

  // Static assets (hashed JS/CSS, icons): cache-first, refresh in background.
  // Safe because hashed URLs change per deploy → a new build is a cache miss →
  // fetched fresh.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
