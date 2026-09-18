const CACHE = 'pitchrec-v277';
const ASSETS = ['/', '/index.html', '/manifest.json', '/shared.js', '/train.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Force all clients to reload after SW update
        self.clients.matchAll({type:'window'}).then(clients => {
          clients.forEach(client => client.navigate(client.url));
        });
      })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname !== self.location.hostname) {
    e.respondWith(fetch(e.request));
    return;
  }
  if (url.pathname.startsWith('/.netlify/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Network first dla HTML ORAZ "czystych" adresów bez rozszerzenia (np. /map, /train) —
  // wcześniej tylko *.html miało network-first, więc /map (bez .html) trafiał w regułę
  // cache-first niżej i NIGDY się nie odświeżał, niezależnie od tego ile razy wgrywano nową wersję.
  var isCleanPageUrl = !url.pathname.includes('.') && url.pathname !== '/';
  if (url.pathname.endsWith('.html') || url.pathname === '/' || isCleanPageUrl) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request)
      .then(r => r || fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
      )
      .catch(() => caches.match('/index.html'))
  );
});
