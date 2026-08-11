// Fokussierter Test: Schreibschritt der Workflow-Retros (Modul 8, Issue #65).
//
// Prueft workflow-retros-schreiben.mjs — die EINZIGE Stelle, die das Retro-Artefakt
// schreibt. Der Kern sind zwei Zusicherungen:
//   * DETERMINISMUS: dasselbe sanitisierte Fixture ergibt zweimal die bytegleiche Datei,
//     und ein zweiter Lauf schreibt gar nicht („unveraendert"),
//   * DATENSCHUTZ: jedes unbekannte Feld und jeder verbotene Inhalt (Sitzungskennung,
//     Dateipfad, absoluter Pfad, E-Mail, Token, mehrzeiliges Log) ist ein HARTER Fehler,
//     und es wird dabei nichts geschrieben — auch nicht halb.
//
// Checkout-autark: geschrieben wird ausschliesslich in ein temporaeres Verzeichnis, das
// produktive Artefakt wird NIE angefasst.

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { schreibe, runsAus } from "../../workflow-retros-schreiben.mjs";
import { pruefeRetros, rendereDatei, FELDER } from "../../docs/shared/sembla-workflow-retros.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

const SKRIPT = fileURLToPath(new URL("../../workflow-retros-schreiben.mjs", import.meta.url));
const ARTEFAKT = fileURLToPath(new URL("../../docs/shared/workflow-retros.js", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sembla-retro-"));
const ziel = join(tmp, "workflow-retros.js");
const runsDatei = join(tmp, "runs.json");

/** Sanitisiertes Fixture — genau die deklarierten Felder, nichts Internes. */
const RUN = (nr, patch = {}) => ({
  paket: `wp-2026-08-11-fixture-${nr}`, nr, datum: "2026-08-11",
  titel: `Fixture-Run ${nr}`, issues: [200 + nr],
  commit: "abcdef0123456789abcdef0123456789abcdef01",
  ergebnis: "beobachten", nutzerergebnis: `Nutzerergebnis ${nr}.`, veroeffentlicht: true,
  laufzeit_s: 700 + nr, reflexions_turns: 6, implementierungs_turns: 12,
  korrektur_turns: 0, korrektur_runden: 0, diff_dateien: 4, diff_plus: 40, diff_minus: 5,
  test_wiederholungen: 0, verdeckte_exitcodes: 0, teststatus: "Fokustest gruen, Gesamtlauf gruen.",
  erkenntnisse: ["Eine knappe, sanitisierte Erkenntnis."], ...patch,
});
const FIXTURE = [RUN(2, { ergebnis: "beibehalten" }), RUN(1)];

try {
  // --- 1) Erstlauf und Determinismus ----------------------------------
  ok("das Fixture ist gueltig", pruefeRetros(FIXTURE).ok);
  const r1 = schreibe(FIXTURE, { ziel });
  ok("Erstlauf schreibt", r1.ergebnis === "geschrieben" && existsSync(ziel) && r1.runs === 2);
  const inhalt1 = readFileSync(ziel, "utf8");
  ok("die Datei traegt Formatname und -version",
    /export const RETRO_FORMAT = "SEMBLA-Workflow-Retros";/.test(inhalt1)
    && /export const RETRO_VERSION = 1;/.test(inhalt1));
  ok("die Datei ist byteidentisch zur Neuerzeugung", inhalt1 === rendereDatei(FIXTURE));

  const zielB = join(tmp, "zweitlauf.js");
  schreibe(FIXTURE, { ziel: zielB });
  ok("dasselbe Fixture ergibt zweimal die bytegleiche Datei",
    readFileSync(zielB, "utf8") === inhalt1);
  const r2 = schreibe(FIXTURE, { ziel });
  ok("gleiche Daten ⇒ unveraendert, KEIN Dateischreibvorgang",
    r2.ergebnis === "unveraendert" && readFileSync(ziel, "utf8") === inhalt1);
  ok("es gibt kein Zeitstempelfeld, das sich von allein bewegen koennte",
    !/stand|erzeugt_am|timestamp|generated/i.test(inhalt1.replace(/^\s*\*.*$/gm, "")));

  // --- 2) Ordnung und Eingabeformen -----------------------------------
  const zielC = join(tmp, "unsortiert.js");
  const rU = schreibe(FIXTURE.slice().reverse(), { ziel: zielC });
  ok("unsortierte Eingabe wird geordnet geschrieben (neu -> alt)",
    rU.ergebnis === "geschrieben" && readFileSync(zielC, "utf8") === inhalt1);
  ok("die Eingabe darf Liste oder { runs: [...] } sein",
    runsAus(FIXTURE) === FIXTURE && runsAus({ runs: FIXTURE }) === FIXTURE
    && runsAus(null) === null && runsAus({}) === null && runsAus("x") === null);
  ok("eine Nicht-Liste wird abgewiesen",
    schreibe(null, { ziel }).ergebnis === "ungueltig"
    && schreibe({ foo: 1 }, { ziel }).ergebnis === "ungueltig"
    && schreibe([], { ziel }).ergebnis === "ungueltig");

  // --- 3) Datenschutz: harte Fehler, kein Schreibvorgang --------------
  const vorher = readFileSync(ziel, "utf8");
  const nie = join(tmp, "nie-geschrieben.js");
  const verboten = [
    ["unbekanntes Feld", { session_id: "ce143416-1561-499d-af42-88c3f56b5954" }],
    ["zweites unbekanntes Feld", { changed_paths: ["docs/blog.html"] }],
    ["Prompt-Rohtext als Zusatzfeld", { prompt: "Bitte implementiere ..." }],
    ["Sitzungskennung im Text",
      { nutzerergebnis: "Sitzung ce143416-1561-499d-af42-88c3f56b5954 fertig." }],
    ["Dateipfad im Text", { teststatus: "tests/module/smoke_blog.mjs gruen." }],
    ["absoluter lokaler Pfad", { nutzerergebnis: "Lag unter /home/nutzer/repo." }],
    ["E-Mail-Adresse", { nutzerergebnis: "Rueckfragen an a.b@c.de" }],
    ["Token", { teststatus: "token: ghp_0123456789abcdef" }],
    ["mehrzeiliges Log", { teststatus: "Lauf 1 gruen\nLauf 2 rot" }],
    ["kopierter Issue-Body", { nutzerergebnis: "## Nutzerziel aus dem Issue" }],
    ["Dateipfad in einer Erkenntnis", { erkenntnisse: ["Siehe docs/shared/storage.js."] }],
    ["vierte Erkenntnis", { erkenntnisse: ["a.", "b.", "c.", "d."] }],
    ["erfundene Klassifikation", { ergebnis: "teilweise" }],
    ["geratener Nullwert statt null", { laufzeit_s: 0 }],
  ];
  let alleAbgewiesen = true, keinSchreibvorgang = true;
  for (const [name, patch] of verboten) {
    const r = schreibe([RUN(1, patch)], { ziel: nie });
    if (r.ergebnis !== "ungueltig" || !r.fehler.length) {
      alleAbgewiesen = false; console.log(`      (nicht abgewiesen: ${name})`);
    }
    if (existsSync(nie)) keinSchreibvorgang = false;
  }
  ok("jedes verbotene oder unbekannte Feld ist ein harter Fehler", alleAbgewiesen);
  ok("dabei wurde keine Datei angelegt", keinSchreibvorgang && !existsSync(nie));
  ok("und das vorhandene Artefakt blieb unveraendert", readFileSync(ziel, "utf8") === vorher);
  ok("der Fehler wird benannt, nicht verschwiegen", (() => {
    const r = schreibe([RUN(1, { session_id: "x" })], { ziel: nie });
    return r.fehler.some(f => /unbekanntes Feld: session_id/.test(f.meldung));
  })());
  ok("ein einziger fehlerhafter Run verhindert den ganzen Schreibvorgang", (() => {
    const r = schreibe([RUN(2), RUN(1, { commit: "kurz" })], { ziel: nie });
    return r.ergebnis === "ungueltig" && !existsSync(nie);
  })());

  // --- 4) --pruefen schreibt nicht ------------------------------------
  const rP = schreibe([RUN(3), RUN(2), RUN(1)], { ziel, pruefen: true });
  ok("--pruefen meldet gueltig, schreibt aber nicht",
    rP.ergebnis === "geschrieben" && readFileSync(ziel, "utf8") === vorher);

  // --- 5) Prozessschnittstelle und Exitcodes -------------------------
  const lauf = (args, eingabe) => {
    try {
      return { code: 0, aus: execFileSync(process.execPath, [SKRIPT, ...args],
        { input: eingabe, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
    } catch (e) { return { code: e.status, aus: (e.stdout || "") + (e.stderr || "") }; }
  };
  const zielCli = join(tmp, "cli.js");
  writeFileSync(runsDatei, JSON.stringify(FIXTURE), "utf8");

  const c1 = lauf(["--runs", runsDatei, "--ziel", zielCli]);
  ok("CLI schreibt beim Erstlauf und meldet es", c1.code === 0 && /geschrieben \(2 Runs\)/.test(c1.aus));
  const c2 = lauf(["--runs", runsDatei, "--ziel", zielCli]);
  ok("CLI meldet unveraendert sauber mit Exitcode 0",
    c2.code === 0 && /unveraendert/.test(c2.aus) && /kein Commit/.test(c2.aus));
  const c3 = lauf(["--ziel", join(tmp, "stdin.js")], JSON.stringify(FIXTURE));
  ok("CLI nimmt die Runs auch ueber stdin",
    c3.code === 0 && /geschrieben/.test(c3.aus)
    && readFileSync(join(tmp, "stdin.js"), "utf8") === inhalt1);

  writeFileSync(join(tmp, "kaputt.json"),
    JSON.stringify([RUN(1, { session_id: "geheim" })]), "utf8");
  const c4 = lauf(["--runs", join(tmp, "kaputt.json"), "--ziel", join(tmp, "nie2.js")]);
  ok("verbotene Daten ⇒ Exitcode 2, benannte Fehler, keine Datei",
    c4.code === 2 && /ungueltig/.test(c4.aus) && /session_id/.test(c4.aus)
    && !existsSync(join(tmp, "nie2.js")));

  writeFileSync(join(tmp, "kein.json"), "{ das ist kein json", "utf8");
  ok("kaputtes JSON ⇒ Exitcode 3", lauf(["--runs", join(tmp, "kein.json")]).code === 3);
  ok("unbekanntes Argument ⇒ Exitcode 3", lauf(["--quatsch"]).code === 3);
  ok("fehlender Argumentwert ⇒ Exitcode 3", lauf(["--runs"]).code === 3);
  ok("nicht lesbare Eingabedatei ⇒ Exitcode 3",
    lauf(["--runs", join(tmp, "gibtsnicht.json")]).code === 3);

  // --- 6) Der Schreiber fasst nur sein Ziel an -----------------------
  const src = readFileSync(SKRIPT, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok("der Schreiber kennt genau einen Schreibaufruf",
    (src.match(/writeFileSync\(/g) || []).length === 1);
  ok("der Schreiber ruft nichts ab und kennt keine Zugangsdaten",
    !/fetch\(|api\.github\.com|Authorization|execSync|spawn/i.test(src));
  ok("der Schreiber fuehrt keine Git-Aktion aus", !/\bgit\b/i.test(src));
  ok("der Schreiber liest keine lokalen Workflow-, Queue- oder Sessiondateien",
    !/retro-archive|runtime|manifest|queue|session/i.test(src));
  ok("der Schreiber uebernimmt genau die deklarierten Felder (keine eigene Liste)",
    !/paket|nutzerergebnis|erkenntnisse/.test(src) && /pruefeRetros|rendereDatei/.test(src)
    && FELDER.length === 21);
  ok("das produktive Artefakt wurde von diesem Test nicht angefasst",
    readFileSync(ARTEFAKT, "utf8").length > 0
    && readFileSync(ARTEFAKT, "utf8") !== inhalt1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
