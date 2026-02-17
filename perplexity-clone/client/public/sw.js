const CACHE_NAME = 'wick-city-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install - cache essential static assets
self.addEventListener('install', function(event) {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate - clean up old caches
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch - Network first for API, Cache first for static assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API requests: Network only (never cache API responses)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ error: 'You are offline. Please check your connection.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Static assets: Stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      var fetchPromise = fetch(event.request).then(function(networkResponse) {
        // Only cache valid responses
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          var responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(function() {
        // If network fails and no cache, return offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return undefined;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
