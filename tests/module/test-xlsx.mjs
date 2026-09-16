// Regressionstest des EXCEL-EXPORTS der Stuecklisten (Issue #135).
//
// Geprueft werden (a) der minimale XLSX-Writer (docs/shared/xlsx.js) am entpackten
// Paket — gelesen mit dem EIGENEN ZIP-Leser `entpacke`, kein zweites Werkzeug —,
// (b) die Wertgleichheit von CSV und XLSX aus demselben AoA (das Dateiformat ist
// reine Verpackung, kein zweiter Mengen- oder Preispfad) und (c) der echte
// Exportweg `hierarchieExport` mit `format` fuer Baustellen-, Einzelteil-,
// Gesamt- und Matrix-Stückliste — samt Byte-Gleichheit des CSV-Bestands.
import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { standardEingaben } from "../../docs/shared/storage.js";
import { aoaToXlsx, blattName, spaltenName, zelleXml } from "../../docs/shared/xlsx.js";
import { entpacke } from "../../docs/shared/zip.js";
import {
  MENGEN_FASSUNG, normDateiformat,
  stuecklisteAoa, stuecklisteCsv, stuecklisteXlsx,
  einbauteileAoa, einbauteileXlsx,
  gesamtstuecklisteAoa, gesamtstuecklisteDateien, gesamtstuecklisteXlsx,
  matrixStuecklisteAoa, matrixStuecklisteXlsx,
  baueDateien,
} from "../../docs/shared/sembla-export.js";
import { gesamtDaten, umfang, dateiRumpf } from "../../docs/shared/sembla-gesamtstueckliste.js";
import { leereMappe, fuegeGeschossHinzu, setzeWand, setzeKatalogRef } from "../../docs/shared/sembla-projektmappe.js";
import { hierarchieExport } from "../../docs/shared/sembla-archiv.js";

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

// ---------- Hilfen: Sheet-XML zurueck in Zellen lesen (nur fuer den Test) -----------------
const dec = new TextDecoder("utf-8");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** XLSX-Bytes → Teile als {name → text}. */
async function teile(bytes) {
  const out = {};
  for (const e of await entpacke(bytes)) out[e.name] = dec.decode(e.data);
  return out;
}

/** Sheet-XML → Map "B3" → {t:"n"|"s", wert}. */
function zellen(sheetXml) {
  const m = new Map();
  const re = /<c r="([A-Z]+\d+)" t="(n|inlineStr)">(?:<v>([^<]*)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)<\/c>/g;
  for (let g; (g = re.exec(sheetXml));) {
    m.set(g[1], g[2] === "n" ? { t: "n", wert: Number(g[3]) } : { t: "s", wert: unesc(g[4]) });
  }
  return m;
}

/** Wertgleichheit AoA ↔ Sheet: jede nicht leere AoA-Zelle steht typrichtig im Blatt. */
function aoaGleich(aoa, sheetXml) {
  const z = zellen(sheetXml);
  let belegt = 0;
  for (let i = 0; i < aoa.length; i++) {
    for (let j = 0; j < (aoa[i] || []).length; j++) {
      const soll = aoa[i][j];
      const ref = spaltenName(j) + (i + 1);
      if (soll == null || soll === "") { if (z.has(ref)) return false; continue; }
      const ist = z.get(ref);
      if (!ist) return false;
      belegt++;
      if (typeof soll === "number" && isFinite(soll)) {
        if (ist.t !== "n" || Math.abs(ist.wert - soll) > 1e-9) return false;
      } else if (ist.t !== "s" || ist.wert !== String(soll)) return false;
    }
  }
  return belegt === z.size;
}

