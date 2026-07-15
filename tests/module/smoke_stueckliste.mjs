// Smoke-Test Modul 4 (docs/stueckliste.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock. Die zentrale Positions-Rechnung (stuecklistePositionen) + Flaeche (wandflaeche) aus
// sembla-export und Storage werden — wie im Browser via window.SEMBLA — bereitgestellt und vor
// __slInit() gebunden. Neues Datenmodell: Preise/Anzahl/Waehrung leben in eingaben.kosten und
// werden via store.mergeEingaben zurueckgeschrieben; Verbinder/Latten kommen aus dem Wandaufbau.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { stuecklistePositionen, wandflaeche } from "../../docs/shared/sembla-export.js";
import { standardEingaben } from "../../docs/shared/storage.js";

const html = readFileSync(new URL("../../docs/stueckliste.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const script = scripts[scripts.length - 1][1];   // klassische App-Logik

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.listeners={};this.dataset={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelectorAll(){return [];} appendChild(){} click(){}}
const dv={proj:'SEMBLA-Projekt',qty:'1',cur:'EUR'};
const _e={}; const document={getElementById:id=>{let e=_e[id];if(!e){e=_e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement:()=>new El('a')};
globalThis.document=document; globalThis.window={}; globalThis.alert=m=>{globalThis.__alert=m;};
globalThis.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}}; globalThis.Blob=class{constructor(){}};
globalThis.FileReader=class{readAsText(){}};

// Deep-Merge wie in storage.js (fuer den mergeEingaben-Mock).
function merge(base, patch){
  if(patch===null||typeof patch!=='object'||Array.isArray(patch)) return patch;
  const out=(base&&typeof base==='object'&&!Array.isArray(base))?{...base}:{};
  for(const k of Object.keys(patch)) out[k]=merge(out[k],patch[k]);
  return out;
}
// Storage-Mock: aktives Element vorhanden -> Modul laedt es + Eingaben beim Start.
const W=buildWall('Testwand', 2000, 2600, [new Opening(5,11,0,10,'tuer')]);
let _subs=[]; let _aktiv='w-1'; let _we=W; let _eg=standardEingaben(); let _merges=[];
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we, aktiveEingaben:()=>_eg,
  mergeEingaben:(teil,patch)=>{ _merges.push([teil,patch]); _eg[teil]=merge(_eg[teil],patch); return _aktiv; },
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
globalThis.window.SEMBLA={ stuecklistePositionen, wandflaeche, store:storeMock };

eval(script);
globalThis.window.__slInit();
const SL=globalThis.window.__sl;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// Start: aktives Element + Eingaben geladen
ok('Start mit aktivem Element -> Wandelement geladen', SL.wall && SL.wall.length_mm===2000);
ok('Eingaben aus Storage geladen (Preise vorhanden)', SL.eingaben.kosten.preise.i3===9.5);

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

// Verbinder/Latten jetzt IMMER aus dem Wandaufbau (kein Bundle mehr noetig)
ok('Verbinder-Position vorhanden (aus Aufbau)', !!rs.find(r=>r.label.startsWith('Verbinder')) && rs.find(r=>r.label.startsWith('Verbinder')).menge>0);
ok('Latten-Position vorhanden (aus Aufbau)', !!rs.find(r=>r.label.includes('Holzlatte')) && rs.find(r=>r.label.includes('Holzlatte')).menge>0);
ok('KEINE Dämmung-Position (MVP)', !rs.find(r=>r.label.includes('Dämmung')));
ok('14 Positionen (12 Wand + Verbinder + Latte)', rs.length===14);

// Preis ändern wirkt + wird ins Datenmodell geschrieben
_merges=[];
SL.setPrice('i3', 100);
ok('Preisänderung wirkt auf GP', SL.rows().find(r=>r.label.includes('i3')).gp===W.bom.i3*100);
ok('Preisänderung -> mergeEingaben(kosten)', _merges.some(([t,p])=>t==='kosten' && p.preise && p.preise.i3===100));
ok('Preis im Datenmodell gespeichert', _eg.kosten.preise.i3===100);
SL.setPrice('i3', 9.5);

// Anzahl Wände multipliziert + persistiert
SL.setAnzahl(3);
const r3=SL.rows();
ok('Anzahl Wände ×3', r3.find(r=>r.label.includes('i3')).menge===W.bom.i3*3);
ok('Anzahl im Datenmodell', _eg.kosten.anzahl===3);
SL.setAnzahl(1);

// Währung persistiert (über Eingabefeld)
document.getElementById('cur').value='CHF'; document.getElementById('cur').dispatch('input');
ok('Währung -> mergeEingaben', _eg.kosten.waehrung==='CHF');
document.getElementById('cur').value='EUR'; document.getElementById('cur').dispatch('input');

// Projektname persistiert
document.getElementById('proj').value='Mein Projekt'; document.getElementById('proj').dispatch('input');
ok('Projektname -> mergeEingaben(projekt)', _eg.projekt.name==='Mein Projekt');

// Fläche zieht Öffnungen ab
const a=SL.area(W); const full=(W.length_mm/1000)*(W.height_mm/1000);
ok('Fläche < Bruttofläche (Öffnungen abgezogen)', a < full && a>0);

// ungültiges Wandelement wirft
let threw=false; try{ SL.applyWand({x:1}); }catch(e){ threw=true; }
ok('ungültiges Wandelement wirft', threw);

// Storage-Anbindung: externer Wechsel des aktiven Elements -> Modul lädt es + neue Eingaben
const W2=buildWall('Fremdwand', 2500, 2000, []);
_aktiv='w-2'; _we=W2; _eg=standardEingaben(); _eg.kosten.anzahl=5;
_subs.forEach(cb=>cb());   // abonniere-Callback feuern (wie storage._benachrichtige)
ok('externer Wechsel: Modul lädt neues aktives Wandelement', SL.wall && SL.wall.length_mm===2500);
ok('externer Wechsel: neue Eingaben übernommen (Anzahl 5)', SL.eingaben.kosten.anzahl===5);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
