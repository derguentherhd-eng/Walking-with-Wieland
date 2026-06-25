/* ============================================================
   Walking with Wieland — Kamera, Lightbox, Galerien
   Abhängig von photoStore.js (muss vorher geladen sein).

   iOS-Kompatibilitätshinweise (navigator.share mit Dateien):
   • navigator.share({ files }) ist ab iOS 15 stabil (Safari 15+).
   • iOS 14 kennt zwar navigator.share, unterstützt aber keine Dateien
     → canShare({ files }) gibt false zurück → Download-Fallback greift.
   • navigator.mediaDevices.getUserMedia({ video }) war in WKWebView
     und Add-to-Home-Screen-PWAs bis iOS 14.3 gesperrt; ab iOS 14.3+
     (Safari-Update) verfügbar. Für ältere Geräte greift der
     <input capture="environment">-Fallback.
   • camera.js prüft navigator.mediaDevices && getUserMedia und
     fängt NotAllowedError / alle anderen Fehler defensiv ab.
     Kamera ist NIE ein Hard-Blocker: „Ohne Foto weiter" ist immer
     sichtbar.
============================================================ */
(function (global) {
  'use strict';

  var CAMERA_ENABLED_IDS = ['5.1', '5.2', '5.4', '5.6', '5.10', '5.11'];

  /* ── Foto in System-Galerie/Downloads exportieren ──────────── */

  /**
   * exportPhotoToGallery(blob, filename) → Promise
   * Auf iOS ab v15: navigator.share öffnet das Share-Sheet,
   * von dort kann der User „Bild sichern" wählen.
   * Ältere iOS / kein Share API → klassischer Download-Link.
   */
  function exportPhotoToGallery(blob, filename) {
    var fn   = filename || ('wieland-' + Date.now() + '.jpg');
    var file = new File([blob], fn, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file] }).catch(function () {/* User hat abgebrochen */});
    }
    var url = URL.createObjectURL(blob);
    var a   = document.createElement('a');
    a.href = url; a.download = fn;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return Promise.resolve();
  }

  /* ── Kamera-Overlay ─────────────────────────────────────────
     Primär: getUserMedia (Live-Vorschau + Canvas-Snapshot).
     Fallback: <input type="file" capture="environment">.
     "Ohne Foto weiter" ist immer sichtbar (kein Hard-Blocker).
  ────────────────────────────────────────────────────────────── */

  /**
   * openCamera(opts)
   * opts = {
   *   multi:     bool,            // true → mehrere Fotos (counter-Modus)
   *   count:     number,          // aktuell bereits aufgenommene Anzahl
   *   target:    number|null,     // Ziel-Anzahl (Anzeige); null = einzelnes Foto
   *   onCapture: fn(blob)→Promise // nach jedem Foto aufgerufen
   *   onDone:    fn()             // wenn Overlay geschlossen wird
   * }
   */
  function openCamera(opts) {
    opts        = opts        || {};
    var multi   = !!opts.multi;
    var target  = opts.target || null;
    var onCap   = opts.onCapture || function () { return Promise.resolve(); };
    var onDone  = opts.onDone    || function () {};
    var taken   = opts.count || 0;
    var stream  = null;
    var busy    = false; /* verhindert Doppel-Klick auf Auslöser */

    var overlay = document.createElement('div');
    overlay.className = 'cam-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Kamera');

    var counterHTML = target
      ? '<div class="cam-counter" id="cam-counter">' + taken + ' / ' + target + '</div>'
      : '';

    overlay.innerHTML =
      '<div class="cam-inner">' +
        '<div class="cam-preview-wrap" id="cam-pw">' +
          '<video class="cam-video" id="cam-video" autoplay playsinline muted></video>' +
          '<canvas id="cam-canvas" hidden style="display:none"></canvas>' +
        '</div>' +
        '<div class="cam-controls">' +
          counterHTML +
          '<button class="cam-shutter" id="cam-shutter" type="button" aria-label="Foto aufnehmen"></button>' +
          '<button class="cam-close-btn" id="cam-close" type="button" aria-label="Schließen">&#215;</button>' +
        '</div>' +
        '<p class="cam-hint" id="cam-hint"></p>' +
        /* Fallback-Bereich (initial hidden) */
        '<div class="cam-fallback" id="cam-fallback" hidden>' +
          '<p class="cam-fallback__text" id="cam-fallback-msg">Die Live-Kamera ist auf diesem Gerät nicht verfügbar.<br>Tippe, um ein Foto mit der Kamera-App aufzunehmen.</p>' +
          '<label class="btn cam-fallback__btn" for="cam-file-input">Foto aufnehmen</label>' +
          '<input type="file" accept="image/*" capture="environment" id="cam-file-input" style="position:absolute;width:1px;height:1px;opacity:0">' +
          '<button class="btn btn-ghost btn-sm cam-skip-btn" id="cam-skip" type="button">Ohne Foto weiter</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var video     = document.getElementById('cam-video');
    var canvas    = document.getElementById('cam-canvas');
    var shutter   = document.getElementById('cam-shutter');
    var closeBtn  = document.getElementById('cam-close');
    var hint      = document.getElementById('cam-hint');
    var fallback  = document.getElementById('cam-fallback');
    var counterEl = document.getElementById('cam-counter');
    var fileInput = document.getElementById('cam-file-input');
    var skipBtn   = document.getElementById('cam-skip');

    function stopStream() {
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    }

    function close() { stopStream(); overlay.remove(); onDone(); }

    function showFallback(reason) {
      stopStream();
      document.getElementById('cam-pw').hidden = true;
      shutter.hidden = true;
      if (reason === 'denied') {
        document.getElementById('cam-fallback-msg').innerHTML =
          'Wieland braucht Zugriff auf deine Kamera.<br>' +
          '<small>Kamera-Zugriff in den Einstellungen erlauben, dann noch einmal öffnen.</small>';
      }
      fallback.hidden = false;
    }

    function handleCapture(blob) {
      if (busy) return Promise.resolve();
      busy = true;
      return onCap(blob).then(function () {
        taken += 1;
        if (counterEl) counterEl.textContent = taken + ' / ' + target;
        if (!multi || (target && taken >= target)) {
          close();
        } else {
          var rem = target ? (target - taken) : 0;
          if (rem > 0) {
            hint.textContent = 'Super! Noch ' + rem + ' weitere.';
            setTimeout(function () { if (hint) hint.textContent = ''; }, 2200);
          }
          busy = false;
        }
      }).catch(function () { busy = false; });
    }

    /* Auslöser: Canvas-Snapshot vom Video-Stream */
    shutter.addEventListener('click', function () {
      if (!stream || busy) return;
      var vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      canvas.width = vw; canvas.height = vh;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(function (blob) {
        if (blob) handleCapture(blob);
      }, 'image/jpeg', 0.85);
    });

    closeBtn.addEventListener('click', close);
    skipBtn.addEventListener('click', close);

    /* Fallback: file input */
    fileInput.addEventListener('change', function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      var file = fileInput.files[0];
      fileInput.value = '';
      handleCapture(file);
    });

    /* getUserMedia versuchen */
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showFallback('unavailable');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function (s) {
        stream = s;
        video.srcObject = stream;
        video.play().catch(function () {});
      })
      .catch(function (err) {
        var denied = err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        showFallback(denied ? 'denied' : 'unavailable');
      });
  }

  /* ── Lightbox ───────────────────────────────────────────────
     Lädt Vollbild-Blob aus IndexedDB, zeigt Thumbnail sofort.
     Wiederverwendbar für Statistik und Höhle.
  ────────────────────────────────────────────────────────────── */

  /**
   * openLightbox(photos, startIndex)
   * photos: Array von photo-Objekten (mindestens: { id, thumbDataUrl, date })
   */
  function openLightbox(photos, startIndex) {
    if (!photos || !photos.length) return;
    var idx     = startIndex || 0;
    var blobMap = {}; /* id → object-URL, wird beim Schließen widerrufen */

    var box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Foto-Ansicht');

    box.innerHTML =
      '<button class="lightbox__close" id="lb-close" type="button" aria-label="Schließen">&#215;</button>' +
      '<div class="lightbox__img-wrap">' +
        '<img class="lightbox__img" id="lb-img" src="" alt="Foto">' +
      '</div>' +
      '<div class="lightbox__bar">' +
        '<button class="lightbox__nav" id="lb-prev" type="button" aria-label="Vorheriges Foto">&#8249;</button>' +
        '<div class="lightbox__actions">' +
          '<button class="btn btn-sm" id="lb-save" type="button">Foto sichern</button>' +
          '<button class="btn btn-sm btn-ghost" id="lb-del" type="button">Löschen</button>' +
        '</div>' +
        '<button class="lightbox__nav" id="lb-next" type="button" aria-label="Nächstes Foto">&#8250;</button>' +
      '</div>' +
      '<p class="lightbox__save-hint" id="lb-save-hint" hidden>' +
        'Tippe auf Teilen → Bild sichern, um es in deinen Fotos zu behalten.' +
      '</p>';

    document.body.appendChild(box);

    var imgEl    = document.getElementById('lb-img');
    var prevBtn  = document.getElementById('lb-prev');
    var nextBtn  = document.getElementById('lb-next');
    var saveBtn  = document.getElementById('lb-save');
    var delBtn   = document.getElementById('lb-del');
    var closeBtn = document.getElementById('lb-close');
    var saveHint = document.getElementById('lb-save-hint');

    function revoke() {
      Object.keys(blobMap).forEach(function (k) { try { URL.revokeObjectURL(blobMap[k]); } catch (e) {} });
      blobMap = {};
    }
    function close() { revoke(); box.remove(); document.removeEventListener('keydown', onKey); }

    function loadFull(p) {
      if (blobMap[p.id]) { imgEl.src = blobMap[p.id]; return; }
      WW.photoStore.getPhotoById(p.id).then(function (entry) {
        if (!entry || !entry.blob) return;
        var url = URL.createObjectURL(entry.blob);
        blobMap[p.id] = url;
        if (photos[idx] && photos[idx].id === p.id) imgEl.src = url;
      }).catch(function () {});
    }

    function show() {
      var p = photos[idx];
      imgEl.src = p.thumbDataUrl || '';
      loadFull(p);
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === photos.length - 1;
    }

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function () { if (idx > 0)                  { idx--; show(); } });
    nextBtn.addEventListener('click', function () { if (idx < photos.length - 1) { idx++; show(); } });

    saveBtn.addEventListener('click', function () {
      var p = photos[idx];
      saveHint.hidden = false;
      WW.photoStore.getPhotoById(p.id).then(function (entry) {
        if (entry && entry.blob) {
          exportPhotoToGallery(entry.blob, 'wieland-' + p.date + '-' + p.id.slice(0, 8) + '.jpg');
        }
      });
    });

    delBtn.addEventListener('click', function () {
      var p = photos[idx];
      WW.photoStore.deletePhoto(p.id).then(function () {
        photos.splice(idx, 1);
        document.dispatchEvent(new CustomEvent('ww-photo-deleted', { detail: { id: p.id } }));
        if (!photos.length) { close(); return; }
        if (idx >= photos.length) idx = photos.length - 1;
        show();
      }).catch(function () {});
    });

    function onKey(e) {
      if (e.key === 'Escape')       close();
      if (e.key === 'ArrowLeft'  && idx > 0)                { idx--; show(); }
      if (e.key === 'ArrowRight' && idx < photos.length - 1) { idx++; show(); }
    }
    document.addEventListener('keydown', onKey);

    show();
  }

  /* ── Thumbnail-Galerie-Leiste ───────────────────────────────
     Wiederverwendbar in: Statistik-Detailansicht, Höhle.
  ────────────────────────────────────────────────────────────── */

  /**
   * renderPhotoStrip(container, photos)
   * container: DOM-Element, wird vollständig befüllt.
   * Öffnet Lightbox beim Klick.
   */
  function renderPhotoStrip(container, photos) {
    if (!container) return;
    if (!photos || !photos.length) {
      container.innerHTML = '<p class="photo-strip__empty">Noch keine Fotos für diese Übung.</p>';
      return;
    }
    container.innerHTML = '';
    var strip = document.createElement('div');
    strip.className = 'photo-strip';
    photos.forEach(function (p, i) {
      var btn = document.createElement('button');
      btn.className = 'photo-strip__thumb';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Foto ' + (i + 1) + ' öffnen');
      if (p.thumbDataUrl) {
        var img = document.createElement('img');
        img.src = p.thumbDataUrl; img.alt = ''; img.loading = 'lazy';
        btn.appendChild(img);
      }
      btn.addEventListener('click', function () { openLightbox(photos.slice(), i); });
      strip.appendChild(btn);
    });
    container.appendChild(strip);

    /* Wenn ein Foto gelöscht wird: Strip sofort aktualisieren */
    document.addEventListener('ww-photo-deleted', function onDel(e) {
      if (!container.isConnected) { document.removeEventListener('ww-photo-deleted', onDel); return; }
      photos = photos.filter(function (p) { return p.id !== e.detail.id; });
      renderPhotoStrip(container, photos);
      if (!photos.length) document.removeEventListener('ww-photo-deleted', onDel);
    });
  }

  /* ── Datum formatieren (lang, deutsch) ─────────────────────── */
  function fmtDateLong(iso) {
    var parts = iso.split('-');
    if (parts.length < 3) return iso;
    var d  = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var days   = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    var months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    return days[d.getDay()] + ', ' + d.getDate() + '. ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* ── Welt-5-Galerie (Höhle-Panel) ──────────────────────────── */

  /**
   * openWorldGallery()
   * Vollbild-Panel aller Welt-5-Fotos, gruppiert nach Datum.
   */
  function openWorldGallery() {
    WW.photoStore.getPhotosByWorld(5).then(function (photos) {
      var panel = document.createElement('div');
      panel.className = 'gallery-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Entdeckerblick-Fotos');

      var xIcon = (WW.icon && WW.icon('x')) ||
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

      function buildBar() {
        return '<div class="gallery-panel__bar">' +
          '<strong class="gallery-panel__title">Entdeckerblick-Fotos</strong>' +
          '<button class="icon-btn gallery-panel__close" id="gp-close" type="button" aria-label="Schließen">' + xIcon + '</button>' +
        '</div>';
      }

      if (!photos.length) {
        panel.innerHTML = buildBar() +
          '<div class="gallery-panel__body">' +
            '<div class="gallery-panel__empty">' +
              '<p>Wieland hat noch keine Fotos gesammelt.</p>' +
              '<p><small>Geh auf Entdeckungsreise und nimm bei passenden Übungen Fotos auf!</small></p>' +
            '</div>' +
          '</div>';
        document.body.appendChild(panel);
        document.getElementById('gp-close').addEventListener('click', function () { panel.remove(); });
        return;
      }

      /* Gruppen nach Datum aufbauen */
      var groups = {}, dateOrder = [];
      photos.forEach(function (p) {
        if (!groups[p.date]) { groups[p.date] = []; dateOrder.push(p.date); }
        groups[p.date].push(p);
      });
      dateOrder.sort(function (a, b) { return b.localeCompare(a); });

      var bodyHTML = dateOrder.map(function (date) {
        var gp = groups[date];
        return '<div class="gallery-group">' +
          '<h3 class="gallery-group__date">' + WW.esc(fmtDateLong(date)) + '</h3>' +
          '<div class="gallery-thumbs" data-date="' + WW.esc(date) + '">' +
            gp.map(function (p, i) {
              return '<button class="gallery-thumb" type="button" ' +
                'data-photo-idx="' + i + '" data-date="' + WW.esc(date) + '" ' +
                'aria-label="Foto ' + (i + 1) + ' öffnen">' +
                (p.thumbDataUrl ? '<img src="' + p.thumbDataUrl + '" alt="" loading="lazy">' : (i + 1)) +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');

      panel.innerHTML = buildBar() +
        '<div class="gallery-panel__body">' + bodyHTML + '</div>';

      document.body.appendChild(panel);

      document.getElementById('gp-close').addEventListener('click', function () { panel.remove(); });

      panel.addEventListener('click', function (e) {
        var btn = e.target.closest('.gallery-thumb');
        if (!btn) return;
        var date = btn.dataset.date;
        var i    = parseInt(btn.dataset.photoIdx, 10);
        var gp   = groups[date];
        if (gp) openLightbox(gp.slice(), i);
      });

      /* Bei Foto-Löschung Panel neu aufbauen */
      document.addEventListener('ww-photo-deleted', function onDel() {
        if (!panel.isConnected) { document.removeEventListener('ww-photo-deleted', onDel); return; }
        panel.remove();
        document.removeEventListener('ww-photo-deleted', onDel);
        openWorldGallery();
      });
    }).catch(function () {});
  }

  /* ── Export ─────────────────────────────────────────────────── */
  var WW = global.WW = global.WW || {};
  WW.CAMERA_ENABLED_IDS   = CAMERA_ENABLED_IDS;
  WW.openCamera           = openCamera;
  WW.exportPhotoToGallery = exportPhotoToGallery;
  WW.openLightbox         = openLightbox;
  WW.renderPhotoStrip     = renderPhotoStrip;
  WW.openWorldGallery     = openWorldGallery;

}(typeof window !== 'undefined' ? window : this));
