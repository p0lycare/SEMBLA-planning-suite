import { readFileSync } from "node:fs";
const html=readFileSync("./SEMBLA_Projekt_Manager.html","utf8");
let script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El{constructor(id){this.id=id;this.value=undefined;this.checked=true;this._h='';this.style={};this.dataset={};this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  appendChild(){} querySelectorAll(){return [];}}
const defaults={pname:'SEMBLA Projekt',defH:'2.60'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in defaults)e.value=defaults[id];}return e;},createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={}; globalThis.alert=()=>{}; globalThis.prompt=()=>null;
eval(script);
const pm=globalThis.window.__pm;
const W2=JSON.parse(readFileSync("./ref2.json","utf8"));
const W3=JSON.parse(readFileSync("./ref3.json","utf8"));
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]); const assert=ok;
ok('leeres Projekt: Hinweis', document.getElementById('wempty').style.display==='block');
ok('leeres Projekt: Plan-Hinweis', /Keine Wände/.test(document.getElementById('plan').innerHTML));
pm.addWallFromElement(W2,'Wand A'); pm.addWallFromElement(W3,'Wand B'); pm.PROJECT.walls[1].x_mm=3000; pm.PROJECT.walls[1].rot_deg=90; pm.render();
ok('2 Wände im Projekt', pm.PROJECT.walls.length===2);
ok('Plan: 2 Wand-Polygone', (document.getElementById('plan').innerHTML.match(/<polygon/g)||[]).length>=2);
const b=pm.cad.aggregateBom(pm.PROJECT);
ok('Sammel-BOM i3 = Summe', b.i3===W2.bom.i3+W3.bom.i3);
ok('BOM-Tabelle gefüllt', (document.getElementById('bom').innerHTML.match(/<tr>/g)||[]).length>=6);
const wl=pm.wallFromLength(2000,2600,'X');
ok('Wand aus Länge: 13 Lagen', wl.lagen===13 && wl.courses.length===13);
// DXF
const dxf=pm.cad.projectToDxfGrundriss(pm.PROJECT);
ok('DXF Grundriss enthält WAND-Layer', dxf.includes('WAND') && dxf.trim().endsWith('EOF'));
ok('DXF Roundtrip: 2000er-Segment', pm.cad.dxfToSegments(dxf).some(s=>Math.abs(s.len-2000)<1));
// IFC ref-integrity
const ifc=pm.cad.projectToIfc(pm.PROJECT,{stones:true});
const def=new Set(),ref=new Set();
for(const ln of ifc.split("\n")){ const m=ln.match(/^#(\d+)=/); if(m)def.add(+m[1]); for(const r of ln.replace(/^#\d+=/,"").matchAll(/#(\d+)/g))ref.add(+r[1]); }
ok('IFC: keine offenen Referenzen', [...ref].every(r=>def.has(r)));
ok('IFC: 2 Wände', (ifc.match(/IFCWALLSTANDARDCASE\(/g)||[]).length===2);
let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
