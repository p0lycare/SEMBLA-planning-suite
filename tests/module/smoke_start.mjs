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
// Manche Bedienwege stellen ZWEI getrennte Abfragen hintereinander — seit #85 das
// Loeschen einer Struktur: erst die Sicherheitsabfrage, dann die Frage nach den
// zugeordneten Wandelementen. `confirmFolge` beantwortet sie EINZELN und in genau
// dieser Reihenfolge; ist die Folge leer, gilt weiter `confirmAntwort`. Der Test
// sagt damit nie pauschal „Ja zu allem“, und die geleerte Folge belegt zugleich,
// WIE VIELE Abfragen wirklich kamen. `confirmTexte` haelt ihren Wortlaut fest.
let confirmFolge = [];
const confirmTexte = [];
globalThis.confirm = (t) => {
  confirmTexte.push(String(t == null ? '' : t));
  return confirmFolge.length ? confirmFolge.shift() : confirmAntwort;
};

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
const { MODULE, mountNavbar } = await import("../../docs/shared/navbar.js");
const { baueDateien, gesamtstuecklisteDateien, stuecklistePositionen } = await import("../../docs/shared/sembla-export.js");
const GES = await import("../../docs/shared/sembla-gesamtstueckliste.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");
const MAPPE = await import("../../docs/shared/sembla-projektmappe.js");
// Seit #88 rechnet Modul 0 die Initialposition einer zugeordneten Wand — mit der
// KANONISCHEN Lage-Mathematik (Rastermass, halbe Wandbreite, Lagepruefung).
const CON = await import("../../docs/shared/sembla-constraints.js");
const PLAN = await import("../../docs/shared/sembla-plan.js");
const ARCHIV = await import("../../docs/shared/sembla-archiv.js");
const { entpacke, zipSync } = await import("../../docs/shared/zip.js");

// --- Produktcode aus docs/index.html laden --------------------------------
const html = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
const modScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const src = modScript.replace(/^\s*import .*?;\s*$/gm, "");   // Imports -> Funktionsargumente
const BINDUNGEN = ["mountNavbar","MODULE","store","WA","baueDateien","gesamtstuecklisteDateien",
                   "gesamtUmfang","gesamtDaten","gesamtDateiRumpf","downloadZip",
                   "entpacke","ARCHIV","KAT","MAPPE","CON","PLAN"];
