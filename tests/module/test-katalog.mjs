// Logik-Test des Bauteilkatalogs (docs/shared/sembla-katalog.js) — DOM-frei.
// Prueft Validierung (kategorieabhaengige Pflichtfelder, Einheiten, IDs, Preise),
// das oeffentliche Austauschformat (parseKatalog: Version, Formatverwechslung,
// Vorwaertskompatibilitaet) und die Referenzpruefung der Projektauswahl.
//
// Alle Daten sind frei erfundene Fantasiewerte (keine realen Produkt-/Preisdaten).
//
// Aufruf:  node tests/module/test-katalog.mjs

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as KAT from "../../docs/shared/sembla-katalog.js";

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

// --- 1) Formatkonstanten / Trennung der Versionsachsen --------------------
ok("Katalogformat heisst SEMBLA-Bauteilkatalog", KAT.KATALOG_FORMAT === "SEMBLA-Bauteilkatalog");
ok("Katalogformat ist Version 2 (Baugruppen, #94)", KAT.KATALOG_VERSION === 2);
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
ok("parse: zu neue Version wirft", wirft(t({ ...KATALOG, version: 3 }), /Version 3 wird nicht unterstützt/));
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
    return o.version === 2 && o.format === KAT.KATALOG_FORMAT && !("geaendert" in o) && o.produkte.length === 3;
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
// #92 Die Fussschraube ist eine Sechskantschraube. Die Rollen-KENNUNG bleibt `senkkopf`,
// damit bestehende Kataloge und Projekte gueltig bleiben; nur die Bezeichnung wechselt.
ok("Rolle senkkopf heisst Sechskantschraube Fuß bei unveraenderter Kennung (#92)", (() => {
  const r = KAT.ROLLEN.find((x) => x.id === "senkkopf");
  return !!r && r.label === "Sechskantschraube M10×25 Fuß" && !/Senkkopf/.test(r.label);
})());
// Die Unterlegscheibe am Wandabschluss ist ENTFALLEN (Fachauskunft 2026-09-08, hebt #92 auf):
// am normalen oberen Wandabschluss gibt es sie am Spannglied nicht, die Spannmutter sitzt
// unmittelbar auf der Spannplatte. Es darf deshalb auch keine WAEHLBARE ROLLE dafuer mehr
// geben — sonst boete Modul 1 eine Produktauswahl fuer ein Bauteil an, das dort nicht verbaut
// wird. Scheiben am Deckenanschluss kommen mit dessen Baugruppe ([P-21]).
ok("Rolle unterlegscheibe ist entfallen (Fachauskunft 2026-09-08, hebt #92 auf)",
  KAT.rolle("unterlegscheibe") == null
  && !KAT.ROLLEN.some((r) => r.id === "unterlegscheibe")
  && !KAT.rollenVonModul(1).some((x) => x.id === "unterlegscheibe"));
// Die Anschlussgruppe fuehrt weiter Platte und Mutter — nur die Scheibe fehlt.
ok("die Anschlussgruppe fuehrt Spannplatte und Spannmutter unveraendert weiter",
  !!KAT.rolle("spannplatte") && !!KAT.rolle("spannmutter"));
