// Test des web-ifc-Validators gegen (a) den JS-IFC-Export und (b) — falls vorhanden —
// die von IfcOpenShell geschriebene Datei (Cross-Library-Interop).
import { existsSync } from "node:fs";
import { buildWall, Opening } from "../Phase-2/sembla-core.mjs";
import { projectToIfc } from "../Projekt-Manager/sembla-cad.mjs";
import { validateIfc, validateIfcFile } from "./webifc_validate.mjs";

let fails = 0;
const ok = (n, c) => { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fails++; };

// (a) JS-Export prüfen
const w = buildWall("IW-01", 3000, 2600, [new Opening(4, 8, 0, 9, "tuer")]);
const project = { name: "Aschersleben", walls: [{ name: "IW-01", x_mm: 0, y_mm: 0, rot_deg: 0, wall: w }] };
const r = await validateIfc(projectToIfc(project, { stones: true }));
console.log("  JS-IFC:", JSON.stringify(r));
ok("JS-IFC gültig (IFC4)", r.ok && r.schema === "IFC4");
ok("JS-IFC: >=1 Wand", r.walls >= 1);
ok("JS-IFC: Steine als Proxy (>50)", r.proxies > 50);

// (b) IfcOpenShell-Datei (vom Python-Test/CLI erzeugt) cross-prüfen, falls vorhanden
const py = "/tmp/sembla_ios.ifc";
if (existsSync(py)) {
  const r2 = await validateIfcFile(py);
  console.log("  IfcOpenShell-IFC:", JSON.stringify(r2));
  ok("IfcOpenShell-IFC von web-ifc lesbar (Cross-Lib)", r2.ok);
  ok("IfcOpenShell-IFC: Wände erkannt", r2.walls >= 1);
} else {
  console.log("  (Hinweis: /tmp/sembla_ios.ifc nicht vorhanden – Cross-Lib-Check übersprungen)");
}

console.log(`\n${fails === 0 ? "ALLE" : "NICHT ALLE"} bestanden (${fails} Fehler)`);
process.exit(fails ? 1 : 0);
