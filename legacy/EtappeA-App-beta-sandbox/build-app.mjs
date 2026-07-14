// Baut die Etappe-A-Sandbox-App: inlined die geteilten Kerne (Core + Schermer-Statik)
// in die Vorlage -> eine eigenständige HTML-Datei (build-frei, per Doppelklick lauffähig).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const core = readFileSync("../Phase-2/sembla-core.mjs", "utf8").replace(/^export\s+/gm, "");
const statik = readFileSync("../Modul-3-Statik/sembla-statik.mjs", "utf8").replace(/^export\s+/gm, "");
const objifc = readFileSync("../Projekt-Manager/obj-to-ifc.mjs", "utf8").replace(/^export\s+/gm, "");
const cad = readFileSync("../Projekt-Manager/sembla-cad.mjs", "utf8")
  .replace(/^import .*obj-to-ifc.*$/m, "// obj-to-ifc inline (siehe oben)")
  .replace(/^export const THICK = 125;.*$/m, "// THICK aus Core")
  .replace(/^export const GRID = 125, COURSE = 200;.*$/m, "// GRID/COURSE aus Core")
  .replace(/^export\s+/gm, "");
// Wandaufbau (Modul 2) gekapselt (eigenes COURSE=20 cm ≠ Core COURSE=200 mm)
const wandaufbau = readFileSync("../Modul-Wandaufbau/sembla-wandaufbau.mjs", "utf8").replace(/^export\s+/gm, "");
// Wand-Elevation-Renderer (Modul 1) gekapselt (eigenes GRID/COURSE/fmt)
const wallview = readFileSync("../Modul-1-Wandplanung/sembla-wallview.mjs", "utf8").replace(/^export\s+/gm, "");
const tpl = readFileSync("./app.template.html", "utf8");

const html = tpl
  .replace("/*__CORE__*/", () => "// ==== sembla-core (generiert) ====\n" + core)
  .replace("/*__STATIK__*/", () => "// ==== sembla-statik (generiert) ====\n" + statik)
  .replace("/*__CAD__*/", () => "// ==== obj-to-ifc (generiert) ====\n" + objifc + "\n// ==== sembla-cad (generiert) ====\n" + cad)
  .replace("/*__WANDAUFBAU__*/", () => "// ==== sembla-wandaufbau (Modul 2, gekapselt) ====\nconst SW=(()=>{\n" + wandaufbau + "\nreturn { planWandaufbau, verbinderFor, VERBINDER_KATALOG, layoutToBattens };\n})();")
  .replace("/*__WALLVIEW__*/", () => "// ==== sembla-wallview (Modul 1, gekapselt) ====\nconst WV=(()=>{\n" + wallview + "\nreturn { drawWall };\n})();");

writeFileSync("./SEMBLA_EtappeA_App.html", html);
writeFileSync("/tmp/appcheck.js", html.match(/<script>([\s\S]*?)<\/script>/)[1]);
execSync("node --check /tmp/appcheck.js");
console.log("SEMBLA_EtappeA_App.html gebaut, Syntax ok. Größe:", html.length);
