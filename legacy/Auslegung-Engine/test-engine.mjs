import { autoAuslegung, nachweisPruefen } from "./sembla-engine.mjs";
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

const demo=autoAuslegung({...base, load:{qk_area:3.0,gammaQ:1.5}});
console.log("\nOptimierung (qk=3,0): sp="+demo.wandelement.verification.auslegung.max_span_grid+
  " N="+demo.wandelement.verification.auslegung.force_kN+"kN Stränge="+demo.wandelement.verification.auslegung.strands+
  " maßgebend="+demo.wandelement.verification.governing.name+" util="+demo.wandelement.verification.governing.util);
console.log(`${pass} ok, ${fail} fail`); process.exit(fail?1:0);
