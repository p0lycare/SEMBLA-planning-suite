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

// --- Ausgabe --------------------------------------------------------------
let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
