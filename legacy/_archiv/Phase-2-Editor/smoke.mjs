import { readFileSync } from "node:fs";
const html = readFileSync("./SEMBLA_Wandeditor.html","utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);

// --- Minimaler DOM-Stub ---
class El{
  constructor(id){this.id=id;this.value=undefined;this.textContent='';this._html='';this.style={};this.dataset={};this.attrs={};this.listeners={};}
  addEventListener(ev,fn){(this.listeners[ev]||(this.listeners[ev]=[])).push(fn);}
  dispatch(ev){(this.listeners[ev]||[]).forEach(fn=>fn({target:this}));}
  setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
  get innerHTML(){return this._html;} set innerHTML(v){this._html=v;}
  appendChild(){} querySelectorAll(){return [];}
}
const document={_e:{}, getElementById(id){return this._e[id]||(this._e[id]=new El(id));}, createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={};
document.getElementById('len').value='2.00';
document.getElementById('hgt').value='2.60';
document.getElementById('sideVorne').value='fassade';
document.getElementById('sideHinten').value='innenausbau';

// Core + UI im selben Scope ausführen
eval(blocks[0]+"\n"+blocks[1]+"\n;globalThis.__addOpening=addOpening;globalThis.__getLAST=()=>LAST;");

const checks=[];const ok=(n,c)=>checks.push([n,!!c]);
const plan=document.getElementById('plan');
ok('SVG hat Inhalt', plan.innerHTML.length>300);
ok('Steine gezeichnet', (plan.innerHTML.match(/<rect/g)||[]).length>5);
ok('Vorspannstränge blau', (plan.innerHTML.match(/stroke="#1f6feb"/g)||[]).length>=2);
ok('Stahlplatten gezeichnet', (plan.innerHTML.match(/fill="#1f6feb"/g)||[]).length>=2);
ok('Status = Baubar', document.getElementById('status').textContent==='Baubar');
ok('Stückliste 6 Zeilen', (document.getElementById('bom').innerHTML.match(/<tr>/g)||[]).length===6);
ok('Stränge-Zahl > 0', +document.getElementById('rcols').textContent>0);
// Tür hinzufügen
globalThis.__addOpening('tuer');
ok('Tür im SVG sichtbar', /Tür/.test(plan.innerHTML));
ok('mit Tür weiterhin baubar', document.getElementById('status').textContent==='Baubar');
// Seiten / Ansicht
ok('sides im Wandelement', globalThis.__getLAST().sides.vorne.funktion==='fassade' && globalThis.__getLAST().sides.hinten.funktion==='innenausbau');
ok('Side-Badge zeigt Vorderseite: Fassade', /Vorderseite: Fassade/.test(document.getElementById('sideBadge').textContent));
const xBefore=(plan.innerHTML.match(/<rect x="([\d.]+)"/)||[])[1];
document.getElementById('viewToggle').dispatch('click');
ok('Rückseite gespiegelt (Header)', /Rückseite \(gespiegelt\)/.test(plan.innerHTML));
ok('Side-Badge zeigt Rückseite: Innenausbau', /Rückseite: Innenausbau/.test(document.getElementById('sideBadge').textContent));
const xAfter=(plan.innerHTML.match(/<rect x="([\d.]+)"/)||[])[1];
ok('Spiegelung ändert Geometrie', xBefore!==xAfter);
document.getElementById('viewToggle').dispatch('click'); // zurück auf Vorderseite
// Funktion ändern
const sv=document.getElementById('sideVorne'); sv.value='sicht'; sv.dispatch('change');
ok('Funktionswechsel wirkt', /Vorderseite: Sichtfläche/.test(document.getElementById('sideBadge').textContent));
sv.value='fassade'; sv.dispatch('change');

// Roundtrip: geprüftes Wandelement laden
const geprueft={ length_mm:3000, height_mm:2600,
  sides:{vorne:{funktion:'innenausbau'},hinten:{funktion:'fassade'}},
  openings:[{g0:5,g1:11,l0:0,l1:10,art:'tuer'}],
  prestress:{max_span_grid:1, force_kN:65},
  verification:{status:'geprüft', governing:{name:'biegung',util:0.91}, auslegung:{max_span_grid:1,force_kN:65,strands:24}} };
globalThis.window.applyWand(geprueft);
ok('Roundtrip: Länge übernommen', document.getElementById('len').value==='3.000');
ok('Roundtrip: Seite vorne = Innenausbau', document.getElementById('sideVorne').value==='innenausbau');
ok('Roundtrip: Verif-Badge sichtbar + geprüft', document.getElementById('verifBadge').style.display!=='none' && /geprüft/.test(document.getElementById('verifBadge').textContent));
ok('Roundtrip: geladene Vorspannung (sp=1 -> viele Stränge)', +document.getElementById('rcols').textContent>10);
// Edit invalidiert die geladene Prüfung
const lenE=document.getElementById('len'); lenE.value='3.0'; lenE.dispatch('input');
ok('Edit invalidiert Verif-Badge', document.getElementById('verifBadge').style.display==='none');

// N=4 (0,5 m) -> nicht baubar
const len=document.getElementById('len'); len.value='0.5'; len.dispatch('input');
ok('0,5 m -> Nicht baubar', document.getElementById('status').textContent==='Nicht baubar');

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
