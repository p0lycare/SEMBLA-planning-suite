// Fokussierter Test: Projektblog (Modul 8, Issue #48).
//
// Prueft den PRODUKTIONS-Baustein docs/shared/sembla-blog.js und den echten Datensatz
// docs/shared/blog-eintraege.js direkt — nicht ueber Stubs:
//   * Validator: eindeutige IDs, Pflichtfelder, Sortierung neu->alt, Issue-Referenzen,
//     verbotene Inhalte (E-Mails, Tokens, absolute lokale Pfade, Issue-Body-Text),
//   * Ansicht „Was ist neu?": Karten mit chg-Ankern, Escaping,
//   * Ansicht „Projektstatus": PR-Filter, Datensparsamkeit (nur Nummer/Titel/Labels/
//     Meilenstein), Gruppierung STRIKT nach status:-Labels (keine Textheuristik),
//     Gruppenreihenfolge dringend zuerst, „Ohne Status" sichtbar,
//   * Fehler-Fallback statt geratenem Status,
//   * Deep-Links (#chg-…, #issue-…).
//
// Checkout-autark: alle Issues sind synthetisch, es wird NICHTS aus dem Netz geladen.

import { readFileSync } from "node:fs";
import * as B from "../../docs/shared/sembla-blog.js";
import { EINTRAEGE, BLOG_FORMAT, BLOG_VERSION } from "../../docs/shared/blog-eintraege.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

// --- 1) Format und echter Datensatz ---------------------------------------
ok("Formatname und -version sind gesetzt", BLOG_FORMAT === "SEMBLA-Blog" && BLOG_VERSION === 1);
ok("EINTRAEGE ist eine nicht leere Liste", Array.isArray(EINTRAEGE) && EINTRAEGE.length >= 1);

const echt = B.pruefeEintraege();
if (!echt.ok) console.log("  Validator-Fehler im echten Datensatz: " + JSON.stringify(echt.fehler));
ok("der echte Datensatz besteht den Validator", echt.ok);

const seed = EINTRAEGE.find(e => e.id === "chg-20260805-01");
ok("Seed-Eintrag der Aktivierung vorhanden", !!seed);
ok("Seed-Eintrag verweist auf Issue 48 und ist ein feature",
  seed && seed.issue === 48 && seed.typ === "feature" && seed.datum === "2026-08-05");
ok("Seed-Eintrag enthaelt eine Testbitte", seed && typeof seed.testbitte === "string" && seed.testbitte.length > 10);

// --- 2) Validator: jede Regel schlaegt einzeln an -------------------------
const gut = { id: "chg-20260805-01", datum: "2026-08-05", typ: "feature", issue: 48, titel: "Titel" };
const mit = (patch) => B.pruefeEintraege([{ ...gut, ...patch }]);
const meldungen = (r) => r.fehler.map(f => f.meldung).join(" | ");

ok("gueltiger Einzeleintrag ist fehlerfrei", B.pruefeEintraege([gut]).ok);
ok("fehlendes Pflichtfeld wird gemeldet", /Pflichtfeld fehlt: titel/.test(meldungen(mit({ titel: "" }))));
ok("unbekanntes Feld wird gemeldet", /unbekanntes Feld: autor/.test(meldungen(mit({ autor: "x" }))));
ok("falsches id-Muster wird gemeldet", /id passt nicht/.test(meldungen(mit({ id: "chg-2026-08-05" }))));
ok("datum abweichend von der id wird gemeldet",
  /datum passt nicht zum Datumsteil/.test(meldungen(mit({ datum: "2026-08-06" }))));
ok("unbekannter typ wird gemeldet", /typ unbekannt/.test(meldungen(mit({ typ: "sonstiges" }))));
ok("issue muss positive Ganzzahl sein",
  /issue muss/.test(meldungen(mit({ issue: 0 }))) && /issue muss/.test(meldungen(mit({ issue: "48" }))));
ok("zu langer Titel wird gemeldet", /titel ist laenger/.test(meldungen(mit({ titel: "x".repeat(121) }))));

