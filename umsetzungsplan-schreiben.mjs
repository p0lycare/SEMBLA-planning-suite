#!/usr/bin/env node
// SEMBLA — Schreibschritt des Umsetzungsplans (Modul 8, Issue #55).
//
// Der Cron baut in Phase A/C ein Plan-Objekt und uebergibt es hier als JSON. Dieses
// Skript ist die EINZIGE Stelle, die `docs/shared/umsetzungsplan.js` schreibt — und es
// schreibt nur, wenn sich der Plan INHALTLICH geaendert hat.
//
//   1. JSON lesen (Datei, --plan <pfad> oder stdin)
//   2. `pruefePlan(..., {signatur:false})` — ein ungueltiger Plan wird NIE geschrieben
//   3. `planSignatur()` gegen die Signatur des vorhandenen Artefakts halten
//   4. gleich  ⇒ „unveraendert", KEIN Dateischreibvorgang, Exitcode 0
//      ungleich ⇒ `stand` und `signatur` setzen, Datei schreiben, Exitcode 0
//
// Damit ist der reine Zeitstempel-Commit mechanisch ausgeschlossen: `stand` bewegt sich
// ausschliesslich zusammen mit der Signatur. Wer die Datei von Hand anfasst, faellt in
// `tests/module/test-umsetzungsplan.mjs` durch.
//
// Aufruf:
//   node umsetzungsplan-schreiben.mjs --plan plan.json
//   cat plan.json | node umsetzungsplan-schreiben.mjs
//   node umsetzungsplan-schreiben.mjs --plan plan.json --stand 2026-08-11 --ziel /tmp/x.js
//   node umsetzungsplan-schreiben.mjs --plan plan.json --pruefen     (nur pruefen)
//
// Exitcodes: 0 = geschrieben oder unveraendert · 2 = ungueltiger Plan · 3 = Aufruffehler.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pruefePlan, planSignatur, rendereDatei } from "./docs/shared/sembla-umsetzungsplan.js";

const ZIEL_STD = fileURLToPath(new URL("./docs/shared/umsetzungsplan.js", import.meta.url));

/** Argumente einlesen (bewusst simpel — kein Fremdpaket). */
function argumente(argv) {
  const a = { plan: null, stand: null, ziel: ZIEL_STD, pruefen: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--plan" || k === "--stand" || k === "--ziel") {
      const w = argv[++i];
      if (w === undefined) { throw new Error(`${k} braucht einen Wert`); }
      a[k.slice(2)] = w;
    } else if (k === "--pruefen") { a.pruefen = true; }
    else { throw new Error(`unbekanntes Argument: ${k}`); }
  }
  return a;
}

/** Heutiges Datum als YYYY-MM-DD (lokal) — nur relevant, wenn wirklich geschrieben wird. */
function heute() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Signatur des vorhandenen Artefakts textuell lesen.
 * Bewusst KEIN Import: beim Erstlauf gibt es die Datei noch nicht, und eine kaputte
 * Datei soll den Schreibschritt nicht mit einem Syntaxfehler abbrechen — sie gilt dann
 * schlicht als „keine Signatur" und wird ersetzt.
 */
export function vorhandeneSignatur(pfad) {
  if (!existsSync(pfad)) return null;
  const m = /"signatur"\s*:\s*"([0-9a-f]{8})"/.exec(readFileSync(pfad, "utf8"));
  return m ? m[1] : null;
}

/**
 * Der eigentliche Ablauf — als Funktion, damit die Tests ihn ohne Prozessstart fahren.
 * @returns {{ergebnis:"geschrieben"|"unveraendert"|"ungueltig", signatur?:string,
 *            fehler?:{feld:string,meldung:string}[], inhalt?:string}}
 */
export function schreibe(planRoh, { stand = null, ziel = ZIEL_STD, pruefen = false } = {}) {
  // `stand` und `signatur` gehoeren dem Schreibschritt, nicht der Eingabe: ein
  // mitgeliefertes Datum oder ein mitgelieferter Hash wird verworfen, damit niemand
  // an der Signaturpruefung vorbeischreiben kann.
  const kern = { ...(planRoh && typeof planRoh === "object" ? planRoh : {}) };
  delete kern.stand;
  delete kern.signatur;

  const kandidat = { ...kern, stand: stand || heute() };
  const pruefung = pruefePlan(kandidat, { signatur: false });
  if (!pruefung.ok) return { ergebnis: "ungueltig", fehler: pruefung.fehler };

  const signatur = planSignatur(kandidat);      // `stand` geht in die Signatur nicht ein
  const alt = vorhandeneSignatur(ziel);
  if (alt === signatur) return { ergebnis: "unveraendert", signatur };

  const plan = { ...kandidat, signatur };
  const inhalt = rendereDatei(plan);

  // Gegenprobe: das, was gleich auf der Platte liegt, muss den vollen Validator
  // bestehen — einschliesslich der Signaturpruefung. Sonst wird nichts geschrieben.
  const nach = pruefePlan(plan);
  if (!nach.ok) return { ergebnis: "ungueltig", fehler: nach.fehler };

  if (!pruefen) writeFileSync(ziel, inhalt, "utf8");
  return { ergebnis: "geschrieben", signatur, inhalt };
}

// --- Prozesseinstieg (nur bei direktem Aufruf) -----------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let a;
  try { a = argumente(process.argv.slice(2)); }
  catch (e) { console.error(`Aufruffehler: ${e.message}`); process.exit(3); }

  let roh;
  try {
    roh = a.plan ? readFileSync(a.plan, "utf8") : readFileSync(0, "utf8");
  } catch (e) {
    console.error(`Plan-JSON nicht lesbar: ${e.message}`); process.exit(3);
  }
  let planRoh;
  try { planRoh = JSON.parse(roh); }
  catch (e) { console.error(`Plan-JSON ist kein gueltiges JSON: ${e.message}`); process.exit(3); }

  const r = schreibe(planRoh, a);
  if (r.ergebnis === "ungueltig") {
    console.error("Plan ungueltig — es wurde NICHTS geschrieben:");
    for (const f of r.fehler) console.error(`  ${f.feld}: ${f.meldung}`);
    process.exit(2);
  }
  if (r.ergebnis === "unveraendert") {
    console.log(`unveraendert (Signatur ${r.signatur}) — keine Datei geschrieben, kein Commit noetig.`);
    process.exit(0);
  }
  console.log(a.pruefen
    ? `gueltig (Signatur ${r.signatur}) — --pruefen, deshalb nicht geschrieben.`
    : `geschrieben (Signatur ${r.signatur}): ${a.ziel}`);
  process.exit(0);
}
