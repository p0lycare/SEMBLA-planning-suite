// @ts-check
/**
 * SEMBLA Projektarchiv — vollstaendiges Projekt als ZIP oder Ordner ([L-13]).
 *
 * Ein Projekt liegt im Browser in DREI getrennten Speichern: Struktur/Lage/
 * Bemassungen in `sembla:projekte`, die Wandelemente in `sembla:elemente`, die
 * Planbilder in der IndexedDB `sembla-plaene`. Wer den Browser wechselt oder die
 * Websitedaten loescht, verliert ohne Archiv zwangslaeufig einen Teil davon.
 * Dieses Modul buendelt genau EINE Projektmappe samt allem, was sie referenziert,
 * zu einem Verzeichnisbaum — und liest ihn deterministisch wieder ein.
 *
 *   SEMBLA_Projekt_<Name>/
 *   ├─ projekt.json                    Projektmappe (SEMBLA-Projektmappe v2)
 *   ├─ waende/<Name>__<wnd-id>.json    je Wand eine gewohnte SEMBLA-Projekt-v2-Datei
 *   └─ plaene/<gs-id>.<png|jpg|webp>   die Planbilder aus der IndexedDB
 *
 * Grundsaetze ([L-13]):
 *
 *  - GENAU EINE MAPPE je Archiv. Ein Archiv ist ein Projekt, nicht ein Speicherabbild.
 *  - Der BAUTEILKATALOG ist NICHT enthalten ([L-12]): er ist eine eigene Ressource
 *    mit eigenem Im-/Export. Im Archiv steht nur seine Referenz (`mappe.katalog`).
 *    Fehlt er im Zielbrowser, wird das benannt — die Referenz bleibt erhalten.
 *  - Zugeordnet wird ueber STABILE IDs ([L-4]). Der Dateiname ist der Fundort, nie
 *    die Identitaet: welche Datei zu welcher Wand gehoert, sagt AUSSCHLIESSLICH das
 *    Feld `wand.datei` der Mappe. Es gibt keinen zweiten Weg (kein Raten aus dem
 *    Dateinamen), und Planbilder liegen unter ihrer Geschoss-Kennung.
 *  - VOLLSTAENDIGE VORABPRUEFUNG: `leseArchiv` deutet, prueft und meldet — es
 *    schreibt nichts. Erst wenn alles zusammenpasst, darf persistiert werden.
 *  - NICHTS WIRD GERATEN: fehlende, doppelte, ungueltige oder ueberzaehlige
 *    Dateien werden benannt, nicht repariert und nicht stillschweigend uebergangen.
 *  - NUR TRANSPORT, KEINE FACHLICHE ABLEITUNG: die Wanddatei reist als GANZES
 *    SEMBLA-Projekt-v2-Objekt (Wandelement samt aller optionalen Felder), die Lage
 *    als Teil der Mappe. Fachliche BEZIEHUNGEN zwischen Waenden werden hier weder
 *    gespeichert noch nachgerechnet — es gibt sie als Datum nicht. Die zulaessige
 *    Wandverzahnung ([K-13.1]) etwa entsteht bei jeder Pruefung und jeder
 *    Ausgabe NEU aus kanonischer Wandlage und den Verzahnungsbereichen des
 *    Wandelements (`pruefeGeschoss`, sembla-constraints.js). Genau deshalb
 *    ueberstehen sie Export, Import und Duplizieren, ohne dass dieses Modul davon
 *    etwas wissen muesste — ein eigenes Beziehungsfeld waere eine zweite Wahrheit.
 *
 * Seit #86 liegt hier ausserdem der EINE Lesepfad des Projektimports: derselbe Dialog
 * liest neben diesem Archiv auch die Projekt-ZIP des zentralen Exports (#67) und die
 * einzelne Mappendatei — s. Abschnitt „Import: die zweite Fassung“ weiter unten.
 *
 * Rein und DOM-frei; eigene Tests (tests/module/test-archiv.mjs) — shared-Regel (b).
 */

import {
  alleGeschosse, alleWaende, benenneUm, findeGebaeude, findeGeschoss, findeWand,
  fuegeGebaeudeHinzu, fuegeGeschossHinzu, geschossMengen, leereMappe, mappeObjekt, neueId, normMappe,
  parseMappe, setzeBemassung, setzeGeschossHoehe, setzePlan, setzeUrsprung, setzeWand,
} from "./sembla-projektmappe.js";
import { katalogObjekt } from "./sembla-katalog.js";
import { dateiRumpf, gesamtDaten, pfadText, umfang } from "./sembla-gesamtstueckliste.js";
import { baueDateien, gesamtstuecklisteDateien, normFassung, stuecklistePositionen, wirksameMengen } from "./sembla-export.js";

/** Name der Mappendatei im Archiv — das Erkennungsmerkmal eines Projektarchivs. */
export const DATEI_MAPPE = "projekt.json";
/** Ordner der Wanddateien (SEMBLA-Projekt v2, unveraendert). */
export const ORDNER_WAENDE = "waende";
/** Ordner der Planbilder ([L-8]: im Betrieb liegen sie in der IndexedDB). */
export const ORDNER_PLAENE = "plaene";

/** Zulaessige Planbildformate ([L-8]) mit ihrer Signatur und Dateiendung. */
const BILDFORMATE = [
  { typ: "image/png", endung: ".png", label: "PNG" },
  { typ: "image/jpeg", endung: ".jpg", label: "JPEG" },
  { typ: "image/webp", endung: ".webp", label: "WebP" },
];

// --- Namen und Pfade ------------------------------------------------------

/**
 * Anzeigename → dateisystemtauglicher Stamm. REIN KOSMETISCH: die Zuordnung
 * laeuft ueber die id, nie ueber diesen Namen ([L-4]).
 * @param {string} name @returns {string}
 */
export function sicherStamm(name) {
  const s = String(name == null ? "" : name).trim()
    .replace(/[^\wäöüÄÖÜß .-]+/g, "_").replace(/\s+/g, "_").replace(/^\.+/, "");
  return s.slice(0, 60) || "Wand";
}

/** Archivpfad einer Wanddatei. @param {{id:string, name?:string}} wand @returns {string} */
export function wandPfad(wand) {
  return `${ORDNER_WAENDE}/${sicherStamm(wand && wand.name)}__${String(wand && wand.id)}.json`;
}

/**
 * Endung eines Planbildes — aus dem MIME-Typ der Mappe, ersatzweise aus der
 * Endung des Originaldateinamens. Ist beides unbrauchbar, wird nichts erfunden:
 * das Bild bekommt die neutrale Endung `.bin` und der Typ steht ohnehin in der
 * Mappe (die beim Import gilt).
 * @param {{typ?:string|null, datei?:string|null}} plan @returns {string}
 */
export function planEndung(plan) {
  const p = plan || {};
  const typ = String(p.typ || "").toLowerCase();
  const treffer = BILDFORMATE.find((f) => f.typ === typ);
  if (treffer) return treffer.endung;
  const name = String(p.datei || "").toLowerCase();
  const i = name.lastIndexOf(".");
  const endung = i < 0 ? "" : name.slice(i);
  return BILDFORMATE.some((f) => f.endung === endung) || endung === ".jpeg" ? endung : ".bin";
}

/** Archivpfad des Planbildes eines Geschosses. @param {string} geschossId @param {any} plan */
export function planPfad(geschossId, plan) {
  return `${ORDNER_PLAENE}/${String(geschossId)}${planEndung(plan)}`;
}

/** Vorschlag fuer den Archivnamen (ZIP-Datei bzw. Wurzelordner). @param {any} mappe */
export function archivName(mappe) {
  return "SEMBLA_Projekt_" + sicherStamm(mappe?.projekt?.name || "Projekt");
}

// --- Bildpruefung ---------------------------------------------------------

/**
 * Bildtyp aus den ersten Bytes bestimmen ([L-13]: „passende Bytes“). `null` =
 * kein zulaessiges Planbild — es wird nichts umgedeutet.
 * @param {Uint8Array} bytes @returns {string|null} MIME-Typ
 */
