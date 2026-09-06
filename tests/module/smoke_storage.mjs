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
const KAT = await import("../../docs/shared/sembla-katalog.js");

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

// 9) OBJ-Speicher ----------------------------------------------------------
store.setzeObj("i2", "OBJDATEN");
t("obj: gespeichert/gelesen", store.holeObj("i2") === "OBJDATEN");
store.loescheObj("i2");
t("obj: geloescht", store.holeObj("i2") === null);

// 10) Preis-Roundtrip: geaenderter Einzelpreis ueberlebt Speichern -> v2-JSON
//     -> Import (Issue #11 / Praezisierung: nur Legacy-`anzahl` wird ignoriert,
//     `preise`/`waehrung` bleiben erhalten). Nutzt echtes storage.js, kein Mock.
const wPreis = buildWall("Preiswand", 2000, 2600, []);
const idP = store.speichere("Preiswand", wPreis);
store.setzeAktiv(idP);
const NEUER_PREIS = 12.5;   // bewusst != Standardpreis i3 (9.50)
store.mergeEingaben("kosten", { preise: { i3: NEUER_PREIS } });
t("roundtrip: geaenderter Preis im aktiven Element geladen",
  store.aktiveEingaben().kosten.preise.i3 === NEUER_PREIS);

// projektObjekt() -> Version 2 + exakt dieser Preis im eingaben-Block
const proj = store.projektObjekt(idP);
t("roundtrip: Export ist v2", proj.format === "SEMBLA-Projekt" && proj.version === 2);
t("roundtrip: Preis im Export-eingaben-Block", proj.eingaben.kosten.preise.i3 === NEUER_PREIS);

// serialisieren -> exakt derselbe JSON-Text -> importieren
const jsonText = JSON.stringify(proj);
t("roundtrip: JSON-Text enthaelt Preis", JSON.parse(jsonText).eingaben.kosten.preise.i3 === NEUER_PREIS);
const idImport = store.importiereText(jsonText, "Preiswand.json");
t("roundtrip: Import legt Element an + aktiv", store.aktivId() === idImport && idImport !== idP);

// importiertes aktives Element liefert exakt den geaenderten Preis zurueck
t("roundtrip: Preis nach Import wieder geladen",
  store.holeEingaben(idImport).kosten.preise.i3 === NEUER_PREIS);
// Nicht-Ziel-Absicherung: Legacy `anzahl` wird nicht eingefuehrt
t("roundtrip: keine Mehrfachwand-Anzahl im Modell",
  store.holeEingaben(idImport).kosten.anzahl === undefined);

// 11) Wandtyp (Issue #6): zentrale Ableitung fuer Altbestaende ------------
// Semantik: mitWind true/'ja' -> mit_wind, false/'nein' -> ohne_wind, fehlt -> mit_wind.
t("legacy: 'ja' -> mit_wind", store.wandtypAusLegacy({ statik: { mitWind: "ja" } }) === "mit_wind");
t("legacy: true -> mit_wind", store.wandtypAusLegacy({ statik: { mitWind: true } }) === "mit_wind");
t("legacy: 'nein' -> ohne_wind", store.wandtypAusLegacy({ statik: { mitWind: "nein" } }) === "ohne_wind");
t("legacy: false -> ohne_wind", store.wandtypAusLegacy({ statik: { mitWind: false } }) === "ohne_wind");
t("legacy: fehlt -> Standard mit_wind", store.wandtypAusLegacy({ statik: {} }) === "mit_wind");
t("legacy: gar keine Eingaben -> Standard", store.wandtypAusLegacy(undefined) === "mit_wind");
t("normWandtyp: Unsinn -> Standard", store.normWandtyp("quatsch") === "mit_wind"
  && store.normWandtyp("ohne_wind") === "ohne_wind");

// Alt-Stand direkt in den localStorage legen (wie ihn ein v2-Browser hinterlassen haette)
// und die einmalige Migration fahren.
const altWand = (n, mitWind) => {
  const w = buildWall(n, 2000, 2600, []);
  delete w.wandtyp;
  const e = { id: "alt-" + n, name: n, wandelement: w, erstellt: "x", geaendert: "x" };
  if (mitWind !== undefined) e.eingaben = { statik: { mitWind } };
  return e;
};
const altMap = {};
for (const e of [altWand("AltJa", "ja"), altWand("AltNein", "nein"), altWand("AltOhneFeld", undefined)]) altMap[e.id] = e;
localStorage.setItem("sembla:elemente", JSON.stringify(altMap));
localStorage.setItem("sembla:version", "2");
store.migrieren();

const nachM = JSON.parse(localStorage.getItem("sembla:elemente"));
t("migration: 'ja' -> mit_wind", nachM["alt-AltJa"].wandelement.wandtyp === "mit_wind");
t("migration: 'nein' -> ohne_wind", nachM["alt-AltNein"].wandelement.wandtyp === "ohne_wind");
t("migration: ohne Feld -> mit_wind", nachM["alt-AltOhneFeld"].wandelement.wandtyp === "mit_wind");
t("migration: Alt-Feld bleibt erhalten (kein Datenverlust)",
  nachM["alt-AltNein"].eingaben.statik.mitWind === "nein");
t("migration: Schema-Version hochgesetzt", localStorage.getItem("sembla:version") === "6");

// idempotent: erneutes migrieren aendert nichts mehr
nachM["alt-AltNein"].wandelement.wandtyp = "ohne_wind";
store.migrieren();
t("migration: laeuft nur einmal / idempotent",
  JSON.parse(localStorage.getItem("sembla:elemente"))["alt-AltNein"].wandelement.wandtyp === "ohne_wind");

// Import einer Alt-Datei (lief nie durch migrieren()) -> gleiche Ableitung
const altProjekt = JSON.stringify({
  format: "SEMBLA-Projekt", version: 2, name: "AltDatei",
  wandelement: (() => { const w = buildWall("AltDatei", 2000, 2600, []); delete w.wandtyp; return w; })(),
  eingaben: { statik: { mitWind: "nein" } },
});
const idAlt = store.importiereText(altProjekt, "AltDatei.json");
t("import Altdatei: Wandtyp abgeleitet", store.holeElement(idAlt).wandelement.wandtyp === "ohne_wind");
t("import Altdatei: Alt-Feld unangetastet", store.holeElement(idAlt).eingaben.statik.mitWind === "nein");
t("import Altdatei: mitWind nicht in den Standardwerten", !("mitWind" in store.standardEingaben().statik));
// Neues Feld ist im v2-Format optional -> Export bleibt v2
t("export: Projektformat bleibt v2", store.projektObjekt(idAlt).version === 2);

// 11b) Brandschutzklassifikation (Issue #79): kanonisches Wandfeld F0/F30 ----
// Reine PLANUNGSKENNZEICHNUNG: aus ihr wird nichts abgeleitet. Anders als beim Wandtyp gibt
// es KEIN Alt-Feld — deshalb keine Migration, kein SCHEMA_VERSION-Sprung und kein stilles
// Umschreiben gespeicherter Wandelemente: normalisiert wird beim LESEN an EINER Stelle.
{
  t("[#79] kanonische Werte sind genau F0 und F30",
    store.BRANDKLASSEN.join(",") === "F0,F30" && store.BRANDKLASSE_DEFAULT === "F0");
  t("[#79] normBrandklasse: Unsinn/fehlend -> F0, F30 bleibt F30",
    store.normBrandklasse("quatsch") === "F0" && store.normBrandklasse(undefined) === "F0"
    && store.normBrandklasse(null) === "F0" && store.normBrandklasse("f30") === "F0"
    && store.normBrandklasse("F30") === "F30" && store.normBrandklasse("F0") === "F0");

  // Gespeichertes Wandelement OHNE das Feld: wird als F0 gelesen und NICHT umgeschrieben.
  const idBk = store.speichere("Brandklasse alt", buildWall("Brandklasse alt", 2000, 2600, []));
  t("[#79] neu angelegtes Wandelement traegt das Feld nicht",
    !("brandklasse" in store.holeElement(idBk).wandelement));
  t("[#79] Wandelement ohne Feld wird als F0 gelesen",
    store.normBrandklasse(store.holeElement(idBk).wandelement.brandklasse) === "F0");
  t("[#79] Lesen schreibt nichts zurueck (keine stille Migration)",
    !localStorage.getItem("sembla:elemente").includes("brandklasse"));
  t("[#79] es gibt keine Brandklassen-Migration und keinen Schemasprung", (() => {
    store.migrieren();
    return localStorage.getItem("sembla:version") === "6" && store.SCHEMA_VERSION === 6
      && !("brandklasse" in store.holeElement(idBk).wandelement);
  })());

  // Gesetzte F30 ueberlebt Export UND Import unveraendert.
  const weF30 = Object.assign(buildWall("Brandklasse F30", 2000, 2600, []), { brandklasse: "F30" });
  const idF30 = store.speichere("Brandklasse F30", weF30);
  const pF30 = store.projektObjekt(idF30);
  t("[#79] Export traegt die Klassifikation im Wandelement", pF30.wandelement.brandklasse === "F30");
  t("[#79] Export bleibt Projektformat v2 (Feld ist optional)",
    pF30.version === 2 && store.PROJEKT_VERSION === 2);
  t("[#79] die Klassifikation liegt NICHT in eingaben",
    !JSON.stringify(pF30.eingaben).includes("brandklasse")
    && !JSON.stringify(pF30.eingaben).includes("F30"));
  const idF30imp = store.importiereText(JSON.stringify(pF30), "BrandklasseF30.json");
  t("[#79] Import erhaelt die Klassifikation unveraendert",
    store.holeElement(idF30imp).wandelement.brandklasse === "F30");
  t("[#79] Import aendert die uebrige Wandgeometrie nicht",
    store.holeElement(idF30imp).wandelement.length_mm === 2000
    && store.holeElement(idF30imp).wandelement.courses.length
       === weF30.courses.length);

  // Datei OHNE das Feld: der Import erfindet nichts und liest F0 — nie F30.
  const ohneFeld = JSON.stringify({
    format: "SEMBLA-Projekt", version: 2, name: "OhneBrandklasse",
    wandelement: buildWall("OhneBrandklasse", 2000, 2600, []),
    eingaben: {},
  });
  const idOhne = store.importiereText(ohneFeld, "OhneBrandklasse.json");
  t("[#79] Datei ohne Feld: Import traegt nichts ein und liest F0",
    !("brandklasse" in store.holeElement(idOhne).wandelement)
    && store.normBrandklasse(store.holeElement(idOhne).wandelement.brandklasse) === "F0");
  t("[#79] Altbestand wird nie als F30 gelesen",
    store.normBrandklasse(store.holeElement(idOhne).wandelement.brandklasse) !== "F30");
  // Roundtrip einer F0-Wahl: ausdrueckliches F0 bleibt ausdrueckliches F0.
  const idF0 = store.speichere("Brandklasse F0",
    Object.assign(buildWall("Brandklasse F0", 2000, 2600, []), { brandklasse: "F0" }));
  const idF0imp = store.importiereText(JSON.stringify(store.projektObjekt(idF0)), "F0.json");
  t("[#79] ausdrueckliches F0 ueberlebt den Roundtrip unveraendert",
    store.holeElement(idF0imp).wandelement.brandklasse === "F0");
  for (const x of [idBk, idF30, idF30imp, idOhne, idF0, idF0imp]) store.loesche(x);
}

