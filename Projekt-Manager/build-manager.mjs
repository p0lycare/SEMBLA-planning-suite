import { readFileSync, writeFileSync } from "node:fs";
// Aktueller Core (Single Source) – NICHT mehr die veraltete lokale Kopie
let core=readFileSync("../Phase-2/sembla-core.mjs","utf8").replace(/^export\s+/gm,"");
let objifc=readFileSync("./obj-to-ifc.mjs","utf8").replace(/^export\s+/gm,"");
let cad=readFileSync("./sembla-cad.mjs","utf8")
  .replace(/^import .*obj-to-ifc.*$/m,"// obj-to-ifc inline (siehe oben)")
  .replace(/^export const THICK = 125;.*$/m,"// THICK aus Core")
  .replace(/^export const GRID = 125, COURSE = 200;.*$/m,"// GRID/COURSE aus Core")
  .replace(/^export\s+/gm,"");
let tpl=readFileSync("./manager.template.html","utf8");
// OBJ-Blöcke bleiben LEER – Bauteilgeometrie wird NICHT mehr eingebettet, sondern zur Laufzeit
// per Upload geladen (lokal im Browser). Der Loader (sembla-obj-loader.js) füllt sie dann.
const tag="scr"+"ipt";
const objBlocks=`<${tag} type="text/plain" id="obj-i2"></${tag}>\n<${tag} type="text/plain" id="obj-i3"></${tag}>`;
const objloader=readFileSync("../sembla-obj-loader.js","utf8").replace(/^\/\/__SEMBLA_OBJLOADER_(START|END)__$/gm,"").trim();
let html=tpl.replace("/*__CORE__*/",()=>"// ==== sembla-core (generiert) ====\n"+core)
            .replace("/*__CAD__*/",()=>"// ==== obj-to-ifc (generiert) ====\n"+objifc+"\n// ==== sembla-cad (generiert) ====\n"+cad)
            .replace("/*__OBJLOADER__*/",()=>"// ==== OBJ-Loader (generiert) ====\n"+objloader)
            .replace("<!--__OBJ__-->",()=>objBlocks);
writeFileSync("./SEMBLA_Projekt_Manager.html",html);
import { execSync } from "node:child_process";
const m=html.match(/<script>([\s\S]*?)<\/script>/)[1];
writeFileSync("/tmp/pm.js",m); execSync("node --check /tmp/pm.js");
console.log("Projekt-Manager gebaut, Syntax ok.  Größe:",html.length);
