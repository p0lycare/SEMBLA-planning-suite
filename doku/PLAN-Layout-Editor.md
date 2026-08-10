# Plan: Layout-Editor mit Constraints (Issue #26, Etappen C3.2 / C4)

> Stand: 2026-08-08 · **Etappen C3.2, C4a, C4b, C4c und C5 umgesetzt** (Regelwerk, Löser, Datenmodell,
> Migration — s. §7; Editor-Seite mit Zeichnen/Ziehen/Plan — s. §8; am 2026-08-08 nachgeschärft:
> Zeichnen ab dem Drücken, Wandkanten auf dem Raster, aktiv ≠ ausgewählt, Größengriffe, 90° drehen;
> Bemaßen, Fixieren, Widerspruch/Redundanz und Undo/Redo — s. §9; schwebende Bauteilliste,
> Referenzgeschoss und zwei Bedienkorrekturen — s. §10; vollständiges Projektarchiv — s. §11) ·
> löst den bisherigen §11 („Feinschliff Layout-Editor") in
> [`PLAN-Projektplaner.md`](PLAN-Projektplaner.md) ab.

## 0. Anlass

Neue fachliche Information vom **2026-08-07**: die Abstände der Wände zueinander sind **nicht**
rastergebunden. Von Wandmitte zu Wandmitte treten in x und y Maße auf, die **kein Vielfaches von
125 mm** sind.

Damit fällt die tragende Annahme des bisherigen Planer-Entwurfs — **[L-1]** („Rasterkoordinaten
sind die Wahrheit") — für die *Position*. Unverändert gültig bleibt sie für die *Länge*: Wände sind
weiterhin **125 mm breit** und **n × 125 mm lang**.

Aus dem geplanten „Kästchen einfärben"-Werkzeug (Etappe C4) wird deshalb ein **Skizzenmodus nach
CAD-Vorbild**: Wände liegen frei in x/y und werden durch **Bemaßungen** gehalten.

---

## 1. Warum kein geometrischer Solver als Fremdbibliothek

Geprüft und **verworfen**: planegcs/FreeCAD-WASM, SolveSpace-WASM, kiwi.js (Cassowary).

Alle Wände sind achsparallel. Damit zerfällt die Geometrie in **zwei unabhängige eindimensionale
Probleme** (x und y). Jede Bemaßung ist eine Gleichung der Form

```
x_j − x_i = d          (d in mm, konstant)
```

Das ist ein **lineares Differenzsystem**, kein nichtlineares Gleichungssystem: keine Iteration,
keine Jacobi-Matrix, keine Toleranz, keine Startwertabhängigkeit, keine Mehrdeutigkeit. Der Winkel
ist bei uns keine Unbekannte, sondern ein diskretes Feld (`richtung: "x"|"y"`) — „horizontal" und
„vertikal" sind **keine** zu lösenden Constraints, sondern eine Eigenschaft der Wand.

Gegen die Fremdbibliotheken sprechen im Einzelnen:

- **planegcs / SolveSpace:** 1–2 MB WASM, Fremdlizenz, und vor allem **iterative** Lösung. Das
  Ergebnis hängt vom Startwert ab und ist nicht bit-genau reproduzierbar — unvereinbar mit der
  Projektregel „vollständig regelbasiert und deterministisch".
- **kiwi.js (Cassowary):** linear und schnell, aber für UI-Layout gebaut. Es löst mit Gewichten
  **immer irgendetwas**, statt „unterbestimmt" zu melden. Genau die Aussage, die wir für die
  Farbkodierung und die Widerspruchsmeldung brauchen, liefert es am schlechtesten.

**Eigenbau** ist hier nicht die aufwendigere, sondern die einfachere und aussagekräftigere Lösung:
**Union-Find mit Offset** (gewichtete Vereinigungssuche), geschätzt 200–300 Zeilen in
`docs/shared/sembla-constraints.js`, rein/DOM-frei, mit eigenen Tests (shared-Regel b).

Verfahren je Achse:

1. Jede Wand hat **einen** Positionsknoten je Achse; dazu ein **Grundknoten** (Geschossursprung).
2. Eine Bemaßung verbindet zwei Knoten mit bekanntem Abstand; beim Verbinden wird der Offset zur
   Wurzel mitgeführt.
3. **Bestimmt in dieser Achse** = der Knoten hängt am Grundknoten. Sonst frei.
4. **Widerspruch** = zwei bereits verbundene Knoten sollen einen Abstand bekommen, der nicht zum
   gespeicherten Offset passt. Wird **benannt** (beide Maße + Differenz in mm), nie still korrigiert.
5. **Ziehen** einer freien Wand verschiebt ihre gesamte starre Gruppe.

Laufzeit O(n·α) — bei jedem Mausmove neu lösbar. **Exakte Arithmetik:** alle Werte sind Vielfache
von 0,5 mm (Bemaßungen ganzzahlig in mm, Kantenoffsets ±62,5 mm) und damit in IEEE-754 **exakt**
darstellbar. Es gibt keinen Rundungsdrift und keine Toleranzschwelle.

**Wann der Eigenbau nicht mehr trägt:** schräge Wände, Winkelmaße, Symmetrie-/Gleichheits-Constraints
ohne Zahlenwert. Dann wird das System nichtlinear und die Struktur muss ersetzt werden. Das ist ein
sauberer Bruchpunkt — bis dahin sparen wir nichts, wenn wir die Komplexität vorwegnehmen.

---

## 2. Datenmodell

### 2.1 Wandlage — mm statt Raster

Die Lage steht weiterhin **am Wandeintrag des Geschosses** in der Projektmappe (nicht am
Wandelement — die Einbahnstraße aus [P-1] bleibt heil).

```jsonc
"lage": {
  "start_mm":  { "x": 3410, "y": 1250 },   // Punkt auf der Mittellinie, min-Ende der Wand
  "richtung":  "x",                        // "x" | "y"
  "laenge_grid": 24                        // 24 × 125 mm = 3000 mm
}
"lage": null                               // unverortet — weiterhin zulässig
```

- `start_mm` liegt auf der **Mittellinie** der Wand, am Ende mit der kleineren Koordinate, und ist ein
  **Vielfaches von 0,5 mm**. *Nicht* ganzzahlig: die 125 mm breite Wand legt jede Längskante genau
  62,5 mm neben ihre Mittellinie, ein Maß von einer Kante auf eine Mittellinie landet also
  zwangsläufig auf einem halben Millimeter. Kleiner als 0,5 mm wird es nie, und 0,5er sind in
  IEEE-754 exakt — kein Drift ([K-5]). Die **Bemaßungen selbst** bleiben ganzzahlig ([K-12]).
- Die Länge bleibt im **125-mm-Raster** (`laenge_grid`), die Breite ist konstant 125 mm.
- `start_mm` ist der zuletzt gültige Stand. Wo eine Achse durch Bemaßungen **bestimmt** ist, ist das
  Lösungsergebnis maßgebend; wo sie **frei** ist, gilt der gespeicherte Wert.

### 2.2 Bezugspunkte — je Achse genau drei

Aus `lage` ergeben sich je Achse drei anklickbare Bezüge. Für eine Wand in Richtung `x`:

| Achse | `min` | `mitte` | `max` |
|---|---|---|---|
| **x** (längs) | Stirnkante Anfang | Mittellinie quer (gestrichelt) | Stirnkante Ende |
| **y** (quer) | Längskante | Mittellinie längs (gestrichelt) | Längskante |

Bei Richtung `y` genau umgekehrt. **Damit sind auch die kurzen Stirnkanten bemaßbar** — die Bezüge
heißen in beiden Achsen gleich (`min`/`mitte`/`max`), es gibt keine Sonderbehandlung.

Offsets zur Ankerkoordinate: längs `0 / +L/2 / +L`, quer `−62,5 / 0 / +62,5`.

### 2.3 Bemaßungen — neu im Geschoss

```jsonc
"geschoss": {
  …,
  "bemassungen": [{
    "id":    "bm-…",
    "achse": "x",                                  // "x" | "y" — welche Koordinate sie festlegt
    "von":   { "wand": "wnd-A", "bezug": "mitte" },// null = Geschossursprung
    "bis":   { "wand": "wnd-B", "bezug": "min" },
    "mass_mm": 3410,                               // ganzzahlig, treibend
    "text_mm": { "x": 0, "y": -300 }               // nur Darstellung, optional (s. u.)
  }]
}
```

`text_mm` ist **ausschließlich die Position der Beschriftung** (Issue #51): ein Versatz der
dargestellten Maßzahl in Millimetern, in Weltkoordinaten `x`/`y` und damit unabhängig von Achse und
Zoom. Es verschiebt **nie** die Maßlinie, die Hilfslinien oder einen Bezugspunkt, geht **nie** in
den Löser ein ([K-5]) und ändert **nie** den Maßwert. Fehlt es, steht die Zahl an ihrer automatisch
berechneten Stelle — es wird keine erfunden. Es ist ein optionales Zusatzfeld ohne eigene
Formatachse: kein Bump von `MAPPE_VERSION`.

Drei Sonderfälle fallen ohne eigenen Typ heraus:

- **Fixieren** = Bemaßung mit `von: null`, also **vom Geschossursprung** zur Wand. Der Ursprung ist
  ausdrücklich der **Start**, nicht das Ziel: umgekehrt gelesen kehrte sich das Vorzeichen um und
  ein „1000 mm vom Ursprung“ landete bei −1000. Das Werkzeug „Fixieren" ist reine
  Bedienkomfort-Oberfläche über genau diesem Objekt.
- **Längenmaß** = `von` und `bis` auf **derselben** Wand, `bezug: "min"`/`"max"`, `achse` = Längsachse.
  Es treibt `laenge_grid` (s. §2.4), nicht die Position.
- **Wanddicke** ist **nicht** bemaßbar — sie ist konstant 125 mm und hätte sonst zwei Wahrheiten.

### 2.4 Länge ist getrieben, nicht gelöst

Bewusste Vereinfachung: die Länge ist **keine** Solver-Unbekannte. Sie hat immer einen Wert, und ein
Längenmaß **schreibt** ihn (`laenge_grid`). Begründung:

- Der Solver bleibt ein reines Positionsproblem — `mitte` und `max` sind konstante Offsets. Wäre die
  Länge unbekannt, wäre `mitte = (min+max)/2` kein konstanter Offset mehr und die Union-Find-Struktur
  bräche.
- **„Bestimmt" bezieht sich damit ausdrücklich nur auf die Position.** Die Länge ist immer bekannt.
- Ein Längenmaß muss ein **Vielfaches von 125 mm** sein. Ein anderer Wert wird **abgewiesen** und
  nennt die beiden nächstliegenden gültigen Maße — es wird nicht still gerundet.
- **[L-3] bleibt unangetastet:** das Längenmaß ändert die Lage-Länge, **nie** das Wandelement. Eine
  Abweichung zwischen beiden wird weiterhin gemeldet, nicht angeglichen. Modul 1 bleibt der einzige
  Schreiber des Wandelements.

Ändert sich die Länge, wird neu gelöst: bestimmte Enden rücken auf ihre Sollposition zurück, freie
Enden bleiben stehen.

### 2.5 Formatversion und Migration

`MAPPE_VERSION` **1 → 2**:

- `lage.start_grid` → `lage.start_mm` (`x_mm = x_grid × 125`), `richtung`/`laenge_grid` unverändert.
- Neues, optionales Feld `bemassungen` je Geschoss (fehlt = leere Liste).

**Die Migration ist praktisch leer:** das Einzeichnen der Lage war Etappe C4 und ist nie umgesetzt
worden — es gibt im Bestand **keine einzige verortete Wand** (`lage` ist überall `null`). Die
Umrechnung wird trotzdem vollständig implementiert und getestet, damit ein exportierter Altstand
verlustfrei lädt ([L-7]).

`SCHEMA_VERSION` (localStorage) geht **5 → 6**, weil die gespeicherten Mappen mitwandern.
`PROJEKT_VERSION` (Wanddatei) und `KATALOG_VERSION` bleiben **unberührt** — der Editor fasst weder
Wandelement noch Katalog an.

---

## 3. Regelwerk

Neues **Kapitel 16.10 „Layout-Editor & Constraints (Modul 0) [K]"** in `build-handbuch.mjs`.
Nach Projektregel gilt: erst Handbuch, dann Implementierung, dann Regressionstest.

### 3.1 Geänderte Bestandsregeln

| ID | Änderung |
|---|---|
| **[L-1 · MUSS]** | **Neu gefasst.** Bisher: „Rasterkoordinaten sind die Wahrheit, ganzzahlig im 125-mm-Raster." Künftig: *Wand**positionen** sind ganzzahlig in **Millimetern**; **Länge** bleibt ganzzahlig im 125-mm-Raster, die **Breite** ist konstant 125 mm. Pixel sind nie die Wahrheit.* Grund: die realen Wandabstände sind nicht rastergebunden (§0) |
| **[L-2]** | **unverändert** — nur orthogonale Wandlagen |
| **[L-3]** | **unverändert** — Länge nur Vorgabe, Abweichung gemeldet statt angeglichen (§2.4) |
| **[L-9]** | **unverändert** — der Plan bleibt Hintergrund; Kalibrierung/Versatz ändern keine Position |

### 3.2 Neue Regeln [K]

| ID | Regel |
|---|---|
| **[K-1 · MUSS]** | **Getrennte Achsen.** Bemaßungen wirken je Achse (x/y) getrennt und unabhängig. Es gibt keine Regel, die beide Achsen koppelt |
| **[K-2 · MUSS]** | **Drei Bezüge je Achse:** `min`-Kante, `mitte` (Mittellinie), `max`-Kante — für Längs- **und** Stirnkanten identisch benannt. Weitere Bezugspunkte gibt es nicht |
| **[K-3 · MUSS]** | **Bemaßungen sind treibend.** Ein Maß ohne Zahlenwert existiert nicht; es gibt kein rein messendes Maß, das nachträglich zum treibenden wird |
| **[K-4 · MUSS]** | **Ein Grundbezug.** Einziger Grundbezug ist der Geschossursprung, und zwar als **Startbezug** (`von: null`) — als Ziel gelesen kehrte sich das Vorzeichen um (s. §2.3/§7). Ohne Kette dorthin ist keine Wand bestimmt — es wird kein Ersatzbezug erfunden, insbesondere nicht „die erste Wand" |
| **[K-5 · MUSS]** | **Deterministische Lösung.** Lineares Differenzsystem, exakte Arithmetik in 0,5-mm-Schritten, keine Iteration, keine Toleranz, keine Startwertabhängigkeit. Gleiche Eingabe ⇒ bit-genau gleiche Ausgabe |
| **[K-6 · MUSS]** | **Widerspruch wird benannt, nie aufgelöst.** Ein widersprüchliches Maß wird gespeichert und rot markiert; genannt werden beide beteiligten Maße und die Differenz in mm. Die Positionen behalten den letzten widerspruchsfreien Stand. Kein Gewichten, kein Mitteln, kein automatisches Löschen |
| **[K-7]** | **Redundanz ist ein Hinweis, kein Fehler.** Ein Maß, das widerspruchsfrei etwas bereits Bestimmtes wiederholt, wird als redundant gemeldet und bleibt wirksam |
| **[K-8 · MUSS]** | **Bestimmtheit ist sichtbar.** Farbregel: **hellblau** = nicht vollständig bestimmt · **schwarz** = in x und y bestimmt · **grün** = **aktive** Wand (genau eine, in Bearbeitung) · **rot** = fehlerhaft (Widerspruch **oder** Kollision nach [K-13]). Vorrang: rot > grün > schwarz/hellblau; die aktive Wand ist zusätzlich an ihren Griffen erkennbar. **Ausgewählt** können mehrere Wände sein — das ist reine Bedienung, bekommt **keine** eigene Zustandsfarbe, sondern nur einen Rahmen |
| **[K-9 · MUSS]** | **Ziehen ändert nie ein Maß.** Gezogen wird die gesamte starre Gruppe einer freien Wand. Eine in dieser Achse bestimmte Wand lässt sich nicht ziehen — der Grund wird genannt, statt still ein Maß zu ändern |
| **[K-10 · MUSS]** | **Positionsdaten leben im Geschoss** der Projektmappe (Lage **und** Bemaßungen), nie im Wandelement und nie in `eingaben` |
| **[K-11]** | **Längenmaß rastet nicht still.** Ein Längenmaß muss ein Vielfaches von 125 mm sein; ein anderer Wert wird abgewiesen und nennt die beiden nächstliegenden gültigen Maße ([L-3] bleibt gültig) |
| **[K-12]** | **Einheit ist Millimeter**, ganzzahlig, in Eingabe und Anzeige. Keine cm, keine m, keine Nachkommastellen in Bemaßungen |
| **[K-13 · MUSS]** | **Wände dürfen sich nicht überlappen.** Jede echte Flächenüberschneidung zweier 125-mm-Wandrechtecke desselben Geschosses ist eine **Kollision**: beide Wände werden rot markiert und das Paar samt Überlappungsmaß in mm benannt. Es wird **nichts** automatisch verschoben, gekürzt oder abgewiesen — die Wand bleibt, wo sie steht, und der Fehler bleibt sichtbar. **Bündiges Berühren** (Überschneidungsfläche 0) ist zulässig und keine Kollision. Daraus folgt: eine **Ecke** ist als **Stoß** zu zeichnen — eine Wand läuft durch, die andere stößt an ihre Längskante. Ein Eckverband wird nicht erfunden |

---

## 4. Der Editor

**Eigene Seite `docs/geschossplan.html`** — kein Popup und kein neues Modul:

- **Kein Popup:** ein Skizzenmodus braucht die volle Fläche, eine Werkzeugleiste, Tastenkürzel und
  eigenen Zustand (Auswahl, Undo). In einem Dialog neben den bestehenden Formular-Popups wäre er
  unbedienbar.
- **Kein Modul 9:** die Nummerierung 0–8 ist an die GitHub-Issues gebunden und bleibt stabil (§0 des
  Projektplaner-Plans). Fachlich gehört die Verortung zu Modul 0.
- Aufruf aus der Baumliste in Modul 0: **„Geschoss öffnen"**. Kein eigener Reiter in `navbar.js`.
- Modul 0 behält Baumliste, Popups und Planupload; der schwere Editor zieht dort aus.

### 4.1 Aufbau

- Vollflächige Zeichenfläche, links eine schmale Werkzeugleiste, unten eine Statuszeile
  („3 Wände ohne vollständige Bestimmung").
- Hintergrund: Geschossplan wie bisher (`sembla-plan.js`, Maßstab/Versatz unverändert, [L-8]/[L-9]).
- Das 125-mm-Raster bleibt Anzeige- und Einrasthilfe für **Längen**, nicht für Positionen.

### 4.2 Werkzeuge — bewusst vier

| Taste | Werkzeug | Verhalten |
|---|---|---|
| **Esc** | Auswahl/Ziehen (Standard) | Wand wählen, frei in x/y ziehen; die starre Gruppe wandert mit; bestimmte Achsen sind gesperrt ([K-9]) |
| **W** | Wand zeichnen | Startpunkt → Richtung → Länge; orthogonal ([L-2]), Länge rastet auf 125 mm |
| **D** | Bemaßen | zwei parallele Bezüge anklicken → Maß erscheint → Zahl in mm eintippen |
| **F** | Fixieren | Wand gegen den Geschossursprung festsetzen (= Bemaßung mit `von: null`), **je Achse einzeln** |

Dazu **Undo/Redo** (der Zustand ist ein JSON-Objekt, also billig — ohne fühlt sich ein Skizzenmodus
kaputt an), Zoom auf den Cursor, Pan mit Leertaste/mittlerer Maustaste. **Pan ≠ Versatz:** Pan
bewegt nur den Blick, `versatz_*_mm` bleibt unberührt, sonst wäre [L-9] verwässert.

### 4.3 Rückmeldung

- Bezüge leuchten beim Überfahren auf, damit klar ist, worauf bemaßt wird.
- Mittellinien gestrichelt, Kanten durchgezogen.
- Bemaßungen sind anklickbare Objekte: Wert ändern oder löschen.
- Farben nach **[K-8]**; ein Widerspruch nennt beide Maße und die Differenz in mm.

### 4.4 Aus dem alten C3.2 übernommen

Die fünf Punkte des bisherigen §11 gelten weiter, wandern aber in die neue Seite: Planupload ins
Geschoss-Popup, **Plan-Lock** (gesperrt = Ziehen bewegt den Plan nicht), Zoom/Pan als echte
Werkzeuge, **Kreuzmarker mit ausgesparter Mitte**, **gestrichelte und orthogonal gezwungene
Kalibrierlinie**.

### 4.5 Später

**Schwebende Bauteilliste** — ein Panel über der Zeichenfläche mit allen Wänden des Geschosses und
je einer Kurzbeschreibung (Name, Länge, Höhe, Wandtyp, Bestimmtheit). Auswahl in der Liste ↔ Auswahl
in der Zeichnung. **Mit C4c umgesetzt (§10).**

**Referenzgeschoss** — das darunterliegende Geschoss als blasse Umrisse mit einstellbarer Deckkraft,
nicht anklickbar (§6.3). **Ebenfalls mit C4c umgesetzt (§10).**

Ebenfalls später und ausdrücklich **nicht** in der ersten Ausbaustufe: Mehrfachauswahl, Kopieren,
Gleichheits-/Symmetrie-Constraints, Winkel, Bemaßungsstil von Hand, DXF-Import und ein
Projektieren-Werkzeug aus dem Plan.

---

## 5. Etappen (Neuschnitt)

| Etappe | Inhalt | Fertig, wenn |
|---|---|---|
| **C3.2 ✅** | Regelwerk (Kap. 16.10, [L-1] neu gefasst), `sembla-constraints.js`, Datenmodell + Migration `MAPPE_VERSION` 1→2 / `SCHEMA_VERSION` 5→6, Tests — **kein UI** | **erledigt** (s. §7) |
| **C4a ✅** | Neue Seite `docs/geschossplan.html`: Plan-Hintergrund, Zoom/Pan, Plan-Lock, Kalibrier-Feinschliff (§4.4), Wand zeichnen, Auswahl + Ziehen | **erledigt** (s. §8) |
| **C4b ✅** | Bemaßen, Fixieren, Farbcodierung, Widerspruchsmeldung, Undo/Redo | **erledigt** (s. §9) |
| **C4c ✅** | Schwebende Bauteilliste mit Kurzbeschreibung; Referenzgeschoss mit einstellbarer Deckkraft; zwei Bedienkorrekturen (Doppelklick auf die Maßzahl, kein Textcursor über der Beschriftung) | **erledigt** (s. §10) |
| **C5 ✅** | Vollständiges Projektarchiv als ZIP/Ordner inkl. Planbildern und Bemaßungen | **erledigt** (s. §11): vorab geprüft, bestätigt, atomar, identischer Roundtrip |

Der bisherige C4-Inhalt („Kästchen einfärben + Radierer") entfällt ersatzlos — er beruhte auf der
widerlegten Rasterannahme.

### 5.1 Tests

- **`tests/module/test-constraints.mjs`** (neu): Union-Find mit Offset, Bestimmtheit je Achse,
  Widerspruch mit benannter Differenz, Redundanz, Gruppenverschiebung, Determinismus (gleiche
  Eingabe zweimal ⇒ identisches Ergebnis), exakte 0,5-mm-Arithmetik. Je Prüfung wird die Regel-ID
  genannt.
- **`test-projektmappe.mjs`**: `lage` in mm, `bemassungen`, Migration 1→2, Validierung.
- **`smoke_storage.mjs`**: Migration 5→6, Persistenz der Bemaßungen.
- **`smoke_start.mjs`**: „Geschoss öffnen" verweist korrekt; Modul 0 verliert den Editor.
- **`tests/module/smoke_geschossplan.mjs`** (neu, ab C4a): die neue Seite an der echten Oberfläche.

---

## 6. Entschieden am 2026-08-07

1. **Wandanschlüsse/Ecken und Kollision** → **[K-13]**. Überlappung ist verboten und wird rot
   gemeldet, nie still korrigiert. Eine Ecke ist damit ein **Stoß**: eine Wand läuft durch, die
   andere stößt bündig an ihre Längskante. Die 125 × 125-mm-Eckfläche gehört genau einer der beiden
   Wände — welcher, entscheidet die Planung, nicht das Werkzeug.
2. **Kollisionsprüfung** ist Bestandteil des Kerns (`kollisionen()` in `sembla-constraints.js`,
   eigene Tests). Sie läuft nach jedem Lösen mit, ist reine Geometrie und ändert nie eine Position.
3. **Referenzgeschoss** als blasser Hintergrund: **ja**, mit einstellbarer **Deckkraft**. Angezeigt
   wird das in der Struktur darunterliegende Geschoss (Umrisse, nicht anklickbar). Wie Plan-Lock und
   Zoom ist die Deckkraft **reine Bedienung** und **nicht** Teil des Datenmodells der Mappe. Kommt
   in **C4c**, nach den Kernfunktionen.

---

## 7. Umsetzungsstand C3.2 (2026-08-07)

**Regelwerk:** Kapitel **16.10 „Layout-Editor & Bemaßungen (Modul 0) [K]"** mit **[K-1]…[K-13]** ist
in `build-handbuch.mjs` angelegt, **[L-1]** neu gefasst (Position in mm) und **[L-2]** um den
Verweis auf [K-13] ergänzt. Das Handbuch ist neu gebaut.

- **Neuer Baustein `docs/shared/sembla-constraints.js`** (rein/DOM-frei, importiert nichts,
  shared-Regel b): Lage-Mathematik (`normLage`/`lageFehler`/`bezugsOffset`/`bezugsWert`/
  `wandRechteck`), Bemaßungsvalidierung (`bemassungFehler`/`bemassungenFehler`/`pruefeLaengenmass`),
  der **Löser** `loese()`, `kollisionen()` ([K-13]), `zustand()`/`farbe()` ([K-8]), `verschiebe()`
  ([K-9]) und `pruefeGeschoss()` als Gesamtdurchlauf.
- **Zwei Korrekturen am eigenen Entwurf**, beide beim Testen aufgefallen und beide im Regelwerk
  nachgezogen:
  1. **[L-1] ist nicht ganzzahlig, sondern 0,5-mm-genau.** Eine Bemaßung von einer Längskante auf
     eine Mittellinie verschiebt bei 125 mm Wandbreite zwangsläufig um 62,5 mm. Ganzzahligkeit hätte
     genau die Maße verboten, die der Editor können soll.
  2. **Der Ursprung ist der *Start* einer Bemaßung** (`von: null`), nicht ihr Ziel. Als Ziel gelesen
     kehrt sich das Vorzeichen um und ein Fixiermaß „1000 mm vom Ursprung“ landet bei −1000.
- **`sembla-projektmappe.js`:** `MAPPE_VERSION` **1 → 2**, Lage-Funktionen an
  `sembla-constraints.js` abgegeben (kein zweites Lage-Modell), `bemassungen` je Geschoss ([K-10])
  samt reinen Operationen `setzeBemassung`/`loescheBemassung`/`bemassungenOhneWand`/`bemassungen`,
  `endpunktGrid` → `endpunktMm`, Validierung um die Bemaßungen erweitert, Migration
  `migriereMappe` (v1 → v2, verlustfrei und idempotent).
- **`storage.js`:** `SCHEMA_VERSION` **5 → 6** mit `_migriereLageMm()` — hebt die gespeicherten
  Mappen auf Formatversion 2. Wandelemente, Eingaben, Kataloge und alle aktiven Zeiger bleiben
  unangetastet ([L-7]).
- **Modul 0** zeigt die Lage jetzt in mm statt in Rasterkoordinaten. Sonst unverändert — der Editor
  zieht erst mit C4a aus.
- **Tests:** neu `tests/module/test-constraints.mjs` (100 Prüfungen, je Regel benannt: Bezüge,
  Validierung, Löser, Determinismus, Widerspruch, Redundanz, fehlender Grundbezug, Farben, Ziehen,
  Kollision), `test-projektmappe.mjs` um Migration und Bemaßungen erweitert (138 Prüfungen),
  `smoke_storage.mjs`/`smoke_start.mjs` auf mm und die neuen Versionen umgestellt.
  `npm run test:all` ist grün; `test-constraints.mjs` hängt an `npm run test:modul0`.

**Offen (bewusst nicht in C3.2):** die gesamte Oberfläche — eigene Seite `docs/geschossplan.html`
mit Skizzenmodus (C4a), Bemaßen/Fixieren/Farben/Undo (C4b), schwebende Bauteilliste und
Referenzgeschoss (C4c), Mappen-ZIP inklusive Bemaßungen (C5).

---

## 8. Umsetzungsstand C4a (2026-08-07)

**Neue Seite `docs/geschossplan.html`** — kein neues Modul, kein Reiter in `navbar.js`
(`mountNavbar(0)`, Rücklink auf Modul 0). Aufruf aus der Baumliste über **„Geschoss öffnen"**; der
Knopf setzt das Geschoss zuerst **aktiv** und ist außerhalb des aktiven Projekts gesperrt, mit
benanntem Grund ([L-10]). Aufbau wie in §4.1: Werkzeugleiste links, vollflächige Zeichenfläche,
Statuszeile unten. Die Seite folgt Architektur-Regel 2 (klassisches App-Skript + `window.SEMBLA`,
`__gpInit()`), damit sie ohne Modulauflösung testbar ist.

- **Weltkoordinaten sind Millimeter.** Der `viewBox` der Zeichenfläche liegt in mm ([L-1]) — anders
  als der Planupload in Modul 0, dessen SVG in Bildpixeln rechnet. Daraus folgt unmittelbar: ein
  **nicht kalibrierter Plan liegt gar nicht erst unter der Zeichnung**, weil es ohne Maßstab kein
  Millimetermaß für ihn gibt; das wird benannt statt geschätzt ([L-9]). Zum Kalibrieren gibt es
  deshalb eine **eigene Ansicht in Bildpixeln** (Popup) — der einzige Ort, an dem man zwei Punkte im
  Bild anklicken kann, solange kein Maßstab existiert.
- **Werkzeuge:** Auswählen/Ziehen (Esc), Wand zeichnen (W), Plan verschieben (P). **Bemaßen (D)** und
  **Fixieren (F)** stehen sichtbar und **gesperrt** als „C4b" in der Leiste — sie werden nicht
  versteckt, damit der Ausbaustand ablesbar bleibt. Zoom auf den Zeiger (Mausrad), Pan mit Leertaste
  oder mittlerer Maustaste, „Alles zeigen" (0). **Pan ≠ Versatz**: der Planversatz bleibt unberührt.
- **Wand zeichnen** beginnt beim **Drücken** der Maustaste (nicht beim Loslassen): von dort läuft
  die Vorschau mit dem Zeiger mit, das Loslassen legt an. Ein Klick **ohne** Zug lässt den
  Startpunkt stehen, sodass „klicken – klicken" weiter funktioniert. Richtung = Achse mit der
  größeren Differenz ([L-2]), Länge auf 125 mm gerundet, Anker auf der Mittellinie am Ende mit der
  kleineren Koordinate. Eine zu kurze Strecke wird **abgewiesen**, nicht auf eine Rastereinheit
  aufgerundet.
- **Der Fang ist richtungsabhängig, weil der Anker es ist.** **Längs** liegt `start_mm` auf einer
  **Stirnkante** — dort rastet er auf die Rasterlinie (125 mm). **Quer** liegt er auf der
  **Mittellinie**, und die 125 mm breite Wand legt beide Längskanten genau 62,5 mm daneben: ein
  125-mm-Fang der Mittellinie legte die Wand deshalb zwangsläufig auf **halbe Rasterfelder**.
  Gefangen wird quer darum auf die **Feldmitte** (k · 125 + 62,5), womit **alle vier Wandkanten auf
  dem Raster liegen** und die Wand genau ein Rasterfeld füllt. Ohne Fang gilt in beiden Achsen
  **0,5 mm** — nie feiner, denn das ist das zulässige Positionsraster ([L-1]). Gefangen wird erst
  in `entwurfLage()`, weil die Richtung vorher nicht feststeht.
- **Zwei Ziele je Zeichnung:** entweder eine **neue Wand** (Wandelement über `buildWall`, Höhe als
  Vorgabe aus der Geschosshöhe [L-5], Wandtyp ausdrücklich gewählt, danach [P-18]-Vorbelegung der
  Verwendungsstellen) oder das **Verorten einer vorhandenen, unverorteten Wand** des Geschosses.
  Ohne den zweiten Weg wären in Modul 0 angelegte Wände nie verortbar. Eine Abweichung zwischen
  gezeichneter Länge und Wandelement wird **gemeldet, nie angeglichen** ([L-3]) — in der Meldung
  und dauerhaft in der Statuszeile.
- **Auswählen und Ziehen** läuft über `verschiebe()` aus `sembla-constraints.js`: es bewegt die ganze
  starre Gruppe, sperrt eine durch Bemaßungen **bestimmte** Achse und benennt den Grund ([K-9]).
  Gespeichert wird ausschließlich die **Lage** im Geschoss ([K-10]) — in **einem** `aendereMappe`,
  über `setzeLage` geprüft. Das Wandelement wird nie angefasst ([P-1]).
- **Aktiv ≠ ausgewählt.** *Ausgewählt* (gestrichelter Rahmen) können **mehrere** Wände sein —
  Umschalt/Strg nimmt hinzu bzw. wieder heraus. *Aktiv* — also in Bearbeitung, **grün** nach [K-8]
  und als einzige mit Griffen — ist immer genau **eine** davon. Die Trennung ist reine Bedienung und
  ändert am Datenmodell nichts; mit Modifikator haben die Griffe bewusst **keinen** Vorrang, sonst
  ließe sich die aktive Wand nicht abwählen.
- **Griffe ändern die Größe, der Körper die Lage.** Die beiden Griffe auf den **Stirnkanten** ziehen
  die Wand länger oder kürzer: die **gegenüberliegende** Stirnkante bleibt dabei fest stehen, womit
  ihre Rasterlage erhalten bleibt und sich ausschließlich `laenge_grid` (bei „min" zwangsläufig auch
  der Anker) ändert. Verschoben wird über den **runden Griff in der Mitte** oder den Wandkörper.
  Ist die Länge durch ein **Längenmaß** bestimmt, wird das Ziehen am Endgriff **abgewiesen** und das
  Maß genannt ([K-11]) — nie stillschweigend überschrieben.
- **90° drehen** (Knopf oder **R**) tauscht die Richtung der aktiven Wand bei **unveränderter
  Länge**. Gedreht wird um die **Min-Ecke** des Grundrisses: nur so bleibt die Rasterlage erhalten
  (neue Längsachse wieder auf einer Rasterlinie, neue Mittellinie wieder auf einer Feldmitte), und
  zweimal Drehen liefert bit-genau die Ausgangslage zurück. Eine durch Bemaßungen **bestimmte** Wand
  wird nicht gedreht, weil das sie verschöbe — der Grund wird benannt ([K-9]).
- **Farben nach [K-8]** (hellblau/schwarz/grün/rot) samt Griffen an der aktiven Wand; **Kollisionen** nach
  [K-13] werden mit Wandpaar und Überlappungsmaß in der Statuszeile genannt und **nichts** wird
  verschoben. Ebenfalls sichtbar: Anzahl der Wände ohne vollständige Bestimmung.
- **Plan:** Maßstab als Zahl **oder** über die Kalibrierlinie (gleichwertig, [L-9]), Versatz über
  Felder oder Ziehen, **Plan-Lock** (Standard: gesperrt). Der Kalibrier-Feinschliff aus §4.4 steckt
  in `sembla-plan.js`: `orthogonalPunkt()` zwingt den zweiten Punkt auf die Achse mit der größeren
  Pixeldifferenz, die Linie ist **gestrichelt**, die Marker sind **Kreuze mit ausgesparter Mitte**
  (`kreuzPfad()`). Neu ist außerdem `planRahmenMm()` — die Lage des Bildes in Raster-mm.
- **Modul 0 verliert den Editor.** Kalibrieren, Versatz, Zoom und die Bühne sind ersatzlos aus
  `docs/index.html` entfernt; geblieben ist der **Planupload**, der ins **Geschoss-Popup** gewandert
  ist (§4.4) — es gibt weiterhin genau **einen** Upload-Weg. Die Baumliste hat den neuen Knopf
  „Geschoss öffnen".
- **Tests:** neu `tests/module/smoke_geschossplan.mjs` (84 Prüfungen an der echten Seitenlogik:
  Zeichnen ab dem Drücken, kantenrichtiger Fang, Aktiv/Auswahl, Größenziehen an den Endgriffen,
  Verschieben am Mittelgriff, Drehen ohne Drift, Ziehen samt gesperrter Achse, Kollision, Verorten
  mit Längenabweichung, Plan ohne und mit Kalibrierung, Plan-Lock, orthogonale Kalibrierlinie,
  Determinismus). `test-plan.mjs` um
  `orthogonalPunkt`/`kreuzPfad`/`planRahmenMm` erweitert (77 Prüfungen), `smoke_start.mjs` auf den
  ausgezogenen Editor umgestellt. `npm run test:all` ist grün; der neue Test hängt an
  `npm run test:modul0`.

**Offen (bewusst nicht in C4a):** Bemaßen, Fixieren, Widerspruchsanzeige und Undo/Redo (C4b),
schwebende Bauteilliste und Referenzgeschoss (C4c), Mappen-ZIP inklusive Bemaßungen (C5).

---

## 9. Umsetzungsstand C4b (2026-08-08)

**Kein neues Datenmodell, keine neue Formatversion, keine neue Shared-Datei.** C4b ist reine
Bedienung über dem, was C3.2 schon konnte: `bemassungen` liegt seit `MAPPE_VERSION` 2 im Geschoss,
und `sembla-constraints.js` liefert Löser, Widerspruch, Redundanz, Farben und Kollision unverändert.
Gebaut wurde ausschließlich in `docs/geschossplan.html`; geschrieben wird über die vorhandenen reinen
Operationen `setzeBemassung`/`loescheBemassung`/`setzeLage` in einem `store.aendereMappe`.
`MAPPE_VERSION`, `SCHEMA_VERSION`, `PROJEKT_VERSION` und `KATALOG_VERSION` bleiben **unberührt**, und
das Regelwerk brauchte **keine neue Regel** — [K-1]…[K-13] decken den Ausbau vollständig ab.

- **Bemaßen (D).** Über der Zeichnung liegen die **sechs** kanonischen Bezüge je Wand (drei je
  Achse, [K-2]) als Geraden senkrecht zu ihrer Achse; sie leuchten beim Überfahren auf (§4.3),
  Mittellinien gestrichelt, Kanten durchgezogen. **Die Achse folgt dem Bezug** — sie ist keine
  zusätzliche Wahl: mit dem ersten Klick steht sie fest, und danach werden **nur noch parallele**
  Bezüge angeboten, womit [K-1] konstruktiv erfüllt ist statt nachträglich geprüft. Der zweite Klick
  schlägt den aktuellen Abstand als Zahl vor — ein **Vorschlag im Feld**, treibend ist erst der
  gesetzte Wert ([K-3]). Ist der Ist-Abstand krumm, bleibt das Feld leer und der Grund steht da;
  gerundet wird nichts. Die beiden Bezüge sind ein **ungeordnetes Paar**, die Richtung wird deshalb
  so gewählt, dass das Maß positiv läuft ([K-3] verbietet negative Maße).
- **Maße sind sichtbare, anklickbare Objekte** (Maßlinie, Hilfslinien, Wert in mm, je Maß gestaffelt
  angeordnet): Wert ändern oder löschen. Gelöscht wird nur auf Ansage — nie vom Werkzeug ([K-6]).
- **Fixieren (F) ist minimal und modelltreu achsweise.** Ein Klick auf einen Bezug speichert seinen
  Abstand zum **einzigen** Geschossursprung als ganz normale Bemaßung `von: null` ([K-4]) — es gibt
  **keine zweite Fixierungsstruktur** und kein eigenes Feld. Festgesetzt wird **genau die Achse
  dieses Bezugs**; für die andere ist ein zweites Mal zu fixieren, und es wird **kein zweiter Bezug
  erfunden**. Das sagt die Oberfläche ausdrücklich. Ein **nicht ganzzahliger** Ist-Abstand wird
  benannt abgewiesen ([K-12]) — eine Längskante liegt 62,5 mm neben der Mittellinie, das trifft also
  regelmäßig zu, und der Hinweis nennt die Mittellinie als passenden Bezug. Ein Bezug **vor** dem
  Ursprung wird ebenfalls abgewiesen statt ins Negative gedreht ([K-3]/[K-4]).
- **Längenmaß.** Zwei Stirnkanten derselben Wand treiben `laenge_grid` (§2.4). Ein krummer Wert wird
  abgewiesen und nennt **beide** Nachbarmaße ([K-11]); ein gültiger Wert schreibt Maß **und** Länge
  in **einem** `aendereMappe`, damit die beiden nie auseinanderlaufen. Der Anker bleibt stehen, nur
  die max-Stirnkante wandert. Das **Wandelement bleibt unberührt**, die Abweichung wird gemeldet
  ([L-3]); der Endgriff aus C4a weist das Ziehen weiterhin ab und nennt das Maß.
- **Widerspruch und Redundanz sind jetzt sichtbar.** Ein widersprüchliches Maß wird **gespeichert**,
  rot gezeichnet und mit **beiden** Maßen und der Differenz in mm in der Statuszeile benannt; die
  Positionen behalten den letzten widerspruchsfreien Stand ([K-6]). Ein redundantes Maß bleibt
  wirksam und wird als Hinweis gemeldet ([K-7]).
- **Kein Rückschreiben gelöster Positionen.** `lage.start_mm` bleibt der letzte gültige
  **gespeicherte** Stand; wo Maße bestimmen, ist beim Lesen und Zeichnen das deterministische
  Lösungsergebnis maßgebend ([K-5]). Damit das trägt, schreibt das Ziehen jetzt **nur noch die
  Wände, die der Zug wirklich bewegt** (`verschiebe().bewegt`) — vorher hätte jeder Zug nebenbei die
  gelösten Positionen **aller** Wände in die Mappe zurückgeschrieben und damit eine zweite Wahrheit
  erzeugt. Ein vollständig gesperrter Zug schreibt jetzt gar nichts. Ein späterer Export muss
  denselben Weg gehen und den Löser benutzen.
- **Undo/Redo** (Knöpfe, **Strg+Z** / **Strg+Umschalt+Z** bzw. **Strg+Y**). Gegenstand des Stapels
  ist **ausschließlich die Projektmappe** — also genau das, was der Editor schreibt: Lagen und
  Bemaßungen ([K-10]). **Nicht** im Stapel: Planbild und Plandatenbank ([L-8]), Maßstab, Kalibrierung
  und Versatz ([L-9]), Blick, Auswahl, Werkzeug und Plan-Lock. Beim Zurücksetzen wird die
  **aktuelle** Planansicht auf den alten Stand aufgepfropft, damit ein Undo keine Kalibrierung
  zurückdreht. Eine im Editor **neu gezeichnete** Wand ist ein **atomarer** Schritt: Rückgängig
  entfernt Geschosseintrag **und** genau das in diesem Schritt erzeugte Wandelement, Wiederholen legt
  beides unter derselben Kennung wieder an (Zeitstempel ausgenommen). Das **Verorten** einer
  bestehenden Wand ändert nur die Mappe — fremde Wandelemente werden nie angefasst. Eine neue
  Änderung verwirft den Wiederholen-Stapel; ein Geschosswechsel verwirft beide.
- **Nicht neu eingeführt** wurde ein Löschweg für Wände oder Maße außerhalb der schon vorhandenen
  Bedienung. Maße, deren Wand unverortet wurde, bleiben stehen und werden in der Statuszeile als
  **unwirksam gemeldet** — nicht still bereinigt ([L-4]).
- **Tests:** `smoke_geschossplan.mjs` auf **135 Prüfungen** erweitert (Bezüge und Achsenbindung,
  Maß setzen/ändern/löschen, Längenmaß mit Nachbarmaßen und gesperrtem Griff, Widerspruch mit
  Differenz, Redundanz, Fixieren inkl. beider Abweisungen, „alle Wände schwarz", Undo/Redo samt
  Atomarität — Wandelement und Eingaben kommen bit-genau zurück —, unberührter Kalibrierung und
  unberührtem Planbild, Determinismus mit Bemaßungen). Der Test klickt Wände dabei an ihrer
  **gelösten** Position und liest Erwartungswerte aus dem Löser statt aus festen Zahlen: eine freie
  Gruppe verankert [K-5] an der lexikographisch kleinsten Wandkennung, und die Kennungen sind
  Zufalls-UUIDs — feste Koordinaten träfen die Wand nur in etwa der Hälfte der Läufe;
  `test-constraints.mjs` auf **118 Prüfungen** (die Zusagen, auf die die Bedienung aufsetzt, und das
  Anwenden des Längenmaßes über die reinen Mappen-Operationen). `npm run test:all` ist grün.

**Offen (bewusst nicht in C4b):** schwebende Bauteilliste und Referenzgeschoss (C4c), Mappen-ZIP
inklusive Bemaßungen (C5). Issue #26 bleibt als Umbrella offen.

---

## 10. Umsetzungsstand C4c (2026-08-08)

**Wieder ohne neue Regel, ohne neue Shared-Datei und ohne Versionsbump.** C4c ist vollständig
Bedienung über dem, was C3.2/C4b schon können; gebaut wurde ausschließlich in
`docs/geschossplan.html`. `MAPPE_VERSION`, `SCHEMA_VERSION`, `PROJEKT_VERSION` und `KATALOG_VERSION`
bleiben unberührt, `sembla-constraints.js`, `sembla-projektmappe.js` und `sembla-plan.js` sind nicht
angefasst, und [K-1]…[K-13] decken den Ausbau unverändert ab. Vorgegangen wurde nach **TDD**: die
Prüfungen zuerst (RED: 24 von 35 neuen Prüfungen rot), dann die Umsetzung, dann GREEN und die
Regression.

- **Schwebende Bauteilliste.** Ein Panel über der Zeichenfläche listet **alle** Wände des aktiven
  Geschosses mit Name, Länge, Höhe, Wandtyp und Bestimmtheit. Die Quellen sind streng getrennt:
  Länge und Bestimmtheit kommen aus Lage und Löser, **Höhe und Wandtyp aus dem Wandelement** — die
  Mappe kennt beides nicht, und es wird nichts gespiegelt ([P-1]). Fehlt das Wandelement, steht das
  als **verwaister Eintrag** da statt geratener Werte ([L-4]); eine unverortete Wand steht als
  „unverortet“ ohne erfundene Länge. Die **Bestimmtheit** ist kompakt `x/y` · `nur x` · `nur y` ·
  `frei` (keine Maßanzahl) und meint wie überall die **Position**, nie die Länge (§2.4).
  Die Liste liegt im Markup **neben** der Bühne und nur optisch darüber — `render()` schreibt die
  Bühne komplett neu, ein Panel darin hätte nach dem ersten Neuzeichnen tote Ereignisbehandler.
- **Auswahl ist in beiden Richtungen dieselbe.** Der Listenklick ruft **`waehle()`** auf — genau die
  Funktion der Zeichenfläche. Es gibt keinen zweiten Auswahlzustand, und **aktiv ≠ ausgewählt**
  bleibt getrennt: genau eine Zeile ist `aktiv` (grün, wie [K-8] es für die Wand vorsieht), weitere
  sind `gewaehlt` (gestrichelter Rahmen, **keine** Zustandsfarbe). Die Liste ist **Anzeige und
  Auswahl** und ausdrücklich **kein zweiter Verortungsweg** — sie schreibt nichts, auch nicht bei
  einer unverorteten Wand.
- **Referenzgeschoss.** Gezeigt wird das **unmittelbar darunterliegende** Geschoss = **Index − 1** in
  der Geschossliste desselben Gebäudes. Ein Höhen- oder Niveaufeld gibt es im Datenmodell nicht, und
  es wurde bewusst **keines eingeführt** (das wäre ein Format- und Schemabruch gewesen); maßgebend
  ist allein die Reihenfolge in der Mappe. Beim untersten Geschoss gibt es keine Referenz, und das
  wird **benannt**. Die Umrisse laufen über einen **eigenen, getrennten Löserlauf**, dessen Ergebnis
  nie in `loesen()` des aktiven Geschosses fließt; sie tragen kein `data-wand` und
  `pointer-events="none"`. Damit sind sie für Auswahl, Kollisionsprüfung ([K-13]) und Bemaßung
  schlicht nicht vorhanden — eine deckungsgleiche Wand im Geschoss darunter erzeugt **keine**
  Kollision, und der Löser liefert mit und ohne Referenz **bit-genau** dasselbe ([K-5]).
  Standardmäßig sichtbar, Deckkraft **25 %** und einstellbar; wie Zoom und Plan-Sperre ist beides
  **Bedienung und wird nicht gespeichert**.
- **Doppelklick auf die Maßzahl (Bedienkorrektur).** Bisher traf ein Klick nur die **Maßlinie**; die
  Zahl steht rund 5–17 Schirmpixel darüber und lag außerhalb der Trefferfläche — ein Klick genau auf
  die Zahl wählte deshalb nichts und hob stattdessen die Auswahl auf. Jetzt gehört das Feld der
  Maßzahl zur Trefferfläche des Maßes, und ein **Doppelklick** öffnet wie im CAD die Bearbeitung
  dieses Maßes. Benutzt wird ausschließlich der **vorhandene** Weg (`waehleBemassung` → Feld „Maß“ →
  „Maß setzen“): **kein zweiter Bearbeitungspfad**, keine geänderte Maßsemantik, beim Doppelklick
  wird **nichts** gespeichert ([K-3]), und das **Werkzeug wechselt nicht**.
- **Kein Textcursor über der Beschriftung (Bedienkorrektur).** `.gp-buehne svg text` bekommt
  `user-select:none` und `pointer-events:none`. Die Regel gilt **nur** unterhalb der Zeichenfläche —
  echte Eingabefelder (Maßfeld, Höhe, Versatz, Kalibrierlänge) bleiben unverändert bedien- und
  markierbar, und es gibt keine globale Selektionssperre. Dem Doppelklick auf die Maßzahl schadet
  `pointer-events:none` nicht, weil der Treffer **geometrisch in Weltkoordinaten** (`bemTreffer`)
  entschieden wird und nicht über DOM-Knoten — genau das prüft der Test ausdrücklich.
- **Tests:** `smoke_geschossplan.mjs` auf **170 Prüfungen** erweitert (Blöcke 19–22: Bauteilliste
  samt Sonderfällen, beidseitige Auswahl, Referenzgeschoss inkl. „keine Kollision“ und
  „Löser bit-genau gleich“, fehlende Persistenz, Doppelklick auf die Maßzahl, CSS-Regel und ihre
  Begrenzung). `npm run test:modul0` und `npm run test:all` sind grün. **Grenze der Prüftiefe,
  ausdrücklich benannt:** der DOM-Ersatz der Node-Tests kennt keine Kindknoten und kein
  Ereignis-Bubbling, deshalb läuft der Listenklick im Test über die Prüfhilfe `listeKlick()` —
  also über denselben Behandler wie im Browser, aber nicht über echtes Markup; das gerenderte
  Panel-HTML wird zusätzlich geprüft.

**Nach C4c abgeschlossen:** Das vollständige Projektarchiv inklusive Planbildern und Bemaßungen
(C5) ist in §11 dokumentiert.

---

## 11. Umsetzungsstand C5 (2026-08-08)

C5 ändert keine [K]-Regel und keine Geometrie. Das Archiv nimmt die Geschossstruktur samt Lagen und
Bemaßungen unverändert aus der Projektmappe, ergänzt jede referenzierte Wand als SEMBLA-Projekt-v2-
Datei und jedes vorhandene referenzierte Planbild aus IndexedDB. ZIP und importierbarer Ordner
durchlaufen denselben vollständigen Prüfer: genau eine Mappe, ausschließlich explizite
`wand.datei`-Zuordnung, sichere normalisierte relative Pfade, eindeutige/vollständige Dateien,
gültige Formate, Versionen und Bildsignaturen; ZIP zusätzlich CRC und STORE/Deflate-Methode.

Geschrieben wird erst nach dem sichtbaren Bericht und einer ausdrücklichen Importbestätigung;
Konflikte stabiler IDs brauchen zusätzlich die Überschreibbestätigung. Ein Schreibfehler setzt
localStorage und IndexedDB vollständig zurück. Der Katalog bleibt eigene Ressource ([L-12]), der
reine Mappenweg heißt „nur Struktur (JSON)“, und alle Format-/Schemaversionen bleiben unverändert.
Der Oberflächenroundtrip prüft Lage, Bemaßungen, Kopfdaten, Eingaben und bitgenaue synthetische
Planbilder für ZIP, Ordner und Deflate sowie den Rollback. Damit ist der in C4b geforderte spätere
Exportpfad umgesetzt, ohne gelöste Positionen in die Mappe zurückzuschreiben.

---

## 12. Bedienkorrektur Bemaßungen (Issue #51, 2026-08-10)

Issue #51 ändert keine [K]-Regel, keine Constraint-Mathematik und keine Formatversion. Paket 3 der
Oberflächenplanung bleibt offen; Fixieren bleibt fachlich ein Klick auf genau einen Bezug.

- **Anlegen vollständig im Plan.** Der erste Bezug startet sofort die Vorschau. Nach dem zweiten
  Bezug stehen vollständige Hilfslinien, Maßlinie und Maßzahl als ungespeicherter Entwurf im Plan;
  an der Maßzahl ist der exakte Istabstand vorausgewählt. Ein 0,5-mm-Istabstand bleibt ungerundet
  und wegen [K-12] rot/ungültig, bis er überschrieben wird. Enter schreibt ausschließlich über
  `bemSetzen` → `speichereBemassung`; Escape verwirft Feld und Entwurf gemeinsam. Der Entwurf bucht
  keinen Undo-Schritt und verändert die Projektmappe nicht.
- **Ein Editor und ein Wertweg.** Der linke Maßeditor samt Setzen-/Löschen-/Abbrechen-Schaltflächen
  ist entfernt. Doppelklick auf Maßzahl oder Maßlinie öffnet dieselbe Inline-Eingabe in Auswahl,
  Bemaßen, Fixieren, Wand und Plan. Maßtreffer werden vor werkzeugspezifischen Aktionen behandelt,
  sodass die beiden Pointer-/Klickpaare vor `dblclick` keine Wand zeichnen, kein Fixiermaß setzen,
  keinen Plan verschieben und keinen Bemaßungsentwurf fortschalten.
- **Vollständige Darstellung verschieben.** Ein Zug an Maßzahl oder Maßlinie verschiebt Maßlinie
  und Zahl gemeinsam quer zur Messrichtung; Hilfslinien bleiben an ihren Referenzen. Gespeichert
  wird nur das optionale skalare `linie_mm`. Ein vorhandenes `text_mm` bleibt als relativer
  Labelversatz erhalten. Maßwert, Wandgeometrie, Referenzen und Löserergebnis bleiben bit-genau.
  Unter 3 Schirmpixeln bleibt die Bewegung ein Klick ohne Speicherung.
- **Sicher löschen und atomar rückgängig.** Delete und Backspace löschen nur ein ausgewähltes Maß
  und greifen bei aktiver Texteingabe nicht; Wände werden über diesen Weg nie gelöscht. Anlegen,
  Ändern, Verschieben und Löschen sind jeweils genau ein Undo-/Redo-Schritt.
- **Regression.** `smoke_geschossplan.mjs` prüft den vollständigen Entwurf, 0,5-mm-Abweisung,
  Inline-Wertweg, Maßzahl und Maßlinie, alle Werkzeuge, vollständige Pointerdown-/pointerup-/click-
  Paare vor `dblclick`, `text_mm`-Altbestand, bit-genau unberührten Löser und Delete/Backspace.
  `test-constraints.mjs` prüft die verlustfreie optionale Normalisierung von `linie_mm`.
