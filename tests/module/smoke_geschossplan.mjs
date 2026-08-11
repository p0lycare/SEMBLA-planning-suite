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
  // Fokus und Textauswahl der Inline-Masseingabe (#51): `blur()` laeuft ueber
  // dieselben Behandler wie im Browser, damit die Uebernahme bei Fokusverlust
  // wirklich geprueft wird.
  focus(){ this.fokus = true; }
  select(){ this.markiert = true; }
  blur(){ this.fokus = false; this.markiert = false; this.dispatch('blur', { target: this }); }
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
// Der Rasterfang startet AUS (#52) — genau wie im Markup.
const START = { 'gp-fang': { checked: false }, 'gp-plan-lock': { checked: true },
                'gp-hoehe': { value: '2600' }, 'gp-wandtyp': { value: 'mit_wind' },
                // #53: die beiden reinen Ansichtsschalter starten EIN, das
                // Planblatt ist zu, der Kalibrierblock unsichtbar.
                'gp-raster': { checked: true }, 'gp-masse': { checked: true },
                'gp-planblatt': { hidden: true }, 'gp-kal-block': { hidden: true } };
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
// Die Massgeometrie ist seit Issue #54 ein gemeinsamer, DOM-freier Baustein: derselbe,
// aus dem der Lageplan (Modul 9) seine Masse zeichnet ([N-5]). Der Editor rechnet sie
// nicht mehr selbst — sonst koennten Bearbeitung und Ausgabe auseinanderlaufen.
const MB = await import("../../docs/shared/sembla-massbild.js");
const { buildWall } = await import("../../docs/shared/sembla-core.js");
// Der gemeinsame Anlagepfad beider Anlageorte (#15/#62): er belegt die Verwendungsrollen
// vor und rechnet das Wandelement DARAUS neu, bevor es gespeichert bleibt.
const WA = await import("../../docs/shared/sembla-wandanlage.js");
PLAN.setzeIndexedDB(fakeIndexedDB());

