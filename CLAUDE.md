# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Sprache: Dieses Projekt ist durchgängig deutsch (Code-Kommentare, Doku, UI). Antworte auf Deutsch.

## Was das ist

SEMBLA Planungs-Suite — Werkzeuge zur Planung vorgespannter Trockenmauerwerkswände
(Steintypen **i2** = 25 cm, **i3** = 37,5 cm). Die Suite ist eine **gehostete Web-App** auf
**GitHub Pages**: live unter `https://p0lycare.github.io/SEMBLA-planning-suite/` (Deploy direkt vom
Branch `main`, Ordner `docs/`). Kein Build-Schritt, kein Server — jeder Push ist sofort live.

Die App besteht aus **7 Modulen (0–6)**, je eine eigenständige HTML-Seite in `docs/`. Gemeinsamer
Code liegt **einmal** in `docs/shared/` und wird per `<script type="module">` geladen. Einstieg ist
`docs/index.html` (Modul 0). Die Geschichte des Umbaus von der alten Single-File-Suite auf diesen
MVP steht in [`doku/REFACTOR.md`](doku/REFACTOR.md); der abgelöste Alt-Stand liegt in `legacy/`.

## Roter Faden (Datenfluss)

**Modul 1 (Wandplanung)** erzeugt das geprüfte **Wandelement** (JSON) — die *Single Source of Truth*.
Es lebt im **localStorage des Browsers** (Schicht `docs/shared/storage.js`). Genau **ein** aktives
Element ist gesetzt; **nur Modul 1 schreibt das Wandelement**, alle anderen Module lesen es.

**Nutzereingaben ↔ ein Datenmodell (kein Drift).** Neben dem Wandelement hält jeder Eintrag einen
`eingaben`-Block: `{ projekt, aufbau, kosten, statik }` (Standardwerte in `storage.standardEingaben()`).
Jedes Modul schreibt **nur seinen eigenen Abschnitt** via `store.mergeEingaben(teil, patch)` zurück —
Modul 0→`projekt` (Kopfdaten am aktiven Element), Modul 2→`aufbau`, Modul 4→`kosten`, Modul 3→`statik`. Abgeleitete Werte (Stückliste,
Layout, Nachweis) werden immer **neu gerechnet, nie gespeichert**. Modul 3 speichert nur seine Kennwerte;
die Geometrie (h/L/t/Öffnungszahl) **und der `wandtyp`** (Windsituation, `mit_wind`/`ohne_wind`) kommen
aus dem Wandelement. Der Wandtyp wird **in Modul 1** gewählt (Feld am Wandelement, von der Engine
angehängt, Default `mit_wind`); Modul 3 liest ihn nur (read-only) und persistiert ihn **nicht** in
`eingaben.statik`. Alt-Bundles mit gespeichertem `mitWind` werden ignoriert — das Wandelement gewinnt.

**Export/Import ist zentral** (Modul 0, `docs/index.html`): ein Häkchen-Dialog baut über
`sembla-export.js` die gewählten Dateien und packt sie via `zip.js` (STORE+CRC32, keine Lib) in ein ZIP.
Projekt-Datei = `{format:'SEMBLA-Projekt',version:2,name,wandelement,eingaben}` (`store.projektObjekt`);
der Import versteht v2 + Alt-Bundle. Die einzelnen Module haben **keine eigenen Datei-Buttons** mehr.

Das Wandelement stammt aus dem Core (`buildWall`): Länge/Höhe/Öffnungen → Tiling (i3-maximal),
Vorspannstränge (segmentiert), BOM/Stückliste. Einheiten: **mm**. `grid` = Rastereinheit (125 mm),
`lage`/`course` = Lagenindex (200 mm).

## Zentrale Architektur-Regeln

1. **Ein Core, eine Betriebskopie.** `docs/shared/sembla-core.js` (ES-Modul) ist der einzige
   Rechenkern im Betrieb — er läuft im Browser *und* wird von den Node-Tests per `import` geladen.
   `tests/core/sembla_core.py` (Python) ist **nur Test-Referenz/Orakel**, bit-genau paritätisch
   (round-half-to-even via `pyRound`), geprüft gegen goldene Fixtures. Rechenlogik ändern heißt:
   **beide** Cores gleich halten, Fixtures ggf. neu einfrieren, **beide** Paritätstests fahren.

2. **Kein Build-System.** Die Module sind **handgepflegte Einzeldateien** in `docs/` (kein
   `build-*.mjs`, kein `publish-*.mjs`, kein Kopieren/Drift). Shared-Code wird per
   `<script type="module">` importiert. Damit die App-Logik **ohne Modulauflösung testbar** bleibt,
   liegt sie im klassischen `<script>` und bezieht den Shared-Code über ein injiziertes
   `window.SEMBLA = { … }` (das Modul-Skript importiert und setzt es, dann `mountNavbar(nr)` +
   `__init()`). Muster siehe jedes Modul in `docs/`.

