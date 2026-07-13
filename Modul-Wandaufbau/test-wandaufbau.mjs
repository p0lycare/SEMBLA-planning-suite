// Paritätstest: das extrahierte Core-Modul planWandaufbau() muss identische Ergebnisse
// liefern wie compute() im geprüften Tool SEMBLA_Wandaufbau.html (Referenz).
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../Phase-2/sembla-core.mjs";
import { planWandaufbau } from "./sembla-wandaufbau.mjs";

// --- Tool-Skript mit DOM-Stub evaluieren (Referenz) ---
const html = readFileSync("./SEMBLA_Wandaufbau.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El { constructor(id){ this.id=id; this.value=undefined; this.textContent=""; this._h=""; this.style={}; this.checked=true; this.listeners={}; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){ (this.listeners[e]||[]).forEach(f=>f({target:this})); }
  setAttribute(k,v){ this["__"+k]=v; } get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(){return new El("x");} querySelectorAll(){return [];} appendChild(){} click(){} getBoundingClientRect(){return {left:0,top:0,width:1000,height:600};} }
const dv={pB:'62.5',pH:'150',oX:'0',oY:'0',maxX:'62.5',maxY:'75',ohang:'12.5',vtyp:'FA-1',Rk:'0.5',gM:'2.0',wk:'0.8',gQ:'1.5',lw:'4',stock:'150',ith:'8',side:'vorne'};
const _e={}; const document={getElementById:id=>{let e=_e[id];if(!e){e=_e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement:()=>new El('a')};
globalThis.document=document; globalThis.window={addEventListener:()=>{}}; globalThis.alert=()=>{};
globalThis.URL={createObjectURL:()=>'x'}; globalThis.Blob=class{}; globalThis.FileReader=class{readAsText(){}};
eval(script);
const WA=globalThis.window.__wandaufbau;

let pass=0, fail=0;
const near=(a,b,t=1e-6)=>Math.abs((a||0)-(b||0))<=t;
const arrEq=(a,b)=>a.length===b.length && a.every((v,i)=>near(v,b[i]));
const ptsKey=pts=>pts.map(p=>`${p.x_cm.toFixed(2)},${p.y_cm.toFixed(2)},${p.type}`).sort().join('|');
const nutKey=nr=>nr.map(n=>`${n.x_cm.toFixed(2)}:${n.status}`).sort().join('|');
function parity(label, ref, mod){
  const checks=[
    ['xs', arrEq(ref.xs, mod.xs)],
    ['ys', arrEq(ref.ys, mod.ys)],
    ['pts', ptsKey(ref.pts)===ptsKey(mod.pts)],
    ['nutRaster', nutKey(ref.nutRaster)===nutKey(mod.nutRaster)],
    ['ohL/ohR', near(ref.ohL,mod.ohL)&&near(ref.ohR,mod.ohR)],
    ['util/ok', near(ref.util,mod.util,1e-9)&&ref.ok===mod.ok],
    ['batt.summary', JSON.stringify(ref.batt.summary)===JSON.stringify(mod.batt.summary)],
    ['batt.daemmung', JSON.stringify(ref.batt.daemmung)===JSON.stringify(mod.batt.daemmung)],
    ['verbinder_typ', ref.layout.verbinder_typ===mod.layout.verbinder_typ],
  ];
  const bad=checks.filter(c=>!c[1]).map(c=>c[0]);
  if(bad.length){ fail++; console.log(`FAIL  ${label} → ${bad.join(', ')}`); }
  else { pass++; console.log(`  ok  ${label} (xs=${mod.xs.length}, pts=${mod.pts.length}, Latten=${mod.batt.summary.latten_stuecke})`); }
}

// Konfig 1: volle Wand mit Tür
const w1=buildWall('W', 3000, 2600, [new Opening(4,8,0,9,'tuer')]);
WA.applyWand(w1); WA.clearFeld && WA.clearFeld();
parity('volle Wand + Tür (vorne)', WA.compute(), planWandaufbau(w1, {side:'vorne'}));

// Konfig 2: Beplankungsfeld
WA.applyWand(w1); WA.setFeld(0,300,0,150);
parity('Beplankungsfeld 300×150', WA.compute(), planWandaufbau(w1, {side:'vorne', feld:{x0:0,x1:300,y0:0,y1:150}}));
WA.clearFeld();

// Konfig 3: Staffelung (getreppte Wand)
const w3=buildWall('S', 3000, 2600, [], null, null, [{x0_mm:1500,x1_mm:3000,height_mm:1400}]);
WA.applyWand(w3); WA.clearFeld && WA.clearFeld();
parity('gestufte Wand', WA.compute(), planWandaufbau(w3, {side:'vorne'}));

// Konfig 4: Rückseite (Innenausbau) → anderer Verbinder
WA.applyWand(w1);
const sideEl=document.getElementById('side'); sideEl.value='hinten'; sideEl.dispatch('change');
parity('Rückseite (Innenausbau, IA-1)', WA.compute(), planWandaufbau(w1, {side:'hinten'}));

console.log(`\n${pass} ok, ${fail} fail`); process.exit(fail?1:0);
