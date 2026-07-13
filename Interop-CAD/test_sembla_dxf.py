#!/usr/bin/env python3
"""Round-Trip-Test des ezdxf-Exporters: erzeugen -> mit ezdxf wieder einlesen -> prüfen."""
import os
import tempfile

import ezdxf

import sembla_dxf as S

# --- synthetisches Projekt (2 Wände, eine platziert + gedreht) ---
def _wall(L, H, openings, cols):
    lagen = H // S.COURSE
    courses = []
    for lage in range(lagen):
        # simple Belegung: i3 (375) bis Rest, dann i2 (250)
        stones, x = [], 0
        while x + 375 <= L:
            stones.append({"x0": x, "x1": x + 375, "type": "i3"}); x += 375
        if x < L:
            stones.append({"x0": x, "x1": L, "type": "i2"})
        courses.append({"lage": lage, "stones": stones})
    return {"length_mm": L, "height_mm": H, "courses": courses,
            "openings": openings, "tension_columns": [{"x_mm": c} for c in cols]}

PROJECT = {"name": "Testprojekt", "walls": [
    {"name": "W1", "x_mm": 0, "y_mm": 0, "rot_deg": 0,
     "wall": _wall(2000, 2600, [{"g0": 4, "g1": 8, "l0": 0, "l1": 9, "art": "tuer"}], [62.5+125*k for k in range(0, 15, 3)])},
    {"name": "W2", "x_mm": 3000, "y_mm": 500, "rot_deg": 90,
     "wall": _wall(1500, 2400, [], [62.5, 312.5, 562.5])},
]}

checks = []
def ok(name, cond): checks.append((name, bool(cond)))

tmp = tempfile.mkdtemp()
g_path = os.path.join(tmp, "grundriss.dxf")
a_path = os.path.join(tmp, "ansichten.dxf")
S.save_project_dxf(PROJECT, g_path, ansichten=False)
S.save_project_dxf(PROJECT, a_path, ansichten=True)

# --- Round-Trip: wieder einlesen (beweist gültige DXF) ---
gdoc = ezdxf.readfile(g_path)
adoc = ezdxf.readfile(a_path)
gmsp, amsp = gdoc.modelspace(), adoc.modelspace()

ok("Grundriss ist gültige DXF (readfile ok)", gdoc is not None)
ok("Ansichten ist gültige DXF (readfile ok)", adoc is not None)
ok("Millimeter-Einheit gesetzt ($INSUNITS=4)", gdoc.header.get("$INSUNITS") == 4)

for lay in ["WAND", "OEFFNUNG", "BESCHRIFTUNG", "VORSPANNUNG", "STEINE_I3", "STEINE_I2", "UMRISS"]:
    ok(f"Layer '{lay}' vorhanden", lay in gdoc.layers)

# Grundriss: je Wand eine WAND-Polylinie
n_wand = len(gmsp.query('LWPOLYLINE[layer=="WAND"]'))
ok("Grundriss: 2 Wand-Grundflächen", n_wand == 2)
# Öffnungsmarker: W1 hat 1 Öffnung -> 2 Linien
n_oeff = len(gmsp.query('LINE[layer=="OEFFNUNG"]'))
ok("Grundriss: 2 Öffnungs-Marker-Linien", n_oeff == 2)
ok("Grundriss: 2 Beschriftungen", len(gmsp.query('TEXT[layer=="BESCHRIFTUNG"]')) == 2)

# Ansichten: Steine gesamt == Summe stones
total_stones = sum(len(c["stones"]) for w in PROJECT["walls"] for c in w["wall"]["courses"])
n_stones = len(amsp.query('LWPOLYLINE[layer=="STEINE_I3"]')) + len(amsp.query('LWPOLYLINE[layer=="STEINE_I2"]'))
ok("Ansichten: alle Steine gezeichnet", n_stones == total_stones and total_stones > 0)
# Vorspannung: Summe tension_columns
total_cols = sum(len(w["wall"]["tension_columns"]) for w in PROJECT["walls"])
n_cols = len(amsp.query('LINE[layer=="VORSPANNUNG"]'))
ok("Ansichten: alle Vorspannstränge", n_cols == total_cols and total_cols > 0)
ok("Ansichten: 2 Umriss-Polylinien", len(amsp.query('LWPOLYLINE[layer=="UMRISS"]')) == 2)
# gedrehte Wand: W2 (rot 90) -> footprint-Punkt nicht achsparallel an Ursprung
fp2 = S.footprint(PROJECT["walls"][1])
ok("Platzierung/Rotation wirkt (W2 verschoben)", all(p[0] >= 2999 for p in fp2[:1]) or fp2[0][0] != 0)

fails = [n for n, c in checks if not c]
for n, c in checks:
    print(("  ok  " if c else "FAIL  ") + n)
print(f"\n{len(checks)-len(fails)}/{len(checks)} ok")
raise SystemExit(1 if fails else 0)
