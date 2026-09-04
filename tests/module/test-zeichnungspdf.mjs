// Logik-Test der gesammelten Zeichnungs-PDFs (docs/shared/sembla-zeichnungspdf.js, #98).
//
// Geprueft wird die DOM-freie Ableitung, aus der der Sammelexport in Modul 0 entsteht:
//
//   * die Blattfolge je Geschoss — Lageplan zuerst, danach je zugeordneter Wand
//     genau ein Wandblatt, beides in der Reihenfolge der Projektmappe;
//   * dass dabei ausschliesslich die KANONISCHEN Vollblattableitungen benutzt werden
//     ([D-6]/[N-1]): das erzeugte HTML ist byteweise das von `blattHtml()`, und die
//     Seitengeometrie ist das kanonische Papiermass (`BLATT`/`blattInnen`);
//   * dass ein verwaister Eintrag ([L-4]) benannt und uebersprungen wird;
//   * kollisionsfreie, verstaendliche Dateinamen;
//   * die ECHTE PDF-Struktur (Rumpf, xref mit richtigen Offsets, Seitenbaum,
//     MediaBox, Bildplatzierung, Lesezeichen in Seitenreihenfolge) — deterministisch,
//     mit einer eingesetzten Rasterhilfe statt eines Browsers.
//
// Checkout-autark: alle Waende kommen synthetisch aus dem Core, keine Fixture-Dateien,
// keine vertrauliche Geometrie, kein Netz.
//
// Aufruf:  node tests/module/test-zeichnungspdf.mjs

import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { standardEingaben } from "../../docs/shared/storage.js";
import * as MAPPE from "../../docs/shared/sembla-projektmappe.js";
import * as LP from "../../docs/shared/sembla-lageplan.js";
import * as Z from "../../docs/shared/sembla-zeichnung.js";
import * as PDF from "../../docs/shared/sembla-zeichnungspdf.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

// --- Pruefaufbau -----------------------------------------------------------
// Ein Projekt, zwei Gebaeude, vier Geschosse. Zwei davon heissen im SELBEN Gebaeude
// gleich („EG") — daran haengt die Kollisionsfreiheit der Dateinamen.

let m = MAPPE.leereMappe("Pruefprojekt", { gebaeude: "Haus A", geschoss: "EG", hoehe_mm: 2600 });
m = MAPPE.setzeKopfdaten(m, { bauherr: "Bauherrschaft Muster", plan_nr: "A-101", index: "b", gez: "TB" });
const gebA = m.gebaeude[0].id;
const gsA_EG = m.gebaeude[0].geschosse[0].id;
const zweitesGs = MAPPE.fuegeGeschossHinzu(m, gebA, "OG", 2400);
m = zweitesGs.mappe;
const gsA_OG = zweitesGs.id;
// Zweites „EG" IM SELBEN Gebaeude — daran haengt die Kollisionsfreiheit der Namen.
const viertesGs = MAPPE.fuegeGeschossHinzu(m, gebA, "EG", 2600);
m = viertesGs.mappe;
const gsA_EG2 = viertesGs.id;
const gebB = MAPPE.fuegeGebaeudeHinzu(m, "Haus B");
m = gebB.mappe;
const drittesGs = MAPPE.fuegeGeschossHinzu(m, gebB.id, "EG", 2600);
m = drittesGs.mappe;
const gsB_EG = drittesGs.id;

// Haus A · EG: zwei verortete Waende + ein verwaister Eintrag ([L-4]).
m = MAPPE.setzeWand(m, gsA_EG, { id: "w-a", name: "Wand A",
  lage: { start_mm: { x: 0, y: 1062.5 }, richtung: "x", laenge_grid: 16 } });
m = MAPPE.setzeWand(m, gsA_EG, { id: "w-b", name: "Wand B",
  lage: { start_mm: { x: 0, y: 4062.5 }, richtung: "x", laenge_grid: 24 } });
m = MAPPE.setzeWand(m, gsA_EG, { id: "w-weg", name: "Wand ohne Element", lage: null });
// Haus A · OG bleibt leer (Geschoss ohne Wand). Haus B · EG traegt eine Wand.
m = MAPPE.setzeWand(m, gsB_EG, { id: "w-c", name: "Wand C",
  lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 8 } });

