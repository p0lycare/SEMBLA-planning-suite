// Smoke-Test Modul 9 — Lageplan des Geschosses (docs/lageplan.html, Issue #54).
//
// Geprueft wird die ECHTE Seitenlogik unter einem DOM-/localStorage-Double: das
// klassische App-Skript der Seite wird evaluiert, Shared-Code wie im Browser ueber
// window.SEMBLA gebunden und __lpInit() aufgerufen. Bedient wird ausschliesslich
// ueber die Pruefhilfen von window.__lp — sie laufen durch dieselben Behandler wie
// Klick und Auswahl im Browser.
//
// Schwerpunkte (Kapitel 16.11):
//  - [N-1] eigene Seite/Reiter 9, keine Bearbeitung
//  - [N-2] Projekt/Geschoss waehlbar; Vorschau UND Export folgen der Auswahl,
//          ohne die aktiven Zeiger zu verbiegen ([L-10])
//  - [N-3] frische Ableitung, keine zweite Lagehaltung, KEIN Schreibzugriff
//  - [N-7] unvollstaendiger Stand wird benannt
//  - Muss 9: Vorschau und Export laufen durch denselben DOM-freien Pfad
//          (nachgewiesen an den EXPORTIERTEN BYTES)

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
    this.dataset = {}; this.listeners = {}; this.geklickt = 0;
  }
  addEventListener(e, f){ (this.listeners[e] || (this.listeners[e] = [])).push(f); }
  dispatch(e, ev){ let r; (this.listeners[e] || []).forEach(f => { r = f(ev || { target: this }); }); return r; }
  click(){ this.geklickt++; this.dispatch('click'); }
  remove(){ this.entfernt = true; }
  appendChild(k){ (this.kinder || (this.kinder = [])).push(k); }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h = v; }
}
const document = {
  _e: {},
  getElementById(id){ return this._e[id] || (this._e[id] = new El(id)); },
  createElement(tag){ return new El('_' + tag); },
  querySelector(){ return null; },
  addEventListener(){},
  head: { appendChild(){} }, body: { appendChild(){}, insertBefore(){}, firstChild: null },
};
globalThis.document = document;
let gedruckt = 0;
globalThis.window = { addEventListener(){}, location: { href: '' }, print(){ gedruckt++; } };
globalThis.alert = () => {};

/** Der letzte „heruntergeladene" Blob — daran werden die Export-BYTES geprueft. */
let letzterBlob = null;
globalThis.Blob = class {
  constructor(parts){ this.teile = parts || []; letzterBlob = this; }
};
URL.createObjectURL = () => 'blob:lageplan';
URL.revokeObjectURL = () => {};

// --- Abhaengigkeiten wie im Browser ---------------------------------------
const store = await import("../../docs/shared/storage.js");
const MAPPE = await import("../../docs/shared/sembla-projektmappe.js");
const LP = await import("../../docs/shared/sembla-lageplan.js");
const ZIP = await import("../../docs/shared/zip.js");
// #80/[N-9]: derselbe Baustein, aus dem der Geschosseditor sein Planbild liest —
// hier LESEND (`holePlan`) und mit eingeschleuster Bilddatenbank.
const PLAN = await import("../../docs/shared/sembla-plan.js");
const { buildWall } = await import("../../docs/shared/sembla-core.js");
const { MODULE } = await import("../../docs/shared/navbar.js");

const html = readFileSync(new URL("../../docs/lageplan.html", import.meta.url), "utf8");
const startseite = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische Skript
globalThis.window.SEMBLA = { store, MAPPE, LP, ZIP, PLAN };

/** Minimaler IndexedDB-Ersatz — derselbe wie im Editor- und Modul-0-Test ([L-8]). */
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
PLAN.setzeIndexedDB(fakeIndexedDB());

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const $ = id => document.getElementById(id);
const warte = () => new Promise(r => setTimeout(r, 0));

// --- 0) Navigation und Modulübersicht ([N-1]) -----------------------------
const m9 = MODULE.find(m => m.nr === 9);
ok('[N-1] Modul 9 steht mit eigener Seite in der Navigation',
  !!m9 && m9.datei === 'lageplan.html' && !m9.versteckt);
ok('[N-1] die Nummerierung 0–8 ist damit ausdruecklich auf 0–9 erweitert',
  MODULE.filter(m => !m.versteckt).map(m => m.nr).includes(9));
ok('[N-1] die Seite haengt sich als Modul 9 in die Kopfleiste',
  /mountNavbar\(9\)/.test(html));
ok('[N-1] die Modulübersicht in Modul 0 beschreibt Modul 9',
  /9:'/.test(startseite.replace(/\s/g, '')) || /9:\s*'/.test(startseite));
ok('[N-1] die Seite bietet keine Bearbeitung an (kein Werkzeug, kein Zeichnen)',
  !/data-wz=|Wand zeichnen|Bemaßen|setzeBemassung|verorteWand/.test(html));

// --- 0b) #72: kein einleitender Beschreibungstext -------------------------
// \b faengt auch `.intro b{…}` und den frueheren toten `.intro`-Selektor der
// Druckregel — nicht nur `.intro{`.
ok('[#72] kein einleitender intro-Absatz mehr auf der Seite',
  !/class="intro"/.test(html) && !/\.intro\b/.test(html));
ok('[#72] die Druckregel blendet Navigation und Controls weiterhin aus',
  /\.sb-nav,\.controls\{display:none!important\}/.test(html));

// --- 1) Startzustand ohne Projekt ----------------------------------------
eval(script);
globalThis.window.__lpInit();
const lp = globalThis.window.__lp;

ok('ohne Projekt wird das benannt statt ein Blatt erfunden',
  /Kein Projekt/.test($('lp-hinweis').innerHTML + $('lp-msg').textContent)
  && $('lp-blatt').innerHTML === '');

// --- 2) Pruefaufbau: zwei Projekte, zwei Geschosse ------------------------
const prjA = store.fuegeProjektHinzu('Projekt A', { gebaeude: 'Haus A', geschoss: 'EG', hoehe_mm: 2600 });
const gsEG = MAPPE.alleGeschosse(prjA)[0].geschoss.id;
store.aendereMappe(m => MAPPE.setzeKopfdaten(m, {
  bauherr: 'Bauherrschaft Muster', planverfasser: 'POLYCARE', phase: 'LP 3',
  plan_nr: 'A-101', index: 'b', gez: 'TB',
}));
const zwei = MAPPE.fuegeGeschossHinzu(store.holeMappe(), store.holeMappe().gebaeude[0].id, 'OG', 2400);
store.setzeMappe(zwei.mappe);
const gsOG = zwei.id;

// Drei Waende im EG (zwei laengs, eine quer) + eine im OG. Angelegt wird ueber die
// regulaeren Wege — Modul 9 selbst legt nie etwas an. Die Namen sind ABSICHTLICH lang:
// genau daran war die Zeichnung unlesbar (#59), und genau die muessen jetzt in der
// Liste statt im Wandrechteck stehen.
const NAME_A = 'Wand A — Erdgeschoss Nord tragend, Achse A/1 bis A/5';
const NAME_B = 'Wand B — Erdgeschoss Süd, Anschluss Treppenhaus, nichttragend';
const NAME_C = 'Wand C — Erdgeschoss West, Querwand mit Installationsschacht';
const idA = store.speichere(NAME_A, buildWall(NAME_A, 2000, 2600, []));
const idB = store.speichere(NAME_B, buildWall(NAME_B, 2000, 2600, []));
const idC = store.speichere(NAME_C, buildWall(NAME_C, 2875, 2600, []));
const idOG = store.speichere('Wand OG', buildWall('Wand OG', 1000, 2400, []));
store.verorteWand(idA, gsEG, { lage: { start_mm: { x: 0, y: 1062.5 }, richtung: 'x', laenge_grid: 16 } });
store.verorteWand(idB, gsEG, { lage: { start_mm: { x: 0, y: 4062.5 }, richtung: 'x', laenge_grid: 16 } });
store.verorteWand(idC, gsEG, { lage: { start_mm: { x: 62.5, y: 1125 }, richtung: 'y', laenge_grid: 23 } });
store.verorteWand(idOG, gsOG, { lage: { start_mm: { x: 0, y: 62.5 }, richtung: 'x', laenge_grid: 8 } });
store.aendereMappe(m => MAPPE.setzeBemassung(m, gsEG, {
  id: 'bm-1', achse: 'y', von: { wand: idA, bezug: 'mitte' }, bis: { wand: idB, bezug: 'mitte' },
  mass_mm: 3000, linie_mm: 400,
}));

