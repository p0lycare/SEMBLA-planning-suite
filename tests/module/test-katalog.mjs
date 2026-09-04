// Logik-Test des Bauteilkatalogs (docs/shared/sembla-katalog.js) — DOM-frei.
// Prueft Validierung (kategorieabhaengige Pflichtfelder, Einheiten, IDs, Preise),
// das oeffentliche Austauschformat (parseKatalog: Version, Formatverwechslung,
// Vorwaertskompatibilitaet) und die Referenzpruefung der Projektauswahl.
//
// Alle Daten sind frei erfundene Fantasiewerte (keine realen Produkt-/Preisdaten).
//
// Aufruf:  node tests/module/test-katalog.mjs

import { readFileSync } from "node:fs";
import * as KAT from "../../docs/shared/sembla-katalog.js";

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

// --- 1) Formatkonstanten / Trennung der Versionsachsen --------------------
ok("Katalogformat heisst SEMBLA-Bauteilkatalog", KAT.KATALOG_FORMAT === "SEMBLA-Bauteilkatalog");
ok("Katalogformat ist Version 1", KAT.KATALOG_VERSION === 1);
ok("Einheiten = Stk/m/m2 (explizite Preisbasis)",
  KAT.EINHEITEN.join(",") === "Stk,m,m2"
  && KAT.EINHEIT_LABEL.Stk === "€/Stk" && KAT.EINHEIT_LABEL.m === "€/m" && KAT.EINHEIT_LABEL.m2 === "€/m²");

// --- 2) Geforderte Kategorien vorhanden ----------------------------------
const katIds = KAT.KATEGORIEN.map((k) => k.id);
for (const soll of ["stein", "gewindestange", "latte", "beplankung", "blech_platte", "verbinder", "verbrauch"]) {
  ok("Kategorie vorhanden: " + soll, katIds.includes(soll));
}
ok("Gewindestange: Gewinde + Standardlaenge pflichtig",
  KAT.kategorie("gewindestange").pflicht.join(",") === "gewinde,laenge_mm");
ok("Latte: Querschnitt + Standardlaenge pflichtig",
  KAT.kategorie("latte").pflicht.join(",") === "breite_mm,dicke_mm,laenge_mm");
ok("Beplankung: Breite/Hoehe/Dicke pflichtig",
  KAT.kategorie("beplankung").pflicht.join(",") === "breite_mm,hoehe_mm,dicke_mm");
ok("Latte erlaubt €/Stk und €/m, aber nicht €/m²",
  KAT.kategorie("latte").einheiten.join(",") === "Stk,m");
ok("Beplankung erlaubt €/Stk und €/m², aber nicht €/m",
  KAT.kategorie("beplankung").einheiten.join(",") === "Stk,m2");

// --- 3) Gueltige Beispielprodukte (synthetisch) --------------------------
const P_ROD = { id: "rod-m10-1100", kategorie: "gewindestange", bezeichnung: "Gewindestange M10 1100 mm",
                einheit: "Stk", preis: 3.8, gewinde: "M10", guete: "8.8", laenge_mm: 1100 };
const P_LATTE = { id: "latte-40-60-3000", kategorie: "latte", bezeichnung: "Latte 40×60, 3,0 m",
                  einheit: "m", preis: 1.25, breite_mm: 40, dicke_mm: 60, laenge_mm: 3000 };
const P_PLATTE = { id: "platte-12-1250-2000", kategorie: "beplankung", bezeichnung: "Platte 12,5 mm 1250×2000",
                   einheit: "m2", preis: 6.9, breite_mm: 1250, hoehe_mm: 2000, dicke_mm: 12.5 };

ok("gueltige Gewindestange", KAT.validiereProdukt(P_ROD).length === 0);
ok("gueltige Latte", KAT.validiereProdukt(P_LATTE).length === 0);
ok("gueltige Platte", KAT.validiereProdukt(P_PLATTE).length === 0);

// --- 4) Validierung schlaegt gezielt an ----------------------------------
const f = (p, opts) => KAT.validiereProdukt(p, opts).join(" | ");
ok("Gewindestange ohne Gewinde -> Fehler",
  /Gewinde ist für/.test(f({ ...P_ROD, gewinde: "" })));
ok("Gewindestange ohne Laenge -> Fehler",
  /laenge_mm ist für/.test(f({ ...P_ROD, laenge_mm: undefined })));
ok("Latte ohne Querschnitt -> Fehler",
  /breite_mm ist für/.test(f({ ...P_LATTE, breite_mm: undefined })));
ok("Latte ohne Standardlaenge -> Fehler",
  /laenge_mm ist für/.test(f({ ...P_LATTE, laenge_mm: undefined })));
ok("Platte ohne Dicke -> Fehler",
  /dicke_mm ist für/.test(f({ ...P_PLATTE, dicke_mm: undefined })));
ok("Latte mit €/m² -> unzulaessige Einheit",
  /nicht zulässig/.test(f({ ...P_LATTE, einheit: "m2" })));
ok("Platte mit €/m -> unzulaessige Einheit",
  /nicht zulässig/.test(f({ ...P_PLATTE, einheit: "m" })));
