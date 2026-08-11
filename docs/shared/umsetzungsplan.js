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
  "signatur": "7a412d86",
  "entscheidungen": [
    {
      "issue": 41,
      "titel": "Fachreview: SEMBLA-Regelwerk korrigieren und offene Regeln bestätigen",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Wer führt das Fachreview des Regelwerks durch, und in welchem Umfang wird geprüft?",
      "optionen": [
        {
          "text": "Vollreview aller Regel-IDs",
          "wirkung": "Höchste Sicherheit, aber der längste Weg; blockiert die Validierung der realen Wände weiter."
        },
        {
          "text": "Fokusreview der offenen Zielregeln",
          "wirkung": "Nur A-8 und die vier ungeprüften Vorspannhinweise; deutlich schneller, Restrisiko benannt."
        }
      ],
      "empfehlung": "Fokusreview der offenen Zielregeln — der umgesetzte Stand ist regressionsgetestet, offen sind vor allem die als Ziel gekennzeichneten Regeln."
    },
    {
      "issue": 43,
      "titel": "Eigenes Modul: Projekt- und Wandkonfiguration",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Welche Werte dürfen überhaupt konfigurierbar sein, und welche Modulnummer bekommt das Konfigurationsmodul?",
      "optionen": [
        {
          "text": "Enger Schnitt",
          "wirkung": "Nur heute schon regelrelevante Defaults; wenig Umbau, keine Scheinkonfiguration abgeleiteter Werte."
        },
        {
          "text": "Weiter Schnitt",
          "wirkung": "Alle heutigen Formularfelder wandern mit; großer Umbau in den Modulen 1 bis 4 und Risiko doppelter Wahrheiten."
        }
      ],
      "empfehlung": "Enger Schnitt mit Modulnummer 10 — das Issue verbietet die pauschale Migration ausdrücklich, und die Nummern bleiben stabil."
    },
    {
      "issue": 19,
      "titel": "Zuschnitt- und Layoutplanung für Platten, Latten und Gewindestangen",
      "prio": "medium",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false,
      "frage": "Bleibt der offene Platten- und Lattenteil im Folgezyklus, oder soll er in den laufenden Zyklus gezogen werden?",
      "optionen": [
        {
          "text": "Im Folgezyklus lassen",
          "wirkung": "Der laufende Zyklus bleibt auf den Projektausgaben; die Baustellenstückliste ist davon bereits entkoppelt."
        },
        {
          "text": "In den laufenden Zyklus ziehen",
          "wirkung": "Braucht zuerst die Fachentscheidungen zu Plattenformaten und Lattenlängen und verschiebt die Ausgaben nach hinten."
        }
      ],
      "empfehlung": "Im Folgezyklus lassen — so steht es im Issue, und die offenen Fachentscheidungen sind noch nicht getroffen."
    }
  ],
  "naechstes": {
    "issue": 22,
    "titel": "Modul 4: Reine Baustellenstückliste mit Einbauteil-IDs und Fertigmaßen",
    "prio": "high",
    "status": "ready",
    "sicherheit": false,
    "abhaengig_von": [],
    "zyklus": true,
    "begruendung": "Höchste Priorität, im laufenden Zyklus, umsetzungsreif und ohne offene Abhängigkeit. Es liefert außerdem die Einbauteil-IDs, auf die Wandzeichnung und Gesamtstückliste warten."
  },
  "weitere": [
    {
      "issue": 15,
      "titel": "Ausgabe: Technische Wandzeichnung mit allen Komponenten",
      "prio": "high",
      "status": "ready",
      "sicherheit": false,
      "abhaengig_von": [
        22
      ],
      "zyklus": true
    },
    {
      "issue": 20,
      "titel": "Zyklusrahmen: Aschersleben/AWG-Projekt vollständig begleiten",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [
        15,
        22
      ],
      "zyklus": true
    }
  ],
  "blockiert": [
    {
      "issue": 44,
      "titel": "Ausgabe: Gesamtstückliste Projekt/Gebäude aus Baustellenstücklisten",
      "prio": "high",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [
        22
      ],
      "zyklus": true,
      "blockiert_durch": [
        22
      ],
      "ursache": "Die Aggregation muss auf den kanonischen wandweisen Baustellenstücklisten aufsetzen; genau die entstehen erst mit Issue 22.",
      "naechster_schritt": "Nach Abschluss von Issue 22 die Aggregation über Projekt, Gebäude, Geschoss und Wand bauen — ohne zweites Mengenmodell."
    },
    {
      "issue": 38,
      "titel": "Validierung: 20 reale Aschersleben/AWG-Wände als Regelfälle",
      "prio": "high",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [
        20,
        41
      ],
      "zyklus": true,
      "blockiert_durch": [
        20,
        41
      ],
      "ursache": "Die Validierung steht bewusst am Ende des Zyklus und braucht zuvor die freigegebene Fallauswahl durch das Projektteam sowie das Fachreview.",
      "naechster_schritt": "Freigabe der 20 datensparsamen Fälle einholen; erst danach je Wand Planung, Regelprüfung und Pflichtausgaben durchfahren."
    }
  ]
};
