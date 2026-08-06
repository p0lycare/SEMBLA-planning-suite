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
 * Lage ist immer GANZZAHLIG im 125-mm-Raster ([L-1]) und ausschliesslich
 * orthogonal ([L-2]):
 *
 *   lage = { start_grid: {x, y}, richtung: "x"|"y", laenge_grid: n }
 *   lage = null                      // unverortet — der Normalfall vor dem Zeichnen
 *
 * Dieses Modul ist REIN und DOM-frei (keine Datei-, keine localStorage-, keine
 * DOM-Zugriffe). Alle Struktur-Operationen liefern eine NEUE Mappe zurueck und
 * veraendern die uebergebene nicht. Persistenz und aktive Zeiger liegen in
 * `storage.js`, die Oberflaeche in Modul 0.
 *
 * Eigene Datei nach shared-Regel (b): eigene Tests (tests/module/test-projektmappe.mjs).
 */

/** Version des OEFFENTLICHEN Projektmappen-Dateiformats (eigene Achse, getrennt
 *  von PROJEKT_VERSION, KATALOG_VERSION und SCHEMA_VERSION). */
export const MAPPE_VERSION = 1;

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
 * @param {{gebaeude?:string, geschoss?:string, hoehe_mm?:number}} [opt]
 */
export function leereMappe(name, opt) {
  const o = opt || {};
  const geschoss = neuesGeschossObjekt(o.geschoss || "Geschoss 1", o.hoehe_mm);
  return {
    format: MAPPE_FORMAT,
    version: MAPPE_VERSION,
    projekt: { id: neueId("prj"), name: (name || "Neues Projekt").toString(), kopfdaten: {} },
    katalog: null,
    gebaeude: [{ id: neueId("geb"), name: (o.gebaeude || "Gebäude 1").toString(), geschosse: [geschoss] }],
  };
}

/** Ein neues Geschoss-Objekt (ohne Plan, ohne Waende). @param {string} name @param {number} [hoehe_mm] */
export function neuesGeschossObjekt(name, hoehe_mm) {
  return {
    id: neueId("gs"),
    name: (name || "Geschoss").toString(),
    hoehe_mm: (hoehe_mm == null || !Number.isFinite(+hoehe_mm)) ? null : +hoehe_mm,
    plan: null,
    waende: [],
  };
}

// --- Normalisierung -------------------------------------------------------

function _zahlOderNull(v) {
  return (v == null || v === "" || !Number.isFinite(+v)) ? null : +v;
}

/**
 * Eine Lage normalisieren. Nicht ganzzahlige oder nicht orthogonale Angaben
 * werden NICHT gerundet oder zurechtgebogen ([L-1]/[L-2]) — sie bleiben so
 * stehen, wie sie kamen, und fallen in `validiereMappe` als Fehler auf.
 * Fehlt die Lage ganz, bleibt sie `null` (unverortet, [L-4]).
 */
export function normLage(lage) {
  if (lage == null || typeof lage !== "object") return null;
  const sg = lage.start_grid || {};
  return {
    start_grid: { x: _zahlOderNull(sg.x), y: _zahlOderNull(sg.y) },
    richtung: lage.richtung,
    laenge_grid: _zahlOderNull(lage.laenge_grid),
  };
}

/** Einen Wandeintrag normalisieren (Struktur/Lage — nie Geometrie). */
export function normWand(w) {
  const o = (w && typeof w === "object") ? w : {};
  return {
    id: o.id == null ? "" : String(o.id),
    name: (o.name == null ? "" : String(o.name)),
    datei: (o.datei == null || o.datei === "") ? null : String(o.datei),
    lage: normLage(o.lage),
  };
}

/** Ein Geschoss normalisieren. */
export function normGeschoss(g) {
  const o = (g && typeof g === "object") ? g : {};
  return {
    id: o.id == null ? "" : String(o.id),
    name: (o.name == null ? "" : String(o.name)),
    hoehe_mm: _zahlOderNull(o.hoehe_mm),
    plan: (o.plan && typeof o.plan === "object") ? {
      datei: o.plan.datei == null ? null : String(o.plan.datei),
      mm_je_pixel: _zahlOderNull(o.plan.mm_je_pixel),
      versatz_x_mm: _zahlOderNull(o.plan.versatz_x_mm) || 0,
      versatz_y_mm: _zahlOderNull(o.plan.versatz_y_mm) || 0,
    } : null,
    waende: Array.isArray(o.waende) ? o.waende.map(normWand) : [],
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
      return {
        id: gg.id == null || gg.id === "" ? neueId("geb") : String(gg.id),
        name: (gg.name == null ? "" : String(gg.name)),
        geschosse: (Array.isArray(gg.geschosse) ? gg.geschosse : []).map(normGeschoss),
      };
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
    for (const gs of g.geschosse) {
      merke(gs && gs.id, "Geschoss");
      if (gs?.hoehe_mm != null && !(gs.hoehe_mm > 0)) {
        f.push(`Geschoss „${gs.name || gs.id}“: Geschosshöhe muss positiv sein.`);
      }
      if (!Array.isArray(gs?.waende)) { f.push(`Geschoss „${gs?.name || gs?.id}“ ohne Wandliste.`); continue; }
      for (const w of gs.waende) {
        merke(w && w.id, "Wand");
        f.push(...lageFehler(w?.lage, w?.name || w?.id));
      }
    }
  }
  return f;
}