ok("unbekannte Einheit -> Fehler", /Unbekannte Einheit/.test(f({ ...P_ROD, einheit: "kg" })));
ok("unbekannte Kategorie -> Fehler", /Unbekannte Kategorie/.test(f({ ...P_ROD, kategorie: "daemmung" })));
ok("fehlende ID -> Fehler", /ID fehlt/.test(f({ ...P_ROD, id: "" })));
ok("ID mit Leerzeichen -> Fehler", /keine Leerzeichen/.test(f({ ...P_ROD, id: "rod m10" })));
ok("doppelte ID -> Fehler", /bereits vergeben/.test(f(P_ROD, { ids: ["rod-m10-1100"] })));
ok("fehlende Bezeichnung -> Fehler", /Bezeichnung fehlt/.test(f({ ...P_ROD, bezeichnung: "" })));
ok("fehlender Preis -> Fehler", /Preis fehlt/.test(f({ ...P_ROD, preis: undefined })));
ok("negativer Preis -> Fehler", /nicht negativ/.test(f({ ...P_ROD, preis: -1 })));
ok("Preis 0 ist erlaubt (z. B. Beistellung)", KAT.validiereProdukt({ ...P_ROD, preis: 0 }).length === 0);
ok("Maß 0 -> Fehler", /größer als 0/.test(f({ ...P_LATTE, breite_mm: 0 })));
ok("Maß als Text -> Fehler", /keine Zahl/.test(f({ ...P_LATTE, breite_mm: "dick" })));

// --- 5) Katalogvalidierung (Kopf + Eindeutigkeit) ------------------------
const KATALOG = { format: KAT.KATALOG_FORMAT, version: 1, name: "Katalog Musterlieferant",
                  produkte: [P_ROD, P_LATTE, P_PLATTE] };
ok("gueltiger Katalog", KAT.validiereKatalog(KATALOG).length === 0);
ok("Katalog ohne Namen -> Fehler", /Katalogname fehlt/.test(KAT.validiereKatalog({ ...KATALOG, name: "" }).join("|")));
ok("Katalog ohne produkte-Liste -> Fehler",
  /produkte/.test(KAT.validiereKatalog({ ...KATALOG, produkte: null }).join("|")));
ok("Katalog mit doppelter ID -> Fehler (mit Zeilennummer)",
  /Produkt 2: ID .* bereits vergeben/.test(KAT.validiereKatalog({ ...KATALOG, produkte: [P_ROD, P_ROD] }).join("|")));

// --- 6) parseKatalog: Austauschformat, streng ---------------------------
const t = (o) => JSON.stringify(o);
const wirft = (text, re) => {
  try { KAT.parseKatalog(text); return false; }
  catch (e) { return re ? re.test(e.message) : true; }
};
const gelesen = KAT.parseKatalog(t(KATALOG));
ok("parse: Roundtrip liefert alle Produkte", gelesen.produkte.length === 3 && gelesen.name === "Katalog Musterlieferant");
ok("parse: kaputtes JSON wirft", wirft("{ kein json", /kein gültiges JSON/));
ok("parse: fehlendes format wirft", wirft(t({ version: 1, produkte: [] }), /SEMBLA-Bauteilkatalog/));
ok("parse: zu neue Version wirft", wirft(t({ ...KATALOG, version: 2 }), /Version 2 wird nicht unterstützt/));
ok("parse: fehlende Version wirft", wirft(t({ format: KAT.KATALOG_FORMAT, produkte: [] }), /Version fehlt/));
ok("parse: fehlende produkte-Liste wirft", wirft(t({ format: KAT.KATALOG_FORMAT, version: 1 }), /produkte/));
ok("parse: ungueltiges Produkt wirft mit Begruendung",
  wirft(t({ ...KATALOG, produkte: [{ ...P_LATTE, laenge_mm: undefined }] }), /Katalog ungültig[\s\S]*laenge_mm/));

// Formatverwechslung wird benannt, nicht als „kaputt“ abgetan
ok("parse: Projekt-Datei -> klare Meldung",
  wirft(t({ format: "SEMBLA-Projekt", version: 2, name: "X", wandelement: {} }), /Projekt-\/Wandelement-Datei/));
ok("parse: reines Wandelement -> klare Meldung",
  wirft(t({ length_mm: 2000, courses: [] }), /Projekt-\/Wandelement-Datei/));

// Vorwaertskompatibilitaet: unbekannte Zusatzfelder ueberleben den Roundtrip
const mitExtra = KAT.parseKatalog(t({ ...KATALOG,
  produkte: [{ ...P_ROD, artikel_nr: "XY-4711", zukunft: { a: 1 } }] }));
ok("parse: unbekannte Zusatzfelder bleiben erhalten",
  mitExtra.produkte[0].artikel_nr === "XY-4711" && mitExtra.produkte[0].zukunft.a === 1);
ok("katalogObjekt: nur oeffentliche Felder, feste Version",
  (() => {
    const o = KAT.katalogObjekt({ ...KATALOG, geaendert: "2026-01-01T00:00:00.000Z" });
    return o.version === 1 && o.format === KAT.KATALOG_FORMAT && !("geaendert" in o) && o.produkte.length === 3;
  })());

// --- 7) Anlage-Helfer ---------------------------------------------------
ok("leererKatalog ist gueltig", KAT.validiereKatalog(KAT.leererKatalog("Test")).length === 0);
ok("neuesProdukt(gewindestange) hat zulaessige Startwerte",
  (() => { const p = KAT.neuesProdukt("gewindestange"); return p.kategorie === "gewindestange" && p.einheit === "Stk" && p.gewinde === "M10"; })());
ok("neuesProdukt(latte) startet mit €/Stk", KAT.neuesProdukt("latte").einheit === "Stk");
ok("vorschlagId aus Kategorie + Maßen",
  KAT.vorschlagId({ kategorie: "latte", breite_mm: 40, dicke_mm: 60, laenge_mm: 3000 }) === "latte-40-60-3000");
ok("vorschlagId Gewindestange enthaelt Gewinde",
  KAT.vorschlagId({ kategorie: "gewindestange", gewinde: "M10", laenge_mm: 1100 }) === "gewindestange-m10-1100");
ok("vorschlagBezeichnung Platte nennt Dicke und Format",
  /12,?5?.*1250×2000|12\.5 mm 1250×2000/.test(KAT.vorschlagBezeichnung(P_PLATTE)));
