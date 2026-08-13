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
 *
 * Rein und DOM-frei; eigene Tests (tests/module/test-archiv.mjs) — shared-Regel (b).
 */

import { alleGeschosse, alleWaende, findeGebaeude, findeGeschoss, mappeObjekt, normMappe, parseMappe } from "./sembla-projektmappe.js";
import { katalogObjekt } from "./sembla-katalog.js";
import { dateiRumpf, gesamtDaten, pfadText, umfang } from "./sembla-gesamtstueckliste.js";
import { baueDateien, gesamtstuecklisteDateien } from "./sembla-export.js";

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
  /** @type {Map<string, string|Uint8Array>} */
  const roh = new Map();
  for (const e of (eintraege || [])) {
    const r = normPfad(e && e.name);
    if ("fehler" in r) { fehler.push(r.fehler); continue; }
    if (roh.has(r.pfad)) { fehler.push(`Der Pfad „${r.pfad}“ kommt im Archiv mehrfach vor.`); continue; }
    roh.set(r.pfad, e.data);
  }
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
  if (gelesen.mappe) {
    z.push(`Projekt „${gelesen.mappe.projekt.name}“ · ${alleGeschosse(gelesen.mappe).length} Geschoss(e) · `
      + `${gelesen.waende.length} Wanddatei(en) · ${gelesen.bilder.length} Planbild(er)`);
  }
  for (const h of gelesen.hinweise) z.push(h);
  if (gelesen.ueberzaehlig.length) {
    z.push(`${gelesen.ueberzaehlig.length} Datei(en) im Archiv gehören zu keinem Eintrag der Mappe und `
      + `werden nicht importiert: ${gelesen.ueberzaehlig.join(", ")}`);
  }
  return z;
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
 *   projektObjekt?:(id:string)=>any, preise?:boolean}} p
 * @returns {{dateien:Array<{name:string,data:string}>, luecken:string[], zipName:string, bezug:string}}
 */
export function hierarchieExport(auswahl, p) {
  const ebene = String(p.ebene || "");
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
    // inkl. Preisaufloesung nach [P-14] aus dem uebergebenen Katalog.
    const ref = umf.waende[0];
    let el = null;
    try { el = ref ? holeElement(ref.wandId) : null; } catch { el = null; }
    if (!el) {
      luecken.push(`Wandelement „${ref ? ref.name : p.wandId}“ fehlt im Wandspeicher — verwaister Eintrag ([L-4]); keine Baustellenstückliste im ZIP.`);
    } else {
      dateien.push(...baueDateien(projektObjekt(ref.wandId), ["stueckliste"], p.katalog || null));
    }
  }

  if (gewaehlt.includes("gesamt")) {
    const daten = gesamtDaten(umf, {
      holeElement, holeEingaben: p.holeEingaben, katalog: p.katalog || null,
    });
    for (const l of daten.luecken) {
      luecken.push(`Gesamtstückliste: ${l.pfad ? l.pfad + " — " : ""}${l.grund}`);
    }
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
