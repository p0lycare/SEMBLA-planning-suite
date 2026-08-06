// Smoke-Test Modul 1 (docs/wandplanung.html): evaluiert das klassische App-Skript unter
// einem DOM-Mock. Rechenkern/Engine/Katalog werden — wie im Browser via window.SEMBLA —
// aus docs/shared/ importiert und vor __wpInit() bereitgestellt.
//
// Storage ist die ECHTE Schicht (docs/shared/storage.js) auf einem localStorage-Mock: nur so
// lassen sich das Auto-Speichern, die wandbezogene Produktauswahl (Issue #35) und deren
// Fortbestand ueber einen Reload (erneutes __wpInit()) am echten Datenpfad pruefen.
import { readFileSync } from "node:fs";
import { buildWall, Opening, GRID, COURSE } from "../../docs/shared/sembla-core.js";
import { autoAuslegung, nachweisPruefen } from "../../docs/shared/sembla-engine.js";

class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();

const html=readFileSync(new URL("../../docs/wandplanung.html", import.meta.url),"utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische (attributlose) Skript
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.listeners={};this._tb=null;this.checked=false;this.dataset={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  // Ereignisobjekt darf vom Test gestellt werden (delegierte Hoerer auf gerenderten Elementen).
  dispatch(e,ev){(this.listeners[e]||[]).forEach(f=>f(ev||{target:this}));}
  setAttribute(){} getBoundingClientRect(){return {left:0,width:1000};} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(s){ if(s==='tbody'){ if(!this._tb)this._tb=new El('tb'); return this._tb;} return new El('x'); }
  querySelectorAll(){return [];} appendChild(){} }
const dv={len:'2.00',hgt:'2.60',startAchse:'0',sideVorne:'fassade',sideHinten:'innenausbau',qk:'1.00',gammaQ:'1.50',modus:'auto',spacing:'3',force:'60',fcd:'20',cfd:'0.60',rho:'14',blechCm:'100',topConn:'blech'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__p=true;},addEventListener:()=>{}}; globalThis.alert=()=>{};

const store = await import("../../docs/shared/storage.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");
// Aktives Element ist in Modul 0 angelegt worden (inkl. Wandtyp) — Modul 1 legt selbst KEINS an.
// Der Leerfall wird am Ende separat geprüft.
const startWand=Object.assign(buildWall('Wand A',2000,2600,[]),{wandtyp:'ohne_wind'});
const idA=store.speichere('Wand A', startWand); store.setzeAktiv(idA);
globalThis.window.SEMBLA={ buildWall, Opening, GRID, COURSE, autoAuslegung, nachweisPruefen, store, KAT };

eval(script);
globalThis.window.__wpInit();
const WP=globalThis.window.__wp;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
// Mit aktivem Element rechnet Modul 1 direkt beim Laden.
ok('aktives Element geladen -> Auslegung läuft, konvergiert', WP.RESULT && WP.RESULT.status==='konvergiert');
// Issue #6 (M2): Modul 1 wählt keinen Wandtyp, führt den des Elements aber unverändert mit —
// auch über den kompletten Neuaufbau durch buildWall() hinweg.
ok('kein Wandtyp-Eingabefeld in Modul 1', !/id="wandtyp"/.test(html));
ok('Wandtyp aus dem Wandelement mitgeführt', WP.RESULT.wandelement.wandtyp==='ohne_wind');
WP.run();
ok('Wandtyp überlebt erneuten Neuaufbau', WP.RESULT.wandelement.wandtyp==='ohne_wind');
ok('Wandbild + Stränge', (document.getElementById('plan').innerHTML.match(/<rect/g)||[]).length>5 && document.getElementById('plan').innerHTML.includes('#1f6feb'));
// Das Slicing muss SICHTBARES Feedback in der Wandansicht sein ([Z-2]/[Z-3]/[Z-6]):
// nicht ein Strich je Strang, sondern ein Strich je realem Stueck plus Kopplungsmarken.
ok('Wandansicht zeichnet die einzelnen Stuecke, nicht einen Strich je Strang', (()=>{
  const svg=document.getElementById('plan').innerHTML;
  const w=WP.RESULT.wandelement;
  const stuecke=w.tension_columns.flatMap(c=>c.segments).flatMap(g=>g.stuecke||[]);
  const kopplungen=w.tension_columns.flatMap(c=>c.segments)
    .reduce((a,g)=>a+Math.max(0,(g.stuecke||[]).length-1),0);
  const striche=(svg.match(/stroke="#1f6feb" stroke-width="2\.4"/g)||[]).length;
  const marken=(svg.match(/<line class="kop"/g)||[]).length;   // Klasse trennt sie vom Legendenmuster
  return stuecke.length>w.tension_columns.length      // es gibt ueberhaupt mehrere Stuecke
    && striche===stuecke.filter(p=>p.art==='standard').length
    && marken===kopplungen; })());
