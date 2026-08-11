// @ts-check
/**
 * SEMBLA Umsetzungsplan — das Planartefakt (Modul 8, Issue #55).
 *
 * ERZEUGT — NICHT VON HAND BEARBEITEN. Geschrieben wird ausschliesslich ueber
 * `umsetzungsplan-schreiben.mjs` (npm run plan:schreiben). Reine Daten, keine Logik;
 * die Auswertung liegt in `sembla-umsetzungsplan.js`.
 *
 * `signatur` ist ein Hash ueber den semantischen Kern (alles ausser `stand` und
 * `signatur` selbst). Der Schreibschritt vergleicht sie und schreibt NUR bei
 * inhaltlicher Aenderung — reine Zeitstempel-Commits sind damit ausgeschlossen, und
 * `pruefePlan()` rechnet beides nach.
 *
 * ACHTUNG — dieses Repo ist oeffentlich: keine E-Mail-Adressen, keine Tokens, keine
 * absoluten lokalen Pfade, keine kopierten Issue-Bodies, keine personenbezogenen Daten.
 * `tests/module/test-umsetzungsplan.mjs` prueft das maschinell.
 */

/** Formatname des Austauschformats (eigene Achse, getrennt von BLOG_/PROJEKT_/SCHEMA_). */
export const PLAN_FORMAT = "SEMBLA-Umsetzungsplan";

/** Formatversion des Umsetzungsplans. */
export const PLAN_VERSION = 1;

