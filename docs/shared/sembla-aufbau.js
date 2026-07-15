// @ts-check
/**
 * SEMBLA Aufbau — horizontaler Wandaufbau (Verbinder-/Lattenplanung), rein.
 *
 * DOM-freie Betriebskopie der Layout-Logik aus Modul 2 (`wandaufbau.html`).
 * Nimmt das Wandelement (Single Source of Truth) plus die Aufbau-Eingaben
 * (`eingaben.aufbau`, siehe storage.js) und liefert das Verbinder-Layout,
 * den Latten-Zuschnitt und die Nachweis-Auslastung.
 *
 * Eigene Datei (shared/-Regel b): mehrere Nutzer (Modul 2 fuer die Zeichnung,
 * Modul 4 Stueckliste und der zentrale Export fuer Verbinder-/Lattenmengen) und
 * eigene Tests. Damit rechnen alle aus DEMSELBEN Datenmodell — kein Bundle,
 * kein Drift.
 *
 * Einheiten: Wandelement in mm; hier durchgaengig cm (wie in Modul 2).
 * ES-Modul: laeuft im Browser und in den Node-Tests per import.
 */

const NUTS = 12.5;          // Nutenraster (cm)
const COURSE = 20, HALF = COURSE / 2;   // Steinhoehe (cm) → Verbinder in Steinmitte

// ---------- Latten-Zuschnitt (1D) ----------
function cuttingStock(pieces, stock) {
  const sorted = [...pieces].sort((a, b) => b - a); const remn = []; let sc = 0;
  for (const p of sorted) {
    let bi = -1, bv = Infinity;
    for (let i = 0; i < remn.length; i++) if (remn[i] >= p - 1e-6 && remn[i] < bv) { bv = remn[i]; bi = i; }
    if (bi >= 0) remn[bi] = +(remn[bi] - p).toFixed(3); else { sc++; remn.push(+(stock - p).toFixed(3)); }
  }
  const used = pieces.reduce((a, b) => a + b, 0), total = sc * stock;
  return { stockCount: sc, usedLen: +used.toFixed(3), totalLen: +total.toFixed(3), wasteLen: +(total - used).toFixed(3) };
}
function splitInterval(S, E, conns, stock) {
  const segs = []; if (E - S <= stock + 1e-6) { segs.push({ y0: S, y1: E }); return segs; }
  let start = S, i = 0, guard = 0;
  while (guard++ < 10000) {
    if (E - start <= stock + 1e-6) { segs.push({ y0: start, y1: E }); break; }
    let chosen = -1;
    for (let j = i; j < conns.length - 1; j++) { const joint = (conns[j] + conns[j + 1]) / 2; if (joint - start <= stock + 1e-6) chosen = j; else break; }
    let joint; if (chosen < 0) joint = +(start + stock).toFixed(3); else joint = +((conns[chosen] + conns[chosen + 1]) / 2).toFixed(3);
    segs.push({ y0: start, y1: joint }); start = joint; while (i < conns.length && conns[i] < joint) i++;
  }
  return segs;
}
function solidIntervals(x, ops, H) {
  const blocks = (ops || []).filter(o => x > o.x0 + 1e-6 && x < o.x1 - 1e-6).map(o => [o.y0, o.y1]).sort((a, b) => a[0] - b[0]);
  const iv = []; let cur = 0;
  for (const [a, b] of blocks) { if (a > cur + 1e-6) iv.push([cur, a]); cur = Math.max(cur, b); }
  if (H - cur > 1e-6) iv.push([cur, H]);
  return iv;
}

/**
 * Latten je Verbinderachse (1D-Zuschnitt). Daemmung entfaellt (MVP).
 * @param {object} layout Verbinder-Layout (points/openings_cm/wall)
 * @param {object} [opts] { stockCm, clipY:[lo,hi], axisTop:(x)=>hi }
 */
