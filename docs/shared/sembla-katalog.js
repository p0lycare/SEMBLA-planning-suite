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
 *   KATALOG_VERSION  — oeffentliches Katalog-Dateiformat (hier, v2 seit #94:
 *                      Baugruppen/Sets; v1 wird beim Import verlustfrei migriert)
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
export const KATALOG_VERSION = 2;

/** Kennung des oeffentlichen Katalogformats. */
export const KATALOG_FORMAT = "SEMBLA-Bauteilkatalog";

// --- Kanonische Vorlagenidentitaet (#102) ----------------------------------
// Der mitgelieferte Standardkatalog ist eine UNVERAENDERLICHE Vorlage. Damit
// „Standardkatalog“ im Browser immer denselben Inhalt bedeutet, braucht die
// daraus geladene Ressource eine Identitaet, die NICHT am Katalognamen haengt:
// der Name ist ein freies Anzeigefeld und wurde bisher zum Wiedererkennen
// benutzt — dadurch galt eine lokal veraenderte Ressource als „Repo-Vorlage“,
// und ein umbenannter Katalog war gar nicht mehr auffindbar.
//
// Die Identitaet leitet sich ALLEIN aus dem VORLAGENPFAD ab. Sie steht damit
// nicht in der Datei (parseKatalog nimmt ohnehin nur format/version/name/
// produkte/sets an) und reist nicht in Exporte (katalogObjekt streicht sie) —
// sie beruehrt das oeffentliche Dateiformat also nicht.

/** Pfad der mitgelieferten Standardkatalog-Vorlage (relativ zu `docs/`). */
export const VORLAGE_KATALOG_PFAD = "./vorlagen/SEMBLA_Standardkatalog.json";

/** Feldname des Vorlagenmarkers an der gespeicherten Browserressource. */
export const VORLAGE_FELD = "vorlage";

/**
 * Kanonische Kennung der aus einer Repo-Vorlage geladenen Browserressource.
 * Deterministisch aus dem Pfad — nie aus Name, Inhalt oder Reihenfolge.
 * @param {string} pfad @returns {string}
 */
export function vorlageKatalogId(pfad) {
  const roh = String(pfad == null ? "" : pfad).trim()
    .replace(/^\.?\/+/, "").replace(/\.json$/i, "");
  const slug = roh.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Vorlagenpfad fehlt — ohne Pfad gibt es keine kanonische Vorlagenidentität.");
  return "kat-vorlage-" + slug;
}

/**
 * Traegt eine gespeicherte Katalogressource die kanonische Vorlagenidentitaet?
 * Geprueft wird der Marker UND die dazu passende Kennung — beides kommt nur aus
 * dem Ladeweg der Vorlage, nie aus einer Datei und nie aus dem Namen.
 * @param {any} k @returns {boolean}
 */
export function istVorlagenKatalog(k) {
  if (!k || typeof k !== "object") return false;
  const pfad = k[VORLAGE_FELD];
  if (typeof pfad !== "string" || !pfad.trim()) return false;
  try { return String(k.id) === vorlageKatalogId(pfad); } catch { return false; }
}

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

// --- Kategoriegerechte Produktmaske ([P-16]) -------------------------------
// Welche Felder eine Kategorie fachlich hat, welche Beschriftung sie tragen und in
// welcher Reihenfolge sie erscheinen — an EINER Stelle, DOM-frei und damit testbar.
// Modul 0 rendert daraus seinen Pflegedialog; die PFLICHT-Angabe wird NICHT hier
// wiederholt, sondern aus KATEGORIEN[].pflicht gelesen (eine Quelle, kein Drift).
//
// Die Feldschlüssel bleiben die kanonischen (`breite_mm` …): die Maß-Diskriminatoren
// der Preisauflösung ([P-14], ROLLEN[].mass) zeigen darauf. Kategoriespezifisch sind
// nur Auswahl, Reihenfolge, Beschriftung und Hinweis.
//
// `typ` "text" = freie Kennung, "mm" = Maß in Millimetern (Zahl > 0).

/** @type {Readonly<Record<string, ReadonlyArray<{feld:string,label:string,typ:"text"|"mm",platzhalter?:string,hinweis?:string}>>>} */
const _MASKEN = {
  stein: [
    { feld: "breite_mm", label: "Steinbreite", typ: "mm",
      hinweis: "maßgebend für die Preiszuordnung der Steinpositionen" },
    { feld: "hoehe_mm", label: "Steinhöhe (Lagenhöhe)", typ: "mm" },
    { feld: "dicke_mm", label: "Steintiefe (Wandstärke)", typ: "mm" },
  ],
  gewindestange: [
    { feld: "gewinde", label: "Gewinde", typ: "text", platzhalter: "M10" },
    { feld: "guete", label: "Güte", typ: "text", platzhalter: "8.8" },
    { feld: "laenge_mm", label: "Stangenlänge", typ: "mm",
      hinweis: "maßgebend für die Preiszuordnung der Vorspannpositionen" },
  ],
  latte: [
    { feld: "breite_mm", label: "Querschnitt Breite", typ: "mm" },
    { feld: "dicke_mm", label: "Querschnitt Dicke", typ: "mm" },
    { feld: "laenge_mm", label: "Standardlänge", typ: "mm",
      hinweis: "maßgebend für die Preiszuordnung der Lattenstangen" },
  ],
  beplankung: [
    { feld: "breite_mm", label: "Plattenbreite", typ: "mm" },
    { feld: "hoehe_mm", label: "Plattenhöhe", typ: "mm" },
    { feld: "dicke_mm", label: "Plattendicke", typ: "mm" },
  ],
  blech_platte: [
    { feld: "breite_mm", label: "Blechbreite (Modullänge)", typ: "mm",
      hinweis: "maßgebend für die Preiszuordnung der Boden-/Kopfbleche" },
    { feld: "hoehe_mm", label: "Blechhöhe", typ: "mm" },
    { feld: "dicke_mm", label: "Blechdicke", typ: "mm" },
  ],
  verbinder: [],            // bewusst ohne Maße: Katalog v1 führt kein Typ-/Maßmerkmal ([U-9])
  verbrauch: [],            // Kleinteile/Meterware: Preisbasis genügt, keine fachfremden Maße
};

