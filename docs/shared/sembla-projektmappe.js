// @ts-check
/**
 * SEMBLA Projektmappe — Projektstruktur und Wandlagen (Kapitel 16.9, [L-1]…[L-8]).
 *
 * Die Projektmappe ist eine EIGENE Ressource neben dem Wandelement:
 *
 *   Projekt → Gebaeude → Geschoss → Wand(-Verortung)
 *
 * Sie traegt AUSSCHLIESSLICH Struktur und Lage ([L-3]); Geometrie und Statik
 * bleiben im Wandelement, dessen einziger Schreiber Modul 1 ist ([P-1]). Eine
 * Wand der Mappe verweist ueber ihre stabile `id` auf den Eintrag im
 * Wandspeicher (`storage.js`) — der Dateiname ist nur der Fundort ([L-4]).
 *
 * Lage ist seit Formatversion 2 in MILLIMETERN ([L-1]) und ausschliesslich
 * orthogonal ([L-2]); die LAENGE bleibt im 125-mm-Raster:
 *
 *   lage = { start_mm: {x, y}, richtung: "x"|"y",
 *            orientierung: "+x"|"-x"|"+y"|"-y", laenge_grid: n }
 *   lage = null                      // unverortet — der Normalfall vor dem Zeichnen
 *
 * `orientierung` ist die gerichtete Wandorientierung (#84, Konvention und
 * Mathematik in `sembla-constraints.js`). Das Feld ist OPTIONAL und
 * abwaertskompatibel — KEIN Formatbump: Altstaende ohne Orientierung werden beim
 * Lesen (`normLage`) deterministisch und verlustfrei auf die positive Richtung
 * ihrer Achse normalisiert; ein zur Achse widerspruechlicher Wert faellt in
 * `lageFehler`/`pruefeMappe` auf und wird nie still umgedeutet.
 *
 * Die Lage-/Bemassungsmathematik selbst liegt in `sembla-constraints.js`
 * (Kapitel 16.10, [K-*]); hier steht nur die Struktur drumherum. Bemassungen
 * gehoeren dem GESCHOSS ([K-10]) — und seit #76 ebenso sein URSPRUNG:
 *
 *   geschoss.ursprung_mm = { x, y }   // der eine Grundbezug ([K-4]), frei platzierbar
 *
 * Das Feld ist OPTIONAL und abwaertskompatibel — KEIN Formatbump: fehlt es, gilt
 * 0/0, also genau die Lage, auf der der Ursprung vor #76 fest sass. Es liegt
 * bewusst NEBEN dem Planblock und nicht darin: `versatz_x_mm`/`versatz_y_mm`
 * beschreiben die BILDlage ([L-9]) und werden beim Bildwechsel zurueckgesetzt.
 *
 * Seit #81 traegt das Geschoss ausserdem die MANUELLEN MENGEN seiner
 * Gesamtstueckliste ([P-20]):
 *
 *   geschoss.mengen = { "<Stuecklistenschluessel>@<Fertigmass|->": <ganze Zahl >= 0> }
 *
 * Ebenfalls OPTIONAL und abwaertskompatibel — KEIN Formatbump (`MAPPE_VERSION`
 * bleibt 2): fehlt das Feld, gibt es keine Uebersteuerung, und es wird keine
 * erfunden. Die Kennung ist dieselbe wie auf der Wandebene
 * (`storage.mengenKennung`) — eine zweite Kennungsform waere der Drift, den [P-6]
 * ausschliesst. Geprueft wird hier nur die STRUKTUR (`mengenFehler`), verrechnet
 * und gemeldet wird ausschliesslich in `sembla-gesamtstueckliste.js`.
 *
 * Seit dem Auftrag „Wandnamen als eindeutige Wandnummer je Gebaeude“ (Entscheid
 * Felix/Tibor 03.11.2026) ist der Wandname KEIN freies Feld mehr, sondern wird aus
 * zwei Angaben der Mappe erzeugt:
 *
 *   geschoss.kuerzel   = "EG"          // 1–2 Zeichen A–Z/0–9, je Gebaeude eindeutig
 *   wand.nr            = 12            // ganze Zahl ab 1, je GEBAEUDE eindeutig
 *   gebaeude.wand_nr_max = 14          // hoechste je vergebene Nummer (Zaehler)
 *   wand.name          = "Wand_EG-12"  // immer `wandName(kuerzel, nr)`, nie frei
 *
 * Nummern werden nie wieder vergeben und nichts rueckt nach: eine neue Wand bekommt
 * `wand_nr_max + 1`, eine geloeschte Nummer bleibt eine Luecke. Beim Verschieben
 * innerhalb des Gebaeudes bleibt die Nummer (nur das Kuerzel im Namen wechselt).
 * Vergeben, repariert (doppelt/fehlend) und benannt wird an GENAU EINER Stelle —
 * `_nummeriereGebaeude` in `normMappe` —, damit jeder Schreib- und Leseweg dieselbe
 * Antwort gibt. Alle Felder sind OPTIONAL und abwaertskompatibel — KEIN Formatbump:
 * fehlt ein Kuerzel, wird es aus der Geschossbezeichnung vorbelegt
 * (`kuerzelVorschlag`), fehlt eine Nummer, wird sie in Mappenreihenfolge vergeben.
 *
 * Dieses Modul ist REIN und DOM-frei (keine Datei-, keine localStorage-, keine
 * DOM-Zugriffe). Alle Struktur-Operationen liefern eine NEUE Mappe zurueck und
 * veraendern die uebergebene nicht. Persistenz und aktive Zeiger liegen in
 * `storage.js`, die Oberflaeche in Modul 0.
 *
 * Eigene Datei nach shared-Regel (b): eigene Tests (tests/module/test-projektmappe.mjs).
 */

import {
  normLage, lageFehler, laengeMm,
  normBemassung, bemassungenFehler,
  normUrsprung, ursprungFehler, ursprungPunkt, URSPRUNG_STANDARD,
} from "./sembla-constraints.js";

/** Version des OEFFENTLICHEN Projektmappen-Dateiformats (eigene Achse, getrennt
 *  von PROJEKT_VERSION, KATALOG_VERSION und SCHEMA_VERSION).
 *  v1 → v2 (Etappe C3.2): Lage in Millimetern statt Rastereinheiten ([L-1]) und
 *  Bemassungen je Geschoss ([K-10]). `migriereMappe` rechnet v1 verlustfrei um. */
export const MAPPE_VERSION = 2;

/** Dateiformat-Kennung (wie bei Projekt/Katalog: Verwechslungen werden benannt). */
export const MAPPE_FORMAT = "SEMBLA-Projektmappe";

/** Laengsraster in mm ([G-1]) — die Einheit der Lage ([L-1]). */
export const GRID_MM = 125;

/** Lagenhoehe in mm ([G-2]) — Pruefmass der Geschosshoehe ([L-5]). */
export const COURSE_MM = 200;

/** Zulaessige Wandrichtungen ([L-2]). Schraegen sind unzulaessig, nicht genaehert. */
export const RICHTUNGEN = /** @type {ReadonlyArray<'x'|'y'>} */ (["x", "y"]);

/** Name des bei der Uebernahme bestehender Staende angelegten Projekts ([L-7]). */
export const MIGRATIONS_PROJEKT = "Projekt ohne Plan";

/**
 * Felder der Projekt-Kopfdaten ([L-11]). Sie leben AM PROJEKT und nirgends sonst;
 * der Projektname ist kein Kopfdatenfeld, sondern der Name des Projektknotens.
 * Die Schluessel sind bewusst dieselben wie im Alt-Feld `eingaben.projekt`, damit
 * Zeichnung/Export dieselbe Form lesen — zusammengefuehrt wird trotzdem nie.
 */
export const KOPFDATEN_FELDER = /** @type {ReadonlyArray<string>} */ ([
  "bauherr", "planverfasser", "phase", "plan_nr", "index", "gez",
]);

// --- Geschosskuerzel und Wandnummer -----------------------------------------

/** Zulaessiges Geschosskuerzel: 1–2 Zeichen, Grossbuchstaben oder Ziffern. */
export const KUERZEL_MUSTER = /^[A-Z0-9]{1,2}$/;

/** Praefix des erzeugten Wandnamens. */
export const WANDNAME_PRAEFIX = "Wand_";

/**
 * Der Wandname — IMMER aus Geschosskuerzel und Wandnummer erzeugt, nie frei.
 * @param {string} kuerzel @param {number} nr @returns {string} z. B. „Wand_EG-12“
 */
export function wandName(kuerzel, nr) {
  return `${WANDNAME_PRAEFIX}${kuerzel}-${nr}`;
}

/** Kuerzel normalisieren (getrimmt, Grossbuchstaben); leer = null. @param {any} k */
export function normKuerzel(k) {
  if (k == null) return null;
  const s = String(k).trim().toUpperCase();
  return s ? s : null;
}

