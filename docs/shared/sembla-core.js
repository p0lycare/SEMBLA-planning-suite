// @ts-check
/**
 * SEMBLA Core - Vanilla-JS-Portierung der Referenz-Implementierung (sembla_core.py).
 * Erzeugt aus Laenge/Hoehe/Oeffnungen ein Wandelement (Single Source of Truth).
 * Bit-genau identisch zum Python-Core (gepruefte Paritaet gegen die goldenen Fixtures).
 *
 * Einheiten: mm. 'grid' = Rastereinheit (125mm), 'lage' = Lagenindex (200mm).
 */

export const GRID = 125;
export const COURSE = 200;
export const THICK = 125;
export const ROD = 1100;
export const BLECH = 1000;              // Standard-Modullänge der Stahlbleche (Boden/Kopf)
export const BLECH_THICK = 15;          // Stahlblech-Dicke (mm)
export const CHAMBER_OFFSET = 62.5;     // Kammerzentrum -> Lattice x = 62.5 + 125k
export const MAX_SPAN_GRID = 3;         // Vorspannung max. alle 3 Raster (375mm)
export const FORBIDDEN_N = new Set([1, 4]);

export class SemblaError extends Error {}
export class InvalidDimensionError extends SemblaError {}
export class InvalidOpeningError extends SemblaError {}

/**
 * @typedef {{g0:number,g1:number,l0:number,l1:number,art:string}} OpeningLike
 */

/** Validiertes Oeffnungs-Objekt. */
export class Opening {
  /** @param {number} g0 @param {number} g1 @param {number} l0 @param {number} l1 @param {string} [art] */
  constructor(g0, g1, l0, l1, art = "tuer") {
    if (g1 <= g0) throw new InvalidOpeningError(`g1<=g0 (${g0},${g1})`);
    if (l1 <= l0) throw new InvalidOpeningError(`l1<=l0 (${l0},${l1})`);
    if (g0 < 0 || l0 < 0) throw new InvalidOpeningError("negative Koordinate");
    if (art !== "tuer" && art !== "fenster" && art !== "durchbruch") throw new InvalidOpeningError("unbekannte art " + art);
    this.g0 = g0; this.g1 = g1; this.l0 = l0; this.l1 = l1; this.art = art;
  }
  asDict() { return { g0: this.g0, g1: this.g1, l0: this.l0, l1: this.l1, art: this.art }; }
}

/** Python-kompatibles Runden (round-half-to-even) — wichtig fuer Paritaet. */
function pyRound(x) {
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return (f % 2 === 0) ? f : f + 1;
}

/** @returns {Set<number>} absolute Rasterpositionen der inneren Fugen (ohne Segmentenden). */
function segJoints(startGrid, tiling) {
  const js = new Set(); let c = startGrid;
  for (let i = 0; i < tiling.length - 1; i++) { c += tiling[i]; js.add(c); }
  return js;
}

/** i3-maximale Lagen-Varianten fuer Breite n (Raster). i2 immer nur an den Enden. */
function candidates(n) {
  if (n < 2) return [[]];
  const r = n % 3;
  if (r === 2) { const f = Array((n - 2) / 3).fill(3); return [[2, ...f], [...f, 2]]; }
  if (r === 1) { const f = Array((n - 4) / 3).fill(3); return [[2, 2, ...f], [...f, 2, 2]]; }
  const m = n / 3;
  if (m === 1) return [[3]];
  const f = Array(m - 2).fill(3);
  return [Array(m).fill(3), [2, 2, ...f, 2], [2, ...f, 2, 2]];
}