// 12) Bauteilkatalog (Issue #21): eigene Ressource + Auswahl als Referenz ---
// Synthetische Fantasiedaten, keine realen Produkt-/Preisangaben.
const KATALOG = {
  format: "SEMBLA-Bauteilkatalog", version: 1, name: "Katalog Musterlieferant",
  produkte: [
    { id: "rod-m10-1100", kategorie: "gewindestange", bezeichnung: "Gewindestange M10 1100 mm",
      einheit: "Stk", preis: 3.8, gewinde: "M10", laenge_mm: 1100 },
    { id: "latte-40-60-3000", kategorie: "latte", bezeichnung: "Latte 40×60, 3,0 m",
      einheit: "m", preis: 1.25, breite_mm: 40, dicke_mm: 60, laenge_mm: 3000 },
    { id: "latte-40-60-5000", kategorie: "latte", bezeichnung: "Latte 40×60, 5,0 m",
      einheit: "m", preis: 1.19, breite_mm: 40, dicke_mm: 60, laenge_mm: 5000 },
    { id: "platte-12-1250-2000", kategorie: "beplankung", bezeichnung: "Platte 12,5 mm 1250×2000",
      einheit: "m2", preis: 6.9, breite_mm: 1250, hoehe_mm: 2000, dicke_mm: 12.5 },
  ],
};

t("katalog: anfangs keiner geladen", store.holeKatalog() === null);
store.setzeKatalog(KATALOG);
t("katalog: gespeichert und gelesen", store.holeKatalog().produkte.length === 4);
t("katalog: eigener localStorage-Schluessel (nicht im Projektstand)",
  !!localStorage.getItem("sembla:kataloge")
  && !localStorage.getItem("sembla:elemente").includes("rod-m10-1100"));
t("katalog: Zeitstempel intern, nicht im oeffentlichen Format",
  typeof store.holeKatalog().geaendert === "string");

// „Reload": frisch aus dem localStorage lesen (storage.js haelt keinen Cache)
t("katalog: ueberlebt Reload (Rohwert im Speicher)",
  Object.values(JSON.parse(localStorage.getItem("sembla:kataloge")))[0].produkte[0].id === "rod-m10-1100");

let warfK = false;
try { store.setzeKatalog({ name: "", produkte: [{ id: "x" }] }); } catch { warfK = true; }
t("katalog: ungueltiger Katalog wird abgelehnt", warfK && store.holeKatalog().produkte.length === 4);

// Export = eigene Datei im oeffentlichen Katalogformat (nicht im Projekt-ZIP)
store.exportiereKatalog();
const kExp = JSON.parse(letzterDownload);
t("katalog-export: eigenes Format v2",
  kExp.format === "SEMBLA-Bauteilkatalog" && kExp.version === 2 && kExp.produkte.length === 4);
t("katalog-export: kein Wandelement/keine Eingaben in der Datei",
  !("wandelement" in kExp) && !("eingaben" in kExp) && !("geaendert" in kExp));

// Separater Import (ersetzt den Slot)
store.loescheKatalog();
t("katalog: entfernt", store.holeKatalog() === null);
const kImp = store.importiereKatalogText(JSON.stringify(kExp));
t("katalog-import: separat wieder eingelesen", kImp.produkte.length === 4 && store.holeKatalog() !== null);

// Formatverwechslung wird in BEIDEN Richtungen klar benannt
let warfV1 = "", warfV2 = "";
try { store.importiereText(JSON.stringify(kExp)); } catch (e) { warfV1 = e.message; }
t("verwechslung: Katalog im Projektimport -> klare Meldung", /Bauteilkatalog/.test(warfV1));
const idV = store.speichere("Verwechslung", buildWall("Verwechslung", 2000, 2600, []));
try { store.importiereKatalogText(JSON.stringify(store.projektObjekt(idV))); } catch (e) { warfV2 = e.message; }
t("verwechslung: Projekt im Katalogimport -> klare Meldung", /Projekt-\/Wandelement-Datei/.test(warfV2));

// --- Wandbezogene Produktreferenzen ([P-13]) --------------------------------------------
// Nur Produkt-IDs je Verwendungsrolle, geschrieben vom besitzenden Modul. Modul 0 hat KEINEN
// Schreibweg mehr (die frueher zentrale Auswahl ist unwirksamer Altbestand, [P-15]).
const wK = buildWall("Katalogwand", 2000, 2600, []);
const idK = store.speichere("Katalogwand", wK);
store.setzeAktiv(idK);
t("produkte: zentrale Modul-0-Auswahl hat keinen Schreibweg mehr",
  typeof store.setzeKatalogAuswahl === "undefined");
t("produkte: Altstand -> leere Rollen, warnungsfrei",
  JSON.stringify(store.holeProdukte(1).rollen) === "{}" && JSON.stringify(store.holeProdukte(2).rollen) === "{}"
  && JSON.stringify(store.katalogAuswahl()) === "{}");

store.setzeProduktrolle("latte", ["latte-40-60-3000", "latte-40-60-5000"]);
store.setzeProduktrolle("rod_std", ["rod-m10-1100"]);
t("produkte: mehrere Standardgroessen derselben Rolle",
  store.holeProdukte(2).rollen.latte.length === 2 && store.holeProdukte(1).rollen.rod_std.length === 1);
t("produkte: Rolle landet im Abschnitt ihres Eigentuemer-Moduls",
  store.aktiveEingaben().aufbau.produkte.rollen.latte.length === 2
  && store.aktiveEingaben().planung.produkte.rollen.rod_std.length === 1
  && store.aktiveEingaben().planung.produkte.rollen.latte === undefined);
t("produkte: Herkunftsnotiz ohne Preise/Maße",
  store.holeProdukte(1).quelle.name === "Katalog Musterlieferant"
  && !JSON.stringify(store.aktiveEingaben().planung).includes("1.25")
  && !JSON.stringify(store.aktiveEingaben().aufbau.produkte).includes("breite_mm"));
t("produkte: Wandelement bleibt frei von Katalogdaten",
  !JSON.stringify(store.aktivesWandelement()).includes("latte-40-60-3000"));
t("produkte: unbekannte Rolle wird abgelehnt (kein stilles Schreiben)", (() => {
  try { store.setzeProduktrolle("gibtsnicht", ["x"]); return false; } catch { return true; }
})());

// Reload (frisches Lesen aus dem localStorage) haelt die Auswahl
t("produkte: nach Reload aus dem Speicher wieder da",
  JSON.parse(localStorage.getItem("sembla:elemente"))[idK].eingaben.aufbau.produkte.rollen.latte.length === 2
  && store.holeProdukte(2, idK).rollen.latte.length === 2);

// Roundtrip Projekt-JSON: nur IDs reisen mit, Version bleibt 2
const pK = store.projektObjekt(idK);
t("produkte: reisen im Projekt-JSON mit (nur IDs)",
  pK.eingaben.aufbau.produkte.rollen.latte.join(",") === "latte-40-60-3000,latte-40-60-5000"
  && pK.eingaben.planung.produkte.rollen.rod_std.join(",") === "rod-m10-1100"
  && !JSON.stringify(pK.eingaben.planung).includes("Latte 40×60"));
t("produkte: oeffentliches Projektformat bleibt Version 2", pK.version === 2 && store.PROJEKT_VERSION === 2);
t("produkte: interne Schema-Version ist 6 (Lage in mm)", store.SCHEMA_VERSION === 6);
t("produkte: Katalog-Formatversion getrennt", KAT.KATALOG_VERSION === 2);
const idKimp = store.importiereText(JSON.stringify(pK), "Katalogwand.json");
t("produkte: nach Projekt-Import wieder geladen",
  store.holeProdukte(2, idKimp).rollen.latte.length === 2
  && store.holeProdukte(1, idKimp).rollen.rod_std.join(",") === "rod-m10-1100");
t("produkte: v2-Parser traegt den optionalen Zusatzteil unveraendert",
  JSON.stringify(store.projektObjekt(idKimp).eingaben.planung) === JSON.stringify(pK.eingaben.planung));

// Fehlende Referenz -> sichtbar, keine stille Bereinigung
const ohneLatte = { ...store.holeKatalog(), produkte: store.holeKatalog().produkte.filter(p => p.id !== "latte-40-60-5000") };
store.setzeKatalog(ohneLatte);
const aufl = KAT.produkteZuRolle(store.aktiveEingaben(), store.holeKatalog(), "latte");
t("referenz: geloeschtes Produkt wird als fehlend gemeldet", aufl.fehlend.join() === "latte-40-60-5000");
t("referenz: Auswahl bleibt unveraendert (nicht still bereinigt)",
  store.holeProdukte(2).rollen.latte.length === 2);
store.loescheKatalog();
t("referenz: ohne Katalog ist keine Rolle aufloesbar",
  KAT.rollenStatus("latte", store.aktiveEingaben(), store.holeKatalog(), {}).status === "kein_katalog");

// Altprojekt-Datei ohne Produkt-Bloecke laedt sauber und warnungsfrei; Alt-Preise bleiben erhalten,
// sind aber nicht mehr die Preisquelle ([P-14]) und werden nicht mehr als Standard erzeugt.
const altOhneKatalog = JSON.stringify({
  format: "SEMBLA-Projekt", version: 2, name: "AltOhneKatalog",
  wandelement: buildWall("AltOhneKatalog", 2000, 2600, []),
  eingaben: { projekt: { name: "Alt" }, kosten: { preise: { i3: 9.5 } },
              katalog: { quelle: { name: "Alt-Katalog", version: 1 }, auswahl: { latte: ["alt-latte"] } } },
});
const idAltK = store.importiereText(altOhneKatalog, "AltOhneKatalog.json");
t("altprojekt: Fallback = leere Rollen",
  JSON.stringify(store.holeProdukte(1, idAltK).rollen) === "{}"
  && JSON.stringify(store.holeProdukte(2, idAltK).rollen) === "{}");
t("altprojekt: bestehende Preisfelder bleiben im Projekt erhalten",
  store.holeEingaben(idAltK).kosten.preise.i3 === 9.5);
t("altprojekt: keine Preis-Standardwerte mehr", store.standardEingaben().kosten.preise === undefined);
t("altbestand: alte Modul-0-Auswahl bleibt lesbar und wird NICHT in Rollen uebersetzt",
  store.katalogAuswahl(idAltK).latte.join() === "alt-latte"
  && KAT.anzahlAuswahl(store.katalogAuswahl(idAltK)) === 1
  && JSON.stringify(KAT.produktRollen(store.holeEingaben(idAltK))) === "{}");
t("altbestand: reist im Projekt-Export unveraendert mit (Nachvollziehbarkeit)",
  store.projektObjekt(idAltK).eingaben.katalog.auswahl.latte.join() === "alt-latte");

