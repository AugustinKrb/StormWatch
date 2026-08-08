// Stale-while-revalidate for the static app shell only — never touches /api/ or /frames/, so live radar/data stays always-fresh.
var CACHE_NAME = 'stormwatch-shell-v1';
var LIVE_PREFIXES = ['/api/', '/frames/'];

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (LIVE_PREFIXES.some(function (p) { return url.pathname.startsWith(p); })) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(e.request).then(function (cached) {
        var network = fetch(e.request).then(function (response) {
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