/**
 * Fachliche Eingabemaske einer Kategorie ([P-16]) — geordnete Feldliste mit
 * Beschriftung, Einheit und Pflichtkennzeichen. Die Pflicht kommt aus
 * KATEGORIEN[].pflicht, damit Maske und `validiereProdukt` dieselbe Quelle nutzen.
 * Unbekannte Kategorie -> leere Maske (nur die Grundfelder sind dann pflegbar).
 * @param {string} katId
 * @returns {Array<{feld:string,label:string,typ:"text"|"mm",einheit:string|null,
 *                  pflicht:boolean,platzhalter:string|null,hinweis:string|null}>}
 */
export function maskeVonKategorie(katId) {
  const k = kategorie(katId);
  if (!k) return [];
  const pflicht = k.pflicht || [];
  return (_MASKEN[k.id] || []).map((f) => ({
    feld: f.feld,
    label: f.label,
    typ: f.typ,
    einheit: f.typ === "mm" ? "mm" : null,
    pflicht: pflicht.includes(f.feld),
    platzhalter: f.platzhalter || null,
    hinweis: f.hinweis || null,
  }));
}

/** Feldschlüssel der Maske einer Kategorie (Reihenfolge der Maske). @param {string} katId */
export function maskeFelder(katId) {
  return maskeVonKategorie(katId).map((f) => f.feld);
}

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
  return { format: KATALOG_FORMAT, version: KATALOG_VERSION,
           name: (name || "Neuer Katalog").toString(), produkte: [], sets: [] };
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

// --- Baugruppen / Sets ([P-21], Katalogformat v2) -------------------------
// Ein SET ist eine benannte Liste von Positionen — die DEFINITIONSEBENE des Katalogs
// fuer wiederkehrende Bauteilgruppen (Wandabschluss, Deckenanschluss). Es lebt
// AUSSCHLIESSLICH am Katalog (`katalog.sets`), nie im Wandelement, nie in `eingaben`
// und nie in der Projektmappe.
//
// Eine Position benennt GENAU EINE Sache: entweder ein Katalogprodukt (`produkt`)
// oder eine Verwendungsrolle (`rolle`) — dazu eine ganzzahlige Menge >= 1. Die beiden
// Felder sind DISJUNKT: beide gesetzt oder keines gesetzt ist ein Fehler, kein Vorrang.
// Dasselbe Bauteil darf in beliebig vielen Sets vorkommen (die Unterlegscheibe steht in
// „Wandabschluss" UND in „Deckenanschluss") — das ist ausdruecklich zulaessig.
//
// VERSCHACHTELUNG IST AUSGESCHLOSSEN: ein Set ist nie Position eines anderen Sets. Der
// Fall bekommt eine EIGENE Meldung, damit der Ausschluss sichtbar ist und nicht als
// unspezifisches „unbekannte Positionsform" untergeht.
//
// Dieses Modul DEFINIERT und PRUEFT Sets — es loest sie NICHT auf. Die Stueckliste
// bleibt flach ([P-19]); eine Aufloesung in Mengen gibt es hier bewusst nicht.

/** Leeres Set-Geruest (Startwerte des Anlage-Formulars). @param {string} [name] */
export function neuesSet(name) {
  return { id: "", name: String(name == null ? "" : name), positionen: [] };
}

/** Vorschlag fuer eine sprechende, stabile Set-Kennung. @param {string} name */
export function vorschlagSetId(name) {
  const sl = _slug(name);
  return sl ? "set-" + sl : "set";
}

/**
 * Ein Set auf die kanonische Form bringen — REIN und OHNE stille Korrektur:
 * Zeichenketten werden getrimmt, die Positionsliste wird kopiert, unbekannte
 * Zusatzfelder bleiben erhalten (Vorwaertskompatibilitaet). Ungueltige Werte
 * (Menge 0, fehlende Referenz) bleiben stehen und werden von `validiereSet`
 * benannt — hier wird nichts zurechtgebogen.
 * @param {any} s
 */
export function normSet(s) {
  const roh = (s && typeof s === "object") ? s : {};
  return {
    ...roh,
    id: String(roh.id == null ? "" : roh.id).trim(),
    name: String(roh.name == null ? "" : roh.name).trim(),
    positionen: (Array.isArray(roh.positionen) ? roh.positionen : [])
      .map((pos) => (pos && typeof pos === "object" ? { ...pos } : pos)),
  };
}

/** Eine Set-Liste normalisieren (nie null, Reihenfolge unveraendert). @param {any} liste */
export function normSets(liste) {
  return (Array.isArray(liste) ? liste : []).map(normSet);
}

