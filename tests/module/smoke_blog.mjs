// Smoke-Test Modul 8 (docs/blog.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock — also den ECHTEN Produktpfad der Seite. Der Blog-Baustein (sembla-blog.js)
// wird — wie im Browser via window.SEMBLA — aus docs/shared/ bereitgestellt und vor
// __blogInit() gebunden. `fetch` und `localStorage` sind gemockt; es geht NIE etwas ins Netz.
//
// Schwerpunkte:
//   * beide Ansichten rendern, sticky Segmentumschalter schaltet um,
//   * Statusgruppen strikt nach Labels, dringend zuerst, „Ohne Status" sichtbar,
//   * Deep-Links (#chg-…, #issue-…) waehlen die Ansicht und markieren das Ziel,
//   * Netzfehler/403/kaputte Antwort ⇒ verstaendlicher Fallback statt falschem Status,
//   * Cache: letzter erfolgreicher Stand wird angezeigt und als moeglicherweise veraltet
//     gekennzeichnet; Bodies gelangen nie in den Cache,
//   * read-only: kein Wandelement, kein Eingaben-Schreibpfad, kein Login, kein Download.
//
// Checkout-autark: alle Issues sind synthetisch.

import { readFileSync } from "node:fs";
import * as B from "../../docs/shared/sembla-blog.js";

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
// Elemente, die es in der Seite gibt; Karten-Anker werden aus dem gerenderten Markup
// nachgebildet (der Mock parst kein HTML) — genau wie der Browser sie nach dem Rendern kennt.
const _e = {};
const document = {
  getElementById: (id) => _e[id] || null,
  createElement: (tag) => new El(tag, "_"),
};
for (const id of ["seg-neu", "seg-status", "view-neu", "view-status", "blogmeta",
  "blogwarnung", "blogliste", "statusstand", "reload", "statusfehler", "statusliste"]) {
  _e[id] = new El("div", id);
}
globalThis.document = document;
globalThis.location = { hash: "" };

// localStorage-Mock (Anzeigecache).
const _ls = {};
globalThis.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
};

// fetch-Mock: die naechste Antwort wird je Test gesetzt; jeder Aufruf wird protokolliert.
let ANTWORT = null;             // () => Promise<res>
const abrufe = [];
globalThis.fetch = (url, opt) => { abrufe.push({ url, opt }); return ANTWORT(); };
const jsonRes = (daten) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(daten) });
const httpRes = (status) => () => Promise.resolve({ ok: false, status, json: () => Promise.resolve(null) });
const netzFehler = () => () => Promise.reject(new TypeError("Failed to fetch"));
const kaputt = () => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ message: "nope" }) });

// Synthetische API-Antwort inkl. Body/Autor (darf NIE angezeigt oder gecacht werden) und PR.
const API = [
  { number: 31, title: "Vorspannachsen balancieren", labels: [{ name: "status: in progress" }, { name: "priority: high" }],
    milestone: { title: "AWG Musterwand" }, body: "GEHEIMER BODY", user: { login: "jemand" }, comments: 4 },
  { number: 32, title: "Preisauflösung dokumentieren", labels: [{ name: "status: ready" }], milestone: null, body: "…" },
  { number: 33, title: "Blockiert klingt der Titel", labels: [], milestone: null, body: "…" },
  { number: 34, title: "Kopfblech getrennt ausweisen", labels: [{ name: "status: blocked" }], milestone: null,
    body: "GEHEIMER BODY 34\n\n### Blockiert\nBlockiert durch: #35 (Kataloggroessen)\n\n### Notizen\nGEHEIME Notiz" },
  { number: 35, title: "Pull Request", labels: [], pull_request: { url: "…" }, body: "…" },
  { number: 36, title: "Bot-Kommentare als Quelle?", labels: [{ name: "status: decision needed" }], milestone: null,
    body: "GEHEIMER Vorlauf im Body\n\n### Aktuelle Entscheidung\n"
      + "**Brauche Entscheidung:** Kommentare zusaetzlich abrufen?\n"
      + "**Empfehlung:** Nein, nur der Body — sonst reisst das Abruflimit.\n\n"
      + "### Umsetzung\nGEHEIMER Umsetzungsplan", user: { login: "jemand" }, comments: 9 },
];

