/* ============================================================
   Walking with Wieland — Übungskatalog (Daten)
   Quelle: Konzept-PDF, Abschnitt 4 & 9.
   Wird als globales Objekt bereitgestellt (kein Modul -> läuft
   auch lokal via file:// ohne Server).
   Übungstypen:
     simple     – Anweisung + "Geschafft"
     breath     – Atem-Kreis pulsiert (inhale/exhale Sekunden)
     timer      – Zeit-Übung; guess:true = blind schätzen + auflösen
     counter    – Tipp-Zähler (target = Ziel oder null = offen)
     photo      – Foto(s) über die Kamera (target = Anzahl)
     guesscount – erst schätzen, dann zählen
     tour       – mehrstufige Sammelkette (Spezialübung 5-4-3-2-1)
============================================================ */

const WW_WORLDS = {
  1: { name: 'Wielands Spürnase',     short: 'Spürnase',     trophy: 'blatt'  },
  2: { name: 'Wielands Ruhe',         short: 'Ruhe',         trophy: 'welle'  },
  3: { name: 'Wielands Zeitgefühl',   short: 'Zeitgefühl',   trophy: 'mond'   },
  4: { name: 'Wielands Schatzkiste',  short: 'Schatzkiste',  trophy: 'herz'   },
  5: { name: 'Wielands Entdeckerblick', short: 'Entdeckerblick', trophy: 'kompass' },
  special: { name: 'Große Entdeckungstour', short: 'Entdeckungstour', trophy: 'stern' }
};

const WW_COLORS_DE = ['Grün', 'Rot', 'Blau', 'Gelb', 'Weiß', 'Braun', 'Orange'];