// --- Vorbelegung aus der Katalog-Standardauswahl ([P-18]) -------------------
// Nur LEERE Rollen werden belegt, jede in den Abschnitt ihres Eigentuemers; eine bereits
// getroffene Wahl bleibt unangetastet und das Wandelement bleibt unberuehrt.
{
  const KAT_VB = {
    format: "SEMBLA-Bauteilkatalog", version: 1, name: "Katalog mit Standardauswahl",
    produkte: [
      { id: "vb-rod", kategorie: "gewindestange", bezeichnung: "Stange", einheit: "Stk",
        preis: 3, gewinde: "M10", laenge_mm: 1000, rollen: ["rod_std"] },
      { id: "vb-latte", kategorie: "latte", bezeichnung: "Latte", einheit: "Stk", preis: 3,
        breite_mm: 40, dicke_mm: 60, laenge_mm: 1500, rollen: ["latte"] },
      { id: "vb-i3", kategorie: "stein", bezeichnung: "i3", einheit: "Stk", preis: 9, breite_mm: 375, rollen: ["i3"] },
    ],
  };
  store.setzeKatalog(KAT_VB);
  const idVb = store.speichere("Vorbelegwand", buildWall("Vorbelegwand", 2000, 2600, []));
  store.setzeAktiv(idVb);
  store.setzeProduktrolle("i3", ["eigene-wahl"]);          // bewusst gesetzt -> unantastbar
  const vb = store.vorbelegeProduktrollen();
  t("vorbelegen: leere Rollen uebernehmen die Standardauswahl des Katalogs",
    store.holeProdukte(1).rollen.rod_std.join() === "vb-rod"
    && store.holeProdukte(2).rollen.latte.join() === "vb-latte");
  t("vorbelegen: bestehende Wahl wird NIE ueberschrieben",
    store.holeProdukte(1).rollen.i3.join() === "eigene-wahl" && vb.gesetzt.i3 === undefined);
  t("vorbelegen: Rollen ohne Standardprodukt werden benannt, nicht geraten",
    vb.offen.includes("spannplatte") && !vb.offen.includes("rod_std")
    && store.holeProdukte(1).rollen.spannplatte === undefined);
  t("vorbelegen: Rolle landet im Abschnitt ihres Eigentuemers",
    store.aktiveEingaben().planung.produkte.rollen.latte === undefined
    && store.aktiveEingaben().aufbau.produkte.rollen.rod_std === undefined);
  t("vorbelegen: Wandelement bleibt unberuehrt",
    !JSON.stringify(store.aktivesWandelement()).includes("vb-rod"));
  t("vorbelegen: zweiter Aufruf aendert nichts mehr (idempotent)",
    Object.keys(store.vorbelegeProduktrollen().gesetzt).length === 0);
  t("vorbelegen: ohne Katalog wird nichts erfunden", (() => {
    const idLeer = store.speichere("Ohne Katalog", buildWall("Ohne Katalog", 2000, 2600, []));
    store.loescheKatalog();
    const r = store.vorbelegeProduktrollen(undefined, idLeer);
    return Object.keys(r.gesetzt).length === 0 && r.offen.length > 0
      && JSON.stringify(store.holeProdukte(1, idLeer).rollen) === "{}";
  })());
}

// 13) Projektmappe (Issue #26, [L-1]…[L-7]): eigene Ressource neben dem Wandspeicher
{
  const PM = await import("../../docs/shared/sembla-projektmappe.js");

  // 13a) Migration v3 -> v4 auf einem frischen, „alten" Stand -----------------
  // Alles zuruecksetzen und einen Stand hinstellen, wie ihn ein v3-Browser hinterlassen haette.
  localStorage.m.clear();
  const w1 = buildWall("Bestand A", 2000, 2600, []);
  const w2 = buildWall("Bestand B", 3000, 2600, []);
  const altStand = {
    "w-b1": { id: "w-b1", name: "Bestand A", wandelement: w1, eingaben: { projekt: { name: "Alt" } },
              erstellt: "x", geaendert: "x" },
    "w-b2": { id: "w-b2", name: "Bestand B", wandelement: w2, erstellt: "x", geaendert: "y" },
  };
  localStorage.setItem("sembla:elemente", JSON.stringify(altStand));
  localStorage.setItem("sembla:aktiv", "w-b2");
  localStorage.setItem("sembla:version", "3");
  t("[L-7] vor der Migration gibt es keine Mappe", store.holeMappe() === null);

  store.migrieren();
  const mig = store.holeMappe();
  t("[L-7] Migration legt „Projekt ohne Plan“ an", mig?.projekt.name === "Projekt ohne Plan");
  t("[L-6] vollstaendige Hierarchie mit genau einem Gebaeude/Geschoss",
    mig.gebaeude.length === 1 && mig.gebaeude[0].geschosse.length === 1);
  t("[L-7] beide Bestandswaende uebernommen", PM.alleWaende(mig).length === 2);
  t("[L-7] Namen erhalten", PM.findeWand(mig, "w-b1").wand.name === "Bestand A");
  t("[L-7] KEINE Lagedaten erfunden", PM.alleWaende(mig).every((e) => e.wand.lage === null));
  t("[L-7] Wandelemente unveraendert (kein Datenverlust)",
    store.holeElement("w-b1").wandelement.length_mm === 2000
    && store.holeEingaben("w-b1").projekt.name === "Alt");
  t("[L-3] Mappe traegt keine Wandgeometrie",
    !localStorage.getItem("sembla:projekte").includes("courses"));
  t("[L-7] Zeiger auf die aktive Wand bleibt bestehen", store.aktivId() === "w-b2");
  t("migration: Schema-Version auf 6", localStorage.getItem("sembla:version") === "6");
  t("[L-6] die Mappe liegt als LISTE mit genau einem Projekt vor",
    JSON.parse(localStorage.getItem("sembla:projekte")).length === 1
    && localStorage.getItem("sembla:projektmappe") === null);
  t("[L-10] der Projektzeiger zeigt auf das uebernommene Projekt",
    store.aktivesProjektId() === mig.projekt.id);

  // idempotent
  const vorher = localStorage.getItem("sembla:projekte");
  store.migrieren();
  t("[L-7] Migration laeuft nur einmal (idempotent)",
    localStorage.getItem("sembla:projekte") === vorher);

  // 13b) Struktur anlegen + aktive Zeiger ------------------------------------
  const gebEG = store.aendereMappe((m) => PM.fuegeGebaeudeHinzu(m, "Haus A").mappe);
  const gebId = gebEG.gebaeude[gebEG.gebaeude.length - 1].id;
  let gsId = null;
  store.aendereMappe((m) => {
    const r = PM.fuegeGeschossHinzu(m, gebId, "EG", 2600);
    gsId = r.id;
    return r.mappe;
  });
  t("[L-6] Geschoss angelegt und gespeichert",
    PM.findeGeschoss(store.holeMappe(), gsId)?.geschoss.name === "EG");
  t("[L-6] Mappe ueberlebt Reload (Rohwert im Speicher)",
    JSON.parse(localStorage.getItem("sembla:projekte"))[0].gebaeude.length === 2);

  store.setzeAktivesGeschoss(gsId);
  t("[L-6] aktives Geschoss gesetzt", store.aktivesGeschossId() === gsId);
  t("[L-6] Gebaeudezeiger laeuft mit (nie auseinander)", store.aktivesGebaeudeId() === gebId);
  t("[L-6] aktivesGeschoss() liefert Geschoss samt Gebaeude",
    store.aktivesGeschoss()?.gebaeude.id === gebId);
  t("[L-6] unbekanntes Geschoss wird abgewiesen", (() => {
    try { store.setzeAktivesGeschoss("gs-gibtsnicht"); return false; } catch { return true; }
  })());

  // Gebaeudezeiger eigenstaendig setzbar (Modul 0 waehlt ein Gebaeude ohne Geschoss)
  const gebLeer = store.aendereMappe((m) => PM.fuegeGebaeudeHinzu(m, "Haus B").mappe);
  const gebLeerId = gebLeer.gebaeude[gebLeer.gebaeude.length - 1].id;
  store.setzeAktivesGebaeude(gebLeerId);
  t("[L-6] aktives Gebaeude gesetzt", store.aktivesGebaeude()?.id === gebLeerId);
  t("[L-6] fremdes Geschoss wird beim Gebaeudewechsel aufgehoben, nicht umgebogen",
    store.aktivesGeschossId() === null);
  t("[L-6] unbekanntes Gebaeude wird abgewiesen", (() => {
    try { store.setzeAktivesGebaeude("geb-gibtsnicht"); return false; } catch { return true; }
  })());
  t("[L-6] mehrere Gebaeude ohne Zeiger -> kein geratenes Gebaeude", (() => {
    store.setzeAktivesGebaeude(null);
    return store.aktivesGebaeude() === null && store.aktivesGeschossId() === null;
  })());
  store.setzeMappe(PM.entferneGebaeude(store.holeMappe(), gebLeerId));
  store.setzeAktivesGeschoss(gsId);

  // 13c) Verortung ([L-1]/[L-3]) --------------------------------------------
  store.verorteWand("w-b1", gsId, { lage: { start_mm: { x: 500, y: 1500 }, richtung: "x", laenge_grid: 16 } });
  t("[L-1] Lage gespeichert", store.wandVerortung("w-b1")?.wand.lage.laenge_grid === 16);
  t("[L-3] Wandelement bleibt unberuehrt",
    store.holeElement("w-b1").wandelement.length_mm === 2000
    && !JSON.stringify(store.holeElement("w-b1")).includes("start_mm"));
  const abgleich = (id) => PM.laengenAbgleich(store.wandVerortung(id).wand.lage,
    store.holeElement(id).wandelement.length_mm);
  t("[L-3] passende Lage: keine Abweichung",
    abgleich("w-b1").abweichung === false && abgleich("w-b1").lage_mm === 2000);
  store.verorteWand("w-b1", gsId, { lage: { start_mm: { x: 500, y: 1500 }, richtung: "x", laenge_grid: 20 } });
  t("[L-3] Laengenabweichung wird gemeldet, nicht angeglichen",
    abgleich("w-b1").abweichung === true && abgleich("w-b1").lage_mm === 2500
    && store.holeElement("w-b1").wandelement.length_mm === 2000);
  store.verorteWand("w-b1", gsId, { lage: { start_mm: { x: 500, y: 1500 }, richtung: "x", laenge_grid: 16 } });
  t("[L-1] krumme Lage wird abgewiesen, nicht gerundet", (() => {
    try {
      store.verorteWand("w-b2", gsId, { lage: { start_mm: { x: 0.25, y: 0 }, richtung: "x", laenge_grid: 4 } });
      return false;
    } catch { return store.wandVerortung("w-b2").wand.lage === null; }
  })());
  t("[L-2] schraege Lage wird abgewiesen", (() => {
    try {
      store.verorteWand("w-b2", gsId, { lage: { start_mm: { x: 0, y: 0 }, richtung: "diagonal", laenge_grid: 4 } });
      return false;
    } catch { return true; }
  })());
  // Anzeigename der Mappe folgt dem Wandnamen; die Referenz bleibt die id ([L-4])
  store.umbenennen("w-b1", "Bestand A Nord");
  t("[L-4] Umbenennen fuehrt den Anzeigenamen der Mappe mit",
    store.wandVerortung("w-b1")?.wand.name === "Bestand A Nord"
    && store.wandVerortung("w-b1").wand.id === "w-b1");
  t("[L-3] Umbenennen laesst Lage und Wandelement unberuehrt",
    store.wandVerortung("w-b1").wand.lage.laenge_grid === 16
    && store.holeElement("w-b1").wandelement.length_mm === 2000);
  t("[L-4] Wand steht nach dem Umtragen nur einmal in der Mappe",
    PM.alleWaende(store.holeMappe()).filter((e) => e.wand.id === "w-b1").length === 1);

  // 13d) Referenzintegritaet ([L-4]) ----------------------------------------
  const idNeu = store.speichere("Unverortet", buildWall("Unverortet", 1000, 2000, []));
  const ref = store.mappeReferenzen();
  t("[L-4] neue, noch nicht verortete Wand wird als unverortet gemeldet",
    ref.unverortet.includes(idNeu));
  t("[L-4] verortete Wand gilt nicht als unverortet", !ref.unverortet.includes("w-b1"));
  t("[L-4] eingetragen aber ungezeichnet wird getrennt gemeldet",
    ref.ohneLage.some((w) => w.id === "w-b2"));
  t("[L-4] keine verwaisten Eintraege in diesem Stand", ref.verwaist.length === 0);

  // Wandelement loeschen -> Eintrag geht mit (kein dauerhaft verwaister Eintrag)
  store.loesche("w-b2");
  t("[L-4] Loeschen der Wand entfernt ihren Mappen-Eintrag",
    store.wandVerortung("w-b2") === null && store.mappeReferenzen().verwaist.length === 0);
  t("[L-4] verwaister Eintrag loescht umgekehrt NIE ein Wandelement", (() => {
    store.setzeMappe(PM.setzeWand(store.holeMappe(), gsId, { id: "w-gibtsnicht", name: "Geist" }));
    const r = store.mappeReferenzen();
    return r.verwaist.some((w) => w.id === "w-gibtsnicht") && store.listeElemente().length === 2;
  })());
  store.setzeMappe(PM.entferneWand(store.holeMappe(), "w-gibtsnicht"));

  // 13e) Datei-Roundtrip + Formattrennung -----------------------------------
  const mDatei = JSON.stringify(PM.mappeObjekt(store.holeMappe()));
  store.loescheMappe();
  t("mappe: aktives Projekt entfernt", store.holeMappe() === null && store.aktivesGeschossId() === null);
  t("mappe: Waende bleiben beim Loeschen des Projekts erhalten", store.listeElemente().length === 2);
  const wieder = store.importiereMappeText(mDatei);
  t("mappe: Import stellt die Struktur wieder her",
    PM.findeWand(store.holeMappe(), "w-b1").wand.lage.laenge_grid === 16
    && wieder.gebaeude.length === 2);
  t("mappe: Wandimport lehnt eine Mappe ab", (() => {
    try { store.importiereText(mDatei); return false; } catch { return true; }
  })());
  t("mappe: Mappenimport lehnt eine Wanddatei ab", (() => {
    try { store.importiereMappeText(JSON.stringify(store.projektObjekt(idNeu))); return false; }
    catch (e) { return /Wanddatei/.test(e.message); }
  })());
  t("mappe: ungueltige Mappe wird abgelehnt (nicht zurechtgebogen)", (() => {
    try { store.setzeMappe({ format: "SEMBLA-Projektmappe", version: 1, projekt: { id: "p" },
      gebaeude: [{ id: "g", geschosse: [{ id: "g", waende: [] }] }] }); return false; } catch { return true; }
  })());
  t("mappe: eigene Formatversion, getrennt von Projekt/Katalog/Schema",
    PM.MAPPE_VERSION === 2 && store.PROJEKT_VERSION === 2 && store.SCHEMA_VERSION === 6);
  t("mappe: eigener Speicherschluessel (nicht im Wandspeicher)",
    !!localStorage.getItem("sembla:projekte")
    && !localStorage.getItem("sembla:elemente").includes("start_mm"));

  // 13f) Geschossplan ([L-8]/[L-9]): nur die BESCHREIBUNG liegt hier ---------
  const gsP = store.wandVerortung("w-b1").geschoss.id;
  t("[L-8] Geschoss ohne Plan meldet null", store.geschossPlan(gsP) === null);
  store.setzeGeschossPlan(gsP, { datei: "eg.png", typ: "image/png", breite_px: 1600, hoehe_px: 1200 });
  t("[L-8] Planbeschreibung wird gespeichert",
    store.geschossPlan(gsP).datei === "eg.png" && store.geschossPlan(gsP).breite_px === 1600);
  t("[L-9] ohne Kalibrierung bleibt der Massstab leer", store.geschossPlan(gsP).mm_je_pixel === null);
  t("[L-8] kein Bild im localStorage — nur die Beschreibung",
    !localStorage.getItem("sembla:projekte").includes("blob")
    && !localStorage.getItem("sembla:projekte").includes("base64"));
  const lageVorher = JSON.stringify(store.wandVerortung("w-b1").wand.lage);
  store.setzeGeschossPlanAnsicht(gsP, { mm_je_pixel: 12.5, versatz_x_mm: 375, versatz_y_mm: -125 });
  t("[L-9] Kalibrierung/Versatz werden uebernommen",
    store.geschossPlan(gsP).mm_je_pixel === 12.5 && store.geschossPlan(gsP).versatz_y_mm === -125);
  t("[L-1] Kalibrierung veraendert keine Wandlage",
    JSON.stringify(store.wandVerortung("w-b1").wand.lage) === lageVorher);
  t("[L-9] unsinniger Massstab wird abgewiesen, der Stand bleibt", (() => {
    try { store.setzeGeschossPlanAnsicht(gsP, { mm_je_pixel: -5 }); return false; }
    catch { return store.geschossPlan(gsP).mm_je_pixel === 12.5; }
  })());
  t("[L-8] Plan uebersteht einen Reload (Beschreibung liegt in der Mappe)",
    PM.findeGeschoss(store.holeMappe(), gsP).geschoss.plan.mm_je_pixel === 12.5);
  store.setzeGeschossPlan(gsP, null);
  t("[L-8] Plan entfernen laesst Struktur und Lagen unberuehrt",
    store.geschossPlan(gsP) === null
    && JSON.stringify(store.wandVerortung("w-b1").wand.lage) === lageVorher);
}

