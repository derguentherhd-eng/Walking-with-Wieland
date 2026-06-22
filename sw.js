/* Walking with Wieland – minimaler Service Worker (App-Shell-Cache).
   Cacht nur eigene Dateien (same-origin). Karten-Kacheln und CDN-Skripte
   werden absichtlich NICHT gecacht und laufen direkt übers Netz. */
'use strict';

var CACHE = 'ww-shell-v2';
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
  'assets/icon-512.png',
  'assets/Audio%20Waypoint.mp3',
  'assets/Audio%20%C3%9Cbung.mp3'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
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

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(function (wins) {
    for (var i = 0; i < wins.length; i++) {
      if (wins[i].url.indexOf('walk.html') !== -1) { wins[i].focus(); return; }
    }
    return clients.openWindow('walk.html');
  }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // Fremde Ursprünge (CDN, Karten-Kacheln, ORS-API) unangetastet lassen
  if (url.origin !== self.location.origin) return;

  // Navigationsanfragen: Netz zuerst, bei Offline auf gecachte Version zurückfallen
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match(req, { ignoreSearch: true })
          .then(function (r) { return r || caches.match('index.html'); });
      })
    );
    return;
  }

  // Assets: Netz zuerst (damit Änderungen sofort wirken), bei Offline Cache
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true });
    })
  );
});