ok("massText nennt Querschnitt und Laenge",
  /40 b × 60 d mm/.test(KAT.massText(P_LATTE)) && /L 3000 mm/.test(KAT.massText(P_LATTE)));

// --- 8) Verwendungsrollen + deterministische Preisauflösung ([P-13]/[P-14]) --------------
// Reine Funktionspruefung ohne DOM/Storage: welche Rolle gehoert welchem Modul, und welchen
// Preis liefert sie unter welchen Bedingungen. Nur Fantasiedaten.
const R_KAT = { format: KAT.KATALOG_FORMAT, version: 1, name: "Rollenkatalog", produkte: [
  { id: "i3", kategorie: "stein", bezeichnung: "Stein i3", einheit: "Stk", preis: 9.5, breite_mm: 375 },
  { id: "i2", kategorie: "stein", bezeichnung: "Stein i2", einheit: "Stk", preis: 7.2, breite_mm: 250 },
  { id: "rod-1100", kategorie: "gewindestange", bezeichnung: "Stange 1100", einheit: "Stk", preis: 3.8, gewinde: "M10", laenge_mm: 1100 },
  { id: "rod-1100b", kategorie: "gewindestange", bezeichnung: "Stange 1100 b", einheit: "Stk", preis: 4.1, gewinde: "M10", laenge_mm: 1100 },
  { id: "rod-1000", kategorie: "gewindestange", bezeichnung: "Stange 1000", einheit: "Stk", preis: 3.5, gewinde: "M10", laenge_mm: 1000 },
  { id: "rod-m", kategorie: "gewindestange", bezeichnung: "Stange Meterware", einheit: "m", preis: 2.9, gewinde: "M10", laenge_mm: 1100 },
  { id: "mutter", kategorie: "verbrauch", bezeichnung: "Kopplungsmutter", einheit: "Stk", preis: 0.65 },
  { id: "boden-1000", kategorie: "blech_platte", bezeichnung: "Bodenblech 1000", einheit: "Stk", preis: 18, breite_mm: 1000, hoehe_mm: 125, dicke_mm: 15 },
  { id: "kopf-1000", kategorie: "blech_platte", bezeichnung: "Kopfblech 1000", einheit: "Stk", preis: 21, breite_mm: 1000, hoehe_mm: 125, dicke_mm: 15 },
]};
const KTX = { rod_mm: 1100, blech_mm: 1000, stange_mm: 1500, stein_i3_mm: 375, stein_i2_mm: 250 };
const eingabenMit = (m1, m2) => ({ planung: { produkte: { rollen: m1 || {} } },
                                   aufbau: { produkte: { rollen: m2 || {} } } });
const loese = (key, ids, unit = "Stk", menge = 5, ktx = KTX) =>
  KAT.loesePreis({ key, unit, menge }, { [key]: ids }, R_KAT, ktx);

// Rollen und Eigentuemer
ok("Rollen: Modul 1 besitzt Wand/Vorspannung/Anschluss/Fugen", (() => {
  const ids = KAT.rollenVonModul(1).map(r => r.id);
  return ["i3","i2","rod_std","rod_rest","kupplung","senkkopf","spannmutter",
          "spannplatte","blech_boden","blech_kopf","dicht_stk","dicht"].every(x => ids.includes(x))
    && !ids.includes("rod_sonder") && !ids.includes("kuppl_basis");
})());
ok("Rollen: Modul 2 besitzt genau Latte/Beplankung/Verbinder",
  KAT.rollenVonModul(2).map(r => r.id).sort().join() === "beplankung,latte,verbinder");
ok("Rollen: kein Schluessel gehoert zwei Modulen",
  new Set(KAT.ROLLEN.map(r => r.id)).size === KAT.ROLLEN.length);
ok("Rollen: Rollenschluessel = Stuecklistenschluessel (keine zweite Achse)",
  KAT.rolle("blech_boden").einheit === "Stk" && KAT.rolle("dicht").einheit === "m");
ok("Rollen: Gruppen fuer die Modul-1-Oberflaeche",
  KAT.rollenGruppen(1).join() === "Steine,Vorspannung,Anschluss,Fugen");
ok("produktRollen liest je Rolle nur den Block ihres Eigentuemers", (() => {
  const r = KAT.produktRollen(eingabenMit({ rod_std: ["rod-1100"], latte: ["x"] }, { latte: ["latte-1"] }));
  return r.rod_std.join() === "rod-1100" && r.latte.join() === "latte-1";
})());
ok("rollenIds entdoppelt und verwirft Leerwerte",
  KAT.rollenIds({ rollen: { latte: ["a", "a", "", null] } }, "latte").join() === "a");

// Eindeutige Auflösung
ok("Auflösung: genau ein Kandidat -> Preis", (() => {
  const r = loese("rod_std", ["rod-1100"]);
  return r.status === "ok" && r.ep === 3.8 && r.produkt.id === "rod-1100" && r.bepreisbar === true;
})());
ok("Auflösung: Maß-Diskriminator engt ein, Rest bleibt vorgemerkt", (() => {
  const r = loese("rod_std", ["rod-1100", "rod-1000"]);
  return r.status === "ok" && r.produkt.id === "rod-1100" && r.vorgemerkt.map(p => p.id).join() === "rod-1000";
})());
ok("Auflösung: Steinbreite unterscheidet i3 von i2",
  loese("i3", ["i3", "i2"]).produkt.id === "i3" && loese("i2", ["i3", "i2"]).produkt.id === "i2");
