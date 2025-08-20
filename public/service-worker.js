// ✅ Bump the cache version whenever you change this file or add new assets
const CACHE_NAME = 'sheariq-pwa-v8';

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

// Fetch: handle only same-origin static GETs
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip cross-origin and Firestore/WebChannel requests
  if (url.origin !== self.location.origin ||
      url.hostname.endsWith('googleapis.com') ||
      url.hostname.endsWith('gstatic.com') ||
      url.pathname.includes('/google.firestore.v1.Firestore/Listen/channel')) {
    return; // Let the browser handle it
  }

  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(event.request);
          return fresh;
        } catch (err) {
          const cachedPage = await caches.match(event.request);
          return cachedPage || await caches.match('dashboard.html') || Response.error();
        }
      })()
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
  }
});
