// Smoke-Test Modul 5 (docs/montage.html): evaluiert das klassische App-Skript unter einem DOM-Mock —
// also den ECHTEN Produktpfad der Vorschau. BOM-Baustein, Montage-Ableitung (sembla-montage.js) und
// Storage werden — wie im Browser via window.SEMBLA — aus docs/shared/ bzw. per Mock bereitgestellt
// und vor __mInit() gebunden. Reiner Konsument: laedt das aktive Wandelement, schreibt es nie zurueck.
//
// Zusaetzlich wird hier die Deckungsgleichheit zum zentralen Export geprueft (Issue #23):
// das Druckdokument der Vorschau und montageHtml() aus sembla-export.js muessen in Reihenfolge
// und Inhalt identisch sein, weil beide dieselbe DOM-freie Ableitung nutzen.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { semblaBom, semblaBomItems, semblaBomMenge } from "../../docs/shared/sembla-bom.js";
import { montageAbschnitte, abschnittSvg, konturSvg, montageSeitenHtml, MONTAGE_CSS, ART_LABEL, posCm }
  from "../../docs/shared/sembla-montage.js";
import { montageHtml } from "../../docs/shared/sembla-export.js";

const html = readFileSync(new URL("../../docs/montage.html", import.meta.url), "utf8");
// erstes attributloses <script> ist die App-Logik (das zweite ist type="module")
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';this.style={};this.max=1;this.className='';this.checked=false;this.files=[];this.listeners={};}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);} dispatch(e){(this.listeners[e]||[]).forEach(f=>f({target:this}));}
  setAttribute(){} click(){} get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}}
const _e={}; const document={getElementById:id=>_e[id]||(_e[id]=new El(id)),createElement:()=>new El('_')};
globalThis.document=document; globalThis.window={print:()=>{globalThis.__printed=true;}}; globalThis.alert=()=>{};
globalThis.FileReader=class{readAsText(){}};

// Testwaende (baubar, synthetisch aus dem Core -> checkout-autark): 2600 mm -> 13 Steinreihen.
const W  = buildWall('Testwand', 3000, 2600, [new Opening(6,12,0,10,'tuer')]);
// gestaffelt wie die Musterwand AWG (3,00 x 2,60 m, ohne Oeffnungen, mehrere Stangenendhoehen)
const WS = buildWall('Musterwand AWG', 3000, 2600, [], null, null,
  [{x0_mm:1500,x1_mm:2250,height_mm:2000},{x0_mm:2250,x1_mm:3000,height_mm:1400}]);

const EING = { projekt: { name: 'Rettungswache', plan_nr: 'A-12', index: '2' } };

