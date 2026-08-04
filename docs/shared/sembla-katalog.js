// @ts-check
/**
 * SEMBLA Bauteilkatalog — Produktstamm (Material-/Bauteilkatalog), rein und DOM-frei.
 *
 * Der Katalog ist eine EIGENE Ressource, technisch und fachlich getrennt vom
 * Wand-/Projekt-JSON:
 *   - Katalogdaten (Produkte inkl. Preise/Maße) leben in EINEM Katalog-Slot im
 *     Browser (`sembla:katalog`, siehe storage.js), werden als eigene Datei im
 *     Format `SEMBLA-Bauteilkatalog` aus-/eingelesen und AUSSCHLIESSLICH in
 *     Modul 0 gepflegt ([P-13]).
 *   - Das Projekt haelt NUR Referenzen: Produkt-IDs je VERWENDUNGSROLLE plus eine
 *     Herkunftsnotiz — `eingaben.planung.produkte` (Modul 1: Wand, Vorspannung,
 *     Anschluss, Fugen) und `eingaben.aufbau.produkte` (Modul 2: Latten,
 *     Beplankung, Verbinder). Niemals eine Kopie der Preise oder Maße, und
 *     niemals etwas davon im Wandelement.
 *   - Modul 4 ist reiner Leser: Preise werden je Position frisch aufgeloest
 *     (`loesePreis`, [P-14]) und dort nicht gepflegt.
 *
 * Drei Versionsachsen, streng getrennt (Formattrennung):
 *   KATALOG_VERSION  — oeffentliches Katalog-Dateiformat (hier, v1)
 *   PROJEKT_VERSION  — oeffentliches Projekt-Dateiformat (storage.js, bleibt 2;
 *                      die Produkt-Bloecke sind dort optionale Zusatzfelder)
 *   SCHEMA_VERSION   — interner localStorage-Stand (storage.js, bleibt 3;
 *                      fehlender Katalog-Slot = kein Katalog, keine Migration)
 *
 * Altprojekt-Fallback: Projekte ohne Produkt-Bloecke laden als LEERE Auswahl
 * (aus standardEingaben()) — warnungsfrei. Die alten Einzelpreise in
 * `eingaben.kosten.preise` bleiben im Projekt erhalten, sind aber NICHT mehr
 * die Preisquelle; ebenso ist die frueher zentral in Modul 0 gepflegte
 * `eingaben.katalog.auswahl` unwirksamer Altbestand ([P-15]).
 *
 * Eigene Datei nach der shared-Regel: eigene Tests (tests/module/test-katalog.mjs)
 * und mehrere Nutzer (storage.js, Modul 0/1/2, sembla-export.js).
 *
 * ES-Modul: laeuft im Browser und in den Node-Tests per `import`. Maße in mm.
 */

/** Version des OEFFENTLICHEN Katalog-Dateiformats. */
export const KATALOG_VERSION = 1;

/** Kennung des oeffentlichen Katalogformats. */
export const KATALOG_FORMAT = "SEMBLA-Bauteilkatalog";

/** Zulaessige Einheiten = explizite Preisbasis. */
export const EINHEITEN = ["Stk", "m", "m2"];

/** Beschriftung der Preisbasis (UI). */
export const EINHEIT_LABEL = { Stk: "€/Stk", m: "€/m", m2: "€/m²" };

/**
 * Geschlossene Kategorieliste. `einheiten` = zulaessige Preisbasen,
 * `pflicht` = kategorieabhaengige Pflichtfelder (Geometrie/Kennung).
 * @type {ReadonlyArray<{id:string,label:string,einheiten:string[],pflicht:string[]}>}
 */
export const KATEGORIEN = [
  { id: "stein",          label: "Stein",                    einheiten: ["Stk"],            pflicht: [] },
  { id: "gewindestange",  label: "Gewindestange / Vorspannsystem", einheiten: ["Stk", "m"], pflicht: ["gewinde", "laenge_mm"] },
  { id: "latte",          label: "Latte",                    einheiten: ["Stk", "m"],       pflicht: ["breite_mm", "dicke_mm", "laenge_mm"] },
  { id: "beplankung",     label: "Beplankung (Platte)",      einheiten: ["Stk", "m2"],      pflicht: ["breite_mm", "hoehe_mm", "dicke_mm"] },
  { id: "blech_platte",   label: "Blech / Platte (Stahl)",   einheiten: ["Stk", "m2"],      pflicht: ["breite_mm", "hoehe_mm", "dicke_mm"] },
  { id: "verbinder",      label: "Verbinder",                einheiten: ["Stk"],            pflicht: [] },
  { id: "verbrauch",      label: "Sonstiges Verbrauchsmaterial", einheiten: ["Stk", "m", "m2"], pflicht: [] },
];

