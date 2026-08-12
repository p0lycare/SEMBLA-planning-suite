// Smoke-Test Modul 0 (docs/index.html): prueft die echte Startseiten-Logik gegen einen
// DOM-/localStorage-Mock. Modul 0 hat — anders als die uebrigen Module — nur ein
// <script type="module">; der Test entfernt daher die import-Zeilen und reicht dieselben
// Bindungen (store/buildWall/…) als Funktionsargumente hinein. Der ausgefuehrte Code ist
// unveraendert der der Produktoberflaeche.
//
// Schwerpunkte:
//  - Ownership des Wandtyps (Issue #6) — er wird beim Anlegen HIER gewaehlt und landet
//    am Wandelement.
//  - Bauteilkatalog (Issue #21) — Anlegen/Bearbeiten/Duplizieren/Loeschen einzelner
//    Produkte (v. a. Gewindestangen, Latten, Platten) und separater Katalogimport/-export.
//    Alles ueber die echten Bedienelemente der Startseite. Nur synthetische Fantasiedaten.
//  - Issue #35 — Modul 0 ist ALLEINIGER Pflegeort fuer Produkte und Preise und hat KEINE
//    wand-/projektbezogene Produktauswahl mehr ([P-13]); die frueheren zentralen Freigaben
//    sind unwirksamer Altbestand und werden nur noch sichtbar gemeldet ([P-15]).

import { readFileSync } from "node:fs";

// --- Polyfills ------------------------------------------------------------
class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();
// `location` ist Teil des Doubles, damit die echten Navigationspfade des Moduls
// („In Modul 1 planen", „Geschoss öffnen") prueffbar sind statt im catch zu landen.
globalThis.window = { addEventListener(){}, location: { href: '' } };

// Echte scrollIntoView-Aufrufe am gerenderten Datensatz (Import-Feedback, Issue #28).
const scrollAufrufe = [];
class El {
  constructor(id){ this.id=id; this.value=''; this.textContent=''; this._h=''; this.className='';
    this.hidden=false; this.checked=false; this.style={}; this.dataset={}; this.listeners={}; this.files=[]; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f); }
  // Rueckgabewert des letzten Hoerers durchreichen (async-Hoerer: Promise abwarten).
  dispatch(e,ev){ let r; (this.listeners[e]||[]).forEach(f=>{ r=f(ev||{target:this}); }); return r; }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h=v; }
  querySelectorAll(){ return this._sel || []; }   // _sel: vom Test gestellte Treffer (Export-Haekchen)
  /** Sucht im gerenderten Markup — nur was der Produktcode braucht ('tr.neu', 'svg').
   *  Der Treffer ist ein echtes Element-Double: sein scrollIntoView wird protokolliert. */
  querySelector(sel){
    // Geschossplan (C3): das gerenderte SVG samt Position im Fenster. Die Buehne
    // liegt im Test bei 0/0, damit Klickkoordinaten direkt Bildpixel sind.
    if (sel === 'svg') {
      return this._h.includes('<svg') ? { getBoundingClientRect: () => ({ left: 0, top: 0 }) } : null;
    }
    if (sel !== '.knoten.wand.neu') return null;
    const m = /<div class="knoten wand[^"]*\bneu\b[^"]*" data-wand="([^"]+)">/.exec(this._h);
    if (!m) return null;
    return { dataset:{ wand:m[1] },
             scrollIntoView(opts){ scrollAufrufe.push({ id:m[1], opts }); } };
  }
  closest(){ return null; }
  remove(){}
}
let letzterAnker = null;                          // zuletzt erzeugtes <a> (Download pruefen)
const document = {
  _e:{},
  getElementById(id){ let e=this._e[id]; if(!e) e=this._e[id]=new El(id); return e; },
  createElement(){ letzterAnker = new El('_'); return letzterAnker; },
  querySelector(){ return null; },
  _l:{},
  addEventListener(e,f){ (this._l[e]||(this._l[e]=[])).push(f); },
  dispatch(e,ev){ (this._l[e]||[]).forEach(f=>f(ev)); },
  head:{ appendChild(){} }, body:{ appendChild(){}, insertBefore(){}, firstChild:null },
};
globalThis.document = document;
globalThis.prompt = () => null;
let confirmAntwort = false;                       // vom Test gesteuert (Loeschen/Ersetzen)
globalThis.confirm = () => confirmAntwort;

/**
 * Minimaler IndexedDB-Ersatz fuer die Plan-Ablage ([L-8]). Bildet genau das ab, was
 * sembla-plan.js benutzt; damit laeuft im Test der ECHTE Datenbankcode des Moduls.
 */
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
  const db = { objectStoreNames:{ contains:()=>true }, createObjectStore:()=>st,
               transaction:()=>({ objectStore:()=>st }), close(){} };
  return { open(){ const req={ result:db, onsuccess:null, onerror:null, onupgradeneeded:null };
    queueMicrotask(()=>{ if(req.onupgradeneeded) req.onupgradeneeded(); if(req.onsuccess) req.onsuccess(); });
    return req; } };
}

/**
 * Wie `fakeIndexedDB`, aber der `ab`-te Schreibvorgang scheitert — damit laesst
 * sich der Ruecksprung des Archivimports pruefen ([L-13]): faellt der Planspeicher
 * mitten im Schreiben aus, muss der VORHERIGE Stand vollstaendig zurueckkommen.
 */
function fakeIndexedDBMitFehler(ab){
  const daten = new Map();
  let puts = 0;
  const spaeter = (wert) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { req.result = wert(); if (req.onsuccess) req.onsuccess(); });
    return req;
  };
  const st = {
    put: (s) => {
      if (++puts < ab) return spaeter(() => { daten.set(String(s.id), s); return s.id; });
      const req = { result: undefined, error: new Error('Speicher voll (Test)'), onsuccess: null, onerror: null };
      queueMicrotask(() => { if (req.onerror) req.onerror(); });
      return req;
    },
    get: (id) => spaeter(() => daten.get(String(id))),
    delete: (id) => spaeter(() => { daten.delete(String(id)); return undefined; }),
    getAllKeys: () => spaeter(() => [...daten.keys()]),
  };
  const db = { objectStoreNames:{ contains:()=>true }, createObjectStore:()=>st,
               transaction:()=>({ objectStore:()=>st }), close(){} };
  return { open(){ const req={ result:db, onsuccess:null, onerror:null, onupgradeneeded:null };
    queueMicrotask(()=>{ if(req.onupgradeneeded) req.onupgradeneeded(); if(req.onsuccess) req.onsuccess(); });
    return req; } };
}