/** Traegt die Position eine Produkt-Angabe? (leere Zeichenkette zaehlt nicht) */
function _hatFeld(pos, feld) {
  const v = pos ? pos[feld] : undefined;
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/**
 * Ein Set pruefen. Liefert eine Liste konkreter Fehlermeldungen (leer = ok).
 * Es wird NIE stillschweigend korrigiert ([P-9]).
 * @param {any} s Set
 * @param {{produktIds?:string[], setIds?:string[]}} [opts] `setIds` = bereits vergebene
 *   Set-Kennungen (Eindeutigkeit), `produktIds` = Produkte dieses Katalogs
 * @returns {string[]}
 */
export function validiereSet(s, opts = {}) {
  const e = [];
  if (!s || typeof s !== "object" || Array.isArray(s)) return ["Set ist kein Objekt."];

  const id = s.id == null ? "" : String(s.id).trim();
  if (!id) e.push("Kennung fehlt.");
  else if (/\s/.test(id)) e.push(`Kennung „${id}“ darf keine Leerzeichen enthalten.`);
  else if ((opts.setIds || []).includes(id)) e.push(`Kennung „${id}“ ist bereits vergeben.`);

  if (!String(s.name == null ? "" : s.name).trim()) e.push("Name fehlt.");

  if (!Array.isArray(s.positionen)) return e.concat("Feld „positionen“ fehlt oder ist keine Liste.");

  const produktIds = (opts.produktIds || []).map(String);
  s.positionen.forEach((pos, i) => {
    const nr = `Position ${i + 1}: `;
    if (!pos || typeof pos !== "object" || Array.isArray(pos)) { e.push(nr + "keine Position."); return; }

    // Verschachtelung bekommt eine EIGENE Meldung — der Ausschluss ist fachlich, nicht
    // bloss eine unbekannte Form ([P-21]).
    if (_hatFeld(pos, "set") || _hatFeld(pos, "sets")) {
      e.push(nr + "verschachtelte Sets sind unzulässig — ein Set enthält nur Produkte und "
        + "Verwendungsrollen, nie ein weiteres Set.");
      return;
    }

    const hatP = _hatFeld(pos, "produkt"), hatR = _hatFeld(pos, "rolle");
    if (hatP && hatR) {
      e.push(nr + "es ist genau eine Angabe zulässig — entweder ein Produkt oder eine "
        + "Verwendungsrolle, nicht beides.");
    } else if (!hatP && !hatR) {
      e.push(nr + "weder ein Produkt noch eine Verwendungsrolle angegeben.");
    } else if (hatP) {
      const pid = String(pos.produkt).trim();
      if (!produktIds.includes(pid)) e.push(nr + `Produkt „${pid}“ ist in diesem Katalog nicht vorhanden.`);
    } else {
      const rid = String(pos.rolle).trim();
      const r = rolle(rid);
      if (!r) e.push(nr + `Unbekannte Verwendungsrolle „${rid}“.`);
      else if (!_waehlbar(r)) {
        e.push(nr + `Verwendungsrolle „${rid}“ ist nicht wählbar und kann nicht in einem Set stehen.`);
      }
    }

    const menge = pos.menge;
    if (menge === undefined || menge === null || String(menge).trim() === "") {
      e.push(nr + "Menge fehlt (ganze Zahl ≥ 1).");
    } else {
      const n = Number(menge);
      if (!Number.isFinite(n)) e.push(nr + `Menge „${menge}“ ist keine Zahl.`);
      else if (!Number.isInteger(n)) e.push(nr + `Menge ${n} muss eine ganze Zahl sein.`);
      else if (n < 1) e.push(nr + `Menge ${n} muss mindestens 1 sein.`);
    }
  });
  return e;
}

/** Set per Kennung finden. @param {any} k @param {string} id */
export function set(k, id) {
  return normSets(k && k.sets).find((s) => s.id === String(id).trim()) || null;
}

/**
 * Positionen EINES Sets — reine Leseansicht, ausdruecklich OHNE Aufloesung in
 * Stuecklistenmengen ([P-19]/[P-21]). Jede Position nennt ihre Art, die Referenz,
 * die Menge und einen Klartext fuer die Oberflaeche; eine unaufloesbare Referenz
 * wird als solche GEMELDET, nie ersetzt.
 * @param {any} k @param {string} id
 * @returns {Array<{art:"produkt"|"rolle"|"unbekannt",ref:string,menge:any,text:string,fehlt:boolean}>}
 */
export function setPositionen(k, id) {
  const s = set(k, id);
  if (!s) return [];
  return s.positionen.map((pos) => {
    if (_hatFeld(pos, "produkt")) {
      const ref = String(pos.produkt).trim();
      const p = produkt(k, ref);
      return { art: "produkt", ref, menge: pos.menge, fehlt: !p,
               text: p ? (String(p.bezeichnung || "").trim() || ref) : ref };
    }
    if (_hatFeld(pos, "rolle")) {
      const ref = String(pos.rolle).trim();
      const r = rolle(ref);
      return { art: "rolle", ref, menge: pos.menge, fehlt: !r, text: r ? r.label : ref };
    }
    return { art: "unbekannt", ref: "", menge: pos && pos.menge, fehlt: true, text: "—" };
  });
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

  // Standardrollen ([P-18]): optionales Feld. Es wird streng geprueft, damit eine
  // Vorbelegung niemals ein fachfremdes Produkt an eine Verwendungsstelle setzt.
  if (p.rollen !== undefined) {
    if (!Array.isArray(p.rollen)) e.push("Feld „rollen“ muss eine Liste von Verwendungsrollen sein.");
    else for (const rid of p.rollen) {
      const r = rolle(String(rid));
      if (!r) e.push(`Unbekannte Verwendungsrolle „${rid}“ in „rollen“.`);
      else if (!_waehlbar(r)) e.push(`Verwendungsrolle „${rid}“ ist nicht wählbar und kann nicht vorbelegt werden.`);
      else if (k && r.kategorie !== k.id) {
        e.push(`Verwendungsrolle „${rid}“ erwartet Kategorie ${kategorieLabel(r.kategorie)}, `
          + `das Produkt ist ${k.label}.`);
      }
    }
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
  // Sets sind OPTIONAL ([P-22]): ein Katalog ohne das Feld ist ein Katalog ohne
  // Baugruppen — es wird nichts erfunden und nichts migriert.
  if (k.sets !== undefined) {
    if (!Array.isArray(k.sets)) return e.concat("Feld „sets“ ist keine Liste.");
    const setIds = [];
    k.sets.forEach((s, i) => {
      const name = s && s.name != null ? String(s.name).trim() : "";
      const kopf = `Set ${i + 1}` + (name ? ` („${name}“)` : "") + ": ";
      for (const msg of validiereSet(s, { produktIds: ids, setIds })) e.push(kopf + msg);
      const sid = s && s.id != null ? String(s.id).trim() : "";
      if (sid) setIds.push(sid);
    });
  }
  return e;
}

/**
 * Katalog-Text (Datei) deuten und streng pruefen. Erkennt verwechselte Formate
 * und nennt den richtigen Weg. Unbekannte Zusatzfelder bleiben erhalten
 * (Vorwaertskompatibilitaet).
 * @param {string} text @returns {{format:string,version:number,name:string,produkte:any[],sets:any[]}}
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
  // MIGRATION v1 -> v2 ([P-22]): ein gueltiger v1-Katalog wird VERLUSTFREI uebernommen —
  // seine Produkte unveraendert, dazu eine LEERE Set-Liste. Es wird kein Set erfunden und
  // kein Produktfeld angefasst. Baugruppen gibt es erst ab v2, ein `sets`-Feld an einer
  // v1-Datei ist deshalb kein v1-Inhalt und wird nicht uebernommen.
  if (v < 2 && obj.sets !== undefined) {
    throw new Error("Diese Datei nennt sich Katalogformat Version 1, führt aber Baugruppen "
      + `(Feld „sets“) — die gibt es erst ab Version ${KATALOG_VERSION}. Die Versionsangabe der `
      + "Datei ist zu korrigieren; hier wird nichts geraten.");
  }
  const sets = v < 2 ? [] : (obj.sets === undefined ? [] : obj.sets);
  if (!Array.isArray(sets)) throw new Error("Feld „sets“ ist keine Liste.");
  const kat = {
    format: KATALOG_FORMAT, version: KATALOG_VERSION,
    name: String(obj.name == null || String(obj.name).trim() === "" ? "Importierter Katalog" : obj.name),
    produkte: obj.produkte.map((p) => ({ ...p })),
    sets: normSets(sets),
  };
  const fehler = validiereKatalog(kat);
  if (fehler.length) throw new Error("Katalog ungültig:\n– " + fehler.join("\n– "));
  return kat;
}

/**
 * Katalog als oeffentliches Datei-Objekt (Export). Interne Zusatzfelder des
 * Browserzustands (z. B. `geaendert`) reisen NICHT mit.
 * @param {any} k @returns {{format:string,version:number,name:string,produkte:any[],sets:any[]}}
 */
export function katalogObjekt(k) {
  return {
    format: KATALOG_FORMAT, version: KATALOG_VERSION,
    name: String((k && k.name) || "Bauteilkatalog"),
    produkte: ((k && k.produkte) || []).map((p) => ({ ...p })),
    // Die Whitelist ist zugleich der Normalisierer JEDES Schreibvorgangs
    // (storage._speichereKatalog) — fehlte `sets` hier, verschwaende jede gepflegte
    // Baugruppe still beim naechsten Speichern.
    sets: normSets(k && k.sets),
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
// `waehlbar` = false: die Rolle wird NICHT zur Auswahl angeboten (Modul 1/2 zeigen sie
//            nicht). Ihr Stuecklistenschluessel bleibt bestehen — die Menge ist Bedarf der
//            Baustelle, das ausfuehrende Produkt aber bewusst nicht Sache der Planung
//            (Sonderzuschnitte, [P-18]). Default = waehlbar.
// `status_frei` = Statuskennung, die eine nicht bepreiste Rolle statt „ohne_position"
//            melden soll (Klartext in STATUS_TEXT).

/**
 * @type {ReadonlyArray<{id:string,label:string,kategorie:string,modul:1|2,gruppe:string,
 *   mass:{felder:string[],kontext:string}|null,bepreist:boolean,waehlbar?:boolean,
 *   status_frei?:string,hinweis?:string}>}
 */
export const ROLLEN = [
  // --- Modul 1 ---
  { id: "i3", label: "i3-Stein", kategorie: "stein", modul: 1, gruppe: "Steine", einheit: "Stk",
    mass: { felder: ["breite_mm"], kontext: "stein_i3_mm" }, bepreist: true },
  { id: "i2", label: "i2-Stein", kategorie: "stein", modul: 1, gruppe: "Steine", einheit: "Stk",
    mass: { felder: ["breite_mm"], kontext: "stein_i2_mm" }, bepreist: true },
  { id: "rod_std", label: "Gewindestange", kategorie: "gewindestange", modul: 1, einheit: "Stk",
    gruppe: "Vorspannung", mass: { felder: ["laenge_mm"], kontext: "rod_mm" }, bepreist: true,
    kombinierbar: true },
  { id: "rod_sonder", label: "Gewindestange – Sonderzuschnitt", kategorie: "gewindestange",
    modul: 1, gruppe: "Vorspannung", einheit: "Stk", mass: null, bepreist: false,
    waehlbar: false, status_frei: "beschaffung",
    hinweis: "Sonderlängen stehen als Bedarf der Baustelle in der Stückliste. AUS WELCHER "
      + "Lagerlänge sie geschnitten werden, ist Sache des Einkaufs — dazu wird hier kein Produkt "
      + "gewählt und keine Zuschnitt-/Verschnittplanung gerechnet ([P-18])." },
  { id: "rod_rest", label: "Gewindestange – Reststück oberer Abschluss", kategorie: "gewindestange",
    modul: 1, gruppe: "Vorspannung", einheit: "Stk", mass: { felder: ["laenge_mm"], kontext: "rod_rest_mm" },
    bepreist: true, einzeln: true,
    hinweis: "Die Wände werden im Innenraum montiert — unter der Decke ist kein Platz mehr, eine "
      + "lange Gewindestange einzufädeln. Jeder Strang, der an der Wandoberkante endet, schließt "
      + "deshalb mit genau diesem kurzen Reststück ab ([Z-6]). Es wird EIN Produkt gewählt; ohne "
      + "Auswahl wird der obere Abschluss sichtbar als offen gemeldet, es wird keine Länge geraten." },
  { id: "kupplung", label: "Kopplungsmutter", kategorie: "verbrauch", modul: 1,
    gruppe: "Vorspannung", einheit: "Stk", mass: null, bepreist: true,
    hinweis: "Kopplungsmuttern sind bauteilgleich: Stangenstoß und Fußanschluss verwenden DASSELBE "
      + "Produkt. Es gibt bewusst keine gesonderte Fuß-Kopplungsmutter mehr, und in der Stückliste "
      + "stehen beide Einbaustellen als eine Position mit einer Menge ([P-18])." },
  { id: "spannmutter", label: "Spannmutter", kategorie: "verbrauch", modul: 1,
    gruppe: "Vorspannung", einheit: "Stk", mass: null, bepreist: true },
  { id: "senkkopf", label: "Senkkopfschraube Fuß", kategorie: "verbrauch", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: null, bepreist: true },
  { id: "spannplatte", label: "Spannplatte", kategorie: "blech_platte", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: null, bepreist: true },
  { id: "blech_boden", label: "Bodenblech", kategorie: "blech_platte", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: { felder: ["breite_mm", "hoehe_mm", "laenge_mm"], kontext: "blech_mm" },
    bepreist: true, kombinierbar: true,
    hinweis: "Das Bodenblech besteht aus REALEN Blechen: mehrere Standardlängen (375…1250 mm im "
      + "125-mm-Raster) werden kombiniert ([A-10]). Mehrere gewählte Größen sind deshalb der "
      + "Regelfall und keine Mehrdeutigkeit — jede Länge steht als eigene Stücklistenposition "
      + "mit ihrem eigenen maßgebenden Maß." },
  { id: "blech_boden_sonder", label: "Bodenblech – Sonderzuschnitt", kategorie: "blech_platte",
    modul: 1, gruppe: "Anschluss", einheit: "Stk", mass: null, bepreist: false,
    waehlbar: false, status_frei: "beschaffung",
    hinweis: "Deckt keine Kombination der Standardlängen die Wandlänge, bleibt ein Reststück: es "
      + "steht mit seinem Fertigmaß als Bedarf der Baustelle in der Stückliste. AUS WELCHEM "
      + "Ausgangsblech es geschnitten wird, ist Sache des Einkaufs — dazu wird hier kein Produkt "
      + "gewählt und keine Zuschnitt-/Verschnittplanung gerechnet ([P-18])." },
  { id: "blech_kopf", label: "Kopfblech", kategorie: "blech_platte", modul: 1,
    gruppe: "Anschluss", einheit: "Stk", mass: { felder: ["breite_mm", "hoehe_mm", "laenge_mm"], kontext: "blech_mm" },
    bepreist: true },
  { id: "dicht_stk", label: "Dichtstreifen Einbauposition", kategorie: "verbrauch", modul: 1,
    gruppe: "Fugen", einheit: "Stk", mass: null, bepreist: true },
  { id: "dicht", label: "Dichtstreifen Gesamtlänge", kategorie: "verbrauch", modul: 1,
    gruppe: "Fugen", einheit: "m", mass: null, bepreist: false,
    hinweis: "Nachrichtliche Menge derselben Ware wie die Einbauposition ([A-6]) — bewusst nicht "
      + "bepreist, damit die Dichtstreifen nicht doppelt in der Summe stehen." },
  // --- Modul 2 ---
  { id: "latte", label: "Lattenstange", kategorie: "latte", modul: 2, gruppe: "Latten", einheit: "Stk",
    mass: { felder: ["laenge_mm"], kontext: "stange_mm" }, bepreist: true, kombinierbar: true },
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

/**
 * Beschriftung der VERWENDUNGSROLLE (Zeilenkopf der Auswahl, [P-17]) — benennt die
 * Verwendungsstelle am Bauwerk, nie ein Produkt. Unbekannte Rolle -> die rohe Kennung.
 * @param {string} id
 */
export function rollenLabel(id) {
  const r = rolle(id);
  return r ? r.label : String(id);
}

// --- Kompakte Rollenauswahl (Bedienschicht, DOM-frei · [P-17]) --------------
// Modul 1 und Modul 2 zeigen je Verwendungsrolle EINE Zeile mit einem Mehrfachauswahl-
// Dropdown. Damit Rollen- und Optionsbeschriftung nie derselbe generische Text sind,
// liefert `optionMerkmale` zu jedem Produkt die UNTERSCHEIDENDEN Merkmale (Maße, Gewinde,
// Preisbasis, Kennung). Die Zeichenketten sind hier zentral und damit testbar.

/**
 * Unterscheidende Merkmale eines Produkts als Klartext (nie leer — im Zweifel die ID).
 * @param {any} p
 */
export function optionMerkmale(p) {
  const t = [];
  const m = massText(p);
  if (m && m !== "–") t.push(m);
  const eh = p && (EINHEIT_LABEL[p.einheit] || p.einheit);
  if (eh) t.push(String(eh));
  const id = p && p.id != null ? String(p.id) : "";
  if (id) t.push(id);
  return t.join(" · ");
}

/**
 * Optionen EINER Rolle: ausschliesslich katalogseitig zur Rolle passende Produkte
 * (fremde Kategorien werden nicht angeboten), in Katalogreihenfolge.
 * @param {any} katalog @param {string} rolleId @param {string[]} [gewaehlt]
 * @returns {Array<{id:string,name:string,merkmale:string,gewaehlt:boolean,hinweis:string|null}>}
 */
export function rollenOptionen(katalog, rolleId, gewaehlt = []) {
  const r = rolle(rolleId);
  if (!r || !katalog || !Array.isArray(katalog.produkte)) return [];
  const gew = new Set((gewaehlt || []).map(String));
  return katalog.produkte
    .filter((p) => p.kategorie === r.kategorie)
    .map((p) => ({
      id: String(p.id),
      name: String(p.bezeichnung || "").trim() || String(p.id),
      merkmale: optionMerkmale(p),
      gewaehlt: gew.has(String(p.id)),
      hinweis: p.hinweis || null,
    }));
}

/**
 * Zusammenfassung des geschlossenen Steuerelements ([P-17]): keine Auswahl /
 * EIN Produkt (mit Namen) / n Produkte.
 * @param {Array<{name:string,gewaehlt:boolean}>} optionen
 */
export function auswahlZusammenfassung(optionen) {
  const gew = (optionen || []).filter((o) => o.gewaehlt);
  if (!gew.length) return "keine Auswahl";
  if (gew.length === 1) return "1 Produkt: " + gew[0].name;
  return gew.length + " Produkte";
}

/** Wird diese Rolle zur Auswahl angeboten? (Default ja, [P-18]). @param {any} r */
function _waehlbar(r) { return !!r && r.waehlbar !== false; }

/**
 * Alle WAEHLBAREN Rollen eines Moduls, in Anzeigereihenfolge. Nicht waehlbare Rollen
 * ([P-18]: Sonderzuschnitte) sind hier bewusst nicht enthalten — sie haben kein
 * Auswahl-Steuerelement, ihre Stuecklistenposition bleibt davon unberuehrt.
 * @param {1|2} modul
 */
export function rollenVonModul(modul) {
  return ROLLEN.filter((r) => r.modul === modul && _waehlbar(r));
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

// --- Standardauswahl aus dem Katalog ([P-18]) ------------------------------
// Der Katalog darf sagen, WELCHE Verwendungsstelle ein Produkt im Regelfall ausfuehrt:
// jedes Produkt kann ein optionales Feld `rollen: [rolleId, …]` tragen. Das ist keine
// Heuristik und keine Namensaehnlichkeit, sondern eine ausdrueckliche Angabe des
// Katalogpflegers — und sie ist beim Validieren an Kategorie und Waehlbarkeit gebunden.
//
// Daraus baut `produktrollenVorschlag` die Standardauswahl. Sie wird NUR fuer LEERE Rollen
// verwendet (storage.vorbelegeProduktrollen) und danach wie jede andere Auswahl gespeichert
// und angezeigt — es gibt also keinen unsichtbaren zweiten Auswahlpfad. Wer etwas anderes
// will, waehlt es in Modul 1/2 um; die Vorbelegung ueberschreibt das nie.

/**
 * Standardauswahl eines Katalogs: Rolle -> Produkt-IDs (Katalogreihenfolge, ohne Doppelte).
 * Beruecksichtigt nur waehlbare Rollen und nur kategoriegerechte Produkte.
 * @param {any} katalog @returns {Record<string,string[]>}
 */
export function produktrollenVorschlag(katalog) {
  /** @type {Record<string,string[]>} */
  const out = {};
  for (const p of ((katalog && katalog.produkte) || [])) {
    if (!Array.isArray(p.rollen)) continue;
    for (const rid of p.rollen) {
      const r = rolle(String(rid));
      if (!r || !_waehlbar(r) || r.kategorie !== p.kategorie) continue;
      const id = String(p.id);
      if (!out[r.id]) out[r.id] = [];
      if (!out[r.id].includes(id)) out[r.id].push(id);
    }
  }
  return out;
}

/** Rollen, die im Katalog gar keine Standardauswahl haben (Modul 0 meldet sie). @param {any} katalog */
export function rollenOhneVorschlag(katalog) {
  const v = produktrollenVorschlag(katalog);
  return ROLLEN.filter((r) => _waehlbar(r) && !(v[r.id] || []).length).map((r) => r.id);
}

// --- Produktspezifikation der Wand ([Z-1]) ---------------------------------
// Ein ausgewaehltes Katalogprodukt ist die ALLEINIGE Quelle seiner Produktspezifikation.
// Diese Schicht liest sie aus dem Katalog und ist damit die einzige Stelle, aus der Modul 1
// (Gewindestangen-Standardlaengen) und Modul 2 (Latten-Querschnitt/Standardlaengen) ihre
// Masse beziehen. Ohne Auswahl bleibt `quelle: "fallback"` und `laengen_mm` LEER — dann
// (und nur dann) darf der Aufrufer seinen kompatiblen Altwert verwenden ([Z-1]).
// Widersprueche werden GEMELDET, nie still aufgeloest ([P-6]/[P-9]).

/** Ein Maßfeld aller aufloesbaren Produkte einer Rolle (ohne Doppelte, absteigend). */
function _masse(produkte, feld) {
  const v = produkte.map((p) => +p[feld]).filter((x) => Number.isFinite(x) && x > 0);
  return [...new Set(v)].sort((a, b) => b - a);
}

/**
 * Standardlaengen einer Rolle aus der wandbezogenen Auswahl ([Z-1]).
 * @param {any} eingaben @param {any} katalog @param {string} rolleId
 * @returns {{laengen_mm:number[],produkte:any[],fehlend:string[],ids:string[],quelle:"katalog"|"fallback"}}
 */
export function standardLaengen(eingaben, katalog, rolleId) {
  const auf = produkteZuRolle(eingaben, katalog, rolleId);
  const laengen = _masse(auf.produkte, "laenge_mm");
  return { laengen_mm: laengen, produkte: auf.produkte, fehlend: auf.fehlend, ids: auf.ids,
           quelle: laengen.length ? "katalog" : "fallback" };
}

/**
 * Vollstaendige Produktspezifikation der aktiven Wand ([Z-1]) — die einzige Abbildung
 * Auswahl -> maßgebende Produktmaße. `konflikte` benennt widersprüchliche Angaben
 * (z. B. zwei Lattenprodukte mit unterschiedlicher Breite); es wird nichts geraten.
 * @param {any} eingaben @param {any} katalog
 */
export function produktSpezifikation(eingaben, katalog) {
  const rod = standardLaengen(eingaben, katalog, "rod_std");
  const rodRest = standardLaengen(eingaben, katalog, "rod_rest");
  const latte = standardLaengen(eingaben, katalog, "latte");
  const breiten = _masse(latte.produkte, "breite_mm");
  const dicken = _masse(latte.produkte, "dicke_mm");
  const konflikte = [];
  if (breiten.length > 1) {
    konflikte.push({ rolle: "latte", feld: "breite_mm", werte: breiten,
      text: "Die gewählten Lattenprodukte haben unterschiedliche Querschnittsbreiten ("
        + breiten.map((x) => x + " mm").join(", ") + "). Der Querschnitt bleibt offen, "
        + "bis genau eine Breite gewählt ist — es wird keine Breite geraten." });
  }
  if (dicken.length > 1) {
    konflikte.push({ rolle: "latte", feld: "dicke_mm", werte: dicken,
      text: "Die gewählten Lattenprodukte haben unterschiedliche Querschnittsdicken ("
        + dicken.map((x) => x + " mm").join(", ") + ")." });
  }
  // [Z-6]: Das Reststueck fuehrt GENAU EIN Produkt. Sind mehrere gewaehlt, bleibt `rest_mm`
  // bewusst null (Konflikt) — es wird keines bevorzugt und keine Laenge geraten.
  if (rodRest.laengen_mm.length > 1) {
    konflikte.push({ rolle: "rod_rest", feld: "laenge_mm", werte: rodRest.laengen_mm,
      text: "Für das Reststück am oberen Wandabschluss sind mehrere Produkte gewählt ("
        + rodRest.laengen_mm.map((x) => x + " mm").join(", ") + "). Es wird genau eines "
        + "eingebaut — die Länge bleibt offen, bis die Auswahl eindeutig ist." });
  }
  return {
    // [P-18]: Es gibt kein Ausgangsprodukt fuer Sonderzuschnitte mehr — woraus geschnitten
    // wird, entscheidet der Einkauf, nicht die Planung. Daher auch keine `sonder_*`-Angaben.
    rod: { ...rod,
           rest_mm: rodRest.laengen_mm.length === 1 ? rodRest.laengen_mm[0] : null,
           rest_ids: rodRest.ids },
    latte: { ...latte,
             breite_mm: breiten.length === 1 ? breiten[0] : null,
             dicke_mm: dicken.length === 1 ? dicken[0] : null },
    konflikte,
  };
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
export function preisKontext(w, eingaben = {}, katalog = null) {
  const ww = w || {};
  const ps = ww.prestress || {};
  const grid = +ww.grid_mm > 0 ? +ww.grid_mm : 125;
  const latten = (eingaben && eingaben.aufbau && eingaben.aufbau.latten) || {};
  // [Z-1]: Ist ein Produkt gewaehlt, ist der Katalog die Quelle des maßgebenden Maßes —
  // der Altwert aus den Eingaben wird dann NICHT mehr herangezogen. Positionen mit eigenem
  // `mass_mm` (mehrere Standardlaengen gleichzeitig) haengen ohnehin nicht an diesem Kontext.
  const spec = katalog ? produktSpezifikation(eingaben, katalog) : null;
  const rodKat = spec && spec.rod.laengen_mm.length ? spec.rod.laengen_mm[0] : null;
  const stangeKat = spec && spec.latte.laengen_mm.length ? spec.latte.laengen_mm[0] : null;
  return {
    rod_mm: rodKat != null ? rodKat
      : (+ww.rod_mm > 0 ? +ww.rod_mm : (+ps.rod_mm > 0 ? +ps.rod_mm : 1100)),
    // Reststueck ([Z-6]): maßgebend ist das eindeutig gewaehlte Produkt, ersatzweise der im
    // Wandelement mitgereiste Wert. Ohne beides bleibt der Kontext leer (kein erfundenes Maß).
    rod_rest_mm: (spec && spec.rod.rest_mm != null) ? spec.rod.rest_mm
      : (+ps.rod_rest_mm > 0 ? +ps.rod_rest_mm : NaN),
    blech_mm: +ps.blech_mm > 0 ? +ps.blech_mm : 1000,
    stange_mm: stangeKat != null ? stangeKat : (+latten.stange_cm > 0 ? +latten.stange_cm : 150) * 10,
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
  kombiniert: "mehrere Standardgrößen – werden kombiniert",
  nicht_erforderlich: "Menge 0 – kein Produkt erforderlich",
  nachrichtlich: "nachrichtliche Menge – nicht bepreist",
  ohne_position: "keine Mengenposition – nur vorgemerkt",
  beschaffung: "Bedarf der Baustelle – Zuschnitt/Beschaffung, nicht bepreist",
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
    return fertig(item.nachrichtlich ? "nachrichtlich" : ((r && r.status_frei) || "ohne_position"));
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

  // 5) Maß-Diskriminator, nur wenn die Rolle einen hat UND der Wandwert bekannt ist.
  //    `item.mass_mm` hat Vorrang vor dem Wandkontext: bei kombinierten Standardgrößen
  //    ([Z-2]) traegt JEDE Position ihr eigenes maßgebendes Maß, sodass sie wieder auf
  //    genau ein Produkt trifft. Ohne eigenes Maß gilt weiterhin der Wandkontext.
  let eng = passend;
  const kv = (item.mass_mm != null && +item.mass_mm > 0) ? +item.mass_mm
    : (r.mass ? +kontext[r.mass.kontext] : NaN);
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
    // Nicht waehlbare Rollen ([P-18]) haben gar keine Auswahl — dort ist „keine Auswahl" kein
    // Mangel, sondern der Regelfall; gemeldet wird ihr eigener Status_frei-Klartext.
    if (!_waehlbar(r)) {
      const s = r.status_frei || "ohne_position";
      return { rolle: rolleId, ids: [], status: s, text: STATUS_TEXT[s] || s, produkt: null,
               kandidaten: [], fehlend: [], vorgemerkt: [], hinweis: r.hinweis || null };
    }
    const auf = produkteZuRolle(eingaben, katalog, rolleId);
    const status = !ids.length ? "keine_auswahl"
      : (!katalog ? "kein_katalog" : (auf.fehlend.length ? "fehlt" : (rolleId === "dicht" ? "nachrichtlich" : "ohne_position")));
    return { rolle: rolleId, ids, status, text: STATUS_TEXT[status], produkt: null,
             kandidaten: auf.produkte, fehlend: auf.fehlend, vorgemerkt: [], hinweis: r.hinweis || null };
  }
  const res = loesePreis({ key: rolleId, unit: r.einheit || "Stk", menge: 1 }, { [rolleId]: ids }, katalog, kontext);
  // [Z-2]: Mehrere ausgewaehlte Standardgroessen sind bei Rollen mit Maß-Diskriminator der
  // REGELFALL — sie werden kombiniert und je Groesse getrennt bepreist (Position traegt ihr
  // eigenes `mass_mm`). Das ist KEINE Mehrdeutigkeit und auch kein „nur vorgemerkt". Echt
  // mehrdeutig bleibt nur, wenn zwei Produkte DASSELBE maßgebende Maß tragen; harte
  // Zuordnungsfehler behalten in jedem Fall Vorrang.
  // Nur `kombinierbar`-Rollen (Gewindestange, Latte) verbrauchen mehrere Standardgroessen
  // gleichzeitig. Bei Stein/Blech gibt es genau EIN maßgebendes Wandmaß — dort bleibt ein
  // abweichendes Produkt weiterhin „vorgemerkt" bzw. maßfremd.
  const HART = ["kein_katalog", "keine_auswahl", "fehlt", "kategorie_abweichend", "einheit_unpassend"];
  let status = res.status, produkt = res.produkt, kandidaten = res.kandidaten;
  let vorgemerkt = res.vorgemerkt, laengen = [];
  // `einzeln`-Rollen (Reststueck, [Z-6]) fuehren GENAU EIN Produkt: mehrere Auswahlen sind
  // echt mehrdeutig, weil nicht entscheidbar ist, welches den oberen Abschluss ausfuehrt.
  // Das steht VOR der Maß-Eingrenzung — sonst wuerde der Wandkontext (der seinerseits aus der
  // Auswahl stammt) die Mehrdeutigkeit stillschweigend aufloesen.
  if (r.einzeln && !HART.includes(status)) {
    const auf = produkteZuRolle(eingaben, katalog, rolleId);
    if (auf.produkte.length > 1) {
      return { rolle: rolleId, ids, status: "mehrdeutig", text: STATUS_TEXT.mehrdeutig,
               produkt: null, kandidaten: auf.produkte, fehlend: auf.fehlend, vorgemerkt: [],
               hinweis: r.hinweis || null,
               laengen_mm: _masse(auf.produkte, "laenge_mm") };
    }
    if (auf.produkte.length === 1) {
      // Eindeutig gewaehlt: das Maß dieses Produkts IST der maßgebende Wert der Rolle —
      // eine Maß-Eingrenzung gegen den Kontext waere hier zirkulaer.
      return { rolle: rolleId, ids, status: "ok", text: STATUS_TEXT.ok, produkt: auf.produkte[0],
               kandidaten: auf.produkte, fehlend: auf.fehlend, vorgemerkt: [],
               hinweis: r.hinweis || null, laengen_mm: _masse(auf.produkte, "laenge_mm") };
    }
  }
  if (r.mass && r.kombinierbar && !HART.includes(status)) {
    const auf = produkteZuRolle(eingaben, katalog, rolleId);
    // Je maßgebendem Maß eine Gruppe: zwei Produkte mit DEMSELBEN Maß bleiben echt
    // mehrdeutig (dann ist nicht entscheidbar, welches diese Groesse ausfuehrt); mehrere
    // VERSCHIEDENE Maße sind der Regelfall der Kombination ([Z-2]).
    const grp = new Map();
    for (const p of auf.produkte) {
      const v = r.mass.felder.map((f) => +p[f]).find((x) => Number.isFinite(x) && x > 0);
      const key = v != null ? String(v) : "?";
      if (!grp.has(key)) grp.set(key, []);
      grp.get(key).push(p);
    }
    laengen = [...grp.keys()].filter((k) => k !== "?").map(Number).sort((a, b) => b - a);
    const doppelt = [...grp.values()].filter((l) => l.length > 1);
    if (doppelt.length) {
      status = "mehrdeutig"; produkt = null; kandidaten = doppelt.flat(); vorgemerkt = [];
    } else if (grp.size > 1) { status = "kombiniert"; vorgemerkt = []; }
  }
  return { rolle: rolleId, ids, status, text: STATUS_TEXT[status] || res.text, produkt,
           kandidaten, fehlend: res.fehlend, vorgemerkt,
           hinweis: res.hinweis, laengen_mm: laengen };
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
