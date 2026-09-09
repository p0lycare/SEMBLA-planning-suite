// Smoke-Test Modul 10 (docs/katalog.html): prueft die ECHTE Katalogpflege gegen einen
// DOM-/localStorage-Mock. Ausgefuehrt wird unveraendert der Produktcode des klassischen
// <script>-Blocks; die Shared-Bindungen kommen — wie im Browser — ueber `window.SEMBLA`,
// danach laeuft `window.__katInit()`.
//
// Schwerpunkte (#119, Neuzuschnitt der Seite):
//  - ZWEI Listen: was es im Repo gibt (herausgegebene Fassungen, nur lesen) und was lokal
//    in diesem Browser liegt (bearbeitbar). Der Nutzer sieht den Bestand, bevor er etwas tut.
//  - DREI Erzeugungswege an einer Stelle: importieren, aus einer Repo-Vorlage, leer.
//  - Je lokalem Katalog: bearbeiten, umbenennen, exportieren, loeschen.
//  - Repo-Vorlagen sind NICHT bearbeitbar; der Weg zum Aendern ist das ausdrueckliche
//    Erzeugen eines eigenen Katalogs daraus. Die frueher noetige Variantenrueckfrage
//    mitten in der Eingabe ist damit entfallen.
//  - Modul 10 kennt die ZUORDNUNG Katalog <-> Projekt nicht: sie wird hier weder gelesen
//    noch angezeigt noch geschrieben ([L-12] bleibt Sache von Modul 0). Geprueft wird das
//    per BYTE-Vergleich gegen `sembla:projekte` und `sembla:aktiv:katalog` UND daran, dass
//    die Seite kein Wort darueber verliert.
//  - [P-16]: Abbrechen, Escape und Klick neben den Dialog lassen die Katalogdaten
//    BYTE-GLEICH; jeder Fehlschlag wird benannt.
//
// Den Kopierschutz von `store.setzeKatalog` prueft `smoke_storage.mjs` dort, wo er lebt —
// er ist seit #119 reines Sicherheitsnetz und nicht mehr Bedienweg.
// Nur synthetische Fantasiedaten.

import { readFileSync } from "node:fs";

// --- Polyfills ------------------------------------------------------------
class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();
globalThis.window = { addEventListener(){}, location: { href: '' } };

class El {
  constructor(id){ this.id=id; this.value=''; this.textContent=''; this._h=''; this.className='';
    this.hidden=false; this.checked=false; this.style={}; this.dataset={}; this.listeners={}; this.files=[]; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f); }
  // Rueckgabewert des letzten Hoerers durchreichen (async-Hoerer: Promise abwarten).
  dispatch(e,ev){ let r; (this.listeners[e]||[]).forEach(f=>{ r=f(ev||{target:this}); }); return r; }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h=v; }
  querySelectorAll(){ return []; }
  querySelector(){ return null; }
  closest(){ return null; }
  click(){}                                       // echtes <a>: der Katalogexport ruft es
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
let confirmAntwort = false;                       // vom Test gesteuert (Loeschen/Entfernen)
const confirmTexte = [];
globalThis.confirm = (t) => { confirmTexte.push(String(t == null ? '' : t)); return confirmAntwort; };
// #119 Umbenennen und „leeren Katalog erstellen“ fragen den NAMEN ueber prompt(); der
// Test stellt die Antwort, `null` = abgebrochen.
let promptAntwort = null;
const promptTexte = [];
globalThis.prompt = (t) => { promptTexte.push(String(t == null ? '' : t)); return promptAntwort; };

// Datei-Downloads abfangen (Katalog-Export laeuft ueber Blob/URL wie im Browser).
let letzterDownload = null;
globalThis.Blob = class {
  constructor(parts, opt){ this._t = (parts||[]).join(''); this.type = (opt && opt.type) || ''; }
};
URL.createObjectURL = (b) => { letzterDownload = b._t; return 'blob:x'; };
URL.revokeObjectURL = () => {};

