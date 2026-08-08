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
                'gp-ref': { checked: true }, 'gp-ref-deck': { value: '25' },
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
/**
 * Eine Pruefhilfe der Seite aufrufen. Fehlt sie, liefert das `null` statt den
 * Lauf abzubrechen — eine fehlende Hilfe soll die zugehoerige Pruefung rot
 * faerben und nicht alle folgenden verschlucken.
 */
const gp = (name, ...args) => (typeof GP[name] === 'function' ? GP[name](...args) : null);

// --- 0) Startzustand ohne aktives Geschoss --------------------------------
eval(script);
globalThis.window.__gpInit();
const GP = globalThis.window.__gp;

ok('ohne aktives Geschoss wird das benannt statt etwas erfunden ([L-10])',
  /Kein aktives Geschoss/.test($('gp-buehne').innerHTML)
  && /Projektplaner/.test($('gp-buehne').innerHTML));
ok('die Seite ist kein neues Modul (kein Reiter, Ruecklink auf Modul 0)',
  /mountNavbar\(0\)/.test(html) && /index\.html">‹ Projektplaner/.test(html));
ok('Bemassen (D) und Fixieren (F) sind bedienbare Werkzeuge (Etappe C4b)',
  /id="wz-bemassen" data-wz="bemassen"/.test(html) && /id="wz-fixieren" data-wz="fixieren"/.test(html)
  && !/id="wz-bemassen" disabled/.test(html) && !/id="wz-fixieren" disabled/.test(html));

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
GP.zeigerAb({ x: 0, y: 0 });
ok('der Startpunkt sitzt auf dem DRUECKEN, nicht auf dem Loslassen',
  !!GP.zustand.zeichnen && GP.zustand.zeichnen.start.x === 0 && GP.zustand.zeichnen.wartet === false);
GP.zeigerBewegung({ x: 3040, y: 60 });
ok('vom Startpunkt aus laeuft eine Vorschau mit, gespeichert ist nichts',
  /class="entwurf"/.test(GP.svg) && store.listeElemente().length === 0);
GP.taste('Escape');
ok('Escape verwirft den Entwurf, ohne etwas anzulegen',
  store.listeElemente().length === 0 && /verworfen/.test($('gp-msg').textContent));

GP.werkzeug('wand');
GP.zeichne({ x: 0, y: 0 }, { x: 3040, y: 60 });      // druecken, ziehen, loslassen
await warte();
const el1 = store.listeElemente()[0];
const w1 = MAPPE.findeWand(store.holeMappe(), el1.id).wand;
ok('Zeichnen legt genau EIN Wandelement an', store.listeElemente().length === 1);
ok('[L-2] die Wand liegt orthogonal (Richtung x, die groessere Differenz gewinnt)',
  w1.lage.richtung === 'x');
ok('[L-1] die Laenge rastet auf 125 mm (3040 -> 3000 = 24 Raster)',
  w1.lage.laenge_grid === 24 && CON.laengeMm(w1.lage) === 3000);
ok('[L-1] die Position steht in mm; laengs rastet die Stirnkante auf das Raster',
  w1.lage.start_mm.x === 0);
// Der Anker liegt quer auf der MITTELLINIE — sie gehoert deshalb auf die Feldmitte,
// damit beide Laengskanten auf Rasterlinien landen (und nicht auf halben Feldern).
const r1 = CON.wandRechteck(w1.lage);
ok('die Mittellinie rastet quer auf die Feldmitte …', w1.lage.start_mm.y === 62.5);
ok('… womit alle vier Wandkanten auf dem 125-mm-Raster liegen',
  r1.x_min % 125 === 0 && r1.x_max % 125 === 0 && r1.y_min % 125 === 0 && r1.y_max % 125 === 0);
ok('[K-10] die Lage steht im Geschoss der Projektmappe …',
  MAPPE.validiereMappe(store.holeMappe()).length === 0
  && localStorage.getItem('sembla:projekte').includes('start_mm'));
ok('… und NICHT im Wandelement ([P-1]/[L-3])',
  !localStorage.getItem('sembla:elemente').includes('start_mm')
  && el1.wandelement.length_mm === 3000 && el1.wandelement.height_mm === 2800);
ok('der gewaehlte Wandtyp steht am Wandelement', el1.wandelement.wandtyp === 'mit_wind');
ok('die gezeichnete Wand ist aktiv und ausgewaehlt und aktiv gesetzt',
  GP.zustand.aktiv === el1.id && GP.zustand.auswahl.length === 1 && store.aktivId() === el1.id);
ok('die Wand erscheint in der Zeichnung', GP.svg.includes(`data-wand="${el1.id}"`));

// Klicken–klicken geht weiterhin: ein Klick ohne Zug laesst den Startpunkt stehen.
GP.werkzeug('wand');
GP.tippe({ x: 0, y: 2000 });
ok('ein Klick ohne Zug setzt nur den Startpunkt, ohne etwas anzulegen',
  store.listeElemente().length === 1 && /Startpunkt gesetzt/.test($('gp-msg').textContent));
GP.tippe({ x: 40, y: 2000 });
ok('zu kurze Strecke wird benannt abgewiesen, nichts angelegt ([P-9])',
  store.listeElemente().length === 1 && /Zu kurz/.test($('gp-msg').textContent));

// --- 3) Auswaehlen und Ziehen ([K-9]) -------------------------------------
GP.werkzeug('auswahl');
GP.tippe({ x: 5000, y: 5000 });
ok('Klick ins Leere hebt Auswahl und aktive Wand auf',
  GP.zustand.aktiv === null && GP.zustand.auswahl.length === 0);
ok('[K-8] ohne Bemassung und ohne aktive Wand ist die Wand hellblau („frei")',
  GP.svg.includes(CON.FARBEN.frei) && !GP.svg.includes(CON.FARBEN.aktiv));
GP.tippe({ x: 1500, y: 62.5 });
ok('Klick auf die Wand macht sie aktiv', GP.zustand.aktiv === el1.id);
ok('[K-8] die AKTIVE Wand ist gruen', GP.svg.includes(CON.FARBEN.aktiv));
ok('die aktive Wand hat drei Griffe: zwei Enden (Laenge) und einen in der Mitte (Verschieben)',
  GP.griffe().length === 3 && /class="griff griff-ende" data-ende="min"/.test(GP.svg)
  && /class="griff griff-ende" data-ende="max"/.test(GP.svg)
  && /class="griff griff-mitte"/.test(GP.svg));

// Vorschau: waehrend des Ziehens steht die Gruppe gestrichelt im Bild, gespeichert ist nichts.
GP.zeigerAb({ x: 1500, y: 62.5 });
GP.zeigerBewegung({ x: 2000, y: 312.5 });
ok('waehrend des Ziehens gibt es eine Vorschau, aber noch keine gespeicherte Aenderung',
  /class="zug"/.test(GP.svg)
  && MAPPE.findeWand(store.holeMappe(), el1.id).wand.lage.start_mm.x === 0);
GP.zeigerAuf();
await warte();
const nachZug = MAPPE.findeWand(store.holeMappe(), el1.id).wand;
ok('Ziehen am Wandkoerper verschiebt die Wand um den gerasterten Versatz',
  nachZug.lage.start_mm.x === 500 && nachZug.lage.start_mm.y === 312.5);
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
GP.tippe({ x: 2000, y: 312.5 });
GP.ziehe({ x: 2000, y: 312.5 }, { x: 2500, y: 562.5 });
await warte();
const nachSperre = MAPPE.findeWand(store.holeMappe(), el1.id).wand;
ok('[K-9] die bestimmte Achse bleibt stehen, die freie wandert',
  nachSperre.lage.start_mm.x === 500 && nachSperre.lage.start_mm.y === 562.5);
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

// --- 6b) Griffe aendern die LAENGE, nicht die Lage -------------------------
GP.werkzeug('wand');
GP.zeichne({ x: 0, y: 8000 }, { x: 2000, y: 8000 });
await warte();
const el3 = store.listeElemente().find(e => !['Wand 1', 'Wand 2', 'Wand aus Modul 0'].includes(e.name))
  || store.listeElemente()[store.listeElemente().length - 1];
const lage3 = () => MAPPE.findeWand(store.holeMappe(), el3.id).wand.lage;
ok('Ausgangslage der Pruefwand: 16 Raster, Kanten auf dem Raster',
  lage3().laenge_grid === 16 && lage3().start_mm.x === 0 && lage3().start_mm.y === 8062.5);

GP.werkzeug('auswahl');
GP.tippe({ x: 1000, y: 8062.5 });
ok('die Pruefwand ist aktiv', GP.zustand.aktiv === el3.id);
GP.zeigerAb({ x: 2000, y: 8062.5 });                 // Griff am Ende „max“
ok('das Ziehen am Endgriff aendert die GROESSE, nicht die Lage',
  !!GP.zustand.groesse && GP.zustand.groesse.ende === 'max' && GP.zustand.ziehen === null);
GP.zeigerBewegung({ x: 1300, y: 8062.5 });
ok('waehrend des Groessenziehens steht eine Vorschau im Bild, gespeichert ist nichts',
  /class="groesse"/.test(GP.svg) && lage3().laenge_grid === 16);
GP.zeigerAuf();
await warte();
ok('der Griff „max“ zieht nur die eigene Stirnkante — der Anker bleibt stehen',
  lage3().laenge_grid === 10 && lage3().start_mm.x === 0 && lage3().start_mm.y === 8062.5);

GP.ziehe({ x: 0, y: 8062.5 }, { x: 400, y: 8062.5 });   // Griff am Ende „min“
await warte();
ok('der Griff „min“ laesst die gegenueberliegende Stirnkante fest stehen',
  lage3().laenge_grid === 7 && lage3().start_mm.x === 375
  && CON.wandRechteck(lage3()).x_max === 1250);
ok('das Wandelement bleibt von der Groessenaenderung unberuehrt ([P-1]/[L-3])',
  store.holeElement(el3.id).wandelement.length_mm === 2000
  && /Längenabweichung/.test($('gp-status').innerHTML));

GP.ziehe({ x: 812.5, y: 8062.5 }, { x: 1062.5, y: 8062.5 });  // runder Griff in der Mitte
await warte();
ok('der Mittelgriff verschiebt die ganze Wand, ohne die Laenge anzutasten',
  lage3().laenge_grid === 7 && lage3().start_mm.x === 625 && lage3().start_mm.y === 8062.5);

// --- 6c) Um 90° drehen ----------------------------------------------------
const vorDrehung = JSON.stringify(lage3());
GP.taste('r');
await warte();
ok('Drehen wechselt die Richtung und laesst die Laenge unveraendert',
  lage3().richtung === 'y' && lage3().laenge_grid === 7);
ok('gedreht wird um die Min-Ecke — die Kanten liegen weiter auf dem Raster',
  lage3().start_mm.x === 687.5 && lage3().start_mm.y === 8000
  && CON.wandRechteck(lage3()).x_min === 625 && CON.wandRechteck(lage3()).y_min === 8000);
ok('das Wandelement bleibt vom Drehen unberuehrt ([P-1])',
  store.holeElement(el3.id).wandelement.length_mm === 2000);
$('gp-drehen').dispatch('click');
await warte();
ok('zweimal drehen kehrt zur Ausgangsrichtung zurueck', lage3().richtung === 'x');
ok('… und liefert wieder genau die Ausgangslage (kein Drift)',
  JSON.stringify(lage3()) === vorDrehung);

// --- 6d) Mehrfachauswahl: aktiv ist genau EINE ----------------------------
GP.tippe({ x: 1000, y: 8062.5 });
ok('Klick waehlt genau eine Wand aus und macht sie aktiv',
  GP.zustand.auswahl.length === 1 && GP.zustand.aktiv === el3.id);
GP.tippe({ x: 2000, y: 562.5 }, { shiftKey: true });     // erste Wand dazu
ok('Umschalt-Klick nimmt eine zweite Wand in die Auswahl auf',
  GP.zustand.auswahl.length === 2 && GP.zustand.auswahl.includes(el3.id));
ok('aktiv ist trotzdem genau EINE — die zuletzt angeklickte', GP.zustand.aktiv === el1.id);
ok('die ausgewaehlte, aber nicht aktive Wand bekommt nur einen Rahmen (keine zweite gruene)',
  /class="auswahlrahmen"/.test(GP.svg)
  && (GP.svg.match(/class="griff griff-mitte"/g) || []).length === 1);
GP.tippe({ x: 2000, y: 562.5 }, { shiftKey: true });     // dieselbe wieder abwaehlen
ok('nochmal Umschalt-Klick waehlt sie wieder ab',
  GP.zustand.auswahl.length === 1 && GP.zustand.aktiv === el3.id);

// Aufraeumen: die Pruefwand aus dem Weg raeumen, damit Abschnitt 7 unveraendert bleibt.
$('gp-lage-weg').dispatch('click');
await warte();

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

// ==========================================================================
//  Etappe C4b — Bemassen (D), Fixieren (F), Widerspruch/Redundanz, Undo/Redo
// ==========================================================================
// Eigenes, frisches Projekt: die Geometrie der Etappe C4a ist oben absichtlich
// verwinkelt, hier soll sie nachrechenbar sein.
const prj2 = store.fuegeProjektHinzu('C4b-Pruefprojekt', { geschoss: 'EG', hoehe_mm: 2600 });
const gs2 = MAPPE.alleGeschosse(prj2)[0].geschoss.id;
store.setzeAktivesGeschoss(gs2);
await warte();
GP.zeigeAlles();
ok('[K-10] der Rueckgaengig-Stapel gehoert zum Geschoss und startet leer',
  GP.undoStand.undo === 0 && GP.undoStand.redo === 0);

// Zwei parallele Waende in Richtung x, 3000 mm auseinander.
GP.werkzeug('wand');
GP.zeichne({ x: 0, y: 1000 }, { x: 2000, y: 1000 });
await warte();
GP.zeichne({ x: 0, y: 4000 }, { x: 2000, y: 4000 });
await warte();
const wA = MAPPE.alleGeschosse(store.holeMappe()).find(x => x.geschoss.id === gs2).geschoss.waende;
const idA = wA[0].id, idB = wA[1].id;
const lageVon = id => MAPPE.findeWand(store.holeMappe(), id).wand.lage;
/**
 * Mittelpunkt einer Wand in WELTkoordinaten — aus dem LOESUNGSERGEBNIS, also genau
 * dort, wo die Zeichenflaeche die Wand auch zeichnet und trifft.
 *
 * Die GESPEICHERTE Lage taugt dafuer nicht: sobald eine Bemassung zwei Waende zu
 * einer freien Gruppe verbindet, verankert der Loeser diese Gruppe deterministisch
 * an der lexikographisch KLEINSTEN Wandkennung ([K-5]). Die Kennungen sind echte
 * Zufalls-UUIDs (`crypto.randomUUID`), also von Lauf zu Lauf verschieden — je nach
 * Ausgang liegt die geloeste Position der einen oder der anderen Wand neben ihrem
 * gespeicherten Wert. Ein Klick auf eine fest eingetragene Zahl traefe die Wand
 * deshalb nur in etwa der Haelfte der Laeufe. Das ist KEIN Fehler des Loesers,
 * sondern genau das, was [K-5] zusagt; der Test muss dieselbe Quelle lesen wie die
 * Oberflaeche.
 */
const mitteVon = (id) => {
  const r = CON.wandRechteck(lageVon(id), GP.loesen().positionen[id]);
  return { x: (r.x_min + r.x_max) / 2, y: (r.y_min + r.y_max) / 2 };
};
ok('Pruefaufbau: zwei Waende in x, Mittellinien auf 1062,5 und 4062,5 mm',
  wA.length === 2 && lageVon(idA).start_mm.y === 1062.5 && lageVon(idB).start_mm.y === 4062.5
  && lageVon(idA).laenge_grid === 16);

// --- 11) Undo/Redo: eine neu angelegte Wand ist ein ATOMARER Schritt ------
ok('jede Zeichnung ist ein Rueckgaengig-Schritt', GP.undoStand.undo === 2);
const elementeVorUndo = store.listeElemente().length;
const elBVorUndo = JSON.stringify(store.holeElement(idB).wandelement);
const eingBVorUndo = JSON.stringify(store.holeElement(idB).eingaben ?? null);
GP.undo();
await warte();
ok('Rueckgaengig nimmt Geschosseintrag UND das in diesem Schritt angelegte Wandelement zurueck',
  !store.holeElement(idB) && !MAPPE.findeWand(store.holeMappe(), idB));
ok('fremde Wandelemente bleiben dabei unberuehrt — genau EINES verschwindet',
  !!store.holeElement(idA) && !!MAPPE.findeWand(store.holeMappe(), idA)
  && store.listeElemente().length === elementeVorUndo - 1);
GP.redo();
await warte();
const zurueck = store.holeElement(idB);
ok('Wiederholen legt dasselbe Wandelement unter derselben Kennung wieder an',
  !!zurueck && zurueck.id === idB && zurueck.wandelement.length_mm === 2000
  && zurueck.wandelement.height_mm === 2600);
ok('… und zwar bit-genau — Wandelement und Eingaben unveraendert ([P-1])',
  JSON.stringify(zurueck.wandelement) === elBVorUndo
  && JSON.stringify(zurueck.eingaben ?? null) === eingBVorUndo);
ok('… und traegt es wieder mit derselben Lage ins Geschoss ein',
  !!MAPPE.findeWand(store.holeMappe(), idB) && lageVon(idB).start_mm.y === 4062.5);

// --- 12) Bemassen (D): Achse folgt dem Bezug ([K-1]/[K-2]) ----------------
GP.werkzeug('bemassen');
ok('im Bemassen-Werkzeug sind alle sechs Bezuege je Wand sichtbar ([K-2])',
  (GP.svg.match(/class="bezug/g) || []).length === 12
  && /data-achse="x" data-bezug="mitte"/.test(GP.svg) && /data-achse="y" data-bezug="min"/.test(GP.svg));
GP.tippe(GP.bezugsPunkt(idA, 'y', 'mitte'));
ok('der erste Klick legt Startbezug UND Achse fest — sie wird nicht getrennt gewaehlt',
  GP.zustand.bem && GP.zustand.bem.achse === 'y'
  && GP.zustand.bem.von.wand === idA && GP.zustand.bem.von.bezug === 'mitte'
  && GP.zustand.bem.bis === null);
ok('[K-1] danach werden nur noch PARALLELE Bezuege angeboten',
  /data-achse="y"/.test(GP.svg) && !/data-achse="x"/.test(GP.svg));
GP.tippe(GP.bezugsPunkt(idA, 'y', 'mitte'));
ok('[K-3] derselbe Punkt zweimal ist kein Mass',
  /derselbe Punkt/.test($('gp-msg').textContent) && GP.zustand.bem.bis === null);
GP.tippe(GP.bezugsPunkt(idB, 'y', 'mitte'));
ok('der zweite Klick schlaegt den aktuellen Abstand vor (3000 mm), gespeichert ist nichts',
  $('gp-bem-wert').value === '3000' && GP.bemassungen().length === 0);
$('gp-bem-wert').value = '2500';
$('gp-bem-setzen').dispatch('click');
await warte();
const bm1 = GP.bemassungen()[0];
ok('[K-3] „Mass setzen" speichert ein treibendes Mass im GESCHOSS ([K-10])',
  GP.bemassungen().length === 1 && bm1.achse === 'y' && bm1.mass_mm === 2500
  && bm1.von.wand === idA && bm1.bis.wand === idB
  && localStorage.getItem('sembla:projekte').includes(bm1.id));
const pos12 = GP.loesen().positionen;
ok('das Mass ist wirksam: der geloeste Abstand betraegt 2500 mm',
  pos12[idB].y - pos12[idA].y === 2500);
ok('die gespeicherte Lage bleibt der letzte gueltige Stand — kein Rueckschreiben, keine zweite Wahrheit',
  lageVon(idB).start_mm.y === 4062.5);
ok('das Mass wird gezeichnet und ist anklickbar',
  GP.svg.includes(`data-bemassung="${bm1.id}"`) && /2500 mm/.test(GP.svg)
  && GP.bemTreffer(GP.bemPunkt(bm1.id)) === bm1.id);
ok('[K-12] ein nicht ganzzahliges Mass wird benannt abgewiesen, nicht gerundet',
  (() => { $('gp-bem-wert').value = '2500.5'; $('gp-bem-setzen').dispatch('click');
    return /nicht ganzzahlig/.test($('gp-msg').textContent) && GP.bemassungen()[0].mass_mm === 2500; })());

// --- 13) Laengenmass treibt die Laenge ([K-11]), nie das Wandelement ([L-3]) ---
GP.werkzeug('bemassen');
GP.tippe(GP.bezugsPunkt(idA, 'x', 'min'));
GP.tippe(GP.bezugsPunkt(idA, 'x', 'max'));
ok('zwei Stirnkanten derselben Wand sind ein Laengenmass', $('gp-bem-wert').value === '2000');
$('gp-bem-wert').value = '1300';
$('gp-bem-setzen').dispatch('click');
ok('[K-11] ein krummes Laengenmass wird abgewiesen und nennt die Nachbarmasse',
  /1250 mm oder 1375 mm/.test($('gp-msg').textContent)
  && GP.bemassungen().length === 1 && lageVon(idA).laenge_grid === 16);
$('gp-bem-wert').value = '1000';
$('gp-bem-setzen').dispatch('click');
await warte();
ok('[K-11] ein gueltiges Laengenmass treibt laenge_grid …',
  GP.bemassungen().length === 2 && lageVon(idA).laenge_grid === 8);
ok('… laesst den Anker stehen (die min-Stirnkante bleibt)', lageVon(idA).start_mm.x === 0);
ok('[L-3] das Wandelement bleibt unberuehrt, die Abweichung wird gemeldet',
  store.holeElement(idA).wandelement.length_mm === 2000
  && /Längenabweichung/.test($('gp-status').innerHTML));
ok('[K-11] die Laenge gilt nicht als geloest — „bestimmt" meint nur die Position',
  GP.loesen().bestimmt[idA].x === false);
GP.werkzeug('auswahl');
GP.tippe(mitteVon(idA));
const griffMax = GP.griffe().find(g => g.ende === 'max');
ok('die bemasste Wand ist anklickbar und traegt ihre drei Griffe',
  GP.zustand.aktiv === idA && GP.griffe().length === 3 && !!griffMax);
GP.ziehe(griffMax, { x: griffMax.x + 500, y: griffMax.y });
await warte();
ok('[K-11] am Endgriff wird die bemasste Laenge nicht ueberschrieben, das Mass wird genannt',
  lageVon(idA).laenge_grid === 8 && /Längenmaß/.test($('gp-msg').textContent));

// --- 14) Widerspruch wird benannt, nie aufgeloest ([K-6]/[K-8]) -----------
GP.werkzeug('bemassen');
GP.tippe(GP.bezugsPunkt(idA, 'y', 'max'));
GP.tippe(GP.bezugsPunkt(idB, 'y', 'max'));
$('gp-bem-wert').value = '3000';                     // muesste 2500 sein
$('gp-bem-setzen').dispatch('click');
await warte();
const streit = GP.loesen().widersprueche;
ok('[K-6] das widerspruechliche Mass wird GESPEICHERT und gemeldet',
  GP.bemassungen().length === 3 && streit.length === 1 && streit[0].differenz_mm === 500);
ok('[K-6] gemeldet werden beide Masse und die Differenz in mm',
  /500 mm/.test(streit[0].meldung) && !!streit[0].konflikt_mit
  && /Widerspruch/.test($('gp-status').innerHTML) && /500 mm/.test($('gp-status').innerHTML));
ok('[K-6] die Positionen behalten den letzten widerspruchsfreien Stand',
  GP.loesen().positionen[idB].y - GP.loesen().positionen[idA].y === 2500);
ok('[K-8] beide beteiligten Waende sind rot', GP.svg.includes(CON.FARBEN.fehler));
const streitId = GP.bemassungen()[2].id;
GP.werkzeug('auswahl');
GP.tippe(GP.bemPunkt(streitId));
ok('ein vorhandenes Mass ist anklickbar und zeigt seinen Wert zum Aendern',
  GP.zustand.bemAktiv === streitId && $('gp-bem-wert').value === '3000');
$('gp-bem-weg').dispatch('click');
await warte();
ok('[K-6] geloescht wird nur auf Ansage des Anwenders — danach ist der Widerspruch weg',
  GP.bemassungen().length === 2 && GP.loesen().widersprueche.length === 0);

// --- 15) Redundanz ist ein Hinweis, kein Fehler ([K-7]) -------------------
GP.werkzeug('bemassen');
GP.tippe(GP.bezugsPunkt(idA, 'y', 'min'));
GP.tippe(GP.bezugsPunkt(idB, 'y', 'min'));
$('gp-bem-wert').value = '2500';
$('gp-bem-setzen').dispatch('click');
await warte();
ok('[K-7] ein widerspruchsfrei wiederholtes Mass bleibt wirksam und wird als redundant gemeldet',
  GP.bemassungen().length === 3 && GP.loesen().redundanzen.length === 1
  && GP.loesen().widersprueche.length === 0
  && /redundant/.test($('gp-status').innerHTML));

// --- 16) Fixieren (F) gegen den EINZIGEN Geschossursprung ([K-4]) ---------
GP.werkzeug('fixieren');
// Die Mittellinie liegt 62,5 mm neben der Laengskante und ist damit in JEDEM Lauf krumm.
GP.tippe(GP.bezugsPunkt(idA, 'y', 'mitte'));
ok('[K-12] ein nicht ganzzahliger Abstand zum Ursprung wird benannt abgewiesen, nicht gerundet',
  /nicht ganzzahlig/.test($('gp-msg').textContent) && GP.bemassungen().length === 3);
// Erwartet wird der IST-Abstand aus dem Loeser, nicht eine feste Zahl: A haengt ueber
// das Mass aus Abschnitt 12 in einer freien Gruppe, deren Anker die lexikographisch
// kleinste Wandkennung ist ([K-5]) — und die Kennungen sind Zufalls-UUIDs. Genau
// diesen Ist-Abstand sagt „Fixieren" zu (ganzzahlig, [K-12]).
const yMinIst = CON.bezugsWert(lageVon(idA), 'y', 'min', GP.loesen().positionen[idA]);
GP.tippe(GP.bezugsPunkt(idA, 'y', 'min'));
await warte();
const fix1 = GP.bemassungen().find(b => b.von === null);
ok('[K-4] Fixieren speichert eine ganz normale Bemassung mit von:null — keine zweite Struktur',
  !!fix1 && fix1.von === null && fix1.bis.wand === idA && fix1.bis.bezug === 'min'
  && fix1.achse === 'y' && Number.isInteger(yMinIst) && fix1.mass_mm === yMinIst);
ok('[K-4] das fixierte Mass haelt die Wand genau dort, wo sie stand',
  GP.loesen().positionen[idA].y === yMinIst + CON.HALB_BREITE_MM);
ok('[K-4] fixiert wird GENAU die Achse des Bezugs — die andere bleibt frei',
  GP.loesen().bestimmt[idA].y === true && GP.loesen().bestimmt[idA].x === false);
ok('[K-4] ueber die Kette gilt auch die zweite Wand in dieser Achse als bestimmt',
  GP.loesen().bestimmt[idB].y === true);
ok('die Oberflaeche sagt, dass fuer die andere Achse ein zweites Mal zu fixieren ist',
  /zweites Mal fixieren/.test($('wz-hinweis').innerHTML));
GP.werkzeug('fixieren');
GP.tippe(GP.bezugsPunkt(idA, 'x', 'min'));
GP.tippe(GP.bezugsPunkt(idB, 'x', 'min'));
await warte();
ok('nach dem Fixieren beider Achsen sind beide Waende vollstaendig bestimmt ([K-8])',
  GP.loesen().offen.length === 0);
GP.werkzeug('auswahl');
GP.tippe({ x: 40000, y: 40000 });
ok('[K-8] vollstaendig bestimmte Waende sind schwarz, keine mehr hellblau',
  GP.svg.includes(CON.FARBEN.bestimmt) && !GP.svg.includes(CON.FARBEN.frei));
const alleLagenVorZug = JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage));
const undoVorZug = GP.undoStand.undo;
ok('[K-9] eine bestimmte Wand laesst sich nicht mehr ziehen',
  (() => { const vorher = JSON.stringify(lageVon(idA));
    const m = mitteVon(idA);
    GP.tippe(m); GP.ziehe(m, { x: m.x + 1000, y: m.y + 1000 });
    return GP.zustand.aktiv === idA && JSON.stringify(lageVon(idA)) === vorher
      && /bestimmt/.test($('gp-msg').textContent); })());
ok('ein gesperrter Zug schreibt GAR NICHTS — auch nicht die geloeste Position anderer Waende',
  JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === alleLagenVorZug
  && GP.undoStand.undo === undoVorZug);

// --- 17) Undo/Redo der Bemassungen; Grenze des Stapels --------------------
const masseVorher = GP.bemassungen().length;
GP.undo();
await warte();
ok('Rueckgaengig nimmt auch eine Bemassung zurueck',
  GP.bemassungen().length === masseVorher - 1);
GP.redo();
await warte();
ok('Wiederholen setzt sie wieder ein', GP.bemassungen().length === masseVorher);
GP.undo();
await warte();
ok('nach dem Rueckgaengigmachen steht ein Wiederholen bereit', GP.undoStand.redo >= 1);
GP.werkzeug('fixieren');
GP.tippe(GP.bezugsPunkt(idB, 'x', 'mitte'));         // neue Aenderung
await warte();
ok('eine neue Aenderung verwirft den Wiederholen-Stapel', GP.undoStand.redo === 0);

// Planbild, Kalibrierung, Massstab und Versatz gehoeren NICHT in den Stapel ([L-8]/[L-9]).
await PLAN.speicherePlan(gs2, new Blob(['bild2']), { name: 'eg2.png', typ: 'image/png',
  groesse: 900, breite_px: 800, hoehe_px: 600 });
store.setzeGeschossPlan(gs2, { datei: 'eg2.png', typ: 'image/png', breite_px: 800, hoehe_px: 600,
  mm_je_pixel: 5, versatz_x_mm: 250, versatz_y_mm: 0 });
await warte();
// Eine Layout-Aenderung, die GARANTIERT bucht: beide Waende sind an dieser Stelle in
// x und y bestimmt, ein Zug bewegt also nichts und wuerde still nichts eintragen —
// dann pruefte der Undo darunter etwas anderes als gemeint. Eine neu gezeichnete Wand
// bucht dagegen immer (und nimmt zugleich den atomaren Pfad mit).
const undoVorPlan = GP.undoStand.undo;
GP.werkzeug('wand');
GP.zeichne({ x: 6000, y: 6000 }, { x: 7000, y: 6000 });
await warte();
ok('die Vorbereitung ist wirklich eine gebuchte Layout-Aenderung',
  GP.undoStand.undo === undoVorPlan + 1);
store.setzeGeschossPlanAnsicht(gs2, { versatz_x_mm: 875 });
await warte();
GP.undo();
await warte();
ok('[L-9] Rueckgaengig laesst Massstab und Planversatz unberuehrt — sie sind Bedienung, keine Daten',
  store.geschossPlan(gs2).mm_je_pixel === 5 && store.geschossPlan(gs2).versatz_x_mm === 875);
ok('[L-8] das Planbild in der eigenen Datenbank fasst der Stapel gar nicht an',
  !!(await PLAN.holePlan(gs2)) && store.geschossPlan(gs2).datei === 'eg2.png');

// --- 18) Determinismus mit Bemassungen ([K-5]) ---------------------------
const c = JSON.stringify(GP.loesen()), d = JSON.stringify(GP.loesen());
ok('[K-5] auch mit Bemassungen gilt: gleiche Eingabe ⇒ bit-genau gleiches Ergebnis', c === d);

// ==========================================================================
//  Etappe C4c — Bauteilliste, Referenzgeschoss, Doppelklick auf die Massszahl
// ==========================================================================
// Alles hier ist REINE BEDIENUNG: kein neues Feld in der Projektmappe, keine
// neue Formatversion, keine [K]-Regel. Entsprechend prueft dieser Abschnitt vor
// allem, was NICHT passiert — kein Persistieren, keine Auswahl auf fremden
// Waenden, keine Kollision, kein zweiter Bearbeitungspfad fuer Masse.

// --- 19) Schwebende Bauteilliste ueber der Zeichenflaeche -----------------
const gsWaende = () => MAPPE.findeGeschoss(store.holeMappe(), gs2).geschoss.waende;
const liste = () => $('gp-liste').innerHTML;
/** Genau EINE Zeile der Bauteilliste — vom Klassennamen bis zum Anfang der naechsten. */
const zeileVon = (id) => (liste().split('class="gp-zeile')
  .find(s => s.includes(`data-wand="${id}"`)) || '');

// Zwei Sonderfaelle mit ins Geschoss: eine eingetragene, aber UNVERORTETE Wand
// und ein verwaister Eintrag ohne Wandelement ([L-4]).
const ohneLageId = store.speichere('Ohne Lage', buildWall('Ohne Lage', 1000, 2600, []));
store.verorteWand(ohneLageId, gs2, { lage: null });
store.aendereMappe(m => MAPPE.setzeWand(m, gs2, { id: 'wnd-verwaist', name: 'Verwaist', lage: null }));
await warte();
GP.render();

ok('die Bauteilliste liegt als eigenes Panel UEBER der Zeichenflaeche, nicht in ihr',
  /id="gp-liste"/.test(html) && /<div class="gp-buehne" id="gp-buehne"><\/div>/.test(html));
ok('sie fuehrt ALLE Waende des aktiven Geschosses auf',
  (liste().match(/class="gp-zeile/g) || []).length === gsWaende().length);
{
  const b = GP.loesen().bestimmt[idA];
  const erwartet = b.x && b.y ? 'x/y' : b.x ? 'nur x' : b.y ? 'nur y' : 'frei';
  const z = zeileVon(idA);
  ok('die Kurzbeschreibung nennt Name, Laenge, Hoehe, Wandtyp und Bestimmtheit',
    z.includes(store.holeElement(idA).name) && z.includes(`${CON.laengeMm(lageVon(idA))} mm`)
    && z.includes('2600') && /mit Wind/.test(z) && z.includes(erwartet));
}
ok('die Bestimmtheit steht kompakt als x/y, nur x, nur y oder frei — ohne Massanzahl',
  /x\/y|nur x|nur y|frei/.test(zeileVon(idA)) && !/Ma(ss|ß)e?\s*:/.test(zeileVon(idA)));
ok('eine unverortete Wand steht als solche da, ohne erfundene Laenge',
  /unverortet/.test(zeileVon(ohneLageId)));
ok('[L-4] ein verwaister Eintrag wird gemeldet, Hoehe und Wandtyp werden NICHT geraten',
  /verwaist/i.test(zeileVon('wnd-verwaist')) && !/mit Wind|ohne Wind/.test(zeileVon('wnd-verwaist')));

// Auswahl in beide Richtungen — ueber DIESELBE Auswahlfunktion wie die Zeichnung.
GP.werkzeug('auswahl');
gp('listeKlick', idA);
ok('Klick in der Liste macht die Wand aktiv (Liste ⇒ Zeichnung)',
  GP.zustand.aktiv === idA && GP.zustand.auswahl.length === 1
  && GP.svg.includes(CON.FARBEN.aktiv));
gp('listeKlick', idB, { shiftKey: true });
ok('Umschalt-Klick in der Liste nimmt eine zweite Wand hinzu — aktiv bleibt genau EINE',
  GP.zustand.auswahl.length === 2 && GP.zustand.aktiv === idB);
ok('aktiv und ausgewaehlt werden in der Liste NICHT vermischt: eine Zeile aktiv, eine gewaehlt',
  (liste().match(/gp-zeile aktiv/g) || []).length === 1
  && (liste().match(/gp-zeile gewaehlt/g) || []).length === 1);
GP.tippe(mitteVon(idA));
ok('Klick in der Zeichnung markiert die Zeile (Zeichnung ⇒ Liste)',
  GP.zustand.aktiv === idA && zeileVon(idA).startsWith(' aktiv"')
  && (liste().match(/gp-zeile aktiv/g) || []).length === 1);
{
  const vorher = localStorage.getItem('sembla:projekte');
  const undoVor = GP.undoStand.undo;
  gp('listeKlick', ohneLageId);
  ok('die Liste ist Anzeige + Auswahl und KEIN Verortungsweg — sie schreibt nichts',
    GP.zustand.aktiv === ohneLageId
    && localStorage.getItem('sembla:projekte') === vorher && GP.undoStand.undo === undoVor
    && MAPPE.findeWand(store.holeMappe(), ohneLageId).wand.lage === null);
}

// --- 20) Referenzgeschoss: das Geschoss darunter, blass und unantastbar ---
ok('ohne Geschoss darunter wird das benannt statt eines erfunden',
  /Kein Geschoss darunter/.test($('gp-ref-info').innerHTML) && !/class="ref-wand"/.test(GP.svg));

// Zwei Rechtecke des EG merken, solange das EG aktiv ist — die Referenz zeichnet
// den GELOESTEN Stand, also muss der Test dieselbe Quelle lesen ([K-5]).
const ergEG = GP.loesen();
const rEGa = CON.wandRechteck(lageVon(idA), ergEG.positionen[idA]);
const rEGb = CON.wandRechteck(lageVon(idB), ergEG.positionen[idB]);
const gebId = MAPPE.findeGeschoss(store.holeMappe(), gs2).gebaeude.id;
let ogId;
store.aendereMappe(m => { const r = MAPPE.fuegeGeschossHinzu(m, gebId, '1. OG', 2600); ogId = r.id; return r.mappe; });
store.setzeAktivesGeschoss(ogId);
await warte();
GP.zeigeAlles();
ok('das unmittelbar darunterliegende Geschoss ist Index minus 1 im selben Gebaeude …',
  /Referenz/.test($('gp-ref-info').innerHTML) && /EG/.test($('gp-ref-info').innerHTML));

// Eine Wand im 1. OG genau AUF die EG-Wand idA legen — sie darf keine Kollision ausloesen.
GP.werkzeug('wand');
GP.zeichne({ x: rEGa.x_min, y: (rEGa.y_min + rEGa.y_max) / 2 },
           { x: rEGa.x_max, y: (rEGa.y_min + rEGa.y_max) / 2 });
await warte();
const ogWaende = MAPPE.findeGeschoss(store.holeMappe(), ogId).geschoss.waende;
const idOG = ogWaende[0] ? ogWaende[0].id : null;
ok('Pruefaufbau: das 1. OG hat genau eine Wand, deckungsgleich mit einer EG-Wand',
  ogWaende.length === 1 && !!idOG);
ok('das Geschoss darunter erscheint als blasse Umrisse',
  (GP.svg.match(/class="ref-wand"/g) || []).length
    === gsWaende().filter(w => w.lage != null).length);
ok('die Referenz ist standardmaessig sichtbar und 25 % deckend',
  $('gp-ref').checked === true && /class="referenz" pointer-events="none" opacity="0.25"/.test(GP.svg)
  && GP.zustand.refDeckkraft === 0.25);
ok('Referenzwaende sind nicht anklickbar: kein data-wand, pointer-events aus',
  !/class="ref-wand"[^>]*data-wand/.test(GP.svg)
  && (GP.svg.match(/data-wand=/g) || []).length === ogWaende.length);
{
  // Ein Punkt, der NUR von einer Referenzwand bedeckt ist (idB hat im OG keine Entsprechung).
  const p = { x: (rEGb.x_min + rEGb.x_max) / 2, y: (rEGb.y_min + rEGb.y_max) / 2 };
  GP.werkzeug('auswahl');
  GP.tippe(p);
  ok('ein Klick auf eine Referenzwand waehlt NICHTS aus',
    GP.treffer(p) === null && GP.zustand.aktiv === null);
}
ok('[K-13] die deckungsgleiche Referenzwand erzeugt KEINE Kollision …',
  GP.loesen().kollisionen.length === 0 && !GP.svg.includes(CON.FARBEN.fehler));
{
  const ohne = JSON.stringify(GP.loesen());
  $('gp-ref').checked = false; $('gp-ref').dispatch('change');
  ok('… und der Loeser sieht sie ueberhaupt nicht — bit-genau dasselbe Ergebnis mit und ohne Referenz',
    JSON.stringify(GP.loesen()) === ohne && !/class="ref-wand"/.test(GP.svg));
  $('gp-ref').checked = true; $('gp-ref').dispatch('change');
}
{
  const vorher = localStorage.getItem('sembla:projekte');
  $('gp-ref-deck').value = '60';
  $('gp-ref-deck').dispatch('change');
  ok('die Deckkraft ist einstellbar', /class="referenz" pointer-events="none" opacity="0.6"/.test(GP.svg));
  ok('Sichtbarkeit und Deckkraft werden NICHT in der Projektmappe gespeichert',
    localStorage.getItem('sembla:projekte') === vorher
    && !/refDeckkraft|referenzgeschoss/i.test(localStorage.getItem('sembla:projekte')));
  $('gp-ref-deck').value = '25';
  $('gp-ref-deck').dispatch('change');
}

// --- 21) Doppelklick auf die Masszahl oeffnet den vorhandenen Masseditor --
store.setzeAktivesGeschoss(gs2);
await warte();
GP.zeigeAlles();
GP.werkzeug('auswahl');
const bmT = GP.bemassungen()[0];
ok('Pruefaufbau: im EG steht mindestens ein Mass', !!bmT);
const textPunkt = gp('bemTextPunkt', bmT ? bmT.id : null);
ok('die dargestellte Masszahl gehoert zur Trefferflaeche des Masses (CAD-Verhalten)',
  !!textPunkt && GP.bemTreffer(textPunkt) === bmT.id);
{
  const mappeVor = localStorage.getItem('sembla:projekte');
  const undoVor = GP.undoStand.undo;
  gp('doppeltippe', textPunkt);
  ok('Doppelklick auf die Masszahl waehlt genau dieses Mass zur Bearbeitung',
    GP.zustand.bemAktiv === bmT.id && $('gp-bem-wert').value === String(bmT.mass_mm));
  ok('… und zwar im VORHANDENEN Masseditor — kein zweiter Bearbeitungspfad',
    $('gp-bem-setzen').disabled === false && $('gp-bem-weg').disabled === false);
  ok('… ohne das Werkzeug zu wechseln', GP.zustand.werkzeug === 'auswahl');
  ok('… und ohne irgendetwas zu speichern (die Massesemantik bleibt unveraendert, [K-3])',
    localStorage.getItem('sembla:projekte') === mappeVor && GP.undoStand.undo === undoVor
    && GP.bemassungen().length === MAPPE.bemassungen(store.holeMappe(), gs2).length);
}
{
  // Der gewohnte Weg bleibt der einzige Schreibweg: Wert eintragen, „Mass setzen".
  const neu = bmT.mass_mm + 125;
  $('gp-bem-wert').value = String(neu);
  $('gp-bem-setzen').dispatch('click');
  await warte();
  ok('das im Doppelklick geoeffnete Mass wird ueber denselben Knopf geaendert',
    GP.bemassungen().find(b => b.id === bmT.id).mass_mm === neu);
  $('gp-bem-wert').value = String(bmT.mass_mm);
  $('gp-bem-setzen').dispatch('click');
  await warte();
}
{
  const vor = GP.zustand.bemAktiv;
  gp('doppeltippe', { x: 90000, y: 90000 });
  ok('ein Doppelklick ins Leere aendert nichts', GP.zustand.bemAktiv === vor);
}

// --- 22) Kein Textauswahl-Cursor ueber der Wandbeschriftung ---------------
const svgTextRegel = (html.match(/\.gp-buehne svg text\s*\{[^}]*\}/) || [''])[0];
ok('Beschriftungen in der Zeichenflaeche sind nicht markierbar (kein I-Beam)',
  /user-select:\s*none/.test(svgTextRegel) && /-webkit-user-select:\s*none/.test(svgTextRegel));
ok('sie fangen auch keine Zeigerereignisse ab — die Wandinteraktion bleibt klar',
  /pointer-events:\s*none/.test(svgTextRegel));
ok('die Regel gilt AUSSCHLIESSLICH unterhalb der Zeichenflaeche',
  (html.match(/user-select/g) || []).length === 2
  && !/\*\s*\{[^}]*user-select/.test(html)
  && !/\.field[^{]*\{[^}]*user-select/.test(html));
ok('echte Eingabefelder bleiben unangetastet — das Massfeld ist weiter bedienbar',
  (() => { $('gp-bem-wert').value = '4321'; return $('gp-bem-wert').value === '4321'; })());
ok('trotz pointer-events:none bleibt der Doppelklick auf die Masszahl moeglich '
  + '(getroffen wird geometrisch in Weltkoordinaten, nicht ueber DOM-Knoten)',
  /addEventListener\('dblclick'/.test(html) && !!textPunkt && GP.bemTreffer(textPunkt) === bmT.id);

let fail = 0;
for (const [n, c] of checks) { console.log((c ? '  ok  ' : 'FAIL  ') + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
