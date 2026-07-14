// web-ifc IFC-Reader/Validator (Phase 1) — wiederverwendbar in Node und (per CDN) im Browser.
// Prüft eine IFC-Datei auf Ladbarkeit und liefert einen Inhaltsbericht.
// CLI:  node Interop-CAD/webifc_validate.mjs datei.ifc
import path from "node:path";
import { readFileSync } from "node:fs";
import { IfcAPI, IFCWALLSTANDARDCASE, IFCWALL, IFCBUILDINGELEMENTPROXY, IFCOPENINGELEMENT } from "web-ifc";

let _api = null;
async function api() {
  if (_api) return _api;
  const a = new IfcAPI();
  a.SetWasmPath(path.resolve("node_modules/web-ifc") + "/", true);
  await a.Init();
  _api = a;
  return a;
}
const size = (v) => (v && typeof v.size === "function" ? v.size() : 0);

/** Validiert IFC (Uint8Array | string) und gibt einen Bericht zurück. */
export async function validateIfc(input) {
  const a = await api();
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const id = a.OpenModel(bytes);
  try {
    const schema = a.GetModelSchema ? a.GetModelSchema(id) : "?";
    const entities = size(a.GetAllLines(id));
    const walls = size(a.GetLineIDsWithType(id, IFCWALLSTANDARDCASE)) + size(a.GetLineIDsWithType(id, IFCWALL));
    const proxies = size(a.GetLineIDsWithType(id, IFCBUILDINGELEMENTPROXY));
    const openings = size(a.GetLineIDsWithType(id, IFCOPENINGELEMENT));
    const ok = entities > 0 && (schema === "IFC4" || schema === "IFC4X3" || schema === "IFC2X3");
    return { ok, schema, entities, walls, proxies, openings };
  } finally {
    a.CloseModel(id);
  }
}

export async function validateIfcFile(file) {
  return validateIfc(new Uint8Array(readFileSync(file)));
}

if (process.argv[1] && process.argv[1].endsWith("webifc_validate.mjs")) {
  const file = process.argv[2];
  if (!file) { console.log("Aufruf: node Interop-CAD/webifc_validate.mjs datei.ifc"); process.exit(1); }
  const r = await validateIfcFile(file);
  console.log(`${file}\n  Schema=${r.schema}  Entities=${r.entities}  Wände=${r.walls}  Steine(Proxy)=${r.proxies}  Öffnungen=${r.openings}  ->  ${r.ok ? "GÜLTIG" : "UNGÜLTIG"}`);
  process.exit(r.ok ? 0 : 1);
}