3. **shared/-Regel: eigene Datei nur bei (a) ≥ 2 nutzenden Modulen oder (b) eigenen Tests** — sonst
   inline ins Modul. Deshalb liegen in `docs/shared/`:
   - `sembla-core.js` — Rechenkern (Tiling, Stränge, BOM, Validierung).
   - `sembla-engine.js` — Auslegungs-Iteration (optimiert Strangabstand + Vorspannkraft N) plus ein
     **vereinfachtes** Nachweismodell (Biegung/Randdruck/Schub) — getrennt von der Schermer-Statik.
   - `sembla-statik.js` — **voller Schermer-Nachweis** (Modul 3).
   - `sembla-bom.js` — Stücklisten-Baustein (kanonische Mengen/Positionen, Modul 4/5).
   - `sembla-aufbau.js` — horizontaler Wandaufbau (`berechneAufbau`, Verbinderachsen/Latten; Modul 2, DOM-frei).
   - `sembla-ifc.js` — IFC4-Export (`wandelementToIfc` + `parseObj`/`meshStats`; genutzt vom zentralen Export).
   - `sembla-export.js` — baut die Export-Dateien (Stückliste/Zuschnitt-CSV, Montage-HTML, IFC-Text) für Modul 0.
   - `zip.js` — `zipSync`/`downloadZip` (STORE+CRC32, ohne Fremd-Lib) für den zentralen ZIP-Export.
   - `storage.js` — localStorage-Schicht (Elemente, aktiv-Zeiger, **`eingaben`-Modell**, OBJ-Geometrie, Import/Export).
   - `navbar.js` — gemeinsame Kopfleiste (Reiter 0–6 + aktives Wandelement).

   `engine`/`statik`/`bom`/`aufbau`/`ifc`/`export`/`zip` sind eigene Dateien **wegen eigener Tests bzw.
   mehrerer Nutzer** (Regeln a/b). Reine Modul-Zeichen-/Rechenlogik mit nur einem Nutzer bleibt **inline**
   im jeweiligen HTML.

4. **Module bleiben rein/einbahnig.** Nur **Modul 1** schreibt das Wandelement; alle anderen lesen es.
   Nur `sembla-engine.js` kennt die Auslegungs-Iterationsschleife. Materialkennwerte (`fcd`, `cfd`,
   `rho`) sind Platzhalter, vom Statiker zu bestätigen.

## Module (Datei in `docs/` → Inhalt)

| Nr. | Datei | Inhalt |
|---|---|---|
| 0 | `index.html` | Einstieg, Modulübersicht, Storage-Manager + **zentraler Export/Import** (Häkchen-Dialog → ZIP via `sembla-export.js`/`zip.js`); **Projekt-Kopfdaten** des aktiven Elements → `eingaben.projekt` |
| 1 | `wandplanung.html` | Wand, Öffnungen, Durchbrüche, Staffelung, Seiten, **Wandtyp** (Windsituation), Auslegung (+ `sembla-engine.js`) — **erzeugt** das Wandelement (inkl. `wandtyp`) |
| 2 | `wandaufbau.html` | Horizontaler Wandaufbau: Verbinderachsen + Latten-Zuschnitt (`sembla-aufbau.js`, **ohne Dämmung**); Eingaben → `eingaben.aufbau` |
| 3 | `statik.html` | Statischer Nachweis (voller Schermer-Nachweis, `sembla-statik.js`); Kennwerte → `eingaben.statik`, Geometrie aus dem Wandelement |
| 4 | `stueckliste.html` | Stückliste & Kosten (`sembla-bom.js`); Preise/Anzahl → `eingaben.kosten` (Export läuft zentral über Modul 0) |
| 5 | `montage.html` | Montageanleitung (lagenweise, Vorspann-Schritte, druckbar) |
| 6 | `ifc-3d.html` | **Experimentell:** Three.js-3D-Vorschau + OBJ-Upload (IFC4-Export läuft zentral über Modul 0) |