ok('Legende benennt den Zuschnitt', /Zuschnitt:/.test(document.getElementById('plan').innerHTML)
  && /Standardlänge/.test(document.getElementById('plan').innerHTML));
ok('3 Nachweise', (document.getElementById('nwTable').querySelector('tbody').innerHTML.match(/<tr/g)||[]).length===3);
ok('Steine-Zusammenfassung gefüllt (BOM-Tabelle jetzt in Modul 4)', /\d/.test(document.getElementById('rSteine').textContent));
ok('sides + verification im Ergebnis', WP.RESULT.wandelement.sides.vorne.funktion==='fassade' && WP.RESULT.wandelement.verification.status==='geprüft');
// Öffnung hinzufügen
WP.addOpening('tuer');
ok('Tür im Wandbild', /Tür/.test(document.getElementById('plan').innerHTML));
ok('mit Tür weiterhin geprüft', WP.RESULT.wandelement.verification.status==='geprüft');
// Roundtrip-Export = importierbar (selber Inhalt)
const exported=WP.RESULT.wandelement;
WP.applyWand(exported);
ok('Roundtrip: lädt eigenes Ergebnis', document.getElementById('len').value==='2.000');
// Ansicht spiegeln
const xB=(document.getElementById('plan').innerHTML.match(/<rect x="([\d.]+)"/)||[])[1];
document.getElementById('viewToggle').dispatch('click');
ok('Rückseite gespiegelt', /Rückseite/.test(document.getElementById('plan').innerHTML) && xB!==(document.getElementById('plan').innerHTML.match(/<rect x="([\d.]+)"/)||[])[1]);
document.getElementById('viewToggle').dispatch('click');
// zurück auf Auto-Modus (Roundtrip hatte auf Nachweis gestellt)
document.getElementById('modus').value='auto'; document.getElementById('modus').dispatch('change');
// hohe Last
document.getElementById('qk').value='3.0'; document.getElementById('qk').dispatch('input'); const Nhi=WP.RESULT.wandelement.verification.auslegung.force_kN;
document.getElementById('qk').value='0.5'; document.getElementById('qk').dispatch('input'); const Nlo=WP.RESULT.wandelement.verification.auslegung.force_kN;
ok('höhere Last -> höhere N', Nhi>Nlo);
// Durchbruch (zwei Zellen in Spalte 3, Lagen 5-6) -> Öffnung + segmentierte Vorspannung
document.getElementById('modus').value='auto'; document.getElementById('modus').dispatch('change');
WP.toggleVoid(5,3); WP.toggleVoid(6,3);
const wd=WP.RESULT.wandelement;
ok('Durchbruch als Öffnung (art durchbruch)', wd.openings.some(o=>o.art==='durchbruch'));
const c9=wd.tension_columns.find(c=>c.k===3);
ok('Spalte k=3 segmentiert (über/unter Durchbruch)', !!c9 && c9.segments.length>=2 && !c9.durchgehend);
ok('Segmente meiden die Öffnung', c9.segments.every(g=>g.lage1<=5 || g.lage0>=7));
WP.toggleVoid(5,3); WP.toggleVoid(6,3);
ok('Auffüllen entfernt Durchbruch', !WP.RESULT.wandelement.openings.some(o=>o.art==='durchbruch'));

// Versatz-Warnung: 0,50 m (zwei i2) verletzt den Mindestversatz -> sichtbare Warnung + rotes Badge
WP.voids.clear();
document.getElementById('len').value='0.50';
document.getElementById('modus').value='nachweis';
WP.run();
const wbad=WP.RESULT.wandelement;
ok('0,50 m: Core meldet versatz_ok=false', wbad.validation.versatz_ok===false);
ok('Versatz-Warnung im UI sichtbar', /Versatz/.test(document.getElementById('warns').textContent));
ok('Badge zeigt Verband regelwidrig', /regelwidrig/.test(document.getElementById('statusBadge').textContent));
ok('Badge ist rot (Klasse no)', /badge no/.test(document.getElementById('statusBadge').className));
document.getElementById('len').value='2.00'; document.getElementById('modus').value='auto'; WP.run();

// [Z-1] Es gibt KEIN Eingabefeld fuer die Gewindestangenlaenge mehr — der Bauteilkatalog ist
// die alleinige Quelle. Ohne Katalog rechnet der Core mit seinem dokumentierten Altstand-Wert.
// Gegen die echte HTML-Quelle geprueft, nicht gegen den DOM-Stub: der legt unbekannte
// Elemente bei Bedarf an und koennte ein entferntes Feld nie als fehlend melden.
ok('kein Eingabefeld fuer die Stangenlaenge mehr im Modul', !/id="rodCm"/.test(html));
WP.run();
ok('ohne Katalogauswahl: Altstand-Fallback des Cores (1100 mm)', WP.RESULT.wandelement.rod_mm===1100);
ok('ohne Auswahl gibt Modul 1 keine Stangenlaenge vor', (()=>{ const p=WP.vorgaben().prestress;
  return p.rod_mm===undefined && p.rod_lengths_mm===undefined; })());
