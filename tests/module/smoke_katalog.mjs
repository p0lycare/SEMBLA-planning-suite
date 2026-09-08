// Smoke-Test Modul 10 (docs/katalog.html): prueft die ECHTE Katalogpflege-Logik der neuen
// Seite gegen einen DOM-/localStorage-Mock. Ausgefuehrt wird unveraendert der Produktcode
// des klassischen <script>-Blocks; die Shared-Bindungen kommen — wie im Browser — ueber
// `window.SEMBLA`, danach laeuft `window.__katInit()`.
//
// Schwerpunkte (#108):
//  - Freie Katalogwahl: JEDER gespeicherte Katalog ist bearbeitbar, auch einer, der dem
//    aktiven Projekt NICHT zugeordnet ist.
//  - Bearbeiten ist nicht zuordnen: BYTE-Vergleich gegen DREI Slots — `sembla:kataloge`
//    (nur der gewaehlte Schluessel aendert sich), `sembla:projekte` (`mappe.katalog`
//    unveraendert) und `sembla:aktiv:katalog` (unveraendert). [L-12] bleibt Sache von Modul 0.
//  - Der volle Pflegeumfang: Anlegen, Bearbeiten, Duplizieren, Loeschen, Baugruppen,
//    Katalogimport und -export, Standardkatalog-Vorlage samt Kopierschutz (#102).
//  - [P-16]: Abbrechen, Escape und Klick neben den Dialog lassen die Katalogdaten
//    BYTE-GLEICH; jeder Fehlschlag wird benannt.
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
let confirmAntwort = false;                       // vom Test gesteuert (Loeschen)
const confirmTexte = [];
globalThis.confirm = (t) => { confirmTexte.push(String(t == null ? '' : t)); return confirmAntwort; };

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
const kMsgTxt = () => $('k-msg').textContent;
const kFehler = () => $('k-msg').className === 'msg err';
const kpMsgTxt = () => $('kp-msg').textContent;
/** Der gerade bearbeitete Katalog — gelesen ueber die Auswahlzeile der echten Seite. */
const gewaehlt = () => store.katalogNachId($('k-wahl').value);
const kAnzahl = () => (gewaehlt()?.produkte || []).length;
const kProd = (id) => KAT.produkt(gewaehlt() || { produkte: [] }, id);
const zeilenAkt = (act, pid, host='k-tbody') => {
  const btn = new El('b'); btn.dataset = { act, pid: String(pid) };
  return $(host).dispatch('click', { target: { closest: sel => sel === 'button[data-act]' ? btn : null } });
};
const setAkt = (act, set, pos) => {
  const btn = new El('b'); btn.dataset = { act, set: String(set), pos: pos == null ? '' : String(pos) };
  return $('ks-tbody').dispatch('click', { target: { closest: sel => sel === 'button[data-act]' ? btn : null } });
};
/** Produktdialog fuellen (nur Grundfelder — die Maske rendert der Produktcode selbst). */
function kpFuelle({ kategorie, preis, bez, id, felder = {} }){
  if (kategorie) { $('kp-kat').value = kategorie; $('kp-kat').dispatch('change'); }
  if (preis != null) $('kp-preis').value = String(preis);
  if (bez != null) $('kp-bez').value = bez;
  if (id != null) $('kp-id').value = id;
  for (const [f, v] of Object.entries(felder)) $('kp-f-' + f).value = String(v);
}
const kFile = (text, name) => ({ name, text: async () => text });
// Aus dem abgeloesten Modul-0-Test uebernommene Bedienhilfen: der Produktdialog und die
// Set-Tabelle sind mit #108 unveraendert nach Modul 10 gezogen, deshalb sind es genau
// dieselben Wege (Felder setzen -> Knopf druecken, Ereignisdelegation der Tabellen).
const kat = () => gewaehlt();
const kSlot = () => localStorage.getItem(SLOT_KAT);
const kataloge = () => JSON.parse(localStorage.getItem(SLOT_KAT) || '{}');
const kpOffen = () => $('kp-overlay').hidden === false;
const kpFehler = () => $('kp-msg').className === 'msg err';
const kpMarkup = () => $('kp-felder').innerHTML;
const kpFelderListe = () => [...kpMarkup().matchAll(/id="kp-f-([a-z_]+)"/g)].map(m => m[1]);
const kpSpeichern = () => $('kp-speichern').dispatch('click');
const kpAbbrechen = () => $('kp-cancel').dispatch('click');
function kZeile(act, pid){ $('k-tbody').dispatch('click', { target: { dataset:{ act, pid } } }); }
function kpKategorie(id){ $('kp-kat').value = id; $('kp-kat').dispatch('change'); }
/** Grundfelder + Maskenfelder setzen; nicht genannte Maskenfelder werden geleert. */
function kpSetze({ bez = '', id = '', preis = '', einheit = null, ...felder }){
  $('kp-bez').value = String(bez); $('kp-id').value = String(id); $('kp-preis').value = String(preis);
  if (einheit) $('kp-einheit').value = einheit;
  for (const f of kpFelderListe()) $('kp-f-' + f).value = String(felder[f] != null ? felder[f] : '');
}
/** Zeilenaktion der Set-Tabelle (Ereignisdelegation wie im Browser). */
const sZeile = (act, set, pos) =>
  $('ks-tbody').dispatch('click', { target: { dataset: { act, set, pos } } });
const sets = () => KAT.normSets((kat() || {}).sets);
const sFind = (id) => sets().find(x => x.id === id) || null;
/** Eine Position ueber die drei echten Felder setzen und den Knopf druecken. */
function sPos(art, ref, menge){
  $('ks-art').value = art; $('ks-art').dispatch('change');
  $('ks-ref').value = ref; $('ks-menge').value = String(menge);
  $('ks-pos-add').dispatch('click');
}
// Die ECHTE Repo-Vorlage aus dem Checkout (kein Fixture, nichts Vertrauliches).
const vorlagenBasis = new URL("../../docs/vorlagen/", import.meta.url);
const vorlageDatei = (name) => readFileSync(new URL(name, vorlagenBasis), "utf8");
const V_KAT = "SEMBLA_Standardkatalog.json", V_WAND = "SEMBLA_Musterwand.json";
const V_KAT_ANZ = KAT.parseKatalog(vorlageDatei(V_KAT)).produkte.length;
/** Den gewaehlten Katalog ueber die ECHTE Auswahlzeile umstellen. */
function waehle(id){ $('k-wahl').value = String(id); $('k-wahl').dispatch('change'); }

// =====================================================================
//  1) Ausgangslage: ein aktives Projekt MIT zugeordnetem Katalog
// =====================================================================
store.migrieren();
const mappe = store.fuegeProjektHinzu('Testprojekt');
store.setzeAktivesProjekt(mappe.projekt.id);
// Der zugeordnete Katalog entsteht ueber den kanonischen Schreibweg (wie in Modul 0
// vor dem Umzug): setzeKatalog OHNE Option ordnet dem aktiven Projekt zu.
const katA = store.setzeKatalog({ ...KAT.leererKatalog('Katalog A (zugeordnet)'),
  produkte: [{ id:'rod-a', kategorie:'gewindestange', bezeichnung:'Stange A',
               einheit:'Stk', preis:9.5, gewinde:'M10', guete:'8.8', laenge_mm:1000 }] });
ok('Ausgangslage: Katalog A ist dem aktiven Projekt zugeordnet',
  store.holeKatalog()?.id === katA.id && store.holeMappe().katalog === katA.id);

// Ein ZWEITER Katalog, der dem Projekt NICHT zugeordnet ist — er ist der Gegenstand
// der neuen freien Katalogwahl (#108).
const katB = store.setzeKatalog({ ...KAT.leererKatalog('Katalog B (nicht zugeordnet)'),
  produkte: [{ id:'latte-b', kategorie:'latte', bezeichnung:'Latte B',
               einheit:'m', preis:2.4, breite_mm:60, dicke_mm:40, laenge_mm:3000 }] },
  { zuordnen: false });
