// @ts-check
/**
 * SEMBLA IFC-Export — Wandelement → IFC4.
 *
 * Reine Funktionen (kein DOM). Exportiert genau EIN Wandelement (die Single Source
 * of Truth der Suite) als eigenstaendige IFC4-Datei: die Wand als IfcWallStandardCase
 * (Rechteckprofil extrudiert), Oeffnungen als IfcOpeningElement (RelVoids), optional
 * jeden Stein als IfcBuildingElementProxy — wahlweise mit echter OBJ-Geometrie (Brep,
 * per RepresentationMap referenziert).
 *
 * Herkunft: eingedampft aus legacy/Projekt-Manager/{sembla-cad.mjs, obj-to-ifc.mjs}
 * (dort Mehr-Wand-Projekt mit Weltplatzierung/Rotation) auf den MVP-Fall Einzelwand
 * am Ursprung. Eigene Datei wegen eigener Tests (shared/-Regel b), analog
 * sembla-engine.js / sembla-statik.js / sembla-bom.js.
 *
 * Einheiten: intern mm; IFC exportiert in Metern (Z-aufrecht).
 * KANONISCHE Lage der Bauteil-Geometrie: X=Laenge, Y=Tiefe, Z=Hoehe (mm), Nullpunkt
 * unten-vorne-links. Eine hochgeladene OBJ-Datei muss diese Lage NICHT mitbringen: die
 * Achsen-Zuordnung (`objStein`, s. u.) bildet Hochachse, Laengsachse, Einheit und Ursprung
 * der Datei darauf ab — per Automatik aus dem Abgleich der BBox mit dem Nennmass des
 * Steintyps, im Dialog von Modul 6 nachkorrigierbar. 3D-Vorschau (Modul 6) und der
 * OBJ-Pfad dieses Exports benutzen DIESELBE Funktion; eine zweite Achsenlogik gibt es nicht.
 *
 * ES-Modul: laeuft im Browser (GH Pages) und wird von den Node-Tests per import geladen.
 */

// #136: die kanonischen Lagenkanten (`unterkante_mm`/`oberkante_mm`/`hoehe_mm` je Lage) des
// FERTIGEN Wandelements und die EINE erlaubte Umrechnung Reihenzahl -> Hoehe. Eine z-Lage oder
// Steinhoehe entsteht hier NIE mehr aus `Lagenindex x COURSE` — sonst exportierte die obere
// Ausgleichslage als 200-mm-Ersatzgeometrie ([D-4]/[P-6]).
import { wandLagenKanten } from "./sembla-core.js";
import { lagenOberkanteMm } from "./sembla-montage.js";

export const THICK = 125;          // Wandstaerke mm
// GRID ist das Rastermaß der Oeffnungsbreite. COURSE ist die REGULAERE Lagenhoehe und wird
// hier ausdruecklich NICHT mehr zur Ableitung einer z-Koordinate benutzt (s. o.); es bleibt als
// bisher exportierte Konstante erhalten.
export const GRID = 125, COURSE = 200;

// ---------- OBJ ----------

/**
 * OBJ-Text → { V:[[x,y,z]…], faces:[[i,i,i…]…] } (Indizes 0-basiert).
 * Gelesen werden nur `v` und `f`; Zeilenenden (LF/CRLF), Einrueckung, Tabulatoren und
 * relative (negative) Flaechenindizes werden verstanden. Flaechen mit weniger als drei
 * gueltigen Ecken entfallen.
 */
export function parseObj(text) {
  const V = [], faces = [];
  for (const roh of String(text || "").split("\n")) {
    const ln = roh.trim();
    if (ln[0] === "v" && /\s/.test(ln[1] || "")) {
      const p = ln.split(/\s+/); V.push([+p[1], +p[2], +p[3]]);
    } else if (ln[0] === "f" && /\s/.test(ln[1] || "")) {
      const idx = [];
      for (const t of ln.split(/\s+/).slice(1)) {
        const n = parseInt(t.split("/")[0], 10);
        const i = n < 0 ? V.length + n : n - 1;          // negativ = relativ zum bisher Gelesenen
        if (Number.isInteger(i) && i >= 0) idx.push(i);
      }
      if (idx.length >= 3) faces.push(idx);
    }
  }
  return { V, faces: faces.filter((f) => f.every((i) => i < V.length && V[i].every(Number.isFinite))) };
}

