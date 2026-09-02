// Test Modul 0 — vollstaendiges Projektarchiv ([L-13]) und der ZIP-Leser.
//
// Geprueft werden die REINEN Bausteine: docs/shared/sembla-archiv.js (Pfade,
// Exportplan, Lesen/Pruefen) und docs/shared/zip.js (schreiben UND lesen, STORE
// wie Deflate). Der Roundtrip ueber die echte Modul-0-Oberflaeche steht in
// tests/module/smoke_start.mjs.
//
// Schwerpunkt: Es wird NICHTS geraten. Fehlende, doppelte, ungueltige,
// traversierende und ueberzaehlige Eintraege muessen benannt werden.
// Alle Daten sind synthetisch (Minimalbilder aus wenigen Bytes).

import { readFileSync } from "node:fs";
import * as ARCHIV from "../../docs/shared/sembla-archiv.js";
import * as MAPPE from "../../docs/shared/sembla-projektmappe.js";
import { zipSync, entpacke } from "../../docs/shared/zip.js";
import { zipDeflate } from "./hilfe-zip-deflate.mjs";

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

// --- synthetische Testdaten ------------------------------------------------

/** Minimales, aber signaturechtes PNG (nur der Kopf zaehlt fuer die Pruefung). */
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5, 6]);
/** Minimales WebP: "RIFF" + Groesse + "WEBP". */
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9, 9]);
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 0, 0]);

function wandDatei(name) {
  return {
    format: "SEMBLA-Projekt", version: 2, name,
    wandelement: { name, length_mm: 3000, height_mm: 2400, courses: [{ lage: 0 }] },
    eingaben: { planung: { produkte: { quelle: null, rollen: {} } } },
  };
}

/** Eine Mappe mit zwei Geschossen, zwei Waenden, Lage, Bemassung und einem Plan. */
function baueMappe() {
  let m = MAPPE.leereMappe("Archivprobe", { geschoss: "EG", hoehe_mm: 2400 });
  const geb = m.gebaeude[0].id;
  const eg = m.gebaeude[0].geschosse[0].id;
  const r = MAPPE.fuegeGeschossHinzu(m, geb, "OG", 2400);
  m = r.mappe;
  const og = r.id;
  m = MAPPE.setzeWand(m, eg, {
    id: "wnd-1", name: "EG-W01",
    lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 24 },
  });
  m = MAPPE.setzeWand(m, og, { id: "wnd-2", name: "OG-W01", lage: null });
  m = MAPPE.setzeBemassung(m, eg, {
    id: "bm-1", achse: "x", von: null, bis: { wand: "wnd-1", bezug: "min" }, mass_mm: 0,
  });
  m = MAPPE.setzePlan(m, eg, { datei: "eg.png", typ: "image/png", breite_px: 800, hoehe_px: 600, mm_je_pixel: 12.5 });
  m = MAPPE.setzeKopfdaten(m, { bauherr: "Muster GmbH", phase: "LP5" });
  m = MAPPE.setzeKatalogRef(m, "kat-probe");
  return { mappe: MAPPE.normMappe(m), eg, og };
}

const { mappe, eg } = baueMappe();

// --- Pfade und Namen -------------------------------------------------------

ok("Wandpfad traegt die stabile id (Name nur kosmetisch)",
  ARCHIV.wandPfad({ id: "wnd-1", name: "EG W01/A" }) === "waende/EG_W01_A__wnd-1.json");
ok("Planendung folgt dem MIME-Typ", ARCHIV.planEndung({ typ: "image/webp" }) === ".webp");
ok("Planendung faellt auf die Dateiendung zurueck", ARCHIV.planEndung({ datei: "grundriss.PNG" }) === ".png");
ok("Unbekannter Typ erfindet keine Endung", ARCHIV.planEndung({ datei: "plan.xyz" }) === ".bin");
ok("Planpfad nutzt die Geschoss-Kennung", ARCHIV.planPfad("gs-7", { typ: "image/png" }) === "plaene/gs-7.png");

ok("Bildtyp aus Bytes: PNG", ARCHIV.bildTyp(PNG) === "image/png");
ok("Bildtyp aus Bytes: WebP", ARCHIV.bildTyp(WEBP) === "image/webp");
ok("Bildtyp aus Bytes: JPEG", ARCHIV.bildTyp(JPEG) === "image/jpeg");
ok("Kein Bild wird nicht umgedeutet", ARCHIV.bildTyp(enc("{\"kein\":\"bild\"}")) === null);

// --- Exportplan ------------------------------------------------------------

const plan = ARCHIV.exportPlan(mappe, ["wnd-1", "wnd-2"], [eg]);
ok("Exportplan nennt beide Waende", plan.waende.length === 2 && !plan.fehlendeWaende.length);
ok("Exportplan nennt das vorhandene Planbild", plan.plaene.length === 1 && plan.plaene[0].geschossId === eg);
ok("Exportplan meldet kein fehlendes Bild", plan.fehlendeBilder.length === 0);

const luecke = ARCHIV.exportPlan(mappe, ["wnd-1"], []);
ok("Fehlendes Wandelement wird benannt, nicht uebergangen",
  luecke.fehlendeWaende.length === 1 && luecke.fehlendeWaende[0].id === "wnd-2");
ok("Fehlendes Planbild wird benannt", luecke.fehlendeBilder.length === 1 && luecke.fehlendeBilder[0].geschossId === eg);

const exportSicht = ARCHIV.mappeFuerArchiv(mappe, plan.waende);
const w1 = MAPPE.findeWand(exportSicht, "wnd-1").wand;
ok("Exportsicht setzt wand.datei auf den Archivpfad", w1.datei === plan.waende.find(w => w.id === "wnd-1").pfad);
ok("Der gespeicherte Stand bleibt unberuehrt", MAPPE.findeWand(mappe, "wnd-1").wand.datei === null);
const halbeSicht = ARCHIV.mappeFuerArchiv(mappe, luecke.waende);
ok("Nicht mitgeliefertes bleibt ehrlich ohne datei", MAPPE.findeWand(halbeSicht, "wnd-2").wand.datei === null);

const dateien = ARCHIV.archivDateien(mappe, plan,
  (id) => wandDatei(id === "wnd-1" ? "EG-W01" : "OG-W01"),
  () => PNG);
ok("Archiv enthaelt projekt.json + 2 Waende + 1 Plan", dateien.length === 4);
ok("Erste Datei ist projekt.json", dateien[0].name === ARCHIV.DATEI_MAPPE);
ok("Kein Katalog im Archiv ([L-12])", !dateien.some(d => /katalog/i.test(d.name)));
ok("Katalogreferenz reist mit", JSON.parse(dateien[0].data).katalog === "kat-probe");
ok("Kopfdaten reisen mit ([L-11])", JSON.parse(dateien[0].data).projekt.kopfdaten.bauherr === "Muster GmbH");
ok("Bemassungen reisen mit ([K-10])",
  JSON.parse(dateien[0].data).gebaeude[0].geschosse[0].bemassungen.length === 1);

// --- ZIP schreiben und lesen ----------------------------------------------

const wurzel = ARCHIV.archivName(mappe);
ok("Archivname ist ableitbar", wurzel === "SEMBLA_Projekt_Archivprobe");
const mitWurzel = dateien.map(d => ({ name: wurzel + "/" + d.name, data: d.data }));
const bytes = zipSync(mitWurzel);
const gelesenRoh = await entpacke(bytes);
ok("ZIP-Roundtrip liefert dieselbe Zahl Eintraege", gelesenRoh.length === mitWurzel.length);
ok("ZIP-Roundtrip erhaelt Textinhalte", dec(gelesenRoh[0].data) === mitWurzel[0].data);
const bildEintrag = gelesenRoh.find(e => e.name.endsWith(".png"));
ok("ZIP-Roundtrip erhaelt Bildbytes bitgenau",
  bildEintrag && bildEintrag.data.length === PNG.length && bildEintrag.data.every((b, i) => b === PNG[i]));

// Deflate: gepackt mit dem nativen CompressionStream (Test-Hilfe), gelesen von entpacke.
const deflateZip = await zipDeflate(mitWurzel);
ok("Deflate-ZIP ist kleiner als STORE (wirklich komprimiert)", deflateZip.length < bytes.length);
const gelesenDeflate = await entpacke(deflateZip);
ok("Deflate-ZIP wird gelesen", gelesenDeflate.length === mitWurzel.length);
ok("Deflate liefert denselben Inhalt", dec(gelesenDeflate[0].data) === mitWurzel[0].data);

// Beschaedigtes ZIP: ein gekipptes Byte in den DATEN muss an der Pruefsumme scheitern.
const kaputt = bytes.slice();
const datenStart = 30 + enc(mitWurzel[0].name).length;
kaputt[datenStart + 5] = kaputt[datenStart + 5] ^ 0xFF;
let crcFehler = "";
try { await entpacke(kaputt); } catch (e) { crcFehler = e.message; }
ok("Beschaedigtes ZIP wird an der Pruefsumme abgewiesen", /Prüfsumme CRC32/.test(crcFehler));

// Und ein manipulierter Dateiname im lokalen Header ebenfalls.
const umbenannt = bytes.slice();
umbenannt[35] = umbenannt[35] === 0x41 ? 0x42 : 0x41;
let nameFehler = "";
try { await entpacke(umbenannt); } catch (e) { nameFehler = e.message; }
ok("Widerspruch lokaler Name ↔ Zentralverzeichnis wird abgewiesen", /lokalen Header anders/.test(nameFehler));

