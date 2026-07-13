import { readFileSync } from "node:fs";
import { aggregateBom, projectToDxfGrundriss, projectToDxfAnsichten, dxfToSegments, projectToIfc } from "./sembla-cad.mjs";
let pass=0, fail=0;
const t=(n,fn)=>{ try{ fn(); pass++; console.log("  ok  "+n);}catch(e){ fail++; console.log("FAIL  "+n+"\n        "+e.message);} };
const assert=(c,m)=>{ if(!c) throw new Error(m||"assert"); };

const W2=JSON.parse(readFileSync("./ref2.json","utf8"));
const W3=JSON.parse(readFileSync("./ref3.json","utf8"));
const project={ name:"Testprojekt", walls:[
  { id:"w1", name:"Wand A", x_mm:0,    y_mm:0, rot_deg:0,  wall:W2 },
  { id:"w2", name:"Wand B", x_mm:3000, y_mm:0, rot_deg:90, wall:W3 },
]};

t("aggregateBom summiert über Wände", ()=>{
  const b=aggregateBom(project);
  assert(b.i3===W2.bom.i3+W3.bom.i3, "i3 "+b.i3);
  assert(b.i2===W2.bom.i2+W3.bom.i2, "i2");
  assert(b.gewindestangen===W2.bom.gewindestangen+W3.bom.gewindestangen, "stangen");
});

t("DXF Grundriss: gültige Sektionen + Layer", ()=>{
  const d=projectToDxfGrundriss(project);
  assert(d.includes("SECTION") && d.includes("ENTITIES") && d.trim().endsWith("EOF"));
  assert(d.includes("WAND") && d.includes("OEFFNUNG"));
});

t("DXF Grundriss Roundtrip: Wandlänge wiederfindbar", ()=>{
  const d=projectToDxfGrundriss(project);
  const segs=dxfToSegments(d);
  // Wand A Länge 2000 sollte als Segment auftauchen
  assert(segs.some(s=>Math.abs(s.len-2000)<1), "kein 2000er-Segment: "+segs.map(s=>Math.round(s.len)).join(","));
});

t("DXF Import: LINE wird zu Segment", ()=>{
  const dxf="0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nA\n10\n0\n20\n0\n11\n1500\n21\n0\n0\nENDSEC\n0\nEOF\n";
  const segs=dxfToSegments(dxf);
  assert(segs.length===1 && Math.abs(segs[0].len-1500)<1, "len "+JSON.stringify(segs));
  assert(Math.abs(segs[0].rot_deg)<1e-6, "rot");
});

t("DXF Ansichten: Stein-Layer vorhanden", ()=>{
  const d=projectToDxfAnsichten(project);
  assert(d.includes("STEINE_I3") && d.includes("VORSPANNUNG") && d.includes("OEFFNUNG"));
});

function refIntegrity(ifc){
  const defined=new Set(), referenced=new Set();
  for(const line of ifc.split("\n")){
    const m=line.match(/^#(\d+)=/); if(m) defined.add(+m[1]);
    for(const r of line.replace(/^#\d+=/,"").matchAll(/#(\d+)/g)) referenced.add(+r[1]);
  }
  const dangling=[...referenced].filter(r=>!defined.has(r));
  return { defined:defined.size, referenced:referenced.size, dangling };
}

t("IFC: Header/Schema/Struktur + Referenzintegrität (mit Steinen)", ()=>{
  const ifc=projectToIfc(project,{stones:true});
  assert(ifc.startsWith("ISO-10303-21;"), "header");
  assert(ifc.includes("FILE_SCHEMA(('IFC4'))"), "schema");
  assert(ifc.includes("END-ISO-10303-21;"), "footer");
  const ri=refIntegrity(ifc);
  assert(ri.dangling.length===0, "dangling refs: "+ri.dangling.slice(0,10));
});

t("IFC: ein Wall je Wand, Öffnungen + Voids, Steine als Proxy", ()=>{
  const ifc=projectToIfc(project,{stones:true});
  const cnt=(re)=>(ifc.match(re)||[]).length;
  assert(cnt(/IFCWALLSTANDARDCASE\(/g)===2, "walls "+cnt(/IFCWALLSTANDARDCASE\(/g));
  const nOpen=(W2.openings.length+W3.openings.length);
  assert(cnt(/IFCOPENINGELEMENT\(/g)===nOpen, "openings");
  assert(cnt(/IFCRELVOIDSELEMENT\(/g)===nOpen, "voids");
  const nStones=[W2,W3].reduce((s,w)=>s+w.courses.reduce((a,c)=>a+c.stones.length,0),0);
  assert(cnt(/IFCBUILDINGELEMENTPROXY\(/g)===nStones, "stones "+cnt(/IFCBUILDINGELEMENTPROXY\(/g)+" != "+nStones);
});

t("IFC ohne Steine: keine Proxies", ()=>{
  const ifc=projectToIfc(project,{stones:false});
  assert((ifc.match(/IFCBUILDINGELEMENTPROXY\(/g)||[]).length===0);
  assert(refIntegrity(ifc).dangling.length===0);
});

t("IFC realGeom: BREP einmal je Typ, je Stein MappedItem", ()=>{
  const objText={ i2:readFileSync("../Bauteil-OBJ/i2_SEMBLA.obj","utf8"), i3:readFileSync("../Bauteil-OBJ/i3_SEMBLA.obj","utf8") };
  const ifc=projectToIfc(project,{stones:true, realGeom:true, objText});
  const cnt=(re)=>(ifc.match(re)||[]).length;
  const nStones=[W2,W3].reduce((s,w)=>s+w.courses.reduce((a,c)=>a+c.stones.length,0),0);
  assert(cnt(/IFCREPRESENTATIONMAP\(/g)===2, "repmaps "+cnt(/IFCREPRESENTATIONMAP\(/g));   // i2+i3, wiederverwendet
  assert(cnt(/IFCFACETEDBREP\(/g)===2, "breps "+cnt(/IFCFACETEDBREP\(/g));
  assert(cnt(/IFCMAPPEDITEM\(/g)===nStones, "mappeditems "+cnt(/IFCMAPPEDITEM\(/g)+" != "+nStones);
  assert(cnt(/IFCCLOSEDSHELL\(/g)===2, "shells");
  assert(refIntegrity(ifc).dangling.length===0, "dangling refs");
  assert(/FILE_SCHEMA\(\('IFC4'\)\)/.test(ifc), "schema");
});

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail?1:0);
