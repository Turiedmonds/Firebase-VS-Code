// ✅ Bump the cache version whenever you change this file or add new assets
const CACHE_NAME = 'sheariq-pwa-v14';
const FIREBASE_CDN_CACHE = 'firebase-cdn';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

const FILES_TO_CACHE = [
  '/offline.html',
  '/tally.html',
  '/dashboard.html',
  '/styles.css',
  '/tally.js',
  '/dashboard.js',
  '/auth-check.js',

  '/auth-check.html',
  '/login.html',
  '/auth.js',
  '/export.js',
  '/login.js',
  '/firebase-init.js',
  '/xlsx.full.min.js',

  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png',

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

// Fetch: handle navigations and runtime caching
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const path = new URL(event.request.url).pathname;
      try {
        const net = await fetch(event.request);
        if (path.endsWith('/tally.html')) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('/tally.html', net.clone());
        }
        return net;
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        if (path.endsWith('/tally.html')) {
          const cachedTally = await cache.match('/tally.html');
          if (cachedTally) {
            console.log('[service-worker] Offline: serving cached tally.html');
            return cachedTally;
          }
          return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div>Tally page not available offline.</div></body>', { headers: { 'Content-Type': 'text/html' }});
        }
        if (path.endsWith('/dashboard.html')) {
          const cachedDash = await cache.match('/dashboard.html');
          if (cachedDash) {
            console.log('[service-worker] Offline: serving cached dashboard.html');
            return cachedDash;
          }
        }
        const cachedOffline = await cache.match('/offline.html');
        if (cachedOffline) return cachedOffline;
        return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div>Offline. Open once while online to cache pages.</div></body>', { headers: { 'Content-Type': 'text/html' }});
      }
    })());
    return;
  }

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

  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