// Datei-Downloads abfangen (Katalog-Export laeuft ueber Blob/URL wie im Browser).
// Der Blob kann seit Etappe C5 auch BINAERES: Planbilder reisen als Bytes durch
// Export und Import ([L-13]), und der Produktcode liest sie ueber `arrayBuffer()`.
let letzterDownload = null;
globalThis.Blob = class {
  constructor(parts, opt){
    this._parts = parts || [];
    this.type = (opt && opt.type) || "";
    this._t = this._parts.map(p => (typeof p === "string" ? p : "")).join("");
  }
  get _bytes(){
    const stuecke = this._parts.map(p => (typeof p === "string" ? new TextEncoder().encode(p) : new Uint8Array(p.buffer || p)));
    const out = new Uint8Array(stuecke.reduce((s, b) => s + b.length, 0));
    let o = 0; for (const b of stuecke) { out.set(b, o); o += b.length; }
    return out;
  }
  async arrayBuffer(){ const b = this._bytes; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
};
// Nur die Blob-URL-Helfer ergaenzen — `new URL(...)` bleibt das echte Node-URL.
URL.createObjectURL = (b) => { letzterDownload = b._t; return "blob:x"; };
URL.revokeObjectURL = () => {};

// --- Abhaengigkeiten wie im Browser ---------------------------------------
const store = await import("../../docs/shared/storage.js");
const { buildWall } = await import("../../docs/shared/sembla-core.js");
const WA = await import("../../docs/shared/sembla-wandanlage.js");
const { MODULE } = await import("../../docs/shared/navbar.js");
const { baueDateien, gesamtstuecklisteDateien, stuecklistePositionen } = await import("../../docs/shared/sembla-export.js");
const GES = await import("../../docs/shared/sembla-gesamtstueckliste.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");
const MAPPE = await import("../../docs/shared/sembla-projektmappe.js");
const PLAN = await import("../../docs/shared/sembla-plan.js");
const ARCHIV = await import("../../docs/shared/sembla-archiv.js");
const { entpacke, zipSync } = await import("../../docs/shared/zip.js");

// --- Produktcode aus docs/index.html laden --------------------------------
const html = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
const modScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const src = modScript.replace(/^\s*import .*?;\s*$/gm, "");   // Imports -> Funktionsargumente
const BINDUNGEN = ["mountNavbar","MODULE","store","WA","baueDateien","gesamtstuecklisteDateien",
                   "gesamtUmfang","gesamtDaten","gesamtDateiRumpf","downloadZip",
                   "entpacke","ARCHIV","KAT","MAPPE","PLAN"];
const zipCalls = [];                                          // downloadZip-Aufrufe des Produktcodes
new Function(...BINDUNGEN, src)(
  () => {}, MODULE, store, WA, baueDateien, gesamtstuecklisteDateien,
  GES.umfang, GES.gesamtDaten, GES.dateiRumpf,
  (name, files) => zipCalls.push({ name, files }),
  entpacke, ARCHIV, KAT, MAPPE, PLAN
);

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const $=id=>document.getElementById(id);

// --- Bedienhilfen der neuen Baumliste (Etappe C3.1) -----------------------
// Alle Aktionen laufen ueber die ECHTE Ereignisdelegation von #tr-baum bzw. #tr-warn:
// der Test stellt nur das <button data-act data-id> nach, das der Produktcode rendert.
function baum(act, id, host = 'tr-baum'){
  const btn = new El('b'); btn.dataset = { act, id: id == null ? '' : String(id) };
  $(host).dispatch('click', { target: { closest: sel => sel === 'button[data-act]' ? btn : null } });
}
const trMsgTxt = () => $('tr-msg').textContent;
const trFehler = () => $('tr-msg').className === 'msg err';
/** Projekt ueber den echten Dialog anlegen (und aktiv setzen). */
function projektAnlegen(name, kopf = {}){
  $('tr-projekt-neu').dispatch('click');
  $('pp-name').value = name;
  for (const [feld, wert] of Object.entries(kopf)) $('pp-' + feld).value = wert;
  $('pp-speichern').dispatch('click');
  return store.holeMappe();
}
/** Geschoss ueber den echten Dialog anlegen. */
function geschossAnlegen(projektId, name, hoehe){
  baum('gs-neu', projektId);
  $('gp-name').value = name;
  $('gp-hoehe').value = hoehe == null ? '' : String(hoehe);
  $('gp-speichern').dispatch('click');
  return store.aktivesGeschossId();
}
/**
 * VORBEDINGUNG herstellen: eine Wand existiert und ist im Geschoss eingetragen.
 *
 * Seit Issue #56 legt Modul 0 keine Wand mehr an — das tut ausschliesslich das
 * Wandwerkzeug des Geschosseditors. Der Helfer geht deshalb GENAU dessen Weg: der
 * gemeinsame Anlagepfad `sembla-wandanlage.js` (ein Schreibvorgang, [P-18]/#15/#62),
 * danach der Geschosseintrag ohne Lage ([L-4]) und das Aktivsetzen ([L-10]).
 * Die Baumliste rendert daraufhin ueber `store.abonniere(trRender)` von selbst neu —
 * geprueft wird also weiterhin die echte Modul-0-Oberflaeche.
 *
 * Dass Modul 0 selbst KEINEN Anlageweg mehr anbietet, prueft Abschnitt 1 gesondert.
 */
function wandAnlegen(geschossId, { name, laenge = 2000, hoehe = 2600, wandtyp = 'mit_wind' }){
  const anlage = WA.legeWandAn(store, { name, laenge_mm: laenge, hoehe_mm: hoehe, wandtyp });
  store.verorteWand(anlage.id, geschossId, { name, lage: null });
  try { store.setzeAktiv(anlage.id); } catch { /* nicht aktivierbar: Zeiger bleibt */ }
  return anlage.id;
}

// Ausgangslage: ein Projekt mit einem Geschoss — Waende leben nach [L-6] immer in
// einem Geschoss, und nach [L-10] ist nur die Wand des AKTIVEN Geschosses aktivierbar.
const prj0 = projektAnlegen('Testprojekt');
const gs0 = store.aktivesGeschossId();
ok('[L-6] Anlegen erzeugt Projekt samt Gebaeude und Geschoss',
  !!prj0 && prj0.gebaeude.length === 1 && prj0.gebaeude[0].geschosse.length === 1 && !!gs0);

// --- 1) #56: Modul 0 legt KEINE Wand mehr an -------------------------------
// Geprueft gegen die echte HTML-Quelle: es gibt weder Anlageknopf noch Neuanlagedialog,
// und die frueheren Geometriefelder sind ersatzlos entfallen — nicht nur gesperrt.
ok('#56 kein Anlageknopf mehr in der Baumliste (`wand-neu` existiert nicht)',
  !/data-act="wand-neu"/.test(html) && !/\+ Wand hinzufügen/.test(html));
ok('#56 keine Geometrie-/Wandtypfelder mehr im Wand-Popup',
  !/id="f-laenge"/.test(html) && !/id="f-hoehe"/.test(html) && !/id="f-wandtyp"/.test(html));
ok('#56 die Baumliste verweist fuer neue Waende auf den Geschosseditor',
  /Neue Wand zeichnen \(Geschosseditor\)/.test(html));
ok('#56 der Dateiimport bleibt als eigener, ausdruecklicher Weg erhalten',
  /data-act="wand-import"/.test(html) && /Wand aus Datei importieren/.test(html)
  && /id="f-import"/.test(html) && /id="btn-vorlage-wand"/.test(html));
ok('#56 der einzige Schreibknopf des Popups ist das Umbenennen',
  /id="btn-neu" hidden>Namen speichern</.test(html));

// --- 2) Der Wandtyp steht am Wandelement (M1) ------------------------------
// Angelegt wird im Geschosseditor (s. `wandAnlegen`); Modul 0 zeigt und verwaltet nur.
const idOhneWind = wandAnlegen(gs0, { name:'Wand ohne Wind', wandtyp:'ohne_wind' });
const we1=store.aktivesWandelement();
ok('Anlegen setzt aktives Wandelement', !!we1 && we1.length_mm===2000);
ok('gewaehlter Wandtyp am Wandelement gespeichert', we1.wandtyp==='ohne_wind');
ok('[L-4] die neue Wand ist im Geschoss eingetragen — ohne erfundene Lage',
  store.wandVerortung(idOhneWind)?.geschoss.id === gs0
  && store.wandVerortung(idOhneWind).wand.lage === null);
ok('[L-10] die Wand des aktiven Geschosses wird dabei aktiv gesetzt', store.aktivId() === idOhneWind);
ok('Modul 0 zeigt die neue Wand ohne eigenes Zutun in der Baumliste',
  $('tr-baum').innerHTML.includes('Wand ohne Wind'));

wandAnlegen(gs0, { name:'Wand mit Wind', wandtyp:'mit_wind' });
ok('zweites Element mit eigenem Wandtyp', store.aktivesWandelement().wandtyp==='mit_wind');
ok('erstes Element behaelt seinen Wandtyp',
  store.listeElemente().find(e=>e.name==='Wand ohne Wind').wandelement.wandtyp==='ohne_wind');

// unsinnige Auswahl faellt auf den kompatiblen Standard zurueck
wandAnlegen(gs0, { name:'Wand kaputt', wandtyp:'quatsch' });
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
baum('wand-export', aktivId);
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

// --- 4b) Zentraler Export: Zeichnungs-Haekchen an der echten Oberflaeche (Issue #36) ---
ok('Export-Dialog hat das Zeichnungs-Haekchen (checked)',
  /<input type="checkbox" value="zeichnung" checked>/.test(html));
ok('Beschriftung nennt „Technische Zeichnung (SVG + HTML)"',
  /Technische Zeichnung \(SVG \+ HTML\)/.test(html));
ok('Modulkarte fuer Modul 7 vorhanden', /7:'Technische Zeichnung/.test(html));

// Derselbe Produktpfad, nur mit dem Zeichnungs-Haekchen.
zipCalls.length = 0;
baum('wand-export', aktivId);
$('exp-overlay')._sel = [{ value: 'zeichnung' }];
$('exp-go').dispatch('click');
const zBase = store.sicherName(store.projektObjekt(aktivId).name);
const zFiles = zipCalls.length ? zipCalls[0].files : [];
ok('Zeichnungs-Haekchen erzeugt genau zwei Dateien (SVG + HTML)', zFiles.length === 2);
const zSvg = zFiles.find(f => f.name.endsWith('.svg')) || { name: '', data: '' };
const zHtml = zFiles.find(f => f.name.endsWith('.html')) || { name: '', data: '' };
ok('Dateiname Zeichnung_<Projekt>.svg', zSvg.name === 'Zeichnung_' + zBase + '.svg');
ok('Dateiname Zeichnung_<Projekt>.html', zHtml.name === 'Zeichnung_' + zBase + '.html');
ok('SVG ist masstabsgetreu (mm-Masse im Wurzelelement)',
  /^<\?xml/.test(zSvg.data) && /<svg[^>]*width="[\d.]+mm"/.test(zSvg.data) && /height="[\d.]+mm"/.test(zSvg.data));
ok('HTML ist ein selbsttragendes, druckbares Blatt',
  /^<!DOCTYPE html>/.test(zHtml.data) && /@page\{size:A[34] landscape/.test(zHtml.data) && /ztitleblock/.test(zHtml.data));
ok('Blatt kennzeichnet die Vorspann-Zielregeln als ungeprueft',
  /nicht automatisch geprüft/.test(zHtml.data));
ok('Blatt behauptet keinen Nachweis',
  /separat prüfen/.test(zHtml.data) && !/bestanden/i.test(zHtml.data));
ok('kein jsPDF/Fremd-Lib im Zeichnungspfad', !/jspdf/i.test(zHtml.data) && !/html2canvas/i.test(zHtml.data));
ok('Dialog schliesst nach dem Zeichnungs-Export', $('exp-overlay').hidden === true);

// --- 5) Bauteilkatalog (Issue #21) an der echten Modul-0-Oberflaeche -------
// Bedienhilfen: genau die Wege, die ein Nutzer nimmt (Felder setzen -> Button klicken).
const kat = () => store.holeKatalog();
const kProd = (id) => KAT.produkt(kat(), id);
const kAnzahl = () => (kat() ? kat().produkte.length : 0);
const kMsgTxt = () => $('k-msg').textContent;
const kFehler = () => $('k-msg').className === 'msg err';
/** Byte-Stand des Katalog-Slots — Grundlage aller Abbruchpruefungen ([P-16]). */
const kSlot = () => localStorage.getItem('sembla:kataloge');
/** Zeilenaktion der Produkttabelle (Ereignisdelegation wie im Browser). */
function kZeile(act, pid){ $('k-tbody').dispatch('click', { target: { dataset:{ act, pid } } }); }

// --- Produktpflege-Dialog ([P-16], Issue #34) ------------------------------
// Alles laeuft ueber die echten Bedienelemente: „Produkt anlegen…" bzw. eine Zeilenaktion
// oeffnet den Dialog, die Maske wird vom Produktcode je Kategorie gerendert, gespeichert
// wird nur ueber #kp-speichern.
const kpOffen = () => $('kp-overlay').hidden === false;
const kpMsgTxt = () => $('kp-msg').textContent;
const kpFehler = () => $('kp-msg').className === 'msg err';
const kpTitel = () => $('kp-titel').textContent;
const kpMarkup = () => $('kp-felder').innerHTML;
/** Tatsaechlich gerenderte Maskenfelder in Reihenfolge (aus dem echten Dialogmarkup). */
const kpFelder = () => [...kpMarkup().matchAll(/id="kp-f-([a-z_]+)"/g)].map(m => m[1]);
const kpNeu = () => $('k-produkt-neu').dispatch('click');
const kpSpeichern = () => $('kp-speichern').dispatch('click');
const kpAbbrechen = () => $('kp-cancel').dispatch('click');
/** Kategorie im Dialog waehlen (echtes change-Ereignis: Maske + Preisbasen neu). */
function kpKategorie(id){ $('kp-kat').value = id; $('kp-kat').dispatch('change'); }
/** Grundfelder + Maskenfelder setzen; nicht genannte Maskenfelder werden geleert. */
function kpSetze({ bez = '', id = '', preis = '', einheit = null, ...felder }){
  $('kp-bez').value = String(bez); $('kp-id').value = String(id); $('kp-preis').value = String(preis);
  if (einheit) $('kp-einheit').value = einheit;
  for (const f of kpFelder()) $('kp-f-' + f).value = String(felder[f] != null ? felder[f] : '');
}

// 5a) Oberflaeche ist vorhanden und kommuniziert die Trennung/Nicht-Wirksamkeit
ok('Katalogpflege liegt als Popup in Modul 0 ([L-12])',
  /<div class="overlay" id="kat-overlay" hidden>/.test(html) && /<h3>Bauteilkatalog<\/h3>/.test(html)
  && !/<h2>Bauteilkatalog/.test(html));
ok('Kategorie-, Preisbasis- und Filterauswahl vorhanden',
  /<select id="kp-kat"/.test(html) && /<select id="kp-einheit"/.test(html) && /<select id="k-filter"/.test(html));
ok('Produktpflege liegt in einem eigenen Dialog/Overlay ([P-16])',
  /<div class="overlay" id="kp-overlay" hidden>/.test(html) && /id="kp-felder"/.test(html)
  && /id="kp-speichern">Speichern</.test(html) && /id="kp-cancel">Abbrechen</.test(html)
  && /id="k-produkt-neu">Produkt anlegen…</.test(html));
ok('keine generische Inline-Eingabezeile mehr in der Produktuebersicht',
  !/id="k-gewinde"/.test(html) && !/id="k-add"/.test(html) && !/id="k-form-titel"/.test(html)
  && !/id="kf-breite"/.test(html) && !/Breite \(mm\)/.test(html));
ok('Hinweis nennt Dialog, kategoriegerechte Felder und „nur Speichern schreibt"',
  /eigenen Dialog/.test(html) && /fachlich passenden Feldern/.test(html)
  && /Nur „Speichern“ schreibt/.test(html) && /\[P-16\]/.test(html));
ok('separater Katalog-Import und -Export als eigene Bedienelemente',
  /id="k-import"[^>]*type="file"/.test(html) && /id="k-export"/.test(html) && /id="k-neu"/.test(html));
ok('Projekt-ZIP-Dialog hat KEIN Katalog-Haekchen (Formate nicht verwechseln)',
  !/type="checkbox" value="katalog"/.test(html));
ok('Hinweis nennt eigenes Dateiformat und Trennung vom Projekt',
  /SEMBLA-Bauteilkatalog<\/b>, Format-Version&nbsp;1/.test(html)
  && /getrennt vom Projekt-Export/.test(html));
ok('Hinweis nennt Modul 0 als alleinigen Pflegeort und Modul 1/2 als Auswahlort',
  /Modul 0 ist der alleinige Pflegeort/.test(html)
  && /<b>Modul&nbsp;1<\/b>/.test(html) && /<b>Modul&nbsp;2<\/b>/.test(html));
ok('Hinweis stellt klar, dass die Katalogpreise jetzt mitrechnen (kein Nullpreis)',
  /Diese Preise rechnen mit/.test(html) && /ohne Preis<\/b> mit benanntem Grund/.test(html)
  && !/rechnet noch nicht mit/.test(html));
ok('keine zentrale Produktauswahl-UI mehr in Modul 0 ([P-13])',
  !/data-act="auswahl"/.test(html) && !/<th>Für Projekt<\/th>/.test(html)
  && !/Häkchen „Für Projekt/.test(html));
ok('Modul 0 hat keinen Schreibweg fuer die alte Auswahl mehr',
  typeof store.setzeKatalogAuswahl === 'undefined' && !/setzeKatalogAuswahl/.test(html));

// 5b) Katalog neu anlegen
ok('vor der Anlage ist kein Katalog geladen', kat() === null);
$('k-name').value = 'Katalog Musterlieferant';
$('k-neu').dispatch('click');
ok('Katalog angelegt (leer, mit Namen)', !!kat() && kat().name === 'Katalog Musterlieferant' && kAnzahl() === 0);
ok('Kopfzeile meldet Katalogformat v1', /Katalogformat v1/.test($('k-info').textContent));

// 5c) Gewindestange anlegen — kategoriegerechte Maske + Vorschlags-ID ([P-16])
const slotVorAnlage = kSlot();
kpNeu();
ok('„Produkt anlegen…" oeffnet den getrennten Dialog',
  kpOffen() && kpTitel() === 'Produkt anlegen' && kpMsgTxt() === '');
kpKategorie('gewindestange');
ok('Gewindestange: Maske ist Gewinde/Güte/Stangenlänge — keine Breite/Höhe/Dicke',
  kpFelder().join() === 'gewinde,guete,laenge_mm');
ok('Gewindestange: fachliche Beschriftung, Einheit und Pflichtkennzeichen',
  /<label for="kp-f-gewinde">Gewinde <span class="muted">· Pflicht<\/span><\/label>/.test(kpMarkup())
  && /Stangenlänge \(mm\) <span class="muted">· Pflicht<\/span>/.test(kpMarkup())
  && /placeholder="M10"/.test(kpMarkup()) && />Güte</.test(kpMarkup()));
ok('offener Dialog hat noch nichts geschrieben', kSlot() === slotVorAnlage && kAnzahl() === 0);
kpSetze({ einheit:'Stk', preis:'3.80', gewinde:'M10', guete:'8.8', laenge_mm:'1100' });
kpSpeichern();
const rod = kProd('gewindestange-m10-1100');
ok('Gewindestange ueber den echten Dialog angelegt', kAnzahl() === 1 && !!rod);
ok('Dialog schliesst nach dem Speichern', !kpOffen());
ok('Gewindestange: Gewinde/Laenge/Preisbasis/Preis gespeichert',
  rod.gewinde === 'M10' && rod.guete === '8.8' && rod.laenge_mm === 1100
  && rod.einheit === 'Stk' && rod.preis === 3.8);
ok('Gewindestange: Bezeichnung vorgeschlagen', /Gewindestange M10 1100 mm/.test(rod.bezeichnung));
ok('Rueckmeldung bestaetigt die Anlage', /Produkt angelegt/.test(kMsgTxt()) && !kFehler());

// 5d) Zwei Latten (zwei Standardlaengen derselben Kategorie), Preisbasis €/m
kpNeu();
kpKategorie('latte');
ok('Latte: Maske ist Querschnitt + Standardlänge — keine Höhe',
  kpFelder().join() === 'breite_mm,dicke_mm,laenge_mm');
ok('Latte: Querschnitt und Standardlänge fachlich beschriftet',
  /Querschnitt Breite \(mm\)/.test(kpMarkup()) && /Querschnitt Dicke \(mm\)/.test(kpMarkup())
  && /Standardlänge \(mm\)/.test(kpMarkup()) && !/kp-f-hoehe_mm/.test(kpMarkup())
  && !/kp-f-gewinde/.test(kpMarkup()));
kpSetze({ einheit:'m', preis:'1.25', breite_mm:'40', dicke_mm:'60', laenge_mm:'3000' });
kpSpeichern();
kpNeu();
kpKategorie('latte');
kpSetze({ einheit:'m', preis:'1.19', breite_mm:'40', dicke_mm:'60', laenge_mm:'5000' });
kpSpeichern();
ok('zwei Latten angelegt', kAnzahl() === 3 && !!kProd('latte-40-60-3000') && !!kProd('latte-40-60-5000'));
ok('Latte: Preisbasis €/m und Querschnitt gespeichert',
  kProd('latte-40-60-3000').einheit === 'm' && kProd('latte-40-60-3000').breite_mm === 40
  && kProd('latte-40-60-3000').dicke_mm === 60 && kProd('latte-40-60-5000').laenge_mm === 5000);

// 5e) Platte (Beplankung) mit Preisbasis €/m² — dritte, klar andere Maske
kpNeu();
kpKategorie('beplankung');
ok('Beplankung: Plattenmaße ohne Gewinde- und Längenfeld',
  kpFelder().join() === 'breite_mm,hoehe_mm,dicke_mm'
  && /Plattenbreite \(mm\)/.test(kpMarkup()) && /Plattenhöhe \(mm\)/.test(kpMarkup())
  && /Plattendicke \(mm\)/.test(kpMarkup()) && !/kp-f-gewinde/.test(kpMarkup())
  && !/kp-f-laenge_mm/.test(kpMarkup()));
kpSetze({ id:'platte-gk-125', einheit:'m2', preis:'6.90',
          breite_mm:'1250', hoehe_mm:'2000', dicke_mm:'12.5' });
kpSpeichern();
const platte = kProd('platte-gk-125');
ok('Platte mit eigener ID angelegt', kAnzahl() === 4 && !!platte);
ok('Platte: Flaechenmaße + €/m² gespeichert',
  platte.breite_mm === 1250 && platte.hoehe_mm === 2000 && platte.dicke_mm === 12.5 && platte.einheit === 'm2');

// 5e2) Weitere Kategorien: Stein mit Preiszuordnungsmaß, Verbinder/Verbrauch ohne Maße
kpNeu();
kpKategorie('stein');
ok('Stein: Maße optional, Steinbreite als Preiszuordnungsmaß benannt',
  kpFelder().join() === 'breite_mm,hoehe_mm,dicke_mm'
  && /Steinbreite \(mm\)<\/label>/.test(kpMarkup())
  && /maßgebend für die Preiszuordnung der Steinpositionen/.test(kpMarkup())
  && !/Pflicht/.test(kpMarkup()));
kpKategorie('verbinder');
ok('Verbinder: keine fachfremden Maßfelder', kpFelder().length === 0 && $('kp-leer').hidden === false);
kpKategorie('verbrauch');
ok('Verbrauchsmaterial: keine fachfremden Maßfelder', kpFelder().length === 0);
ok('Verbrauchsmaterial: kein Gewinde-/Güte-Feld (bewusst ausserhalb #34)',
  !/kp-f-gewinde/.test(kpMarkup()) && !/kp-f-guete/.test(kpMarkup()));
kpAbbrechen();
ok('Abbruch nach Kategoriewechseln legt nichts an', kAnzahl() === 4 && !kpOffen());

// 5f) Unvollstaendige/unzulaessige Eingabe: Meldung IM Dialog, nichts gespeichert
const slotVorFehler = kSlot();
kpNeu();
kpKategorie('latte');
kpSetze({ einheit:'m', preis:'1.00', breite_mm:'40', dicke_mm:'60' });   // Standardlaenge fehlt
kpSpeichern();
ok('Latte ohne Standardlaenge wird abgelehnt',
  kAnzahl() === 4 && kpFehler() && /laenge_mm/.test(kpMsgTxt()) && kSlot() === slotVorFehler);
ok('Dialog bleibt zur Korrektur offen', kpOffen());
kpSetze({ einheit:'m2', preis:'1.00', breite_mm:'40', dicke_mm:'60', laenge_mm:'3000' });
kpSpeichern();                                                    // €/m² ist fuer Latten unzulaessig
ok('unzulaessige Preisbasis wird abgelehnt',
  kAnzahl() === 4 && kpFehler() && /nicht zulässig/.test(kpMsgTxt()) && kSlot() === slotVorFehler);
kpSetze({ id:'latte-40-60-5000', einheit:'m', preis:'1.00',
          breite_mm:'40', dicke_mm:'60', laenge_mm:'3000' });
kpSpeichern();
ok('bereits vergebene ID wird abgelehnt',
  kAnzahl() === 4 && kpFehler() && /bereits vergeben/.test(kpMsgTxt()) && kSlot() === slotVorFehler);
kpAbbrechen();
ok('Abbrechen nach Fehlern laesst den Katalog unveraendert',
  kSlot() === slotVorFehler && !kpOffen() && /kein Produkt angelegt/.test(kMsgTxt()) && !kFehler());

// 5g) Bearbeiten ueber die Tabelle — Dialog vorbelegt, Speichern ist der einzige Schreibweg
kZeile('bearbeiten', 'latte-40-60-3000');
ok('Bearbeiten oeffnet den Dialog mit dem Produkt',
  kpOffen() && kpTitel() === 'Produkt bearbeiten: ' + kProd('latte-40-60-3000').bezeichnung
  && $('kp-bez').value === kProd('latte-40-60-3000').bezeichnung
  && $('kp-preis').value === '1.25' && $('kp-id').value === 'latte-40-60-3000');
ok('Bearbeiten fuellt auch die kategoriespezifischen Felder',
  $('kp-f-breite_mm').value === '40' && $('kp-f-dicke_mm').value === '60'
  && $('kp-f-laenge_mm').value === '3000');
// Abbruch im Bearbeitungsmodus: geaenderte Werte werden verworfen
const slotVorEdit = kSlot();
$('kp-preis').value = '99.00';
kpAbbrechen();
ok('Abbrechen verwirft die Aenderung vollstaendig',
  kSlot() === slotVorEdit && kProd('latte-40-60-3000').preis === 1.25 && !kpOffen()
  && /Bearbeitung abgebrochen/.test(kMsgTxt()));
kZeile('bearbeiten', 'latte-40-60-3000');
$('kp-preis').value = '1.35';
kpSpeichern();
ok('Preisaenderung gespeichert (kein neues Produkt)',
  kAnzahl() === 4 && kProd('latte-40-60-3000').preis === 1.35 && !kpOffen());
ok('Bearbeiten laesst die uebrigen Felder unveraendert',
  kProd('latte-40-60-3000').breite_mm === 40 && kProd('latte-40-60-3000').dicke_mm === 60
  && kProd('latte-40-60-3000').laenge_mm === 3000 && kProd('latte-40-60-3000').einheit === 'm');

// 5g2) Escape und Klick neben den Dialog brechen ebenfalls ohne Schreibvorgang ab
kZeile('bearbeiten', 'latte-40-60-3000');
const slotVorEsc = kSlot();
$('kp-preis').value = '77.00';
document.dispatch('keydown', { key:'Escape' });
ok('Escape bricht die Bearbeitung ohne Schreibvorgang ab',
  !kpOffen() && kSlot() === slotVorEsc && kProd('latte-40-60-3000').preis === 1.35);
kZeile('bearbeiten', 'latte-40-60-3000');
$('kp-preis').value = '88.00';
$('kp-overlay').dispatch('click', { target: $('kp-overlay') });
ok('Klick neben den Dialog bricht ohne Schreibvorgang ab',
  !kpOffen() && kSlot() === slotVorEsc && kProd('latte-40-60-3000').preis === 1.35);

// 5h) Duplizieren: die Kopie entsteht ERST beim Speichern ([P-16])
const slotVorDup = kSlot();
kZeile('duplizieren', 'latte-40-60-3000');
ok('Duplizieren oeffnet nur den vorbelegten Dialog',
  kpOffen() && kpTitel() === 'Produkt duplizieren: ' + kProd('latte-40-60-3000').bezeichnung + ' (Kopie)'
  && $('kp-id').value === 'latte-40-60-3000-kopie' && /\(Kopie\)/.test($('kp-bez').value));
ok('Duplizieren schreibt noch NICHTS in den Katalog',
  kAnzahl() === 4 && !kProd('latte-40-60-3000-kopie') && kSlot() === slotVorDup);
kpAbbrechen();
ok('Abbrechen nach Duplizieren legt keine Kopie an',
  kAnzahl() === 4 && !kProd('latte-40-60-3000-kopie') && kSlot() === slotVorDup
  && /Duplizieren abgebrochen/.test(kMsgTxt()));
kZeile('duplizieren', 'latte-40-60-3000');
kpSpeichern();
ok('erst Speichern legt die Kopie an',
  kAnzahl() === 5 && !!kProd('latte-40-60-3000-kopie') && !kpOffen()
  && /Kopie angelegt/.test(kMsgTxt()));
ok('die Kopie traegt die Werte des Originals',
  kProd('latte-40-60-3000-kopie').preis === 1.35 && kProd('latte-40-60-3000-kopie').laenge_mm === 3000
  && kProd('latte-40-60-3000-kopie').einheit === 'm');

// 5h2) Kategoriewechsel im Dialog: fachfremde Maßfelder werden benannt und beim Speichern entfernt
kZeile('bearbeiten', 'latte-40-60-3000-kopie');
kpKategorie('verbinder');
ok('Kategoriewechsel benennt die fachfremden Felder sichtbar',
  $('kp-extra').hidden === false && /fachfremde Felder/.test($('kp-extra').innerHTML)
  && /breite_mm/.test($('kp-extra').innerHTML) && /laenge_mm/.test($('kp-extra').innerHTML));
kpAbbrechen();
ok('Abbruch nach Kategoriewechsel aendert das Produkt nicht',
  kProd('latte-40-60-3000-kopie').kategorie === 'latte'
  && kProd('latte-40-60-3000-kopie').laenge_mm === 3000);

// 5i) Loeschen (nur mit Bestaetigung)
confirmAntwort = false;
kZeile('produkt-loeschen', 'latte-40-60-3000-kopie');
ok('Loeschen ohne Bestaetigung passiert nicht', kAnzahl() === 5);
confirmAntwort = true;
kZeile('produkt-loeschen', 'latte-40-60-3000-kopie');
ok('Loeschen mit Bestaetigung entfernt das Produkt', kAnzahl() === 4 && !kProd('latte-40-60-3000-kopie'));

// 5j) Modul 0 pflegt NUR den Produktstamm — die wandbezogene Auswahl gehoert Modul 1/2 ([P-13]).
// Hier wird sie nur vorbereitet (ueber die Storage-Schicht, wie Modul 1/2 sie aufrufen), damit
// die Persistenz-, Export- und Altbestandspruefungen darunter einen realistischen Stand haben.
const aktivKat = store.aktivId();
ok('Ausgangslage: keine Produktauswahl am aktiven Element',
  KAT.anzahlAuswahl(KAT.produktRollen(store.aktiveEingaben())) === 0);
ok('Produkttabelle in Modul 0 zeigt keine Auswahlspalte',
  !/data-act="auswahl"/.test($('k-tbody').innerHTML) && /data-act="bearbeiten"/.test($('k-tbody').innerHTML));
store.setzeProduktrolle('latte', ['latte-40-60-3000', 'latte-40-60-5000']);
store.setzeProduktrolle('rod_std', ['gewindestange-m10-1100']);
store.setzeProduktrolle('beplankung', ['platte-gk-125']);
ok('Auswahl liegt in den Abschnitten der besitzenden Module',
  store.holeProdukte(2, aktivKat).rollen.latte.length === 2
  && store.holeProdukte(1, aktivKat).rollen.rod_std.length === 1
  && store.holeProdukte(2, aktivKat).rollen.beplankung.length === 1);
ok('Auswahl speichert nur IDs, keine Preise/Maße',
  !JSON.stringify(store.aktiveEingaben().planung).includes('1.35')
  && !JSON.stringify(store.aktiveEingaben().aufbau.produkte).includes('breite_mm'));
ok('Wandelement bleibt frei von Katalogdaten (Ownership Modul 1)',
  !JSON.stringify(store.aktivesWandelement()).includes('latte-40-60-3000'));

// 5k) Persistenz „nach Reload": alles steht im localStorage, nichts nur im DOM
ok('Katalog liegt im eigenen localStorage-Schluessel ([L-12]: Speicher je Kennung)',
  Object.values(JSON.parse(localStorage.getItem('sembla:kataloge')))
    .find(k => k.id === kat().id).produkte.length === 4);
ok('Auswahl liegt am Element im Projektstand',
  JSON.parse(localStorage.getItem('sembla:elemente'))[aktivKat].eingaben.aufbau.produkte.rollen.latte.length === 2);
ok('Auswahl ist nach erneutem Laden wieder da (store liest frisch)',
  store.holeProdukte(2, aktivKat).rollen.beplankung[0] === 'platte-gk-125');
ok('Projekt-JSON traegt die Auswahl, Format bleibt v2',
  store.projektObjekt(aktivKat).eingaben.aufbau.produkte.rollen.latte.length === 2
  && store.projektObjekt(aktivKat).eingaben.planung.produkte.rollen.rod_std.length === 1
  && store.projektObjekt(aktivKat).version === 2);

// 5l) Separater Katalog-Export (eigene Datei, nicht im Projekt-ZIP)
const zipVorher = zipCalls.length;
$('k-export').dispatch('click');
const kExpDatei = JSON.parse(letzterDownload);
ok('Katalog-Export erzeugt eigene JSON-Datei mit Katalogformat v1',
  kExpDatei.format === 'SEMBLA-Bauteilkatalog' && kExpDatei.version === 1 && kExpDatei.produkte.length === 4);
ok('Katalog-Export enthaelt kein Projekt/Wandelement',
  !('wandelement' in kExpDatei) && !('eingaben' in kExpDatei) && !('geaendert' in kExpDatei));
ok('Katalog-Dateiname ist klar unterscheidbar',
  /^SEMBLA_Bauteilkatalog_/.test(letzterAnker.download) && /\.json$/.test(letzterAnker.download));
ok('Katalog-Export laeuft NICHT ueber den Projekt-ZIP', zipCalls.length === zipVorher);

// 5m) Separater Katalog-Import (ersetzt den Slot) + Formatverwechslung
const fremdKatalog = JSON.stringify({
  format: 'SEMBLA-Bauteilkatalog', version: 1, name: 'Katalog Zweitlieferant',
  produkte: [{ id:'rod-m12-1500', kategorie:'gewindestange', bezeichnung:'Gewindestange M12 1500 mm',
               einheit:'Stk', preis:5.4, gewinde:'M12', laenge_mm:1500 }],
});
const kFile = (text, name) => ({ name, text: async () => text });
await $('k-import').dispatch('change', { target: { files:[kFile(fremdKatalog, 'fremd.json')], value:'x' } });
ok('Katalog-Import ersetzt den geladenen Katalog',
  kat().name === 'Katalog Zweitlieferant' && kAnzahl() === 1 && !!kProd('rod-m12-1500'));
ok('Katalogname erscheint im Eingabefeld', $('k-name').value === 'Katalog Zweitlieferant');
ok('Import meldet Erfolg', /Katalog importiert/.test(kMsgTxt()) && !kFehler());

await $('k-import').dispatch('change', {
  target: { files:[kFile(JSON.stringify(store.projektObjekt(aktivKat)), 'projekt.json')], value:'x' } });
ok('Projektdatei im Katalog-Import -> klare Meldung, Katalog unveraendert',
  kFehler() && /Projekt-\/Wandelement-Datei/.test(kMsgTxt()) && kAnzahl() === 1);

await $('f-import').dispatch('change', { target: { files:[kFile(fremdKatalog, 'fremd.json')], value:'x' } });
ok('Katalogdatei im Projekt-Import -> klare Meldung',
  /Bauteilkatalog/.test($('msg').textContent) && $('msg').className === 'msg err');

// 5n) Referenzen bleiben beim Katalogwechsel stehen (nie stille Bereinigung); die Meldung der
// unaufloesbaren Referenzen gehoert jetzt an die waehlenden Oberflaechen (Modul 1/2) und in
// Modul 4 — Modul 0 pflegt nur den Stamm.
ok('Auswahl wurde durch den Katalogwechsel NICHT bereinigt',
  store.holeProdukte(2, aktivKat).rollen.latte.length === 2);
ok('unaufloesbare Referenz ist nachweisbar (Meldung in Modul 1/2/4)',
  KAT.produkteZuRolle(store.holeEingaben(aktivKat), kat(), 'latte').fehlend.length === 2);

confirmAntwort = true;
$('k-entfernen').dispatch('click');
ok('Katalog entfernt, Referenzen bleiben stehen',
  kat() === null && store.holeProdukte(2, aktivKat).rollen.latte.length === 2);
ok('ohne Katalog ist keine Rolle aufloesbar (kein stiller Nullpreis)',
  KAT.rollenStatus('latte', store.holeEingaben(aktivKat), null, {}).status === 'kein_katalog');

// 5n2) Altbestand der frueheren zentralen Freigabe wird sichtbar als UNWIRKSAM gemeldet ([P-15])
store.mergeEingaben('katalog', { auswahl: { latte: ['alt-latte-1', 'alt-latte-2'] },
                                 quelle: { name: 'Alt-Katalog', version: 1 } }, aktivKat);
ok('Altbestand: Warnbox nennt ihn unwirksam und verweist auf Modul 1/2',
  $('k-warn').hidden === false && /Unwirksamer Altbestand/.test($('k-warn').innerHTML)
  && /2 Produktreferenz\(en\)/.test($('k-warn').innerHTML)
  && /Modul 1<\/b>/.test($('k-warn').innerHTML) && /Modul 2<\/b>/.test($('k-warn').innerHTML));
ok('Altbestand wird nicht angewendet und nicht in Rollen uebersetzt',
  !JSON.stringify(KAT.produktRollen(store.holeEingaben(aktivKat))).includes('alt-latte'));
ok('Altbestand bleibt zur Nachvollziehbarkeit erhalten',
  store.katalogAuswahl(aktivKat).latte.length === 2);

// 5o) Erstes Produkt ohne vorher angelegten Katalog legt einen Katalog an
$('k-name').value = 'Direktkatalog';
kpNeu();
kpKategorie('gewindestange');
kpSetze({ einheit:'Stk', preis:'9.90', gewinde:'M16', laenge_mm:'2000' });
kpSpeichern();
ok('Produktanlage ohne bestehenden Katalog erzeugt ihn',
  !!kat() && kat().name === 'Direktkatalog' && kAnzahl() === 1);

// 5p) Zentraler Projekt-ZIP-Export bleibt unveraendert katalogfrei, nutzt den Katalog aber als
// Preisquelle der Stueckliste ([P-14]) — dieselbe Auflösung wie Modul 4.
const projektDateien = baueDateien(store.projektObjekt(aktivKat), ['projekt','stueckliste'], kat());
// [P-19] Das Haekchen „Baustellenstueckliste" liefert ZWEI Dateien aus einer Ableitung:
// die aggregierte Liste und die Einzelteilliste der Gewindestangen mit ihren IDs.
ok('Projekt-ZIP enthaelt keine Katalog-Datei',
  projektDateien.length === 3 && !projektDateien.some(f => /Bauteilkatalog/.test(f.name)));
ok('[P-19] Projekt-ZIP: Baustellenstueckliste + Einbauteilliste',
  /^Baustellenstueckliste_/.test(projektDateien[1].name)
  && /^Einbauteile_Gewindestangen_/.test(projektDateien[2].name));
ok('Projekt-Datei traegt nur Produkt-IDs (keine Preise/Bezeichnungen)',
  (() => { const p = JSON.parse(projektDateien[0].data);
           return p.eingaben.aufbau.produkte.rollen.latte.length === 2
             && p.eingaben.planung.produkte.rollen.rod_std.length === 1
             && !JSON.stringify(p.eingaben.aufbau.produkte).includes('Latte 40')
             && !JSON.stringify(p.eingaben.planung.produkte).includes('preis'); })());
ok('Stueckliste-CSV traegt Produktzuordnung und Grund statt Nullpreisen',
  (() => { const csv = projektDateien[1].data;
           return /Produkt \(Katalog\);Preisbasis;Zuordnung/.test(csv)
             && /Bodenblech-Modul/.test(csv) && /Kopfblech-Modul/.test(csv); })());

// --- 6) Projekt-/Wandimport mit Bestaetigung (Issue #28) -------------------
// Alles ueber den ECHTEN Modul-0-Handler: Dateiauswahl an #f-import, Dialogfelder,
// #imp-go/#imp-cancel. Kern: vor der Bestaetigung wird NICHTS persistiert.
const anzahl = () => store.listeElemente().length;
const stand = () => localStorage.getItem('sembla:elemente');
/** Datei an der echten Oberflaeche auswaehlen (async-Handler abwarten). */
const impWaehle = (text, name) =>
  $('f-import').dispatch('change', { target: { files:[kFile(text, name)], value:'x' } });
const impInfo = () => $('imp-info').innerHTML;
const impFehler = () => $('imp-msg').className === 'msg err';
const msgTxt = () => $('msg').textContent;
/** v2-Projekt aus dem vorhandenen Stand ableiten und gezielt verbiegen. */
function v2Projekt(patch){
  const p = JSON.parse(JSON.stringify(store.projektObjekt(aktivKat)));
  if (patch.projektName !== undefined) p.eingaben.projekt.name = patch.projektName;
  if (patch.name !== undefined) p.name = patch.name;
  if (patch.weName !== undefined) p.wandelement.name = patch.weName;
  if (patch.wandtyp !== undefined) p.wandelement.wandtyp = patch.wandtyp;
  return JSON.stringify(p);
}

// 6a) Bestaetigungsdialog ist an der echten Oberflaeche vorhanden
ok('Import-Dialog mit Overlay vorhanden', /<div class="overlay" id="imp-overlay" hidden>/.test(html));
ok('Feld ist exakt „Name des Wandelements" beschriftet',
  /<label for="imp-name">Name des Wandelements<\/label>/.test(html) && /<input id="imp-name"/.test(html));
ok('Buttons „Importieren & aktiv setzen" und „Abbrechen"',
  /id="imp-go">Importieren &amp; aktiv setzen</.test(html) && /id="imp-cancel">Abbrechen</.test(html));

// 6b) Dateiauswahl parst nur — kein Element, kein aktiver Zeiger, aber sichtbarer Dialog
const anzahlVor = anzahl(), aktivVor = store.aktivId(), standVor = stand();
await impWaehle(v2Projekt({ projektName:'Musterprojekt Nord', weName:'Wand' }), 'export-2026.json');
ok('Dialog ist nach der Dateiauswahl sichtbar', $('imp-overlay').hidden === false);
ok('vor der Bestaetigung wird KEIN Element gespeichert', anzahl() === anzahlVor && stand() === standVor);
ok('vor der Bestaetigung bleibt der aktive Zeiger unveraendert', store.aktivId() === aktivVor);
ok('Namensvorschlag ist der Projektname aus der Datei', $('imp-name').value === 'Musterprojekt Nord');
ok('Dialog nennt die gelesene Datei', $('imp-datei').textContent === 'export-2026.json');
ok('Zusammenfassung zeigt die echten Wandmaße',
  impInfo().includes(store.holeElement(aktivKat).wandelement.length_mm + ' × '
                     + store.holeElement(aktivKat).wandelement.height_mm + ' mm'));
ok('Zusammenfassung zeigt den kanonisch beschrifteten Wandtyp',
  /Wandtyp \(Windsituation\)/.test(impInfo()) && /Innenwand mit Wind \(Cpi\)/.test(impInfo()));
ok('Zusammenfassung nennt die Öffnungszahl aus der Datei',
  /Öffnungen:<\/b> 0/.test(impInfo()));

// 6c) Abbrechen wirkt nicht und gibt die Dateiauswahl wieder frei
$('imp-cancel').dispatch('click');
ok('Abbrechen schliesst den Dialog', $('imp-overlay').hidden === true);
ok('Abbrechen legt kein Element an', anzahl() === anzahlVor && stand() === standVor);
ok('Abbrechen laesst den aktiven Zeiger unveraendert', store.aktivId() === aktivVor);
ok('Dateiauswahl ist zurueckgesetzt (dieselbe Datei erneut waehlbar)', $('f-import').value === '');

// 6d) Leerer Name wird sichtbar abgelehnt — weiterhin ohne Persistenz
await impWaehle(v2Projekt({ projektName:'Musterprojekt Nord', weName:'Wand' }), 'export-2026.json');
$('imp-name').value = '   ';
$('imp-go').dispatch('click');
ok('Whitespace-Name wird sichtbar abgelehnt', impFehler() && /Namen/.test($('imp-msg').textContent));
ok('abgelehnter Name speichert nichts', anzahl() === anzahlVor && stand() === standVor);
ok('Dialog bleibt zur Korrektur offen', $('imp-overlay').hidden === false);

// 6e) Bestaetigung: genau einmal speichern, aktiv setzen, Feedback, Hervorhebung, Scroll
const scrollVor = scrollAufrufe.length;
$('imp-name').value = '  Halle Ost  ';
$('imp-go').dispatch('click');
const neu = store.aktivesElement();
ok('Bestaetigung legt genau ein Element an', anzahl() === anzahlVor + 1);
ok('der editierte Name wird verwendet (getrimmt)', neu.name === 'Halle Ost');
ok('[L-10] das importierte Element ist aktiv (sein Geschoss ist aktiv)',
  store.aktivId() === neu.id && neu.id !== aktivVor);
ok('Dialog ist geschlossen', $('imp-overlay').hidden === true);
ok('sichtbares Erfolgsfeedback nennt Name, Import und den Ort in der Struktur',
  /Halle Ost/.test(trMsgTxt()) && /importiert/.test(trMsgTxt())
  && /eingetragen in Geschoss/.test(trMsgTxt()) && !trFehler());
ok('[L-4] die importierte Wand ist im Geschoss eingetragen — ohne erfundene Lage',
  store.wandVerortung(neu.id)?.geschoss.id === gs0 && store.wandVerortung(neu.id).wand.lage === null);
ok('neue Wand ist in der Baumliste hervorgehoben',
  new RegExp('class="knoten wand[^"]*neu" data-wand="' + neu.id + '"').test($('tr-baum').innerHTML));
ok('scrollIntoView wurde am neu gerenderten Datensatz aufgerufen',
  scrollAufrufe.length === scrollVor + 1 && scrollAufrufe[scrollAufrufe.length-1].id === neu.id);
ok('Import erhaelt die Eingaben der v2-Datei (Produktreferenzen je Rolle)',
  store.holeProdukte(2, neu.id).rollen.latte.length === 2
  && store.holeProdukte(1, neu.id).rollen.rod_std.length === 1
  && store.holeEingaben(neu.id).kosten.waehrung === store.holeEingaben(aktivKat).kosten.waehrung);
ok('Import erhaelt auch den unwirksamen Altbestand unveraendert ([P-15])',
  store.katalogAuswahl(neu.id).latte.length === 2);
ok('Projektname der Datei bleibt in den Eingaben stehen',
  store.holeEingaben(neu.id).projekt.name === 'Musterprojekt Nord');
ok('Wandelement kommt unveraendert aus der Datei',
  store.aktivesWandelement().length_mm === store.holeElement(aktivKat).wandelement.length_mm);

// Nochmals klicken darf nicht ein zweites Mal speichern
$('imp-go').dispatch('click');
ok('erneuter Klick speichert nicht doppelt', anzahl() === anzahlVor + 1);

// Spaetere Aenderungen scrollen nicht erneut (nur der Import holt die Zeile in den Blick)
const scrollNachImport = scrollAufrufe.length;
store.mergeEingaben('kosten', { waehrung: 'CHF' }, neu.id);
ok('Hervorhebung bleibt, aber es wird nicht erneut gescrollt',
  scrollAufrufe.length === scrollNachImport
  && new RegExp('data-wand="' + neu.id + '"').test($('tr-baum').innerHTML));

// 6f) Namensfallback: generischer Elementname -> Dateiname ohne .json
await impWaehle(v2Projekt({ projektName:'', name:'Wand', weName:'Wandelement' }), 'Kellerwand West.json');
ok('generische Namen werden verworfen -> Dateiname ohne .json',
  $('imp-name').value === 'Kellerwand West');
$('imp-cancel').dispatch('click');

// Sinnvoller expliziter Elementname schlaegt den Dateinamen
await impWaehle(v2Projekt({ projektName:'   ', name:'Wand C', weName:'Wand' }), 'irgendwas.json');
ok('expliziter Elementname wird vor dem Dateinamen vorgeschlagen', $('imp-name').value === 'Wand C');
$('imp-cancel').dispatch('click');

// 6g) Wandtyp „ohne Wind" wird kanonisch beschriftet
await impWaehle(v2Projekt({ projektName:'Wand ohne Wind Nord', wandtyp:'ohne_wind' }), 'ohnewind.json');
ok('Wandtyp ohne_wind kanonisch beschriftet', /Innenwand ohne Wind/.test(impInfo()));
$('imp-cancel').dispatch('click');

// 6h) Rohes Wandelement (aeltestes Format) laeuft weiter durch den Dialog
const rohWe = JSON.parse(JSON.stringify(store.holeElement(aktivKat).wandelement));
rohWe.name = 'Wand';
await impWaehle(JSON.stringify(rohWe), 'Rohwand.json');
ok('rohes Wandelement oeffnet den Dialog mit Dateinamen-Vorschlag',
  $('imp-overlay').hidden === false && $('imp-name').value === 'Rohwand');
$('imp-go').dispatch('click');
ok('rohes Wandelement wird nach Bestaetigung gespeichert und aktiv',
  anzahl() === anzahlVor + 2 && store.aktivesElement().name === 'Rohwand');

// 6i) Alt-Bundle (format ohne version, projekt-Block) bleibt unterstuetzt
const altBundle = JSON.stringify({
  format:'SEMBLA-Projekt', wandelement: rohWe,
  projekt:{ name:'Altprojekt Süd', bauherr:'Alt-Bauherr' },
});
await impWaehle(altBundle, 'alt-bundle.json');
ok('Alt-Bundle: Projektname aus dem projekt-Block vorgeschlagen', $('imp-name').value === 'Altprojekt Süd');
$('imp-go').dispatch('click');
const altNeu = store.aktivesElement();
ok('Alt-Bundle importiert und aktiv', anzahl() === anzahlVor + 3 && altNeu.name === 'Altprojekt Süd');
ok('Alt-Bundle: Kopfdaten bleiben erhalten',
  store.holeEingaben(altNeu.id).projekt.bauherr === 'Alt-Bauherr');
ok('Alt-Bundle: Wandtyp wird beim Import normalisiert',
  store.WANDTYPEN.includes(store.aktivesWandelement().wandtyp));

// 6j) Overlay-Klick und Escape brechen ab, ohne etwas zu schreiben
const anzahlN = anzahl(), aktivN = store.aktivId(), standN = stand();
await impWaehle(v2Projekt({ projektName:'Verworfen A' }), 'verworfen-a.json');
$('imp-overlay').dispatch('click', { target: $('imp-overlay') });
ok('Klick auf das Overlay bricht ab', $('imp-overlay').hidden === true
  && anzahl() === anzahlN && store.aktivId() === aktivN && standN === stand());

await impWaehle(v2Projekt({ projektName:'Verworfen B' }), 'verworfen-b.json');
document.dispatch('keydown', { key:'Escape' });
ok('Escape bricht ab', $('imp-overlay').hidden === true
  && anzahl() === anzahlN && store.aktivId() === aktivN && standN === stand());

// 6k) Unlesbare/falsche Dateien: Fehler an der Startseite, kein Dialog, kein Element
await impWaehle('{ kein json', 'kaputt.json');
ok('kaputte Datei -> Fehlermeldung, kein Dialog',
  $('imp-overlay').hidden === true && $('msg').className === 'msg err'
  && /Import fehlgeschlagen/.test(msgTxt()) && anzahl() === anzahlN);
await impWaehle(JSON.stringify({ foo:1 }), 'fremd.json');
ok('Datei ohne Wandelement -> Fehlermeldung, kein Dialog',
  $('imp-overlay').hidden === true && /Wandelement/.test(msgTxt()) && anzahl() === anzahlN);
ok('nach Fehler ist die Dateiauswahl wieder frei', $('f-import').value === '');

// --- 7) Repo-Vorlagen: Standardkatalog + AWG-Musterwand (Issue #33) --------
// Geuebt werden die ECHTEN Modul-0-Handler (#k-vorlage, #btn-vorlage-wand) gegen die
// ECHTEN Dateien unter docs/vorlagen/. Kein Fixture, keine vertraulichen Daten:
// beide Vorlagen liegen als gewoehnliche, oeffentliche Repo-Dateien im Checkout.
const vorlagenBasis = new URL("../../docs/vorlagen/", import.meta.url);
const vorlageDatei = (name) => readFileSync(new URL(name, vorlagenBasis), "utf8");
const V_WAND = "SEMBLA_Musterwand.json", V_KAT = "SEMBLA_Standardkatalog.json";

/** fetch-Ersatz: liefert genau die Repo-Vorlagen (wie der Browser von GitHub Pages). */
const fetchLog = [];
function installFetch(){
  globalThis.fetch = async (pfad) => {
    fetchLog.push(String(pfad));
    const m = /^\.\/vorlagen\/(.+)$/.exec(String(pfad));
    if (!m) return { ok:false, status:404, text: async () => "" };
    try { const t = vorlageDatei(m[1]); return { ok:true, status:200, text: async () => t }; }
    catch { return { ok:false, status:404, text: async () => "" }; }
  };
}
installFetch();

// 7a) Bedienelemente sind an der echten Oberflaeche vorhanden
ok('Button „Standardkatalog laden" im Katalog-Abschnitt',
  /<button class="btn-s" id="k-vorlage">Standardkatalog laden<\/button>/.test(html));
ok('Button „Musterwand laden…" im Wand-Dialog',
  /<button class="btn-s" id="btn-vorlage-wand">Musterwand laden…<\/button>/.test(html));
ok('Hinweis nennt beide Vorlagen als bewusst zu ladende Repo-Dateien',
  /vorlagen\/SEMBLA_Musterwand\.json/.test(html) && /vorlagen\/SEMBLA_Standardkatalog\.json/.test(html)
  && /bewusst auf Klick, nie/.test(html));
ok('Hinweis kennzeichnet die vorlaeufigen Katalogwerte',
  /vorläufige, fachlich unbestätigte Beispielwerte/.test(html));

// 7b) Die Vorlagendateien selbst: valide, versioniert, Ressourcen getrennt
const katRoh = JSON.parse(vorlageDatei(V_KAT));
const wandRoh = JSON.parse(vorlageDatei(V_WAND));
ok('Katalogvorlage traegt Katalogformat v1',
  katRoh.format === 'SEMBLA-Bauteilkatalog' && katRoh.version === KAT.KATALOG_VERSION);
ok('Katalogvorlage ist gegen den echten Validator fehlerfrei',
  KAT.validiereKatalog(katRoh).length === 0 && KAT.parseKatalog(vorlageDatei(V_KAT)).produkte.length === 20);
ok('Katalogvorlage enthaelt kein Wandelement/Projekt (Ressourcentrennung)',
  !('wandelement' in katRoh) && !('eingaben' in katRoh) && !('courses' in katRoh));
ok('jede Katalogkategorie ist belegt',
  KAT.KATEGORIEN.every(k => katRoh.produkte.some(p => p.kategorie === k.id)));
ok('Katalogname weist die vorlaeufigen Werte aus', /vorläufig — fachlich unbestätigt/.test(katRoh.name));
ok('jedes vorlaeufige Produkt ist einzeln gekennzeichnet',
  katRoh.produkte.filter(p => /\(vorläufig\)/.test(p.bezeichnung)).length === 10
  && katRoh.produkte.filter(p => /\(vorläufig\)/.test(p.bezeichnung))
       .every(p => (p.hinweis || '').startsWith('vorläufig — fachlich unbestätigt')));
ok('Wandvorlage traegt Projektformat v2 (kein Formatbump)',
  wandRoh.format === 'SEMBLA-Projekt' && wandRoh.version === store.PROJEKT_VERSION);
ok('Wandvorlage enthaelt keinen Produktstamm (Ressourcentrennung)',
  !('produkte' in wandRoh) && !JSON.stringify(wandRoh).includes('SEMBLA-Bauteilkatalog'));

// 7c) Kanonische AWG-Geometrie: heutiger Core aus denselben fachlichen Eingaben
const wv = wandRoh.wandelement;
const neuGebaut = buildWall(wandRoh.name, wv.length_mm, wv.height_mm, wv.openings, wv.sides, wv.prestress, wv.steps);
ok('Wandelement der Vorlage ist exakt die Ausgabe des heutigen Cores',
  JSON.stringify(neuGebaut) === JSON.stringify(wv));
// Harte Erwartungswerte aus dem freigegebenen AWG-Anhang (Identitaetsnachweis ohne Anhangdatei)
ok('AWG-Maße/Raster unveraendert',
  wv.length_mm === 3000 && wv.height_mm === 2600 && wv.thickness_mm === 125
  && wv.grid_mm === 125 && wv.course_mm === 200 && wv.N_grid === 24 && wv.lagen === 13);
ok('AWG-Vorspannvorgaben unveraendert',
  wv.rod_mm === 1000 && wv.prestress.max_span_grid === 3 && wv.prestress.force_kN === 50
  && wv.prestress.rod_mm === 1000);
ok('AWG-Staffelung (3 Stufen) unveraendert',
  wv.steps.length === 3 && wv.steps[0].height_mm === 2200 && wv.steps[1].height_mm === 1800
  && wv.steps[2].height_mm === 1400 && wv.openings.length === 0);
// Die Spannachsen folgen seit [V-2]/[V-3] der Steinabdeckung statt der reinen Abstands-
// verteilung: aus 12 Achsen des AWG-Anhangs werden 14. Die AWG-EINGABEN (Geometrie, Staffelung,
// Vorspannvorgaben) sind unveraendert — nur die abgeleitete Achsenlage folgt dem neuen Regelstand.
ok('AWG-Spannachsen nach [V-2]/[V-3] (14 Achsen, jeder Stein gehalten)',
  wv.tension_columns.map(c => c.x_mm).join(',')
  === '62.5,437.5,562.5,937.5,1187.5,1312.5,1562.5,1687.5,1937.5,2187.5,2312.5,2437.5,2687.5,2937.5'
  && wv.tension_columns.map(c => c.k).join(',') === '0,3,4,7,9,10,12,13,15,17,18,19,21,23');
ok('AWG-Tiling unveraendert (Kernmengen des Anhangs)',
  wv.bom.i2 === 20 && wv.bom.i3 === 70);
ok('AWG-Vorspannmengen folgen den 14 Achsen',
  wv.bom.gewindestangen === 35 && wv.bom.verbindungsmuttern === 21 && wv.bom.verschnitt_mm === 6600);
ok('AWG-Wand erfuellt die Muss-Regel [V-2] (kein ungehaltener Stein)',
  wv.validation.ungehaltene_steine.length === 0);
ok('AWG-Wand ist baubar geprueft', wv.validation.buildable === true && wv.validation.tension_span_ok === true);
ok('veraltete abgeleitete Daten NICHT uebernommen (keine gespeicherte verification)',
  !('verification' in wv) && !JSON.stringify(wandRoh).includes('"stahlplatten"'));
ok('heutige abgeleitete Struktur vorhanden (base_plate/top_plate, neue BOM-Felder)',
  ('base_plate' in wv) && ('top_plate' in wv) && ('stahlblech_module' in wv.bom) && ('stossfugen' in wv.bom));
ok('Wandvorlage friert keine Statik-/Nachweiskennwerte ein',
  Object.keys(wandRoh.eingaben).join(',') === 'projekt,planung,aufbau' && !('statik' in wandRoh.eingaben)
  && !/\bmRk1\b|\bNv1\b|f_k|gamma_w/.test(JSON.stringify(wandRoh)));
ok('Wandvorlage traegt nur Produkt-IDs, keine Preise/Maße/Kosten',
  !('kosten' in wandRoh.eingaben)
  && !/"preis"|"breite_mm"|"laenge_mm"/.test(JSON.stringify(wandRoh.eingaben))
  && Object.keys(wandRoh.eingaben.planung).join() === 'produkte'
  && Object.keys(wandRoh.eingaben.aufbau).join() === 'produkte');

// 7d) Standardkatalog laden: er tritt NEBEN den bisherigen und wird zugeordnet ([L-12])
const katVorherId = store.holeKatalog().id;
ok('Ausgangslage: ein anderer Katalog ist zugeordnet',
  store.holeKatalog() && store.holeKatalog().name === 'Direktkatalog');
await $('k-vorlage').dispatch('click');
ok('Standardkatalog geladen und dem Projekt zugeordnet',
  kAnzahl() === 20 && /Standardkatalog/.test(kat().name));
ok('[L-12] der bisherige Katalog bleibt erhalten und ist wieder waehlbar',
  store.katalogNachId(katVorherId)?.name === 'Direktkatalog' && store.listeKataloge().length >= 2);
ok('Erfolgsmeldung nennt die vorlaeufigen Werte',
  /Standardkatalog geladen/.test(kMsgTxt()) && /[Vv]orläufige/.test(kMsgTxt())
  && /gekennzeichnet/.test(kMsgTxt()) && !kFehler());
ok('Katalogname erscheint im Eingabefeld', $('k-name').value === kat().name);
ok('Standardkatalog liegt im eigenen localStorage-Speicher',
  Object.values(JSON.parse(localStorage.getItem('sembla:kataloge')))
    .find(k => k.id === kat().id).produkte.length === 20);
ok('Kennzeichnung „vorläufig" ueberlebt die Persistenz',
  KAT.produkt(kat(), 'latte-40-60-1500').hinweis.startsWith('vorläufig — fachlich unbestätigt'));
ok('geladene Produkte tragen die Produktvorgaben der Suite',
  KAT.produkt(kat(), 'stein-i3-375').preis === 9.5 && KAT.produkt(kat(), 'stein-i2-250').preis === 7.2
  && KAT.produkt(kat(), 'gewindestange-m10-1000').laenge_mm === 1000);
// [P-18] Der Standardkatalog macht die Suite startklar: Standardlaengen 1000/850, EIN Reststueck
// 100 mm, EINE Kopplungsmutter fuer Stoß und Fuß, und jede waehlbare Rolle ist vorbelegt.
ok('Standardkatalog belegt jede waehlbare Verwendungsstelle vor ([P-18])',
  KAT.rollenOhneVorschlag(kat()).length === 0);
ok('Standardkatalog fuehrt genau eine Kopplungsmutter (Stoß = Fuß)',
  kat().produkte.filter(p => /kopplungsmutter/i.test(p.id)).length === 1
  && KAT.produktrollenVorschlag(kat()).kupplung.length === 1);
// 7d2) Katalog-v1-Kompatibilitaet der Maske ([P-16]): jedes Produkt der v1-Vorlage laesst sich
// im Dialog oeffnen und unveraendert wieder speichern — kein Feld faellt weg, Zusatzfelder
// (hinweis nach [P-12]) bleiben erhalten, die Formatversion bleibt 1.
{
  /** Produkt schluesselunabhaengig vergleichen (die Reihenfolge darf sich aendern). */
  const kanon = (p) => JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]));
  const vorher = kanon(KAT.produkt(kat(), 'latte-40-60-1500'));
  kZeile('bearbeiten', 'latte-40-60-1500');
  ok('Vorlagenprodukt oeffnet mit gefuellter Lattenmaske',
    kpFelder().join() === 'breite_mm,dicke_mm,laenge_mm' && $('kp-f-laenge_mm').value === '1500'
    && $('kp-f-breite_mm').value === '40' && $('kp-f-dicke_mm').value === '60');
  ok('Zusatzfeld „hinweis" wird als erhalten benannt, nicht als fachfremd',
    $('kp-extra').hidden === false && /erhalten/.test($('kp-extra').innerHTML)
    && /hinweis/.test($('kp-extra').innerHTML) && !/fachfremd/.test($('kp-extra').innerHTML));
  kpSpeichern();
  ok('unveraendertes Speichern laesst das v1-Produkt inhaltlich identisch',
    kanon(KAT.produkt(kat(), 'latte-40-60-1500')) === vorher && kAnzahl() === 20);
  ok('alle 20 Vorlagenprodukte bleiben gegen den echten Validator fehlerfrei',
    kat().produkte.every(p => KAT.validiereProdukt(p, { ids: [] }).length === 0));
  ok('jedes Pflichtfeld einer Kategorie ist in ihrer Maske pflegbar (eine Pflichtquelle)',
    KAT.KATEGORIEN.every(k => (k.pflicht || []).every(f => KAT.maskeFelder(k.id).includes(f))));
  ok('kein Vorlagenprodukt traegt ein fuer seine Kategorie fachfremdes Maßfeld',
    kat().produkte.every(p => KAT.MASSFELDER.every(f =>
      p[f] === undefined || KAT.maskeFelder(p.kategorie).includes(f))));
  ok('Katalog-Formatversion bleibt 1 (kein Bruch durch [P-16])',
    KAT.KATALOG_VERSION === 1 && KAT.katalogObjekt(kat()).version === 1
    && KAT.parseKatalog(JSON.stringify(KAT.katalogObjekt(kat()))).produkte.length === 20);
}

