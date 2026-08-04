// @ts-check
/**
 * SEMBLA Storage — localStorage-Schicht der Suite.
 *
 * Das Wandelement (JSON) ist die Single Source of Truth. Es liegt hier im
 * localStorage des Browsers. Die Module lesen/schreiben ausschliesslich das
 * AKTIVE Element (sie fassen fremde Elemente nie an). Datei-Export/-Import
 * bleibt als bewusste Aktion (Sichern, Weitergeben) erhalten.
 *
 * Schluessel:
 *   sembla:elemente  { [id]: Eintrag }          Liste gespeicherter Elemente
 *   sembla:aktiv     "<id>"                       id des aktiven Elements
 *   sembla:version   <Zahl>                       Schema-Version (Migration)
 *   sembla:obj:i2    <string>                     hochgeladene Bauteilgeometrie i2
 *   sembla:obj:i3    <string>                     hochgeladene Bauteilgeometrie i3
 *   sembla:katalog   { …SEMBLA-Bauteilkatalog }    EIN aktiver Bauteilkatalog (eigene Ressource)
 *
 * Ein Eintrag: { id, name, wandelement, eingaben?, erstellt, geaendert }  (ISO-Zeitstempel)
 *
 * Datenmodell: Das `wandelement` (Ergebnis von buildWall) traegt die physischen
 * Modul-1-Eingaben (Laenge/Hoehe/Oeffnungen/…) UND das Berechnete. `eingaben`
 * traegt die uebrigen, modeluebergreifenden Nutzereingaben (Projekt-Kopfdaten,
 * Wandaufbau, Produktreferenzen, Statik-Kennwerte, Waehrung) — alles, was NICHT
 * aus dem Wandelement ableitbar ist. So
 * liegt das komplette Projekt in EINEM JSON; abgeleitete Werte (Stueckliste,
 * Nachweise) werden nie gespeichert, sondern immer neu gerechnet (kein Drift).
 *
 * AUSNAHME Bauteilkatalog: Der Produktstamm ist eine eigene Ressource (eigener
 * Schluessel, eigenes Dateiformat `SEMBLA-Bauteilkatalog`, siehe sembla-katalog.js)
 * und wird ausschliesslich in Modul 0 gepflegt. Im Projekt liegen davon nur
 * REFERENZEN — Produkt-IDs je Verwendungsrolle plus Herkunftsnotiz, geschrieben
 * vom jeweils fachlich zustaendigen Modul ([P-13]):
 *   eingaben.planung.produkte  — Modul 1 (Wand, Vorspannung, Anschluss, Fugen)
 *   eingaben.aufbau.produkte   — Modul 2 (Latten, Beplankung, Verbinder)
 * Keine Preise, keine Maße, nichts im Wandelement. `eingaben.katalog.auswahl` ist
 * unwirksamer Altbestand des abgeloesten zentralen Auswahlwegs ([P-15]): sie wird
 * hier nur noch GELESEN (fuer die Unwirksamkeits-Meldung in Modul 0), nie neu
 * geschrieben und nie in Verwendungsrollen uebersetzt.
 *
 * ES-Modul: wird im Browser per <script type="module"> geladen. Kein Node-Betrieb.
 */

import { katalogObjekt, leereProdukte, parseKatalog, rolle, validiereKatalog } from "./sembla-katalog.js";

const K_ELEM = "sembla:elemente";
const K_AKTIV = "sembla:aktiv";
const K_VERSION = "sembla:version";
const K_OBJ = (typ) => `sembla:obj:${typ}`;
const K_KATALOG = "sembla:katalog";

