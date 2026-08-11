// Fokussierter Test: Schreibschritt des Umsetzungsplans (Modul 8, Issue #55).
//
// Prueft umsetzungsplan-schreiben.mjs — die EINZIGE Stelle, die das Artefakt schreibt.
// Der Kern ist die Zusicherung, die den reinen Zeitstempel-Commit unmoeglich macht:
//   * gleicher Inhalt ⇒ „unveraendert", KEIN Dateischreibvorgang, auch wenn ein
//     anderer `stand` uebergeben wird,
//   * geaenderter Inhalt ⇒ neue Signatur, neuer Stand, geschriebene Datei,
//   * ungueltiger Plan ⇒ es wird NICHTS geschrieben (auch keine halbe Datei),
//   * `stand`/`signatur` aus der Eingabe werden verworfen — niemand schreibt an der
//     Signaturpruefung vorbei,
//   * die geschriebene Datei ist bytestabil und besteht den vollen Validator,
//   * die Prozessschnittstelle (JSON-Datei, stdin, Exitcodes) verhaelt sich wie
//     dokumentiert.
//
// Checkout-autark: geschrieben wird ausschliesslich in ein temporaeres Verzeichnis,
// das produktive Artefakt wird NIE angefasst.

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { schreibe, vorhandeneSignatur } from "../../umsetzungsplan-schreiben.mjs";
import { pruefePlan, planSignatur, rendereDatei } from "../../docs/shared/sembla-umsetzungsplan.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