const zipCalls = [];                                          // downloadZip-Aufrufe des Produktcodes
new Function(...BINDUNGEN, src)(
  () => {}, MODULE, store, WA, baueDateien, gesamtstuecklisteDateien,
  GES.umfang, GES.gesamtDaten, GES.dateiRumpf,
  (name, files) => zipCalls.push({ name, files }),
  entpacke, ARCHIV, KAT, MAPPE, CON, PLAN
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
/**
 * Projekt ueber den echten Dialog anlegen (und aktiv setzen). Seit #68 belegt die Anlage
 * den SEMBLA-Standardkatalog vor; die historischen Aufrufer dieses Helfers erwarten aber
 * ein Projekt OHNE Katalog — deshalb wird hier ausdruecklich abgewaehlt. Die Vorbelegung
 * selbst prueft der eigene Abschnitt „#68 Projektanlage“.
 */
async function projektAnlegen(name, kopf = {}, katalog = ''){
  $('tr-projekt-neu').dispatch('click');
  $('pp-name').value = name;
  for (const [feld, wert] of Object.entries(kopf)) $('pp-' + feld).value = wert;
  $('pp-katalog').value = katalog;
  await $('pp-speichern').dispatch('click');
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
const prj0 = await projektAnlegen('Testprojekt');
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

// --- 4) Zentraler hierarchischer Export (#67): Wandebene ---------------------
// Der Dialog bietet je Ebene NUR die passenden Dateien; die zyklusfremden Ausgaben
// (Nachweis, Montage, Zeichnung, IFC, Lattenzuschnitt) sind aus dem Dialog raus.
ok('#67 keine zyklusfremden Haekchen mehr im Dialog-Markup',
  !/value="nachweis"/.test(html) && !/value="zeichnung"/.test(html)
  && !/value="montage"/.test(html) && !/value="ifc"/.test(html) && !/value="zuschnitt"/.test(html));
ok('#67 der Dialog rendert seine Optionen je Ebene, ohne Ebenen-Auswahlfeld',
  /id="exp-opts"/.test(html) && !/id="exp-ebene"/.test(html));
ok('#67 Wandebene bietet genau Wanddatei und Baustellenstueckliste',
  JSON.stringify(ARCHIV.exportOptionen('wand')) === JSON.stringify(['wand', 'stueckliste']));
ok('#67 EIN Exportzugang je Eintrag: keine Alt-Knoepfe mehr im Markup',
  !/prj-zip/.test(html) && !/prj-json/.test(html) && !/prj-gesamt/.test(html) && !/gs-gesamt/.test(html)
  // knopf() baut das data-act-Attribut erst zur Laufzeit — im Quelltext stehen die Schluessel.
  && /'prj-export'/.test(html) && /'gs-export'/.test(html)
  && new RegExp('data-act="prj-export"').test($('tr-baum').innerHTML));

// Export ueber den echten Produktpfad: Baumknopf „Exportieren" -> Dialog -> ZIP-Button.
// Die aktiven Zeiger duerfen dabei weder gelesen werden muessen noch sich aendern.
const aktivId = store.aktivId();
const zeigerStand = () => JSON.stringify([store.aktivesProjektId(), store.aktivesGeschossId(), store.aktivId()]);
const zeiger0 = zeigerStand();
baum('wand-export', aktivId);
ok('Klick auf „Exportieren" oeffnet den Dialog', $('exp-overlay').hidden === false
  && $('exp-titel').textContent === 'Wand exportieren');
ok('#67 die gerenderten Optionen sind genau die der Wandebene',
  /value="wand"/.test($('exp-opts').innerHTML) && /value="stueckliste"/.test($('exp-opts').innerHTML)
  && !/value="gesamt"/.test($('exp-opts').innerHTML) && !/value="mappe"/.test($('exp-opts').innerHTML)
  && !/value="katalog"/.test($('exp-opts').innerHTML));

// Nur die Baustellenstueckliste ist gewaehlt (wie ein Nutzer, der die Wanddatei abwaehlt).
$('exp-overlay')._sel = [{ value: 'stueckliste' }];
$('exp-go').dispatch('click');
ok('#67 Baustellenstueckliste: ZIP mit genau zwei CSVs', zipCalls.length === 1
  && zipCalls[0].files.length === 2
  && /^Baustellenstueckliste_/.test(zipCalls[0].files[0].name)
  && /^Einbauteile_Gewindestangen_/.test(zipCalls[0].files[1].name));
ok('#67 bitgleich die bestehende Wandableitung (kein zweiter Mengenpfad)', (() => {
  const soll = baueDateien(store.projektObjekt(aktivId), ['stueckliste'], null);
  return zipCalls.length && zipCalls[0].files[0].data === soll[0].data
    && zipCalls[0].files[1].data === soll[1].data; })());
ok('#67 ZIP-Name folgt Ebene und Wand',
  zipCalls.length && zipCalls[0].name === 'SEMBLA_Export_Wand_' + ARCHIV.sicherStamm('Wand kaputt') + '.zip');
ok('Dialog schliesst nach dem Export', $('exp-overlay').hidden === true);

// --- 4a) #81: Mengenfassung der Baustellenstueckliste ist im Dialog waehlbar ---------------
// Der ECHTE Modul-0-Pfad an einer Wand MIT gespeicherter Mengenuebersteuerung: Exportdialog
// oeffnen, die angepasste Fassung waehlen, ZIP-Bytes pruefen. Geprueft wird an den erzeugten
// Dateien, nicht an einem Zwischenstand — und ausdruecklich auch, dass die Voreinstellung
// „berechnet“ die bisherige Datei unveraendert laesst.
{
  const EXP = await import("../../docs/shared/sembla-export.js");
  const wandId = aktivId;
  // Uebersteuerung setzen — ueber den EINEN Schreibweg der Speicherschicht, den Modul 4 nutzt.
  const posI3 = stuecklistePositionen(store.holeElement(wandId).wandelement,
    store.holeEingaben(wandId), null).find(p => p.key === 'i3');
  const kennung = store.mengenKennung(posI3);
  store.setzeMengenUebersteuerung(kennung, 99, wandId);
  const berechnet = posI3.menge;
  ok('#81 Ausgangslage: eine gespeicherte Mengenuebersteuerung an der aktiven Wand',
    store.holeMengen(wandId)[kennung] === 99 && berechnet !== 99);

  ok('#81 der Dialog bietet die Fassungswahl im Markup an',
    /id="exp-stueckliste-optionen"/.test(html)
    && /id="exp-fassung-berechnet"[^>]*checked/.test(html)
    && /id="exp-fassung-angepasst"/.test(html));

  // (a) Voreinstellung: berechnete Fassung — bitgleich dem bestehenden Wandpfad.
  zipCalls.length = 0;
  baum('wand-export', wandId);
  ok('#81 die Fassungswahl ist auf der Wandebene sichtbar und startet auf „berechnet“',
    $('exp-stueckliste-optionen').hidden === false
    && $('exp-fassung-berechnet').checked === true && $('exp-fassung-angepasst').checked === false);
  $('exp-overlay')._sel = [{ value: 'stueckliste' }];
  $('exp-go').dispatch('click');
  const csvBer = zipCalls.length ? zipCalls[0].files[0].data : '';
  ok('#81 ohne Zutun enthaelt die Datei die BERECHNETE Menge und benennt die Fassung',
    csvBer === EXP.baueDateien(store.projektObjekt(wandId), ['stueckliste'], null)[0].data
    && /\nMengen;berechnet – abgeleitet aus dem Wandelement/.test(csvBer)
    && csvBer.split('\n').map(z => z.split(';')).find(z => z[0] === posI3.label)[5] === String(berechnet));

  // (b) Angepasste Fassung — ueber genau das Bedienelement des Dialogs.
  zipCalls.length = 0;
  baum('wand-export', wandId);
  $('exp-fassung-berechnet').checked = false;
  $('exp-fassung-angepasst').checked = true;
  $('exp-overlay')._sel = [{ value: 'stueckliste' }];
  $('exp-go').dispatch('click');
  const csvAng = zipCalls.length ? zipCalls[0].files[0].data : '';
  ok('#81 gewaehlte angepasste Fassung: die manuelle Menge steht in der Datei',
    csvAng.split('\n').map(z => z.split(';')).find(z => z[0] === posI3.label)[5] === '99');
  ok('#81 die Datei benennt die gewaehlte Fassung in ihrem Kopf',
    /\nMengen;angepasst – mit den manuellen Mengen aus Modul 4 · 1 von \d+ Position\(en\) manuell/.test(csvAng));
  ok('#81 bitgleich der gemeinsamen Ableitung (kein zweiter Mengenpfad)',
    csvAng === EXP.baueDateien(store.projektObjekt(wandId), ['stueckliste'], null,
      { fassung: 'angepasst' })[0].data);
  ok('#81 die Einzelteilliste bleibt in beiden Faellen bitgleich und sagt das',
    zipCalls[0].files[1].data === EXP.baueDateien(store.projektObjekt(wandId), ['stueckliste'],
      null, { fassung: 'angepasst' })[1].data
    && zipCalls[0].files[1].data === EXP.baueDateien(store.projektObjekt(wandId),
      ['stueckliste'], null)[1].data
    && /\nMengen;berechnet – Einzelteile werden stets abgeleitet/.test(zipCalls[0].files[1].data));

  // (c) Die Wahl ist fluechtig: ein neu geoeffneter Dialog startet wieder auf „berechnet“.
  baum('wand-export', wandId);
  ok('#81 die Wahl haengt nicht aus dem vorigen Lauf nach',
    $('exp-fassung-berechnet').checked === true && $('exp-fassung-angepasst').checked === false);
  $('exp-cancel').dispatch('click');
  ok('#81 nichts davon wird gespeichert — die Uebersteuerung bleibt unveraendert stehen',
    store.holeMengen(wandId)[kennung] === 99
    && !/exp-fassung/.test(JSON.stringify(store.holeEingaben(wandId))));

  // (d) Seit #81 gilt die Wahl fuer JEDE Stuecklistendatei — auf der Projektebene also
  // fuer die Gesamtstueckliste. Sichtbar ist sie deshalb auch dort, und sie startet
  // ebenso auf „berechnet“.
  baum('prj-export', store.aktivesProjektId());
  ok('#81 auf der Projektebene ist die Fassungswahl sichtbar (Gesamtstückliste)',
    $('exp-stueckliste-optionen').hidden === false
    && $('exp-fassung-berechnet').checked === true && $('exp-fassung-angepasst').checked === false);
  $('exp-cancel').dispatch('click');

  // (e) Eine nicht anwendbare Uebersteuerung wird VOR dem Download benannt ([P-9]).
  store.setzeMengenUebersteuerung('rod_std@424242', 5, wandId);
  confirmAntwort = false;
  zipCalls.length = 0;
  baum('wand-export', wandId);
  $('exp-fassung-angepasst').checked = true;
  $('exp-overlay')._sel = [{ value: 'stueckliste' }];
  $('exp-go').dispatch('click');
  ok('#81 nicht zuordenbare Uebersteuerung: benannt vor dem Download, ohne Bestaetigung kein ZIP',
    zipCalls.length === 0 && /nichts geschrieben/.test(trMsgTxt()));
  confirmAntwort = true;
  $('exp-fassung-angepasst').checked = true;
  $('exp-overlay')._sel = [{ value: 'stueckliste' }];
  $('exp-go').dispatch('click');
  ok('#81 mit Bestaetigung: Datei entsteht, der Eintrag wird benannt und nicht angewandt',
    zipCalls.length === 1 && /rod_std@424242/.test(trMsgTxt())
    && /Übersteuerung nicht zuordenbar;rod_std@424242;/.test(zipCalls[0].files[0].data)
    && store.holeMengen(wandId)['rod_std@424242'] === 5);
  confirmAntwort = false;

  // Ausgangslage wiederherstellen: die folgenden Abschnitte rechnen mit der unveraenderten Wand.
  store.setzeMengenUebersteuerung('rod_std@424242', null, wandId);
  store.setzeMengenUebersteuerung(kennung, null, wandId);
  ok('#81 Aufraeumen: keine gespeicherte Uebersteuerung mehr an dieser Wand',
    Object.keys(store.holeMengen(wandId)).length === 0);
}

// --- 4b) Wanddatei-Option: bestehendes Format SEMBLA-Projekt v2 --------------
zipCalls.length = 0;
baum('wand-export', aktivId);
$('exp-overlay')._sel = [{ value: 'wand' }];
$('exp-go').dispatch('click');
const wDatei = zipCalls.length ? zipCalls[0].files[0] : { name: '', data: '' };
ok('#67 Wanddatei-Haekchen erzeugt genau eine JSON-Datei',
  zipCalls.length === 1 && zipCalls[0].files.length === 1
  && wDatei.name === ARCHIV.wandPfad({ id: aktivId, name: 'Wand kaputt' }));
ok('#67 die Wanddatei bleibt SEMBLA-Projekt v2 und bitgleich store.projektObjekt', (() => {
  const o = JSON.parse(wDatei.data || '{}');
  return o.format === 'SEMBLA-Projekt' && o.version === 2
    && wDatei.data === JSON.stringify(store.projektObjekt(aktivId), null, 2); })());
ok('#67 Export setzt keinen aktiven Zeiger um', zeigerStand() === zeiger0);

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
// #88: Die importierte Wand ist im Geschoss eingetragen — und liegt seit #88 sofort
// sichtbar AM GESCHOSSURSPRUNG (Richtung x, Laenge aus dem Wandelement). Ohne diese
// Initialposition waere sie im Geschosseditor unsichtbar; erfunden wird dabei nichts,
// die Laenge kommt aus dem importierten Wandelement.
ok('#88 die importierte Wand ist im Geschoss eingetragen — verortet am Geschossursprung',
  store.wandVerortung(neu.id)?.geschoss.id === gs0
  && store.wandVerortung(neu.id).wand.lage.richtung === 'x'
  && store.wandVerortung(neu.id).wand.lage.orientierung === '+x'
  && store.wandVerortung(neu.id).wand.lage.start_mm.x === 0
  && store.wandVerortung(neu.id).wand.lage.start_mm.y === CON.HALB_BREITE_MM
  && store.wandVerortung(neu.id).wand.lage.laenge_grid
     === store.holeElement(neu.id).wandelement.length_mm / CON.GRID_MM
  && /am Geschossursprung/.test(trMsgTxt()));
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
  // #68: neben dem Projektnamen ist die Bauherrenschaft die EINZIGE Kopfdaten-Eingabe;
  // Planverfasser, Phase, Plan-Nr., Index und Gez. sind ersatzlos aus dem Dialog entfernt.
  ok('#68 Projekt-Popup fuehrt nur Bauherrenschaft als Kopfdaten-Eingabe ([L-11]/[L-12])',
    /<input id="pp-bauherr"/.test(html) && !/id="pp-planverf"/.test(html)
    && !/id="pp-phase"/.test(html) && !/id="pp-plannr"/.test(html)
    && !/id="pp-index"/.test(html) && !/id="pp-gez"/.test(html)
    && /<select id="pp-katalog"/.test(html) && /\[L-11\]/.test(html) && /\[L-12\]/.test(html));

  // 8b) Mehrere Projekte nebeneinander ([L-6]) ------------------------------
  const vorher = projekte().length;
  const pB = await projektAnlegen('Halle Süd', { bauherr:'AWG eG' });
  // #68: Planverfasser und Plan-Nr. sind keine Dialogfelder mehr — sie bleiben Projekt-
  // bestand und werden hier ueber den Storage-Pfad gesetzt (Erhalt wird unten geprueft).
  store.setzeKopfdaten({ planverfasser: 'Polycare', plan_nr: '07' });
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
    && $('pp-bauherr').value === 'AWG eG');
  ok('#68 der Bearbeiten-Dialog bietet die Vorlage NICHT an — bestehende Projekte werden nie umgestellt',
    !/__vorlage__/.test($('pp-katalog').innerHTML));
  const prjVorAbbruch = prjSlot();
  $('pp-bauherr').value = 'Verworfen';
  ppAbbruchTest();
  function ppAbbruchTest(){ $('pp-cancel').dispatch('click'); }
  ok('Abbrechen im Projekt-Dialog schreibt nichts',
    prjSlot() === prjVorAbbruch && store.holeMappe().projekt.kopfdaten.bauherr === 'AWG eG');
  baum('prj-bearbeiten', pB.projekt.id);
  $('pp-bauherr').value = 'AWG Musterstadt eG';
  await $('pp-speichern').dispatch('click');
  ok('#68 Speichern aendert die Bauherrenschaft — die uebrigen Kopfdaten bleiben unveraendert erhalten',
    store.holeMappe().projekt.kopfdaten.bauherr === 'AWG Musterstadt eG'
    && store.holeMappe().projekt.kopfdaten.planverfasser === 'Polycare'
    && store.holeMappe().projekt.kopfdaten.plan_nr === '07');
  baum('prj-bearbeiten', pB.projekt.id);
  $('pp-bauherr').value = '';
  await $('pp-speichern').dispatch('click');
  ok('[L-11] ein leeres Feld loescht genau dieses Feld — die uebrigen bleiben',
    store.holeMappe().projekt.kopfdaten.bauherr === undefined
    && store.holeMappe().projekt.kopfdaten.plan_nr === '07');

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
  // #88: Zugeordnet wird ins aktive Geschoss — mit einer sichtbaren Initialposition am
  // GESPEICHERTEN Geschossursprung ([K-4]). Abgeleitet wird ausschliesslich aus Mappe und
  // Wandelement: Richtung x, Mittellinie eine halbe Wandbreite neben dem Ursprung, Laenge
  // aus dem Wandelement (1000 mm = 8 Raster). Erfunden wird nichts.
  baum('wand-zuordnen', idFrei, 'tr-warn');
  {
    const u88 = MAPPE.ursprung(store.holeMappe(), gsNeu);
    const l88 = store.wandVerortung(idFrei) ? store.wandVerortung(idFrei).wand.lage : null;
    ok('#88 Zuordnen traegt sie ins aktive Geschoss ein — verortet am Geschossursprung',
      store.wandVerortung(idFrei)?.geschoss.id === gsNeu
      && !!l88 && l88.richtung === 'x' && l88.orientierung === '+x'
      && l88.start_mm.x === u88.x && l88.start_mm.y === u88.y + CON.HALB_BREITE_MM
      && l88.laenge_grid === store.holeElement(idFrei).wandelement.length_mm / CON.GRID_MM
      && l88.laenge_grid === 8
      && !store.mappeReferenzen().unverortet.includes(idFrei));
    ok('#88 [L-1] die Initialposition ist eine gueltige Lage und wird benannt',
      CON.lageFehler(l88).length === 0
      && /am Geschossursprung/.test(trMsgTxt()) && /frei verschiebbar/.test(trMsgTxt())
      && !trFehler());
    ok('#88 sie ist unbemasst — es entsteht keine Bemassung und keine Fixierung',
      MAPPE.bemassungen(store.holeMappe(), gsNeu).length === 0);
    ok('#88 (must-not) kein Schema-, Mappen- oder Projektformatsprung, Mappe gueltig',
      store.SCHEMA_VERSION === 6 && MAPPE.MAPPE_VERSION === 2 && store.PROJEKT_VERSION === 2
      && MAPPE.validiereMappe(store.holeMappe()).length === 0);
  }
  // #88: Ohne ableitbare Rasterlaenge wird KEINE Position erfunden — der Grund steht da.
  {
    const krumm = store.speichere('Krumme Laenge 88',
      { ...buildWall('Krumme Laenge 88', 1000, 2000, []), length_mm: 1010 });
    baum('wand-zuordnen', krumm, 'tr-warn');
    ok('#88 (Muss 5) eine Wand ohne Rasterlaenge wird ohne Lage eingetragen und der Grund benannt',
      store.wandVerortung(krumm)?.geschoss.id === gsNeu
      && store.wandVerortung(krumm).wand.lage === null
      && /kein Vielfaches von 125 mm/.test(trMsgTxt())
      && /keine Position erfunden/.test(trMsgTxt()));
    store.loesche(krumm);
  }
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
  await $('pp-speichern').dispatch('click');
  ok('[L-12] ohne Zuordnung wird das gemeldet, kein Katalog geraten',
    store.holeKatalog() === null && store.katalogStatus().status === 'nicht_zugeordnet'
    && /kein Bauteilkatalog zugeordnet/.test($('k-warn').innerHTML));
  baum('prj-bearbeiten', pB.projekt.id);
  ok('Projekt-Dialog bietet die vorhandenen Kataloge zur Wahl',
    /kein Katalog zugeordnet/.test($('pp-katalog').innerHTML)
    && store.listeKataloge().every(k => $('pp-katalog').innerHTML.includes(k.id)));
  $('pp-katalog').value = store.listeKataloge()[0].id;
  await $('pp-speichern').dispatch('click');
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

  // 8j) Projekt loeschen: Struktur weg — die zugeordneten Wandelemente gehen NUR
  //     auf ausdrueckliche Nachfrage mit ([L-4], #85). Beide Antworten werden hier
  //     einzeln gefahren; die zweite Abfrage wird nie pauschal mitbejaht.
  confirmFolge = [];
  confirmAntwort = false;
  const anzahlPrjVor = projekte().length;
  baum('prj-loeschen', pB.projekt.id);
  ok('Loeschen ohne Bestaetigung passiert nicht', projekte().length === anzahlPrjVor);

  // (i) Sicherheitsabfrage JA, Zusatzfrage NEIN — das bisher zugesicherte Verhalten
  const elementeVor = store.listeElemente().length;
  confirmTexte.length = 0;
  confirmFolge = [true, false];
  baum('prj-loeschen', pB.projekt.id);
  ok('#85 es kommen GENAU ZWEI getrennte Abfragen — Struktur und Wandelemente',
    confirmFolge.length === 0 && confirmTexte.length === 2);
  ok('#85 die Zusatzfrage nennt Anzahl und Namen VOR dem Loeschen',
    /1 zugeordnete\(s\) Wandelement\(e\)/.test(confirmTexte[1])
    && /Wand Süd 1/.test(confirmTexte[1]));
  ok('[L-4] Projekt entfernt, Wandelemente bleiben erhalten',
    projekte().length === anzahlPrjVor - 1 && store.listeElemente().length === elementeVor
    && store.holeElement(idB) !== null);
  ok('[L-4] die Waende gelten danach als nicht eingetragen und werden gemeldet',
    store.wandVerortung(idB) === null && /keinem Projekt/.test($('tr-warn').innerHTML));
  ok('[L-10] die Zeiger des geloeschten Projekts sind aufgehoben',
    store.aktivesProjektId() === null && store.aktivesGeschossId() === null);
  ok('Loeschmeldung nennt den Verbleib der Wandelemente',
    /0 Wandelement\(e\) entfernt, 1 erhalten/.test(trMsgTxt())
    && /nicht eingetragen/.test(trMsgTxt()) && !trFehler());

  // (ii) Beide Abfragen JA — die zugeordnete Wand geht mit, fremde bleiben (#85)
  const pC = await projektAnlegen('Mitloeschprojekt #85');
  const idC = wandAnlegen(store.aktivesGeschossId(), { name: 'Wand C1' });
  const elementeVorC = store.listeElemente().length;
  confirmTexte.length = 0;
  confirmFolge = [true, true];
  baum('prj-loeschen', pC.projekt.id);
  ok('#85 auch hier zwei getrennte Abfragen', confirmFolge.length === 0 && confirmTexte.length === 2);
  ok('#85 Zusatzfrage bejaht: das zugeordnete Wandelement ist mit entfernt',
    store.holeElement(idC) === null && store.listeElemente().length === elementeVorC - 1
    && store.projektMappe(pC.projekt.id) === null);
  ok('#85 kein Wandelement ausserhalb des geloeschten Projekts',
    store.holeElement(idB) !== null && store.holeElement(idOhneWind) !== null);
  ok('#85 die Meldung bilanziert entfernte und erhaltene Wandelemente',
    /1 Wandelement\(e\) entfernt, 0 erhalten/.test(trMsgTxt()) && !trFehler());
  confirmFolge = [];

  // 8k) Mappen-Datei: Sichern und Wiedereinlesen ----------------------------
  store.setzeAktivesProjekt(prj0.projekt.id);
  // Der reine Struktur-Weg ([L-13]: „nur Struktur (JSON)“) ist seit #67 die
  // Mappen-Option des zentralen Exportdialogs — derselbe Inhalt, ein Zugang.
  zipCalls.length = 0;
  baum('prj-export', prj0.projekt.id);
  $('exp-overlay')._sel = [{ value: 'mappe' }];
  $('exp-go').dispatch('click');
  const mappeDatei = zipCalls.length ? zipCalls[0].files[0].data : '';
  ok('Projekt-Export erzeugt eine Projektmappen-Datei v2',
    JSON.parse(mappeDatei).format === 'SEMBLA-Projektmappe'
    && JSON.parse(mappeDatei).version === 2
    && zipCalls.length && /^SEMBLA_Projektmappe_/.test(zipCalls[0].files[0].name));
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

// --- 8m) #68 Projektanlage: nur Bauherrenschaft, Standardkatalog vorbelegt --
// Der ECHTE Nutzerpfad am echten Dialog: oeffnen und Vorbelegung sehen, abbrechen ohne
// jede Spur, speichern ohne manuellen Katalogschritt — mit wirksamer `mappe.katalog`-
// Zuordnung, Wiederverwendung der vorhandenen Standardressource und unangetasteten
// Zuordnungen aller bestehenden Projekte.
{
  const prjSlot = () => localStorage.getItem('sembla:projekte');
  const katSlot = () => localStorage.getItem('sembla:kataloge');

  // (a) Oeffnen: Standardkatalog sichtbar vorbelegt, nichts persistiert
  const prjVor = prjSlot(), katVor = katSlot(), aktivVor = store.aktivesProjektId();
  $('tr-projekt-neu').dispatch('click');
  ok('#68 der Anlage-Dialog belegt den SEMBLA-Standardkatalog vor',
    $('pp-katalog').value === '__vorlage__'
    && /SEMBLA Standardkatalog \(Repo-Vorlage\)/.test($('pp-katalog').innerHTML));
  ok('#68 das Oeffnen selbst schreibt nichts', prjSlot() === prjVor && katSlot() === katVor);

  // (b) Abbrechen: Projekt- UND Katalogspeicher bleiben byte-unveraendert
  $('pp-cancel').dispatch('click');
  ok('#68 Abbrechen laesst Projekt- und Katalogspeicher unveraendert',
    prjSlot() === prjVor && katSlot() === katVor && store.aktivesProjektId() === aktivVor);

  // (c) Speichern ohne manuellen Katalogschritt: wirksame Zuordnung zum Standardkatalog
  const anzahlVor = store.listeKataloge().length;
  const zuordnungenVor = JSON.stringify(store.listeProjekte().map(p => [p.projekt.id, p.katalog]));
  $('tr-projekt-neu').dispatch('click');
  $('pp-name').value = 'Katalogprojekt';
  $('pp-bauherr').value = 'AWG eG';
  await $('pp-speichern').dispatch('click');
  const st68 = store.katalogStatus();
  ok('#68 neues Projekt ist ohne manuellen Katalogschritt dem Standardkatalog zugeordnet',
    $('pp-overlay').hidden === true && !trFehler()
    && st68.status === 'ok' && /^SEMBLA Standardkatalog/.test(st68.katalog.name)
    && store.holeMappe().katalog === st68.id
    && store.holeMappe().projekt.kopfdaten.bauherr === 'AWG eG');
  ok('#68 dabei wurde KEIN zweiter Standardkatalog angelegt — die vorhandene Ressource gilt',
    store.listeKataloge().length === anzahlVor);
  ok('#68 bestehende Projekte behalten ihre bisherige Zuordnung',
    JSON.stringify(store.listeProjekte()
      .filter(p => p.projekt.id !== store.holeMappe().projekt.id)
      .map(p => [p.projekt.id, p.katalog])) === zuordnungenVor);

  // (d) Eine zweite Anlage verwendet DIESELBE Ressource wieder
  const ersteKatId = store.holeMappe().katalog;
  $('tr-projekt-neu').dispatch('click');
  $('pp-name').value = 'Katalogprojekt 2';
  await $('pp-speichern').dispatch('click');
  ok('#68 eine zweite Anlage verwendet dieselbe Standardressource wieder',
    store.holeMappe().katalog === ersteKatId && store.listeKataloge().length === anzahlVor);

  // (e) Eine bewusst gewaehlte andere vorhandene Katalogressource bleibt wirksam
  const eigener = store.setzeKatalog(KAT.leererKatalog('Eigener Katalog #68'));
  $('tr-projekt-neu').dispatch('click');
  $('pp-name').value = 'Eigenkatalogprojekt';
  $('pp-katalog').value = eigener.id;
  await $('pp-speichern').dispatch('click');
  ok('#68 eine bewusst gewaehlte andere Katalogressource bleibt wirksam',
    store.holeMappe().katalog === eigener.id && store.katalogStatus().status === 'ok'
    && store.katalogStatus().katalog.name === 'Eigener Katalog #68'
    && store.listeKataloge().length === anzahlVor + 1);

  // (f) Auch die ausdrueckliche Wahl „kein Katalog" bleibt wirksam ([L-12]: nie geraten)
  $('tr-projekt-neu').dispatch('click');
  $('pp-name').value = 'Katalogloses Projekt';
  $('pp-katalog').value = '';
  await $('pp-speichern').dispatch('click');
  ok('#68 die ausdrueckliche Wahl „kein Katalog" bleibt wirksam — nichts wird geraten ([L-12])',
    store.holeMappe().katalog === null && store.katalogStatus().status === 'nicht_zugeordnet');

  // (g) Nicht ladbare Vorlage: Projekt entsteht, die fehlende Zuordnung wird benannt
  const katZwischen = katSlot();
  const fetch68 = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
  $('tr-projekt-neu').dispatch('click');
  $('pp-name').value = 'Offlineprojekt';
  await $('pp-speichern').dispatch('click');
  globalThis.fetch = fetch68;
  ok('#68 nicht ladbare Vorlage: Projekt angelegt, fehlende Zuordnung benannt, nie geraten',
    store.holeMappe().projekt.name === 'Offlineprojekt' && store.holeMappe().katalog === null
    && trFehler() && /Standardkatalog wurde nicht geladen/.test(trMsgTxt())
    && katSlot() === katZwischen);

  // Zurueck zur Ausgangslage der Folgeabschnitte: das Testprojekt bleibt der aktive Stand.
  store.setzeAktivesProjekt(prj0.projekt.id);
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
  // Das Probegeschoss hat KEINE Wand: die Zusatzfrage aus #85 entfaellt dann ganz —
  // gefragt wird nur, was auch etwas zu entscheiden hat. Beantwortet wird ausdruecklich
  // genau eine Abfrage; eine zweite wuerde die Folge nicht leeren.
  confirmTexte.length = 0;
  confirmFolge = [true];
  baum('gs-loeschen', gsProbe);
  await new Promise(r => setTimeout(r, 0));
  ok('#85 ohne zugeordnetes Wandelement wird nur EINMAL gefragt',
    confirmFolge.length === 0 && confirmTexte.length === 1);
  ok('[L-8] mit dem Geschoss verschwindet auch sein Planbild',
    (await PLAN.holePlan(gsProbe)) === null && !mappeSlot().includes(gsProbe));
  ok('Loeschmeldung nennt den mitentfernten Plan',
    /hinterlegte\(r\) Geschossplan\/-pläne wurden mit entfernt/.test(trMsgTxt())
    && /\[L-8\]/.test(trMsgTxt()));
  ok('#85 die Bilanz nennt auch hier beide Zahlen (0 entfernt, 0 erhalten)',
    /0 Wandelement\(e\) entfernt, 0 erhalten/.test(trMsgTxt()) && !trFehler());
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

  const prjA = await projektAnlegen('Archivprojekt', { bauherr: 'AWG Musterstadt' });
  // #68: Phase ist kein Feld des Anlagedialogs mehr — als Projektbestand wird sie fuer den
  // Archiv-Roundtrip ueber den Storage-Pfad gesetzt.
  store.setzeKopfdaten({ phase: 'LP5' });
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

  // 11b) Archiv bauen -------------------------------------------------------
  // Den Archiv-EXPORT-Knopf gibt es seit #67 nicht mehr; gebaut wird das Archiv
  // hier ueber DIESELBEN reinen Bausteine (exportPlan/archivDateien), die auch der
  // fruehere Knopf nutzte. Der IMPORT darunter laeuft unveraendert ueber die echte
  // Oberflaeche — genau er ist der [L-13]-Pfad, den dieser Abschnitt absichert.
  const mArchiv = store.projektMappe(prjA.projekt.id);
  const planA = ARCHIV.exportPlan(mArchiv, store.listeElemente().map(e => e.id), await PLAN.listePlaene());
  ok('[L-13] exportPlan meldet am vollstaendigen Stand keine Luecken',
    planA.fehlendeWaende.length === 0 && planA.fehlendeBilder.length === 0);
  const bilderA = new Map();
  for (const p of planA.plaene) {
    const satz = await PLAN.holePlan(p.geschossId);
    bilderA.set(p.geschossId, new Uint8Array(await satz.blob.arrayBuffer()));
  }
  const wurzelA = ARCHIV.archivName(mArchiv);
  const archivDateien = ARCHIV.archivDateien(mArchiv, planA,
    (wid) => store.projektObjekt(wid), (gid) => bilderA.get(gid))
    .map(d => ({ name: wurzelA + '/' + d.name, data: d.data }));
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
  ok('die Oberflaeche beschriftet die Wege eindeutig',
    // Der Struktur-Export heisst weiterhin ausdruecklich „nur Struktur (JSON)"
    // ([L-13]) — seit #67 als Option des zentralen Exportdialogs.
    /nur Struktur \(JSON\)/.test(html) && /Exportieren/.test(html)
    && /Projektordner wählen/.test(html) && /webkitdirectory/.test(html));
  ok('der Einzelwand-Weg ist unberuehrt vorhanden',
    /id="f-import"/.test(html) && /id="exp-go"/.test(html)
    // Das Verhalten selbst wurde oben ueber die echte Ereignisdelegation
    // geprueft; dynamisch von `knopf(...)` erzeugtes Markup ist kein Quellliteral.
    && checks.some(([n, c]) => n === 'Klick auf „Exportieren" oeffnet den Dialog' && c));
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
  const prjZ = await projektAnlegen('Zuschnittprojekt');
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

// --- 9b) Zentraler hierarchischer Export (#67): Projekt-/Geschossebene ------
// Gefahren wird der ECHTE Produktpfad: Baumknopf "Exportieren" -> Optionen je
// Ebene -> "ZIP herunterladen". Synthetisches Projekt mit ZWEI Gebaeuden, zwei
// Geschossen und drei Waenden; geprueft werden die zulaessigen Optionen, der
// exakte ZIP-Inhalt, unveraenderte aktive Zeiger und die benannten Luecken
// (fehlendes Wandelement, fehlender zugeordneter Katalog).
{
  const gsG = (await projektAnlegen('Exportprojekt #44')) && store.aktivesGeschossId();
  // Katalog ausdruecklich laden — er wird dem AKTIVEN Projekt zugeordnet ([L-12])
  // und belegt die Verwendungsstellen der Waende vor ([P-18]).
  $('k-vorlage').dispatch('click');
  await new Promise(r => setTimeout(r, 0));
  const idG1 = wandAnlegen(gsG, { name: 'Export Wand 1', laenge: 3000, hoehe: 3000 });
  const idG2 = wandAnlegen(gsG, { name: 'Export Wand 2', laenge: 2000, hoehe: 2600 });
  const prjId = store.aktivesProjektId();
  // Zweites Gebaeude mit eigenem Geschoss und eigener Wand — ueber die reinen
  // Mappen-Operationen, wie es Modul 0 selbst tut.
  const rG = MAPPE.fuegeGebaeudeHinzu(store.holeMappe(), 'Haus 2'); store.setzeMappe(rG.mappe);
  const rGs = MAPPE.fuegeGeschossHinzu(store.holeMappe(), rG.id, 'EG Haus 2'); store.setzeMappe(rGs.mappe);
  const gs2 = rGs.id;
  const idG3 = wandAnlegen(gs2, { name: 'Export Wand 3', laenge: 2500, hoehe: 2600 });
  const gsName = MAPPE.findeGeschoss(store.holeMappe(), gsG).geschoss.name;
  const katalogG = store.holeKatalog();
  const csvZeilen = (t) => t.split('\n').map(z => z.split(';'));
  const zeigerJetzt = () => JSON.stringify([store.aktivesProjektId(), store.aktivesGeschossId(), store.aktivId()]);
  /** Reine Erwartung: Summe der kanonischen Wandstuecklisten. */
  const erwarteteMengen = (ids) => { const m = new Map();
    for (const id of ids) for (const p of stuecklistePositionen(store.holeElement(id).wandelement,
        store.holeEingaben(id), katalogG)) {
      const k = [p.key, p.unit, p.art || '', p.fertigmass_mm ?? ''].join('|');
      m.set(k, (m.get(k) || 0) + p.menge); }
    return m; };
  const mengenSumme = (csv, ids) => {
    const zeilen = csvZeilen(csv); const kopf = zeilen.findIndex(z => z[0] === 'Einbauteil');
    const summe = zeilen.slice(kopf + 1).filter(z => z[0] && !z[0].startsWith('Summe netto') && z.length > 6)
      .reduce((a, z) => a + +z[4], 0);
    const soll = [...erwarteteMengen(ids).values()].reduce((a, v) => a + v, 0);
    return Math.abs(summe - soll) < 1e-9; };

  ok('#67 Projekt-/Gebaeudeebene bieten Mappe, Gesamtstueckliste, Geschosse, Waende, Katalog',
    JSON.stringify(ARCHIV.exportOptionen('projekt')) === JSON.stringify(['mappe', 'gesamt', 'geschosse', 'waende', 'katalog'])
    && JSON.stringify(ARCHIV.exportOptionen('gebaeude')) === JSON.stringify(ARCHIV.exportOptionen('projekt')));
  ok('#67 Geschossebene bietet Geschossdaten, Gesamtstueckliste, Waende — keine Projektmappe',
    JSON.stringify(ARCHIV.exportOptionen('geschoss')) === JSON.stringify(['geschoss', 'gesamt', 'waende']));
  ok('#67 der Preisschalter steht ausserhalb der Dateiauswahl',
    /id="exp-gesamt-optionen"/.test(html) && /id="exp-preise"/.test(html));

  // (a) Geschossebene mit Preisen — ueber den echten Geschoss-Knopf
  const zeiger9 = zeigerJetzt();
  zipCalls.length = 0;
  baum('gs-export', gsG);
  ok('#67 der Geschoss-Dialog oeffnet mit den Geschoss-Optionen und nennt den Bezug',
    $('exp-overlay').hidden === false && $('exp-titel').textContent === 'Geschoss exportieren'
    && /value="geschoss"/.test($('exp-opts').innerHTML) && /value="gesamt"/.test($('exp-opts').innerHTML)
    && /value="waende"/.test($('exp-opts').innerHTML) && !/value="mappe"/.test($('exp-opts').innerHTML)
    && !/value="katalog"/.test($('exp-opts').innerHTML)
    && new RegExp(gsName + ' · Projekt „Exportprojekt #44“').test($('exp-name').textContent));
  $('exp-preise').checked = true;
  $('exp-overlay')._sel = [{ value: 'gesamt' }];
  $('exp-go').dispatch('click');
  const gFiles = zipCalls.length ? zipCalls[0].files : [];
  ok('#67 Gesamt-Haekchen erzeugt genau eine CSV', gFiles.length === 1 && /\.csv$/.test(gFiles[0].name));
  ok('#67 Dateiname nennt Ebene und Bezug',
    gFiles[0].name === 'Gesamtstueckliste_Geschoss_' + store.sicherName(gsName) + '.csv');
  ok('#67 ZIP-Name folgt Ebene und Geschoss',
    zipCalls.length && zipCalls[0].name === 'SEMBLA_Export_Geschoss_' + ARCHIV.sicherStamm(gsName) + '.zip');
  const gCsv = gFiles.length ? gFiles[0].data : '';
  ok('#67 CSV nennt Blatt, Ebene und Geschoss',
    /^SEMBLA – Gesamtstückliste Geschoss/.test(gCsv)
    && new RegExp('Ebene;Geschoss').test(gCsv) && gCsv.includes('Geschoss;' + gsName));
  ok('#67 CSV nennt beide Waende als Herkunft und ist vollstaendig',
    /Wände;2 von 2/.test(gCsv) && /Vollständigkeit;vollständig/.test(gCsv)
    && gCsv.includes('Export Wand 1') && gCsv.includes('Export Wand 2'));
  ok('#67 CSV-Mengen sind bitgleich die Summe der Wandstuecklisten', (() => {
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
  ok('#67 CSV fuehrt die Einbauteil-IDs als Wand-ID:ID',
    new RegExp(idG1 + ':GS-k').test(gCsv) && new RegExp(idG2 + ':GS-k').test(gCsv));
  ok('#67 der Geschoss-Export setzt keinen Zeiger um', zeigerJetzt() === zeiger9);

  // (a2) #81: Mengenfassung der GESAMTSTÜCKLISTE — der echte Nutzerpfad auf Geschossebene.
  // Genau ein Geschoss, zwei Waende, eine davon mit gespeicherter Uebersteuerung: der
  // Dialog wird geoeffnet, die angepasste Fassung gewaehlt und an den ZIP-BYTES geprueft.
  {
    const posI3 = stuecklistePositionen(store.holeElement(idG1).wandelement,
      store.holeEingaben(idG1), katalogG).find(p => p.key === 'i3');
    const kennung = store.mengenKennung(posI3);
    const berechnetG = [idG1, idG2].reduce((a, id) => a + stuecklistePositionen(
      store.holeElement(id).wandelement, store.holeEingaben(id), katalogG)
      .find(p => p.key === 'i3').menge, 0);
    store.setzeMengenUebersteuerung(kennung, 7, idG1);
    const wirksamG = berechnetG - posI3.menge + 7;
    /** Kanonische Ableitung der Ebene — dieselbe, die auch Modul 4 benutzt. */
    const sollDatei = (fassung) => {
      const d = GES.gesamtDaten(GES.umfang(store.holeMappe(), 'geschoss', { geschossId: gsG }),
        { holeElement: (id) => store.holeElement(id), holeEingaben: (id) => store.holeEingaben(id),
          katalog: katalogG }, { fassung });
      return gesamtstuecklisteDateien(d, { preise: true, rumpf: GES.dateiRumpf(d) })[0].data;
    };
    const zeileI3 = (csv) => csvZeilen(csv).find(z => z[0] === posI3.label);

    // Voreinstellung: berechnet — die Datei bleibt der bisherige Stand.
    zipCalls.length = 0;
    baum('gs-export', gsG);
    ok('#81 auf der Geschossebene ist die Fassungswahl sichtbar und startet auf „berechnet“',
      $('exp-stueckliste-optionen').hidden === false
      && $('exp-fassung-berechnet').checked === true && $('exp-fassung-angepasst').checked === false);
    $('exp-overlay')._sel = [{ value: 'gesamt' }];
    $('exp-go').dispatch('click');
    const gBer = zipCalls.length ? zipCalls[0].files[0].data : '';
    ok('#81 ohne Zutun traegt die Gesamtstueckliste die BERECHNETEN Mengen',
      gBer === sollDatei('berechnet') && +zeileI3(gBer)[4] === berechnetG
      && /\nMengen;berechnet – abgeleitet aus dem Wandelement/.test(gBer)
      && /1 gespeicherte Übersteuerung\(en\) NICHT angewandt/.test(gBer));

    // Angepasst — ueber genau das Bedienelement des Dialogs.
    zipCalls.length = 0;
    baum('gs-export', gsG);
    $('exp-fassung-berechnet').checked = false;
    $('exp-fassung-angepasst').checked = true;
    $('exp-overlay')._sel = [{ value: 'gesamt' }];
    $('exp-go').dispatch('click');
    const gAng = zipCalls.length ? zipCalls[0].files[0].data : '';
    ok('#81 gewaehlte angepasste Fassung: die Gesamtstueckliste traegt die wirksamen Mengen',
      +zeileI3(gAng)[4] === wirksamG && wirksamG !== berechnetG);
    ok('#81 die berechnete Menge steht in einer eigenen Spalte daneben',
      csvZeilen(gAng).find(z => z[0] === 'Einbauteil')[5] === 'Menge berechnet'
      && +zeileI3(gAng)[5] === berechnetG && zeileI3(gAng)[6] === 'manuell');
    ok('#81 die Datei benennt die gewaehlte Fassung in ihrem Kopf',
      /\nMengen;angepasst – mit den manuellen Mengen aus Modul 4 · 1 von \d+ Zeile\(n\) betroffen/.test(gAng));
    ok('#81 bitgleich der gemeinsamen Ableitung (kein zweiter Mengenpfad)',
      gAng === sollDatei('angepasst') && gAng !== gBer);
    ok('#81 der Einzelpreis bleibt unveraendert, nur der Gesamtpreis folgt', (() => {
      const kopf = csvZeilen(gAng).find(z => z[0] === 'Einbauteil');
      const ep = kopf.indexOf('EP (EUR)'), gp = kopf.indexOf('GP (EUR)');
      const zB = zeileI3(gBer), zA = zeileI3(gAng);
      const epB = csvZeilen(gBer).find(z => z[0] === 'Einbauteil').indexOf('EP (EUR)');
      return zA[ep] === zB[epB] && Math.abs(+zA[gp] - wirksamG * +zA[ep]) < 1e-6;
    })());
    ok('#81 ein neu geoeffneter Dialog startet wieder auf „berechnet“ (nichts haengt nach)',
      (() => { baum('gs-export', gsG); const b = $('exp-fassung-berechnet').checked === true
        && $('exp-fassung-angepasst').checked === false; $('exp-cancel').dispatch('click'); return b; })());
    ok('#81 der Export hat die gespeicherte Uebersteuerung nicht angetastet',
      store.holeMengen(idG1)[kennung] === 7);

    // Aufraeumen: die folgenden Abschnitte rechnen mit den berechneten Mengen.
    store.setzeMengenUebersteuerung(kennung, null, idG1);
    ok('#81 Aufraeumen: keine gespeicherte Uebersteuerung mehr im Geschoss',
      Object.keys(store.holeMengen(idG1)).length === 0);
  }

  // (b) Preisschalter im Export
  zipCalls.length = 0;
  baum('gs-export', gsG);
  $('exp-preise').checked = false;
  $('exp-overlay')._sel = [{ value: 'gesamt' }];
  $('exp-go').dispatch('click');
  const oCsv = zipCalls.length ? zipCalls[0].files[0].data : '';
  ok('#67 Export ohne Preise: keine EP/GP-Spalte, kein Summenbetrag',
    !/EP \(EUR\)/.test(oCsv) && !/GP \(EUR\)/.test(oCsv) && !/Summe netto/.test(oCsv));
  ok('#67 Export ohne Preise: Mengen, Herkunft und IDs unveraendert', (() => {
    const nurMengen = t => csvZeilen(t).filter(z => z.length > 6 && z[0] && !z[0].startsWith('Summe netto'))
      .map(z => [z[0], z[3], z[4], z[5], z[6]].join('|')).join('\n');
    return nurMengen(oCsv) === nurMengen(gCsv); })());
  $('exp-preise').checked = true;

  // (c) Ein NICHT aktives Geschoss ist genauso exportierbar — ohne Zeigerwechsel ([L-10])
  zipCalls.length = 0;
  baum('gs-export', gs2);
  $('exp-overlay')._sel = [{ value: 'gesamt' }];
  $('exp-go').dispatch('click');
  ok('#67 auch ein nicht aktives Geschoss exportiert — der Zeiger bleibt',
    zipCalls.length === 1
    && zipCalls[0].files[0].name === 'Gesamtstueckliste_Geschoss_EG_Haus_2.csv'
    && mengenSumme(zipCalls[0].files[0].data, [idG3])
    && store.aktivesGeschossId() === gsG);

  // (d) Projektebene: Gesamtstueckliste ueber den Projekt-Knopf
  zipCalls.length = 0;
  baum('prj-export', prjId);
  ok('#67 der Projekt-Dialog oeffnet mit den Projekt-Optionen',
    $('exp-titel').textContent === 'Projekt exportieren'
    && /value="mappe"/.test($('exp-opts').innerHTML) && /value="katalog"/.test($('exp-opts').innerHTML)
    && /^Exportprojekt #44$/.test($('exp-name').textContent));
  $('exp-overlay')._sel = [{ value: 'gesamt' }];
  $('exp-go').dispatch('click');
  ok('#67 Projektebene: Dateiname, Ebenenbezug, Mengen = Summe ALLER drei Waende',
    zipCalls.length === 1
    && zipCalls[0].files[0].name === 'Gesamtstueckliste_Projekt_Exportprojekt_44.csv'
    && /Ebene;Projekt/.test(zipCalls[0].files[0].data)
    && mengenSumme(zipCalls[0].files[0].data, [idG1, idG2, idG3]));

  // (e) Vollpaket Projektebene: der ZIP-Inhalt ist EXAKT die Auswahl
  zipCalls.length = 0;
  baum('prj-export', prjId);
  $('exp-overlay')._sel = [{ value: 'mappe' }, { value: 'gesamt' }, { value: 'geschosse' },
    { value: 'waende' }, { value: 'katalog' }];
  $('exp-go').dispatch('click');
  const alle = zipCalls.length ? zipCalls[0].files : [];
  const an = alle.map(f => f.name);
  ok('#67 Vollpaket: 1 Mappe + 2 Geschosse + 3 Waende + 1 Gesamtstueckliste + 1 Katalog',
    alle.length === 8
    && an.filter(n => n.startsWith('SEMBLA_Projektmappe_')).length === 1
    && an.filter(n => n.startsWith('geschosse/')).length === 2
    && an.filter(n => n.startsWith('waende/')).length === 3
    && an.filter(n => n.startsWith('Gesamtstueckliste_')).length === 1
    && an.filter(n => n.startsWith('SEMBLA_Bauteilkatalog_')).length === 1);
  ok('#67 die Mappendatei ist die unveraenderte Projektmappe v2 — und heisst NICHT projekt.json',
    (() => {
      const f = alle.find(x => x.name.startsWith('SEMBLA_Projektmappe_'));
      if (!f) return false;
      const o = JSON.parse(f.data);
      return o.format === 'SEMBLA-Projektmappe' && o.version === 2
        && f.data === JSON.stringify(MAPPE.mappeObjekt(store.projektMappe(prjId)), null, 2)
        && !an.some(n => n.endsWith('projekt.json'));
    })());
  ok('#67 jede Geschossdatei ist eine Teilmappe v2 mit GENAU einem Gebaeude und Geschoss',
    alle.filter(x => x.name.startsWith('geschosse/')).every(x => {
      const o = JSON.parse(x.data);
      return o.format === 'SEMBLA-Projektmappe' && o.version === 2
        && o.gebaeude.length === 1 && o.gebaeude[0].geschosse.length === 1;
    }));
  ok('#67 jede Wanddatei bleibt SEMBLA-Projekt v2 und bitgleich store.projektObjekt',
    [idG1, idG2, idG3].every(id => {
      const el = store.holeElement(id);
      const f = alle.find(x => x.name === ARCHIV.wandPfad({ id, name: el.name }));
      return f && JSON.parse(f.data).format === 'SEMBLA-Projekt'
        && f.data === JSON.stringify(store.projektObjekt(id), null, 2);
    }));
  ok('#67 der Katalog ist eine EIGENE Datei und in keiner anderen eingebettet ([L-12])',
    (() => {
      const k = alle.find(x => x.name.startsWith('SEMBLA_Bauteilkatalog_'));
      // Mappe und Geschossdaten tragen NUR die Katalog-Referenz; die Produktwahl
      // in den Wanddateien ([P-13], nur IDs) ist ausdruecklich kein Katalog.
      return k && JSON.parse(k.data).format === 'SEMBLA-Bauteilkatalog'
        && JSON.parse(k.data).name === katalogG.name
        && alle.filter(x => x.name.startsWith('SEMBLA_Projektmappe_') || x.name.startsWith('geschosse/'))
          .every(x => !x.data.includes('"produkte"'));
    })());
  ok('#67 vollstaendiger Export meldet Erfolg ohne Luecken', !trFehler() && /8 Datei/.test(trMsgTxt()));

  // (f) Export eines NICHT aktiven Projekts — der Umfang folgt dem Klick, kein Zeiger wandert
  const prjZweit = await projektAnlegen('Zweitprojekt #67');
  const zweitId = prjZweit.projekt.id;
  store.setzeAktivesProjekt(prjId);
  store.setzeAktivesGeschoss(gsG);
  zipCalls.length = 0;
  baum('prj-export', zweitId);
  ok('#67 Dialog oeffnet fuer das angeklickte, nicht aktive Projekt',
    $('exp-overlay').hidden === false && $('exp-name').textContent === 'Zweitprojekt #67');
  $('exp-overlay')._sel = [{ value: 'mappe' }];
  $('exp-go').dispatch('click');
  ok('#67 nicht aktives Projekt exportiert seine EIGENE Mappe — aktive Zeiger unveraendert',
    zipCalls.length === 1
    && zipCalls[0].files[0].name === 'SEMBLA_Projektmappe_' + ARCHIV.sicherStamm('Zweitprojekt #67') + '.json'
    && JSON.parse(zipCalls[0].files[0].data).projekt.id === zweitId
    && store.aktivesProjektId() === prjId && store.aktivesGeschossId() === gsG);

  // (g) Fehlendes Wandelement: benannt VOR dem Download, nie ersetzt ([L-4])
  store.setzeMappe(MAPPE.setzeWand(store.holeMappe(), gsG, { id: 'w-weg', name: 'Verschwundene Wand' }));
  confirmAntwort = false;
  zipCalls.length = 0;
  baum('gs-export', gsG);
  $('exp-overlay')._sel = [{ value: 'waende' }];
  $('exp-go').dispatch('click');
  ok('#67 Luecke wird vor dem Download benannt — ohne Bestaetigung kein ZIP',
    zipCalls.length === 0 && /nichts geschrieben/.test(trMsgTxt()));
  confirmAntwort = true;
  $('exp-overlay')._sel = [{ value: 'waende' }];
  $('exp-go').dispatch('click');
  ok('#67 fehlendes Wandelement: ZIP ohne die Wand, Meldung nennt sie ([L-4])',
    zipCalls.length === 1 && zipCalls[0].files.length === 2
    && zipCalls[0].files.every(f => !/Verschwundene/.test(f.name))
    && /Verschwundene Wand/.test(trMsgTxt()) && /L-4/.test(trMsgTxt()) && trFehler());
  confirmAntwort = false;
  store.setzeMappe(MAPPE.entferneWand(store.holeMappe(), 'w-weg'));

  // (h) Fehlender bzw. nicht zugeordneter Bauteilkatalog: benannt, nie ersetzt ([L-12])
  const katRefVor = store.holeMappe().katalog;
  store.setzeMappe(MAPPE.setzeKatalogRef(store.holeMappe(), 'kat-weg'));
  confirmAntwort = true;
  zipCalls.length = 0;
  baum('prj-export', prjId);
  $('exp-overlay')._sel = [{ value: 'katalog' }];
  $('exp-go').dispatch('click');
  ok('#67 fehlender zugeordneter Katalog: keine Datei, benannte Meldung, Referenz bleibt',
    zipCalls.length === 0 && /kat-weg/.test(trMsgTxt()) && /nicht gespeichert/.test(trMsgTxt())
    && trFehler() && store.holeMappe().katalog === 'kat-weg');
  store.setzeMappe(MAPPE.setzeKatalogRef(store.holeMappe(), null));
  baum('prj-export', prjId);
  $('exp-overlay')._sel = [{ value: 'katalog' }];
  $('exp-go').dispatch('click');
  ok('#67 kein zugeordneter Katalog wird benannt ([L-12])',
    zipCalls.length === 0 && /kein Bauteilkatalog zugeordnet/.test(trMsgTxt()));
  store.setzeMappe(MAPPE.setzeKatalogRef(store.holeMappe(), katRefVor));
  confirmAntwort = false;
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
  () => {}, entpacke, ARCHIV, KAT, MAPPE, CON, PLAN);
const frischKatalog = globalThis.localStorage.getItem('sembla:kataloge');
const frischElemente = globalThis.localStorage.getItem('sembla:elemente');
globalThis.localStorage = altStorage; globalThis.document = altDocument; installFetch();
ok('Initialisierung ruft KEIN fetch auf (kein Autoload)', frischeAufrufe.length === 0);
ok('Initialisierung legt keinen Katalog an', frischKatalog === null);
ok('Initialisierung legt kein Wandelement an', frischElemente === null);
// #56: Der Anlegen-Handler ist entfallen und mit ihm sein Nachladen des Standardkatalogs —
// geblieben sind Musterwand, der Standardkatalog-Knopf und seit #68 die eingeloeste
// Vorbelegung beim Speichern der Projektanlage; alle drei liegen in Klick-Handlern.
// Beim Initialisieren wird weiterhin nichts geholt (geprueft oben: kein fetch-Aufruf).
ok('Vorlagen werden ausschliesslich in Klick-Handlern geladen',
  (src.match(/vorlageText\(/g) || []).length === 4           // 1 Definition + 3 Aufrufe
  && (src.match(/fetch\(/g) || []).length === 1);


// --- Issue #43: Reiter 0,5 (Geschossplaner) in der gemeinsamen Kopfleiste ---
// Gemountet wird die ECHTE Navbar. Der Reiter ist reine Navigation und BEWUSST kein
// Eintrag im MODULE-Register — sonst zeigte die Modulübersicht eine Pseudo-Modulkarte.
{
  const nav = new El('sb-nav');
  const altQuery = document.querySelector;
  document.querySelector = (sel) => (sel === '.sb-nav' ? nav : null);
  mountNavbar(0);
  document.querySelector = altQuery;
  const t = nav.innerHTML;
  const p0  = t.indexOf('<span class="n">0</span> Start');
  const p05 = t.indexOf('<span class="n">0,5</span> Geschossplan');
  const p1  = t.indexOf('<span class="n">1</span> Wand');
  ok('#43 die Kopfleiste zeigt die Reiter in der sichtbaren Reihenfolge 0, 0,5, 1',
    p0 >= 0 && p05 > p0 && p1 > p05);
  ok('#43 der Reiter 0,5 verlinkt direkt auf geschossplan.html',
    /<a class="sb-tab" href="geschossplan\.html"[^>]*><span class="n">0,5<\/span> Geschossplan<\/a>/.test(t));
  ok('#43 auf Modul 0 ist der Reiter 0,5 NICHT hervorgehoben — aktiv ist Start',
    !/sb-tab active" href="geschossplan\.html"/.test(t)
    && /class="sb-tab active" href="index\.html"/.test(t));
  ok('#43 kein Pseudo-Modul: das MODULE-Register kennt nur ganze Nummern und keine geschossplan.html',
    MODULE.every(m => Number.isInteger(m.nr) && m.datei !== 'geschossplan.html'));
  ok('#43 die Modulübersicht von Modul 0 zeigt KEINE 0,5-Karte',
    !$('modul-grid').innerHTML.includes('0,5')
    && !$('modul-grid').innerHTML.includes('geschossplan.html'));
}

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