let keinZip = "";
try { await entpacke(enc("das ist kein zip")); } catch (e) { keinZip = e.message; }
ok("Fremde Datei ist kein ZIP", /kein ZIP/i.test(keinZip));

// --- Import lesen und pruefen ---------------------------------------------

const eintraege = gelesenRoh;   // genau das, was der Produktcode aus dem ZIP bekommt
const gelesen = ARCHIV.leseArchiv(eintraege);
ok("Fehlerfreies Archiv wird ohne Fehler gelesen", gelesen.fehler.length === 0);
ok("Wurzelordner wird abgeschnitten", !!gelesen.mappe && gelesen.mappe.projekt.name === "Archivprobe");
ok("Beide Waende werden zugeordnet", gelesen.waende.length === 2);
ok("Zuordnung ueber die stabile id", gelesen.waende.map(w => w.id).sort().join() === "wnd-1,wnd-2");
ok("Planbild wird gelesen", gelesen.bilder.length === 1 && gelesen.bilder[0].geschossId === eg);
ok("Planbildtyp wird geprueft", gelesen.bilder[0].typ === "image/png");
ok("Nichts ueberzaehlig", gelesen.ueberzaehlig.length === 0);
ok("Lage bleibt erhalten", MAPPE.findeWand(gelesen.mappe, "wnd-1").wand.lage.laenge_grid === 24);
ok("Bemassung bleibt erhalten", MAPPE.bemassungen(gelesen.mappe, eg).length === 1);
ok("Bericht nennt Zahl der Waende und Bilder",
  ARCHIV.berichtZeilen(gelesen)[0].includes("2 Wanddatei(en)")
  && ARCHIV.berichtZeilen(gelesen)[0].includes("1 Planbild(er)"));

// Ohne Wurzelordner (Ordnerimport von innen) muss es genauso gehen.
const flach = ARCHIV.leseArchiv(dateien.map(d => ({ name: d.name, data: d.data })));
ok("Archiv ohne Wurzelordner wird gelesen", flach.fehler.length === 0 && flach.waende.length === 2);