// ---------- Achsen-Zuordnung der OBJ-Geometrie ----------
//
// Hochgeladene Steinmodelle kommen in verschiedenen Achslagen (Z-oben, Y-oben wie aus
// Rhino/Blender), Einheiten (mm/cm/m) und mit beliebigem Ursprung. Frueher setzte die
// Vorschau X=Laenge/Y=Tiefe/Z=Hoehe in mm mit Ursprung in der Steinecke fest voraus — eine
// Y-oben-Datei lag dann flach in der Wand (125 hoch, 200 tief) und versetzt. Hier wird jede
// Datei auf die kanonische Lage gebracht: Achsen zuordnen, Einheit umrechnen, Ursprung auf
// die Min-Ecke der BBox. Das ist reine DARSTELLUNG der Bauteilgeometrie — keine Fachregel,
// kein Einfluss auf Wandelement, Mengen oder Nachweis.

/** Nennmass je Steintyp in mm — dieselben Rastermasse, mit denen der Core die Wand baut. */
export const STEIN_NENNMASS = Object.freeze({
  i2: Object.freeze({ laenge: 2 * GRID, tiefe: THICK, hoehe: COURSE }),
  i3: Object.freeze({ laenge: 3 * GRID, tiefe: THICK, hoehe: COURSE }),
});

/** Zulaessige Einheiten einer OBJ-Datei und ihr Faktor nach mm. */
export const OBJ_EINHEITEN = Object.freeze({ mm: 1, cm: 10, m: 1000 });

/** Kanonische Zuordnung (Datei liegt bereits richtig): X=Laenge, Y=Tiefe, Z=Hoehe, mm. */
export const OBJ_ACHSEN_STANDARD = Object.freeze({ laenge: "+x", tiefe: "+y", hoehe: "+z", einheit: "mm" });

/** Bis zu dieser Abweichung je Mass (mm) gilt eine Datei als zum Nennmass passend. */
export const OBJ_TOLERANZ_MM = 5;

const ACHSE_RE = /^[+-][xyz]$/;
const _idx = (a) => "xyz".indexOf(a[1]);
const _vz = (a) => (a[0] === "-" ? -1 : 1);
const _vek = (a) => { const v = [0, 0, 0]; v[_idx(a)] = _vz(a); return v; };
const _kreuz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Prueft und normalisiert eine Achsen-Zuordnung `{laenge, tiefe, hoehe, einheit}` (je Achse
 * "+x"…"-z"). Die drei Rollen muessen drei VERSCHIEDENE Dateiachsen belegen. Fehlt `tiefe`,
 * wird sie rechtshaendig ergaenzt. Ungueltig ⇒ `null` (der Aufrufer nimmt dann die Automatik).
 * @returns {{laenge:string,tiefe:string,hoehe:string,einheit:string}|null}
 */
export function normObjAchsen(a) {
  if (!a || typeof a !== "object") return null;
  const laenge = String(a.laenge || "").toLowerCase(), hoehe = String(a.hoehe || "").toLowerCase();
  if (!ACHSE_RE.test(laenge) || !ACHSE_RE.test(hoehe) || _idx(laenge) === _idx(hoehe)) return null;
  let tiefe = a.tiefe == null || a.tiefe === "" ? objTiefenAchse(laenge, hoehe) : String(a.tiefe).toLowerCase();
  if (!ACHSE_RE.test(tiefe) || _idx(tiefe) === _idx(laenge) || _idx(tiefe) === _idx(hoehe)) return null;
  const einheit = a.einheit == null || a.einheit === "" ? "mm" : String(a.einheit).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(OBJ_EINHEITEN, einheit)) return null;
  return { laenge, tiefe, hoehe, einheit };
}