ok('Laden schreibt NICHT ins Wandelement und nicht in die Projektauswahl',
  !JSON.stringify(store.aktivesWandelement()).includes('stein-i3-375')
  && KAT.anzahlAuswahl(store.katalogAuswahl()) === 0);

// leerer Slot: kein Ersetzen-Dialog noetig
confirmAntwort = true;
$('k-entfernen').dispatch('click');
confirmAntwort = false;                                   // wuerde ein confirm ablehnen
await $('k-vorlage').dispatch('click');
ok('ohne geladenen Katalog laedt die Vorlage ohne Rueckfrage', kAnzahl() === 20);

// 7e) Musterwand laden: bestehender Bestaetigungsdialog, kein stilles Schreiben
const wAnzahlVor = anzahl(), wAktivVor = store.aktivId(), wStandVor = stand();
await $('btn-vorlage-wand').dispatch('click');
ok('Vorlage oeffnet den bestehenden Import-Dialog', $('imp-overlay').hidden === false);
ok('Dialog nennt die Vorlage als Quelle',
  $('imp-datei').textContent === 'SEMBLA_Musterwand.json (Repo-Vorlage)');
ok('Namensvorschlag kommt aus der Vorlage', $('imp-name').value === 'SEMBLA Musterwand (AWG)');
ok('Zusammenfassung zeigt die AWG-Maße und den Wandtyp',
  /3000 × 2600 mm/.test(impInfo()) && /Innenwand mit Wind \(Cpi\)/.test(impInfo()));
