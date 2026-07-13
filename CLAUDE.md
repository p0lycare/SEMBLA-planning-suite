# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Sprache: Dieses Projekt ist durchgängig deutsch (Code-Kommentare, Doku, UI). Antworte auf Deutsch.

## Was das ist

SEMBLA Planungs-Suite — Werkzeuge zur Planung vorgespannter Trockenmauerwerkswände
(Steintypen **i2** = 25 cm, **i3** = 37,5 cm). Endprodukt sind **build-freie Single-File-HTML-Tools**,
die per Doppelklick ohne Server laufen. Endnutzer (Planer/Architekten) öffnen ausschließlich
`SEMBLA Werkzeuge/00_Übersicht.html` — den nummerierten Einstiegspunkt (Werkzeuge 1–9).

## Roter Faden (Datenfluss)

**Modul 1 (Wandplanung)** erzeugt das geprüfte **Wandelement** (JSON) — die *Single Source of Truth*.
Alle anderen Module lesen genau dieses Element. Das Wandelement stammt aus dem Core (`buildWall`):
Länge/Höhe/Öffnungen → Tiling (i3-maximal), Vorspannstränge (segmentiert), BOM/Stückliste.

Einheiten: **mm**. `grid` = Rastereinheit (125 mm), `lage`/`course` = Lagenindex (200 mm).

## Zentrale Architektur-Regeln

1. **Core ist doppelt implementiert und bit-genau paritätisch.**
   - `Phase-1/sembla_core.py` = Referenz-Implementierung (Python).
   - `Phase-2/sembla-core.mjs` = Vanilla-JS-Portierung, muss bit-genau identisch zum Python-Core sein
     (round-half-to-even via `pyRound`). Paritätstests laufen gegen goldene Fixtures.
   - Änderungen an der Rechenlogik **immer in beiden** Cores gleich halten.

2. **Kern + Template → gebaute HTML.** Tools werden nicht von Hand editiert, sondern gebaut:
   `<Modul>/build-*.mjs` liest den aktuellen Core (`../Phase-2/sembla-core.mjs`), Modul-Kern
   (`sembla-*.mjs`) und `*.template.html`, ersetzt Platzhalter (`/*__CORE__*/`, `<!--__OBJ__-->` etc.),
   schreibt die Single-File-HTML und prüft die Syntax (`node --check`).
   **Nie die veraltete lokale Core-Kopie einbetten** — immer den Core aus `Phase-2/` ziehen.

3. **`sembla-shared.js` ist Single Source für die Stückliste/BOM.** NICHT direkt in den Tools editieren.
   `sync-shared.mjs` verteilt den Block zwischen `//__SEMBLA_SHARED_START__` und `//__SEMBLA_SHARED_END__`
   in die Zieltools (Stückliste, Fertigung). `test-shared.mjs` schützt gegen Drift, indem es
   `semblaBom()` mit der Core-BOM vergleicht.

4. **Module bleiben rein/einbahnig.** Nur die `Auslegung-Engine/sembla-engine.mjs` kennt die
   Statik-Iterationsschleife (optimiert Strangabstand + Vorspannkraft N gegen die Nachweise aus
   `Modul-3-Statik`). Materialkennwerte (`fcd`, `cfd`, `rho`) sind Platzhalter, vom Statiker zu bestätigen.

## Ordnerstruktur (Module → publizierte Nummer)

| Quelle | publiziert als (`SEMBLA Werkzeuge/`) |
|---|---|
| `Modul-1-Wandplanung/` | 1 Wand-Planung & Auslegung |
| `Modul-Wandaufbau/` | 2 Horizontaler Wandaufbau (Verbinder + Latten/Dämmung) |
| `Modul-4-Montageplanung/` | 3 Montageplanung |
| `Modul-Roboter/` | 4 Roboter-Export |
| `Projekt-Manager/` | 5 Projekt-Manager (DXF/IFC) |
| `Modul-3-Statik/` | 6 Statik-Anschlüsse |
| `Modul-3D/` | 7 3D-Vorschau |
| `Modul-Stueckliste/` | 8 Stückliste & Kosten |
| `Modul-Fertigung/` | 9 Fertigungszeichnung |

Weitere: `Interop-CAD/` (DXF/IFC-Export, Python + web-ifc), `EtappeA-App-beta-sandbox/` (isolierter
Experimentierstand für die durchgängige Web-App — **nicht produktiv**), `_archiv/` (abgelöste Stände).

