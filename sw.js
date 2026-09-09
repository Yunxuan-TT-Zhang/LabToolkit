/* TheLabToolkit service worker — precache the app shell so it works offline and installs
   as a standalone app. Bump CACHE whenever the shipped files change. */

const CACHE = 'labtoolkit-v16';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Individual misses (e.g. an icon not yet generated) shouldn't abort the install.
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const putInCache = (req, res) => {
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  return res;
};

// The app shell — the files that carry bug fixes.
const IS_SHELL = /\.(?:html|js|css|webmanifest)$/i;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only manage our own origin; let the OCR CDN and anything else go straight to network.
  if (url.origin !== self.location.origin) return;

  /* Code is network-FIRST. Cache-first here meant a returning visitor could keep running a
     build from days ago and never see a fix — and `cache: 'no-cache'` is needed as well,
     otherwise the browser's own HTTP cache hands back a stale copy before we reach the
     network. It revalidates with an ETag, so the usual cost is a 304. Falls back to the
     cache when offline, which is what keeps the installed app working on a plane. */
  if (req.mode === 'navigate' || IS_SHELL.test(url.pathname)) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => putInCache(req, res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Icons and other static assets don't change without a filename change: cache-first.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req)
      .then((res) => putInCache(req, res))
      .catch(() => caches.match('./index.html')))
  );
});