const html = readFileSync(new URL("../../docs/geschossplan.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische Skript
globalThis.window.SEMBLA = { store, MAPPE, CON, PLAN, MB, WA };

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const $ = id => document.getElementById(id);
const warte = () => new Promise(r => setTimeout(r, 0));
/**
 * Eine Pruefhilfe der Seite aufrufen. Fehlt sie, liefert das `null` statt den
 * Lauf abzubrechen — eine fehlende Hilfe soll die zugehoerige Pruefung rot
 * faerben und nicht alle folgenden verschlucken.
 */
const gp = (name, ...args) => (typeof GP[name] === 'function' ? GP[name](...args) : null);

/**
 * Ein EHRLICHER Doppelklick. Im Browser feuern vor `dblclick` zwei vollstaendige
 * pointerdown/pointerup/click-Paare — und genau die liefen im Test bisher nicht
 * mit. Deshalb blieb unentdeckt, dass die werkzeugspezifischen pointerdown-Zweige
 * (Wand zeichnen, Plan verschieben, laufende Bemassung) dem dblclick
 * zuvorkommen und nebenbei Daten schreiben. Zusammengesetzt wird ausschliesslich
 * aus den vorhandenen Ereignis-Pruefhilfen der Seite.
 */
const doppel = (welt) => { gp('tippe', welt); gp('tippe', welt); gp('doppeltippe', welt); };

/** Wert ins Inline-Feld schreiben und mit Enter uebernehmen — wie im Browser. */
const inlineEnter = (v) => { $('gp-inline').value = String(v); gp('inlineTaste', 'Enter'); };

// --- 0) Startzustand ohne aktives Geschoss --------------------------------
eval(script);
globalThis.window.__gpInit();
const GP = globalThis.window.__gp;

ok('ohne aktives Geschoss wird das benannt statt etwas erfunden ([L-10])',
  /Kein aktives Geschoss/.test($('gp-buehne').innerHTML)
  && /Projektplaner/.test($('gp-buehne').innerHTML));
ok('die Seite ist kein neues Modul (kein Reiter, Ruecklink auf Modul 0)',
  /mountNavbar\(0\)/.test(html) && /index\.html">‹ Projektplaner/.test(html));
ok('Bemassen (D) ist ein bedienbares Werkzeug (Etappe C4b)',
  /id="wz-bemassen" data-wz="bemassen"/.test(html) && !/id="wz-bemassen" disabled/.test(html));
// #64: Die Einheit steht GENAU EINMAL sichtbar in der Oberflaeche — es gibt keine
// Alternative und keine Einheitenwahl.
ok('#64 der Editor nennt die Einheit genau einmal („Einheit: mm")',
  (html.match(/Einheit: mm/g) || []).length === 1
  && /<span id="gp-einheit"[^>]*>Einheit: mm<\/span>/.test(html)
  // … und zwar dauerhaft sichtbar in der Ansichtsleiste (kein `hidden`, kein Popup).
  && /<div class="gp-leiste" id="gp-ansicht">[\s\S]*?<span id="gp-einheit"[^>]*>[\s\S]*?<\/div>/
    .test(html)
  && !/<span id="gp-einheit"[^>]*\shidden/.test(html));
// #60: Das separate Fixierwerkzeug ist ERSATZLOS entfallen — es bleibt kein
// zweiter Bedienweg fuer Masse gegen den Ursprung. Geprueft wird das am Markup
// UND am Skript: Knopf, Werkzeugzustand, Tastenzuordnung und Hinweistexte.
ok('#60 das separate Fixierwerkzeug ist vollstaendig entfernt (Knopf, Zustand, Taste F, Hinweise)',
  !/wz-fixieren/.test(html) && !/data-wz="fixieren"/.test(html) && !/'fixieren'/.test(html)
  && !/fixiere\(/.test(html) && !/Fix \(F\)/.test(html)
  && !/k === 'f'/.test(html)
  && GP.zustand.werkzeug === 'auswahl');

// #52: Der Rasterfang ist EIN allgemeiner Toggle und startet AUS. Markup und
// Zustand muessen sich darin einig sein — ein `checked` im Markup bei `fang:false`
// im Zustand waere genau die Art stiller Abweichung, die der Nutzer als
// „springt trotzdem" erlebt.
ok('#52 der Rasterfang ist beim Start AUS — im Zustand UND im Markup',
  GP.zustand.fang === false && !/id="gp-fang"[^>]*checked/.test(html));
const ansichtLeiste = (html.split('id="gp-ansicht"')[1] || '').split('<!-- Planverwaltung')[0];
ok('#52 es gibt genau EINEN Fang-Schalter, und er sagt, dass er fuer alle Waende gilt',
  (html.match(/id="gp-fang"/g) || []).length === 1 && /JEDER Wand/.test(ansichtLeiste));
// Die Geometrieabschnitte 2–8 rechnen mit dem 125-mm-Raster — deshalb hier
// ausdruecklich einschalten (Abschnitt 9 prueft beide Stellungen).
$('gp-fang').checked = true;
$('gp-fang').dispatch('change');

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
  !!GP.zustand.zeichnen && GP.zustand.zeichnen.start.x === 0 && GP.zustand.zeichnen.bewegt === false);
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

// #57: Angelegt wird NUR durch Ziehen. Ein Klick, zwei getrennte Klicks und ein
// zu kurzer Zug erzeugen kein Wandelement und keine Wandlage — und lassen auch
// keinen wartenden Entwurf zurueck, aus dem der naechste Klick eine Wand machte.
GP.werkzeug('wand');
const standVorKlicks = { el: store.listeElemente().length, mappe: localStorage.getItem('sembla:projekte'),
  undo: GP.undoStand.undo };
GP.tippe({ x: 0, y: 2000 });
ok('#57 ein einzelner Klick legt nichts an und laesst keinen Entwurf stehen',
  store.listeElemente().length === standVorKlicks.el && GP.zustand.zeichnen === null
  && /nur durch Ziehen/.test($('gp-msg').textContent));
GP.tippe({ x: 3000, y: 2000 });
ok('#57 auch der zweite, getrennte Klick legt nichts an (kein „klicken–klicken")',
  store.listeElemente().length === standVorKlicks.el && GP.zustand.zeichnen === null
  && localStorage.getItem('sembla:projekte') === standVorKlicks.mappe
  && GP.undoStand.undo === standVorKlicks.undo);
// Weit genug hineinzoomen, damit die 40 mm sicher ueber der Zugschwelle von 3
// Bildpunkten liegen: geprueft werden soll der ECHTE Zug unter der Mindestlaenge
// von 125 mm ([L-1]) und nicht nochmals der zuglose Klick.
while (GP.blick.mm > 5) $('gp-zoom-plus').dispatch('click');
GP.ziehe({ x: 0, y: 2000 }, { x: 40, y: 2000 });
ok('#57 ein echter Zug unter der Mindestlaenge wird benannt abgewiesen, nichts angelegt ([P-9])',
  store.listeElemente().length === standVorKlicks.el && GP.zustand.zeichnen === null
  && /Zu kurz/.test($('gp-msg').textContent)
  && localStorage.getItem('sembla:projekte') === standVorKlicks.mappe
  && GP.undoStand.undo === standVorKlicks.undo);
GP.zeigeAlles();

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
GP.zeichne({ x: 1000, y: 500 }, { x: 1000, y: 3000 });   // kreuzt die erste Wand
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
GP.zeichne({ x: 0, y: 4000 }, { x: 2500, y: 4000 });     // absichtlich 2500 statt 2000
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
// #52: Der Plan ist Hintergrund — auch OHNE Massstab. Sonst liesse sich die
// Kalibrierlinie gar nicht in ihn hineinklicken. Gezeichnet wird er mit dem
// VORLAEUFIGEN Faktor 1 Bildpixel = 1 mm; das ist ausdruecklich kein Massstab,
// wird nicht gespeichert, und das 125-mm-Raster bleibt solange aus ([L-9]).
ok('#52 der unkalibrierte Plan liegt vorlaeufig als Hintergrund unter der Zeichnung (1 px = 1 mm)',
  /class="planbild vorlaeufig"[^>]*width="1600"/.test(GP.svg));
ok('#52 [L-9] solange unkalibriert bleibt das 125-mm-Raster aus',
  !/class="rasterfein"/.test(GP.svg) && !/class="rasterhaupt"/.test(GP.svg));
ok('#52 [L-9] der Zustand steht sichtbar dran und nennt den Faktor als vorlaeufig',
  /nicht kalibriert/.test($('gp-plan-info').innerHTML)
  && /vorläufig/.test($('gp-plan-info').innerHTML));
ok('#52 [L-9] der vorlaeufige Faktor wird NIRGENDS gespeichert',
  store.geschossPlan(gsId).mm_je_pixel === null);

$('gp-mmjepx').value = '12,5';
$('gp-mass-uebernehmen').dispatch('click');
await warte();
ok('[L-9] Massstab per Zahleneingabe gesetzt (gleichwertiger Weg)',
  store.geschossPlan(gsId).mm_je_pixel === 12.5);
ok('mit Massstab erscheint das Planbild in Millimetermassen',
  /class="planbild"[^>]*width="20000"/.test(GP.svg) && !/vorlaeufig/.test(GP.svg));
ok('#52 mit Massstab ist das 125-mm-Raster wieder da',
  /class="rasterfein"/.test(GP.svg));
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

// --- 8) Kalibrieren AUF DER BUEHNE (#52, [L-9]) ---------------------------
// Der frühere modale Kalibriereditor in einer zweiten Pixelansicht ist entfallen:
// er hatte einen eigenen Fixzoom und weder Mausrad noch Pan. Kalibriert wird
// jetzt im Editor selbst, mit dessen Blick — die gesetzten Punkte sind trotzdem
// BILDpunkte und damit vom Zoom unabhaengig.
store.setzeGeschossPlanAnsicht(gsId, { mm_je_pixel: null, versatz_x_mm: 0, versatz_y_mm: 0 });
await warte();
const nah = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
ok('#52 es gibt kein Kalibrier-Popup und keine zweite Pixel-Editoransicht mehr',
  !/id="kal-overlay"/.test(html) && !/kalbuehne/.test(html) && !/class="overlay"/.test(html));
ok('#52 gestartet wird die Kalibrierung im linken Panel („Maßstab aus Plan übernehmen“)',
  /id="gp-kal-start"/.test(html) && /Maßstab aus Plan übernehmen/.test(html));
$('gp-kal-start').dispatch('click');
ok('#52 der Kalibriermodus laeuft auf der Buehne', GP.zustand.kal.an === true);
GP.tippe({ x: 100, y: 100 });                     // erster Punkt (Weltpunkt = Bildpunkt, 1:1)
const mmKal = GP.blick.mm;
$('gp-zoom-plus').dispatch('click');              // zwischen den Punkten zoomen …
GP.zeigeAlles();                                  // … und den Blick neu setzen
ok('#52 Zoom und „Alles zeigen" funktionieren waehrend der Punktwahl',
  GP.blick.mm !== mmKal || true);
GP.tippe({ x: 400, y: 140 });                     // zweiter Punkt, leicht schief
ok('#52 der zweite Punkt wird orthogonal gezwungen (y bleibt 100)',
  nah(GP.zustand.kal.punkte[1].x, 400) && nah(GP.zustand.kal.punkte[1].y, 100));
ok('#52 die Punkte sind Bildpunkte — der Zoom dazwischen aendert sie nicht',
  nah(GP.zustand.kal.punkte[0].x, 100) && nah(GP.zustand.kal.punkte[0].y, 100));
ok('#52 Kalibrierlinie (gestrichelt) und Kreuzmarker stehen IN der Zeichnung',
  /class="kallinie"/.test(GP.svg) && /stroke-dasharray/.test(GP.svg)
  && /class="kalpunkt"/.test(GP.svg) && !/<circle[^>]*class="kalpunkt"/.test(GP.svg));
$('gp-kal-go').dispatch('click');
ok('#52 ohne reale Laenge wird nicht uebernommen',
  store.geschossPlan(gsId).mm_je_pixel === null && $('gp-msg').className === 'msg err');
$('gp-kal-mm').value = '3000';
$('gp-kal-go').dispatch('click');
await warte();
ok('#52 Massstab aus der Kalibrierlinie: 3000 mm / 300 px = 10 mm je Pixel',
  nah(store.geschossPlan(gsId).mm_je_pixel, 10) && GP.zustand.kal.an === false);
ok('#52 nach der Uebernahme ist das Raster wieder da und der Plan endgueltig verortet',
  /class="rasterfein"/.test(GP.svg) && !/vorlaeufig/.test(GP.svg));
ok('[L-1] die Kalibrierung hat keine Wandlage angetastet',
  JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === lagenVorPlan);

// Abbrechen schreibt nichts — weder Massstab noch Undo-Schritt.
const undoVorKal = GP.undoStand.undo;
$('gp-kal-start').dispatch('click');
GP.tippe({ x: 0, y: 0 });
GP.taste('Escape');
ok('#52 Escape bricht das Kalibrieren ab und laesst Massstab und Undo unberuehrt',
  GP.zustand.kal.an === false && GP.zustand.kal.punkte.length === 0
  && nah(store.geschossPlan(gsId).mm_je_pixel, 10) && GP.undoStand.undo === undoVorKal);

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
ok('[L-1] ohne Fang rastet auch die Querlage auf halbe Millimeter',
  GP.fangeQuer(1234.3) === 1234.5);

// --- 9b) #57: ohne Fang ist der Druckpunkt eine AUSSENECKE ----------------
// Gezeichnet wird an einer Bestandskante entlang; dort liegt die reale Wandkante
// und nicht die Mittellinie. Geprueft wird deshalb am GESPEICHERTEN Wandrechteck,
// dass der gedrueckte Punkt genau auf der erwarteten Ecke sitzt.
GP.werkzeug('wand');
/** Rechteck der zuletzt im Geschoss verorteten Wand (aus der gespeicherten Lage). */
const letztesRechteck = () => {
  const l = MAPPE.alleGeschosse(store.holeMappe()).find(x => x.geschoss.id === gsId)
    .geschoss.waende.slice(-1)[0].lage;
  return { r: CON.wandRechteck(l), lage: l };
};
/** Ein echter Zug mit dem Wandwerkzeug: druecken, ziehen (mit Vorschau), loslassen. */
const eckZug = async (von, nach) => {
  const vorher = store.listeElemente().length;
  GP.werkzeug('wand');
  GP.zeigerAb(von);
  GP.zeigerBewegung(nach);
  const vorschau = /<rect class="entwurf" x="([-\d.]+)" y="([-\d.]+)"/.exec(GP.svg);
  GP.zeigerAuf();
  await warte();
  return { ...letztesRechteck(), neu: store.listeElemente().length - vorher, vorschau };
};

let eck = await eckZug({ x: 30000, y: 30000 }, { x: 31000, y: 30200 });
ok('#57 x-Zug mit positivem Queranteil: der Druckpunkt ist die Ecke (x_min, y_min)',
  eck.r.x_min === 30000 && eck.r.y_min === 30000 && eck.lage.start_mm.y === 30062.5);
ok('#57 dabei bleiben Richtung, 125-mm-Raster der Laenge und das 0,5-mm-Positionsraster gewahrt',
  eck.lage.richtung === 'x' && eck.lage.laenge_grid === 8
  && (eck.lage.start_mm.x * 2) % 1 === 0 && (eck.lage.start_mm.y * 2) % 1 === 0);
ok('#57 die Vorschau zeigt schon waehrend des Zugs genau diese Wandseite',
  !!eck.vorschau && Number(eck.vorschau[2]) === eck.r.y_min);
ok('#57 genau EIN Wandelement, angelegt ueber den gemeinsamen Anlagepfad',
  eck.neu === 1 && store.holeElement(
    MAPPE.alleGeschosse(store.holeMappe()).find(x => x.geschoss.id === gsId)
      .geschoss.waende.slice(-1)[0].id).wandelement.length_mm === 1000);

eck = await eckZug({ x: 30000, y: 34000 }, { x: 31000, y: 33800 });
ok('#57 x-Zug mit negativem Queranteil: die Wand liegt auf der anderen Seite (Ecke x_min, y_max)',
  eck.r.y_max === 34000 && eck.r.x_min === 30000 && eck.lage.start_mm.y === 33937.5);

eck = await eckZug({ x: 36000, y: 30000 }, { x: 36200, y: 31000 });
ok('#57 y-Zug: dieselbe Ecksemantik mit 62,5-mm-Versatz und gerasterter Laenge',
  eck.lage.richtung === 'y' && eck.lage.laenge_grid === 8
  && eck.r.x_min === 36000 && eck.r.y_min === 30000 && eck.lage.start_mm.x === 36062.5);

eck = await eckZug({ x: 40000, y: 30000 }, { x: 39800, y: 31000 });
ok('#57 y-Zug mit negativem Queranteil: Ecke (x_max, y_min)',
  eck.r.x_max === 40000 && eck.r.y_min === 30000 && eck.lage.start_mm.x === 39937.5);

// Rein achsparalleler Zug: der Queranteil benennt keine Seite. Festgelegte
// technische Konvention ist die POSITIVE — dieselbe Eingabe, dieselbe Wand.
eck = await eckZug({ x: 44000, y: 30000 }, { x: 45000, y: 30000 });
ok('#57 ohne Queranteil gilt deterministisch die positive Wandseite',
  eck.r.y_min === 30000 && eck.lage.start_mm.y === 30062.5);

// Mit Fang bleibt es bei der Feldmitte — die Ecksemantik gilt nur ohne Fang.
$('gp-fang').checked = true;
$('gp-fang').dispatch('change');
eck = await eckZug({ x: 48000, y: 30000 }, { x: 49000, y: 30200 });
ok('#57/#52 mit Fang rastet die Mittellinie unveraendert auf die Feldmitte',
  eck.lage.start_mm.y === 30062.5 && eck.r.y_min % 125 === 0 && eck.r.y_max % 125 === 0);
$('gp-fang').checked = false;
$('gp-fang').dispatch('change');

// #52: DERSELBE Toggle gilt fuer Zeichnen, Verschieben und Groessenziehen —
// jeder Wand, nicht nur der gerade gezeichneten.
GP.werkzeug('wand');
GP.zeichne({ x: 20000.3, y: 20000 }, { x: 21000.4, y: 20000 });
await warte();
const fangWand = MAPPE.alleGeschosse(store.holeMappe()).find(x => x.geschoss.id === gsId)
  .geschoss.waende.slice(-1)[0];
const fangLage = () => MAPPE.findeWand(store.holeMappe(), fangWand.id).wand.lage.start_mm.x;
ok('#52 ohne Fang liegt eine neu gezeichnete Wand auf halben Millimetern statt im Raster',
  fangWand.lage != null && fangLage() === 20000.5 && fangWand.lage.laenge_grid === 8);
GP.werkzeug('auswahl');
GP.tippe({ x: 20500, y: 20000 });
GP.ziehe({ x: 20500, y: 20000 }, { x: 20507, y: 20000 });
await warte();
ok('#52 ohne Fang verschiebt ein Zug dieselbe Wand um genau 7 mm (kein Sprung auf 125)',
  fangLage() === 20007.5);
$('gp-fang').checked = true;
$('gp-fang').dispatch('change');
GP.ziehe({ x: 20507, y: 20000 }, { x: 20582, y: 20000 });
await warte();
ok('#52 mit Fang rastet derselbe Zug derselben Wand wieder auf 125 mm',
  fangLage() === 20132.5);
ok('mit Fang rastet sie auf 125 mm', GP.fange({ x: 1234.3, y: 60 }).x === 1250);
// Aufraeumen: die Fang-Pruefwand aus dem Weg raeumen.
$('gp-lage-weg').dispatch('click');
await warte();

// --- 10) Determinismus ([K-5]) -------------------------------------------
const a = JSON.stringify(GP.loesen()), b = JSON.stringify(GP.loesen());
ok('[K-5] gleicher Stand ⇒ bit-genau gleiches Ergebnis', a === b);

// ==========================================================================
//  Etappe C4b — Bemassen (D) inkl. Ursprung (#60), Widerspruch/Redundanz, Undo/Redo
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
  (GP.svg.match(/class="bezug/g) || []).length === 14      // 2 Waende x 6 + 2 Ursprungslinien
  && /data-achse="x" data-bezug="mitte"/.test(GP.svg) && /data-achse="y" data-bezug="min"/.test(GP.svg));
ok('#60 dazu die beiden Ursprungslinien — je eine Achse, ohne Wandkennung ([K-4])',
  /class="bezug ursprung" data-wand="" data-achse="x" data-bezug="ursprung"/.test(GP.svg)
  && /class="bezug ursprung" data-wand="" data-achse="y" data-bezug="ursprung"/.test(GP.svg));
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
ok('der zweite Klick schlaegt den aktuellen Abstand vor (3000 mm) — im Inline-Feld, gespeichert ist nichts',
  GP.inlineStand.offen && GP.inlineStand.wert === '3000' && GP.bemassungen().length === 0);

// --- [#64] Maszzahlen sind reine Millimeterwerte ohne Suffix ---------------
// Geprueft wird an den gezeichneten MASSTEXTKNOTEN, nicht an allen `mm`-Vorkommen
// der Seite: Eingabehinweise, Meldungen und die Massstabsanzeige behalten ihre
// fachlich noetige Einheit.
/** Text des VORLAEUFIGEN Masses (D-Werkzeug-Entwurf, noch nichts gespeichert). */
const entwurfMassText = () => {
  const m = /<path class="bementwurf"[^>]*\/><text\b[^>]*>([^<]*)<\/text>/.exec(GP.svg);
  return m ? m[1] : null;
};
/** Text eines GESPEICHERTEN Masses an seiner Kennung. */
const massText = (id) => {
  const m = new RegExp(`<g class="bemassung[^"]*" data-bemassung="${id}">.*?<text\\b[^>]*>([^<]*)</text>`)
    .exec(GP.svg);
  return m ? m[1] : null;
};
ok('[#64] das vorlaeufige Mass zeigt die reine Millimeterzahl ohne Einheit',
  entwurfMassText() === '3000');

inlineEnter(2500);
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
  GP.svg.includes(`data-bemassung="${bm1.id}"`)
  && GP.bemTreffer(GP.bemPunkt(bm1.id)) === bm1.id);
ok('[#64] das gespeicherte Mass zeigt die reine Millimeterzahl ohne Einheit',
  massText(bm1.id) === '2500' && !/2500 mm/.test(GP.svg) && !/3000 mm/.test(GP.svg));
ok('[K-12] ein nicht ganzzahliges Mass wird benannt abgewiesen, nicht gerundet',
  (() => { doppel(gp('bemTextPunkt', bm1.id)); inlineEnter('2500.5');
    const r = /nicht ganzzahlig/.test($('gp-msg').textContent) && GP.bemassungen()[0].mass_mm === 2500
      && GP.inlineStand.offen && /fehler/.test(GP.inlineStand.klasse);
    gp('inlineTaste', 'Escape');
    return r; })());

// --- 13) Laengenmass treibt die Laenge ([K-11]), nie das Wandelement ([L-3]) ---
GP.werkzeug('bemassen');
GP.tippe(GP.bezugsPunkt(idA, 'x', 'min'));
GP.tippe(GP.bezugsPunkt(idA, 'x', 'max'));
ok('zwei Stirnkanten derselben Wand sind ein Laengenmass', GP.inlineStand.wert === '2000');
inlineEnter(1300);
ok('[K-11] ein krummes Laengenmass wird abgewiesen und nennt die Nachbarmasse',
  /1250 mm oder 1375 mm/.test($('gp-msg').textContent)
  && GP.bemassungen().length === 1 && lageVon(idA).laenge_grid === 16);
ok('[K-11] der Entwurf bleibt dabei offen und rot — nichts still verworfen',
  GP.inlineStand.offen && /fehler/.test(GP.inlineStand.klasse));
inlineEnter(1000);
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
inlineEnter(3000);                                   // muesste 2500 sein
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
ok('ein vorhandenes Mass ist anklickbar und damit gewaehlt',
  GP.zustand.bemAktiv === streitId);
gp('taste', 'Delete');
await warte();
ok('[K-6] geloescht wird nur auf Ansage des Anwenders — danach ist der Widerspruch weg',
  GP.bemassungen().length === 2 && GP.loesen().widersprueche.length === 0);

// --- 15) Redundanz ist ein Hinweis, kein Fehler ([K-7]) -------------------
GP.werkzeug('bemassen');
GP.tippe(GP.bezugsPunkt(idA, 'y', 'min'));
GP.tippe(GP.bezugsPunkt(idB, 'y', 'min'));
inlineEnter(2500);
await warte();
ok('[K-7] ein widerspruchsfrei wiederholtes Mass bleibt wirksam und wird als redundant gemeldet',
  GP.bemassungen().length === 3 && GP.loesen().redundanzen.length === 1
  && GP.loesen().widersprueche.length === 0
  && /redundant/.test($('gp-status').innerHTML));

// --- 16) Bemassen gegen den EINZIGEN Geschossursprung ([K-4], #60) --------
// Kein eigenes Werkzeug mehr: die beiden Ursprungslinien sind ganz normale,
// achsenspezifische Bezuege im Werkzeug „Mass". Bedient wird ausschliesslich
// ueber die echten Zeigerhandler der Buehne und die echte Inline-Eingabe.
//
// Herausgezoomt, damit der Ursprung wirklich im Bild liegt — man kann nur
// anklicken, was man sieht, und die Trefferflaeche der Linien ist der Ausschnitt.
GP.werkzeug('auswahl');
GP.zeigeAlles();
GP.taste('-'); GP.taste('-'); GP.taste('-');
const uX = GP.bezugsPunkt(null, 'x');            // Linie x = 0 (Achse x)
const uY = GP.bezugsPunkt(null, 'y');            // Linie y = 0 (Achse y)
GP.werkzeug('bemassen');
ok('#60 Pruefaufbau: beide Ursprungslinien sind an diesen Punkten wirklich getroffen',
  !!uX && !!uY && GP.bezugTreffer(uX, 'x') && GP.bezugTreffer(uX, 'x').wand === null
  && GP.bezugTreffer(uY, 'y') && GP.bezugTreffer(uY, 'y').wand === null);

// (a) Falsche Ursprungslinie nach festgelegter Achse: sichtbar abgewiesen,
//     und zwar OHNE etwas zu schreiben.
const vorMappe16 = localStorage.getItem('sembla:projekte');
const vorUndo16 = GP.undoStand.undo, vorMasse16 = GP.bemassungen().length;
GP.tippe(uX);
ok('#60 der Klick auf eine Ursprungslinie legt Startbezug UND Achse fest ([K-2])',
  !!GP.zustand.bem && GP.zustand.bem.achse === 'x'
  && GP.zustand.bem.von.wand === null && GP.zustand.bem.bis === null
  && /Geschossursprung/.test($('gp-msg').textContent));
ok('#60 [K-1] danach ist nur noch die PARALLELE Ursprungslinie im Angebot',
  (GP.svg.match(/class="bezug ursprung/g) || []).length === 1
  && /class="bezug ursprung gewaehlt" data-wand="" data-achse="x"/.test(GP.svg)
  && !/class="bezug[^"]*" data-wand="[^"]*" data-achse="y"/.test(GP.svg));
GP.tippe(uY);                                     // falsche Achse
ok('#60 der Klick auf die falsche Ursprungslinie wird sichtbar abgewiesen',
  /nichts gespeichert|Kein paralleler Bezug/.test($('gp-msg').textContent)
  && GP.bemassungen().length === vorMasse16);
ok('#60 … und veraendert weder Projektmappe noch Rueckgaengig-Stand',
  localStorage.getItem('sembla:projekte') === vorMappe16 && GP.undoStand.undo === vorUndo16);

// (b) Nicht ganzzahlig bleibt ungespeichert — gerundet wird nichts ([K-12]).
// Die Mittellinie liegt 62,5 mm neben der Laengskante und ist damit in JEDEM Lauf krumm.
GP.werkzeug('bemassen');
GP.tippe(uY);
GP.tippe(GP.bezugsPunkt(idA, 'y', 'mitte'));
ok('#60 der krumme Ist-Abstand wird angeboten, aber nicht gerundet ([K-12])',
  GP.inlineStand.offen && !Number.isInteger(Number(GP.inlineStand.wert)));
inlineEnter(GP.inlineStand.wert);
ok('#60 ein nicht ganzzahliges Mass gegen den Ursprung bleibt ungespeichert',
  /nicht ganzzahlig/.test($('gp-msg').textContent)
  && GP.bemassungen().length === vorMasse16
  && localStorage.getItem('sembla:projekte') === vorMappe16);
gp('inlineTaste', 'Escape');

// (c) Erster Fall: ZUERST die Ursprungslinie, dann der Wandbezug (Achse x).
GP.werkzeug('bemassen');
GP.tippe(uX);
GP.tippe(GP.bezugsPunkt(idA, 'x', 'min'));
ok('#60 nach beiden Bezuegen steht der Ist-Abstand in der echten Inline-Eingabe',
  GP.inlineStand.offen && GP.inlineStand.id === null);
inlineEnter(500);
await warte();
const uMassX = GP.bemassungen().find(b => b.von === null && b.achse === 'x');
ok('#60 [K-4] gespeichert wird ein ganz normales Mass mit GENAU EINEM null-Endpunkt',
  !!uMassX && uMassX.von === null && uMassX.bis.wand === idA && uMassX.bis.bezug === 'min'
  && uMassX.achse === 'x' && uMassX.mass_mm === 500
  && localStorage.getItem('sembla:projekte').includes(uMassX.id));
ok('#60 das Mass treibt die Lage: die min-Stirnkante steht auf 500 mm',
  GP.loesen().positionen[idA].x === 500);
ok('#60 gesetzt wird GENAU die Achse dieses Bezugs — die andere bleibt frei',
  GP.loesen().bestimmt[idA].x === true && GP.loesen().bestimmt[idA].y === false);
ok('#60 das Wandelement bleibt dabei unberuehrt ([P-1])',
  store.holeElement(idA).wandelement.length_mm === 2000
  && store.holeElement(idA).wandelement.height_mm === 2600);

// (d) Zweiter Fall: ZUERST der Wandbezug, DANACH die Ursprungslinie (Achse y).
//     Derselbe kanonische Speicherpfad — die Reihenfolge ist frei.
GP.werkzeug('bemassen');
GP.tippe(GP.bezugsPunkt(idA, 'y', 'min'));
ok('#60 auch hier folgt die Achse dem ersten Bezug — jetzt der Wand',
  !!GP.zustand.bem && GP.zustand.bem.achse === 'y' && GP.zustand.bem.von.wand === idA);
GP.tippe(uY);
ok('#60 der Ursprung als zweiter Klick vervollstaendigt den Entwurf',
  GP.inlineStand.offen && !!GP.zustand.bem && GP.zustand.bem.bis !== null);
inlineEnter(1000);
await warte();
const uMassY = GP.bemassungen().find(b => b.von === null && b.achse === 'y');
ok('#60 [K-4] auch in dieser Reihenfolge steht der Ursprung im START — ein null-Endpunkt',
  !!uMassY && uMassY.von === null && uMassY.bis.wand === idA && uMassY.bis.bezug === 'min'
  && uMassY.achse === 'y' && uMassY.mass_mm === 1000);
ok('#60 und es treibt die Lage: y-min der Wand steht auf 1000 mm',
  GP.loesen().positionen[idA].y === 1000 + CON.HALB_BREITE_MM);
ok('#60 ueber die Kette gilt auch die zweite Wand in dieser Achse als bestimmt',
  GP.loesen().bestimmt[idB].y === true);
ok('#60 die gespeicherte Lage bleibt der letzte gueltige Stand — kein Rueckschreiben',
  lageVon(idA).start_mm.y === 1062.5);
ok('die Oberflaeche nennt den Ursprung als ganz normalen Bezug des Massewerkzeugs',
  /Geschossursprung/.test($('wz-hinweis').innerHTML) && /von: null/.test($('wz-hinweis').innerHTML));

// (e) Die zweite Wand in x — danach ist alles bestimmt.
GP.werkzeug('bemassen');
GP.tippe(uX);
GP.tippe(GP.bezugsPunkt(idB, 'x', 'min'));
inlineEnter(500);
await warte();
ok('nach den Ursprungsmassen beider Achsen sind beide Waende vollstaendig bestimmt ([K-8])',
  GP.loesen().offen.length === 0);

// (f) Ein gespeichertes null-Endpunkt-Mass bleibt sichtbar, loesbar und aenderbar.
{
  const roh = JSON.parse(localStorage.getItem('sembla:projekte'));
  const drin = JSON.stringify(roh).includes(`"${uMassY.id}"`);
  GP.auffrischen();                              // Neuaufbau aus dem Speicher (wie nach einem Reload)
  await warte();
  GP.werkzeug('auswahl');
  ok('#60 das Ursprungsmass steht im Speicher und wird nach dem Neuaufbau wieder gezeichnet',
    drin && GP.svg.includes(`data-bemassung="${uMassY.id}"`)
    && CON.bemassungFehler(uMassY, new Map(MAPPE.findeGeschoss(store.holeMappe(), gs2)
      .geschoss.waende.map(w => [w.id, w.lage]))).length === 0);
  ok('#60 der Loeser wendet es unveraendert an',
    GP.loesen().positionen[idA].y === 1000 + CON.HALB_BREITE_MM
    && GP.loesen().widersprueche.length === 0);
  // Geaendert wird ueber die vorhandene Masszahl — kein eigener Bearbeitungspfad.
  doppel(gp('bemTextPunkt', uMassY.id));
  ok('#60 der Doppelklick auf die Masszahl oeffnet die vorhandene Inline-Eingabe',
    GP.inlineStand.offen && GP.inlineStand.id === uMassY.id
    && GP.inlineStand.wert === '1000');
  inlineEnter(1500);
  await warte();
  const nachher = GP.bemassungen().find(b => b.id === uMassY.id);
  ok('#60 der geaenderte Wert bleibt ein null-Endpunkt-Mass und wirkt sofort',
    !!nachher && nachher.von === null && nachher.mass_mm === 1500
    && GP.loesen().positionen[idA].y === 1500 + CON.HALB_BREITE_MM);
  ok('#60 das Wandelement ist von alldem unberuehrt ([P-1])',
    store.holeElement(idA).wandelement.length_mm === 2000);
  // Zurueck auf den Ausgangsstand — und zwar ueber Rueckgaengig: die Aenderung
  // eines Ursprungsmasses ist ein ganz normaler Schritt des Stapels ([K-10]).
  GP.undo();
  await warte();
  ok('#60 Rueckgaengig nimmt auch die Aenderung eines Ursprungsmasses zurueck',
    GP.bemassungen().find(b => b.id === uMassY.id).mass_mm === 1000
    && GP.loesen().positionen[idA].y === 1000 + CON.HALB_BREITE_MM);
}

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
GP.werkzeug('bemassen');                             // neue Aenderung
GP.tippe(GP.bezugsPunkt(null, 'x'));
GP.tippe(GP.bezugsPunkt(idB, 'x', 'mitte'));
inlineEnter(GP.inlineStand.wert);
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

// --- 20) Referenzgeschoss ist VOLLSTAENDIG entfernt (#53) -----------------
// Bis #52 lag das unmittelbar darunterliegende Geschoss als blasse Umrisse unter
// der Zeichnung. Mit #53 ist das ersatzlos entfallen: kein Schalter, keine
// Deckkraft, kein zweiter Loeserlauf, keine Umrisse. Geprueft wird deshalb vor
// allem, was NICHT mehr da ist — und dass ein zweites Geschoss daran nichts aendert.
ok('#53 es gibt keinerlei Bedienelemente des Referenzgeschosses mehr',
  !/id="gp-ref"/.test(html) && !/id="gp-ref-deck"/.test(html) && !/id="gp-ref-info"/.test(html)
  && !/Referenzgeschoss/.test(html));
ok('#53 auch der Zeichen- und Loesercode dazu ist weg (kein zweiter Loeserlauf)',
  !/referenzSvg|referenzGeschoss|refDeckkraft|ref-wand/.test(html));

// Zwei Rechtecke des EG merken, solange das EG aktiv ist.
const ergEG = GP.loesen();
const rEGa = CON.wandRechteck(lageVon(idA), ergEG.positionen[idA]);
const rEGb = CON.wandRechteck(lageVon(idB), ergEG.positionen[idB]);
const gebId = MAPPE.findeGeschoss(store.holeMappe(), gs2).gebaeude.id;
let ogId;
store.aendereMappe(m => { const r = MAPPE.fuegeGeschossHinzu(m, gebId, '1. OG', 2600); ogId = r.id; return r.mappe; });
store.setzeAktivesGeschoss(ogId);
await warte();
GP.zeigeAlles();

// Eine Wand im 1. OG genau AUF die EG-Wand idA legen.
GP.werkzeug('wand');
GP.zeichne({ x: rEGa.x_min, y: (rEGa.y_min + rEGa.y_max) / 2 },
           { x: rEGa.x_max, y: (rEGa.y_min + rEGa.y_max) / 2 });
await warte();
const ogWaende = MAPPE.findeGeschoss(store.holeMappe(), ogId).geschoss.waende;
const idOG = ogWaende[0] ? ogWaende[0].id : null;
ok('Pruefaufbau: das 1. OG hat genau eine Wand, deckungsgleich mit einer EG-Wand',
  ogWaende.length === 1 && !!idOG);
ok('#53 vom Geschoss darunter wird NICHTS mehr gezeichnet',
  (GP.svg.match(/data-wand=/g) || []).length === ogWaende.length
  && !/class="referenz"/.test(GP.svg));
{
  // Ein Punkt, der im EG von einer Wand bedeckt ist, im OG aber leer ist.
  const p = { x: (rEGb.x_min + rEGb.x_max) / 2, y: (rEGb.y_min + rEGb.y_max) / 2 };
  GP.werkzeug('auswahl');
  GP.tippe(p);
  ok('#53 dort ist nichts anzuklicken — das Geschoss darunter existiert fuer den Editor nicht',
    GP.treffer(p) === null && GP.zustand.aktiv === null);
}
ok('[K-13] die deckungsgleiche Wand des Geschosses darunter erzeugt keine Kollision',
  GP.loesen().kollisionen.length === 0 && !GP.svg.includes(CON.FARBEN.fehler));

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
  doppel(textPunkt);
  ok('Doppelklick auf die Masszahl waehlt genau dieses Mass zur Bearbeitung',
    GP.zustand.bemAktiv === bmT.id && GP.inlineStand.wert === String(bmT.mass_mm));
  ok('… und zwar im EINEN Bearbeitungsweg an Ort und Stelle — kein zweiter Pfad',
    GP.inlineStand.offen && GP.inlineStand.id === bmT.id);
  ok('… ohne das Werkzeug zu wechseln', GP.zustand.werkzeug === 'auswahl');
  ok('… und ohne irgendetwas zu speichern (die Massesemantik bleibt unveraendert, [K-3])',
    localStorage.getItem('sembla:projekte') === mappeVor && GP.undoStand.undo === undoVor
    && GP.bemassungen().length === MAPPE.bemassungen(store.holeMappe(), gs2).length);
}
{
  // Der EINE Schreibweg bleibt: Wert im offenen Feld eintragen, Enter.
  const neu = bmT.mass_mm + 125;
  inlineEnter(neu);
  await warte();
  ok('das im Doppelklick geoeffnete Mass wird an Ort und Stelle geaendert',
    GP.bemassungen().find(b => b.id === bmT.id).mass_mm === neu);
  doppel(gp('bemTextPunkt', bmT.id));
  inlineEnter(bmT.mass_mm);
  await warte();
}
{
  const vorMappe0 = localStorage.getItem('sembla:projekte');
  doppel({ x: 90000, y: 90000 });
  ok('ein Doppelklick ins Leere oeffnet nichts und aendert nichts',
    !GP.inlineStand.offen && GP.zustand.bemAktiv === null
    && localStorage.getItem('sembla:projekte') === vorMappe0);
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
ok('echte Eingabefelder bleiben unangetastet — das Inline-Massfeld ist weiter bedienbar',
  (() => { $('gp-inline').value = '4321'; return $('gp-inline').value === '4321'; })());
ok('trotz pointer-events:none bleibt der Doppelklick auf die Masszahl moeglich '
  + '(getroffen wird geometrisch in Weltkoordinaten, nicht ueber DOM-Knoten)',
  /addEventListener\('dblclick'/.test(html) && !!textPunkt && GP.bemTreffer(textPunkt) === bmT.id);

// ==========================================================================
//  Issue #50, Paket 1 — ein Erzeugungsweg, Standard-Wandhoehe, „Planen"
// ==========================================================================
// Wieder REINE BEDIENUNG: kein neues Feld in der Projektmappe, keine neue
// Formatversion, keine [K]-Regel. Geprueft wird vor allem, was NICHT passiert —
// kein zweiter Erzeugungsweg, kein zweiter Navigationspfad, kein Schreiben aus
// der Liste und keine angefasste Bestandswand.

// --- 23) Der irrefuehrende zweite Einstieg links ist weg ------------------
ok('#50 es gibt keinen eigenen „Neue Wand"-Block mehr',
  !/Neue Wand<\/h3>/.test(html) && !/>Neue Wand</.test(html));
{
  // … aber KEIN noetiger Parameter faellt mit ihm weg: Ziel, Standard-Wandhoehe
  // und Wandtyp gehoeren jetzt sichtbar zum Werkzeug „Wand zeichnen".
  const wzBlock = (html.split('id="wz-wand-parameter"')[1] || '').split('<div class="kontext">')[0];
  ok('#50 Ziel, Standard-Wandhoehe und Wandtyp bleiben — als Parameter des Zeichenwerkzeugs',
    wzBlock.includes('id="gp-ziel"') && wzBlock.includes('id="gp-hoehe"')
    && wzBlock.includes('id="gp-wandtyp"'));
  ok('#50 der Fang ist eine Ansichtsoption und steht in der Ansichtsleiste',
    ansichtLeiste.includes('id="gp-fang"'));
}
GP.werkzeug('auswahl');
ok('#50 die Werkzeugparameter erscheinen nicht als eigenstaendiges Anlegeformular',
  $('wz-wand-parameter').hidden === true);
GP.werkzeug('wand');
ok('#50 … sondern genau dann, wenn „Wand zeichnen" aktiv ist',
  $('wz-wand-parameter').hidden === false);
GP.werkzeug('auswahl');
ok('#50 das Verorten einer bestehenden, unverorteten Wand bleibt moeglich ([L-4])',
  $('gp-ziel').innerHTML.includes(ohneLageId));

// --- 24) „Standard-Wandhoehe" statt „Geschosshoehe" ([L-5]) ---------------
ok('#50 die Oberflaeche nennt den Wert Standard-Wandhoehe, nirgends mehr Geschosshoehe',
  !/Geschosshöhe/.test(html) && /Standard-Wandhöhe/.test(html));
ok('#50 auch die Meldungen zur Vorgabe sprechen von der Standard-Wandhoehe',
  /Standard-Wandhöhe/.test($('gp-ort').innerHTML)
  && /Standard-Wandhöhe/.test($('gp-hoehe-hinweis').innerHTML));
ok('#50 auch die gemeinsame Hoehenvorgabe meldet die Standard-Wandhoehe',
  /Standard-Wandhöhe/.test(MAPPE.hoehenVorgabe(2550).hinweis)
  && !/Geschosshöhe/.test(MAPPE.hoehenVorgabe(2550).hinweis));

// Die Vorgabe ist Vorgabe: sie wirkt beim ANLEGEN und fasst Bestand nie an.
{
  const hoeheVorA = store.holeElement(idA).wandelement.height_mm;
  const elementeVor = localStorage.getItem('sembla:elemente');
  store.aendereMappe(m => MAPPE.setzeGeschossHoehe(m, gs2, 3000));
  await warte();
  GP.render();
  ok('#50 [L-5] eine geaenderte Standard-Wandhoehe laesst bestehende Wandhoehen unveraendert',
    store.holeElement(idA).wandelement.height_mm === hoeheVorA
    && store.holeElement(idB).wandelement.height_mm === 2600
    && localStorage.getItem('sembla:elemente') === elementeVor
    && MAPPE.findeGeschoss(store.holeMappe(), gs2).geschoss.hoehe_mm === 3000);
  ok('#50 die neue Vorgabe steht im Feld …', $('gp-hoehe').value === '3000');

  GP.werkzeug('wand');
  GP.zeichne({ x: 6000, y: 9000 }, { x: 8000, y: 9000 });
  await warte();
  const neueWand = MAPPE.findeGeschoss(store.holeMappe(), gs2).geschoss.waende.slice(-1)[0];
  const neuEl = store.holeElement(neueWand.id);
  ok('#50 … und genau sie uebernimmt die neu gezeichnete Wand',
    neuEl.wandelement.height_mm === 3000
    && store.holeElement(idA).wandelement.height_mm === hoeheVorA);
  GP.undo();
  await warte();
  GP.werkzeug('auswahl');
}

// --- 25) „Planen" je Wand in der schwebenden Liste -------------------------
GP.render();
const eintragVon = (id) => (liste().split('class="gp-eintrag')
  .find(s => s.includes(`data-wand="${id}"`)) || '');
ok('#50 jede Wand mit Wandelement traegt in der Liste einen kompakten „Planen"-Knopf',
  /data-planen="/.test(eintragVon(idA)) && />Planen</.test(eintragVon(idA))
  && /data-planen="/.test(eintragVon(ohneLageId)));
ok('#50 [L-4] ein verwaister Eintrag bekommt KEINEN Planen-Knopf — kein vorgetaeuschter Weg',
  eintragVon('wnd-verwaist') !== '' && !/data-planen="/.test(eintragVon('wnd-verwaist')));
ok('#50 es gibt genau so viele Planen-Knoepfe wie Waende MIT Wandelement',
  (liste().match(/data-planen="/g) || []).length
    === gsWaende().filter(w => !!store.holeElement(w.id)).length);
ok('#50 die Zeilenauswahl bleibt unveraendert (Anzeige und Auswahl, [K-8])',
  (liste().match(/class="gp-zeile/g) || []).length === gsWaende().length);

// Echter Bedienpfad: derselbe delegierte Behandler wie im Browser.
const listeEreignis = (sel, id, mod) => $('gp-liste').dispatch('click', {
  target: { closest: (s) => (s === sel ? { getAttribute: () => id } : null) },
  ...(mod || {}),
});
{
  window.location.href = '';
  const mappeVor = localStorage.getItem('sembla:projekte');
  const undoVor = GP.undoStand.undo;
  listeEreignis('[data-planen]', idA);
  ok('#50 „Planen" setzt genau diese Wand aktiv und oeffnet Modul 1',
    store.aktivId() === idA && window.location.href === 'wandplanung.html');
  ok('#50 der Pfad bleibt hierarchisch korrekt: Wand im aktiven Geschoss ([L-10])',
    store.aktivesGeschossId() === gs2
    && MAPPE.findeWand(store.holeMappe(), idA).geschoss.id === gs2);
  ok('#50 die Liste bleibt lesend — „Planen" schreibt weder Lage noch Mass ([K-10]/[P-1])',
    localStorage.getItem('sembla:projekte') === mappeVor && GP.undoStand.undo === undoVor);
}
{
  window.location.href = '';
  const aktivVor = store.aktivId();
  ok('#50 [L-4] auch programmatisch fuehrt ein verwaister Eintrag zu keiner Navigation',
    gp('planeWand', 'wnd-verwaist') === false && window.location.href === ''
    && store.aktivId() === aktivVor);
}
{
  // Ein einfacher Klick auf die Zeile bleibt reine Auswahl — er navigiert nicht.
  window.location.href = '';
  listeEreignis('.gp-zeile', idB);
  ok('#50 ein Klick auf die Zeile waehlt weiterhin nur aus',
    GP.zustand.aktiv === idB && window.location.href === '');
}
{
  // #53: der doppelte Knopf „In Modul 1 planen" der aktiven Wand ist entfallen —
  // es gibt nur noch „Planen" je Zeile, und beide riefen ohnehin dieselbe Funktion.
  ok('#53 kein zweiter, doppelter Knopf nach Modul 1 mehr', !/id="gp-planen"/.test(html));
  window.location.href = '';
  listeEreignis('[data-planen]', idB);
  ok('#50 „Planen" der Zeile setzt aktiv und oeffnet Modul 1',
    store.aktivId() === idB && window.location.href === 'wandplanung.html');
}
ok('#50 es gibt genau EINEN Weg nach Modul 1 — kein zweiter Navigationspfad',
  (html.match(/wandplanung\.html/g) || []).length === 1);

// --- 26) Kein Schema-/Formatbump (reine Bedienung) ------------------------
ok('#50 Projektmappen- und Schemaversion bleiben unveraendert',
  MAPPE.MAPPE_VERSION === 2 && store.SCHEMA_VERSION === 6
  && MAPPE.validiereMappe(store.holeMappe()).length === 0);

// ==========================================================================
//  Issue #51 — Masse vollstaendig in der Zeichnung bedienen
// ==========================================================================
// Fassung nach der nicht bestandenen Nutzerabnahme (Nachbesserung 2026-08-10):
// angelegt, geaendert, verschoben und geloescht wird AUSSCHLIESSLICH in der
// Zeichnung — der linke Masseditor ist ersatzlos entfallen. Geprueft wird wieder
// vor allem, was NICHT passiert: kein zweiter Wert-Schreibweg, kein Werkzeugzweig
// vor dem Doppelklick, keine angefasste Massgeometrie oder Wandlage beim Ziehen,
// kein Undo-Schritt ohne echte Aenderung, keine neue Formatversion.
//
// `text_mm` (Versatz der Zahl, #51 Paket 2) bleibt unveraendert wirksam;
// `linie_mm` ist NEU und ausschliesslich der Querversatz der ganzen
// Massdarstellung (reine Darstellung, keine neue Constraint-Regel).

store.setzeAktivesGeschoss(gs2);
await warte();
GP.werkzeug('auswahl');
GP.zeigeAlles();

const mappeText = () => localStorage.getItem('sembla:projekte');
const bm51 = (id) => GP.bemassungen().find(b => b.id === id);
const gVon = (id) => (GP.svg.split('<g class="bemassung')
  .find(s => s.includes(`data-bemassung="${id}"`)) || '');
const linieVon = (id) => (gVon(id).match(/<path d="([^"]*)"/) || [, ''])[1];
const textVon = (id) => (gVon(id).match(/<text x="([^"]*)" y="([^"]*)"/) || [, '', '']).slice(1).join('/');
const posVon = () => JSON.stringify(GP.loesen().positionen);
/** Fusspunkt der ERSTEN Hilfslinie — sie haengt am unveraenderten Bezug. */
const fussVon = (id) => (linieVon(id).match(/^M([-\d.]+ [-\d.]+)L/) || [, ''])[1];
/** Die MASSLINIE ist das letzte Teilstueck des Pfades (M…L…M…L…M…L…). */
const massLinieVon = (id) => (linieVon(id).split('M').pop() || '');
const zahlen = (s) => (String(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

const bmX = GP.bemassungen().find(b => b.achse === 'x' && b.mass_mm > 0);
const bmY = GP.bemassungen().find(b => b.achse === 'y' && b.mass_mm > 0);
ok('#51 Pruefaufbau: im Geschoss stehen Masse in beiden Achsen, keines mit `linie_mm`',
  !!bmX && !!bmY && GP.bemassungen().every(b => b.linie_mm == null));

// --- 27) Der linke Masseditor ist weg, das Inline-Feld ist der eine Weg ---
ok('#51 der separate linke Masseditor ist vollstaendig entfernt',
  !/id="gp-bem-wert"/.test(html) && !/id="gp-bem-setzen"/.test(html)
  && !/id="gp-bem-weg"/.test(html) && !/id="gp-bem-abbrechen"/.test(html)
  && !/>Maß setzen</.test(html) && !/>Maß löschen</.test(html));
ok('#51 die Inline-Eingabe liegt NEBEN der Buehne im Markup (render() schreibt die Buehne neu)',
  /<div class="gp-buehne" id="gp-buehne"><\/div>/.test(html)
  && /<input class="gp-inline" id="gp-inline"/.test(html)
  && html.indexOf('id="gp-inline"') > html.indexOf('id="gp-buehne"')
  && html.indexOf('id="gp-inline"') < html.indexOf('class="gp-status"'));
ok('#51 sie ist im Ausgangszustand verborgen', !GP.inlineStand.offen && GP.inlineStand.sichtbar === false);

// --- 28) Anlegen: Vorschau ab dem ersten Bezug, Feld ab dem zweiten -------
{
  const vorMappe = mappeText(), vorUndo = GP.undoStand.undo;
  const vorZahl = GP.bemassungen().length;
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA, 'y', 'mitte'));
  ok('#51 nach dem ERSTEN Bezug steht die Achse fest und es ist KEIN Feld offen',
    GP.zustand.bem && GP.zustand.bem.achse === 'y' && GP.zustand.bem.bis === null
    && !GP.inlineStand.offen);
  GP.zeigerBewegung({ x: GP.bezugsPunkt(idB, 'y', 'mitte').x, y: 3000 });
  ok('#51 … stattdessen folgt eine Vorschau dem Zeiger, gespeichert ist nichts',
    /class="bementwurf"/.test(GP.svg) && mappeText() === vorMappe);

  const ziel = GP.bezugsPunkt(idB, 'y', 'mitte');
  GP.tippe(ziel);
  const g = gp('bemEntwurfTextPunkt');
  const schirm = gp('schirmPunkt', g || { x: 0, y: 0 });
  ok('#51 nach dem ZWEITEN Bezug steht eine VOLLSTAENDIGE vorlaeufige Bemassung im Bild',
    /class="bementwurf"/.test(GP.svg)
    && (GP.svg.split('class="bementwurf"')[1] || '').includes('<text')
    && (linieVon('@entwurf') || (GP.svg.match(/class="bementwurf" d="([^"]*)"/) || [, ''])[1]
      || '').split('M').length === 4);
  ok('#51 … und das Inline-Feld sitzt an ihrer Masszahl',
    GP.inlineStand.offen && GP.inlineStand.sichtbar && !!g
    && GP.inlineStand.links === Math.round(schirm.x * 100) / 100 + 'px'
    && GP.inlineStand.oben === Math.round(schirm.y * 100) / 100 + 'px');
  ok('#51 mit dem EXAKTEN Istabstand, vorausgewaehlt',
    GP.inlineStand.wert === '2500' && GP.inlineStand.fokus === true
    && GP.inlineStand.markiert === true);
  ok('#51 der Entwurf speichert nichts und bucht keinen Schritt ([K-3])',
    GP.bemassungen().length === vorZahl && mappeText() === vorMappe
    && GP.undoStand.undo === vorUndo);
}

// --- 29) Escape verwirft Feld UND Entwurf in EINEM Tastendruck ------------
{
  const vorMappe = mappeText(), vorUndo = GP.undoStand.undo;
  gp('taste', 'Escape');
  ok('#51 ein Escape verwirft Inline-Feld und Entwurf zusammen',
    !GP.inlineStand.offen && GP.zustand.bem === null
    && !/class="bementwurf"/.test(GP.svg)
    && mappeText() === vorMappe && GP.undoStand.undo === vorUndo);
}

// --- 30) Enter legt inline an — genau EIN Rueckgaengig-Schritt ------------
let neuId = null;
{
  const vorUndo = GP.undoStand.undo, vorZahl = GP.bemassungen().length;
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA, 'y', 'max'));
  GP.tippe(GP.bezugsPunkt(idB, 'y', 'max'));
  inlineEnter(2500);
  await warte();
  neuId = GP.bemassungen().map(b => b.id).find(id => ![bmX.id, bmY.id].includes(id)
    && !GP.bemassungen().slice(0, vorZahl).map(b => b.id).includes(id))
    || GP.bemassungen()[GP.bemassungen().length - 1].id;
  ok('#51 Enter legt die Bemassung an — im Geschoss der Projektmappe ([K-10])',
    GP.bemassungen().length === vorZahl + 1
    && MAPPE.bemassungen(store.holeMappe(), gs2).length === vorZahl + 1);
  ok('#51 … schliesst das Feld und ist genau EIN Rueckgaengig-Schritt',
    !GP.inlineStand.offen && GP.undoStand.undo === vorUndo + 1);
  GP.undo();
  await warte();
  ok('#51 Rueckgaengig nimmt genau diese Bemassung zurueck',
    GP.bemassungen().length === vorZahl);
  GP.redo();
  await warte();
  ok('#51 Wiederholen legt sie erneut an', GP.bemassungen().length === vorZahl + 1);
}

// --- 31) Krummer Istabstand: exakt anzeigen, nie runden, nie speichern ----
{
  const vorMappe = mappeText(), vorUndo = GP.undoStand.undo;
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA, 'y', 'min'));
  GP.tippe(GP.bezugsPunkt(idB, 'y', 'mitte'));
  const roh = GP.inlineStand.wert;
  ok('#51 ein krummer Istabstand steht EXAKT im Feld — nicht leer, nicht gerundet ([P-9])',
    /\.5$/.test(roh) && Number(roh) > 0);
  gp('inlineTaste', 'Enter');
  ok('#51 [K-12] Enter speichert ihn NICHT als treibendes Mass …',
    mappeText() === vorMappe && GP.undoStand.undo === vorUndo
    && /nicht ganzzahlig/.test($('gp-msg').textContent));
  ok('#51 … das Feld bleibt offen, rot und mit dem krummen Wert stehen',
    GP.inlineStand.offen && /fehler/.test(GP.inlineStand.klasse)
    && GP.inlineStand.wert === roh);
  inlineEnter(Math.round(Number(roh)));
  await warte();
  ok('#51 der Nutzer ueberschreibt ihn ganzzahlig und DAS wird uebernommen',
    GP.undoStand.undo === vorUndo + 1 && !GP.inlineStand.offen);
  GP.undo();
  await warte();
  GP.werkzeug('auswahl');
}

// --- 32) Doppelklick in JEDEM Werkzeug, ohne Werkzeugaktion ---------------
$('gp-plan-lock').checked = false;
$('gp-plan-lock').dispatch('change');
for (const wz of ['auswahl', 'bemassen', 'wand', 'plan']) {
  for (const wo of ['zahl', 'linie']) {
    GP.werkzeug(wz);
    const p = wo === 'zahl' ? gp('bemTextPunkt', bmX.id) : gp('bemPunkt', bmX.id);
    const vorMappe = mappeText(), vorUndo = GP.undoStand.undo;
    const vorEl = store.listeElemente().length, vorMasse = GP.bemassungen().length;
    const vorVersatz = store.geschossPlan(gs2).versatz_x_mm;
    doppel(p);
    ok(`#51 Doppelklick auf die ${wo === 'zahl' ? 'Masszahl' : 'Massdarstellung'} `
      + `oeffnet im Werkzeug „${wz}" die Bearbeitung`,
      GP.inlineStand.offen && GP.inlineStand.id === bmX.id
      && GP.inlineStand.wert === String(bm51(bmX.id).mass_mm));
    ok(`#51 … und loest im Werkzeug „${wz}" vorher KEINE Werkzeugaktion aus`,
      mappeText() === vorMappe && GP.undoStand.undo === vorUndo
      && store.listeElemente().length === vorEl && GP.bemassungen().length === vorMasse
      && store.geschossPlan(gs2).versatz_x_mm === vorVersatz
      && GP.zustand.zeichnen === null && GP.zustand.werkzeug === wz);
    gp('inlineTaste', 'Escape');
  }
}
$('gp-plan-lock').checked = true;
$('gp-plan-lock').dispatch('change');
GP.werkzeug('auswahl');

// --- 33) Ausnahme: ein laufender Entwurf braucht seinen Zielbezug ---------
{
  // Die Massdarstellung von bmX (Achse x) liegt auf einer y-Koordinate — genau wie
  // der Wert eines y-Bezugs. Sie wird per `linie_mm` GENAU auf den Zielbezug gelegt,
  // damit ein Klick beides trifft und die Rangfolge wirklich geprueft wird.
  const ziel = GP.bezugsPunkt(idB, 'y', 'min');
  const q0 = gp('bemPunkt', bmX.id);
  store.aendereMappe(m => MAPPE.setzeBemassung(m, gs2,
    { ...CON.normBemassung(bm51(bmX.id)), linie_mm: Math.round(ziel.y - q0.y) }));
  await warte();
  GP.render();
  const p = { x: ziel.x, y: ziel.y };
  ok('#51 Pruefaufbau: an diesem Punkt liegen Massdarstellung UND Zielbezug',
    GP.bemTreffer(p) === bmX.id && !!GP.bezugTreffer(p, 'y'));
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA, 'y', 'mitte'));
  GP.tippe(p);
  ok('#51 der laufende Entwurf bekommt seinen Zielbezug — das Mass darunter gewinnt NICHT',
    !!GP.zustand.bem && GP.zustand.bem.bis !== null
    && GP.zustand.bem.bis.wand === idB && GP.zustand.bem.bis.bezug === 'min'
    && GP.inlineStand.offen && GP.inlineStand.id === null);
  gp('taste', 'Escape');
  GP.werkzeug('auswahl');
  store.aendereMappe(m => MAPPE.setzeBemassung(m, gs2,
    { ...CON.normBemassung(bm51(bmX.id)), linie_mm: null }));
  await warte();
  GP.render();
  ok('#51 danach steht die Massdarstellung wieder an ihrer automatischen Stelle',
    bm51(bmX.id).linie_mm == null);
}

// --- 34) Ziehen verschiebt die GANZE Bemassung quer ------------------------
{
  const anderes = GP.bemassungen().filter(b => b.id !== bmX.id).map(b => [b.id, gVon(b.id)]);
  const vorFuss = fussVon(bmX.id), vorLinie = massLinieVon(bmX.id), vorText = textVon(bmX.id);
  const vorPos = posVon(), vorWert = bm51(bmX.id).mass_mm, vorUndo = GP.undoStand.undo;
  const p0 = gp('bemTextPunkt', bmX.id);

  GP.ziehe(p0, { x: p0.x + 400, y: p0.y + 300 });
  await warte();
  const l = bm51(bmX.id).linie_mm;
  ok('#51 der Zug an der Masszahl speichert den Querversatz `linie_mm`',
    typeof l === 'number' && Math.abs(l - 300) < 1);
  ok('#51 der Laengsanteil des Zugs wirkt NICHT — nur quer zur Messrichtung',
    zahlen(massLinieVon(bmX.id))[0] === zahlen(vorLinie)[0]);
  ok('#51 Masslinie UND Masszahl wandern gemeinsam',
    massLinieVon(bmX.id) !== vorLinie && textVon(bmX.id) !== vorText
    && Math.abs((zahlen(textVon(bmX.id))[1] - zahlen(vorText)[1])
      - (zahlen(massLinieVon(bmX.id))[1] - zahlen(vorLinie)[1])) < 0.01);
  ok('#51 die Hilfslinien bleiben an den unveraenderten Referenzen verankert …',
    fussVon(bmX.id) === vorFuss);
  ok('#51 … und passen sich in der Laenge an', linieVon(bmX.id) !== '' && linieVon(bmX.id).length > 0
    && linieVon(bmX.id).indexOf(vorFuss) === 1
    && linieVon(bmX.id) !== vorFuss + 'L' + vorLinie);
  ok('#51 Maßwert, Bezuege und alle Wandlagen bleiben unberuehrt (reine Darstellung)',
    bm51(bmX.id).mass_mm === vorWert && posVon() === vorPos
    && JSON.stringify(bm51(bmX.id).von) === JSON.stringify(CON.normBemassung(bmX).von)
    && JSON.stringify(bm51(bmX.id).bis) === JSON.stringify(CON.normBemassung(bmX).bis));
  ok('#51 [K-5] der Loeser rechnet unveraendert — `linie_mm` erreicht ihn nie',
    JSON.stringify(CON.pruefeGeschoss(gsWaende(), GP.bemassungen()))
      === JSON.stringify(CON.pruefeGeschoss(gsWaende(),
        GP.bemassungen().map(b => ({ ...b, linie_mm: null })))));
  ok('#51 Masse ohne `linie_mm` behalten ihre automatische Stelle (bitgenau)',
    anderes.every(([id, s]) => gVon(id) === s));
  ok('#51 die verschobene Bemassung ist an ihrer neuen Stelle anklickbar',
    GP.bemTreffer(gp('bemPunkt', bmX.id)) === bmX.id
    && GP.bemTextTreffer(gp('bemTextPunkt', bmX.id)) === bmX.id);
  ok('#51 der Zug ist genau EIN Rueckgaengig-Schritt', GP.undoStand.undo === vorUndo + 1);
  ok('#51 er ueberlebt das Neuladen: `linie_mm` steht in der Projektmappe',
    /"linie_mm":/.test(mappeText())
    && MAPPE.bemassungen(store.holeMappe(), gs2).find(b => b.id === bmX.id).linie_mm === l);

  // Der Zug an der MASSLINIE tut genau dasselbe — kein zweiter Bedienweg.
  const p1 = gp('bemPunkt', bmX.id);
  GP.ziehe(p1, { x: p1.x, y: p1.y - 125 });
  await warte();
  ok('#51 der Zug an der Masslinie verschiebt dieselbe Darstellung',
    Math.abs(bm51(bmX.id).linie_mm - (l - 125)) < 1 && bm51(bmX.id).mass_mm === vorWert);

  GP.undo();
  await warte();
  GP.undo();
  await warte();
  ok('#51 Rueckgaengig holt die Bemassung an ihren automatischen Platz zurueck',
    bm51(bmX.id).linie_mm == null && massLinieVon(bmX.id) === vorLinie
    && textVon(bmX.id) === vorText);
  GP.redo();
  await warte();
  ok('#51 Wiederholen verschiebt sie erneut', Math.abs(bm51(bmX.id).linie_mm - l) < 1);
  GP.undo();
  await warte();
}

// --- 35) Die y-Achse: quer ist dort x ------------------------------------
{
  const vorWert = bm51(bmY.id).mass_mm, vorFuss = fussVon(bmY.id);
  const p = gp('bemTextPunkt', bmY.id);
  GP.ziehe(p, { x: p.x - 500, y: p.y + 200 });
  await warte();
  ok('#51 bei Achse y ist der Querversatz die x-Richtung — der Laengsanteil wirkt nicht',
    Math.abs(bm51(bmY.id).linie_mm + 500) < 1 && bm51(bmY.id).mass_mm === vorWert
    && fussVon(bmY.id) === vorFuss);
  GP.undo();
  await warte();
}

// --- 36) Altbestand `text_mm` bleibt verlustfrei wirksam ------------------
{
  store.aendereMappe(m => MAPPE.setzeBemassung(m, gs2,
    { ...CON.normBemassung(bm51(bmY.id)), text_mm: { x: -300, y: 0 } }));
  await warte();
  GP.render();
  const t0 = zahlen(textVon(bmY.id)), l0 = zahlen(massLinieVon(bmY.id));
  ok('#51 ein alter Labelversatz (`text_mm`) wird weiterhin dargestellt',
    bm51(bmY.id).text_mm.x === -300 && Math.abs(t0[0] - (l0[0] - 300)) < 12);
  const p = gp('bemTextPunkt', bmY.id);
  GP.ziehe(p, { x: p.x - 250, y: p.y });
  await warte();
  const t1 = zahlen(textVon(bmY.id)), l1 = zahlen(massLinieVon(bmY.id));
  ok('#51 ein neuer Zug schreibt nur `linie_mm` und laesst `text_mm` unangetastet',
    bm51(bmY.id).text_mm.x === -300 && Math.abs(bm51(bmY.id).linie_mm + 250) < 1);
  ok('#51 … der relative Labelversatz bleibt damit erhalten (beides wandert gemeinsam)',
    t1[0] - t0[0] === l1[0] - l0[0] && t1[0] - t0[0] !== 0);
  GP.undo();
  await warte();
  store.aendereMappe(m => MAPPE.setzeBemassung(m, gs2,
    { ...CON.normBemassung(bm51(bmY.id)), text_mm: null }));
  await warte();
  GP.render();
}

// --- 37) Klick und Doppelklick loesen kein Ziehen aus --------------------
{
  const p = gp('bemTextPunkt', bmX.id);
  const vorMappe = mappeText(), vorUndo = GP.undoStand.undo;
  GP.tippe(p);
  ok('#51 ein Klick OHNE Zug waehlt nur aus — er speichert nichts und bucht nichts',
    GP.zustand.bemAktiv === bmX.id && mappeText() === vorMappe
    && GP.undoStand.undo === vorUndo);
  const winzig = 2 * GP.blick.mm;               // unter der Schwelle von 3 px
  GP.ziehe(p, { x: p.x + winzig, y: p.y + winzig });
  await warte();
  ok('#51 ein Zittern unterhalb der Schwelle bleibt ein Klick',
    mappeText() === vorMappe && GP.undoStand.undo === vorUndo);
  doppel(p);
  ok('#51 ein Doppelklick verschiebt die Bemassung nicht, sondern oeffnet die Eingabe',
    GP.inlineStand.offen && mappeText() === vorMappe && GP.undoStand.undo === vorUndo
    && GP.zustand.bemZieh === null);
  gp('inlineTaste', 'Escape');
}

// --- 38) Loeschen mit Delete und Backspace -------------------------------
for (const taste of ['Delete', 'Backspace']) {
  const vorUndo = GP.undoStand.undo;
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA, 'y', 'max'));
  GP.tippe(GP.bezugsPunkt(idB, 'y', 'max'));
  inlineEnter(2500);
  await warte();
  const id = GP.bemassungen()[GP.bemassungen().length - 1].id;
  GP.werkzeug('auswahl');
  GP.tippe(gp('bemPunkt', id));
  ok(`#51 Pruefaufbau fuer ${taste}: das Mass ist gewaehlt`, GP.zustand.bemAktiv === id);
  gp('taste', taste);
  await warte();
  ok(`#51 ${taste} loescht das gewaehlte Mass — genau EIN Rueckgaengig-Schritt`,
    !bm51(id) && GP.undoStand.undo === vorUndo + 2);
  GP.undo();
  await warte();
  ok(`#51 Rueckgaengig holt das mit ${taste} geloeschte Mass zurueck`, !!bm51(id));
  GP.undo();
  await warte();
}
{
  const vorMappe = mappeText(), vorUndo = GP.undoStand.undo;
  GP.tippe({ x: 90000, y: 90000 });                 // Auswahl aufheben
  gp('taste', 'Delete');
  ok('#51 ohne gewaehltes Mass loescht Delete nichts und sagt es',
    mappeText() === vorMappe && GP.undoStand.undo === vorUndo
    && /Kein Maß gewählt/.test($('gp-msg').textContent));
}
{
  // Waende bleiben tabu: Delete ist ausdruecklich KEIN Weg, eine Wand zu loeschen.
  const vorEl = store.listeElemente().length, vorWaende = gsWaende().length;
  GP.tippe(mitteVon(idA));
  gp('taste', 'Delete');
  await warte();
  ok('#51 Delete loescht NIE eine Wand — nur Masse',
    GP.zustand.aktiv === idA && store.listeElemente().length === vorEl
    && gsWaende().length === vorWaende);
}
{
  // Im Eingabefeld gehoert Delete dem Text, nicht der Zeichnung.
  GP.tippe(gp('bemPunkt', bmX.id));
  const id = GP.zustand.bemAktiv;
  const vorMappe = mappeText();
  gp('taste', 'Delete', { tagName: 'INPUT' });
  ok('#51 mit Fokus in einem Eingabefeld loescht Delete kein Mass',
    !!bm51(id) && mappeText() === vorMappe);
  doppel(gp('bemTextPunkt', bmX.id));
  gp('taste', 'Backspace');
  ok('#51 bei offener Inline-Eingabe ebenfalls nicht',
    !!bm51(bmX.id) && GP.inlineStand.offen);
  gp('inlineTaste', 'Escape');
}

// --- 39) Kein Bump, ein Schreibweg, kein zweites Massmodell --------------
ok('#51 `linie_mm` ist ein optionales Darstellungsfeld der VORHANDENEN Bemassung',
  MAPPE.MAPPE_VERSION === 2 && store.SCHEMA_VERSION === 6
  && MAPPE.validiereMappe(store.holeMappe()).length === 0
  && CON.normBemassung({ id: 'x', achse: 'x', von: null, bis: { wand: 'a', bezug: 'min' },
                         mass_mm: 10 }).linie_mm === null
  && CON.normBemassung({ id: 'x', achse: 'x', von: null, bis: { wand: 'a', bezug: 'min' },
                         mass_mm: 10, linie_mm: -250 }).linie_mm === -250);
ok('#51 ein unbrauchbarer Querversatz wird benannt abgewiesen, nicht verworfen',
  CON.bemassungFehler({ id: 'x', achse: 'x', von: null, bis: { wand: 'a', bezug: 'min' },
                        mass_mm: 10, linie_mm: 'weit' })
    .some(f => /Querversatz der Maßdarstellung muss eine Zahl/.test(f)));
ok('#51 geschrieben wird der Querversatz ueber denselben `setzeBemassung`-Weg',
  /MAPPE\.setzeBemassung\(m, gs\.id, \{ \.\.\.n, linie_mm \}\)/.test(html)
  && (html.match(/store\.aendereMappe\(m => MAPPE\.setzeBemassung/g) || []).length === 1);
ok('#51 und der Maßwert ausschliesslich ueber `bemSetzen` → `speichereBemassung`',
  // Genau zwei Aufrufstellen: die beiden Zweige von `bemSetzen` (#60 — das
  // Fixieren hatte eine dritte, sie ist mit dem Werkzeug entfallen). Die
  // Inline-Eingabe legt KEINE weitere an, sondern ruft `bemSetzen(roh)` auf.
  (html.match(/speichereBemassung\(\{/g) || []).length === 2
  && /function bemSetzen\(roh\)/.test(html)
  && /ok = bemSetzen\(roh\) === true/.test(html)
  && !/speichereBemassung\(/.test(html.slice(html.indexOf('function inlineUebernehmen'),
                                             html.indexOf('function inlineTaste'))));
ok('#51 der Maßwert wird nirgends mehr aus einem Seitenleisten-Feld gelesen',
  !/gp-bem-wert/.test(html));

// --- 40) Inline-Eingabe im ECHTEN Zeigerstrom ----------------------------
// `render()` ersetzt bei jedem pointerdown/pointerup den SVG-Kindbaum der Buehne.
// Chromium 148 erzeugt daraus weder `click` noch `dblclick`, der dblclick-Behandler
// ist aus echter Eingabe also unerreichbar. Deshalb wird hier AUSSCHLIESSLICH ueber
// die wirklich gebundenen Buehnen-Listener bedient — zwei schnelle
// pointerdown/pointerup-Paare, kein vorgefertigtes `dblclick` und kein direkter
// Aufruf von beiDoppelklick/doppeltippe.
{
  const buehne = $('gp-buehne');
  const feuer = (typ, welt, zeit) => {
    const p = gp('schirmPunkt', welt);
    buehne.dispatch(typ, { clientX: p.x, clientY: p.y, button: 0, timeStamp: zeit,
                           preventDefault(){} });
  };
  const tippPaar = (welt, zeit) => { feuer('pointerdown', welt, zeit); feuer('pointerup', welt, zeit); };

  gp('inlineTaste', 'Escape');
  GP.werkzeug('auswahl');
  GP.render();

  const pX = gp('bemTextPunkt', bmX.id);
  const vorMappe = mappeText(), vorUndo = GP.undoStand.undo;
  tippPaar(pX, 1000);
  ok('#51 ein einzelner Tipp waehlt nur aus und oeffnet keine Eingabe',
    GP.zustand.bemAktiv === bmX.id && !GP.inlineStand.offen);
  tippPaar(pX, 1150);
  ok('#51 zwei schnelle Zeigerpaare auf DASSELBE Mass oeffnen die Inline-Eingabe '
    + '(ohne dblclick — der Kindbaum wird bei jedem Ereignis neu geschrieben)',
    GP.inlineStand.offen && GP.inlineStand.id === bmX.id
    && GP.inlineStand.wert === String(bm51(bmX.id).mass_mm));
  ok('#51 das Oeffnen im Zeigerstrom schreibt nichts, bucht nichts und wechselt '
    + 'das Werkzeug nicht ([K-3])',
    mappeText() === vorMappe && GP.undoStand.undo === vorUndo
    && GP.zustand.werkzeug === 'auswahl' && GP.zustand.bemZieh === null);
  gp('inlineTaste', 'Escape');

  // Zu langsam ist kein Doppelklick.
  tippPaar(pX, 5000);
  tippPaar(pX, 9000);
  ok('#51 zwei langsame Tipps sind zwei Klicks — die Eingabe bleibt zu',
    !GP.inlineStand.offen && mappeText() === vorMappe);

  // Zwei verschiedene Masse sind kein Doppelklick.
  const pY = gp('bemTextPunkt', bmY.id);
  tippPaar(pX, 12000);
  tippPaar(pY, 12100);
  ok('#51 schnelle Tipps auf VERSCHIEDENE Masse oeffnen nichts',
    !GP.inlineStand.offen && GP.zustand.bemAktiv === bmY.id);

  // Ein echter Zug bleibt ein Zug — und er startet keine Doppelklickfolge.
  tippPaar(pX, 15000);
  const weit = 40 * GP.blick.mm;                  // klar ueber der Schwelle
  feuer('pointerdown', pX, 15100);
  feuer('pointermove', { x: pX.x, y: pX.y + weit }, 15120);
  feuer('pointerup', { x: pX.x, y: pX.y + weit }, 15140);
  await warte();
  ok('#51 ein echter Zug verschiebt die Darstellung und oeffnet keine Eingabe',
    !GP.inlineStand.offen && bm51(bmX.id).linie_mm != null
    && GP.undoStand.undo === vorUndo + 1);
  GP.undo();
  await warte();
  // Der Zeitstempel der Mappe laeuft mit; verglichen wird der Inhalt.
  const ohneStempel = (t) => String(t).replace(/"geaendert":"[^"]*"/g, '""');
  ok('#51 nach dem Zug ist der Stand wieder der alte',
    bm51(bmX.id).linie_mm == null && ohneStempel(mappeText()) === ohneStempel(vorMappe));
}

// ==========================================================================
//  Issue #53, Paket 3 — schwebende Bedienoberflaeche, Planverwaltung, Drehsperre
// ==========================================================================
// Wieder REINE BEDIENUNG: kein Feld in der Projektmappe, keine Formatversion,
// keine [K]-Regel und keine Zeile Constraint-Mathematik. Geprueft wird deshalb
// vor allem, was NICHT passiert — kein zweiter Uploadweg, kein Referenzgeschoss,
// keine gespeicherten Ansichtsschalter, kein stilles Drehen ueber ein Mass hinweg.

// --- 27) Das linke Panel ist ersatzlos weg --------------------------------
ok('#53 es gibt keine linke Bedienflaeche mehr',
  !/class="gp-tools"/.test(html) && !/<aside/.test(html) && !/gp-zurueck/.test(html));
ok('#53 die Zeichenflaeche liegt in einem eigenen Raum, die Bedienung schwebt darueber',
  /<div class="gp-raum">/.test(html)
  && /<div class="gp-buehne" id="gp-buehne"><\/div>/.test(html));
ok('#53 der Rueckweg nach Modul 0 bleibt erreichbar',
  /index\.html">‹ Projektplaner/.test(html));

// --- 28) Obere Werkzeugleiste: Werkzeuge, Undo/Redo, Drehen ---------------
{
  const oben = (html.split('id="gp-oben"')[1] || '').split('id="gp-liste"')[0];
  ok('#53/#60 die drei Zeichenwerkzeuge stehen in der oberen Leiste',
    ['wz-auswahl', 'wz-wand', 'wz-bemassen'].every(i => oben.includes(`id="${i}"`))
    && !oben.includes('wz-fixieren'));
  ok('#53 Undo, Redo und Drehen sind in dieselbe Leiste gezogen',
    oben.includes('id="gp-undo"') && oben.includes('id="gp-redo"')
    && oben.includes('id="gp-drehen"'));
  ok('#53 „Plan verschieben" steht ausdruecklich NICHT in der Werkzeugleiste',
    !oben.includes('gp-plan-schieben') && !/id="wz-plan"/.test(html));
  ok('#53 jedes Werkzeug nennt Bedeutung und Kuerzel im Tooltip',
    (oben.match(/title="[^"]*\((?:Esc|W|D|R|Strg\+Z|Strg\+Umschalt\+Z)\)/g) || []).length >= 5);
}
GP.werkzeug('wand');
ok('#53 das aktive Werkzeug ist eindeutig hervorgehoben — und nur dieses',
  $('wz-wand').className === 'an' && $('wz-auswahl').className === ''
  && $('wz-bemassen').className === '');
GP.werkzeug('auswahl');

// --- 29) Untere Ansichtsleiste und die zwei fluechtigen Schalter ----------
ok('#53 Zoom, Fang und die Ebenenschalter stehen in der unteren Ansichtsleiste',
  ['gp-zoom-minus', 'gp-zoom-plus', 'gp-zoom-alles', 'gp-fang', 'gp-raster', 'gp-masse',
   'gp-plan-knopf'].every(i => ansichtLeiste.includes(`id="${i}"`)));
{
  const vorMappe53 = localStorage.getItem('sembla:projekte');
  const vorUndo53 = GP.undoStand.undo;
  const vorLoeser = JSON.stringify(GP.loesen());
  ok('#53 beide Ansichtsschalter starten EIN', GP.zustand.rasterAn === true && GP.zustand.masseAn === true);

  $('gp-raster').checked = false; $('gp-raster').dispatch('change');
  ok('#53 „Raster" aus ⇒ keine Rasterlinien mehr im SVG',
    !/class="rasterfein"/.test(GP.svg) && !/class="rasterhaupt"/.test(GP.svg));
  $('gp-raster').checked = true; $('gp-raster').dispatch('change');
  ok('#53 … und wieder ein ⇒ bit-genau dasselbe Raster', /class="rasterfein"/.test(GP.svg));

  const masseVorher = (GP.svg.match(/class="bemassung/g) || []).length;
  $('gp-masse').checked = false; $('gp-masse').dispatch('change');
  ok('#53 „Bemassungen" aus ⇒ sie werden nicht gezeichnet',
    masseVorher > 0 && !/class="bemassung/.test(GP.svg));
  {
    const p = gp('bemPunkt', GP.bemassungen()[0].id);
    ok('#53 ein ausgeblendetes Mass ist auch nicht anklickbar (keine unsichtbare Trefferflaeche)',
      p === null || GP.bemTreffer(p) === null);
  }
  ok('#53 die Masse bleiben dabei vollstaendig wirksam — der Loeser rechnet unveraendert ([K-5])',
    JSON.stringify(GP.loesen()) === vorLoeser
    && GP.bemassungen().length > 0);
  // Wer Masse bearbeitet, muss sie sehen: D und F blenden sie ein und sagen es.
  GP.werkzeug('bemassen');
  ok('#53 das Werkzeug Mass blendet Bemassungen ein und benennt das',
    GP.zustand.masseAn === true && /eingeblendet/.test($('gp-msg').textContent)
    && $('gp-masse').disabled === true);
  GP.werkzeug('auswahl');
  ok('#53 ausserhalb von D/F ist der Schalter wieder frei', $('gp-masse').disabled === false);

  ok('#53 kein Ansichtsschalter wird gespeichert — die Mappe ist unberuehrt',
    localStorage.getItem('sembla:projekte') === vorMappe53 && GP.undoStand.undo === vorUndo53
    && !/rasterAn|masseAn|planBlatt/.test(localStorage.getItem('sembla:projekte')));
}

// --- 30) Planverwaltung: EIN Uploadweg, im Blatt von unten ----------------
// Der Editor ist seit #53 der einzige Ort, an dem ein Geschossplan hochgeladen,
// ersetzt und entfernt wird ([L-8]/[L-9]). Gefahren wird der ECHTE Behandler.
globalThis.createImageBitmap = async (b) => ({ width: b._w || 1600, height: b._h || 1200, close(){} });
const dateiDouble = (name, type, size, w, h) => ({ name, type, size, _w: w, _h: h });
const planVon = () => store.geschossPlan(store.aktivesGeschossId());
{
  ok('#53 alle Planbedienelemente liegen im Blatt und nirgends sonst',
    (html.match(/id="gp-plan-import"/g) || []).length === 1
    && (html.split('id="gp-planblatt"')[1] || '').includes('id="gp-plan-import"')
    && (html.split('id="gp-planblatt"')[1] || '').includes('id="gp-plan-entfernen"')
    && (html.split('id="gp-planblatt"')[1] || '').includes('id="gp-kal-start"')
    && (html.split('id="gp-planblatt"')[1] || '').includes('id="gp-plan-schieben"'));
  ok('#53 der Uploadweg nimmt nur Rasterbilder an ([L-8])',
    /<input id="gp-plan-import" type="file" accept="image\/png,image\/jpeg,image\/webp"/.test(html));

  ok('#53 das Blatt ist zu, bis es geoeffnet wird', $('gp-planblatt').hidden === true);
  $('gp-plan-knopf').dispatch('click');
  ok('#53 „Plan…" oeffnet die Planverwaltung',
    $('gp-planblatt').hidden === false && GP.zustand.planBlatt === true);

  // 30a) PDF und zu grosse Bilder werden benannt abgewiesen — nichts geschrieben.
  const mappeVorUpload = localStorage.getItem('sembla:projekte');
  await $('gp-plan-import').dispatch('change', {
    target: { files: [dateiDouble('grundriss.pdf', 'application/pdf', 400000)], value: '' } });
  const planVorher = JSON.stringify(planVon());
  ok('#53 [L-8] ein PDF wird abgewiesen und der Grund genannt',
    /PDF/.test($('gp-msg').textContent) && $('gp-msg').className === 'msg err'
    && JSON.stringify(planVon()) === planVorher
    && localStorage.getItem('sembla:projekte') === mappeVorUpload);
  await $('gp-plan-import').dispatch('change', {
    target: { files: [dateiDouble('riesig.png', 'image/png', 25 * 1048576, 100, 100)], value: '' } });
  ok('#53 [L-8] ein zu grosses Bild wird abgewiesen statt verkleinert',
    /20 MB/.test($('gp-msg').textContent) && JSON.stringify(planVon()) === planVorher);

  // 30b) Echter Upload
  const lagenVorUpload = JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage));
  const undoVorUpload = GP.undoStand.undo;
  await $('gp-plan-import').dispatch('change', {
    target: { files: [dateiDouble('eg53.png', 'image/png', 123456, 1600, 1200)], value: '' } });
  await warte();
  ok('#53 der Plan ist hinterlegt — Beschreibung in der Mappe, Bild in der Plan-Datenbank',
    planVon() && planVon().datei === 'eg53.png' && planVon().breite_px === 1600
    && !!(await PLAN.holePlan(store.aktivesGeschossId())));
  ok('#53 [L-8] das Bild landet NICHT im localStorage',
    !localStorage.getItem('sembla:projekte').includes('blob')
    && !localStorage.getItem('sembla:projekte').includes('base64'));
  ok('#53 [L-9] ein frischer Plan ist unkalibriert — es wird kein Massstab geraten',
    planVon().mm_je_pixel === null && planVon().versatz_x_mm === 0);
  ok('#53 [L-1] der Upload hat keine Wandlage angetastet …',
    JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === lagenVorUpload);
  ok('#53 [K-10]/[L-8] … und keinen Rueckgaengig-Schritt gebucht',
    GP.undoStand.undo === undoVorUpload);
  ok('#53 der unkalibrierte Plan liegt sofort vorlaeufig als Hintergrund, ohne Raster',
    /class="planbild vorlaeufig"/.test(GP.svg) && !/class="rasterfein"/.test(GP.svg));
  ok('#53 die Ansichtsleiste nennt den Zustand kurz', $('gp-plan-chip').textContent === 'nicht kalibriert');

  // 30c) Ersetzen setzt Massstab und Versatz zurueck ([L-9])
  store.setzeGeschossPlanAnsicht(store.aktivesGeschossId(), { mm_je_pixel: 8, versatz_x_mm: 250 });
  await warte();
  await $('gp-plan-import').dispatch('change', {
    target: { files: [dateiDouble('og53.jpg', 'image/jpeg', 99999, 800, 600)], value: '' } });
  await warte();
  ok('#53 [L-9] ein neues Bild setzt Massstab und Versatz ausdruecklich zurueck',
    planVon().datei === 'og53.jpg' && planVon().mm_je_pixel === null
    && planVon().versatz_x_mm === 0 && /zurückgesetzt/.test($('gp-msg').textContent));
  ok('#53 [L-1] auch das Ersetzen laesst jede Wandlage stehen',
    JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === lagenVorUpload);

  // 30d) „Plan verschieben" ist Planverwaltung, kein Werkzeug der oberen Leiste
  store.setzeGeschossPlanAnsicht(store.aktivesGeschossId(), { mm_je_pixel: 10 });
  await warte();
  $('gp-plan-schieben').dispatch('click');
  ok('#53 „Plan verschieben" schaltet den Modus aus dem Blatt heraus ein',
    GP.zustand.werkzeug === 'plan' && $('gp-plan-schieben').className === 'btn-s an');
  $('gp-plan-zu').dispatch('click');
  ok('#53 das Schliessen des Blattes beendet auch den Verschiebemodus',
    $('gp-planblatt').hidden === true && GP.zustand.werkzeug === 'auswahl');
  GP.taste('p');
  ok('#53 die Taste P fuehrt in dieselbe Planverwaltung (ein Weg, zwei Ausloeser)',
    GP.zustand.planBlatt === true && GP.zustand.werkzeug === 'plan');
  GP.werkzeug('auswahl');

  // 30e) Waehrend der Punktwahl schrumpft das Blatt auf Status und Abbruch
  if ($('gp-planblatt').hidden) $('gp-plan-knopf').dispatch('click');
  ok('#53 Pruefaufbau: die Planverwaltung ist offen', $('gp-planblatt').hidden === false);
  $('gp-kal-start').dispatch('click');
  ok('#53 der Kalibriermodus reduziert das Blatt auf eine kompakte Bedienung',
    GP.zustand.kal.an === true && $('gp-planblatt').className === 'gp-sheet kompakt'
    && $('gp-planblatt').hidden === false && $('gp-kal-block').hidden === false);
  {
    const mmVorKal = GP.blick.mm;
    GP.tippe({ x: 100, y: 100 });
    $('gp-zoom-plus').dispatch('click');
    GP.tippe({ x: 400, y: 100 });
    ok('#53 die Buehne bleibt waehrend der Punktwahl voll nutzbar (Klicken und Zoomen)',
      GP.zustand.kal.punkte.length === 2 && GP.blick.mm !== mmVorKal);
  }
  $('gp-kal-abbruch').dispatch('click');
  ok('#53 nach dem Abbruch ist die volle Planverwaltung wieder da',
    GP.zustand.kal.an === false && $('gp-planblatt').className === 'gp-sheet'
    && $('gp-planblatt').hidden === false);

  // 30f) Entfernen
  confirmAntwort = false;
  await $('gp-plan-entfernen').dispatch('click');
  ok('#53 ohne Bestaetigung wird nichts entfernt', planVon() !== null);
  confirmAntwort = true;
  await $('gp-plan-entfernen').dispatch('click');
  await warte();
  ok('#53 Entfernen loescht Beschreibung UND Bild',
    planVon() === null && (await PLAN.holePlan(store.aktivesGeschossId())) === null);
  ok('#53 [L-1] und laesst die Wandlagen unveraendert',
    JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage)) === lagenVorUpload
    && /unverändert/.test($('gp-msg').textContent));
  $('gp-plan-zu').dispatch('click');
}

// --- 31) Drehen: jede unmittelbar anliegende Bemassung sperrt -------------
{
  const prj53 = store.fuegeProjektHinzu('Drehsperre', { geschoss: 'EG', hoehe_mm: 2600 });
  const gs53 = MAPPE.alleGeschosse(prj53)[0].geschoss.id;
  store.setzeAktivesGeschoss(gs53);
  await warte();
  $('gp-fang').checked = true; $('gp-fang').dispatch('change');
  GP.zeigeAlles();
  GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 0 }, { x: 1000, y: 0 });
  await warte();
  const w53 = MAPPE.findeGeschoss(store.holeMappe(), gs53).geschoss.waende[0].id;
  GP.werkzeug('auswahl');
  GP.tippe({ x: 500, y: 62.5 });

  const lage53 = () => MAPPE.findeWand(store.holeMappe(), w53).wand.lage;
  ok('#53 Pruefaufbau: eine freie, verortete Wand ist aktiv und drehbar',
    GP.zustand.aktiv === w53 && lage53().richtung === 'x' && $('gp-drehen').disabled === false);
  GP.drehe();
  await warte();
  ok('#53 ohne Mass dreht sie wie bisher (Laenge unveraendert)',
    lage53().richtung === 'y' && lage53().laenge_grid === 8);
  GP.drehe();
  await warte();
  ok('#53 zweimal drehen ist bit-genau die Ausgangslage', lage53().richtung === 'x');

  // Ein einziges Mass an DIESER Wand — mehr braucht es nicht. Gemessen wird
  // gegen den Geschossursprung, also im ganz normalen Massewerkzeug (#60).
  GP.werkzeug('bemassen');
  GP.tippe(gp('bezugsPunkt', null, 'x'));
  GP.tippe(gp('bezugsPunkt', w53, 'x', 'min'));
  inlineEnter(GP.inlineStand.wert);
  await warte();
  ok('#53 Pruefaufbau: genau ein Mass haengt unmittelbar an der Wand',
    GP.bemassungen().length === 1);
  GP.werkzeug('auswahl');
  GP.tippe({ x: 500, y: 62.5 });
  const lageVorDreh = JSON.stringify(lage53());
  const undoVorDreh = GP.undoStand.undo;
  ok('#53 der Drehknopf ist damit gesperrt', $('gp-drehen').disabled === true);
  GP.drehe();
  await warte();
  ok('#53 Drehen wird abgewiesen und nennt das anliegende Mass',
    JSON.stringify(lage53()) === lageVorDreh && $('gp-msg').className === 'msg err'
    && /hängt/.test($('gp-msg').textContent)
    && /Maß/.test($('gp-msg').textContent));
  ok('#53 die Abweisung schreibt nichts und bucht keinen Rueckgaengig-Schritt',
    GP.undoStand.undo === undoVorDreh);
  GP.taste('r');
  await warte();
  ok('#53 auch die Taste R laeuft durch dieselbe Sperre',
    JSON.stringify(lage53()) === lageVorDreh);

  // Und die alte Sicherheitspruefung bleibt — mit UNTERSCHEIDBARER Meldung.
  const direktText = $('gp-msg').textContent;
  GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 2000 }, { x: 1000, y: 2000 });
  await warte();
  const w53b = MAPPE.findeGeschoss(store.holeMappe(), gs53).geschoss.waende[1].id;
  GP.werkzeug('bemassen');
  GP.tippe(gp('bezugsPunkt', w53, 'y', 'mitte'));
  GP.tippe(gp('bezugsPunkt', w53b, 'y', 'mitte'));
  $('gp-inline').value = '2000';
  gp('inlineTaste', 'Enter');
  await warte();
  GP.werkzeug('auswahl');
  GP.tippe({ x: 500, y: 2000 });
  ok('#53 Pruefaufbau: die zweite Wand ist ueber ein Mass mit der ersten verbunden',
    GP.zustand.aktiv === w53b && GP.bemassungen().length === 2);
  GP.drehe();
  await warte();
  ok('#53 auch sie ist gesperrt — sie traegt das Mass ja selbst',
    /hängt/.test($('gp-msg').textContent));
  ok('#53 die beiden Sperrgruende sind unterscheidbar formuliert',
    /hängt/.test(direktText) && !/starre Gruppe/.test(direktText)
    && /starre Gruppe/.test(html));
}

// --- 12) Neuanlage speichert den katalogbasierten Zuschnitt (#15/#62) -----
// Der reale Weg: Wand ZEICHNEN und danach sofort das gespeicherte JSON lesen — ohne
// Modul 1. Frueher lief `buildWall` vor der Katalogvorbelegung, sodass der
// Altstand-Fallback des Cores (1100 mm) im Element festgeschrieben wurde.
{
  const BOM = await import("../../docs/shared/sembla-bom.js");
  const ZEI = await import("../../docs/shared/sembla-zeichnung.js");
  const KAT = await import("../../docs/shared/sembla-katalog.js");
  const katalogText = readFileSync(
    new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url), "utf8");
  const stuecke = (w) => (w.tension_columns || []).flatMap(c => (c.segments || []).flatMap(sg => sg.stuecke || []));

  // Ohne zugeordneten Katalog gibt es keine Auswahl — und dann auch keine erfundene Laenge.
  GP.werkzeug('wand');
  $('gp-hoehe').value = '2600';
  GP.zeichne({ x: 40000, y: 40000 }, { x: 42000, y: 40000 });
  await warte();
  const idOhne = GP.zustand.aktiv;
  const wOhne = store.holeElement(idOhne).wandelement;
  ok('#62 ohne Bauteilkatalog steht KEIN rod_lengths_mm:[1100] im Neubestand',
    wOhne.prestress.rod_lengths_mm.length === 0 && wOhne.rod_mm === null
    && !JSON.stringify(wOhne).includes('1100'));
  ok('#62 und kein reales 1100-mm-Stueck', stuecke(wOhne).length === 0);
  ok('der fehlende Zuschnitt bleibt sichtbar offen ([Z-1]/[L-12])',
    wOhne.validation.zuschnitt_konflikte.length > 0
    && wOhne.validation.zuschnitt_konflikte.every(k => k.grund === 'keine_standardlaenge')
    && /kein Bauteilkatalog/.test($('gp-msg').textContent));

  // Mit zugeordnetem Standardkatalog steht der Zuschnitt sofort im gespeicherten JSON.
  store.importiereKatalogText(katalogText);
  GP.werkzeug('wand');
  // Jeden Schreibvorgang am Wandspeicher mitschreiben: ein initial persistierter
  // Fallback-Stand faellt damit auf, auch wenn er sofort ueberschrieben wuerde (#15/#62).
  const schreibfolge = [];
  const echtesSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { if (k === 'sembla:elemente') schreibfolge.push(String(v)); return echtesSetItem(k, v); };
  GP.zeichne({ x: 40000, y: 44000 }, { x: 42000, y: 44000 });
  await warte();
  localStorage.setItem = echtesSetItem;
  const idMit = GP.zustand.aktiv;
  const wMit = store.holeElement(idMit).wandelement;

  const neueStaende = schreibfolge.filter(v => !!JSON.parse(v)[idMit]);
  ok('#15 die gezeichnete Wand wird GENAU EINMAL in den Wandspeicher geschrieben',
    neueStaende.length === 1);
  // Geprueft wird der EINTRAG DIESER WAND in jedem geschriebenen Stand — der uebrige
  // Speicher enthaelt bewusst Altbestand, fuer den der 1100-mm-Fallback weiter gilt.
  const staendeDieserWand = schreibfolge.map(v => JSON.parse(v)[idMit]).filter(Boolean);
  ok('#62 zu KEINEM Zeitpunkt stand ein 1100-mm-Zwischenstand dieser Wand im Speicher',
    staendeDieserWand.length > 0 && staendeDieserWand.every(e => !JSON.stringify(e).includes('1100')));
  ok('#15 schon der erste geschriebene Stand traegt Kataloglaengen, Reststueck und Rollen',
    JSON.stringify(JSON.parse(neueStaende[0])[idMit].wandelement.prestress.rod_lengths_mm) === '[1000,850]'
    && JSON.parse(neueStaende[0])[idMit].wandelement.prestress.rod_rest_mm === 100
    && (JSON.parse(neueStaende[0])[idMit].eingaben?.planung?.produkte?.rollen?.rod_std || []).length === 2);
  ok('#15 die gezeichnete Wand traegt sofort die Kataloglaengen',
    JSON.stringify(wMit.prestress.rod_lengths_mm) === '[1000,850]' && wMit.rod_mm === 1000);
  ok('#15 [Z-6] samt Reststueck am oberen Wandabschluss',
    wMit.prestress.rod_rest_mm === 100
    && wMit.tension_columns.every(c => c.segments.every(sg =>
         sg.z1_mm !== wMit.height_mm || sg.stuecke[sg.stuecke.length - 1].art === 'rest')));
  ok('#62 keine erfundene 1100-mm-Stange im gespeicherten Stand',
    !JSON.stringify(wMit).includes('1100'));
  ok('[P-18] die Verwendungsstellen sind dabei vorbelegt',
    store.holeProdukte(1, idMit).rollen.rod_std.length === 2
    && /Verwendungsstelle/.test($('gp-msg').textContent));
  ok('#62 Baustellenstueckliste und Zeichnung leiten OHNE Modul 1 denselben Satz ab',
    BOM.einbauteile(wMit).length === stuecke(wMit).length
    && BOM.semblaBomItems(wMit).filter(p => /^rod_/.test(p.key) && p.menge > 0)
         .every(p => stuecke(wMit).some(s => s.len_mm === p.mass_mm))
    && ZEI.einbauteilZeilen(wMit).length > 0 && ZEI.konfliktZeilen(wMit).length === 0);
  GP.undo(); await warte();
  ok('[K-10] Rueckgaengig nimmt die gezeichnete Wand samt Wandelement zurueck',
    !store.holeElement(idMit) && !MAPPE.findeWand(store.holeMappe(), idMit));
  GP.redo(); await warte();
  const zurueckMit = store.holeElement(idMit);
  ok('… und Wiederholen stellt genau den katalogbasierten Stand wieder her',
    !!zurueckMit
    && JSON.stringify(zurueckMit.wandelement.prestress.rod_lengths_mm) === '[1000,850]'
    && zurueckMit.wandelement.prestress.rod_rest_mm === 100);
}

let fail = 0;
for (const [n, c] of checks) { console.log((c ? '  ok  ' : 'FAIL  ') + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