/**
 * Fehler eines Geschosskuerzels — leer = zulaessig. Geprueft werden Pflicht, Form und
 * Eindeutigkeit im Gebaeude; ein Verstoss wird BENANNT abgewiesen, nie zurechtgebogen.
 * @param {any} kuerzel @param {Iterable<string>} [belegt] Kuerzel der ANDEREN Geschosse
 * @param {string} [bezeichnung] Geschossname fuer die Meldung
 * @returns {string[]}
 */
export function kuerzelFehler(kuerzel, belegt, bezeichnung) {
  const wo = bezeichnung ? `Geschoss „${bezeichnung}“: ` : "";
  const k = normKuerzel(kuerzel);
  if (!k) return [`${wo}Das Geschosskürzel fehlt — es ist Pflicht (1–2 Zeichen, z. B. EG, OG, E1).`];
  if (!KUERZEL_MUSTER.test(k)) {
    return [`${wo}Geschosskürzel „${k}“ ist unzulässig — erlaubt sind 1–2 Zeichen aus `
      + "Großbuchstaben A–Z und Ziffern 0–9 (z. B. EG, OG, DG, E1, U1)."];
  }
  if (belegt && new Set(belegt).has(k)) {
    return [`${wo}Geschosskürzel „${k}“ ist in diesem Gebäude schon vergeben — es muss je Gebäude eindeutig sein.`];
  }
  return [];
}

/** Umlaute/ß fuer die Ableitung auf A–Z abbilden; alles andere ausser A–Z/0–9 faellt weg. */
function _alnum(s) {
  return String(s == null ? "" : s).toUpperCase()
    .replace(/Ä/g, "A").replace(/Ö/g, "O").replace(/Ü/g, "U").replace(/ß/g, "S")
    .replace(/[^A-Z0-9]/g, "");
}

/** Bekannte Geschossbezeichnungen → Kuerzel (vor der allgemeinen Ableitung). */
const KUERZEL_BEKANNT = [
  { muster: /erdgeschoss|\beg\b/i, kuerzel: "EG" },
  { muster: /obergeschoss|\bog\b/i, kuerzel: "OG" },
  { muster: /dachgeschoss|\bdg\b/i, kuerzel: "DG" },
  { muster: /untergeschoss|\bug\b/i, kuerzel: "UG" },
  { muster: /keller|\bkg\b/i, kuerzel: "KG" },
];

/**
 * Kuerzel-VORSCHLAG aus einer Geschossbezeichnung — nur fuer Bestand ohne Kuerzel und
 * als Vorbelegung im Dialog. Deterministisch und im Gebaeude eindeutig gemacht:
 *  - bekannte Muster: „EG“/„Erdgeschoss“ → EG, „OG“ → OG, „DG“, „UG“, „KG“/„Keller“;
 *    mit einstelliger Zahl dazu Buchstabe + Ziffer („1. OG“ → O1, „UG 2“ → U2);
 *  - sonst Anfangsbuchstabe + einstellige Zahl („Geschoss 1“ → G1), sonst die ersten
 *    zwei Zeichen („Halle“ → HA);
 *  - ist der Vorschlag vergeben: Anfangsbuchstabe (bei bekanntem Muster dessen
 *    Buchstabe) + 1…9, dann + A…Z, dann der erste freie Zweizeichner.
 * @param {string} name @param {Iterable<string>} [belegt] @returns {string}
 */
export function kuerzelVorschlag(name, belegt) {
  const frei = (k) => KUERZEL_MUSTER.test(k) && !besetzt.has(k);
  const besetzt = new Set(belegt || []);
  const text = String(name == null ? "" : name);
  const zahl = (text.match(/\d+/) || [""])[0];
  const ziffer = /^[1-9]$/.test(zahl) ? zahl : "";
  /** @type {string[]} */
  const kandidaten = [];
  const bekannt = KUERZEL_BEKANNT.find((b) => b.muster.test(text));
  if (bekannt) {
    if (ziffer) kandidaten.push(bekannt.kuerzel[0] + ziffer);
    kandidaten.push(bekannt.kuerzel);
  }
  const zeichen = _alnum(text);
  const buchstabe = (zeichen.match(/[A-Z]/) || ["G"])[0];
  // Ein bekanntes Muster bleibt bei seinem Buchstaben („EG“ belegt → E1, nicht „ER“).
  if (!bekannt) {
    if (ziffer) kandidaten.push(buchstabe + ziffer);
    if (zeichen.length >= 2) kandidaten.push(zeichen.slice(0, 2));
    else if (zeichen.length === 1) kandidaten.push(zeichen);
  }
  const erster = bekannt ? bekannt.kuerzel[0] : buchstabe;
  for (const z of "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") kandidaten.push(erster + z);
  for (const k of kandidaten) if (frei(k)) return k;
  const alle = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (const a of alle) for (const b of alle) if (frei(a + b)) return a + b;
  for (const a of alle) if (frei(a)) return a;
  throw new Error("Kein freies Geschosskürzel mehr in diesem Gebäude.");
}