ok('fehlende Auswahl wird sichtbar gemeldet',
  /Kein Gewindestangenprodukt gewählt/.test(document.getElementById('rodQuelle').innerHTML));

// Staffelung / getreppter Aufbau: rechte Hälfte niedriger -> keine Öffnungs-Überlappung, oben rechts keine Steine
document.getElementById('len').value='2.00'; document.getElementById('hgt').value='2.60'; WP.run();
WP.addStep(); WP.steps[0].x0=1.00; WP.steps[0].x1=2.00; WP.steps[0].h=1.00; WP.run();
const wst=WP.RESULT.wandelement;
ok('Staffelung im Wandelement (steps)', Array.isArray(wst.steps) && wst.steps.length===1 && wst.steps[0].height_mm===1000);
const topc=wst.courses.find(c=>c.lage===12);   // 2400..2600 mm
ok('oberste Lage nur linke Hälfte (max x ≤ 1,0 m)', Math.max(0,...topc.stones.map(s=>s.x1))<=1000);
ok('getreppte Wand baubar (keine Überlappung)', wst.validation.buildable===true);
const untenc=wst.courses.find(c=>c.lage===0);
ok('unterste Lage volle Breite (2,0 m)', Math.max(0,...untenc.stones.map(s=>s.x1))===2000);

// Projekt-Kopfdaten wurden nach Modul 0 (Startseite) verschoben — hier nicht mehr getestet.

// Feature-Requests: Anschluss-Modell + Reihennummern
document.getElementById('len').value='2.00'; document.getElementById('hgt').value='2.60'; document.getElementById('modus').value='auto'; WP.run();
const wfr=WP.RESULT.wandelement;
ok('prestress hat blech_mm + top_connection', wfr.prestress.blech_mm>0 && (wfr.prestress.top_connection==='blech'||wfr.prestress.top_connection==='spannplatte'));
ok('base_plate im Wandelement (15 mm)', !!wfr.base_plate && wfr.base_plate.dicke_mm===15);
ok('bom Stahlblech + Senkkopf vorhanden', wfr.bom.stahlblech_module>0 && wfr.bom.senkkopfschrauben>0);
const planHtml=document.getElementById('plan').innerHTML;
ok('Bodenblech gezeichnet', /Bodenblech/.test(planHtml));
ok('Reihennummern gezeichnet', (()=>{ for(let r=1;r<=wfr.lagen;r++) if(!planHtml.includes('>'+r+'</text>')) return false; return true; })());
document.getElementById('topConn').value='spannplatte'; document.getElementById('topConn').dispatch('change');
ok('Umschaltung Spannplatte wirkt', WP.RESULT.wandelement.prestress.top_connection==='spannplatte' && WP.RESULT.wandelement.top_plate===null);
document.getElementById('topConn').value='blech'; document.getElementById('topConn').dispatch('change');

// Feature: manueller Spannachsen-Editor (Sonderkonstruktion)
document.getElementById('len').value='2.00'; document.getElementById('hgt').value='2.60'; document.getElementById('modus').value='auto'; WP.run();
WP.setManualCols([0,8,15]);
const mks=WP.RESULT.wandelement.tension_columns.map(c=>c.k);
ok('manuelle Achsen: nur gesetzte k', mks.every(k=>[0,8,15].includes(k)) && mks.includes(0) && mks.includes(15));
ok('columns_grid im Wandelement gesetzt', JSON.stringify(WP.RESULT.wandelement.prestress.columns_grid)==='[0,8,15]');
WP.addAxisAt(4); ok('Achse hinzufügen (k=4)', WP.manualCols.includes(4));
WP.delAxis(8); ok('Achse löschen (k=8)', !WP.manualCols.includes(8));
WP.setAxisEdit(true); ok('Achsen-Editor an + Griffe gezeichnet', WP.axisEdit===true && /cursor:grab/.test(document.getElementById('plan').innerHTML));
WP.setManualCols(null); ok('Zurück zu Auto (columns_grid null)', WP.RESULT.wandelement.prestress.columns_grid===null && WP.manualCols===null);
WP.setAxisEdit(false);