const doppelt = B.pruefeEintraege([gut, { ...gut }]);
ok("doppelte id wird gemeldet", /id kommt mehrfach vor/.test(meldungen(doppelt)));

const falscheReihe = B.pruefeEintraege([
  { ...gut, id: "chg-20260801-01", datum: "2026-08-01" },
  { ...gut, id: "chg-20260805-01", datum: "2026-08-05" },
]);
ok("alt vor neu wird als Reihenfolgefehler gemeldet", /Reihenfolge verletzt/.test(meldungen(falscheReihe)));
ok("neu vor alt ist korrekt", B.pruefeEintraege([
  { ...gut, id: "chg-20260805-02", datum: "2026-08-05" },
  { ...gut, id: "chg-20260805-01", datum: "2026-08-05" },
  { ...gut, id: "chg-20260801-01", datum: "2026-08-01" },
]).ok);

// --- 3) Validator: verbotene Inhalte (oeffentliches Repo!) ----------------
const verboten = [
  ["E-Mail-Adresse", { titel: "Rueckfrage an vorname.name@polycare.de" }],
  ["Token/Zugangsdaten", { titel: "Key ghp_abcdefghij1234567890 gesetzt" }],
  ["Token/Zugangsdaten", { testbitte: "token: s3hr-geheim-1234" }],
  ["absoluter lokaler Pfad", { titel: "Fix in /home/steinberger/Rufus/x.js" }],
  ["absoluter lokaler Pfad", { testbitte: "Datei C:\\Users\\tibor\\plan.json oeffnen" }],
  ["mehrzeiliger Text", { titel: "Zeile eins\nZeile zwei" }],
  ["Markdown-Zitat", { testbitte: "Info > zitierter Issue-Body" }],
  ["Markdown-Zitat", { testbitte: "Schritte ``` code ``` pruefen" }],
];
let verbotenOk = true, verbotenFehl = "";
for (const [name, patch] of verboten) {
  const r = mit(patch);
  if (r.ok) { verbotenOk = false; verbotenFehl += ` [${name}: ${JSON.stringify(patch)}]`; }
}
ok("alle verbotenen Inhalte werden abgewiesen" + verbotenFehl, verbotenOk);
ok("harmloser Text mit # und : bleibt erlaubt",
  B.pruefeEintraege([{ ...gut, titel: "Modul 8: Blog ergaenzt (Issue #48)",
    testbitte: "Anker der Form #issue-31 pruefen" }]).ok);

// --- 4) Ansicht „Was ist neu?" -------------------------------------------
const html = B.blogKarten(EINTRAEGE);
ok("jede Karte traegt ihre chg-id als Anker",
  EINTRAEGE.every(e => html.includes(`id="${e.id}"`)));
ok("Karte nennt Titel, Typ-Chip und Datum in Langform",
  html.includes(B.esc(seed.titel)) && /chip typ-feature/.test(html) && html.includes("5. August 2026"));
ok("Karte verlinkt das Issue auf github.com",
  html.includes(`https://github.com/${B.REPO}/issues/48`) && html.includes("Issue #48"));
ok("Testbitte wird ausgewiesen", /Bitte testen:/.test(html));
ok("leere Liste ergibt einen Hinweis statt leerem Markup", /class="leer"/.test(B.blogKarten([])));
const boese = { ...gut, titel: '<img src=x onerror="alert(1)">', testbitte: "<script>alert(2)</" + "script>" };
const boeseHtml = B.blogKarten([boese]);
ok("Eintragstexte werden escaped",
  !/<img src=x|<script>alert/i.test(boeseHtml) && /&lt;img src=x/.test(boeseHtml));

// --- 5) Issue-Filter: Datensparsamkeit und PR-Filter ----------------------
const rohIssue = {
  number: 31, title: "Vorspannachsen balancieren", state: "open",
  labels: [{ name: "status: in progress" }, { name: "priority: high" }],
  milestone: { title: "AWG Musterwand" },
  body: "GEHEIMER ISSUE-BODY mit interner Notiz",
  user: { login: "p0lycare" }, comments: 7,
  assignee: { login: "p0lycare" },
};
const gefiltert = B.filterIssue(rohIssue);
ok("Filter behaelt nur Nummer/Titel/Labels/Meilenstein/URL",
  JSON.stringify(Object.keys(gefiltert).sort()) === JSON.stringify(["labels", "milestone", "number", "title", "url"]));