// Storage-Mock: aktives Element vorhanden -> Modul laedt es beim Start; abonniere() fuer externen Wechsel.
let _subs=[]; let _aktiv='w-1'; let _we=W;
const storeMock={ aktivId:()=>_aktiv, aktivesWandelement:()=>_we, aktiveEingaben:()=>EING,
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
const fireStore=()=>_subs.forEach(cb=>cb());
globalThis.window.SEMBLA={ semblaBom, semblaBomItems, semblaBomMenge, store:storeMock,
  montageAbschnitte, abschnittSvg, konturSvg, montageSeitenHtml, MONTAGE_CSS, ART_LABEL, posCm };

eval(script);
globalThis.window.__mInit();
const M=globalThis.window.__m;

const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const $=id=>document.getElementById(id);

// #72: der einleitende Beschreibungsabsatz ist ersatzlos entfallen (samt totem CSS und
// dem toten .intro-Bezug in der Druckregel).
ok('[#72] kein einleitender intro-Absatz mehr auf der Seite',
  !/class="intro"/.test(html) && !/\.intro\b/.test(html));

// Start: aktives Element aus dem Storage geladen
ok('Start mit aktivem Element -> Wandelement geladen', M.wall && M.wall.length_mm===3000);
ok('Übersicht Maße gesetzt', /m/.test($('ovDim').textContent));
ok('Raster/Steinreihen gesetzt (13 Reihen)', /13 Steinreihen/.test($('ovGrid').textContent));
ok('Status baubar', $('ovBadge').textContent==='Baubar');
ok('Vorspannstränge-Zahl gesetzt', +$('ovCols').textContent===W.tension_columns.length);

// Abschnitte kommen aus der geteilten Ableitung (kein eigener Rechenweg im Modul)
const alleW=montageAbschnitte(W);                 // inkl. Schnitt 0 ([A-9])
const absW=alleW.filter(a=>a.art!=='schnitt0');   // regulaere Baugruppenabschnitte
ok('Baugruppenabschnitte aus sembla-montage.js', M.abschnitte.length===alleW.length && absW.length>0);
ok('Abschnittszahl angezeigt (Schnitt 0 separat ausgewiesen)',
  $('ovAbs').textContent===absW.length+' (+ Schnitt 0)');
ok('deutlich weniger Abschnitte als Steinreihen', alleW.length < W.lagen);

// Kurz-Stückliste kommt aus dem geteilten BOM-Baustein (Single Source) — konsistent zu Modul „Stückliste"
const bomHtml=$('bom').innerHTML;
ok('Stückliste: Steine i3 + i2', /Stein i3/.test(bomHtml) && /Stein i2/.test(bomHtml));
const expItems=semblaBomItems(W).filter(it=>it.menge>0);
ok('Stückliste: Zeilenzahl = BOM-Baustein (menge>0)', (bomHtml.match(/<tr>/g)||[]).length===expItems.length);
const i3It=expItems.find(it=>it.key==='i3');
ok('Stückliste: i3-Menge = semblaBom (Konsistenz)', bomHtml.includes('<td>'+i3It.label+'</td><td>'+semblaBomMenge(i3It)+'</td>'));

// --- MUSS 1: erste Darstellung ist Schnitt 0 (nur Bodenblech + erste Stangen) ---
ok('Vorschau startet auf Schnitt 0', M.cur===0 && M.abschnitte[0].art==='schnitt0');
ok('Schnitt 0: Titel nennt Bodenblech und erste Gewindestangen',
  /^Schnitt 0 · /.test($('absTitel').textContent)
  && /Bodenblech/.test($('absTitel').textContent) && /Gewindestange/.test($('absTitel').textContent));
ok('Schnitt 0: Untertitel weist die Fuß-Baugruppe ohne Steinreihen aus',
  /ohne Steinreihen/.test($('absSub').textContent) && !/Reihen 1/.test($('absSub').textContent));
ok('Schnitt 0: Ereignistext mit Senkkopfschraube + Kopplungsmutter',
  /Senkkopfschraube/.test($('ereignisse').innerHTML) && /Kopplungsmutter/.test($('ereignisse').innerHTML));
ok('Schnitt 0: Navigations-Label', /^Schnitt 0 · Bild 1 von /.test($('absLab').textContent));
const svg0=$('absSvg').innerHTML;
ok('Schnitt-0-Bild: Bodenblech + Gewindestangen', /#5b6673/.test(svg0) && /#1f6feb/.test(svg0)
  && /Schnitt 0 · Bodenblech und erste Gewindestangen/.test(svg0));
ok('Schnitt-0-Bild: KEINE Steine, Reihennummern, Kontur oder Öffnungen',
  !/stroke="#7d848c"/.test(svg0) && !/fill="#e9ebee"/.test(svg0)
  && !/font-weight="600"/.test(svg0) && !/<polyline/.test(svg0) && !/stroke-dasharray="5 4"/.test(svg0));
ok('Schnitt 0: Wandüberblick ohne Hervorhebung', $('mapSvg').innerHTML.length>400
  && !/hervorgehoben:/.test($('mapSvg').innerHTML));

// Abschnitt 1 folgt unverändert: Bodenblech + erste Gewindestangen + mehrere erste Steinreihen
$('next').dispatch('click');
ok('Abschnitt 1 nennt Bodenblech und erste Gewindestangen',
  /Bodenblech/.test($('absTitel').textContent) && /Gewindestange/.test($('absTitel').textContent));
ok('Abschnitt 1: Ereignistext mit Senkkopfschraube + Kopplungsmutter (additiv, nicht verschoben)',
  /Senkkopfschraube/.test($('ereignisse').innerHTML) && /Kopplungsmutter/.test($('ereignisse').innerHTML));
ok('Abschnitt 1: mehrere erste Steinreihen', /Reihen 1–5/.test($('absSub').textContent));
ok('Ereignisliste hat Art-Label + Höhe', /class="art">Erste Stange · 0 cm/.test($('ereignisse').innerHTML));
ok('Baugruppenbild gezeichnet', $('absSvg').innerHTML.length>600);
ok('Baugruppenbild: Bodenblech + Stange + Reihennummern',
  /#5b6673/.test($('absSvg').innerHTML) && /#1f6feb/.test($('absSvg').innerHTML)
  && /Abschnitt 1 · Reihen 1–5/.test($('absSvg').innerHTML));
ok('Baugruppenbild nennt Orientierung', /Blick von vorne, x ab links/.test($('absSvg').innerHTML));
ok('Wandüberblick gezeichnet', $('mapSvg').innerHTML.length>400);
ok('Wandüberblick: hervorgehobener Reihenbereich', /hervorgehoben: Reihen 1–5/.test($('mapSvg').innerHTML));

// Navigation über Abschnitte (nicht mehr über Lagen)
ok('Navigations-Label nennt Abschnitt', /Abschnitt 1 · Bild 2 von /.test($('absLab').textContent));
ok('Slider max = Zahl der Bilder inkl. Schnitt 0', +$('slider').max===alleW.length);
$('next').dispatch('click');
ok('Navigation: Abschnitt 2', /Abschnitt 2 · Bild 3 von /.test($('absLab').textContent));
ok('Abschnitt 2 ist die Kopplung auf 110 cm', /Kopplung auf 110 cm/.test($('absTitel').textContent));
ok('Kopplung nennt Reihe 5 / vor Reihe 6', /nach Reihe 5 und <b>vor<\/b> Reihe 6/.test($('ereignisse').innerHTML));
$('slider').value=String(alleW.length); $('slider').dispatch('input');
ok('Slider springt auf letzten Abschnitt', M.cur===alleW.length-1);
ok('letzter Abschnitt enthält den oberen Abschluss', /Oberer Abschluss/.test($('ereignisse').innerHTML));
ok('letzter Abschnitt endet auf Reihe 13', /Reihen 12–13/.test($('absSub').textContent));

// Maße/Raster-Umschalter wirken auf denselben Renderer
$('showRaster').dispatch('change');
ok('Raster-Umschalter zeichnet neu', $('mapSvg').innerHTML.length>400);

// Druckdokument: paginierte Abschnittsseiten (KEINE Seite pro Steinreihe)
const pd=$('printdoc').innerHTML;
ok('Druckdoc: A4-Seiten statt Lagenkacheln (Übersicht + Schnitt 0 + Abschnitte)',
  (pd.match(/class="mseite"/g)||[]).length===alleW.length+1 && !/pcourse/.test(pd));
ok('Druckdoc: A4-Stylesheet aus sembla-montage.js', /@page\{size:A4 portrait/.test(pd));
ok('Druckdoc: Projekt-/Wandbezug je Seite',
  (pd.match(/Rettungswache · Wand Testwand/g)||[]).length===alleW.length+1);
ok('Druckdoc: Schnitt 0 ist die erste Abschnittsseite',
  pd.indexOf('Schnitt 0 · Bodenblech')>0 && pd.indexOf('Schnitt 0 · Bodenblech')<pd.indexOf('Abschnitt 1 · '));

// --- MUSS 7: Vorschau (dieses Modul) und zentraler Export sind deckungsgleich ---
const mdoc = s => s.slice(s.indexOf('<div class="mdoc">'), s.lastIndexOf('</div>')+6);
ok('Vorschau-Druckdokument == zentral exportierte Montageanleitung',
  mdoc(pd) === mdoc(montageHtml(W, EING)) && mdoc(pd).length>2000);

// Storage-Sync: externer Wechsel auf die gestaffelte Wand -> Ansicht folgt (ohne Datei)
_aktiv='w-2'; _we=WS; fireStore();
const absS=montageAbschnitte(WS);
ok('Store-Sync: gestaffeltes Element geladen', M.wall && M.wall.name==='Musterwand AWG');
ok('gestaffelte Wand: mehr Abschnitte durch verschiedene Stangenendhöhen', absS.length>alleW.length);
ok('gestaffelte Wand: Abschnitte aus der geteilten Ableitung', M.abschnitte.length===absS.length);
ok('gestaffelte Wand: Vorschau == Export',
  mdoc($('printdoc').innerHTML) === mdoc(montageHtml(WS, EING)));
// Oberer Abschluss der 140-cm-Stufe erscheint als eigenes Ereignis in der Vorschau
$('slider').value='4'; $('slider').dispatch('input');
ok('gestaffelte Wand: Abschluss auf 140 cm sichtbar',
  /Oberer Abschluss auf 140 cm/.test($('ereignisse').innerHTML) || /Abschluss 140 cm/.test($('absSvg').innerHTML));

// Druck-Button
$('print').dispatch('click');
ok('Druck ausgelöst', globalThis.__printed===true);

// Modul 5 hat keine eigene Ableitung/Zeichenlogik mehr (kein Drift zum Export)
ok('montage.html importiert die geteilte Ableitung',
  /from '\.\/shared\/sembla-montage\.js'/.test(html));
ok('montage.html enthält keine eigene Lagen-Zeichnung mehr',
  !/function courseStrip/.test(html) && !/function wallMap/.test(html) && !/function vorspannSteps/.test(html));

// --- MUSS 2: die Vorschau behaelt ueber ALLE Bearbeitungsschritte dieselbe Groesse ---
// Geprueft am echten Vorschau-Renderer des Moduls: das SVG-Element hat einen festen
// viewBox, und der Inhalt nutzt in jedem Schritt denselben Massstab/Nullpunkt.
ok('Vorschau-SVG hat festen viewBox (Elementgröße konstant)',
  /<svg id="absSvg" viewBox="0 0 900 430"/.test(html) && /<svg id="mapSvg" viewBox="0 0 900 250"/.test(html));
for (const [name, w] of [['Rechteck', W], ['gestaffelt', WS]]) {
  _we=w; _aktiv='w-'+name; fireStore();
  const n=M.abschnitte.length, yB=[], bB=[];
  for (let i=0;i<n;i++){
    $('slider').value=String(i+1); $('slider').dispatch('input');
    const s=$('absSvg').innerHTML;
    yB.push((/<rect x="[\d.]+" y="([\d.]+)"[^>]*fill="#5b6673"/.exec(s)||[])[1]);
    bB.push((/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"[^>]*fill="#5b6673"/.exec(s)||[])[1]);
  }
  ok(`${name}: Wandfuß bleibt über alle ${n} Schritte auf derselben y-Position`,
    yB.length===n && yB.every(v=>v!==undefined) && new Set(yB).size===1);
  ok(`${name}: Maßstab bleibt über alle Schritte identisch (Vorschau wächst nicht)`,
    bB.length===n && bB.every(v=>v!==undefined) && new Set(bB).size===1);
}

// --- MUSS 3: Druck-CSS blendet alle schwebenden Bedienelemente aus ---
const navCss = readFileSync(new URL("../../docs/shared/navbar.js", import.meta.url), "utf8");
const navKlasse = /\.(sb-nav)\{[^}]*position:sticky/.exec(navCss);
ok('navbar.js liefert eine sticky Kopfleiste namens .sb-nav (Bezug des Druck-CSS)', !!navKlasse);
const printCss = /@media print\{([\s\S]*?)\n  \}/.exec(html);
ok('montage.html hat einen @media-print-Block', !!printCss);
const pc = printCss ? printCss[1] : '';
ok('Druck: die ECHTE Kopfleiste .sb-nav wird ausgeblendet (nicht der frühere Tippfehler .sb-navbar)',
  new RegExp('(^|[,{\\s])\\.'+navKlasse[1]+'([,\\s{])').test(pc) && !/\.sb-navbar/.test(html));
ok('Druck: Bedienpanel ausgeblendet (kein toter .intro-Bezug mehr, #72)',
  /#app/.test(pc) && !/\.intro/.test(pc) && /display:none!important/.test(pc));
ok('Druck: schwebende Eingabe-/Bedienelemente ausgeblendet',
  /input[^}]*display:none!important/.test(pc.replace(/\s+/g,''))
  || /input,select,textarea,button\{display:none!important\}/.test(pc.replace(/\s+/g,'')));
ok('Druck: nichts bleibt sticky/fixed stehen', /position:static!important/.test(pc.replace(/\s+/g,'')));
ok('Druck: nur das Montagedokument wird gedruckt', /#printdoc\{display:block\}/.test(pc.replace(/\s+/g,'')));
ok('Druck: A4-Paginierung des Dokuments bleibt erhalten',
  /@page\{size:A4 portrait/.test($('printdoc').innerHTML)
  && /page-break-after:always/.test($('printdoc').innerHTML)
  && !/@page/.test(pc));

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c) fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`);
process.exit(fail?1:0);
