// Smoke-Test Modul 6 (docs/ifc-3d.html): evaluiert das klassische App-Skript unter einem
// DOM- und THREE-Stub. Shared-Code (buildWall/Opening/store) wird — wie im Browser via
// window.SEMBLA — aus docs/shared/ bzw. per Mock bereitgestellt und vor __ifcInit()
// gebunden. Reiner Konsument: lädt das aktive Wandelement, schreibt es nie zurück.
// Prüft: Store-Anbindung, 3D-Aufbau (Stub), OBJ-Loader über storage.js, echte Steingeometrie.
// (Der IFC4-Export läuft zentral über die Startseite, nicht mehr in Modul 6.)
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { topLagen, oberkantenAbschnitte, lagenKantenVonWand, lagenOberkanteMm }
  from "../../docs/shared/sembla-montage.js";
import { wandelementToIfc } from "../../docs/shared/sembla-ifc.js";
import { createHash } from "node:crypto";
import { semblaBom } from "../../docs/shared/sembla-bom.js";

const html = readFileSync(new URL("../../docs/ifc-3d.html", import.meta.url), "utf8");
// erstes attributloses <script> ist die App-Logik (obj-Halter=type, three=src, letztes=type=module)
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// --- THREE-Stub ---
class V3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}}
class Obj{constructor(){this.position=new V3();this.scale=new V3(1,1,1);this.children=[];}add(o){this.children.push(o);}remove(o){const i=this.children.indexOf(o);if(i>=0)this.children.splice(i,1);}copy(){return this;}}
const THREE={
  WebGLRenderer:class{constructor(){}setPixelRatio(){}setSize(){}render(){}},
  Scene:class extends Obj{},
  PerspectiveCamera:class extends Obj{constructor(){super();this.aspect=1;}updateProjectionMatrix(){}lookAt(){}},
  HemisphereLight:class extends Obj{}, DirectionalLight:class extends Obj{},
  Group:class extends Obj{},
  BoxGeometry:class{constructor(w,h,d){this.w=w;this.h=h;this.d=d;}},
  EdgesGeometry:class{constructor(){}},
  Mesh:class extends Obj{constructor(g,m){super();this.geometry=g;this.material=m;this.__kind='mesh';}},
  LineSegments:class extends Obj{constructor(){super();this.__kind='edge';}},
  LineBasicMaterial:class{constructor(){}}, MeshStandardMaterial:class{constructor(o){Object.assign(this,o);}},
  SpriteMaterial:class{constructor(){}}, Sprite:class extends Obj{constructor(){super();this.__kind='sprite';}},
  CanvasTexture:class{constructor(){}}, GridHelper:class extends Obj{constructor(){super();this.__kind='grid';}},
  BufferGeometry:class{constructor(){this.attributes={};}setAttribute(n,a){this.attributes[n]=a;}computeVertexNormals(){this.__cvn=true;}},
  BufferAttribute:class{constructor(arr,itemSize){this.array=arr;this.itemSize=itemSize;this.count=arr.length/itemSize;}},
  DoubleSide:2, FrontSide:0,
  Vector3:V3
};
globalThis.THREE=THREE;

// --- DOM-Stub ---
class El{constructor(id){this.id=id;this.clientWidth=800;this.clientHeight=600;this.parentElement={clientWidth:800,clientHeight:600};this.value='';this.textContent='';this._h='';this.className='';this.checked=false;this.files=[];this.listeners={};this.width=0;this.height=0;this.style={};this.href='';this.download='';}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  getContext(){return {fillStyle:'',font:'',textBaseline:'',fillText(){}};}
  setAttribute(){} click(){this.__clicked=true;} remove(){}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  dispatch(e,ev){(this.listeners[e]||[]).forEach(f=>f(ev||{target:this}));}}
const _e={};
globalThis.document={getElementById:id=>_e[id]||(_e[id]=new El(id)),createElement:()=>new El('_'),body:{appendChild(){},}};
globalThis.window={devicePixelRatio:1,addEventListener(){},print(){}};
globalThis.requestAnimationFrame=()=>0; globalThis.alert=m=>{globalThis.__alert=m;};
globalThis.Blob=class{constructor(parts){this.parts=parts;}}; globalThis.URL.createObjectURL=()=>'blob:x'; globalThis.URL.revokeObjectURL=()=>{};

