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

// --- Ausgabe --------------------------------------------------------------
let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
