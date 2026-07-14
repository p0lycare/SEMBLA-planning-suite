import { readFileSync, writeFileSync } from "node:fs";
let core=readFileSync("../Phase-2/sembla-core.mjs","utf8").replace(/^export\s+/gm,"");
let statik=readFileSync("../Modul-3-Statik/sembla-statik.mjs","utf8").replace(/^export\s+/gm,"");
let engine=readFileSync("./sembla-engine.mjs","utf8")
  .replace(/^import .*$/gm,"")          // import-Zeilen entfernen (inline vorhanden)
  .replace(/^export\s+/gm,"");
const bundle="// ==== Core ====\n"+core+"\n// ==== Statik ====\n"+statik+"\n// ==== Engine ====\n"+engine;
let tpl=readFileSync("./engine-ui.template.html","utf8");
let html=tpl.replace("/*__BUNDLE__*/",()=>bundle);
writeFileSync("./SEMBLA_Auslegung.html",html);
import { execSync } from "node:child_process";
writeFileSync("/tmp/eu.js", html.match(/<script>([\s\S]*?)<\/script>/)[1]); execSync("node --check /tmp/eu.js");
console.log("SEMBLA_Auslegung.html gebaut, Syntax ok. Größe:",html.length);
