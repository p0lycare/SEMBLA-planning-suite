// @ts-check
/**
 * SEMBLA Blog — Änderungsliste („Was ist neu?", Modul 8).
 *
 * Versionierte, öffentliche Ressource im Repo: reine Daten, keine Logik. Sie ist die
 * einzige Quelle der Ansicht „Was ist neu?" und funktioniert damit auch ohne Netz.
 *
 * COMMIT-REGEL: Jeder produktive SEMBLA-Commit ergänzt hier GENAU EINEN neuen Eintrag
 * für denselben Issue-Scope. Reine Begleitdoku zählt nicht zweit (kein zweiter Eintrag
 * für dieselbe Änderung).
 *
 * Eintragsformat (v1, flach und stabil):
 *   {
 *     id:        "chg-YYYYMMDD-NN",   eindeutig, zugleich der Anker (#chg-20260805-01)
 *     datum:     "YYYY-MM-DD",        muss zum Datumsteil der id passen
 *     typ:       "feature"|"fix"|"doku"|"intern",
 *     issue:     <positive Ganzzahl>, GitHub-Issue-Nummer dieses Repos
 *     titel:     "…",                 EINE verständliche Zeile, max. 120 Zeichen
 *     testbitte: "…"                  optional, EINE Zeile, max. 240 Zeichen
 *   }
 *
 * Reihenfolge: NEU -> ALT (streng absteigend nach datum, dann nach laufender Nummer).
 *
 * ACHTUNG — dieses Repo ist öffentlich: keine E-Mail-Adressen, keine Tokens, keine
 * absoluten lokalen Pfade, keine kopierten Issue-Bodies. `tests/module/test-blog.mjs`
 * prüft das maschinell.
 */

/** Formatname des Austauschformats (getrennt von PROJEKT_/KATALOG_/SCHEMA_VERSION). */
export const BLOG_FORMAT = "SEMBLA-Blog";

/** Formatversion der Änderungsliste. */
export const BLOG_VERSION = 1;

/** @typedef {{id:string,datum:string,typ:string,issue:number,titel:string,testbitte?:string}} BlogEintrag */

/** @type {BlogEintrag[]} */
export const EINTRAEGE = [
  {
    id: "chg-20260806-05",
    datum: "2026-08-06",
    typ: "feature",
    issue: 49,
    titel: "Zuschnitt-Farben überall gleich: Baugruppenbilder zeigen die Stückarten jetzt mit",
    testbitte: "Reiter 5: die Gewindestangen der Baugruppenbilder sind stückweise gefärbt "
      + "(Standardlänge, Sonderzuschnitt, Reststück) und haben eine Zuschnitt-Legende — dieselben "
      + "Farben wie in der Wandansicht (Reiter 1) und der Zeichnung (Reiter 7)?",
  },
  {
    id: "chg-20260806-04",
    datum: "2026-08-06",
    typ: "fix",
    issue: 19,
    titel: "Reststück und Zuschnitt sind jetzt auch in der technischen Zeichnung sichtbar",
    testbitte: "Reiter 7: die Stränge zeigen Standardlänge, Sonderzuschnitt und Reststück in "
      + "drei Farben (Legende darunter), und die Vorspann-Tabelle nennt „Reststück oben“ "
      + "getrennt von den Sonderlängen.",
  },
  {
    id: "chg-20260806-03",
    datum: "2026-08-06",
    typ: "feature",
    issue: 21,
    titel: "Bauteilkatalog belegt die Produkte selbst vor; keine Zuschnitt-Auswahl, eine Kopplungsmutter",
    testbitte: "Reiter 0: eine neue Wand anlegen — der Standardkatalog wird bei Bedarf geladen und "
      + "alle Verwendungsstellen sind vorbelegt. In Reiter 1/2 ist alles frei umwählbar; die Auswahl "
      + "für das Ausgangsprodukt der Sonderzuschnitte ist weg.",
  },
  {
    id: "chg-20260806-02",
    datum: "2026-08-06",
    typ: "feature",
    issue: 19,
    titel: "Modul 1 zeigt den Zuschnitt direkt in der Wandansicht; Feld für die Stangenlänge ist weg",
    testbitte: "Reiter 1: die Vorspannstränge sind jetzt in ihre echten Stücke zerlegt "
      + "(Standardlänge, Sonderzuschnitt, Reststück, Kopplungen) — beim Ändern der Wandhöhe sieht "
      + "man die Zerlegung sofort mitwandern.",
  },
  {
    id: "chg-20260806-01",
    datum: "2026-08-06",
    typ: "feature",
    issue: 19,
    titel: "Gewindestangen enden oben mit einem kurzen Reststück aus dem Katalog",
    testbitte: "Reiter 1: im Bauteilkatalog ein Reststück-Produkt für die Rolle „Gewindestange – "
      + "Reststück\" wählen. Jeder Strang an der Wandoberkante endet dann damit; ohne Auswahl wird "
      + "der obere Abschluss als offen gemeldet statt eine Länge zu erfinden.",
  },
  {
    id: "chg-20260805-02",
    datum: "2026-08-05",
    typ: "feature",
    issue: 48,
    titel: "Projektstatus zeigt bei „Entscheidung nötig\" und „Blockiert\" die offene Frage direkt",
    testbitte: "Reiter 8, Ansicht Projektstatus: steht bei den Gruppen Entscheidung nötig und "
      + "Blockiert die kurze Frage samt Empfehlung in der Karte — ohne den Issue zu öffnen?",
  },
  {
    id: "chg-20260805-01",
    datum: "2026-08-05",
    typ: "feature",
    issue: 48,
    titel: "Neues Modul: Projektblog mit Änderungsliste und Projektstatus",
    testbitte: "Reiter 8 (Blog) in der App aufrufen, beide Ansichten durchsehen und einen "
      + "Link der Form #issue-31 öffnen — springt die Seite zur richtigen Karte?",
  },
];
