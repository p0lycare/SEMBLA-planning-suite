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
import { blattHtml, normOptionen, standardOptionen, druckCss, ZEICHNUNG_CSS, BLATT, blattInnen,
  PAD_MM, FARBE, VERZAHNUNG, VERZAHNUNG_TITEL, VERZAHNUNG_GRUND, VERZAHNUNG_RESTSEGMENT }
  from "../../docs/shared/sembla-zeichnung.js";
import { zeichnungHtml, zeichnungSvgText } from "../../docs/shared/sembla-export.js";
// #79: der ECHTE Normalisierer aus der Speicherschicht — der Storage-Mock reicht ihn
// unveraendert durch (wie `window.SEMBLA.store` im Browser), damit hier kein zweites,
// erfundenes F0/F30-Verhalten getestet wird.
import { normBrandklasse } from "../../docs/shared/storage.js";

const html = readFileSync(new URL("../../docs/zeichnung.html", import.meta.url), "utf8");
// erstes attributloses <script> ist die App-Logik (das zweite ist type="module")
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Der Mock unterscheidet bewusst zwischen Markup (innerHTML) und Textknoten
// (textContent/appendChild) — nur so ist nachweisbar, dass ein Wandelementname als TEXT
// und nie als Markup in die Seite gelangt.
class El {
  constructor(tag, id) {
    this.tagName = tag; this.id = id; this.value = undefined; this._h = ""; this._t = "";
    // `style` kann wie im Browser auch CSS-Variablen aufnehmen (--zskala, #61);
    // `clientWidth` ist die Layoutbreite — im Mock 0 (kein Layout), im Test setzbar.
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.clientWidth = 0;
    this.checked = false; this.listeners = {}; this.kinder = [];
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
// Fensterereignisse (nur `resize` wird genutzt: Bildschirmfaktor nachziehen, #61).
const _fenster = {};
globalThis.window = {
  print: () => { globalThis.__printed = true; },
  addEventListener: (e, f) => { (_fenster[e] || (_fenster[e] = [])).push(f); },
};
const fireFenster = e => (_fenster[e] || []).forEach(f => f());
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
  normBrandklasse,                                  // #79: kanonisch, kein Nachbau
};
const fireStore = () => _subs.forEach(cb => cb());

globalThis.window.SEMBLA = { store: storeMock, blattHtml, normOptionen, standardOptionen, druckCss, ZEICHNUNG_CSS, BLATT, blattInnen };

// App-Logik evaluieren und wie im Browser initialisieren.
new Function(script)();
globalThis.window.__zInit();

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const $ = id => _e[id];
const Z = globalThis.window.__z;

// #72: der einleitende Beschreibungsabsatz ist ersatzlos entfallen (samt totem CSS und
// dem toten .intro-Bezug in der Druckregel).
ok("[#72] kein einleitender intro-Absatz mehr auf der Seite",
  !/class="intro"/.test(html) && !/\.intro\b/.test(html));

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
// [#79] Wand ohne das Feld: die Uebersicht weist F0 aus (Standard), nichts wird geraten.
ok("[#79] Uebersicht: Brandschutz einer Wand ohne das Feld ist F0",
  !("brandklasse" in W) && $("ovBrand").textContent === "F0");

// --- 2) Blattvorschau = gemeinsame Ableitung ([D-6]) ---------------------
const soll = blattHtml(W, _eing, normOptionen(EING.zeichnung));
ok("Vorschau ist genau blattHtml() des gemeinsamen Bausteins", $("blattwrap").innerHTML === soll.html);
ok("Vorschau enthaelt die Zeichnung", /<svg/.test($("blattwrap").innerHTML) && /<rect/.test($("blattwrap").innerHTML));
ok("Vorschau enthaelt das Schriftfeld", /ztitleblock/.test($("blattwrap").innerHTML));
ok("Masstab angezeigt", $("ovScale").textContent === "1 : " + soll.masstab && Z.masstab === soll.masstab);
ok("Blattgroesse angezeigt", /A3 quer/.test($("ovSheet").textContent));
ok("Druck-CSS passt zum Format", $("pagestyle").textContent === druckCss("a3"));

// --- 2b) #61 Vorschaugeometrie: echte Papiermasse, nur Bildschirmfaktor -----
// Die Vorschau muss dieselbe Blattgeometrie zeigen wie der Druck. Geprueft wird der
// ECHTE UI-Pfad: was render() aus BLATT abgeleitet und an den Vorschaurahmen gelegt hat.
const PX_JE_MM = 96 / 25.4;
const geoA3 = Z.blattgeometrie;
ok("Vorschau nutzt die kanonische A3-Innenflaeche aus BLATT",
  geoA3.format === "a3" && geoA3.breite_mm === blattInnen("a3").w && geoA3.hoehe_mm === blattInnen("a3").h);
ok("ohne bekannte Layoutbreite bleibt der Bildschirmfaktor deterministisch 1", geoA3.skala === 1);
// Enges Fenster: das VOLLSTAENDIGE Blatt wird gleichmaessig verkleinert — die dargestellte
// Flaeche behaelt exakt das Papierverhaeltnis, es wird kein Bereich neu proportioniert.
$("blattwrap").clientWidth = 800;
fireFenster("resize");
const g800 = Z.blattgeometrie;
const sollSkala = 800 / (blattInnen("a3").w * PX_JE_MM);
ok("enges Fenster verkleinert das Blatt gleichmaessig",
  Math.abs(g800.skala - sollSkala) < 1e-12 && g800.skala < 1);
const hoehePx = parseFloat($("blattwrap").style.height);
ok("Vorschaurahmen traegt die skalierte Blatthoehe (kein Layoutloch)",
  Math.abs(hoehePx - blattInnen("a3").h * PX_JE_MM * g800.skala) < 1e-9);
ok("dargestellte Flaeche hat exakt das Blattverhaeltnis",
  Math.abs(hoehePx / 800 - blattInnen("a3").h / blattInnen("a3").w) < 1e-12);
ok("Bildschirmfaktor liegt als CSS-Variable am Vorschaurahmen",
  $("blattwrap").style["--zskala"] === String(g800.skala));
// Breites Fenster: nie ueber die echte Papiergroesse hinaus vergroessern.
$("blattwrap").clientWidth = 5000;
fireFenster("resize");
ok("breites Fenster vergroessert das Blatt nicht ueber Papiergroesse", Z.blattgeometrie.skala === 1);
$("blattwrap").clientWidth = 800;
fireFenster("resize");
ok("Projekt-Kopfdaten aus Modul 0 im Blatt", /Rettungswache/.test($("blattwrap").innerHTML) && /A-12/.test($("blattwrap").innerHTML));
ok("kein Nachweis-Ergebnis im Blatt", !/bestanden/i.test($("blattwrap").innerHTML));

// --- 2c) #61 Reduzierter Blattinhalt in Vorschau UND zentralem Export, A3 und A4 ----
// Geprueft wird beides am selben Text: was der Nutzer sieht ($('blattwrap')) und was der
// zentrale Export schreibt (zeichnungHtml()) — dieselbe Ableitung, also derselbe Befund ([D-6]).
/** Pflichtinhalt des reduzierten Blattes — Ausfuehrungsdaten, kein Erklaertext. */
const pflicht = (t) => /<svg/.test(t) && /<rect/.test(t)                       // Wanddarstellung
  && /ztitleblock/.test(t) && /1 : \d+/.test(t)                                // Schriftfeld/Masstab
  && /Baustellenstückliste/.test(t) && /Stein i/.test(t)                       // Stueckliste
  && /Einbauteile Gewindestangen/.test(t) && /GS-k\d+\.\d+\.\d+/.test(t)       // IDs [P-19]
  && /Spannachsen/.test(t) && /Sonderlängen/.test(t)                           // Kennzahlen
  && /Gewindestange \(Standardlänge\)/.test(t) && /Reststück oben/.test(t)     // kompakte Legende
  && /Einbauteil-ID GS-k/.test(t);
/** Genau die entfernten Textbloecke — Regelkunde und Verwaltungsballast. */
const entfernt = (t) => !/nicht automatisch geprüft/.test(t) && !/Zielregel/.test(t)
  && !/Planungshinweis/.test(t) && !/eingehaltene Vorspannregeln/.test(t)
  && !/Zielvorgaben für die Planung/.test(t) && !/planerisch zu prüfen/.test(t)
  && !/separat prüfen/.test(t) && !/nicht Bestandteil dieser Zeichnung/.test(t)
  && !/Bauherrenschaft/.test(t) && !/Planverfasser/.test(t) && !/>Phase</.test(t)
  && !/>Statik</.test(t) && !/<div class="v">–<\/div>/.test(t) && !t.includes("###");
for (const f of ["a3", "a4"]) {
  $("fmt").value = f; $("fmt").dispatch("change");            // echter Format-Handler
  const sicht = $("blattwrap").innerHTML, exp = zeichnungHtml(W, _eing);
  ok(`Vorschau ${f.toUpperCase()}: Pflichtinhalt vollstaendig`, pflicht(sicht));
  ok(`Vorschau ${f.toUpperCase()}: entfernte Text-/Verwaltungsbloecke fehlen`, entfernt(sicht));
  ok(`Export ${f.toUpperCase()}: Pflichtinhalt vollstaendig`, pflicht(exp));
  ok(`Export ${f.toUpperCase()}: entfernte Text-/Verwaltungsbloecke fehlen`, entfernt(exp));
  ok(`Export ${f.toUpperCase()} enthaelt genau das sichtbare Blatt ([D-6])`, exp.includes(sicht));
}
// Der Druckpfad bleibt unveraendert: kein zweites Rendering, nur window.print() auf die Vorschau.
globalThis.__printed = false;
$("print").dispatch("click");
ok("#61 Druck bleibt window.print() auf genau die reduzierte Vorschau",
  globalThis.__printed === true && pflicht($("blattwrap").innerHTML)
  && entfernt($("blattwrap").innerHTML));
$("fmt").value = "a3"; $("fmt").dispatch("change");
schreib.length = 0;                                           // Formatwechsel der Pruefung nicht mitzaehlen

// --- 3) Darstellungsoptionen: nur eigener Abschnitt wird geschrieben ([D-7]) ---
$("fmt").value = "a4";
$("fmt").dispatch("change");
ok("Formatwechsel schreibt eingaben.zeichnung", schreib.length === 1 && schreib[0].teil === "zeichnung");
ok("Patch enthaelt nur Darstellungsoptionen",
  Object.keys(schreib[0].patch).sort().join(",") === "format,masse,planinhalt,steintypen,wasserzeichen");
ok("A4 fuehrt zu gleichem oder groberem Masstab", Z.masstab >= soll.masstab);
ok("Vorschau nach Formatwechsel neu gezeichnet", $("blattwrap").innerHTML === blattHtml(W, _eing, Z.opt).html);
ok("Druck-CSS auf A4 umgestellt", $("pagestyle").textContent === druckCss("a4"));
// #61: Der Formatwechsel fuehrt Blattbaustein, Vorschaugeometrie und Druck-CSS GEMEINSAM nach.
const geoA4 = Z.blattgeometrie;
ok("Formatwechsel fuehrt Blatt, Vorschaugeometrie und Druck-CSS gemeinsam nach",
  $("blattwrap").innerHTML.includes('class="zsheet fmt-a4"')
  && geoA4.format === "a4"
  && geoA4.breite_mm === blattInnen("a4").w && geoA4.hoehe_mm === blattInnen("a4").h
  && $("pagestyle").textContent === druckCss("a4"));
ok("A3 und A4 unterscheiden sich in der Vorschau wie auf dem Papier",
  geoA4.breite_mm !== blattInnen("a3").w
  && Math.abs(parseFloat($("blattwrap").style.height)
      - blattInnen("a4").h * PX_JE_MM * geoA4.skala) < 1e-9);

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
// #61: Gedruckt wird genau die sichtbare Vorschau — dieselbe Blattgeometrie, dieselbe
// CSS-Basis, dasselbe @page. Vom Papier weicht allein der Bildschirmfaktor ab.
ok("gedruckte Blattgeometrie ist die der Vorschau",
  Z.blattgeometrie.format === Z.opt.format
  && Z.blattgeometrie.breite_mm === blattInnen(Z.opt.format).w
  && Z.blattgeometrie.hoehe_mm === blattInnen(Z.opt.format).h);
ok("Export-Dokument nutzt dieselbe CSS-Basis und dasselbe @page wie die Vorschau",
  exportDok.includes(ZEICHNUNG_CSS) && exportDok.includes(druckCss(Z.opt.format))
  && $("pagestyle").textContent === druckCss(Z.opt.format));
ok("Export-SVG ist die Zeichnung dieses Blattes",
  zeichnungSvgText(W, _eing).includes(blattHtml(W, _eing, Z.opt).svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")));

// --- 7b) #79 Brandschutzklassifikation im ECHTEN Seitenpfad --------------
// Aktives Wandelement mit F30 (so, wie Modul 1 es gespeichert hat). Geprueft wird das
// von DIESER Seite erzeugte Blatt — Kurztext, Legende, Uebersicht — und dass Druck-HTML
// und SVG-Datei des zentralen Exports dieselbe Zeichenkette tragen ([D-6]).
const W79 = buildWall("IW-79", 3000, 2600, []);
W79.brandklasse = "F30";
_aktiv = "w-79"; _we = W79; _eing = JSON.parse(JSON.stringify(EING));
fireStore();
const sicht79 = $("blattwrap").innerHTML;
const g79 = (sicht79.match(/<g class="brand"[\s\S]*?<\/g>/) || [])[0] || "";
ok("[#79] Uebersicht zeigt die Klassifikation der aktiven Wand", $("ovBrand").textContent === "F30");
ok("[#79] das erzeugte Blatt traegt den Kurztext F30",
  /<g class="brand" data-brandklasse="F30">/.test(sicht79) && sicht79.includes("Brandschutz F30"));
ok("[#79] die Legende des Blattes benennt beide Klassifikationen in Worten",
  sicht79.includes("ohne Brandschutzklassifikation")
  && sicht79.includes("Brandschutzklassifikation F30"));
ok("[#79] Druck-HTML und SVG-Datei des zentralen Exports tragen dieselbe Angabe",
  g79.length > 0 && zeichnungHtml(W79, _eing).includes(g79)
  && zeichnungSvgText(W79, _eing).includes(g79));
globalThis.__printed = false;
$("print").dispatch("click");
ok("[#79] gedruckt wird genau dieses Blatt (kein zweites Rendering)",
  globalThis.__printed === true && $("blattwrap").innerHTML === sicht79);
ok("[#79] die Seite schreibt die Klassifikation nirgends zurueck",
  W79.brandklasse === "F30" && schreib.every(s => s.teil === "zeichnung")
  && !JSON.stringify(_eing).includes("brandklasse")
  && !/brandklasse/.test(JSON.stringify(_eing)));
// Dieselbe Seite, Wand OHNE das Feld: F0 in Blatt und Uebersicht — nichts geraten,
// und das Wandelement bekommt das Feld dabei nicht untergeschoben.
const W79b = buildWall("IW-79b", 2000, 2600, []);
_aktiv = "w-79b"; _we = W79b;
fireStore();
ok("[#79] Wand ohne das Feld: Blatt und Uebersicht weisen F0 aus",
  $("ovBrand").textContent === "F0"
  && /<g class="brand" data-brandklasse="F0">/.test($("blattwrap").innerHTML)
  && $("blattwrap").innerHTML.includes("Brandschutz F0")
  && !("brandklasse" in W79b));

// --- 7c) #82 Verzahnungsbereiche im ECHTEN Seitenpfad --------------------
// Gebaut wird ueber den echten Rechenkern (buildWall mit `interlocks`), gezeigt wird das
// von DIESER Seite erzeugte Blatt. Geprueft werden Kennzeichnung an der Rasterlage,
// Legende, Mangelblock und die Deckungsgleichheit mit Druck-HTML und SVG-Datei ([D-6]).
//
// Wandelement-Gruppen werden BALANCIERT ausgeschnitten (nicht per gierigem Muster):
// die Verzahnungsgruppe enthaelt je Bereich eine eigene Untergruppe.
function gruppe(svg, klasse) {
  const start = svg.indexOf(`<g class="${klasse}"`);
  if (start < 0) return "";
  let i = start, tiefe = 0;
  while (i < svg.length) {
    if (svg.startsWith("<g", i)) { tiefe++; i = svg.indexOf(">", i) + 1; continue; }
    if (svg.startsWith("</g>", i)) { tiefe--; i += 4; if (!tiefe) return svg.slice(start, i); continue; }
    i++;
  }
  return "";
}
/** Gezeichnete Steinrechtecke eines Blatt-SVG als {x,y,w,h,typ} (Papier-mm). */
const steinRechtecke = (svg) => [...svg.matchAll(
  /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{6})"/g)]
  .filter(m => m[5] === FARBE.i3 || m[5] === FARBE.i2)
  .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], typ: m[5] === FARBE.i3 ? "i3" : "i2" }));

