/* Einstellungen: Heimat-Standort, ORS-Schlüssel, Wochenziel, Testmodus, Reset */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Heimat-Standort ---------- */
  function fmt(n) { return (Math.round(n * 100000) / 100000).toFixed(5); }

  function renderHome() {
    var h = WW.getSettings().home;
    var el = $('home-status');
    if (h && typeof h.lat === 'number') {
      el.textContent = 'Gespeichert: ' + fmt(h.lat) + ', ' + fmt(h.lng);
      $('home-lat').value = h.lat;
      $('home-lng').value = h.lng;
    } else {
      el.textContent = 'Noch kein Standort gespeichert.';
    }
  }

  $('home-gps').addEventListener('click', function () {
    var el = $('home-status');
    if (!navigator.geolocation) { el.textContent = 'Dein Gerät unterstützt keine Standortbestimmung.'; return; }
    el.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(function (pos) {
      WW.setHome(pos.coords.latitude, pos.coords.longitude);
      renderHome();
    }, function () {
      el.textContent = 'Standort konnte nicht ermittelt werden. Bitte erlaube den Zugriff oder gib ihn manuell ein.';
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  $('home-manual').addEventListener('click', function () {
    var lat = parseFloat($('home-lat').value);
    var lng = parseFloat($('home-lng').value);
    if (isNaN(lat) || isNaN(lng)) { $('home-status').textContent = 'Bitte gültige Koordinaten eingeben.'; return; }
    WW.setHome(lat, lng);
    renderHome();
  });

  $('home-clear').addEventListener('click', function () {
    WW.clearHome();
    $('home-lat').value = '';
    $('home-lng').value = '';
    renderHome();
  });

  /* ---------- ORS-Schlüssel ---------- */
  function renderKey() { $('ors-key').value = WW.getSettings().orsKey || ''; }

  $('ors-save').addEventListener('click', function () {
    WW.setOrsKey($('ors-key').value.trim());
    flash(this, 'Gespeichert');
  });

  /* ---------- Wochenziel ---------- */
  function renderGoal() { $('goal-value').textContent = WW.getSettings().weeklyGoal || 4; }

  function bumpGoal(delta) {
    var next = (WW.getSettings().weeklyGoal || 4) + delta;
    WW.setWeeklyGoal(next);
    renderGoal();
  }
  $('goal-minus').addEventListener('click', function () { bumpGoal(-1); });
  $('goal-plus').addEventListener('click', function () { bumpGoal(1); });

  /* ---------- Testmodus ---------- */
  function renderTest() { $('test-mode').checked = !!WW.getSettings().testMode; }
  $('test-mode').addEventListener('change', function () { WW.setTestMode(this.checked); });

  /* ---------- Fortschritt zurücksetzen ---------- */
  $('reset-progress').addEventListener('click', function () {
    var ok = window.confirm('Wirklich alle Spaziergänge, Schätze und Erfolge zurücksetzen?');
    if (!ok) return;
    WW.resetProgress();
    var st = $('reset-status');
    st.hidden = false;
    st.textContent = 'Fortschritt wurde zurückgesetzt.';
    renderHome(); renderKey(); renderGoal(); renderTest();
  });

  /* ---------- kleines visuelles Feedback ---------- */
  function flash(btn, msg) {
    var orig = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 1400);
  }

  /* ---------- init ---------- */
  renderHome();
  renderKey();
  renderGoal();
  renderTest();
  WW.mountNav('settings');
})();
