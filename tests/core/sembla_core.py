#!/usr/bin/env python3
"""
SEMBLA Core - Referenz-Implementierung des Wandaufbaus (Phase 1, headless).

Dies ist die getestete, UI-freie Logik-Bibliothek der SEMBLA-Planungs-Suite und
zugleich die ausfuehrbare Spezifikation (Test-Orakel) fuer die spaetere Web-App.

Oeffentliche API:
    build_wall(name, length_mm, height_mm, openings=None) -> dict (Wandelement)
    Opening(g0, g1, l0, l1, art)                          -> validiertes Oeffnungs-Objekt
    is_buildable(wandelement) -> bool
    save(wandelement, path)

Einheiten: mm. 'grid' = Rastereinheit (125 mm), 'lage' = Lagenindex (200 mm).
Oeffnungen werden in Raster-/Lageneinheiten angegeben (der Editor rastet mm darauf).
"""
from __future__ import annotations
import json, math
from dataclasses import dataclass, asdict
from typing import Iterable

__all__ = [
    "GRID", "COURSE", "THICK", "ROD", "BLECH", "BLECH_THICK", "CHAMBER_OFFSET", "MAX_SPAN_GRID", "FORBIDDEN_N",
    "Opening", "SemblaError", "InvalidDimensionError", "InvalidOpeningError",
    "build_wall", "is_buildable", "save",
]

# ---- Konstanten (bestaetigte Parameter) ----
GRID          = 125    # mm Laengsraster
COURSE        = 200    # mm Lagenhoehe
THICK         = 125    # mm Wandstaerke
ROD           = 1100   # mm Gewindestange (wird abgelaengt)
BLECH         = 1000   # mm Standard-Modullaenge der Stahlbleche (Boden/Kopf)
BLECH_THICK   = 15     # mm Stahlblech-Dicke
CHAMBER_OFFSET = 62.5  # mm Kammerzentrum ab Steinanfang -> Lattice x=62.5+125k
MAX_SPAN_GRID = 3      # Vorspannung max. alle 3 Raster (375 mm)
FORBIDDEN_N   = frozenset({1, 4})  # nicht baubare / nicht versetzbare Segmentbreiten


# ---- Fehlertypen ----
class SemblaError(Exception):
    """Basis fuer alle SEMBLA-Eingabefehler."""

class InvalidDimensionError(SemblaError):
    """Wandlaenge/-hoehe verletzt das Raster."""

class InvalidOpeningError(SemblaError):
    """Oeffnung ungueltig (Grenzen, Ueberlappung, Maße)."""


# ---- Oeffnung ----
@dataclass(frozen=True)
class Opening:
    g0: int          # linke Kante (Raster)
    g1: int          # rechte Kante (Raster, halboffen)
    l0: int          # untere Lage (inkl.)
    l1: int          # obere Lage (exkl.)
    art: str = "tuer"

    def __post_init__(self):
        if self.g1 <= self.g0:
            raise InvalidOpeningError(f"g1<=g0 ({self.g0},{self.g1})")
        if self.l1 <= self.l0:
            raise InvalidOpeningError(f"l1<=l0 ({self.l0},{self.l1})")
        if self.g0 < 0 or self.l0 < 0:
            raise InvalidOpeningError("negative Koordinate")
        if self.art not in ("tuer", "fenster", "durchbruch"):
            raise InvalidOpeningError(f"unbekannte art '{self.art}'")

    def as_dict(self) -> dict:
        return asdict(self)


# ---- Tiling-Hilfen ----
def _seg_joints(start_grid: int, tiling: list[int]) -> set[int]:
    """Absolute Rasterpositionen der INNEREN Fugen (ohne Segmentenden)."""
    js, c = set(), start_grid
    for b in tiling[:-1]:
        c += b
        js.add(c)
    return js