ok('vor der Bestaetigung wird NICHTS gespeichert',
  anzahl() === wAnzahlVor && stand() === wStandVor && store.aktivId() === wAktivVor);
$('imp-cancel').dispatch('click');
ok('Abbrechen legt kein Element an und aendert den aktiven Zeiger nicht',
  $('imp-overlay').hidden === true && anzahl() === wAnzahlVor && stand() === wStandVor
  && store.aktivId() === wAktivVor);

const vorherAktivStand = JSON.stringify(store.holeElement(wAktivVor));
await $('btn-vorlage-wand').dispatch('click');
$('imp-go').dispatch('click');
const mw = store.aktivesElement();
ok('Bestaetigung legt genau EIN neues Element an', anzahl() === wAnzahlVor + 1);
ok('Musterwand ist aktiv und traegt den Vorlagennamen',
  store.aktivId() === mw.id && mw.id !== wAktivVor && mw.name === 'SEMBLA Musterwand (AWG)');
ok('gespeichertes Wandelement ist die kanonische AWG-Wand',
  mw.wandelement.length_mm === 3000 && mw.wandelement.height_mm === 2600
  && mw.wandelement.tension_columns.length === 14 && mw.wandelement.lagen === 13);
ok('Wandtyp wird beim Import normalisiert', store.WANDTYPEN.includes(mw.wandelement.wandtyp));
ok('bestehendes Element wurde NICHT ueberschrieben',
  JSON.stringify(store.holeElement(wAktivVor)) === vorherAktivStand);
ok('Erfolgsmeldung nennt Name, Import und den Ort in der Struktur',
  /SEMBLA Musterwand \(AWG\)/.test(trMsgTxt()) && /importiert/.test(trMsgTxt())
  && /eingetragen in Geschoss/.test(trMsgTxt()));
ok('Projekt-Kopfdaten der Vorlage kommen mit',
  store.holeEingaben(mw.id).projekt.name === 'SEMBLA Musterwand (AWG)');
ok('Vorlage friert keine Preise ein — nur Produkt-IDs und Herkunftsnotiz',
  (() => { const e = store.holeEingaben(mw.id);
           const s = JSON.stringify([e.planung.produkte, e.aufbau.produkte]);
           return e.kosten.preise === undefined && !/preis|breite_mm|laenge_mm/.test(s); })());
ok('erneuter Klick auf „Importieren" speichert nicht doppelt',
  (() => { $('imp-go').dispatch('click'); return anzahl() === wAnzahlVor + 1; })());

