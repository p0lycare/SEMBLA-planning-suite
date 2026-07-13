# Modul 4 — Montageplanung

`SEMBLA_Montageplanung.html` — eigenständige HTML-Datei, öffnet per Doppelklick. Erzeugt aus dem in **Modul 1** geplanten Wandelement eine lagenweise Aufbauanleitung.

## Funktionen

- **Wandelement (JSON) laden** — die aus Modul 1 exportierte Datei.
- **Übersicht** — Maße, Raster/Lagen, Anzahl Vorspannstränge, Baubarkeits-Status.
- **Gesamt-Stückliste** — Steine i3/i2, Gewindestangen, Verbindungsmuttern, Stahlplatten, Spannmuttern, Verschnitt.
- **Vorspannung Schritt für Schritt** — automatisch aus dem Wandelement: untere Platten, erste Stange, lagenweiser Aufbau, Kopplungshöhen (alle 110 cm) mit Verbindungsmuttern, obere Platten, Vorspannen.
- **Lagen-Aufbau (interaktiv)** — Lage für Lage durchklicken/sliden: jede Lage als Streifen mit Steinverlegung (i3/i2 mit Position), Öffnungen und Vorspannstrang-Markern (▲), plus Wandüberblick mit hervorgehobener Lage.
- **Komplette Anleitung drucken** — erzeugt ein durchgehendes, druckbares Dokument: Übersicht, Stückliste, Vorspann-Schritte und alle Lagen von oben nach unten.

## Verifikation
`smoke_m4.mjs` (DOM-Stub, 14 Checks): Übersicht/Stückliste/Schritte gefüllt, Lagen-Visualisierung mit Strängen, Navigation, Öffnung im Lagenstreifen, Druckdokument mit allen Lagen.

## Dateien
- `SEMBLA_Montageplanung.html` — das Tool
- `smoke_m4.mjs` + `ref2.json`/`ref3.json` — Smoke-Test und Test-Wandelemente

## Workflow
Modul 1 → „Wandelement (JSON)" exportieren → in Modul 4 laden → Lagen durchgehen oder komplette Anleitung drucken.