const gefiltertJson = JSON.stringify(gefiltert);
ok("Filter uebernimmt weder Body noch Autor, Zuweisung oder Kommentarzahl",
  !gefiltertJson.includes("GEHEIMER") && !/"(body|user|login|assignee|comments|state)"/.test(gefiltertJson));
ok("Filter setzt die GitHub-URL", gefiltert.url === `https://github.com/${B.REPO}/issues/31`);
ok("Pull Requests werden verworfen",
  B.filterIssue({ number: 99, title: "PR", pull_request: { url: "…" } }) === null);
ok("kaputte Eintraege werden verworfen",
  B.filterIssue(null) === null && B.filterIssue({ title: "ohne Nummer" }) === null);
ok("filterIssues verwirft PRs aus der Liste",
  B.filterIssues([rohIssue, { number: 99, title: "PR", pull_request: {} }, null]).length === 1);
ok("filterIssues ist robust gegen Nicht-Listen", B.filterIssues({}).length === 0);

// --- 6) Gruppierung: strikt nach Labels, dringend zuerst -----------------
const I = (nr, labels, ms, title) => ({ number: nr, title: title || ("Issue " + nr),
  labels, milestone: ms || null, url: B.issueUrl(nr) });
const issues = [
  I(10, ["status: ready"]),
  I(11, ["status: blocked", "priority: low"]),
  I(12, ["status: in progress", "priority: high"]),
  I(13, ["status: decision needed"]),
  I(14, [], null, "Blockiert: hier ist alles kaputt und dringend"),   // Falle: Text!
  I(15, ["status: in progress"], "AWG Musterwand"),
  I(16, ["status: in progress", "priority: critical"]),
  I(17, ["Status: In Progress"]),                                     // Gross/Klein
];
const gruppen = B.gruppiereIssues(issues);
ok("Gruppenreihenfolge ist blocked, decision, progress, ready, ohne",
  gruppen.map(g => g.id).join(",") === "blocked,decision,progress,ready,ohne");
ok("Gruppierung folgt nur den Labels — Titeltext erzeugt keinen Status",
  gruppen.find(g => g.id === "ohne").issues.map(i => i.number).join() === "14"
  && !gruppen.find(g => g.id === "blocked").issues.some(i => i.number === 14));
ok("Gruppe ohne Statuslabel bleibt sichtbar", gruppen.some(g => g.id === "ohne" && g.issues.length === 1));
ok("Labelvergleich ist unabhaengig von Gross-/Kleinschreibung",
  gruppen.find(g => g.id === "progress").issues.some(i => i.number === 17));
ok("innerhalb der Gruppe zuerst die dringendsten",
  gruppen.find(g => g.id === "progress").issues.map(i => i.number).join(",") === "16,12,15,17");
ok("AWG-Meilenstein erhoeht die Dringlichkeit",
  B.dringlichkeit(I(1, [], "AWG Musterwand")) < B.dringlichkeit(I(2, [])) && B.istAwg(I(1, [], "AWG Musterwand")));
ok("leere Gruppen entfallen", B.gruppiereIssues([I(20, ["status: ready"])]).map(g => g.id).join() === "ready");
ok("ohne Issues gibt es keine Gruppen", B.gruppiereIssues([]).length === 0);
ok("gruppeVon ist robust ohne Labels", B.gruppeVon({ number: 1 }) === "ohne");

// --- 7) Statuskarten: Anker, Inhalte, Escaping ---------------------------
const shtml = B.issueKarten(gruppen);
ok("jede Statuskarte traegt den Anker issue-<nr>",
  issues.every(i => shtml.includes(`id="issue-${i.number}"`)));