/** Wandnummer normalisieren: ganze Zahl ab 1, sonst null (dann wird neu vergeben). */
function _normNr(v) {
  if (typeof v !== "number" && typeof v !== "string") return null;
  if (v === "") return null;
  const n = +v;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Kuerzel, Wandnummern und Wandnamen EINES (normalisierten) Gebaeudes herstellen —
 * die eine Stelle, an der vergeben wird. Veraendert `g` an Ort und Stelle.
 *  1. Fehlende Kuerzel werden aus der Bezeichnung vorgeschlagen (vorhandene bleiben
 *     reserviert, auch ein unzulaessiges — das meldet `validiereMappe`).
 *  2. Gueltige Nummern bleiben; fehlende und DOPPELTE (die zweite in
 *     Mappenreihenfolge) bekommen die naechste Nummer. Der Zaehler steigt nur.
 *  3. Jede Wand mit Nummer heisst `wandName(kuerzel, nr)`.
 * @param {any} g
 */
function _nummeriereGebaeude(g) {
  const belegt = new Set(g.geschosse.map((gs) => gs.kuerzel).filter(Boolean));
  for (const gs of g.geschosse) {
    if (gs.kuerzel) continue;
    gs.kuerzel = kuerzelVorschlag(gs.name, belegt);
    belegt.add(gs.kuerzel);
  }
  const vergeben = new Set();
  /** @type {any[]} */
  const offen = [];
  let max = g.wand_nr_max;
  for (const gs of g.geschosse) {
    for (const w of gs.waende) {
      if (w.nr != null && !vergeben.has(w.nr)) { vergeben.add(w.nr); if (w.nr > max) max = w.nr; }
      else offen.push(w);
    }
  }
  for (const w of offen) w.nr = ++max;
  g.wand_nr_max = max;
  for (const gs of g.geschosse) {
    for (const w of gs.waende) w.name = wandName(gs.kuerzel, w.nr);
  }
}

// --- Kennungen ------------------------------------------------------------

/** Neue, kollisionsarme Kennung mit sprechendem Praefix. @param {string} praefix */
export function neueId(praefix) {
  const p = String(praefix || "id");
  try {
    if (globalThis.crypto && globalThis.crypto.randomUUID) return p + "-" + globalThis.crypto.randomUUID();
  } catch { /* ignore */ }
  return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// --- Anlegen --------------------------------------------------------------

/**
 * Leere Projektmappe mit einem Gebaeude und einem Geschoss.
 * Die Struktur ist nach [L-6] immer vollstaendig — auch wenn die Oberflaeche
 * zunaechst nur ein Gebaeude zeigt.
 * @param {string} [name] Projektname
 * @param {{gebaeude?:string, geschoss?:string, hoehe_mm?:number, kuerzel?:string}} [opt]
 */
export function leereMappe(name, opt) {
  const o = opt || {};
  const geschoss = neuesGeschossObjekt(o.geschoss || "Geschoss 1", o.hoehe_mm, o.kuerzel);
  // Normalisiert zurueck, damit auch das erste Geschoss sofort sein Kuerzel traegt.
  return normMappe({
    format: MAPPE_FORMAT,
    version: MAPPE_VERSION,
    projekt: { id: neueId("prj"), name: (name || "Neues Projekt").toString(), kopfdaten: {} },
    katalog: null,
    gebaeude: [{ id: neueId("geb"), name: (o.gebaeude || "Gebäude 1").toString(), wand_nr_max: 0,
      geschosse: [geschoss] }],
  });
}

/**
 * Ein neues Geschoss-Objekt (ohne Plan, ohne Waende). Ohne Kuerzel bleibt es `null`
 * und wird von `normMappe` im Gebaeude eindeutig vorgeschlagen.
 * @param {string} name @param {number} [hoehe_mm] @param {string|null} [kuerzel]
 */
export function neuesGeschossObjekt(name, hoehe_mm, kuerzel) {
  return {
    id: neueId("gs"),
    name: (name || "Geschoss").toString(),
    kuerzel: normKuerzel(kuerzel),
    hoehe_mm: (hoehe_mm == null || !Number.isFinite(+hoehe_mm)) ? null : +hoehe_mm,
    plan: null,
    // Der eine Grundbezug des Geschosses ([K-4]) — frei platzierbar seit #76,
    // Standard 0/0. Er steht bewusst NICHT im Planblock: `versatz_*_mm` dort ist
    // die BILDlage ([L-9]) und wird beim Bildwechsel zurueckgesetzt.
    ursprung_mm: { ...URSPRUNG_STANDARD },
    waende: [],
    bemassungen: [],
    // Manuelle Mengen der Geschoss-Gesamtstueckliste ([P-20], #81). Leer = keine
    // Uebersteuerung; erfunden wird keine. Das Feld ist OPTIONAL und
    // abwaertskompatibel — KEIN Formatbump (s. `normMengen`).
    mengen: {},
  };
}

// --- Normalisierung -------------------------------------------------------

function _zahlOderNull(v) {
  return (v == null || v === "" || !Number.isFinite(+v)) ? null : +v;
}

/**
 * Lage-Bausteine kommen aus `sembla-constraints.js` — dort wohnt seit C3.2 die
 * ganze Lage-/Bemassungsmathematik ([L-1], [K-*]). Hier nur weitergereicht,
 * damit die bisherigen Aufrufer der Mappe unveraendert weiterarbeiten.
 */
export { normLage, lageFehler, normBemassung, normUrsprung, ursprungFehler, ursprungPunkt };

/** Einen Wandeintrag normalisieren (Struktur/Lage — nie Geometrie). */
export function normWand(w) {
  const o = (w && typeof w === "object") ? w : {};
  return {
    id: o.id == null ? "" : String(o.id),
    name: (o.name == null ? "" : String(o.name)),
    // Wandnummer je Gebaeude (null = noch keine; vergeben wird in `normMappe`).
    nr: _normNr(o.nr),
    datei: (o.datei == null || o.datei === "") ? null : String(o.datei),
    lage: normLage(o.lage),
  };
}

/**
 * Den Planblock eines Geschosses normalisieren ([L-8]/[L-9]).
 *
 * In der Mappe steht AUSSCHLIESSLICH die Beschreibung des Plans — Dateiname,
 * Bildmasse in Pixeln, Massstab und Versatz. Das BILD selbst liegt nie hier und
 * nie im localStorage, sondern in der eigenen Plan-Datenbank (`sembla-plan.js`).
 * Ein fehlender Massstab bleibt `null`: es wird keiner geschaetzt ([L-9]).
 */
export function normPlan(p) {
  if (p == null || typeof p !== "object") return null;
  return {
    datei: (p.datei == null || p.datei === "") ? null : String(p.datei),
    typ: (p.typ == null || p.typ === "") ? null : String(p.typ),
    breite_px: _zahlOderNull(p.breite_px),
    hoehe_px: _zahlOderNull(p.hoehe_px),
    mm_je_pixel: _zahlOderNull(p.mm_je_pixel),
    versatz_x_mm: _zahlOderNull(p.versatz_x_mm) || 0,
    versatz_y_mm: _zahlOderNull(p.versatz_y_mm) || 0,
  };
}

/**
 * Fehler EINES Planblocks ([L-8]/[L-9]). `null` (kein Plan) ist gueltig, ebenso
 * ein noch NICHT kalibrierter Plan (`mm_je_pixel: null`) — er wird dann ohne
 * Raster gezeigt, statt einen Massstab zu erfinden.
 * @param {any} plan @param {string} [bezeichnung] @returns {string[]}
 */
export function planFehler(plan, bezeichnung) {
  if (plan == null) return [];
  const wo = bezeichnung ? `Geschoss „${bezeichnung}“: ` : "";
  /** @type {string[]} */
  const f = [];
  if (typeof plan !== "object") return [`${wo}Planangabe ist kein Objekt.`];
  const p = normPlan(plan);
  if (p.mm_je_pixel != null && !(p.mm_je_pixel > 0)) {
    f.push(`${wo}Maßstab muss positiv sein (mm je Pixel) oder leer bleiben ([L-9]).`);
  }
  for (const [feld, wert] of [["Breite", p.breite_px], ["Höhe", p.hoehe_px]]) {
    if (wert != null && !(wert > 0)) f.push(`${wo}Bild${feld.toLowerCase()} muss positiv sein (Pixel).`);
  }
  return f;
}

/**
 * Manuelle Mengen eines Geschosses normalisieren ([P-20], #81).
 *
 * Die Abbildung ist flach: Positionskennung (`storage.mengenKennung`, also
 * `<Stuecklistenschluessel>@<Fertigmass|->`) -> ganze Zahl >= 0. Normalisiert wird
 * ausschliesslich die STRUKTUR — die WERTE reisen unveraendert mit:
 *
 *   Ein unzulaessig gespeicherter Wert (etwa aus einer fremden Datei) muss nach
 *   [P-20]/[P-9] BENANNT und nicht angewandt werden. Wuerde er hier weggeworfen
 *   oder zurechtgebogen, gaebe es nichts mehr zu melden — und ein bloszes Laden
 *   schriebe den Speicher still um. Geprueft und gemeldet wird deshalb erst in der
 *   Verrechnung (`sembla-gesamtstueckliste.js`).
 *
 * Fehlt das Feld (jeder Altstand), ist es leer — verlustfrei, idempotent und ohne
 * Formatbump; `MAPPE_VERSION` bleibt 2.
 * @param {any} v @returns {Record<string, any>}
 */
export function normMengen(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, w] of Object.entries(v)) {
    const key = String(k).trim();
    if (key) out[key] = w;
  }
  return out;
}

/**
 * Fehler der manuellen Mengen EINES Geschosses ([P-20], #81) — ausdruecklich nur
 * STRUKTURELL: eine Abbildung mit nicht leeren Schluesseln, kein Array.
 *
 * Die WERTE werden hier NICHT geprueft, und das ist Absicht: `validiereMappe` laeuft
 * bei jedem Schreibvorgang (`storage.setzeMappe`) und bei jedem Import
 * (`parseMappe`). Ein einziger unzulaessiger Wert machte die Mappe sonst unladbar
 * und unschreibbar — statt, wie [P-20] es verlangt, benannt und nicht angewandt zu
 * werden.
 * @param {any} mengen @param {string} [bezeichnung] @returns {string[]}
 */
export function mengenFehler(mengen, bezeichnung) {
  if (mengen == null) return [];
  const wo = bezeichnung ? `Geschoss „${bezeichnung}“: ` : "";
  if (typeof mengen !== "object" || Array.isArray(mengen)) {
    return [`${wo}Manuelle Mengen sind keine Abbildung Positionskennung → Menge ([P-20]).`];
  }
  const leer = Object.keys(mengen).filter((k) => !String(k).trim()).length;
  return leer ? [`${wo}Manuelle Mengen enthalten ${leer} Eintrag/Eintraege ohne Positionskennung ([P-20]).`] : [];
}

/** Ein Geschoss normalisieren. */
export function normGeschoss(g) {
  const o = (g && typeof g === "object") ? g : {};
  return {
    id: o.id == null ? "" : String(o.id),
    name: (o.name == null ? "" : String(o.name)),
    // Geschosskuerzel (Pflicht, je Gebaeude eindeutig). Fehlt es, schlaegt `normMappe`
    // eines aus der Bezeichnung vor — erfunden wird dabei nur ein VORSCHLAG.
    kuerzel: normKuerzel(o.kuerzel),
    hoehe_mm: _zahlOderNull(o.hoehe_mm),
    plan: normPlan(o.plan),
    // Geschossursprung ([K-4], #76). Fehlt das Feld (jeder Altstand), ist es 0/0 —
    // exakt die Lage, auf der er vor #76 fest sass. Die Uebernahme ist damit
    // verlustfrei und idempotent und braucht keinen Formatbump.
    ursprung_mm: normUrsprung(o.ursprung_mm),
    waende: Array.isArray(o.waende) ? o.waende.map(normWand) : [],
    // Bemassungen leben im GESCHOSS, nie am Wandelement ([K-10]). Fehlt das
    // Feld (Altstand v1), ist es schlicht leer — es wird keines erfunden.
    bemassungen: Array.isArray(o.bemassungen) ? o.bemassungen.map(normBemassung) : [],
    // Manuelle Mengen der Geschoss-Gesamtstueckliste ([P-20], #81). Das Feld MUSS
    // hier stehen: diese Funktion baut ein explizites Objekt, ein nicht genanntes
    // Feld ginge bei jedem `_klon`/`mappeObjekt` verloren — also bei jedem
    // Schreibvorgang und im Projektarchiv ([L-13]).
    mengen: normMengen(o.mengen),
  };
}