ok('[#108] ein zweiter Katalog liegt neben dem zugeordneten',
  store.katalogNachId(katB.id)?.name === 'Katalog B (nicht zugeordnet)'
  && store.listeKataloge().length === 2);
ok('[L-12] die Zuordnung des Projekts hat sich dadurch NICHT geaendert',
  store.holeMappe().katalog === katA.id && store.holeKatalog().id === katA.id);

// =====================================================================
//  2) Die Seite startet auf dem zugeordneten Katalog und sagt das
// =====================================================================
window.__katInit();
ok('Modul 10 startet auf dem zugeordneten Katalog',
  $('k-wahl').value === katA.id && $('k-name').value === 'Katalog A (zugeordnet)');
ok('die Auswahl bietet ALLE gespeicherten Kataloge an ([#108] frei waehlbar)',
  $('k-wahl').innerHTML.includes(katA.id) && $('k-wahl').innerHTML.includes(katB.id));
ok('die Auswahl weist den zugeordneten Katalog aus',
  /Katalog A \(zugeordnet\)[^<]*dem aktiven Projekt zugeordnet/.test($('k-wahl').innerHTML));
ok('der Blattzustand nennt den bearbeiteten Katalog und die Zuordnung sichtbar',
  /Bearbeitet: <b>Katalog A \(zugeordnet\)<\/b>/.test($('k-status').innerHTML)
  && /Dem aktiven Projekt zugeordnet/.test($('k-status').innerHTML)
  && /Zuordnung des aktiven Projekts: <b>Katalog A \(zugeordnet\)<\/b>/.test($('k-status').innerHTML));
ok('die Produkttabelle zeigt das Produkt des bearbeiteten Katalogs',
  /Stange A/.test($('k-tbody').innerHTML) && !/Latte B/.test($('k-tbody').innerHTML));

// =====================================================================
//  3) Der NICHT zugeordnete Katalog ist waehlbar und bearbeitbar
//     — und die Zuordnung bleibt byte-gleich (Kern von #108)
// =====================================================================
const vorAuswahl = slots();
$('k-wahl').value = katB.id;
$('k-wahl').dispatch('change');
ok('ein nicht zugeordneter Katalog laesst sich auswaehlen',
  $('k-wahl').value === katB.id && $('k-name').value === 'Katalog B (nicht zugeordnet)');
ok('der Wechsel wird benannt und die Nicht-Zuordnung ausdruecklich gesagt',
  /Katalog B/.test(kMsgTxt()) && /nicht zugeordnet/.test(kMsgTxt()) && !kFehler());
ok('der Blattzustand sagt „nicht zugeordnet“ und verweist auf Modul 0',
  /Diesem Projekt nicht zugeordnet/.test($('k-status').innerHTML)
  && /index\.html/.test($('k-status').innerHTML));
ok('die Tabelle zeigt jetzt den Bestand von Katalog B',
  /Latte B/.test($('k-tbody').innerHTML) && !/Stange A/.test($('k-tbody').innerHTML));
ok('die Auswahl selbst schreibt NICHTS (reine Anzeige)',
  JSON.stringify(slots()) === JSON.stringify(vorAuswahl));

const vorEdit = slots();
const katABytes = JSON.stringify(store.katalogNachId(katA.id));
// Produkt im NICHT zugeordneten Katalog bearbeiten — ueber die echten Bedienelemente.
zeilenAkt('bearbeiten', 'latte-b');
ok('Bearbeiten oeffnet den Produktdialog ([P-16]) und schreibt noch nichts',
  $('kp-overlay').hidden === false && JSON.stringify(slots()) === JSON.stringify(vorEdit));
$('kp-preis').value = '3.10';
$('kp-speichern').dispatch('click');
ok('Produkt im nicht zugeordneten Katalog geaendert',
  kProd('latte-b')?.preis === 3.1 && /Produkt geändert/.test(kMsgTxt()) && !kFehler());
const nachEdit = slots();
ok('[#108] NUR der gewaehlte Katalog-Slot hat sich geaendert',
  nachEdit.kataloge !== vorEdit.kataloge);
ok('[#108] der zugeordnete Katalog A bleibt BYTE-GLEICH',
  JSON.stringify(store.katalogNachId(katA.id)) === katABytes);
ok('[#108] `sembla:projekte` bleibt byte-gleich (mappe.katalog unberuehrt, [L-12])',
  nachEdit.projekte === vorEdit.projekte && store.holeMappe().katalog === katA.id);
ok('[#108] `sembla:aktiv:katalog` bleibt byte-gleich',
  nachEdit.aktivKat === vorEdit.aktivKat);
ok('der wirksame Katalog des Projekts ist weiterhin A',
  store.holeKatalog().id === katA.id);

// =====================================================================
//  4) [P-16] Abbruchpfade lassen die Katalogdaten byte-gleich
// =====================================================================
const vorAbbruch = slots();
$('k-produkt-neu').dispatch('click');
kpFuelle({ kategorie:'latte', preis:1.5, bez:'Wird verworfen', id:'wird-verworfen',
            felder:{ breite_mm:60, dicke_mm:40, laenge_mm:2000 } });
$('kp-cancel').dispatch('click');
ok('[P-16] „Abbrechen“ legt kein Produkt an und meldet das',
  !kProd('wird-verworfen') && $('kp-overlay').hidden === true
  && /Anlage abgebrochen/.test(kMsgTxt()) && !kFehler());
ok('[P-16] „Abbrechen“ laesst alle drei Slots byte-gleich',
  JSON.stringify(slots()) === JSON.stringify(vorAbbruch));

$('k-produkt-neu').dispatch('click');
kpFuelle({ kategorie:'latte', preis:1.5, bez:'Escape', id:'escape-weg',
            felder:{ breite_mm:60, dicke_mm:40, laenge_mm:2000 } });
document.dispatch('keydown', { key:'Escape' });
ok('[P-16] Escape legt kein Produkt an',
  !kProd('escape-weg') && $('kp-overlay').hidden === true
  && JSON.stringify(slots()) === JSON.stringify(vorAbbruch));

$('k-produkt-neu').dispatch('click');
kpFuelle({ kategorie:'latte', preis:1.5, bez:'Overlayklick', id:'overlay-weg',
            felder:{ breite_mm:60, dicke_mm:40, laenge_mm:2000 } });
$('kp-overlay').dispatch('click', { target: $('kp-overlay') });
ok('[P-16] Klick neben den Dialog legt kein Produkt an',
  !kProd('overlay-weg') && $('kp-overlay').hidden === true
  && JSON.stringify(slots()) === JSON.stringify(vorAbbruch));

// Duplizieren bricht ebenfalls ohne Schreibvorgang ab
zeilenAkt('duplizieren', 'latte-b');
ok('Duplizieren bereitet eine Kopie vor und schreibt noch NICHTS',
  $('kp-overlay').hidden === false && $('kp-id').value === 'latte-b-kopie'
  && JSON.stringify(slots()) === JSON.stringify(vorAbbruch));
$('kp-cancel').dispatch('click');
ok('[P-16] abgebrochenes Duplizieren legt nichts an und benennt genau das',
  !kProd('latte-b-kopie') && /Duplizieren abgebrochen/.test(kMsgTxt())
  && JSON.stringify(slots()) === JSON.stringify(vorAbbruch));

// Ein ungueltiges Produkt wird BENANNT abgewiesen — der Katalog bleibt byte-gleich
$('k-produkt-neu').dispatch('click');
kpFuelle({ kategorie:'latte', preis:'', bez:'Ohne Preis', id:'ohne-preis',
            felder:{ breite_mm:60, dicke_mm:40, laenge_mm:2000 } });
$('kp-speichern').dispatch('click');
ok('ungueltiges Produkt wird benannt abgewiesen, nichts geschrieben',
  /Nicht gespeichert/.test(kpMsgTxt()) && !kProd('ohne-preis')
  && JSON.stringify(slots()) === JSON.stringify(vorAbbruch));
