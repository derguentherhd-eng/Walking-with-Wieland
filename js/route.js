/* ============================================================
   Walking with Wieland — Übungsrouten-Algorithmus
   buildRoute(checkin, options) → { exercises, count }

   Stellt abhängig von Energie, Stress und Laune eine
   geordnete Übungsfolge als emotionalen Spannungsbogen zusammen:
     Start:  beruhigend / erdend  (holt den User ab)
     Mitte:  aktiv / neugierig
     Ende:   stimmungshebend      (der entscheidende Nudge)
============================================================ */
(function (global) {
  'use strict';

  /* ── Tunable Konstanten ─────────────────────────────────────
     An diesen Schrauben drehen:
     - Mix zu ruhig? → K5_ENERGY ↑ oder BASE5 ↑ (mehr Entdecken)
     - Mix zu aktiv? → BASE2 ↑ oder K2_STRESS ↑ (mehr Ruhe)
     - Zu wenige Welten? → MIN_DISTINCT_WORLDS ↑ oder MAX_SHARE ↓
     - Zu viele Übungen? → EX_MAX ↓ oder EX_MIN ↓
     - Zu vorhersehbar? → HISTORY_BLOCK ↑
  ──────────────────────────────────────────────────────────── */
  var RC = {
    /* Anzahl Übungen */
    EX_MIN: 4, EX_MAX: 9, MIN_PER_EX: 6,

    /* Basisgewichte und Koeffizienten für die 5 Welten */
    BASE1: 1.0, K1_STRESS: 0.8,
    BASE2: 0.5, K2_STRESS: 1.6, K2_LOWENERGY: 0.5,
    BASE3: 0.6, K3_RELAX:  0.4,
    BASE4: 0.5, K4_LOWMOOD: 1.6,
    BASE5: 0.4, K5_ENERGY: 1.4,

    /* Vielfalt */
    MAX_SHARE: 0.45,        /* max. Anteil einer Welt */
    MIN_DISTINCT_WORLDS: 3, /* mindestens 3 Welten ab n ≥ 4 */

    /* Spannungsbogen */
    OPEN_CALM:   true,      /* erstes Slot(s): immer beruhigend (calm:true) */
    CLOSE_UPLIFT: true,     /* letzte(s) Slot(s): stimmungshebend */
    NO_SAME_WORLD_ADJACENT: true,
    NO_TWO_HIGH_EFFORT_ADJACENT: true,

    /* History – letzte N IDs nicht wiederholen */
    HISTORY_BLOCK: 12,
    HISTORY_KEY: 'ww_route_history',

    /* Spezialübung */
    SPECIAL_MIN_ENERGY: 0.7, SPECIAL_MIN_N: 8, SPECIAL_CHANCE: 0.15,

    /* Aufwand je Übungstyp */
    EFFORT: { simple: 1, breath: 1, counter: 1, guesscount: 1, timer: 2, photo: 3, tour: 5 },
    EFFORT_LONG_TIMER: 3,      /* timer mit seconds ≥ 120 */
    EFFORT_HIGH: 2,            /* ab hier gilt Übung als anspruchsvoll */

    /* Farb-Pool für {color}-Platzhalter */
    COLOR_POOL: ['Rot','Blau','Gelb','Grün','Orange','Violett','Weiß','Braun','Rosa','Türkis'],
  };

  /* ── Allgemeine Hilfsfunktionen ────────────────────────────── */

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function randInt(n) { return Math.floor(Math.random() * n); }

  /* Fisher-Yates Shuffle (in-place, gibt arr zurück) */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* Aufwand einer Übung bestimmen */
  function effortOf(ex) {
    var base = RC.EFFORT[ex.type] || 1;
    if (ex.type === 'timer' && ex.seconds >= 120) base = RC.EFFORT_LONG_TIMER;
    return base;
  }

  /* ── History (localStorage) ────────────────────────────────── */

  function loadHistory() {
    try {
      var raw = localStorage.getItem(RC.HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveHistory(ids) {
    try {
      localStorage.setItem(RC.HISTORY_KEY,
        JSON.stringify(ids.slice(-RC.HISTORY_BLOCK)));
    } catch (e) {}
  }

  /* ── Schritt 1: Welt-Gewichte → ganzzahlige Anzahl je Welt ─── */

  /**
   * weightsToCounts(weights, n) → { '1': k, '2': k, … }
   * Verteilt n Slots proportional zu den Gewichten.
   * Largest-Remainder-Methode für Ganzzahlen, MAX_SHARE wird
   * durchgesetzt; ab n ≥ 4 mindestens MIN_DISTINCT_WORLDS Welten.
   */
  function weightsToCounts(weights, n) {
    var worlds = Object.keys(weights); /* '1'…'5' als Strings */
    var total  = worlds.reduce(function (s, w) { return s + weights[w]; }, 0) || 1;

    /* Rohverteilung */
    var exact = {};
    worlds.forEach(function (w) { exact[w] = (weights[w] / total) * n; });

    /* MAX_SHARE durchsetzen – Überschuss auf den Rest verteilen */
    var maxSlots = Math.max(1, Math.floor(RC.MAX_SHARE * n));
    var overflow = 0;
    worlds.forEach(function (w) {
      if (exact[w] > maxSlots) { overflow += exact[w] - maxSlots; exact[w] = maxSlots; }
    });
    if (overflow > 0) {
      var under = worlds.filter(function (w) { return exact[w] < maxSlots; });
      var ut = under.reduce(function (s, w) { return s + exact[w]; }, 0) || 1;
      under.forEach(function (w) { exact[w] += overflow * (exact[w] / ut); });
    }

    /* Ganzzahlverteilung: floor + Largest-Remainder-Reste */
    var floors = {};
    worlds.forEach(function (w) { floors[w] = Math.floor(exact[w]); });
    var rem = n - worlds.reduce(function (s, w) { return s + floors[w]; }, 0);
    worlds.slice().sort(function (a, b) {
      return (exact[b] - floors[b]) - (exact[a] - floors[a]);
    }).forEach(function (w, i) { if (i < rem) floors[w]++; });

    /* MIN_DISTINCT_WORLDS: fehlende Welten mit je 1 Slot ergänzen */
    if (n >= 4) {
      var nonZero = worlds.filter(function (w) { return floors[w] > 0; });
      if (nonZero.length < RC.MIN_DISTINCT_WORLDS) {
        var needed = RC.MIN_DISTINCT_WORLDS - nonZero.length;
        /* Welten nach Gewicht sortiert durchgehen */
        worlds.slice().sort(function (a, b) { return weights[b] - weights[a]; })
          .forEach(function (w) {
            if (needed <= 0 || floors[w] > 0) return;
            /* Slot vom grössten vorhandenen abgeben */
            var donor = worlds.filter(function (x) { return floors[x] > 1; })
              .sort(function (a, b) { return floors[b] - floors[a]; })[0];
            if (donor) { floors[donor]--; floors[w] = 1; needed--; }
          });
      }
    }

    return floors;
  }

  /* ── Schritt 2: Welt-Slots in emotionalen Bogen ordnen ─────── */

  /**
   * sequenceWorlds(counts, n, E, S, M) → [1, 2, 4, 5, …]
   * Erzeugt die geordnete Folge der Welt-Slots.
   * Start (calm): W2 bei hohem Stress, sonst W1/W3.
   * Ende (uplift): bevorzugt W4 (Schatzkiste).
   * Mitte: W5 (Entdecken) eher zentral, W2 eher am Rand.
   */
  function sequenceWorlds(counts, n, E, S) {
    /* Slot-Pool aufbauen */
    var pool = [];
    Object.keys(counts).forEach(function (w) {
      for (var i = 0; i < counts[w]; i++) pool.push(parseInt(w, 10));
    });
    if (pool.length <= 1) return pool;

    /* Größe von Start- und End-Bereich */
    var openC  = n >= 7 ? 2 : 1;
    var closeC = n >= 7 ? 2 : 1;
    if (openC + closeC >= pool.length) { openC = 1; closeC = 1; }
    if (openC + closeC >= pool.length) { openC = 0; closeC = 1; }

    /* Bevorzugte Welten für Start (beruhigend) und Ende (stimmungshebend) */
    var openPref  = S >= 0.6 ? [2, 1, 3, 4] : [1, 2, 3, 4];
    var closePref = [4, 1, 3, 2, 5];

    function pull(pref) {
      for (var pi = 0; pi < pref.length; pi++) {
        var idx = pool.indexOf(pref[pi]);
        if (idx >= 0) return pool.splice(idx, 1)[0];
      }
      return pool.splice(0, 1)[0];
    }

    var opens  = [], closes = [];
    for (var oi = 0; oi < openC;  oi++) opens.push(pull(openPref));
    for (var ci = 0; ci < closeC; ci++) closes.push(pull(closePref));

    /* Mitte: W5 (aktiv) zum Kern, W2 (ruhig) an den Rand des Mittelteils */
    var midOrder = { 5: 0, 3: 1, 1: 2, 4: 3, 2: 4 };
    var mid = pool.slice().sort(function (a, b) {
      return (midOrder[a] || 2) - (midOrder[b] || 2);
    });
    /* Innerhalb gleicher Gruppen mischen */
    shuffle(mid);

    var seq = opens.concat(mid).concat(closes);

    /* Keine zwei gleichen Welten direkt hintereinander (Swap-Reparatur) */
    if (RC.NO_SAME_WORLD_ADJACENT) {
      for (var r = 0; r < seq.length - 1; r++) {
        if (seq[r] === seq[r + 1]) {
          for (var s = r + 2; s < seq.length; s++) {
            if (seq[s] !== seq[r]) {
              var tmp = seq[r + 1]; seq[r + 1] = seq[s]; seq[s] = tmp;
              break;
            }
          }
        }
      }
    }

    return seq;
  }

  /* ── Schritt 3: Konkrete Übung je Slot wählen ──────────────── */

  /**
   * pickExercise(world, opts) → exercise | null
   * opts = { used: Set, historySet: Set, needCalm, E, highEffortPrev }
   */
  function pickExercise(world, opts) {
    /* Kandidatenpool für diese Welt filtern */
    var pool = WW_EXERCISES.filter(function (ex) {
      if (ex.world !== world)          return false; /* falsche Welt */
      if (opts.used.has(ex.id))        return false; /* schon in dieser Runde */
      if (opts.needCalm && !ex.calm)   return false; /* Slot braucht calm */
      /* Bei sehr wenig Energie anspruchsvolle Typen ausschließen */
      if (opts.E < 0.3 && effortOf(ex) > RC.EFFORT_HIGH) return false;
      return true;
    });
    if (!pool.length) return null;

    /* Anti-Cluster: nach High-Effort lieber ruhige Übungen bevorzugen */
    if (opts.highEffortPrev && RC.NO_TWO_HIGH_EFFORT_ADJACENT) {
      pool.sort(function (a, b) { return effortOf(a) - effortOf(b); });
    }

    /* Least-Recently-Used: History-Übungen ans Ende sortieren */
    pool.sort(function (a, b) {
      return (opts.historySet.has(a.id) ? 1 : 0) - (opts.historySet.has(b.id) ? 1 : 0);
    });

    /* Unter den "frischen" Übungen zufällig wählen */
    var freshCount = 0;
    var inHist0 = opts.historySet.has(pool[0].id);
    while (freshCount < pool.length &&
           opts.historySet.has(pool[freshCount].id) === inHist0) {
      freshCount++;
    }
    var candidates = pool.slice(0, freshCount || pool.length);
    return candidates[randInt(candidates.length)];
  }

  /* ── Schritt 4: {color}-Platzhalter auflösen ───────────────── */

  /**
   * resolveColors(exercises) → Exercise[]
   * Erstellt flache Kopien; ersetzt {color} mit einzigartiger
   * Farbe je Runde. Originale bleiben unverändert.
   */
  function resolveColors(exercises) {
    var remaining = shuffle(RC.COLOR_POOL.slice());
    return exercises.map(function (ex) {
      if (!ex.dynamicColor) return ex;
      var col = remaining.length
        ? remaining.shift()
        : RC.COLOR_POOL[randInt(RC.COLOR_POOL.length)];
      var copy = Object.assign({}, ex);
      copy.text  = copy.text.replace('{color}', col);
      copy.color = col;
      return copy;
    });
  }

  /* ── Haupt-Funktion ─────────────────────────────────────────── */

  /**
   * buildRoute(checkin, options) → { exercises: Exercise[], count: number }
   *
   * checkin   = { energy: 0-100, stress: 0-100, mood: 0-100 }
   * options   = {
   *   routeMinutes?: number,     // Routendauer (optional, sonst Energie-Schätzung)
   *   history?:      string[],   // bereits gespielte IDs (überschreibt localStorage)
   *   allowSpecial?: boolean,    // Spezialübung erlauben (default: true)
   * }
   */
  function buildRoute(checkin, options) {
    options = options || {};

    /* 1) Normalisieren: 0-100 → 0-1 */
    var E = clamp01(checkin.energy / 100);
    var S = clamp01(checkin.stress  / 100);
    var M = clamp01(checkin.mood    / 100);

    /* 2) Anzahl Übungen */
    var n;
    if (options.routeMinutes) {
      n = Math.round(options.routeMinutes / RC.MIN_PER_EX);
    } else {
      n = Math.round(RC.EX_MIN + E * (RC.EX_MAX - RC.EX_MIN));
    }
    n = Math.max(RC.EX_MIN, Math.min(RC.EX_MAX, n));

    /* Spezialübung: ersetzt die gesamte Runde gelegentlich */
    if (options.allowSpecial !== false &&
        E >= RC.SPECIAL_MIN_ENERGY &&
        n >= RC.SPECIAL_MIN_N &&
        Math.random() < RC.SPECIAL_CHANCE) {
      var special = WW_EXERCISES.filter(function (e) { return e.world === 'special'; })[0];
      if (special) {
        if (typeof console !== 'undefined') {
          console.log('[WW Route] Spezialübung ausgelöst!');
        }
        return { exercises: [special], count: 1, isSpecial: true };
      }
    }

    /* 3) Welt-Gewichte (un-normalisiert) */
    var weights = {
      '1': RC.BASE1 + RC.K1_STRESS  * S,
      '2': RC.BASE2 + RC.K2_STRESS  * S   + RC.K2_LOWENERGY * (1 - E),
      '3': RC.BASE3 + RC.K3_RELAX   * (1 - S),
      '4': RC.BASE4 + RC.K4_LOWMOOD * (1 - M),
      '5': RC.BASE5 + RC.K5_ENERGY  * E * (0.5 + 0.5 * (1 - M)),
    };

    /* 4) Gewichte → Anzahl je Welt */
    var counts = weightsToCounts(weights, n);

    /* 5) Welt-Slots als emotionaler Bogen */
    var worldSeq = sequenceWorlds(counts, n, E, S);

    /* 6) Konkrete Übungen wählen */
    var historyArr = options.history !== undefined ? options.history : loadHistory();
    var historySet = new Set(historyArr);
    var used       = new Set();
    var result     = [];

    /* Start/End-Slot-Anzahl für calm/uplift-Gate */
    var openC  = n >= 7 ? 2 : 1;
    var closeC = n >= 7 ? 2 : 1;
    if (openC + closeC >= worldSeq.length) { openC = 1; closeC = 1; }
    if (openC + closeC >= worldSeq.length) { openC = 0; closeC = 1; }

    var highEffortPrev = false;
    for (var i = 0; i < worldSeq.length; i++) {
      var world   = worldSeq[i];
      var isOpen  = RC.OPEN_CALM   && i < openC;
      var isClose = RC.CLOSE_UPLIFT && i >= worldSeq.length - closeC;
      var needCalm = isOpen || isClose;

      var ex = pickExercise(world, {
        used: used, historySet: historySet,
        needCalm: needCalm, E: E, highEffortPrev: highEffortPrev,
      });

      /* Fallback 1: calm-Anforderung lockern */
      if (!ex && needCalm) {
        ex = pickExercise(world, {
          used: used, historySet: historySet,
          needCalm: false, E: E, highEffortPrev: highEffortPrev,
        });
      }
      /* Fallback 2: beliebige andere Welt */
      if (!ex) {
        for (var w = 1; w <= 5 && !ex; w++) {
          ex = pickExercise(w, {
            used: used, historySet: historySet,
            needCalm: false, E: E, highEffortPrev: false,
          });
        }
      }

      if (ex) {
        used.add(ex.id);
        highEffortPrev = effortOf(ex) >= RC.EFFORT_HIGH;
        result.push(ex);
      }
    }

    /* 7) {color}-Platzhalter auflösen */
    result = resolveColors(result);

    /* History persistieren */
    saveHistory(historyArr.concat(result.map(function (e) { return e.id; })));

    /* Debug-Ausgabe (immer, lässt sich in den DevTools prüfen) */
    if (typeof console !== 'undefined') {
      var ist = {};
      result.forEach(function (e) {
        if (e.world !== 'special') ist['W' + e.world] = (ist['W' + e.world] || 0) + 1;
      });
      console.log('[WW Route] E=' + E.toFixed(2) + ' S=' + S.toFixed(2) + ' M=' + M.toFixed(2) +
        ' n=' + n + ' | Gewichte: ' +
        Object.keys(weights).map(function (w) {
          return 'W' + w + ':' + weights[w].toFixed(2);
        }).join(', '));
      if (console.table) {
        console.table(Object.keys(counts).filter(function (w) { return counts[w] > 0; }).map(function (w) {
          return { Welt: 'W' + w, Soll: counts[w], Ist: ist['W' + w] || 0 };
        }));
      }
      console.log('[WW Route] Reihenfolge: ' +
        result.map(function (e) { return 'W' + e.world + ':' + e.id + '(' + e.type + ')'; }).join(' → '));
    }

    return { exercises: result, count: result.length };
  }

  /* ── Selbsttest für 4 Personas ──────────────────────────────── */

  /**
   * WW.routeSelfTest() in der Konsole aufrufen.
   * Prüft, ob die Welt-Verteilung für typische Zustände plausibel ist:
   *   Gestresst + miese Laune + wenig Energie → viel W2 + W1 + etwas W4, kaum W5
   *   Top drauf                               → ausgewogen, mehr W5
   *   Antriebslos aber wach                   → W4 + W5 dominieren
   *   Alles neutral                           → ausgewogen, leichter W2-Anteil
   */
  function selfTest() {
    var personas = [
      { l: 'Gestresst + miese Laune + wenig Energie', c: { energy: 20, stress: 85, mood: 25 } },
      { l: 'Top drauf',                               c: { energy: 85, stress: 20, mood: 80 } },
      { l: 'Antriebslos aber wach (schlechte Laune)', c: { energy: 85, stress: 30, mood: 20 } },
      { l: 'Alles neutral',                           c: { energy: 50, stress: 50, mood: 50 } },
    ];
    var sep = '─'.repeat(60);
    console.log('\n[WW Selbsttest] ' + sep);
    personas.forEach(function (p) {
      var plan = buildRoute(p.c, { allowSpecial: false, history: [] });
      var dist = {};
      plan.exercises.forEach(function (e) {
        dist['W' + e.world] = (dist['W' + e.world] || 0) + 1;
      });
      console.log('\n  Persona: ' + p.l);
      console.log('  Verteilung (n=' + plan.count + '):', dist);
      console.log('  Reihenfolge:',
        plan.exercises.map(function (e) { return 'W' + e.world + ':' + e.id; }).join(' → '));
    });
    console.log('\n[WW Selbsttest] ' + sep);
  }

  /* ── Export über WW-Namespace ───────────────────────────────── */
  var WW = global.WW = global.WW || {};
  WW.buildRoute    = buildRoute;
  WW.routeSelfTest = selfTest;

}(typeof window !== 'undefined' ? window : this));
