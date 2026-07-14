# Projekt-Manager + CAD/BIM-Schnittstelle

`SEMBLA_Projekt_Manager.html` — eigenständige HTML-Datei, öffnet per Doppelklick. Führt mehrere Wandelemente zu einem Projekt zusammen und exportiert nach DXF/IFC.

## Funktionen

- **Wände sammeln** — Wandelemente (JSON aus Modul 1) laden oder direkt **aus einer Länge erzeugen** (nutzt den getesteten Core, i3-maximiert).
- **2D-Grundriss** — jede Wand mit Position (x, y) und Drehung platzieren; Footprints werden maßstäblich im Grundriss gezeichnet, Öffnungen markiert.
- **Sammel-Stückliste** — Steine, Stangen, Muttern, Platten über alle Wände summiert.
- **Projekt speichern/laden** — komplettes Projekt als JSON (mit eingebetteten Wandelementen + Positionen).
- **DXF-Export** — Grundriss (platzierte Footprints, Öffnungen, Beschriftung) und Ansichten (Elevationen je Wand: Steine i2/i3, Öffnungen, Vorspannung — auf eigenen Layern).
- **DXF-Grundriss-Import** — LINE/LWPOLYLINE einlesen; aus jeder Linie wird eine Wand (Länge auf 12,5 cm gerundet, Position/Drehung aus der Linie, Höhe = Standardhöhe).
- **IFC-Export (IFC4)** — je Wand ein `IfcWallStandardCase` (12,5 cm, Länge×Höhe extrudiert) mit ausgeschnittenen Öffnungen; optional **jeder i2/i3-Stein** als `IfcBuildingElementProxy`. In Projektstruktur (Site/Building/Storey) platziert.

> **Hinweis:** DXF/IFC werden hier auf Struktur, Referenzintegrität und Roundtrip getestet. Die finale **IFC-Gültigkeit bitte in einem BIM-Viewer** (z. B. BIMcollab Zoom, Solibri, BlenderBIM) gegenprüfen.

## Architektur
Die Logik liegt in geteilten, getesteten Modulen; `build-manager.mjs` fügt sie in die Oberfläche ein (keine Code-Duplizierung):
- `sembla-core.mjs` — Wandaufbau (für „Wand aus Länge" / DXF-Import).
- `sembla-cad.mjs` — DXF/IFC-Export + DXF-Import + Stücklisten-Summe.

## Tests
```
node test-cad.mjs       # 8 Checks: DXF-Roundtrip, IFC-Referenzintegrität, Stücklisten-Summe
node build-manager.mjs  # baut SEMBLA_Projekt_Manager.html (Core+CAD inline)
node smoke_pm.mjs       # 11 Checks: Liste, Grundriss, BOM, DXF, IFC im fertigen Tool
```

## Dateien
- `SEMBLA_Projekt_Manager.html` — **das Tool**, per Doppelklick öffnen
- `sembla-cad.mjs`, `sembla-core.mjs` — geteilte Logik · `test-cad.mjs`, `smoke_pm.mjs` — Tests
- `manager.template.html` + `build-manager.mjs` — Vorlage und Build

## Workflow
Modul 1 → Wandelemente exportieren → im Projekt-Manager sammeln, im Grundriss platzieren → Sammel-Stückliste, DXF/IFC exportieren. Oder: DXF-Grundriss importieren → Wände werden erzeugt.
