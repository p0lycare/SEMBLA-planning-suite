// Fokussierter Test: Workflow-Retros (Modul 8, Issue #65).
//
// Prueft den DOM-freien Baustein gegen ECHTE Daten (das ausgelieferte Artefakt) UND gegen
// synthetische Faelle. Schwerpunkte:
//   * genau die DREI kanonischen Klassifikationen, alle drei im Initialbestand belegt,
//   * Reihenfolge neu -> alt (streng), abweichende Eingabe wird abgewiesen statt sortiert,
//   * Kennzahlen unabhaengig nachgerechnet — inklusive der belegten Initialsummen,
//   * fehlende Werte bleiben `null`: keine 0, kein Mittelwert, kein Ersatz; jede Kennzahl
//     nennt ihren eigenen Nenner,
//   * hoechstens drei Erkenntnisse je Run,
//   * der Filter aendert nur die Karten, nie die Gesamtlage,
//   * Datenschutz: unbekannte Felder, Sitzungskennungen, Dateipfade, E-Mails, Tokens und
//     mehrzeiliger Text sind harte Fehler,
//   * das Artefakt ist byteidentisch zu seiner Neuerzeugung und enthaelt keinen
//     gespeicherten Aggregatwert.
//
// Checkout-autark: liest nur Repo-Dateien, schreibt nichts, ruft nichts ab.

import { readFileSync } from "node:fs";
import * as R from "../../docs/shared/sembla-workflow-retros.js";
import { RUNS, RETRO_FORMAT, RETRO_VERSION } from "../../docs/shared/workflow-retros.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const quelle = readFileSync(new URL("../../docs/shared/workflow-retros.js", import.meta.url), "utf8");

// Synthetischer Bestand: drei Klassifikationen, ein Run ohne belegte Zahlen.
const S = (nr, patch = {}) => ({
  paket: `wp-2026-08-0${nr}-synthetisch-${nr}`, nr, datum: "2026-08-05",
  titel: `Synthetischer Run ${nr}`, issues: [100 + nr],
  commit: String(nr).repeat(40).slice(0, 40).replace(/[^0-9a-f]/g, "a"),
  ergebnis: "beobachten", nutzerergebnis: `Ergebnis ${nr}.`, veroeffentlicht: true,
  laufzeit_s: 600, reflexions_turns: 5, implementierungs_turns: 10, korrektur_turns: 0,
  korrektur_runden: 0, diff_dateien: 3, diff_plus: 30, diff_minus: 3,
  test_wiederholungen: 1, verdeckte_exitcodes: 0, teststatus: "Fokustest gruen.",
  erkenntnisse: ["Eine knappe Erkenntnis."], ...patch,
});
const SYN = [
  S(3, { ergebnis: "beibehalten", laufzeit_s: 300, test_wiederholungen: 0 }),
  S(2, { ergebnis: "aenderung_vorschlagen", laufzeit_s: 900, test_wiederholungen: 5,
    verdeckte_exitcodes: 2 }),
  S(1, { laufzeit_s: null, korrektur_runden: null, test_wiederholungen: null,
    verdeckte_exitcodes: null, implementierungs_turns: null, korrektur_turns: null,
    diff_dateien: null, diff_plus: null, diff_minus: null, erkenntnisse: [] }),
];

// --- 1) Format und Vokabular ---------------------------------------------
ok("das Artefakt traegt Formatname und -version der eigenen Achse",
  RETRO_FORMAT === R.ERWARTET_FORMAT && RETRO_VERSION === R.ERWARTET_VERSION
  && R.pruefeFormat(RETRO_FORMAT, RETRO_VERSION).length === 0);
ok("fremdes Format/fremde Version werden benannt",
  R.pruefeFormat("SEMBLA-Projekt", 1).some(f => f.feld === "RETRO_FORMAT")
  && R.pruefeFormat(R.ERWARTET_FORMAT, 2).some(f => f.feld === "RETRO_VERSION"));
ok("es gibt genau drei Klassifikationen",
  Object.keys(R.KLASSIFIKATION_TEXT).length === 3
  && ["beibehalten", "beobachten", "aenderung_vorschlagen"]
    .every(k => k in R.KLASSIFIKATION_TEXT));