/**
 * Fehler EINER Lage ([L-1]/[L-2]). `null` (unverortet) ist ausdruecklich gueltig.
 * @param {any} lage @param {string} [bezeichnung] @returns {string[]}
 */
export function lageFehler(lage, bezeichnung) {
  const wo = bezeichnung ? `Wand „${bezeichnung}“: ` : "";
  if (lage == null) return [];
  /** @type {string[]} */
  const f = [];
  const sg = lage.start_grid;
  if (!sg || !_istGanzzahl(sg.x) || !_istGanzzahl(sg.y)) {
    f.push(`${wo}Startpunkt muss ganzzahlig im 125-mm-Raster liegen ([L-1]).`);
  }
  if (!RICHTUNGEN.includes(lage.richtung)) {
    f.push(`${wo}Richtung muss „x“ oder „y“ sein — schräge Lagen sind unzulässig ([L-2]).`);
  }
  if (!_istGanzzahl(lage.laenge_grid) || lage.laenge_grid < 1) {
    f.push(`${wo}Länge muss eine ganze Zahl ≥ 1 Rastereinheiten sein ([L-1]).`);
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
  const m = normMappe(obj);
  // Nach der Normalisierung gegen das ROHE Objekt pruefen, damit ein fehlendes
  // Format nicht durch die Normalisierung „repariert“ wirkt.
  if (!obj || obj.format !== MAPPE_FORMAT) {
    throw new Error(`Keine Projektmappe erkannt (format „${MAPPE_FORMAT}“ fehlt).`);
  }
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
 * Geschoss in einem Gebaeude anlegen.
 * @param {any} m @param {string} gebaeudeId @param {string} name @param {number} [hoehe_mm]
 * @returns {{mappe:object, id:string}}
 */
export function fuegeGeschossHinzu(m, gebaeudeId, name, hoehe_mm) {
  const n = _klon(m);
  const g = n.gebaeude.find((x) => x.id === String(gebaeudeId));
  if (!g) throw new Error(`Unbekanntes Gebäude „${gebaeudeId}“.`);
  const gs = neuesGeschossObjekt(name, hoehe_mm);
  g.geschosse.push(gs);
  return { mappe: n, id: gs.id };
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

  let vorher = null;
  for (const gs of n.gebaeude.flatMap((g) => g.geschosse)) {
    const i = gs.waende.findIndex((w) => w.id === id);
    if (i >= 0) { vorher = gs.waende[i]; gs.waende.splice(i, 1); }
  }
  ziel.waende.push(normWand({
    id,
    name: wand.name !== undefined ? wand.name : (vorher?.name || ""),
    datei: wand.datei !== undefined ? wand.datei : (vorher?.datei ?? null),
    lage: wand.lage !== undefined ? wand.lage : (vorher?.lage ?? null),
  }));
  return n;
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
  if (h != null && !(h > 0)) throw new Error("Geschosshöhe muss positiv sein (oder leer bleiben).");
  const n = _klon(m);
  const gs = n.gebaeude.flatMap((g) => g.geschosse).find((x) => x.id === String(geschossId));
  if (!gs) throw new Error(`Unbekanntes Geschoss „${geschossId}“.`);
  gs.hoehe_mm = h;
  return n;
}

/** Umbenennen (Projekt/Gebaeude/Geschoss/Wand) anhand der Kennung. */
export function benenneUm(m, id, name) {
  const n = _klon(m);
  const neu = (name || "").toString();
  if (n.projekt.id === String(id)) { n.projekt.name = neu; return n; }
  for (const g of n.gebaeude) {
    if (g.id === String(id)) { g.name = neu; return n; }
    for (const gs of g.geschosse) {
      if (gs.id === String(id)) { gs.name = neu; return n; }
      for (const w of gs.waende) if (w.id === String(id)) { w.name = neu; return n; }
    }
  }
  throw new Error(`Unbekannte Kennung „${id}“.`);
}

// --- Ableitungen ----------------------------------------------------------

/** Wandlaenge in mm aus der Lage ([L-3]): laenge_grid × 125. `null` = unverortet. */
export function laengeAusLage(lage) {
  const l = normLage(lage);
  return (l && Number.isInteger(l.laenge_grid)) ? l.laenge_grid * GRID_MM : null;
}

/** Endrasterpunkt einer Lage (nur zur Darstellung; keine Ecken-/Anschlusslogik, [L-2]). */
export function endpunktGrid(lage) {
  const l = normLage(lage);
  if (!l || !Number.isInteger(l.laenge_grid) || !RICHTUNGEN.includes(l.richtung)) return null;
  const { x, y } = l.start_grid;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return l.richtung === "x" ? { x: x + l.laenge_grid, y } : { x, y: y + l.laenge_grid };
}

/**
 * Hoehenvorgabe eines Geschosses fuer eine NEUE Wand ([L-5]). Es wird nichts
 * gerundet: passt die Geschosshoehe nicht ins Lagenraster, wird das benannt.
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
      : `Geschosshöhe ${h} mm ist kein Vielfaches der Lagenhöhe ${COURSE_MM} mm ([G-2]) — `
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