$('kp-cancel').dispatch('click');

// =====================================================================
//  5) Duplizieren und Loeschen (der volle Pflegeumfang)
// =====================================================================
zeilenAkt('duplizieren', 'latte-b');
$('kp-preis').value = '4.20';
$('kp-speichern').dispatch('click');
ok('Duplizieren angelegt: Kopie mit eigener ID, Original unveraendert',
  kProd('latte-b-kopie')?.preis === 4.2 && kProd('latte-b')?.preis === 3.1
  && kAnzahl() === 2 && /Kopie angelegt/.test(kMsgTxt()));

confirmAntwort = false;
const vorLoesch = slots();
zeilenAkt('produkt-loeschen', 'latte-b-kopie');
ok('abgelehnte Sicherheitsabfrage loescht nichts',
  !!kProd('latte-b-kopie') && JSON.stringify(slots()) === JSON.stringify(vorLoesch));
confirmAntwort = true;
zeilenAkt('produkt-loeschen', 'latte-b-kopie');
ok('bestaetigtes Loeschen entfernt genau ein Produkt und bereinigt keine Referenz',
  !kProd('latte-b-kopie') && kAnzahl() === 1
  && /Gelöscht/.test(kMsgTxt()) && /nicht bereinigt/.test(kMsgTxt()));
ok('[#108] Loeschen im nicht zugeordneten Katalog laesst Zuordnung und Katalog A unberuehrt',
  JSON.stringify(store.katalogNachId(katA.id)) === katABytes
  && store.holeMappe().katalog === katA.id
  && localStorage.getItem(SLOT_AKT) === vorEdit.aktivKat);

// =====================================================================
//  6) Neuer Katalog: er tritt NEBEN die bisherigen und wird NICHT zugeordnet
// =====================================================================
const vorNeu = slots();
$('k-name').value = 'Katalog C';
$('k-neu').dispatch('click');
const katC = gewaehlt();
ok('[#108] neuer Katalog angelegt, leer, und hier zur Bearbeitung gewaehlt',
  !!katC && katC.name === 'Katalog C' && katC.produkte.length === 0
  && store.listeKataloge().length === 3);
ok('[#108] der neue Katalog wird NICHT zugeordnet und die Meldung sagt das',
  store.holeMappe().katalog === katA.id && /zugeordnet wird in Modul 0/.test(kMsgTxt())
  && vorNeu.projekte === localStorage.getItem(SLOT_PRJ)
  && vorNeu.aktivKat === localStorage.getItem(SLOT_AKT));
ok('die bisherigen Kataloge bleiben erhalten',
  !!store.katalogNachId(katA.id) && !!store.katalogNachId(katB.id));

// Katalogname umbenennen (eigener Schreibweg, derselbe Kopierschutz)
$('k-name').value = 'Katalog C — umbenannt';
$('k-name').dispatch('input');
ok('Katalogname aendert genau diesen Katalog',
  store.katalogNachId(katC.id).name === 'Katalog C — umbenannt'
  && store.katalogNachId(katA.id).name === 'Katalog A (zugeordnet)');

// Erstes Produkt in den neuen Katalog
$('k-produkt-neu').dispatch('click');
kpFuelle({ kategorie:'gewindestange', preis:11, bez:'Stange C', id:'rod-c',
            felder:{ gewinde:'M10', guete:'8.8', laenge_mm:920 } });
$('kp-speichern').dispatch('click');
ok('Produktanlage im neuen Katalog',
  kProd('rod-c')?.preis === 11 && kAnzahl() === 1 && /Produkt angelegt/.test(kMsgTxt()));

// =====================================================================
//  7) Baugruppen ([P-21]) im gewaehlten Katalog
// =====================================================================
$('ks-name').value = 'Wandabschluss C';
$('ks-neu').dispatch('click');
const setC = KAT.normSets(gewaehlt().sets)[0];
ok('[P-21] Baugruppe angelegt mit eigener Kennung',
  !!setC && setC.name === 'Wandabschluss C' && setC.positionen.length === 0
  && /Baugruppe angelegt/.test(kMsgTxt()));
// „Positionen“ klappt zu und wieder auf — reine Anzeige, schreibt nichts.
const vorKlapp = slots();
setAkt('set-oeffnen', setC.id);
ok('[P-21] Auf-/Zuklappen einer Baugruppe ist reine Anzeige und schreibt nichts',
  $('ks-pos').hidden === true && JSON.stringify(slots()) === JSON.stringify(vorKlapp));
setAkt('set-oeffnen', setC.id);
ok('[P-21] die aufgeklappte Baugruppe zeigt den Positionsbereich',
  $('ks-pos').hidden === false);
$('ks-art').value = 'produkt'; $('ks-art').dispatch('change');
$('ks-ref').value = 'rod-c'; $('ks-menge').value = '2';
$('ks-pos-add').dispatch('click');
ok('[P-21] Position mit Produkt und ganzer Menge hinzugefuegt',
  KAT.normSets(gewaehlt().sets)[0].positionen.length === 1
  && KAT.normSets(gewaehlt().sets)[0].positionen[0].menge === 2);
$('ks-art').value = 'rolle'; $('ks-art').dispatch('change');
$('ks-ref').value = 'latte'; $('ks-menge').value = '0';
$('ks-pos-add').dispatch('click');
ok('[P-21] Menge 0 wird benannt abgewiesen, die Baugruppe bleibt unveraendert',
  kFehler() && /Nicht gespeichert/.test(kMsgTxt())
  && KAT.normSets(gewaehlt().sets)[0].positionen.length === 1);
confirmAntwort = true;
setAkt('set-loeschen', setC.id);
ok('[P-21] Baugruppe geloescht, die Produkte bleiben im Katalog',
  KAT.normSets(gewaehlt().sets).length === 0 && kAnzahl() === 1
  && /Baugruppe gelöscht/.test(kMsgTxt()));

// =====================================================================
//  8) Separater Katalog-Export (eigene Datei, nicht im Projekt-ZIP)
// =====================================================================
$('k-export').dispatch('click');
const expDatei = JSON.parse(letzterDownload);
ok('Export erzeugt eine eigene JSON-Datei mit Katalogformat v2',
  expDatei.format === 'SEMBLA-Bauteilkatalog' && expDatei.version === KAT.KATALOG_VERSION
  && expDatei.produkte.length === 1 && /Katalog exportiert/.test(kMsgTxt()));
ok('[#108] exportiert wird der GEWAEHLTE Katalog, nicht der zugeordnete',
  expDatei.name === 'Katalog C — umbenannt' && !!KAT.produkt(expDatei, 'rod-c'));
ok('Export enthaelt kein Projekt/Wandelement (Ressourcentrennung)',
  !('wandelement' in expDatei) && !('projekt' in expDatei) && !('katalog' in expDatei));
ok('Katalog-Dateiname ist klar unterscheidbar',
  /^SEMBLA_Bauteilkatalog_/.test(letzterAnker.download) && /\.json$/.test(letzterAnker.download));

// =====================================================================
//  9) Separater Katalog-Import — eigener Slot, keine Zuordnungsaenderung
// =====================================================================
const importDatei = JSON.stringify({
  format: 'SEMBLA-Bauteilkatalog', version: 1, name: 'Katalog Zweitlieferant',
  produkte: [{ id:'plat-z', kategorie:'beplankung', bezeichnung:'Platte Z',
               einheit:'m2', preis:18, breite_mm:1250, hoehe_mm:2500, dicke_mm:12 }],
});
const vorImport = slots();
await $('k-import').dispatch('change', { target: { files:[kFile(importDatei, 'fremd.json')], value:'x' } });
ok('Import legt einen eigenen Katalog an und waehlt ihn zur Bearbeitung',
  gewaehlt()?.name === 'Katalog Zweitlieferant' && kAnzahl() === 1 && !!kProd('plat-z')
  && $('k-name').value === 'Katalog Zweitlieferant');
