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
 *
 * Ein Eintrag: { id, name, wandelement, erstellt, geaendert }   (ISO-Zeitstempel)
 *
 * ES-Modul: wird im Browser per <script type="module"> geladen. Kein Node-Betrieb.
 */

const K_ELEM = "sembla:elemente";
const K_AKTIV = "sembla:aktiv";
const K_VERSION = "sembla:version";
const K_OBJ = (typ) => `sembla:obj:${typ}`;

/** Aktuelle Schema-Version. Aeltere Staende werden beim Lesen migriert. */
export const SCHEMA_VERSION = 1;

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

/** Setzt/aktualisiert die Schema-Version. Platz fuer spaetere Datenmigration. */
export function migrieren() {
  let v = 0;
  try { v = Number(localStorage.getItem(K_VERSION)) || 0; } catch { /* ignore */ }
  if (v < SCHEMA_VERSION) {
    // (v === 0): Erstinstallation oder Stand vor Versionierung — nichts umzuschreiben.
    localStorage.setItem(K_VERSION, String(SCHEMA_VERSION));
  }
  return SCHEMA_VERSION;
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
 * @param {string} name @param {object} wandelement @param {string} [id]
 * @returns {string} die id
 */
export function speichere(name, wandelement, id) {
  const map = _lesenMap();
  const jetzt = _jetzt();
  const eid = id && map[id] ? id : (id || _neueId());
  const vorher = map[eid];
  map[eid] = {
    id: eid,
    name: (name || wandelement?.name || "Wandelement").toString(),
    wandelement,
    erstellt: vorher?.erstellt || jetzt,
    geaendert: jetzt,
  };
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
 * JSON-Text zu {name, wandelement} deuten. Akzeptiert:
 *  - reines Wandelement (length_mm + courses)
 *  - Wrapper { name?, wandelement }
 *  - Wrapper { typ:'sembla-wandelement', ... }
 * @param {string} text @returns {{name:string, wandelement:object}}
 */
export function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error("Datei ist kein gueltiges JSON."); }
  let we = null, name = null;
  if (_istWandelement(obj)) { we = obj; name = obj.name; }
  else if (obj && _istWandelement(obj.wandelement)) { we = obj.wandelement; name = obj.name || obj.wandelement.name; }
  if (!we) throw new Error("Kein Wandelement in der Datei erkannt (length_mm/courses fehlen).");
  return { name: (name || "Importiert").toString(), wandelement: we };
}

/**
 * Text importieren: als neues Element ablegen und aktiv setzen.
 * @param {string} text @param {string} [dateiname] @returns {string} id
 */
export function importiereText(text, dateiname) {
  const { name, wandelement } = parseImport(text);
  const finalName = wandelement?.name || name || (dateiname ? dateiname.replace(/\.json$/i, "") : "Importiert");
  const id = speichere(finalName, wandelement);
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
