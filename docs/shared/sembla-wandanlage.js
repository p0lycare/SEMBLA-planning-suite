// @ts-check
/**
 * SEMBLA — Neuanlage einer Wand: der EINE Weg von der Produktwahl zum gespeicherten
 * Wandelement (Issues #15/#62).
 *
 * Das Problem, das diese Datei loest: beide Anlageorte (Modul 0 und der Layout-Editor)
 * haben das Wandelement mit `buildWall()` gerechnet und gespeichert, BEVOR die
 * Verwendungsrollen aus dem Katalog vorbelegt waren. Der Core kannte damit keine
 * Standardlaenge, setzte seinen Altstand-Fallback (1100 mm) und schrieb ihn als
 * `rod_mm`, `prestress.rod_lengths_mm` und als reale `segments[].stuecke` fest. Zeichnung
 * (Modul 7) und Baustellenstueckliste (Modul 4) lasen danach korrekt ein bereits falsches
 * JSON; erst eine Aenderung in Modul 1 rechnete es neu.
 *
 * Die Reihenfolge ist deshalb der Kern dieser Datei:
 *   1. Produktrollen aus dem Katalog bestimmen ([P-18]) — noch ohne Speicher,
 *   2. daraus die Vorspann-Vorgaben bilden ([Z-1]/[Z-6]),
 *   3. das Wandelement damit rechnen,
 *   4. Wandelement UND Rollenauswahl in GENAU EINEM `store.speichere()` festschreiben.
 * Es gibt damit keinen Zwischenstand, der je mit dem Altstand-Fallback im Speicher stand
 * oder gemeldet wurde — auch nicht kurzzeitig.
 *
 * Fachlich neu ist nichts: [Z-1] (Standardlaengen nur aus dem Katalog), [Z-2] (Kombination)
 * und [Z-6] (Reststueck am oberen Wandabschluss) gelten unveraendert; die Abbildung
 * Auswahl -> Produktmasse ist dieselbe wie in Modul 1 (`KAT.produktSpezifikation`).
 *
 * Rein/DOM-frei. Der Speicher wird als Abhaengigkeit HEREINGEREICHT (`store`), damit diese
 * Datei nicht an `localStorage` haengt und die Aufruffolge in Tests pruefbar bleibt.
 */

import { buildWall, ROD_OVERHANG } from "./sembla-core.js";
import { produktSpezifikation, produktrollenVorschlag, rollenVonModul } from "./sembla-katalog.js";

/** Verwendungsrollen gehoeren Modul 1 (`planung`) oder Modul 2 (`aufbau`) — sonst nichts. */
const TEIL = { 1: "planung", 2: "aufbau" };

/**
 * Standardauswahl einer NEUEN Wand aus dem Katalog ([P-18]) — als fertiger
 * `eingaben`-Patch, noch ohne jeden Schreibvorgang.
 *
 * Weil die Wand neu ist, sind alle Rollen leer: es kann keine Nutzerentscheidung
 * ueberschrieben werden, und der Patch ist damit dasselbe Ergebnis, das
 * `store.vorbelegeProduktrollen()` an einem frisch angelegten Element liefert — nur eben
 * VOR dem Speichern verfuegbar.
 *
 * @param {any} katalog aktiver Bauteilkatalog oder null/undefined ([L-12])
 * @returns {{patch:any, gesetzt:Record<string,string[]>, offen:string[]}}
 */
export function produktrollenPatch(katalog) {
  const gesetzt = {}, offen = [];
  /** @type {any} */ const patch = {};
  if (!katalog) return { patch, gesetzt, offen };
  const vorschlag = produktrollenVorschlag(katalog);
  const quelle = { name: katalog.name, version: katalog.version };
  for (const r of [...rollenVonModul(1), ...rollenVonModul(2)]) {
    const ids = vorschlag[r.id] || [];
    if (!ids.length) { offen.push(r.id); continue; }
    const teil = TEIL[r.modul];
    if (!patch[teil]) patch[teil] = { produkte: { quelle, rollen: {} } };
    patch[teil].produkte.rollen[r.id] = ids.slice();
    gesetzt[r.id] = ids.slice();
  }
  return { patch, gesetzt, offen };
}

/**
 * Vorspann-Vorgaben aus der wandbezogenen Produktwahl ([Z-1]/[Z-6]).
 *
 * `rod_lengths_mm` wird IMMER gesetzt — auch leer. Genau das ist die Aussage „keine
 * Standardlaenge gewaehlt"; der Core erfindet dann keine (kein 1100-mm-Fallback) und meldet
 * den offenen Zuschnitt sichtbar. Ohne Katalog gilt dasselbe: gemeldet, nicht geraten.
 *
 * @param {any} eingaben `eingaben` der Wand (Quelle von `planung.produkte`, [P-13])
 * @param {any} katalog aktiver Bauteilkatalog oder null/undefined ([L-12])
 * @param {number} [ueberstandMm] Ueberstand des Reststuecks ueber die Wandoberkante ([Z-6])
 * @returns {{rod_lengths_mm:number[],rod_rest_mm:number,rod_overhang_mm:number,
 *            quelle:"katalog"|"keine_auswahl"|"kein_katalog"}}
 */
