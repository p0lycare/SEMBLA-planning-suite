// Logik-Test des Bauteilkatalogs (docs/shared/sembla-katalog.js) — DOM-frei.
// Prueft Validierung (kategorieabhaengige Pflichtfelder, Einheiten, IDs, Preise),
// das oeffentliche Austauschformat (parseKatalog: Version, Formatverwechslung,
// Vorwaertskompatibilitaet) und die Referenzpruefung der Projektauswahl.
//
// Alle Daten sind frei erfundene Fantasiewerte (keine realen Produkt-/Preisdaten).
//
// Aufruf:  node tests/module/test-katalog.mjs

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

// --- 8) Projektauswahl: Referenzpruefung -------------------------------
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

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
