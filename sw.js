// Offline support. Network first (so a new deploy shows up straight away),
// falling back to the cached copy when the gym signal drops.
const CACHE = 'novo-tracker-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/stats.js',
  './js/format.js',
  './js/exercises.js',
  './js/chart.js',
  './js/icons.js',
  './icons/favicon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const TIMEOUT_MS = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fromNetwork = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    fromNetwork.catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
    try {
      const res = await Promise.race([fromNetwork, timeout]);
      if (res) return res;
    } catch {}
    const cached = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' && await cache.match('./index.html'));
    return cached || fromNetwork;
  })());
});
