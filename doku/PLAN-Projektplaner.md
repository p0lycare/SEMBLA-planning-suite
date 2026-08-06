# Plan: Modul 0 wird Projektplaner (Issues #26, #37, #42, #43)

> Stand: 2026-08-06 · Zyklus: Aschersleben/AWG (#20) · Status: **Etappen C1 + C2 + C3 umgesetzt**, C4 ist der nächste Schritt

Dieses Dokument umreißt den Umbau von Modul 0 zum Projektplaner mit Geschosslayout. Es ist die
Arbeitsgrundlage über mehrere Sessions. Jede Etappe wird einzeln umgesetzt, getestet und committet.

---

## 0. Festgelegte Rahmenentscheidungen

| Thema | Entscheidung |
|---|---|
| **Modulnummerierung** | bleibt **unverändert 0–8**. Kein Modul wird verschoben — die Nummern müssen zu den GitHub-Issues passen. Neue Module hängen sich hinten an (ab **9**). |
| **Module 2 / 3 / 5** | in der Navigation ausgeblendet (`versteckt: true` in `navbar.js`), fachlich unverändert wirksam. Zyklus-Fokus nach #20. |
| **Modul 0** | wird der **Projektplaner**: Projekt → Geschosse → Wände, Geschosslayout auf Plangrundlage. |
| **Bauteilkatalog** | **bleibt in Modul 0**, aber als **Popup** — kein eigenes Katalogmodul. #37 wird entsprechend umgeschrieben (s. §4, Schritt B). |
| **Planmaßstab** | **Kalibrierlinie** als Standardweg **plus** direkte Maßstabseingabe für saubere Scans. |
| **Reihenfolge** | Schritt A (Nummerierung, erledigt) → Schritt B (#37/#42 umschreiben, kein Code) → Schritt C (Planer, eigene Session) → zuletzt #38 (20 AWG-Wände). |

---

## 1. Zielbild Modul 0

```
Projekt  (Kopfdaten, ein Bauteilkatalog)
 └── Gebäude
      └── Geschoss  (Geschosshöhe, Plan + Maßstab + Versatz)
           └── Wände  (Position im 125-mm-Raster → je eine gewohnte Wanddatei)
```

Bedienablauf:

1. Projekt anlegen/wählen; für das Projekt den **Bauteilkatalog** wählen (bearbeitbar im Popup).
2. Geschoss anlegen/wählen.
3. **Plan hochladen**, Maßstab setzen, Plan in **x/y verschieben**, bis er zum Raster passt.
4. Über dem Plan liegt ein **125-mm-Raster**. Mit **Wand-Werkzeug** Kästchen einfärben, mit
   **Radierer** korrigieren.
5. **„Wand hinzufügen"** → die gezeichnete Wand erscheint in der gewohnten Wandliste darunter und
   wird wie bisher in Modul 1 detailliert geplant.

### Was sich ausdrücklich **nicht** ändert

- **Modul 1 bleibt der einzige Schreiber des Wandelements.** Modul 0 legt Wände an (wie heute) und
  hält ihre **Lage**; die Geometrie/Statik-Wahrheit bleibt beim Wandelement.
- **Wanddateien bleiben Format `SEMBLA-Projekt` v2, unverändert.** Der Planer referenziert sie nur.
- **Katalogformat v1** bleibt unverändert.
- Core, Engine, BOM, Zeichnung, Montage, IFC: **unberührt**.

---

## 2. Datenmodell

### 2.1 Neue Ebene: Projektmappe

Die Lage-/Strukturdaten liegen **getrennt** vom Wandelement. Das ist bewusst: so kann Modul 1 die
Layoutdaten gar nicht kaputtschreiben, und die Einbahnstraßen-Regel bleibt heil.

```jsonc
{
  "format": "SEMBLA-Projektmappe",
  "version": 1,
  "projekt":  { "id": "prj-…", "name": "Aschersleben AWG", "kopfdaten": { … } },
  "katalog":  "katalog.json",              // Dateiname im Mappen-Ordner (optional)
  "gebaeude": [{
    "id": "geb-…", "name": "Haus A",
    "geschosse": [{
      "id": "gs-…", "name": "EG",
      "hoehe_mm": 2500,                     // Vorgabe für neue Wände dieses Geschosses
      "plan": {
        "datei": "plan/eg.png",
        "mm_je_pixel": 12.5,                // aus der Kalibrierung
        "versatz_x_mm": 0, "versatz_y_mm": 0
      },
      "waende": [{
        "id": "wnd-…",                      // stabil, maßgebend
        "name": "EG-W01",
        "datei": "waende/EG-W01.json",      // gewohnte Wanddatei (SEMBLA-Projekt v2)
        "start_grid": { "x": 4, "y": 12 },
        "richtung": "x",                    // "x" | "y"
        "laenge_grid": 24                   // 24 × 125 mm = 3000 mm
      }]
    }]
  }]
}
```

**Rasterkoordinaten sind die Wahrheit, nicht Pixel.** Der Plan wird ans Raster geschoben, nicht
umgekehrt. Deshalb überleben die Wandpositionen einen Planwechsel oder eine Neukalibrierung
unbeschadet.

**Referenzierung:** über die **stabile `id`**, der Dateiname ist nur der Fundort. Weichen beide
voneinander ab, wird das **sichtbar gemeldet** — nichts wird geraten (Projektregel: keine stille
Heuristik).

### 2.2 Ableitung Zeichnung → Wandelement

| Aus der Zeichnung | Ergebnis |
|---|---|
| Zahl der eingefärbten Kästchen in Laufrichtung | **Länge** = `laenge_grid × 125 mm` |
| Startkästchen + Richtung | **Lage** (bleibt in der Projektmappe) |
| Geschosshöhe | **Höhe** als Vorgabe der neuen Wand |
| — | Öffnungen, Staffelung, Wandtyp, Dicke: **wie bisher in Modul 1** |

Die Wanddicke wird im Plan nur **dargestellt** (aus der Wand gelesen), nicht gezeichnet — sonst
gäbe es zwei Wahrheiten für dieselbe Größe.

### 2.3 Speicherschicht (`storage.js`)

- `SCHEMA_VERSION` **3 → 4**. Neuer Schlüssel `sembla:projektmappe`, dazu `sembla:aktiv:projekt`,
  `:gebaeude`, `:geschoss`. `sembla:elemente` / `sembla:aktiv` bleiben **wie sie sind** — die
  Wandliste ist weiterhin der Wandspeicher.
- **Migration bestehender Stände:** vorhandene Wände wandern in ein automatisch angelegtes
  „Projekt ohne Plan" → Gebäude → Geschoss, **ohne** Lagedaten (die gibt es schlicht nicht und
  werden nicht erfunden). Kein Datenverlust, keine Rückfrage nötig.
- Der **aktive-Wand-Zeiger bleibt bestehen** — Modul 1/4/7 funktionieren unverändert weiter, sie
  merken vom Planer nichts.

### 2.4 Planbild — nicht in den localStorage

Ein Geschossplan ist schnell 2–10 MB; der localStorage bricht bei ~5 MB und nimmt dann **alles**
mit. Planbilder gehören deshalb in **IndexedDB** (eigene kleine Schicht, DOM-frei, eigene Tests →
erfüllt die shared-Regel b). In der Projektmappe steht nur der Dateiname.
Die Browsergrenzen werden dokumentiert (Akzeptanzkriterium aus #26).
*Umgesetzt in C3 als `docs/shared/sembla-plan.js` (s. §9) — der Baustein trägt außer der Ablage auch
Formatprüfung, Kalibriermathematik und Rasteroverlay, deshalb der sprechendere Name.*

---

## 3. Projektmappe als Datei

Beim Export entsteht ein **Ordner bzw. ZIP**:

```
Aschersleben-AWG/
├── projekt.json          ← Projektmappe (oben), referenziert alles Weitere
├── katalog.json          ← Bauteilkatalog v1 (unverändert)
├── plan/ eg.png · og.png
└── waende/ EG-W01.json · EG-W02.json · …   ← gewohnte Wanddateien v2, unverändert
```

- **Export:** ZIP über das vorhandene `zip.js` (STORE+CRC32, keine Fremd-Lib) — schon da.
- **Import:** ZIP **oder** Ordner (`<input webkitdirectory>`). Zum ZIP-**Lesen** fehlt bisher die
  Gegenrichtung; für STORE-Einträge sind das wenige Zeilen, für komprimierte Einträge reicht das
  native `DecompressionStream('deflate-raw')` — weiterhin **keine Fremd-Lib**.
- Der bestehende **Einzelwand**-Import/-Export bleibt daneben erhalten und unverändert.

---

## 4. Etappen

Schritt A ist erledigt (Nummerierung festgelegt, Module 2/3/5 ausgeblendet).

### Schritt B — #37/#42 umschreiben  *(kein Code)*
Entschieden: **kein eigenes Katalogmodul.** Die Produktpflege bleibt in Modul 0 und wandert dort in
ein **Popup**, damit die Hauptfläche frei für Projektplanung und Geschosslayout wird. Die eigentliche
Umbauarbeit ist damit **Etappe C6** — Schritt B ist reine Issue-Pflege:

- **#37** umschreiben: Ziel ist nicht mehr „eigenes Modul", sondern „Katalogpflege als Popup,
  sichtbar getrennt von der Projektplanung". Die übrigen Kriterien (Projekt- ↔ Katalogim-/-export
  bleiben getrennt, Kataloge v1 kompatibel, nutzbarer Standardkatalog, Tests auf der echten
  Oberfläche) bleiben **unverändert gültig**.
- **#42** anpassen: das Kriterium „Das eigene Katalogmodul (#37) kann den Standardkatalog laden…"
  verweist künftig auf das Popup statt auf ein Modul.
- **#43** (Konfigurationsmodul) bleibt davon unberührt — das ist eine eigene Frage.
- **CLAUDE.md** nachziehen: Modul 0 bleibt alleiniger Pflegeort für Produkte und Preise (also
  weiterhin korrekt), ergänzt um „Pflege liegt im Popup, Hauptfläche ist Projektplanung".

**Bewusst in Kauf genommen:** Modul 0 trägt damit zwei Verantwortungen (Projektplanung +
Produktstammdaten). Das Popup hält sie in der Oberfläche getrennt; die Trennung ist eine
UI-Konvention, keine strukturelle mehr.

### Schritt C — der Planer  *(neue Session, in Etappen)*

| Etappe | Inhalt | Fertig, wenn |
|---|---|---|
| **C1 ✅** | Datenmodell + Speicherschicht + Migration (§2.3), ohne UI | **erledigt** (s. §7) |
| **C2 ✅** | Modul-0-UI: Projekt/Gebäude/Geschoss anlegen & wählen, Wandliste je Geschoss, Roundtrip nach Modul 1 | **erledigt** (s. §8) |
| **C3 ✅** | Planupload, Kalibrierung, x/y-Versatz, 125-mm-Rasteroverlay (reine Anzeige) | **erledigt** (s. §9) |
| **C4** | Wand-Werkzeug + Radierer + „Wand hinzufügen" | Gezeichnete Wand landet mit korrekter Länge in der Wandliste |
| **C5** | Projektmappe Export/Import (ZIP + Ordner, §3) | Roundtrip: exportieren, Browserdaten löschen, importieren, identischer Stand |
| **C6** | Katalogwahl je Projekt + Pflege-Popup (setzt Schritt B um) | Katalog hängt am Projekt, Pflege liegt im Popup, Hauptfläche bleibt Projektplanung |

**C2 ist der Punkt, ab dem der Planer echten Nutzen bringt** — C3/C4 sind der Komfort obendrauf.
Wenn die Zeit knapp wird, ist hier die Sollbruchstelle.

### Danach — #38: 20 AWG-Wände
Erst wenn C steht. Braucht zusätzlich die fachliche Freigabe der 20 Fälle durch das Projektteam
(keine vertraulichen Pläne ins öffentliche Repo — nur unkritische Eckdaten).

---

## 5. Offene Fragen

*Entschieden:* Katalog = Popup in Modul 0 (kein eigenes Modul) · Maßstab = Kalibrierlinie **und**
Zahleneingabe. Beides oben in §0 eingetragen.

*Zu Beginn von C1 entschieden (2026-08-06) und als Regeln festgeschrieben:*

1. **Nur orthogonale Wände** — waagerecht/senkrecht im Raster. Schrägen und Ecken/Anschlüsse später
   und ausdrücklich; es werden keine Ecken erfunden. → **[L-2]**
2. **Wandhöhe je Geschoss** als Vorgabe, in Modul 1 überschreibbar, nie zurückgeschrieben. → **[L-5]**
3. **Mehrere Gebäude** — Ebene im Modell vollständig vorhanden, UI zeigt zunächst ein Gebäude. → **[L-6]**

Weiterhin offen:

*Zu Beginn von C3 entschieden (2026-08-06) und als Regel festgeschrieben:*

4. **Planformate** — zulässig sind **PNG, JPEG, WebP** bis 20 MB. **PDF wird abgewiesen**: der
   Format-Spike endet eindeutig negativ, weil jede PDF-Darstellung im Browser eine Fremdbibliothek
   (PDF.js o. ä.) im Betrieb verlangte — und genau das schließt die Betriebsregel der Suite aus
   (kein CDN, keine Fremd-Lib außer Three.js in Modul 6). Der Weg ist ausdrücklich: PDF vorher im
   PDF-Programm als Bild exportieren (150–300 dpi). Die Meldung nennt diesen Weg. → **[L-8]**

---

## 6. Regelwerk

Der Planer bringt neue Fachregeln (Rasterbindung, Lage/Orientierung, Referenzintegrität
Projektmappe↔Wanddatei). Nach Projektregel gilt: **erst Regel-IDs vergeben und ins Handbuch
(Kapitel 16, `build-handbuch.mjs`), dann implementieren, dann Regressionstest.**

Festgelegt in **Kapitel 16.9 „Projektstruktur & Geschosslayout (Modul 0) [L]"**:

| ID | Kurz |
|---|---|
| **[L-1 · MUSS]** | Rasterkoordinaten sind die Wahrheit — ganzzahlig im 125-mm-Raster, nie Pixel; krumme Lagen werden abgewiesen, nicht gerundet |
| **[L-2 · MUSS]** | Nur orthogonale Wandlagen (x/y); keine Schrägen, keine erfundenen Ecken/Anschlüsse |
| **[L-3 · MUSS]** | Lage und Wandelement bleiben getrennt; Länge nur als Vorgabe beim Anlegen, Abweichung wird gemeldet statt angeglichen |
| **[L-4 · MUSS]** | Referenz über die stabile `id`, Dateiname nur Fundort; verwaiste Einträge und unverortete Wände werden gemeldet, nie still bereinigt |
| **[L-5]** | Geschosshöhe ist Vorgabe, nicht Wahrheit; kein stilles Runden aufs Lagenraster |
| **[L-6]** | Struktur Projekt→Gebäude→Geschoss→Wand vollständig, Oberfläche zunächst mit einem Gebäude; genau eine Mappe, ein aktives Geschoss |
| **[L-7 · MUSS]** | Verlustfreie, idempotente Übernahme bestehender Stände ohne erfundene Lagedaten |
| **[L-8 · MUSS]** | Planbild nicht in den localStorage (IndexedDB); Mappe hält nur Dateiname, Bildmaße, Maßstab, Versatz; PNG/JPEG/WebP bis 20 MB, PDF wird abgewiesen |
| **[L-9 · MUSS]** | Der Plan ist Hintergrund, keine Datenquelle: Maßstab/Versatz ausdrücklich gesetzt, ohne Kalibrierung kein Raster, Planwechsel ändert keine Wandlage |

---

## 7. Umsetzungsstand C1 (2026-08-06)

- **Regelwerk:** Kapitel 16.9 `[L-1]`…`[L-8]` in `build-handbuch.mjs`, Handbuch neu gebaut.
- **Neuer Baustein `docs/shared/sembla-projektmappe.js`** (rein/DOM-frei, shared-Regel b): Format
  `SEMBLA-Projektmappe` v1 (`MAPPE_VERSION`, eigene Versionsachse), Normalisierung, Validierung,
  Struktur-Operationen (alle rein — sie liefern eine neue Mappe), Lage-Prüfung, `hoehenVorgabe`,
  `laengenAbgleich`, `pruefeReferenzen`, `uebernehmeElemente`.
- **`docs/shared/storage.js`:** `SCHEMA_VERSION` **3 → 4**, Slot `sembla:projektmappe`, Zeiger
  `sembla:aktiv:gebaeude`/`:geschoss`, Funktionen `holeMappe`/`setzeMappe`/`mappeOderNeu`/
  `aendereMappe`/`verorteWand`/`wandVerortung`/`mappeReferenzen`/`importiereMappeText`, Migration
  `_migriereProjektmappe`. `loesche()` räumt den Mappen-Eintrag der gelöschten Wand mit ab
  (umgekehrt nie).
- **Tests:** `tests/module/test-projektmappe.mjs` (75 Prüfungen, je Regel benannt) und Abschnitt 13
  in `tests/module/smoke_storage.mjs` (Migration, Persistenz, Verortung, Referenzabgleich,
  Datei-Roundtrip). Beide hängen an `npm run test:modul0`; `npm run test:all` ist grün.

**Abweichung von §2.3 (bewusst):** es gibt **keinen** Schlüssel `sembla:aktiv:projekt` — es existiert
genau eine Mappe und damit genau ein Projekt, ein zweiter Zeiger wäre eine zweite Wahrheit ([P-6]).
Und die Lage steht als **ein `lage`-Objekt** am Wandeintrag statt als drei flache Felder, damit
„unverortet" sauber als `lage: null` darstellbar ist ([L-7]).

---

## 8. Umsetzungsstand C2 (2026-08-06)

**Kein neues Regelwerk:** C2 setzt ausschließlich die bereits festgeschriebenen Regeln
`[L-1]`…`[L-7]` in der Oberfläche um — es gibt keine neue Regel-ID und keine Änderung an Kapitel 16.

- **Modul 0 (`docs/index.html`)** hat einen Abschnitt **„Projektplanung"** über dem Anlegen-Formular:
  Projekt anlegen/umbenennen, Gebäude anlegen/wählen/umbenennen/löschen, Geschosse ebenso plus
  **Geschosshöhe** setzen/aufheben. Alle Struktur-Änderungen laufen über die **reinen** Operationen
  aus `sembla-projektmappe.js`; ein Fehlschlag wird benannt und lässt den Speicher unverändert.
- **Wände gehören zu einem Geschoss:** neu angelegte *und* importierte Wände werden im **aktiven
  Geschoss** eingetragen — mit `lage: null` ([L-4], es wird keine Lage erfunden). Ohne aktives
  Geschoss bleibt die Wand nicht eingetragen und wird als solche gemeldet. Nachträglich zuordnen
  geht über die Zeilenaktion **„Zuordnen"**.
- **Wandliste** trägt die Spalte **Geschoss / Lage** (inkl. gemeldeter Längenabweichung nach [L-3])
  und eine **Ansichtsauswahl** (alle / aktives Geschoss / nicht eingetragen) — der Filter ändert nur
  die Anzeige. Neu: **„In Modul 1 planen"** (aktiv setzen + Sprung) als Roundtrip.
- **Höhenvorgabe [L-5]:** die Geschosshöhe wird beim Geschosswechsel in das Feld „Höhe" des
  Anlegen-Formulars geschrieben, bleibt frei änderbar und wird nie zurückgeschrieben. Eine Höhe
  außerhalb des 200-mm-Lagenrasters wird **angenommen und benannt**, nie gerundet.
- **Löschen** von Geschoss/Gebäude entfernt nur die Struktur; die Wandelemente bleiben erhalten und
  gelten danach als „nicht eingetragen" ([L-4] — keine stille Bereinigung). Verwaiste Einträge und
  unverortete Wände stehen sichtbar in der Warnbox.
- **Neu in `sembla-projektmappe.js`:** `setzeGeschossHoehe` (rein, weist nicht positive Werte ab).
  **Neu in `storage.js`:** `setzeAktivesGebaeude`/`aktivesGebaeude` (ein Gebäudewechsel hebt einen
  fremden Geschosszeiger auf, statt ihn umzubiegen) und `umbenennen` führt den **Anzeigenamen** der
  Mappe mit — die Referenz bleibt die `id` ([L-4]).
- **Tests:** neuer Abschnitt 8 in `tests/module/smoke_start.mjs` (57 Prüfungen an der echten
  Oberfläche: Struktur, Höhenvorgabe, Filter, Zuordnen, [L-3]-Abweichung, Roundtrip, Reload-Festigkeit),
  erweitert `test-projektmappe.mjs` (Geschosshöhe) und `smoke_storage.mjs` (Gebäudezeiger,
  Namenspflege). `npm run test:all` ist grün.

**Offen (bewusst nicht in C2):** Planupload/Kalibrierung/Rasteroverlay (C3), Wand-Werkzeug und
Einzeichnen der Lage (C4), Mappen-Export/-Import als ZIP (C5), Katalogwahl je Projekt + Pflege-Popup
(C6). Bis C4 sind alle Wände **eingetragen, aber unverortet** — das ist der dokumentierte Normalfall.

---

## 9. Umsetzungsstand C3 (2026-08-06)

**Regelwerk:** `[L-8]` ist von der offenen Zielregel zur **Muss-Regel** geworden (Ablage in
IndexedDB, zulässige Formate, 20-MB-Grenze), und `[L-9]` ist **neu**: *Der Plan ist Hintergrund,
keine Datenquelle.* Beide stehen in Kapitel 16.9 (`build-handbuch.mjs`), das Handbuch ist neu gebaut.

- **Neuer Baustein `docs/shared/sembla-plan.js`** (rein/DOM-frei, shared-Regel b): Formatprüfung
  ([L-8]), Kalibrierung aus zwei Punkten + realer Strecke, Umrechnung Bildpixel ↔ Raster-mm,
  Rasterlinien, `planSvg()` als SVG-Zeichenkette und die **eigene IndexedDB** (`sembla-plaene`, ein
  Datensatz je Geschoss-Kennung). Die IndexedDB-Fabrik ist für Tests einschleusbar
  (`setzeIndexedDB`), sodass im Test der **echte** Datenbankcode läuft.
- **`sembla-projektmappe.js`:** `normPlan`/`planFehler` (in `validiereMappe` verdrahtet) und die
  reinen Operationen `setzePlan`/`setzePlanAnsicht`. Der Planblock trägt jetzt zusätzlich `typ`,
  `breite_px`, `hoehe_px` — **optionale Zusatzfelder**, `MAPPE_VERSION` bleibt **1** (Altstände ohne
  Planfeld laden warnungsfrei).
- **`storage.js`:** `setzeGeschossPlan`/`setzeGeschossPlanAnsicht`/`geschossPlan`. `SCHEMA_VERSION`
  bleibt **4** — es gibt keine Migration, weil es vorher keine Plandaten gab.
- **Modul 0 (`docs/index.html`)** hat den Abschnitt **„Geschossplan"**: Upload (PNG/JPEG/WebP),
  Maßstab per **Zahl** oder **Kalibrierlinie** (zwei Klicks im Plan + reale Länge in mm), Versatz
  über Felder **oder Ziehen mit der Maus**, Zoom, Plan entfernen. Das Rasteroverlay zeigt das
  125-mm-Raster mit hervorgehobener Meterlinie. Der `viewBox` des SVG liegt in **Bildpixeln** —
  damit ist ein noch **nicht** kalibrierter Plan bedienbar, ohne einen Maßstab zu erfinden.
- **Ohne Kalibrierung kein Raster** ([L-9]) und ein **neues Bild setzt Maßstab und Versatz
  zurück** — beides wird gemeldet, nichts geraten. Fehlt das Bild (anderer Browser, gelöschte
  Websitedaten), bleiben Maßstab und Versatz erhalten und der fehlende Plan wird benannt.
- **Wandlagen bleiben unberührt** ([L-1]): Kalibrierung, Versatz, Planwechsel und Planlöschung
  ändern keine Lage. Wird ein **Geschoss oder Gebäude gelöscht**, wird sein Planbild **mit**
  entfernt und das gesagt — ein unerreichbarer Rest in der Plan-Datenbank wäre stiller Müll.
- **Format-Spike PDF (Akzeptanzkriterium aus #26): negativ entschieden.** Jede PDF-Darstellung im
  Browser verlangt eine Fremdbibliothek im Betrieb, die die Suite ausschließt. Ein PDF wird deshalb
  **benannt abgewiesen**, mit dem Hinweis, es vorher als Bild zu exportieren (150–300 dpi).
- **Tests:** neu `tests/module/test-plan.mjs` (65 Prüfungen, je Regel benannt), neuer Abschnitt 9 in
  `tests/module/smoke_start.mjs` (33 Prüfungen an der echten Oberfläche: Upload, PDF-Abweisung,
  Größengrenze, beide Maßstabswege, Versatz, Reload-Festigkeit, Planwechsel, Löschen samt Bild),
  erweitert `test-projektmappe.mjs` (Planblock, 104 Prüfungen) und `smoke_storage.mjs` (Abschnitt
  13f). `npm run test:all` ist grün; `test-plan.mjs` hängt an `npm run test:modul0`.

**Offen (bewusst nicht in C3):** Wand-Werkzeug/Radierer und das Einzeichnen der Lage (C4),
Mappen-Export/-Import als ZIP inklusive Planbild (C5), Katalogwahl je Projekt + Pflege-Popup (C6).
Bis C4 sind alle Wände **eingetragen, aber unverortet** — das bleibt der dokumentierte Normalfall.