// Issue #13: Startachse der Vorspannung (1./2. Rasterachse) über den echten Handler.
// N=16 (2,00 m) ist bewusst nicht glatt durch den Strangabstand teilbar.
// Sauberer Ausgangszustand: glatte 2,00-m-Wand laden (setzt Öffnungen/Staffelung zurück),
// fester Nachweis-Modus mit Strangabstand 3 -> deterministische Achsen.
WP.applyWand(Object.assign(buildWall('T13',2000,2600,[]),{wandtyp:'mit_wind'}));
document.getElementById('modus').value='nachweis'; document.getElementById('spacing').value='3';
document.getElementById('force').value='60'; WP.run();
ok('Auswahlfeld Startachse in Modul 1 vorhanden', /id="startAchse"/.test(html));
const ks0=WP.RESULT.wandelement.tension_columns.map(c=>c.k);
ok('Default = 1. Rasterachse (Bestand)', WP.RESULT.wandelement.prestress.start_axis_grid===0 && ks0[0]===0);
document.getElementById('startAchse').value='1'; document.getElementById('startAchse').dispatch('change');
const w13=WP.RESULT.wandelement, ks1=w13.tension_columns.map(c=>c.k), x13=w13.prestress.max_span_grid;
ok('Auswahl wirkt bis ins Wandelement (prestress)', w13.prestress.start_axis_grid===1);
ok('Startanker auf 2. Rasterachse (k=1), keine Achse auf k=0', ks1[0]===1 && !ks1.includes(0));
ok('Endanker bleibt letzte Achse N-1', ks1[ks1.length-1]===w13.N_grid-1);
ok('alle Abstände <= Strangabstand x', ks1.every((k,i)=>i===0||k-ks1[i-1]<=x13));
ok('Fortführung ab Startachse (nicht glatt teilbar)', JSON.stringify(ks1)==='[1,4,7,9,12,15]' && x13===3);
document.getElementById('startAchse').value='0'; document.getElementById('startAchse').dispatch('change');
ok('Zurück auf 1. Rasterachse', WP.RESULT.wandelement.prestress.start_axis_grid===0 &&
   JSON.stringify(WP.RESULT.wandelement.tension_columns.map(c=>c.k))==='[0,3,6,9,12,15]');
// auch im Auto-Modus (Strangabstand von der Engine optimiert) wirkt die Startachse
document.getElementById('modus').value='auto'; document.getElementById('startAchse').value='1';
document.getElementById('startAchse').dispatch('change');
const wA=WP.RESULT.wandelement, ksA=wA.tension_columns.map(c=>c.k);
ok('Auto-Modus: Startachse 2 wirkt, Abstände <= optimiertem x', wA.prestress.start_axis_grid===1 &&
   ksA[0]===1 && ksA[ksA.length-1]===wA.N_grid-1 && ksA.every((k,i)=>i===0||k-ksA[i-1]<=wA.prestress.max_span_grid));
document.getElementById('modus').value='nachweis'; document.getElementById('startAchse').value='0';
document.getElementById('startAchse').dispatch('change');
// Wiederherstellung beim Laden eines gespeicherten Wandelements
WP.applyWand(Object.assign(buildWall('Gespeichert',2000,2600,[],null,{start_axis_grid:1}),{wandtyp:'mit_wind'}));
ok('Startachse aus gespeichertem Wandelement wiederhergestellt',
   document.getElementById('startAchse').value==='1' && WP.RESULT.wandelement.prestress.start_axis_grid===1);
const alt=buildWall('Alt',2000,2600,[]); delete alt.prestress.start_axis_grid;   // Altstand ohne Feld
WP.applyWand(Object.assign(alt,{wandtyp:'mit_wind'}));
ok('Altstand ohne Feld -> 1. Rasterachse', document.getElementById('startAchse').value==='0' && WP.RESULT.wandelement.tension_columns[0].k===0);

// Auto-Speichern (kein Button mehr): jede echte Änderung legt/aktualisiert das aktive Element
document.getElementById('len').value='2.00'; document.getElementById('len').dispatch('input');
const gesp=store.aktivesWandelement();
ok('Auto-Speichern übergibt Wandelement an Storage', gesp && gesp.length_mm>0 && !!gesp.verification);

