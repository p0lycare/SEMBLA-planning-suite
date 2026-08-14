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
  // Wie im echten DOM: dieselbe Funktion wird je Ereignis nur EINMAL registriert —
  // sonst feuerte der zweite __gpInit()-Lauf (#43) jeden Klick doppelt.
  addEventListener(e, f){
    const l = this.listeners[e] || (this.listeners[e] = []);
    if (!l.includes(f)) l.push(f);
  }
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
                'gp-planblatt': { hidden: true }, 'gp-kal-block': { hidden: true },
                // #75: der Sammel-Editor startet wie im Markup verborgen.
                'gp-sammel': { hidden: true } };
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
  // Auch hier Browser-Semantik: dieselbe Funktion nur einmal je Ereignis.
  addEventListener(e, f){
    const l = this._l[e] || (this._l[e] = []);
    if (!l.includes(f)) l.push(f);
  },
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
const { buildWall, Opening } = await import("../../docs/shared/sembla-core.js");
// Der Auslegungspfad von Modul 1 (#56): eine Laengenaenderung im Editor rechnet das
// vorhandene Wandelement damit NEU — derselbe Baustein, kein zweiter Rechenkern.
const ENG = await import("../../docs/shared/sembla-engine.js");
// Der gemeinsame Anlagepfad beider Anlageorte (#15/#62): er belegt die Verwendungsrollen
// vor und rechnet das Wandelement DARAUS neu, bevor es gespeichert bleibt.
const WA = await import("../../docs/shared/sembla-wandanlage.js");
// #43: Der Reiter 0,5 der gemeinsamen Kopfleiste ist der direkte Absprung hierher —
// im Test wird die ECHTE Navbar gemountet, nicht ein Nachbau ihres Markups.
const { mountNavbar, MODULE } = await import("../../docs/shared/navbar.js");
PLAN.setzeIndexedDB(fakeIndexedDB());

