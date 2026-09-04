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
    "MIN_FERTIGMASS_MM", "ROD_OVERHANG", "norm_laengen", "quelle_fuer_mass",
    "kombiniere_laengen", "kombiniere_segment",
]

# ---- Konstanten (bestaetigte Parameter) ----
GRID          = 125    # mm Laengsraster
COURSE        = 200    # mm Lagenhoehe
THICK         = 125    # mm Wandstaerke
ROD           = 1100   # mm Gewindestange (wird abgelaengt)
BLECH         = 1000   # mm Standard-Modullaenge des Kopfblechs (Modulzaehlung)
BLECH_THICK   = 15     # mm Stahlblech-Dicke
# Bodenblech-Zerlegung ([A-10]/[A-11]/[A-12]): das Bodenblech ist KEINE durchgehende Platte,
# sondern eine Folge realer Bleche aus dem Vorratssatz der Standardlaengen.
BLECH_MIN_MM  = 375    # mm kleinste Bodenblech-Standardlaenge (3 Raster)
BLECH_MAX_MM  = 1250   # mm groesste Bodenblech-Standardlaenge (10 Raster)
BLECH_SPIEL   = 2      # mm Bauteilmass = Rastermass - 2 mm ([A-12])
BLECH_LAENGEN = [1250, 1125, 1000, 875, 750, 625, 500, 375]  # volle Standardreihe ([A-10])
CHAMBER_OFFSET = 62.5  # mm Kammerzentrum ab Steinanfang -> Lattice x=62.5+125k
MAX_SPAN_GRID = 3      # Vorspannung max. alle 3 Raster (375 mm)
FORBIDDEN_N   = frozenset({1, 4})  # nicht baubare / nicht versetzbare Segmentbreiten
MIN_FERTIGMASS_MM = 200  # kleinstes einbaubares Fertigmass eines Zuschnitts ([Z-5])
ROD_OVERHANG  = 10     # mm Ueberstand des Reststuecks ueber die Wandoberkante ([Z-6])


# ---- Zuschnitt aus ausgewaehlten Standardlaengen ([Z-2]/[Z-5]) ----
# Bit-genaues Gegenstueck zu kombiniereLaengen()/quelleFuerMass() in docs/shared/sembla-core.js.
# Die ausgewaehlten Katalogprodukte sind ein Vorratssatz an Standardlaengen, die tatsaechlich
# kombiniert werden: groesste geeignete zuerst, mit kleineren auffuellen, Restmass als sichtbar
# gekennzeichneter Sonderzuschnitt aus dem kleinsten geeigneten Ausgangsprodukt. [Z-5]
# (Mindest-Fertigmass) steht ueber der Groessenpraeferenz; laesst der Vorratssatz keine
# einbaubare Wahl zu, bleibt die Praeferenz und der Konflikt wird SICHTBAR gemeldet.

def _mm(x):
    # JS kennt nur EINEN Zahlentyp: ganzzahlige Ergebnisse bleiben dort ganzzahlig. Damit die
    # Stueckliste bit-genau paritaetisch bleibt (und im Fixture-JSON nicht "200.0" statt "200"
    # steht), wird hier ebenso auf int reduziert, sobald der Wert ganzzahlig ist.
    v = round(float(x) * 1e6) / 1e6
    return int(v) if float(v).is_integer() else v


def norm_laengen(l):
    """Standardlaengen normalisieren: nur > 0, dedupliziert, ABSTEIGEND."""
    arr = [float(x) for x in (l or []) if isinstance(x, (int, float)) and float(x) > 0]
    arr = [int(x) if float(x) == int(x) else x for x in arr]
    return sorted(set(arr), reverse=True)


def quelle_fuer_mass(mass_mm, laengen_mm):
    """Kleinste ausgewaehlte Standardlaenge >= Mass (Ausgangsprodukt) oder None."""
    out = None
    for l in norm_laengen(laengen_mm):
        if l >= mass_mm - 1e-9:
            out = l
    return out


