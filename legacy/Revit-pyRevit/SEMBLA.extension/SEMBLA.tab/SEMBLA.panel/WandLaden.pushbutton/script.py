# -*- coding: utf-8 -*-
"""SEMBLA: Wandelement (JSON) laden und als Volumengeometrie in Revit erzeugen.

Liest ein in der SEMBLA-Suite erzeugtes Wandelement (Wand-Editor / Auslegungs-Engine)
und baut die Wand als DirectShape: jeder i2/i3-Stein als Quader, die Vorspannstränge
als schlanke Profile. Seiten-Funktionen und Nachweis-Status werden als Kommentar gesetzt.

IronPython-2.7- und CPython3-kompatibel (keine f-strings, keine Type-Hints).
"""
__title__ = "Wandelement\nladen"
__author__ = "SEMBLA Planungs-Suite"
__doc__ = "Laedt ein SEMBLA-Wandelement (JSON) und erzeugt die Wand als Volumengeometrie."

import json
from pyrevit import revit, DB, forms
from System.Collections.Generic import List

MM = 1.0 / 304.8  # Millimeter -> Revit-Fuss


def _rect_loop(x0, x1, y0, y1, z):
    """Geschlossene Rechteck-CurveLoop in der XY-Ebene auf Hoehe z (alles in mm)."""
    p = [DB.XYZ(x0 * MM, y0 * MM, z * MM), DB.XYZ(x1 * MM, y0 * MM, z * MM),
         DB.XYZ(x1 * MM, y1 * MM, z * MM), DB.XYZ(x0 * MM, y1 * MM, z * MM)]
    cl = DB.CurveLoop()
    for i in range(4):
        cl.Append(DB.Line.CreateBound(p[i], p[(i + 1) % 4]))
    return cl


def _box(x0, x1, y0, y1, z0, z1):
    """Quader als extrudiertes Rechteck (mm-Eingaben)."""
    loops = List[DB.CurveLoop]()
    loops.Add(_rect_loop(x0, x1, y0, y1, z0))
    return DB.GeometryCreationUtilities.CreateExtrusionGeometry(loops, DB.XYZ.BasisZ, (z1 - z0) * MM)


def _comment(w):
    s = w.get("sides", {}) or {}
    v = w.get("verification", {}) or {}
    vorne = (s.get("vorne", {}) or {}).get("funktion", "-")
    hinten = (s.get("hinten", {}) or {}).get("funktion", "-")
    txt = "SEMBLA | {0} | {1:.3f} x {2:.2f} m | Seiten v:{3} h:{4}".format(
        w.get("name", "Wand"), w["length_mm"] / 1000.0, w["height_mm"] / 1000.0, vorne, hinten)
    if v:
        gov = v.get("governing", {}) or {}
        txt += " | Nachweis: {0}".format(v.get("status", "-"))
        if "util" in gov:
            txt += " (Ausl. {0:.0f} %)".format(gov["util"] * 100.0)
    ps = w.get("prestress", {}) or {}
    if ps:
        txt += " | Vorspannung: alle {0} Raster, N={1} kN".format(ps.get("max_span_grid", "-"), ps.get("force_kN", "-"))
    return txt


def _set_comment(ds, text):
    try:
        p = ds.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
        if p and not p.IsReadOnly:
            p.Set(text)
    except Exception:
        pass


def _direct_shape(doc, solids, name):
    geoms = List[DB.GeometryObject]()
    for so in solids:
        geoms.Add(so)
    ds = DB.DirectShape.CreateElement(doc, DB.ElementId(DB.BuiltInCategory.OST_GenericModel))
    ds.SetShape(geoms)
    try:
        ds.SetName(name)
    except Exception:
        pass
    return ds


def main():
    path = forms.pick_file(file_ext="json", title="SEMBLA-Wandelement (JSON) waehlen")
    if not path:
        return
    f = open(path, "r")
    try:
        w = json.load(f)
    finally:
        f.close()

    # Projekt-Bundle entpacken (Datei enthaelt {format:"SEMBLA-Projekt", wandelement:{...}})
    if isinstance(w, dict) and w.get("format") == "SEMBLA-Projekt" and w.get("wandelement"):
        w = w["wandelement"]

    if "courses" not in w or "length_mm" not in w:
        forms.alert("Das ist kein SEMBLA-Wandelement (courses/length_mm fehlen).", title="SEMBLA")
        return

    t = w.get("thickness_mm", 125)
    H = w["height_mm"]
    course = w.get("course_mm", 200)

    stones = []
    for c in w["courses"]:
        z0 = c["lage"] * course
        z1 = z0 + course
        for st in c["stones"]:
            stones.append(_box(st["x0"], st["x1"], 0, t, z0, z1))

    hw = 8.0  # halbe sichtbare Strangbreite [mm]
    strands = []
    for col in w.get("tension_columns", []):
        x = col["x_mm"]
        segs = col.get("segments") or [{"z0_mm": 0, "z1_mm": H}]
        for g in segs:
            strands.append(_box(x - hw, x + hw, t / 2.0 - hw, t / 2.0 + hw, g["z0_mm"], g["z1_mm"]))

    # Anschlussbleche: Bodenblech immer, Kopfblech bei top_connection=='blech' (15 mm)
    bl_th = w.get("bom", {}).get("stahlblech_dicke_mm", 15)
    top_conn = (w.get("prestress", {}) or {}).get("top_connection", "blech")
    plates = [_box(0, w["length_mm"], 0, t, -bl_th, 0)]
    if top_conn == "blech":
        plates.append(_box(0, w["length_mm"], 0, t, H, H + bl_th))

    doc = revit.doc
    with revit.Transaction("SEMBLA Wandelement"):
        ds = _direct_shape(doc, stones, "SEMBLA Wand: " + str(w.get("name", "Wandelement")))
        _set_comment(ds, _comment(w))
        if strands:
            _direct_shape(doc, strands, "SEMBLA Vorspannung")
        if plates:
            _direct_shape(doc, plates, "SEMBLA Anschlussbleche")

    forms.alert("Wand erstellt:\n{0} Steine, {1} Vorspannstraenge, {2} Anschlussblech(e).\n\n{3}".format(
        len(stones), len(strands), len(plates), _comment(w)), title="SEMBLA")


main()
