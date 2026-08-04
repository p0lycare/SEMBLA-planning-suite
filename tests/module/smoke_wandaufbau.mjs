// Smoke-Test Modul 2 (docs/wandaufbau.html): evaluiert das klassische App-Skript unter einem
// DOM-Mock. Rechenkern (buildWall/Opening) + Storage werden — wie im Browser via window.SEMBLA —
// aus docs/shared/ bzw. per Mock bereitgestellt und vor __waInit() gebunden.
// Dämmung ist in Modul 2 bewusst entfernt (MVP) — dafür gibt es keine Prüfungen mehr.
import { readFileSync } from "node:fs";
import { buildWall, Opening, GRID, COURSE } from "../../docs/shared/sembla-core.js";
import { berechneAufbau, VERBINDER_KATALOG } from "../../docs/shared/sembla-aufbau.js";

const html = readFileSync(new URL("../../docs/wandaufbau.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];   // das klassische (attributlose) Skript

// Mock-Element inkl. classList, disabled und Pointer-Capture — Modul 2 nutzt diese für den
// Auswahlmodus (aktiver Zustand am Button/an der Zeichenfläche, robuste Pointer-Sequenz).
class ClassList{constructor(){this._s=new Set();}
  add(c){this._s.add(c);} remove(c){this._s.delete(c);} contains(c){return this._s.has(c);} toString(){return [...this._s].join(' ');}}
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.checked=true;this.listeners={};
    this.classList=new ClassList();this.disabled=false;this.capturedPointer=null;}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  dispatch(e,ev={}){(this.listeners[e]||[]).forEach(f=>f({target:this,...ev}));}
  setPointerCapture(id){this.capturedPointer=id;} releasePointerCapture(id){if(this.capturedPointer===id)this.capturedPointer=null;}
  setAttribute(k,v){this['__'+k]=v;} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(){return new El('x');} querySelectorAll(){return [];} appendChild(){} click(){}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:600};}}
const dv={pB:'62.5',pH:'150',oX:'0',oY:'0',maxX:'62.5',maxY:'75',ohang:'12.5',vtyp:'FA-1',Rk:'0.5',gM:'2.0',wk:'0.8',gQ:'1.5',lw:'4',stock:'150',side:'vorne'};
const _e={}; const document={getElementById:id=>{let e=_e[id];if(!e){e=_e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement:()=>new El('a')};
// window-Listener werden mitgeschrieben (Escape-Ausstieg + Pointer-Sicherheitsnetz sind testbar).
const _wl={}; const winFire=(e,ev={})=>{ (_wl[e]||[]).forEach(f=>f(ev)); };
globalThis.document=document; globalThis.window={addEventListener:(e,f)=>{(_wl[e]||(_wl[e]=[])).push(f);}};
globalThis.alert=m=>{globalThis.__alert=m;};
globalThis.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}}; globalThis.Blob=class{constructor(){}};
globalThis.FileReader=class{readAsText(){}};

// Deep-Merge wie in storage.js (für den mergeEingaben-Mock).
function merge(base, patch){
  if(patch===null||typeof patch!=='object'||Array.isArray(patch)) return patch;
  const out=(base&&typeof base==='object'&&!Array.isArray(base))?{...base}:{};
  for(const k of Object.keys(patch)) out[k]=merge(out[k],patch[k]);
  return out;
}
// Storage-Mock: kein aktives Element -> Modul startet leer (kein Demo/Platzhalter). abonniere() speichert den Rückruf.
let _subs=[]; let _aktiv=null; let _eg=null; let _merges=[];
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>null, aktivesElement:()=>null,
  aktiveEingaben:()=>_eg, mergeEingaben:(teil,patch)=>{ _merges.push([teil,patch]); if(_eg){ _eg[teil]=merge(_eg[teil],patch); } return _aktiv; },
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
globalThis.window.SEMBLA={ buildWall, Opening, GRID, COURSE, store:storeMock, berechneAufbau, VERBINDER_KATALOG };

eval(script);
globalThis.window.__waInit();
const WA=globalThis.window.__wa;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// Startet leer (kein aktives Element -> kein Demo/Platzhalter, klare Leer-Anzeige)
ok('Start ohne aktives Element -> keine Wand geladen (leer)', !WA.wall);
ok('Start ohne aktives Element -> Leer-Hinweis in der Zeichnung', /Kein aktives Wandelement/.test(document.getElementById('plan').innerHTML));
// Ohne Wandelement gibt es keine Fläche zum Bearbeiten: Einstieg gesperrt, Klick bleibt wirkungslos.
ok('ohne aktives Element -> Bearbeiten-Button gesperrt', document.getElementById('fieldMode').disabled===true);
ok('ohne aktives Element -> Abschluss-Button verborgen', document.getElementById('fieldApply').style.display==='none');
document.getElementById('fieldMode').dispatch('click');
ok('ohne aktives Element -> Klick aktiviert keinen Bearbeitungsmodus',
   WA.fieldArm===false && !document.getElementById('plan').classList.contains('picking'));

// Wand mit Tür laden (3,00 × 2,60 m)
const W=buildWall('Testwand', 3000, 2600, [new Opening(4,8,0,10,'tuer')], {vorne:{funktion:'fassade'},hinten:{funktion:'innenausbau'}});
WA.applyWand(W);
const R=WA.compute();

