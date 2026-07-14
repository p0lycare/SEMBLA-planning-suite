# SEMBLA Planungs-Suite — Phase 0: Wandelement-Spezifikation

**Status:** Entwurf v0.1 · Phase 0 (Fundament) · 2D, Einzelwand
**Zweck:** Das *Wandelement* ist die **Single Source of Truth** der gesamten Suite. Modul 1 (Wand-Editor) erzeugt es, die Module 2 (Verbinder), 3 (Statik) und 4 (Montageplanung) lesen ausschließlich daraus. Dieses Dokument definiert das Datenmodell und die Aufbau-Regeln. Die Regeln sind zusätzlich als ausführbarer Validator hinterlegt (`sembla_core.py`), der die Referenzfälle erzeugt und prüft — er ist die Saat für den Phase-1-Core.

---

## 1. Bestätigte Parameter

| Größe | Wert | Anmerkung |
|---|---|---|
| Längsraster | 125 mm | Wandlänge = Vielfaches von 125 mm |
| Lagenhöhe | 200 mm | Wandhöhe = Vielfaches von 200 mm |
| Wandstärke | 125 mm | einschaliges System |
| Stein i2 | 250 mm / 2 Kammern | = 2 Rastereinheiten |
| Stein i3 | 375 mm / 3 Kammern | = 3 Rastereinheiten |
| Gewindestange | 1100 mm | feste Länge, per Verbindungsmutter gekoppelt |
| Vorspannabstand | max. 375 mm (3 Raster) | Maximalabstand, enger erlaubt |
| Versatz | ≥ 1 Raster (125 mm) | Mindestversatz zwischen Lagen |

---

## 2. Geometrie-Grundlage: das Kammer-Lattice

Der entscheidende Mechanismus des Systems: weil jeder Stein auf dem 125-mm-Raster beginnt und die Kammern im Stein einen festen Versatz von **62,5 mm** zum Steinanfang haben (Kammerteilung 125 mm), liegen **alle** Kammern aller Steine — unabhängig von Steintyp und Versatz — auf einem durchgehenden globalen Gitter:

```
Kammerposition x(k) = 62,5 mm + k · 125 mm   (k = 0 … N-1, N = Wandlänge/125)
```

Jede Rasterzelle enthält damit genau **eine** Kammer in ihrer Mitte. Vorspannstränge sitzen auf diesem Lattice und treffen deshalb in jeder Lage eine Kammer — nie einen Steg —, egal wie die Steine darüber/darunter versetzt sind. Das ist die Grundlage dafür, dass Versatz (horizontal) und durchgehende Vorspannung (vertikal) gleichzeitig funktionieren.

> **Bestätigt:** `chamberOffset = 62,5 mm` und Kammerteilung 125 mm entsprechen der echten i2/i3-Geometrie (jede Kammer mittig im 125-mm-Modul). Die Invariante steht.

---

## 3. Aufbau-Regeln

### 3.1 Steinlage & Versatz (Tiling)
- Eine Lage ist eine Folge von i2/i3, deren Längen (2 bzw. 3 Raster) die Wandlänge `N` (in Rastern) exakt füllen.
- **Verbotene Segmentbreiten:** `N = 1` (nicht baubar) und `N = 4` (nur i2+i2 möglich → Fuge zwingend mittig → kein Versatz). Beide werden vom Validator als `invalid_segments` markiert und setzen `buildable = false`. Gilt für die Wandlänge **und** für Pfeiler neben Öffnungen. Alle anderen `N ≥ 2` sind baubar (Mindest-Wandlänge 250 mm).
- **i3-Maximierung (primär):** Jede Lage verwendet so viele i3 wie möglich; i2 dienen nur als Abschluss an den **Wandenden**, nie im Feld. Grund-Minimum je Segment: `N mod 3 = 0 → 0`, `= 2 → 1`, `= 1 → 2` i2.
- **Innere Fugen** sind die Stoßstellen zwischen zwei Steinen innerhalb eines durchgehenden Steinfelds. Segment-Enden (Wandenden, Öffnungskanten) zählen **nicht** als Fugen.
- **Versatz (immer erzwungen):** Pro Lage wählt der Solver unter den i3-maximalen Varianten (Abschluss-i2 links bzw. rechts; bei Vielfachen von 37,5 cm zusätzlich eine Variante mit drei i2) diejenige, die den Fugen der Lage darunter ausweicht (Abstand ≥ 1 Raster). So entsteht Versatz auch über Brüstungs-/Sturzübergänge hinweg und bei reinen 37,5-cm-Breiten — i2 werden nur dort zusätzlich eingesetzt, wo sie für den Versatz nötig sind, und stehen immer an den Enden. Ohne innere Fugen (und damit ohne Versatzbedarf) sind nur `N = 2` und `N = 3`.
- **`buildable`** ist jetzt **strukturell** definiert (`= keine invalid_segments`). Fehlender Versatz bei reinen i3-Breiten blockiert die Baubarkeit nicht, wird aber in `validation` gemeldet.

### 3.2 Vorspannung — horizontal
- Stränge liegen auf dem Kammer-Lattice (Abschnitt 2).
- **Pflichtpositionen:** beide Wandenden (äußerste Kammer `k=0` und `k=N-1`) sowie je ein Strang unmittelbar **neben** jeder Öffnung (`k = g0-1` links, `k = g1` rechts).
- **Maximalabstand 375 mm (3 Raster):** innerhalb jedes durchgehenden Steinfelds. Über eine Öffnung hinweg gilt der Abstand nicht — dort tragen die flankierenden Stränge.
- Innerhalb der Grundfläche einer Öffnung verläuft kein Strang (vertikale Kontinuität unterbrochen).

