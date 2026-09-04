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
  "stand": "2026-09-04",
  "signatur": "3ab61be2",
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
    },
    {
      "issue": 77,
      "titel": "Vorspannsystem mit realen Bauteilmaßen und Einbaulagen fachlich klären",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Welche realen Bauteilmaße und Einbaulagen sind für das Vorspannsystem verbindlich?",
      "optionen": [
        {
          "text": "Die verbindlichen Maße und Einbaulagen anhand eines freigegebenen Referenzaufbaus festlegen.",
          "wirkung": "Core, Darstellung und Stückliste können anschließend gegen dieselbe fachliche Quelle umgesetzt werden."
        },
        {
          "text": "Die bisherigen Annahmen vorläufig beibehalten.",
          "wirkung": "Die Planung bleibt nutzbar, bildet aber weiterhin keinen fachlich bestätigten Realaufbau ab."
        }
      ],
      "empfehlung": "Einen freigegebenen Referenzaufbau mit Maßkette bereitstellen und erst danach die Rechen- und Darstellungslogik ändern."
    },
    {
      "issue": 59,
      "titel": "Lageplan-Feedback",
      "prio": "high",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false,
      "frage": "Alle Rückmeldepunkte sind umgesetzt, zurückgezogen oder abgenommen; die Ursprungsdarstellung ist mit Option A bestätigt. Soll das Issue geschlossen werden?",
      "optionen": [
        {
          "text": "Schließen — der gesamte Rückmeldeumfang ist erledigt.",
          "wirkung": "Der Backlog trägt keinen erledigten Rest mit; neue Lageplan-Rückmeldungen starten als eigenes, klein geschnittenes Issue."
        },
        {
          "text": "Offen lassen als Sammelstelle für weitere Lageplan-Rückmeldungen.",
          "wirkung": "Neue Rückmeldungen landen im selben Issue, der Plan führt es aber dauerhaft ohne umsetzbaren Anteil."
        }
      ],
      "empfehlung": "Schließen — es gibt keinen offenen Punkt mehr, und getrennte neue Issues bleiben klein und prüfbar."
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
    "begruendung": "Die technische Wandzeichnung ist als angefangene, priorisierte Projektausgabe weiterhin der vorderste Portfolio-Scope."
  },
  "weitere": [
    {
      "issue": 81,
      "titel": "Manuelle Stücklisten-Overrides: Mengenübersteuerung auf Geschossebene",
      "prio": "high",
      "status": "ready",
      "sicherheit": true,
      "abhaengig_von": [],
      "zyklus": true
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
      "issue": 91,
      "titel": "Bodenblech-Slicing: Standardlängen und Sonderzuschnitte statt durchgehender Platte",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 92,
      "titel": "Spannsystem: reale Einbaulagen, Sechskantschraube, Überstand ab OK Spannplatte, Unterlegscheibe",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 93,
      "titel": "Einlegeblech und Zwischenspannung als Bauteil mit Editiermodus und Slicing-Sperrzone",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 94,
      "titel": "Baugruppen und Sets im Bauteilkatalog mit Auflösung in die flache Stückliste",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 95,
      "titel": "Deckenanschluss: Verteilung auf Spannachsen, Editiermodus und Winkelbaugruppe",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 96,
      "titel": "Bodenausgleich: Ausgleichspunkte und Ausgleichsbleche unter dem Bodenblech",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 97,
      "titel": "Zeichnung: schematische Symbole für Spannplatte, Einlegeblech und Deckenanschluss vervollständigen",
      "prio": "medium",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    }
  ],
  "blockiert": [
    {
      "issue": 38,
      "titel": "Validierung: 20 reale Aschersleben/AWG-Wände als Regelfälle",
      "prio": "high",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [
        41,
        15
      ],
      "zyklus": true,
      "ursache": "Die Validierung setzt bestätigte Regeln, die priorisierte Wandzeichnung und freigegebene reale Wandfälle voraus.",
      "naechster_schritt": "Freigabe stabiler, datensparsamer Referenzwände einholen und danach Regelreview sowie Wandzeichnung abschließen.",
      "blockiert_durch": [
        41,
        15
      ]
    }
  ]
};