// #96 Das Ausgleichsblech unter dem Bodenblech ist ein eigenes Bauteil (Bodenanschluss wird mit
// Laser nivelliert). Es hat eine eigene Verwendungsrolle der Kategorie Blech/Platte, ist in
// Modul 1 in der Gruppe des Anschlusses waehlbar und wird bepreist. Einen Maß-Diskriminator gibt
// es bewusst NICHT: die Einbaumenge folgt der Zahl der Ausgleichspunkte, und die wird in diesem
// Stand nicht abgeleitet — ein Kontextfeld waere ein erfundener Bezug.
ok("Rolle ausgleichsblech: Modul 1, Gruppe Anschluss, Blech/Platte, bepreist, ohne Maß (#96)", (() => {
  const r = KAT.rolle("ausgleichsblech");
  return !!r && r.modul === 1 && r.gruppe === "Anschluss" && r.kategorie === "blech_platte"
    && r.einheit === "Stk" && r.bepreist === true && r.mass === null
    && KAT.rollenVonModul(1).some((x) => x.id === "ausgleichsblech")
    && !KAT.rollenVonModul(2).some((x) => x.id === "ausgleichsblech");
})());
// Die Pflichtmaße kommen ALLEIN aus der Kategorie — die Rolle fuehrt keine eigene Pflichtliste
// (die waere eine zweite Quelle neben KATEGORIEN[].pflicht).
ok("#96 Ausgleichsblech verlangt dieselben Pflichtmaße wie jedes andere Blech seiner Kategorie", (() => {
  const r = KAT.rolle("ausgleichsblech");
  const basis = { kategorie: "blech_platte", bezeichnung: "X", einheit: "Stk", preis: 1,
                  rollen: ["ausgleichsblech"] };
  const ohneDicke = KAT.validiereProdukt({ id: "ausg-x", ...basis, breite_mm: 20, hoehe_mm: 100 });
  const ohneHoehe = KAT.validiereProdukt({ id: "ausg-y", ...basis, breite_mm: 20, dicke_mm: 8 });
  const voll = KAT.validiereProdukt({ id: "ausg-z", ...basis, breite_mm: 20, hoehe_mm: 100, dicke_mm: 8 });
  return r.pflicht === undefined
    && KAT.kategorie("blech_platte").pflicht.slice().sort().join() === "breite_mm,dicke_mm,hoehe_mm"
    && ohneDicke.some((m) => /^dicke_mm ist f\u00fcr/.test(m))
    && ohneHoehe.some((m) => /^hoehe_mm ist f\u00fcr/.test(m))
    && voll.length === 0;
})());
// [P-9]/must 7: Ein Altprojekt ohne gewaehltes Ausgleichsblech bleibt gueltig — die Luecke wird
// nur BENANNT, es wird kein Produkt geraten und kein Fehler erzeugt.
ok("Rolle ausgleichsblech ohne Auswahl: benannte Luecke statt Fehler (#96)", (() => {
  const st = KAT.rollenStatus("ausgleichsblech", eingabenMit({}), R_KAT, KTX);
  return st.status === "keine_auswahl" && st.text === KAT.STATUS_TEXT.keine_auswahl
    && st.produkt === null && st.ids.length === 0;
})());
ok("Rolle ausgleichsblech ist regulaer waehlbar und wird bepreist (#96)", (() => {
  const eing = eingabenMit({ ausgleichsblech: ["ausg-1"] });
  const kat = { produkte: [{ id: "ausg-1", kategorie: "blech_platte", bezeichnung: "Ausgleichsblech",
                             einheit: "Stk", preis: 0.45, breite_mm: 20, hoehe_mm: 100, dicke_mm: 8 }] };
  const st = KAT.rollenStatus("ausgleichsblech", eing, kat, KTX);
  return st.status === "ok" && st.produkt.id === "ausg-1";
})());
// [A-25]/#93/#109 Einlegeblech und Mutter am Zwischenspannpunkt: zwei eigene, waehlbare und
// bepreiste Verwendungsrollen von Modul 1 in der Gruppe Vorspannung. Das Blech ist ein
// Blech/Platte, die Mutter Verbrauchsmaterial — zwei Kategorien, also zwei Rollen. Einen
// Maß-Diskriminator gibt es bewusst NICHT: es existiert kein maßgebender WANDwert, an dem sich
// Blech oder Mutter messen liesse; ein Kontextfeld waere ein erfundener Bezug.
ok("Rolle einlegeblech: Modul 1, Gruppe Vorspannung, Blech/Platte, bepreist, ohne Maß ([A-25])", (() => {
  const r = KAT.rolle("einlegeblech");
  return !!r && r.modul === 1 && r.gruppe === "Vorspannung" && r.kategorie === "blech_platte"
    && r.einheit === "Stk" && r.bepreist === true && r.mass === null
    && r.waehlbar !== false
    && KAT.rollenVonModul(1).some((x) => x.id === "einlegeblech")
    && !KAT.rollenVonModul(2).some((x) => x.id === "einlegeblech");
})());
ok("Rolle zp_mutter: Modul 1, Gruppe Vorspannung, Verbrauch, bepreist, ohne Maß ([A-25])", (() => {
  const r = KAT.rolle("zp_mutter");
  return !!r && r.modul === 1 && r.gruppe === "Vorspannung" && r.kategorie === "verbrauch"
    && r.einheit === "Stk" && r.bepreist === true && r.mass === null
    && r.waehlbar !== false
    && KAT.rollenVonModul(1).some((x) => x.id === "zp_mutter")
    && !KAT.rollenVonModul(2).some((x) => x.id === "zp_mutter");
})());
// Getrennt von den Ankerbauteilen: der Zwischenspannpunkt ist nach [A-16] KEIN Anker, und die
// Spannplatte nach [A-3] sitzt am Segmentende auf der Steinkante. Vier verschiedene Rollen mit
// vier verschiedenen Kennungen — nichts wird zusammengelegt und nichts umbenannt.
ok("[A-25] Einlegeblech und Mutter sind getrennt von spannmutter, kupplung und spannplatte", (() => {
  const ids = ["einlegeblech", "zp_mutter", "spannmutter", "kupplung", "spannplatte"];
  const rs = ids.map((i) => KAT.rolle(i));
  return rs.every(Boolean) && new Set(ids).size === 5
    && KAT.rolle("spannplatte").gruppe === "Anschluss"
    && KAT.rolle("einlegeblech").label !== KAT.rolle("spannplatte").label
    && KAT.rolle("zp_mutter").label !== KAT.rolle("spannmutter").label
    && KAT.rolle("zp_mutter").label !== KAT.rolle("kupplung").label;
})());
// Die Pflichtmaße kommen ALLEIN aus der Kategorie — die Rolle fuehrt keine eigene Pflichtliste.
ok("[A-25] Einlegeblech verlangt die Pflichtmaße seiner Kategorie, die Mutter keine", (() => {
  const rb = KAT.rolle("einlegeblech"), rm = KAT.rolle("zp_mutter");
  const bBasis = { kategorie: "blech_platte", bezeichnung: "X", einheit: "Stk", preis: 1,
                   rollen: ["einlegeblech"] };
  const ohneDicke = KAT.validiereProdukt({ id: "ein-x", ...bBasis, breite_mm: 110, hoehe_mm: 30 });
  const voll = KAT.validiereProdukt({ id: "ein-z", ...bBasis, breite_mm: 110, hoehe_mm: 30, dicke_mm: 2 });
  // Verbrauchsmaterial hat keine Pflichtmaße — die Mutter braucht insbesondere KEIN `gewinde`
  // (das ist nur bei der Kategorie Gewindestange pflichtig) und erfindet kein Maß.
  const mVoll = KAT.validiereProdukt({ id: "mut-z", kategorie: "verbrauch", bezeichnung: "M10",
                                       einheit: "Stk", preis: 0.08, rollen: ["zp_mutter"] });
  return rb.pflicht === undefined && rm.pflicht === undefined
    && KAT.kategorie("verbrauch").pflicht.length === 0
    && ohneDicke.some((m) => /^dicke_mm ist für/.test(m))
    && voll.length === 0 && mVoll.length === 0;
})());
// [P-9]: Eine Wand ohne gewaehltes Produkt bleibt gueltig — die Luecke wird nur BENANNT.
ok("[A-25] beide Rollen ohne Auswahl: benannte Luecke statt Fehler", (() => {
  const a = KAT.rollenStatus("einlegeblech", eingabenMit({}), R_KAT, KTX);
  const b = KAT.rollenStatus("zp_mutter", eingabenMit({}), R_KAT, KTX);
  return [a, b].every((st) => st.status === "keine_auswahl"
    && st.text === KAT.STATUS_TEXT.keine_auswahl && st.produkt === null && st.ids.length === 0);
})());
ok("[A-25] beide Rollen sind regulaer waehlbar und werden bepreist", (() => {
  const kat = { produkte: [
    { id: "ein-1", kategorie: "blech_platte", bezeichnung: "Einlegeblech", einheit: "Stk",
      preis: 0.35, breite_mm: 110, hoehe_mm: 30, dicke_mm: 2 },
    { id: "mut-1", kategorie: "verbrauch", bezeichnung: "Mutter M10", einheit: "Stk", preis: 0.08 } ] };
  const a = KAT.rollenStatus("einlegeblech", eingabenMit({ einlegeblech: ["ein-1"] }), kat, KTX);
  const b = KAT.rollenStatus("zp_mutter", eingabenMit({ zp_mutter: ["mut-1"] }), kat, KTX);
  return a.status === "ok" && a.produkt.id === "ein-1"
    && b.status === "ok" && b.produkt.id === "mut-1";
})());
// Ohne Maß-Diskriminator entscheidet allein die Anzahl: zwei Produkte sind echt mehrdeutig.
ok("[A-25] zwei Produkte je Rolle: mehrdeutig statt bevorzugtem Kandidaten", (() => {
  const kat = { produkte: [
    { id: "ein-1", kategorie: "blech_platte", bezeichnung: "A", einheit: "Stk", preis: 0.35,
      breite_mm: 110, hoehe_mm: 30, dicke_mm: 2 },
    { id: "ein-2", kategorie: "blech_platte", bezeichnung: "B", einheit: "Stk", preis: 0.4,
      breite_mm: 110, hoehe_mm: 30, dicke_mm: 2 },
    { id: "mut-1", kategorie: "verbrauch", bezeichnung: "M10 A", einheit: "Stk", preis: 0.08 },
    { id: "mut-2", kategorie: "verbrauch", bezeichnung: "M10 B", einheit: "Stk", preis: 0.09 } ] };
  const a = KAT.rollenStatus("einlegeblech", eingabenMit({ einlegeblech: ["ein-1", "ein-2"] }), kat, KTX);
  const b = KAT.rollenStatus("zp_mutter", eingabenMit({ zp_mutter: ["mut-1", "mut-2"] }), kat, KTX);
  return a.status === "mehrdeutig" && b.status === "mehrdeutig";
})());
// Eine fachfremde Kategorie an einer der neuen Rollen ist ein KATALOGFEHLER, keine Heuristik.
ok("[A-25] fachfremdes Produkt an einer der neuen Rollen ist ein Katalogfehler", (() => {
  const a = KAT.validiereProdukt({ id: "x1", kategorie: "verbrauch", bezeichnung: "X",
                                   einheit: "Stk", preis: 1, rollen: ["einlegeblech"] });
  const b = KAT.validiereProdukt({ id: "x2", kategorie: "blech_platte", bezeichnung: "Y",
                                   einheit: "Stk", preis: 1, breite_mm: 1, hoehe_mm: 1,
                                   dicke_mm: 1, rollen: ["zp_mutter"] });
  return a.some((m) => /erwartet Kategorie/.test(m)) && b.some((m) => /erwartet Kategorie/.test(m));
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
//
// Seit #113 fuehrt JEDE Kategorie zusaetzlich die Beschaffungsangaben (gruppe
// "beschaffung"). Die kategoriegerechte Zusicherung gilt deshalb der FACHLICHEN
// Teilmenge — sonst pruefte man nur noch, dass ueberall dasselbe dransteht.
const maskeVon = (k) => KAT.maskeVonKategorie(k);
const fachVon = (k) => KAT.maskeVonKategorie(k).filter((f) => f.gruppe === "fach");

ok("Gewindestange: Maske = Gewinde/Güte/Stangenlänge",
  KAT.fachFelder("gewindestange").join(",") === "gewinde,guete,laenge_mm");
ok("Latte: Maske = Querschnitt + Standardlänge (keine Höhe)",
  KAT.fachFelder("latte").join(",") === "breite_mm,dicke_mm,laenge_mm");
ok("Beplankung: Maske = Plattenmaße (kein Gewinde, keine Länge)",
  KAT.fachFelder("beplankung").join(",") === "breite_mm,hoehe_mm,dicke_mm");
ok("Blech/Platte: Maske = Blechmaße",
  KAT.fachFelder("blech_platte").join(",") === "breite_mm,hoehe_mm,dicke_mm");
ok("Stein: Steinbreite/-höhe/-tiefe, alle optional",
  KAT.fachFelder("stein").join(",") === "breite_mm,hoehe_mm,dicke_mm"
  && maskeVon("stein").every((f) => f.pflicht === false));
ok("Verbinder ohne fachfremde Maße",
  KAT.fachFelder("verbinder").length === 0);
// #92 Verbrauchsmaterial fuehrt die Einbauhoehe des Kleinteils — aus ihr rechnet Modul 1 den
// Fussoffset (halbe Kopplungsmutterhoehe); ohne Feld in der Maske gaebe es dafuer keinen
// Pflegeort. Seit dem 2026-09-08 kommt die BAUTEILLAENGE dazu (Schaftlaenge einer Schraube).
// Sie ist KEIN Diskriminator — die Verbrauchsrollen haben `mass: null` —, sondern der
// Pflegeort fuer eine Laenge, die sonst nur im Freitext der Bezeichnung staende.
// Seit #113 kommt das Gewinde des Kleinteils dazu — bisher stand es nur unter
// `gewindestange` und wurde an Schrauben und Muttern beim Speichern entfernt.
// Seit #97 kommt die SCHLUESSELWEITE dazu (Werkzeugmass ueber die Schluesselflaechen).
ok("Verbrauchsmaterial: Maske = Gewinde, Einbauhöhe, Bauteillänge und Schlüsselweite",
  KAT.fachFelder("verbrauch").join(",") === "gewinde,hoehe_mm,laenge_mm,sw_mm");
ok("die drei geforderten Masken sind klar unterschiedlich",
  new Set(["gewindestange", "latte", "beplankung"].map((k) => KAT.fachFelder(k).join(","))).size === 3);

ok("Beschriftungen sind fachlich, nicht generisch",
  fachVon("latte").map((f) => f.label).join(" | ")
    === "Querschnitt Breite | Querschnitt Dicke | Standardlänge"
  && fachVon("beplankung").map((f) => f.label).join(" | ")
    === "Plattenbreite | Plattenhöhe | Plattendicke"
  && fachVon("gewindestange")[0].label === "Gewinde"
  && fachVon("stein")[0].label === "Steinbreite");
ok("Steinbreite ist als Preiszuordnungsmaß gekennzeichnet ([P-14])",
  /Preiszuordnung/.test(maskeVon("stein")[0].hinweis || ""));
ok("Maßfelder tragen die Einheit mm, Kennungen keine Einheit",
  fachVon("latte").every((f) => f.typ === "mm" && f.einheit === "mm")
  && fachVon("gewindestange")[0].typ === "text" && fachVon("gewindestange")[0].einheit === null);
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
    .every((f) => [...KAT.MASSFELDER, "gewinde", "guete",
                   ...KAT.BESCHAFFUNGSFELDER.map((b) => b.feld)].includes(f))));
ok("Maskenreihenfolge ist ohne Doppelte",
  KAT.KATEGORIEN.every((k) => new Set(KAT.maskeFelder(k.id)).size === KAT.maskeFelder(k.id).length));
ok("unbekannte Kategorie -> leere Maske (kein Rateschluss)",
  KAT.maskeVonKategorie("daemmung").length === 0 && KAT.maskeFelder(undefined).length === 0);

// Die Maß-Diskriminatoren der Preisauflösung muessen pflegbar bleiben ([P-14]).
ok("jede Rolle mit Maß-Diskriminator hat mindestens ein Diskriminatorfeld in ihrer Maske",
  KAT.ROLLEN.filter((r) => r.mass).every((r) =>
    r.mass.felder.some((f) => KAT.maskeFelder(r.kategorie).includes(f))));
ok("Maske veraendert nichts an Kategorien, Rollen oder Formatversion",
  KAT.KATEGORIEN.length === 7 && KAT.KATALOG_VERSION === 2
  && typeof KAT.loesePreis === "function");

// --- Einbauhöhe eines Kleinteils ([P-16], Issue #92) -----------------------
// Modul 1 rechnet den Fussoffset aus der Kopplungsmutterhoehe und liest sie ausschliesslich
// aus dem Katalogprodukt der Rolle `kupplung`. Gepflegt wird sie ueber die Maske der
// Kategorie „Sonstiges Verbrauchsmaterial" — hier am ECHTEN Pfad: Maske, Speicherform
// (katalogObjekt) und Wiedereinlesen (parseKatalog).
// Die FACHLICHE Teilmenge: seit #113 steht das Gewinde des Kleinteils davor, die beiden
// Masse ruecken damit auf Position 1 und 2 — ihre Bedeutung aendert sich nicht.
const V_MASKE = fachVon("verbrauch");
ok("[#92] Einbauhöhe ist ein Millimetermaß mit ausweisender Beschriftung",
  V_MASKE.length === 4 && V_MASKE[1].feld === "hoehe_mm"
  && V_MASKE[1].typ === "mm" && V_MASKE[1].einheit === "mm"
  && /Einbauhöhe/.test(V_MASKE[1].label));
ok("Bauteillänge ist ein optionales Millimetermaß mit ausweisender Beschriftung",
  V_MASKE[2].feld === "laenge_mm" && V_MASKE[2].typ === "mm" && V_MASKE[2].einheit === "mm"
  && /Bauteillänge/.test(V_MASKE[2].label) && V_MASKE[2].pflicht === false);
ok("[#92] Einbauhöhe ist OPTIONAL (keine Pflicht der Kategorie)",
  V_MASKE[1].pflicht === false && KAT.kategorie("verbrauch").pflicht.length === 0);
ok("[#92] der Hinweis benennt Meterware ohne Einbaumaß",
  /Meterware/.test(V_MASKE[1].hinweis || ""));

const V_MUTTER = { id: "mutter-h", kategorie: "verbrauch", bezeichnung: "Kopplungsmutter",
                   einheit: "Stk", preis: 0.65, hoehe_mm: 17.5, rollen: ["kupplung"] };
const V_BAND = { id: "band", kategorie: "verbrauch", bezeichnung: "Dichtband",
                 einheit: "m", preis: 1.2 };
ok("[#92] ein Kleinteil MIT Einbauhöhe ist gültig",
  KAT.validiereProdukt(V_MUTTER, { ids: [] }).length === 0);
ok("[#92] ein Kleinteil OHNE Einbauhöhe bleibt gültig (Meterware)",
  KAT.validiereProdukt(V_BAND, { ids: [] }).length === 0);
// Benannt abgewiesen, nie gerundet und nie stillschweigend verworfen ([P-9]) — geprueft
// direkt am Validator, nicht ueber ein Eingabefeld.
ok("[#92] Einbauhöhe 0 wird benannt abgewiesen",
  KAT.validiereProdukt({ ...V_MUTTER, hoehe_mm: 0 }, { ids: [] })
    .some((m) => /hoehe_mm/.test(m) && /größer als 0/.test(m)));
ok("[#92] negative Einbauhöhe wird benannt abgewiesen",
  KAT.validiereProdukt({ ...V_MUTTER, hoehe_mm: -5 }, { ids: [] })
    .some((m) => /hoehe_mm/.test(m) && /größer als 0/.test(m)));
ok("[#92] nicht-numerische Einbauhöhe wird benannt abgewiesen",
  KAT.validiereProdukt({ ...V_MUTTER, hoehe_mm: "hoch" }, { ids: [] })
    .some((m) => /hoehe_mm/.test(m) && /keine Zahl/.test(m)));

// Roundtrip ueber die REALEN Austauschfunktionen: speichern/exportieren -> Datei -> einlesen.
{
  const roh = { ...KAT.leererKatalog("Kleinteile"), produkte: [V_MUTTER, V_BAND] };
  const datei = KAT.katalogObjekt(roh);
  const zurueck = KAT.parseKatalog(JSON.stringify(datei));
  const m = KAT.produkt(zurueck, "mutter-h"), b = KAT.produkt(zurueck, "band");
  ok("[#92] die Einbauhöhe übersteht Export und Import unverändert",
    KAT.produkt(datei, "mutter-h").hoehe_mm === 17.5 && m && m.hoehe_mm === 17.5);
  ok("[#92] ein Kleinteil ohne Einbauhöhe kommt ohne erfundenes Maß zurück",
    b && b.hoehe_mm === undefined);
  ok("[#92] der Roundtrip erfindet keinen Formatsprung",
    datei.version === 2 && zurueck.version === 2 && zurueck.produkte.length === 2);
}

// --- Schluesselweite als Katalogmass des Kleinteils (#97) -----------------
// Gemeldet war: die Kopplungsmutter hat die richtige Einbauhoehe, die GEZEICHNETE
// Schluesselweite ist aber viel zu breit. Frueheste Ursache ist das fehlende DATUM — im
// Katalog gab es kein Feld dafuer, also war jede Breite geraten. Dieses Paket liefert
// ausschliesslich das gepflegte Mass: Maske, Validierung, Roundtrip und Vorlage. Eine
// Ableitung am Wandelement und die massstaebliche Mutternbreite in Modul 1/7 sind
// ausdruecklich NICHT dabei — hier liest niemand `sw_mm`.
const SW_MASKE = fachVon("verbrauch")[3];
ok("[#97] die Schlüsselweite ist ein Millimetermaß mit ausweisender Beschriftung",
  SW_MASKE.feld === "sw_mm" && SW_MASKE.typ === "mm" && SW_MASKE.einheit === "mm"
  && /Schlüsselweite/.test(SW_MASKE.label));
ok("[#97] sie ist OPTIONAL — die Pflichtliste der Kategorie bleibt leer",
  SW_MASKE.pflicht === false && KAT.kategorie("verbrauch").pflicht.length === 0);
ok("[#97] der Hinweis benennt Meterware ohne Schlüsselweite",
  /Meterware/.test(SW_MASKE.hinweis || ""));
ok("[#97] sie steht bei den fachlichen Merkmalen, nicht bei der Beschaffung",
  SW_MASKE.gruppe === "fach"
  && !KAT.BESCHAFFUNGSFELDER.some((f) => f.feld === "sw_mm"));
// Sie ist ein MASS (eine Pruefstelle in `validiereProdukt`), aber KEIN Diskriminator:
// die Preisaufloesung nach [P-14] entscheidet allein ueber ROLLEN[].mass.
ok("[#97] sw_mm ist ein Maßfeld, aber nirgends Preis-Diskriminator",
  KAT.MASSFELDER.includes("sw_mm")
  && KAT.ROLLEN.filter((r) => r.mass).every((r) => !r.mass.felder.includes("sw_mm"))
  && KAT.ROLLEN.filter((r) => r.kategorie === "verbrauch").every((r) => r.mass === null));
// Sie gehoert KEINER anderen Kategorie — sonst entfernte der Dialog sie beim Speichern.
ok("[#97] nur „Sonstiges Verbrauchsmaterial“ fuehrt die Schlüsselweite",
  KAT.KATEGORIEN.filter((k) => KAT.maskeFelder(k.id).includes("sw_mm"))
    .map((k) => k.id).join(",") === "verbrauch");

const SW_MUTTER = { id: "mutter-sw", kategorie: "verbrauch", bezeichnung: "Kopplungsmutter M10",
                    einheit: "Stk", preis: 0.65, hoehe_mm: 30, gewinde: "M10", sw_mm: 17,
                    rollen: ["kupplung"] };
const SW_BAND = { id: "band-sw", kategorie: "verbrauch", bezeichnung: "Dichtband",
                  einheit: "m", preis: 1.2 };
ok("[#97] ein Kleinteil MIT Schlüsselweite ist gültig",
  KAT.validiereProdukt(SW_MUTTER, { ids: [] }).length === 0);
ok("[#97] ein Kleinteil OHNE Schlüsselweite und Meterware bleiben gültig",
  KAT.validiereProdukt({ ...SW_MUTTER, sw_mm: undefined }, { ids: [] }).length === 0
  && KAT.validiereProdukt(SW_BAND, { ids: [] }).length === 0);
// Benannt abgewiesen, nie gerundet und nie still verworfen ([P-9]).
ok("[#97] Schlüsselweite 0 wird benannt abgewiesen",
  KAT.validiereProdukt({ ...SW_MUTTER, sw_mm: 0 }, { ids: [] })
    .some((m) => /sw_mm/.test(m) && /größer als 0/.test(m)));
ok("[#97] eine negative Schlüsselweite wird benannt abgewiesen",
  KAT.validiereProdukt({ ...SW_MUTTER, sw_mm: -17 }, { ids: [] })
    .some((m) => /sw_mm/.test(m) && /größer als 0/.test(m)));
ok("[#97] eine nicht-numerische Schlüsselweite wird benannt abgewiesen",
  KAT.validiereProdukt({ ...SW_MUTTER, sw_mm: "breit" }, { ids: [] })
    .some((m) => /sw_mm/.test(m) && /keine Zahl/.test(m)));

// Roundtrip ueber die REALEN Austauschfunktionen: speichern/exportieren -> Datei -> einlesen.
{
  const roh = { ...KAT.leererKatalog("Kleinteile"), produkte: [SW_MUTTER, SW_BAND] };
  const datei = KAT.katalogObjekt(roh);
  const zurueck = KAT.parseKatalog(JSON.stringify(datei));
  ok("[#97] die Schlüsselweite übersteht Speichern, Export und Import wertgleich",
    KAT.produkt(datei, "mutter-sw").sw_mm === 17
    && KAT.produkt(zurueck, "mutter-sw").sw_mm === 17);
  ok("[#97] ein Kleinteil ohne Schlüsselweite kommt ohne erfundenes Maß zurück",
    KAT.produkt(zurueck, "band-sw").sw_mm === undefined);
  ok("[#97] die übrigen Felder kommen feldweise unverändert zurück",
    Object.keys(SW_MUTTER).every((k) =>
      JSON.stringify(KAT.produkt(zurueck, "mutter-sw")[k]) === JSON.stringify(SW_MUTTER[k])));
  ok("[#97] der Roundtrip erfindet keinen Formatsprung",
    datei.version === 2 && zurueck.version === 2 && KAT.KATALOG_VERSION === 2);
}
// Gegenprobe zum Kennungsvorschlag: er beschreibt die GEOMETRIE des Bauteils. Ein gesetztes
// `sw_mm` darf ihn deshalb nicht verlaengern — sonst hiesse dieselbe Mutter ploetzlich anders.
ok("[#97] vorschlagId bleibt durch ein gesetztes sw_mm bit-gleich",
  KAT.vorschlagId(SW_MUTTER) === KAT.vorschlagId({ ...SW_MUTTER, sw_mm: undefined })
  && KAT.vorschlagId({ kategorie: "latte", breite_mm: 40, dicke_mm: 60, laenge_mm: 3000, sw_mm: 17 })
     === "latte-40-60-3000"
  && KAT.vorschlagId({ kategorie: "verbrauch", gewinde: "M10", hoehe_mm: 30, sw_mm: 17 })
     === "verbrauch-m10-30");
ok("[#97] auch der Maßtext der Produkttabelle bleibt unberührt",
  KAT.massText(SW_MUTTER) === KAT.massText({ ...SW_MUTTER, sw_mm: undefined }));

// --- Beschaffungsangaben je Produkt (#113) --------------------------------
// Norm, Werkstoff, Oberflaeche, Hersteller und Artikelnummer plus das Gewinde: sechs
// OPTIONALE Angaben, die in JEDER Kategorie pflegbar sind, Export und Import verlustfrei
// ueberstehen und aus denen NICHTS abgeleitet wird.
const B_KEYS = KAT.BESCHAFFUNGSFELDER.map((f) => f.feld);

ok("[#113] die fuenf Beschaffungsfelder stehen an EINER Stelle",
  B_KEYS.join(",") === "norm,werkstoff,oberflaeche,hersteller,artikelnr"
  && KAT.BESCHAFFUNGSFELDER.every((f) => f.typ === "text"));
ok("[#113] sie sind in JEDER Kategorie pflegbar — auch in einer ohne eigene Merkmale",
  KAT.KATEGORIEN.every((k) => B_KEYS.every((b) => KAT.maskeFelder(k.id).includes(b)))
  && KAT.fachFelder("verbinder").length === 0
  && KAT.maskeFelder("verbinder").join(",") === B_KEYS.join(","));
ok("[#113] sie tragen die Gruppe „beschaffung“, die fachlichen Felder nicht",
  KAT.KATEGORIEN.every((k) => KAT.maskeVonKategorie(k.id)
    .every((f) => f.gruppe === (B_KEYS.includes(f.feld) ? "beschaffung" : "fach"))));
ok("[#113] sie sind nirgends Pflicht und tragen keine Einheit",
  KAT.KATEGORIEN.every((k) => KAT.maskeVonKategorie(k.id)
    .filter((f) => f.gruppe === "beschaffung")
    .every((f) => f.pflicht === false && f.einheit === null)));
ok("[#113] sie stehen NACH den fachlichen Merkmalen (Maße zuerst)",
  KAT.KATEGORIEN.every((k) => {
    const g = KAT.maskeVonKategorie(k.id).map((f) => f.gruppe);
    return g.indexOf("beschaffung") === -1 || g.lastIndexOf("fach") < g.indexOf("beschaffung");
  }));
ok("[#113] eine unbekannte Kategorie bekommt auch keine Beschaffungsfelder",
  KAT.maskeVonKategorie("daemmung").length === 0);
ok("[#113] keine Beschaffungsangabe ist ein Maß oder ein Preis-Diskriminator",
  B_KEYS.every((b) => !KAT.MASSFELDER.includes(b))
  && KAT.ROLLEN.filter((r) => r.mass).every((r) => r.mass.felder.every((x) => !B_KEYS.includes(x))));

// Das REALE Produkt des Nutzerflusses: eine Kopplungsmutter mit allen sechs Angaben.
const B_MUTTER = { id: "verbrauch-kopplungsmutter", kategorie: "verbrauch",
  bezeichnung: "Kopplungsmutter M10", einheit: "Stk", preis: 0.65, hoehe_mm: 30,
  norm: "ISO 4033", werkstoff: "DC01 (1.0330)", oberflaeche: "ZE25/25",
  gewinde: "M10", hersteller: "Würth", artikelnr: "021405532" };
const B_ALLE = [...B_KEYS, "gewinde"];

ok("[#113] ein Verbrauchsprodukt mit allen sechs Angaben ist gueltig",
  KAT.validiereProdukt(B_MUTTER, { ids: [] }).length === 0);
ok("[#113] ein Produkt OHNE Beschaffungsangaben bleibt gueltig (kein Pflichtfeld)",
  KAT.validiereProdukt({ id: "band", kategorie: "verbrauch", bezeichnung: "Dichtband",
    einheit: "m", preis: 1.2 }, { ids: [] }).length === 0);
ok("[#113] die Angaben sind in JEDER Kategorie gueltig, nicht nur bei Kleinteilen",
  ["stein", "gewindestange", "latte", "beplankung", "blech_platte", "verbinder"].every((k) => {
    const p = { ...KAT.neuesProdukt(k), id: "p-" + k, bezeichnung: "P", preis: 1,
      norm: "EN 10025", werkstoff: "S235JR", oberflaeche: "feuerverzinkt",
      hersteller: "Würth", artikelnr: "4711" };
    for (const f of KAT.fachFelder(k)) if (f.endsWith("_mm")) p[f] = 100;
    return KAT.validiereProdukt(p, { ids: [] }).length === 0;
  }));

// Benannt abgewiesen, nie still korrigiert ([P-9]).
ok("[#113] eine Liste statt Text wird benannt abgewiesen",
  KAT.validiereProdukt({ ...B_MUTTER, artikelnr: ["021405532"] }, { ids: [] })
    .some((m) => /artikelnr/.test(m) && /Text/.test(m) && /Liste/.test(m)));
ok("[#113] ein Objekt statt Text wird benannt abgewiesen",
  KAT.validiereProdukt({ ...B_MUTTER, hersteller: { name: "Würth" } }, { ids: [] })
    .some((m) => /hersteller/.test(m) && /Text/.test(m)));
ok("[#113] ein nicht-textliches Gewinde wird ebenfalls benannt abgewiesen",
  KAT.validiereProdukt({ ...B_MUTTER, gewinde: ["M10"] }, { ids: [] })
    .some((m) => /gewinde/.test(m) && /Text/.test(m)));
ok("[#113] eine numerische Artikelnummer aus einer Datei bleibt zulaessig",
  KAT.validiereProdukt({ ...B_MUTTER, artikelnr: 21405532 }, { ids: [] }).length === 0);
ok("[#113] leer bleibt leer — ein fehlendes Feld ist kein Fehler und wird nicht erfunden",
  KAT.validiereProdukt({ ...B_MUTTER, norm: "", werkstoff: undefined }, { ids: [] }).length === 0);

// Akzeptanz: DERSELBE Katalog ueber den REALEN Pfad — anlegen, pruefen, exportieren,
// wieder einlesen, FELDWEISE gegen den Ausgangsstand halten.
{
  const roh = { ...KAT.leererKatalog("Beschaffung"), produkte: [B_MUTTER] };
  ok("[#113] der Katalog mit Beschaffungsangaben ist als Ganzes gueltig",
    KAT.validiereKatalog(roh).length === 0);
  const datei = KAT.katalogObjekt(roh);
  const zurueck = KAT.parseKatalog(JSON.stringify(datei));
  const d = KAT.produkt(datei, B_MUTTER.id), z = KAT.produkt(zurueck, B_MUTTER.id);
  ok("[#113] alle sechs Angaben stehen unveraendert in der Exportdatei",
    !!d && B_ALLE.every((k) => d[k] === B_MUTTER[k]));
  ok("[#113] alle sechs Angaben kommen aus dem Import feldweise unveraendert zurueck",
    !!z && B_ALLE.every((k) => z[k] === B_MUTTER[k]));
  ok("[#113] auch die uebrigen Produktfelder sind wertgleich (kein Verlust nebenbei)",
    !!z && Object.keys(B_MUTTER).every((k) => z[k] === B_MUTTER[k])
    && Object.keys(z).length === Object.keys(B_MUTTER).length);
  ok("[#113] der Roundtrip erfindet keinen Formatsprung",
    datei.version === KAT.KATALOG_VERSION && zurueck.version === 2 && KAT.KATALOG_VERSION === 2);
}

// Akzeptanz: die Preisaufloesung ([P-14]) liefert VOR und NACH dem Setzen dasselbe.
{
  const ohne = { ...R_KAT, produkte: R_KAT.produkte.map((p) => ({ ...p })) };
  const mit = { ...R_KAT, produkte: R_KAT.produkte.map((p) => ({ ...p,
    norm: "ISO 4033", werkstoff: "DC01 (1.0330)", oberflaeche: "ZE25/25",
    hersteller: "Würth", artikelnr: "021405532" })) };
  // Verglichen wird die ENTSCHEIDUNG, nicht das mitgelieferte Produktobjekt: dass an
  // diesem jetzt Beschaffungsangaben haengen, IST der Testfall und kein Unterschied im
  // Ergebnis. Massgeblich sind Status, Einzelpreis und die Kandidatenmenge.
  const preis = (kat, key, ids, unit, menge) => {
    const r = KAT.loesePreis({ key, unit, menge }, { [key]: ids }, kat, KTX);
    return JSON.stringify({ status: r.status, text: r.text, ep: r.ep,
      produkt: r.produkt ? r.produkt.id : null, fehlend: r.fehlend,
      kandidaten: (r.kandidaten || []).map((p) => p.id) });
  };
  ok("[#113] eindeutiger Preis: identisches Ergebnis vor und nach dem Setzen",
    preis(ohne, "rod_std", ["rod-1100"], "Stk", 5) === preis(mit, "rod_std", ["rod-1100"], "Stk", 5)
    && preis(ohne, "kupplung", ["mutter"], "Stk", 2) === preis(mit, "kupplung", ["mutter"], "Stk", 2)
    && preis(ohne, "i3", ["i3"], "Stk", 9) === preis(mit, "i3", ["i3"], "Stk", 9));
  ok("[#113] auch Mehrdeutigkeit bleibt mehrdeutig — keine Angabe wird zum Diskriminator",
    preis(ohne, "rod_std", ["rod-1100", "rod-1100b"], "Stk", 5)
      === preis(mit, "rod_std", ["rod-1100", "rod-1100b"], "Stk", 5));
  ok("[#113] Bezeichnungsaufbau und Maßtext bleiben unberuehrt",
    KAT.vorschlagBezeichnung(B_MUTTER) === KAT.vorschlagBezeichnung(
      { id: B_MUTTER.id, kategorie: "verbrauch", bezeichnung: "", einheit: "Stk", preis: 0.65, hoehe_mm: 30 })
    && KAT.massText(B_MUTTER) === KAT.massText(
      { kategorie: "verbrauch", hoehe_mm: 30, gewinde: "M10" }));
}

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
  // Die Vorlage bringt KEIN Unterlegscheiben-Produkt mehr mit (Fachauskunft 2026-09-08).
  // Das Produkt war ausdruecklich als „vorläufig — fachlich unbestätigt" gekennzeichnet und
  // trug einen frei angenommenen Preis; die Auskunft loest diesen offenen Punkt auf.
  ok("Standardkatalog fuehrt kein Unterlegscheiben-Produkt mehr (hebt #92 auf)",
    KAT.produkt(std, "verbrauch-unterlegscheibe") == null
    && !(std.produkte || []).some((pr) => (pr.rollen || []).includes("unterlegscheibe"))
    && v.unterlegscheibe == null);
  // #96 Die Vorlage bringt GENAU EIN vorlaeufiges Ausgleichsblech mit: 20 mm in Wandrichtung
  // (breite_mm — die Kategoriemaske kennt kein laenge_mm), 100 mm quer zur Wand (hoehe_mm),
  // 8 mm dick. Die Orientierung ist die Feststellung von Tibor vom 2026-09-07; zuvor stand sie
  // vertauscht in der Vorlage.
  ok("Standardkatalog belegt die Rolle ausgleichsblech mit genau EINEM Produkt vor (#96)", (() => {
    const ids = v.ausgleichsblech || [];
    if (ids.length !== 1) return false;
    const pr = KAT.produkt(std, ids[0]);
    return pr.kategorie === "blech_platte" && pr.einheit === "Stk"
      && KAT.validiereProdukt(pr).length === 0
      && !KAT.rollenOhneVorschlag(std).includes("ausgleichsblech");
  })());
  ok("Standardkatalog: das Ausgleichsblech misst 20 mm laengs \u00d7 100 mm quer \u00d7 8 mm (#96)", (() => {
    const pr = KAT.produkt(std, (v.ausgleichsblech || [])[0]);
    return +pr.breite_mm === 20 && +pr.hoehe_mm === 100 && +pr.dicke_mm === 8
      && pr.laenge_mm == null;
  })());
  // Text und Maßfelder muessen dieselbe Richtung nennen: die Kategoriemaske beschriftet
  // `hoehe_mm` als „Blechhoehe“, deshalb traegt allein der Wortlaut die Orientierung.
  ok("Standardkatalog: Bezeichnung und Hinweis nennen die Orientierung des Blechs (#96)", (() => {
    const pr = KAT.produkt(std, (v.ausgleichsblech || [])[0]);
    const t = String(pr.bezeichnung) + " " + String(pr.hinweis || "");
    return /20\u00d7100 mm/.test(pr.bezeichnung)
      && /20 mm in Wandrichtung/.test(pr.hinweis || "")
      && /100 mm quer/.test(pr.hinweis || "")
      && !/100 mm in Wandrichtung/.test(t)
      && !/20 mm quer/.test(t)
      && KAT.validiereProdukt(pr).length === 0;
  })());
  // Auch die Rollenbeschreibung darf keine zweite, gedrehte Aussage fuehren.
  ok("Rolle ausgleichsblech: der Hinweis nennt dieselbe Orientierung (#96)", (() => {
    const h = String((KAT.rolle("ausgleichsblech") || {}).hinweis || "");
    return /20 mm in Wandrichtung/.test(h) && /100 mm quer/.test(h)
      && !/100 mm in Wandrichtung/.test(h) && !/20 mm quer/.test(h);
  })());
  // #96 Die Menge ist abgeleitet ([A-18]): der Hinweis darf nicht mehr behaupten, aus der Rolle
  // entstehe keine Menge und keine Stuecklistenposition — er muss die Menge als Zahl der
  // Ausgleichspunkte benennen. Ein Maß-Diskriminator bleibt trotzdem aus (kein Wandwert).
  ok("Rolle ausgleichsblech: der Hinweis benennt die Menge als Zahl der Ausgleichspunkte (#96)", (() => {
    const r = KAT.rolle("ausgleichsblech") || {};
    const h = String(r.hinweis || "");
    return /Ausgleichspunkte/.test(h) && /ein Blech je\s+Punkt|ein Blech je Punkt/.test(h)
      && !/keine Menge/.test(h) && !/keine Stücklistenposition/.test(h)
      && !/nicht festgelegt/.test(h)
      && r.mass === null && r.bepreist === true;
  })());
  ok("Standardkatalog: das Ausgleichsblech ist im Text ausdruecklich vorlaeufig (#96)", (() => {
    const pr = KAT.produkt(std, (v.ausgleichsblech || [])[0]);
    return /vorl\u00e4ufig/.test(pr.bezeichnung)
      && /vorl\u00e4ufig \u2014 fachlich unbest\u00e4tigt/.test(pr.hinweis || "");
  })());
  // Vorbelegung fuer eine Wand OHNE eigene Wahl: die leere Rolle uebernimmt genau dieses Produkt
  // und ist danach eine ganz normale, aufgeloeste Auswahl ([P-18]).
  ok("#96 Vorbelegung: Wand ohne eigene Wahl fuehrt das vorlaeufige Ausgleichsblech", (() => {
    const ids = v.ausgleichsblech || [];
    const leer = KAT.rollenStatus("ausgleichsblech", { planung: { produkte: { rollen: {} } } }, std, {});
    const eing = { planung: { produkte: { rollen: { ausgleichsblech: ids } } } };
    const st = KAT.rollenStatus("ausgleichsblech", eing, std, {});
    return leer.status === "keine_auswahl" && st.status === "ok" && st.produkt.id === ids[0];
  })());
  // [A-25]/#93 Die Vorlage bringt GENAU EIN vorlaeufiges Einlegeblech und GENAU EINE Mutter
  // mit. Die Blechmaße sind die Annahme aus dem Entscheid vom 2026-09-07 (110 x 30 mm, 2 mm)
  // und stehen ausschliesslich hier — nicht im Rechenkern, nicht im Orakel, nicht in der
  // Zeichnung. Der Austausch nach Karls Freigabe bleibt damit ein reiner Katalog-Edit.
  ok("Standardkatalog belegt einlegeblech und zp_mutter mit je EINEM Produkt vor ([A-25])", (() => {
    const bl = v.einlegeblech || [], mu = v.zp_mutter || [];
    if (bl.length !== 1 || mu.length !== 1) return false;
    const pb = KAT.produkt(std, bl[0]), pm = KAT.produkt(std, mu[0]);
    return pb.kategorie === "blech_platte" && pb.einheit === "Stk"
      && pm.kategorie === "verbrauch" && pm.einheit === "Stk"
      && KAT.validiereProdukt(pb).length === 0 && KAT.validiereProdukt(pm).length === 0
      && !KAT.rollenOhneVorschlag(std).includes("einlegeblech")
      && !KAT.rollenOhneVorschlag(std).includes("zp_mutter");
  })());
  ok("Standardkatalog: das Einlegeblech misst 110 × 30 mm bei 2 mm Dicke ([A-25])", (() => {
    const pr = KAT.produkt(std, (v.einlegeblech || [])[0]);
    return +pr.breite_mm === 110 && +pr.hoehe_mm === 30 && +pr.dicke_mm === 2
      && pr.laenge_mm == null;
  })());
  // Die Mutter erfindet kein Maß: ueber das Gewinde M10 hinaus ist nichts festgelegt.
  // Seit dem 2026-09-08 ist die EINBAUHOEHE der Mutter vorgegeben (8 mm) und deshalb gepflegt.
  // Erfunden wird weiterhin nichts: Breite, Laenge und Dicke bleiben leer, und aus der Hoehe
  // wird NICHTS abgeleitet — die Rolle `zp_mutter` fuehrt kein `mass` ([A-25]/[P-14]).
  ok("Standardkatalog: die Mutter nennt M10 und pflegt allein die vorgegebene Einbauhöhe ([A-25])", (() => {
    const pr = KAT.produkt(std, (v.zp_mutter || [])[0]);
    return /M10/.test(String(pr.bezeichnung)) && pr.hoehe_mm === 8
      && pr.breite_mm == null && pr.laenge_mm == null && pr.dicke_mm == null
      && KAT.rolle("zp_mutter").mass === null;
  })());
  // Die MUTTER traegt seit dem 2026-09-08 ihre verbindliche Bezeichnung (M10,8 DIN 934); sie
  // ist deshalb nicht mehr im Namen vorlaeufig. Vorlaeufig bleiben ihre nicht gepflegten Maße
  // und der angenommene Preis — das steht im Hinweis. Das EINLEGEBLECH ist unveraendert in
  // beidem vorlaeufig.
  ok("Standardkatalog: beide neuen Eintraege benennen ihren vorlaeufigen Anteil ([A-25])", (() => {
    const pb = KAT.produkt(std, (v.einlegeblech || [])[0]);
    const pm = KAT.produkt(std, (v.zp_mutter || [])[0]);
    return /vorläufig/.test(pb.bezeichnung) && !/vorläufig/.test(pm.bezeichnung)
      && [pb, pm].every((pr) => /vorläufig — fachlich unbestätigt/.test(pr.hinweis || ""));
  })());
  // Der Rollenhinweis muss die Menge als Zahl der Zwischenspannpunkte benennen ([A-25]) und die
  // Abgrenzung zur Spannplatte nach [A-3] aussprechen — sonst liesse sich beides verwechseln.
  ok("Rolle einlegeblech: der Hinweis benennt die Menge und grenzt gegen die Spannplatte ab", (() => {
    const h = String((KAT.rolle("einlegeblech") || {}).hinweis || "");
    return /Zwischenspannpunkte/.test(h) && /ein Blech je Punkt/.test(h)
      && /A-3/.test(h) && /Spannplatte/.test(h) && /A-25/.test(h)
      && !/keine Menge/.test(h) && !/nicht implementiert/.test(h);
  })());
  ok("Rolle zp_mutter: der Hinweis benennt die Menge und die Abgrenzung zur Spannmutter", (() => {
    const h = String((KAT.rolle("zp_mutter") || {}).hinweis || "");
    return /Zwischenspannpunkte/.test(h) && /eine Mutter je Punkt/.test(h)
      && /Spannmutter/.test(h) && /A-16/.test(h) && /A-25/.test(h);
  })());
  // Die vorlaeufigen Blechmaße stehen NUR im Katalog: keine Datei des Rechenwegs nennt sie.
  ok("[A-25] die vorlaeufigen Blechmaße stehen nur im Katalog, nicht im Rechenweg", (() => {
    const dateien = ["sembla-core.js", "sembla-bom.js", "sembla-zeichnung.js"]
      .map((f) => readFileSync(new URL("../../docs/shared/" + f, import.meta.url), "utf8"));
    const py = readFileSync(new URL("../../tests/core/sembla_core.py", import.meta.url), "utf8");
    return [...dateien, py].every((t) => !/110\s*[x×]\s*30/.test(t));
  })());
  // Vorbelegung fuer eine Wand OHNE eigene Wahl ([P-18]).
  ok("[A-25] Vorbelegung: Wand ohne eigene Wahl fuehrt beide vorlaeufigen Produkte", (() => {
    const leerE = { planung: { produkte: { rollen: {} } } };
    return ["einlegeblech", "zp_mutter"].every((rid) => {
      const ids = v[rid] || [];
      const leer = KAT.rollenStatus(rid, leerE, std, {});
      const st = KAT.rollenStatus(rid, { planung: { produkte: { rollen: { [rid]: ids } } } }, std, {});
      return leer.status === "keine_auswahl" && st.status === "ok" && st.produkt.id === ids[0];
    });
  })());
  ok("Standardkatalog fuehrt die Standardlaengen 1000 und 920 mm",
    (v.rod_std || []).map((id) => KAT.produkt(std, id).laenge_mm).sort((a, b) => b - a).join() === "1000,920");

  // --- #103 Die zweite Standardlaenge ist 920 mm ------------------------------------------
  // Geprueft wird am AUSGELIEFERTEN Datensatz derselben Datei, die der Browser laedt: der Wert
  // UND die sichtbare Bezeichnung muessen 920 nennen. Eine Bezeichnung, die noch 850 nennt,
  // waere eine zweite, falsche Maßangabe neben `laenge_mm` — genau der Drift aus [P-6].
  const gs920 = (v.rod_std || []).map((id) => KAT.produkt(std, id))
    .find((pr) => +pr.laenge_mm === 920);
  ok("#103 die zweite Standardlaenge der Vorlage ist 920 mm", !!gs920);
  ok("#103 die sichtbare Bezeichnung nennt 920 mm und nirgends mehr 850",
    !!gs920 && /\b920 mm\b/.test(gs920.bezeichnung) && !/850/.test(gs920.bezeichnung));
  ok("#103 keine Produktbezeichnung der Vorlage nennt noch 850",
    std.produkte.every((pr) => !/850/.test(pr.bezeichnung || "")));
  // Fachattribute bleiben unveraendert: Rolle, Gewinde, Guete, Kategorie, Einheit, Preis.
  ok("#103 Rolle rod_std, M10 und Guete 8.8 sind unveraendert",
    !!gs920 && (gs920.rollen || []).includes("rod_std")
    && gs920.gewinde === "M10" && gs920.guete === "8.8"
    && gs920.kategorie === "gewindestange" && gs920.einheit === "Stk" && +gs920.preis === 3.3
    && KAT.validiereProdukt(gs920).length === 0);
  // Die Aenderung ist ein DATENWERT, keine neue Rolle: es bleiben genau zwei Standardlaengen.
  ok("#103 rod_std fuehrt weiterhin genau zwei Standardlaengen",
    (v.rod_std || []).length === 2
    && KAT.standardLaengen({ planung: { produkte: { rollen: { rod_std: v.rod_std } } } }, std,
      "rod_std").laengen_mm.join() === "1000,920");
  ok("Standardkatalog fuehrt genau EIN Reststueck mit 100 mm ([Z-6])",
    (v.rod_rest || []).length === 1 && KAT.produkt(std, v.rod_rest[0]).laenge_mm === 100);
  ok("Standardkatalog fuehrt nur EINE Kopplungsmutter (keine Fuß-Sonderausfuehrung)",
    (v.kupplung || []).length === 1
    && std.produkte.filter((p) => /kopplungsmutter/i.test(p.id)).length === 1);

  // --- [A-10] Bodenblech-Standardlaengen der Vorlage --------------------------------------
  // Die Vorlage muss den vollen Vorratssatz 250…1250 mm im 125-mm-Raster mitbringen, sonst kann
  // [P-18] die Rolle nicht sinnvoll vorbelegen und die Zerlegung faende nichts zu kombinieren.
  const RASTER = [1250, 1125, 1000, 875, 750, 625, 500, 375, 250];
  // Maßgebend ist DASSELBE Feld wie in loesePreis/rollenStatus: das erste belegte aus
  // `mass.felder`. Der Test liest die Definition, statt `breite_mm` zu wiederholen.
  const FELDER = KAT.rolle("blech_boden").mass.felder;
  const massVon = (pr) => FELDER.map((f) => +pr[f]).find((x) => Number.isFinite(x) && x > 0);
  const bbIds = v.blech_boden || [];
  const bbProd = bbIds.map((id) => KAT.produkt(std, id));

  ok("[A-10] Standardkatalog fuehrt je Rastermaß 250…1250 mm ein Bodenblech",
    bbProd.map(massVon).sort((a, b) => b - a).join() === RASTER.join());
  ok("[A-10] jedes Bodenblech ist ein gueltiges Produkt seiner Kategorie",
    bbProd.length === 9 && bbProd.every((pr) => pr.kategorie === "blech_platte"
      && pr.einheit === "Stk" && KAT.validiereProdukt(pr).length === 0));
  // Kein kollidierendes Maß: `hoehe_mm` (Wanddicke) darf nie ein Rastermaß sein, sonst traefe
  // loesePreis ueber `some()` das falsche Feld, und `laenge_mm` wuerde die Gruppierung in
  // rollenStatus verschieben (dort entscheidet das ERSTE belegte Feld).
  ok("[A-10] kein kollidierendes Maßfeld an den Bodenblechen",
    bbProd.every((pr) => pr.laenge_mm == null && pr.hoehe_mm === 125
      && !RASTER.includes(pr.hoehe_mm) && pr.dicke_mm === 10));
  ok("[A-10] Bodenbleche sind als vorlaeufig gekennzeichnet und nennen das Bauteilmaß ([A-12])",
    bbProd.every((pr) => /vorläufig/.test(pr.hinweis || "")
      && new RegExp("\\b" + (massVon(pr) - 2) + " mm").test(pr.hinweis || "")));

  // [P-18]: die leere Rolle wird aus der Vorlage vorbelegt — und zwar mit allen neun.
  ok("[P-18] Vorbelegung fuellt die leere Rolle blech_boden vollstaendig",
    bbIds.length === 9 && !KAT.rollenOhneVorschlag(std).includes("blech_boden"));
  const eingStd = { planung: { produkte: { rollen: { blech_boden: bbIds } } } };
  ok("[A-10] neun verschiedene Standardgroeßen sind kombiniert, nicht mehrdeutig",
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
  // #118 Seit der Versionierung traegt die Vorlage ihre FASSUNG IM PFAD. Genau das ist
  // der Zweck: weil die Kennung allein aus dem Pfad folgt, bekommt jede herausgegebene
  // Fassung von selbst eine eigene, unveraenderliche Identitaet und tritt neben die
  // anderen statt sie zu ersetzen.
  ok("#118 der Vorlagenpfad zeigt auf eine VERSIONIERTE Repo-Datei",
    PFAD === "./vorlagen/SEMBLA_Standardkatalog-v2.json");
  const id = KAT.vorlageKatalogId(PFAD);
  ok("#102 die Kennung ist deterministisch und pfadabgeleitet",
    id === "kat-vorlage-vorlagen-sembla-standardkatalog-v2"
    && KAT.vorlageKatalogId(PFAD) === id
    && KAT.vorlageKatalogId("vorlagen/SEMBLA_Standardkatalog-v2.json") === id);
  ok("#118 jede Fassung ergibt eine EIGENE Kennung — keine ersetzt eine andere",
    KAT.vorlageKatalogId("./vorlagen/SEMBLA_Standardkatalog-v1.json") !== id);
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
    && KAT.katalogObjekt(echt).version === KAT.KATALOG_VERSION && KAT.KATALOG_VERSION === 2);
}