def kombiniere_laengen(bedarf_mm, laengen_mm, min_mm=MIN_FERTIGMASS_MM):
    """Bedarf deterministisch aus den ausgewaehlten Standardlaengen kombinieren ([Z-2])."""
    L = norm_laengen(laengen_mm)
    stuecke = []
    if not L:
        return {"stuecke": stuecke, "konflikt": "keine_standardlaenge"}
    rest = _mm(bedarf_mm)
    konflikt = None
    guard = 0
    while rest > 1e-9 and guard < 10000:
        guard += 1
        passend = [l for l in L if l <= rest + 1e-9]          # absteigend
        if not passend:
            break                                             # Rest < kleinste Standardgroesse
        pick = None
        for l in passend:                                     # [Z-5] vor Groessenpraeferenz
            r2 = _mm(rest - l)
            if r2 <= 1e-9 or r2 >= min_mm - 1e-9 or any(x <= r2 + 1e-9 for x in L):
                pick = l
                break
        if pick is None:                                      # sichtbar, nie still
            pick = passend[0]
            konflikt = "mindestmass"
        stuecke.append({"len_mm": pick, "art": "standard", "quelle_mm": pick})
        rest = _mm(rest - pick)
    if rest > 1e-9:
        q = quelle_fuer_mass(rest, L)
        if q is None:
            return {"stuecke": [], "konflikt": "kein_ausgangsprodukt"}
        if rest < min_mm - 1e-9:
            konflikt = "mindestmass"
        stuecke.append({"len_mm": rest, "art": "sonder", "quelle_mm": q})
    return {"stuecke": stuecke, "konflikt": konflikt}


# ---- Reststueck am oberen Wandabschluss ([Z-6]) ----
# Bit-genaues Gegenstueck zu kombiniereSegment() in docs/shared/sembla-core.js.
# Waende werden im Innenraum montiert: unter der Decke ist kein Platz, eine lange Gewindestange
# einzufaedeln. Das oberste Stueck eines Stranges, der an der Wandoberkante endet, ist deshalb
# immer ein kurzes, im Katalog eigens als Reststueck gewaehltes Produkt. Es ragt um
# `ueberstand_mm` ueber die Oberkante (Kopfblech/Spannplatte + Spannmutter), zu bestuecken ist
# also h + ueberstand. Segmente ohne Oberkantenbezug (Bruestung/Sturz) bleiben unveraendert.
def kombiniere_segment(h_mm, laengen_mm, oben_an_ok, rest_mm, ueberstand_mm,
                       min_mm=MIN_FERTIGMASS_MM):
    """Stueckliste eines Strangsegments ([Z-2] + [Z-6])."""
    R = _mm(float(rest_mm)) if rest_mm and float(rest_mm) > 0 else 0
    UE = _mm(float(ueberstand_mm)) if ueberstand_mm and float(ueberstand_mm) > 0 else 0
    if not oben_an_ok or not R:
        k = kombiniere_laengen(h_mm, laengen_mm, min_mm)
        out = {"stuecke": k["stuecke"], "konflikt": k["konflikt"], "bedarf_mm": _mm(h_mm)}
        # Fehlendes Reststueck an der Oberkante ist ein sichtbarer Konflikt, keine stille Ausnahme.
        if oben_an_ok and not R:
            out["konflikt"] = k["konflikt"] or "kein_reststueck"
        return out
    bedarf = _mm(h_mm + UE)
    unten = _mm(bedarf - R)
    if unten < -1e-9:
        return {"stuecke": [], "konflikt": "reststueck_zu_lang", "bedarf_mm": bedarf}
    rest_stueck = {"len_mm": R, "art": "rest", "quelle_mm": R}
    if unten <= 1e-9:
        return {"stuecke": [rest_stueck], "konflikt": None, "bedarf_mm": bedarf}
    k = kombiniere_laengen(unten, laengen_mm, min_mm)
    if not k["stuecke"]:
        return {"stuecke": [], "konflikt": k["konflikt"] or "kein_ausgangsprodukt",
                "bedarf_mm": bedarf}
    return {"stuecke": k["stuecke"] + [rest_stueck], "konflikt": k["konflikt"],
            "bedarf_mm": bedarf}


# ---- Fehlertypen ----
class SemblaError(Exception):
    """Basis fuer alle SEMBLA-Eingabefehler."""

class InvalidDimensionError(SemblaError):
    """Wandlaenge/-hoehe verletzt das Raster."""

class InvalidOpeningError(SemblaError):
    """Oeffnung ungueltig (Grenzen, Ueberlappung, Maße)."""

