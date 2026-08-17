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
  "stand": "2026-08-18",
  "signatur": "869118af",
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
      "issue": 19,
      "titel": "Zuschnitt- und Layoutplanung für Platten, Latten und Gewindestangen",
      "prio": "medium",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false,
      "frage": "Das Gewindestangen-Slicing ist vollständig umgesetzt; offen ist nur die aus dem Zyklus genommene Platten- und Latten-Zuschnittplanung. Soll das Issue geschlossen werden?",
      "optionen": [
        {
          "text": "Schließen; die Platten- und Latten-Zuschnittplanung wird bei Bedarf im Folgezyklus als neues Issue angelegt.",
          "wirkung": "Der Backlog trägt keinen Sammelrest mit; der Folgeumfang startet klein geschnitten mit frischem Stand."
        },
        {
          "text": "Offen lassen als Merkposten für den Folgezyklus.",
          "wirkung": "Der Umfang bleibt sichtbar, das Issue bleibt aber dauerhaft ohne umsetzbaren Anteil im aktuellen Zyklus."
        }
      ],
      "empfehlung": "Schließen — der umsetzbare Anteil ist vollständig erledigt, und ein Folgezyklus-Issue lässt sich sauberer schneiden."
    },
    {
      "issue": 87,
      "titel": "Gleiche Wandnamen führen zu Fehlzuweisungen",
      "prio": "ohne",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false,
      "frage": "Die eindeutige Wand-ID existiert bereits und ist überall die Zuordnungsbasis; Namen sind reine Anzeige. Wo trat die beobachtete Fehlzuweisung auf?",
      "optionen": [
        {
          "text": "Anzeigeproblem: gleichnamige Wände sind in Wandliste und Kopfleiste optisch nicht unterscheidbar.",
          "wirkung": "Kleines Paket, das die Anzeige eindeutig macht, etwa mit Geschoss-Kontext neben dem Namen; keine Datenänderung."
        },
        {
          "text": "Echter Datenfehler bei einer konkreten Aktion, etwa beim Projektimport.",
          "wirkung": "Dann werden die Schritte gebraucht (Aktion, Modul, falsche Zuordnung danach), um die Ursache gezielt zu finden."
        }
      ],
      "empfehlung": "Kurz die konkrete Situation beschreiben, in der die Fehlzuweisung sichtbar wurde — ohne Repro wird nichts umgebaut."
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
      "titel": "Manuelle Stücklisten-Overrides mit wählbarem Export",
      "prio": "high",
      "status": "ready",
      "sicherheit": true,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 86,
      "titel": "Projektimport: zentraler Importdialog für beide ZIP-Fassungen",
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