export function layoutToBattens(layout, opts = {}) {
  const stock = opts.stockCm ?? 150, H = (layout.wall && layout.wall.H_cm) || 0, ops = layout.openings_cm || [];
  const cy = opts.clipY || [0, H];
  const at = opts.axisTop || (() => H);
  const clip = (iv, x) => iv.map(([S, E]) => [Math.max(S, cy[0]), Math.min(E, cy[1], at(x))]).filter(([S, E]) => E - S > 1e-6);
  const byX = new Map();
  for (const p of layout.points || []) { const k = +(+p.x_cm).toFixed(2); if (!byX.has(k)) byX.set(k, new Set()); byX.get(k).add(+(+p.y_cm).toFixed(2)); }
  const axes = [], pieces = []; let warnings = 0;
  for (const x of [...byX.keys()].sort((a, b) => a - b)) {
    const ys = [...byX.get(x)].sort((a, b) => a - b); const intervals = clip(solidIntervals(x, ops, H), x); const segs = [];
    for (const [S, E] of intervals) {
      const conns = ys.filter(y => y > S + 1e-6 && y < E - 1e-6); if (conns.length === 0) { warnings++; continue; }
      for (const sg of splitInterval(S, E, conns, stock)) { const len = +(sg.y1 - sg.y0).toFixed(2); segs.push({ y0_cm: +sg.y0.toFixed(2), y1_cm: +sg.y1.toFixed(2), len_cm: len }); pieces.push(len); }
    }
    axes.push({ x_cm: x, n_connectors: ys.length, segments: segs });
  }
  const cutting = cuttingStock(pieces, stock);
  const summary = {
    achsen: axes.length, latten_stuecke: pieces.length, latten_15m_bedarf: cutting.stockCount,
    gesamtlaenge_m: +(cutting.totalLen / 100).toFixed(2), verschnitt_m: +(cutting.wasteLen / 100).toFixed(2),
    verschnitt_pct: cutting.totalLen ? +(100 * cutting.wasteLen / cutting.totalLen).toFixed(1) : 0, warnungen: warnings,
  };
  return { wall: layout.wall || {}, openings_cm: ops, axes, summary, cutting };
}

// ---------- Achsen aus Panelfugen + Zwischenachsen ----------
function axesRange(lo_cm, hi_cm, panel_cm, off_cm, max_cm, edges_cm) {
  if (hi_cm - lo_cm < 0.01) return [lo_cm];
  const set = new Set([+lo_cm.toFixed(2), +hi_cm.toFixed(2)]);
  for (const e of (edges_cm || [])) if (e > lo_cm - 1e-6 && e < hi_cm + 1e-6) set.add(+e.toFixed(2));
  for (let k = 0; ; k++) { const x = off_cm + k * panel_cm; if (x > hi_cm + 1e-6) break; if (x > lo_cm - 1e-6) set.add(+x.toFixed(2)); }
  let arr = [...set].sort((a, b) => a - b);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) { const gap = arr[i] - arr[i - 1]; if (gap > max_cm + 1e-6) { const n = Math.ceil(gap / max_cm); for (let j = 1; j < n; j++) out.push(+(arr[i - 1] + gap * j / n).toFixed(2)); } out.push(arr[i]); }
  return [...new Set(out.map(x => +x.toFixed(2)))].sort((a, b) => a - b);
}

