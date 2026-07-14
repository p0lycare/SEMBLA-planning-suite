// @ts-check
/**
 * SEMBLA Latten-Planung (Innenausbau-UK).
 * Plant vertikale Holzlatten entlang der Verbinderachsen und erstellt eine Stückliste.
 * Eingabe: Verbinder-Layout aus Modul 2 (lastabhängige Verteilung, inkl. Öffnungen).
 *
 * Regeln:
 *  - Latten verlaufen vertikal auf den Verbinderachsen.
 *  - Latten werden an Öffnungen ABGESCHNITTEN (nie über Tür/Fenster gezogen).
 *  - Stöße liegen ZWISCHEN zwei Verbindern (mittig), nie auf einem Verbinder.
 *  - Jede Latte ist an mindestens einem Verbinder fixiert; Stücklänge ≤ Lattenlänge.
 *  - Reststücke werden über alle Achsen wiederverwendet (1D-Zuschnitt).
 * Einheiten: cm.
 */

function cuttingStock(pieces, stock) {
  const sorted = [...pieces].sort((a, b) => b - a);
  const remn = []; let stockCount = 0;
  for (const p of sorted) {
    let bi = -1, bv = Infinity;
    for (let i = 0; i < remn.length; i++) if (remn[i] >= p - 1e-6 && remn[i] < bv) { bv = remn[i]; bi = i; }
    if (bi >= 0) remn[bi] = +(remn[bi] - p).toFixed(3);
    else { stockCount++; remn.push(+(stock - p).toFixed(3)); }
  }
  const used = pieces.reduce((a, b) => a + b, 0);
  const total = stockCount * stock;
  return { stockCount, usedLen: +used.toFixed(3), totalLen: +total.toFixed(3), wasteLen: +(total - used).toFixed(3), remnants: remn.filter(r => r > 1e-6) };
}

/** Teilt ein solides Intervall [S,E] in Latten ≤ stock; Stöße mittig zwischen Verbindern. */
function splitInterval(S, E, conns, stock) {
  const segs = [];
  if (E - S <= stock + 1e-6) { segs.push({ y0: S, y1: E }); return segs; }
  let start = S, i = 0;
  let guard = 0;
  while (guard++ < 10000) {
    if (E - start <= stock + 1e-6) { segs.push({ y0: start, y1: E }); break; }
    let chosen = -1;
    for (let j = i; j < conns.length - 1; j++) {
      const joint = (conns[j] + conns[j + 1]) / 2;
      if (joint - start <= stock + 1e-6) chosen = j; else break;
    }
    let joint;
    if (chosen < 0) { joint = +(start + stock).toFixed(3); }      // Fallback: Schnitt ohne nahen Verbinder
    else joint = +((conns[chosen] + conns[chosen + 1]) / 2).toFixed(3);
    segs.push({ y0: start, y1: joint });
    start = joint;
    while (i < conns.length && conns[i] < joint) i++;
  }
  return segs;
}

/** Solide Höhen-Intervalle einer Achse x = [0,H] minus der dort aktiven Öffnungen. */
function solidIntervals(x, ops, H) {
  const blocks = (ops || []).filter(o => x > o.x0 + 1e-6 && x < o.x1 - 1e-6).map(o => [o.y0, o.y1]).sort((a, b) => a[0] - b[0]);
  const iv = []; let cur = 0;
  for (const [a, b] of blocks) { if (a > cur + 1e-6) iv.push([cur, a]); cur = Math.max(cur, b); }
  if (H - cur > 1e-6) iv.push([cur, H]);
  return iv;
}