/** Alle Maßfelder (mm), immer optional erlaubt, je Kategorie teils pflichtig. */
export const MASSFELDER = ["breite_mm", "hoehe_mm", "dicke_mm", "laenge_mm"];

/** @param {string} id @returns {{id:string,label:string,einheiten:string[],pflicht:string[]}|null} */
export function kategorie(id) {
  return KATEGORIEN.find((k) => k.id === id) || null;
}

/** Beschriftung einer Kategorie (unbekannt -> die rohe Kennung). @param {string} id */
export function kategorieLabel(id) {
  const k = kategorie(id);
  return k ? k.label : String(id);
}

// --- Anlegen --------------------------------------------------------------

/** Leerer Katalog (Neuanlage). @param {string} [name] */
export function leererKatalog(name) {
  return { format: KATALOG_FORMAT, version: KATALOG_VERSION, name: (name || "Neuer Katalog").toString(), produkte: [] };
}

/**
 * Leeres Produkt-Gerüst einer Kategorie (Startwerte des Anlage-Formulars).
 * @param {string} kat Kategorie-Kennung
 */
export function neuesProdukt(kat) {
  const k = kategorie(kat) || KATEGORIEN[0];
  const p = { id: "", kategorie: k.id, bezeichnung: "", einheit: k.einheiten[0], preis: 0 };
  if (k.id === "gewindestange") { p.gewinde = "M10"; p.guete = "8.8"; }
  return p;
}