ok('[P-22] eine v1-Datei wird verlustfrei nach v2 uebernommen (leere Baugruppenliste)',
  gewaehlt().version === KAT.KATALOG_VERSION && KAT.normSets(gewaehlt().sets).length === 0);
ok('[#108] der Import aendert die Zuordnung NICHT und sagt das',
  store.holeMappe().katalog === katA.id
  && vorImport.projekte === localStorage.getItem(SLOT_PRJ)
  && vorImport.aktivKat === localStorage.getItem(SLOT_AKT)
  && /nicht zugeordnet/.test(kMsgTxt()));
ok('[P-13]/[P-18] aus einem nicht zugeordneten Katalog wird NICHT vorbelegt',
  /keine .*Verwendungsstelle vorbelegt/.test(kMsgTxt()));
ok('die bisherigen Kataloge bleiben unberuehrt',
  store.listeKataloge().length === 4 && !!store.katalogNachId(katA.id));

// Formatverwechslung: eine Projektdatei im Katalogimport wird benannt abgewiesen
const projektDatei = JSON.stringify({ format:'SEMBLA-Projekt', version:2, name:'Wand',
  wandelement:{}, eingaben:{} });
const vorFremd = slots();
await $('k-import').dispatch('change', { target: { files:[kFile(projektDatei, 'projekt.json')], value:'x' } });
ok('Projektdatei im Katalogimport -> klare Meldung, Kataloge byte-gleich',
  kFehler() && /Import fehlgeschlagen/.test(kMsgTxt())
  && JSON.stringify(slots()) === JSON.stringify(vorFremd));

// =====================================================================
// 10) Standardkatalog-Vorlage (#102): laden, Kopierschutz, keine Zuordnung
// =====================================================================
const vorVorlage = slots();
await $('k-vorlage').dispatch('click');
const vorlage = gewaehlt();
ok('Standardkatalog aus der Repo-Vorlage geladen und zur Bearbeitung gewaehlt',
  !!vorlage && vorlage.id === store.vorlagenKatalogId() && KAT.istVorlagenKatalog(vorlage)
  && vorlage.produkte.length > 0 && /Standardkatalog geladen/.test(kMsgTxt()));
ok('geladen wird der kanonische Repo-Pfad aus sembla-katalog.js',
  fetchPfade[fetchPfade.length - 1] === KAT.VORLAGE_KATALOG_PFAD);
ok('[#108] die Vorlage wird NICHT zugeordnet',
  store.holeMappe().katalog === katA.id
  && vorVorlage.projekte === localStorage.getItem(SLOT_PRJ)
  && vorVorlage.aktivKat === localStorage.getItem(SLOT_AKT));
ok('der Blattzustand weist die Vorlage als unveraenderlich aus',
  /Unveränderliche Repo-Vorlage/.test($('k-status').innerHTML));

// Erste Bearbeitung der Vorlage: Kopie mit neuer Kennung, Vorlage byte-gleich (#102)
const vorlageBytes = JSON.stringify(store.katalogNachId(vorlage.id));
const einProdukt = vorlage.produkte[0];
zeilenAkt('bearbeiten', einProdukt.id);
$('kp-preis').value = '99.99';
$('kp-speichern').dispatch('click');
const kopie = gewaehlt();
ok('[#102] die erste Bearbeitung der Vorlage legt eine eigene Kopie mit NEUER Kennung an',
  !!kopie && kopie.id !== vorlage.id && !KAT.istVorlagenKatalog(kopie)
  && KAT.produkt(kopie, einProdukt.id).preis === 99.99);
ok('[#102] die Vorlagenressource selbst bleibt BYTE-GLEICH',
  JSON.stringify(store.katalogNachId(vorlage.id)) === vorlageBytes);
ok('[#102] die entstandene Kopie wird benannt (vorhandener Wortlaut)',
  /unveränderliche Vorlage/.test(kMsgTxt()) && /automatisch angelegten Kopie/.test(kMsgTxt()));
ok('[#108] die Kopie wird NICHT zugeordnet, weil die Vorlage nicht zugeordnet war',
  store.holeMappe().katalog === katA.id
  && /Zuordnung des aktiven Projekts bleibt unverändert/.test(kMsgTxt()));

// Gegenprobe: ist die Vorlage der ZUGEORDNETE Katalog, zieht die Kopie die Zuordnung mit
store.setzeProjektKatalog(vorlage.id);
$('k-wahl').value = vorlage.id; $('k-wahl').dispatch('change');
ok('Gegenprobe-Ausgangslage: die Vorlage ist der zugeordnete Katalog',
  $('k-wahl').value === vorlage.id && store.holeMappe().katalog === vorlage.id
  && /Dem aktiven Projekt zugeordnet/.test($('k-status').innerHTML));
zeilenAkt('bearbeiten', einProdukt.id);
$('kp-preis').value = '1.11';
$('kp-speichern').dispatch('click');
const kopie2 = gewaehlt();
ok('[#102]/[#108] Kopie der zugeordneten Vorlage wird dem aktiven Projekt zugeordnet',
  !!kopie2 && kopie2.id !== vorlage.id && store.holeMappe().katalog === kopie2.id
  && /dem aktiven Projekt zugeordnet/.test(kMsgTxt()));
ok('[#102] die Vorlage bleibt auch dabei byte-gleich',
  JSON.stringify(store.katalogNachId(vorlage.id)) === vorlageBytes);

// =====================================================================
// 11) Katalog loeschen (Pflege, #108 Gate 3)
// =====================================================================
$('k-wahl').value = katB.id; $('k-wahl').dispatch('change');
confirmAntwort = false;
const vorKatLoesch = slots();
$('k-entfernen').dispatch('click');
ok('abgelehnte Sicherheitsabfrage loescht keinen Katalog',
  !!store.katalogNachId(katB.id) && JSON.stringify(slots()) === JSON.stringify(vorKatLoesch));
confirmAntwort = true;
$('k-entfernen').dispatch('click');
ok('bestaetigtes Loeschen entfernt genau diesen Katalog',
  !store.katalogNachId(katB.id) && !!store.katalogNachId(katA.id) && !!store.katalogNachId(katC.id));
ok('[L-12] die Zuordnung eines FREMDEN Katalogs bleibt unberuehrt',
  store.holeMappe().katalog === kopie2.id);
ok('Loeschen wird benannt, Produktreferenzen bleiben stehen',
  /Katalog gelöscht/.test(kMsgTxt()) && /Produktreferenzen bleiben stehen/.test(kMsgTxt()));

// Den ZUGEORDNETEN Katalog loeschen: die Referenz faellt zwangslaeufig mit
$('k-wahl').value = kopie2.id; $('k-wahl').dispatch('change');
$('k-entfernen').dispatch('click');
ok('[L-12] Loeschen des zugeordneten Katalogs hebt die Referenz auf und sagt das',
  !store.katalogNachId(kopie2.id) && store.holeMappe().katalog === null
  && /Zuordnung des aktiven Projekts ist damit aufgehoben/.test(kMsgTxt()));
ok('die Abfrage hat vorher auf genau diese Folge hingewiesen',
  /verliert dabei seine Katalogzuordnung/.test(confirmTexte[confirmTexte.length - 1]));

// =====================================================================
// 12) Die Seite ist Modul 10 und pflegt nichts am Wandelement
// =====================================================================
ok('die Seite meldet sich als Modul 10 an der gemeinsamen Kopfleiste',
  /mountNavbar\(10\)/.test(html) && /window\.__katInit\(\)/.test(html));
ok('Modul 10 haelt keine wand-/projektbezogene Produktauswahl ([P-13])',
  !/setzeProduktrolle/.test(src) && !/pp-katalog/.test(html));
ok('Modul 10 hat keinen Zuordnungs-Schreibweg ([L-12] bleibt Modul 0)',
  !/setzeProjektKatalog/.test(src) && !/setzeKatalogRef/.test(src));
