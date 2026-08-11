// Fokussierter Test: Aenderungsliste „Was ist neu?" (Modul 8, Issues #48/#55).
//
// Prueft den PRODUKTIONS-Baustein docs/shared/sembla-blog.js und den echten Datensatz
// docs/shared/blog-eintraege.js direkt — nicht ueber Stubs:
//   * Validator: eindeutige IDs, Pflichtfelder, Sortierung neu->alt, Issue-Referenzen,
//     verbotene Inhalte (E-Mails, Tokens, absolute lokale Pfade, Issue-Body-Text),
//   * Textwaechter `pruefeText` als eigener, wiederverwendbarer Baustein (der
//     Umsetzungsplan prueft seine Prosa damit — es gibt nur EINEN Waechter),
//   * Ansicht „Was ist neu?": Karten mit chg-Ankern, Escaping,
//   * Deep-Links (#chg-…, #issue-…),
//   * dass der GitHub-Pfad seit #55 vollstaendig entfallen ist.
//
// Checkout-autark: es wird NICHTS aus dem Netz geladen.

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

// Produktauftrag #55 bleibt genau einmal dokumentiert; der neue Ursprungsmaß-Fix #60 steht vorn.
const neu55 = EINTRAEGE.filter(e => e.issue === 55);
const neu15 = EINTRAEGE.filter(e => e.issue === 15 && e.datum === "2026-08-11");
ok("genau ein Eintrag fuer Issue 55", neu55.length === 1);
ok("zwei getrennte aktuelle Korrekturen fuer Issue 15", neu15.length === 2);
const neu22 = EINTRAEGE.filter(e => e.issue === 22);
ok("genau ein Eintrag fuer Issue 22 (Baustellenstueckliste)", neu22.length === 1);
ok("die nummerierte Lageplanzuordnung zu Issue 59 ist der neueste Eintrag",
  EINTRAEGE[0]?.id === "chg-20260811-12" && EINTRAEGE[0]?.issue === 59);

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

// --- 3) Textwaechter: verbotene Inhalte (oeffentliches Repo!) -------------
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

// `pruefeText` ist der EINE Waechter — der Umsetzungsplan nutzt genau diesen.
ok("pruefeText meldet Nicht-Text", B.pruefeText(42, 100).join() === "muss Text sein");
ok("pruefeText meldet leeren Text", B.pruefeText("   ", 100).join() === "ist leer");
ok("pruefeText meldet Ueberlaenge", /ist laenger als 5 Zeichen/.test(B.pruefeText("abcdefg", 5).join()));
ok("pruefeText meldet verbotene Inhalte",
  /E-Mail-Adresse/.test(B.pruefeText("schreib an a.b@c.de", 100).join()));
ok("pruefeText laesst sauberen Text durch", B.pruefeText("Alles in Ordnung", 100).length === 0);
ok("VERBOTEN ist exportiert und nicht leer", Array.isArray(B.VERBOTEN) && B.VERBOTEN.length >= 5);

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
ok("datumLang ist fehlertolerant", B.datumLang("kein Datum") === "kein Datum");

// --- 5) Deep-Links --------------------------------------------------------
ok("#chg-… fuehrt in die Aenderungsliste",
  JSON.stringify(B.ankerZiel("#chg-20260805-01")) === JSON.stringify({ ansicht: "neu", id: "chg-20260805-01" }));
ok("#issue-… fuehrt seit #55 in den Umsetzungsplan (Anker bleibt stabil)",
  JSON.stringify(B.ankerZiel("#issue-31")) === JSON.stringify({ ansicht: "plan", id: "issue-31" }));
ok("Anker ohne Raute wird ebenfalls verstanden", B.ankerZiel("issue-31").id === "issue-31");
ok("unbekannte/leere Anker ergeben null",
  B.ankerZiel("#irgendwas") === null && B.ankerZiel("") === null && B.ankerZiel(null) === null);
ok("die Anker der Aenderungsliste sind echte Deep-Link-Ziele",
  EINTRAEGE.every(e => B.ankerZiel("#" + e.id) && html.includes(`href="#${e.id}"`)));

// --- 6) Read-only, statisch, kein GitHub-Pfad mehr -----------------------
const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
const src = ohneKommentar(readFileSync(new URL("../../docs/shared/sembla-blog.js", import.meta.url), "utf8"));
ok("Baustein ist DOM-frei", !/document\.|window\.|localStorage\./.test(src));
ok("Baustein liest kein Wandelement und kein Eingaben-Modell",
  !/storage\.js|wandelement|mergeEingaben|buildWall/i.test(src));
ok("Baustein ruft nichts ab (kein Fetch, keine API-URL, kein Token)",
  !/fetch\(|api\.github\.com|Authorization|client_secret/i.test(src));
ok("der Anzeigecache ist ersatzlos entfallen", !/CACHE_KEY|sembla:blog:issues/.test(src));
ok("die Bausteine der Ansicht Projektstatus sind entfallen",
  !/gruppiereIssues|filterIssue|STATUS_GRUPPEN|entscheidungAbsatz|issueKarte/.test(src)
  && B.gruppiereIssues === undefined && B.filterIssues === undefined
  && B.ISSUES_URL === undefined && B.CACHE_KEY === undefined);
const daten = ohneKommentar(readFileSync(new URL("../../docs/shared/blog-eintraege.js", import.meta.url), "utf8"));
ok("der Datensatz enthaelt nur Daten (keine Logik)", !/\bfunction\b|=>/.test(daten));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