// Die Repo-Vorlage wird im Browser per fetch() gelesen — hier aus dem echten Repo-Pfad.
// Damit laeuft der ECHTE Vorlagenweg (#102) samt kanonischer Vorlagenkennung.
const fetchPfade = [];
globalThis.fetch = async (pfad) => {
  fetchPfade.push(String(pfad));
  const datei = String(pfad).replace(/^\.\//, '');
  try {
    const text = readFileSync(new URL('../../docs/' + datei, import.meta.url), 'utf8');
    return { ok: true, status: 200, text: async () => text };
  } catch { return { ok: false, status: 404, text: async () => '' }; }
};

// --- Abhaengigkeiten wie im Browser ---------------------------------------
const store = await import("../../docs/shared/storage.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");
const MAPPE = await import("../../docs/shared/sembla-projektmappe.js");

// --- Produktcode aus docs/katalog.html laden ------------------------------
// Ausgefuehrt wird der KLASSISCHE <script>-Block (Architektur-Regel 2); die Bindungen
// kommen wie im Browser aus window.SEMBLA.
const html = readFileSync(new URL("../../docs/katalog.html", import.meta.url), "utf8");
const src = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
new Function(src)();
globalThis.window.SEMBLA = { store, KAT };

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const $=id=>document.getElementById(id);

// --- Byte-Staende der drei betroffenen Slots ------------------------------
const SLOT_KAT = 'sembla:kataloge', SLOT_PRJ = 'sembla:projekte', SLOT_AKT = 'sembla:aktiv:katalog';
const slots = () => ({ kataloge: localStorage.getItem(SLOT_KAT),
                       projekte: localStorage.getItem(SLOT_PRJ),
                       aktivKat: localStorage.getItem(SLOT_AKT) });
const kataloge = () => JSON.parse(localStorage.getItem(SLOT_KAT) || '{}');
const kMsgTxt = () => $('k-msg').textContent;
const kFehler = () => $('k-msg').className === 'msg err';

// --- Bedienhilfen der NEUEN Oberflaeche (#119) ----------------------------
// Es gibt kein Auswahlfeld und kein Namensfeld mehr. Gelesen wird, was die Seite
// tatsaechlich zeichnet: die aktive Zeile traegt `lz akt`, jede Zeile ihre Aktionen.
const repoHtml  = () => $('k-repo').innerHTML;
const lokalHtml = () => $('k-lokal').innerHTML;
const seiteHtml = () => repoHtml() + lokalHtml() + $('k-titel').textContent
                        + $('k-nurlesen').innerHTML;

/** Kennung des gerade bearbeiteten Katalogs — aus der hervorgehobenen Zeile. */
function aktiveKid(){
  for (const h of [lokalHtml(), repoHtml()]) {
    const m = h.match(/<div class="lz akt">[\s\S]*?data-kid="([^"]+)"/);
    if (m) return m[1];
  }
  return '';
}
const kat = () => store.katalogNachId(aktiveKid());
const kAnzahl = () => (kat()?.produkte || []).length;
const kProd = (id) => KAT.produkt(kat() || { produkte: [] }, id);

/** Eine Zeilenaktion einer der beiden Listen ausloesen (wie ein Klick im Browser). */
const lAkt = (host, kakt, kid) =>
  $(host).dispatch('click', { target: { dataset: { kakt, kid: String(kid) } } });
const bearbeite = (id) => lAkt('k-lokal', 'bearbeiten-kat', id);