const prjB = store.fuegeProjektHinzu('Projekt B', { gebaeude: 'Haus B', geschoss: '1. OG' });
const gsB = MAPPE.alleGeschosse(prjB)[0].geschoss.id;
// Der aktive Pfad zeigt bewusst auf Projekt B — Modul 9 darf ihn nicht anfassen.
store.setzeAktivesProjekt(prjB.projekt.id);
store.setzeAktivesGeschoss(gsB);
await warte();

// --- 3) Auswahl steuert die Ausgabe ([N-2]) ------------------------------
ok('[N-2] die Vorbelegung folgt dem aktiven Pfad',
  lp.daten && lp.daten.projekt.name === 'Projekt B');
const zeigerVor = ['sembla:aktiv:projekt', 'sembla:aktiv:geschoss', 'sembla:aktiv', 'sembla:aktiv:gebaeude']
  .map(k => k + '=' + localStorage.getItem(k)).join('|');

lp.waehleProjekt(prjA.projekt.id);
await warte();
ok('[N-2] das Projekt ist waehlbar und die Geschosse folgen der Wahl',
  lp.daten.projekt.name === 'Projekt A'
  && $('lp-geschoss').innerHTML.includes(gsEG) && $('lp-geschoss').innerHTML.includes(gsOG));
lp.waehleGeschoss(gsEG);
await warte();
ok('[N-2] das EG-Blatt zeigt alle drei verorteten Waende',
  lp.daten.geschoss.name === 'EG' && lp.daten.waende.length === 3
  && [idA, idB, idC].every(id => lp.blatt.svg.includes(`data-wand="${id}"`)));
ok('[N-2] der Blattbezug steht sichtbar in der Oberflaeche',
  /Projekt A/.test($('lp-bezug').innerHTML) && /EG/.test($('lp-bezug').innerHTML));
ok('[N-2] die Auswahl in Modul 9 verbiegt KEINEN aktiven Zeiger ([L-10])',
  ['sembla:aktiv:projekt', 'sembla:aktiv:geschoss', 'sembla:aktiv', 'sembla:aktiv:gebaeude']
    .map(k => k + '=' + localStorage.getItem(k)).join('|') === zeigerVor
  && store.aktivesProjektId() === prjB.projekt.id);
ok('[N-2] die Oberflaeche sagt, dass der Blattbezug und nicht der aktive Pfad gilt',
  /Blattbezug/.test(html) && /aktiven Pfad|aktiver Pfad|aktivem Pfad/.test(html));

const blattEG = lp.blatt.html;
lp.waehleGeschoss(gsOG);
await warte();
ok('[N-2] der Geschosswechsel wechselt die Ausgabe nachweisbar',
  lp.daten.waende.length === 1 && lp.blatt.svg.includes(`data-wand="${idOG}"`)
  && !lp.blatt.svg.includes(`data-wand="${idA}"`) && lp.blatt.html !== blattEG);

// --- 4) [N-3] kein Schreibzugriff ----------------------------------------
const standVor = JSON.stringify([...localStorage.m.entries()].sort());
lp.waehleGeschoss(gsEG);
lp.optionGeaendert();
$('lp-fmt').value = 'a4'; $('lp-fmt').dispatch('change');
$('lp-masse').checked = false; $('lp-masse').dispatch('change');
$('lp-masse').checked = true; $('lp-masse').dispatch('change');
// Die Haken stehen im Markup auf `checked`; der DOM-Double liest kein Markup, deshalb
// wird die Wandkennzeichnung hier ueber denselben Behandler eingeschaltet wie im Browser.
$('lp-kennz').checked = true; $('lp-kennz').dispatch('change');
$('lp-print').dispatch('click');
await warte();
ok('[N-3] Anzeigen, Optionen und Drucken schreiben NICHTS in den Speicher',
  JSON.stringify([...localStorage.m.entries()].sort()) === standVor);
ok('Drucken laeuft ueber den Browserdruck (PDF via „Als PDF speichern")', gedruckt === 1);
ok('[N-3] Darstellungsoptionen werden bewusst nicht gespeichert (keine neue Datenstruktur)',
  !/mergeEingaben/.test(html));
$('lp-fmt').value = 'a3'; $('lp-fmt').dispatch('change');

// --- 5) Muss 9: Vorschau und Export sind derselbe Pfad ------------------
const daten = lp.daten;
$('lp-export').dispatch('click');
await warte();
ok('Muss 11: der Export-Knopf liegt in Modul 9 und liefert eine Datei', !!letzterBlob);
const eintraege = await ZIP.entpacke(letzterBlob.teile[0]);
const dec = new TextDecoder();
const alsText = Object.fromEntries(eintraege.map(e => [e.name, dec.decode(e.data)]));
const rumpf = LP.dateiRumpf(daten);
ok('Muss 10: exportiert werden druckbares HTML und maßstabsgetreues SVG',
  Object.keys(alsText).sort().join(',') === [rumpf + '.html', rumpf + '.svg'].sort().join(','));
ok('Muss 9: die exportierten BYTES sind bitgenau der DOM-freie Blattpfad — kein zweites Rendering',
  alsText[rumpf + '.html'] === LP.lageplanDokument(daten, lp.optionen)
  && alsText[rumpf + '.svg'] === LP.lageplanSvgDatei(daten, lp.optionen));
ok('Muss 9: die Vorschau zeigt genau dasselbe Blatt-SVG wie der Export',
  $('lp-blatt').innerHTML.includes(lp.blatt.svg)
  && alsText[rumpf + '.html'].includes(lp.blatt.svg));