ok('Achsen berechnet (X,Y > 0)', R.xs.length>0 && R.ys.length>0);
const hasX=v=>R.xs.some(x=>Math.abs(x-v)<0.01);
ok('X-Achsen an Panelfugen (62,5 / 125 / 187,5 / 250)', hasX(62.5)&&hasX(125)&&hasX(187.5)&&hasX(250));
ok('Y-Achse an Panelfuge (150 cm)', R.ys.some(y=>Math.abs(y-150)<0.01));
ok('Randachsen auf erster/letzter Nut (12,5 und B-12,5)', hasX(12.5)&&hasX(287.5));
ok('keine Verbinder in der Türöffnung', !R.pts.some(p=>p.x_cm>50.01&&p.x_cm<99.99&&p.y_cm>0.01&&p.y_cm<199.99));
ok('Layout-Format SEMBLA-VerbinderLayout', R.layout.format==='SEMBLA-VerbinderLayout' && R.layout.wall.B_cm===300 && R.layout.panel.b_cm===62.5);
ok('Layout enthält Öffnung + Punkte', R.layout.openings_cm.length===1 && R.layout.points.length===R.pts.length);
ok('Latten geplant (Achsen + Stücke)', R.batt.summary.achsen>0 && R.batt.summary.latten_stuecke>0);
ok('keine Dämmung mehr im Ergebnis (MVP)', R.batt.daemmung===undefined);
ok('Auslastung berechnet (0..∞) + Flag', isFinite(R.util) && (R.ok===true||R.ok===false));
const sortedX=[...R.xs].sort((a,b)=>a-b); let gapOk=true; for(let i=1;i<sortedX.length;i++) if(sortedX[i]-sortedX[i-1]>62.5+0.01) gapOk=false;
ok('max. X-Abstand ≤ 62,5 cm eingehalten', gapOk);
const plan=document.getElementById('plan').innerHTML;
ok('Zeichnung: Panelraster + Verbinder + Latten', /stroke-dasharray/.test(plan) && /circle/.test(plan) && /#8a5a2b/.test(plan));

// Seitenwechsel
document.getElementById('side').value='hinten'; document.getElementById('side').dispatch('change');
ok('Seitenwechsel -> hinten', WA.side==='hinten' && WA.compute().layout.seite==='hinten');
document.getElementById('side').value='vorne'; document.getElementById('side').dispatch('change');
document.getElementById('pB').value='125'; document.getElementById('pB').dispatch('input');
ok('größere Panelbreite -> weniger/gleich X-Achsen', WA.compute().xs.length<=R.xs.length);
document.getElementById('pB').value='62.5'; document.getElementById('pB').dispatch('input');

// Beplankungsfeld – nur ein Teil der Wand
const full=WA.compute();
WA.setFeld(0,125,0,150);
const F=WA.compute();
ok('Feld gesetzt (feld_cm im Layout)', F.layout.feld_cm && F.layout.feld_cm.x1===125 && F.layout.feld_cm.y1===150);
ok('alle Verbinder innerhalb des Feldes', F.pts.every(p=>p.x_cm<=125.01 && p.y_cm<=150.01 && p.x_cm>=-0.01 && p.y_cm>=-0.01));
ok('weniger Verbinder als bei ganzer Wand', F.pts.length < full.pts.length && F.pts.length>0);
ok('Latten nur im Feld (y ≤ 150)', F.batt.axes.every(a=>a.segments.every(sg=>sg.y1_cm<=150.01)) && F.batt.axes.every(a=>a.x_cm<=125.01));
// Feld nachträglich am Raster verkleinern (PowerPoint-Anfasser)
WA.setFeld(0,300,0,260);
WA.resizeFeld('x1',130);
ok('resizeFeld: rechte Kante rastet (x1≈125)', Math.abs(WA.feld.x1-125)<0.01);
WA.resizeFeld('y1',160);
ok('resizeFeld: obere Kante rastet (y1≈150)', Math.abs(WA.feld.y1-150)<0.01);
ok('resizeFeld: Verbinder folgen dem kleineren Feld', WA.compute().pts.every(p=>p.x_cm<=125.01 && p.y_cm<=150.01));
WA.resizeFeld('x1',3);
ok('resizeFeld: Mindestkantenlänge 12,5 cm', WA.feld.x1-WA.feld.x0>=12.49);
WA.clearFeld();
ok('ganze Wand zurückgesetzt (feld null)', WA.feld===null && WA.compute().layout.feld_cm===null);
WA.setFeld(50,250,0,150);
ok('Feld-Rechteck gezeichnet', /Beplankungsfeld/.test(document.getElementById('plan').innerHTML));
WA.clearFeld();

// ---------------------------------------------------------------------------
// Bearbeitungsmodus für das Beplankungsfeld (Issues #4 + #17, Variante A): echter Bedienweg über
// die Buttons der Leiste + Pointer-Events auf der Zeichenfläche. Geprüft werden die sichtbaren
// DOM/SVG-Zustände und der reale Handlerpfad, nicht die Test-API.
const planEl=document.getElementById('plan'), modeBtn=document.getElementById('fieldMode'),
      applyBtn=document.getElementById('fieldApply'), clearBtn=document.getElementById('fieldClear'),
      hintEl=document.getElementById('fieldHint');
const f1=n=>n.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});
const anzahl=(s,re)=>(s.match(re)||[]).length;
// cm -> Client-Koordinaten (Umkehrung der Zeichen-Abbildung; Mock-Rect ist 1000×600)
function ptr(kind,xcm,ycm,pid=7){ const v=WA.view; const st={prevented:false};
  const ev={ clientX: v.pad+xcm*v.sc, clientY: (v.pad+v.hPx-ycm*v.sc)*600/v.vbH, pointerId:pid,
             preventDefault(){ st.prevented=true; } };
  planEl.dispatch(kind,ev); return st; }
// gleiche Ereignisform, aber über window — prüft das Sicherheitsnetz ohne greifende Pointer-Capture
function winPtr(kind,xcm,ycm,pid=7){ const v=WA.view;
  winFire(kind,{ clientX: v.pad+xcm*v.sc, clientY: (v.pad+v.hPx-ycm*v.sc)*600/v.vbH, pointerId:pid, preventDefault(){} }); }

// Die Bedienelemente tragen im echten Markup die vereinbarten Namen (Variante A).
ok('UI: Einstieg heißt „Beplankungsfeld bearbeiten“', /id="fieldMode"[^>]*>Beplankungsfeld bearbeiten</.test(html));
ok('UI: Abschluss-Button „Übernehmen & berechnen“ existiert', /id="fieldApply"[^>]*>Übernehmen &amp; berechnen</.test(html));

WA.applyWand(W); WA.clearFeld();          // Wand 300 × 260 cm, Panel 62,5 × 150 -> gx=[0;62,5;125;187,5;250;300], gy=[0;150;260]
_merges=[]; _eg={aufbau:{}};
ok('vor Aktivierung: kein Bearbeitungsmodus (kein Raster, keine Anweisung, kein Abschluss-Button)',
   WA.fieldArm===false && !planEl.classList.contains('picking') && !/snapdot/.test(planEl.innerHTML) &&
   hintEl.textContent==='' && applyBtn.style.display==='none' && applyBtn.disabled===true);

// --- #17 MUSS 2: außerhalb des sichtbaren Modus ist ein bestehendes Feld NICHT editierbar ---
WA.setFeld(0,125,0,150);                  // übernommenes Feld (programmatische Test-API, unverändert)
_merges=[]; const festJson=JSON.stringify(WA.feld), festPts=WA.compute().pts.length;
ok('außerhalb des Modus: keine Anfasser gezeichnet', !/drafthandle/.test(planEl.innerHTML));
ptr('pointerdown',125,150); ptr('pointermove',190,260); ptr('pointerup',190,260);
ok('außerhalb des Modus: Ziehen am Eckpunkt verändert das Feld nicht',
   JSON.stringify(WA.feld)===festJson && planEl.capturedPointer===null);
ptr('pointerdown',60,60); ptr('pointermove',120,60); ptr('pointerup',120,60);
ok('außerhalb des Modus: Verschieben in der Fläche verändert das Feld nicht', JSON.stringify(WA.feld)===festJson);
ok('außerhalb des Modus: nichts persistiert, Ergebnis unverändert',
   _merges.length===0 && _eg.aufbau.feld_cm.x1===125 && WA.compute().pts.length===festPts);

// --- Einstieg in den sichtbaren Modus (MUSS 1 + 2) ---
modeBtn.dispatch('click');
ok('Aktivierung: Modus an, Button zeigt aktiven Zustand + Abbruch',
   WA.fieldArm===true && modeBtn.classList.contains('active') &&
   modeBtn['__aria-pressed']==='true' && /abbrechen/i.test(modeBtn.textContent));
ok('Aktivierung: Zeichenfläche markiert (picking)', planEl.classList.contains('picking'));
ok('Aktivierung: Abschluss-Button „Übernehmen & berechnen“ sichtbar + bedienbar',
   applyBtn.style.display==='' && applyBtn.disabled===false);
ok('Aktivierung: bestehendes Feld wird als Entwurf gespiegelt (Feld selbst unberührt)',
   WA.entwurf && WA.entwurf.x1===125 && WA.entwurf.y1===150 && WA.feld.x1===125);
ok('Aktivierung: Rasterpunkte (6 × 3 = 18) + Anfasser des Entwurfs sichtbar',
   anzahl(planEl.innerHTML,/class="snapdot"/g)===18 && anzahl(planEl.innerHTML,/class="drafthandle"/g)===8);
ok('Aktivierung: Bedienerklärung nennt den Abschluss (Leiste + Banner in der Zeichnung)',
   /Übernehmen/.test(hintEl.textContent) && hintEl.style.display==='' &&
   /pickbanner/.test(planEl.innerHTML) && /Übernehmen/.test(planEl.innerHTML));

// --- #17 MUSS 3: Anpassen im Modus ist reine Vorschau ---
_merges=[];
ptr('pointerdown',125,150);                       // Anfasser rechts oben des Entwurfs
ptr('pointermove',190,260);
ok('Anpassen: Entwurf rastet auf erlaubte Rasterposition (187,5 / 260)',
   WA.entwurf.x1===187.5 && WA.entwurf.y1===260);
ok('Anpassen: Modus bleibt sichtbar (Rasterpunkte + picking)',
   /snapdot/.test(planEl.innerHTML) && planEl.classList.contains('picking'));
ok('Anpassen: übernommenes Feld unverändert', WA.feld.x1===125 && WA.feld.y1===150);
ok('Anpassen: nichts persistiert (kein mergeEingaben, Modell unverändert)',
   _merges.length===0 && _eg.aufbau.feld_cm.x1===125);
ok('Anpassen: Latten/Verbinder rechnen weiter mit dem übernommenen Feld',
   WA.compute().pts.length===festPts && WA.compute().pts.every(p=>p.x_cm<=125.01 && p.y_cm<=150.01));