/** Zahl aus Nutzereingabe (leer/„–“ -> null, damit optionale Maße wegfallen). */
function _zahl(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

const _slug = (s) => String(s == null ? "" : s).trim().toLowerCase()
  .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Vorschlag fuer eine sprechende, stabile Produkt-ID. @param {any} p */
export function vorschlagId(p) {
  const teile = [String(p && p.kategorie || "produkt")];
  if (p && p.gewinde) teile.push(p.gewinde);
  for (const f of MASSFELDER) {
    const v = p && p[f];
    if (v != null && v !== "" && Number.isFinite(Number(v))) teile.push(String(Number(v)));
  }
  const s = _slug(teile.join("-"));
  return s || "produkt";
}

/** Vorschlag fuer die Bezeichnung (kategorieabhaengig, frei ueberschreibbar). @param {any} p */
export function vorschlagBezeichnung(p) {
  const n = (v) => (v == null || v === "" ? null : Number(v));
  const b = n(p && p.breite_mm), h = n(p && p.hoehe_mm), d = n(p && p.dicke_mm), l = n(p && p.laenge_mm);
  switch (p && p.kategorie) {
    case "gewindestange":
      return "Gewindestange " + (p.gewinde || "") + (l != null ? " " + l + " mm" : "") + (p.guete ? " (" + p.guete + ")" : "");
    case "latte":
      return "Latte " + (b != null && d != null ? b + "×" + d + " mm" : "") + (l != null ? ", " + (l / 1000).toString().replace(".", ",") + " m" : "");
    case "beplankung":
    case "blech_platte":
      return (p.kategorie === "beplankung" ? "Platte " : "Blech ") + (d != null ? d + " mm " : "")
        + (b != null && h != null ? b + "×" + h + " mm" : "");
    default:
      return kategorieLabel(p && p.kategorie);
  }
}

/** Maßangabe einer Zeile als Klartext (UI/Tabelle). @param {any} p */
export function massText(p) {
  if (!p) return "";
  const t = [];
  if (p.gewinde) t.push(String(p.gewinde));
  const paar = [];
  if (p.breite_mm != null) paar.push(p.breite_mm + " b");
  if (p.hoehe_mm != null) paar.push(p.hoehe_mm + " h");
  if (p.dicke_mm != null) paar.push(p.dicke_mm + " d");
  if (paar.length) t.push(paar.join(" × ") + " mm");
  if (p.laenge_mm != null) t.push("L " + p.laenge_mm + " mm");
  return t.join(" · ") || "–";
}

// --- Validierung ----------------------------------------------------------

/**
 * Ein Produkt pruefen. Liefert eine Liste konkreter Fehlermeldungen (leer = ok).
 * Es wird NIE stillschweigend korrigiert.
 * @param {any} p Produkt
 * @param {{ids?:string[]}} [opts] `ids` = bereits vergebene IDs (Eindeutigkeit)
 * @returns {string[]}
 */
export function validiereProdukt(p, opts = {}) {
  const e = [];
  if (!p || typeof p !== "object") return ["Produkt ist kein Objekt."];

  const id = p.id == null ? "" : String(p.id).trim();
  if (!id) e.push("ID fehlt.");
  else if (/\s/.test(id)) e.push(`ID „${id}“ darf keine Leerzeichen enthalten.`);
  else if ((opts.ids || []).includes(id)) e.push(`ID „${id}“ ist bereits vergeben.`);

  const k = kategorie(p.kategorie);
  if (!k) e.push(`Unbekannte Kategorie „${p.kategorie}“.`);

  if (!String(p.bezeichnung == null ? "" : p.bezeichnung).trim()) e.push("Bezeichnung fehlt.");

  if (!EINHEITEN.includes(p.einheit)) e.push(`Unbekannte Einheit „${p.einheit}“ (erlaubt: ${EINHEITEN.join(", ")}).`);
  else if (k && !k.einheiten.includes(p.einheit)) {
    e.push(`Einheit „${EINHEIT_LABEL[p.einheit]}“ ist für Kategorie ${k.label} nicht zulässig `
      + `(erlaubt: ${k.einheiten.map((u) => EINHEIT_LABEL[u]).join(", ")}).`);
  }

  const preis = _zahl(p.preis);
  if (preis === null || Number.isNaN(preis)) e.push("Preis fehlt oder ist keine Zahl.");
  else if (preis < 0) e.push("Preis darf nicht negativ sein.");

  for (const f of MASSFELDER) {
    if (p[f] === undefined) continue;
    const v = _zahl(p[f]);
    if (v === null) continue;                       // leer = Feld nicht gesetzt
    if (Number.isNaN(v)) e.push(`${f} ist keine Zahl.`);
    else if (v <= 0) e.push(`${f} muss größer als 0 sein.`);
  }

  for (const f of (k ? k.pflicht : [])) {
    if (f === "gewinde") {
      if (!String(p.gewinde == null ? "" : p.gewinde).trim()) e.push(`Gewinde ist für ${k.label} erforderlich.`);
      continue;
    }
    const v = _zahl(p[f]);
    if (v === null || Number.isNaN(v) || v <= 0) e.push(`${f} ist für ${k.label} erforderlich.`);
  }
  return e;
}

/**
 * Ganzen Katalog pruefen (Kopf + alle Produkte, inkl. ID-Eindeutigkeit).
 * @param {any} k @returns {string[]} Fehlerliste (leer = ok)
 */
export function validiereKatalog(k) {
  const e = [];
  if (!k || typeof k !== "object") return ["Katalog ist kein Objekt."];
  if (!String(k.name == null ? "" : k.name).trim()) e.push("Katalogname fehlt.");
  if (!Array.isArray(k.produkte)) return e.concat("Feld „produkte“ fehlt oder ist keine Liste.");
  const ids = [];
  k.produkte.forEach((p, i) => {
    for (const msg of validiereProdukt(p, { ids })) e.push(`Produkt ${i + 1}: ${msg}`);
    const id = p && p.id != null ? String(p.id).trim() : "";
    if (id) ids.push(id);
  });
  return e;
}

/**
 * Katalog-Text (Datei) deuten und streng pruefen. Erkennt verwechselte Formate
 * und nennt den richtigen Weg. Unbekannte Zusatzfelder bleiben erhalten
 * (Vorwaertskompatibilitaet).
 * @param {string} text @returns {{format:string,version:number,name:string,produkte:any[]}}
 */
export function parseKatalog(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error("Datei ist kein gültiges JSON."); }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Datei enthält kein Katalog-Objekt.");
  if (obj.format === "SEMBLA-Projekt" || (obj.length_mm != null && Array.isArray(obj.courses)) || obj.wandelement) {
    throw new Error("Das ist eine Projekt-/Wandelement-Datei — bitte oben unter „Wandelement anlegen“ mit „Datei importieren…“ laden.");
  }
  if (obj.format !== KATALOG_FORMAT) {
    throw new Error(`Keine ${KATALOG_FORMAT}-Datei (Feld „format“ fehlt oder weicht ab).`);
  }
  const v = Number(obj.version);
  if (!Number.isFinite(v) || v < 1) throw new Error("Katalog-Version fehlt oder ist ungültig.");
  if (v > KATALOG_VERSION) {
    throw new Error(`Katalogformat Version ${v} wird nicht unterstützt (diese Suite kennt Version ${KATALOG_VERSION}).`);
  }
  if (!Array.isArray(obj.produkte)) throw new Error("Feld „produkte“ fehlt oder ist keine Liste.");
  const kat = {
    format: KATALOG_FORMAT, version: v,
    name: String(obj.name == null || String(obj.name).trim() === "" ? "Importierter Katalog" : obj.name),
    produkte: obj.produkte.map((p) => ({ ...p })),
  };
  const fehler = validiereKatalog(kat);
  if (fehler.length) throw new Error("Katalog ungültig:\n– " + fehler.join("\n– "));
  return kat;
}