/**
 * Eine ganze Mappe normalisieren (fehlende Felder auffuellen, Typen glaetten).
 * Es wird NICHTS erfunden: fehlende Lagen bleiben null, unbekannte Zusatzfelder
 * des Projekts (Kopfdaten) reisen unveraendert mit.
 */
export function normMappe(m) {
  const o = (m && typeof m === "object") ? m : {};
  const p = (o.projekt && typeof o.projekt === "object") ? o.projekt : {};
  return {
    format: MAPPE_FORMAT,
    version: MAPPE_VERSION,
    projekt: {
      id: p.id == null || p.id === "" ? neueId("prj") : String(p.id),
      name: (p.name == null ? "" : String(p.name)),
      kopfdaten: (p.kopfdaten && typeof p.kopfdaten === "object") ? { ...p.kopfdaten } : {},
    },
    katalog: (o.katalog == null || o.katalog === "") ? null : String(o.katalog),
    gebaeude: (Array.isArray(o.gebaeude) ? o.gebaeude : []).map((g) => {
      const gg = (g && typeof g === "object") ? g : {};
      const zaehler = Number.isInteger(+gg.wand_nr_max) && +gg.wand_nr_max > 0 ? +gg.wand_nr_max : 0;
      const n = {
        id: gg.id == null || gg.id === "" ? neueId("geb") : String(gg.id),
        name: (gg.name == null ? "" : String(gg.name)),
        // Hoechste je vergebene Wandnummer dieses Gebaeudes — sie steigt nur, damit eine
        // geloeschte Nummer nie wieder vergeben wird und nichts nachrueckt.
        wand_nr_max: zaehler,
        geschosse: (Array.isArray(gg.geschosse) ? gg.geschosse : []).map(normGeschoss),
      };
      _nummeriereGebaeude(n);
      return n;
    }),
  };
}

// --- Validierung ----------------------------------------------------------

function _istGanzzahl(v) { return Number.isInteger(v); }

/**
 * Eine Mappe pruefen. Liefert eine Liste von Klartext-Fehlern (leer = gueltig).
 * Geprueft werden Format, Eindeutigkeit der Kennungen ([L-4]), Ganzzahligkeit
 * der Lage ([L-1]) und Orthogonalitaet ([L-2]).
 * @param {any} m @returns {string[]}
 */
export function validiereMappe(m) {
  /** @type {string[]} */
  const f = [];
  if (!m || typeof m !== "object") return ["Keine Projektmappe (kein Objekt)."];
  if (m.format !== MAPPE_FORMAT) f.push(`Format muss „${MAPPE_FORMAT}“ sein (gefunden: ${m.format ?? "—"}).`);
  if (+m.version !== MAPPE_VERSION) f.push(`Formatversion ${MAPPE_VERSION} erwartet (gefunden: ${m.version ?? "—"}).`);
  if (!m.projekt || typeof m.projekt !== "object" || !m.projekt.id) f.push("Projekt ohne Kennung.");
  if (!Array.isArray(m.gebaeude)) { f.push("Gebäudeliste fehlt."); return f; }

  const ids = new Set();
  const merke = (id, was) => {
    if (!id) { f.push(`${was} ohne Kennung.`); return; }
    if (ids.has(id)) f.push(`Kennung „${id}“ kommt mehrfach vor (${was}).`);
    ids.add(id);
  };
  if (m.projekt && m.projekt.id) merke(String(m.projekt.id), "Projekt");

  for (const g of m.gebaeude) {
    merke(g && g.id, "Gebäude");
    if (!Array.isArray(g?.geschosse)) { f.push(`Gebäude „${g?.name || g?.id}“ ohne Geschossliste.`); continue; }
    // Geschosskuerzel und Wandnummern je Gebaeude. Ein FEHLENDES Kuerzel bzw. eine
    // fehlende Nummer ist hier kein Fehler — `normMappe` belegt sie vor; geprueft wird,
    // was dasteht: Form und Eindeutigkeit, und dass der Zaehler nie hinter einer
    // vergebenen Nummer zurueckbleibt.
    const kuerzel = [];
    const nummern = new Set();
    for (const gs of g.geschosse) {
      if (gs?.kuerzel == null || gs.kuerzel === "") continue;
      f.push(...kuerzelFehler(gs.kuerzel, kuerzel, gs.name || gs.id));
      kuerzel.push(normKuerzel(gs.kuerzel));
    }
    for (const gs of g.geschosse) {
      for (const w of (Array.isArray(gs?.waende) ? gs.waende : [])) {
        if (w?.nr == null) continue;
        const nr = _normNr(w.nr);
        if (nr == null) { f.push(`Wand „${w.name || w.id}“: Wandnummer „${w.nr}“ ist keine ganze Zahl ab 1.`); continue; }
        if (nummern.has(nr)) f.push(`Gebäude „${g.name || g.id}“: Wandnummer ${nr} ist mehrfach vergeben.`);
        nummern.add(nr);
        if (g.wand_nr_max != null && nr > +g.wand_nr_max) {
          f.push(`Gebäude „${g.name || g.id}“: Wandnummer ${nr} liegt über dem Zähler ${g.wand_nr_max}.`);
        }
      }
    }
    for (const gs of g.geschosse) {
      merke(gs && gs.id, "Geschoss");
      if (gs?.hoehe_mm != null && !(gs.hoehe_mm > 0)) {
        f.push(`Geschoss „${gs.name || gs.id}“: Standard-Wandhöhe muss positiv sein.`);
      }
      f.push(...planFehler(gs?.plan, gs?.name || gs?.id));
      f.push(...ursprungFehler(gs?.ursprung_mm, gs?.name || gs?.id));
      // Nur STRUKTURELL ([P-20], s. `mengenFehler`): ein unzulaessiger WERT wird
      // gemeldet, nicht abgewiesen — sonst waere die Mappe deswegen unladbar.
      f.push(...mengenFehler(gs?.mengen, gs?.name || gs?.id));
      if (!Array.isArray(gs?.waende)) { f.push(`Geschoss „${gs?.name || gs?.id}“ ohne Wandliste.`); continue; }
      /** @type {Map<string,any>} */
      const lagen = new Map();
      for (const w of gs.waende) {
        merke(w && w.id, "Wand");
        f.push(...lageFehler(w?.lage, w?.name || w?.id));
        if (w && w.id) lagen.set(String(w.id), w.lage ?? null);
      }
      if (gs.bemassungen != null) {
        for (const m2 of bemassungenFehler(gs.bemassungen, lagen)) {
          f.push(`Geschoss „${gs.name || gs.id}“: ${m2}`);
        }
        for (const bm of (Array.isArray(gs.bemassungen) ? gs.bemassungen : [])) {
          merke(bm && bm.id, "Bemaßung");
        }
      }
    }
  }
  return f;
}

/** Kurzform: ist die Lage gueltig? (`null` = unverortet = gueltig) */
export function lageGueltig(lage) { return lageFehler(lage).length === 0; }

// --- Austauschformat ------------------------------------------------------

/** Oeffentliches Mappen-Objekt (fuer Datei/ZIP). @param {any} m */
export function mappeObjekt(m) {
  const n = normMappe(m);
  return {
    format: MAPPE_FORMAT, version: MAPPE_VERSION,
    projekt: n.projekt, katalog: n.katalog, gebaeude: n.gebaeude,
  };
}

/**
 * Mappen-Datei-Text deuten. Verwechselte Formate werden BENANNT, nicht geraten.
 * @param {string} text @returns {object} die geprueft normalisierte Mappe
 */
export function parseMappe(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error("Datei ist kein gültiges JSON."); }
  if (obj && obj.format === "SEMBLA-Bauteilkatalog") {
    throw new Error("Das ist ein Bauteilkatalog — bitte über den Katalogimport laden.");
  }
  if (obj && obj.format === "SEMBLA-Projekt") {
    throw new Error("Das ist eine einzelne Wanddatei (SEMBLA-Projekt) — bitte über den Wandimport laden.");
  }
  // Nach der Normalisierung gegen das ROHE Objekt pruefen, damit ein fehlendes
  // Format nicht durch die Normalisierung „repariert“ wirkt.
  if (!obj || obj.format !== MAPPE_FORMAT) {
    throw new Error(`Keine Projektmappe erkannt (format „${MAPPE_FORMAT}“ fehlt).`);
  }
  const m = normMappe(migriereMappe(obj));
  const fehler = validiereMappe(m);
  if (fehler.length) throw new Error("Projektmappe ungültig:\n– " + fehler.join("\n– "));
  return m;
}

// --- Lesen / Suchen -------------------------------------------------------

/** Alle Geschosse einer Mappe mit ihrem Gebaeude. @param {any} m */
export function alleGeschosse(m) {
  const n = normMappe(m);
  const out = [];
  for (const g of n.gebaeude) for (const gs of g.geschosse) out.push({ gebaeude: g, geschoss: gs });
  return out;
}

