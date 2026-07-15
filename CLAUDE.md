# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Sprache: Dieses Projekt ist durchgängig deutsch (Code-Kommentare, Doku, UI). Antworte auf Deutsch.

> ## 🚧 UMBAU IM GANG (seit 2026-07-14) — zuerst lesen
> Die Suite wird auf eine gehostete **Minimalversion (MVP)** umgebaut. **Verbindlicher Plan:
> [`doku/REFACTOR.md`](doku/REFACTOR.md)** — dort stehen Zielbild, Modul-Zuordnung, Session-Plan
> und Fortschritt. Kernpunkte: GitHub Pages (Ordner `docs/`), Module als getrennte Dateien mit
> gemeinsamem `docs/shared/`, **das alte Build-System entfällt** (`build-*.mjs`, `publish-werkzeuge.mjs`,
> `sync-shared.mjs` → nach `legacy/`), Wandelement lebt im **localStorage**. Der doppelte Python-Boden
> bleibt als Test-Strategie. **Vieles unten beschreibt noch den ALTEN Zustand** — es gilt für die
> noch nicht migrierten Modul-Ordner, bis sie in ihrer Session umgebaut sind. Diese Datei bekommt
> ihre finale, schlanke Fassung in Session 9.
>
> **Übergangszustand nach Session 2 (Plumbing):**
> - `docs/` ist **die App** (GH Pages, Deploy `main`/`docs`): `index.html` (Modul 0 mit Storage-Manager),
>   `wandplanung.html` (Modul 1) + `wandaufbau.html` (Modul 2, fertig umgebaut — Dämmung entfernt,
>   reiner Konsument des aktiven Wandelements) + `statik.html` (Modul 3, fertig umgebaut — voller
>   Schermer-Nachweis, reiner Konsument: Geometrie/Öffnungen aus aktivem Wandelement) + `stueckliste.html`
>   (Modul 4, fertig umgebaut — Mengen aus aktivem Wandelement, reiner Konsument; Verbinder/Latten aus
>   Projekt-Bundle per Datei) + `montage.html` (Modul 5, fertig umgebaut — lagenweise Aufbauanleitung +
>   Vorspann-Schritte + druckbares Dokument, reiner Konsument; Kurz-Stückliste aus `sembla-bom.js`) +
>   Platzhalterseite `ifc-3d.html` (Modul 6, wird in Session 8 gefüllt).
>   Gemeinsamer Code in `docs/shared/`: `sembla-core.js` (einzige Betriebskopie des JS-Cores, **ES-Modul**),
>   `sembla-engine.js` (Auslegungs-Iteration + vereinfachtes Nachweismodell Biegung/Randdruck/Schub —
>   getrennt von der Schermer-Statik), `sembla-statik.js` (voller Schermer-Nachweis Modul 3,
>   ES-Modul, eigene Tests), `sembla-bom.js` (Stücklisten-Baustein Modul 4 — kanonische Mengen/Positionen,
>   ES-Modul, eigene Tests; löst `sembla-shared.js` ab), `storage.js` (localStorage-Schicht),
>   `navbar.js` (Kopfleiste). Einbindung per `<script type="module">`. Module ohne Modulauflösung
>   testbar: App-Logik im klassischen `<script>`, Shared-Code wird via `window.SEMBLA` injiziert.
> - `tests/` ← `core/` (Python-Referenz `sembla_core.py` + Paritätstests py/mjs + Fixtures),
>   `interop/` (ehem. `Interop-CAD`), `module/` (`smoke_storage.mjs`, `test-engine.mjs`, `smoke_wp.mjs`,
>   `smoke_wandaufbau.mjs`, `test-statik.mjs`, `smoke_statik.mjs`, `smoke_stueckliste.mjs`,
>   `smoke_montage.mjs`; weitere Modul-Tests folgen je Session). BOM-Drift-Schutz `test-shared.mjs` (Repo-Wurzel) prüft `sembla-bom.js`
>   gegen die Core-BOM.
> - `legacy/` ← `_archiv`, `Revit-pyRevit`, `EtappeA-App-beta-sandbox`, `Modul-Roboter`,
>   `Modul-Fertigung`, `Projekt-Manager`, `SEMBLA Werkzeuge` (altes Build-Produkt),
>   `publish-werkzeuge.mjs`, `sync-shared.mjs`, `sembla-shared.js` (Session 6 durch `sembla-bom.js` abgelöst),
>   `Modul-1-Wandplanung`, `Auslegung-Engine`
>   (Session 3 abgelöst), `Modul-Wandaufbau` (Session 4 abgelöst), `Modul-3-Statik`
>   (Session 5 abgelöst), `Modul-Stueckliste` (Session 6 abgelöst), `Modul-4-Montageplanung`
>   (Session 7 abgelöst). Rückholbar; nicht Teil des MVP.
> - `doku/` ← Handbuch, OSS-Matrix, Prozess-Grafiken, `_LIESMICH.md`, `GIT-SETUP.md`, `REFACTOR.md`.
> - **Noch am alten Platz** (bis zu ihrer Modul-Session): der aktive Modul-Ordner
>   `Modul-3D/` sowie `sembla-obj-loader.js`, `SEMBLA_Uebersicht.html`. Ihre Core-Importe zeigen bereits auf
>   `docs/shared/sembla-core.js`; ihre Tests laufen wie bisher aus dem jeweiligen Ordner.

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

2. **Kern + Template → gebaute HTML.** Tools mit `<Modul>/build-*.mjs` werden **nicht von Hand
   editiert, sondern gebaut**: das Skript liest den aktuellen Core (`../Phase-2/sembla-core.mjs`),
   Modul-Kern (`sembla-*.mjs`) und `*.template.html`, ersetzt Platzhalter (`/*__CORE__*/`, `/*__CAD__*/`,
   `/*__OBJLOADER__*/`, `<!--__OBJ__-->`), schreibt die Single-File-HTML und prüft die Syntax
   (`node --check`). **Nie die veraltete lokale Core-Kopie einbetten** — immer den Core aus `Phase-2/` ziehen.
   - **Ausnahme:** Tools **ohne** `build-*.mjs` (v. a. `Modul-3D/SEMBLA_3D_Vorschau.html`) werden direkt
     als HTML gepflegt. Dort eingebettete Single-Source-Bausteine (z. B. der OBJ-Loader) müssen bei
     Änderungen von Hand mit der Quelle (`sembla-obj-loader.js`) synchron gehalten werden.
   - Nach jeder Tool-Änderung `node publish-werkzeuge.mjs` laufen lassen (spiegelt nach `SEMBLA Werkzeuge/`).

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

# ⚠️ ALTES Build-System (wird abgelöst, liegt in legacy/): publish-werkzeuge.mjs, sync-shared.mjs,
#    <Modul>/build-*.mjs. Für noch nicht migrierte Module gilt es übergangsweise weiter, aber es
#    wird KEIN neues Tool mehr damit gebaut. Ziel: getrennte Dateien in docs/ + docs/shared/.

npm run handbuch                  # doku/SEMBLA_Handbuch.docx neu bauen (build-handbuch.mjs)
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
npm run test:core                 # beide Core-Paritätstests + BOM-Drift (die wichtigsten)
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
