// @ts-check
/**
 * SEMBLA Wandaufbau-Kern (Modul 2) — Verbinder + Latten/Dämmung, pro Seite (Fassade/Innenausbau).
 * Reine Funktionen (kein DOM), 1:1 aus SEMBLA_Wandaufbau.html extrahiert. Einheiten: cm.
 *
 * Regeln: Verbinder-/UK-Nutenraster 12,5·k (innenliegende Stege, nie Fuge); Verbinder in
 * Steinmitte (Höhe 10+20·m); Panelfugen = Achsen + Zwischenachsen nach Max-Abstand;
 * Auskragung bis Feldkante (max. Randüberstand); Latten 1D-Zuschnitt; Dämmung je Gefach.
 */

export const NUTS = 12.5;
export const COURSE = 20, HALF = COURSE / 2;

export const VERBINDER_KATALOG = [
  { id: 'FA-1', name: 'Fassadenanker FA-1', Rk: 0.50, gM: 2.0, fuer: 'fassade' },
  { id: 'FA-2', name: 'Fassadenanker FA-2 (schwer)', Rk: 0.80, gM: 2.0, fuer: 'fassade' },
  { id: 'IA-1', name: 'Innenanker IA-1 (leicht)', Rk: 0.25, gM: 2.0, fuer: 'innenausbau' },
  { id: 'UNI', name: 'Universal', Rk: 0.50, gM: 2.0, fuer: 'alle' },
];
export function verbinderFor(funktion) {
  return VERBINDER_KATALOG.find(x => x.fuer === funktion) || VERBINDER_KATALOG.find(x => x.fuer === 'alle') || VERBINDER_KATALOG[VERBINDER_KATALOG.length - 1];
}
export const snapNut = x => +(Math.round(x / NUTS) * NUTS).toFixed(2);