const html = readFileSync(new URL("../../docs/geschossplan.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische Skript
globalThis.window.SEMBLA = { store, MAPPE, CON, PLAN, MB, WA, ENG, Opening };

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
ok('die Seite ist kein neues Modul (kein MODULE-Eintrag, Ruecklink auf Modul 0) — der Reiter 0,5 ist nur ein Shortcut',
  MODULE.every(m => m.datei !== 'geschossplan.html')
  && /mountNavbar\(0\.5\)/.test(html) && /index\.html">‹ Projektplaner/.test(html));

// #43: Die echte Kopfleiste wird wie im Browser gemountet (mountNavbar(0.5)). Der
// Reiter 0,5 ist hier der aktuelle Navigationsort — auch im Leerzustand ohne aktives
// Geschoss —, und das Mounten selbst setzt keinen aktiven Zeiger.
const nav43 = new El('sb-nav');
document.querySelector = (sel) => (sel === '.sb-nav' ? nav43 : null);
mountNavbar(0.5);
ok('#43 ohne aktives Geschoss: der Reiter 0,5 ist hervorgehoben, der Leerzustand bleibt',
  /class="sb-tab active" href="geschossplan\.html"[^>]*><span class="n">0,5<\/span>/.test(nav43.innerHTML)
  && /Kein aktives Geschoss/.test($('gp-buehne').innerHTML));
ok('#43 das Mounten der Kopfleiste setzt keinen aktiven Zeiger (Projekt, Geschoss, Wand)',
  store.aktivesProjektId() === null && store.aktivesGeschossId() === null
  && store.aktivId() === null);
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

// --- 6) Vorhandene, unverortete Wand verorten ([L-4], #56) ----------------
const fremdId = store.speichere('Wand aus Modul 0', buildWall('Wand aus Modul 0', 2000, 2800, []));
store.verorteWand(fremdId, gsId, { lage: null });
await warte();
$('gp-ziel').value = fremdId;
$('gp-ziel').dispatch('change');
ok('unverortete Waende stehen als Ziel zur Wahl',
  $('gp-ziel').innerHTML.includes(fremdId) && GP.zustand.ziel === fremdId);
const rollenFremd = JSON.stringify(store.holeProdukte(1, fremdId).rollen);
GP.werkzeug('wand');
GP.zeichne({ x: 0, y: 4000 }, { x: 2500, y: 4000 });     // gezeichnet: 2500 statt bisher 2000
await warte();
const fremd = MAPPE.findeWand(store.holeMappe(), fremdId).wand;
ok('die vorhandene Wand wird verortet, ohne ein zweites Element anzulegen',
  store.listeElemente().length === 3 && fremd.lage.laenge_grid === 20);
// #56: Mit der Lage bekommt die Wand ihre massgebende Laenge — das Wandelement wird
// damit neu gerechnet, statt eine Abweichung stehen zu lassen.
ok('#56 das Verorten uebernimmt die gezeichnete Laenge ins Wandelement',
  store.holeElement(fremdId).wandelement.length_mm === 2500
  && store.holeElement(fremdId).wandelement.N_grid === 20);
ok('#56 dabei bleiben Hoehe und die uebrigen fachlichen Eingaben erhalten',
  store.holeElement(fremdId).wandelement.height_mm === 2800
  && JSON.stringify(store.holeProdukte(1, fremdId).rollen) === rollenFremd);
ok('#56 die laengenabhaengige Ableitung passt frisch zur neuen Laenge', (() => {
  const w = store.holeElement(fremdId).wandelement;
  const vorg = { name: w.name, length_mm: w.length_mm, height_mm: w.height_mm,
    openings: [], sides: w.sides, steps: [], prestress: { ...w.prestress },
    load: { qk_area: 1.00, gammaQ: 1.50 },
    material: w.verification && w.verification.material };
  const soll = (w.prestress && w.prestress.force_kN
    ? ENG.nachweisPruefen(vorg) : ENG.autoAuslegung(vorg)).wandelement;
  return JSON.stringify(w.bom) === JSON.stringify(soll.bom)
    && JSON.stringify(w.tension_columns) === JSON.stringify(soll.tension_columns)
    && w.courses.every(c => Math.max(0, ...c.stones.map(s => s.x1)) <= 2500); })());
ok('#56 es gibt nichts mehr zu melden — keine Abweichung in Meldung und Statuszeile',
  !/Abweichung/.test($('gp-msg').textContent)
  && !/Längenabweichung/.test($('gp-status').innerHTML));
// Muss 8 auch hier: Lage UND Wandelement gehen gemeinsam zurueck und wieder vor.
GP.undo(); await warte();
ok('#56 Rueckgaengig nimmt Verortung und Wandelement gemeinsam zurueck',
  MAPPE.findeWand(store.holeMappe(), fremdId).wand.lage === null
  && store.holeElement(fremdId).wandelement.length_mm === 2000);
GP.redo(); await warte();
ok('#56 Wiederholen stellt beide Staende wieder her',
  MAPPE.findeWand(store.holeMappe(), fremdId).wand.lage.laenge_grid === 20
  && store.holeElement(fremdId).wandelement.length_mm === 2500);

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
// #56: Die Groessenaenderung fuehrt das Wandelement MIT — es gibt keine Abweichung mehr,
// und damit auch nichts nach [L-3] zu melden. Abgeleitetes wird dabei frisch gerechnet.
ok('#56 die Groessenaenderung rechnet das Wandelement mit der neuen Rasterlaenge neu',
  store.holeElement(el3.id).wandelement.length_mm === 7 * CON.GRID_MM
  && store.holeElement(el3.id).wandelement.N_grid === 7
  && !/Längenabweichung/.test($('gp-status').innerHTML));
ok('#56 dabei bleiben Hoehe und Wandtyp der Wand erhalten',
  store.holeElement(el3.id).wandelement.height_mm === Number($('gp-hoehe').value)
  && store.holeElement(el3.id).wandelement.wandtyp === 'mit_wind');
// Die Ableitung stammt aus dem AUSLEGUNGSPFAD von Modul 1, nicht aus kopierten Altwerten:
// dieselbe Rechnung mit denselben Eingaben liefert Stueckliste, Lagen und Straenge bitgleich —
// und sie passt zur NEUEN Laenge (7 Raster), nicht mehr zur alten (10 Raster).
ok('#56 die Ableitung ist frisch aus dem Auslegungspfad, nicht kopiert', (() => {
  const w = store.holeElement(el3.id).wandelement;
  const vorg = { name: w.name, length_mm: w.length_mm, height_mm: w.height_mm,
    openings: [], sides: w.sides, steps: [], prestress: { ...w.prestress },
    load: { qk_area: 1.00, gammaQ: 1.50 },
    material: w.verification && w.verification.material };
  const soll = (w.prestress && w.prestress.force_kN
    ? ENG.nachweisPruefen(vorg) : ENG.autoAuslegung(vorg)).wandelement;
  return JSON.stringify(w.bom) === JSON.stringify(soll.bom)
    && JSON.stringify(w.courses) === JSON.stringify(soll.courses)
    && JSON.stringify(w.tension_columns) === JSON.stringify(soll.tension_columns)
    // … und die Mengen gehoeren wirklich zur neuen Laenge:
    && w.courses.every(c => Math.max(0, ...c.stones.map(s => s.x1)) <= 7 * CON.GRID_MM)
    && w.bom.i3 + w.bom.i2 < 10 * 13; })());

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
  store.holeElement(el3.id).wandelement.length_mm === 7 * CON.GRID_MM);
$('gp-drehen').dispatch('click');
await warte();
ok('zweimal drehen kehrt zur Ausgangsrichtung zurueck', lage3().richtung === 'x');
// #84: zweimal 90° ist GEOMETRISCH bit-genau die Ausgangslage — die gerichtete
// Orientierung ist dabei aber (physikalisch korrekt) um 180° gewendet.
const vorD = JSON.parse(vorDrehung);
ok('… und liefert wieder genau die Ausgangs-GEOMETRIE (kein Drift)',
  lage3().start_mm.x === vorD.start_mm.x && lage3().start_mm.y === vorD.start_mm.y
  && lage3().richtung === vorD.richtung && lage3().laenge_grid === vorD.laenge_grid);
ok('#84 zweimal 90° wendet die Orientierung — die physische Vorderseite folgt der Wand',
  lage3().orientierung === CON.wendeOrientierung(vorD.orientierung));

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
// #56: … und fuehrt das Wandelement mit. Es gibt keine Abweichung mehr zu melden.
ok('#56 das Laengenmass rechnet auch das Wandelement mit der neuen Laenge neu',
  store.holeElement(idA).wandelement.length_mm === 1000
  && store.holeElement(idA).wandelement.N_grid === 8
  && !/Längenabweichung/.test($('gp-status').innerHTML));
ok('#56 Mass, Lage und Wandelement nennen dieselbe Laenge',
  GP.bemassungen().find(b => b.mass_mm === 1000).mass_mm
    === lageVon(idA).laenge_grid * CON.GRID_MM
  && lageVon(idA).laenge_grid * CON.GRID_MM === store.holeElement(idA).wandelement.length_mm);
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
  // Ein Ursprungsmass treibt die POSITION, nie die Laenge — das Wandelement steht
  // unveraendert auf dem Stand, den ihm das Laengenmass aus Abschnitt 13 gab (#56).
  store.holeElement(idA).wandelement.length_mm === 1000
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
    store.holeElement(idA).wandelement.length_mm === 1000);
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

// ==========================================================================
//  Issue #56 — die Laenge lebt im Editor: Lage UND Wandelement in einem Vorgang
// ==========================================================================
// Gefahren wird ausschliesslich ueber die echten Handler (zeichnen, Endgriff ziehen,
// Laengenmass inline setzen, Rueckgaengig/Wiederholen). Nach JEDEM Schritt muessen
// Mass, Lage und Wandelementlaenge dieselbe Zahl nennen, die laengenabhaengige
// Ableitung frisch dazu passen und KEINE Abweichung gemeldet sein.
{
  const prj56 = store.fuegeProjektHinzu('#56-Pruefprojekt', { geschoss: 'EG', hoehe_mm: 2600 });
  const gs56 = MAPPE.alleGeschosse(prj56)[0].geschoss.id;
  store.setzeAktivesGeschoss(gs56);
  await warte();
  GP.werkzeug('auswahl'); GP.zeigeAlles();

  /** Laenge aus allen drei Quellen — sie MUESSEN uebereinstimmen (Nicht-Ziel 1). */
  const dreiklang = (id) => {
    const l = MAPPE.findeWand(store.holeMappe(), id).wand.lage;
    const w = store.holeElement(id).wandelement;
    return { lage: l.laenge_grid * CON.GRID_MM, element: w.length_mm, grid: l.laenge_grid };
  };
  const einig = (id, mm) => { const d = dreiklang(id);
    return d.lage === mm && d.element === mm; };
  /** Die laengenabhaengige Ableitung frisch nachrechnen — bitgleich? */
  const ableitungPasst = (id) => {
    const w = store.holeElement(id).wandelement;
    const vorg = { name: w.name, length_mm: w.length_mm, height_mm: w.height_mm,
      openings: (w.openings || []).map(o => new Opening(o.g0, o.g1, o.l0, o.l1, o.art)),
      sides: w.sides, steps: (w.steps || []).map(s => ({ ...s })),
      prestress: { ...w.prestress }, load: { qk_area: 1.00, gammaQ: 1.50 },
      material: w.verification && w.verification.material };
    const soll = (w.prestress && w.prestress.force_kN
      ? ENG.nachweisPruefen(vorg) : ENG.autoAuslegung(vorg)).wandelement;
    return w.N_grid === w.length_mm / CON.GRID_MM
      && JSON.stringify(w.bom) === JSON.stringify(soll.bom)
      && JSON.stringify(w.courses) === JSON.stringify(soll.courses)
      && JSON.stringify(w.tension_columns) === JSON.stringify(soll.tension_columns);
  };
  const keineAbweichung = () => !/Längenabweichung/.test($('gp-status').innerHTML)
    && !/Abweichung/.test($('gp-msg').textContent);

  // (a) Muss 2 — Zeichnen legt Lage UND Wandelement mit derselben Rasterlaenge an.
  GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 1000 }, { x: 2000, y: 1000 });
  await warte();
  const id56 = MAPPE.alleGeschosse(store.holeMappe())
    .find(x => x.geschoss.id === gs56).geschoss.waende[0].id;
  ok('#56 (Muss 2) das Zeichnen speichert Lage und Wandelement mit derselben Rasterlaenge',
    einig(id56, 2000) && dreiklang(id56).grid === 16 && ableitungPasst(id56) && keineAbweichung());
  const hoehe56 = store.holeElement(id56).wandelement.height_mm;
  const typ56 = store.holeElement(id56).wandelement.wandtyp;
  const rollen56 = JSON.stringify(store.holeProdukte(1, id56).rollen);
  // [A-6]/#71: Die Wand wird ABGEDICHTET — genau so, wie Modul 1 es an dieses Wandelement
  // geschrieben haette. Der Geschosseditor waehlt das Merkmal nicht, muss es beim Neurechnen
  // der Laenge aber unveraendert mitfuehren; ginge es verloren, verloere die Wand
  // stillschweigend ihre Dichtstreifen.
  {
    const elAb = store.holeElement(id56);
    store.speichere(elAb.name, Object.assign(elAb.wandelement, { abdichtung: 'abgedichtet' }), id56);
  }

  // (b) Muss 3 — Endgriff: ein Bedienvorgang, beide Staende wandern mit.
  GP.werkzeug('auswahl');
  GP.tippe(mitteVon(id56));
  const griff = GP.griffe().find(g => g.ende === 'max');
  GP.ziehe(griff, { x: griff.x - 1000, y: griff.y });
  await warte();
  ok('#56 (Muss 3) der Endgriff rechnet das Wandelement mit der neuen Laenge neu',
    einig(id56, 1000) && ableitungPasst(id56) && keineAbweichung());
  ok('#56 (Muss 5) Hoehe, Wandtyp und Produktrollen ueberstehen die Neurechnung',
    store.holeElement(id56).wandelement.height_mm === hoehe56
    && store.holeElement(id56).wandelement.wandtyp === typ56
    && JSON.stringify(store.holeProdukte(1, id56).rollen) === rollen56);
  const BOM56 = await import("../../docs/shared/sembla-bom.js");
  ok('[A-6]/#71 die Abdichtung ueberlebt die Laengenaenderung am Endgriff',
    store.holeElement(id56).wandelement.abdichtung === 'abgedichtet'
    && BOM56.semblaBomItems(store.holeElement(id56).wandelement)
         .filter(p => p.key === 'dicht' || p.key === 'dicht_stk').length === 2);

  // (c) Muss 8 — Rueckgaengig/Wiederholen stellen BEIDE Staende her.
  GP.undo(); await warte();
  ok('#56 (Muss 8) Rueckgaengig nimmt Lage UND Wandelement gemeinsam zurueck',
    einig(id56, 2000) && ableitungPasst(id56));
  GP.redo(); await warte();
  ok('#56 (Muss 8) Wiederholen setzt beide Staende wieder nach vorn',
    einig(id56, 1000) && ableitungPasst(id56));

  // (d) Muss 4 — dasselbe ueber ein Laengenmass, inline gesetzt.
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(id56, 'x', 'min'));
  GP.tippe(GP.bezugsPunkt(id56, 'x', 'max'));
  inlineEnter(1500);
  await warte();
  const lm = GP.bemassungen().find(b => b.mass_mm === 1500);
  ok('#56 (Muss 4) das Laengenmass fuehrt Mass, Lage und Wandelement gemeinsam',
    !!lm && einig(id56, 1500) && lm.mass_mm === dreiklang(id56).lage
    && ableitungPasst(id56) && keineAbweichung());
  GP.undo(); await warte();
  ok('#56 (Muss 8) Rueckgaengig nimmt auch Mass, Lage und Wandelement gemeinsam zurueck',
    !GP.bemassungen().some(b => b.id === lm.id) && einig(id56, 1000) && ableitungPasst(id56));
  GP.redo(); await warte();
  ok('#56 (Muss 8) und Wiederholen stellt alle drei wieder her',
    GP.bemassungen().some(b => b.id === lm.id) && einig(id56, 1500) && ableitungPasst(id56));
  ok('[A-6]/#71 die Abdichtung ueberlebt auch Laengenmass, Rueckgaengig und Wiederholen',
    store.holeElement(id56).wandelement.abdichtung === 'abgedichtet');

  // (e) Nicht-Ziel 1 — was ungueltig wuerde, wird benannt ABGEWIESEN. Nichts wird
  //     geklemmt, gefiltert oder ersetzt, und es bleibt nichts halb geschrieben.
  const el56 = store.holeElement(id56);
  const basis = el56.wandelement;
  /** Wandelement mit Zusatzmerkmal hinterlegen — so, wie Modul 1 es geschrieben haette. */
  const setze = (opts) => {
    const w = Object.assign(buildWall(el56.name, basis.length_mm, basis.height_mm,
      opts.openings || [], basis.sides,
      { ...basis.prestress, ...(opts.prestress || {}) }, opts.steps || []),
      { wandtyp: basis.wandtyp });
    store.speichere(el56.name, w, id56);
  };
  /** Verkuerzen ueber den ECHTEN Endgriff — und pruefen, dass NICHTS geschrieben wurde. */
  const verkuerzeAuf = (grid) => {
    const vorMappe = localStorage.getItem('sembla:projekte');
    const vorElement = JSON.stringify(store.holeElement(id56).wandelement);
    GP.werkzeug('auswahl');
    GP.tippe(mitteVon(id56));
    const g = GP.griffe().find(x => x.ende === 'max');
    const r = CON.wandRechteck(MAPPE.findeWand(store.holeMappe(), id56).wand.lage,
      GP.loesen().positionen[id56]);
    GP.ziehe(g, { x: r.x_min + grid * CON.GRID_MM, y: g.y });
    return { unveraendert: localStorage.getItem('sembla:projekte') === vorMappe
      && JSON.stringify(store.holeElement(id56).wandelement) === vorElement,
      meldung: $('gp-msg').textContent };
  };

  // Das Laengenmass aus (d) wuerde den Griff nach [K-11] schon vorher sperren.
  GP.werkzeug('auswahl');
  GP.tippe(GP.bemPunkt(lm.id));
  gp('taste', 'Delete');
  await warte();

  setze({ openings: [new Opening(8, 11, 0, 10, 'tuer')] });
  await warte();
  const abwOeffnung = verkuerzeAuf(6);
  ok('#56 (Nicht-Ziel 1) eine Oeffnung jenseits der neuen Laenge weist die Verkuerzung ab',
    abwOeffnung.unveraendert && /Tür reicht bis Raster 11/.test(abwOeffnung.meldung)
    && /nichts gekürzt oder entfernt/.test(abwOeffnung.meldung));

  setze({ steps: [{ x0_mm: 1000, x1_mm: 1500, height_mm: 1000 }] });
  await warte();
  const abwStufe = verkuerzeAuf(6);
  ok('#56 (Nicht-Ziel 1) eine Staffelstufe jenseits der neuen Laenge wird nicht still geklemmt',
    abwStufe.unveraendert && /Staffelstufe bis 1500 mm/.test(abwStufe.meldung));

  setze({ prestress: { columns_grid: [0, 5, 11] } });
  await warte();
  const abwAchse = verkuerzeAuf(6);
  ok('#56 (Nicht-Ziel 1) eine manuelle Spannachse jenseits der neuen Laenge wird nicht gefiltert',
    abwAchse.unveraendert && /Spannachse in Rasterlage 11/.test(abwAchse.meldung));

  setze({});
  await warte();
  // (e2) Mindestmass: Der Editor bietet gar nicht erst an, was der Kern ablehnt.
  // Der Endgriff klemmt auf 2 Raster — die Vorschau zeigt nie eine 125-mm-Wand.
  const abwKurz = verkuerzeAuf(1);
  ok('#56 der Endgriff kommt nicht unter das Core-Mindestmass von 250 mm',
    !abwKurz.unveraendert && einig(id56, 250) && ableitungPasst(id56));
  // Und wenn ein Mass doch 125 mm verlangt, wird das benannt abgewiesen — ohne
  // Mass, ohne Lage, ohne Wandelement, also ohne jeden Teil-Schreibvorgang.
  {
    const vorMappe = localStorage.getItem('sembla:projekte');
    const vorElement = JSON.stringify(store.holeElement(id56).wandelement);
    GP.werkzeug('bemassen');
    GP.tippe(GP.bezugsPunkt(id56, 'x', 'min'));
    GP.tippe(GP.bezugsPunkt(id56, 'x', 'max'));
    inlineEnter(125);
    await warte();
    ok('#56 (Nicht-Ziel 1) ein Laengenmass unter dem Mindestmass wird benannt abgewiesen',
      /mindestens 250 mm lang \(2 Raster\)/.test($('gp-msg').textContent)
      && localStorage.getItem('sembla:projekte') === vorMappe
      && JSON.stringify(store.holeElement(id56).wandelement) === vorElement);
    gp('inlineTaste', 'Escape');
  }
  // Auch das ZEICHNEN bietet unter dem Mindestmass nichts an — kein Entwurf, keine Wand.
  {
    const vorEl = store.listeElemente().length;
    const vorMappe = localStorage.getItem('sembla:projekte');
    GP.werkzeug('wand');
    while (GP.blick.mm > 5) $('gp-zoom-plus').dispatch('click');
    GP.ziehe({ x: 0, y: 9000 }, { x: 125, y: 9000 });     // genau 1 Raster
    await warte();
    ok('#56 ein Zug ueber genau 1 Raster legt nichts an und wird benannt abgewiesen',
      store.listeElemente().length === vorEl
      && localStorage.getItem('sembla:projekte') === vorMappe
      && /mindestens 250 mm lang \(2 Raster\)/.test($('gp-msg').textContent));
    ok('#56 dazu entsteht nicht einmal ein Entwurf',
      GP.entwurfLage({ x: 0, y: 9000 }, { x: 125, y: 9000 }) === null
      && GP.entwurfLage({ x: 0, y: 9000 }, { x: 250, y: 9000 }).lage.laenge_grid === 2);
    GP.zeigeAlles();
  }

  // (f) Nach allen Abweisungen ist der Stand einig — auf dem Mindestmass, das der
  //     geklemmte Endgriff zuletzt gesetzt hat; die abgewiesenen Schritte haben nichts
  //     hinterlassen.
  ok('#56 nach jeder Abweisung sind Lage und Wandelement weiterhin einig',
    einig(id56, 250) && ableitungPasst(id56));

  // (g) Ein gueltiges Verkuerzen laeuft danach ganz normal durch.
  const abwOk = verkuerzeAuf(4);
  await warte();
  ok('#56 eine zulaessige Verkuerzung wird danach ganz normal ausgefuehrt',
    !abwOk.unveraendert && einig(id56, 500) && ableitungPasst(id56) && keineAbweichung());
}

