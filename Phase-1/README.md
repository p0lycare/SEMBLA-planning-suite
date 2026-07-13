# SEMBLA Core — Phase 1 (headless Logik-Bibliothek)

Getestete, UI-freie Referenz-Implementierung des Wandaufbaus. Erzeugt aus Länge/Höhe/Öffnungen ein **Wandelement** (siehe `../Phase-0/wandelement.schema.json`) — die Single Source of Truth für die Module 2 (Verbinder), 3 (Statik) und 4 (Montageplanung). Dient zugleich als ausführbare Spezifikation / Test-Orakel für die spätere Web-App.

## API

```python
from sembla_core import build_wall, Opening, is_buildable, save

# Glatte Wand 1,00 m × 2,00 m
wand = build_wall("flur_w1", 1000, 2000)

# Wand 2,00 m × 2,60 m mit Tür (Breite 6 Raster = 750 mm, Höhe 10 Lagen = 2,00 m)
wand = build_wall("flur_w2", 2000, 2600, [Opening(g0=5, g1=11, l0=0, l1=10, art="tuer")])

if is_buildable(wand):
    save(wand, "flur_w2.json")
```

Öffnungen werden in **Raster** (g, 125 mm) und **Lagen** (l, 200 mm) angegeben; der spätere Editor rastet mm-Eingaben darauf.

### Fehlerverhalten
- **Strukturell ungültige Eingaben** → Exception: `InvalidDimensionError` (Maß nicht im Raster, zu klein), `InvalidOpeningError` (Grenzen, Überlappung).
- **Planerische Verstöße** (starres Maß N=4, Versatz) → keine Exception, sondern `wand["validation"]["buildable"] = False` mit Details in `versatz_violations` / `invalid_segments`.

## Regeln (implementiert & getestet)
- Tiling i2/i3, Versatz ≥ 1 Raster; verbotene Segmentbreiten N ∈ {1, 4}.
- Kammer-Lattice `x = 62,5 + k·125`; Vorspannstränge an beiden Wandenden, neben jeder Öffnung, max. 375 mm Abstand, keine Stränge in der Öffnung.
- Gewindestangen 1100 mm, letzte abgelängt; Verschnitt ausgewiesen.

## Tests

```
python3 -m unittest -v        # 21 Tests
python3 sembla_core.py        # Referenz-Fixtures neu erzeugen (fixtures/)
```

Abgedeckt: Reproduktion der drei goldenen Referenzfälle, Versatz-Property über N = 2…40, Kammer-Lattice, alle Vorspannregeln, Ablängen, Stücklisten-Konsistenz, Fehlerfälle.

## Dateien
- `sembla_core.py` — die Bibliothek
- `test_sembla_core.py` — Testsuite
- `fixtures/` — goldene Referenz-Wandelemente (Test-Vertrag)

## Nächster Schritt — Phase 2
Modul 1 (2D-Wand-Editor) als Web-UI auf diesen Core setzen: Länge/Höhe eingeben → Visualisierung der Lagen + Vorspannung, dann Öffnungen. Der Core bleibt die Logik; die UI ruft nur `build_wall(...)` und rendert das Wandelement.
