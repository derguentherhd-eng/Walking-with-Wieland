/* Walking with Wieland – minimaler Service Worker (App-Shell-Cache).
   Cacht nur eigene Dateien (same-origin). Karten-Kacheln und CDN-Skripte
   werden absichtlich NICHT gecacht und laufen direkt übers Netz. */
'use strict';

var CACHE = 'ww-shell-v1';
var SHELL = [
  './',
  'index.html',
  'checkin.html',
  'walk.html',
  'stats.html',
  'collection.html',
  'settings.html',
  'css/style.css',
  'js/exercises.js',
  'js/trophies.js',
  'js/app.js',
  'js/home.js',
  'js/checkin.js',
  'js/walk.js',
  'js/stats.js',
  'js/collection.js',
  'js/settings.js',
  'manifest.json',
  'assets/wieland.png',
  'assets/hintergrund.jpg',
  'assets/icon-180.png',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // einzeln hinzufügen, damit ein fehlendes Asset die Installation nicht abbricht
      return Promise.all(SHELL.map(function (url) {
        return c.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // Fremde Ursprünge (CDN, Karten-Kacheln, ORS-API) unangetastet lassen
  if (url.origin !== self.location.origin) return;

  // Navigationsanfragen: Netz zuerst, bei Offline auf index.html zurückfallen
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
      })
    );
    return;
  }

  // Sonstige eigene Dateien: Cache zuerst, sonst Netz (und nachladen)
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