const ELEMENTE = [
  { id: "w-a", name: "Wand A", wandelement: buildWall("Wand A", 2000, 2600, []) },
  { id: "w-b", name: "Wand B", wandelement: buildWall("Wand B", 3000, 2600,
      [new Opening(6, 12, 0, 10, "tuer")]) },
  { id: "w-c", name: "Wand C", wandelement: buildWall("Wand C", 1000, 2600, []) },
  // „w-weg" fehlt ABSICHTLICH: verwaister Eintrag ([L-4]).
];

const EINGABEN = standardEingaben();
EINGABEN.projekt.name = "Pruefprojekt";
EINGABEN.projekt.plan_nr = "A-101";
const leseEingaben = () => EINGABEN;

// --- 1) Blattfolge eines Geschosses ---------------------------------------

const egA = PDF.blaetterFuerGeschoss({ mappe: m, geschossId: gsA_EG, elemente: ELEMENTE, leseEingaben });
ok("Lageplan zuerst, danach je Wand genau ein Blatt",
  egA.seiten.length === 3 && egA.seiten[0].art === "lageplan"
  && egA.seiten[1].art === "wand" && egA.seiten[2].art === "wand");
ok("die Wandfolge ist die Reihenfolge der Projektmappe",
  /Wand A/.test(egA.seiten[1].titel) && /Wand B/.test(egA.seiten[2].titel));
ok("[L-4] der verwaiste Eintrag wird namentlich benannt und uebersprungen",
  egA.luecken.length === 1 && /Wand ohne Element/.test(egA.luecken[0])
  && /verwaister Eintrag/.test(egA.luecken[0]) && /L-4/.test(egA.luecken[0]));

const ogA = PDF.blaetterFuerGeschoss({ mappe: m, geschossId: gsA_OG, elemente: ELEMENTE, leseEingaben });
ok("ein Geschoss ohne Wand behaelt seinen Lageplan als einziges Blatt",
  ogA.seiten.length === 1 && ogA.seiten[0].art === "lageplan" && !ogA.luecken.length);
ok("ein unbekanntes Geschoss wird benannt statt geraten",
  (() => { try { PDF.blaetterFuerGeschoss({ mappe: m, geschossId: "gibtsnicht", elemente: ELEMENTE, leseEingaben }); return false; }
    catch (e) { return /Geschoss/.test(String(e.message)); } })());

// --- 2) Es ist die KANONISCHE Ableitung, nicht eine zweite ----------------
// Der Vergleich ist byteweise: waere hier eine eigene Darstellung entstanden, wichen
// die Zeichenketten ab. Genau das schliesst [D-6]/[N-1] aus.

const lpErwartet = LP.blattHtml(
  LP.lageplanDaten({ mappe: m, geschossId: gsA_EG, elemente: ELEMENTE }), LP.normOptionen({ format: "a3" }));
ok("das Lageplanblatt ist byteweise das von sembla-lageplan.js ([N-1])",
  egA.seiten[0].html === lpErwartet.html && egA.seiten[0].titel
    === LP.lageplanTitel(LP.lageplanDaten({ mappe: m, geschossId: gsA_EG, elemente: ELEMENTE }), lpErwartet.masstab));

const zOpt = Z.normOptionen(Z.optionenAusEingaben(EINGABEN));
const wErwartet = Z.blattHtml(ELEMENTE[0].wandelement, EINGABEN, zOpt);
ok("das Wandblatt ist byteweise das von sembla-zeichnung.js ([D-6])",
  egA.seiten[1].html === wErwartet.html);
ok("das vollstaendige Blatt reist mit — Zeichnung, Stueckliste, Legende, Schriftfeld",
  /class="zsheet/.test(egA.seiten[1].html) && /<svg/.test(egA.seiten[1].html)
  && /Baustellenstückliste/.test(egA.seiten[1].html) && /Darstellung/.test(egA.seiten[1].html)
  && /ztitel|ztb-row|Schriftfeld|Plan/.test(egA.seiten[1].html));
ok("[D-7] das Wandblatt folgt der gespeicherten Formatwahl, nicht einer Vorgabe von aussen",
  egA.seiten[1].format === zOpt.format);
ok("das mitgereichte CSS ist das der Ausgabemodule (kein eigenes Aussehen)",
  egA.seiten[1].css.startsWith(Z.ZEICHNUNG_CSS) && egA.seiten[1].css.includes(Z.druckCss("a3"))
  && egA.seiten[0].css.startsWith(LP.LAGEPLAN_CSS));

// --- 3) Blattgeometrie: kanonisches Papiermass, keine eigene Rechnung -----

