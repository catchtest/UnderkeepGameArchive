'use strict';

const scope = new URL(self.registration.scope);
const cacheName = 'underkeep-shared:' + scope.pathname;
const revisions = {{site:asset-revisions}};

function isCurrentAsset(url) {
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return false;
  const revision = revisions[url.pathname.slice(scope.pathname.length)];
  return typeof revision === 'string' && url.search === '?v=' + revision;
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      if (await caches.has(cacheName)) {
        const cache = await caches.open(cacheName);
        const obsolete = (await cache.keys()).filter(request => !isCurrentAsset(new URL(request.url)));
        await Promise.all(obsolete.map(request => cache.delete(request)));
      }
    } catch {
      // The site still works with the browser HTTP cache alone.
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !isCurrentAsset(new URL(request.url))) return;
  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(cacheName);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch {
      // Browser storage can be unavailable.
    }
    // The revision changes with the asset, so a browser cache hit is still valid.
    const response = await fetch(request, { cache: 'force-cache' });
    if (cache && response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  })());
});
