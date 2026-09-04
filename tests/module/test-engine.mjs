import { autoAuslegung, nachweisPruefen } from "../../docs/shared/sembla-engine.js";
let pass=0,fail=0; const t=(n,fn)=>{try{fn();pass++;console.log("  ok  "+n);}catch(e){fail++;console.log("FAIL  "+n+"\n        "+e.message);}};
const A=(c,m)=>{if(!c)throw new Error(m||"assert");};
const base={ name:"W", length_mm:2000, height_mm:2600, openings:[], sides:null };

t("niedrige Last -> konvergiert, alle Nachweise ok", ()=>{
  const r=autoAuslegung({...base, load:{qk_area:0.5,gammaQ:1.5}});
  A(r.status==="konvergiert","status "+r.status);
  const v=r.wandelement.verification;
  A(v.nachweise.biegung.ok && v.nachweise.randdruck.ok && v.nachweise.schub.ok, "alle ok");
  A(v.governing && typeof v.governing.util==="number", "maßgebender Nachweis");
});
t("Nachweise: Biegung, Randdruck, Schub vorhanden", ()=>{
  const v=autoAuslegung({...base, load:{qk_area:0.5,gammaQ:1.5}}).wandelement.verification;
  A(v.nachweise.biegung && v.nachweise.randdruck && v.nachweise.schub, "3 Nachweise");
  A(v.nachweise.schub.V_Ed>=0 && v.nachweise.randdruck.sigma_Nmm2>=0, "Werte plausibel");
});
t("N-Optimierung: höhere Last -> höhere Vorspannkraft N", ()=>{
  const lo=autoAuslegung({...base, load:{qk_area:0.5,gammaQ:1.5}}).wandelement.verification.auslegung;
  const hi=autoAuslegung({...base, load:{qk_area:3.0,gammaQ:1.5}}).wandelement.verification.auslegung;
  A(hi.force_kN>lo.force_kN, "N steigt mit Last: "+hi.force_kN+" vs "+lo.force_kN);
});
t("min. Material: kleinste passende Kraft gewählt (Auslastung nahe/<=1)", ()=>{
  const v=autoAuslegung({...base, load:{qk_area:3.0,gammaQ:1.5}}).wandelement.verification;
  A(v.governing.util<=1+1e-9, "util<=1");
  A(v.governing.util>0.5, "nicht massiv überdimensioniert (kleinste Kraft): "+v.governing.util);
});
t("unmögliche Last -> nicht erfüllt", ()=>{
  const r=autoAuslegung({...base, load:{qk_area:20.0,gammaQ:1.5}});
  A(r.status==="nicht erfüllt","status "+r.status);
  A(r.wandelement.verification.governing.util>1,"util>1");
});
t("feste Vorspannkraft -> nur Strangabstand variiert (mehr Stränge bei Last)", ()=>{
  const lo=autoAuslegung({...base, prestress:{force_kN:30}, load:{qk_area:0.5,gammaQ:1.5}});
  const hi=autoAuslegung({...base, prestress:{force_kN:30}, load:{qk_area:3.0,gammaQ:1.5}});
  A(hi.wandelement.tension_columns.length>=lo.wandelement.tension_columns.length, "mehr/gleich Stränge");
});
t("Nachweis-Modus: feste Auslegung wird geprüft", ()=>{
  const bad=nachweisPruefen({...base, prestress:{max_span_grid:3,force_kN:10}, load:{qk_area:1.0,gammaQ:1.5}});
  const good=nachweisPruefen({...base, prestress:{max_span_grid:3,force_kN:60}, load:{qk_area:1.0,gammaQ:1.5}});
  A(bad.nachweis && good.nachweis, "Nachweis-Objekt");
  A(good.nachweis.governing.util < bad.nachweis.governing.util, "mehr Vorspannung -> geringere Auslastung");
});
t("Materialannahmen übersteuerbar (fcd senkt Randdruck-Reserve)", ()=>{
  const r=autoAuslegung({...base, load:{qk_area:0.5,gammaQ:1.5}, material:{fcd_Nmm2:5}});
  A(r.wandelement.verification.material.fcd_Nmm2===5, "fcd übernommen");
});

// ---- [A-10] Bodenblech-Vorratssatz ueberlebt die Auslegungsiteration -------------------
// `psOf` reicht die Prestress-Hardware Feld fuer Feld weiter. Faellt `blech_lengths_mm` dabei
// heraus, greift in JEDER Iteration der Core-Fallback der vollen Standardreihe 375…1250 — die
// Wand haette nach der Auslegung eine andere Blechaufteilung als davor, mit Laengen, die niemand
// gewaehlt hat. Geprueft wird deshalb am Ergebnis der VOLLEN Auslegung, nicht an psOf selbst.
const rasterMasse=(w)=>w.base_plate.teile.map(t=>t.raster_mm);