// ---------- 1. Writer-Bausteine -----------------------------------------------------------
{
  ok("Spaltennamen: A, Z, AA, AB, ZZ, AAA",
    spaltenName(0) === "A" && spaltenName(25) === "Z" && spaltenName(26) === "AA"
    && spaltenName(27) === "AB" && spaltenName(701) === "ZZ" && spaltenName(702) === "AAA");
  ok("Blattname: verbotene Zeichen raus, 31 Zeichen, nie leer, Umlaute bleiben",
    blattName("Stück[liste]: */?\\") === "Stück liste"
    && blattName("x".repeat(40)).length === 31
    && blattName("") === "Tabelle1" && blattName(null) === "Tabelle1");
  ok("Zahl wird Zahlenzelle, Text bleibt Text",
    zelleXml("A1", 12.5) === '<c r="A1" t="n"><v>12.5</v></c>'
    && /t="inlineStr"/.test(zelleXml("B1", "007")) && /<t>007<\/t>/.test(zelleXml("B1", "007")));
  ok("leere Zelle erzeugt nichts, XML wird escaped",
    zelleXml("A1", null) === "" && zelleXml("A1", "") === ""
    && /&amp;.*&lt;.*&gt;/.test(zelleXml("A1", 'a&<b>"')));
}

// ---------- 2. Das Paket ist ein valides, vollstaendiges XLSX -----------------------------
const AOA = [
  ["SEMBLA – Prüfblatt", "Größe & <Maß>"],
  [],
  ["Kennung", "Menge", "EP"],
  ["007", 4, 12.5],
  ["GS-k1.2.3", 0, 3.4],
];
{
  const b = aoaToXlsx(AOA, { blatt: "Baustellenstückliste" });
  const t = await teile(b);
  ok("alle Pflichtteile des OOXML-Pakets vorhanden",
    ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
      "xl/styles.xml", "xl/worksheets/sheet1.xml"].every((n) => n in t));
  ok("Workbook nennt genau ein Blatt mit dem bereinigten Namen",
    /<sheet name="Baustellenstückliste" sheetId="1" r:id="rId1"\/>/.test(t["xl/workbook.xml"]));
  ok("Content-Types deklariert Workbook, Blatt und Styles",
    /workbook\.xml/.test(t["[Content_Types].xml"]) && /sheet1\.xml/.test(t["[Content_Types].xml"])
    && /styles\.xml/.test(t["[Content_Types].xml"]));
  const sheet = t["xl/worksheets/sheet1.xml"];
  ok("Sheet ist zellgenau der AoA (Typen, Werte, Luecken)", aoaGleich(AOA, sheet));
  ok("führende Null bleibt Text, 0 bleibt Zahlenzelle",
    zellen(sheet).get("A4").wert === "007" && zellen(sheet).get("A4").t === "s"
    && zellen(sheet).get("B5").t === "n" && zellen(sheet).get("B5").wert === 0);
  ok("Umlaute und Sonderzeichen ueberleben den Roundtrip",
    zellen(sheet).get("B1").wert === "Größe & <Maß>");
  ok("leere AoA-Zeile erzeugt keine Row", !/<row r="2"/.test(sheet));
}

