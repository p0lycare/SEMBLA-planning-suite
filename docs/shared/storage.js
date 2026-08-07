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
 *   sembla:kataloge  { [id]: …SEMBLA-Bauteilkatalog } Bauteilkataloge (eigene Ressource, [L-12])
 *   sembla:aktiv:katalog       "<id>"                    Rueckfall, solange KEIN Projekt aktiv ist
 *   sembla:projekte  [ …SEMBLA-Projektmappe ]      MEHRERE Projektmappen — je Projekt eine ([L-6])
 *   sembla:aktiv:projekt       "<id>"                    aktives Projekt ([L-10])
 *   sembla:aktiv:gebaeude      "<id>"                    aktives Gebaeude im aktiven Projekt
 *   sembla:aktiv:geschoss      "<id>"                    aktives Geschoss im aktiven Projekt
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
 * AUSNAHME Projektmappe ([L-1]…[L-7]): Projektstruktur (Projekt/Gebaeude/Geschoss)
 * und die LAGE der Waende im 125-mm-Raster sind ebenfalls eine eigene Ressource
 * (eigener Schluessel, eigenes Dateiformat `SEMBLA-Projektmappe`, Logik in
 * sembla-projektmappe.js). Sie liegen bewusst NICHT im Wandelement und nicht in
 * `eingaben`: so kann Modul 1 die Lagedaten gar nicht ueberschreiben, und die
 * Einbahnstrasse aus [P-1] bleibt heil. Verknuepft wird ueber die stabile id des
 * Wandeintrags ([L-4]) — die Wandliste (`sembla:elemente`) bleibt unveraendert
 * der Wandspeicher.
 *
 * NICHT hier: das PLANBILD eines Geschosses ([L-8]). Ein Grundriss sprengt den
 * localStorage und riss dabei den ganzen Projektstand mit; die Bilder liegen
 * deshalb in einer eigenen IndexedDB (docs/shared/sembla-plan.js). In der Mappe
 * steht nur die Beschreibung: Dateiname, Bildmasse, Massstab, Versatz.
 *
 * ES-Modul: wird im Browser per <script type="module"> geladen. Kein Node-Betrieb.
 */

import { katalogObjekt, leereProdukte, parseKatalog, produktrollenVorschlag, rolle,
         rollenIds, rollenVonModul, validiereKatalog } from "./sembla-katalog.js";
import { alleGeschosse, alleWaende, benenneUm as benenneInMappeUm,
         entferneWand as entferneWandAusMappe,
         findeGebaeude, findeGeschoss, findeWand, kopfdaten as mappeKopfdaten,
         leereMappe, mappeObjekt, neueId as neueMappenId, normMappe, parseMappe, pruefeReferenzen,
         setzeKatalogRef, setzeKopfdaten as setzeMappenKopfdaten,
         setzePlan, setzePlanAnsicht, setzeWand,
         uebernehmeElemente, validiereMappe } from "./sembla-projektmappe.js";

const K_ELEM = "sembla:elemente";
const K_AKTIV = "sembla:aktiv";
const K_VERSION = "sembla:version";
const K_OBJ = (typ) => `sembla:obj:${typ}`;
const K_KATALOG = "sembla:katalog";          // Altbestand vor v5 (Einzel-Slot) — nur Migration
const K_KATALOGE = "sembla:kataloge";
const K_AKTIV_KAT = "sembla:aktiv:katalog";   // nur wirksam, solange KEIN Projekt aktiv ist
const K_MAPPE = "sembla:projektmappe";       // Altbestand vor v5 (EINE Mappe) — nur Migration
const K_PROJEKTE = "sembla:projekte";
const K_AKTIV_PRJ = "sembla:aktiv:projekt";
const K_AKTIV_GEB = "sembla:aktiv:gebaeude";
const K_AKTIV_GS = "sembla:aktiv:geschoss";

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
 *  NICHT migriert — eine Kategorie->Rollen-Uebersetzung waere mehrdeutig ([P-15]).
 *  Bleibt 3 auch mit den Darstellungsoptionen der Zeichnung (`eingaben.zeichnung`,
 *  Modul 7): reine Ansichtsoptionen, beim Lesen aus `standardEingaben()` aufgefuellt
 *  ([D-7]) — nichts zu migrieren.
 *  v4: Projektstruktur/Geschosslayout ([L-1]…[L-7]). Neuer Schluessel
 *  `sembla:projektmappe` plus die aktiven Zeiger `sembla:aktiv:gebaeude` und
 *  `sembla:aktiv:geschoss`. Vorhandene Waende wandern EINMALIG und verlustfrei in
 *  ein automatisch angelegtes „Projekt ohne Plan“ — OHNE Lagedaten, denn die gab es
 *  nie und werden nicht erfunden ([L-7]). `sembla:elemente`/`sembla:aktiv` bleiben
 *  unveraendert der Wandspeicher; Wandelement, Eingaben und Katalog werden dabei
 *  NICHT angefasst, die Module 1–7 merken von der Migration nichts.
 *  v5: MEHRERE Projekte ([L-6], Etappe C3.1). Aus `sembla:projektmappe` (genau eine
 *  Mappe) wird die Liste `sembla:projekte` (je Projekt eine Mappe, Form UNVERAENDERT —
 *  `MAPPE_VERSION` bleibt 1), dazu der Zeiger `sembla:aktiv:projekt`. Aus dem
 *  Einzel-Slot `sembla:katalog` wird der Katalogspeicher `sembla:kataloge`; der
 *  vorhandene Katalog wird dem uebernommenen Projekt zugeordnet ([L-12]). Beides
 *  laeuft verlustfrei und ohne Rueckfrage; Wandelemente, Eingaben, Lagen und der
 *  Zeiger auf die aktive Wand bleiben unangetastet ([L-7]). */