// 3000 mm = 24 Raster; Bereich 5…8 laesst links 5 und rechts 16 Raster stehen — beides
// baubare Restbreiten, der Fall ist also regelkonform ([G-6]).
const W82 = buildWall("IW-82", 3000, 2600, [], null, null, [], [{ g0: 5, g1: 8, start_parity: 0 }]);
const W82ohne = buildWall("IW-82", 3000, 2600, []);
ok("[#82] Testwand traegt genau einen gueltigen Verzahnungsbereich (Voraussetzung)",
  W82.interlocks.length === 1 && W82.interlocks[0].g0 === 5 && W82.interlocks[0].g1 === 8
  && W82.validation.interlock_fehler.length === 0
  && W82.validation.interlock_invalid_segments.length === 0
  && W82ohne.interlocks.length === 0);

_aktiv = "w-82"; _we = W82; _eing = JSON.parse(JSON.stringify(EING));
fireStore();
const sicht82 = $("blattwrap").innerHTML;
const svg82 = (sicht82.match(/<svg[\s\S]*?<\/svg>/) || [""])[0];
const g82 = gruppe(svg82, "verzahnung");
const M82 = Z.masstab;                       // Masstab genau dieses Blattes

ok("[#82] Uebersicht nennt die Verzahnungsbereiche der aktiven Wand",
  $("ovVerzahnung").textContent === "1 Bereich");
