import { readFileSync } from "node:fs";
const html=readFileSync("./SEMBLA_Wandplanung.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.listeners={};this._tb=null;}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(s){ if(s==='tbody'){ if(!this._tb)this._tb=new El('tb'); return this._tb;} return new El('x'); }
  querySelectorAll(){return [];} appendChild(){} }
const dv={len:'2.00',hgt:'2.60',sideVorne:'fassade',sideHinten:'innenausbau',qk:'1.00',gammaQ:'1.50',modus:'auto',spacing:'3',force:'60',fcd:'20',cfd:'0.60',rho:'14'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__p=true;},addEventListener:()=>{}}; globalThis.alert=()=>{};
eval(script);
const WP=globalThis.window.__wp;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
ok('Auslegung läuft, konvergiert', WP.RESULT && WP.RESULT.status==='konvergiert');
ok('Wandbild + Stränge', (document.getElementById('plan').innerHTML.match(/<rect/g)||[]).length>5 && document.getElementById('plan').innerHTML.includes('#1f6feb'));
ok('3 Nachweise', (document.getElementById('nwTable').querySelector('tbody').innerHTML.match(/<tr/g)||[]).length===3);
ok('Stückliste gefüllt', (document.getElementById('bom').innerHTML.match(/<tr>/g)||[]).length>=5);
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
// Durchbruch (zwei Zellen in Spalte 9, Lagen 5-6) -> Öffnung + segmentierte Vorspannung
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

// Gewindestangenlänge als Eingabe
document.getElementById('rodCm').value='110'; WP.run();
const g110=WP.RESULT.wandelement.bom.gewindestangen;
document.getElementById('rodCm').value='60'; WP.run();
const w60=WP.RESULT.wandelement;
ok('rod_mm aus Eingabe (60 cm -> 600 mm)', w60.rod_mm===600);
ok('kürzere Stange -> mehr Gewindestangen', w60.bom.gewindestangen>g110);
document.getElementById('rodCm').value='110'; WP.run();

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

// Projekt-Kopfdaten: Eingabe -> projektData; prefill füllt Felder
document.getElementById('pjProjekt').value='Kreislauffiliale Lidl';
document.getElementById('pjBauherr').value='LIDL Dienstleistung GmbH & Co. KG';
document.getElementById('pjIndex').value='2';
const pj=WP.projektData();
ok('projektData liest Kopfdaten', pj.name==='Kreislauffiliale Lidl' && pj.bauherr.startsWith('LIDL') && pj.index==='2');
WP.prefillProjekt({name:'Projekt X', bauherr:'Bauherr Y', phase:'Genehmigungsplanung', plan_nr:'A-01'});
ok('prefillProjekt setzt Felder', document.getElementById('pjProjekt').value==='Projekt X' && document.getElementById('pjPhase').value==='Genehmigungsplanung' && document.getElementById('pjPlanNr').value==='A-01');

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

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