/**
 * Katalog als oeffentliches Datei-Objekt (Export). Interne Zusatzfelder des
 * Browserzustands (z. B. `geaendert`) reisen NICHT mit.
 * @param {any} k @returns {{format:string,version:number,name:string,produkte:any[]}}
 */
export function katalogObjekt(k) {
  return {
    format: KATALOG_FORMAT, version: KATALOG_VERSION,
    name: String((k && k.name) || "Bauteilkatalog"),
    produkte: ((k && k.produkte) || []).map((p) => ({ ...p })),
  };
}

/** Produkt per id finden. @param {any} k @param {string} id */
export function produkt(k, id) {
  return ((k && k.produkte) || []).find((p) => String(p.id) === String(id)) || null;
}

// --- Verwendungsrollen der Wand ([P-13]) ----------------------------------
// Eine ROLLE ist eine konkrete Verwendungsstelle am Bauwerk und traegt denselben
// Schluessel wie die zugehoerige Stuecklistenposition (sembla-bom.js) — dadurch gibt es
// keine zweite Zuordnungsachse und keine Kategorie->Position-Uebersetzung.
//
// `modul`  = welches Modul diese Rolle waehlt (1 = Wand/Vorspannung/Anschluss/Fugen,
//            2 = Wandaufbau). Nur dieses Modul schreibt sie.
// `mass`   = Diskriminator fuer die Preisauflösung: eines der genannten Maßfelder muss
//            dem maßgebenden Wandwert (`kontext`) entsprechen. Nur echte, im Katalog und
//            in der Wand vorhandene Daten — keine Namens- oder Aehnlichkeitsheuristik.
//            null = fuer diese Rolle gibt es keinen Diskriminator (dann entscheidet
//            allein die Anzahl der ausgewaehlten Produkte ueber Eindeutigkeit).
// `bepreist` = false: die Rolle erzeugt keine Kostenzeile (nachrichtliche Menge nach
//            [A-6]) oder hat gar keine Mengenposition (Beplankung, offen bis #19/#22).

/**
 * @type {ReadonlyArray<{id:string,label:string,kategorie:string,modul:1|2,gruppe:string,
 *   mass:{felder:string[],kontext:string}|null,bepreist:boolean,hinweis?:string}>}
 */