ok("[#82] das erzeugte Blatt traegt eine eigene Kennzeichnungsgruppe je Bereich",
  g82.length > 0 && g82.includes('data-verzahnung="5-8"'));
// Rasterlage: die beiden gestrichelten Begrenzungslinien stehen exakt auf g0 und g1.
{
  const x = k => PAD_MM + k * 125 / M82;
  const senkrecht = [...g82.matchAll(
    /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*stroke-dasharray/g)]
    .map(m => ({ x: +m[1], y0: +m[2], y1: +m[4] }));
  ok("[#82] die Kennzeichnung sitzt auf der realen Rasterlage des Bereichs",
    senkrecht.length === 2
    && Math.abs(senkrecht[0].x - x(5)) < 5e-4 && Math.abs(senkrecht[1].x - x(8)) < 5e-4);
  // … und laeuft ueber die volle Wandhoehe des Bereichs (Wandfuss bis Oberkante).
  const hPx = W82.height_mm / M82;
  ok("[#82] die Kennzeichnung laeuft ueber die volle Hoehe des Bereichs",
    senkrecht.every(l => Math.abs(l.y0 - (PAD_MM + hPx)) < 5e-4 && Math.abs(l.y1 - PAD_MM) < 5e-4));
}
ok("[#82] die Aussparungen sind schraffiert (zweites, nicht farbliches Merkmal)",
  (g82.match(/<line /g) || []).length > 10);