/**
 * Tiefenachse, die Laengs- und Hochachse zu einem RECHTSHAENDIGEN System ergaenzt
 * (Laenge × Tiefe = Hoehe) — die Datei wird damit nur gedreht, nie gespiegelt.
 * @param {string} laenge @param {string} hoehe @returns {string} z. B. "-z"
 */
export function objTiefenAchse(laenge, hoehe) {
  const t = _kreuz(_vek(hoehe), _vek(laenge));
  const i = t.findIndex((c) => c !== 0);
  return (t[i] < 0 ? "-" : "+") + "xyz"[i];
}

/** true, wenn die Zuordnung die Geometrie SPIEGELT (linkshaendig) statt sie nur zu drehen. */
export function objIstGespiegelt(achsen) {
  const a = normObjAchsen(achsen); if (!a) return false;
  const k = _kreuz(_vek(a.laenge), _vek(a.tiefe)), h = _vek(a.hoehe);
  return k[0] * h[0] + k[1] * h[1] + k[2] * h[2] < 0;
}

/** BBox der Rohkoordinaten: `{min:[x,y,z], max:[x,y,z], groesse:[x,y,z]}` oder `null` (leer). */
export function objBBox(V) {
  if (!Array.isArray(V) || !V.length) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of V) for (let i = 0; i < 3; i++) {
    if (v[i] < min[i]) min[i] = v[i];
    if (v[i] > max[i]) max[i] = v[i];
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return null;
  return { min, max, groesse: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Erkannte Masse in mm unter einer Zuordnung: `{laenge, tiefe, hoehe}` oder `null`. */
export function objMasse(V, achsen) {
  const a = normObjAchsen(achsen), bb = objBBox(V);
  if (!a || !bb) return null;
  const f = OBJ_EINHEITEN[a.einheit];
  return { laenge: bb.groesse[_idx(a.laenge)] * f, tiefe: bb.groesse[_idx(a.tiefe)] * f, hoehe: bb.groesse[_idx(a.hoehe)] * f };
}

/** Groesste Abweichung (mm) der erkannten Masse vom Nennmass des Steintyps; ohne Bezug `null`. */
export function objAbweichung(masse, typ) {
  const soll = STEIN_NENNMASS[typ];
  if (!masse || !soll) return null;
  return Math.max(Math.abs(masse.laenge - soll.laenge), Math.abs(masse.tiefe - soll.tiefe), Math.abs(masse.hoehe - soll.hoehe));
}

// Reihenfolge = Vorrang bei Gleichstand: zuerst die kanonische Lage, dann Y-oben (Rhino).
const _PERMUTATIONEN = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];   // [Laenge, Tiefe, Hoehe]

/**
 * AUTOMATIK: waehlt Achsen und Einheit so, dass die BBox der Datei am besten zum Nennmass
 * des Steintyps passt (Laenge/Tiefe/Hoehe). Deterministisch — bei Gleichstand gewinnt die
 * kanonische Lage in mm. Die Vorzeichen sind aus der BBox NICHT erkennbar: Laengs- und
 * Hochachse laufen positiv, die Tiefe wird rechtshaendig ergaenzt (reine Drehung, wie der
 * uebliche Y-oben→Z-oben-Wechsel); steht der Stein kopf oder mit der Rueckseite vorn, wird
 * das im Dialog korrigiert. Ohne Nennmass (unbekannter Typ) oder ohne Geometrie gilt die
 * kanonische Zuordnung.
 * @returns {{achsen:object, masse:object|null, abweichung_mm:number|null, passt:boolean}}
 */
export function objAchsenAuto(V, typ) {
  const soll = STEIN_NENNMASS[typ], bb = objBBox(V);
  let best = { ...OBJ_ACHSEN_STANDARD }, bestAbw = Infinity;
  if (soll && bb) {
    for (const einheit of Object.keys(OBJ_EINHEITEN)) for (const [l, t, h] of _PERMUTATIONEN) {
      const f = OBJ_EINHEITEN[einheit], g = bb.groesse;
      const abw = Math.max(Math.abs(g[l] * f - soll.laenge), Math.abs(g[t] * f - soll.tiefe), Math.abs(g[h] * f - soll.hoehe));
      if (abw < bestAbw) {
        const laenge = "+" + "xyz"[l], hoehe = "+" + "xyz"[h];
        bestAbw = abw; best = { laenge, tiefe: objTiefenAchse(laenge, hoehe), hoehe, einheit };
      }
    }
  }
  const masse = objMasse(V, best), abweichung_mm = objAbweichung(masse, typ);
  return { achsen: best, masse, abweichung_mm, passt: abweichung_mm != null && abweichung_mm <= OBJ_TOLERANZ_MM };
}

/**
 * Bringt geparste OBJ-Geometrie in die kanonische Lage: X=Laenge, Y=Tiefe, Z=Hoehe in mm,
 * Ursprung IMMER auf der Min-Ecke der BBox (Stein beginnt bei 0/0/0). Spiegelt die
 * Zuordnung, wird die Umlaufrichtung jeder Flaeche gedreht, damit Aussenflaechen aussen bleiben.
 * @param {{V:number[][], faces:number[][]}} obj @param {object} achsen gueltige Zuordnung
 * @returns {{V:number[][], faces:number[][]}}
 */
export function objNormiert(obj, achsen) {
  const a = normObjAchsen(achsen) || { ...OBJ_ACHSEN_STANDARD };
  const f = OBJ_EINHEITEN[a.einheit];
  const rolle = [a.laenge, a.tiefe, a.hoehe].map((r) => [_idx(r), _vz(r) * f]);
  const V = obj.V.map((v) => rolle.map(([i, s]) => v[i] * s));
  const bb = objBBox(V);
  if (bb) for (const v of V) for (let i = 0; i < 3; i++) v[i] -= bb.min[i];
  const faces = objIstGespiegelt(a) ? obj.faces.map((idx) => idx.slice().reverse()) : obj.faces.map((idx) => idx.slice());
  return { V, faces };
}

/**
 * DER eine Weg vom OBJ-Text zur einbaufertigen Steingeometrie — fuer die 3D-Vorschau
 * (Modul 6) UND den OBJ-Pfad des IFC-Exports. Mit gueltiger gespeicherter Zuordnung gilt
 * diese, sonst die Automatik.
 * @param {string} text OBJ-Quelltext @param {'i2'|'i3'} typ Steintyp (Nennmass)
 * @param {object|null} [achsen] gespeicherte Zuordnung; ungueltig/leer ⇒ Automatik
 * @returns {{V:number[][], faces:number[][], achsen:object, automatik:boolean, bbox:object|null,
 *   masse:object|null, soll:object|null, abweichung_mm:number|null, passt:boolean, leer:boolean}}
 *   `V`/`faces` in kanonischer Lage (mm); `bbox` in ROH-Koordinaten der Datei.
 */
export function objStein(text, typ, achsen) {
  const roh = parseObj(text);
  const gesetzt = normObjAchsen(achsen);
  const a = gesetzt || objAchsenAuto(roh.V, typ).achsen;
  const masse = objMasse(roh.V, a), abweichung_mm = objAbweichung(masse, typ);
  const n = objNormiert(roh, a);
  return {
    V: n.V, faces: n.faces, achsen: a, automatik: !gesetzt, bbox: objBBox(roh.V), masse,
    soll: STEIN_NENNMASS[typ] || null, abweichung_mm,
    passt: abweichung_mm != null && abweichung_mm <= OBJ_TOLERANZ_MM,
    leer: !roh.V.length || !n.faces.length,
  };
}

/**
 * Euler-/Watertight-Check: V − E + F = 2 (geschlossene Mannigfaltigkeit, Genus 0);
 * jede Kante muss von genau 2 Facetten geteilt werden.
 */
export function meshStats(V, faces) {
  const edge = new Map();
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = a < b ? a + "_" + b : b + "_" + a;
      edge.set(k, (edge.get(k) || 0) + 1);
    }
  }
  let boundary = 0, nonmanifold = 0;
  for (const c of edge.values()) { if (c === 1) boundary++; else if (c > 2) nonmanifold++; }
  const Vn = V.length, En = edge.size, Fn = faces.length;
  return { V: Vn, E: En, F: Fn, euler: Vn - En + Fn, boundaryEdges: boundary, nonManifoldEdges: nonmanifold, closed: boundary === 0 && nonmanifold === 0 };
}