ok("Papiermass, Rand und Blattmass kommen aus BLATT/blattInnen (A3)",
  egA.seiten.every((s) => s.papier_mm.w === Z.BLATT[s.format].papier_mm.w
    && s.papier_mm.h === Z.BLATT[s.format].papier_mm.h
    && s.rand_mm === Z.BLATT[s.format].rand_mm
    && s.blatt_mm.w === Z.blattInnen(s.format).w && s.blatt_mm.h === Z.blattInnen(s.format).h));
ok("A3 ist 420 × 297 mm Papier mit 400 × 277 mm Blatt",
  egA.seiten[0].papier_mm.w === 420 && egA.seiten[0].papier_mm.h === 297
  && egA.seiten[0].blatt_mm.w === 400 && egA.seiten[0].blatt_mm.h === 277);

// --- 4) Dateinamen: verstaendlich und kollisionsfrei ----------------------

const plan = PDF.blaetterProjekt({ mappe: m, elemente: ELEMENTE, leseEingaben });
ok("je Geschoss genau eine Datei, in der Reihenfolge der Mappe",
  plan.geschosse.length === 4
  && plan.geschosse.map((g) => g.seiten.length).join(",") === "3,1,1,2");
ok("der eindeutige Geschossname bleibt sprechend",
  plan.geschosse[1].datei === "Haus_A_OG.pdf");
ok("zwei gleichnamige Geschosse bekommen BEIDE ihre Kennung angehaengt",
  plan.geschosse[0].datei === `Haus_A_EG__${PDF.sicherStamm(gsA_EG)}.pdf`
  && plan.geschosse[2].datei === `Haus_A_EG__${PDF.sicherStamm(gsA_EG2)}.pdf`
  && plan.geschosse[0].datei !== plan.geschosse[2].datei);
ok("das gleichnamige Geschoss in einem ANDEREN Gebaeude bleibt sprechend",
  plan.geschosse[3].datei === "Haus_B_EG.pdf");
ok("Umlaute werden uebertragen statt getilgt",
  PDF.sicherStamm("Gebäude Süd/Groß") === "Gebaeude_Sued_Gross");
ok("der ZIP-Name nennt das Projekt", plan.zipName === "SEMBLA_Zeichnungen_Pruefprojekt");
ok("die Luecke des verwaisten Eintrags steht im Projektergebnis",
  plan.luecken.length === 1 && /Wand ohne Element/.test(plan.luecken[0])
  && /Haus A/.test(plan.luecken[0]));

// --- 5) Echte PDF-Struktur (deterministisch, ohne Browser) ---------------
// Statt zu rastern liefert die eingesetzte Rasterhilfe ein festes Miniatur-JPEG. Damit
// entsteht eine ECHTE PDF: Seitenzahl, Seitengroesse, Reihenfolge und Syntax sind der
// Produktcode, nur die Bildpunkte sind Platzhalter.

const MINI_JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x01, 0xFF, 0xD9]);
const rendere = async (seite) => ({ daten: MINI_JPEG, typ: "jpeg", breite_px: 40, hoehe_px: 28 });
const dateien = await PDF.pdfDateien(plan, { rendere });
const text = (d) => Buffer.from(d).toString("latin1");

ok("genau eine PDF je Geschoss, keine weitere Datei",
  dateien.length === 4 && dateien.every((f) => /\.pdf$/.test(f.name))
  && dateien.map((f) => f.name).join(",") === plan.geschosse.map((g) => g.datei).join(","));
ok("jede Datei ist eine PDF mit vollstaendigem Rumpf",
  dateien.every((f) => f.data instanceof Uint8Array && text(f.data).startsWith("%PDF-1.")
    && /\nxref\n/.test(text(f.data)) && /\ntrailer\n/.test(text(f.data))
    && text(f.data).trimEnd().endsWith("%%EOF")));

