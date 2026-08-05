# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Sprache: Dieses Projekt ist durchgängig deutsch (Code-Kommentare, Doku, UI). Antworte auf Deutsch.

## Was das ist

SEMBLA Planungs-Suite — Werkzeuge zur Planung vorgespannter Trockenmauerwerkswände
(Steintypen **i2** = 25 cm, **i3** = 37,5 cm). Die Suite ist eine **gehostete Web-App** auf
**GitHub Pages**: live unter `https://p0lycare.github.io/SEMBLA-planning-suite/` (Deploy direkt vom
Branch `main`, Ordner `docs/`). Kein Build-Schritt, kein Server — jeder Push ist sofort live.

Die App besteht aus **8 Modulen (0–7)**, je eine eigenständige HTML-Seite in `docs/`. Gemeinsamer
Code liegt **einmal** in `docs/shared/` und wird per `<script type="module">` geladen. Einstieg ist
`docs/index.html` (Modul 0). Die Geschichte des Umbaus von der alten Single-File-Suite auf diesen
MVP steht in [`doku/REFACTOR.md`](doku/REFACTOR.md); der abgelöste Alt-Stand liegt in `legacy/`.

## Roter Faden (Datenfluss)

**Modul 1 (Wandplanung)** erzeugt das geprüfte **Wandelement** (JSON) — die *Single Source of Truth*.
Es lebt im **localStorage des Browsers** (Schicht `docs/shared/storage.js`). Genau **ein** aktives
Element ist gesetzt; **nur Modul 1 schreibt das Wandelement**, alle anderen Module lesen es.

**Nutzereingaben ↔ ein Datenmodell (kein Drift).** Neben dem Wandelement hält jeder Eintrag einen
`eingaben`-Block: `{ projekt, planung, aufbau, kosten, statik, katalog }` (Standardwerte in
`storage.standardEingaben()`). Jedes Modul schreibt **nur seinen eigenen Abschnitt** via
`store.mergeEingaben(teil, patch)` zurück — Modul 0→`projekt` (Kopfdaten am aktiven Element),
Modul 1→`planung`, Modul 2→`aufbau`, Modul 4→`kosten` (nur noch `waehrung`), Modul 3→`statik`.
Abgeleitete Werte (Stückliste, Layout, Nachweis) werden immer **neu gerechnet, nie gespeichert**.
Modul 3 speichert nur seine Kennwerte; Geometrie (h/L/t/Öffnungszahl) **und Wandtyp** kommen aus dem
Wandelement. `eingaben.katalog` ist **unwirksamer Altbestand** (s. u.) und wird von niemandem mehr
geschrieben.

**Wandtyp (`wandelement.wandtyp`, `mit_wind`/`ohne_wind`).** Fachmerkmal der Wand (Windsituation).
**Gewählt wird er ausschließlich in Modul 0 beim Anlegen** des Wandelements; Modul 1 führt ihn beim
Neuaufbau unverändert mit, Modul 3 liest ihn nur (kein UI in 1/3). Er hängt **nicht** am Core/an der
Engine (kein Einfluss auf Tiling/BOM/Stränge). Kanonische Werte, Normalisierung und die einmalige
Migration aus dem Alt-Feld `eingaben.statik.mitWind` (`true`/`'ja'`→`mit_wind`, `false`/`'nein'`→
`ohne_wind`, fehlt→`mit_wind`) liegen zentral in `storage.js` (Schema v3). Das Alt-Feld bleibt in
Altprojekten erhalten, wird aber nirgends mehr angewendet oder neu geschrieben. Da Modul 0 der einzige
Ort der Anlage ist, legt **Modul 1 kein Wandelement mehr selbst an** — ohne aktives Element verweist es
darauf. Achtung: `SCHEMA_VERSION` (interner localStorage-Stand) ist bewusst getrennt von
`PROJEKT_VERSION` (öffentliches Dateiformat, bleibt 2 — `wandtyp` ist dort ein optionales Feld).