const WW_EXERCISES = [
  /* ---------- Welt 1 · Spürnase ---------- */
  { id: '1.1', world: 1, header: 'WIELAND – FARBJAGD',        text: 'Finde 3 Dinge in der Farbe {color}.', type: 'counter', target: 3, dynamicColor: true },
  { id: '1.2', world: 1, header: 'WIELAND SPITZT DIE OHREN',  text: 'Bleib kurz stehen. Tippe für jedes Geräusch, das du hörst.', type: 'counter', target: null, calm: true },
  { id: '1.3', world: 1, header: 'WIELAND LAUSCHT IN DIE FERNE', text: 'Finde das am weitesten entfernte Geräusch und lausche ihm 20 Sekunden.', type: 'timer', seconds: 20, calm: true },
  { id: '1.4', world: 1, header: 'WIELAND SCHNUPPERT',        text: 'Atme einmal tief durch die Nase. Welche 2 Gerüche nimmst du wahr?', type: 'simple', calm: true },
  { id: '1.5', world: 1, header: 'WIELAND ERTASTET DIE WELT', text: 'Berühre etwas Raues, etwas Glattes und etwas Lebendiges – z. B. ein Blatt.', type: 'counter', target: 3 },
  { id: '1.6', world: 1, header: 'WIELAND ORTET EIN GERÄUSCH', text: 'Hörst du einen Vogel? Zeig in die Richtung, aus der er ruft.', type: 'simple' },
  { id: '1.7', world: 1, header: 'WIELAND SUCHT DAS LICHT',   text: 'Finde den hellsten und den dunkelsten Punkt in deinem Blickfeld.', type: 'simple' },
  { id: '1.8', world: 1, header: 'WIELAND HÖRT GENAU HIN',    text: 'Welches Geräusch gerade ist das angenehmste? Lausch ihm einen Moment.', type: 'simple', calm: true },
  { id: '1.9', world: 1, header: 'WIELAND SPÜRT DIE LUFT',    text: 'Such dir einen Sonnen- und einen Schattenfleck. Spürst du den Unterschied auf der Haut?', type: 'simple' },
  { id: '1.10', world: 1, header: 'WIELAND STECKT DIE NASE RAN', text: 'Finde etwas, an dem du riechen kannst – ein Blatt, Rinde, Erde – und schnupper kurz.', type: 'simple', calm: true },
  { id: '1.11', world: 1, header: 'WIELAND ZÄHLT DIE KLÄNGE', text: 'Wie viele verschiedene Geräusche kannst du gleichzeitig hören?', type: 'counter', target: null, calm: true },

  /* ---------- Welt 2 · Ruhe (alle beruhigend) ---------- */
  { id: '2.1', world: 2, header: 'WIELAND ATMET MIT DIR',     text: 'Atme 4 Schritte lang ein, 4 Schritte lang aus.', type: 'breath', inhale: 4, exhale: 4, calm: true },
  { id: '2.2', world: 2, header: "WIELAND MAG'S GEMÜTLICH",   text: 'Geh die nächsten 20 Schritte so langsam wie möglich.', type: 'simple', calm: true },
  { id: '2.3', world: 2, header: 'WIELAND SPÜRT DEN BODEN',   text: 'Spür bei 10 Schritten, wie dein Fuß abrollt: Ferse – Sohle – Zehen.', type: 'simple', calm: true },
  { id: '2.4', world: 2, header: 'WIELAND MACHT SICH LOCKER', text: 'Lass beim nächsten Ausatmen die Schultern sinken. Spürst du den Unterschied?', type: 'simple', calm: true },
  { id: '2.5', world: 2, header: 'WIELAND ATMET AUF',         text: 'Atme tief ein – und lass beim Ausatmen ein hörbares „Hhhh" raus.', type: 'simple', calm: true },
  { id: '2.6', world: 2, header: 'WIELAND LÄSST LOS',         text: 'Atme 3 Schritte ein und 5 Schritte aus. Spür, wie die Schultern weicher werden.', type: 'breath', inhale: 3, exhale: 5, calm: true },
  { id: '2.7', world: 2, header: 'WIELAND ENTSPANNT SEIN GESICHT', text: 'Lass den Kiefer locker und die Stirn glatt werden. Wo hältst du sonst noch fest?', type: 'simple', calm: true },
  { id: '2.8', world: 2, header: 'WIELAND TROTTET ENTSPANNT', text: 'Finde einen Schritt-Rhythmus, der sich völlig mühelos anfühlt – und bleib eine Weile dabei.', type: 'simple', calm: true },
  { id: '2.9', world: 2, header: 'WIELAND SCHAUT SANFT',      text: 'Lass den Blick weich werden und fokussiere nichts Bestimmtes. Nimm einfach das ganze Bild wahr.', type: 'simple', calm: true },
  { id: '2.10', world: 2, header: 'WIELAND HÄLT KURZ INNE',   text: 'Bleib stehen. Drei langsame Atemzüge – dann geh weiter.', type: 'breath', inhale: 4, exhale: 4, cycles: 3, calm: true },

  /* ---------- Welt 3 · Zeitgefühl ---------- */
  { id: '3.1', world: 3, header: 'WIELAND – SPAZIERGANG 5-MIN-ÜBUNG', text: 'Bleib stehen und schätze, wann 5 Minuten vergangen sind.', type: 'timer', seconds: 300, guess: true, doneLabel: '5 Min sind vorbei' },
  { id: '3.2', world: 3, header: 'WIELAND WETTET MIT',        text: 'Wie viele Schritte bis zur nächsten Ecke? Schätze – dann zähle.', type: 'guesscount' },
  { id: '3.3', world: 3, header: 'WIELAND FÜHRT BLIND',       text: 'Geh bis zum nächsten Baum, ohne aufs Handy zu schauen.', type: 'simple' },
  { id: '3.4', world: 3, header: 'WIELAND WIRD GANZ STILL',   text: 'Bleib kurz stehen. Kannst du deinen Herzschlag oder Puls irgendwo spüren?', type: 'simple', calm: true },
  { id: '3.5', world: 3, header: 'WIELAND ZÄHLT IM KOPF',     text: 'Schätze, wann genau eine Minute um ist – ohne zu zählen. Dann tippen.', type: 'timer', seconds: 60, guess: true, doneLabel: '1 Min ist vorbei' },
  { id: '3.6', world: 3, header: 'WIELAND GENIESST DEN WEG',  text: 'Geh bis zur nächsten Ecke, ohne ans Ankommen zu denken. Nur gehen.', type: 'simple', calm: true },
  { id: '3.7', world: 3, header: 'WIELAND BEOBACHTET DEN ATEM', text: 'Wie oft atmest du in den nächsten 10 Schritten? Einfach zählen, nichts ändern.', type: 'counter', target: null, calm: true },
  { id: '3.8', world: 3, header: 'WIELAND FÜHLT NACH',        text: 'Wo im Körper spürst du gerade am meisten? Warm, kribbelig, schwer, leicht?', type: 'simple', calm: true },
  { id: '3.9', world: 3, header: 'WIELAND HÖRT AUF SICH',     text: 'Spür kurz in dich hinein: Durst, Wärme, eine Pause? Was würde dir jetzt guttun?', type: 'simple', calm: true },

  /* ---------- Welt 4 · Schatzkiste (alle stimmungshebend/sanft) ---------- */
  { id: '4.1', world: 4, header: 'WIELAND SAMMELT SCHÄTZE',   text: 'Finde gerade jetzt einen Moment, der schön ist – und merk ihn dir.', type: 'simple', calm: true },
  { id: '4.2', world: 4, header: 'WIELAND DENKT AN FREUNDE',  text: 'Schick einem Menschen in Gedanken einen guten Wunsch.', type: 'simple', calm: true },
  { id: '4.3', world: 4, header: 'WIELAND LEGT ETWAS AB',     text: 'Stell dir vor, Wieland legt eine Sorge unter einen Stein. Was lässt du heute los?', type: 'simple', calm: true },
  { id: '4.4', world: 4, header: 'WIELAND FREUT SICH AUF ETWAS', text: 'Denk an eine kleine Sache, auf die du dich heute noch freust.', type: 'simple', calm: true },
  { id: '4.5', world: 4, header: 'WIELAND SAMMELT GUTES',     text: 'Nenne im Kopf 3 Dinge, die heute schon gut waren – auch ganz kleine.', type: 'counter', target: 3, calm: true },
  { id: '4.6', world: 4, header: 'WIELAND GRÜSST IM STILLEN', text: 'Wünsch der nächsten Person, die dir begegnet, in Gedanken einen schönen Tag.', type: 'simple', calm: true },
  { id: '4.7', world: 4, header: 'WIELAND DANKT SEINEM KÖRPER', text: 'Sag deinem Körper kurz danke, dass er dich heute trägt.', type: 'simple', calm: true },
  { id: '4.8', world: 4, header: 'WIELAND DENKT AN JEMANDEN', text: 'Denk an einen Menschen, der dir guttut. Lächle innerlich kurz bei dem Gedanken.', type: 'simple', calm: true },
  { id: '4.9', world: 4, header: 'WIELAND MAG JEDES WETTER',  text: 'Finde eine Sache am heutigen Wetter, die du magst – Sonne, Wind, Regengeruch.', type: 'simple', calm: true },
  { id: '4.10', world: 4, header: 'WIELAND FREUT SICH MIT',   text: 'Sag Wieland innerlich, dass es schön war, mit ihm unterwegs zu sein.', type: 'simple', calm: true },

  /* ---------- Welt 5 · Entdeckerblick ---------- */
  { id: '5.1', world: 5, header: 'WIELAND ENTDECKT NEUES',    text: 'Finde 5 Dinge auf dieser Strecke, die dir noch nie aufgefallen sind.', type: 'photo', target: 5 },
  { id: '5.2', world: 5, header: 'WIELAND – FOTO-ÜBUNG',      text: 'Bleib stehen und mach Fotos von 5 verschiedenen Pflanzen.', type: 'photo', target: 5 },
  { id: '5.3', world: 5, header: 'WIELAND SUCHT FORMEN',      text: 'Finde etwas Rundes, etwas Eckiges und etwas Geschwungenes.', type: 'counter', target: 3 },
  { id: '5.4', world: 5, header: 'SIEH DIE WELT WIE WIELAND', text: 'Geh kurz in die Hocke: Wie sieht die Welt aus Wielands Höhe aus?', type: 'simple' },
  { id: '5.5', world: 5, header: 'WIELAND WECHSELT DIE SEITE', text: 'Geh heute mal auf der anderen Straßenseite. Was sieht von hier anders aus?', type: 'simple' },
  { id: '5.6', world: 5, header: 'WIELAND SCHAUT GANZ GENAU', text: 'Such auf einer handtellergroßen Fläche das kleinste interessante Detail.', type: 'simple' },
  { id: '5.7', world: 5, header: 'WIELAND WÄHLT EINE FARBE',  text: 'Wieland nennt dir eine Farbe: {color}. Sammle sie die ganze Runde über mit den Augen.', type: 'simple', dynamicColor: true },
  { id: '5.8', world: 5, header: 'WIELAND SUCHT VERÄNDERUNGEN', text: 'Was hat sich seit dem letzten Mal verändert? Eine Baustelle, ein blühender Baum?', type: 'simple' },
  { id: '5.9', world: 5, header: 'WIELAND ERKUNDET ETWAS',    text: 'Bieg einmal dort ab, wo du sonst geradeaus gehst. Nur ein kleines Stück.', type: 'simple' },
  { id: '5.10', world: 5, header: 'WIELAND SCHAUT HINAUF',    text: 'Schau nach oben: Dächer, Baumwipfel, Himmel. Was entdeckst du dort?', type: 'simple' },
  { id: '5.11', world: 5, header: 'WIELAND MARKIERT EINEN ORT', text: 'Merk dir den schönsten Punkt der heutigen Runde für Wielands Karte.', type: 'simple' },

  /* ---------- Spezialübung ---------- */
  { id: 'special', world: 'special', header: 'WIELAND – GROSSE ENTDECKUNGSTOUR',
    text: 'Sammle für Wieland: 5 Dinge zum Sehen · 4 Geräusche · 3 Dinge zum Anfassen · 2 Gerüche · 1 schönen Moment.',
    type: 'tour',
    stages: [
      { label: '5 Dinge zum Sehen',   target: 5 },
      { label: '4 Geräusche',         target: 4 },
      { label: '3 Dinge zum Anfassen', target: 3 },
      { label: '2 Gerüche',           target: 2 },
      { label: '1 schöner Moment',    target: 1 }
    ]
  }
];
