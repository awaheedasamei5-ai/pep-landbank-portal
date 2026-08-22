/* Palmstead (PEP Landbank) — service worker
   Provides an installable, offline-tolerant app shell.
   Your data (leads, enquiries, etc.) always comes live from Supabase when online —
   this only caches the app shell so the portal still opens with no signal. */

const CACHE_NAME = 'pep-portal-v8';
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './logo.png',
  './trulander-logo.png',
  './site-plan.jpg',
  './pipeline-template.xlsx',
  './contract-cover.jpg',
  './trulander-wordmark.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never cache Supabase API calls or auth — those must always be live.
  if (req.url.includes('supabase.co')) return;

  // App shell: network-first so staff always get the newest build when online,
  // falling back to the cached copy the moment the connection drops. cache:
  // 'no-store' alone turned out not to be enough -- it stops the BROWSER's own
  // HTTP cache from serving a stale response, but GitHub Pages' own CDN
  // (Fastly) serves index.html/sw.js with cache-control:max-age=600 regardless
  // of that request option, meaning every deploy could take up to ~10 minutes
  // to actually reach staff, and any tab already open would keep silently
  // running whatever old (possibly buggy) code it started with -- confirmed
  // directly against the live production headers, not assumed. Appending a
  // changing query string to the OUTGOING request (never touching the cache
  // KEY, which stays the clean original URL) makes Fastly treat every fetch as
  // a fresh, uncacheable URL, so this now always reaches the true origin.
  if (req.mode === 'navigate' || APP_SHELL.some((p) => req.url.endsWith(p.replace('./', '')))) {
    const bustedUrl = req.url + (req.url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    event.respondWith(
      fetch(bustedUrl, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (fonts, Supabase JS CDN, etc.): cache-first, refresh in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Web Push -- fires regardless of whether the app is open in a tab, so alarms
// and reminders reach staff/clients who only ever opened this as a bookmark or
// installed PWA and never left a tab running. Payload shape is set by send-push.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'Palmstead';
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './favicon-32.png',
    tag: data.tag || 'general',
    data: { url: data.url || './index.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.focus(); if ('navigate' in client) client.navigate(targetUrl); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