/** Aktuelle Schema-Version des INTERNEN localStorage-Stands. Aeltere Staende
 *  werden beim Laden einmalig migriert.
 *  v2: Eintrag kann `eingaben` (projekt/aufbau/kosten) tragen. Alt-Elemente
 *  ohne `eingaben` funktionieren weiter — fehlende Felder werden beim Lesen mit
 *  Standardwerten aufgefuellt (holeEingaben), nichts wird zerstoerend umgeschrieben.
 *  v3: `wandelement.wandtyp` wird einmalig aus dem Alt-Feld `eingaben.statik.mitWind`
 *  abgeleitet (siehe `_migriereWandtyp`).
 *  Bleibt 3 mit dem Bauteilkatalog: der Katalog liegt in einem EIGENEN Schluessel
 *  (`sembla:katalog`; fehlt er, gibt es keinen Katalog) und `eingaben.katalog` wird
 *  beim Lesen aus `standardEingaben()` aufgefuellt — es gibt nichts zu migrieren.
 *  Bleibt 3 auch mit den wandbezogenen Produktreferenzen: `eingaben.planung.produkte`
 *  und `eingaben.aufbau.produkte` werden beim Lesen ebenfalls aus `standardEingaben()`
 *  aufgefuellt (leere Rollen). Der Altbestand `eingaben.katalog.auswahl` wird bewusst
 *  NICHT migriert — eine Kategorie->Rollen-Uebersetzung waere mehrdeutig ([P-15]). */
export const SCHEMA_VERSION = 3;

/** Version des OEFFENTLICHEN Projekt-Dateiformats (Export/Import).
 *  Bleibt 2: `wandtyp` (Wandelement) sowie die Eingaben-Zusatzfelder `eingaben.katalog`,
 *  `eingaben.planung` und `eingaben.aufbau.produkte` sind OPTIONAL. Der v2-Parser
 *  (`parseImport`) uebernimmt `obj.eingaben` unveraendert und ohne Feld-Whitelist,
 *  `holeEingaben` fuellt fehlende Felder auf und `projektObjekt` exportiert alles
 *  wieder — unbekannte/neue Teile reisen also in beide Richtungen verlustfrei mit.
 *  Kein Bruch, daher kein Versionssprung. Das Katalog-Dateiformat ist davon getrennt
 *  versioniert (KATALOG_VERSION in sembla-katalog.js). */
export const PROJEKT_VERSION = 2;

// --- Wandtyp (Fachmerkmal der Wand) --------------------------------------
// Der Wandtyp klassifiziert die Windsituation; Modul 3 leitet daraus ab, ob Wind
// als leitende Einwirkung angesetzt wird. Er gehoert an das WANDELEMENT (Single
// Source of Truth) und wird beim Anlegen in Modul 0 gewaehlt. Modul 1 fuehrt ihn
// unveraendert mit, Modul 3 liest ihn nur. Er hat keinen Einfluss auf
// Tiling/BOM/Straenge und ist darum bewusst NICHT Teil des Cores/der Engine.

/** @type {ReadonlyArray<'mit_wind'|'ohne_wind'>} */
export const WANDTYPEN = ["mit_wind", "ohne_wind"];

/** Standard = bisheriges Verhalten (Innenwand mit Wind, altes mitWind='ja'). */
export const WANDTYP_DEFAULT = "mit_wind";

/** Normalisiert einen Wandtyp; unbekannt/fehlend -> kompatibler Standard. */
export function normWandtyp(t) {
  return WANDTYPEN.includes(t) ? t : WANDTYP_DEFAULT;
}

/**
 * Wandtyp eines Altbestands ableiten: aus dem ROHEN (nicht mit Standardwerten
 * aufgefuellten) Alt-Feld `eingaben.statik.mitWind`.
 *   true / 'ja'   -> 'mit_wind'
 *   false / 'nein' -> 'ohne_wind'
 *   fehlt          -> 'mit_wind' (kompatibler bisheriger Standard)
 * @param {any} eingabenRoh die gespeicherten Eingaben OHNE standardEingaben()-Auffuellung
 */
export function wandtypAusLegacy(eingabenRoh) {
  const mw = eingabenRoh && eingabenRoh.statik ? eingabenRoh.statik.mitWind : undefined;
  if (mw === undefined || mw === null || mw === "") return WANDTYP_DEFAULT;
  if (mw === false || mw === "nein") return "ohne_wind";
  return WANDTYP_DEFAULT;
}

