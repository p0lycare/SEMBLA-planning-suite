// Smoke-Test Modul 1 (docs/wandplanung.html): evaluiert das klassische App-Skript unter
// einem DOM-Mock. Rechenkern/Engine/Katalog werden — wie im Browser via window.SEMBLA —
// aus docs/shared/ importiert und vor __wpInit() bereitgestellt.
//
// Storage ist die ECHTE Schicht (docs/shared/storage.js) auf einem localStorage-Mock: nur so
// lassen sich das Auto-Speichern, die wandbezogene Produktauswahl (Issue #35) und deren
// Fortbestand ueber einen Reload (erneutes __wpInit()) am echten Datenpfad pruefen.
import { readFileSync } from "node:fs";
import { buildWall, Opening, GRID, COURSE, wirksameZwischenpunkte } from "../../docs/shared/sembla-core.js";
import { autoAuslegung, nachweisPruefen } from "../../docs/shared/sembla-engine.js";

class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();

const html=readFileSync(new URL("../../docs/wandplanung.html", import.meta.url),"utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische (attributlose) Skript
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={setProperty(k,v){this[k]=v;}};this.listeners={};this._tb=null;this.checked=false;this.dataset={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  // Ereignisobjekt darf vom Test gestellt werden (delegierte Hoerer auf gerenderten Elementen).
  dispatch(e,ev){(this.listeners[e]||[]).forEach(f=>f(ev||{target:this}));}
  setAttribute(){}
  // Anzeigerechteck: standardmaessig deckungsgleich mit dem viewBox (1000 breit, Hoehe offen ->
  // die Abbildung faellt auf die viewBox-Hoehe zurueck). Der #106-Abschnitt setzt `_rect`
  // ausdruecklich auf ein Rechteck mit Rand, Zoom und abweichendem Seitenverhaeltnis.
  getBoundingClientRect(){ return this._rect || {left:0,width:1000}; } get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(s){ if(s==='tbody'){ if(!this._tb)this._tb=new El('tb'); return this._tb;} return new El('x'); }
  querySelectorAll(){return [];} appendChild(){} }
const dv={len:'2.00',hgt:'2.60',sideVorne:'fassade',sideHinten:'innenausbau',qk:'1.00',gammaQ:'1.50',modus:'auto',spacing:'3',force:'60',fcd:'20',cfd:'0.60',rho:'14',blechCm:'100',topConn:'blech',abdichtung:'nicht_abgedichtet',brandklasse:'F0'};
const document={_e:{},getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement(){return new El('_');}};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__p=true;},
  _h:{}, addEventListener(e,f){(this._h[e]||(this._h[e]=[])).push(f);},
  dispatch(e,ev){(this._h[e]||[]).forEach(f=>f(ev||{}));}}; globalThis.alert=()=>{};

const store = await import("../../docs/shared/storage.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");
// Farbschluessel des Zuschnitts ([D-4]): Modul 1 fuehrt keine eigenen Hex-Werte, sondern
// bezieht ihn — wie Modul 5/7 — aus sembla-montage.js.
const MONT = await import("../../docs/shared/sembla-montage.js");
// Stuecklistenpositionen fuer den Realpfad-Nachweis der Bodenblech-Bepreisung ([A-10]/[P-14]).
const BOM = await import("../../docs/shared/sembla-bom.js");
// #112: das Blatt von Modul 7 — nur zum QUERVERGLEICH. Modul 1 zieht daraus nichts; geprueft
// wird, dass beide Ansichten derselben Wand dieselbe Zahl weisser Haarlinien zeigen und
// dieselbe abgeleitete Breite benutzen (das lokale Doppelmass, [P-6]/[D-4]).
const ZEICH = await import("../../docs/shared/sembla-zeichnung.js");
// Aktives Element ist in Modul 0 angelegt worden (inkl. Wandtyp) — Modul 1 legt selbst KEINS an.
// Der Leerfall wird am Ende separat geprüft.
const startWand=Object.assign(buildWall('Wand A',2000,2600,[]),{wandtyp:'ohne_wind'});
const idA=store.speichere('Wand A', startWand); store.setzeAktiv(idA);
globalThis.window.SEMBLA={ buildWall, Opening, GRID, COURSE, autoAuslegung, nachweisPruefen, store, KAT,
  STUECK_FARBE: MONT.STUECK_FARBE, STUECK_LABEL: MONT.STUECK_LABEL,
  stueckFarbe: MONT.stueckFarbe, stangenStuecke: MONT.stangenStuecke,
  // #91: der EINE Zeichenweg des Bodenblechs — Modul 1 zeigt damit dieselbe reale
  // Teilfolge und dieselben Stossmarken wie Modul 5 und Modul 7 ([A-10]/[D-4]).
  bodenblechSvg: MONT.bodenblechSvg,
  // [A-14]/#93: Symbol, Kennfarbe und Klartext des Einlegeblechs kommen — wie der
  // Zuschnittschluessel — aus sembla-montage.js; die wirksamen Punkte aus dem Rechenkern.
  ZWISCHENPUNKT: MONT.ZWISCHENPUNKT, zwischenpunktSvg: MONT.zwischenpunktSvg,
  // [P-24]/[D-10]/#95: ebenso Symbol, Kennfarbe und Klartext des Deckenanschlusses; die
  // Anschlusspunkte selbst kommen aus dem Rechenkern.
  DECKENANSCHLUSS: MONT.DECKENANSCHLUSS, deckenanschlussSvg: MONT.deckenanschlussSvg,
  // #110: Symbolgeometrie und Kennfarben der Spannkomponenten (Mutter, Kopplungsmutter,
  // Spannplatte) — dieselbe Quelle, aus der Modul 7 zeichnet; Modul 1 fuehrt dafuer keine
  // eigene Geometrie und keine lokalen Hex-Werte mehr.
  // #106: die Symbolmasse stehen fest in Papier-mm; `SPANN_EINHEIT.ansicht` ist der Faktor
  // auf viewBox-Einheiten. `schraubeSvg` ist die Schraube am Wandfuss ([A-19]/#97).
  // #112: `SPANN_MM` kommt hinzu — die weisse Haarlinie am Stangenstoss wird aus dem
  // Durchmesser der Kopplungsmutter abgeleitet, damit sie breiter ist als das Bauteil ueber ihr.
  SPANN_FARBE: MONT.SPANN_FARBE, SPANN_EINHEIT: MONT.SPANN_EINHEIT, SPANN_MM: MONT.SPANN_MM,
  mutterSvg: MONT.mutterSvg,
  kopplungsmutterSvg: MONT.kopplungsmutterSvg, spannplatteSvg: MONT.spannplatteSvg,
  schraubeSvg: MONT.schraubeSvg,
  wirksameZwischenpunkte };

eval(script);
globalThis.window.__wpInit();
const WP=globalThis.window.__wp;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

/**
 * Laenge der Wand aendern — seit Issue #56 NICHT mehr ueber Modul 1: das Feld `len`
 * ist dort nur noch Anzeige und hat keinen Ereignishoerer mehr. Im Betrieb rechnet
 * der GESCHOSSEDITOR das Wandelement mit der neuen Rasterlaenge neu und speichert es;
 * Modul 1 laedt diesen Stand. Genau diesen Weg nimmt der Helfer, damit die folgenden
 * Pruefungen keinen Bedienweg benutzen, den es im Produkt nicht mehr gibt.
 */
function setzeLaenge(mm){
  const el=store.holeElement(store.aktivId());
  const we=el?el.wandelement:WP.RESULT.wandelement;
  const neu=Object.assign(buildWall(we.name, mm, we.height_mm, [], we.sides, we.prestress, []),
    {wandtyp:we.wandtyp});
  if(el) store.speichere(el.name, neu, el.id);
  WP.applyWand(neu);
}
// Mit aktivem Element rechnet Modul 1 direkt beim Laden.
ok('aktives Element geladen -> Auslegung läuft, konvergiert', WP.RESULT && WP.RESULT.status==='konvergiert');
// Issue #6 (M2): Modul 1 wählt keinen Wandtyp, führt den des Elements aber unverändert mit —
// auch über den kompletten Neuaufbau durch buildWall() hinweg.
ok('kein Wandtyp-Eingabefeld in Modul 1', !/id="wandtyp"/.test(html));
ok('Wandtyp aus dem Wandelement mitgeführt', WP.RESULT.wandelement.wandtyp==='ohne_wind');
WP.run();
ok('Wandtyp überlebt erneuten Neuaufbau', WP.RESULT.wandelement.wandtyp==='ohne_wind');
ok('Wandbild + Stränge', (document.getElementById('plan').innerHTML.match(/<rect/g)||[]).length>5 && document.getElementById('plan').innerHTML.includes('#1f6feb'));
// Das Slicing muss SICHTBARES Feedback in der Wandansicht sein ([Z-2]/[Z-3]/[Z-6]):
// nicht ein Strich je Strang, sondern ein Strich je realem Stueck plus Kopplungsmarken.
ok('Wandansicht zeichnet die einzelnen Stuecke, nicht einen Strich je Strang', (()=>{
  const svg=document.getElementById('plan').innerHTML;
  const w=WP.RESULT.wandelement;
  const stuecke=w.tension_columns.flatMap(c=>c.segments).flatMap(g=>g.stuecke||[]);
  const kopplungen=w.tension_columns.flatMap(c=>c.segments)
    .reduce((a,g)=>a+Math.max(0,(g.stuecke||[]).length-1),0);
  const striche=(svg.match(/stroke="#1f6feb" stroke-width="2\.4"/g)||[]).length;
  // Seit #110 ist die Kopplungsmarke die KOPPLUNGSMUTTER (Zylinder in Seitenansicht) statt
  // eines Querstrichs. Die Klasse `kop` trennt sie unveraendert vom Legendenmuster. Seit #97
  // traegt AUCH der Fussanschluss eine Kopplungsmutter ([A-19]) — die Aussage bleibt: genau
  // eine Marke je Kopplung, plus genau eine je Fuss.
  const fuesse=w.tension_columns.flatMap(c=>c.segments)
    .filter(g=>(g.anker_unten||(g.z0_mm===0?'bodenblech':'spannplatte'))==='bodenblech').length;
  const marken=(svg.match(/<rect class="kop"/g)||[]).length;
  return stuecke.length>w.tension_columns.length      // es gibt ueberhaupt mehrere Stuecke
    && striche===stuecke.filter(p=>p.art==='standard').length
    && fuesse>0 && marken===kopplungen+fuesse; })());
// Issue #63: Die Legende liegt in einem EIGENEN DOM-Bereich unterhalb der Ansicht — im SVG hat sie
// den Kopfraum belegt und dort Reststueck-Ueberstand, Kopfblech und Bemassung ueberdeckt.
const zleg=()=>document.getElementById('zLegende').innerHTML;
ok('[#63] Legendenbereich liegt ausserhalb des Plan-SVG (eigenes Element im Markup)',
  /id="zLegende"/.test(html) && /<svg id="plan"[\s\S]*?id="zLegende"/.test(html));
ok('[#63] Legende benennt den Zuschnitt im eigenen Bereich',
  /Zuschnitt:/.test(zleg()) && /Standardlänge/.test(zleg()));
ok('[#63] kein Legendentext mehr innerhalb von plan.innerHTML', (()=>{
  const svg=document.getElementById('plan').innerHTML;
  return !/Zuschnitt:/.test(svg) && !/Kopplung/.test(svg)
    && !svg.includes(MONT.STUECK_LABEL.standard); })());
// [D-4]: EIN Farbschluessel fuer Modul 1/5/7 — Modul 1 fuehrt keine eigenen Hex-Werte
// und keine eigenen Klartexte der Stueckarten mehr.
ok('Zuschnitt-Farben/-Texte kommen aus sembla-montage.js (keine lokalen Werte)',
  /STUECK_FARBE/.test(html) && /STUECK_LABEL/.test(html) && /sembla-montage\.js/.test(html)
  && !/C_SOND|C_REST/.test(html)
  && !new RegExp(MONT.STUECK_FARBE.sonder+'|'+MONT.STUECK_FARBE.rest).test(html));
ok('Legende nutzt genau die geteilten Farben/Texte aus sembla-montage.js', (()=>{
  const L=zleg();
  return L.includes(MONT.STUECK_FARBE.standard) && L.includes(MONT.STUECK_LABEL.standard); })());