ok('geschrieben wird ausschliesslich ueber den EINEN Weg `store.setzeKatalog`',
  (src.match(/store\.setzeKatalog\(/g) || []).length === 2       // kSchreibe + „Neuer Katalog“
  && /zuordnen: kZuordnen\(kat\)/.test(src));
ok('kein Wandelement und keine `eingaben` werden hier geschrieben',
  !/mergeEingaben/.test(src) && !/speichereAktiv/.test(src));

// =====================================================================
// 13) #102 Kopierschutz der Vorlage im MEHRPROJEKTFALL
// =====================================================================
// Uebernommen aus dem abgeloesten Modul-0-Abschnitt 8n: der Nutzerpfad ist derselbe, nur
// der Ort hat sich geaendert. Was #108 dabei aendert: Laden und Bearbeiten ordnen hier
// NICHTS zu — die Zuordnung setzt Modul 0 ([L-12]). Die Kopie zieht die Zuordnung deshalb
// genau dann mit, wenn die Vorlage der zugeordnete Katalog des aktiven Projekts war.
{
  const dateiKat = JSON.parse(vorlageDatei(V_KAT));
  const vId = store.vorlagenKatalogId();

  // Ausgangslage: zwei frische Projekte, dazu ein bewusst eigener Katalog.
  const p102A = store.fuegeProjektHinzu('Kopierschutz A');
  const p102B = store.fuegeProjektHinzu('Kopierschutz B');
  const eigen102 = store.setzeKatalog(KAT.leererKatalog('Eigener Katalog #102'),
                                      { zuordnen: false });
  const eigenStand = JSON.stringify(kataloge()[eigen102.id]);

  // (a) Laden: kanonische Kennung, sichtbar als unveraenderliche Vorlage
  store.setzeAktivesProjekt(p102A.projekt.id);
  await $('k-vorlage').dispatch('click');
  ok('#102 der Knopf laedt die Repo-Vorlage unter der kanonischen Kennung',
    !kFehler() && kat().id === vId && KAT.istVorlagenKatalog(kat())
    && kAnzahl() === V_KAT_ANZ && kat().name === dateiKat.name);
  ok('#102 die Vorlage wird aus der ECHTEN Repo-Datei gelesen',
    fetchPfade[fetchPfade.length - 1] === KAT.VORLAGE_KATALOG_PFAD);
  ok('#102 der Blattzustand weist sie sichtbar als unveraenderliche Vorlage aus',
    /Unveränderliche Repo-Vorlage/.test($('k-status').innerHTML)
    && !/Bearbeitbarer Katalog/.test($('k-status').innerHTML));
  ok('#102 die Erfolgsmeldung kuendigt die automatische Kopie an',
    /unveränderliche Vorlage/.test(kMsgTxt()) && /eigene\s+Kopie/.test(kMsgTxt()));
  ok('#108 das Laden hat KEINE Zuordnung gesetzt',
    store.projektMappe(p102A.projekt.id).katalog === null
    && store.projektMappe(p102B.projekt.id).katalog === null);
  ok('#102 der eigene Katalog bleibt beim Laden unangetastet',
    JSON.stringify(kataloge()[eigen102.id]) === eigenStand);

  // (b) BEIDE Projekte haengen an DERSELBEN Vorlagenressource — der Mehrprojektfall.
  // Zugeordnet wird in Modul 0 ([L-12]); hier laeuft dafuer dessen Schreibweg.
  store.setzeProjektKatalog(vId);
  store.setzeAktivesProjekt(p102B.projekt.id);
  store.setzeProjektKatalog(vId);
  store.setzeAktivesProjekt(p102A.projekt.id);
  waehle(vId);
  ok('#102 beide Projekte sind derselben Vorlagenressource zugeordnet',
    store.projektMappe(p102A.projekt.id).katalog === vId
    && store.projektMappe(p102B.projekt.id).katalog === vId);

  // (c) Produkt bearbeiten in Projekt A -> Kopie mit NEUER Kennung, nur A zieht um
  const vorlageStand = JSON.stringify(kataloge()[vId]);
  const anzahlVor102 = Object.keys(kataloge()).length;
  kZeile('bearbeiten', 'stein-i3-375');
  $('kp-preis').value = '11.11';
  kpSpeichern();
  const kopie102 = kat();
  ok('#102 die Produktaenderung landet auf einer Kopie mit neuer Kennung',
    kopie102.id !== vId && KAT.produkt(kopie102, 'stein-i3-375').preis === 11.11
    && Object.keys(kataloge()).length === anzahlVor102 + 1);
  ok('#102 die Erfolgsmeldung nennt die automatisch angelegte Kopie',
    !kFehler() && /automatisch angelegten Kopie/.test(kMsgTxt()) && /Vorlage/.test(kMsgTxt()));
  ok('#102 die Kopie ist selbst keine Vorlage mehr',
    !KAT.istVorlagenKatalog(kataloge()[kopie102.id])
    && /Bearbeitbarer Katalog/.test($('k-status').innerHTML));
  ok('#102 die Vorlage bleibt byte-unveraendert',
    JSON.stringify(kataloge()[vId]) === vorlageStand
    && KAT.produkt(kataloge()[vId], 'stein-i3-375').preis === 9.5);
  ok('#102/#108 nur das aktive Projekt zieht um — Projekt B bleibt an der Vorlage',
    store.projektMappe(p102A.projekt.id).katalog === kopie102.id
    && store.projektMappe(p102B.projekt.id).katalog === vId);
  ok('#102 der eigene Katalog wurde dabei nicht angefasst',
    JSON.stringify(kataloge()[eigen102.id]) === eigenStand);

  // (d) Der Kopierschutz greift GENAU EINMAL — die zweite Aenderung bleibt auf der Kopie
  kZeile('bearbeiten', 'stein-i2-250');
  $('kp-preis').value = '8.88';
  kpSpeichern();
  ok('#102 die zweite Aenderung kopiert NICHT erneut',
    kat().id === kopie102.id && KAT.produkt(kat(), 'stein-i2-250').preis === 8.88
    && Object.keys(kataloge()).length === anzahlVor102 + 1
    && !/automatisch angelegten Kopie/.test(kMsgTxt()));

  // (e) Auch der KATALOGNAME ist ein geschuetzter Schreibweg
  store.setzeAktivesProjekt(p102B.projekt.id);
  waehle(vId);
  ok('#102 Projekt B arbeitet weiter mit der unveraenderten Vorlage',
    kat().id === vId && KAT.produkt(kat(), 'stein-i3-375').preis === 9.5
    && store.holeKatalog().id === vId);
  const anzahlVorName = Object.keys(kataloge()).length;
  $('k-name').value = 'Umbenannt in B';
  $('k-name').dispatch('input');
  const kopieB = kat();
  ok('#102 auch die Namensaenderung erzeugt zuerst eine Kopie',
    kopieB.id !== vId && kopieB.name === 'Umbenannt in B'
    && Object.keys(kataloge()).length === anzahlVorName + 1
    && kataloge()[vId].name === dateiKat.name);
  ok('#102 die Namensaenderung meldet die Kopie sichtbar',
    !kFehler() && /automatisch angelegten Kopie/.test(kMsgTxt()));
  ok('#102/#108 nur Projekt B zieht um — Projekt A bleibt auf seiner eigenen Kopie',
    store.projektMappe(p102B.projekt.id).katalog === kopieB.id
    && store.projektMappe(p102A.projekt.id).katalog === kopie102.id);
  // Weitertippen darf KEINE zweite Kopie erzeugen
  $('k-name').value = 'Umbenannt in B2';
  $('k-name').dispatch('input');
  ok('#102 Weitertippen schreibt dieselbe Kopie fort, statt erneut zu kopieren',
    kat().id === kopieB.id && kat().name === 'Umbenannt in B2'
    && Object.keys(kataloge()).length === anzahlVorName + 1);

  // (f) Produkt LOESCHEN ist ebenfalls geschuetzt
  store.setzeAktivesProjekt(p102A.projekt.id);
  store.setzeProjektKatalog(vId);
  waehle(vId);
  const anzahlVorLoesch = Object.keys(kataloge()).length;
  confirmAntwort = true;
  kZeile('produkt-loeschen', 'stein-i2-250');
  ok('#102 auch das Loeschen eines Produkts kopiert zuerst',
    kat().id !== vId && !KAT.produkt(kat(), 'stein-i2-250')
    && !!KAT.produkt(kataloge()[vId], 'stein-i2-250')
    && Object.keys(kataloge()).length === anzahlVorLoesch + 1
    && /automatisch angelegten Kopie/.test(kMsgTxt()));
  const loeschKopie = kat().id;
  confirmAntwort = false;

  // (g) Erneutes Laden stellt den unveraenderten Repo-Stand her — Kopien bleiben
  const kopieStand = JSON.stringify(kataloge()[kopie102.id]);
  const anzahlVorReload = Object.keys(kataloge()).length;
  await $('k-vorlage').dispatch('click');
  ok('#102 erneutes Laden liefert wieder den unveraenderten Repo-Inhalt',
    !kFehler() && kat().id === vId && kAnzahl() === V_KAT_ANZ
    && kat().name === dateiKat.name
    && KAT.produkt(kat(), 'stein-i3-375').preis === 9.5
    && !!KAT.produkt(kat(), 'stein-i2-250'));
  ok('#102 dabei entsteht KEIN Duplikat — nur der Vorlagen-Slot wird ersetzt',
    Object.keys(kataloge()).length === anzahlVorReload);
  ok('#102 bestehende Kopien und eigene Kataloge ueberleben das Laden unveraendert',
    JSON.stringify(kataloge()[kopie102.id]) === kopieStand
    && kataloge()[kopieB.id].name === 'Umbenannt in B2'
    && !KAT.produkt(kataloge()[loeschKopie], 'stein-i2-250')
    && JSON.stringify(kataloge()[eigen102.id]) === eigenStand);
  ok('#102 der Inhalt der Vorlagenressource ist der Inhalt der Repo-Datei',
    JSON.stringify(KAT.katalogObjekt(kataloge()[vId]))
      === JSON.stringify(KAT.katalogObjekt(KAT.parseKatalog(vorlageDatei(V_KAT)))));

  // (h) Kein Namensvergleich mehr: ein gleichnamiger eigener Katalog wird nie gekapert
  const doppelt = store.setzeKatalog({ ...KAT.leererKatalog(dateiKat.name),
    produkte: [{ id:'x-1', kategorie:'verbinder', bezeichnung:'X', einheit:'Stk', preis:1 }] },
    { zuordnen: false });
  ok('#102 ein gleichnamiger eigener Katalog ist keine Vorlage',
    doppelt.id !== vId && !KAT.istVorlagenKatalog(kataloge()[doppelt.id]));
  const doppeltStand = JSON.stringify(kataloge()[doppelt.id]);
  await $('k-vorlage').dispatch('click');
  ok('#102 das Laden fasst ihn nicht an',
    JSON.stringify(kataloge()[doppelt.id]) === doppeltStand && kAnzahl() === V_KAT_ANZ);
  const doppeltNeu = store.setzeKatalog({ ...kataloge()[doppelt.id], name: 'Doch eigen' },
                                        { zuordnen: false });
  ok('#102 ein eigener Katalog wird nie automatisch kopiert oder umbenannt',
    doppeltNeu.id === doppelt.id && !doppeltNeu.kopie_von);

  // (i) Kein neues oeffentliches Feld, kein Versionssprung
  ok('#102 Kennung und Vorlagenmarker bleiben Browserzustand',
    !localStorage.getItem(SLOT_PRJ).includes('"' + KAT.VORLAGE_FELD + '"')
    && !(KAT.VORLAGE_FELD in KAT.katalogObjekt(kataloge()[vId])));
  ok('#108 keine Formatachse bewegt sich',
    KAT.KATALOG_VERSION === 2 && store.PROJEKT_VERSION === 2 && store.SCHEMA_VERSION === 6
    && MAPPE.MAPPE_VERSION === 2);

  // (j) Nicht erreichbare Vorlage: sichtbarer Fehler, kein Schreiben
  const echtesFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok:false, status:404, text: async () => '' });
  const slotVor404 = kSlot();
  await $('k-vorlage').dispatch('click');
  ok('fehlende Katalogvorlage -> Fehlermeldung, Kataloge byte-gleich',
    kFehler() && /Standardkatalog nicht geladen/.test(kMsgTxt()) && /HTTP 404/.test(kMsgTxt())
    && kSlot() === slotVor404);
  globalThis.fetch = echtesFetch;
  waehle(vId);
}

