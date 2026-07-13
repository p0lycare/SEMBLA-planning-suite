import { readFileSync } from "node:fs";
import { layoutToBattens, battenCutListCsv, daemmungCsv } from "./sembla-latten.mjs";
let pass=0,fail=0; const t=(n,fn)=>{try{fn();pass++;console.log("  ok  "+n);}catch(e){fail++;console.log("FAIL  "+n+"\n        "+e.message);}};
const A=(c,m)=>{if(!c)throw new Error(m||"assert");};
const L2=JSON.parse(readFileSync("./layout_ref2.json","utf8"));   // Tür
const L3=JSON.parse(readFileSync("./layout_ref3.json","utf8"));   // Fenster
const r2=layoutToBattens(L2), r3=layoutToBattens(L3);

function connSet(layout,x){ return new Set(layout.points.filter(p=>Math.abs(p.x_cm-x)<1e-6).map(p=>+p.y_cm.toFixed(2))); }

t("keine Latte überbrückt eine Öffnung (Tür & Fenster)", ()=>{
  for(const [layout,res] of [[L2,r2],[L3,r3]])
    for(const a of res.axes){
      const act=layout.openings_cm.filter(o=>a.x_cm>o.x0+1e-6 && a.x_cm<o.x1-1e-6);
      for(const s of a.segments) for(const o of act)
        A(!(s.y0_cm < o.y1-1e-6 && s.y1_cm > o.y0+1e-6), `Latte ${s.y0_cm}-${s.y1_cm} @x${a.x_cm} überlappt Öffnung ${o.y0}-${o.y1}`);
    }
});

t("Fensterachse 87,5: Latten nur unter (≤80) und über (≥200) dem Fenster", ()=>{
  const ax=r3.axes.find(a=>Math.abs(a.x_cm-87.5)<1e-6); A(ax,"Achse 87,5 fehlt");
  A(ax.segments.length>0,"keine Segmente");
  for(const s of ax.segments) A(s.y1_cm<=80+1e-6 || s.y0_cm>=200-1e-6, `Segment ${s.y0_cm}-${s.y1_cm} liegt im Fenster`);
});

t("innere Stöße liegen NICHT auf einem Verbinder", ()=>{
  for(const [layout,res] of [[L2,r2],[L3,r3]])
    for(const a of res.axes){ const cs=connSet(layout,a.x_cm);
      for(let k=0;k<a.segments.length-1;k++){
        const j=a.segments[k].y1_cm;
        if(Math.abs(j-a.segments[k+1].y0_cm)<1e-6)  // gemeinsamer (innerer) Stoß
          A(!cs.has(+j.toFixed(2)), `Stoß bei y=${j} @x${a.x_cm} liegt auf Verbinder`);
      }
    }
});

t("jedes Segment hat mindestens eine Fixierung", ()=>{
  for(const res of [r2,r3]) for(const a of res.axes) for(const s of a.segments) A(s.fixings>=1, "fixings "+s.fixings);
});
t("kein Segment länger als Lattenlänge", ()=>{
  for(const res of [r2,r3]) for(const a of res.axes) for(const s of a.segments) A(s.len_cm<=150+1e-6, "len "+s.len_cm);
});
t("Bedarf-Schranken & Verschnitt-Bilanz", ()=>{
  for(const res of [r2,r3]){ const s=res.summary;
    A(s.latten_15m_bedarf<=s.latten_stuecke,"Bedarf<=Stücke");
    A(Math.abs(s.latten_15m_bedarf*150 - res.cutting.usedLen - res.cutting.wasteLen)<0.1,"Bilanz");
    A(res.cutting.wasteLen>=-1e-6,"Verschnitt>=0");
  }
});
t("CSV Kopf + Zeilen", ()=>{ const c=battenCutListCsv(r3); const ls=c.trim().split("\n");
  A(ls[0].startsWith("achse_x_cm;segment")); A(ls.length===r3.summary.latten_stuecke+1); });


t("Dämmung: Gefache zwischen Latten, Fläche > 0", ()=>{
  const r=layoutToBattens(L3,{widthCm:4,stockCm:150,insulation:true,thicknessCm:8});
  A(r.daemmung && r.daemmung.bays.length>0, "keine Gefache");
  A(r.daemmung.total.flaeche_m2>0, "Fläche 0");
  A(r.daemmung.thickness_cm===8, "Dicke");
});
t("Dämmung: lichte Breite = Achsabstand − Lattenbreite", ()=>{
  const r=layoutToBattens(L3,{widthCm:4,stockCm:150,insulation:true,thicknessCm:8});
  for(const b of r.daemmung.bays) A(Math.abs(b.clear_cm-((b.x_right_cm-b.x_left_cm)-4))<1e-6, "clear "+b.clear_cm);
});
t("Dämmung: kein Paket überlappt eine Öffnung", ()=>{
  const r=layoutToBattens(L3,{widthCm:4,stockCm:150,insulation:true,thicknessCm:8});
  for(const b of r.daemmung.bays){ const midx=(b.x_left_cm+b.x_right_cm)/2;
    const act=L3.openings_cm.filter(o=>midx>o.x0+1e-6 && midx<o.x1-1e-6);
    for(const sg of b.segments) for(const o of act) A(!(sg.y0_cm<o.y1-1e-6 && sg.y1_cm>o.y0+1e-6), "Dämmpaket im Fenster @x"+midx); }
});
t("Dämmung-CSV: Kopf + Zeile je Gefach", ()=>{
  const r=layoutToBattens(L3,{widthCm:4,stockCm:150,insulation:true,thicknessCm:8});
  const c=daemmungCsv(r); const ls=c.trim().split("\n");
  A(ls[0].startsWith("gefach;x_links_cm"),"header"); A(ls.length===r.daemmung.bays.length+1,"Zeilen");
});
t("ohne insulation-Flag keine Dämmung", ()=>{ const r=layoutToBattens(L3,{widthCm:4,stockCm:150}); A(r.daemmung===null); });

console.log(`\nTür  : Achsen=${r2.summary.achsen} Stücke=${r2.summary.latten_stuecke} Latten=${r2.summary.latten_15m_bedarf} Verschnitt=${r2.summary.verschnitt_pct}%`);
console.log(`Fenst: Achsen=${r3.summary.achsen} Stücke=${r3.summary.latten_stuecke} Latten=${r3.summary.latten_15m_bedarf} Verschnitt=${r3.summary.verschnitt_pct}%`);
console.log(`${pass} ok, ${fail} fail`); process.exit(fail?1:0);
