/* Home: Wochenleiste, Sprechblase, Navigation */
(function () {
  'use strict';

  function renderWeekbar() {
    var wp = WW.weekProgress();
    var dots = wp.days.map(function (d) {
      return '<span class="pawdot' + (d.active ? ' is-on' : '') + '" title="' + WW.esc(d.label) + '">' +
        WW.icon('paw') + '</span>';
    }).join('');
    var el = document.getElementById('weekbar');
    el.innerHTML = '<span class="weekbar__count">' + wp.count + '/' + wp.goal + '</span>' +
      '<span class="weekbar__dots">' + dots + '</span>';
  }

  function renderBubble() {
    document.getElementById('bubble').textContent = WW.speechBubble();
  }

  renderWeekbar();
  renderBubble();
  WW.mountNav('home');
})();
