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
  "stand": "2026-09-07",
  "signatur": "99bc8669",
  "entscheidungen": [
    {
      "issue": 77,
      "titel": "Vorspannsystem mit realen Bauteilmaßen und Einbaulagen fachlich klären",
      "prio": "high",
      "status": "in progress",
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
      "issue": 105,
      "titel": "Standardkatalog-Vorlage: reale Maße von Kopplungsmutter und Spannplatte eintragen",
      "prio": "medium",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Wie wird mit den beiden noch fehlenden Vorlagenmaßen umgegangen, bis die realen Werte für Kopplungsmutterhöhe und Spannplattendicke vorliegen?",
      "optionen": [
        {
          "text": "Warten: sobald die beiden Maße vorliegen, wird daraus ein reines Stammdatenpaket auf der Vorlage.",
          "wirkung": "Fußoffset und Kopfzuschlag rechnen weiter, bis dahin aber mit ausdrücklich als vorläufig gekennzeichneten Werten."
        },
        {
          "text": "Die beiden Maße zusätzlich in der Oberfläche als vorläufig kennzeichnen.",
          "wirkung": "Niemand liest die Stangenlängen als endgültig; es ändert aber keine Zahl und keine Rechnung."
        },
        {
          "text": "Die heutigen Werte als verbindlich übernehmen und den Restpunkt schließen.",
          "wirkung": "Stangenbeginn und Stangenbedarf beruhten dauerhaft auf geschätzten Maßen; das widerspricht dem Nicht-Ziel, Maße zu schätzen."
        }
      ],
      "empfehlung": "Warten und die zwei Zahlen nachreichen: die Rechenwege stehen bereits, es fehlt ausschließlich die Messung."
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
      "issue": 20,
      "titel": "Zyklusrahmen: Aschersleben/AWG-Projekt vollständig begleiten",
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
      "issue": 93,
      "titel": "Einlegeblech und Zwischenspannung als Bauteil mit Editiermodus und Slicing-Sperrzone",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 94,
      "titel": "Baugruppen und Sets im Bauteilkatalog mit Auflösung in die flache Stückliste",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 96,
      "titel": "Bodenausgleich: Ausgleichspunkte und Ausgleichsbleche unter dem Bodenblech",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true
    },
    {
      "issue": 59,
      "titel": "Lageplan-Feedback",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 100,
      "titel": "Darstellung der Wandansicht ist zu groß",
      "prio": "high",
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
        20
      ],
      "zyklus": true,
      "ursache": "Die Validierung setzt den laufenden Zyklusrahmen und freigegebene reale Wandfälle voraus.",
      "naechster_schritt": "Freigabe stabiler, datensparsamer Referenzwände einholen und den Zyklusrahmen so weit führen, dass die Regelfälle prüfbar sind.",
      "blockiert_durch": [
        20
      ]
    },
    {
      "issue": 95,
      "titel": "Deckenanschluss: Verteilung auf Spannachsen, Editiermodus und Winkelbaugruppe",
      "prio": "high",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [
        94
      ],
      "zyklus": true,
      "ursache": "Der Deckenanschluss wird als Baugruppe kalkuliert; deren Auflösung in die flache Stückliste entsteht erst in #94.",
      "naechster_schritt": "Auflösung der Baugruppen im kanonischen Stücklistenpfad abschließen, danach die Winkelbaugruppe und die Verteilung auf die Anschlussachsen bauen.",
      "blockiert_durch": [
        94
      ]
    },
    {
      "issue": 97,
      "titel": "Zeichnung: schematische Symbole für Spannplatte, Einlegeblech und Deckenanschluss vervollständigen",
      "prio": "medium",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [
        93,
        95,
        96
      ],
      "zyklus": true,
      "ursache": "Ein Symbol lässt sich erst festlegen, wenn das dargestellte Bauteil samt Einbaulage steht; Einlegeblech, Deckenanschluss und Bodenausgleich sind noch in Arbeit.",
      "naechster_schritt": "Einlegeblech, Deckenanschluss und Ausgleichspunkte fertigstellen und danach den gemeinsamen Darstellungsschlüssel in einem Zug ergänzen.",
      "blockiert_durch": [
        93,
        95,
        96
      ]
    }
  ]
};
