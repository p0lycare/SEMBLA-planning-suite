#!/usr/bin/env python3
"""
SEMBLA DXF-Export via ezdxf (MIT) — Phase-1-Interoperabilität.

Ersetzt den handgeschriebenen DXF-Text durch normnahe, mit jedem CAD lesbare
DXF-Dateien (echte HEADER/TABLES/Handles, saubere Layer, TEXT-Style).

Arbeitet auf demselben Datenmodell wie sembla-cad.mjs:
  Projekt:     { name, walls:[ { name, x_mm, y_mm, rot_deg, wall:<Wandelement> } ] }
  Wandelement: { length_mm, height_mm, courses:[{lage,stones:[{x0,x1,type}]}],
                 openings:[{g0,g1,l0,l1,art}], tension_columns:[{x_mm}] }

CLI:  python3 sembla_dxf.py projekt.json ausgabe.dxf [--ansichten]
"""
import json
import math
import sys

import ezdxf

THICK = 125          # Wandstärke mm
GRID = 125
COURSE = 200

# Layer -> ACI-Farbe
LAYERS = {
    "WAND": 5,          # blau
    "OEFFNUNG": 1,      # rot
    "BESCHRIFTUNG": 7,  # schwarz/weiß
    "STEINE_I3": 8,     # dunkelgrau
    "STEINE_I2": 9,     # hellgrau
    "VORSPANNUNG": 3,   # grün
    "UMRISS": 7,
}


def _rot(x, y, deg):
    a = math.radians(deg or 0)
    c, s = math.cos(a), math.sin(a)
    return (x * c - y * s, x * s + y * c)


def _proj_world(w, lx, ly):
    rx, ry = _rot(lx, ly, w.get("rot_deg", 0))
    return (rx + w.get("x_mm", 0), ry + w.get("y_mm", 0))


def footprint(w):
    L = w["wall"]["length_mm"]
    return [_proj_world(w, x, y) for x, y in [(0, 0), (L, 0), (L, THICK), (0, THICK)]]


def _new_doc():
    doc = ezdxf.new("R2010", setup=True)
    doc.header["$INSUNITS"] = 4  # Millimeter
    for name, col in LAYERS.items():
        if name not in doc.layers:
            doc.layers.add(name, color=col)
    return doc


def _text(msp, layer, x, y, h, s):
    msp.add_text(str(s), dxfattribs={"layer": layer, "height": h}).set_placement((x, y))


def project_to_dxf_grundriss(project):
    """Grundriss: Wand-Grundflächen platziert, Öffnungen markiert, Beschriftung."""
    doc = _new_doc()
    msp = doc.modelspace()
    for w in project["walls"]:
        wd = w["wall"]
        msp.add_lwpolyline(footprint(w), close=True, dxfattribs={"layer": "WAND"})
        for o in wd.get("openings", []):
            a = _proj_world(w, o["g0"] * GRID, 0)
            b = _proj_world(w, o["g0"] * GRID, THICK)
            c = _proj_world(w, o["g1"] * GRID, 0)
            e = _proj_world(w, o["g1"] * GRID, THICK)
            msp.add_line(a, b, dxfattribs={"layer": "OEFFNUNG"})
            msp.add_line(c, e, dxfattribs={"layer": "OEFFNUNG"})
        mx, my = _proj_world(w, wd["length_mm"] / 2, THICK + 120)
        _text(msp, "BESCHRIFTUNG", mx, my, 100, w.get("name", "Wand"))
    return doc


def project_to_dxf_ansichten(project):
    """Ansichten: je Wand die Elevation (Steine i2/i3, Öffnungen, Vorspannung), gekachelt."""
    doc = _new_doc()
    msp = doc.modelspace()
    oy = 0
    for w in project["walls"]:
        wd = w["wall"]
        L, H = wd["length_mm"], wd["height_mm"]
        _text(msp, "BESCHRIFTUNG", 0, oy + H + 120, 100,
              f"{w.get('name', 'Wand')}  {L/1000:.3f}x{H/1000:.2f}m")
        for c in wd.get("courses", []):
            y0 = oy + c["lage"] * COURSE
            for st in c["stones"]:
                lay = "STEINE_I3" if st["type"] == "i3" else "STEINE_I2"
                msp.add_lwpolyline(
                    [(st["x0"], y0), (st["x1"], y0), (st["x1"], y0 + COURSE), (st["x0"], y0 + COURSE)],
                    close=True, dxfattribs={"layer": lay})
        for o in wd.get("openings", []):
            x0, x1 = o["g0"] * GRID, o["g1"] * GRID
            y0, y1 = oy + o["l0"] * COURSE, oy + o["l1"] * COURSE
            msp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
                               close=True, dxfattribs={"layer": "OEFFNUNG"})
        for col in wd.get("tension_columns", []):
            msp.add_line((col["x_mm"], oy), (col["x_mm"], oy + H), dxfattribs={"layer": "VORSPANNUNG"})
        msp.add_lwpolyline([(0, oy), (L, oy), (L, oy + H), (0, oy + H)],
                           close=True, dxfattribs={"layer": "UMRISS"})
        oy += H + 600
    return doc


def save_project_dxf(project, path, ansichten=False):
    doc = project_to_dxf_ansichten(project) if ansichten else project_to_dxf_grundriss(project)
    doc.saveas(path)
    return path


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    with open(argv[1], "r", encoding="utf-8") as fh:
        data = json.load(fh)
    # Bundle oder blankes Projekt akzeptieren
    project = data.get("projekt") or data.get("project") or data
    if "walls" not in project and "wall" in project:      # einzelnes platziertes Wandelement
        project = {"name": data.get("name", "Projekt"), "walls": [project]}
    if "walls" not in project and ("courses" in project or "length_mm" in project):  # blankes Wandelement
        project = {"name": project.get("name", "Wand"), "walls": [{"name": project.get("name", "Wand"), "wall": project}]}
    ansichten = "--ansichten" in argv
    save_project_dxf(project, argv[2], ansichten=ansichten)
    n = len(project["walls"])
    print(f"DXF geschrieben: {argv[2]}  ({'Ansichten' if ansichten else 'Grundriss'}, {n} Wand/Wände)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