ok("Auflösung: Blech-Modullänge trifft auch ueber hoehe_mm/laenge_mm", (() => {
  const kat = { ...R_KAT, produkte: [{ id: "b2", kategorie: "blech_platte", bezeichnung: "Blech", einheit: "Stk",
                                       preis: 17, breite_mm: 125, hoehe_mm: 1000, dicke_mm: 15 }] };
  const r = KAT.loesePreis({ key: "blech_boden", unit: "Stk", menge: 3 }, { blech_boden: ["b2"] }, kat, KTX);
  return r.status === "ok" && r.ep === 17;
})());
ok("Auflösung: Boden- und Kopfblech getrennt, je eigener Preis",
  loese("blech_boden", ["boden-1000"]).ep === 18 && loese("blech_kopf", ["kopf-1000"]).ep === 21);
ok("Auflösung: Rolle ohne Diskriminator ist mit einem Produkt eindeutig",
  loese("kupplung", ["mutter"]).status === "ok");

// Kein Preis ohne Eindeutigkeit — und niemals ein Ersatzwert
ok("mehrdeutig: gleiches Maß zweifach -> kein Preis, kein erster Kandidat", (() => {
  const r = loese("rod_std", ["rod-1100", "rod-1100b"]);
  return r.status === "mehrdeutig" && r.ep === null && r.produkt === null && r.kandidaten.length === 2;
})());
ok("mehrdeutig: Rolle ohne Diskriminator mit zwei Produkten", (() => {
  const kat = { ...R_KAT, produkte: R_KAT.produkte.concat(
    [{ id: "mutter2", kategorie: "verbrauch", bezeichnung: "Mutter 2", einheit: "Stk", preis: 0.7 }]) };
  const r = KAT.loesePreis({ key: "kupplung", unit: "Stk", menge: 2 }, { kupplung: ["mutter", "mutter2"] }, kat, KTX);
  return r.status === "mehrdeutig" && r.ep === null;
})());
ok("fehlt: unbekannte ID -> kein Preis, ID benannt", (() => {
  const r = loese("rod_std", ["weg"]);
  return r.status === "fehlt" && r.ep === null && r.fehlend.join() === "weg";
})());
ok("fehlt: eine gueltige + eine fehlende Referenz ergibt KEINEN Teilpreis", (() => {
  const r = loese("rod_std", ["rod-1100", "weg"]);
  return r.status === "fehlt" && r.ep === null && r.fehlend.join() === "weg";
})());
ok("kategorie_abweichend: Produkt der falschen Kategorie -> kein Preis",
  loese("i3", ["rod-1100"]).status === "kategorie_abweichend" && loese("i3", ["rod-1100"]).ep === null);
ok("einheit_unpassend: m-Ware auf Stk-Position, keine Umrechnung", (() => {
  const r = loese("rod_std", ["rod-m"]);
  return r.status === "einheit_unpassend" && r.ep === null;
})());
ok("einheit_unpassend: Stk-Ware auf m-Position", (() => {
  const kat = { ...R_KAT, produkte: [{ id: "rolle", kategorie: "verbrauch", bezeichnung: "Rollenware", einheit: "Stk", preis: 1.5 }] };
  const r = KAT.loesePreis({ key: "dicht_stk", unit: "m", menge: 4 }, { dicht_stk: ["rolle"] }, kat, KTX);
  return r.status === "einheit_unpassend";
})());
ok("mass_abweichend: kein gewaehltes Produkt passt zum Wandmaß", (() => {
  const r = loese("rod_std", ["rod-1000"]);
  return r.status === "mass_abweichend" && r.ep === null;
})());
ok("keine_auswahl: Rolle ohne Produkt -> kein Preis", loese("rod_std", []).status === "keine_auswahl");
ok("kein_katalog: ohne Katalog kein Preis", (() => {
  const r = KAT.loesePreis({ key: "rod_std", unit: "Stk", menge: 5 }, { rod_std: ["rod-1100"] }, null, KTX);
  return r.status === "kein_katalog" && r.ep === null;
})());
ok("Menge 0 braucht kein Produkt und zaehlt nicht als offen", (() => {
  const r = KAT.loesePreis({ key: "blech_kopf", unit: "Stk", menge: 0 }, {}, R_KAT, KTX);
  return r.status === "nicht_erforderlich" && r.bepreisbar === false && r.ep === null;
})());
ok("nachrichtliche Position wird nie bepreist ([A-6])", (() => {
  const r = KAT.loesePreis({ key: "dicht", unit: "m", menge: 15.4, nachrichtlich: true },
    { dicht: ["mutter"] }, R_KAT, KTX);
  return r.status === "nachrichtlich" && r.bepreisbar === false && r.ep === null;
})());
ok("Rolle ohne Mengenposition (Beplankung) erzeugt keine Kostenzeile",
  KAT.rolle("beplankung").bepreist === false && KAT.rolle("dicht").bepreist === false);
ok("fehlender Kontextwert deaktiviert nur die Eingrenzung, erfindet nichts", (() => {
  const r = loese("rod_std", ["rod-1100", "rod-1000"], "Stk", 5, {});
  return r.status === "mehrdeutig" && r.ep === null;
})());
ok("Verbinderrolle nennt die fehlende maschinelle Typpruefung ([U-9])",
  /nicht maschinell prüfbar/i.test(KAT.rolle("verbinder").hinweis));
// [P-18] Sonderzuschnitte: kein Ausgangsprodukt, keine Auswahl, kein Preis.
ok("rod_sonder ist nicht waehlbar und wird nie bepreist ([P-18])", (() => {
  const r = KAT.rolle("rod_sonder");
  const p = loese("rod_sonder", ["rod-1100"]);
  return r.waehlbar === false && r.bepreist === false
    && p.status === "beschaffung" && p.ep === null && p.bepreisbar === false;
})());
ok("rod_sonder-Status meldet Beschaffung statt fehlender Auswahl ([P-18])", (() => {
  const st = KAT.rollenStatus("rod_sonder", eingabenMit({}), R_KAT, KTX);
  return st.status === "beschaffung" && st.ids.length === 0 && /Einkauf/.test(st.hinweis);
})());
ok("kuppl_basis ist entfallen — Kopplungsmuttern sind bauteilgleich ([P-18])",
  KAT.rolle("kuppl_basis") === null && /bauteilgleich/i.test(KAT.rolle("kupplung").hinweis));

