// ✅ Bump the cache version whenever you change this file or add new assets
const CACHE_NAME = 'sheariq-pwa-v5';

const FILES_TO_CACHE = [
  // HTML entry points (include the start_url from manifest)
  'auth-check.html',
  'dashboard.html',
  'tally.html',
  'farm-summary.html',
  'login.html',

  // App assets (keep existing names; do NOT rename)
  'styles.css',
  'tally.js',
  'auth.js',
  'export.js',
  'login.js',
  'xlsx.full.min.js',

  // PWA essentials
  'manifest.json',
  'icon-192.png',
  'icon-512.png',   // ✅ new for Android install
  'serviceworker.js', // optional but OK to cache
  'logo.png'
];

// Install: cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting(); // activate new SW ASAP after install
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // control pages immediately
});

// Fetch: network-first for navigations, cache-first for others
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Try network for HTML navigations
          const fresh = await fetch(event.request);
          return fresh;
        } catch (err) {
          // Fallback to cached dashboard if offline
          const cached = await caches.match('dashboard.html');
          return cached || Response.error();
        }
      })()
    );
  } else {
    // Static files: cache-first
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
  }
});
