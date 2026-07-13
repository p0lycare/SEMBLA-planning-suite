import { readFileSync, writeFileSync } from "node:fs";
let core=readFileSync("../Phase-2/sembla-core.mjs","utf8").replace(/^export\s+/gm,"");
let tpl=readFileSync("./freieditor.template.html","utf8");
let html=tpl.replace("/*__CORE__*/",()=>"// ==== Core (Parametrik-Startfüller) ====\n"+core);
writeFileSync("./SEMBLA_FreierEditor.html",html);
import { execSync } from "node:child_process";
writeFileSync("/tmp/fe.js", html.match(/<script>([\s\S]*?)<\/script>/)[1]); execSync("node --check /tmp/fe.js");
console.log("SEMBLA_FreierEditor.html gebaut, Syntax ok. Größe:",html.length);
