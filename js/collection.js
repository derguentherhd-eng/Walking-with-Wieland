/* Wielands Höhle: Sticker auf dem Regal + Erfolge */
(function () {
  'use strict';

  // Welten -> Sticker-Element-ID
  var WORLD_STICKER = { 1: 'st-w1', 2: 'st-w2', 3: 'st-w3', 4: 'st-w4', 5: 'st-w5' };

  function updateStickers() {
    var collected = WW.getState().collected || {};
    Object.keys(WORLD_STICKER).forEach(function (w) {
      var anyDone = WW.worldExercises(parseInt(w, 10)).some(function (e) {
        return !!collected[e.id];
      });
      var el = document.getElementById(WORLD_STICKER[w]);
      if (el) {
        if (anyDone) el.classList.remove('is-locked');
        else         el.classList.add('is-locked');
      }
    });
  }

  function renderAchievements() {
    var a = WW.getState().achievements || {};
    var defs = [
      { key: 'firstWalk',     title: 'Erster Spaziergang mit Wieland', desc: 'Du warst zum ersten Mal mit Wieland unterwegs.' },
      { key: 'weekGoal',      title: 'Wochenziel erreicht',             desc: 'Du hast dein Wochenziel an Spaziergängen geschafft.' },
      { key: 'allWorldsWeek', title: 'Entdecker der Woche',             desc: 'In einer Woche aus jeder Welt eine Übung gemacht.' },
      { key: 'bossTour',      title: 'Große Entdeckungstour',           desc: 'Du hast die große Entdeckungstour gemeistert.' }
    ];

    document.getElementById('achievements').innerHTML = defs.map(function (d) {
      var done  = !!a[d.key];
      var badge = done ? WW.icon('check') : WW.icon('paw');
      return '<div class="ach' + (done ? ' is-done' : '') + '">' +
        '<span class="ach__badge">' + badge + '</span>' +
        '<span class="ach__txt"><b>' + WW.esc(d.title) + '</b>' +
        '<span>' + WW.esc(done ? d.desc : 'Noch nicht freigeschaltet.') + '</span></span>' +
        '</div>';
    }).join('');
  }

  updateStickers();
  renderAchievements();
  WW.mountNav('collection');
})();
