/* Statistik: Wochenraster der letzten Wochen */
(function () {
  'use strict';

  var WEEKS_SHOWN = 6;

  function cellClass(type) {
    if (type === 'free') return 'cell cell--free';
    if (type === 'guided') return 'cell cell--guided';
    return 'cell';
  }

  function cellHTML(day) {
    var inner = day.type ? '' : WW.icon('paw');
    var title = day.label + ', ' + day.date +
      (day.type === 'free' ? ' – freies Laufen'
        : day.type === 'guided' ? ' – angeleitete Strecke'
        : ' – kein Spaziergang');
    return '<span class="' + cellClass(day.type) + '" title="' + WW.esc(title) + '">' + inner + '</span>';
  }

  function render() {
    var weeks = WW.recentWeeks(WEEKS_SHOWN);
    var html = weeks.map(function (wk) {
      return '<div class="stat-row">' + wk.days.map(cellHTML).join('') + '</div>';
    }).join('');
    document.getElementById('weeks').innerHTML = html;
  }

  render();
  WW.mountNav('stats');
})();
