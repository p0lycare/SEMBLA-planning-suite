import { readFileSync, writeFileSync } from "node:fs";
let mod=readFileSync("./sembla-latten.mjs","utf8").replace(/^export\s+/gm,"");
let tpl=readFileSync("./latten.template.html","utf8");
let html=tpl.replace("/*__LATTEN__*/",()=>"// ==== sembla-latten (generiert) ====\n"+mod);
writeFileSync("./SEMBLA_Latten_Planung.html",html);
import { execSync } from "node:child_process";
writeFileSync("/tmp/lt.js", html.match(/<script>([\s\S]*?)<\/script>/)[1]); execSync("node --check /tmp/lt.js");
console.log("SEMBLA_Latten_Planung.html gebaut, Syntax ok. Größe:",html.length);
