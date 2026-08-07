// Smoke-Test Layout-Editor (docs/geschossplan.html, Etappe C4a, Issue #26).
//
// Geprueft wird die ECHTE Seitenlogik unter einem DOM-/localStorage-Double: das
// klassische App-Skript der Seite wird evaluiert, Shared-Code wie im Browser ueber
// window.SEMBLA gebunden und __gpInit() aufgerufen. Bedient wird ausschliesslich
// ueber die Pruefhilfen von window.__gp — sie laufen durch dieselben Ereignis-
// behandler wie Maus und Tastatur.
//
// Schwerpunkte der Etappe:
//  - Wand zeichnen: orthogonal ([L-2]), Laenge im 125-mm-Raster, Position in mm ([L-1]),
//    Lage im GESCHOSS der Projektmappe ([K-10]) — nie im Wandelement ([P-1]).
//  - Auswaehlen und Ziehen ueber verschiebe() ([K-9]): bestimmte Achsen sind gesperrt,
//    kein Mass wird angefasst.
//  - Kollisionen werden gemeldet, nie korrigiert ([K-13]); Farben nach [K-8].
//  - Plan bleibt Hintergrund: ohne Kalibrierung liegt er nicht unter der Zeichnung,
//    und weder Kalibrierung noch Versatz aendern eine Wandlage ([L-1]/[L-9]).

import { readFileSync } from "node:fs";

// --- Polyfills ------------------------------------------------------------
class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();

class El {
  constructor(id){
    this.id = id; this.value = ''; this.textContent = ''; this._h = ''; this.className = '';
    this.hidden = false; this.checked = false; this.disabled = false; this.style = {};
    this.dataset = {}; this.listeners = {}; this.files = [];
  }
  addEventListener(e, f){ (this.listeners[e] || (this.listeners[e] = [])).push(f); }
  dispatch(e, ev){ let r; (this.listeners[e] || []).forEach(f => { r = f(ev || { target: this }); }); return r; }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h = v; }
  // Die Zeichenflaeche liegt im Test bei 0/0 und ist 1000 × 600 gross — damit sind
  // Schirmkoordinaten direkt nachrechenbar.
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1000, height: 600 }; }
  querySelector(sel){
    if (sel !== 'svg' || !this._h.includes('<svg')) return null;
    return { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  }
  querySelectorAll(){ return []; }
}
// Vorbelegung wie im Markup (Haekchen und Felder der Werkzeugleiste).
const START = { 'gp-fang': { checked: true }, 'gp-plan-lock': { checked: true },
                'gp-hoehe': { value: '2600' }, 'gp-wandtyp': { value: 'mit_wind' },
                'kal-overlay': { hidden: true } };
const document = {
  _e: {},
  getElementById(id){
    let e = this._e[id];
    if (!e) { e = this._e[id] = new El(id); Object.assign(e, START[id] || {}); }
    return e;
  },
  createElement(){ return new El('_'); },
  querySelector(){ return null; },
  _l: {},
  addEventListener(e, f){ (this._l[e] || (this._l[e] = [])).push(f); },
  dispatch(e, ev){ (this._l[e] || []).forEach(f => f(ev)); },
  head: { appendChild(){} }, body: { appendChild(){}, insertBefore(){}, firstChild: null },
};
globalThis.document = document;
globalThis.window = { addEventListener(){}, location: { href: '' } };
let confirmAntwort = true;
globalThis.confirm = () => confirmAntwort;
globalThis.Blob = class { constructor(parts){ this._t = (parts || []).join(''); } };
URL.createObjectURL = () => 'blob:plan';
URL.revokeObjectURL = () => {};

/** Minimaler IndexedDB-Ersatz — derselbe wie im Modul-0-Test ([L-8]). */
function fakeIndexedDB(){
  const daten = new Map();
  const spaeter = (wert) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { req.result = wert(); if (req.onsuccess) req.onsuccess(); });
    return req;
  };
  const st = {
    put: (s) => spaeter(() => { daten.set(String(s.id), s); return s.id; }),
    get: (id) => spaeter(() => daten.get(String(id))),
    delete: (id) => spaeter(() => { daten.delete(String(id)); return undefined; }),
    getAllKeys: () => spaeter(() => [...daten.keys()]),
  };
  const db = { objectStoreNames: { contains: () => true }, createObjectStore: () => st,
               transaction: () => ({ objectStore: () => st }), close(){} };
  return { open(){ const req = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => { if (req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess(); });
    return req; } };
}