// ==========================================================================
//  Issue #66 — ein Klick macht die Wand auch KANONISCH aktiv
// ==========================================================================
// Bis #66 fuehrte der Editor zwei Aktivbegriffe: die gruene lokale Auswahl und den
// Zeiger `sembla:aktiv` in storage.js. Geprueft wird deshalb bis zur SICHTBAREN
// Anzeige — die ECHTE Kopfleiste wird gemountet und nach jedem Klick ausgelesen.
// Sie haengt ueber store.abonniere am Zeiger, also an derselben Kette wie im
// Browser; ein nachgebauter Anzeigepfad oder ein blosser Abonnentenzaehler wuerde
// genau den Fehler nicht sehen, um den es geht.
{
  const { mountNavbar } = await import("../../docs/shared/navbar.js");
  mountNavbar(0);                       // erst hier: alle Abschnitte davor laufen unveraendert
  /** Die sichtbare Wand im aktiven Pfad der Kopfleiste (Projekt · Geschoss · Wand). */
  const navWand = () => {
    const m = $('sb-pfad').innerHTML.match(/<span class="k">Wand<\/span> <b>([\s\S]*?)<\/b>/);
    return m ? m[1] : null;
  };
  /** Die sichtbar ausgewaehlte Wand der Kopfleiste (das `selected` der Auswahl). */
  const navGewaehlt = () => {
    const m = $('sb-active').innerHTML.match(/<option value="([^"]+)"[^>]*selected/);
    return m ? m[1] : null;
  };
  /** Lokal aktiv, kanonisch aktiv und sichtbar aktiv MUESSEN dieselbe Wand nennen. */
  const einigAktiv = (id) => GP.zustand.aktiv === id && store.aktivId() === id
    && navGewaehlt() === id && navWand() === store.holeElement(id).name;
  /**
   * Klick auf eine Listenzeile ueber den ECHT registrierten, delegierten Behandler
   * am Panel `gp-liste` — nicht ueber den internen Direktaufruf. Der Zielknoten wird
   * so nachgebildet, wie ihn der Browser liefert: `closest` findet die Zeile mit
   * ihrem `data-wand`, den Knopf `[data-planen]` gibt es beim Zeilenklick nicht.
   */
  const listenKlick = (id, mod) => {
    const zeile = { getAttribute: (n) => (n === 'data-wand' ? id : null) };
    $('gp-liste').dispatch('click',
      { target: { closest: (sel) => (sel === '.gp-zeile' ? zeile : null) }, ...(mod || {}) });
  };

  const prj66 = store.fuegeProjektHinzu('#66-Pruefprojekt', { geschoss: 'EG', hoehe_mm: 2600 });
  const gs66 = MAPPE.alleGeschosse(prj66)[0].geschoss.id;
  store.setzeAktivesGeschoss(gs66);
  await warte();
  GP.zeigeAlles(); GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 1000 }, { x: 2000, y: 1000 }); await warte();
  GP.zeichne({ x: 0, y: 4000 }, { x: 2000, y: 4000 }); await warte();
  const w66 = MAPPE.alleGeschosse(store.holeMappe())
    .find(x => x.geschoss.id === gs66).geschoss.waende;
  const a66 = w66[0].id, b66 = w66[1].id;
  GP.werkzeug('auswahl');
  await warte();

  ok('#66 Pruefaufbau: die echte Kopfleiste haengt am Zeiger und zeigt die zuletzt gezeichnete Wand',
    w66.length === 2 && einigAktiv(b66));

  // (a) Muss 1/4 — Klick auf den WANDKOERPER, ueber dieselben Zeigerbehandler wie die Maus.
  GP.tippe(mitteVon(a66)); await warte();
  ok('#66 (Muss 1) ein Klick auf den Wandkoerper setzt dieselbe Wand lokal UND kanonisch aktiv',
    einigAktiv(a66) && GP.zustand.auswahl.length === 1);
  GP.tippe(mitteVon(b66)); await warte();
  ok('#66 (Muss 4) der naechste Klick zieht die sichtbare Aktivanzeige mit',
    einigAktiv(b66) && GP.svg.includes(CON.FARBEN.aktiv));

  // (b) Muss 2 — Klick in der Wandliste, ueber den registrierten data-wand-Behandler.
  ok('#66 Pruefaufbau: beide Waende stehen mit ihrem data-wand in der Liste',
    liste().includes(`data-wand="${a66}"`) && liste().includes(`data-wand="${b66}"`));
  listenKlick(a66); await warte();
  ok('#66 (Muss 2) ein Klick in der Wandliste setzt lokal und kanonisch dieselbe Wand',
    einigAktiv(a66) && GP.zustand.auswahl.length === 1);

  // (c) Muss 3 — Mehrfachauswahl: aktiv ist genau EINE, und die steht auch oben.
  listenKlick(b66, { shiftKey: true }); await warte();
  ok('#66 (Muss 3) Umschalt-Klick: zwei ausgewaehlt, genau EINE aktiv — und die ist die kanonische',
    GP.zustand.auswahl.length === 2 && einigAktiv(b66));
  GP.tippe(mitteVon(a66), { ctrlKey: true }); await warte();
  ok('#66 (Muss 3) auch der Strg-Klick auf der Zeichenflaeche fuehrt den Zeiger nach',
    GP.zustand.auswahl.length === 2 && einigAktiv(a66));

  // (d) Muss 5 — verwaister Eintrag: lokal waehlbar, Zeiger UND Anzeige unberuehrt ([L-4]).
  store.aendereMappe(m => MAPPE.setzeWand(m, gs66,
    { id: 'wnd-verwaist-66', name: 'Verwaist 66', lage: null }));
  await warte(); GP.render();
  const zeigerVor = store.aktivId();
  const pfadVor = $('sb-pfad').innerHTML, auswahlVor = $('sb-active').innerHTML;
  listenKlick('wnd-verwaist-66'); await warte();
  ok('#66 (Muss 5) ein verwaister Eintrag ist waehlbar, ueberschreibt den Zeiger aber nicht',
    GP.zustand.aktiv === 'wnd-verwaist-66' && store.aktivId() === zeigerVor
    && !store.holeElement('wnd-verwaist-66'));
  ok('#66 (Muss 5) … und die sichtbare Anzeige bleibt unveraendert, ohne erfundenen Eintrag',
    $('sb-pfad').innerHTML === pfadVor && $('sb-active').innerHTML === auswahlVor
    && !$('sb-active').innerHTML.includes('wnd-verwaist-66'));

  // (e) Abwaehlen ist Sache der Zeichenflaeche — es hebt die aktive Wand der Suite nicht auf.
  GP.tippe({ x: 90000, y: 90000 }); await warte();
  ok('#66 ein Klick ins Leere waehlt lokal ab, laesst den kanonischen Zeiger aber stehen',
    GP.zustand.aktiv === null && GP.zustand.auswahl.length === 0
    && store.aktivId() === zeigerVor && $('sb-pfad').innerHTML === pfadVor);

  // (f) Muss 6 — „Planen" laeuft unveraendert ueber denselben Aktivierungsweg.
  globalThis.window.location.href = '';
  ok('#66 (Muss 6) „Planen" setzt die Wand aktiv und navigiert weiterhin nach Modul 1',
    gp('planeWand', b66) === true && store.aktivId() === b66
    && globalThis.window.location.href === 'wandplanung.html');

  // (g) Must-not — die Eltern-Zeiger bleiben, was sie waren ([L-10]).
  ok('#66 kein Wandklick veraendert Projekt-, Gebaeude- oder Geschossaktivierung',
    store.holeMappe().projekt.id === prj66.projekt.id
    && store.aktivesGeschoss().geschoss.id === gs66);
}

