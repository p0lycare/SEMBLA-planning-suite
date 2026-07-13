// Baut die eigenstaendige Editor-HTML: Core (export-bereinigt) in die Vorlage einfuegen.
import { readFileSync, writeFileSync } from "node:fs";
let core = readFileSync("./sembla-core.mjs","utf8");
core = core.replace(/^export\s+/gm, "");                 // export-Schluesselwoerter entfernen
core = "// ==== Aus sembla-core.mjs generiert (NICHT manuell editieren) ====\n" + core;
const tpl = readFileSync("./editor.template.html","utf8");
const html = tpl.replace("/*__SEMBLA_CORE__*/", core);
writeFileSync("./SEMBLA_Wandeditor.html", html);
// Verifikation: Skriptbloecke syntaktisch pruefen
import { execSync } from "node:child_process";
const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
writeFileSync("/tmp/_core_check.js", m[0]);
writeFileSync("/tmp/_ui_check.js", m[1]);
for (const f of ["/tmp/_core_check.js","/tmp/_ui_check.js"]) execSync(`node --check ${f}`);
// Smoke-Test: Core-Logik aus dem generierten Block ausfuehren und gegen Fixture pruefen
const sandbox = m[0] + "\nglobalThis.__buildReference = buildReference;";
writeFileSync("/tmp/_core_run.mjs", sandbox.replace(/\n(const REFERENCE_WALLS[\s\S]*)$/, (s)=>s));
const out = execSync(`node -e '${"" }
const fs=require("fs");
eval(fs.readFileSync("/tmp/_core_check.js","utf8"));
const g=JSON.parse(fs.readFileSync("./fixtures/ref2_wand_tuer.json","utf8"));
const w=buildReference("ref2_wand_tuer");
const a=JSON.stringify(w), b=JSON.stringify(g);
console.log("parität ref2:", a===b ? "OK (identisch)" : "ABWEICHUNG");
'`).toString();
console.log(out.trim());
console.log("SEMBLA_Wandeditor.html gebaut, Syntax ok.");
