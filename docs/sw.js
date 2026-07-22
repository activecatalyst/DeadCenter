/* Dead Center — offline shell.
   Bump CACHE whenever any precached file changes, or clients keep the old copy.

   Strategy:
     navigation + seats.js + app.js -> network first, fall back to cache
       (so a fix lands on next load rather than being pinned forever)
     styles/icons/manifest          -> cache first (they rarely change)
*/
var CACHE = 'deadcenter-v8';
var SHELL = ['./', 'index.html', 'app.js', 'seats.js', 'styles.css', 'manifest.json',
             'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'og.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  var path = new URL(req.url).pathname;
  var fresh = req.mode === 'navigate' || /(seats|app)\.js$/.test(path);

  if (fresh) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('index.html');
        });
      })
    );
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    });
  }));
});