t("[A-10] gewaehlter Vorratssatz ueberlebt die Auto-Auslegung", ()=>{
  const r=autoAuslegung({...base, length_mm:4500,
    prestress:{blech_lengths_mm:[1250,1000]}, load:{qk_area:0.5,gammaQ:1.5}});
  A(r.status==="konvergiert", "status "+r.status);
  A(JSON.stringify(r.wandelement.prestress.blech_lengths_mm)==="[1250,1000]",
    "Vorratssatz im Wandelement: "+JSON.stringify(r.wandelement.prestress.blech_lengths_mm));
  const m=rasterMasse(r.wandelement);
  A(m.length>0 && m.every(x=>x===1250||x===1000), "nur gewaehlte Rastermaße: "+m.join(","));
  A(m.reduce((a,b)=>a+b,0)===4500, "Teile decken die Wandlaenge: "+m.join("+"));
});

t("[A-10] Aufteilung ist vor und nach der Auslegung dieselbe", ()=>{
  const vorg={...base, length_mm:4500, prestress:{blech_lengths_mm:[1250,1000]},
    load:{qk_area:0.5,gammaQ:1.5}};
  // Vor der Auslegung: derselbe Vorratssatz ohne Iteration (fester Nachweis-Modus).
  const fest=nachweisPruefen({...vorg, prestress:{...vorg.prestress, max_span_grid:3, force_kN:60}});
  const auto=autoAuslegung(vorg);
  A(JSON.stringify(rasterMasse(fest.wandelement))===JSON.stringify(rasterMasse(auto.wandelement)),
    "Aufteilung identisch: "+rasterMasse(fest.wandelement).join(",")+" vs "+rasterMasse(auto.wandelement).join(","));
});

t("[A-10] enger Vorratssatz erzwingt genau seine Laengen (kein Fallback-Blech)", ()=>{
  const r=autoAuslegung({...base, length_mm:3750,
    prestress:{blech_lengths_mm:[1250]}, load:{qk_area:0.5,gammaQ:1.5}});
  A(JSON.stringify(rasterMasse(r.wandelement))==="[1250,1250,1250]",
    "3x1250 statt Fallback-Kombination: "+rasterMasse(r.wandelement).join(","));
});

t("[A-10] ohne Feld gilt unveraendert der Core-Fallback", ()=>{
  const ohne=autoAuslegung({...base, length_mm:4500, load:{qk_area:0.5,gammaQ:1.5}});
  const eng =autoAuslegung({...base, length_mm:4500,
    prestress:{blech_lengths_mm:[1000]}, load:{qk_area:0.5,gammaQ:1.5}});
  // Der Fallback nimmt die groesstmoeglichen Teile der vollen Reihe; der enge Satz kann das nicht.
  A(JSON.stringify(rasterMasse(ohne.wandelement))!==JSON.stringify(rasterMasse(eng.wandelement)),
    "Fallback unterscheidet sich vom engen Satz");
  A(rasterMasse(ohne.wandelement).some(x=>x>1000), "Fallback nutzt Laengen ueber 1000 mm");
});

t("[A-10] Kopfblech-Modulzaehlung haengt weiter allein an blech_mm", ()=>{
  const a=autoAuslegung({...base, length_mm:4000,
    prestress:{blech_mm:1000, blech_lengths_mm:[1250,1000]}, load:{qk_area:0.5,gammaQ:1.5}});
  const b=autoAuslegung({...base, length_mm:4000,
    prestress:{blech_mm:500,  blech_lengths_mm:[1250,1000]}, load:{qk_area:0.5,gammaQ:1.5}});
  A(JSON.stringify(rasterMasse(a.wandelement))===JSON.stringify(rasterMasse(b.wandelement)),
    "Bodenblechteile unveraendert");
  A(b.wandelement.top_plate.module > a.wandelement.top_plate.module,
    "Kopfblech-Module aendern sich: "+a.wandelement.top_plate.module+" -> "+b.wandelement.top_plate.module);
});

const demo=autoAuslegung({...base, load:{qk_area:3.0,gammaQ:1.5}});
console.log("\nOptimierung (qk=3,0): sp="+demo.wandelement.verification.auslegung.max_span_grid+
  " N="+demo.wandelement.verification.auslegung.force_kN+"kN Stränge="+demo.wandelement.verification.auslegung.strands+
  " maßgebend="+demo.wandelement.verification.governing.name+" util="+demo.wandelement.verification.governing.util);
console.log(`${pass} ok, ${fail} fail`); process.exit(fail?1:0);
