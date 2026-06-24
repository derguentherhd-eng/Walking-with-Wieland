/* Statistik: Wochenraster + Tages-Detail + Routen-Karte */
(function () {
  'use strict';

  var WEEKS_SHOWN = 6;
  var $ = function (id) { return document.getElementById(id); };

  var WORLD_ICONS = {
    1: 'assets/spuernase.png',
    2: 'assets/ruhe.png',
    3: 'assets/zeitgefuehl.png',
    4: 'assets/schaetze.png',
    5: 'assets/entdeckerblick.png'
  };

  /* ---------- Hilfsfunktionen ---------- */
  function fmtDuration(ms) {
    var m = Math.round(ms / 60000);
    if (m < 60) return m + ' Min.';
    return Math.floor(m / 60) + ' Std. ' + (m % 60) + ' Min.';
  }
  function fmtDistance(m) {
    if (!m) return '';
    if (m < 1000) return m + ' m';
    return (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDateLong(iso) {
    var parts = iso.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var days   = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    var months = ['Jan.','Feb.','März','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.','Nov.','Dez.'];
    return days[d.getDay()] + ', ' + d.getDate() + '. ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* ---------- Wochen-Raster ---------- */
  function cellClass(type) {
    if (type === 'free')   return 'cell cell--free';
    if (type === 'guided') return 'cell cell--guided';
    return 'cell';
  }
  function cellHTML(day) {
    if (day.type) {
      return '<button class="' + cellClass(day.type) + ' cell--btn" ' +
        'data-date="' + day.date + '" aria-label="' + WW.esc(fmtDateLong(day.date)) + ' – Details"></button>';
    }
    return '<span class="' + cellClass(day.type) + '">' + WW.icon('paw') + '</span>';
  }

  function render() {
    var weeks = WW.recentWeeks(WEEKS_SHOWN);
    $('weeks').innerHTML = weeks.map(function (wk) {
      return '<div class="stat-row">' + wk.days.map(cellHTML).join('') + '</div>';
    }).join('');
    $('weeks').addEventListener('click', function (e) {
      var btn = e.target.closest('.cell--btn');
      if (btn) showDayDetail(btn.dataset.date);
    });
  }

  /* ---------- Tages-Detail ---------- */
  function worldOfExercise(id) {
    var def = WW.exerciseById(id);
    return def ? def.world : null;
  }

  function exerciseIconHTML(ex, idx) {
    var w = worldOfExercise(ex.id);
    var src = w && WORLD_ICONS[w] ? WORLD_ICONS[w] : '';
    if (!src) return '';
    return '<button class="ex-icon-btn" data-ex-idx="' + idx + '" type="button" ' +
      'aria-label="' + WW.esc(ex.header || '') + '" title="' + WW.esc(ex.header || '') + '">' +
      '<img src="' + src + '" alt="" class="ex-icon-img">' +
      '</button>';
  }

  function showDayDetail(dateISO) {
    var records = WW.getWalkRecords(dateISO);
    $('day-panel-title').textContent = fmtDateLong(dateISO);

    var body = $('day-panel-body');
    if (!records.length) {
      body.innerHTML = '<p class="log-hint">Keine Aufzeichnung für diesen Tag.</p>';
      $('day-panel').hidden = false;
      return;
    }

    body.innerHTML = records.map(function (r, recIdx) {
      var endTs    = r.start + r.durationMs;
      var typeLbl  = r.type === 'guided' ? 'Angeleitete Strecke' : 'Freies Laufen';
      var dist     = fmtDistance(r.distanceM);
      var dur      = fmtDuration(r.durationMs);

      /* Übungs-Icons */
      var iconsHTML = '';
      if (r.exercises && r.exercises.length) {
        iconsHTML = '<div class="log-ex-row" id="ex-row-' + recIdx + '">' +
          r.exercises.map(function (ex, i) { return exerciseIconHTML(ex, i); }).join('') +
        '</div>' +
        '<div class="log-ex-detail" id="ex-detail-' + recIdx + '" hidden></div>';
      }

      /* Route-Button */
      var routeBtn = (r.type === 'guided' && r.coords && r.coords.length > 1)
        ? '<button class="btn btn-sm btn-ghost log-route-btn" data-rec-idx="' + recIdx + '" data-date="' + dateISO + '" type="button">Route anzeigen</button>'
        : '';

      return '<div class="walk-log" data-rec-idx="' + recIdx + '">' +
        /* Start */
        '<div class="log-entry log-entry--start">' +
          '<span class="log-dot"></span>' +
          '<div class="log-entry__body">' +
            '<b>Spaziergang gestartet</b><span class="log-badge">' + typeLbl + '</span>' +
            '<time class="log-time">' + fmtTime(r.start) + ' Uhr</time>' +
          '</div>' +
        '</div>' +
        /* Übungen */
        (iconsHTML ? '<div class="log-section">' + iconsHTML + '</div>' : '') +
        /* Ende */
        '<div class="log-entry log-entry--end">' +
          '<span class="log-dot"></span>' +
          '<div class="log-entry__body">' +
            '<b>Spaziergang beendet</b>' +
            '<span class="log-meta">' + dur + (dist ? ' · ' + dist : '') + '</span>' +
            '<time class="log-time">' + fmtTime(endTs) + ' Uhr</time>' +
          '</div>' +
        '</div>' +
        /* Route */
        (routeBtn ? '<div class="log-route">' + routeBtn + '</div>' : '') +
      '</div>';
    }).join('<hr class="log-sep">');

    /* Übungs-Icon Klick → Detail aufklappen */
    body.addEventListener('click', function (e) {
      /* Route */
      var routeBtn = e.target.closest('.log-route-btn');
      if (routeBtn) {
        var rec = WW.getWalkRecords(routeBtn.dataset.date)[parseInt(routeBtn.dataset.recIdx, 10)];
        if (rec && rec.coords && rec.coords.length > 1) showRouteMap(rec.coords);
        return;
      }
      /* Übungs-Icon */
      var iconBtn = e.target.closest('.ex-icon-btn');
      if (iconBtn) {
        var walkEl  = iconBtn.closest('.walk-log');
        var ri      = walkEl ? walkEl.dataset.recIdx : '0';
        var detail  = document.getElementById('ex-detail-' + ri);
        var exIdx   = parseInt(iconBtn.dataset.exIdx, 10);
        var rec2    = records[parseInt(ri, 10)];
        var ex      = rec2 && rec2.exercises && rec2.exercises[exIdx];
        if (detail && ex) {
          var isOpen = !detail.hidden && detail.dataset.open === String(exIdx);
          detail.hidden = isOpen;
          if (!isOpen) {
            detail.dataset.open = exIdx;
            detail.innerHTML =
              '<p class="log-ex-header">' + WW.esc(ex.header || '') + '</p>' +
              '<p class="log-ex-text">' + WW.esc(ex.text || '') + '</p>';
          }
        }
      }
    });

    $('day-panel').hidden = false;
  }

  /* ---------- Routen-Karte ---------- */
  var routeMap = null;

  function showRouteMap(coords) {
    $('route-map-panel').hidden = false;
    if (!routeMap) {
      routeMap = L.map('route-map', { zoomControl: true, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(routeMap);
    }
    setTimeout(function () {
      routeMap.invalidateSize();
      var line = L.polyline(coords, { color: '#042615', weight: 4, opacity: .85 });
      line.addTo(routeMap);
      routeMap.fitBounds(line.getBounds(), { padding: [24, 24] });
      L.circleMarker(coords[0], { radius: 7, color: '#fff', fillColor: '#93C3D9', fillOpacity: 1, weight: 2 }).addTo(routeMap);
      L.circleMarker(coords[coords.length - 1], { radius: 7, color: '#fff', fillColor: '#A6BD7B', fillOpacity: 1, weight: 2 }).addTo(routeMap);
    }, 60);
  }

  /* ---------- Panel-Schließen ---------- */
  $('day-panel-close').innerHTML = WW.icon('x');
  $('day-panel-close').addEventListener('click', function () { $('day-panel').hidden = true; });
  $('route-map-close').innerHTML = WW.icon('x');
  $('route-map-close').addEventListener('click', function () { $('route-map-panel').hidden = true; });

  /* ---------- Init ---------- */
  render();
  WW.mountNav('stats');
})();
