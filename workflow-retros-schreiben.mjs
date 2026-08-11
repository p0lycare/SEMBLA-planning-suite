#!/usr/bin/env node
// SEMBLA — Schreibschritt der Workflow-Retros (Modul 8, Issue #65).
//
// Der Retro-Cron bewertet ausschliesslich bereits VEROEFFENTLICHTE Umsetzungsruns und
// uebergibt die bereits sanitisierten Einzelrun-Felder hier als JSON. Dieses Skript ist
// die EINZIGE Stelle, die `docs/shared/workflow-retros.js` schreibt.
//
//   1. JSON lesen (Datei, --runs <pfad> oder stdin) — Liste oder { runs: [...] }
//   2. `pruefeRetros()` — ein ungueltiger Datensatz wird NIE geschrieben, auch nicht halb
//   3. Datei rendern und mit dem vorhandenen Artefakt vergleichen
//   4. gleich  ⇒ „unveraendert", KEIN Dateischreibvorgang, Exitcode 0
//      ungleich ⇒ Datei schreiben, Exitcode 0
//
// DER VALIDATOR IST DER DATENSCHUTZ. Er nimmt ausschliesslich die deklarierten Felder aus
// `FELDER`; jedes unbekannte Feld ist ein harter Fehler — genau so kann keine
// Sitzungskennung, kein Pfad, kein Prompt- oder Issue-Rohtext und kein Log versehentlich
// mitreisen. Jeder Freitext laeuft zusaetzlich durch den Textwaechter des Repos
// (E-Mails, Tokens, absolute Pfade, mehrzeiliger Text) und die Retro-Verbote
// (Sitzungskennungen, Dateipfade). Fehlende Werte bleiben `null` und werden nicht geraten.
//
// Es gibt bewusst KEIN Zeitstempelfeld: gleiche Runs ⇒ bytegleiche Datei ⇒ kein
// Zeitstempel-Commit. Der „Stand" der Ansicht wird aus dem neuesten Run abgeleitet.
//
// Aufruf:
//   node workflow-retros-schreiben.mjs --runs runs.json
//   cat runs.json | node workflow-retros-schreiben.mjs
//   node workflow-retros-schreiben.mjs --runs runs.json --ziel /tmp/x.js --pruefen
//
// Exitcodes: 0 = geschrieben oder unveraendert · 2 = ungueltige Daten · 3 = Aufruffehler.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pruefeRetros, rendereDatei, ordneRuns } from "./docs/shared/sembla-workflow-retros.js";

const ZIEL_STD = fileURLToPath(new URL("./docs/shared/workflow-retros.js", import.meta.url));

/** Argumente einlesen (bewusst simpel — kein Fremdpaket). */
function argumente(argv) {
  const a = { runs: null, ziel: ZIEL_STD, pruefen: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--runs" || k === "--ziel") {
      const w = argv[++i];
      if (w === undefined) throw new Error(`${k} braucht einen Wert`);
      a[k.slice(2)] = w;
    } else if (k === "--pruefen") a.pruefen = true;
    else throw new Error(`unbekanntes Argument: ${k}`);
  }
  return a;
}

/** Liste der Runs aus der Eingabe holen (Liste oder { runs: [...] }). */
export function runsAus(roh) {
  if (Array.isArray(roh)) return roh;
  if (roh && typeof roh === "object" && Array.isArray(roh.runs)) return roh.runs;
  return null;
}

/**
 * Der eigentliche Ablauf — als Funktion, damit die Tests ihn ohne Prozessstart fahren.
 * @returns {{ergebnis:"geschrieben"|"unveraendert"|"ungueltig",
 *            fehler?:{feld:string,meldung:string}[], inhalt?:string, runs?:number}}
 */
export function schreibe(roh, { ziel = ZIEL_STD, pruefen = false } = {}) {
  const runs = runsAus(roh);
  if (runs === null) {
    return { ergebnis: "ungueltig",
      fehler: [{ feld: "runs", meldung: "die Eingabe ist keine Liste von Runs" }] };
  }

  // Geordnet geprueft: die Reihenfolge „neu -> alt" ist Teil der Zusicherung, und die
  // Datei wird ohnehin geordnet gerendert.
  const geordnet = ordneRuns(runs);
  const pruefung = pruefeRetros(geordnet);
  if (!pruefung.ok) return { ergebnis: "ungueltig", fehler: pruefung.fehler };

  const inhalt = rendereDatei(geordnet);
  const alt = existsSync(ziel) ? readFileSync(ziel, "utf8") : null;
  if (alt === inhalt) return { ergebnis: "unveraendert", runs: geordnet.length };

  if (!pruefen) writeFileSync(ziel, inhalt, "utf8");
  return { ergebnis: "geschrieben", inhalt, runs: geordnet.length };
}

// --- Prozesseinstieg (nur bei direktem Aufruf) -----------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let a;
  try { a = argumente(process.argv.slice(2)); }
  catch (e) { console.error(`Aufruffehler: ${e.message}`); process.exit(3); }

  let roh;
  try { roh = a.runs ? readFileSync(a.runs, "utf8") : readFileSync(0, "utf8"); }
  catch (e) { console.error(`Retro-JSON nicht lesbar: ${e.message}`); process.exit(3); }

  let daten;
  try { daten = JSON.parse(roh); }
  catch (e) { console.error(`Retro-JSON ist kein gueltiges JSON: ${e.message}`); process.exit(3); }

  const r = schreibe(daten, a);
  if (r.ergebnis === "ungueltig") {
    console.error("Retro-Daten ungueltig — es wurde NICHTS geschrieben:");
    for (const f of r.fehler) console.error(`  ${f.feld}: ${f.meldung}`);
    process.exit(2);
  }
  if (r.ergebnis === "unveraendert") {
    console.log(`unveraendert (${r.runs} Runs) — keine Datei geschrieben, kein Commit noetig.`);
    process.exit(0);
  }
  console.log(a.pruefen
    ? `gueltig (${r.runs} Runs) — --pruefen, deshalb nicht geschrieben.`
    : `geschrieben (${r.runs} Runs): ${a.ziel}`);
  process.exit(0);
}