// --- Abhaengigkeiten wie im Browser ---------------------------------------
const store = await import("../../docs/shared/storage.js");
const MAPPE = await import("../../docs/shared/sembla-projektmappe.js");
const CON = await import("../../docs/shared/sembla-constraints.js");
const PLAN = await import("../../docs/shared/sembla-plan.js");
const { buildWall } = await import("../../docs/shared/sembla-core.js");
PLAN.setzeIndexedDB(fakeIndexedDB());

const html = readFileSync(new URL("../../docs/geschossplan.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische Skript
globalThis.window.SEMBLA = { store, MAPPE, CON, PLAN, buildWall };

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const $ = id => document.getElementById(id);
const warte = () => new Promise(r => setTimeout(r, 0));

// --- 0) Startzustand ohne aktives Geschoss --------------------------------
eval(script);
globalThis.window.__gpInit();
const GP = globalThis.window.__gp;

ok('ohne aktives Geschoss wird das benannt statt etwas erfunden ([L-10])',
  /Kein aktives Geschoss/.test($('gp-buehne').innerHTML)
  && /Projektplaner/.test($('gp-buehne').innerHTML));
ok('die Seite ist kein neues Modul (kein Reiter, Ruecklink auf Modul 0)',
  /mountNavbar\(0\)/.test(html) && /index\.html">‹ Projektplaner/.test(html));
ok('Bemassen und Fixieren sind sichtbar als C4b gekennzeichnet, nicht bedienbar',
  /id="wz-bemassen" disabled/.test(html) && /id="wz-fixieren" disabled/.test(html));

// --- 1) Projekt/Geschoss anlegen ------------------------------------------
const mappe = store.fuegeProjektHinzu('Testprojekt', { geschoss: 'EG', hoehe_mm: 2800 });
const gsId = MAPPE.alleGeschosse(mappe)[0].geschoss.id;
store.setzeAktivesGeschoss(gsId);
await warte();
GP.zeigeAlles();

ok('mit aktivem Geschoss wird gezeichnet (SVG mit Raster und Ursprung)',
  /<svg/.test(GP.svg) && /class="rasterfein"/.test(GP.svg) && /class="ursprung"/.test(GP.svg));
ok('Geschosshoehe steht als Vorgabe im Hoehenfeld ([L-5])', $('gp-hoehe').value === '2800');
ok('Statuszeile nennt den Stand', /0<\/b> Wand/.test($('gp-status').innerHTML));

// --- 2) Wand zeichnen ([L-1]/[L-2]) ---------------------------------------
GP.werkzeug('wand');
ok('Werkzeugwechsel ist an der Flaeche sichtbar', /zeichnet/.test($('gp-buehne').className));
GP.tippe({ x: 0, y: 0 });
ok('Startpunkt gesetzt, aber noch nichts angelegt',
  store.listeElemente().length === 0 && /Startpunkt gesetzt/.test($('gp-msg').textContent));
GP.taste('Escape');
ok('Escape verwirft den Entwurf, ohne etwas anzulegen',
  store.listeElemente().length === 0 && /verworfen/.test($('gp-msg').textContent));

GP.werkzeug('wand');
GP.tippe({ x: 0, y: 0 });
GP.tippe({ x: 3040, y: 60 });                        // leicht schief und krumm
await warte();
const el1 = store.listeElemente()[0];
const w1 = MAPPE.findeWand(store.holeMappe(), el1.id).wand;
ok('Zeichnen legt genau EIN Wandelement an', store.listeElemente().length === 1);
ok('[L-2] die Wand liegt orthogonal (Richtung x, die groessere Differenz gewinnt)',
  w1.lage.richtung === 'x');
ok('[L-1] die Laenge rastet auf 125 mm (3040 -> 3000 = 24 Raster)',
  w1.lage.laenge_grid === 24 && CON.laengeMm(w1.lage) === 3000);
ok('[L-1] die Position steht in mm und ist mit Fang ein Vielfaches von 125',
  w1.lage.start_mm.x === 0 && w1.lage.start_mm.y === 0);
ok('[K-10] die Lage steht im Geschoss der Projektmappe …',
  MAPPE.validiereMappe(store.holeMappe()).length === 0
  && localStorage.getItem('sembla:projekte').includes('start_mm'));
ok('… und NICHT im Wandelement ([P-1]/[L-3])',
  !localStorage.getItem('sembla:elemente').includes('start_mm')
  && el1.wandelement.length_mm === 3000 && el1.wandelement.height_mm === 2800);
ok('der gewaehlte Wandtyp steht am Wandelement', el1.wandelement.wandtyp === 'mit_wind');
ok('die gezeichnete Wand ist ausgewaehlt und aktiv gesetzt',
  GP.zustand.auswahl === el1.id && store.aktivId() === el1.id);
ok('die Wand erscheint in der Zeichnung', GP.svg.includes(`data-wand="${el1.id}"`));

// zu kurz: abgewiesen statt auf eine Rastereinheit aufgerundet
GP.werkzeug('wand');
GP.tippe({ x: 0, y: 2000 });
GP.tippe({ x: 40, y: 2000 });
ok('zu kurze Strecke wird benannt abgewiesen, nichts angelegt ([P-9])',
  store.listeElemente().length === 1 && /Zu kurz/.test($('gp-msg').textContent));

// --- 3) Auswaehlen und Ziehen ([K-9]) -------------------------------------
GP.werkzeug('auswahl');
GP.tippe({ x: 5000, y: 5000 });
ok('Klick ins Leere hebt die Auswahl auf', GP.zustand.auswahl === null);
ok('[K-8] ohne Bemassung und ohne Auswahl ist die Wand hellblau („frei")',
  GP.svg.includes(CON.FARBEN.frei) && !GP.svg.includes(CON.FARBEN.aktiv));
GP.tippe({ x: 1500, y: 0 });
ok('Klick auf die Wand waehlt sie aus', GP.zustand.auswahl === el1.id);
ok('[K-8] die ausgewaehlte Wand ist gruen', GP.svg.includes(CON.FARBEN.aktiv));

// Vorschau: waehrend des Ziehens steht die Gruppe gestrichelt im Bild, gespeichert ist nichts.
GP.zeigerAb({ x: 1500, y: 0 });
GP.zeigerBewegung({ x: 2000, y: 250 });
ok('waehrend des Ziehens gibt es eine Vorschau, aber noch keine gespeicherte Aenderung',
  /class="zug"/.test(GP.svg)
  && MAPPE.findeWand(store.holeMappe(), el1.id).wand.lage.start_mm.x === 0);
GP.zeigerAuf();
await warte();
const nachZug = MAPPE.findeWand(store.holeMappe(), el1.id).wand;
ok('Ziehen verschiebt die Wand um den gerasterten Versatz',
  nachZug.lage.start_mm.x === 500 && nachZug.lage.start_mm.y === 250);
ok('Ziehen laesst Laenge und Richtung unberuehrt',
  nachZug.lage.laenge_grid === 24 && nachZug.lage.richtung === 'x');
ok('das Wandelement bleibt vom Ziehen unberuehrt ([P-1])',
  store.holeElement(el1.id).wandelement.length_mm === 3000);

// --- 4) [K-9]: eine bestimmte Achse laesst sich nicht ziehen --------------
// Bemassung direkt in die Mappe (die Bedienung dafuer kommt in C4b) — geprueft wird,
// dass der Editor den Loeser wirklich benutzt und die Sperre benennt.
store.aendereMappe(m => MAPPE.setzeBemassung(m, gsId, {
  id: 'bm-test', achse: 'x', von: null, bis: { wand: el1.id, bezug: 'min' }, mass_mm: 500,
}));
await warte();
ok('[K-4] mit Kette zum Ursprung gilt die Wand in x als bestimmt',
  GP.loesen().bestimmt[el1.id].x === true && GP.loesen().bestimmt[el1.id].y === false);
GP.tippe({ x: 2000, y: 250 });
GP.ziehe({ x: 2000, y: 250 }, { x: 2500, y: 500 });
await warte();
const nachSperre = MAPPE.findeWand(store.holeMappe(), el1.id).wand;
ok('[K-9] die bestimmte Achse bleibt stehen, die freie wandert',
  nachSperre.lage.start_mm.x === 500 && nachSperre.lage.start_mm.y === 500);
ok('[K-9] der Grund wird benannt', /bestimmt/.test($('gp-msg').textContent));
ok('[K-9] das Mass selbst bleibt unveraendert',
  MAPPE.bemassungen(store.holeMappe(), gsId)[0].mass_mm === 500);
store.aendereMappe(m => MAPPE.loescheBemassung(m, gsId, 'bm-test'));
await warte();

// --- 5) Kollision wird gemeldet, nie korrigiert ([K-13]) ------------------
GP.werkzeug('wand');
GP.tippe({ x: 1000, y: 500 });
GP.tippe({ x: 1000, y: 3000 });                      // kreuzt die erste Wand
await warte();
const el2 = store.listeElemente().find(e => e.id !== el1.id);
const koll = GP.loesen().kollisionen;
ok('zweite Wand liegt in y ([L-2])',
  MAPPE.findeWand(store.holeMappe(), el2.id).wand.lage.richtung === 'y');
ok('[K-13] die Ueberlappung wird erkannt und mit Mass benannt',
  koll.length === 1 && koll[0].ueberlappung_mm.x === 125 && /überlappen/.test(koll[0].meldung));
ok('[K-13] gemeldet in der Statuszeile, nichts verschoben',
  /Kollision/.test($('gp-status').innerHTML)
  && MAPPE.findeWand(store.holeMappe(), el1.id).wand.lage.start_mm.x === 500);
ok('[K-8] beide Waende sind rot', GP.svg.includes(CON.FARBEN.fehler));

// aufraeumen: die kreuzende Wand wieder wegziehen
GP.werkzeug('auswahl');
GP.tippe({ x: 1000, y: 2000 });
GP.ziehe({ x: 1000, y: 2000 }, { x: 5000, y: 2000 });
await warte();
ok('nach dem Wegziehen ist die Kollision weg', GP.loesen().kollisionen.length === 0);

// --- 6) Vorhandene, unverortete Wand verorten ([L-3]/[L-4]) ---------------
const fremdId = store.speichere('Wand aus Modul 0', buildWall('Wand aus Modul 0', 2000, 2800, []));
store.verorteWand(fremdId, gsId, { lage: null });
await warte();
$('gp-ziel').value = fremdId;
$('gp-ziel').dispatch('change');
ok('unverortete Waende stehen als Ziel zur Wahl',
  $('gp-ziel').innerHTML.includes(fremdId) && GP.zustand.ziel === fremdId);
GP.werkzeug('wand');
GP.tippe({ x: 0, y: 4000 });
GP.tippe({ x: 2500, y: 4000 });                      // absichtlich 2500 statt 2000
await warte();
const fremd = MAPPE.findeWand(store.holeMappe(), fremdId).wand;
ok('die vorhandene Wand wird verortet, ohne ein zweites Element anzulegen',
  store.listeElemente().length === 3 && fremd.lage.laenge_grid === 20);
ok('[L-3] die Laengenabweichung wird gemeldet, nicht angeglichen',
  /2000 mm lang/.test($('gp-msg').textContent)
  && store.holeElement(fremdId).wandelement.length_mm === 2000);
ok('[L-3] die Abweichung steht auch in der Statuszeile',
  /Längenabweichung/.test($('gp-status').innerHTML));

// Lage wieder aufheben — der Eintrag im Geschoss bleibt ([L-4])
GP.werkzeug('auswahl');
GP.tippe({ x: 1000, y: 4000 });
$('gp-lage-weg').dispatch('click');
await warte();
ok('„Lage aufheben" nimmt nur die Lage, nicht den Eintrag',
  MAPPE.findeWand(store.holeMappe(), fremdId).wand.lage === null
  && !!store.holeElement(fremdId));

// --- 7) Plan als Hintergrund ([L-8]/[L-9]) --------------------------------
const lagenVorPlan = JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage));
await PLAN.speicherePlan(gsId, new Blob(['bild']), { name: 'eg.png', typ: 'image/png',
  groesse: 1000, breite_px: 1600, hoehe_px: 1200 });
store.setzeGeschossPlan(gsId, { datei: 'eg.png', typ: 'image/png', breite_px: 1600,
  hoehe_px: 1200, mm_je_pixel: null, versatz_x_mm: 0, versatz_y_mm: 0 });
await GP.auffrischen(true);
ok('[L-9] ohne Kalibrierung liegt der Plan NICHT unter der Zeichnung',
  !/class="planbild"/.test(GP.svg) && /nicht kalibriert/.test($('gp-plan-info').innerHTML));

$('gp-mmjepx').value = '12,5';
$('gp-mass-uebernehmen').dispatch('click');
await warte();
ok('[L-9] Massstab per Zahleneingabe gesetzt (gleichwertiger Weg)',
  store.geschossPlan(gsId).mm_je_pixel === 12.5);
ok('mit Massstab erscheint das Planbild in Millimetermassen',
  /class="planbild"/.test(GP.svg) && GP.svg.includes('width="20000"'));
$('gp-mmjepx').value = '-3';
$('gp-mass-uebernehmen').dispatch('click');
ok('unsinniger Massstab wird abgewiesen, der Stand bleibt',
  store.geschossPlan(gsId).mm_je_pixel === 12.5 && $('gp-msg').className === 'msg err');

$('gp-vx').value = '375'; $('gp-vy').value = '-125';
$('gp-versatz-uebernehmen').dispatch('click');
await warte();
ok('Versatz uebernommen (der Plan wandert, nicht das Raster)',
  store.geschossPlan(gsId).versatz_x_mm === 375 && store.geschossPlan(gsId).versatz_y_mm === -125);
ok('[L-1] Massstab und Versatz haben KEINE Wandlage veraendert',
  JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === lagenVorPlan);

// Plan-Lock (§4.4): gesperrt bewegt Ziehen den Plan nicht
GP.werkzeug('plan');
GP.ziehe({ x: 0, y: 0 }, { x: 1000, y: 0 });
ok('gesperrter Plan: Ziehen bewegt ihn nicht und sagt warum',
  store.geschossPlan(gsId).versatz_x_mm === 375 && /gesperrt/.test($('gp-msg').textContent));
$('gp-plan-lock').checked = false;
$('gp-plan-lock').dispatch('change');
GP.ziehe({ x: 0, y: 0 }, { x: 1000, y: 0 });
await warte();
ok('entsperrt verschiebt Ziehen den Planversatz',
  store.geschossPlan(gsId).versatz_x_mm === 1375);
ok('[L-1] auch das Planziehen laesst jede Wandlage unberuehrt',
  JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === lagenVorPlan);

// --- 8) Kalibrieren mit orthogonal gezwungener Linie ([L-9], Feinschliff C4a) ---
store.setzeGeschossPlanAnsicht(gsId, { mm_je_pixel: null });
await warte();
$('gp-kalibrieren').dispatch('click');
// Ansichtszoom der Kalibrierfläche auf 1 stellen, damit Klickpunkte im Test direkt
// Bildpixel sind (im Browser rechnet svgPunktZuPixel den Zoom heraus).
GP.zustand.kal.zoom = 1;
ok('Kalibrieransicht offen (eigene Ansicht in Bildpixeln)',
  $('kal-overlay').hidden === false && /viewBox="0 0 1600 1200"/.test($('kal-buehne').innerHTML));
$('kal-buehne').dispatch('click', { clientX: 100, clientY: 100 });
$('kal-buehne').dispatch('click', { clientX: 400, clientY: 140 });   // leicht schief
ok('der zweite Punkt wird orthogonal gezwungen (y bleibt 100)',
  GP.zustand.kal.punkte[1].x === 400 && GP.zustand.kal.punkte[1].y === 100);
ok('die Kalibrierlinie ist gestrichelt und der Marker ein Kreuz mit Aussparung',
  /class="kallinie"/.test($('kal-buehne').innerHTML)
  && /stroke-dasharray/.test($('kal-buehne').innerHTML)
  && /class="kalpunkt"/.test($('kal-buehne').innerHTML)
  && !/<circle[^>]*class="kalpunkt"/.test($('kal-buehne').innerHTML));
$('kal-go').dispatch('click');
ok('ohne reale Laenge wird nicht uebernommen',
  store.geschossPlan(gsId).mm_je_pixel === null && $('kal-msg').className === 'msg err');
$('kal-mm').value = '3000';
$('kal-go').dispatch('click');
await warte();
ok('Massstab aus der Kalibrierlinie: 3000 mm / 300 px = 10 mm je Pixel',
  store.geschossPlan(gsId).mm_je_pixel === 10 && $('kal-overlay').hidden === true);
ok('[L-1] die Kalibrierung hat keine Wandlage angetastet',
  JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === lagenVorPlan);

// --- 9) Ansicht: Zoom und Fang -------------------------------------------
const mmVor = GP.blick.mm;
$('gp-zoom-plus').dispatch('click');
ok('Hineinzoomen verkleinert die Millimeter je Bildpunkt', GP.blick.mm < mmVor);
GP.zeigeAlles();
ok('„Alles zeigen" umfasst Waende und Plan', GP.blick.mm > 0 && Number.isFinite(GP.blick.x0));
$('gp-fang').checked = false;
$('gp-fang').dispatch('change');
ok('[L-1] ohne Fang rastet die Position auf halbe Millimeter',
  GP.fange({ x: 1234.3, y: -0.4 }).x === 1234.5 && GP.fange({ x: 1234.3, y: -0.4 }).y === -0.5);
$('gp-fang').checked = true;
$('gp-fang').dispatch('change');
ok('mit Fang rastet sie auf 125 mm', GP.fange({ x: 1234.3, y: 60 }).x === 1250);

// --- 10) Determinismus ([K-5]) -------------------------------------------
const a = JSON.stringify(GP.loesen()), b = JSON.stringify(GP.loesen());
ok('[K-5] gleicher Stand ⇒ bit-genau gleiches Ergebnis', a === b);

let fail = 0;
for (const [n, c] of checks) { console.log((c ? '  ok  ' : 'FAIL  ') + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
