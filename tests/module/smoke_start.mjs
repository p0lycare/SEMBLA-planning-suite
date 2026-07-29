// Smoke-Test Modul 0 (docs/index.html): prueft die echte Startseiten-Logik gegen einen
// DOM-/localStorage-Mock. Modul 0 hat — anders als die uebrigen Module — nur ein
// <script type="module">; der Test entfernt daher die import-Zeilen und reicht dieselben
// Bindungen (store/buildWall/…) als Funktionsargumente hinein. Der ausgefuehrte Code ist
// unveraendert der der Produktoberflaeche.
//
// Schwerpunkt: Ownership des Wandtyps (Issue #6) — er wird beim Anlegen HIER gewaehlt
// und landet am Wandelement.

import { readFileSync } from "node:fs";

// --- Polyfills ------------------------------------------------------------
class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();
globalThis.window = { addEventListener(){} };

class El {
  constructor(id){ this.id=id; this.value=''; this.textContent=''; this._h=''; this.className='';
    this.hidden=false; this.style={}; this.dataset={}; this.listeners={}; this.files=[]; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f); }
  dispatch(e,ev){ (this.listeners[e]||[]).forEach(f=>f(ev||{target:this})); }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h=v; }
  querySelectorAll(){ return this._sel || []; }   // _sel: vom Test gestellte Treffer (Export-Haekchen)
  closest(){ return null; }
}
const document = {
  _e:{},
  getElementById(id){ let e=this._e[id]; if(!e) e=this._e[id]=new El(id); return e; },
  createElement(){ return new El('_'); },
  querySelector(){ return null; },
  addEventListener(){},
  head:{ appendChild(){} }, body:{ insertBefore(){}, firstChild:null },
};
globalThis.document = document;
globalThis.prompt = () => null;
globalThis.confirm = () => false;

// --- Abhaengigkeiten wie im Browser ---------------------------------------
const store = await import("../../docs/shared/storage.js");
const { buildWall } = await import("../../docs/shared/sembla-core.js");
const { MODULE } = await import("../../docs/shared/navbar.js");
const { baueDateien } = await import("../../docs/shared/sembla-export.js");

// --- Produktcode aus docs/index.html laden --------------------------------
const html = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
const modScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const src = modScript.replace(/^\s*import .*?;\s*$/gm, "");   // Imports -> Funktionsargumente
const zipCalls = [];                                          // downloadZip-Aufrufe des Produktcodes
new Function("mountNavbar","MODULE","store","buildWall","baueDateien","downloadZip", src)(
  () => {}, MODULE, store, buildWall, baueDateien, (name, files) => zipCalls.push({ name, files })
);

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const $=id=>document.getElementById(id);

// --- 1) Wandtyp-Auswahl existiert an der echten Oberflaeche ----------------
ok('Wandtyp-Auswahl in Modul 0 vorhanden', /<select[^>]*id="f-wandtyp"/.test(html));
ok('Auswahl bietet genau mit_wind/ohne_wind',
  /value="mit_wind"[^>]*selected/.test(html) && /value="ohne_wind"/.test(html));

// --- 2) Anlegen mit gewaehltem Wandtyp -> steht am Wandelement (M1) --------
$('f-name').value='Wand ohne Wind'; $('f-laenge').value='2000'; $('f-hoehe').value='2600';
$('f-wandtyp').value='ohne_wind';
$('btn-neu').dispatch('click');
const we1=store.aktivesWandelement();
ok('Anlegen setzt aktives Wandelement', !!we1 && we1.length_mm===2000);
ok('gewaehlter Wandtyp am Wandelement gespeichert', we1.wandtyp==='ohne_wind');
ok('Rueckmeldung an den Nutzer', /Angelegt/.test($('msg').textContent) && $('msg').className==='msg ok');

$('f-name').value='Wand mit Wind'; $('f-wandtyp').value='mit_wind';
$('btn-neu').dispatch('click');
ok('zweites Element mit eigenem Wandtyp', store.aktivesWandelement().wandtyp==='mit_wind');
ok('erstes Element behaelt seinen Wandtyp',
  store.listeElemente().find(e=>e.name==='Wand ohne Wind').wandelement.wandtyp==='ohne_wind');

// unsinnige Auswahl faellt auf den kompatiblen Standard zurueck
$('f-name').value='Wand kaputt'; $('f-wandtyp').value='quatsch';
$('btn-neu').dispatch('click');
ok('unbekannter Wert -> Standard mit_wind', store.aktivesWandelement().wandtyp==='mit_wind');

// --- 3) Wandtyp reist im Projekt-Export mit, Format bleibt v2 (M8/N4) ------
const p=store.projektObjekt();
ok('Projekt traegt den Wandtyp', p.wandelement.wandtyp==='mit_wind');
ok('oeffentliches Projektformat bleibt Version 2', p.version===2);
ok('kein mitWind mehr in den Standard-Eingaben', !('mitWind' in p.eingaben.statik));

// --- 4) Zentraler Export: Nachweis-Haekchen an der echten Oberflaeche (Issue #3) ---
ok('Export-Dialog hat das Nachweis-Haekchen (checked)',
  /<input type="checkbox" value="nachweis" checked>/.test(html));
ok('Beschriftung nennt „Statischer Nachweis (HTML/PDF-fähig)"',
  /Statischer Nachweis \(HTML\/PDF-fähig\)/.test(html));

// Export ueber den echten Produktpfad ausloesen: Tabellen-Klick "Export" -> Dialog -> ZIP-Button.
const aktivId = store.aktivId();
const btnEl = new El('b'); btnEl.dataset = { act: 'export' };
const trEl = new El('tr'); trEl.dataset = { id: aktivId };
$('tbody').dispatch('click', { target: { closest: sel => sel === 'button' ? btnEl : trEl } });
ok('Klick auf „Export" oeffnet den Dialog', $('exp-overlay').hidden === false);

// Nur das Nachweis-Haekchen ist gesetzt (wie ein Nutzer, der die uebrigen abwaehlt).
$('exp-overlay')._sel = [{ value: 'nachweis' }];
$('exp-go').dispatch('click');
ok('ZIP-Download mit genau einer Datei angestossen', zipCalls.length === 1 && zipCalls[0].files.length === 1);
const nwDatei = zipCalls.length ? zipCalls[0].files[0] : { name: '', data: '' };
ok('Dateiname Statischer_Nachweis_<Projekt>.html',
  nwDatei.name === 'Statischer_Nachweis_' + store.sicherName(store.projektObjekt(aktivId).name) + '.html');
ok('Inhalt ist ein selbsttragendes HTML-Dokument',
  /^<!DOCTYPE html>/.test(nwDatei.data) && /<\/html>$/.test(nwDatei.data) && /<style>/.test(nwDatei.data));
ok('Dokument ist als pruefpflichtige Planungshilfe gekennzeichnet',
  /Planungshilfe/.test(nwDatei.data) && /prüfpflichtig/i.test(nwDatei.data));
ok('Dialog schliesst nach dem Export', $('exp-overlay').hidden === true);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
