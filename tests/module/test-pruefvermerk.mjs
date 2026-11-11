// Logik-Test der Prüfvermerke ([P-25], docs/shared/sembla-pruefhinweise.js).
//
// Geprüft wird:
//   * die Hinweisarten aus dem Wandelement (nur Befunde, die KEIN Baubarkeitsausschluss sind);
//   * der Fingerabdruck: deterministisch, ändert sich mit Befunddaten und Wandgeometrie, NICHT
//     mit Planungskennzeichen (Brandschutz, Wandtyp, Abdichtung, Name);
//   * Kürzel/Datum: unzulässig ⇒ benannt abgewiesen, nie gekürzt ([P-9]);
//   * Vermerke setzen/aufheben (rein), höchstens einer je Art, Altbestand = nichts geprüft,
//     unzulässige Einträge zählen nicht und werden benannt, nicht gelöscht;
//   * Speichern/Laden über die echte Speicherschicht und das Projektformat (PROJEKT_VERSION 2);
//   * das Mitführen im Read-only-Frischpfad (`wandelementAktualisiert`);
//   * VERGLEICHSTEST: Zeichnungsblatt (Modul 7: SVG, Blatt-HTML, Druckdokument, SVG-Datei)
//     und Zeichnungs-PDF-Seite sind mit und ohne Vermerk BYTEGLEICH — der Vermerk steht nur
//     in Modul 1.
//
// Checkout-autark: Wände kommen synthetisch aus dem Core.
// Aufruf:  node tests/module/test-pruefvermerk.mjs

import { readFileSync } from "node:fs";
import { buildWall } from "../../docs/shared/sembla-core.js";
import * as ENG from "../../docs/shared/sembla-engine.js";
import * as PH from "../../docs/shared/sembla-pruefhinweise.js";
import * as Z from "../../docs/shared/sembla-zeichnung.js";
import * as PDF from "../../docs/shared/sembla-zeichnungspdf.js";
import * as WA from "../../docs/shared/sembla-wandanlage.js";
import * as KAT from "../../docs/shared/sembla-katalog.js";

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();
const store = await import("../../docs/shared/storage.js");

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const tief = x => JSON.parse(JSON.stringify(x));

// Wand mit einem echten Prüfhinweis: nur EINE manuelle Spannachse ⇒ ungehaltene Steine [V-9].
function wandMitHinweis(h = 2600) {
  const basis = buildWall("Wand P", 2000, h, []);
  return ENG.nachweisPruefen({
    name: "Wand P", length_mm: 2000, height_mm: h, openings: [], sides: null, steps: [],
    interlocks: [], prestress: { ...basis.prestress, columns_grid: [1], force_kN: 60 },
    load: { qk: 1.0, gammaQ: 1.5 },
  }).wandelement;
}
const ART = "v9_ungehaltene_steine";

// ------------------------------------------------------------------ Hinweisarten
console.log("[P-25] Hinweisarten:");
{
  const w = wandMitHinweis();
  const hs = PH.pruefhinweise(w);
  const v9 = hs.find(h => h.art === ART);
  ok("[V-9]-Befund wird als Prüfhinweis erkannt (Regel V-2, Daten = ungehaltene Steine)",
    v9 && v9.regel === "V-2" && v9.daten.length === w.validation.ungehaltene_steine.length && v9.vermerk === null);
  ok("keine Art für Baubarkeitsausschlüsse (Versatz, ungültige Segmente, Restbreite, [A-29])",
    !PH.HINWEIS_ARTEN.some(a => /versatz|invalid|buildable|bereich_unbaubar|restbreite/i.test(a.art)));
  ok("[A-32] achse_auf_partnerblech ist kein Prüfhinweis (nur ℹ)",
    !PH.HINWEIS_ARTEN.some(a => a.art === "a32_achse_auf_partnerblech"));
  ok("Kennungen sind eindeutig", new Set(PH.HINWEIS_ARTEN.map(a => a.art)).size === PH.HINWEIS_ARTEN.length);
  ok("Z-5 und Z-7 werden getrennt geführt", (() => {
    const v = { zuschnitt_konflikte: [{ k: 1, grund: "mindestmass" }, { k: 2, grund: "stoss_auf_zwischenpunkt" }] };
    const a5 = PH.HINWEIS_ARTEN.find(a => a.art === "z5_zuschnitt").daten(v);
    const a7 = PH.HINWEIS_ARTEN.find(a => a.art === "z7_stoss_zwischenpunkt").daten(v);
    return a5.length === 1 && a5[0].k === 1 && a7.length === 1 && a7[0].k === 2;
  })());
  ok("Wand ohne Befund: keine Prüfhinweise dieser Art", !PH.pruefhinweise(buildWall("x", 2000, 2600, [])).some(h => h.art === ART));
}