/** Plant Latten aus einem Verbinder-Layout. opts: widthCm (4), stockCm (150), insulation (bool), thicknessCm. */
export function layoutToBattens(layout, opts = {}) {
  const stock = opts.stockCm ?? 150;
  const widthCm = opts.widthCm ?? 4;
  const H = (layout.wall && layout.wall.H_cm) || 0;
  const ops = layout.openings_cm || [];
  const byX = new Map();
  for (const p of layout.points || []) {
    const k = +(+p.x_cm).toFixed(2);
    if (!byX.has(k)) byX.set(k, new Set());
    byX.get(k).add(+(+p.y_cm).toFixed(2));
  }
  const axes = []; const pieces = []; let warnings = 0;
  for (const x of [...byX.keys()].sort((a, b) => a - b)) {
    const ys = [...byX.get(x)].sort((a, b) => a - b);
    // solide Intervalle = [0,H] minus der an dieser Achse aktiven Öffnungen
    const intervals = solidIntervals(x, ops, H);
    const segs = [];
    for (const [S, E] of intervals) {
      const conns = ys.filter(y => y > S + 1e-6 && y < E - 1e-6);
      if (conns.length === 0) { warnings++; continue; }            // kein Verbinder -> keine fixierbare Latte
      for (const sg of splitInterval(S, E, conns, stock)) {
        const len = +(sg.y1 - sg.y0).toFixed(2);
        const fix = conns.filter(y => y > sg.y0 - 1e-6 && y < sg.y1 + 1e-6).length;
        segs.push({ y0_cm: +sg.y0.toFixed(2), y1_cm: +sg.y1.toFixed(2), len_cm: len, fixings: fix });
        pieces.push(len);
      }
    }
    axes.push({ x_cm: x, n_connectors: ys.length, segments: segs, runLen_cm: +segs.reduce((a, s) => a + s.len_cm, 0).toFixed(2) });
  }
  const cutting = cuttingStock(pieces, stock);
  // Dämmpakete je Gefach (zwischen benachbarten Latten), an Öffnungen geschnitten
  let daemmung = null;
  if (opts.insulation) {
    const th = opts.thicknessCm || 0;
    const xs = axes.map(a => a.x_cm); const bays = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const clear = +(xs[i + 1] - xs[i] - widthCm).toFixed(2);
      if (clear <= 0.01) continue;
      const midx = (xs[i] + xs[i + 1]) / 2;
      const segs = solidIntervals(midx, ops, H).map(([S, E]) => ({ y0_cm: +S.toFixed(2), y1_cm: +E.toFixed(2), h_cm: +(E - S).toFixed(2) }));
      const area = +segs.reduce((a, sg) => a + (clear / 100) * (sg.h_cm / 100), 0).toFixed(3);
      bays.push({ x_left_cm: xs[i], x_right_cm: xs[i + 1], clear_cm: clear, segments: segs, area_m2: area });
    }
    daemmung = { thickness_cm: th, bays,
      total: { flaeche_m2: +bays.reduce((a, b) => a + b.area_m2, 0).toFixed(2), gefache: bays.length, segmente: bays.reduce((a, b) => a + b.segments.length, 0) } };
  }
  const summary = {
    achsen: axes.length,
    latten_stuecke: pieces.length,
    latten_15m_bedarf: cutting.stockCount,
    gesamtlaenge_m: +(cutting.totalLen / 100).toFixed(2),
    verbaute_laenge_m: +(cutting.usedLen / 100).toFixed(2),
    verschnitt_m: +(cutting.wasteLen / 100).toFixed(2),
    verschnitt_pct: cutting.totalLen ? +(100 * cutting.wasteLen / cutting.totalLen).toFixed(1) : 0,
    lattenbreite_cm: widthCm, lattenlaenge_cm: stock, warnungen: warnings,
  };
  return { wall: layout.wall || {}, seite: layout.seite || null, seite_funktion: layout.seite_funktion || null, openings_cm: ops, widthCm, stockCm: stock, axes, pieces, cutting, summary, daemmung };
}

/** Zuschnittliste als CSV. */
export function daemmungCsv(res) {
  const rows = [["gefach", "x_links_cm", "x_rechts_cm", "lichte_breite_cm", "dicke_cm", "flaeche_m2"]];
  if (res.daemmung) res.daemmung.bays.forEach((b, i) => rows.push([i + 1, b.x_left_cm, b.x_right_cm, b.clear_cm, res.daemmung.thickness_cm, b.area_m2]));
  return rows.map(r => r.join(";")).join("\n") + "\n";
}

export function battenCutListCsv(res) {
  const rows = [["achse_x_cm", "segment", "y0_cm", "y1_cm", "laenge_cm", "fixierungen"]];
  res.axes.forEach(a => a.segments.forEach((s, i) => rows.push([a.x_cm, i + 1, s.y0_cm, s.y1_cm, s.len_cm, s.fixings])));
  return rows.map(r => r.join(";")).join("\n") + "\n";
}