// ---------- 3. Fixture: Wand, Katalog, Mappe (wie test-gesamtstueckliste) -----------------
const KATALOG = { format: "SEMBLA-Bauteilkatalog", version: 1, name: "Testkatalog #135", produkte: [
  { id: "stein-i3", kategorie: "stein", bezeichnung: "Stein i3", einheit: "Stk", preis: 9.5, breite_mm: 375, hoehe_mm: 200, dicke_mm: 125 },
  { id: "stein-i2", kategorie: "stein", bezeichnung: "Stein i2", einheit: "Stk", preis: 7.2, breite_mm: 250, hoehe_mm: 200, dicke_mm: 125 },
  { id: "rod-1000", kategorie: "gewindestange", bezeichnung: "Stange 1000", einheit: "Stk", preis: 3.4, gewinde: "M10", laenge_mm: 1000 },
  { id: "rod-500", kategorie: "gewindestange", bezeichnung: "Stange 500", einheit: "Stk", preis: 1.9, gewinde: "M10", laenge_mm: 500 },
  { id: "rod-rest-300", kategorie: "gewindestange", bezeichnung: "Reststück 300", einheit: "Stk", preis: 1.2, gewinde: "M10", laenge_mm: 300 },
  { id: "kuppl", kategorie: "verbrauch", bezeichnung: "Kopplungsmutter", einheit: "Stk", preis: 0.65 },
  { id: "senkkopf", kategorie: "verbrauch", bezeichnung: "Senkkopfschraube", einheit: "Stk", preis: 0.45 },
  { id: "spannmutter", kategorie: "verbrauch", bezeichnung: "Spannmutter", einheit: "Stk", preis: 0.9 },
  { id: "dicht-stk", kategorie: "verbrauch", bezeichnung: "Dichtstreifen 20 cm", einheit: "Stk", preis: 0.3 },
  { id: "blech-boden", kategorie: "blech_platte", bezeichnung: "Bodenblech 1000", einheit: "Stk", preis: 18, breite_mm: 1000, hoehe_mm: 125, dicke_mm: 15 },
  { id: "blech-kopf", kategorie: "blech_platte", bezeichnung: "Kopfblech 1000", einheit: "Stk", preis: 21, breite_mm: 1000, hoehe_mm: 125, dicke_mm: 15 },
  { id: "spannplatte", kategorie: "blech_platte", bezeichnung: "Spannplatte 120", einheit: "Stk", preis: 2.4, breite_mm: 120, hoehe_mm: 120, dicke_mm: 15 },
]};
const ROLLEN = { i3: ["stein-i3"], i2: ["stein-i2"], rod_std: ["rod-1000", "rod-500"], rod_rest: ["rod-rest-300"],
  kupplung: ["kuppl"], senkkopf: ["senkkopf"], spannmutter: ["spannmutter"], spannplatte: ["spannplatte"],
  blech_boden: ["blech-boden"], blech_kopf: ["blech-kopf"], dicht_stk: ["dicht-stk"] };
function eingabenFuer() {
  const e = standardEingaben();
  e.planung.produkte = { quelle: { name: KATALOG.name, version: 1 }, rollen: JSON.parse(JSON.stringify(ROLLEN)) };
  return e;
}
const OPT = { rod_lengths_mm: [1000, 500], rod_rest_mm: 300 };
const ELEMENTE = {
  "w-a": { id: "w-a", name: "Wand A", wandelement: buildWall("Wand A", 3000, 3000, [new Opening(6, 10, 4, 10, "fenster")], null, OPT) },
  "w-b": { id: "w-b", name: "Wand B", wandelement: buildWall("Wand B", 2000, 2600, [], null, OPT) },
};
const leser = () => ({
  holeElement: (id) => ELEMENTE[id] || null,
  holeEingaben: () => eingabenFuer(),
  katalog: KATALOG,
});
let M = leereMappe("Projekt #135", { gebaeude: "Haus", geschoss: "EG" });
const GEB = M.gebaeude[0].id, EG = M.gebaeude[0].geschosse[0].id;
let r = fuegeGeschossHinzu(M, GEB, "OG"); M = r.mappe; const OG = r.id;
M = setzeWand(M, EG, { id: "w-a", name: "Wand A" });
M = setzeWand(M, OG, { id: "w-b", name: "Wand B" });
M = setzeKatalogRef(M, "kat-135");
const projektObjekt = (id) => ({
  format: "SEMBLA-Projekt", version: 2, name: ELEMENTE[id].name,
  wandelement: ELEMENTE[id].wandelement, eingaben: eingabenFuer(),
});
const P = (ueber = {}) => ({
  mappe: M, ebene: "projekt", gebaeudeId: GEB, geschossId: EG, wandId: "w-a", wandName: "Wand A",
  katalog: KATALOG, ...leser(), projektObjekt, preise: true, ...ueber,
});