ptr('pointerup',190,260);
ok('Loslassen beendet den Modus nicht und übernimmt nichts',
   WA.fieldArm===true && WA.feld.x1===125 && _merges.length===0 && planEl.capturedPointer===null);
// Verschieben des Entwurfs (Griff in der Fläche) — ebenfalls nur Vorschau
ptr('pointerdown',90,60);
ptr('pointermove',152.5,60);
ok('Verschieben: Entwurf rastet und behält die Größe', WA.entwurf.x0===62.5 && WA.entwurf.x1===250);
ok('Verschieben: weiterhin nichts persistiert, Feld unverändert', _merges.length===0 && WA.feld.x1===125);
ptr('pointerup',152.5,60);

// --- Neu aufziehen im Modus (Snap-/Vorschau-Verhalten aus #4 bleibt erhalten) ---
const down=ptr('pointerdown',280,130);            // außerhalb des Entwurfs -> neues Rechteck
ok('Ziehen: Textauswahl unterbunden (preventDefault) + Pointer-Capture auf der Zeichenfläche',
   down.prevented===true && planEl.capturedPointer===7);
ptr('pointermove',60,10);
ok('Ziehen: Vorschau rastet live auf erlaubte Rasterpositionen (300/150 -> 62,5/0)',
   WA.preview && WA.preview.x0===300 && WA.preview.y0===150 && WA.preview.x1===62.5 && WA.preview.y1===0);
ok('Ziehen: Vorschau-Rechteck im SVG sichtbar (mit Maß)',
   /class="fieldpreview"/.test(planEl.innerHTML) && new RegExp(`${f1(237.5)} × ${f1(150)} cm`).test(planEl.innerHTML));
