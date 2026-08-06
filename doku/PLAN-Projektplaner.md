# Plan: Modul 0 wird Projektplaner (Issues #26, #37, #42, #43)

> Stand: 2026-08-06 · Zyklus: Aschersleben/AWG (#20) · Status: **Entwurf, noch nichts implementiert**

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
mit. Planbilder gehören deshalb in **IndexedDB** (eigene kleine Schicht `docs/shared/plan-speicher.js`,
DOM-frei, eigene Tests → erfüllt die shared-Regel b). In der Projektmappe steht nur der Dateiname.
Die Browsergrenzen werden dokumentiert (Akzeptanzkriterium aus #26).

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
| **C1** | Datenmodell + Speicherschicht + Migration (§2.3), ohne UI | Tests grün: Anlegen/Lesen/Reload/Migration alter Stände |
| **C2** | Modul-0-UI: Projekt/Gebäude/Geschoss anlegen & wählen, Wandliste je Geschoss, Roundtrip nach Modul 1 | Mehrere Wände über mehrere Geschosse, Reload verlustfrei — **deckt den Großteil von #26 ab** |
| **C3** | Planupload, Kalibrierung, x/y-Versatz, 125-mm-Rasteroverlay (reine Anzeige) | Plan liegt passgenau unter dem Raster, überlebt Reload |
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

Offen, aber mit Vorschlag — wird zu Beginn der jeweiligen Etappe festgeklopft:

1. **Nur orthogonale Wände?** Vorschlag: ja, erst mal nur waagerecht/senkrecht im Raster. Schrägen
   und Ecken/Anschlüsse später und ausdrücklich — #26 verbietet, Ecken heuristisch zu erfinden.
2. **Wandhöhe je Geschoss** als Vorgabe (Vorschlag: ja, in Modul 1 überschreibbar).
3. **Mehrere Gebäude** — im Modell vorgesehen, in der UI zunächst „ein Gebäude", ohne dass das
   Format sich später ändern muss.
4. **Planformate** — PNG/JPG sicher; PDF erst nach einem Spike (#26 verlangt dafür ausdrücklich
   einen belastbaren Format-Spike vor der Festlegung).

---

## 6. Regelwerk

Der Planer bringt neue Fachregeln (Rasterbindung, Lage/Orientierung, Referenzintegrität
Projektmappe↔Wanddatei). Nach Projektregel gilt: **erst Regel-IDs vergeben und ins Handbuch
(Kapitel 16, `build-handbuch.mjs`), dann implementieren, dann Regressionstest.** Vorgesehener neuer
Präfix: **[L-…]** (Layout). Wird zu Beginn von C1 festgelegt.
