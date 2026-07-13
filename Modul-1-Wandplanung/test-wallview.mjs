// Paritätstest: das geteilte Renderer-Modul drawWall() erzeugt dieselbe Zeichnung wie
// die draw()-Funktion im Alpha-Tool (Referenz). Das Tool wird NICHT verändert – es wird
// nur evaluiert und über sein bestehendes window.__wp gelesen.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../Phase-2/sembla-core.mjs";
import { drawWall } from "./sembla-wallview.mjs";

const html = readFileSync("./SEMBLA_Wandplanung.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El { constructor(id){ this.id=id; this.value=undefined; this.textContent=''; this._h=''; this.style={}; this.listeners={}; this._tb=null; this.checked=false; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f); } dispatch(e){ (this.listeners[e]||[]).forEach(f=>f({target:this})); }
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(s){ if(s==='tbody'){ if(!this._tb)this._tb=new El('tb'); return this._tb; } return new El('x'); }
  querySelectorAll(){return [];} appendChild(){} }
const dv={len:'2.00',hgt:'2.60',sideVorne:'fassade',sideHinten:'innenausbau',qk:'1.00',gammaQ:'1.50',modus:'auto',spacing:'3',force:'60',fcd:'20',cfd:'0.60',rho:'14'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={print:()=>{},addEventListener:()=>{}}; globalThis.alert=()=>{};
eval(script);
const WP=globalThis.window.__wp;

let pass=0, fail=0;
const ok=(n,c)=>{ console.log((c?"  ok  ":"FAIL  ")+n); c?pass++:fail++; };
const sig=svg=>({
  stones:(svg.match(/#cfd3d8|#bcc2c9/g)||[]).length,
  prestress:(svg.match(/stroke="#1f6feb"/g)||[]).length,
  base:/Bodenblech 15 mm/.test(svg),
  outline:(svg.match(/<polyline/g)||[]).length,
  rownums:(svg.match(/text-anchor="end"/g)||[]).length,
});

// --- Parität: Alpha-Zeichnung (Standardwand, showDim=true beim Laden) vs. Modul ---
const wRef=WP.RESULT.wandelement;
const alphaSvg=document.getElementById('plan').innerHTML;
const modSvg=drawWall(wRef,{view:'vorne',showDim:true,showRaster:false}).svg;
const a=sig(alphaSvg), m=sig(modSvg);
console.log("      alpha:",JSON.stringify(a),"\n      modul:",JSON.stringify(m));
ok("Parität Steine", a.stones===m.stones && m.stones>0);
ok("Parität Vorspannstränge", a.prestress===m.prestress && m.prestress>0);
ok("Parität Bodenblech vorhanden", a.base && m.base);
ok("Parität Umriss-Polyline", a.outline===m.outline && m.outline>0);
ok("Parität Reihennummern/Maßtext", a.rownums===m.rownums && m.rownums>0);

// --- Modul-Funktionsumfang direkt (Öffnungen, Staffelung, Spannplatte, Edit/Achsen) ---
const w2=buildWall('V',3000,2600,[new Opening(4,8,0,9,'tuer'),new Opening(14,18,3,8,'fenster')],null,{top_connection:'spannplatte'},[{x0_mm:1875,x1_mm:3000,height_mm:1600}]);
const r2=drawWall(w2,{view:'vorne',showDim:true,editMode:true,axisEdit:true,selAxis:w2.tension_columns[0].k});
const s2=r2.svg;
ok("Öffnungs-Labels Tür + Fenster", />Tür</.test(s2) && />Fenster</.test(s2));
ok("Staffelung: Umriss + Stufenmaß", /<polyline/.test(s2));
ok("Spannplatte: Spann-Anker (#e8702a)", /#e8702a/.test(s2));
ok("Edit-Modus: klickbare Zellen (data-r/data-c)", /class="cell" data-r=/.test(s2));
ok("Achsen-Modus: Griffe mit data-k", /<circle data-k=/.test(s2));
ok("Maße/Bemaßung gezeichnet (cm/m Labels)", /cm<\/text>|m<\/text>/.test(s2));
ok("lastdraw + viewBox geliefert", r2.viewBoxH>0 && r2.lastdraw.sc>0 && r2.lastdraw.W===1000);

console.log(`\n${pass} ok, ${fail} fail`); process.exit(fail?1:0);