// --- 12a) Herausgegebene Fassung v2: die drei Schluesselweiten (#97) ------
// #118 gibt den Standardkatalog VERSIONIERT heraus: eine geaenderte Fassung ersetzt keine
// bestehende, sondern tritt als eigene Datei daneben. v2 pflegt die Schluesselweite 17 mm
// an Spannmutter, Mutter des Einlegeblechs und Sechskantschraube Fuss — sie folgt jeweils
// aus dem gepflegten Gewinde M10 (wie schon bei der Kopplungsmutter) und ist nicht geraten.
// Geprueft wird gegen die ECHTEN Repo-Dateien und den echten Parser, nicht gegen ein Fixture.
{
  const lies = (n) => readFileSync(new URL("../../docs/vorlagen/" + n, import.meta.url), "utf8");
  const rohV1 = lies("SEMBLA_Standardkatalog-v1.json");
  const rohV2 = lies("SEMBLA_Standardkatalog-v2.json");
  const v1 = KAT.parseKatalog(rohV1), v2 = KAT.parseKatalog(rohV2);
  const SW_ROLLEN = ["verbrauch-spannmutter", "verbrauch-mutter-m10-einlege",
                     "verbrauch-senkkopfschraube-fuss"];

  ok("#97 die Fassung v2 ist gegen den echten Parser gueltig und traegt Katalogformat 2",
    v2.produkte.length > 0 && v2.version === 2 && KAT.KATALOG_VERSION === 2
    && v2.produkte.every((p) => KAT.validiereProdukt(p).length === 0));
  ok("#97 die drei M10-Spannstabteile fuehren die Schluesselweite 17 mm",
    SW_ROLLEN.every((id) => KAT.produkt(v2, id).sw_mm === 17));
  ok("#97 alle vier M10-Teile sind untereinander stimmig (mit der Kopplungsmutter)",
    [...SW_ROLLEN, "verbrauch-kopplungsmutter"].every((id) => {
      const pr = KAT.produkt(v2, id);
      return pr.sw_mm === 17 && String(pr.gewinde) === "M10";
    }));
  ok("#97 jede gepflegte Schluesselweite ist im Hinweis als Folge des Gewindes benannt",
    SW_ROLLEN.every((id) => {
      const h = String(KAT.produkt(v2, id).hinweis || "");
      return /Die Schlüsselweite 17 mm folgt aus dem gepflegten Gewinde M10/.test(h)
        && /ist nicht geraten/.test(h);
    }));
  ok("#97 erfunden wird nichts: keine Kopfhoehe der Schraube, keine neue Norm",
    (() => {
      const sr = KAT.produkt(v2, "verbrauch-senkkopfschraube-fuss");
      return sr.hoehe_mm == null && sr.breite_mm == null && sr.dicke_mm == null
        && sr.norm == null && /nicht genannt und wird nicht erfunden/.test(String(sr.hinweis));
    })());

  // Der Kern des Pakets: v2 ist eine FASSUNG von v1, keine neue Datenlage. Unterschieden
  // werden darf genau der Fassungsname und, an den drei Produkten, die neue Schluesselweite
  // samt ihrer Begruendung im Hinweis — kein Preis, keine Produktzeile, keine Baugruppe.
  ok("#97 v2 unterscheidet sich von v1 NUR im Fassungsnamen und in den drei Produkten",
    (() => {
      const o1 = JSON.parse(rohV1), o2 = JSON.parse(rohV2);
      const felder = [...new Set([...Object.keys(o1), ...Object.keys(o2)])]
        .filter((k) => JSON.stringify(o1[k]) !== JSON.stringify(o2[k]));
      if (felder.join() !== "name,produkte") return false;
      if (!/ v1 /.test(o1.name) || !/ v2 /.test(o2.name)) return false;
      if (o1.name.replace(" v1 ", " v2 ") !== o2.name) return false;
      if (o1.produkte.length !== o2.produkte.length) return false;
      return o1.produkte.every((p, i) => {
        const q = o2.produkte[i];
        if (p.id !== q.id) return false;
        const diff = [...new Set([...Object.keys(p), ...Object.keys(q)])]
          .filter((k) => JSON.stringify(p[k]) !== JSON.stringify(q[k])).sort();
        return SW_ROLLEN.includes(p.id)
          ? diff.join() === "hinweis,sw_mm" && p.sw_mm === undefined && q.sw_mm === 17
            // Der Hinweis wird ANGEHAENGT, nicht umformuliert: der v1-Text steht wortgleich
            // am Anfang, dahinter genau der Satz zur Herleitung aus dem Gewinde.
            && String(q.hinweis) === String(p.hinweis) + " "
              + "Die Schlüsselweite 17 mm folgt aus dem gepflegten Gewinde M10 und ist "
              + "nicht geraten; erfunden wird daraus nichts weiter."
          : diff.length === 0;
      });
    })());
  ok("#97 Preise, Produktreihenfolge und Baugruppen sind in v2 wertgleich zu v1",
    v2.produkte.map((p) => p.id + ":" + p.preis + ":" + p.einheit).join("|")
      === v1.produkte.map((p) => p.id + ":" + p.preis + ":" + p.einheit).join("|")
    && JSON.stringify(v2.sets) === JSON.stringify(v1.sets));
  ok("#97 v2 macht die Suite unverändert startklar ([P-18])",
    KAT.rollenOhneVorschlag(v2).length === KAT.rollenOhneVorschlag(v1).length
    && KAT.rollenOhneVorschlag(v2).length === 0);

  // Das Verzeichnis (#118) ist der EINE Ort, an dem eine Fassung bekanntgegeben wird.
  const man = KAT.parseVorlagenManifest(lies("kataloge.json"));
  ok("#97 das Verzeichnis fuehrt BEIDE Fassungen und weist aktuell auf v2",
    man.fassungen.length === 2
    && man.fassungen.map((f) => f.version).join() === "v2,v1"
    && man.aktuell === "./vorlagen/SEMBLA_Standardkatalog-v2.json"
    && man.aktuell === KAT.VORLAGE_KATALOG_PFAD);
  ok("#97 der v1-Eintrag steht unveraendert daneben und bleibt eigenstaendig ladbar",
    (() => {
      const f1 = man.fassungen.find((f) => f.version === "v1");
      return !!f1 && f1.pfad === "./vorlagen/SEMBLA_Standardkatalog-v1.json"
        && f1.id === "kat-vorlage-vorlagen-sembla-standardkatalog-v1"
        && f1.id !== man.fassungen.find((f) => f.version === "v2").id
        && KAT.parseKatalog(rohV1).produkte.length === v2.produkte.length;
    })());
  ok("#97 in v1 ist keine der drei Schluesselweiten gesetzt (die Fassung bleibt, wie sie war)",
    SW_ROLLEN.every((id) => KAT.produkt(v1, id).sw_mm == null));
}


