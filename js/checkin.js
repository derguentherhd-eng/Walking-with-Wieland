/* Check-In: Werte einlesen, Routenzeit anzeigen, Standort wählen, Walk starten */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Schließen ---------- */
  $('ci-close').innerHTML = WW.icon('x');
  $('ci-close').addEventListener('click', function () {
    window.location.href = 'index.html';
  });

  /* ---------- Energie-Slider → Routenzeit live anzeigen ---------- */
  function updateEnergyTime() {
    var mins = WW.estimateMinutes(parseInt($('energy').value, 10));
    $('energy-time').textContent = 'ca. ' + mins + ' Min.';
  }
  $('energy').addEventListener('input', updateEnergyTime);
  updateEnergyTime();   // Initialwert setzen

  /* ---------- Standort-Auswahl ---------- */
  var locationMode = 'gps';   // 'gps' | 'home'

  function setLocMode(mode) {
    locationMode = mode;
    $('loc-gps').className  = 'btn btn-sm' + (mode === 'gps'  ? '' : ' btn-ghost');
    $('loc-home').className = 'btn btn-sm' + (mode === 'home' ? '' : ' btn-ghost');
  }

  var savedHome = WW.getSettings().home;
  if (savedHome && typeof savedHome.lat === 'number') {
    $('loc-home').hidden = false;
    $('loc-hint').textContent =
      'Heimat: ' + savedHome.lat.toFixed(4) + ', ' + savedHome.lng.toFixed(4);
  } else {
    $('loc-hint').textContent =
      'Aktuellen GPS-Standort als Start verwenden. ' +
      'Oder Heimat-Standort in den Einstellungen speichern.';
  }

  $('loc-gps').addEventListener('click',  function () { setLocMode('gps'); });
  $('loc-home').addEventListener('click', function () { setLocMode('home'); });

  /* Route-Toggle: Standort-Auswahl ein-/ausblenden + Hinweis wenn kein ORS-Schlüssel */
  $('route').addEventListener('change', function () {
    var on = this.checked;
    $('location-choice').hidden = !on;
    $('route-hint').hidden = !(on && !WW.getSettings().orsKey);
  });

  /* ---------- Starten ---------- */
  $('ci-start').addEventListener('click', function () {
    var cfg = {
      checkin: {
        energy: parseInt($('energy').value, 10),
        stress: parseInt($('stress').value, 10),
        mood:   parseInt($('mood').value,   10)
      },
      guided:       $('route').checked,
      locationMode: locationMode
    };
    function go() { WW.setWalkConfig(cfg); window.location.href = 'walk.html'; }
    // iOS 13+: Kompass-Permission hier erbitten (wir sind schon in einem User-Gesture).
    // Danach kann walk.html die Permission sofort ohne weiteren Tap verwenden.
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function () { go(); }).catch(go);
    } else {
      go();
    }
  });
})();
