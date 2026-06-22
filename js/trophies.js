/* ============================================================
   Walking with Wieland — Trophäen / "Schätze" als SVG
   Eine Trophäe pro Welt (+ Stern für die Spezialübung).
   Reine Palettenfarben, dunkle Outline wie beim Wiesel-Asset.
   WW_TROPHIES[key](size) -> SVG-String
============================================================ */
const WW_TROPHIES = (function () {
  const D = '#042615'; // dunkles Grün (Outline)
  function wrap(size, inner) {
    return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size +
      '" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  return {
    // Welt 1 – Spürnase: Blatt
    blatt: function (s) {
      return wrap(s,
        '<path d="M50 12C28 30 28 70 50 90C72 70 72 30 50 12Z" fill="#A6BD7B" stroke="' + D + '" stroke-width="4" stroke-linejoin="round"/>' +
        '<path d="M50 22V82" stroke="' + D + '" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M50 40L40 48M50 56L62 64M50 50L61 42M50 66L42 72" stroke="' + D + '" stroke-width="2.5" stroke-linecap="round"/>');
    },
    // Welt 2 – Ruhe: ruhige Wellen
    welle: function (s) {
      var w = function (y, o) {
        return '<path d="M22 ' + y + ' q9 -10 18 0 q9 10 18 0 q9 -10 18 0" fill="none" stroke="' + D +
          '" stroke-width="3.5" stroke-linecap="round" opacity="' + o + '"/>';
      };
      return wrap(s,
        '<circle cx="50" cy="50" r="38" fill="#A9C9C5" stroke="' + D + '" stroke-width="4"/>' +
        w(44, 0.55) + w(54, 1) + w(64, 0.7));
    },
    // Welt 3 – Zeitgefühl: Mond
    mond: function (s) {
      return wrap(s,
        '<path d="M64 16a36 36 0 1 0 0 68a28 28 0 1 1 0-68Z" fill="#93C3D9" stroke="' + D + '" stroke-width="4" stroke-linejoin="round"/>' +
        '<path d="M34 56l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#F7F7EB" stroke="' + D + '" stroke-width="1.6" stroke-linejoin="round"/>');
    },
    // Welt 4 – Schatzkiste: Herz
    herz: function (s) {
      return wrap(s,
        '<path d="M50 86C20 64 16 38 34 32c8-3 14 3 16 8 2-5 8-11 16-8 18 6 14 32-16 54Z" fill="#A6BD7B" stroke="' + D + '" stroke-width="4" stroke-linejoin="round"/>');
    },
    // Welt 5 – Entdeckerblick: Kompass
    kompass: function (s) {
      return wrap(s,
        '<circle cx="50" cy="50" r="36" fill="#A6BD7B" stroke="' + D + '" stroke-width="4"/>' +
        '<path d="M50 24l8 26-8 8-8-8z" fill="#F7F7EB" stroke="' + D + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M50 76l-8-26 8-8 8 8z" fill="' + D + '"/>' +
        '<circle cx="50" cy="50" r="4" fill="#F7F7EB" stroke="' + D + '" stroke-width="2"/>');
    },
    // Spezial – Stern
    stern: function (s) {
      return wrap(s,
        '<path d="M50 12l10 24 26 2-20 17 7 25-23-14-23 14 7-25-20-17 26-2z" fill="#E6EBC2" stroke="' + D + '" stroke-width="4" stroke-linejoin="round"/>');
    }
  };
})();
