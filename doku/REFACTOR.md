# SEMBLA Refactor — Minimalversion (MVP)

Stand: 2026-07-14 · Verantwortlich: Tibor · Status: **Entwurf, zur Freigabe**

Dieses Dokument ist der verbindliche Plan für den Umbau der SEMBLA-Planungs-Suite auf eine
gehostete Minimalversion. Es wird bei jeder Session fortgeschrieben (Abschnitt "Fortschritt").

---

## 1. Zielbild in fünf Sätzen

1. Die Suite wird über **GitHub Pages** gehostet (Deploy direkt vom Branch `main`, Ordner `docs/`)
   und besteht aus **7 Modulen (0–6)** — je eine eigenständige HTML-Seite.
2. Das **Wandelement (JSON)** bleibt die Single Source of Truth. Es liegt im **localStorage des
   Browsers**; alle Module lesen/schreiben dasselbe aktive Element. Datei-Export/-Import bleibt
   als bewusste Aktion erhalten (Sichern, Weitergeben) — nicht mehr als ständiges Transportmittel.
3. Das bisherige **Bau-System entfällt komplett** (build-*.mjs, publish-werkzeuge.mjs,
   sync-shared.mjs, Platzhalter, gebauter Zweitordner `SEMBLA Werkzeuge/`). Gemeinsamer Code liegt
   **einmal** in `docs/shared/` und wird von den Modulen per `<script>` geladen. Kein Kopieren,
   kein Drift, kein Drift-Wächter.
4. Der **doppelte Python-Boden bleibt** als Test-Strategie: `sembla_core.py` ist Referenz
   (Test-Orakel), der JS-Core wird gegen goldene Fixtures geprüft. Tests laufen manuell auf dem
   Entwickler-Rechner (kein CI-Gate — bewusste Entscheidung, später nachrüstbar).
5. Umbau erfolgt **Session-weise, Modul für Modul** (Abschnitt 7). Alte Modulordner bleiben
   funktionsfähig liegen, bis ihr Nachfolger live ist — erst dann wandern sie nach `legacy/`.

## 2. Entschieden (mit Begründung)

| Entscheidung | Begründung |
|---|---|
| Hosting: GH Pages, Deploy direkt vom Branch (`main` / `docs/`) | Einfachster Weg; kein Build, kein CI. Jeder Push ist sofort live → Tests sind Handdisziplin. |
| Ordnername `docs/` (nicht `src/`) | GitHub-Zwang: Branch-Deploy kann nur `/` oder `/docs` ausliefern. Falls der Name dauerhaft stört: Wechsel auf Actions-Deploy erlaubt freie Namen, ohne sonstigen Umbau. |
| Multi-File statt Single-File-HTML | Der einzige Grund für Single-File war der `file://`-Doppelklick. Gehostet dürfen Module gemeinsame Dateien laden → gesamtes Bau-System entfällt. |
| Kein iframe; gemeinsame Kopfleiste als `shared/navbar.js` | iframes: Zurück-Button/Verlinkung/Mobil problematisch. localStorage überlebt Seitenwechsel ohnehin — kein stehender Rahmen nötig. Leiste = 1 Datei, 1 Zeile pro Modul. |
| Zustand im localStorage; Datei-Export bleibt Pflichtfunktion | localStorage ist pro Browser+Gerät und weg bei "Websitedaten löschen" → Export = Sicherung/Austausch. |
| 3D-Vorschau wird Teil von Modul 6 (mit IFC) | Beide brauchen dieselbe Geometrie; ein experimentelles Modul statt zwei. |
| Python-Interop (ezdxf/ifcopenshell) → `tests/interop/` | Kein Betriebscode (Browser nutzt JS/web-ifc), sondern Prüf-Orakel für Modul 6. |
| Revit-Plugin, Roboter, Fertigung, Projekt-Manager, EtappeA-Sandbox → `legacy/` | Nicht Teil des MVP. Rückholbar. |
| Dämmung fliegt aus Modul 2 (Wandaufbau) heraus | MVP-Entscheidung Tibor. |
| shared/-Regel | Eigene Datei nur bei (a) ≥ 2 nutzenden Modulen oder (b) eigenen Tests. Sonst inline ins Modul. (Deshalb: OBJ-Loader inline in Modul 6; Engine als Datei, weil eigene Tests.) |

