# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Sprache: Dieses Projekt ist durchgängig deutsch (Code-Kommentare, Doku, UI). Antworte auf Deutsch.

## Was das ist

SEMBLA Planungs-Suite — Werkzeuge zur Planung vorgespannter Trockenmauerwerkswände
(Steintypen **i2** = 25 cm, **i3** = 37,5 cm). Die Suite ist eine **gehostete Web-App** auf
**GitHub Pages**: live unter `https://p0lycare.github.io/SEMBLA-planning-suite/`. Kein Build-Schritt,
kein Server — jeder Push auf `main` ist nach ~20 s live (Auslieferung s. „Deploy").

Die App besteht aus **9 Modulen (0–8)**, je eine eigenständige HTML-Seite in `docs/`. Gemeinsamer
Code liegt **einmal** in `docs/shared/` und wird per `<script type="module">` geladen. Einstieg ist
`docs/index.html` (Modul 0). Die Geschichte des Umbaus von der alten Single-File-Suite auf diesen
MVP steht in [`doku/REFACTOR.md`](doku/REFACTOR.md); der abgelöste Alt-Stand liegt in `legacy/`.

## Deploy (Auslieferung nach GitHub Pages)

Ausgeliefert wird über den **eigenen Actions-Workflow** `.github/workflows/pages.yml`: er packt
`docs/` als Artefakt und veröffentlicht es (Laufzeit ~20 s). Die Pages-Quelle des Repos steht auf
**GitHub Actions** (`build_type: workflow`) — **nicht** mehr auf „Branch `main`/`docs`". Auslösbar
ist der Workflow per Push auf `main` **oder** ohne neuen Commit per `workflow_dispatch`
(`gh workflow run Pages`).

**Warum nicht der eingebaute Weg:** der alte („legacy") Pages-Builder schickt `docs/` durch Jekyll
und ist an diesem Repo reproduzierbar gescheitert — mehrfach Timeout am 10-Minuten-Limit, ein Lauf
hing über 11 Stunden auf „building". Folge war der schlimmste Fehlermodus überhaupt: **grüner
Commit, alter Stand live** (C3 lag auf GitHub, ausgeliefert war C2, und die Live-`index.html`
referenzierte eine Datei, die es online nicht gab → Modul 0 wäre beim Laden gestorben).
`docs/.nojekyll` allein hat das **nicht** behoben. Nicht auf „Branch/Ordner" zurückstellen.

Der Workflow führt **ausdrücklich keine Tests** aus. Die bleiben Handdisziplin vor dem Push und sind
bewusst **kein** CI-Gate (s. „Tests").

**Nach einem Deploy nicht auf grün vertrauen, sondern live gegenprüfen** — grüner Workflow ≠ neuer
Stand im Browser-Cache/CDN:

```bash
gh run list --limit 3                     # Workflow "Pages" erfolgreich?
shasum -a 256 docs/index.html             # lokal …
curl -s https://p0lycare.github.io/SEMBLA-planning-suite/index.html | shasum -a 256   # … == live?
```

Neue Datei unter `docs/shared/`? Zusätzlich prüfen, dass sie online **200** liefert und nicht 404 —
ein fehlender ES-Modul-Import nimmt die ganze Seite mit.

### Push-Rechte und Token-Scopes (auch für den Bot „Nemo")

Am Projekt arbeiten mehrere Agenten von verschiedenen Rechnern und Accounts (Tibor als
`schlagzeilen`, der Bot **Nemo**). Dabei gilt:

- **Scopes sind pro Token und pro Rechner**, nicht pro Repo. Eine Anmeldung lässt sich **nicht** von
  einem Rechner auf einen anderen übertragen — `gh auth login` muss lokal laufen.
- Ein Token mit nur `repo` genügt für das Tagesgeschäft in `docs/`, **nicht** aber für Änderungen an
  `.github/workflows/`. GitHub lehnt dann den **ganzen** Push ab, auch wenn alle anderen Dateien
  harmlos sind: *„refusing to allow an OAuth App to create or update workflow … without `workflow`
  scope"*. Behebung einmalig, interaktiv (Browser):
  ```bash
  gh auth refresh -h github.com -s workflow
  ```
- **Beide pushen direkt auf `main`** (Solo-Projekt, keine Branches). Vor dem Push `git pull --rebase`,
  damit die Historie nicht auseinanderläuft. Der Workflow hat `concurrency: pages` mit
  `cancel-in-progress` — bei zwei kurz aufeinanderfolgenden Pushes gewinnt der neuere, der ältere
  Deploy wird abgebrochen. Das ist gewollt und kein Fehler.

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

**Stangenlänge nur aus dem Katalog — kein Eingabefeld ([Z-1]).** Modul 1 hat **kein** Feld für die
Gewindestangenlänge mehr (ersatzlos entfernt, nicht nur gesperrt): es gibt keinen zweiten Weg, die
Vorspann-Geometrie zu setzen. Die **unterste** Stange ist immer die **größte** gewählte
Standardlänge — das folgt aus [Z-2] und ist nicht wählbar. Ohne Auswahl gibt Modul 1 gar nichts vor
(der Core nutzt seinen Altstand-Fallback) und meldet die fehlende Auswahl sichtbar. Der **Zuschnitt
ist Feedback in der Wandansicht**: gezeichnet werden die realen `stuecke` je Segment (Standard /
Sonderzuschnitt / Reststück farblich getrennt, Kopplungsmarke `class="kop"` an jedem Stoß, Legende),
nicht ein Strich je Strang.

**Reststück am oberen Wandabschluss (Regel [Z-6]).** Die Wände werden **im Innenraum** montiert —
unter der Decke lässt sich keine lange Gewindestange mehr einfädeln. Jedes Vorspannsegment, das an
der **Wandoberkante** endet, schließt deshalb zwingend mit einem kurzen **Reststück** ab. Dessen
Länge kommt **allein** aus dem Katalog (eigene Verwendungsrolle `rod_rest`, **genau ein** Produkt —
mehrere ⇒ Länge bleibt offen, Konflikt benannt); konfigurierbar ist nur der **Überstand** über die
Oberkante (`prestress.rod_overhang_mm`, Default `ROD_OVERHANG` = 10 mm, Feld in Modul 1). Zu
bestücken ist also `h + Überstand`; der Überstand ist eingebautes Material und **kein** Verschnitt
(`segment.bedarf_mm`/`ueberstand_mm`). Darunter gilt [Z-2] unverändert: von unten die größte noch
passende Standardlänge, dann kleinere, zuletzt **ein** Sonderzuschnitt direkt unter dem Reststück.
Segmente **ohne** Oberkantenbezug (Brüstung/Sturz an einer Öffnung) sind ausgenommen und bleiben
bit-genau wie zuvor. Gerechnet wird das in `kombiniereSegment()` (Core + Python-Orakel); fehlendes
oder zu langes Reststück ⇒ `validation.zuschnitt_konflikte` (`kein_reststueck` /
`reststueck_zu_lang`) — sichtbar gemeldet, **kein** Baubarkeitsausschluss, nie eine erfundene Länge.
In der Stückliste ist das Reststück eine **eigene Position** mit eigenem `mass_mm` (`art:"rest"` in
`stuecke`), damit [P-14] eindeutig bleibt; der Stoß dorthin ist eine reguläre Kopplung.

**Spannachsen-Verteilung (`wandelement.prestress`).** Maßgebend ist die **Steinabdeckung**, nicht
mehr der Abstand: **jeder Stein jeder Lage** wird von mindestens einer Spannachse durchgangen
(**[V-2]**, Muss). Gerechnet wird das im Core (`sembla-core.js`/Python-Orakel) als Stabbing-Verfahren
über alle Steine; die Engine reicht die Felder nur durch. Rangfolge: **[V-1]** Kammerraster →
**[V-9]** manuelle Achsen → **[V-5]** Start-/Endachse → **[V-2]** Steinabdeckung → **[V-7]/[V-8]**
Zusatzachsen an Stufen-/Öffnungskanten (additiv) → **[V-3]** Mitte der i3-Steine der untersten Lage
→ **[V-4]** `max_span_grid` als **Obergrenze**.

`start_axis_grid` legt die **Startachse** fest: `0` = 1. Rasterachse (**Default**, auch bei fehlendem
Feld in Altständen), `1` = 2. Rasterachse; **gewählt wird sie ausschließlich in Modul 1** und nie
zugunsten von [V-2] verschoben. **[V-3]** ist ein reiner *Positions*vorrang: muss für [V-2] ohnehin
eine Achse gesetzt werden und enthält der Stein eine i3-Mitte der untersten Lage, wird diese Position
genommen — das kostet je Wand höchstens **eine** Achse und nie die Abdeckung. Ein i2 hat keine
Rastermitte und liefert keine Wunschposition (es wird keine erfunden). **[V-4]** greift zuletzt und
füllt nur verbleibende Lücken balanciert auf; die Regel bleibt zwingend, weil sie ein **Statik-**
Parameter ist (die Auslegung variiert 3→2→1 Raster) und aus [V-2] **nicht** folgt — allein mit [V-2]
entstehen nachweislich Abstände bis 5 Raster (625 mm).

Manuell gesetzte Achsen (`columns_grid`, Sonderkonstruktion) haben **Vorrang** und werden **nicht**
ergänzt (auch nicht um [V-2]/[V-4]); ihre Verletzungen stehen sichtbar in
`validation.ungehaltene_steine` (Lage/Rasterlage/Breite/Typ) — **kein** Baubarkeitsausschluss, nie
eine stille Korrektur. Im Auto-Pfad ist die Liste konstruktionsbedingt leer und dient als
Selbstkontrolle. Die Felder sind optional/abwärtskompatibel — kein Schema-/Projektformat-Bruch.

**Projektmappe (`sembla:projektmappe`, Format `SEMBLA-Projektmappe` v1, Regeln [L-1]…[L-8]).**
Projektstruktur (**Projekt → Gebäude → Geschoss → Wand**) und die **Lage** der Wände im
125-mm-Raster sind — wie der Katalog — eine **eigene Ressource**: eigener localStorage-Slot, eigene
Datei, eigene Formatversion, Logik in `docs/shared/sembla-projektmappe.js` (rein/DOM-frei). Sie
liegen bewusst **nicht** im Wandelement und nicht in `eingaben`, damit Modul 1 die Lagedaten gar
nicht überschreiben kann und die Einbahnstraße aus [P-1] heil bleibt. `sembla:elemente` bleibt
unverändert der **Wandspeicher**; verknüpft wird über die **stabile `id`** des Wandeintrags — der
Dateiname ist nur der Fundort ([L-4]). Lage ist **ganzzahlig im Raster** ([L-1]) und ausschließlich
**orthogonal** ([L-2]): `{ start_grid:{x,y}, richtung:"x"|"y", laenge_grid }` oder `null`
(unverortet — der Normalfall vor dem Zeichnen). Aus der Lage wird beim **Anlegen** nur die **Länge
als Vorgabe** abgeleitet; danach ist das Wandelement maßgebend, eine Abweichung wird **gemeldet,
nie still angeglichen** ([L-3]). Die **Geschosshöhe** ist ebenfalls nur Vorgabe und wird nie
zurückgeschrieben ([L-5]); passt sie nicht ins 200-mm-Lagenraster, wird das benannt statt gerundet.
Schema **v3→v4** übernimmt bestehende Wände einmalig und verlustfrei in ein „Projekt ohne Plan“ —
**ohne** Lagedaten, die es nie gab ([L-7]); der aktive-Wand-Zeiger und die Module 1–7 bleiben
unberührt. Verwaiste Einträge und unverortete Wände werden **gemeldet, nie still bereinigt**
([L-4]). Planbilder gehören **nicht** in den localStorage ([L-8], s. „Geschossplan“).
Aktive Zeiger: `sembla:aktiv:gebaeude` / `:geschoss`; einen `:projekt`-Zeiger gibt es bewusst
**nicht** (eine Mappe = ein Projekt, ein zweiter Zeiger wäre eine zweite Wahrheit). Gehört das
aktive Geschoss nicht zum aktiven Gebäude, wird sein Zeiger **aufgehoben**, nie auf ein fremdes
Geschoss gebogen.

**Bedienung der Struktur (Etappe C2, Modul 0).** Die Oberfläche pflegt Projekt/Gebäude/Geschoss
(anlegen, wählen, umbenennen, Geschosshöhe setzen, löschen) über die **reinen** Operationen aus
`sembla-projektmappe.js`; jeder Fehlschlag wird benannt und lässt den Speicher unverändert. Eine
**neu angelegte oder importierte** Wand wird im **aktiven Geschoss eingetragen** — mit `lage: null`,
denn gezeichnet ist noch nichts ([L-4]); ohne aktives Geschoss bleibt sie nicht eingetragen und wird
als solche gemeldet. Die Geschosshöhe steht als **Vorgabe** im Höhenfeld des Anlegen-Formulars und
bleibt frei änderbar ([L-5]). Die Wandliste zeigt je Wand **Geschoss und Lage** (mit gemeldeter
Längenabweichung nach [L-3]) und lässt sich auf das aktive Geschoss bzw. auf nicht eingetragene
Wände einschränken — der Filter ändert nur die **Anzeige**. Das **Umbenennen** einer Wand führt den
Anzeigenamen der Mappe mit (die Referenz bleibt die `id`); das **Löschen eines Geschosses/Gebäudes**
entfernt nur die Struktur — die Wandelemente bleiben erhalten und stehen danach als „nicht
eingetragen“. Das **Einzeichnen der Lage** im Geschossplan folgt erst in C4.

**Geschossplan (IndexedDB `sembla-plaene`, Regeln [L-8]/[L-9], Etappe C3).** Der Plan eines
Geschosses ist der **Hintergrund** der Verortung und **keine Datenquelle** ([L-9]): aus dem Bild wird
nichts abgeleitet — keine Wand, keine Länge und vor allem **kein Maßstab**. `mm_je_pixel` und
`versatz_x_mm`/`versatz_y_mm` sind **ausdrücklich gesetzte Anzeigeparameter**, wahlweise über eine
**Kalibrierlinie** (zwei Bildpunkte + reale Strecke in mm) oder als **Zahleneingabe** — beide Wege
gleichwertig. Ohne Kalibrierung liegt **kein Raster** über dem Plan, und es wird keines erfunden; ein
**neues Bild setzt Maßstab und Versatz zurück** statt sie zu übernehmen. Umgekehrt ändert weder
Kalibrierung noch Versatz noch Planwechsel **irgendeine Wandlage** ([L-1]) — die Lage lebt in
Rastereinheiten. Das **Bild** liegt nie im localStorage ([L-8]: ein Grundriss sprengt ihn und nähme
den ganzen Projektstand mit), sondern in einer **eigenen IndexedDB** (ein Datensatz je
Geschoss-Kennung, Logik in `docs/shared/sembla-plan.js`); in der Mappe stehen nur `datei`, `typ`,
`breite_px`, `hoehe_px`, Maßstab und Versatz (optionale Zusatzfelder — `MAPPE_VERSION` bleibt 1).
Zulässig sind **PNG/JPEG/WebP bis 20 MB**; ein **PDF wird benannt abgewiesen** — das ist der
**Ist-Stand**, aber die **Begründung ist entfallen**: abgewiesen wurde es im Format-Spike aus #26,
weil das Rendern eine Fremdbibliothek im Betrieb verlangt hätte, und genau dieses Argument gilt
nicht mehr (s. „Externe Laufzeit-Abhängigkeiten"). PDF-Upload ist damit eine **offene, neu zu
entscheidende Frage** (pdf.js), kein abgeschlossenes Nein — bis dahin bleibt das Verhalten aber
unverändert und wird nicht nebenbei geändert. Fehlt das
Bild (anderer Browser, gelöschte Websitedaten), bleiben Maßstab und Versatz erhalten und der fehlende
Plan wird **gemeldet**. Beim Löschen eines Geschosses/Gebäudes wird sein Planbild **mit** entfernt und
das gesagt. Der `viewBox` des Plan-SVG liegt in **Bildpixeln**, damit ein noch nicht kalibrierter Plan
bedienbar ist. Das **Einzeichnen der Wände** im Raster folgt in C4.

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

**Startklare Standardauswahl, keine Zuschnittplanung (Regel [P-18]).** Die Planung startet **nicht
leer**: jedes Katalogprodukt darf im optionalen Feld `rollen: [rolleId, …]` **ausdrücklich** benennen,
welche Verwendungsstelle es im Regelfall ausführt. Daraus baut `produktrollenVorschlag()` die
Standardauswahl; `store.vorbelegeProduktrollen()` übernimmt sie **nur für leere Rollen** (Modul 0 beim
Anlegen/Katalogladen, Modul 1/2 beim Rendern — dort **einmal je Element und Seitenaufruf**, damit eine
bewusst leergeräumte Rolle leer bleibt). Eine getroffene Wahl wird **nie** überschrieben; danach ist die
Vorbelegung eine ganz normale, sichtbare, umwählbare Auswahl — **kein** zweiter unsichtbarer
Auswahlpfad. Fachfremde oder nicht wählbare Rollenangaben sind ein **Katalogfehler**
(`validiereProdukt`), keine Heuristik. Ohne geladenen Katalog lädt **das Anlegen einer Wand** in Modul 0
den mitgelieferten Standardkatalog nach (ein vorhandener wird nie ersetzt).
Weiter gilt: **Kopplungsmuttern sind bauteilgleich** — Rolle `kuppl_basis` ist entfallen, Stangenstoß
und Fuß nutzen `kupplung` und stehen als **eine** Stücklistenposition mit der Gesamtmenge (die getrennte
Herkunft bleibt in `semblaBom()` lesbar). Und **es gibt keine Zuschnittplanung**: die Stückliste ist die
**Baustellenliste**, Sonderzuschnitte nennen nur **Fertigmaß + Stückzahl** (`mass_mm` = Fertigmaß). Die
Rolle `rod_sonder` ist deshalb `waehlbar: false` und `bepreist: false` (Status `beschaffung`) — kein
Ausgangsprodukt, keine Auswahlzeile, kein Preis, keine Verschnitt-/Einkaufsrechnung. `[Z-1]`/`[Z-2]`/
`[Z-6]` und der Core bleiben davon unberührt.

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
Versionsachsen strikt getrennt: `MAPPE_VERSION`=1 (Projektmappe) ≠ `KATALOG_VERSION`=1 (Katalogdatei) ≠ `PROJEKT_VERSION`=2 (die
Produkt-Blöcke sind dort optionale Zusatzfelder; der v2-Parser übernimmt `eingaben` ohne Whitelist,
`holeEingaben` füllt auf, `projektObjekt` exportiert alles ⇒ kein Bruch) ≠ `SCHEMA_VERSION`=4
(interner localStorage-Stand; fehlende `eingaben`-Felder werden beim Lesen aufgefüllt, echte
Migrationen gibt es nur für den Wandtyp (v3) und die Projektmappe (v4)).

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

**Vorspann-Grundregeln [V-2]/[V-3] sind umgesetzt und regressionsgetestet** (Core + Python-Orakel,
`tests/core/`): Steinabdeckung als Muss, i3-Mitte der untersten Lage als Soll, `max_span_grid` nur
noch als Obergrenze (s. „Spannachsen-Verteilung"). **Noch offen** sind zwei bestätigte Zielregeln
ohne eigene Regel-ID: bei Öffnungen über 750 mm beidseitig **zwei** Achsen, und jedes Blech von
mindestens **zwei** Achsen gehalten. Sie stehen in Modul 7 ausschließlich als ungeprüfter
Planungshinweis (`PLANUNGSHINWEISE`); was der Kern wirklich einhält, steht getrennt in
`GEPRUEFTE_REGELN` — **[D-5]** verbietet beides zu vermischen, in beide Richtungen.

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
   - `sembla-bom.js` — Stücklisten-Baustein (kanonische Mengen/Positionen, Modul 4/5) — die
     **Baustellenliste** nach **[P-18]**: bauteilgleiche Einbaustellen stehen als **eine** Position
     (Kopplungsmutter für Stoß **und** Fuß), Sonderzuschnitte nur mit Fertigmaß (kein Ausgangsprodukt). Boden- und
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
     Modul 7 (Vorschau + Druck) **und** vom zentralen Export — **eine** Zeichenableitung (**[D-6]**;
     der Punkt ist „kein zweiter Zeichenpfad", nicht „keine Fremd-Lib"). Ausgegeben wird SVG + Druck-HTML
     statt PDF-Erzeugung im Code. Stangenstöße kommen aus `stangenEnden()` (`sembla-montage.js`), Mengen aus
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
     `produkteZuRolle`, `rollenStatus`) die **Standardauswahl** (`produktrollenVorschlag`/`rollenOhneVorschlag`, **[P-18]**)
     und die **deterministische Preisauflösung** (`loesePreis`,
     `preisKontext`, `STATUS_TEXT`) nach **[P-14]**; `pruefeAuswahl` bleibt nur als Meldepfad für den
     Altbestand **[P-15]**. Rein/DOM-frei, genutzt von Modul 0/1/2 und `sembla-export.js`.
   - `sembla-projektmappe.js` — **Projektstruktur und Wandlagen** (Modul 0, Etappe C1 von #26):
     Format `SEMBLA-Projektmappe` v1, Struktur-Operationen, Validierung, Referenzabgleich,
     Übernahme bestehender Stände, **Planbeschreibung** (`normPlan`/`planFehler`/`setzePlan`/
     `setzePlanAnsicht`). Rein/DOM-frei, eigene Tests (`tests/module/test-projektmappe.mjs`).
   - `sembla-plan.js` — **Geschossplan** (Modul 0, Etappe C3 von #26, [L-8]/[L-9]): Formatprüfung
     (PNG/JPEG/WebP, 20 MB, PDF abgewiesen), Kalibrierung, Umrechnung Bildpixel ↔ Raster-mm,
     Rasterlinien, `planSvg()` und die **eigene IndexedDB** für die Bilder (Fabrik für Tests
     einschleusbar). Rein/DOM-frei, eigene Tests (`tests/module/test-plan.mjs`).
   - `storage.js` — localStorage-Schicht (Elemente, aktiv-Zeiger, **`eingaben`-Modell**, OBJ-Geometrie,
     **Katalog-Slot**, **Produktrollen** (`holeProdukte`/`setzeProduktrolle`/`vorbelegeProduktrollen`),
     **Projektmappen-Slot** (`holeMappe`/`setzeMappe`/`aendereMappe`/`verorteWand`/`mappeReferenzen`),
     Import/Export).
   - `navbar.js` — gemeinsame Kopfleiste (Reiter 0–8 + aktives Wandelement).
   - `sembla-blog.js` — **Projektblog** (Modul 8): Validator der Änderungsliste, Karten-HTML,
     Filterung/Gruppierung der GitHub-Issues, Fehler-Fallback, Deep-Link-Anker. Rein/DOM-frei,
     eigene Tests (`tests/module/test-blog.mjs`).
   - `blog-eintraege.js` — **Datensatz** der Änderungsliste (Format `SEMBLA-Blog` v1): reine
     Daten, keine Logik. Öffentlich sichtbar ⇒ der Validator verbietet E-Mails, Tokens,
     absolute lokale Pfade und kopierte Issue-Bodies.

   `engine`/`statik`/`bom`/`aufbau`/`montage`/`ifc`/`export`/`zip`/`katalog` sind eigene Dateien **wegen eigener Tests bzw.
   mehrerer Nutzer** (Regeln a/b). Reine Modul-Zeichen-/Rechenlogik mit nur einem Nutzer bleibt **inline**
   im jeweiligen HTML.

4. **Module bleiben rein/einbahnig.** Nur **Modul 1** schreibt das Wandelement; alle anderen lesen es.
   Nur `sembla-engine.js` kennt die Auslegungs-Iterationsschleife. Materialkennwerte (`fcd`, `cfd`,
   `rho`) sind Platzhalter, vom Statiker zu bestätigen.

## Module (Datei in `docs/` → Inhalt)

| Nr. | Datei | Inhalt |
|---|---|---|
| 0 | `index.html` | **Projektplaner** (#26, Plan in `doku/PLAN-Projektplaner.md`; Datenmodell, Struktur-Oberfläche und Geschossplan stehen (C1/C2/C3), das Einzeichnen folgt in C4): **Projekt → Gebäude → Geschoss** anlegen/wählen, Geschosshöhe als Vorgabe, Wandliste je Geschoss mit Lage, **Geschossplan** hochladen/kalibrieren/verschieben mit 125-mm-Rasteroverlay ([L-8]/[L-9]). Einstieg, Modulübersicht, Storage-Manager + **zentraler Export/Import** (Häkchen-Dialog → ZIP via `sembla-export.js`/`zip.js`, inkl. **Zeichnung** aus Modul 7); **Projekt-Kopfdaten** des aktiven Elements → `eingaben.projekt`; **legt das Wandelement an (inkl. Wandtyp-Wahl)**; **Bauteilkatalog** als **alleiniger Pflegeort** für Produkte **und Preise** (anlegen/bearbeiten/duplizieren/löschen) + separater Katalogim-/-export. **Keine** wand-/projektbezogene Produktauswahl mehr ([P-13]); Altbestand wird sichtbar als unwirksam gemeldet ([P-15]) |
| 1 | `wandplanung.html` | Wand, Öffnungen, Durchbrüche, Staffelung, Seiten, Auslegung (+ `sembla-engine.js`), **Startachse der Vorspannung** (1./2. Rasterachse) — **erzeugt** das Wandelement; **Produkte dieser Wand** (Steine, Vorspannung, Anschluss inkl. getrennter Boden-/Kopfbleche, Fugen) → `eingaben.planung.produkte` |
| 2 | `wandaufbau.html` | Horizontaler Wandaufbau: Verbinderachsen + Latten-Zuschnitt (`sembla-aufbau.js`, **ohne Dämmung**); Eingaben → `eingaben.aufbau`; **Produkte des Aufbaus** (Lattenstange, Beplankungsplatte, Verbinderprodukt — Typ bleibt aus Modul 1, **[U-9]**) → `eingaben.aufbau.produkte` |
| 3 | `statik.html` | Statischer Nachweis (voller Schermer-Nachweis, `sembla-statik.js`); Kennwerte → `eingaben.statik`, Geometrie **und Wandtyp** read-only aus dem Wandelement. Dasselbe Modell speist das Nachweis-Dokument des zentralen Exports |
| 4 | `stueckliste.html` | Stückliste & Kosten (`sembla-bom.js`); **read-only**: Preise werden je Position aus dem Katalog aufgelöst ([P-14]), keine Preisfelder. Editierbar nur `waehrung` → `eingaben.kosten`. Nicht eindeutige Zuordnung ⇒ **kein Preis** + benannter Grund + „n von m bepreist" (Export läuft zentral über Modul 0, mit derselben Auflösung) |
| 5 | `montage.html` | Montageanleitung: **Baugruppenabschnitte nach Montageereignissen** (erste Stange, Kopplung/neue Stange, oberer Abschluss) mit durchgehend nummerierten Steinreihen, A4-paginiert druckbar (`sembla-montage.js`; identisch zum zentralen Export) |
| 6 | `ifc-3d.html` | **Experimentell:** Three.js-3D-Vorschau + OBJ-Upload (IFC4-Export läuft zentral über Modul 0) |
| 7 | `zeichnung.html` | **Technische Zeichnung:** maßstabsgetreue Wandabwicklung (Verlege-/Vorspannplan, Bemaßung, Tabellen, Legende, Schriftfeld) als A3-/A4-Blatt, druckbar (`sembla-zeichnung.js`; identisch zum zentralen Export). Nur Darstellungsoptionen → `eingaben.zeichnung`; **kein** eigener Datei-Download ([D-1]…[D-8]) |
| 8 | `blog.html` | **Projektblog & Status** (mobile-first, read-only): Ansicht „Was ist neu?" aus `blog-eintraege.js` und Ansicht „Projektstatus" aus der öffentlichen GitHub-Issue-API (`sembla-blog.js`). Steht **außerhalb** des Planungsdatenflusses: liest **kein** Wandelement, schreibt **keine** `eingaben`, kein Login/Backend |

**Module 2, 3 und 5 sind vorübergehend ausgeblendet (Zyklus-Fokus, Issue #20).** Der laufende
AWG-Zyklus nimmt Statik-Ausbau (Modul 3), Modul-2-Ausbau und die stückweise Montageanleitung
(Modul 5) ausdrücklich **aus dem Scope**. Damit die Oberfläche das abbildet, tragen diese drei
Einträge in `docs/shared/navbar.js` das Feld **`versteckt: true`**: sie erscheinen weder als Reiter
noch in der Modulübersicht von Modul 0 (`docs/index.html`). Das ist **reine Navigation** —
die Seiten bleiben per direkter URL erreichbar (und ihr Reiter erscheint wieder, sobald man auf
ihnen steht), Datenfluss, `eingaben`-Abschnitte, Shared-Code, Tests und die Export-Häkchen bleiben
**unverändert wirksam**. Rückgängig = Flag entfernen. Kein Modul wurde umnummeriert; die
Nummerierung 0–8 bleibt stabil, damit sie zu den GitHub-Issues passt.

**Modul 8 (Blog) und der Datenfluss.** Der Blog ist bewusst vom Planungsmodell entkoppelt: er
liest weder Wandelement noch `eingaben` und schreibt nirgendwo hin. Seine beiden Quellen sind
(a) die im Repo versionierte Änderungsliste `docs/shared/blog-eintraege.js` — statisch, also auch
offline lesbar — und (b) die **öffentliche** GitHub-Issue-API, zur Laufzeit ohne Authentifizierung
abgerufen. Gruppiert wird **ausschließlich** nach den expliziten Labels `status: blocked`,
`status: decision needed`, `status: in progress`, `status: ready`; alles andere landet sichtbar in
„Ohne Status" — es gibt **keine** Statusheuristik aus Titeln oder Texten und **kein** zweites
Statussystem neben GitHub. Angezeigt (und gespeichert) werden nur Nummer, Titel, Labels und
Meilenstein — nie Kommentare oder Autoren, und aus dem Body **einzig** der Entscheidungsabsatz
(s. u.). Der einzige localStorage-Zugriff ist der
**Anzeigecache** `sembla:blog:issues` (letzter erfolgreicher Abruf + „Stand"); er gehört **nicht**
zum Projektmodell und läuft deshalb bewusst nicht über `storage.js`. Bei Netz-/API-Fehler zeigt das
Modul einen benannten Hinweis (inkl. GitHubs 60-Abrufe-Limit) und höchstens den als veraltet
gekennzeichneten Cache — **nie** einen geratenen Status.

**Entscheidungsabsatz (`entscheidung`).** Nur für die Gruppen `decision` und `blocked` zeigt die
Karte zusätzlich die offene Frage („Brauche Entscheidung: … – Empfehlung: …", bei blockiert
„Blockiert: …"). Quelle ist **ausschließlich** ein im Issue-Body **ausdrücklich ausgezeichneter**
Abschnitt (`### Aktuelle Entscheidung` / `### Offene Entscheidung` / `### Blockiert`, ≥ 3 Rauten,
Gross/Klein egal) bis zur nächsten Überschrift; daraus werden die Marker-Zeilen
`Brauche Entscheidung:` / `Empfehlung:` / `Blockiert durch:` gelesen, Markdown-Inline gestrippt und
auf 280 Zeichen gekappt. Es gibt **keinen** Freitext-Ratepfad: fehlt der Abschnitt, bleibt das Feld
leer und die Karte zeigt nichts — nie einen erfundenen Text. Der Body kommt **inline** aus der
Listen-API (**kein** zusätzlicher Abruf, Ratelimit unverändert), wird bei allen anderen Gruppen
**gar nicht gelesen** und nach der Extraktion verworfen; nur das Extrakt geht in den Anzeigecache.
Das Issue bleibt die Single Source of Truth, der Blog ist nur eine Ansicht davon — das Pflegen des
Absatzes beim Statuswechsel ist Maintainer-Aufgabe.

**Commit-Regel (Änderungsliste).** Ab jetzt enthält jeder produktive SEMBLA-Commit **genau einen**
neuen referenzierbaren `chg-*`-Eintrag in `docs/shared/blog-eintraege.js` für denselben
Issue-Scope; Begleitdoku zählt nicht zweit. Reihenfolge neu → alt, ID-Muster `chg-YYYYMMDD-NN`,
Pflichtfelder `id/datum/typ/issue/titel` (optional `testbitte`) — `npm run test:modul8` prüft das.

**Bauteilgeometrie (i2/i3):** Die realen OBJ/IFC-Modelle liegen **nicht** im Repo (vertraulich,
öffentliches Repo). `Bauteil-OBJ/` ist gitignored und nur lokal vorhanden. Modul 6 bettet die
Geometrie nicht ein, sondern lädt sie zur Laufzeit per Datei-Upload (lokal im Browser); sie wird über
`storage.js` in `localStorage` (`sembla:obj:i2` / `:i3`) gemerkt. Der OBJ-Loader ist **inline** in
Modul 6. Die realen Modelle kommen **ausschließlich** über diesen manuellen Browser-Import — nie über
Tests. **Node-Smoke-Tests sind autark und lesen keine Dateien aus `Bauteil-OBJ/`**: Wo OBJ-Geometrie
gebraucht wird (`tests/module/smoke_3d.mjs`), definiert der Test eine minimale synthetische OBJ-Zeichenkette
inline. So läuft `npm run test:all` auch in einer sauberen Arbeitskopie ohne die vertraulichen Modelle grün.

**Externe Laufzeit-Abhängigkeiten sind erlaubt.** Die Suite ist eine **gehostete** Web-App — sie wird
über GitHub Pages aus dem Netz geladen und läuft nicht als Offline-Werkzeug. Die frühere Vorgabe
„keine Fremdbibliotheken im Betrieb, damit alles offline funktioniert" ist damit **hinfällig** und
kein Ablehnungsgrund mehr. Wo bestehender Code ohne Fremd-Lib auskommt (`zip.js`,
`sembla-zeichnung.js`), ist das eine **Beschreibung des Ist-Stands**, keine Regel — es gibt keinen
Grund, das nachzubauen statt eine passende Bibliothek zu nehmen.

Weiterhin gültig bleiben die Gründe, die **nichts** mit Offline-Fähigkeit zu tun haben:
**kein Build-System** (Architektur-Regel 2 — eine Lib muss sich per `<script type="module">` bzw.
ESM-Import von einem CDN einbinden lassen), **Lizenzen prüfen** (s. Randbedingungen) und
**sauberes Degradieren**, wo es billig ist. Stand heute lädt `ifc-3d.html` Three.js per CDN für die
3D-Ansicht (ohne Netz ein Hinweis, alles andere läuft weiter); web-ifc/xlsx werden im Betrieb nicht
geladen (web-ifc nur in `tests/interop`).

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
npm run test:modul0               # … bis test:modul8: Logik-/Smoke-Tests je Modul (tests/module/)
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