// =====================================================================
// 14) Der Produktdialog ([P-16]) und die Baugruppen (#94) an der Vorlage
// =====================================================================
// Ebenfalls uebernommen aus dem abgeloesten Modul-0-Abschnitt (7d2/7d2b/7d3): geprueft wird
// der reale Nutzerpfad am ECHTEN Dialog, jetzt in Modul 10. Der bearbeitete Katalog ist die
// Vorlage; der Kopierschutz (#102) verschiebt die Bearbeitung erwartungsgemaess auf eine
// Kopie, und `kat()` folgt der Auswahl dieser Seite.
{
  await $('k-vorlage').dispatch('click');

  // 14a) Katalog-v1-Kompatibilitaet der Maske ([P-16]): jedes Produkt der Vorlage laesst
  // sich im Dialog oeffnen und unveraendert wieder speichern — kein Feld faellt weg,
  // Zusatzfelder (hinweis nach [P-12]) bleiben erhalten.
  /** Produkt schluesselunabhaengig vergleichen (die Reihenfolge darf sich aendern). */
  const kanon = (p) => JSON.stringify(Object.keys(p).sort().map(k => [k, p[k]]));
  const vorher = kanon(KAT.produkt(kat(), 'latte-40-60-1500'));
  kZeile('bearbeiten', 'latte-40-60-1500');
  ok('Vorlagenprodukt oeffnet mit gefuellter Lattenmaske',
    kpFelderListe().join() === 'breite_mm,dicke_mm,laenge_mm' && $('kp-f-laenge_mm').value === '1500'
    && $('kp-f-breite_mm').value === '40' && $('kp-f-dicke_mm').value === '60');
  ok('Zusatzfeld „hinweis" wird als erhalten benannt, nicht als fachfremd',
    $('kp-extra').hidden === false && /erhalten/.test($('kp-extra').innerHTML)
    && /hinweis/.test($('kp-extra').innerHTML) && !/fachfremd/.test($('kp-extra').innerHTML));
  kpSpeichern();
  ok('unveraendertes Speichern laesst das v1-Produkt inhaltlich identisch',
    kanon(KAT.produkt(kat(), 'latte-40-60-1500')) === vorher && kAnzahl() === V_KAT_ANZ);
  ok('alle Vorlagenprodukte bleiben gegen den echten Validator fehlerfrei',
    kat().produkte.every(p => KAT.validiereProdukt(p, { ids: [] }).length === 0));
  ok('jedes Pflichtfeld einer Kategorie ist in ihrer Maske pflegbar (eine Pflichtquelle)',
    KAT.KATEGORIEN.every(k => (k.pflicht || []).every(f => KAT.maskeFelder(k.id).includes(f))));
  ok('kein Vorlagenprodukt traegt ein fuer seine Kategorie fachfremdes Maßfeld',
    kat().produkte.every(p => KAT.MASSFELDER.every(f =>
      p[f] === undefined || KAT.maskeFelder(p.kategorie).includes(f))));
  ok('Katalog-Formatversion ist 2 (kein Bruch durch [P-16])',
    KAT.KATALOG_VERSION === 2 && KAT.katalogObjekt(kat()).version === 2
    && KAT.parseKatalog(JSON.stringify(KAT.katalogObjekt(kat()))).produkte.length === V_KAT_ANZ);

  // 14b) Maskenpruefung je Kategorie am echten Dialog ([P-16], #92)
  $('k-produkt-neu').dispatch('click');
  kpKategorie('gewindestange');
  ok('Gewindestange: Maske ist Gewinde/Güte/Stangenlänge — keine Breite/Höhe/Dicke',
    kpFelderListe().join() === 'gewinde,guete,laenge_mm');
  ok('Gewindestange: fachliche Beschriftung, Einheit und Pflichtkennzeichen',
    /<label for="kp-f-gewinde">Gewinde <span class="muted">· Pflicht<\/span><\/label>/.test(kpMarkup())
    && /Stangenlänge \(mm\) <span class="muted">· Pflicht<\/span>/.test(kpMarkup())
    && /placeholder="M10"/.test(kpMarkup()) && />Güte</.test(kpMarkup()));
  kpKategorie('latte');
  ok('Latte: Maske ist Querschnitt + Standardlänge — keine Höhe',
    kpFelderListe().join() === 'breite_mm,dicke_mm,laenge_mm'
    && /Querschnitt Breite \(mm\)/.test(kpMarkup()) && /Standardlänge \(mm\)/.test(kpMarkup())
    && !/kp-f-hoehe_mm/.test(kpMarkup()) && !/kp-f-gewinde/.test(kpMarkup()));
  kpKategorie('beplankung');
  ok('Beplankung: Plattenmaße ohne Gewinde- und Längenfeld',
    kpFelderListe().join() === 'breite_mm,hoehe_mm,dicke_mm'
    && /Plattenbreite \(mm\)/.test(kpMarkup()) && !/kp-f-laenge_mm/.test(kpMarkup()));
  kpKategorie('stein');
  ok('Stein: Maße optional, Steinbreite als Preiszuordnungsmaß benannt',
    kpFelderListe().join() === 'breite_mm,hoehe_mm,dicke_mm'
    && /maßgebend für die Preiszuordnung der Steinpositionen/.test(kpMarkup())
    && !/Pflicht/.test(kpMarkup()));
  kpKategorie('verbinder');
  ok('Verbinder: keine fachfremden Maßfelder',
    kpFelderListe().length === 0 && $('kp-leer').hidden === false);
  kpKategorie('verbrauch');
  // Seit dem 2026-09-08 fuehrt Verbrauchsmaterial zwei Masse: Einbauhoehe und Bauteillaenge
  // (Schaftlaenge einer Schraube). Beide sind optional und KEIN Diskriminator ([P-14]).
  ok('Verbrauchsmaterial: Einbauhöhe und Bauteillänge, keine weiteren Maßfelder',
    kpFelderListe().join() === 'hoehe_mm,laenge_mm'
    && !/kp-f-gewinde/.test(kpMarkup()) && !/kp-f-guete/.test(kpMarkup()));
  const slotVorKatWechsel = kSlot();
  kpAbbrechen();
  ok('Abbruch nach Kategoriewechseln legt nichts an',
    kAnzahl() === V_KAT_ANZ && !kpOffen() && kSlot() === slotVorKatWechsel);

  // 14c) Einbauhoehe eines Kleinteils am ECHTEN Dialog (Issue #92)
  kZeile('bearbeiten', 'verbrauch-kopplungsmutter');
  ok('[#92] der Dialog rendert fuer Verbrauchsmaterial die Maßfelder aus der Maske',
    kpFelderListe().join() === KAT.maskeFelder('verbrauch').join()
    && kpFelderListe().join() === 'hoehe_mm,laenge_mm'
    && $('kp-f-hoehe_mm') != null && $('kp-f-laenge_mm') != null);
  ok('[#92] das Feld ist als Einbauhöhe in Millimetern beschriftet',
    /Einbauhöhe/.test(kpMarkup()) && /\(mm\)/.test(kpMarkup()));
  ok('[#92] die Einbauhöhe ist nicht als Pflicht ausgezeichnet',
    !/Pflicht/.test(kpMarkup()) && KAT.maskeVonKategorie('verbrauch')[0].pflicht === false);
  // Die Einbauhoehe der Kopplungsmutter ist seit jeher mit 30 mm festgelegt und steht jetzt
  // auch im Katalog. Sie ist damit KEIN erfundenes Mass mehr, sondern ein gepflegtes —
  // Modul 1 leitet daraus den Fussoffset nach [A-19] ab (halbe Hoehe = 15 mm).
  ok('[#92] die Vorlage fuehrt die festgelegte Einbauhoehe der Kopplungsmutter',
    $('kp-f-hoehe_mm').value === '30'
    && KAT.produkt(kat(), 'verbrauch-kopplungsmutter').hoehe_mm === 30);
  ok('[#92] die Höhe wird nicht mehr als fachfremdes Feld angekuendigt',
    !/fachfremd/.test($('kp-extra').innerHTML));
  kpSetze({ bez: 'Kopplungsmutter M10 (Stangenstoß und Fuß)', id: 'verbrauch-kopplungsmutter',
            preis: '0.65', einheit: 'Stk', hoehe_mm: '17.5' });
  kpSpeichern();
  ok('[#92] gespeichert ohne Fehlermeldung, kein neues Produkt entstanden',
    !kpOffen() && !kFehler() && kAnzahl() === V_KAT_ANZ);
  ok('[#92] die Einbauhöhe steht am Produkt und ueberlebt die Persistenz',
    KAT.produkt(kat(), 'verbrauch-kopplungsmutter').hoehe_mm === 17.5
    && Object.values(kataloge()).find(k => k.id === kat().id)
         .produkte.find(p => p.id === 'verbrauch-kopplungsmutter').hoehe_mm === 17.5);
  ok('[#92] Rollenangabe und Hinweis des Produkts bleiben unberuehrt',
    KAT.produkt(kat(), 'verbrauch-kopplungsmutter').rollen.join() === 'kupplung'
    && /Bauteilgleich/.test(KAT.produkt(kat(), 'verbrauch-kopplungsmutter').hinweis || ''));
  ok('[#92] die Einbauhöhe uebersteht Export und Import der Katalogdatei',
    KAT.produkt(KAT.parseKatalog(JSON.stringify(KAT.katalogObjekt(kat()))),
                'verbrauch-kopplungsmutter').hoehe_mm === 17.5);
  ok('[#92] ein anderes Verbrauchsmaterial bleibt ohne Einbauhöhe gueltig',
    kat().produkte.filter(p => p.kategorie === 'verbrauch' && p.hoehe_mm === undefined).length >= 1
    && kat().produkte.every(p => KAT.validiereProdukt(p, { ids: [] }).length === 0));
  // Unzulaessiger Wert: benannt abgewiesen, NICHT gerundet und nicht still verworfen ([P-9]).
  kZeile('bearbeiten', 'verbrauch-kopplungsmutter');
  kpSetze({ bez: 'Kopplungsmutter M10 (Stangenstoß und Fuß)', id: 'verbrauch-kopplungsmutter',
            preis: '0.65', einheit: 'Stk', hoehe_mm: '0' });
  kpSpeichern();
  ok('[#92] Einbauhöhe 0 wird im Dialog benannt abgewiesen, der Katalog bleibt unveraendert',
    kpOffen() && kpFehler() && /hoehe_mm/.test($('kp-msg').textContent)
    && KAT.produkt(kat(), 'verbrauch-kopplungsmutter').hoehe_mm === 17.5);
  kpAbbrechen();

  // 14d) Baugruppen/Sets ([P-21]/[P-22], #94) am ECHTEN Set-Editor
  // Die Vorlage bringt seit [P-23] die Baugruppe „Wandabschluss" mit; der Dialogtest legt
  // daneben eine EIGENE an und laesst die Vorlagenbaugruppe unberuehrt.
  ok('#94 der Katalog fuehrt genau die Baugruppen der Vorlage ([P-23], [P-24])',
    sets().length === 2 && sFind('set-wandabschluss')?.name === 'Wandabschluss'
    && sFind('set-deckenanschluss')?.name === 'Deckenanschluss');

  $('ks-name').value = 'Probe';
  $('ks-neu').dispatch('click');
  ok('#94 Set angelegt und gemeldet',
    sets().length === 3 && sFind('set-probe')?.name === 'Probe'
    && /Baugruppe angelegt/.test(kMsgTxt()) && !kFehler());
  ok('#94 die neue Baugruppe steht in der Tabelle',
    /data-set="set-probe"/.test($('ks-tbody').innerHTML)
    && /Probe/.test($('ks-tbody').innerHTML) && $('ks-leer').hidden === true);
  // Zwei Positionen seit der Fachauskunft 2026-09-08 (Spannplatte, Spannmutter) — die
  // Unterlegscheibe aus #92 ist entfallen.
  ok('#94 die Baugruppen der Vorlage bleiben dabei unberuehrt',
    sFind('set-wandabschluss').positionen.length === 2
    && sFind('set-deckenanschluss').positionen.length === 9);
  $('ks-name').value = '';
  $('ks-neu').dispatch('click');
  ok('#94 ein Set ohne Namen wird benannt abgewiesen',
    sets().length === 3 && kFehler() && /Namen/.test(kMsgTxt()));

  sPos('produkt', 'gewindestange-m10-1000', 2);
  ok('#94 Produktposition hinzugefuegt',
    sFind('set-probe').positionen.length === 1
    && sFind('set-probe').positionen[0].produkt === 'gewindestange-m10-1000'
    && sFind('set-probe').positionen[0].menge === 2 && !kFehler());
  sPos('rolle', 'kupplung', 4);
  ok('#94 Rollenposition hinzugefuegt — beide Positionsformen im selben Set',
    sFind('set-probe').positionen.length === 2
    && sFind('set-probe').positionen[1].rolle === 'kupplung'
    && sFind('set-probe').positionen[1].menge === 4);
  ok('#94 die Positionen stehen mit Art und Menge in der Oberflaeche',
    /2 × /.test($('ks-tbody').innerHTML) && /Kopplungsmutter/.test($('ks-tbody').innerHTML)
    && /Verwendungsrolle/.test($('ks-tbody').innerHTML));

  const vorFehler94 = kSlot();
  sPos('produkt', 'gewindestange-m10-1000', 0);
  ok('#94 Menge 0 wird sichtbar abgewiesen und speichert nichts',
    kFehler() && /mindestens 1/.test(kMsgTxt()) && kSlot() === vorFehler94
    && sFind('set-probe').positionen.length === 2);

  $('ks-name').value = 'Probe oben';
  sZeile('set-umbenennen', 'set-probe');
  ok('#94 Set umbenannt, Kennung unveraendert',
    sFind('set-probe')?.name === 'Probe oben' && /umbenannt/.test(kMsgTxt()) && !kFehler());

  sZeile('pos-bearbeiten', 'set-probe', 0);
  ok('#94 Bearbeiten laedt die Position in die Felder',
    $('ks-art').value === 'produkt' && $('ks-ref').value === 'gewindestange-m10-1000'
    && $('ks-menge').value === '2' && $('ks-pos-add').textContent === 'Position übernehmen');
  $('ks-menge').value = '5';
  $('ks-pos-add').dispatch('click');
  ok('#94 geaenderte Menge uebernommen — keine zusaetzliche Position',
    sFind('set-probe').positionen.length === 2
    && sFind('set-probe').positionen[0].menge === 5
    && $('ks-pos-add').textContent === 'Position hinzufügen');
  sZeile('pos-loeschen', 'set-probe', 1);
  ok('#94 Position entfernt — nur diese eine',
    sFind('set-probe').positionen.length === 1
    && sFind('set-probe').positionen[0].produkt === 'gewindestange-m10-1000');
  sPos('rolle', 'kupplung', 4);          // wieder herstellen fuer den Roundtrip

  // DIE Whitelist-Probe: eine ganz normale Produktaenderung darf die Baugruppe nicht
  // verschlucken (`katalogObjekt` normalisiert JEDEN Schreibvorgang).
  kZeile('bearbeiten', 'latte-40-60-1500');
  kpSpeichern();
  ok('#94 Set ueberlebt eine Produktbearbeitung (katalogObjekt fuehrt sets)',
    sets().length === 3 && sFind('set-probe').positionen.length === 2
    && kAnzahl() === V_KAT_ANZ);

  // Export ueber den echten Knopf -> Import ueber das echte Dateifeld
  $('k-export').dispatch('click');
  const dateiText = letzterDownload;              // genau die Bytes des echten Downloads
  const dateiObj = JSON.parse(dateiText);
  ok('#94 die Exportdatei traegt Katalogformat v2 und die Baugruppen',
    dateiObj.version === 2 && dateiObj.sets.length === 3
    && dateiObj.sets[2].positionen.length === 2 && /Katalog exportiert/.test(kMsgTxt()));
  const vorImport94 = JSON.stringify(sets());
  await $('k-import').dispatch('change', { target: { files: [kFile(dateiText, 'sets.json')], value: 'x' } });
  ok('#94 Import: dieselben Set-Definitionen, verlustfrei',
    JSON.stringify(sets()) === vorImport94 && kAnzahl() === V_KAT_ANZ && !kFehler());
  ok('#94 der Roundtrip laesst Kennung, Name, Art, Reihenfolge und Menge unveraendert',
    sFind('set-probe').name === 'Probe oben'
    && sFind('set-probe').positionen[0].produkt === 'gewindestange-m10-1000'
    && sFind('set-probe').positionen[0].menge === 5
    && sFind('set-probe').positionen[1].rolle === 'kupplung');

  confirmAntwort = true;
  sZeile('set-loeschen', 'set-probe');
  confirmAntwort = false;
  ok('#94 Set geloescht, Produkte unberuehrt',
    sets().length === 2 && sFind('set-wandabschluss') && sFind('set-deckenanschluss')
    && kAnzahl() === V_KAT_ANZ
    && /gelöscht/.test(kMsgTxt()) && $('ks-leer').hidden === true);

  // 14e) Der Standardkatalog macht die Suite startklar ([P-18]) — nachweisbar hier,
  // wo er gepflegt wird. Vorbelegt wird davon NICHTS: es gibt keine aktive Wand, und
  // der bearbeitete Katalog ist nicht der zugeordnete ([P-13]).
  ok('[P-18] jede waehlbare Verwendungsstelle hat ein Standardprodukt',
    KAT.rollenOhneVorschlag(kat()).length === 0);
  ok('[P-18] genau eine Kopplungsmutter (Stoß = Fuß)',
    kat().produkte.filter(p => /kopplungsmutter/i.test(p.id)).length === 1
    && KAT.produktrollenVorschlag(kat()).kupplung.length === 1);
  ok('Kennzeichnung „vorläufig" ueberlebt die Persistenz',
    KAT.produkt(kat(), 'latte-40-60-1500').hinweis.startsWith('vorläufig — fachlich unbestätigt'));

  // 14f) Ressourcentrennung: eine Wanddatei im KATALOG-Import wird benannt abgewiesen
  const slotVorWand = kSlot();
  await $('k-import').dispatch('change',
    { target: { files:[kFile(vorlageDatei(V_WAND), V_WAND)], value:'x' } });
  ok('Wandvorlage im Katalog-Import -> klare Meldung, Kataloge byte-gleich',
    kFehler() && /Projekt-\/Wandelement-Datei/.test(kMsgTxt()) && kSlot() === slotVorWand);

  // 14g) Modul 10 ruehrt kein Wandelement und keine Produktreferenz einer Wand an ([P-13])
  ok('[P-13] die Pflege hat keine Wandauswahl angefasst — es gibt keine aktive Wand',
    store.aktivId() === null && localStorage.getItem('sembla:elemente') === null);
}

// --- Ergebnis -------------------------------------------------------------
let fehler = 0;
for (const [name, gut] of checks) {
  if (!gut) fehler++;
  console.log((gut ? '  ok   ' : '  FEHL ') + name);
}
console.log(`\n${checks.length - fehler}/${checks.length} Pruefungen ok (Modul 10, docs/katalog.html)`);
process.exit(fehler ? 1 : 0);
