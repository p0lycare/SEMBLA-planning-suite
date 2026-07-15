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
 * OBJ-Konvention der Bauteil-Geometrie: X=Laenge, Y=Tiefe, Z=Hoehe (mm),
 * Nullpunkt unten-vorne-links → 1:1-Uebernahme, nur mm→m.
 *
 * ES-Modul: laeuft im Browser (GH Pages) und wird von den Node-Tests per import geladen.
 */

export const THICK = 125;          // Wandstaerke mm
export const GRID = 125, COURSE = 200;

// ---------- OBJ ----------

/** OBJ-Text → { V:[[x,y,z]…], faces:[[i,i,i…]…] } (Indizes 0-basiert). */
export function parseObj(text) {
  const V = [], faces = [];
  for (const ln of text.split("\n")) {
    if (ln[0] === "v" && ln[1] === " ") { const p = ln.split(/\s+/); V.push([+p[1], +p[2], +p[3]]); }
    else if (ln[0] === "f" && ln[1] === " ") {
      const idx = ln.trim().split(/\s+/).slice(1).map(t => parseInt(t.split("/")[0], 10) - 1);
      faces.push(idx);
    }
  }
  return { V, faces };
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
      const { V, faces } = parseObj(txt);
      const brep = facetedBrepEntities(f, F, V, faces);
      const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','Brep',(${brep})`);
      repMap[t] = f.e("IFCREPRESENTATIONMAP", `${axis3},${rep}`);
    }
  }

  // Wand am Ursprung
  const L = wall.length_mm, H = wall.height_mm;
  const wallPl = localPlace(storPl, 0, 0, 0);
  const wallShape = box(L, THICK, H);
  const ifcWall = f.e("IFCWALLSTANDARDCASE", `'${ifcGuid()}',${owner},'${esc(name)}',$,$,${wallPl},${wallShape},$,.NOTDEFINED.`);

  // Oeffnungen ausschneiden
  for (const o of (wall.openings || [])) {
    const ow = (o.g1 - o.g0) * GRID, oh = (o.l1 - o.l0) * COURSE;
    const opl = localPlace(wallPl, o.g0 * GRID, 0, o.l0 * COURSE);
    const oshape = box(ow, THICK, oh);
    const opName = o.art === "fenster" ? "Fenster" : o.art === "durchbruch" ? "Durchbruch" : "Tuer";
    const op = f.e("IFCOPENINGELEMENT", `'${ifcGuid()}',${owner},'${opName}',$,$,${opl},${oshape},$,.OPENING.`);
    f.e("IFCRELVOIDSELEMENT", `'${ifcGuid()}',${owner},$,$,${ifcWall},${op}`);
  }

  // Einzelsteine
  if (stones) {
    const parts = [];
    for (const c of wall.courses) for (const st of c.stones) {
      const spl = localPlace(wallPl, st.x0, 0, c.lage * COURSE);
      let sshape;
      if (repMap[st.type]) {                                   // echte Geometrie referenzieren
        const cto = f.e("IFCCARTESIANTRANSFORMATIONOPERATOR3D", `$,$,${org0},$,$`);  // Identitaet
        const mi = f.e("IFCMAPPEDITEM", `${repMap[st.type]},${cto}`);
        const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','MappedRepresentation',(${mi})`);
        sshape = f.e("IFCPRODUCTDEFINITIONSHAPE", `$,$,(${rep})`);
      } else {
        sshape = box(st.x1 - st.x0, THICK, COURSE);
      }
      const sp = f.e("IFCBUILDINGELEMENTPROXY", `'${ifcGuid()}',${owner},'${st.type}',$,$,${spl},${sshape},$,.NOTDEFINED.`);
      parts.push(sp);
    }
    if (parts.length) f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${ifcWall},(${parts.join(",")})`);
  }

  f.e("IFCRELCONTAINEDINSPATIALSTRUCTURE", `'${ifcGuid()}',${owner},$,$,(${ifcWall}),${storey}`);
  return f.build((name || "sembla_wand").toString().replace(/[^\w.-]+/g, "_"));
}