// --- Deckenanschluss: Verwendungsstellen und Default-Set ([P-24], #95/#94) -
// Die Bauteilliste ist eine FACHVORGABE vom 2026-09-08 und steht genau einmal: hier als
// Verwendungsrollen, in der Vorlage als Baugruppe. Geprueft wird, dass jede Verwendungsstelle
// ihre EIGENE Rolle behaelt (der Rollenschluessel ist der Stuecklistenschluessel), dass keine
// davon einen erfundenen Mass-Diskriminator traegt und dass die Vorlage jede genau EINMAL
// vorbelegt. Aufgeloest wird hier NICHTS — die Zahl der Anschlusspunkte kommt aus dem
// Rechenkern und ist Gegenstand eines eigenen Pakets.
{
  const DC = ["dc_winkel_wand", "dc_winkel_decke", "dc_schraube", "dc_scheibe", "dc_anker",
              "dc_bohrschraube", "dc_scheibe_bohr"];
  ok("[P-24] alle sieben Verwendungsstellen des Deckenanschlusses sind eigene Rollen",
    DC.every((id) => KAT.rolle(id) != null) && new Set(DC).size === 7);
  ok("[P-24] jede von ihnen gehoert Modul 1, Gruppe Anschluss, Stk, bepreist, ohne Maß",
    DC.every((id) => {
      const r = KAT.rolle(id);
      return r.modul === 1 && r.gruppe === "Anschluss" && r.einheit === "Stk"
        && r.bepreist === true && r.mass === null
        && KAT.rollenVonModul(1).some((x) => x.id === id);
    }));
  // Die Winkel sind Blechteile, die Kleinteile Verbrauchsmaterial — eine fachfremde
  // Kategorie an einer dieser Rollen ist ein Katalogfehler und keine Heuristik.
  ok("[P-24] Winkel sind Blech/Platte, Schrauben, Scheiben und Anker Verbrauchsmaterial",
    KAT.rolle("dc_winkel_wand").kategorie === "blech_platte"
    && KAT.rolle("dc_winkel_decke").kategorie === "blech_platte"
    && ["dc_schraube", "dc_scheibe", "dc_anker", "dc_bohrschraube", "dc_scheibe_bohr"]
      .every((id) => KAT.rolle(id).kategorie === "verbrauch"));
  // Zwei Scheiben an zwei Stellen bleiben zwei Positionen; die Schraube des Winkelstosses ist
  // nicht die des Fusses. Zusammengelegt wird nichts, auch nicht bei gleichem Handelsnamen.
  ok("[P-24] die zwei Unterlegscheiben und die zwei Sechskantschrauben bleiben getrennt",
    KAT.rolle("dc_scheibe").id !== KAT.rolle("dc_scheibe_bohr").id
    && KAT.rolle("dc_schraube").id !== KAT.rolle("senkkopf").id
    && KAT.rolle("unterlegscheibe") == null);
  const rohDC = readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json",
    import.meta.url), "utf8");
  const stdDC = KAT.parseKatalog(rohDC);
  ok("[P-24] die Vorlage belegt jede Verwendungsstelle mit genau EINEM Produkt vor ([P-18])",
    (() => {
      const v = KAT.produktrollenVorschlag(stdDC);
      return DC.every((id) => Array.isArray(v[id]) && v[id].length === 1);
    })());
  ok("[P-24] die Vorlage fuehrt die Baugruppe „Deckenanschluss“ mit den vorgegebenen Mengen",
    (() => {
      const set = KAT.set(stdDC, "set-deckenanschluss");
      return !!set && set.name === "Deckenanschluss"
        && JSON.stringify(set.positionen.map((x) => [x.rolle, x.menge])) === JSON.stringify(
          [["spannplatte", 1], ["spannmutter", 1], ["dc_winkel_wand", 1], ["dc_winkel_decke", 1],
           ["dc_schraube", 2], ["dc_scheibe", 2], ["dc_anker", 2], ["dc_bohrschraube", 2],
           ["dc_scheibe_bohr", 2]]);
    })());
  // Spannplatte und Spannmutter stehen in BEIDEN Baugruppen — die zulaessige
  // Mehrfachverwendung nach [P-21]. Der Katalog bleibt dabei gueltig.
  ok("[P-24] Spannplatte und Spannmutter stehen in beiden Baugruppen, der Katalog ist gueltig",
    (() => {
      const inSet = (id) => KAT.set(stdDC, id).positionen.map((x) => x.rolle);
      return ["spannplatte", "spannmutter"].every((r) =>
        inSet("set-wandabschluss").includes(r) && inSet("set-deckenanschluss").includes(r))
        && KAT.validiereKatalog(stdDC).length === 0;
    })());
  // Die Winkelmasse liegen NICHT vor: das Vorlagenprodukt weist sie ausdruecklich als
  // vorlaeufig aus, damit daraus keine Geometrie und kein Nachweis abgeleitet wird.
  ok("[P-24] die Winkelprodukte weisen ihre Maße ausdruecklich als vorlaeufig aus",
    ["dc-winkel-wand", "dc-winkel-decke"].every((id) => {
      const pr = KAT.produkt(stdDC, id);
      return !!pr && /vorläufig/i.test(pr.bezeichnung) && /vorläufig/i.test(pr.hinweis || "")
        && /Platzhalter/.test(pr.hinweis || "");
    }));
}

