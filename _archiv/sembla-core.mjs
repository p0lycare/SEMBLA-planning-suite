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
    if (art !== "tuer" && art !== "fenster") throw new InvalidOpeningError(`unbekannte art '${art}'`);
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
export function buildWall(name, lengthMm, heightMm, openings = []) {
  validateInputs(lengthMm, heightMm, openings);
  const N = lengthMm / GRID, L = heightMm / COURSE;

  const courses = []; let prev = new Set();
  const rigidLagen = []; const invalidSegments = [];
  for (let li = 0; li < L; li++) {
    let cuts = [[0, N]];
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

  const inside = (k) => openings.some(op => op.g0 <= k && k < op.g1);
  const allowed = []; for (let k = 0; k < N; k++) if (!inside(k)) allowed.push(k);
  const runs = []; let cur = [allowed[0]];
  for (const k of allowed.slice(1)) {
    if (k === cur[cur.length - 1] + 1) cur.push(k);
    else { runs.push(cur); cur = [k]; }
  }
  runs.push(cur);
  const cols = new Set();
  for (const run of runs) for (const c of balancedFill(run[0], run[run.length - 1], MAX_SPAN_GRID)) cols.add(c);
  const allowedSet = new Set(allowed);
  const must = new Set([0, N - 1]);
  for (const op of openings) { if (op.g0 - 1 >= 0) must.add(op.g0 - 1); if (op.g1 <= N - 1) must.add(op.g1); }
  for (const m of must) if (allowedSet.has(m)) cols.add(m);
  const colArr = [...cols].sort((a, b) => a - b);

  let spanOk = true;
  for (const run of runs) {
    const rc = colArr.filter(c => run[0] <= c && c <= run[run.length - 1]);
    for (let i = 0; i < rc.length - 1; i++) if (rc[i + 1] - rc[i] > MAX_SPAN_GRID) spanOk = false;
  }

  const stueck = Math.ceil(heightMm / ROD);
  const cutLen = heightMm - (stueck - 1) * ROD;
  const verschnittCol = stueck * ROD - heightMm;
  const nc = colArr.length;
  const columns = colArr.map(k => ({
    k, x_mm: CHAMBER_OFFSET + GRID * k, gewindestangen: stueck,
    letzte_stange_mm: cutLen, verschnitt_mm: verschnittCol,
    verbindungsmuttern: stueck - 1, stahlplatten_strukturell: 2, spannmuttern: 2,
  }));

  const bom = { i2: 0, i3: 0 };
  for (const c of courses) for (const s of c.stones) bom[s.type] += 1;
  bom.gewindestangen = stueck * nc;
  bom.verbindungsmuttern = (stueck - 1) * nc;
  bom.stahlplatten = 2 * nc;
  bom.spannmuttern = 2 * nc;
  bom.verschnitt_mm = verschnittCol * nc;

  const buildable = invalidSegments.length === 0;  // strukturell; Versatz separat
  return {
    name, length_mm: lengthMm, height_mm: heightMm,
    grid_mm: GRID, course_mm: COURSE, thickness_mm: THICK, rod_mm: ROD,
    N_grid: N, lagen: L,
    openings: openings.map(op => op.asDict()),
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
