// @ts-check
/**
 * SEMBLA Bauteilkatalog — Produktstamm (Material-/Bauteilkatalog), rein und DOM-frei.
 *
 * Der Katalog ist eine EIGENE Ressource, technisch und fachlich getrennt vom
 * Wand-/Projekt-JSON:
 *   - Katalogdaten (Produkte inkl. Preise/Maße) leben in EINEM Katalog-Slot im
 *     Browser (`sembla:katalog`, siehe storage.js) und werden als eigene Datei
 *     im Format `SEMBLA-Bauteilkatalog` aus-/eingelesen.
 *   - Das Projekt haelt NUR die Auswahl (`eingaben.katalog.auswahl`): Produkt-IDs
 *     je Kategorie plus eine Herkunftsnotiz. Niemals eine Kopie der Preise oder
 *     Maße, und niemals etwas davon im Wandelement.
 *
 * Zwei Versionsachsen, streng getrennt (Formattrennung):
 *   KATALOG_VERSION  — oeffentliches Katalog-Dateiformat (hier, v1)
 *   PROJEKT_VERSION  — oeffentliches Projekt-Dateiformat (storage.js, bleibt 2;
 *                      `eingaben.katalog` ist dort ein optionales Zusatzfeld)
 *   SCHEMA_VERSION   — interner localStorage-Stand (storage.js, bleibt 3;
 *                      fehlender Katalog-Slot = kein Katalog, keine Migration)
 *
 * Altprojekt-Fallback: Projekte ohne `eingaben.katalog` laden als LEERE Auswahl
 * (`{quelle:null, auswahl:{}}`, aus standardEingaben()) — warnungsfrei, ohne
 * Verhaltensaenderung. Die bestehenden Einzelpreise in `eingaben.kosten.preise`
 * bleiben unveraendert wirksam; eine Katalog->Stueckliste/Kosten-Integration ist
 * NICHT Teil dieses Bausteins (Folgeausbau).
 *
 * Eigene Datei nach der shared-Regel: eigene Tests (tests/module/test-katalog.mjs)
 * und mehrere Nutzer (storage.js + Modul 0).
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

// --- Projektauswahl (nur Referenzen) --------------------------------------

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
