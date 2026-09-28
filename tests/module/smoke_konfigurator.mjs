// Smoke-Test Modul 2 Beta (docs/wandaufbau-konfigurator.html) — der wiederbelebte
// Konfigurator aus dem SEMBLA Builder Beta. Evaluiert das klassische App-Skript unter einem
// DOM-Mock; Rechenkern, Aufbau-Rechenweg, Entpacker und parseImport kommen echt aus docs/shared/,
// der Speicher der Suite als LESENDER Mock (der Konfigurator schreibt nichts).
import { readFileSync } from "node:fs";
import { buildWall, Opening, wandLagenKanten } from "../../docs/shared/sembla-core.js";
import { berechneAufbau, VERBINDER_KATALOG } from "../../docs/shared/sembla-aufbau.js";
import { parseImport, PROJEKT_VERSION } from "../../docs/shared/storage.js";
import { entpacke, zipSync } from "../../docs/shared/zip.js";
import { planWandaufbau } from "../../legacy/Modul-Wandaufbau/sembla-wandaufbau.mjs";

const html = readFileSync(new URL("../../docs/wandaufbau-konfigurator.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.checked=true;this.disabled=false;this.className='';this.listeners={};this.attrs={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  dispatch(e,ev={}){return Promise.all((this.listeners[e]||[]).map(f=>f({target:this,...ev})));}
  setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k]??null;}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  click(){ globalThis.__klicks=(globalThis.__klicks||0)+1; }
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:600};}}
const dv={pB:'62.5',pH:'150',oX:'0',oY:'0',maxX:'62.5',maxY:'75',ohang:'12.5',vtyp:'FA-1',Rk:'0.5',gM:'2.0',wk:'0.8',gQ:'1.5',lw:'4',stock:'150',side:'vorne',quelle:''};
const _e={}; const $=id=>{let e=_e[id];if(!e){e=_e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;};
const downloads=[];
globalThis.document={getElementById:$,createElement:()=>new El('a')};
const _wl={}; globalThis.window={addEventListener:(e,f)=>{(_wl[e]||(_wl[e]=[])).push(f);}};
URL.createObjectURL=()=>'blob:x'; URL.revokeObjectURL=()=>{};
globalThis.Blob=class{constructor(parts,opt){downloads.push({text:typeof parts[0]==='string'?parts.join(''):'',bytes:parts[0] instanceof Uint8Array?parts[0]:null,typ:opt&&opt.type});}};

// Suite im selben Browser: zwei Waende, eine davon mit oberer Ausgleichslage (#136).
const wTuer=buildWall('Wand 1',3000,2600,[new Opening(4,8,0,9,'tuer')]);
const wAusgl=buildWall('Wand 2',3000,2750,[],null,null,[],null,true);
let schreibversuch=0, katalogzugriff=0;
const storeMock={
  listeElemente:()=>[{id:'a1',name:'Wand 1',wandelement:wTuer},{id:'a2',name:'Wand 2',wandelement:wAusgl}],
  wandVerortung:(id)=>id==='a1'?{mappe:{projekt:{name:'Mockup'}},geschoss:{name:'EG'}}:null,
  aktivId:()=>'a1', abonniere:()=>()=>{}, parseImport,
  // Modul 2 Beta ist katalogfrei: jeder Katalogzugriff wird gezaehlt
  holeKatalog:()=>{katalogzugriff++; return null;},
  // jeder Schreibweg ist verboten — faellt er doch, zaehlt der Test ihn
  speichere:()=>{schreibversuch++;}, mergeEingaben:()=>{schreibversuch++;}, setzeAktiv:()=>{schreibversuch++;},
};
globalThis.window.SEMBLA={ buildWall, Opening, wandLagenKanten, berechneAufbau, VERBINDER_KATALOG, store:storeMock, entpacke, zipSync };

eval(script);
globalThis.window.__kfInit();
const KF=globalThis.window.__kf;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);

// --- Seite in der Suite
ok('Seite bindet die Kopfleiste mit eigenem Reiter', /mountNavbar\('konfigurator'\)/.test(html));
ok('Seite rechnet mit dem EINEN Aufbau-Rechenweg (sembla-aufbau.js), keine eigene Achsenlogik',
  /from '\.\/shared\/sembla-aufbau\.js'/.test(html) && !/function nutAxes|function snapCourses/.test(script));