/**
 * Einen Eintrag/ein Projekt-Objekt normalisieren: fehlt `wandelement.wandtyp`,
 * wird er einmalig aus dem Alt-Feld abgeleitet, sonst nur normalisiert. Das
 * Alt-Feld selbst bleibt unangetastet (Datenerhalt), wird aber nirgends mehr
 * fachlich angewendet.
 * @param {{wandelement?:any, eingaben?:any}} eintrag
 * @returns {boolean} true, wenn das Wandelement veraendert wurde
 */
function _normalisiereWandtyp(eintrag) {
  const w = eintrag && eintrag.wandelement;
  if (!w || typeof w !== "object") return false;
  const vorher = w.wandtyp;
  w.wandtyp = (vorher === undefined || vorher === null)
    ? wandtypAusLegacy(eintrag.eingaben)
    : normWandtyp(vorher);
  return w.wandtyp !== vorher;
}

// --- interne Helfer -------------------------------------------------------

/** @returns {Record<string, any>} die rohe Elemente-Map (nie null). */
function _lesenMap() {
  try {
    const raw = localStorage.getItem(K_ELEM);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === "object") ? obj : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, any>} map */
function _schreibenMap(map) {
  localStorage.setItem(K_ELEM, JSON.stringify(map));
  _benachrichtige();
}