// ---- Issue #35: Produkte dieser Wand (echte Modul-1-Oberfläche) ----------------------
// Modul 1 wählt DIREKT aus dem vollständigen Katalog; es gibt keinen Freigabepool in Modul 0.
// Nur synthetische Fantasieprodukte.
const KATALOG={ format:'SEMBLA-Bauteilkatalog', version:1, name:'Testkatalog M1', produkte:[
  { id:'stein-i3', kategorie:'stein', bezeichnung:'Stein i3', einheit:'Stk', preis:9.5, breite_mm:375, hoehe_mm:200, dicke_mm:125 },
  { id:'stein-i2', kategorie:'stein', bezeichnung:'Stein i2', einheit:'Stk', preis:7.2, breite_mm:250, hoehe_mm:200, dicke_mm:125 },
  { id:'rod-1100', kategorie:'gewindestange', bezeichnung:'Stange 1100', einheit:'Stk', preis:3.8, gewinde:'M10', laenge_mm:1100 },
  { id:'rod-1000', kategorie:'gewindestange', bezeichnung:'Stange 1000', einheit:'Stk', preis:3.5, gewinde:'M10', laenge_mm:1000 },
  { id:'rod-1100b', kategorie:'gewindestange', bezeichnung:'Stange 1100 Zweitquelle', einheit:'Stk', preis:4.1, gewinde:'M10', laenge_mm:1100 },
  { id:'blech-boden', kategorie:'blech_platte', bezeichnung:'Bodenblech 1000', einheit:'Stk', preis:18, breite_mm:1000, hoehe_mm:125, dicke_mm:15 },
  { id:'blech-kopf', kategorie:'blech_platte', bezeichnung:'Kopfblech 1000', einheit:'Stk', preis:19, breite_mm:1000, hoehe_mm:125, dicke_mm:15 },
  { id:'dicht-stk', kategorie:'verbrauch', bezeichnung:'Dichtstreifen 20 cm', einheit:'Stk', preis:0.3 },
  { id:'latte-1500', kategorie:'latte', bezeichnung:'Latte 1500', einheit:'Stk', preis:3.5, breite_mm:40, dicke_mm:60, laenge_mm:1500 },
]};
// Modul-1-Rollen decken die bestehenden Wand-/Vorspann-/Anschluss-/Fugen-Positionen ab.
ok('Modul-1-Rollen: Vorspannung, Anschluss (Blech getrennt) und Fugen abgedeckt', (()=>{
  const ids=KAT.rollenVonModul(1).map(r=>r.id);
  return ['i3','i2','rod_std','rod_rest','kupplung','senkkopf','spannmutter',
          'spannplatte','blech_boden','blech_kopf','dicht_stk','dicht'].every(x=>ids.includes(x))
    && !ids.includes('latte') && !ids.includes('verbinder') && !ids.includes('beplankung')
    // [P-18]: Sonderzuschnitt-Ausgangsprodukt und Fuß-Kopplungsmutter sind entfallen.
    && !ids.includes('rod_sonder') && !ids.includes('kuppl_basis');
})());
ok('Produktabschnitt in Modul 1 vorhanden', /id="prodRollen"/.test(html) && /Produkte \(Bauteilkatalog\)/.test(html));
ok('ohne Katalog: Hinweis statt Auswahl', (()=>{ WP.renderProdukte();
  return /Kein Bauteilkatalog/.test(document.getElementById('prodInfo').innerHTML)
    && document.getElementById('prodRollen').innerHTML===''; })());

store.setzeKatalog(KATALOG);
WP.run();   // maßgebende Stangenlänge kommt aus dem gewählten Produkt (1100 mm)
WP.renderProdukte();
const prodHtml=()=>document.getElementById('prodRollen').innerHTML;
ok('Katalog geladen: Rollen mit Kandidaten gerendert',
  /data-prol="rod_std"/.test(prodHtml()) && /data-prolle="rod_std" data-pid="rod-1100"/.test(prodHtml()));
ok('nur Produkte der passenden Kategorie je Rolle',
  /data-prol="i3"[\s\S]*?data-pid="stein-i3"/.test(prodHtml()) && !/data-prol="i3"[\s\S]*?data-pid="rod-1100"[\s\S]*?data-prol="i2"/.test(prodHtml()));
ok('Ausgangslage: keine Produktauswahl', KAT.anzahlAuswahl(KAT.produktRollen(store.aktiveEingaben()))===0);

// Echter Handler: Häkchen am gerenderten Kandidaten setzen
const prodBox=document.getElementById('prodRollen');
const setzen=(rolle,pid,checked)=>prodBox.dispatch('change',{target:{dataset:{prolle:rolle,pid},checked}});
setzen('rod_std','rod-1100',true);
ok('Auswahl über den echten Handler gespeichert (nur IDs)',
  JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]');
ok('Herkunftsnotiz des Katalogs mitgeschrieben', store.holeProdukte(1).quelle.name==='Testkatalog M1');
ok('Status an der Rolle sichtbar: zugeordnet', WP.prodStatus('rod_std').status==='ok');
ok('Auswahl liegt in eingaben.planung.produkte (Ownership Modul 1)',
  JSON.parse(localStorage.getItem('sembla:elemente'))[idA].eingaben.planung.produkte.rollen.rod_std.length===1);
ok('kein Produktdatum im Wandelement (Ownership)', (()=>{
  const s=JSON.stringify(store.aktivesWandelement());
  return !s.includes('rod-1100') && !s.includes('Testkatalog') && !s.includes('preis'); })());