// ==========================================================================
//  Issue #59 — Masszahlen ueberdecken einander nicht (kollisionsfreie Anordnung)
// ==========================================================================
// Angelegt wird ueber das ECHTE Masswerkzeug; kollidieren laesst sie der ganz
// normale Zug an der Masszahl (`linie_mm`). Die Zahlen muessen getrennt lesbar
// bleiben und an ihrer TATSAECHLICH dargestellten Stelle treff-, zieh- und
// inline-bearbeitbar sein. Gespeichert wird KEIN Ausweichversatz — nur der Zug.
{
  store.setzeAktivesProjekt(prj2.projekt.id);
  store.setzeAktivesGeschoss(gs2);
  await warte();
  GP.werkzeug('auswahl');
  GP.zeigeAlles();

  const r2v = (v) => Math.round(Number(v) * 100) / 100;
  const disjunkt = (a, b) => a.x_min >= b.x_max || b.x_min >= a.x_max
    || a.y_min >= b.y_max || b.y_min >= a.y_max;
  const getrennt = (fl) => fl.every((a, i) => fl.slice(i + 1).every((b) => disjunkt(a, b)));
  const flaechen = (lay) => lay.filter(Boolean).map((g) => MB.massTextFlaeche(g));

  // (a) Eine weitere nahe Bemassung ueber den realen Editorpfad anlegen.
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA, 'y', 'max'));
  GP.tippe(GP.bezugsPunkt(idB, 'y', 'max'));
  inlineEnter(2500);
  await warte();
  GP.werkzeug('auswahl');
  const mNeu = GP.bemassungen()[GP.bemassungen().length - 1];
  const layVor = GP.bemLayout();
  ok('#59 nach dem Anlegen ueber das echte Werkzeug sind ALLE Masszahlen getrennt lesbar',
    GP.bemassungen().length >= 2 && getrennt(flaechen(layVor)));

  // (b) Der normale Zug an der Zahl legt die neue Masslinie AUF die von bmY —
  //     ohne Anordnung staenden beide Zahlen deckungsgleich uebereinander.
  const iNeu = GP.bemassungen().findIndex(b => b.id === mNeu.id);
  const iZiel = GP.bemassungen().findIndex(b => b.id === bmY.id);
  const delta = layVor[iZiel].q - layVor[iNeu].q;
  const vorPos59 = posVon();
  const p0 = gp('bemTextPunkt', mNeu.id);
  GP.ziehe(p0, { x: p0.x + delta, y: p0.y });
  await warte();

  const lay = GP.bemLayout();
  ok('#59 der Zug legt die Masslinien wirklich uebereinander — die Kollision ist echt',
    Math.abs(bm51(mNeu.id).linie_mm - delta) < 1 && lay[iNeu].q === lay[iZiel].q);
  ok('#59 die Zahlen bleiben trotzdem getrennt — automatisch und deterministisch',
    getrennt(flaechen(lay)) && lay[iNeu].versatz.x >= MB.MASS_TEXT_MM.hoehe
    && lay[iZiel].versatz.x === 0);
  ok('#59 die Masslinie folgt NUR dem Zug, nicht dem Ausweichversatz der Zahl',
    lay[iNeu].q === layVor[iNeu].q + delta
    && lay.every((g, i) => !g || g.q === (i === iNeu ? layVor[i].q + delta : layVor[i].q)));
  ok('#59 die dargestellten Textknoten stehen an verschiedenen Stellen',
    textVon(mNeu.id) !== '' && textVon(mNeu.id) !== textVon(bmY.id));
  const anker59 = MB.massAnker(lay[iNeu], 0).anker;
  ok('#59 gezeichnet wird exakt die angeordnete Lage — Zeichnen und Ableitung sind dieselbe Quelle',
    textVon(mNeu.id) === `${r2v(anker59.x)}/${r2v(anker59.y - 5 * GP.blick.mm)}`);

  // (c) Treffen, Ziehen und Inline-Bearbeiten an der TATSAECHLICHEN Textlage.
  const pT = gp('bemTextPunkt', mNeu.id);
  ok('#59 die ausgewichene Zahl ist an ihrer dargestellten Stelle treffbar',
    GP.bemTextTreffer(pT) === mNeu.id);
  const vorL59 = bm51(mNeu.id).linie_mm;
  GP.ziehe(pT, { x: pT.x + 125, y: pT.y });
  await warte();
  ok('#59 der naechste Zug startet an der dargestellten Zahl und wirkt normal weiter',
    Math.abs(bm51(mNeu.id).linie_mm - (vorL59 + 125)) < 1);
  const pT2 = gp('bemTextPunkt', mNeu.id);
  doppel(pT2);
  ok('#59 der Doppelklick auf die ausgewichene Zahl oeffnet die Inline-Eingabe',
    GP.inlineStand.offen && GP.inlineStand.id === mNeu.id && GP.inlineStand.wert === '2500');
  gp('inlineTaste', 'Escape');

  // (d) Reine Darstellung: nichts Gespeichertes ausser dem Zug, nichts Geloestes anders.
  const gespeichert59 = MAPPE.bemassungen(store.holeMappe(), gs2).find(b => b.id === mNeu.id);
  ok('#59 der Ausweichversatz wird NIE gespeichert — in der Mappe steht nur der Zug (`linie_mm`)',
    gespeichert59.text_mm == null && typeof gespeichert59.linie_mm === 'number'
    && gespeichert59.mass_mm === 2500);
  ok('#59 Masswert, Bezuege und Loeserergebnis bleiben unveraendert (reine Darstellung)',
    posVon() === vorPos59 && bm51(mNeu.id).mass_mm === 2500);
}