// 14) Etappe C3.1: mehrere Projekte, Zeigerhierarchie, Kopfdaten, Katalog je Projekt
//     ([L-6]/[L-10]/[L-11]/[L-12])
{
  const PM = await import("../../docs/shared/sembla-projektmappe.js");
  localStorage.m.clear();

  // 14a) mehrere Projekte nebeneinander ([L-6]) ------------------------------
  const pA = store.fuegeProjektHinzu("Projekt A", { geschoss: "EG", hoehe_mm: 2600 });
  const pB = store.fuegeProjektHinzu("Projekt B", { geschoss: "OG" });
  t("[L-6] zwei Projekte liegen nebeneinander", store.listeProjekte().length === 2);
  t("[L-6] das zuletzt angelegte ist aktiv", store.holeMappe().projekt.id === pB.projekt.id);
  t("[L-6] je Projekt bleibt die Mappenform unveraendert (v1, ein Gebaeude)",
    pA.version === PM.MAPPE_VERSION && pA.gebaeude.length === 1);
  t("[L-6] Projekte sind ueber ihre Kennung einzeln lesbar",
    store.projektMappe(pA.projekt.id).projekt.name === "Projekt A");

  const gsA = pA.gebaeude[0].geschosse[0].id;
  const gsB = pB.gebaeude[0].geschosse[0].id;

  // 14b) Aktivierung ist streng hierarchisch ([L-10]) ------------------------
  t("[L-10] Geschoss eines fremden Projekts wird abgewiesen (Weg wird benannt)", (() => {
    try { store.setzeAktivesGeschoss(gsA); return false; }
    catch (e) { return /Projekt A/.test(e.message) && store.aktivesGeschossId() !== gsA; }
  })());
  t("[L-10] das fremde Projekt wird dabei NICHT still mitaktiviert",
    store.holeMappe().projekt.id === pB.projekt.id);

  store.setzeAktivesProjekt(pA.projekt.id);
  store.setzeAktivesGeschoss(gsA);
  t("[L-10] im aktiven Projekt laesst sich das Geschoss setzen", store.aktivesGeschossId() === gsA);

  const wA = store.speichere("Wand A1", buildWall("Wand A1", 2000, 2600, []));
  store.verorteWand(wA, gsA, { name: "Wand A1", lage: null });
  store.setzeAktiv(wA);
  t("[L-10] Wand im aktiven Geschoss ist aktivierbar", store.aktivId() === wA);

  const wB = store.speichere("Wand B1", buildWall("Wand B1", 1000, 2000, []));
  store.verorteWand(wB, gsB, { name: "Wand B1", lage: null });
  t("[L-10] Wand eines nicht aktiven Geschosses wird abgewiesen", (() => {
    try { store.setzeAktiv(wB); return false; }
    catch (e) { return /OG/.test(e.message) && store.aktivId() === wA; }
  })());
  t("[L-10] eine unverortete Wand hat keine Eltern und bleibt aktivierbar", (() => {
    const frei = store.speichere("Frei", buildWall("Frei", 1000, 2000, []));
    store.setzeAktiv(frei);
    const ok = store.aktivId() === frei;
    store.setzeAktiv(wA);
    return ok;
  })());

  t("[L-10] Projektwechsel hebt Geschoss- und Wandzeiger auf, statt sie umzubiegen", (() => {
    store.setzeAktivesProjekt(pB.projekt.id);
    return store.aktivesGeschossId() === null && store.aktivId() === null
      && store.aktivesGebaeudeId() === null;
  })());
  t("[L-10] Geschosswechsel hebt einen fremden Wandzeiger auf", (() => {
    store.setzeAktivesGeschoss(gsB);
    store.setzeAktiv(wB);
    store.setzeAktivesProjekt(pA.projekt.id);
    store.setzeAktivesGeschoss(gsA);
    return store.aktivId() === null;
  })());
  t("[L-10] Verorten setzt von sich aus KEINEN Zeiger um", (() => {
    const vorherPrj = store.aktivesProjektId(), vorherGs = store.aktivesGeschossId();
    const w = store.speichere("Fremdeintrag", buildWall("Fremdeintrag", 1000, 2000, []));
    store.verorteWand(w, gsB, { name: "Fremdeintrag", lage: null });
    return store.aktivesProjektId() === vorherPrj && store.aktivesGeschossId() === vorherGs
      && store.wandVerortung(w).mappe.projekt.id === pB.projekt.id;
  })());

  // 14c) Kopfdaten leben am Projekt ([L-11]) ---------------------------------
  store.setzeAktivesProjekt(pA.projekt.id);
  store.setzeAktivesGeschoss(gsA);
  store.setzeAktiv(wA);
  store.setzeKopfdaten({ bauherr: "AWG eG", planverfasser: "Polycare", plan_nr: "07" });
  t("[L-11] Kopfdaten liegen am Projekt", store.holeMappe().projekt.kopfdaten.bauherr === "AWG eG");
  t("[L-11] Kopfdaten wirken auf die Wand des Projekts", (() => {
    const k = store.wirksameKopfdaten(wA);
    return k.quelle === "projekt" && k.kopfdaten.bauherr === "AWG eG"
      && k.kopfdaten.name === "Projekt A";
  })());
  t("[L-11] das Wandelement traegt die Kopfdaten NICHT",
    !JSON.stringify(store.holeElement(wA)).includes("AWG eG"));
  t("[L-11] leeres Feld loescht, unbekanntes Feld wird abgewiesen", (() => {
    store.setzeKopfdaten({ plan_nr: "" });
    let warf = false;
    try { store.setzeKopfdaten({ erfunden: "x" }); } catch { warf = true; }
    return store.holeMappe().projekt.kopfdaten.plan_nr === undefined && warf;
  })());
  t("[L-11] Altbestand nur als RUECKFALL fuer eine Wand ohne Projekt", (() => {
    const frei = store.speichere("Alt", buildWall("Alt", 1000, 2000, []),
      undefined, { projekt: { name: "Altprojekt", bauherr: "Alt-Bauherr" } });
    const k = store.wirksameKopfdaten(frei);
    return k.quelle === "wandelement" && k.kopfdaten.bauherr === "Alt-Bauherr";
  })());
  t("[L-11] es wird NIE zusammengefuehrt — genau eine Quelle gilt", (() => {
    store.mergeEingaben("projekt", { bauherr: "Alt am Element" }, wA);
    const k = store.wirksameKopfdaten(wA);
    return k.quelle === "projekt" && k.kopfdaten.bauherr === "AWG eG"
      && store.holeEingaben(wA).projekt.bauherr === "Alt am Element";
  })());
  t("[L-11] der Export traegt die wirksamen Kopfdaten",
    store.projektObjekt(wA).eingaben.projekt.bauherr === "AWG eG");

  // 14d) Ein Bauteilkatalog je Projekt ([L-12]) ------------------------------
  const K1 = { format: "SEMBLA-Bauteilkatalog", version: 1, name: "Katalog 1",
    produkte: [{ id: "p1", kategorie: "gewindestange", bezeichnung: "M10", einheit: "Stk",
                 preis: 1, gewinde: "M10", guete: "8.8", laenge_mm: 1100 }] };
  t("[L-12] ohne Zuordnung gibt es keinen Katalog — und keinen geratenen",
    store.holeKatalog() === null && store.katalogStatus().status === "nicht_zugeordnet");
  const k1 = store.setzeKatalog(K1);
  t("[L-12] gespeicherter Katalog wird dem aktiven Projekt zugeordnet",
    store.holeMappe().katalog === k1.id && store.holeKatalog().name === "Katalog 1");
  t("[L-12] das andere Projekt bekommt ihn NICHT", (() => {
    store.setzeAktivesProjekt(pB.projekt.id);
    return store.holeKatalog() === null && store.projektMappe(pB.projekt.id).katalog === null;
  })());
  const k2 = store.setzeKatalog({ ...K1, name: "Katalog 2" });
  t("[L-12] ein zweiter Katalog tritt neben den ersten (kein Ueberschreiben)",
    store.listeKataloge().length === 2 && k2.id !== k1.id
    && store.katalogNachId(k1.id).name === "Katalog 1");
  t("[L-12] der wirksame Katalog folgt dem aktiven Projekt", (() => {
    store.setzeAktivesProjekt(pA.projekt.id);
    const a = store.holeKatalog().name;
    store.setzeAktivesProjekt(pB.projekt.id);
    return a === "Katalog 1" && store.holeKatalog().name === "Katalog 2";
  })());
  t("[L-12] Zuordnung auf einen vorhandenen Katalog umhaengen", (() => {
    store.setzeProjektKatalog(k1.id);
    return store.holeKatalog().name === "Katalog 1" && store.listeKataloge().length === 2;
  })());
  t("[L-12] unbekannte Katalogkennung wird abgewiesen", (() => {
    try { store.setzeProjektKatalog("kat-gibtsnicht"); return false; }
    catch { return store.holeKatalog().name === "Katalog 1"; }
  })());
  t("[L-12] Zuordnung aufheben laesst einen noch genutzten Katalog stehen", (() => {
    store.loescheKatalog();                     // Katalog 1 haengt noch an Projekt A
    return store.holeKatalog() === null && store.katalogNachId(k1.id) !== null;
  })());
  t("[L-12] fehlender Katalog wird gemeldet, nicht ersetzt", (() => {
    store.setzeProjektKatalog(k2.id);
    const speicher = JSON.parse(localStorage.getItem("sembla:kataloge"));
    delete speicher[k2.id];
    localStorage.setItem("sembla:kataloge", JSON.stringify(speicher));
    const st = store.katalogStatus();
    return st.status === "fehlt" && st.katalog === null
      && store.projektMappe(pB.projekt.id).katalog === k2.id;
  })());
  t("[L-12] Katalog liegt in einem eigenen Speicher, nicht in der Mappe",
    !localStorage.getItem("sembla:projekte").includes("Katalog 1")
    && !!localStorage.getItem("sembla:kataloge"));

  // 14e) Projekt loeschen laesst Wandelemente stehen ([L-4]) -----------------
  const vorherElemente = store.listeElemente().length;
  store.loescheProjekt(pB.projekt.id);
  t("[L-4] geloeschtes Projekt: Wandelemente bleiben erhalten",
    store.listeElemente().length === vorherElemente && store.holeElement(wB) !== null);
  t("[L-4] die Waende gelten danach als nicht eingetragen",
    store.wandVerortung(wB) === null && store.mappeReferenzen().unverortet.includes(wB));
  t("[L-10] die Zeiger des geloeschten Projekts sind aufgehoben",
    store.aktivesProjektId() === null && store.aktivesGeschossId() === null);
}

