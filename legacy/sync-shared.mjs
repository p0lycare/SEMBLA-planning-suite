// Verteilt sembla-shared.js (Single Source) in alle Tools, die den Markerblock enthalten.
// Ersetzt den Bereich zwischen //__SEMBLA_SHARED_START__ und //__SEMBLA_SHARED_END__.
// Aufruf: node sync-shared.mjs   (läuft auch am Anfang von publish-werkzeuge.mjs)
import { readFileSync, writeFileSync } from "node:fs";
const START="//__SEMBLA_SHARED_START__", END="//__SEMBLA_SHARED_END__";
const shared=readFileSync("sembla-shared.js","utf8").trim();   // enthält START..END
const s0=shared.indexOf(START), s1=shared.indexOf(END);
const block=shared.slice(s0, s1+END.length);

const targets=[
  "Modul-Stueckliste/SEMBLA_Stueckliste_Kosten.html",
  "Modul-Fertigung/SEMBLA_Fertigungszeichnung.html",
];
let n=0, miss=0;
for(const t of targets){
  let s; try{ s=readFileSync(t,"utf8"); }catch(e){ console.log("  fehlt: "+t); miss++; continue; }
  const i=s.indexOf(START), j=s.indexOf(END);
  if(i<0||j<0){ console.log("  KEIN Markerblock: "+t); miss++; continue; }
  const upd=s.slice(0,i)+block+s.slice(j+END.length);
  if(upd!==s){ writeFileSync(t,upd); console.log("  ✓ aktualisiert: "+t); } else console.log("  = unverändert: "+t);
  n++;
}
console.log(`\nsembla-shared.js in ${n} Tools synchronisiert${miss?(" ("+miss+" ohne Marker)"):""}.`);
process.exit(miss?1:0);
