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
// Ohne Wandelement gibt es keine Fläche zum Aufziehen: Auswahl gesperrt, Klick bleibt wirkungslos.
ok('ohne aktives Element -> Auswahlbutton gesperrt', document.getElementById('fieldMode').disabled===true);
document.getElementById('fieldMode').dispatch('click');
ok('ohne aktives Element -> Klick aktiviert keinen Auswahlmodus',
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
// Auswahlmodus für das Beplankungsfeld (Issue #4): echter Bedienweg über Button + Pointer-Events.
// Geprüft werden die sichtbaren DOM/SVG-Zustände, nicht nur die Test-API.
const planEl=document.getElementById('plan'), modeBtn=document.getElementById('fieldMode'), hintEl=document.getElementById('fieldHint');
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

WA.applyWand(W); WA.clearFeld();          // Wand 300 × 260 cm, Panel 62,5 × 150 -> gx=[0;62,5;125;187,5;250;300], gy=[0;150;260]
_merges=[]; _eg={aufbau:{}};
ok('vor Aktivierung: kein Auswahlmodus (kein Raster, keine Anweisung)',
   WA.fieldArm===false && !planEl.classList.contains('picking') && !/snapdot/.test(planEl.innerHTML) && hintEl.textContent==='');
modeBtn.dispatch('click');
ok('Aktivierung: Modus an, Button zeigt aktiven Zustand + Ausstieg',
   WA.fieldArm===true && modeBtn.classList.contains('active') &&
   modeBtn['__aria-pressed']==='true' && /beenden/i.test(modeBtn.textContent));
ok('Aktivierung: Zeichenfläche markiert (picking)', planEl.classList.contains('picking'));
ok('Aktivierung: kurze Bedienerklärung sichtbar (Leiste + Banner in der Zeichnung)',
   /Rasterpunkt/.test(hintEl.textContent) && hintEl.style.display==='' && /pickbanner/.test(planEl.innerHTML) && /Rasterpunkt/.test(planEl.innerHTML));
ok('Aktivierung: alle erlaubten Rasterpunkte gezeichnet (6 × 3 = 18)', anzahl(planEl.innerHTML,/class="snapdot"/g)===18);

// Hover: anvisierter Rasterpunkt wird betont (ohne dass etwas ausgewählt wird)
ptr('pointermove',60,140);
ok('Hover: rastet auf den nächsten erlaubten Punkt (62,5 / 150)', WA.hover && WA.hover.x===62.5 && WA.hover.y===150);
ok('Hover: Punkt im SVG betont + beschriftet',
   /class="snaphover"/.test(planEl.innerHTML) && new RegExp(`${f1(62.5)} / ${f1(150)} cm`).test(planEl.innerHTML));
ok('Hover allein wählt nichts aus', WA.feld===null && WA.preview===null);

// Ziehen: Pointer-Capture, keine Textmarkierung, live gesnappte Vorschau
const down=ptr('pointerdown',5,5);
ok('Ziehen: Textauswahl unterbunden (preventDefault) + Pointer-Capture auf der Zeichenfläche',
   down.prevented===true && planEl.capturedPointer===7);
ptr('pointermove',130,160);
ok('Ziehen: Vorschau rastet live auf erlaubte Rasterpositionen (0/0 -> 125/150)',
   WA.preview && WA.preview.x0===0 && WA.preview.y0===0 && WA.preview.x1===125 && WA.preview.y1===150);
ok('Ziehen: Vorschau-Rechteck im SVG sichtbar (mit Maß)',
   /class="fieldpreview"/.test(planEl.innerHTML) && new RegExp(`${f1(125)} × ${f1(150)} cm`).test(planEl.innerHTML));
ok('Ziehen: noch kein Feld übernommen', WA.feld===null && _eg.aufbau.feld_cm==null);
const vorschauTag=(planEl.innerHTML.match(/<rect class="fieldpreview"[^>]*>/)||[''])[0];
ok('Ziehen: Vorschau ist neutral/grün, kein rotes Ungültig-Modell',
   /#1f9d55/.test(vorschauTag) && !/#c9461c/.test(vorschauTag));
ptr('pointerup',130,160);
ok('Commit: Feld gesetzt auf gesnappte Werte', WA.feld && WA.feld.x0===0 && WA.feld.x1===125 && WA.feld.y0===0 && WA.feld.y1===150);
ok('Commit: in eingaben.aufbau übernommen', _eg.aufbau.feld_cm && _eg.aufbau.feld_cm.x1===125 && _eg.aufbau.feld_cm.y1===150 &&
   _merges.some(([t,p])=>t==='aufbau' && p.feld_cm && p.feld_cm.x1===125));
ok('Commit: Rechnung folgt dem Feld', WA.compute().pts.every(p=>p.x_cm<=125.01 && p.y_cm<=150.01));
ok('Commit: Modus beendet (Button, Zeichenfläche, Anweisung zurückgesetzt)',
   WA.fieldArm===false && !modeBtn.classList.contains('active') && modeBtn['__aria-pressed']==='false' &&
   !planEl.classList.contains('picking') && hintEl.textContent==='' && !/snapdot/.test(planEl.innerHTML));
ok('Commit: Pointer-Capture freigegeben', planEl.capturedPointer===null);
ok('Commit: Feld sichtbar gezeichnet', /Beplankungsfeld/.test(planEl.innerHTML));

// Konsistenz nach erneutem Laden/Rendern (externer Reload über die Storage-Anbindung)
_aktiv='w-auswahl'; storeMock.aktivesWandelement=()=>W;
_subs.forEach(cb=>cb());
ok('Reload: Feld aus eingaben.aufbau wiederhergestellt', WA.feld && WA.feld.x0===0 && WA.feld.x1===125 && WA.feld.y1===150);
ok('Reload: Feld wieder gezeichnet, kein Auswahlmodus aktiv',
   /Beplankungsfeld/.test(planEl.innerHTML) && WA.fieldArm===false && !planEl.classList.contains('picking'));

// Bestehendes Knob-Resizing über den echten Pointer-Weg (Anfasser rechts oben: 125/150)
_merges=[];
ptr('pointerdown',125,150);
ptr('pointermove',190,260);
ok('Knob-Resize: rastet auf erlaubte Rasterposition (187,5 / 260)', Math.abs(WA.feld.x1-187.5)<0.01 && Math.abs(WA.feld.y1-260)<0.01);
ptr('pointerup',190,260);
ok('Knob-Resize: Ergebnis persistiert', _eg.aufbau.feld_cm.x1===187.5 && _merges.some(([t,p])=>t==='aufbau' && p.feld_cm && p.feld_cm.x1===187.5));
// Verschieben eines bestehenden Feldes (Griff in der Fläche)
ptr('pointerdown',90,60);
ptr('pointermove',152.5,60);
ok('Feld verschieben: rastet und behält die Größe', Math.abs(WA.feld.x0-62.5)<0.01 && Math.abs(WA.feld.x1-250)<0.01);
ptr('pointerup',152.5,60);
ok('Feld verschieben: Ergebnis persistiert', _eg.aufbau.feld_cm.x0===62.5);
WA.clearFeld();

// Bloßer Klick darf den Modus nicht beenden
modeBtn.dispatch('click');
ptr('pointerdown',62.5,150); ptr('pointerup',62.5,150);
ok('bloßer Klick: kein Feld, Modus bleibt aktiv', WA.feld===null && WA.fieldArm===true && planEl.classList.contains('picking'));
// Zu kleines Feld (5-cm-Regel in setFeld, unverändert) beendet den Modus ebenfalls nicht
ptr('pointerdown',0,0); ptr('pointermove',3,3); ptr('pointerup',3,3);
ok('zu kleines Feld: nicht übernommen, Modus bleibt aktiv', WA.feld===null && WA.fieldArm===true);
// pointercancel verwirft nur das laufende Ziehen
ptr('pointerdown',0,0); ptr('pointermove',130,160);
ok('pointercancel: vorher läuft eine Vorschau', WA.preview!==null);
planEl.dispatch('pointercancel',{pointerId:7});
ok('pointercancel: Vorschau verworfen, Modus bleibt aktiv, kein Feld',
   WA.preview===null && WA.fieldArm===true && WA.feld===null && planEl.capturedPointer===null);
// Sicherheitsnetz: Loslassen außerhalb der Fläche (window) schließt die Auswahl genauso ab
ptr('pointerdown',0,0); ptr('pointermove',130,160); winPtr('pointerup',130,160);
ok('Loslassen außerhalb der Zeichenfläche: Feld übernommen, Modus beendet',
   WA.feld && WA.feld.x1===125 && WA.feld.y1===150 && WA.fieldArm===false && _eg.aufbau.feld_cm.x1===125);
WA.clearFeld(); modeBtn.dispatch('click');
// Escape beendet den Modus
winFire('keydown',{key:'Escape'});
ok('Escape: Modus beendet (Raster + Anweisung weg)',
   WA.fieldArm===false && !planEl.classList.contains('picking') && hintEl.textContent==='' && !/snapdot/.test(planEl.innerHTML));
// Button beendet den Modus ebenfalls
modeBtn.dispatch('click'); ok('Button: Modus wieder an', WA.fieldArm===true);
modeBtn.dispatch('click');
ok('Button: Modus explizit beendet', WA.fieldArm===false && !modeBtn.classList.contains('active') && !/snapdot/.test(planEl.innerHTML));
// „ganze Wand“ verändert den Modus nicht (kein unbeabsichtigter Zustandswechsel)
modeBtn.dispatch('click'); document.getElementById('fieldClear').dispatch('click');
ok('ganze Wand: Feld zurückgesetzt, Modus unverändert aktiv', WA.feld===null && WA.fieldArm===true);
modeBtn.dispatch('click');

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
ok('Abtreppung: Feld über der niedrigen Seite ist auswählbar',
   WA.feld && WA.feld.x0===250 && WA.feld.x1===300 && WA.feld.y0===150 && WA.feld.y1===260);
WA.clearFeld(); WA.applyWand(W);
ok('Wandwechsel beendet einen laufenden Auswahlmodus', WA.fieldArm===false);
_merges=[]; _eg={aufbau:{}};

// Getreppte Wand: rechte Hälfte (x≥150 cm) auf 140 cm abgesenkt
WA.applyWand(buildWall('Treppe', 3000, 2600, [], {vorne:{funktion:'fassade'}}, null, [{x0_mm:1500,x1_mm:3000,height_mm:1400}]));
const S=WA.compute();
ok('Staffelung: keine Verbinder über der niedrigen Seite (x>150 → y≤140)', S.pts.every(p=> p.x_cm<=150.01 ? true : p.y_cm<=140.01));
ok('Staffelung: hohe Seite hat volle Höhe (Punkt y>140 bei x<150)', S.pts.some(p=>p.x_cm<150 && p.y_cm>140));
ok('Staffelung: Stufenkanten-Achse wird durchgezogen (Punkt bei x=150, y>140)', S.pts.some(p=>Math.abs(p.x_cm-150)<0.01 && p.y_cm>140));
ok('Staffelung: Latten rechts der Kante enden ≤ 140 cm', S.batt.axes.filter(a=>a.x_cm>150.01).every(a=>a.segments.every(sg=>sg.y1_cm<=140.01)));
ok('Staffelung: Latte auf Stufenkante läuft über 140 hinaus (durchgezogen)', S.batt.axes.some(a=>Math.abs(a.x_cm-150)<0.01 && a.segments.some(sg=>sg.y1_cm>140.01)));
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
ok('B ohne Öffnung: Verbinderzahl unverändert (35)', O.pts.length===35);
ok('B ohne Öffnung: Lattenbilanz unverändert (7 Achsen / 21 Stücke / 14 Stangen / 21,0 m)',
   O.batt.summary.achsen===7 && O.batt.summary.latten_stuecke===21 && O.batt.summary.latten_15m_bedarf===14 && O.batt.summary.gesamtlaenge_m===21);
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

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