// preisKontext: nur reale Wandwerte
ok("preisKontext liest Stangen-/Blechmaß und Steinbreiten aus der Wand", (() => {
  const k = KAT.preisKontext({ rod_mm: 900, grid_mm: 125, prestress: { blech_mm: 2000 } },
    { aufbau: { latten: { stange_cm: 300 } } });
  return k.rod_mm === 900 && k.blech_mm === 2000 && k.stange_mm === 3000
    && k.stein_i3_mm === 375 && k.stein_i2_mm === 250;
})());

// Auswahlstatus fuer die waehlende Oberflaeche (Modul 1/2)
ok("rollenStatus spiegelt den Preisstatus einer bepreisten Rolle", (() => {
  const st = KAT.rollenStatus("rod_std", eingabenMit({ rod_std: ["rod-1100", "rod-1100b"] }), R_KAT, KTX);
  return st.status === "mehrdeutig" && st.ids.length === 2;
})());
ok("rollenStatus meldet bei nicht bepreisten Rollen nur die Aufloesbarkeit", (() => {
  const a = KAT.rollenStatus("beplankung", eingabenMit(null, { beplankung: ["weg"] }), R_KAT, KTX);
  const b = KAT.rollenStatus("beplankung", eingabenMit(null, { beplankung: [] }), R_KAT, KTX);
  return a.status === "fehlt" && b.status === "keine_auswahl";
})());
ok("produkteZuRolle liefert vollstaendige Produkte fuer die Folgeplanung (#19/#22)", (() => {
  const r = KAT.produkteZuRolle(eingabenMit({ rod_std: ["rod-1100", "rod-1000", "weg"] }), R_KAT, "rod_std");
  return r.produkte.length === 2 && r.produkte.some(p => p.laenge_mm === 1000) && r.fehlend.join() === "weg";
})());
ok("leereProdukte ist ein leerer, gueltiger Block",
  JSON.stringify(KAT.leereProdukte()) === JSON.stringify({ quelle: null, rollen: {} }));

// --- 9) Altbestand der frueheren zentralen Auswahl ([P-15]) -------------
const AUSWAHL_OK = { gewindestange: ["rod-m10-1100"], latte: ["latte-40-60-3000"], beplankung: ["platte-12-1250-2000"] };
let pr = KAT.pruefeAuswahl(KATALOG, AUSWAHL_OK);
ok("Auswahl vollstaendig aufloesbar -> keine Warnung", pr.ok && pr.warnungen.length === 0 && pr.anzahl === 3);

ok("leere Auswahl (Altprojekt) -> keine Warnung",
  KAT.pruefeAuswahl(KATALOG, {}).warnungen.length === 0
  && KAT.pruefeAuswahl(null, {}).warnungen.length === 0
  && KAT.pruefeAuswahl(null, undefined).warnungen.length === 0);

pr = KAT.pruefeAuswahl(KATALOG, { latte: ["latte-40-60-3000", "latte-geloescht"] });
ok("gelöschtes Produkt -> genau eine Warnung 'fehlt'",
  pr.warnungen.length === 1 && pr.warnungen[0].typ === "fehlt" && pr.warnungen[0].id === "latte-geloescht");
ok("Warnung nennt Produkt und Kategorie im Klartext",
  /„latte-geloescht“/.test(pr.warnungen[0].text) && /Latte/.test(pr.warnungen[0].text));
ok("Pruefung bereinigt die Auswahl NICHT (nur Meldung)", pr.anzahl === 2);

pr = KAT.pruefeAuswahl(null, AUSWAHL_OK);
ok("kein Katalog geladen, aber Referenzen -> Warnung 'kein_katalog'",
  pr.warnungen.length === 1 && pr.warnungen[0].typ === "kein_katalog" && /3 Produkt/.test(pr.warnungen[0].text));

pr = KAT.pruefeAuswahl(KATALOG, { latte: ["rod-m10-1100"] });
ok("Produkt in falscher Kategorie ausgewaehlt -> Warnung",
  pr.warnungen.length === 1 && pr.warnungen[0].typ === "kategorie_abweichend");

pr = KAT.pruefeAuswahl(KATALOG, { daemmung: ["irgendwas"] });
ok("unbekannte Kategorie in der Auswahl -> Warnung",
  pr.warnungen.length === 1 && pr.warnungen[0].typ === "unbekannte_kategorie");

ok("normAuswahl entdoppelt und verwirft Leerlisten",
  (() => { const a = KAT.normAuswahl({ latte: ["x", "x", ""], leer: [], kaputt: "nein" });
           return a.latte.length === 1 && !("leer" in a) && !("kaputt" in a); })());
ok("anzahlAuswahl zaehlt Mehrfachauswahl je Kategorie",
  KAT.anzahlAuswahl({ latte: ["a", "b", "c"], beplankung: ["d", "e"] }) === 5);

// --- 9) Kategoriegerechte Produktmaske ([P-16], Issue #34) ----------------
// Die Maske ist die einzige Quelle der kategoriespezifischen Felder in Modul 0. Getestet
// wird DOM-frei: Zusammensetzung, Beschriftung, Einheit und — vor allem — dass die Pflicht
// nicht zweitdefiniert ist und die Diskriminatoren der Preisauflösung pflegbar bleiben.
const maskeVon = (k) => KAT.maskeVonKategorie(k);

