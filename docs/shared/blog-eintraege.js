// @ts-check
/**
 * SEMBLA Blog — Änderungsliste („Was ist neu?", Modul 8).
 *
 * Versionierte, öffentliche Ressource im Repo: reine Daten, keine Logik. Sie ist die
 * einzige Quelle der Ansicht „Was ist neu?" und funktioniert damit auch ohne Netz.
 *
 * COMMIT-REGEL: Jeder produktive SEMBLA-Commit ergänzt hier GENAU EINEN neuen Eintrag
 * für denselben Issue-Scope. Reine Begleitdoku zählt nicht zweit (kein zweiter Eintrag
 * für dieselbe Änderung).
 *
 * Eintragsformat (v1, flach und stabil):
 *   {
 *     id:        "chg-YYYYMMDD-NN",   eindeutig, zugleich der Anker (#chg-20260805-01)
 *     datum:     "YYYY-MM-DD",        muss zum Datumsteil der id passen
 *     typ:       "feature"|"fix"|"doku"|"intern",
 *     issue:     <positive Ganzzahl>, GitHub-Issue-Nummer dieses Repos
 *     titel:     "…",                 EINE verständliche Zeile, max. 120 Zeichen
 *     testbitte: "…"                  optional, EINE Zeile, max. 240 Zeichen
 *   }
 *
 * Reihenfolge: NEU -> ALT (streng absteigend nach datum, dann nach laufender Nummer).
 *
 * ACHTUNG — dieses Repo ist öffentlich: keine E-Mail-Adressen, keine Tokens, keine
 * absoluten lokalen Pfade, keine kopierten Issue-Bodies. `tests/module/test-blog.mjs`
 * prüft das maschinell.
 */

/** Formatname des Austauschformats (getrennt von PROJEKT_/KATALOG_/SCHEMA_VERSION). */
export const BLOG_FORMAT = "SEMBLA-Blog";

/** Formatversion der Änderungsliste. */
export const BLOG_VERSION = 1;

/** @typedef {{id:string,datum:string,typ:string,issue:number,titel:string,testbitte?:string}} BlogEintrag */