ok("jede Klassifikation hat einen Hinweistext",
  Object.keys(R.KLASSIFIKATION_TEXT).every(k => typeof R.KLASSIFIKATION_HINWEIS[k] === "string"));

// --- 2) Echte Daten sind gueltig und geordnet ----------------------------
const echt = R.pruefeRetros(RUNS);
ok("der ausgelieferte Bestand ist gueltig",
  echt.ok || (console.log(JSON.stringify(echt.fehler, null, 1)), false));
ok("der Bestand ist streng neu -> alt geordnet",
  RUNS.map(r => r.paket).join() === R.ordneRuns(RUNS).map(r => r.paket).join());
ok("alle drei Klassifikationen sind im Initialbestand belegt",
  new Set(RUNS.map(r => r.ergebnis)).size === 3);
ok("jeder Run nennt hoechstens drei Erkenntnisse",
  RUNS.every(r => r.erkenntnisse.length <= R.MAX_ERKENNTNISSE)
  && R.MAX_ERKENNTNISSE === 3);
ok("jeder Run traegt genau die deklarierten Felder",
  RUNS.every(r => Object.keys(r).length === R.FELDER.length
    && Object.keys(r).every(k => R.FELDER.includes(k))));
ok("jeder Run ist als veroeffentlicht mit vollem Commit-Hash belegt",
  RUNS.every(r => r.veroeffentlicht === true && /^[0-9a-f]{40}$/.test(r.commit)
    && r.issues.length >= 1));

// --- 3) Kennzahlen: unabhaengig nachgerechnet ----------------------------
const k = R.kennzahlen(RUNS);
const zSum = (feld) => RUNS.filter(r => Number.isInteger(r[feld]))
  .reduce((s, r) => s + r[feld], 0);
const zVon = (feld) => RUNS.filter(r => Number.isInteger(r[feld])).length;

ok("Run-Anzahl stimmt", k.runs === RUNS.length && k.runs === 8);
ok("erfolgreiche Veroeffentlichungen sind gezaehlt, nicht behauptet",
  k.veroeffentlicht.wert === RUNS.filter(r => r.veroeffentlicht === true).length
  && k.veroeffentlicht.wert === 8);
ok("die durchschnittliche Laufzeit ist Summe durch belegte Runs",
  k.laufzeit_schnitt_s.von === zVon("laufzeit_s")
  && k.laufzeit_schnitt_s.wert === zSum("laufzeit_s") / zVon("laufzeit_s"));
ok("die belegte Initialsumme der Laufzeiten ist 9029 s (Schnitt 18:49 min)",
  zSum("laufzeit_s") === 9029 && zVon("laufzeit_s") === 8
  && R.dauerText(k.laufzeit_schnitt_s.wert) === "18:49 min");
ok("Korrekturrunden: Summe 3 in 3 von 8 Runs",
  k.korrektur_runden.wert === 3 && k.korrektur_runden.runs_mit === 3
  && k.korrektur_runden.von === 8 && k.korrektur_runden.wert === zSum("korrektur_runden"));
ok("vermeidbare Testwiederholungen: 11 aus 7 von 8 belegten Runs",
  k.test_wiederholungen.wert === 11 && k.test_wiederholungen.von === 7
  && k.test_wiederholungen.gesamt === 8
  && k.test_wiederholungen.wert === zSum("test_wiederholungen"));
ok("verdeckte Test-Exitcodes: 8 aus 6 von 8 belegten Runs",
  k.verdeckte_exitcodes.wert === 8 && k.verdeckte_exitcodes.von === 6
  && k.verdeckte_exitcodes.gesamt === 8
  && k.verdeckte_exitcodes.wert === zSum("verdeckte_exitcodes"));
ok("die sechs geforderten Kennzahlen sind vorhanden",
  ["runs", "veroeffentlicht", "laufzeit_schnitt_s", "korrektur_runden",
    "test_wiederholungen", "verdeckte_exitcodes"].every(n => n in k));