class InvalidInterlockError(SemblaError):
    """Verzahnungsbereich ungueltig (Grenzen, Ueberlappung, Paritaet)."""


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
# ---- Bodenblech aus Standardlaengen ([A-10]/[A-11]/[A-12]) ----
# Bit-genaues Gegenstueck zu zerlegeBodenblech() in docs/shared/sembla-core.js.
# Das Bodenblech ist kein wandlanges Einzelteil, sondern eine Folge REALER Bleche aus dem
# Vorratssatz (Vielfache von 125 mm, 375…1250 mm): moeglichst wenige und moeglichst grosse
# Teile (die Ordnung dieser beiden Kriterien steht unten) — verwandt mit [Z-2].
# [A-10] Der Sonderzuschnitt ist die AUSNAHME: existiert IRGENDEINE exakte Kombination aus
# Standardlaengen, entsteht keiner. Gewaehlt wird in ZWEI Stufen — erst der Raum der EXAKTEN
# Kombinationen (geringste Teilezahl, darunter die groessten Teile), und nur wenn er leer ist,
# der Sonderpfad. Eine Tiefensuche, die einen Sonderabschluss als Erfolg nimmt, bricht zu frueh
# ab (z. B. 2500 mm aus {1000, 625, 375}, wo 4 x 625 exakt deckt).
# [A-11] ist ein MUSS ueber dieser Optimierung: kein Blechstoss auf einem Steinstoss der
# untersten Lage. Optimiert wird zuerst unter den STOSSFREIEN exakten Kombinationen; gibt es
# exakte, aber keine stossfreie, wird die beste exakte genommen und jeder verletzte Stoss
# BENANNT gemeldet — nie zugunsten eines Sonderzuschnitts umgangen.

def norm_blech_laengen(l):
    """Vorratssatz auf zulaessige Bodenblech-Standardlaengen eingrenzen."""
    return [x for x in norm_laengen(l)
            if isinstance(x, int) and x % GRID == 0 and BLECH_MIN_MM <= x <= BLECH_MAX_MM]