// --- #74: Wand duplizieren und loeschen — die echten Editoraktionen ---------
{
  // Kontrollierter Stand: eigenes Projekt/Geschoss, drei gezeichnete Waende,
  // zwei Masse (A–B und B–C) — B–C muss das Loeschen von A ueberleben.
  const mappe74 = store.fuegeProjektHinzu('Projekt 74', { geschoss: 'EG74', hoehe_mm: 2600 });
  const gs74 = MAPPE.alleGeschosse(mappe74)[0].geschoss.id;
  store.setzeAktivesGeschoss(gs74);
  await warte();
  $('gp-fang').checked = true; $('gp-fang').dispatch('change');
  GP.zeigeAlles();

  const neueste = () => store.listeElemente()[0];
  GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 0 }, { x: 3040, y: 60 });      const idA74 = neueste().id;
  GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 2000 }, { x: 2040, y: 2060 }); const idB74 = neueste().id;
  GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 4000 }, { x: 2040, y: 4060 }); const idC74 = neueste().id;
  await warte();
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA74, 'y', 'mitte'));
  GP.tippe(GP.bezugsPunkt(idB74, 'y', 'mitte'));
  inlineEnter(2000);
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idB74, 'y', 'mitte'));
  GP.tippe(GP.bezugsPunkt(idC74, 'y', 'mitte'));
  inlineEnter(2000);
  await warte();
  const anMass = (id) => GP.bemassungen().filter(b =>
    (b.von && b.von.wand === id) || (b.bis && b.bis.wand === id)).map(b => b.id);
  const bmAB = GP.bemassungen().find(b => anMass(idA74).includes(b.id));
  const bmBC = GP.bemassungen().find(b => !anMass(idA74).includes(b.id));
  ok('#74 Vorbereitung: drei verortete Waende, Mass an A–B und Mass an B–C',
    !!bmAB && !!bmBC && GP.bemassungen().length === 2
    && MAPPE.findeWand(store.holeMappe(), idA74).wand.lage !== null);

  // (a) Duplizieren: tiefe, unabhaengige Kopie — ausgewaehlt und aktiv, ein Schritt.
  GP.werkzeug('auswahl');
  GP.tippe({ x: 1500, y: 62.5 });                       // Wand A aktiv
  store.mergeEingaben('statik', { merkmal: 'original' }, idA74);
  const nameA74 = store.holeElement(idA74).name;
  const elVor74 = JSON.stringify(store.holeElement(idA74));
  const bemVor74 = JSON.stringify(GP.bemassungen());
  const idsVor74 = new Set(store.listeElemente().map(e => e.id));
  const undoDupl = GP.undoStand.undo;
  $('gp-dupl').dispatch('click');
  await warte();
  const kopie74 = store.listeElemente().find(e => !idsVor74.has(e.id)) || null;
  const kopieEintrag = kopie74 ? MAPPE.findeWand(store.holeMappe(), kopie74.id) : null;
  ok('#74 Duplizieren legt GENAU EINE Kopie mit neuer id und unterscheidbarem Namen an',
    !!kopie74 && kopie74.id !== idA74 && kopie74.name === `${nameA74} (Kopie)`
    && store.listeElemente().length === idsVor74.size + 1);
  ok('#74 die Kopie traegt Wandelement UND Eingaben der Ausgangswand',
    !!kopie74 && JSON.stringify(kopie74.wandelement) === JSON.stringify(store.holeElement(idA74).wandelement)
    && kopie74.eingaben?.statik?.merkmal === 'original');
  ok('#74 die Kopie steht im aktiven Geschoss mit lage null — ohne kopierte Masse',
    !!kopieEintrag && kopieEintrag.geschoss.id === gs74 && kopieEintrag.wand.lage === null
    && anMass(kopie74.id).length === 0 && JSON.stringify(GP.bemassungen()) === bemVor74);
  ok('#74 die Kopie ist danach ausgewaehlt, aktiv und kanonisch aktiv gesetzt',
    GP.zustand.aktiv === kopie74.id && GP.zustand.auswahl.includes(kopie74.id)
    && store.aktivId() === kopie74.id);
  ok('#74 die Ausgangswand bleibt bit-genau stehen (Wandspeicher, Lage, Masse)',
    JSON.stringify(store.holeElement(idA74)) === elVor74
    && MAPPE.findeWand(store.holeMappe(), idA74).wand.lage.laenge_grid === 24);
  ok('#74 Duplizieren ist GENAU EIN Undo-Schritt', GP.undoStand.undo === undoDupl + 1);

  // Unabhaengige Bearbeitung: die Kopie aendern laesst die Quelle unberuehrt.
  store.mergeEingaben('statik', { merkmal: 'kopie' }, kopie74.id);
  store.speichere(kopie74.name, buildWall(kopie74.name, 2000, 2600, []), kopie74.id);
  ok('#74 die Kopie ist unabhaengig bearbeitbar — die Quelle bleibt unveraendert',
    store.holeElement(kopie74.id).wandelement.length_mm === 2000
    && store.holeElement(idA74).wandelement.length_mm === 3000
    && store.holeElement(idA74).eingaben.statik.merkmal === 'original');

  // Undo/Redo des Duplizierens: Wandspeicher, Mappe und Aktiv-Zeiger vollstaendig.
  GP.undo();
  await warte();
  ok('#74 Undo nimmt die Kopie vollstaendig zurueck und stellt den Aktiv-Zeiger wieder her',
    store.holeElement(kopie74.id) === null && !MAPPE.findeWand(store.holeMappe(), kopie74.id)
    && store.aktivId() === idA74 && GP.undoStand.undo === undoDupl && GP.undoStand.redo === 1);
  GP.redo();
  await warte();
  ok('#74 Redo legt die Kopie unter DERSELBEN id wieder an — Eintrag mit lage null, Zeiger auf der Kopie',
    store.holeElement(kopie74.id) !== null
    && MAPPE.findeWand(store.holeMappe(), kopie74.id).wand.lage === null
    && store.aktivId() === kopie74.id && GP.undoStand.undo === undoDupl + 1);

  // (b) Loeschen: erst die abgebrochene Bestaetigung — nichts aendert sich.
  GP.werkzeug('auswahl');
  GP.tippe({ x: 1500, y: 62.5 });                       // Wand A aktiv
  confirmAntwort = false;
  const standVor74 = { el: localStorage.getItem('sembla:elemente'),
    mappe: localStorage.getItem('sembla:projekte'),
    undo: GP.undoStand.undo, redo: GP.undoStand.redo, aktiv: store.aktivId() };
  $('gp-wand-loeschen').dispatch('click');
  await warte();
  ok('#74 ein abgebrochener Loeschdialog aendert weder Daten noch Undo/Redo noch Zeiger',
    localStorage.getItem('sembla:elemente') === standVor74.el
    && localStorage.getItem('sembla:projekte') === standVor74.mappe
    && GP.undoStand.undo === standVor74.undo && GP.undoStand.redo === standVor74.redo
    && store.aktivId() === standVor74.aktiv && GP.zustand.aktiv === idA74
    && /abgebrochen/.test($('gp-msg').textContent));

  // (c) Bestaetigtes Loeschen: gezielte Bereinigung, ein Schritt, alles benannt.
  confirmAntwort = true;
  const undoDel = GP.undoStand.undo;
  const elA74 = JSON.parse(elVor74);
  $('gp-wand-loeschen').dispatch('click');
  await warte();
  ok('#74 Loeschen entfernt GENAU Wand A aus Wandspeicher und Projektmappe',
    store.holeElement(idA74) === null && !MAPPE.findeWand(store.holeMappe(), idA74)
    && store.holeElement(idB74) !== null && store.holeElement(idC74) !== null
    && !!MAPPE.findeWand(store.holeMappe(), idB74) && !!MAPPE.findeWand(store.holeMappe(), idC74)
    && store.holeElement(kopie74.id) !== null);
  ok('#74 GENAU das anhaengende Mass A–B geht mit; das fremde Mass B–C bleibt',
    GP.bemassungen().map(b => b.id).join(',') === bmBC.id
    && !GP.bemassungen().some(b => b.id === bmAB.id));
  ok('#74 der zeigende Aktiv-Zeiger ist bereinigt, die Wand verschwindet aus Auswahl und SVG',
    store.aktivId() === null && GP.zustand.aktiv === null
    && !GP.zustand.auswahl.includes(idA74) && !GP.svg.includes(`data-wand="${idA74}"`));
  ok('#74 die Meldung benennt das entfernte Mass statt still zu bereinigen ([L-4])',
    new RegExp(bmAB.id).test($('gp-msg').textContent));
  ok('#74 Loeschen ist GENAU EIN Undo-Schritt', GP.undoStand.undo === undoDel + 1);

  // Undo/Redo des Loeschens: Wandspeicher, Mappe, Masse und Zeiger vollstaendig.
  GP.undo();
  await warte();
  const wiederA = store.holeElement(idA74);
  ok('#74 Undo stellt Wand A unter alter id wieder her — Wandelement und Eingaben inhaltsgleich',
    !!wiederA && JSON.stringify(wiederA.wandelement) === JSON.stringify(elA74.wandelement)
    && wiederA.eingaben?.statik?.merkmal === 'original');
  ok('#74 Undo bringt Geschosseintrag samt Lage UND das entfernte Mass zurueck; Zeiger wieder auf A',
    MAPPE.findeWand(store.holeMappe(), idA74).wand.lage.laenge_grid === 24
    && GP.bemassungen().some(b => b.id === bmAB.id) && GP.bemassungen().length === 2
    && store.aktivId() === idA74 && GP.undoStand.undo === undoDel && GP.undoStand.redo === 1);
  GP.redo();
  await warte();
  ok('#74 Redo loescht erneut vollstaendig — Element, Eintrag, Mass A–B und Zeiger; B–C bleibt',
    store.holeElement(idA74) === null && !MAPPE.findeWand(store.holeMappe(), idA74)
    && GP.bemassungen().map(b => b.id).join(',') === bmBC.id
    && store.aktivId() === null && GP.undoStand.undo === undoDel + 1);
}