// 7e2) Vorlage bleibt mit der Umstellung funktionsfaehig: die Rollen der AWG-Vorlage loesen
// gegen den mitgelieferten Standardkatalog auf; ungeklaerte Zuordnung bleibt LEER und wird
// gemeldet statt geraten (Verbinderprodukt: Katalog v1 hat kein Typfeld, [U-9]).
{
  const eMw = store.holeEingaben(mw.id);
  const rollen = KAT.produktRollen(eMw);
  ok('Vorlage bringt Rollen fuer Modul 1 und Modul 2 mit',
    rollen.i3.join() === 'stein-i3-375' && rollen.rod_std.join() === 'gewindestange-m10-1000'
    && rollen.blech_boden.join() === 'blech-bodenblech-1000' && rollen.blech_kopf.join() === 'blech-kopfblech-1000'
    && rollen.latte.join() === 'latte-40-60-1500' && rollen.beplankung.join() === 'beplankung-625-1500');
  ok('Vorlage laesst das Verbinderprodukt bewusst leer (kein Rateschluss)',
    rollen.verbinder === undefined && eMw.aufbau.produkte.rollen.verbinder.length === 0);
  ok('Vorlage laesst die nachrichtliche Dicht-Gesamtlänge leer ([A-6])',
    eMw.planung.produkte.rollen.dicht.length === 0);
  const rsMw = stuecklistePositionen(mw.wandelement, eMw, kat());
  const offen = rsMw.filter(r => r.bepreisbar && r.gp == null);
  ok('Vorlage + Standardkatalog: alle Wandpositionen loesen auf',
    rsMw.every(r => !r.bepreisbar || r.gp != null));
  // [Z-4]/[P-19] Das Verbinderprodukt war die einzig offene Position. Seit die Beplankung in
  // keiner Stueckliste mehr steht, gibt es diese Position nicht — und damit keine offene.
  ok('keine offene Position mehr (Beplankung entfaellt, [Z-4])',
    offen.length === 0 && !rsMw.some(r => ['verbinder', 'latte', 'beplankung'].includes(r.key)));
  ok('Vorlage nutzt die zur Wand passende Stangenlänge (1000 mm)',
    rsMw.find(r => r.key === 'rod_std').produktId === 'gewindestange-m10-1000');
  ok('Vorlage: Boden- und Kopfblech getrennt bepreist',
    rsMw.find(r => r.key === 'blech_boden').ep === 18 && rsMw.find(r => r.key === 'blech_kopf').ep === 18
    && rsMw.find(r => r.key === 'blech_boden').menge + rsMw.find(r => r.key === 'blech_kopf').menge
       === mw.wandelement.bom.stahlblech_module);
  // Die Latte war die einzige vorlaeufige Position der Musterwand; mit dem Wegfall der
  // Beplankung ([Z-4]) nutzt sie keinen vorlaeufigen Katalogwert mehr. Die Faehigkeit selbst
  // bleibt geprueft: ein Produkt-Hinweis wird an der Position sichtbar weitergefuehrt ([P-12]).
  ok('Vorlage: Produkt-Hinweise werden an der Position weitergefuehrt ([P-12])',
    rsMw.some(r => r.produkt && r.produkt.hinweis && r.hinweis === r.produkt.hinweis));
  ok('Vorlage nutzt keinen vorläufigen Katalogwert mehr (Beplankung entfallen, [Z-4])',
    !rsMw.some(r => r.produkt && /vorläufig/.test(r.produkt.hinweis || '')));
  ok('Vorlage bleibt im oeffentlichen Projektformat v2 (kein Bruch)',
    store.projektObjekt(mw.id).version === 2 && JSON.parse(vorlageDatei(V_WAND)).version === 2);
}

// 7f) Ressourcen-/Formattrennung bleibt auch fuer die Vorlagen bestehen
await $('k-import').dispatch('change', { target: { files:[kFile(vorlageDatei(V_WAND), V_WAND)], value:'x' } });
ok('Wandvorlage im Katalog-Import -> klare Meldung, Katalog unveraendert',
  kFehler() && /Projekt-\/Wandelement-Datei/.test(kMsgTxt()) && kAnzahl() === 20);
await $('f-import').dispatch('change', { target: { files:[kFile(vorlageDatei(V_KAT), V_KAT)], value:'x' } });
ok('Katalogvorlage im Projekt-Import -> klare Meldung, kein Dialog',
  /Bauteilkatalog/.test(msgTxt()) && $('msg').className === 'msg err' && $('imp-overlay').hidden === true);

// 7g) Nicht erreichbare Vorlage: sichtbarer Fehler, kein Schreiben
const echtesFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok:false, status:404, text: async () => '' });
const standVorFehler = stand(), katVorFehler = JSON.stringify(store.holeKatalog());
await $('btn-vorlage-wand').dispatch('click');
ok('fehlende Wandvorlage -> Fehlermeldung, kein Dialog, kein Element',
  $('imp-overlay').hidden === true && $('msg').className === 'msg err'
  && /Musterwand nicht geladen/.test(msgTxt()) && /HTTP 404/.test(msgTxt()) && stand() === standVorFehler);
await $('k-vorlage').dispatch('click');
ok('fehlende Katalogvorlage -> Fehlermeldung, Katalog unveraendert',
  kFehler() && /Standardkatalog nicht geladen/.test(kMsgTxt())
  && JSON.stringify(store.holeKatalog()) === katVorFehler);
globalThis.fetch = echtesFetch;

// --- 8) Projektplaner-Baumliste (Etappe C3.1, Issue #26, [L-6]/[L-10]/[L-11]/[L-12]) ---
// Geuebt wird die ECHTE Modul-0-Oberflaeche: Baumliste Projekt -> Geschoss -> Wand,
// alle Formulare als Popup. Kern der Etappe: mehrere Projekte nebeneinander, Kopfdaten
// am Projekt, ein Bauteilkatalog je Projekt — und eine streng hierarchische Aktivierung,
// bei der Auf-/Zuklappen reine Anzeige bleibt.
{
  const projekte = () => store.listeProjekte();
  const prjSlot = () => localStorage.getItem('sembla:projekte');
  const baumHtml = () => $('tr-baum').innerHTML;
  /** Ist im gerenderten Baum ein bestimmter Knopf gesperrt (mit Begruendung)? */
  const gesperrt = (act, id) => new RegExp(
    '<button[^>]*data-act="' + act + '" data-id="' + id + '" disabled title="[^"]+"').test(baumHtml());
  const sichtbar = (act, id) => new RegExp(
    'data-act="' + act + '" data-id="' + id + '"').test(baumHtml());
  /** Ist der Knoten aufgeklappt? (Der Klapp-Knopf traegt ▾ bzw. ▸.) */
  const offen = (id) => new RegExp('data-act="klapp" data-id="' + id + '">▾').test(baumHtml());
  const aufklappen = (id) => { if (!offen(id)) baum('klapp', id); };

  // 8a) Die Oberflaeche besteht aus Baumliste + Layout-Editor — kein Formularblock mehr
  ok('Abschnitt „Projekte" mit der Hierarchie im Titel',
    /<h2>Projekte /.test(html) && /Projekt → Geschoss → Wand/.test(html));
  ok('die Hauptflaeche traegt nur Baumliste und Layout-Editor',
    /<div id="tr-baum"><\/div>/.test(html)
    && !/<h2>Wandelement anlegen/.test(html) && !/<h2>Projekt-Kopfdaten/.test(html)
    && !/<h2>Gespeicherte Wandelemente/.test(html) && !/<h2>Projektplanung/.test(html));
  ok('alle Formulare liegen in Popups (Projekt/Geschoss/Wand/Katalog)',
    /<div class="overlay" id="pp-overlay" hidden>/.test(html)
    && /<div class="overlay" id="gp-overlay" hidden>/.test(html)
    && /<div class="overlay" id="wp-overlay" hidden>/.test(html)
    && /<div class="overlay" id="kat-overlay" hidden>/.test(html));
  ok('die alten Formularfelder der Projektplanung sind verschwunden',
    !/id="pl-geb"/.test(html) && !/id="pl-gs"/.test(html) && !/id="pl-neu"/.test(html)
    && !/id="w-filter"/.test(html) && !/id="tbody"/.test(html));
  ok('die Gebaeude-Ebene taucht in der Oberflaeche nicht mehr auf ([L-6])',
    !/Gebäude anlegen/.test(html) && !/Aktives Gebäude/.test(html));
  ok('Hinweis nennt Klappzustand, Hierarchie und Vorgabecharakter ([L-3]/[L-5]/[L-10])',
    /\[L-10\]/.test(html) && /\[L-5\]/.test(html) && /\[L-3\]/.test(html)
    && /unabhängig auf- und zuklappen/.test(html));
  ok('Projekt-Popup fuehrt Kopfdaten und Katalogzuordnung ([L-11]/[L-12])',
    /<input id="pp-bauherr"/.test(html) && /<input id="pp-planverf"/.test(html)
    && /<select id="pp-phase"/.test(html) && /<input id="pp-plannr"/.test(html)
    && /<select id="pp-katalog"/.test(html) && /\[L-11\]/.test(html) && /\[L-12\]/.test(html));

  // 8b) Mehrere Projekte nebeneinander ([L-6]) ------------------------------
  const vorher = projekte().length;
  const pB = projektAnlegen('Halle Süd', { bauherr:'AWG eG', planverf:'Polycare', plannr:'07' });
  ok('[L-6] zweites Projekt liegt neben dem ersten', projekte().length === vorher + 1);
  ok('[L-6] das neu angelegte Projekt ist aktiv und bringt ein Geschoss mit',
    store.holeMappe().projekt.id === pB.projekt.id
    && pB.gebaeude.length === 1 && pB.gebaeude[0].geschosse.length === 1);
  ok('Projekt-Dialog schliesst und meldet die Anlage',
    $('pp-overlay').hidden === true && /angelegt/.test(trMsgTxt()) && !trFehler());
  ok('[L-6] die Mappen liegen als Liste im eigenen Speicherschluessel',
    Array.isArray(JSON.parse(prjSlot())) && JSON.parse(prjSlot()).length === projekte().length
    && localStorage.getItem('sembla:projektmappe') === null);
  ok('[L-6] jede Mappe behaelt ihre eigene Formatversion v2',
    JSON.parse(prjSlot()).every(m => m.version === MAPPE.MAPPE_VERSION));
  ok('Stand nennt Projekte, Geschosse und Waende',
    /2 Projekt\(e\)/.test($('tr-stand').textContent) && /Mappenformat v2/.test($('tr-stand').textContent));

  // 8c) Kopfdaten leben am Projekt ([L-11]) ---------------------------------
  const gsB = store.aktivesGeschossId();
  ok('[L-11] Kopfdaten stehen am Projekt, nicht am Wandelement',
    store.holeMappe().projekt.kopfdaten.bauherr === 'AWG eG'
    && store.holeMappe().projekt.kopfdaten.plan_nr === '07');
  const idB = wandAnlegen(gsB, { name:'Wand Süd 1' });
  // #56: Der Katalog wird ausdruecklich geladen (frueher tat das der entfallene
  // Anlegen-Handler nebenbei) — je Projekt ein eigener, s. [L-12] weiter unten.
  $('k-vorlage').dispatch('click');
  await new Promise(r => setTimeout(r, 0));
  ok('[L-11] die Wand des Projekts bekommt dessen Kopfdaten', (() => {
    const k = store.wirksameKopfdaten(idB);
    return k.quelle === 'projekt' && k.kopfdaten.bauherr === 'AWG eG' && k.kopfdaten.name === 'Halle Süd';
  })());
  ok('[L-11] Modul 0 schreibt eingaben.projekt nicht mehr — es gibt keinen Weg dorthin',
    JSON.stringify(store.holeEingaben(idB).projekt) === '{}'
    && !/mergeEingaben\('projekt'/.test(src) && !/id="pj-/.test(html));
  ok('[L-11] der Export traegt die wirksamen Kopfdaten',
    store.projektObjekt(idB).eingaben.projekt.bauherr === 'AWG eG'
    && store.projektObjekt(idB).eingaben.projekt.name === 'Halle Süd');
  // Bearbeiten fuellt den Dialog aus dem Projekt und schreibt nur mit „Speichern"
  baum('prj-bearbeiten', pB.projekt.id);
  ok('Projekt bearbeiten: Dialog ist aus dem Projekt vorbelegt',
    $('pp-overlay').hidden === false && $('pp-name').value === 'Halle Süd'
    && $('pp-bauherr').value === 'AWG eG' && $('pp-plannr').value === '07');
  const prjVorAbbruch = prjSlot();
  $('pp-bauherr').value = 'Verworfen';
  ppAbbruchTest();
  function ppAbbruchTest(){ $('pp-cancel').dispatch('click'); }
  ok('Abbrechen im Projekt-Dialog schreibt nichts',
    prjSlot() === prjVorAbbruch && store.holeMappe().projekt.kopfdaten.bauherr === 'AWG eG');
  baum('prj-bearbeiten', pB.projekt.id);
  $('pp-gez').value = 'TB';
  $('pp-plannr').value = '';
  $('pp-speichern').dispatch('click');
  ok('[L-11] Speichern uebernimmt Aenderungen, leeres Feld loescht',
    store.holeMappe().projekt.kopfdaten.gez === 'TB'
    && store.holeMappe().projekt.kopfdaten.plan_nr === undefined);

  // 8d) Aktivierung ist streng hierarchisch ([L-10]) ------------------------
  ok('[L-10] das Geschoss des nicht aktiven Projekts ist gesperrt und nennt den Grund',
    gesperrt('gs-aktiv', gs0)
    && new RegExp('data-act="gs-aktiv" data-id="' + gs0 + '" disabled title="[^"]*Testprojekt')
         .test(baumHtml()));
  ok('[L-10] das Geschoss des aktiven Projekts ist nicht gesperrt',
    !gesperrt('gs-aktiv', gsB) || store.aktivesGeschossId() === gsB);
  baum('gs-aktiv', gs0);
  ok('[L-10] ein gesperrter Weg wird abgewiesen und benannt',
    trFehler() && /Testprojekt/.test(trMsgTxt()) && store.aktivesGeschossId() === gsB);
  ok('[L-10] dabei wurde das fremde Projekt NICHT still mitaktiviert',
    store.holeMappe().projekt.id === pB.projekt.id);

  // Auf-/Zuklappen ist reine Anzeige und aendert keinen Zeiger
  const zeiger = () => [store.aktivesProjektId(), store.aktivesGeschossId(), store.aktivId()].join('|');
  const zeigerVor = zeiger();
  aufklappen(prj0.projekt.id);
  baum('klapp', prj0.projekt.id);
  ok('[L-10] Zuklappen ist reine Anzeige und aendert keinen Zeiger',
    !offen(prj0.projekt.id) && !sichtbar('gs-aktiv', gs0) && zeiger() === zeigerVor);
  baum('klapp', prj0.projekt.id);
  ok('[L-10] ein nicht aktives Projekt laesst sich aufklappen und ansehen',
    offen(prj0.projekt.id) && sichtbar('gs-aktiv', gs0) && zeiger() === zeigerVor);

  // Wand eines fremden Geschosses: gesperrt, und der Direktaufruf wird abgewiesen
  aufklappen(prj0.projekt.id);
  aufklappen(gs0);
  ok('[L-10] Wand in fremdem Geschoss ist gesperrt', gesperrt('wand-aktiv', idOhneWind));
  baum('wand-aktiv', idOhneWind);
  ok('[L-10] Direktaufruf wird abgewiesen und nennt das Geschoss',
    trFehler() && /Geschoss/.test(trMsgTxt()) && store.aktivId() === idB);

  // Projektwechsel hebt die Zeiger darunter auf, statt sie umzubiegen
  baum('prj-aktiv', prj0.projekt.id);
  ok('[L-10] Projektwechsel hebt Geschoss- und Wandzeiger auf',
    store.holeMappe().projekt.id === prj0.projekt.id
    && store.aktivesGeschossId() === null && store.aktivId() === null);
  baum('gs-aktiv', gs0);
  baum('wand-aktiv', idOhneWind);
  ok('[L-10] im aktiven Pfad greifen beide Aktivierungen',
    store.aktivesGeschossId() === gs0 && store.aktivId() === idOhneWind);

  // 8e) Geschoss-Popup: Hoehe ist Vorgabe ([L-5]) ---------------------------
  const gsNeu = geschossAnlegen(prj0.projekt.id, 'OG', 2600);
  ok('Geschoss ueber den Dialog angelegt und aktiv',
    MAPPE.findeGeschoss(store.holeMappe(), gsNeu)?.geschoss.name === 'OG'
    && store.aktivesGeschossId() === gsNeu);
  ok('[L-5] die Geschosshoehe wird als Lagenzahl benannt',
    /2600 mm = 13 Lagen/.test(trMsgTxt()));
  ok('[L-10] das Anlegen hebt den Wandzeiger des alten Geschosses auf', store.aktivId() === null);
  // #50: derselbe Wert heisst in der Oberflaeche durchgaengig Standard-Wandhoehe.
  ok('#50 Modul 0 nennt den Vorgabewert Standard-Wandhoehe, nicht mehr Geschosshoehe',
    !/Geschosshöhe/.test(html) && /Standard-Wandhöhe \(mm\)/.test(html));
  ok('#50 auch die Meldung zum Geschoss spricht von der Standard-Wandhoehe',
    /Standard-Wandhöhe 2600 mm = 13 Lagen/.test(trMsgTxt()));
  // #56: Die Vorgabe steht jetzt im Hoehenfeld des GESCHOSSEDITORS ([L-5] unveraendert);
  // Modul 0 haelt sie nur noch am Geschoss. Die Wand entsteht mit abweichender Hoehe.
  const idOg = wandAnlegen(gsNeu, { name: 'Wand OG 1', hoehe: 2400 });
  ok('[L-5] die Vorgabe bleibt frei aenderbar und wird nie zurueckgeschrieben',
    store.holeElement(idOg).wandelement.height_mm === 2400
    && MAPPE.findeGeschoss(store.holeMappe(), gsNeu).geschoss.hoehe_mm === 2600);
  // krumme Geschosshoehe wird angenommen und benannt, nie gerundet
  const gsKrumm = geschossAnlegen(prj0.projekt.id, 'Zwischengeschoss', 2550);
  ok('[L-5] krumme Geschosshoehe wird angenommen und benannt, nicht gerundet',
    MAPPE.findeGeschoss(store.holeMappe(), gsKrumm).geschoss.hoehe_mm === 2550
    && /kein Vielfaches/.test(trMsgTxt()));
  baum('gs-bearbeiten', gsKrumm);
  $('gp-hoehe').value = 'abc';
  $('gp-speichern').dispatch('click');
  ok('unsinnige Geschosshoehe wird abgewiesen, der Dialog bleibt offen',
    $('gp-overlay').hidden === false && $('gp-msg').className === 'msg err'
    && MAPPE.findeGeschoss(store.holeMappe(), gsKrumm).geschoss.hoehe_mm === 2550);
  $('gp-hoehe').value = '';
  $('gp-name').value = 'ZG';
  $('gp-speichern').dispatch('click');
  ok('Geschoss umbenennen und Hoehe aufheben in einem Zug',
    MAPPE.findeGeschoss(store.holeMappe(), gsKrumm).geschoss.name === 'ZG'
    && MAPPE.findeGeschoss(store.holeMappe(), gsKrumm).geschoss.hoehe_mm === null);

  // 8f) Wand-Popup „Bearbeiten": nur der Name, nie die Geometrie ([P-1]) ----
  baum('wand-bearbeiten', idOg);
  ok('#56 Bearbeiten ist reines Umbenennen und verweist auf Modul 1 und den Geschosseditor',
    /Modul&nbsp;1/.test($('wp-sub').innerHTML) && /Geschosseditor/.test($('wp-sub').innerHTML)
    && $('btn-neu').hidden === false);
  ok('#56 die gespeicherte Geometrie steht dort nur als Anzeige',
    /Länge: 2000 mm/.test($('wp-hinweis').innerHTML) && /Höhe: 2400 mm/.test($('wp-hinweis').innerHTML));
  ok('Bearbeiten blendet die Importwege aus', $('wp-quellen').hidden === true);
  $('f-name').value = 'Wand OG Nord';
  $('btn-neu').dispatch('click');
  ok('[L-4] Umbenennen fuehrt den Anzeigenamen der Mappe mit, Geometrie bleibt',
    store.holeElement(idOg).name === 'Wand OG Nord'
    && store.wandVerortung(idOg).wand.name === 'Wand OG Nord'
    && store.holeElement(idOg).wandelement.height_mm === 2400);

  // 8g) Lage: Abweichung wird gemeldet, nie angeglichen ([L-3]) -------------
  store.verorteWand(idOg, gsNeu, { lage: { start_mm:{ x:250, y:625 }, richtung:'x', laenge_grid: 20 } });
  ok('[L-3] die Baumliste meldet die Laengenabweichung sichtbar',
    /Lage 250\/625 mm/.test(baumHtml()) && /2500 mm/.test(baumHtml())
    && /class="abw"/.test(baumHtml()) && /\[L-3\]/.test(baumHtml()));
  ok('[L-3] das Wandelement wurde dabei nicht angeglichen',
    store.holeElement(idOg).wandelement.length_mm === 2000);

  // 8h) Nicht zugeordnete Waende werden gemeldet, nie bereinigt ([L-4]) -----
  const idFrei = store.speichere('Streuner', buildWall('Streuner', 1000, 2000, []));
  store.setzeAktivesGeschoss(gsNeu);
  ok('[L-4] eine Wand ohne Projekt steht in der Warnbox mit Zuordnen-Weg',
    $('tr-warn').hidden === false && /keinem Projekt/.test($('tr-warn').innerHTML)
    && /Streuner/.test($('tr-warn').innerHTML)
    && new RegExp('data-act="wand-zuordnen" data-id="' + idFrei + '"').test($('tr-warn').innerHTML));
  baum('wand-zuordnen', idFrei, 'tr-warn');
  ok('[L-4] Zuordnen traegt sie ohne erfundene Lage ins aktive Geschoss ein',
    store.wandVerortung(idFrei)?.geschoss.id === gsNeu
    && store.wandVerortung(idFrei).wand.lage === null
    && !store.mappeReferenzen().unverortet.includes(idFrei));
  ok('[L-4] verwaister Eintrag wird gemeldet, loescht aber nie ein Wandelement', (() => {
    store.setzeMappe(MAPPE.setzeWand(store.holeMappe(), gsNeu, { id:'w-geist', name:'Geist' }));
    return /Verwaiste Einträge/.test($('tr-warn').innerHTML)
      && /Geist/.test($('tr-warn').innerHTML) && store.holeElement(idFrei) !== null;
  })());
  confirmAntwort = true;
  baum('wand-loeschen', 'w-geist');
  ok('[L-4] ein verwaister Eintrag laesst sich ausdruecklich entfernen',
    store.wandVerortung('w-geist') === null && store.mappeReferenzen().verwaist.length === 0);

  // 8i) Ein Bauteilkatalog je Projekt ([L-12]) ------------------------------
  ok('[L-12] das aktive Projekt kennt seinen Katalog', (() => {
    const st = store.katalogStatus();
    return st.status === 'ok' && st.id === store.holeMappe().katalog
      && st.katalog.id === store.holeKatalog().id;
  })());
  ok('[L-12] das andere Projekt haengt an einem EIGENEN Katalog',
    !!store.projektMappe(pB.projekt.id).katalog
    && store.projektMappe(pB.projekt.id).katalog !== store.holeMappe().katalog);
  // Zuordnung ausdruecklich aufheben — danach wird das gemeldet, nicht geraten
  baum('prj-aktiv', pB.projekt.id);
  baum('prj-bearbeiten', pB.projekt.id);
  $('pp-katalog').value = '';
  $('pp-speichern').dispatch('click');
  ok('[L-12] ohne Zuordnung wird das gemeldet, kein Katalog geraten',
    store.holeKatalog() === null && store.katalogStatus().status === 'nicht_zugeordnet'
    && /kein Bauteilkatalog zugeordnet/.test($('k-warn').innerHTML));
  baum('prj-bearbeiten', pB.projekt.id);
  ok('Projekt-Dialog bietet die vorhandenen Kataloge zur Wahl',
    /kein Katalog zugeordnet/.test($('pp-katalog').innerHTML)
    && store.listeKataloge().every(k => $('pp-katalog').innerHTML.includes(k.id)));
  $('pp-katalog').value = store.listeKataloge()[0].id;
  $('pp-speichern').dispatch('click');
  ok('[L-12] die Zuordnung haengt danach am Projekt',
    store.holeMappe().katalog === store.listeKataloge()[0].id
    && store.holeKatalog().id === store.listeKataloge()[0].id);
  ok('[L-12] der wirksame Katalog folgt dem aktiven Projekt', (() => {
    const hier = store.holeKatalog().id;
    baum('prj-aktiv', prj0.projekt.id);
    const dort = store.holeKatalog().id;
    baum('prj-aktiv', pB.projekt.id);
    return hier !== dort;
  })());

  // 8j) Projekt loeschen: Struktur weg, Wandelemente bleiben ([L-4]/[L-10]) -
  confirmAntwort = false;
  const anzahlPrjVor = projekte().length;
  baum('prj-loeschen', pB.projekt.id);
  ok('Loeschen ohne Bestaetigung passiert nicht', projekte().length === anzahlPrjVor);
  confirmAntwort = true;
  const elementeVor = store.listeElemente().length;
  baum('prj-loeschen', pB.projekt.id);
  ok('[L-4] Projekt entfernt, Wandelemente bleiben erhalten',
    projekte().length === anzahlPrjVor - 1 && store.listeElemente().length === elementeVor
    && store.holeElement(idB) !== null);
  ok('[L-4] die Waende gelten danach als nicht eingetragen und werden gemeldet',
    store.wandVerortung(idB) === null && /keinem Projekt/.test($('tr-warn').innerHTML));
  ok('[L-10] die Zeiger des geloeschten Projekts sind aufgehoben',
    store.aktivesProjektId() === null && store.aktivesGeschossId() === null);
  ok('Loeschmeldung nennt den Verbleib der Wandelemente',
    /nicht gelöscht/.test(trMsgTxt()) && !trFehler());

  // 8k) Mappen-Datei: Sichern und Wiedereinlesen ----------------------------
  store.setzeAktivesProjekt(prj0.projekt.id);
  // Der reine Struktur-Weg bleibt neben dem vollstaendigen Archiv bestehen ([L-13]).
  baum('prj-json', prj0.projekt.id);
  const mappeDatei = letzterDownload;
  ok('Projekt-Export erzeugt eine Projektmappen-Datei v2',
    JSON.parse(mappeDatei).format === 'SEMBLA-Projektmappe'
    && JSON.parse(mappeDatei).version === 2
    && /^SEMBLA_Projektmappe_/.test(letzterAnker.download));
  ok('die Mappen-Datei traegt keine Wandgeometrie ([L-3])',
    !mappeDatei.includes('courses') && !mappeDatei.includes('length_mm'));
  ok('die Mappen-Datei traegt die Kopfdaten des Projekts ([L-11])',
    'kopfdaten' in JSON.parse(mappeDatei).projekt);
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [kFile(mappeDatei, 'mappe.json')], value: 'x' } });
  ok('Mappen-Import stellt dasselbe Projekt wieder her (Kennung bleibt)',
    store.holeMappe().projekt.id === prj0.projekt.id && projekte().length === anzahlPrjVor - 1);
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [kFile(JSON.stringify(store.projektObjekt(idOg)), 'wand.json')], value: 'x' } });
  ok('eine Wanddatei im Mappen-Import wird benannt abgewiesen',
    trFehler() && /Wanddatei/.test(trMsgTxt()));

  // 8l) Das Projektformat der Wanddateien bleibt unberuehrt
  ok('Projektformat der Wanddateien bleibt v2 (kein Bruch durch die Mappen-Liste)',
    store.projektObjekt(idOg).version === 2);
  ok('[L-3] der Wandspeicher traegt keine Lagedaten',
    !localStorage.getItem('sembla:elemente').includes('start_mm'));
}

