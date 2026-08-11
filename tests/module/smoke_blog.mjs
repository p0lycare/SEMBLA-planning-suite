// Smoke-Test Modul 8 (docs/blog.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock — also den ECHTEN Produktpfad der Seite. Blog- und Plan-Baustein werden — wie
// im Browser via window.SEMBLA — aus docs/shared/ bereitgestellt und vor __blogInit()
// gebunden.
//
// Schwerpunkte (Issues #48/#55):
//   * genau ZWEI Ansichten, „Umsetzungsplan" ist der Standard,
//   * der Plan wird vollstaendig gerendert: Entscheidungen, Als Naechstes, Danach,
//     Blockiert — und zwar genau als planAnsicht() des gemeinsamen Bausteins,
//   * fehlender ODER ungueltiger Plan ⇒ sichtbare Meldung und NICHTS gerendert,
//     waehrend „Was ist neu?" weiterlaeuft,
//   * Deep-Links (#chg-…, #issue-…) waehlen die Ansicht und markieren das Ziel,
//   * streng statisch: KEIN fetch, KEIN localStorage, kein Login, kein Download,
//   * read-only: kein Wandelement, kein Eingaben-Schreibpfad.
//
// Checkout-autark: alle Plaene ausser dem echten Artefakt sind synthetisch, es geht NIE
// etwas ins Netz — der Test bricht ab, falls die Seite es doch versuchte.

import { readFileSync } from "node:fs";
import * as B from "../../docs/shared/sembla-blog.js";
import * as P from "../../docs/shared/sembla-umsetzungsplan.js";
import * as ARTEFAKT from "../../docs/shared/umsetzungsplan.js";

