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
    id: "chg-20260909-22",
    datum: "2026-09-09",
    typ: "fix",
    issue: 97,
    titel: "Sammel-Editor zieht Einbauhöhe und Schlüsselweite der Spannmutter mit nach",
    testbitte: "Im Geschosseditor mehrere Wände auswählen, unter „Gemeinsam bearbeiten…\" "
      + "eine andere Spannmutter setzen: sie erscheint in Modul 1 und Modul 7 sofort in "
      + "der neuen Größe. Fehlt ein Katalogmaß, bleibt der bisherige Wert stehen.",
  },
  {
    id: "chg-20260909-21",
    datum: "2026-09-09",
    typ: "feature",
    issue: 97,
    titel: "Neue Standardkatalogfassung v2 mit den Schlüsselweiten der M10-Spannstabteile",
    testbitte: "In Modul 10 den Standardkatalog v2 ansehen: Spannmutter, Mutter des "
      + "Einlegeblechs und Sechskantschraube Fuß führen jetzt 17 mm Schlüsselweite. Die "
      + "Fassung v1 bleibt unverändert daneben ladbar; bestehende Projekte werden nicht "
      + "umgestellt.",
  },
  {
    id: "chg-20260909-20",
    datum: "2026-09-09",
    typ: "fix",
    issue: 97,
    titel: "Die Spannmutter wird mit ihrer realen Höhe und Schlüsselweite gezeichnet",
    testbitte: "In Modul 1 auf eine deutlich größere Spannmutter umstellen: die Mutter wird in "
      + "der Wandansicht und im Blatt von Modul 7 höher und breiter und lässt sich abmessen. "
      + "Ohne gepflegtes Maß bleibt es beim Symbol.",
  },
  {
    id: "chg-20260909-19",
    datum: "2026-09-09",
    typ: "fix",
    issue: 97,
    titel: "Das rote Z des Deckenanschlusses ist wieder vollständig sichtbar",
    testbitte: "In Modul 1 und Modul 7 eine Wand mit Deckenanschluss ansehen: das rote Z steht "
      + "jetzt links neben der Gewindestange, sein unterer Schenkel liegt über der Spannplatte "
      + "und kreuzt die Stange nach rechts. Die Stange bleibt im Vordergrund.",
  },
  {
    id: "chg-20260909-18",
    datum: "2026-09-09",
    typ: "feature",
    issue: 97,
    titel: "Einbauhöhe und Schlüsselweite der Spannmutter stehen jetzt am Wandelement",
    testbitte: "In Modul 1 eine Spannmutter mit gepflegter Einbauhöhe und Schlüsselweite "
      + "wählen und auslegen: die Auslegung bleibt gleich, beide Maße reisen mit. Fehlt ein "
      + "Maß, wird die Lücke benannt; gezeichnet wird sie im nächsten Schritt.",
  },
  {
    id: "chg-20260909-17",
    datum: "2026-09-09",
    typ: "fix",
    issue: 97,
    titel: "Eine Sammeländerung im Geschosseditor zieht die Schlüsselweite der Kopplungsmutter mit",
    testbitte: "Im Geschosseditor mehrere Wände auswählen, unter „Gemeinsam bearbeiten…“ eine "
      + "Kopplungsmutter mit anderer Schlüsselweite setzen: Modul 1 und Modul 7 zeigen die "
      + "Muttern sofort in der neuen Breite, ohne die Wände einzeln neu auszulegen.",
  },
  {
    id: "chg-20260909-16",
    datum: "2026-09-09",
    typ: "feature",
    issue: 97,
    titel: "Die Kopplungsmutter wird jetzt in ihrer realen Breite gezeichnet",
    testbitte: "In Modul 1 eine Wand mit gepflegter Schlüsselweite auslegen: Wandansicht "
      + "und Blatt von Modul 7 zeigen die Kopplungsmutter danach maßstabsgetreu statt zu "
      + "breit. Ohne gepflegtes Maß bleibt alles wie bisher.",
  },
  {
    id: "chg-20260909-15",
    datum: "2026-09-09",
    typ: "feature",
    issue: 97,
    titel: "Die Schlüsselweite der Kopplungsmutter steht nach dem Auslegen an der Wand",
    testbitte: "In Modul 1 eine Kopplungsmutter mit gepflegter Schlüsselweite wählen und "
      + "„Auslegen“ drücken: die Wand führt danach dieses Maß, Zuschnitt und Mengen "
      + "bleiben unverändert. Gezeichnet wird sie noch mit ihrer bisherigen Breite.",
  },
  {
    id: "chg-20260909-14",
    datum: "2026-09-09",
    typ: "feature",
    issue: 97,
    titel: "Schlüsselweite eines Kleinteils ist jetzt ein gepflegtes Katalogmaß",
    testbitte: "In Modul 10 die Kopplungsmutter öffnen: neben Gewinde, Einbauhöhe und "
      + "Bauteillänge steht das neue Feld „Schlüsselweite (mm)“, im Standardkatalog "
      + "bereits mit 17 mm gefüllt.",
  },
  {
    id: "chg-20260909-13",
    datum: "2026-09-09",
    typ: "fix",
    issue: 117,
    titel: "Sammeländerung im Geschosseditor rechnet jede Wand jetzt vollständig neu",
    testbitte: "Im Geschosseditor mehrere Wände auswählen, in „Gemeinsam bearbeiten…“ "
      + "nur den Überstand des Reststücks ändern und danach Modul 4 öffnen: "
      + "Zuschnitt und Stückliste passen sofort zum neuen Überstand, ohne „Auslegen“ "
      + "in Modul 1.",
  },
  {
    id: "chg-20260909-12",
    datum: "2026-09-09",
    typ: "fix",
    issue: 116,
    titel: "Stückliste nennt jetzt, welche gewählte Produkt-Kennung im Katalog fehlt",
    testbitte: "Modul 4 für eine Wand öffnen, deren Verwendungsstelle neben einem "
      + "vorhandenen Produkt noch eine im Katalog nicht mehr auffindbare Kennung führt: "
      + "unter „Produkt fehlt im Katalog“ steht jetzt genau diese Kennung.",
  },
  {
    id: "chg-20260909-11",
    datum: "2026-09-09",
    typ: "fix",
    issue: 112,
    titel: "Gewindestangen und die wei\u00dfe Sto\u00dfmarke liegen jetzt auch vor der "
      + "Kopplungsmutter",
    testbitte: "In Modul 1 eine Wand mit mehrst\u00fcckigen Spannstr\u00e4ngen \u00f6ffnen und "
      + "danach ihr Blatt in Modul 7: die Stange l\u00e4uft durch die Kopplungsmutter hindurch, "
      + "und die wei\u00dfe Haarlinie am Sto\u00df ist frei sichtbar.",
  },
  {
    id: "chg-20260909-10",
    datum: "2026-09-09",
    typ: "fix",
    issue: 114,
    titel: "Sammeländerung setzt Bodenbleche jetzt auch bei Wänden mit einem alten, "
      + "nicht mehr im Katalog stehenden Produkt",
    testbitte: "Mehrere Wände auswählen, „Gemeinsam bearbeiten…“ öffnen, „Bodenblech“ "
      + "ankreuzen, Katalogprodukt wählen und übernehmen — die alte Kennung wird nur "
      + "noch als nicht im Katalog vorhanden benannt.",
  },
  {
    id: "chg-20260909-09",
    datum: "2026-09-09",
    typ: "intern",
    issue: 94,
    titel: "Nachgewiesen: Baugruppen ergeben auf jeder St\u00fccklistenebene dieselben Mengen",
    testbitte: "Dieselbe Wand in Modul 4 als Wand, Geschoss, Geb\u00e4ude und Projekt ansehen: Spannplatte, Spannmutter und die Deckenanschlussteile stehen \u00fcberall mit denselben Mengen. Eine manuelle Menge wirkt weiter nur auf der Wandebene.",
  },
  {
    id: "chg-20260909-08",
    datum: "2026-09-09",
    typ: "feature",
    issue: 97,
    titel: "Die Kopplungsmutter wird mit ihrer realen Einbauh\u00f6he gezeichnet",
    testbitte: "In Modul 1 eine Kopplungsmutter aus dem Katalog w\u00e4hlen, dann Wandansicht und Blatt in Modul 7 ansehen: am Wandfu\u00df und an jedem Stangensto\u00df ist sie masst\u00e4blich hoch, 30 mm niedriger als 50 mm. Ohne Ma\u00df bleibt das bisherige Symbol.",
  },
  {
    id: "chg-20260909-07",
    datum: "2026-09-09",
    typ: "feature",
    issue: 94,
    titel: "Die St\u00fcckliste zeigt, welche Baugruppen mit welcher Anzahl gegriffen haben",
    testbitte: "In Modul 4 eine Wand mit zugeordnetem Standardkatalog ansehen: unter der Tabelle steht \u201eBaugruppen\u201c mit Name, Anzahl und den aufgel\u00f6sten Verwendungsstellen, nicht Aufl\u00f6sbares benannt. Mengen und Preise bleiben gleich.",
  },
  {
    id: "chg-20260909-06",
    datum: "2026-09-09",
    typ: "feature",
    issue: 113,
    titel: "Die Gesamtstückliste bringt eine Einkaufsliste je Katalogprodukt mit",
    testbitte: "In Modul 0 ein Geschoss exportieren und die zweite CSV „Einkaufsliste\" öffnen: je Zeile ein Artikel mit summierter Menge, Einbaustellen und Beschaffungsangaben; nicht Bestellbares steht im Block „Klärung vor der Bestellung nötig\".",
  },
  {
    id: "chg-20260909-05",
    datum: "2026-09-09",
    typ: "feature",
    issue: 97,
    titel: "Die Spannplatte wird mit ihrer realen Katalogdicke gezeichnet",
    testbitte: "In Modul 1 eine Spannplatte als oberen Anschluss w\u00e4hlen und die Wandansicht sowie das Blatt in Modul 7 ansehen: die Platte liegt mit ihrer echten Dicke auf der Kante und ist ma\u00dfst\u00e4blich abmessbar, die Spannmutter sitzt unmittelbar darauf.",
  },
  {
    id: "chg-20260909-04",
    datum: "2026-09-09",
    typ: "feature",
    issue: 107,
    titel: "Die Wandblätter der Zeichnungs-PDF stehen alphabetisch nach dem Wandnamen",
    testbitte: "In Modul 0 auf Projektebene mit „Zeichnungen als PDF\" exportieren und eine Geschoss-PDF durchblättern: hinter dem Lageplan stehen die Wandblätter in alphabetischer Namensfolge statt in Zeichenreihenfolge.",
  },
  {
    id: "chg-20260909-03",
    datum: "2026-09-09",
    typ: "feature",
    issue: 113,
    titel: "Der Standardkatalog führt die bekannten Beschaffungsangaben in eigenen Feldern",
    testbitte: "In Modul 10 den Standardkatalog laden und die Spannmutter M10 sowie die Bohrschraube öffnen: Norm, Gewinde, Oberfläche, Hersteller und Artikelnummer stehen im Abschnitt Beschaffung als einzelne Felder statt nur im Namen.",
  },
  {
    id: "chg-20260909-02",
    datum: "2026-09-09",
    typ: "feature",
    issue: 113,
    titel: "Die St\u00fccklistendateien f\u00fchren Norm, Werkstoff, Oberfl\u00e4che, Hersteller und Artikelnummer mit",
    testbitte: "In Modul 0 die Baustellenst\u00fcckliste einer Wand und die Gesamtst\u00fcckliste eines Geschosses exportieren: hinter den bisherigen Spalten steht der Beschaffungsblock, bei nicht eindeutig zugeordneten Positionen leer.",
  },
  {
    id: "chg-20260909-01",
    datum: "2026-09-09",
    typ: "feature",
    issue: 108,
    titel: "Aus dem Standardkatalog wird nur nach ausdr\u00fccklicher R\u00fcckfrage eine eigene Katalogvariante",
    testbitte: "In Modul 10 den Standardkatalog laden, einen Preis \u00e4ndern und speichern: die R\u00fcckfrage abbrechen (nichts entsteht), dann best\u00e4tigen und den hervorgehobenen Hinweis lesen.",
  },
  {
    id: "chg-20260908-30",
    datum: "2026-09-08",
    typ: "fix",
    issue: 91,
    titel: "Bodenblechsto\u00df wei\u00df und blechhoch, die reale Blechaufteilung steht schon in Modul 1",
    testbitte: "In Modul 1 eine Wand von 4,375 m auslegen: unter dem Wandfu\u00df stehen die "
      + "einzelnen Bodenblechteile, jede Teilgrenze als wei\u00dfe Marke im Blech. Die L\u00e4nge "
      + "auf 3,00 m \u00e4ndern \u2014 die Aufteilung wandert mit.",
  },
  {
    id: "chg-20260908-29",
    datum: "2026-09-08",
    typ: "feature",
    issue: 113,
    titel: "Katalogprodukte f\u00fchren Norm, Werkstoff, Oberfl\u00e4che, Hersteller und Artikelnummer",
    testbitte: "In Modul 10 ein Produkt bearbeiten: unter den Ma\u00dfen steht der Abschnitt "
      + "\u201eBeschaffung\u201c, bei Verbrauchsmaterial zus\u00e4tzlich \u201eGewinde\u201c. Ausf\u00fcllen, "
      + "speichern, Katalog exportieren und importieren \u2014 alle Angaben stehen "
      + "unver\u00e4ndert am Produkt.",
  },
  {
    id: "chg-20260908-28",
    datum: "2026-09-08",
    typ: "fix",
    issue: 112,
    titel: "Gewindestangen liegen in Wandansicht und Zeichnung im Vordergrund, jeder Sto\u00df tr\u00e4gt eine wei\u00dfe Haarlinie",
    testbitte: "In Modul 1 eine Wand mit mehrst\u00fcckigen Spannstr\u00e4ngen \u00f6ffnen und danach ihr "
      + "Blatt in Modul 7: keine Stangenlinie wird mehr von Blech, Einlegeblech oder "
      + "Symbol verdeckt, und an jedem Stangensto\u00df steht quer eine wei\u00dfe Haarlinie.",
  },
  {
    id: "chg-20260908-27",
    datum: "2026-09-08",
    typ: "feature",
    issue: 95,
    titel: "Der Deckenanschluss ist in Wandansicht und Zeichnung zu sehen \u2014 und steht mit allen Teilen in der St\u00fcckliste",
    testbitte: "In Modul 1 eine Wand \u00f6ffnen: an jedem Anschlusspunkt steht ein rotes Z; "
      + "dieselbe Marke zeigt das Blatt in Modul 7, beide mit Legendeneintrag. In Modul 4 "
      + "stehen die sieben Teile des Deckenanschlusses mit ihrer Menge.",
  },
  {
    id: "chg-20260908-26",
    datum: "2026-09-08",
    typ: "feature",
    issue: 95,
    titel: "Der Deckenanschluss steht als Baugruppe im Bauteilkatalog \u2014 mit allen Einzelteilen",
    testbitte: "In Modul 10 den Standardkatalog laden: unter „Baugruppen“ steht "
      + "„Deckenanschluss“ mit neun Teilen, in Modul 1 sind sie unter „Anschluss“ "
      + "wählbar. Die Stückliste bleibt unverändert — Mengen kommen mit der "
      + "Verteilung auf die Spannachsen.",  },
  {
    id: "chg-20260908-25",
    datum: "2026-09-08",
    typ: "feature",
    issue: 111,
    titel: "Sammel-Editor: mehrere Bauteile je Verwendungsstelle mit H\u00e4kchen w\u00e4hlen \u2014 wie in Modul 1",
    testbitte: "Im Geschosseditor mehrere W\u00e4nde ausw\u00e4hlen, \u201eGemeinsam bearbeiten\u2026\u201c "
      + "\u00f6ffnen: bei den Gewindestangen l\u00e4sst sich jetzt mehr als ein Produkt ankreuzen. "
      + "\u00dcbernehmen und in Modul 1 pr\u00fcfen, dass alle gew\u00e4hlten L\u00e4ngen stehen.",
  },
  {
    id: "chg-20260908-24",
    datum: "2026-09-08",
    typ: "fix",
    issue: 92,
    titel: "Die Unterlegscheibe am Wandabschluss ist entfallen \u2014 sie wird dort nicht verbaut",
    testbitte: "St\u00fcckliste in Modul 4: keine Unterlegscheibe mehr, auch nicht mit Menge 0. "
      + "In Modul 1 ist die Auswahl weg, im Bauteilkatalog das Produkt und die Position in der "
      + "Baugruppe. Die Zahl der Spannmuttern bleibt gleich.",
  },
  {
    id: "chg-20260908-23",
    datum: "2026-09-08",
    typ: "fix",
    issue: 106,
    titel: "Stein, Schrift, Linien und Symbole sind in jeder Wand gleich gro\u00df \u2014 "
      + "Spannmutter erg\u00e4nzt",
    testbitte: "Eine 2-m- und eine 8-m-Wand in Modul 1 vergleichen: Steine, Schrift und "
      + "Linien gleich gro\u00df, die Ansicht wird breiter statt kleiner. Bei hohen W\u00e4nden "
      + "schrumpft nichts. Einpassen verkleinert nur. Auf jeder Spannplatte sitzt die "
      + "Spannmutter.",
  },
  {
    id: "chg-20260908-22",
    datum: "2026-09-08",
    typ: "fix",
    issue: 106,
    titel: "Bauteilsymbole sind jetzt in jeder Wand gleich gro\u00df \u2014 und die Fu\u00dffolge "
      + "zeigt Schraube, Blech und Kopplungsmutter",
    testbitte: "Zwei W\u00e4nde verschiedener L\u00e4nge in Modul 1 und Modul 7: Muttern sind "
      + "gleich gro\u00df, vorher ein Mehrfaches gr\u00f6\u00dfer. Am Fu\u00df Sechskantschraube, "
      + "Bodenblech, aufliegende Kopplungsmutter statt Mutter halb im Blech; die Spannplatte "
      + "liegt oben auf.",
  },
  {
    id: "chg-20260907-20",
    datum: "2026-09-07",
    typ: "feature",
    issue: 111,
    titel: "Produktauswahl von Modul 1 f\u00fcr mehrere W\u00e4nde gemeinsam setzen \u2014 im "
      + "selben Popup wie die Wandmerkmale",
    testbitte: "Im Geschosseditor drei W\u00e4nde ausw\u00e4hlen, \u201eGemeinsam bearbeiten\u2026\u201c "
      + "\u00f6ffnen: unter den Merkmalen stehen alle Verwendungsstellen von Modul 1. \u201ei3-Stein\u201c "
      + "ankreuzen, Produkt w\u00e4hlen, \u00fcbernehmen \u2014 Strg+Z nimmt alles in einem Schritt zur\u00fcck.",
  },
  {
    id: "chg-20260907-19",
    datum: "2026-09-07",
    typ: "feature",
    issue: 110,
    titel: "Spannkomponenten in Wandansicht und Zeichnung als dieselben vereinfachten "
      + "Seitenansicht-Symbole",
    testbitte: "Wand mit Kopplungen und Zwischenspannpunkten in Modul 1 ansehen: kurze "
      + "Mutternzylinder, l\u00e4ngere Kopplungsmuttern, flache Spannplatten, Einlegeblech mit "
      + "Mutter darauf. Modul 7 zeigt dieselben Formen.",
  },
  {
    id: "chg-20260907-18",
    datum: "2026-09-07",
    typ: "feature",
    issue: 111,
    titel: "Mehrere ausgew\u00e4hlte W\u00e4nde gemeinsam bearbeiten \u2014 ein Popup mit neun "
      + "allgemeinen Wandmerkmalen",
    testbitte: "Im Geschosseditor drei W\u00e4nde ausw\u00e4hlen, \u201eGemeinsam bearbeiten\u2026\u201c "
      + "\u00f6ffnen: Ungleiches steht als \u201egemischt\u201c. Nur Brandschutzklasse ankreuzen, F30 "
      + "setzen \u2014 alles andere bleibt. Strg+Z nimmt es in einem Schritt zur\u00fcck.",
  },
  {
    id: "chg-20260907-17",
    datum: "2026-09-07",
    typ: "feature",
    issue: 109,
    titel: "Einlegeblech und Mutter stehen mit ihrer Menge in der St\u00fcckliste \u2014 je "
      + "Zwischenspannpunkt eines von beiden",
    testbitte: "In Modul 1 Zwischenspannpunkte setzen (Blech und Mutter sind vorbelegt), dann "
      + "Modul 4: beide stehen als eigene Zeile mit der Punktzahl und einem Preis. Eine Auswahl "
      + "leeren \u2014 Menge bleibt, Preis entf\u00e4llt mit Grund.",
  },
  {
    id: "chg-20260907-16",
    datum: "2026-09-07",
    typ: "fix",
    issue: 109,
    titel: "Modul 7 zeigt eine in Modul 1 ge\u00e4nderte Wand sofort neu \u2014 ohne Neuladen",
    testbitte: "Modul 7 offen lassen, in Modul 1 die H\u00f6he derselben Wand \u00e4ndern und zu Modul 7 "
      + "zur\u00fcckwechseln: Zeichnung, \u00dcbersicht, Ma\u00dfstab und Tabellen stehen auf dem neuen Stand, "
      + "die gew\u00e4hlten Darstellungsoptionen bleiben erhalten.",
  },
  {
    id: "chg-20260907-15",
    datum: "2026-09-07",
    typ: "feature",
    issue: 96,
    titel: "Ausgleichspunkte lassen sich in Modul 1 setzen, verschieben und l\u00f6schen \u2014 mit Zur\u00fcck zu Auto",
    testbitte: "In Modul 1 „Ausgleichspunkte bearbeiten“ einschalten, einen Punkt setzen, einen "
      + "ziehen, einen l\u00f6schen und die Wand neu laden: genau diese Punkte stehen wieder da. "
      + "„Zur\u00fcck zu Auto“ liefert die gerechnete Verteilung.",
  },
  {
    id: "chg-20260907-14",
    datum: "2026-09-07",
    typ: "feature",
    issue: 96,
    titel: "Die St\u00fcckliste weist Ausgleichsbleche aus: ein Blech je gerechnetem Ausgleichspunkt",
    testbitte: "Eine 3,25 m lange Wand planen und Modul 4 \u00f6ffnen: die Position "
      + "„Ausgleichsblech“ steht mit Menge 10 vor dem Kopfblech und wird aus dem Katalog "
      + "bepreist. Alle \u00fcbrigen Mengen und Preise bleiben unver\u00e4ndert.",
  },
  {
    id: "chg-20260907-13",
    datum: "2026-09-07",
    typ: "fix",
    issue: 96,
    titel: "Das vorl\u00e4ufige Ausgleichsblech tr\u00e4gt die richtige Ma\u00dforientierung: 20 mm in Wandrichtung",
    testbitte: "In Modul 10 das vorl\u00e4ufige Ausgleichsblech \u00f6ffnen: Blechbreite 20 mm, "
      + "Quermaß 100 mm, Dicke 8 mm, und der Hinweis nennt die 20 mm als Maß in Wandrichtung. "
      + "Mengen und Preise in Modul 4 bleiben gleich.",
  },
  {
    id: "chg-20260907-12",
    datum: "2026-09-07",
    typ: "feature",
    issue: 96,
    titel: "Die Ausgleichspunkte unter dem Bodenblech werden deterministisch berechnet — drei je Meter",
    testbitte: "Eine 3,25 m lange Wand rechnen: es entstehen zehn Ausgleichspunkte, die "
      + "beiden Wandenden eingerechnet, und an jeder Bodenblech-Stoßmitte sitzt einer. "
      + "Zweimal rechnen ergibt dieselbe Liste. Menge und Darstellung folgen später.",
  },
  {
    id: "chg-20260907-11",
    datum: "2026-09-07",
    typ: "feature",
    issue: 108,
    titel: "Der Bauteilkatalog ist ein eigenes Modul — dort ist jeder Katalog bearbeitbar, Modul 0 ordnet nur zu",
    testbitte: "Reiter „10 Katalog“ öffnen, oben einen Katalog wählen, der dem aktiven "
      + "Projekt NICHT zugeordnet ist, und ein Produkt bearbeiten: die Zuordnung bleibt "
      + "unverändert und steht sichtbar auf der Seite. Zugeordnet wird weiter in Modul 0.",
  },
  {
    id: "chg-20260907-10",
    datum: "2026-09-07",
    typ: "fix",
    issue: 98,
    titel: "Der Zeichnungs-PDF-Export lädt wieder herunter — und wird im Exportdialog ausgelöst",
    testbitte: "In Modul 0 am Projekt „Exportieren“ drücken, „Zeichnungen als PDF“ ankreuzen "
      + "und herunterladen: es kommt genau ein ZIP mit einer PDF je Geschoss (Lageplan auf "
      + "Seite 1), auch bei Geschossen mit kalibriertem Planhintergrund.",
  },
  {
    id: "chg-20260907-09",
    datum: "2026-09-07",
    typ: "fix",
    issue: 106,
    titel: "Achsen in der Wandansicht treffen dort, wo geklickt wird, und lassen sich verschieben statt verdoppeln",
    testbitte: "In Modul 1 zoomen, den Spannachsen-Editor einschalten und eine Achse ziehen: "
      + "sie wandert mit, ohne zweite. Ein Klick auf einen leeren Rasterpunkt legt sie genau dort "
      + "an — ebenso im Zwischenspannpunkt-Editor.",
  },
  {
    id: "chg-20260907-08",
    datum: "2026-09-07",
    typ: "feature",
    issue: 94,
    titel: "Der Standardkatalog führt die Baugruppe „Wandabschluss“ — die Stückliste zeigt sie als Einzelteile",
    testbitte: "In Modul 0 „Standardkatalog laden“ und den Katalog öffnen: die Baugruppe "
      + "„Wandabschluss“ steht mit Spannplatte, Unterlegscheibe und Spannmutter darin. In Modul 4 "
      + "stehen diese drei Teile mit unverändert denselben Mengen.",
  },
  {
    id: "chg-20260907-07",
    datum: "2026-09-07",
    typ: "doku",
    issue: 92,
    titel: "Das Regelwerk benennt jetzt den Beginn der ersten Gewindestange und den Bezugspunkt des Überstands",
    testbitte: "Im Handbuch stehen in Kapitel 16.3 und 16.7 die neuen Regeln [A-19] und [Z-8]: "
      + "Bauteilfolge am Wandfuß, Überstand ab Oberkante Spannplatte, Katalog als einzige Maßquelle. "
      + "In der App ändert sich nichts.",
  },
  {
    id: "chg-20260907-06",
    datum: "2026-09-07",
    typ: "feature",
    issue: 96,
    titel: "Das Ausgleichsblech unter dem Bodenblech ist jetzt ein eigenes Bauteil im Katalog",
    testbitte: "In Modul 1 unter \u201eProdukte\u201c steht in der Gruppe Anschluss die Zeile "
      + "\u201eAusgleichsblech\u201c, mit dem Standardkatalog schon auf das vorl\u00e4ufige Blech "
      + "100 \u00d7 20 \u00d7 8 mm gesetzt und umw\u00e4hlbar. Mengen und Preise in Modul 4 bleiben gleich.",
  },
  {
    id: "chg-20260907-05",
    datum: "2026-09-07",
    typ: "feature",
    issue: 92,
    titel: "Die Unterlegscheibe des Wandabschlusses ist jetzt ein eigenes Bauteil mit eigener Stücklistenzeile",
    testbitte: "In Modul 1 unter „Produkte“ steht in der Gruppe Anschluss die Zeile "
      + "„Unterlegscheibe Wandabschluss“. In Modul 4 derselben Wand trägt die Position dieselbe "
      + "Stückzahl wie die Spannplatte; ohne Auswahl bleibt der Preis offen.",
  },
  {
    id: "chg-20260907-04",
    datum: "2026-09-07",
    typ: "fix",
    issue: 104,
    titel: "Das Auswahlfeld für die erste Vorspannachse ist aus Modul 1 und dem Zeichnungsblatt entfernt",
    testbitte: "Modul 1 öffnen: unter „Auslegung“ gibt es kein Feld für die erste Vorspannachse "
      + "mehr, und die Zeichnung derselben Wand nennt keine Startachse. Achsen und Mengen bleiben "
      + "unverändert; gespeicherte Projekte bleiben lesbar.",
  },
  {
    id: "chg-20260907-03",
    datum: "2026-09-07",
    typ: "fix",
    issue: 104,
    titel: "Spannachsen liegen jetzt mittig im i3 und an einem i2-Wandrand auf der zweiten Achse",
    testbitte: "Wand planen und die Vorspannung ansehen: an jedem i3 der untersten Reihe liegt eine Achse mittig, und an einem i2 am Wandanfang oder Wandende liegt sie auf der zweiten Achse statt im Randfeld.",
  },
  {
    id: "chg-20260907-02",
    datum: "2026-09-07",
    typ: "fix",
    issue: 92,
    titel: "Die Schraube am Wandfuß heißt jetzt überall Sechskantschraube statt Senkkopfschraube",
    testbitte: "Stückliste (Modul 4) und Montageanleitung (Modul 5) öffnen: am Wandfuß "
      + "steht jetzt die Sechskantschraube, ebenso in der Produktauswahl von Modul 1. Mengen und "
      + "Preise bleiben gleich, bestehende Kataloge und Projekte bleiben gültig.",
  },
  {
    id: "chg-20260907-01",
    datum: "2026-09-07",
    typ: "fix",
    issue: 92,
    titel: "Einbauhöhe eines Kleinteils ist im Bauteilkatalog pflegbar — Modul 1 meldet die fehlende Höhe nicht mehr",
    testbitte: "In Modul 0 den Bauteilkatalog öffnen, bei der Kopplungsmutter die Einbauhöhe in mm "
      + "eintragen und speichern: der Wert bleibt jetzt erhalten statt als fachfremd entfernt zu "
      + "werden. Modul 1 meldet die fehlende Höhe danach nicht mehr.",
  },
  {
    id: "chg-20260906-02",
    datum: "2026-09-06",
    typ: "feature",
    issue: 94,
    titel: "Baugruppen im Bauteilkatalog: benannte Bauteilgruppen anlegen, pflegen und mitnehmen",
    testbitte: "In Modul 0 den Bauteilkatalog öffnen und unter „Baugruppen“ ein Set anlegen, "
      + "je eine Produkt- und eine Rollenposition mit Menge ergänzen, umbenennen und den Katalog "
      + "exportieren und wieder importieren: die Baugruppe kommt unverändert zurück.",
  },
  {
    id: "chg-20260906-01",
    datum: "2026-09-06",
    typ: "feature",
    issue: 92,
    titel: "Stangenbedarf aus den realen Einbaulagen: halbe Kopplungsmutter unten, Spannplatte oben",
    testbitte: "In Modul 1 Kopplungsmutter (mit Einbauhöhe) und Spannplatte wählen: der "
      + "Stangenbedarf beginnt eine halbe Mutterhöhe höher und deckt oben Plattendicke plus "
      + "Überstand ab. Fehlt ein Maß, steht es benannt im Formular und nichts ändert sich.",
  },
  {
    id: "chg-20260905-01",
    datum: "2026-09-05",
    typ: "feature",
    issue: 98,
    titel: "Alle Zeichnungen eines Projekts geschossweise als PDF — ein Klick, ein ZIP",
    testbitte: "In Modul 0 am Projekt „Zeichnungen als PDF“ drücken: es kommt genau ein ZIP "
      + "mit einer PDF je Geschoss; darin steht der Lageplan auf Seite 1 und danach je Wand "
      + "ein Blatt. Fehlt ein Wandelement, wird es vor dem Download benannt.",
  },
  {
    id: "chg-20260904-12",
    datum: "2026-09-04",
    typ: "fix",
    issue: 99,
    titel: "Blattvorschau der technischen Zeichnung nimmt jetzt mindestens die volle Höhe des Browserfensters ein",
    testbitte: "Modul 7 öffnen: der Bereich „Blattvorschau“ reicht bis zum unteren Fensterrand — "
      + "auch bei A4 quer und ohne aktives Wandelement; das gedruckte Blatt bleibt einseitig.",
  },
  {
    id: "chg-20260904-11",
    datum: "2026-09-04",
    typ: "fix",
    issue: 103,
    titel: "Standardkatalog: die zweite Gewindestange ist jetzt 920 mm lang und heißt auch so",
    testbitte: "In Modul 0 „Standardkatalog laden“ und den Katalog öffnen: die zweite "
      + "M10-Gewindestange nennt 920 mm als Länge und in der Bezeichnung; eigene Kataloge "
      + "bleiben unverändert.",
  },
  {
    id: "chg-20260904-10",
    datum: "2026-09-04",
    typ: "fix",
    issue: 102,
    titel: "Standardkatalog bleibt unveränderliche Vorlage — die erste Bearbeitung legt automatisch eine Projektkopie an",
    testbitte: "In Modul 0 „Standardkatalog laden“, dann Katalognamen oder ein Produkt ändern: "
      + "die Meldung nennt die automatisch angelegte Projektkopie; erneutes Laden zeigt wieder "
      + "den unveränderten Repo-Inhalt, eigene Kataloge bleiben erhalten.",
  },
  {
    id: "chg-20260904-09",
    datum: "2026-09-04",
    typ: "feature",
    issue: 93,
    titel: "Zwischenspannpunkte fürs Einlegeblech: automatisch nahe halber Höhe, lagengenau bearbeitbar",
    testbitte: "Wand in Modul 1 öffnen: das Einlegeblech-Symbol steht je Strang nahe halber "
      + "Höhe auf einer Lagen-Oberkante. „Zwischenspannpunkte bearbeiten“, dann Punkt setzen, "
      + "ziehen, löschen — „Zurück zu Auto“ stellt die Vorgabe her.",
  },
  {
    id: "chg-20260904-08",
    datum: "2026-09-04",
    typ: "feature",
    issue: 92,
    titel: "Neue Wände schließen oben standardmäßig mit der Spannplatte ab; Kopfblech bleibt wählbar",
    testbitte: "Im Geschosseditor eine neue Wand zeichnen und in Modul 1 öffnen: „Oberer "
      + "Anschluss“ steht auf „Spannplatte (Standard)“. Eine bestehende Wand mit Kopfblech "
      + "öffnen: sie behält das Kopfblech auch nach dem Neuberechnen.",
  },
  {
    id: "chg-20260904-07",
    datum: "2026-09-04",
    typ: "fix",
    issue: 101,
    titel: "Die Wandauswahl in der Kopfleiste steht fest: Wand 1, Wand 2, Wand 10 statt zuletzt bearbeitet",
    testbitte: "Mehrere nummerierte Wände eines Geschosses anlegen, im Kopfleisten-Dropdown "
      + "wechseln und eine davon in Modul 1 bearbeiten: die Reihenfolge bleibt danach "
      + "dieselbe, und „Wand 2“ steht weiter vor „Wand 10“.",
  },
  {
    id: "chg-20260904-06",
    datum: "2026-09-04",
    typ: "intern",
    issue: 92,
    titel: "Vorarbeit Spannplatte: die Kopfblech-Fälle der Tests sind ausdrücklich festgeschrieben",
  },
  {
    id: "chg-20260904-05",
    datum: "2026-09-04",
    typ: "feature",
    issue: 91,
    titel: "Montageanleitung und Wandzeichnung zeigen die realen Bodenblechteile mit ihren Stößen",
    testbitte: "Eine Wand mit mehreren Bodenblechteilen in Modul 5 und Modul 7 öffnen: "
      + "beide zeigen dieselben Teile und Stoßlinien wie die Stückliste in Modul 4. Ein "
      + "Sonderzuschnitt ist zusätzlich schraffiert und bleibt schwarz-weiß erkennbar.",
  },
  {
    id: "chg-20260904-04",
    datum: "2026-09-04",
    typ: "feature",
    issue: 100,
    titel: "Modul 1: die Wandansicht passt jetzt ins Fenster und lässt sich stufenweise zoomen",
    testbitte: "Modul 1 mit einer 2,60 m hohen Wand öffnen: die Ansicht ist ohne Scrollen "
      + "vollständig zu sehen. Mit „Größer“ und „Kleiner“ die Darstellung ändern — der "
      + "Prozentwert steht daneben, „Einpassen“ stellt die Startgröße wieder her.",
  },
  {
    id: "chg-20260904-03",
    datum: "2026-09-04",
    typ: "feature",
    issue: 91,
    titel: "Modul 1: die gewählten Bodenblech-Standardlängen bestimmen jetzt die Aufteilung in der Stückliste",
    testbitte: "In Modul 1 unter „Bodenblech“ nur 1250 und 1000 mm anhaken, dann Modul 4 "
      + "öffnen: die Blechzeilen tragen ausschließlich diese beiden Rastermaße. Ohne "
      + "Auswahl bleibt die bisherige Aufteilung, und die Rolle meldet das.",
  },
  {
    id: "chg-20260904-02",
    datum: "2026-09-04",
    typ: "feature",
    issue: 91,
    titel: "Stückliste: das Bodenblech steht jetzt als reale Blechteile je Standardlänge statt als Modulzahl",
    testbitte: "In Modul 1 eine 5 m lange Wand planen, dann Modul 4 öffnen: das Bodenblech "
      + "steht je Standardlänge als eigene Zeile mit Rastermaß und Bauteilmaß, keine "
      + "Blechfuge auf einer Steinfuge der untersten Reihe.",
  },
  {
    id: "chg-20260904-01",
    datum: "2026-09-04",
    typ: "feature",
    issue: 81,
    titel: "Stückliste: die Menge einer Position lässt sich jetzt auch für ein ganzes Geschoss manuell setzen",
    testbitte: "In Modul 4 die Ebene „Geschoss“ wählen und bei einer Position eine Menge "
      + "eintragen: wirksame und berechnete Menge stehen nebeneinander. In Modul 0 dasselbe "
      + "Geschoss als „angepasst“ exportieren — die Datei trägt genau diese Menge.",
  },
  {
    id: "chg-20260902-01",
    datum: "2026-09-02",
    typ: "feature",
    issue: 86,
    titel: "Projektimport: aus einer Projektdatei lässt sich auch nur ein Geschoss oder eine einzelne Wand übernehmen",
    testbitte: "In Modul 0 über „Projekt importieren…“ eine ZIP mit zwei Geschossen laden, unter "
      + "„Was übernehmen?“ ein Geschoss wählen, ein Zielprojekt wählen oder neu anlegen "
      + "lassen und bestätigen: Nur dieses Geschoss kommt an, mit Wänden und Maßen.",
  },
  {
    id: "chg-20260818-04",
    datum: "2026-08-18",
    typ: "feature",
    issue: 86,
    titel: "Projektimport: ein Dialog liest jetzt auch die exportierte Projekt-ZIP und übernimmt das ganze Projekt",
    testbitte: "In Modul 0 ein Projekt exportieren (Mappe, Geschosse, Wände), dann über "
      + "„Projekt importieren…“ dieselbe ZIP laden: Der Bericht nennt Projekt, Geschosse, "
      + "Wandnamen und Katalogkennung — erst „Importieren“ schreibt.",
  },
  {
    id: "chg-20260818-03",
    datum: "2026-08-18",
    typ: "feature",
    issue: 81,
    titel: "Stückliste: der Kommentar einer Position steht jetzt in der exportierten Wandstückliste",
    testbitte: "In Modul 4 auf der Wandebene eine Position kommentieren, dann in Modul 0 die "
      + "Wand mit Baustellenstückliste exportieren: Die letzte Spalte „Kommentar“ trägt den "
      + "Text an dieser Position, in beiden Mengenfassungen; Mengen und Preise bleiben.",
  },
  {
    id: "chg-20260818-02",
    datum: "2026-08-18",
    typ: "feature",
    issue: 81,
    titel: "Stückliste: die Spalte mit den Herkunftswänden entfällt in Anzeige und Gesamtstückliste-Export",
    testbitte: "Modul 4 auf Geschoss-, Gebäude- und Projektebene: „Wände (Herkunft)“ ist "
      + "weg, Mengen, Einbauteil-IDs und Preise bleiben. In Modul 0 exportieren — ohne "
      + "Herkunft in beiden Mengenfassungen; die Baustellenstückliste der Wand bleibt gleich.",
  },
  {
    id: "chg-20260818-01",
    datum: "2026-08-18",
    typ: "fix",
    issue: 89,
    titel: "Lageplan: die Blattvorschau steht jetzt im echten Papierverhältnis des gewählten Formats",
    testbitte: "Modul 9 öffnen, zwischen A3 quer und A4 quer wechseln und das Fenster "
      + "schmaler ziehen: Die Vorschau behält die Proportionen und die Aufteilung des "
      + "späteren Ausdrucks und wird nur als Ganzes kleiner.",
  },
  {
    id: "chg-20260817-08",
    datum: "2026-08-17",
    typ: "fix",
    issue: 89,
    titel: "Lageplan: Vorder- und Rückseite ohne Kennbuchstaben — nachgeschlagen wird in der Legende",
    testbitte: "Modul 9 für ein Geschoss mit verorteten Wänden öffnen: An den Wänden stehen "
      + "keine V/R-Buchstaben mehr, die farbigen Vorder- und Rückkanten bleiben, und die "
      + "Legende benennt beide Seiten in Worten — in Vorschau, Druck und Export gleich.",
  },
  {
    id: "chg-20260817-07",
    datum: "2026-08-17",
    typ: "fix",
    issue: 89,
    titel: "Lageplan: die Nummernblasen weichen jetzt auch den Wandflächen aus",
    testbitte: "Modul 9 für ein dicht bebautes Geschoss öffnen: Keine Nummernblase liegt "
      + "mehr auf einer Wand; die Führungslinie zeigt weiter auf dieselbe Wandkante.",
  },
  {
    id: "chg-20260817-06",
    datum: "2026-08-17",
    typ: "feature",
    issue: 68,
    titel: "Plankopf wieder pflegbar: Planverfasser, Phase, Plan-Nr., Index und Gez. stehen in der Zeichnung",
    testbitte: "In Modul 7 für eine Wand eines Projekts eine Plan-Nr. eintragen: Sie steht "
      + "sofort im Schriftfeld, Index und Gez. ebenso; Planverfasser und Phase werden nur "
      + "gespeichert und stehen auf keinem Blatt. Nach dem Neuladen sind alle fünf da.",
  },
  {
    id: "chg-20260817-05",
    datum: "2026-08-17",
    typ: "feature",
    issue: 89,
    titel: "Lageplan aufgeräumt: Brandschutz nur noch über Legende, Wandliste auf Nummer, Bezeichnung und Höhe",
    testbitte: "Modul 9 für ein Geschoss mit F0- und F30-Wänden öffnen: An den Wänden steht "
      + "kein F0/F30 mehr, F30 bleibt schraffiert, und die Bedeutung steht in der Legende; "
      + "die Liste „Wände im Geschoss“ zeigt genau Nr., Wand und Höhe.",
  },
  {
    id: "chg-20260817-04",
    datum: "2026-08-17",
    typ: "fix",
    issue: 88,
    titel: "Bei übereinanderliegenden Wänden im Geschossplan ist durch erneutes Klicken wählbar, welche gemeint ist",
    testbitte: "Im Geschosseditor zwei Wände übereinanderlegen und die Stelle mehrfach "
      + "anklicken: Jeder Klick macht die nächste der dort liegenden Wände aktiv und benennt sie "
      + "in der Meldezeile; ein Zug verschiebt genau diese, die andere bleibt liegen.",
  },
  {
    id: "chg-20260817-03",
    datum: "2026-08-17",
    typ: "feature",
    issue: 90,
    titel: "Verzahnungsbereiche einer Wand sind im Geschossplan als Fläche an ihrer Rasterstelle sichtbar",
    testbitte: "In Modul 1 an einer Wand einen Verzahnungsbereich festlegen und das Geschoss "
      + "öffnen: Die Stelle ist als gitterschraffierte Fläche mit gestrichelter Umrandung markiert "
      + "und in der Legende benannt; Wände ohne Bereich sehen unverändert aus.",
  },
  {
    id: "chg-20260817-02",
    datum: "2026-08-17",
    typ: "fix",
    issue: 88,
    titel: "Duplizierte und zugeordnete Wände liegen sofort sichtbar im Geschossplan statt unverortet in der Liste",
    testbitte: "Im Geschosseditor eine verortete Wand duplizieren: Die Kopie liegt 250 mm neben dem "
      + "Original, unbemaßt und frei verschiebbar; Strg+Z nimmt sie in einem Schritt zurück. Eine in "
      + "Modul 0 zugeordnete Wand liegt am Geschossursprung.",
  },
  {
    id: "chg-20260817-01",
    datum: "2026-08-17",
    typ: "feature",
    issue: 85,
    titel: "Beim Löschen von Geschoss oder Projekt lassen sich die zugeordneten Wandelemente auf Nachfrage mitlöschen",
    testbitte: "In Modul 0 ein Geschoss mit zwei Wänden löschen: Nach der Sicherheitsabfrage kommt "
      + "die Frage nach den Wandelementen samt Anzahl. Abbrechen lässt sie erhalten, OK entfernt sie, "
      + "und die Meldung nennt beide Zahlen.",
  },
  {
    id: "chg-20260816-12",
    datum: "2026-08-16",
    typ: "intern",
    issue: 83,
    titel: "Nachgewiesen: Die Verzahnungsbewertung übersteht Projektarchiv und Duplizieren unverändert",
    testbitte: "Ein Projekt mit zwei passend verzahnten Wänden exportieren, in einem leeren Browser "
      + "importieren und Modul 9 öffnen: weiterhin die benannte Verbindung statt einer Kollision. "
      + "An der Bewertung selbst wurde nichts geändert.",
  },
  {
    id: "chg-20260816-11",
    datum: "2026-08-16",
    typ: "feature",
    issue: 81,
    titel: "Kommentar je Stücklistenposition in Modul 4 — neben Menge und Preis, ohne die Rechnung zu ändern",
    testbitte: "In Modul 4 zu einer Position einen Kommentar eintragen: Er steht danach an genau dieser "
      + "Zeile, überlebt das Neuladen und lässt sich einzeln wieder entfernen; Mengen, Preise und Summe "
      + "bleiben unverändert.",
  },
  {
    id: "chg-20260816-10",
    datum: "2026-08-16",
    typ: "feature",
    issue: 82,
    titel: "Verzahnungsbereiche bleiben beim Export, Import und Duplizieren mit Grenzen und Startparität erhalten",
    testbitte: "In Modul 1 einen Verzahnungsbereich anlegen, die Wand exportieren und reimportieren: "
      + "Der Bereich steht unverändert an derselben Stelle mit derselben Startparität — ebenso beim "
      + "Duplizieren und im Projektarchiv.",
  },
  {
    id: "chg-20260816-09",
    datum: "2026-08-16",
    typ: "fix",
    issue: 83,
    titel: "Im Lageplan gilt eine passende Wandverzahnung als benannte Verbindung statt als Kollision",
    testbitte: "In Modul 9 ein Geschoss mit zwei passend verzahnten Wänden öffnen: keine "
      + "Kollisionsmeldung mehr, die Verbindung steht mit beiden Wandnamen im Blatt, das Geschoss "
      + "gilt als vollständig — jede andere Überlagerung bleibt Kollision.",
  },
  {
    id: "chg-20260816-08",
    datum: "2026-08-16",
    typ: "fix",
    issue: 59,
    titel: "Im Lageplan bleiben ausgewichene Wandnummern vollständig sichtbar, statt am Blattrand abgeschnitten zu werden",
    testbitte: "In Modul 9 ein Geschoss mit dicht beieinander liegenden, bemaßten Wänden öffnen: "
      + "Jede Nummernblase steht samt Zahl vollständig im Blatt — in der Vorschau, im Druck und in "
      + "der exportierten SVG-Datei; der Maßstab bleibt derselbe.",
  },
  {
    id: "chg-20260816-07",
    datum: "2026-08-16",
    typ: "feature",
    issue: 82,
    titel: "Verzahnungsbereiche stehen jetzt auch auf der technischen Wandzeichnung — gekennzeichnet und erklärt",
    testbitte: "In Modul 1 einen Verzahnungsbereich anlegen und Modul 7 öffnen: Der Bereich ist an "
      + "seiner Rasterlage gekennzeichnet, die Legende erklärt ihn, ein regelwidriger Bereich steht "
      + "benannt daneben — auch schwarz-weiß und in der SVG-Datei.",
  },
  {
    id: "chg-20260816-06",
    datum: "2026-08-16",
    typ: "fix",
    issue: 83,
    titel: "Passende Verzahnungen im Geschosseditor gelten nicht mehr als Kollision — jede andere Überlagerung schon",
    testbitte: "Zwei rechtwinklige Wände mit passenden Verzahnungsbereichen im Geschosseditor "
      + "ineinanderzeichnen: keine Kollisionsmeldung, keine rote Wand, die Verzahnung wird benannt. "
      + "Bei gleicher Startlage bleibt es eine Kollision.",
  },
  {
    id: "chg-20260816-05",
    datum: "2026-08-16",
    typ: "feature",
    issue: 81,
    titel: "Beim Export gilt die Mengenfassung jetzt auch für die Gesamtstückliste von Geschoss, Gebäude und Projekt",
    testbitte: "In Modul 4 eine Menge übersteuern, in Modul 0 das Geschoss exportieren und "
      + "„angepasst“ wählen: Die Gesamtstückliste trägt die wirksamen Mengen, führt die berechneten "
      + "daneben und nennt die Fassung im Dateikopf.",
  },
  {
    id: "chg-20260816-04",
    datum: "2026-08-16",
    typ: "feature",
    issue: 82,
    titel: "Verzahnungsbereiche in Modul 1 festlegen — Steine alternierend ausgelassen, Mengen folgen dem Verband",
    testbitte: "In Modul 1 einen Verzahnungsbereich zeichnen: In jeder zweiten Lage fehlen dort die "
      + "Steine, die Steinmengen spiegeln das, und Vorspannung sowie Gewindestangen bleiben unverändert.",
  },
  {
    id: "chg-20260816-03",
    datum: "2026-08-16",
    typ: "fix",
    issue: 59,
    titel: "Im Lageplan weichen die Wandnummern aus, statt einander oder eine Bemaßung zu überdecken",
    testbitte: "In Modul 9 ein Geschoss mit dicht beieinander liegenden, bemaßten Wänden öffnen: "
      + "Jede Nummer steht frei lesbar neben ihrer Wand, die Führungslinie endet weiter an derselben "
      + "Wandkante, und Druck wie SVG-Datei zeigen dieselbe Anordnung.",
  },
  {
    id: "chg-20260816-02",
    datum: "2026-08-16",
    typ: "feature",
    issue: 81,
    titel: "Beim Export ist wählbar, ob die Stückliste die berechneten oder die angepassten Mengen enthält",
    testbitte: "In Modul 4 eine Menge übersteuern, in Modul 0 an der Wand exportieren und "
      + "„angepasst“ wählen: Die Stückliste trägt die manuelle Menge, nennt die Fassung im "
      + "Dateikopf und führt die berechnete Menge daneben.",
  },
  {
    id: "chg-20260816-01",
    datum: "2026-08-16",
    typ: "feature",
    issue: 79,
    titel: "Brandschutz F0/F30 steht jetzt auch auf der technischen Wandzeichnung — als Kurztext und in der Legende",
    testbitte: "In Modul 1 eine Wand auf F30 stellen und Modul 7 öffnen: Der Kurztext steht am oberen "
      + "Blattrand, die Legende erklärt F0 und F30 in Worten; Druckansicht und die exportierte "
      + "SVG-Datei zeigen dieselbe Angabe — auch schwarz-weiß lesbar.",
  },
  {
    id: "chg-20260815-03",
    datum: "2026-08-15",
    typ: "feature",
    issue: 79,
    titel: "Brandschutz F0/F30 im Geschosseditor erkennbar — schraffiert, beschriftet, in Legende und Wandliste",
    testbitte: "In Modul 1 eine Wand auf F30 stellen und das Geschoss öffnen: Die F30-Wand ist "
      + "schraffiert und beschriftet, F0-Wände tragen nur den Kurztext, Legende und Wandliste nennen "
      + "beide Klassen — auch schwarz-weiß unterscheidbar.",
  },
  {
    id: "chg-20260815-02",
    datum: "2026-08-15",
    typ: "feature",
    issue: 79,
    titel: "Brandschutzklassifikation F0/F30 im Lageplan sichtbar — schraffiert, beschriftet, in der Legende",
    testbitte: "In Modul 1 eine Wand auf F30 stellen, Modul 9 öffnen und exportieren: Die F30-Wand ist "
      + "schraffiert und beschriftet, die Legende erklärt beide Klassen, die Wandliste zeigt die Spalte "
      + "Brandschutz — auch schwarz-weiß unterscheidbar.",
  },
  {
    id: "chg-20260815-01",
    datum: "2026-08-15",
    typ: "feature",
    issue: 81,
    titel: "Menge je Stücklistenposition manuell übersteuerbar — die berechnete Menge bleibt daneben sichtbar",
    testbitte: "In Modul 4 eine Menge eintragen: Wirksame und berechnete Menge stehen nebeneinander, "
      + "der Preis folgt der wirksamen. Nach dem Neuladen ist sie noch da, „zurücksetzen“ stellt die "
      + "Rechnung her; krumme und negative Werte werden abgewiesen.",
  },
  {
    id: "chg-20260814-04",
    datum: "2026-08-14",
    typ: "feature",
    issue: 79,
    titel: "Brandschutzklassifikation F0 oder F30 je Wand in Modul 1 wählbar — Standard F0, kein Nachweis daraus",
    testbitte: "In Modul 1 bei einer Wand F30 wählen, die Seite neu laden und die Wand exportieren: Die Angabe bleibt erhalten; im Geschosseditor die Länge ändern — F30 bleibt stehen, und Stückliste sowie Nachweis ändern sich nicht.",
  },
  {
    id: "chg-20260814-03",
    datum: "2026-08-14",
    typ: "feature",
    issue: 80,
    titel: "Kalibrierter Geschossplan liegt im Lageplan als Hintergrund — Transparenz frei einstellbar",
    testbitte: "In Modul 9 ein Geschoss mit kalibriertem Plan wählen: Der Grundriss liegt unter den Wänden; den Transparenzschieber ziehen und exportieren — HTML und SVG zeigen dasselbe Bild, bei 100 % keines.",
  },
  {
    id: "chg-20260814-02",
    datum: "2026-08-14",
    typ: "feature",
    issue: 76,
    titel: "Geschossursprung frei im Plan verschiebbar — Ursprungsmaße werden mitgeführt, Wände bleiben stehen",
    testbitte: "Eine Wand gegen den Ursprung bemaßen, dann Werkzeug „Ursprung“ wählen und einen Punkt anklicken: Die Vorschau zeigt alten und neuen Punkt samt geändertem Maß; nach dem Übernehmen steht die Wand unverändert, Strg+Z nimmt beides zurück.",
  },
  {
    id: "chg-20260814-01",
    datum: "2026-08-14",
    typ: "feature",
    issue: 71,
    titel: "Abdichtung je Wand wählbar — Dichtstreifen stehen nur noch in der Stückliste abgedichteter Wände",
    testbitte: "In Modul 1 bei einer Wand „abgedichtet“ wählen und in Modul 4 die beiden Dichtstreifenzeilen prüfen; danach auf „nicht abgedichtet“ stellen — beide Zeilen verschwinden, alle übrigen Mengen und Preise bleiben gleich.",
  },
  {
    id: "chg-20260813-10",
    datum: "2026-08-13",
    typ: "feature",
    issue: 78,
    titel: "Modul 1 zeigt keinen statischen Einzelnachweis mehr — der Nachweis bleibt allein in Modul 3",
    testbitte: "In Modul 1 eine Wand automatisch und mit fester Auslegung auslegen: Wandansicht, Spannachsen, Stangenstücke und Iterationsprotokoll bleiben, Nachweistabelle und Prüfaussage im Status sind entfallen.",
  },
  {
    id: "chg-20260813-09",
    datum: "2026-08-13",
    typ: "feature",
    issue: 84,
    titel: "Geschosseditor und Lageplan kennzeichnen Vorder- und Rückseite jeder Wand an ihren Außenkanten",
    testbitte: "Im Geschosseditor eine Wand in beliebiger Richtung zeichnen: die Längskanten tragen V und R; R dreht die Wand samt Vorderseite um 90°, „⇆ 180°“ (Umschalt+R) tauscht nur die Seiten, der Lageplan zeigt dieselben Kanten samt Legende.",
  },
  {
    id: "chg-20260813-08",
    datum: "2026-08-13",
    typ: "feature",
    issue: 75,
    titel: "Im Geschosseditor lassen sich mehrere ausgewählte Wände gemeinsam auf eine Wandhöhe und Windsituation setzen",
    testbitte: "Im Geschosseditor mehrere Wände mit Umschalt oder Strg auswählen: der Sammel-Editor zeigt Anzahl und gemischte Ausgangswerte, „Übernehmen…“ fragt nach und ändert alle ausgewählten Wände; ein Strg+Z nimmt alles gemeinsam zurück.",
  },
  {
    id: "chg-20260813-07",
    datum: "2026-08-13",
    typ: "feature",
    issue: 74,
    titel: "Im Geschosseditor lassen sich Wände als unabhängige Kopie duplizieren und nach Bestätigung vollständig löschen",
    testbitte: "Im Geschosseditor eine Wand auswählen: „Duplizieren“ legt eine unverortete Kopie mit neuem Namen an, „Wand löschen“ fragt nach und entfernt die Wand samt anhängender Maße; beides lässt sich mit Strg+Z rückgängig machen.",
  },
  {
    id: "chg-20260813-06",
    datum: "2026-08-13",
    typ: "feature",
    issue: 72,
    titel: "Die Module 8 und 9 starten ohne einleitenden Beschreibungstext direkt mit ihren Bedien- und Ergebnisbereichen",
    testbitte: "Die Module 8 und 9 nacheinander öffnen: Unter der Kopfleiste beginnt jede Seite unmittelbar mit ihren Bedienelementen, alle Funktionen, Hinweise und Druckausgaben im Seiteninhalt bleiben unverändert.",
  },
  {
    id: "chg-20260813-05",
    datum: "2026-08-13",
    typ: "feature",
    issue: 72,
    titel: "Die Module 5 bis 7 starten ohne einleitenden Beschreibungstext direkt mit ihren Bedien- und Ergebnisbereichen",
    testbitte: "Die Module 5 bis 7 nacheinander öffnen: Unter der Kopfleiste beginnt jede Seite unmittelbar mit ihren Bedienelementen, alle Funktionen, Hinweise und Druckausgaben im Seiteninhalt bleiben unverändert.",
  },
  {
    id: "chg-20260813-04",
    datum: "2026-08-13",
    typ: "feature",
    issue: 72,
    titel: "Die Module 1 bis 4 starten ohne einleitenden Beschreibungstext direkt mit ihren Bedien- und Ergebnisbereichen",
    testbitte: "Die Module 1 bis 4 nacheinander öffnen: Unter der Kopfleiste beginnt jede Seite unmittelbar mit ihren Bedienelementen, alle Funktionen, Hinweise und Druckausgaben im Seiteninhalt bleiben unverändert.",
  },
  {
    id: "chg-20260813-03",
    datum: "2026-08-13",
    typ: "feature",
    issue: 43,
    titel: "Die Kopfleiste führt mit dem neuen Reiter 0,5 direkt in den Geschossplaner des aktiven Geschosses",
    testbitte: "In einem beliebigen Modul den Reiter 0,5 anklicken: Der Geschossplaner zeigt das aktive Geschoss, die aktive Auswahl von Projekt, Geschoss und Wand bleibt unverändert; ohne aktives Geschoss erscheint der bekannte Hinweis.",
  },
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