export const ROLLEN = [
  // --- Modul 1 ---
  { id: "i3", label: "Stein i3 (37,5 cm)", kategorie: "stein", modul: 1, gruppe: "Steine", einheit: "Stk",
    mass: { felder: ["breite_mm"], kontext: "stein_i3_mm" }, bepreist: true },
  { id: "i2", label: "Stein i2 (25 cm)", kategorie: "stein", modul: 1, gruppe: "Steine", einheit: "Stk",
    mass: { felder: ["breite_mm"], kontext: "stein_i2_mm" }, bepreist: true },
  { id: "rod_std", label: "Gewindestange (Standardlänge)", kategorie: "gewindestange", modul: 1, einheit: "Stk",
    gruppe: "Vorspannung", mass: { felder: ["laenge_mm"], kontext: "rod_mm" }, bepreist: true },
  { id: "rod_sonder", label: "Gewindestange Sonderlänge (Ausgangsprodukt)", kategorie: "gewindestange",
    modul: 1, gruppe: "Vorspannung", einheit: "Stk", mass: { felder: ["laenge_mm"], kontext: "rod_mm" }, bepreist: true,
    hinweis: "Sonderlängen werden aus diesem Ausgangsprodukt zugeschnitten. Zuschnitt, Verschnitt "
      + "und Einkaufsmengen werden hier bewusst NICHT gerechnet (Zuschnittverfahren offen)." },
  { id: "kupplung", label: "Kopplungsmutter (Stangenstoß)", kategorie: "verbrauch", modul: 1,
    gruppe: "Vorspannung", einheit: "Stk", mass: null, bepreist: true },
  { id: "spannmutter", label: "Spannmutter", kategorie: "verbrauch", modul: 1,
    gruppe: "Vorspannung", einheit: "Stk", mass: null, bepreist: true },
  { id: "kuppl_basis", label: "Kopplungsmutter (Fuß)", kategorie: "verbrauch", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: null, bepreist: true },
  { id: "senkkopf", label: "Senkkopfschraube (Fuß)", kategorie: "verbrauch", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: null, bepreist: true },
  { id: "spannplatte", label: "Spannplatte", kategorie: "blech_platte", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: null, bepreist: true },
  { id: "blech_boden", label: "Bodenblech-Modul", kategorie: "blech_platte", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: { felder: ["breite_mm", "hoehe_mm", "laenge_mm"], kontext: "blech_mm" },
    bepreist: true },
  { id: "blech_kopf", label: "Kopfblech-Modul", kategorie: "blech_platte", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: { felder: ["breite_mm", "hoehe_mm", "laenge_mm"], kontext: "blech_mm" },
    bepreist: true },
  { id: "dicht_stk", label: "Dichtstreifen 20 cm (Einbauposition)", kategorie: "verbrauch", modul: 1,
    gruppe: "Fugen", einheit: "Stk", mass: null, bepreist: true },
  { id: "dicht", label: "Dichtstreifen – Gesamtlänge", kategorie: "verbrauch", modul: 1,
    gruppe: "Fugen", einheit: "m", mass: null, bepreist: false,
    hinweis: "Nachrichtliche Menge derselben Ware wie die Einbauposition ([A-6]) — bewusst nicht "
      + "bepreist, damit die Dichtstreifen nicht doppelt in der Summe stehen." },
  // --- Modul 2 ---
  { id: "latte", label: "Lattenstange", kategorie: "latte", modul: 2, gruppe: "Latten", einheit: "Stk",
    mass: { felder: ["laenge_mm"], kontext: "stange_mm" }, bepreist: true },
  { id: "verbinder", label: "Verbinderprodukt", kategorie: "verbinder", modul: 2, gruppe: "Verbinder",
    einheit: "Stk", mass: null, bepreist: true,
    hinweis: "Der Verbindertyp folgt unveränderlich aus Modul 1 ([U-9]); hier wird nur das "
      + "ausführende Produkt gewählt. Katalogformat v1 führt kein Typfeld — die Übereinstimmung "
      + "Produkt ↔ Typ ist NICHT maschinell prüfbar und manuell zu prüfen." },
  { id: "beplankung", label: "Beplankungsplatte", kategorie: "beplankung", modul: 2, gruppe: "Beplankung",
    einheit: null, mass: null, bepreist: false,
    hinweis: "Für die Zuschnittplanung vorgemerkt. Eine Plattenmenge wird derzeit nicht ermittelt, "
      + "darum gibt es dazu keine Kostenzeile — es wird keine Menge und keine m²-Umrechnung erfunden." },
];

/** @param {string} id @returns {{id:string,label:string,kategorie:string,modul:1|2,gruppe:string,mass:any,bepreist:boolean,hinweis?:string}|null} */
export function rolle(id) {
  return ROLLEN.find((r) => r.id === id) || null;
}

/** Alle Rollen eines Moduls, in Anzeigereihenfolge. @param {1|2} modul */
export function rollenVonModul(modul) {
  return ROLLEN.filter((r) => r.modul === modul);
}

/** Gruppennamen eines Moduls in Anzeigereihenfolge (ohne Doppelte). @param {1|2} modul */
export function rollenGruppen(modul) {
  const out = [];
  for (const r of rollenVonModul(modul)) if (!out.includes(r.gruppe)) out.push(r.gruppe);
  return out;
}

/** Leerer Produkt-Block eines Moduls (`eingaben.planung.produkte` / `eingaben.aufbau.produkte`). */
export function leereProdukte() {
  return { quelle: null, rollen: {} };
}

/** Produkt-IDs einer Rolle aus einem Produkt-Block lesen (normalisiert, nie null). */
export function rollenIds(block, rolleId) {
  const l = block && block.rollen ? block.rollen[rolleId] : null;
  if (!Array.isArray(l)) return [];
  return [...new Set(l.filter((x) => x != null && String(x) !== "").map(String))];
}

/**
 * Alle Produkt-Blöcke eines Eingaben-Modells auf eine Rollen->IDs-Karte zusammenziehen.
 * Modul 1 und Modul 2 besitzen disjunkte Rollen, es kann also nichts kollidieren; eine
 * Rolle im falschen Block wird ignoriert (nur der Eigentümer zählt).
 * @param {any} eingaben
 */
