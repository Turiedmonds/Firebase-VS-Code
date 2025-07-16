const CACHE_NAME = 'sheariq-pwa-v2';
const FILES_TO_CACHE = [
  'index.html',
  'login.html',
  'styles.css',
  'main.js',
  'login.js',
  'xlsx.full.min.js',
  'logo.png',
  'manifest.json',
  'icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
