/* ============================================================
   Walking with Wieland — Spaziergang (Kernstück)
   - liest Check-In-Übergabe, startet Sitzung
   - verteilt Übungen über die Strecke (Zeit + Bewegung)
   - rendert pro Übungstyp, Trophäe bei "Geschafft"
   - optional geführte ORS-Route + Leaflet-Karte
============================================================ */
(function () {
  'use strict';

  var MOVE_THRESHOLD = 40;   // Meter Bewegung, bevor die nächste Übung kommt
  var TEST_INTERVAL = 20000; // Testmodus: alle 20 s eine Übung, ohne Bewegungs-Gate

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Konfiguration prüfen ---------- */
  var cfg = WW.getWalkConfig();
  if (!cfg || !cfg.checkin) { window.location.replace('checkin.html'); return; }
  var checkin      = cfg.checkin;
  var guided       = !!cfg.guided;
  var locationMode = cfg.locationMode || 'gps';   // 'gps' | 'home'
  var settings     = WW.getSettings();
  var testMode     = !!settings.testMode;

  /* ---------- Sitzung + Auswahl ---------- */
  WW.startSession();
  var minutes = WW.estimateMinutes(checkin.energy);
  var plan = WW.selectExercises(checkin, minutes);
  var exercises = plan.exercises.slice();
  var totalMs = minutes * 60 * 1000;
  var interval = testMode ? TEST_INTERVAL : Math.max(60000, totalMs / (plan.count + 1));

  var startTime = Date.now();
  var idx = 0;                 // nächste Übung
  var mode = 'walking';        // 'walking' | 'exercise' | 'done'
  var navWasVisible = false;   // merkt, ob walk-top vor der Übung sichtbar war
  var movedSinceLast = 0;
  var lastPos = null;
  var curPos = null;
  var watchId = null;
  var doneTrophies = [];       // gesammelte Trophäen dieser Runde (keys)
  var tickTimer = null;

  // Navigation — waypoint-based, fault-tolerant
  var navState = null;         // { waypoints, wpIndex, deviceHeading, coords }
  var route = null;            // kept for fullscreen map compat
  var map = null, routeLine = null, userMarker = null, mapReady = false;
  // Minimap
  var minimap = null, mmUserMarker = null, mmWpMarker = null, mmLine = null;
  var mmReady = false, mmVisible = false;
  // Device orientation (Kompass) + 2-Sekunden-Fenstermittelung
  var orientReady = false;
  var headingBuf = [];   // [{t, s, c}]  — Ringspeicher der letzten 2 Sek.
  var lastOrientMs = 0;
  // Kontinuierliche Winkel für rAF-Loop (kein 360°-Überlauf-Sprung)
  var arrowDisplayAngle = 0, mapDisplayAngle = 0;
  var targetHeading = null;  // aktuell geglätteter Kompasswert (wird in rAF gelesen)

  /* ---------- Geolocation ---------- */
  function startTracking() {
    if (testMode || !navigator.geolocation) return;
    try {
      watchId = navigator.geolocation.watchPosition(onPos, onGeoErr, {
        enableHighAccuracy: true, maximumAge: 5000, timeout: 20000
      });
    } catch (e) { /* keine Ortung -> Zeit-Fallback */ }
  }
  function onPos(p) {
    var lat = p.coords.latitude, lng = p.coords.longitude;
    curPos = { lat: lat, lng: lng };
    if (lastPos) movedSinceLast += WW.haversine(lastPos.lat, lastPos.lng, lat, lng);
    lastPos = { lat: lat, lng: lng };
    if (userMarker && map) userMarker.setLatLng([lat, lng]);
    if (navState) { navSmartAdvance(); navUpdate(); }
  }
  function onGeoErr() { /* still: wir fallen automatisch auf Zeit zurück */ }

  /* ---------- Haupt-Tick: wann kommt die nächste Übung? ---------- */
  function tick() {
    if (mode !== 'walking') return;
    // Wenn alle geplanten Übungen gespielt: automatisch nachladen
    if (idx >= exercises.length) {
      var more = WW.selectExercises(checkin, minutes);
      if (more.exercises.length) {
        exercises = exercises.concat(more.exercises);
      } else {
        return; // kein Nachschub möglich
      }
    }
    var elapsed = Date.now() - startTime;
    var due = (idx + 1) * interval;
    var movedEnough = testMode || !navigator.geolocation || (movedSinceLast >= MOVE_THRESHOLD);
    if (elapsed >= due && movedEnough) showExercise(exercises[idx]);
  }

  /* ---------- Übungs-Overlay ---------- */
  function worldTrophyKey(w) { return (WW_WORLDS[w] && WW_WORLDS[w].trophy) || 'stern'; }

  function actionsHTML() {
    return '' +
      '<div class="exercise__actions">' +
        '<button class="btn" data-act="done" type="button">Geschafft</button>' +
        '<div class="exercise__sub-actions">' +
          '<button class="btn btn-ghost btn-sm" data-act="reroll" type="button">Etwas anderes, Wieland</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="skip" type="button">Überspringen</button>' +
        '</div>' +
      '</div>';
  }

  function bodyForType(ex) {
    switch (ex.type) {
      case 'breath':
        return '<div class="breath-phase" id="breath-phase">Bereit?</div>' +
               '<div class="breath-circle" id="breath-circle"></div>' +
               '<p class="counter__hint" id="breath-hint"></p>';
      case 'counter':
        return '<div class="counter" id="count">0</div>' +
               '<button class="tap-area" id="tap" type="button" aria-label="Tippen zum Zählen">' +
                 '<span class="counter__hint">Tippen</span></button>';
      case 'guesscount':
        return '<div id="gc-phase1" class="stack" style="align-items:center">' +
                 '<label class="counter__hint" for="gc-guess">Deine Schätzung</label>' +
                 '<input class="input" id="gc-guess" type="number" inputmode="numeric" min="0" style="max-width:160px;text-align:center">' +
                 '<button class="btn btn-sm" id="gc-go" type="button">Los, zählen!</button>' +
               '</div>' +
               '<div id="gc-phase2" hidden class="center-col">' +
                 '<div class="counter" id="count">0</div>' +
                 '<button class="tap-area" id="tap" type="button" aria-label="Tippen zum Zählen"><span class="counter__hint">Tippen</span></button>' +
                 '<p class="counter__hint" id="gc-result"></p>' +
               '</div>';
      case 'timer':
        if (ex.guess) {
          return '<button class="timer-circle" id="timer" type="button">Tippe, wenn du denkst,<br>die Zeit ist um</button>';
        }
        return '<div class="timer-circle" id="timer">' + ex.seconds + '<small>Sekunden</small></div>';
      case 'photo':
        return '<div class="photo-grid" id="photos"></div>' +
               '<p class="counter__hint" id="photo-count">0 / ' + ex.target + '</p>' +
               '<button class="btn btn-sm" id="photo-add" type="button">Foto aufnehmen</button>' +
               '<input class="visually-hidden" id="photo-input" type="file" accept="image/*" capture="environment">';
      case 'tour':
        return '<div class="counter__hint" id="tour-stage"></div>' +
               '<div class="exercise__title text-center" id="tour-label" style="margin:0"></div>' +
               '<div class="counter" id="count">0</div>' +
               '<button class="tap-area" id="tap" type="button" aria-label="Tippen zum Sammeln"><span class="counter__hint">Tippen</span></button>';
      default: // simple
        return '<img class="wieland wieland--sit" src="assets/wieland.png" alt="Wieland macht mit">';
    }
  }

  function showExercise(ex) {
    mode = 'exercise';
    var wt = $('walk-top');
    navWasVisible = !wt.hidden;
    wt.hidden = true;
    $('walk-center').hidden = true;     // Walk-Inhalt vollständig ausblenden
    var layer = $('exercise-layer');
    layer.innerHTML =
      '<div class="exercise">' +
        '<div class="exercise__head">' +
          '<p class="exercise__eyebrow">' + WW.esc(ex.header) + '</p>' +
          '<div class="row" style="align-items:flex-start;gap:8px">' +
            '<h1 class="exercise__title" id="ex-title">' + WW.esc(ex.text) + '</h1>' +
            '<button class="icon-btn" id="speak" type="button" aria-label="Vorlesen" aria-pressed="false"></button>' +
          '</div>' +
        '</div>' +
        '<div class="exercise__body" id="ex-body">' + bodyForType(ex) + '</div>' +
        actionsHTML() +
      '</div>';
    layer.hidden = false;
    $('speak').innerHTML = WW.icon('mic');

    wireCommonActions(ex);
    wireType(ex);
  }

  function closeExerciseAndWalk(advance) {
    var layer = $('exercise-layer');
    layer.hidden = true;
    layer.innerHTML = '';
    stopSpeak();
    if (advance) idx += 1;
    movedSinceLast = 0;
    mode = 'walking';
    $('walk-center').hidden = false;    // Walk-Inhalt wieder einblenden
    if (navWasVisible) $('walk-top').hidden = false;
    navWasVisible = false;
  }

  function wireCommonActions(ex) {
    var layer = $('exercise-layer');
    layer.querySelector('[data-act="done"]').addEventListener('click', function () { finishExercise(ex); });
    layer.querySelector('[data-act="skip"]').addEventListener('click', function () { closeExerciseAndWalk(true); });
    layer.querySelector('[data-act="reroll"]').addEventListener('click', function () {
      var fresh = WW.rerollExercise(ex.world, [ex.id]);
      if (fresh) { exercises[idx] = fresh; showExercise(fresh); }
    });
    $('speak').addEventListener('click', function () { toggleSpeak(ex.text); });
  }

  function finishExercise(ex) {
    WW.recordExerciseDone(ex.id);
    var key = worldTrophyKey(ex.world);
    doneTrophies.push(key);
    showTrophy(key);
  }

  /* ---------- Übungstypen verdrahten ---------- */
  function wireType(ex) {
    if (ex.type === 'counter') return wireCounter(ex, function () {});
    if (ex.type === 'breath') return wireBreath(ex);
    if (ex.type === 'timer') return wireTimer(ex);
    if (ex.type === 'photo') return wirePhoto(ex);
    if (ex.type === 'guesscount') return wireGuessCount(ex);
    if (ex.type === 'tour') return wireTour(ex);
    // simple: nichts weiter
  }

  function wireCounter(ex, onTarget) {
    var n = 0, countEl = $('count'), tap = $('tap');
    tap.addEventListener('click', function () {
      n += 1; countEl.textContent = n;
      if (ex.target && n >= ex.target) { tap.querySelector('.counter__hint').textContent = 'geschafft!'; onTarget(); }
    });
  }

  function wireBreath(ex) {
    var circle = $('breath-circle'), phase = $('breath-phase'), hint = $('breath-hint');
    var cyclesTotal = ex.cycles || 0, done = 0, stop = false;
    if (cyclesTotal) hint.textContent = '0 / ' + cyclesTotal + ' Atemzüge';
    function grow() {
      if (stop) return;
      phase.textContent = 'Einatmen';
      circle.style.transitionDuration = ex.inhale + 's';
      circle.style.transform = 'scale(1.9)';
      setTimeout(shrink, ex.inhale * 1000);
    }
    function shrink() {
      if (stop) return;
      phase.textContent = 'Ausatmen';
      circle.style.transitionDuration = ex.exhale + 's';
      circle.style.transform = 'scale(1)';
      setTimeout(function () {
        if (stop) return;
        done += 1;
        if (cyclesTotal) {
          hint.textContent = Math.min(done, cyclesTotal) + ' / ' + cyclesTotal + ' Atemzüge';
          if (done >= cyclesTotal) { phase.textContent = 'Fertig'; return; }
        }
        grow();
      }, ex.exhale * 1000);
    }
    // beim Verlassen Animation stoppen
    breathStops.push(function () { stop = true; });
    grow();
  }
  var breathStops = [];

  function wireTimer(ex) {
    if (ex.guess) {
      var btn = $('timer'), started = Date.now(), answered = false;
      btn.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        var secs = Math.round((Date.now() - started) / 1000);
        var diff = Math.abs(secs - ex.seconds);
        btn.innerHTML = (ex.doneLabel || 'Zeit vorbei') + '<small>du lagst ' + diff + ' Sek daneben</small>';
      });
    } else {
      var el = $('timer'), left = ex.seconds;
      var iv = setInterval(function () {
        left -= 1;
        if (left <= 0) { clearInterval(iv); el.innerHTML = 'fertig<small>gut gelauscht</small>'; }
        else { el.innerHTML = left + '<small>Sekunden</small>'; }
      }, 1000);
      timerStops.push(function () { clearInterval(iv); });
    }
  }
  var timerStops = [];

  function wirePhoto(ex) {
    var grid = $('photos'), countEl = $('photo-count'), input = $('photo-input');
    var n = 0;
    for (var i = 0; i < ex.target; i++) {
      var slot = document.createElement('div'); slot.className = 'photo-thumb'; grid.appendChild(slot);
    }
    $('photo-add').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (!input.files || !input.files[0]) return;
      if (n >= ex.target) return;
      var url = URL.createObjectURL(input.files[0]);
      var img = document.createElement('img'); img.src = url; img.alt = 'Foto ' + (n + 1);
      grid.children[n].appendChild(img);
      n += 1;
      countEl.textContent = n + ' / ' + ex.target;
      input.value = '';
    });
  }

  function wireGuessCount(ex) {
    $('gc-go').addEventListener('click', function () {
      var guess = parseInt($('gc-guess').value, 10);
      $('gc-phase1').hidden = true;
      $('gc-phase2').hidden = false;
      var n = 0, countEl = $('count'), tap = $('tap'), res = $('gc-result');
      tap.addEventListener('click', function () {
        n += 1; countEl.textContent = n;
        if (!isNaN(guess)) res.textContent = 'Geschätzt: ' + guess + ' · Gezählt: ' + n;
      });
    });
  }

  function wireTour(ex) {
    var stage = 0, n = 0;
    var stageEl = $('tour-stage'), labelEl = $('tour-label'), countEl = $('count'), tap = $('tap');
    function render() {
      var s = ex.stages[stage];
      stageEl.textContent = 'Stufe ' + (stage + 1) + ' / ' + ex.stages.length;
      labelEl.textContent = s.label;
      countEl.textContent = n + ' / ' + s.target;
    }
    tap.addEventListener('click', function () {
      n += 1; countEl.textContent = n + ' / ' + ex.stages[stage].target;
      if (n >= ex.stages[stage].target) {
        if (stage < ex.stages.length - 1) { stage += 1; n = 0; setTimeout(render, 250); }
        else { tap.querySelector('.counter__hint').textContent = 'alles gesammelt!'; }
      }
    });
    render();
  }

  /* ---------- Sprachausgabe (TTS) ---------- */
  var speaking = false;
  function toggleSpeak(text) {
    if (!('speechSynthesis' in window)) return;
    if (speaking) { stopSpeak(); return; }
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.onend = function () { speaking = false; setSpeakState(false); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      speaking = true; setSpeakState(true);
    } catch (e) { /* TTS nicht verfügbar */ }
  }
  function stopSpeak() {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
    speaking = false; setSpeakState(false);
  }
  function setSpeakState(on) {
    var b = $('speak'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* ---------- Trophäen-Modal ---------- */
  function showTrophy(key) {
    var fn = WW_TROPHIES[key] || WW_TROPHIES.stern;
    $('trophy-svg').innerHTML = fn(120);
    $('trophy-modal').hidden = false;
  }
  $('trophy-continue').addEventListener('click', function () {
    $('trophy-modal').hidden = true;
    // laufende Timer/Animationen der Übung stoppen
    breathStops.forEach(function (f) { f(); }); breathStops = [];
    timerStops.forEach(function (f) { f(); }); timerStops = [];
    closeExerciseAndWalk(true);
  });

  /* ---------- Beenden / Abschluss ---------- */
  function endWalk() {
    mode = 'done';
    if (tickTimer) clearInterval(tickTimer);
    if (watchId !== null && navigator.geolocation) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} }
    stopSpeak();
    WW.endSession(guided ? 'guided' : 'free');
    WW.clearWalkConfig();

    var wp = WW.weekProgress();
    var n = doneTrophies.length;
    $('done-text').textContent = n
      ? ('Du hast ' + n + (n === 1 ? ' Schatz' : ' Schätze') + ' für Wieland gesammelt. Wochenziel: ' + wp.count + '/' + wp.goal + '.')
      : ('Schön, dass du draußen warst! Wochenziel: ' + wp.count + '/' + wp.goal + '.');

    var box = $('done-trophies');
    box.innerHTML = doneTrophies.map(function (k) {
      var fn = WW_TROPHIES[k] || WW_TROPHIES.stern;
      return '<span class="token">' + fn(64) + '</span>';
    }).join('');
    $('done-modal').hidden = false;
  }
  $('end-walk').addEventListener('click', endWalk);

  $('debug-ex').addEventListener('click', function () {
    if (mode === 'done' || mode === 'exercise') return;
    // 1. Nächste geplante Übung
    var ex = exercises[idx] || exercises[Math.floor(Math.random() * exercises.length)];
    // 2. Aus dem globalen Katalog (immer verfügbar)
    if (!ex && typeof WW_EXERCISES !== 'undefined' && WW_EXERCISES.length) {
      ex = Object.assign({}, WW_EXERCISES[Math.floor(Math.random() * WW_EXERCISES.length)]);
    }
    // 3. Absoluter Fallback: einfache Übung
    if (!ex) {
      ex = { id: 'dbg', world: 1, header: 'WIELAND TESTET', text: 'Schau genau hin – was siehst du gerade?', type: 'simple' };
    }
    showExercise(ex);
  });

  /* ---------- Gerätekompass (DeviceOrientationEvent) ---------- */

  var HEADING_WIN_MS = 2000;   // 2-Sekunden-Fenster
  var OUTLIER_MAX    = 45;     // Messungen >45° vom Schätzwert werden ignoriert

  // 2-Sekunden-Fenstermittelung mit Ausreißerfilter + linearer Gewichtung (neu > alt)
  function windowedHeading(rawDeg) {
    var now = Date.now();
    var r = rawDeg * Math.PI / 180;
    headingBuf.push({ t: now, s: Math.sin(r), c: Math.cos(r) });

    // Alte Einträge entfernen
    var cut = now - HEADING_WIN_MS;
    var i = 0; while (i < headingBuf.length && headingBuf[i].t < cut) i++;
    if (i) headingBuf.splice(0, i);

    if (headingBuf.length < 2) return rawDeg;

    // Schritt 1: Grober Kreismittelwert als Ausreißerreferenz
    var rs = 0, rc = 0;
    for (var j = 0; j < headingBuf.length; j++) { rs += headingBuf[j].s; rc += headingBuf[j].c; }
    var roughDeg = (Math.atan2(rs, rc) * 180 / Math.PI + 360) % 360;

    // Schritt 2: Gewichteter Kreismittelwert ohne Ausreißer
    var wS = 0, wC = 0, wSum = 0;
    var newest = headingBuf[headingBuf.length - 1].t;
    var span   = Math.max(newest - headingBuf[0].t, 1);
    for (var j = 0; j < headingBuf.length; j++) {
      var deg = (Math.atan2(headingBuf[j].s, headingBuf[j].c) * 180 / Math.PI + 360) % 360;
      var diff = Math.abs(((deg - roughDeg + 180 + 360) % 360) - 180);
      if (diff > OUTLIER_MAX) continue;                         // Ausreißer überspringen
      var age = newest - headingBuf[j].t;
      var w   = 2.0 - 1.5 * (age / span);                      // 0.5 (alt) … 2.0 (neu)
      wS += w * headingBuf[j].s; wC += w * headingBuf[j].c; wSum += w;
    }
    if (wSum < 0.01) return roughDeg;
    return (Math.atan2(wS / wSum, wC / wSum) * 180 / Math.PI + 360) % 360;
  }

  function onOrientation(e) {
    var raw;
    if (e.webkitCompassHeading != null) {
      raw = e.webkitCompassHeading;
    } else if (e.alpha != null) {
      raw = (360 - e.alpha + 360) % 360;
    } else { return; }

    var heading = windowedHeading(raw);
    targetHeading = heading;                     // rAF-Loop liest diesen Wert
    if (navState) navState.deviceHeading = heading;

    // Texthint drosseln: max. 5× pro Sekunde
    var now = Date.now();
    if (now - lastOrientMs < 200) return;
    lastOrientMs = now;
    navUpdate();   // nur Textanweisung – Pfeil & Karte läuft per rAF
  }

  function _attachOrientListener() {
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    orientReady = true;
  }

  function initDeviceOrientation() {
    if (!window.DeviceOrientationEvent) return;
    if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
      _attachOrientListener(); return; // Android / Desktop: sofort
    }
    // iOS 13+: Permission braucht eine Nutzer-Geste → beim ersten Touch anfragen
    document.addEventListener('touchstart', function askOnce() {
      document.removeEventListener('touchstart', askOnce);
      if (orientReady) return;
      DeviceOrientationEvent.requestPermission().then(function (state) {
        if (state === 'granted') _attachOrientListener();
      }).catch(function () {});
    }, { passive: true });
  }

  function requestOrientationPermission() {
    if (orientReady || !window.DeviceOrientationEvent) return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(function (s) { if (s === 'granted') _attachOrientListener(); })
        .catch(function () {});
    } else { _attachOrientListener(); }
  }

  // Relative Richtung vom Nutzer zum Waypoint (Kompassbearing → Anzeigetext)
  function relDirection(brg, heading) {
    var rel = ((brg - heading) % 360 + 360) % 360;
    if (rel < 22.5  || rel >= 337.5) return 'geradeaus';
    if (rel < 67.5)  return 'leicht rechts';
    if (rel < 112.5) return 'rechts';
    if (rel < 157.5) return 'scharf rechts';
    if (rel < 202.5) return 'umkehren';
    if (rel < 247.5) return 'scharf links';
    if (rel < 292.5) return 'links';
    return 'leicht links';
  }

  // Kürzester Bogen: verhindert, dass CSS-Transition den langen Weg nimmt (z.B. 355°→5° = +10°, nicht -350°)
  function continuousAngle(prev, next) {
    var pMod = ((prev % 360) + 360) % 360;
    var nMod = ((next % 360) + 360) % 360;
    var diff = nMod - pMod;
    if (diff >  180) diff -= 360;
    if (diff < -180) diff += 360;
    return prev + diff;
  }

  /* ---------- Navigation: Kompass-Waypoint-System ---------- */

  function navBearing(lat1, lng1, lat2, lng2) {
    var D2R = Math.PI / 180;
    var f1 = lat1 * D2R, f2 = lat2 * D2R, dl = (lng2 - lng1) * D2R;
    var y = Math.sin(dl) * Math.cos(f2);
    var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function navDistText(d) {
    if (d < 50)   return Math.round(d) + ' m';
    if (d < 1000) return (Math.round(d / 10) * 10) + ' m';
    return (d / 1000).toFixed(1).replace('.', ',') + ' km';
  }

  // Build a waypoint list: ORS decision points + every ~350 m along the route
  function buildWaypoints(r) {
    var coords = r.coords, rawSteps = r.rawSteps || [], WP_DIST = 350;
    var wps = [], dist = 0;
    // Map coord-array index → raw ORS step
    var stepAt = {};
    rawSteps.forEach(function (st) {
      var ci = (st.way_points && st.way_points[0] != null) ? st.way_points[0] : 0;
      stepAt[ci] = st;
    });
    for (var i = 0; i < coords.length; i++) {
      if (i > 0) dist += WW.haversine(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
      var st = stepAt[i];
      if (i === 0 || st || dist >= WP_DIST) {
        wps.push({ lat: coords[i][0], lng: coords[i][1],
          instruction: st ? st.instruction : null,
          type:        st ? st.type        : null,
          name:        st ? (st.name || '') : '',
          isStep:      !!st });
        dist = 0;
      }
    }
    // Always include destination
    if (coords.length) {
      var lc = coords[coords.length - 1], lw = wps[wps.length - 1];
      if (!lw || WW.haversine(lw.lat, lw.lng, lc[0], lc[1]) > 5) {
        wps.push({ lat: lc[0], lng: lc[1], instruction: 'Ziel erreicht!',
          type: 11, name: '', isStep: true });
      }
    }
    return wps;
  }

  // Skip waypoints that the user has already passed
  function navSmartAdvance() {
    if (!navState || !curPos) return;
    var wps = navState.waypoints, changed = true;
    while (changed && navState.wpIndex < wps.length) {
      changed = false;
      var wp = wps[navState.wpIndex];
      var d  = WW.haversine(curPos.lat, curPos.lng, wp.lat, wp.lng);
      if (d < 30) { navState.wpIndex++; changed = true; continue; }
      // Next closer than current → user passed this one
      if (navState.wpIndex + 1 < wps.length) {
        var dn = WW.haversine(curPos.lat, curPos.lng,
          wps[navState.wpIndex + 1].lat, wps[navState.wpIndex + 1].lng);
        if (dn < d * 0.72) { navState.wpIndex++; changed = true; }
      }
    }
  }

  // Textanweisung aktualisieren — Pfeil & Karte laufen per rAF (compassRenderLoop)
  function navUpdate() {
    if (!navState || !curPos) return;
    var wps = navState.waypoints, wi = navState.wpIndex;
    if (wi >= wps.length) {
      $('instruction-text').textContent = 'Ziel erreicht!';
      mmUpdate(); return;
    }
    var wp   = wps[wi];
    var dist = WW.haversine(curPos.lat, curPos.lng, wp.lat, wp.lng);
    var brg  = navBearing(curPos.lat, curPos.lng, wp.lat, wp.lng);
    var dirTxt;
    if (navState.deviceHeading != null) {
      dirTxt = relDirection(brg, navState.deviceHeading);
    } else if (wp.instruction) {
      dirTxt = wp.instruction;
    } else {
      dirTxt = 'geradeaus';
    }
    $('instruction-text').textContent = 'In ' + navDistText(dist) + ' ' + dirTxt;
    mmUpdate();
  }

  /* ---------- ORS: Route laden & parsen ---------- */

  function fetchRoute(start, distanceMeters, key) {
    var url = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';
    var body = {
      coordinates: [[start.lng, start.lat]],
      instructions: true,
      language: 'de',
      options: { round_trip: { length: distanceMeters, points: 5,
                               seed: Math.floor(Math.random() * 1e6) } }
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Authorization': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('ORS ' + r.status);
      return r.json();
    }).then(parseRoute);
  }

  function parseRoute(geo) {
    var feat = geo.features && geo.features[0];
    if (!feat) throw new Error('keine Route');
    var coords = feat.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
    var steps = [], rawSteps = [];
    var seg = feat.properties.segments && feat.properties.segments[0];
    if (seg && seg.steps) {
      seg.steps.forEach(function (st) {
        var wi = (st.way_points && st.way_points[0] != null) ? st.way_points[0] : 0;
        steps.push({ instruction: st.instruction, distance: st.distance,
          location: coords[wi] || coords[0], type: st.type, name: st.name || '' });
        rawSteps.push({ instruction: st.instruction, distance: st.distance,
          type: st.type, name: st.name || '', way_points: st.way_points });
      });
    }
    return { coords: coords, steps: steps, rawSteps: rawSteps,
             distance: (feat.properties.summary || {}).distance || 0 };
  }

  function startGuidedRoute(start, key) {
    $('instruction-text').textContent = 'Route wird geladen…';
    fetchRoute(start, Math.round(WW.distanceKm(checkin.energy) * 1000), key)
      .then(function (r) {
        route = r;
        navState = { waypoints: buildWaypoints(r), wpIndex: 1,
                     deviceHeading: null, coords: r.coords };
        if (navState.waypoints.length <= 1) navState.wpIndex = 0;
        var wp0 = navState.waypoints[navState.wpIndex];
        $('instruction-text').textContent = wp0
          ? (wp0.instruction || 'Folge dem Weg.')
          : 'Folge dem Weg.';
        if (curPos) { navSmartAdvance(); navUpdate(); }
      })
      .catch(function () {
        $('instruction-text').textContent =
          'Route konnte nicht geladen werden. Du läufst frei weiter.';
      });
  }

  function initGuided() {
    var key = settings.orsKey;
    if (!key) return;
    $('walk-top').hidden = false;
    $('walk-hint').hidden = true;
    $('walk-sub').hidden  = true;
    $('nav-arrow').innerHTML  = WW.icon('arrowup');
    $('map-toggle').innerHTML = WW.icon('dots');
    var home = settings.home;
    var useHome = locationMode === 'home' && home && typeof home.lat === 'number';
    if (useHome) {
      startGuidedRoute(home, key);
    } else if (navigator.geolocation) {
      $('instruction-text').textContent = 'Standort wird ermittelt …';
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          startGuidedRoute({ lat: pos.coords.latitude, lng: pos.coords.longitude }, key);
        },
        function () {
          if (home && typeof home.lat === 'number') {
            startGuidedRoute(home, key);
          } else {
            $('instruction-text').textContent =
              'Standort konnte nicht ermittelt werden. Du läufst frei weiter.';
          }
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } else {
      $('instruction-text').textContent = 'GPS nicht verfügbar.';
    }
  }

  /* ---------- Minimap (kleines Leaflet-Overlay) ---------- */

  function mmInit() {
    if (typeof L === 'undefined' || mmReady) return;
    var center = (navState && navState.waypoints.length)
      ? [navState.waypoints[0].lat, navState.waypoints[0].lng]
      : (settings.home ? [settings.home.lat, settings.home.lng] : [48.4, 9.99]);
    minimap = L.map('minimap-container', {
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false
    }).setView(center, 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(minimap);
    if (navState && navState.coords && navState.coords.length) {
      mmLine = L.polyline(navState.coords, { color: '#042615', weight: 3, opacity: .8 }).addTo(minimap);
    }
    mmReady = true;
    setTimeout(function () { minimap.invalidateSize(); mmUpdate(); }, 80);
  }

  function mmUpdate() {
    if (!mmReady || !mmVisible || !minimap) return;
    if (curPos) {
      var ll = [curPos.lat, curPos.lng];
      if (mmUserMarker) mmUserMarker.setLatLng(ll);
      else mmUserMarker = L.circleMarker(ll, { radius: 7, color: '#fff',
        fillColor: '#93C3D9', fillOpacity: 1, weight: 2 }).addTo(minimap);
      minimap.setView(ll, 17, { animate: true });
    }
    if (navState && navState.wpIndex < navState.waypoints.length) {
      var wp = navState.waypoints[navState.wpIndex];
      var wll = [wp.lat, wp.lng];
      if (mmWpMarker) mmWpMarker.setLatLng(wll);
      else mmWpMarker = L.circleMarker(wll, { radius: 6, color: '#042615',
        fillColor: '#A6BD7B', fillOpacity: 1, weight: 2 }).addTo(minimap);
    }
  }

  // rAF-Animationsschleife: Pfeil + Minimap bei 60 fps unabhängig von Sensor-Events
  var RAF_ARROW = 0.18;  // Interpolationsgeschwindigkeit Pfeil
  var RAF_MAP   = 0.14;  // Interpolationsgeschwindigkeit Karte (etwas sanfter)

  function compassRenderLoop() {
    requestAnimationFrame(compassRenderLoop);
    if (targetHeading == null || !navState) return;

    // --- Pfeil ---
    if (curPos && navState.waypoints && navState.wpIndex < navState.waypoints.length) {
      var wp  = navState.waypoints[navState.wpIndex];
      var brg = navBearing(curPos.lat, curPos.lng, wp.lat, wp.lng);
      var arrowTarget = (brg - targetHeading + 360) % 360;
      var contArrow   = continuousAngle(arrowDisplayAngle, arrowTarget);
      var da = contArrow - arrowDisplayAngle;
      if (Math.abs(da) > 0.05) {
        arrowDisplayAngle += da * RAF_ARROW;
        $('nav-arrow').style.transform = 'rotate(' + arrowDisplayAngle + 'deg)';
      }
    }

    // --- Minimap ---
    if (mmReady && mmVisible) {
      var mapTarget = (360 - targetHeading % 360) % 360;
      var contMap   = continuousAngle(mapDisplayAngle, mapTarget);
      var dm = contMap - mapDisplayAngle;
      if (Math.abs(dm) > 0.05) {
        mapDisplayAngle += dm * RAF_MAP;
        var el = document.getElementById('minimap-rotatable');
        if (el) el.style.transform = 'rotate(' + mapDisplayAngle + 'deg)';
      }
    }
  }

  function mmOpen() {
    $('inline-minimap').hidden = false;
    mmVisible = true;
    if (!mmReady) setTimeout(mmInit, 80);
    else setTimeout(function () { minimap.invalidateSize(); mmUpdate(); }, 50);
  }
  function mmClose() { $('inline-minimap').hidden = true; mmVisible = false; }

  /* ---------- Karten-Menü ---------- */
  $('map-toggle').addEventListener('click', function () {
    requestOrientationPermission();
    if ($('inline-minimap').hidden) mmOpen(); else mmClose();
  });
  $('menu-fullmap').addEventListener('click', openMap);

  /* ---------- Karten-Panel (Leaflet) ---------- */
  function openMap() {
    $('map-panel').hidden = false;
    if (!mapReady) initMap();
    else if (map) setTimeout(function () { map.invalidateSize(); }, 50);
  }
  function initMap() {
    if (typeof L === 'undefined') {
      $('map').innerHTML = '<p class="hint" style="padding:16px">Karte konnte nicht geladen werden (keine Verbindung).</p>';
      return;
    }
    var rcoords = (navState && navState.coords) || (route && route.coords);
    var center  = (rcoords && rcoords[0]) || (settings.home ? [settings.home.lat, settings.home.lng] : [48.4, 9.99]);
    map = L.map('map').setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende'
    }).addTo(map);
    if (rcoords && rcoords.length) {
      routeLine = L.polyline(rcoords, { color: '#042615', weight: 5, opacity: .85 }).addTo(map);
      L.circleMarker(rcoords[0], { radius: 7, color: '#042615', fillColor: '#A6BD7B', fillOpacity: 1 })
        .addTo(map).bindPopup('Start &amp; Ziel');
      map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
    }
    if (curPos) userMarker = L.circleMarker([curPos.lat, curPos.lng], { radius: 6, color: '#93C3D9', fillColor: '#93C3D9', fillOpacity: 1 }).addTo(map);
    mapReady = true;
    setTimeout(function () { map.invalidateSize(); }, 50);
  }
  $('map-close').addEventListener('click', function () { $('map-panel').hidden = true; });

  /* ---------- Start ---------- */
  $('sos').innerHTML = 'Notruf';
  initDeviceOrientation();
  requestAnimationFrame(compassRenderLoop);
  if (guided) initGuided();
  startTracking();
  tickTimer = setInterval(tick, 1000);

})();