// Mehrere Standardlängen sind der REGELFALL ([Z-2]): sie werden kombiniert, nicht „vorgemerkt“
// und auch nicht als mehrdeutig behandelt. Nur gleiche maßgebende Maße bleiben mehrdeutig.
setzen('rod_std','rod-1000',true);
ok('Mehrfachauswahl je Rolle möglich', store.holeProdukte(1).rollen.rod_std.length===2);
ok('[Z-2] zwei Standardlängen -> Status kombiniert (kein „vorgemerkt“)', (()=>{
  const st=WP.prodStatus('rod_std');
  return st.status==='kombiniert' && st.vorgemerkt.length===0
    && JSON.stringify(st.laengen_mm)==='[1100,1000]'; })());
ok('[Z-2] Kombination ist in Modul 1 sichtbar benannt', /kombiniert/.test(prodHtml()));
ok('[Z-1] beide Standardlängen gehen in das Wandelement', (()=>{
  WP.run(); return JSON.stringify(WP.RESULT.wandelement.prestress.rod_lengths_mm)==='[1100,1000]'; })());
ok('[Z-2] Segmente kombinieren echte Standardlängen', (()=>{
  const sg=WP.RESULT.wandelement.tension_columns[0].segments[0];
  return Array.isArray(sg.stuecke) && sg.stuecke.length===sg.gewindestangen
    && sg.stuecke.reduce((a,s)=>a+s.len_mm,0)===sg.z1_mm-sg.z0_mm
    && sg.stuecke.every(s=>s.art==='standard'?s.len_mm===s.quelle_mm:s.quelle_mm>=s.len_mm); })());
// … zwei Produkte mit demselben maßgebenden Maß bleiben mehrdeutig (kein erstes Produkt!)
setzen('rod_std','rod-1100b',true);
ok('gleiches Maß zweifach -> mehrdeutig, kein Preis', (()=>{
  const st=WP.prodStatus('rod_std'); return st.status==='mehrdeutig' && st.produkt===null; })());
ok('Mehrdeutigkeit schon in Modul 1 sichtbar', /Mehrdeutig/.test(prodHtml()));
setzen('rod_std','rod-1100b',false); setzen('rod_std','rod-1000',false);
ok('Häkchen entfernen löst die Auswahl', JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]');

// ---- [P-17] Kompakte Multi-Select-Zeile je Verwendungsrolle -----------------
ok('[P-17] Dropdown statt ausgebreiteter Checkboxliste',
  /<details class="pdd" data-pdd="rod_std"/.test(prodHtml()) && /<summary/.test(prodHtml()));
ok('[P-17] keine wiederholenden Kategorieblöcke mehr', !/class="pgrp"/.test(prodHtml()));
ok('[P-17] geschlossen: Zusammenfassung der Auswahl', /1 Produkt: Stange 1100/.test(prodHtml()));
ok('[P-17] Zusammenfassung „keine Auswahl“ bei leerer Rolle',
  /data-prol="spannplatte"[\s\S]*?keine Auswahl/.test(prodHtml()));
ok('[P-17] Rollenbeschriftung ist der Verwendungszweck, nicht der Produktname',
  KAT.rollenLabel('i3')==='i3-Stein' && KAT.rollenLabel('blech_boden')==='Bodenblech');
ok('[P-17] Option zeigt Produktname PLUS unterscheidende Merkmale', (()=>{
  const o=KAT.rollenOptionen(KATALOG,'rod_std',[]).find(x=>x.id==='rod-1100');
  return o.name==='Stange 1100' && /M10/.test(o.merkmale) && /rod-1100/.test(o.merkmale)
    && o.merkmale!==KAT.rollenLabel('rod_std'); })());
ok('[P-17] keine tautologische Rollen-/Optionsbeschriftung', (()=>{
  for(const r of KAT.rollenVonModul(1)) for(const o of KAT.rollenOptionen(KATALOG,r.id,[])){
    if(!o.merkmale) return false;
    if((o.name+' '+o.merkmale).trim().toLowerCase()===KAT.rollenLabel(r.id).trim().toLowerCase()) return false;
  }
  return true; })());
ok('[P-17] Escape schließt das Dropdown (Tastaturbedienung)', (()=>{
  let zu=false; const box=document.getElementById('prodRollen');
  box.querySelectorAll=()=>[{ set open(v){ zu = (v===false); } }];
  box.dispatch('keydown',{key:'Escape'}); box.querySelectorAll=()=>[];
  return zu; })());

// ---- [Z-1] Stangenlaenge ausschliesslich aus dem Katalog --------------------
// Das frühere Eingabefeld ist ERSATZLOS entfernt: es gibt keinen zweiten Weg mehr, die
// Stangenlaenge zu setzen, und damit auch nichts mehr zu sperren oder zu manipulieren.
ok('[Z-1] Stangenlaenge kommt allein aus dem gewaehlten Produkt', (()=>{
  const v=WP.vorgaben();
  return v.prestress.rod_mm===undefined
    && JSON.stringify(v.prestress.rod_lengths_mm)==='[1100]'
    && WP.RESULT.wandelement.rod_mm===1100; })());
