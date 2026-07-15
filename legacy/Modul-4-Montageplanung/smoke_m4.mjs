import { readFileSync } from "node:fs";
const html = readFileSync("./SEMBLA_Montageplanung.html","utf8");
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
class El{ constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.max=1;this.className='';this.files=[];this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e,t){(this.listeners[e]||[]).forEach(f=>f(t||{target:this}));}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}}
const document={_e:{}, getElementById(id){return this._e[id]||(this._e[id]=new El(id));}, createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__printed=true;}}; globalThis.alert=()=>{};
eval(script);
const applyWand=globalThis.window.applyWand;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const W2=JSON.parse(readFileSync("./ref2.json","utf8"));
applyWand(W2);
ok('Übersicht Maße gesetzt', /m/.test(document.getElementById('ovDim').textContent));
ok('Raster/Lagen gesetzt', /13 Lagen/.test(document.getElementById('ovGrid').textContent));
ok('Status baubar', document.getElementById('ovBadge').textContent==='Baubar');
ok('Stückliste >=6 Zeilen', (document.getElementById('bom').innerHTML.match(/<tr>/g)||[]).length>=6);
ok('Vorspann-Schritte vorhanden', (document.getElementById('steps').innerHTML.match(/<li>/g)||[]).length>=5);
ok('Slider max = Lagen', +document.getElementById('slider').max===13);
ok('Lage-SVG gezeichnet', document.getElementById('lageSvg').innerHTML.length>200);
ok('Lage-SVG zeigt Strang-Marker + Position', /#1f6feb/.test(document.getElementById('lageSvg').innerHTML) && /Position ab links/.test(document.getElementById('lageSvg').innerHTML));
ok('Wandüberblick gezeichnet', document.getElementById('mapSvg').innerHTML.length>200);
// Navigation
document.getElementById('next').dispatch('click');
ok('Navigation: Lage 2', /Lage 2 von 13/.test(document.getElementById('lageLab').textContent));
// Druckdokument: alle Lagen
const pd=document.getElementById('printdoc').innerHTML;
ok('Druckdoc: Titel', /Montageanleitung/.test(pd));
ok('Druckdoc: alle 13 Lagen', (pd.match(/class="pcourse"/g)||[]).length===13);
// Fenster: Öffnung im Lagenstreifen sichtbar
const W3=JSON.parse(readFileSync("./ref3.json","utf8"));
applyWand(W3); document.getElementById('slider').dispatch('input',{target:{value:'7'}});
ok('Fenster: Öffnung im Lagenstreifen', /Fenster/.test(document.getElementById('lageSvg').innerHTML));
// Feature-Requests: Reihennummern + Bleche + neue BOM/Schritte
const map=document.getElementById('mapSvg').innerHTML;
ok('Wandkarte: Reihennummern (1..13)', /<text[^>]*>1<\/text>/.test(map) && /<text[^>]*>13<\/text>/.test(map));
ok('Wandkarte: Bodenblech/Anker gezeichnet', /#5b6673/.test(map));
ok('BOM: Senkkopfschrauben + Stahlblech-Module', /Senkkopfschrauben/.test(document.getElementById('bom').innerHTML) && /Stahlblech-Module/.test(document.getElementById('bom').innerHTML));
ok('Schritte: Bodenblech + Senkkopfschraube', /Bodenblech/.test(document.getElementById('steps').innerHTML) && /Senkkopfschraube/.test(document.getElementById('steps').innerHTML));
// Druck-Button
document.getElementById('print').dispatch('click');
ok('Druck ausgelöst', globalThis.__printed===true);
let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
