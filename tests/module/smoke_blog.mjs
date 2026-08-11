// Smoke-Test Modul 8 (docs/blog.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock — also den ECHTEN Produktpfad der Seite. Blog- und Plan-Baustein werden — wie
// im Browser via window.SEMBLA — aus docs/shared/ bereitgestellt und vor __blogInit()
// gebunden.
//
// Schwerpunkte (Issues #48/#55/#65):
//   * genau DREI Ansichten, „Umsetzungsplan" ist der Standard,
//   * der Plan wird vollstaendig gerendert: Entscheidungen, Als Naechstes, Danach,
//     Blockiert — und zwar genau als planAnsicht() des gemeinsamen Bausteins,
//   * „Workflow-Retros": Gesamtkennzahlen und Run-Karten genau als die Bausteine sie
//     liefern, echter change-Handler des Filters, echtes details-Aufklappen,
//   * fehlendes ODER manipuliertes Artefakt ⇒ sichtbare Meldung und NICHTS gerendert,
//     waehrend die jeweils anderen Ansichten weiterlaufen,
//   * Deep-Links (#chg-…, #issue-…) waehlen die Ansicht und markieren das Ziel,
//   * streng statisch: KEIN fetch, KEIN localStorage, kein Login, kein Download, kein
//     Zugriff auf lokale Workflow-, Queue-, Manifest-, Retro- oder Sessiondateien,
//   * read-only: kein Wandelement, kein Eingaben-Schreibpfad,
//   * mobile DOM-Vertraege: keine Tabelle, Touch-Ziele >= 44 px.
//
// Checkout-autark: alle Datensaetze ausser den echten Artefakten sind synthetisch, es geht
// NIE etwas ins Netz — der Test bricht ab, falls die Seite es doch versuchte.

import { readFileSync } from "node:fs";
import * as B from "../../docs/shared/sembla-blog.js";
import * as P from "../../docs/shared/sembla-umsetzungsplan.js";
import * as R from "../../docs/shared/sembla-workflow-retros.js";
import * as ARTEFAKT from "../../docs/shared/umsetzungsplan.js";
import * as RETRO from "../../docs/shared/workflow-retros.js";

