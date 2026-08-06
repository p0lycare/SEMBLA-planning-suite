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
t("migration: Schema-Version hochgesetzt", localStorage.getItem("sembla:version") === "4");

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
  !!localStorage.getItem("sembla:katalog")
  && !localStorage.getItem("sembla:elemente").includes("rod-m10-1100"));
t("katalog: Zeitstempel intern, nicht im oeffentlichen Format",
  typeof store.holeKatalog().geaendert === "string");

// „Reload": frisch aus dem localStorage lesen (storage.js haelt keinen Cache)
t("katalog: ueberlebt Reload (Rohwert im Speicher)",
  JSON.parse(localStorage.getItem("sembla:katalog")).produkte[0].id === "rod-m10-1100");

let warfK = false;
try { store.setzeKatalog({ name: "", produkte: [{ id: "x" }] }); } catch { warfK = true; }
t("katalog: ungueltiger Katalog wird abgelehnt", warfK && store.holeKatalog().produkte.length === 4);

// Export = eigene Datei im oeffentlichen Katalogformat (nicht im Projekt-ZIP)
store.exportiereKatalog();
const kExp = JSON.parse(letzterDownload);
t("katalog-export: eigenes Format v1",
  kExp.format === "SEMBLA-Bauteilkatalog" && kExp.version === 1 && kExp.produkte.length === 4);
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
t("produkte: interne Schema-Version ist 4 (Projektstruktur)", store.SCHEMA_VERSION === 4);
t("produkte: Katalog-Formatversion getrennt", KAT.KATALOG_VERSION === 1);
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
    !localStorage.getItem("sembla:projektmappe").includes("courses"));
  t("[L-7] Zeiger auf die aktive Wand bleibt bestehen", store.aktivId() === "w-b2");
  t("migration: Schema-Version auf 4", localStorage.getItem("sembla:version") === "4");

  // idempotent
  const vorher = localStorage.getItem("sembla:projektmappe");
  store.migrieren();
  t("[L-7] Migration laeuft nur einmal (idempotent)",
    localStorage.getItem("sembla:projektmappe") === vorher);

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
    JSON.parse(localStorage.getItem("sembla:projektmappe")).gebaeude.length === 2);

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
  store.verorteWand("w-b1", gsId, { lage: { start_grid: { x: 4, y: 12 }, richtung: "x", laenge_grid: 16 } });
  t("[L-1] Lage gespeichert", store.wandVerortung("w-b1")?.wand.lage.laenge_grid === 16);
  t("[L-3] Wandelement bleibt unberuehrt",
    store.holeElement("w-b1").wandelement.length_mm === 2000
    && !JSON.stringify(store.holeElement("w-b1")).includes("start_grid"));
  const abgleich = (id) => PM.laengenAbgleich(store.wandVerortung(id).wand.lage,
    store.holeElement(id).wandelement.length_mm);
  t("[L-3] passende Lage: keine Abweichung",
    abgleich("w-b1").abweichung === false && abgleich("w-b1").lage_mm === 2000);
  store.verorteWand("w-b1", gsId, { lage: { start_grid: { x: 4, y: 12 }, richtung: "x", laenge_grid: 20 } });
  t("[L-3] Laengenabweichung wird gemeldet, nicht angeglichen",
    abgleich("w-b1").abweichung === true && abgleich("w-b1").lage_mm === 2500
    && store.holeElement("w-b1").wandelement.length_mm === 2000);
  store.verorteWand("w-b1", gsId, { lage: { start_grid: { x: 4, y: 12 }, richtung: "x", laenge_grid: 16 } });
  t("[L-1] krumme Lage wird abgewiesen, nicht gerundet", (() => {
    try {
      store.verorteWand("w-b2", gsId, { lage: { start_grid: { x: 0.5, y: 0 }, richtung: "x", laenge_grid: 4 } });
      return false;
    } catch { return store.wandVerortung("w-b2").wand.lage === null; }
  })());
  t("[L-2] schraege Lage wird abgewiesen", (() => {
    try {
      store.verorteWand("w-b2", gsId, { lage: { start_grid: { x: 0, y: 0 }, richtung: "diagonal", laenge_grid: 4 } });
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
  t("mappe: Slot geleert", store.holeMappe() === null && store.aktivesGeschossId() === null);
  t("mappe: Waende bleiben beim Leeren des Slots erhalten", store.listeElemente().length === 2);
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
    PM.MAPPE_VERSION === 1 && store.PROJEKT_VERSION === 2 && store.SCHEMA_VERSION === 4);
  t("mappe: eigener Speicherschluessel (nicht im Wandspeicher)",
    !!localStorage.getItem("sembla:projektmappe")
    && !localStorage.getItem("sembla:elemente").includes("start_grid"));
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