/** Die xref-Tabelle einer PDF gegen die tatsaechlichen Objektpositionen pruefen. */
function xrefStimmt(bytes) {
  const t = text(bytes);
  const start = +(/startxref\s+(\d+)/.exec(t) || [])[1];
  if (!Number.isFinite(start) || t.slice(start, start + 4) !== "xref") return false;
  const kopf = /^xref\n0 (\d+)\n/.exec(t.slice(start));
  if (!kopf) return false;
  const anzahl = +kopf[1];
  const tabelle = t.slice(start + kopf[0].length);
  for (let i = 1; i < anzahl; i++) {
    const zeile = tabelle.slice(i * 20, (i + 1) * 20);   // Eintrag 0 ist der freie Kopf
    if (!/^\d{10} \d{5} n \n$/.test(zeile)) return false;
    const off = +zeile.slice(0, 10);
    if (!t.startsWith(`${i} 0 obj`, off)) return false;    // Offset zeigt auf sein Objekt
  }
  return /\/Size (\d+)/.exec(t)[1] === String(anzahl);
}
ok("die xref-Tabelle zeigt in jeder Datei auf die echten Objektpositionen",
  dateien.every((f) => xrefStimmt(f.data)));

const egPdf = dateien[0].data, ogPdf = dateien[1].data;   // Haus A · EG bzw. Haus A · OG
ok("der Seitenbaum nennt genau die Blattzahl des Geschosses",
  /\/Type \/Pages \/Kids \[[^\]]+\] \/Count 3 /.test(text(egPdf))
  && /\/Type \/Pages \/Kids \[[^\]]+\] \/Count 1 /.test(text(ogPdf)));
ok("jede Seite traegt die A3-MediaBox in Punkten (420 × 297 mm)",
  (text(egPdf).match(/\/MediaBox \[0 0 1190\.551 841\.89\]/g) || []).length === 3);
ok("jede Seite platziert ihr Blattbild am Papierrand in Blattgroesse",
  (text(egPdf).match(/1133\.858 0 0 785\.197 28\.346 28\.346 cm/g) || []).length === 3);
ok("jede Seite hat genau ein Bild, und es ist als JPEG eingebettet",
  (text(egPdf).match(/\/Subtype \/Image/g) || []).length === 3
  && (text(egPdf).match(/\/Filter \/DCTDecode/g) || []).length === 3
  && !/\/Font/.test(text(egPdf)));

/** Die Lesezeichen-Titel in Dokumentreihenfolge (UTF-16BE-Hexstrings). */
const titel = (bytes) => [...text(bytes).matchAll(/\/Title <FEFF([0-9A-F]+)>/g)]
  .map((mm) => mm[1].match(/..../g).map((h) => String.fromCharCode(parseInt(h, 16))).join(""));
const tEG = titel(egPdf);
ok("die Seitenreihenfolge steht als Lesezeichen im Dokument: Lageplan, dann die Waende",
  tEG.length === 3 && /Lageplan/.test(tEG[0]) && /Wand A/.test(tEG[1]) && /Wand B/.test(tEG[2]));
ok("die Lesezeichen tragen die Blatt-Titel der Ausgabemodule",
  tEG[0] === plan.geschosse[0].seiten[0].titel && tEG[1] === plan.geschosse[0].seiten[1].titel);
ok("Umlaute und Anfuehrungszeichen ueberstehen den Titel unbeschadet",
  tEG.every((x) => !/�/.test(x)) && /[„“]|Wand/.test(tEG[1]));
ok("die Lesezeichen sind in Seitenreihenfolge verkettet",
  /\/Outlines/.test(text(egPdf)) && (text(egPdf).match(/\/Next \d+ 0 R/g) || []).length === 2
  && (text(egPdf).match(/\/Prev \d+ 0 R/g) || []).length === 2);

// --- 6) Determinismus ------------------------------------------------------

const nochmal = await PDF.pdfDateien(
  PDF.blaetterProjekt({ mappe: m, elemente: ELEMENTE, leseEingaben }), { rendere });
ok("dieselben Seiten ergeben byteidentische PDFs (kein Datum, keine /ID, kein Zufall)",
  nochmal.length === dateien.length
  && nochmal.every((f, i) => f.name === dateien[i].name
    && Buffer.compare(Buffer.from(f.data), Buffer.from(dateien[i].data)) === 0));

// --- 7) Fehlerpfade: benennen statt behaupten -----------------------------

ok("ohne Seite gibt es keine PDF, sondern eine Meldung",
  (() => { try { PDF.pdfBytes([]); return false; } catch (e) { return /Seite/.test(String(e.message)); } })());
ok("ein nicht darstellbares Blatt bricht den Lauf mit Blattnamen ab",
  await (async () => {
    try {
      await PDF.pdfDateien(plan, { rendere: async (s) => {
        if (s.art === "wand") throw new Error("Rasterhilfe aus");
        return { daten: MINI_JPEG, typ: "jpeg", breite_px: 40, hoehe_px: 28 };
      } });
      return false;
    } catch (e) {
      return /Wand A/.test(String(e.message)) && /nichts heruntergeladen/.test(String(e.message));
    }
  })());