def _candidates(n: int) -> list[list[int]]:
    """i3-maximale Lagen-Varianten fuer Breite n (Raster). i2 immer nur an den Enden."""
    if n < 2:
        return [[]]
    r = n % 3
    if r == 2:
        f = [3] * ((n - 2) // 3)
        return [[2] + f, f + [2]]                   # ein i2: links oder rechts
    if r == 1:
        f = [3] * ((n - 4) // 3)
        return [[2, 2] + f, f + [2, 2]]             # zwei i2: links oder rechts
    m = n // 3
    if m == 1:
        return [[3]]
    f = [3] * (m - 2)
    return [[3] * m, [2, 2] + f + [2], [2] + f + [2, 2]]   # reines i3, oder 3 i2 fuer Versatz

def _pick_tiling(start_grid: int, n: int, prev: set[int]) -> list[int]:
    """Waehlt unter den i3-maximalen Varianten die, die den Fugen der Lage darunter
    ausweicht. Prioritaet: (1) kein Konflikt, (2) max i3, (3) groesster Versatz."""
    best = None
    for comp in _candidates(n):
        js = _seg_joints(start_grid, comp)
        conflict = bool(js & prev)
        i3 = sum(1 for b in comp if b == 3)
        dist = min((abs(j - f) for j in js for f in prev), default=99) if (js and prev) else 99
        key = (not conflict, i3, dist)
        if best is None or key > best[0]:
            best = (key, comp)
    return best[1]

def _balanced_fill(a: int, b: int, maxstep: int) -> list[int]:
    if b <= a:
        return [a]
    k = math.ceil((b - a) / maxstep)
    return [round(a + (b - a) * i / k) for i in range(k + 1)]


# ---- Eingabe-Validierung ----
def _validate_inputs(length_mm: int, height_mm: int, openings: list[Opening]):
    if not isinstance(length_mm, int) or length_mm % GRID != 0:
        raise InvalidDimensionError(f"Wandlaenge {length_mm} ist kein Vielfaches von {GRID} mm")
    if length_mm < 2 * GRID:
        raise InvalidDimensionError(f"Wandlaenge {length_mm} < Mindestmaß {2*GRID} mm")
    if not isinstance(height_mm, int) or height_mm % COURSE != 0:
        raise InvalidDimensionError(f"Wandhoehe {height_mm} ist kein Vielfaches von {COURSE} mm")
    if height_mm < COURSE:
        raise InvalidDimensionError(f"Wandhoehe {height_mm} < {COURSE} mm")
    N, L = length_mm // GRID, height_mm // COURSE
    for op in openings:
        if op.g1 > N:
            raise InvalidOpeningError(f"Oeffnung ragt ueber Wandlaenge hinaus (g1={op.g1} > N={N})")
        if op.l1 > L:
            raise InvalidOpeningError(f"Oeffnung ragt ueber Wandhoehe hinaus (l1={op.l1} > L={L})")
    # Ueberlappung (geometrisch in grid x lage)
    for i in range(len(openings)):
        for j in range(i + 1, len(openings)):
            a, b = openings[i], openings[j]
            if a.g0 < b.g1 and b.g0 < a.g1 and a.l0 < b.l1 and b.l0 < a.l1:
                raise InvalidOpeningError(f"Oeffnungen ueberlappen: #{i} und #{j}")


# ---- Aufbau ----
SEITEN_FUNKTIONEN = ("fassade", "innenausbau", "sicht", "installation")

def _norm_sides(s):
    def f(v, d):
        return v["funktion"] if (isinstance(v, dict) and v.get("funktion") in SEITEN_FUNKTIONEN) else d
    s = s or {}
    return {"vorne": {"funktion": f(s.get("vorne"), "fassade")},
            "hinten": {"funktion": f(s.get("hinten"), "innenausbau")}}

def _norm_prestress(p):
    p = p or {}
    m = p.get("max_span_grid")
    m = m if isinstance(m, int) and m >= 1 else MAX_SPAN_GRID
    fk = p.get("force_kN")
    rod = p.get("rod_mm")
    if rod is None or float(rod) <= 0:
        rod = ROD
    else:
        rod = int(rod) if float(rod) == int(float(rod)) else float(rod)
    bl = p.get("blech_mm")
    if bl is None or float(bl) <= 0:
        bl = BLECH
    else:
        bl = int(bl) if float(bl) == int(float(bl)) else float(bl)
    top = p.get("top_connection")
    top = top if top in ("spannplatte", "blech") else "blech"
    cg = p.get("columns_grid")
    if isinstance(cg, (list, tuple)):
        cg = sorted({int(k) for k in cg if isinstance(k, (int, float)) and int(k) >= 0})
        cg = cg or None
    else:
        cg = None
    return {"max_span_grid": m, "force_kN": fk if fk is not None else None,
            "rod_mm": rod, "blech_mm": bl, "top_connection": top, "columns_grid": cg}

def _norm_steps(steps, length_mm, height_mm):
    out = []
    for s in (steps or []):
        x0 = max(0, round(int(s.get("x0_mm", 0)) / GRID) * GRID)
        x1 = min(length_mm, round(int(s.get("x1_mm", 0)) / GRID) * GRID)
        h = max(0, min(height_mm, round(int(s.get("height_mm", 0)) / COURSE) * COURSE))
        if x1 > x0:
            out.append({"x0_mm": x0, "x1_mm": x1, "height_mm": h})
    return out

def build_wall(name: str, length_mm: int, height_mm: int,
               openings: Iterable[Opening] | None = None, sides=None, prestress=None, steps=None) -> dict:
    _PS = _norm_prestress(prestress)
    _maxspan = _PS["max_span_grid"]
    _rod = _PS["rod_mm"]
    _top = _PS["top_connection"]   # 'blech' (Kopfblech) | 'spannplatte'
    """Baut ein Wandelement aus Laenge/Hoehe (mm) und Oeffnungen.

    Wirft InvalidDimensionError / InvalidOpeningError bei strukturell ungueltigen
    Eingaben. Planerische Verstoesse (z.B. starres Maß N=4, Versatz) werden NICHT
    als Exception geworfen, sondern im Feld 'validation' gemeldet (buildable=False).
    """
    openings = list(openings or [])
    _validate_inputs(length_mm, height_mm, openings)
    N, L = length_mm // GRID, height_mm // COURSE

    # Staffelung / getreppter Aufbau: je Spalte lokale Oberkante (Anzahl Lagen)
    _STEPS = _norm_steps(steps, length_mm, height_mm)
    _top_lage = []
    for k in range(N):
        xc = (k + 0.5) * GRID
        h = height_mm
        for s in _STEPS:
            if s["x0_mm"] <= xc < s["x1_mm"]:
                h = s["height_mm"]; break
        _top_lage.append(max(0, min(L, round(h / COURSE))))

    def _runs_at(li):
        runs = []; start = None
        for k in range(N):
            present = _top_lage[k] > li
            if present:
                if start is None: start = k
            elif start is not None:
                runs.append((start, k)); start = None
        if start is not None: runs.append((start, N))
        return runs

    courses, prev, rigid_lagen, invalid_segments = [], set(), [], []
    for li in range(L):
        cuts = _runs_at(li)
        for op in openings:
            if op.l0 <= li < op.l1:
                nc = []
                for (s, e) in cuts:
                    if op.g1 <= s or op.g0 >= e:
                        nc.append((s, e)); continue
                    if op.g0 > s: nc.append((s, op.g0))
                    if op.g1 < e: nc.append((op.g1, e))
                cuts = nc
        stones, joints, rig = [], set(), False
        for (s, e) in cuts:
            w = e - s
            if w in FORBIDDEN_N:
                rig = True
                seg = {"lage": li, "start_grid": s, "breite_grid": w}
                if seg not in invalid_segments:
                    invalid_segments.append(seg)
            comp = _pick_tiling(s, w, prev)
            joints |= _seg_joints(s, comp)
            g = s
            for b in comp:
                stones.append({"type": "i2" if b == 2 else "i3", "x0": g * GRID, "x1": (g + b) * GRID})
                g += b
        if rig:
            rigid_lagen.append(li)
        courses.append({"lage": li, "stones": stones, "joints_grid": sorted(joints)})
        prev = joints

    # Versatz-Validierung
    versatz_ok, viol = True, []
    for li in range(L - 1):
        bad = set(courses[li]["joints_grid"]) & set(courses[li + 1]["joints_grid"])
        if bad:
            versatz_ok = False
            viol.append({"zwischen_lagen": [li, li + 1], "fugen_grid": sorted(bad)})

    # Vorspannstraenge: Segmente je durchgehend belegtem Bereich (ueber/unter Oeffnungen, getreppt)
    occ = [[False] * N for _ in range(L)]
    for c in courses:
        for st in c["stones"]:
            a, b = st["x0"] // GRID, st["x1"] // GRID
            for cc in range(a, b):
                occ[c["lage"]][cc] = True
    if _PS["columns_grid"]:
        # Sonderkonstruktion: exakt die manuell gesetzten Achsen verwenden
        col_ks = sorted(k for k in _PS["columns_grid"] if 0 <= k < N)
    else:
        colset = {0, N - 1}
        for c in _balanced_fill(0, N - 1, _maxspan):
            colset.add(c)
        for op in openings:
            if op.g0 - 1 >= 0: colset.add(op.g0 - 1)
            if op.g1 <= N - 1: colset.add(op.g1)
        # Stufenkanten: an jeder Hoehenstufe ein Strang beidseitig der Kante (Vorspannung laeuft an der Treppe entlang)
        for k in range(N - 1):
            if _top_lage[k] != _top_lage[k + 1]:
                colset.add(k); colset.add(k + 1)
        col_ks = sorted(k for k in colset if 0 <= k < N)
    columns = []
    anch_senkkopf = 0; anch_spannmutter = 0; anch_spannplatten = 0
    for k in col_ks:
        local_top = _top_lage[k] * COURSE
        segs = []
        r = 0
        while r < L:
            if not occ[r][k]:
                r += 1; continue
            r2 = r
            while r2 + 1 < L and occ[r2 + 1][k]:
                r2 += 1
            z0, z1 = r * COURSE, (r2 + 1) * COURSE
            h = z1 - z0
            stueck = math.ceil(h / _rod)
            # Anschluss-Ausbildung je Segmentende (Fuss=Bodenblech, oben=Kopfblech/Spannplatte, sonst Spannplatte)
            bottom_base = z0 == 0
            top_reach = z1 == local_top
            anker_unten = "bodenblech" if bottom_base else "spannplatte"
            anker_oben = ("kopfblech" if _top == "blech" else "spannplatte") if top_reach else "spannplatte"
            seg_senkkopf = 0; seg_spannmutter = 0; seg_spannplatten = 0
            if bottom_base:
                seg_senkkopf += 1
            else:
                seg_spannmutter += 1; seg_spannplatten += 1
            if anker_oben == "kopfblech":
                seg_spannmutter += 1
            else:
                seg_spannmutter += 1; seg_spannplatten += 1
            anch_senkkopf += seg_senkkopf; anch_spannmutter += seg_spannmutter; anch_spannplatten += seg_spannplatten
            segs.append({"z0_mm": z0, "z1_mm": z1, "lage0": r, "lage1": r2 + 1, "gewindestangen": stueck,
                         "letzte_stange_mm": h - (stueck - 1) * _rod, "verschnitt_mm": stueck * _rod - h,
                         "verbindungsmuttern": stueck - 1, "anker_unten": anker_unten, "anker_oben": anker_oben,
                         "senkkopfschrauben": seg_senkkopf, "spannplatten": seg_spannplatten, "spannmuttern": seg_spannmutter})
            r = r2 + 1
        if not segs:
            continue
        durch = len(segs) == 1 and segs[0]["z0_mm"] == 0 and segs[0]["z1_mm"] == _top_lage[k] * COURSE
        columns.append({"k": k, "x_mm": CHAMBER_OFFSET + GRID * k, "durchgehend": durch, "segments": segs,
                        "gewindestangen": sum(g["gewindestangen"] for g in segs),
                        "verbindungsmuttern": sum(g["verbindungsmuttern"] for g in segs),
                        "senkkopfschrauben": sum(g["senkkopfschrauben"] for g in segs),
                        "spannplatten": sum(g["spannplatten"] for g in segs),
                        "spannmuttern": sum(g["spannmuttern"] for g in segs)})

    span_ok = True
    for r in range(L):
        c = 0
        while c < N:
            if not occ[r][c]:
                c += 1; continue
            c2 = c
            while c2 + 1 < N and occ[r][c2 + 1]:
                c2 += 1
            present = [col["k"] for col in columns if c <= col["k"] <= c2 and any(g["lage0"] <= r < g["lage1"] for g in col["segments"])]
            for x, y in zip(present, present[1:]):
                if y - x > _maxspan:
                    span_ok = False
            c = c2 + 1

    # Stossfugen (vertikale Fugen zwischen Steinen) -> Dichtstreifen (je 200 mm hoch = 1 Steinreihe)
    stossfugen = sum(len(c["joints_grid"]) for c in courses)

    # Stahlbleche: Bodenblech ueber volle Wandlaenge; Kopfblech nur bei top_connection=='blech'
    occ_cols = sum(1 for t in _top_lage if t > 0)
    top_edge_len = occ_cols * GRID
    boden_module = math.ceil(length_mm / _PS["blech_mm"])
    kopf_module = math.ceil(top_edge_len / _PS["blech_mm"]) if _top == "blech" else 0
    base_plate = {"rolle": "bodenblech", "laenge_mm": length_mm, "breite_mm": THICK,
                  "dicke_mm": BLECH_THICK, "modul_mm": _PS["blech_mm"], "module": boden_module}
    top_plate = ({"rolle": "kopfblech", "laenge_mm": top_edge_len, "breite_mm": THICK,
                  "dicke_mm": BLECH_THICK, "modul_mm": _PS["blech_mm"], "module": kopf_module}
                 if _top == "blech" else None)

    bom = {"i2": 0, "i3": 0}
    for c in courses:
        for s in c["stones"]:
            bom[s["type"]] += 1
    bom.update(gewindestangen=sum(c["gewindestangen"] for c in columns),
               verbindungsmuttern=sum(c["verbindungsmuttern"] for c in columns),
               senkkopfschrauben=anch_senkkopf, kopplungsmuttern_basis=anch_senkkopf,
               spannplatten=anch_spannplatten, spannmuttern=anch_spannmutter,
               stahlblech_module=boden_module + kopf_module,
               stahlblech_mm=length_mm + (top_edge_len if _top == "blech" else 0),
               stahlblech_dicke_mm=BLECH_THICK,
               stossfugen=stossfugen, dichtstreifen_mm=stossfugen * COURSE,
               verschnitt_mm=sum(g["verschnitt_mm"] for c in columns for g in c["segments"]))

    buildable = not invalid_segments  # strukturell; Versatz separat in 'validation'
    return {
        "name": name, "length_mm": length_mm, "height_mm": height_mm,
        "grid_mm": GRID, "course_mm": COURSE, "thickness_mm": THICK, "rod_mm": _rod,
        "N_grid": N, "lagen": L,
        "openings": [op.as_dict() for op in openings],
        "steps": _STEPS,
        "sides": _norm_sides(sides),
        "prestress": _PS,
        "base_plate": base_plate, "top_plate": top_plate,
        "tension_columns": columns, "bom": bom,
        "validation": {"buildable": buildable, "versatz_ok": versatz_ok,
                       "versatz_violations": viol, "tension_span_ok": span_ok,
                       "rigid_lagen": rigid_lagen, "invalid_segments": invalid_segments},
        "courses": courses,
    }


def is_buildable(w: dict) -> bool:
    return bool(w["validation"]["buildable"])

def save(w: dict, path: str):
    with open(path, "w") as f:
        json.dump(w, f, indent=2, ensure_ascii=False)


# Referenzfaelle (Test-Vertrag)
REFERENCE_WALLS = {
    "ref1_glatte_wand": ("ref1_glatte_wand", 1000, 2000, []),
    "ref2_wand_tuer":   ("ref2_wand_tuer", 2000, 2600, [Opening(5, 11, 0, 10, "tuer")]),
    "ref3_wand_fenster":("ref3_wand_fenster", 2000, 2600, [Opening(6, 10, 4, 10, "fenster")]),
}

def build_reference(key: str) -> dict:
    name, l, h, ops = REFERENCE_WALLS[key]
    return build_wall(name, l, h, ops)


if __name__ == "__main__":
    import os
    out = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(out, exist_ok=True)
    for key in REFERENCE_WALLS:
        w = build_reference(key)
        save(w, os.path.join(out, f"{key}.json"))
        v = w["validation"]
        print(f"{key:20s} buildable={v['buildable']} straenge={len(w['tension_columns'])} bom={w['bom']}")
    print("Fixtures regeneriert.")