/** @type {BlogEintrag[]} */
export const EINTRAEGE = [
  {
    id: "chg-20260813-02",
    datum: "2026-08-13",
    typ: "feature",
    issue: 73,
    titel: "Der Lageplan kennzeichnet Wände mit außenliegenden Nummernblasen samt Führungslinie statt Zahlen im Wandrechteck",
    testbitte: "Modul 9 mit waagerechten und senkrechten Wänden öffnen: Jede verortete Wand trägt eine Nummernblase außerhalb des Rechtecks mit Führungslinie, die Liste nennt weiter den Namen, und der Block Vollständigkeit unter der Liste ist entfallen.",
  },
  {
    id: "chg-20260813-01",
    datum: "2026-08-13",
    typ: "feature",
    issue: 67,
    titel: "Ein Exportzugang je Projekt-, Geschoss- und Wandeintrag ersetzt Projekt-ZIP und Gesamtstücklisten-Knöpfe",
    testbitte: "In Modul 0 an Projekt, Geschoss und Wand „Exportieren“ öffnen: Das ZIP enthält exakt die gewählten Dateien der Ebene. Achtung: Planbilder reisen nicht mehr mit — der frühere Projektarchiv-Export ist entfallen, der Archiv-Import bleibt.",
  },
  {
    id: "chg-20260812-10",
    datum: "2026-08-12",
    typ: "fix",
    issue: 59,
    titel: "Maßzahlen im Geschosseditor und im Lageplan weichen einander automatisch aus und bleiben einzeln lesbar",
    testbitte: "Im Geschosseditor ein Maß per Ziehen an der Maßzahl auf die Maßlinie eines anderen legen: Beide Zahlen bleiben getrennt lesbar und einzeln anklickbar, und der Lageplan des Geschosses zeigt dieselbe Anordnung.",
  },
  {
    id: "chg-20260812-09",
    datum: "2026-08-12",
    typ: "fix",
    issue: 69,
    titel: "Die Wandplanung meldet links nur noch Fehler und Konflikte statt Erklär- und Produkthinweisen",
    testbitte: "Reiter 1 mit Wand und Katalog öffnen: Zwischen den Bedienfeldern steht kein Erklärtext mehr; erst das Abwählen des Gewindestangen- oder Reststückprodukts zeigt eine kurze Meldung.",
  },
  {
    id: "chg-20260812-08",
    datum: "2026-08-12",
    typ: "feature",
    issue: 68,
    titel: "Die Projektanlage fragt nur noch die Bauherrenschaft ab und belegt den SEMBLA-Standardkatalog vor",
    testbitte: "In Modul 0 „Projekt anlegen…“ öffnen: Nur Name und Bauherrenschaft sind editierbar, der Standardkatalog ist vorgewählt; nach dem Speichern muss er dem neuen Projekt zugeordnet sein, Abbrechen darf nichts ändern.",
  },
  {
    id: "chg-20260812-07",
    datum: "2026-08-12",
    typ: "fix",
    issue: 70,
    titel: "Die Wandstückliste zeigt die gespeicherte Wandbezeichnung statt eines Projekt-Eingabefelds",
    testbitte: "Reiter 4 auf Wandebene öffnen: Kein Projekt-Feld mehr, der Blattkopf nennt den Namen der aktiven Wand; nach Umbenennen oder Wandwechsel muss der Kopf ohne Neuladen den neuen Namen zeigen.",
  },
  {
    id: "chg-20260812-06",
    datum: "2026-08-12",
    typ: "fix",
    issue: 69,
    titel: "Die Eingabespalte der Wandplanung zeigt Bedienfelder statt Erklärtexte",
    testbitte: "Reiter 1 öffnen: Die linke Spalte enthält nur noch Felder, Gruppen und Zustandsmeldungen; Auslegen, Öffnungen, Staffelung, Spannachsen und Produktauswahl müssen unverändert bedienbar bleiben.",
  },
  {
    id: "chg-20260812-05",
    datum: "2026-08-12",
    typ: "fix",
    issue: 66,
    titel: "Die im Geschosseditor angeklickte Wand ist auch oben die aktive Wand",
    testbitte: "Ein Geschoss mit mehreren Wänden öffnen und nacheinander verschiedene Wandkörper und Listenzeilen anklicken: Die grün markierte Wand muss jedes Mal auch in der Kopfleiste als aktive Wand stehen.",
  },
  {
    id: "chg-20260812-04",
    datum: "2026-08-12",
    typ: "fix",
    issue: 61,
    titel: "Die technische Wandzeichnung konzentriert sich auf Ausführungs- und Projektdaten",
    testbitte: "Reiter 7 mit A3 und A4 öffnen und drucken: Wand, Maße, Stückliste, Einbauteil-IDs und Legende müssen erhalten bleiben; Regeltexte, Verwaltungsfelder und Platzhalter müssen fehlen.",
  },
  {
    id: "chg-20260812-03",
    datum: "2026-08-12",
    typ: "fix",
    issue: 59,
    titel: "Der Lageplan nutzt mehr Blattfläche durch einen kompakten Zeichnungskopf",
    testbitte: "Reiter 9 öffnen und Vorschau sowie HTML- und SVG-Export prüfen: Der Kopf muss nur die nötigen Planangaben zeigen; leere Plan-Nummer und leerer Index müssen ohne Platzhalter bleiben.",
  },
  {
    id: "chg-20260812-02",
    datum: "2026-08-12",
    typ: "feature",
    issue: 56,
    titel: "Wände entstehen und ändern ihre Länge nur noch im Geschosseditor",
    testbitte: "In Reiter 0 ein Geschoss öffnen, eine Wand zeichnen und ihre Länge am Endgriff sowie per Längenmaß ändern. Reiter 1 muss dieselbe Länge nur anzeigen; Rückgängig und Wiederholen müssen Lage und Wand gemeinsam zurücksetzen.",
  },
  {
    id: "chg-20260812-01",
    datum: "2026-08-12",
    typ: "feature",
    issue: 65,
    titel: "Modul 8 zeigt veröffentlichte Workflow-Retros als mobile Auswertung",
    testbitte: "Reiter 8 auf einem schmalen Bildschirm öffnen und Workflow-Retros wählen: Kennzahlen und Karten müssen ohne horizontales Scrollen lesbar sein; Filter und Aufklappen müssen funktionieren.",
  },
  {
    id: "chg-20260811-14",
    datum: "2026-08-11",
    typ: "fix",
    issue: 59,
    titel: "Nullmaße bleiben als Wandbezug wirksam, werden im Lageplan aber nicht mehr gezeichnet",
    testbitte: "Im Geschosseditor eine Wandkante mit 0 mm am Ursprung bemaßen und Reiter 9 öffnen: Die Wand muss am Ursprung liegen; Vorschau, Druck und Export dürfen keine Maßgrafik mit 0 zeigen.",
  },
  {
    id: "chg-20260811-13",
    datum: "2026-08-11",
    typ: "fix",
    issue: 61,
    titel: "Die Blattvorschau der technischen Zeichnung entspricht jetzt dem späteren Druck",
    testbitte: "Reiter 7 öffnen und zwischen A3 und A4 wechseln: Wandzeichnung, Seitenspalte und Schriftfeld müssen in Vorschau und Druck dieselben Größenverhältnisse behalten.",
  },
  {
    id: "chg-20260811-12",
    datum: "2026-08-11",
    typ: "fix",
    issue: 59,
    titel: "Lageplan ordnet kurze Wandnummern den vollständigen Namen in der Seitenliste zu",
    testbitte: "Reiter 9 mit mehreren lang benannten Wänden öffnen: Im Grundriss dürfen nur kurze Nummern stehen; dieselben Nummern müssen in Vorschau, Wandliste und Export eindeutig zu den vollständigen Namen führen.",
  },
  {
    id: "chg-20260811-11",
    datum: "2026-08-11",
    typ: "fix",
    issue: 63,
    titel: "Die Zuschnittlegende steht jetzt außerhalb der Wanddarstellung",
    testbitte: "Reiter 1 mit einer aktiven Wand öffnen: Die Legende muss direkt unter der Wandansicht stehen, darf nichts überdecken und nur tatsächlich vorhandene Stückarten nennen.",
  },
  {
    id: "chg-20260811-10",
    datum: "2026-08-11",
    typ: "fix",
    issue: 64,
    titel: "Bemaßungen zeigen Millimeterwerte ohne wiederholtes Einheitensuffix",
    testbitte: "Im Geschosseditor ein Maß setzen und Lageplan sowie technische Wandzeichnung öffnen: Maßzahlen müssen ohne Suffix erscheinen; jede Ansicht nennt die Einheit mm genau einmal.",
  },
  {
    id: "chg-20260811-09",
    datum: "2026-08-11",
    typ: "fix",
    issue: 62,
    titel: "Baustellenstückliste kommt ohne die ausufernde Einbauteil-ID-Spalte aus",
    testbitte: "Reiter 4 mit einer Wand mit vielen Gewindestangenstücken öffnen und drucken: Die Tabelle muss sechs Spalten haben und ohne GS-k-Folgen lesbar bleiben. Einzelteilliste und Zeichnung müssen die IDs weiterhin führen.",
  },
  {
    id: "chg-20260811-08",
    datum: "2026-08-11",
    typ: "feature",
    issue: 44,
    titel: "Gesamtstücklisten fassen aktive Geschosse, Gebäude oder Projekte rückverfolgbar zusammen",
    testbitte: "Reiter 4 öffnen und zwischen Wand, Geschoss, Gebäude und Projekt wechseln: Mengen und Einbauteil-IDs müssen bis zur Wand auflösbar bleiben. Preise ausblenden und den zentralen CSV-Export ohne aktive Wand prüfen.",
  },
  {
    id: "chg-20260811-07",
    datum: "2026-08-11",
    typ: "fix",
    issue: 60,
    titel: "Ursprungsmaße entstehen jetzt direkt mit dem normalen Bemaßungswerkzeug",
    testbitte: "Im Geschossplan „Maß“ wählen, eine Ursprungslinie und einen parallelen Wandbezug anklicken und "
      + "den Wert eingeben. Das frühere Fix-Werkzeug und die Taste F dürfen nicht mehr vorhanden sein.",
  },
  {
    id: "chg-20260811-06",
    datum: "2026-08-11",
    typ: "fix",
    issue: 57,
    titel: "Wandwerkzeug setzt den ersten Punkt auf die Außenecke und legt nur noch durch Ziehen an",
    testbitte: "Im Geschossplan den Rasterfang ausschalten und eine Wand schräg von einer Ecke wegziehen: "
      + "Die Wand muss auf der gewählten Seite liegen. Einzelne oder zwei getrennte Klicks dürfen nichts anlegen.",
  },
  {
    id: "chg-20260811-05",
    datum: "2026-08-11",
    typ: "fix",
    issue: 58,
    titel: "Modul 4 zeigt die Baustellenstückliste jetzt kompakt und druckbar",
    testbitte: "Reiter 4 öffnen und drucken: Lange Einbauteil-ID-Listen müssen innerhalb der Tabelle umbrechen. "
      + "Fehlende Einzel- und Gesamtpreise müssen als n.a. erscheinen; Latten, Platten und Verbinder bleiben ausgeschlossen.",
  },
  {
    id: "chg-20260811-04",
    datum: "2026-08-11",
    typ: "fix",
    issue: 15,
    titel: "Neue Wände speichern Gewindestangen und Reststück sofort aus dem Bauteilkatalog",
    testbitte: "In Reiter 0 eine Wand anlegen oder im Geschossplan zeichnen und direkt Reiter 4 oder 7 öffnen: "
      + "Die Gewindestangenlängen und das obere Reststück müssen ohne Zwischenbesuch von Reiter 1 stimmen.",
  },
  {
    id: "chg-20260811-03",
    datum: "2026-08-11",
    typ: "feature",
    issue: 22,
    titel: "Modul 4 ist die Baustellenstückliste: Gewindestangenstücke mit Einbauteil-ID, ohne Beplankung",
    testbitte: "Reiter 4 öffnen: Stangenstücke zeigen Art (Symbol und Wort), Fertigmaß, Wand und "
      + "ihre Einbauteil-IDs — dieselben IDs stehen am Blatt in Reiter 7. Latten, Platten und "
      + "Verbinder stehen nicht mehr in der Liste.",
  },
  {
    id: "chg-20260811-02",
    datum: "2026-08-11",
    typ: "fix",
    issue: 15,
    titel: "Technische Zeichnung zeigt das obere Reststück vollständig und meldet offenen Zuschnitt",
    testbitte: "Reiter 7 mit einer Wand öffnen: Das kurze Reststück muss über die Oberkante ragen "
      + "und in der Stückliste stehen. Ohne gültiges Reststück muss ein Zuschnittkonflikt erscheinen.",
  },
  {
    id: "chg-20260811-01",
    datum: "2026-08-11",
    typ: "feature",
    issue: 55,
    titel: "Modul 8 zeigt jetzt den Umsetzungsplan: Entscheidungen, nächstes Issue, Warteschlange",
    testbitte: "Reiter 8 öffnen: der Umsetzungsplan muss zuerst kommen. Prüfen, ob die "
      + "Entscheidungen zu dir passen, ob „Als Nächstes“ nachvollziehbar begründet ist und "
      + "ob jede Karte auf das richtige Issue verlinkt. „Was ist neu?“ muss unverändert sein.",
  },
  {
    id: "chg-20260810-06",
    datum: "2026-08-10",
    typ: "feature",
    issue: 54,
    titel: "Neu: Modul 9 „Lageplan“ — Geschossgrundriss als druckbare Projektunterlage",
    testbitte: "Reiter 9 öffnen, Projekt und Geschoss wählen: die Wände müssen wie im "
      + "Geschossplaner liegen, die Maße genau dort stehen. „Blatt drucken“ prüfen und "
      + "„Exportieren“ (ZIP mit HTML + SVG). Unverortete Wände müssen auf dem Blatt stehen.",
  },
  {
    id: "chg-20260810-05",
    datum: "2026-08-10",
    typ: "feature",
    issue: 53,
    titel: "Layout-Editor: aufgeräumte Oberfläche — Werkzeugleiste oben, Ansicht unten, Plan im Popup",
    testbitte: "Reiter 0 → „Geschoss öffnen“: linke Spalte weg, Werkzeuge oben, Ansicht unten. Der "
      + "Plan wird nur noch über „Plan…“ verwaltet; beim Kalibrieren muss das Popup klein werden. "
      + "Eine Wand mit anliegendem Maß darf sich nicht drehen lassen.",
  },
  {
    id: "chg-20260810-04",
    datum: "2026-08-10",
    typ: "feature",
    issue: 52,
    titel: "Geschossplan: Maßstab direkt im Editor abgreifen, Rasterfang standardmäßig aus",
    testbitte: "Reiter 0 → „Geschoss öffnen“: der Plan liegt sofort als Hintergrund; links "
      + "„Maßstab aus Plan übernehmen“ starten, zwei Punkte im Plan anklicken (Zoomen dazwischen "
      + "erlaubt), Länge eintragen. Der Rasterfang muss beim Start aus sein.",
  },
  {
    id: "chg-20260810-03",
    datum: "2026-08-10",
    typ: "fix",
    issue: 51,
    titel: "Layout-Editor: Doppelklick auf ein Maß öffnet die Eingabe wieder zuverlässig",
    testbitte: "Reiter 0 → „Geschoss öffnen“: zweimal schnell auf Maßzahl oder Maßlinie klicken — die "
      + "Eingabe muss aufgehen. Zwei langsame Klicks, zwei verschiedene Maße und echtes Ziehen dürfen "
      + "sie nicht öffnen.",
  },
  {
    id: "chg-20260810-02",
    datum: "2026-08-10",
    typ: "fix",
    issue: 51,
    titel: "Layout-Editor: Bemaßungen vollständig inline anlegen, bearbeiten, verschieben und löschen",
    testbitte: "Reiter 0 → „Geschoss öffnen“: mit D zwei Bezüge wählen, Maß per Enter setzen; danach "
      + "Maßzahl oder Maßlinie doppelklicken, ziehen und mit Delete löschen. Escape muss Entwürfe verwerfen.",
  },
  {
    id: "chg-20260810-01",
    datum: "2026-08-10",
    typ: "feature",
    issue: 51,
    titel: "Layout-Editor: Maße direkt in der Zeichnung eingeben und die Maßzahl frei verschieben",
    testbitte: "Reiter 0 → „Geschoss öffnen“: Doppelklick auf eine Maßzahl öffnet die Eingabe an "
      + "Ort und Stelle (Enter übernimmt, Escape verwirft); die Zahl lässt sich außerdem "
      + "verschieben, ohne dass sich Maßwert oder Maßlinie bewegen.",
  },
  {
    id: "chg-20260809-01",
    datum: "2026-08-09",
    typ: "feature",
    issue: 50,
    titel: "Layout-Editor: neue Wände nur noch zeichnen, „Standard-Wandhöhe“ und „Planen“ je Wand",
    testbitte: "Reiter 0 → „Geschoss öffnen“: links gibt es keinen Abschnitt „Neue Wand“ mehr; die "
      + "Angaben stehen am Werkzeug „Wand zeichnen“, und in der Wandliste öffnet „Planen“ Modul 1.",
  },
  {
    id: "chg-20260808-05",
    datum: "2026-08-08",
    typ: "feature",
    issue: 26,
    titel: "Projektarchiv vollständig sichern und wiederherstellen – als ZIP oder importierbarer Ordner",
    testbitte: "Reiter 0: „Export (ZIP)“, Browserdaten in einem Testbrowser löschen und das ZIP oder den "
      + "entpackten Ordner importieren. Vor dem Schreiben muss ein Prüfbericht erscheinen.",
  },
  {
    id: "chg-20260808-04",
    datum: "2026-08-08",
    typ: "feature",
    issue: 26,
    titel: "Layout-Editor: Wandliste über der Zeichnung, Geschoss darunter als blasse Umrisse",
    testbitte: "Reiter 0 → „Geschoss öffnen“: die Liste oben rechts zeigt alle Wände (Länge, Höhe, "
      + "Wandtyp, Bestimmtheit) und wählt in beide Richtungen; Doppelklick auf eine Maßzahl öffnet das Maß.",
  },
  {
    id: "chg-20260808-03",
    datum: "2026-08-08",
    typ: "fix",
    issue: 24,
    titel: "3D-Vorschau: Kopfblech folgt der gestaffelten Wandoberkante statt über der Wand zu schweben",
    testbitte: "Reiter 6 mit einer gestaffelten Wand (z. B. 2600/2200/1800/1400): das Kopfblech liegt "
      + "abschnittsweise auf jeder lokalen Oberkante; bei oberem Anschluss „Spannplatte“ fehlt es ganz.",
  },
  {
    id: "chg-20260808-02",
    datum: "2026-08-08",
    typ: "feature",
    issue: 26,
    titel: "Layout-Editor: Wände bemaßen und fixieren — mit Widerspruchsmeldung und Rückgängig",
    testbitte: "Reiter 0 → „Geschoss öffnen“: mit „D“ zwei parallele Bezüge anklicken und ein Maß in mm "
      + "setzen, mit „F“ gegen den Geschossursprung fixieren (je Achse einzeln), Strg+Z macht rückgängig.",
  },
  {
    id: "chg-20260808-01",
    datum: "2026-08-08",
    typ: "fix",
    issue: 26,
    titel: "Layout-Editor: Wandkanten liegen jetzt auf dem Raster, Griffe ändern die Länge, R dreht um 90°",
    testbitte: "Reiter 0 → „Geschoss öffnen“: Wand mit gedrückter Maustaste aufziehen (Vorschau ab dem "
      + "Startpunkt), dann an den Endgriffen länger/kürzer ziehen und mit „R“ drehen.",
  },
  {
    id: "chg-20260807-05",
    datum: "2026-08-07",
    typ: "feature",
    issue: 26,
    titel: "Layout-Editor: Wände im Geschossplan zeichnen und verschieben — auf einer eigenen Seite",
    testbitte: "Reiter 0 → beim Geschoss auf „Geschoss öffnen“, dort mit „W“ Wände zeichnen und ziehen. "
      + "Erwartet: Überlappungen werden rot gemeldet, aber nie von selbst korrigiert.",
  },
  {
    id: "chg-20260807-04",
    datum: "2026-08-07",
    typ: "intern",
    issue: 26,
    titel: "Geschosslayout: Wandlagen jetzt in Millimetern statt im Raster, dazu Bemaßungen und ein Constraint-Löser",
    testbitte: "Nichts zu klicken — der Editor kommt als eigene Seite. Wichtig ist nur, dass Reiter 0 nach dem Update "
      + "alle Projekte, Geschosse, Wände und Pläne unverändert zeigt.",
  },
  {
    id: "chg-20260807-03",
    datum: "2026-08-07",
    typ: "feature",
    issue: 26,
    titel: "Projektplaner neu: aufklappbare Liste Projekt → Geschoss → Wand, alle Formulare im Popup, mehrere Projekte",
    testbitte: "Reiter 0: mehrere Projekte anlegen, auf- und zuklappen, Kopfdaten im Popup pflegen. "
      + "Erwartet: Aufklappen ändert nie, was aktiv ist; ein Geschoss wird erst aktiv, wenn sein "
      + "Projekt es ist — der Knopf sagt sonst warum.",
  },
  {
    id: "chg-20260807-02",
    datum: "2026-08-07",
    typ: "doku",
    issue: 26,
    titel: "Projektplaner: Umbau der Bedienung beschlossen — mehrere Projekte, aufklappbare Liste, Formulare im Popup",
    testbitte: "Noch nichts zu testen — das ist die Festlegung vor dem Umbau. Rückmeldung erwünscht: "
      + "fehlt in Projekt → Geschoss → Wand eine Ebene oder eine Schaltfläche, die du brauchst?",
  },
  {
    id: "chg-20260807-01",
    datum: "2026-08-07",
    typ: "fix",
    issue: 26,
    titel: "Auslieferung reparieren: die Suite ging tagelang nicht live, obwohl die Arbeit fertig war",
    testbitte: "Reiter 0 neu laden (ggf. Shift+Neuladen): sind Projekt/Gebäude/Geschoss und der "
      + "Geschossplan mit Kalibrierung da? Genau die beiden Ausbaustufen waren zwar fertig, aber "
      + "nie ausgeliefert.",
  },
  {
    id: "chg-20260806-10",
    datum: "2026-08-06",
    typ: "feature",
    issue: 26,
    titel: "Modul 0: Geschossplan hochladen, mit einer Kalibrierlinie maßstäblich setzen und unter das 125-mm-Raster schieben",
    testbitte: "Reiter 0: Grundriss als PNG/JPG hochladen, „Kalibrierlinie setzen“, zwei Punkte mit "
      + "bekanntem Abstand anklicken, Länge in mm eintragen. Passt das Raster? Plan mit der Maus "
      + "schieben, neu laden — liegt er richtig? Ein PDF wird abgewiesen.",
  },
  {
    id: "chg-20260806-09",
    datum: "2026-08-06",
    typ: "feature",
    issue: 26,
    titel: "Modul 0: Projekt, Gebäude und Geschosse anlegen und wählen — Wände gehören jetzt zu einem Geschoss",
    testbitte: "Reiter 0: Projekt anlegen, zwei Geschosse mit Höhe anlegen, in jedem eine Wand. Prüfen: "
      + "steht die Höhe als Vorgabe im Feld „Höhe“, zeigt die Wandliste das richtige Geschoss, ist nach "
      + "dem Neuladen alles noch da?",
  },
  {
    id: "chg-20260806-08",
    datum: "2026-08-06",
    typ: "intern",
    issue: 26,
    titel: "Grundlage für den Projektplaner: Projekt, Gebäude, Geschosse und Wandlagen im Datenmodell",
    testbitte: "Zu sehen ist noch nichts — die Oberfläche kommt im nächsten Schritt. Bitte nur "
      + "einmal Reiter 0 öffnen und prüfen, ob alle Wände und der Bauteilkatalog unverändert da sind.",
  },
  {
    id: "chg-20260806-07",
    datum: "2026-08-06",
    typ: "feature",
    issue: 31,
    titel: "Spannachsen halten jetzt jeden Stein; Maximalabstand ist nur noch Obergrenze",
    testbitte: "Reiter 1: bei verschiedenen Längen und Öffnungen prüfen, ob jeder Stein von einer "
      + "Spannachse durchgangen wird und die Achsen der untersten Lage mittig in den i3-Steinen "
      + "sitzen. Die Achsen liegen dichter als früher — das ist gewollt.",
  },
  {
    id: "chg-20260806-06",
    datum: "2026-08-06",
    typ: "intern",
    issue: 20,
    titel: "Reiter 2, 3 und 5 vorübergehend ausgeblendet — Fokus auf den AWG-Zyklus",
    testbitte: "Die Kopfleiste zeigt nur noch 0, 1, 4, 6, 7 und 8. Aufbau, Statik und Montage sind "
      + "fachlich unverändert und weiter per direkter Adresse erreichbar; auch im ZIP-Export bleibt "
      + "alles wählbar.",
  },
  {
    id: "chg-20260806-05",
    datum: "2026-08-06",
    typ: "feature",
    issue: 49,
    titel: "Zuschnitt-Farben überall gleich: Baugruppenbilder zeigen die Stückarten jetzt mit",
    testbitte: "Reiter 5: die Gewindestangen der Baugruppenbilder sind stückweise gefärbt "
      + "(Standardlänge, Sonderzuschnitt, Reststück) und haben eine Zuschnitt-Legende — dieselben "
      + "Farben wie in der Wandansicht (Reiter 1) und der Zeichnung (Reiter 7)?",
  },
  {
    id: "chg-20260806-04",
    datum: "2026-08-06",
    typ: "fix",
    issue: 19,
    titel: "Reststück und Zuschnitt sind jetzt auch in der technischen Zeichnung sichtbar",
    testbitte: "Reiter 7: die Stränge zeigen Standardlänge, Sonderzuschnitt und Reststück in "
      + "drei Farben (Legende darunter), und die Vorspann-Tabelle nennt „Reststück oben“ "
      + "getrennt von den Sonderlängen.",
  },
  {
    id: "chg-20260806-03",
    datum: "2026-08-06",
    typ: "feature",
    issue: 21,
    titel: "Bauteilkatalog belegt die Produkte selbst vor; keine Zuschnitt-Auswahl, eine Kopplungsmutter",
    testbitte: "Reiter 0: eine neue Wand anlegen — der Standardkatalog wird bei Bedarf geladen und "
      + "alle Verwendungsstellen sind vorbelegt. In Reiter 1/2 ist alles frei umwählbar; die Auswahl "
      + "für das Ausgangsprodukt der Sonderzuschnitte ist weg.",
  },
  {
    id: "chg-20260806-02",
    datum: "2026-08-06",
    typ: "feature",
    issue: 19,
    titel: "Modul 1 zeigt den Zuschnitt direkt in der Wandansicht; Feld für die Stangenlänge ist weg",
    testbitte: "Reiter 1: die Vorspannstränge sind jetzt in ihre echten Stücke zerlegt "
      + "(Standardlänge, Sonderzuschnitt, Reststück, Kopplungen) — beim Ändern der Wandhöhe sieht "
      + "man die Zerlegung sofort mitwandern.",
  },
  {
    id: "chg-20260806-01",
    datum: "2026-08-06",
    typ: "feature",
    issue: 19,
    titel: "Gewindestangen enden oben mit einem kurzen Reststück aus dem Katalog",
    testbitte: "Reiter 1: im Bauteilkatalog ein Reststück-Produkt für die Rolle „Gewindestange – "
      + "Reststück\" wählen. Jeder Strang an der Wandoberkante endet dann damit; ohne Auswahl wird "
      + "der obere Abschluss als offen gemeldet statt eine Länge zu erfinden.",
  },
  {
    id: "chg-20260805-02",
    datum: "2026-08-05",
    typ: "feature",
    issue: 48,
    titel: "Projektstatus zeigt bei „Entscheidung nötig\" und „Blockiert\" die offene Frage direkt",
    testbitte: "Reiter 8, Ansicht Projektstatus: steht bei den Gruppen Entscheidung nötig und "
      + "Blockiert die kurze Frage samt Empfehlung in der Karte — ohne den Issue zu öffnen?",
  },
  {
    id: "chg-20260805-01",
    datum: "2026-08-05",
    typ: "feature",
    issue: 48,
    titel: "Neues Modul: Projektblog mit Änderungsliste und Projektstatus",
    testbitte: "Reiter 8 (Blog) in der App aufrufen, beide Ansichten durchsehen und einen "
      + "Link der Form #issue-31 öffnen — springt die Seite zur richtigen Karte?",
  },
];