ok("[#82] die Legende des Blattes erklaert die Kennzeichnung in Worten",
  sicht82.includes(VERZAHNUNG.name) && sicht82.includes(">" + VERZAHNUNG.kuerzel + "</b>"));
// Schwarz-Weiss: ohne jede Farbangabe bleiben Kurztext, Strichelung und Legende lesbar.
{
  const ohneFarbe = s => s.replace(/(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/g, "")
    .replace(/style="color:#[0-9a-fA-F]{3,8}"/g, "");
  ok("[#82] die Kennzeichnung haengt nicht an einer Farbe (Schwarz-Weiss-Ausdruck)",
    ohneFarbe(g82).includes(">" + VERZAHNUNG.kuerzel + "<")
    && /stroke-dasharray/.test(ohneFarbe(g82))
    && ohneFarbe(sicht82).includes(VERZAHNUNG.name));
}
ok("[#82] Druck-HTML und SVG-Datei des zentralen Exports tragen dieselbe Zeichenkette",
  zeichnungHtml(W82, _eing).includes(g82) && zeichnungSvgText(W82, _eing).includes(g82));
globalThis.__printed = false;
$("print").dispatch("click");
ok("[#82] gedruckt wird genau dieses Blatt (kein zweites Rendering)",
  globalThis.__printed === true && $("blattwrap").innerHTML === sicht82);
// Der gezeichnete Verband ist GENAU der des Wandelements — kein Stein mehr, keiner weniger.
{
  const soll = W82.courses.flatMap(c => c.stones.map(st => ({
    x: PAD_MM + st.x0 / M82, w: (st.x1 - st.x0) / M82, typ: st.type })));
  const ist = steinRechtecke(svg82);
  ok("[#82] gezeichnete Steine entsprechen genau den Steinen des Wandelements",
    ist.length === soll.length && soll.every(s => ist.some(r => r.typ === s.typ
      && Math.abs(r.x - s.x) < 5e-4 && Math.abs(r.w - s.w) < 5e-4)));
}
ok("[#82] die Brandschutzgruppe bleibt die letzte Gruppe des Blatt-SVG",
  svg82.endsWith(gruppe(svg82, "brand") + "</svg>"));
ok("[#82] ohne Befund kein Verzahnungs-Mangelblock", !sicht82.includes(VERZAHNUNG_TITEL));

// Dieselbe Wand OHNE Verzahnungsbereich: keine Kennzeichnung, kein Legendeneintrag —
// und Vorschau, Druck-HTML und SVG-Datei bleiben untereinander deckungsgleich.
_aktiv = "w-82b"; _we = W82ohne;
fireStore();
{
  const sichtOhne = $("blattwrap").innerHTML;
  const svgOhne = (sichtOhne.match(/<svg[\s\S]*?<\/svg>/) || [""])[0];
  ok("[#82] Wand ohne Verzahnung: weder Kennzeichnung noch Legendeneintrag",
    !/class="verzahnung"/.test(sichtOhne) && !sichtOhne.includes(VERZAHNUNG.name)
    && !sichtOhne.includes(VERZAHNUNG_TITEL));
  ok("[#82] Wand ohne Verzahnung: Vorschau, Druck-HTML und SVG-Datei sind deckungsgleich",
    zeichnungHtml(W82ohne, _eing).includes(sichtOhne)
    && zeichnungSvgText(W82ohne, _eing).includes(svgOhne.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")));
  ok("[#82] Masstab und Blattformat sind mit und ohne Verzahnung gleich",
    Z.masstab === M82 && $("ovVerzahnung").textContent === "keine");
}

// Regelwidriger Bereich: er wird NICHT gezeichnet (er steht nicht im Verband), sondern
// benannt im eigenen Mangelblock — zusammen mit der dadurch nicht baubaren Restbreite.
const W82f = buildWall("IW-82f", 3000, 2600, [new Opening(10, 16, 0, 10, "tuer")], null, null, [],
  [{ g0: 1, g1: 4, start_parity: 0 }, { g0: 11, g1: 13, start_parity: 1 }]);
ok("[#82] Testwand: ein Bereich abgewiesen, ein Restsegment nicht baubar (Voraussetzung)",
  W82f.interlocks.length === 1
  && W82f.validation.interlock_fehler.some(f => f.grund === "ueberlappt_oeffnung")
  && W82f.validation.interlock_invalid_segments.length > 0);
_aktiv = "w-82f"; _we = W82f; _eing = JSON.parse(JSON.stringify(EING));
fireStore();
{
  const sichtF = $("blattwrap").innerHTML;
  const svgF = (sichtF.match(/<svg[\s\S]*?<\/svg>/) || [""])[0];
  ok("[#82] der regelwidrige Bereich steht benannt im Mangelblock des Blattes",
    sichtF.includes(VERZAHNUNG_TITEL) && sichtF.includes(VERZAHNUNG_GRUND.ueberlappt_oeffnung)
    && sichtF.includes("Raster 11–13"));
  ok("[#82] das nicht baubare Restsegment steht mit Steinreihe und Rasterlage dabei",
    sichtF.includes(VERZAHNUNG_RESTSEGMENT) && /Steinreihe 1, Raster 0, Breite 1 Raster/.test(sichtF));
  ok("[#82] gezeichnet wird nur der gueltige Bereich (nichts wird erfunden)",
    gruppe(svgF, "verzahnung").includes('data-verzahnung="1-4"')
    && !svgF.includes('data-verzahnung="11-13"'));
  ok("[#82] auch hier entsprechen die gezeichneten Steine genau dem Wandelement", (() => {
    const m = Z.masstab;
    const soll = W82f.courses.flatMap(c => c.stones.map(st => ({
      x: PAD_MM + st.x0 / m, w: (st.x1 - st.x0) / m, typ: st.type })));
    const ist = steinRechtecke(svgF);
    return ist.length === soll.length && soll.every(s => ist.some(r => r.typ === s.typ
      && Math.abs(r.x - s.x) < 5e-4 && Math.abs(r.w - s.w) < 5e-4));
  })());
  ok("[#82] derselbe Mangel steht im Druck-HTML des zentralen Exports ([D-6])",
    zeichnungHtml(W82f, _eing).includes(VERZAHNUNG_GRUND.ueberlappt_oeffnung)
    && zeichnungHtml(W82f, _eing).includes(VERZAHNUNG_RESTSEGMENT));
  // [G-12] ist KEIN Baubarkeitsausschluss: der eigene Kasten sagt, dass der Bereich nicht
  // ausgefuehrt ist — er erklaert das Blatt nicht fuer unvollstaendig. Geprueft ab dem
  // Verzahnungstitel, damit ein etwaiger Zuschnitt-Mangelblock davor nicht mitzaehlt.
  ok("[#82] der Verzahnungsmangel erklaert das Blatt nicht fuer unvollstaendig",
    sichtF.includes("nicht ausgeführt")
    && !/unvollständig/.test(sichtF.slice(sichtF.indexOf(VERZAHNUNG_TITEL))));
}
ok("[#82] die Seite schreibt die Verzahnung nirgends zurueck",
  JSON.stringify(_we.interlocks) === JSON.stringify(W82f.interlocks)
  && schreib.every(s => s.teil === "zeichnung")
  && !JSON.stringify(_eing).includes("interlock"));
ok("[#82] Modul 7 hat kein Bedienelement fuer Verzahnungsbereiche und zeichnet sie nicht selbst",
  !/<select[^>]*verzahn/i.test(html) && !/<input[^>]*verzahn/i.test(html)
  && !/interlocks\s*=/.test(html) && !/<g class="verzahnung"/.test(html));
_aktiv = "w-1"; _we = W; _eing = JSON.parse(JSON.stringify(EING));
fireStore();

// --- 8) Modul-Oberflaeche: keine dezentrale Dateifunktion ---------------
ok("kein Datei-Download / kein Datei-Upload im Modul",
  !/downloadZip|createObjectURL|type="file"|FileReader/.test(html));
ok("kein jsPDF/CDN im Modul", !/jspdf|html2canvas|cdnjs|unpkg/i.test(html));
// #61: kein zweiter Renderer und keine eigenen Papiermasse in der Oberflaeche
ok("Modul hat keine unabhaengigen Papiermasse und kein eigenes Seitenverhaeltnis",
  !/\b(420|297|277|281|210|194)\b/.test(html) && !/aspect-ratio/.test(html));
ok("Blatt kommt ausschliesslich aus blattHtml(); Geometrie aus blattInnen()",
  (html.match(/blattHtml\(WALL/g) || []).length === 1 && /blattInnen\(/.test(html));
ok("Modul verweist fuer Dateien auf den zentralen Export", /zentralen Export/.test(html));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