/** Alle verorteten/eingetragenen Waende mit ihrem Ort. @param {any} m */
export function alleWaende(m) {
  const out = [];
  for (const { gebaeude, geschoss } of alleGeschosse(m)) {
    for (const wand of geschoss.waende) out.push({ gebaeude, geschoss, wand });
  }
  return out;
}

/** Eine Wand samt Ort finden (null = nicht in der Mappe). @param {any} m @param {string} wandId */
export function findeWand(m, wandId) {
  return alleWaende(m).find((e) => e.wand.id === String(wandId)) || null;
}

/** Ein Geschoss samt Gebaeude finden. @param {any} m @param {string} geschossId */
export function findeGeschoss(m, geschossId) {
  return alleGeschosse(m).find((e) => e.geschoss.id === String(geschossId)) || null;
}

/** Ein Gebaeude finden. @param {any} m @param {string} gebaeudeId */
export function findeGebaeude(m, gebaeudeId) {
  return normMappe(m).gebaeude.find((g) => g.id === String(gebaeudeId)) || null;
}

// --- Struktur-Operationen (rein: liefern eine NEUE Mappe) ------------------

function _klon(m) { return JSON.parse(JSON.stringify(normMappe(m))); }

/**
 * Gebaeude anlegen.
 * @param {any} m @param {string} name @returns {{mappe:object, id:string}}
 */
export function fuegeGebaeudeHinzu(m, name) {
  const n = _klon(m);
  const g = { id: neueId("geb"), name: (name || "Gebäude").toString(), geschosse: [] };
  n.gebaeude.push(g);
  return { mappe: n, id: g.id };
}

/**
 * Geschoss in einem Gebaeude anlegen. Das Kuerzel ist Pflicht: angegeben wird es
 * geprueft (Form, Eindeutigkeit im Gebaeude) und bei Verstoss BENANNT abgewiesen;
 * ohne Angabe (programmatische Aufrufer) wird es aus der Bezeichnung vorgeschlagen.
 * @param {any} m @param {string} gebaeudeId @param {string} name @param {number} [hoehe_mm]
 * @param {string} [kuerzel]
 * @returns {{mappe:object, id:string}}
 */
export function fuegeGeschossHinzu(m, gebaeudeId, name, hoehe_mm, kuerzel) {
  const n = _klon(m);
  const g = n.gebaeude.find((x) => x.id === String(gebaeudeId));
  if (!g) throw new Error(`Unbekanntes Gebäude „${gebaeudeId}“.`);
  const k = normKuerzel(kuerzel);
  if (k) {
    const fehler = kuerzelFehler(k, g.geschosse.map((x) => x.kuerzel), name);
    if (fehler.length) throw new Error(fehler.join("\n"));
  }
  const gs = neuesGeschossObjekt(name, hoehe_mm, k);
  g.geschosse.push(gs);
  return { mappe: normMappe(n), id: gs.id };
}

/**
 * Das Kuerzel eines Geschosses setzen (Modul 0). Geprueft wie beim Anlegen; ein
 * Verstoss wird benannt abgewiesen. Die Namen aller Waende des Geschosses folgen
 * (die Nummern bleiben). @param {any} m @param {string} geschossId @param {string} kuerzel
 * @returns {object} neue Mappe
 */
export function setzeGeschossKuerzel(m, geschossId, kuerzel) {
  const n = _klon(m);
  const g = n.gebaeude.find((x) => x.geschosse.some((gs) => gs.id === String(geschossId)));
  if (!g) throw new Error(`Unbekanntes Geschoss „${geschossId}“.`);
  const gs = g.geschosse.find((x) => x.id === String(geschossId));
  const andere = g.geschosse.filter((x) => x !== gs).map((x) => x.kuerzel);
  const fehler = kuerzelFehler(kuerzel, andere, gs.name);
  if (fehler.length) throw new Error(fehler.join("\n"));
  gs.kuerzel = normKuerzel(kuerzel);
  return normMappe(n);
}

/**
 * Ist ein Kuerzel im Gebaeude noch frei? (fuer Uebernahmen, die eines mitbringen)
 * @param {any} m @param {string} gebaeudeId @param {any} kuerzel @param {string} [ausser] Geschoss-Kennung
 */
export function kuerzelFrei(m, gebaeudeId, kuerzel, ausser) {
  const g = findeGebaeude(m, gebaeudeId);
  if (!g) return false;
  const andere = g.geschosse.filter((gs) => gs.id !== ausser).map((gs) => gs.kuerzel);
  return kuerzelFehler(kuerzel, andere).length === 0;
}

/** Die naechste zu vergebende Wandnummer eines Gebaeudes (Zaehler + 1). */
export function naechsteWandNr(m, gebaeudeId) {
  const g = findeGebaeude(m, gebaeudeId);
  if (!g) throw new Error(`Unbekanntes Gebäude „${gebaeudeId}“.`);
  return g.wand_nr_max + 1;
}

/**
 * „Wandnummern neu berechnen“ (Modul 0, ausdrueckliche Aktion mit Warnung): alle
 * Waende des Gebaeudes werden lueckenlos neu nummeriert — Geschoss fuer Geschoss in
 * der Mappenreihenfolge, Waende in der Mappenreihenfolge — und der Zaehler auf die
 * hoechste Nummer gesetzt. Rein; bereits ausgegebene Plaene passen danach nicht mehr.
 * @param {any} m @param {string} gebaeudeId @returns {object} neue Mappe
 */
export function nummeriereWaendeNeu(m, gebaeudeId) {
  const n = _klon(m);
  const g = n.gebaeude.find((x) => x.id === String(gebaeudeId));
  if (!g) throw new Error(`Unbekanntes Gebäude „${gebaeudeId}“.`);
  g.wand_nr_max = 0;
  for (const gs of g.geschosse) for (const w of gs.waende) w.nr = null;
  return normMappe(n);
}

/**
 * Eine Wand in einem Geschoss eintragen oder ihren Eintrag aktualisieren
 * (Verortung). Die `id` ist die stabile Kennung des Wandelements ([L-4]) und
 * wird hier NIE vergeben — sie kommt aus dem Wandspeicher.
 *
 * Eine ungueltige Lage wird abgewiesen statt gerundet ([L-1]/[L-2]). Ist die
 * Wand bereits in einem ANDEREN Geschoss eingetragen, wird sie verschoben (eine
 * Wand steht nie zweimal in der Mappe — das waere eine doppelte Kennung).
 *
 * @param {any} m @param {string} geschossId
 * @param {{id:string, name?:string, datei?:string|null, lage?:any}} wand
 * @returns {object} neue Mappe
 */
export function setzeWand(m, geschossId, wand) {
  const id = String(wand?.id || "");
  if (!id) throw new Error("Wand ohne Kennung kann nicht verortet werden ([L-4]).");
  const fehler = lageFehler(wand?.lage, wand?.name || id);
  if (fehler.length) throw new Error(fehler.join("\n"));

  const n = _klon(m);
  const ziel = n.gebaeude.flatMap((g) => g.geschosse).find((gs) => gs.id === String(geschossId));
  if (!ziel) throw new Error(`Unbekanntes Geschoss „${geschossId}“.`);

  const zielGeb = n.gebaeude.find((g) => g.geschosse.includes(ziel));
  let vorher = null, vorherGeb = null;
  for (const g of n.gebaeude) {
    for (const gs of g.geschosse) {
      const i = gs.waende.findIndex((w) => w.id === id);
      if (i >= 0) { vorher = gs.waende[i]; vorherGeb = g; gs.waende.splice(i, 1); }
    }
  }
  // Die Wandnummer gilt je GEBAEUDE: beim Verschieben innerhalb des Gebaeudes bleibt
  // sie, nur das Kuerzel im Namen wechselt. In ein anderes Gebaeude reist sie nicht
  // mit — dort wird die naechste Nummer vergeben (`normMappe`).
  const nr = wand.nr !== undefined ? wand.nr : (vorherGeb === zielGeb ? (vorher?.nr ?? null) : null);
  ziel.waende.push(normWand({
    id,
    name: wand.name !== undefined ? wand.name : (vorher?.name || ""),
    nr,
    datei: wand.datei !== undefined ? wand.datei : (vorher?.datei ?? null),
    lage: wand.lage !== undefined ? wand.lage : (vorher?.lage ?? null),
  }));
  return normMappe(n);
}

/**
 * Die Lage einer bereits eingetragenen Wand aendern (oder mit `null` aufheben).
 * @param {any} m @param {string} wandId @param {any} lage @returns {object}
 */
export function setzeLage(m, wandId, lage) {
  const treffer = findeWand(m, wandId);
  if (!treffer) throw new Error(`Wand „${wandId}“ ist nicht in der Projektmappe eingetragen.`);
  return setzeWand(m, treffer.geschoss.id, { ...treffer.wand, lage });
}