**Bauteilgeometrie (i2/i3):** Die realen OBJ/IFC-Modelle liegen **nicht** im Repo (vertraulich,
öffentliches Repo). `Bauteil-OBJ/` ist gitignored und nur lokal vorhanden. Modul 6 bettet die
Geometrie nicht ein, sondern lädt sie zur Laufzeit per Datei-Upload (lokal im Browser); sie wird über
`storage.js` in `localStorage` (`sembla:obj:i2` / `:i3`) gemerkt. Der OBJ-Loader ist **inline** in
Modul 6. Die realen Modelle kommen **ausschließlich** über diesen manuellen Browser-Import — nie über
Tests. **Node-Smoke-Tests sind autark und lesen keine Dateien aus `Bauteil-OBJ/`**: Wo OBJ-Geometrie
gebraucht wird (`tests/module/smoke_3d.mjs`), definiert der Test eine minimale synthetische OBJ-Zeichenkette
inline. So läuft `npm run test:all` auch in einer sauberen Arbeitskopie ohne die vertraulichen Modelle grün.

**Externe Laufzeit-Abhängigkeiten (nur online, degradieren sauber):** `ifc-3d.html` lädt Three.js (CDN)
für die 3D-Ansicht (ohne Internet zeigt es einen Hinweis, alles andere läuft weiter). Der ZIP-Export
kommt ohne Fremd-Lib aus (`zip.js`); web-ifc/xlsx-CDNs werden im Betrieb **nicht** mehr geladen (web-ifc
nur noch in `tests/interop`).

## Häufige Befehle

```bash
npm install                       # JS-Abhängigkeiten (docx für Handbuch, web-ifc für Tests)
pip install ezdxf ifcopenshell --break-system-packages   # optional, nur für tests/interop
npm run handbuch                  # doku/SEMBLA_Handbuch.docx neu bauen (build-handbuch.mjs)
```

Es gibt **keinen** Build-/Publish-Schritt für die App — `docs/` wird direkt editiert und ist live.

### Tests (laufen nie beim Nutzer — Handdisziplin, kein CI-Gate)

```bash
npm run test:core                 # Core-Parität (py + mjs) + BOM-Drift (test-shared.mjs) — die wichtigsten
npm run test:modul1               # … bis test:modul6: Logik-/Smoke-Tests je Modul (tests/module/)
npm run test:all                  # Core + alle Modultests + Storage-Smoke in einem Rutsch
npm run test:interop              # tests/interop/: Python-DXF/IFC-Referenz + web-ifc-Validierung (Orakel Modul 6)
```

- `tests/core/` — Python-Referenz + Paritätstests (py/mjs) + Fixtures.
- `tests/module/` — Logik- (`test-*.mjs`) und Smoke-Tests (`smoke_*.mjs`) je Modul, laufen gegen `docs/`.
- `tests/interop/` — DXF/IFC-Referenz (ezdxf/ifcopenshell) + web-ifc-Validierung des IFC-Exports.
- `test-shared.mjs` (Repo-Wurzel) — BOM-Drift-Schutz: vergleicht `sembla-bom.js` mit der Core-BOM.

Nach Core-Änderungen mindestens `npm run test:core` fahren; vor jedem Push, der Rechenlogik berührt,
zusätzlich die betroffenen Modultests.

## Wichtige Randbedingungen

- ⚠️ **Dieses Repo ist ÖFFENTLICH** (`github.com/p0lycare/SEMBLA-planning-suite`). Alles Committete/
  Gepushte ist sofort für jeden sichtbar — und bleibt es (Caches, Klone, Forks) auch nach späterem
  Löschen. Jeder Push ist zudem sofort live (GH Pages).
- **Mit sensiblen Daten äußerst vorsichtig sein.** Vor jedem `git add`/Commit prüfen, ob vertrauliche
  Inhalte betroffen sind. Nicht committen: das nicht öffentliche **Gutachten Prof. Schermer** und daraus
  abgeleitete Prüf-/Materialwerte, Zugangsdaten/Tokens, personenbezogene Daten, interne PDFs, sowie die
  reale **Bauteilgeometrie** (`Bauteil-OBJ/`). Im Zweifel **erst nachfragen**, nicht committen.
- `Uploads/` und `Bauteil-OBJ/` sind per `.gitignore` ausgeschlossen — nie tracken. Die Historie wurde
  am 2026-07-13 bereinigt (vertrauliches PDF via `git-filter-repo` entfernt).
- **Hinweis Handbuch:** `doku/SEMBLA_Handbuch.docx` reproduziert Werte/Formeln aus dem Schermer-Gutachten
  und liegt bewusst öffentlich im Repo — bei Änderungen im Blick behalten, ob Vertrauliches hinzukommt.
- **Nicht im OneDrive-/SharePoint-Ordner arbeiten** (beschädigt `.git`). Lokaler Klon ist die Arbeitskopie.
- **OSS-Lizenzen gemischt** (web-ifc MPL-2.0, docx/ezdxf MIT, IfcOpenShell LGPL) — vor Weitergabe/
  Produktisierung juristisch prüfen.