ok("Statuskarte zeigt Nummer, Titel, Labels und Meilenstein",
  shtml.includes("#12") && shtml.includes("Issue 12")
  && shtml.includes("status: in progress") && shtml.includes("AWG Musterwand"));
ok("Statuskarte verlinkt auf GitHub", shtml.includes(`href="https://github.com/${B.REPO}/issues/12"`));
ok("Gruppen tragen Titel und Anzahl", /Entscheidung nötig/.test(shtml) && /class="anzahl"/.test(shtml));
const boeseIssue = B.issueKarten(B.gruppiereIssues([
  I(30, ['<img src=x onerror="alert(1)">'], '<script>alert(2)</' + 'script>', '<b>roh</b>')]));
ok("Titel, Labels und Meilenstein werden escaped",
  !/<img src=x|<script>alert|<b>roh<\/b>/i.test(boeseIssue) && /&lt;b&gt;roh/.test(boeseIssue));
ok("ohne Gruppen erscheint ein Hinweis statt leerem Markup", /class="leer"/.test(B.issueKarten([])));

// --- 8) Fehler-Fallback statt geratenem Status ---------------------------
const fNetz = B.fehlerHinweis("netz");
ok("Fallback ohne Cache nennt den Grund und behauptet keinen Status",
  /Status nicht abrufbar/.test(fNetz) && /Keine Verbindung/.test(fNetz)
  && /kein früherer Stand/.test(fNetz) && !/status: /.test(fNetz));
ok("Abruflimit wird eigens benannt", /Abruflimit/.test(B.fehlerHinweis("limit")));
ok("unbekannter Grund faellt auf eine verstaendliche Meldung zurueck",
  /Status nicht abrufbar/.test(B.fehlerHinweis("quatsch")));
const fCache = B.fehlerHinweis("http", "2026-08-05T09:30:00.000Z");
ok("Fallback mit Cache weist den Stand als moeglicherweise veraltet aus",
  /zuletzt erfolgreich abgerufene Stand/.test(fCache) && /veraltet/.test(fCache) && /2026/.test(fCache));
ok("standText ist fehlertolerant", B.standText("kein Datum") === "kein Datum");

// --- 9) Deep-Links --------------------------------------------------------
ok("#chg-… fuehrt in die Aenderungsliste",
  JSON.stringify(B.ankerZiel("#chg-20260805-01")) === JSON.stringify({ ansicht: "neu", id: "chg-20260805-01" }));
ok("#issue-… fuehrt in den Projektstatus",
  JSON.stringify(B.ankerZiel("#issue-31")) === JSON.stringify({ ansicht: "status", id: "issue-31" }));
ok("Anker ohne Raute wird ebenfalls verstanden", B.ankerZiel("issue-31").id === "issue-31");
ok("unbekannte/leere Anker ergeben null",
  B.ankerZiel("#irgendwas") === null && B.ankerZiel("") === null && B.ankerZiel(null) === null);
ok("die Anker der Aenderungsliste sind echte Deep-Link-Ziele",
  EINTRAEGE.every(e => B.ankerZiel("#" + e.id) && html.includes(`href="#${e.id}"`)));

// --- 10) Read-only und Datenquelle ---------------------------------------
const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
const src = ohneKommentar(readFileSync(new URL("../../docs/shared/sembla-blog.js", import.meta.url), "utf8"));
ok("Baustein ist DOM-frei", !/document\.|window\.|localStorage\./.test(src));
ok("Baustein kennt nur die oeffentliche Issue-API (kein Token, kein Backend)",
  B.ISSUES_URL === `https://api.github.com/repos/${B.REPO}/issues?state=open&per_page=100`
  && !/Authorization|client_secret/i.test(src));
ok("Baustein liest kein Wandelement und kein Eingaben-Modell",
  !/storage\.js|wandelement|mergeEingaben|buildWall/i.test(src));
const daten = ohneKommentar(readFileSync(new URL("../../docs/shared/blog-eintraege.js", import.meta.url), "utf8"));
ok("der Datensatz enthaelt nur Daten (keine Logik)", !/\bfunction\b|=>/.test(daten));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