// --- 4) Fehlende Werte werden NICHT geraten ------------------------------
const kNull = R.kennzahlen([SYN[2]]);
ok("ein unbelegter Wert bleibt null statt 0",
  kNull.laufzeit_schnitt_s.wert === null && kNull.laufzeit_schnitt_s.von === 0
  && kNull.test_wiederholungen.wert === null && kNull.verdeckte_exitcodes.wert === null
  && kNull.korrektur_runden.wert === null && kNull.korrektur_runden.runs_mit === 0);
ok("ein unbelegter Wert zaehlt auch nicht in den Nenner",
  R.kennzahlen(SYN).laufzeit_schnitt_s.von === 2
  && R.kennzahlen(SYN).laufzeit_schnitt_s.wert === 600);
ok("nicht belegte Werte werden als solche beschriftet",
  R.dauerText(null) === "nicht belegt" && R.dauerText(undefined) === "nicht belegt"
  && /nicht belegt/.test(R.retroKarte(SYN[2])));
ok("die Gesamtlage weist ihren Nenner sichtbar aus",
  /7 von 8 Runs belegt/.test(R.kennzahlenHtml(k))
  && /alle 8 Runs belegt/.test(R.kennzahlenHtml(k)));

// --- 5) Filter: nur Anzeige ---------------------------------------------
const vorher = JSON.stringify(R.kennzahlen(RUNS));
const gefiltert = R.filterRuns(RUNS, "beobachten");
ok("der Filter waehlt genau die Runs einer Klassifikation",
  gefiltert.length === RUNS.filter(r => r.ergebnis === "beobachten").length
  && gefiltert.every(r => r.ergebnis === "beobachten") && gefiltert.length > 0);
ok("„alle\" laesst den vollen Bestand stehen", R.filterRuns(RUNS, "alle").length === RUNS.length);
ok("der Filter beruehrt die Kennzahlen nicht",
  JSON.stringify(R.kennzahlen(RUNS)) === vorher
  && JSON.stringify(R.kennzahlen(RUNS)) !== JSON.stringify(R.kennzahlen(gefiltert)));
ok("der Filter aendert die Quelle nicht",
  RUNS.map(r => r.paket).join() === R.ordneRuns(RUNS).map(r => r.paket).join());

// --- 6) Karten: Inhalt, Ordnung, Aufklappen -----------------------------
const karten = R.retroKarten(RUNS);
const eine = R.retroKarte(RUNS[0]);
ok("die Karten stehen neueste zuerst",
  karten.indexOf(R.ankerId(RUNS[0])) < karten.indexOf(R.ankerId(RUNS[RUNS.length - 1])));
ok("eine unsortierte Eingabe wird beim Rendern geordnet",
  R.retroKarten(RUNS.slice().reverse()) === karten);
ok("jede Karte ist ein aufklappbares details/summary ohne Skript",
  (karten.match(/<details class="karte retro"/g) || []).length === RUNS.length
  && (karten.match(/<summary class="rsum">/g) || []).length === RUNS.length
  && !/onclick|<script/i.test(karten));
ok("die Karten sind standardmaessig zugeklappt", !/<details[^>]*\sopen/.test(karten));
ok("die Karte nennt Datum, Paket, Titel, Issues, Commit und Klassifikation",
  eine.includes(RUNS[0].paket) && eine.includes("11. August 2026")
  && eine.includes(RUNS[0].titel) && eine.includes(`#${RUNS[0].issues[0]}`)
  && eine.includes(`/commit/${RUNS[0].commit}`)
  && eine.includes(`klass-${RUNS[0].ergebnis}`));
ok("die Karte nennt Nutzerergebnis, Aufwand, Diff, Tests und Erkenntnisse",
  /Nutzerergebnis:/.test(eine) && /Laufzeit/.test(eine) && /Rückspiegelung/.test(eine)
  && /Diff-Umfang/.test(eine) && /Tests:/.test(eine)
  && (eine.match(/<li>/g) || []).length >= RUNS[0].erkenntnisse.length);
ok("jede Karte ist verlinkt und ankerbar",
  RUNS.every(r => karten.includes(`id="${R.ankerId(r)}"`)
    && karten.includes(`https://github.com/p0lycare/SEMBLA-planning-suite/issues/${r.issues[0]}`)));
