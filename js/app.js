/* ============================================================
   Walking with Wieland — Kern-Logik (Namespace "WW")
   Klassisches Script (kein Modul) -> läuft auch via file://.
   Erwartet, dass exercises.js + trophies.js davor geladen sind.
   Verantwortlich für:
     - persistenten Fortschritt (localStorage, versioniert)
     - Übergabe Check-In -> Spaziergang (sessionStorage)
     - adaptive Übungsauswahl (Welt, Anzahl, Cooldown, Rotation)
     - Wochenfortschritt / Achievements
     - geteilte SVG-Icons + untere Navigation
============================================================ */
(function (global) {
  'use strict';

  var KEY = 'ww_v1';            // localStorage-Schlüssel (versioniert)
  var WALK_KEY = 'ww_walk';     // sessionStorage-Schlüssel für Walk-Übergabe
  var HI = 66, LO = 34;         // Schwellen für "hoch" / "niedrig" auf 0..100
  var COOLDOWN = 5;             // Spaziergänge, die eine Übung pausiert

  /* ---------- kleine Helfer ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayISO() { return toISO(new Date()); }
  function dayLabel(d) { return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]; }

  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var off = (x.getDay() + 6) % 7; // Mo=0 … So=6
    x.setDate(x.getDate() - off);
    return x;
  }
  function isoWeekKey(d) { return toISO(mondayOf(d)); }
  function mondayToSunday(d) {
    var m = mondayOf(d), out = [];
    for (var i = 0; i < 7; i++) { var dd = new Date(m); dd.setDate(m.getDate() + i); out.push(dd); }
    return out;
  }

  function haversine(aLat, aLng, bLat, bLng) {
    var R = 6371000, rad = function (x) { return x * Math.PI / 180; };
    var dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
    var la1 = rad(aLat), la2 = rad(bLat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function exerciseById(id) {
    for (var i = 0; i < WW_EXERCISES.length; i++) if (WW_EXERCISES[i].id === id) return WW_EXERCISES[i];
    return null;
  }
  function worldExercises(w) {
    return WW_EXERCISES.filter(function (e) { return e.world === w; });
  }

  // stabiler Zufalls-Tiebreak pro Laden (nicht im Comparator würfeln)
  WW_EXERCISES.forEach(function (e) { e._rank = Math.random(); });

  /* ---------- Zustand / Persistenz ---------- */
  function defaultState() {
    return {
      settings: { home: null, orsKey: '', weeklyGoal: 4, testMode: false, debugExMode: false },
      days: {},                 // ISO-Datum -> 'guided' | 'free'
      history: {},              // Übungs-id -> sessionIndex des letzten Mals
      sessionIndex: 0,
      worldCycle: {},           // welt -> [ids, die im aktuellen Durchlauf schon dran waren]
      collected: {},            // Übungs-id -> ISO-Datum der Ersterledigung
      achievements: { firstWalk: false, weekGoal: false, allWorldsWeek: false, bossTour: false },
      weekWorlds: { key: '', worlds: [] }
    };
  }

  function load() {
    var s = defaultState();
    try {
      var raw = global.localStorage ? localStorage.getItem(KEY) : null;
      if (raw) {
        var p = JSON.parse(raw);
        s.settings = Object.assign(defaultState().settings, p.settings || {});
        s.achievements = Object.assign(defaultState().achievements, p.achievements || {});
        s.days = p.days || {};
        s.history = p.history || {};
        s.worldCycle = p.worldCycle || {};
        s.collected = p.collected || {};
        s.weekWorlds = p.weekWorlds || { key: '', worlds: [] };
        s.sessionIndex = p.sessionIndex || 0;
        s.walkRecords  = p.walkRecords  || {};
      }
    } catch (e) { /* defekt -> Standard */ }
    return s;
  }

  var state = load();

  function save() {
    try { if (global.localStorage) localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* z. B. privater Modus -> still ignorieren */ }
  }

  /* ---------- Walk-Übergabe (nur diese Sitzung) ---------- */
  function setWalkConfig(cfg) { try { sessionStorage.setItem(WALK_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function getWalkConfig() { try { var r = sessionStorage.getItem(WALK_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function clearWalkConfig() { try { sessionStorage.removeItem(WALK_KEY); } catch (e) {} }

  /* ---------- adaptive Auswahl ---------- */
  // c = { energy, stress, mood } jeweils 0..100  (PDF Abschnitt 6)
  function pickWorlds(c) {
    var hiStress = c.stress >= HI, hiEnergy = c.energy >= HI, lowEnergy = c.energy <= LO;
    var lowMood = c.mood <= LO, goodMood = c.mood >= HI;

    // Rangfolge: Stress vor Laune vor Energie (PDF 6.3)
    if (hiStress && hiEnergy) return [2, 1];      // erst Atem, dann sanft in die Sinne
    if (hiStress && lowMood) return [2, 4];       // runterkommen, dann aufhellen
    if (hiStress) return [2];
    if (lowMood && lowEnergy) return [4];         // sanft dosiert
    if (lowMood) return [4];
    if (hiEnergy && goodMood) return [5, 3];      // entdecken + Schätz-Wetten
    if (hiEnergy) return [5];
    if (lowEnergy) return [1];                    // leichte Sinnesspiele
    if (c.stress > LO) return [3];                // "im Kopf" -> Zeitgefühl
    return ['rotate'];                            // alles im Mittelfeld -> Tageswelt
  }

  function dayWorld() {
    return (Math.floor(Date.now() / 86400000) % 5) + 1;
  }
  function resolveWorlds(worlds) {
    if (worlds.length === 1 && worlds[0] === 'rotate') return [dayWorld()];
    return worlds.slice();
  }

  // Energie + Streckenlänge -> Anzahl (PDF 6.4)
  function computeCount(energy, minutes) {
    var base = energy <= LO ? 2 : (energy >= HI ? 5 : 3);
    if (minutes <= 20) base -= 1;
    if (minutes >= 60) base += 1;
    return clamp(base, 1, 6);
  }

  function rankCompare(a, b) {
    var la = state.history[a.id], lb = state.history[b.id];
    var na = (la === undefined) ? 0 : 1, nb = (lb === undefined) ? 0 : 1; // nie gespielt zuerst
    if (na !== nb) return na - nb;
    var ca = ((state.worldCycle[a.world] || []).indexOf(a.id) >= 0) ? 1 : 0; // nicht-im-Zyklus zuerst
    var cb = ((state.worldCycle[b.world] || []).indexOf(b.id) >= 0) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    var aa = (la === undefined) ? -1 : la, ab = (lb === undefined) ? -1 : lb; // ältester zuerst
    if (aa !== ab) return aa - ab;
    return a._rank - b._rank; // stabiler Tiebreak
  }

  function pickAcross(sorted, worlds, count) {
    if (worlds.length <= 1) return sorted.slice(0, count);
    var groups = {};
    worlds.forEach(function (w) { groups[w] = sorted.filter(function (e) { return e.world === w; }); });
    var out = [];
    while (out.length < count) {
      var added = false;
      for (var i = 0; i < worlds.length && out.length < count; i++) {
        var g = groups[worlds[i]];
        if (g && g.length) { out.push(g.shift()); added = true; }
      }
      if (!added) break;
    }
    return out;
  }

  function withColor(ex) {
    var copy = Object.assign({}, ex);
    if (ex.dynamicColor) {
      var col = WW_COLORS_DE[Math.floor(Math.random() * WW_COLORS_DE.length)];
      copy.color = col;
      copy.text = ex.text.replace('{color}', col);
    }
    return copy;
  }

  // Hauptauswahl. Liefert { worlds, count, exercises:[displayReady] }
  function selectExercises(c, minutes) {
    var worlds = resolveWorlds(pickWorlds(c));
    var count = computeCount(c.energy, minutes);

    var pool = WW_EXERCISES.filter(function (e) {
      return e.world !== 'special' && worlds.indexOf(e.world) >= 0;
    });
    if (c.stress >= HI) {
      var calm = pool.filter(function (e) { return e.calm; });
      if (calm.length) pool = calm; // bei Stress nur beruhigende Übungen
    }

    var cur = state.sessionIndex;
    var fresh = pool.filter(function (e) {
      var last = state.history[e.id];
      return last === undefined || (cur - last) >= COOLDOWN;
    });
    var candidates = (fresh.length >= count ? fresh : pool).slice();
    candidates.sort(rankCompare);

    var chosen = pickAcross(candidates, worlds, count).map(withColor);
    return { worlds: worlds, count: count, exercises: chosen };
  }

  // "Etwas anderes, Wieland" — neue Übung aus derselben Welt (PDF 6.6)
  function rerollExercise(world, excludeIds) {
    excludeIds = excludeIds || [];
    var pool = worldExercises(world).filter(function (e) { return excludeIds.indexOf(e.id) < 0; });
    if (!pool.length) return null;
    pool.sort(rankCompare);
    return withColor(pool[0]);
  }

  /* ---------- Sitzungs-/Fortschritts-Buchhaltung ---------- */
  function startSession() {
    state.sessionIndex = (state.sessionIndex || 0) + 1;
    save();
    return state.sessionIndex;
  }

  function markWorldThisWeek(w) {
    var key = isoWeekKey(new Date());
    if (!state.weekWorlds || state.weekWorlds.key !== key) state.weekWorlds = { key: key, worlds: [] };
    if (w !== 'special' && state.weekWorlds.worlds.indexOf(w) < 0) state.weekWorlds.worlds.push(w);
  }
  function checkAllWorldsWeek() {
    if (state.weekWorlds && state.weekWorlds.worlds.length >= 5) state.achievements.allWorldsWeek = true;
  }

  function recordExerciseDone(id) {
    state.history[id] = state.sessionIndex;
    if (!state.collected[id]) state.collected[id] = todayISO();

    var ex = exerciseById(id);
    if (ex) {
      var w = ex.world;
      if (!state.worldCycle[w]) state.worldCycle[w] = [];
      if (state.worldCycle[w].indexOf(id) < 0) state.worldCycle[w].push(id);
      if (w !== 'special' && state.worldCycle[w].length >= worldExercises(w).length) state.worldCycle[w] = [];
      markWorldThisWeek(w);
    }
    if (id === 'special') state.achievements.bossTour = true;
    checkAllWorldsWeek();
    save();
  }

  function endSession(type) {
    var t = (type === 'guided') ? 'guided' : 'free';
    var prev = state.days[todayISO()];
    state.days[todayISO()] = (!prev || prev === t) ? t : 'both';
    state.achievements.firstWalk = true;
    var wp = weekProgress();
    if (wp.count >= wp.goal) state.achievements.weekGoal = true;
    save();
  }

  function saveWalkRecord(rec) {
    if (!state.walkRecords) state.walkRecords = {};
    var d = rec.date;
    if (!state.walkRecords[d]) state.walkRecords[d] = [];
    state.walkRecords[d].push(rec);
    save();
  }

  function getWalkRecords(date) {
    return (state.walkRecords && state.walkRecords[date]) || [];
  }

  /* ---------- Wochen-/Statistik-Daten ---------- */

  /* Woche beginnt Sonntag 0:00 (= So–Sa) */
  function sundayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - x.getDay()); // x.getDay(): 0=So
    return x;
  }
  function sundayToSaturday(sunday) {
    var out = [];
    for (var i = 0; i < 7; i++) {
      var dd = new Date(sunday); dd.setDate(sunday.getDate() + i); out.push(dd);
    }
    return out;
  }
  function currentSundayISO() { return toISO(sundayOf(new Date())); }

  function weeklyWorldCountsForWeek(sundayISO) {
    var sunday = new Date(sundayISO + 'T00:00:00');
    var weekDates = sundayToSaturday(sunday).map(toISO);
    var weekSet = {};
    weekDates.forEach(function (d) { weekSet[d] = true; });
    var counts = {};
    var collected = state.collected || {};
    Object.keys(collected).forEach(function (id) {
      if (weekSet[collected[id]]) {
        var def = exerciseById(id);
        if (def && def.world !== 'special') counts[def.world] = (counts[def.world] || 0) + 1;
      }
    });
    return counts;
  }

  function weeklyWorldCounts() {
    return weeklyWorldCountsForWeek(currentSundayISO());
  }

  function weekProgress() {
    var goal = (state.settings && state.settings.weeklyGoal) || 4;
    var days = mondayToSunday(new Date()).map(function (d) {
      var iso = toISO(d), t = state.days[iso] || null;
      return { date: iso, label: dayLabel(d), active: !!t, type: t };
    });
    var count = days.filter(function (d) { return d.active; }).length;
    return { count: count, goal: goal, days: days };
  }

  function recentWeeks(n) {
    var base = mondayOf(new Date()), weeks = [];
    for (var w = n - 1; w >= 0; w--) {
      var m = new Date(base); m.setDate(base.getDate() - w * 7);
      var days = [];
      for (var i = 0; i < 7; i++) {
        var dd = new Date(m); dd.setDate(m.getDate() + i);
        var iso = toISO(dd);
        days.push({ date: iso, label: dayLabel(dd), type: state.days[iso] || null });
      }
      weeks.push({ key: toISO(m), days: days });
    }
    return weeks;
  }

  function speechBubble() {
    var wp = weekProgress(), count = wp.count, goal = wp.goal;
    if (count === 0) return 'Lust auf einen Spaziergang? Wieland wartet schon auf dich.';
    if (count >= goal) return 'Wochenziel geschafft — Wieland ist mächtig stolz auf dich!';
    if (count === goal - 1) return 'Nur noch ein Spaziergang um dein Wochenziel zu erreichen!';
    return 'Noch ' + (goal - count) + ' Spaziergänge bis zu deinem Wochenziel!';
  }

  /* ---------- Strecken-Schätzung ---------- */
  function distanceKm(energy) { return 1.25 + clamp(energy, 0, 100) / 100 * 6.25; }   // ~1,25–7,5 km
  function estimateMinutes(energy) { return Math.round(distanceKm(energy) / 5 * 60); } // ~15–90 min

  /* ---------- Einstellungen ---------- */
  function getState() { return state; }
  function getSettings() { return state.settings; }
  function setHome(lat, lng) { state.settings.home = { lat: lat, lng: lng }; save(); }
  function clearHome() { state.settings.home = null; save(); }
  function setOrsKey(k) { state.settings.orsKey = k || ''; save(); }
  function setWeeklyGoal(n) { state.settings.weeklyGoal = clamp(parseInt(n, 10) || 4, 1, 14); save(); }
  function setTestMode(on) { state.settings.testMode = !!on; save(); }
  function setDebugExMode(on) { state.settings.debugExMode = !!on; save(); }
  function resetProgress() { state = defaultState(); save(); }

  /* ---------- SVG-Icons (stroke = currentColor) ---------- */
  function svg(inner, opts) {
    opts = opts || {};
    var fill = opts.fill || 'none';
    var stroke = opts.stroke || 'currentColor';
    var sw = opts.sw || 2;
    return '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="' + fill +
      '" stroke="' + stroke + '" stroke-width="' + sw +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  var ICONS = {
    home: function () { return svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>'); },
    buch: function () { return svg('<path d="M12 6.5C10.5 5 7.5 4.5 4.5 5v13c3-.5 6 0 7.5 1.5 1.5-1.5 4.5-2 7.5-1.5V5c-3-.5-6 0-7.5 1.5Z"/><path d="M12 6.5v13"/>'); },
    hoehle: function () { return svg('<path d="M3 20V12a9 7 0 0 1 18 0v8"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/>'); },
    settings: function () { return svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3"/>'); },
    paw: function () { return svg('<circle cx="6.5" cy="10" r="1.9"/><circle cx="10.5" cy="6.7" r="1.9"/><circle cx="14.5" cy="6.7" r="1.9"/><circle cx="17.5" cy="10" r="1.9"/><path d="M12 11.5c-2.7 0-4.6 1.9-4.6 4 0 1.8 1.8 2.3 4.6 2.3s4.6-.5 4.6-2.3c0-2.1-1.9-4-4.6-4Z"/>', { fill: 'currentColor', stroke: 'none' }); },
    camera: function () { return svg('<path d="M4 8.5h3l1.3-2h7.4L18 8.5h2A1.5 1.5 0 0 1 21.5 10v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z"/><circle cx="12" cy="13.5" r="3.3"/>'); },
    mic: function () { return svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21M9 21h6"/>'); },
    dots: function () { return svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', { fill: 'currentColor', stroke: 'none' }); },
    arrowup: function () { return svg('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'); },
    x: function () { return svg('<path d="M6 6 18 18M18 6 6 18"/>'); },
    check: function () { return svg('<path d="m5 12.5 4.5 4.5L19 7"/>'); },
    reroll: function () { return svg('<path d="M20 8a8 8 0 0 0-14-3.5L4 7"/><path d="M4 4v3h3"/><path d="M4 16a8 8 0 0 0 14 3.5L20 17"/><path d="M20 20v-3h-3"/>'); }
  };
  function icon(name) { return ICONS[name] ? ICONS[name]() : ''; }

  /* ---------- untere Navigation ---------- */
  function navHTML(active) {
    var items = [
      { href: 'index.html',      label: 'Start',     icon: 'Start',     key: 'home' },
      { href: 'collection.html', label: 'Höhle',     icon: 'Hoehle',    key: 'collection' },
      { href: 'stats.html',      label: 'Statistik', icon: 'Statistik', key: 'stats' },
      { href: 'settings.html',   label: 'Mehr',      icon: 'Mehr',      key: 'settings' }
    ];
    return '<nav class="nav" aria-label="Hauptnavigation">' + items.map(function (it) {
      var on = it.key === active;
      return '<a class="nav-item' + (on ? ' is-active' : '') + '" href="' + it.href + '"' +
        (on ? ' aria-current="page"' : '') + '>' +
        '<img class="nav-ico" src="assets/Icons/' + it.icon + '.svg" alt="" aria-hidden="true">' +
        '<span class="nav-label">' + it.label + '</span></a>';
    }).join('') + '</nav>';
  }
  function mountNav(active) {
    if (document.querySelector('.nav')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = navHTML(active);
    document.body.appendChild(wrap.firstChild);
  }

  /* ---------- öffentliche Schnittstelle ---------- */
  global.WW = {
    // Auswahl
    pickWorlds: pickWorlds, resolveWorlds: resolveWorlds, computeCount: computeCount,
    selectExercises: selectExercises, rerollExercise: rerollExercise, dayWorld: dayWorld,
    // Sitzung / Fortschritt
    startSession: startSession, recordExerciseDone: recordExerciseDone, endSession: endSession,
    weekProgress: weekProgress, recentWeeks: recentWeeks, speechBubble: speechBubble,
    // Walk-Übergabe
    setWalkConfig: setWalkConfig, getWalkConfig: getWalkConfig, clearWalkConfig: clearWalkConfig,
    // Strecke
    distanceKm: distanceKm, estimateMinutes: estimateMinutes, haversine: haversine,
    // Einstellungen
    getState: getState, getSettings: getSettings, setHome: setHome, clearHome: clearHome,
    setOrsKey: setOrsKey, setWeeklyGoal: setWeeklyGoal, setTestMode: setTestMode, setDebugExMode: setDebugExMode, resetProgress: resetProgress,
    // Daten-Helfer
    exerciseById: exerciseById, worldExercises: worldExercises,
    // UI-Helfer
    icon: icon, navHTML: navHTML, mountNav: mountNav, esc: esc,
    toISO: toISO, todayISO: todayISO,
    saveWalkRecord: saveWalkRecord, getWalkRecords: getWalkRecords,
    weeklyWorldCounts: weeklyWorldCounts,
    weeklyWorldCountsForWeek: weeklyWorldCountsForWeek,
    currentSundayISO: currentSundayISO,
    sundayOf: sundayOf
  };

})(this);

/* ---------- Service-Worker-Registrierung ----------
   Nur über http(s) – über file:// ist die Registrierung nicht möglich
   und würde lokal einen Fehler werfen. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.protocol === 'http:')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline-Funktion optional */ });
    });
  }
})();
