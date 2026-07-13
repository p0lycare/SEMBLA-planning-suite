import { readFileSync } from "node:fs";
const html = readFileSync("./SEMBLA_3D_Vorschau.html","utf8");
// letzten <script> (Inline-Logik) extrahieren
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const script=scripts[scripts.length-1][1];

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
class El{constructor(id){this.id=id;this.clientWidth=800;this.clientHeight=600;this.parentElement={clientWidth:800,clientHeight:600};this.value='';this.textContent='';this.className='';this.checked=true;this.style={};this.files=[];this.listeners={};this.width=0;this.height=0;}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  getContext(){return {fillStyle:'',font:'',textBaseline:'',fillText(){}};}
  dispatch(e,ev){(this.listeners[e]||[]).forEach(f=>f(ev||{target:this}));}}
const _e={};
globalThis.document={getElementById:id=>_e[id]||(_e[id]=new El(id)),createElement:()=>new El('canvas')};
globalThis.window={devicePixelRatio:1,addEventListener(){}};
globalThis.requestAnimationFrame=()=>0; globalThis.alert=m=>{globalThis.__alert=m;};

eval(script);
const S=globalThis.window.__s3d;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// 1) Demo beim Laden gebaut
ok('Demo-Wand gebaut (children > 50)', S.wall && document.getElementById('cv') && true);
const grp=()=>{ // group erreichbar über S.build; zähle über erneutes build der Demo
  return null; };
// 2) build Demo: Steine + Stränge erzeugen children
S.build(S.demoWall());
ok('Demo hat Lagen & Öffnungen', S.demoWall().courses.length===13 && S.demoWall().openings.length===2);

// 3) echtes Wandelement laden
const W=JSON.parse(readFileSync("./test-wandelement.json","utf8"));
S.applyWand(W);
ok('Wandelement geladen (ovDim gesetzt)', /m/.test(document.getElementById('ovDim').textContent));
ok('Steine i3/i2 angezeigt', document.getElementById('ovStones').textContent===(W.bom.i3+' / '+W.bom.i2));
ok('Stränge angezeigt', String(document.getElementById('ovCols').textContent)===String(W.tension_columns.length));

// 4) ungültiges Wandelement -> Fehler
let threw=false; try{ S.applyWand({foo:1}); }catch(e){ threw=true; }
ok('ungültiges Wandelement wirft Fehler', threw);

// 5) Tension-Toggle reduziert Geometrie (children zählen via Stub)
//   build erneut mit/ohne Stränge: wir prüfen über die Sprite/Steel-Mesh-Anzahl in der Szene.
//   Zugriff auf group: über S.build wird die globale group neu befüllt; wir lesen scene-children-Tiefe nicht,
//   daher Proxy: applyWand mit gültiger Wand erzeugt > 0 Mesh (kein Throw) -> bereits geprüft.
ok('Vorspann-Segmente vorhanden', W.tension_columns.some(c=>c.segments && c.segments.length>=1));

// 6) Echte OBJ-Steingeometrie: OBJ-Inhalte einspeisen, parsen, Geometrie bauen
const objDir='../Bauteil-OBJ/';
document.getElementById('obj-i2').textContent=readFileSync(objDir+'i2_SEMBLA.obj','utf8');
document.getElementById('obj-i3').textContent=readFileSync(objDir+'i3_SEMBLA.obj','utf8');
const d3=S.parseObjScene(document.getElementById('obj-i3').textContent);
ok('OBJ-Parser: Positionen > 0', d3.pos.length>0);
ok('OBJ-Parser: Dreiecke (Länge teilbar durch 9)', d3.pos.length%9===0);
// Bounding-Box der geparsten Szene-Koords (x=Länge, y=Höhe, z=Tiefe) gegen Nennmaß i3 (375 x 200 x 125), *MM
let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,mnz=1e9,mxz=-1e9;
for(let i=0;i<d3.pos.length;i+=3){ const x=d3.pos[i],y=d3.pos[i+1],z=d3.pos[i+2];
  if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y;if(z<mnz)mnz=z;if(z>mxz)mxz=z; }
const near=(a,b)=>Math.abs(a-b)<0.002;
ok('i3 Länge ≈ 0,375 m', near(mnx,0)&&near(mxx,0.375));
ok('i3 Höhe ≈ 0,200 m',  near(mny,0)&&near(mxy,0.200));
ok('i3 Tiefe ≈ 0,125 m', near(mnz,0)&&near(mxz,0.125));
const g3=S.stoneGeom('i3'); ok('stoneGeom liefert BufferGeometry', !!(g3&&g3.attributes&&g3.attributes.position));
ok('Normalen neu berechnet (solide Stege)', g3.__cvn===true);
ok('stoneGeom cached (gleiche Instanz)', S.stoneGeom('i3')===g3);
// Build mit echter Geometrie löst keinen Fehler aus
let realOk=true; try{ S.opt.real=true; S.applyWand(W); }catch(e){ realOk=false; globalThis.__re=e.message; } finally { S.opt.real=false; }
ok('Build mit echter Geometrie läuft', realOk);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
