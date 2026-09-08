// Drift-Schutz: die gemeinsame semblaBom() muss mit der Core-BOM übereinstimmen.
import { readFileSync } from "node:fs";
import { buildWall, Opening, wirksameZwischenpunkte } from "./docs/shared/sembla-core.js";
import { einbauteile, semblaBom, semblaBomItems, semblaBomSets } from "./docs/shared/sembla-bom.js";
import { parseKatalog } from "./docs/shared/sembla-katalog.js";
import { stuecklistePositionen } from "./docs/shared/sembla-export.js";

let pass=0, fail=0; const t=(n,c)=>{ if(c)pass++; else { fail++; console.log("FAIL  "+n); } };
const cases=[
  ["ref1_glatt", 1000,2000,[]],
  ["ref2_tuer",  2000,2600,[new Opening(5,11,0,10,"tuer")]],
  ["ref3_fenster",2000,2600,[new Opening(6,10,4,10,"fenster")]],
  ["gross",      4500,2600,[new Opening(4,8,0,10,"tuer"),new Opening(12,16,4,9,"fenster")]],
];
// [A-6]/#71: Die Dichtstreifenpositionen entstehen nur fuer eine ABGEDICHTETE Wand. `buildWall`
// kennt das Merkmal nicht (es haengt nicht am Core) — eine so gebaute Wand traegt kein Feld und
// gilt damit als nicht abgedichtet. Fuer die Positionspruefungen wird es hier ausdruecklich
// gesetzt; der Gegenfall steht als eigener Block am Ende.
const abgedichtet = w => Object.assign(w, { abdichtung: "abgedichtet" });
for(const [name,l,h,ops] of cases){
  const w=abgedichtet(buildWall(name,l,h,ops)); const b=semblaBom(w);
  t(name+" · i3",              b.i3===w.bom.i3);
  t(name+" · i2",              b.i2===w.bom.i2);
  t(name+" · Gewindestangen",  b.gewindestangen_gesamt===w.bom.gewindestangen);
  t(name+" · Kopplung Stoß",   b.verbindungsmuttern===w.bom.verbindungsmuttern);
  t(name+" · Senkkopfschrauben",b.senkkopfschrauben===w.bom.senkkopfschrauben);
  t(name+" · Kopplung Basis",  b.kopplungsmuttern_basis===w.bom.kopplungsmuttern_basis);
  t(name+" · Spannplatten",    b.spannplatten===w.bom.spannplatten);
  t(name+" · Spannmuttern",    b.spannmuttern===w.bom.spannmuttern);
  t(name+" · Stahlblech-Module",b.stahlblech_module===w.bom.stahlblech_module);
  t(name+" · Dichtstreifen mm",b.dichtstreifen_mm===w.bom.dichtstreifen_mm);
  // Positionsliste: 10 feste Positionen + je verwendeter Gewindestangen-Standardlänge und je
  // Sonderzuschnitt-Fertigmaß eine eigene Position ([Z-2]/[Z-4]). Kopplungsmuttern sind
  // bauteilgleich und stehen als EINE Position ([P-18]).
  // 13 feste Positionen (Bodenblech steht nicht mehr darunter; die Unterlegscheibe aus #92 ist
  // das Ausgleichsblech aus #96 die zehnte, Einlegeblech und Mutter aus [A-25]/#93 die elfte
  // und zwoelfte; die Unterlegscheibe aus #92 ist mit der Fachauskunft 2026-09-08 wieder
  // ENTFALLEN) + je Gewindestangengruppe eine + je Bodenblech-Teilgruppe eine
  // ([A-10]: je Standardlänge bzw. je Sonder-Fertigmaß).
  t(name+" · Positionen = 12 + Stangen- und Bodenblechgruppen",
    semblaBomItems(w).length === 12 + Math.max(1,b.stangenStd.length) + Math.max(1,b.stangenSonder.length)
      + b.blech_boden_teile.length);
  // [A-25]/#93 Einlegeblech und Mutter: je GENAU EINE Position, Menge = Zahl der wirksamen
  // Zwischenspannpunkte. Verglichen wird gegen `wirksameZwischenpunkte(w).length` — NICHT gegen
  // eine Ersatzrechnung aus Segment-, Lagen- oder Hoehenzahl; eine solche waere die zweite
  // Mengenquelle aus [P-6]. Gezaehlt wird je (Spannachse, Hoehe), also je real eingebautem Blech.
  t(name+" · Einlegeblech und Mutter = Zahl der wirksamen Zwischenspannpunkte ([A-25])", (()=>{
    const n=wirksameZwischenpunkte(w).length, its=semblaBomItems(w);
    const bl=its.filter(it=>it.key==='einlegeblech'), mu=its.filter(it=>it.key==='zp_mutter');
    return bl.length===1 && mu.length===1 && n>0
      && bl[0].menge===n && mu[0].menge===n
      && bl[0].unit==='Stk' && mu[0].unit==='Stk'
      && !bl[0].nachrichtlich && !mu[0].nachrichtlich
      && bl[0].mass_mm===undefined && bl[0].fertigmass_mm===undefined
      && mu[0].mass_mm===undefined && mu[0].fertigmass_mm===undefined; })());
  t(name+" · semblaBom fuehrt die Punktzahl selbst",
    b.zwischenpunkte===wirksameZwischenpunkte(w).length);
  // Benannte Stelle: hinter der Ankergruppe, VOR der Bodenblechgruppe — damit bleibt die nach
  // [A-18] geprüfte Nachbarschaft Bodenblech -> Ausgleichsblech -> Kopfblech unberührt.
  t(name+" · Einlegeblech und Mutter stehen hinter der Spannplatte, vor dem Bodenblech", (()=>{
    const ks=semblaBomItems(w).map(it=>it.key), i=ks.indexOf('einlegeblech');
    return i>0 && ks[i-1]==='spannplatte' && ks[i+1]==='zp_mutter'
      && (ks[i+2]==='blech_boden' || ks[i+2]==='blech_boden_sonder'); })());
  // Ein Zwischenspannpunkt ist KEIN Anker ([A-16]): die Ankerzaehlung bleibt unberührt.
  t(name+" · Zwischenspannpunkte erhoehen keine Ankermenge ([A-16])",
    b.spannplatten===w.bom.spannplatten && b.spannmuttern===w.bom.spannmuttern);
  // [A-18]/#96 Ausgleichsblech: GENAU EINE Position, Menge = Laenge der vom Kern gerechneten
  // Punktliste. Verglichen wird gegen `w.ausgleichspunkte.length` — NICHT gegen eine
  // Ersatzrechnung aus der Wandlaenge; eine solche waere die zweite Mengenquelle aus [P-6].
  t(name+" · Ausgleichsblech = Zahl der Ausgleichspunkte ([A-18])", (()=>{
    const a=semblaBomItems(w).filter(it=>it.key==='ausgleichsblech');
    return a.length===1 && a[0].unit==='Stk' && a[0].menge===w.ausgleichspunkte.length
      && a[0].menge>0 && !a[0].nachrichtlich && a[0].mass_mm===undefined
      && a[0].fertigmass_mm===undefined; })());
  t(name+" · semblaBom fuehrt die Punktzahl selbst", b.ausgleichspunkte===w.ausgleichspunkte.length);
  // M6: benannte Stelle — hinter der Bodenblechgruppe, vor dem Kopfblech.
  t(name+" · Ausgleichsblech steht hinter dem Bodenblech und vor dem Kopfblech", (()=>{
    const ks=semblaBomItems(w).map(it=>it.key), i=ks.indexOf('ausgleichsblech');
    return i>0 && ks[i+1]==='blech_kopf'
      && (ks[i-1]==='blech_boden' || ks[i-1]==='blech_boden_sonder'); })());
  // KEINE Unterlegscheibe (Fachauskunft 2026-09-08, hebt #92 auf): am normalen Wandabschluss
  // gibt es sie am Spannglied nicht, die Spannmutter sitzt unmittelbar auf der Spannplatte.
  // Ersatzlos entfallen — NICHT mit Menge 0 gefuehrt ([P-14]).
  t(name+" · keine Unterlegscheiben-Position (hebt #92 auf)", (()=>{
    const its=semblaBomItems(w);
    return !its.some(it=>it.key==='unterlegscheibe')
      && !its.some(it=>/Unterlegscheibe/i.test(it.label||'')); })());
  // Die Spannmutternzahl ist davon UNBERUEHRT: eine je Spannplatte plus die Muttern, die
  // unmittelbar auf dem Kopfblech sitzen.
  t(name+" · Spannmutternzahl unberuehrt", (()=>{
    const s=semblaBomItems(w).filter(it=>it.key==='spannmutter');
    return s.length===1 && s[0].menge===w.bom.spannmuttern
      && s[0].menge>=w.bom.spannplatten; })());
  // [P-18] Kopplungsmutter: eine Position, Menge = Stangenstöße + Fußkopplungen.
  t(name+" · Kopplungsmutter als EINE Position mit Gesamtmenge", (()=>{
    const its=semblaBomItems(w), k=its.filter(it=>it.key==='kupplung');
    return k.length===1 && !its.find(it=>it.key==='kuppl_basis')
      && k[0].menge===b.verbindungsmuttern+b.kopplungsmuttern_basis; })());
  // Die Einbaumenge bleibt unverändert: Summe aller Stangenpositionen = Core-Gesamtzahl.
  t(name+" · Stangenpositionen summieren zur Core-Zahl",
    semblaBomItems(w).filter(it=>it.key==='rod_std'||it.key==='rod_sonder')
      .reduce((a,it)=>a+it.menge,0)===w.bom.gewindestangen);
  // Jede Stangenposition trägt ihr eigenes maßgebendes Maß -> in Modul 4 eindeutig bepreisbar.
  t(name+" · jede Stangenposition hat mass_mm",
    semblaBomItems(w).filter(it=>it.key==='rod_std'||it.key==='rod_sonder').every(it=>+it.mass_mm>0));
  t(name+" · Dichtstreifen-Stück = Stoßfugen", semblaBomItems(w).find(it=>it.key==='dicht_stk').menge===w.bom.stossfugen);
  t(name+" · rodStd+Sonder = gesamt", b.rodStd+b.rodSonder===b.gewindestangen_gesamt);
  // [A-1]: Boden-/Kopfblech getrennt bepreisbar — abgeleitet aus den REALEN Platten des
  // Wandelements. Das BODENBLECH ist seit #91 keine Modulzählung mehr, sondern die reale
  // Teilliste des Rechenkerns ([A-10]…[A-12]): geprüft wird die ABLEITUNG selbst, nicht eine
  // nachgerechnete Zahl — je Standardlänge bzw. Sonder-Fertigmaß genau eine Position, mit
  // Rastermaß als `mass_mm` und Bauteilmaß als `fertigmass_mm`.
  const items=semblaBomItems(w);
  const boAlle=items.filter(it=>it.key==='blech_boden'||it.key==='blech_boden_sonder');
  const ko=items.find(it=>it.key==='blech_kopf');
  t(name+" · Blech getrennt (boden+kopf)", boAlle.length>0 && !!ko && !items.find(it=>it.key==='blech'));
  t(name+" · keine Bodenblech-Modulzählung mehr", !items.some(it=>/Bodenblech-Modul/.test(it.label)));
  t(name+" · Bodenblech: Position je Teilgruppe des Kerns", (()=>{
    const gr=new Map();
    for(const tl of w.base_plate.teile){
      const k=(tl.art==='sonder'?'blech_boden_sonder':'blech_boden')+'@'+tl.raster_mm;
      gr.set(k,(gr.get(k)||0)+1); }
    return boAlle.length===gr.size
      && boAlle.every(it=>gr.get(it.key+'@'+it.mass_mm)===it.menge); })());
  t(name+" · Bodenblech: Rastermaß als mass_mm, Bauteilmaß (−2 mm) als fertigmass_mm",
    boAlle.every(it=>it.mass_mm>0 && it.fertigmass_mm===it.mass_mm-2));
  t(name+" · Bodenblech: Summe der Rastermaße = Wandlänge",
    w.base_plate.teile.reduce((a,tl)=>a+tl.raster_mm,0)===w.length_mm
      && boAlle.reduce((a,it)=>a+it.menge*it.mass_mm,0)===w.length_mm);
  t(name+" · Bodenblech: kein Stoß auf einem Steinstoß der untersten Lage ([A-11])", (()=>{
    const fugen=new Set(w.courses[0].joints_grid); let x=0;
    return w.base_plate.teile.every(tl=>{ x+=tl.raster_mm;
      return x>=w.length_mm || !fugen.has(x/125); })
      && w.validation.blech_konflikte.length===0; })());
  t(name+" · Kopfblech = top_plate.module",  ko.menge===(w.top_plate?w.top_plate.module:0));
  t(name+" · Aggregat = Bodenblechteile + Kopfblechmodule",
    boAlle.reduce((a,it)=>a+it.menge,0)+ko.menge===w.bom.stahlblech_module);
  t(name+" · Blech-Split auch in semblaBom",
    b.stahlblech_module_boden===boAlle.reduce((a,it)=>a+it.menge,0) && b.stahlblech_module_kopf===ko.menge);
  // [A-6]: Dichtstreifen-Gesamtlänge ist nachrichtlich (nie bepreist) — die Einbauposition nicht.
  t(name+" · Dicht-Gesamtlänge nachrichtlich", items.find(it=>it.key==='dicht').nachrichtlich===true
    && !items.find(it=>it.key==='dicht_stk').nachrichtlich);
}

