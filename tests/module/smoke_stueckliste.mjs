// Smoke-Test Modul 4 (docs/stueckliste.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock. Der BOM-Baustein (semblaBom/semblaBomItems) + Storage werden — wie im Browser via
// window.SEMBLA — aus docs/shared/ bzw. per Mock bereitgestellt und vor __slInit() gebunden.
// Dämmung ist im MVP entfernt (wie Modul 2) — dafür gibt es keine Prüfungen mehr.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { semblaBom, semblaBomItems, semblaBomMenge } from "../../docs/shared/sembla-bom.js";

const html = readFileSync(new URL("../../docs/stueckliste.html", import.meta.url), "utf8");
// letztes klassisches (attributloses) <script> ist die App-Logik
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const script = scripts[scripts.length - 1][1];

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.listeners={};this.dataset={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelectorAll(){return [];} appendChild(){} click(){}}
const dv={proj:'P',qty:'1',cur:'EUR'};
const _e={}; const document={getElementById:id=>{let e=_e[id];if(!e){e=_e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement:()=>new El('a')};
globalThis.document=document; globalThis.window={}; globalThis.alert=m=>{globalThis.__alert=m;};
globalThis.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}}; globalThis.Blob=class{constructor(){}};
globalThis.FileReader=class{readAsText(){}};

// Storage-Mock: aktives Element vorhanden -> Modul lädt es beim Start.
const W=buildWall('Testwand', 2000, 2600, [new Opening(5,11,0,10,'tuer')]);
let _subs=[]; let _aktiv='w-1'; let _we=W;
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we, aktivesElement:()=>({name:'Testwand'}),
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
globalThis.window.SEMBLA={ semblaBom, semblaBomItems, semblaBomMenge, store:storeMock };

eval(script);
globalThis.window.__slInit();
const SL=globalThis.window.__sl;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// Start: aktives Element aus dem Storage geladen
ok('Start mit aktivem Element -> Wandelement geladen', SL.wall && SL.wall.length_mm===2000);

const rs=SL.rows();
const find=l=>rs.find(r=>r.label.includes(l));
ok('i3-Menge = bom.i3', find('i3').menge===W.bom.i3);
ok('i2-Menge = bom.i2', find('i2').menge===W.bom.i2);
const rodStd=rs.find(r=>r.key==='rod_std').menge, rodSonder=rs.find(r=>r.key==='rod_sonder').menge;
ok('Gewindestangen Standard+Sonderlänge = bom', rodStd+rodSonder===W.bom.gewindestangen);
ok('Spannplatten = bom', rs.find(r=>r.key==='spannplatte').menge===W.bom.spannplatten);
ok('Senkkopfschrauben = bom', rs.find(r=>r.key==='senkkopf').menge===W.bom.senkkopfschrauben);
ok('Stahlblech-Module = bom', rs.find(r=>r.key==='blech').menge===W.bom.stahlblech_module);
const dicht=rs.find(r=>r.key==='dicht');
ok('Dichtstreifen in m = bom/1000', dicht.unit==='m' && Math.abs(dicht.menge - W.bom.dichtstreifen_mm/1000)<0.01);
ok('GP = Menge × EP', Math.abs(find('i3').gp - find('i3').menge*find('i3').ep)<1e-9);
ok('12 Wandelement-Positionen (ohne Layout)', rs.length===12);

// Preis ändern wirkt
SL.setPrice('i3', 100);
ok('Preisänderung wirkt auf GP', SL.rows().find(r=>r.label.includes('i3')).gp===W.bom.i3*100);
SL.setPrice('i3', 9.5);

// Anzahl Wände multipliziert
document.getElementById('qty').value='3'; const r3=SL.rows();
ok('Anzahl Wände ×3', r3.find(r=>r.label.includes('i3')).menge===W.bom.i3*3);
document.getElementById('qty').value='1';

// Fläche zieht Öffnungen ab
const a=SL.area(W); const full=(W.length_mm/1000)*(W.height_mm/1000);
ok('Fläche < Bruttofläche (Öffnungen abgezogen)', a < full && a>0);

// Export-AOA hat Kopf + Summe
const {aoa}=SL.exportRows();
ok('Export: Titel + Summe', aoa[0][0].includes('Stückliste') && aoa.some(r=>r[0]==='Summe netto'));

// ungültig wirft
let threw=false; try{ SL.applyWand({x:1}); }catch(e){ threw=true; }
ok('ungültiges Wandelement wirft', threw);

// Verbinder-Layout laden -> Verbinder + Latten ergänzen (KEINE Dämmung mehr)
SL.applyWand(W); document.getElementById('qty').value='1';
const baseGrand=SL.rows().reduce((a,r)=>a+r.gp,0);
const axesX=[12.5,75,137.5,200,262.5]; const ys=[10,70,130,190,250]; const pts=[];
for(const x of axesX) for(const y of ys) pts.push({x_cm:x,y_cm:y,type:'C'});
const layout={ format:'SEMBLA-VerbinderLayout', verbinder_typ:'FA-2',
  wall:{B_cm:300,H_cm:260}, openings_cm:[{x0:50,x1:100,y0:0,y1:200,art:'tuer'}],
  points:pts };
SL.applyLayout(layout);
const rl=SL.rows();
ok('Verbinder-Position vorhanden', !!rl.find(r=>r.label.startsWith('Verbinder')));
ok('Verbinder-Menge = Punkte', rl.find(r=>r.label.startsWith('Verbinder')).menge===pts.length);
ok('Latten-Position vorhanden (Menge > 0)', !!rl.find(r=>r.label.includes('Holzlatte')) && rl.find(r=>r.label.includes('Holzlatte')).menge>0);
ok('KEINE Dämmung-Position mehr (MVP)', !rl.find(r=>r.label.includes('Dämmung')));
ok('Summe steigt durch Verbinder/Latten', SL.rows().reduce((a,r)=>a+r.gp,0) > baseGrand);
const {aoa:aoaL}=SL.exportRows();
ok('Export enthält Verbinder-Zeile', aoaL.some(r=>String(r[0]).startsWith('Verbinder')));
ok('Layout-Preis editierbar (latte)', (SL.setPrice('latte',5), SL.rows().find(r=>r.label.includes('Holzlatte')).ep===5));

// Projekt-Bundle: eine Datei liefert Wandelement + Verbinder-Layout automatisch
SL.applyWand({format:'SEMBLA-Projekt', version:'1.0', wandelement:W, verbinder_layout:layout});
ok('Bundle: Wandelement übernommen', SL.wall && SL.wall.length_mm===W.length_mm);
ok('Bundle: Verbinder-Layout automatisch übernommen', !!SL.layout && SL.rows().some(r=>r.label.startsWith('Verbinder')));
ok('Bundle: Latten aus Layout', SL.rows().some(r=>r.label.includes('Holzlatte')));

// Storage-Anbindung: externer Wechsel des aktiven Elements -> Modul lädt es (Layout wird zurückgesetzt)
const W2=buildWall('Fremdwand', 2500, 2000, []);
_aktiv='w-2'; _we=W2;
_subs.forEach(cb=>cb());   // abonniere-Callback feuern (wie storage._benachrichtige)
ok('externer Wechsel: Modul lädt neues aktives Wandelement', SL.wall && SL.wall.length_mm===2500);
ok('externer Wechsel: Layout zurückgesetzt (reiner Konsument)', SL.layout===null && !SL.rows().some(r=>r.label.startsWith('Verbinder')));

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