// ------------------------------------------------------------------ Fingerabdruck
console.log("[P-25] Fingerabdruck:");
{
  const w = wandMitHinweis();
  const fp = PH.abdruckFuerArt(w, ART);
  ok("deterministisch: zweimal gerechnet ⇒ gleicher Abdruck", fp === PH.abdruckFuerArt(wandMitHinweis(), ART));
  ok("kanonisch: Schlüsselreihenfolge spielt keine Rolle",
    PH.kanonisch({ b: 1, a: [2, { d: 1, c: 2 }] }) === PH.kanonisch({ a: [2, { c: 2, d: 1 }], b: 1 }));
  ok("Wandhöhe geändert ⇒ anderer Abdruck", fp !== PH.abdruckFuerArt(wandMitHinweis(2800), ART));
  ok("nur Geometrie geändert (gleiche Daten) ⇒ anderer Abdruck",
    PH.fingerabdruck(ART, [{ lage: 0 }], { length_mm: 2000, height_mm: 2600 })
      !== PH.fingerabdruck(ART, [{ lage: 0 }], { length_mm: 2125, height_mm: 2600 }));
  ok("nur Befunddaten geändert ⇒ anderer Abdruck",
    PH.fingerabdruck(ART, [{ lage: 0 }], w) !== PH.fingerabdruck(ART, [{ lage: 1 }], w));
  ok("andere Art, gleiche Daten ⇒ anderer Abdruck",
    PH.fingerabdruck(ART, [{ lage: 0 }], w) !== PH.fingerabdruck("z9_stangenfolge", [{ lage: 0 }], w));
  const kennz = { ...tief(w), brandklasse: "F30", wandtyp: "mit_wind", abdichtung: "abgedichtet", name: "Andere" };
  ok("Planungskennzeichen (Brandschutz, Wandtyp, Abdichtung, Name) ändern den Abdruck NICHT",
    PH.abdruckFuerArt(kennz, ART) === fp);
  ok("textArt hängt am Wortlaut", PH.textArt("⚠ a") === PH.textArt("⚠ a") && PH.textArt("⚠ a") !== PH.textArt("⚠ b"));
}

// ------------------------------------------------------------------ Kürzel/Datum
console.log("[P-25] Kürzel und Datum:");
{
  ok("Kürzel FB zulässig", PH.kuerzelFehler("FB") === null && PH.kuerzelFehler(" T.B ") === null);
  ok("leeres Kürzel benannt abgewiesen", /fehlt/.test(PH.kuerzelFehler("  ")));
  ok("zu langes Kürzel abgewiesen, nicht gekürzt", /zu lang/.test(PH.kuerzelFehler("ABCDEFG")));
  ok("unzulässige Zeichen abgewiesen", /unzulässige/.test(PH.kuerzelFehler("F B")) && /unzulässige/.test(PH.kuerzelFehler("<b>")));
  ok("Datum muss ein echtes Kalenderdatum sein",
    PH.datumOk("2026-11-11") && !PH.datumOk("2026-02-30") && !PH.datumOk("11.11.2026"));
  ok("heute() liefert JJJJ-MM-TT", PH.heute(new Date(2026, 10, 11)) === "2026-11-11");
  ok("Anzeige TT.MM.JJJJ", PH.vermerkText({ kuerzel: "FB", datum: "2026-11-11" }) === "geprüft von FB am 11.11.2026");
}