// --- 9) Geschossplan: Modul 0 zeigt nur noch AN (#53, [L-8]/[L-9]) --------
// Seit #53 ist die vollstaendige Planverwaltung — hochladen, ersetzen, entfernen,
// kalibrieren, Massstab, Versatz, Plan verschieben — im Layout-Editor
// (docs/geschossplan.html, Planblatt „Plan…"). Modul 0 haelt davon NICHTS mehr:
// es zeigt im Geschoss-Popup nur an, ob ein Plan hinterlegt ist, und fuehrt mit
// „Geschoss oeffnen" dorthin. Geprueft wird deshalb vor allem, was hier NICHT
// mehr existiert — es gibt genau EINEN Uploadweg, und der liegt woanders.
{
  const mappeSlot = () => localStorage.getItem('sembla:projekte');
  const alleLagen = () => JSON.stringify(MAPPE.alleWaende(store.holeMappe()).map(e => e.wand.lage));

  // 9a) Der Editor ist aus Modul 0 ausgezogen (Etappe C4a) …
  ok('[C4a] Modul 0 hat keine Zeichenflaeche und keine Kalibrier-/Versatzfelder mehr',
    !/id="pn-buehne"/.test(html) && !/id="pn-mmjepx"/.test(html) && !/id="pn-vx"/.test(html)
    && !/id="pn-kalibrieren"/.test(html) && !/<h2>Geschossplan/.test(html));
  ok('[C4a] „Geschoss oeffnen" fuehrt auf die eigene Editor-Seite',
    /geschossplan\.html/.test(html) && /gs-oeffnen/.test(html));

  // 9b) … und mit #53 auch der Upload.
  ok('#53 Modul 0 hat KEINEN Plan-Upload und kein Plan-Entfernen mehr',
    !/id="gp-plan-import"/.test(html) && !/id="gp-plan-entfernen"/.test(html)
    && !/type="file"[^>]*image\/png/.test(html));
  ok('#53 der Hinweis nennt den einen Ort, an dem der Plan verwaltet wird',
    /ausschließlich im Layout-Editor/.test(html) && /„Plan…“/.test(html));
  ok('#53 die unveraenderten Randbedingungen stehen weiterhin dort ([L-8]/[L-9]/[L-1])',
    /20 MB/.test(html) && /PDF wird abgewiesen/.test(html)
    && /Lagen bereits verorteter Wände bleiben unberührt \(\[L-1\]\)/.test(html));

  // 9c) Planspeicher einschleusen (im Browser: IndexedDB des Geraets)
  PLAN.setzeIndexedDB(fakeIndexedDB());

  const gsPlan = MAPPE.alleGeschosse(store.holeMappe())[0].geschoss;
  store.setzeAktivesGeschoss(gsPlan.id);

  // 9d) „Geschoss oeffnen" setzt das Geschoss aktiv und wechselt auf die Editor-Seite
  globalThis.window.location.href = '';
  baum('gs-oeffnen', gsPlan.id);
  ok('[C4a] „Geschoss oeffnen" navigiert auf docs/geschossplan.html',
    globalThis.window.location.href === 'geschossplan.html');
  ok('[L-10] und setzt dabei genau dieses Geschoss aktiv', store.aktivesGeschossId() === gsPlan.id);

  // 9e) Ohne Plan sagt die Zeile genau das — und wo er herkommt.
  baum('gs-bearbeiten', gsPlan.id);
  await new Promise(r => setTimeout(r, 0));
  ok('Geschoss-Popup zeigt den Planblock', $('gp-overlay').hidden === false && $('gp-plan-block').hidden === false);
  ok('#53 ohne Plan wird das benannt und auf den Layout-Editor verwiesen',
    /Kein Plan hinterlegt/.test($('gp-plan-info').textContent)
    && /Layout-Editor/.test($('gp-plan-info').textContent));

  // 9f) Ein im Editor hinterlegter Plan wird hier korrekt ANGEZEIGT. Geschrieben
  //     wird dafuer ueber dieselben reinen Wege, die der Editor benutzt.
  const lageVorher = alleLagen();
  await PLAN.speicherePlan(gsPlan.id, { _w: 1600, _h: 1200 }, {
    name: 'eg.png', typ: 'image/png', groesse: 123456, breite_px: 1600, hoehe_px: 1200 });
  store.setzeGeschossPlan(gsPlan.id, { datei: 'eg.png', typ: 'image/png',
    breite_px: 1600, hoehe_px: 1200, mm_je_pixel: null, versatz_x_mm: 0, versatz_y_mm: 0 });
  baum('gs-bearbeiten', gsPlan.id);
  await new Promise(r => setTimeout(r, 0));
  ok('Planzeile nennt Datei, Bildmasse und den fehlenden Massstab',
    /eg\.png/.test($('gp-plan-info').textContent)
    && /1600 × 1200 px/.test($('gp-plan-info').textContent)
    && /kein Maßstab gesetzt/.test($('gp-plan-info').textContent));
  ok('[L-8] das BILD liegt in der Plan-Datenbank, nicht im localStorage',
    !!(await PLAN.holePlan(gsPlan.id)) && !mappeSlot().includes('blob')
    && !mappeSlot().includes('base64'));

  // 9g) Reload-Fest: Beschreibung liegt in der Mappe, Bild in der Plan-Datenbank
  store.setzeGeschossPlanAnsicht(gsPlan.id, { mm_je_pixel: 10, versatz_x_mm: 375, versatz_y_mm: -125 });
  ok('[L-1] Massstab und Versatz haben KEINE Wandlage veraendert', alleLagen() === lageVorher);
  ok('[L-8] Plan uebersteht einen Reload (Beschreibung im Mappen-Slot)',
    (() => { const roh = JSON.parse(mappeSlot());
             const g = roh.flatMap(m => m.gebaeude).flatMap(x => x.geschosse)
               .find(x => x.id === gsPlan.id);
             return g && g.plan && g.plan.datei === 'eg.png' && g.plan.mm_je_pixel === 10; })());
  ok('[L-8] Mappe bleibt gueltig und formatstabil (v2)',
    MAPPE.validiereMappe(store.holeMappe()).length === 0
    && JSON.parse(mappeSlot()).every(m => m.version === 2));
  $('gp-cancel').dispatch('click');

  // 9h) Ein geloeschtes Geschoss hinterlaesst kein unerreichbares Bild ([L-8]) —
  //     das raeumt Modul 0 weiterhin auf, auch ohne eigenen Uploadweg.
  const gsProbe = geschossAnlegen(store.holeMappe().projekt.id, 'Planprobe');
  await PLAN.speicherePlan(gsProbe, { _w: 100, _h: 100 }, {
    name: 'probe.png', typ: 'image/png', groesse: 1000, breite_px: 100, hoehe_px: 100 });
  store.setzeGeschossPlan(gsProbe, { datei: 'probe.png', typ: 'image/png',
    breite_px: 100, hoehe_px: 100, mm_je_pixel: null, versatz_x_mm: 0, versatz_y_mm: 0 });
  ok('Probegeschoss hat ein Planbild', !!(await PLAN.holePlan(gsProbe)));
  confirmAntwort = true;
  baum('gs-loeschen', gsProbe);
  await new Promise(r => setTimeout(r, 0));
  ok('[L-8] mit dem Geschoss verschwindet auch sein Planbild',
    (await PLAN.holePlan(gsProbe)) === null && !mappeSlot().includes(gsProbe));
  ok('Loeschmeldung nennt den mitentfernten Plan', /Plan wurde mit entfernt/.test(trMsgTxt()));
}