/** @type {any} */
export const PLAN = {
  "stand": "2026-08-11",
  "signatur": "1e4b37fe",
  "entscheidungen": [
    {
      "issue": 41,
      "titel": "Fachreview: SEMBLA-Regelwerk korrigieren und offene Regeln bestätigen",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Vom SEMBLA-Team kamen fünf Spannachsenregeln. Regel 1 und 2 stehen als [V-2] und [V-3] im Kern, Regel 3 und 4 sind ungeprüfte Planungshinweise, Regel 5 ist neu. Welche werden jetzt verbindlich?",
      "optionen": [
        {
          "text": "Alle drei offenen Regeln jetzt verbindlich in Kern und Orakel.",
          "wirkung": "Zwei Achsen je Öffnungsseite über 750 mm, mindestens zwei Achsen je Blech und die neue Kammerregel der obersten Lage ändern die Achsverteilung vieler Wände. Beide Cores, Fixtures und Statikabstimmung müssen mit."
        },
        {
          "text": "Zuerst nur Regel 3 und 4 umsetzen, Regel 5 nach Rückfrage beim Team.",
          "wirkung": "Die zwei lange bekannten Zielregeln werden geprüft und verlassen die Planungshinweise. Regel 5 braucht vorher eine eindeutige Definition der Kammerzählung 1 bis 3 am i3-Stein."
        }
      ],
      "empfehlung": "Option 2. Regel 3 und 4 sind fachlich unstrittig und nur noch nicht umgesetzt. Regel 5 ist neu und ohne festgelegte Kammerzählung nicht deterministisch umsetzbar; eine geratene Zählweise wäre ein stiller Regelkonflikt."
    },
    {
      "issue": 43,
      "titel": "Eigenes Modul: Projekt- und Wandkonfiguration",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Rückfrage aus dem Issue: die Wandkonfiguration hat mit Modul 1 bereits ein eigenes Modul. Wird #43 als überflüssig geschlossen oder auf reine Projekt- und Geschossdefaults verengt?",
      "optionen": [
        {
          "text": "#43 schließen; Ownership bleibt bei Modul 1 und Modul 0.",
          "wirkung": "Kein neues Modul und keine Migration von Formularfeldern. Offene Punkte wie konkurrierende Schattenfelder werden weiter als atomare Issues am jeweiligen Fachmodul geführt."
        },
        {
          "text": "#43 auf projektweite Defaults verengen, ohne Wandkonfiguration.",
          "wirkung": "Ein kleines Modul für Werte mit Projekt- oder Geschossgeltung, etwa Überstand und Standardwandhöhe. Modul 1 behält die Wandeingaben; vorher muss festgelegt werden, welche Werte das genau sind."
        }
      ],
      "empfehlung": "Option 1: schließen. Modul 1 besitzt die Wandeingaben, Modul 0 die Projekt- und Geschossdaten. Ein drittes Konfigurationsmodul wäre eine zweite Quelle für dieselben Werte und widerspricht der Einbahnstraße des Datenflusses."
    },
    {
      "issue": 19,
      "titel": "Zuschnitt- und Layoutplanung für Platten, Latten und Gewindestangen",
      "prio": "medium",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false,
      "frage": "Gefragt wurde, ob hier noch etwas zu tun ist. Der Gewindestangenteil ist über [Z-1], [Z-2] und [Z-6] umgesetzt, Platten und Latten sind in diesem Zyklus außer Scope. Schließen?",
      "optionen": [
        {
          "text": "#19 schließen; Platten- und Lattenzuschnitt später als eigenes Issue.",
          "wirkung": "Kein Issue mehr, dessen umgesetzter Teil den offenen verdeckt. Der Plattenteil ist erst wieder greifbar, wenn er neu und atomar erfasst wird; die dort getroffenen Fachentscheidungen bleiben im geschlossenen Issue lesbar."
        },
        {
          "text": "#19 offen lassen als Platzhalter für den nächsten Zyklus.",
          "wirkung": "Die bereits getroffenen Plattenentscheidungen bleiben am offenen Issue sichtbar, es steht aber dauerhaft mit Entscheidung nötig im Plan, obwohl der aktuelle Zyklus es nicht anfasst."
        }
      ],
      "empfehlung": "Option 1: schließen. Der Gewindestangenanteil ist abgeschlossen und live, Modul 2 ist im aktuellen Zyklus ausgeblendet. Ein neues kleines Issue für Platten- und Lattenzuschnitt ist ehrlicher als ein halb erledigtes Sammelissue."
    }
  ],
  "naechstes": {
    "issue": 15,
    "titel": "Ausgabe: Technische Wandzeichnung mit allen Komponenten",
    "prio": "high",
    "status": "in progress",
    "sicherheit": true,
    "abhaengig_von": [],
    "zyklus": true,
    "begruendung": "Abnahme gescheitert und durch #62 bestätigt: Der reale Neuanlegefluss speichert 1100 mm als echte Vorspanngeometrie. Zeichnung und Stückliste lesen falsches JSON; Baubarkeit und Baustellenausgabe sind betroffen."
  },
  "weitere": [
    {
      "issue": 62,
      "titel": "Stückliste: Baustellendokument vereinfachen und Vorspanndaten konsistent halten",
      "prio": "high",
      "status": "ohne",
      "sicherheit": true,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 20,
      "titel": "Zyklusrahmen: Aschersleben/AWG-Projekt vollständig begleiten",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 56,
      "titel": "Längenänderung und Erstellung von Wandelementen nur im Geschosseditor",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 57,
      "titel": "Wandwerkzeug: Ecke als erster Punkt, Erzeugen nur durch Ziehen",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 58,
      "titel": "Stückliste benutzbar machen: n.a. statt Fülltext, Beplankung entfernen",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 59,
      "titel": "Lageplan: Wandnummern mit Liste, minimaler Kopf, keine Nullmaße",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 60,
      "titel": "Fixierwerkzeug ersetzen: Bemaßung direkt gegen den Ursprung",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 61,
      "titel": "Blattvorschau muss der gedruckten Ausgabe entsprechen",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    }
  ],
  "blockiert": [
    {
      "issue": 44,
      "titel": "Ausgabe: Gesamtstückliste Projekt/Gebäude aus Baustellenstücklisten",
      "prio": "high",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "ursache": "Das Label status: blocked steht noch, obwohl die Ursache entfallen ist: die wandweise Baustellenstückliste ist mit #22 erledigt und live. Fachlich ist der Scope bestätigt, offen ist die Statusbereinigung und die Umsetzung.",
      "naechster_schritt": "Label status: blocked entfernen und den bestätigten Umbau des Stücklistenmoduls umsetzen: Umschaltung Wand, Geschoss, Gebäude und Gesamt über die aktiven Entitäten, Export beider Listen und ein Schalter für die Preisanzeige.",
      "blockiert_durch": []
    },
    {
      "issue": 38,
      "titel": "Validierung: 20 reale Aschersleben/AWG-Wände als Regelfälle",
      "prio": "high",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [
        41,
        44,
        15
      ],
      "zyklus": true,
      "ursache": "Bewusst am Zyklusende: die Validierung setzt bestätigte Regeln und die priorisierten Ausgaben voraus. Zudem fehlt die fachliche Freigabe der 20 realen Wände durch das Projektteam.",
      "naechster_schritt": "Freigabe und stabile Referenzen der 20 datensparsamen Wandfälle beim Projektteam anfordern, danach #41 entscheiden und Wandzeichnung sowie Gesamtstückliste bereitstellen.",
      "blockiert_durch": [
        41,
        44,
        15
      ]
    }
  ]
};