ok('[Z-1] Anzeige nennt die Standardlaengen und die unterste Stange',
  /Standardlängen aus dem Katalog/.test(document.getElementById('rodQuelle').innerHTML)
  && /Unterste Stange ist immer die größte/.test(document.getElementById('rodQuelle').innerHTML));
ok('[Z-1] ohne Auswahl: Hinweis statt Ersatzwert, keine Vorgabe aus Modul 1', (()=>{
  setzen('rod_std','rod-1100',false);
  return /Kein Gewindestangenprodukt gewählt/.test(document.getElementById('rodQuelle').innerHTML)
    && WP.vorgaben().prestress.rod_lengths_mm===undefined
    && WP.vorgaben().prestress.rod_mm===undefined; })());
setzen('rod_std','rod-1100',true);
WP.run();

// [Z-1] Die Maß-Eingrenzung folgt jetzt dem KATALOG, nicht mehr dem Eingabefeld: ein Wechsel
// des gesperrten Feldes kann keine Maßabweichung mehr erzeugen (frueher: mass_abweichend).
WP.run();
ok('[Z-1] ohne zweites Feld gibt es keine Maßabweichung mehr',
  WP.prodStatus('rod_std').status==='ok' && WP.RESULT.wandelement.rod_mm===1100);
// Maßfremd bleibt maßfremd, wo die WAND das Maß vorgibt (Blech-Modullaenge): dort gibt es keine
// Kombination mehrerer Groessen — die Rolle ist bewusst NICHT `kombinierbar`.
setzen('blech_boden','blech-boden',true);
ok('[P-14] Blech bei passender Modullaenge zugeordnet', WP.prodStatus('blech_boden').status==='ok');
document.getElementById('blechCm').value='80'; WP.run();
ok('[P-14] maßfremdes Blechprodukt bleibt ohne Preis', WP.prodStatus('blech_boden').status==='mass_abweichend');
document.getElementById('blechCm').value='100'; WP.run();
ok('zurück auf 100 cm -> Blech wieder zugeordnet', WP.prodStatus('blech_boden').status==='ok');

// Rolle des falschen Moduls darf hier nicht geschrieben werden (Ownership Modul 2)
ok('Modul-2-Rolle landet nicht im Modul-1-Block', (()=>{
  store.setzeProduktrolle('latte',['latte-1500']);
  return !store.holeProdukte(1).rollen.latte && store.holeProdukte(2).rollen.latte.length===1; })());
ok('unbekannte Rolle wird abgelehnt (kein stilles Schreiben)', (()=>{
  try { store.setzeProduktrolle('gibtsnicht',['x']); return false; } catch { return true; } })());

// Fehlende Referenz: Produkt aus dem Katalog entfernen -> sichtbar gemeldet, nie still bereinigt
store.setzeKatalog({ ...KATALOG, produkte: KATALOG.produkte.filter(p=>p.id!=='rod-1100') });
WP.renderProdukte();
ok('gelöschtes Produkt: Referenz bleibt erhalten', JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]');
ok('gelöschtes Produkt: Status fehlt + sichtbare Warnung',
  WP.prodStatus('rod_std').status==='fehlt' && /nicht auflösbar/.test(prodHtml()));
store.setzeKatalog(KATALOG);

