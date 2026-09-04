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
  setAttribute(){} getBoundingClientRect(){return {left:0,width:1000};} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(s){ if(s==='tbody'){ if(!this._tb)this._tb=new El('tb'); return this._tb;} return new El('x'); }
  querySelectorAll(){return [];} appendChild(){} }
const dv={len:'2.00',hgt:'2.60',startAchse:'0',sideVorne:'fassade',sideHinten:'innenausbau',qk:'1.00',gammaQ:'1.50',modus:'auto',spacing:'3',force:'60',fcd:'20',cfd:'0.60',rho:'14',blechCm:'100',topConn:'blech',abdichtung:'nicht_abgedichtet',brandklasse:'F0'};
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
// Aktives Element ist in Modul 0 angelegt worden (inkl. Wandtyp) — Modul 1 legt selbst KEINS an.
// Der Leerfall wird am Ende separat geprüft.
const startWand=Object.assign(buildWall('Wand A',2000,2600,[]),{wandtyp:'ohne_wind'});
const idA=store.speichere('Wand A', startWand); store.setzeAktiv(idA);
globalThis.window.SEMBLA={ buildWall, Opening, GRID, COURSE, autoAuslegung, nachweisPruefen, store, KAT,
  STUECK_FARBE: MONT.STUECK_FARBE, STUECK_LABEL: MONT.STUECK_LABEL,
  stueckFarbe: MONT.stueckFarbe, stangenStuecke: MONT.stangenStuecke,
  // [A-14]/#93: Symbol, Kennfarbe und Klartext des Einlegeblechs kommen — wie der
  // Zuschnittschluessel — aus sembla-montage.js; die wirksamen Punkte aus dem Rechenkern.
  ZWISCHENPUNKT: MONT.ZWISCHENPUNKT, zwischenpunktSvg: MONT.zwischenpunktSvg,
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
  const marken=(svg.match(/<line class="kop"/g)||[]).length;   // Klasse trennt sie vom Legendenmuster
  return stuecke.length>w.tension_columns.length      // es gibt ueberhaupt mehrere Stuecke
    && striche===stuecke.filter(p=>p.art==='standard').length
    && marken===kopplungen; })());
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
  ok('[#100] das SVG wird proportional in die verfuegbare Hoehe eingepasst', (()=>{
    const css=(html.match(/\.planbox>svg\{[^}]*\}/)||[''])[0];
    return /height:auto/.test(css)
      && /max-height:calc\(var\(--planh\) \* var\(--zoom\)\)/.test(css)
      && /width:calc\(100% \* var\(--zoom\)\)/.test(css)
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

  // (c) Standardstellung = eingepasst
  ok('[#100] Standardstellung ist die eingepasste Ansicht (100 %), Wert sichtbar',
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
  ok('[#100] die Zoomlogik ruehrt weder viewBox noch Speicher an',
    !/viewBox/.test(zoomQuelle) && !/store\./.test(zoomQuelle)
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
ok('base_plate im Wandelement (15 mm)', !!wfr.base_plate && wfr.base_plate.dicke_mm===15);
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

// Issue #13: Startachse der Vorspannung (1./2. Rasterachse) über den echten Handler.
// N=16 (2,00 m) ist bewusst nicht glatt durch den Strangabstand teilbar.
// Sauberer Ausgangszustand: glatte 2,00-m-Wand laden (setzt Öffnungen/Staffelung zurück),
// fester Nachweis-Modus mit Strangabstand 3 -> deterministische Achsen.
WP.applyWand(Object.assign(buildWall('T13',2000,2600,[]),{wandtyp:'mit_wind'}));
document.getElementById('modus').value='nachweis'; document.getElementById('spacing').value='3';
document.getElementById('force').value='60'; WP.run();
ok('Auswahlfeld Startachse in Modul 1 vorhanden', /id="startAchse"/.test(html));
const ks0=WP.RESULT.wandelement.tension_columns.map(c=>c.k);
ok('Default = 1. Rasterachse (Bestand)', WP.RESULT.wandelement.prestress.start_axis_grid===0 && ks0[0]===0);
document.getElementById('startAchse').value='1'; document.getElementById('startAchse').dispatch('change');
const w13=WP.RESULT.wandelement, ks1=w13.tension_columns.map(c=>c.k), x13=w13.prestress.max_span_grid;
ok('Auswahl wirkt bis ins Wandelement (prestress)', w13.prestress.start_axis_grid===1);
ok('Startanker auf 2. Rasterachse (k=1), keine Achse auf k=0', ks1[0]===1 && !ks1.includes(0));
ok('Endanker bleibt letzte Achse N-1', ks1[ks1.length-1]===w13.N_grid-1);
ok('alle Abstände <= Strangabstand x', ks1.every((k,i)=>i===0||k-ks1[i-1]<=x13));
// Eingefrorene Verteilung: NICHT mehr die glatt balancierte Reihe von frueher — seit [V-2] setzt
// die Steinabdeckung (Muss) die Achsen, [V-4] fuellt danach nur noch Luecken > x auf. Die Reihe
// haelt trotzdem alle Regeln ein: Start bei 1, Ende bei N-1, jeder Abstand <= x, Abdeckung
// lueckenlos (validation.ungehaltene_steine leer, unten geprueft).
ok('Fortführung ab Startachse (nicht glatt teilbar)', JSON.stringify(ks1)==='[1,3,5,8,11,13,15]' && x13===3);
ok('[V-2] Steinabdeckung dabei lückenlos', w13.validation.ungehaltene_steine.length===0);
document.getElementById('startAchse').value='0'; document.getElementById('startAchse').dispatch('change');
ok('Zurück auf 1. Rasterachse', WP.RESULT.wandelement.prestress.start_axis_grid===0 &&
   JSON.stringify(WP.RESULT.wandelement.tension_columns.map(c=>c.k))==='[0,3,5,8,11,13,15]');
// auch im Auto-Modus (Strangabstand von der Engine optimiert) wirkt die Startachse
document.getElementById('modus').value='auto'; document.getElementById('startAchse').value='1';
document.getElementById('startAchse').dispatch('change');
const wA=WP.RESULT.wandelement, ksA=wA.tension_columns.map(c=>c.k);
ok('Auto-Modus: Startachse 2 wirkt, Abstände <= optimiertem x', wA.prestress.start_axis_grid===1 &&
   ksA[0]===1 && ksA[ksA.length-1]===wA.N_grid-1 && ksA.every((k,i)=>i===0||k-ksA[i-1]<=wA.prestress.max_span_grid));
document.getElementById('modus').value='nachweis'; document.getElementById('startAchse').value='0';
document.getElementById('startAchse').dispatch('change');
// Wiederherstellung beim Laden eines gespeicherten Wandelements
WP.applyWand(Object.assign(buildWall('Gespeichert',2000,2600,[],null,{start_axis_grid:1}),{wandtyp:'mit_wind'}));
ok('Startachse aus gespeichertem Wandelement wiederhergestellt',
   document.getElementById('startAchse').value==='1' && WP.RESULT.wandelement.prestress.start_axis_grid===1);
const alt=buildWall('Alt',2000,2600,[]); delete alt.prestress.start_axis_grid;   // Altstand ohne Feld
WP.applyWand(Object.assign(alt,{wandtyp:'mit_wind'}));
ok('Altstand ohne Feld -> 1. Rasterachse', document.getElementById('startAchse').value==='0' && WP.RESULT.wandelement.tension_columns[0].k===0);

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
    'Fuß immer Bodenblech (15 mm). Kopf wahlweise',   // Vorspann-Hardware (statischer Absatz)
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
    '2 · Auslegung','Last (horizontal, Fläche)','Modus','Spannachsen','Vorspann-Hardware',
    'Materialannahmen','3 · Produkte (Bauteilkatalog)'];
  let pos=-1;
  for(const t of soll){ const i=LINKS.indexOf('>'+t+'<'); if(i<=pos) return false; pos=i; }
  const felder=['len','hgt','addTuer','addFenster','durchTool','durchClear','axisTool','axisDel',
    'axisAuto','addStep','sideVorne','sideHinten','qk','gammaQ','modus','spacing','force',
    'startAchse','blechCm','topConn','rodUeber','fcd','cfd','rho','prodRollen','run'];
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
  && /id="startAchse"[^>]*title="[^"]+"/.test(LINKS) && /id="topConn"[^>]*title="[^"]+"/.test(LINKS));
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