**Spannachsen-Verteilung (`wandelement.prestress`).** `max_span_grid` bleibt der **maximale**
Achsabstand („jede x-te Achse"); die Achsen werden von der Startachse bis zur letzten Achse `N-1`
**balanciert** verteilt (gleiche Schritte ≤ x), nicht strikt periodisch. `start_axis_grid` legt die
**Startachse** fest: `0` = 1. Rasterachse (**Default**, auch bei fehlendem Feld in Altständen), `1` =
2. Rasterachse. **Gewählt wird sie ausschließlich in Modul 1**; gerechnet wird sie im Core
(`sembla-core.js`/Python-Orakel), die Engine reicht sie nur durch. Zusatzachsen an Öffnungs- und
Stufenkanten bleiben **additiv**; manuell gesetzte Achsen (`columns_grid`, Sonderkonstruktion) haben
**Vorrang** vor der Auto-Verteilung. Das Feld ist optional/abwärtskompatibel — kein Schema-/
Projektformat-Bruch.

**Bauteilkatalog (`sembla:katalog`, Format `SEMBLA-Bauteilkatalog` v1).** Der Produktstamm (Steine,
Gewindestangen/Vorspannsystem, Latten, Beplankung, Bleche/Platten, Verbinder, Verbrauchsmaterial) ist
eine **eigene Ressource** — technisch und fachlich getrennt vom Wand-/Projekt-JSON: **ein** aktiver
Katalog-Slot im localStorage, eigene Datei, eigene Formatversion (`KATALOG_VERSION`), Logik in
`docs/shared/sembla-katalog.js` (rein/DOM-frei, validiert). **Modul 0 ist der alleinige Pflegeort**
für Produkte **und Preise** (anlegen/bearbeiten/duplizieren/löschen) sowie für den **separaten**
Katalogimport/-export — der bewusst **nicht** über den Projekt-Import/das Projekt-ZIP läuft
(verwechselte Formate werden benannt). Modul 0 hat **keine** wand-/projektbezogene Produktauswahl.

**Wandbezogene Produktwahl (`eingaben.planung.produkte` / `eingaben.aufbau.produkte`, Regel [P-13]).**
*Welche* Produkte eine Wand verwendet, wählt das fachlich zuständige Modul **direkt aus dem
vollständigen aktiven Katalog** (kein Freigabepool dazwischen): **Modul 1** für Steine, Vorspannung,
Anschluss (inkl. getrennter Boden-/Kopfbleche) und Fugen, **Modul 2** für Lattenstange,
Beplankungsplatte und Verbinderprodukt. Beide Blöcke haben dieselbe Form
`{ quelle, rollen: { <bom-key>: [produktId, …] } }` — **nur Produkt-IDs je Verwendungsrolle**, niemals
Preise/Maße und **nichts davon im Wandelement**. Der Rollenschlüssel *ist* der Stücklistenschlüssel
(`sembla-bom.js`), es gibt also keine zweite Zuordnungsachse. Mehrere Produkte je Rolle sind erlaubt
(mehrere Standardlängen/-formate) und über `produkteZuRolle()` für #19/#22 programmgesteuert lesbar.
`store.setzeProduktrolle(rolle, ids)` schreibt anhand der Rolle in den Abschnitt ihres Eigentümers;
eine fremde/unbekannte Rolle wird abgelehnt statt still einsortiert.

**Preise (Regel [P-14]).** Modul 4 hat **keine** Preisfelder mehr; jeder Einzelpreis wird pro Position
frisch aufgelöst (`loesePreis`, genutzt von `stuecklistePositionen` und damit von Modul 4 **und** dem
ZIP-Export). Eingegrenzt wird nur über echte Daten: passende Kategorie, zur Positionseinheit
kompatible Preisbasis (`Stk↔Stk`, `m↔m`, **keine** Umrechnung) und — wo definiert — Gleichheit eines
realen Maßfelds mit dem maßgebenden Wandwert (`preisKontext`: Stangenlänge, Blech-Modullänge,
Lattenstangenlänge, Steinbreite). Genau **ein** Kandidat ⇒ Preis; **mehrere** ⇒ `mehrdeutig` ohne
Preis. Fehlend/kategoriefremd/einheitenfremd/maßfremd/kein Katalog ⇒ ebenfalls **kein** Preis, aber
sichtbar begründet; Menge 0 braucht kein Produkt. **Verboten:** erster Kandidat, Mittelwert, Minimum,
Ersatzprodukt, Nullpreis, Einheitenumrechnung, Änderung der Einbaumenge. Unvollständige Summen werden
als *n von m bepreist* gekennzeichnet; der Auswahlstatus ist schon in Modul 1/2 sichtbar.
`eingaben.kosten.preise` ist damit **keine Preisquelle mehr** (bleibt in Altprojekten erhalten, wird
weder gelesen noch geschrieben, ist kein Standardwert mehr).

**Altbestand (`eingaben.katalog`, Regel [P-15]).** Die früher zentral in Modul 0 gepflegte
`auswahl` je Kategorie ist **unwirksam**: sie wird nicht mehr geschrieben, nicht als Filter angewendet
und **nicht** in Verwendungsrollen übersetzt (eine Kategorie→Rolle-Übersetzung wäre mehrdeutig). Sie
bleibt zur Nachvollziehbarkeit im Projekt und wird in Modul 0 sichtbar als unwirksam gemeldet;
`pruefeAuswahl`/`normAuswahl`/`anzahlAuswahl` sind dafür reine Lese-/Meldepfade.

Altprojekte ohne Produkt-Blöcke laden über `standardEingaben()` als **leere Rollen** — warnungsfrei.
Versionsachsen strikt getrennt: `KATALOG_VERSION`=1 (Katalogdatei) ≠ `PROJEKT_VERSION`=2 (die
Produkt-Blöcke sind dort optionale Zusatzfelder; der v2-Parser übernimmt `eingaben` ohne Whitelist,
`holeEingaben` füllt auf, `projektObjekt` exportiert alles ⇒ kein Bruch) ≠ `SCHEMA_VERSION`=3
(fehlende Felder werden beim Lesen aufgefüllt ⇒ keine Migration nötig).

**Export/Import ist zentral** (Modul 0, `docs/index.html`): ein Häkchen-Dialog baut über
`sembla-export.js` die gewählten Dateien und packt sie via `zip.js` (STORE+CRC32, keine Lib) in ein ZIP.
Projekt-Datei = `{format:'SEMBLA-Projekt',version:2,name,wandelement,eingaben}` (`store.projektObjekt`);
der Import versteht v2 + Alt-Bundle. Die einzelnen Module haben **keine eigenen Datei-Buttons** mehr.

Das Wandelement stammt aus dem Core (`buildWall`): Länge/Höhe/Öffnungen → Tiling (i3-maximal),
Vorspannstränge (segmentiert), BOM/Stückliste. Einheiten: **mm**. `grid` = Rastereinheit (125 mm),
`lage`/`course` = Lagenindex (200 mm).

## Fachregelwerk und Änderungsprozess

Die Planung muss **vollständig regelbasiert und deterministisch** erfolgen. Verbindliche fachliche
Grundlage ist das hierarchische Regelwerk in Kapitel 16 des Handbuchs; seine editierbare Quelle ist
`build-handbuch.mjs`, das erzeugte Dokument `doku/SEMBLA_Handbuch.docx`. Code, Tests und Handbuch
dürfen fachlich nicht auseinanderlaufen.

- Jede fachliche Änderung benennt die betroffenen Regel-IDs und ergänzt oder ändert zuerst das
  Regelwerk. Neue Regeln erhalten eine dauerhafte ID und eine klare Priorität gegenüber eventuell
  konkurrierenden Regeln.
- Bei jedem Bug ist ausdrücklich zu klären: **Welche Regel fehlt, ist unklar oder wurde falsch
  umgesetzt?** Der Fix muss Regelwerk, Implementierung und Regressionstest gemeinsam korrigieren.
- Regeln sind hierarchisch: Sicherheit/Baubarkeit und explizite Muss-Regeln schlagen Optimierungs-
  und Komfortregeln. Ein Konflikt darf nicht still durch eine Heuristik aufgelöst werden.
- Das Handbuch ist bei jeder produktrelevanten Änderung mitzuprüfen und regelmäßig gegen den realen
  Produktstand zu auditieren. Nicht implementierte Zielregeln werden als solche gekennzeichnet und
  dürfen nicht als bereits getestet dargestellt werden.

**Neu bestätigte Vorspann-Grundregeln (Umsetzung noch per Issue/Tests abzusichern):** Jeder Stein muss
von mindestens einer Spannachse gehalten werden. In der untersten Steinreihe sollen automatisch
gesetzte Spannachsen möglichst mittig in den i3-Steinen liegen. Diese Regeln bestimmen die
Achsenverteilung vorrangig; `max_span_grid` bleibt zusätzlich eine einzuhaltende Obergrenze und ist
nicht mehr alleinige Verteilungsregel.

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
   - `sembla-statik.js` — **voller Schermer-Nachweis** (Modul 3) plus `nachweisParams()`: die
     zentrale, DOM-freie Abbildung Wandelement + `eingaben.statik` → Nachweis-Parameter. Modul 3
     (`readP`) **und** der zentrale Nachweis-Export nutzen sie, damit beide dasselbe rechnen.
   - `sembla-bom.js` — Stücklisten-Baustein (kanonische Mengen/Positionen, Modul 4/5). Boden- und
     Kopfblech sind **getrennte Positionen** (`blech_boden`/`blech_kopf`, Regel **[A-1]**), abgeleitet aus
     den realen `base_plate`/`top_plate` des Wandelements — der Core bleibt unverändert und die Summe
     beider Positionen bleibt exakt `bom.stahlblech_module` (`test-shared.mjs` sichert das ab). Die
     Dichtstreifen-Gesamtlänge in m ist `nachrichtlich: true` (Regel **[A-6]**) und wird **nie** bepreist,
     damit dieselbe Ware nicht doppelt in einer Summe steht.
   - `sembla-aufbau.js` — horizontaler Wandaufbau (`berechneAufbau`, Verbinderachsen/Latten; Modul 2, DOM-frei).
   - `sembla-montage.js` — **ereignis-/baugruppenbasierte Montageableitung** (`montageEreignisse`,
     `montageAbschnitte`, `abschnittSvg`/`konturSvg`, `montageSeiten`/`montageDokument`; DOM-frei).
     Quelle sind die **realen** `tension_columns[].segments` + Wandkontur — nie eine pauschale
     Stangenhöhe und nie ein Repräsentanten-Strang. Genutzt von Modul 5 (Vorschau + Druck) **und**
     vom zentralen Export; beide Wege liefern dieselben Seiten (Regel a+b). Voran steht der
     steinfreie **Schnitt 0** (Regel **[A-9]**): nur Bodenblech/Grundplatte + erste Gewindestangen,
     rein **additiv** (die regulären Abschnitte bleiben unverändert), ohne Fußereignis entfällt er
     ersatzlos. Alle Baugruppenbilder nutzen denselben **globalen Maßstab** (`abschnitt.z_top_mm`),
     damit die Vorschau mit dem Montagefortschritt nicht wächst.
   - `sembla-zeichnung.js` — **technische Zeichnung** (Modul 7): maßstabsgetreue Wandabwicklung
     (`zeichnungSvg`), Blatt mit Tabellen/Legende/Schriftfeld (`blattHtml`), `ZEICHNUNG_CSS`,
     `druckCss`, `zeichnungDokument`/`zeichnungSvgDatei`, Optionen (`normOptionen`/`standardOptionen`);
     DOM-frei. **Norm-Maßstab** inkl. Bemaßungsrand ⇒ Druck ist echt 1:x (**[D-2]**). Genutzt von
     Modul 7 (Vorschau + Druck) **und** vom zentralen Export — eine Zeichenableitung (**[D-6]**),
     kein jsPDF/CDN. Stangenstöße kommen aus `stangenEnden()` (`sembla-montage.js`), Mengen aus
     `sembla-bom.js` — kein zweites Stück-/Mengenmodell. Die vier Vorspann-Zielregeln stehen nur
     als **ungeprüfte Planungshinweise** auf dem Blatt (**[D-5]**), der statische Nachweis ist
     ausdrücklich **nicht** Bestandteil der Zeichnung (**[D-8]**).
   - `sembla-ifc.js` — IFC4-Export (`wandelementToIfc` + `parseObj`/`meshStats`; genutzt vom zentralen Export).
   - `sembla-export.js` — baut die Export-Dateien (Stückliste/Zuschnitt-CSV, Montage-HTML,
     **Zeichnung als SVG + druckbares HTML**, **Statischer-Nachweis-HTML**, IFC-Text) für Modul 0. Das
     Nachweis-Dokument kommt aus dem **vollen** Schermer-Nachweis (`sembla-statik.js`) — nie aus dem vereinfachten Engine-Modell —
     und ist als prüfpflichtige Planungshilfe gekennzeichnet. Die Montageanleitung ist reine
     Delegation an `sembla-montage.js` (keine eigene Zeichenlogik, kein Duplikat zu Modul 5); die
     Zeichnung ebenso an `sembla-zeichnung.js` (Häkchen `zeichnung` ⇒ zwei Dateien, kein Duplikat zu
     Modul 7).
   - `zip.js` — `zipSync`/`downloadZip` (STORE+CRC32, ohne Fremd-Lib) für den zentralen ZIP-Export.
   - `sembla-katalog.js` — **Bauteilkatalog**: Kategorien/Einheiten, Validierung, Austauschformat
     (`parseKatalog`/`katalogObjekt`), **Verwendungsrollen** (`ROLLEN`, `rollenVonModul`, `produktRollen`,
     `produkteZuRolle`, `rollenStatus`) und die **deterministische Preisauflösung** (`loesePreis`,
     `preisKontext`, `STATUS_TEXT`) nach **[P-14]**; `pruefeAuswahl` bleibt nur als Meldepfad für den
     Altbestand **[P-15]**. Rein/DOM-frei, genutzt von Modul 0/1/2 und `sembla-export.js`.
   - `storage.js` — localStorage-Schicht (Elemente, aktiv-Zeiger, **`eingaben`-Modell**, OBJ-Geometrie,
     **Katalog-Slot**, **Produktrollen** (`holeProdukte`/`setzeProduktrolle`), Import/Export).
   - `navbar.js` — gemeinsame Kopfleiste (Reiter 0–6 + aktives Wandelement).

   `engine`/`statik`/`bom`/`aufbau`/`montage`/`ifc`/`export`/`zip`/`katalog` sind eigene Dateien **wegen eigener Tests bzw.
   mehrerer Nutzer** (Regeln a/b). Reine Modul-Zeichen-/Rechenlogik mit nur einem Nutzer bleibt **inline**
   im jeweiligen HTML.

4. **Module bleiben rein/einbahnig.** Nur **Modul 1** schreibt das Wandelement; alle anderen lesen es.
   Nur `sembla-engine.js` kennt die Auslegungs-Iterationsschleife. Materialkennwerte (`fcd`, `cfd`,
   `rho`) sind Platzhalter, vom Statiker zu bestätigen.

## Module (Datei in `docs/` → Inhalt)

| Nr. | Datei | Inhalt |
|---|---|---|
| 0 | `index.html` | Einstieg, Modulübersicht, Storage-Manager + **zentraler Export/Import** (Häkchen-Dialog → ZIP via `sembla-export.js`/`zip.js`, inkl. **Zeichnung** aus Modul 7); **Projekt-Kopfdaten** des aktiven Elements → `eingaben.projekt`; **legt das Wandelement an (inkl. Wandtyp-Wahl)**; **Bauteilkatalog** als **alleiniger Pflegeort** für Produkte **und Preise** (anlegen/bearbeiten/duplizieren/löschen) + separater Katalogim-/-export. **Keine** wand-/projektbezogene Produktauswahl mehr ([P-13]); Altbestand wird sichtbar als unwirksam gemeldet ([P-15]) |
| 1 | `wandplanung.html` | Wand, Öffnungen, Durchbrüche, Staffelung, Seiten, Auslegung (+ `sembla-engine.js`), **Startachse der Vorspannung** (1./2. Rasterachse) — **erzeugt** das Wandelement; **Produkte dieser Wand** (Steine, Vorspannung, Anschluss inkl. getrennter Boden-/Kopfbleche, Fugen) → `eingaben.planung.produkte` |
| 2 | `wandaufbau.html` | Horizontaler Wandaufbau: Verbinderachsen + Latten-Zuschnitt (`sembla-aufbau.js`, **ohne Dämmung**); Eingaben → `eingaben.aufbau`; **Produkte des Aufbaus** (Lattenstange, Beplankungsplatte, Verbinderprodukt — Typ bleibt aus Modul 1, **[U-9]**) → `eingaben.aufbau.produkte` |
| 3 | `statik.html` | Statischer Nachweis (voller Schermer-Nachweis, `sembla-statik.js`); Kennwerte → `eingaben.statik`, Geometrie **und Wandtyp** read-only aus dem Wandelement. Dasselbe Modell speist das Nachweis-Dokument des zentralen Exports |
| 4 | `stueckliste.html` | Stückliste & Kosten (`sembla-bom.js`); **read-only**: Preise werden je Position aus dem Katalog aufgelöst ([P-14]), keine Preisfelder. Editierbar nur `waehrung` → `eingaben.kosten`. Nicht eindeutige Zuordnung ⇒ **kein Preis** + benannter Grund + „n von m bepreist" (Export läuft zentral über Modul 0, mit derselben Auflösung) |
| 5 | `montage.html` | Montageanleitung: **Baugruppenabschnitte nach Montageereignissen** (erste Stange, Kopplung/neue Stange, oberer Abschluss) mit durchgehend nummerierten Steinreihen, A4-paginiert druckbar (`sembla-montage.js`; identisch zum zentralen Export) |
| 6 | `ifc-3d.html` | **Experimentell:** Three.js-3D-Vorschau + OBJ-Upload (IFC4-Export läuft zentral über Modul 0) |
| 7 | `zeichnung.html` | **Technische Zeichnung:** maßstabsgetreue Wandabwicklung (Verlege-/Vorspannplan, Bemaßung, Tabellen, Legende, Schriftfeld) als A3-/A4-Blatt, druckbar (`sembla-zeichnung.js`; identisch zum zentralen Export). Nur Darstellungsoptionen → `eingaben.zeichnung`; **kein** eigener Datei-Download ([D-1]…[D-8]) |

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
npm run test:modul0               # … bis test:modul7: Logik-/Smoke-Tests je Modul (tests/module/)
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