// Oberer Anschluss „Spannplatte": kein Kopfblech -> Kopfblech-Position bleibt 0 (und wird nicht
// still weggelassen), Bodenblech unverändert, Summe weiter gleich der Core-Gesamtzahl.
{
  const w=buildWall("spannplatte_top",2000,2600,[],null,{top_connection:"spannplatte"});
  const items=semblaBomItems(w);
  const bo=items.find(it=>it.key==='blech_boden'), ko=items.find(it=>it.key==='blech_kopf');
  t("spannplatte_top · top_plate ist null", w.top_plate===null);
  t("spannplatte_top · Kopfblech-Position = 0", ko.menge===0);
  t("spannplatte_top · Bodenblech > 0", bo.menge>0);
  t("spannplatte_top · Summe = Core-Gesamtzahl",
    items.filter(it=>it.key==='blech_boden'||it.key==='blech_boden_sonder')
      .reduce((a,it)=>a+it.menge,0)+ko.menge===w.bom.stahlblech_module);
}

// Alt-Bundle ohne base_plate/top_plate: der Split wird aus Wandlänge/Modullänge nachgerechnet,
// die Summe bleibt exakt die gespeicherte Core-Gesamtzahl (kein Verlust, keine Doppelzählung).
{
  const w=buildWall("alt_bundle",4000,2600,[]);
  const alt=JSON.parse(JSON.stringify(w)); delete alt.base_plate; delete alt.top_plate;
  const items=semblaBomItems(alt);
  const bo=items.find(it=>it.key==='blech_boden'), ko=items.find(it=>it.key==='blech_kopf');
  t("alt_bundle · Summe = gespeicherte Gesamtzahl", bo.menge+ko.menge===w.bom.stahlblech_module);
  t("alt_bundle · Bodenblech = ceil(L/Modul)", bo.menge===Math.ceil(alt.length_mm/alt.prestress.blech_mm));
  // [P-19] Auch das Alt-Bundle bekommt Einbauteile: die IDs werden abgeleitet, nicht gespeichert.
  t("alt_bundle · Einbauteile = Stangenzahl der Positionen", (()=>{
    const rod=items.filter(it=>it.key.startsWith('rod_'));
    return einbauteile(alt).length===rod.reduce((a,it)=>a+it.menge,0); })());
}

