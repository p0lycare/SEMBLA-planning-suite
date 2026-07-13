# SEMBLA – pyRevit-Extension (Live-Plugin für Revit)

Erzeugt aus einem **Wandelement (JSON)** der SEMBLA-Suite (Wand-Editor bzw. Auslegungs-Engine, „geprüft") die Wand direkt in Revit als Volumengeometrie.

## Was der Button macht
- Dialog „Wandelement (JSON) wählen".
- Baut je i2/i3-Stein einen Quader (DirectShape, Kategorie *Allgemeines Modell*) an seiner Position; die Vorspannstränge als schlanke Profile.
- Schreibt Metadaten (Name, Maße, **Seiten-Funktionen**, **Nachweis-Status/Auslastung**, Vorspann-Auslegung) in den **Kommentar** der Wand.
- Einheiten: das Wandelement ist in mm, Revit intern in Fuß — die Umrechnung passiert automatisch.

## Installation
1. **pyRevit** installieren (https://pyrevitlabs.io) — kostenlos.
2. Den Ordner `SEMBLA.extension` an einen festen Ort kopieren (z. B. `…/pyRevit/Extensions/`).
3. In Revit: pyRevit → *Settings* → *Custom Extension Directories* → den **übergeordneten** Ordner von `SEMBLA.extension` hinzufügen → *Save & Reload*.
   (Alternativ direkt in das pyRevit-Extensions-Verzeichnis legen und neu laden.)
4. Im Ribbon erscheint der Reiter **SEMBLA** mit dem Panel und dem Button **„Wandelement laden"**.

## Nutzung
SEMBLA-Suite → Wand planen / auslegen → **Wandelement (JSON) exportieren** → in Revit Button **„Wandelement laden"** → JSON wählen → die Wand entsteht am Modellursprung (danach frei verschiebbar/gruppierbar).

## Hinweise / Grenzen
- **Kompatibilität:** IronPython-2.7- und CPython3-Engine (keine f-strings/Type-Hints). Getestet wurde hier nur die **Python-Syntax** — die Ausführung gegen die Revit-API bitte in eurer Revit-Version prüfen (API-Signaturen wie `DirectShape.CreateElement` sind ab Revit 2016 stabil).
- **DirectShape** wurde bewusst gewählt: robust, ohne Familien-Erstellung; die Steine sind echte Volumen (Mengen/Schnitte nutzbar). Wenn ihr stattdessen native **Revit-Wände + Öffnungen** oder **Familien** wollt, ist das ein nächster Ausbauschritt.
- Material/Farbe je Steintyp ist noch nicht gesetzt (optionaler Ausbau über `DirectShape`-GraphicsStyle/Material).

## Struktur
```
SEMBLA.extension/
└─ SEMBLA.tab/
   └─ SEMBLA.panel/
      └─ WandLaden.pushbutton/
         ├─ script.py      (Logik)
         └─ icon.png       (Button-Icon)
```
