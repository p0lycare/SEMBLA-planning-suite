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
const { buildWall } = await import("../../docs/shared/sembla-core.js");
const { MODULE } = await import("../../docs/shared/navbar.js");

const html = readFileSync(new URL("../../docs/lageplan.html", import.meta.url), "utf8");
const startseite = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische Skript
globalThis.window.SEMBLA = { store, MAPPE, LP, ZIP };

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
const tabZeilen = s => [...s.matchAll(
  /<tr><td class="nr">(\d+)<\/td><td>([^<]*)<\/td>[\s\S]*?<td>([^<]*)<\/td><\/tr>/g)]
  .map(m => ({ nr: m[1], name: m[2], lage: m[3] }));
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
  && zeilenSpaeter[3].name === 'Wand ohne Lage' && zeilenSpaeter[3].lage === 'unverortet'
  && zeilenSpaeter[4].name === 'Wand Verwaist');
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

// --- Bericht -------------------------------------------------------------
let fail = 0;
for (const [n, c] of checks) { if (!c) fail++; console.log((c ? '  ok  ' : '  FAIL ') + n); }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