// 15) #74: dupliziere() und loesche() mit Bemassungsbereinigung --------------
{
  const M = await import("../../docs/shared/sembla-projektmappe.js");
  const p74 = store.fuegeProjektHinzu("Projekt 74", { geschoss: "EG74", hoehe_mm: 2600 });
  const g74 = M.alleGeschosse(p74)[0].geschoss.id;
  store.setzeAktivesGeschoss(g74);

  const idQ = store.speichere("Quelle", buildWall("Quelle", 3000, 2600, []));
  store.mergeEingaben("statik", { merkmal: "quelle" }, idQ);
  store.verorteWand(idQ, g74, { lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 24 } });
  const idN = store.speichere("Nachbar", buildWall("Nachbar", 2000, 2600, []));
  store.verorteWand(idN, g74, { lage: { start_mm: { x: 500, y: 2062.5 }, richtung: "x", laenge_grid: 16 } });
  // Ein Mass haengt an der Quelle, eines NUR am Nachbarn — Letzteres muss das
  // Loeschen der Quelle ueberleben (kein fremdes Mass wird angefasst).
  store.aendereMappe((m) => M.setzeBemassung(m, g74, {
    id: "bm-quelle", achse: "y", von: { wand: idQ, bezug: "mitte" }, bis: { wand: idN, bezug: "mitte" }, mass_mm: 2000,
  }));
  store.aendereMappe((m) => M.setzeBemassung(m, g74, {
    id: "bm-nachbar", achse: "x", von: null, bis: { wand: idN, bezug: "min" }, mass_mm: 500,
  }));

  // --- dupliziere() ---------------------------------------------------------
  const idK = store.dupliziere(idQ, "Quelle (Kopie)");
  const kopie = store.holeElement(idK);
  t("#74 dupliziere: NEUE stabile id und unterscheidbarer Name",
    typeof idK === "string" && idK !== idQ && kopie.name === "Quelle (Kopie)");
  t("#74 dupliziere: Wandelement und Eingaben sind inhaltsgleich kopiert",
    JSON.stringify(kopie.wandelement) === JSON.stringify(store.holeElement(idQ).wandelement)
    && kopie.eingaben?.statik?.merkmal === "quelle");
  t("#74 dupliziere: die Kopie ist unverortet und traegt keine Beziehungen",
    store.wandVerortung(idK) === null
    && !JSON.stringify(M.bemassungen(store.holeMappe(), g74)).includes(idK));
  store.mergeEingaben("statik", { merkmal: "kopie" }, idK);
  store.speichere("Quelle (Kopie)", buildWall("Quelle (Kopie)", 2000, 2600, []), idK);
  t("#74 dupliziere: die Kopie ist unabhaengig — die Quelle bleibt bit-genau stehen",
    store.holeElement(idQ).eingaben.statik.merkmal === "quelle"
    && store.holeElement(idQ).wandelement.length_mm === 3000
    && store.holeElement(idK).wandelement.length_mm === 2000);
  t("#74 dupliziere: eine unbekannte Quelle wird abgewiesen",
    (() => { try { store.dupliziere("gibtsnicht"); return false; } catch { return true; } })());

  // --- loesche() mit Bemassungsbereinigung ----------------------------------
  store.setzeAktiv(idQ);
  const erg74 = store.loesche(idQ);
  t("#74 loesche: GENAU das anhaengende Mass wird entfernt und benannt",
    erg74.bemassungen.join(",") === "bm-quelle"
    && M.bemassungen(store.holeMappe(), g74).map((b) => b.id).join(",") === "bm-nachbar");
  t("#74 loesche: Wandelement und Geschosseintrag sind weg, der Nachbar bleibt",
    store.holeElement(idQ) === null && store.wandVerortung(idQ) === null
    && store.holeElement(idN) !== null && store.wandVerortung(idN) !== null);
  t("#74 loesche: der zeigende Aktiv-Zeiger ist bereinigt", store.aktivId() === null);
  t("#74 loesche: unbekannte id aendert nichts und meldet nichts",
    store.loesche("gibtsnicht").bemassungen.length === 0
    && M.bemassungen(store.holeMappe(), g74).length === 1);
}