ok('keine SharePoint-/Office-Metadaten aus der Alt-Datei übernommen', !/mso:|sharepoint/i.test(html));
const { mountNavbar, MODULE } = await import("../../docs/shared/navbar.js");
ok('Konfigurator ist kein MODULE-Eintrag (Modulnummern bleiben stabil)', MODULE.every(m=>m.datei!=='wandaufbau-konfigurator.html'));

// --- Wände aus der Suite (lesend)
ok('Wände aus der Suite gefunden (2)', KF.quellen.filter(q=>q.herkunft==='suite').length===2);
ok('aktive Wand der Suite vorgewählt', KF.akt==='s:a1');
ok('Verortung im Namen (Projekt › Geschoss › Wand)', KF.quellen.some(q=>q.name==='Mockup › EG › Wand 1'));
const R=KF.compute();
ok('Ergebnis berechnet (Verbinder > 0, Latten > 0)', R && R.pts.length>0 && R.batt.summary.latten_stuecke>0);
const ref=berechneAufbau(wTuer,{seite:'vorne',panel:{b_cm:62.5,h_cm:150},achsen:{max_x_cm:62.5,max_y_cm:75,ohang_cm:12.5},
  verbinder:{typ:'FA-1',Rk:0.5,gM:2,wk:0.8,gQ:1.5},latten:{}},{laengen_mm:[1500],breite_mm:40});
ok('identisch zum Aufbau-Rechenweg der Suite (Achsen, Punkte, Latten)',
  JSON.stringify(R.xs)===JSON.stringify(ref.xs) && JSON.stringify(R.pts)===JSON.stringify(ref.pts)
  && JSON.stringify(R.batt.summary)===JSON.stringify(ref.batt.summary));