/** Wandeintrag aus der Mappe entfernen (das Wandelement bleibt unberuehrt). */
export function entferneWand(m, wandId) {
  const n = _klon(m);
  for (const gs of n.gebaeude.flatMap((g) => g.geschosse)) {
    const i = gs.waende.findIndex((w) => w.id === String(wandId));
    if (i >= 0) gs.waende.splice(i, 1);
  }
  return n;
}

/** Geschoss entfernen. Enthaelt es noch Waende, wird das gemeldet statt still geloescht. */
export function entferneGeschoss(m, geschossId, { mitWaenden = false } = {}) {
  const n = _klon(m);
  for (const g of n.gebaeude) {
    const i = g.geschosse.findIndex((gs) => gs.id === String(geschossId));
    if (i < 0) continue;
    if (g.geschosse[i].waende.length && !mitWaenden) {
      throw new Error(`Geschoss „${g.geschosse[i].name}“ enthält noch ${g.geschosse[i].waende.length} Wand/Wände.`);
    }
    g.geschosse.splice(i, 1);
    return n;
  }
  throw new Error(`Unbekanntes Geschoss „${geschossId}“.`);
}

/** Gebaeude entfernen. Enthaelt es noch Geschosse, wird das gemeldet. */
export function entferneGebaeude(m, gebaeudeId, { mitInhalt = false } = {}) {
  const n = _klon(m);
  const i = n.gebaeude.findIndex((g) => g.id === String(gebaeudeId));
  if (i < 0) throw new Error(`Unbekanntes Gebäude „${gebaeudeId}“.`);
  if (n.gebaeude[i].geschosse.length && !mitInhalt) {
    throw new Error(`Gebäude „${n.gebaeude[i].name}“ enthält noch ${n.gebaeude[i].geschosse.length} Geschoss(e).`);
  }
  n.gebaeude.splice(i, 1);
  return n;
}

/**
 * Geschosshoehe setzen oder aufheben (`null` = keine Vorgabe). Sie ist nach [L-5]
 * nur eine VORGABE fuer neue Waende und wird nie ins Wandelement zurueckgeschrieben;
 * bestehende Waende des Geschosses bleiben unberuehrt. Ein nicht ins Lagenraster
 * passender Wert wird ANGENOMMEN und getrennt gemeldet (`hoehenVorgabe`) — gerundet
 * wird nichts. Nicht positive Werte sind unzulaessig und werden abgewiesen.
 * @param {any} m @param {string} geschossId @param {number|null} hoehe_mm
 * @returns {object} neue Mappe
 */
export function setzeGeschossHoehe(m, geschossId, hoehe_mm) {
  const h = _zahlOderNull(hoehe_mm);
  if (h != null && !(h > 0)) throw new Error("Standard-Wandhöhe muss positiv sein (oder leer bleiben).");
  const n = _klon(m);
  const gs = n.gebaeude.flatMap((g) => g.geschosse).find((x) => x.id === String(geschossId));
  if (!gs) throw new Error(`Unbekanntes Geschoss „${geschossId}“.`);
  gs.hoehe_mm = h;
  return n;
}

/**
 * Planbeschreibung eines Geschosses setzen oder aufheben (`null` = kein Plan)
 * ([L-8]/[L-9]).
 *
 * Gesetzt wird hier NUR die Beschreibung — Dateiname, Bildmasse, Massstab,
 * Versatz. Das Bild liegt in der eigenen Plan-Datenbank und wird von dieser
 * reinen Funktion nicht angefasst. Ein ungueltiger Massstab wird abgewiesen,
 * nicht zurechtgebogen; die WANDLAGEN des Geschosses bleiben unberuehrt — ein
 * Planwechsel oder eine Neukalibrierung verschiebt keine Wand ([L-9]).
 *
 * @param {any} m @param {string} geschossId @param {any} plan
 * @returns {object} neue Mappe
 */
export function setzePlan(m, geschossId, plan) {
  const p = plan == null ? null : normPlan(plan);
  const n = _klon(m);
  const gs = n.gebaeude.flatMap((g) => g.geschosse).find((x) => x.id === String(geschossId));
  if (!gs) throw new Error(`Unbekanntes Geschoss „${geschossId}“.`);
  const fehler = planFehler(p, gs.name || gs.id);
  if (fehler.length) throw new Error(fehler.join("\n"));
  gs.plan = p;
  return n;
}

/**
 * Massstab und/oder Versatz eines vorhandenen Plans aendern ([L-9]) — ohne die
 * uebrigen Planangaben (Datei, Bildmasse) anzutasten. Ohne hinterlegten Plan
 * wird das gemeldet statt einer angelegt.
 * @param {any} m @param {string} geschossId
 * @param {{mm_je_pixel?:number|null, versatz_x_mm?:number, versatz_y_mm?:number}} patch
 * @returns {object} neue Mappe
 */
export function setzePlanAnsicht(m, geschossId, patch) {
  const treffer = findeGeschoss(m, geschossId);
  if (!treffer) throw new Error(`Unbekanntes Geschoss „${geschossId}“.`);
  if (!treffer.geschoss.plan) {
    throw new Error(`Geschoss „${treffer.geschoss.name}“ hat keinen hinterlegten Plan.`);
  }
  return setzePlan(m, geschossId, { ...treffer.geschoss.plan, ...(patch || {}) });
}

/**
 * Projekt-Kopfdaten setzen ([L-11]). Sie leben AM PROJEKT; `eingaben.projekt` am
 * Wandelement wird dabei nie angefasst und nie zusammengefuehrt. Uebergeben wird
 * ein Patch: nur genannte Felder aendern sich, ein leerer String loescht das Feld.
 * Unbekannte Felder werden abgewiesen statt still einsortiert ([P-9]).
 * @param {any} m @param {Record<string,string>} patch @returns {object} neue Mappe
 */
export function setzeKopfdaten(m, patch) {
  const p = (patch && typeof patch === "object") ? patch : {};
  const fremd = Object.keys(p).filter((k) => !KOPFDATEN_FELDER.includes(k));
  if (fremd.length) {
    throw new Error(`Unbekannte Kopfdatenfelder: ${fremd.join(", ")} (zulässig: ${KOPFDATEN_FELDER.join(", ")}).`);
  }
  const n = _klon(m);
  const kd = { ...(n.projekt.kopfdaten || {}) };
  for (const [k, v] of Object.entries(p)) {
    const s = v == null ? "" : String(v).trim();
    if (s) kd[k] = s; else delete kd[k];
  }
  n.projekt.kopfdaten = kd;
  return n;
}

/**
 * Dem Projekt einen Bauteilkatalog zuordnen oder die Zuordnung aufheben ([L-12]).
 * Gespeichert wird ausschliesslich die KENNUNG des Katalogs — der Katalog selbst
 * bleibt eine eigene Ressource mit eigener Versionsachse.
 * @param {any} m @param {string|null} katalogId @returns {object} neue Mappe
 */
export function setzeKatalogRef(m, katalogId) {
  const n = _klon(m);
  const id = (katalogId == null || katalogId === "") ? null : String(katalogId);
  n.katalog = id;
  return n;
}

/**
 * Wirksame Kopfdaten eines Projekts fuer Zeichnung/Schriftfeld/Export ([L-11]).
 * Der Projektname reist als `name` mit, damit die Form der frueheren Quelle
 * `eingaben.projekt` entspricht — zusammengefuehrt wird nichts.
 * @param {any} m @returns {Record<string,string>}
 */
export function kopfdaten(m) {
  const n = normMappe(m);
  return { name: n.projekt.name, ...(n.projekt.kopfdaten || {}) };
}

/**
 * Umbenennen (Projekt/Gebaeude/Geschoss) anhand der Kennung. Eine WAND hat keinen
 * freien Namen mehr — er wird aus Geschosskuerzel und Wandnummer erzeugt; der
 * Versuch wird benannt abgewiesen.
 */
export function benenneUm(m, id, name) {
  const n = _klon(m);
  const neu = (name || "").toString();
  if (n.projekt.id === String(id)) { n.projekt.name = neu; return n; }
  for (const g of n.gebaeude) {
    if (g.id === String(id)) { g.name = neu; return n; }
    for (const gs of g.geschosse) {
      if (gs.id === String(id)) { gs.name = neu; return n; }
      for (const w of gs.waende) {
        if (w.id === String(id)) throw new Error(WANDNAME_FEST(w.name));
      }
    }
  }
  throw new Error(`Unbekannte Kennung „${id}“.`);
}

/** Meldung: der Wandname ist nicht frei aenderbar. @param {string} name */
export const WANDNAME_FEST = (name) => `Der Name „${name}“ wird aus Geschosskürzel und `
  + "Wandnummer gebildet und ist nicht frei änderbar — das Kürzel wird am Geschoss gepflegt.";

