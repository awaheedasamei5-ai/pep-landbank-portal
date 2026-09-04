// Palmstead service worker -- Master Rebuild Spec Phase 9 ("Public
// surfaces & PWA parity": service worker, push notifications). Two real
// jobs, kept deliberately small: (1) receive and display a Web Push
// notification (the actual send side already exists and works --
// send-todo-alarms/send-push Edge Functions on production already read
// push_subscriptions and call the browser's push service; nothing there
// could ever reach a browser tab because no service worker existed to
// receive it), and (2) a minimal app-shell cache so the shell loads (even
// if API calls still need real connectivity) on a flaky connection.
// Deliberately NOT a full offline-first cache-everything strategy --
// this app's real data always needs a live Supabase connection; caching
// stale business data would silently show wrong pipeline/payment figures,
// exactly what the master spec's error-contract section warns against.

const SHELL_CACHE = 'palmstead-shell-v1';
const SHELL_ASSETS = ['/', '/favicon.svg', '/logo.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {
        // A missing asset (e.g. dev server hasn't built one yet) must
        // never block install -- an empty/partial shell cache is still
        // strictly better than no service worker at all.
      }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first for the app shell's own static assets only (same-origin,
// navigation/script/style/image requests) -- everything else (Supabase
// API calls, cross-origin) passes straight through untouched. A network
// failure on a shell asset falls back to cache; a cache miss falls back
// to network, matching a normal browser request with no interception.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (!['navigate', 'script', 'style', 'image'].includes(req.destination) && req.mode !== 'navigate') return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match('/'))),
  );
});

// Push payload shape matches send-push/send-todo-alarms' real body:
// { title, body, url, tag } (see index.html's apiSendPush -- ported
// faithfully, not invented). A malformed/empty payload still shows a
// generic notification rather than throwing and showing nothing at all.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Palmstead';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/logo.png',
    badge: '/favicon.svg',
    tag: data.tag || 'palmstead',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Focuses an already-open Palmstead tab if one exists (same-origin,
// regardless of path) instead of always opening a new one -- a staff
// member with the app already open in a background tab shouldn't end up
// with two tabs after tapping a notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