ok("Gewindestange: Maske = Gewinde/Güte/Stangenlänge",
  KAT.maskeFelder("gewindestange").join(",") === "gewinde,guete,laenge_mm");
ok("Latte: Maske = Querschnitt + Standardlänge (keine Höhe)",
  KAT.maskeFelder("latte").join(",") === "breite_mm,dicke_mm,laenge_mm");
ok("Beplankung: Maske = Plattenmaße (kein Gewinde, keine Länge)",
  KAT.maskeFelder("beplankung").join(",") === "breite_mm,hoehe_mm,dicke_mm");
ok("Blech/Platte: Maske = Blechmaße",
  KAT.maskeFelder("blech_platte").join(",") === "breite_mm,hoehe_mm,dicke_mm");
ok("Stein: Steinbreite/-höhe/-tiefe, alle optional",
  KAT.maskeFelder("stein").join(",") === "breite_mm,hoehe_mm,dicke_mm"
  && maskeVon("stein").every((f) => f.pflicht === false));
ok("Verbinder und Verbrauchsmaterial ohne fachfremde Maße",
  KAT.maskeFelder("verbinder").length === 0 && KAT.maskeFelder("verbrauch").length === 0);
ok("die drei geforderten Masken sind klar unterschiedlich",
  new Set(["gewindestange", "latte", "beplankung"].map((k) => KAT.maskeFelder(k).join(","))).size === 3);

ok("Beschriftungen sind fachlich, nicht generisch",
  maskeVon("latte").map((f) => f.label).join(" | ")
    === "Querschnitt Breite | Querschnitt Dicke | Standardlänge"
  && maskeVon("beplankung").map((f) => f.label).join(" | ")
    === "Plattenbreite | Plattenhöhe | Plattendicke"
  && maskeVon("gewindestange")[0].label === "Gewinde"
  && maskeVon("stein")[0].label === "Steinbreite");
ok("Steinbreite ist als Preiszuordnungsmaß gekennzeichnet ([P-14])",
  /Preiszuordnung/.test(maskeVon("stein")[0].hinweis || ""));
ok("Maßfelder tragen die Einheit mm, Kennungen keine Einheit",
  maskeVon("latte").every((f) => f.typ === "mm" && f.einheit === "mm")
  && maskeVon("gewindestange")[0].typ === "text" && maskeVon("gewindestange")[0].einheit === null);
ok("Gewinde hat einen fachlichen Platzhalter (M10)",
  maskeVon("gewindestange")[0].platzhalter === "M10");

// Pflicht kommt AUS KATEGORIEN[].pflicht — keine zweite Definition, kein Drift.
ok("Pflichtkennzeichen der Maske stimmt fuer jede Kategorie mit KATEGORIEN[].pflicht",
  KAT.KATEGORIEN.every((k) => {
    const pflichtInMaske = maskeVon(k.id).filter((f) => f.pflicht).map((f) => f.feld).sort().join(",");
    return pflichtInMaske === [...(k.pflicht || [])].sort().join(",");
  }));
ok("jedes Pflichtfeld ist in der Maske seiner Kategorie ueberhaupt pflegbar",
  KAT.KATEGORIEN.every((k) => (k.pflicht || []).every((f) => KAT.maskeFelder(k.id).includes(f))));
ok("jedes Maskenfeld ist ein kanonischer Produktschluessel (keine neuen Felder)",
  KAT.KATEGORIEN.every((k) => KAT.maskeFelder(k.id)
    .every((f) => [...KAT.MASSFELDER, "gewinde", "guete"].includes(f))));
ok("Maskenreihenfolge ist ohne Doppelte",
  KAT.KATEGORIEN.every((k) => new Set(KAT.maskeFelder(k.id)).size === KAT.maskeFelder(k.id).length));
ok("unbekannte Kategorie -> leere Maske (kein Rateschluss)",
  KAT.maskeVonKategorie("daemmung").length === 0 && KAT.maskeFelder(undefined).length === 0);

// Die Maß-Diskriminatoren der Preisauflösung muessen pflegbar bleiben ([P-14]).
ok("jede Rolle mit Maß-Diskriminator hat mindestens ein Diskriminatorfeld in ihrer Maske",
  KAT.ROLLEN.filter((r) => r.mass).every((r) =>
    r.mass.felder.some((f) => KAT.maskeFelder(r.kategorie).includes(f))));
ok("Maske veraendert nichts an Kategorien, Rollen oder Formatversion",
  KAT.KATEGORIEN.length === 7 && KAT.KATALOG_VERSION === 1
  && typeof KAT.loesePreis === "function");

// --- Standardauswahl aus dem Katalog ([P-18]) ------------------------------
// Der Katalog benennt je Produkt ausdruecklich seine Verwendungsstelle (`rollen`). Geprueft
// wird, dass daraus nur kategoriegerechte, waehlbare Rollen entstehen und dass eine falsche
// Angabe als Katalogfehler auffaellt statt still zu wirken.
const V_PROD = (extra) => ({
  format: "SEMBLA-Bauteilkatalog", version: 1, name: "V", produkte: [
    { id: "s3", kategorie: "stein", bezeichnung: "i3", einheit: "Stk", preis: 9, breite_mm: 375, rollen: ["i3"] },
    { id: "s2", kategorie: "stein", bezeichnung: "i2", einheit: "Stk", preis: 7, breite_mm: 250, rollen: ["i2"] },
    { id: "r1", kategorie: "gewindestange", bezeichnung: "R1", einheit: "Stk", preis: 3,
      gewinde: "M10", laenge_mm: 1000, rollen: ["rod_std"] },
    { id: "r2", kategorie: "gewindestange", bezeichnung: "R2", einheit: "Stk", preis: 3,
      gewinde: "M10", laenge_mm: 850, rollen: ["rod_std"] },
    { id: "l1", kategorie: "latte", bezeichnung: "L", einheit: "Stk", preis: 3,
      breite_mm: 40, dicke_mm: 60, laenge_mm: 1500, rollen: ["latte"] },
    { id: "frei", kategorie: "verbinder", bezeichnung: "ohne Rolle", einheit: "Stk", preis: 1 },
    ...(extra || []),
  ],
});
ok("produktrollenVorschlag sammelt mehrere Produkte je Rolle in Katalogreihenfolge", (() => {
  const v = KAT.produktrollenVorschlag(V_PROD());
  return v.rod_std.join() === "r1,r2" && v.i3.join() === "s3" && v.latte.join() === "l1";
})());
ok("produktrollenVorschlag laesst Produkte ohne `rollen` unberuecksichtigt",
  !Object.values(KAT.produktrollenVorschlag(V_PROD())).flat().includes("frei"));
