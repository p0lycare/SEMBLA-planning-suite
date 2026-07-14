// @ts-check
/**
 * SEMBLA CAD-Bibliothek — DXF/IFC-Export und DXF-Grundriss-Import.
 * Reine Funktionen (kein DOM). Arbeitet auf Projekt- und Wandelement-Objekten.
 *
 * Projekt:  { name, walls:[ { id, name, x_mm, y_mm, rot_deg, wall:<Wandelement> } ] }
 * Wandelement: siehe wandelement.schema.json (length_mm, height_mm, courses, openings, tension_columns, bom)
 *
 * Einheiten: intern mm; IFC exportiert in Metern.
 */

export const THICK = 125;          // Wandstärke mm
export const GRID = 125, COURSE = 200;

// ---------- Geometrie-Helfer ----------
function rot(x, y, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
/** Eckpunkte der Wand-Grundfläche (Länge × Wandstärke) im Weltkoordinatensystem (mm). */
export function footprint(w) {
  const L = w.wall.length_mm, T = THICK;
  return [[0, 0], [L, 0], [L, T], [0, T]].map(([x, y]) => {
    const [rx, ry] = rot(x, y, w.rot_deg || 0);
    return [rx + (w.x_mm || 0), ry + (w.y_mm || 0)];
  });
}

// ---------- Stückliste ----------
export function aggregateBom(project) {
  // Neues Anschluss-/BOM-Modell: Bleche, Anker, Dichtstreifen. (Alt-Feld stahlplatten -> spannplatten gemappt.)
  const keys = ["i2", "i3", "gewindestangen", "verbindungsmuttern", "senkkopfschrauben", "kopplungsmuttern_basis",
    "spannplatten", "spannmuttern", "stahlblech_module", "stossfugen", "dichtstreifen_mm", "verschnitt_mm"];
  const sum = Object.fromEntries(keys.map(k => [k, 0]));
  for (const w of project.walls) {
    const b = (w.wall && w.wall.bom) || {};
    for (const k of keys) sum[k] += b[k] || 0;
    if (b.spannplatten == null && b.stahlplatten != null) sum.spannplatten += b.stahlplatten;   // Alt-Bundle
  }
  return sum;
}

// ================= DXF =================
class Dxf {
  constructor() { this.p = []; this.layers = new Set(); }
  add(code, val) { this.p.push(code + "\n" + val); }
  layer(name) { this.layers.add(name); return name; }
  line(layer, x1, y1, x2, y2) {
    this.layer(layer);
    this.add(0, "LINE"); this.add(8, layer);
    this.add(10, x1); this.add(20, y1); this.add(30, 0);
    this.add(11, x2); this.add(21, y2); this.add(31, 0);
  }
  poly(layer, pts, closed = true) {
    this.layer(layer);
    this.add(0, "LWPOLYLINE"); this.add(8, layer);
    this.add(90, pts.length); this.add(70, closed ? 1 : 0);
    for (const [x, y] of pts) { this.add(10, x); this.add(20, y); }
  }
  text(layer, x, y, h, str) {
    this.layer(layer);
    this.add(0, "TEXT"); this.add(8, layer);
    this.add(10, x); this.add(20, y); this.add(30, 0); this.add(40, h); this.add(1, str);
  }
  build() {
    const out = [];
    const push = (c, v) => out.push(c + "\n" + v);
    push(0, "SECTION"); push(2, "HEADER");
    push(9, "$INSUNITS"); push(70, 4);                 // 4 = Millimeter
    push(0, "ENDSEC");
    // TABLES mit Layer-Definitionen
    push(0, "SECTION"); push(2, "TABLES");
    push(0, "TABLE"); push(2, "LAYER"); push(70, this.layers.size);
    let col = 1;
    for (const name of this.layers) {
      push(0, "LAYER"); push(2, name); push(70, 0); push(62, col); push(6, "CONTINUOUS");
      col = (col % 7) + 1;
    }
    push(0, "ENDTAB"); push(0, "ENDSEC");
    // ENTITIES
    push(0, "SECTION"); push(2, "ENTITIES");
    out.push(this.p.join("\n"));
    push(0, "ENDSEC"); push(0, "EOF");
    return out.join("\n") + "\n";
  }
}

/** Grundriss-DXF: Wand-Grundflächen platziert, Öffnungen markiert, Beschriftung. */
export function projectToDxfGrundriss(project) {
  const d = new Dxf();
  for (const w of project.walls) {
    const fp = footprint(w);
    d.poly("WAND", fp);
    // Öffnungen als Marker (Linien quer zur Wand am Öffnungsbereich)
    for (const o of (w.wall.openings || [])) {
      const a = projWorld(w, o.g0 * GRID, 0), b = projWorld(w, o.g0 * GRID, THICK);
      const c = projWorld(w, o.g1 * GRID, 0), e = projWorld(w, o.g1 * GRID, THICK);
      d.line("OEFFNUNG", a[0], a[1], b[0], b[1]);
      d.line("OEFFNUNG", c[0], c[1], e[0], e[1]);
    }
    const mid = projWorld(w, w.wall.length_mm / 2, THICK + 120);
    d.text("BESCHRIFTUNG", mid[0], mid[1], 100, w.name || "Wand");
  }
  return d.build();
}
function projWorld(w, lx, ly) {
  const [rx, ry] = rot(lx, ly, w.rot_deg || 0);
  return [rx + (w.x_mm || 0), ry + (w.y_mm || 0)];
}

/** Ansichten-DXF: je Wand die Elevation (Steine, Öffnungen, Vorspannung) gekachelt. */
export function projectToDxfAnsichten(project) {
  const d = new Dxf();
  let oy = 0;
  for (const w of project.walls) {
    const wd = w.wall, L = wd.length_mm, H = wd.height_mm;
    d.text("BESCHRIFTUNG", 0, oy + H + 120, 100, (w.name || "Wand") + "  " + (L / 1000).toFixed(3) + "x" + (H / 1000).toFixed(2) + "m");
    for (const c of wd.courses) {
      const y0 = oy + c.lage * COURSE;
      for (const st of c.stones) {
        const lay = st.type === "i3" ? "STEINE_I3" : "STEINE_I2";
        d.poly(lay, [[st.x0, y0], [st.x1, y0], [st.x1, y0 + COURSE], [st.x0, y0 + COURSE]]);
      }
    }
    for (const o of (wd.openings || [])) {
      const x0 = o.g0 * GRID, x1 = o.g1 * GRID, y0 = oy + o.l0 * COURSE, y1 = oy + o.l1 * COURSE;
      d.poly("OEFFNUNG", [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    }
    for (const col of wd.tension_columns) d.line("VORSPANNUNG", col.x_mm, oy, col.x_mm, oy + H);
    d.poly("UMRISS", [[0, oy], [L, oy], [L, oy + H], [0, oy + H]]);
    oy += H + 600;   // Abstand zwischen Ansichten
  }
  return d.build();
}

/** DXF-Grundriss einlesen: LINE/LWPOLYLINE -> Segmente {x1,y1,x2,y2,len}. */
export function dxfToSegments(text) {
  const toks = text.replace(/\r/g, "").split("\n");
  const pairs = [];
  for (let i = 0; i + 1 < toks.length; i += 2) pairs.push([toks[i].trim(), toks[i + 1]]);
  const segs = [];
  let i = 0;
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === "0" && val.trim() === "LINE") {
      const e = {}; i++;
      while (i < pairs.length && pairs[i][0] !== "0") { e[pairs[i][0]] = +pairs[i][1]; i++; }
      if ("10" in e && "11" in e) segs.push(mkSeg(e["10"], e["20"], e["11"], e["21"]));
    } else if (code === "0" && val.trim() === "LWPOLYLINE") {
      i++; const xs = [], ys = [];
      while (i < pairs.length && pairs[i][0] !== "0") {
        if (pairs[i][0] === "10") xs.push(+pairs[i][1]);
        if (pairs[i][0] === "20") ys.push(+pairs[i][1]);
        i++;
      }
      for (let k = 0; k + 1 < xs.length; k++) segs.push(mkSeg(xs[k], ys[k], xs[k + 1], ys[k + 1]));
    } else i++;
  }
  return segs.filter(s => s.len > 1);
}
function mkSeg(x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return { x1, y1, x2, y2, len, rot_deg: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI };
}

import { parseObj, facetedBrepEntities } from "./obj-to-ifc.mjs";
// ================= IFC4 =================
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
const F = n => (n / 1000).toFixed(6);   // mm -> m

/** Projekt -> IFC4. opts.stones=true: zusätzlich jeden Stein als IfcBuildingElementProxy. */
export function projectToIfc(project, opts = {}) {
  const stones = opts.stones !== false;
  const f = new Ifc();
  // Kontext / Einheiten
  const dir0 = f.e("IFCDIRECTION", "(1.,0.,0.)");
  const org0 = f.e("IFCCARTESIANPOINT", "(0.,0.,0.)");
  const axis3 = f.e("IFCAXIS2PLACEMENT3D", `${org0},$,$`);
  const wcs = axis3;
  const ctx = f.e("IFCGEOMETRICREPRESENTATIONCONTEXT", `$,'Model',3,1.E-05,${wcs},$`);
  const lenU = f.e("IFCSIUNIT", "*,.LENGTHUNIT.,$,.METRE.");
  const areaU = f.e("IFCSIUNIT", "*,.AREAUNIT.,$,.SQUARE_METRE.");
  const volU = f.e("IFCSIUNIT", "*,.VOLUMEUNIT.,$,.CUBIC_METRE.");
  const units = f.e("IFCUNITASSIGNMENT", `(${lenU},${areaU},${volU})`);
  const owner = "$";   // OwnerHistory optional in IFC4
  const proj = f.e("IFCPROJECT", `'${ifcGuid()}',${owner},'${esc(project.name || "SEMBLA Projekt")}',$,$,$,$,(${ctx}),${units}`);
  // Struktur
  const sitePl = f.e("IFCLOCALPLACEMENT", `$,${axis3}`);
  const site = f.e("IFCSITE", `'${ifcGuid()}',${owner},'Gelände',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$`);
  const bldgPl = f.e("IFCLOCALPLACEMENT", `${sitePl},${axis3}`);
  const bldg = f.e("IFCBUILDING", `'${ifcGuid()}',${owner},'Gebäude',$,$,${bldgPl},$,$,.ELEMENT.,$,$,$`);
  const storPl = f.e("IFCLOCALPLACEMENT", `${bldgPl},${axis3}`);
  const storey = f.e("IFCBUILDINGSTOREY", `'${ifcGuid()}',${owner},'Ebene 0',$,$,${storPl},$,$,.ELEMENT.,0.`);
  f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${proj},(${site})`);
  f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${site},(${bldg})`);
  f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${bldg},(${storey})`);

  // Box-Geometrie (Rechteckprofil extrudiert) relativ zu einer Platzierung
  const box = (placement, Lmm, Tmm, Hmm, xoff = 0, zoff = 0) => {
    const p2 = f.e("IFCCARTESIANPOINT", `(${F(xoff + Lmm / 2)},${F(Tmm / 2)})`);
    const ax2 = f.e("IFCAXIS2PLACEMENT2D", `${p2},$`);
    const prof = f.e("IFCRECTANGLEPROFILEDEF", `.AREA.,$,${ax2},${F(Lmm)},${F(Tmm)}`);
    const zp = f.e("IFCCARTESIANPOINT", `(0.,0.,${F(zoff)})`);
    const zdir = f.e("IFCDIRECTION", "(0.,0.,1.)");
    const xdir = f.e("IFCDIRECTION", "(1.,0.,0.)");
    const solidPl = f.e("IFCAXIS2PLACEMENT3D", `${zp},${zdir},${xdir}`);
    const ed = f.e("IFCDIRECTION", "(0.,0.,1.)");
    const solid = f.e("IFCEXTRUDEDAREASOLID", `${prof},${solidPl},${ed},${F(Hmm)}`);
    const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','SweptSolid',(${solid})`);
    return f.e("IFCPRODUCTDEFINITIONSHAPE", `$,$,(${rep})`);
  };
  const placeWorld = (xmm, ymm, deg) => {
    const a = deg * Math.PI / 180;
    const loc = f.e("IFCCARTESIANPOINT", `(${F(xmm)},${F(ymm)},0.)`);
    const ref = f.e("IFCDIRECTION", `(${Math.cos(a).toFixed(6)},${Math.sin(a).toFixed(6)},0.)`);
    const zd = f.e("IFCDIRECTION", "(0.,0.,1.)");
    const ax = f.e("IFCAXIS2PLACEMENT3D", `${loc},${zd},${ref}`);
    return f.e("IFCLOCALPLACEMENT", `${storPl},${ax}`);
  };
  const localPlace = (parentPl, xmm, ymm, zmm) => {
    const loc = f.e("IFCCARTESIANPOINT", `(${F(xmm)},${F(ymm)},${F(zmm)})`);
    const ax = f.e("IFCAXIS2PLACEMENT3D", `${loc},$,$`);
    return f.e("IFCLOCALPLACEMENT", `${parentPl},${ax}`);
  };

  // Optionale echte BREP-Geometrie je Steintyp: einmal als RepresentationMap definiert, je Stein nur referenziert (IfcMappedItem)
  const realGeom = !!(opts.realGeom && opts.objText);
  const repMap = {};
  if (realGeom) {
    for (const t of ["i2", "i3"]) {
      const txt = opts.objText[t]; if (!txt) continue;
      const { V, faces } = parseObj(txt);
      const brep = facetedBrepEntities(f, F, V, faces);
      const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','Brep',(${brep})`);
      repMap[t] = f.e("IFCREPRESENTATIONMAP", `${axis3},${rep}`);
    }
  }

  const products = [];
  for (const w of project.walls) {
    const wd = w.wall, L = wd.length_mm, H = wd.height_mm;
    const pl = placeWorld(w.x_mm || 0, w.y_mm || 0, w.rot_deg || 0);
    const shape = box(pl, L, THICK, H);
    const wall = f.e("IFCWALLSTANDARDCASE", `'${ifcGuid()}',${owner},'${esc(w.name || "Wand")}',$,$,${pl},${shape},$,.NOTDEFINED.`);
    products.push(wall);
    // Öffnungen ausschneiden
    for (const o of (wd.openings || [])) {
      const ow = (o.g1 - o.g0) * GRID, oh = (o.l1 - o.l0) * COURSE;
      const opl = localPlace(pl, o.g0 * GRID, 0, o.l0 * COURSE);
      const oshape = box(opl, ow, THICK, oh);
      const opName = o.art === "fenster" ? "Fenster" : o.art === "durchbruch" ? "Durchbruch" : "Tür";
      const op = f.e("IFCOPENINGELEMENT", `'${ifcGuid()}',${owner},'${opName}',$,$,${opl},${oshape},$,.OPENING.`);
      f.e("IFCRELVOIDSELEMENT", `'${ifcGuid()}',${owner},$,$,${wall},${op}`);
    }
    // Einzelsteine
    if (stones) {
      const parts = [];
      for (const c of wd.courses) for (const st of c.stones) {
        const spl = localPlace(pl, st.x0, 0, c.lage * COURSE);
        let sshape;
        if (repMap[st.type]) {                               // echte Geometrie referenzieren
          const cto = f.e("IFCCARTESIANTRANSFORMATIONOPERATOR3D", `$,$,${org0},$,$`);  // Identität
          const mi = f.e("IFCMAPPEDITEM", `${repMap[st.type]},${cto}`);
          const rep = f.e("IFCSHAPEREPRESENTATION", `${ctx},'Body','MappedRepresentation',(${mi})`);
          sshape = f.e("IFCPRODUCTDEFINITIONSHAPE", `$,$,(${rep})`);
        } else {
          sshape = box(spl, st.x1 - st.x0, THICK, COURSE);
        }
        const sp = f.e("IFCBUILDINGELEMENTPROXY", `'${ifcGuid()}',${owner},'${st.type}',$,$,${spl},${sshape},$,.NOTDEFINED.`);
        parts.push(sp);
      }
      if (parts.length) f.e("IFCRELAGGREGATES", `'${ifcGuid()}',${owner},$,$,${wall},(${parts.join(",")})`);
    }
  }
  if (products.length) f.e("IFCRELCONTAINEDINSPATIALSTRUCTURE", `'${ifcGuid()}',${owner},$,$,(${products.join(",")}),${storey}`);
  return f.build(project.name || "sembla_projekt");
}
function esc(s) { return String(s).replace(/'/g, "''"); }