// ---------- 4. Wertgleichheit CSV ↔ XLSX je Stuecklistenausgabe ---------------------------
{
  const w = ELEMENTE["w-a"].wandelement, e = eingabenFuer();
  const OPTD = { datum: "01.01.2026" };
  const sheetVon = async (bytes) => (await teile(bytes))["xl/worksheets/sheet1.xml"];

  ok("Baustellenstückliste: XLSX ist zellgenau der AoA der CSV (berechnet)",
    aoaGleich(stuecklisteAoa(w, e, OPTD, KATALOG), await sheetVon(stuecklisteXlsx(w, e, OPTD, KATALOG))));
  ok("Baustellenstückliste: auch die ANGEPASSTE Fassung ist wertgleich ([P-20])", await (async () => {
    const o = { ...OPTD, fassung: "angepasst" };
    const sheet = await sheetVon(stuecklisteXlsx(w, e, o, KATALOG));
    return aoaGleich(stuecklisteAoa(w, e, o, KATALOG), sheet)
      && sheet.includes(MENGEN_FASSUNG.angepasst.split(" – ")[0]);
  })());
  ok("Einzelteilliste: XLSX ist zellgenau der AoA",
    aoaGleich(einbauteileAoa(w, e, OPTD), await sheetVon(einbauteileXlsx(w, e, OPTD))));

  const d = gesamtDaten(umfang(M, "projekt", { gebaeudeId: GEB, geschossId: EG, wandId: "w-a" }), leser());
  ok("Gesamtstückliste: XLSX ist zellgenau der AoA (mit Preisen)",
    aoaGleich(gesamtstuecklisteAoa(d, { ...OPTD, preise: true }),
      await sheetVon(gesamtstuecklisteXlsx(d, { ...OPTD, preise: true }))));
  ok("Matrix-Stückliste: XLSX ist zellgenau der AoA (#132)",
    aoaGleich(matrixStuecklisteAoa(d, OPTD), await sheetVon(matrixStuecklisteXlsx(d, OPTD))));
  ok("Mengenzellen der Matrix sind Zahlenzellen", await (async () => {
    const sheet = await sheetVon(matrixStuecklisteXlsx(d, OPTD));
    const aoa = matrixStuecklisteAoa(d, OPTD);
    const kopfIdx = aoa.findIndex((z) => z[0] === "Gebäude");
    const ref = spaltenName(5) + (kopfIdx + 2);      // erste Artikelzelle der ersten Wandzeile
    return zellen(sheet).get(ref) && zellen(sheet).get(ref).t === "n";
  })());
}

