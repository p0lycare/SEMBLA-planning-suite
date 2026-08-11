// @ts-check
/**
 * SEMBLA Workflow-Retros — das Datenartefakt (Modul 8, Issue #65).
 *
 * ERZEUGT — NICHT VON HAND BEARBEITEN. Geschrieben wird ausschliesslich ueber
 * `workflow-retros-schreiben.mjs` (npm run retros:schreiben). Reine Daten, keine Logik;
 * die Auswertung liegt in `sembla-workflow-retros.js`.
 *
 * Enthalten sind ausschliesslich bereits veroeffentlichte Umsetzungsruns mit bewusst
 * sanitisierten, deklarierten Feldern. Ein nicht belegter Wert steht als `null` und
 * wird NICHT geraten. Gesamtkennzahlen stehen hier absichtlich NICHT — sie werden bei
 * jeder Ausgabe frisch aus diesen Einzelruns gerechnet.
 *
 * ACHTUNG — dieses Repo ist oeffentlich: keine Pfade, keine Sitzungskennungen, keine
 * Nutzernamen, keine E-Mail-Adressen, keine Tokens, keine Prompt- oder Issue-Rohtexte,
 * keine Logs und keine vollstaendigen Toolausgaben.
 * `tests/module/test-workflow-retros.mjs` prueft das maschinell.
 */

/** Formatname des Austauschformats (eigene Achse, getrennt von PLAN_/BLOG_/SCHEMA_). */
export const RETRO_FORMAT = "SEMBLA-Workflow-Retros";

/** Formatversion der Workflow-Retros. */
export const RETRO_VERSION = 1;

