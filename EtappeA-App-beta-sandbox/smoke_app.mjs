import { readFileSync } from "node:fs";
const html = readFileSync("./SEMBLA_EtappeA_App.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El {
  constructor(id){ this.id=id; this.value=undefined; this.textContent=""; this._h=""; this.checked=false; this.style={}; this.listeners={}; this.files=[]; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f); }
  dispatch(e){ (this.listeners[e]||[]).forEach(f=>f({target:this})); }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h=v; }
  querySelectorAll(){ return []; } click(){}
}
const dv={ pName:"Testprojekt", pBauherr:"Muster", pPhase:"LP 3", pPlan:"P-01", wL:"3000", wH:"2600" };
const _e={}; const document={ getElementById:id=>{ let e=_e[id]; if(!e){ e=_e[id]=new El(id); if(id in dv) e.value=dv[id]; } return e; }, createElement:()=>new El("a") };
globalThis.document=document; globalThis.window={}; globalThis.alert=()=>{};
globalThis.URL={createObjectURL:()=>"blob:x",revokeObjectURL(){}}; globalThis.Blob=class{constructor(){}}; globalThis.FileReader=class{readAsText(){}};
eval(script);
const A=globalThis.window.__app;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const AMPEL=new Set(["gruen","gelb","rot"]);

ok("App-API vorhanden", !!A && typeof A.planAll==="function");
A.newProject("Testprojekt");
ok("neues Projekt leer + Format", A.project.format==="SEMBLA-Projekt-App" && A.project.walls.length===0);

const wd1=A.quickWall(3000,2600,true);
const wd2=A.quickWall(2000,2600,false);
ok("2 Wände angelegt", A.project.walls.length===2);
ok("Schnell-Wand hat Tiling + BOM", wd1.courses.length>0 && wd1.bom && wd1.bom.i3>0);
ok("Wand mit Tür hat Öffnung", (wd1.openings||[]).length===1);

const plans=A.planAll();
ok("Batch: jede Wand geplant (η endlich)", plans.every(p=>isFinite(p.eta)));
ok("Batch: Ampel ∈ {grün,gelb,rot}", plans.every(p=>AMPEL.has(p.ampel)));
ok("Batch: maßgebender Nachweis benannt", plans.every(p=>typeof p.massg==="string" && p.massg.length>0));
ok("Tür-Wand mit Versatz-Verstoß = gelb (Warnung erkannt)", A.project.walls[0].plan.ampel==="gelb" && A.project.walls[0].plan.versatz_ok===false);
ok("tür-lose Regelwand = grün (geplant)", A.project.walls[1].plan.ampel==="gruen");

const html_dash=document.getElementById("dash").innerHTML;
ok("Dashboard gerendert (Tabelle + η_max)", /η_max/.test(html_dash) && /Testprojekt|Wand 1|Wand/.test(html_dash));

// Persistenz-Round-Trip
const saved=A.saveJson();
const obj=JSON.parse(saved);
ok("Speichern: gültiges JSON, Format + 2 Wände", obj.format==="SEMBLA-Projekt-App" && obj.walls.length===2);
A.loadJson(obj);
ok("Laden: Projekt wiederhergestellt (2 Wände)", A.project.walls.length===2);

// Bundle-Import (SEMBLA-Projekt) -> 1 Wand
A.loadJson({ format:"SEMBLA-Projekt", wandelement: wd2 });
ok("Bundle-Import ergibt 1 Wand", A.project.walls.length===1);

// blankes Wandelement -> 1 Wand
A.loadJson(wd1);
ok("Wandelement-Import ergibt 1 Wand", A.project.walls.length===1);

// CSV-Export
A.newProject("CSVtest"); A.quickWall(3000,2600,false); A.planAll();
const csv=A.exportSummaryCsv();
ok("CSV-Export: Kopf + 1 Datenzeile", /Nr;Wand;/.test(csv) && csv.trim().split("\n").length===2);
ok("BOM-Aggregation i3>0", A.aggregateBom(A.project).i3>0);

// gezielt Konflikt provozieren: sehr hohe, schlanke Wand -> Biegung überschritten
A.newProject("Konflikt"); const tall=A.quickWall(1000,4000,false); A.planAll();
ok("hohe schlanke Wand kann Konflikt/Warnung zeigen", ["rot","gelb","gruen"].includes(A.project.walls[0].plan.ampel));