// --- Baugruppen / Sets ([P-21]) und Katalogformat v2 ([P-22], #94) --------
// Das Set ist DEFINITIONSEBENE des Katalogs: geprueft werden Form, Referenzen,
// Mengen, Eindeutigkeit, das Verschachtelungsverbot, die verlustfreie Migration
// v1 -> v2 und der Roundtrip. Aufgeloest wird hier NICHTS ([P-19]).
{
  const V1 = { format: KAT.KATALOG_FORMAT, version: 1, name: "Altkatalog",
               produkte: [P_ROD, P_LATTE, P_PLATTE] };
  const mig = KAT.parseKatalog(t(V1));

  // (a) Migration v1 -> v2: Produkte bitgleich, leere Set-Liste, Version gehoben
  ok("[P-22] v1 wird auf v2 migriert", mig.version === 2 && KAT.KATALOG_VERSION === 2);
  ok("[P-22] v1-Migration laesst die Produkte bitgleich",
    JSON.stringify(mig.produkte) === JSON.stringify(V1.produkte));
  ok("[P-22] v1-Migration liefert eine LEERE Set-Liste",
    Array.isArray(mig.sets) && mig.sets.length === 0);
  ok("[P-22] eine v1-Datei mit Baugruppen ist widerspruechlich und wird benannt abgewiesen",
    wirft(t({ ...V1, sets: [{ id: "s", name: "N", positionen: [] }] }), /Version 1.*Baugruppen|Baugruppen.*Version/s));
  ok("[P-22] ein Katalog ohne sets-Feld bleibt gueltig (kein Mangel)",
    KAT.validiereKatalog(V1).length === 0);

  // (b) Roundtrip v2 mit mehreren Sets — Kennung, Name, Reihenfolge, Art, Menge
  const SETS = [
    { id: "set-wandabschluss", name: "Wandabschluss",
      positionen: [{ produkt: P_ROD.id, menge: 2 }, { rolle: "kupplung", menge: 4 },
                   { produkt: P_PLATTE.id, menge: 1 }] },
    // Dasselbe Bauteil in einer ZWEITEN Baugruppe ist ausdruecklich zulaessig ([P-21]).
    { id: "set-deckenanschluss", name: "Deckenanschluss",
      positionen: [{ produkt: P_PLATTE.id, menge: 3 }, { rolle: "spannmutter", menge: 8 }] },
  ];
  const V2 = { ...mig, sets: SETS };
  ok("[P-21] gueltiger v2-Katalog mit mehreren Sets", KAT.validiereKatalog(V2).length === 0);
  ok("[P-21] dasselbe Produkt darf in mehreren Baugruppen stehen",
    SETS.filter((s) => s.positionen.some((p) => p.produkt === P_PLATTE.id)).length === 2
    && KAT.validiereKatalog(V2).length === 0);
  const rt = KAT.parseKatalog(t(KAT.katalogObjekt(V2)));
  ok("[P-22] Roundtrip Export -> Import erhaelt alle Set-Definitionen",
    JSON.stringify(rt.sets) === JSON.stringify(SETS));
  ok("[P-22] katalogObjekt fuehrt sets — sonst ginge jede Baugruppe beim Speichern verloren",
    "sets" in KAT.katalogObjekt(V2) && KAT.katalogObjekt(V2).sets.length === 2);
  ok("[P-22] katalogObjekt eines Katalogs ohne sets liefert eine leere Liste",
    JSON.stringify(KAT.katalogObjekt(V1).sets) === "[]");
  ok("[P-22] die Migration ruehrt keine Produktreferenz an (Rollenangaben unveraendert)",
    JSON.stringify(KAT.produktrollenVorschlag(rt)) === JSON.stringify(KAT.produktrollenVorschlag(V1)));

  // (c) Fehlerformen — jede EINZELN und konkret benannt ([P-9])
  const setFehler = (positionen) =>
    KAT.validiereKatalog({ ...mig, sets: [{ id: "s1", name: "Probe", positionen }] }).join("|");
  ok("[P-21] unbekanntes Produkt wird konkret benannt",
    /Set 1 .*Probe.*Position 1: Produkt „gibt-es-nicht“ ist in diesem Katalog nicht vorhanden/
      .test(setFehler([{ produkt: "gibt-es-nicht", menge: 1 }])));
  ok("[P-21] unbekannte Verwendungsrolle wird konkret benannt",
    /Position 1: Unbekannte Verwendungsrolle „keine-rolle“/.test(setFehler([{ rolle: "keine-rolle", menge: 1 }])));
  ok("[P-21] nicht waehlbare Rolle wird abgewiesen (Sonderzuschnitt, [P-18])",
    /Position 1: Verwendungsrolle „rod_sonder“ ist nicht wählbar/.test(setFehler([{ rolle: "rod_sonder", menge: 1 }])));
  ok("[P-21] Menge 0 wird benannt abgewiesen",
    /Position 1: Menge 0 muss mindestens 1 sein/.test(setFehler([{ produkt: P_ROD.id, menge: 0 }])));
  ok("[P-21] nicht ganzzahlige Menge wird benannt abgewiesen, nie gerundet",
    /Position 1: Menge 1.5 muss eine ganze Zahl sein/.test(setFehler([{ produkt: P_ROD.id, menge: 1.5 }])));
  ok("[P-21] fehlende Menge wird benannt",
    /Position 1: Menge fehlt/.test(setFehler([{ produkt: P_ROD.id }])));
  ok("[P-21] Set als Position -> EIGENE Meldung (Verschachtelungsverbot)",
    /Position 1: verschachtelte Sets sind unzulässig/.test(setFehler([{ set: "set-wandabschluss", menge: 1 }])));
  ok("[P-21] Produkt UND Rolle zugleich -> unzulaessige Positionsform",
    /Position 1: es ist genau eine Angabe zulässig/.test(setFehler([{ produkt: P_ROD.id, rolle: "kupplung", menge: 1 }])));
  ok("[P-21] weder Produkt noch Rolle -> unzulaessige Positionsform",
    /Position 1: weder ein Produkt noch eine Verwendungsrolle/.test(setFehler([{ menge: 1 }])));
  ok("[P-21] doppelte Set-Kennung wird mit Zeilennummer benannt",
    /Set 2 .*B.*: Kennung „doppelt“ ist bereits vergeben/.test(KAT.validiereKatalog({ ...mig,
      sets: [{ id: "doppelt", name: "A", positionen: [] }, { id: "doppelt", name: "B", positionen: [] }] }).join("|")));
  ok("[P-21] Set ohne Namen und ohne Kennung wird benannt",
    /Kennung fehlt/.test(KAT.validiereKatalog({ ...mig, sets: [{ id: "", name: "", positionen: [] }] }).join("|"))
    && /Name fehlt/.test(KAT.validiereKatalog({ ...mig, sets: [{ id: "s", name: "", positionen: [] }] }).join("|")));
  ok("[P-21] sets als Nicht-Liste wird benannt",
    /Feld „sets“ ist keine Liste/.test(KAT.validiereKatalog({ ...mig, sets: {} }).join("|")));
  ok("[P-21] ein ungueltiges Set laesst parseKatalog werfen (nichts wird halb gelesen)",
    wirft(t({ ...mig, sets: [{ id: "s", name: "N", positionen: [{ produkt: "weg", menge: 1 }] }] }),
      /Katalog ungültig[\s\S]*nicht vorhanden/));

  // (d) Leseansicht: benennt Art, Referenz und Menge — loest NICHTS auf ([P-19])
  const pos = KAT.setPositionen(V2, "set-wandabschluss");
  ok("[P-21] setPositionen benennt Art und Menge je Position",
    pos.length === 3 && pos[0].art === "produkt" && pos[0].menge === 2
    && pos[1].art === "rolle" && pos[1].ref === "kupplung" && pos[1].text === "Kopplungsmutter"
    && pos.every((x) => !x.fehlt));
  ok("[P-21] eine unaufloesbare Position wird GEMELDET, nicht ersetzt",
    KAT.setPositionen({ ...mig, sets: [{ id: "x", name: "X", positionen: [{ produkt: "weg", menge: 1 }] }] }, "x")[0].fehlt === true);
  ok("[P-21] normSet korrigiert nichts still (Menge 0 bleibt Menge 0)",
    KAT.normSet({ id: " a ", name: " N ", positionen: [{ produkt: "p", menge: 0 }] }).positionen[0].menge === 0);
  ok("[P-21] normSets liefert bei fehlendem Feld eine leere Liste",
    KAT.normSets(undefined).length === 0 && KAT.normSets(null).length === 0);
  ok("[P-21] leererKatalog bringt eine leere Baugruppenliste mit",
    Array.isArray(KAT.leererKatalog("T").sets) && KAT.leererKatalog("T").sets.length === 0);
  ok("[P-21] neuesSet/vorschlagSetId liefern ein pflegbares Geruest",
    KAT.neuesSet("Wandabschluss").positionen.length === 0
    && KAT.vorschlagSetId("Wandabschluss") === "set-wandabschluss");
}