// Windows-Trennzeichen sind zulaessig (manche Packer schreiben sie).
const backslash = ARCHIV.leseArchiv(dateien.map(d => ({ name: d.name.replace(/\//g, "\\"), data: d.data })));
ok("Backslash-Pfade werden normalisiert", backslash.fehler.length === 0 && backslash.waende.length === 2);

// --- Fehlerfaelle: jeder muss BENANNT werden ------------------------------

const ohneMappe = ARCHIV.leseArchiv(eintraege.filter(e => !e.name.endsWith(ARCHIV.DATEI_MAPPE)));
ok("Fehlende projekt.json wird benannt", ohneMappe.fehler.some(f => /kein SEMBLA-Projektarchiv/.test(f)));

const zweiMappen = ARCHIV.leseArchiv([...eintraege, { name: "zweitprojekt/projekt.json", data: eintraege[0].data }]);
ok("Zwei projekt.json ⇒ Abbruch, kein Raten", zweiMappen.fehler.some(f => /genau ein Projekt/.test(f)));

const ohneWand = ARCHIV.leseArchiv(eintraege.filter(e => !e.name.includes("wnd-1")));
ok("Fehlende Wanddatei wird benannt", ohneWand.fehler.some(f => /Wanddatei .* fehlt/.test(f)));

const ohneBild = ARCHIV.leseArchiv(eintraege.filter(e => !e.name.endsWith(".png")));
ok("Fehlendes Planbild wird benannt", ohneBild.fehler.some(f => /Planbild von Geschoss/.test(f)));

const zweiBilder = ARCHIV.leseArchiv([...eintraege, { name: `${wurzel}/plaene/${eg}.webp`, data: WEBP }]);
ok("Zwei Bilder je Geschoss ⇒ benannt, nicht geraten", zweiBilder.fehler.some(f => /mehrere Planbilder/.test(f)));

const falschesBild = ARCHIV.leseArchiv(eintraege.map(e =>
  e.name.endsWith(".png") ? { name: e.name, data: enc("kein bild, nur text") } : e));
ok("Ungueltige Bildbytes werden benannt", falschesBild.fehler.some(f => /kein zulässiges Planbild/.test(f)));

const typWiderspruch = ARCHIV.leseArchiv(eintraege.map(e =>
  e.name.endsWith(".png") ? { name: e.name, data: WEBP } : e));
ok("Typwiderspruch Bild ↔ Mappe wird benannt", typWiderspruch.fehler.some(f => /die Mappe nennt aber/.test(f)));

const kaputteWand = ARCHIV.leseArchiv(eintraege.map(e =>
  e.name.includes("wnd-2") ? { name: e.name, data: enc('{"format":"SEMBLA-Projekt","version":2}') } : e));
ok("Ungueltige Wanddatei wird benannt", kaputteWand.fehler.some(f => /unbrauchbar/.test(f)));

const alteWand = ARCHIV.leseArchiv(eintraege.map(e =>
  e.name.includes("wnd-2") ? { name: e.name, data: enc(JSON.stringify({ ...wandDatei("x"), version: 1 })) } : e));
ok("Falsche Formatversion der Wanddatei wird benannt", alteWand.fehler.some(f => /Formatversion 2 erwartet/.test(f)));

const traversal = ARCHIV.leseArchiv([...eintraege, { name: "../boese.json", data: enc("{}") }]);
ok("Traversal (..) wird abgewiesen", traversal.fehler.some(f => /verlässt das Archiv/.test(f)));

const absolut = ARCHIV.leseArchiv([...eintraege, { name: "/etc/passwd", data: enc("x") }]);
ok("Absoluter Pfad wird abgewiesen", absolut.fehler.some(f => /Absoluter Pfad/.test(f)));

const laufwerk = ARCHIV.leseArchiv([...eintraege, { name: "C:/temp/x.json", data: enc("x") }]);
ok("Laufwerkspfad wird abgewiesen", laufwerk.fehler.some(f => /Laufwerksangabe/.test(f)));

const doppelt = ARCHIV.leseArchiv([...eintraege, eintraege[1]]);
ok("Doppelter Pfad wird abgewiesen", doppelt.fehler.some(f => /mehrfach vor/.test(f)));

const extra = ARCHIV.leseArchiv([...eintraege, { name: `${wurzel}/notizen.txt`, data: enc("hallo") }]);
ok("Ueberzaehlige Datei wird gemeldet (kein Fehler)",
  extra.fehler.length === 0 && extra.ueberzaehlig.length === 1 && extra.ueberzaehlig[0] === "notizen.txt");
ok("Bericht nennt die ueberzaehlige Datei", ARCHIV.berichtZeilen(extra).some(z => /notizen\.txt/.test(z)));

const muell = ARCHIV.leseArchiv([...eintraege, { name: `${wurzel}/__MACOSX/._projekt.json`, data: enc("x") },
  { name: `${wurzel}/.DS_Store`, data: enc("x") }]);
ok("Packer-Beiwerk stoert nicht", muell.fehler.length === 0 && muell.ueberzaehlig.length === 0);

// Eine Wand ohne `datei` ist ein verwaister Eintrag — Hinweis, kein Fehler ([L-4]).
const ohneRef = ARCHIV.leseArchiv([
  { name: ARCHIV.DATEI_MAPPE, data: JSON.stringify(ARCHIV.mappeFuerArchiv(mappe, luecke.waende)) },
  ...dateien.filter(d => d.name.includes("wnd-1")),
  ...dateien.filter(d => d.name.endsWith(".png")),
]);
ok("Wand ohne Dateireferenz bleibt verwaist (Hinweis, kein Fehler)",
  ohneRef.fehler.length === 0 && ohneRef.waende.length === 1
  && ohneRef.hinweise.some(h => /verwaist/.test(h)));

// Kein Dateinamen-Fallback: die Datei liegt bei, aber die Mappe verweist woanders hin.
const verbogen = JSON.parse(JSON.stringify(ARCHIV.mappeFuerArchiv(mappe, plan.waende)));
verbogen.gebaeude[0].geschosse[0].waende[0].datei = "waende/gibtesnicht.json";
const keinRaten = ARCHIV.leseArchiv([
  { name: ARCHIV.DATEI_MAPPE, data: JSON.stringify(verbogen) },
  ...dateien.slice(1),
]);
ok("Kein Raten aus dem Dateinamen — die Referenz entscheidet",
  keinRaten.fehler.some(f => /gibtesnicht\.json.* fehlt/.test(f))
  && keinRaten.ueberzaehlig.some(p => p.includes("wnd-1")));

// Verwechselte Formate landen nicht im Archivimport.
const katalogDatei = ARCHIV.leseArchiv([{ name: ARCHIV.DATEI_MAPPE, data: '{"format":"SEMBLA-Bauteilkatalog","version":1,"produkte":[]}' }]);
ok("Bauteilkatalog wird als solcher benannt", katalogDatei.fehler.some(f => /Bauteilkatalog/.test(f)));
const wandAlsMappe = ARCHIV.leseArchiv([{ name: ARCHIV.DATEI_MAPPE, data: JSON.stringify(wandDatei("x")) }]);
ok("Einzelne Wanddatei wird als solche benannt", wandAlsMappe.fehler.some(f => /einzelne Wanddatei/.test(f)));

// --- [#82] Verzahnungsbereiche ueberstehen den Archiv-Roundtrip ------------
// Das Archiv nutzt die echten Wanddateien; die interlocks muessen wertgleich erhalten bleiben.
import { buildWall } from "../../docs/shared/sembla-core.js";

// Wandelement mit Verzahnung ueber den echten Rechenkern erzeugen
const ilWandElement = buildWall("Verzahnt", 2000, 2600, [], null, null, [],
  [{ g0: 0, g1: 2, start_parity: 0 }, { g0: 6, g1: 8, start_parity: 1 }]);
ok("[#82] buildWall erzeugt interlocks-Feld fuer Archivtest",
  Array.isArray(ilWandElement.interlocks) && ilWandElement.interlocks.length === 2);

// Wanddatei mit Verzahnung fuer das Archiv
function wandDateiMitVerzahnung() {
  return {
    format: "SEMBLA-Projekt", version: 2, name: "Verzahnt",
    wandelement: ilWandElement,
    eingaben: { planung: { produkte: { quelle: null, rollen: {} } } },
  };
}

// Archiv mit verzahnter Wand bauen
let ilMappe0 = MAPPE.leereMappe("Archiv mit Verzahnung", { geschoss: "EG", hoehe_mm: 2400 });
const ilGsId = MAPPE.alleGeschosse(ilMappe0)[0].geschoss.id;
const ilMappeNorm = MAPPE.setzeWand(ilMappe0, ilGsId, { id: "wnd-il", name: "Verzahnt", lage: null });
const ilPlan = ARCHIV.exportPlan(ilMappeNorm, ["wnd-il"], []);
const ilDateien = ARCHIV.archivDateien(ilMappeNorm, ilPlan, () => wandDateiMitVerzahnung(), () => null);

ok("[#82] Archiv enthaelt die Verzahnungswand", ilDateien.length === 2); // projekt.json + 1 Wand

// Wanddatei im Archiv pruefen
const ilWandDateiJson = ilDateien.find(d => d.name.includes("wnd-il"));
const ilWandDateiObj = JSON.parse(ilWandDateiJson.data);
ok("[#82] Archiv-Wanddatei traegt die Verzahnungsbereiche",
  ilWandDateiObj.wandelement.interlocks.length === 2);
ok("[#82] Archiv-Wanddatei traegt Grenzen und Startparitaeten",
  ilWandDateiObj.wandelement.interlocks[0].g0 === 0
  && ilWandDateiObj.wandelement.interlocks[0].g1 === 2
  && ilWandDateiObj.wandelement.interlocks[0].start_parity === 0
  && ilWandDateiObj.wandelement.interlocks[1].g0 === 6
  && ilWandDateiObj.wandelement.interlocks[1].g1 === 8
  && ilWandDateiObj.wandelement.interlocks[1].start_parity === 1);

// ZIP bauen und lesen (vollstaendiger Roundtrip)
const ilWurzel = ARCHIV.archivName(ilMappeNorm);
const ilMitWurzel = ilDateien.map(d => ({ name: ilWurzel + "/" + d.name, data: d.data }));
const ilBytes = zipSync(ilMitWurzel);
const ilGelesenRoh = await entpacke(ilBytes);
const ilGelesen = ARCHIV.leseArchiv(ilGelesenRoh);

ok("[#82] Archiv-Roundtrip ohne Fehler", ilGelesen.fehler.length === 0);
ok("[#82] Archiv-Roundtrip erhaelt die Wand", ilGelesen.waende.length === 1);
ok("[#82] Archiv-Roundtrip erhaelt die Verzahnungsbereiche",
  ilGelesen.waende[0].wandelement.interlocks.length === 2);
ok("[#82] Archiv-Roundtrip erhaelt Grenzen und Startparitaeten wertgleich",
  ilGelesen.waende[0].wandelement.interlocks[0].g0 === 0
  && ilGelesen.waende[0].wandelement.interlocks[0].g1 === 2
  && ilGelesen.waende[0].wandelement.interlocks[0].start_parity === 0
  && ilGelesen.waende[0].wandelement.interlocks[1].g0 === 6
  && ilGelesen.waende[0].wandelement.interlocks[1].g1 === 8
  && ilGelesen.waende[0].wandelement.interlocks[1].start_parity === 1);

// Altbestand: Wanddatei OHNE interlocks-Feld laedt meldungsfrei
const altIlDatei = {
  format: "SEMBLA-Projekt", version: 2, name: "Altwand",
  wandelement: (() => { const w = buildWall("Altwand", 2000, 2600, []); delete w.interlocks; return w; })(),
  eingaben: {},
};
const altIlEintraege = [
  { name: ARCHIV.DATEI_MAPPE, data: JSON.stringify(ARCHIV.mappeFuerArchiv(ilMappeNorm, [{ id: "wnd-il", pfad: "waende/Altwand__wnd-il.json" }])) },
  { name: "waende/Altwand__wnd-il.json", data: JSON.stringify(altIlDatei) },
];
const altIlGelesen = ARCHIV.leseArchiv(altIlEintraege);
ok("[#82] Altbestand ohne interlocks-Feld laedt ohne Fehler",
  altIlGelesen.fehler.length === 0 && altIlGelesen.waende.length === 1);
ok("[#82] Altbestand erfindet keine Verzahnungsbereiche",
  !altIlGelesen.waende[0].wandelement.interlocks
  || altIlGelesen.waende[0].wandelement.interlocks.length === 0);

// --- [#83] Die Verzahnungsbeziehung uebersteht Archiv und Duplizieren ------
//
// #82 hat belegt, dass die FELDER am Wandelement (`interlocks`) den Roundtrip
// ueberstehen (s. o.). Offen war der Nachweis fuer die BEZIEHUNG zwischen zwei
// Waenden: dass also nach Export und Import derselben Stelle weiterhin eine
// zulaessige Verzahnung statt einer Kollision bescheinigt wird ([K-13.1]).
//
// Der Punkt der Regel ist, dass es diese Beziehung als Datum GAR NICHT GIBT: sie
// wird bei jeder Pruefung neu aus kanonischer Wandlage (Projektmappe) und
// kanonischen Verzahnungsbereichen (Wandelement) gerechnet — in `pruefeGeschoss`.
// Genau deshalb kann der Archivweg sie auch nicht verlieren; nachgewiesen wird das
// hier am ECHTEN Pfad statt an nachgebauten Datenstrukturen:
//
//   echte Speicherschicht (storage.js) → echter Rechenkern (buildWall)
//   → exportPlan/archivDateien → zipSync/entpacke → leseArchiv/schreibeArchiv
//   → LEERER Zielspeicher → Bewertung und Lageplanblatt aus dem importierten Stand.
{
  class MemStorage {
    constructor() { this.m = new Map(); }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
  }
  globalThis.localStorage = new MemStorage();
  const store = await import("../../docs/shared/storage.js");
  const CON = await import("../../docs/shared/sembla-constraints.js");
  const LP = await import("../../docs/shared/sembla-lageplan.js");

  // Zwei rechtwinklige Waende mit GENAU EINEM gemeinsamen Rasterfeld (0/0 je Wand):
  // x-Wand x[0…2000] y[1000…1125], y-Wand x[0…125] y[1000…2000].
  const LAGE_X = { start_mm: { x: 0, y: 1062.5 }, richtung: "x", laenge_grid: 16 };
  const LAGE_Y = { start_mm: { x: 62.5, y: 1000 }, richtung: "y", laenge_grid: 8 };

  /**
   * Ein Projekt mit zwei so gelegten Waenden aufbauen, als vollstaendiges
   * Projektarchiv exportieren und in einen LEEREN Speicher importieren.
   * Zurueck kommt beides: der Stand vor dem Export und der importierte.
   */
  async function archivProbe(ilX, ilY) {
    globalThis.localStorage = new MemStorage();          // leerer Ausgangsspeicher
    const prj = store.fuegeProjektHinzu("Verzahnprobe", { geschoss: "EG", hoehe_mm: 2600 });
    const gsId = prj.gebaeude[0].geschosse[0].id;
    store.speichere("Wand X", buildWall("Wand X", 2000, 2600, [], null, null, [], ilX), "wnd-vx");
    store.speichere("Wand Y", buildWall("Wand Y", 1000, 2600, [], null, null, [], ilY), "wnd-vy");
    store.verorteWand("wnd-vx", gsId, { lage: LAGE_X });
    store.verorteWand("wnd-vy", gsId, { lage: LAGE_Y });

    const mappeVor = store.holeMappe();
    const elementeVor = store.listeElemente();
    const plan = ARCHIV.exportPlan(mappeVor, elementeVor.map((e) => e.id), []);
    const files = ARCHIV.archivDateien(mappeVor, plan, (id) => store.projektObjekt(id), () => null);
    const w = ARCHIV.archivName(mappeVor);
    const zip = zipSync(files.map((d) => ({ name: w + "/" + d.name, data: d.data })));

    globalThis.localStorage = new MemStorage();          // leerer Zielspeicher
    const gelesen = ARCHIV.leseArchiv(await entpacke(zip),
      { parseWand: (obj) => store.parseImport(JSON.stringify(obj)) });
    const erg = await store.schreibeArchiv(gelesen, {});
    return { gsId, gelesen, erg, mappeVor, elementeVor,
      mappe: store.holeMappe(), elemente: store.listeElemente() };
  }

  /** Die Verzahnungstabelle GENAU so bilden wie `verzahnungenMap()` im Geschosseditor. */
  const verzTabelle = (mappe) => {
    const t = new Map();
    for (const { wand } of MAPPE.alleWaende(mappe)) {
      const el = store.holeElement(wand.id);
      const il = el && el.wandelement ? el.wandelement.interlocks : null;
      if (Array.isArray(il) && il.length) t.set(String(wand.id), il);
    }
    return t;
  };
  /** Die Bewertung, wie der Geschosseditor sie in `loesen()` holt (`pruefeGeschoss`). */
  const editorBewertung = (mappe, gsId) => {
    const gs = MAPPE.findeGeschoss(mappe, gsId).geschoss;
    return CON.pruefeGeschoss(gs.waende, gs.bemassungen, gs.ursprung_mm, verzTabelle(mappe));
  };

  const PASSEND_X = [{ g0: 0, g1: 1, start_parity: 0 }];
  const PASSEND_Y = [{ g0: 0, g1: 1, start_parity: 1 }];

  const p = await archivProbe(PASSEND_X, PASSEND_Y);

  // --- Muss 1: Kennungen, Lagen und Verzahnungsbereiche kommen zurueck -----
  ok("[#83] das Archiv wird fehlerfrei gelesen und geschrieben",
    p.gelesen.fehler.length === 0 && p.gelesen.waende.length === 2 && p.erg.waende === 2);
  ok("[#83] dieselben stabilen Wandkennungen stehen wieder im Geschoss",
    MAPPE.alleWaende(p.mappe).map((x) => x.wand.id).sort().join() === "wnd-vx,wnd-vy");
  ok("[#83] die Wandlagen sind nach dem Archivweg wertgleich",
    JSON.stringify(MAPPE.alleWaende(p.mappe).map((x) => x.wand.lage))
    === JSON.stringify(MAPPE.alleWaende(p.mappeVor).map((x) => x.wand.lage))
    && MAPPE.findeWand(p.mappe, "wnd-vx").wand.lage.start_mm.y === 1062.5
    && MAPPE.findeWand(p.mappe, "wnd-vy").wand.lage.richtung === "y");
  ok("[#83] die Verzahnungsbereiche beider Waende sind wertgleich erhalten",
    JSON.stringify(store.holeElement("wnd-vx").wandelement.interlocks) === JSON.stringify(PASSEND_X)
    && JSON.stringify(store.holeElement("wnd-vy").wandelement.interlocks) === JSON.stringify(PASSEND_Y));

  // --- Muss 2/3: der Lageplan des IMPORTIERTEN Standes ---------------------
  const dNach = LP.lageplanDaten({ mappe: p.mappe, geschossId: p.gsId, elemente: p.elemente });
  const bNach = LP.blattHtml(dNach);
  ok("[#83] der Lageplan meldet die Stelle als zulaessige Verzahnung, nicht als Kollision",
    dNach.kollisionen.length === 0 && dNach.verzahnungen.length === 1
    && dNach.verzahnungen[0].name_a === "Wand X" && dNach.verzahnungen[0].name_b === "Wand Y");
  ok("[#83] beide Wandnamen stehen dafuer auf dem Blatt",
    /<h4>Verzahnungen<\/h4>/.test(bNach.html) && /„Wand X“ und „Wand Y“/.test(bNach.html));
  ok("[#83] der Vollstaendigkeitsvermerk weist an dieser Stelle keinen Mangel aus",
    dNach.vollstaendig === true && dNach.meldungen.length === 0
    && !/nicht vollständig/i.test(bNach.html));

  // --- Muss 4: derselbe importierte Stand im Geschosseditor ----------------
  // Nachgewiesen an der KANONISCHEN Bewertung mit exakt dem Eingang, den
  // `loesen()` in docs/geschossplan.html bildet — es gibt keinen zweiten Weg.
  const eNach = editorBewertung(p.mappe, p.gsId);
  ok("[#83] der Geschosseditor bewertet dieselbe Stelle ebenfalls als Verzahnung",
    eNach.kollisionen.length === 0 && eNach.verzahnungen.length === 1
    && eNach.verzahnungen[0].a === "wnd-vx" && eNach.verzahnungen[0].b === "wnd-vy");
  ok("[#83] Editor und Lageplan sagen dasselbe — dieselbe Rechnung, dieselbe Stelle",
    JSON.stringify(eNach.verzahnungen.map((v) => v.raster))
    === JSON.stringify(dNach.verzahnungen.map((v) => v.raster))
    && eNach.verzahnungen[0].raster.a === 0 && eNach.verzahnungen[0].raster.b === 0);

  // --- Muss 5: eine unzulaessige Ueberlagerung bleibt Kollision ------------
  const q = await archivProbe(PASSEND_X, [{ g0: 0, g1: 1, start_parity: 0 }]);
  const dQ = LP.lageplanDaten({ mappe: q.mappe, geschossId: q.gsId, elemente: q.elemente });
  ok("[#83] gleiche Startparitaet bleibt nach demselben Archivweg eine Kollision",
    dQ.kollisionen.length === 1 && dQ.verzahnungen.length === 0
    && dQ.meldungen.some((x) => x.art === "kollision")
    && dQ.vollstaendig === false
    && /nicht vollständig/i.test(LP.blattHtml(dQ).html));
  ok("[#83] auch der Geschosseditor bleibt bei der Kollision",
    (() => { const e = editorBewertung(q.mappe, q.gsId);
      return e.kollisionen.length === 1 && e.verzahnungen.length === 0; })());

  // --- Muss 6: Duplizieren aendert die Bewertung des Paares nicht ----------
  // Die Kopie traegt eine NEUE id und ist nach #74 ausdruecklich unverortet — sie
  // kann damit gar keine Ueberlagerung erzeugen. Verglichen wird bitgenau.
  const r = await archivProbe(PASSEND_X, PASSEND_Y);
  const vorherBewertung = JSON.stringify(editorBewertung(r.mappe, r.gsId));
  const vorherBlatt = LP.blattHtml(LP.lageplanDaten(
    { mappe: r.mappe, geschossId: r.gsId, elemente: r.elemente })).html;
  const vorherWandX = JSON.stringify(store.holeElement("wnd-vx"));
  const kopieId = store.dupliziere("wnd-vx");
  const nachherMappe = store.holeMappe();
  ok("[#83] die Kopie ist eine eigene Wand mit eigenen Verzahnungsbereichen",
    kopieId !== "wnd-vx"
    && JSON.stringify(store.holeElement(kopieId).wandelement.interlocks) === JSON.stringify(PASSEND_X)
    && store.holeElement(kopieId).name === "Wand X (Kopie)");
  ok("[#83] sie ist unverortet und steht in keinem Geschoss",
    !MAPPE.findeWand(nachherMappe, kopieId)
    && store.mappeReferenzen().unverortet.includes(kopieId));
  ok("[#83] die Ausgangswand bleibt bit-genau unveraendert",
    JSON.stringify(store.holeElement("wnd-vx")) === vorherWandX);
  ok("[#83] die Bewertung des bestehenden Paares ist danach bitgleich",
    JSON.stringify(editorBewertung(nachherMappe, r.gsId)) === vorherBewertung);
  ok("[#83] auch das Lageplanblatt des Geschosses bleibt bitgleich",
    LP.blattHtml(LP.lageplanDaten({ mappe: nachherMappe, geschossId: r.gsId,
      elemente: store.listeElemente() })).html === vorherBlatt);

  // --- Muss-not: es entsteht KEIN gespeichertes Beziehungsfeld -------------
  ok("[#83] weder Mappe noch Wandelement tragen eine gespeicherte Verzahnungsbeziehung",
    !JSON.stringify(nachherMappe).includes("verzahnung")
    && !JSON.stringify(nachherMappe).includes("interlock")
    && !JSON.stringify(store.holeElement("wnd-vx")).includes("verzahnung"));
  ok("[#83] das Archivmodul rechnet keine eigene Verzahnungsgeometrie",
    !/start_parity|interlock|verzahn/i.test(
      readFileSync(new URL("../../docs/shared/sembla-archiv.js", import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
}

// --- [#86] Die Projekt-ZIP des zentralen Exports ist importierbar ----------
//
// Modul 0 erzeugt seit #67 eine Projekt-ZIP, fuer die es keinen Importweg gab: sie
// traegt keine `projekt.json` (Erkennungsmerkmal des Archivs, [L-13]) und ihre
// Mappendatei fuehrt in `wand.datei` durchgehend `null`. Geprueft wird hier am
// ECHTEN Pfad, nicht an nachgebauten Datenstrukturen:
//
//   echte Speicherschicht (storage.js) -> echter Rechenkern (buildWall)
//   -> ECHTER Exportweg (hierarchieExport) -> zipSync/entpacke
//   -> leseProjektQuelle/schreibeArchiv -> LEERER Zielspeicher -> zurueckgelesen.
{
  class MemStorage {
    constructor() { this.m = new Map(); }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
  }
  globalThis.localStorage = new MemStorage();
  const store = await import("../../docs/shared/storage.js");
  const PARSE = { parseWand: (obj) => store.parseImport(JSON.stringify(obj)) };

  /** Die kanonische Lesesicht des gesamten Standes - daran wird der Import gemessen. */
  const stand = () => JSON.stringify({
    mappe: MAPPE.mappeObjekt(store.holeMappe()),
    waende: store.listeElemente()
      .map((e) => ({ id: e.id, name: e.name, we: e.wandelement, ein: store.holeEingaben(e.id) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });

  // --- Ausgangsstand ueber die echten Wege aufbauen ------------------------
  globalThis.localStorage = new MemStorage();
  const prj = store.fuegeProjektHinzu("Exportprobe", { geschoss: "EG", hoehe_mm: 2600 });
  const gsId = prj.gebaeude[0].geschosse[0].id;
  // Wandtyp gehoert ans Wandelement und wird beim Anlegen gesetzt; ohne ihn ergaenzte
  // ihn erst der Import (Normalisierung) und der Vergleich vor/nach waere unfair.
  const wand = (n, l) => ({ ...buildWall(n, l, 2600, []), wandtyp: "mit_wind" });
  store.speichere("EG-W01", wand("EG-W01", 2000), "wnd-e1");
  store.speichere("EG-W02", wand("EG-W02", 1000), "wnd-e2");
  store.verorteWand("wnd-e1", gsId, { lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 16 } });
  store.verorteWand("wnd-e2", gsId, { lage: { start_mm: { x: 2062.5, y: 0 }, richtung: "y", laenge_grid: 8 } });
  store.setzeMappe(MAPPE.setzeKatalogRef(store.holeMappe(), "kat-extern"));
  store.setzeKopfdaten({ bauherr: "AWG Musterstadt", plan_nr: "A-07" });
  const standVor = stand();
  const prjId = store.holeMappe().projekt.id;

  // --- Der ECHTE Exportweg (#67) ------------------------------------------
  const exp = ARCHIV.hierarchieExport(["mappe", "geschosse", "waende"], {
    mappe: store.holeMappe(), ebene: "projekt",
    holeElement: (id) => store.holeElement(id),
    holeEingaben: (id) => store.holeEingaben(id),
    projektObjekt: (id) => store.projektObjekt(id),
  });
  const expMappe = exp.dateien.find((d) => /^SEMBLA_Projektmappe_/.test(d.name));
  ok("[#86] der zentrale Export legt die Mappe unter EIGENEM Namen ab (keine projekt.json)",
    !!expMappe && !exp.dateien.some((d) => d.name.endsWith(ARCHIV.DATEI_MAPPE)));
  ok("[#86] und genau daran scheiterte der Import: alle Wandreferenzen tragen datei: null",
    MAPPE.alleWaende(JSON.parse(expMappe.data)).every(({ wand }) => wand.datei === null));
  ok("[#86] die Wandkennung steht ausschliesslich im Archivpfad der Wanddatei",
    exp.dateien.filter((d) => d.name.startsWith(ARCHIV.ORDNER_WAENDE + "/")).length === 2
    && exp.dateien.filter((d) => d.name.startsWith(ARCHIV.ORDNER_WAENDE + "/"))
      .every((d) => !("id" in JSON.parse(d.data)) && !("id" in JSON.parse(d.data).wandelement)));

  const expZip = zipSync(exp.dateien);
  const expEintraege = await entpacke(expZip);

  // --- Import in einen LEEREN Speicher ------------------------------------
  globalThis.localStorage = new MemStorage();
  const gelesen = ARCHIV.leseProjektQuelle(expEintraege, PARSE);
  ok("[#86] die Export-ZIP wird als eigene Fassung erkannt", gelesen.quelle === ARCHIV.QUELLE_EXPORT);
  ok("[#86] sie wird fehlerfrei geprueft und traegt beide Waende",
    gelesen.fehler.length === 0 && gelesen.waende.length === 2);
  ok("[#86] zugeordnet wird ueber die stabile Wandkennung, nicht ueber den Namen",
    gelesen.waende.map((w) => w.id).sort().join() === "wnd-e1,wnd-e2"
    && gelesen.waende.every((w) => ARCHIV.wandIdAusPfad(w.pfad) === w.id));
  ok("[#86] der Bericht nennt Projekt, Geschosse, Wandnamen und Katalogkennung", (() => {
    const t = ARCHIV.berichtZeilen(gelesen).join(" | ");
    return /Exportprobe/.test(t) && /Geschosse \(1\): EG/.test(t)
      && /EG-W01/.test(t) && /EG-W02/.test(t) && /kat-extern/.test(t);
  })());
  ok("[#86] vor der Bestaetigung ist der Zielspeicher unveraendert leer",
    store.listeProjekte().length === 0 && store.listeElemente().length === 0);

  const erg = await store.schreibeArchiv(gelesen, {});
  ok("[#86] der Import stellt den fachlichen Stand vollstaendig wieder her", stand() === standVor);
  ok("[#86] Struktur, Lage und Kopfdaten sind zurueck",
    MAPPE.alleWaende(store.holeMappe()).length === 2
    && MAPPE.findeWand(store.holeMappe(), "wnd-e2").wand.lage.richtung === "y"
    && store.holeMappe().projekt.kopfdaten.plan_nr === "A-07");
  ok("[L-12] der Katalog reist nicht mit - die Kennung bleibt, das Fehlen wird benannt",
    erg.katalogFehlt === "kat-extern" && store.holeMappe().katalog === "kat-extern"
    && store.listeKataloge().length === 0);

  // --- Dieselbe ZIP, entpackt in einen Wurzelordner (Ordnerimport) ---------
  globalThis.localStorage = new MemStorage();
  const imOrdner = ARCHIV.leseProjektQuelle(
    expEintraege.map((e) => ({ name: "SEMBLA_Export_Projekt_Exportprobe/" + e.name, data: e.data })), PARSE);
  await store.schreibeArchiv(imOrdner, {});
  ok("[#86] der Ordnerimport derselben Dateien fuehrt zum selben Stand", stand() === standVor);

  // --- Fremddateien im ZIP: benannt uebergangen, nie mit importiert --------
  globalThis.localStorage = new MemStorage();
  const mitFremd = ARCHIV.leseProjektQuelle([...expEintraege,
    { name: "SEMBLA_Bauteilkatalog_Standard.json", data: '{"format":"SEMBLA-Bauteilkatalog","version":1,"name":"X","produkte":[]}' },
    { name: "SEMBLA_Stueckliste_EG-W01.csv", data: "a;b" }], PARSE);
  ok("[L-12] die Katalogdatei im ZIP wird benannt und NICHT importiert",
    mitFremd.fehler.length === 0
    && mitFremd.hinweise.some((h) => /Bauteilkatalogdatei/.test(h) && /nicht mit importiert/i.test(h)));
  await store.schreibeArchiv(mitFremd, {});
  ok("[L-12] nach dem Import liegt kein Katalog im Speicher", store.listeKataloge().length === 0);
  ok("[#86] die Stuecklistendatei wird als ueberzaehlig benannt, nicht stillschweigend uebergangen",
    mitFremd.ueberzaehlig.includes("SEMBLA_Stueckliste_EG-W01.csv"));

  // --- Ein Planbild fehlt hier IMMER: Hinweis, kein Fehler -----------------
  globalThis.localStorage = new MemStorage();
  await store.schreibeArchiv(ARCHIV.leseProjektQuelle(expEintraege, PARSE), {});
  store.setzeGeschossPlan(gsId, { datei: "eg.png", typ: "image/png", breite_px: 800, hoehe_px: 600,
    mm_je_pixel: 2, versatz_x_mm: 0, versatz_y_mm: 0 });
  const mitPlanExp = ARCHIV.hierarchieExport(["mappe", "waende"], {
    mappe: store.holeMappe(), ebene: "projekt",
    holeElement: (id) => store.holeElement(id), projektObjekt: (id) => store.projektObjekt(id),
  });
  const mitPlan = ARCHIV.leseProjektQuelle(await entpacke(zipSync(mitPlanExp.dateien)), PARSE);
  ok("[#86] ein fehlendes Planbild ist in der Export-Fassung ein HINWEIS, kein Fehler",
    mitPlan.fehler.length === 0 && mitPlan.bilder.length === 0
    && mitPlan.hinweise.some((h) => /Planbild/.test(h) && /nie enthalten/.test(h)));
  ok("[L-9] Massstab und Versatz bleiben dabei in der Mappe erhalten",
    MAPPE.findeGeschoss(mitPlan.mappe, gsId).geschoss.plan.mm_je_pixel === 2);

  // --- Die Archivfassung bleibt unveraendert ------------------------------
  {
    globalThis.localStorage = new MemStorage();
    await store.schreibeArchiv(ARCHIV.leseProjektQuelle(expEintraege, PARSE), {});
    const m = store.holeMappe();
    const plan = ARCHIV.exportPlan(m, store.listeElemente().map((e) => e.id), []);
    const files = ARCHIV.archivDateien(m, plan, (id) => store.projektObjekt(id), () => null);
    const zip = zipSync(files.map((d) => ({ name: "SEMBLA_Projekt_Exportprobe/" + d.name, data: d.data })));
    const eintraege = await entpacke(zip);
    const ueber = ARCHIV.leseProjektQuelle(eintraege, PARSE);
    const direkt = ARCHIV.leseArchiv(eintraege, PARSE);
    ok("[L-13] ein Archiv mit projekt.json wird weiterhin als Archiv gelesen",
      ueber.quelle === ARCHIV.QUELLE_ARCHIV && ueber.fehler.length === 0 && ueber.waende.length === 2);
    ok("[L-13] und zwar bit-genau so wie bisher ueber leseArchiv",
      JSON.stringify({ f: ueber.fehler, h: ueber.hinweise, u: ueber.ueberzaehlig, w: ueber.waende })
      === JSON.stringify({ f: direkt.fehler, h: direkt.hinweise, u: direkt.ueberzaehlig, w: direkt.waende }));
    globalThis.localStorage = new MemStorage();
    await store.schreibeArchiv(ueber, {});
    ok("[L-13] der Archivweg stellt denselben Stand her wie zuvor", stand() === standVor);
  }

  // --- Echter Fehlerfall: Ursache benannt, Speicher vollstaendig unveraendert
  {
    globalThis.localStorage = new MemStorage();
    await store.schreibeArchiv(ARCHIV.leseProjektQuelle(expEintraege, PARSE), {});
    const vorher = stand();
    const roh = () => [localStorage.getItem("sembla:projekte"), localStorage.getItem("sembla:elemente")].join(" ");
    const rohVorher = roh();
    const nochmal = ARCHIV.leseProjektQuelle(expEintraege, PARSE);
    ok("[L-13] ein vorhandenes Projekt wird als Konflikt gemeldet",
      store.archivKonflikte(nochmal).projekt.id === prjId
      && store.archivKonflikte(nochmal).waende.length === 2);
    let grund = "";
    try { await store.schreibeArchiv(nochmal, {}); } catch (e) { grund = e.message; }
    ok("[L-13] ohne ausdrueckliche Bestaetigung wird die Ursache benannt und NICHTS geschrieben",
      /ausdrückliche Bestätigung/.test(grund) && stand() === vorher && roh() === rohVorher);

    // Ein Schreibfehler mitten im Lauf: vollstaendiger Ruecksprung ([L-13]).
    const kaputt = ARCHIV.leseProjektQuelle(expEintraege, PARSE);
    kaputt.bilder = [{ geschossId: gsId, bytes: new Uint8Array([1]), typ: "image/png", pfad: "x.png", plan: {} }];
    let grund2 = "";
    try {
      await store.schreibeArchiv(kaputt, { ueberschreiben: true,
        plan: { speicherePlan: () => { throw new Error("Speicher voll (Test)"); },
                holePlan: () => null, loeschePlan: () => undefined } });
    } catch (e) { grund2 = e.message; }
    ok("[L-13] ein Schreibfehler nennt den Grund und setzt den Speicher vollstaendig zurueck",
      /Speicher voll \(Test\)/.test(grund2) && /wiederhergestellt/.test(grund2)
      && roh() === rohVorher);
  }

  // --- Abweisungen nennen die tatsaechliche Ursache ------------------------
  const nurWand = ARCHIV.leseProjektQuelle([
    { name: "waende/EG-W01__wnd-e1.json", data: exp.dateien.find((d) => d.name.includes("wnd-e1")).data },
    { name: "SEMBLA_Stueckliste_EG-W01.csv", data: "a;b" }], PARSE);
  ok("[#86] eine Wand-ZIP verweist auf den Wandimport, statt pauschal abzuweisen",
    nurWand.fehler.some((f) => /Wandimport/.test(f)) && nurWand.mappe === null);

  const nurKatalog = ARCHIV.leseProjektQuelle([
    { name: "SEMBLA_Bauteilkatalog_X.json", data: '{"format":"SEMBLA-Bauteilkatalog","version":1,"name":"X","produkte":[]}' }], PARSE);
  ok("[L-12] eine reine Katalog-ZIP verweist auf den Katalogimport",
    nurKatalog.fehler.some((f) => /Katalogimport/.test(f)));

  const zweiMappen = ARCHIV.leseProjektQuelle([
    { name: "a/SEMBLA_Projektmappe_A.json", data: expMappe.data },
    { name: "b/SEMBLA_Projektmappe_B.json", data: expMappe.data }], PARSE);
  ok("[#86] mehrere gleichrangige Mappen werden benannt, nichts wird zusammengefuehrt",
    zweiMappen.fehler.some((f) => /zusammengeführt/.test(f)) && zweiMappen.mappe === null);

  const geschossExp = ARCHIV.hierarchieExport(["geschoss", "waende"], {
    mappe: store.holeMappe(), ebene: "geschoss", geschossId: gsId,
    holeElement: (id) => store.holeElement(id), projektObjekt: (id) => store.projektObjekt(id),
  });
  const geschossEintraege = await entpacke(zipSync(geschossExp.dateien));
  const nurGeschosse = ARCHIV.leseProjektQuelle(geschossEintraege, PARSE);
  ok("[#86] ein Geschoss-Export ohne volle Mappe wird ueber seine Teilmappe gelesen",
    nurGeschosse.fehler.length === 0 && nurGeschosse.quelle === ARCHIV.QUELLE_EXPORT
    && nurGeschosse.waende.length === 2);
  const zweiGeschosse = ARCHIV.leseProjektQuelle([...geschossEintraege,
    { name: "geschosse/OG__gs-zweit.json",
      data: geschossExp.dateien.find((d) => d.name.startsWith("geschosse/")).data }], PARSE);
  ok("[#86] zwei gleichrangige Teilmappen werden benannt statt zusammengefuehrt",
    zweiGeschosse.fehler.some((f) => /zusammengeführt/.test(f)));

  const widerspruch = ARCHIV.leseProjektQuelle([
    { name: "SEMBLA_Projektmappe_A.json", data: expMappe.data },
    { name: "geschosse/EG__fremd.json", data: expMappe.data.split(prjId).join("prj-fremd") }], PARSE);
  ok("[#86] widerspruechliche Projektkennungen werden benannt",
    widerspruch.fehler.some((f) => /anderes/.test(f) && /Projekt/.test(f)));

  const ohneKennung = ARCHIV.leseProjektQuelle([
    { name: "SEMBLA_Projektmappe_A.json", data: expMappe.data },
    { name: "waende/EG-W01.json", data: exp.dateien.find((d) => d.name.includes("wnd-e1")).data }], PARSE);
  ok("[#86] eine Wanddatei ohne Kennung im Pfad wird benannt - der Name zaehlt nie",
    ohneKennung.fehler.some((f) => /Wandkennung im Pfad/.test(f)));

  const nichtDabei = ARCHIV.leseProjektQuelle(
    expEintraege.filter((e) => !e.name.includes("wnd-e2")), PARSE);
  ok("[L-4] eine nicht mitgelieferte Wand bleibt verwaist - Hinweis, kein Fehler",
    nichtDabei.fehler.length === 0 && nichtDabei.waende.length === 1
    && nichtDabei.hinweise.some((h) => /verwaist/.test(h)));

  // --- Die Kennung kommt aus dem Pfad, nie aus dem Namen -------------------
  ok("[#86] wandIdAusPfad liest genau den Teil hinter dem letzten Doppelstrich",
    ARCHIV.wandIdAusPfad("waende/EG-W01__w-123.json") === "w-123"
    && ARCHIV.wandIdAusPfad("waende/A__B__w-9.json") === "w-9"
    && ARCHIV.wandIdAusPfad("waende/ohne-kennung.json") === null);

  // --- Muss-not: kein neues gespeichertes Feld, kein Versionssprung --------
  ok("[#86] der Importweg legt kein neues Feld an und bricht keine Versionsachse",
    store.SCHEMA_VERSION === 6 && store.PROJEKT_VERSION === 2
    && MAPPE.MAPPE_VERSION === 2
    && MAPPE.alleWaende(store.holeMappe()).every(({ wand }) => wand.datei === null));
}

// --- [#86] Teilauswahl: ein einzelnes Geschoss oder eine einzelne Wand ------
//
// Nach dem Vorpaket uebernahm der eine Importdialog nur das GANZE Projekt. Geprueft
// wird die Teilauswahl hier am ECHTEN Pfad, nicht an nachgebauten Datenstrukturen:
//
//   echte Speicherschicht (storage.js) -> echter Rechenkern (buildWall)
//   -> ECHTER Exportweg (hierarchieExport) -> zipSync/entpacke
//   -> leseProjektQuelle -> uebernahme -> schreibeArchiv
//   -> Projektmappe und Wandelemente aus dem SPEICHER zurueckgelesen.
//
// Massgebend ist dabei durchgehend die WANDKENNUNG; Geschoss und Bemassungen
// bekommen im Ziel neue Kennungen (s. Abschnittskopf in sembla-archiv.js).
{
  class MemStorage {
    constructor() { this.m = new Map(); }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
  }
  globalThis.localStorage = new MemStorage();
  const store = await import("../../docs/shared/storage.js");
  const PARSE = { parseWand: (obj) => store.parseImport(JSON.stringify(obj)) };
  const wandEl = (n, l) => ({ ...buildWall(n, l, 2600, []), wandtyp: "mit_wind" });
  const roh = () => [localStorage.getItem("sembla:projekte"), localStorage.getItem("sembla:elemente")].join(" ");

  // --- Quelle: EIN Projekt mit ZWEI Geschossen, drei Waenden, einem Mass ---
  globalThis.localStorage = new MemStorage();
  const qPrj = store.fuegeProjektHinzu("Kollegenprojekt", { geschoss: "EG", hoehe_mm: 2600 });
  const qEg = qPrj.gebaeude[0].geschosse[0].id;
  store.setzeMappe(MAPPE.fuegeGeschossHinzu(store.holeMappe(), qPrj.gebaeude[0].id, "OG", 2800).mappe);
  const qOg = MAPPE.alleGeschosse(store.holeMappe()).find((t) => t.geschoss.name === "OG").geschoss.id;
  store.speichere("EG-W01", wandEl("EG-W01", 2000), "q-eg1");
  store.speichere("EG-W02", wandEl("EG-W02", 1000), "q-eg2");
  store.speichere("OG-W01", wandEl("OG-W01", 3000), "q-og1");
  store.verorteWand("q-eg1", qEg, { lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 16 } });
  store.verorteWand("q-eg2", qEg, { lage: { start_mm: { x: 0, y: 562.5 }, richtung: "x", laenge_grid: 8 } });
  store.verorteWand("q-og1", qOg, { lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 24 } });
  store.setzeMappe(MAPPE.setzeBemassung(store.holeMappe(), qEg, {
    id: "bm-quelle", achse: "y",
    von: { wand: "q-eg1", bezug: "mitte" }, bis: { wand: "q-eg2", bezug: "mitte" }, mass_mm: 500,
  }));

  const exp = ARCHIV.hierarchieExport(["mappe", "geschosse", "waende"], {
    mappe: store.holeMappe(), ebene: "projekt",
    holeElement: (id) => store.holeElement(id),
    holeEingaben: (id) => store.holeEingaben(id),
    projektObjekt: (id) => store.projektObjekt(id),
  });
  const teilEintraege = await entpacke(zipSync(exp.dateien));

  // --- Gelesen und geprueft wird die GANZE Datei ---------------------------
  globalThis.localStorage = new MemStorage();
  const gelesenT = ARCHIV.leseProjektQuelle(teilEintraege, PARSE);
  ok("[#86] die Quelle mit zwei Geschossen wird fehlerfrei und vollstaendig geprueft",
    gelesenT.fehler.length === 0 && gelesenT.waende.length === 3
    && MAPPE.alleGeschosse(gelesenT.mappe).length === 2);

  const angebot = ARCHIV.teilauswahlOptionen(gelesenT);
  const egOpt = angebot.geschosse.find((g) => g.name === "EG");
  ok("[#86] die Teilauswahl bietet beide Geschosse und alle Waende mit Wandelement an",
    angebot.geschosse.length === 2 && angebot.waende.length === 3
    && egOpt.waende === 2 && egOpt.elemente === 2 && egOpt.bemassungen === 1
    && angebot.waende.every((w) => !!gelesenT.waende.find((x) => x.id === w.id)));

  // --- Zielspeicher: ein bestehendes Projekt plus ein UNBETEILIGTES --------
  globalThis.localStorage = new MemStorage();
  const zPrj = store.fuegeProjektHinzu("Mein Projekt", { geschoss: "Bestand", hoehe_mm: 2500 });
  const zGs = zPrj.gebaeude[0].geschosse[0].id;
  store.speichere("Bestand-W01", wandEl("Bestand-W01", 1250), "z-w1");
  store.verorteWand("z-w1", zGs, { lage: { start_mm: { x: 0, y: 62.5 }, richtung: "x", laenge_grid: 10 } });
  const fremdPrj = store.fuegeProjektHinzu("Unbeteiligt", { geschoss: "UG" });
  store.setzeAktivesProjekt(zPrj.projekt.id);
  const fremdVor = JSON.stringify(store.projektMappe(fremdPrj.projekt.id));
  const bestandVor = JSON.stringify(store.holeElement("z-w1"));

  // === Akzeptanztest 1: ein Geschoss in ein BESTEHENDES Projekt ============
  const u1 = ARCHIV.uebernahme(gelesenT, {
    umfang: ARCHIV.UMFANG_GESCHOSS, geschossId: egOpt.id,
  }, store.projektMappe(zPrj.projekt.id));
  ok("[#86] uebernommen wird genau das gewaehlte Geschoss — mit seinen zwei Waenden",
    u1.waende.map((w) => w.id).sort().join() === "q-eg1,q-eg2"
    && u1.ziel.art === ARCHIV.UMFANG_GESCHOSS && u1.ziel.neu === false
    && u1.ziel.projektId === zPrj.projekt.id);
  ok("[#86] die Fehlerliste der Quelle reist UNVERAENDERT mit (gepruefte Datei bleibt gepruefte Datei)",
    u1.fehler === gelesenT.fehler);
  ok("[#86] der Umfangsbericht benennt Geschoss, Zielprojekt und Mengen VOR der Bestaetigung", (() => {
    const t = ARCHIV.uebernahmeZeilen(u1).join(" | ");
    return /Geschoss „EG“/.test(t) && /Mein Projekt/.test(t) && /2 mit Wandelement/.test(t)
      && /1 Maß\(e\)/.test(t);
  })());

  const erg1 = await store.schreibeArchiv(u1, { ueberschreiben: true });
  const zMappe1 = store.projektMappe(zPrj.projekt.id);
  const neuGs1 = MAPPE.alleGeschosse(zMappe1).find((t) => t.geschoss.name === "EG");
  ok("[#86] das Geschoss steht als eigenes Geschoss im Zielprojekt — neben dem Bestand",
    MAPPE.alleGeschosse(zMappe1).length === 2 && !!neuGs1
    && MAPPE.alleGeschosse(zMappe1).some((t) => t.geschoss.id === zGs));
  ok("[#86] es bekommt eine NEUE Geschoss-Kennung (Planbild-Datenbank je Kennung, [L-8])",
    neuGs1.geschoss.id !== egOpt.id && neuGs1.geschoss.hoehe_mm === 2600);
  ok("[#86] die Waende kommen ueber die WANDKENNUNG an — samt Lage ([L-1])", (() => {
    const w1 = MAPPE.findeWand(zMappe1, "q-eg1"), w2 = MAPPE.findeWand(zMappe1, "q-eg2");
    return !!w1 && !!w2 && w1.geschoss.id === neuGs1.geschoss.id && w2.geschoss.id === neuGs1.geschoss.id
      && w1.wand.lage.laenge_grid === 16 && w1.wand.lage.start_mm.y === 62.5
      && w2.wand.lage.laenge_grid === 8 && w2.wand.lage.start_mm.y === 562.5
      && w1.wand.datei === null && w2.wand.datei === null;
  })());
  ok("[#86] die Wandelemente selbst liegen im Speicher (Zuordnung ueber die id, nie den Namen)",
    store.holeElement("q-eg1").wandelement.length_mm === 2000
    && store.holeElement("q-eg2").wandelement.length_mm === 1000
    && erg1.waende === 2);
  ok("[K-10] die Bemassung reist mit — gleiche Bezuege und gleicher Wert, NEUE Kennung", (() => {
    const b = MAPPE.bemassungen(zMappe1, neuGs1.geschoss.id);
    return b.length === 1 && b[0].mass_mm === 500 && b[0].achse === "y"
      && b[0].von.wand === "q-eg1" && b[0].bis.wand === "q-eg2" && b[0].id !== "bm-quelle";
  })());
  ok("[#86] das ZWEITE Geschoss der Quelle bleibt liegen — Struktur und Wandelement",
    !MAPPE.alleGeschosse(zMappe1).some((t) => t.geschoss.name === "OG")
    && !MAPPE.findeWand(zMappe1, "q-og1") && store.holeElement("q-og1") === null);
  ok("[#86] der uebrige Speicherbestand bleibt unveraendert (fremdes Projekt bitgleich)",
    JSON.stringify(store.projektMappe(fremdPrj.projekt.id)) === fremdVor
    && JSON.stringify(store.holeElement("z-w1")) === bestandVor
    && MAPPE.findeWand(zMappe1, "z-w1").wand.lage.laenge_grid === 10);
  ok("[L-4] nach der Teiluebernahme gibt es keine verwaisten Eintraege",
    store.mappeReferenzen().verwaist.length === 0);
  ok("[#86] kein neues gespeichertes Feld, keine gebrochene Versionsachse",
    store.SCHEMA_VERSION === 6 && store.PROJEKT_VERSION === 2 && MAPPE.MAPPE_VERSION === 2
    && JSON.stringify(Object.keys(neuGs1.geschoss).sort())
      === JSON.stringify(["bemassungen", "hoehe_mm", "id", "name", "plan", "ursprung_mm", "waende"]));

  // === Akzeptanztest 2: dasselbe Geschoss in ein NEU angelegtes Projekt ====
  globalThis.localStorage = new MemStorage();
  const u2 = ARCHIV.uebernahme(gelesenT, {
    umfang: ARCHIV.UMFANG_GESCHOSS, geschossId: egOpt.id, neuesProjekt: "Vom Kollegen",
  }, null);
  ok("[#86] ohne bestehendes Projekt entsteht eines im selben Uebernahmeschritt",
    u2.ziel.neu === true && u2.ziel.projektName === "Vom Kollegen");
  await store.schreibeArchiv(u2, {});
  const m2 = store.holeMappe();
  ok("[#86] das neue Projekt traegt GENAU das uebernommene Geschoss (kein leeres daneben)",
    store.listeProjekte().length === 1 && m2.projekt.name === "Vom Kollegen"
    && MAPPE.alleGeschosse(m2).length === 1
    && MAPPE.alleGeschosse(m2)[0].geschoss.name === "EG");
  ok("[#86] Wandinhalte, Lage und Mass sind auch hier vollstaendig da", (() => {
    const gs = MAPPE.alleGeschosse(m2)[0].geschoss;
    return gs.waende.length === 2 && MAPPE.bemassungen(m2, gs.id).length === 1
      && store.holeElement("q-eg1").wandelement.length_mm === 2000
      && store.holeElement("q-eg2").wandelement.length_mm === 1000
      && store.listeElemente().length === 2
      && store.aktivesProjektId() === m2.projekt.id;
  })());
  ok("[#86] ein leerer Projektname wird BENANNT abgewiesen statt erfunden ([P-9])", (() => {
    try {
      ARCHIV.uebernahme(gelesenT, { umfang: ARCHIV.UMFANG_GESCHOSS, geschossId: egOpt.id, neuesProjekt: "  " }, null);
      return false;
    } catch (e) { return /fehlt der Name/.test(e.message); }
  })());
  ok("[#86] ohne Zielprojekt wird ein Geschoss NIE uebernommen ([L-6])", (() => {
    try {
      ARCHIV.uebernahme(gelesenT, { umfang: ARCHIV.UMFANG_GESCHOSS, geschossId: egOpt.id }, null);
      return false;
    } catch (e) { return /Ohne Zielprojekt/.test(e.message) && /außerhalb von Projekten/.test(e.message); }
  })());

  // === Akzeptanztest 3: eine einzelne Wand + ein Fehlerfall ===============
  globalThis.localStorage = new MemStorage();
  const z3 = store.fuegeProjektHinzu("Zielprojekt", { geschoss: "Bestand", hoehe_mm: 2500 });
  const z3Gs = z3.gebaeude[0].geschosse[0].id;
  const u3 = ARCHIV.uebernahme(gelesenT, {
    umfang: ARCHIV.UMFANG_WAND, wandId: "q-og1", zielGeschossId: z3Gs,
  }, store.projektMappe(z3.projekt.id));
  ok("[#86] eine einzelne Wand kommt allein — ohne Nachbarwaende und ohne Planbild",
    u3.waende.length === 1 && u3.waende[0].id === "q-og1" && u3.bilder.length === 0
    && u3.ziel.geschossId === z3Gs && u3.ziel.wandName === "OG-W01");
  ok("[#86] der Dialog sagt VOR der Bestaetigung, dass Lage und Masse nicht mitreisen", (() => {
    const t = ARCHIV.uebernahmeZeilen(u3).concat(u3.hinweise).join(" | ");
    return /ohne Lage/i.test(t) && /NICHT mit/.test(t);
  })());

  const vor3 = roh();
  let grund3 = "";
  try { await store.schreibeArchiv(u3, {}); } catch (e) { grund3 = e.message; }
  ok("[L-13] ein Fehlerfall laesst den Speicher VOLLSTAENDIG unveraendert",
    /ausdrückliche Bestätigung/.test(grund3) && roh() === vor3
    && store.listeElemente().length === 0);

  await store.schreibeArchiv(u3, { ueberschreiben: true });
  const m3 = store.projektMappe(z3.projekt.id);
  ok("[#86] die Wand ist im gewaehlten Zielgeschoss eingetragen — OHNE Lage ([L-1])", (() => {
    const t = MAPPE.findeWand(m3, "q-og1");
    return !!t && t.geschoss.id === z3Gs && t.wand.lage === null
      && store.holeElement("q-og1").wandelement.length_mm === 3000;
  })());
  ok("[#86] weder Quellgeschoss noch fremde Waende noch Masse kommen dabei mit",
    MAPPE.alleGeschosse(m3).length === 1 && store.listeElemente().length === 1
    && MAPPE.bemassungen(m3, z3Gs).length === 0 && store.listeProjekte().length === 1);
  ok("[#86] ohne vorhandenes Zielgeschoss wird die Wand BENANNT abgewiesen", (() => {
    try {
      ARCHIV.uebernahme(gelesenT, { umfang: ARCHIV.UMFANG_WAND, wandId: "q-og1", zielGeschossId: "gs-gibtsnicht" }, null);
      return false;
    } catch (e) { return /Ohne Zielgeschoss/.test(e.message) && /kein Geschoss/.test(e.message); }
  })());

  // --- must 1: dieselbe Teilauswahl an der ARCHIVfassung (projekt.json) ----
  globalThis.localStorage = new MemStorage();
  const zA = store.fuegeProjektHinzu("Archivziel", { geschoss: "Bestand" });
  const gelA = ARCHIV.leseProjektQuelle(eintraege, PARSE);
  const optA = ARCHIV.teilauswahlOptionen(gelA);
  const egA = optA.geschosse.find((g) => g.name === "EG");
  ok("[#86] die Archivfassung bietet dieselbe Teilauswahl an",
    gelA.quelle === ARCHIV.QUELLE_ARCHIV && gelA.fehler.length === 0
    && optA.geschosse.length === 2 && egA.plan === true && egA.bemassungen === 1);
  const uA = ARCHIV.uebernahme(gelA, {
    umfang: ARCHIV.UMFANG_GESCHOSS, geschossId: egA.id,
  }, store.projektMappe(zA.projekt.id));
  ok("[L-8] das Planbild zieht auf die NEUE Geschoss-Kennung um",
    uA.bilder.length === 1 && uA.bilder[0].geschossId === uA.ziel.geschossId
    && uA.bilder[0].geschossId !== egA.id);

  const vorA = roh();
  let grundA = "";
  try {
    await store.schreibeArchiv(uA, { ueberschreiben: true, plan: {
      speicherePlan: () => { throw new Error("Speicher voll (Test)"); },
      holePlan: async () => null, loeschePlan: async () => {},
    } });
  } catch (e) { grundA = e.message; }
  ok("[L-13] faellt der Planspeicher aus, kommt der vorherige Stand vollstaendig zurueck",
    /vollständig wiederhergestellt/.test(grundA) && roh() === vorA
    && store.listeElemente().length === 0
    && MAPPE.alleGeschosse(store.projektMappe(zA.projekt.id)).length === 1);

  const plaene = new Map();
  const ergA = await store.schreibeArchiv(uA, { ueberschreiben: true, plan: {
    speicherePlan: async (id, blob, meta) => { plaene.set(String(id), { blob, ...meta }); },
    holePlan: async (id) => plaene.get(String(id)) || null,
    loeschePlan: async (id) => { plaene.delete(String(id)); },
  } });
  const mA = store.projektMappe(zA.projekt.id);
  const gsA = MAPPE.alleGeschosse(mA).find((t) => t.geschoss.name === "EG").geschoss;
  ok("[#86] auch aus dem vollstaendigen Archiv kommt genau EIN Geschoss an",
    MAPPE.alleGeschosse(mA).length === 2 && gsA.waende.length === 1
    && !!MAPPE.findeWand(mA, "wnd-1") && !MAPPE.findeWand(mA, "wnd-2")
    && store.listeElemente().map((e) => e.id).join() === "wnd-1");
  ok("[L-8]/[L-9] das Bild liegt unter der neuen Kennung, Massstab und Datei bleiben",
    ergA.bilder === 1 && plaene.has(gsA.id) && !plaene.has(egA.id)
    && gsA.plan.datei === "eg.png" && gsA.plan.mm_je_pixel === 12.5);

  // --- must 1/R9: die Strukturdatei geht denselben Weg --------------------
  const strukt = ARCHIV.leseStruktur(exp.dateien.find((d) => /^SEMBLA_Projektmappe_/.test(d.name)).data);
  const optS = ARCHIV.teilauswahlOptionen(strukt);
  ok("[#86] eine Strukturdatei bietet ihre Geschosse an, aber keine einzelne Wand",
    strukt.quelle === ARCHIV.QUELLE_STRUKTUR && optS.geschosse.length === 2 && optS.waende.length === 0);
  ok("[#86] eine Wand ohne beiliegendes Wandelement wird BENANNT abgewiesen ([L-4])", (() => {
    try {
      ARCHIV.uebernahme(strukt, { umfang: ARCHIV.UMFANG_WAND, wandId: "q-og1", zielGeschossId: z3Gs },
        store.projektMappe(zA.projekt.id));
      return false;
    } catch (e) { return /kein Wandelement bei/.test(e.message); }
  })());
  ok("[#86] ein unbekannter Umfang wird abgewiesen statt geraten", (() => {
    try { ARCHIV.uebernahme(gelesenT, { umfang: "alles" }, null); return false; }
    catch (e) { return /Unbekannter Übernahmeumfang/.test(e.message); }
  })());
  ok("[#86] „ganzes Projekt“ bleibt der unveraenderte Weg von zuvor", (() => {
    const u = ARCHIV.uebernahme(gelesenT, { umfang: ARCHIV.UMFANG_PROJEKT });
    return u.mappe === gelesenT.mappe && u.waende === gelesenT.waende
      && u.bilder === gelesenT.bilder && u.fehler === gelesenT.fehler
      && u.hinweise === gelesenT.hinweise && u.ziel.art === ARCHIV.UMFANG_PROJEKT;
  })());
}

// --- Ausgabe --------------------------------------------------------------
let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
