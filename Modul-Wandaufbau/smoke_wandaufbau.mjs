import { readFileSync } from "node:fs";
import { buildWall } from "../Phase-2/sembla-core.mjs";
const html = readFileSync("./SEMBLA_Wandaufbau.html","utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.files=[];this.checked=true;this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(k,v){this['__'+k]=v;} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(){return new El('x');} querySelectorAll(){return [];} appendChild(){} click(){}}
const dv={pB:'62.5',pH:'150',oX:'0',oY:'0',maxX:'62.5',maxY:'75',inset:'6.25',vtyp:'FA-1',Rk:'0.5',gM:'2.0',wk:'0.8',gQ:'1.5',lw:'4',stock:'150',ith:'8',side:'vorne'};
const _e={}; const document={getElementById:id=>{let e=_e[id];if(!e){e=_e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},createElement:()=>new El('a')};
globalThis.document=document; globalThis.window={addEventListener:()=>{}}; globalThis.alert=m=>{globalThis.__alert=m;};
globalThis.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}}; globalThis.Blob=class{constructor(){}};
globalThis.FileReader=class{readAsText(){}};

eval(script);
const WA=globalThis.window.__wandaufbau;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// Wand mit Tür laden (3,00 × 2,60 m)
const W={ name:'Testwand', length_mm:3000, height_mm:2600, grid_mm:125, course_mm:200, thickness_mm:125,
  openings:[{g0:4,g1:8,l0:0,l1:10,art:'tuer'}], sides:{vorne:{funktion:'fassade'},hinten:{funktion:'innenausbau'}} };
WA.applyWand(W);
const R=WA.compute();