const vorschauTag=(planEl.innerHTML.match(/<rect class="fieldpreview"[^>]*>/)||[''])[0];
ok('Ziehen: Vorschau ist neutral/grün, kein rotes Ungültig-Modell',
   /#1f9d55/.test(vorschauTag) && !/#c9461c/.test(vorschauTag));
ok('Ziehen: weiterhin kein Feld übernommen', WA.feld.x1===125 && _merges.length===0);
ptr('pointerup',60,10);
ok('Loslassen: Entwurf gesetzt, Feld/Modell/Ergebnis unverändert',
   WA.entwurf.x0===62.5 && WA.entwurf.x1===300 && WA.entwurf.y0===0 && WA.entwurf.y1===150 &&
   WA.feld.x1===125 && _eg.aufbau.feld_cm.x1===125 && WA.compute().pts.length===festPts);

// Hover: anvisierter Rasterpunkt wird betont (ohne dass etwas übernommen wird)
ptr('pointermove',60,140);
ok('Hover: rastet auf den nächsten erlaubten Punkt (62,5 / 150)', WA.hover && WA.hover.x===62.5 && WA.hover.y===150);
ok('Hover: Punkt im SVG betont + beschriftet',
   /class="snaphover"/.test(planEl.innerHTML) && new RegExp(`${f1(62.5)} / ${f1(150)} cm`).test(planEl.innerHTML));
ok('Hover allein übernimmt nichts', WA.feld.x1===125 && _merges.length===0);

// --- #17 MUSS 4: „Übernehmen & berechnen“ ---
applyBtn.dispatch('click');
ok('Übernehmen: Entwurf ist das übernommene Feld',
   WA.feld && WA.feld.x0===62.5 && WA.feld.x1===300 && WA.feld.y0===0 && WA.feld.y1===150);
ok('Übernehmen: in eingaben.aufbau persistiert',
   _eg.aufbau.feld_cm.x0===62.5 && _eg.aufbau.feld_cm.x1===300 &&
   _merges.some(([t,p])=>t==='aufbau' && p.feld_cm && p.feld_cm.x0===62.5));
ok('Übernehmen: Latten + Verbinder folgen dem übernommenen Feld',
   WA.compute().pts.length>0 && WA.compute().pts.every(p=>p.x_cm>=62.49 && p.y_cm<=150.01) &&
   WA.compute().batt.axes.every(a=>a.x_cm>=62.49 && a.segments.every(sg=>sg.y1_cm<=150.01)));
ok('Übernehmen: Modus beendet (Button, Zeichenfläche, Anweisung, Raster, Abschluss-Button)',
   WA.fieldArm===false && WA.entwurf===null && !modeBtn.classList.contains('active') &&
   modeBtn['__aria-pressed']==='false' && /bearbeiten/i.test(modeBtn.textContent) &&
   !planEl.classList.contains('picking') && hintEl.textContent==='' &&
   !/snapdot/.test(planEl.innerHTML) && applyBtn.style.display==='none');
ok('Übernehmen: Feld sichtbar gezeichnet, keine Anfasser mehr',
   /Beplankungsfeld/.test(planEl.innerHTML) && !/drafthandle/.test(planEl.innerHTML));
ok('Übernehmen: Pointer-Capture freigegeben', planEl.capturedPointer===null);

// --- Abbruchwege verwerfen nur den Entwurf ---
modeBtn.dispatch('click');
ptr('pointerdown',0,0); ptr('pointermove',130,160); ptr('pointerup',130,160);
ok('Abbruch-Vorbereitung: Entwurf weicht vom Feld ab', WA.entwurf.x1===125 && WA.feld.x1===300);
_merges=[];
winFire('keydown',{key:'Escape'});
ok('Escape: Entwurf verworfen, Feld + Modell unverändert, Modus beendet',
   WA.entwurf===null && WA.feld.x0===62.5 && WA.feld.x1===300 && _eg.aufbau.feld_cm.x1===300 &&
   _merges.length===0 && WA.fieldArm===false && !/snapdot/.test(planEl.innerHTML) && hintEl.textContent==='');
modeBtn.dispatch('click'); ok('Button: Modus wieder an', WA.fieldArm===true);
ptr('pointerdown',0,0); ptr('pointermove',130,160); ptr('pointerup',130,160);
modeBtn.dispatch('click');
ok('Abbrechen-Button: Entwurf verworfen, Feld unverändert',
   WA.fieldArm===false && WA.entwurf===null && WA.feld.x1===300 && _merges.length===0 &&
   !modeBtn.classList.contains('active') && !/snapdot/.test(planEl.innerHTML));

// --- „ganze Wand“ im Modus betrifft nur den Entwurf (Präzisierung 1) ---
modeBtn.dispatch('click');
_merges=[]; const ganzPts=WA.compute().pts.length;
clearBtn.dispatch('click');
ok('ganze Wand im Modus: nur der Entwurf ist leer, Modus bleibt aktiv',
   WA.entwurf===null && WA.fieldArm===true && planEl.classList.contains('picking'));
ok('ganze Wand im Modus: Feld, Modell und Ergebnis unverändert',
   WA.feld.x1===300 && _merges.length===0 && _eg.aufbau.feld_cm.x1===300 && WA.compute().pts.length===ganzPts);
ok('ganze Wand im Modus: Rasterpunkte sichtbar, Anweisung wieder zum Aufziehen',
   /snapdot/.test(planEl.innerHTML) && /Rasterpunkt/.test(hintEl.textContent));
applyBtn.dispatch('click');
ok('Übernehmen nach „ganze Wand“: Feld gelöscht + persistiert, Modus beendet',
   WA.feld===null && _eg.aufbau.feld_cm===null && WA.compute().layout.feld_cm===null && WA.fieldArm===false);
// außerhalb des Modus bleibt „ganze Wand“ beim bisherigen Verhalten (sofort wirksam)
WA.setFeld(0,125,0,150); _merges=[];
clearBtn.dispatch('click');
ok('ganze Wand außerhalb des Modus: Feld sofort zurückgesetzt + persistiert',
   WA.feld===null && _eg.aufbau.feld_cm===null && _merges.some(([t,p])=>t==='aufbau' && p.feld_cm===null));

// --- Randfälle des Aufziehens (unverändert aus #4) ---
modeBtn.dispatch('click');
ptr('pointerdown',62.5,150); ptr('pointerup',62.5,150);
ok('bloßer Klick: kein Entwurf, Modus bleibt aktiv',
   WA.entwurf===null && WA.fieldArm===true && planEl.classList.contains('picking'));
ptr('pointerdown',0,0); ptr('pointermove',3,3); ptr('pointerup',3,3);
ok('zu kleines Rechteck (5-cm-Regel): kein Entwurf, Modus bleibt aktiv', WA.entwurf===null && WA.fieldArm===true);
// pointercancel verwirft nur das laufende Ziehen
ptr('pointerdown',0,0); ptr('pointermove',130,160);
ok('pointercancel: vorher läuft eine Vorschau', WA.preview!==null);
planEl.dispatch('pointercancel',{pointerId:7});
ok('pointercancel: Vorschau verworfen, Modus bleibt aktiv, kein Entwurf',
   WA.preview===null && WA.fieldArm===true && WA.entwurf===null && planEl.capturedPointer===null);
// Sicherheitsnetz: Loslassen außerhalb der Fläche (window) schließt das Aufziehen genauso ab
_merges=[];
ptr('pointerdown',0,0); ptr('pointermove',130,160); winPtr('pointerup',130,160);
ok('Loslassen außerhalb der Zeichenfläche: Entwurf gesetzt, Modus aktiv, nichts persistiert',
   WA.entwurf && WA.entwurf.x1===125 && WA.entwurf.y1===150 && WA.fieldArm===true &&
   _merges.length===0 && _eg.aufbau.feld_cm==null);
applyBtn.dispatch('click');
ok('Abschluss danach: übernommen, gerechnet, Modus beendet',
   WA.feld.x1===125 && _eg.aufbau.feld_cm.x1===125 && WA.fieldArm===false &&
   WA.compute().pts.every(p=>p.x_cm<=125.01 && p.y_cm<=150.01));

// Konsistenz nach erneutem Laden/Rendern (externer Reload über die Storage-Anbindung)
_aktiv='w-auswahl'; storeMock.aktivesWandelement=()=>W;
_subs.forEach(cb=>cb());
ok('Reload: Feld aus eingaben.aufbau wiederhergestellt', WA.feld && WA.feld.x0===0 && WA.feld.x1===125 && WA.feld.y1===150);
ok('Reload: Feld gezeichnet, kein Bearbeitungsmodus, keine Anfasser',
   /Beplankungsfeld/.test(planEl.innerHTML) && WA.fieldArm===false &&
   !planEl.classList.contains('picking') && !/drafthandle/.test(planEl.innerHTML));

// Abtreppung: es werden weiterhin ALLE nach der Snap-Regel erlaubten Punkte angeboten
// (nur schwächer gezeichnet, wenn sie über der abgetreppten Kontur liegen) — keine neue Filterregel.
WA.applyWand(buildWall('TreppeAuswahl', 3000, 2600, [], {vorne:{funktion:'fassade'}}, null, [{x0_mm:1500,x1_mm:3000,height_mm:1400}]));
modeBtn.dispatch('click');
const trep=planEl.innerHTML;
ok('Abtreppung: unverändert 18 erlaubte Rasterpunkte (keine Filterung)', anzahl(trep,/class="snapdot"/g)===18);
ok('Abtreppung: Punkte über der Kontur bleiben wählbar, nur schwächer gezeichnet',
   /class="snapdot"[^>]*fill-opacity="0.42"/.test(trep) && /class="snapdot"[^>]*fill-opacity="0.85"/.test(trep));
// Feld rechts der Stufe (x 250–300) bis zur vollen Wandhöhe 260 cm — Punkte über der Kontur bleiben wählbar
ptr('pointerdown',250,140); ptr('pointermove',300,255); ptr('pointerup',300,255);
ok('Abtreppung: Bereich über der niedrigen Seite ist auswählbar (Entwurf)',
   WA.entwurf && WA.entwurf.x0===250 && WA.entwurf.x1===300 && WA.entwurf.y0===150 && WA.entwurf.y1===260);
applyBtn.dispatch('click');
ok('Abtreppung: Entwurf übernommen und gerechnet',
   WA.feld && WA.feld.x0===250 && WA.feld.y1===260 && WA.compute().layout.feld_cm.x0===250);
WA.clearFeld(); modeBtn.dispatch('click');
WA.applyWand(W);
ok('Wandwechsel beendet eine laufende Bearbeitung', WA.fieldArm===false && WA.entwurf===null);
_merges=[]; _eg={aufbau:{}};

// Getreppte Wand: rechte Hälfte (x≥150 cm) auf 140 cm abgesenkt
WA.applyWand(buildWall('Treppe', 3000, 2600, [], {vorne:{funktion:'fassade'}}, null, [{x0_mm:1500,x1_mm:3000,height_mm:1400}]));
const S=WA.compute();
ok('Staffelung: keine Verbinder über der niedrigen Seite (x>150 → y≤140)', S.pts.every(p=> p.x_cm<=150.01 ? true : p.y_cm<=140.01));
ok('Staffelung: hohe Seite hat volle Höhe (Punkt y>140 bei x<150)', S.pts.some(p=>p.x_cm<150 && p.y_cm>140));
// [U-11] (Issue #29): An der Stufenkante x=150 ist oberhalb von 140 cm die Wand-Außenkante — dort
// gibt es keine Nut. Die frühere Erwartung "Achse/Latte wird durchgezogen" war der Bug und ist
// bewusst umgekehrt: die Achse endet an der letzten befestigbaren Lage ([U-8]).
ok('Staffelung: kein Verbinder auf der Stufen-Außenkante (x=150, y>140)', !S.pts.some(p=>Math.abs(p.x_cm-150)<0.01 && p.y_cm>140));
ok('Staffelung: Latten rechts der Kante enden ≤ 140 cm', S.batt.axes.filter(a=>a.x_cm>150.01).every(a=>a.segments.every(sg=>sg.y1_cm<=140.01)));
ok('Staffelung: Latte auf Stufenkante endet an der tragenden Geometrie (≤ 140 cm)',
   S.batt.axes.filter(a=>Math.abs(a.x_cm-150)<0.01).every(a=>a.segments.every(sg=>sg.y1_cm<=140.01)));
ok('Staffelung: gestufte Kontur gezeichnet (polygon)', /<polygon/.test(document.getElementById('plan').innerHTML));
WA.applyWand(W);

// Nutenraster (12,5·k) + Klassifikation aus echtem Steinaufbau (courses); Überstand
const Wc=buildWall('mitCourses',2000,2600,[]);
WA.applyWand(Wc);
const N=WA.compute();
ok('Nutenraster vorhanden (12,5-Raster)', N.nutRaster.length>0 && N.nutRaster.every(n=>Math.abs((n.x_cm/12.5)-Math.round(n.x_cm/12.5))<1e-6));
ok('Nut-Status durchgehend + versetzt erkannt', N.nutRaster.some(n=>n.status==='cont') && N.nutRaster.some(n=>n.status==='stagger'));
ok('Verbindertyp aus Nut-Status (C/I)', N.pts.every(p=>p.type==='C'||p.type==='I') && N.pts.some(p=>p.type==='C'));
ok('Nutenraster in Zeichnung + Legende', /durchgehende Nut/.test(document.getElementById('plan').innerHTML));
ok('Steine i2/i3 angedeutet', /#e4e8ed|#d3dae1/.test(document.getElementById('plan').innerHTML) && /i3<\/text>/.test(document.getElementById('plan').innerHTML));
ok('Verbinder sitzen im Stein (auf innenliegender Nut, keine Fuge)', N.xs.every(x=>N.nutRaster.some(n=>Math.abs(n.x_cm-x)<0.01)));
ok('Verbinder auf Steinmitte in der Höhe (10 + 20·m)', N.ys.every(y=>Math.abs(((y-10)%20+20)%20)<0.01));
ok('Verbinderreihen bleiben im Beplankungsfeld (Höhe)', N.ys.every(y=>y>=N.fy0-0.01 && y<=N.fy1+0.01));
ok('Platten volle Wandbreite (Überstand ≤ 12,5 cm je Seite)', N.ohL<=12.5+1e-6 && N.ohR<=12.5+1e-6 && !N.ohWarn);

// Aufbau/Seiten aus Modul 1 übernehmen (Wand W: vorne=Fassade / hinten=Innenausbau), keine Neuauswahl
WA.applyWand(W); document.getElementById('side').value='vorne'; document.getElementById('side').dispatch('change');
ok('Aufbau aus Modul 1: Vorderseite = Fassadenaufbau', WA.compute().layout.seite_funktion==='fassade' && /^FA-/.test(document.getElementById('vtyp').value));
ok('Aufbau als Anzeige (read-only) gesetzt', document.getElementById('aufbau').textContent==='Fassadenaufbau');
document.getElementById('side').value='hinten'; document.getElementById('side').dispatch('change');
ok('Seitenwechsel übernimmt Modul-1-Funktion: Rückseite = Innenausbau', WA.compute().layout.seite==='hinten' && WA.compute().layout.seite_funktion==='innenausbau' && document.getElementById('vtyp').value==='IA-1');
ok('Aufbau-Anzeige folgt Modul-1-Definition (Innenausbau)', document.getElementById('aufbau').textContent==='Innenausbau');
ok('Aufbau nicht neu wählbar (keine option im Aufbau-Element)', !/<option/.test(document.getElementById('aufbau').innerHTML||''));
ok('Seiten-Dropdown aus Modul 1 (Fassadenaufbau + Innenausbau)', /Fassadenaufbau/.test(document.getElementById('side').innerHTML) && /Innenausbau/.test(document.getElementById('side').innerHTML));

// Neues Datenmodell: Aufbau-Eingaben werden ins Modell zurückgeschrieben
WA.applyWand(W);
_merges=[]; _eg={aufbau:{}};
document.getElementById('maxY').value='50'; document.getElementById('maxY').dispatch('input');
ok('Eingabe -> mergeEingaben(aufbau)', _merges.some(([t,p])=>t==='aufbau' && p.achsen && p.achsen.max_y_cm===50));
WA.setFeld(0,125,0,150);
ok('Beplankungsfeld -> ins Modell persistiert', _eg.aufbau.feld_cm && _eg.aufbau.feld_cm.x1===125);
WA.clearFeld();
ok('Feld löschen -> feld_cm null im Modell', _eg.aufbau.feld_cm===null);
document.getElementById('maxY').value='75'; document.getElementById('maxY').dispatch('input');

// Storage-Anbindung: externer Wechsel lädt neues Wandelement UND dessen Aufbau-Eingaben in die UI
const W2=buildWall('Fremdwand', 2500, 2000, []);
_aktiv='w-neu'; storeMock.aktivesWandelement=()=>W2;
_eg={aufbau:{seite:'vorne',panel:{b_cm:125,h_cm:150,off_x_cm:0,off_y_cm:0},achsen:{max_x_cm:62.5,max_y_cm:75,ohang_cm:12.5},verbinder:{typ:'FA-1',Rk:0.5,gM:2,wk:0.8,gQ:1.5},latten:{breite_cm:4,stange_cm:150},feld_cm:{x0:0,x1:125,y0:0,y1:150}}};
_subs.forEach(cb=>cb());   // abonniere-Callback feuern (wie storage._benachrichtige)
ok('externer Wechsel: Modul lädt neues aktives Wandelement', WA.wall && WA.wall.length_mm===2500 && WA.wall.name==='Fremdwand');
ok('externer Wechsel: Aufbau-Eingaben in UI übernommen (pB=125)', +document.getElementById('pB').value===125);
ok('externer Wechsel: Beplankungsfeld aus Modell übernommen', WA.feld && WA.feld.x1===125);

// ---------------------------------------------------------------------------
// Öffnungslaibungen sperren Verbinderachsen (Issue #12).
// An der linken/rechten Türlaibung ist der Stein geschnitten — dort gibt es keinen tragfähigen
// Nutgrund. Mindestabstand ist der bestehende "max. Randüberstand" (12,5 cm), die Achse ist
// global (durchgehende Latten): sie wandert über die ganze Wandhöhe von der Öffnung weg.
// Alle Werte sind fachliche Sollwerte, keine Spiegelung der Implementierung.
function setUI(v){ for(const [id,val] of Object.entries(v)){ const e=document.getElementById(id); e.value=String(val); e.dispatch('input'); } }
const nahe=(a,b)=>Math.abs(a-b)<0.01;

// --- A: Standard-Türfall aus dem Issue (3,75 × 3,00 m, Tür x 75–150 cm, Panel 62,5 × 150) ---
WA.clearFeld();
setUI({pB:62.5,pH:150,oX:0,oY:0,maxX:62.5,maxY:75,ohang:12.5,stock:150});
WA.applyWand(buildWall('Tuerwand', 3750, 3000, [new Opening(6,12,0,10,'tuer')]));
const T=WA.compute();
const distKante=x=>Math.min(Math.abs(x-75),Math.abs(x-150));
ok('A Tür: keine Achse näher als 12,5 cm an einer Laibung (75/150)', T.xs.every(x=>distKante(x)>=12.5-0.01));
ok('A Tür: kein Verbinder näher als 12,5 cm an einer Laibung', T.pts.every(p=>distKante(p.x_cm)>=12.5-0.01));
ok('A Tür: die gemeldeten Fehlpositionen (75|150 cm, y=150/190) existieren nicht mehr',
   !T.pts.some(p=>(nahe(p.x_cm,75)||nahe(p.x_cm,150)) && (nahe(p.y_cm,150)||nahe(p.y_cm,190))));
ok('A Tür: linke Laibung wandert nach links auf 62,5 (nicht nach innen auf 87,5)',
   T.xs.some(x=>nahe(x,62.5)) && !T.xs.some(x=>nahe(x,87.5)));
ok('A Tür: rechte Laibung wandert nach rechts auf 162,5 (nicht nach innen auf 137,5)',
   T.xs.some(x=>nahe(x,162.5)) && !T.xs.some(x=>nahe(x,137.5)));
ok('A Tür: Achsen dedupliziert und streng steigend',
   T.xs.length===new Set(T.xs).size && T.xs.every((x,i)=>i===0||x>T.xs[i-1]+1e-9));
ok('A Tür: Achsen sitzen auf gültigen Nuten (12,5-Raster, durchgehend/versetzt)',
   T.xs.every(x=>T.nutRaster.some(n=>nahe(n.x_cm,x))));
ok('A Tür: max. X-Abstand ≤ 62,5 cm trotz Verschiebung eingehalten',
   T.xs.every((x,i)=>i===0||x-T.xs[i-1]<=62.5+0.01) && T.xGapWarn===false);
ok('A Tür: Randüberstand weiterhin ≤ 12,5 cm', T.ohL<=12.5+1e-6 && T.ohR<=12.5+1e-6 && !T.ohWarn);
ok('A Tür: Verbinder oberhalb der Tür bleiben erhalten (Wand bleibt beplankt)',
   T.pts.some(p=>p.x_cm>75 && p.x_cm<150 && p.y_cm>200) && T.batt.summary.achsen===T.xs.length);
ok('A Tür: Latten weiterhin durchgehend geplant (keine Segmentierung nach Höhe)', T.batt.summary.latten_stuecke>0);

// --- B: Wand ohne Öffnung — unverändert gegenüber dem Stand vor der Laibungsregel ---
// Sollwerte vor der Änderung gemessen und hier eingefroren (echtes Orakel, kein Selbstabgleich).
WA.applyWand(buildWall('Ohnetuer', 3750, 3000, []));
const O=WA.compute();
ok('B ohne Öffnung: X-Achsen unverändert', JSON.stringify(O.xs)===JSON.stringify([12.5,62.5,125,187.5,250,312.5,362.5]));
ok('B ohne Öffnung: Y-Reihen unverändert', JSON.stringify(O.ys)===JSON.stringify([10,70,150,230,290]));
// [U-11] (Issue #29): Achsen/Reihen bleiben unverändert, aber 8 der 35 Rasterpositionen lagen auf
// einer Stoßfuge dieser Lage (x=125 in Lage 3/7/11, x=312,5 in Lage 3/7/11, x=187,5 in Lage 0/14).
// Sie entfallen — gewollte Regelfolge, deshalb neu eingefroren. Zusätzlich gegen w.courses geprüft,
// damit die Zahl nicht bloß die Implementierung spiegelt.
// [U-12] (Issue #30): dazu kommen 2 Endverbinder auf der Achse x=187,5 cm. Dort ist nach [U-11]
// sowohl die unterste (Lage 0) als auch die oberste Lage (Lage 14) eine Stoßfuge; das reale
// Lattensegment endet deshalb erst bei der ersten/letzten zulässigen Lage y=30 bzw. y=270 cm, und
// genau dort muss ein Verbinder sitzen. 27 → 29 ist damit gewollte Regelfolge, kein Drift.
ok('B ohne Öffnung: Verbinderzahl nach [U-11]+[U-12] = 29 (8 Fugenpositionen entfallen, 2 Endverbinder dazu)',
   O.pts.length===29 && O.nutEndZusatz===2);
ok('B ohne Öffnung: die 2 Endverbinder sitzen auf x=187,5 cm bei y=30/270 cm',
   JSON.stringify(O.pts.filter(p=>nahe(p.x_cm,187.5)).map(p=>p.y_cm).sort((a,b)=>a-b))===JSON.stringify([30,70,150,230,270]));
ok('B ohne Öffnung: alle 29 Verbinder liegen strikt im Stein ihrer Lage',
   (()=>{ const Wb=WA.wall, li=y=>Math.round((y-10)/20);
     return O.pts.every(p=>{ const c=Wb.courses.find(c=>c.lage===li(p.y_cm));
       return !!c && c.stones.some(s=>p.x_cm*10>s.x0+1e-6 && p.x_cm*10<s.x1-1e-6); }); })());
// Die 19 Stücke bleiben; durch die 2 zusätzlichen Verbinder wandern die Stöße ([U-8] mittig zwischen
// zwei Verbindern), wodurch der 1D-Zuschnitt eine Stange weniger braucht (15 → 14 / 22,5 → 21,0 m).
ok('B ohne Öffnung: Lattenbilanz nach [U-11]+[U-12] (7 Achsen / 19 Stücke / 14 Stangen / 21,0 m)',
   O.batt.summary.achsen===7 && O.batt.summary.latten_stuecke===19 && O.batt.summary.latten_15m_bedarf===14 && O.batt.summary.gesamtlaenge_m===21);
ok('B ohne Öffnung: keine Warnungen', !O.ohWarn && !O.xGapWarn && O.batt.summary.warnungen===0);

// --- C: geometrisch unlösbar → sicher bleiben und warnen, nicht kaschieren ---
setUI({maxX:20});
// Ohne Öffnung ändert die Laibungsregel nichts — auch nicht bei engem maxX. Dass das 12,5-Raster
// 20 cm nicht exakt trifft (Rest 25 cm), ist bestehendes Verhalten und wird nur jetzt sichtbar.
const X=WA.compute();
ok('C ohne Öffnung: enges maxX liefert unverändert die bisherigen Achsen',
   JSON.stringify(X.xs)===JSON.stringify([12.5,25,50,62.5,75,87.5,112.5,125,137.5,150,175,187.5,200,212.5,237.5,250,262.5,275,300,312.5,325,350,362.5]));
WA.applyWand(buildWall('Tuerwand', 3750, 3000, [new Opening(6,12,0,10,'tuer')]));
const K=WA.compute();
ok('C Konflikt: Sperrzone bleibt auch bei maxX = 20 cm unverletzt', K.xs.every(x=>distKante(x)>=12.5-0.01));
ok('C Konflikt: unerfüllbarer X-Abstand wird gemeldet statt kaschiert', K.xGapWarn===true && K.xGapMax>20+1e-6);
ok('C Konflikt: Warnung ist in der Zeichnung sichtbar', /X-Abstand/.test(document.getElementById('cap').innerHTML));
setUI({maxX:62.5});
// Entartet: schmale Wand, deren gesamtes Nutraster in der Sperrzone liegt → lieber keine Achse als eine unsichere
WA.applyWand(buildWall('Engpass', 375, 1000, [new Opening(1,2,0,5,'durchbruch')]));
const E=WA.compute();
ok('C entartet: keine unsichere Achse als Notlösung', E.xs.length===0 && E.pts.length===0);
ok('C entartet: Zustand wird gemeldet und stürzt nicht ab', E.xGapWarn===true && E.ohL===null && !E.ohWarn && isFinite(E.util));
ok('C entartet: Hinweis in der Zeichnung', /keine zulässige Verbinderachse/.test(document.getElementById('cap').innerHTML));
WA.applyWand(W);

// ---------------------------------------------------------------------------
// [U-11] Verbinder nur auf lagenweise innenliegender Nut (Issue #29, getreppte Wände).
// Orakel ist ausschließlich w.courses aus dem Rechenkern — NICHT nutRaster/nutStatus (dieselbe
// Quelle wie die Implementierung wäre Selbstbestätigung). Autark: nur buildWall, keine Dateien.
function nutPruefung(R, W){
  const lage=y=>Math.round((y-10)/20);
  const res={innen:0, aussen:[], fehlt:[], oberhalb:[]};
  for(const p of R.pts){
    const c=(W.courses||[]).find(c=>c.lage===lage(p.y_cm));
    const xmm=p.x_cm*10;
    if(!c){ res.fehlt.push(p); continue; }
    const innen=c.stones.some(s=>xmm>s.x0+1e-6 && xmm<s.x1-1e-6);
    const kante=c.stones.some(s=>Math.abs(xmm-s.x0)<1e-6 || Math.abs(xmm-s.x1)<1e-6);
    if(innen) res.innen++; else if(kante) res.aussen.push(p); else res.fehlt.push(p);
    // Punkt oberhalb der lokalen Wandoberkante (Staffelung): gar kein Stein in dieser Lage an x
    const lokalTop=(()=>{ let t=W.height_mm/10; for(const st of (W.steps||[])){ const a=st.x0_mm/10,b=st.x1_mm/10; if(p.x_cm>=a-1e-6&&p.x_cm<b-1e-6) t=st.height_mm/10; } return t; })();
    if(p.y_cm>lokalTop+1e-6 && !innen) res.oberhalb.push(p);
  }
  return res;
}
WA.clearFeld();
setUI({pB:62.5,pH:150,oX:0,oY:0,maxX:62.5,maxY:75,ohang:12.5,stock:150});

// --- D1: gemeldeter Fall — eine Stufe, rechte Hälfte ab x=150 cm auf 140 cm ---
const D1W=buildWall('U11-1Stufe', 3000, 2600, [], {vorne:{funktion:'fassade'}}, null, [{x0_mm:1500,x1_mm:3000,height_mm:1400}]);
WA.applyWand(D1W); const D1=WA.compute(); const P1=nutPruefung(D1,D1W);
ok('D1 [U-11]: jeder Verbinder liegt strikt innerhalb eines Steins dieser Lage',
   D1.pts.length>0 && P1.innen===D1.pts.length && P1.aussen.length===0 && P1.fehlt.length===0);
ok('D1 [U-11]: kein Verbinder auf einer Steinkante x0/x1', P1.aussen.length===0);
ok('D1 [U-11]: der gemeldete Fehlerfall (x=150 cm oberhalb 140 cm) existiert nicht',
   !D1.pts.some(p=>Math.abs(p.x_cm-150)<0.01 && p.y_cm>140.01));
ok('D1 [U-11]: kein Verbinder oberhalb der lokalen Wandoberkante', P1.oberhalb.length===0);
ok('D1 [U-11]: Achse auf der Stufenkante ist vorhanden, aber nur bis zur tragenden Lage',
   D1.xs.some(x=>nahe(x,150)) && D1.pts.filter(p=>nahe(p.x_cm,150)).every(p=>p.y_cm<=140.01));
ok('D1 [U-11]: Latten enden an der letzten tragbaren Lage (keine Latte in der Luft)',
   D1.batt.axes.every(a=>a.segments.every(sg=>sg.y1_cm<=D1.axisTop(a.x_cm)+1e-6)));
ok('D1 [U-11]: Ausdünnung wird sichtbar gemeldet', D1.nutWarn===true && D1.nutBlocked>0 && D1.nutThinAxes.length>0);
ok('D1 [U-11]: Warnung steht in der Bildunterschrift', /ohne innenliegende Nut/.test(document.getElementById('cap').innerHTML));
ok('D1 [U-11]: Einheiten/Raster unverändert (x auf 12,5·k, y auf 10+20·k)',
   D1.pts.every(p=>Math.abs(p.x_cm/12.5-Math.round(p.x_cm/12.5))<1e-6 && Math.abs(((p.y_cm-10)%20+20)%20)<0.01));

// --- D2: mehrstufige Kontur mit unterschiedlichen Höhen entlang der Wand ---
const D2W=buildWall('U11-mehrstufig', 3000, 2600, [], {vorne:{funktion:'fassade'}}, null,
  [{x0_mm:1250,x1_mm:2000,height_mm:1000},{x0_mm:2000,x1_mm:3000,height_mm:1800}]);
WA.applyWand(D2W); const D2=WA.compute(); const P2=nutPruefung(D2,D2W);
ok('D2 [U-11]: mehrstufig — jeder Verbinder strikt innerhalb eines Steins dieser Lage',
   D2.pts.length>0 && P2.innen===D2.pts.length && P2.aussen.length===0 && P2.fehlt.length===0);
ok('D2 [U-11]: mehrstufig — kein Verbinder auf einer Steinkante', P2.aussen.length===0);
ok('D2 [U-11]: mehrstufig — kein Verbinder oberhalb der jeweiligen lokalen Oberkante',
   P2.oberhalb.length===0 &&
   D2.pts.every(p=>p.y_cm <= (p.x_cm<125?260 : p.x_cm<200?100 : 180)+0.01));
ok('D2 [U-11]: mehrstufig — Latten bleiben unter der tragenden Geometrie',
   D2.batt.axes.every(a=>a.segments.every(sg=>sg.y1_cm<=D2.axisTop(a.x_cm)+1e-6)));
ok('D2 [U-11]: mehrstufig — Achse ohne befestigbare Lage wird gemeldet, nicht ersetzt',
   D2.nutWarn===true && D2.nutLeerAchsen.every(x=>!D2.pts.some(p=>nahe(p.x_cm,x))));

// --- D3: Öffnung + Staffelung gemeinsam (Laibungsregel [U-10] bleibt gültig) ---
const D3W=buildWall('U11-Tuer+Stufe', 3750, 3000, [new Opening(6,12,0,10,'tuer')], {vorne:{funktion:'fassade'}}, null, [{x0_mm:2500,x1_mm:3750,height_mm:1600}]);
WA.applyWand(D3W); const D3=WA.compute(); const P3=nutPruefung(D3,D3W);
ok('D3 [U-11]: Öffnung + Staffelung — alle Verbinder auf gültiger Nut',
   D3.pts.length>0 && P3.innen===D3.pts.length && P3.aussen.length===0 && P3.fehlt.length===0);
ok('D3 [U-11]: Laibungs-Sperrzone ([U-10]) bleibt eingehalten',
   D3.pts.every(p=>Math.min(Math.abs(p.x_cm-75),Math.abs(p.x_cm-150))>=12.5-0.01));
ok('D3 [U-11]: kein Verbinder in der Öffnung', !D3.pts.some(p=>p.x_cm>75.01&&p.x_cm<149.99&&p.y_cm>0.01&&p.y_cm<199.99));

// --- D4: fehlende Lagengeometrie → sicherer Leerfall mit sichtbarer Warnung (kein Fallback) ---
const D4W={...buildWall('U11-ohneCourses', 3000, 2600, []), courses:[]};
WA.applyWand(D4W); const D4=WA.compute();
ok('D4 [U-11]: ohne Lagengeometrie entstehen keine Verbinder (sicher statt unsicher)', D4.pts.length===0);
ok('D4 [U-11]: ohne Lagengeometrie keine Latten geplant', D4.batt.summary.latten_stuecke===0);
ok('D4 [U-11]: Zustand wird gemeldet und stürzt nicht ab', D4.nutGeoWarn===true && D4.nutWarn===true && isFinite(D4.util));
ok('D4 [U-11]: Hinweis in der Zeichnung', /keine Lagengeometrie/.test(document.getElementById('cap').innerHTML));

// ================= E: [U-12] Endverbinder je realem Lattensegment (Issue #30) =================
// Fachlicher Regressionstest auf ECHTEN Lattensegmenten: die Segmente werden hier unabhaengig von
// sembla-aufbau.js nachgebildet (Oeffnungen + Feldgrenzen + Lagengeometrie aus w.courses) und die
// erste/letzte nach [U-11] zulaessige Lage selbst bestimmt. Geprueft wird, dass genau dort ein
// Verbinder sitzt — kein Vergleich von Summen und kein Blick in Helper-Interna.
// Scope-Grenze ([U-12.1]): geprueft wird die Segmentebene. Fuer die Einzelstuecke eines Segments
// bleibt [U-8] zustaendig (Stoss mittig zwischen zwei Verbindern); das wird nur als Erbe geprueft.
WA.clearFeld();
const nutInnenT=(Wx,x,y)=>{ const c=(Wx.courses||[]).find(c=>c.lage===Math.round((y-10)/20));
  return !!c && (c.stones||[]).some(s=>x*10>s.x0+1e-6 && x*10<s.x1-1e-6); };
const nutTopT=(Wx,x)=>{ let t=0; for(const c of (Wx.courses||[]))
  if((c.stones||[]).some(s=>x*10>s.x0+1e-6 && x*10<s.x1-1e-6)) t=Math.max(t,(c.lage+1)*20); return t; };
// Reale Segmente je Achse: an Oeffnungen getrennt, auf Feld und tragende Geometrie geclippt.
function realeSegmenteT(R,Wx){
  const ops=(Wx.openings||[]).map(o=>({x0:o.g0*12.5,x1:o.g1*12.5,y0:o.l0*20,y1:o.l1*20}));
  const out=[];
  for(const x of R.xs){
    const oben=Math.min(R.fy1, nutTopT(Wx,x));
    const blocks=ops.filter(o=>x>o.x0+1e-6 && x<o.x1-1e-6).map(o=>[o.y0,o.y1]).sort((p,q)=>p[0]-q[0]);
    const iv=[]; let cur=0;
    for(const [s,e] of blocks){ if(s>cur+1e-6) iv.push([cur,s]); cur=Math.max(cur,e); }
    if(R.H-cur>1e-6) iv.push([cur,R.H]);
    for(const [S0,E0] of iv){ const S=Math.max(S0,R.fy0), E=Math.min(E0,oben); if(E-S<=1e-6) continue;
      const cand=[]; for(let m=0;;m++){ const y=m*20+10; if(y>=E-1e-6) break; if(y>S+1e-6 && nutInnenT(Wx,x,y)) cand.push(y); }
      out.push({x,S,E,cand}); } }
  return out;
}
// Prueft je Segment: Verbinder auf erster UND letzter zulaessiger Lage; Leerfall ohne Ersatzpunkt
// und ohne geplante Latte; zusaetzlich, dass jedes Zuschnittstueck einen Verbinder erbt ([U-8]).
function endPruefungT(R,Wx){
  const res={segmente:0, fehlend:[], leer:[], leerBeplankt:[], ersatzpunkt:[], stueckOhne:[]};
  for(const sg of realeSegmenteT(R,Wx)){
    const ys=R.pts.filter(p=>nahe(p.x_cm,sg.x)).map(p=>p.y_cm);
    const ax=R.batt.axes.find(a=>nahe(a.x_cm,sg.x));
    const stuecke=(ax?ax.segments:[]).filter(s=>s.y0_cm>=sg.S-0.01 && s.y1_cm<=sg.E+0.01);
    if(!sg.cand.length){
      res.leer.push(sg);
      if(stuecke.length) res.leerBeplankt.push(sg);                                  // darf nicht sein
      if(ys.some(y=>y>sg.S+1e-6 && y<sg.E-1e-6)) res.ersatzpunkt.push(sg);           // darf nicht sein
      continue; }
    res.segmente++;
    const u=sg.cand[0], o=sg.cand[sg.cand.length-1];
    if(!ys.some(y=>nahe(y,u)) || !ys.some(y=>nahe(y,o))) res.fehlend.push({x:sg.x,S:sg.S,E:sg.E,u,o,ys});
    for(const st of stuecke) if(!ys.some(y=>y>st.y0_cm+1e-6 && y<st.y1_cm-1e-6)) res.stueckOhne.push({x:sg.x,st});
  }
  return res;
}
// --- E1: der gemeldete Fall — Tuer 75–150 cm bis 200 cm Hoehe, Wand 3,75 × 2,60 m ---
// Die Latte auf x=125 cm laeuft ueber der Tuer weiter: reales Segment [200, 260] cm. Vor dem Fix
// gab es dort NUR y=250 (oberes Ende); das untere Ende blieb unbefestigt, weil das Raster vom
// Wandfuss in der ausgesparten Tuer aus gebildet wurde.
setUI({pB:62.5,pH:150,oX:0,oY:0,maxX:62.5,maxY:75,ohang:12.5,stock:150});
const E1W=buildWall('U12-Tuer', 3750, 2600, [new Opening(6,12,0,10,'tuer')]);
WA.applyWand(E1W); const E1=WA.compute();
const E1ax=E1.batt.axes.find(a=>nahe(a.x_cm,125));
const E1y=E1.pts.filter(p=>nahe(p.x_cm,125)).map(p=>p.y_cm).sort((a,b)=>a-b);
ok('E1 [U-12]: die Latte ueber der Tuer ist ein reales Segment [200, 260] cm',
   !!E1ax && E1ax.segments.length===1 && nahe(E1ax.segments[0].y0_cm,200) && nahe(E1ax.segments[0].y1_cm,260));
ok('E1 [U-12]: dieses Segment hat unten UND oben einen Verbinder (y=210 und y=250)',
   JSON.stringify(E1y)===JSON.stringify([210,250]));
ok('E1 [U-12]: y=210 ist die erste, y=250 die letzte im Segment zulaessige Lage',
   nutInnenT(E1W,125,210) && nutInnenT(E1W,125,250) && !nutInnenT(E1W,125,190) && nutTopT(E1W,125)===260);
ok('E1 [U-12]: der untere Endverbinder liegt auf der Tuer-Oberkante, nicht am Wandfuss',
   !E1.pts.some(p=>nahe(p.x_cm,125) && p.y_cm<200) && E1.ys.some(y=>y<200));
ok('E1 [U-12]: kein Verbinder in der Tueroeffnung',
   !E1.pts.some(p=>p.x_cm>75.01 && p.x_cm<149.99 && p.y_cm>0.01 && p.y_cm<199.99));
ok('E1 [U-12]: Zusatzpunkte sind additiv — alle globalen Rasterpunkte bleiben erhalten',
   E1.nutEndZusatz===3 && E1.ys.filter(y=>nutInnenT(E1W,125,y) && y>200).every(y=>E1y.some(v=>nahe(v,y))));
ok('E1 [U-12]: jeder Endverbinder liegt strikt im Stein seiner Lage ([U-11] hat Vorrang)',
   (()=>{ const P=nutPruefung(E1,E1W); return P.innen===E1.pts.length && P.aussen.length===0 && P.fehlt.length===0; })());
ok('E1 [U-12]: Anzahl der Endverbinder steht in der Bildunterschrift',
   /Endverbinder an Lattenenden/.test(document.getElementById('cap').innerHTML));

// --- E2: strukturell ueber alle realen Segmente mehrerer Wandformen (Tuer, Fenster, Staffelung) ---
const E2F=[
  ['Tuer 3,75 × 3,00 m', buildWall('U12-a', 3750, 3000, [new Opening(6,12,0,10,'tuer')])],
  ['ohne Oeffnung 3,75 × 3,00 m', buildWall('U12-b', 3750, 3000, [])],
  ['Fenster mittig', buildWall('U12-c', 3750, 3000, [new Opening(8,14,4,9,'fenster')])],
  ['Tuer + Fenster', buildWall('U12-d', 5000, 3000, [new Opening(4,10,0,10,'tuer'), new Opening(20,26,4,9,'fenster')])],
  ['Tuer + Staffelung', buildWall('U12-e', 3750, 3000, [new Opening(6,12,0,10,'tuer')], {vorne:{funktion:'fassade'}}, null, [{x0_mm:2500,x1_mm:3750,height_mm:1600}])],
  ['mehrstufig', buildWall('U12-f', 3000, 2600, [], {vorne:{funktion:'fassade'}}, null, [{x0_mm:1250,x1_mm:2000,height_mm:1000},{x0_mm:2000,x1_mm:3000,height_mm:1800}])],
];
for(const [name, Wx] of E2F){
  WA.applyWand(Wx); const R=WA.compute(); const P=endPruefungT(R,Wx);
  ok(`E2 [U-12] ${name}: jedes reale Segment hat Endverbinder unten und oben (${P.segmente} Segmente)`,
     P.segmente>0 && P.fehlend.length===0);
  ok(`E2 [U-12] ${name}: kein Endverbinder auf Fuge/Kante/steinfrei ([U-11])`,
     (()=>{ const Q=nutPruefung(R,Wx); return R.pts.length>0 && Q.innen===R.pts.length && Q.aussen.length===0 && Q.fehlt.length===0 && Q.oberhalb.length===0; })());
  ok(`E2 [U-12] ${name}: jedes Zuschnittstueck erbt einen Verbinder ([U-8]/[U-12.1])`, P.stueckOhne.length===0);
}
// --- E3: kurzes Segment mit genau einer zulaessigen Lage — ein Verbinder erfuellt beide Enden ---
// Fenster bis 180 cm, Wand 200 cm: ueber dem Fenster bleibt genau die Lage 9 (Mitte 190 cm).
const E3W=buildWall('U12-kurz', 2500, 2000, [new Opening(4,10,0,9,'fenster')]);
WA.applyWand(E3W); const E3=WA.compute(); const P3E=endPruefungT(E3,E3W);
const E3seg=realeSegmenteT(E3,E3W).filter(s=>s.S>179.99);
ok('E3 [U-12]: kurzes Segment ueber der Oeffnung hat genau eine zulaessige Lage',
   E3seg.length>0 && E3seg.every(s=>s.cand.length===1 && nahe(s.cand[0],190)));
ok('E3 [U-12]: dieser eine Verbinder erfuellt beide Enden (kein zweiter Punkt erzwungen)',
   P3E.fehlend.length===0 && E3seg.every(s=>E3.pts.filter(p=>nahe(p.x_cm,s.x) && p.y_cm>s.S+1e-6 && p.y_cm<s.E-1e-6).length===1));

// --- E4: Segment ohne jede zulaessige Lage — sicherer Leerfall, kein Ersatzpunkt, keine Latte ---
// Feldunterkante 212,5 cm liegt in der letzten befestigbaren Lage (Wand 220 cm): im Feld [212,5; 220]
// gibt es keine Steinmitte. [U-11] verbietet einen Ersatzpunkt, also wird nicht beplankt + gewarnt.
const E4W=buildWall('U12-leer', 2500, 2200, []);
WA.applyWand(E4W); WA.setFeld(0, 250, 212.5, 220); const E4=WA.compute(); const P4E=endPruefungT(E4,E4W);
ok('E4 [U-12]: Segment ohne befestigbare Lage wird als Leerfall gemeldet',
   E4.nutEndLeerSegmente.length>0 && E4.nutEndLeerSegmente.every(s=>nahe(s.y0_cm,212.5) && nahe(s.y1_cm,220)) && E4.nutWarn===true);
ok('E4 [U-12]: es wird keine Latte darauf geplant und kein Ersatzpunkt gesetzt',
   E4.batt.summary.latten_stuecke===0 && P4E.leerBeplankt.length===0 && P4E.ersatzpunkt.length===0);
ok('E4 [U-12]: der Leerfall steht in der Bildunterschrift',
   /ohne befestigbare Lage nicht beplankt/.test(document.getElementById('cap').innerHTML));
ok('E4 [U-12]: keine unzulaessigen Punkte trotz Leerfall ([U-11] bleibt gewahrt)',
   (()=>{ const Q=nutPruefung(E4,E4W); return Q.aussen.length===0 && Q.fehlt.length===0; })());
WA.clearFeld();
WA.applyWand(W);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