/** Erzeugt die Brep-Entities in einer Ifc-Factory und liefert die FacetedBrep-Referenz. */
function facetedBrepEntities(f, F, V, faces) {
  const ptRef = V.map(v => f.e("IFCCARTESIANPOINT", `(${F(v[0])},${F(v[1])},${F(v[2])})`));
  const faceRefs = faces.map(idx => {
    const loop = f.e("IFCPOLYLOOP", `(${idx.map(i => ptRef[i]).join(",")})`);
    const bound = f.e("IFCFACEOUTERBOUND", `${loop},.T.`);
    return f.e("IFCFACE", `(${bound})`);
  });
  const shell = f.e("IFCCLOSEDSHELL", `(${faceRefs.join(",")})`);
  return f.e("IFCFACETEDBREP", `${shell}`);
}

// ---------- IFC4 ----------

function ifcGuid() {
  const c = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let s = ""; for (let i = 0; i < 22; i++) s += c[Math.floor(Math.random() * 64)];
  return s;
}

class Ifc {
  constructor() { this.n = 0; this.lines = []; }
  e(type, args) { this.n++; this.lines.push("#" + this.n + "=" + type + "(" + args + ");"); return "#" + this.n; }
  build(name) {
    const ts = new Date().toISOString().replace(/\.\d+Z$/, "");
    return [
      "ISO-10303-21;", "HEADER;",
      "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
      `FILE_NAME('${name}.ifc','${ts}',(''),(''),'SEMBLA','SEMBLA','');`,
      "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
      ...this.lines, "ENDSEC;", "END-ISO-10303-21;", "",
    ].join("\n");
  }
}

