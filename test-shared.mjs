// Drift-Schutz: die gemeinsame semblaBom() muss mit der Core-BOM übereinstimmen.
import { buildWall, Opening } from "./docs/shared/sembla-core.js";
import { einbauteile, semblaBom, semblaBomItems } from "./docs/shared/sembla-bom.js";

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
  // 9 feste Positionen (Bodenblech steht nicht mehr darunter) + je Gewindestangengruppe eine
  // + je Bodenblech-Teilgruppe eine ([A-10]: je Standardlänge bzw. je Sonder-Fertigmaß).
  t(name+" · Positionen = 9 + Stangen- und Bodenblechgruppen",
    semblaBomItems(w).length === 9 + Math.max(1,b.stangenStd.length) + Math.max(1,b.stangenSonder.length)
      + b.blech_boden_teile.length);
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
console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail?1:0);
