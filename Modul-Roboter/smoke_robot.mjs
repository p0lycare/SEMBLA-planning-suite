import { readFileSync } from "node:fs";
const html=readFileSync("./SEMBLA_Roboter_Export.html","utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.max=0;this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e,t){(this.listeners[e]||[]).forEach(f=>f(t||{target:this}));}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}}
const document={_e:{},getElementById(id){return this._e[id]||(this._e[id]=new El(id));}};
globalThis.document=document; globalThis.window={}; globalThis.alert=()=>{};
eval(script);
const R=globalThis.window.__robot;
const W=JSON.parse(readFileSync("./ref2.json","utf8"));
R.load(W);
const prog=R.PROG;
const nStones=W.courses.reduce((a,c)=>a+c.stones.length,0);
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
ok('Summary place_stones korrekt', +document.getElementById('sStones').textContent===nStones);
ok('Slider max = Steine', +document.getElementById('slider').max===nStones);
ok('Viz: alle Steine bei voller Sequenz', (document.getElementById('viz').innerHTML.match(/<rect/g)||[]).length>=nStones);
ok('aktueller Schritt angezeigt', /PLACE_STONE/.test(document.getElementById('cur').textContent));
// scrubben
document.getElementById('slider').dispatch('input',{target:{value:'0'}});
ok('Start: kein Stein gesetzt (kein blau/orange)', !/fill="#1f6feb"|fill="#9bc0f3"|fill="#e8702a"/.test(document.getElementById('viz').innerHTML.replace(/stroke="#1f6feb"[^>]*/g,'')));
document.getElementById('slider').dispatch('input',{target:{value:'1'}});
ok('1 Stein -> aktueller orange', /fill="#e8702a"/.test(document.getElementById('viz').innerHTML));
// CSV
const csv=R.sequenceToCsv(prog);
ok('CSV Kopf + Zeilen', csv.split("\n")[0].startsWith("seq;op;part") && csv.trim().split("\n").length===prog.steps.length+1);
ok('JSON Preview vorhanden', document.getElementById('preview').textContent.includes("SEMBLA-RobotSequence"));
let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