const F = n => (n / 1000).toFixed(6);   // mm → m
function esc(s) { return String(s).replace(/'/g, "''"); }

/**
 * Wandelement → IFC4-Datei (String).
 * @param {object} wall Wandelement (length_mm, height_mm, courses, openings, …)
 * @param {object} [opts]
 * @param {boolean} [opts.stones=true]  jeden Stein als IfcBuildingElementProxy ergaenzen
 * @param {boolean} [opts.realGeom=false] echte OBJ-Geometrie je Steintyp verwenden
 * @param {{i2?:string,i3?:string}} [opts.objText] OBJ-Quelltext je Steintyp (nur bei realGeom)
 * @param {{i2?:object,i3?:object}} [opts.objAchsen] gespeicherte Achsen-Zuordnung je Steintyp
 *   (wie in Modul 6 gewaehlt); fehlt sie, gilt dieselbe Automatik wie in der 3D-Vorschau
 * @returns {string} IFC4 (ISO-10303-21)
 */
export function wandelementToIfc(wall, opts = {}) {
  if (!wall || !wall.length_mm || !Array.isArray(wall.courses)) {
    throw new Error("Kein gueltiges Wandelement (length_mm/courses fehlen).");
  }
  const stones = opts.stones !== false;
  const name = wall.name || "SEMBLA Wand";
  const f = new Ifc();
  const owner = "$";   // OwnerHistory in IFC4 optional

  // Kontext / Einheiten
  const org0 = f.e("IFCCARTESIANPOINT", "(0.,0.,0.)");
  const axis3 = f.e("IFCAXIS2PLACEMENT3D", `${org0},$,$`);
  const ctx = f.e("IFCGEOMETRICREPRESENTATIONCONTEXT", `$,'Model',3,1.E-05,${axis3},$`);
  const lenU = f.e("IFCSIUNIT", "*,.LENGTHUNIT.,$,.METRE.");
  const areaU = f.e("IFCSIUNIT", "*,.AREAUNIT.,$,.SQUARE_METRE.");
  const volU = f.e("IFCSIUNIT", "*,.VOLUMEUNIT.,$,.CUBIC_METRE.");
  const units = f.e("IFCUNITASSIGNMENT", `(${lenU},${areaU},${volU})`);
  const proj = f.e("IFCPROJECT", `'${ifcGuid()}',${owner},'${esc(name)}',$,$,$,$,(${ctx}),${units}`);

  // Raumstruktur
  const sitePl = f.e("IFCLOCALPLACEMENT", `$,${axis3}`);
  const site = f.e("IFCSITE", `'${ifcGuid()}',${owner},'Gelaende',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$`);
  const bldgPl = f.e("IFCLOCALPLACEMENT", `${sitePl},${axis3}`);
  const bldg = f.e("IFCBUILDING", `'${ifcGuid()}',${owner},'Gebaeude',$,$,${bldgPl},$,$,.ELEMENT.,$,$,$`);
  const storPl = f.e("IFCLOCALPLACEMENT", `${bldgPl},${axis3}`);
  const storey = f.e("IFCBUILDINGSTOREY", `'${ifcGuid()}',${owner},'Ebene 0',$,$,${storPl},$,$,.ELEMENT.,0.`);
  f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${proj},(${site})`);
  f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${site},(${bldg})`);
  f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${bldg},(${storey})`);

  // Box-Geometrie (Rechteckprofil extrudiert) relativ zu einer Platzierung
  const box = (Lmm, Tmm, Hmm) => {
    const p2 = f.e("IFCCARTESIANPOINT", `(${F(Lmm / 2)},${F(Tmm / 2)})`);
    const ax2 = f.e("IFCAXIS2PLACEMENT2D", `${p2},$`);
    const prof = f.e("IFCRECTANGLEPROFILEDEF", `.AREA.,$,${ax2},${F(Lmm)},${F(Tmm)}`);
    const zp = f.e("IFCCARTESIANPOINT", "(0.,0.,0.)");
    const zdir = f.e("IFCDIRECTION", "(0.,0.,1.)");
    const xdir = f.e("IFCDIRECTION", "(1.,0.,0.)");
    const solidPl = f.e("IFCAXIS2PLACEMENT3D", `${zp},${zdir},${xdir}`);
    const ed = f.e("IFCDIRECTION", "(0.,0.,1.)");
    const solid = f.e("IFCEXTRUDEDAREASOLID", `${prof},${solidPl},${ed},${F(Hmm)}`);
    const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','SweptSolid',(${solid})`);
    return f.e("IFCPRODUCTDEFINITIONSHAPE", `$,$,(${rep})`);
  };
  const localPlace = (parentPl, xmm, ymm, zmm) => {
    const loc = f.e("IFCCARTESIANPOINT", `(${F(xmm)},${F(ymm)},${F(zmm)})`);
    const ax = f.e("IFCAXIS2PLACEMENT3D", `${loc},$,$`);
    return f.e("IFCLOCALPLACEMENT", `${parentPl},${ax}`);
  };

  // Optionale echte BREP-Geometrie je Steintyp: einmal als RepresentationMap, je Stein referenziert (IfcMappedItem)
  const realGeom = !!(opts.realGeom && opts.objText);
  const repMap = {};
  if (realGeom) {
    for (const t of ["i2", "i3"]) {
      const txt = opts.objText && opts.objText[t]; if (!txt) continue;
      // Dieselbe Aufbereitung wie die 3D-Vorschau (Achsen, Einheit, Ursprung auf die Min-Ecke):
      // Vorschau und IFC zeigen damit zwangslaeufig denselben Stein an derselben Stelle.
      const { V, faces, leer } = objStein(txt, t, opts.objAchsen && opts.objAchsen[t]);
      if (leer) continue;                                     // keine Geometrie ⇒ Quader
      const brep = facetedBrepEntities(f, F, V, faces);
      const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','Brep',(${brep})`);
      repMap[t] = f.e("IFCREPRESENTATIONMAP", `${axis3},${rep}`);
    }
  }

  // #136 Kanonische Lagenkanten: EINE Quelle fuer jede z-Koordinate und jede Steinhoehe dieser
  // Datei. Gelesen, nie gerechnet.
  const KANTEN = wandLagenKanten(wall);
  const KA = new Map(KANTEN.map((k) => [k.lage, k]));
  const OK = (n) => lagenOberkanteMm(wall, n, KANTEN);   // Oberkante der n-ten Reihe von unten

  // Wand am Ursprung
  const L = wall.length_mm, H = wall.height_mm;
  const wallPl = localPlace(storPl, 0, 0, 0);
  const wallShape = box(L, THICK, H);
  const ifcWall = f.e("IFCWALLSTANDARDCASE", `'${ifcGuid()}',${owner},'${esc(name)}',$,$,${wallPl},${wallShape},$,.NOTDEFINED.`);

  // Oeffnungen ausschneiden
  for (const o of (wall.openings || [])) {
    // Hoehe/Unterkante einer Oeffnung kommen aus den Lagenkanten (fuer eine reine 200-mm-Wand
    // wertgleich zu `l x COURSE`, mit Ausgleichslage aber real statt erfunden).
    const oz0 = OK(o.l0);
    const ow = (o.g1 - o.g0) * GRID, oh = OK(o.l1) - oz0;
    const opl = localPlace(wallPl, o.g0 * GRID, 0, oz0);
    const oshape = box(ow, THICK, oh);
    const opName = o.art === "fenster" ? "Fenster" : o.art === "durchbruch" ? "Durchbruch" : "Tuer";
    const op = f.e("IFCOPENINGELEMENT", `'${ifcGuid()}',${owner},'${opName}',$,$,${opl},${oshape},$,.OPENING.`);
    f.e("IFCRELVOIDSELEMENT", `'${ifcGuid()}',${owner},$,$,${ifcWall},${op}`);
  }

  // Einzelsteine
  if (stones) {
    const parts = [];
    for (const c of wall.courses) for (const st of c.stones) {
      const ka = KA.get(c.lage) || { unterkante_mm: 0, oberkante_mm: 0, hoehe_mm: 0 };
      const spl = localPlace(wallPl, st.x0, 0, ka.unterkante_mm);
      let sshape;
      // Die Ausgleichslage bekommt IMMER den Quader mit ihrer REALEN Hoehe: die hinterlegte
      // OBJ-Geometrie ist ein voller Regelstein (200 mm) und waere hier schlicht das falsche
      // Bauteil. Geraten wird nichts — die Hoehe steht in der Lagenkante.
      if (repMap[st.type] && c.ausgleich !== true) {            // echte Geometrie referenzieren
        const cto = f.e("IFCCARTESIANTRANSFORMATIONOPERATOR3D", `$,$,${org0},$,$`);  // Identitaet
        const mi = f.e("IFCMAPPEDITEM", `${repMap[st.type]},${cto}`);
        const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','MappedRepresentation',(${mi})`);
        sshape = f.e("IFCPRODUCTDEFINITIONSHAPE", `$,$,(${rep})`);
      } else {
        sshape = box(st.x1 - st.x0, THICK, ka.hoehe_mm);
      }
      const sp = f.e("IFCBUILDINGELEMENTPROXY", `'${ifcGuid()}',${owner},'${st.type}',$,$,${spl},${sshape},$,.NOTDEFINED.`);
      parts.push(sp);
    }
    if (parts.length) f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${ifcWall},(${parts.join(",")})`);
  }

  f.e("IFCRELCONTAINEDINSPATIALSTRUCTURE", `'${ifcGuid()}',${owner},$,$,(${ifcWall}),${storey}`);
  return f.build((name || "sembla_wand").toString().replace(/[^\w.-]+/g, "_"));
}