ok("ein Bild, das kein JPEG ist, wird benannt abgewiesen statt eingebettet",
  (() => {
    try {
      PDF.pdfBytes([{ titel: "X", papier_mm: { w: 420, h: 297 }, rand_mm: 10,
        blatt_mm: { w: 400, h: 277 },
        bild: { daten: new Uint8Array([1, 2, 3]), typ: "jpeg", breite_px: 4, hoehe_px: 4 } }]);
      return false;
    } catch (e) { return /kein JPEG/.test(String(e.message)); }
  })());

// --- 8) PNG wird direkt eingebettet (Predictor 15 = PNG-Zeilenfilter) -----
// Ein 2 × 2 grosses RGB-PNG, von Hand gebaut: die IDAT-Daten wandern unveraendert in
// den Bildstrom. Waere hier entpackt und neu gepackt worden, staende ein anderer
// Bytestrom in der Datei.

function crc32(buf) {
  let c, tab = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); tab[n] = c >>> 0; }
  let x = 0xFFFFFFFF;
  for (const b of buf) x = tab[(x ^ b) & 0xFF] ^ (x >>> 8);
  return (x ^ 0xFFFFFFFF) >>> 0;
}
function chunk(typ, daten) {
  const kopf = new Uint8Array(8);
  new DataView(kopf.buffer).setUint32(0, daten.length);
  kopf.set([...typ].map((c) => c.charCodeAt(0)), 4);
  const pruef = new Uint8Array(4);
  const roh = new Uint8Array(4 + daten.length);
  roh.set(kopf.subarray(4, 8)); roh.set(daten, 4);
  new DataView(pruef.buffer).setUint32(0, crc32(roh));
  const out = new Uint8Array(kopf.length + daten.length + 4);
  out.set(kopf); out.set(daten, kopf.length); out.set(pruef, kopf.length + daten.length);
  return out;
}
const { deflateSync } = await import("node:zlib");
const zeilen = new Uint8Array([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 255]);
const idat = new Uint8Array(deflateSync(Buffer.from(zeilen)));
const ihdr = new Uint8Array(13);
const dvI = new DataView(ihdr.buffer);
dvI.setUint32(0, 2); dvI.setUint32(4, 2); ihdr[8] = 8; ihdr[9] = 2;
const teile = [new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
const pngBytes = new Uint8Array(teile.reduce((s, t) => s + t.length, 0));
{ let o = 0; for (const t of teile) { pngBytes.set(t, o); o += t.length; } }

const pngPdf = PDF.pdfBytes([{ titel: "PNG-Seite", papier_mm: { w: 297, h: 210 }, rand_mm: 8,
  blatt_mm: { w: 281, h: 194 },
  bild: { daten: pngBytes, typ: "png", breite_px: 2, hoehe_px: 2 } }]);
ok("ein RGB-PNG wird ohne Entpacken als FlateDecode mit PNG-Praediktor eingebettet",
  /\/Filter \/FlateDecode \/DecodeParms << \/Predictor 15 \/Colors 3 \/BitsPerComponent 8 \/Columns 2 >>/
    .test(text(pngPdf))
  && Buffer.from(pngPdf).includes(Buffer.from(idat)));
ok("A4 quer ergibt die A4-MediaBox", /\/MediaBox \[0 0 841\.89 595\.276\]/.test(text(pngPdf)));
ok("ein PNG mit Alphakanal wird benannt abgewiesen statt halb gedeutet",
  (() => {
    const alpha = new Uint8Array(pngBytes);
    // IHDR-Daten beginnen bei Byte 16 (8 Signatur + 4 Laenge + 4 Typ); der Farbtyp
    // steht dort an Position 9, direkt hinter Breite, Hoehe und Farbtiefe.
    alpha[16 + 9] = 6;
    try {
      PDF.pdfBytes([{ titel: "X", papier_mm: { w: 297, h: 210 }, rand_mm: 8, blatt_mm: { w: 281, h: 194 },
        bild: { daten: alpha, typ: "png", breite_px: 2, hoehe_px: 2 } }]);
      return false;
    } catch (e) { return /nicht direkt einbettbar/.test(String(e.message)); }
  })());

// --- Bericht ---------------------------------------------------------------
let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