ok("der Anker kollidiert nicht mit #chg-… oder #issue-…",
  RUNS.every(r => /^retro-\d{8}-\d{2}$/.test(R.ankerId(r))));
ok("ein Run ohne Erkenntnis behauptet keine",
  /Keine Erkenntnis festgehalten/.test(R.retroKarte(SYN[2])));
ok("Fremdtext wird escaped, nicht eingebaut",
  R.retroKarte(S(9, { titel: 'Bös <img src=x> "Zitat"' }))
    .includes("Bös &lt;img src=x&gt; &quot;Zitat&quot;"));
ok("die Ansicht ist keine Tabelle",
  !/<table|<tr|<td/i.test(karten) && !/<table/i.test(R.kennzahlenHtml(k)));
ok("der Leerzustand des Filters wird benannt statt leer gelassen",
  /Kein Run mit dieser Bewertung/.test(R.retroKarten([])));
ok("die Meta-Angabe ist abgeleitet, nicht gespeichert",
  R.metaText(RUNS) === "8 Runs · neuester 11. August 2026"
  && R.metaText([]) === "Keine Retro-Daten vorhanden");

// --- 7) Validator: Formfehler ------------------------------------------
const F = (patch) => R.pruefeRetros([S(1, patch)]);
const meldet = (p, re) => { const r = F(p); return !r.ok && r.fehler.some(f => re.test(f.meldung)); };

ok("fehlende Liste wird gemeldet, nicht geraten",
  !R.pruefeRetros(null).ok && !R.pruefeRetros(undefined).ok
  && !R.pruefeRetros({}).ok && !R.pruefeRetros([]).ok);
ok("ein unbekanntes Feld ist ein harter Fehler",
  meldet({ session_id: "x" }, /unbekanntes Feld: session_id/));
ok("ein fehlendes Pflichtfeld wird benannt", (() => {
  const r = S(1); delete r.teststatus;
  const p = R.pruefeRetros([r]);
  return !p.ok && p.fehler.some(f => /Pflichtfeld fehlt: teststatus/.test(f.meldung));
})());
ok("ein nicht nullbares Feld darf nicht null sein",
  meldet({ titel: null }, /titel darf nicht null sein/));
ok("unbekannte Klassifikation wird abgewiesen",
  meldet({ ergebnis: "teilweise" }, /ergebnis unbekannt/));
ok("Paketkennung, Commit und Datum werden streng geprueft",
  meldet({ paket: "irgendwas" }, /paket passt nicht/)
  && meldet({ commit: "abc" }, /vollstaendiger 40-stelliger Hash/)
  && meldet({ datum: "2026-02-31" }, /kein gueltiges Datum/)
  && meldet({ datum: "5.8.2026" }, /datum passt nicht/));
ok("mehr als drei Erkenntnisse werden abgewiesen",
  meldet({ erkenntnisse: ["a.", "b.", "c.", "d."] }, /hoechstens 3/));
ok("negative oder gebrochene Zahlen werden abgewiesen",
  meldet({ korrektur_turns: -1 }, /Ganzzahl >= 0/)
  && meldet({ diff_plus: 1.5 }, /Ganzzahl >= 0/)
  && meldet({ laufzeit_s: 0 }, /groesser als 0/));
ok("veroeffentlicht muss ein Wahrheitswert sein",
  meldet({ veroeffentlicht: "ja" }, /true\/false/));
ok("doppelte Pakete und doppelte Tagesnummern werden erkannt",
  !R.pruefeRetros([S(2), S(2)]).ok
  && R.pruefeRetros([S(2, { paket: "wp-2026-08-02-anders" }), S(2)]).fehler
    .some(f => /mehrfach/.test(f.meldung)));
ok("falsche Reihenfolge wird abgewiesen statt still sortiert",
  R.pruefeRetros([S(1), S(2)]).fehler.some(f => /Reihenfolge verletzt/.test(f.meldung)));

// --- 8) Validator: Datenschutz ----------------------------------------
ok("eine Sitzungskennung wird abgewiesen",
  meldet({ nutzerergebnis: "Lauf ce143416-1561-499d-af42-88c3f56b5954 fertig." },
    /Sitzungskennung/));