// --- #75: Mehrere Waende gemeinsam bearbeiten — der Sammel-Editor -----------
{
  // Kontrollierter Stand: eigenes Projekt/Geschoss, VIER real gezeichnete Waende
  // mit gemischten Hoehen und Wandtypen; ein Mass A–B und eine Oeffnung in A.
  const mappe75 = store.fuegeProjektHinzu('Projekt 75', { geschoss: 'EG75', hoehe_mm: 2600 });
  const gs75 = MAPPE.alleGeschosse(mappe75)[0].geschoss.id;
  store.setzeAktivesGeschoss(gs75);
  await warte();
  $('gp-fang').checked = true; $('gp-fang').dispatch('change');
  GP.zeigeAlles();

  const neueste = () => store.listeElemente()[0];
  GP.werkzeug('wand');
  $('gp-hoehe').value = '2600'; $('gp-wandtyp').value = 'mit_wind';
  GP.zeichne({ x: 0, y: 0 }, { x: 3040, y: 60 });        const idA = neueste().id;
  GP.werkzeug('wand');
  $('gp-hoehe').value = '2400'; $('gp-wandtyp').value = 'ohne_wind';
  GP.zeichne({ x: 0, y: 2000 }, { x: 2040, y: 2060 });   const idB = neueste().id;
  GP.werkzeug('wand');
  $('gp-hoehe').value = '2600'; $('gp-wandtyp').value = 'mit_wind';
  GP.zeichne({ x: 0, y: 4000 }, { x: 2540, y: 4060 });   const idC = neueste().id;
  GP.werkzeug('wand');
  GP.zeichne({ x: 0, y: 6000 }, { x: 1540, y: 6060 });   const idD = neueste().id;
  await warte();
  // Wand A bekommt eine echte Tuer — die Oeffnung muss jede Sammelaenderung
  // unveraendert ueberleben, und eine zu kleine Hoehe muss an ihr scheitern.
  const wandA = buildWall(store.holeElement(idA).name, 3000, 2600,
    [new Opening(2, 8, 0, 10, 'tuer')]);
  wandA.wandtyp = 'mit_wind';
  store.speichere(store.holeElement(idA).name, wandA, idA);
  GP.werkzeug('bemassen');
  GP.tippe(GP.bezugsPunkt(idA, 'y', 'mitte'));
  GP.tippe(GP.bezugsPunkt(idB, 'y', 'mitte'));
  inlineEnter(2000);
  await warte();
  const ids75 = [idA, idB, idC];

  // (a) Verfuegbarkeit und Anzeige: erst ab ZWEI ausgewaehlten Waenden, gemischte
  // Ausgangswerte ausdruecklich als gemischt — nie als konkreter Wert.
  GP.werkzeug('auswahl');
  GP.tippe({ x: 1500, y: 62.5 });                        // A aktiv (einzeln)
  ok('#75 bei EINER ausgewaehlten Wand gibt es keinen Sammel-Editor',
    GP.zustand.auswahl.length === 1 && $('gp-sammel').hidden === true);
  GP.tippe({ x: 1000, y: 2062.5 }, { shiftKey: true });  // B dazu — echter Umschalt-Pfad
  GP.tippe({ x: 1000, y: 4062.5 }, { ctrlKey: true });   // C dazu — echter Strg-Pfad
  ok('#75 drei Waende ueber Umschalt/Strg ausgewaehlt — der Sammel-Editor erscheint',
    GP.zustand.auswahl.length === 3 && ids75.every(id => GP.zustand.auswahl.includes(id))
    && $('gp-sammel').hidden === false);
  ok('#75 der Sammel-Editor nennt die Anzahl und beide gemischten Ausgangswerte',
    /<b>3<\/b>/.test($('gp-sammel-info').innerHTML)
    && /gemischt/.test($('gp-sammel-ist').innerHTML)
    && /2400/.test($('gp-sammel-ist').innerHTML) && /2600/.test($('gp-sammel-ist').innerHTML)
    && /mit Wind/.test($('gp-sammel-ist').innerHTML) && /ohne Wind/.test($('gp-sammel-ist').innerHTML));
  ok('#75 gemischte Ausgangswerte werden NIE als konkreter Wert vorbelegt',
    $('gp-sammel-hoehe').value === '' && $('gp-sammel-wandtyp').value === '');

  // (b) Vorschau und Bestaetigung: Anzahl + GENAU die gewaehlten Parameter;
  // der Abbruch aendert weder Speicher noch Undo/Redo.
  $('gp-sammel-hoehe-an').checked = true; $('gp-sammel-hoehe-an').dispatch('change');
  $('gp-sammel-hoehe').value = '2800';
  $('gp-sammel-wandtyp-an').checked = true; $('gp-sammel-wandtyp-an').dispatch('change');
  $('gp-sammel-wandtyp').value = 'ohne_wind';
  ok('#75 die Haekchen schalten ihre Eingabefelder frei',
    $('gp-sammel-hoehe').disabled === false && $('gp-sammel-wandtyp').disabled === false);
  const confirmEcht75 = globalThis.confirm;
  let confirmText75 = null;
  globalThis.confirm = (t) => { confirmText75 = String(t); return false; };
  const standVor75 = { el: localStorage.getItem('sembla:elemente'),
    mappe: localStorage.getItem('sembla:projekte'),
    undo: GP.undoStand.undo, redo: GP.undoStand.redo };
  $('gp-sammel-go').dispatch('click');
  ok('#75 die Bestaetigung nennt Anzahl und GENAU die zu aendernden Parameter',
    /^3 /.test(confirmText75) && /2800 mm/.test(confirmText75)
    && /Windsituation/.test(confirmText75) && /ohne Wind/.test(confirmText75));
  ok('#75 Abbruch vor der Bestaetigung aendert weder Wandspeicher noch Mappe noch Undo/Redo',
    localStorage.getItem('sembla:elemente') === standVor75.el
    && localStorage.getItem('sembla:projekte') === standVor75.mappe
    && GP.undoStand.undo === standVor75.undo && GP.undoStand.redo === standVor75.redo
    && /abgebrochen/.test($('gp-msg').textContent));

  // (c) Eine benannte Vorpruefung: die Tuer in A reicht bis Lage 10 (2000 mm) —
  // eine gemeinsame Hoehe von 1800 mm wird abgewiesen, ohne irgendetwas zu schreiben.
  globalThis.confirm = () => true;
  $('gp-sammel-hoehe').value = '1800';
  $('gp-sammel-go').dispatch('click');
  ok('#75 eine Hoehe unter einer Oeffnung wird benannt abgewiesen — nichts geschrieben',
    localStorage.getItem('sembla:elemente') === standVor75.el
    && GP.undoStand.undo === standVor75.undo
    && /Lage 10/.test($('gp-msg').textContent) && /Modul 1/.test($('gp-msg').textContent));

  // (d) Bestaetigte Uebernahme: Neuberechnung + Persistenz fuer ALLE drei Waende;
  // Laengen, Lagen, Oeffnungen, Masse und die NICHT ausgewaehlte Wand D unveraendert.
  $('gp-sammel-hoehe').value = '2800';
  const laengenVor75 = ids75.map(id => store.holeElement(id).wandelement.length_mm);
  const lagenVor75 = JSON.stringify(ids75.map(id => MAPPE.findeWand(store.holeMappe(), id).wand.lage));
  const oeffnungenVor75 = JSON.stringify(store.holeElement(idA).wandelement.openings);
  const masseVor75 = JSON.stringify(GP.bemassungen());
  const wandDVor75 = JSON.stringify(store.holeElement(idD).wandelement);
  const undoVor75 = GP.undoStand.undo;
  $('gp-sammel-go').dispatch('click');
  await warte();
  ok('#75 alle DREI Waende tragen die gemeinsame Hoehe und Windsituation persistent',
    ids75.every(id => { const el = store.holeElement(id);
      return el.wandelement.height_mm === 2800
        && store.normWandtyp(el.wandelement.wandtyp) === 'ohne_wind'; }));
  ok('#75 jede Wand wurde ueber den Engine-Pfad NEU gerechnet (Lagenzahl und Steinlagen folgen der Hoehe)',
    ids75.every(id => { const el = store.holeElement(id);
      return el.wandelement.lagen === 14 && el.wandelement.courses.length === 14; }));
  ok('#75 Laengen, Lagen, Oeffnungen und Bemassungen bleiben unveraendert',
    ids75.every((id, i) => store.holeElement(id).wandelement.length_mm === laengenVor75[i])
    && JSON.stringify(ids75.map(id => MAPPE.findeWand(store.holeMappe(), id).wand.lage)) === lagenVor75
    && JSON.stringify(store.holeElement(idA).wandelement.openings) === oeffnungenVor75
    && JSON.stringify(GP.bemassungen()) === masseVor75);
  ok('#75 die NICHT ausgewaehlte Wand D bleibt bit-genau stehen',
    JSON.stringify(store.holeElement(idD).wandelement) === wandDVor75);
  ok('#75 die Sammelaenderung ist GENAU EIN Undo-Schritt', GP.undoStand.undo === undoVor75 + 1);

  // (e) Undo/Redo: der eine Schritt traegt ALLE drei Wandspeicher-Eintraege.
  GP.undo();
  await warte();
  ok('#75 Undo stellt alle drei Waende auf Hoehe UND Windsituation davor zurueck',
    store.holeElement(idA).wandelement.height_mm === 2600
    && store.holeElement(idB).wandelement.height_mm === 2400
    && store.holeElement(idC).wandelement.height_mm === 2600
    && store.normWandtyp(store.holeElement(idA).wandelement.wandtyp) === 'mit_wind'
    && store.normWandtyp(store.holeElement(idB).wandelement.wandtyp) === 'ohne_wind'
    && store.normWandtyp(store.holeElement(idC).wandelement.wandtyp) === 'mit_wind'
    && GP.undoStand.undo === undoVor75 && GP.undoStand.redo === 1);
  GP.redo();
  await warte();
  ok('#75 Redo setzt die Sammelaenderung vollstaendig wieder ein',
    ids75.every(id => { const el = store.holeElement(id);
      return el.wandelement.height_mm === 2800
        && store.normWandtyp(el.wandelement.wandtyp) === 'ohne_wind'; })
    && GP.undoStand.undo === undoVor75 + 1);

  // (f) Simulierter Speicherfehler bei der ZWEITEN Wand: vollstaendiger Rollback,
  // kein gemischter Bestand, kein Undo-Schritt, der Fehler wird benannt.
  $('gp-sammel-hoehe').value = '2600';
  $('gp-sammel-wandtyp').value = 'mit_wind';
  const vorRollback75 = ids75.map(id => JSON.stringify({
    w: store.holeElement(id).wandelement, e: store.holeElement(id).eingaben }));
  const undoVorRb75 = GP.undoStand.undo;
  const setItemEcht75 = localStorage.setItem.bind(localStorage);
  let zuender75 = 2;
  localStorage.setItem = (k, v) => {
    if (k === 'sembla:elemente') {
      zuender75 -= 1;
      if (zuender75 === 0) {
        localStorage.setItem = setItemEcht75;                 // der Rollback selbst darf schreiben
        throw new Error('Kein Speicherplatz (Testfehler)');
      }
    }
    setItemEcht75(k, v);
  };
  $('gp-sammel-go').dispatch('click');
  await warte();
  localStorage.setItem = setItemEcht75;
  ok('#75 bei einem Teilfehler wird vollstaendig zurueckgerollt — kein gemischter Bestand',
    ids75.every((id, i) => JSON.stringify({
      w: store.holeElement(id).wandelement, e: store.holeElement(id).eingaben }) === vorRollback75[i]));
  ok('#75 der Teilfehler wird benannt und bucht KEINEN Undo-Schritt',
    GP.undoStand.undo === undoVorRb75 && /Testfehler/.test($('gp-msg').textContent)
    && /nicht m/.test($('gp-msg').textContent));
  globalThis.confirm = confirmEcht75;
}

