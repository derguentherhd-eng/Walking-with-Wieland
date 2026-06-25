/* ============================================================
   Walking with Wieland — Foto-Speicher (IndexedDB)
   Jedes Foto wird als Blob + vorab erzeugtes Thumbnail gespeichert.
   Bilder werden client-seitig auf max. 1600 px verkleinert (JPEG 0.8)
   um Speicherplatz auf iOS zu schonen.
============================================================ */
(function (global) {
  'use strict';

  var DB_NAME    = 'wwPhotoDB';
  var DB_VERSION = 1;
  var STORE      = 'wwPhotos';

  var _db = null;

  /* ── IndexedDB öffnen (gecacht) ────────────────────────────── */
  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('exerciseId', 'exerciseId', { unique: false });
          os.createIndex('world',      'world',      { unique: false });
          os.createIndex('date',       'date',       { unique: false });
          os.createIndex('timestamp',  'timestamp',  { unique: false });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  /* ── Canvas-Resize ─────────────────────────────────────────── */
  function resizeBlob(blob, maxEdge, quality) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h || (w <= maxEdge && h <= maxEdge)) { resolve(blob); return; }
        var scale  = maxEdge / Math.max(w, h);
        var canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (b) { resolve(b || blob); }, 'image/jpeg', quality || 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(blob); };
      img.src = url;
    });
  }

  function makeThumbnail(blob, size) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale  = size / Math.max(w, h, 1);
        var canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }

  /* ── UUID-Fallback für iOS < 15.4 ─────────────────────────── */
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* ── ISO-Datum aus Timestamp ───────────────────────────────── */
  function tsToISO(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart('00', '0').slice(-2) + '-' +
      String(d.getDate()).padStart('00', '0').slice(-2);
  }
  // String.padStart-Fallback für sehr alte Engines
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function tsToISOSafe(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* ── Foto speichern ────────────────────────────────────────── */

  /**
   * savePhoto({ exerciseId, world, blob }) → Promise<entry>
   * Verkleinert das Bild und erzeugt ein Thumbnail vor dem Speichern.
   */
  function savePhoto(opts) {
    return openDB().then(function (db) {
      return resizeBlob(opts.blob, 1600, 0.8).then(function (resized) {
        return makeThumbnail(resized, 200).then(function (thumbDataUrl) {
          var now = Date.now();
          var entry = {
            id:           uuid(),
            exerciseId:   opts.exerciseId,
            world:        opts.world,
            date:         tsToISOSafe(now),
            timestamp:    now,
            blob:         resized,
            thumbDataUrl: thumbDataUrl,
          };
          return new Promise(function (resolve, reject) {
            var tx  = db.transaction(STORE, 'readwrite');
            var req = tx.objectStore(STORE).add(entry);
            req.onsuccess = function ()    { resolve(entry); };
            req.onerror   = function (e)   { reject(e.target.error); };
          });
        });
      });
    });
  }

  /* ── Abfragen ───────────────────────────────────────────────── */

  function getAll(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function (e) {
        var items = (e.target.result || []).slice();
        items.sort(function (a, b) { return b.timestamp - a.timestamp; });
        resolve(items);
      };
      request.onerror = function (e) { reject(e.target.error); };
    });
  }

  function getPhotosByExercise(exerciseId) {
    return openDB().then(function (db) {
      var tx  = db.transaction(STORE, 'readonly');
      var idx = tx.objectStore(STORE).index('exerciseId');
      return getAll(idx.getAll(exerciseId));
    });
  }

  function getAllPhotos() {
    return openDB().then(function (db) {
      var tx = db.transaction(STORE, 'readonly');
      return getAll(tx.objectStore(STORE).getAll());
    });
  }

  function getPhotosGroupedByDate() {
    return getAllPhotos().then(function (items) {
      var groups = {}, order = [];
      items.forEach(function (p) {
        if (!groups[p.date]) { groups[p.date] = []; order.push(p.date); }
        groups[p.date].push(p);
      });
      order.sort(function (a, b) { return b.localeCompare(a); });
      return order.map(function (date) { return { date: date, photos: groups[date] }; });
    });
  }

  function getPhotosByWorld(world) {
    return openDB().then(function (db) {
      var tx  = db.transaction(STORE, 'readonly');
      var idx = tx.objectStore(STORE).index('world');
      return getAll(idx.getAll(world));
    });
  }

  function getPhotoById(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function (e) { resolve(e.target.result || null); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function deletePhoto(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(STORE, 'readwrite');
        var req = tx.objectStore(STORE).delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /* ── Export ────────────────────────────────────────────────── */
  var WW = global.WW = global.WW || {};
  WW.photoStore = {
    savePhoto:              savePhoto,
    getPhotosByExercise:    getPhotosByExercise,
    getAllPhotos:            getAllPhotos,
    getPhotosGroupedByDate: getPhotosGroupedByDate,
    getPhotosByWorld:       getPhotosByWorld,
    getPhotoById:           getPhotoById,
    deletePhoto:            deletePhoto,
  };

}(typeof window !== 'undefined' ? window : this));