// --- 11) Vollstaendiges Projektarchiv ([L-13], Etappe C5) ------------------
// Der ECHTE Roundtrip an der echten Oberflaeche: Projekt mit Kopfdaten, zwei
// Geschossen, zwei Waenden samt Eingaben, Lagen, Bemassungen und zwei
// Planbildern exportieren -> localStorage UND Plan-Datenbank loeschen ->
// Archivbytes wieder importieren -> fachlich derselbe Stand, Bildbytes inklusive.
//
// Gearbeitet wird mit den ECHTEN Exportbytes (zipSync ueber die vom Produktcode
// uebergebenen Dateien), nicht mit einem nachgebauten Dateibaum.
{
  const { zipDeflate } = await import("./hilfe-zip-deflate.mjs");
  const enc = (s) => new TextEncoder().encode(s);
  const warte = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

  // Synthetische Minimalbilder — nur die Signatur muss echt sein ([L-13]).
  const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 11, 22, 33, 44, 55, 66]);
  const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 77, 88]);
  const bildDatei = (name, type, bytes, w, h) => ({
    name, type, size: bytes.length, _w: w, _h: h,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  const zipDatei = (name, bytes) => ({
    name, type: 'application/zip',
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  const ordnerDatei = (pfad, data) => ({
    name: pfad.split('/').pop(), webkitRelativePath: pfad,
    arrayBuffer: async () => { const b = (typeof data === 'string') ? enc(data) : data;
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  });

  // 11a) Frischer Sandkasten, damit „alles loeschen“ spaeter wirklich alles ist.
  globalThis.localStorage = new MemStorage();
  PLAN.setzeIndexedDB(fakeIndexedDB());
  store.migrieren();

  const prjA = projektAnlegen('Archivprojekt', { bauherr: 'AWG Musterstadt', phase: 'LP5' });
  const gsEg = store.aktivesGeschossId();
  const gsOg = geschossAnlegen(prjA.projekt.id, 'OG', 2400);
  store.setzeAktivesGeschoss(gsEg);
  const wEg = await wandAnlegen(gsEg, { name: 'EG-W01', laenge: 3000, hoehe: 2400 });
  store.setzeAktivesGeschoss(gsOg);
  const wOg = await wandAnlegen(gsOg, { name: 'OG-W01', laenge: 2000, hoehe: 2400, wandtyp: 'ohne_wind' });

  // `wandAnlegen` startet nach dem unmittelbaren Speichern noch die asynchrone
  // Standardkatalog-Vorbelegung. Sie gehoert zum echten Produktweg und muss vor
  // dem bewusst kataloglosen Archivstand abgeschlossen sein; sonst teilt dieser
  // Test Zustand mit noch laufenden Fortsetzungen der beiden Klick-Handler.
  await warte();

  // Lage und Bemassung schreibt sonst der Layout-Editor ([K-10]) — hier ueber
  // dieselben reinen Operationen, damit der Archivtest echte Nutzdaten sieht.
  store.setzeMappe(MAPPE.setzeWand(store.holeMappe(), gsEg, {
    id: wEg, name: 'EG-W01', lage: { start_mm: { x: 0, y: 62.5 }, richtung: 'x', laenge_grid: 24 } }));
  store.setzeMappe(MAPPE.setzeWand(store.holeMappe(), gsOg, {
    id: wOg, name: 'OG-W01', lage: { start_mm: { x: 1562.5, y: 250 }, richtung: 'y', laenge_grid: 16 } }));
  store.setzeMappe(MAPPE.setzeBemassung(store.holeMappe(), gsEg, {
    id: 'bm-1', achse: 'x', von: null, bis: { wand: wEg, bezug: 'min' }, mass_mm: 0 }));
  store.mergeEingaben('kosten', { waehrung: 'CHF' }, wEg);
  store.setzeMappe(MAPPE.setzeKatalogRef(store.holeMappe(), 'kat-nichtdabei'));

  // Planbilder: hochgeladen wird seit #53 ausschliesslich im Layout-Editor
  // (eigener Smoke-Test). Hier zaehlt nur der ABGELEGTE Stand, also werden Bild
  // und Beschreibung ueber dieselben reinen Wege gesetzt, die der Editor benutzt.
  for (const [gs, datei] of [[gsEg, bildDatei('eg.png', 'image/png', PNG, 1600, 1200)],
                             [gsOg, bildDatei('og.webp', 'image/webp', WEBP, 800, 600)]]) {
    await PLAN.speicherePlan(gs, datei, { name: datei.name, typ: datei.type,
      groesse: datei.size, breite_px: datei._w, hoehe_px: datei._h });
    store.setzeGeschossPlan(gs, { datei: datei.name, typ: datei.type,
      breite_px: datei._w, hoehe_px: datei._h,
      mm_je_pixel: null, versatz_x_mm: 0, versatz_y_mm: 0 });
  }
  ok('[L-13] Ausgangsstand steht: 2 Geschosse, 2 Waende, 2 Planbilder',
    MAPPE.alleWaende(store.holeMappe()).length === 2
    && !!(await PLAN.holePlan(gsEg)) && !!(await PLAN.holePlan(gsOg)));

  // Fachlicher Stand VOR dem Export — genau daran wird der Import gemessen.
  const vergleich = () => JSON.stringify({
    mappe: MAPPE.mappeObjekt(store.projektMappe(prjA.projekt.id)),
    // Projekt-v2 exportiert die kanonisch mit Standardwerten aufgefuellten
    // Eingaben. Roh gespeicherte Teilobjekte und ihre aufgefuellte Form sind
    // fachlich identisch; verglichen wird deshalb dieselbe kanonische Lesesicht.
    waende: store.listeElemente().map(e => ({ id: e.id, name: e.name, we: e.wandelement, ein: store.holeEingaben(e.id) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  const standVorher = vergleich();

  // 11b) Export als ZIP ---------------------------------------------------
  const zipVor = zipCalls.length;
  baum('prj-zip', prjA.projekt.id);
  await warte();
  ok('[L-13] Export erzeugt genau EIN ZIP', zipCalls.length === zipVor + 1);
  const archivDateien = zipCalls[zipCalls.length - 1].files;
  const namen = archivDateien.map(d => d.name);
  ok('[L-13] Archiv traegt projekt.json, beide Waende und beide Planbilder',
    namen.length === 5
    && namen.some(n => n.endsWith('/projekt.json'))
    && namen.filter(n => n.includes('/waende/')).length === 2
    && namen.filter(n => n.includes('/plaene/')).length === 2);
  ok('[L-13] alles liegt unter EINEM Wurzelordner',
    namen.every(n => n.startsWith('SEMBLA_Projekt_Archivprojekt/')));
  ok('[L-13] Planbilder liegen unter ihrer Geschoss-Kennung',
    namen.includes(`SEMBLA_Projekt_Archivprojekt/plaene/${gsEg}.png`)
    && namen.includes(`SEMBLA_Projekt_Archivprojekt/plaene/${gsOg}.webp`));
  ok('[L-12] KEIN Bauteilkatalog im Archiv, nur seine Referenz',
    !namen.some(n => /katalog/i.test(n))
    && JSON.parse(archivDateien.find(d => d.name.endsWith('projekt.json')).data).katalog === 'kat-nichtdabei');
  ok('[L-13] die Wanddateien bleiben SEMBLA-Projekt v2 (unveraendertes Format)',
    archivDateien.filter(d => d.name.includes('/waende/'))
      .every(d => { const o = JSON.parse(d.data); return o.format === 'SEMBLA-Projekt' && o.version === 2; }));
  ok('[L-13] die Zuordnung steht ausdruecklich in wand.datei', (() => {
    const m = JSON.parse(archivDateien.find(d => d.name.endsWith('projekt.json')).data);
    return MAPPE.alleWaende(m).every(({ wand }) => !!wand.datei && namen.includes('SEMBLA_Projekt_Archivprojekt/' + wand.datei));
  })());
  ok('Erfolgsmeldung nennt Wanddateien, Planbilder und den fehlenden Katalog',
    !trFehler() && /2 Wanddatei\(en\)/.test(trMsgTxt()) && /2 Planbild\(er\)/.test(trMsgTxt())
    && /nicht enthalten/.test(trMsgTxt()));

  const archivBytes = zipSync(archivDateien);

  // 11c) Alles loeschen — der eigentliche Zweck des Archivs ----------------
  globalThis.localStorage = new MemStorage();
  PLAN.setzeIndexedDB(fakeIndexedDB());
  store.migrieren();
  const leerStand = JSON.stringify([localStorage.getItem('sembla:projekte'), localStorage.getItem('sembla:elemente')]);
  ok('Browserdaten sind wirklich weg',
    store.listeProjekte().length === 0 && store.listeElemente().length === 0
    && (await PLAN.holePlan(gsEg)) === null);

  // 11d) Import des ZIP: erst Bericht, dann schreiben ----------------------
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [zipDatei('SEMBLA_Projekt_Archivprojekt.zip', archivBytes)], value: 'x' } });
  await warte();
  ok('[L-13] der Prueferbericht erscheint, bevor irgendetwas geschrieben wird',
    $('arc-overlay').hidden === false && store.listeProjekte().length === 0
    && /2 Wanddatei\(en\)/.test($('arc-bericht').innerHTML)
    && /2 Planbild\(er\)/.test($('arc-bericht').innerHTML));
  ok('[L-13] ohne Konflikt wird nicht nach Ueberschreiben gefragt', $('arc-ueber-box').hidden === true);
  $('arc-go').dispatch('click');
  await warte();
  ok('[L-13] Import abgeschlossen und Projekt aktiv',
    $('arc-overlay').hidden === true && store.aktivesProjektId() === prjA.projekt.id);
  ok('[L-13] fachlich identischer Stand (Struktur, Lage, Bemassungen, Kopfdaten, Eingaben)',
    vergleich() === standVorher);
  ok('[L-11] die Kopfdaten stehen wieder am Projekt',
    store.holeMappe().projekt.kopfdaten.bauherr === 'AWG Musterstadt');
  ok('[K-10] die Bemassung ist wieder da', MAPPE.bemassungen(store.holeMappe(), gsEg).length === 1);
  ok('[L-4] keine verwaisten und keine unverorteten Waende nach dem Import', (() => {
    const r = store.mappeReferenzen();
    return r.verwaist.length === 0 && r.unverortet.length === 0;
  })());
  const bildBytes = async (gs) => new Uint8Array(await (await PLAN.holePlan(gs)).blob.arrayBuffer());
  const gleich = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  ok('[L-13] die Planbilder sind bitgenau zurueck',
    gleich(await bildBytes(gsEg), PNG) && gleich(await bildBytes(gsOg), WEBP));
  ok('[L-9] Massstab/Bildmasse der Planbeschreibung bleiben erhalten',
    store.geschossPlan(gsEg).breite_px === 1600 && store.geschossPlan(gsEg).datei === 'eg.png');
  ok('[L-12] der fehlende Bauteilkatalog wird benannt, die Referenz bleibt',
    /kat-nichtdabei/.test(trMsgTxt()) && store.holeMappe().katalog === 'kat-nichtdabei');

  // 11e) Zweiter Import derselben Bytes: Konflikt, Abbruch, Bestaetigung ----
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [zipDatei('nochmal.zip', archivBytes)], value: 'x' } });
  await warte();
  ok('[L-13] vorhandene Kennungen werden als Konflikt gemeldet',
    $('arc-ueber-box').hidden === false && $('arc-ueber').checked === false
    && /EG-W01/.test($('arc-ueber-text').textContent));
  const standVorKonflikt = vergleich();
  $('arc-go').dispatch('click');
  await warte();
  ok('[L-13] ohne Bestaetigung wird NICHTS geschrieben',
    /ausdrückliche Bestätigung/.test($('arc-msg').textContent) && vergleich() === standVorKonflikt);
  $('arc-ueber').checked = true;
  $('arc-go').dispatch('click');
  await warte();
  ok('[L-13] mit Bestaetigung geht der Import durch — stabile Kennungen bleiben',
    $('arc-overlay').hidden === true && vergleich() === standVorKonflikt
    && !!store.holeElement(wEg) && !!store.holeElement(wOg));

  // 11f) Ordnerimport (dieselben Dateien, entpackt) ------------------------
  globalThis.localStorage = new MemStorage();
  PLAN.setzeIndexedDB(fakeIndexedDB());
  store.migrieren();
  await $('tr-ordner-import').dispatch('change', {
    target: { files: archivDateien.map(d => ordnerDatei(d.name, d.data)), value: 'x' } });
  await warte();
  ok('[L-13] der Ordnerimport zeigt denselben Bericht', $('arc-overlay').hidden === false);
  $('arc-go').dispatch('click');
  await warte();
  ok('[L-13] Ordnerimport stellt denselben Stand her wie das ZIP', vergleich() === standVorher);
  ok('[L-13] auch die Planbilder kommen aus dem Ordner mit',
    !!(await PLAN.holePlan(gsEg)) && !!(await PLAN.holePlan(gsOg)));

  // 11g) Deflate-Archiv (so packt jedes uebliche Programm) -----------------
  globalThis.localStorage = new MemStorage();
  PLAN.setzeIndexedDB(fakeIndexedDB());
  store.migrieren();
  const deflateBytes = await zipDeflate(archivDateien);
  ok('das Deflate-Archiv ist wirklich komprimiert', deflateBytes.length < archivBytes.length);
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [zipDatei('komprimiert.zip', deflateBytes)], value: 'x' } });
  await warte();
  $('arc-go').dispatch('click');
  await warte();
  ok('[L-13] ein komprimiertes ZIP wird genauso importiert', vergleich() === standVorher);

  // 11h) Rollback: der Planspeicher faellt beim ZWEITEN Bild aus -----------
  globalThis.localStorage = new MemStorage();
  store.migrieren();
  PLAN.setzeIndexedDB(fakeIndexedDBMitFehler(2));   // das ZWEITE Planbild scheitert
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [zipDatei('rollback.zip', archivBytes)], value: 'x' } });
  await warte();
  $('arc-go').dispatch('click');
  await warte(12);
  ok('[L-13] Schreibfehler ⇒ Fehlermeldung im Dialog, kein halber Stand',
    /vollständig wiederhergestellt|abgebrochen/.test($('arc-msg').textContent));
  ok('[L-13] der vorherige localStorage-Stand ist vollstaendig zurueck',
    JSON.stringify([localStorage.getItem('sembla:projekte'), localStorage.getItem('sembla:elemente')]) === leerStand
    && store.listeProjekte().length === 0 && store.listeElemente().length === 0);
  ok('[L-13] auch das bereits geschriebene Planbild wurde zurueckgenommen',
    (await PLAN.holePlan(gsEg)) === null && (await PLAN.holePlan(gsOg)) === null);
  PLAN.setzeIndexedDB(fakeIndexedDB());

  // 11i) Kaputte Archive: benannt, nicht geraten ---------------------------
  const boese = zipSync([...archivDateien, { name: '../boese.json', data: '{}' }]);
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [zipDatei('boese.zip', boese)], value: 'x' } });
  await warte();
  ok('[L-13] Traversal wird im Dialog benannt und der Import gesperrt',
    $('arc-fehler').hidden === false && /verlässt das Archiv/.test($('arc-fehler').innerHTML)
    && $('arc-go').disabled === true);
  $('arc-cancel').dispatch('click');
  ok('Abbruch schreibt nichts', store.listeProjekte().length === 0 && !!/nichts gespeichert/.test(trMsgTxt()));

  const ohneWandDatei = zipSync(archivDateien.filter(d => !d.name.includes('/waende/')));
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [zipDatei('unvollstaendig.zip', ohneWandDatei)], value: 'x' } });
  await warte();
  ok('[L-13] fehlende Wanddateien sperren den Import',
    $('arc-fehler').hidden === false && /Wanddatei/.test($('arc-fehler').innerHTML)
    && $('arc-go').disabled === true);
  $('arc-cancel').dispatch('click');

  // 11j) Der Struktur-JSON-Weg bleibt daneben bestehen ---------------------
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [zipDatei('leer.zip', zipSync([{ name: 'nur/text.txt', data: 'hallo' }]))], value: 'x' } });
  await warte();
  ok('[L-13] ein ZIP ohne projekt.json wird benannt abgewiesen',
    /kein SEMBLA-Projektarchiv/.test($('arc-fehler').innerHTML) && $('arc-go').disabled === true);
  $('arc-cancel').dispatch('click');

  globalThis.localStorage = new MemStorage();
  store.migrieren();
  const nurStruktur = JSON.parse(archivDateien.find(d => d.name.endsWith('projekt.json')).data);
  await $('tr-mappe-import').dispatch('change', {
    target: { files: [kFile(JSON.stringify(nurStruktur), 'nur-struktur.json')], value: 'x' } });
  await warte();
  ok('der Struktur-JSON-Weg funktioniert unveraendert weiter',
    store.holeMappe()?.projekt.id === prjA.projekt.id && store.listeElemente().length === 0);
  ok('… und sagt ausdruecklich, dass Waende und Planbilder NICHT dabei waren',
    /nur Struktur/.test(trMsgTxt()));
  ok('die Oberflaeche beschriftet beide Wege eindeutig',
    /Export \(ZIP\)/.test(html) && /nur Struktur \(JSON\)/.test(html)
    && /Projektordner wählen/.test(html) && /webkitdirectory/.test(html));
  ok('der Einzelwand-Weg ist unberuehrt vorhanden',
    /id="f-import"/.test(html) && /id="exp-go"/.test(html)
    // Das Verhalten selbst wurde oben ueber die echte Ereignisdelegation
    // geprueft; dynamisch von `knopf(...)` erzeugtes Markup ist kein Quellliteral.
    && checks.some(([n, c]) => n === 'Klick auf „Export" oeffnet den Dialog' && c));
}

// --- 12) Neuanlage speichert den katalogbasierten Zuschnitt (#15/#62) -----
// Der reale Weg: Wand ueber den ECHTEN Anlegen-Handler erzeugen und danach SOFORT das
// gespeicherte JSON lesen — ohne Modul 1 auch nur zu beruehren. Frueher stand hier der
// Altstand-Fallback des Cores (1100 mm) im Element, weil `buildWall` VOR der
// Katalogvorbelegung lief; Zeichnung und Stueckliste lasen damit einen falschen Stand.
{
  const warte = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
  const BOM = await import("../../docs/shared/sembla-bom.js");
  const ZEI = await import("../../docs/shared/sembla-zeichnung.js");
  const stuecke = (w) => (w.tension_columns || []).flatMap(c => (c.segments || []).flatMap(sg => sg.stuecke || []));

  // Frischer Stand: eigenes Projekt, eigenes Geschoss, KEIN Katalog.
  const altStand = localStorage.getItem('sembla:kataloge');
  const altAktiv = localStorage.getItem('sembla:aktiv:katalog');
  localStorage.removeItem('sembla:kataloge'); localStorage.removeItem('sembla:aktiv:katalog');
  const prjZ = projektAnlegen('Zuschnittprojekt');
  const gsZ = store.aktivesGeschossId();
  store.setzeProjektKatalog(null);
  // #56: Das automatische Nachladen haing am entfallenen Anlegen-Handler von Modul 0.
  // Der Katalog wird jetzt ausdruecklich im Katalog-Popup geladen — ueber den echten Knopf.
  $('k-vorlage').dispatch('click');
  await warte();
  ok('#56 der Standardkatalog wird ueber den echten Katalog-Knopf geladen und zugeordnet',
    !!store.holeKatalog() && /Standardkatalog geladen und zugeordnet/.test($('k-msg').textContent));

  // Jeden Schreibvorgang am Wandspeicher mitschreiben: so faellt ein initial persistierter
  // Fallback-Stand auf, selbst wenn er unmittelbar danach ueberschrieben wuerde (#15/#62).
  const schreibfolge = [];
  const echtesSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { if (k === 'sembla:elemente') schreibfolge.push(String(v)); return echtesSetItem(k, v); };
  const idZ = wandAnlegen(gsZ, { name: 'Zuschnitt-Wand', laenge: 2000, hoehe: 2600 });
  localStorage.setItem = echtesSetItem;
  const wZ = store.holeElement(idZ).wandelement;   // GESPEICHERTER Stand

  const neueStaende = schreibfolge.filter(v => !!JSON.parse(v)[idZ]);
  ok('#15 die Wand wird GENAU EINMAL in den Wandspeicher geschrieben',
    neueStaende.length === 1);
  // Geprueft wird der EINTRAG DIESER WAND in jedem geschriebenen Stand — fuer Altbestand
  // im uebrigen Speicher gilt der 1100-mm-Fallback weiterhin.
  ok('#62 zu KEINEM Zeitpunkt stand ein 1100-mm-Zwischenstand dieser Wand im Speicher',
    neueStaende.length > 0
    && neueStaende.every(v => !JSON.stringify(JSON.parse(v)[idZ]).includes('1100')));
  ok('#15 schon der erste geschriebene Stand traegt Kataloglaengen und Reststueck',
    JSON.parse(neueStaende[0])[idZ].wandelement.prestress.rod_rest_mm === 100
    && JSON.stringify(JSON.parse(neueStaende[0])[idZ].wandelement.prestress.rod_lengths_mm) === '[1000,850]');
  ok('[P-18] und im selben Stand stehen bereits die vorbelegten Verwendungsstellen',
    (JSON.parse(neueStaende[0])[idZ].eingaben?.planung?.produkte?.rollen?.rod_std || []).length === 2);
  ok('#15 der Anlagepfad benennt den Zuschnitt genau einmal — nie einen Zwischenstand',
    /Reststück 100 mm/.test(WA.vorspannText(WA.vorspannVorgaben(
      store.holeElement(idZ).eingaben, store.holeKatalog()))));

  ok('#15 der geladene Katalog belegt die Verwendungsstellen vor ([P-18])',
    !!store.holeKatalog() && store.holeProdukte(1, idZ).rollen.rod_std.length === 2);
  ok('#15 das unmittelbar gespeicherte JSON traegt die Kataloglaengen',
    JSON.stringify(wZ.prestress.rod_lengths_mm) === '[1000,850]' && wZ.rod_mm === 1000);
  ok('#15 [Z-6] das Reststueck steht in der Vorspannung und oben in den Stuecken',
    wZ.prestress.rod_rest_mm === 100
    && wZ.tension_columns.every(c => c.segments.every(sg =>
         sg.z1_mm !== wZ.height_mm || sg.stuecke[sg.stuecke.length - 1].art === 'rest')));
  ok('#62 keine erfundene 1100-mm-Stange im gespeicherten Stand',
    !JSON.stringify(wZ).includes('1100')
    && stuecke(wZ).every(s => s.len_mm === 1000 || s.len_mm === 850 || s.art !== 'standard'));
  ok('#62 Baustellenstueckliste und Zeichnung leiten OHNE Modul 1 denselben Satz ab',
    BOM.einbauteile(wZ).length === stuecke(wZ).length
    && BOM.semblaBomItems(wZ).filter(p => /^rod_/.test(p.key) && p.menge > 0)
         .every(p => stuecke(wZ).some(s => s.len_mm === p.mass_mm))
    && ZEI.einbauteilZeilen(wZ).length > 0 && ZEI.konfliktZeilen(wZ).length === 0);

  // Katalog OHNE Gewindestange: keine Auswahl -> keine erfundene Laenge, sichtbar offen.
  const leer = { format: 'SEMBLA-Bauteilkatalog', version: KAT.KATALOG_VERSION, name: 'Katalog ohne Stangen',
    produkte: [{ id: 'stein-i3-375', kategorie: 'stein', bezeichnung: 'Stein i3',
                 einheit: 'Stk', preis: 9.5, breite_mm: 375, rollen: ['i3'] }] };
  store.importiereKatalogText(JSON.stringify(leer));
  const idL = wandAnlegen(gsZ, { name: 'Wand ohne Stangen', laenge: 2000, hoehe: 2600 });
  const wL = store.holeElement(idL).wandelement;
  ok('#62 ohne gewaehlte Standardlaenge steht KEIN rod_lengths_mm:[1100] im Neubestand',
    wL.prestress.rod_lengths_mm.length === 0 && wL.rod_mm === null
    && !JSON.stringify(wL).includes('1100'));
  ok('#62 und kein reales 1100-mm-Stueck', stuecke(wL).length === 0 && BOM.einbauteile(wL).length === 0);
  ok('der fehlende Zuschnitt bleibt sichtbar offen ([Z-1])',
    wL.validation.zuschnitt_konflikte.length > 0
    && wL.validation.zuschnitt_konflikte.every(k => k.grund === 'keine_standardlaenge')
    && /keine Gewindestangen-Standardlänge/.test(WA.vorspannText(WA.vorspannVorgaben(
         store.holeElement(idL).eingaben, store.holeKatalog()))));

  if (altStand !== null) localStorage.setItem('sembla:kataloge', altStand);
  if (altAktiv !== null) localStorage.setItem('sembla:aktiv:katalog', altAktiv);
}