export function produktRollen(eingaben) {
  const e = eingaben || {};
  const bloecke = { 1: (e.planung && e.planung.produkte) || null, 2: (e.aufbau && e.aufbau.produkte) || null };
  /** @type {Record<string,string[]>} */
  const out = {};
  for (const r of ROLLEN) {
    const ids = rollenIds(bloecke[r.modul], r.id);
    if (ids.length) out[r.id] = ids;
  }
  return out;
}

/**
 * Ausgewählte, im Katalog auflösbare Produkte einer Rolle — die programmgesteuerte
 * Schnittstelle für die nachgelagerte Zuschnitt-/Beschaffungsplanung. Liefert die
 * vollständigen Produkte (inkl. Maße) OHNE Preisentscheidung.
 * @param {any} eingaben @param {any} katalog @param {string} rolleId
 * @returns {{rolle:string,ids:string[],produkte:any[],fehlend:string[]}}
 */
export function produkteZuRolle(eingaben, katalog, rolleId) {
  const ids = produktRollen(eingaben)[rolleId] || [];
  const produkte = [], fehlend = [];
  for (const id of ids) {
    const p = produkt(katalog, id);
    if (p) produkte.push(p); else fehlend.push(id);
  }
  return { rolle: rolleId, ids, produkte, fehlend };
}

// --- Preisauflösung ([P-14]) ----------------------------------------------

/** Einheit der Stücklistenposition -> zulaessige Katalog-Preisbasis (KEINE Umrechnung). */
const _EINHEIT_ZU_BASIS = { Stk: "Stk", m: "m", "m²": "m2", m2: "m2" };

/**
 * Maßgebende Wandwerte fuer die Maß-Eingrenzung ([P-14]) — ausschliesslich reale
 * Groessen aus Wandelement und Eingaben, keine Annahmen. Sie entscheiden, welches
 * der ausgewaehlten Produkte einer Rolle ueberhaupt zur Position passt.
 * @param {any} w Wandelement @param {any} [eingaben]
 * @returns {Record<string,number>}
 */
export function preisKontext(w, eingaben = {}) {
  const ww = w || {};
  const ps = ww.prestress || {};
  const grid = +ww.grid_mm > 0 ? +ww.grid_mm : 125;
  const latten = (eingaben && eingaben.aufbau && eingaben.aufbau.latten) || {};
  return {
    rod_mm: +ww.rod_mm > 0 ? +ww.rod_mm : (+ps.rod_mm > 0 ? +ps.rod_mm : 1100),
    blech_mm: +ps.blech_mm > 0 ? +ps.blech_mm : 1000,
    stange_mm: (+latten.stange_cm > 0 ? +latten.stange_cm : 150) * 10,
    stein_i3_mm: grid * 3,
    stein_i2_mm: grid * 2,
  };
}

/** Klartext je Status (UI + Export verwenden dieselben Texte). */
export const STATUS_TEXT = {
  ok: "zugeordnet",
  kein_katalog: "kein Bauteilkatalog geladen",
  keine_auswahl: "kein Produkt gewählt",
  fehlt: "Produkt fehlt im Katalog",
  kategorie_abweichend: "Produkt gehört zu einer anderen Kategorie",
  einheit_unpassend: "Preisbasis passt nicht zur Positionseinheit",
  mass_abweichend: "kein gewähltes Produkt passt zum maßgebenden Maß",
  mehrdeutig: "mehrdeutig – mehrere Produkte bleiben möglich",
  nicht_erforderlich: "Menge 0 – kein Produkt erforderlich",
  nachrichtlich: "nachrichtliche Menge – nicht bepreist",
  ohne_position: "keine Mengenposition – nur vorgemerkt",
};

/**
 * Preis EINER Stücklistenposition deterministisch auflösen ([P-14]).
 *
 * Reihenfolge: nicht bepreiste Rolle -> Menge 0 -> Katalog -> Auswahl -> Kategorie/
 * Existenz -> Einheit -> Maß -> Eindeutigkeit. Es wird NIE ein erster Kandidat, ein
 * Mittelwert, ein Ersatzprodukt oder ein Nullpreis gewaehlt; bleibt etwas offen, gibt es
 * keinen Preis, sondern einen benannten Status.
 *
 * @param {{key:string,unit:string,menge:number,nachrichtlich?:boolean}} item Stücklistenposition
 * @param {Record<string,string[]>} rollenIdsMap Rolle -> gewaehlte Produkt-IDs
 * @param {any} katalog geladener Katalog oder null
 * @param {Record<string,number>} kontext maßgebende Wandwerte (rod_mm, blech_mm, stange_mm, …)
 * @returns {{status:string,text:string,ep:number|null,produkt:any|null,kandidaten:any[],
 *            fehlend:string[],vorgemerkt:any[],hinweis:string|null,bepreisbar:boolean}}
 */
