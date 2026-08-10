# Geschossplan: UI- und Bedienverbesserungen

**Status:** abgestimmter Umsetzungsplan — **Paket 1 umgesetzt** (Issue #50, 2026-08-09),
**Paket 2 umgesetzt** (Issue #51, 2026-08-10), Paket 3 noch offen
**Ziel:** Den Geschossplan vereinfachen, Bemaßungen direkt in der Zeichnung bedienbar machen und die Oberfläche kompakter organisieren.

Die Umsetzung erfolgt in drei getrennten, jeweils test- und veröffentlichbaren Paketen.

---

## Paket 1 – Wandworkflow und Begriffe  ✅ umgesetzt (Issue #50, 2026-08-09)

Umgesetzt in `docs/geschossplan.html` (linker „Neue Wand“-Abschnitt entfallen, Parameter am Werkzeug
„Wand zeichnen“, Fang bei „Ansicht“, „Planen“ je Zeile der Wandliste), `docs/index.html` und
`docs/shared/sembla-projektmappe.js` (Beschriftungen). Regressionsgetestet in
`tests/module/smoke_geschossplan.mjs` und `tests/module/smoke_start.mjs`. Ohne Schema-/Formatbump;
Modul 0 behält bewusst seinen Formularweg „+ Wand hinzufügen“ (Einzelwand-Import, Musterwand,
Anlegen ohne aktives Geschoss).

### Ziel

Den Wandworkflow vereinfachen, die Höhenangabe fachlich korrekt benennen und den Übergang zur Wandplanung verkürzen.

### Umfang

1. Den zusätzlichen Eintrag **„Neue Wand“** in der linken Bedienfläche entfernen.
2. Neue Wände weiterhin ausschließlich über das grafische Werkzeug **„Wand zeichnen“** im Geschossplan erzeugen.
3. Die bisherige Bezeichnung **„Geschosshöhe“** in der Oberfläche in **„Standard-Wandhöhe“** ändern.
4. Die Standard-Wandhöhe nur als Vorgabewert beim Erzeugen einer neuen Wand verwenden.
5. Bereits bestehende Wandhöhen bei einer späteren Änderung des Standardwerts nicht automatisch verändern.
6. In der schwebenden Wandliste rechts je Wand einen kompakten Button **„Planen“** ergänzen.
7. Der Button setzt die betreffende Wand als aktiv und öffnet sie anschließend in **Modul 1 – Wandplanung**.

### Nicht-Ziele

- Keine eigene Decken- oder Geschosshöhenlogik einführen.
- Keine automatische nachträgliche Synchronisation vorhandener Wandhöhen.
- Keinen zweiten Weg zum Erzeugen von Wänden **in der linken Bedienfläche des Geschossplans** beibehalten; der separate Modul-0-Formularweg bleibt bewusst bestehen.

### Abnahme

- Eine neue Wand kann grafisch erzeugt werden und übernimmt die aktuelle Standard-Wandhöhe.
- Eine Änderung der Standard-Wandhöhe verändert keine vorhandene Wand.
- Die Oberfläche bezeichnet den Wert nicht mehr als Geschosshöhe.
- „Planen“ öffnet Modul 1 mit genau der gewählten Wand als aktiver Wand.
- Der zusätzliche Wand-Erstellungsweg in der linken Bedienfläche ist entfernt.

---

## Paket 2 – Maße direkt in der Zeichnung bearbeiten  ✅ umgesetzt (Issue #51, 2026-08-10)

Umgesetzt vollständig in `docs/geschossplan.html`; regressionsgetestet in
`tests/module/smoke_geschossplan.mjs`. **Ohne Schema-/Formatbump** — das Darstellungsfeld
`text_mm` gab es in `normBemassung` bereits (optional, im Bestand ausnahmslos `null`).

Zwei Festlegungen der Umsetzung:

- **`text_mm` ist ausschließlich die Beschriftungsposition** (Versatz der Maßzahl in mm, in
  Weltkoordinaten x/y). Zuvor floss der Querteil in die Lage der **Maßlinie** — das hätte dem
  Nicht-Ziel „keine Maßlinien verschieben" widersprochen. Da das Feld nie geschrieben wurde, ist
  die Präzisierung verlustfrei; `bemGeometrie`/`bemText` sind die einzige Quelle für Zeichnen,
  Treffen, Ziehen und die Position des Eingabefelds.
- **Ein Zug entsteht erst ab 3 Schirmpixeln Bewegung.** Darunter bleibt das Drücken auf der Maßzahl
  reine Auswahl: ein Klick und ein Doppelklick speichern nichts und buchen keinen
  Rückgängig-Schritt. Gezogen wird mit dem Werkzeug **Auswählen & ziehen**; die Maßzahl hat dafür
  eine eigene, engere Trefferfläche als das Maß insgesamt.

### Ziel

Maßwerte und ihre Beschriftungsposition unmittelbar im Plan bearbeiten, ohne ein separates Maßformular bedienen zu müssen.

### Umfang

1. Ein Doppelklick auf ein Maßlabel ersetzt die dargestellte Maßzahl direkt an ihrer Position durch ein Eingabefeld.
2. Der aktuelle Maßwert ist im Feld vorausgewählt.
3. **Enter** übernimmt den eingegebenen Wert.
4. **Escape** verwirft die Eingabe.
5. Ein Fokusverlust übernimmt einen gültigen Wert; ein ungültiger Wert bleibt ohne Datenänderung und wird verständlich kenntlich gemacht.
6. Die Übernahme nutzt die bestehende treibende Bemaßungs- und Constraint-Logik; es entsteht kein zweiter fachlicher Bearbeitungspfad.
7. Ein Maßlabel kann angeklickt und gezogen werden.
8. Während des Ziehens folgt das Label dem Zeiger; bei `pointerup` wird die neue Beschriftungsposition gespeichert.
9. Die Labelposition ist reine Darstellung und verändert weder Maßwert noch Wandgeometrie.
10. Maßwertänderungen und gespeicherte Labelverschiebungen werden in Undo/Redo aufgenommen.
11. Einfacher Klick, Doppelklick und Ziehen werden so unterschieden, dass keine Aktion versehentlich eine andere auslöst.

### Datenmodell

- Die bestehende Bemaßung bleibt die einzige Quelle für den treibenden Maßwert.
- Für die manuell verschobene Beschriftung wird nur die minimal nötige Darstellungsposition an der Bemaßung gespeichert.
- Bestehende Bemaßungen ohne gespeicherte Labelposition verwenden weiterhin die automatisch berechnete Standardposition.

### Nicht-Ziele

- Keine Änderung der mathematischen Maß- oder Lösersemantik.
- Kein freies Verschieben der Maßlinien oder Maßbezugspunkte in diesem Paket.
- Kein zweites, unabhängiges Maßmodell für die Darstellung.

### Abnahme

- Doppelklick ermöglicht die vollständige Werteingabe direkt im Plan.
- Gültige Werte wirken über die bestehende Constraint-Logik.
- Ungültige Werte verändern den Projektstand nicht.
- Ein verschobenes Label bleibt nach Neuladen an seiner Position.
- Das Verschieben eines Labels ändert weder Wert noch Geometrie.
- Undo/Redo funktioniert für Maßwert und Labelposition.
- Die kritische Bedienkette wird zusätzlich mit echten Browser-DOM-/Pointer-Ereignissen geprüft.

---

## Paket 3 – Schwebende, kompakte Bedienoberfläche

### Ziel

Mehr nutzbare Planfläche schaffen und Werkzeuge sowie Darstellungsoptionen klar, kompakt und weitgehend selbsterklärend organisieren.

### Umfang

1. Oben über der Zeichenfläche eine schwebende Werkzeugleiste einführen.
2. Auswahl-, Zeichen-, Bemaßungs-, Fixier- und weitere Bearbeitungswerkzeuge dort bündeln.
3. Undo und Redo in diese obere Werkzeugleiste verschieben.
4. Das aktive Werkzeug eindeutig hervorheben.
5. Unten über der Zeichenfläche eine schwebende Ansichtsleiste ergänzen.
6. Dort die vorhandenen Ansichtsoptionen zum Ein-/Ausblenden und zur Darstellung bündeln, insbesondere Plan, Referenzgeschoss, Raster, Bemaßungen und vergleichbare reine Ansichtsfunktionen.
7. Lange Beschriftungen nach Möglichkeit durch eindeutige Icons oder sehr kurze Labels ersetzen.
8. Bedeutung und Tastenkürzel über Tooltips zugänglich halten.
9. Überholte oder doppelte Bedienelemente aus den bisherigen Seitenbereichen entfernen.
10. Sicherstellen, dass die schwebenden Bereiche keine wichtigen Planinhalte oder Interaktionen unnötig verdecken.
11. Die bestehende Wandliste rechts als eigenen schwebenden Bereich erhalten und gestalterisch mit den neuen Leisten abstimmen.

### Nicht-Ziele

- Keine neue Werkzeugfunktion nur wegen des UI-Umbaus einführen.
- Keine Änderung der fachlichen Daten- oder Constraint-Logik.
- Keine versteckten Duplikate derselben Aktion an mehreren Stellen behalten.

### Abnahme

- Alle zuvor vorhandenen Werkzeuge und Ansichtsoptionen bleiben erreichbar.
- Aktives Werkzeug und aktive Ansichtsebenen sind eindeutig erkennbar.
- Undo/Redo ist über die obere Leiste bedienbar.
- Die Zeichenfläche hat sichtbar mehr nutzbaren Raum und weniger erklärenden Text.
- Tooltips erklären Icons und nennen vorhandene Tastenkürzel.
- Die Oberfläche bleibt auch bei kleinerem Browserfenster bedienbar.
- Es gibt keine widersprüchlichen doppelten Bedienelemente.

---

## Reihenfolge und Qualitäts-Gates

1. **Paket 1** vollständig umsetzen, automatisiert testen und im echten Browser prüfen.
2. Erst nach erfolgreicher Abnahme mit **Paket 2** beginnen.
3. Erst nach erfolgreicher Abnahme mit **Paket 3** beginnen.
4. Jedes Paket bleibt ein eigener fachlicher Scope und erhält eigene Regressionstests.
5. Vor jeder Veröffentlichung läuft mindestens die fokussierte Geschossplan-Testsuite sowie `npm run test:all` in der unabhängigen Abnahme.
6. Interaktionen wie Doppelklick, Fokus und Pointer-Drag werden nicht nur mit vereinfachten DOM-Doubles, sondern zusätzlich im echten Browser geprüft.
7. Ein Paket wird erst als abgeschlossen gemeldet, wenn Tests, GitHub-Pages-Deployment und der konkrete Live-Stand verifiziert sind.
