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
//    Produkte (v. a. Gewindestangen, Latten, Platten), separater Katalogimport/-export
//    und die Mehrfach-Freigabe je Kategorie am aktiven Projekt. Alles ueber die echten
//    Bedienelemente der Startseite. Nur synthetische Fantasiedaten.

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
    this.hidden=false; this.checked=false; this.style={}; this.dataset={}; this.listeners={}; this.files=[]; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f); }
  // Rueckgabewert des letzten Hoerers durchreichen (async-Hoerer: Promise abwarten).
  dispatch(e,ev){ let r; (this.listeners[e]||[]).forEach(f=>{ r=f(ev||{target:this}); }); return r; }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h=v; }
  querySelectorAll(){ return this._sel || []; }   // _sel: vom Test gestellte Treffer (Export-Haekchen)
  closest(){ return null; }
  remove(){}
}
let letzterAnker = null;                          // zuletzt erzeugtes <a> (Download pruefen)
const document = {
  _e:{},
  getElementById(id){ let e=this._e[id]; if(!e) e=this._e[id]=new El(id); return e; },
  createElement(){ letzterAnker = new El('_'); return letzterAnker; },
  querySelector(){ return null; },
  addEventListener(){},
  head:{ appendChild(){} }, body:{ appendChild(){}, insertBefore(){}, firstChild:null },
};
globalThis.document = document;
globalThis.prompt = () => null;
let confirmAntwort = false;                       // vom Test gesteuert (Loeschen/Ersetzen)
globalThis.confirm = () => confirmAntwort;

// Datei-Downloads abfangen (Katalog-Export laeuft ueber Blob/URL wie im Browser).
let letzterDownload = null;
globalThis.Blob = class { constructor(parts){ this._t = parts.join(""); } };
// Nur die Blob-URL-Helfer ergaenzen — `new URL(...)` bleibt das echte Node-URL.
URL.createObjectURL = (b) => { letzterDownload = b._t; return "blob:x"; };
URL.revokeObjectURL = () => {};

// --- Abhaengigkeiten wie im Browser ---------------------------------------
const store = await import("../../docs/shared/storage.js");
const { buildWall } = await import("../../docs/shared/sembla-core.js");
const { MODULE } = await import("../../docs/shared/navbar.js");
const { baueDateien } = await import("../../docs/shared/sembla-export.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");

