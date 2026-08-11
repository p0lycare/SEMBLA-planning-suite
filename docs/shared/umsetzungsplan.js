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
  "signatur": "54df7764",
  "entscheidungen": [
    {
      "issue": 41,
      "titel": "Fachreview: SEMBLA-Regelwerk korrigieren und offene Regeln bestätigen",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Regel 1 ist [V-2]. Regel 2 ist bisher nur unten [V-3], [V-8] setzt je Öffnungsseite eine Achse; Regeln 4/5 fehlen. Bleibt Regel 2 unten und zählen i3-Kammern links nach rechts, oder gilt oben alternativ mit zusätzlicher Vorrangregel?",
      "optionen": [
        {
          "text": "Regel 2 bleibt als [V-3] auf der untersten Lage; Regeln 3/4 werden ergänzt, Kammern 1–3 zählen links nach rechts.",
          "wirkung": "Der erste Schritt ist deterministisch: breite Öffnungen erhalten je Seite zwei Nachbarachsen, jedes definierte Spannblech mindestens zwei Achsen und die obere i3-Kammerregel folgt einer festen Zählung."
        },
        {
          "text": "Regel 2 gilt wahlweise unten oder oben.",
          "wirkung": "Vor Umsetzung müssen der Vorrang bei widersprechenden i3-Mitten und die genaue Zuordnung der Spannbleche definiert werden; sonst wären Kern und Orakel mehrdeutig."
        }
      ],
      "empfehlung": "Option 1 als kleiner erster Schritt; vor der Kammerregel ein konkretes i3-Beispiel bestätigen, damit links/rechts nicht still vertauscht werden."
    }
  ],
  "naechstes": {
    "issue": 15,
    "titel": "Technische Wandzeichnung: übrige Komponenten und Einbauteil-IDs abnehmen",
    "prio": "high",
    "status": "in progress",
    "sicherheit": true,
    "abhaengig_von": [],
    "zyklus": true,
    "begruendung": "Der Neuanlegefehler ist behoben. Offen bleiben die übrigen Komponenten, gemeinsame Einbauteil-IDs und die Realwand-Abnahme; als angefangene Sicherheitsausgabe bleibt #15 nach der berechneten Portfolio-Ordnung vorn."
  },
  "weitere": [
    {
      "issue": 62,
      "titel": "Baustellenstückliste kompakt und mit robusten Einbauteil-IDs darstellen",
      "prio": "high",
      "status": "ohne",
      "sicherheit": true,
      "abhaengig_von": [],
      "zyklus": false
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
      "status": "ready",
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
