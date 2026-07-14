# Interop-CAD — Phase 1 (Interoperabilität härten)

Umsetzung der Roadmap-Phase 1 aus `SEMBLA_OSS_Bewertungsmatrix`: gepflegte OSS-Bibliotheken
statt handgeschriebener Exporte.

## ezdxf-Exporter (`sembla_dxf.py`) — Status: fertig, getestet
Normnaher DXF-Export (Grundriss + Ansichten) über **ezdxf** (MIT). Ersetzt den
handgeschriebenen DXF-Text aus `Projekt-Manager/sembla-cad.mjs` durch echte
DXF-Dateien (HEADER/TABLES/Handles, saubere Layer, Millimeter-Einheit), die jedes
CAD-Programm lädt.

```bash
pip install ezdxf --break-system-packages
python3 sembla_dxf.py projekt.json ausgabe.dxf            # Grundriss
python3 sembla_dxf.py projekt.json ausgabe.dxf --ansichten # Ansichten (Elevation)
python3 test_sembla_dxf.py                                # Round-Trip-Test (17 Checks)
```
Akzeptiert Projekt, platziertes Wandelement oder blankes Wandelement/Bundle.
Der Test erzeugt DXF und liest sie mit ezdxf **wieder ein** (Beweis gültiger DXF) und
prüft Layer- und Entity-Zahlen gegen das Datenmodell.

## web-ifc-Prototyp (`webifc_prototype.mjs`) — Status: Machbarkeit bewiesen
IFC im Browser/Node über **web-ifc** (MPL-2.0). Der Prototyp erzeugt eine echte
SEMBLA-IFC, lädt sie mit web-ifc, erkennt Wände + Steine (Proxys), liest Attribute
und schreibt sie fehlerfrei zurück (Round-Trip). Beweist zweierlei: (a) der aktuelle
SEMBLA-IFC-Export ist valides IFC4 (web-ifc parst ihn sauber), (b) web-ifc ist der
tragfähige Weg, den handgeschriebenen Export künftig durch eine gepflegte Bibliothek
zu ersetzen.

```bash
npm install web-ifc
node Interop-CAD/webifc_prototype.mjs   # 8 Prüfungen, Round-Trip
```

## IfcOpenShell-Writer (`sembla_ifc.py`) — Status: fertig, getestet
Robuster IFC4-Writer (Python/LGPL) für die pyRevit/Python-Seite: Projekt → Gelände →
Gebäude → Ebene und je Wand ein `IfcWallStandardCase` mit extrudierter Geometrie und
korrekter Platzierung/Rotation. Round-Trip-Test (`test_sembla_ifc.py`, 9 Checks) öffnet
die Datei wieder mit ifcopenshell; zusätzlich cross-geprüft, dass **web-ifc** die
IfcOpenShell-Ausgabe fehlerfrei liest.

```bash
pip install ifcopenshell --break-system-packages
python3 sembla_ifc.py projekt.json modell.ifc
python3 test_sembla_ifc.py
```

## Anbindung & npm-Skripte (aus dem Suite-Stammordner)
```bash
npm run dxf -- projekt.json plan.dxf [--ansichten]   # ezdxf-DXF
npm run ifc -- projekt.json modell.ifc               # IfcOpenShell-IFC
npm run validate:ifc -- modell.ifc                   # web-ifc-Prüfung
npm run test:interop                                 # alle Interop-Tests
```
Der **Projekt-Manager** bietet „Projekt-JSON (für normnahen Export)" als Download und
verweist auf diese Befehle. Die **3D-Vorschau** hat einen „IFC-Datei prüfen"-Knopf
(lädt web-ifc per CDN, benötigt Internet; offline zeigt er einen Hinweis).

## Status Phase 1: abgeschlossen
ezdxf (DXF), IfcOpenShell (IFC schreiben) und web-ifc (IFC lesen/prüfen) stehen als
getestete Bausteine und sind an die Tools angebunden.
