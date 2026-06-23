/* Statistik: Wochenraster + Tages-Detail + Routen-Karte */
(function () {
  'use strict';

  var WEEKS_SHOWN = 6;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Hilfsfunktionen ---------- */
  function fmtDuration(ms) {
    var m = Math.round(ms / 60000);
    if (m < 60) return m + ' Min.';
    return Math.floor(m / 60) + ' Std. ' + (m % 60) + ' Min.';
  }
  function fmtDistance(m) {
    if (m < 1000) return m + ' m';
    return (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }
  function fmtDateLong(iso) {
    var parts = iso.split('-');
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    var days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    var months = ['Jan.','Feb.','März','Apr.','Mai','Juni','Juli','Aug.','Sep.','Okt.','Nov.','Dez.'];
    return days[d.getDay()] + ', ' + d.getDate() + '. ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* ---------- Wochen-Raster ---------- */
  function cellClass(type) {
    if (type === 'free')    return 'cell cell--free';
    if (type === 'guided')  return 'cell cell--guided';
    return 'cell';
  }

  function cellHTML(day) {
    var inner = day.type ? '' : WW.icon('paw');
    if (day.type) {
      return '<button class="' + cellClass(day.type) + ' cell--btn" ' +
        'data-date="' + day.date + '" title="' + WW.esc(day.date) + '" ' +
        'aria-label="' + WW.esc(fmtDateLong(day.date)) + ' – Details">' + inner + '</button>';
    }
    return '<span class="' + cellClass(day.type) + '" title="' + WW.esc(day.date) + '">' + inner + '</span>';
  }

  function render() {
    var weeks = WW.recentWeeks(WEEKS_SHOWN);
    var html = weeks.map(function (wk) {
      return '<div class="stat-row">' + wk.days.map(cellHTML).join('') + '</div>';
    }).join('');
    $('weeks').innerHTML = html;

    // Klick-Handler für aktive Zellen
    $('weeks').addEventListener('click', function (e) {
      var btn = e.target.closest('.cell--btn');
      if (!btn) return;
      showDayDetail(btn.dataset.date);
    });
  }

  /* ---------- Tages-Detail ---------- */
  function showDayDetail(dateISO) {
    var records = WW.getWalkRecords(dateISO);
    $('day-panel-title').textContent = fmtDateLong(dateISO);

    var body = $('day-panel-body');
    if (!records.length) {
      body.innerHTML = '<p class="hint" style="padding:20px">Keine Aufzeichnung für diesen Tag.</p>';
    } else {
      body.innerHTML = records.map(function (r, i) {
        var endTs = r.start + r.durationMs;
        var badge = r.type === 'guided' ? 'Angeleitete Strecke' : 'Freies Laufen';
        var badgeCls = r.type === 'guided' ? 'walk-badge--guided' : 'walk-badge--free';

        var exHTML = '';
        if (r.exercises && r.exercises.length) {
          exHTML = '<p class="walk-record__ex-label">' + r.exercises.length +
            (r.exercises.length === 1 ? ' Übung' : ' Übungen') + '</p><ul class="walk-record__ex-list">' +
            r.exercises.map(function (ex) {
              return '<li><strong>' + WW.esc(ex.text) + '</strong>' +
                (ex.header ? ' <span class="hint">· ' + WW.esc(ex.header) + '</span>' : '') + '</li>';
            }).join('') + '</ul>';
        } else {
          exHTML = '<p class="hint">Keine Übungen absolviert.</p>';
        }

        var mapBtn = (r.coords && r.coords.length > 1)
          ? '<button class="btn btn-sm btn-ghost" data-idx="' + i + '" data-date="' + dateISO + '">Route anzeigen</button>'
          : '';

        return '<div class="walk-record">' +
          '<div class="walk-record__head">' +
            '<span class="walk-badge ' + badgeCls + '">' + badge + '</span>' +
            '<span class="walk-record__time">' + fmtTime(r.start) + ' – ' + fmtTime(endTs) + '</span>' +
          '</div>' +
          '<div class="walk-record__stats">' +
            '<span>⏱ ' + fmtDuration(r.durationMs) + '</span>' +
            (r.distanceM ? '<span>📍 ' + fmtDistance(r.distanceM) + '</span>' : '') +
          '</div>' +
          exHTML + mapBtn +
        '</div>';
      }).join('');

      body.addEventListener('click', function onBodyClick(e) {
        var btn = e.target.closest('[data-idx]');
        if (!btn) return;
        var rec = WW.getWalkRecords(btn.dataset.date)[parseInt(btn.dataset.idx, 10)];
        if (rec && rec.coords && rec.coords.length > 1) showRouteMap(rec.coords);
      });
    }

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
      // Start- und Endpunkt markieren
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