### Bewusst in Kauf genommen
- **Doppelklick-offline ist kein unterstützter Weg mehr.** Gehostete Seite ist der offizielle
  Betrieb; `file://` funktioniert ggf. eingeschränkt, ohne Gewähr.
- **Kein automatisches Test-Gate.** Vor jedem Push: Paritäts- und Modultests von Hand fahren.
- **Repo ist öffentlich.** Wie bisher: keine vertrauliche Geometrie (OBJ/IFC) und keine
  Schermer-Werte committen. Geometrie kommt zur Laufzeit per Upload und bleibt im localStorage.

## 3. Module (neue Nummerierung = Nutzungsreihenfolge)

| Nr. | Datei (`docs/`) | Inhalt | Quelle (heute) |
|---|---|---|---|
| 0 | `index.html` | Einstieg, Modulbeschreibung, Navigation, Storage-Manager | `SEMBLA_Uebersicht.html` / `00_Übersicht.html` |
| 1 | `wandplanung.html` | Wand, Öffnungen, Spannelemente, Auslegung | `Modul-1-Wandplanung/` + `Auslegung-Engine/` |
| 2 | `wandaufbau.html` | Lattung + Verbinderpositionen (**ohne Dämmung**) | `Modul-Wandaufbau/` |
| 3 | `statik.html` | Statischer Nachweis (wie gehabt) | `Modul-3-Statik/` |
| 4 | `stueckliste.html` | Stückliste generieren + exportieren | `Modul-Stueckliste/` |
| 5 | `montage.html` | Montageanleitung | `Modul-4-Montageplanung/` |
| 6 | `ifc-3d.html` | **Experimentell:** 3D-Vorschau + IFC-Viewer/-Export; OBJ-Upload → localStorage | `Modul-3D/` + IFC-Teile aus `Projekt-Manager/` + `Interop-CAD/webifc_*` |

Jedes Modul bindet ein: `shared/navbar.js` (Kopfleiste: Reiter 0–6 + aktives Wandelement),
`shared/storage.js`, `shared/sembla-core.js` (sofern rechnend).

## 4. Ziel-Ordnerstruktur

```
SEMBLA-planning-suite/
├── CLAUDE.md                  # zentraler Projekt-Überblick (wird neu geschrieben)
├── README.md
├── docs/                      # DIE APP — GH Pages serviert genau diesen Ordner
│   ├── index.html … ifc-3d.html          (Module 0–6, siehe Tabelle)
│   └── shared/
│       ├── sembla-core.js     # JS-Rechenkern — einzige Betriebskopie (aus Phase-2/sembla-core.mjs)
│       ├── sembla-engine.js   # Auslegungs-Iteration (eigene Tests → eigene Datei)
│       ├── sembla-bom.js      # Stücklisten-Baustein (aus sembla-shared.js)
│       ├── navbar.js          # Kopfleiste
│       └── storage.js         # localStorage-Schicht (Elemente, aktiv-Zeiger, OBJ, Manager)
├── tests/                     # läuft NIE beim Nutzer
│   ├── core/                  # sembla_core.py (Referenz), fixtures/, Paritätstests (py + mjs)
│   ├── interop/               # ezdxf/ifcopenshell-Referenz + web-ifc-Validierung (Orakel Modul 6)
│   └── module/                # test-/smoke-Skripte je Modul
├── doku/                      # dieses Dokument, Handbuch, Grafiken
└── legacy/                    # Abgelöstes: _archiv, Roboter, Fertigung, Projekt-Manager-Rest,
                               # Revit-pyRevit, EtappeA-Sandbox, Bau-System, alte Modulordner
```

## 5. localStorage-Schema (Entwurf — Detail in Session 2)