// Nur TATSAECHLICH vorhandene Stueckarten — und die Kopplung sichtbar gekennzeichnet.
// Gleichheit in BEIDE Richtungen und fuer ALLE DREI Arten — auch die Standardlaenge wird nur
// genannt, wenn sie wirklich vorkommt (kein Sonderfall „Standard immer“).
const legendeStimmt=()=>{
  const L=zleg(), w=WP.RESULT.wandelement;
  const alle=w.tension_columns.flatMap(c=>c.segments).flatMap(g=>g.stuecke||[]);
  const hat=a=>alle.some(p=>p.art===a);
  for(const a of ['standard','sonder','rest']){
    if(L.includes(MONT.STUECK_LABEL[a])!==hat(a)) return false;          // Text genau bei Vorkommen
    if(L.includes(MONT.STUECK_FARBE[a])!==hat(a)) return false;          // Farbe genau bei Vorkommen
  }
  return alle.length>0 && /Kopplung/.test(L);
};
ok('[#63] Legende nennt genau die vorhandenen Stueckarten plus Kopplung', legendeStimmt());
// ---- Issue #110/#106/#97: Spannkomponenten in der Wandansicht ([D-4]/[A-19]) --------
// Geprueft wird die GERENDERTE Wandansicht am echten Speicherpfad: die Symbole muessen aus
// der gemeinsamen Quelle kommen (Formgleichheit mit Modul 7), die Kopplungsmutter messbar
// laenger sein als die normale Mutter, alle Symbolmasse FEST und damit von der Wandlaenge
// unabhaengig (#106), die Fussfolge Schraube/Blech/Kopplungsmutter richtig ([A-19]/#97) —
// und Modul 1 darf fuer diese Bauteile keine eigene Geometrie und keine Hex-Werte fuehren.
{
  const svg=()=>document.getElementById('plan').innerHTML;
  const w=()=>WP.RESULT.wandelement;
  const E=MONT.SPANN_EINHEIT.ansicht, MM=MONT.SPANN_MM;
  const hoehen=re=>[...svg().matchAll(re)].map(m=>+m[1]);
  const RE_KOP=/<rect class="kop" x="[-\d.]+" y="[-\d.]+" width="[-\d.]+" height="([-\d.]+)"/g;
  // Ohne Klasse und in Mutterfarbe: die kurzen Spannmuttern UND die beiden Schraubenzylinder.
  const RE_MUT=new RegExp('<rect x="[-\\d.]+" y="([-\\d.]+)" width="([-\\d.]+)" height="([-\\d.]+)"'
    +' fill="'+MONT.SPANN_FARBE.mutter+'"','g');
  const mutRects=()=>[...svg().matchAll(RE_MUT)].map(m=>({y:+m[1],b:+m[2],h:+m[3]}));
  ok('[#110] keine Kreisdarstellung der Spannkomponenten mehr in der Wandansicht', (()=>{
    // Kreise gibt es nur noch als BEDIENGRIFFE (#106) — die tragen `cursor:grab/copy`.
    const s=svg(); const kreise=[...s.matchAll(/<circle[^>]*>/g)].map(m=>m[0]);
    return kreise.every(c=>/cursor:(grab|copy)/.test(c)); })());
  ok('[#106] Mutter und Kopplungsmutter sind reine Rechtecke ohne Stirnkanten (keine Serifen)',
    hoehen(RE_KOP).length>0 && mutRects().length>0
    && svg().includes(MONT.SPANN_FARBE.mutter)
    // Die Serifen aus #110 waren `<line>`-Paare in der Mutterfarbe — es darf keins mehr geben.
    && !new RegExp('<line[^>]*stroke="'+MONT.SPANN_FARBE.mutter+'"').test(svg()));
  // Verhaeltnispruefung gegen die GETEILTE Quelle statt gegen zufaellig mitgezeichnete
  // Muttern: welche Anschlussarten diese Wand gerade hat, entscheidet das Wandelement, nicht
  // die Symbolpruefung. Die Aussage von #110 bleibt: messbar laenger, Faktor 2,5.
  ok('[#110] die gezeichnete Kopplungsmutter ist 2,5x so hoch wie das Muttersymbol',
    (()=>{ const k=hoehen(RE_KOP);
      const hM=+/height="([-\d.]+)"/.exec(MONT.mutterSvg(0,0,E))[1];
      return k.length>0 && hM>0 && k.every(h=>Math.abs(h/hM-2.5)<1e-6); })());
  ok('[#106] die Symbolhoehen sind die FESTEN Papier-mm, kein Vielfaches der Lagenhoehe',
    (()=>{ const kop=hoehen(RE_KOP);
      return kop.length>0 && kop.every(h=>Math.abs(h-MM.kupplung_h*E)<1e-6); })());
  // Jede Marke muss BYTEGLEICH die der geteilten Funktion sein — nachgerechnet mit derselben
  // Abbildung, die die Ansicht benutzt (pad 46, sc aus der Wandlaenge, y von unten).
  ok('[#110] jede Kopplungsmarke ist bytegleich die der geteilten Funktion', (()=>{
    const wd=w(), sc=WP.ansichtSc(), hPx=wd.height_mm*sc;
    const X=v=>46+v*sc, Y=v=>46+(hPx-v*sc);
    const s=svg(); let n=0;
    for(const col of wd.tension_columns) for(const g of col.segments){
      const st=MONT.stangenStuecke(wd,g);
      for(let i=0;i<st.length-1;i++){
        const soll=MONT.kopplungsmutterSvg(X(col.x_mm),Y(st[i].z1_mm),E,{klasse:'kop'});
        if(!s.includes(soll)) return false;
        n++;
      }
    }
    return n>0; })());
  // ---- Fussfolge Schraube / Bodenblech / Kopplungsmutter ([A-19], #97) ----------------
  ok('[#97] am Fuss steht die KOPPLUNGSMUTTER, nicht die normale Mutter', (()=>{
    const wd=w(), sc=WP.ansichtSc(), hPx=wd.height_mm*sc;
    const X=v=>46+v*sc, Y=v=>46+(hPx-v*sc);
    let n=0;
    for(const col of wd.tension_columns) for(const g of col.segments){
      const au=g.anker_unten||(g.z0_mm===0?'bodenblech':'spannplatte');
      if(au!=='bodenblech') continue;
      const soll=MONT.kopplungsmutterSvg(X(col.x_mm),Y(g.z0_mm),E,{klasse:'kop',auf:true});
      if(!svg().includes(soll)) return false;
      n++;
    }
    return n>0; })());
  ok('[#97] sie LIEGT AUF dem Bodenblech, statt halb darin zu stecken', (()=>{
    const wd=w(), sc=WP.ansichtSc(), hPx=wd.height_mm*sc;
    const y0=46+hPx;   // Y(0) = Oberkante Bodenblech = Steinunterkante
    // Alle Kopplungsmarken am Fuss muessen vollstaendig OBERHALB von Y(0) liegen (kleineres y).
    const fuss=[...svg().matchAll(/<rect class="kop" x="[-\d.]+" y="([-\d.]+)" width="[-\d.]+" height="([-\d.]+)"/g)]
      .map(m=>({y:+m[1],h:+m[2]})).filter(r=>Math.abs(r.y+r.h-y0)<1e-6);
    return fuss.length>0 && fuss.every(r=>r.y<y0); })());
  ok('[#97] die Schraube ist gezeichnet: zwei Zylinder, Kopf dicker als Schaft', (()=>{
    const r=mutRects();
    const schaft=r.filter(q=>Math.abs(q.b-MM.schaft_d*E)<1e-6);
    const kopf=r.filter(q=>Math.abs(q.b-MM.kopf_d*E)<1e-6);
    return schaft.length>0 && kopf.length===schaft.length && MM.kopf_d>MM.schaft_d; })());
  ok('[#97] der Schraubenkopf ragt UNTER dem Bodenblech heraus', (()=>{
    const wd=w(), sc=WP.ansichtSc(), hPx=wd.height_mm*sc;
    const y0=46+hPx, bth=Math.max(4,10*sc);
    const kopf=mutRects().filter(q=>Math.abs(q.b-MM.kopf_d*E)<1e-6);
    // Der Kopf beginnt an der Blechunterkante und endet darunter — er ist frei sichtbar.
    return kopf.length>0 && kopf.every(q=>Math.abs(q.y-(y0+bth))<1e-6 && q.h>0); })());
  // ---- Vordergrund: die Kopplungsmuttern stehen NACH allen anderen Bauteilen (#106) ----
  ok('[#106] alle Kopplungsmuttern liegen im Vordergrund (zuletzt gezeichnet)', (()=>{
    const s=svg();
    const ersteKop=s.indexOf('<rect class="kop"');
    // Nach der ersten Kopplungsmarke darf kein Stangenstueck, keine Platte, kein Blech und
    // kein Einlegeblech mehr kommen — in SVG entscheidet allein die Reihenfolge.
    const danach=s.slice(ersteKop);
    return ersteKop>0
      && !new RegExp('stroke="'+MONT.stueckFarbe('standard')+'"').test(danach)
      && !danach.includes('fill="'+MONT.SPANN_FARBE.platte+'"')
      && !danach.includes('<polyline class="zsp"'); })());
  ok('[#110] das Einlegeblech traegt genau eine Mutter je wirksamem Punkt', (()=>{
    const n=wirksameZwischenpunkte(w()).length;
    const zsp=(svg().match(/<polyline class="zsp"/g)||[]).length;
    const mut=(svg().match(/<rect class="zsp"/g)||[]).length;
    return n>0 && zsp===n && mut===n; })());
  ok('[#110] das C-Profil bleibt nach unten geoeffnet und ungefuellt', (()=>{
    const m=/<polyline class="zsp" points="([^"]+)" fill="none"/.exec(svg());
    if(!m) return false;
    const p=m[1].split(' ').map(t=>t.split(',').map(Number));
    return p.length===4 && p[1][1]===p[2][1] && p[0][1]>p[1][1] && p[3][1]>p[2][1]; })());
  ok('[#110] Modul 1 fuehrt fuer die Spannkomponenten keine eigene Geometrie/Hex-Werte',
    /mutterSvg/.test(html) && /kopplungsmutterSvg/.test(html) && /spannplatteSvg/.test(html)
    && /schraubeSvg/.test(html)
    && !/const STEEL='#5b6673', SPANN=/.test(html)
    && !new RegExp("'"+MONT.SPANN_FARBE.platte+"'|'"+MONT.SPANN_FARBE.mutter+"'").test(html)
    && !/<circle cx="\$\{x\}" cy="\$\{Y\(g\.z0_mm\)\}"/.test(html));
  ok('[#106] Modul 1 leitet kein Symbolmass mehr aus der Lagenhoehe ab',
    !/const lage=COURSE\*sc/.test(html) && /SPANN_EINHEIT\.ansicht/.test(html));
  ok('[#110] die Legende bezieht die Kopplungsfarbe aus der geteilten Quelle',
    zleg().includes(MONT.SPANN_FARBE.mutter));
}
// ---- Issue #112: Gewindestangen im Vordergrund + weisse Haarlinie am Stoss -----------
// Gemeldet war: andere Bauteile legten sich ueber die Stangenlinie, und die Stueckelung war
// nicht ablesbar, wo zwei Stuecke DERSELBEN Art aneinanderstossen. Beides ist reine
// AUSGABEREIHENFOLGE plus eine zusaetzliche Marke — Stueckgeometrie und Stossposition kommen
// unveraendert aus `stangenStuecke()`.
{
  const svg=()=>document.getElementById('plan').innerHTML;
  const w=()=>WP.RESULT.wandelement;
  const E=MONT.SPANN_EINHEIT.ansicht, MM=MONT.SPANN_MM;
  const grp=()=>/<g class="stg">([\s\S]*?)<\/g>/.exec(svg());
  const RE_HAAR=/<line class="haar" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#fff" stroke-width="([-\d.]+)"\/>/g;
  const haare=t=>[...t.matchAll(RE_HAAR)].map(m=>({x1:+m[1],y1:+m[2],x2:+m[3],y2:+m[4],sw:+m[5]}));
  const stoesse=wd=>wd.tension_columns.flatMap(c=>c.segments)
    .reduce((a,g)=>a+Math.max(0,MONT.stangenStuecke(wd,g).length-1),0);

  ok('[#112] die Stangenlinien stehen in einer eigenen Gruppe', !!grp());
  ok('[#112] die Gruppe steht NACH allen uebrigen Wandbauteilen', (()=>{
    const t=svg(), i=t.indexOf('<g class="stg">');
    return i>0
      && i>t.lastIndexOf('fill="#5b6673"')                 // Boden- und Kopfblech
      && i>t.lastIndexOf('<polyline points=')              // Wandumriss
      && i>t.lastIndexOf('<polyline class="dcs"')          // Deckenanschluss-Symbole
      && i>t.lastIndexOf('<polyline class="zsp"')          // Einlegebleche
      && i>t.lastIndexOf('fill="'+MONT.SPANN_FARBE.platte+'"'); })());   // Spannplatten
  ok('[#112] die Kopplungsmuttern bleiben davor (Haarlinie liegt hinter der Mutter)', (()=>{
    const t=svg();
    return t.indexOf('<g class="stg">')<t.indexOf('<rect class="kop"'); })());
  ok('[#112] ALLE Stangenstriche liegen in der Gruppe, keiner davor oder danach', (()=>{
    const ohne=svg().replace(/<g class="stg">[\s\S]*?<\/g>/,'');
    return !['standard','sonder','rest']
      .some(a=>ohne.includes('stroke="'+MONT.stueckFarbe(a)+'" stroke-width="')); })());
  ok('[#112] je Stangenstoss genau eine weisse Haarlinie, alle in der Gruppe', (()=>{
    const n=stoesse(w());
    return n>0 && haare(svg()).length===n && haare(grp()[1]).length===n; })());
  ok('[#112] sie steht waagerecht auf der Stossposition z1_mm des unteren Stuecks', (()=>{
    const wd=w(), sc=WP.ansichtSc(), hPx=wd.height_mm*sc;
    const X=v=>46+v*sc, Y=v=>46+(hPx-v*sc);
    const soll=[];
    for(const col of wd.tension_columns) for(const g of col.segments){
      const st=MONT.stangenStuecke(wd,g);
      for(let i=0;i<st.length-1;i++) soll.push({x:X(col.x_mm),y:Y(st[i].z1_mm)});
    }
    const ist=haare(svg());
    return soll.length>0 && soll.length===ist.length && soll.every(q=>ist.some(h=>
      Math.abs((h.x1+h.x2)/2-q.x)<1e-9 && h.y1===h.y2 && Math.abs(h.y1-q.y)<1e-9
      && h.x2>h.x1)); })());
  ok('[#112] sie ist breiter als die Kopplungsmutter (aus SPANN_MM.d abgeleitet)', (()=>{
    const b=MM.d*1.5*E, ist=haare(svg());
    return ist.length>0 && ist.every(h=>Math.abs((h.x2-h.x1)-b)<1e-9) && b>MM.d*E; })());
  ok('[#112] sie ist eine Haarlinie — duenner als jede Stangenlinie',
    haare(svg()).every(h=>h.sw<2.4));
  // Das lokale Doppelmass ([P-6]/[D-4]): Modul 1 und Modul 7 fuehren die Ableitung getrennt,
  // ohne gemeinsames Symbolmass in sembla-montage.js (Praezedenz #79). Genau deshalb wird die
  // Gleichheit hier GEPRUEFT statt verdrahtet — am gezeichneten Ergebnis beider Ansichten.
  ok('[#112] beide Ansichten leiten dieselbe Breite ab (kein Drift des Doppelmasses)', (()=>{
    const wd=w();
    const bl=ZEICH.zeichnungSvg(wd,{}).svg;
    // Seit #91 traegt das Blatt auch die weisse BLECHSTOSSMARKE. Sie ist SENKRECHT, die
    // Haarlinie am Stangenstoss WAAGERECHT — getrennt wird an der Geometrie (y1===y2),
    // nicht an der Farbe.
    const hb=[...bl.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#fff"/g)]
      .filter(m=>+m[2]===+m[4]).map(m=>+m[3]-+m[1]);
    const ha=haare(svg()).map(h=>h.x2-h.x1);
    if(!hb.length||!ha.length) return false;
    // Je Ansicht ein einheitliches Mass, und nach Umrechnung auf Papier-mm dasselbe.
    const eins=a=>new Set(a.map(v=>Math.round(v*1e6))).size===1;
    return eins(hb) && eins(ha)
      && Math.abs(ha[0]/E - hb[0]/MONT.SPANN_EINHEIT.blatt)<1e-9; })());
  ok('[#112] beide Ansichten derselben Wand zeigen gleich viele Haarlinien', (()=>{
    const wd=w();
    const bl=ZEICH.zeichnungSvg(wd,{}).svg;
    const nb=[...bl.matchAll(/<line x1="[-\d.]+" y1="([-\d.]+)" x2="[-\d.]+" y2="([-\d.]+)" stroke="#fff"/g)]
      .filter(m=>+m[1]===+m[2]).length;   // nur die waagerechten Haarlinien (#91, s. o.)
    return nb>0 && nb===haare(svg()).length && nb===stoesse(wd); })());
  ok('[#112] Farben und Strichstaerken der Stangenstuecke sind unveraendert', (()=>{
    const wd=w(), t=svg(); let n=0;
    for(const col of wd.tension_columns) for(const g of col.segments)
      for(const p of MONT.stangenStuecke(wd,g)){
        if(!t.includes('stroke="'+MONT.stueckFarbe(p.art)+'" stroke-width="'
          +(p.art==='rest'?3:2.4)+'"')) return false;
        n++;
      }
    return n>0; })());
  ok('[#112] Modul 1 fuehrt fuer die Haarlinienbreite kein eigenes Mass',
    /SPANN_MM\.d\s*\*\s*1\.5/.test(html) && /SPANN_MM=S\.SPANN_MM/.test(html));
  // Ein Strang aus EINEM Stueck hat keinen Stoss — dann darf auch keine Haarlinie entstehen.
  ok('[#112] ein einstueckiger Strang bekommt keine Haarlinie', (()=>{
    const wd=WP.RESULT.wandelement;
    const eins=buildWall(wd.name,1000,800,[],wd.sides,{rod_lengths_mm:[3000]},[]);
    return stoesse(eins)===0
      && (ZEICH.zeichnungSvg(eins,{}).svg.match(/stroke="#fff"/g)||[]).length===0; })());
}

// ---- Issue #100: Wandansicht passt ins Fenster und laesst sich zoomen ---------------
// Gefahren wird der ECHTE Bedienpfad: die im Markup sichtbaren Schalter werden geklickt und
// die Fenstergroessenaenderung ueber den echten window-Hoerer ausgeloest. Markup und CSS
// werden gegen die ECHTE HTML-Quelle geprueft — der DOM-Stub legt unbekannte Elemente bei
// Bedarf an und koennte fehlendes Markup nie als fehlend melden.
{
  const box=document.getElementById('planBox'), wert=document.getElementById('zoomWert');
  const zoomVar=()=>box.style['--zoom'];
  const klick=id=>document.getElementById(id).dispatch('click');
  const planHtml=()=>document.getElementById('plan').innerHTML;

  // (a) Hoehenbegrenzter Zeichenbereich mit lokalem Scrollen
  ok('[#100] das Plan-SVG liegt in einem eigenen Zeichenbereich',
    /<div class="planbox" id="planBox">\s*<svg id="plan"/.test(html));
  ok('[#100] der Zeichenbereich ist auf die verfuegbare Fensterhoehe begrenzt', (()=>{
    const css=(html.match(/\.planbox\{[^}]*\}/)||[''])[0];
    return /--planh:calc\(100vh/.test(css) && /max-height:var\(--planh\)/.test(css); })());
  ok('[#100] Uebergroesse scrollt lokal und blaeht die Seite nicht horizontal auf', (()=>{
    const css=(html.match(/\.planbox\{[^}]*\}/)||[''])[0];
    return /overflow:auto/.test(css) && /max-width:100%/.test(css); })());
  // Seit #106 traegt das SVG den FESTEN Ansichtsmasstab: die Breite kommt inline aus dem
  // viewBox (`calc(<vbW>px * var(--zoom))`), die Hoehe folgt dem Verhaeltnis. Ein `width:100%`
  // oder ein `max-height` im CSS wuerde die Zeichnung wieder auf den Rahmen zurueckskalieren
  // und damit den Stein je Wandgroesse verschieden gross machen — beides darf nicht mehr da sein.
  ok('[#106] das SVG traegt den festen Masstab, der Rahmen skaliert nicht zurueck', (()=>{
    const css=(html.match(/\.planbox>svg\{[^}]*\}/)||[''])[0];
    return /height:auto/.test(css)
      && !/max-height/.test(css)
      && !/width:calc\(100%/.test(css)
      && /style\.width=`calc\(\$\{vbW\}px \* var\(--zoom\)\)`/.test(html)
      && /<svg id="plan"[^>]*preserveAspectRatio="xMidYMid meet"/.test(html); })());
  ok('[#100] der frühere unbegrenzte globale svg-Selektor ist entfallen',
    !/^\s*svg\{width:100%;height:auto/m.test(html));

  // (b) Bedienelemente: echte <button> (damit nativ per Tastatur bedienbar), klar beschriftet,
  //     und sie stehen an der Ansicht — NICHT in der linken Eingabespalte (#69).
  const KOPF=html.match(/<div class="stage panel">[\s\S]*?<div class="planbox"/)[0];
  ok('[#100] beschriftete Schalter fuer Vergroessern, Verkleinern und Einpassen',
    /<button type="button" id="zoomIn" class="mini"[^>]*>[^<]*Größer</.test(KOPF)
    && /<button type="button" id="zoomOut" class="mini"[^>]*>[^<]*Kleiner</.test(KOPF)
    && /<button type="button" id="zoomFit" class="mini"[^>]*>Einpassen</.test(KOPF));
  ok('[#100] die Schalter sind per Tastatur bedienbar (native Knoepfe, kein div-Ersatz)',
    !/id="zoom(In|Out|Fit)"/.test(KOPF.replace(/<button[^>]*>/g,'')));
  ok('[#100] der Zoomwert steht sichtbar an den Bedienelementen', /id="zoomWert"/.test(KOPF));
  ok('[#100] die Schalter stehen an der Ansicht, nicht in der linken Eingabespalte',
    !/id="zoom/.test(html.match(/<div class="controls panel">[\s\S]*?<div class="stage panel">/)[0]));

  // (c) Standardstellung = ECHTER Masstab (100 %). Seit #106 ist das nicht mehr dasselbe wie
  //     „eingepasst": eingepasst wird gerechnet und darf nur verkleinern.
  ok('[#100] Standardstellung ist der echte Masstab (100 %), Wert sichtbar',
    WP.zoomPct===WP.ZOOM_FIT && wert.textContent==='100 %'
    && zoomVar()==='1' && box.dataset.zoom==='100');

  // (d) Zoom aendert AUSSCHLIESSLICH die Darstellungsgroesse
  const planVor=planHtml(), wandVor=JSON.stringify(store.aktivesWandelement());
  klick('zoomIn');
  ok('[#100] Vergroessern hebt den Faktor und den sichtbaren Prozentwert',
    WP.zoomPct===125 && wert.textContent==='125 %' && zoomVar()==='1.25' && box.dataset.zoom==='125');
  ok('[#100] die Zeichnung selbst bleibt dabei unveraendert (nur der Rahmen skaliert)',
    planHtml()===planVor && JSON.stringify(store.aktivesWandelement())===wandVor);
  klick('zoomOut'); klick('zoomOut');
  ok('[#100] Verkleinern senkt den Faktor schrittweise',
    WP.zoomPct===75 && wert.textContent==='75 %' && zoomVar()==='0.75');

  // (e) Grenzen: der Faktor laeuft nie ueber Mindest-/Hoechstwert hinaus
  for(let i=0;i<40;i++) klick('zoomIn');
  ok('[#100] der Faktor ist nach oben begrenzt',
    WP.zoomPct===WP.ZOOM_MAX && wert.textContent===WP.ZOOM_MAX+' %'
    && document.getElementById('zoomIn').disabled===true);
  for(let i=0;i<40;i++) klick('zoomOut');
  ok('[#100] der Faktor ist nach unten begrenzt',
    WP.zoomPct===WP.ZOOM_MIN && wert.textContent===WP.ZOOM_MIN+' %'
    && document.getElementById('zoomOut').disabled===true);

  // (f) Zuruecksetzen stellt die eingepasste Standardansicht wieder her
  klick('zoomFit');
  ok('[#100] Zuruecksetzen stellt die eingepasste Ansicht wieder her',
    WP.zoomPct===WP.ZOOM_FIT && wert.textContent==='100 %' && zoomVar()==='1'
    && document.getElementById('zoomIn').disabled===false
    && document.getElementById('zoomOut').disabled===false);

  // (g) Fenstergroessenaenderung: die Einpassung wird neu angewandt, der GEWAEHLTE Faktor bleibt
  klick('zoomIn'); klick('zoomIn');
  box.dataset.zoom='';                      // Beweis, dass das Resize wirklich neu anwendet
  globalThis.window.dispatch('resize');
  ok('[#100] Resize bewahrt den gewaehlten Zoom und wendet die Einpassung neu an',
    WP.zoomPct===150 && wert.textContent==='150 %' && zoomVar()==='1.5'
    && box.dataset.zoom==='150');

  // (h) Bei gewaehltem Zoom bleibt die gesamte Ansicht voll bedienbar
  WP.setzeZoom(200);
  WP.run();
  ok('[#100] Neuberechnung laeuft bei gewaehltem Zoom unveraendert',
    WP.RESULT && WP.RESULT.status==='konvergiert' && WP.zoomPct===200);
  const showDimEl=document.getElementById('showDim'), showRasterEl=document.getElementById('showRaster');
  showRasterEl.checked=true; showRasterEl.dispatch('change');
  ok('[#100] Raster laesst sich bei gewaehltem Zoom einschalten', /Raster 12,5 × 20 cm/.test(planHtml()));
  showRasterEl.checked=false; showRasterEl.dispatch('change');
  ok('[#100] Raster laesst sich wieder ausschalten', !/Raster 12,5 × 20 cm/.test(planHtml()));
  showDimEl.checked=false; showDimEl.dispatch('change');
  const ohneMasse=planHtml();
  showDimEl.checked=true; showDimEl.dispatch('change');
  const masszahl=h=>(h.match(/transform="rotate\(-90/g)||[]).length;   // nur die Bemassungsschicht
  ok('[#100] Masse lassen sich bei gewaehltem Zoom aus- und einschalten',
    masszahl(ohneMasse)===0 && masszahl(planHtml())>0 && /2,00 m</.test(planHtml()));
  klick('viewToggle');
  ok('[#100] Ansichtsumschaltung wirkt bei gewaehltem Zoom', /Rückseite/.test(planHtml()));
  klick('viewToggle');
  ok('[#100] und wieder zurueck auf die Vorderseite', !/Rückseite/.test(planHtml()));

  // (i) Der Zoomzustand wird NIRGENDS gespeichert und beruehrt die Zeichengeometrie nicht.
  const zoomQuelle=html.match(/function applyZoom\(\)\{[\s\S]*?function zoomEinpassen[^\n]*\n/)[0];
  // Die Einpassung MUSS die viewBox-Masse lesen (sonst kann sie nichts einpassen) — sie liest
  // sie aus LASTDRAW, also aus derselben Quelle, die draw() gesetzt hat. Verboten bleibt das
  // SETZEN eines viewBox und jede Form von Speichern.
  ok('[#100] die Zoomlogik SETZT keinen viewBox und speichert nichts',
    !/setAttribute\('viewBox'/.test(zoomQuelle) && !/store\./.test(zoomQuelle)
    && !/localStorage/.test(zoomQuelle) && !/mergeEingaben/.test(zoomQuelle));
  ok('[#100] kein Zoomzustand in den gespeicherten Eingaben oder im localStorage',
    !/zoom/i.test(JSON.stringify(store.aktiveEingaben()))
    && !/zoom/i.test(localStorage.getItem('sembla:elemente')||''));
  WP.setzeZoom(WP.ZOOM_FIT);   // Ausgangszustand fuer die folgenden Abschnitte
}

// ---- Issue #78: kein statischer Einzelnachweis mehr in Modul 1 ----------------------
// Geprueft am ECHTEN HTML: der DOM-Stub legt unbekannte Elemente bei Bedarf an und koennte
// entferntes Markup nie als fehlend melden. Der Nachweis liegt allein in Modul 3.
ok('[#78] Nachweisueberschrift und Nachweistabelle sind aus dem Markup entfernt',
  !/id="nwTable"/.test(html) && !/>Nachweise</.test(html));
ok('[#78] Nachweis-Renderer und Ergebniszeilen sind ersatzlos entfernt',
  !/renderNachweise/.test(html) && !/nwRow/.test(html));
ok('[#78] Status-Badge behauptet keine Nachweispruefung, meldet aber den konstruktiven Zustand',
  !/alle Nachweise erfüllt/.test(html) && !/Nachweis NICHT erfüllt/.test(html)
  && document.getElementById('statusBadge').textContent==='Auslegung erstellt');
ok('[#78] Iterationsprotokoll bleibt als konstruktives Auslegungsfeedback erhalten',
  /id="itTable"/.test(html) && /renderIter/.test(html));
ok('[#78] fester Auslegungsmodus bleibt waehlbar (Strangabstand + Vorspannkraft)',
  /value="nachweis">Feste Auslegung<\/option>/.test(html)
  && /id="spacing"/.test(html) && /id="force"/.test(html));
// Beide Auslegungswege am realen Storage-Pfad: die automatische Auslegung speichert Spannachsen
// und Gewindestangenstuecke, die feste Auslegung die vorgegebenen konstruktiven Parameter —
// gelesen jeweils ueber store.aktivesWandelement(), nicht ueber RESULT.
ok('[#78] Auto-Auslegung: gespeichertes Wandelement traegt Spannachsen + Stangenstuecke', (()=>{
  const w=store.aktivesWandelement();
  const stuecke=w.tension_columns.flatMap(c=>c.segments).flatMap(g=>g.stuecke||[]);
  return w.tension_columns.length>0 && stuecke.length>0; })());
document.getElementById('modus').value='nachweis'; document.getElementById('modus').dispatch('change');
document.getElementById('spacing').value='2'; document.getElementById('spacing').dispatch('input');
document.getElementById('force').value='45'; document.getElementById('force').dispatch('input');
ok('[#78] feste Auslegung: Strangabstand und Vorspannkraft stehen im gespeicherten Wandelement', (()=>{
  const w=store.aktivesWandelement();
  return w.prestress.max_span_grid===2 && w.prestress.force_kN===45 && w.tension_columns.length>0; })());
// Ausgangszustand der folgenden Abschnitte wiederherstellen (Auto-Modus, Standardparameter).
document.getElementById('spacing').value='3'; document.getElementById('force').value='60';
document.getElementById('modus').value='auto'; document.getElementById('modus').dispatch('change');
ok('Steine-Zusammenfassung gefüllt (BOM-Tabelle jetzt in Modul 4)', /\d/.test(document.getElementById('rSteine').textContent));
ok('sides + verification im Ergebnis', WP.RESULT.wandelement.sides.vorne.funktion==='fassade' && WP.RESULT.wandelement.verification.status==='geprüft');
// Öffnung hinzufügen
WP.addOpening('tuer');
ok('Tür im Wandbild', /Tür/.test(document.getElementById('plan').innerHTML));
ok('mit Tür weiterhin geprüft', WP.RESULT.wandelement.verification.status==='geprüft');
// Roundtrip-Export = importierbar (selber Inhalt)
const exported=WP.RESULT.wandelement;
WP.applyWand(exported);
ok('Roundtrip: lädt eigenes Ergebnis', document.getElementById('len').value==='2.000');
// Ansicht spiegeln
const xB=(document.getElementById('plan').innerHTML.match(/<rect x="([\d.]+)"/)||[])[1];
document.getElementById('viewToggle').dispatch('click');
ok('Rückseite gespiegelt', /Rückseite/.test(document.getElementById('plan').innerHTML) && xB!==(document.getElementById('plan').innerHTML.match(/<rect x="([\d.]+)"/)||[])[1]);
document.getElementById('viewToggle').dispatch('click');
// zurück auf Auto-Modus (Roundtrip hatte auf Nachweis gestellt)
document.getElementById('modus').value='auto'; document.getElementById('modus').dispatch('change');
// hohe Last
document.getElementById('qk').value='3.0'; document.getElementById('qk').dispatch('input'); const Nhi=WP.RESULT.wandelement.verification.auslegung.force_kN;
document.getElementById('qk').value='0.5'; document.getElementById('qk').dispatch('input'); const Nlo=WP.RESULT.wandelement.verification.auslegung.force_kN;
ok('höhere Last -> höhere N', Nhi>Nlo);
// Durchbruch: auf einer SAUBEREN Wand ohne die Tür von oben. Sonst bliebe zwischen Tür und
// Durchbruch ein 1-Raster-Streifen, der sich mit i2/i3 gar nicht belegen laesst — der Strang
// dort waere dann wegen des unbelegbaren Streifens segmentiert, nicht wegen der Öffnung.
// Kopfblech-Referenzfall (#92): `top_connection` wird AUSGESPROCHEN, damit die folgenden
// Abschnitte weiter am Kopfblech messen und nicht am neuen Spannplatten-Default haengen.
WP.applyWand(buildWall('Wand A',2000,2600,[],null,{top_connection:'blech'}));
document.getElementById('modus').value='auto'; document.getElementById('modus').dispatch('change');
// (a) schmaler Durchbruch (eine Zelle, Spalte 3, Lagen 5-6)
WP.toggleVoid(5,3); WP.toggleVoid(6,3);
const wd=WP.RESULT.wandelement;
ok('Durchbruch als Öffnung (art durchbruch)', wd.openings.some(o=>o.art==='durchbruch'));
// Eine Achse "bei k" liegt INNERHALB der Rasterzelle k (so pruefen es sowohl die Steinabdeckung
// [V-2] als auch die Segmentbildung). Der schmale Durchbruch belegt genau Zelle 3; [V-8] setzt
// deshalb beidseitig DANEBEN eine Achse (2 und 4) und nicht in die Öffnung hinein.
const kd=new Set(wd.tension_columns.map(c=>c.k));
ok('[V-8] Achsen flankieren den Durchbruch (2 und 4)', kd.has(2) && kd.has(4));
ok('keine Achse in der Öffnungszelle 3', !kd.has(3));
ok('schmaler Durchbruch zerteilt keinen Strang', wd.tension_columns.every(c=>c.durchgehend));
WP.toggleVoid(5,3); WP.toggleVoid(6,3);
ok('Auffüllen entfernt Durchbruch', !WP.RESULT.wandelement.openings.some(o=>o.art==='durchbruch'));

// (b) breiter Durchbruch (Zellen 3-7): hier MUSS [V-2] die Steine ueber/unter der Öffnung halten,
// eine Achse liegt also zwangslaeufig in der Öffnung -> genau dort wird der Strang segmentiert.
for(const c of [3,4,5,6,7]){ WP.toggleVoid(5,c); WP.toggleVoid(6,c); }
const wb=WP.RESULT.wandelement;
const opb=wb.openings.find(o=>o.art==='durchbruch');
ok('breiter Durchbruch als eine Öffnung', !!opb && opb.g0===3 && opb.g1===8);
const cs=wb.tension_columns.filter(c=>!c.durchgehend);
ok('Strang in der Öffnung ist segmentiert', cs.length>=1 && cs.every(c=>c.segments.length>=2));
ok('Segmente meiden die Öffnung', cs.every(c=>c.segments.every(g=>g.lage1<=opb.l0 || g.lage0>=opb.l1)));
ok('nur Stränge in der Öffnung sind segmentiert', cs.every(c=>c.k>=opb.g0 && c.k<opb.g1));
for(const c of [3,4,5,6,7]){ WP.toggleVoid(5,c); WP.toggleVoid(6,c); }
ok('Auffüllen entfernt breiten Durchbruch', !WP.RESULT.wandelement.openings.some(o=>o.art==='durchbruch'));

// Versatz-Warnung: 0,50 m (zwei i2) verletzt den Mindestversatz -> sichtbare Warnung + rotes Badge
WP.voids.clear();
setzeLaenge(500);
document.getElementById('modus').value='nachweis';
WP.run();
const wbad=WP.RESULT.wandelement;
ok('0,50 m: Core meldet versatz_ok=false', wbad.validation.versatz_ok===false);
ok('Versatz-Warnung im UI sichtbar', /Versatz/.test(document.getElementById('warns').textContent));
ok('Badge zeigt Verband regelwidrig', /regelwidrig/.test(document.getElementById('statusBadge').textContent));
ok('Badge ist rot (Klasse no)', /badge no/.test(document.getElementById('statusBadge').className));
setzeLaenge(2000); document.getElementById('modus').value='auto'; WP.run();

// [Z-1] Es gibt KEIN Eingabefeld fuer die Gewindestangenlaenge mehr — der Bauteilkatalog ist
// die alleinige Quelle. Ohne Katalog rechnet der Core mit seinem dokumentierten Altstand-Wert.
// Gegen die echte HTML-Quelle geprueft, nicht gegen den DOM-Stub: der legt unbekannte
// Elemente bei Bedarf an und koennte ein entferntes Feld nie als fehlend melden.
ok('kein Eingabefeld fuer die Stangenlaenge mehr im Modul', !/id="rodCm"/.test(html));
WP.run();
ok('ohne Katalogauswahl: Altstand-Fallback des Cores (1100 mm)', WP.RESULT.wandelement.rod_mm===1100);
ok('ohne Auswahl gibt Modul 1 keine Stangenlaenge vor', (()=>{ const p=WP.vorgaben().prestress;
  return p.rod_mm===undefined && p.rod_lengths_mm===undefined; })());
ok('fehlende Auswahl wird sichtbar gemeldet',
  /Kein Gewindestangenprodukt gewählt/.test(document.getElementById('rodQuelle').innerHTML));

// Staffelung / getreppter Aufbau: rechte Hälfte niedriger -> keine Öffnungs-Überlappung, oben rechts keine Steine
setzeLaenge(2000); document.getElementById('hgt').value='2.60'; WP.run();
WP.addStep(); WP.steps[0].x0=1.00; WP.steps[0].x1=2.00; WP.steps[0].h=1.00; WP.run();
const wst=WP.RESULT.wandelement;
ok('Staffelung im Wandelement (steps)', Array.isArray(wst.steps) && wst.steps.length===1 && wst.steps[0].height_mm===1000);
const topc=wst.courses.find(c=>c.lage===12);   // 2400..2600 mm
ok('oberste Lage nur linke Hälfte (max x ≤ 1,0 m)', Math.max(0,...topc.stones.map(s=>s.x1))<=1000);
ok('getreppte Wand baubar (keine Überlappung)', wst.validation.buildable===true);
const untenc=wst.courses.find(c=>c.lage===0);
ok('unterste Lage volle Breite (2,0 m)', Math.max(0,...untenc.stones.map(s=>s.x1))===2000);

// Projekt-Kopfdaten wurden nach Modul 0 (Startseite) verschoben — hier nicht mehr getestet.

// Feature-Requests: Anschluss-Modell + Reihennummern
setzeLaenge(2000); document.getElementById('hgt').value='2.60'; document.getElementById('modus').value='auto'; WP.run();
const wfr=WP.RESULT.wandelement;
ok('prestress hat blech_mm + top_connection', wfr.prestress.blech_mm>0 && (wfr.prestress.top_connection==='blech'||wfr.prestress.top_connection==='spannplatte'));
// [A-1] Die Blechdicke ist ein KATALOGMASS. Ohne gewaehltes Bodenblechprodukt gibt es keines —
// das Wandelement traegt dann ausdruecklich `null` statt einer geratenen Zahl ([P-9]).
ok('base_plate im Wandelement, Dicke ohne Katalogauswahl offen',
  !!wfr.base_plate && wfr.base_plate.dicke_mm===null && wfr.bom.stahlblech_dicke_mm===null);
ok('bom Stahlblech + Senkkopf vorhanden', wfr.bom.stahlblech_module>0 && wfr.bom.senkkopfschrauben>0);
const planHtml=document.getElementById('plan').innerHTML;
ok('Bodenblech gezeichnet', /Bodenblech/.test(planHtml));
ok('Reihennummern gezeichnet', (()=>{ for(let r=1;r<=wfr.lagen;r++) if(!planHtml.includes('>'+r+'</text>')) return false; return true; })());
document.getElementById('topConn').value='spannplatte'; document.getElementById('topConn').dispatch('change');
ok('Umschaltung Spannplatte wirkt', WP.RESULT.wandelement.prestress.top_connection==='spannplatte' && WP.RESULT.wandelement.top_plate===null);
document.getElementById('topConn').value='blech'; document.getElementById('topConn').dispatch('change');

// --- Issue #92 / [A-2]: Spannplatte ist der Standard des oberen Anschlusses ----------------
// Geprueft werden (a) die SICHTBARE Vorauswahl im Markup, (b) der reale Modul-1-Aufbaupfad
// ohne jede Anschlusswahl bis ins gespeicherte Wandelement und (c) der Bestand: eine Wand mit
// ausdruecklich gespeichertem `blech` laedt mit Kopfblech und behaelt es beim Neuaufbau.
// Die Harness-Vorbelegung `dv.topConn` bleibt bewusst 'blech' (Pinnung der uebrigen
// Kopfblech-Faelle dieser Datei); dieser Abschnitt setzt den Feldwert lokal und stellt ihn
// danach wieder her.
{
  const sel=html.match(/<select id="topConn"[\s\S]*?<\/select>/)[0];
  const vorauswahl=(sel.match(/<option value="([^"]+)" selected>/)||[])[1];
  ok('[#92] sichtbare Vorauswahl „Oberer Anschluss" ist die Spannplatte',
    vorauswahl==='spannplatte' && /<option value="spannplatte" selected>Spannplatte \(Standard\)</.test(sel)
    && !/<option value="blech" selected/.test(sel));
  // (b) Realpfad: Feld auf der Vorauswahl -> echter Modul-1-Lauf -> Wandelement im Speicher.
  document.getElementById('topConn').value=vorauswahl; WP.run();
  ok('[#92] Neuaufbau ohne Anschlusswahl liefert die Spannplatte (kein Kopfblech)',
    WP.RESULT.wandelement.prestress.top_connection==='spannplatte'
    && WP.RESULT.wandelement.top_plate===null
    && store.aktivesWandelement().prestress.top_connection==='spannplatte');
  // (c) Bestandswand mit ausdruecklich gespeichertem Kopfblech.
  const bestand=buildWall('Wand A',2000,2600,[],null,{top_connection:'blech'});
  ok('[#92] Testvoraussetzung: der Bestand traegt wirklich `blech`',
    bestand.prestress.top_connection==='blech' && bestand.top_plate!==null);
  WP.applyWand(bestand);
  ok('[#92] gespeichertes `blech` laedt als Kopfblech ins Feld',
    document.getElementById('topConn').value==='blech');
  ok('[#92] … und bleibt beim Neuaufbau erhalten (keine stille Umschreibung)',
    WP.RESULT.wandelement.prestress.top_connection==='blech'
    && WP.RESULT.wandelement.top_plate!==null
    && store.aktivesWandelement().prestress.top_connection==='blech');
}
document.getElementById('topConn').value='blech'; document.getElementById('topConn').dispatch('change');

// Feature: manueller Spannachsen-Editor (Sonderkonstruktion)
setzeLaenge(2000); document.getElementById('hgt').value='2.60'; document.getElementById('modus').value='auto'; WP.run();
WP.setManualCols([0,8,15]);
const mks=WP.RESULT.wandelement.tension_columns.map(c=>c.k);
ok('manuelle Achsen: nur gesetzte k', mks.every(k=>[0,8,15].includes(k)) && mks.includes(0) && mks.includes(15));
ok('columns_grid im Wandelement gesetzt', JSON.stringify(WP.RESULT.wandelement.prestress.columns_grid)==='[0,8,15]');
WP.addAxisAt(4); ok('Achse hinzufügen (k=4)', WP.manualCols.includes(4));
WP.delAxis(8); ok('Achse löschen (k=8)', !WP.manualCols.includes(8));
WP.setAxisEdit(true); ok('Achsen-Editor an + Griffe gezeichnet', WP.axisEdit===true && /cursor:grab/.test(document.getElementById('plan').innerHTML));
WP.setManualCols(null); ok('Zurück zu Auto (columns_grid null)', WP.RESULT.wandelement.prestress.columns_grid===null && WP.manualCols===null);
WP.setAxisEdit(false);

// ---------------------------------------------------------------------------------------------
// Issue #93: Zwischenspannpunkte (Einlegeblech) lagengenau planen — Auto-Anzeige, Hinzufuegen,
// Verschieben, Loeschen, „Zurueck zu Auto" bis zum GESPEICHERTEN Wandelement, plus das
// gemeinsame C-Profil-Symbol aus sembla-montage.js.
setzeLaenge(2000); document.getElementById('hgt').value='2.60';
document.getElementById('modus').value='auto'; WP.run();
{
  const svg=()=>document.getElementById('plan').innerHTML;
  // [A-15] Auto: je Segment die innere Lagen-Oberkante mit kleinstem Abstand zur halben
  // Segmenthoehe, Gleichstand zur NIEDRIGEREN (2600 -> 1200 statt 1400).
  const zp=WP.zwischenpunkte;
  ok('[#93] Auto: je Spannachse genau ein Punkt',
    zp.length===WP.RESULT.wandelement.tension_columns.length);
  ok('[#93] Auto: lagengenau auf 1200 mm (Gleichstand -> niedrigere Oberkante)',
    zp.length>0 && zp.every(x=>x.z_mm===1200));
  ok('[#93] Auto wird NICHT gespeichert (kein Feld im Wandelement)',
    !('zwischenpunkte_mm' in store.aktivesWandelement().prestress)
    && WP.RESULT.wandelement.prestress.zwischenpunkte_mm===undefined);
  // [A-14] Das Symbol ist das GETEILTE aus sembla-montage.js — Zeichenkette und Kennfarbe
  // muessen exakt uebereinstimmen (kein modul-eigenes Symbol, kein lokaler Hex-Wert).
  const einPunkt=zp[0];
  ok('[#93] Wandansicht zeichnet je Punkt das gemeinsame C-Profil-Symbol',
    (svg().match(/<polyline class="zsp"/g)||[]).length===zp.length);
  ok('[#93] C-Profil ist nach UNTEN geoeffnet (Balken oben, zwei Schenkel nach unten)', (()=>{
    const m=svg().match(/<polyline class="zsp" points="([^"]+)"/);
    if(!m) return false;
    const p=m[1].split(' ').map(t=>t.split(',').map(Number));
    // SVG-y waechst nach unten: die beiden Enden liegen UNTER dem Balken, der Balken ist waagerecht.
    return p.length===4 && p[1][1]===p[2][1] && p[0][1]>p[1][1] && p[3][1]>p[2][1]
      && p[0][0]===p[1][0] && p[2][0]===p[3][0];
  })());
  ok('[#93] Kennfarbe und Klartext kommen aus sembla-montage.js',
    svg().includes(MONT.ZWISCHENPUNKT.farbe) && zleg().includes(MONT.ZWISCHENPUNKT.label)
    && !/#0a7d6b/.test(html));
  ok('[#93] Symbolgeometrie ist die geteilte Funktion (identische Zeichenkette)',
    svg().includes(MONT.zwischenpunktSvg(0,0,{klasse:'zsp'}).slice(0,26)));
  // Hinzufuegen: aus dem Auto-Stand wird ein Override, der ans Wandelement geht.
  WP.setZpEdit(true);
  ok('[#93] Werkzeug an + Hoehenlinien gezeichnet', WP.zpEdit===true && /stroke-dasharray="6 4"/.test(svg()));
  WP.addZpAt(400); WP.run();
  ok('[#93] Punkt hinzufuegen (400 mm) landet im gespeicherten Override',
    JSON.stringify(store.aktivesWandelement().prestress.zwischenpunkte_mm)==='[400,1200]');
  ok('[#93] beide Punkte wirksam gezeichnet',
    (svg().match(/<polyline class="zsp"/g)||[]).length===2*WP.RESULT.wandelement.tension_columns.length);
  // Verschieben: 400 -> 800 (weiterhin lagengenau)
  WP.setManualZp([800,1200]);
  ok('[#93] Punkt verschieben (400 -> 800)',
    JSON.stringify(store.aktivesWandelement().prestress.zwischenpunkte_mm)==='[800,1200]');
  // Loeschen ueber die Auswahl (wie im Bedienweg „Punkt loeschen")
  WP.selZp(800); WP.delZp(800); WP.run();
  ok('[#93] Punkt loeschen laesst genau den anderen stehen',
    JSON.stringify(store.aktivesWandelement().prestress.zwischenpunkte_mm)==='[1200]');
  // [A-17] Ausdrueckliche LEERE Auswahl ist „keine Punkte" und faellt NICHT auf Auto zurueck.
  WP.setManualZp([]);
  ok('[#93] leere Auswahl: keine Punkte, kein Rueckfall auf Auto',
    WP.zwischenpunkte.length===0
    && JSON.stringify(store.aktivesWandelement().prestress.zwischenpunkte_mm)==='[]'
    && !/<polyline class="zsp"/.test(svg()));
  // Ungueltige Werte werden benannt und NICHT auf eine andere Lage gerundet.
  WP.setManualZp([1200,1250,9999]);
  ok('[#93] ungueltige Werte benannt statt gerundet',
    JSON.stringify(WP.RESULT.wandelement.prestress.zwischenpunkte_mm)==='[1200]'
    && (WP.RESULT.wandelement.validation.zwischenpunkt_fehler||[]).length===2
    && /Zwischenspannpunkte \[A-17\]/.test(document.getElementById('warns').textContent));
  // Zurueck zu Auto: Override verschwindet vollstaendig aus dem gespeicherten Element.
  WP.zpAuto();
  ok('[#93] Zurueck zu Auto: Override entfernt, nichts Abgeleitetes gespeichert',
    WP.manualZp===null && !('zwischenpunkte_mm' in store.aktivesWandelement().prestress)
    && WP.zwischenpunkte.every(x=>x.z_mm===1200));
  WP.setZpEdit(false);
  ok('[#93] Werkzeug aus: Hoehenlinien verschwinden, Symbole bleiben',
    !/stroke-dasharray="6 4"/.test(svg()) && /<polyline class="zsp"/.test(svg()));
  // Bloßes LADEN darf keinen Punkt schreiben ([P-1]): ein Element ohne Override bleibt ohne.
  // Verglichen wird der Vorspannblock, nicht das ganze Wandelement: applyWand() schaltet bei
  // gespeichertem `force_kN` auf den Nachweis-Modus und ändert dadurch zwei `verification`-
  // Felder — bestehendes Verhalten, das mit den Zwischenspannpunkten nichts zu tun hat.
  const vorher=JSON.stringify(store.aktivesWandelement().prestress);
  WP.applyWand(store.aktivesWandelement());
  ok('[#93] bloßes Laden schreibt keinen Punkt ins Element',
    JSON.stringify(store.aktivesWandelement().prestress)===vorher
    && !('zwischenpunkte_mm' in store.aktivesWandelement().prestress) && WP.manualZp===null);
  // [Z-7] Der Zuschnitt legt keine Kopplung auf eine wirksame Punkthoehe.
  ok('[#93]/[Z-7] keine Kopplung auf einer Zwischenspannpunkt-Hoehe', (()=>{
    const w=WP.RESULT.wandelement;
    const hoehen=new Set(wirksameZwischenpunkte(w).map(x=>x.k+'@'+x.z_mm));
    for(const col of w.tension_columns) for(const sg of col.segments){
      const enden=MONT.stangenEnden(w,sg);
      for(const z of enden.slice(0,-1)) if(hoehen.has(col.k+'@'+z)) return false;
    }
    return true;
  })());
}
document.getElementById('hgt').value='2.60'; WP.run();

// ---------------------------------------------------------------------------------------------
// Issue #96 / [A-24]: Ausgleichspunkt-Editor in Modul 1.
// Gefahren wird der ECHTE Pfad OHNE MAUS ueber die WP-API: Editor an, Punkt hinzufuegen,
// verschieben, loeschen, „Zurueck zu Auto" — und nach jedem Schritt wird nicht das Formular,
// sondern das GESPEICHERTE Wandelement geprueft (`store.aktivesWandelement()`). Genau das ist
// der Speicher-Lade-Umlauf: run() -> vorgaben() -> Engine -> Core -> persistAktiv -> Speicher.
// ---------------------------------------------------------------------------------------------
setzeLaenge(2000); document.getElementById('hgt').value='2.60';
document.getElementById('modus').value='auto'; WP.setZpEdit(false); WP.setAxisEdit(false); WP.run();
{
  const svg=()=>document.getElementById('plan').innerHTML;
  const ps=()=>store.aktivesWandelement().prestress;
  const xs=()=>WP.ausgleichspunkte.map(p=>p.x_mm);
  // Ausgangslage: verteilt nach [A-20]…[A-23], nichts davon gespeichert.
  const auto=xs();
  ok('[#96] Auto: die Verteilung liefert Punkte (2,0 m -> ceil(3*2) = 6)',
    auto.length===6 && auto[0]===0 && auto[auto.length-1]===2000);
  ok('[#96] Auto wird NICHT gespeichert (kein Feld im Wandelement)',
    !('ausgleich_override_mm' in ps()) && WP.manualAg===null
    && WP.ausgleichspunkte.every(p=>p.art!=='manuell'));
  ok('[#96] Auto: keine Griffe in der Wandansicht (Darstellung bleibt #97)',
    !/class="agp"/.test(svg()) && !/class="agneu"/.test(svg()));
  // Werkzeug an: Griffe erscheinen, aus dem Auto-Stand wird ein bearbeitbarer Override.
  WP.setAgEdit(true);
  ok('[#96] Werkzeug an + Griffe am Wandfuss gezeichnet',
    WP.agEdit===true && /class="agp"/.test(svg()) && /class="agneu"/.test(svg())
    && (svg().match(/class="agp"/g)||[]).length===auto.length);
  ok('[#96] Einschalten allein schreibt noch nichts', !('ausgleich_override_mm' in ps()));
  // Exklusivitaet in BEIDE Richtungen — gegen Durchbruch-, Achsen- und Zwischenspannpunkt-Modus.
  WP.setEdit(true); WP.setAgEdit(true);
  ok('[#96] Ausgleichs-Editor schaltet den Durchbruch-Modus ab', WP.agEdit===true);
  WP.setAxisEdit(true);
  ok('[#96] Achsen-Editor schaltet den Ausgleichs-Editor ab', WP.axisEdit===true && WP.agEdit===false);
  WP.setAgEdit(true);
  ok('[#96] und umgekehrt', WP.agEdit===true && WP.axisEdit===false);
  WP.setZpEdit(true);
  ok('[#96] Zwischenspannpunkt-Editor schaltet den Ausgleichs-Editor ab',
    WP.zpEdit===true && WP.agEdit===false);
  WP.setAgEdit(true);
  ok('[#96] Ausgleichs-Editor schaltet den Zwischenspannpunkt-Editor ab',
    WP.agEdit===true && WP.zpEdit===false && WP.axisEdit===false);
  // Hinzufuegen: aus dem Auto-Stand wird ein Override, der ans Wandelement geht.
  WP.addAgAt(777); WP.run();
  const soll=[...auto,777].sort((a,b)=>a-b);
  ok('[#96] Punkt hinzufuegen (777 mm) landet im gespeicherten Override',
    JSON.stringify(ps().ausgleich_override_mm)===JSON.stringify(soll));
  ok('[#96] der Override ist die alleinige Quelle — genau diese Punkte, nichts aufgefuellt',
    JSON.stringify(xs())===JSON.stringify(soll)
    && WP.ausgleichspunkte.every(p=>p.art==='manuell'));
  // Verschieben: 777 -> 900 (ueber die Auswahl, wie der Zug es tut)
  WP.selAg(777); WP.setManualAg(soll.map(x=>x===777?900:x));
  const soll2=[...auto,900].sort((a,b)=>a-b);
  ok('[#96] Punkt verschieben (777 -> 900)',
    JSON.stringify(ps().ausgleich_override_mm)===JSON.stringify(soll2)
    && JSON.stringify(xs())===JSON.stringify(soll2));
  // Loeschen ueber die Auswahl (wie im Bedienweg „Punkt loeschen")
  WP.selAg(900); WP.delAg(900); WP.run();
  ok('[#96] Punkt loeschen laesst genau die anderen stehen',
    JSON.stringify(ps().ausgleich_override_mm)===JSON.stringify(auto));
  // Ein Wandende darf weg — es wird KEIN Pflichtpunkt nachgeschoben ([A-24] sperrt [A-21]).
  WP.selAg(0); WP.delAg(0); WP.run();
  ok('[#96] geloeschtes Wandende wird nicht nachgeschoben',
    !xs().includes(0) && xs().length===auto.length-1
    && JSON.stringify(xs())===JSON.stringify(ps().ausgleich_override_mm));
  // [A-24] Ausdrueckliche LEERE Auswahl ist „keine Punkte" und faellt NICHT auf Auto zurueck.
  WP.setManualAg([]);
  ok('[#96] leere Auswahl: keine Punkte, kein Rueckfall auf die Verteilung',
    xs().length===0 && JSON.stringify(ps().ausgleich_override_mm)==='[]'
    && !/class="agp"/.test(svg()));
  // Ungueltige Werte werden benannt und NICHT auf eine erreichbare Lage gerundet.
  WP.setManualAg([500,2001,-5]);
  ok('[#96] ungueltige Werte benannt statt gerundet',
    JSON.stringify(xs())==='[500]'
    && (WP.RESULT.wandelement.validation.ausgleich_fehler||[]).length===2
    && /Ausgleichspunkte \[A-24\]/.test(document.getElementById('warns').textContent));
  // Speicher-Lade-Umlauf: das gespeicherte Element zurueck ins Formular -> dieselbe Liste.
  WP.setManualAg([250,1250,1900]);
  const gespeichert=JSON.parse(JSON.stringify(store.aktivesWandelement()));
  ok('[#96] Umlauf: der Override steht so im gespeicherten Element',
    JSON.stringify(gespeichert.prestress.ausgleich_override_mm)==='[250,1250,1900]');
  WP.applyWand(gespeichert); WP.run();
  ok('[#96] Umlauf: Laden liefert dieselbe Override-Liste zurueck',
    JSON.stringify(WP.manualAg)==='[250,1250,1900]'
    && JSON.stringify(xs())==='[250,1250,1900]'
    && JSON.stringify(store.aktivesWandelement().prestress.ausgleich_override_mm)==='[250,1250,1900]');
  // Zurueck zu Auto: Override verschwindet vollstaendig, die Verteilung ist wieder da.
  WP.agAuto();
  ok('[#96] Zurueck zu Auto: Override entfernt, nichts Verteiltes gespeichert',
    WP.manualAg===null && !('ausgleich_override_mm' in ps())
    && JSON.stringify(xs())===JSON.stringify(auto)
    && WP.ausgleichspunkte.every(p=>p.art!=='manuell'));
  WP.setAgEdit(false);
  ok('[#96] Werkzeug aus: die Griffe verschwinden wieder',
    !/class="agp"/.test(svg()) && !/class="agneu"/.test(svg()));
  // Blosses LADEN darf keinen Punkt schreiben ([P-1]): ein Element ohne Override bleibt ohne.
  const vorherAg=JSON.stringify(ps());
  WP.applyWand(store.aktivesWandelement());
  ok('[#96] blosses Laden schreibt keinen Ausgleichspunkt ins Element',
    JSON.stringify(ps())===vorherAg && !('ausgleich_override_mm' in ps()) && WP.manualAg===null);
}
// ---------------------------------------------------------------------------------------------
// Issue #95 / [A-26]/[A-27]: Deckenanschluss-Editor in Modul 1.
// Gefahren wird derselbe ECHTE Pfad OHNE MAUS wie bei #96: Editor an, Punkt hinzufuegen,
// verschieben, loeschen, „Zurueck zu Auto" — und nach jedem Schritt wird das GESPEICHERTE
// Wandelement geprueft (`store.aktivesWandelement()`), nicht das Formular. Gespeichert werden
// ACHSENRASTER-Indizes, nicht Millimeter.
// ---------------------------------------------------------------------------------------------
setzeLaenge(3250); document.getElementById('hgt').value='2.60';
document.getElementById('modus').value='auto';
WP.setZpEdit(false); WP.setAxisEdit(false); WP.setAgEdit(false); WP.run();
{
  const svg=()=>document.getElementById('plan').innerHTML;
  const ps=()=>store.aktivesWandelement().prestress;
  const ks=()=>WP.deckenanschlusspunkte.map(p=>p.k);
  const achsen=()=>WP.RESULT.wandelement.tension_columns.map(c=>c.k);
  const auto=ks();
  // Ausgangslage: verteilt nach [A-26], nichts davon gespeichert.
  ok('[#95] Auto: ein Punkt je angefangenem Meter (3,25 m -> 4)',
    auto.length===4 && auto[0]===achsen()[0] && auto[3]===achsen()[achsen().length-1]);
  ok('[#95] jeder Punkt liegt auf einer wirklichen Spannachse',
    auto.every(k=>achsen().includes(k)));
  ok('[#95] Auto wird NICHT gespeichert (kein Feld im Wandelement)',
    !('deckenanschluss_grid' in ps()) && WP.manualDc===null
    && WP.deckenanschlusspunkte.every(p=>p.art!=='manuell'));
  ok('[#95] Auto: keine Griffe in der Wandansicht (Griffe nur im Editiermodus)',
    !/class="dcp"/.test(svg()) && !/class="dcneu"/.test(svg()));
  // [P-24]/[D-10]/#97: Die DAUERHAFTE Darstellung ist das rote Z — sie haengt NICHT am
  // Editiermodus und steht auch ohne ihn im Bild, je Anschlusspunkt genau einmal.
  ok('[#95] Wandansicht zeichnet je Anschlusspunkt das gemeinsame Z-Symbol',
    (svg().match(/<polyline class="dcs"/g)||[]).length===auto.length);
  ok('[#95] das Z ist offen, oberer Schenkel links, unterer rechts', (()=>{
    const m=svg().match(/<polyline class="dcs" points="([^"]+)"[^>]*fill="none"/);
    if(!m) return false;
    const p=m[1].split(' ').map(t=>t.split(',').map(Number));
    // SVG-y waechst nach unten: der obere Schenkel liegt LINKS und hoeher, der untere RECHTS.
    return p.length===4 && p[0][1]===p[1][1] && p[2][1]===p[3][1] && p[0][1]<p[2][1]
      && p[0][0]<p[1][0] && p[1][0]===p[2][0] && p[2][0]<p[3][0]; })());
  ok('[#95] Kennfarbe und Klartext kommen aus sembla-montage.js',
    svg().includes(MONT.DECKENANSCHLUSS.farbe)
    && zleg().includes(MONT.DECKENANSCHLUSS.label)
    // Kein lokaler Hex-Wert in Modul 1 — auch nicht an den Griffen des Editiermodus ([D-4]).
    && !/#c0392b/.test(html));
  ok('[#95] Symbolgeometrie ist die geteilte Funktion (identische Zeichenkette)',
    svg().includes(MONT.deckenanschlussSvg(0,0,1,{klasse:'dcs'}).slice(0,26)));
  // #112: Gewindestange, Spannplatte und Kopplungsmutter liegen VOR dem Symbol.
  ok('[#112] das Symbol steht vor den Straengen — die Gewindestange bleibt im Vordergrund',
    svg().indexOf('<polyline class="dcs"')
      < svg().indexOf(`stroke="${MONT.stueckFarbe('standard')}"`));
  // Werkzeug an: Griffe je Punkt, blasse Marke je freier Achse.
  WP.setDcEdit(true);
  ok('[#95] Werkzeug an + Griffe an der Wandoberkante gezeichnet',
    WP.dcEdit===true && /class="dcp"/.test(svg())
    && (svg().match(/class="dcp"/g)||[]).length===auto.length
    && (svg().match(/class="dcneu"/g)||[]).length===achsen().length-auto.length);
  ok('[#95] Einschalten allein schreibt noch nichts', !('deckenanschluss_grid' in ps()));
  // Exklusivitaet in BEIDE Richtungen — gegen alle drei bestehenden Modi und den Durchbruch.
  WP.setEdit(true); WP.setDcEdit(true);
  ok('[#95] Deckenanschluss-Editor schaltet den Durchbruch-Modus ab', WP.dcEdit===true);
  WP.setAxisEdit(true);
  ok('[#95] Achsen-Editor schaltet den Deckenanschluss-Editor ab',
    WP.axisEdit===true && WP.dcEdit===false);
  WP.setDcEdit(true);
  ok('[#95] und umgekehrt', WP.dcEdit===true && WP.axisEdit===false);
  WP.setZpEdit(true);
  ok('[#95] Zwischenspannpunkt-Editor schaltet ihn ab', WP.zpEdit===true && WP.dcEdit===false);
  WP.setAgEdit(true);
  ok('[#95] Ausgleichs-Editor ebenso', WP.agEdit===true && WP.dcEdit===false);
  WP.setDcEdit(true);
  ok('[#95] Deckenanschluss-Editor schaltet alle drei ab',
    WP.dcEdit===true && WP.zpEdit===false && WP.agEdit===false && WP.axisEdit===false);
  // Hinzufuegen: aus dem Auto-Stand wird ein Override, der ans Wandelement geht.
  const frei=achsen().find(k=>!auto.includes(k));
  WP.addDcAt(frei); WP.run();
  const soll=[...auto,frei].sort((a,b)=>a-b);
  ok('[#95] Punkt hinzufuegen landet im gespeicherten Override',
    JSON.stringify(ps().deckenanschluss_grid)===JSON.stringify(soll));
  ok('[#95] der Override ist die alleinige Quelle — genau diese Achsen, nichts aufgefuellt',
    JSON.stringify(ks())===JSON.stringify(soll)
    && WP.deckenanschlusspunkte.every(p=>p.art==='manuell'));
  // Verschieben ueber die Auswahl (wie der Zug es tut) — Ziel ist wieder eine Spannachse.
  const frei2=achsen().find(k=>!soll.includes(k));
  WP.selDc(frei); WP.setManualDc(soll.map(k=>k===frei?frei2:k));
  const soll2=[...auto,frei2].sort((a,b)=>a-b);
  ok('[#95] Punkt verschieben (Fang auf die naechste Spannachse)',
    JSON.stringify(ps().deckenanschluss_grid)===JSON.stringify(soll2)
    && JSON.stringify(ks())===JSON.stringify(soll2));
  // Loeschen ueber die Auswahl (Bedienweg „Punkt loeschen")
  WP.selDc(frei2); WP.delDc(frei2); WP.run();
  ok('[#95] Punkt loeschen laesst genau die anderen stehen',
    JSON.stringify(ps().deckenanschluss_grid)===JSON.stringify(auto));
  // Eine Randachse darf weg — es wird nichts nachgeschoben ([A-27] sperrt [A-26]).
  WP.selDc(auto[0]); WP.delDc(auto[0]); WP.run();
  ok('[#95] geloeschte Randachse wird nicht nachgeschoben',
    !ks().includes(auto[0]) && ks().length===auto.length-1
    && JSON.stringify(ks())===JSON.stringify(ps().deckenanschluss_grid));
  // [A-27] Ausdrueckliche LEERE Auswahl ist „kein Deckenanschluss" und faellt NICHT auf Auto zurueck.
  WP.setManualDc([]);
  ok('[#95] leere Auswahl: keine Punkte, kein Rueckfall auf die Verteilung',
    ks().length===0 && JSON.stringify(ps().deckenanschluss_grid)==='[]'
    && !/class="dcp"/.test(svg()));
  // Werte ohne Spannachse werden benannt und NICHT auf die Nachbarachse geschoben.
  const keineAchse=[...Array(WP.RESULT.wandelement.N_grid).keys()].find(k=>!achsen().includes(k));
  WP.setManualDc([auto[1],keineAchse,999]);
  ok('[#95] Werte ohne Spannachse benannt statt verschoben',
    JSON.stringify(ks())===JSON.stringify([auto[1]])
    && (WP.RESULT.wandelement.validation.deckenanschluss_fehler||[]).length===2
    && /Deckenanschluss \[A-27\]/.test(document.getElementById('warns').textContent));
  // Speicher-Lade-Umlauf: das gespeicherte Element zurueck ins Formular -> dieselbe Liste.
  WP.setManualDc([auto[0],auto[2]]);
  const gespeichertDc=JSON.parse(JSON.stringify(store.aktivesWandelement()));
  ok('[#95] Umlauf: der Override steht so im gespeicherten Element',
    JSON.stringify(gespeichertDc.prestress.deckenanschluss_grid)===JSON.stringify([auto[0],auto[2]]));
  WP.applyWand(gespeichertDc); WP.run();
  ok('[#95] Umlauf: Laden liefert dieselbe Override-Liste zurueck',
    JSON.stringify(WP.manualDc)===JSON.stringify([auto[0],auto[2]])
    && JSON.stringify(ks())===JSON.stringify([auto[0],auto[2]])
    && JSON.stringify(ps().deckenanschluss_grid)===JSON.stringify([auto[0],auto[2]]));
  // Zurueck zu Auto: Override verschwindet vollstaendig, die Verteilung ist wieder da.
  WP.dcAuto();
  ok('[#95] Zurueck zu Auto: Override entfernt, nichts Verteiltes gespeichert',
    WP.manualDc===null && !('deckenanschluss_grid' in ps())
    && JSON.stringify(ks())===JSON.stringify(auto)
    && WP.deckenanschlusspunkte.every(p=>p.art!=='manuell'));
  WP.setDcEdit(false);
  ok('[#95] Werkzeug aus: die Griffe verschwinden wieder',
    !/class="dcp"/.test(svg()) && !/class="dcneu"/.test(svg()));
  // Blosses LADEN darf keinen Punkt schreiben ([P-1]): ein Element ohne Override bleibt ohne.
  const vorherDc=JSON.stringify(ps());
  WP.applyWand(store.aktivesWandelement());
  ok('[#95] blosses Laden schreibt keinen Deckenanschluss ins Element',
    JSON.stringify(ps())===vorherDc && !('deckenanschluss_grid' in ps()) && WP.manualDc===null);
  // Modul 3 bleibt unberuehrt: der Override bewegt weder Spannachsen noch Stueckliste.
  const vorherBom=JSON.stringify(WP.RESULT.wandelement.bom);
  const vorherAchsen=JSON.stringify(achsen());
  WP.setManualDc([auto[0]]);
  ok('[#95] der Override aendert weder Spannachsen noch Stueckliste (keine Statik)',
    JSON.stringify(WP.RESULT.wandelement.bom)===vorherBom
    && JSON.stringify(achsen())===vorherAchsen);
  WP.dcAuto();
}

setzeLaenge(2000); document.getElementById('hgt').value='2.60'; WP.run();

// ---------------------------------------------------------------------------------------------
// Issue #106 (Bedienteil): Achsen treffen dort, wo geklickt wird, und werden verschoben statt
// verdoppelt. Gefahren wird der ECHTE Pfad: Musterwand ueber buildWall -> run() -> das erzeugte
// SVG; aus ihm werden die BILDPUNKTE der gezeichneten Achsen entnommen und ueber die
// Zeigerbehandler von `#plan` zurueckgespielt.
//
// Der Zoom wird nicht simuliert, sondern aus den ECHTEN CSS-Regeln abgeleitet. Seit #106
// (Bauteildarstellung) setzt draw() die Anzeigebreite INLINE aus dem viewBox:
//   Breite  = vbW * Zoom                     (`width:calc(<vbW>px * var(--zoom))`)
//   Hoehe   = Breite * vbH/vbW = vbH * Zoom  (`height:auto`, kein `max-height` mehr)
// Das Anzeigefeld hat damit IMMER das viewBox-Verhaeltnis: „xMidYMid meet" hat nichts mehr zu
// letterboxen, der Versatz ist null und der Skalenfaktor ist genau der Zoomfaktor. Die
// Klemme aus #100 (`max-height`), die das Feld breiter machte als den viewBox und den
// Rueckweg um mehrere Rasterfelder verschob, ist damit KONSTRUKTIV weg — was nicht
// hineinpasst, scrollt im Rahmen. Der Rueckweg wird hier trotzdem allgemein gerechnet
// (min() und Versatz bleiben stehen), damit der Test nicht die Vereinfachung voraussetzt,
// die er pruefen soll. Rand (`left`/`top`) ist bewusst nicht 0.
{
  const planEl=document.getElementById('plan');
  const PAD=46, RAND_L=17, RAND_T=29;
  function view(){
    const w=WP.RESULT.wandelement, L=w.length_mm, H=w.height_mm;
    // Masstab aus DERSELBEN Quelle wie draw() — nicht nachgerechnet ([P-6]).
    const sc=WP.ansichtSc(), hPx=H*sc;
    const vbW=Math.round(L*sc+2*PAD), vbH=Math.round(hPx+2*PAD);
    const z=WP.zoomPct/100, rw=vbW*z, rh=vbH*z;
    const s=Math.min(rw/vbW, rh/vbH);
    return {L,H,sc,hPx,vbW,vbH,rw,rh,s,offX:(rw-vbW*s)/2,offY:(rh-vbH*s)/2,back:/Rückseite/.test(planEl.innerHTML)};
  }
  function stelleRect(){ const v=view(); planEl._rect={left:RAND_L,top:RAND_T,width:v.rw,height:v.rh}; return v; }
  /** viewBox-Punkt -> Client-Punkt (Umkehrung von „xMidYMid meet"). */
  function ev(sx,sy){ const v=stelleRect();
    return {clientX:RAND_L+v.offX+sx*v.s, clientY:RAND_T+v.offY+sy*v.s, pointerId:3, preventDefault(){}}; }
  const feuer=(typ,sx,sy)=>planEl.dispatch(typ, ev(sx,sy));
  const los=()=>globalThis.window.dispatch('pointerup',{});
  /** Wandmillimeter -> viewBox-Punkt (dieselbe Abbildung wie X()/Y() in draw()). */
  const sxVon=xmm=>{ const v=view(); return PAD+(v.back?(v.L-xmm):xmm)*v.sc; };
  const syVon=zmm=>{ const v=view(); return PAD+v.hPx-zmm*v.sc; };
  /** Bildpunkte der GEZEICHNETEN Spannachsen (Griffkreis) bzw. Punkthoehen (Griff-Linie). */
  const achsPunkte=()=>[...planEl.innerHTML.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="6"[^>]*cursor:grab/g)]
    .map(m=>({sx:+m[1], sy:+m[2]}));
  const zpPunkte=()=>[...planEl.innerHTML.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)"[^>]*stroke-dasharray="6 4"[^>]*cursor:grab/g)]
    .map(m=>({sx:(+m[1]+ +m[3])/2, sy:+m[2]}));
  const gleich=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

  WP.applyWand(Object.assign(buildWall('T106',2000,2600,[]),{wandtyp:'ohne_wind'}));
  document.getElementById('modus').value='auto'; WP.run();
  WP.setAxisEdit(true);                       // ensureManual() uebernimmt die Auto-Achsen
  const ZOOMS=[25,100,400];

  // (a) Jeder gezeichnete Achs-Bildpunkt rechnet auf GENAU diese Achse zurueck: das Anfassen
  //     legt keine zweite Achse an — bei jedem Zoomgrad und abweichendem Seitenverhaeltnis.
  for(const z of ZOOMS){
    WP.setzeZoom(z); const v=stelleRect();
    const vorher=[...WP.manualCols], punkte=achsPunkte();
    // Neu seit der Bauteildarstellung (#106): das Anzeigefeld hat GENAU das
    // viewBox-Verhaeltnis, der Letterbox-Versatz ist null und der Skalenfaktor ist der
    // Zoomfaktor. Damit ist der alte Trefferfehler konstruktiv ausgeschlossen und nicht
    // bloss wegtariert. Die allgemeine Abbildung wird unten mit einem absichtlich
    // abweichenden Anzeigefeld weiter geprueft.
    ok(`[#106] Zoom ${z} %: Anzeigefeld traegt genau das viewBox-Verhaeltnis (kein Letterbox)`,
      Math.abs(v.rw/v.rh - v.vbW/v.vbH)<1e-9 && Math.abs(v.offX)<1e-9
      && Math.abs(v.offY)<1e-9 && Math.abs(v.s - z/100)<1e-9);
    ok(`[#106] Zoom ${z} %: jede Achse ist mit Griff gezeichnet`, punkte.length===vorher.length && punkte.length>0);
    let sauber=true;
    for(const p of punkte){ feuer('pointerdown',p.sx,p.sy); los();
      if(!gleich(WP.manualCols,vorher)) sauber=false; }
    ok(`[#106] Zoom ${z} %: Anfassen einer vorhandenen Achse verdoppelt sie nicht`, sauber);
  }

  // (a2) Sicherheitsnetz: auch mit einem ABWEICHENDEN Anzeigefeld (etwa wenn ein Browser die
  //      Breite klemmt) muss der Rueckweg treffen. Dann greift „xMidYMid meet" mit echtem
  //      Versatz — genau der Pfad, der vor #106 die Achsen verdoppelt hat.
  {
    WP.setzeZoom(100);
    const v=view(); const rw=v.vbW*0.6, rh=v.vbH*1.4;         // schmaler UND hoeher
    const s=Math.min(rw/v.vbW, rh/v.vbH), offX=(rw-v.vbW*s)/2, offY=(rh-v.vbH*s)/2;
    planEl._rect={left:RAND_L,top:RAND_T,width:rw,height:rh};
    const vorher=[...WP.manualCols], punkte=achsPunkte();
    let sauber=punkte.length===vorher.length && punkte.length>0;
    for(const p of punkte){
      planEl.dispatch('pointerdown',{clientX:RAND_L+offX+p.sx*s, clientY:RAND_T+offY+p.sy*s,
        pointerId:3, preventDefault(){}});
      los();
      if(!gleich(WP.manualCols,vorher)) sauber=false;
    }
    ok('[#106] auch mit abweichendem Anzeigefeld trifft der Rueckweg jede Achse', sauber);
    ok('[#106] der Zusatzfall hat wirklich Letterbox-Versatz (sonst prueft er nichts)',
      offY>1 && Math.abs(rw/rh - v.vbW/v.vbH)>0.2);
  }

  // (b) Ziehen: die ANGEFASSTE Achse wandert, die Achszahl bleibt — bei jedem Zoomgrad.
  for(const z of ZOOMS){
    WP.setzeZoom(z); stelleRect();
    const vor=[...WP.manualCols], punkte=achsPunkte();
    const kQuelle=vor[0], p0=punkte[0];
    const kZiel=[...Array(WP.RESULT.wandelement.N_grid).keys()].find(k=>!vor.includes(k));
    feuer('pointerdown',p0.sx,p0.sy);
    feuer('pointermove',sxVon(62.5+GRID*kZiel),p0.sy);
    los();
    const soll=[...vor.filter(k=>k!==kQuelle),kZiel].sort((a,b)=>a-b);
    ok(`[#106] Zoom ${z} %: Ziehen verschiebt die Achse ${kQuelle} -> ${kZiel} ohne zweite Achse`,
      gleich(WP.manualCols,soll));
  }

  // (c) Klick auf eine FREIE Rasterspalte legt die Achse genau dort an — nicht daneben.
  for(const z of ZOOMS){
    WP.setzeZoom(z); stelleRect();
    const vor=[...WP.manualCols];
    const kNeu=[...Array(WP.RESULT.wandelement.N_grid).keys()].find(k=>!vor.includes(k));
    feuer('pointerdown',sxVon(62.5+GRID*kNeu),syVon(WP.RESULT.wandelement.height_mm/2)); los();
    ok(`[#106] Zoom ${z} %: neue Achse entsteht genau bei k=${kNeu}`,
      gleich(WP.manualCols,[...vor,kNeu].sort((a,b)=>a-b)));
  }
  // Auch der ZellRAND traegt noch: 62,5 mm neben der Achse ist die Fangweite (halbe Rasterzelle).
  {
    WP.setzeZoom(100); stelleRect();
    const vor=[...WP.manualCols], k=vor[0];
    feuer('pointerdown',sxVon(62.5+GRID*k+62.4),syVon(1000)); los();
    ok('[#106] Fangweite ist die halbe Rastereinheit (62,4 mm daneben fasst noch an)',
      gleich(WP.manualCols,vor));
  }

  // (d) Dieselbe Umkehrung in der GESPIEGELTEN Ansicht (Rueckseite).
  {
    document.getElementById('viewToggle').dispatch('click');   // -> Rueckseite
    WP.setzeZoom(100); stelleRect();
    const vor=[...WP.manualCols], punkte=achsPunkte(), kQuelle=vor[0];
    const kZiel=[...Array(WP.RESULT.wandelement.N_grid).keys()].find(k=>!vor.includes(k));
    feuer('pointerdown',punkte[0].sx,punkte[0].sy);
    feuer('pointermove',sxVon(62.5+GRID*kZiel),punkte[0].sy);
    los();
    ok('[#106] Rueckseite: gespiegelte Abbildung trifft und verschiebt dieselbe Achse',
      gleich(WP.manualCols,[...vor.filter(k=>k!==kQuelle),kZiel].sort((a,b)=>a-b)));
    document.getElementById('viewToggle').dispatch('click');   // zurueck auf die Vorderseite
  }

  // (e) Anzeige: belegte Spalte anfassbar (`cursor:grab`), freie Spalte als Neuanlage
  //     gekennzeichnet (`cursor:copy`) — nur im Editiermodus.
  ok('[#106] Achsen-Editor zeigt Anfassen und Neuanlegen getrennt an',
    /style="cursor:grab"/.test(planEl.innerHTML) && /class="neuzone"[^>]*cursor:copy/.test(planEl.innerHTML)
    && /class="neuachse"[^>]*cursor:copy/.test(planEl.innerHTML));
  WP.setManualCols(null); WP.setAxisEdit(false);
  ok('[#106] ausserhalb des Editiermodus bleibt keine Bedienhilfe stehen',
    !/cursor:grab/.test(planEl.innerHTML) && !/class="neuzone"/.test(planEl.innerHTML));

  // (f) Zwischenspannachsen: identisches Verhalten in der Lagenachse.
  WP.setZpEdit(true);                          // ensureManualZp() uebernimmt die Auto-Hoehen
  for(const z of ZOOMS){
    WP.setzeZoom(z); stelleRect();
    const vorher=[...WP.manualZp], punkte=zpPunkte();
    ok(`[#106] Zoom ${z} %: jede Zwischenspannachse ist mit Griff gezeichnet`,
      punkte.length===vorher.length && punkte.length>0);
    let sauber=true;
    for(const p of punkte){ feuer('pointerdown',p.sx,p.sy); los();
      if(!gleich(WP.manualZp,vorher)) sauber=false; }
    ok(`[#106] Zoom ${z} %: Anfassen einer Zwischenspannachse verdoppelt sie nicht`, sauber);
  }
  {
    WP.setzeZoom(400); stelleRect();
    const vor=[...WP.manualZp], p0=zpPunkte()[0], zZiel=vor[0]+400;
    feuer('pointerdown',p0.sx,p0.sy);
    feuer('pointermove',p0.sx,syVon(zZiel));
    los();
    ok('[#106] Zwischenspannachse nach oben ziehen wechselt die Lagen-Oberkante',
      WP.manualZp.length===vor.length && WP.manualZp.includes(zZiel) && !WP.manualZp.includes(vor[0]));
    const vor2=[...WP.manualZp], zNeu=COURSE*2;
    feuer('pointerdown',sxVon(1000),syVon(zNeu)); los();
    ok('[#106] Klick auf eine freie Lagen-Oberkante legt den Punkt genau dort an',
      gleich(WP.manualZp,[...vor2,zNeu].sort((a,b)=>a-b)));
    ok('[#106] Zwischenspann-Editor zeigt Anfassen und Neuanlegen getrennt an',
      /stroke-dasharray="6 4"[^>]*cursor:grab/.test(planEl.innerHTML)
      && /class="zneu"[^>]*cursor:copy/.test(planEl.innerHTML));
  }
  WP.zpAuto(); WP.setZpEdit(false);
  WP.setzeZoom(WP.ZOOM_FIT); planEl._rect=null;
  ok('[#106] kein neues gespeichertes Feld: nur die bestehenden Uebersteuerungen',
    store.aktivesWandelement().prestress.columns_grid===null
    && !('zwischenpunkte_mm' in store.aktivesWandelement().prestress)
    && !/fang|Fangweite/i.test(JSON.stringify(store.aktiveEingaben())));
  ok('[#106] die Rueckrechnung nutzt kein getScreenCTM und liest den viewBox nicht aus dem DOM',
    !/getScreenCTM|createSVGPoint/.test(html)
    && /function bildPunkt\(e\)\{[\s\S]*?getBoundingClientRect/.test(html)
    && !/getAttribute\('viewBox'\)/.test(html));
}
document.getElementById('hgt').value='2.60'; WP.run();

// Issue #104: Die Startachse ist ERSATZLOS zurueckgebaut. Der Rechenkern leitet die
// Grundachsen seit a70e169 allein aus dem Verband der untersten Lage ab ([V-3]/[V-11]);
// [V-5] ist abgeloest. Geprueft wird deshalb dreierlei: dass das Bedienelement in der
// ECHTEN HTML-Quelle nicht mehr existiert, dass Modul 1 ohne dieses Feld unveraendert
// rechnet, und dass ein Altbestand MIT gespeichertem Wert weiterhin ladbar und gueltig
// bleibt (der Wert ist wirkungslos, es haengt nichts daran).
// N=16 (2,00 m) ist bewusst nicht glatt durch den Strangabstand teilbar.
WP.applyWand(Object.assign(buildWall('T13',2000,2600,[]),{wandtyp:'mit_wind'}));
document.getElementById('modus').value='nachweis'; document.getElementById('spacing').value='3';
document.getElementById('force').value='60'; WP.run();
// Gegen die ECHTE HTML-Quelle, nicht gegen den DOM-Stub: der legt Elemente bei Bedarf an
// und koennte ein entferntes Bedienelement nie als fehlend melden.
ok('#104 Auswahlfeld der ersten Vorspannachse ersatzlos entfernt',
   !/id="startAchse"/.test(html) && !/Erste Vorspannung/.test(html)
   && !/Rasterachse \(Standard\)/.test(html) && !/2\. Rasterachse/.test(html));
ok('#104 Modul 1 leitet keinen Startachsenwert mehr ab (kein Schreibweg im Skript)',
   !/start_axis_grid\s*[:=]/.test(html));
const ks0=WP.RESULT.wandelement.tension_columns.map(c=>c.k);
// [V-3]/[V-11]: unterste Lage [i2,i2,i3,i3,i3,i3] -> Grundachsen 1 (i2 am Anfang) und die
// i3-Mitten 5/8/11/14; 14 = N-2 traegt das rechte Wandende. 3 und 13 ergaenzt [V-2]/[V-4].
ok('#104 Grundachsen aus dem Verband, kein Randfeld — ohne das Bedienfeld unveraendert',
   JSON.stringify(ks0)==='[1,3,5,8,11,13,14]');
ok('#104 weder 1. Rasterachse noch Endachse N-1 belegt', !ks0.includes(0) && !ks0.includes(15));
const x0=WP.RESULT.wandelement.prestress.max_span_grid;
ok('alle Abstände <= Strangabstand x', x0===3 && ks0.every((k,i)=>i===0||k-ks0[i-1]<=x0));
ok('[V-2] Steinabdeckung dabei lückenlos',
   WP.RESULT.wandelement.validation.ungehaltene_steine.length===0);
// auch im Auto-Modus (Strangabstand von der Engine optimiert) — die Iteration gibt dem
// Rechenkern keine Startachse mehr vor (`psOf` in sembla-engine.js).
document.getElementById('modus').value='auto'; WP.run();
const wA=WP.RESULT.wandelement, ksA=wA.tension_columns.map(c=>c.k);
ok('#104 Auto-Modus: Wandenden auf 1 und N-2, Abstände <= optimiertem x',
   ksA[0]===1 && ksA.includes(wA.N_grid-2) && !ksA.includes(0) && !ksA.includes(wA.N_grid-1)
   && ksA.every((k,i)=>i===0||k-ksA[i-1]<=wA.prestress.max_span_grid));
document.getElementById('modus').value='nachweis'; WP.run();
// Altbestand: ein gespeichertes Wandelement MIT `start_axis_grid: 1` bleibt ladbar, gueltig
// und liefert dieselben Achsen wie ein Altstand ohne das Feld. Modul 1 wertet es nicht mehr
// aus, migriert nichts und loescht nichts; der Wert ist wirkungslos.
WP.applyWand(Object.assign(buildWall('Gespeichert',2000,2600,[],null,{start_axis_grid:1}),{wandtyp:'mit_wind'}));
ok('#104 Altbestand mit gespeicherter Startachse 1 bleibt ladbar und gueltig',
   !!WP.RESULT && WP.RESULT.wandelement.validation.buildable
   && JSON.stringify(WP.RESULT.wandelement.tension_columns.map(c=>c.k))==='[1,3,5,8,11,13,14]');
const alt=buildWall('Alt',2000,2600,[]); delete alt.prestress.start_axis_grid;   // Altstand ohne Feld
WP.applyWand(Object.assign(alt,{wandtyp:'mit_wind'}));
ok('#104 Altstand ohne Feld liefert bit-genau dieselben Achsen',
   JSON.stringify(WP.RESULT.wandelement.tension_columns.map(c=>c.k))==='[1,3,5,8,11,13,14]');

// Auto-Speichern (kein Button mehr): jede echte Änderung legt/aktualisiert das aktive Element.
// Gefahren wird das ueber die HOEHE — die Laenge ist seit #56 kein Bedienweg mehr (s. u.).
document.getElementById('hgt').value='2.60'; document.getElementById('hgt').dispatch('input');
const gesp=store.aktivesWandelement();
ok('Auto-Speichern übergibt Wandelement an Storage', gesp && gesp.length_mm>0 && !!gesp.verification);

// ---- Issue #56: Modul 1 fuehrt die Laenge nicht mehr -------------------------------
// Geprueft wird gegen die ECHTE HTML-Quelle, nicht gegen den DOM-Stub: der legt Elemente
// bei Bedarf an und koennte ein entferntes Attribut nie als fehlend melden.
ok('#56 Laengenfeld ist nur noch Anzeige (readonly im Markup)',
  /<input type="number" id="len"[^>]*\breadonly\b/.test(html));
ok('#56 kein indirekter Schreibweg: `len` haengt an keinem Ereignishoerer mehr',
  /\['hgt','qk','gammaQ'/.test(html) && !/\['len','hgt'/.test(html));
// Seit #69 traegt den Verweis nicht mehr ein dauerhaft sichtbarer Absatz, sondern ein knapper
// Tooltip AM Bedienelement — der Fundort der Laenge bleibt damit benannt (Absicht von #56).
ok('#56 die Oberflaeche verweist fuer die Laenge auf den Geschosseditor',
  /<input type="number" id="len"[^>]*title="[^"]*Geschosseditor[^"]*"/.test(html));
// Muss 7: andere fachliche Aenderungen rechnen weiter — mit der GESPEICHERTEN Laenge.
const vorLaenge=store.aktivesWandelement().length_mm;
document.getElementById('qk').value='2.0'; document.getElementById('qk').dispatch('input');
const nachQk=store.aktivesWandelement();
ok('#56 andere Aenderung speichert bei unveraenderter Laenge',
  nachQk.length_mm===vorLaenge && !!nachQk.verification);
WP.addOpening('tuer');
const nachOp=store.aktivesWandelement();
ok('#56 Oeffnung hinzufuegen laesst die gespeicherte Laenge unberuehrt',
  nachOp.length_mm===vorLaenge && nachOp.openings.length===1);
// Ausgangszustand fuer die folgenden Abschnitte wiederherstellen (glatte 2,00-m-Wand).
document.getElementById('qk').value='1.00';
// Ebenfalls ausdruecklich Kopfblech (#92): die nachfolgenden Abschnitte messen
// Kopfblech-Module am aktiven Wandelement.
WP.applyWand(Object.assign(buildWall('Alt',2000,2600,[],null,{top_connection:'blech'}),{wandtyp:'mit_wind'}));

// ---- Issue #69: linke Eingabespalte ohne statische Anleitungstexte ------------------
// Geprueft wird der ECHTE linke Bedienbereich der HTML-Quelle — und zwar OHNE Kommentare:
// die Quellkommentare erklaeren dieselben Sachverhalte mit denselben Stichworten und wuerden
// die Abwesenheitsprueufungen sonst falsch rot faerben.
const LINKS = html.match(/<div class="controls panel">[\s\S]*?<div class="stage panel">/)[0]
  .replace(/<!--[\s\S]*?-->/g,'');
// #72 verschaerft #69: der einleitende Absatz ist ersatzlos entfallen (samt totem CSS).
ok('[#72] kein einleitender intro-Absatz mehr auf der Seite',
  !/class="intro"/.test(html) && !/\.intro\{/.test(html)
  && !/Katalogprodukte dieser Wand/.test(html));
// Fuer die Abwesenheitspruefung zaehlt der SICHTBARE Text: knappe Hover-Tooltips am
// Bedienelement sind ausdruecklich erlaubt und werden deshalb vorher herausgeschnitten.
const SICHTBAR = LINKS.replace(/\stitle="[^"]*"/g,'');
ok('[#69] keine statischen Anleitungsbloecke mehr in der linken Spalte', (()=>{
  const verboten=[
    'Alles Übrige auf dieser',            // Laengenfuehrung
    'Maximalhöhe',                        // Staffelung
    'Achsen an Öffnungs- und Stufenkanten',  // Spannachsenverteilung
    'Fuß immer Bodenblech (10 mm). Kopf wahlweise',   // Vorspann-Hardware (statischer Absatz)
    'Die Wände werden im Innenraum montiert',         // Reststueck-Erklaerung
    'alleinige Quelle',                   // Produktauswahl
    'Vorbelegt aus dem Katalog',          // Produktauswahl
    'Gespeichert werden nur',             // Produktauswahl
    'Ein Datenmodell',                    // gemeinsames Datenmodell
  ];
  return verboten.every(t=>!SICHTBAR.includes(t));
})());
ok('[#69] die linke Spalte traegt keine Regelreferenzen mehr', !/\[(Z|P|A|V|D)-\d+\]/.test(SICHTBAR));
ok('[#69] Langtext zur Laengenfuehrung ersatzlos entfernt (kein lenHint-Block mehr)',
  !/id="lenHint"/.test(html));
ok('[#69] Kennzeichnung „zu bestätigen“ entfernt, Materialfelder unveraendert',
  !/zu bestätigen/.test(LINKS) && /<h3>Materialannahmen<\/h3>/.test(LINKS)
  && /id="fcd" value="20"/.test(LINKS) && /id="cfd" value="0.60"/.test(LINKS)
  && /id="rho" value="14"/.test(LINKS));
ok('[#69] Materialwerte gehen unveraendert in die Vorgaben', (()=>{
  const m=WP.vorgaben().material;
  return m.fcd_Nmm2===20 && m.cfd===0.60 && m.rho===14; })());
ok('[#69] Gruppenueberschriften und Bedienelemente bleiben in derselben Reihenfolge', (()=>{
  const soll=['1 · Wand','Öffnungen','Staffelung (getreppter Aufbau)','Seiten (Funktion)',
    '2 · Auslegung','Last (horizontal, Fläche)','Modus','Vorspann-Hardware',
    'Materialannahmen','3 · Produkte (Bauteilkatalog)'];
  let pos=-1;
  for(const t of soll){ const i=LINKS.indexOf('>'+t+'<'); if(i<=pos) return false; pos=i; }
  const felder=['len','hgt','addTuer','addFenster','durchTool','durchClear','axisTool','axisDel',
    'axisAuto','addStep','sideVorne','sideHinten','qk','gammaQ','modus','spacing','force',
    'blechCm','topConn','rodUeber','fcd','cfd','rho','prodRollen','run'];
  return felder.every(id=>LINKS.includes('id="'+id+'"')); })());
ok('[#69] dynamische Zustandsanzeigen bleiben im linken Bereich erhalten',
  ['rodQuelle','rodRestQuelle','prodInfo','prodRollen','saveHint']
    .every(id=>LINKS.includes('id="'+id+'"')));
// Zweite Kuerzung (PO-Fassung 2026-08-12): die kontextabhaengigen Kurzhilfen fuer den
// Durchbruch-Modus und die Spannachsenbearbeitung sind ERSATZLOS entfernt — sie erscheinen
// weder im Markup noch im Skript und wandern auch nicht in Tooltips oder andere Texte.
ok('[#69] Durchbruch-/Spannachsen-Kurzhilfen ersatzlos entfernt',
  !/durchHint/.test(html) && !/axisHint/.test(html)
  && !/Klick auf eine Zelle/.test(html) && !/Achse ziehen = verschieben/.test(html));
// Die Werkzeuge selbst bleiben ohne Kurzhilfe voll bedienbar (echter Klick-/Zustandspfad).
ok('[#69] Durchbruch-Werkzeug bedienbar: Zellraster erscheint und verschwindet', (()=>{
  const plan=document.getElementById('plan');
  document.getElementById('durchTool').dispatch('click');
  const an=/class="cell"/.test(plan.innerHTML);
  document.getElementById('durchTool').dispatch('click');
  return an && !/class="cell"/.test(plan.innerHTML); })());
ok('[#69] Spannachsen-Werkzeug bedienbar: Achsgriffe erscheinen und verschwinden', (()=>{
  WP.setAxisEdit(true); const an=/cursor:grab/.test(document.getElementById('plan').innerHTML);
  WP.setAxisEdit(false);
  return an && !/cursor:grab/.test(document.getElementById('plan').innerHTML); })());
ok('[#69] lange Bedienhilfen haengen als Tooltip am Bedienelement',
  /id="axisTool"[^>]*title="[^"]+"/.test(LINKS) && /id="addStep"[^>]*title="[^"]+"/.test(LINKS)
  && /id="topConn"[^>]*title="[^"]+"/.test(LINKS));
WP.setManualCols(null);   // Achsen-Editor hinterlaesst keinen Zustand fuer die naechsten Abschnitte
// Ebenfalls ausdruecklich Kopfblech (#92): die nachfolgenden Abschnitte messen
// Kopfblech-Module am aktiven Wandelement.
WP.applyWand(Object.assign(buildWall('Alt',2000,2600,[],null,{top_connection:'blech'}),{wandtyp:'mit_wind'}));

// ---- Issue #35: Produkte dieser Wand (echte Modul-1-Oberfläche) ----------------------
// Modul 1 wählt DIREKT aus dem vollständigen Katalog; es gibt keinen Freigabepool in Modul 0.
// Nur synthetische Fantasieprodukte.
const KATALOG={ format:'SEMBLA-Bauteilkatalog', version:1, name:'Testkatalog M1', produkte:[
  { id:'stein-i3', kategorie:'stein', bezeichnung:'Stein i3', einheit:'Stk', preis:9.5, breite_mm:375, hoehe_mm:200, dicke_mm:125 },
  { id:'stein-i2', kategorie:'stein', bezeichnung:'Stein i2', einheit:'Stk', preis:7.2, breite_mm:250, hoehe_mm:200, dicke_mm:125 },
  // `hinweis` ist bewusst gesetzt: reine Produkt-Hinweisprosa darf seit #69 nicht mehr
  // dauerhaft in der linken Spalte erscheinen (unten geprueft).
  { id:'rod-1100', kategorie:'gewindestange', bezeichnung:'Stange 1100', einheit:'Stk', preis:3.8, gewinde:'M10', laenge_mm:1100,
    hinweis:'Nur als Beispieltext für Produkt-Hinweisprosa' },
  { id:'rod-1000', kategorie:'gewindestange', bezeichnung:'Stange 1000', einheit:'Stk', preis:3.5, gewinde:'M10', laenge_mm:1000 },
  { id:'rod-1100b', kategorie:'gewindestange', bezeichnung:'Stange 1100 Zweitquelle', einheit:'Stk', preis:4.1, gewinde:'M10', laenge_mm:1100 },
  { id:'blech-boden', kategorie:'blech_platte', bezeichnung:'Bodenblech 1000', einheit:'Stk', preis:18, breite_mm:1000, hoehe_mm:125, dicke_mm:15 },
  // Zweite Standardlaenge fuer den Vorratssatz nach [A-10] (Rastermaß in `breite_mm`).
  { id:'blech-boden-1250', kategorie:'blech_platte', bezeichnung:'Bodenblech 1250', einheit:'Stk', preis:22.5, breite_mm:1250, hoehe_mm:125, dicke_mm:15 },
  { id:'blech-kopf', kategorie:'blech_platte', bezeichnung:'Kopfblech 1000', einheit:'Stk', preis:19, breite_mm:1000, hoehe_mm:125, dicke_mm:15 },
  { id:'dicht-stk', kategorie:'verbrauch', bezeichnung:'Dichtstreifen 20 cm', einheit:'Stk', preis:0.3 },
  // #92 Einbaulagen: die Kopplungsmutter traegt ihre EINBAUHOEHE, die Spannplatte ihre DICKE.
  // `hoehe_mm` an einem Verbrauchsprodukt ist ein regulaeres optionales Massfeld — die
  // Eingabemaske der Kategorie bleibt unveraendert (eigenes Folgepaket), der Wert kommt hier
  // wie im Betrieb aus einer Katalogdatei.
  { id:'kuppl-50', kategorie:'verbrauch', bezeichnung:'Kopplungsmutter M10', einheit:'Stk', preis:0.65, hoehe_mm:50 },
  { id:'kuppl-30', kategorie:'verbrauch', bezeichnung:'Kopplungsmutter M10 kurz', einheit:'Stk', preis:0.55, hoehe_mm:30 },
  { id:'kuppl-ohne', kategorie:'verbrauch', bezeichnung:'Kopplungsmutter ohne Maßangabe', einheit:'Stk', preis:0.6 },
  { id:'platte-12', kategorie:'blech_platte', bezeichnung:'Spannplatte 12', einheit:'Stk', preis:6.4, breite_mm:125, hoehe_mm:125, dicke_mm:12 },
  { id:'rod-rest-210', kategorie:'gewindestange', bezeichnung:'Reststück 210', einheit:'Stk', preis:1.2, gewinde:'M10', laenge_mm:210 },
  { id:'latte-1500', kategorie:'latte', bezeichnung:'Latte 1500', einheit:'Stk', preis:3.5, breite_mm:40, dicke_mm:60, laenge_mm:1500 },
]};
// Modul-1-Rollen decken die bestehenden Wand-/Vorspann-/Anschluss-/Fugen-Positionen ab.
ok('Modul-1-Rollen: Vorspannung, Anschluss (Blech getrennt) und Fugen abgedeckt', (()=>{
  const ids=KAT.rollenVonModul(1).map(r=>r.id);
  return ['i3','i2','rod_std','rod_rest','kupplung','senkkopf','spannmutter',
          'spannplatte','blech_boden','blech_kopf','dicht_stk','dicht'].every(x=>ids.includes(x))
    && !ids.includes('latte') && !ids.includes('verbinder') && !ids.includes('beplankung')
    // [P-18]: Sonderzuschnitt-Ausgangsprodukt und Fuß-Kopplungsmutter sind entfallen.
    && !ids.includes('rod_sonder') && !ids.includes('kuppl_basis');
})());
ok('Produktabschnitt in Modul 1 vorhanden', /id="prodRollen"/.test(html) && /Produkte \(Bauteilkatalog\)/.test(html));
ok('ohne Katalog: Hinweis statt Auswahl', (()=>{ WP.renderProdukte();
  return /Kein Bauteilkatalog/.test(document.getElementById('prodInfo').innerHTML)
    && document.getElementById('prodRollen').innerHTML===''; })());

store.setzeKatalog(KATALOG);
WP.run();   // maßgebende Stangenlänge kommt aus dem gewählten Produkt (1100 mm)
WP.renderProdukte();
const prodHtml=()=>document.getElementById('prodRollen').innerHTML;
ok('Katalog geladen: Rollen mit Kandidaten gerendert',
  /data-prol="rod_std"/.test(prodHtml()) && /data-prolle="rod_std" data-pid="rod-1100"/.test(prodHtml()));
ok('nur Produkte der passenden Kategorie je Rolle',
  /data-prol="i3"[\s\S]*?data-pid="stein-i3"/.test(prodHtml()) && !/data-prol="i3"[\s\S]*?data-pid="rod-1100"[\s\S]*?data-prol="i2"/.test(prodHtml()));
ok('Ausgangslage: keine Produktauswahl', KAT.anzahlAuswahl(KAT.produktRollen(store.aktiveEingaben()))===0);

// Echter Handler: Häkchen am gerenderten Kandidaten setzen
const prodBox=document.getElementById('prodRollen');
const setzen=(rolle,pid,checked)=>prodBox.dispatch('change',{target:{dataset:{prolle:rolle,pid},checked}});
setzen('rod_std','rod-1100',true);
ok('Auswahl über den echten Handler gespeichert (nur IDs)',
  JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]');
ok('Herkunftsnotiz des Katalogs mitgeschrieben', store.holeProdukte(1).quelle.name==='Testkatalog M1');
ok('Status an der Rolle sichtbar: zugeordnet', WP.prodStatus('rod_std').status==='ok');
ok('Auswahl liegt in eingaben.planung.produkte (Ownership Modul 1)',
  JSON.parse(localStorage.getItem('sembla:elemente'))[idA].eingaben.planung.produkte.rollen.rod_std.length===1);
ok('kein Produktdatum im Wandelement (Ownership)', (()=>{
  const s=JSON.stringify(store.aktivesWandelement());
  return !s.includes('rod-1100') && !s.includes('Testkatalog') && !s.includes('preis'); })());

// Mehrere Standardlängen sind der REGELFALL ([Z-2]): sie werden kombiniert, nicht „vorgemerkt“
// und auch nicht als mehrdeutig behandelt. Nur gleiche maßgebende Maße bleiben mehrdeutig.
setzen('rod_std','rod-1000',true);
ok('Mehrfachauswahl je Rolle möglich', store.holeProdukte(1).rollen.rod_std.length===2);
ok('[Z-2] zwei Standardlängen -> Status kombiniert (kein „vorgemerkt“)', (()=>{
  const st=WP.prodStatus('rod_std');
  return st.status==='kombiniert' && st.vorgemerkt.length===0
    && JSON.stringify(st.laengen_mm)==='[1100,1000]'; })());
ok('[Z-2] Kombination ist in Modul 1 sichtbar benannt', /kombiniert/.test(prodHtml()));
// #69: der Zustand steht allein im Pill-Status — der frühere Erklärabsatz dazu ist entfallen.
ok('[#69] kein Erklärabsatz mehr zur Kombination', !/als eigene Position bepreist/.test(prodHtml()));
ok('[Z-1] beide Standardlängen gehen in das Wandelement', (()=>{
  WP.run(); return JSON.stringify(WP.RESULT.wandelement.prestress.rod_lengths_mm)==='[1100,1000]'; })());
ok('[Z-2] Segmente kombinieren echte Standardlängen', (()=>{
  const sg=WP.RESULT.wandelement.tension_columns[0].segments[0];
  return Array.isArray(sg.stuecke) && sg.stuecke.length===sg.gewindestangen
    && sg.stuecke.reduce((a,s)=>a+s.len_mm,0)===sg.z1_mm-sg.z0_mm
    && sg.stuecke.every(s=>s.art==='standard'?s.len_mm===s.quelle_mm:s.quelle_mm>=s.len_mm); })());
// … zwei Produkte mit demselben maßgebenden Maß bleiben mehrdeutig (kein erstes Produkt!)
setzen('rod_std','rod-1100b',true);
ok('gleiches Maß zweifach -> mehrdeutig, kein Preis', (()=>{
  const st=WP.prodStatus('rod_std'); return st.status==='mehrdeutig' && st.produkt===null; })());
ok('Mehrdeutigkeit schon in Modul 1 sichtbar', /Mehrdeutig/.test(prodHtml()));
setzen('rod_std','rod-1100b',false); setzen('rod_std','rod-1000',false);
ok('Häkchen entfernen löst die Auswahl', JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]');

// ---- [P-17] Kompakte Multi-Select-Zeile je Verwendungsrolle -----------------
ok('[P-17] Dropdown statt ausgebreiteter Checkboxliste',
  /<details class="pdd" data-pdd="rod_std"/.test(prodHtml()) && /<summary/.test(prodHtml()));
ok('[P-17] keine wiederholenden Kategorieblöcke mehr', !/class="pgrp"/.test(prodHtml()));
ok('[P-17] geschlossen: Zusammenfassung der Auswahl', /1 Produkt: Stange 1100/.test(prodHtml()));
ok('[P-17] Zusammenfassung „keine Auswahl“ bei leerer Rolle',
  /data-prol="spannplatte"[\s\S]*?keine Auswahl/.test(prodHtml()));
ok('[P-17] Rollenbeschriftung ist der Verwendungszweck, nicht der Produktname',
  KAT.rollenLabel('i3')==='i3-Stein' && KAT.rollenLabel('blech_boden')==='Bodenblech');
ok('[P-17] Option zeigt Produktname PLUS unterscheidende Merkmale', (()=>{
  const o=KAT.rollenOptionen(KATALOG,'rod_std',[]).find(x=>x.id==='rod-1100');
  return o.name==='Stange 1100' && /M10/.test(o.merkmale) && /rod-1100/.test(o.merkmale)
    && o.merkmale!==KAT.rollenLabel('rod_std'); })());
ok('[P-17] keine tautologische Rollen-/Optionsbeschriftung', (()=>{
  for(const r of KAT.rollenVonModul(1)) for(const o of KAT.rollenOptionen(KATALOG,r.id,[])){
    if(!o.merkmale) return false;
    if((o.name+' '+o.merkmale).trim().toLowerCase()===KAT.rollenLabel(r.id).trim().toLowerCase()) return false;
  }
  return true; })());
ok('[P-17] Escape schließt das Dropdown (Tastaturbedienung)', (()=>{
  let zu=false; const box=document.getElementById('prodRollen');
  box.querySelectorAll=()=>[{ set open(v){ zu = (v===false); } }];
  box.dispatch('keydown',{key:'Escape'}); box.querySelectorAll=()=>[];
  return zu; })());

// ---- [Z-1] Stangenlaenge ausschliesslich aus dem Katalog --------------------
// Das frühere Eingabefeld ist ERSATZLOS entfernt: es gibt keinen zweiten Weg mehr, die
// Stangenlaenge zu setzen, und damit auch nichts mehr zu sperren oder zu manipulieren.
ok('[Z-1] Stangenlaenge kommt allein aus dem gewaehlten Produkt', (()=>{
  const v=WP.vorgaben();
  return v.prestress.rod_mm===undefined
    && JSON.stringify(v.prestress.rod_lengths_mm)==='[1100]'
    && WP.RESULT.wandelement.rod_mm===1100; })());
// #69, zweite Kuerzung: die fehlerfreie Auswahl erklaert sich nicht mehr selbst — das frühere
// Herkunfts-/Erklaerfeld bleibt LEER; erst der Konfliktfall meldet sich kurz.
ok('[#69] fehlerfreie Auswahl: kein erklaerender Quelltext mehr (rodQuelle leer)',
  document.getElementById('rodQuelle').innerHTML==='');
ok('[Z-1] ohne Auswahl: Hinweis statt Ersatzwert, keine Vorgabe aus Modul 1', (()=>{
  setzen('rod_std','rod-1100',false);
  return /Kein Gewindestangenprodukt gewählt/.test(document.getElementById('rodQuelle').innerHTML)
    && WP.vorgaben().prestress.rod_lengths_mm===undefined
    && WP.vorgaben().prestress.rod_mm===undefined; })());
setzen('rod_std','rod-1100',true);
WP.run();
// #69: Gesamtsicht der linken Spalte im fehlerfrei gewaehlten Zustand — Quell- und
// Produktinformation ohne erklaerenden Fliesstext; nur der offene Reststueck-Konflikt
// ([Z-6], hier ist kein Reststueckprodukt gewaehlt) bleibt als kurze Meldung sichtbar.
ok('[#69] prodInfo ist mit Katalog und Wand leer', document.getElementById('prodInfo').innerHTML==='');
ok('[#69] Reststueck-Konflikt bleibt als kurze Meldung sichtbar',
  /Kein Reststück gewählt/.test(document.getElementById('rodRestQuelle').innerHTML));
ok('[#69] Rollen-Hinweisprosa (r.hinweis) erscheint nicht mehr',
  !/Innenraum montiert/.test(prodHtml()) && !/bauteilgleich/.test(prodHtml()));
ok('[#69] Produkt-Hinweisprosa aus Katalogdaten erscheint nicht mehr',
  !/Nur als Beispieltext/.test(prodHtml()));
ok('[#69] keine Regelreferenzen in den dynamischen Texten der linken Spalte',
  !/\[(Z|P|A|V|D)-\d+\]/.test(prodHtml()
    +document.getElementById('rodQuelle').innerHTML
    +document.getElementById('rodRestQuelle').innerHTML
    +document.getElementById('prodInfo').innerHTML));

// [Z-1] Die Maß-Eingrenzung folgt jetzt dem KATALOG, nicht mehr dem Eingabefeld: ein Wechsel
// des gesperrten Feldes kann keine Maßabweichung mehr erzeugen (frueher: mass_abweichend).
WP.run();
ok('[Z-1] ohne zweites Feld gibt es keine Maßabweichung mehr',
  WP.prodStatus('rod_std').status==='ok' && WP.RESULT.wandelement.rod_mm===1100);
// Maßfremd bleibt maßfremd, wo die WAND das Maß vorgibt (Blech-Modullaenge): dort gibt es keine
// Kombination mehrerer Groessen — die Rolle ist bewusst NICHT `kombinierbar`.
setzen('blech_boden','blech-boden',true);
ok('[P-14] Blech bei passender Modullaenge zugeordnet', WP.prodStatus('blech_boden').status==='ok');
document.getElementById('blechCm').value='80'; WP.run();
ok('[P-14] maßfremdes Blechprodukt bleibt ohne Preis', WP.prodStatus('blech_boden').status==='mass_abweichend');
document.getElementById('blechCm').value='100'; WP.run();
ok('zurück auf 100 cm -> Blech wieder zugeordnet', WP.prodStatus('blech_boden').status==='ok');

// ---- [A-10] Bodenblech-Vorratssatz: der ECHTE Pfad von der Auswahl bis zur Bepreisung ------
// Gefahren wird der Weg, den ein Planer nimmt: Produkte ueber den echten Aenderungs-Handler in
// der Speicherschicht waehlen -> Modul 1 rechnet mit derselben Engine neu -> `base_plate.teile`
// -> Stuecklistenpositionen -> `loesePreis`. Nichts davon ist nachgebaut.
{
  const rasterMasse=(w)=>w.base_plate.teile.map(t=>t.raster_mm);
  // Der vorangehende [P-14]-Block hat `blech-boden` gewaehlt; hier beginnt der Pfad bewusst
  // beim LEEREN Zustand, damit der Fallback echt gemessen und nicht vorausgesetzt wird.
  setzen('blech_boden','blech-boden',false);
  // Wandlaenge 4500 mm: aus {1250,1000} exakt kombinierbar, aus der vollen Standardreihe aber
  // ANDERS — nur so zeigt sich, ob die Auswahl wirklich wirkt.
  setzeLaenge(4500); WP.run();
  const fallback=rasterMasse(WP.RESULT.wandelement).join(',');
  ok('[A-10] ohne Auswahl gilt der Core-Fallback (Feld gar nicht gesetzt)',
    WP.vorgaben().prestress.blech_lengths_mm===undefined && fallback.length>0);
  ok('[A-10] ohne Auswahl meldet der Rollenstatus die fehlende Auswahl',
    WP.prodStatus('blech_boden').status==='keine_auswahl');

  setzen('blech_boden','blech-boden-1250',true);
  setzen('blech_boden','blech-boden',true);
  ok('[A-10] Auswahl liegt in eingaben.planung.produkte (Ownership Modul 1)',
    JSON.stringify(store.holeProdukte(1).rollen.blech_boden)==='["blech-boden-1250","blech-boden"]');
  ok('[A-10] Modul 1 leitet den Vorratssatz aus den gewaehlten Produkten ab',
    JSON.stringify(WP.blechLaengen)==='[1250,1000]'
    && JSON.stringify(WP.vorgaben().prestress.blech_lengths_mm)==='[1250,1000]');
  ok('[A-10] der Satz steht im gerechneten Wandelement (Core normalisiert absteigend)',
    JSON.stringify(WP.RESULT.wandelement.prestress.blech_lengths_mm)==='[1250,1000]');
  const mit=rasterMasse(WP.RESULT.wandelement);
  ok('[A-10] base_plate.teile besteht AUSSCHLIESSLICH aus den gewaehlten Rastermaßen',
    mit.length>0 && mit.every(x=>x===1250||x===1000) && mit.reduce((a,b)=>a+b,0)===4500);
  ok('[A-10] die Auswahl aendert die Aufteilung wirklich (nicht zufaellig gleich dem Fallback)',
    mit.join(',')!==fallback);
  ok('[A-10] das gespeicherte Wandelement traegt denselben Stand (kein Zwischenstand)',
    JSON.stringify(store.aktivesWandelement().base_plate.teile.map(t=>t.raster_mm))===JSON.stringify(mit));
  ok('[A-10] kein Produktdatum im Wandelement (Ownership)',
    !JSON.stringify(store.aktivesWandelement()).includes('blech-boden'));

  // Stueckliste: je Rastermaß eine Position mit `mass_mm`, ueber das [P-14] eindeutig aufloest.
  const posAlle=BOM.semblaBomItems(store.aktivesWandelement());
  const pos=posAlle.filter(x=>x.key==='blech_boden');
  ok('[A-10] je verwendetem Rastermaß genau EINE Stuecklistenposition',
    pos.length===new Set(mit).size && pos.every(x=>[1250,1000].includes(x.mass_mm))
    && pos.reduce((a,x)=>a+x.menge,0)===mit.length);
  ok('[A-12] die Position nennt das reale Bauteilmaß (Rastermaß - 2 mm)',
    pos.every(x=>x.fertigmass_mm===x.mass_mm-2));
  ok('[A-10] kein Sonderzuschnitt bei exakt kombinierbarer Laenge',
    !posAlle.some(x=>x.key==='blech_boden_sonder'));
  const rollenIds=KAT.produktRollen(store.aktiveEingaben());
  const ktx=KAT.preisKontext(store.aktivesWandelement(), store.aktiveEingaben(), store.holeKatalog());
  ok('[P-14] jede Bodenblechposition trifft ueber mass_mm genau ihr maßgleiches Produkt',
    pos.every(x=>{
      const r=KAT.loesePreis(x, rollenIds, store.holeKatalog(), ktx);
      return r.status==='ok' && r.produkt && +r.produkt.breite_mm===x.mass_mm
        && r.ep===(x.mass_mm===1250?22.5:18);
    }));

  // [Z-1]-Gegenprobe: die Kopfblech-Modullaenge darf das Bodenblech nicht mehr anfassen.
  const kopfVor=store.aktivesWandelement().top_plate.module;
  document.getElementById('blechCm').value='50'; document.getElementById('blechCm').dispatch('input');
  ok('[A-10] Aenderung der Kopfblech-Modullaenge laesst base_plate.teile unveraendert',
    JSON.stringify(rasterMasse(WP.RESULT.wandelement))===JSON.stringify(mit));
  ok('[A-10] … aendert aber weiterhin die Kopfblech-Module',
    WP.RESULT.wandelement.top_plate.module>kopfVor);
  document.getElementById('blechCm').value='100'; document.getElementById('blechCm').dispatch('input');

  // Auswahl wieder aufloesen: der Fallback muss BITGLEICH zurueckkommen.
  setzen('blech_boden','blech-boden-1250',false);
  setzen('blech_boden','blech-boden',false);
  ok('[A-10] Auswahl aufgeloest -> bitgleich derselbe Core-Fallback wie zu Beginn',
    WP.vorgaben().prestress.blech_lengths_mm===undefined
    && rasterMasse(WP.RESULT.wandelement).join(',')===fallback);
  setzeLaenge(2000); WP.run();
}


// Rolle des falschen Moduls darf hier nicht geschrieben werden (Ownership Modul 2)
ok('Modul-2-Rolle landet nicht im Modul-1-Block', (()=>{
  store.setzeProduktrolle('latte',['latte-1500']);
  return !store.holeProdukte(1).rollen.latte && store.holeProdukte(2).rollen.latte.length===1; })());
ok('unbekannte Rolle wird abgelehnt (kein stilles Schreiben)', (()=>{
  try { store.setzeProduktrolle('gibtsnicht',['x']); return false; } catch { return true; } })());

// Fehlende Referenz: Produkt aus dem Katalog entfernen -> sichtbar gemeldet, nie still bereinigt
store.setzeKatalog({ ...KATALOG, produkte: KATALOG.produkte.filter(p=>p.id!=='rod-1100') });
WP.renderProdukte();
ok('gelöschtes Produkt: Referenz bleibt erhalten', JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]');
ok('gelöschtes Produkt: Status fehlt + sichtbare Warnung',
  WP.prodStatus('rod_std').status==='fehlt' && /nicht auflösbar/.test(prodHtml()));
store.setzeKatalog(KATALOG);

// ---- #92 Einbaulagen des Spannsystems [A-19]/[Z-8]: der ECHTE Pfad Katalog -> Modul 1 -> Core ----
// Gehalten werden hier genau die beiden im Handbuch dokumentierten Formeln: [A-19] Stangenbeginn
// an Oberkante Bodenblech + halbe Kopplungsmutterhoehe, [Z-8] Ueberstand ab Oberkante Spannplatte.
// Gefahren wird der Planerweg: Anschlussprodukte ueber den echten Aenderungs-Handler waehlen ->
// `vorgaben()` leitet Fussoffset und Kopfzuschlag ab -> dieselbe Engine rechnet neu -> die
// Stangenstuecke des gerechneten Wandelements. Danach der Fehlerpfad: fehlt ein Pflichtmass,
// steht es benannt in der Oberflaeche und der Bedarf bleibt unveraendert.
//
// Bezugspunkt ist die OBERKANTE BODENBLECH (= Steinunterkante, z = 0): der Fussoffset ist die
// HALBE Kopplungsmutterhoehe, die Blechdicke geht nicht ein und wird hier auch nicht verlangt.
{
  const seg0=()=>WP.RESULT.wandelement.tension_columns[0].segments[0];
  const meld=()=>document.getElementById('einbauQuelle').innerHTML;
  const leere=(rolle)=>((store.holeProdukte(1).rollen||{})[rolle]||[]).slice()
    .forEach(id=>setzen(rolle,id,false));
  const ROLLEN92=['rod_std','rod_rest','blech_boden','kupplung','spannplatte'];
  // Der vorangehende Auswahlstand gehoert den frueheren Bloecken: er wird gesichert und am
  // Ende genau so wiederhergestellt, damit dieser Abschnitt keine Nebenwirkung hinterlaesst.
  const vorher=JSON.parse(JSON.stringify(store.holeProdukte(1).rollen||{}));
  for(const r of ROLLEN92) leere(r);
  setzeLaenge(2000); document.getElementById('hgt').value='2.00';
  document.getElementById('topConn').value='spannplatte';
  document.getElementById('rodUeber').value='10';
  // Vorratssatz und Reststueck, damit [Z-2]/[Z-6] ueberhaupt eine Zerlegung liefern.
  setzen('rod_std','rod-1000',true); setzen('rod_rest','rod-rest-210',true);
  WP.run();
  const ohne=seg0().bedarf_mm;
  const stueckeOhne=seg0().stuecke.map(x=>x.len_mm+':'+x.art).join(',');
  ok('#92 [A-19]/[Z-8] ohne Anschlussprodukte kein Einbaumass (nichts geraten)',
    WP.fussOffset===null && WP.kopfZuschlag===null
    && WP.vorgaben().prestress.rod_fuss_offset_mm===undefined
    && WP.vorgaben().prestress.rod_kopf_zuschlag_mm===undefined
    && !('rod_fuss_offset_mm' in WP.RESULT.wandelement.prestress)
    && ohne===2000+10);
  ok('#92 [A-19]/[Z-8] jedes fehlende Pflichtmass wird einzeln und konkret benannt',
    /Rolle „Kopplungsmutter“/.test(meld()) && /Rolle „Spannplatte“/.test(meld()));
  // Die Bodenblechdicke geht in DIESE Rechnung nicht ein (z = 0 ist die Blechoberkante), der
  // Stangenbedarf bleibt von ihr unberuehrt. Seit [A-1] sie aus dem Katalog kommt, wird sie
  // aber als AUSWEISUNGSMASS gemeldet, wenn sie fehlt — die beiden Aussagen sind getrennt.
  ok('#92 [A-19] die Bodenblechdicke geht nicht in den Stangenbedarf ein',
    ohne===2000+10 && WP.fussOffset===null);
  ok('[A-1] die fehlende Bodenblechdicke wird als eigenes Ausweisungsmass benannt',
    /Rolle „Bodenblech“/.test(meld()) && /Bodenblechdicke/.test(meld()));

  // Vollstaendige Auswahl: Kopplungsmutter 50 mm -> Fussoffset 25 mm; Spannplatte 12 mm.
  setzen('blech_boden','blech-boden',true);
  setzen('kupplung','kuppl-50',true);
  setzen('spannplatte','platte-12',true);
  WP.run();
  ok('#92 [A-19] Modul 1 leitet den Fussoffset aus der halben Kopplungsmutterhoehe ab',
    WP.fussOffset===25 && WP.vorgaben().prestress.rod_fuss_offset_mm===25);
  ok('#92 [Z-8] Modul 1 leitet den Kopfzuschlag aus der Spannplattendicke ab',
    WP.kopfZuschlag===12 && WP.vorgaben().prestress.rod_kopf_zuschlag_mm===12);
  ok('#92 [A-19]/[Z-8] im fehlerfreien Zustand steht keine Meldung', meld()==='');
  ok('#92 [A-19]/[Z-8] der Bedarf ist Segmenthoehe - Fussoffset + Plattendicke + Ueberstand',
    seg0().bedarf_mm===2000-25+12+10 && seg0().bedarf_mm!==ohne);
  ok('#92 [A-19]/[Z-8] die Stangenstuecke sind gegenueber dem Altstand wirklich verschoben',
    seg0().stuecke.map(x=>x.len_mm+':'+x.art).join(',')!==stueckeOhne
    && /:rest$/.test(seg0().stuecke.map(x=>x.len_mm+':'+x.art).join(',')));
  ok('#92 [A-19] z0_mm bleibt Steingeometrie (kein zweites Geometriemodell am Segment)',
    seg0().z0_mm===0 && !('stangen_z0_mm' in seg0()) && !('fuss_offset_mm' in seg0()));
  ok('#92 [A-19]/[Z-8] der gespeicherte Stand traegt dieselben Einbaulagen (kein Zwischenstand)', (()=>{
    const w=store.aktivesWandelement();
    return w.prestress.rod_fuss_offset_mm===25 && w.prestress.rod_kopf_zuschlag_mm===12
      && w.tension_columns[0].segments[0].bedarf_mm===1997; })());
  ok('#92 [A-19]/[Z-8] kein Produktdatum im Wandelement (Ownership)', (()=>{
    const j=JSON.stringify(store.aktivesWandelement());
    return !j.includes('kuppl-50') && !j.includes('platte-12')
      && !j.includes('Spannplatte 12') && !j.includes('preis'); })());

  // Fehlerpfad 1: gewaehltes Produkt OHNE Mass -> benannt, kein Ersatzmass.
  // Referenz ist der Stand OHNE jedes Kopplungsmutter-Produkt — genau das ist nach [A-19] der
  // "bisherige Rechenstand", gegen den das fehlende Katalogmass bit-gleich bleiben muss.
  setzen('kupplung','kuppl-50',false);
  WP.run();
  const bedarfOhneFuss=seg0().bedarf_mm;
  const stueckeOhneFuss=seg0().stuecke.map(x=>x.len_mm+':'+x.art).join(',');
  setzen('kupplung','kuppl-ohne',true);
  WP.run();
  ok('#92 [A-19] Produkt ohne Kopplungsmutterhoehe: benannt, nicht ersetzt',
    /Kopplungsmutterhöhe fehlt/.test(meld()) && WP.fussOffset===null
    && WP.vorgaben().prestress.rod_fuss_offset_mm===undefined
    && !('rod_fuss_offset_mm' in WP.RESULT.wandelement.prestress)
    && seg0().bedarf_mm===2000+12+10);
  ok('#92 [A-19] fehlendes Katalogmass laesst den Stangenbedarf bit-gleich zum bisherigen Stand',
    seg0().bedarf_mm===bedarfOhneFuss
    && seg0().stuecke.map(x=>x.len_mm+':'+x.art).join(',')===stueckeOhneFuss);

  // Fehlerpfad 2: mehrdeutige Auswahl -> benannt, nichts bevorzugt.
  setzen('kupplung','kuppl-ohne',false);
  setzen('kupplung','kuppl-50',true); setzen('kupplung','kuppl-30',true);
  WP.run();
  ok('#92 [A-19] mehrere Mutterhoehen: mehrdeutig gemeldet, keine bevorzugt',
    /Kopplungsmutterhöhe mehrdeutig/.test(meld()) && /50 mm, 30 mm/.test(meld())
    && WP.fussOffset===null && seg0().bedarf_mm===2000+12+10);

  // Fehlerpfad 3: fehlende Spannplattendicke — der Kopfzuschlag bleibt offen.
  setzen('kupplung','kuppl-30',false); setzen('spannplatte','platte-12',false);
  WP.run();
  ok('#92 [Z-8] fehlende Spannplatte: benannt, Kopfzuschlag bleibt offen',
    /Rolle „Spannplatte“/.test(meld()) && WP.kopfZuschlag===null
    && seg0().bedarf_mm===2000-25+10);

  // Kopfblech: es gibt keine Spannplatte, also auch keinen Zuschlag und keine Meldung dazu.
  document.getElementById('topConn').value='blech'; WP.run();
  ok('#92 [Z-8] Kopfblech verlangt keine Spannplattendicke und bekommt keinen Zuschlag',
    WP.kopfZuschlag===null && !/Spannplatte/.test(meld())
    && seg0().bedarf_mm===2000-25+10);

  document.getElementById('topConn').value='spannplatte';
  for(const r of ROLLEN92){ leere(r); (vorher[r]||[]).forEach(id=>setzen(r,id,true)); }
  WP.run();
}

// ---- Issue #97: die Kopplungsmutter wird mit ihrer REALEN Einbauhoehe gezeichnet ---------
// Gefahren wird der ECHTE Planerweg: Kopplungsmutter im zugeordneten Katalog waehlen ->
// `vorgaben()` leitet den Fussoffset ab ([A-19]: halbe Mutternhoehe) -> derselbe Core baut das
// Wandelement -> die Wandansicht zeichnet daraus. Die gezeichnete Hoehe ist das DOPPELTE des
// Fussoffsets; gelesen wird sie ausschliesslich aus dem Wandelement und NICHT ein zweites Mal
// aus dem Katalog ([D-4]). Ohne gewaehltes Produkt bleibt es beim festen Symbolmass.
{
  const svgp=()=>document.getElementById('plan').innerHTML;
  const E=MONT.SPANN_EINHEIT.ansicht, MM=MONT.SPANN_MM;
  const RE_KOP=/<rect class="kop" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
  const kops=()=>[...svgp().matchAll(RE_KOP)].map(m=>({x:+m[1],y:+m[2],b:+m[3],h:+m[4]}));
  const ROLLEN97=['rod_std','rod_rest','blech_boden','kupplung','spannplatte'];
  const leere=(rolle)=>((store.holeProdukte(1).rollen||{})[rolle]||[]).slice()
    .forEach(id=>setzen(rolle,id,false));
  // Auswahlstand und aktive Wand gehoeren den frueheren Bloecken — beides wird gesichert und
  // am Ende wiederhergestellt, damit dieser Abschnitt keine Nebenwirkung hinterlaesst.
  const vorherR=JSON.parse(JSON.stringify(store.holeProdukte(1).rollen||{}));
  const vorherW=WP.RESULT.wandelement;
  for(const r of ROLLEN97) leere(r);
  setzeLaenge(2000); document.getElementById('hgt').value='2.00';
  document.getElementById('topConn').value='blech';
  document.getElementById('rodUeber').value='10';
  setzen('rod_std','rod-1000',true); setzen('rod_rest','rod-rest-210',true);
  WP.run();
  const sc=WP.ansichtSc(), kopOhne=kops();

  ok('[#97] ohne gewaehlte Kopplungsmutter bleibt es beim festen Symbolmass',
    WP.fussOffset===null
    && !('rod_fuss_offset_mm' in WP.RESULT.wandelement.prestress)
    && kopOhne.length>0 && kopOhne.every(r=>Math.abs(r.h-MM.kupplung_h*E)<1e-9));

  // 30-mm-Produkt -> Fussoffset 15 -> gezeichnete Hoehe 30 mm mal Zeichenmasstab.
  setzen('kupplung','kuppl-30',true); WP.run();
  const w30=WP.RESULT.wandelement, svg30=svgp(), kop30=kops();
  ok('[#97] das Wandelement fuehrt die halbe Mutternhoehe als Fussoffset (kein neues Feld)',
    WP.fussOffset===15 && w30.prestress.rod_fuss_offset_mm===15
    && !('rod_kupplung_hoehe_mm' in w30.prestress));
  ok('[#97] in der Wandansicht ist die Mutternhoehe 30 mm mal Zeichenmasstab',
    kop30.length>0 && kop30.every(r=>Math.abs(r.h-30*sc)<1e-9)
    && kop30.length===kopOhne.length);
  ok('[#97] der Durchmesser bleibt das feste Symbolmass',
    kop30.every(r=>Math.abs(r.b-MM.d*E)<1e-9)
    && kopOhne.every(r=>Math.abs(r.b-MM.d*E)<1e-9));
  ok('[#97] jede Marke ist bytegleich die der geteilten Funktion (kein eigener Zeichenweg)',
    (()=>{ const hPx=w30.height_mm*sc, X=v=>46+v*sc, Y=v=>46+(hPx-v*sc);
      const o={hoehe_mm:30,sc}; let n=0;
      for(const col of w30.tension_columns) for(const g of col.segments){
        const st=MONT.stangenStuecke(w30,g);
        for(let i=0;i<st.length-1;i++){
          if(!svg30.includes(MONT.kopplungsmutterSvg(X(col.x_mm),Y(st[i].z1_mm),E,
            {klasse:'kop',...o}))) return false;
          n++;
        }
        const au=g.anker_unten||(g.z0_mm===0?'bodenblech':'spannplatte');
        if(au!=='bodenblech') continue;
        if(!svg30.includes(MONT.kopplungsmutterSvg(X(col.x_mm),Y(g.z0_mm),E,
          {klasse:'kop',auf:true,...o}))) return false;
        n++;
      }
      return n>0; })());
  ok('[#97] die Fussmutter LIEGT auf dem Bodenblech, der Stoss bleibt zentriert', (()=>{
    const hPx=w30.height_mm*sc, y0=46+hPx;
    const fuss=kop30.filter(r=>Math.abs(r.y+r.h-y0)<1e-9);
    const stoss=kop30.filter(r=>Math.abs(r.y+r.h-y0)>=1e-9);
    const zS=[]; for(const col of w30.tension_columns) for(const g of col.segments){
      const st=MONT.stangenStuecke(w30,g);
      for(let i=0;i<st.length-1;i++) zS.push(46+(hPx-st[i].z1_mm*sc)); }
    return fuss.length>0 && fuss.every(r=>r.y<y0)
      && stoss.length===zS.length
      && stoss.every(r=>zS.some(z=>Math.abs(r.y+r.h/2-z)<1e-9)); })());
  // Der Schaftbeginn ist ein ABGELEITETER Wert ([A-19]) und folgt der realen Hoehe mit — sonst
  // ragte die Schraube ueber die Mutter hinaus. Ihre eigenen Symbolmasse bleiben unberuehrt.
  ok('[#97] der Schraubenschaft steckt zur HAELFTE in der realen Kopplungsmutter', (()=>{
    const hPx=w30.height_mm*sc, y0=46+hPx;
    const RE=new RegExp('<rect x="[-\\d.]+" y="([-\\d.]+)" width="([-\\d.]+)" height="[-\\d.]+"'
      +' fill="'+MONT.SPANN_FARBE.mutter+'"','g');
    const alle=[...svg30.matchAll(RE)].map(m=>({y:+m[1],b:+m[2]}));
    const schaft=alle.filter(q=>Math.abs(q.b-MM.schaft_d*E)<1e-9);
    const kopf=alle.filter(q=>Math.abs(q.b-MM.kopf_d*E)<1e-9);
    return schaft.length>0 && kopf.length===schaft.length
      && schaft.every(q=>Math.abs(q.y-(y0-30*sc/2))<1e-9); })());
  // Die uebrigen Bauteile folgen unveraendert dem gerechneten Wandelement: je Stueck ein
  // Strich an seiner Stelle, je Stoss eine Haarlinie, und die Stueckliste bleibt die des Cores.
  ok('[#97] Stangenzuschnitt und Stueckliste bleiben die des Wandelements', (()=>{
    const hPx=w30.height_mm*sc, X=v=>46+v*sc, Y=v=>46+(hPx-v*sc); let n=0;
    for(const col of w30.tension_columns) for(const g of col.segments)
      for(const st of MONT.stangenStuecke(w30,g)){
        const l='<line x1="'+X(col.x_mm)+'" y1="'+Y(st.z0_mm)+'" x2="'+X(col.x_mm)
          +'" y2="'+Y(st.z1_mm)+'" stroke="'+MONT.stueckFarbe(st.art)+'"';
        if(!svg30.includes(l)) return false;
        n++;
      }
    return n>0 && JSON.stringify(BOM.semblaBomItems(w30))
      === JSON.stringify(BOM.semblaBomItems(store.aktivesWandelement())); })());

  // 50-mm-Produkt: dieselbe Wand, sichtbar hoehere Mutter.
  setzen('kupplung','kuppl-30',false); setzen('kupplung','kuppl-50',true); WP.run();
  ok('[#97] zwei Katalogprodukte ergeben sichtbar verschieden hohe Muttern', (()=>{
    const k50=kops();
    return WP.fussOffset===25 && k50.length===kop30.length && k50.length>0
      && k50.every(r=>Math.abs(r.h-50*sc)<1e-9) && k50[0].h>kop30[0].h
      && WP.ansichtSc()===sc; })());

  // [D-4] Muss: Modul 1 und Modul 7 messen dieselbe Hoehe. Die Einheiten der beiden Ansichten
  // sind verschieden — verglichen wird deshalb das ZURUECKGERECHNETE Bauteilmass in mm.
  ok('[#97] Modul 1 und Modul 7 zeigen dieselbe masstaebliche Mutternhoehe', (()=>{
    const bl=ZEICH.zeichnungSvg(w30,{});
    const g=/<g class="kop">([\s\S]*?)<\/g>/.exec(bl.svg);
    const h7=g?[...g[1].matchAll(/height="([-\d.]+)"/g)].map(m=>+m[1]):[];
    return kop30.length>0 && h7.length>0
      && Math.abs(kop30[0].h/sc-30)<1e-9 && Math.abs(h7[0]*bl.masstab-30)<1e-2; })());
  ok('[#97] Modul 1 liest die Hoehe aus dem Wandelement, nicht ein zweites Mal aus dem Katalog',
    /kuH=2\*\(\(w\.prestress&&w\.prestress\.rod_fuss_offset_mm\)\|\|0\)/
      .test(html.replace(/\s+/g,''))
    && /hoehe_mm:kuH,sc/.test(html.replace(/\s+/g,'')));

  // Ausgangszustand wiederherstellen.
  for(const r of ROLLEN97){ leere(r); (vorherR[r]||[]).forEach(id=>setzen(r,id,true)); }
  document.getElementById('topConn').value='spannplatte';
  WP.applyWand(vorherW);
}

// ---- [P-18] Vorbelegung aus der Katalog-Standardauswahl ---------------------
// Produkte ohne `rollen` haben oben nie etwas vorbelegt (das erste „Ausgangslage: keine
// Produktauswahl" belegt das). Traegt der Katalog die Angabe, uebernimmt Modul 1 sie beim
// Rendern fuer die noch LEEREN Rollen — sichtbar gemeldet und weiter frei umwaehlbar.
{
  const KAT_VB={ ...KATALOG, produkte: KATALOG.produkte.map(p =>
    p.id==='stein-i3' ? { ...p, rollen:['i3'] } : (p.id==='dicht-stk' ? { ...p, rollen:['dicht_stk'] } : p)) };
  const idVb=store.speichere('Vorbeleg', buildWall('Vorbeleg',2000,2600,[]));
  store.setzeKatalog(KAT_VB); store.setzeAktiv(idVb);
  store.setzeProduktrolle('rod_std',['rod-1100']);        // bewusste Wahl -> unantastbar
  WP.renderProdukte();
  ok('[P-18] leere Rollen werden aus dem Katalog vorbelegt',
    store.holeProdukte(1,idVb).rollen.i3.join()==='stein-i3'
    && store.holeProdukte(1,idVb).rollen.dicht_stk.join()==='dicht-stk');
  // #69: der frühere Meldetext „… vorbelegt“ ist entfallen — sichtbar ist die Vorbelegung
  // nach [P-18] allein als ganz normale, angehakte und umwaehlbare Auswahl (naechste Pruefung).
  ok('[P-18] kein Vorbelegungs-Meldetext mehr (prodInfo bleibt leer, #69)',
    document.getElementById('prodInfo').innerHTML==='');
  ok('[P-18] Vorbelegung erscheint als normale, angehakte Auswahl',
    /data-prolle="i3" data-pid="stein-i3" checked/.test(prodHtml()));
  ok('[P-18] bestehende Wahl bleibt unangetastet',
    store.holeProdukte(1,idVb).rollen.rod_std.join()==='rod-1100');
  ok('[P-18] bewusst leergeraeumte Rolle bleibt leer (kein Wiedervorbelegen)', (()=>{
    setzen('i3','stein-i3',false); WP.renderProdukte();
    return store.holeProdukte(1,idVb).rollen.i3.length===0; })());
  ok('[P-18] keine Auswahl fuer Rollen ohne Standardprodukt (nichts geraten)',
    store.holeProdukte(1,idVb).rollen.blech_boden===undefined);
  // [P-18]/[Z-1]: Eine maßwirksame Vorbelegung (Standardlaengen/Reststueck) MUSS das
  // Wandelement neu rechnen — sonst stuende im gespeicherten JSON weiter die alte Zerlegung
  // und Modul 5/7 und der Export zeigten sie ebenfalls (Reststueck fehlt im Bild).
  ok('[P-18] maßwirksame Vorbelegung rechnet das Wandelement neu ([Z-1])', (()=>{
    const idM=store.speichere('Vorbeleg-Mass', buildWall('Vorbeleg-Mass',2000,2600,[]));
    const katM={ ...KATALOG, produkte:KATALOG.produkte.map(p =>
      p.id==='rod-1000' ? { ...p, rollen:['rod_std'] } : p)
      .concat([{ id:'rod-rest-100', kategorie:'gewindestange', bezeichnung:'Reststueck 100',
                 einheit:'Stk', preis:0.9, gewinde:'M10', laenge_mm:100, rollen:['rod_rest'] }]) };
    store.setzeKatalog(katM); store.setzeAktiv(idM);
    globalThis.window.__wpInit();                       // frischer Seitenaufruf
    const w=store.aktivesWandelement();
    const stuecke=w.tension_columns.flatMap(c=>c.segments).flatMap(g=>g.stuecke||[]);
    return JSON.stringify(w.prestress.rod_lengths_mm)==='[1000]'
      && w.prestress.rod_rest_mm===100
      && stuecke.some(s=>s.art==='rest');               // Slicing steht im gespeicherten JSON
  })());
  // Dieser echte Stand enthaelt ein Reststueck ([Z-6]) — die Legende muss es jetzt nennen,
  // und die Gleichheit gilt weiterhin fuer alle drei Arten.
  ok('[#63] Legende folgt dem echten Stand (Reststueck genannt)',
    legendeStimmt() && zleg().includes(MONT.STUECK_LABEL.rest));
  // Gegenrichtung am echten Pfad: eine einlagige Wand mit 1000-mm-Standardlaenge und 100-mm-
  // Reststueck kommt ohne EINE Standardlaenge aus (Rest + Sonderzuschnitt). Dann darf auch
  // „Standardlaenge“ nicht in der Legende stehen — genau das war vorher fest eingetragen.
  ok('[#63] Stand ohne Standardstueck nennt keine Standardlaenge', (()=>{
    document.getElementById('hgt').value='0.20'; WP.run();
    const alle=WP.RESULT.wandelement.tension_columns.flatMap(c=>c.segments).flatMap(g=>g.stuecke||[]);
    const treffer = alle.length>0 && !alle.some(p=>p.art==='standard')
      && legendeStimmt() && !zleg().includes(MONT.STUECK_LABEL.standard)
      && !zleg().includes(MONT.STUECK_FARBE.standard);
    document.getElementById('hgt').value='2.60'; WP.run();
    return treffer; })());
  store.setzeKatalog(KATALOG); store.setzeAktiv(idA); WP.renderProdukte();
}

// ---- [A-6]/#71 Abdichtung je Wand: echte Oberflaeche, echter Speicherpfad ----------------
// Gewaehlt wird ueber das reale Auswahlfeld (change-Ereignis wie im Browser); geschrieben wird
// ueber den regulaeren Auto-Speicher-Pfad. Geprueft werden Standard, beide Zustaende, das
// Ueberleben des kompletten Neuaufbaus durch buildWall() und der Fortbestand ueber einen Reload.
{
  const idAb=store.speichere('Abdichtung', buildWall('Abdichtung',2000,2600,[]));
  store.setzeAktiv(idAb);
  globalThis.window.__wpInit();                        // frischer Seitenaufruf
  const feld=document.getElementById('abdichtung');
  ok('[A-6] Wand ohne Feld: Oberflaeche zeigt den Standard „nicht abgedichtet“',
    feld.value==='nicht_abgedichtet');
  // Das blosse LADEN schreibt nichts zurueck: der gespeicherte Altbestand bleibt ohne Feld und
  // gilt beim Lesen als „nicht abgedichtet“. Geschrieben wird erst durch eine echte Bedienung.
  ok('[A-6] Laden normalisiert nur, es schreibt den Standard nicht zurueck',
    !('abdichtung' in store.aktivesWandelement()));
  document.getElementById('hgt').value='2.40'; document.getElementById('hgt').dispatch('input');
  ok('[A-6] erste echte Bedienung schreibt den Standard ans Wandelement',
    store.aktivesWandelement().abdichtung==='nicht_abgedichtet');
  document.getElementById('hgt').value='2.60'; document.getElementById('hgt').dispatch('input');
  feld.value='abgedichtet'; feld.dispatch('change');   // echter Bedienweg
  ok('[A-6] Wahl „abgedichtet“ steht am gespeicherten Wandelement',
    store.aktivesWandelement().abdichtung==='abgedichtet');
  ok('[A-6] Wahl ueberlebt den Neuaufbau durch buildWall()', (()=>{
    WP.run(); return WP.RESULT.wandelement.abdichtung==='abgedichtet'
      && store.aktivesWandelement().abdichtung==='abgedichtet'; })());
  ok('[A-6] Auswahl aendert weder Geometrie noch Vorspannung', (()=>{
    const w=store.aktivesWandelement();
    feld.value='nicht_abgedichtet'; feld.dispatch('change');
    const n=store.aktivesWandelement();
    const bar=x=>JSON.stringify({c:x.courses,t:x.tension_columns,b:x.bom,p:x.prestress});
    return bar(w)===bar(n); })());
  feld.value='abgedichtet'; feld.dispatch('change');
  globalThis.window.__wpInit();                        // Reload: alles frisch aus dem Storage
  ok('[A-6] Reload: Auswahl bleibt erhalten und steht im Auswahlfeld',
    store.aktivesWandelement().abdichtung==='abgedichtet'
    && document.getElementById('abdichtung').value==='abgedichtet');
  // Wandbezogen: eine zweite Wand erbt nichts von der ersten.
  const idAb2=store.speichere('Abdichtung 2', buildWall('Abdichtung 2',2000,2600,[]));
  store.setzeAktiv(idAb2); globalThis.window.__wpInit();
  ok('[A-6] zweite Wand erbt die Auswahl nicht (Merkmal ist wandbezogen)',
    document.getElementById('abdichtung').value==='nicht_abgedichtet'
    && store.holeElement(idAb).wandelement.abdichtung==='abgedichtet');
  store.setzeAktiv(idA); globalThis.window.__wpInit();
}

// ---- #79 Brandschutzklassifikation F0/F30: echte Oberflaeche, echter Speicherpfad --------
// Reine PLANUNGSKENNZEICHNUNG — aus ihr wird nichts abgeleitet. Gewaehlt wird ueber das reale
// Auswahlfeld (change wie im Browser), geschrieben ueber den regulaeren Auto-Speicher-Pfad.
// Geprueft werden Standard F0, die Wahl F30, das Ueberleben des kompletten Neuaufbaus durch
// buildWall(), die Unveraendertheit aller uebrigen Wandelementwerte und der Reload.
{
  const idBk=store.speichere('Brandklasse', buildWall('Brandklasse',2000,2600,[]));
  store.setzeAktiv(idBk);
  globalThis.window.__wpInit();                        // frischer Seitenaufruf
  const feld=document.getElementById('brandklasse');
  ok('[#79] Auswahlfeld F0/F30 ist in Modul 1 vorhanden',
    /id="brandklasse"/.test(html) && /value="F0"/.test(html) && /value="F30"/.test(html));
  ok('[#79] Wand ohne Feld: Oberflaeche zeigt den Standard F0', feld.value==='F0');
  // Das blosse LADEN schreibt nichts zurueck: der Altbestand bleibt ohne Feld und gilt beim
  // Lesen als F0 — normalisiert, nicht migriert (kein SCHEMA_VERSION-Sprung).
  ok('[#79] Laden normalisiert nur, es schreibt den Standard nicht zurueck',
    !('brandklasse' in store.aktivesWandelement()));
  ok('[#79] Altbestand ohne Feld wird als F0 gelesen, nie als F30',
    store.normBrandklasse(store.aktivesWandelement().brandklasse)==='F0');
  document.getElementById('hgt').value='2.40'; document.getElementById('hgt').dispatch('input');
  ok('[#79] erste echte Bedienung schreibt den Standard ans Wandelement',
    store.aktivesWandelement().brandklasse==='F0');
  document.getElementById('hgt').value='2.60'; document.getElementById('hgt').dispatch('input');
  // Alle uebrigen Wandelementwerte VOR der Umstellung merken (Akzeptanztest 2).
  const vorher=store.aktivesWandelement();
  const bar=x=>JSON.stringify({c:x.courses,t:x.tension_columns,b:x.bom,p:x.prestress,
    l:x.length_mm,h:x.height_mm,v:x.verification,val:x.validation});
  const vorherBar=bar(vorher);
  feld.value='F30'; feld.dispatch('change');           // echter Bedienweg
  ok('[#79] Wahl F30 steht am gespeicherten Wandelement',
    store.aktivesWandelement().brandklasse==='F30');
  ok('[#79] Neuberechnung fuehrt die Klassifikation unveraendert mit', (()=>{
    WP.run(); return WP.RESULT.wandelement.brandklasse==='F30'
      && store.aktivesWandelement().brandklasse==='F30'; })());
  ok('[#79] uebrige Wandelementwerte bleiben unveraendert (kein Nachweis, keine Menge)',
    bar(store.aktivesWandelement())===vorherBar);
  // Akzeptanztest 3: eine bestehende F30 wird ohne Auswahlaenderung nie zu F0 — weder beim
  // Laden noch bei einer anderen Bedienung noch bei einer weiteren Neuberechnung.
  globalThis.window.__wpInit();                        // Reload: alles frisch aus dem Storage
  ok('[#79] Reload: Auswahl bleibt erhalten und steht im Auswahlfeld',
    store.aktivesWandelement().brandklasse==='F30'
    && document.getElementById('brandklasse').value==='F30');
  ok('[#79] fremde Bedienung ueberschreibt eine bestehende F30 nicht', (()=>{
    document.getElementById('hgt').value='2.40'; document.getElementById('hgt').dispatch('input');
    const a=store.aktivesWandelement().brandklasse==='F30';
    document.getElementById('hgt').value='2.60'; document.getElementById('hgt').dispatch('input');
    WP.run();
    return a && store.aktivesWandelement().brandklasse==='F30'; })());
  // Wandbezogen: eine zweite Wand erbt nichts von der ersten (keine Vererbung).
  const idBk2=store.speichere('Brandklasse 2', buildWall('Brandklasse 2',2000,2600,[]));
  store.setzeAktiv(idBk2); globalThis.window.__wpInit();
  ok('[#79] zweite Wand erbt die Klassifikation nicht (Merkmal ist wandbezogen)',
    document.getElementById('brandklasse').value==='F0'
    && store.holeElement(idBk).wandelement.brandklasse==='F30');
  // Aus der Kennzeichnung wird nichts abgeleitet: sie erreicht den Core nie und steht in
  // keinem `eingaben`-Abschnitt ([P-13] bleibt unberuehrt).
  ok('[#79] die Klassifikation steht in keinem eingaben-Abschnitt',
    !JSON.stringify(store.holeEingaben(idBk)).includes('brandklasse')
    && !JSON.stringify(store.holeEingaben(idBk)).includes('F30'));
  store.setzeAktiv(idA); globalThis.window.__wpInit();
}

// Reload (erneutes __wpInit(): das Modul liest alles frisch aus dem Storage)
globalThis.window.__wpInit();
ok('Reload: Auswahl bleibt erhalten und ist angehakt',
  JSON.stringify(store.holeProdukte(1).rollen.rod_std)==='["rod-1100"]'
  && /data-prolle="rod_std" data-pid="rod-1100" checked/.test(document.getElementById('prodRollen').innerHTML));

// Externer Wechsel des aktiven Elements lädt Geometrie (Kopfdaten jetzt in Modul 0)
const idExt=store.speichere('Ext', Object.assign(buildWall('Ext',2000,2600,[]),{wandtyp:'mit_wind'}));
store.setzeAktiv(idExt);   // echte Benachrichtigung der Storage-Schicht
ok('Externer Wechsel lädt Wandelement', document.getElementById('len').value==='2.000');
ok('Externer Wechsel übernimmt dessen Wandtyp', WP.RESULT.wandelement.wandtyp==='mit_wind');
ok('Produktauswahl ist wandbezogen (neues Element = leere Auswahl)',
  KAT.anzahlAuswahl(KAT.produktRollen(store.aktiveEingaben()))===0
  && store.holeProdukte(1, idA).rollen.rod_std.length===1);

// ---- Issue #82: Verzahnungswerkzeug ([G-10]/[G-11]/[G-12]) --------------------------------
// Nutzerpfad: Ein Nutzer oeffnet Modul 1 fuer eine Wand, legt ueber das Verzahnungswerkzeug
// einen Bereich mit Startlage in der untersten Lage an und sieht danach in der Wandansicht
// die alternierend ausgesparten Steine sowie die entsprechend verringerte Steinmenge.
{
  const idIl=store.speichere('Verzahnung', buildWall('Verzahnung',2000,2600,[]));
  store.setzeAktiv(idIl);
  globalThis.window.__wpInit();
  // Pruefe, dass das UI-Element vorhanden ist
  ok('[#82] Verzahnungs-UI im Markup vorhanden',
    /id="interlockList"/.test(html) && /id="addInterlock"/.test(html));
  ok('[#82] Verzahnungs-Warnbereich im Markup vorhanden', /id="interlockWarns"/.test(html));
  // Ohne Verzahnung: leere Liste
  ok('[#82] ohne Verzahnung: leere Liste', WP.interlocks.length===0);
  ok('[#82] ohne Verzahnung: kein interlocks am Wandelement',
    (WP.RESULT.wandelement.interlocks||[]).length===0);
  // Verzahnung ueber den realen Button hinzufuegen
  WP.addInterlock();
  ok('[#82] Verzahnung hinzugefuegt', WP.interlocks.length===1);
  // Default-Werte: g0=0, breite=3, start_parity=0 (unterste Lage ausgespart)
  ok('[#82] Default-Werte: Position 0, Breite 3, unterste Lage ausgespart',
    WP.interlocks[0].g0===0 && WP.interlocks[0].breite===3 && WP.interlocks[0].start_parity===0);
  // Pruefe, dass die Verzahnung am Wandelement steht (ueber vorgaben -> buildWall)
  const vil=WP.vorgaben().interlocks;
  ok('[#82] interlocks in vorgaben() enthalten', Array.isArray(vil) && vil.length===1);
  ok('[#82] vorgaben().interlocks hat korrektes Format (g0, g1, start_parity)',
    vil[0].g0===0 && vil[0].g1===3 && vil[0].start_parity===0);
  // Pruefen, dass die Verzahnung im gespeicherten Wandelement steht
  const wil=store.aktivesWandelement();
  ok('[#82] Verzahnung im gespeicherten Wandelement',
    Array.isArray(wil.interlocks) && wil.interlocks.length===1);
  ok('[#82] gespeichertes Wandelement hat korrekte Verzahnungswerte',
    wil.interlocks[0].g0===0 && wil.interlocks[0].g1===3 && wil.interlocks[0].start_parity===0);
  // Pruefe, dass ausgesparte Steine in der Wandansicht fehlen
  // Im Verzahnungsbereich (Raster 0-2) werden in alternierenden Lagen Steine ausgespart
  // Bei start_parity=0: unterste Lage (0) ist ausgespart, Lage 1 ist voll, Lage 2 ausgespart usw.
  const courses0=wil.courses.filter(c=>c.lage%2===0);   // gerade Lagen (0, 2, 4, ...) sind ausgespart
  const courses1=wil.courses.filter(c=>c.lage%2===1);   // ungerade Lagen (1, 3, 5, ...) sind voll
  // In ausgesparten Lagen: keine Steine im Bereich 0-375mm (3 Raster = 375mm)
  const ausgespart0=courses0.every(c=>{
    const imBereich=c.stones.filter(s=>s.x0<375);
    // Die Steine im Bereich 0-375mm duerfen nicht existieren (sie wurden ausgespart)
    // oder sie beginnen erst NACH dem Bereich
    return imBereich.length===0 || imBereich.every(s=>s.x0>=375);
  });
  ok('[#82] in ausgesparten Lagen fehlen Steine im Verzahnungsbereich', ausgespart0);
  // Pruefe, dass in vollen Lagen die Steine im Bereich vorhanden sind
  const voll1=courses1.every(c=>{
    const imBereich=c.stones.filter(s=>s.x0<375);
    return imBereich.length>0;   // mindestens ein Stein beginnt im Bereich
  });
  ok('[#82] in vollen Lagen sind Steine im Verzahnungsbereich vorhanden', voll1);
  // Pruefe, dass die Wandansicht den Verzahnungsbereich kennzeichnet
  const planHtmlIl=document.getElementById('plan').innerHTML;
  ok('[#82] Verzahnungsbereich in der Wandansicht gekennzeichnet',
    /Verzahnung/.test(planHtmlIl) && /verzPattern/.test(planHtmlIl));
  // Pruefe, dass die Steinmenge sich verringert hat (weniger Steine als ohne Verzahnung)
  const ohneIl=buildWall('Ohne',2000,2600,[]);
  const mitIl=wil;
  ok('[#82] Steinmenge mit Verzahnung geringer',
    (mitIl.bom.i3+mitIl.bom.i2)<(ohneIl.bom.i3+ohneIl.bom.i2));
  // Pruefe, dass Vorspannung/Strangabstand identisch sind (keine Aenderung an Segmenten)
  ok('[#82] Vorspannung bleibt unveraendert (Achsen identisch)',
    JSON.stringify(mitIl.tension_columns.map(c=>c.k))===JSON.stringify(ohneIl.tension_columns.map(c=>c.k)));
  // Roundtrip: Wandelement mit Verzahnung laden
  WP.applyWand(wil);
  ok('[#82] Roundtrip: Verzahnung bleibt nach applyWand erhalten',
    WP.interlocks.length===1 && WP.interlocks[0].g0===0 && WP.interlocks[0].breite===3);
  store.setzeAktiv(idA); globalThis.window.__wpInit();
}

// ---- Issue #106: dieselbe Ansicht, dieselbe Bauteilgroesse — bei JEDER Wandlaenge -------
// Der eigentliche Fehler, den #106 behebt: `sc=(1000-2*pad)/L` haengt allein an der WANDLAENGE,
// und bis #106 waren alle Symbolmasse Vielfache von `COURSE*sc`. Dasselbe Bauteil war damit in
// einer kurzen Wand um ein Mehrfaches groesser als in einer langen. Geprueft wird an zwei
// Wandelementen mit gleichem Aufbau und stark verschiedener Laenge; beide tragen oben Blech,
// damit Spannmutter UND Fussschraube vorkommen. Die Pruefung steht am Ende der Datei, weil
// sie das angezeigte Wandelement wechselt; danach wird der Ausgangsstand wiederhergestellt.
{
  const svg=()=>document.getElementById('plan').innerHTML;
  const vorher=WP.RESULT.wandelement;
  const RE_KOP=/<rect class="kop" x="[-\d.]+" y="[-\d.]+" width="([-\d.]+)" height="([-\d.]+)"/g;
  const RE_MUT=new RegExp('<rect x="[-\\d.]+" y="[-\\d.]+" width="([-\\d.]+)" height="([-\\d.]+)"'
    +' fill="'+MONT.SPANN_FARBE.mutter+'"','g');
  const E=MONT.SPANN_EINHEIT.ansicht, MM=MONT.SPANN_MM;
  const masse=mm=>{
    WP.applyWand(Object.assign(buildWall('Mass '+mm, mm, 2600, [], null,
      { top_connection:'blech' }), {wandtyp:'ohne_wind'}));
    const s=svg();
    const paare=re=>[...new Set([...s.matchAll(re)].map(m=>m[1]+'x'+m[2]))].sort();
    const alle=[...s.matchAll(RE_MUT)].map(m=>({b:+m[1],h:+m[2]}));
    return { kop:paare(RE_KOP),
      mutter:[...new Set(alle.filter(r=>Math.abs(r.b-MM.d*E)<1e-6).map(r=>r.b+'x'+r.h))].sort(),
      kopf:[...new Set(alle.filter(r=>Math.abs(r.b-MM.kopf_d*E)<1e-6).map(r=>r.b+'x'+r.h))].sort(),
      schaft:[...new Set(alle.filter(r=>Math.abs(r.b-MM.schaft_d*E)<1e-6).map(r=>r.b+'x'+r.h))].sort() };
  };
  const kurz=masse(2000), lang=masse(8000);
  ok('[#106] beide Vergleichswaende zeichnen ueberhaupt Kopplung, Mutter, Kopf und Schaft',
    [kurz,lang].every(m=>m.kop.length>0 && m.mutter.length>0 && m.kopf.length>0
      && m.schaft.length>0));
  ok('[#106] Kopplungsmuttern sind in kurzer und langer Wand GLEICH gross',
    JSON.stringify(kurz.kop)===JSON.stringify(lang.kop));
  ok('[#106] Spannmuttern sind in kurzer und langer Wand GLEICH gross',
    JSON.stringify(kurz.mutter)===JSON.stringify(lang.mutter));
  ok('[#106] Schraubenkoepfe sind in kurzer und langer Wand GLEICH gross',
    JSON.stringify(kurz.kopf)===JSON.stringify(lang.kopf));
  // Seit dem festen Ansichtsmasstab gilt das AUCH fuer den Schraubenschaft: er reicht von der
  // Mutternmitte bis an die Unterkante des Bodenblechs, und weil `sc` fest ist, ist die
  // gezeichnete Blechdicke ebenfalls fest. Vorher war der Schaft das eine Mass, das sich
  // zwangslaeufig mit der Wandlaenge aenderte — jetzt gibt es kein solches Mass mehr.
  ok('[#106] auch der Schraubenschaft ist in kurzer und langer Wand GLEICH gross',
    JSON.stringify(kurz.schaft)===JSON.stringify(lang.schaft)
    && kurz.schaft.every(q=>Math.abs(+q.split('x')[0]-MM.schaft_d*E)<1e-6));
  // --- Und der Massstab, an dem der Planer es beurteilt: der STEIN selbst ------------------
  // „Relativ zur Steindarstellung immer gleich gross" ist genau dann erfuellt, wenn der Stein
  // in beiden Waenden dieselbe Zeichengroesse hat — dann ist jedes feste Zeichenmass
  // zwangslaeufig dasselbe Verhaeltnis zum Stein. Geprueft werden Steinhoehe/-breite,
  // Schriftgroessen (auch die Beschriftung IM Stein) und Strichstaerken.
  const bild=mm=>{
    WP.applyWand(Object.assign(buildWall('Bild '+mm, mm, 2600, [], null,
      { top_connection:'blech' }), {wandtyp:'ohne_wind'}));
    const s=svg();
    const steine=[...new Set([...s.matchAll(/<rect x="[-\d.]+" y="[-\d.]+" width="([-\d.]+)" height="([-\d.]+)" fill="#(?:cfd3d8|bcc2c9)"/g)]
      .map(m=>m[1]+'x'+m[2]))].sort();
    const schrift=[...new Set([...s.matchAll(/font-size="([-\d.]+)"/g)].map(m=>m[1]))].sort();
    const striche=[...new Set([...s.matchAll(/stroke-width="([-\d.]+)"/g)].map(m=>m[1]))].sort();
    return { steine, schrift, striche };
  };
  const bKurz=bild(2000), bLang=bild(8000);
  ok('[#106] ein Stein ist in kurzer und langer Wand GLEICH gross gezeichnet',
    bKurz.steine.length>0 && JSON.stringify(bKurz.steine)===JSON.stringify(bLang.steine));
  ok('[#106] eine Lage ist genau ANSICHT_LAGE_PX Einheiten hoch (Masstab in Steinhoehen)',
    bKurz.steine.every(q=>Math.abs(+q.split('x')[1]-WP.ANSICHT_LAGE_PX)<1e-6));
  ok('[#106] alle Schriftgroessen sind in beiden Waenden gleich (auch im Stein)',
    bKurz.schrift.length>1 && JSON.stringify(bKurz.schrift)===JSON.stringify(bLang.schrift));
  ok('[#106] alle Strichstaerken sind in beiden Waenden gleich',
    bKurz.striche.length>1 && JSON.stringify(bKurz.striche)===JSON.stringify(bLang.striche));
  // Und die Gegenprobe, dass die Wand wirklich verschieden gross ist: der viewBox waechst mit.
  ok('[#106] der viewBox waechst mit der Wand, statt die Wand hineinzupressen', (()=>{
    WP.applyWand(Object.assign(buildWall('V1',2000,2600,[],null,null),{wandtyp:'ohne_wind'}));
    const a=WP.LASTDRAW.vbW;
    WP.applyWand(Object.assign(buildWall('V2',8000,2600,[],null,null),{wandtyp:'ohne_wind'}));
    const b=WP.LASTDRAW.vbW;
    return b>a && Math.abs((b-a)-6000*WP.ansichtSc())<1.5; })());
  // Einpassen darf nur VERKLEINERN — eine kurze Wand wird nicht aufgeblasen.
  ok('[#106] Einpassen vergroessert nie ueber den echten Masstab hinaus',
    WP.einpassFaktor()<=WP.ZOOM_FIT);

  // --- Standardstellung zeigt die GANZE Wand (#106) ---------------------------------------
  // Mit festem Masstab ist eine 3-m-Wand hoeher als der Zeichenrahmen. Beim Oeffnen muss sie
  // trotzdem vollstaendig zu sehen sein — waagerecht UND senkrecht, ohne Scrollen. Geprueft
  // wird mit einem realistischen Rahmen (der Standard-Mock ist 1000 breit und hoehenlos, dort
  // waere die Einpassung immer 100 % und die Pruefung wertlos).
  {
    const boxEl=document.getElementById('planBox');
    const KASTEN_W=900, KASTEN_H=520;
    boxEl._rect={left:0,top:0,width:KASTEN_W,height:KASTEN_H};
    // Ausgangslage wie beim Oeffnen: keine eigene Zoomwahl. Frueher im Lauf ist der Zoom von
    // Hand gestellt worden (#100-Abschnitt), und diese Wahl gilt absichtlich weiter —
    // „Einpassen" ist der Weg, die Fuehrung an die Ansicht zurueckzugeben.
    WP.zoomEinpassen();
    WP.applyWand(Object.assign(buildWall('Fit',3000,3000,[],null,null),{wandtyp:'ohne_wind'}));
    const d=WP.LASTDRAW, z=WP.zoomPct/100;
    ok('[#106] eine 3-m-Wand ist ohne Zutun VOLLSTAENDIG zu sehen',
      d.vbH*z<=KASTEN_H+0.5 && d.vbW*z<=KASTEN_W+0.5);
    ok('[#106] dafuer wird wirklich eingepasst (der Rahmen ist kleiner als die Zeichnung)',
      d.vbH>KASTEN_H && WP.zoomPct<100 && WP.zoomPct>=WP.ZOOM_MIN);
    ok('[#106] die Einpassung nutzt den Rahmen aus, statt zu klein zu bleiben',
      Math.abs(Math.min(KASTEN_W/d.vbW, KASTEN_H/d.vbH)*100 - WP.zoomPct)<1.5);
    // Eine EIGENE Zoomwahl darf eine Neuberechnung nicht ueberschreiben.
    document.getElementById('zoomIn').dispatch('click');
    const eigen=WP.zoomPct;
    WP.run();
    ok('[#106] ein selbst gewaehlter Zoom ueberlebt die Neuberechnung',
      WP.zoomPct===eigen && eigen>0);
    WP.applyWand(Object.assign(buildWall('Fit2',4000,3000,[],null,null),{wandtyp:'ohne_wind'}));
    ok('[#106] und auch den Wechsel des Wandelements', WP.zoomPct===eigen);
    // „Einpassen" gibt die Fuehrung zurueck: danach passt sich die Ansicht wieder selbst an.
    WP.zoomEinpassen();
    const nachFit=WP.zoomPct;
    WP.applyWand(Object.assign(buildWall('Fit3',9000,3000,[],null,null),{wandtyp:'ohne_wind'}));
    ok('[#106] Einpassen gibt die Fuehrung zurueck (danach passt sich die Ansicht wieder an)',
      WP.zoomPct!==nachFit && WP.LASTDRAW.vbW*WP.zoomPct/100<=KASTEN_W+0.5);
    boxEl._rect=null; WP.zoomEinpassen();
  }

  // Ausgangsstand zuruecksetzen, damit die folgenden Pruefungen unveraendert laufen.
  WP.applyWand(vorher);
}

// ---- Issue #91: die reale Bodenblechaufteilung steht schon in der Wandansicht --------
// Gemeldet war: die Aufteilung der Bodenbleche ist erst in Modul 5/7 zu sehen, und ihre
// Trennmarke ist schwarz und ragt unter das Blech heraus. Gezeichnet wird deshalb ueber
// `bodenblechSvg()` aus sembla-montage.js — DERSELBE Weg wie in Modul 5 und Modul 7.
// Modul 1 rechnet nichts nach: die Teilfolge kommt aus dem Rechenkern.
{
  const svg=()=>document.getElementById('plan').innerHTML;
  const vorher=WP.RESULT.wandelement;
  // Blechrechtecke am Wandfuss (#5b6673 = FARBE.stahl, #e8702a = STUECK_FARBE.sonder).
  // `t` ist die Ansicht oder eine direkt erzeugte Zeichenkette.
  const rects=t=>{
    const alle=[...t.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" fill="(#5b6673|#e8702a)"/g)]
      .map(m=>({x:+m[1],y:+m[2],w:+m[3],h:+m[4],sonder:m[5]==='#e8702a'}));
    return alle.length?alle.filter(r=>r.y===alle[0].y):[];   // Kopfblech sitzt hoeher
  };
  // Stossmarken: SENKRECHTE weisse Linien auf der Blechoberkante. Die waagerechte weisse
  // Haarlinie am Stangenstoss (#112) traegt `class="haar"` und faellt hier nicht hinein.
  const marken=t=>{
    const r=rects(t); if(!r.length) return [];
    return [...t.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#fff"/g)]
      .filter(m=>+m[1]===+m[3] && +m[2]===r[0].y)
      .map(m=>({x:+m[1],y0:+m[2],y1:+m[4]})).sort((a,b)=>a.x-b.x);
  };
  // Der Vorratssatz kommt in Modul 1 aus der PRODUKTAUSWAHL ([A-10]) — gefahren wird also der
  // echte Bedienpfad: genau ein Bodenblechprodukt (1250) ankreuzen. Eine 3000er Wand ergibt
  // damit 1250 + 1250 + 500, das letzte Teil zwangslaeufig ein Sonderzuschnitt.
  setzen('blech_boden','blech-boden-1250',true);
  WP.applyWand(Object.assign(buildWall('Blech3',3000,2600,[],null,null),{wandtyp:'ohne_wind'}));
  const W91=WP.RESULT.wandelement;
  const T91=MONT.bodenblechTeile(W91), S91=MONT.bodenblechStoesse(W91);
  ok('[A-10] die geplante Wand hat drei Bodenblechteile, das letzte ein Sonderzuschnitt',
    T91.length===3 && S91.length===2 && T91[2].art==='sonder'
    && T91.slice(0,2).every(t=>t.art==='standard'));
  const r91=rects(svg());
  ok('[#91] Modul 1 zeichnet je Bodenblechteil genau ein Rechteck, in Reihenfolge', (()=>{
    if(r91.length!==T91.length) return false;
    const sc=r91[0].w/T91[0].raster_mm;
    return r91.every((r,i)=>Math.abs(r.x-(r91[0].x+T91[i].x0_mm*sc))<1e-9
      && Math.abs(r.w-T91[i].raster_mm*sc)<1e-9); })());
  ok('[#91] und zwei Stossmarken an genau den Positionen aus bodenblechStoesse()', (()=>{
    const m=marken(svg()); if(m.length!==S91.length) return false;
    const sc=r91[0].w/T91[0].raster_mm;
    return S91.every((xm,i)=>Math.abs(m[i].x-(r91[0].x+xm*sc))<1e-9); })());
  ok('[#91] die Marke ist weiss und reicht hoechstens von Blechober- bis -unterkante', (()=>{
    const m=marken(svg()); const oben=r91[0].y, unten=r91[0].y+r91[0].h;
    return m.length>0 && m.every(l=>l.y0===oben && l.y1>l.y0 && l.y1<=unten+1e-9); })());
  ok('[#91] die alte schwarze Trennmarke kommt in der Wandansicht nicht mehr vor',
    !new RegExp('<line x1="[-\\d.]+" y1="'+r91[0].y+'" [^>]*stroke="#13202e"').test(svg()));
  ok('[#91] der Sonderzuschnitt traegt seine nicht farbliche Schraffur (senkrechte Striche)', (()=>{
    const son=r91.filter(r=>r.sonder), std=r91.filter(r=>!r.sonder);
    if(son.length!==1||!std.length) return false;
    const str=r=>[...svg().matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#3a4350"/g)]
      .filter(m=>+m[1]===+m[3] && +m[2]===r.y && +m[1]>r.x && +m[1]<r.x+r.w).length;
    return str(son[0])>=2 && std.every(r=>str(r)===0); })());
  ok('[#91] Modul 1 zeigt dieselben relativen Teilgrenzen wie das Blatt von Modul 7', (()=>{
    const bl=ZEICH.zeichnungSvg(W91,{}).svg;
    const rb=[...bl.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="[-\d.]+"[^>]*fill="(#5b6673|#e8702a)"/g)]
      .map(m=>({x:+m[1],y:+m[2],w:+m[3],sonder:m[4]==='#e8702a'}));
    const r7=rb.length?rb.filter(r=>r.y===rb[0].y):[];
    if(r7.length!==r91.length) return false;
    const rel=a=>{ const ges=a.reduce((s,r)=>s+r.w,0); return a.map(r=>(r.x-a[0].x)/ges); };
    const a=rel(r91), b=rel(r7);
    return a.every((v,i)=>Math.abs(v-b[i])<1e-4)
      && r91.every((r,i)=>r.sonder===r7[i].sonder); })());
  // Die Rueckansicht spiegelt die x-Achse. Die Teile muessen dann von rechts nach links liegen
  // und duerfen nicht aus der Wand herauslaufen — sonst zoege `bodenblechSvg()` jedes Teil in
  // die falsche Richtung.
  ok('[#91] auch die Rueckansicht zeigt die Teilfolge vollstaendig und in der Wand', (()=>{
    document.getElementById('viewToggle').dispatch('click');
    const rb=rects(svg()), mb=marken(svg());
    document.getElementById('viewToggle').dispatch('click');   // zurueck auf Vorderseite
    if(rb.length!==T91.length||mb.length!==S91.length) return false;
    const links=Math.min(...rb.map(r=>r.x)), rechts=Math.max(...rb.map(r=>r.x+r.w));
    const sc=rb[0].w/T91[0].raster_mm;
    return Math.abs((rechts-links)-W91.length_mm*sc)<1e-9
      && T91.every((t,i)=>rb.some(r=>Math.abs(r.w-t.raster_mm*sc)<1e-9))
      && mb.every(m=>m.x>links-1e-9 && m.x<rechts+1e-9); })());
  ok('[#91] die Dickenbeschriftung bleibt erhalten', /Bodenblech .*(mm|Dicke offen)/.test(svg()));
  ok('[#91] Modul 1 fuehrt keine eigene Blechzerlegung mehr',
    /bodenblechSvg\(RESULT\.wandelement/.test(html) && /bodenblechSvg=S\.bodenblechSvg/.test(html)
    && !/\.base_plate\.teile/.test(html));
  // Alt-Wandelement ohne `base_plate.teile`: EIN durchgehender Balken, nichts erfunden.
  // Modul 1 kann so ein Element nicht HALTEN — `run()` baut die Wand bei jeder Eingabe neu und
  // der Rechenkern legt die Teile dabei immer an. Geprueft wird der Alt-Fall deshalb an genau
  // dem Zeichenweg, den die Ansicht benutzt, mit ihrer Abbildung (pad 46, `ansichtSc`, y von
  // unten) — dieselbe Rekonstruktion wie im #112-Block oben.
  ok('[#91] Alt-Wandelement ohne base_plate.teile: ein durchgehender Balken ohne Stossmarke',
    (()=>{
      const WALT=JSON.parse(JSON.stringify(W91)); delete WALT.base_plate.teile;
      const sc=WP.ansichtSc(), hPx=WALT.height_mm*sc;
      const X=v=>46+v*sc, Y=v=>46+(hPx-v*sc);
      const t=MONT.bodenblechSvg(WALT, X, Y, sc, 4, { rand: 0.8 });
      const r=rects(t);
      return r.length===1 && !r[0].sonder && Math.abs(r[0].w-WALT.length_mm*sc)<1e-9
        && marken(t).length===0; })());

  setzen('blech_boden','blech-boden-1250',false);   // Auswahl wieder zuruecknehmen
  WP.applyWand(vorher);   // Ausgangsstand fuer die folgenden Pruefungen
}

// Issue #6 (M1): ohne aktives Wandelement legt Modul 1 KEINS an, sondern verweist auf Modul 0.
const anzahlVorher=store.listeElemente().length;
store.setzeAktiv(null);
ok('ohne aktives Element: leere Vorschau + Verweis auf Modul 0',
  !WP.RESULT && /Kein aktives Wandelement/.test(document.getElementById('plan').innerHTML)
  && /Start/.test(document.getElementById('saveHint').textContent));
// Issue #63: im echten Leerzustand darf keine irrefuehrende Zuschnittlegende stehenbleiben.
ok('[#63] Leerzustand: Legendenbereich ist leer', zleg()==='');
document.getElementById('hgt').value='3.00'; document.getElementById('hgt').dispatch('input');
ok('ohne aktives Element: keine stille Neuanlage', store.listeElemente().length===anzahlVorher && !WP.RESULT);
ok('ohne aktives Element: keine Produktauswahl möglich', (()=>{
  document.getElementById('prodRollen').dispatch('change',{target:{dataset:{prolle:'i3',pid:'stein-i3'},checked:true}});
  return store.holeProdukte(1, idExt).rollen.i3===undefined; })());

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
