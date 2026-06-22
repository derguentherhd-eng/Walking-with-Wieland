# Walking with Wieland

Eine mobile Web-App, die zum Spazierengehen einlädt. Achtsamkeitsübungen sind
der „versteckte Wirkstoff" – verpackt als kleines Spiel mit **Wieland**, einem
schüchternen Wiesel. Du startest einen Spaziergang, machst einen kurzen
Check-In, und über die Strecke verteilt tauchen kleine Übungen auf. Für jede
abgeschlossene Übung sammelt Wieland einen Schatz.

Die App ist bewusst **nur aus HTML, CSS und JavaScript** gebaut (plus etwas
JSON für das PWA-Manifest) und für das **Handy** ausgelegt.

---

## Schnellstart

1. Den Ordner `walking-with-wieland/` auf einen Webserver mit **HTTPS** legen
   (siehe Hinweis unten – GPS funktioniert nur über HTTPS).
2. `index.html` im Handy-Browser öffnen.
3. Optional die App über „Zum Home-Bildschirm" installieren (siehe PWA).

> **Nur ausprobieren?** Du kannst die Dateien auch lokal per Doppelklick
> (`file://`) öffnen. Dann laufen die Übungen und die Sammlung, aber **GPS,
> angeleitete Strecken und die Offline-Funktion sind deaktiviert**. Nutze dafür
> den **Testmodus** (siehe unten).

---

## Angeleitete Strecken (optional)

Im Check-In lässt sich „Strecke generieren?" einschalten. Dann wird ein
Rundweg ab deinem Zuhause erzeugt – die Länge richtet sich nach deiner
angegebenen Energie (ca. 15 Minuten bis gut 1,5 Stunden).

Dafür sind zwei Dinge in den **Einstellungen** nötig:

1. **Heimat-Standort** – per GPS holen oder manuell eingeben.
2. **OpenRouteService-Schlüssel** – ein kostenloser API-Schlüssel von
   <https://openrouteservice.org> (Konto anlegen → Token erstellen → in die
   Einstellungen einfügen).

Ohne Standort oder Schlüssel funktionieren **freie Spaziergänge ganz normal** –
die App weist dann nur darauf hin und läuft ohne Karte weiter.

---

## Testmodus

Unter **Einstellungen → Testmodus** kannst du das Auslösen der Übungen vom
Laufen entkoppeln: Die Übungen erscheinen dann etwa **alle 20 Sekunden**, ohne
dass du dich wirklich bewegen musst. Ideal zum Anschauen und Ausprobieren am
Schreibtisch. Im normalen Betrieb werden die Übungen über die zurückgelegte
Strecke verteilt und über die Bewegung (GPS) ausgelöst.

---

## Als App installieren (PWA)

- **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm".
- **Android (Chrome):** Menü → „App installieren" bzw. „Zum Startbildschirm".

Danach startet „Wieland" wie eine eigenständige App im Vollbild. Ein einfacher
Service Worker (`sw.js`) cacht die App-Dateien, sodass die Oberfläche auch
offline lädt (Karten-Kacheln brauchen weiterhin Internet).

---

## Fortschritt

Spaziergänge, gesammelte Schätze und Erfolge werden **lokal im Browser**
gespeichert (`localStorage`). Sie bleiben auf dem Gerät und lassen sich in den
Einstellungen jederzeit zurücksetzen. Es werden keine Daten an einen Server
gesendet.

---

## Projektstruktur

```
walking-with-wieland/
├── index.html          Startseite (Wieland + Wochenfortschritt)
├── checkin.html        Mini Check-In vor dem Spaziergang
├── walk.html           Der Spaziergang inkl. Übungen & Karte
├── stats.html          Statistik (Wochenraster)
├── collection.html     Wielands Höhle (Schätze & Erfolge)
├── settings.html       Einstellungen
├── manifest.json       PWA-Manifest
├── sw.js               Service Worker (App-Shell-Cache)
├── css/
│   └── style.css       gesamtes Design (feste 6-Farb-Palette)
├── js/
│   ├── exercises.js    Übungs- und Welten-Daten
│   ├── trophies.js     Schätze als SVG (eine Trophäe pro Welt)
│   ├── app.js          Kernlogik, Speicher, Übungs-Auswahl, Helfer
│   ├── home.js         Startseite
│   ├── checkin.js      Check-In
│   ├── walk.js         Spaziergang-Ablauf & Übungs-Darstellung
│   ├── stats.js        Statistik
│   ├── collection.js   Höhle/Sammlung
│   └── settings.js     Einstellungen
└── assets/
    ├── wieland.png         Wiesel-Maskottchen
    ├── hintergrund.jpg     Hintergrundbild
    └── icon-180/192/512.png  App-Icons
```

---

## Gestalterische Entscheidungen (kurz erklärt)

Diese Punkte weichen bewusst leicht vom Konzept/Mockup ab – jeweils mit Grund,
und alle leicht anpassbar:

1. **Schriftart:** Es wird die System-Schrift verwendet
   (`system-ui` → auf dem iPhone ist das San Francisco). Das lädt sofort und
   ohne externe Datei. Möchtest du die Mockup-Schrift, lässt sie sich über die
   eine CSS-Variable `--font` in `css/style.css` zentral tauschen.
2. **Vorlese-Knopf statt Mikrofon:** Der gelbe „Mic"-Knopf aus dem Mockup ist
   als **Vorlese-Funktion** (Text-to-Speech) umgesetzt – er liest die Übung
   vor. Das passt besser zum „Handy weglegen"-Gedanken als eine Aufnahme.
   Farblich in Blau aus der Palette (kein neues Gelb).
3. **Notruf-Knopf:** Nicht rot (rot ist nicht Teil der Palette), sondern
   schlicht gehalten; er wählt `112`.
4. **Wielands Bau** auf der Startseite ist als dezente Form aus der Palette
   gezeichnet (SVG), da dafür kein eigenes Bild-Asset vorlag.
5. **Eine Wiesel-Pose:** Wieland nutzt vorerst nur das eine vorhandene Bild
   (wie gewünscht) – verschiedene Posen/Gadgets können später ergänzt werden.

---

## Hinweise zum Feinschliff

- **GPS & Strecke** lassen sich nur auf einem echten Gerät im Freien sinnvoll
  testen. Die Auslöse-Distanz der Übungen und das Schritt-für-Schritt der
  Navigation sind sinnvoll vorbelegt, aber dort am besten final zu justieren.
- **Farben & Schrift** sind als CSS-Variablen am Anfang von `css/style.css`
  gebündelt und zentral änderbar.
