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
    id: "chg-20260805-01",
    datum: "2026-08-05",
    typ: "feature",
    issue: 48,
    titel: "Neues Modul: Projektblog mit Änderungsliste und Projektstatus",
    testbitte: "Reiter 8 (Blog) in der App aufrufen, beide Ansichten durchsehen und einen "
      + "Link der Form #issue-31 öffnen — springt die Seite zur richtigen Karte?",
  },
];