ok("produktrollenVorschlag ignoriert kategoriefremde Angaben (kein Rateschluss)", (() => {
  const v = KAT.produktrollenVorschlag({ produkte: [
    { id: "x", kategorie: "verbrauch", bezeichnung: "X", einheit: "Stk", preis: 1, rollen: ["i3"] }] });
  return !(v.i3 || []).length;
})());
ok("validiereProdukt lehnt eine kategoriefremde Standardrolle ab", (() => {
  const e = KAT.validiereProdukt({ id: "x", kategorie: "verbrauch", bezeichnung: "X",
    einheit: "Stk", preis: 1, rollen: ["i3"] });
  return e.some((m) => /Verwendungsrolle „i3“ erwartet Kategorie/.test(m));
})());
ok("validiereProdukt lehnt unbekannte und nicht waehlbare Standardrollen ab", (() => {
  const un = KAT.validiereProdukt({ id: "x", kategorie: "stein", bezeichnung: "X",
    einheit: "Stk", preis: 1, rollen: ["gibtsnicht"] });
  const nw = KAT.validiereProdukt({ id: "y", kategorie: "gewindestange", bezeichnung: "Y",
    einheit: "Stk", preis: 1, gewinde: "M10", laenge_mm: 900, rollen: ["rod_sonder"] });
  return un.some((m) => /Unbekannte Verwendungsrolle/.test(m))
    && nw.some((m) => /nicht wählbar/.test(m));
})());
ok("Produkte ohne `rollen` bleiben gueltig (Feld ist optional)",
  KAT.validiereKatalog(V_PROD()).length === 0);
ok("rollenOhneVorschlag benennt genau die Rollen ohne Standardauswahl", (() => {
  const offen = KAT.rollenOhneVorschlag(V_PROD());
  return !offen.includes("rod_std") && offen.includes("verbinder") && !offen.includes("rod_sonder");
})());

// Der mitgelieferte Standardkatalog muss die Suite startklar machen ([P-18]).
{
  const roh = readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url), "utf8");
  const std = KAT.parseKatalog(roh);
  const v = KAT.produktrollenVorschlag(std);
  ok("Standardkatalog ist gueltig und belegt JEDE waehlbare Rolle vor ([P-18])",
    KAT.rollenOhneVorschlag(std).length === 0);
  ok("Standardkatalog fuehrt die Standardlaengen 1000 und 850 mm",
    (v.rod_std || []).map((id) => KAT.produkt(std, id).laenge_mm).sort((a, b) => b - a).join() === "1000,850");
  ok("Standardkatalog fuehrt genau EIN Reststueck mit 100 mm ([Z-6])",
    (v.rod_rest || []).length === 1 && KAT.produkt(std, v.rod_rest[0]).laenge_mm === 100);
  ok("Standardkatalog fuehrt nur EINE Kopplungsmutter (keine Fuß-Sonderausfuehrung)",
    (v.kupplung || []).length === 1
    && std.produkte.filter((p) => /kopplungsmutter/i.test(p.id)).length === 1);

  // --- [A-10] Bodenblech-Standardlaengen der Vorlage --------------------------------------
  // Die Vorlage muss den vollen Vorratssatz 375…1250 mm im 125-mm-Raster mitbringen, sonst kann
  // [P-18] die Rolle nicht sinnvoll vorbelegen und die Zerlegung faende nichts zu kombinieren.
  const RASTER = [1250, 1125, 1000, 875, 750, 625, 500, 375];
  // Maßgebend ist DASSELBE Feld wie in loesePreis/rollenStatus: das erste belegte aus
  // `mass.felder`. Der Test liest die Definition, statt `breite_mm` zu wiederholen.
  const FELDER = KAT.rolle("blech_boden").mass.felder;
  const massVon = (pr) => FELDER.map((f) => +pr[f]).find((x) => Number.isFinite(x) && x > 0);
  const bbIds = v.blech_boden || [];
  const bbProd = bbIds.map((id) => KAT.produkt(std, id));

  ok("[A-10] Standardkatalog fuehrt je Rastermaß 375…1250 mm ein Bodenblech",
    bbProd.map(massVon).sort((a, b) => b - a).join() === RASTER.join());
  ok("[A-10] jedes Bodenblech ist ein gueltiges Produkt seiner Kategorie",
    bbProd.length === 8 && bbProd.every((pr) => pr.kategorie === "blech_platte"
      && pr.einheit === "Stk" && KAT.validiereProdukt(pr).length === 0));
  // Kein kollidierendes Maß: `hoehe_mm` (Wanddicke) darf nie ein Rastermaß sein, sonst traefe
  // loesePreis ueber `some()` das falsche Feld, und `laenge_mm` wuerde die Gruppierung in
  // rollenStatus verschieben (dort entscheidet das ERSTE belegte Feld).
  ok("[A-10] kein kollidierendes Maßfeld an den Bodenblechen",
    bbProd.every((pr) => pr.laenge_mm == null && pr.hoehe_mm === 125
      && !RASTER.includes(pr.hoehe_mm) && pr.dicke_mm === 15));
  ok("[A-10] Bodenbleche sind als vorlaeufig gekennzeichnet und nennen das Bauteilmaß ([A-12])",
    bbProd.every((pr) => /vorläufig/.test(pr.hinweis || "")
      && new RegExp("\\b" + (massVon(pr) - 2) + " mm").test(pr.hinweis || "")));

  // [P-18]: die leere Rolle wird aus der Vorlage vorbelegt — und zwar mit allen acht.
  ok("[P-18] Vorbelegung fuellt die leere Rolle blech_boden vollstaendig",
    bbIds.length === 8 && !KAT.rollenOhneVorschlag(std).includes("blech_boden"));
  const eingStd = { planung: { produkte: { rollen: { blech_boden: bbIds } } } };
  ok("[A-10] acht verschiedene Standardgroeßen sind kombiniert, nicht mehrdeutig",
    KAT.rollenStatus("blech_boden", eingStd, std, {}).status === "kombiniert");

  // [P-14]: je Position grenzt `mass_mm` (Rastermaß) auf GENAU das maßgleiche Produkt ein —
  // kein Erstkandidat, keine Umrechnung, kein Ersatzprodukt.
  ok("[P-14] jede Standardlaenge trifft genau ihr maßgleiches Produkt", RASTER.every((L) => {
    const r = KAT.loesePreis({ key: "blech_boden", unit: "Stk", menge: 2, mass_mm: L },
      { blech_boden: bbIds }, std, {});
    return r.status === "ok" && massVon(r.produkt) === L && r.ep === +KAT.produkt(std, r.produkt.id).preis;
  }));
  ok("[P-14] ein Rastermaß ohne Produkt bleibt unbepreist statt Erstkandidat", (() => {
    const r = KAT.loesePreis({ key: "blech_boden", unit: "Stk", menge: 1, mass_mm: 1375 },
      { blech_boden: bbIds }, std, {});
    return r.status === "mass_abweichend" && r.ep === null && r.produkt === null;
  })());
}

