import { readFileSync, writeFileSync } from "node:fs";
let mod=readFileSync("./sembla-robot.mjs","utf8").replace(/^export\s+/gm,"");
let tpl=readFileSync("./robot.template.html","utf8");
let html=tpl.replace("/*__ROBOT__*/",()=>"// ==== sembla-robot (generiert) ====\n"+mod);
writeFileSync("./SEMBLA_Roboter_Export.html",html);
import { execSync } from "node:child_process";
writeFileSync("/tmp/rb.js", html.match(/<script>([\s\S]*?)<\/script>/)[1]); execSync("node --check /tmp/rb.js");
console.log("SEMBLA_Roboter_Export.html gebaut, Syntax ok. Größe:",html.length);