/** Neue, kollisionsarme id. */
function _neueId() {
  try {
    if (globalThis.crypto && crypto.randomUUID) return "w-" + crypto.randomUUID();
  } catch { /* ignore */ }
  return "w-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function _jetzt() { return new Date().toISOString(); }

/** Sicherstellen, dass ein Wandelement-artiges Objekt vorliegt. */
function _istWandelement(o) {
  return !!o && typeof o === "object" && "length_mm" in o && Array.isArray(o.courses);
}

// --- Migration ------------------------------------------------------------

/** Setzt/aktualisiert die Schema-Version und fuehrt faellige Datenmigrationen aus. */
export function migrieren() {
  let v = 0;
  try { v = Number(localStorage.getItem(K_VERSION)) || 0; } catch { /* ignore */ }
  if (v < SCHEMA_VERSION) {
    // (v === 0): Erstinstallation oder Stand vor Versionierung.
    if (v < 3) _migriereWandtyp();
    localStorage.setItem(K_VERSION, String(SCHEMA_VERSION));
  }
  return SCHEMA_VERSION;
}

/**
 * v3-Migration: jedes gespeicherte Wandelement ohne `wandtyp` bekommt ihn
 * einmalig aus dem Alt-Feld `eingaben.statik.mitWind` abgeleitet. Laeuft genau
 * einmal (danach steht das Feld am Wandelement) und schreibt nichts anderes um —
 * insbesondere bleibt das Alt-Feld erhalten.
 */
function _migriereWandtyp() {
  const map = _lesenMap();
  let dirty = false;
  for (const e of Object.values(map)) {
    if (_normalisiereWandtyp(e)) dirty = true;
  }
  if (dirty) localStorage.setItem(K_ELEM, JSON.stringify(map));   // still: laeuft vor den Hoerern
}

// --- Lesen ----------------------------------------------------------------

/** @returns {Array<{id:string,name:string,wandelement:any,erstellt:string,geaendert:string}>}
 *  Alle Eintraege, neueste Aenderung zuerst. */
export function listeElemente() {
  const map = _lesenMap();
  return Object.values(map).sort((a, b) => (b.geaendert || "").localeCompare(a.geaendert || ""));
}

/** @param {string} id */
export function holeElement(id) {
  return _lesenMap()[id] || null;
}

/** @returns {string|null} id des aktiven Elements. */
export function aktivId() {
  try { return localStorage.getItem(K_AKTIV) || null; } catch { return null; }
}

/** @returns {object|null} der aktive Eintrag (mit Metadaten). */
export function aktivesElement() {
  const id = aktivId();
  return id ? holeElement(id) : null;
}

/** @returns {object|null} das aktive Wandelement — das lesen die Module. */
export function aktivesWandelement() {
  const e = aktivesElement();
  return e ? e.wandelement : null;
}

// --- Schreiben ------------------------------------------------------------

/** Aktives Element setzen (oder Auswahl aufheben mit null). @param {string|null} id */
export function setzeAktiv(id) {
  if (id == null) { localStorage.removeItem(K_AKTIV); }
  else { localStorage.setItem(K_AKTIV, String(id)); }
  _benachrichtige();
}

/**
 * Element speichern (neu anlegen oder bestehendes ueberschreiben).
 * `eingaben` bleibt erhalten (Modul 1 schreibt nur das Wandelement zurueck) und
 * kann optional gesetzt/gemergt werden (z. B. beim Projekt-Import).
 * @param {string} name @param {object} wandelement @param {string} [id]
 * @param {object} [eingaben] optionaler Eingaben-Patch (wird gemergt)
 * @returns {string} die id
 */
export function speichere(name, wandelement, id, eingaben) {
  const map = _lesenMap();
  const jetzt = _jetzt();
  const eid = id && map[id] ? id : (id || _neueId());
  const vorher = map[eid];
  map[eid] = {
    id: eid,
    name: (name || wandelement?.name || "Wandelement").toString(),
    wandelement,
    eingaben: eingaben ? _merge(vorher?.eingaben || {}, eingaben) : (vorher?.eingaben || undefined),
    erstellt: vorher?.erstellt || jetzt,
    geaendert: jetzt,
  };
  if (map[eid].eingaben == null) delete map[eid].eingaben;
  _schreibenMap(map);
  return eid;
}

/**
 * Das AKTIVE Element aktualisieren (Modul schreibt sein Ergebnis zurueck).
 * Ohne aktives Element wird ein neues angelegt und aktiv gesetzt.
 * @param {object} wandelement @returns {string} id
 */
export function speichereAktiv(wandelement) {
  const id = aktivId();
  const name = wandelement?.name || aktivesElement()?.name;
  const eid = speichere(name, wandelement, id || undefined);
  if (!id) setzeAktiv(eid);
  return eid;
}

/** @param {string} id */
export function loesche(id) {
  const map = _lesenMap();
  if (!(id in map)) return;
  delete map[id];
  _schreibenMap(map);
  if (aktivId() === id) setzeAktiv(null);
}

/** @param {string} id @param {string} name */
export function umbenennen(id, name) {
  const map = _lesenMap();
  if (!map[id]) return;
  map[id].name = (name || map[id].name).toString();
  map[id].geaendert = _jetzt();
  _schreibenMap(map);
}

// --- Datei-Export / -Import ----------------------------------------------

/** Sicherer Dateiname aus einem Elementnamen. */
function _dateiname(name) {
  const s = (name || "wandelement").toString().trim().replace(/[^\wäöüÄÖÜß .-]+/g, "_").replace(/\s+/g, "_");
  return (s || "wandelement") + ".json";
}

/**
 * Aktives (oder per id gewaehltes) Wandelement als JSON herunterladen.
 * Export = reines Wandelement-JSON (kompatibel zu den Modul-Tools).
 * @param {string} [id]
 */
export function exportiere(id) {
  const e = id ? holeElement(id) : aktivesElement();
  if (!e) throw new Error("Kein Element zum Export gewaehlt.");
  const blob = new Blob([JSON.stringify(e.wandelement, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = _dateiname(e.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * JSON-Text zu {name, wandelement, eingaben?} deuten. Akzeptiert:
 *  - Projekt v2 { format:'SEMBLA-Projekt', version:2, wandelement, eingaben }
 *  - Alt-Bundle { format:'SEMBLA-Projekt', wandelement, projekt?, verbinder_layout? }
 *  - reines Wandelement (length_mm + courses)
 *  - Wrapper { name?, wandelement }
 * @param {string} text @returns {{name:string, wandelement:object, eingaben?:object}}
 */
export function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error("Datei ist kein gueltiges JSON."); }
  // Verwechseltes Format klar benennen statt „kein Wandelement erkannt“.
  if (obj && obj.format === "SEMBLA-Bauteilkatalog") {
    throw new Error("Das ist ein Bauteilkatalog — bitte im Abschnitt „Bauteilkatalog“ mit „Katalog importieren…“ laden.");
  }
  let we = null, name = null, eingaben;
  if (obj && obj.format === "SEMBLA-Projekt" && _istWandelement(obj.wandelement)) {
    we = obj.wandelement; name = obj.name || obj.wandelement.name;
    if (obj.eingaben && typeof obj.eingaben === "object") eingaben = obj.eingaben;   // Projekt v2
    else if (obj.projekt && typeof obj.projekt === "object") eingaben = { projekt: obj.projekt };  // Alt-Bundle
  }
  else if (_istWandelement(obj)) { we = obj; name = obj.name; }
  else if (obj && _istWandelement(obj.wandelement)) { we = obj.wandelement; name = obj.name || obj.wandelement.name; }
  if (!we) throw new Error("Kein Wandelement in der Datei erkannt (length_mm/courses fehlen).");
  // Alt-Dateien liefen nie durch migrieren() -> Wandtyp hier genauso einmalig ableiten.
  _normalisiereWandtyp({ wandelement: we, eingaben });
  return { name: (name || "Importiert").toString(), wandelement: we, eingaben };
}

/**
 * Text importieren: als neues Element ablegen (mit Eingaben) und aktiv setzen.
 * @param {string} text @param {string} [dateiname] @returns {string} id
 */
export function importiereText(text, dateiname) {
  const { name, wandelement, eingaben } = parseImport(text);
  const finalName = wandelement?.name || name || (dateiname ? dateiname.replace(/\.json$/i, "") : "Importiert");
  const id = speichere(finalName, wandelement, undefined, eingaben);
  setzeAktiv(id);
  return id;
}

/**
 * Datei (File) importieren. @param {File} file @returns {Promise<string>} id
 */
export function importiereDatei(file) {
  return file.text().then((text) => importiereText(text, file.name));
}

// --- Bauteilgeometrie (OBJ) ----------------------------------------------

/** @param {'i2'|'i3'} typ */
export function holeObj(typ) {
  try { return localStorage.getItem(K_OBJ(typ)); } catch { return null; }
}
/** @param {'i2'|'i3'} typ @param {string} inhalt */
export function setzeObj(typ, inhalt) {
  localStorage.setItem(K_OBJ(typ), inhalt);
  _benachrichtige();
}
/** @param {'i2'|'i3'} typ */
export function loescheObj(typ) {
  localStorage.removeItem(K_OBJ(typ));
  _benachrichtige();
}

// --- Bauteilkatalog (eigene Ressource, EIN aktiver Slot) ------------------
// Der Katalog gehoert NICHT ins Projekt: er liegt in `sembla:katalog`, wird als
// eigene Datei (`SEMBLA-Bauteilkatalog`) getrennt vom Projekt/ZIP aus- und
// eingelesen und von Modul 0 gepflegt. Im Projekt steht nur `eingaben.katalog`
// (Produkt-IDs je Kategorie + Herkunftsnotiz).

/** @returns {object|null} der geladene Katalog (null = keiner geladen). */
export function holeKatalog() {
  try {
    const raw = localStorage.getItem(K_KATALOG);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return (o && typeof o === "object" && Array.isArray(o.produkte)) ? o : null;
  } catch { return null; }
}

/**
 * Katalog setzen/ueberschreiben. Ungueltige Kataloge werden abgelehnt (Fehler),
 * nie stillschweigend zurechtgebogen.
 * @param {object} katalog @returns {object} der gespeicherte Katalog
 */
export function setzeKatalog(katalog) {
  const fehler = validiereKatalog(katalog);
  if (fehler.length) throw new Error("Katalog ungueltig:\n– " + fehler.join("\n– "));
  const gespeichert = { ...katalogObjekt(katalog), geaendert: _jetzt() };
  localStorage.setItem(K_KATALOG, JSON.stringify(gespeichert));
  _benachrichtige();
  return gespeichert;
}

/** Katalog-Slot leeren (die Projektauswahl bleibt bewusst stehen -> Warnung). */
export function loescheKatalog() {
  localStorage.removeItem(K_KATALOG);
  _benachrichtige();
}

/**
 * Katalog-Datei-Text importieren (streng geprueft, getrennt vom Projektimport).
 * @param {string} text @returns {object} der gespeicherte Katalog
 */
export function importiereKatalogText(text) {
  return setzeKatalog(parseKatalog(text));
}

/** Katalog-Datei (File) importieren. @param {File} file @returns {Promise<object>} */
export function importiereKatalogDatei(file) {
  return file.text().then((text) => importiereKatalogText(text));
}

/** Geladenen Katalog als eigene JSON-Datei herunterladen (nicht im Projekt-ZIP). */
export function exportiereKatalog() {
  const k = holeKatalog();
  if (!k) throw new Error("Kein Bauteilkatalog geladen.");
  const obj = katalogObjekt(k);
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "SEMBLA_Bauteilkatalog_" + sicherName(obj.name) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return obj;
}

/**
 * ALTBESTAND, unwirksam ([P-15]): die frueher in Modul 0 gepflegte Produktauswahl je
 * Kategorie. Nur noch LESEN — fuer die Unwirksamkeits-Meldung in Modul 0. Es gibt
 * bewusst KEINE Schreibfunktion mehr und keine Uebersetzung in Verwendungsrollen.
 * @param {string} [id]
 */
export function katalogAuswahl(id) {
  const k = holeEingaben(id).katalog || {};
  return k.auswahl || {};
}

// --- Wandbezogene Produktreferenzen ([P-13]) ------------------------------
// Nur Produkt-IDs je Verwendungsrolle + Herkunftsnotiz des Katalogs. Eigentuemer ist
// das jeweils fachlich zustaendige Modul; jedes schreibt ausschliesslich seinen
// eigenen Eingaben-Abschnitt. Das Wandelement bleibt in jedem Fall unberuehrt.

/** Eingaben-Abschnitt eines Produkt-Blocks: Modul 1 -> 'planung', Modul 2 -> 'aufbau'. */
function _produktTeil(modul) {
  if (+modul === 1) return "planung";
  if (+modul === 2) return "aufbau";
  throw new Error("Produktreferenzen gehoeren zu Modul 1 oder 2.");
}

/** Produkt-Block eines Moduls lesen (`{quelle, rollen}`). @param {1|2} modul @param {string} [id] */
export function holeProdukte(modul, id) {
  const teil = holeEingaben(id)[_produktTeil(modul)] || {};
  return teil.produkte || leereProdukte();
}

/**
 * Produkte EINER Verwendungsrolle setzen (Mehrfachauswahl: Liste von Produkt-IDs).
 * Schreibt nur den Produkt-Block des besitzenden Moduls; die Rolle muss diesem Modul
 * gehoeren (sonst Fehler statt stillem Schreiben in den falschen Abschnitt).
 * @param {string} rolleId @param {string[]} ids @param {string} [id]
 * @returns {string|null} id des Elements
 */
export function setzeProduktrolle(rolleId, ids, id) {
  const r = rolle(rolleId);
  if (!r) throw new Error(`Unbekannte Verwendungsrolle „${rolleId}“.`);
  const liste = [...new Set((ids || []).filter((x) => x != null && String(x) !== "").map(String))];
  const k = holeKatalog();
  return mergeEingaben(_produktTeil(r.modul), {
    produkte: {
      rollen: { [rolleId]: liste },
      quelle: k ? { name: k.name, version: k.version } : null,
    },
  }, id);
}

// --- Eingaben (modeluebergreifende Nutzereingaben, Teil des Datenmodells) --

/** Tiefes Zusammenfuehren (Patch gewinnt; Arrays/null/Primitive ersetzen). */
function _merge(base, patch) {
  if (patch === undefined) return base;
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = (base && typeof base === "object" && !Array.isArray(base)) ? { ...base } : {};
  for (const k of Object.keys(patch)) out[k] = _merge(out[k], patch[k]);
  return out;
}

/**
 * Standard-Eingaben (Startwerte des Datenmodells). Sobald der Nutzer in einem
 * Modul etwas aendert, schreibt dieses Modul seinen Abschnitt via `mergeEingaben`
 * zurueck — so bleibt alles im einen Projekt-JSON und es gibt keinen Drift.
 * Die Werte entsprechen den bisherigen Modul-Vorgaben (Modul 1/2/4).
 */
export function standardEingaben() {
  return {
    // Modul 0 — Projekt-Kopfdaten (Startseite, am aktiven Element; reisen im Projekt-JSON mit)
    projekt: {
      name: "", bauherr: "", planverfasser: "Polycare Research Technology GmbH",
      phase: "Ausführungsplanung", plan_nr: "", index: "0", gez: "",
    },
    // Modul 1 — eigene Eingaben des Planungsmoduls, die NICHT ins Wandelement gehoeren.
    // Derzeit nur die wandbezogenen Produktreferenzen (Steine, Vorspannung, Anschluss,
    // Fugen): Produkt-IDs je Verwendungsrolle + Herkunftsnotiz, sonst nichts ([P-13]).
    planung: { produkte: leereProdukte() },
    // Modul 2 — Horizontaler Wandaufbau (Verbinder-/Lattenplanung)
    aufbau: {
      seite: "vorne",
      panel: { b_cm: 62.5, h_cm: 150, off_x_cm: 0, off_y_cm: 0 },
      achsen: { max_x_cm: 62.5, max_y_cm: 75, ohang_cm: 12.5 },
      verbinder: { typ: "FA-1", Rk: 0.5, gM: 2.0, wk: 0.8, gQ: 1.5 },
      latten: { breite_cm: 4, stange_cm: 150 },
      feld_cm: null,           // null = ganze Wand; sonst {x0,x1,y0,y1} in cm
      // Produktreferenzen dieses Moduls (Latten, Beplankung, Verbinder) — nur IDs.
      produkte: leereProdukte(),
    },
    // ALTBESTAND — frueher zentrale Produktauswahl in Modul 0, heute UNWIRKSAM ([P-15]).
    // Bleibt als leerer Block erhalten, damit Altprojekte unveraendert laden; er wird
    // nicht mehr geschrieben und nicht mehr angewendet.
    katalog: { quelle: null, auswahl: {} },
    // Modul 4 — Stueckliste & Kosten. Preise liegen NICHT mehr hier: sie werden je
    // Position aus dem Bauteilkatalog aufgeloest ([P-14]). Editierbar bleibt nur die
    // Waehrung. Gespeicherte Alt-Preise (`kosten.preise`) bleiben in Altprojekten
    // erhalten, werden aber nicht mehr gelesen und nicht mehr geschrieben.
    kosten: { waehrung: "EUR" },
    // Modul 3 — Statischer Nachweis (Schermer-Kennwerte; Geometrie, Oeffnungszahl
    // UND Wandtyp/Windsituation kommen aus dem Wandelement und werden NICHT hier
    // gespeichert). Flach nach Input-ID, damit der Projektstand des Nachweises
    // reproduzierbar mitreist. Das Alt-Feld `mitWind` wird bewusst NICHT mehr als
    // Standard erzeugt (ersetzt durch `wandelement.wandtyp`).
    statik: {
      // Material / Bibliothek
      f_k: 20, gamma_w: 13.8, gammaM_wand: 2.0, v_Rd: 3.5, mu_k: 0.5, gamma_mu: 1.5,
      // Gewindestange
      stab: "M10", As: 58, fyk_Stab: 640, fub_Stab: 800, gamma_s: 1.25,
      // Lasten — Wind & DIN 4103-1 (Windsituation steckt im Wandtyp des Wandelements)
      wlz: "2", qpFaktor: 2.1, cpe10: 0.8, torDominant: "dominant",
      gammaQ: 1.5, q1_I: 0.5, q1_II: 1.0, a_4103: 0.9,
      // Vorspannung
      e_m: 0.375, F0: 22, deltaF: 0.33, F_inf_min: 11, gammaP_fav: "1.1", gammaP_sup: 1.1,
      // Pruefwerte Biegung §6.2
      Nv1: 26.7, mRk1: 2.4, Nv2: 80, mRk2: 3.7, Nv3: 240, mRk3: 7.6,
      // Spannsystem-Bauteile
      b_Steg: 20, b_KpO: 120, t_KpO: 15, b_FpU: 120, t_FpU: 15, fyk_Platte: 235,
      gammaM0: 1.0, gammaM2: 1.25, k2_SK: 0.9, k2_Senk: 0.63,
      L_Mutter_min: 30, L_Mutter_vorh: 35, l_Platte: 375,
      // Deckenanschluss (Winkel)
      eW_Winkel: 1.5,
      // Transport / Hebezustand
      rho: 13.8, fy: 235, gammaG: 1.35, dyn: 1.30, nAnker: 2,
      blechB_mm: 80, blechT_mm: 35, hebelBlech_m: 0.375,
    },
  };
}

/** Eingaben eines Elements (Standardwerte + gespeicherte Aenderungen). @param {string} [id] */
export function holeEingaben(id) {
  const e = id ? holeElement(id) : aktivesElement();
  return _merge(standardEingaben(), (e && e.eingaben) || {});
}

/** @returns {object} Eingaben des aktiven Elements (mit Standardwerten aufgefuellt). */
export function aktiveEingaben() { return holeEingaben(); }

/**
 * Einen Eingabe-Abschnitt aktualisieren (Modul schreibt NUR seinen Teil zurueck).
 * Das Wandelement bleibt unberuehrt — nur Modul 1 aendert das Wandelement.
 * Ohne aktives/gewaehltes Element passiert nichts (return null).
 * @param {"projekt"|"planung"|"aufbau"|"kosten"|"statik"|"katalog"} teil @param {object} patch @param {string} [id]
 * @returns {string|null} id
 */
export function mergeEingaben(teil, patch, id) {
  const map = _lesenMap();
  const eid = (id && map[id]) ? id : aktivId();
  if (!eid || !map[eid]) return null;
  const cur = map[eid].eingaben || {};
  cur[teil] = _merge(cur[teil], patch);
  map[eid].eingaben = cur;
  map[eid].geaendert = _jetzt();
  _schreibenMap(map);
  return eid;
}

// --- Projekt-Export / -Import (JSON: Wandelement + Eingaben in einem) ------

/**
 * Vollstaendiges Projekt-Objekt (Single Source of Truth) fuer Datei/ZIP-Export.
 * @param {string} [id] @returns {{format:string,version:number,name:string,wandelement:object,eingaben:object}}
 */
export function projektObjekt(id) {
  const e = id ? holeElement(id) : aktivesElement();
  if (!e) throw new Error("Kein Element fuer den Export gewaehlt.");
  return {
    format: "SEMBLA-Projekt", version: PROJEKT_VERSION, name: e.name,
    wandelement: e.wandelement, eingaben: holeEingaben(e.id),
  };
}

/** Sicherer Basisname (ohne Endung) aus einem Elementnamen. */
export function sicherName(name) {
  const s = (name || "Wandelement").toString().trim()
    .replace(/[^\wäöüÄÖÜß .-]+/g, "_").replace(/\s+/g, "_");
  return s || "Wandelement";
}

/**
 * Projekt (Wandelement + Eingaben) als JSON herunterladen. @param {string} [id]
 */
export function exportiereProjekt(id) {
  const p = projektObjekt(id);
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "SEMBLA_Projekt_" + sicherName(p.name) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// --- Benachrichtigung (Navbar / UI auffrischen) --------------------------

/** @type {Set<() => void>} */
const _hoerer = new Set();

function _benachrichtige() {
  for (const cb of _hoerer) { try { cb(); } catch { /* ignore */ } }
}

/**
 * Auf Aenderungen reagieren (eigene Schreibvorgaenge + andere Tabs).
 * @param {() => void} cb @returns {() => void} Abmelden
 */
export function abonniere(cb) {
  _hoerer.add(cb);
  return () => _hoerer.delete(cb);
}

// Aenderungen aus anderen Tabs/Fenstern spiegeln.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key.startsWith("sembla:")) _benachrichtige();
  });
}

// Beim Laden einmal migrieren.
if (typeof localStorage !== "undefined") {
  try { migrieren(); } catch { /* ignore */ }
}
