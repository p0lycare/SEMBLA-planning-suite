// Smoke-Test Modul 7 (docs/zeichnung.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock — also den ECHTEN Produktpfad der Blattvorschau. Der Zeichnungsbaustein
// (sembla-zeichnung.js) und Storage werden — wie im Browser via window.SEMBLA — aus
// docs/shared/ bzw. per Mock bereitgestellt und vor __zInit() gebunden.
//
// Schwerpunkte:
//   * reiner Konsument: laedt das aktive Wandelement, schreibt es NIE zurueck ([D-1]),
//   * schreibt nur seinen eigenen Eingaben-Abschnitt `zeichnung` ([D-7]),
//   * ohne aktives Wandelement klarer Verweis auf Modul 0, KEIN Demo-Wandelement,
//   * Vorschau und zentraler Export sind deckungsgleich (dieselbe Ableitung, [D-6]),
//   * kein eigener Datei-Download im Modul (Dateien nur ueber Modul 0).
//
// Checkout-autark: Testwaende synthetisch aus dem Core, keine Fixtures.

import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { blattHtml, normOptionen, standardOptionen, druckCss, ZEICHNUNG_CSS, BLATT }
  from "../../docs/shared/sembla-zeichnung.js";
import { zeichnungHtml, zeichnungSvgText } from "../../docs/shared/sembla-export.js";

const html = readFileSync(new URL("../../docs/zeichnung.html", import.meta.url), "utf8");
// erstes attributloses <script> ist die App-Logik (das zweite ist type="module")
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Der Mock unterscheidet bewusst zwischen Markup (innerHTML) und Textknoten
// (textContent/appendChild) — nur so ist nachweisbar, dass ein Wandelementname als TEXT
// und nie als Markup in die Seite gelangt.
class El {
  constructor(tag, id) {
    this.tagName = tag; this.id = id; this.value = undefined; this._h = ""; this._t = "";
    this.style = {}; this.checked = false; this.listeners = {}; this.kinder = [];
  }
  addEventListener(e, f) { (this.listeners[e] || (this.listeners[e] = [])).push(f); }
  dispatch(e) { (this.listeners[e] || []).forEach(f => f({ target: this })); }
  setAttribute() {} click() {}
  appendChild(c) { this.kinder.push(c); return c; }
  get innerHTML() { return this._h; }
  set innerHTML(v) { this._h = v; this.kinder = []; }         // Markup ersetzt Kindknoten
  /** Wie im Browser: liest den Text aller Nachfahren, Zuweisung ersetzt sie. */
  get textContent() { return this._t + this.kinder.map(k => k.textContent).join(""); }
  set textContent(v) { this._t = v; this.kinder = []; }
}
const _e = {};
const document = {
  getElementById: id => _e[id] || (_e[id] = new El("div", id)),
  createElement: tag => new El(tag, "_"),
};
globalThis.document = document;
globalThis.window = { print: () => { globalThis.__printed = true; } };
let alertMsg = null;
globalThis.alert = m => { alertMsg = m; };

// Testwaende (baubar, synthetisch): Tuer + Staffelung, 2600 mm -> 13 Steinreihen.
const W = buildWall("IW-01", 3000, 2600, [new Opening(6, 12, 0, 10, "tuer")], null, null,
  [{ x0_mm: 1500, x1_mm: 2250, height_mm: 2000 }]);
const W2 = buildWall("IW-02", 6000, 3000, [new Opening(8, 14, 4, 10, "fenster")]);

const EING = {
  projekt: { name: "Rettungswache", bauherr: "Landkreis", planverfasser: "Polycare", phase: "Ausführungsplanung", plan_nr: "A-12", index: "2", gez: "TB" },
  zeichnung: { format: "a3", masse: true, steintypen: true, planinhalt: "Wandabwicklung", wasserzeichen: false },
};

// Storage-Mock: aktives Element vorhanden; mergeEingaben protokolliert die Schreibzugriffe.
let _subs = [], _aktiv = "w-1", _we = W, _eing = JSON.parse(JSON.stringify(EING));
const schreib = [];
const storeMock = {
  aktivId: () => _aktiv,
  aktivesWandelement: () => _we,
  aktiveEingaben: () => JSON.parse(JSON.stringify(_eing)),
  mergeEingaben: (teil, patch) => { schreib.push({ teil, patch }); _eing[teil] = { ..._eing[teil], ...patch }; return _aktiv; },
  abonniere: cb => { _subs.push(cb); return () => {}; },
};
const fireStore = () => _subs.forEach(cb => cb());

globalThis.window.SEMBLA = { store: storeMock, blattHtml, normOptionen, standardOptionen, druckCss, ZEICHNUNG_CSS, BLATT };