**Bauteilgeometrie (i2/i3):** Die realen OBJ/IFC-Modelle liegen NICHT mehr im Repo (vertraulich,
öffentliches Repo). Der Ordner `Bauteil-OBJ/` ist gitignored und nur lokal vorhanden. Die Werkzeuge
**Modul-3D** und **Projekt-Manager** betten die Geometrie nicht mehr ein, sondern laden sie zur
Laufzeit per Datei-Upload (lokal im Browser, in `localStorage` gemerkt). Der Loader ist Single Source
in `sembla-obj-loader.js` (inline in Modul-3D gepflegt, in den Projekt-Manager via `build-manager.mjs`
eingebettet). Die leeren Blöcke `<script id="obj-i2/i3">` bleiben erhalten. Lokale Builds/Smoke-Tests
lesen die OBJ weiterhin aus `Bauteil-OBJ/`.

Hinweis: Ordner `SEMBLA Tools/` (falls vorhanden) ist veraltet; maßgeblich ist nur `SEMBLA Werkzeuge/`.

## Häufige Befehle

```bash
npm install                       # docx + web-ifc (JS-Abhängigkeiten)
pip install ezdxf ifcopenshell --break-system-packages   # Python-Interop (optional)

# Nach JEDER Änderung an einem Tool: alle HTMLs in "SEMBLA Werkzeuge/" spiegeln
# (läuft intern zuerst sync-shared.mjs → verhindert Dev/Endnutzer-Drift)
node publish-werkzeuge.mjs        # oder: npm run publish

npm run handbuch                  # SEMBLA_Handbuch.docx neu bauen (build-handbuch.mjs)

# Einzelnes Tool neu bauen:
node <Modul>/build-*.mjs          # z.B. node Projekt-Manager/build-manager.mjs
node sync-shared.mjs              # nur BOM-Baustein neu verteilen
```

### Tests

```bash
# Core-Parität (die wichtigsten Tests):
python3 Phase-1/test_sembla_core.py
node Phase-2/test-sembla-core.mjs
node test-shared.mjs              # BOM-Drift-Schutz

# Pro Modul: test-*.mjs (Logik) und smoke_*.mjs (Rendering/Integration)
node <Modul>/test-*.mjs
node <Modul>/smoke_*.mjs
node Auslegung-Engine/test-engine.mjs

# npm-Shortcuts:
npm run test:statik               # Modul-3-Statik test + smoke
npm run test:interop              # Interop-CAD (Python DXF/IFC + web-ifc)
```

Es gibt kein einzelnes Gesamt-Testkommando — Tests laufen pro Modul. Nach Core-Änderungen
mindestens beide Core-Paritätstests + `test-shared.mjs` fahren.

## Wichtige Randbedingungen

- ⚠️ **Dieses Repo ist ÖFFENTLICH** (`github.com/p0lycare/SEMBLA-planning-suite`, Stand 2026-07-13).
  Alles, was committet/gepusht wird, ist sofort für jeden sichtbar — und bleibt es (Caches, Klone,
  Forks) auch nach späterem Löschen.
- **Mit sensiblen Daten äußerst vorsichtig sein.** Vor jedem `git add`/Commit prüfen, ob vertrauliche
  Inhalte betroffen sind. Nicht committen: das nicht öffentliche **Gutachten Prof. Schermer** und daraus
  abgeleitete Prüf-/Materialwerte, Zugangsdaten/Tokens, personenbezogene Daten, interne PDFs/Dokumente.
  Im Zweifel **erst nachfragen**, nicht committen.
- `Uploads/` ist per `.gitignore` ausgeschlossen (enthält vertrauliches PDF) — Ordner nie tracken.
  Historie wurde am 2026-07-13 bereinigt (PDF via `git-filter-repo` entfernt).
- **Hinweis Handbuch:** `SEMBLA_Handbuch.docx` (+ Kopie in `SEMBLA Werkzeuge/`) reproduziert Werte/
  Formeln aus dem Schermer-Gutachten und liegt aktuell bewusst öffentlich im Repo — bei Änderungen
  im Blick behalten, ob Vertrauliches hinzukommt.
- **Nicht im OneDrive-/SharePoint-Ordner arbeiten** (beschädigt `.git`). Lokaler Klon ist die Arbeitskopie.
- **OSS-Lizenzen gemischt** (web-ifc MPL-2.0, docx/ezdxf MIT, IfcOpenShell LGPL) — vor Weitergabe/
  Produktisierung juristisch prüfen.