// --- #43: Realer Pfad — der Reiter 0,5 fuehrt zum Geschossplaner des AKTIVEN Geschosses
{
  const zeiger43 = () =>
    [store.aktivesProjektId(), store.aktivesGeschossId(), store.aktivId()].join('|');
  const vorher43 = zeiger43();
  mountNavbar(0.5);                        // die Kopfleiste, wie sie jedes Modul zeigt
  const treffer43 =
    /<a class="sb-tab active" href="([^"]+)"[^>]*><span class="n">0,5<\/span>/.exec(nav43.innerHTML);
  ok('#43 der hervorgehobene Reiter 0,5 zielt direkt auf geschossplan.html',
    !!treffer43 && treffer43[1] === 'geschossplan.html');

  // Das Ausloesen des href laedt genau diese Seite — im Test: die ECHTE Seitenlogik
  // wird erneut initialisiert, wie beim Sprung ueber den Reiter im Browser.
  const waende43 = (h) => (h.match(/data-wand="[^"]+"/g) || []).sort().join();
  const listeVorher43 = waende43($('gp-liste').innerHTML);
  globalThis.window.__gpInit();
  await warte();
  ok('#43 nach dem Sprung zeigt der Editor DASSELBE aktive Geschoss (gleiche Waende, gezeichnete Buehne)',
    listeVorher43 !== '' && waende43($('gp-liste').innerHTML) === listeVorher43
    && /<svg/.test(globalThis.window.__gp.svg));
  ok('#43 der Sprung setzt KEINEN aktiven Zeiger um (Projekt, Geschoss, Wand)',
    zeiger43() === vorher43);
}

// --- #84: Gerichtete Orientierung — Zeichenrichtung, V/R-Kanten, 90°/180° --
// Realer Pfad: echte Zeigergesten in entgegengesetzten Richtungen, Pruefung von
// Projektmappe und Editor-SVG, Wenden ueber den echten Knopf, und derselbe Stand
// geht anschliessend in die ECHTE Lageplan-Ableitung (SVG und Export-Bytes).
{
  const LP84 = await import("../../docs/shared/sembla-lageplan.js");
  const gs84 = store.aktivesGeschossId();
  $('gp-fang').checked = true; $('gp-fang').dispatch('change');
  const wandVon = (id) => MAPPE.findeWand(store.holeMappe(), id).wand;
  // Die frisch gezeichnete Wand ist die AKTIVE (wandFertig -> waehle + setzeAktiv).
  const letzteId = () => GP.zustand.aktiv;

  // (a) Zeichnen in POSITIVER x-Richtung — die Bewegungsrichtung bestimmt die
  // Orientierung; Anker (Min-Ende) und Laenge bleiben wie bisher.
  GP.werkzeug('wand');
  GP.zeichne({ x: 20000, y: 20060 }, { x: 21000, y: 20070 });
  await warte();
  const idV = letzteId();
  const lV = wandVon(idV).lage;
  ok('#84 die Zeichenrichtung links→rechts ergibt die Orientierung +x',
    lV.orientierung === '+x' && lV.richtung === 'x'
    && lV.start_mm.x === 20000 && lV.start_mm.y === 20062.5 && lV.laenge_grid === 8);

  // (b) Zeichnen in NEGATIVER x-Richtung — entgegengesetzte Geste, gleiche
  // Geometrieregeln, gespiegelte Orientierung.
  GP.werkzeug('wand');
  GP.zeichne({ x: 21000, y: 20560 }, { x: 20000, y: 20570 });
  await warte();
  const idR = letzteId();
  const lR = wandVon(idR).lage;
  ok('#84 die Zeichenrichtung rechts→links ergibt die Orientierung -x — der Anker bleibt das Min-Ende',
    lR.orientierung === '-x' && lR.start_mm.x === 20000 && lR.laenge_grid === 8);

  // (c) V/R-Kanten im echten Editor-SVG: dieselbe Ableitung wie CON.wandSeiten —
  // fuer +x liegt die Vorderseite auf der Kante mit GROESSEREM y, fuer -x umgekehrt.
  ok('#84 beide Waende tragen im SVG je eine Vorder- und eine Rueckkante samt V/R-Kennbuchstaben',
    (GP.svg.match(/class="seite seite-vorder"/g) || []).length >= 2
    && (GP.svg.match(/class="seite seite-rueck"/g) || []).length >= 2
    && /class="seite-kz seite-kz-vorder"[^>]*>V</.test(GP.svg)
    && /class="seite-kz seite-kz-rueck"[^>]*>R</.test(GP.svg));
  ok('#84 +x-Wand: die Vorderkante ist die Laengskante mit groesserem y (Konvention „rechts in Blickrichtung“)',
    GP.svg.includes('class="seite seite-vorder" x1="20000" y1="20125" x2="21000" y2="20125"')
    && GP.svg.includes('class="seite seite-rueck" x1="20000" y1="20000" x2="21000" y2="20000"'));
  ok('#84 -x-Wand: Vorder- und Rueckkante sind gegenueber +x getauscht',
    GP.svg.includes('class="seite seite-vorder" x1="20000" y1="20500" x2="21000" y2="20500"')
    && GP.svg.includes('class="seite seite-rueck" x1="20000" y1="20625" x2="21000" y2="20625"'));

  // (d) 90°-Drehung: die Orientierung dreht mit (+x → +y), Geometrie um die
  // Min-Ecke, das Wandelement bleibt unberuehrt.
  GP.werkzeug('auswahl');
  GP.tippe({ x: 20500, y: 20062.5 });
  const elVorher = localStorage.getItem('sembla:elemente');
  GP.taste('r');
  await warte();
  const lV90 = wandVon(idV).lage;
  ok('#84 90° dreht die Orientierung mit (+x → +y) — die physische Vorderseite folgt der Wand',
    lV90.richtung === 'y' && lV90.orientierung === '+y' && lV90.laenge_grid === 8);
  ok('#84 90° laesst den Wandspeicher bit-genau stehen ([P-1])',
    localStorage.getItem('sembla:elemente') === elVorher);

  // (e) 180°-Wenden ueber den echten Knopf: NUR die Orientierung tauscht —
  // Anker, Laenge, Richtung, Masse und Wandspeicher bleiben byte-gleich.
  const masseVorher = JSON.stringify(MAPPE.bemassungen(store.holeMappe(), gs84));
  ok('#84 der Wenden-Knopf ist fuer die aktive, verortete Wand freigegeben', !$('gp-wenden').disabled);
  $('gp-wenden').dispatch('click');
  await warte();
  const lV180 = wandVon(idV).lage;
  ok('#84 180° wendet NUR die Orientierung (+y → -y)',
    lV180.orientierung === '-y' && lV180.richtung === lV90.richtung
    && lV180.start_mm.x === lV90.start_mm.x && lV180.start_mm.y === lV90.start_mm.y
    && lV180.laenge_grid === lV90.laenge_grid);
  ok('#84 180° laesst Masse und Wandspeicher unveraendert',
    JSON.stringify(MAPPE.bemassungen(store.holeMappe(), gs84)) === masseVorher
    && localStorage.getItem('sembla:elemente') === elVorher);
  ok('#84 das Wenden ist GENAU EIN Undo-Schritt',
    (GP.undo(), wandVon(idV).lage.orientierung === '+y'));
  GP.redo();
  ok('#84 Redo wendet wieder', wandVon(idV).lage.orientierung === '-y');
  // Umschalt+R wendet ueber die Tastatur — derselbe Weg wie der Knopf.
  GP.taste('r', null, { shiftKey: true });
  ok('#84 Umschalt+R wendet zurueck (+y), R und Umschalt+R sind getrennte Wege',
    wandVon(idV).lage.orientierung === '+y');

  // (f) Realer Pfad zu Modul 9: DERSELBE Mappenstand geht in die echte
  // Lageplan-Ableitung — SVG und Export-Bytes weisen dieselben V/R-Kanten aus.
  const daten84 = LP84.lageplanDaten({ mappe: store.holeMappe(), geschossId: gs84,
    elemente: store.listeElemente() });
  const eintragV = daten84.waende.find(w => w.id === idV);
  const eintragR = daten84.waende.find(w => w.id === idR);
  ok('#84 die Lageplan-Ableitung traegt dieselben Orientierungen wie der Editor',
    eintragV.orientierung === '+y' && eintragR.orientierung === '-x'
    && JSON.stringify(eintragV.seiten) === JSON.stringify(CON.wandSeiten(wandVon(idV).lage,
      daten84.ergebnis.positionen[idV])));
  const svg84 = LP84.lageplanSvg(daten84, { kennzeichnung: true }).svg;
  ok('#84 das Lageplan-SVG kennzeichnet Vorder- und Rueckkanten mit V/R',
    /class="lpseite lpseite-vorder"/.test(svg84) && /class="lpseite lpseite-rueck"/.test(svg84)
    && /class="lpseite-kz"[^>]*>V</.test(svg84) && /class="lpseite-kz"[^>]*>R</.test(svg84));
  const dateien84 = LP84.lageplanDateien(daten84, {});
  ok('#84 die Export-Bytes tragen dieselbe Kennzeichnung samt Legende',
    dateien84.every(d => /lpseite-vorder/.test(d.data))
    && dateien84.some(d => /Vorderseite der Wand/.test(d.data)));
}

