import { readFileSync } from "node:fs";
import { wallToSequence, sequenceToCsv } from "./sembla-robot.mjs";
let pass=0,fail=0; const t=(n,fn)=>{try{fn();pass++;console.log("  ok  "+n);}catch(e){fail++;console.log("FAIL  "+n+"\n        "+e.message);}};
const A=(c,m)=>{if(!c)throw new Error(m||"assert");};
const W=JSON.parse(readFileSync("./ref2.json","utf8"));
const prog=wallToSequence(W);
const nStones=W.courses.reduce((a,c)=>a+c.stones.length,0);
const nStrands=W.tension_columns.length, rods=W.tension_columns[0].gewindestangen;

t("Summary: place_stones == Steine im Wandelement", ()=>A(prog.summary.place_stones===nStones, prog.summary.place_stones+" != "+nStones));
t("Bodenblech + Senkkopfschrauben je Strang", ()=>{
  A(prog.steps.filter(s=>s.op==="PLACE_BASE_PLATE").length===1,"Bodenblech");
  A(prog.steps.filter(s=>s.op==="DRIVE_SCREW").length===nStrands,"Senkkopfschrauben");
  A(prog.steps.filter(s=>s.op==="PLACE_TOP_PLATE"||s.op==="PLACE_SPANNPLATTE_TOP").length>=1,"oberer Anschluss");
});
t("Kopplungen = (Stangen-1) pro Strang", ()=>A(prog.steps.filter(s=>s.op==="COUPLE_NUT").length===(rods-1)*nStrands));
t("genau ein TENSION am Ende", ()=>{
  const ten=prog.steps.filter(s=>s.op==="TENSION"); A(ten.length===1,"count");
  A(prog.steps[prog.steps.length-1].op==="TENSION","letzter Schritt");
});
t("Steine bottom-up (Lage nicht absteigend)", ()=>{
  let last=-1; for(const s of prog.steps) if(s.op==="PLACE_STONE"){ A(s.pose.z_mm>=last-1e-6,"z fällt"); A(s.pose.z_mm===s.lage*200,"z=lage*200"); last=s.pose.z_mm; }
});
t("Platten/Stangen vor erstem Stein", ()=>{
  const firstStone=prog.steps.findIndex(s=>s.op==="PLACE_STONE");
  const plb=prog.steps.findIndex(s=>s.op==="PLACE_BASE_PLATE");
  A(plb<firstStone && plb>=0, "Bodenblech zuerst");
});
t("seq lückenlos aufsteigend", ()=>{ prog.steps.forEach((s,i)=>A(s.seq===i+1)); });
t("CSV: Zeilen = Schritte + Kopf", ()=>{
  const csv=sequenceToCsv(prog); const lines=csv.trim().split("\n");
  A(lines.length===prog.steps.length+1, lines.length+" != "+(prog.steps.length+1));
  A(lines[0].startsWith("seq;op;part"),"header");
});
t("JSON serialisierbar", ()=>{ const s=JSON.stringify(prog); A(JSON.parse(s).summary.steps===prog.steps.length); });
console.log(`\n${pass} ok, ${fail} fail`); process.exit(fail?1:0);