globalThis.window = {};
globalThis.window.SEMBLA = B;

// App-Logik evaluieren und wie im Browser initialisieren.
ANTWORT = jsonRes(API);
new Function(script)();
const $ = (id) => _e[id];
const A = () => globalThis.window.__blog;

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const warte = () => new Promise((r) => setTimeout(r, 0));

globalThis.window.__blogInit();

// --- 1) Startzustand: „Was ist neu?" ist offen ---------------------------
ok("Startansicht ist die Aenderungsliste", A().ansicht === "neu"
  && $("view-neu").className === "" && $("view-status").className === "verborgen");
ok("Segmentumschalter markiert die aktive Ansicht",
  $("seg-neu").className === "aktiv" && $("seg-status").className === ""
  && $("seg-neu").getAttribute("aria-selected") === "true"
  && $("seg-status").getAttribute("aria-selected") === "false");
ok("Aenderungsliste ist genau blogKarten() des gemeinsamen Bausteins",
  $("blogliste").innerHTML === B.blogKarten(B.EINTRAEGE));
ok("Aenderungsliste enthaelt den Seed-Eintrag mit Anker",
  /id="chg-20260805-01"/.test($("blogliste").innerHTML));
ok("Anzahl der Eintraege wird als Text ausgewiesen",
  /Eintrag|Einträge/.test($("blogmeta").textContent));
ok("kein Validator-Warnhinweis beim gueltigen Datensatz", $("blogwarnung").innerHTML === "");

await warte();

// --- 2) Projektstatus: Abruf, Gruppierung, Datensparsamkeit --------------
ok("genau ein Abruf der oeffentlichen Issue-API", abrufe.length === 1 && abrufe[0].url === B.ISSUES_URL);
ok("Abruf sendet keine Zugangsdaten",
  !JSON.stringify(abrufe[0].opt || {}).match(/Authorization|token/i));
const sHtml = $("statusliste").innerHTML;
ok("Statusliste ist genau issueKarten(gruppiereIssues())",
  sHtml === B.issueKarten(B.gruppiereIssues(B.filterIssues(API))));
ok("Gruppen erscheinen dringend zuerst (blockiert vor bereit)",
  sHtml.indexOf("Blockiert") < sHtml.indexOf("Bereit") && sHtml.indexOf("Bereit") > -1);
ok("Issue ohne status:-Label landet sichtbar in der Gruppe Ohne Status",
  /Ohne Status/.test(sHtml) && sHtml.indexOf("Ohne Status") > sHtml.indexOf("Bereit"));
ok("Titeltext erzeugt keinen Status (Issue 33 bleibt ohne Status)",
  sHtml.indexOf('id="issue-33"') > sHtml.indexOf("Ohne Status"));
ok("Pull Request wird nicht angezeigt", !/id="issue-35"/.test(sHtml));
ok("nur Nummer/Titel/Labels/Meilenstein — kein Body, kein Autor",
  !/GEHEIMER BODY|jemand/.test(sHtml) && /#31/.test(sHtml)
  && /AWG Musterwand/.test(sHtml) && /status: in progress/.test(sHtml));
ok("Statuskarte verlinkt auf GitHub",
  sHtml.includes(`href="https://github.com/${B.REPO}/issues/31"`));
ok("Entscheidungsabsatz erscheint bei decision — mit fettem Praefix, ohne Restbody",
  /class="entscheidung"/.test(sHtml)
  && sHtml.includes("<b>Brauche Entscheidung:</b> Kommentare zusaetzlich abrufen?")
  && sHtml.includes("<b>Empfehlung:</b> Nein, nur der Body")
  && !/GEHEIM/i.test(sHtml));
ok("Blockade-Absatz erscheint bei blocked", sHtml.includes("<b>Blockiert:</b> #35 (Kataloggroessen)"));
ok("Issues ohne decision/blocked tragen keinen Entscheidungsblock",
  (sHtml.match(/class="entscheidung"/g) || []).length === 2);