// --- #76: Geschossursprung grafisch verschieben ---------------------------
// Realer Pfad: eine gezeichnete Wand, ein Ursprungsmass ueber das echte
// Massewerkzeug, dann der Ursprung ueber das echte Ursprungswerkzeug neu gesetzt,
// die angezeigte Vorschau bestaetigt und uebernommen. Geprueft werden danach
// Projektmappe, Loeser, SVG und ein GEMEINSAMER Rueckgaengig-/Wiederholen-Schritt.
{
  const gs76 = store.aktivesGeschossId();
  const mappe76 = () => MAPPE.findeGeschoss(store.holeMappe(), gs76).geschoss;
  const wandVon76 = (id) => MAPPE.findeWand(store.holeMappe(), id).wand;

  ok('#76 [K-4] das Ursprungswerkzeug ist genau EIN Bedienweg in der Werkzeugleiste',
    /id="wz-ursprung"/.test(html) && /data-wz="ursprung"/.test(html)
    && (html.match(/data-wz="ursprung"/g) || []).length === 1);

  // (a) Ausgangslage: ein frisch gezeichnetes Paar aus Wand und Ursprungsmass.
  $('gp-fang').checked = true; $('gp-fang').dispatch('change');
  GP.werkzeug('wand');
  GP.zeichne({ x: 60000, y: 60060 }, { x: 61000, y: 60070 });
  await warte();
  const id76 = GP.zustand.aktiv;
  ok('#76 Vorbereitung: die Wand ist verortet', !!wandVon76(id76).lage);

  GP.werkzeug('bemassen');
  GP.tippe(gp('bezugsPunkt', null, 'x'));
  GP.tippe(gp('bezugsPunkt', id76, 'x', 'min'));
  inlineEnter(60000);
  await warte();
  const bm76 = GP.bemassungen().find(b => b.von === null && b.achse === 'x'
    && b.bis.wand === id76);
  ok('#76 Vorbereitung: ein Ursprungsmass haengt an der Wand ([K-4])',
    !!bm76 && bm76.mass_mm === 60000 && GP.loesen().bestimmt[id76].x === true);

  const ursprungVor = GP.ursprung();
  const lagenVor = JSON.stringify(mappe76().waende.map(w => w.lage));
  const posVor = JSON.stringify(GP.loesen().positionen);
  const elementVor = JSON.stringify(store.holeElement(id76).wandelement);
  const undoVor = GP.undoStand.undo;
  ok('#76 vor der Aenderung steht der Ursprung auf 0/0',
    ursprungVor.x === 0 && ursprungVor.y === 0);

  // (b) Der Ursprung wird GRAFISCH gesetzt — ein Klick auf der Buehne. Er
  //     schreibt nichts: Vorschau ist Vorschau ([K-3]-Muster).
  GP.werkzeug('ursprung');
  const mappeVorKlick = localStorage.getItem('sembla:projekte');
  GP.tippe({ x: 1000, y: 500 });
  ok('#76 der Klick setzt nur den Entwurf und schreibt nichts',
    GP.ursprungStand.entwurf.x === 1000 && GP.ursprungStand.entwurf.y === 500
    && localStorage.getItem('sembla:projekte') === mappeVorKlick
    && GP.undoStand.undo === undoVor
    && GP.ursprung().x === 0);
  ok('#76 die Vorschau nennt alten und neuen Ursprung und das betroffene Mass',
    GP.ursprungStand.sichtbar
    && /0 \/ 0/.test(GP.ursprungStand.vorschau)
    && /1000 \/ 500/.test(GP.ursprungStand.vorschau)
    && GP.ursprungStand.vorschau.includes(bm76.id)
    && /60000 → 59000/.test(GP.ursprungStand.vorschau)
    && GP.ursprungStand.uebernehmbar);
  ok('#76 die Buehne zeigt den Entwurf samt altem Kreuz',
    /class="ursprungalt"/.test(GP.svg) && /class="ursprungzug"/.test(GP.svg));

  // (c) Uebernehmen — EIN Schritt fuer Ursprung UND nachgefuehrte Masse.
  GP.uebernehmeUrsprung();
  await warte();
  ok('#76 der Ursprung steht jetzt am gewaehlten Punkt der Projektmappe',
    GP.ursprung().x === 1000 && GP.ursprung().y === 500
    && mappe76().ursprung_mm.x === 1000 && mappe76().ursprung_mm.y === 500);
  ok('#76 das Ursprungsmass ist deterministisch nachgefuehrt (mass − ΔU)',
    GP.bemassungen().find(b => b.id === bm76.id).mass_mm === 59000);
  ok('#76 Bezuege und Achse des Masses sind dabei unangetastet geblieben',
    (() => { const b = GP.bemassungen().find(x => x.id === bm76.id);
      return b.von === null && b.bis.wand === id76 && b.bis.bezug === 'min' && b.achse === 'x'; })());
  ok('#76 [L-1] KEINE Wandlage wurde verschoben',
    JSON.stringify(mappe76().waende.map(w => w.lage)) === lagenVor);
  ok('#76 der Loeser liefert bitgenau dieselben Positionen wie vorher',
    JSON.stringify(GP.loesen().positionen) === posVor);
  ok('#76 [P-1] das Wandelement ist unberuehrt',
    JSON.stringify(store.holeElement(id76).wandelement) === elementVor);
  ok('#76 das SVG zeichnet den Ursprung an seiner neuen Stelle',
    GP.svg.includes(`d="${PLAN.kreuzPfad(1000, 500, GP.blick.mm)}"`)
    && !/class="ursprungalt"/.test(GP.svg));
  ok('#76 die Ursprungslinien als Massbezuege wandern mit',
    gp('bezugsPunkt', null, 'x').x === 1000 && gp('bezugsPunkt', null, 'y').y === 500);
  ok('#76 der Vorgang ist GENAU EIN Rueckgaengig-Schritt',
    GP.undoStand.undo === undoVor + 1);

  // (d) Rueckgaengig und Wiederholen nehmen beides gemeinsam.
  GP.undo();
  await warte();
  ok('#76 Rueckgaengig nimmt Ursprung UND Mass zusammen zurueck',
    GP.ursprung().x === 0 && GP.ursprung().y === 0
    && GP.bemassungen().find(b => b.id === bm76.id).mass_mm === 60000
    && JSON.stringify(GP.loesen().positionen) === posVor);
  GP.redo();
  await warte();
  ok('#76 Wiederholen setzt beides gemeinsam wieder',
    GP.ursprung().x === 1000 && GP.ursprung().y === 500
    && GP.bemassungen().find(b => b.id === bm76.id).mass_mm === 59000
    && JSON.stringify(GP.loesen().positionen) === posVor);

  // (e) Ungueltige Nachfuehrung: die GANZE Uebernahme wird benannt abgewiesen —
  //     nichts gerundet, nichts geloescht, nichts halb geschrieben.
  {
    const standVor = localStorage.getItem('sembla:projekte');
    const undoJetzt = GP.undoStand.undo;
    GP.werkzeug('ursprung');
    GP.tippe({ x: 130000, y: 500 });                 // Mass kaeme auf −69 000 mm
    ok('#76 [K-3] die Vorschau nennt das unbrauchbar werdende Mass und sperrt die Uebernahme',
      /Nicht übernehmbar/.test(GP.ursprungStand.vorschau)
      && GP.ursprungStand.vorschau.includes(bm76.id)
      && !GP.ursprungStand.uebernehmbar);
    GP.uebernehmeUrsprung();
    ok('#76 [K-3] die Uebernahme wird abgewiesen und der Speicher bleibt unveraendert',
      /nicht übernommen/i.test($('gp-msg').textContent)
      && localStorage.getItem('sembla:projekte') === standVor
      && GP.undoStand.undo === undoJetzt
      && GP.ursprung().x === 1000
      && GP.bemassungen().find(b => b.id === bm76.id).mass_mm === 59000);
    // [K-12]: ein halber Millimeter macht jedes ganzzahlige Ursprungsmass krumm.
    $('gp-fang').checked = false; $('gp-fang').dispatch('change');
    GP.tippe({ x: 1062.5, y: 500 });
    ok('#76 [K-12] auch ein krumm werdendes Mass sperrt die Uebernahme, statt zu runden',
      /Nicht übernehmbar/.test(GP.ursprungStand.vorschau) && !GP.ursprungStand.uebernehmbar);
    gp('taste', 'Escape');
    ok('#76 Escape verwirft den Entwurf, ohne etwas zu schreiben',
      !GP.ursprungStand.entwurf && localStorage.getItem('sembla:projekte') === standVor
      && GP.undoStand.undo === undoJetzt);
    $('gp-fang').checked = true; $('gp-fang').dispatch('change');
  }

  // (f) [L-9]: der Planversatz ist etwas anderes und bleibt getrennt.
  {
    const vorU = JSON.stringify(GP.ursprung());
    store.setzeGeschossPlan(gs76, { datei: 'eg76.png', typ: 'image/png',
      breite_px: 800, hoehe_px: 600, mm_je_pixel: 10 });
    store.setzeGeschossPlanAnsicht(gs76, { versatz_x_mm: 7000, versatz_y_mm: 7000 });
    await warte();
    ok('#76 [L-9] ein Planversatz laesst den Geschossursprung unberuehrt',
      JSON.stringify(GP.ursprung()) === vorU && GP.ursprung().x === 1000);
  }
  GP.werkzeug('auswahl');
}

let fail = 0;
for (const [n, c] of checks) { console.log((c ? '  ok  ' : 'FAIL  ') + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
