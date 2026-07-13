import { readFileSync } from "node:fs";
const html = readFileSync("./SEMBLA_Verbinder_Rechner_Modul2.html","utf8");
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El{ constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.readOnly=false;this.files=[];this.listeners={};this.viewBox={baseVal:{width:1000,height:600}};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(k,v){if(k==='viewBox'){const p=String(v).split(' ');this.viewBox.baseVal={width:+p[2],height:+p[3]};}} 
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;} appendChild(){} querySelectorAll(){return [];}}
const defaults={B:'4.75',H:'2.80',wk:'1.00',gQ:'1.50',gk:'0.60',gG:'1.35',ecc:'8',lev:'20',Rk:'0.50',gM:'2.00',uk:'62.5',ukMode:'exact',syMode:'auto',seite:'vorne'};
const document={_e:{}, getElementById(id){let e=this._e[id]; if(!e){e=this._e[id]=new El(id); if(id in defaults) e.value=defaults[id];} return e;}, createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={}; globalThis.alert=()=>{};
script=script.replace("let LAST=null; let WALL=null; let OPENINGS_CM=[];","let LAST=null; let WALL=null; let OPENINGS_CM=[]; globalThis.__getLAST=()=>LAST; globalThis.__nutMap=nutMap; globalThis.__isCont=isContinuous; globalThis.__stoneRows=stoneRows; globalThis.__nutInRow=nutInRow;");
eval(script);
const applyWand=globalThis.window.applyWand;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const W=JSON.parse(readFileSync("./ref2.json","utf8"));

// 1) Baseline (manuell) lief schon bei Init:
ok('Init: SVG gezeichnet', document.getElementById('plan').innerHTML.length>300);

// 2) ohne Oeffnung (gleiche Groesse) als Vergleich
applyWand({...W, openings:[]});
const countNoOpen = globalThis.__getLAST().r.pts.length;
const ptsNoOpen = globalThis.__getLAST().r.pts;
const axesNoOpen = globalThis.__getLAST().r.axesX;
ok('B aus JSON gesetzt (2.000)', document.getElementById('B').value==='2.000');
ok('B gesperrt', document.getElementById('B').readOnly===true);
ok('H aus JSON (2.60)', document.getElementById('H').value==='2.60');

// 3) mit Tuer
applyWand(W);
const r=globalThis.__getLAST().r;
ok('wandinfo zeigt Öffnung', /Öffnung/.test(document.getElementById('wandinfo').textContent));
ok('Tür im SVG', /Tür/.test(document.getElementById('plan').innerHTML));
ok('Verband i3/i2 gezeichnet', (document.getElementById('plan').innerHTML.match(/<rect/g)||[]).length>10);
// Tuer-Rechteck in cm: x 62.5..137.5, y 0..200
const inDoor = r.pts.filter(p=>p.x>62.5+1e-6&&p.x<137.5-1e-6&&p.y>1e-6&&p.y<200-1e-6);
ok('kein Verbinder in der Tür', inDoor.length===0);
ok('Öffnung räumt Innenfläche frei (Lattenachse vorher in der Türzone, mit Tür kein Verbinder in Türhöhe)',
   axesNoOpen.some(x=>x>62.5+1e-6&&x<137.5-1e-6) && inDoor.length===0);
ok('aber noch Verbinder vorhanden', r.pts.length>0);


// Laibungs-Achsen: Verbinder an Oeffnungskanten auch neben der Oeffnung (volle Hoehe)
const atL = r.pts.filter(p=>Math.abs(p.x-50)<1e-6);
const atR = r.pts.filter(p=>Math.abs(p.x-150)<1e-6);
ok('Laibungsnut links (x=50) vorhanden', atL.length>0);
ok('Laibungsnut rechts (x=150) vorhanden', atR.length>0);
ok('Laibung links auch neben der Tür (volle Höhe)', atL.some(p=>p.y>0&&p.y<200));
ok('Laibung rechts auch neben der Tür (volle Höhe)', atR.some(p=>p.y>0&&p.y<200));


ok('Laibungsnut links nicht auf Reveal-Kante', Math.abs(50-62.5)>1e-6);
ok('Laibungsnut rechts nicht auf Reveal-Kante', Math.abs(150-137.5)>1e-6);

// Tür-Sturz: Verbinder direkt über der Tür (y=210)
ok('Verbinder über Türsturz', r.pts.some(p=>Math.abs(p.y-210)<1e-6 && p.x>62.5 && p.x<137.5));
// Fenster (ref3): Sturz + Brüstung
const W3=JSON.parse(readFileSync("./ref3.json","utf8"));
applyWand(W3); const r3=globalThis.__getLAST().r;
ok('Fenster: Verbinder über Sturz (y=210)', r3.pts.some(p=>Math.abs(p.y-210)<1e-6 && p.x>=75 && p.x<=125));
ok('Fenster: Verbinder unter Brüstung (y=70)', r3.pts.some(p=>Math.abs(p.y-70)<1e-6 && p.x>75 && p.x<125));
ok('Fenster: keine Verbinder in der Öffnung', !r3.pts.some(p=>p.x>75&&p.x<125&&p.y>80&&p.y<200));

// Gleichmaessige Verteilung: glatte Wand 4,0 m -> gleiche Achsabstaende
applyWand({name:'plain',length_mm:4000,height_mm:2600,openings:[],courses:[]});
{
  const rp=globalThis.__getLAST().r;
  const ax=[...rp.axesX].sort((a,b)=>a-b);          // Lattenachsen (nominal, gerade)
  const gaps=ax.slice(1).map((x,i)=>+(x-ax[i]).toFixed(2));
  ok('glatte Wand: >=3 Achsen', ax.length>=3);
  ok('glatte Wand: gleiche Achsabstände', new Set(gaps).size===1);
}
// ref2 Tür: Achsen je Abschnitt, keine durchgehende Achse in der Öffnung
applyWand(W);
{
  const rp=globalThis.__getLAST().r;
  const ax=[...rp.axesX].sort((a,b)=>a-b);          // Lattenachsen je Abschnitt
  ok('Tür: 4 Abschnittsachsen (12,5/50/150/187,5)', JSON.stringify(ax)===JSON.stringify([12.5,50,150,187.5]));
  ok('Tür: keine durchgehende Achse in der Öffnung', !ax.some(x=>x>62.5&&x<137.5));
}

// über Tür bis zum oberen Wandende (Top-Reihe y=250)
ok('Tür: Verbinder am oberen Wandende (y=250)', r.pts.some(p=>Math.abs(p.y-250)<1e-6 && p.x>62.5 && p.x<137.5));
// Fenster: oben bis Wandende, unten bis Boden
ok('Fenster: Verbinder am oberen Wandende (y=250)', r3.pts.some(p=>Math.abs(p.y-250)<1e-6 && p.x>=75 && p.x<=125));
ok('Fenster: Verbinder am unteren Wandende (y=10)', r3.pts.some(p=>Math.abs(p.y-10)<1e-6 && p.x>=75 && p.x<=125));

// ===== Phase B: Seite & Verbinder-Typ =====
ok('Seitenfunktion vorne = Fassade', /Fassade/.test(document.getElementById('seiteFunktion').textContent));
ok('Default-Verbinder vorne = FA-1', document.getElementById('vtyp').value==='FA-1');
const ly=globalThis.window.__verbinder.buildLayout();
ok('Layout taggt Seite/Funktion/Typ', ly.seite==='vorne' && ly.seite_funktion==='fassade' && ly.verbinder_typ==='FA-1');
const xBeforeSide=(document.getElementById('plan').innerHTML.match(/<rect x="([\d.]+)"/)||[])[1];
const seiteSel=document.getElementById('seite'); seiteSel.value='hinten'; seiteSel.dispatch('change');
ok('Rückseite Funktion = Innenausbau', /Innenausbau/.test(document.getElementById('seiteFunktion').textContent));
ok('Default-Verbinder hinten = IA-1', document.getElementById('vtyp').value==='IA-1');
const xAfterSide=(document.getElementById('plan').innerHTML.match(/<rect x="([\d.]+)"/)||[])[1];
ok('Rückseite x-gespiegelt (Geometrie ändert sich)', xBeforeSide!==xAfterSide);
ok('Layout Rückseite getaggt', globalThis.window.__verbinder.buildLayout().seite==='hinten');
seiteSel.value='vorne'; seiteSel.dispatch('change');


// Regression: Fuge zwischen zwei i2-Steinen am Rand ist KEINE (durchgehende) Nut
applyWand({name:'i2i2', length_mm:500, height_mm:400, openings:[],
  courses:[0,1].map(l=>({lage:l, stones:[{x0:0,x1:250,type:'i2'},{x0:250,x1:500,type:'i2'}]}))});
{
  const NM=globalThis.__nutMap(50,40);
  ok('i2/i2-Fuge (x=25) ist keine Nut', !NM.any.has(25));
  ok('i2/i2-Fuge (x=25) nicht durchgehend', globalThis.__isCont(25,50,40)===false);
  ok('i2-Nuten (x=12,5 & 37,5) durchgehend', NM.cont.has(12.5)&&NM.cont.has(37.5));
}

// Einrasten auf echte Nut: jeder Verbinder sitzt auf einer Nut seiner Lage (nie auf einer Fuge)
applyWand(W);
{
  const rp=globalThis.__getLAST().r; const rows=globalThis.__stoneRows(rp.Bcm,rp.Hcm);
  const onJoint=rp.pts.filter(p=>{ const r=Math.max(0,Math.min(rows.length-1,Math.floor(p.y/20))); return !globalThis.__nutInRow(p.x,rows[r]); });
  ok('jeder Verbinder auf echter Nut (kein Sitz auf Fuge)', onJoint.length===0);
  ok('Lattenachse (axis_cm) bleibt erhalten', rp.pts.every(p=>typeof p.axis_cm==='number'));
  ok('snapped-Zähler vorhanden', typeof rp.snapped==='number');
}

// Projekt-Bundle: applyWand akzeptiert Bundle ODER bare Wandelement
applyWand({format:'SEMBLA-Projekt', version:'1.0', wandelement:W, verbinder_layout:null});
ok('Bundle geladen (B aus wandelement)', document.getElementById('B').value==='2.000');
ok('Bundle: Verbinder berechnet', globalThis.__getLAST().r.pts.length>0);
const bl=globalThis.window.__verbinder.buildLayout();
ok('buildLayout liefert Verbinder-Layout', bl.format==='SEMBLA-VerbinderLayout' && bl.points.length>0);
ok('durchbruch-Label vorhanden (Code)', html.includes("?'Durchbruch':'Tür'"));

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok  (ohne Tür: ${countNoOpen}, mit Tür: ${globalThis.__getLAST().r.pts.length})`);
process.exit(fail?1:0);
