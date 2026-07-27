const CACHE_NAME = 'stand-tracker-v2';

const PRE_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/version.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.png',
  '/icons/apple-touch-icon.png'
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRE_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Message: handle skip waiting from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: cache-first for CSS/JS, network-first for HTML
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Cache-first for static assets
  if (url.pathname.match(/\.(css|js|png|svg|ico|json)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for HTML / navigation requests
  if (request.mode === 'navigate' || url.pathname.match(/\.html$/) || url.pathname === '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Default: cache-first fallback
  event.respondWith(cacheFirst(request));
});

// --- Strategies ---

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      return response;
    });
  });
}

function networkFirst(request) {
  return fetch(request).then((response) => {
    if (!response || response.status !== 200 || response.type !== 'basic') return response;
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    return response;
  }).catch(() => {
    return caches.match(request);
  });
}