/** @type {any[]} */
export const RUNS = [
  {
    "paket": "wp-2026-08-11-lageplan-nullmasse-ausblenden",
    "nr": 8,
    "datum": "2026-08-11",
    "titel": "Nullmaße im Lageplan ausblenden",
    "issues": [
      59
    ],
    "commit": "7fcca700fe7ce4d641c6001be91eb4f7151ea222",
    "ergebnis": "beobachten",
    "nutzerergebnis": "Eine gespeicherte 0-mm-Ursprungsbemaßung positioniert die Wand weiterhin kanonisch, wird aber in Vorschau, Druck und Export des Lageplans nicht mehr gezeichnet. Issue 59 blieb mit vier dokumentierten Restpunkten offen.",
    "veroeffentlicht": true,
    "laufzeit_s": 575,
    "reflexions_turns": 9,
    "implementierungs_turns": 15,
    "korrektur_turns": 0,
    "korrektur_runden": 0,
    "diff_dateien": 6,
    "diff_plus": 114,
    "diff_minus": 4,
    "test_wiederholungen": 1,
    "verdeckte_exitcodes": 0,
    "teststatus": "Modul-9-Fokustest nach einer Testkorrektur grün mit 27, 78 und 49; finaler Gesamtlauf 172 zu 0; Pages, Live-Marker und Readback erfolgreich.",
    "erkenntnisse": [
      "Änderungsliste, Umsetzungsplan und den Test auf den neuesten Eintrag vor dem ersten finalen Gesamtlauf gemeinsam als vollständigen Veröffentlichungsdiff prüfen.",
      "Beim Phasenwechsel nur die dann tatsächlich verfügbaren Werkzeuge nennen, damit Fehlaufrufe entfallen."
    ]
  },
  {
    "paket": "wp-2026-08-11-zeichnung-vorschau-papierformat",
    "nr": 7,
    "datum": "2026-08-11",
    "titel": "Druckgetreue Blattvorschau",
    "issues": [
      61
    ],
    "commit": "d004f906eec0a0693eceeefa27198adbcf700f44",
    "ergebnis": "beibehalten",
    "nutzerergebnis": "Modul 7 zeigt A3 und A4 mit derselben kanonischen Innengeometrie und Blattaufteilung wie Druck und zentraler Export; die Verkleinerung skaliert das vollständige Blatt gleichmäßig. Issue 61 blieb für die getrennte Inhaltsreduktion offen.",
    "veroeffentlicht": true,
    "laufzeit_s": 874,
    "reflexions_turns": 15,
    "implementierungs_turns": 31,
    "korrektur_turns": 0,
    "korrektur_runden": 0,
    "diff_dateien": 7,
    "diff_plus": 231,
    "diff_minus": 36,
    "test_wiederholungen": 0,
    "verdeckte_exitcodes": 0,
    "teststatus": "Ein einziger Modul-7-Fokuslauf grün mit 129 und 58; genau ein abschließender Gesamtlauf 172 zu 0; Pages, Live-Marker und Readback erfolgreich.",
    "erkenntnisse": [
      "Den Worker vor dem ersten Git-Aufruf verbindlich in das konfigurierte Produktrepo wechseln und das Arbeitsverzeichnis einmal prüfen.",
      "Nach erfolgreichem Umsetzungslauf keinen Wiederaufnahmepfad mehr probieren, sondern die vorhandene Sitzung direkt für das Go verwenden.",
      "Readback-Prüfungen in bereits freigegebene Einzelbefehle zerlegen, damit kein Sammelaufruf an einer Freigabe stehen bleibt."
    ]
  },
  {
    "paket": "wp-2026-08-11-lageplan-wandnummern",
    "nr": 6,
    "datum": "2026-08-11",
    "titel": "Lageplan-Wandnummern",
    "issues": [
      59
    ],
    "commit": "2624d62cdc41a9dde8797bc9714458fd4c9b4554",
    "ergebnis": "beobachten",
    "nutzerergebnis": "Modul 9 beschriftet verortete Wände mit kurzen Nummern aus der kanonischen Geschossreihenfolge und ordnet sie in der Liste den vollständigen Namen zu; Vorschau, Druck und Export nutzen dieselbe Zuordnung. Issue 59 blieb mit fünf Restpunkten offen.",
    "veroeffentlicht": true,
    "laufzeit_s": 698,
    "reflexions_turns": 7,
    "implementierungs_turns": 21,
    "korrektur_turns": 0,
    "korrektur_runden": 0,
    "diff_dateien": 6,
    "diff_plus": 219,
    "diff_minus": 16,
    "test_wiederholungen": 1,
    "verdeckte_exitcodes": 1,
    "teststatus": "Modul-9-Fokustest nach Korrektur des Testaufbaus grün mit 27, 68 und 41; Gesamtlauf 172 zu 0; Pages, Live-Marker und Readback erfolgreich.",
    "erkenntnisse": [
      "Testläufe ungefiltert oder mit verbindlichem pipefail ausführen, damit rote Zwischenstände als fehlgeschlagene Aufrufe erfasst werden.",
      "Das Ergebnis einer bereits gelaufenen Suite direkt verwenden, statt sie für eine gefilterte Zusammenfassung neu zu starten.",
      "Im Smoke-Aufbau die benötigten Schalterzustände ausdrücklich setzen, statt Vorbelegungen im DOM-Double vorauszusetzen."
    ]
  },
  {
    "paket": "wp-2026-08-11-wandansicht-legende-ausserhalb",
    "nr": 5,
    "datum": "2026-08-11",
    "titel": "Zuschnittlegende außerhalb der Wandansicht",
    "issues": [
      63
    ],
    "commit": "0e01ee148322ad03c0b19820b047e50d8d5f4c78",
    "ergebnis": "aenderung_vorschlagen",
    "nutzerergebnis": "Modul 1 zeichnet die quellengetreue Zuschnittlegende in einem eigenen Bereich unter der Wandansicht; sie verdeckt weder Wand noch Anschlüsse, Stangen oder Bemaßung und bleibt im Leerzustand leer. Issue 63 wurde vollständig abgedeckt.",
    "veroeffentlicht": true,
    "laufzeit_s": 946,
    "reflexions_turns": 8,
    "implementierungs_turns": 15,
    "korrektur_turns": 11,
    "korrektur_runden": 1,
    "diff_dateien": 5,
    "diff_plus": 88,
    "diff_minus": 33,
    "test_wiederholungen": null,
    "verdeckte_exitcodes": 1,
    "teststatus": "Modul-1-Fokustest grün mit 122; nach Reparatur des Veröffentlichungstests Gesamtlauf 172 zu 0; Pages, Live-Marker und Readback erfolgreich.",
    "erkenntnisse": [
      "Bei der Abnahme der Rückspiegelung jeden Muss-Satz wörtlich gegen die vorgeschlagene Logik prüfen und Widersprüche vor dem Go klären.",
      "Jeden Teststand einmal ungefiltert ausführen und Ergebnisse nicht durch erneute Suiten filtern oder zusammenfassen.",
      "Änderungsliste, Umsetzungsplan und Veröffentlichungstest vor dem einzigen finalen Gesamtlauf vollständig aktualisieren."
    ]
  },
  {
    "paket": "wp-2026-08-11-einheit-mm-einmalig",
    "nr": 4,
    "datum": "2026-08-11",
    "titel": "Einheit mm einmalig",
    "issues": [
      64
    ],
    "commit": "90c736e7b1d06f6461013df44481c91a9a51e59c",
    "ergebnis": "aenderung_vorschlagen",
    "nutzerergebnis": "Geschosseditor, Lageplan und Wandzeichnung zeigen Bemaßungen als direkte Millimeterzahlen ohne wiederholtes Suffix und nennen die Einheit je Ansicht genau einmal; Daten, Geometrie und Maßstab blieben unverändert. Issue 64 wurde vollständig abgedeckt.",
    "veroeffentlicht": true,
    "laufzeit_s": 1354,
    "reflexions_turns": 18,
    "implementierungs_turns": 58,
    "korrektur_turns": 0,
    "korrektur_runden": 0,
    "diff_dateien": 11,
    "diff_plus": 157,
    "diff_minus": 40,
    "test_wiederholungen": 2,
    "verdeckte_exitcodes": 5,
    "teststatus": "Fokustests der Module 0, 7 und 9 nach fünf korrigierten Zwischenständen grün; Gesamtlauf 172 zu 0; Pages, Live-Marker und Readback erfolgreich.",
    "erkenntnisse": [
      "Claude strikt auf die Pakettests begrenzen; den Gesamtlauf ausschließlich einmal durch Nemo auf dem akzeptierten Enddiff ausführen.",
      "Testbefehle ungefiltert oder mit verbindlichem pipefail ausführen, damit der erste rote Lauf unmittelbar als Fehler gilt.",
      "Bei einem roten Fokustest zunächst den einzelnen betroffenen Test ausführen und erst nach der Korrektur die ganze Modulsuite wiederholen."
    ]
  },
  {
    "paket": "wp-2026-08-11-stueckliste-ohne-id-spalte",
    "nr": 3,
    "datum": "2026-08-11",
    "titel": "Stückliste ohne ID-Spalte",
    "issues": [
      62
    ],
    "commit": "e6588e9bc7336f8d1951cedeac84d5d4f7e1c87a",
    "ergebnis": "aenderung_vorschlagen",
    "nutzerergebnis": "Das Arbeitsblatt von Modul 4 zeigt und druckt nur noch sechs kompakte Spalten ohne lange ID-Folgen; die kanonischen IDs bleiben in Positionen, Einbauteilliste und Zeichnung erhalten. Issue 62 wurde vollständig abgedeckt.",
    "veroeffentlicht": true,
    "laufzeit_s": 832,
    "reflexions_turns": 4,
    "implementierungs_turns": 30,
    "korrektur_turns": 0,
    "korrektur_runden": 0,
    "diff_dateien": 7,
    "diff_plus": 113,
    "diff_minus": 100,
    "test_wiederholungen": 3,
    "verdeckte_exitcodes": 1,
    "teststatus": "Modul-4-Fokustest nach einer Testhelfer-Korrektur grün mit 65 und 173; Gesamtlauf 172 zu 0; Pages, Live-Marker und Readback erfolgreich.",
    "erkenntnisse": [
      "Claude auf die Pakettests begrenzen; den Gesamtlauf ausschließlich einmal durch Nemo auf dem akzeptierten Enddiff ausführen.",
      "Testbefehle ohne exitcode-verdeckende Pipelines ausführen oder verbindlich pipefail setzen.",
      "Testergebnisse aus einem Lauf auswerten, statt dieselbe Suite für Filterung und Zusammenfassung neu zu starten."
    ]
  },
  {
    "paket": "wp-2026-08-11-gesamtstueckliste-aktive-ebenen",
    "nr": 2,
    "datum": "2026-08-11",
    "titel": "Gesamtstückliste aktiver Ebenen",
    "issues": [
      44
    ],
    "commit": "acb8dca71e771e73f8917a9b23aea40e8e2150f6",
    "ergebnis": "aenderung_vorschlagen",
    "nutzerergebnis": "Modul 4 zeigt und exportiert die aus kanonischen Wandstücklisten aggregierte Baustellenstückliste für Wand, Geschoss, Gebäude oder Projekt mit Herkunft, Lückenstatus und gemeinsamem Preisschalter; der zentrale Export ist auch ohne aktive Wand erreichbar. Issue 44 wurde vollständig abgedeckt.",
    "veroeffentlicht": true,
    "laufzeit_s": 1979,
    "reflexions_turns": 14,
    "implementierungs_turns": 49,
    "korrektur_turns": 20,
    "korrektur_runden": 1,
    "diff_dateien": 11,
    "diff_plus": 1380,
    "diff_minus": 92,
    "test_wiederholungen": 2,
    "verdeckte_exitcodes": null,
    "teststatus": "Fokustests grün mit 65, 169 und 413; Modul-0-, Modul-4- und Modul-8-Suiten grün; Gesamtlauf 172 zu 0; Pages, Live-Marker und Readback erfolgreich.",
    "erkenntnisse": [
      "Die Abnahme der Rückspiegelung soll jeden Satz des Nutzerflusses als erreichbaren Pfad prüfen, insbesondere ausdrücklich optionale Voraussetzungen.",
      "Claude im Go ausdrücklich auf die Paketbefehle begrenzen; den Gesamtlauf einmal durch Nemo auf dem akzeptierten Enddiff ausführen.",
      "Testbefehle ohne exitcode-verdeckende Pipelines ausführen oder verbindlich pipefail setzen, damit rote Tests als Fehler sichtbar bleiben."
    ]
  },
  {
    "paket": "wp-2026-08-11-neuanlage-vorspannung",
    "nr": 1,
    "datum": "2026-08-11",
    "titel": "Neuanlage mit Vorspannung",
    "issues": [
      15,
      62
    ],
    "commit": "6e15f80126c88e877633888da7fc4e9be9e40720",
    "ergebnis": "beobachten",
    "nutzerergebnis": "Neue Wände aus Modul 0 und dem Geschosseditor speichern Kataloglängen und Reststück unmittelbar; Zeichnung und Baustellenstückliste stimmen ohne Zwischenbesuch von Modul 1. Issue 15 und Issue 62 blieben mit ihrem jeweiligen Restumfang offen.",
    "veroeffentlicht": true,
    "laufzeit_s": 1771,
    "reflexions_turns": 31,
    "implementierungs_turns": null,
    "korrektur_turns": null,
    "korrektur_runden": 1,
    "diff_dateien": 11,
    "diff_plus": 673,
    "diff_minus": 71,
    "test_wiederholungen": 2,
    "verdeckte_exitcodes": null,
    "teststatus": "Fokustests grün mit 48, 381, 359 und Core 110 zu 0; Gesamtlauf 172 zu 0; Pages und Live-Marker erfolgreich.",
    "erkenntnisse": [
      "In der Lesephase ausschließlich die tatsächlich freigeschalteten Werkzeuge nennen, damit Fehlaufrufe entfallen.",
      "Bei der Rückspiegelung zuerst die beiden Neuanlege-Handler, Kernnormalisierung, Katalogabbildung und die zugehörigen Smokes lesen und erst bei offenem Befund breiter suchen.",
      "Claude nur die Pakettests ausführen lassen; den Gesamtlauf ausschließlich im finalen Nemo-Gate."
    ]
  }
];