const SKRIPT = fileURLToPath(new URL("../../umsetzungsplan-schreiben.mjs", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sembla-plan-"));
const ziel = join(tmp, "umsetzungsplan.js");
const planDatei = join(tmp, "plan.json");

const E = (issue, patch = {}) => ({
  issue, titel: `Issue ${issue}`, prio: "high", status: "ready",
  sicherheit: false, abhaengig_von: [], zyklus: true, ...patch,
});
const KERN = {
  entscheidungen: [],
  naechstes: E(6, { begruendung: "Weil es die Voraussetzung fuer alles andere ist." }),
  weitere: [E(7, { abhaengig_von: [6] })],
  blockiert: [],
};

try {
  // --- 1) Erstlauf: es gibt noch kein Artefakt --------------------------
  ok("ohne Datei gibt es keine vorhandene Signatur", vorhandeneSignatur(ziel) === null);
  const r1 = schreibe(KERN, { stand: "2026-08-11", ziel });
  ok("Erstlauf schreibt", r1.ergebnis === "geschrieben" && existsSync(ziel));
  ok("die geschriebene Signatur ist die berechnete",
    r1.signatur === planSignatur(KERN) && /^[0-9a-f]{8}$/.test(r1.signatur));
  const inhalt1 = readFileSync(ziel, "utf8");
  ok("die Datei traegt Stand und Signatur",
    inhalt1.includes('"stand": "2026-08-11"') && inhalt1.includes(`"signatur": "${r1.signatur}"`));
  ok("die Datei traegt Formatname und -version",
    /export const PLAN_FORMAT = "SEMBLA-Umsetzungsplan";/.test(inhalt1)
    && /export const PLAN_VERSION = 1;/.test(inhalt1));

  // --- 2) Der Kern: gleicher Inhalt ⇒ kein Schreibvorgang ---------------
  const r2 = schreibe(KERN, { stand: "2027-01-01", ziel });
  ok("gleicher Inhalt ⇒ unveraendert, auch mit anderem Stand", r2.ergebnis === "unveraendert");
  ok("und die Datei wurde dabei NICHT angefasst — kein Zeitstempel-Commit",
    readFileSync(ziel, "utf8") === inhalt1 && !inhalt1.includes("2027-01-01"));
  ok("Schluesselreihenfolge der Eingabe aendert nichts",
    schreibe({ blockiert: KERN.blockiert, weitere: KERN.weitere,
      naechstes: KERN.naechstes, entscheidungen: KERN.entscheidungen },
      { stand: "2027-01-01", ziel }).ergebnis === "unveraendert");
  ok("blosser Whitespace in der Prosa aendert nichts",
    schreibe({ ...KERN, naechstes: { ...KERN.naechstes,
      begruendung: "  Weil es die   Voraussetzung fuer alles andere ist.  " } },
      { stand: "2027-01-01", ziel }).ergebnis === "unveraendert");

  // --- 3) Inhaltliche Aenderung ⇒ neu schreiben ------------------------
  const geaendert = { ...KERN, naechstes: { ...KERN.naechstes, begruendung: "Ein anderer Grund." } };
  const r3 = schreibe(geaendert, { stand: "2026-08-12", ziel });
  ok("geaenderte Prosa ⇒ geschrieben", r3.ergebnis === "geschrieben" && r3.signatur !== r1.signatur);
  const inhalt3 = readFileSync(ziel, "utf8");
  ok("erst jetzt bewegt sich auch der Stand",
    inhalt3.includes('"stand": "2026-08-12"') && inhalt3.includes("Ein anderer Grund."));

  // --- 4) Ungueltiger Plan ⇒ NICHTS schreiben --------------------------
  const vorher = readFileSync(ziel, "utf8");
  const rU = schreibe({ ...KERN, naechstes: { ...KERN.naechstes, prio: "hoch" } }, { ziel });
  ok("unbekannte Prioritaet macht den Plan ungueltig",
    rU.ergebnis === "ungueltig" && rU.fehler.some(f => /prio unbekannt/.test(f.meldung)));
  ok("und es wurde dabei nichts geschrieben", readFileSync(ziel, "utf8") === vorher);
  const rL = schreibe({ ...KERN, weitere: [E(9), E(7)] }, { ziel });
  ok("falsche Reihenfolge wird abgewiesen statt still sortiert",
    rL.ergebnis === "ungueltig" && rL.fehler.some(f => /Reihenfolge weicht/.test(f.meldung)));
  ok("ein Lieblings-naechstes wird abgewiesen",
    schreibe({ ...KERN, naechstes: E(9, { begruendung: "Weil ich will." }), weitere: [E(6)] },
      { ziel }).ergebnis === "ungueltig");
  ok("verbotener Inhalt (E-Mail) wird abgewiesen",
    schreibe({ ...KERN, naechstes: { ...KERN.naechstes, begruendung: "Frag a.b@c.de" } },
      { ziel }).ergebnis === "ungueltig");
  ok("kaputter Plan wird abgewiesen statt geschrieben",
    schreibe(null, { ziel }).ergebnis === "ungueltig"
    && schreibe({}, { ziel }).ergebnis === "ungueltig");
  ok("nach allen Fehlversuchen ist die Datei unveraendert", readFileSync(ziel, "utf8") === vorher);

  // --- 5) stand/signatur der Eingabe werden verworfen ------------------
  const rF = schreibe({ ...KERN, stand: "1999-01-01", signatur: "deadbeef" },
    { stand: "2026-08-13", ziel });
  ok("mitgelieferte Signatur wird ignoriert — kein Vorbeischreiben an der Pruefung",
    rF.ergebnis === "geschrieben" && rF.signatur === planSignatur(KERN)
    && !readFileSync(ziel, "utf8").includes("deadbeef")
    && !readFileSync(ziel, "utf8").includes("1999-01-01"));

  // --- 6) Die geschriebene Datei ist gueltig und bytestabil ------------
  const modul = await import("file://" + ziel + "?v=6");
  const gelesen = modul.PLAN;
  const nach = pruefePlan(gelesen);
  ok("die geschriebene Datei besteht den vollen Validator inkl. Signatur", nach.ok);
  ok("die geschriebene Datei ist byteidentisch zu ihrer Neuerzeugung",
    readFileSync(ziel, "utf8") === rendereDatei(gelesen));
  ok("vorhandeneSignatur liest die Signatur aus der Datei",
    vorhandeneSignatur(ziel) === gelesen.signatur);

  // --- 7) --pruefen schreibt nicht -------------------------------------
  const rP = schreibe({ ...KERN, naechstes: { ...KERN.naechstes, begruendung: "Wieder anders." } },
    { ziel, pruefen: true, stand: "2026-08-14" });
  ok("--pruefen meldet gueltig, schreibt aber nicht",
    rP.ergebnis === "geschrieben" && !readFileSync(ziel, "utf8").includes("Wieder anders."));

  // --- 8) Prozessschnittstelle und Exitcodes ---------------------------
  const lauf = (args, eingabe) => {
    try {
      return { code: 0, aus: execFileSync(process.execPath, [SKRIPT, ...args],
        { input: eingabe, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
    } catch (e) { return { code: e.status, aus: (e.stdout || "") + (e.stderr || "") }; }
  };
  const ziel2 = join(tmp, "cli.js");
  writeFileSync(planDatei, JSON.stringify(KERN), "utf8");

  const c1 = lauf(["--plan", planDatei, "--ziel", ziel2, "--stand", "2026-08-11"]);
  ok("CLI schreibt beim Erstlauf und meldet es", c1.code === 0 && /geschrieben/.test(c1.aus));
  const c2 = lauf(["--plan", planDatei, "--ziel", ziel2, "--stand", "2030-05-05"]);
  ok("CLI meldet unveraendert sauber mit Exitcode 0",
    c2.code === 0 && /unveraendert/.test(c2.aus) && /kein Commit/.test(c2.aus));
  ok("und hat die Datei dabei nicht angefasst", !readFileSync(ziel2, "utf8").includes("2030-05-05"));

  const c3 = lauf(["--ziel", join(tmp, "stdin.js"), "--stand", "2026-08-11"], JSON.stringify(KERN));
  ok("CLI nimmt den Plan auch ueber stdin", c3.code === 0 && /geschrieben/.test(c3.aus));

  writeFileSync(join(tmp, "kaputt.json"), JSON.stringify({ ...KERN, naechstes: { ...KERN.naechstes, prio: "hoch" } }), "utf8");
  const c4 = lauf(["--plan", join(tmp, "kaputt.json"), "--ziel", join(tmp, "nie.js")]);
  ok("ungueltiger Plan ⇒ Exitcode 2, benannte Fehler, keine Datei",
    c4.code === 2 && /Plan ungueltig/.test(c4.aus) && /prio unbekannt/.test(c4.aus)
    && !existsSync(join(tmp, "nie.js")));

  writeFileSync(join(tmp, "kein.json"), "{ das ist kein json", "utf8");
  ok("kaputtes JSON ⇒ Exitcode 3", lauf(["--plan", join(tmp, "kein.json")]).code === 3);
  ok("unbekanntes Argument ⇒ Exitcode 3", lauf(["--quatsch"]).code === 3);
  ok("fehlender Argumentwert ⇒ Exitcode 3", lauf(["--plan"]).code === 3);

  // --- 9) Der Schreiber fasst nur sein Ziel an -------------------------
  const src = readFileSync(SKRIPT, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok("der Schreiber kennt genau einen Schreibaufruf",
    (src.match(/writeFileSync\(/g) || []).length === 1);
  ok("der Schreiber ruft nichts ab und kennt keine Zugangsdaten",
    !/fetch\(|api\.github\.com|Authorization|execSync|spawn/i.test(src));
  ok("der Schreiber fuehrt keine Git-Aktion aus", !/\bgit\b/.test(src));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
