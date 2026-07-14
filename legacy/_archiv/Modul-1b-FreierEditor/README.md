# Freier Wand-Editor — Prototyp (rastergebunden)

Erkundung eines **freien** Wandaufbaus (Steine per Maus setzen/löschen, Durchbrüche) als Alternative zur rein parametrischen Erzeugung — **rastergebunden**, damit das Kammerraster und damit das gesamte System gültig bleiben.

## Was er kann
- **Raster setzen** aus Länge/Höhe (12,5 × 20 cm Zellen).
- **„aus Parametrik füllen"** — startet mit dem i3-maximierten Verband (nutzt den getesteten Core) und lässt ihn frei nachbearbeiten (Best-of-both).
- **Werkzeuge:** Stein i3 / i2 setzen (Klick = linke Kante an die Zelle), **Durchbruch** (Stein entfernen → leere Zellen).
- **Live-Versatzprüfung:** gemeinsame Fugen benachbarter Lagen werden rot markiert; Badge „Versatz ok / Konflikt".
- **Vorspannstränge** werden auf durchgehend gefüllten Kammerspalten angezeigt.
- **Export = Wandelement** (`authoring:"frei"`): faithful `courses[].stones`, Öffnungen aus zusammenhängenden leeren Zellgruppen (Bounding-Box), Stränge, Seiten, Stückliste, Validierung. Lädt sich auch wieder.

## Prinzip (so fügt es sich ein)
Der freie Editor ist eine **zweite Autoren-Sicht auf dasselbe Wandelement** — kein neues Datenmodell, keine zweite Pipeline. Die Aufbauregeln wirken hier als **Validatoren** (statt Generator). Weil rastergebunden, bleiben Vorspannung und alle Folgemodule (Verbinder, Latten, Montage, Roboter, BIM) gültig.

## Grenzen (Prototyp)
- Interaktion ist Klick-zum-Setzen (noch kein Drag-Verschieben).
- Nicht-rechteckige Durchbrüche werden beim Export als **Bounding-Box-Öffnungen** angenähert — die saubere Lösung (Öffnungen als Zellmaske, generalisiert in Verbinder/Latten) ist der nächste Schritt.
- Statik für wirklich unregelmäßige Wände ist ein eigenes, größeres Thema.

## Verifikation
`node build-freieditor.mjs` (baut + Syntaxprüfung), `node smoke_fe.mjs` (12 Checks: Parametrik-Füllung, manuelles Setzen, Überlappungsschutz, Durchbruch, Versatz-Konflikterkennung, Export inkl. Öffnungen/Stränge/authoring).

## Dateien
- `SEMBLA_FreierEditor.html` — der Prototyp · `freieditor.template.html` + `build-freieditor.mjs` — Vorlage/Build · `smoke_fe.mjs` — Test.