ok('Achsen berechnet (X,Y > 0)', R.xs.length>0 && R.ys.length>0);
// Panelfugen = Achsen: 62,5 / 125 / 187,5 / 250 cm müssen unter den X-Achsen sein
const hasX=v=>R.xs.some(x=>Math.abs(x-v)<0.01);
ok('X-Achsen an Panelfugen (62,5 / 125 / 187,5 / 250)', hasX(62.5)&&hasX(125)&&hasX(187.5)&&hasX(250));
// Panelhöhe 150 -> Y-Achse bei 150
ok('Y-Achse an Panelfuge (150 cm)', R.ys.some(y=>Math.abs(y-150)<0.01));
// Randachsen
ok('Randachsen auf erster/letzter Nut (12,5 und B-12,5)', hasX(12.5)&&hasX(287.5));
// keine Verbinder innerhalb der Tür (x 50..100, y 0..200)
ok('keine Verbinder in der Türöffnung', !R.pts.some(p=>p.x_cm>50.01&&p.x_cm<99.99&&p.y_cm>0.01&&p.y_cm<199.99));
// Layout-Format kompatibel
ok('Layout-Format SEMBLA-VerbinderLayout', R.layout.format==='SEMBLA-VerbinderLayout' && R.layout.wall.B_cm===300 && R.layout.panel.b_cm===62.5);
ok('Layout enthält Öffnung + Punkte', R.layout.openings_cm.length===1 && R.layout.points.length===R.pts.length);
// Latten aus Layout
ok('Latten geplant (Achsen + Stücke)', R.batt.summary.achsen>0 && R.batt.summary.latten_stuecke>0);
ok('Dämmung berechnet (Fläche > 0)', R.batt.daemmung && R.batt.daemmung.total.flaeche_m2>0);
// Nachweis
ok('Auslastung berechnet (0..∞) + Flag', isFinite(R.util) && (R.ok===true||R.ok===false));
// max. Abstand eingehalten (X)
const sortedX=[...R.xs].sort((a,b)=>a-b); let gapOk=true; for(let i=1;i<sortedX.length;i++) if(sortedX[i]-sortedX[i-1]>62.5+0.01) gapOk=false;
ok('max. X-Abstand ≤ 62,5 cm eingehalten', gapOk);
// Zeichnung
const plan=document.getElementById('plan').innerHTML;
ok('Zeichnung: Panelraster + Verbinder + Latten', /stroke-dasharray/.test(plan) && /circle/.test(plan) && /#8a5a2b/.test(plan));
// Seitenwechsel
document.getElementById('side').value='hinten'; document.getElementById('side').dispatch('change');
ok('Seitenwechsel -> hinten', WA.side==='hinten' && WA.compute().layout.seite==='hinten');
// Panelbreite ändern wirkt
document.getElementById('side').value='vorne'; document.getElementById('side').dispatch('change');
document.getElementById('pB').value='125'; document.getElementById('pB').dispatch('input');
ok('größere Panelbreite -> weniger/gleich X-Achsen', WA.compute().xs.length<=R.xs.length);

// Feature: Beplankungsfeld – nur ein Teil der Wand
const full=WA.compute();
WA.setFeld(0,125,0,150);   // linkes unteres Feld 125 × 150 cm
const F=WA.compute();
ok('Feld gesetzt (feld_cm im Layout)', F.layout.feld_cm && F.layout.feld_cm.x1===125 && F.layout.feld_cm.y1===150);
ok('alle Verbinder innerhalb des Feldes', F.pts.every(p=>p.x_cm<=125.01 && p.y_cm<=150.01 && p.x_cm>=-0.01 && p.y_cm>=-0.01));
ok('weniger Verbinder als bei ganzer Wand', F.pts.length < full.pts.length && F.pts.length>0);
ok('Latten nur im Feld (y ≤ 150)', F.batt.axes.every(a=>a.segments.every(sg=>sg.y1_cm<=150.01)) && F.batt.axes.every(a=>a.x_cm<=125.01));
ok('Dämmung nur im Feld (kleiner als ganze Wand)', !full.batt.daemmung || (F.batt.daemmung && F.batt.daemmung.total.flaeche_m2 < full.batt.daemmung.total.flaeche_m2));
// Feld nachträglich am Raster verkleinern (PowerPoint-Anfasser)
WA.setFeld(0,300,0,260);          // ganzes Feld
WA.resizeFeld('x1',130);          // rechte Kante -> snappt auf Panelfuge 125
ok('resizeFeld: rechte Kante rastet (x1≈125)', Math.abs(WA.feld.x1-125)<0.01);
WA.resizeFeld('y1',160);          // obere Kante -> snappt auf 150
ok('resizeFeld: obere Kante rastet (y1≈150)', Math.abs(WA.feld.y1-150)<0.01);
ok('resizeFeld: Verbinder folgen dem kleineren Feld', WA.compute().pts.every(p=>p.x_cm<=125.01 && p.y_cm<=150.01));
WA.resizeFeld('x1',3);            // Mindestgröße: nicht kleiner als 1 Raster
ok('resizeFeld: Mindestkantenlänge 12,5 cm', WA.feld.x1-WA.feld.x0>=12.49);
WA.clearFeld();
ok('ganze Wand zurückgesetzt (feld null)', WA.feld===null && WA.compute().layout.feld_cm===null);
// Feld-Rechteck in Zeichnung nach erneutem Setzen
WA.setFeld(50,250,0,150);
ok('Feld-Rechteck gezeichnet', /Beplankungsfeld/.test(document.getElementById('plan').innerHTML));
WA.clearFeld();

// Getreppte Wand: rechte Hälfte (x≥150 cm) auf 140 cm abgesenkt
WA.applyWand({ name:'Treppe', length_mm:3000, height_mm:2600, grid_mm:125, course_mm:200, thickness_mm:125,
  openings:[], steps:[{x0_mm:1500,x1_mm:3000,height_mm:1400}], sides:{vorne:{funktion:'fassade'}} });
const S=WA.compute();
ok('Staffelung: keine Verbinder über der niedrigen Seite (x>150 → y≤140)', S.pts.every(p=> p.x_cm<=150.01 ? true : p.y_cm<=140.01));
ok('Staffelung: hohe Seite hat volle Höhe (Punkt y>140 bei x<150)', S.pts.some(p=>p.x_cm<150 && p.y_cm>140));
ok('Staffelung: Stufenkanten-Achse wird durchgezogen (Punkt bei x=150, y>140)', S.pts.some(p=>Math.abs(p.x_cm-150)<0.01 && p.y_cm>140));
ok('Staffelung: Latten rechts der Kante enden ≤ 140 cm', S.batt.axes.filter(a=>a.x_cm>150.01).every(a=>a.segments.every(sg=>sg.y1_cm<=140.01)));
ok('Staffelung: Latte auf Stufenkante läuft über 140 hinaus (durchgezogen)', S.batt.axes.some(a=>Math.abs(a.x_cm-150)<0.01 && a.segments.some(sg=>sg.y1_cm>140.01)));
ok('Staffelung: gestufte Kontur gezeichnet (polygon)', /<polygon/.test(document.getElementById('plan').innerHTML));
// Feld komplett UNTER den Stufen -> Stufenlogik entfällt (glatte Verteilung, keine Achse an der Stufenkante x=150)
WA.setFeld(0,300,0,130);
const Sb=WA.compute();
ok('Feld unter Stufe: keine Stufenkanten-Achse (x=150)', !Sb.xs.some(x=>Math.abs(x-150)<0.01));
ok('Feld unter Stufe: volle Breite, keine Höhenclippung (y bis Feldoberkante)', Sb.pts.some(p=>p.x_cm>150) && Sb.pts.every(p=>p.y_cm<=130.01));
ok('Feld unter Stufe: Latten laufen über volle Feldbreite (x>150 vorhanden)', Sb.batt.axes.some(a=>a.x_cm>150));
WA.clearFeld();
WA.applyWand(W);  // zurück auf Ausgangswand

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
ok('Maße der Verbinderpositionen gezeichnet', /font-size="7.5"/.test(document.getElementById('plan').innerHTML));
ok('Verbinder auf Steinmitte in der Höhe (10 + 20·m)', N.ys.every(y=>Math.abs(((y-10)%20+20)%20)<0.01));
ok('Verbinderreihen bleiben im Beplankungsfeld (Höhe)', N.ys.every(y=>y>=N.fy0-0.01 && y<=N.fy1+0.01));
// Aufbau/Seiten aus Modul 1 übernehmen (Wand W: vorne=Fassade / hinten=Innenausbau), keine Neuauswahl
WA.applyWand(W); document.getElementById('side').value='vorne'; document.getElementById('side').dispatch('change');
ok('Aufbau aus Modul 1: Vorderseite = Fassadenaufbau', WA.compute().layout.seite_funktion==='fassade' && /^FA-/.test(document.getElementById('vtyp').value));
ok('Aufbau als Anzeige (read-only) gesetzt', document.getElementById('aufbau').textContent==='Fassadenaufbau');
// Seitenwechsel übernimmt die in Modul 1 definierte Funktion der Rückseite
document.getElementById('side').value='hinten'; document.getElementById('side').dispatch('change');
ok('Seitenwechsel übernimmt Modul-1-Funktion: Rückseite = Innenausbau', WA.compute().layout.seite==='hinten' && WA.compute().layout.seite_funktion==='innenausbau' && document.getElementById('vtyp').value==='IA-1');
ok('Aufbau-Anzeige folgt Modul-1-Definition (Innenausbau)', document.getElementById('aufbau').textContent==='Innenausbau');
// Kein Aufbau-Auswahlelement mehr (nur Anzeige-Text, keine <option>)
ok('Aufbau nicht neu wählbar (keine option im Aufbau-Element)', !/<option/.test(document.getElementById('aufbau').innerHTML||''));
// Seiten-Dropdown listet nur die in Modul 1 definierten Seiten mit Aufbau-Label
ok('Seiten-Dropdown aus Modul 1 (Fassadenaufbau + Innenausbau)', /Fassadenaufbau/.test(document.getElementById('side').innerHTML) && /Innenausbau/.test(document.getElementById('side').innerHTML));
ok('Verbinder-Nut bei 12,5·k, Vorspannung bei 6,25+12,5·k', Math.abs((N.xs[0]/12.5)-Math.round(N.xs[0]/12.5))<1e-6 && Wc.tension_columns.every(c=>Math.abs(((c.x_mm-62.5)/125)-Math.round((c.x_mm-62.5)/125))<1e-6));
ok('Platten volle Wandbreite (Überstand ≤ 12,5 cm je Seite)', N.ohL<=12.5+1e-6 && N.ohR<=12.5+1e-6 && !N.ohWarn);

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
