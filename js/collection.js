/* Wielands Höhle — Trophy-Regal mit Wochen-Navigation */
(function () {
  'use strict';

  /* Welten → Slot-IDs */
  var SLOTS  = { 1: 'ts-w1', 2: 'ts-w2', 3: 'ts-w3', 4: 'ts-w4', 5: 'ts-w5' };
  var COUNTS = { 1: 'tc-w1', 2: 'tc-w2', 3: 'tc-w3', 4: 'tc-w4', 5: 'tc-w5' };

  var offset = 0; // 0 = diese Woche, 1 = letzte Woche, …

  function sundayForOffset(off) {
    var d = new Date(WW.currentSundayISO() + 'T00:00:00');
    d.setDate(d.getDate() - off * 7);
    return WW.toISO(d);
  }

  function weekLabel(sundayISO) {
    var sun = new Date(sundayISO + 'T00:00:00');
    var sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    var months = ['Jan.','Feb.','Mär.','Apr.','Mai','Jun.','Jul.','Aug.','Sep.','Okt.','Nov.','Dez.'];
    var d1 = sun.getDate(), d2 = sat.getDate();
    var m1 = months[sun.getMonth()], m2 = months[sat.getMonth()];
    return m1 === m2
      ? d1 + '.–' + d2 + '. ' + m1
      : d1 + '. ' + m1 + '–' + d2 + '. ' + m2;
  }

  function renderShelf() {
    var sundayISO = sundayForOffset(offset);
    var counts = WW.weeklyWorldCountsForWeek(sundayISO);

    Object.keys(SLOTS).forEach(function (w) {
      var n   = counts[parseInt(w, 10)] || 0;
      var slot = document.getElementById(SLOTS[w]);
      var cnt  = document.getElementById(COUNTS[w]);
      if (!slot) return;

      if (n > 0) {
        slot.classList.remove('is-empty');
      } else {
        slot.classList.add('is-empty');
      }

      if (cnt) {
        cnt.textContent = n > 1 ? n : '';
        cnt.hidden = n <= 1;
      }
    });

    /* Wochenlabel */
    var lbl = document.getElementById('week-label');
    if (lbl) {
      lbl.textContent = offset === 0 ? 'Diese Woche' : weekLabel(sundayISO);
    }

    /* Pfeile */
    var prev = document.getElementById('week-prev');
    var next = document.getElementById('week-next');
    if (next) next.disabled = offset === 0;
  }

  document.getElementById('week-prev').addEventListener('click', function () {
    offset += 1;
    renderShelf();
  });

  document.getElementById('week-next').addEventListener('click', function () {
    if (offset > 0) { offset -= 1; renderShelf(); }
  });

  renderShelf();
  WW.mountNav('collection');
})();
