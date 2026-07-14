import { readFileSync } from "node:fs";
const html=readFileSync("./SEMBLA_FreierEditor.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.className='';this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelectorAll(){return [];} }
const dv={len:'2.00',hgt:'2.60',sideVorne:'fassade',sideHinten:'innenausbau'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement(){return new El('_');},querySelectorAll(){return [];}};
globalThis.document=document; globalThis.window={}; globalThis.alert=()=>{};
eval(script);
const FE=globalThis.window.__fe;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
ok('Parametrik-Füllung erzeugt Steine', FE.stones.length>10);
ok('Versatz-konform nach Parametrik (Grid zeigt ok)', /Versatz ok/.test(document.getElementById('vBadge').textContent));
// Durchbruch: einen Stein mitten in der Wand löschen
const mid=FE.stones.find(s=>s.row===5); FE.erase(mid.row, mid.c0);
ok('Stein entfernt (Durchbruch)', FE.stones.indexOf(mid)<0);
const we=FE.toWandelement();
ok('Export: Öffnung aus leerer Zelle erkannt', we.openings.length>=1);
ok('Export: courses faithful (Lagen=L)', we.courses.length===FE.L);
ok('Export: authoring=frei', we.authoring==='frei');
ok('Export: tension_columns vorhanden', we.tension_columns.length>0);
ok('Export: sides + bom', we.sides.vorne.funktion==='fassade' && we.bom.i3>0);
// Manuell Stein setzen: i2 an freie Zelle in neuer leeren Wand
FE.setSize(); // 16x13 leer? nein setSize leert dann fill nicht -> leer
ok('setSize leert das Raster', FE.stones.length===0);
FE.setTool('i2'); FE.cellClick(0,0);
ok('manuelles Setzen i2', FE.stones.length===1 && FE.stones[0].type==='i2' && FE.stones[0].w===2);
FE.cellClick(0,1); // überlappt -> darf nicht setzen
ok('Überlappung verhindert', FE.stones.length===1);
// Versatz-Konflikt erzeugen: zwei gleiche Lagen
FE.setSize(); FE.setTool('i3'); FE.cellClick(0,0); FE.cellClick(0,3); FE.cellClick(1,0); FE.cellClick(1,3);
ok('Versatz-Konflikt erkannt', /Konflikt/.test(document.getElementById('vBadge').textContent));
let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