export function vorspannVorgaben(eingaben, katalog, ueberstandMm = ROD_OVERHANG) {
  const ue = (ueberstandMm != null && +ueberstandMm >= 0) ? +ueberstandMm : ROD_OVERHANG;
  if (!katalog) return { rod_lengths_mm: [], rod_rest_mm: 0, rod_overhang_mm: ue, quelle: "kein_katalog" };
  const spez = produktSpezifikation(eingaben || {}, katalog);
  const laengen = spez.rod.laengen_mm.slice();
  // [Z-6]: genau EIN Reststueckprodukt ergibt eine Laenge; mehrere sind ein Konflikt und
  // lassen sie bewusst offen (`rest_mm === null`) — es wird keines bevorzugt.
  const rest = (spez.rod.rest_mm != null) ? spez.rod.rest_mm : 0;
  return { rod_lengths_mm: laengen, rod_rest_mm: rest, rod_overhang_mm: ue,
           quelle: laengen.length ? "katalog" : "keine_auswahl" };
}

/**
 * Das Wandelement einer Neuanlage rechnen — ohne jeden Speicherzugriff.
 * Getrennt aufrufbar, damit die Rechnung pruefbar ist, ohne dass irgendetwas geschrieben wird.
 *
 * @param {{name:string,laenge_mm:number,hoehe_mm:number,wandtyp:string}} v
 * @param {any} eingaben Rollenauswahl dieser Wand (Ergebnis von `produktrollenPatch`)
 * @param {any} katalog aktiver Bauteilkatalog oder null
 * @returns {{wandelement:any, vorgaben:ReturnType<typeof vorspannVorgaben>}}
 */
export function wandelementNeu(v, eingaben, katalog) {
  const vorgaben = vorspannVorgaben(eingaben, katalog);
  const we = buildWall(v.name, v.laenge_mm, v.hoehe_mm, [], null, vorgaben);
  // Der Wandtyp haengt nicht am Core und wird ausschliesslich bei der Anlage gewaehlt.
  we.wandtyp = v.wandtyp;
  return { wandelement: we, vorgaben };
}

/**
 * Neue Wand anlegen — der gemeinsame Pfad beider Anlageorte (Modul 0 und Layout-Editor).
 *
 * Geschrieben wird GENAU EINMAL, und zwar der fertige Stand: Wandelement samt
 * katalogbasiertem Zuschnitt und die Rollenauswahl in einem Zug. Ein Zwischenstand mit dem
 * Altstand-Fallback des Cores entsteht dabei nicht — weder im Speicher noch in einer Meldung.
 *
 * Wer einen Katalog nachladen will (Modul 0 tut das), muss das VOR diesem Aufruf tun; sonst
 * entstuende die Wand ohne Produktbezug.
 *
 * @param {any} store Speicherschicht (`storage.js`)
 * @param {{name:string,laenge_mm:number,hoehe_mm:number,wandtyp?:string}} v
 * @returns {{id:string, wandelement:any, gesetzt:Record<string,string[]>, offen:string[],
 *            vorgaben:ReturnType<typeof vorspannVorgaben>}}
 */
export function legeWandAn(store, v) {
  const katalog = store.holeKatalog();
  const rollen = produktrollenPatch(katalog);
  const { wandelement, vorgaben } = wandelementNeu(
    { name: v.name, laenge_mm: v.laenge_mm, hoehe_mm: v.hoehe_mm,
      wandtyp: store.normWandtyp(v.wandtyp) }, rollen.patch, katalog);
  // Der EINE Schreibvorgang: Wandelement und Rollenauswahl zusammen ([P-13]/[P-18]).
  const id = store.speichere(v.name, wandelement, undefined, rollen.patch);
  return { id, wandelement, gesetzt: rollen.gesetzt, offen: rollen.offen, vorgaben };
}

/**
 * Kurzer, nutzersichtbarer Zustandstext zum Zuschnitt der neu angelegten Wand.
 * Er benennt, was gilt — und erfindet nie eine Laenge ([Z-1]/[Z-6]).
 * @param {ReturnType<typeof vorspannVorgaben>|null} vorgaben
 */
export function vorspannText(vorgaben) {
  if (!vorgaben) return "";
  if (vorgaben.quelle === "kein_katalog")
    return "ohne Bauteilkatalog kein Gewindestangen-Zuschnitt — er bleibt offen ([Z-1])";
  if (!vorgaben.rod_lengths_mm.length)
    return "keine Gewindestangen-Standardlänge gewählt — der Zuschnitt bleibt offen ([Z-1])";
  const l = vorgaben.rod_lengths_mm.map((x) => x + " mm").join(" · ");
  return "Gewindestangen aus dem Katalog: " + l
    + (vorgaben.rod_rest_mm ? ` · Reststück ${vorgaben.rod_rest_mm} mm ([Z-6])`
                            : " · kein Reststück gewählt ([Z-6])");
}