// --- Shared via window.SEMBLA (wie im Browser) ---
// Kopfblech-Referenzfall (#92): seit dem Spannplatten-Default ([A-2]) wird `top_connection`
// hier AUSGESPROCHEN — die Kopfblech-Pruefungen unten messen genau diesen Fall weiter.
const W  = buildWall('IW-01', 3000, 2600, [new Opening(4,8,0,10,'tuer')], {vorne:{funktion:'fassade'},hinten:{funktion:'innenausbau'}}, {top_connection:'blech'});
const WF = buildWall('Fensterwand', 5000, 2600, [new Opening(6,12,3,9,'fenster')]);

// Storage-Mock inkl. OBJ-Schicht (setzeObj/holeObj/loescheObj)
let _subs=[]; let _aktiv='w-1'; let _we=W; const _obj={i2:null,i3:null};
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we,
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; },
  holeObj:(t)=>_obj[t], setzeObj:(t,v)=>{_obj[t]=v;}, loescheObj:(t)=>{_obj[t]=null;} };
const fireStore=()=>_subs.forEach(cb=>cb());

globalThis.window.SEMBLA={ buildWall, Opening, store:storeMock, topLagen, oberkantenAbschnitte,
  lagenKanten: lagenKantenVonWand, lagenOberkanteMm };

eval(script);
globalThis.window.__ifcInit();
const A=globalThis.window.__ifc;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const $=id=>document.getElementById(id);

// #72: der einleitende Beschreibungsabsatz ist ersatzlos entfallen (samt totem CSS).
ok('[#72] kein einleitender intro-Absatz mehr auf der Seite',
  !/class="intro"/.test(html) && !/\.intro\b/.test(html));

// Start: aktives Element aus dem Storage geladen + 3D gebaut
ok('Start mit aktivem Element -> Wandelement geladen', A.wall && A.wall.length_mm===3000);
ok('Übersicht Maße gesetzt', /m/.test($('ovDim').textContent));
ok('Steine i3/i2 angezeigt', $('ovStones').textContent===(W.bom.i3+' / '+W.bom.i2));
ok('Vorspannstränge-Zahl gesetzt', String($('ovCols').textContent)===String(W.tension_columns.length));

// ungültiges Wandelement -> Fehler
let threw=false; try{ A.applyWand({foo:1}); }catch(e){ threw=true; } A.applyWand(W);
ok('ungültiges Wandelement wirft Fehler', threw);

// OBJ-Loader über storage.js: OBJ-Texte einspeisen, echte Geometrie bauen.
// Die realen Bauteil-Modelle (Bauteil-OBJ/) sind vertraulich, gitignored und NICHT im Repo — der
// Test darf sie nicht benötigen. Stattdessen eine minimale synthetische Quader-Geometrie je Steintyp:
// OBJ-Koords x=Länge, y=Tiefe (125 mm), z=Höhe (200 mm). Der Parser tauscht Y/Z ->
// Szene-Koords x=Länge, y=Höhe (0,200 m), z=Tiefe (0,125 m). So bleiben Parser, Dreiecksgeometrie,
// erwartete i3-Abmessungen, stoneGeom/Caching und der Real-Geometrie-Build sinnvoll geprüft.
function boxObj(laenge_mm){
  const x=laenge_mm, y=125, z=200;   // objY -> Szene-Tiefe, objZ -> Szene-Höhe
  const v=[[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]];  // 8 Ecken (mm)
  const f=[[1,2,3,4],[5,6,7,8],[1,2,6,5],[4,3,7,8],[1,4,8,5],[2,3,7,6]];      // 6 Quads -> 12 Dreiecke
  return v.map(p=>'v '+p.join(' ')).join('\n')+'\n'+f.map(q=>'f '+q.join(' ')).join('\n')+'\n';
}
const objI3=boxObj(375);   // i3 = 37,5 cm
const objI2=boxObj(250);   // i2 = 25 cm
A.OBJTEXT.i2=objI2; A.OBJTEXT.i3=objI3;