// --- Produktcode aus docs/index.html laden --------------------------------
const html = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
const modScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const src = modScript.replace(/^\s*import .*?;\s*$/gm, "");   // Imports -> Funktionsargumente
const zipCalls = [];                                          // downloadZip-Aufrufe des Produktcodes
new Function("mountNavbar","MODULE","store","buildWall","baueDateien","downloadZip","KAT", src)(
  () => {}, MODULE, store, buildWall, baueDateien, (name, files) => zipCalls.push({ name, files }), KAT
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

// --- 5) Bauteilkatalog (Issue #21) an der echten Modul-0-Oberflaeche -------
// Bedienhilfen: genau die Wege, die ein Nutzer nimmt (Felder setzen -> Button klicken).
const kat = () => store.holeKatalog();
const kProd = (id) => KAT.produkt(kat(), id);
const kAnzahl = () => (kat() ? kat().produkte.length : 0);
const kMsgTxt = () => $('k-msg').textContent;
const kFehler = () => $('k-msg').className === 'msg err';
/** Kategorie waehlen (loest das echte change-Ereignis aus: Felder + Preisbasis). */
function kWaehleKategorie(id){ $('k-kat').value = id; $('k-kat').dispatch('change'); }
/** Formularfelder setzen (leere Felder werden geleert). */
function kSetze(werte){
  const alle = { 'k-bez':'', 'k-id':'', 'k-preis':'', 'k-gewinde':'', 'k-guete':'',
                 'k-breite':'', 'k-hoehe':'', 'k-dicke':'', 'k-laenge':'' };
  for (const [id, v] of Object.entries({ ...alle, ...werte })) $(id).value = String(v);
}
/** Zeilenaktion der Produkttabelle (Ereignisdelegation wie im Browser). */
function kZeile(act, pid){ $('k-tbody').dispatch('click', { target: { dataset:{ act, pid } } }); }
/** Freigabe-Haekchen einer Zeile umschalten. */
function kHaken(pid, an){ $('k-tbody').dispatch('change', { target: { dataset:{ act:'auswahl', pid }, checked:an } }); }

// 5a) Oberflaeche ist vorhanden und kommuniziert die Trennung/Nicht-Wirksamkeit
ok('Katalog-Abschnitt in Modul 0 vorhanden', /<h2>Bauteilkatalog/.test(html));
ok('Kategorie-, Preisbasis- und Filterauswahl vorhanden',
  /<select id="k-kat"/.test(html) && /<select id="k-einheit"/.test(html) && /<select id="k-filter"/.test(html));
ok('Anlage-Felder fuer Gewindestange/Latte/Platte vorhanden',
  /id="k-gewinde"/.test(html) && /id="k-breite"/.test(html) && /id="k-hoehe"/.test(html)
  && /id="k-dicke"/.test(html) && /id="k-laenge"/.test(html) && /id="k-preis"/.test(html));
ok('separater Katalog-Import und -Export als eigene Bedienelemente',
  /id="k-import"[^>]*type="file"/.test(html) && /id="k-export"/.test(html) && /id="k-neu"/.test(html));
ok('Projekt-ZIP-Dialog hat KEIN Katalog-Haekchen (Formate nicht verwechseln)',
  !/type="checkbox" value="katalog"/.test(html));
ok('Hinweis nennt eigenes Dateiformat und Trennung vom Projekt',
  /SEMBLA-Bauteilkatalog/.test(html) && /nicht<\/b> über den\s+Projekt-Export/.test(html));
ok('Hinweis stellt klar, dass die Freigabe noch nicht in die Kosten rechnet',
  /rechnet noch nicht mit/.test(html) && /Grundlage für die nachgelagerte Planung/.test(html));

// 5b) Katalog neu anlegen
ok('vor der Anlage ist kein Katalog geladen', kat() === null);
$('k-name').value = 'Katalog Musterlieferant';
$('k-neu').dispatch('click');
ok('Katalog angelegt (leer, mit Namen)', !!kat() && kat().name === 'Katalog Musterlieferant' && kAnzahl() === 0);
ok('Kopfzeile meldet Katalogformat v1', /Katalogformat v1/.test($('k-info').textContent));

// 5c) Gewindestange anlegen — kategorieabhaengige Felder + Vorschlags-ID
kWaehleKategorie('gewindestange');
ok('Gewindestange: Gewinde-Feld sichtbar, Hoehe/Breite ausgeblendet',
  $('kf-gewinde').hidden === false && $('kf-laenge').hidden === false
  && $('kf-hoehe').hidden === true && $('kf-breite').hidden === true);
kSetze({ 'k-gewinde':'M10', 'k-guete':'8.8', 'k-laenge':'1100', 'k-preis':'3.80' });
$('k-einheit').value = 'Stk';
$('k-add').dispatch('click');
const rod = kProd('gewindestange-m10-1100');
ok('Gewindestange ueber das echte Formular angelegt', kAnzahl() === 1 && !!rod);
ok('Gewindestange: Gewinde/Laenge/Preisbasis/Preis gespeichert',
  rod.gewinde === 'M10' && rod.guete === '8.8' && rod.laenge_mm === 1100
  && rod.einheit === 'Stk' && rod.preis === 3.8);
ok('Gewindestange: Bezeichnung vorgeschlagen', /Gewindestange M10 1100 mm/.test(rod.bezeichnung));
ok('Rueckmeldung bestaetigt die Anlage', /Produkt angelegt/.test(kMsgTxt()) && !kFehler());

// 5d) Zwei Latten (zwei Standardlaengen derselben Kategorie), Preisbasis €/m
kWaehleKategorie('latte');
ok('Latte: Querschnitt + Standardlaenge sichtbar, Hoehe ausgeblendet',
  $('kf-breite').hidden === false && $('kf-dicke').hidden === false
  && $('kf-laenge').hidden === false && $('kf-hoehe').hidden === true);
kSetze({ 'k-breite':'40', 'k-dicke':'60', 'k-laenge':'3000', 'k-preis':'1.25' });
$('k-einheit').value = 'm';
$('k-add').dispatch('click');
kSetze({ 'k-breite':'40', 'k-dicke':'60', 'k-laenge':'5000', 'k-preis':'1.19' });
$('k-einheit').value = 'm';
$('k-add').dispatch('click');
ok('zwei Latten angelegt', kAnzahl() === 3 && !!kProd('latte-40-60-3000') && !!kProd('latte-40-60-5000'));
ok('Latte: Preisbasis €/m und Querschnitt gespeichert',
  kProd('latte-40-60-3000').einheit === 'm' && kProd('latte-40-60-3000').breite_mm === 40
  && kProd('latte-40-60-3000').dicke_mm === 60 && kProd('latte-40-60-5000').laenge_mm === 5000);

// 5e) Platte (Beplankung) mit Preisbasis €/m²
kWaehleKategorie('beplankung');
kSetze({ 'k-breite':'1250', 'k-hoehe':'2000', 'k-dicke':'12.5', 'k-preis':'6.90', 'k-id':'platte-gk-125' });
$('k-einheit').value = 'm2';
$('k-add').dispatch('click');
const platte = kProd('platte-gk-125');
ok('Platte mit eigener ID angelegt', kAnzahl() === 4 && !!platte);
ok('Platte: Flaechenmaße + €/m² gespeichert',
  platte.breite_mm === 1250 && platte.hoehe_mm === 2000 && platte.dicke_mm === 12.5 && platte.einheit === 'm2');

// 5f) Unvollstaendige Eingabe wird sichtbar abgelehnt (nichts gespeichert)
kWaehleKategorie('latte');
kSetze({ 'k-breite':'40', 'k-dicke':'60', 'k-preis':'1.00' });   // Standardlaenge fehlt
$('k-add').dispatch('click');
ok('Latte ohne Standardlaenge wird abgelehnt', kAnzahl() === 4 && kFehler() && /laenge_mm/.test(kMsgTxt()));
kSetze({ 'k-breite':'40', 'k-dicke':'60', 'k-laenge':'3000', 'k-preis':'1.00' });
$('k-einheit').value = 'm2';                                      // €/m² ist fuer Latten unzulaessig
$('k-add').dispatch('click');
ok('unzulaessige Preisbasis wird abgelehnt', kAnzahl() === 4 && kFehler() && /nicht zulässig/.test(kMsgTxt()));

// 5g) Bearbeiten ueber die Tabelle
kZeile('bearbeiten', 'latte-40-60-3000');
ok('Bearbeiten fuellt das Formular', $('k-bez').value === kProd('latte-40-60-3000').bezeichnung
  && $('k-preis').value === '1.25' && $('k-id').value === 'latte-40-60-3000');
ok('Formular schaltet in den Bearbeitungsmodus',
  $('k-add').textContent === 'Änderungen speichern' && $('k-cancel').hidden === false);
$('k-preis').value = '1.35';
$('k-add').dispatch('click');
ok('Preisaenderung gespeichert (kein neues Produkt)',
  kAnzahl() === 4 && kProd('latte-40-60-3000').preis === 1.35);
ok('Formular ist zurueck im Anlagemodus',
  $('k-add').textContent === 'Produkt hinzufügen' && $('k-cancel').hidden === true);

// 5h) Duplizieren + Abbrechen
kZeile('duplizieren', 'latte-40-60-3000');
ok('Duplikat angelegt und zur Bearbeitung geoeffnet',
  kAnzahl() === 5 && !!kProd('latte-40-60-3000-kopie') && $('k-id').value === 'latte-40-60-3000-kopie');
$('k-cancel').dispatch('click');
ok('Abbrechen verlaesst den Bearbeitungsmodus', $('k-add').textContent === 'Produkt hinzufügen');

// 5i) Loeschen (nur mit Bestaetigung)
confirmAntwort = false;
kZeile('produkt-loeschen', 'latte-40-60-3000-kopie');
ok('Loeschen ohne Bestaetigung passiert nicht', kAnzahl() === 5);
confirmAntwort = true;
kZeile('produkt-loeschen', 'latte-40-60-3000-kopie');
ok('Loeschen mit Bestaetigung entfernt das Produkt', kAnzahl() === 4 && !kProd('latte-40-60-3000-kopie'));

// 5j) Mehrfach-Freigabe je Kategorie am aktiven Projekt (nur IDs)
const aktivKat = store.aktivId();
ok('Ausgangslage: leere Auswahl am aktiven Element', KAT.anzahlAuswahl(store.katalogAuswahl()) === 0);
kHaken('latte-40-60-3000', true);
kHaken('latte-40-60-5000', true);
kHaken('gewindestange-m10-1100', true);
kHaken('platte-gk-125', true);
ok('mehrere Produkte derselben Kategorie freigegeben',
  store.katalogAuswahl().latte.length === 2
  && store.katalogAuswahl().latte.includes('latte-40-60-3000')
  && store.katalogAuswahl().latte.includes('latte-40-60-5000'));
ok('Freigabe je Kategorie getrennt',
  store.katalogAuswahl().gewindestange.length === 1 && store.katalogAuswahl().beplankung.length === 1);
ok('Freigabe speichert nur IDs, keine Preise/Maße',
  !JSON.stringify(store.aktiveEingaben().katalog).includes('1.35')
  && !JSON.stringify(store.aktiveEingaben().katalog).includes('breite_mm'));
ok('Wandelement bleibt frei von Katalogdaten (Ownership Modul 1)',
  !JSON.stringify(store.aktivesWandelement()).includes('latte-40-60-3000'));
kHaken('latte-40-60-5000', false);
ok('Haekchen entfernen loest die Freigabe', store.katalogAuswahl().latte.length === 1);
kHaken('latte-40-60-5000', true);

// 5k) Persistenz „nach Reload": alles steht im localStorage, nichts nur im DOM
ok('Katalog liegt im eigenen localStorage-Schluessel',
  JSON.parse(localStorage.getItem('sembla:katalog')).produkte.length === 4);
ok('Auswahl liegt am Element im Projektstand',
  JSON.parse(localStorage.getItem('sembla:elemente'))[aktivKat].eingaben.katalog.auswahl.latte.length === 2);
ok('Auswahl ist nach erneutem Laden wieder da (store liest frisch)',
  store.holeEingaben(aktivKat).katalog.auswahl.beplankung[0] === 'platte-gk-125');
ok('Projekt-JSON traegt die Auswahl, Format bleibt v2',
  store.projektObjekt(aktivKat).eingaben.katalog.auswahl.latte.length === 2
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

// 5n) Referenzwarnungen: fehlende/unbekannte Produkte werden sichtbar gemeldet
ok('Auswahl wurde durch den Katalogwechsel NICHT bereinigt',
  store.holeEingaben(aktivKat).katalog.auswahl.latte.length === 2);
ok('Warnbox zeigt die unaufloesbaren Referenzen',
  $('k-warn').hidden === false && /latte-40-60-3000/.test($('k-warn').innerHTML)
  && /fehlt im geladenen Katalog/.test($('k-warn').innerHTML));
ok('Warnbox meldet jede fehlende Referenz einzeln',
  ($('k-warn').innerHTML.match(/<li>/g) || []).length === 4);

confirmAntwort = true;
$('k-entfernen').dispatch('click');
ok('Katalog entfernt, Referenzen bleiben stehen',
  kat() === null && store.holeEingaben(aktivKat).katalog.auswahl.latte.length === 2);
ok('ohne Katalog warnt die gesamte Auswahl (kein stiller Nullpreis)',
  $('k-warn').hidden === false && /4 Produkt\(e\)/.test($('k-warn').innerHTML)
  && /kein Bauteilkatalog geladen/.test($('k-warn').innerHTML));

// 5o) Erstes Produkt ohne vorher angelegten Katalog legt einen Katalog an
$('k-name').value = 'Direktkatalog';
kWaehleKategorie('gewindestange');
kSetze({ 'k-gewinde':'M16', 'k-laenge':'2000', 'k-preis':'9.90' });
$('k-einheit').value = 'Stk';
$('k-add').dispatch('click');
ok('Produktanlage ohne bestehenden Katalog erzeugt ihn',
  !!kat() && kat().name === 'Direktkatalog' && kAnzahl() === 1);

// 5p) Zentraler Projekt-ZIP-Export bleibt unveraendert katalogfrei
const projektDateien = baueDateien(store.projektObjekt(aktivKat), ['projekt','stueckliste']);
ok('Projekt-ZIP enthaelt keine Katalog-Datei',
  projektDateien.length === 2 && !projektDateien.some(f => /Bauteilkatalog/.test(f.name)));
ok('Projekt-Datei traegt nur die Auswahl-IDs',
  (() => { const p = JSON.parse(projektDateien[0].data);
           return p.eingaben.katalog.auswahl.latte.length === 2
             && !JSON.stringify(p.eingaben.katalog).includes('Latte 40'); })());

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
