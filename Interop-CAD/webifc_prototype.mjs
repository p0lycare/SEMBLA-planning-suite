// web-ifc-Prototyp (Phase 1) — beweist den Integrationspfad:
//  1) SEMBLA-IFC über den bestehenden Exporter erzeugen
//  2) mit web-ifc (WASM) laden und validieren (Schema, Wände, Steine)
//  3) zurückschreiben (Round-Trip) und erneut laden
// Aufruf (aus dem Suite-Stammordner):  node Interop-CAD/webifc_prototype.mjs
import path from "node:path";
import { writeFileSync } from "node:fs";
import { IfcAPI, IFCWALLSTANDARDCASE, IFCWALL, IFCBUILDINGELEMENTPROXY } from "web-ifc";
import { buildWall, Opening } from "../Phase-2/sembla-core.mjs";
import { projectToIfc } from "../Projekt-Manager/sembla-cad.mjs";

const log = (...a) => console.log(...a);
let fails = 0;
const ok = (name, cond) => { log((cond ? "  ok  " : "FAIL  ") + name); if (!cond) fails++; };

// 1) echte SEMBLA-IFC erzeugen (mit Steinen als Proxys)
const w = buildWall("IW-01", 3000, 2600, [new Opening(4, 8, 0, 9, "tuer")]);
const project = { name: "Aschersleben", walls: [{ name: "IW-01", x_mm: 0, y_mm: 0, rot_deg: 0, wall: w }] };
const ifcText = projectToIfc(project, { stones: true });
writeFileSync("/tmp/sembla_export.ifc", ifcText);
ok("SEMBLA-IFC erzeugt (IFC4, > 2 KB)", ifcText.includes("FILE_SCHEMA(('IFC4'))") && ifcText.length > 2000);

// 2) mit web-ifc laden
const api = new IfcAPI();
api.SetWasmPath(path.resolve("node_modules/web-ifc") + "/", true);
await api.Init();
const modelID = api.OpenModel(new TextEncoder().encode(ifcText));

const schema = api.GetModelSchema ? api.GetModelSchema(modelID) : "?";
ok("web-ifc lädt das Modell (Schema " + schema + ")", schema === "IFC4" || schema === "IFC4X3" || schema === "?");

const sz = (v) => (v && typeof v.size === "function" ? v.size() : 0);
const nAll = sz(api.GetAllLines(modelID));
const nWall = sz(api.GetLineIDsWithType(modelID, IFCWALLSTANDARDCASE)) + sz(api.GetLineIDsWithType(modelID, IFCWALL));
const nProxy = sz(api.GetLineIDsWithType(modelID, IFCBUILDINGELEMENTPROXY));
log(`      Entities gesamt: ${nAll} · Wände: ${nWall} · Steine (Proxy): ${nProxy}`);
ok("mindestens 1 Wand erkannt", nWall >= 1);
ok("Steine als Proxy erkannt (> 50)", nProxy > 50);

// eine Wand-Linie tatsächlich auslesen (Attribute dekodierbar?)
const wallIDs = api.GetLineIDsWithType(modelID, IFCWALLSTANDARDCASE);
if (sz(wallIDs) > 0) {
  const line = api.GetLine(modelID, wallIDs.get(0));
  ok("Wand-Attribute lesbar (Name/GlobalId)", !!line && !!line.GlobalId);
} else ok("Wand-Attribute lesbar (Name/GlobalId)", false);

// 3) Round-Trip: zurückschreiben und erneut laden
const bytes = api.SaveModel(modelID);
writeFileSync("/tmp/sembla_roundtrip.ifc", Buffer.from(bytes));
const modelID2 = api.OpenModel(bytes);
const nAll2 = sz(api.GetAllLines(modelID2));
ok("Round-Trip: zurückgeschrieben & erneut geladen", nAll2 > 0);
ok("Round-Trip: Entity-Zahl erhalten (±2 %)", Math.abs(nAll2 - nAll) <= Math.max(2, nAll * 0.02));

api.CloseModel(modelID);
api.CloseModel(modelID2);

log(`\n${fails === 0 ? "ALLE" : "NICHT ALLE"} Prüfungen bestanden (${fails} Fehler)`);
process.exit(fails ? 1 : 0);