// --- Migration v1 → v2 ----------------------------------------------------

/**
 * Eine Mappe der Formatversion 1 auf Version 2 heben ([L-7]: verlustfrei und
 * idempotent). Geaendert hat sich mit Etappe C3.2 genau zweierlei:
 *
 *   1. Die Lage steht in MILLIMETERN statt in Rastereinheiten ([L-1]) —
 *      `start_grid: {x,y}` wird zu `start_mm: {x*125, y*125}`. Die LAENGE
 *      bleibt unveraendert `laenge_grid`.
 *   2. Ein Geschoss traegt `bemassungen` ([K-10]) — in v1 gab es die nicht,
 *      also bleibt die Liste leer. Es wird keine erfunden.
 *
 * In der Praxis ist das eine Leer-Migration: das Einzeichnen der Lage war nie
 * umgesetzt, im Bestand ist jede Lage `null`. Die Umrechnung existiert
 * trotzdem, damit eine exportierte v1-Datei verlustfrei laedt.
 *
 * @param {any} m @returns {any} Mappe in Formatversion 2
 */
export function migriereMappe(m) {
  if (!m || typeof m !== "object") return m;
  const v = +m.version;
  if (!(v >= 1) || v >= MAPPE_VERSION) return m;      // schon aktuell (oder unlesbar)
  const rasterZuMm = (lage) => {
    if (lage == null || typeof lage !== "object") return null;
    if (lage.start_mm) return lage;                    // bereits mm — nichts anfassen
    // v1 kennt keine gerichtete Orientierung (#84) — ein dennoch vorhandenes Feld
    // reist verlustfrei mit, erfunden wird keines (Normalisierung erst beim Lesen).
    const sg = lage.start_grid || {};
    const zahl = (x) => (x == null || x === "" || !Number.isFinite(+x)) ? null : +x * GRID_MM;
    return {
      start_mm: { x: zahl(sg.x), y: zahl(sg.y) }, richtung: lage.richtung,
      ...(lage.orientierung != null ? { orientierung: lage.orientierung } : {}),
      laenge_grid: lage.laenge_grid,
    };
  };
  return {
    ...m,
    version: MAPPE_VERSION,
    gebaeude: (Array.isArray(m.gebaeude) ? m.gebaeude : []).map((g) => ({
      ...g,
      geschosse: (Array.isArray(g?.geschosse) ? g.geschosse : []).map((gs) => ({
        ...gs,
        waende: (Array.isArray(gs?.waende) ? gs.waende : []).map((w) => ({ ...w, lage: rasterZuMm(w?.lage) })),
        bemassungen: Array.isArray(gs?.bemassungen) ? gs.bemassungen : [],
      })),
    })),
  };
}

// --- Bemassungen ([K-10]) -------------------------------------------------

/** Bemassungen eines Geschosses. @param {any} m @param {string} geschossId */
export function bemassungen(m, geschossId) {
  const gs = alleGeschosse(m).find((x) => x.geschoss.id === geschossId);
  return gs ? gs.geschoss.bemassungen : [];
}

/**
 * Der wirksame Geschossursprung ([K-4], #76). Unbekanntes Geschoss oder fehlendes
 * Feld ⇒ 0/0 — es wird keiner erfunden, denn 0/0 IST der Altstand.
 * @param {any} m @param {string} geschossId @returns {{x:number,y:number}}
 */
export function ursprung(m, geschossId) {
  const gs = alleGeschosse(m).find((x) => x.geschoss.id === geschossId);
  return ursprungPunkt(gs ? gs.geschoss.ursprung_mm : null);
}

/**
 * Den Geschossursprung setzen ([K-4], #76). Rein: liefert eine NEUE Mappe.
 *
 * Geschrieben wird AUSSCHLIESSLICH dieses Feld. Wandlagen bleiben unberuehrt —
 * dass die Masse dazu nachgefuehrt werden muessen, entscheidet und veranlasst der
 * Aufrufer im selben Schreibvorgang (`ursprungNachfuehrung` + `setzeBemassung`);
 * hier wird nichts stillschweigend mitgeaendert. Ein unbrauchbarer Punkt wird
 * ABGEWIESEN statt gerundet ([P-9]).
 *
 * @param {any} m @param {string} geschossId @param {{x:number,y:number}} punkt
 */
export function setzeUrsprung(m, geschossId, punkt) {
  const n = normMappe(m);
  if (!alleGeschosse(n).some((x) => x.geschoss.id === geschossId)) {
    throw new Error(`Geschoss „${geschossId}“ gibt es nicht.`);
  }
  const fehler = ursprungFehler(punkt == null ? {} : punkt);
  if (fehler.length) throw new Error(fehler.join("\n"));
  const u = normUrsprung(punkt);
  return _mitGeschoss(n, geschossId, (gs) => ({ ...gs, ursprung_mm: { x: u.x, y: u.y } }));
}

/**
 * Eine Bemassung setzen (neu oder ersetzen). Rein: liefert eine NEUE Mappe.
 * Eine ungueltige Bemassung wird ABGEWIESEN — der Speicher bleibt unveraendert
 * ([P-9]); insbesondere wird ein krummes Laengenmass nicht gerundet ([K-11]).
 * @param {any} m @param {string} geschossId @param {any} bem
 */
export function setzeBemassung(m, geschossId, bem) {
  const n = normMappe(m);
  const treffer = alleGeschosse(n).find((x) => x.geschoss.id === geschossId);
  if (!treffer) throw new Error(`Geschoss „${geschossId}“ gibt es nicht.`);
  const b = normBemassung(bem);
  if (!b.id) throw new Error("Bemaßung ohne Kennung ([L-4]).");
  const lagen = new Map(treffer.geschoss.waende.map((w) => [w.id, w.lage]));
  const fehler = bemassungenFehler([b], lagen);
  if (fehler.length) throw new Error(fehler.join("\n"));
  return _mitGeschoss(n, geschossId, (gs) => {
    const rest = gs.bemassungen.filter((x) => x.id !== b.id);
    const idx = gs.bemassungen.findIndex((x) => x.id === b.id);
    return { ...gs, bemassungen: idx < 0 ? [...rest, b] : gs.bemassungen.map((x) => (x.id === b.id ? b : x)) };
  });
}

/** Eine Bemassung entfernen. Unbekannte Kennung = unveraendert. */
export function loescheBemassung(m, geschossId, bemassungId) {
  return _mitGeschoss(normMappe(m), geschossId,
    (gs) => ({ ...gs, bemassungen: gs.bemassungen.filter((x) => x.id !== String(bemassungId)) }));
}

/**
 * Bemassungen entfernen, die auf eine (geloeschte) Wand verweisen. Wird beim
 * Entfernen einer Wand gebraucht: ein Mass ohne Bezugspunkt waere stiller Muell.
 * Liefert die neue Mappe und die Kennungen der entfernten Masse ([P-9]: der
 * Aufrufer sagt es).
 * @param {any} m @param {string} geschossId @param {string} wandId
 */
export function bemassungenOhneWand(m, geschossId, wandId) {
  const n = normMappe(m);
  const betroffen = bemassungen(n, geschossId)
    .filter((b) => b?.von?.wand === wandId || b?.bis?.wand === wandId)
    .map((b) => b.id);
  const neu = _mitGeschoss(n, geschossId,
    (gs) => ({ ...gs, bemassungen: gs.bemassungen.filter((b) => !betroffen.includes(b.id)) }));
  return { mappe: neu, entfernt: betroffen };
}

// --- Manuelle Mengen der Geschoss-Gesamtstueckliste ([P-20], #81) ---------
// Die BERECHNETE Menge bleibt ausschliesslich abgeleitet (sembla-bom.js -> die
// Aggregation in sembla-gesamtstueckliste.js) und wird bei jeder Ausgabe neu
// gerechnet. Daneben — nicht an ihrer Stelle — steht je aggregierter Position eine
// ausdrueckliche manuelle Menge.
//
// Sie liegt AM GESCHOSS, wie Bemassungen ([K-10]) und Ursprung ([K-4]): die
// Aggregation selbst ist fluechtig und koennte nichts tragen, und im Wandelement
// oder in `eingaben` waere sie eine Wandangabe, die sie nicht ist. Geschrieben wird
// ausschliesslich von Modul 4 ueber `storage.setzeGeschossMengeUebersteuerung`.

/**
 * Manuelle Mengen eines Geschosses — ROH, so wie sie in der Mappe stehen.
 *
 * Bewusst ungefiltert (wie `storage.holeMengen` auf der Wandebene): ein nicht
 * zuordenbarer oder unzulaessiger Eintrag wird von der Verrechnung BENANNT und
 * nicht hier stillschweigend entfernt ([P-9]/[P-20]).
 * @param {any} m @param {string} geschossId @returns {Record<string, any>}
 */