def zerlege_bodenblech(length_mm, laengen_mm, stoss_grid=()):
    """Bodenblech deterministisch in reale Teile zerlegen ([A-10]/[A-11]/[A-12])."""
    L = norm_blech_laengen(laengen_mm)
    stoss = {int(g) for g in (stoss_grid or ())}
    konflikte = []
    if not L:
        konflikte.append({"grund": "keine_standardlaenge"})

    def frei(x):                       # das Wandende ist kein Stoss
        return x >= length_mm or (x // GRID) not in stoss

    def exakt(strict):
        """Stufe 1: exakte Kombination — geringste Teilezahl, darunter die groessten Teile."""
        memo = {}

        def rec(x):
            if x == length_mm:
                return (0, [])
            if x in memo:
                return memo[x]
            best = None
            for l in L:                # absteigend: groesste zuerst
                if x + l > length_mm or (strict and not frei(x + l)):
                    continue
                t = rec(x + l)
                if t is None:
                    continue
                # Nur eine STRIKT kleinere Teilezahl gewinnt -> bei Gleichstand bleibt die
                # zuerst gefundene, also die mit der groesseren Laenge an dieser Stelle.
                if best is None or t[0] + 1 < best[0]:
                    best = (t[0] + 1,
                            [{"x0_mm": x, "raster_mm": l, "art": "standard"}] + t[1])
            memo[x] = best
            return best

        r = rec(0)
        return r[1] if r is not None else None

    def mit_sonder(strict):
        """Stufe 2: Groessenpraeferenz, GENAU EIN Sonderzuschnitt am Ende."""
        memo = {}

        def rec(x):
            if x == length_mm:
                return []
            if x in memo:
                return memo[x]
            out = None
            for l in L:                # absteigend: groesste zuerst
                if x + l > length_mm or (strict and not frei(x + l)):
                    continue
                t = rec(x + l)
                if t is not None:
                    out = [{"x0_mm": x, "raster_mm": l, "art": "standard"}] + t
                    break
            if out is None:
                rest = length_mm - x
                # [A-10] Sonderzuschnitt nur, wenn keine Standardlaenge mehr passt
                if rest > 0 and not any(l <= rest for l in L):
                    out = [{"x0_mm": x, "raster_mm": rest, "art": "sonder"}]
            memo[x] = out
            return out

        return rec(0)

    # Reihenfolge der Wahl: stossfrei exakt -> exakt (Stoss gemeldet) -> stossfrei mit
    # Sonderzuschnitt -> mit Sonderzuschnitt (Stoss gemeldet). Gemeldet wird danach an EINER
    # Stelle aus der gewaehlten Folge, damit kein Pfad still eine Stossverletzung durchlaesst.
    teile = None
    for kandidat in (lambda: exakt(True), lambda: exakt(False),
                     lambda: mit_sonder(True), lambda: mit_sonder(False)):
        teile = kandidat()
        if teile:
            break
    teile = teile or []
    for tl in teile:
        e = tl["x0_mm"] + tl["raster_mm"]
        if not frei(e):
            konflikte.append({"grund": "stoss_auf_steinstoss", "x_mm": e, "grid": e // GRID})
    return {"teile": [{"x0_mm": t["x0_mm"], "raster_mm": t["raster_mm"],
                       "bauteil_mm": t["raster_mm"] - BLECH_SPIEL, "art": t["art"]}
                      for t in teile],
            "konflikte": konflikte}


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
    # Gewindestangen-Standardlaengen ([Z-1]): Vorratssatz der gewaehlten Katalogprodukte.
    # FEHLT das Feld, gilt der kompatible Fallback aus `rod_mm`/ROD (einelementiger Satz ->
    # bit-genau das bisherige Ergebnis). Ist es AUSDRUECKLICH gesetzt und leer, hat der
    # Aufrufer die Auswahl ausgewertet: es ist keine Standardlaenge gewaehlt, also wird auch
    # keine erfunden (`rod_mm` bleibt None, der Zuschnitt bleibt sichtbar offen).
    _rod_roh = p.get("rod_lengths_mm")
    rod_explizit = isinstance(_rod_roh, (list, tuple))
    rod_l = norm_laengen(_rod_roh)
    if rod_l:
        rod = rod_l[0]
    elif rod_explizit:
        rod = None
    else:
        rod = p.get("rod_mm")
        if rod is None or float(rod) <= 0:
            rod = ROD
        else:
            rod = int(rod) if float(rod) == int(float(rod)) else float(rod)
        rod_l = [rod]
    bl = p.get("blech_mm")
    if bl is None or float(bl) <= 0:
        bl = BLECH
    else:
        bl = int(bl) if float(bl) == int(float(bl)) else float(bl)
    # Bodenblech-Standardlaengen ([A-10]): der VORRATSSATZ ist Core-Parameter. Fehlt das Feld,
    # gilt der deterministische Fallback mit der vollen Standardreihe 375…1250 mm — nie aus
    # `blech_mm` abgeleitet (das bleibt allein die Modullaenge des Kopfblechs). Ausdruecklich
    # gesetzt und leer heisst: keine Standardlaenge gewaehlt — dann wird keine erfunden.
    _bll = p.get("blech_lengths_mm")
    blech_l = norm_blech_laengen(_bll) if isinstance(_bll, (list, tuple)) else list(BLECH_LAENGEN)
    top = p.get("top_connection")
    top = top if top in ("spannplatte", "blech") else "blech"
    cg = p.get("columns_grid")
    if isinstance(cg, (list, tuple)):
        cg = sorted({int(k) for k in cg if isinstance(k, (int, float)) and int(k) >= 0})
        cg = cg or None
    else:
        cg = None
    # Startachse der Auto-Verteilung: 0 = 1. Rasterachse (Standard/Bestand), 1 = 2. Rasterachse
    _sa = p.get("start_axis_grid")
    sa = 1 if (_sa == 1 and not isinstance(_sa, bool)) or _sa == "1" else 0
    # Reststueck am oberen Wandabschluss ([Z-6]): `rod_rest_mm` ist das in Modul 1 gewaehlte
    # Reststueck-Produkt (genau eins), `rod_overhang_mm` der konfigurierbare Ueberstand.
    _rr = p.get("rod_rest_mm")
    rr = 0
    if _rr is not None and float(_rr) > 0:
        rr = int(_rr) if float(_rr) == int(float(_rr)) else float(_rr)
    _ue = p.get("rod_overhang_mm")
    ue = ROD_OVERHANG
    if _ue is not None and float(_ue) >= 0:
        ue = int(_ue) if float(_ue) == int(float(_ue)) else float(_ue)
    return {"max_span_grid": m, "force_kN": fk if fk is not None else None,
            "rod_mm": rod, "rod_lengths_mm": rod_l, "blech_mm": bl,
            "blech_lengths_mm": blech_l, "top_connection": top,
            "columns_grid": cg, "start_axis_grid": sa,
            "rod_rest_mm": rr, "rod_overhang_mm": ue}

def _norm_steps(steps, length_mm, height_mm):
    out = []
    for s in (steps or []):
        x0 = max(0, round(int(s.get("x0_mm", 0)) / GRID) * GRID)
        x1 = min(length_mm, round(int(s.get("x1_mm", 0)) / GRID) * GRID)
        h = max(0, min(height_mm, round(int(s.get("height_mm", 0)) / COURSE) * COURSE))
        if x1 > x0:
            out.append({"x0_mm": x0, "x1_mm": x1, "height_mm": h})
    return out


# ---- Verzahnungsbereich ([G-10]/[G-11]/[G-12]) ----
# Ein Verzahnungsbereich ist ein Laengsabschnitt [g0, g1) der Wand, in dem alternierend in jeder
# zweiten Lage die Steine fehlen. Die Startparitaet (0 = unterste Lage ausgespart, 1 = erst die
# zweite Lage ausgespart) ist frei waehlbar.
# [G-11] Die Vorspannachsen werden aus dem VOLLSTAENDIGEN Steinverband berechnet, OHNE die
# Verzahnungsaussparungen — Vorspannung bleibt also bitgleich.

def norm_interlocks(arr, N, openings=None):
    """Normalisiert und validiert Verzahnungsbereiche.
    arr: rohe interlocks
    N: Wandlaenge in Rastern
    openings: Liste von Opening-Objekten (zur Ueberlappungspruefung)
    Gibt (interlocks, fehler) zurueck."""
    if not arr or not isinstance(arr, (list, tuple)):
        return [], []
    openings = openings or []
    out = []
    fehler = []
    for raw in arr:
        g0 = raw.get("g0")
        g1 = raw.get("g1")
        sp = raw.get("start_parity")
        bereich = {"g0": g0, "g1": g1, "start_parity": sp}
        # Ganzzahlig, gueltiges Intervall, innerhalb der Wand
        try:
            g0 = int(g0)
            g1 = int(g1)
        except (TypeError, ValueError):
            fehler.append({"grund": "nicht_ganzzahlig", "bereich": bereich})
            continue
        if g1 <= g0:
            fehler.append({"grund": "leeres_intervall", "bereich": bereich})
            continue
        if g0 < 0 or g1 > N:
            fehler.append({"grund": "ausserhalb_wand", "bereich": bereich})
            continue
        try:
            sp = int(sp)
        except (TypeError, ValueError):
            sp = -1
        if sp not in (0, 1):
            fehler.append({"grund": "ungueltige_paritaet", "bereich": bereich})
            continue
        # Ueberlappung mit Oeffnungen
        overlap = False
        for op in openings:
            if g0 < op.g1 and op.g0 < g1:
                overlap = True
                break
        if overlap:
            fehler.append({"grund": "ueberlappt_oeffnung", "bereich": bereich})
            continue
        out.append({"g0": g0, "g1": g1, "start_parity": sp})
    # Sortieren nach g0
    out.sort(key=lambda x: x["g0"])
    # Ueberlappung untereinander pruefen
    i = 0
    while i < len(out) - 1:
        if out[i]["g1"] > out[i + 1]["g0"]:
            fehler.append({"grund": "ueberlappt_verzahnung", "bereich": out[i + 1]})
            out.pop(i + 1)
        else:
            i += 1
    return out, fehler


def build_wall(name: str, length_mm: int, height_mm: int,
               openings: Iterable[Opening] | None = None, sides=None, prestress=None, steps=None,
               interlocks=None) -> dict:
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
    # [G-10]/[G-12] Verzahnungsbereiche normalisieren und validieren
    _IL_interlocks, _IL_fehler = norm_interlocks(interlocks, N, openings)

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

    # ---- Erster Durchgang: VOLLSTAENDIGER Steinverband (Basis fuer occ und Vorspannung) ----
    # [G-11] Die Spannachsen werden aus dem VOLLSTAENDIGEN Steinverband berechnet, OHNE die
    # Verzahnungsaussparungen. Dieser erste Durchgang laeuft IMMER — auch bei Verzahnungsbereichen.
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

    # `occ`, `stein_iv_voll` und `wunsch_voll` basieren auf dem VOLLSTAENDIGEN Verband (vor dem Aussparen) — [G-11].
    occ = [[False] * N for _ in range(L)]
    stein_iv_voll = []
    # [V-3] Wunschpositionen: Mitte der i3-Steine der untersten Lage — VOR dem Aussparen!
    wunsch_voll = set()
    for c in courses:
        for st in c["stones"]:
            a, b = st["x0"] // GRID, st["x1"] // GRID
            for cc in range(a, b):
                occ[c["lage"]][cc] = True
            stein_iv_voll.append((a, b))
            # [V-3] Nur unterste Lage (lage 0), nur i3 (Breite 3 Raster) — hat eine echte Rastermitte
            if c["lage"] == 0 and b - a == 3:
                wunsch_voll.add(a + 1)

    # ---- Zweiter Durchgang: Aussparung fuer Verzahnungsbereiche ([G-10]) ----
    # Bei gueltigen Verzahnungsbereichen wird das Tiling DETERMINISTISCH NEU GERECHNET: die
    # Bereiche werden wie Luecken aus den runs/cuts herausgeschnitten, bevor `_pick_tiling` laeuft.
    # So endet kein Stein im Bereich und der verbleibende Verband wird deterministisch neu gelegt.
    # Stossfugen und occ bleiben beim vollstaendigen Verband — Vorspannung bleibt bitgleich ([G-11]).
    interlock_invalid_segments = []
    if _IL_interlocks:
        prev_il = set()
        for li in range(L):
            # Pruefen, ob diese Lage in mindestens einem Verzahnungsbereich ausgespart wird
            relevant_ils = [il for il in _IL_interlocks if li % 2 == il["start_parity"]]
            if not relevant_ils:
                # Keine Aussparung in dieser Lage — Steine bleiben unveraendert, prev fuer naechste Lage
                prev_il = set(courses[li]["joints_grid"])
                continue
            # cuts aus dem vollstaendigen Verband holen (gleicher Weg wie oben)
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
            # Verzahnungsbereiche DIESER Lage (passende Paritaet) wie Luecken herausschneiden
            for il in relevant_ils:
                nc = []
                for (s, e) in cuts:
                    if il["g1"] <= s or il["g0"] >= e:
                        nc.append((s, e)); continue
                    if il["g0"] > s: nc.append((s, il["g0"]))
                    if il["g1"] < e: nc.append((il["g1"], e))
                cuts = nc
            # Neues Tiling fuer die reduzierte Lage
            stones = []
            for (s, e) in cuts:
                w = e - s
                # Nicht baubare Restbreiten durch Verzahnung melden (getrennt von den strukturellen)
                if w in FORBIDDEN_N:
                    seg = {"lage": li, "start_grid": s, "breite_grid": w}
                    if seg not in interlock_invalid_segments:
                        interlock_invalid_segments.append(seg)
                comp = _pick_tiling(s, w, prev_il)
                g = s
                for b in comp:
                    stones.append({"type": "i2" if b == 2 else "i3", "x0": g * GRID, "x1": (g + b) * GRID})
                    g += b
            courses[li]["stones"] = stones
            # prev fuer die naechste Lage kommt aus dem vollstaendigen Verband (joints_grid unveraendert)
            prev_il = set(courses[li]["joints_grid"])
    # ---- Spannachsen ---------------------------------------------------------------
    # Hierarchie: [V-1] Kammerraster > [V-9] manuelle Achsen > [V-2] Steinabdeckung (MUSS)
    # > [V-7]/[V-8] Zusatzachsen an Stufen-/Oeffnungskanten > [V-3] Mitte i3 unterste Lage
    # > [V-4] Maximalabstand als OBERGRENZE.
    #
    # [V-4] ist bewusst die LETZTE Stufe und nicht mehr die Verteilungsregel: die Steinabdeckung
    # [V-2] impliziert den Abstand NICHT (sonst entstehen Luecken bis 5 Raster = 625 mm, obwohl
    # jeder Stein gehalten ist), und umgekehrt beweist ein eingehaltenes Maximalraster die
    # Abdeckung nicht. Beide Regeln sind unabhaengig und beide gelten.
    # [G-11] Steinabdeckung basiert auf dem VOLLSTAENDIGEN Verband (stein_iv_voll, vor dem Aussparen).
    # Deterministische Reihenfolge fuer den Stabbing-Greedy: nach rechtem, dann linkem Rand.
    stein_iv_voll.sort(key=lambda p: (p[1], p[0]))

    def _gehalten(S, a, b):
        """Wird das Rasterintervall [a,b) von mindestens einer Achse aus S durchgangen?"""
        return any(k in S for k in range(a, b))

    if _PS["columns_grid"]:
        # [V-9] Sonderkonstruktion: exakt die manuell gesetzten Achsen verwenden. Sie werden NICHT
        # ergaenzt (auch nicht um [V-2]/[V-4]) — der Anwender uebernimmt die Verteilung ganz.
        # Verletzungen der Muss-Regel [V-2] werden unten sichtbar gemeldet.
        col_ks = sorted(k for k in _PS["columns_grid"] if 0 <= k < N)
    else:
        # [V-5] Startachse (0 = 1. Rasterachse, Standard; 1 = 2. Rasterachse) und letzte Achse N-1.
        a0 = min(_PS["start_axis_grid"], N - 1)
        colset = {a0, N - 1}
        # [V-8] Oeffnungen: beidseitig eine Achse (die Steine daneben tragen den Sturz ab).
        for op in openings:
            if op.g0 - 1 >= 0: colset.add(op.g0 - 1)
            if op.g1 <= N - 1: colset.add(op.g1)
        # [V-7] Stufenkanten: an jeder Hoehenstufe ein Strang beidseitig der Kante.
        for k in range(N - 1):
            if _top_lage[k] != _top_lage[k + 1]:
                colset.add(k); colset.add(k + 1)
        # [V-3] Wunschpositionen: Mitte der i3-Steine der untersten Lage — aus dem VOLLSTAENDIGEN
        # Verband (wunsch_voll, oben berechnet). Ein i2 hat keine Rastermitte (zwei Zellen) und
        # liefert deshalb keine Wunschposition — es wird nichts geraten.
        # [V-2] MUSS: jeder Stein jeder Lage wird von mindestens einer Achse durchgangen.
        # Stabbing-Greedy ueber alle Steine; gesetzt wird die RECHTESTE Zelle des Steins, weil sie
        # die meisten folgenden Steine miterschlaegt (minimale Achsenzahl). Liegt im Stein eine
        # Wunschposition nach [V-3], hat diese Vorrang vor der Reichweite — sie kostet hoechstens
        # zusaetzliche Achsen, nie die Abdeckung.
        for a, b in stein_iv_voll:
            if _gehalten(colset, a, b):
                continue
            pos = b - 1
            for k in range(b - 1, a - 1, -1):
                if k in wunsch_voll:
                    pos = k
                    break
            colset.add(pos)
        # [V-4] Obergrenze: verbleibende Luecken > max_span_grid balanciert auffuellen (rein
        # additiv, die Abdeckung aus [V-2] bleibt dabei zwingend erhalten).
        roh = sorted(k for k in colset if 0 <= k < N)
        fin = set(roh)
        for i in range(len(roh) - 1):
            if roh[i + 1] - roh[i] > _maxspan:
                for c in _balanced_fill(roh[i], roh[i + 1], _maxspan):
                    fin.add(c)
        col_ks = sorted(k for k in fin if 0 <= k < N)
    # [V-2] Nachweis der Steinabdeckung. Im Auto-Pfad ist die Liste konstruktionsbedingt leer und
    # dient als Selbstkontrolle; bei manuellen Achsen ([V-9]) ist sie der geforderte Abgleich gegen
    # die Muss-Regel. Sichtbar gemeldet, aber KEIN Baubarkeitsausschluss: die Sonderkonstruktion
    # ist eine bewusste Anwenderentscheidung und wird nie still korrigiert.
    _achs_set = set(col_ks)
    ungehaltene_steine = [
        {"lage": c["lage"], "start_grid": st["x0"] // GRID,
         "breite_grid": (st["x1"] - st["x0"]) // GRID, "typ": st["type"]}
        for c in courses for st in c["stones"]
        if not _gehalten(_achs_set, st["x0"] // GRID, st["x1"] // GRID)
    ]
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
            # Anschluss-Ausbildung je Segmentende (Fuss=Bodenblech, oben=Kopfblech/Spannplatte, sonst Spannplatte)
            bottom_base = z0 == 0
            top_reach = z1 == local_top
            # [Z-2]/[Z-3]/[Z-6] kanonische Stueckliste des Segments (echte Standardlaengen +
            # hoechstens ein Sonderzuschnitt, an der Oberkante darueber das Reststueck) —
            # keine zweite Rechnung aus einer Pauschallaenge.
            _kombi = kombiniere_segment(h, _PS["rod_lengths_mm"], top_reach,
                                        _PS["rod_rest_mm"], _PS["rod_overhang_mm"])
            _stuecke = _kombi["stuecke"]
            stueck = len(_stuecke)
            _quelle_summe = sum(s["quelle_mm"] for s in _stuecke)
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
                         "stuecke": _stuecke, "zuschnitt_konflikt": _kombi["konflikt"],
                         # `bedarf_mm` = tatsaechlich zu bestueckende Stanglaenge (an der
                         # Oberkante h + Ueberstand, sonst h). Der Verschnitt misst sich daran,
                         # damit der Ueberstand nicht als Verschnitt erscheint.
                         "bedarf_mm": _kombi["bedarf_mm"],
                         "ueberstand_mm": _kombi["bedarf_mm"] - h,
                         "letzte_stange_mm": (_stuecke[stueck - 1]["len_mm"] if stueck else h),
                         # Ein Zuschnittkonflikt kann `stuecke` LEER lassen ([Z-6]:
                         # `reststueck_zu_lang`, `kein_ausgangsprodukt`). Dann gibt es keine
                         # Stange, also auch keine Kopplung und keinen Verschnitt — die
                         # Zaehlung darf nicht ins Negative laufen.
                         "verschnitt_mm": (_quelle_summe - _kombi["bedarf_mm"] if stueck else 0),
                         "verbindungsmuttern": max(0, stueck - 1), "anker_unten": anker_unten, "anker_oben": anker_oben,
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

    # Stahlbleche: das Bodenblech liegt ueber die volle Wandlaenge, besteht dort aber aus REALEN
    # Teilen ([A-10]/[A-11]/[A-12]) statt aus einer Modulzaehlung; Kopfblech unveraendert.
    occ_cols = sum(1 for t in _top_lage if t > 0)
    top_edge_len = occ_cols * GRID
    boden_zerlegung = zerlege_bodenblech(length_mm, _PS["blech_lengths_mm"],
                                         courses[0]["joints_grid"] if courses else [])
    boden_teile = boden_zerlegung["teile"]
    boden_module = len(boden_teile)          # Anzahl REALER Bodenblechteile
    kopf_module = math.ceil(top_edge_len / _PS["blech_mm"]) if _top == "blech" else 0
    base_plate = {"rolle": "bodenblech", "laenge_mm": length_mm, "breite_mm": THICK,
                  "dicke_mm": BLECH_THICK, "modul_mm": _PS["blech_mm"], "module": boden_module,
                  "teile": boden_teile}
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

    # [Z-5]/[Z-6] Zuschnitt-Konflikte sichtbar machen (nie still); kein Baubarkeitsausschluss.
    # Neben den Zuschnittgruenden auch `kein_reststueck` (oberer Abschluss ohne gewaehltes
    # Reststueck) und `reststueck_zu_lang`.
    zuschnitt_konflikte = [
        {"k": c["k"], "z0_mm": g["z0_mm"], "z1_mm": g["z1_mm"],
         "grund": g["zuschnitt_konflikt"], "fertigmass_mm": g["letzte_stange_mm"]}
        for c in columns for g in c["segments"] if g["zuschnitt_konflikt"]
    ]

    buildable = not invalid_segments  # strukturell; Versatz separat in 'validation'
    return {
        "name": name, "length_mm": length_mm, "height_mm": height_mm,
        "grid_mm": GRID, "course_mm": COURSE, "thickness_mm": THICK, "rod_mm": _rod,
        "N_grid": N, "lagen": L,
        "openings": [op.as_dict() for op in openings],
        "steps": _STEPS,
        # [G-10] Verzahnungsbereiche (optional, nur die validen)
        "interlocks": _IL_interlocks,
        "sides": _norm_sides(sides),
        "prestress": _PS,
        "base_plate": base_plate, "top_plate": top_plate,
        "tension_columns": columns, "bom": bom,
        "validation": {"buildable": buildable, "versatz_ok": versatz_ok,
                       "versatz_violations": viol, "tension_span_ok": span_ok,
                       "rigid_lagen": rigid_lagen, "invalid_segments": invalid_segments,
                       "zuschnitt_konflikte": zuschnitt_konflikte,
                       # [A-11] Blechstoesse auf einem Steinstoss der untersten Lage sowie ein
                       # leerer Vorratssatz — sichtbar, KEIN Baubarkeitsausschluss.
                       "blech_konflikte": boden_zerlegung["konflikte"],
                       # [V-2] Steine ohne Spannachse. Auto-Pfad: immer leer. Manuell: echter Befund.
                       "ungehaltene_steine": ungehaltene_steine,
                       # [G-12] Ungueltige/fehlerhafte Verzahnungsbereiche (sichtbare Warnung, kein Baubarkeitsausschluss)
                       "interlock_fehler": _IL_fehler,
                       # [G-10] Nicht baubare Restbreiten durch Verzahnungsaussparung (z.B. 1 oder 4 Raster)
                       "interlock_invalid_segments": interlock_invalid_segments},
        "courses": courses,
    }


def is_buildable(w: dict) -> bool:
    return bool(w["validation"]["buildable"])

def save(w: dict, path: str):
    with open(path, "w") as f:
        json.dump(w, f, indent=2, ensure_ascii=False)
        f.write("\n")  # abschließender Zeilenumbruch


# Referenzfaelle (Test-Vertrag)
REFERENCE_WALLS = {
    "ref1_glatte_wand": ("ref1_glatte_wand", 1000, 2000, []),
    "ref2_wand_tuer":   ("ref2_wand_tuer", 2000, 2600, [Opening(5, 11, 0, 10, "tuer")]),
    "ref3_wand_fenster":("ref3_wand_fenster", 2000, 2600, [Opening(6, 10, 4, 10, "fenster")]),
}

# Die Referenzwaende sind ausdrueckliche KOPFBLECH-Faelle: ihre goldenen Fixtures tragen
# `top_connection: "blech"`. Der Wert wird hier AUSGESPROCHEN statt dem Default ueberlassen —
# sonst verschoebe ein spaeterer Wechsel des allgemeinen Defaults die Goldwerte still.
# Der Default in `_norm_prestress` bleibt davon unberuehrt (Paritaet zu buildReference im JS-Core).
def build_reference(key: str) -> dict:
    name, l, h, ops = REFERENCE_WALLS[key]
    return build_wall(name, l, h, ops, prestress={"top_connection": "blech"})


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
