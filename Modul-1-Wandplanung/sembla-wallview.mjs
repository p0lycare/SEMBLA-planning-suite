// @ts-check
/**
 * SEMBLA Wand-Elevation-Renderer (Modul 1) — geteilter UI-Baustein.
 * Wortgetreu aus SEMBLA_Wandplanung.html (draw() + dimLayer()) portiert, aber DOM-frei:
 * gibt den SVG-Innen-String für ein Wandelement zurück. So teilen sich Modul 1 und die
 * Etappe-A-App dieselbe Zeichnung (keine Zweitlogik).
 *
 * drawWall(w, opts) -> { svg, viewBoxH, lastdraw }
 *   opts: view 'vorne'|'hinten', showDim, showRaster, editMode (Durchbruch-Zellen),
 *         axisEdit, selAxis (k), header (bool)
 */
const GRID = 125, COURSE = 200;
const fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

export function drawWall(w, opts = {}) {
  const o = Object.assign({ view: 'vorne', showDim: false, showRaster: false, editMode: false, axisEdit: false, selAxis: null, header: true }, opts);
  const showDim = o.showDim, showRaster = o.showRaster;
  const pad = 46, L = w.length_mm, H = w.height_mm;
  const sc = (1000 - 2 * pad) / L, wPx = L * sc, hPx = H * sc;
  const viewBoxH = Math.round(hPx + 2 * pad);
  const back = o.view === 'hinten';
  const X = p => pad + (back ? (L - p) : p) * sc, Y = y => pad + (hPx - y * sc);
  const lastdraw = { pad, sc, L, back, N: w.N_grid, hPx, viewBoxH, W: 1000, H };

  // ---- Bemaßungsschicht ----
  function dimLayer() {
    if (!showDim && !showRaster) return '';
    const C = '#46505e', A = '#c9461c', G = '#9aa3ad', STP = '#0a7f8c';
    const mC = mm => fmt(mm / 10, (mm / 10) % 1 !== 0 ? 1 : 0) + ' cm';
    const mM = mm => fmt(mm / 1000, 2) + ' m';
    const tk = (x, y, v) => v ? `<line x1="${x - 3}" y1="${y - 3}" x2="${x + 3}" y2="${y + 3}" stroke="${C}" stroke-width="1"/>`
      : `<line x1="${x - 3}" y1="${y + 3}" x2="${x + 3}" y2="${y - 3}" stroke="${C}" stroke-width="1"/>`;
    const lab = (x, y, t, c) => `<rect x="${x - (t.length * 2.9 + 3)}" y="${y - 9.6}" width="${t.length * 5.8 + 6}" height="11" rx="1.5" fill="#fff" fill-opacity="0.82"/><text x="${x}" y="${y - 1.5}" font-size="9" fill="${c || C}" text-anchor="middle">${t}</text>`;
    const hD = (ax, bx, yp, t, c) => { const cc = c || C; return `<line x1="${ax}" y1="${yp}" x2="${bx}" y2="${yp}" stroke="${cc}" stroke-width="1"/>` + tk(ax, yp) + tk(bx, yp) + lab((ax + bx) / 2, yp, t, cc); };
    const vD = (ay, by, xp, t, c) => { const cc = c || C; const m = (ay + by) / 2; return `<line x1="${xp}" y1="${ay}" x2="${xp}" y2="${by}" stroke="${cc}" stroke-width="1"/>` + tk(xp, ay, 1) + tk(xp, by, 1) + `<text x="${xp - 3.5}" y="${m + 3}" font-size="9" fill="${cc}" text-anchor="middle" transform="rotate(-90 ${xp - 3.5} ${m + 3})">${t}</text>`; };
    let s = '';
    const left0 = pad, right0 = pad + wPx, top0 = pad, bot0 = pad + hPx;
    if (showRaster) {
      for (let gx = 0; gx <= L + 1e-6; gx += GRID) { const x = X(gx); s += `<line x1="${x}" y1="${top0}" x2="${x}" y2="${bot0}" stroke="${G}" stroke-width="0.6" stroke-opacity="0.3"/>`; }
      for (let gy = 0; gy <= H + 1e-6; gy += COURSE) { const y = Y(gy); s += `<line x1="${left0}" y1="${y}" x2="${right0}" y2="${y}" stroke="${G}" stroke-width="0.6" stroke-opacity="0.3"/>`; }
      s += `<text x="${right0 - 2}" y="${top0 + 10}" font-size="8.5" fill="${G}" text-anchor="end">Raster 12,5 × 20 cm</text>`;
    }
    if (showDim) {
      s += hD(left0, right0, bot0 + 24, mM(L));
      s += vD(top0, bot0, left0 - 24, mM(H));
      for (const op of w.openings) {
        const x0 = op.g0 * GRID, x1 = op.g1 * GRID, y0 = op.l0 * COURSE, y1 = op.l1 * COURSE;
        const L_ = Math.min(X(x0), X(x1)), R_ = Math.max(X(x0), X(x1)), T_ = Y(y1), B_ = Y(y0);
        s += hD(L_, R_, T_ - 7, mC(x1 - x0), A);
        s += vD(T_, B_, L_ - 7, mC(y1 - y0), A);
        if (y0 > 1e-6) s += vD(B_, bot0, L_ - 7, mC(y0), A);
        s += hD(left0, L_, bot0 + 10, mC((L_ - left0) / sc), A);
      }
      for (const st of (w.steps || [])) {
        const L_ = Math.min(X(st.x0_mm), X(st.x1_mm)), R_ = Math.max(X(st.x0_mm), X(st.x1_mm)), T_ = Y(st.height_mm);
        s += hD(L_, R_, T_ - 7, mC(st.x1_mm - st.x0_mm), STP);
        s += vD(T_, bot0, R_ + 7, mC(st.height_mm), STP);
      }
    }
    return s;
  }

  let s = '';
  // Steine
  for (const c of w.courses) { const y0 = c.lage * COURSE, y1 = (c.lage + 1) * COURSE;
    for (const st of c.stones) { const fill = st.type === 'i3' ? '#cfd3d8' : '#bcc2c9'; const lx = Math.min(X(st.x0), X(st.x1));
      s += `<rect x="${lx}" y="${Y(y1)}" width="${(st.x1 - st.x0) * sc}" height="${COURSE * sc}" fill="${fill}" stroke="#aeb3ba" stroke-width="1"/>`;
      if ((st.x1 - st.x0) * sc > 26 && COURSE * sc > 13) s += `<text x="${X((st.x0 + st.x1) / 2)}" y="${Y((y0 + y1) / 2) + 3.5}" font-size="9.5" fill="#8f96a0" text-anchor="middle">${st.type}</text>`; } }
  // Öffnungen
  for (const op of w.openings) { const ox = Math.min(X(op.g0 * GRID), X(op.g1 * GRID)), oy = Y(op.l1 * COURSE), ow = (op.g1 - op.g0) * GRID * sc, oh = (op.l1 - op.l0) * COURSE * sc;
    s += `<rect x="${ox}" y="${oy}" width="${ow}" height="${oh}" fill="#fff" stroke="#c9461c" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    s += `<text x="${ox + ow / 2}" y="${oy + oh / 2 + 4}" font-size="11" fill="#c9461c" text-anchor="middle">${op.art === 'fenster' ? 'Fenster' : (op.art === 'durchbruch' ? 'Durchbruch' : 'Tür')}</text>`; }
  // gestufte Oberkante + Umriss
  const N2 = w.length_mm / GRID;
  const topH = k => { const xc = (k + 0.5) * GRID; for (const st of (w.steps || [])) { if (xc >= st.x0_mm && xc < st.x1_mm) return st.height_mm; } return H; };
  { const pts = [[0, 0], [0, topH(0)]];
    for (let k = 0; k < N2; k++) { pts.push([(k + 1) * GRID, topH(k)]); if (k < N2 - 1 && topH(k + 1) !== topH(k)) pts.push([(k + 1) * GRID, topH(k + 1)]); }
    pts.push([w.length_mm, 0]); pts.push([0, 0]);
    s += `<polyline points="${pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" fill="none" stroke="#13202e" stroke-width="2"/>`; }
  // Anschlüsse: Bodenblech + Kopfblech
  const topConn = (w.prestress && w.prestress.top_connection) || 'blech';
  const blMm = (w.prestress && w.prestress.blech_mm) || 1000;
  const STEEL = '#5b6673', SPANN = '#e8702a', NUT = '#0b3a73';
  const bth = Math.max(4, 15 * sc);
  const xL = Math.min(X(0), X(L)), xR = Math.max(X(0), X(L));
  s += `<rect x="${xL}" y="${Y(0)}" width="${xR - xL}" height="${bth}" fill="${STEEL}" stroke="#3a4350" stroke-width="0.8"/>`;
  for (let xx = blMm; xx < L - 1; xx += blMm) s += `<line x1="${X(xx)}" y1="${Y(0)}" x2="${X(xx)}" y2="${Y(0) + bth}" stroke="#cfd7df" stroke-width="0.8"/>`;
  s += `<text x="${xL + 3}" y="${Y(0) + bth - 2}" font-size="8" fill="#eef2f6">Bodenblech 15 mm</text>`;
  if (topConn === 'blech') { for (let k = 0; k < N2; k++) { const h = topH(k); if (h <= 0) continue; const lx = Math.min(X(k * GRID), X((k + 1) * GRID));
      s += `<rect x="${lx}" y="${Y(h) - bth}" width="${GRID * sc}" height="${bth}" fill="${STEEL}" stroke="#3a4350" stroke-width="0.6"/>`; } }
  // Vorspannstränge + Anker
  for (const col of w.tension_columns) { const x = X(col.x_mm);
    for (const g of col.segments) {
      s += `<line x1="${x}" y1="${Y(g.z0_mm)}" x2="${x}" y2="${Y(g.z1_mm)}" stroke="#1f6feb" stroke-width="2"/>`;
      const pw = 110 * sc;
      const au = g.anker_unten || (g.z0_mm === 0 ? 'bodenblech' : 'spannplatte');
      const ao = g.anker_oben || ((g.z1_mm === topH(col.k) * 1) ? topConn : 'spannplatte');
      if (au === 'bodenblech') s += `<circle cx="${x}" cy="${Y(g.z0_mm)}" r="3.2" fill="${NUT}"/>`;
      else s += `<rect x="${x - pw / 2}" y="${Y(g.z0_mm) - 3.5}" width="${pw}" height="3.5" rx="1" fill="${SPANN}"/>`;
      if (ao === 'spannplatte') s += `<rect x="${x - pw / 2}" y="${Y(g.z1_mm)}" width="${pw}" height="3.5" rx="1" fill="${SPANN}"/>`;
      else s += `<circle cx="${x}" cy="${Y(g.z1_mm)}" r="2.6" fill="${NUT}"/>`;
    } }
  // Reihennummern
  for (let r = 0; r < w.lagen; r++) { const yc = Y((r + 0.5) * COURSE); s += `<text x="${pad - 10}" y="${yc + 3}" font-size="9" fill="#8f96a0" text-anchor="end">${r + 1}</text>`; }
  if (o.header) s += `<text x="${pad}" y="22" font-size="13" fill="#6b7682">${back ? 'Rückseite (gespiegelt)' : 'Vorderseite'} · ${fmt(L / 1000, 3)} × ${fmt(H / 1000, 2)} m · ${w.tension_columns.length} Stränge${w.prestress && w.prestress.force_kN != null ? ' · N=' + fmt(w.prestress.force_kN, 0) + ' kN' : ''}${o.editMode ? ' · Durchbruch-Modus' : ''}</text>`;
  // Durchbruch-Zellen (Edit)
  if (o.editMode) { const Ng = w.N_grid, Lg = w.lagen;
    for (let r = 0; r < Lg; r++) for (let c = 0; c < Ng; c++) { const lx = Math.min(X(c * GRID), X((c + 1) * GRID));
      s += `<rect class="cell" data-r="${r}" data-c="${c}" x="${lx}" y="${Y((r + 1) * COURSE)}" width="${GRID * sc}" height="${COURSE * sc}" fill="transparent" stroke="#1f6feb" stroke-opacity="0.18" stroke-width="0.6" style="cursor:pointer"/>`; } }
  // Spannachsen-Griffe (Edit) — mit data-k für Drag in der App
  if (o.axisEdit) { for (const col of w.tension_columns) { const x = X(col.x_mm); const on = (o.selAxis === col.k);
      s += `<line x1="${x}" y1="${Y(0)}" x2="${x}" y2="${Y(H)}" stroke="${on ? '#c9461c' : '#1f6feb'}" stroke-width="${on ? 3 : 2}" stroke-opacity="0.9"/>`;
      s += `<circle data-k="${col.k}" cx="${x}" cy="${Y(H) - 6}" r="6" fill="${on ? '#c9461c' : '#1f6feb'}" stroke="#fff" stroke-width="1.5" style="cursor:grab"/>`;
      s += `<text x="${x}" y="${Y(H) - 14}" font-size="9" fill="${on ? '#c9461c' : '#1f6feb'}" text-anchor="middle">${fmt(col.x_mm / 10, 1)}</text>`; } }
  s += dimLayer();
  return { svg: s, viewBoxH, lastdraw };
}