const d3=A.parseObjScene(objI3);
ok('OBJ-Parser: Positionen > 0', d3.pos.length>0);
ok('OBJ-Parser: Dreiecke (Länge teilbar durch 9)', d3.pos.length%9===0);
let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,mnz=1e9,mxz=-1e9;
for(let i=0;i<d3.pos.length;i+=3){ const x=d3.pos[i],y=d3.pos[i+1],z=d3.pos[i+2];
  if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y;if(z<mnz)mnz=z;if(z>mxz)mxz=z; }
const near=(a,b)=>Math.abs(a-b)<0.002;
ok('i3 Länge ≈ 0,375 m', near(mnx,0)&&near(mxx,0.375));
ok('i3 Höhe ≈ 0,200 m',  near(mny,0)&&near(mxy,0.200));
ok('i3 Tiefe ≈ 0,125 m', near(mnz,0)&&near(mxz,0.125));
const g3=A.stoneGeom('i3');
ok('stoneGeom liefert BufferGeometry', !!(g3&&g3.attributes&&g3.attributes.position));
ok('Normalen neu berechnet (solide Stege)', g3.__cvn===true);
ok('stoneGeom cached (gleiche Instanz)', A.stoneGeom('i3')===g3);
// Build mit echter Geometrie löst keinen Fehler aus
let realOk=true; try{ A.opt.real=true; A.build(W); }catch(e){ realOk=false; globalThis.__re=e.message; } finally { A.opt.real=false; A.build(W); }
ok('Build mit echter Geometrie läuft', realOk);

// Storage-Sync: externer Wechsel auf neues aktives Element -> Ansicht folgt (ohne Datei)
_aktiv='w-2'; _we=WF; fireStore();
ok('Store-Sync: neues aktives Element geladen', A.wall && A.wall.length_mm===5000);

