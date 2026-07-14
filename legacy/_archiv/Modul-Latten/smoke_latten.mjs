import { readFileSync } from "node:fs";
const html=readFileSync("./SEMBLA_Latten_Planung.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El{constructor(id){this.id=id;this.value=undefined;this.checked=true;this.textContent='';this._h='';this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}}
const dv={widthCm:'4',stockCm:'150',insDicke:'8'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;}};
globalThis.document=document; globalThis.window={}; globalThis.alert=()=>{}; globalThis.confirm=()=>true;
eval(script);
const L=globalThis.window.__latten;
const layout=JSON.parse(readFileSync("./layout_ref2.json","utf8"));
L.load(layout);
const res=L.RES;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
ok('Stückliste: 1,5m-Latten angezeigt', +document.getElementById('bCount').textContent>0);
ok('Achsen angezeigt', +document.getElementById('rAxes').textContent===res.summary.achsen);
ok('Lattenbild gezeichnet (rects)', (document.getElementById('viz').innerHTML.match(/<rect/g)||[]).length>res.summary.achsen);
ok('Verbinder-Punkte gezeichnet', (document.getElementById('viz').innerHTML.match(/<circle/g)||[]).length===layout.points.length);
ok('Bedarf <= Stücke (Reststückverwertung)', res.summary.latten_15m_bedarf<=res.summary.latten_stuecke);
// Parameter ändern: 100cm Latte -> mehr Stücke
document.getElementById('stockCm').value='100'; document.getElementById('stockCm').dispatch('input');
ok('kürzere Latte -> mehr/gleich Stücke', L.RES.summary.latten_stuecke>=res.summary.latten_stuecke);
ok('CSV Zuschnitt Kopf', L.battenCutListCsv(L.RES).split("\n")[0].startsWith("achse_x_cm;segment"));
// Dämmung
ok('Dämmung berechnet (Fläche>0)', res.daemmung && res.daemmung.total.flaeche_m2>0);
ok('Dämmfläche angezeigt', /m²/.test(document.getElementById('dFlaeche').textContent));
ok('Dämmung im Lattenbild (schraffiert)', document.getElementById('viz').innerHTML.includes('#f2dca0'));
ok('Gefache > 0', res.daemmung.total.gefache>0);
// Dämmung aus -> keine Berechnung
document.getElementById('insAktiv').checked=false; document.getElementById('insAktiv').dispatch('change');
ok('Dämmung deaktivierbar', L.RES.daemmung===null && document.getElementById('dDicke').textContent==='aus');
document.getElementById('insAktiv').checked=true; document.getElementById('insAktiv').dispatch('change');


let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