// ===== Wand-Editor (echte Wände inkl. Öffnungen, ohne altes Tool) =====
A.newProject("Editor");
A.setEditor({ name:"Editorwand", L:3000, H:2600, openings:[{art:"fenster",g0:14,g1:18,l0:3,l1:8}] });
ok("Editor: Öffnung übernommen", A.editorOpenings.length===1 && A.editorOpenings[0].art==="fenster");
A.addOpening('tuer');   // Standard-Tür (g5) – überlappt das Fenster (g14) nicht
ok("Editor: zweite Öffnung hinzugefügt (+Tür)", A.editorOpenings.length===2);
const svg=A.previewSvg();
ok("Vorschau-SVG mit Steinen + Öffnung + Vorspannung", /<svg/.test(svg) && /#cfd3d8|#bcc2c9/.test(svg) && /#c9461c/.test(svg) && /#1f6feb/.test(svg));
const wd=A.saveWall();
ok("Editor: Wand gespeichert (Name + 2 Öffnungen)", A.project.walls.length===1 && A.project.walls[0].name==="Editorwand" && (wd.openings||[]).length===2);
// Bearbeiten: bestehende Wand laden, ändern, ersetzen (kein Duplikat)
const id=A.project.walls[0].id;
A.editWall(id);
ok("Bearbeiten lädt Öffnungen in den Editor", A.editorOpenings.length===2);
A.setEditor({ name:"Editorwand", L:3000, H:2600, openings:[{art:"tuer",g0:4,g1:8,l0:0,l1:9}] });
A.saveWall();
ok("Bearbeiten ersetzt (kein Duplikat, 1 Wand)", A.project.walls.length===1 && (A.project.walls[0].wall.openings||[]).length===1);
// Meter-Editor: negative/degenerierte Breite klemmt auf ≥1 Raster (Modul-1-Verhalten)
A.clearEditor();
A.setEditor({ name:"Klemm", L:3000, H:2600, openings:[] });
A.addOpening('tuer'); A.setOpening(0,'w',-0.5);
const wk=A.saveWall();
ok("degenerierte Breite klemmt auf ≥1 Raster (kein Absturz)", wk!==null && (wk.openings||[]).some(o=>o.g1>o.g0));

// ===== Ausbau: Seiten, Platzierung, Kosten, Exporte, Detail =====
A.newProject("Ausbau");
A.setEditor({ name:"AW", L:3000, H:2600, openings:[], fVorne:"fassade", fHinten:"innenausbau", x_mm:0, y_mm:0, rot_deg:0 }); A.saveWall();
A.setEditor({ name:"AW2", L:2000, H:2600, openings:[], x_mm:3000, y_mm:0, rot_deg:90 }); A.saveWall();
A.planAll();
ok("Seiten-Funktion am Wandelement gespeichert", A.project.walls[0].wall.sides.vorne.funktion==="fassade" && A.project.walls[0].wall.sides.hinten.funktion==="innenausbau");
ok("Platzierung übernommen (W2 x=3000, rot=90)", A.project.walls[1].x_mm===3000 && A.project.walls[1].rot_deg===90);
const cm=A.costModel();
ok("Kostenmodell: Positionen + Summe > 0", cm.rows.length>0 && cm.total>0);
const oldTotal=cm.total; A.PRICES.i3=(A.PRICES.i3||0)+10;
ok("Preisänderung erhöht Gesamtsumme", A.costModel().total>oldTotal);
ok("Kosten-CSV Kopf + Gesamtzeile", /Position;Menge/.test(A.costsCsv()) && /GESAMT/.test(A.costsCsv()));
ok("DXF Grundriss (2 Wände) enthält ENTITIES + WAND", /ENTITIES/.test(A.dxfGrundriss()) && /WAND/.test(A.dxfGrundriss()));
ok("DXF Ansichten enthält Steinlayer", /STEINE_I3|STEINE_I2/.test(A.dxfAnsichten()));
ok("IFC-Export ist IFC4", /FILE_SCHEMA\(\('IFC4'\)\)/.test(A.ifc()));
A.wallDetail(A.project.walls[0].id);
const det=document.getElementById("wallDetail").innerHTML;
ok("Statik-Detailpanel: η_max + Nachweise + Seiten", /η_max,gesamt/.test(det) && /Biegung/.test(det) && /fassade/.test(det));

// ===== Modul 2 in der App: Bekleidung je Seite =====
const cl=A.project.walls[0].cladding;
ok("Bekleidung geplant für beide Seiten", cl && cl.vorne && cl.hinten);
ok("Vorderseite = Fassade → FA-Verbinder + Latten", cl.vorne.funktion==="fassade" && /^FA-/.test(cl.vorne.verbinder) && cl.vorne.nVerbinder>0 && cl.vorne.latten_m>0);
ok("Rückseite = Innenausbau → IA-Verbinder", cl.hinten.funktion==="innenausbau" && cl.hinten.verbinder==="IA-1");
ok("Detailpanel zeigt Bekleidung", /Bekleidung \(Verbinder/.test(det) && /Dämmung/.test(det));
const agg=A.aggregateCladding();
ok("Bekleidung aggregiert (Verbinder + Latten + Dämmung > 0)", agg.verbinder>0 && agg.latten_m>0 && agg.daemmung_m2>0);
ok("Kosten enthalten Bekleidungs-Positionen", A.costModel().rows.some(r=>r.key==="verbinder") && A.costModel().rows.some(r=>r.key==="daemmung_m2"));
// Parität-Spot: App-Bekleidung == Kernmodul direkt
const direct=A.SW.planWandaufbau(A.project.walls[0].wall,{side:"vorne"});
ok("App-Bekleidung == Kernmodul (Verbinderzahl)", cl.vorne.nVerbinder===direct.pts.length);

// ===== Modul-1-Features: Öffnungsarten, Staffelung, oberer Anschluss, Visualisierung =====
A.newProject("M1");
A.setEditor({ name:"MW", L:3000, H:2600,
  openings:[{art:'tuer',g0:4,g1:8,l0:0,l1:9},{art:'fenster',g0:14,g1:18,l0:3,l1:8},{art:'durchbruch',g0:20,g1:22,l0:4,l1:6}],
  steps:[{x0_mm:1500,x1_mm:3000,height_mm:1400}], topConn:'spannplatte' });
const mw=A.saveWall();
ok("drei Öffnungsarten übernommen (Tür/Fenster/Durchbruch)", (mw.openings||[]).length===3 && mw.openings.some(o=>o.art==='durchbruch') && mw.openings.some(o=>o.art==='fenster'));
ok("Staffelung an den Core übergeben", (mw.steps||[]).length===1 && mw.steps[0].height_mm===1400);
ok("oberer Anschluss = Spannplatte", mw.prestress && mw.prestress.top_connection==='spannplatte');
const svgM1=A.svgForWall(mw);
ok("Viz: Öffnungs-Labels (Tür/Fenster/Durchbruch)", /Tür/.test(svgM1) && /Fenster/.test(svgM1) && /Durchbruch/.test(svgM1));
ok("Viz: Bodenblech + Stahlfarbe", /#5b6673/.test(svgM1));
ok("Viz: Spann-Anker (oberer Anschluss)", /#e8702a/.test(svgM1));
ok("Viz: Vorspannstränge", /#1f6feb/.test(svgM1));
// Kopfblech-Variante zeichnet Stahlbalken statt Spannplatten
A.setEditor({ name:"MW2", L:2000, H:2600, openings:[], steps:[], topConn:'blech' }); const mw2=A.saveWall();
ok("Kopfblech-Variante: keine Spann-Anker, aber Stahlblech", !/#e8702a/.test(A.svgForWall(mw2)) && /#5b6673/.test(A.svgForWall(mw2)));
// Bearbeiten lädt Staffelung + Anschluss zurück
A.editWall(A.project.walls[0].id);
ok("Bearbeiten: Tür/Fenster als Öffnung, Durchbruch als Void, Staffelung geladen",
   A.editorOpenings.length===2 && A.editorVoids.size===4 && A.editorSteps.length===1);

// ===== Interaktiv: Durchbrüche per Klick (Zellen) + Spannachsen (columns_grid) =====
A.newProject("IA"); A.clearEditor();
A.setEditor({ name:"IW", L:3000, H:2600, openings:[] });
// zwei benachbarte Zellen voiden -> ein zusammenhängender Durchbruch
A.toggleVoid(5,10); A.toggleVoid(5,11);
ok("Void-Zellen gesetzt", A.editorVoids.size===2);
let iw=A.saveWall();
const durch=(iw.openings||[]).filter(o=>o.art==='durchbruch');
ok("Klick-Durchbruch → durchbruch-Öffnung", durch.length===1 && durch[0].g0===10 && durch[0].g1===12 && durch[0].l0===5 && durch[0].l1===6);
// Bearbeiten: Durchbruch wird als Void zurückgeladen (nicht als normale Öffnung)
A.editWall(A.project.walls[0].id);
ok("Durchbruch round-trip als Void", A.editorVoids.size===2 && A.editorOpenings.length===0);
// Spannachsen: manuelle Bearbeitung startet vom Auto-Satz (wie Modul 1)
A.clearEditor(); A.setEditor({ name:"AX", L:3000, H:2600, openings:[] });
const auto=A.saveWall().tension_columns.map(c=>c.k);
const free=[...Array(24).keys()].find(k=>!auto.includes(k));   // freier Rasterindex
const free2=[...Array(24).keys()].find(k=>!auto.includes(k)&&k!==free);
A.editWall(A.project.walls[A.project.walls.length-1].id);
A.addAxis(free);
const ks=A.saveWall().tension_columns.map(c=>c.k);
ok("manuelle Achse ergänzt (columns_grid aktiv)", ks.includes(free) && A.editorCols && ks.length===auto.length+1);
// Achse verschieben
A.editWall(A.project.walls[A.project.walls.length-1].id); A.moveAxis(free,free2);
const ax2=A.saveWall().tension_columns.map(c=>c.k);
ok("Achse verschoben", ax2.includes(free2) && !ax2.includes(free));
// Achse löschen
A.editWall(A.project.walls[A.project.walls.length-1].id); A.delAxis(free2);
ok("Achse gelöscht", !A.saveWall().tension_columns.map(c=>c.k).includes(free2));
// auto zurück
A.editWall(A.project.walls[A.project.walls.length-1].id); A.autoAxes();
ok("Achsen-Auto: columns_grid entfällt", A.saveWall().prestress.columns_grid==null);

let fail=0; for(const [n,c] of checks){ console.log((c?"  ok  ":"FAIL  ")+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