// 16) [P-20]/#81: Mengenuebersteuerung der Baustellenstueckliste -------------
// Geprueft wird der SPEICHERWEG: setzen, einzeln zuruecksetzen, unzulaessige Werte,
// der Weg durch Projekt-Export/-Import und das warnungsfreie Laden eines Altprojekts
// ohne diesen Abschnitt.
{
  const idM = store.speichere("Mengenwand", buildWall("Mengenwand", 2000, 2600, []));
  store.setzeAktiv(idM);
  const kSt = store.mengenKennung({ key: "i3", fertigmass_mm: null });
  const kRod = store.mengenKennung({ key: "rod_std", fertigmass_mm: 1100 });
  t("[P-20] die Kennung enthaelt zwingend das Fertigmass",
    kSt === "i3@-" && kRod === "rod_std@1100");
  t("[P-20] ohne Uebersteuerung ist der Abschnitt leer",
    Object.keys(store.holeMengen(idM)).length === 0
    && JSON.stringify(store.standardEingaben().kosten.mengen) === "{}");

  store.setzeMengenUebersteuerung(kSt, 12, idM);
  store.setzeMengenUebersteuerung(kRod, 4, idM);
  t("[P-20] setzen: beide Uebersteuerungen stehen im Eingabenabschnitt der Wand",
    store.holeMengen(idM)[kSt] === 12 && store.holeEingaben(idM).kosten.mengen[kRod] === 4);
  t("[P-20] das Wandelement bleibt unberuehrt",
    !JSON.stringify(store.holeElement(idM).wandelement).includes("mengen"));
  t("[P-20] die Uebersteuerung liegt weder in der Mappe noch im Katalog",
    !(localStorage.getItem("sembla:projekte") || "").includes(kRod)
    && !(localStorage.getItem("sembla:kataloge") || "").includes(kRod));

  store.setzeMengenUebersteuerung(kSt, null, idM);
  t("[P-20] zuruecksetzen entfernt GENAU einen Schluessel (kein Rest, kein Ersatzwert)",
    !(kSt in store.holeMengen(idM)) && store.holeMengen(idM)[kRod] === 4
    && Object.keys(store.holeMengen(idM)).length === 1);

  const werfen = (wert) => {
    try { store.setzeMengenUebersteuerung(kRod, wert, idM); return null; }
    catch (e) { return e.message; }
  };
  t("[P-20] eine nicht ganzzahlige Menge wird benannt abgewiesen",
    /ganzzahlig/.test(werfen(2.5) || "") && store.holeMengen(idM)[kRod] === 4);
  t("[P-20] eine negative Menge wird benannt abgewiesen",
    /negativ/.test(werfen(-1) || "") && store.holeMengen(idM)[kRod] === 4);
  t("[P-20] eine unbekannte Positionskennung wird abgewiesen", (() => {
    try { store.setzeMengenUebersteuerung("ohne-fertigmass", 3, idM); return false; }
    catch (e) { return /Positionskennung/.test(e.message); }
  })());
  t("[P-20] pruefeMenge: 0 ist zulaessig, Text nicht, Ziffernfolge wird gedeutet",
    store.pruefeMenge(0).ok === true && store.pruefeMenge("abc").ok === false
    && store.pruefeMenge("7").wert === 7 && store.pruefeMenge("").ok === false);

  // Projekt-Export -> Import: die Uebersteuerung reist unveraendert mit ([P-2], ohne Bump).
  const datei = JSON.stringify(store.projektObjekt(idM));
  t("[P-20] die Projektdatei traegt den Abschnitt und bleibt Version 2",
    JSON.parse(datei).version === 2 && JSON.parse(datei).eingaben.kosten.mengen[kRod] === 4);
  const idImp = store.importiereText(datei, "Mengenwand.json");
  t("[P-20] M4: Export und Import lassen die Uebersteuerung unveraendert",
    idImp !== idM && store.holeMengen(idImp)[kRod] === 4
    && Object.keys(store.holeMengen(idImp)).length === 1);

  // Altprojekt OHNE den Abschnitt: laedt warnungsfrei und ganz ohne Uebersteuerungen.
  const altText = JSON.stringify({
    format: "SEMBLA-Projekt", version: 2, name: "Altwand ohne Mengen",
    wandelement: buildWall("Altwand ohne Mengen", 2000, 2600, []),
    eingaben: { kosten: { waehrung: "EUR", preise: { i3: 9.5 } } },
  });
  const idAltM = store.importiereText(altText, "AltwandOhneMengen.json");
  t("[P-20] ein Altprojekt ohne den Abschnitt laedt ohne Uebersteuerungen",
    Object.keys(store.holeMengen(idAltM)).length === 0
    && store.holeEingaben(idAltM).kosten.waehrung === "EUR"
    && store.holeEingaben(idAltM).kosten.preise.i3 === 9.5);
  // Kein Formatsprung und keine Migration: der Abschnitt ist optional und wird beim LESEN
  // aus `standardEingaben()` aufgefuellt.
  t("[P-20] die Versionsachsen bleiben unveraendert",
    store.PROJEKT_VERSION === 2 && store.SCHEMA_VERSION === 6
    && store.migrieren() === 6);

  // --- Kommentar je Position ([P-20], #81) ---------------------------------
  // Reine Zusatzangabe an DERSELBEN Positionskennung. Geprueft wird der Speicherweg:
  // setzen, einzeln entfernen, unzulaessige Werte, die Unabhaengigkeit von der
  // Mengenuebersteuerung derselben Wand und der Roundtrip ueber die Projektdatei.
  t("[P-20] ohne Kommentar ist der Abschnitt leer",
    Object.keys(store.holeKommentare(idM)).length === 0
    && JSON.stringify(store.standardEingaben().kosten.kommentare) === "{}");

  const mengenVorher = JSON.stringify(store.holeMengen(idM));
  store.setzeKommentar(kSt, "  zwei Steine gebrochen  ", idM);
  store.setzeKommentar(kRod, "Reserve fuer Nachschnitt", idM);
  t("[P-20] Kommentar landet unter der Positionskennung der Wand — getrimmt",
    store.holeKommentare(idM)[kSt] === "zwei Steine gebrochen"
    && store.holeEingaben(idM).kosten.kommentare[kRod] === "Reserve fuer Nachschnitt");
  t("[P-20] der Kommentar laesst die Mengenuebersteuerung derselben Wand unberuehrt",
    JSON.stringify(store.holeMengen(idM)) === mengenVorher
    && store.holeMengen(idM)[kRod] === 4);
  t("[P-20] der Kommentar steht nicht im Wandelement",
    !JSON.stringify(store.holeElement(idM).wandelement).includes("kommentare")
    && !JSON.stringify(store.holeElement(idM).wandelement).includes("gebrochen"));
  t("[P-20] der Kommentar liegt weder in der Mappe noch im Katalog",
    !(localStorage.getItem("sembla:projekte") || "").includes("gebrochen")
    && !(localStorage.getItem("sembla:kataloge") || "").includes("gebrochen"));

  store.setzeKommentar(kSt, "", idM);
  t("[P-20] Leeren entfernt GENAU einen Kommentar (kein Rest, kein Ersatztext)",
    !(kSt in store.holeKommentare(idM))
    && store.holeKommentare(idM)[kRod] === "Reserve fuer Nachschnitt"
    && Object.keys(store.holeKommentare(idM)).length === 1);
  store.setzeKommentar(kSt, "wieder da", idM);
  store.setzeKommentar(kSt, null, idM);
  t("[P-20] auch null entfernt genau diesen Kommentar",
    !(kSt in store.holeKommentare(idM)) && Object.keys(store.holeKommentare(idM)).length === 1);

  const werfenK = (wert) => {
    try { store.setzeKommentar(kRod, wert, idM); return null; }
    catch (e) { return e.message; }
  };
  t("[P-20] ein mehrzeiliger Kommentar wird benannt abgewiesen",
    /mehrzeilig/.test(werfenK("erste\nzweite") || "")
    && store.holeKommentare(idM)[kRod] === "Reserve fuer Nachschnitt");
  t("[P-20] ein zu langer Kommentar wird benannt abgewiesen, nie gekuerzt",
    /Zeichen/.test(werfenK("x".repeat(store.KOMMENTAR_MAX + 1)) || "")
    && store.holeKommentare(idM)[kRod] === "Reserve fuer Nachschnitt");
  t("[P-20] ein Nicht-Text wird benannt abgewiesen",
    /kein Text/.test(werfenK(42) || "") && store.holeKommentare(idM)[kRod] === "Reserve fuer Nachschnitt");
  t("[P-20] eine unbekannte Positionskennung wird auch beim Kommentar abgewiesen", (() => {
    try { store.setzeKommentar("ohne-fertigmass", "x", idM); return false; }
    catch (e) { return /Positionskennung/.test(e.message); }
  })());
  t("[P-20] pruefeKommentar: genau die Laengengrenze ist noch zulaessig",
    store.KOMMENTAR_MAX === 200
    && store.pruefeKommentar("x".repeat(store.KOMMENTAR_MAX)).ok === true
    && store.pruefeKommentar("x".repeat(store.KOMMENTAR_MAX + 1)).ok === false
    && store.pruefeKommentar("").ok === true && store.pruefeKommentar(null).ok === false);

  // Projekt-Export -> Import: der Kommentar reist unveraendert mit ([P-2], ohne Bump).
  const dateiK = JSON.stringify(store.projektObjekt(idM));
  t("[P-20] die Projektdatei traegt den Kommentar und bleibt Version 2",
    JSON.parse(dateiK).version === 2
    && JSON.parse(dateiK).eingaben.kosten.kommentare[kRod] === "Reserve fuer Nachschnitt");
  const idImpK = store.importiereText(dateiK, "MengenwandK.json");
  t("[P-20] Export und Import lassen den Kommentar unveraendert",
    store.holeKommentare(idImpK)[kRod] === "Reserve fuer Nachschnitt"
    && Object.keys(store.holeKommentare(idImpK)).length === 1
    && store.holeMengen(idImpK)[kRod] === 4);

  // Altprojekt ohne den Abschnitt: laedt warnungsfrei und ganz ohne Kommentare.
  t("[P-20] ein Altprojekt ohne den Abschnitt laedt ohne Kommentare",
    Object.keys(store.holeKommentare(idAltM)).length === 0);
  t("[P-20] der Kommentar bringt keinen Schema- oder Formatsprung",
    store.PROJEKT_VERSION === 2 && store.SCHEMA_VERSION === 6 && store.migrieren() === 6);
}

// 17) [#82]: Verzahnungsbereiche ueberstehen Export, Import und Duplizieren unveraendert
// Geprueft wird der Roundtrip ueber die echten Pfade: Wandelement mit Verzahnung ueber
// buildWall() erzeugen, speichern, projektObjekt() exportieren, importiereText() importieren
// und dupliziere() kopieren — die Bereiche muessen wertgleich erhalten bleiben.
{
  // Wand mit zwei Verzahnungsbereichen: g0=0, g1=2 mit start_parity=0 und g0=6, g1=8 mit start_parity=1
  const ilWand = buildWall("Verzahnt", 2000, 2600, [], null, null, [],
    [{ g0: 0, g1: 2, start_parity: 0 }, { g0: 6, g1: 8, start_parity: 1 }]);
  t("[#82] buildWall erzeugt das interlocks-Feld",
    Array.isArray(ilWand.interlocks) && ilWand.interlocks.length === 2);
  t("[#82] die Bereiche haben die richtigen Grenzen und Startparitaeten",
    ilWand.interlocks[0].g0 === 0 && ilWand.interlocks[0].g1 === 2 && ilWand.interlocks[0].start_parity === 0
    && ilWand.interlocks[1].g0 === 6 && ilWand.interlocks[1].g1 === 8 && ilWand.interlocks[1].start_parity === 1);

  const idIl = store.speichere("Verzahnt", ilWand);
  store.setzeAktiv(idIl);
  t("[#82] gespeichertes Wandelement traegt die Verzahnungsbereiche",
    store.holeElement(idIl).wandelement.interlocks.length === 2);

  // Einzelwand-Export -> Import: interlocks muessen wertgleich erhalten bleiben
  const pIl = store.projektObjekt(idIl);
  t("[#82] Export traegt die Verzahnungsbereiche im Wandelement",
    pIl.wandelement.interlocks.length === 2
    && pIl.wandelement.interlocks[0].start_parity === 0
    && pIl.wandelement.interlocks[1].start_parity === 1);
  t("[#82] Export bleibt Projektformat v2 (interlocks ist optionales Feld)",
    pIl.version === 2 && store.PROJEKT_VERSION === 2);
  t("[#82] die Verzahnungsbereiche liegen NICHT in eingaben",
    !JSON.stringify(pIl.eingaben).includes("interlocks"));

  const jsonIl = JSON.stringify(pIl);
  const idIlImp = store.importiereText(jsonIl, "Verzahnt.json");
  t("[#82] Import erhaelt die Verzahnungsbereiche unveraendert",
    store.holeElement(idIlImp).wandelement.interlocks.length === 2);
  t("[#82] Import erhaelt Grenzen und Startparitaeten wertgleich",
    store.holeElement(idIlImp).wandelement.interlocks[0].g0 === 0
    && store.holeElement(idIlImp).wandelement.interlocks[0].g1 === 2
    && store.holeElement(idIlImp).wandelement.interlocks[0].start_parity === 0
    && store.holeElement(idIlImp).wandelement.interlocks[1].g0 === 6
    && store.holeElement(idIlImp).wandelement.interlocks[1].g1 === 8
    && store.holeElement(idIlImp).wandelement.interlocks[1].start_parity === 1);
  t("[#82] Import aendert die uebrige Wandgeometrie nicht",
    store.holeElement(idIlImp).wandelement.length_mm === 2000
    && store.holeElement(idIlImp).wandelement.courses.length === ilWand.courses.length);

  // Duplizieren: tiefe Kopie ohne geteilte Referenz
  const idIlKopie = store.dupliziere(idIl, "Verzahnt (Kopie)");
  t("[#82] dupliziere uebernimmt die Verzahnungsbereiche",
    store.holeElement(idIlKopie).wandelement.interlocks.length === 2
    && store.holeElement(idIlKopie).wandelement.interlocks[0].start_parity === 0);
  // Pruefen, dass es eine echte Kopie ist (keine geteilte Referenz)
  store.holeElement(idIlKopie).wandelement.interlocks[0].g0 = 999;
  t("[#82] dupliziere: keine geteilte Referenz (Quelle bleibt unveraendert)",
    store.holeElement(idIl).wandelement.interlocks[0].g0 === 0);

  // Wand OHNE Verzahnungsbereiche: bleibt ohne und laedt meldungsfrei
  const ohneIl = buildWall("Ohne Verzahnung", 2000, 2600, []);
  t("[#82] Wand ohne interlocks hat leeres Array oder fehlendes Feld",
    !ohneIl.interlocks || ohneIl.interlocks.length === 0);
  const idOhneIl = store.speichere("Ohne Verzahnung", ohneIl);
  const pOhneIl = store.projektObjekt(idOhneIl);
  const idOhneIlImp = store.importiereText(JSON.stringify(pOhneIl), "OhneVerzahnung.json");
  t("[#82] Wand ohne Verzahnung ueberlebt den Roundtrip ohne Bereiche",
    !store.holeElement(idOhneIlImp).wandelement.interlocks
    || store.holeElement(idOhneIlImp).wandelement.interlocks.length === 0);

  // Altbestand-Datei OHNE das Feld: laedt meldungsfrei als Wand ohne Verzahnung
  const altOhneIl = JSON.stringify({
    format: "SEMBLA-Projekt", version: 2, name: "Altwand ohne interlocks",
    wandelement: (() => { const w = buildWall("Altwand", 2000, 2600, []); delete w.interlocks; return w; })(),
    eingaben: {},
  });
  const idAltOhneIl = store.importiereText(altOhneIl, "AltwandOhneInterlocks.json");
  t("[#82] Altbestand ohne interlocks-Feld laedt meldungsfrei",
    store.holeElement(idAltOhneIl) !== null);
  t("[#82] Altbestand erfindet keine Verzahnungsbereiche",
    !store.holeElement(idAltOhneIl).wandelement.interlocks
    || store.holeElement(idAltOhneIl).wandelement.interlocks.length === 0);

  // Aufraeumen
  for (const x of [idIl, idIlImp, idIlKopie, idOhneIl, idOhneIlImp, idAltOhneIl]) store.loesche(x);
}

