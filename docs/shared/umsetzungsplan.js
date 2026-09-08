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
  "stand": "2026-09-08",
  "signatur": "6d483b29",
  "entscheidungen": [
    {
      "issue": 41,
      "titel": "Fachreview: SEMBLA-Regelwerk korrigieren und offene Regeln bestätigen",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Was bezeichnet Regel 4 eindeutig als Spannblech, und welche Bauteilgrenze muss jeweils von mindestens zwei Spannelementen gehalten werden?",
      "optionen": [
        {
          "text": "Spannblech bezeichnet jedes einzelne reale Blechsegment an Boden oder Kopf.",
          "wirkung": "Die Mindestbelegung wird je geslictem Segment geprüft und kann zusätzliche Spannachsen auslösen."
        },
        {
          "text": "Spannblech bezeichnet nur ein bestimmtes Anschlussblech oder eine zusammenhängende Blechgruppe.",
          "wirkung": "Vor der Kernregel muss dieses Bauteil mit Beginn und Ende eindeutig benannt werden."
        }
      ],
      "empfehlung": "Regel 4 an einem markierten Wandbeispiel festlegen; die Antworten zu i3-Vorrang, Regel 5 und reinen i2-Stapeln sind bereits aufgenommen."
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
    "begruendung": "Die technische Wandzeichnung ist die laufende sicherheits- und baubarkeitsrelevante Projektausgabe; die neuen Darstellungsreste werden über #97 und #112 nachgezogen."
  },
  "weitere": [
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
      "issue": 77,
      "titel": "Modul 1/Core: Vorspannsystem mit realen Bauteilmaßen und Einbaulagen fachlich klären",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 81,
      "titel": "Modul 4: Manuelle Stücklisten-Overrides mit wählbarem Export",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 59,
      "titel": "Lageplan feedback",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
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
      "issue": 94,
      "titel": "Baugruppen/Sets im Bauteilkatalog mit Auflösung in die flache Stückliste",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 107,
      "titel": "PDF-Export auf Projektebene",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 97,
      "titel": "Zeichnung: reale Spannbauteile in Modul 1 und 7 maßstäblich darstellen",
      "prio": "medium",
      "status": "ready",
      "sicherheit": true,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 112,
      "titel": "Gewindestangen in Modul 1 und 7 im Vordergrund mit sichtbaren Stößen zeichnen",
      "prio": "medium",
      "status": "ready",
      "sicherheit": true,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 113,
      "titel": "Stücklisten-Export um Beschaffungsdaten aus dem Bauteilkatalog ergänzen",
      "prio": "medium",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 108,
      "titel": "Bauteilkatalog: Variantenführung und Bearbeitungsfeedback vervollständigen",
      "prio": "ohne",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
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
        20
      ],
      "zyklus": true,
      "ursache": "Die Validierung setzt den laufenden Zyklusrahmen und freigegebene reale Wandfälle voraus.",
      "naechster_schritt": "Freigegebene Referenzwände bereitstellen und den Zyklusrahmen so weit führen, dass die 20 Regelfälle reproduzierbar geprüft werden können.",
      "blockiert_durch": [
        20
      ]
    }
  ]
};