ok("Stand wird ausgewiesen", /5 offene Issues · Stand: /.test($("statusstand").textContent));
ok("kein Fehlerhinweis nach erfolgreichem Abruf",
  $("statusfehler").innerHTML === "" && A().fehler === null);

// --- 3) Cache: nur die gefilterten Felder werden gespeichert -------------
const roh = _ls[B.CACHE_KEY];
ok("erfolgreicher Abruf landet im Anzeigecache", typeof roh === "string" && roh.length > 10);
ok("der Cache enthaelt keine Bodies/Autoren", !/GEHEIM|jemand|"body"/i.test(roh));
ok("der Cache enthaelt das Extrakt des ausgezeichneten Absatzes",
  roh.includes("Brauche Entscheidung: Kommentare zusaetzlich abrufen?")
  && roh.includes("Blockiert: #35 (Kataloggroessen)"));
ok("bei Nicht-decision-Issues landet kein Bodyinhalt im Cache",
  (() => {
    const c = JSON.parse(roh).issues;
    const nicht = c.filter((i) => i.number === 31 || i.number === 32 || i.number === 33);
    return nicht.length === 3 && nicht.every((i) => i.entscheidung === "" && !("body" in i));
  })());
ok("der Cache traegt einen Stand", typeof JSON.parse(roh).stand === "string");

// --- 4) Umschalten zwischen den Ansichten --------------------------------
$("seg-status").dispatch("click");
ok("Klick auf Projektstatus schaltet um", A().ansicht === "status"
  && $("view-status").className === "" && $("view-neu").className === "verborgen"
  && $("seg-status").className === "aktiv");
$("seg-neu").dispatch("click");
ok("Klick auf Was ist neu schaltet zurueck", A().ansicht === "neu"
  && $("view-neu").className === "" && $("view-status").className === "verborgen");

// --- 5) Fehler-Fallback: Netz, Abruflimit, kaputte Antwort ---------------
ANTWORT = netzFehler();
$("reload").dispatch("click");
await warte();
ok("Netzfehler ⇒ Fallback statt falschem Status",
  A().fehler === "netz" && /Status nicht abrufbar/.test($("statusfehler").innerHTML));
ok("bei Netzfehler bleibt der zuletzt erfolgreiche Stand sichtbar und wird als solcher benannt",
  /Zwischenspeicher/.test($("statusstand").textContent)
  && /veraltet/.test($("statusfehler").innerHTML)
  && $("statusliste").innerHTML !== "");

ANTWORT = httpRes(403);
$("reload").dispatch("click");
await warte();
ok("HTTP 403 wird als Abruflimit benannt",
  A().fehler === "limit" && /Abruflimit/.test($("statusfehler").innerHTML));
ANTWORT = httpRes(500);
$("reload").dispatch("click");
await warte();
ok("HTTP 500 wird als abgelehnter Abruf benannt", A().fehler === "http");
ANTWORT = kaputt();
$("reload").dispatch("click");
await warte();
ok("unerwartetes Antwortformat wird benannt",
  A().fehler === "format" && /unerwartet aufgebaut/.test($("statusfehler").innerHTML));
ok("kein Fehlerfall behauptet einen Status",
  !/status: in progress<\/b>|ist blockiert/.test($("statusfehler").innerHTML));

ANTWORT = jsonRes(API);
$("reload").dispatch("click");
await warte();
ok("nach erneutem Erfolg verschwindet der Fehlerhinweis",
  A().fehler === null && $("statusfehler").innerHTML === "");

// --- 6) Kaltstart nur aus dem Cache (kein Netz) --------------------------
{
  for (const id of Object.keys(_e)) _e[id] = new El("div", id);
  globalThis.location = { hash: "" };
  ANTWORT = netzFehler();
  abrufe.length = 0;
  new Function(script)();
  globalThis.window.__blogInit();
  await warte();
  ok("ohne Netz wird der zwischengespeicherte Stand angezeigt",
    $("statusliste").innerHTML.includes('id="issue-31"')
    && /Zwischenspeicher/.test($("statusstand").textContent));
  ok("und dabei klar als moeglicherweise veraltet gekennzeichnet",
    /veraltet/.test($("statusfehler").innerHTML));
}