// ---------- Latten-Logik ----------
export function cuttingStock(pieces, stock) {
  const sorted = [...pieces].sort((a, b) => b - a); const remn = []; let sc = 0;
  for (const p of sorted) { let bi = -1, bv = Infinity; for (let i = 0; i < remn.length; i++) if (remn[i] >= p - 1e-6 && remn[i] < bv) { bv = remn[i]; bi = i; }
    if (bi >= 0) remn[bi] = +(remn[bi] - p).toFixed(3); else { sc++; remn.push(+(stock - p).toFixed(3)); } }
  const used = pieces.reduce((a, b) => a + b, 0), total = sc * stock;
  return { stockCount: sc, usedLen: +used.toFixed(3), totalLen: +total.toFixed(3), wasteLen: +(total - used).toFixed(3) };
}
export function splitInterval(S, E, conns, stock) {
  const segs = []; if (E - S <= stock + 1e-6) { segs.push({ y0: S, y1: E }); return segs; }
  let start = S, i = 0, guard = 0; while (guard++ < 10000) { if (E - start <= stock + 1e-6) { segs.push({ y0: start, y1: E }); break; }
    let chosen = -1; for (let j = i; j < conns.length - 1; j++) { const joint = (conns[j] + conns[j + 1]) / 2; if (joint - start <= stock + 1e-6) chosen = j; else break; }
    let joint; if (chosen < 0) joint = +(start + stock).toFixed(3); else joint = +((conns[chosen] + conns[chosen + 1]) / 2).toFixed(3);
    segs.push({ y0: start, y1: joint }); start = joint; while (i < conns.length && conns[i] < joint) i++; } return segs;
}
export function solidIntervals(x, ops, H) {
  const blocks = (ops || []).filter(o => x > o.x0 + 1e-6 && x < o.x1 - 1e-6).map(o => [o.y0, o.y1]).sort((a, b) => a[0] - b[0]);
  const iv = []; let cur = 0; for (const [a, b] of blocks) { if (a > cur + 1e-6) iv.push([cur, a]); cur = Math.max(cur, b); } if (H - cur > 1e-6) iv.push([cur, H]); return iv;
}
export function layoutToBattens(layout, opts = {}) {
  const stock = opts.stockCm ?? 150, widthCm = opts.widthCm ?? 4, H = (layout.wall && layout.wall.H_cm) || 0, ops = layout.openings_cm || [];
  const cy = opts.clipY || [0, H];
  const at = opts.axisTop || (() => H);
  const clip = (iv, x) => iv.map(([S, E]) => [Math.max(S, cy[0]), Math.min(E, cy[1], at(x))]).filter(([S, E]) => E - S > 1e-6);
  const byX = new Map(); for (const p of layout.points || []) { const k = +(+p.x_cm).toFixed(2); if (!byX.has(k)) byX.set(k, new Set()); byX.get(k).add(+(+p.y_cm).toFixed(2)); }
  const axes = [], pieces = []; let warnings = 0;
  for (const x of [...byX.keys()].sort((a, b) => a - b)) { const ys = [...byX.get(x)].sort((a, b) => a - b); const intervals = clip(solidIntervals(x, ops, H), x); const segs = [];
    for (const [S, E] of intervals) { const conns = ys.filter(y => y > S + 1e-6 && y < E - 1e-6); if (conns.length === 0) { warnings++; continue; }
      for (const sg of splitInterval(S, E, conns, stock)) { const len = +(sg.y1 - sg.y0).toFixed(2); segs.push({ y0_cm: +sg.y0.toFixed(2), y1_cm: +sg.y1.toFixed(2), len_cm: len }); pieces.push(len); } }
    axes.push({ x_cm: x, n_connectors: ys.length, segments: segs }); }
  const cutting = cuttingStock(pieces, stock); let daemmung = null;
  if (opts.insulation) { const th = opts.thicknessCm || 0; const xs = axes.map(a => a.x_cm); const bays = [];
    for (let i = 0; i < xs.length - 1; i++) { const clear = +(xs[i + 1] - xs[i] - widthCm).toFixed(2); if (clear <= 0.01) continue; const midx = (xs[i] + xs[i + 1]) / 2;
      const segs = clip(solidIntervals(midx, ops, H), midx).map(([S, E]) => ({ h_cm: +(E - S).toFixed(2) })); const area = +segs.reduce((a, sg) => a + (clear / 100) * (sg.h_cm / 100), 0).toFixed(3);
      bays.push({ area_m2: area }); }
    daemmung = { thickness_cm: th, total: { flaeche_m2: +bays.reduce((a, b) => a + b.area_m2, 0).toFixed(2), gefache: bays.length } }; }
  const summary = { achsen: axes.length, latten_stuecke: pieces.length, latten_15m_bedarf: cutting.stockCount,
    gesamtlaenge_m: +(cutting.totalLen / 100).toFixed(2), verschnitt_m: +(cutting.wasteLen / 100).toFixed(2),
    verschnitt_pct: cutting.totalLen ? +(100 * cutting.wasteLen / cutting.totalLen).toFixed(1) : 0, warnungen: warnings };
  return { wall: layout.wall || {}, openings_cm: ops, axes, summary, daemmung, cutting };
}