export const SCHEMA_VERSION = 5;

/** Version des OEFFENTLICHEN Projekt-Dateiformats (Export/Import).
 *  Bleibt 2: `wandtyp` (Wandelement) sowie die Eingaben-Zusatzfelder `eingaben.katalog`,
 *  `eingaben.planung`, `eingaben.aufbau.produkte` und `eingaben.zeichnung` sind
 *  OPTIONAL (Darstellungsoptionen, [D-7]). Der v2-Parser
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
    if (v < 4) _migriereProjektmappe();
    if (v < 5) _migriereProjekte();
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

/**
 * v4-Migration ([L-7]): vorhandene Waende einmalig in eine Projektmappe
 * uebernehmen — OHNE Lagedaten (die gab es nie und werden nicht erfunden).
 *
 * Verlustfrei und beruehrungsarm: Wandelemente, Eingaben, Katalog und der Zeiger
 * auf die aktive Wand bleiben unveraendert. Existiert bereits eine Mappe, wird
 * sie nur ergaenzt (bereits eingetragene Kennungen bleiben unangetastet). Gibt es
 * gar keine Waende, entsteht keine leere Mappe auf Vorrat — Modul 0 legt sie beim
 * ersten Bedarf an (`mappeOderNeu`).
 */
function _migriereProjektmappe() {
  const elemente = Object.values(_lesenMap()).map((e) => ({ id: e.id, name: e.name }));
  const vorhandene = _leseAltMappeRoh();
  if (!elemente.length && !vorhandene) return;
  const m = uebernehmeElemente(elemente, vorhandene || undefined);
  localStorage.setItem(K_MAPPE, JSON.stringify(mappeObjekt(m)));   // still: laeuft vor den Hoerern
}

/** Die EINE Mappe des Altstands (Schluessel `sembla:projektmappe`) — nur fuer die Migration. */
function _leseAltMappeRoh() {
  try {
    const raw = localStorage.getItem(K_MAPPE);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return (o && typeof o === "object" && Array.isArray(o.gebaeude)) ? o : null;
  } catch { return null; }
}

/**
 * v5-Migration ([L-6]/[L-7]/[L-12]): aus EINER Mappe wird eine LISTE von Mappen und
 * aus dem Einzel-Katalogslot ein Katalogspeicher.
 *
 * Verlustfrei und ohne Rueckfrage: die vorhandene Mappe wird unveraendert (Form nach
 * MAPPE_VERSION 1) das ERSTE Projekt und aktiv gesetzt; ein vorhandener Katalog wird
 * in den Speicher uebernommen und genau diesem Projekt zugeordnet — geraten wird
 * nichts, denn es gab bisher nur eines von beidem. Wandelemente, Eingaben, Lagen und
 * der Zeiger auf die aktive Wand bleiben unberuehrt. Gibt es weder Mappe noch Katalog,
 * entsteht kein leerer Stand auf Vorrat.
 */
function _migriereProjekte() {
  const alt = _leseAltMappeRoh();
  const altKatalog = _leseAltKatalogRoh();
  if (!alt && !altKatalog) return;

  let katalogId = null;
  if (altKatalog) {
    katalogId = String(altKatalog.id || neueMappenId("kat"));
    const speicher = _leseKataloge();
    speicher[katalogId] = { ...katalogObjekt(altKatalog), id: katalogId };
    localStorage.setItem(K_KATALOGE, JSON.stringify(speicher));
    localStorage.setItem(K_AKTIV_KAT, katalogId);
    localStorage.removeItem(K_KATALOG);
  }
  if (!alt) return;

  const m = normMappe(alt);
  if (katalogId) m.katalog = katalogId;
  localStorage.setItem(K_PROJEKTE, JSON.stringify([mappeObjekt(m)]));
  localStorage.setItem(K_AKTIV_PRJ, m.projekt.id);
  localStorage.removeItem(K_MAPPE);                 // kein zweiter Stand derselben Daten
}

