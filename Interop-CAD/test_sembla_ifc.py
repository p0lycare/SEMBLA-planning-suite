#!/usr/bin/env python3
"""Round-Trip-Test des IfcOpenShell-Writers: schreiben -> mit ifcopenshell öffnen -> prüfen."""
import os
import tempfile

import ifcopenshell

import sembla_ifc as S

PROJECT = {"name": "Testprojekt", "walls": [
    {"name": "W1", "x_mm": 0, "y_mm": 0, "rot_deg": 0, "wall": {"length_mm": 3000, "height_mm": 2600}},
    {"name": "W2", "x_mm": 3000, "y_mm": 500, "rot_deg": 90, "wall": {"length_mm": 1500, "height_mm": 2400}},
]}

checks = []
def ok(n, c): checks.append((n, bool(c)))

tmp = tempfile.mkdtemp()
path = os.path.join(tmp, "test.ifc")
S.save_ifc(PROJECT, path)

m = ifcopenshell.open(path)
ok("gültige IFC (ifcopenshell.open)", m is not None)
ok("Schema IFC4", m.schema == "IFC4")
walls = m.by_type("IfcWallStandardCase")
ok("2 Wände (IfcWallStandardCase)", len(walls) == 2)
ok("Projektstruktur vorhanden", len(m.by_type("IfcProject")) == 1 and len(m.by_type("IfcBuildingStorey")) == 1)
ok("Einheit METRE", any(u.Name == "METRE" for u in m.by_type("IfcSIUnit")))
ok("jede Wand hat Geometrie (SweptSolid)", all(w.Representation is not None for w in walls)
   and len(m.by_type("IfcExtrudedAreaSolid")) == 2)
ok("Wände in Ebene enthalten", len(m.by_type("IfcRelContainedInSpatialStructure")) == 1)
# Namen erhalten
names = sorted(w.Name for w in walls)
ok("Wandnamen erhalten (W1/W2)", names == ["W1", "W2"])
# Platzierung W2 verschoben (x=3.0 m)
w2 = [w for w in walls if w.Name == "W2"][0]
loc = w2.ObjectPlacement.RelativePlacement.Location.Coordinates
ok("Platzierung W2 bei x=3,0 m", abs(loc[0] - 3.0) < 1e-6)

fails = [n for n, c in checks if not c]
for n, c in checks:
    print(("  ok  " if c else "FAIL  ") + n)
print(f"\n{len(checks)-len(fails)}/{len(checks)} ok")
raise SystemExit(1 if fails else 0)
