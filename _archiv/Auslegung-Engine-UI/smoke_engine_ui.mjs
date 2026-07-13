import { readFileSync } from "node:fs";
const html=readFileSync("./SEMBLA_Auslegung.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.className='';this.style={};this.listeners={};this._tb=null;}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(sel){ if(sel==='tbody'){ if(!this._tb)this._tb=new El('tbody'); return this._tb;} return new El('x'); } appendChild(){} }
const dv={len:'2.00',hgt:'2.60',sideVorne:'fassade',sideHinten:'innenausbau',qk:'1.00',gammaQ:'1.50',modus:'auto',spacing:'3',force:'60',fcd:'20',cfd:'0.60',rho:'14'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__p=true;}}; globalThis.alert=()=>{};
eval(script);
const E=globalThis.window.__engine;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
// Auto-Modus
ok('Auto: konvergiert', E.RESULT.status==='konvergiert');
ok('3 Nachweise gerendert', (document.getElementById('nwTable').querySelector('tbody').innerHTML.match(/<tr/g)||[]).length===3);
ok('maßgebender Nachweis markiert', /maßgebend/.test(document.getElementById('nwTable').querySelector('tbody').innerHTML));
ok('verification mit nachweise+governing', !!E.RESULT.wandelement.verification.nachweise && !!E.RESULT.wandelement.verification.governing);
ok('N im Ergebnis', E.RESULT.wandelement.verification.auslegung.force_kN>0);
ok('Wandbild', (document.getElementById('viz').innerHTML.match(/<rect/g)||[]).length>5);
ok('Druckprotokoll gebaut', /Nachweisprotokoll/.test(document.getElementById('printdoc').innerHTML));
// Materialannahme greift
document.getElementById('fcd').value='5'; E.run();
ok('fcd übernommen', E.RESULT.wandelement.verification.material.fcd_Nmm2===5);
document.getElementById('fcd').value='20';
// Nachweis-Modus
const md=document.getElementById('modus'); md.value='nachweis'; document.getElementById('force').value='10'; md.dispatch('change');
ok('Nachweis-Modus: schwache Auslegung nicht erfüllt', E.RESULT.wandelement.verification.status==='nicht erfüllt');
document.getElementById('force').value='80'; E.run();
ok('Nachweis-Modus: starke Auslegung erfüllt', E.RESULT.wandelement.verification.status==='geprüft');
// hohe Last auto -> N steigt
md.value='auto'; document.getElementById('qk').value='0.5'; E.run(); const Nlo=E.RESULT.wandelement.verification.auslegung.force_kN;
document.getElementById('qk').value='3.0'; E.run(); const Nhi=E.RESULT.wandelement.verification.auslegung.force_kN;
ok('höhere Last -> höhere N', Nhi>Nlo);
// Druck auslösen
document.getElementById('print').dispatch('click'); ok('Druck ausgelöst', globalThis.__p===true);
let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