// --- Kopfblech folgt der gestaffelten Wandoberkante (Issue #24) -------------
// Das Kopfblech ist KEIN durchgehender Quader auf der Maximalhoehe: es liegt in
// horizontalen Abschnitten auf der jeweils tatsaechlich gebauten lokalen Oberkante
// ([A-1]/[D-4]). Geprueft werden Anzahl, Laenge und Hoehe fuer Rechteck- UND
// Staffelwand, die Summenparitaet zu top_plate/BOM und der Fall Spannplatte.
// Testwaende sind synthetisch aus dem Core -> checkout-autark, keine Bauteil-OBJ.
{
  // Rechteckwand: unveraendert genau EIN Segment ueber die volle Laenge auf H
  const segR=A.kopfblechSegmente(W);
  ok('Rechteck: genau ein Kopfblech-Segment', segR.length===1);
  ok('Rechteck: Segment ueber die volle Wandlaenge auf der Wandhoehe',
    segR[0].x0_mm===0 && segR[0].x1_mm===W.length_mm && segR[0].hoehe_mm===W.height_mm);

  // Musterwand AWG: vier Hoehen 2600/2200/1800/1400
  // Ebenfalls ausdruecklich Kopfblech (#92).
  const W4=buildWall('AWG vier Stufen',4000,2600,[],null,{top_connection:'blech'},[
    {x0_mm:1000,x1_mm:2000,height_mm:2200},
    {x0_mm:2000,x1_mm:3000,height_mm:1800},
    {x0_mm:3000,x1_mm:4000,height_mm:1400}]);
  const seg4=A.kopfblechSegmente(W4);
  ok('Staffelwand: vier Kopfblech-Segmente (eines je lokaler Oberkante)', seg4.length===4);
  ok('Staffelwand: Segmenthoehen 2600/2200/1800/1400',
    seg4.map(s=>s.hoehe_mm).join(',')==='2600,2200,1800,1400');
  ok('Staffelwand: Segmentgrenzen lueckenlos 0/1000/2000/3000/4000',
    seg4[0].x0_mm===0 && seg4[3].x1_mm===4000
    && seg4.every((s,i)=>i===0||s.x0_mm===seg4[i-1].x1_mm));
  ok('Staffelwand: kein schwebendes/ueberragendes Segment (Hoehe == lokale Oberkante jeder Spalte)',
    (()=>{ const tl=topLagen(W4),G=W4.grid_mm,C=W4.course_mm;
      return seg4.every(s=>{ for(let k=s.x0_mm/G;k<s.x1_mm/G;k++) if(tl[k]*C!==s.hoehe_mm) return false; return true; }); })());
  const summe4=seg4.reduce((a,s)=>a+(s.x1_mm-s.x0_mm),0);
  // Bei lueckenloser Staffelung ist die Summe der lokalen Oberkanten gleich der Wandlaenge —
  // der Fehler steckt in HOEHE und ANZAHL, nicht in der Gesamtlaenge. Die echte Verkuerzung
  // pruefen der Nullhoehen-Fall in test-montage.mjs und die Hoehenzusicherung oben.
  ok('Staffelwand: Summe der Segmentlaengen == top_plate.laenge_mm (dieselbe Konturdefinition wie BOM)',
    summe4===W4.top_plate.laenge_mm);
  ok('Staffelwand: Modulzahl aus den Segmenten == BOM-Kopfblechmodule',
    Math.ceil(summe4/W4.prestress.blech_mm)===semblaBom(W4).stahlblech_module_kopf);
  ok('Staffelwand: oberkantenAbschnitte ist die gemeinsame Quelle (keine zweite Kontur)',
    JSON.stringify(seg4.map(s=>[s.x0_mm,s.x1_mm,s.hoehe_mm]))
      ===JSON.stringify(oberkantenAbschnitte(W4).map(a=>[a.x0_mm,a.x1_mm,a.hoehe_mm])));

  // Spannplatte: gar kein Kopfblech
  const W4sp=buildWall('AWG Spannplatte',4000,2600,[],null,{top_connection:'spannplatte'},W4.steps);
  ok('top_connection=spannplatte erzeugt kein Kopfblech-Segment',
    A.kopfblechSegmente(W4sp).length===0 && W4sp.top_plate===null);

  // 3D-Aufbau laeuft mit Staffelwand und zaehlt die Bleche wie erwartet
  let bOk=true; try{ A.build(W4); }catch(e){ bOk=false; globalThis.__b4=e.message; }
  ok('Build der Staffelwand laeuft fehlerfrei', bOk);
  ok('Bodenblech bleibt wandlang und unveraendert (ein Segment)',
    A.bodenblechSegmente(W4).length===1
    && A.bodenblechSegmente(W4)[0].x1_mm===W4.base_plate.laenge_mm);
  A.build(W);
}


