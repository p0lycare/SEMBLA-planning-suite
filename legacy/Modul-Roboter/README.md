# Roboter-Export — Montagesequenz (erste Version)

`SEMBLA_Roboter_Export.html` — eigenständige HTML-Datei, öffnet per Doppelklick. Erzeugt aus einem Wandelement (Modul 1) eine **maschinenlesbare Aufbaureihenfolge** für den robotischen Aufbau.

## Was es erzeugt

Eine geordnete Operationsliste (bottom-up):
`PLACE_PLATE_BOTTOM` → `INSERT_ROD` → je Lage `PLACE_STONE` (von links) → `COUPLE_NUT` an den Kopplungshöhen (alle 110 cm) → `PLACE_PLATE_TOP` → `TENSION`.

Jeder `PLACE_STONE` trägt Bauteiltyp (i2/i3), Lage, Index und **Zielpose** `{x, y, z, rz}`. Koordinaten: Ursprung Wand unten-links-vorne, x = Länge, y = Wandstärke, z = Höhe, Einheiten mm, Pose-Referenz = Stein-Ecke unten-links.

## Formate (herstellerneutral)
- **JSON** — vollständige Sequenz mit Frame-Definition, Konfiguration (Anfahrhöhe, Steintypen) und Summary. Als saubere Vorlage für einen **Postprozessor** zu ABB (RAPID), KUKA (KRL) o. Ä.
- **CSV** — eine Zeile je Operation (`seq;op;part;lage;idx;x;y;z;rz;length;note`) für einfache Steuerungen/Tabellen.

## Vorschau
Bau-Reihenfolge zum Durchscrubben: Slider/Schaltflächen zeigen die Wand Stein für Stein in Setzreihenfolge (gesetzt / aktuell / noch offen).

## Verifikation
`test-robot.mjs` (9 Checks): Steinanzahl, Platten/Kopplungen, bottom-up-Reihenfolge, Platten vor erstem Stein, lückenlose Sequenz, CSV/JSON. `smoke_robot.mjs` (8 Checks): UI, Vorschau-Scrubbing, Export.

> Erste Version: Fokus auf die Setz-/Vorspann-Sequenz und Posen. Anfahr-/Rückzugsbewegungen, Greifer-Orientierung und Greiferwechsel sind als Postprozessor-Schritt vorgesehen (Anfahrhöhe ist als Konfig enthalten).

## Dateien
- `SEMBLA_Roboter_Export.html` — das Tool
- `sembla-robot.mjs` — Sequenz-Bibliothek · `test-robot.mjs` / `smoke_robot.mjs` — Tests
- `robot.template.html` + `build-robot.mjs` — Vorlage und Build