// --- 14) Beschaffungsangaben der mitgelieferten Vorlage (#113) ------------
// Die Angaben sind laengst bekannt, standen aber im falschen Behaelter: „ISO 4033",
// „DIN 934", „DC01 (1.0330)", „ZE25/25", „Würth 021405532" lagen als FREITEXT mitten in
// `bezeichnung` bzw. `hinweis` und waren damit nicht spaltenweise auswertbar. Belegt wird
// deshalb ausschliesslich, was aus der BESTEHENDEN Bezeichnung bzw. dem Issue vom
// 2026-09-08 folgt; eine Angabe, die nicht bekannt ist, bleibt LEER — und zwar durch
// WEGLASSEN des Feldes, nicht als "" (`validiereProdukt` behandelt beides gleich, aber ein
// Leerstring waere eine gepflegte Aussage ueber Nichtwissen).
//
// Erfunden wird nichts. Drei Werte liegen dabei besonders nah: „DIN 976-1" (Gewindestange),
// „DIN 6334" (Kopplungsmutter) und „S235JR" existieren im Repo NUR als Fixture-Werte
// anderer Tests — sie sind keine Fachaussage ueber die Vorlage und werden namentlich
// gegengeprueft.
//
// Gelesen wird ueber den REALEN Vorlagenweg: dieselbe Datei, die der Browser laedt, durch
// `parseKatalog` und die vollstaendige Katalogvalidierung.
{
  const roh = readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog.json",
    import.meta.url), "utf8");
  const std = KAT.parseKatalog(roh);
  const SECHS = ["norm", "werkstoff", "oberflaeche", "hersteller", "artikelnr", "gewinde"];
  const p113 = (id) => KAT.produkt(std, id) || {};
  // Die tatsaechlich gesetzten Beschaffungsfelder eines Produkts (weggelassene fehlen).
  const besch = (p) => Object.fromEntries(SECHS.filter((f) => p[f] !== undefined)
    .map((f) => [f, p[f]]));

  ok("#113 der Standardkatalog ist ueber den realen Vorlagenweg fehlerfrei gueltig",
    KAT.validiereKatalog(std).length === 0);

  // Die zwei namentlich im Paket geforderten Produkte.
  ok("#113 die Spannmutter traegt Norm ISO 4033 und Gewinde M10 als EIGENE Felder",
    p113("verbrauch-spannmutter").norm === "ISO 4033"
    && p113("verbrauch-spannmutter").gewinde === "M10");
  ok("#113 die Bohrschraube traegt Hersteller Würth und Artikelnummer 021405532",
    p113("dc-bohrschraube-55x32").hersteller === "Würth"
    && p113("dc-bohrschraube-55x32").artikelnr === "021405532");

  // Die VOLLSTAENDIGE Zuordnung — zugleich die Leerprobe: ein Produkt, das hier fehlt, darf
  // KEINES der sechs Felder fuehren. Damit ist „belegt" und „bleibt leer" EINE Aussage und
  // kann nicht auseinanderlaufen.
  const SOLL = {
    // Vorspannung: das Gewinde ist Pflichtfeld der Kategorie und stand schon vorher da.
    "gewindestange-m10-1000": { gewinde: "M10" },
    "gewindestange-m10-850": { gewinde: "M10" },
    "gewindestange-m10-100-rest": { gewinde: "M10" },
    // Muttern und Schrauben: Gewinde aus der Bezeichnung, Norm nur wo genannt.
    "verbrauch-kopplungsmutter": { gewinde: "M10" },
    "verbrauch-senkkopfschraube-fuss": { gewinde: "M10" },
    "verbrauch-spannmutter": { gewinde: "M10", norm: "ISO 4033" },
    "verbrauch-mutter-m10-einlege": { gewinde: "M10", norm: "DIN 934" },
    // Deckenanschluss: die am 2026-09-08 verbindlich genannten Angaben.
    "dc-winkel-wand": { werkstoff: "DC01 (1.0330)", oberflaeche: "ZE25/25" },
    "dc-winkel-decke": { werkstoff: "DC01 (1.0330)", oberflaeche: "ZE25/25" },
    "dc-schraube-m8x50": { gewinde: "M8", norm: "DIN 933", oberflaeche: "galvanisch verzinkt" },
    "dc-scheibe-84": { norm: "DIN 9021", oberflaeche: "galvanisch verzinkt" },
    "dc-anker-fhy-m8": { gewinde: "M8", hersteller: "Fischer", artikelnr: "FHY M8" },
    "dc-bohrschraube-55x32": { hersteller: "Würth", artikelnr: "021405532" },
    "dc-scheibe-bohr-64": { norm: "DIN 9021", oberflaeche: "galvanisch verzinkt",
                            hersteller: "Würth", artikelnr: "04166" },
  };
  const gl = (a, b) => {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.join() === kb.join() && ka.every((x) => a[x] === b[x]);
  };
  ok("#113 jedes Produkt fuehrt GENAU seine belegbaren Beschaffungsangaben",
    std.produkte.every((p) => gl(besch(p), SOLL[p.id] || {})));
  // Die Leerprobe ausdruecklich benannt: 24 der 38 Produkte wissen nichts und sagen nichts.
  ok("#113 die Produkte ohne bekannte Angabe bleiben in ALLEN sechs Feldern leer",
    std.produkte.filter((p) => Object.keys(besch(p)).length === 0).length
      === std.produkte.length - Object.keys(SOLL).length);
  ok("#113 eine unbekannte Angabe wird WEGGELASSEN, nie als leere Zeichenkette gepflegt",
    std.produkte.every((p) => SECHS.every((f) => p[f] !== "")));
  // Gegenprobe gegen die drei naheliegenden Fixture-Werte anderer Tests.
  ok("#113 weder DIN 976-1 noch DIN 6334 noch S235JR sind in die Vorlage gewandert",
    !/DIN 976|DIN 6334|S235JR/.test(roh));
  ok("#113 Fussschraube und Kopplungsmutter tragen KEINE erfundene Norm",
    p113("verbrauch-senkkopfschraube-fuss").norm === undefined
    && p113("verbrauch-kopplungsmutter").norm === undefined);
  // Die Scheiben haben kein Gewinde: 8,4 und 6,4 sind Bohrungsdurchmesser, „ø 5,5" ein
  // Nenndurchmesser — kein metrisches Gewinde und deshalb kein Feldwert.
  ok("#113 Unterlegscheiben und Bohrschraube fuehren kein Gewinde",
    ["dc-scheibe-84", "dc-scheibe-bohr-64", "dc-bohrschraube-55x32"]
      .every((id) => p113(id).gewinde === undefined));
  // „8.8" ist Festigkeitsklasse, nicht Werkstoff — der Beschaffungsblock fuehrt „Güte" als
  // eigene Spalte. Ein Werkstoff an der Schraube waere der falsche Behaelter.
  ok("#113 die Festigkeitsklasse 8.8 ist nicht als Werkstoff einsortiert",
    std.produkte.every((p) => p.werkstoff !== "8.8"));

  // --- Wertgleichheit zum Stand VOR der Aenderung -------------------------
  // Die Baseline ist der am 2026-09-09 vor dem Edit gelesene Stand derselben Datei. Spalten:
  // id, kategorie, einheit, preis, breite_mm, hoehe_mm, dicke_mm, laenge_mm, guete, rollen,
  // bezeichnung. `gewinde` steht bewusst NICHT darin — es ist eines der sechs Felder und
  // wird allein von SOLL gefuehrt.
  const BASIS = [
  ["stein-i3-375", "stein", "Stk", 9.5, 375, 200, 125, null, null, "i3",
   "Stein i3 (37,5 cm)"],
  ["stein-i2-250", "stein", "Stk", 7.2, 250, 200, 125, null, null, "i2",
   "Stein i2 (25 cm)"],
  ["gewindestange-m10-1000", "gewindestange", "Stk", 3.8, null, null, null, 1000, "8.8", "rod_std",
   "Gewindestange M10 1000 mm (8.8)"],
  ["gewindestange-m10-850", "gewindestange", "Stk", 3.3, null, null, null, 920, "8.8", "rod_std",
   "Gewindestange M10 920 mm (8.8) (vorläufig)"],
  ["gewindestange-m10-100-rest", "gewindestange", "Stk", 0.9, null, null, null, 100, "8.8", "rod_rest",
   "Gewindestange M10 100 mm (8.8) – Reststück oberer Abschluss (vorläufig)"],
  ["latte-40-60-1500", "latte", "Stk", 3.5, 40, null, 60, 1500, null, "latte",
   "Latte 40×60 mm, 1,5 m (vorläufig)"],
  ["latte-40-60-3000", "latte", "Stk", 7, 40, null, 60, 3000, null, "latte",
   "Latte 40×60 mm, 3,0 m (vorläufig)"],
  ["beplankung-625-1500", "beplankung", "m2", 8.9, 625, 1500, 12.5, null, null, "beplankung",
   "Beplankungsplatte 625×1500 mm, 12,5 mm (vorläufig)"],
  ["blech-bodenblech-1250", "blech_platte", "Stk", 22.5, 1250, 125, 10, null, null, "blech_boden",
   "Bodenblech 1250×125 mm, 10 mm (Bauteil 1248 mm)"],
  ["blech-bodenblech-1125", "blech_platte", "Stk", 20.25, 1125, 125, 10, null, null, "blech_boden",
   "Bodenblech 1125×125 mm, 10 mm (Bauteil 1123 mm)"],
  ["blech-bodenblech-1000", "blech_platte", "Stk", 18, 1000, 125, 10, null, null, "blech_boden",
   "Bodenblech 1000×125 mm, 10 mm (Bauteil 998 mm)"],
  ["blech-bodenblech-875", "blech_platte", "Stk", 15.75, 875, 125, 10, null, null, "blech_boden",
   "Bodenblech 875×125 mm, 10 mm (Bauteil 873 mm)"],
  ["blech-bodenblech-750", "blech_platte", "Stk", 13.5, 750, 125, 10, null, null, "blech_boden",
   "Bodenblech 750×125 mm, 10 mm (Bauteil 748 mm)"],
  ["blech-bodenblech-625", "blech_platte", "Stk", 11.25, 625, 125, 10, null, null, "blech_boden",
   "Bodenblech 625×125 mm, 10 mm (Bauteil 623 mm)"],
  ["blech-bodenblech-500", "blech_platte", "Stk", 9, 500, 125, 10, null, null, "blech_boden",
   "Bodenblech 500×125 mm, 10 mm (Bauteil 498 mm)"],
  ["blech-bodenblech-375", "blech_platte", "Stk", 6.75, 375, 125, 10, null, null, "blech_boden",
   "Bodenblech 375×125 mm, 10 mm (Bauteil 373 mm)"],
  ["blech-bodenblech-250", "blech_platte", "Stk", 4.5, 250, 125, 10, null, null, "blech_boden",
   "Bodenblech 250×125 mm, 10 mm (Bauteil 248 mm)"],
  ["blech-ausgleich-100", "blech_platte", "Stk", 0.45, 20, 100, 8, null, null, "ausgleichsblech",
   "Ausgleichsblech 20×100 mm, 8 mm (vorläufig)"],
  ["blech-einlegeblech-110", "blech_platte", "Stk", 0.35, 110, 30, 2, null, null, "einlegeblech",
   "Einlegeblech 110×30 mm, 2 mm (vorläufig)"],
  ["blech-kopfblech-1000", "blech_platte", "Stk", 18, 1000, 125, 10, null, null, "blech_kopf",
   "Kopfblech-Modul 1000×125 mm, 10 mm"],
  ["blech-spannplatte", "blech_platte", "Stk", 2.4, 120, 120, 10, null, null, "spannplatte",
   "Spannplatte 120×120 mm, 10 mm (vorläufig)"],
  ["verbinder-fa-1", "verbinder", "Stk", 1.2, null, null, null, null, null, "verbinder",
   "Verbinder FA-1"],
  ["verbinder-fa-2", "verbinder", "Stk", 1.8, null, null, null, null, null, "",
   "Verbinder FA-2 schwer (vorläufig)"],
  ["verbinder-ia-1", "verbinder", "Stk", 0.9, null, null, null, null, null, "",
   "Verbinder IA-1 leicht (vorläufig)"],
  ["verbinder-universal", "verbinder", "Stk", 1.4, null, null, null, null, null, "",
   "Verbinder Universal (vorläufig)"],
  ["verbrauch-kopplungsmutter", "verbrauch", "Stk", 0.65, null, 30, null, null, null, "kupplung",
   "Kopplungsmutter M10, 30 mm"],
  ["verbrauch-senkkopfschraube-fuss", "verbrauch", "Stk", 0.45, null, null, null, 25, null, "senkkopf",
   "Sechskantschraube M10×25 (Fuß)"],
  ["verbrauch-spannmutter", "verbrauch", "Stk", 0.9, null, 10, null, null, null, "spannmutter",
   "Spannmutter M10,8 ISO 4033"],
  ["verbrauch-mutter-m10-einlege", "verbrauch", "Stk", 0.08, null, 8, null, null, null, "zp_mutter",
   "Mutter Einlegeblech M10,8 DIN 934"],
  ["verbrauch-dichtstreifen-200", "verbrauch", "Stk", 0.3, null, null, null, null, null, "dicht_stk",
   "Dichtstreifen 20 cm (Schallschutz)"],
  ["verbrauch-dichtstreifen-rolle", "verbrauch", "m", 1.5, null, null, null, null, null, "dicht",
   "Dichtstreifen Rollenware (vorläufig)"],
  ["dc-winkel-wand", "blech_platte", "Stk", 1.8, 60, 60, 2, null, null, "dc_winkel_wand",
   "Deckenanschluss Winkel Wand, DC01 (1.0330), ZE25/25 (Maße vorläufig)"],
  ["dc-winkel-decke", "blech_platte", "Stk", 1.8, 60, 60, 2, null, null, "dc_winkel_decke",
   "Deckenanschluss Winkel Decke, DC01 (1.0330), ZE25/25 (Maße vorläufig)"],
  ["dc-schraube-m8x50", "verbrauch", "Stk", 0.35, null, null, null, 50, null, "dc_schraube",
   "Sechskantschraube M8×50 DIN 933, 8.8, galvanisch verzinkt"],
  ["dc-scheibe-84", "verbrauch", "Stk", 0.06, null, null, null, null, null, "dc_scheibe",
   "Unterlegscheibe 8,4 DIN 9021, galvanisch verzinkt"],
  ["dc-anker-fhy-m8", "verbrauch", "Stk", 1.2, null, null, null, null, null, "dc_anker",
   "Fischer Hohldeckenanker FHY M8"],
  ["dc-bohrschraube-55x32", "verbrauch", "Stk", 0.28, null, null, null, 32, null, "dc_bohrschraube",
   "Bohrschraube ø 5,5 SHR-BSPL-SW8-(A3K)-5,5×32 (Würth 021405532)"],
  ["dc-scheibe-bohr-64", "verbrauch", "Stk", 0.05, null, null, null, null, null, "dc_scheibe_bohr",
   "Unterlegscheibe 6,4 DIN 9021, galvanisch verzinkt (SHB-DIN9021-140HV-(A2K)-D6,4, Würth 04166)"],  ];
  const nz = (v) => v === undefined ? null : v;
  ok("#113 alle uebrigen Produktfelder sind wertgleich zum Stand vor der Aenderung",
    std.produkte.length === BASIS.length && std.produkte.every((p, i) => {
      const b = BASIS[i];
      return JSON.stringify([p.id, p.kategorie, p.einheit, p.preis, nz(p.breite_mm),
        nz(p.hoehe_mm), nz(p.dicke_mm), nz(p.laenge_mm), nz(p.guete),
        (p.rollen || []).join(","), p.bezeichnung]) === JSON.stringify(b);
    }));
  // Der Beweis, dass die Aenderung REIN ADDITIV war: kein Produkt hat einen Schluessel
  // bekommen, der nicht zu den sechs Beschaffungsfeldern gehoert — und keinen verloren.
  // `sw_mm` steht in dieser Liste, weil es seit #97 ein regulaeres Produktfeld ist (dort
  // eigens geprueft) — der Additivitaetsbeweis von #113 bleibt damit eine Aussage ueber die
  // Beschaffungsfelder und wird von der Schluesselweite nicht aufgeweicht.
  const BASIS_KEYS = ["id", "kategorie", "bezeichnung", "einheit", "preis", "breite_mm",
    "hoehe_mm", "dicke_mm", "laenge_mm", "sw_mm", "guete", "rollen", "hinweis"];
  ok("#113 hinzugekommen sind ausschliesslich Beschaffungsfelder",
    std.produkte.every((p) => Object.keys(p)
      .every((f) => BASIS_KEYS.includes(f) || SECHS.includes(f))));
  // --- Die Schluesselweite der mitgelieferten Vorlage (#97) ---------------
  // Genau EIN Produkt fuehrt sie: die Kopplungsmutter M10 mit 17 mm. Die Leerprobe ist
  // ausdruecklich Teil der Aussage — an Spannmutter, Einlegeblech-Mutter, Sechskantschrauben,
  // Scheiben, Anker, Bohrschraube und Dichtstreifen wird KEIN Wert aus einer Bezeichnung
  // geraten (auch nicht aus dem "SW8" im Bestellschluessel der Bohrschraube).
  ok("#97 die Kopplungsmutter fuehrt genau 17 mm Schlüsselweite",
    p113("verbrauch-kopplungsmutter").sw_mm === 17);
  ok("#97 kein weiteres Vorlagenprodukt fuehrt eine Schlüsselweite",
    std.produkte.filter((p) => p.sw_mm !== undefined).map((p) => p.id).join()
      === "verbrauch-kopplungsmutter");
  ok("#97 der Hinweis nennt das gepflegte Gewinde M10 als Herkunft — ohne Norm",
    /M10/.test(p113("verbrauch-kopplungsmutter").hinweis || "")
    && /Schlüsselweite/.test(p113("verbrauch-kopplungsmutter").hinweis || "")
    && p113("verbrauch-kopplungsmutter").norm === undefined);
  ok("#113 Produktzahl und Reihenfolge der Kennungen sind unveraendert",
    std.produkte.length === 38
    && std.produkte.map((p) => p.id).join() === BASIS.map((b) => b[0]).join());
  // Die langen Erklaertexte sind nicht in der Tabelle — sie stehen als ein Digest, damit auch
  // eine stille Umformulierung auffaellt (Hinweise sind Fachaussagen, kein Beiwerk).
  // Der Digest ist am 2026-09-09 einmal fortgeschrieben: #97 haengt an den Hinweis der
  // Kopplungsmutter den Satz, dass die Schlüsselweite 17 mm aus dem gepflegten Gewinde M10
  // folgt und keine Norm erfunden wird. Kein anderer Hinweistext wurde beruehrt.
  ok("#113 die hinweis-Texte aller Produkte sind unveraendert",
    createHash("sha256").update(std.produkte
      .map((p) => String(p.id) + " " + String(p.hinweis == null ? "" : p.hinweis)).join("|"))
      .digest("hex")
      === "079b34474f461ab6440063e0b9a7c299a3865130a85b06b6ca839c487525a082");
  // Und die Gegenprobe zum Paketziel: KATALOG_VERSION bleibt, wo sie war.
  ok("#113 die Vorlage bleibt bei Katalogformat Version 2 (kein Sprung)",
    JSON.parse(roh).version === 2 && std.version === KAT.KATALOG_VERSION);
}

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
