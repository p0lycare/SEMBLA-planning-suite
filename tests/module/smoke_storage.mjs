// Smoke-Test der Storage-Schicht (docs/shared/storage.js) gegen einen
// localStorage-/DOM-Polyfill. Prueft das Abnahmekriterium von Session 2:
// Wandelement anlegen, waehlen, exportieren, importieren, loeschen.
//
// Aufruf:  node tests/module/smoke_storage.mjs

// --- Minimal-Polyfills (nur so viel wie storage.js zur Laufzeit braucht) ---
class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();

let letzterDownload = null;
class FakeBlob { constructor(parts) { this._t = parts.join(""); } }
globalThis.Blob = FakeBlob;
globalThis.URL = { createObjectURL: (b) => { letzterDownload = b._t; return "blob:x"; }, revokeObjectURL() {} };
globalThis.document = {
  body: { appendChild() {}, insertBefore() {}, firstChild: null },
  createElement: () => ({ click() {}, remove() {}, set href(_) {}, set download(_) {} }),
};
globalThis.window = { addEventListener() {} };

const store = await import("../../docs/shared/storage.js");
const { buildWall } = await import("../../docs/shared/sembla-core.js");

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };

// 1) anlegen ---------------------------------------------------------------
const we = buildWall("Wand A", 2000, 2600, []);
const id1 = store.speichere("Wand A", we);
t("anlegen: eine Liste-Zeile", store.listeElemente().length === 1);
t("anlegen: id vergeben", typeof id1 === "string" && id1.length > 0);

// 2) waehlen (aktiv) -------------------------------------------------------
store.setzeAktiv(id1);
t("waehlen: aktivId gesetzt", store.aktivId() === id1);
t("waehlen: aktives Wandelement stimmt", store.aktivesWandelement()?.length_mm === 2000);

// 3) exportieren (reines Wandelement-JSON) ---------------------------------
store.exportiere(id1);
const exp = JSON.parse(letzterDownload);
t("export: length_mm erhalten", exp.length_mm === 2000);
t("export: courses erhalten", Array.isArray(exp.courses) && exp.courses.length > 0);
t("export: kein Wrapper (reines Wandelement)", !("wandelement" in exp));

// 4) importieren (reines Wandelement) --------------------------------------
const id2 = store.importiereText(JSON.stringify(exp), "Wand A.json");
t("import: zweites Element", store.listeElemente().length === 2);
t("import: wird aktiv gesetzt", store.aktivId() === id2);

// 5) importieren (Wrapper-Form) --------------------------------------------
const we2 = buildWall("Wand B", 1000, 2000, []);
const id3 = store.importiereText(JSON.stringify({ name: "Wand B", wandelement: we2 }));
t("import Wrapper: drittes Element", store.listeElemente().length === 3);
t("import Wrapper: Wandelement korrekt", store.holeElement(id3)?.wandelement.length_mm === 1000);

// 6) kaputte Datei -> Fehler ----------------------------------------------
let warf = false;
try { store.importiereText("{ kein json"); } catch { warf = true; }
t("import: kaputtes JSON wirft", warf);
let warf2 = false;
try { store.importiereText(JSON.stringify({ foo: 1 })); } catch { warf2 = true; }
t("import: Nicht-Wandelement wirft", warf2);

// 7) zurueckschreiben (Modul aktualisiert aktives Element) -----------------
store.setzeAktiv(id1);
const geaendert = buildWall("Wand A", 2500, 2600, []);
store.speichereAktiv(geaendert);
t("speichereAktiv: kein neues Element", store.listeElemente().length === 3);
t("speichereAktiv: Wert aktualisiert", store.aktivesWandelement()?.length_mm === 2500);

// 8) loeschen --------------------------------------------------------------
store.loesche(id3);
t("loeschen: Element weg", store.listeElemente().length === 2);
store.loesche(id1);
t("loeschen des aktiven: Auswahl aufgehoben", store.aktivId() === null || store.aktivId() !== id1);

// 8b) Wandtyp reist im Wandelement; eingaben.statik trägt keinen Wandtyp -----
const weTyp = buildWall("Typ-Wand", 2000, 2600, []);
weTyp.wandtyp = "ohne_wind";                       // von Modul 1/Engine gesetztes Feld
const idTyp = store.speichere("Typ-Wand", weTyp);
store.setzeAktiv(idTyp);
const projTyp = store.projektObjekt();
t("projekt: Wandtyp im Wandelement erhalten", projTyp.wandelement.wandtyp === "ohne_wind");
t("standardEingaben.statik ohne mitWind (Wandtyp nur im Wandelement)", !("mitWind" in store.standardEingaben().statik));
t("aktive eingaben.statik trägt kein mitWind default", !("mitWind" in store.aktiveEingaben().statik));
store.loesche(idTyp);

// 9) OBJ-Speicher ----------------------------------------------------------
store.setzeObj("i2", "OBJDATEN");
t("obj: gespeichert/gelesen", store.holeObj("i2") === "OBJDATEN");
store.loescheObj("i2");
t("obj: geloescht", store.holeObj("i2") === null);

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