// App-Logik evaluieren und wie im Browser initialisieren.
new Function(script)();
globalThis.window.__zInit();

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const $ = id => _e[id];
const Z = globalThis.window.__z;

// --- 1) Startzustand: aktives Wandelement geladen -------------------------
ok("aktives Wandelement geladen", Z.wall === W);
ok("Wandinfo nennt den Namen als Text (kein Markup)",
  /IW-01/.test($("wandinfo").textContent) && $("wandinfo").innerHTML === ""
  && $("wandinfo").kinder.length === 1 && $("wandinfo").kinder[0].tagName === "b");
ok("Blatt-CSS aus dem gemeinsamen Baustein eingehaengt", $("zcss").textContent === ZEICHNUNG_CSS);
ok("Uebersicht: Masse", $("ovDim").textContent === "3,000 × 2,60 m");
ok("Uebersicht: Raster/Steinreihen", $("ovGrid").textContent === W.N_grid + " Raster · " + W.lagen + " Steinreihen");
ok("Uebersicht: Spannachsen", $("ovCols").textContent === String(W.tension_columns.length));
ok("Uebersicht: Status baubar", $("ovBadge").textContent === "Baubar");

// --- 2) Blattvorschau = gemeinsame Ableitung ([D-6]) ---------------------
const soll = blattHtml(W, _eing, normOptionen(EING.zeichnung));
ok("Vorschau ist genau blattHtml() des gemeinsamen Bausteins", $("blattwrap").innerHTML === soll.html);
ok("Vorschau enthaelt die Zeichnung", /<svg/.test($("blattwrap").innerHTML) && /<rect/.test($("blattwrap").innerHTML));
ok("Vorschau enthaelt das Schriftfeld", /ztitleblock/.test($("blattwrap").innerHTML));
ok("Masstab angezeigt", $("ovScale").textContent === "1 : " + soll.masstab && Z.masstab === soll.masstab);
ok("Blattgroesse angezeigt", /A3 quer/.test($("ovSheet").textContent));
ok("Druck-CSS passt zum Format", $("pagestyle").textContent === druckCss("a3"));
ok("Projekt-Kopfdaten aus Modul 0 im Blatt", /Rettungswache/.test($("blattwrap").innerHTML) && /A-12/.test($("blattwrap").innerHTML));
ok("Zielregeln als ungeprueft gekennzeichnet", /nicht automatisch geprüft/.test($("blattwrap").innerHTML));
ok("kein Nachweis-Ergebnis im Blatt", /separat prüfen/.test($("blattwrap").innerHTML) && !/bestanden/i.test($("blattwrap").innerHTML));

// --- 3) Darstellungsoptionen: nur eigener Abschnitt wird geschrieben ([D-7]) ---
$("fmt").value = "a4";
$("fmt").dispatch("change");
ok("Formatwechsel schreibt eingaben.zeichnung", schreib.length === 1 && schreib[0].teil === "zeichnung");
ok("Patch enthaelt nur Darstellungsoptionen",
  Object.keys(schreib[0].patch).sort().join(",") === "format,masse,planinhalt,steintypen,wasserzeichen");
ok("A4 fuehrt zu gleichem oder groberem Masstab", Z.masstab >= soll.masstab);
ok("Vorschau nach Formatwechsel neu gezeichnet", $("blattwrap").innerHTML === blattHtml(W, _eing, Z.opt).html);
ok("Druck-CSS auf A4 umgestellt", $("pagestyle").textContent === druckCss("a4"));

$("masse").checked = false; $("masse").dispatch("change");
ok("Bemassung abschaltbar", Z.opt.masse === false && !/ m<\/text>/.test($("blattwrap").innerHTML));
$("masse").checked = true; $("masse").dispatch("change");
$("wm").checked = true; $("wm").dispatch("change");
ok("Wasserzeichen zuschaltbar", Z.opt.wasserzeichen === true && /Vorabzug/.test($("blattwrap").innerHTML));
$("wm").checked = false; $("wm").dispatch("change");
$("planinhalt").value = "Ausführungsplan Wand"; $("planinhalt").dispatch("change");
ok("Planinhalt wirkt im Blatt", /Ausführungsplan Wand/.test($("blattwrap").innerHTML));
$("fmt").value = "a3"; $("fmt").dispatch("change");
ok("kein Schreibzugriff auf einen fremden Abschnitt", schreib.every(s => s.teil === "zeichnung"));

// --- 4) Wandelement wird nie geschrieben ---------------------------------
ok("Storage-Mock hat keine Schreib-API fuer das Wandelement benutzt",
  !("setzeWandelement" in storeMock) && JSON.stringify(_we) === JSON.stringify(W));