// --- 12) Kanonische Vorlagenidentitaet (#102) -----------------------------
// Der mitgelieferte Standardkatalog ist eine UNVERAENDERLICHE Vorlage. Erkannt wird die
// daraus geladene Browserressource an einer Kennung, die ALLEIN aus dem Vorlagenpfad
// folgt — nie am Katalognamen (freies Anzeigefeld) und nie am Inhalt.
{
  const PFAD = KAT.VORLAGE_KATALOG_PFAD;
  ok("#102 der Vorlagenpfad zeigt auf die mitgelieferte Repo-Datei",
    PFAD === "./vorlagen/SEMBLA_Standardkatalog.json");
  const id = KAT.vorlageKatalogId(PFAD);
  ok("#102 die Kennung ist deterministisch und pfadabgeleitet",
    id === "kat-vorlage-vorlagen-sembla-standardkatalog"
    && KAT.vorlageKatalogId(PFAD) === id
    && KAT.vorlageKatalogId("vorlagen/SEMBLA_Standardkatalog.json") === id);
  ok("#102 ein anderer Pfad ergibt eine andere Kennung",
    KAT.vorlageKatalogId("./vorlagen/Anderer.json") !== id);
  let warfLeer = false;
  try { KAT.vorlageKatalogId("   "); } catch { warfLeer = true; }
  ok("#102 ohne Pfad gibt es keine Identitaet — benannt abgewiesen statt geraten", warfLeer);

  // Erkannt wird NUR die Kombination aus Marker und passender Kennung.
  const echt = { id, [KAT.VORLAGE_FELD]: PFAD, name: "SEMBLA Standardkatalog", produkte: [] };
  ok("#102 die Vorlagenressource wird an Marker UND Kennung erkannt", KAT.istVorlagenKatalog(echt));
  ok("#102 der blosse NAME macht keinen Katalog zur Vorlage",
    !KAT.istVorlagenKatalog({ id: "kat-1", name: "SEMBLA Standardkatalog", produkte: [] }));
  ok("#102 ein Marker mit fremder Kennung zaehlt nicht (Kopie bleibt Kopie)",
    !KAT.istVorlagenKatalog({ ...echt, id: "kat-1" }));
  ok("#102 eine Kennung ohne Marker zaehlt nicht",
    !KAT.istVorlagenKatalog({ id, name: "x", produkte: [] }));
  ok("#102 leere/kaputte Eingaben sind keine Vorlage",
    !KAT.istVorlagenKatalog(null) && !KAT.istVorlagenKatalog(undefined)
    && !KAT.istVorlagenKatalog({ ...echt, [KAT.VORLAGE_FELD]: "" }));

  // Die Identitaet ist BROWSERZUSTAND: sie steht nicht in der Datei und reist nicht mit.
  const roh = readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json", import.meta.url), "utf8");
  const datei = JSON.parse(roh);
  ok("#102 die Vorlagendatei traegt weder Kennung noch Marker",
    !("id" in datei) && !(KAT.VORLAGE_FELD in datei));
  ok("#102 parseKatalog uebernimmt keine Identitaet aus der Datei",
    !("id" in KAT.parseKatalog(roh)) && !(KAT.VORLAGE_FELD in KAT.parseKatalog(roh)));
  ok("#102 katalogObjekt streicht Kennung und Marker — kein Formatbump",
    !("id" in KAT.katalogObjekt(echt)) && !(KAT.VORLAGE_FELD in KAT.katalogObjekt(echt))
    && KAT.katalogObjekt(echt).version === KAT.KATALOG_VERSION && KAT.KATALOG_VERSION === 1);
}


let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