export function loesePreis(item, rollenIdsMap, katalog, kontext = {}) {
  const r = rolle(item.key);
  const res = { status: "ok", text: "", ep: null, produkt: null, kandidaten: [], fehlend: [],
                vorgemerkt: [], hinweis: (r && r.hinweis) || null, bepreisbar: true };
  const fertig = (status) => { res.status = status; res.text = STATUS_TEXT[status] || status; return res; };

  // 1) Rollen ohne Kostenzeile (nachrichtliche Menge / keine Mengenposition)
  if (item.nachrichtlich || (r && !r.bepreist)) {
    res.bepreisbar = false;
    return fertig(item.nachrichtlich ? "nachrichtlich" : "ohne_position");
  }
  if (!r) { res.bepreisbar = false; return fertig("ohne_position"); }

  // 2) Menge 0 braucht kein Produkt (z. B. Kopfblech bei oberem Anschluss „Spannplatte")
  if (!(+item.menge > 0)) { res.bepreisbar = false; return fertig("nicht_erforderlich"); }

  const ids = (rollenIdsMap && rollenIdsMap[item.key]) || [];
  if (!katalog || !Array.isArray(katalog.produkte)) return fertig("kein_katalog");
  if (!ids.length) return fertig("keine_auswahl");

  // 3) Referenzen aufloesen — unauflösbare oder kategoriefremde Referenzen werden gemeldet
  //    und nie still uebergangen: die Position bleibt dann unbepreist (kein Teil-Preis aus
  //    dem Rest der Auswahl, denn die Datengrundlage ist unvollstaendig).
  const kand = [], fremd = [];
  for (const id of ids) {
    const p = produkt(katalog, id);
    if (!p) { res.fehlend.push(id); continue; }
    if (p.kategorie !== r.kategorie) { fremd.push(p); continue; }
    kand.push(p);
  }
  res.kandidaten = kand.concat(fremd);
  if (res.fehlend.length) return fertig("fehlt");
  if (fremd.length) return fertig("kategorie_abweichend");

  // 4) Preisbasis muss zur Positionseinheit passen — ohne jede Umrechnung
  const basis = _EINHEIT_ZU_BASIS[item.unit];
  const passend = kand.filter((p) => p.einheit === basis);
  if (!passend.length) return fertig("einheit_unpassend");

  // 5) Maß-Diskriminator, nur wenn die Rolle einen hat UND der Wandwert bekannt ist
  let eng = passend;
  const kv = r.mass ? +kontext[r.mass.kontext] : NaN;
  if (r.mass && Number.isFinite(kv) && kv > 0) {
    eng = passend.filter((p) => r.mass.felder.some((f) => Number.isFinite(+p[f]) && Math.abs(+p[f] - kv) < 1e-6));
    if (!eng.length) return fertig("mass_abweichend");
    res.vorgemerkt = passend.filter((p) => !eng.includes(p));
  }

  // 6) Eindeutigkeit — mehrere Kandidaten bleiben mehrdeutig, es wird keiner bevorzugt
  if (eng.length > 1) { res.kandidaten = eng; return fertig("mehrdeutig"); }
  res.produkt = eng[0];
  res.ep = +eng[0].preis;
  res.kandidaten = eng;
  return fertig("ok");
}

/**
 * Auswahlstatus EINER Rolle fuer die waehlende Oberflaeche (Modul 1/2) — damit
 * Mehrdeutigkeit dort sichtbar wird und nicht erst in Modul 4 ([P-14]).
 * Geprueft wird mit einer gedachten Menge 1; die echten Mengen bleiben unberuehrt.
 * @param {string} rolleId @param {any} eingaben @param {any} katalog
 * @param {Record<string,number>} [kontext]
 */