// ---------- 5. Der echte Exportweg: Formatwahl in baueDateien und hierarchieExport --------
{
  ok("normDateiformat: xlsx nur ausdruecklich, alles andere csv",
    normDateiformat("xlsx") === "xlsx" && normDateiformat("csv") === "csv"
    && normDateiformat(undefined) === "csv" && normDateiformat("excel") === "csv");

  const obj = projektObjekt("w-a");
  const csvAlt = baueDateien(obj, ["stueckliste"], KATALOG);
  const csvNeu = baueDateien(obj, ["stueckliste"], KATALOG, { format: "csv" });
  const xlsx = baueDateien(obj, ["stueckliste"], KATALOG, { format: "xlsx" });
  ok("#135 Regression: ohne/mit format 'csv' bleibt die CSV byte-gleich",
    csvAlt.length === 2 && csvAlt.every((f, i) => f.name === csvNeu[i].name && f.data === csvNeu[i].data)
    && csvAlt[0].name.endsWith(".csv"));
  ok("#135 baueDateien xlsx: beide Stuecklistendateien als .xlsx, gleiche Rümpfe",
    xlsx.length === 2
    && xlsx[0].name === csvAlt[0].name.replace(/\.csv$/, ".xlsx")
    && xlsx[1].name === csvAlt[1].name.replace(/\.csv$/, ".xlsx")
    && xlsx.every((f) => f.data instanceof Uint8Array));

  // hierarchieExport: EINE Formatwahl fuer alle Stuecklisten des Laufs.
  const ergX = hierarchieExport(["stueckliste"], P({ ebene: "wand", format: "xlsx" }));
  ok("#135 Wandebene xlsx: Baustellen- und Einzelteilliste als .xlsx, Einkaufsliste bleibt CSV",
    ergX.dateien.some((f) => f.name.startsWith("Baustellenstueckliste_") && f.name.endsWith(".xlsx"))
    && ergX.dateien.some((f) => f.name.startsWith("Einbauteile_Gewindestangen_") && f.name.endsWith(".xlsx"))
    && ergX.dateien.some((f) => f.name.startsWith("Einkaufsliste_Wand_") && f.name.endsWith(".csv")),
  );
  const projX = hierarchieExport(["gesamt", "matrix"], P({ format: "xlsx" }));
  const projC = hierarchieExport(["gesamt", "matrix"], P());
  ok("#135 Projektebene xlsx: Gesamt- und Matrix-Stückliste als .xlsx, Einkaufsliste bleibt CSV",
    projX.dateien.some((f) => f.name === "Gesamtstueckliste_Projekt_Projekt_135.xlsx")
    && projX.dateien.some((f) => f.name === "Matrix-Stueckliste_Wand_x_Artikel_Projekt__135.xlsx")
    && projX.dateien.some((f) => f.name.endsWith("_Einkaufsliste.csv")));
  ok("#135 Regression: ohne format bleibt der CSV-Bestand namens- und wertgleich",
    projC.dateien.some((f) => f.name === "Gesamtstueckliste_Projekt_Projekt_135.csv")
    && projC.dateien.some((f) => f.name === "Matrix-Stueckliste_Wand_x_Artikel_Projekt__135.csv"));
  ok("#135 XLSX und CSV desselben Laufs tragen dieselben Daten (Gesamtstückliste)", await (async () => {
    const xb = projX.dateien.find((f) => f.name === "Gesamtstueckliste_Projekt_Projekt_135.xlsx").data;
    const sheet = (await teile(xb))["xl/worksheets/sheet1.xml"];
    const d = gesamtDaten(umfang(M, "projekt", { gebaeudeId: GEB }), leser());
    // Nur der Datumskopf unterscheidet die Laeufe — er wird fuer den Vergleich uebernommen.
    const zeile = /<c r="A(\d+)" t="inlineStr"><is><t>Datum<\/t><\/is><\/c>/.exec(sheet);
    if (!zeile) return false;
    const datum = zellen(sheet).get("B" + zeile[1]);
    return !!datum && aoaGleich(gesamtstuecklisteAoa(d, { preise: true, datum: datum.wert }), sheet);
  })());
  ok("#135 gesamtstuecklisteDateien: Rumpf gleich, nur die Endung wechselt", (() => {
    const d = gesamtDaten(umfang(M, "projekt", { gebaeudeId: GEB }), leser());
    const c = gesamtstuecklisteDateien(d, { preise: true, rumpf: dateiRumpf(d) });
    const x = gesamtstuecklisteDateien(d, { preise: true, rumpf: dateiRumpf(d), format: "xlsx" });
    return c[0].name.endsWith(".csv") && x[0].name === c[0].name.replace(/\.csv$/, ".xlsx")
      && c[1].name === x[1].name && c[1].name.endsWith("_Einkaufsliste.csv");
  })());
}

// ---------- 6. Der Dialog (Modul 0) startet mit Excel als Default -------------------------
{
  const html = readFileSync(new URL("../../docs/index.html", import.meta.url), "utf8");
  ok("#135 Dialog: Formatwahl vorhanden, Excel vorausgewählt, CSV wählbar",
    /id="exp-format-xlsx" checked/.test(html) && /id="exp-format-csv"(?! checked)/.test(html));
  ok("#135 Dialog: Wahl startet bei jedem Öffnen wieder auf Excel",
    /\$\('exp-format-xlsx'\)\.checked = true/.test(html)
    && /\$\('exp-format-csv'\)\.checked = false/.test(html));
  ok("#135 Dialog: Format wird an hierarchieExport durchgereicht",
    /format: \$\('exp-format-csv'\)\.checked \? 'csv' : 'xlsx'/.test(html));
}

let fail = 0; for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`); process.exit(fail ? 1 : 0);