| Schlüssel | Inhalt |
|---|---|
| `sembla:elemente` | Liste gespeicherter Wandelemente: `{ id: { name, wandelement, geändert } }` |
| `sembla:aktiv` | id des aktiven Elements — **nur dieses lesen die Module** |
| `sembla:obj:i2`, `sembla:obj:i3` | hochgeladene Bauteilgeometrie (bleibt nach Upload erhalten) |

Regeln: Module ändern nie fremde Elemente, nur das aktive. Kopfleiste zeigt das aktive Element
und erlaubt Wechsel/Neu/Import. Storage-Manager (in Modul 0): auflisten, exportieren, löschen.
OBJ-Größen geprüft: ~180–260 KB je Stein → localStorage-Limit (~5 MB) unkritisch.

## 6. Test-Strategie (unverändertes Prinzip, neue Orte)

- `tests/core/`: Python-Referenz rechnet die goldenen Fixtures; JS-Core wird per
  `deepEqual` dagegen geprüft (round-half-to-even/`pyRound` bleibt!). Nach jeder
  Core-Änderung: **beide** Cores gleich ändern, Fixtures ggf. neu einfrieren, beide Tests fahren.
- `tests/module/`: Logik- und Smoke-Tests je Modul, laufen mit Node gegen die Dateien in `docs/`.
- `tests/interop/`: Python erzeugt Referenz-DXF/IFC und liest Browser-Erzeugnisse gegen
  (Round-Trip) — Prüf-Orakel für Modul 6.
- Vor jedem Push, der Rechenlogik berührt: `tests/core` (beide) + betroffene Modultests. Handdisziplin.

## 7. Vorgehen: Sessions, Modul für Modul

Prinzip: **Ein Modul pro Session.** Jede Session endet mit lauffähigem Stand, gefahrenen Tests
und einem Commit. Der alte Modulordner wandert erst nach `legacy/`, wenn der Nachfolger live
funktioniert. Dieses Dokument wird am Session-Ende fortgeschrieben (Fortschritt, Abschnitt 8).

| Session | Inhalt | Fertig, wenn … |
|---|---|---|
| **1 — Aufräumen** | Ordner `docs/ tests/ doku/ legacy/` anlegen; Abgelöstes nach `legacy/`; Tests/Fixtures nach `tests/`; Doku nach `doku/`; CLAUDE.md neu (Zielbild + Übergangszustand); README aktualisieren | Repo hat Zielstruktur; Paritätstests laufen an neuem Ort grün |
| **2 — Plumbing** | `docs/shared/` aufbauen: Core übernehmen, `storage.js` + `navbar.js` schreiben; Modul 0 (`index.html`) mit Storage-Manager; GH Pages aktivieren | Seite ist live erreichbar; Wandelement anlegen/wählen/exportieren/importieren funktioniert |
| **3 — Modul 1** | Wandplanung (+ Engine) auf shared-Architektur umbauen; liest/schreibt aktives Element | Modul 1 live; Paritäts- + Modultests grün; alter Ordner → legacy |
| **4 — Modul 2** | Wandaufbau umbauen, **Dämmung entfernen** | dito |
| **5 — Modul 3** | Statik umbauen | dito |
| **6 — Modul 4** | Stückliste umbauen (BOM-Baustein aus `shared/sembla-bom.js`) | dito |
| **7 — Modul 5** | Montageanleitung umbauen | dito |
| **8 — Modul 6** | Experimentell: 3D + IFC zusammenführen; OBJ-Upload → localStorage; OBJ-Loader inline | dito; gegen `tests/interop/` geprüft |
| **9 — Abschluss** | Restaufräumen, package.json/Skripte bereinigen, CLAUDE.md final, Handbuch-Abgleich | keine toten Pfade; CLAUDE.md beschreibt nur noch den neuen Zustand |

## 8. Fortschritt