/** Vergleich (notConflict, i3count, dist): >0 wenn a strikt groesser. */
function keyCmp(a, b) {
  if (a[0] !== b[0]) return (a[0] ? 1 : 0) - (b[0] ? 1 : 0);
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/** Waehlt unter den i3-maximalen Varianten die, die der Lage darunter ausweicht. */
function pickTiling(startGrid, n, prev) {
  let best = null;
  for (const comp of candidates(n)) {
    const js = segJoints(startGrid, comp);
    const conflict = [...js].some(j => prev.has(j));
    const i3 = comp.filter(b => b === 3).length;
    let dist = 99;
    if (js.size && prev.size) dist = Math.min(...[...js].flatMap(j => [...prev].map(f => Math.abs(j - f))));
    const key = [!conflict, i3, dist];
    if (best === null || keyCmp(key, best.key) > 0) best = { key, comp };
  }
  return best.comp;
}

function balancedFill(a, b, maxstep) {
  if (b <= a) return [a];
  const k = Math.ceil((b - a) / maxstep);
  const out = [];
  for (let i = 0; i <= k; i++) out.push(pyRound(a + (b - a) * i / k));
  return out;
}

function validateInputs(lengthMm, heightMm, openings) {
  if (!Number.isInteger(lengthMm) || lengthMm % GRID !== 0)
    throw new InvalidDimensionError(`Wandlaenge ${lengthMm} ist kein Vielfaches von ${GRID} mm`);
  if (lengthMm < 2 * GRID)
    throw new InvalidDimensionError(`Wandlaenge ${lengthMm} < Mindestmass ${2 * GRID} mm`);
  if (!Number.isInteger(heightMm) || heightMm % COURSE !== 0)
    throw new InvalidDimensionError(`Wandhoehe ${heightMm} ist kein Vielfaches von ${COURSE} mm`);
  if (heightMm < COURSE)
    throw new InvalidDimensionError(`Wandhoehe ${heightMm} < ${COURSE} mm`);
  const N = lengthMm / GRID, L = heightMm / COURSE;
  for (const op of openings) {
    if (op.g1 > N) throw new InvalidOpeningError(`Oeffnung ueber Wandlaenge (g1=${op.g1} > N=${N})`);
    if (op.l1 > L) throw new InvalidOpeningError(`Oeffnung ueber Wandhoehe (l1=${op.l1} > L=${L})`);
  }
  for (let i = 0; i < openings.length; i++)
    for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i], b = openings[j];
      if (a.g0 < b.g1 && b.g0 < a.g1 && a.l0 < b.l1 && b.l0 < a.l1)
        throw new InvalidOpeningError(`Oeffnungen ueberlappen: #${i} und #${j}`);
    }
}

/**
 * Baut ein Wandelement.
 * @param {string} name
 * @param {number} lengthMm Vielfaches von 125, >=250
 * @param {number} heightMm Vielfaches von 200, >=200
 * @param {Opening[]} [openings]
 * @returns {object} Wandelement (siehe wandelement.schema.json)
 */
export const SEITEN_FUNKTIONEN = ["fassade", "innenausbau", "sicht", "installation"];
export const DEFAULT_SIDES = { vorne: { funktion: "fassade" }, hinten: { funktion: "innenausbau" } };
function normSides(s) {
  const f = (v, d) => (v && SEITEN_FUNKTIONEN.includes(v.funktion)) ? v.funktion : d;
  return { vorne: { funktion: f(s && s.vorne, "fassade") }, hinten: { funktion: f(s && s.hinten, "innenausbau") } };
}

export const DEFAULT_PRESTRESS = { max_span_grid: MAX_SPAN_GRID, force_kN: null };
function normPrestress(p) {
  const m = (p && Number.isInteger(p.max_span_grid) && p.max_span_grid >= 1) ? p.max_span_grid : MAX_SPAN_GRID;
  const fk = (p && p.force_kN != null) ? p.force_kN : null;
  const rod = (p && p.rod_mm != null && +p.rod_mm > 0) ? +p.rod_mm : ROD;
  const blech = (p && p.blech_mm != null && +p.blech_mm > 0) ? +p.blech_mm : BLECH;
  const top = (p && (p.top_connection === "spannplatte" || p.top_connection === "blech")) ? p.top_connection : "blech";
  // manuelle Spannachsen (Rasterindizes) – wenn gesetzt, exakt diese statt Auto-Verteilung
  let cg = Array.isArray(p && p.columns_grid) ? p.columns_grid.map(Number).filter(k => Number.isInteger(k) && k >= 0) : null;
  cg = (cg && cg.length) ? [...new Set(cg)].sort((a, b) => a - b) : null;
  return { max_span_grid: m, force_kN: fk, rod_mm: rod, blech_mm: blech, top_connection: top, columns_grid: cg };
}