// --- 7) Kaltstart ohne Netz und ohne Cache -------------------------------
{
  for (const id of Object.keys(_e)) _e[id] = new El("div", id);
  delete _ls[B.CACHE_KEY];
  globalThis.location = { hash: "" };
  ANTWORT = netzFehler();
  new Function(script)();
  globalThis.window.__blogInit();
  await warte();
  ok("ohne Netz und ohne Cache: kein Status, aber ein verstaendlicher Hinweis",
    $("statusliste").innerHTML === "" && /kein früherer Stand/.test($("statusfehler").innerHTML)
    && $("statusstand").textContent === "Kein Status verfügbar");
  ok("die Aenderungsliste funktioniert trotzdem (statische Quelle)",
    $("blogliste").innerHTML === B.blogKarten(B.EINTRAEGE));
}

// --- 8) Deep-Link auf eine Aenderung -------------------------------------
{
  for (const id of Object.keys(_e)) _e[id] = new El("div", id);
  const ziel = new El("article", "chg-20260805-01");
  _e["chg-20260805-01"] = ziel;
  globalThis.location = { hash: "#chg-20260805-01" };
  ANTWORT = jsonRes(API);
  new Function(script)();
  globalThis.window.__blogInit();
  ok("#chg-… oeffnet die Aenderungsliste", A().ansicht === "neu");
  ok("#chg-… markiert und scrollt zum Eintrag", ziel.className === "karte ziel" && ziel.scrolled);
  await warte();
}

// --- 9) Deep-Link auf ein Issue (Ziel entsteht erst nach dem Abruf) ------
{
  for (const id of Object.keys(_e)) _e[id] = new El("div", id);
  globalThis.location = { hash: "#issue-31" };
  ANTWORT = jsonRes(API);
  new Function(script)();
  globalThis.window.__blogInit();
  ok("#issue-… oeffnet den Projektstatus", A().ansicht === "status"
    && $("view-status").className === "" && $("view-neu").className === "verborgen");
  const ziel = new El("article", "issue-31");
  _e["issue-31"] = ziel;                     // Browser: existiert nach dem Rendern
  await warte();
  ok("#issue-… markiert und scrollt zum Issue nach dem Abruf",
    ziel.className === "karte ziel" && ziel.scrolled);
}

// --- 10) Read-only und Modul-Oberflaeche ---------------------------------
ok("Modul haengt sich als Modul 8 in die Navbar", /mountNavbar\(8\)/.test(html));
ok("Modul schreibt kein Wandelement und kein Eingaben-Modell",
  !/mergeEingaben|speichereAktiv|setzeWandelement|setzeAktiv\(|buildWall/.test(html));
ok("Modul liest das Wandelement gar nicht erst (kein Storage-Import, keine Lese-API)",
  !/from ['"]\.\/shared\/storage\.js['"]/.test(html)
  && !/aktivesWandelement|aktiveEingaben|holeElement|listeElemente/.test(html));
ok("kein Login, kein Token, kein Kommentarformular",
  !/Authorization|client_secret|<form|<textarea|localStorage\.setItem\('sembla:elemente/.test(html));
ok("kein Datei-Download/-Upload im Modul",
  !/downloadZip|createObjectURL|type="file"|FileReader|download\s*=/.test(html));
ok("einziger localStorage-Zugriff ist der Anzeigecache",
  (html.match(/localStorage\.\w+\([^)]*/g) || []).every(s => /B\.CACHE_KEY/.test(s))
  && /localStorage\.getItem\(B\.CACHE_KEY\)/.test(html));
ok("Seite ist mobile-first ausgelegt (viewport, keine Tabelle, Touch-Ziele)",
  /name="viewport"/.test(html) && !/<table/.test(html) && /min-height:44px/.test(html));
ok("Segmentumschalter klebt oben", /\.segwrap\{position:sticky/.test(html));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
