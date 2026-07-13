const CACHE_NAME = 'hitster-v4';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/') || event.request.url.includes('/socket.io/') || event.request.url.includes('spotify.com')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached ?? fetch(event.request).then(async response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const cacheCopy = response.clone();
      try {
        await caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheCopy));
      } catch (error) {
        console.warn('[SW] Could not cache response', event.request.url, error);
      }
    }
    return response;
  })));
});