// ---- [A-18]/#96 Ausgleichsblech: Nullfall und Additivität -------------------------------
// Ein gespeichertes Wandelement VOR #96 kennt das Feld `ausgleichspunkte` nicht. Dann ist die
// Menge 0 — es wird nichts nachgerechnet und keine Punktzahl erfunden ([P-9]); die Zeile bleibt
// aber stehen, statt still zu verschwinden (wie das Kopfblech bei Menge 0). Und: die neue
// Position ist rein ADDITIV — jede uebrige Position bleibt bitgenau gleich.
{
  const w=buildWall("ausgleich_alt",3250,2600,[]);
  const alt=JSON.parse(JSON.stringify(w)); delete alt.ausgleichspunkte;
  const iVoll=semblaBomItems(w), iAlt=semblaBomItems(alt);
  const ag=iAlt.find(it=>it.key==='ausgleichsblech');
  t("A-18 · 3,25-m-Wand: zehn Punkte, zehn Bleche",
    w.ausgleichspunkte.length===10
    && iVoll.find(it=>it.key==='ausgleichsblech').menge===10);
  t("A-18 · ohne Feld `ausgleichspunkte`: Menge 0 statt geratener Zahl",
    !!ag && ag.menge===0 && semblaBom(alt).ausgleichspunkte===0);
  t("A-18 · uebrige Positionen bitgenau gleich (rein additiv)", (()=>{
    const strip=its=>JSON.stringify(its.filter(it=>it.key!=='ausgleichsblech'));
    return strip(iAlt)===strip(iVoll) && strip(iVoll).length>0; })());
  t("A-18 · Positionszahl unterscheidet sich nicht (die Zeile bleibt stehen)",
    iAlt.length===iVoll.length);
}
// ---- [A-25]/#93 Einlegeblech und Mutter: Nullfall und Additivität -----------------------
// Die Menge kommt allein aus `wirksameZwischenpunkte()`. Ein Wandelement OHNE Zwischenspannpunkte
// — hier: ein ausdruecklich leerer Override nach [A-17] sowie ein Altbestand ohne
// `tension_columns` — fuehrt beide Positionen mit der Menge 0 statt einer geratenen Zahl ([P-9]);
// die Zeilen bleiben stehen, statt still zu verschwinden. Und: die neuen Positionen sind rein
// ADDITIV — jede uebrige Position bleibt bitgenau gleich.
{
  const ZP=new Set(['einlegeblech','zp_mutter']);
  const w=buildWall("zp_auto",3250,2600,[]);
  // Ausdruecklich leerer Override ([A-17]): „keine Zwischenspannpunkte" — kein Rueckfall auf Auto.
  const leer=buildWall("zp_leer",3250,2600,[],null,{ zwischenpunkte_mm: [] });
  const alt=JSON.parse(JSON.stringify(w)); delete alt.tension_columns;
  const iVoll=semblaBomItems(w), iLeer=semblaBomItems(leer), iAlt=semblaBomItems(alt);
  const nVoll=wirksameZwischenpunkte(w).length;
  t("A-25 · Auto-Stand: beide Positionen tragen die wirksame Punktzahl", nVoll>0
    && iVoll.find(it=>it.key==='einlegeblech').menge===nVoll
    && iVoll.find(it=>it.key==='zp_mutter').menge===nVoll);
  t("A-25 · leerer Override ([A-17]): Menge 0 statt geratener Zahl", (()=>{
    const bl=iLeer.find(it=>it.key==='einlegeblech'), mu=iLeer.find(it=>it.key==='zp_mutter');
    return !!bl && !!mu && bl.menge===0 && mu.menge===0
      && semblaBom(leer).zwischenpunkte===0 && wirksameZwischenpunkte(leer).length===0; })());
  t("A-25 · ohne `tension_columns` (Altbestand): Menge 0 statt geratener Zahl", (()=>{
    const bl=iAlt.find(it=>it.key==='einlegeblech'), mu=iAlt.find(it=>it.key==='zp_mutter');
    return !!bl && !!mu && bl.menge===0 && mu.menge===0
      && semblaBom(alt).zwischenpunkte===0; })());
  t("A-25 · Positionszahl unterscheidet sich nicht (die Zeilen bleiben stehen)",
    iAlt.length===iVoll.length && iLeer.length===iVoll.length);
  // Der Override aendert die Zwischenpunkte — und NUR sie. Verglichen wird deshalb gegen den
  // Auto-Stand derselben Wand: jede uebrige Position muss bitgenau gleich bleiben.
  t("A-25 · uebrige Positionen bitgenau gleich (rein additiv)", (()=>{
    const strip=its=>JSON.stringify(its.filter(it=>!ZP.has(it.key)).map(it=>({...it, wand:null})));
    return strip(iLeer)===strip(iVoll) && strip(iVoll).length>0; })());
  // Der Override beruehrt die Ankerzaehlung nicht ([A-16]) — die Core-BOM bleibt gleich.
  t("A-25 · leerer Override laesst die Core-Ankermengen unverändert",
    leer.bom.spannplatten===w.bom.spannplatten && leer.bom.spannmuttern===w.bom.spannmuttern
    && leer.bom.gewindestangen===w.bom.gewindestangen);
}
// ---- [P-19] Einbauteil-Identität der Gewindestangenstücke -------------------------------
// Die Einbauteilliste ist die EINZIGE Stückableitung; die Stücklistenmengen sind ihre
// Aggregation. Geprueft wird beides gegen die Core-Zahl und gegeneinander.
{
  // Fixture mit Standardteil (zwei Standardlaengen), ZWEI verschiedenen Sonderzuschnittlaengen
  // und Reststueck ([Z-6]) — konfliktfrei, damit kein Segment ohne Zuschnitt bleibt.
  const w=abgedichtet(buildWall("einbauteile",3000,3000,[new Opening(6,10,4,10,"fenster")],null,
    {rod_lengths_mm:[1000,500],rod_rest_mm:300}));
  const teile=einbauteile(w), items=semblaBomItems(w);
  const rod=items.filter(it=>it.key.startsWith('rod_'));
  t("P-19 · Einbauteile = Core-Gesamtzahl der Gewindestangen", teile.length===w.bom.gewindestangen);
  t("P-19 · keine Zuschnittkonflikte im Fixture", (w.validation.zuschnitt_konflikte||[]).length===0);
  t("P-19 · IDs sind eindeutig", new Set(teile.map(x=>x.id)).size===teile.length);
  t("P-19 · ID-Schema GS-k<Achse>.<Segment>.<Stueck>",
    teile.every(x=>x.id===`GS-k${x.k}.${x.segment}.${x.stueck}`)
    && teile.every(x=>/^GS-k\d+\.\d+\.\d+$/.test(x.id)));
  t("P-19 · jedes Teil hat Kategorie, Art, Fertigmass und Wandreferenz",
    teile.every(x=>x.kategorie==='gewindestange' && ['standard','sonder','rest'].includes(x.art)
      && x.fertigmass_mm>0 && x.wand==='einbauteile'));
  t("P-19 · Standardteil und mindestens zwei Sonderlaengen vorhanden", (()=>{
    const so=new Set(teile.filter(x=>x.art==='sonder').map(x=>x.fertigmass_mm));
    return teile.some(x=>x.art==='standard') && so.size>=2 && teile.some(x=>x.art==='rest'); })());
  t("P-19 · Aggregation: Menge je Position = Anzahl ihrer IDs",
    rod.length>0 && rod.every(it=>it.ids.length===it.menge));
  t("P-19 · Aggregation verliert kein Einzelteil",
    rod.flatMap(it=>it.ids).sort().join()===teile.map(x=>x.id).sort().join());
  t("P-19 · gleichartige Fertigteile in EINER Position (Art + Fertigmass eindeutig)",
    new Set(rod.map(it=>it.art+':'+it.fertigmass_mm)).size===rod.length);
  t("P-19 · Art, Symbol und Fertigmass an jeder Stangenposition",
    rod.every(it=>it.art && it.art_symbol && it.art_label && it.fertigmass_mm===it.mass_mm));
  t("P-19 · Sonderzuschnitt traegt Fertiglaenge und IDs",
    rod.filter(it=>it.art==='sonder').every(it=>it.fertigmass_mm>0 && it.ids.length===it.menge));
  t("P-19 · Wandreferenz an JEDER Position (auch ohne Einzelteil-ID)",
    items.every(it=>it.wand==='einbauteile'));
  t("P-19 · keine erfundene Einzel-ID fuer Steine/Muttern/Bleche/Dichtstreifen",
    items.filter(it=>!it.key.startsWith('rod_')).every(it=>!it.ids && !it.art));
  // Ein VORHANDENES, aber leeres `stuecke` ist ein gemeldeter Konflikt ([Z-6]) — dafuer darf
  // kein Ersatz-Einbauteil entstehen.
  const leer=JSON.parse(JSON.stringify(w));
  leer.tension_columns[0].segments[0].stuecke=[];
  t("P-19 · leeres stuecke erzeugt kein Ersatz-Einbauteil",
    einbauteile(leer).length===teile.length-w.tension_columns[0].segments[0].stuecke.length);
  t("P-19 · Ableitung ist deterministisch (zweimal gleich)",
    JSON.stringify(einbauteile(w))===JSON.stringify(einbauteile(w)));
}
// ---- [A-6]/#71 Abdichtung je Wand ------------------------------------------------------
// Die Abdichtung entscheidet AUSSCHLIESSLICH ueber die beiden Dichtstreifenpositionen. Alles
// andere — Mengen des Rechenkerns, uebrige Positionen, deren Reihenfolge und Inhalt — muss
// zwischen abgedichteter und nicht abgedichteter Wand bitgenau gleich bleiben.
{
  const roh=buildWall("abdicht",2000,2600,[new Opening(5,11,0,10,"tuer")]);
  const ohne=JSON.parse(JSON.stringify(roh));                       // kein Feld -> nicht abgedichtet
  const mit=Object.assign(JSON.parse(JSON.stringify(roh)),{abdichtung:"abgedichtet"});
  const nein=Object.assign(JSON.parse(JSON.stringify(roh)),{abdichtung:"nicht_abgedichtet"});
  const iOhne=semblaBomItems(ohne), iMit=semblaBomItems(mit), iNein=semblaBomItems(nein);
  const dichtKeys=its=>its.filter(it=>it.key==='dicht'||it.key==='dicht_stk').map(it=>it.key);
  t("A-6 · ohne Feld: keine Dichtstreifenposition (sicherer Standard)", dichtKeys(iOhne).length===0);
  t("A-6 · ausdruecklich nicht abgedichtet: keine Dichtstreifenposition", dichtKeys(iNein).length===0);
  t("A-6 · abgedichtet: beide Dichtstreifenpositionen", dichtKeys(iMit).join()==='dicht_stk,dicht');
  // Unbekannter Wert bringt NIE Material in die Liste (striktes Opt-in).
  t("A-6 · unbekannter Wert gilt als nicht abgedichtet",
    dichtKeys(semblaBomItems(Object.assign(JSON.parse(JSON.stringify(roh)),{abdichtung:"ja"}))).length===0);
  t("A-6 · Mengen des Rechenkerns bleiben unabhaengig von der Abdichtung",
    semblaBom(ohne).dichtstreifen_mm===semblaBom(mit).dichtstreifen_mm
    && semblaBom(ohne).stossfugen===semblaBom(mit).stossfugen
    && semblaBom(mit).dichtstreifen_mm===roh.bom.dichtstreifen_mm);
  t("A-6 · Dichtstreifen stehen an unveraenderter Stelle (nach blech_kopf, am Listenende)",
    iMit.map(it=>it.key).slice(-3).join()==='blech_kopf,dicht_stk,dicht');
  t("A-6 · alle uebrigen Positionen bitgenau gleich", (()=>{
    const strip=its=>JSON.stringify(its.filter(it=>it.key!=='dicht'&&it.key!=='dicht_stk'));
    return strip(iMit)===strip(iOhne) && strip(iNein)===strip(iOhne); })());
  t("A-6 · abgedichtete Positionen unveraendert (Menge, Einheit, nachrichtlich)", (()=>{
    const stk=iMit.find(it=>it.key==='dicht_stk'), ges=iMit.find(it=>it.key==='dicht');
    return stk.unit==='Stk' && stk.menge===roh.bom.stossfugen && !stk.nachrichtlich
      && ges.unit==='m' && ges.menge===+((roh.bom.dichtstreifen_mm/1000).toFixed(2))
      && ges.nachrichtlich===true; })());
  t("A-6 · Positionszahl unterscheidet sich um genau zwei", iMit.length===iOhne.length+2);
}
// ---- [P-23]/#94 Baugruppen-Aufloesung am ECHTEN Pfad ------------------------------------
// Gefahren wird der reale Weg: Repo-Vorlage einlesen -> `parseKatalog` -> `buildWall` ->
// `semblaBomItems(w, katalog)` und `stuecklistePositionen(w, eingaben, katalog)`. Verglichen
// wird Position fuer Position gegen den Aufruf OHNE Katalog: die Aufloesung darf die
// ausgewiesene Menge NICHT bewegen (keine Doppelzaehlung, keine erfundene Menge).
{
  const KAT = parseKatalog(readFileSync(new URL("./docs/vorlagen/SEMBLA_Standardkatalog.json",
    import.meta.url), "utf8"));
  const EING = {};   // Mengen haengen nicht an der Produktwahl; Preise sind hier nicht Gegenstand
  const spur = its => JSON.stringify(its.map(it => [it.key, it.mass_mm ?? null,
    it.fertigmass_mm ?? null, it.menge]));

  t("P-23 · Vorlage traegt Katalogformat v2 und die zwei Baugruppen der oberen Ausfuehrung",
    KAT.version === 2 && KAT.sets.length === 2
    && KAT.sets.map(x => x.id).join() === "set-wandabschluss,set-deckenanschluss"
    && KAT.sets[0].name === "Wandabschluss" && KAT.sets[1].name === "Deckenanschluss");
  t("P-23 · die Baugruppe fuehrt je eine Rollenposition mit Menge 1",
    JSON.stringify(KAT.sets[0].positionen)
      === JSON.stringify([{ rolle: "spannplatte", menge: 1 },
                          { rolle: "spannmutter", menge: 1 }]));
  // [P-24]/#95: Die Bauteilliste des Deckenanschlusses ist eine FACHVORGABE (2026-09-08) und steht
  // hier Position fuer Position — Reihenfolge, Verwendungsstelle und Menge je Anschlusspunkt.
  // Spannplatte und Spannmutter stehen in BEIDEN Baugruppen (Mehrfachverwendung, [P-21]).
  t("P-24 · Baugruppe „Deckenanschluss“ fuehrt genau die verbindlich genannten Teile",
    JSON.stringify(KAT.sets[1].positionen)
      === JSON.stringify([{ rolle: "spannplatte", menge: 1 },
                          { rolle: "spannmutter", menge: 1 },
                          { rolle: "dc_winkel_wand", menge: 1 },
                          { rolle: "dc_winkel_decke", menge: 1 },
                          { rolle: "dc_schraube", menge: 2 },
                          { rolle: "dc_scheibe", menge: 2 },
                          { rolle: "dc_anker", menge: 2 },
                          { rolle: "dc_bohrschraube", menge: 2 },
                          { rolle: "dc_scheibe_bohr", menge: 2 }]));

  const ohneSets = { ...KAT, sets: [] };
  // Auch eine Wand mit KOPFBLECH ist dabei: dort gibt es keine Spannplatte und damit keine
  // Baugruppe, die Spannmutter sitzt aber unmittelbar auf dem Blech und bleibt flacher Rest.
  const faelle = [
    ["glatt",   buildWall("set_glatt", 2000, 2600, [])],
    ["tuer",    buildWall("set_tuer", 2500, 2600, [new Opening(5, 11, 0, 10, "tuer")])],
    ["staffel", buildWall("set_staffel", 4500, 2600,
      [new Opening(4, 8, 0, 10, "tuer"), new Opening(12, 16, 4, 9, "fenster")])],
    ["kopfblech", buildWall("set_blech", 2000, 2600, [], null, { top_connection: "blech" })],
  ];
  for (const [nm, w] of faelle) {
    const flach = semblaBomItems(w), auf = semblaBomItems(w, KAT);
    t("P-23 · " + nm + " · Stueckliste mit Baugruppen ist mengengleich (Position fuer Position)",
      spur(flach) === spur(auf));
    t("P-23 · " + nm + " · keine neue und keine verlorene Position",
      flach.length === auf.length && flach.map(x => x.key).join() === auf.map(x => x.key).join());
    // Der Kern der Regel: die Einzelteile stehen je EINMAL, mit exakt der Kernmenge. Seit der
    // Fachauskunft 2026-09-08 sind es ZWEI (Platte und Mutter) — die Unterlegscheibe aus #92
    // gibt es am Wandabschluss nicht und sie darf auch aus der Baugruppe nicht auftauchen.
    t("P-23 · " + nm + " · Spannplatte und Spannmutter je genau einmal, keine Scheibe", (() => {
      const je = k => auf.filter(it => it.key === k);
      return ["spannplatte", "spannmutter"].every(k => je(k).length === 1)
        && je("spannplatte")[0].menge === w.bom.spannplatten
        && je("spannmutter")[0].menge === w.bom.spannmuttern
        && je("unterlegscheibe").length === 0; })());
    // Instanzzahl ausschliesslich aus dem unveraenderten Rechenkern.
    // [P-24]/#95: Der Deckenanschluss hat in DIESEM Stand noch keine Einbaustelle im Rechenkern
    // (die Verteilung der Anschlusspunkte folgt als eigenes Paket). Er bleibt deshalb
    // ausdruecklich UNAUFGELOEST und wird BENANNT gemeldet — genau eine Instanz (Wandabschluss),
    // genau eine Meldung, und keine einzige ausgewiesene Menge bewegt sich dadurch.
    t("P-23 · " + nm + " · Instanzzahl = bom.spannplatten", (() => {
      const st = semblaBomSets(w, KAT), i = st.instanzen[0];
      return st.instanzen.length === 1 && i.feld === "spannplatten"
        && i.anzahl === w.bom.spannplatten; })());
    t("P-24 · " + nm + " · Deckenanschluss ohne Einbaustelle: benannt gemeldet, nichts geraten",
      (() => {
        const st = semblaBomSets(w, KAT);
        return st.meldungen.length === 1 && /Deckenanschluss/.test(st.meldungen[0])
          && /Instanzquelle/.test(st.meldungen[0])
          && !st.instanzen.some(i => i.set === "set-deckenanschluss")
          && !st.positionen.some(x => x.set === "set-deckenanschluss"); })());
    // Ein Katalog OHNE Baugruppen ergibt bitgenau den Stand ohne Baugruppen.
    t("P-23 · " + nm + " · Katalog ohne Baugruppen = Stand ohne Baugruppen (bitgenau)",
      JSON.stringify(semblaBomItems(w, ohneSets)) === JSON.stringify(flach));
    t("P-23 · " + nm + " · ohne Katalog bleibt der Rueckgabewert bitgleich",
      JSON.stringify(semblaBomItems(w)) === JSON.stringify(flach));
    // Derselbe Weg durch `stuecklistePositionen` — Modul 4 und der zentrale Export.
    const pMit = stuecklistePositionen(w, EING, KAT), pOhne = stuecklistePositionen(w, EING, ohneSets);
    // `stuecklistePositionen` fuehrt kein `mass_mm` mit (nur `fertigmass_mm`) — verglichen
    // werden deshalb Schluessel, Fertigmass und Menge.
    const spurP = its => JSON.stringify(its.map(it => [it.key, it.fertigmass_mm ?? null, it.menge]));
    t("P-23 · " + nm + " · stuecklistePositionen reicht den Katalog durch und bleibt mengengleich",
      spurP(pMit) === spurP(pOhne)
      && spurP(pMit) === spurP(flach.filter(it => !["latte", "verbinder", "beplankung"].includes(it.key))));
  }

  // Kopfblech-Gegenprobe: keine Baugruppe, die Spannmutter bleibt trotzdem vollstaendig stehen.
  {
    const w = faelle[3][1], st = semblaBomSets(w, KAT);
    const mu = semblaBomItems(w, KAT).find(it => it.key === "spannmutter");
    t("P-23 · Kopfblech: keine Baugruppen-Instanz, Spannmutter bleibt flacher Rest",
      w.bom.spannplatten === 0 && st.instanzen[0].anzahl === 0 && st.positionen.length === 0
      && mu.menge === w.bom.spannmuttern && mu.menge > 0
      // einzige Meldung ist die des noch nicht gerechneten Deckenanschlusses ([P-24])
      && st.meldungen.length === 1 && /Deckenanschluss/.test(st.meldungen[0]));
  }

  // Unbekannte Verwendungsrolle: BENANNT gemeldet, und keine Position bekommt eine geratene
  // Menge — die Liste bleibt die ohne Baugruppen.
  {
    const w = faelle[0][1];
    const kaputt = { ...KAT, sets: [{ id: "set-wandabschluss", name: "Wandabschluss",
      positionen: [{ rolle: "gibtsnicht", menge: 1 }, { rolle: "spannplatte", menge: 1 }] }] };
    const st = semblaBomSets(w, kaputt);
    t("P-23 · unbekannte Verwendungsrolle wird benannt gemeldet",
      st.meldungen.length === 1 && /gibtsnicht/.test(st.meldungen[0])
      && /keine Position/.test(st.meldungen[0]));
    t("P-23 · unbekannte Rolle erzeugt keine geratene Menge und keine Position",
      st.positionen.length === 1 && st.positionen[0].key === "spannplatte"
      && spur(semblaBomItems(w, kaputt)) === spur(semblaBomItems(w)));
    // Eine Baugruppe ohne bekannte Instanzquelle bleibt unaufgeloest — und wird gesagt.
    const fremd = { ...KAT, sets: [{ id: "set-irgendwas", name: "Irgendwas",
      positionen: [{ rolle: "spannplatte", menge: 1 }] }] };
    const stF = semblaBomSets(w, fremd);
    t("P-23 · Baugruppe ohne bekannte Instanzquelle: gemeldet, nichts geraten",
      stF.instanzen.length === 0 && stF.positionen.length === 0
      && stF.meldungen.length === 1 && /Irgendwas/.test(stF.meldungen[0])
      && JSON.stringify(semblaBomItems(w, fremd)) === JSON.stringify(semblaBomItems(w)));
    // Fordert eine Baugruppe mehr, als der Rechenkern fuehrt: die gerechnete Menge gilt.
    const zuviel = { ...KAT, sets: [{ id: "set-wandabschluss", name: "Wandabschluss",
      positionen: [{ rolle: "spannplatte", menge: 3 }] }] };
    t("P-23 · Ueberforderung: ausgewiesen bleibt die gerechnete Menge, Abweichung benannt", (() => {
      const st2 = semblaBomSets(w, zuviel);
      const pl = semblaBomItems(w, zuviel).find(it => it.key === "spannplatte");
      return pl.menge === w.bom.spannplatten && st2.meldungen.length === 1
        && /gerechnete/.test(st2.meldungen[0]); })());
  }
}
console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail?1:0);