**Verfeinerung während Session 1 (2026-07-14):** Sehr viele Dateien (Modul-Tests, `test-shared.mjs`,
`Auslegung-Engine`) zeigen per relativem Pfad auf `Phase-2/`/`Phase-1/`. Würde man die Cores jetzt
nach `tests/` verschieben, bräche man genau die Modul-Tests, die bis zu ihrer Session noch gebraucht
werden. Daher: **Test-Infrastruktur (`Phase-1/`, `Phase-2/`, `Interop-CAD/`) wandert erst in Session 2
nach `tests/`** — gemeinsam mit der Core-Überführung nach `docs/shared/`, wenn alle Pfade in einem
Rutsch korrigiert werden. Session 1 hat nur das eindeutig Abgelöste (→ `legacy/`) und die Dokumente
(→ `doku/`) verschoben. **CLAUDE.md** wird in Session 1 nur auf den Übergangszustand aktualisiert;
die finale, schlanke Fassung entsteht in Session 9.

**Session 2 (2026-07-14) — Plumbing:** `docs/shared/` steht (Core → `sembla-core.js`, neu: `storage.js`,
`navbar.js`), Modul 0 (`index.html`) mit Storage-Manager + Platzhalterseiten 1–6 (funktionierende Navbar +
aktives Element auf jeder Seite). Test-Infrastruktur verschoben: `Phase-1`+`Phase-2` → `tests/core/`
(Fixtures dedupliziert), `Interop-CAD` → `tests/interop/`, neuer `tests/module/smoke_storage.mjs`. Alle
Import-Pfade der noch nicht migrierten Module + `test-shared.mjs` + Engine + `package.json` auf
`docs/shared/sembla-core.js` umgestellt. **Vorbefund (nicht Session 2):** `Auslegung-Engine/test-engine.mjs`
war schon vor Session 2 kaputt (importiert `nachweiseWand`, `sembla-statik.mjs` exportiert `nachweisWand`) —
wird in Session 3 (Modul 1 + Engine) mitgezogen. Kern-Paritätstests, `test-shared`, Statik- und
Storage-Smoke grün. GH Pages: Deploy `main` / `docs`.

- [x] Session 1 — Aufräumen *(legacy/ + doku/ befüllt; Cores/Tests bleiben bis Session 2; alle Kern-Tests grün)*
- [x] Session 2 — Plumbing *(docs/shared/ + Modul 0 live, Tests → tests/, alle Kern-/Modul-Tests grün)*
- [ ] Session 3 — Modul 1 Wandplanung
- [ ] Session 4 — Modul 2 Wandaufbau
- [ ] Session 5 — Modul 3 Statik
- [ ] Session 6 — Modul 4 Stückliste
- [ ] Session 7 — Modul 5 Montage
- [ ] Session 8 — Modul 6 IFC/3D (experimentell)
- [ ] Session 9 — Abschluss

## 9. Offene technische Detailfragen (werden in der jeweiligen Session entschieden)

- **[ENTSCHIEDEN Session 2] Core-Einbindung: ES-Modul (`<script type="module">`).** Dieselbe Datei
  `docs/shared/sembla-core.js` läuft im Browser (über http bei GH Pages) *und* wird von den Node-Tests
  per `import` geladen — genau eine Betriebskopie, kein Zweitweg. `storage.js`/`navbar.js` sind ebenfalls
  ES-Module. Preis: `file://`-Doppelklick fällt (CORS bei Modulen) — war ohnehin abgekündigt (Abschnitt 2).
- **[ENTSCHIEDEN Session 2] JSON-Format & Versionierung.** localStorage: `sembla:elemente` = Map
  `{ id: { id, name, wandelement, erstellt, geaendert } }`, `sembla:aktiv` = id, `sembla:version` =
  Schema-Version (aktuell `1`, `migrieren()` als Haken für spätere Datenmigration). **Datei-Export = reines
  Wandelement-JSON** (kompatibel zu den Alt-Tools während der Übergangszeit). **Import** akzeptiert beide
  Formen: reines Wandelement (`length_mm` + `courses`) und Wrapper `{ name?, wandelement }`.
- Umfang "Montageanleitung" (heutiges Modul Montageplanung 1:1 oder reduziert?) — Session 7.
- web-ifc einbetten vs. handgeschriebener IFC-Export als Zwischenschritt — Session 8.