ok('keine Verbinder in der Türöffnung', !R.pts.some(p=>p.x_cm>50.01&&p.x_cm<99.99&&p.y_cm<179.99));
ok('Zeichnung: Verbinder, Latten, Öffnung', /<circle/.test($('plan').innerHTML) && /#8a5a2b/.test($('plan').innerHTML) && /Tür/.test($('plan').innerHTML));
ok('Übersicht zeigt Verbinderzahl', $('ovCount').textContent===R.pts.length);
ok('Zuschnittliste als Tabelle', /<table/.test($('zuschnitt').innerHTML) && /Standard/.test($('zuschnitt').innerHTML));

// --- Traglast
const T=KF.traglast(R,0.5,2.0,0.8,1.5);
ok('Traglast: erforderlich = ⌈γQ·wk·A/Rd⌉', T.erf===Math.ceil(1.5*0.8*T.flaeche_m2/0.25-1e-9));
ok('Traglast: Auslastung = γQ·wk·(A/n)/Rd', Math.abs(T.util-1.5*0.8*R.atReal/0.25)<1e-9);
ok('Traglast: Last 0 trägt immer', KF.traglast(R,0.5,2,0,1.5).ok && KF.traglast(R,0.5,2,0,1.5).erf===0);
ok('Tabelle „Verbinder je Traglast“ mit allen Typen', VERBINDER_KATALOG.every(t=>$('tragTab').innerHTML.includes(t.name)));
$('wk').value='3'; await $('wk').dispatch('input');
ok('hohe Last: Nachweis nicht erfüllt + Meldung', !KF.compute().trag.ok && /erforderlich/.test($('meldungen').innerHTML));
await $('auslegen').dispatch('click');
const nach=KF.compute();
ok('Auslegen: verdichtetes Raster trägt oder benennt, dass keines trägt',
  (nach.trag.ok && nach.pts.length>R.pts.length) || /Keine der/.test($('auslegenInfo').textContent));
$('wk').value='0.4'; await $('wk').dispatch('input');
await $('auslegen').dispatch('click');
const kl=KF.compute();
ok('Auslegen bei kleiner Last: wenigste Verbinder, trägt', kl.trag.ok && /Vorschlag/.test($('auslegenInfo').textContent));
$('maxX').value='62.5'; $('maxY').value='75'; $('wk').value='0.8'; await $('wk').dispatch('input');

// --- Seitenwechsel und Typ aus Modul 1 ([U-9])
ok('Vorderseite = Fassadenaufbau, Typ FA-1', $('aufbau').textContent==='Fassadenaufbau' && $('vtyp').value==='FA-1');
$('side').value='hinten'; await $('side').dispatch('change');
ok('Rückseite = Innenausbau, Typ IA-1', KF.side==='hinten' && $('aufbau').textContent==='Innenausbau' && $('vtyp').value==='IA-1');
$('side').value='vorne'; await $('side').dispatch('change');

// --- Beplankungsfeld
KF.setFeld(0,125,0,150);
const F=KF.compute();
ok('Feld: alle Verbinder im Feld', F.pts.length>0 && F.pts.every(p=>p.x_cm<=125.01&&p.y_cm<=150.01));
KF.setFeld(0,300,0,260); KF.resizeFeld('x1',130);
ok('Feld: Kante rastet auf Panelfuge (125)', Math.abs(KF.feld.x1-125)<0.01);
KF.clearFeld();
ok('ganze Wand zurückgesetzt', KF.feld===null);

// --- Ausgleichslage ([U-13], #136): Beta setzte dort Verbinder, jetzt nicht mehr
KF.waehleWand('s:a2');
const A=KF.compute(), K=wandLagenKanten(wAusgl), ag=K[K.length-1];
ok('Ausgleichslage: kein Verbinder in der Ausgleichslage', A.pts.every(p=>p.y_cm*10<ag.unterkante_mm));
ok('Ausgleichslage: Meldung sichtbar', /Ausgleichslage/.test($('meldungen').innerHTML));
const L=planWandaufbau(wAusgl,{side:'vorne'});
ok('Beta-Kern hätte in der Ausgleichslage einen Verbinder gesetzt (Grund der Anpassung)', L.pts.some(p=>p.y_cm*10>ag.unterkante_mm));
ok('Steine der Ausgleichslage mit realer Höhe gezeichnet', /#f3e7d3/.test($('plan').innerHTML));

// --- Latten: mehrere Standardlängen, Katalog
$('stock').value='300;150'; await $('stock').dispatch('input');
const M=KF.compute();
ok('freie Standardlängen 300/150 → Obergrenze 300 cm', M.batt.summary.laengen_cm[0]===300 && M.spez.quelle==='frei');
ok('Reststückverwertung nur nachrichtlich berechnet', M.rest && M.rest.stange_cm===300);
$('stock').value='150'; await $('stock').dispatch('input');

// --- Datei-Import: Projektdatei v2, reines Wandelement, Beta-Datei ohne Lagen, ZIP, Katalog
KF.waehleWand('s:a1');
const vorher=KF.quellen.length;
const pv2=JSON.stringify({format:'SEMBLA-Projekt',version:PROJEKT_VERSION,name:'Importwand',wandelement:wTuer,eingaben:{}});
await KF.ladeDatei('importwand.json', pv2);
ok('Projektdatei v2 geladen und gewählt', KF.quellen.length===vorher+1 && KF.akt.startsWith('d:'));
await KF.ladeDatei('rein.json', JSON.stringify(wAusgl));
ok('reines Wandelement geladen', KF.quellen.length===vorher+2);
const beta={name:'Beta-Wand',length_mm:3000,height_mm:2600,openings:[{g0:4,g1:8,l0:0,l1:10,art:'tuer'}],sides:{vorne:{funktion:'fassade'},hinten:{funktion:'innenausbau'}}};
await KF.ladeDatei('beta.json', JSON.stringify({format:'SEMBLA-Projekt',version:'1.0',wandelement:beta}));
const B=KF.compute();
ok('Beta-Bundle ohne Lagengeometrie: neu aufgebaut, Verbinder gesetzt', B.w.courses.length>0 && B.pts.length>0);
ok('Beta-Bundle: Neuaufbau sichtbar vermerkt', /Lagengeometrie/.test($('meldungen').innerHTML));
const zip=zipSync([
  {name:'SEMBLA_Projekt_X/projekt.json', data:JSON.stringify({format:'SEMBLA-Projektmappe',version:2})},
  {name:'SEMBLA_Projekt_X/waende/W1__w1.json', data:pv2},
  {name:'SEMBLA_Projekt_X/waende/W2__w2.json', data:JSON.stringify({format:'SEMBLA-Projekt',version:2,name:'W2',wandelement:wAusgl})},
  {name:'SEMBLA_Projekt_X/plaene/gs.png', data:new Uint8Array([1,2,3])}]);
const n=await KF.ladeDatei('archiv.zip', zip);
ok('Projektarchiv-ZIP: beide Wände übernommen, Mappe/Bild übergangen', n===2);
let fehler=null; try{ KF.deuteJson(JSON.stringify({format:'SEMBLA-Projektmappe',version:2})); }catch(e){ fehler=e.message; }
ok('Projektmappe allein wird benannt abgewiesen', /Projektarchiv/.test(fehler||''));
const kat=readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url),"utf8");
let katFehler=null; try{ KF.deuteJson(kat, 'katalog.json'); }catch(e){ katFehler=e.message; }
ok('Katalogdatei wird benannt abgewiesen (Modul 2 Beta ist katalogfrei)', /ohne Katalog/.test(katFehler||''));
KF.waehleWand('s:a1');
ok('Latten nur aus freier/eingebauter Länge', KF.lattenSpez().quelle==='frei' && KF.lattenSpez().laengen_mm[0]===1500);
ok('keine Katalogauswahl auf der Seite, kein Katalogimport', !/latKatalog|data-lat=/.test(html) && !/sembla-katalog\.js/.test(html));
ok('kein Zugriff auf den Katalog der Suite', katalogzugriff===0);