const html = readFileSync(new URL("../../docs/blog.html", import.meta.url), "utf8");
// erstes attributloses <script> ist die App-Logik (das zweite ist type="module")
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// DOM-Mock: unterscheidet Markup (innerHTML) von Text (textContent) und protokolliert
// Attribute, damit aria-selected und die Zielmarkierung pruefbar sind.
class El {
  constructor(tag, id) {
    this.tagName = tag; this.id = id; this.className = ""; this.style = {};
    this._h = ""; this._t = ""; this.attrs = {}; this.listeners = {}; this.kinder = [];
    this.scrolled = false;
  }
  addEventListener(e, f) { (this.listeners[e] || (this.listeners[e] = [])).push(f); }
  dispatch(e) { (this.listeners[e] || []).forEach(f => f({ target: this })); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  scrollIntoView() { this.scrolled = true; }
  appendChild(c) { this.kinder.push(c); return c; }
  get innerHTML() { return this._h; }
  set innerHTML(v) { this._h = v; this.kinder = []; }
  get textContent() { return this._t + this.kinder.map(k => k.textContent).join(""); }
  set textContent(v) { this._t = v; this.kinder = []; }
}
const IDS = ["seg-plan", "seg-neu", "view-plan", "view-neu", "planstand", "planfehler",
  "planliste", "blogmeta", "blogwarnung", "blogliste"];
const _e = {};
const document = {
  getElementById: (id) => _e[id] || null,
  createElement: (tag) => new El(tag, "_"),
};
const frisch = () => { for (const id of IDS) _e[id] = new El("div", id); };
frisch();
globalThis.document = document;
globalThis.location = { hash: "" };

// Die Seite darf weder abrufen noch speichern — beides schlaegt hier hart fehl.
let netzVersuche = 0, speicherVersuche = 0;
globalThis.fetch = () => { netzVersuche++; throw new Error("Modul 8 darf nichts abrufen"); };
globalThis.localStorage = {
  getItem: () => { speicherVersuche++; throw new Error("Modul 8 darf nichts speichern"); },
  setItem: () => { speicherVersuche++; throw new Error("Modul 8 darf nichts speichern"); },
  removeItem: () => { speicherVersuche++; throw new Error("Modul 8 darf nichts speichern"); },
};

globalThis.window = {};
const binde = (plandaten) => {
  globalThis.window.SEMBLA = Object.assign({}, B, { plan: P, PLANDATEN: plandaten });
};

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const A = () => globalThis.window.__blog;
const $ = (id) => _e[id];

// App-Logik evaluieren und wie im Browser initialisieren.
binde(ARTEFAKT);
new Function(script)();
globalThis.window.__blogInit();

// --- 1) Startzustand: der Umsetzungsplan ist offen -----------------------
ok("Startansicht ist der Umsetzungsplan", A().ansicht === "plan"
  && $("view-plan").className === "" && $("view-neu").className === "verborgen");
ok("Segmentumschalter markiert die aktive Ansicht",
  $("seg-plan").className === "aktiv" && $("seg-neu").className === ""
  && $("seg-plan").getAttribute("aria-selected") === "true"
  && $("seg-neu").getAttribute("aria-selected") === "false");
ok("es gibt genau zwei Ansichten", (html.match(/role="tab"/g) || []).length === 2
  && !/seg-status|view-status/.test(html));

// --- 2) Der Plan wird vollstaendig gerendert -----------------------------
const pHtml = $("planliste").innerHTML;
ok("die Planansicht ist genau planAnsicht() des gemeinsamen Bausteins",
  pHtml === P.planAnsicht(ARTEFAKT.PLAN));
ok("alle vier Abschnitte erscheinen",
  /gruppe-entscheidungen/.test(pHtml) && /gruppe-naechstes/.test(pHtml)
  && /gruppe-weitere/.test(pHtml) && /gruppe-blockiert/.test(pHtml));
ok("kein Fehlerhinweis beim gueltigen Plan", $("planfehler").innerHTML === "");
ok("der Stand wird ausgewiesen und als selten geschrieben benannt",
  /^Stand: /.test($("planstand").textContent)
  && /nur bei inhaltlicher Änderung/.test($("planstand").textContent));
ok("das naechste Issue steht mit Begruendung im Markup",
  pHtml.includes(`id="issue-${ARTEFAKT.PLAN.naechstes.issue}"`) && /Warum jetzt:/.test(pHtml));
ok("jede Entscheidung nennt Frage und Empfehlung",
  ARTEFAKT.PLAN.entscheidungen.every(() => true)
  && (pHtml.match(/Brauche Entscheidung:/g) || []).length === ARTEFAKT.PLAN.entscheidungen.length
  && (pHtml.match(/<b>Empfehlung:<\/b>/g) || []).length === ARTEFAKT.PLAN.entscheidungen.length);
ok("jede Blockade nennt Ursache und naechsten Schritt",
  (pHtml.match(/<b>Blockiert:<\/b>/g) || []).length === ARTEFAKT.PLAN.blockiert.length
  && (pHtml.match(/Nächster Schritt:/g) || []).length === ARTEFAKT.PLAN.blockiert.length);
ok("jedes Issue des Plans ist verlinkt und ankerbar",
  P.alleEintraege(ARTEFAKT.PLAN).every(e =>
    pHtml.includes(`id="issue-${e.issue}"`)
    && pHtml.includes(`https://github.com/${B.REPO}/issues/${e.issue}`)));

// --- 3) „Was ist neu?" ist unveraendert ---------------------------------
ok("Aenderungsliste ist genau blogKarten() des gemeinsamen Bausteins",
  $("blogliste").innerHTML === B.blogKarten(B.EINTRAEGE));
ok("Aenderungsliste enthaelt den Seed-Eintrag mit stabilem Anker",
  /id="chg-20260805-01"/.test($("blogliste").innerHTML));
ok("Anzahl der Eintraege wird als Text ausgewiesen",
  /Eintrag|Einträge/.test($("blogmeta").textContent));
ok("kein Validator-Warnhinweis beim gueltigen Datensatz", $("blogwarnung").innerHTML === "");

// --- 4) Umschalten zwischen den Ansichten --------------------------------
$("seg-neu").dispatch("click");
ok("Klick auf Was ist neu schaltet um", A().ansicht === "neu"
  && $("view-neu").className === "" && $("view-plan").className === "verborgen"
  && $("seg-neu").className === "aktiv");
$("seg-plan").dispatch("click");
ok("Klick auf Umsetzungsplan schaltet zurueck", A().ansicht === "plan"
  && $("view-plan").className === "" && $("view-neu").className === "verborgen");

// --- 5) Fehlender Plan: melden, nichts raten ----------------------------
{
  frisch();
  globalThis.location = { hash: "" };
  binde(null);                                  // Artefakt fehlt (404/geloescht)
  new Function(script)();
  globalThis.window.__blogInit();
  ok("fehlender Plan ⇒ sichtbare Meldung statt geratenem Inhalt",
    /Kein gültiger Umsetzungsplan/.test($("planfehler").innerHTML)
    && $("planliste").innerHTML === ""
    && $("planstand").textContent === "Kein Plan vorhanden");
  ok("die Meldung behauptet keinen Plan und keinen Status",
    !/gruppe-|Als Nächstes|Warum jetzt/.test($("planfehler").innerHTML));
  ok("die Aenderungsliste funktioniert trotzdem (getrennte, statische Quelle)",
    $("blogliste").innerHTML === B.blogKarten(B.EINTRAEGE));
}

// --- 6) Ungueltiger Plan: ebenfalls melden, nichts teilweise rendern ----
{
  frisch();
  globalThis.location = { hash: "" };
  const kaputt = { ...ARTEFAKT.PLAN, signatur: "00000000" };   // Handaenderung/Zeitstempel
  binde({ PLAN: kaputt, PLAN_FORMAT: "SEMBLA-Umsetzungsplan", PLAN_VERSION: 1 });
  new Function(script)();
  globalThis.window.__blogInit();
  ok("ungueltiger Plan ⇒ Meldung, kein Teilplan",
    /Kein gültiger Umsetzungsplan/.test($("planfehler").innerHTML)
    && $("planliste").innerHTML === "" && $("planstand").textContent === "Plan ungültig");
  ok("die Meldung benennt den Grund", /signatur/.test($("planfehler").innerHTML));
}
{
  frisch();
  globalThis.location = { hash: "" };
  binde({ PLAN: ARTEFAKT.PLAN, PLAN_FORMAT: "SEMBLA-Projekt", PLAN_VERSION: 1 });
  new Function(script)();
  globalThis.window.__blogInit();
  ok("fremdes Format wird benannt und nicht gerendert",
    /PLAN_FORMAT/.test($("planfehler").innerHTML) && $("planliste").innerHTML === "");
}

// --- 7) Deep-Links -------------------------------------------------------
{
  frisch();
  const ziel = new El("article", "chg-20260805-01");
  _e["chg-20260805-01"] = ziel;
  globalThis.location = { hash: "#chg-20260805-01" };
  binde(ARTEFAKT);
  new Function(script)();
  globalThis.window.__blogInit();
  ok("#chg-… oeffnet die Aenderungsliste", A().ansicht === "neu");
  ok("#chg-… markiert und scrollt zum Eintrag", ziel.className === "karte ziel" && ziel.scrolled);
}
{
  frisch();
  const nr = ARTEFAKT.PLAN.naechstes.issue;
  const ziel = new El("article", "issue-" + nr);
  _e["issue-" + nr] = ziel;
  globalThis.location = { hash: "#issue-" + nr };
  binde(ARTEFAKT);
  new Function(script)();
  globalThis.window.__blogInit();
  ok("#issue-… oeffnet den Umsetzungsplan", A().ansicht === "plan"
    && $("view-plan").className === "" && $("view-neu").className === "verborgen");
  ok("#issue-… markiert und scrollt zum Issue", ziel.className === "karte ziel" && ziel.scrolled);
}
{
  frisch();
  globalThis.location = { hash: "#issue-99999" };
  binde(ARTEFAKT);
  new Function(script)();
  globalThis.window.__blogInit();
  ok("ein Anker auf ein Issue ausserhalb des Plans stuerzt nicht ab und faelscht nichts",
    A().ansicht === "plan" && $("planliste").innerHTML === P.planAnsicht(ARTEFAKT.PLAN));
}

// --- 8) Streng statisch und read-only -----------------------------------
ok("die Seite hat nichts abgerufen", netzVersuche === 0);
ok("die Seite hat nichts gespeichert", speicherVersuche === 0);
// Fuer die Negativpruefungen zaehlt der CODE, nicht die Prosa: reine Kommentarzeilen
// werden entfernt (zeilenweise — ein blindes Strippen von „//" wuerde jede https-URL
// zerschneiden und die Pruefung heimlich entschaerfen).
const code = html.split("\n").filter(z => !/^\s*(\/\/|\*|\/\*)/.test(z)).join("\n");
ok("im Markup gibt es keinen Netzabruf und keine API-URL",
  !/fetch\(|api\.github\.com|XMLHttpRequest/.test(code));
ok("im Markup gibt es keinen localStorage-Zugriff und keinen Anzeigecache",
  !/localStorage|sembla:blog:issues|CACHE_KEY/.test(code));
ok("der Nachladen-Knopf ist entfallen", !/id="reload"/.test(html));
ok("Modul haengt sich als Modul 8 in die Navbar", /mountNavbar\(8\)/.test(html));
ok("Modul schreibt kein Wandelement und kein Eingaben-Modell",
  !/mergeEingaben|speichereAktiv|setzeWandelement|setzeAktiv\(|buildWall/.test(html));
ok("Modul liest das Wandelement gar nicht erst (kein Storage-Import, keine Lese-API)",
  !/from ['"]\.\/shared\/storage\.js['"]/.test(html)
  && !/aktivesWandelement|aktiveEingaben|holeElement|listeElemente/.test(html));
ok("kein Login, kein Token, kein Kommentarformular",
  !/Authorization|client_secret|<form|<textarea/.test(html));
ok("kein Datei-Download/-Upload im Modul",
  !/downloadZip|createObjectURL|type="file"|FileReader|download\s*=/.test(html));
ok("das Planartefakt wird dynamisch geladen und sein Fehlen abgefangen",
  /await import\(['"]\.\/shared\/umsetzungsplan\.js['"]\)/.test(html)
  && /catch\s*\(e\)\s*\{\s*plandaten = null/.test(html));
ok("Seite ist mobile-first ausgelegt (viewport, keine Tabelle, Touch-Ziele)",
  /name="viewport"/.test(html) && !/<table/.test(html) && /min-height:44px/.test(html));
ok("Segmentumschalter klebt oben", /\.segwrap\{position:sticky/.test(html));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
