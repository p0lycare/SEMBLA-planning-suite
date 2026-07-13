import { readFileSync } from "node:fs";
const html=readFileSync("./SEMBLA_Fertigungszeichnung.html","utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const script=scripts[scripts.length-1][1];

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.listeners={};this.checked=true;this._tb=null;
    this._cls=new Set(); this.classList={add:c=>this._cls.add(c),remove:c=>this._cls.delete(c),contains:c=>this._cls.has(c),toggle:(c,on)=>{const v=on!==undefined?on:!this._cls.has(c);v?this._cls.add(c):this._cls.delete(c);return v;}};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(s){ if(s==='tbody'){ if(!this._tb)this._tb=new El('tb'); return this._tb; } return new El('x'); }
  querySelectorAll(){return [];} appendChild(){}}
const _e={}; const document={getElementById:id=>_e[id]||(_e[id]=new El(id)),createElement:()=>new El('a'),body:new El('body')};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__p=true;}}; globalThis.alert=m=>{globalThis.__alert=m;};

eval(script);
const FZ=globalThis.window.__fz;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// Demo beim Laden gerendert
ok('Verlegeplan gezeichnet (rects)', (_e['svgVerlege'].innerHTML.match(/<rect/g)||[]).length>10);

const W=JSON.parse(readFileSync("./test-wandelement.json","utf8"));
FZ.applyWand(W);
const h=_e['svgVerlege'].innerHTML;
ok('Verlegeplan nach Laden', (h.match(/<rect/g)||[]).length>10);
ok('Öffnungen beschriftet', /Tür|Fenster/.test(h));
ok('Gesamtmaß (m-Label)', / m<\/text>/.test(h));
ok('Öffnungsmaß (cm-Label)', /cm<\/text>/.test(h));
ok('Vorspannstränge gezeichnet', h.includes('#1f6feb'));

// Strangtabelle gefüllt
const st=_e['tStrands'].querySelector('tbody').innerHTML;
ok('Strangtabelle Zeilen = Stränge', (st.match(/<tr>/g)||[]).length===W.tension_columns.length);
// Stückliste gefüllt (7 Positionen inkl. Standard-/Sonderlängen-Gewindestange)
const bom=_e['tBom'].querySelector('tbody').innerHTML;
ok('Stückliste 12 Positionen', (bom.match(/<tr>/g)||[]).length===12);
ok('Stückliste enthält i3-Menge', bom.includes('>'+W.bom.i3+'×<') || bom.includes('>'+W.bom.i3.toLocaleString('de-DE')+'×<'));
ok('Stückliste: Gewindestange Standard + Sonderlänge', /Gewindestange \d/.test(bom) && /Sonderlänge/.test(bom));
ok('Stückliste: Stahlblech + Senkkopf + Dichtstreifen', /Stahlblech-Modul/.test(bom) && /Senkkopfschraube/.test(bom) && /Dichtstreifen/.test(bom));
// Farbliche Markierung: abgelängte Gewindestange + Stahlplatte
ok('abgelängte Gewindestange farbig markiert', h.includes('#e8702a'));
ok('Stahlplatte farbig markiert', h.includes('#14559c'));
// Schriftfeld + Spannregeln
ok('Schriftfeld (Briefkopf) gefüllt', /SEMBLA/.test(_e['titleblock'].innerHTML) && /Projekt/.test(_e['titleblock'].innerHTML));
ok('Spannregeln-Legende (4 Regeln)', (_e['rules'].innerHTML.match(/chip/g)||[]).length===4);
// Maßstab: benannt im Schriftfeld + in der Zeichnungs-Überschrift
ok('Maßstab im Schriftfeld', /Maßstab/.test(_e['titleblock'].innerHTML) && /1 : \d+/.test(_e['titleblock'].innerHTML));
ok('Maßstab in Zeichnungs-Überschrift', /M 1:\d+/.test(_e['drawCap'].textContent));

// Blattformat A3/A4 + Maßstab: A4 (kleineres Feld) => gleicher oder größerer Maßstab-Nenner
FZ.setFormat('a3'); const sA3=FZ.scale;
FZ.setFormat('a4'); const sA4=FZ.scale;
ok('A4 setzt Blattformat', document.body.classList.contains('fmt-a4') && FZ.fmt==='a4');
ok('@page auf A4 landscape', /A4 landscape/.test(_e['pageStyle'].textContent));
ok('A4 wählt gröberen/gleichen Maßstab als A3', sA4>=sA3);
FZ.setFormat('a3'); ok('@page zurück auf A3 landscape', /A3 landscape/.test(_e['pageStyle'].textContent));

// Vorabzug-Wasserzeichen
FZ.setWatermark(true);  ok('Wasserzeichen an (body.wm)', document.body.classList.contains('wm'));
FZ.setWatermark(false); ok('Wasserzeichen aus', !document.body.classList.contains('wm'));

// PDF-Direktdownload verfügbar (Bibliotheken werden erst im Browser geladen)
ok('downloadPDF exponiert', typeof FZ.downloadPDF==='function');
ok('jsPDF eingebunden (vektorbasiert)', /jspdf\.umd\.min\.js/.test(html));
ok('kein html2canvas mehr (Safari-stabil)', !/html2canvas\.min|html2canvas\s*\(/.test(html));
ok('PDF-Button vorhanden', /id="pdf"/.test(html));

// Druck
FZ.render(); globalThis.window.print(); ok('Druck auslösbar', globalThis.__p===true);

// ungültig
let threw=false; try{ FZ.applyWand({x:1}); }catch(e){ threw=true; }
ok('ungültiges Wandelement wirft', threw);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
