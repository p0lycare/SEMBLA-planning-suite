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
  "signatur": "a739164f",
  "entscheidungen": [
    {
      "issue": 20,
      "titel": "Zyklusrahmen: Aschersleben/AWG-Projekt vollständig begleiten",
      "prio": "high",
      "status": "in progress",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Soll der Zyklusrahmen geschlossen werden, und welche weiteren Issues gelten ebenfalls als Zielbeschreibung statt als Umsetzungsauftrag?",
      "optionen": [
        {
          "text": "Nur den Rahmen schließen",
          "wirkung": "Zyklusinhalt und Reihenfolge bleiben in den Meilensteinen und atomaren Issues; die Wandvalidierung verweist danach auf die Meilensteine statt auf den Rahmen."
        },
        {
          "text": "Rahmen und Reviewissues schließen",
          "wirkung": "Auch Fachreview und Wandvalidierung fielen weg; der Zyklus verlöre seine dokumentierte fachliche Abnahme."
        },
        {
          "text": "Offen lassen",
          "wirkung": "Der Rahmen bliebe als Übersicht stehen, wird aber weiterhin als Issue mitgeführt, ohne je umgesetzt zu werden."
        }
      ],
      "empfehlung": "Nur den Rahmen schließen, wie gewünscht. Fachreview und Wandvalidierung tragen eigene Akzeptanzkriterien und bleiben echte Umsetzungsaufträge."
    },
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
          "wirkung": "Höchste Sicherheit, aber der längste Weg; die Validierung der realen Wände bleibt so lange blockiert."
        },
        {
          "text": "Fokusreview der offenen Zielregeln",
          "wirkung": "Nur A-8 und die ungeprüften Vorspannhinweise; deutlich schneller, das Restrisiko wird benannt."
        }
      ],
      "empfehlung": "Fokusreview der offenen Zielregeln — der umgesetzte Stand ist regressionsgetestet, offen sind vor allem die ausdrücklich als Ziel gekennzeichneten Regeln."
    },
    {
      "issue": 43,
      "titel": "Eigenes Modul: Projekt- und Wandkonfiguration",
      "prio": "high",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": true,
      "frage": "Braucht es ein eigenes Konfigurationsmodul, obwohl Modul 1 die Wandeingaben, Modul 0 die Projektstruktur und der Katalog die Produktdaten bereits besitzt?",
      "optionen": [
        {
          "text": "Issue schließen",
          "wirkung": "Die Zuständigkeiten bleiben wie heute verteilt; kein Umbau, und es entsteht kein vierter Ort für dieselben Werte."
        },
        {
          "text": "Auf Projektparameter verengen",
          "wirkung": "Nur ausdrückliche Projektvorgaben wandern in ein neues Modul; kleiner Umbau, aber eine weitere Modulnummer und ein weiterer Lesepfad."
        },
        {
          "text": "Wie beschrieben umsetzen",
          "wirkung": "Alle heutigen Formularfelder würden geprüft und teils verschoben; großer Umbau in den Modulen 1 bis 4 mit Risiko doppelter Wahrheiten."
        }
      ],
      "empfehlung": "Schließen. Die Rückfrage im Issue trifft den Punkt: Wandeingaben gehören Modul 1, Projekt und Geschoss Modul 0, Produkte dem Katalog. Ein weiterer Ort brächte eine zweite Wahrheit."
    },
    {
      "issue": 19,
      "titel": "Zuschnitt- und Layoutplanung für Platten, Latten und Gewindestangen",
      "prio": "medium",
      "status": "decision needed",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false,
      "frage": "Kann dieses Issue geschlossen werden, nachdem Platten, Latten und Verbinder aus dem Zyklus genommen wurden und nur die Gewindestangen bleiben?",
      "optionen": [
        {
          "text": "Schließen",
          "wirkung": "Der Gewindestangenteil ist regelbasiert umgesetzt; Platten und Latten kommen gemeinsam mit der Beplankung als neues Issue zurück."
        },
        {
          "text": "Offen lassen",
          "wirkung": "Das Issue bliebe Sammelstelle für den Folgezyklus, führt aber weiter Punkte, die niemand bearbeitet und die die Ausgaben scheinbar offen halten."
        }
      ],
      "empfehlung": "Schließen und den Platten- und Lattenteil erst mit der Beplankung neu aufsetzen. Das Slicing der Gewindestangen ist umgesetzt, und die Baustellenstückliste ist davon bereits entkoppelt."
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
    "begruendung": "Höchste Priorität im laufenden Zyklus, umsetzungsreif und ohne offene Abhängigkeit; die Gesamtstückliste aus Issue 44 wartet ausschließlich darauf, weil sie die Summe der wandweisen Baustellenstücklisten ist."
  },
  "weitere": [
    {
      "issue": 56,
      "titel": "Längenänderungen und Erstellen der Wand nur im Geschosseditor",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 57,
      "titel": "Wandwerkzeug: Eckpunkt statt Wandmitte, kein Anlegen durch Einzelklicks",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 58,
      "titel": "Stückliste benutzbar machen: keine Vorläufigkeitstexte, n.a. statt Begründung, ohne Beplankung",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 59,
      "titel": "Lageplan: Wandnummern mit Liste, schlanker Zeichnungskopf, keine Nullmaße, Ursprung und Elementbreite",
      "prio": "ohne",
      "status": "ohne",
      "sicherheit": false,
      "abhaengig_von": [],
      "zyklus": false
    },
    {
      "issue": 60,
      "titel": "Fixierwerkzeug ersetzen: Bemaßung unmittelbar gegen den auswählbaren Ursprung",
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
      "abhaengig_von": [
        22
      ],
      "zyklus": true,
      "blockiert_durch": [
        22
      ],
      "ursache": "Die Gesamtstückliste ist die Summe der wandweisen Baustellenstücklisten; genau die entstehen erst mit Issue 22, und ein zweites Mengenmodell ist ausgeschlossen.",
      "naechster_schritt": "Nach Issue 22 das Stücklistenmodul auf eine wählbare Ebene umbauen — Wand, Geschoss, Gebäude, Projekt — mit umschaltbarer Preisanzeige und Export je Ebene."
    },
    {
      "issue": 38,
      "titel": "Validierung: 20 reale Aschersleben/AWG-Wände als Regelfälle",
      "prio": "high",
      "status": "blocked",
      "sicherheit": false,
      "abhaengig_von": [
        20,
        41,
        44
      ],
      "zyklus": true,
      "blockiert_durch": [
        20,
        41,
        44
      ],
      "ursache": "Die Validierung steht bewusst am Ende: sie braucht die vom Projektteam freigegebenen Fälle, das Fachreview des Regelwerks und die fertigen Projektausgaben.",
      "naechster_schritt": "Freigabe von 20 datensparsamen Fällen einholen; erst danach je Wand Zuordnung, Planung, Regelprüfung und Pflichtausgaben durchfahren und Abweichungen je Regel-ID festhalten."
    }
  ]
};
