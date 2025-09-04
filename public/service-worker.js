// ✅ Bump the cache version whenever you change this file or add new assets
const CACHE_NAME = 'sheariq-pwa-v12';
const FIREBASE_CDN_CACHE = 'firebase-cdn';

self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

const FILES_TO_CACHE = [
  // HTML entry points (include the start_url from manifest)
  'auth-check.html',
  'dashboard.html',
  'tally.html',
  // ✅ Explicitly cache the login page so it is available offline
  'login.html',

  // App assets (keep existing names; do NOT rename)
  'styles.css',
  'tally.js',
  'dashboard.js',
  'auth.js',
  'export.js',
  'login.js',
  'auth-check.js',
  'firebase-init.js',
  'xlsx.full.min.js',

  // PWA essentials
  'manifest.json',
  'icon-192.png',
  'icon-512.png',   // ✅ new for Android install
  'serviceworker.js', // optional but OK to cache
  'logo.png',

  // Firebase compat scripts
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check-compat.js'
];

// Install: cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![CACHE_NAME, FIREBASE_CDN_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    )
  );
});

// Fetch: handle GETs and runtime caching
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Runtime cache for Firebase CDN scripts
  if (url.href.startsWith('https://www.gstatic.com/firebasejs/')) {
    event.respondWith((async () => {
      const cache = await caches.open(FIREBASE_CDN_CACHE);
      const cached = await cache.match(event.request);
      const fetchPromise = fetch(event.request).then(resp => {
        cache.put(event.request, resp.clone());
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }

  // Skip other cross-origin and Firestore/WebChannel requests
  if (url.origin !== self.location.origin ||
      url.hostname.endsWith('googleapis.com') ||
      url.pathname.includes('/google.firestore.v1.Firestore/Listen/channel')) {
    return; // Let the browser handle it
  }

  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) return networkResponse;
        throw new Error('Network error');
      } catch (err) {
        const fallback = await caches.match('tally.html');
        return fallback || new Response('Offline — open the app once online to pre-cache pages', {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