/** Anzahl der Zeilen einer Liste. */
const zeilen = (host) => (($(host).innerHTML.match(/class="lz/g)) || []).length;
/** Traegt eine Liste eine Aktion fuer diese Kennung? */
const hatAkt = (host, kakt, kid) =>
  new RegExp(`data-kakt="${kakt}" data-kid="${kid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
    .test($(host).innerHTML);

// --- Produktdialog (mit #108 unveraendert nach Modul 10 gezogen) ----------
const kpOffen = () => $('kp-overlay').hidden === false;
const kpFehler = () => $('kp-msg').className === 'msg err';
const kpMsgTxt = () => $('kp-msg').textContent;
const kpMarkup = () => $('kp-felder').innerHTML;
const kpFelderListe = () => [...kpMarkup().matchAll(/id="kp-f-([a-z_]+)"/g)].map(m => m[1]);
const kpBeschListe = () => [...$('kp-besch').innerHTML.matchAll(/id="kp-f-([a-z_]+)"/g)].map(m => m[1]);
const kpAlleFelder = () => [...kpFelderListe(), ...kpBeschListe()];
const kpSpeichern = () => $('kp-speichern').dispatch('click');
const kpAbbrechen = () => $('kp-cancel').dispatch('click');
function kZeile(act, pid){ $('k-tbody').dispatch('click', { target: { dataset:{ act, pid } } }); }
function kpKategorie(id){ $('kp-kat').value = id; $('kp-kat').dispatch('change'); }
/** Grundfelder + Maskenfelder setzen; nicht genannte Maskenfelder werden geleert. */
function kpSetze({ bez = '', id = '', preis = '', einheit = null, ...felder }){
  $('kp-bez').value = String(bez); $('kp-id').value = String(id); $('kp-preis').value = String(preis);
  if (einheit) $('kp-einheit').value = einheit;
  for (const f of kpAlleFelder()) $('kp-f-' + f).value = String(felder[f] != null ? felder[f] : '');
}

// --- Baugruppen ----------------------------------------------------------
// Der Hoerer der Set-Tabelle sucht den Knopf per `closest('button[data-act]')` — genau
// das wird hier nachgebildet, damit der ECHTE Bedienweg laeuft.
const sZeile = (act, set, pos) => {
  const btn = new El('b');
  btn.dataset = { act, set: String(set), pos: pos == null ? '' : String(pos) };
  return $('ks-tbody').dispatch('click',
    { target: { closest: (sel) => (sel === 'button[data-act]' ? btn : null) } });
};
const sets = () => KAT.normSets((kat() || {}).sets);
const sFind = (id) => sets().find(x => x.id === id) || null;
function sPos(art, ref, menge){
  $('ks-art').value = art; $('ks-art').dispatch('change');
  $('ks-ref').value = ref; $('ks-menge').value = String(menge);
  $('ks-pos-add').dispatch('click');
}

// --- Die ECHTE Repo-Vorlage aus dem Checkout ------------------------------
const vorlagenBasis = new URL("../../docs/vorlagen/", import.meta.url);
const vorlageDatei = (name) => readFileSync(new URL(name, vorlagenBasis), "utf8");
const V_KAT = KAT.VORLAGE_KATALOG_PFAD.replace(/^\.\/vorlagen\//, "");
const V_DATEI = KAT.parseKatalog(vorlageDatei(V_KAT));
const V_KAT_ANZ = V_DATEI.produkte.length;
const V_ID = KAT.vorlageKatalogId(KAT.VORLAGE_KATALOG_PFAD);
const MANIFEST = KAT.parseVorlagenManifest(vorlageDatei('kataloge.json'));

const kFile = (text, name) => ({ name, text: async () => text });
/** Eine Datei „auswaehlen“ wie im Browser (verstecktes Feld + change). */
const importiere = (text, name) => {
  $('k-import').files = [kFile(text, name)];
  return $('k-import').dispatch('change', { target: $('k-import') });
};

// =====================================================================
//  1) Ausgangslage und Seitenstart
// =====================================================================
// Ein Projekt MIT zugeordnetem Katalog — genau die Lage, in der die Seite frueher den
// Zuordnungsstatus an vier Stellen anzeigte. Sie darf ihn jetzt nirgends nennen.
const katA = store.setzeKatalog({ ...KAT.leererKatalog('Katalog A (zugeordnet)'),
  produkte: [{ id:'stein-a', kategorie:'stein', bezeichnung:'Stein A',
               einheit:'Stk', preis:9.5, breite_mm:250 }] }, { zuordnen: false });
const katB = store.setzeKatalog({ ...KAT.leererKatalog('Katalog B (nicht zugeordnet)'),
  produkte: [{ id:'latte-b', kategorie:'latte', bezeichnung:'Latte B',
               einheit:'m', preis:2.4, breite_mm:60, dicke_mm:40, laenge_mm:3000 }] },
  { zuordnen: false });
const prj = store.setzeMappe(MAPPE.leereMappe('Projekt Kataloge'));
store.setzeAktivesProjekt(prj.projekt.id);
store.setzeProjektKatalog(katA.id);

ok('Ausgangslage: zwei Kataloge, Katalog A ist dem aktiven Projekt zugeordnet',
  store.listeKataloge().length === 2 && store.holeMappe().katalog === katA.id);

/** Wartet, bis die Seite das Vorlagenverzeichnis gelesen und die Repo-Liste gezeichnet
 *  hat. Gebunden statt endlos: bleibt sie leer, schlaegt die Pruefung darunter fehl. */
async function bisRepoGelesen(){
  for (let i = 0; i < 50 && /wird gelesen/.test(repoHtml()); i++) {
    await new Promise((r) => setImmediate(r));
  }
}

window.__katInit();
await bisRepoGelesen();

ok('#119 die Seite zeigt die lokalen Kataloge als LISTE, nicht als Auswahlfeld',
  zeilen('k-lokal') === 2
  && /Katalog A \(zugeordnet\)/.test(lokalHtml())
  && /Katalog B \(nicht zugeordnet\)/.test(lokalHtml()));
ok('#119 jede lokale Zeile nennt den Umfang',
  /1 Produkt\(e\)/.test(lokalHtml()) && /0 Baugruppe\(n\)/.test(lokalHtml()));
ok('#119 jede lokale Zeile bietet Bearbeiten, Umbenennen, Exportieren und Löschen',
  ['bearbeiten-kat','umbenennen','exportieren','loeschen']
    .every(a => hatAkt('k-lokal', a, katB.id)));
ok('#119 die Seite nennt die Zuordnung NIRGENDS — das ist Sache von Modul 0',
  !/zugeordnet\b/.test(seiteHtml().replace(/Katalog A \(zugeordnet\)|Katalog B \(nicht zugeordnet\)/g, ''))
  && !/\[L-12\]/.test(seiteHtml()));
ok('#119 vorbelegt ist ein LOKALER Katalog, nicht der zugeordnete',
  !!aktiveKid() && !!store.katalogNachId(aktiveKid())
  && !KAT.istVorlagenKatalog(store.katalogNachId(aktiveKid())));
ok('#119 der Kopf der Pflege nennt den bearbeiteten Katalog',
  $('k-titel').textContent === 'Produkte in „' + kat().name + '“');
ok('das Oeffnen der Seite hat NICHTS geschrieben',
  store.holeMappe().katalog === katA.id && store.listeKataloge().length === 2);

// =====================================================================
//  2) Die Repo-Liste: herausgegebene Fassungen, nur lesen
// =====================================================================
ok('#119 die Repo-Liste zeigt jede herausgegebene Fassung',
  zeilen('k-repo') === MANIFEST.fassungen.length && MANIFEST.fassungen.length >= 1);
ok('#119 die Fassung ist als nur lesbar und mit ihrem Stand ausgewiesen',
  /nur lesen/.test(repoHtml())
  && MANIFEST.fassungen.every(f => repoHtml().includes(f.version)));
ok('#119 die aktuell empfohlene Fassung ist als solche gekennzeichnet',
  /aktuelle Fassung/.test(repoHtml()));
ok('#119 eine noch nicht geladene Fassung bietet Laden und Übernehmen an',
  hatAkt('k-repo', 'laden', KAT.VORLAGE_KATALOG_PFAD)
  && hatAkt('k-repo', 'aus-vorlage', KAT.VORLAGE_KATALOG_PFAD));
ok('#119 sie erscheint NICHT in der Liste der lokalen Kataloge',
  !lokalHtml().includes(V_ID));

// (a) Laden: die Fassung wird frisch aus dem Repo gelesen
const vorLaden = slots();
await lAkt('k-repo', 'laden', KAT.VORLAGE_KATALOG_PFAD);
ok('#119 „Laden“ liest die ECHTE Repo-Datei unter der kanonischen Kennung',
  !kFehler() && !!store.katalogNachId(V_ID)
  && KAT.istVorlagenKatalog(store.katalogNachId(V_ID))
  && store.katalogNachId(V_ID).produkte.length === V_KAT_ANZ
  && fetchPfade[fetchPfade.length - 1] === KAT.VORLAGE_KATALOG_PFAD);
ok('#119 die geladene Fassung bleibt in der REPO-Liste — kein Doppeleintrag lokal',
  zeilen('k-lokal') === 2 && !lokalHtml().includes(V_ID)
  && hatAkt('k-repo', 'ansehen', V_ID));
ok('#119 das Laden ordnet NICHTS zu ([L-12] unberührt)',
  vorLaden.projekte === localStorage.getItem(SLOT_PRJ)
  && vorLaden.aktivKat === localStorage.getItem(SLOT_AKT));

// (b) Ansehen: Inhalt sichtbar, Bedienung gesperrt
await lAkt('k-repo', 'ansehen', V_ID);
ok('#119 „Inhalt ansehen“ zeigt die Produkte der Fassung',
  aktiveKid() === V_ID && kAnzahl() === V_KAT_ANZ
  && $('k-titel').textContent.includes(V_DATEI.name));
ok('#119 dabei sagt eine Leiste, dass hier nur gelesen wird',
  $('k-nurlesen').hidden === false
  && /Repo-Vorlage, nur lesen/.test($('k-nurlesen').innerHTML)
  && /Als eigenen Katalog übernehmen/.test($('k-nurlesen').innerHTML));
ok('#119 die Pflege ist dabei GESPERRT — nicht erst beim Schreiben',
  $('k-produkt-neu').disabled === true && $('ks-neu').disabled === true
  && $('ks-pos-add').disabled === true);

// (c) Schreiben an der Vorlage wird abgewiesen, nicht in eine Variante umgelenkt
// Die Sicherheitsabfrage wird ausdruecklich BESTAETIGT — sonst bricht schon sie ab und
// der Vorlagenschutz waere gar nicht geprueft.
const vorSchreib = slots();
confirmAntwort = true;
kZeile('produkt-loeschen', V_DATEI.produkte[0].id);
confirmAntwort = false;
ok('#119 an einer Repo-Vorlage wird nicht geschrieben und keine Variante angelegt',
  kFehler() && /nicht bearbeitet/.test(kMsgTxt())
  && slots().kataloge === vorSchreib.kataloge
  && Object.keys(kataloge()).length === 3);
ok('#119 und es kam KEINE Rückfrage mitten in der Bedienung',
  !confirmTexte.some(t => /Variante/.test(t)));

// =====================================================================
//  3) Aus einer Repo-Vorlage einen EIGENEN Katalog erzeugen
// =====================================================================
const vorUebernahme = slots();
const anzVor = Object.keys(kataloge()).length;
await lAkt('k-repo', 'aus-vorlage', KAT.VORLAGE_KATALOG_PFAD);
const eigen = kat();
ok('#119 „Als eigenen Katalog übernehmen“ legt einen bearbeitbaren Katalog an',
  !kFehler() && !!eigen && !KAT.istVorlagenKatalog(eigen)
  && eigen.produkte.length === V_KAT_ANZ
  && Object.keys(kataloge()).length === anzVor + 1);
ok('#119 er traegt einen unterscheidbaren Namen und eine eigene Kennung',
  eigen.id !== V_ID && eigen.name !== V_DATEI.name
  && eigen.name.startsWith(V_DATEI.name));
ok('#119 er steht in der LOKALEN Liste und wird bearbeitet',
  zeilen('k-lokal') === 3 && lokalHtml().includes(eigen.id) && aktiveKid() === eigen.id);
ok('#119 die Repo-Vorlage bleibt byte-unveraendert',
  JSON.stringify(kataloge()[V_ID]) === JSON.stringify(JSON.parse(vorUebernahme.kataloge)[V_ID]));
ok('#119 die Uebernahme ordnet NICHTS zu',
  vorUebernahme.projekte === localStorage.getItem(SLOT_PRJ)
  && vorUebernahme.aktivKat === localStorage.getItem(SLOT_AKT));
ok('#119 jetzt ist die Pflege offen',
  $('k-produkt-neu').disabled === false && $('k-nurlesen').hidden === true);

// =====================================================================
//  4) Die drei Erzeugungswege stehen an EINER Stelle
// =====================================================================
$('k-neu').dispatch('click');
ok('#119 „Neuen Katalog erzeugen“ oeffnet einen Dialog mit den drei Wegen',
  $('kn-overlay').hidden === false
  && html.includes('id="kn-import"') && html.includes('id="kn-vorlage"')
  && html.includes('id="kn-leer"'));
ok('#119 jeder Weg sagt in einem Satz, wofuer er gut ist',
  /Datei .* einlesen|Datei/.test(html.match(/id="kn-import"[\s\S]*?<\/button>/)[0])
  && /bearbeitbaren Katalog/.test(html.match(/id="kn-vorlage"[\s\S]*?<\/button>/)[0])
  && /Von null/.test(html.match(/id="kn-leer"[\s\S]*?<\/button>/)[0]));

// (a) Abbrechen legt nichts an
const vorAbbruch = slots();
$('kn-cancel').dispatch('click');
ok('#119 Abbrechen schliesst den Dialog und legt nichts an',
  $('kn-overlay').hidden === true
  && slots().kataloge === vorAbbruch.kataloge && /Abgebrochen/.test(kMsgTxt()));

// (b) Leerer Katalog — der Name kommt ueber prompt()
$('k-neu').dispatch('click');
promptAntwort = null;
$('kn-leer').dispatch('click');
ok('#119 abgebrochene Namensabfrage legt keinen Katalog an',
  slots().kataloge === vorAbbruch.kataloge && $('kn-overlay').hidden === false);
promptAntwort = '  Eigener Leerkatalog  ';
$('kn-leer').dispatch('click');
const leer = kat();
ok('#119 „Leeren Katalog erstellen“ legt ihn unter dem getippten Namen an',
  !kFehler() && $('kn-overlay').hidden === true
  && leer.name === 'Eigener Leerkatalog' && leer.produkte.length === 0
  && zeilen('k-lokal') === 4 && aktiveKid() === leer.id);
ok('#119 er tritt NEBEN die bisherigen — keiner wird ersetzt',
  !!kataloge()[katA.id] && !!kataloge()[katB.id] && !!kataloge()[eigen.id]);
ok('#119 und ordnet nichts zu',
  vorAbbruch.projekte === localStorage.getItem(SLOT_PRJ)
  && vorAbbruch.aktivKat === localStorage.getItem(SLOT_AKT));

// (c) Importieren
$('k-neu').dispatch('click');
$('kn-import').dispatch('click');
ok('#119 „Katalog importieren“ schliesst den Dialog und oeffnet die Dateiwahl',
  $('kn-overlay').hidden === true);
const importDatei = JSON.stringify({ format: KAT.KATALOG_FORMAT, version: 2,
  name: 'Importierter Katalog', produkte: [{ id:'stein-imp', kategorie:'stein',
    bezeichnung:'Importstein', einheit:'Stk', preis:7.25, breite_mm:375 }], sets: [] });
await importiere(importDatei, 'fremd.json');
ok('#119 der Import legt einen eigenen lokalen Katalog an und waehlt ihn',
  !kFehler() && kat().name === 'Importierter Katalog' && kAnzahl() === 1
  && zeilen('k-lokal') === 5 && /importiert/.test(kMsgTxt()));
const impId = aktiveKid();
ok('#119 der Import ordnet nichts zu',
  store.holeMappe().katalog === katA.id
  && localStorage.getItem(SLOT_AKT) === vorAbbruch.aktivKat);

// (d) Ein kaputter Import wird benannt und aendert nichts
const vorKaputt = slots();
await importiere('{kein json', 'kaputt.json');
ok('#119 ein kaputter Import wird benannt und laesst alles unveraendert',
  kFehler() && /fehlgeschlagen/.test(kMsgTxt()) && slots().kataloge === vorKaputt.kataloge);

// =====================================================================
//  5) Umbenennen, Exportieren, Loeschen je lokalem Katalog
// =====================================================================
// (a) Umbenennen
promptAntwort = null;
lAkt('k-lokal', 'umbenennen', impId);
ok('#119 abgebrochenes Umbenennen aendert nichts',
  store.katalogNachId(impId).name === 'Importierter Katalog' && /Nicht umbenannt/.test(kMsgTxt()));
promptAntwort = '   ';
lAkt('k-lokal', 'umbenennen', impId);
ok('#119 ein leerer Name wird benannt abgewiesen',
  kFehler() && store.katalogNachId(impId).name === 'Importierter Katalog');
promptAntwort = 'Umbenannter Katalog';
lAkt('k-lokal', 'umbenennen', impId);
ok('#119 Umbenennen wirkt und laesst den Produktbestand unberuehrt',
  !kFehler() && store.katalogNachId(impId).name === 'Umbenannter Katalog'
  && store.katalogNachId(impId).produkte.length === 1
  && /Umbenannter Katalog/.test(lokalHtml()));
ok('#119 Umbenennen aendert die KENNUNG nicht — eine Zuordnung kann davon nicht brechen',
  !!kataloge()[impId] && store.holeMappe().katalog === katA.id);

// (b) Exportieren
lAkt('k-lokal', 'exportieren', impId);
ok('#119 Exportieren erzeugt eine eigene SEMBLA-Bauteilkatalog-Datei',
  !kFehler() && !!letzterDownload
  && JSON.parse(letzterDownload).format === KAT.KATALOG_FORMAT
  && JSON.parse(letzterDownload).name === 'Umbenannter Katalog');
ok('#119 die Exportdatei traegt KEINE Zuordnung und keinen Vorlagenmarker',
  !('katalog' in JSON.parse(letzterDownload))
  && !(KAT.VORLAGE_FELD in JSON.parse(letzterDownload)));

// (c) Loeschen — mit Sicherheitsabfrage
const vorLoesch = slots();
confirmAntwort = false;
lAkt('k-lokal', 'loeschen', impId);
ok('#119 abgelehntes Loeschen laesst alles byte-gleich',
  slots().kataloge === vorLoesch.kataloge && !!kataloge()[impId]);
ok('#119 die Abfrage nennt die Folge fuer die Waende — aber nicht die Projektzuordnung',
  /nicht auflösbar/.test(confirmTexte[confirmTexte.length - 1])
  && !/Zuordnung/.test(confirmTexte[confirmTexte.length - 1]));
confirmAntwort = true;
lAkt('k-lokal', 'loeschen', impId);
ok('#119 bestaetigtes Loeschen entfernt genau diesen Katalog',
  !kFehler() && !kataloge()[impId] && !!kataloge()[katA.id] && !!kataloge()[katB.id]
  && zeilen('k-lokal') === 4);

// (d) Eine geladene Repo-Fassung aus dem Browser entfernen — die Vorlage bleibt
lAkt('k-repo', 'vorlage-entfernen', V_ID);
ok('#119 eine geladene Fassung ist aus dem Browser entfernbar',
  !kFehler() && !kataloge()[V_ID]);
ok('#119 die Repo-Fassung bleibt in der Liste und ist wieder ladbar',
  hatAkt('k-repo', 'laden', KAT.VORLAGE_KATALOG_PFAD) && zeilen('k-repo') >= 1);
confirmAntwort = false;

// =====================================================================
//  6) Produktpflege im lokalen Katalog ([P-16])
// =====================================================================
bearbeite(katB.id);
ok('#119 „Bearbeiten“ macht genau diesen Katalog zum Bearbeitungsgegenstand',
  aktiveKid() === katB.id && $('k-titel').textContent.includes('Katalog B')
  && $('k-nurlesen').hidden === true && $('k-produkt-neu').disabled === false);

// (a) Anlegen
$('k-produkt-neu').dispatch('click');
ok('der Produktdialog oeffnet im Anlagemodus', kpOffen() && $('kp-titel').textContent === 'Produkt anlegen');
kpKategorie('gewindestange');
ok('[P-16] die Maske zeigt die Felder der Kategorie',
  kpFelderListe().includes('laenge_mm') && kpAlleFelder().includes('gewinde'));
kpSetze({ bez:'Gewindestange M10 850', id:'rod-850', preis:3.5, gewinde:'M10', laenge_mm:850 });
kpSpeichern();
ok('das Produkt landet im bearbeiteten Katalog',
  !kpOffen() && kAnzahl() === 2 && kProd('rod-850').preis === 3.5
  && kProd('rod-850').laenge_mm === 850);
ok('die Meldung nennt Bezeichnung und Kennung',
  /Produkt angelegt/.test(kMsgTxt()) && /rod-850/.test(kMsgTxt()));

// (b) Fehlerfall: Pflichtfeld fehlt -> benannt, nichts geschrieben
const vorFehler = slots();
$('k-produkt-neu').dispatch('click');
kpKategorie('gewindestange');
kpSetze({ bez:'Ohne Laenge', id:'rod-ohne', preis:1, gewinde:'M10' });
kpSpeichern();
ok('[P-16] ein fehlendes Pflichtfeld wird benannt und nichts gespeichert',
  kpOffen() && kpFehler() && /Nicht gespeichert/.test(kpMsgTxt())
  && slots().kataloge === vorFehler.kataloge);
kpAbbrechen();
ok('[P-16] Abbrechen laesst die Katalogdaten byte-gleich',
  !kpOffen() && slots().kataloge === vorFehler.kataloge);

// (c) Bearbeiten
kZeile('bearbeiten', 'rod-850');
ok('Bearbeiten oeffnet den Dialog mit den Werten des Produkts',
  kpOffen() && $('kp-preis').value === '3.5' && $('kp-id').value === 'rod-850');
kpSetze({ bez:'Gewindestange M10 850', id:'rod-850', preis:4.25, gewinde:'M10', laenge_mm:850 });
kpSpeichern();
ok('die Aenderung wirkt und legt kein zweites Produkt an',
  !kpOffen() && kAnzahl() === 2 && kProd('rod-850').preis === 4.25);

// (d) Duplizieren
kZeile('duplizieren', 'rod-850');
ok('Duplizieren bereitet eine Kopie mit freier Kennung vor',
  kpOffen() && $('kp-id').value === 'rod-850-kopie');
kpSetze({ bez:'Gewindestange M10 920', id:'rod-920', preis:4.6, gewinde:'M10', laenge_mm:920 });
kpSpeichern();
ok('die Kopie ist ein eigenes Produkt',
  kAnzahl() === 3 && kProd('rod-920').laenge_mm === 920 && !!kProd('rod-850'));

// (e) Produkt loeschen — mit Abfrage und benannter Folge
confirmAntwort = false;
const vorPLoesch = slots();
kZeile('produkt-loeschen', 'rod-920');
ok('abgelehntes Produktloeschen laesst alles byte-gleich',
  slots().kataloge === vorPLoesch.kataloge && kAnzahl() === 3);
confirmAntwort = true;
kZeile('produkt-loeschen', 'rod-920');
ok('bestaetigtes Loeschen entfernt genau dieses Produkt',
  kAnzahl() === 2 && !kProd('rod-920') && !!kProd('rod-850'));
ok('#119 die Meldung nennt den Weg zur Reparatur in den Waenden',
  /nicht auflösbar/.test(kMsgTxt()) && /Ersatz/.test(kMsgTxt()));
confirmAntwort = false;

// =====================================================================
//  7) Baugruppen ([P-21]) im bearbeiteten Katalog
// =====================================================================
$('ks-name').value = 'Wandabschluss';
$('ks-neu').dispatch('click');
ok('[P-21] eine Baugruppe wird im bearbeiteten Katalog angelegt',
  !kFehler() && sets().length === 1 && sets()[0].name === 'Wandabschluss');
const setId = sets()[0].id;
// „Set anlegen“ klappt die neue Baugruppe bereits auf; ein weiterer Klick wuerde sie
// zuklappen. Geoeffnet wird deshalb nur, wenn sie es nicht schon ist.
if ($('ks-pos').hidden) sZeile('set-oeffnen', setId);
ok('[P-21] die Positionspflege der neuen Baugruppe steht offen', $('ks-pos').hidden === false);
sZeile('set-oeffnen', setId);
ok('[P-21] ein zweiter Klick klappt sie wieder zu', $('ks-pos').hidden === true);
sZeile('set-oeffnen', setId);
sPos('produkt', 'rod-850', 2);
ok('[P-21] eine Position mit Menge wird uebernommen',
  !kFehler() && sFind(setId).positionen.length === 1
  && sFind(setId).positionen[0].menge === 2);
sPos('produkt', 'gibt-es-nicht', 1);
ok('[P-21] eine unaufloesbare Position wird benannt abgewiesen',
  kFehler() && sFind(setId).positionen.length === 1);
$('ks-name').value = '';
$('ks-neu').dispatch('click');
ok('[P-21] eine Baugruppe ohne Namen wird benannt abgewiesen',
  kFehler() && sets().length === 1);

// =====================================================================
//  8) Was Modul 10 NICHT tut
// =====================================================================
ok('die Seite meldet sich als Modul 10 an der gemeinsamen Kopfleiste',
  /mountNavbar\(10\)/.test(html) && /window\.__katInit\(\)/.test(html));
ok('Modul 10 haelt keine wand-/projektbezogene Produktauswahl ([P-13])',
  !/setzeProduktrolle/.test(src) && !/holeProdukte/.test(src));
ok('#119 Modul 10 liest die Zuordnung nicht — kein katalogStatus, kein setzeProjektKatalog',
  !/katalogStatus/.test(src) && !/setzeProjektKatalog/.test(src)
  && !/mappe\.katalog/.test(src));
// Kein Aufruf darf die Zuordnung beruehren: jeder der drei schreibenden Store-Aufrufe
// muss `zuordnen: false` mitgeben. Gezaehlt wird nicht — geprueft wird JEDE Fundstelle.
const schreibAufrufe = [...src.matchAll(
  /(setzeKatalog|ladeVorlagenKatalog|importiereKatalogDatei)\(([\s\S]{0,200}?)\);/g)];
ok('#119 jeder schreibende Store-Aufruf gibt ausdruecklich zuordnen:false mit',
  schreibAufrufe.length >= 4
  && schreibAufrufe.every((m) => /zuordnen:\s*false/.test(m[2])));
ok('#119 nirgends wird zuordnen:true gesetzt',
  !/zuordnen:\s*true/.test(src));
ok('#119 die Zuordnung des Projekts ist nach der ganzen Pflege unveraendert',
  store.holeMappe().katalog === katA.id);
ok('Modul 10 pflegt nichts am Wandelement',
  !/speichere\(/.test(src) && !/rechneWandelement/.test(src));
ok('#119 es gibt kein Auswahlfeld und kein freies Namensfeld mehr',
  !/id="k-wahl"/.test(html) && !/id="k-name"/.test(html));

// =====================================================================
//  Ausgabe
// =====================================================================
let schlecht = 0;
for (const [name, gut] of checks) {
  if (!gut) schlecht++;
  console.log(`  ${gut ? 'ok ' : 'FEHL'} ${name}`);
}
console.log(`\n${checks.length - schlecht}/${checks.length} Pruefungen ok (Modul 10, docs/katalog.html)`);
if (schlecht) process.exit(1);
