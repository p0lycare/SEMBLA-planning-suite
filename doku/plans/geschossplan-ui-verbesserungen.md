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

Umgesetzt in `docs/geschossplan.html`; die optionale Darstellungseigenschaft `linie_mm` wird in
`docs/shared/sembla-constraints.js` verlustfrei normalisiert. Regressionsgetestet in
`tests/module/smoke_geschossplan.mjs` und `tests/module/test-constraints.mjs`. **Ohne
Schema-/Formatbump** und ohne Änderung an [K-1]…[K-13], Constraint-Mathematik oder Fixiersemantik.

Festlegungen der finalen Umsetzung:

- Nach erstem und zweitem Bezug ist die noch ungespeicherte Bemaßung sichtbar. Nach dem zweiten
  Bezug öffnet sich das Inline-Feld an der Maßzahl und enthält den **exakten** Istabstand. Auch ein
  0,5-mm-Wert bleibt unverändert vorausgewählt und wegen [K-12] rot/ungültig, bis er überschrieben
  oder mit Escape zusammen mit dem Entwurf verworfen wird. Der Entwurf verändert weder Mappe noch
  Undo-Stapel.
- `bemSetzen(roh)` → `speichereBemassung()` ist der **einzige** Wert-Schreibpfad. Der linke
  Maßeditor samt Setzen-/Löschen-/Abbrechen-Schaltflächen ist vollständig entfernt.
- `linie_mm` ist ein optionaler skalarer Querversatz der **gesamten Maßdarstellung**. Maßlinie und
  Zahl wandern gemeinsam; Hilfslinien bleiben an den Referenzen. Ein vorhandenes `text_mm` bleibt
  als relativer Labelversatz unverändert erhalten. Neue Züge schreiben ausschließlich `linie_mm`.
- Ein Zug entsteht erst ab 3 Schirmpixeln Bewegung. Darunter bleiben Klick und Doppelklick ohne
  Speicherung. Maßzahl und Maßlinie haben denselben Zugweg, und Maße liegen bei der
  Zeigerbehandlung werkzeugübergreifend über Wand-, Fixier- und Planaktionen.

### Ziel

Maßwerte unmittelbar im Plan bearbeiten und die vollständige Bemaßungsdarstellung ohne geometrische
Nebenwirkung anordnen, ohne ein separates Maßformular bedienen zu müssen.

### Umfang

1. Ein Doppelklick auf Maßzahl oder Maßlinie öffnet das Eingabefeld direkt an der Maßzahl — in
   Auswahl, Bemaßen, Fixieren, Wand und Plan, ohne vorher eine fremde Werkzeugaktion auszulösen.
2. Beim Anlegen zeigt bereits der erste Bezug eine Vorschau; nach dem zweiten Bezug stehen die
   vollständige vorläufige Bemaßung und das Inline-Feld mit exakt vorausgewähltem Istabstand.
3. **Enter** übernimmt über den bestehenden treibenden Constraint-Pfad; **Escape** verwirft Feld
   und Entwurf gemeinsam.
4. Ein Fokusverlust übernimmt einen gültigen Wert. Ein ungültiger Wert — insbesondere ein
   nicht-ganzzahliger 0,5-mm-Istabstand — bleibt rot und unverändert stehen; gerundet wird nichts.
5. Maßzahl und Maßlinie können angeklickt und quer zur Messrichtung gezogen werden.
6. Während des Ziehens folgen Maßlinie und Zahl gemeinsam dem Zeiger; die Hilfslinien bleiben an
   den Referenzen. Bei `pointerup` wird ausschließlich `linie_mm` gespeichert.
7. Maßwert, Wandgeometrie, Referenzen, `text_mm` und Löserergebnis ändern sich durch den Zug nicht.
8. **Delete** und **Backspace** löschen ausschließlich ein gewähltes Maß; bei aktiver Texteingabe
   greift der globale Löschweg nicht und Wände werden nie über diese Tasten gelöscht.
9. Anlegen, Ändern, Verschieben und Löschen sind jeweils genau ein Undo-/Redo-Schritt.
10. Einfacher Klick, Doppelklick und Ziehen werden so unterschieden, dass keine Aktion
    versehentlich eine andere auslöst.

### Datenmodell

- Die bestehende Bemaßung bleibt die einzige Quelle für den treibenden Maßwert.
- `linie_mm` ist optional und enthält nur den skalaren Querversatz der Maßlinie gegenüber ihrer
  automatischen Staffelposition.
- `text_mm` bleibt ein relativer Versatz der Maßzahl gegenüber der Maßlinie. Altbestand ohne
  `linie_mm` wird unverändert gezeichnet; Altbestand mit `text_mm` behält seinen relativen Versatz.

### Nicht-Ziele

- Keine Änderung der mathematischen Maß- oder Lösersemantik.
- Keine Änderung von Paket 3 oder der Ein-Klick-Semantik des Fixierwerkzeugs.
- Kein freies Verschieben der Bezugspunkte oder Hilfslinienenden.
- Kein zweites, unabhängiges Maßmodell für die Darstellung.

### Abnahme

- Der vollständige D-Werkzeug-Ablauf funktioniert ohne linken Maßeditor.
- Doppelklick auf Zahl oder Linie öffnet in allen Werkzeugen zuverlässig genau das Inline-Feld.
- Ein 0,5-mm-Istabstand wird exakt gezeigt, nicht gerundet und erst nach gültigem Überschreiben
  speicherbar.
- Ein Zug an Zahl oder Linie bewegt Maßlinie und Zahl gleich weit; Hilfslinien bleiben verankert.
- Altbestand mit `text_mm` bleibt visuell verlustfrei, und ein neuer Zug ändert nur `linie_mm`.
- Ziehen verändert Wert, Wände, Referenzen und Löser bit-genau nicht.
- Delete/Backspace löschen Maße, aber weder bei Texteingabe noch jemals Wände.
- Anlegen, Ändern, Verschieben und Löschen lassen sich jeweils mit genau einem Schritt rückgängig
  machen und wiederholen.
- Die Interferenzkette wird mit vollständigen Pointerdown-/Pointerup-/Click-Paaren vor `dblclick`
  regressionsgeprüft.

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