// 18) #85: Struktur loeschen — wahlweise MIT den zugeordneten Wandelementen -
// Geprueft wird der ECHTE Pfad: Projekt, zwei Geschosse und drei Wandelemente ueber
// die regulaeren Funktionen anlegen und verorten, daneben ein FREMDES Projekt mit
// einer Wand, die nie angefasst werden darf. Dann Geschoss, Gebaeude und Projekt je
// einmal mit und einmal ohne Mitloeschen entfernen und Elementliste,
// Mappenreferenzen und Rueckgabemeldung pruefen.
{
  const PM = await import("../../docs/shared/sembla-projektmappe.js");

  /** Ausgangslage: „Löschprojekt“ (EG: zwei Wände, OG: eine Wand) + „Fremdprojekt“. */
  function baue() {
    localStorage.m.clear();
    const p = store.fuegeProjektHinzu("Löschprojekt", { geschoss: "EG", hoehe_mm: 2600 });
    const eg = PM.alleGeschosse(p)[0].geschoss.id;
    const geb = p.gebaeude[0].id;
    let og = null;
    store.aendereMappe((m) => {
      const r = PM.fuegeGeschossHinzu(m, geb, "OG", 2600);
      og = r.id;
      return r.mappe;
    });
    const w1 = store.speichere("Wand 1", buildWall("Wand 1", 2000, 2600, []));
    const w2 = store.speichere("Wand 2", buildWall("Wand 2", 1000, 2600, []));
    const w3 = store.speichere("Wand 3", buildWall("Wand 3", 1500, 2600, []));
    store.verorteWand(w1, eg, { name: "Wand 1",
      lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 16 } });
    store.verorteWand(w2, eg, { name: "Wand 2", lage: null });
    store.verorteWand(w3, og, { name: "Wand 3", lage: null });
    // Das fremde Projekt entsteht ZULETZT (es wird dabei aktiv) — seine Wand ist die
    // Gegenprobe fuer „nichts ausserhalb der geloeschten Struktur“.
    const pf = store.fuegeProjektHinzu("Fremdprojekt", { geschoss: "Fremd-EG" });
    const gsF = PM.alleGeschosse(pf)[0].geschoss.id;
    const wF = store.speichere("Fremdwand", buildWall("Fremdwand", 3000, 2600, []));
    store.verorteWand(wF, gsF, { name: "Fremdwand", lage: null });
    return { p: p.projekt.id, geb, eg, og, w1, w2, w3, wF, fremd: pf.projekt.id };
  }
  const geschossWeg = (pid, gsId) => {
    const m = store.projektMappe(pid);
    return !!m && PM.findeGeschoss(m, gsId) === null;
  };

  // 18a) Vorschau: die EINE Quelle der Anzahl — sie schreibt nichts ------------
  {
    const f = baue();
    const vorher = localStorage.getItem("sembla:elemente");
    const info = store.strukturWaende("geschoss", f.eg);
    t("[#85] Vorschau zaehlt genau die Waende dieses Geschosses",
      info.waende.length === 2 && info.vorhanden.length === 2 && info.verwaist.length === 0
      && info.name === "EG" && info.projekt === "Löschprojekt");
    t("[#85] Vorschau nennt die Geschosse (fuer die Planbild-Aufraeumung, [L-8])",
      info.geschosse.length === 1 && info.geschosse[0].id === f.eg && info.geschosse[0].hatPlan === false);
    t("[#85] Vorschau ueber das Projekt umfasst beide Geschosse und alle drei Waende",
      store.strukturWaende("projekt", f.p).waende.length === 3
      && store.strukturWaende("projekt", f.p).geschosse.length === 2);
    t("[#85] Vorschau ueber das Gebaeude ebenso",
      store.strukturWaende("gebaeude", f.geb).waende.length === 3);
    t("[#85] die Vorschau schreibt nichts", localStorage.getItem("sembla:elemente") === vorher);
    t("[#85] unbekannte Kennung -> null, kein geratener Treffer",
      store.strukturWaende("geschoss", "gs-gibtsnicht") === null
      && store.loescheGeschoss("gs-gibtsnicht") === null);
  }

  // 18b) Geschoss mit zwei Waenden, Zusatzfrage JA ---------------------------
  {
    const f = baue();
    const erg = store.loescheGeschoss(f.eg, { mitWaenden: true });
    t("[#85] Ja: beide Wandelemente sind aus dem Wandspeicher verschwunden",
      store.holeElement(f.w1) === null && store.holeElement(f.w2) === null);
    t("[#85] Ja: der Geschosseintrag ist ebenfalls weg", geschossWeg(f.p, f.eg));
    t("[#85] Ja: die Bilanz nennt entfernte und erhaltene Wandelemente",
      erg.entfernt.length === 2 && erg.erhalten.length === 0
      && erg.entfernt.map((w) => w.name).sort().join(",") === "Wand 1,Wand 2");
    t("[#85] Ja: kein Wandelement ausserhalb der geloeschten Struktur",
      store.holeElement(f.w3) !== null && store.holeElement(f.wF) !== null
      && store.wandVerortung(f.w3) !== null && store.wandVerortung(f.wF) !== null);
    t("[#85] Ja: es bleibt kein verwaister Eintrag zurueck",
      store.mappeReferenzen().verwaist.length === 0);
  }

  // 18c) Gleiche Ausgangslage, Zusatzfrage NEIN ------------------------------
  {
    const f = baue();
    const erg = store.loescheGeschoss(f.eg, { mitWaenden: false });
    t("[#85] Nein: beide Wandelemente existieren unveraendert weiter",
      store.holeElement(f.w1).wandelement.length_mm === 2000
      && store.holeElement(f.w2).wandelement.length_mm === 1000);
    t("[#85] Nein: sie gelten danach als nicht eingetragen ([L-4])",
      store.wandVerortung(f.w1) === null && store.wandVerortung(f.w2) === null
      && store.mappeReferenzen().unverortet.includes(f.w1)
      && store.mappeReferenzen().unverortet.includes(f.w2));
    t("[#85] Nein: die Bilanz weist 0 entfernte und 2 erhaltene aus",
      erg.entfernt.length === 0 && erg.erhalten.length === 2 && erg.mitWaenden === false);
    t("[#85] Nein: der Geschosseintrag ist trotzdem weg", geschossWeg(f.p, f.eg));
    // OHNE Angabe gilt genau dasselbe — mitgeloescht wird nie ohne ausdrueckliches Ja.
    const ergOg = store.loescheGeschoss(f.og);
    t("[#85] ohne Angabe wird NICHT mitgeloescht (keine Vorbelegung)",
      store.holeElement(f.w3) !== null && ergOg.mitWaenden === false && ergOg.erhalten.length === 1);
  }

  // 18d) Projekt mit zwei Geschossen und je einer Wand, JA -------------------
  {
    const f = baue();
    store.setzeAktivesProjekt(f.p);
    store.setzeAktivesGeschoss(f.eg);
    store.setzeAktiv(f.w1);
    const fremdVorher = JSON.stringify(store.holeElement(f.wF));
    const erg = store.loescheProjekt(f.p, { mitWaenden: true });
    t("[#85] Projekt/Ja: alle drei zugeordneten Wandelemente sind weg",
      store.holeElement(f.w1) === null && store.holeElement(f.w2) === null
      && store.holeElement(f.w3) === null && erg.entfernt.length === 3);
    t("[#85] Projekt/Ja: die Wand des anderen Projekts bleibt bit-genau erhalten",
      JSON.stringify(store.holeElement(f.wF)) === fremdVorher
      && store.wandVerortung(f.wF).mappe.projekt.id === f.fremd);
    t("[#85] Projekt/Ja: das Projekt selbst ist entfernt",
      store.projektMappe(f.p) === null && store.listeProjekte().length === 1);
    t("[#85] Projekt/Ja: die Zeiger darunter sind aufgehoben ([L-10])",
      store.aktivesProjektId() === null && store.aktivesGeschossId() === null
      && store.aktivId() === null);
    t("[#85] Projekt/Ja: die entfernte Mappe steht im Bericht",
      erg.mappe.projekt.id === f.p && erg.name === "Löschprojekt");
  }
  {
    // Gegenprobe NEIN auf Projektebene: die Struktur geht, die Wandelemente bleiben.
    const f = baue();
    const erg = store.loescheProjekt(f.p, { mitWaenden: false });
    t("[#85] Projekt/Nein: alle drei Wandelemente bleiben und sind nicht eingetragen",
      store.holeElement(f.w1) !== null && store.holeElement(f.w2) !== null
      && store.holeElement(f.w3) !== null && erg.erhalten.length === 3
      && [f.w1, f.w2, f.w3].every((id) => store.mappeReferenzen().unverortet.includes(id)));
  }

  // 18e) Verwaister Mappeneintrag: uebergangen und BENANNT ([L-4]) -----------
  {
    const f = baue();
    store.setzeMappe(PM.setzeWand(store.projektMappe(f.p), f.eg,
      { id: "w-geist", name: "Geisterwand" }));
    const info = store.strukturWaende("geschoss", f.eg);
    t("[#85] die Vorschau trennt vorhandene und verwaiste Eintraege",
      info.waende.length === 3 && info.vorhanden.length === 2
      && info.verwaist.length === 1 && info.verwaist[0].name === "Geisterwand");
    const erg = store.loescheGeschoss(f.eg, { mitWaenden: true });
    t("[#85] der Vorgang laeuft durch und benennt den verwaisten Eintrag",
      erg.entfernt.length === 2 && erg.verwaist.length === 1
      && erg.verwaist[0].name === "Geisterwand");
    t("[#85] Geschoss weg, kein verwaister Rest, fremde Waende unberuehrt",
      geschossWeg(f.p, f.eg) && store.mappeReferenzen().verwaist.length === 0
      && store.holeElement(f.w3) !== null && store.holeElement(f.wF) !== null);
  }

  // 18f) Gebaeude — nur Speicherfunktion, kein Bedienelement in Modul 0 ------
  {
    const f = baue();
    const erg = store.loescheGebaeude(f.geb, { mitWaenden: false });
    t("[#85] Gebaeude/Nein: alle drei Wandelemente bleiben erhalten",
      store.holeElement(f.w1) !== null && store.holeElement(f.w2) !== null
      && store.holeElement(f.w3) !== null && erg.erhalten.length === 3);
    t("[#85] Gebaeude/Nein: Gebaeude samt Geschossen ist aus der Mappe entfernt",
      store.projektMappe(f.p).gebaeude.length === 0
      && PM.alleWaende(store.projektMappe(f.p)).length === 0);
  }
  {
    const f = baue();
    store.setzeAktivesProjekt(f.p);
    store.setzeAktivesGeschoss(f.og);
    const erg = store.loescheGebaeude(f.geb, { mitWaenden: true });
    t("[#85] Gebaeude/Ja: alle drei zugeordneten Wandelemente sind weg",
      store.holeElement(f.w1) === null && store.holeElement(f.w2) === null
      && store.holeElement(f.w3) === null && erg.entfernt.length === 3);
    t("[#85] Gebaeude/Ja: die Wand des anderen Projekts bleibt",
      store.holeElement(f.wF) !== null && store.wandVerortung(f.wF) !== null);
    t("[#85] Gebaeude/Ja: Gebaeude- und Geschosszeiger sind aufgehoben ([L-10])",
      store.aktivesGebaeudeId() === null && store.aktivesGeschossId() === null
      && store.aktivesProjektId() === f.p);
    t("[#85] Gebaeude/Ja: das Projekt selbst bleibt bestehen",
      store.projektMappe(f.p) !== null && store.projektMappe(f.p).gebaeude.length === 0);
  }

  // 18g) Kein neues Feld, kein Versionssprung --------------------------------
  {
    const f = baue();
    store.loescheGeschoss(f.eg, { mitWaenden: true });
    t("[#85] es entsteht kein gespeichertes Feld fuer diese Wahl",
      !(localStorage.getItem("sembla:projekte") || "").includes("mitWaenden")
      && !(localStorage.getItem("sembla:elemente") || "").includes("mitWaenden"));
    t("[#85] die Versionsachsen bleiben unveraendert",
      store.SCHEMA_VERSION === 6 && store.PROJEKT_VERSION === 2
      && PM.MAPPE_VERSION === 2 && store.migrieren() === 6);
  }
}