/** Der Katalog des Altstands (Schluessel `sembla:katalog`) — nur fuer die Migration. */
function _leseAltKatalogRoh() {
  try {
    const raw = localStorage.getItem(K_KATALOG);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return (o && typeof o === "object" && Array.isArray(o.produkte)) ? o : null;
  } catch { return null; }
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

/**
 * Aktives Element setzen (oder Auswahl aufheben mit null).
 *
 * Nach [L-10] ist die Aktivierung streng hierarchisch: ist die Wand in einem
 * Geschoss eingetragen, muss GENAU DIESES Geschoss aktiv sein. Der Weg dorthin wird
 * benannt statt still mitaktiviert. Eine Wand ohne Eintrag (unverortet) hat keine
 * Eltern und ist jederzeit aktivierbar.
 * @param {string|null} id
 */
export function setzeAktiv(id) {
  if (id == null) { localStorage.removeItem(K_AKTIV); }
  else {
    const ort = wandVerortung(id);
    if (ort) {
      const aktiv = aktivesGeschoss();
      if (!aktiv || aktiv.geschoss.id !== ort.geschoss.id) {
        throw new Error(`Wand „${ort.wand.name || id}“ liegt in Geschoss „${ort.geschoss.name}“ `
          + `des Projekts „${ort.mappe.projekt.name}“ — erst dieses Geschoss aktiv setzen ([L-10]).`);
      }
    }
    localStorage.setItem(K_AKTIV, String(id));
  }
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

/**
 * Wandelement loeschen. Ist die Wand in der Projektmappe verortet, wird ihr
 * Eintrag mitgeloescht: das Loeschen ist eine ausdrueckliche Nutzeraktion, und
 * ein zurueckbleibender Eintrag waere dauerhaft verwaist ([L-4]). Der umgekehrte
 * Weg gilt NICHT — ein verwaister Eintrag loescht nie ein Wandelement.
 * @param {string} id
 */
export function loesche(id) {
  const map = _lesenMap();
  if (!(id in map)) return;
  delete map[id];
  _schreibenMap(map);
  if (aktivId() === id) setzeAktiv(null);
  try {
    const ort = wandVerortung(id);
    if (ort) setzeMappe(entferneWandAusMappe(ort.mappe, id));
  } catch { /* Mappe kaputt/fehlend: das Wandelement ist trotzdem geloescht */ }
}

/**
 * Wandelement umbenennen. Ist die Wand in der Projektmappe eingetragen, wird der
 * NAME dort mitgefuehrt — er ist nach [L-4] reine Anzeige (die Referenz ist die id),
 * und ein veralteter Name in der Mappendatei waere eine zweite, falsche Wahrheit.
 * Lage und Wandelement bleiben unberuehrt.
 * @param {string} id @param {string} name
 */
export function umbenennen(id, name) {
  const map = _lesenMap();
  if (!map[id]) return;
  map[id].name = (name || map[id].name).toString();
  map[id].geaendert = _jetzt();
  _schreibenMap(map);
  try {
    const ort = wandVerortung(id);
    if (ort) setzeMappe(benenneInMappeUm(ort.mappe, id, map[id].name));
  } catch { /* Mappe kaputt/fehlend: das Wandelement ist trotzdem umbenannt */ }
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

// --- Bauteilkatalog (eigene Ressource, EIN Katalog JE PROJEKT [L-12]) -----
// Der Katalog gehoert NICHT ins Projekt-JSON: er liegt im eigenen Speicher
// `sembla:kataloge` (Kennung -> Katalog), wird als eigene Datei
// (`SEMBLA-Bauteilkatalog`) getrennt vom Projekt/ZIP aus- und eingelesen und von
// Modul 0 gepflegt. Die ZUORDNUNG haengt am Projekt (`mappe.katalog` = Kennung);
// der wirksame Katalog folgt dem AKTIVEN Projekt. Ohne Zuordnung wird das gemeldet
// und KEIN Katalog geraten — insbesondere nicht der eines anderen Projekts.

/** Der ganze Katalogspeicher als { id: Katalog }. */
function _leseKataloge() {
  try {
    const raw = localStorage.getItem(K_KATALOGE);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
  } catch { return {}; }
}

function _schreibeKataloge(map) {
  localStorage.setItem(K_KATALOGE, JSON.stringify(map));
}

/** Alle gespeicherten Kataloge (Reihenfolge = Einfuegereihenfolge). */
export function listeKataloge() {
  return Object.values(_leseKataloge()).filter((k) => k && Array.isArray(k.produkte));
}

/** Einen Katalog per Kennung lesen (null = unbekannt). @param {string} id */
export function katalogNachId(id) {
  const k = _leseKataloge()[String(id)];
  return (k && Array.isArray(k.produkte)) ? k : null;
}

/**
 * Zuordnungsstatus des wirksamen Katalogs ([L-12]) — die Begruendung zu `holeKatalog`.
 * @returns {{status:'ok'|'kein_projekt'|'nicht_zugeordnet'|'fehlt'|'mehrdeutig', katalog:object|null, id:string|null}}
 */
export function katalogStatus() {
  const m = holeMappe();
  if (!m) {
    // Ohne Projekt gibt es keine Zuordnungsfrage nach [L-12]. Dann gilt der zuletzt
    // AUSDRUECKLICH gesetzte Katalog (`sembla:aktiv:katalog`) — geraten wird auch hier
    // nichts: fehlt der Zeiger oder ist er verwaist, gibt es keinen Katalog. Sobald ein
    // Projekt aktiv ist, zaehlt ausschliesslich dessen Zuordnung.
    let zeiger = null;
    try { zeiger = localStorage.getItem(K_AKTIV_KAT); } catch { /* ignore */ }
    const k = zeiger ? katalogNachId(zeiger) : null;
    return k ? { status: "ok", katalog: k, id: String(zeiger) }
             : { status: "kein_projekt", katalog: null, id: null };
  }
  if (!m.katalog) return { status: "nicht_zugeordnet", katalog: null, id: null };
  const k = katalogNachId(m.katalog);
  return k ? { status: "ok", katalog: k, id: String(m.katalog) }
           : { status: "fehlt", katalog: null, id: String(m.katalog) };
}

/** @returns {object|null} der wirksame Katalog des aktiven Projekts ([L-12]). */
export function holeKatalog() {
  return katalogStatus().katalog;
}

/**
 * Katalog speichern und — sofern ein Projekt aktiv ist — diesem zuordnen ([L-12]).
 * Ungueltige Kataloge werden abgelehnt (Fehler), nie stillschweigend zurechtgebogen.
 * Die Kennung bleibt stabil: ein Katalog MIT Kennung wird an ihr fortgeschrieben,
 * einer ohne bekommt eine neue. So ueberschreibt ein neu angelegter oder
 * importierter Katalog nie den bisherigen — er tritt neben ihn und wird zugeordnet.
 * @param {object} katalog @returns {object} der gespeicherte Katalog
 */
export function setzeKatalog(katalog) {
  const fehler = validiereKatalog(katalog);
  if (fehler.length) throw new Error("Katalog ungueltig:\n– " + fehler.join("\n– "));
  const m = holeMappe();
  const id = String((katalog && katalog.id) || neueMappenId("kat"));
  const gespeichert = { ...katalogObjekt(katalog), id, geaendert: _jetzt() };
  const speicher = _leseKataloge();
  speicher[id] = gespeichert;
  _schreibeKataloge(speicher);
  localStorage.setItem(K_AKTIV_KAT, id);          // greift nur ohne aktives Projekt
  if (m && m.katalog !== id) _schreibeMappe(setzeKatalogRef(m, id));
  _benachrichtige();
  return gespeichert;
}

/**
 * Dem aktiven Projekt einen vorhandenen Katalog zuordnen oder die Zuordnung
 * aufheben (`null`). Der Katalog selbst bleibt unberuehrt ([L-12]).
 * @param {string|null} id
 */
export function setzeProjektKatalog(id) {
  const m = holeMappe();
  if (!m) throw new Error("Kein aktives Projekt — ein Katalog wird immer einem Projekt zugeordnet ([L-12]).");
  if (id != null && id !== "" && !katalogNachId(id)) throw new Error(`Unbekannter Bauteilkatalog „${id}“.`);
  if (id) localStorage.setItem(K_AKTIV_KAT, String(id));
  const gespeichert = _schreibeMappe(setzeKatalogRef(m, id == null || id === "" ? null : String(id)));
  _benachrichtige();
  return gespeichert;
}

/**
 * Zuordnung des aktiven Projekts aufheben und den Katalog entfernen, sofern ihn
 * kein anderes Projekt mehr verwendet. Produktreferenzen in den Projekten bleiben
 * bewusst stehen -> Warnung statt stiller Bereinigung.
 */
export function loescheKatalog() {
  const st = katalogStatus();
  const m = holeMappe();
  if (m && m.katalog) _schreibeMappe(setzeKatalogRef(m, null));
  const id = st.id;
  if (id) {
    const nochGenutzt = listeProjekte().some((p) => p.katalog === id);
    if (!nochGenutzt) {
      const speicher = _leseKataloge();
      delete speicher[id];
      _schreibeKataloge(speicher);
    }
    try { if (localStorage.getItem(K_AKTIV_KAT) === id) localStorage.removeItem(K_AKTIV_KAT); }
    catch { /* ignore */ }
  }
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

// --- Projektmappen (Struktur + Lage, eigene Ressource) --------------------
// Projekt -> Gebaeude -> Geschoss -> Wandeintrag ([L-6]). Der Speicher haelt seit
// Schema v5 MEHRERE Mappen — je Projekt eine, in der Form voellig unveraendert
// (MAPPE_VERSION bleibt 1) — in der Liste `sembla:projekte`; genau eine davon ist
// aktiv (`sembla:aktiv:projekt`). Verknuepft wird ueber die stabile id des
// Wandeintrags ([L-4]); die Wandliste bleibt unveraendert der Wandspeicher, das
// Wandelement wird NIE angefasst ([L-3]).
//
// Die drei Zeiger Projekt -> Geschoss -> Wand bilden nach [L-10] einen PFAD: ein
// Geschoss laesst sich nur im AKTIVEN Projekt aktiv setzen, eine Wand nur in ihrem
// AKTIVEN Geschoss. Kein Aktivsetzen zieht die Ebenen darueber still mit; umgekehrt
// hebt ein Wechsel oben die Zeiger darunter AUF, statt sie auf Fremdes zu biegen.
// `sembla:aktiv:gebaeude` bleibt der interne Zeiger auf das eine Gebaeude des
// aktiven Projekts ([L-6]) und taucht in der Oberflaeche nicht mehr auf.

/** Rohe Mappenliste aus dem Speicher (ohne Normalisierung). @returns {any[]} */
function _leseProjekteRoh() {
  try {
    const raw = localStorage.getItem(K_PROJEKTE);
    if (!raw) return [];
    const o = JSON.parse(raw);
    return Array.isArray(o) ? o.filter((m) => m && typeof m === "object" && Array.isArray(m.gebaeude)) : [];
  } catch { return []; }
}

function _schreibeProjekte(liste) {
  localStorage.setItem(K_PROJEKTE, JSON.stringify(liste.map((m) => mappeObjekt(m))));
}

/** Alle Projektmappen in Anzeigereihenfolge (normalisiert). @returns {object[]} */
export function listeProjekte() {
  return _leseProjekteRoh().map(normMappe);
}

/** Eine Projektmappe per Projekt-Kennung (null = unbekannt). @param {string} id */
export function projektMappe(id) {
  return listeProjekte().find((m) => m.projekt.id === String(id)) || null;
}

/** @returns {string|null} Kennung des aktiven Projekts ([L-10]). */
export function aktivesProjektId() {
  try { return localStorage.getItem(K_AKTIV_PRJ) || null; } catch { return null; }
}

/**
 * Die Mappe des AKTIVEN Projekts (null = keines aktiv/angelegt).
 *
 * Fehlt der Zeiger oder ist er verwaist, wird NICHT geraten: es wird nur
 * zurueckgefallen, wenn es genau EIN Projekt gibt — dann ist die Wahl eindeutig.
 * @returns {object|null}
 */
export function holeMappe() {
  const alle = listeProjekte();
  if (!alle.length) return null;
  const id = aktivesProjektId();
  if (id) {
    const m = alle.find((x) => x.projekt.id === id);
    if (m) return m;
  }
  return alle.length === 1 ? alle[0] : null;
}

/** Alias mit sprechendem Namen — dieselbe Mappe wie `holeMappe`. */
export function aktivesProjekt() { return holeMappe(); }

/**
 * Aktives Projekt setzen (null = Auswahl aufheben). Nach [L-10] hebt ein
 * Projektwechsel die Zeiger DARUNTER auf — Geschoss und aktive Wand —, statt sie
 * auf einen fremden Eintrag zu biegen. Gehoerte die aktive Wand schon zum neuen
 * Projekt, bleibt sie erhalten: dann wird nichts gebogen.
 * @param {string|null} id
 */
export function setzeAktivesProjekt(id) {
  const vorher = aktivesProjektId();
  if (id == null || id === "") {
    localStorage.removeItem(K_AKTIV_PRJ);
  } else {
    if (!projektMappe(id)) throw new Error(`Unbekanntes Projekt „${id}“.`);
    localStorage.setItem(K_AKTIV_PRJ, String(id));
  }
  if (String(vorher || "") !== String(id || "")) {
    localStorage.removeItem(K_AKTIV_GEB);
    localStorage.removeItem(K_AKTIV_GS);
    const w = aktivId();
    const bleibt = w && id && (() => {
      const m = projektMappe(id);
      return !!(m && findeWand(m, w));
    })();
    if (!bleibt) localStorage.removeItem(K_AKTIV);
  }
  _benachrichtige();
}

/**
 * Eine Mappe in die Liste schreiben — STILL (ohne Benachrichtigung) und ohne
 * Pruefung der Zeiger. Interner Weg fuer `setzeMappe` und die Katalogzuordnung.
 * @param {object} mappe @returns {object} die gespeicherte Mappe
 */
function _schreibeMappe(mappe) {
  const m = normMappe(mappe);
  const gespeichert = { ...mappeObjekt(m), geaendert: _jetzt() };
  const liste = _leseProjekteRoh();
  const i = liste.findIndex((x) => x && x.projekt && String(x.projekt.id) === m.projekt.id);
  if (i >= 0) liste[i] = gespeichert; else liste.push(gespeichert);
  localStorage.setItem(K_PROJEKTE, JSON.stringify(liste));
  return gespeichert;
}

/**
 * Mappe setzen/ueberschreiben (anhand ihrer Projekt-Kennung). Ungueltige Mappen
 * werden abgelehnt (Fehler), nie stillschweigend zurechtgebogen ([P-9]). Eine noch
 * unbekannte Mappe wird angehaengt; ist noch kein Projekt aktiv, wird sie es.
 * @param {object} mappe @returns {object} die gespeicherte Mappe
 */
export function setzeMappe(mappe) {
  const m = normMappe(mappe);
  const fehler = validiereMappe(m);
  if (fehler.length) throw new Error("Projektmappe ungueltig:\n– " + fehler.join("\n– "));
  const neu = !projektMappe(m.projekt.id);
  const gespeichert = _schreibeMappe(m);
  if (neu && !aktivesProjektId()) localStorage.setItem(K_AKTIV_PRJ, m.projekt.id);
  _benachrichtige();
  return gespeichert;
}

/**
 * Neues Projekt anlegen (mit einem Gebaeude und einem Geschoss nach [L-6]) und
 * aktiv setzen. Bestehende Projekte bleiben unberuehrt.
 * @param {string} [name] @param {{geschoss?:string, hoehe_mm?:number}} [opt]
 * @returns {object} die gespeicherte Mappe
 */
export function fuegeProjektHinzu(name, opt) {
  const m = setzeMappe(leereMappe(name, opt));
  setzeAktivesProjekt(m.projekt.id);
  return m;
}

/**
 * Ein Projekt samt Struktur entfernen. Die WANDELEMENTE bleiben erhalten und gelten
 * danach als „nicht eingetragen“ ([L-4] — keine stille Bereinigung); Planbilder haengen
 * an der Geschoss-Kennung und werden von der Oberflaeche getrennt entfernt ([L-8]).
 * War das Projekt aktiv, werden die Zeiger darunter nach [L-10] aufgehoben.
 * @param {string} id @returns {object|null} die entfernte Mappe
 */
export function loescheProjekt(id) {
  const weg = projektMappe(id);
  if (!weg) return null;
  const liste = _leseProjekteRoh().filter((m) => String(m?.projekt?.id) !== String(id));
  localStorage.setItem(K_PROJEKTE, JSON.stringify(liste));
  if (aktivesProjektId() === String(id)) {
    localStorage.removeItem(K_AKTIV_PRJ);
    localStorage.removeItem(K_AKTIV_GEB);
    localStorage.removeItem(K_AKTIV_GS);
  }
  _benachrichtige();
  return weg;
}

/** Aktive Mappe liefern oder ein neues Projekt anlegen (Struktur nach [L-6]). */
export function mappeOderNeu(name) {
  return holeMappe() || fuegeProjektHinzu(name);
}

/** Das aktive Projekt entfernen. Waende, Eingaben und Kataloge bleiben unberuehrt. */
export function loescheMappe() {
  const id = holeMappe()?.projekt?.id;
  if (id) loescheProjekt(id); else _benachrichtige();
}

/**
 * Die AKTIVE Mappe mit einer REINEN Funktion aendern (lesen → anwenden → pruefen →
 * schreiben). Wirft die Funktion, bleibt der Speicher unveraendert.
 * @param {(m:object) => object} fn @returns {object} die gespeicherte Mappe
 */
export function aendereMappe(fn) {
  return setzeMappe(fn(mappeOderNeu()));
}

// --- Projekt-Kopfdaten ([L-11]) -------------------------------------------
// Die Kopfdaten leben AM PROJEKT und nirgends sonst. `eingaben.projekt` am
// Wandelement wird nicht mehr geschrieben und nur noch als RUECKFALL gelesen,
// wenn die Wand keinem Projekt zugeordnet ist — zusammengefuehrt wird nie.

/** Kopfdaten des aktiven Projekts setzen (Patch, leerer Wert loescht das Feld). */
export function setzeKopfdaten(patch) {
  const m = holeMappe();
  if (!m) throw new Error("Kein aktives Projekt — Kopfdaten gehören zum Projekt ([L-11]).");
  const gespeichert = setzeMappe(setzeMappenKopfdaten(m, patch));
  return gespeichert;
}

/**
 * Wirksame Kopfdaten einer Wand ([L-11]) samt benannter Quelle. Genau EINE Quelle
 * gilt: das Projekt, in dem die Wand eingetragen ist. Nur wenn sie keinem Projekt
 * zugeordnet ist, gilt der Altbestand `eingaben.projekt` als Rueckfall.
 * @param {string} [id] Wandkennung (Default: aktive Wand)
 * @returns {{kopfdaten:Record<string,any>, quelle:'projekt'|'wandelement', projekt:string|null}}
 */
export function wirksameKopfdaten(id) {
  const wid = id || aktivId();
  const ort = wid ? wandVerortung(wid) : null;
  if (ort && ort.mappe) {
    return { kopfdaten: mappeKopfdaten(ort.mappe), quelle: "projekt", projekt: ort.mappe.projekt.name };
  }
  const alt = (wid ? holeEingaben(wid) : holeEingaben()).projekt || {};
  return { kopfdaten: { ...alt }, quelle: "wandelement", projekt: null };
}

/**
 * Eingaben einer Wand mit den WIRKSAMEN Kopfdaten ([L-11]) — fuer Zeichnung,
 * Schriftfeld und Export. Der Abschnitt `projekt` wird vollstaendig ERSETZT, nie
 * gemischt; der gespeicherte Altbestand bleibt davon unberuehrt.
 * @param {string} [id]
 */
export function eingabenMitKopfdaten(id) {
  const e = holeEingaben(id);
  return { ...e, projekt: wirksameKopfdaten(id).kopfdaten };
}

// --- aktive Zeiger --------------------------------------------------------

/** @returns {string|null} */
export function aktivesGebaeudeId() {
  try { return localStorage.getItem(K_AKTIV_GEB) || null; } catch { return null; }
}
/** @returns {string|null} */
export function aktivesGeschossId() {
  try { return localStorage.getItem(K_AKTIV_GS) || null; } catch { return null; }
}

/**
 * Aktives Gebaeude setzen (null = Auswahl aufheben). Interner Zeiger: die Oberflaeche
 * zeigt die Gebaeude-Ebene nach [L-6] nicht. Das Gebaeude muss zum AKTIVEN Projekt
 * gehoeren ([L-10]). Gehoert das aktive Geschoss nicht zu diesem Gebaeude, wird sein
 * Zeiger AUFGEHOBEN statt auf ein fremdes Geschoss gebogen.
 * @param {string|null} id
 */
export function setzeAktivesGebaeude(id) {
  if (id == null) {
    localStorage.removeItem(K_AKTIV_GEB);
    localStorage.removeItem(K_AKTIV_GS);
    _benachrichtige();
    return;
  }
  const m = holeMappe();
  const geb = m ? findeGebaeude(m, id) : null;
  if (!geb) throw new Error(`Unbekanntes Gebäude „${id}“ im aktiven Projekt.`);
  localStorage.setItem(K_AKTIV_GEB, String(id));
  const gsId = aktivesGeschossId();
  if (gsId && !geb.geschosse.some((gs) => gs.id === gsId)) localStorage.removeItem(K_AKTIV_GS);
  _benachrichtige();
}

/**
 * Aktives Gebaeude. Fehlt der Zeiger oder ist er verwaist, wird NICHT geraten:
 * es wird nur zurueckgefallen, wenn die Mappe genau EIN Gebaeude hat ([L-6]).
 * @returns {object|null}
 */
export function aktivesGebaeude() {
  const m = holeMappe();
  if (!m) return null;
  const id = aktivesGebaeudeId();
  if (id) {
    const geb = findeGebaeude(m, id);
    if (geb) return geb;
  }
  return m.gebaeude.length === 1 ? m.gebaeude[0] : null;
}

/**
 * Aktives Geschoss setzen (null = Auswahl aufheben). Nach [L-10] geht das NUR im
 * aktiven Projekt: ein Geschoss eines anderen Projekts wird abgewiesen und der Weg
 * dorthin benannt — das Projekt wird nicht still mitaktiviert. Das zugehoerige
 * Gebaeude wird als interner Zeiger mitgesetzt, damit beide nie auseinanderlaufen;
 * eine aktive Wand ausserhalb des neuen Geschosses verliert ihren Zeiger.
 * @param {string|null} id
 */
export function setzeAktivesGeschoss(id) {
  if (id == null) {
    localStorage.removeItem(K_AKTIV_GS);
  } else {
    const m = holeMappe();
    const treffer = m ? findeGeschoss(m, id) : null;
    if (!treffer) {
      const fremd = listeProjekte().find((p) => findeGeschoss(p, id));
      throw new Error(fremd
        ? `Geschoss „${findeGeschoss(fremd, id).geschoss.name}“ gehört zum Projekt „${fremd.projekt.name}“ — `
          + "erst dieses Projekt aktiv setzen ([L-10])."
        : `Unbekanntes Geschoss „${id}“.`);
    }
    const vorher = aktivesGeschossId();
    localStorage.setItem(K_AKTIV_GS, String(id));
    localStorage.setItem(K_AKTIV_GEB, treffer.gebaeude.id);
    if (String(vorher || "") !== String(id)) {
      const w = aktivId();
      if (w && !treffer.geschoss.waende.some((x) => x.id === w)) localStorage.removeItem(K_AKTIV);
    }
  }
  _benachrichtige();
}

/**
 * Aktives Geschoss samt Gebaeude — immer innerhalb des aktiven Projekts. Fehlt der
 * Zeiger oder ist er verwaist, wird NICHT geraten: es wird nur zurueckgefallen, wenn
 * das Projekt genau EIN Geschoss hat.
 * @returns {{gebaeude:object, geschoss:object}|null}
 */
export function aktivesGeschoss() {
  const m = holeMappe();
  if (!m) return null;
  const id = aktivesGeschossId();
  if (id) {
    const treffer = findeGeschoss(m, id);
    if (treffer) return treffer;
  }
  const alle = alleGeschosse(m);
  return alle.length === 1 ? alle[0] : null;
}

// --- Verortung von Waenden ([L-3]/[L-4]) ----------------------------------

/**
 * Eine Wand in einem Geschoss eintragen oder ihre Lage aendern. Die id ist die
 * Kennung des WANDELEMENTS — sie wird hier nie vergeben und das Wandelement nie
 * geschrieben ([L-3]). Eine ungueltige Lage wird abgewiesen, nicht gerundet.
 *
 * @param {string} wandId @param {string} geschossId
 * @param {{name?:string, datei?:string|null, lage?:any}} [daten]
 * @returns {object} die gespeicherte Mappe
 */
export function verorteWand(wandId, geschossId, daten) {
  const e = holeElement(wandId);
  const d = daten || {};
  // Das Zielgeschoss bestimmt das Projekt — nicht der aktive Zeiger. So laesst sich
  // eine Wand auch in einem gerade nicht aktiven Projekt eintragen, ohne dass dafuer
  // still ein Zeiger umgesetzt wuerde ([L-10]).
  const ziel = listeProjekte().find((m) => findeGeschoss(m, geschossId)) || mappeOderNeu();
  // Steht die Wand bereits in einem ANDEREN Projekt, wird der alte Eintrag entfernt —
  // eine Wand gehoert zu genau einem Projekt (sonst gaebe es zwei Lagen fuer dieselbe Wand).
  const vorher = wandVerortung(wandId);
  if (vorher && vorher.mappe.projekt.id !== ziel.projekt.id) {
    setzeMappe(entferneWandAusMappe(vorher.mappe, wandId));
  }
  return setzeMappe(setzeWand(ziel, geschossId, {
    id: String(wandId),
    name: d.name !== undefined ? d.name : (e?.name || String(wandId)),
    datei: d.datei,
    lage: d.lage,
  }));
}

// --- Geschossplan ([L-8]/[L-9]) -------------------------------------------
// Hier steht AUSSCHLIESSLICH die Beschreibung des Plans (Dateiname, Bildmasse,
// Massstab, Versatz). Das BILD liegt nie im localStorage, sondern in der eigenen
// Plan-Datenbank (docs/shared/sembla-plan.js) — sonst risse ein 5-MB-Grundriss
// den gesamten Projektstand mit ([L-8]).

/**
 * Planbeschreibung eines Geschosses setzen oder aufheben (`null` = kein Plan).
 * @param {string} geschossId @param {any} plan @returns {object} die gespeicherte Mappe
 */
export function setzeGeschossPlan(geschossId, plan) {
  return aendereMappe((m) => setzePlan(m, geschossId, plan));
}

/**
 * Massstab/Versatz eines vorhandenen Plans aendern ([L-9]). Wandlagen bleiben
 * dabei unberuehrt — eine Neukalibrierung verschiebt keine Wand ([L-1]).
 * @param {string} geschossId
 * @param {{mm_je_pixel?:number|null, versatz_x_mm?:number, versatz_y_mm?:number}} patch
 * @returns {object} die gespeicherte Mappe
 */
export function setzeGeschossPlanAnsicht(geschossId, patch) {
  return aendereMappe((m) => setzePlanAnsicht(m, geschossId, patch));
}

/** Planbeschreibung eines Geschosses (null = keiner hinterlegt). @param {string} geschossId */
export function geschossPlan(geschossId) {
  const m = holeMappe();
  const treffer = m ? findeGeschoss(m, geschossId) : null;
  return treffer ? treffer.geschoss.plan : null;
}

/**
 * Lage-Eintrag einer Wand — ueber ALLE Projekte hinweg gesucht, denn eine Wand
 * gehoert zu genau einem Projekt und muss auch aus einem anderen heraus benennbar
 * bleiben ([L-4]). `null` = in keinem Projekt eingetragen.
 * @param {string} wandId
 * @returns {{mappe:object, gebaeude:object, geschoss:object, wand:object}|null}
 */
export function wandVerortung(wandId) {
  for (const m of listeProjekte()) {
    const treffer = findeWand(m, wandId);
    if (treffer) return { mappe: m, ...treffer };
  }
  return null;
}

/**
 * Referenzabgleich Projekte ↔ Wandspeicher ([L-4]). Meldet nur, bereinigt nie.
 * Gezaehlt wird ueber ALLE Projekte: eine Wand gilt erst dann als unverortet, wenn
 * sie in keinem einzigen Projekt eingetragen ist.
 * @returns {{verwaist:Array<object>, unverortet:string[], ohneLage:Array<object>}}
 */
export function mappeReferenzen() {
  const elemente = listeElemente().map((e) => ({ id: e.id, name: e.name }));
  const alle = listeProjekte();
  if (!alle.length) return { verwaist: [], unverortet: elemente.map((e) => e.id), ohneLage: [] };
  const verwaist = [], ohneLage = [];
  const inMappe = new Set();
  for (const m of alle) {
    for (const { wand } of alleWaende(m)) inMappe.add(wand.id);
    const r = pruefeReferenzen(m, elemente);
    verwaist.push(...r.verwaist);
    ohneLage.push(...r.ohneLage);
  }
  const vorhanden = new Set(elemente.map((e) => e.id));
  return {
    verwaist,
    unverortet: [...vorhanden].filter((id) => !inMappe.has(id)),
    ohneLage,
  };
}

// --- Mappen-Datei ---------------------------------------------------------

/** Mappen-Datei-Text importieren (streng geprueft, getrennt vom Wandimport). */
export function importiereMappeText(text) {
  return setzeMappe(parseMappe(text));
}

/** Mappen-Datei (File) importieren. @param {File} file @returns {Promise<object>} */
export function importiereMappeDatei(file) {
  return file.text().then((text) => importiereMappeText(text));
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

/**
 * Standardauswahl aus dem Katalog uebernehmen ([P-18]) — nur fuer LEERE Rollen.
 *
 * Der Katalog benennt je Produkt ausdruecklich, welche Verwendungsstelle es im Regelfall
 * ausfuehrt (`produkt.rollen`). Diese Funktion setzt daraus die Auswahl fuer alle Rollen,
 * die noch KEINE Auswahl haben. Bereits gewaehlte Rollen bleiben unangetastet — eine
 * Vorbelegung darf eine Entscheidung des Nutzers nie ueberschreiben.
 *
 * Geschrieben wird pro Eigentuemer-Abschnitt (Modul 1 -> `planung`, Modul 2 -> `aufbau`),
 * genau wie bei `setzeProduktrolle`; das Wandelement bleibt unberuehrt.
 *
 * @param {object} [katalog] Katalog (Default: der geladene)
 * @param {string} [id] Wandelement (Default: das aktive)
 * @returns {{gesetzt:Record<string,string[]>,offen:string[]}} vorbelegte Rollen + Rollen, fuer
 *   die der Katalog keine Standardauswahl kennt (und die weiterhin leer sind)
 */
export function vorbelegeProduktrollen(katalog, id) {
  const k = katalog || holeKatalog();
  const ziel = id || aktivId();
  const gesetzt = {}, offen = [];
  if (!ziel) return { gesetzt, offen };
  const vorschlag = k ? produktrollenVorschlag(k) : {};
  /** @type {Record<string,{quelle:any,rollen:Record<string,string[]>}>} */
  const patch = {};
  for (const r of [...rollenVonModul(1), ...rollenVonModul(2)]) {
    if (rollenIds(holeProdukte(r.modul, ziel), r.id).length) continue;   // schon gewaehlt
    const ids = vorschlag[r.id] || [];
    if (!ids.length) { offen.push(r.id); continue; }
    const teil = _produktTeil(r.modul);
    if (!patch[teil]) patch[teil] = { quelle: k ? { name: k.name, version: k.version } : null, rollen: {} };
    patch[teil].rollen[r.id] = ids;
    gesetzt[r.id] = ids;
  }
  for (const [teil, produkte] of Object.entries(patch)) mergeEingaben(teil, { produkte }, ziel);
  return { gesetzt, offen };
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
    // ALTBESTAND — Projekt-Kopfdaten am Wandelement. Sie leben seit [L-11] am PROJEKT
    // (`mappe.projekt.kopfdaten`) und werden hier nicht mehr geschrieben. Der Block bleibt
    // leer, damit Altprojekte unveraendert laden und ihre Angaben als RUECKFALL lesbar
    // bleiben; vorbelegte Standardwerte gaebe es hier nicht mehr — sie waeren eine zweite,
    // scheinbar echte Quelle neben dem Projekt.
    projekt: {},
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
    // Modul 7 — Technische Zeichnung: AUSSCHLIESSLICH Darstellungsoptionen des
    // Blattes ([D-7]). Keine Geometrie-, Statik- oder Produktwerte — die stehen im
    // Wandelement bzw. in den Abschnitten ihrer Eigentuemer und werden hier NICHT
    // gedoppelt. Kanonische Werte/Normalisierung: sembla-zeichnung.js.
    zeichnung: { format: "a3", masse: true, steintypen: true, planinhalt: "Wandabwicklung", wasserzeichen: false },
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
 * @param {"projekt"|"planung"|"aufbau"|"kosten"|"statik"|"katalog"|"zeichnung"} teil @param {object} patch @param {string} [id]
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
  // Kopfdaten kommen nach [L-11] aus dem PROJEKT (Rueckfall: der Altbestand am
  // Wandelement). Die Exportdatei muss ihr Schriftfeld selbst tragen, also reisen sie
  // im v2-Feld `eingaben.projekt` mit — der gespeicherte Stand bleibt unberuehrt.
  return {
    format: "SEMBLA-Projekt", version: PROJEKT_VERSION, name: e.name,
    wandelement: e.wandelement, eingaben: eingabenMitKopfdaten(e.id),
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