export function rollenStatus(rolleId, eingaben, katalog, kontext = {}) {
  const r = rolle(rolleId);
  const ids = produktRollen(eingaben)[rolleId] || [];
  if (!r) return { rolle: rolleId, ids, status: "ohne_position", text: STATUS_TEXT.ohne_position, produkt: null, kandidaten: [], fehlend: [], vorgemerkt: [], hinweis: null };
  // Rollen ohne Kostenzeile: nur Aufloesbarkeit melden, nie einen Preisstatus erfinden.
  if (!r.bepreist) {
    const auf = produkteZuRolle(eingaben, katalog, rolleId);
    const status = !ids.length ? "keine_auswahl"
      : (!katalog ? "kein_katalog" : (auf.fehlend.length ? "fehlt" : (rolleId === "dicht" ? "nachrichtlich" : "ohne_position")));
    return { rolle: rolleId, ids, status, text: STATUS_TEXT[status], produkt: null,
             kandidaten: auf.produkte, fehlend: auf.fehlend, vorgemerkt: [], hinweis: r.hinweis || null };
  }
  const res = loesePreis({ key: rolleId, unit: r.einheit || "Stk", menge: 1 }, { [rolleId]: ids }, katalog, kontext);
  return { rolle: rolleId, ids, status: res.status, text: res.text, produkt: res.produkt,
           kandidaten: res.kandidaten, fehlend: res.fehlend, vorgemerkt: res.vorgemerkt, hinweis: res.hinweis };
}

// --- Projektauswahl (Altbestand, unwirksam — [P-15]) ----------------------
// `eingaben.katalog.auswahl` stammt aus dem abgeloesten zentralen Auswahlweg in Modul 0.
// Die Funktionen darunter bleiben als reine LESE-/MELDEPFADE erhalten: der Altbestand
// wird nie neu geschrieben, nie als Filter angewendet und nie in Verwendungsrollen
// uebersetzt (eine Kategorie->Rolle-Uebersetzung waere mehrdeutig).

/** Auswahl-Objekt auf Kategorie->ID-Listen normalisieren (rein, ohne Aufloesung). */
export function normAuswahl(auswahl) {
  const out = {};
  for (const [kat, ids] of Object.entries(auswahl || {})) {
    if (!Array.isArray(ids)) continue;
    const l = [...new Set(ids.filter((x) => x != null && String(x) !== "").map(String))];
    if (l.length) out[kat] = l;
  }
  return out;
}

/** Anzahl referenzierter Produkte einer Auswahl. */
export function anzahlAuswahl(auswahl) {
  return Object.values(normAuswahl(auswahl)).reduce((a, l) => a + l.length, 0);
}

/**
 * Projektauswahl gegen den geladenen Katalog pruefen. Unaufloesbare Referenzen
 * werden GEMELDET, nicht bereinigt und nicht ersetzt — es gibt hier bewusst
 * keinen Ersatzprodukt-/Nullpreis-Pfad.
 * @param {any} katalog geladener Katalog oder null
 * @param {any} auswahl `eingaben.katalog.auswahl`
 * @returns {{warnungen:Array<{typ:string,kategorie?:string,id?:string,text:string}>,anzahl:number,ok:boolean}}
 */
export function pruefeAuswahl(katalog, auswahl) {
  const a = normAuswahl(auswahl);
  const anzahl = anzahlAuswahl(a);
  /** @type {Array<{typ:string,kategorie?:string,id?:string,text:string}>} */
  const warnungen = [];
  if (!katalog || !Array.isArray(katalog.produkte)) {
    if (anzahl > 0) {
      warnungen.push({
        typ: "kein_katalog",
        text: `Dieses Projekt referenziert ${anzahl} Produkt(e), es ist aber kein Bauteilkatalog geladen. `
          + "Katalog importieren — die Referenzen werden nicht ersetzt und nicht entfernt.",
      });
    }
    return { warnungen, anzahl, ok: warnungen.length === 0 };
  }
  for (const [kat, ids] of Object.entries(a)) {
    if (!kategorie(kat)) {
      warnungen.push({ typ: "unbekannte_kategorie", kategorie: kat,
        text: `Unbekannte Kategorie „${kat}“ in der Projektauswahl (${ids.length} Referenz(en)).` });
      continue;
    }
    for (const id of ids) {
      const p = produkt(katalog, id);
      if (!p) {
        warnungen.push({ typ: "fehlt", kategorie: kat, id,
          text: `Produkt „${id}“ (${kategorieLabel(kat)}) fehlt im geladenen Katalog — gelöscht oder anderer Katalog.` });
      } else if (p.kategorie !== kat) {
        warnungen.push({ typ: "kategorie_abweichend", kategorie: kat, id,
          text: `Produkt „${id}“ ist im Katalog als ${kategorieLabel(p.kategorie)} geführt, `
            + `im Projekt aber unter ${kategorieLabel(kat)} ausgewählt.` });
      }
    }
  }
  return { warnungen, anzahl, ok: warnungen.length === 0 };
}