// ------------------------------------------------------------------ Vermerke
console.log("[P-25] Vermerke:");
{
  const w = wandMitHinweis();
  const fp = PH.abdruckFuerArt(w, ART);
  ok("Altbestand ohne Feld: nichts geprüft", PH.pruefvermerke(w).vermerke.length === 0 && PH.vermerkFuer(w, ART, fp) === null);
  let l = PH.setzeVermerk(undefined, { art: ART, fingerabdruck: fp, kuerzel: " FB ", datum: "2026-11-11" });
  ok("setzen: ein Eintrag mit getrimmtem Kürzel", l.length === 1 && l[0].kuerzel === "FB" && l[0].art === ART);
  l = PH.setzeVermerk(l, { art: ART, fingerabdruck: fp, kuerzel: "TB", datum: "2026-11-12" });
  ok("höchstens ein Vermerk je Art — der neue ersetzt den alten", l.length === 1 && l[0].kuerzel === "TB");
  const wm = { ...w, pruefvermerke: l };
  ok("passender Vermerk ⇒ Hinweis geprüft", PH.pruefhinweise(wm).find(h => h.art === ART).vermerk.kuerzel === "TB");
  const w28 = { ...wandMitHinweis(2800), pruefvermerke: l };
  ok("Wand geändert ⇒ Vermerk passt nicht mehr, Hinweis aktiv", PH.pruefhinweise(w28).find(h => h.art === ART).vermerk === null);
  ok("unzulässiges Kürzel beim Setzen ⇒ Fehler, Liste unverändert", (() => {
    try { PH.setzeVermerk(l, { art: ART, fingerabdruck: fp, kuerzel: "", datum: "2026-11-11" }); return false; }
    catch (e) { return /Kürzel fehlt/.test(e.message) && l.length === 1; }
  })());
  ok("unzulässiges Datum beim Setzen ⇒ Fehler", (() => {
    try { PH.setzeVermerk(l, { art: ART, fingerabdruck: fp, kuerzel: "FB", datum: "2026-13-01" }); return false; }
    catch (e) { return /Datum/.test(e.message); }
  })());
  const mitAnderen = PH.setzeVermerk([...l, { art: "z9_stangenfolge", fingerabdruck: "x", kuerzel: "FB", datum: "2026-11-01" }],
    { art: "a26_deckenanschluss_rand", fingerabdruck: "y", kuerzel: "FB", datum: "2026-11-11" }, [ART, "a26_deckenanschluss_rand"]);
  ok("aktuelle Arten: Vermerke erledigter Hinweise werden beim Markieren abgeräumt",
    mitAnderen.map(v => v.art).sort().join() === [ART, "a26_deckenanschluss_rand"].sort().join());
  ok("aufheben entfernt genau die Art", PH.entferneVermerk(mitAnderen, ART).map(v => v.art).join() === "a26_deckenanschluss_rand");
  const kaputt = { ...w, pruefvermerke: [{ art: ART, fingerabdruck: fp, kuerzel: "", datum: "2026-11-11" }, "Unsinn"] };
  const pv = PH.pruefvermerke(kaputt);
  ok("unzulässige Einträge zählen nicht als Prüfung und werden benannt",
    pv.vermerke.length === 0 && pv.ungueltig.length === 2 && PH.vermerkFuer(kaputt, ART, fp) === null);
  ok("unzulässige Einträge bleiben beim Markieren erhalten (nie still gelöscht)",
    PH.setzeVermerk(kaputt.pruefvermerke, { art: ART, fingerabdruck: fp, kuerzel: "FB", datum: "2026-11-11" }, [ART]).length === 3);
  ok("kein Array (Fremdformat) ⇒ benannt, nichts geprüft", PH.pruefvermerke({ pruefvermerke: { x: 1 } }).ungueltig.length === 1);
}

// ------------------------------------------------------------------ Speichern/Laden
console.log("[P-25] Speichern/Laden und Projektformat:");
{
  const w = wandMitHinweis();
  const fp = PH.abdruckFuerArt(w, ART);
  w.pruefvermerke = PH.setzeVermerk(null, { art: ART, fingerabdruck: fp, kuerzel: "FB", datum: "2026-11-11" });
  const id = store.speichere("Wand P", w);
  const geladen = store.holeElement(id).wandelement;
  ok("Speicherschicht: Vermerk bleibt am Wandelement erhalten",
    JSON.stringify(geladen.pruefvermerke) === JSON.stringify(w.pruefvermerke));
  ok("… und gilt nach dem Laden weiter (Abdruck stimmt)",
    PH.pruefhinweise(geladen).find(h => h.art === ART).vermerk.kuerzel === "FB");
  const datei = store.projektObjekt(id);
  ok("Projektdatei: Format v2 unverändert, Vermerk reist im Wandelement mit",
    datei.version === 2 && store.PROJEKT_VERSION === 2 && datei.wandelement.pruefvermerke.length === 1);
  const imp = store.parseImport(JSON.stringify(datei));
  const impWe = imp.wandelement || (imp.eintraege && imp.eintraege[0] && imp.eintraege[0].wandelement)
    || (Array.isArray(imp) && imp[0] && imp[0].wandelement);
  ok("Import: Vermerk kommt verlustfrei zurück",
    !!impWe && JSON.stringify(impWe.pruefvermerke) === JSON.stringify(w.pruefvermerke));
  ok("kein SCHEMA_VERSION-Sprung (7)", store.SCHEMA_VERSION === 7);
  ok("Kürzel-Vorliebe ist getrennt von den Planungsdaten", (() => {
    store.setzePruefKuerzel(" FB "); const a = store.pruefKuerzel();
    store.setzePruefKuerzel(""); return a === "FB" && store.pruefKuerzel() === "";
  })());
}