// --- 9b) Zentraler Export der GESAMTSTÜCKLISTE (#44) ----------------------
// Gefahren wird der ECHTE Produktpfad: Baumliste -> „Export" -> Ebene/Preise im Dialog ->
// „ZIP herunterladen". Geprueft werden Dateiname, Ebenenbezug, CSV-Inhalt und dass die
// Mengen BITGLEICH die Summe der kanonischen Wandstuecklisten sind.
{
  const gsG = projektAnlegen('Exportprojekt #44') && store.aktivesGeschossId();
  // #56: Katalog ausdruecklich laden — er belegt die Verwendungsstellen der Waende vor
  // ([P-18]) und ist damit Voraussetzung fuer die Einbauteile in der Gesamtstueckliste.
  $('k-vorlage').dispatch('click');
  await new Promise(r => setTimeout(r, 0));
  const idG1 = wandAnlegen(gsG, { name: 'Export Wand 1', laenge: 3000, hoehe: 3000 });
  const idG2 = wandAnlegen(gsG, { name: 'Export Wand 2', laenge: 2000, hoehe: 2600 });
  const gsName = MAPPE.findeGeschoss(store.holeMappe(), gsG).geschoss.name;
  const csvZeilen = (t) => t.split('\n').map(z => z.split(';'));
  /** Reine Erwartung: Summe der kanonischen Wandstuecklisten. */
  const erwarteteMengen = (ids) => { const m = new Map();
    for (const id of ids) for (const p of stuecklistePositionen(store.holeElement(id).wandelement,
        store.holeEingaben(id), store.holeKatalog())) {
      const k = [p.key, p.unit, p.art || '', p.fertigmass_mm ?? ''].join('|');
      m.set(k, (m.get(k) || 0) + p.menge); }
    return m; };

  ok('#44 Export-Dialog hat das Gesamtstücklisten-Häkchen (nicht vorausgewählt)',
    /<input type="checkbox" value="gesamt"><span>/.test(html)
    && /Gesamtstückliste der aktiven Ebene \(CSV\)/.test(html));
  ok('#44 Ebene und Preisschalter stehen AUSSERHALB des Häkchen-Labels',
    /id="exp-gesamt-optionen"/.test(html)
    && html.indexOf('id="exp-gesamt-optionen"') > html.indexOf('value="gesamt"')
    && !/value="gesamt">[\s\S]*?<select/.test(html.split('</label>')[html.split('</label>').findIndex(t => t.includes('value="gesamt"'))] || ''));

  // (a) Geschossebene mit Preisen
  zipCalls.length = 0;
  baum('wand-export', idG1);
  $('exp-ebene').value = 'geschoss'; $('exp-preise').checked = true;
  $('exp-overlay')._sel = [{ value: 'gesamt' }];
  $('exp-go').dispatch('click');
  const gFiles = zipCalls.length ? zipCalls[0].files : [];
  ok('#44 Gesamt-Häkchen erzeugt genau eine CSV', gFiles.length === 1 && /\.csv$/.test(gFiles[0].name));
  ok('#44 Dateiname nennt Ebene und Bezug',
    gFiles[0].name === 'Gesamtstueckliste_Geschoss_' + store.sicherName(gsName) + '.csv');
  const gCsv = gFiles.length ? gFiles[0].data : '';
  ok('#44 CSV nennt Blatt, Ebene und Geschoss',
    /^SEMBLA – Gesamtstückliste Geschoss/.test(gCsv)
    && new RegExp('Ebene;Geschoss').test(gCsv) && gCsv.includes('Geschoss;' + gsName));
  ok('#44 CSV nennt beide Wände als Herkunft und ist vollständig',
    /Wände;2 von 2/.test(gCsv) && /Vollständigkeit;vollständig/.test(gCsv)
    && gCsv.includes('Export Wand 1') && gCsv.includes('Export Wand 2'));
  ok('#44 CSV-Mengen sind bitgleich die Summe der Wandstücklisten', (() => {
    const zeilen = csvZeilen(gCsv);
    const kopf = zeilen.findIndex(z => z[0] === 'Einbauteil');
    const ist = new Map();
    for (const z of zeilen.slice(kopf + 1)) {
      if (!z[0] || z[0].startsWith('Summe netto') || z.length < 7) continue;
      // Spalten: Einbauteil;Art;Fertigmaß;Einheit;Menge;Herkunft;IDs;...
      const art = z[1] ? ({ '■': 'standard', '◆': 'sonder', '▲': 'rest' })[z[1][0]] || '' : '';
      const k = [null, z[3], art, z[2] === '' ? '' : +z[2]].join('|');
      ist.set(k, (ist.get(k) || 0) + +z[4]);
    }
    const soll = new Map();
    for (const [k, v] of erwarteteMengen([idG1, idG2])) {
      const t = k.split('|'); const k2 = [null, t[1], t[2], t[3] === '' ? '' : +t[3]].join('|');
      soll.set(k2, (soll.get(k2) || 0) + v);
    }
    return ist.size === soll.size && [...soll].every(([k, v]) => Math.abs((ist.get(k) ?? NaN) - v) < 1e-9);
  })());
  ok('#44 CSV führt die Einbauteil-IDs als Wand-ID:ID',
    new RegExp(idG1 + ':GS-k').test(gCsv) && new RegExp(idG2 + ':GS-k').test(gCsv));

  // (b) Preisschalter im Export
  zipCalls.length = 0;
  baum('wand-export', idG1);
  $('exp-ebene').value = 'geschoss'; $('exp-preise').checked = false;
  $('exp-overlay')._sel = [{ value: 'gesamt' }];
  $('exp-go').dispatch('click');
  const oCsv = zipCalls.length ? zipCalls[0].files[0].data : '';
  ok('#44 Export ohne Preise: keine EP/GP-Spalte, kein Summenbetrag',
    !/EP \(EUR\)/.test(oCsv) && !/GP \(EUR\)/.test(oCsv) && !/Summe netto/.test(oCsv));
  ok('#44 Export ohne Preise: Mengen, Herkunft und IDs unverändert', (() => {
    const nurMengen = t => csvZeilen(t).filter(z => z.length > 6 && z[0] && !z[0].startsWith('Summe netto'))
      .map(z => [z[0], z[3], z[4], z[5], z[6]].join('|')).join('\n');
    return nurMengen(oCsv) === nurMengen(gCsv); })());

  // (c) Projektebene und Wandebene
  for (const [ebene, ids, rumpf] of [['projekt', [idG1, idG2], 'Gesamtstueckliste_Projekt_Exportprojekt_44'],
      ['wand', [idG1], 'Baustellenstueckliste_Wand_Export_Wand_1']]) {
    zipCalls.length = 0;
    store.setzeAktiv(idG1);
    baum('wand-export', idG1);
    $('exp-ebene').value = ebene; $('exp-preise').checked = true;
    $('exp-overlay')._sel = [{ value: 'gesamt' }];
    $('exp-go').dispatch('click');
    const f = zipCalls.length ? zipCalls[0].files[0] : { name: '', data: '' };
    ok(`#44 Ebene ${ebene}: Dateiname und Ebenenbezug`, f.name === rumpf + '.csv'
      && new RegExp('Ebene;' + (ebene === 'wand' ? 'Wand' : 'Projekt')).test(f.data));
    ok(`#44 Ebene ${ebene}: Mengen = Summe genau dieser ${ids.length} Wand/Wände`, (() => {
      const zeilen = csvZeilen(f.data); const kopf = zeilen.findIndex(z => z[0] === 'Einbauteil');
      const summe = zeilen.slice(kopf + 1).filter(z => z[0] && !z[0].startsWith('Summe netto') && z.length > 6)
        .reduce((a, z) => a + +z[4], 0);
      const soll = [...erwarteteMengen(ids).values()].reduce((a, v) => a + v, 0);
      return Math.abs(summe - soll) < 1e-9; })());
  }

  // (d) Der bisherige Wandexport bleibt unveraendert
  zipCalls.length = 0;
  baum('wand-export', idG1);
  $('exp-overlay')._sel = [{ value: 'stueckliste' }];
  $('exp-go').dispatch('click');
  const wFiles = zipCalls.length ? zipCalls[0].files : [];
  ok('#44 der bisherige Wandexport ist unberührt (2 Dateien, alte Namen)',
    wFiles.length === 2 && /^Baustellenstueckliste_/.test(wFiles[0].name)
    && /^Einbauteile_Gewindestangen_/.test(wFiles[1].name));
  ok('#44 und liefert bitgleich die bestehende Ableitung', (() => {
    const soll = baueDateien(store.projektObjekt(idG1), ['stueckliste'], store.holeKatalog());
    return wFiles[0].data === soll[0].data && wFiles[1].data === soll[1].data; })());

  // (e) Nicht aktivierbare Ebene: benannt, kein ZIP. Damit der dokumentierte Rueckfall von
  // `aktivesGeschoss()` (genau EIN Geschoss ist eindeutig) nicht greift, bekommt das Projekt
  // vorher ein zweites Geschoss — erst dann ist „kein aktives Geschoss" wirklich unbestimmt.
  zipCalls.length = 0;
  store.setzeMappe(MAPPE.fuegeGeschossHinzu(store.holeMappe(), store.aktivesGebaeude().id, 'OG Export').mappe);
  store.setzeAktivesGeschoss(null);
  baum('wand-export', idG1);
  $('exp-ebene').value = 'geschoss'; $('exp-preise').checked = true;
  $('exp-overlay')._sel = [{ value: 'gesamt' }];
  $('exp-go').dispatch('click');
  ok('#44 ohne aktives Geschoss wird die Ebene benannt statt ersetzt',
    zipCalls.length === 0 && /Gesamtstückliste/.test(trMsgTxt()) && /Kein aktives Geschoss/.test(trMsgTxt()));
  store.setzeAktivesGeschoss(gsG);

  // (f) DER WEG OHNE AKTIVE WAND: Projekt-/Gebäude-/Geschossebene ist zentral exportierbar,
  // auch wenn keine Wand aktiv ist. Geoeffnet wird der ECHTE Dialog ueber die Baumliste.
  {
    store.setzeAktiv(null);
    ok('#44 Ausgangslage: keine aktive Wand', store.aktivId() === null);
    ok('#44 Baumliste bietet „Gesamtstückliste" am aktiven Geschoss und am aktiven Projekt', (() => {
      const b = $('tr-baum').innerHTML;
      return new RegExp('data-act="gs-gesamt" data-id="' + gsG + '">Gesamtstückliste').test(b)
        && /data-act="prj-gesamt"[^>]*>Gesamtstückliste/.test(b); })());
    ok('#44 an einem NICHT aktiven Geschoss ist der Knopf gesperrt und benennt den Weg ([L-10])', (() => {
      const b = $('tr-baum').innerHTML;
      const treffer = [...b.matchAll(/data-act="gs-gesamt" data-id="([^"]+)"([^>]*)>/g)];
      return treffer.length >= 2
        && treffer.some(t => t[1] !== gsG && /disabled/.test(t[2]) && /aktiv setzen/.test(t[2]))
        && treffer.some(t => t[1] === gsG && !/disabled/.test(t[2])); })());

    zipCalls.length = 0;
    baum('gs-gesamt', gsG);
    ok('#44 der Dialog öffnet ohne Wand und nennt die Ebene statt einer Wand',
      $('exp-overlay').hidden === false && $('exp-titel').textContent === 'Gesamtstückliste exportieren'
      && $('exp-bezug').textContent === 'Ebene:'
      && /Geschoss „.+“ · Projekt „Exportprojekt #44“/.test($('exp-name').textContent)
      && $('exp-ebene').value === 'geschoss');

    // Wandbezogene Häkchen dürfen ohne Wand nicht ausgeführt werden.
    $('exp-overlay')._sel = [{ value: 'stueckliste' }, { value: 'gesamt' }];
    $('exp-go').dispatch('click');
    ok('#44 wandbezogene Auswahl ohne Wand wird benannt und NICHT ausgeführt',
      zipCalls.length === 0 && /Ohne aktive Wand/.test(trMsgTxt()) && trFehler());

    // Die Gesamtstückliste selbst läuft — ohne jede Wandaktivierung.
    $('exp-overlay')._sel = [{ value: 'gesamt' }];
    $('exp-go').dispatch('click');
    const f = zipCalls.length ? zipCalls[0].files : [];
    ok('#44 ohne aktive Wand entsteht genau die Gesamtstückliste der Ebene',
      zipCalls.length === 1 && f.length === 1
      && f[0].name === 'Gesamtstueckliste_Geschoss_' + store.sicherName(gsName) + '.csv');
    ok('#44 der ZIP-Name folgt der Ebene, nicht einer Wand',
      zipCalls[0].name === 'SEMBLA_Gesamtstueckliste_Geschoss_' + store.sicherName(gsName) + '.zip');
    ok('#44 Inhalt ist bitgleich die Summe beider Wände', (() => {
      const zeilen = csvZeilen(f[0].data); const kopf = zeilen.findIndex(z => z[0] === 'Einbauteil');
      const summe = zeilen.slice(kopf + 1).filter(z => z[0] && !z[0].startsWith('Summe netto') && z.length > 6)
        .reduce((a, z) => a + +z[4], 0);
      const soll = [...erwarteteMengen([idG1, idG2]).values()].reduce((a, v) => a + v, 0);
      return Math.abs(summe - soll) < 1e-9 && /Wände;2 von 2/.test(f[0].data); })());
    ok('#44 dabei wird nichts still aktiviert',
      store.aktivId() === null && store.aktivesGeschossId() === gsG);

    // Projektebene über den Projektknopf — derselbe Weg, andere Vorauswahl.
    zipCalls.length = 0;
    baum('prj-gesamt', store.holeMappe().projekt.id);
    ok('#44 Projektknopf öffnet den Dialog mit Projektebene',
      $('exp-ebene').value === 'projekt' && /^Projekt „Exportprojekt #44“$/.test($('exp-name').textContent));
    $('exp-overlay')._sel = [{ value: 'gesamt' }];
    $('exp-go').dispatch('click');
    ok('#44 Projektebene ohne aktive Wand exportiert',
      zipCalls.length === 1 && zipCalls[0].files[0].name === 'Gesamtstueckliste_Projekt_Exportprojekt_44.csv');

    // Zurück in den Wandmodus: die wandbezogenen Häkchen sind wieder benutzbar.
    store.setzeAktiv(idG1);
    zipCalls.length = 0;
    baum('wand-export', idG1);
    ok('#44 mit Wand ist der Dialog wieder der Wandexport',
      $('exp-titel').textContent === 'Wand exportieren' && $('exp-bezug').textContent === 'Wand:'
      && $('exp-name').textContent === 'Export Wand 1');
    $('exp-overlay')._sel = [{ value: 'stueckliste' }];
    $('exp-go').dispatch('click');
    ok('#44 der Wandexport funktioniert danach unverändert',
      zipCalls.length === 1 && zipCalls[0].files.length === 2
      && /^Baustellenstueckliste_/.test(zipCalls[0].files[0].name));

    // Der Häkchen-Zustand selbst: ohne Wand abgewählt UND gesperrt, mit Wand unverändert zurück.
    const haken = [{ value: 'projekt', checked: true }, { value: 'gesamt', checked: false }];
    $('exp-overlay')._sel = haken;
    baum('gs-gesamt', gsG);
    ok('#44 ohne Wand: wandbezogene Häkchen werden abgewählt und gesperrt (keine Vortäuschung)',
      haken[0].checked === false && haken[0].disabled === true && haken[1].checked === true);
    baum('wand-export', idG1);
    ok('#44 mit Wand: der vorherige Häkchen-Stand kommt unverändert zurück',
      haken[0].checked === true && haken[0].disabled === false);
    $('exp-overlay')._sel = [];
  }
}

// --- 10) KEIN Autoload beim Initialisieren (Issue #33) --------------------
// Steht bewusst am ENDE: der Block erzeugt eine ZWEITE Instanz des Modul-0-Codes.
// Die haengt sich ebenfalls an store.abonniere und wuerde die Baumliste der ersten
// Instanz ueberschreiben — nach allen Oberflaechenpruefungen ist das folgenlos.
// Frischer Sandkasten (eigenes localStorage, eigenes DOM-Double, eigener fetch-Zaehler):
// der echte Modul-0-Code wird erneut initialisiert und darf dabei nichts laden/schreiben.
const altStorage = globalThis.localStorage, altDocument = globalThis.document;
const frischeAufrufe = [];
globalThis.localStorage = new MemStorage();
globalThis.document = {
  _e:{}, getElementById(id){ return this._e[id] || (this._e[id] = new El(id)); },
  createElement(){ return new El('_'); }, querySelector(){ return null; },
  addEventListener(){}, head:{ appendChild(){} },
  body:{ appendChild(){}, insertBefore(){}, firstChild:null },
};
globalThis.fetch = async (pfad) => { frischeAufrufe.push(String(pfad)); return { ok:true, status:200, text: async () => '{}' }; };
new Function(...BINDUNGEN, src)(
  () => {}, MODULE, store, WA, baueDateien, gesamtstuecklisteDateien,
  GES.umfang, GES.gesamtDaten, GES.dateiRumpf,
  () => {}, entpacke, ARCHIV, KAT, MAPPE, PLAN);
const frischKatalog = globalThis.localStorage.getItem('sembla:kataloge');
const frischElemente = globalThis.localStorage.getItem('sembla:elemente');
globalThis.localStorage = altStorage; globalThis.document = altDocument; installFetch();
ok('Initialisierung ruft KEIN fetch auf (kein Autoload)', frischeAufrufe.length === 0);
ok('Initialisierung legt keinen Katalog an', frischKatalog === null);
ok('Initialisierung legt kein Wandelement an', frischElemente === null);
// #56: Der Anlegen-Handler ist entfallen und mit ihm sein Nachladen des Standardkatalogs —
// geblieben sind Musterwand und Standardkatalog, beide in Klick-Handlern. Beim
// Initialisieren wird weiterhin nichts geholt.
ok('Vorlagen werden ausschliesslich in Klick-Handlern geladen',
  (src.match(/vorlageText\(/g) || []).length === 3           // 1 Definition + 2 Aufrufe
  && (src.match(/fetch\(/g) || []).length === 1);


let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