// ---- [P-18] Vorbelegung aus der Katalog-Standardauswahl ---------------------
// Produkte ohne `rollen` haben oben nie etwas vorbelegt (das erste „Ausgangslage: keine
// Produktauswahl" belegt das). Traegt der Katalog die Angabe, uebernimmt Modul 1 sie beim
// Rendern fuer die noch LEEREN Rollen — sichtbar gemeldet und weiter frei umwaehlbar.
{
  const KAT_VB={ ...KATALOG, produkte: KATALOG.produkte.map(p =>
    p.id==='stein-i3' ? { ...p, rollen:['i3'] } : (p.id==='dicht-stk' ? { ...p, rollen:['dicht_stk'] } : p)) };
  const idVb=store.speichere('Vorbeleg', buildWall('Vorbeleg',2000,2600,[]));
  store.setzeKatalog(KAT_VB); store.setzeAktiv(idVb);
  store.setzeProduktrolle('rod_std',['rod-1100']);        // bewusste Wahl -> unantastbar
  WP.renderProdukte();
  ok('[P-18] leere Rollen werden aus dem Katalog vorbelegt',
    store.holeProdukte(1,idVb).rollen.i3.join()==='stein-i3'
    && store.holeProdukte(1,idVb).rollen.dicht_stk.join()==='dicht-stk');
  ok('[P-18] die Vorbelegung ist in Modul 1 sichtbar benannt',
    /vorbelegt/.test(document.getElementById('prodInfo').innerHTML));
  ok('[P-18] Vorbelegung erscheint als normale, angehakte Auswahl',
    /data-prolle="i3" data-pid="stein-i3" checked/.test(prodHtml()));
  ok('[P-18] bestehende Wahl bleibt unangetastet',
    store.holeProdukte(1,idVb).rollen.rod_std.join()==='rod-1100');
  ok('[P-18] bewusst leergeraeumte Rolle bleibt leer (kein Wiedervorbelegen)', (()=>{
    setzen('i3','stein-i3',false); WP.renderProdukte();
    return store.holeProdukte(1,idVb).rollen.i3.length===0; })());
  ok('[P-18] keine Auswahl fuer Rollen ohne Standardprodukt (nichts geraten)',
    store.holeProdukte(1,idVb).rollen.blech_boden===undefined);
  // [P-18]/[Z-1]: Eine maßwirksame Vorbelegung (Standardlaengen/Reststueck) MUSS das
  // Wandelement neu rechnen — sonst stuende im gespeicherten JSON weiter die alte Zerlegung
  // und Modul 5/7 und der Export zeigten sie ebenfalls (Reststueck fehlt im Bild).
  ok('[P-18] maßwirksame Vorbelegung rechnet das Wandelement neu ([Z-1])', (()=>{
    const idM=store.speichere('Vorbeleg-Mass', buildWall('Vorbeleg-Mass',2000,2600,[]));
    const katM={ ...KATALOG, produkte:KATALOG.produkte.map(p =>
      p.id==='rod-1000' ? { ...p, rollen:['rod_std'] } : p)
      .concat([{ id:'rod-rest-100', kategorie:'gewindestange', bezeichnung:'Reststueck 100',
                 einheit:'Stk', preis:0.9, gewinde:'M10', laenge_mm:100, rollen:['rod_rest'] }]) };
    store.setzeKatalog(katM); store.setzeAktiv(idM);
    globalThis.window.__wpInit();                       // frischer Seitenaufruf
    const w=store.aktivesWandelement();
    const stuecke=w.tension_columns.flatMap(c=>c.segments).flatMap(g=>g.stuecke||[]);
    return JSON.stringify(w.prestress.rod_lengths_mm)==='[1000]'
      && w.prestress.rod_rest_mm===100
      && stuecke.some(s=>s.art==='rest');               // Slicing steht im gespeicherten JSON
  })());
  store.setzeKatalog(KATALOG); store.setzeAktiv(idA); WP.renderProdukte();
}

// Reload (erneutes __wpInit(): das Modul liest alles frisch aus dem Storage)
globalThis.window.__wpInit();
ok('Reload: Auswahl bleibt erhalten und ist angehakt',
  JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]'
  && /data-prolle="rod_std" data-pid="rod-1100" checked/.test(document.getElementById('prodRollen').innerHTML));

// Externer Wechsel des aktiven Elements lädt Geometrie (Kopfdaten jetzt in Modul 0)
const idExt=store.speichere('Ext', Object.assign(buildWall('Ext',2000,2600,[]),{wandtyp:'mit_wind'}));
store.setzeAktiv(idExt);   // echte Benachrichtigung der Storage-Schicht
ok('Externer Wechsel lädt Wandelement', document.getElementById('len').value==='2.000');
ok('Externer Wechsel übernimmt dessen Wandtyp', WP.RESULT.wandelement.wandtyp==='mit_wind');
ok('Produktauswahl ist wandbezogen (neues Element = leere Auswahl)',
  KAT.anzahlAuswahl(KAT.produktRollen(store.aktiveEingaben()))===0
  && store.holeProdukte(1, idA).rollen.rod_std.length===1);

// Issue #6 (M1): ohne aktives Wandelement legt Modul 1 KEINS an, sondern verweist auf Modul 0.
const anzahlVorher=store.listeElemente().length;
store.setzeAktiv(null);
ok('ohne aktives Element: leere Vorschau + Verweis auf Modul 0',
  !WP.RESULT && /Kein aktives Wandelement/.test(document.getElementById('plan').innerHTML)
  && /Start/.test(document.getElementById('saveHint').textContent));
document.getElementById('len').value='3.00'; document.getElementById('len').dispatch('input');
ok('ohne aktives Element: keine stille Neuanlage', store.listeElemente().length===anzahlVorher && !WP.RESULT);
ok('ohne aktives Element: keine Produktauswahl möglich', (()=>{
  document.getElementById('prodRollen').dispatch('change',{target:{dataset:{prolle:'i3',pid:'stein-i3'},checked:true}});
  return store.holeProdukte(1, idExt).rollen.i3===undefined; })());

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