const html = readFileSync(new URL("../../docs/blog.html", import.meta.url), "utf8");
// erstes attributloses <script> ist die App-Logik (das zweite ist type="module")
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// DOM-Mock: unterscheidet Markup (innerHTML) von Text (textContent) und protokolliert
// Attribute, damit aria-selected und die Zielmarkierung pruefbar sind.
class El {
  constructor(tag, id) {
    this.tagName = tag; this.id = id; this.className = ""; this.style = {};
    this._h = ""; this._t = ""; this.attrs = {}; this.listeners = {}; this.kinder = [];
    this.scrolled = false; this.value = "";        // Auswahlfeld (Filter)
    this.open = false;                             // details/summary
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
const IDS = ["seg-plan", "seg-neu", "seg-retro", "view-plan", "view-neu", "view-retro",
  "planstand", "planfehler", "planliste", "blogmeta", "blogwarnung", "blogliste",
  "retrometa", "retrofehler", "retrokennzahlen", "retrofilterzeile", "retrofilter",
  "retroliste"];
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
const binde = (plandaten, retrodaten = RETRO) => {
  globalThis.window.SEMBLA = Object.assign({}, B, { plan: P, PLANDATEN: plandaten,
    retro: R, RETRODATEN: retrodaten });
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
  && $("view-plan").className === "" && $("view-neu").className === "verborgen"
  && $("view-retro").className === "verborgen");
ok("Segmentumschalter markiert die aktive Ansicht",
  $("seg-plan").className === "aktiv" && $("seg-neu").className === ""
  && $("seg-retro").className === ""
  && $("seg-plan").getAttribute("aria-selected") === "true"
  && $("seg-neu").getAttribute("aria-selected") === "false"
  && $("seg-retro").getAttribute("aria-selected") === "false");
ok("es gibt genau drei Ansichten", (html.match(/role="tab"/g) || []).length === 3
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

// --- 3b) Ansicht „Workflow-Retros" (Issue #65) ---------------------------
ok("die Gesamtlage ist genau kennzahlenHtml(kennzahlen()) des Bausteins",
  $("retrokennzahlen").innerHTML === R.kennzahlenHtml(R.kennzahlen(RETRO.RUNS)));
ok("die Run-Karten sind genau retroKarten() des Bausteins",
  $("retroliste").innerHTML === R.retroKarten(RETRO.RUNS));
ok("die Meta-Angabe ist abgeleitet, nicht gespeichert",
  $("retrometa").textContent === R.metaText(RETRO.RUNS)
  && /Runs · neuester /.test($("retrometa").textContent));
ok("kein Fehlerhinweis beim gueltigen Bestand und der Filter ist bedienbar",
  $("retrofehler").innerHTML === "" && $("retrofilterzeile").className === "filterzeile");
ok("die Kennzahlen nennen Runs, Veroeffentlichung, Laufzeit, Korrekturen, "
  + "Testwiederholungen und verdeckte Exitcodes", (() => {
    const h = $("retrokennzahlen").innerHTML;
    return /veröffentlichte Runs/.test(h) && /erfolgreich veröffentlicht/.test(h)
      && /Laufzeit im Schnitt/.test(h) && /Korrekturrunden/.test(h)
      && /vermeidbare Testwiederholungen/.test(h) && /verdeckte Test-Exitcodes/.test(h)
      && /Runs belegt/.test(h);
  })());
ok("die Karten stehen neueste zuerst und nennen die Klassifikation", (() => {
  const h = $("retroliste").innerHTML;
  const neu = R.ankerId(RETRO.RUNS[0]), alt = R.ankerId(RETRO.RUNS[RETRO.RUNS.length - 1]);
  return h.indexOf(neu) >= 0 && h.indexOf(neu) < h.indexOf(alt)
    && new Set(RETRO.RUNS.map(r => `klass-${r.ergebnis}`))
      .size === 3 && RETRO.RUNS.every(r => h.includes(`klass-${r.ergebnis}`));
})());
ok("jede Karte nennt Paket, Issue, Commit, Aufwand, Tests und Erkenntnisse", (() => {
  const h = $("retroliste").innerHTML;
  return RETRO.RUNS.every(r => h.includes(r.paket) && h.includes(`/commit/${r.commit}`)
    && r.issues.every(n => h.includes(`/issues/${n}`)))
    && (h.match(/Nutzerergebnis:/g) || []).length === RETRO.RUNS.length
    && (h.match(/Diff-Umfang/g) || []).length === RETRO.RUNS.length
    && (h.match(/<b>Tests:<\/b>/g) || []).length === RETRO.RUNS.length;
})());
ok("ein nicht belegter Wert steht als „nicht belegt\" statt als 0",
  /nicht belegt/.test($("retroliste").innerHTML)
  && RETRO.RUNS.some(r => r.implementierungs_turns === null
    || r.test_wiederholungen === null || r.verdeckte_exitcodes === null));

// Echtes Aufklappen: die Karten sind natives details/summary. Der zugeklappte Inhalt
// steckt vollstaendig IM details-Element, es gibt kein Klickskript und kein `open`.
{
  const h = $("retroliste").innerHTML;
  const anfang = h.indexOf("<details");
  const ende = h.indexOf("</details>");
  const erste = h.slice(anfang, ende);
  const sumEnde = erste.indexOf("</summary>");
  ok("Aufklappen ist eingebautes details/summary — kein Klickskript",
    (h.match(/<details class="karte retro"/g) || []).length === RETRO.RUNS.length
    && (h.match(/<summary class="rsum">/g) || []).length === RETRO.RUNS.length
    && !/onclick|onto|<script/i.test(h));
  ok("die Karten sind zugeklappt und tragen kein open",
    !/<details[^>]*\sopen/.test(h));
  ok("der aufklappbare Inhalt liegt vollstaendig innerhalb des details",
    sumEnde > 0 && erste.indexOf("rinhalt") > sumEnde
    && erste.includes("Nutzerergebnis:") && erste.includes("Tests:"));
}

// Echter change-Handler des Filters: nur die Karten wechseln, die Gesamtlage bleibt.
{
  const lageVorher = $("retrokennzahlen").innerHTML;
  const metaVorher = $("retrometa").textContent;
  ok("der Filter kennt genau „alle\" plus die drei Klassifikationen",
    (($("retrofilter").innerHTML.match(/<option /g) || []).length === 4)
    && /value="alle"/.test($("retrofilter").innerHTML)
    && Object.keys(R.KLASSIFIKATION_TEXT)
      .every(k => $("retrofilter").innerHTML.includes(`value="${k}"`)));
  $("retrofilter").value = "beobachten";
  $("retrofilter").dispatch("change");
  ok("der Filter zeigt genau die Runs einer Klassifikation",
    A().filter === "beobachten"
    && $("retroliste").innerHTML
      === R.retroKarten(R.filterRuns(RETRO.RUNS, "beobachten"))
    && $("retroliste").innerHTML !== R.retroKarten(RETRO.RUNS));
  ok("und laesst die Gesamtkennzahlen unveraendert",
    $("retrokennzahlen").innerHTML === lageVorher
    && $("retrometa").textContent === metaVorher);
  $("retrofilter").value = "beibehalten";
  $("retrofilter").dispatch("change");
  ok("ein weiterer Filterwechsel wirkt ebenfalls nur auf die Karten",
    $("retroliste").innerHTML === R.retroKarten(R.filterRuns(RETRO.RUNS, "beibehalten"))
    && $("retrokennzahlen").innerHTML === lageVorher);
  $("retrofilter").value = "alle";
  $("retrofilter").dispatch("change");
  ok("„alle\" stellt den vollen Bestand wieder her",
    $("retroliste").innerHTML === R.retroKarten(RETRO.RUNS));
}

// --- 4) Umschalten zwischen den Ansichten --------------------------------
$("seg-neu").dispatch("click");
ok("Klick auf Was ist neu schaltet um", A().ansicht === "neu"
  && $("view-neu").className === "" && $("view-plan").className === "verborgen"
  && $("view-retro").className === "verborgen" && $("seg-neu").className === "aktiv");
$("seg-retro").dispatch("click");
ok("Klick auf Workflow-Retros schaltet um", A().ansicht === "retro"
  && $("view-retro").className === "" && $("view-plan").className === "verborgen"
  && $("view-neu").className === "verborgen" && $("seg-retro").className === "aktiv"
  && $("seg-retro").getAttribute("aria-selected") === "true");
$("seg-plan").dispatch("click");
ok("Klick auf Umsetzungsplan schaltet zurueck", A().ansicht === "plan"
  && $("view-plan").className === "" && $("view-neu").className === "verborgen"
  && $("view-retro").className === "verborgen");

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
  ok("und die Workflow-Retros funktionieren trotzdem (eigene Quelle)",
    $("retroliste").innerHTML === R.retroKarten(RETRO.RUNS)
    && $("retrofehler").innerHTML === "");
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

// --- 6b) Fehlende/manipulierte Retro-Daten: isoliert melden -------------
{
  frisch();
  globalThis.location = { hash: "" };
  binde(ARTEFAKT, null);                        // Retro-Artefakt fehlt (404/geloescht)
  new Function(script)();
  globalThis.window.__blogInit();
  ok("fehlendes Retro-Artefakt ⇒ sichtbare Meldung statt geratener Kennzahlen",
    /Keine gültigen Workflow-Retros/.test($("retrofehler").innerHTML)
    && $("retrokennzahlen").innerHTML === "" && $("retroliste").innerHTML === ""
    && $("retrometa").textContent === "Keine Retro-Daten vorhanden");
  ok("der Filter wird dabei ausgeblendet statt ins Leere zu greifen",
    $("retrofilterzeile").className === "verborgen");
  ok("die Meldung behauptet keine Teilkennzahl",
    !/kzwert|Laufzeit im Schnitt|details/.test($("retrofehler").innerHTML));
  ok("Umsetzungsplan und Aenderungsliste laufen unveraendert weiter",
    $("planliste").innerHTML === P.planAnsicht(ARTEFAKT.PLAN)
    && $("planfehler").innerHTML === ""
    && $("blogliste").innerHTML === B.blogKarten(B.EINTRAEGE));
}
{
  frisch();
  globalThis.location = { hash: "" };
  // Manipulierter Datensatz: interne Zusatzangabe (Sitzungskennung) untergeschoben.
  const kaputt = RETRO.RUNS.map((r, i) => i === 0
    ? { ...r, session_id: "ce143416-1561-499d-af42-88c3f56b5954" } : r);
  binde(ARTEFAKT, { RUNS: kaputt, RETRO_FORMAT: "SEMBLA-Workflow-Retros", RETRO_VERSION: 1 });
  new Function(script)();
  globalThis.window.__blogInit();
  ok("manipuliertes Retro-Artefakt ⇒ Meldung, keine Karten, keine Kennzahlen",
    /Keine gültigen Workflow-Retros/.test($("retrofehler").innerHTML)
    && $("retroliste").innerHTML === "" && $("retrokennzahlen").innerHTML === ""
    && $("retrometa").textContent === "Retro-Daten ungültig");
  ok("die Meldung benennt den Grund", /session_id/.test($("retrofehler").innerHTML));
  ok("die beiden anderen Ansichten bleiben davon unberuehrt",
    $("planliste").innerHTML === P.planAnsicht(ARTEFAKT.PLAN)
    && $("blogliste").innerHTML === B.blogKarten(B.EINTRAEGE));
}
{
  frisch();
  globalThis.location = { hash: "" };
  binde(ARTEFAKT, { RUNS: RETRO.RUNS, RETRO_FORMAT: "SEMBLA-Projekt", RETRO_VERSION: 1 });
  new Function(script)();
  globalThis.window.__blogInit();
  ok("fremdes Retro-Format wird benannt und nicht gerendert",
    /RETRO_FORMAT/.test($("retrofehler").innerHTML) && $("retroliste").innerHTML === "");
}
{
  frisch();
  globalThis.location = { hash: "" };
  const falschSortiert = R.ordneRuns(RETRO.RUNS).slice().reverse();
  binde(ARTEFAKT, { RUNS: falschSortiert, RETRO_FORMAT: "SEMBLA-Workflow-Retros",
    RETRO_VERSION: 1 });
  new Function(script)();
  globalThis.window.__blogInit();
  ok("falsch sortierte Runs werden gemeldet statt still sortiert",
    /Reihenfolge verletzt/.test($("retrofehler").innerHTML)
    && $("retroliste").innerHTML === "");
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
ok("das Retro-Artefakt wird ebenfalls dynamisch geladen und abgefangen",
  /await import\(['"]\.\/shared\/workflow-retros\.js['"]\)/.test(html)
  && /catch\s*\(e\)\s*\{\s*retrodaten = null/.test(html));
ok("die Seite liest keine lokalen Workflow-, Queue-, Manifest-, Retro- oder Sessiondateien",
  !/retro-archive|retro\.md|runtime\/|manifest|queue|session|node:fs|readFile/i.test(code));
ok("Seite ist mobile-first ausgelegt (viewport, keine Tabelle, Touch-Ziele)",
  /name="viewport"/.test(html) && !/<table/.test(html) && /min-height:44px/.test(html));
ok("Retro-Karten und Filter haben ausreichend grosse Touch-Ziele",
  /details\.retro>summary\{[^}]*min-height:44px/.test(html)
  && /\.filterzeile select\{[^}]*min-height:44px/.test(html));
ok("die Retro-Ansicht baut ihr Markup nicht selbst nach (kein zweiter Renderer)",
  !/<details|kzfeld|rinhalt|klass-/.test(script)
  && /retroKarten|kennzahlenHtml/.test(script));
ok("Segmentumschalter klebt oben", /\.segwrap\{position:sticky/.test(html));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
