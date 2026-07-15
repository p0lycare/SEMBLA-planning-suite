// Smoke-Test Modul 5 (docs/montage.html): evaluiert das klassische App-Skript unter einem DOM-Mock.
// BOM-Baustein (semblaBomItems/semblaBomMenge), Rechenkern (buildWall/Opening) + Storage werden —
// wie im Browser via window.SEMBLA — aus docs/shared/ bzw. per Mock bereitgestellt und vor __mInit()
// gebunden. Reiner Konsument: lädt das aktive Wandelement, schreibt es nie zurück.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { semblaBom, semblaBomItems, semblaBomMenge } from "../../docs/shared/sembla-bom.js";

const html = readFileSync(new URL("../../docs/montage.html", import.meta.url), "utf8");
// erstes attributloses <script> ist die App-Logik (das zweite ist type="module")
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.max=1;this.className='';this.checked=false;this.files=[];this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(){} click(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}}
const _e={}; const document={getElementById:id=>_e[id]||(_e[id]=new El(id)),createElement:()=>new El('_')};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__printed=true;}}; globalThis.alert=()=>{};
globalThis.FileReader=class{readAsText(){}};

// Testwände (baubar) — 2600 mm → 13 Lagen
const W  = buildWall('Testwand',  3000, 2600, [new Opening(6,12,0,10,'tuer')]);
const WF = buildWall('Fensterwand', 5000, 2600, [new Opening(6,12,3,9,'fenster')]);

// Storage-Mock: aktives Element vorhanden -> Modul lädt es beim Start; abonniere() für externen Wechsel.
let _subs=[]; let _aktiv='w-1'; let _we=W;
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we,
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
const fireStore=()=>_subs.forEach(cb=>cb());
globalThis.window.SEMBLA={ semblaBom, semblaBomItems, semblaBomMenge, buildWall, Opening, store:storeMock };

eval(script);
globalThis.window.__mInit();
const M=globalThis.window.__m;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const $=id=>document.getElementById(id);

// Start: aktives Element aus dem Storage geladen
ok('Start mit aktivem Element -> Wandelement geladen', M.wall && M.wall.length_mm===3000);
ok('Übersicht Maße gesetzt', /m/.test($('ovDim').textContent));
ok('Raster/Lagen gesetzt (13 Lagen)', /13 Lagen/.test($('ovGrid').textContent));
ok('Status baubar', $('ovBadge').textContent==='Baubar');
ok('Vorspannstränge-Zahl gesetzt', +$('ovCols').textContent===W.tension_columns.length);

// Kurz-Stückliste kommt aus dem geteilten BOM-Baustein (Single Source) — konsistent zu Modul „Stückliste"
const bomHtml=$('bom').innerHTML;
ok('Stückliste: Steine i3 + i2', /Stein i3/.test(bomHtml) && /Stein i2/.test(bomHtml));
const expItems=semblaBomItems(W).filter(it=>it.menge>0);
ok('Stückliste: Zeilenzahl = BOM-Baustein (menge>0)', (bomHtml.match(/<tr>/g)||[]).length===expItems.length);
const i3It=expItems.find(it=>it.key==='i3');
ok('Stückliste: i3-Menge = semblaBom (Konsistenz)', bomHtml.includes('<td>'+i3It.label+'</td><td>'+semblaBomMenge(i3It)+'</td>'));

// Vorspann-Schritte
ok('Vorspann-Schritte >=5', ($('steps').innerHTML.match(/<li>/g)||[]).length>=5);
ok('Schritte: Bodenblech + Senkkopfschraube', /Bodenblech/.test($('steps').innerHTML) && /Senkkopfschraube/.test($('steps').innerHTML));

// Lagen-Visualisierung
ok('Slider max = Lagen', +$('slider').max===13);
ok('Lage-SVG gezeichnet', $('lageSvg').innerHTML.length>200);
ok('Lage-SVG zeigt Strang-Marker + Position', /#1f6feb/.test($('lageSvg').innerHTML) && /Position ab links/.test($('lageSvg').innerHTML));
ok('Wandüberblick gezeichnet', $('mapSvg').innerHTML.length>200);
const map=$('mapSvg').innerHTML;
ok('Wandkarte: Reihennummern (1..13)', /<text[^>]*>1<\/text>/.test(map) && /<text[^>]*>13<\/text>/.test(map));
ok('Wandkarte: Bodenblech/Anker gezeichnet', /#5b6673/.test(map));

// Navigation
$('next').dispatch('click');
ok('Navigation: Lage 2', /Lage 2 von 13/.test($('lageLab').textContent));
$('slider').value='5'; $('slider').dispatch('input');
ok('Slider setzt Lage 5', /Lage 5 von 13/.test($('lageLab').textContent));

// Druckdokument: alle Lagen
const pd=$('printdoc').innerHTML;
ok('Druckdoc: Titel', /Montageanleitung/.test(pd));
ok('Druckdoc: alle 13 Lagen', (pd.match(/class="pcourse"/g)||[]).length===13);

// Storage-Sync: externer Wechsel auf neues aktives Element -> Ansicht folgt (ohne Datei)
_aktiv='w-2'; _we=WF; fireStore();
ok('Store-Sync: neues aktives Element geladen', M.wall && M.wall.length_mm===5000);

// Fenster: Öffnung im Lagenstreifen sichtbar (WF-Fenster in Lagen 3..8)
$('slider').value='6'; $('slider').dispatch('input');
ok('Fenster: Öffnung im Lagenstreifen', /Fenster/.test($('lageSvg').innerHTML));

// Druck-Button
$('print').dispatch('click');
ok('Druck ausgelöst', globalThis.__printed===true);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