// ------------------------------------------------------------------ Read-only-Frischpfad
console.log("[P-25] Frischpfad (Geschossplan/Modul 7):");
{
  const katText = readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog-v6.json", import.meta.url), "utf8");
  const katalog = KAT.parseKatalog(katText).katalog || KAT.parseKatalog(katText);
  const w = wandMitHinweis();
  w.pruefvermerke = [{ art: ART, fingerabdruck: "abc", kuerzel: "FB", datum: "2026-11-11" }];
  const eing = store.standardEingaben();
  const erg = WA.wandelementAktualisiert(w, eing, katalog, ENG);
  ok("frisch gerechnete Sicht führt die Vermerke unverändert mit",
    erg.wandelement !== w && JSON.stringify(erg.wandelement.pruefvermerke) === JSON.stringify(w.pruefvermerke));
  const ohne = WA.wandelementAktualisiert(wandMitHinweis(), eing, katalog, ENG);
  ok("ohne Vermerk entsteht kein Feld", !("pruefvermerke" in ohne.wandelement));
  ok("Geschossplan-Neurechnung führt die Vermerke mit (Quelltext)",
    /neu\.pruefvermerke = we\.pruefvermerke/.test(readFileSync(new URL("../../docs/geschossplan.html", import.meta.url), "utf8")));
}

// ------------------------------------------------------------------ Vergleichstest Blatt/PDF
console.log("[P-25] Vergleichstest Zeichnungsblatt und PDF — mit und ohne Vermerk bytegleich:");
{
  const ohne = wandMitHinweis();
  const mit = tief(ohne);
  mit.pruefvermerke = PH.setzeVermerk(null,
    { art: ART, fingerabdruck: PH.abdruckFuerArt(ohne, ART), kuerzel: "FB", datum: "2026-11-11" });
  ok("Voraussetzung: der Vermerk wirkt (Hinweis geprüft)", PH.pruefhinweise(mit).find(h => h.art === ART).vermerk);
  const eing = { projekt: { plan_nr: "A-1", index: "a", gez: "FB" } };
  ok("zeichnungSvg bytegleich", Z.zeichnungSvg(ohne).svg === Z.zeichnungSvg(mit).svg
    && JSON.stringify(Z.zeichnungSvg(ohne)) === JSON.stringify(Z.zeichnungSvg(mit)));
  ok("blattHtml bytegleich", JSON.stringify(Z.blattHtml(ohne, eing)) === JSON.stringify(Z.blattHtml(mit, eing)));
  ok("Druckdokument bytegleich", Z.zeichnungDokument(ohne, eing) === Z.zeichnungDokument(mit, eing));
  ok("SVG-Datei bytegleich", Z.zeichnungSvgDatei(ohne, eing) === Z.zeichnungSvgDatei(mit, eing));
  const sOhne = PDF.wandBlattInhalt(ohne, eing), sMit = PDF.wandBlattInhalt(mit, eing);
  ok("PDF-Blattinhalt bytegleich", JSON.stringify(sOhne) === JSON.stringify(sMit));
  ok("PDF-Seite (gerastertes SVG) bytegleich", PDF.blattSvg(sOhne) === PDF.blattSvg(sMit));
  ok("weder Kürzel noch „geprüft“ auf dem Blatt",
    !/geprüft von|pruefvermerk/i.test(JSON.stringify(Z.blattHtml(mit, eing))) && !/geprüft von/.test(PDF.blattSvg(sMit)));
  ok("Modul 7 und der PDF-Baustein lesen das Feld nicht (Quelltext)",
    !/pruefvermerk/i.test(readFileSync(new URL("../../docs/shared/sembla-zeichnung.js", import.meta.url), "utf8"))
    && !/pruefvermerk/i.test(readFileSync(new URL("../../docs/shared/sembla-zeichnungspdf.js", import.meta.url), "utf8"))
    && !/pruefvermerk|sembla-pruefhinweise/i.test(readFileSync(new URL("../../docs/zeichnung.html", import.meta.url), "utf8")));
}

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