ok("Modulquelltext schreibt kein Wandelement",
  !/setzeWandelement|speichereWandelement|neuesElement|buildWall/.test(html));

// --- 5) Elementwechsel von aussen (Kopfleiste/Startseite) ----------------
_aktiv = "w-2"; _we = W2; _eing = { projekt: { name: "Halle" }, zeichnung: { format: "a4" } };
fireStore();
ok("externer Wechsel laedt das neue Wandelement", Z.wall === W2 && /IW-02/.test($("wandinfo").textContent));
ok("Optionen des neuen Elements uebernommen", Z.opt.format === "a4" && $("fmt").value === "a4");
ok("Vorschau zeigt das neue Element", $("blattwrap").innerHTML === blattHtml(W2, _eing, Z.opt).html);

// --- 5b) Regression: schaedlicher Wandelementname wird nie als Markup gesetzt ---
// Der Name kommt vom Nutzer (Modul 0) und reist im Projekt-JSON mit, ist also nicht
// vertrauenswuerdig. Weder die Wandinfo im Modul noch das Blatt/der Export duerfen ihn
// als HTML interpretieren.
const BOESE = '<img src=x onerror="alert(1)"><script>alert(2)</' + 'script>';
const WX = buildWall(BOESE, 3000, 2600, []);
_aktiv = "w-3"; _we = WX; _eing = { projekt: { name: BOESE }, zeichnung: { format: "a3" } };
fireStore();
const info = $("wandinfo");
ok("boeser Name landet als Textknoten, nicht als Markup",
  info.kinder.length === 1 && info.kinder[0].tagName === "b"
  && info.kinder[0].innerHTML === "" && info.kinder[0].textContent === BOESE);
ok("Wandinfo setzt nie Markup (innerHTML bleibt leer, Name nur als Text)",
  info.innerHTML === "" && info.textContent.includes(BOESE));
ok("Blatt escaped den Namen (Kopfzeile, Schriftfeld, SVG-Beschriftung)",
  !/<img src=x|<script>alert/i.test($("blattwrap").innerHTML)
  && /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/.test($("blattwrap").innerHTML));
ok("Exportdateien escapen den Namen ebenfalls",
  !/<img src=x|<script>alert/i.test(zeichnungHtml(WX, _eing))
  && !/<img src=x|<script>alert/i.test(zeichnungSvgText(WX, _eing)));

// --- 6) Ohne aktives Wandelement: Verweis auf Modul 0, kein Demo ---------
_aktiv = null; _we = null;
fireStore();
ok("ohne aktives Element keine Zeichnung", Z.wall === null && $("blattwrap").innerHTML === "");
ok("Hinweis verweist auf die Startseite", /Kein aktives Wandelement/.test($("wandinfo").textContent));
ok("Uebersicht zurueckgesetzt", $("ovDim").textContent === "—" && $("ovScale").textContent === "—");
globalThis.__printed = false; alertMsg = null;
$("print").dispatch("click");
ok("Druck ohne Wandelement wird abgelehnt (Hinweis statt leerem Blatt)",
  globalThis.__printed === false && /Kein aktives Wandelement/.test(alertMsg || ""));

// --- 7) Druck: dasselbe Blatt wie Vorschau und Export -------------------
_aktiv = "w-1"; _we = W; _eing = JSON.parse(JSON.stringify(EING));
fireStore();
$("print").dispatch("click");
ok("Druck loest window.print() aus", globalThis.__printed === true);
ok("gedruckt wird die Vorschau selbst (kein zweites Rendering)",
  $("blattwrap").innerHTML === blattHtml(W, _eing, Z.opt).html
  && !/printdoc/.test(html));
// Deckungsgleichheit zum zentralen Export: das Blatt der Vorschau steckt unveraendert
// im Export-Dokument, und das Export-SVG ist dasselbe Blatt-SVG.
const exportDok = zeichnungHtml(W, _eing);
ok("Blatt der Vorschau steckt identisch im Export-Dokument", exportDok.includes($("blattwrap").innerHTML));
ok("Export-SVG ist die Zeichnung dieses Blattes",
  zeichnungSvgText(W, _eing).includes(blattHtml(W, _eing, Z.opt).svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")));

// --- 8) Modul-Oberflaeche: keine dezentrale Dateifunktion ---------------
ok("kein Datei-Download / kein Datei-Upload im Modul",
  !/downloadZip|createObjectURL|type="file"|FileReader/.test(html));
ok("kein jsPDF/CDN im Modul", !/jspdf|html2canvas|cdnjs|unpkg/i.test(html));
ok("Modul verweist fuer Dateien auf den zentralen Export", /zentralen Export/.test(html));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
