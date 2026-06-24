/* Wielands Höhle: Sticker auf dem Regal – wöchentliche Achievements */
(function () {
  'use strict';

  var WORLD_STICKER = { 1: 'st-w1', 2: 'st-w2', 3: 'st-w3', 4: 'st-w4', 5: 'st-w5' };
  var WORLD_BADGE   = { 1: 'sb-w1', 2: 'sb-w2', 3: 'sb-w3', 4: 'sb-w4', 5: 'sb-w5' };

  function updateShelf() {
    var counts = WW.weeklyWorldCounts();

    Object.keys(WORLD_STICKER).forEach(function (w) {
      var n   = counts[parseInt(w, 10)] || 0;
      var el  = document.getElementById(WORLD_STICKER[w]);
      var bdg = document.getElementById(WORLD_BADGE[w]);
      if (!el) return;

      if (n > 0) { el.classList.remove('is-locked'); }
      else        { el.classList.add('is-locked'); }

      if (bdg) {
        if (n > 1) { bdg.textContent = n; bdg.hidden = false; }
        else        { bdg.hidden = true; }
      }
    });

    var spEl = document.getElementById('st-sp');
    if (spEl) {
      var bossDone = !!(WW.getState().achievements && WW.getState().achievements.bossTour);
      if (bossDone) { spEl.classList.remove('is-locked'); }
      else           { spEl.classList.add('is-locked'); }
    }

    var label = document.getElementById('col-week-label');
    if (label) {
      var worldsDone = Object.values ? Object.values(counts).filter(function (n) { return n > 0; }).length
        : Object.keys(counts).filter(function (k) { return counts[k] > 0; }).length;
      if (worldsDone === 0) {
        label.textContent = 'Diese Woche noch keine Übungen – los geht\'s!';
      } else {
        var total = Object.keys(counts).reduce(function (s, k) { return s + (counts[k] || 0); }, 0);
        label.textContent = 'Diese Woche: ' + total + ' ' + (total === 1 ? 'Übung' : 'Übungen') +
          ' aus ' + worldsDone + ' ' + (worldsDone === 1 ? 'Welt' : 'Welten') + '.';
      }
    }
  }

  updateShelf();
  WW.mountNav('collection');
})();