// ---------- Nutenraster (Verbinder in Steinmitte) ----------
function snapCourses(ys, lo, hi) {
  const mids = []; for (let m = 0; ; m++) { const s = +(m * COURSE + HALF).toFixed(2); if (s > hi + 1e-6) break; if (s >= lo - 1e-6) mids.push(s); }
  if (!mids.length) { const m = Math.round(((lo + hi) / 2 - HALF) / COURSE); mids.push(+(m * COURSE + HALF).toFixed(2)); }
  const near = y => mids.reduce((b, c) => Math.abs(c - y) < Math.abs(b - y) - 1e-9 ? c : b, mids[0]);
  const seen = new Set(), out = [];
  for (const y of ys) { const s = near(y); const k = s.toFixed(2); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out.sort((a, b) => a - b);
}
const snapNut = x => +(Math.round(x / NUTS) * NUTS).toFixed(2);
function nutStatus(w, xcm) {
  const xmm = xcm * 10; let cov = 0, inter = 0;
  for (const c of (w.courses || [])) {
    let isCov = false, isInt = false;
    for (const st of c.stones) { if (xmm >= st.x0 - 1e-6 && xmm <= st.x1 + 1e-6) { isCov = true; if (xmm > st.x0 + 1e-6 && xmm < st.x1 - 1e-6) isInt = true; } }
    if (isCov) { cov++; if (isInt) inter++; }
  }
  if (cov === 0) return "none";
  if (inter === cov) return "cont"; if (inter === 0) return "joint"; return "stagger";
}
function nutAxes(lo, hi, panel, off, max, edges, B, w) {
  const grid = []; for (let x = NUTS; x <= B - NUTS + 1e-6; x += NUTS) if (x >= lo - 1e-6 && x <= hi + 1e-6) grid.push(+x.toFixed(2));
  if (!grid.length) return [snapNut((lo + hi) / 2)];
  const interior = grid.filter(x => { const st = nutStatus(w, x); return st === "cont" || st === "stagger"; });
  const usable = interior.length ? interior : grid;
  const near = x => usable.reduce((b, c) => Math.abs(c - x) < Math.abs(b - x) - 1e-9 ? c : b, usable[0]);
  const L = usable[0], R = usable[usable.length - 1]; const set = new Set([L, R]);
  for (let k = 0; ; k++) { const x = off + k * panel; if (x > hi + 1e-6) break; if (x > lo - 1e-6) set.add(near(x)); }
  for (const e of (edges || [])) if (e > lo - 1e-6 && e < hi + 1e-6) set.add(near(e));
  let arr = [...set].sort((a, b) => a - b);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    const gap = arr[i] - arr[i - 1];
    if (gap > max + 1e-6) { const n = Math.ceil(gap / max); for (let j = 1; j < n; j++) { const t = near(arr[i - 1] + gap * j / n); if (t > arr[i - 1] + 1e-6 && t < arr[i] - 1e-6) out.push(t); } }
    out.push(arr[i]);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// ---------- Verbinder-Katalog (Rk/gM je Funktion) ----------
export const VERBINDER_KATALOG = [
  { id: "FA-1", name: "Fassadenanker FA-1", Rk: 0.50, gM: 2.0, fuer: "fassade" },
  { id: "FA-2", name: "Fassadenanker FA-2 (schwer)", Rk: 0.80, gM: 2.0, fuer: "fassade" },
  { id: "IA-1", name: "Innenanker IA-1 (leicht)", Rk: 0.25, gM: 2.0, fuer: "innenausbau" },
  { id: "UNI", name: "Universal", Rk: 0.50, gM: 2.0, fuer: "alle" },
];

/**
 * Vollstaendige Aufbau-Berechnung aus Wandelement + Aufbau-Eingaben.
 * @param {object} w Wandelement (Single Source of Truth)
 * @param {object} a Aufbau-Eingaben (eingaben.aufbau; siehe storage.standardEingaben)
 * @returns {object} { B,H, feld, xs, ys, pts, nutRaster, layout, batt, auslastung }
 */
export function berechneAufbau(w, a) {
  const panel = a.panel || {}, achsen = a.achsen || {}, verb = a.verbinder || {}, latten = a.latten || {};
  const seite = a.seite || "vorne";
  const B = w.length_mm / 10, H = w.height_mm / 10;   // cm
  const ops = (w.openings || []).map(o => ({ x0: o.g0 * 12.5, x1: o.g1 * 12.5, y0: o.l0 * 20, y1: o.l1 * 20, art: o.art }));
  const ovl = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const F = a.feld_cm || null;
  const fx0 = F ? Math.max(0, F.x0) : 0, fx1 = F ? Math.min(B, F.x1) : B;
  const fy0 = F ? Math.max(0, F.y0) : 0, fy1 = F ? Math.min(H, F.y1) : H;
  const relSteps = (w.steps || []).filter(st => (st.height_mm / 10) < fy1 - 1e-6 && ovl(st.x0_mm / 10, st.x1_mm / 10, fx0, fx1) > 1e-6);
  const steps = relSteps.map(st => ({ x0: st.x0_mm / 10 - 0.1, x1: st.x1_mm / 10, y0: st.height_mm / 10, y1: H, art: "_step" }));
  const opsEff = ops.concat(steps);
  const localTop = x => { for (const st of relSteps) { const A = st.x0_mm / 10, Bx = st.x1_mm / 10; if (x >= A - 1e-6 && x < Bx - 1e-6) return st.height_mm / 10; } return H; };
  const axisTop = x => Math.max(localTop(x - 0.5), localTop(x), localTop(x + 0.5));
  const xEdges = []; ops.forEach(o => { xEdges.push(o.x0, o.x1); }); relSteps.forEach(st => { xEdges.push(st.x0_mm / 10, st.x1_mm / 10); });
  const yEdges = []; ops.forEach(o => { if (o.y0 > 0) yEdges.push(o.y0); if (o.y1 < H) yEdges.push(o.y1); }); relSteps.forEach(st => { const t = st.height_mm / 10; if (t > 0 && t < H) yEdges.push(t); });
  const pB = +panel.b_cm || 62.5, pH = +panel.h_cm || 150, oX = +panel.off_x_cm || 0, oY = +panel.off_y_cm || 0;
  const xs = nutAxes(fx0, fx1, pB, oX, +achsen.max_x_cm || 62.5, xEdges, B, w);
  const ys = snapCourses(axesRange(fy0, fy1, pH, oY, +achsen.max_y_cm || 75, yEdges), fy0, fy1);
  const maxOh = +achsen.ohang_cm || 12.5;
  const ohL = +(xs[0] - fx0).toFixed(2), ohR = +(fx1 - xs[xs.length - 1]).toFixed(2);
  const ohWarn = ohL > maxOh + 1e-6 || ohR > maxOh + 1e-6;
  const inOpen = (x, y) => ops.some(o => x > o.x0 + 1e-6 && x < o.x1 - 1e-6 && y > o.y0 + 1e-6 && y < o.y1 - 1e-6);
  const stat = x => nutStatus(w, x);
  const pts = [];
  for (const x of xs) { const t = stat(x) === "cont" ? "C" : "I"; for (const y of ys) if (y <= axisTop(x) + 1e-6 && !inOpen(x, y)) pts.push({ x_cm: x, nut_cm: x, y_cm: y, type: t }); }
  const nutRaster = [];
  for (let x = NUTS; x <= B - NUTS + 1e-6; x += NUTS) { const t = stat(+x.toFixed(2)); if (t === "cont" || t === "stagger") nutRaster.push({ x_cm: +x.toFixed(2), status: t }); }
  const Rd = (+verb.Rk || 0.5) / (+verb.gM || 2.0);
  const coeff = (+verb.gQ || 1.5) * (+verb.wk || 0.8);
  let area = ((fx1 - fx0) / 100) * ((fy1 - fy0) / 100) - opsEff.reduce((s, o) => s + (ovl(o.x0, o.x1, fx0, fx1) / 100) * (ovl(o.y0, o.y1, fy0, fy1) / 100), 0);
  area = Math.max(0.01, area);
  const atReal = area / Math.max(1, pts.length); const util = coeff > 0 ? coeff * atReal / Rd : 0; const ok = util <= 1 + 1e-9;
  const layout = {
    format: "SEMBLA-VerbinderLayout", version: "2.0",
    wall: { B_cm: B, H_cm: H, name: (w.name || null) }, openings_cm: ops,
    uk: { sx_cm: null, sy_cm: null }, seite,
    seite_funktion: (w.sides && w.sides[seite] && w.sides[seite].funktion) || null,
    verbinder_typ: verb.typ || null, panel: { b_cm: pB, h_cm: pH },
    feld_cm: F ? { x0: fx0, x1: fx1, y0: fy0, y1: fy1 } : null,
    points: pts,
  };
  const batt = layoutToBattens(layout, { stockCm: +latten.stange_cm || 150, clipY: [fy0, fy1], axisTop });
  return {
    w, B, H, fx0, fx1, fy0, fy1, xs, ys, pts, nutRaster, steps, relSteps, localTop, axisTop,
    layout, batt, atReal, util, ok, ohL, ohR, maxOh, ohWarn,
  };
}