function normSteps(steps, lengthMm, heightMm) {
  const out = [];
  for (const s of (steps || [])) {
    const x0 = Math.max(0, pyRound((s.x0_mm || 0) / GRID) * GRID);
    const x1 = Math.min(lengthMm, pyRound((s.x1_mm || 0) / GRID) * GRID);
    const h = Math.max(0, Math.min(heightMm, pyRound((s.height_mm || 0) / COURSE) * COURSE));
    if (x1 > x0) out.push({ x0_mm: x0, x1_mm: x1, height_mm: h });
  }
  return out;
}

export function buildWall(name, lengthMm, heightMm, openings = [], sides = null, prestress = null, steps = []) {
  const PS = normPrestress(prestress);
  const maxSpan = PS.max_span_grid;
  const ROD_ = PS.rod_mm;
  const TOP = PS.top_connection;   // 'blech' (Kopfblech) | 'spannplatte'
  validateInputs(lengthMm, heightMm, openings);
  const N = lengthMm / GRID, L = heightMm / COURSE;

  // Staffelung / getreppter Aufbau: je Spalte eine lokale Oberkante (Anzahl Lagen)
  const STEPS = normSteps(steps, lengthMm, heightMm);
  const topLage = new Array(N);
  for (let k = 0; k < N; k++) {
    const xc = (k + 0.5) * GRID; let h = heightMm;
    for (const s of STEPS) { if (xc >= s.x0_mm && xc < s.x1_mm) { h = s.height_mm; break; } }
    topLage[k] = Math.max(0, Math.min(L, pyRound(h / COURSE)));
  }
  const runsAt = (li) => { const runs = []; let s = null;
    for (let k = 0; k < N; k++) { const present = topLage[k] > li; if (present) { if (s === null) s = k; } else if (s !== null) { runs.push([s, k]); s = null; } }
    if (s !== null) runs.push([s, N]); return runs; };

  const courses = []; let prev = new Set();
  const rigidLagen = []; const invalidSegments = [];
  for (let li = 0; li < L; li++) {
    let cuts = runsAt(li);
    for (const op of openings) {
      if (op.l0 <= li && li < op.l1) {
        const nc = [];
        for (const [s, e] of cuts) {
          if (op.g1 <= s || op.g0 >= e) { nc.push([s, e]); continue; }
          if (op.g0 > s) nc.push([s, op.g0]);
          if (op.g1 < e) nc.push([op.g1, e]);
        }
        cuts = nc;
      }
    }
    const stones = []; let joints = new Set(); let rig = false;
    for (const [s, e] of cuts) {
      const w = e - s;
      if (FORBIDDEN_N.has(w)) {
        rig = true;
        const seg = { lage: li, start_grid: s, breite_grid: w };
        if (!invalidSegments.some(x => x.lage === li && x.start_grid === s && x.breite_grid === w))
          invalidSegments.push(seg);
      }
      const comp = pickTiling(s, w, prev);
      for (const j of segJoints(s, comp)) joints.add(j);
      let g = s;
      for (const b of comp) {
        stones.push({ type: b === 2 ? "i2" : "i3", x0: g * GRID, x1: (g + b) * GRID });
        g += b;
      }
    }
    if (rig) rigidLagen.push(li);
    courses.push({ lage: li, stones, joints_grid: [...joints].sort((a, b) => a - b) });
    prev = joints;
  }

  let versatzOk = true; const viol = [];
  for (let li = 0; li < L - 1; li++) {
    const a = new Set(courses[li].joints_grid);
    const bad = courses[li + 1].joints_grid.filter(x => a.has(x));
    if (bad.length) { versatzOk = false; viol.push({ zwischen_lagen: [li, li + 1], fugen_grid: bad.slice().sort((p, q) => p - q) }); }
  }

  // ---- Vorspannstränge: Segmente je durchgehend belegtem Bereich (über/unter Öffnungen) ----
  const occ = []; for (let r = 0; r < L; r++) occ.push(new Array(N).fill(false));
  for (const c of courses) for (const st of c.stones) { const a = st.x0 / GRID, b = st.x1 / GRID; for (let cc = a; cc < b; cc++) occ[c.lage][cc] = true; }
  let colArr;
  if (PS.columns_grid) {
    // Sonderkonstruktion: exakt die manuell gesetzten Achsen verwenden
    colArr = PS.columns_grid.filter(k => k >= 0 && k < N).sort((a, b) => a - b);
  } else {
    const colSet = new Set([0, N - 1]);
    for (const c of balancedFill(0, N - 1, maxSpan)) colSet.add(c);
    for (const op of openings) { if (op.g0 - 1 >= 0) colSet.add(op.g0 - 1); if (op.g1 <= N - 1) colSet.add(op.g1); }
    // Stufenkanten: an jeder Höhenstufe ein Strang beidseitig der Kante (Vorspannung läuft an der Treppe entlang)
    for (let k = 0; k < N - 1; k++) { if (topLage[k] !== topLage[k + 1]) { colSet.add(k); colSet.add(k + 1); } }
    colArr = [...colSet].filter(k => k >= 0 && k < N).sort((a, b) => a - b);
  }
  const columns = [];
  let anchSenkkopf = 0, anchSpannmutter = 0, anchSpannplatten = 0;
  for (const k of colArr) {
    const localTop = topLage[k] * COURSE;
    const segs = []; let r = 0;
    while (r < L) {
      if (!occ[r][k]) { r++; continue; }
      let r2 = r; while (r2 + 1 < L && occ[r2 + 1][k]) r2++;
      const z0 = r * COURSE, z1 = (r2 + 1) * COURSE, h = z1 - z0, stueck = Math.ceil(h / ROD_);
      // Anschluss-Ausbildung je Segmentende:
      //   Fuß der Wand (z0==0)      -> Bodenblech: Senkkopfschraube + Kopplungsmutter
      //   Wandoberkante (z1==Top)   -> Kopfblech (Spannmutter) ODER Spannplatte (Platte + Spannmutter)
      //   Zwischenende (an Öffnung) -> Spannplatte auf der Steinkante (Platte + Spannmutter)
      const bottomBase = z0 === 0;
      const topReach = z1 === localTop;
      const ankerUnten = bottomBase ? "bodenblech" : "spannplatte";
      const ankerOben = topReach ? (TOP === "blech" ? "kopfblech" : "spannplatte") : "spannplatte";
      let segSenkkopf = 0, segSpannmutter = 0, segSpannplatten = 0;
      if (bottomBase) segSenkkopf++; else { segSpannmutter++; segSpannplatten++; }
      if (ankerOben === "kopfblech") segSpannmutter++; else { segSpannmutter++; segSpannplatten++; }
      anchSenkkopf += segSenkkopf; anchSpannmutter += segSpannmutter; anchSpannplatten += segSpannplatten;
      segs.push({ z0_mm: z0, z1_mm: z1, lage0: r, lage1: r2 + 1, gewindestangen: stueck,
        letzte_stange_mm: h - (stueck - 1) * ROD_, verschnitt_mm: stueck * ROD_ - h,
        verbindungsmuttern: stueck - 1, anker_unten: ankerUnten, anker_oben: ankerOben,
        senkkopfschrauben: segSenkkopf, spannplatten: segSpannplatten, spannmuttern: segSpannmutter });
      r = r2 + 1;
    }
    if (!segs.length) continue;
    const durch = segs.length === 1 && segs[0].z0_mm === 0 && segs[0].z1_mm === topLage[k] * COURSE;
    columns.push({ k, x_mm: CHAMBER_OFFSET + GRID * k, durchgehend: durch, segments: segs,
      gewindestangen: segs.reduce((a, sg) => a + sg.gewindestangen, 0),
      verbindungsmuttern: segs.reduce((a, sg) => a + sg.verbindungsmuttern, 0),
      senkkopfschrauben: segs.reduce((a, sg) => a + sg.senkkopfschrauben, 0),
      spannplatten: segs.reduce((a, sg) => a + sg.spannplatten, 0),
      spannmuttern: segs.reduce((a, sg) => a + sg.spannmuttern, 0) });
  }
  let spanOk = true;
  for (let r = 0; r < L; r++) {
    let c = 0;
    while (c < N) {
      if (!occ[r][c]) { c++; continue; }
      let c2 = c; while (c2 + 1 < N && occ[r][c2 + 1]) c2++;   // gefüllter Bereich [c..c2]
      const present = columns.filter(col => col.k >= c && col.k <= c2 && col.segments.some(sg => sg.lage0 <= r && r < sg.lage1)).map(col => col.k);
      for (let i = 0; i < present.length - 1; i++) if (present[i + 1] - present[i] > maxSpan) spanOk = false;
      c = c2 + 1;
    }
  }
  // Stoßfugen (vertikale Fugen zwischen Steinen) -> Dichtstreifen (je 200 mm hoch = 1 Steinreihe)
  const stossfugen = courses.reduce((a, c) => a + c.joints_grid.length, 0);

  // Stahlbleche: Bodenblech immer über die volle Wandlänge; Kopfblech nur bei top_connection=='blech'
  const occCols = topLage.filter(t => t > 0).length;
  const topEdgeLen = occCols * GRID;
  const bodenModule = Math.ceil(lengthMm / PS.blech_mm);
  const kopfModule = (TOP === "blech") ? Math.ceil(topEdgeLen / PS.blech_mm) : 0;
  const basePlate = { rolle: "bodenblech", laenge_mm: lengthMm, breite_mm: THICK, dicke_mm: BLECH_THICK, modul_mm: PS.blech_mm, module: bodenModule };
  const topPlate = (TOP === "blech")
    ? { rolle: "kopfblech", laenge_mm: topEdgeLen, breite_mm: THICK, dicke_mm: BLECH_THICK, modul_mm: PS.blech_mm, module: kopfModule }
    : null;

  const bom = { i2: 0, i3: 0 };
  for (const c of courses) for (const s of c.stones) bom[s.type] += 1;
  bom.gewindestangen = columns.reduce((a, c) => a + c.gewindestangen, 0);
  bom.verbindungsmuttern = columns.reduce((a, c) => a + c.verbindungsmuttern, 0);
  bom.senkkopfschrauben = anchSenkkopf;
  bom.kopplungsmuttern_basis = anchSenkkopf;   // eine Kopplungsmutter je Fußanker
  bom.spannplatten = anchSpannplatten;
  bom.spannmuttern = anchSpannmutter;
  bom.stahlblech_module = bodenModule + kopfModule;
  bom.stahlblech_mm = lengthMm + (TOP === "blech" ? topEdgeLen : 0);
  bom.stahlblech_dicke_mm = BLECH_THICK;
  bom.stossfugen = stossfugen;
  bom.dichtstreifen_mm = stossfugen * COURSE;
  bom.verschnitt_mm = columns.reduce((a, c) => a + c.segments.reduce((b, sg) => b + sg.verschnitt_mm, 0), 0);

  const buildable = invalidSegments.length === 0;  // strukturell; Versatz separat
  return {
    name, length_mm: lengthMm, height_mm: heightMm,
    grid_mm: GRID, course_mm: COURSE, thickness_mm: THICK, rod_mm: ROD_,
    N_grid: N, lagen: L,
    openings: openings.map(op => op.asDict()),
    steps: STEPS,
    sides: normSides(sides),
    prestress: PS,
    base_plate: basePlate, top_plate: topPlate,
    tension_columns: columns, bom,
    validation: {
      buildable, versatz_ok: versatzOk, versatz_violations: viol,
      tension_span_ok: spanOk, rigid_lagen: rigidLagen, invalid_segments: invalidSegments,
    },
    courses,
  };
}

export const isBuildable = (w) => !!w.validation.buildable;

export const REFERENCE_WALLS = {
  ref1_glatte_wand: ["ref1_glatte_wand", 1000, 2000, []],
  ref2_wand_tuer: ["ref2_wand_tuer", 2000, 2600, [new Opening(5, 11, 0, 10, "tuer")]],
  ref3_wand_fenster: ["ref3_wand_fenster", 2000, 2600, [new Opening(6, 10, 4, 10, "fenster")]],
};
export function buildReference(key) {
  const [name, l, h, ops] = REFERENCE_WALLS[key];
  return buildWall(name, l, h, ops);
}
