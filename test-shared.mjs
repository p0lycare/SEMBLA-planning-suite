// Drift-Schutz: die gemeinsame semblaBom() muss mit der Core-BOM übereinstimmen.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "./Phase-2/sembla-core.mjs";
const src=readFileSync("./sembla-shared.js","utf8").replace(/\/\/__SEMBLA_SHARED_(START|END)__/g,"");
eval(src + "\n;globalThis.__sb=semblaBom;globalThis.__sbi=semblaBomItems;");
const semblaBom=globalThis.__sb, semblaBomItems=globalThis.__sbi;

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
  t(name+" · Items = 12",      semblaBomItems(w).length===12);
  t(name+" · Dichtstreifen-Stück = Stoßfugen", semblaBomItems(w).find(it=>it.key==='dicht_stk').menge===w.bom.stossfugen);
  t(name+" · rodStd+Sonder = gesamt", b.rodStd+b.rodSonder===b.gewindestangen_gesamt);
}
console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail?1:0);