// --- Alle Wände + Export
const E=KF.alleErgebnisse();
ok('Übersicht aller Wände je Seite', E.length===KF.quellen.length*2 && E.every(e=>!e.fehler));
ok('Übersicht mit Summenzeile', /Summe/.test($('alle').innerHTML));
downloads.length=0; await $('expZip').dispatch('click');
const zipE=await entpacke(downloads[0].bytes);
ok('eigener Download: ZIP mit Zuschnitt-, Materialliste, Layout, Einstellungen, Übersicht, Ansicht',
  downloads[0].typ==='application/zip' && ['Zuschnittliste_','Materialliste_','Verbinderlayout_','Einstellungen_','Uebersicht_alle_Waende','Wandansicht_'].every(n=>zipE.some(e=>e.name.startsWith(n))));
ok('ZIP-Inhalt stimmt mit dem Einzel-Download überein', new TextDecoder('utf-8',{ignoreBOM:true}).decode(zipE.find(e=>e.name.startsWith('Zuschnittliste_')).data)===KF.dokumente()[0].data);
ok('Seite hängt sich nicht in den zentralen Export von Modul 0', !/sembla-export\.js|sembla-archiv\.js|hierarchieExport/.test(html));
downloads.length=0; await $('expCut').dispatch('click'); await $('expMat').dispatch('click'); await $('expLayout').dispatch('click');
ok('Zuschnittliste CSV mit Kopf und Zeilen', /^﻿achse_x_cm;stueck;/.test(downloads[0].text) && downloads[0].text.split('\n').length>3);
ok('Materialliste CSV mit Verbinder und Latten', /Verbinder;/.test(downloads[1].text) && /Latten;/.test(downloads[1].text));
ok('Verbinder-Layout JSON (SEMBLA-VerbinderLayout)', JSON.parse(downloads[2].text).format==='SEMBLA-VerbinderLayout');
ok('der Konfigurator schreibt nichts in die Suite', schreibversuch===0);

// --- Kopfleiste: Reiter K hinter Modul 1
const nav=new El('nav'); nav.className='sb-nav';
const docAlt=globalThis.document;
globalThis.document={ getElementById:(id)=>id==='sb-nav-css'?{}:null, querySelector:()=>nav, head:{appendChild(){}},
  body:{insertBefore(){}}, createElement:()=>new El('style'), addEventListener(){}, querySelectorAll:()=>[] };
globalThis.localStorage={ _m:{}, getItem(k){return this._m[k]??null;}, setItem(k,v){this._m[k]=String(v);}, removeItem(k){delete this._m[k];} };
try{ mountNavbar('konfigurator'); }catch(e){ /* DOM-Double reicht fuer die Reiterleiste */ }
const t=nav.innerHTML;
ok('Kopfleiste: Reiter „2β Aufbau Beta“ aktiv', /class="sb-tab active" href="wandaufbau-konfigurator\.html"[^>]*><span class="n">2β<\/span> Aufbau Beta/.test(t));
ok('das ausgeblendete Modul 2 bleibt ausgeblendet und unverändert registriert', MODULE.find(m=>m.nr===2).versteckt===true && MODULE.find(m=>m.nr===2).datei==='wandaufbau.html');
ok('kein anderes Modul verweist auf Modul 2 Beta', ['index.html','wandplanung.html','wandaufbau.html','stueckliste.html','zeichnung.html','katalog.html'].every(f=>!readFileSync(new URL('../../docs/'+f, import.meta.url),'utf8').includes('wandaufbau-konfigurator')));
ok('Kopfleiste: Reiter steht hinter Modul 1', t.indexOf('wandplanung.html')>=0 && t.indexOf('wandplanung.html')<t.indexOf('wandaufbau-konfigurator.html'));
globalThis.document=docAlt;

let fail=0; for(const [nm,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+nm); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
