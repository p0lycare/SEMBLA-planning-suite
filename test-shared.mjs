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
for(const [name,l,h,ops] of cases){
  const w=buildWall(name,l,h,ops); const b=semblaBom(w);
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
  t(name+" · Positionen = 10 + Stangengruppen",
    semblaBomItems(w).length === 10 + Math.max(1,b.stangenStd.length) + Math.max(1,b.stangenSonder.length));
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
  // Wandelements. Die Summe muss exakt die Core-Gesamtzahl bleiben (keine Doppelzählung,
  // keine Fehlmenge), und je Position muss die reale Modulzahl der Platte stehen.
  const items=semblaBomItems(w);
  const bo=items.find(it=>it.key==='blech_boden'), ko=items.find(it=>it.key==='blech_kopf');
  t(name+" · Blech getrennt (boden+kopf)", !!bo && !!ko && !items.find(it=>it.key==='blech'));
  t(name+" · Blech Summe = Core-Gesamtzahl", bo.menge+ko.menge===w.bom.stahlblech_module);
  t(name+" · Bodenblech = base_plate.module", bo.menge===w.base_plate.module);
  t(name+" · Kopfblech = top_plate.module",  ko.menge===(w.top_plate?w.top_plate.module:0));
  t(name+" · Blech-Split auch in semblaBom", b.stahlblech_module_boden===bo.menge && b.stahlblech_module_kopf===ko.menge);
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
  t("spannplatte_top · Summe = Core-Gesamtzahl", bo.menge+ko.menge===w.bom.stahlblech_module);
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
  const w=buildWall("einbauteile",3000,3000,[new Opening(6,10,4,10,"fenster")],null,
    {rod_lengths_mm:[1000,500],rod_rest_mm:300});
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
console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail?1:0);
