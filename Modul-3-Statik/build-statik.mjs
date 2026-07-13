import { readFileSync, writeFileSync } from "node:fs";
let mod=readFileSync("./sembla-statik.mjs","utf8").replace(/^export\s+/gm,"");
let tpl=readFileSync("./statik.template.html","utf8");
let html=tpl.replace("/*__STATIK__*/",()=>"// ==== sembla-statik (generiert) ====\n"+mod);
writeFileSync("./SEMBLA_Statik.html",html);
import { execSync } from "node:child_process";
writeFileSync("/tmp/st.js", html.match(/<script>([\s\S]*?)<\/script>/)[1]); execSync("node --check /tmp/st.js");
console.log("SEMBLA_Statik.html gebaut, Syntax ok. Größe:",html.length);