// --- #136 Ausgleichslage in IFC und 3D-Vorschau --------------------------------
// Die obere Ausgleichslage ist eine ECHTE Lage mit eigener Hoehe. IFC-Export und 3D-Aufbau
// duerfen dafuer keine 200-mm-Ersatzgeometrie mehr erzeugen; einzige Quelle sind die
// kanonischen Lagenkanten des Wandelements ([D-4]).
{
  // Normalisierte IFC-Zeichenkette: GUIDs und Zeitstempel sind je Lauf neu und tragen keine
  // Aussage — alles andere (Koordinaten, Hoehen, Reihenfolge) wird eingefroren.
  const normIfc = t => t.replace(/'[0-9A-Za-z_$]{22}'/g, "'GUID'")
                        .replace(/'\d{4}-\d\d-\d\dT[\d:]+'/g, "'TS'");
  const sha = t => createHash('sha256').update(normIfc(t)).digest('hex');

  // (a) Referenzwand 2600 mm: bit-genau der Stand VOR dem Umbau (Hash vor der Aenderung
  //     eingefroren). Eine reine 200-mm-Wand darf sich durch #136 nicht bewegen.
  ok('[#136] IFC der 2600-mm-Referenzwand bleibt wertgleich zum Stand vor dem Umbau',
    sha(wandelementToIfc(W)) === '2afdf03a03c8021a58944bcfbce37d188fc3ab7b446a4889453836e2452145a8');

  // (b) 2570-mm-Wand: 12 regulaere Lagen + genau eine Ausgleichslage 2400…2570.
  const WA = buildWall('Ausgleichswand', 3000, 2570, [], null, null, [], null, true);
  const AGC = WA.courses[WA.courses.length - 1];
  ok('[#136] Testwand hat genau eine Ausgleichslage 2400…2570 mm',
    AGC.ausgleich === true && AGC.unterkante_mm === 2400 && AGC.oberkante_mm === 2570
    && AGC.hoehe_mm === 170 && WA.courses.filter(c => c.ausgleich).length === 1);

  const ifcA = wandelementToIfc(WA);
  // Jeder Stein der Ausgleichslage steht bei z = 2,400000 m und ist 0,170000 m hoch.
  const platz = (ifcA.match(/IFCCARTESIANPOINT\(\([-\d.]+,[-\d.]+,2\.400000\)\)/g) || []).length;
  const hoehen = (ifcA.match(/IFCEXTRUDEDAREASOLID\([^)]*,0\.170000\)/g) || []).length;
  ok('[#136] IFC: oberste Steinreihe steht auf z = 2400 mm', platz === AGC.stones.length);
  ok('[#136] IFC: oberste Steinreihe ist 170 mm hoch (keine 200-mm-Ersatzgeometrie)',
    hoehen === AGC.stones.length);
  ok('[#136] IFC: keine Steingeometrie oberhalb der realen Wandoberkante',
    !/IFCCARTESIANPOINT\(\([-\d.]+,[-\d.]+,2\.[5-9]\d{5}\)\)/.test(ifcA));

  // Mit echter OBJ-Geometrie bleibt die Ausgleichslage der Quader mit realer Hoehe (der
  // hinterlegte OBJ-Stein ist ein voller Regelstein und waere hier das falsche Bauteil).
  const ifcReal = wandelementToIfc(WA, { realGeom: true, objText: { i2: objI2, i3: objI3 } });
  ok('[#136] IFC mit echter Geometrie: Ausgleichslage bleibt realer Quader',
    (ifcReal.match(/IFCEXTRUDEDAREASOLID\([^)]*,0\.170000\)/g) || []).length === AGC.stones.length);

  // (c) 3D-Vorschau: dieselbe Quelle. Steinquader der Ausgleichslage liegen auf 2400 mm und
  //     sind 170 mm hoch; die Regellagen bleiben bit-genau bei `lage x 200 mm`.
  A.opt.real = false; A.build(W);
  // Nur die STEINE (Materialfarbe i3/i2) — Bleche, Stangen und Spannplatten haengen in
  // derselben Gruppe und haben eine eigene Hoehe.
  const STEINFARBEN = new Set([0xcfd3d8, 0xaab0b8]);
  const steine = g => g.children.filter(o => o.__kind === 'mesh' && o.geometry && o.geometry.h
    && o.material && STEINFARBEN.has(o.material.color));
  const nah = (a, b) => Math.abs(a - b) < 1e-9;
  {
    const grp = A.gruppe;
    const s200 = steine(grp);
    ok('[#136] 3D: reine 200-mm-Wand unveraendert (Hoehe 0,200 m, Mitte auf lage x 200 + 100)',
      s200.length > 0 && s200.every(m => nah(m.geometry.h, 0.2))
      && W.courses.every(c => c.stones.every(st =>
        s200.some(m => nah(m.position.y, (c.lage * 200 + 100) * 0.001)
                    && nah(m.position.x, (st.x0 + (st.x1 - st.x0) / 2) * 0.001)))));
  }
  A.build(WA);
  {
    const s = steine(A.gruppe);
    const oben = s.filter(m => nah(m.geometry.h, 0.17));
    ok('[#136] 3D: oberste Steinreihe 170 mm hoch, Mitte bei 2485 mm',
      oben.length === AGC.stones.length && oben.every(m => nah(m.position.y, 2.485)));
    ok('[#136] 3D: keine 200-mm-Ersatzgeometrie oberhalb 2400 mm',
      !s.some(m => nah(m.geometry.h, 0.2) && m.position.y > 2.4));
    ok('[#136] 3D: kein Steinquader ragt ueber die reale Wandoberkante',
      s.every(m => m.position.y + m.geometry.h / 2 <= 2.570 + 1e-9));
  }
  A.build(W);
}

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