export function geschossMengen(m, geschossId) {
  const gs = alleGeschosse(m).find((x) => x.geschoss.id === String(geschossId));
  return gs ? { ...gs.geschoss.mengen } : {};
}

/**
 * EINE manuelle Menge eines Geschosses setzen oder zuruecksetzen ([P-20], #81).
 * Rein: liefert eine NEUE Mappe.
 *
 * `wert === null` entfernt genau diesen Eintrag VOLLSTAENDIG — danach gilt wieder
 * die berechnete Menge. Genau deshalb ist das eine eigene Operation und kein Patch:
 * ein zusammenfuehrender Weg koennte einen Schluessel nie entfernen.
 *
 * Geprueft und gemeldet wird der Wert kanonisch in `storage.pruefeMenge` (der
 * Schreibweg laeuft dort durch); die Pruefung hier ist die letzte strukturelle
 * Schranke einer reinen Operation — sie WEIST AB statt zu runden ([P-9]) und
 * erfindet nie eine Menge.
 *
 * @param {any} m @param {string} geschossId @param {string} kennung
 * @param {number|null} wert ganze Zahl >= 0 oder null (zuruecksetzen)
 * @returns {object} neue Mappe
 */
export function setzeGeschossMenge(m, geschossId, kennung, wert) {
  const k = kennung == null ? "" : String(kennung).trim();
  if (!k) throw new Error("Manuelle Menge ohne Positionskennung ([P-20]).");
  if (wert !== null && wert !== undefined) {
    if (!Number.isInteger(wert)) {
      throw new Error(`Menge ${wert} ist nicht ganzzahlig — nur ganze Stück sind einbaubar ([P-20]).`);
    }
    if (wert < 0) throw new Error(`Menge ${wert} ist negativ — zulässig sind ganze Zahlen ab 0 ([P-20]).`);
  }
  const n = normMappe(m);
  if (!alleGeschosse(n).some((x) => x.geschoss.id === String(geschossId))) {
    throw new Error(`Geschoss „${geschossId}“ gibt es nicht.`);
  }
  return _mitGeschoss(n, String(geschossId), (gs) => {
    const mengen = { ...(gs.mengen || {}) };
    if (wert === null || wert === undefined) delete mengen[k]; else mengen[k] = wert;
    return { ...gs, mengen };
  });
}

/** Ein Geschoss ersetzen (rein). @param {any} n @param {string} geschossId @param {(gs:any)=>any} fn */
function _mitGeschoss(n, geschossId, fn) {
  let gefunden = false;
  const out = {
    ...n,
    gebaeude: n.gebaeude.map((g) => ({
      ...g,
      geschosse: g.geschosse.map((gs) => {
        if (gs.id !== geschossId) return gs;
        gefunden = true;
        return fn(gs);
      }),
    })),
  };
  if (!gefunden) throw new Error(`Geschoss „${geschossId}“ gibt es nicht.`);
  return out;
}

// --- Ableitungen ----------------------------------------------------------

/** Wandlaenge in mm aus der Lage ([L-3]): laenge_grid × 125. `null` = unverortet. */
export function laengeAusLage(lage) { return laengeMm(lage); }

/**
 * Endpunkt einer Lage in mm (nur zur Darstellung; keine Ecken-/Anschlusslogik,
 * [L-2] — eine Ueberlappung wird nach [K-13] gemeldet, nie verrechnet).
 */
export function endpunktMm(lage) {
  const l = normLage(lage);
  const L = laengeMm(l);
  if (!l || L == null || !RICHTUNGEN.includes(l.richtung)) return null;
  const { x, y } = l.start_mm;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return l.richtung === "x" ? { x: x + L, y } : { x, y: y + L };
}

/**
 * Hoehenvorgabe eines Geschosses fuer eine NEUE Wand ([L-5]). Es wird nichts
 * gerundet: passt der Wert nicht ins Lagenraster, wird das benannt.
 *
 * Das Feld heisst intern weiter `geschoss.hoehe_mm` (Format unveraendert); in der
 * OBERFLAECHE heisst es seit #50 durchgaengig „Standard-Wandhoehe“ — genau das ist
 * es fachlich: eine Vorgabe fuer neue Waende, nie eine Geschoss- oder Deckenhoehe.
 * @param {number|null|undefined} hoehe_mm
 * @returns {{hoehe_mm:number|null, passt:boolean, lagen:number|null, hinweis:string|null}}
 */
export function hoehenVorgabe(hoehe_mm) {
  const h = _zahlOderNull(hoehe_mm);
  if (h == null || h <= 0) return { hoehe_mm: null, passt: false, lagen: null, hinweis: null };
  const passt = h % COURSE_MM === 0;
  return {
    hoehe_mm: h,
    passt,
    lagen: passt ? h / COURSE_MM : null,
    hinweis: passt ? null
      : `Standard-Wandhöhe ${h} mm ist kein Vielfaches der Lagenhöhe ${COURSE_MM} mm ([G-2]) — `
        + `die Wandhöhe ist ausdrücklich zu wählen (${Math.floor(h / COURSE_MM) * COURSE_MM} mm oder `
        + `${Math.ceil(h / COURSE_MM) * COURSE_MM} mm). Es wird nichts gerundet ([L-5]).`,
  };
}

/**
 * Weicht die Wandlaenge des Wandelements von der gezeichneten Lage ab? ([L-3])
 * Wird sichtbar gemeldet, nie still angeglichen.
 * @param {any} lage @param {number|null|undefined} length_mm
 * @returns {{abweichung:boolean, lage_mm:number|null, wand_mm:number|null}}
 */
export function laengenAbgleich(lage, length_mm) {
  const lage_mm = laengeAusLage(lage);
  const wand_mm = _zahlOderNull(length_mm);
  return {
    abweichung: lage_mm != null && wand_mm != null && lage_mm !== wand_mm,
    lage_mm, wand_mm,
  };
}

// --- Referenzintegritaet ([L-4]) ------------------------------------------

/**
 * Mappe gegen den Wandspeicher abgleichen. Es wird NICHTS bereinigt und
 * NICHTS neu verknuepft — nur berichtet.
 *
 * @param {any} m
 * @param {Array<{id:string,name?:string}>|Set<string>|string[]} elemente vorhandene Wandelemente
 * @returns {{verwaist:Array<{id:string,name:string,geschoss:string}>, unverortet:string[], ohneLage:Array<{id:string,name:string}>}}
 *   verwaist    — Eintrag in der Mappe, aber kein Wandelement dazu
 *   unverortet  — Wandelement vorhanden, aber kein Eintrag in der Mappe (Normalfall vor der Verortung)
 *   ohneLage    — eingetragen, aber (noch) nicht im Raster gezeichnet
 */
export function pruefeReferenzen(m, elemente) {
  const vorhanden = new Set(
    (elemente instanceof Set ? [...elemente] : (elemente || []))
      .map((e) => (typeof e === "string" ? e : e?.id))
      .filter(Boolean)
      .map(String),
  );
  const verwaist = [], ohneLage = [];
  const inMappe = new Set();
  for (const { geschoss, wand } of alleWaende(m)) {
    inMappe.add(wand.id);
    if (!vorhanden.has(wand.id)) verwaist.push({ id: wand.id, name: wand.name, geschoss: geschoss.name });
    if (wand.lage == null) ohneLage.push({ id: wand.id, name: wand.name });
  }
  const unverortet = [...vorhanden].filter((id) => !inMappe.has(id));
  return { verwaist, unverortet, ohneLage };
}

// --- Uebernahme bestehender Staende ([L-7]) --------------------------------

/**
 * Bestehende Wandelemente in eine neue Mappe uebernehmen — OHNE Lagedaten.
 * Eine Lage, die es nie gab, wird nicht erfunden; die Waende sind unverortet
 * im Sinne von [L-4]. Idempotent verwendbar: bereits eingetragene Kennungen
 * werden nicht doppelt angelegt.
 *
 * @param {Array<{id:string,name?:string}>} elemente
 * @param {any} [mappe] vorhandene Mappe (Default: neue „Projekt ohne Plan“)
 * @returns {object} die Mappe
 */
export function uebernehmeElemente(elemente, mappe) {
  let m = mappe ? _klon(mappe) : leereMappe(MIGRATIONS_PROJEKT);
  if (!m.gebaeude.length) m = fuegeGebaeudeHinzu(m, "Gebäude 1").mappe;
  if (!m.gebaeude[0].geschosse.length) m = fuegeGeschossHinzu(m, m.gebaeude[0].id, "Geschoss 1").mappe;
  const zielId = m.gebaeude[0].geschosse[0].id;
  for (const e of (elemente || [])) {
    const id = String(e?.id || "");
    if (!id || findeWand(m, id)) continue;
    m = setzeWand(m, zielId, { id, name: (e.name || id).toString(), datei: null, lage: null });
  }
  return m;
}