// --- 19) Standardkatalog: unveraenderliche Vorlage + Copy-on-write (#102) ---
// Der ausgelieferte Standardkatalog darf im Browser nie etwas anderes bedeuten als die
// Repo-Vorlage. Geprueft wird die Speicherschicht am ECHTEN Vorlagentext aus dem Checkout:
// kanonische, pfadabgeleitete Kennung; frisches Laden ersetzt genau diesen einen Slot;
// der erste Schreibzugriff erzeugt EINMALIG eine Kopie mit neuer Kennung, die nur das
// AKTIVE Projekt zugeordnet bekommt. Eigene Kataloge und frueher entstandene Kopien
// bleiben dabei unangetastet.
{
  const { readFileSync } = await import("node:fs");
  // globalThis.URL ist hier durch das Blob-Polyfill ersetzt — der echte WHATWG-URL
  // kommt deshalb ausdruecklich aus node:url.
  const { URL: NodeURL } = await import("node:url");
  const PM = await import("../../docs/shared/sembla-projektmappe.js");
  const PFAD = KAT.VORLAGE_KATALOG_PFAD;
  const vorlageText = () =>
    readFileSync(new NodeURL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url), "utf8");
  const kataloge = () => JSON.parse(localStorage.getItem("sembla:kataloge") || "{}");

  // Sauberer Ausgangsstand: zwei Projekte, dazu ein bewusst eigener Katalog.
  localStorage.removeItem("sembla:projekte");
  localStorage.removeItem("sembla:kataloge");
  localStorage.removeItem("sembla:aktiv:projekt");
  localStorage.removeItem("sembla:aktiv:katalog");
  const pA102 = store.fuegeProjektHinzu("Projekt A");
  const pB102 = store.fuegeProjektHinzu("Projekt B");
  store.setzeAktivesProjekt(pA102.projekt.id);
  const eigen = store.setzeKatalog(KAT.leererKatalog("Eigener Katalog"));
  const eigenStand = JSON.stringify(kataloge()[eigen.id]);

  // (a) Kanonische, pfadabgeleitete Identitaet — nie ueber den Namen
  const vId = store.vorlagenKatalogId();
  t("[#102] die Vorlagenkennung kommt aus dem Pfad", vId === KAT.vorlageKatalogId(PFAD));
  t("[#102] ohne geladene Vorlage gibt es keine Vorlagenressource",
    store.holeVorlagenKatalog() === null);
  const v1 = store.ladeVorlagenKatalog(vorlageText(), PFAD);
  const dateiProdukte = JSON.parse(vorlageText()).produkte.length;
  t("[#102] Laden legt die Ressource unter der kanonischen Kennung ab",
    v1.id === vId && KAT.istVorlagenKatalog(v1) && v1.produkte.length === dateiProdukte
    && store.holeVorlagenKatalog().id === vId);
  t("[#102] die Vorlage wird dem aktiven Projekt zugeordnet ([L-12])",
    store.holeMappe().katalog === vId && store.holeKatalog().id === vId
    && store.katalogStatus().vorlage === true);
  t("[#102] der eigene Katalog bleibt dabei unveraendert erhalten",
    JSON.stringify(kataloge()[eigen.id]) === eigenStand && store.listeKataloge().length === 2);

  // (b) Erneutes Laden ersetzt GENAU diesen Slot — es entsteht kein Duplikat
  const v2 = store.ladeVorlagenKatalog(vorlageText(), PFAD);
  t("[#102] erneutes Laden ersetzt denselben Slot statt zu duplizieren",
    v2.id === vId && Object.keys(kataloge()).length === 2);

  // (c) Projekt B haengt ebenfalls an der Vorlage — dieselbe kanonische Ressource
  store.setzeAktivesProjekt(pB102.projekt.id);
  store.setzeProjektKatalog(vId);
  store.setzeAktivesProjekt(pA102.projekt.id);

  // (d) Copy-on-write: der erste Schreibzugriff kopiert VOR der Aenderung
  const vorlageStand = JSON.stringify(kataloge()[vId]);
  const kopie = store.setzeKatalog({ ...store.holeKatalog(), name: "Bearbeitet in A" });
  t("[#102] der Schreibzugriff erzeugt eine Kopie mit NEUER Kennung",
    kopie.id !== vId && kopie.kopie_von === vId && kopie.name === "Bearbeitet in A");
  t("[#102] die Kopie ist keine Vorlage mehr (kein Marker)",
    !KAT.istVorlagenKatalog(kataloge()[kopie.id])
    && !(KAT.VORLAGE_FELD in kataloge()[kopie.id]));
  t("[#102] die Vorlage selbst bleibt byte-unveraendert",
    JSON.stringify(kataloge()[vId]) === vorlageStand
    && kataloge()[vId].name !== "Bearbeitet in A");
  t("[#102] nur das AKTIVE Projekt zieht auf die Kopie um",
    store.projektMappe(pA102.projekt.id).katalog === kopie.id
    && store.projektMappe(pB102.projekt.id).katalog === vId);
  t("[#102] die Kopie ist der Anzeigename der Speicherung — kein zweiter Slot",
    Object.keys(kataloge()).length === 3
    && !("kopie_von" in kataloge()[kopie.id]));   // Meldung, kein gespeichertes Datum

  // (e) Der Kopierschutz greift GENAU EINMAL — danach wird die Kopie fortgeschrieben
  const zweite = store.setzeKatalog({ ...store.holeKatalog(), name: "Nochmal bearbeitet" });
  t("[#102] der zweite Schreibzugriff kopiert NICHT erneut",
    zweite.id === kopie.id && !zweite.kopie_von
    && Object.keys(kataloge()).length === 3
    && kataloge()[kopie.id].name === "Nochmal bearbeitet");

  // (f) Ein eigener Katalog wird NIE kopiert
  store.setzeProjektKatalog(eigen.id);
  const eigenNeu = store.setzeKatalog({ ...store.holeKatalog(), name: "Eigener Katalog v2" });
  t("[#102] ein eigener Katalog wird an seiner Kennung fortgeschrieben, nie kopiert",
    eigenNeu.id === eigen.id && !eigenNeu.kopie_von
    && Object.keys(kataloge()).length === 3);

  // (g) Erneutes Laden stellt den Repo-Stand her und laesst Kopien unberuehrt
  store.setzeProjektKatalog(vId);
  const kopieStand = JSON.stringify(kataloge()[kopie.id]);
  const v3 = store.ladeVorlagenKatalog(vorlageText(), PFAD);
  t("[#102] erneutes Laden liefert wieder den unveraenderten Repo-Inhalt",
    v3.id === vId && v3.name === JSON.parse(vorlageText()).name
    && v3.produkte.length === dateiProdukte);
  t("[#102] bestehende Kopien und eigene Kataloge werden dabei nicht angetastet",
    JSON.stringify(kataloge()[kopie.id]) === kopieStand
    && kataloge()[eigen.id].name === "Eigener Katalog v2"
    && Object.keys(kataloge()).length === 3);

  // (h) Ein ungueltiger Text schreibt NICHTS
  const standVor = localStorage.getItem("sembla:kataloge");
  let warf102 = false;
  try { store.ladeVorlagenKatalog('{"format":"SEMBLA-Projekt"}', PFAD); } catch { warf102 = true; }
  t("[#102] ungueltige Vorlage wird abgewiesen — der Speicher bleibt unveraendert",
    warf102 && localStorage.getItem("sembla:kataloge") === standVor);

  // (i) Kein neues oeffentliches Feld, kein Versionssprung
  t("[#102] Identitaet und Marker sind Browserzustand und reisen nicht mit",
    !(KAT.VORLAGE_FELD in KAT.katalogObjekt(kataloge()[vId]))
    && !("id" in KAT.katalogObjekt(kataloge()[vId])));
  t("[#102] die Versionsachsen bleiben unveraendert",
    store.SCHEMA_VERSION === 6 && store.PROJEKT_VERSION === 2
    && KAT.KATALOG_VERSION === 2 && PM.MAPPE_VERSION === 2);
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