### 3.3 Vorspannung — vertikal
- Pro Strang werden 1100-mm-Gewindestangen mit Verbindungsmuttern auf Wandhöhe gekoppelt: `Stangen = ⌈Höhe / 1100⌉`, `Verbindungsmuttern = Stangen − 1`. Die **letzte Stange wird abgelängt** (`letzte_stange_mm = Höhe − (Stangen−1)·1100`); der Rest ist Verschnitt und wird je Strang und gesamt (`bom.verschnitt_mm`) ausgewiesen.
- **Strukturelle Spannpunkte (Stahlplatten):** nur **oben und unten** je Strang (2 Platten).
- **Zwischenspannpunkte** (an den Kopplungen) dienen aktuell nur der **Lagesicherung während des Aufbaus** — handfest angezogen, nicht strukturell vorgespannt.

### 3.4 Öffnungen (Tür / Fenster)
- Breite rastet auf 125 mm, Höhe auf 200 mm (Lagenraster); Position ebenfalls aufs Raster gesnappt.
- **Sturz (vorläufig):** Der Bereich über der Öffnung wird mit normalen Steinlagen gefüllt; getragen wird er durch die beidseitig flankierenden Vorspannstränge. Sondersteine / eigene Sturzlösungen kommen später.

---

## 4. Datenmodell (Wandelement)

Serialisierung als JSON; Schema siehe `wandelement.schema.json`. Kernstruktur:

```
Wandelement
├─ length_mm, height_mm, grid_mm, course_mm, thickness_mm, rod_mm
├─ N_grid, lagen
├─ openings[]        { g0, g1 (Raster), l0, l1 (Lage), art }
├─ courses[]         { lage, stones[] {type,x0,x1}, joints_grid[] }
├─ tension_columns[] { k, x_mm, gewindestangen, verbindungsmuttern,
│                       stahlplatten_strukturell, spannmuttern }
├─ rod_overhang_mm
├─ bom               { i2, i3, gewindestangen, verbindungsmuttern, stahlplatten, spannmuttern }
└─ validation        { versatz_ok, versatz_violations[], tension_span_ok, rigid_lagen[] }
```

Die `bom` (Stückliste) und `validation` werden aus den Lagen/Strängen abgeleitet und sind damit für Modul 2–4 direkt nutzbar.

---

## 5. Referenzfälle (Test-Vertrag)

Programmatisch erzeugt und validiert (`sembla_core.py`). Diese Sollwerte sind der Vertrag, gegen den der Phase-1-Core getestet wird.

| Fall | Maße | Stränge (k) | Stangen | i2 / i3 | Versatz | Abstand |
|---|---|---|---|---|---|---|
| ref1 glatte Wand | 1000 × 2000 | 0,2,5,7 | 8 | 10 / 20 | ✓ | ✓ |
| ref2 Wand + Tür | 2000 × 2600 (Tür 750×2000) | 0,2,4,11,13,15 | 18 | 26 / 32 | ✓ | ✓ |
| ref3 Wand + Fenster | 2000 × 2600 (Fenster 500×1200, Brüstung 800) | 0,2,5,10,12,15 | 18 | 32 / 40 | ✓ | ✓ |

In ref2 sieht man die Pflichtstränge neben der Tür (k=4, k=11) und dass über die Türöffnung hinweg kein Strang liegt; in ref3 flankieren k=5 und k=10 das Fenster.

---

## 6. Offene Punkte / zu klären

**Entschieden / bestätigt:**
- ✓ **chamberOffset = 62,5 mm** entspricht der echten i2/i3-Geometrie (Kammer mittig im 125-mm-Modul). Kern-Invariante steht.
- ✓ **Starres Maß N = 4:** verboten (`buildable = false`), zusammen mit N = 1. Im realen Kontext nicht relevant.
- ✓ **Gewindestangen:** werden abgelängt; Verschnitt wird ausgewiesen (Abschnitt 3.3).

**Noch zu bestätigen (spätere Iteration):**
1. **Sturz-Traglogik** (über Öffnungen) ist aktuell „mit Steinen auffüllen". Sondersteine/echte Sturzlösung = spätere Iteration.
2. **Muttern-/Plattenanzahl** je Spannpunkt (Spannmuttern oben+unten = 2, Verbindungsmuttern = Stangen−1) als Annahme; mit Montage bestätigen.
3. **Ecke / mehrere Wände / 3D** bewusst ausgeklammert (spätere Phase). Im 2D-Einzelwandmodell ist die Ecke nur „Strang am Wandende", was bereits erfüllt ist.

---

## 7. Nächster Schritt — Phase 1 (Core, headless)

`sembla_core.py` ist bereits der lauffähige Kern: Tiling + Versatz, Vorspannung horizontal/vertikal, Öffnungen, Stückliste, Selbstvalidierung. Phase 1 härtet ihn zu einer getesteten, UI-freien Bibliothek: Unit-Tests gegen die obigen Referenzfälle, saubere API (`build_wall(...) → Wandelement`), Behandlung der offenen Punkte 1–5. Erst danach die UI in Modul 1.