// ---------- Achsen ----------
export function axesRange(lo_cm, hi_cm, panel_cm, off_cm, max_cm, edges_cm) {
  if (hi_cm - lo_cm < 0.01) return [lo_cm];
  const set = new Set([+lo_cm.toFixed(2), +hi_cm.toFixed(2)]);
  for (const e of (edges_cm || [])) if (e > lo_cm - 1e-6 && e < hi_cm + 1e-6) set.add(+e.toFixed(2));
  for (let k = 0; ; k++) { const x = off_cm + k * panel_cm; if (x > hi_cm + 1e-6) break; if (x > lo_cm - 1e-6) set.add(+x.toFixed(2)); }
  let arr = [...set].sort((a, b) => a - b);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) { const gap = arr[i] - arr[i - 1]; if (gap > max_cm + 1e-6) { const n = Math.ceil(gap / max_cm); for (let j = 1; j < n; j++) out.push(+(arr[i - 1] + gap * j / n).toFixed(2)); } out.push(arr[i]); }
  return [...new Set(out.map(x => +x.toFixed(2)))].sort((a, b) => a - b);
}
export function snapCourses(ys, lo, hi) {
  const mids = []; for (let m = 0; ; m++) { const s = +(m * COURSE + HALF).toFixed(2); if (s > hi + 1e-6) break; if (s >= lo - 1e-6) mids.push(s); }
  if (!mids.length) { const m = Math.round(((lo + hi) / 2 - HALF) / COURSE); mids.push(+(m * COURSE + HALF).toFixed(2)); }
  const near = y => mids.reduce((b, c) => Math.abs(c - y) < Math.abs(b - y) - 1e-9 ? c : b, mids[0]);
  const seen = new Set(), out = [];
  for (const y of ys) { const s = near(y); const k = s.toFixed(2); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out.sort((a, b) => a - b);
}
export function nutStatus(w, xcm) {
  const xmm = xcm * 10; let cov = 0, inter = 0;
  for (const c of (w.courses || [])) { let isCov = false, isInt = false;
    for (const st of c.stones) { if (xmm >= st.x0 - 1e-6 && xmm <= st.x1 + 1e-6) { isCov = true; if (xmm > st.x0 + 1e-6 && xmm < st.x1 - 1e-6) isInt = true; } }
    if (isCov) { cov++; if (isInt) inter++; } }
  if (cov === 0) return 'none';
  if (inter === cov) return 'cont'; if (inter === 0) return 'joint'; return 'stagger';
}
export function nutAxes(lo, hi, panel, off, max, edges, B, w) {
  const grid = []; for (let x = NUTS; x <= B - NUTS + 1e-6; x += NUTS) if (x >= lo - 1e-6 && x <= hi + 1e-6) grid.push(+x.toFixed(2));
  if (!grid.length) return [snapNut((lo + hi) / 2)];
  const interior = grid.filter(x => { const st = nutStatus(w, x); return st === 'cont' || st === 'stagger'; });
  const usable = interior.length ? interior : grid;
  const near = x => usable.reduce((b, c) => Math.abs(c - x) < Math.abs(b - x) - 1e-9 ? c : b, usable[0]);
  const L = usable[0], R = usable[usable.length - 1]; const set = new Set([L, R]);
  for (let k = 0; ; k++) { const x = off + k * panel; if (x > hi + 1e-6) break; if (x > lo - 1e-6) set.add(near(x)); }
  for (const e of (edges || [])) if (e > lo - 1e-6 && e < hi + 1e-6) set.add(near(e));
  let arr = [...set].sort((a, b) => a - b);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) { const gap = arr[i] - arr[i - 1];
    if (gap > max + 1e-6) { const n = Math.ceil(gap / max); for (let j = 1; j < n; j++) { const t = near(arr[i - 1] + gap * j / n); if (t > arr[i - 1] + 1e-6 && t < arr[i] - 1e-6) out.push(t); } }
    out.push(arr[i]); }
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Verbinder + Latten/Dämmung + Nachweis je Wandseite. Pures Pendant zu compute() im Tool.
 * @param {object} w  Wandelement (length_mm, height_mm, courses, openings, steps, sides)
 * @param {object} [opts]  side, feld{x0,x1,y0,y1}|null, panelB, panelH, offX, offY, maxX, maxY,
 *                         overhang, lattenbreite, stock, insulation, thickness, gammaQ, wk, Rk, gM, vtyp
 */
export function planWandaufbau(w, opts = {}) {
  const o = Object.assign({ side: 'vorne', feld: null, panelB: 62.5, panelH: 150, offX: 0, offY: 0,
    maxX: 62.5, maxY: 75, overhang: 12.5, lattenbreite: 4, stock: 150, insulation: true, thickness: 8,
    gammaQ: 1.5, wk: 0.8 }, opts);
  const SIDE = o.side, FELD = o.feld;
  const funktion = (w.sides && w.sides[SIDE] && w.sides[SIDE].funktion) || 'fassade';
  const vb = verbinderFor(funktion);
  const Rk = o.Rk ?? vb.Rk, gM = o.gM ?? vb.gM, vtyp = o.vtyp || vb.id;

  const B = w.length_mm / 10, H = w.height_mm / 10;
  const ops = (w.openings || []).map(op => ({ x0: op.g0 * 12.5, x1: op.g1 * 12.5, y0: op.l0 * 20, y1: op.l1 * 20, art: op.art }));
  const ovl = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const fx0 = FELD ? Math.max(0, FELD.x0) : 0, fx1 = FELD ? Math.min(B, FELD.x1) : B;
  const fy0 = FELD ? Math.max(0, FELD.y0) : 0, fy1 = FELD ? Math.min(H, FELD.y1) : H;
  const relSteps = (w.steps || []).filter(st => (st.height_mm / 10) < fy1 - 1e-6 && ovl(st.x0_mm / 10, st.x1_mm / 10, fx0, fx1) > 1e-6);
  const steps = relSteps.map(st => ({ x0: st.x0_mm / 10 - 0.1, x1: st.x1_mm / 10, y0: st.height_mm / 10, y1: H, art: '_step' }));
  const opsEff = ops.concat(steps);
  const localTop = x => { for (const st of relSteps) { const a = st.x0_mm / 10, b = st.x1_mm / 10; if (x >= a - 1e-6 && x < b - 1e-6) return st.height_mm / 10; } return H; };
  const axisTop = x => Math.max(localTop(x - 0.5), localTop(x), localTop(x + 0.5));
  const xEdges = []; ops.forEach(op => { xEdges.push(op.x0, op.x1); }); relSteps.forEach(st => { xEdges.push(st.x0_mm / 10, st.x1_mm / 10); });
  const yEdges = []; ops.forEach(op => { if (op.y0 > 0) yEdges.push(op.y0); if (op.y1 < H) yEdges.push(op.y1); }); relSteps.forEach(st => { const t = st.height_mm / 10; if (t > 0 && t < H) yEdges.push(t); });
  const xs = nutAxes(fx0, fx1, o.panelB, o.offX, o.maxX, xEdges, B, w);
  const ys = snapCourses(axesRange(fy0, fy1, o.panelH, o.offY, o.maxY, yEdges), fy0, fy1);
  const maxOh = o.overhang;
  const ohL = +(xs[0] - fx0).toFixed(2), ohR = +(fx1 - xs[xs.length - 1]).toFixed(2);
  const ohWarn = ohL > maxOh + 1e-6 || ohR > maxOh + 1e-6;
  const inOpen = (x, y) => ops.some(op => x > op.x0 + 1e-6 && x < op.x1 - 1e-6 && y > op.y0 + 1e-6 && y < op.y1 - 1e-6);
  const stat = x => nutStatus(w, x);
  const pts = []; for (const x of xs) { const t = stat(x) === 'cont' ? 'C' : 'I'; for (const y of ys) if (y <= axisTop(x) + 1e-6 && !inOpen(x, y)) pts.push({ x_cm: x, nut_cm: x, y_cm: y, type: t }); }
  const nutRaster = []; for (let x = NUTS; x <= B - NUTS + 1e-6; x += NUTS) { const t = stat(+x.toFixed(2)); if (t === 'cont' || t === 'stagger') nutRaster.push({ x_cm: +x.toFixed(2), status: t }); }
  const Rd = Rk / gM;
  const coeff = o.gammaQ * o.wk;
  let area = ((fx1 - fx0) / 100) * ((fy1 - fy0) / 100) - opsEff.reduce((s, op) => s + (ovl(op.x0, op.x1, fx0, fx1) / 100) * (ovl(op.y0, op.y1, fy0, fy1) / 100), 0); area = Math.max(0.01, area);
  const atReal = area / Math.max(1, pts.length); const util = coeff > 0 ? coeff * atReal / Rd : 0; const ok = util <= 1 + 1e-9;
  const layout = { format: 'SEMBLA-VerbinderLayout', version: '2.0',
    wall: { B_cm: B, H_cm: H, name: (w.name || null) }, openings_cm: ops,
    uk: { sx_cm: null, sy_cm: null }, seite: SIDE,
    seite_funktion: (w.sides && w.sides[SIDE] && w.sides[SIDE].funktion) || null,
    verbinder_typ: vtyp, panel: { b_cm: o.panelB, h_cm: o.panelH },
    feld_cm: FELD ? { x0: fx0, x1: fx1, y0: fy0, y1: fy1 } : null,
    points: pts };
  return { w, B, H, fx0, fx1, fy0, fy1, xs, ys, pts, nutRaster, layout, steps, atReal, util, ok, ohL, ohR, maxOh, ohWarn,
    verbinder: vb, funktion, Rk, gM,
    batt: layoutToBattens(layout, { widthCm: o.lattenbreite, stockCm: o.stock, insulation: o.insulation, thicknessCm: o.thickness, clipY: [fy0, fy1], axisTop }) };
}
