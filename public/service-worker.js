// public/service-worker.js
// SHEΔR iQ PWA — role-safe, auth-check fallback for navigations
// Bump this when deploying
const CACHE_VERSION = 'sheariq-v11';
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;

// Cache *explicit* core shell (no wildcards)
const CORE_ASSETS = [
  '/', // if served at site root; otherwise remove
  '/auth-check.html',
  '/dashboard.html',
  '/tally.html',
  '/login.html',

  // JS (add the ones you actually use)
  '/app-launch-guard.js',
  '/auth-check.js',
  '/login.js',
  '/tally.js',
  '/auth.js',

  // CSS (add your main stylesheet paths)
  '/styles.css',
];

// Install: cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
    self.skipWaiting();
  })());
});

// Activate: cleanup old caches + take control
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.map((name) => {
        if (name !== STATIC_CACHE && name !== RUNTIME_CACHE) {
          return caches.delete(name);
        }
      })
    );
    await self.clients.claim();
  })());
});

// Helper: put in cache safely
async function putRuntime(request, response) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  } catch (_) { /* ignore quota errors */ }
  return response;
}

// Fetch: special handling for navigations (HTML)
// Strategy: Network-first; on failure, FALLBACK TO auth-check.html
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // Navigation requests → network-first + fallback
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        // Cache good HTML responses
        if (net && net.status === 200 && net.headers.get('content-type')?.includes('text/html')) {
          await putRuntime(req, net.clone());
        }
        return net;
      } catch (err) {
        // Role is NOT accessible here; always serve auth-check.html
        const cachedFallback = await caches.match('/auth-check.html');
        if (cachedFallback) return cachedFallback;

        // As a last resort, try any cached page to avoid a blank screen
        const any = await caches.match('/dashboard.html') || await caches.match('/tally.html') || await caches.match('/login.html');
        if (any) return any;

        return new Response('<!doctype html><title>Offline</title><h1>Offline</h1><p>No cached shell available.</p>', {
          headers: {'Content-Type': 'text/html'}
        });
      }
    })());
    return;
  }

  // For other GET requests:
  // Static assets → cache-first
  const url = new URL(req.url);
  const isCore = CORE_ASSETS.includes(url.pathname);

  if (isCore) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        return await putRuntime(req, net);
      } catch (_) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Everything else → stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req)
      .then((net) => {
        if (net && net.status === 200) cache.put(req, net.clone());
        return net;
      })
      .catch(() => null);
    return cached || fetchPromise || Response.error();
  })());
});