ok("ein Dateipfad wird abgewiesen",
  meldet({ nutzerergebnis: "Geaendert in docs/blog.html und mehr." }, /Dateipfad/)
  && meldet({ teststatus: "tests/module/smoke_blog.mjs gruen." }, /Dateipfad/));
ok("ein absoluter lokaler Pfad wird abgewiesen",
  meldet({ nutzerergebnis: "Lag unter /home/nutzer/projekt." }, /absoluter lokaler Pfad/));
ok("E-Mail und Token werden abgewiesen",
  meldet({ nutzerergebnis: "Frag a.b@c.de" }, /E-Mail/)
  && meldet({ teststatus: "token: ghp_0123456789abcdef" }, /Token/));
ok("mehrzeiliger Text (Rohprotokoll/Issue-Body) wird abgewiesen",
  meldet({ nutzerergebnis: "Zeile eins\nZeile zwei" }, /mehrzeiliger Text/)
  && meldet({ teststatus: "## Ueberschrift aus einem Issue" }, /Markdown/));
ok("das gilt auch fuer jede einzelne Erkenntnis",
  meldet({ erkenntnisse: ["Siehe docs/index.html."] }, /erkenntnisse\[0\].*Dateipfad/)
  && meldet({ erkenntnisse: [""] }, /erkenntnisse\[0\] ist leer/));
ok("zu langer Text wird abgewiesen",
  meldet({ titel: "x".repeat(R.LAENGE.titel + 1) }, /laenger als/));

// --- 9) Das ausgelieferte Artefakt ------------------------------------
ok("das Artefakt ist byteidentisch zu seiner Neuerzeugung",
  quelle === R.rendereDatei(RUNS));
// Kein gespeicherter Aggregatwert: geprueft wird an den EXPORTEN und den Datenfeldern,
// nicht an der Prosa — ein Runtitel darf durchaus „Zuschnittlegende" heissen.
ok("das Artefakt exportiert nur Daten — keine gespeicherte Gesamtzahl",
  (quelle.match(/^export const (\w+)/gm) || []).join() === "export const RETRO_FORMAT,"
    + "export const RETRO_VERSION,export const RUNS"
  && RUNS.every(r => Object.keys(r).every(k =>
    !/^(kennzahlen|summe|schnitt|durchschnitt|gesamt)/.test(k))));
ok("das Artefakt enthaelt keine Sitzungskennung und keinen Pfad im Datenteil", (() => {
  const daten = JSON.stringify(RUNS);
  return R.RETRO_VERBOTEN.every(v => !v.re.test(daten));
})());
ok("das Artefakt enthaelt keine E-Mail, kein Token und keinen absoluten Pfad", (() => {
  const daten = JSON.stringify(RUNS);
  return !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(daten)
    && !/gh[pousr]_[A-Za-z0-9]{10,}|Bearer\s/.test(daten)
    && !/\/(?:home|Users|root|var|etc|tmp|mnt|opt)\//.test(daten);
})());
ok("das Artefakt ist als erzeugt gekennzeichnet",
  /NICHT VON HAND BEARBEITEN/.test(quelle) && /workflow-retros-schreiben/.test(quelle));

// --- 10) Der Baustein liest und schreibt nichts ------------------------
const src = readFileSync(new URL("../../docs/shared/sembla-workflow-retros.js", import.meta.url), "utf8")
  .split("\n").filter(z => !/^\s*(\/\/|\*|\/\*)/.test(z)).join("\n");
ok("der Baustein ruft nichts ab und speichert nichts",
  !/fetch\(|XMLHttpRequest|localStorage|sessionStorage|api\.github\.com/.test(src));
ok("der Baustein liest keine Dateien und kein Projektmodell",
  !/readFileSync|node:fs|import\(|require\(/.test(src)
  && !/storage\.js|aktivesWandelement|mergeEingaben/.test(src));
ok("der Baustein importiert das Artefakt nicht statisch",
  !/from ["']\.\/workflow-retros\.js["']/.test(src));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