// --- 5a) [#59] minimaler Zeichnungskopf am ECHTEN Pfad --------------------
//
// Geprueft wird an vier Stellen: sichtbare Vorschau (`lp-blatt`), `lp.blatt.html`
// und den ENTPACKTEN Bytes beider Exportdateien. Der Feldsatz muss ueberall gleich
// sein — er kommt aus EINER Quelle (`kopfFelder`), nicht aus vier Bausteinen.
const kopfPaare = s => [...s.matchAll(
  /<div class="lptb-row"><div class="k">([^<]*)<\/div><div class="v[^"]*">([^<]*)<\/div><\/div>/g)]
  .map(m => [m[1], m[2]]);
// Getrennt wird am ERSTEN „: " — der Massstabswert „1 : 100" enthaelt selbst eines.
const svgFelder = s => [...s.matchAll(/<text class="lpkopf"[^>]*>([^<]*)<\/text>/g)]
  .map(m => m[1]).join(' · ').split(' · ')
  .map(x => { const i = x.indexOf(': '); return i > 0 ? [x.slice(0, i), x.slice(i + 2)] : null; })
  .filter(Boolean);
const KOPF_SOLL = ['Projekt', 'Gebäude', 'Geschoss', 'Planinhalt', 'Plan Nr.', 'Index',
  'Maßstab', 'Einheit', 'Stand'];
const ENTFERNT = ['Bauherrenschaft', 'Planverfasser', 'Phase', 'Gez.', 'Blattformat'];

ok('[N-6] das Schriftfeld der Ausgabe traegt die Projekt-Kopfdaten',
  kopfPaare(alsText[rumpf + '.html']).find(p => p[0] === 'Plan Nr.')[1] === 'A-101'
  && kopfPaare(alsText[rumpf + '.html']).find(p => p[0] === 'Index')[1] === 'b');
ok('[#59] Vorschau, Blatt und exportiertes HTML zeigen exakt die neun Pflichtangaben',
  [$('lp-blatt').innerHTML, lp.blatt.html, alsText[rumpf + '.html']]
    .every(s => kopfPaare(s).map(p => p[0]).join('|') === KOPF_SOLL.join('|')));
ok('[#59] die exportierte SVG-Datei traegt denselben Feldsatz in derselben Reihenfolge',
  svgFelder(alsText[rumpf + '.svg']).map(p => p[0]).join('|') === KOPF_SOLL.join('|'));
ok('[#59] alle drei Ausgaben nennen denselben Projekt-, Gebaeude-, Geschoss- und Massstabsstand',
  ['Projekt', 'Gebäude', 'Geschoss', 'Maßstab'].every(f => {
    const a = kopfPaare(lp.blatt.html).find(p => p[0] === f)[1];
    const b = kopfPaare(alsText[rumpf + '.html']).find(p => p[0] === f)[1];
    const c = svgFelder(alsText[rumpf + '.svg']).find(p => p[0] === f)[1];
    return a === b && b === c && a !== '';
  }) && kopfPaare(lp.blatt.html).find(p => p[0] === 'Maßstab')[1] === '1 : ' + lp.blatt.masstab);
ok('[#59] die entfernten Angaben stehen in KEINER der Ausgaben mehr',
  [$('lp-blatt').innerHTML, lp.blatt.html, alsText[rumpf + '.html'], alsText[rumpf + '.svg']]
    .every(s => ENTFERNT.every(f => !s.includes('>' + f + '<'))
      && !/Bauherrschaft Muster|POLYCARE|LP 3|A3 quer/.test(s)));
ok('[#59] die Einheit mm steht je Ausgabe genau einmal, die Masszahlen tragen keine',
  kopfPaare(lp.blatt.html).filter(p => p[0] === 'Einheit' && p[1] === 'mm').length === 1
  && kopfPaare(alsText[rumpf + '.html']).filter(p => p[0] === 'Einheit').length === 1
  && svgFelder(alsText[rumpf + '.svg']).filter(p => p[0] === 'Einheit' && p[1] === 'mm').length === 1
  && [...lp.blatt.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .every(m => !/\s(?:mm|cm|m)$/.test(m[1])));
// Muss 3: leere optionale Angaben — geleert wird ueber den regulaeren Mappenweg des
// Projekts A (der aktive Zeiger steht auf B), danach wieder hergestellt.
store.setzeMappe(MAPPE.setzeKopfdaten(store.projektMappe(prjA.projekt.id),
  { plan_nr: '', index: '' }));
await warte();
lp.render();
const leerHtml = lp.blatt.html, leerSvg = LP.lageplanSvgDatei(lp.daten, lp.optionen);
ok('[#59] leere Plan-Nr./Index erzeugen im Blatt keinen Platzhalter',
  kopfPaare(leerHtml).find(p => p[0] === 'Plan Nr.')[1] === ''
  && kopfPaare(leerHtml).find(p => p[0] === 'Index')[1] === ''
  && kopfPaare(leerHtml).map(p => p[0]).join('|') === KOPF_SOLL.join('|')
  // Das „–" der Wandtabelle (fehlender Wandtyp) bleibt unberuehrt — geprueft wird der Kopf.
  && kopfPaare(leerHtml).every(p => p[1] !== '–' && p[1] !== '###' && p[1] !== 'undefined')
  && !/###/.test(leerHtml) && !/undefined/.test(leerHtml));
ok('[#59] auch die SVG-Exportdatei bleibt platzhalterfrei — das leere Feld entfaellt',
  !/###|undefined/.test(leerSvg)
  && svgFelder(leerSvg).map(p => p[0]).join('|')
     === KOPF_SOLL.filter(f => f !== 'Plan Nr.' && f !== 'Index').join('|'));
store.setzeMappe(MAPPE.setzeKopfdaten(store.projektMappe(prjA.projekt.id),
  { plan_nr: 'A-101', index: 'b' }));
await warte();
lp.render();
ok('[#59] nach dem Wiederherstellen tragen die Felder wieder ihren Wert',
  kopfPaare(lp.blatt.html).find(p => p[0] === 'Plan Nr.')[1] === 'A-101'
  && kopfPaare(lp.blatt.html).find(p => p[0] === 'Index')[1] === 'b');
// --- 5b) [#59]/[#73] Nummernblase im Plan, voller Name in der rechten Liste
//
// Geprueft am ECHTEN Pfad: Storage → Mappe → lageplanDaten → blattHtml → Vorschau
// und entpackte Exportbytes. Die Nummer darf an keiner der vier Stellen abweichen.
// Seit #73 steht sie NICHT mehr im Wandrechteck, sondern in einer aussenliegenden
// Nummernblase mit Fuehrungslinie zur Wand.
const wandGruppen = (s) => [...s.matchAll(/<g class="lpwand[^"]*" data-wand="([^"]*)">([\s\S]*?)<\/g>/g)]
  .map((m) => ({
    id: m[1],
    title: (m[2].match(/<title>([^<]*)<\/title>/) || [, null])[1],
    text: (m[2].match(/<text\b[^>]*>([^<]*)<\/text>/) || [, null])[1],
  }));
const markerVon = (s) => [...s.matchAll(/<g class="lpmarker" data-wand="([^"]*)">([\s\S]*?)<\/g>/g)]
  .map((m) => {
    const c = m[2].match(/<circle cx="([^"]*)" cy="([^"]*)" r="([^"]*)"/);
    const l = m[2].match(/<line x1="([^"]*)" y1="([^"]*)" x2="([^"]*)" y2="([^"]*)"/);
    const t = m[2].match(/<text\b([^>]*)>([^<]*)<\/text>/);
    return {
      id: m[1],
      text: t ? t[2] : null,
      gedreht: t ? /transform=/.test(t[1]) : null,
      kreis: c ? { x: +c[1], y: +c[2], r: +c[3] } : null,
      linie: l ? { x1: +l[1], y1: +l[2], x2: +l[3], y2: +l[4] } : null,
    };
  });
const rechteckVon = (s, id) => {
  const m = new RegExp(`<g class="lpwand[^"]*" data-wand="${id}">`
    + `<rect x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"`).exec(s);
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
};
const ausserhalb = (k, r) => k.x + k.r <= r.x || k.x - k.r >= r.x + r.w
  || k.y + k.r <= r.y || k.y - k.r >= r.y + r.h;
const gruppen = wandGruppen(lp.blatt.svg);
const marker = markerVon(lp.blatt.svg);
const nrVon = id => String(daten.waende.find(w => w.id === id).nr);

ok('[#59] die Nummer ist Index+1 der kanonischen Mappenreihenfolge',
  daten.waende.map(w => w.nr).join(',') === '1,2,3'
  && daten.waende.map(w => w.id).join(',') === [idA, idB, idC].join(','));
ok('[#73] jede verortete Wand traegt eine Nummernblase mit ihrer kurzen Nummer',
  marker.length === 3
  && marker.every(g => g.text === nrVon(g.id) && /^\d+$/.test(g.text) && g.kreis && g.linie));
ok('[#73] im Wandrechteck steht keine Nummer mehr',
  gruppen.length === 3 && gruppen.every(g => g.text === null));
ok('[#73] die Blase der horizontalen Wand liegt ausserhalb, oberhalb des Rechtecks',
  (() => {
    const g = marker.find(x => x.id === idA), r = rechteckVon(lp.blatt.svg, idA);
    return !!g && !!r && ausserhalb(g.kreis, r) && g.kreis.y + g.kreis.r <= r.y
      && g.linie.x2 === g.kreis.x && g.linie.y2 === r.y;
  })());
ok('[#73] die Blase der vertikalen Wand liegt ausserhalb, links des Rechtecks — unrotiert',
  (() => {
    const g = marker.find(x => x.id === idC), r = rechteckVon(lp.blatt.svg, idC);
    return !!g && !!r && ausserhalb(g.kreis, r) && g.kreis.x + g.kreis.r <= r.x
      && g.linie.y2 === g.kreis.y && g.linie.x2 === r.x && g.gedreht === false;
  })());
ok('[#59] kein langer Wandname steht mehr als Beschriftung im Plan',
  !/<text[^>]*>Wand [ABC] —/.test(lp.blatt.svg)
  && marker.every(g => !/[A-Za-zÄÖÜäöüß]/.test(String(g.text))));
ok('[#59] `title` und `data-wand` behalten vollen Namen und stabile Speicherkennung',
  gruppen.every(g => g.title === store.holeElement(g.id).name)
  && gruppen.map(g => g.id).sort().join(',') === [idA, idB, idC].sort().join(','));
// Muss 3: die rechte Tabelle ist der Schluessel von der Zahl zum vollen Namen.
// #89: die Liste fuehrt nur noch Nummer, Namen und Hoehe — Laenge, Wandtyp,
// Brandschutz und Lage sind entfallen. Die Schluesselfunktion Zahl → voller Name,
// um die es hier geht, bleibt davon unberuehrt.
const tabZeilen = s => [...s.matchAll(
  /<tr><td class="nr">(\d+)<\/td><td>([^<]*)<\/td><td class="r">([^<]*)<\/td><\/tr>/g)]
  .map(m => ({ nr: m[1], name: m[2], hoehe: m[3] }));
const zeilenVorschau = tabZeilen(lp.blatt.html);
ok('[#59] die rechte Wandliste beginnt mit der Nummer und nennt den vollen Namen',
  /<th class="nr">Nr\.<\/th><th>Wand<\/th>/.test(lp.blatt.html)
  && zeilenVorschau.length === 3
  && zeilenVorschau.map(z => z.nr).join(',') === '1,2,3'
  && zeilenVorschau[0].name === NAME_A && zeilenVorschau[2].name === NAME_C);
ok('[#59] Zeichnung und Liste sind damit eindeutig zugeordnet',
  marker.every(g => {
    const z = zeilenVorschau.find(x => x.name === store.holeElement(g.id).name);
    return !!z && z.nr === g.text;
  }));
// Muss 4/6: dieselbe Marker- und Nummernabbildung in Vorschau, Blatt-HTML und beiden
// Exportdateien — nachgewiesen an den ENTPACKTEN BYTES, nicht an einem zweiten Aufruf.
const sig = s => markerVon(s)
  .map(g => `${g.id}:${g.text}@${g.kreis.x}/${g.kreis.y}>${g.linie.x2}/${g.linie.y2}`).join(',');
ok('[#73] Vorschau, exportiertes HTML und exportiertes SVG zeigen dieselben Marker',
  sig(lp.blatt.svg) !== '' && sig(lp.blatt.svg) === sig($('lp-blatt').innerHTML)
  && sig(alsText[rumpf + '.html']) === sig(lp.blatt.svg)
  && sig(alsText[rumpf + '.svg']) === sig(lp.blatt.svg));
ok('[#59] die exportierte HTML-Datei traegt dieselbe nummerierte Wandliste',
  JSON.stringify(tabZeilen(alsText[rumpf + '.html'])) === JSON.stringify(zeilenVorschau));
ok('[#59] die Nummer wird NICHT gespeichert (keine neue Datenstruktur)',
  !/"nr"/.test(JSON.stringify([...localStorage.m.entries()])));
// [#73]: der Block „Vollstaendigkeit" unter der Wandliste ist ersatzlos entfallen —
// samt Erfolgs-, Warn- und Hinweistexten, in Vorschau UND beiden Exportdateien.
const blockSpuren = /lpmeld|>Vollständigkeit<|Dieser Lageplan ist nicht vollständig|Hinweise \(kein Mangel\)|Vollständig: alle eingetragenen|Vollständig: keine offenen/;
ok('[#73] der Block Vollstaendigkeit fehlt in Vorschau, Blatt und Exportbytes',
  [$('lp-blatt').innerHTML, lp.blatt.html, alsText[rumpf + '.html'], alsText[rumpf + '.svg']]
    .every(s => !blockSpuren.test(s)));
ok('[#73] Wandliste und Darstellung/Legende bleiben in Vorschau und exportiertem HTML bestehen',
  [$('lp-blatt').innerHTML, lp.blatt.html, alsText[rumpf + '.html']]
    .every(s => s.includes('<h4>Wände im Geschoss</h4>') && s.includes('<h4>Darstellung</h4>')
      && s.includes(LP.legendeHtml())));

ok('Muss 11: es gibt keinen Modul-0-Weg fuer den Lageplan',
  !/[Ll]ageplan/.test(startseite.replace(/9:'[^']*'/g, '').replace(/9:\s*'[^']*'/g, ''))
  || !/sembla-lageplan/.test(startseite));

// --- 6) [N-7] unvollstaendiger Stand -------------------------------------
// Eine unverortete Wand, ein verwaister Eintrag und eine Kollision — alle drei
// entstehen ueber die regulaeren Wege, nicht in Modul 9.
const idFrei = store.speichere('Wand ohne Lage', buildWall('Wand ohne Lage', 1000, 2600, []));
store.verorteWand(idFrei, gsEG, { lage: null });
// Der verwaiste Eintrag gehoert in die Mappe von Projekt A — geschrieben wird sie
// ausdruecklich anhand ihrer Kennung, nicht ueber den aktiven Zeiger (der zeigt auf B).
store.setzeMappe(MAPPE.setzeWand(store.projektMappe(prjA.projekt.id), gsEG, {
  id: 'verwaist-1', name: 'Wand Verwaist',
  lage: { start_mm: { x: 6000, y: 62.5 }, richtung: 'x', laenge_grid: 8 },
}));
const idKoll = store.speichere('Wand Kollision', buildWall('Wand Kollision', 3750, 2600, []));
store.verorteWand(idKoll, gsEG, { lage: { start_mm: { x: 500, y: 500 }, richtung: 'y', laenge_grid: 30 } });
await warte();
lp.render();
const arten = lp.daten.meldungen.map(m => m.art);
const texte = lp.daten.meldungen.map(m => m.text).join(' | ');
ok('[N-7] die unverortete Wand wird namentlich benannt',
  arten.includes('unverortet') && /Wand ohne Lage/.test(texte));
ok('[N-7] der verwaiste Eintrag wird namentlich benannt ([L-4])',
  arten.includes('verwaist') && /Wand Verwaist/.test(texte));
ok('[N-7] die Kollision wird mit Ueberlappungsmass benannt ([K-13])',
  arten.includes('kollision') && /Wand Kollision/.test(texte) && /125/.test(texte));
ok('[N-7] der Stand wird sichtbar als NICHT vollstaendig ausgegeben',
  lp.daten.vollstaendig === false && /nicht vollständig/i.test(lp.blatt.html)
  && /nicht vollständig/i.test($('lp-stand').textContent + $('lp-stand').innerHTML));
ok('[N-7] auch der Export traegt den unvollstaendigen Stand',
  /nicht vollständig/i.test(LP.lageplanDokument(lp.daten, lp.optionen))
  && /nicht vollständig/i.test(LP.lageplanSvgDatei(lp.daten, lp.optionen)));
ok('[#73] auch der unvollstaendige Stand listet die Punkte nicht mehr auf dem Blatt',
  !blockSpuren.test(lp.blatt.html)
  && !blockSpuren.test(LP.lageplanDokument(lp.daten, lp.optionen))
  && !blockSpuren.test(LP.lageplanSvgDatei(lp.daten, lp.optionen)));
// [#59] Muss 5: unverortete und verwaiste Eintraege zaehlen mit und bleiben in der
// Liste — es wird weder eine Lage noch eine Ersatzkennung erfunden.
const zeilenSpaeter = tabZeilen(lp.blatt.html);
ok('[#59] unverortete und verwaiste Eintraege tragen ebenfalls eine Nummer',
  lp.daten.waende.map(w => w.nr).join(',') === '1,2,3,4,5,6'
  && lp.daten.waende.map(w => w.id).join(',') === [idA, idB, idC, idFrei, 'verwaist-1', idKoll].join(','));
ok('[#59] alle sechs Eintraege stehen nummeriert mit vollem Namen in der Liste',
  zeilenSpaeter.map(z => z.nr).join(',') === '1,2,3,4,5,6'
  && zeilenSpaeter[3].name === 'Wand ohne Lage'
  && zeilenSpaeter[4].name === 'Wand Verwaist'
  // #89: die Spalte „Lage" ist entfallen — dass der unverortete Eintrag als solcher
  // erkennbar bleibt, traegt jetzt allein die Meldung ([N-7], nicht gekuerzt).
  && lp.daten.meldungen.some(m => m.art === 'unverortet'
    && m.text.includes('Wand ohne Lage')));
ok('[#59]/[#73] die unverortete Wand bleibt ungezeichnet und bekommt keinen Marker',
  !lp.blatt.svg.includes(`data-wand="${idFrei}"`)
  && markerVon(lp.blatt.svg).map(g => g.text).join(',') === '1,2,3,5,6'
  && !markerVon(lp.blatt.svg).some(g => g.id === idFrei));
ok('Muss 8: die Wandkennungen der Ausgabe sind die des Wandspeichers',
  lp.daten.waende.filter(w => !w.verwaist).every(w => !!store.holeElement(w.id)));

// --- 7) Determinismus ----------------------------------------------------
const einmal = lp.blatt.html;
lp.render();
ok('[K-5] gleicher Stand ⇒ bitgenau gleiches Blatt', lp.blatt.html === einmal);

// --- 8) [#59] Nullmasse werden nicht gezeichnet, bleiben aber wirksam -----
//
// Gesetzt wird ueber den ECHTEN Pfad: Storage → Projektmappe → `setzeBemassung`.
// `bm-nul` fixiert die Kante „Wand A min" mit 0 mm am Geschossursprung ([K-4]) —
// ein Mass, das nichts misst und trotzdem die Lage bestimmt. Geschrieben wird in die
// Mappe von Projekt A anhand ihrer Kennung; der aktive Zeiger zeigt weiter auf B.
store.setzeMappe(MAPPE.setzeBemassung(store.projektMappe(prjA.projekt.id), gsEG, {
  id: 'bm-nul', achse: 'y', von: null, bis: { wand: idA, bezug: 'min' }, mass_mm: 0,
}));
await warte();
lp.render();

const massTexte = s => [...s.matchAll(/<g class="lpmass[^"]*"[^>]*>[\s\S]*?<text\b[^>]*>([^<]*)<\/text>/g)]
  .map(m => m[1]);

ok('[#59] die 0-mm-Bemassung liegt unveraendert im gespeicherten Stand',
  MAPPE.bemassungen(store.projektMappe(prjA.projekt.id), gsEG)
    .some(b => b.id === 'bm-nul' && b.mass_mm === 0));
ok('[#59] der kanonische Loeser wendet sie an — die Kante liegt auf y = 0',
  lp.daten.waende.find(w => w.id === idA).rechteck.y_min === 0
  && lp.daten.waende.find(w => w.id === idA).bestimmt.y === true);
ok('[#59] die Ableitung filtert nichts weg — das Mass ist als Geometrie vorhanden',
  lp.daten.massbilder.length === lp.daten.bemassungen.length
  && lp.daten.massbilder.some(g => g && g.id === 'bm-nul' && g.mass === 0));
ok('[#59] die sichtbare Vorschau zeichnet das Nullmass nicht',
  !lp.blatt.svg.includes('data-bemassung="bm-nul"')
  && !$('lp-blatt').innerHTML.includes('data-bemassung="bm-nul"')
  && !massTexte(lp.blatt.svg).includes('0'));
ok('[#59] das Nicht-null-Mass bleibt in der Vorschau vollstaendig stehen',
  lp.blatt.svg.includes('data-bemassung="bm-1"')
  && massTexte(lp.blatt.svg).join(',') === '3000');

// Muss 5: geprueft an den ENTPACKTEN Exportbytes, nicht an einem zweiten Aufruf.
letzterBlob = null;
$('lp-export').dispatch('click');
await warte();
const nulEintraege = await ZIP.entpacke(letzterBlob.teile[0]);
const nulText = Object.fromEntries(nulEintraege.map(e => [e.name, dec.decode(e.data)]));
const nulRumpf = LP.dateiRumpf(lp.daten);
ok('[#59] auch die exportierten Bytes tragen weder Kennung noch Maszahl des Nullmasses',
  [nulText[nulRumpf + '.html'], nulText[nulRumpf + '.svg']]
    .every(s => !s.includes('data-bemassung="bm-nul"') && !massTexte(s).includes('0')));
ok('[#59] Vorschau und Export stimmen ueberein und zeigen das 3000er-Mass weiter',
  [nulText[nulRumpf + '.html'], nulText[nulRumpf + '.svg']]
    .every(s => s.includes('data-bemassung="bm-1"') && massTexte(s).join(',') === '3000')
  && nulText[nulRumpf + '.html'].includes(lp.blatt.svg));
ok('[#59] die fixierte Wand selbst wird ganz normal gezeichnet',
  lp.blatt.svg.includes(`data-wand="${idA}"`));

// --- 9) #80/[N-9] der kalibrierte Geschossplan als Hintergrund -------------
//
// Gegangen wird der ECHTE Pfad: das Bild liegt in der eingeschleusten Bilddatenbank
// von `sembla-plan.js` (dieselbe, die der Geschossplaner benutzt), Maßstab und Versatz
// stehen im Planblock der Projektmappe. Modul 9 liest beides — und darf nichts davon
// schreiben. Das Testbild ist ABSICHTLICH winzig (1×1 PNG): geprueft wird die
// Darstellung und die Byte-Gleichheit, nicht die Bildgroesse.
{
  const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
  const bytes = Buffer.from(PNG_B64, "base64");
  // Blob-Ersatz mit genau der einen Faehigkeit, die die Seite braucht.
  const bild = { arrayBuffer: async () => bytes.buffer.slice(
    bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const BILD_PX = { breite_px: 800, hoehe_px: 600 };
  const PLANBLOCK = { datei: "grundriss-eg.png", typ: "image/png", ...BILD_PX,
    mm_je_pixel: 12.5, versatz_x_mm: -1500, versatz_y_mm: -250 };

  // Zuerst ohne Kalibrierung: Plan hinterlegt, Maßstab offen ([L-9]).
  store.setzeMappe(MAPPE.setzePlan(store.projektMappe(prjA.projekt.id), gsEG,
    { ...PLANBLOCK, mm_je_pixel: null }));
  await PLAN.speicherePlan(gsEG, bild, { name: PLANBLOCK.datei, typ: "image/png", ...BILD_PX });
  await warte();
  lp.waehleGeschoss(gsEG);
  await lp.laden();
  ok('[N-9] ein unkalibrierter Plan liefert keinen Hintergrund — der Grund steht auf dem Blatt',
    lp.daten.hintergrund.status === 'nicht_kalibriert'
    && !lp.blatt.svg.includes('<g class="lpbg">')
    && /<h4>Planhintergrund<\/h4>/.test(lp.blatt.html)
    && /kein Maßstab gesetzt/.test(lp.blatt.html)
    && /kein Maßstab gesetzt/.test($('lp-planstatus').innerHTML));
  const vollstaendigVorher = lp.daten.vollstaendig;

  // Jetzt kalibriert — Maßstab und Versatz kommen aus dem gespeicherten Planblock.
  store.setzeMappe(MAPPE.setzePlan(store.projektMappe(prjA.projekt.id), gsEG, PLANBLOCK));
  await warte();
  const standVorHg = JSON.stringify([...localStorage.m.entries()].sort());
  await lp.laden();
  const bildVon = (s) => {
    const g = /<g class="lpbg">([\s\S]*?)<\/g>/.exec(s);
    const i = g ? /<image ([^>]*)\/>/.exec(g[1]) : null;
    if (!i) return null;
    const attr = n => (new RegExp(`\\b${n}="([^"]*)"`).exec(i[1]) || [, null])[1];
    return { href: attr('href'), x: +attr('x'), y: +attr('y'), breite: +attr('width'),
      hoehe: +attr('height'), opacity: attr('opacity'), roh: g[0] };
  };
  const hgBild = bildVon(lp.blatt.svg);
  const rahmen = PLAN.planRahmenMm(PLANBLOCK, BILD_PX);
  const a = LP.ausdehnung(lp.daten, lp.optionen);
  const nah = (p, q) => Math.abs(p - q) < 0.002;
  ok('[N-9] der Hintergrund erscheint mit gespeichertem Maßstab und Versatz',
    lp.daten.hintergrund.status === 'gesetzt' && !!hgBild
    && hgBild.href === 'data:image/png;base64,' + PNG_B64
    && nah(hgBild.x, LP.PAD_MM + (rahmen.x - a.x_min) / lp.blatt.masstab)
    && nah(hgBild.y, LP.PAD_MM + (rahmen.y - a.y_min) / lp.blatt.masstab)
    && nah(hgBild.breite, rahmen.breite / lp.blatt.masstab)
    && nah(hgBild.hoehe, rahmen.hoehe / lp.blatt.masstab));
  ok('[N-9] die Standardtransparenz der Oberflaeche ist die des Bausteins',
    lp.optionen.transparenz === LP.TRANSPARENZ_STANDARD
    && hgBild.opacity === String((100 - LP.TRANSPARENZ_STANDARD) / 100));
  ok('[N-9] alles Gezeichnete liegt ueber dem Hintergrund',
    ['<g class="lpwand', '<g class="lpseiten', '<g class="lpmarker', '<g class="lpmass']
      .every(k => lp.blatt.svg.indexOf(k) > lp.blatt.svg.indexOf('<g class="lpbg">'))
    && lp.blatt.html.indexOf('<g class="lpbg">') < lp.blatt.html.indexOf('class="lptitleblock"'));
  ok('[N-9] der Hintergrund kippt die Vollstaendigkeit nicht ([N-7])',
    lp.daten.vollstaendig === vollstaendigVorher
    && !lp.daten.meldungen.some(m => m.art === 'planhintergrund'));
  ok('[N-9] Modul 9 schreibt beim Laden des Planbilds NICHTS in den Speicher',
    JSON.stringify([...localStorage.m.entries()].sort()) === standVorHg);

  // Transparenz verstellen — ueber denselben Behandler wie im Browser.
  const masstabVor = lp.blatt.masstab, waendeVor = lp.blatt.svg.match(/<g class="lpwand[\s\S]*/)[0];
  $('lp-trans').value = '70'; $('lp-trans').dispatch('change');
  await warte();
  const hg70 = bildVon(lp.blatt.svg);
  ok('[N-9] die verstellte Transparenz wirkt und bleibt fluechtig',
    lp.optionen.transparenz === 70 && hg70.opacity === '0.3'
    && $('lp-transv').textContent === '70 %'
    && JSON.stringify([...localStorage.m.entries()].sort()) === standVorHg);
  ok('[N-9] Maßstab und Wandgeometrie aendern sich durch die Transparenz nicht',
    lp.blatt.masstab === masstabVor
    && lp.blatt.svg.match(/<g class="lpwand[\s\S]*/)[0] === waendeVor);

  // Muss: die exportierten BYTES zeigen denselben Hintergrund wie die Vorschau.
  letzterBlob = null;
  $('lp-export').dispatch('click');
  await warte();
  const hgEintraege = await ZIP.entpacke(letzterBlob.teile[0]);
  const hgText = Object.fromEntries(hgEintraege.map(e => [e.name, dec.decode(e.data)]));
  const hgRumpf = LP.dateiRumpf(lp.daten);
  ok('[N-9] Vorschau, exportiertes HTML und exportiertes SVG zeigen bit-genau dasselbe Bild',
    hgText[hgRumpf + '.html'].includes(hg70.roh) && hgText[hgRumpf + '.svg'].includes(hg70.roh)
    && $('lp-blatt').innerHTML.includes(hg70.roh)
    && JSON.stringify(bildVon(hgText[hgRumpf + '.svg'])) === JSON.stringify(hg70));
  ok('[N-9] die exportierte SVG-Datei ist eigenstaendig (Data-URL, kein blob:-Verweis)',
    hgText[hgRumpf + '.svg'].includes('data:image/png;base64,' + PNG_B64)
    && !/href="blob:/.test(hgText[hgRumpf + '.svg']));

  // 100 % Transparenz: kein Bild — auch nicht in den Exportbytes.
  $('lp-trans').value = '100'; $('lp-trans').dispatch('change');
  await warte();
  letzterBlob = null;
  $('lp-export').dispatch('click');
  await warte();
  const ausText = Object.fromEntries((await ZIP.entpacke(letzterBlob.teile[0]))
    .map(e => [e.name, dec.decode(e.data)]));
  ok('[N-9] bei 100 % Transparenz enthaelt keine Ausgabe Bilddaten',
    bildVon(lp.blatt.svg) === null
    && Object.values(ausText).every(s => !s.includes('data:image/png'))
    && /ausgeblendet/.test(lp.blatt.html));

  // Fehlendes Bild: Maßstab und Versatz bleiben, das Blatt bleibt vollstaendig.
  await PLAN.loeschePlan(gsEG);
  $('lp-trans').value = '30'; $('lp-trans').dispatch('change');
  await lp.laden();
  ok('[N-9] ohne Bild in diesem Browser wird das benannt, das Blatt bleibt vollstaendig',
    lp.daten.hintergrund.status === 'bild_fehlt'
    && !lp.blatt.svg.includes('<g class="lpbg">')
    && /kein Bild/.test(lp.blatt.html)
    && lp.daten.vollstaendig === vollstaendigVorher
    && MAPPE.findeGeschoss(store.projektMappe(prjA.projekt.id), gsEG).geschoss.plan.mm_je_pixel
       === 12.5);
  ok('[N-9] die Seite hat keinen Uploadweg und keinen zweiten Speicherort',
    !/speicherePlan|loeschePlan|setzePlan|type="file"/.test(html)
    && /holePlan/.test(html) && /planRahmenMm/.test(html)
    // der vorlaeufige Editorfaktor wird ausdruecklich NICHT benutzt
    && !/planAnsichtRahmen|planVorschauRahmen/.test(html));
}

// --- 10) #79 Brandschutzklassifikation F0/F30 im Blatt -------------------
//
// Der ECHTE Nutzerpfad: die Klassifikation steht am Wandelement und wird
// ausschliesslich in Modul 1 gewaehlt — hier wird deshalb genau das gespeichert, was
// Modul 1 schreibt, und ueber die regulaeren Wege (`speichere`/`verorteWand`) in das
// Geschoss gebracht. Modul 9 liest sie nur. Geprueft wird an der sichtbaren Vorschau
// UND an den entpackten Exportbytes.
{
  const F30 = Object.assign(buildWall('Wand F30 — Treppenhauswand', 1000, 2600, []),
    { brandklasse: 'F30' });
  const F0 = Object.assign(buildWall('Wand F0 — Innenwand', 1000, 2600, []),
    { brandklasse: 'F0' });
  const idF30 = store.speichere('Wand F30 — Treppenhauswand', F30);
  const idF0 = store.speichere('Wand F0 — Innenwand', F0);
  store.verorteWand(idF30, gsEG,
    { lage: { start_mm: { x: 0, y: 6062.5 }, richtung: 'x', laenge_grid: 8 } });
  store.verorteWand(idF0, gsEG,
    { lage: { start_mm: { x: 0, y: 7062.5 }, richtung: 'x', laenge_grid: 8 } });
  await warte();
  lp.waehleGeschoss(gsEG);
  await lp.laden();

  const brandGruppen = (s) => [...s.matchAll(
    /<g class="lpbrand" data-wand="([^"]*)" data-brandklasse="([^"]*)">([\s\S]*?)<\/g>/g)]
    .map(m => ({ id: m[1], klasse: m[2], roh: m[0] }));
  const bg = brandGruppen(lp.blatt.svg);
  const gF30 = bg.find(g => g.id === idF30), gF0 = bg.find(g => g.id === idF0);
  const bkVon = id => lp.daten.waende.find(w => w.id === id).brandklasse;

  ok('[#79] die Ableitung liest die in Modul 1 gesetzte Klassifikation',
    bkVon(idF30) === 'F30' && bkVon(idF0) === 'F0');
  ok('[#79] eine Wand ohne das Feld gilt am echten Pfad als F0',
    !('brandklasse' in store.holeElement(idA).wandelement) && bkVon(idA) === 'F0');
  ok('[#79] der verwaiste Eintrag bleibt ohne Klassifikation ([L-4])',
    bkVon('verwaist-1') === null && !bg.some(g => g.id === 'verwaist-1'));
  // #89: nur F30 traegt ueberhaupt noch einen Brandschutzknoten — F0 ist die
  // Abwesenheit der Schraffur, und der frueher an jeder Wand gesetzte Kurztext ist
  // ersatzlos entfallen. Erklaert wird der Schluessel allein in der Legende.
  ok('[#89] die Vorschau zeichnet nur die F30-Wand, F0 bleibt ohne Knoten',
    !!gF30 && !gF0 && /lpbrand-flaeche/.test(gF30.roh));
  ok('[#89] an keiner Wand der Vorschau steht ein Brandschutz-Kurztext',
    !/>F30</.test(lp.blatt.svg) && !/>F0</.test(lp.blatt.svg)
    && !/lpbrand-kz/.test(lp.blatt.svg));
  // Farbe allein genuegt nicht: die Schraffur ist ein Knoten, kein Farbwert, und
  // ueberlebt deshalb den reinen Schwarz-Weiss-Ausdruck.
  const ohneFarbe = s => s.replace(/\s(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/g, '');
  ok('[#79] die Unterscheidung ueberlebt den Schwarz-Weiss-Ausdruck',
    ohneFarbe(gF30.roh).includes('lpbrand-flaeche')
    && brandGruppen(ohneFarbe(lp.blatt.svg)).length === 1);
  ok('[#79]/[#89] die Legende benennt beide Klassifikationen mit Merkmal im Klartext',
    lp.blatt.html.includes('<b>F30</b>') && lp.blatt.html.includes('<b>F0</b>')
    && lp.blatt.html.includes('ohne Schraffur')
    && lp.blatt.html.includes('diagonal schraffiert')
    && /Planungskennzeichnung, kein Nachweis/.test(lp.blatt.html));
  ok('[#89] die Wandtabelle des Blattes hat genau drei Spalten',
    [...LP.wandTabelleHtml(lp.daten).matchAll(/<th[^>]*>([^<]*)<\/th>/g)]
      .map(m => m[1]).join('|') === 'Nr.|Wand|Höhe');

  // Muss: die exportierten BYTES zeigen dieselbe Kennzeichnung wie die Vorschau.
  const standVorBk = JSON.stringify([...localStorage.m.entries()].sort());
  letzterBlob = null;
  $('lp-export').dispatch('click');
  await warte();
  const bkText = Object.fromEntries((await ZIP.entpacke(letzterBlob.teile[0]))
    .map(e => [e.name, dec.decode(e.data)]));
  const bkRumpf = LP.dateiRumpf(lp.daten);
  ok('[#79] Druck-HTML und SVG-Datei tragen bit-genau dieselben Kennzeichnungen',
    [bkText[bkRumpf + '.html'], bkText[bkRumpf + '.svg']].every(s =>
      JSON.stringify(brandGruppen(s)) === JSON.stringify(bg)
      && s.includes('<defs><pattern id='))
    && $('lp-blatt').innerHTML.includes(gF30.roh)
    && bkText[bkRumpf + '.html'].includes(LP.wandTabelleHtml(lp.daten)));
  ok('[#89] das exportierte HTML fuehrt die Klassifikation nur noch in der Legende',
    bkText[bkRumpf + '.html'].includes(LP.legendeHtml())
    && !/<th>Brandschutz<\/th>/.test(bkText[bkRumpf + '.html'])
    && !/<td>F30<\/td>/.test(bkText[bkRumpf + '.html'])
    && !/<td>F0<\/td>/.test(bkText[bkRumpf + '.html'])
    // und in der SVG-Datei steht an den Waenden ebenfalls kein Kurztext mehr
    && !/>F30</.test(bkText[bkRumpf + '.svg'])
    && !/>F0</.test(bkText[bkRumpf + '.svg']));
  ok('[#79] Anzeigen und Exportieren schreiben nichts — die Klassifikation bleibt Modul 1',
    JSON.stringify([...localStorage.m.entries()].sort()) === standVorBk
    && store.holeElement(idF30).wandelement.brandklasse === 'F30'
    && store.holeElement(idF0).wandelement.brandklasse === 'F0');
  ok('[#79] die Seite bietet kein Bedienelement fuer die Klassifikation',
    !/(?:id|name)="[^"]*brand[^"]*"/i.test(html)
    && !/brandklasse\s*[:=]/.test(html.replace(/data-brandklasse/g, ''))
    && /Modul 1/.test(html));
  // Massstab und Wandgeometrie bleiben unberuehrt: geprueft an derselben Bezugswand
  // wie vor der Klassifikation (die neuen Waende erweitern das Blatt zwangslaeufig).
  ok('[#79] die Klassifikation aendert weder Meldungen noch Vollstaendigkeit',
    !lp.daten.meldungen.some(m => /Brand/i.test(m.art + m.text))
    && !lp.daten.hinweise.some(m => /Brand/i.test(m.art + m.text)));
}

// --- 11) [#59] Nummernblasen ueberdeckungsfrei am ECHTEN Pfad -------------
//
// Der Nutzerpfad: mehrere dicht benachbarte, bemasste Waende in einem Geschoss.
// Angelegt wird ueber die regulaeren Wege (`speichere`/`verorteWand`/`setzeBemassung`),
// gezeigt und exportiert ueber die Seite selbst. Geprueft wird an der sichtbaren
// Vorschau UND an den ENTPACKTEN Exportbytes: keine Blase darf eine andere, keine
// Masszahl und keine Masslinie ueberdecken, und HTML wie SVG muessen dieselbe
// Platzierung tragen. Die Geometrie rechnet der Test SELBST (Kreis gegen Kreis,
// Kreis gegen Streckenzug) — nicht mit den Huellflaechen des Moduls.
{
  const gsNah = MAPPE.fuegeGeschossHinzu(store.projektMappe(prjA.projekt.id),
    store.projektMappe(prjA.projekt.id).gebaeude[0].id, 'Dichtes Geschoss', 2600);
  store.setzeMappe(gsNah.mappe);
  const gsN = gsNah.id;
  // Drei parallele Waende im 125-mm-Achsabstand: bei 1:50 nur 2,5 Papier-mm — die
  // Blasen (4,2 mm Durchmesser) laegen ohne Ausweichen uebereinander.
  const ids = [1062.5, 1187.5, 1312.5].map((y, i) => {
    const nm = `Wand dicht ${i + 1}`;
    const id = store.speichere(nm, buildWall(nm, 2000, 2600, []));
    store.verorteWand(id, gsN,
      { lage: { start_mm: { x: 0, y }, richtung: 'x', laenge_grid: 16 } });
    return id;
  });
  // Eine quer laufende Wand und ein Mass, dessen Masslinie per gespeichertem
  // `linie_mm` genau unter die Ausgangslage der ersten Blase gezogen wird.
  const idQ1 = store.speichere('Wand quer links', buildWall('Wand quer links', 2875, 2600, []));
  const idQ2 = store.speichere('Wand quer rechts', buildWall('Wand quer rechts', 2875, 2600, []));
  store.verorteWand(idQ1, gsN,
    { lage: { start_mm: { x: 62.5, y: 1375 }, richtung: 'y', laenge_grid: 23 } });
  store.verorteWand(idQ2, gsN,
    { lage: { start_mm: { x: 1937.5, y: 1375 }, richtung: 'y', laenge_grid: 23 } });
  store.setzeMappe(MAPPE.setzeBemassung(store.projektMappe(prjA.projekt.id), gsN, {
    id: 'bm-quer', achse: 'x', von: { wand: idQ1, bezug: 'mitte' },
    bis: { wand: idQ2, bezug: 'mitte' }, mass_mm: 1875, linie_mm: -2287.5,
  }));
  await warte();
  lp.waehleGeschoss(gsN);
  await lp.laden();

  const abstandZuStrecke = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const strecken = s => {
    const raus = [];
    for (const g of s.matchAll(/<g class="lpmass[^"]*"[^>]*><path d="([^"]*)"/g)) {
      const pkt = [...g[1].matchAll(/([ML])(-?[\d.]+) (-?[\d.]+)/g)]
        .map(m => ({ art: m[1], x: +m[2], y: +m[3] }));
      for (let i = 1; i < pkt.length; i++) if (pkt[i].art === 'L') raus.push([pkt[i - 1], pkt[i]]);
    }
    return raus;
  };
  const textPunkte = s => [...s.matchAll(
    /<g class="lpmass[^"]*"[^>]*>.*?<text x="(-?[\d.]+)" y="(-?[\d.]+)"/g)]
    .map(m => ({ x: +m[1], y: +m[2] }));
  /** Ueberdeckungsfrei gegen Blasen, Masszahlen und Masslinien? */
  const frei = s => {
    const mk = markerVon(s), st = strecken(s), tp = textPunkte(s);
    return mk.length > 0
      && mk.every((a, i) => mk.slice(i + 1).every(b =>
        Math.hypot(a.kreis.x - b.kreis.x, a.kreis.y - b.kreis.y) >= a.kreis.r + b.kreis.r))
      && mk.every(g => st.every(([a, b]) => abstandZuStrecke(g.kreis, a, b) >= g.kreis.r))
      && mk.every(g => tp.every(p =>
        Math.hypot(p.x - g.kreis.x, p.y - g.kreis.y) > g.kreis.r));
  };

  const nahMarker = markerVon(lp.blatt.svg);
  ok('[#59] Pruefaufbau: fuenf Waende, davon drei im dichtesten Abstand, plus Bemassung',
    lp.daten.waende.length === 5 && nahMarker.length === 5
    && ids.every(id => nahMarker.some(g => g.id === id))
    && lp.blatt.svg.includes('data-bemassung="bm-quer"'));
  ok('[#59] in der Vorschau ueberdeckt keine Blase eine andere, keine Zahl, keine Masslinie',
    frei(lp.blatt.svg) && frei($('lp-blatt').innerHTML));
  ok('[#59] mindestens eine Blase ist dafuer ausgewichen — auf derselben Normalen',
    nahMarker.some(g => {
      const r = rechteckVon(lp.blatt.svg, g.id);
      const quer = lp.daten.waende.find(w => w.id === g.id).richtung !== 'y';
      return quer ? g.kreis.y < r.y - 4.5 - 0.002 : g.kreis.x < r.x - 4.5 - 0.002;
    }));
  ok('[#59] jede Fuehrungslinie endet weiterhin auf der Kante ihrer eigenen Wand',
    nahMarker.every(g => {
      const r = rechteckVon(lp.blatt.svg, g.id);
      const quer = lp.daten.waende.find(w => w.id === g.id).richtung !== 'y';
      return quer
        ? g.linie.x2 === g.kreis.x && g.linie.y2 === r.y
        : g.linie.y2 === g.kreis.y && g.linie.x2 === r.x;
    }));

  // Muss 9: an den ENTPACKTEN Exportbytes — HTML und SVG tragen dieselbe Platzierung.
  const standVorBlase = JSON.stringify([...localStorage.m.entries()].sort());
  letzterBlob = null;
  $('lp-export').dispatch('click');
  await warte();
  const nahText = Object.fromEntries((await ZIP.entpacke(letzterBlob.teile[0]))
    .map(e => [e.name, dec.decode(e.data)]));
  const nahRumpf = LP.dateiRumpf(lp.daten);
  const sigBlase = s => markerVon(s)
    .map(g => `${g.id}@${g.kreis.x}/${g.kreis.y}>${g.linie.x2}/${g.linie.y2}`).join(',');
  ok('[#59] auch die exportierten Bytes sind ueberdeckungsfrei',
    frei(nahText[nahRumpf + '.html']) && frei(nahText[nahRumpf + '.svg']));
  ok('[#59] Vorschau, exportiertes HTML und exportiertes SVG zeigen dieselbe Platzierung',
    sigBlase(lp.blatt.svg) === sigBlase($('lp-blatt').innerHTML)
    && sigBlase(nahText[nahRumpf + '.html']) === sigBlase(lp.blatt.svg)
    && sigBlase(nahText[nahRumpf + '.svg']) === sigBlase(lp.blatt.svg));
  ok('[#59] die Ausweichlage ist fluechtig — Anzeigen und Exportieren schreiben nichts',
    JSON.stringify([...localStorage.m.entries()].sort()) === standVorBlase
    && !/"cx"|"blase"|"marker"/.test(JSON.stringify([...localStorage.m.entries()])));
  ok('[#59] Masswert und gespeicherter Darstellungsversatz bleiben unveraendert',
    MAPPE.bemassungen(store.projektMappe(prjA.projekt.id), gsN)
      .find(b => b.id === 'bm-quer').linie_mm === -2287.5
    && massTexte(lp.blatt.svg).join(',') === '1875');
  ok('[#59] Nummerierung und Wandliste bleiben unberuehrt',
    lp.daten.waende.map(w => w.nr).join(',') === '1,2,3,4,5'
    && nahMarker.map(g => g.text).join(',') === '1,2,3,4,5'
    && tabZeilen(lp.blatt.html).map(z => z.nr).join(',') === '1,2,3,4,5');
  ok('[K-5] gleicher Stand ⇒ bitgenau dieselbe Platzierung',
    (() => { const vorher = lp.blatt.svg; lp.render(); return lp.blatt.svg === vorher; })());

  // --- [#89] die Blase weicht auch der WANDFLAECHE aus, am ECHTEN Pfad -----
  //
  // Bis #89 durfte sie eine Wandflaeche notfalls ueberdecken — genau daran war die
  // Nummer im dicht bebauten Geschoss nicht mehr lesbar. Geprueft wird an der
  // sichtbaren Vorschau UND an den entpackten Exportbytes, mit unabhaengig
  // gerechneter Geometrie (Kreis gegen Rechteck) statt mit der Modulnaeherung.
  const alleRechteckeVon = s => [...s.matchAll(
    /<g class="lpwand[^"]*" data-wand="([^"]*)"><rect x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/g)]
    .map(m => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }));
  const kreisTrifft = (k, r) => {
    const nx = Math.max(r.x, Math.min(k.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(k.y, r.y + r.h));
    return Math.hypot(k.x - nx, k.y - ny) < k.r;
  };
  /** Keine Blase auf einer Wandflaeche — eigener noch fremder. */
  const wandfrei = s => {
    const mk = markerVon(s), re = alleRechteckeVon(s);
    return mk.length > 0 && re.length > 0
      && mk.every(g => re.every(r => !kreisTrifft(g.kreis, r)));
  };

  const nahRechtecke = alleRechteckeVon(lp.blatt.svg);
  ok('[#89] Pruefaufbau: die Ausgangslage laege wirklich auf einer fremden Wandflaeche',
    nahRechtecke.length === 5 && nahRechtecke.some(r0 => {
      const ausgang = { x: r0.x + r0.w / 2, y: r0.y - 4.5, r: 2.1 };
      return nahRechtecke.some(r => r.id !== r0.id && kreisTrifft(ausgang, r));
    }));
  ok('[#89] in der Vorschau ueberdeckt keine Blase eine Wandflaeche',
    wandfrei(lp.blatt.svg) && wandfrei($('lp-blatt').innerHTML));
  ok('[#89] auch die exportierten Bytes sind wandflaechenfrei — HTML wie SVG',
    wandfrei(nahText[nahRumpf + '.html']) && wandfrei(nahText[nahRumpf + '.svg']));
  ok('[#89] die Fuehrungslinie darf Waende weiterhin kreuzen',
    (() => {
      const kreuzt = (l, r) => Math.min(l.x1, l.x2) <= r.x + r.w && Math.max(l.x1, l.x2) >= r.x
        && Math.min(l.y1, l.y2) <= r.y + r.h && Math.max(l.y1, l.y2) >= r.y;
      return markerVon(lp.blatt.svg).some(g =>
        nahRechtecke.some(r => r.id !== g.id && kreuzt(g.linie, r)));
    })());

  // Gegenprobe am echten Pfad: ein eigenes, weitraeumiges Geschoss ohne jede
  // Ueberdeckung — zwei Waende im Abstand mehrerer Meter, keine Bemassung. Dort steht
  // jede Blase weiterhin an der festen Stelle von #73, und der Zeichenbereich waechst
  // um nichts; das Blatt ist damit der Stand vor der Aenderung.
  const gsWeitH = MAPPE.fuegeGeschossHinzu(store.projektMappe(prjA.projekt.id),
    store.projektMappe(prjA.projekt.id).gebaeude[0].id, 'Weites Geschoss', 2600);
  store.setzeMappe(gsWeitH.mappe);
  const gsW = gsWeitH.id;
  [0, 6000].forEach((y, i) => {
    const nm = `Wand weit ${i + 1}`;
    const id = store.speichere(nm, buildWall(nm, 2000, 2600, []));
    store.verorteWand(id, gsW,
      { lage: { start_mm: { x: 0, y: y + 62.5 }, richtung: 'x', laenge_grid: 16 } });
  });
  await warte();
  lp.waehleGeschoss(gsW);
  await lp.laden();
  const freiMk = markerVon(lp.blatt.svg);
  ok('[#89] Gegenprobe: im ueberdeckungsfreien Geschoss liegt keine Blase auf einer Wand',
    wandfrei(lp.blatt.svg));
  ok('[#89] dort steht jede Blase unveraendert im festen Abstand von #73',
    freiMk.length > 0 && freiMk.every(g => {
      const r = rechteckVon(lp.blatt.svg, g.id);
      const quer = lp.daten.waende.find(w => w.id === g.id).richtung !== 'y';
      const soll = quer ? { x: r.x + r.w / 2, y: r.y - 4.5 } : { x: r.x - 4.5, y: r.y + r.h / 2 };
      return Math.abs(g.kreis.x - soll.x) < 0.002 && Math.abs(g.kreis.y - soll.y) < 0.002;
    }));
  ok('[#89] und der Zeichenbereich waechst dort um nichts (kein Blasenueberstand)',
    (() => {
      const z = LP.lageplanSvg(lp.daten, lp.optionen);
      return z.rand.links === 0 && z.rand.oben === 0
        && z.rand.rechts === 0 && z.rand.unten === 0;
    })());
}

// --- Bericht -------------------------------------------------------------
let fail = 0;
for (const [n, c] of checks) { if (!c) fail++; console.log((c ? '  ok  ' : '  FAIL ') + n); }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