export function bildTyp(bytes) {
  const b = bytes;
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
    && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return "image/png";
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

// --- Export ---------------------------------------------------------------

/**
 * Was ein vollstaendiges Archiv dieser Mappe braucht — VOR dem Packen, damit
 * Fehlendes gemeldet werden kann statt in einem stillen Teilarchiv zu verschwinden
 * ([L-13]).
 *
 * @param {any} mappe
 * @param {Iterable<string>} vorhandeneWaende Kennungen der Wandelemente im Speicher
 * @param {Iterable<string>} vorhandeneBilder Kennungen der Geschosse mit Planbild
 * @returns {{waende:Array<{id:string,name:string,geschoss:string,pfad:string}>,
 *            plaene:Array<{geschossId:string,name:string,pfad:string,plan:any}>,
 *            fehlendeWaende:Array<{id:string,name:string,geschoss:string}>,
 *            fehlendeBilder:Array<{geschossId:string,name:string,datei:string|null}>}}
 */
export function exportPlan(mappe, vorhandeneWaende, vorhandeneBilder) {
  const m = normMappe(mappe);
  const hatWand = new Set([...(vorhandeneWaende || [])].map(String));
  const hatBild = new Set([...(vorhandeneBilder || [])].map(String));
  const waende = [], fehlendeWaende = [], plaene = [], fehlendeBilder = [];

  for (const { geschoss, wand } of alleWaende(m)) {
    if (hatWand.has(wand.id)) waende.push({ id: wand.id, name: wand.name, geschoss: geschoss.name, pfad: wandPfad(wand) });
    else fehlendeWaende.push({ id: wand.id, name: wand.name, geschoss: geschoss.name });
  }
  for (const { geschoss } of alleGeschosse(m)) {
    if (!geschoss.plan) continue;
    if (hatBild.has(geschoss.id)) {
      plaene.push({ geschossId: geschoss.id, name: geschoss.name, pfad: planPfad(geschoss.id, geschoss.plan), plan: geschoss.plan });
    } else {
      fehlendeBilder.push({ geschossId: geschoss.id, name: geschoss.name, datei: geschoss.plan.datei });
    }
  }
  return { waende, plaene, fehlendeWaende, fehlendeBilder };
}

/**
 * Die Mappensicht des Archivs: wie `mappeObjekt`, aber mit gesetztem `wand.datei`
 * fuer jede Wand, die WIRKLICH im Archiv liegt. Genau dieses Feld ist beim Import
 * die einzige Zuordnung ([L-13]); eine nicht mitgelieferte Wand behaelt `datei:
 * null` und bleibt damit ehrlich als verwaister Eintrag erkennbar ([L-4]).
 *
 * Der gespeicherte Stand bleibt unberuehrt — das hier ist eine reine Exportsicht.
 * @param {any} mappe @param {Array<{id:string,pfad:string}>} waende
 * @returns {object}
 */
export function mappeFuerArchiv(mappe, waende) {
  const pfade = new Map((waende || []).map((w) => [String(w.id), String(w.pfad)]));
  const obj = mappeObjekt(mappe);
  for (const g of obj.gebaeude) {
    for (const gs of g.geschosse) {
      gs.waende = gs.waende.map((w) => ({ ...w, datei: pfade.get(String(w.id)) || null }));
    }
  }
  return obj;
}

/**
 * Die Archivdateien bauen. `wandDaten`/`bildDaten` liefern den Inhalt zu einer
 * Kennung; fehlt einer davon, wird die Datei WEGGELASSEN und das ueber `exportPlan`
 * gemeldet — nie durch einen Platzhalter ersetzt.
 *
 * @param {any} mappe
 * @param {{waende:Array<{id:string,pfad:string}>, plaene:Array<{geschossId:string,pfad:string}>}} plan
 * @param {(id:string) => any} wandDaten  Wand-Kennung → SEMBLA-Projekt-v2-Objekt
 * @param {(geschossId:string) => (Uint8Array|null)} bildDaten
 * @returns {Array<{name:string, data:(string|Uint8Array)}>}
 */
export function archivDateien(mappe, plan, wandDaten, bildDaten) {
  const dateien = [{ name: DATEI_MAPPE, data: JSON.stringify(mappeFuerArchiv(mappe, plan.waende), null, 2) }];
  for (const w of plan.waende) {
    const obj = wandDaten(w.id);
    if (!obj) throw new Error(`Wanddatei „${w.pfad}“ konnte nicht erzeugt werden — Wandelement „${w.id}“ fehlt.`);
    dateien.push({ name: w.pfad, data: JSON.stringify(obj, null, 2) });
  }
  for (const p of plan.plaene) {
    const bytes = bildDaten(p.geschossId);
    if (!bytes) throw new Error(`Planbild „${p.pfad}“ konnte nicht gelesen werden (Geschoss „${p.geschossId}“).`);
    dateien.push({ name: p.pfad, data: bytes });
  }
  return dateien;
}

// --- Import: Pfade normalisieren ------------------------------------------

/**
 * Einen Archivpfad normalisieren und auf Unfug pruefen. Zurueck kommt der reine
 * relative Pfad — oder ein Fehlertext. Abgewiesen werden absolute Pfade,
 * Laufwerksbuchstaben und jede Form von `..` (Traversal): ein Archiv darf nur
 * beschreiben, was IN ihm liegt.
 * @param {string} roh @returns {{pfad:string}|{fehler:string}}
 */
export function normPfad(roh) {
  const s = String(roh == null ? "" : roh).replace(/\\/g, "/").trim();
  if (!s) return { fehler: "Eintrag ohne Namen." };
  if (s.startsWith("/")) return { fehler: `Absoluter Pfad „${roh}“ — Archive dürfen nur relative Pfade enthalten.` };
  if (/^[a-zA-Z]:\//.test(s)) return { fehler: `Pfad mit Laufwerksangabe „${roh}“ — Archive dürfen nur relative Pfade enthalten.` };
  const teile = s.split("/").filter((t) => t !== "" && t !== ".");
  if (teile.some((t) => t === "..")) return { fehler: `Pfad „${roh}“ verlässt das Archiv (..) und wird abgewiesen.` };
  if (!teile.length) return { fehler: `Pfad „${roh}“ benennt keine Datei.` };
  return { pfad: teile.join("/") };
}

/** Systemmuell, den Packprogramme beilegen — ueberzaehlig, aber kein Fehler. */
function _istBeiwerk(pfad) {
  return /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i.test(pfad);
}

/**
 * Den gemeinsamen Wurzelordner bestimmen (ein ZIP/Ordner traegt ihn ueblicherweise).
 * Massgebend ist der Fundort von `projekt.json` — nicht ein geratener Praefix.
 * @param {string[]} pfade @returns {{wurzel:string}|{fehler:string}}
 */
export function findeWurzel(pfade) {
  const treffer = pfade.filter((p) => p === DATEI_MAPPE || p.endsWith("/" + DATEI_MAPPE));
  if (!treffer.length) {
    return { fehler: `Keine „${DATEI_MAPPE}“ gefunden — das ist kein SEMBLA-Projektarchiv. `
      + "Eine einzelne Wanddatei gehört in den Wandimport, ein Bauteilkatalog in den Katalogimport." };
  }
  if (treffer.length > 1) {
    return { fehler: `Mehrere „${DATEI_MAPPE}“ gefunden (${treffer.join(", ")}). Ein Archiv enthält `
      + "genau ein Projekt ([L-13]); welches gemeint ist, wird nicht geraten." };
  }
  const p = treffer[0];
  return { wurzel: p === DATEI_MAPPE ? "" : p.slice(0, p.length - DATEI_MAPPE.length) };
}

/**
 * Die Eintraege einer Quelle zu einer Pfad→Inhalt-Abbildung normalisieren.
 * Gemeinsamer Schritt 1 ALLER Importfassungen: absolute Pfade, Laufwerksbuchstaben,
 * Traversal und doppelte Pfade werden BENANNT abgewiesen, nie repariert.
 * @param {Array<{name:string, data:(string|Uint8Array)}>} eintraege
 * @param {string[]} fehler Sammelliste (wird ergaenzt)
 * @param {string} wort Bezeichnung der Quelle fuer die Meldung
 * @returns {Map<string, string|Uint8Array>}
 */
function _sammleRoh(eintraege, fehler, wort) {
  /** @type {Map<string, string|Uint8Array>} */
  const roh = new Map();
  for (const e of (eintraege || [])) {
    const r = normPfad(e && e.name);
    if ("fehler" in r) { fehler.push(r.fehler); continue; }
    if (roh.has(r.pfad)) { fehler.push(`Der Pfad „${r.pfad}“ kommt im ${wort} mehrfach vor.`); continue; }
    roh.set(r.pfad, e.data);
  }
  return roh;
}

// --- Import: lesen und pruefen (schreibt NICHTS) ---------------------------

/** Strukturpruefung einer Wanddatei, falls der Aufrufer keinen Parser stellt. */
function _standardWandParser(obj) {
  if (!obj || obj.format !== "SEMBLA-Projekt") throw new Error("keine SEMBLA-Projekt-Datei");
  if (+obj.version !== 2) throw new Error(`Formatversion 2 erwartet (gefunden: ${obj.version ?? "—"})`);
  const we = obj.wandelement;
  if (!we || typeof we !== "object" || !("length_mm" in we) || !Array.isArray(we.courses)) {
    throw new Error("kein Wandelement (length_mm/courses fehlen)");
  }
  return { name: String(obj.name || we.name || "Wand"), wandelement: we, eingaben: obj.eingaben };
}

function _text(data) {
  if (typeof data === "string") return data;
  return new TextDecoder("utf-8").decode(data);
}

/**
 * Ein Archiv lesen, deuten und VOLLSTAENDIG pruefen — ohne irgendetwas zu
 * schreiben ([L-13]). Alles, was einem sauberen Import im Weg steht, kommt als
 * gesammelte Fehlerliste zurueck (`fehler`); nur Harmloses steht in `hinweise`
 * bzw. `ueberzaehlig`.
 *
 * @param {Array<{name:string, data:(string|Uint8Array)}>} eintraege
 * @param {{parseWand?:(obj:any)=>{name:string,wandelement:any,eingaben?:any}}} [opt]
 * @returns {{mappe:object|null, waende:Array<{id:string,name:string,wandelement:any,eingaben:any,pfad:string}>,
 *            bilder:Array<{geschossId:string,bytes:Uint8Array,typ:string,pfad:string,plan:any}>,
 *            ueberzaehlig:string[], hinweise:string[], fehler:string[]}}
 */
export function leseArchiv(eintraege, opt) {
  const parseWand = (opt && opt.parseWand) || _standardWandParser;
  /** @type {string[]} */ const fehler = [];
  /** @type {string[]} */ const hinweise = [];
  /** @type {string[]} */ const ueberzaehlig = [];
  const leer = { mappe: null, waende: [], bilder: [], ueberzaehlig, hinweise, fehler };

  // (1) Pfade normalisieren, Doppelungen und Traversal abweisen.
  const roh = _sammleRoh(eintraege, fehler, "Archiv");
  if (!roh.size) { fehler.push("Das Archiv enthält keine lesbaren Dateien."); return leer; }

  // (2) Wurzelordner bestimmen — der Fundort von projekt.json entscheidet.
  const w = findeWurzel([...roh.keys()]);
  if ("fehler" in w) { fehler.push(w.fehler); return leer; }
  /** @type {Map<string, string|Uint8Array>} */
  const dateien = new Map();
  for (const [p, d] of roh) {
    if (w.wurzel && !p.startsWith(w.wurzel)) {
      if (!_istBeiwerk(p)) ueberzaehlig.push(p);
      continue;
    }
    const rel = w.wurzel ? p.slice(w.wurzel.length) : p;
    if (_istBeiwerk(rel)) continue;
    dateien.set(rel, d);
  }

  // (3) Die Mappe deuten — streng, ueber den EINEN vorhandenen Mappenparser.
  let mappe = null;
  try {
    mappe = parseMappe(_text(dateien.get(DATEI_MAPPE)));
  } catch (e) {
    fehler.push(`${DATEI_MAPPE}: ${e && e.message ? e.message : e}`);
    return leer;
  }
  const benutzt = new Set([DATEI_MAPPE]);

  // (4) Wanddateien — zugeordnet AUSSCHLIESSLICH ueber `wand.datei` ([L-13]).
  const waende = [];
  const gesehen = new Set();
  for (const { geschoss, wand } of alleWaende(mappe)) {
    if (gesehen.has(wand.id)) { fehler.push(`Wandkennung „${wand.id}“ kommt mehrfach vor.`); continue; }
    gesehen.add(wand.id);
    if (!wand.datei) {
      hinweise.push(`„${wand.name || wand.id}“ (${geschoss.name}) liegt dem Archiv nicht bei — der `
        + "Eintrag bleibt verwaist und wird nach dem Import gemeldet ([L-4]).");
      continue;
    }
    const r = normPfad(wand.datei);
    if ("fehler" in r) { fehler.push(`Wand „${wand.name || wand.id}“: ${r.fehler}`); continue; }
    if (benutzt.has(r.pfad)) {
      fehler.push(`Die Datei „${r.pfad}“ ist gleich mehreren Wänden zugeordnet — das wird nicht aufgelöst.`);
      continue;
    }
    if (!dateien.has(r.pfad)) {
      fehler.push(`Die Wanddatei „${r.pfad}“ fehlt im Archiv (Wand „${wand.name || wand.id}“, ${geschoss.name}).`);
      continue;
    }
    benutzt.add(r.pfad);
    try {
      const obj = JSON.parse(_text(dateien.get(r.pfad)));
      const p = parseWand(obj);
      waende.push({ id: wand.id, name: wand.name || p.name, wandelement: p.wandelement, eingaben: p.eingaben, pfad: r.pfad });
    } catch (e) {
      fehler.push(`Wanddatei „${r.pfad}“ ist unbrauchbar: ${e && e.message ? e.message : e}`);
    }
  }

  // (5) Planbilder — je Geschoss genau eines, gefunden ueber die Geschoss-Kennung.
  const bilder = [];
  const imOrdner = [...dateien.keys()].filter((p) => p.startsWith(ORDNER_PLAENE + "/"));
  for (const { geschoss } of alleGeschosse(mappe)) {
    if (!geschoss.plan) continue;
    const treffer = imOrdner.filter((p) => {
      const rest = p.slice(ORDNER_PLAENE.length + 1);
      const i = rest.lastIndexOf(".");
      return (i < 0 ? rest : rest.slice(0, i)) === geschoss.id;
    });
    if (!treffer.length) {
      fehler.push(`Das Planbild von Geschoss „${geschoss.name}“ fehlt im Archiv `
        + `(erwartet: ${planPfad(geschoss.id, geschoss.plan)}).`);
      continue;
    }
    if (treffer.length > 1) {
      fehler.push(`Für Geschoss „${geschoss.name}“ liegen mehrere Planbilder im Archiv `
        + `(${treffer.join(", ")}) — welches gilt, wird nicht geraten.`);
      continue;
    }
    const pfad = treffer[0];
    benutzt.add(pfad);
    const d = dateien.get(pfad);
    const bytes = (typeof d === "string") ? new TextEncoder().encode(d) : d;
    const typ = bildTyp(bytes);
    if (!typ) {
      fehler.push(`„${pfad}“ ist kein zulässiges Planbild (erlaubt sind `
        + `${BILDFORMATE.map((f) => f.label).join(", ")}) — der Inhalt wird nicht umgedeutet ([L-8]).`);
      continue;
    }
    if (geschoss.plan.typ && String(geschoss.plan.typ).toLowerCase() !== typ) {
      fehler.push(`„${pfad}“ ist ${typ}, die Mappe nennt aber ${geschoss.plan.typ} — `
        + "der Widerspruch wird gemeldet, nicht aufgelöst.");
      continue;
    }
    bilder.push({ geschossId: geschoss.id, bytes, typ, pfad, plan: geschoss.plan });
  }

  // (6) Alles Uebrige benennen — stillschweigend ignoriert wird nichts.
  for (const p of dateien.keys()) if (!benutzt.has(p)) ueberzaehlig.push(p);
  ueberzaehlig.sort();

  return { mappe, waende, bilder, ueberzaehlig, hinweise, fehler };
}

/**
 * Kurzfassung des Prueferergebnisses fuer die Oberflaeche — eine Zeile je Punkt,
 * in fester Reihenfolge (gleiche Eingabe ⇒ gleicher Bericht).
 * @param {ReturnType<typeof leseArchiv>} gelesen
 * @returns {string[]}
 */
export function berichtZeilen(gelesen) {
  const z = [];
  if (gelesen.quelle && QUELLE_TEXT[gelesen.quelle]) z.push("Erkannt: " + QUELLE_TEXT[gelesen.quelle]);
  if (gelesen.mappe) {
    z.push(`Projekt „${gelesen.mappe.projekt.name}“ · ${alleGeschosse(gelesen.mappe).length} Geschoss(e) · `
      + `${gelesen.waende.length} Wanddatei(en) · ${gelesen.bilder.length} Planbild(er)`);
    // Was genau uebernommen wuerde — NAMENTLICH, damit die Bestaetigung eine
    // Entscheidung ist und keine Zustimmung zu einer Zahl (#86).
    const gs = alleGeschosse(gelesen.mappe).map((t) => t.geschoss.name || t.geschoss.id);
    if (gs.length) z.push(`Geschosse (${gs.length}): ${gs.join(", ")}`);
    const wn = (gelesen.waende || []).map((w) => w.name || w.id);
    z.push(`Wände mit Wandelement (${wn.length})` + (wn.length ? `: ${wn.join(", ")}` : " — keine"));
    z.push(gelesen.mappe.katalog
      ? `Bauteilkatalog (Kennung): ${gelesen.mappe.katalog} — er ist eine eigene Ressource, reist nie `
        + "mit und wird getrennt über den Katalogimport geladen ([L-12])."
      : "Bauteilkatalog: dem Projekt ist keiner zugeordnet ([L-12]).");
  }
  for (const h of gelesen.hinweise) z.push(h);
  if (gelesen.ueberzaehlig.length) {
    z.push(`${gelesen.ueberzaehlig.length} Datei(en) im Archiv gehören zu keinem Eintrag der Mappe und `
      + `werden nicht importiert: ${gelesen.ueberzaehlig.join(", ")}`);
  }
  return z;
}

// --- Import: die zweite Fassung — Projekt-ZIP des zentralen Exports (#86) ---
//
// Modul 0 erzeugt seit #67 ZWEI verschiedene Projekt-ZIPs, hatte aber nur fuer eine
// davon einen Importweg: das vollstaendige Archiv mit `projekt.json` ([L-13]). Die ZIP
// des zentralen Exports traegt bewusst KEINE `projekt.json` (s. Kommentar dort) und
// ihre Mappe fuehrt in `wand.datei` durchgehend `null` — beim Archivimport wird sie
// deshalb schon an der Wurzelsuche abgewiesen, und selbst danach waere keine einzige
// Wand zuzuordnen. Genau diese zweite Fassung wird hier gelesen.
//
// Unterschiede zur Archivfassung — und WARUM sie zulaessig sind:
//
//  - ERKANNT WIRD AM INHALT, nicht am Dateinamen: jede `*.json` wird gedeutet und ueber
//    ihr Feld `format` eingeordnet. Ein umbenanntes ZIP aendert daran nichts.
//  - ZUGEORDNET WIRD UEBER DIE WAND-KENNUNG, nie ueber den Anzeigenamen. Die Wanddatei
//    (SEMBLA-Projekt v2) fuehrt selbst keine Kennung — die Exportseite bleibt unveraendert,
//    also steht sie ausschliesslich im ARCHIVPFAD `waende/<Stamm>__<id>.json`, den
//    `wandPfad()` deterministisch erzeugt. Der Pfad ist damit hier der Traeger der
//    Zuordnung, so wie es in der Archivfassung `wand.datei` ist; der NAME davor ist
//    weiterhin reine Kosmetik und wird nie ausgewertet.
//  - PLANBILDER sind in dieser Fassung NIE enthalten (sie liegen in der Bilddatenbank,
//    [L-8], und der zentrale Export packt sie nicht ein). Ein fehlendes Bild ist deshalb
//    ein HINWEIS und kein Fehler — anders als im Archiv, wo ein angekuendigtes, aber
//    fehlendes Bild ein echter Mangel ist. Massstab und Versatz bleiben erhalten.
//  - DER BAUTEILKATALOG wird auch dann nicht uebernommen, wenn seine Datei im ZIP liegt
//    ([L-12]): er ist eine eigene Ressource mit eigenem Importweg. Er wird benannt.
//
// Gleich bleibt alles Uebrige: geprueft wird VOLLSTAENDIG und OHNE zu schreiben, das
// Ergebnis hat dieselbe Form wie `leseArchiv` und laeuft durch denselben Schreibweg
// (`store.schreibeArchiv` mit Konfliktbestaetigung und vollstaendigem Ruecksprung).

/** Vollstaendiges Projektarchiv ([L-13]) — Erkennungsmerkmal `projekt.json`. */
export const QUELLE_ARCHIV = "archiv";
/** Projekt-ZIP des zentralen Exports (#67) — Mappendatei, Geschossdaten, Wanddateien. */
export const QUELLE_EXPORT = "export";
/** Einzelne Mappendatei ([L-13]: „nur Struktur (JSON)“) — ohne Waende und Bilder. */
export const QUELLE_STRUKTUR = "struktur";

/** Klartext der erkannten Fassung fuer den Pruefbericht. */
export const QUELLE_TEXT = {
  [QUELLE_ARCHIV]: "vollständiges Projektarchiv (projekt.json, Wanddateien, Planbilder)",
  [QUELLE_EXPORT]: "Projekt-ZIP des zentralen Exports (Mappendatei, Geschossdaten, Wanddateien)",
  [QUELLE_STRUKTUR]: "nur Struktur (JSON) — Projektmappe ohne Wandelemente und Planbilder",
};

/**
 * Die Wand-Kennung aus dem Archivpfad einer Wanddatei (`waende/<Stamm>__<id>.json`).
 * `null` = keine Kennung im Pfad — dann wird NICHTS geraten (schon gar nicht der Name).
 * @param {string} pfad @returns {string|null}
 */
export function wandIdAusPfad(pfad) {
  const basis = String(pfad == null ? "" : pfad).split("/").pop() || "";
  const ohne = basis.replace(/\.json$/i, "");
  const i = ohne.lastIndexOf("__");
  if (i < 0) return null;
  const id = ohne.slice(i + 2).trim();
  return id || null;
}

/** Liegt in der Quelle eine `projekt.json`? Dann ist es die Archivfassung ([L-13]). */
export function istArchivQuelle(eintraege) {
  for (const e of (eintraege || [])) {
    const r = normPfad(e && e.name);
    if ("fehler" in r) continue;
    if (r.pfad === DATEI_MAPPE || r.pfad.endsWith("/" + DATEI_MAPPE)) return true;
  }
  return false;
}

/** Ist der Pfad eine Geschoss-Teilmappe (`geschosse/…json`) statt der vollen Mappe? */
function _istTeilmappe(pfad) {
  return new RegExp(`(^|/)${ORDNER_GESCHOSSE}/[^/]+$`).test(pfad);
}

/**
 * Die Projekt-ZIP des zentralen Exports lesen, deuten und VOLLSTAENDIG pruefen —
 * ohne irgendetwas zu schreiben. Rueckgabeform identisch zu `leseArchiv`.
 * @param {Array<{name:string, data:(string|Uint8Array)}>} eintraege
 * @param {{parseWand?:(obj:any)=>{name:string,wandelement:any,eingaben?:any}}} [opt]
 */
export function leseExport(eintraege, opt) {
  const parseWand = (opt && opt.parseWand) || _standardWandParser;
  /** @type {string[]} */ const fehler = [];
  /** @type {string[]} */ const hinweise = [];
  /** @type {string[]} */ const ueberzaehlig = [];
  const leer = { quelle: QUELLE_EXPORT, mappe: null, waende: [], bilder: [], ueberzaehlig, hinweise, fehler };

  const dateien = _sammleRoh(eintraege, fehler, "Projekt");
  if (!dateien.size) { fehler.push("Die Quelle enthält keine lesbaren Dateien."); return leer; }

  // (1) Klassifizieren — am Feld `format`, nie am Dateinamen.
  const benutzt = new Set();
  const uebrig = (p) => { benutzt.add(p); ueberzaehlig.push(p); };
  /** @type {Array<{pfad:string, obj:any}>} */ const mappen = [];
  /** @type {Array<{pfad:string, obj:any}>} */ const wanddateien = [];
  /** @type {string[]} */ const kataloge = [];
  for (const [pfad, data] of dateien) {
    if (_istBeiwerk(pfad)) { benutzt.add(pfad); continue; }
    if (!/\.json$/i.test(pfad)) { uebrig(pfad); continue; }
    let obj = null;
    try { obj = JSON.parse(_text(data)); } catch { obj = null; }
    const format = (obj && typeof obj === "object") ? obj.format : null;
    if (format === "SEMBLA-Projektmappe") mappen.push({ pfad, obj });
    else if (format === "SEMBLA-Projekt") wanddateien.push({ pfad, obj });
    else if (format === "SEMBLA-Bauteilkatalog") {
      benutzt.add(pfad);
      kataloge.push(pfad);
      hinweise.push(`Die Bauteilkatalogdatei „${pfad}“ wird NICHT mit importiert: der Katalog ist eine `
        + "eigene Ressource mit eigenem Importweg ([L-12]). Die Zuordnung des Projekts bleibt erhalten; "
        + "der Katalog ist getrennt über „Bauteilkatalog → Katalog importieren…“ zu laden.");
    } else uebrig(pfad);
  }

  // (2) Ohne Mappe gibt es kein Projekt — der GRUND wird benannt, nicht pauschal abgewiesen.
  if (!mappen.length) {
    if (wanddateien.length) {
      fehler.push(`Diese Quelle enthält ${wanddateien.length} Wanddatei(en), aber keine Projektmappe — `
        + "das ist ein Wand-Export. Eine einzelne Wand gehört in den Wandimport (Wand → „Wand hinzufügen…“), "
        + "nicht in den Projektimport.");
    } else if (kataloge.length) {
      fehler.push("Diese Quelle enthält nur einen Bauteilkatalog — er gehört in den Katalogimport ([L-12]).");
    } else {
      fehler.push(`Keine Projektdaten erkannt: weder eine „${DATEI_MAPPE}“ (vollständiges Projektarchiv) `
        + "noch eine Projektmappendatei (SEMBLA-Projektmappe) ist enthalten.");
    }
    return leer;
  }

  // (3) Die LEITMAPPE: die volle Mappe schlaegt die Geschoss-Teilmappen. Mehrere
  //     gleichrangige werden BENANNT — zusammengefuehrt wird nichts ([L-13]).
  const voll = mappen.filter((m) => !_istTeilmappe(m.pfad));
  const kandidaten = voll.length ? voll : mappen;
  if (kandidaten.length > 1) {
    fehler.push("Mehrere gleichrangige Projektmappen gefunden ("
      + kandidaten.map((m) => m.pfad).sort().join(", ")
      + ") — welche das Projekt beschreibt, wird nicht geraten und es wird nichts zusammengeführt.");
    return leer;
  }
  const leit = kandidaten[0];
  const leitId = String(leit.obj?.projekt?.id ?? "");
  const fremd = mappen.filter((m) => m !== leit && String(m.obj?.projekt?.id ?? "") !== leitId);
  if (fremd.length) {
    fehler.push(`Die Datei(en) ${fremd.map((m) => `„${m.pfad}“`).join(", ")} beschreiben ein anderes `
      + "Projekt als die Mappe — eine Quelle enthält genau ein Projekt; welches gilt, wird nicht geraten.");
    return leer;
  }

  // (4) Die Mappe deuten — ueber DENSELBEN einen Mappenparser wie ueberall.
  let mappe = null;
  try { mappe = parseMappe(_text(dateien.get(leit.pfad))); }
  catch (e) { fehler.push(`${leit.pfad}: ${e && e.message ? e.message : e}`); return leer; }
  benutzt.add(leit.pfad);
  for (const m of mappen) {
    if (m === leit) continue;
    benutzt.add(m.pfad);
    hinweise.push(`Die Geschossdatei „${m.pfad}“ beschreibt einen Ausschnitt desselben Projekts und wird `
      + `nicht getrennt übernommen — maßgebend ist „${leit.pfad}“.`);
  }

  // (5) Wanddateien — zugeordnet AUSSCHLIESSLICH ueber die Kennung im Archivpfad (#86).
  /** @type {Map<string, {pfad:string, obj:any}>} */ const nachId = new Map();
  for (const w of wanddateien) {
    const id = wandIdAusPfad(w.pfad);
    if (!id) {
      fehler.push(`Der Wanddatei „${w.pfad}“ fehlt die Wandkennung im Pfad (erwartet `
        + `„${ORDNER_WAENDE}/<Name>__<Kennung>.json“) — zugeordnet wird ausschließlich über die `
        + "Kennung, nie über den Namen.");
      continue;
    }
    const vorher = nachId.get(id);
    if (vorher) {
      fehler.push(`Die Wandkennung „${id}“ kommt in mehreren Dateien vor („${vorher.pfad}“, `
        + `„${w.pfad}“) — das wird nicht aufgelöst.`);
      continue;
    }
    nachId.set(id, w);
  }

  const waende = [];
  const gesehen = new Set();
  for (const { geschoss, wand } of alleWaende(mappe)) {
    if (gesehen.has(wand.id)) { fehler.push(`Wandkennung „${wand.id}“ kommt mehrfach vor.`); continue; }
    gesehen.add(wand.id);
    const treffer = nachId.get(wand.id);
    if (!treffer) {
      hinweise.push(`„${wand.name || wand.id}“ (${geschoss.name}) liegt der Datei nicht bei — der `
        + "Eintrag bleibt verwaist und wird nach dem Import gemeldet ([L-4]).");
      continue;
    }
    benutzt.add(treffer.pfad);
    try {
      const p = parseWand(treffer.obj);
      waende.push({ id: wand.id, name: wand.name || p.name, wandelement: p.wandelement,
                    eingaben: p.eingaben, pfad: treffer.pfad });
    } catch (e) {
      fehler.push(`Wanddatei „${treffer.pfad}“ ist unbrauchbar: ${e && e.message ? e.message : e}`);
    }
  }

  // (6) Planbilder: in dieser Fassung NIE enthalten — Hinweis, kein Fehler.
  const mitPlan = alleGeschosse(mappe).filter((t) => t.geschoss.plan);
  if (mitPlan.length) {
    hinweise.push(`Planbild(er) sind in einer Projekt-ZIP des zentralen Exports nie enthalten (sie liegen `
      + `in der Bilddatenbank des Browsers, [L-8]): ${mitPlan.map((t) => t.geschoss.name || t.geschoss.id).join(", ")}. `
      + "Maßstab und Versatz bleiben erhalten, das Bild ist im Geschosseditor erneut zu hinterlegen. "
      + "Im vollständigen Projektarchiv wäre dasselbe ein Fehler ([L-13]) — hier ist es keiner.");
  }

  // (7) Alles Uebrige benennen — stillschweigend ignoriert wird nichts.
  for (const p of dateien.keys()) if (!benutzt.has(p)) ueberzaehlig.push(p);
  ueberzaehlig.sort();

  return { quelle: QUELLE_EXPORT, mappe, waende, bilder: [], ueberzaehlig, hinweise, fehler };
}

/**
 * Die dritte Quelle: eine einzelne Mappendatei ([L-13]: „nur Struktur (JSON)“).
 * Sie traegt keine Wandelemente und keine Planbilder — genau das wird gesagt, statt
 * es als vollstaendigen Projektstand auszugeben. Rueckgabeform wie oben.
 * @param {string} text @returns {ReturnType<typeof leseExport>}
 */
export function leseStruktur(text) {
  /** @type {string[]} */ const fehler = [];
  /** @type {string[]} */ const hinweise = [];
  /** @type {string[]} */ const ueberzaehlig = [];
  let mappe = null;
  try { mappe = parseMappe(String(text == null ? "" : text)); }
  catch (e) {
    fehler.push(e && e.message ? e.message : String(e));
    return { quelle: QUELLE_STRUKTUR, mappe: null, waende: [], bilder: [], ueberzaehlig, hinweise, fehler };
  }
  const w = alleWaende(mappe);
  if (w.length) {
    hinweise.push(`Diese Datei enthält nur die Struktur: ${w.length} Wandeintrag/-einträge kommen OHNE `
      + `Wandelement und bleiben nach dem Import verwaist ([L-4]) — ${w.map((t) => t.wand.name || t.wand.id).join(", ")}. `
      + "Die Wandelemente sind getrennt zu importieren.");
  }
  const mitPlan = alleGeschosse(mappe).filter((t) => t.geschoss.plan);
  if (mitPlan.length) {
    hinweise.push("Planbilder sind in einer Strukturdatei nie enthalten ([L-8]) — Maßstab und Versatz "
      + `bleiben erhalten, das Bild ist im Geschosseditor erneut zu hinterlegen: ${mitPlan.map((t) => t.geschoss.name || t.geschoss.id).join(", ")}.`);
  }
  return { quelle: QUELLE_STRUKTUR, mappe, waende: [], bilder: [], ueberzaehlig, hinweise, fehler };
}

/**
 * DER eine Lesepfad des Projektimports (#86): erkennt die Fassung und deutet sie.
 * ZIP-Datei und Ordner sind gleichwertige Quellen desselben Weges — beide liefern
 * dieselbe Eintragsliste, und beide Fassungen liefern dasselbe Pruefergebnis.
 * @param {Array<{name:string, data:(string|Uint8Array)}>} eintraege
 * @param {{parseWand?:(obj:any)=>{name:string,wandelement:any,eingaben?:any}}} [opt]
 */
export function leseProjektQuelle(eintraege, opt) {
  if (istArchivQuelle(eintraege)) return { quelle: QUELLE_ARCHIV, ...leseArchiv(eintraege, opt) };
  return leseExport(eintraege, opt);
}

// --- Import: Teilauswahl der Uebernahme (#86) ------------------------------
//
// Gelesen und GEPRUEFT wird immer die GANZE Datei (s. o.); die Teilauswahl schraenkt
// ausschliesslich die UEBERNAHME ein. Sie sitzt deshalb ZWISCHEN Pruefergebnis und
// Schreibweg und liefert wieder ein Objekt in genau der Form von `leseArchiv`. Damit
// laeuft jede Auswahl durch DENSELBEN einen Schreibweg (`store.schreibeArchiv` mit
// Konfliktbestaetigung, Momentaufnahme und vollstaendigem Ruecksprung) und dieselbe
// Konfliktpruefung (`store.archivKonflikte`) — es gibt keinen zweiten Importpfad und
// keinen zweiten Umfangsbegriff.
//
// Grundsaetze:
//
//  - EIN GESCHOSS GIBT ES NUR IM PROJEKT (Entscheid 2026-08-17): das gewaehlte Geschoss
//    wird einem BESTEHENDEN Projekt zugeordnet oder einem im selben Uebernahmeschritt
//    neu angelegten hinzugefuegt. Ohne ausdrueckliches Ziel wird abgewiesen — nie still
//    einsortiert.
//  - ZIELSTRUKTUR NUR UEBER DIE BESTEHENDEN REINEN OPERATIONEN der Projektmappe
//    (`leereMappe`/`fuegeGeschossHinzu`/`setzeWand`/`setzeUrsprung`/`setzePlan`/
//    `setzeBemassung`). Hier wird keine Struktur von Hand zusammengesetzt, sonst gaebe
//    es eine zweite Strukturwahrheit neben `sembla-projektmappe.js`.
//  - WANDKENNUNGEN BLEIBEN UNVERAENDERT ([L-4]): sie sind die Zuordnung zum Wandelement.
//    GESCHOSS- und BEMASSUNGSkennung bekommen dagegen eine NEUE Kennung. Grund: die
//    Geschoss-Kennung ist ueber ALLE Projekte hinweg der Schluessel der Planbild-
//    Datenbank ([L-8]), `validiereMappe` prueft Eindeutigkeit aber nur INNERHALB einer
//    Mappe — eine mitgenommene Quellkennung koennte also unsichtbar das Planbild eines
//    fremden Projekts treffen. Und `setzeBemassung` ersetzt nach Kennung: mit den
//    Quellkennungen ueberschriebe ein zweiter Import desselben Geschosses fremde Masse.
//  - GEPRUEFT BLEIBT GEPRUEFT: `fehler` reist UNVERAENDERT mit. Ein Fehler der Quelle
//    sperrt damit auch jede Teiluebernahme — sonst liesse sich aus einer kaputten Datei
//    ein Ausschnitt herausholen, den niemand geprueft hat.

/** Umfaenge der Uebernahme — mehr bietet der Dialog nicht an. */
export const UMFANG_PROJEKT = "projekt";
export const UMFANG_GESCHOSS = "geschoss";
export const UMFANG_WAND = "wand";
export const UMFAENGE = [UMFANG_PROJEKT, UMFANG_GESCHOSS, UMFANG_WAND];

/** Klartext der Umfaenge fuer Dialog und Bericht. */
export const UMFANG_TEXT = {
  [UMFANG_PROJEKT]: "das ganze Projekt",
  [UMFANG_GESCHOSS]: "ein einzelnes Geschoss",
  [UMFANG_WAND]: "eine einzelne Wand",
};

/**
 * Was die gepruefte Quelle zur Auswahl anbietet. REIN BESCHREIBEND: es wird nichts
 * geschrieben und nichts vorausgewaehlt.
 *
 * Bei den Waenden stehen nur die mit BEILIEGENDEM Wandelement — zu einem blossen
 * Eintrag gibt es nichts zu uebernehmen, er waere nach dem Import verwaist ([L-4]).
 * Bei einer Strukturdatei („nur Struktur (JSON)“) ist die Liste deshalb leer; das
 * benennt der Dialog, statt einen Weg vorzutaeuschen, den es nicht gibt.
 *
 * @param {{mappe:object|null, waende?:Array<{id:string}>}} gelesen
 * @returns {{geschosse:Array<{id:string,name:string,gebaeude:string,waende:number,
 *            elemente:number,bemassungen:number,plan:boolean}>,
 *            waende:Array<{id:string,name:string,geschoss:string}>}}
 */
export function teilauswahlOptionen(gelesen) {
  if (!gelesen || !gelesen.mappe) return { geschosse: [], waende: [] };
  const m = normMappe(gelesen.mappe);
  const mitElement = new Set((gelesen.waende || []).map((w) => String(w.id)));
  const geschosse = alleGeschosse(m).map(({ gebaeude, geschoss }) => ({
    id: geschoss.id,
    name: geschoss.name || geschoss.id,
    gebaeude: gebaeude.name || gebaeude.id,
    waende: geschoss.waende.length,
    elemente: geschoss.waende.filter((w) => mitElement.has(String(w.id))).length,
    bemassungen: geschoss.bemassungen.length,
    plan: !!geschoss.plan,
  }));
  const waende = [];
  for (const { geschoss, wand } of alleWaende(m)) {
    if (!mitElement.has(String(wand.id))) continue;
    waende.push({ id: wand.id, name: wand.name || wand.id, geschoss: geschoss.name || geschoss.id });
  }
  return { geschosse, waende };
}

/** Waende, die im ZIEL schon eingetragen sind — `setzeWand` verschiebt sie sonst still. */
function _schonImZiel(ziel, ids) {
  const out = [];
  for (const { geschoss, wand } of alleWaende(ziel)) {
    if (ids.has(String(wand.id))) out.push(`${wand.name || wand.id} (bisher ${geschoss.name || geschoss.id})`);
  }
  return out;
}

/** Hinweis zur Katalogzuordnung: sie gehoert dem ZIELprojekt und reist nie mit ([L-12]). */
function _katalogHinweis(quelle, ziel, hinweise) {
  if (!quelle.katalog || String(quelle.katalog) === String(ziel.katalog || "")) return;
  hinweise.push(`Die Katalogzuordnung „${quelle.katalog}“ der Quelle gilt dem dortigen Projekt und `
    + `reist bei einer Teilübernahme nicht mit: im Zielprojekt „${ziel.projekt.name}“ bleibt `
    + (ziel.katalog ? `die vorhandene Zuordnung „${ziel.katalog}“` : "es bei keiner Zuordnung")
    + " ([L-12]).");
}

/** Ein einzelnes Geschoss in ein bestehendes oder neu angelegtes Projekt uebernehmen. */
function _uebernahmeGeschoss(gelesen, w, zielMappe) {
  const quelle = normMappe(gelesen.mappe);
  const treffer = findeGeschoss(quelle, String(w.geschossId || ""));
  if (!treffer) {
    throw new Error(`Das Geschoss „${w.geschossId || "—"}“ steht nicht in der geprüften Quelle — `
      + "übernommen wird nur, was wirklich gelesen und geprüft wurde.");
  }
  const gs = treffer.geschoss;

  const neuerName = (w.neuesProjekt == null) ? null : String(w.neuesProjekt).trim();
  let ziel, neu = false;
  if (neuerName != null) {
    if (!neuerName) throw new Error("Für das neue Projekt fehlt der Name — es wird keiner erfunden ([P-9]).");
    ziel = normMappe(leereMappe(neuerName));
    neu = true;
  } else {
    if (!zielMappe) {
      throw new Error("Ohne Zielprojekt wird ein Geschoss nicht übernommen: Geschosse außerhalb von "
        + "Projekten gibt es nicht ([L-6]). Ein bestehendes Projekt wählen oder ein neues anlegen lassen.");
    }
    ziel = normMappe(zielMappe);
  }
  if (!ziel.gebaeude.length) ziel = fuegeGebaeudeHinzu(ziel, "Gebäude 1").mappe;
  const gebId = ziel.gebaeude[0].id;

  // Die Schale bekommt eine NEUE Geschoss-Kennung (s. Abschnittskopf). Bei einem neu
  // angelegten Projekt wird das von `leereMappe` mitgelieferte LEERE Geschoss dafuer
  // benutzt und umbenannt — sonst stuende daneben ein leeres „Geschoss 1“.
  const erstes = ziel.gebaeude[0].geschosse[0];
  let schaleId;
  if (neu && ziel.gebaeude[0].geschosse.length === 1 && erstes
      && !erstes.waende.length && !erstes.bemassungen.length && !erstes.plan) {
    schaleId = erstes.id;
    ziel = benenneUm(ziel, schaleId, gs.name);
  } else {
    const r = fuegeGeschossHinzu(ziel, gebId, gs.name, gs.hoehe_mm);
    ziel = r.mappe;
    schaleId = r.id;
  }
  const vorherImZiel = _schonImZiel(ziel, new Set(gs.waende.map((x) => String(x.id))));

  // Reihenfolge ist zwingend: erst die Waende, dann die Masse — `bemassungenFehler`
  // weist einen Bezug auf eine noch unbekannte Wand ab ([K-10]).
  ziel = setzeGeschossHoehe(ziel, schaleId, gs.hoehe_mm);
  ziel = setzeUrsprung(ziel, schaleId, gs.ursprung_mm);
  if (gs.plan) ziel = setzePlan(ziel, schaleId, gs.plan);
  for (const wd of gs.waende) {
    ziel = setzeWand(ziel, schaleId, { id: wd.id, name: wd.name, datei: null, lage: wd.lage });
  }
  for (const b of gs.bemassungen) ziel = setzeBemassung(ziel, schaleId, { ...b, id: neueId("bm") });

  const idsGs = new Set(gs.waende.map((x) => String(x.id)));
  const waende = (gelesen.waende || []).filter((x) => idsGs.has(String(x.id)));
  // Das Planbild haengt an der Geschoss-Kennung ([L-8]) — es zieht auf die NEUE um.
  const bilder = (gelesen.bilder || [])
    .filter((b) => String(b.geschossId) === String(gs.id))
    .map((b) => ({ ...b, geschossId: schaleId }));

  const hinweise = [...(gelesen.hinweise || [])];
  hinweise.push(`Übernommen wird ausschließlich das Geschoss „${gs.name || gs.id}“ `
    + `(${gs.waende.length} Wandeintrag/-einträge, ${waende.length} davon mit Wandelement, `
    + `${gs.bemassungen.length} Maß(e), ${bilder.length} Planbild(er)) `
    + (neu ? "in das dabei neu angelegte " : "in das bestehende ")
    + `Projekt „${ziel.projekt.name}“. Alles Übrige der Quelle bleibt liegen.`);
  hinweise.push("Das Geschoss und seine Maße erhalten im Zielprojekt neue Kennungen; die "
    + "WANDKENNUNGEN bleiben unverändert ([L-4]) — nur über sie läuft die Zuordnung zum "
    + "Wandelement. Ein bestehendes Geschoss wird dadurch nie berührt.");
  if (waende.length < gs.waende.length) {
    hinweise.push(`${gs.waende.length - waende.length} Wandeintrag/-einträge dieses Geschosses liegen `
      + "ohne Wandelement bei; sie reisen mit und bleiben nach dem Import verwaist ([L-4]) — "
      + "sie werden gemeldet, nicht stillschweigend weggelassen.");
  }
  if (vorherImZiel.length) {
    hinweise.push(`Diese Wand/Wände ist/sind im Zielprojekt bereits eingetragen und wird/werden in das `
      + `übernommene Geschoss VERSCHOBEN (eine Wand steht nie zweimal in einer Mappe): `
      + `${vorherImZiel.join(", ")}.`);
  }
  _katalogHinweis(quelle, ziel, hinweise);

  return {
    quelle: gelesen.quelle,
    mappe: mappeObjekt(ziel),
    waende, bilder,
    ueberzaehlig: gelesen.ueberzaehlig || [],
    hinweise,
    fehler: gelesen.fehler || [],
    ziel: {
      art: UMFANG_GESCHOSS, projektId: ziel.projekt.id, projektName: ziel.projekt.name, neu,
      geschossId: schaleId, geschossName: gs.name || gs.id,
      wandId: null, wandName: null,
      waende: gs.waende.length, elemente: waende.length, bemassungen: gs.bemassungen.length,
    },
  };
}

/** Eine einzelne Wand in ein vorhandenes Zielgeschoss uebernehmen — OHNE Lage. */
function _uebernahmeWand(gelesen, w, zielMappe) {
  const quelle = normMappe(gelesen.mappe);
  const t = findeWand(quelle, String(w.wandId || ""));
  if (!t) {
    throw new Error(`Die Wand „${w.wandId || "—"}“ steht nicht in der geprüften Quelle — `
      + "übernommen wird nur, was wirklich gelesen und geprüft wurde.");
  }
  const el = (gelesen.waende || []).find((x) => String(x.id) === String(t.wand.id));
  if (!el) {
    throw new Error(`Zur Wand „${t.wand.name || t.wand.id}“ liegt der Quelle kein Wandelement bei — `
      + "es gibt nichts zu übernehmen; der Eintrag allein wäre sofort verwaist ([L-4]).");
  }
  if (!zielMappe) {
    throw new Error("Ohne Zielgeschoss wird eine einzelne Wand nicht übernommen: in diesem Browser gibt "
      + "es noch kein Geschoss, in das sie eingetragen werden könnte. Erst ein Projekt mit Geschoss "
      + "anlegen — oder das ganze Projekt übernehmen.");
  }
  const ziel0 = normMappe(zielMappe);
  const zt = findeGeschoss(ziel0, String(w.zielGeschossId || ""));
  if (!zt) {
    throw new Error(`Unbekanntes Zielgeschoss „${w.zielGeschossId || "—"}“ — eine Wand wird nur in ein `
      + "ausdrücklich gewähltes, vorhandenes Geschoss eingetragen ([L-10]).");
  }
  const vorherImZiel = _schonImZiel(ziel0, new Set([String(t.wand.id)]));
  // OHNE Lage ([L-1]): die gespeicherte Lage galt im QUELLgeschoss und hat im Zielgeschoss
  // keine Bedeutung. Es wird keine erfunden ([P-9]); verortet wird im Geschosseditor.
  const ziel = setzeWand(ziel0, zt.geschoss.id, {
    id: t.wand.id, name: t.wand.name, datei: null, lage: null,
  });

  const hinweise = [...(gelesen.hinweise || [])];
  hinweise.push(`Übernommen wird ausschließlich die Wand „${t.wand.name || t.wand.id}“ in das Geschoss `
    + `„${zt.geschoss.name || zt.geschoss.id}“ des Projekts „${ziel.projekt.name}“ — `
    + "mit Wandelement und Eingaben, aber OHNE Lage: die gespeicherte Lage galt im Quellgeschoss "
    + "([L-1]). Verortet wird im Geschosseditor; es wird keine Position erfunden.");
  hinweise.push(`Die Maße des Quellgeschosses „${t.geschoss.name || t.geschoss.id}“ reisen dabei `
    + "ausdrücklich NICHT mit: ein Maß ohne verortete Bezugswand hätte keinen Sinn ([K-10]). "
    + "Alles Übrige der Quelle bleibt liegen.");
  if (vorherImZiel.length) {
    hinweise.push(`Diese Wand ist im Zielprojekt bereits eingetragen und wird in das gewählte Geschoss `
      + `VERSCHOBEN (eine Wand steht nie zweimal in einer Mappe): ${vorherImZiel.join(", ")}.`);
  }
  _katalogHinweis(quelle, ziel, hinweise);

  return {
    quelle: gelesen.quelle,
    mappe: mappeObjekt(ziel),
    waende: [el],
    bilder: [],
    ueberzaehlig: gelesen.ueberzaehlig || [],
    hinweise,
    fehler: gelesen.fehler || [],
    ziel: {
      art: UMFANG_WAND, projektId: ziel.projekt.id, projektName: ziel.projekt.name, neu: false,
      geschossId: zt.geschoss.id, geschossName: zt.geschoss.name || zt.geschoss.id,
      wandId: t.wand.id, wandName: t.wand.name || t.wand.id,
      waende: 1, elemente: 1, bemassungen: 0,
    },
  };
}

/**
 * DER eine Weg von der gepruefte Quelle zur Uebernahme (#86). Rueckgabe hat die Form
 * von `leseArchiv` und geht unveraendert in `store.schreibeArchiv`.
 *
 * `zielMappe` ist die Mappe des gewaehlten ZIELprojekts (bei `wand` die des Projekts,
 * dem das Zielgeschoss gehoert). Sie wird UEBERGEBEN, weil dieses Modul rein bleibt und
 * keinen Speicher liest. Eine unerfuellbare Wahl wird BENANNT abgewiesen ([P-9]).
 *
 * @param {ReturnType<typeof leseExport>} gelesen
 * @param {{umfang?:string, geschossId?:string, wandId?:string, zielGeschossId?:string,
 *          neuesProjekt?:string|null}} [wahl]
 * @param {object|null} [zielMappe]
 */
export function uebernahme(gelesen, wahl, zielMappe) {
  if (!gelesen || !gelesen.mappe) throw new Error("Ohne geprüfte Quelle gibt es nichts zu übernehmen.");
  const w = (wahl && typeof wahl === "object") ? wahl : {};
  const umfang = String(w.umfang || UMFANG_PROJEKT);
  if (!UMFAENGE.includes(umfang)) throw new Error(`Unbekannter Übernahmeumfang „${umfang}“.`);
  if (umfang === UMFANG_PROJEKT) {
    const m = normMappe(gelesen.mappe);
    return {
      ...gelesen,
      ziel: {
        art: UMFANG_PROJEKT, projektId: m.projekt.id, projektName: m.projekt.name, neu: false,
        geschossId: null, geschossName: null, wandId: null, wandName: null,
        waende: alleWaende(m).length, elemente: (gelesen.waende || []).length,
        bemassungen: alleGeschosse(m).reduce((s, t) => s + t.geschoss.bemassungen.length, 0),
      },
    };
  }
  return umfang === UMFANG_GESCHOSS
    ? _uebernahmeGeschoss(gelesen, w, zielMappe)
    : _uebernahmeWand(gelesen, w, zielMappe);
}

/**
 * Kurzfassung der UEBERNAHME fuer die Oberflaeche — eine Zeile je Punkt, in fester
 * Reihenfolge. Getrennt von `berichtZeilen`: der beschreibt die gelesene QUELLE, dieser
 * das, was wirklich geschrieben wuerde.
 * @param {ReturnType<typeof uebernahme>} u @returns {string[]}
 */
export function uebernahmeZeilen(u) {
  if (!u || !u.ziel) return [];
  const z = u.ziel;
  const out = [];
  if (z.art === UMFANG_PROJEKT) {
    out.push(`Übernommen wird das GANZE Projekt „${z.projektName}“ — ${z.waende} Wandeintrag/-einträge, `
      + `${z.elemente} mit Wandelement, ${z.bemassungen} Maß(e), ${(u.bilder || []).length} Planbild(er).`);
  } else if (z.art === UMFANG_GESCHOSS) {
    out.push(`Übernommen wird das Geschoss „${z.geschossName}“ `
      + (z.neu ? `in das NEU anzulegende Projekt „${z.projektName}“` : `in das Projekt „${z.projektName}“`)
      + ` — ${z.waende} Wandeintrag/-einträge, ${z.elemente} mit Wandelement, ${z.bemassungen} Maß(e), `
      + `${(u.bilder || []).length} Planbild(er).`);
  } else {
    out.push(`Übernommen wird die Wand „${z.wandName}“ in das Geschoss „${z.geschossName}“ des Projekts `
      + `„${z.projektName}“ — ohne Lage, ohne Maße.`);
  }
  return out;
}

// --- Hierarchischer Export (Issue #67) --------------------------------------
//
// Der zentrale Export in Modul 0 bietet je Hierarchieebene NUR die dazu passenden
// Projektdaten und die Gesamtstueckliste an. Der Umfang folgt deterministisch dem
// ANGEKLICKTEN Eintrag (nie den aktiven Zeigern), der ZIP-Inhalt ist exakt die
// sichtbare Auswahl, und fehlende Wandelemente oder ein fehlender zugeordneter
// Katalog werden BENANNT statt still ersetzt ([L-4]/[L-12]).
//
// Alle Dateien behalten ihre bestehenden oeffentlichen Formate und ihre fachliche
// Trennung: Projektmappe (SEMBLA-Projektmappe v2, „nur Struktur (JSON)“ — [L-13]),
// Geschossdaten als TEILMAPPE im selben Format (genau das eine Gebaeude mit genau
// diesem Geschoss — kein neues Format, keine neue Versionsachse), Wanddateien als
// SEMBLA-Projekt v2, der Katalog als SEMBLA-Bauteilkatalog v1 ([L-12]: nie in die
// Mappe oder eine Wanddatei eingebettet). Die Mengen der Gesamtstueckliste kommen
// unveraendert aus `umfang()`/`gesamtDaten()` (sembla-gesamtstueckliste.js) — es
// gibt keinen zweiten Mengen- oder Preispfad.
//
// Dieses ZIP ist ausdruecklich KEIN vollstaendiges Projektarchiv nach [L-13]:
// Planbilder sind nicht enthalten, und die Mappendatei heisst bewusst nicht
// `projekt.json`, damit nichts als Archiv missverstanden wird.

/** Ordner der Geschossdaten (Teilmappen) im Export-ZIP. */
export const ORDNER_GESCHOSSE = "geschosse";

/** Die je Ebene zulaessigen Auswahloptionen — mehr bietet der Dialog nicht an. */
export const EXPORT_OPTIONEN = {
  projekt: ["mappe", "gesamt", "geschosse", "waende", "katalog"],
  gebaeude: ["mappe", "gesamt", "geschosse", "waende", "katalog"],
  geschoss: ["geschoss", "gesamt", "waende"],
  wand: ["wand", "stueckliste"],
};

/** Anzeigename der Ebene im ZIP-Namen (dateisicher, ohne Umlaut). */
const EBENE_DATEI = { projekt: "Projekt", gebaeude: "Gebaeude", geschoss: "Geschoss", wand: "Wand" };

/** Zulaessige Optionen einer Ebene (Kopie). @param {string} ebene @returns {string[]} */
export function exportOptionen(ebene) {
  return (EXPORT_OPTIONEN[ebene] || []).slice();
}

/**
 * Geschossdaten als TEILMAPPE: bestehendes oeffentliches Format SEMBLA-Projektmappe
 * v2 mit dem Projektkopf, der Katalogreferenz und GENAU dem einen Gebaeude, das
 * genau dieses Geschoss (samt Waenden, Lage, Bemassungen, Planbeschreibung) traegt.
 * Ausdruecklich NICHT die vollstaendige Projektmappe und kein neues Dateiformat.
 * @param {any} mappe @param {string} geschossId @returns {object|null}
 */
export function geschossTeilmappe(mappe, geschossId) {
  const obj = mappeObjekt(mappe);
  for (const g of obj.gebaeude) {
    const gs = g.geschosse.find((x) => String(x.id) === String(geschossId));
    if (gs) return { ...obj, gebaeude: [{ id: g.id, name: g.name, geschosse: [gs] }] };
  }
  return null;
}

/** Archivpfad einer Geschossdatei. @param {{id:string, name?:string}} gs @returns {string} */
export function geschossPfad(gs) {
  return `${ORDNER_GESCHOSSE}/${sicherStamm(gs && gs.name)}__${String(gs && gs.id)}.json`;
}

/** Die Geschosse des gewaehlten Umfangs — Strukturiteration, keine Mengenableitung. */
function _umfangGeschosse(m, ebene, ids) {
  if (ebene === "projekt") return alleGeschosse(m).map((t) => t.geschoss);
  if (ebene === "gebaeude") {
    const geb = findeGebaeude(m, String(ids.gebaeudeId || ""));
    if (!geb) throw new Error(`Unbekanntes Gebäude „${ids.gebaeudeId}“.`);
    return geb.geschosse.slice();
  }
  const t = findeGeschoss(m, String(ids.geschossId || ""));
  if (!t) throw new Error(`Unbekanntes Geschoss „${ids.geschossId}“.`);
  return [t.geschoss];
}

/**
 * Nicht anwendbare Mengenuebersteuerungen einer Wand als Lueckentexte ([P-20]).
 *
 * Gerechnet wird NICHTS eigenes: dieselbe `wirksameMengen`-Ableitung, die auch die Datei
 * fuellt, liefert `fremd` und `ungueltig`. Hier werden sie nur in Satzform gebracht, damit
 * der Bestaetigungsdialog sie VOR dem Download nennen kann.
 * @param {{wandelement:any, eingaben:any}} projekt @param {object|null} katalog @param {string} wandName
 * @returns {string[]}
 */
function _mengenLuecken(projekt, katalog, wandName) {
  const eingaben = (projekt && projekt.eingaben) || {};
  const mengen = (eingaben.kosten || {}).mengen;
  if (!mengen || typeof mengen !== "object" || Array.isArray(mengen)) return [];
  const m = wirksameMengen(stuecklistePositionen(projekt.wandelement, eingaben, katalog), mengen);
  const wand = wandName ? `„${wandName}“: ` : "";
  const out = [];
  for (const k of m.fremd) {
    out.push(`${wand}Die gespeicherte Mengenübersteuerung „${k}“ gehört zu keiner gerechneten `
      + "Position — sie wird nicht angewandt und bleibt gespeichert ([P-20]).");
  }
  for (const u of m.ungueltig) {
    out.push(`${wand}Die gespeicherte Mengenübersteuerung „${u.kennung}“ (${u.label}) ist unzulässig: `
      + `${u.grund} Es gilt die berechnete Menge.`);
  }
  return out;
}

/**
 * Dasselbe fuer die GESAMTSTÜCKLISTE ([P-20], #81) — mit Wandbezug.
 *
 * Gerechnet wird auch hier nichts: `gesamtDaten()` hat die Eintraege bereits ueber
 * `wirksameMengen()` je Wand gesammelt. Hier entsteht nur der Satz fuer den
 * Bestaetigungsdialog. Ohne Wandnamen waere die Kennung ueber mehrere Waende hinweg
 * nicht auflösbar — deshalb steht er zwingend davor.
 * @param {{mengen?:{fremd:Array<any>, ungueltig:Array<any>}}} daten Ergebnis von `gesamtDaten()`
 * @returns {string[]}
 */
export function gesamtMengenLuecken(daten) {
  const mg = (daten && daten.mengen) || { fremd: [], ungueltig: [] };
  const out = [];
  for (const f of mg.fremd) {
    out.push(`Gesamtstückliste, „${f.wand}“: Die gespeicherte Mengenübersteuerung „${f.kennung}“ `
      + "gehört zu keiner gerechneten Position dieser Wand — sie wird nicht angewandt und bleibt "
      + "gespeichert ([P-20]).");
  }
  for (const u of mg.ungueltig) {
    out.push(`Gesamtstückliste, „${u.wand}“: Die gespeicherte Mengenübersteuerung „${u.kennung}“ `
      + `(${u.label}) ist unzulässig: ${u.grund} Es gilt die berechnete Menge.`);
  }
  // Manuelle Mengen der GESCHOSSEBENE ([P-20], #81): sie gehoeren keiner Wand, also steht hier
  // KEIN Wandname davor — ein leeres „“ waere eine falsche Auskunft. Eigene Saetze, damit nie
  // offenbleibt, welche Ebene eine Meldung betrifft.
  const eb = (daten && daten.mengen && daten.mengen.ebene) || null;
  if (eb) {
    for (const f of eb.fremd) {
      out.push(`Gesamtstückliste (Geschoss): Die gespeicherte Mengenübersteuerung „${f}“ gehört `
        + "zu keiner gerechneten Position dieser Ebene — sie wird nicht angewandt und bleibt "
        + "gespeichert ([P-20]).");
    }
    for (const u of eb.ungueltig) {
      out.push(`Gesamtstückliste (Geschoss): Die gespeicherte Mengenübersteuerung „${u.kennung}“ `
        + `(${u.label}) ist unzulässig: ${u.grund} Es gilt die berechnete Menge.`);
    }
    for (const d of eb.mehrdeutig) {
      out.push(`Gesamtstückliste (Geschoss): Die gespeicherte Mengenübersteuerung „${d.kennung}“ `
        + `(${d.label}) ist mehrdeutig — ${d.zeilen} Zeilen tragen diese Positionskennung. Sie `
        + "wird auf keine davon angewandt und bleibt gespeichert ([P-20]).");
    }
  }
  return out;
}

/**
 * Dateien des hierarchischen Exports bauen — exakt die Auswahl, Luecken benannt.
 *
 * Rein: die Leser (Wandspeicher, Wanddatei, Katalog) werden UEBERGEBEN; die Funktion
 * liest keinen Speicher und setzt keinen Zeiger. Eine Auswahl, die es auf der Ebene
 * nicht gibt, wird abgewiesen statt still uebergangen.
 *
 * @param {string[]} auswahl Optionsschluessel (s. EXPORT_OPTIONEN)
 * @param {{mappe?:object|null, ebene:string, gebaeudeId?:string|null, geschossId?:string|null,
 *   wandId?:string|null, wandName?:string|null, katalog?:object|null,
 *   holeElement?:(id:string)=>any, holeEingaben?:(id:string)=>any,
 *   projektObjekt?:(id:string)=>any, preise?:boolean, fassung?:string}} p
 *   `fassung` waehlt die Mengenfassung der Stuecklisten ([P-20]): `'berechnet'` (Default)
 *   oder `'angepasst'`. Sie wird nur DURCHGEREICHT — an die Baustellenstueckliste der Wand
 *   und an die Gesamtstueckliste der Ebene, und zwar aus GENAU EINER Variablen: ein
 *   Exportlauf kann damit gar nicht zwei Mengenfassungen im selben ZIP haben (#81).
 * @returns {{dateien:Array<{name:string,data:string}>, luecken:string[], zipName:string, bezug:string}}
 */
export function hierarchieExport(auswahl, p) {
  const ebene = String(p.ebene || "");
  const fassung = normFassung(p.fassung);
  const erlaubt = EXPORT_OPTIONEN[ebene];
  if (!erlaubt) throw new Error(`Unbekannte Exportebene „${ebene}“.`);
  const gewaehlt = [...new Set((auswahl || []).map(String))];
  for (const o of gewaehlt) {
    if (!erlaubt.includes(o)) throw new Error(`Die Auswahl „${o}“ gibt es auf der Ebene „${ebene}“ nicht.`);
  }
  if (!gewaehlt.length) throw new Error("Keine Datei ausgewählt.");
  const m = p.mappe ? normMappe(p.mappe) : null;
  if (ebene !== "wand" && !m) throw new Error("Ohne Projektmappe ist nur die Wandebene exportierbar.");
  const holeElement = p.holeElement || (() => null);
  const projektObjekt = p.projektObjekt || ((id) => { throw new Error(`Keine Wanddatei zu „${id}“ lesbar.`); });

  // Umfang der Ebene: dieselbe kanonische Ableitung wie die Gesamtstueckliste —
  // mit den KLICK-Kennungen als Zeiger, nie mit den aktiven ([L-10] unberuehrt).
  const umf = umfang(m, /** @type {any} */ (ebene), {
    wandId: p.wandId, wandName: p.wandName, geschossId: p.geschossId, gebaeudeId: p.gebaeudeId,
  });
  if (!umf.ok) throw new Error(umf.grund || `Umfang der Ebene „${ebene}“ nicht ableitbar.`);

  /** @type {Array<{name:string,data:string}>} */
  const dateien = [];
  /** @type {string[]} */
  const luecken = [];

  // Feste, deterministische Datei-Reihenfolge — unabhaengig von der Klickreihenfolge.
  if (gewaehlt.includes("mappe") && m) {
    dateien.push({
      name: "SEMBLA_Projektmappe_" + sicherStamm(m.projekt.name || "Projekt") + ".json",
      data: JSON.stringify(mappeObjekt(m), null, 2),
    });
  }

  if ((gewaehlt.includes("geschosse") || gewaehlt.includes("geschoss")) && m) {
    for (const gs of _umfangGeschosse(m, ebene, { gebaeudeId: p.gebaeudeId, geschossId: p.geschossId })) {
      dateien.push({
        name: geschossPfad(gs),
        data: JSON.stringify(geschossTeilmappe(m, gs.id), null, 2),
      });
    }
  }

  if (gewaehlt.includes("waende") || gewaehlt.includes("wand")) {
    for (const ref of umf.waende) {
      let el = null;
      try { el = holeElement(ref.wandId); } catch { el = null; }
      if (!el) {
        luecken.push(`Wandelement „${ref.name}“ (${pfadText({ ...umf.bezug, gebaeude: ref.gebaeude || umf.bezug.gebaeude, geschoss: ref.geschoss || umf.bezug.geschoss, wand: null })}) fehlt im Wandspeicher — verwaister Eintrag ([L-4]); keine Wanddatei im ZIP.`);
        continue;
      }
      dateien.push({
        name: wandPfad({ id: ref.wandId, name: ref.name }),
        data: JSON.stringify(projektObjekt(ref.wandId), null, 2),
      });
    }
  }

  if (gewaehlt.includes("stueckliste")) {
    // Baustellenstueckliste der Wand: exakt der bestehende Wandpfad (baueDateien),
    // inkl. Preisaufloesung nach [P-14] aus dem uebergebenen Katalog. Die Mengenfassung
    // ([P-20]) wird nur DURCHGEREICHT — gerechnet wird sie in sembla-export.js.
    const ref = umf.waende[0];
    let el = null;
    try { el = ref ? holeElement(ref.wandId) : null; } catch { el = null; }
    if (!el) {
      luecken.push(`Wandelement „${ref ? ref.name : p.wandId}“ fehlt im Wandspeicher — verwaister Eintrag ([L-4]); keine Baustellenstückliste im ZIP.`);
    } else {
      const obj = projektObjekt(ref.wandId);
      dateien.push(...baueDateien(obj, ["stueckliste"], p.katalog || null, { fassung }));
      // Nicht anwendbare Uebersteuerungen gehoeren VOR den Download: sie stehen zwar auch
      // im Dateikopf, aber ein Nutzer, der die angepasste Fassung ausdruecklich waehlt,
      // muss vor dem Speichern erfahren, dass ein Teil davon nicht wirkt ([P-9]/[P-20]).
      if (fassung === "angepasst") {
        for (const l of _mengenLuecken(obj, p.katalog || null, ref ? ref.name : "")) luecken.push(l);
      }
    }
  }

  if (gewaehlt.includes("gesamt")) {
    // Dieselbe `fassung` wie oben ([P-20]/#81): die Aggregation rechnet sie NICHT selbst,
    // sie reicht sie an `wirksameMengen()` je Wand weiter.
    // Die manuellen Mengen der GESCHOSSEBENE ([P-20], #81) werden nur GELESEN und
    // DURCHGEREICHT — gerechnet wird sie in `gesamtDaten`, angewandt nur in der angepassten
    // Fassung (dieselbe eine `fassung` wie oben). Oberhalb des Geschosses gibt es sie nicht.
    const ebenenMengen = (m && ebene === "geschoss" && p.geschossId)
      ? geschossMengen(m, p.geschossId) : null;
    const daten = gesamtDaten(umf, {
      holeElement, holeEingaben: p.holeEingaben, katalog: p.katalog || null,
    }, { fassung, ebenenMengen });
    for (const l of daten.luecken) {
      luecken.push(`Gesamtstückliste: ${l.pfad ? l.pfad + " — " : ""}${l.grund}`);
    }
    // Nicht anwendbare Uebersteuerungen gehoeren auch hier VOR den Download — mit
    // WANDBEZUG, weil die Kennung ueber mehrere Waende hinweg nicht auflösbar waere.
    for (const l of gesamtMengenLuecken(daten)) luecken.push(l);
    dateien.push(...gesamtstuecklisteDateien(daten, { preise: p.preise !== false, rumpf: dateiRumpf(daten) }));
  }

  if (gewaehlt.includes("katalog") && m) {
    if (!m.katalog) {
      luecken.push("Dem Projekt ist kein Bauteilkatalog zugeordnet ([L-12]) — keine Katalogdatei im ZIP.");
    } else if (!p.katalog) {
      luecken.push(`Der zugeordnete Bauteilkatalog „${m.katalog}“ ist in diesem Browser nicht gespeichert — keine Katalogdatei im ZIP; die Zuordnung bleibt in der Mappe erhalten ([L-12]).`);
    } else {
      const obj = katalogObjekt(p.katalog);
      dateien.push({
        name: "SEMBLA_Bauteilkatalog_" + sicherStamm(obj.name) + ".json",
        data: JSON.stringify(obj, null, 2),
      });
    }
  }

  const b = umf.bezug || {};
  const bezugName = ebene === "wand" ? b.wand : (ebene === "geschoss" ? b.geschoss : (ebene === "gebaeude" ? b.gebaeude : b.projekt));
  return {
    dateien, luecken,
    zipName: "SEMBLA_Export_" + EBENE_DATEI[ebene] + "_" + sicherStamm(bezugName || "ohne_Bezug"),
    bezug: pfadText(b),
  };
}
