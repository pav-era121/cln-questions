// Service Worker for CLN Questions PWA
const CACHE_NAME = 'cln-questions-v1.0.0';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/api.js',
  '/js/app.js',
  '/js/quiz.js',
  '/js/arena.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg'
];

// Install: Cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('PWA precache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Purge old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart network/cache routing
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Do NOT intercept non-GET requests or browser-extension requests
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. API calls: Always fetch fresh from network (zero caching of live quiz/arena/auth data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ error: 'You are currently offline. Please check your internet connection.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 3. Navigation requests (HTML page): Network-First, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 4. Static Assets (CSS, JS, Images, Icons): Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => cachedRes);

      return cachedRes || fetchPromise;
    })
  );
});
