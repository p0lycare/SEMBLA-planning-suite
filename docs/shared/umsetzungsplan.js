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
  "stand": "2026-08-12",
  "signatur": "33b3f8f8",
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
      "issue": 59,
      "titel": "Lageplan: minimaler Kopf und weitere Bemaßungskorrekturen",
      "prio": "high",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 61,
      "titel": "Technische Zeichnung: Blattinhalt auf wesentliche Angaben reduzieren",
      "prio": "ohne",
      "status": "ohne",
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
        41,
        15
      ],
      "zyklus": true,
      "ursache": "Bewusst am Zyklusende: die Validierung setzt bestätigte Regeln und die priorisierte Wandzeichnung voraus. Zudem fehlt die fachliche Freigabe der 20 realen Wände durch das Projektteam.",
      "naechster_schritt": "Freigabe und stabile Referenzen der 20 datensparsamen Wandfälle beim Projektteam anfordern, danach #41 entscheiden und die Wandzeichnung bereitstellen.",
      "blockiert_durch": [
        41,
        15
      ]
    }
  ]
};
