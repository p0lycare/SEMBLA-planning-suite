// @ts-check
/**
 * SEMBLA Auslegungs-Engine — schliesst die Statik-Iterationsschleife (Modul 1).
 *
 * Enthaelt das vereinfachte, vorspann-abhaengige Auslegungs-Nachweismodell
 * (Biegung / Randdruck / Schub-Reibung) UND die Optimierungsschleife. Dieses
 * Modell ist bewusst getrennt vom ausfuehrlichen Schermer-Nachweis (Modul 3,
 * `sembla-statik`): hier wird nur so weit gerechnet, wie die Auto-Auslegung es
 * zum Optimieren braucht. Materialannahmen (f_cd, C_f,d, rho) sind Platzhalter,
 * vom Statiker/Polycare zu bestaetigen.
 *
 *   autoAuslegung(vorg)   optimiert Strangabstand (grob->fein) UND Vorspannkraft N
 *                         (min. Material), bis alle Nachweise erfuellt sind.
 *   nachweisPruefen(vorg) reiner Nachweis-Modus fuer eine feste Auslegung.
 *
 * Module bleiben rein/einbahnig; nur die Engine kennt die Schleife.
 * ES-Modul: laeuft im Browser (GH Pages) und in den Node-Tests per import.
 */
import { buildWall } from "./sembla-core.js";

// ==== Vereinfachtes Auslegungs-Nachweismodell ============================

/**
 * Vorspann-abhaengiger Biegenachweis (klaffende Fuge / Kernmoment) gegen Horizontallast.
 * Vertikal spannende Wand, gelenkig; Vorspannung erzeugt Druck sigma = N_ges/(L·t).
 * Widerstand (keine Zugspannung in der Lagerfuge): M_R = sigma·W, W = L·t²/6.
 * Einwirkung (Flaechenlast q ueber Hoehe H, Einfeldtraeger): M_Ed = q·L·H²/8.
 * p: H_m, L_m, t_m, qk_area (kN/m²), gammaQ, strands, force_kN (je Strang).
 */
export function vorspannBiegung(p) {
  const N_total = p.strands * (p.force_kN || 0);     // kN
  const A = p.L_m * p.t_m;                            // m²
  const sigma = A > 0 ? N_total / A : 0;             // kN/m² (Druckvorspannung)
  const W = p.L_m * p.t_m * p.t_m / 6;               // m³
  const M_R = sigma * W;                             // kNm
  const q = (p.gammaQ ?? 1.5) * p.qk_area;           // kN/m² (Bemessung)
  const M_Ed = q * p.L_m * p.H_m * p.H_m / 8;        // kNm
  return { sigma_kNm2: +sigma.toFixed(1), M_R: +M_R.toFixed(3), M_Ed: +M_Ed.toFixed(3),
           util: M_R > 0 ? +(M_Ed / M_R).toFixed(3) : Infinity, ok: M_Ed <= M_R + 1e-9 };
}

/** Randdruckspannung: sigma_max = N/A + M/W <= f_cd. p zusaetzlich: fcd_Nmm2. */
export function randDruck(p) {
  const N = p.strands * (p.force_kN || 0);           // kN
  const A = p.L_m * p.t_m;                            // m²
  const W = p.L_m * p.t_m * p.t_m / 6;               // m³
  const q = (p.gammaQ ?? 1.5) * p.qk_area;           // kN/m²
  const M = q * p.L_m * p.H_m * p.H_m / 8;           // kNm
  const sigma_kNm2 = (A > 0 ? N / A : 0) + (W > 0 ? M / W : 0);
  const sigma = sigma_kNm2 / 1000;                   // N/mm²
  const fcd = p.fcd_Nmm2 ?? 20.0;
  return { sigma_Nmm2: +sigma.toFixed(2), fcd, util: +(sigma / fcd).toFixed(3), ok: sigma <= fcd + 1e-9 };
}

/** Schub/Reibung in der Lagerfuge: V_Ed = q·L·H/2 <= Cf,d·(N + Eigengewicht). p zusaetzlich: cfd, rho. */
export function schubReibung(p) {
  const N = p.strands * (p.force_kN || 0);
  const G = (p.rho ?? 14.0) * p.t_m * p.L_m * p.H_m; // kN Eigengewicht
  const cfd = p.cfd ?? 0.6;
  const VR = cfd * (N + G);
  const q = (p.gammaQ ?? 1.5) * p.qk_area;
  const VEd = q * p.L_m * p.H_m / 2;
  return { V_Ed: +VEd.toFixed(2), V_R: +VR.toFixed(2), util: VR > 0 ? +(VEd / VR).toFixed(3) : Infinity, ok: VEd <= VR + 1e-9 };
}

/** Alle vorspann-abhaengigen Wandnachweise; liefert den massgebenden. */
export function nachweiseWand(p) {
  const biegung = vorspannBiegung(p), randdruck = randDruck(p), schub = schubReibung(p);
  let gov = { name: "biegung", util: biegung.util };
  if (randdruck.util > gov.util) gov = { name: "randdruck", util: randdruck.util };
  if (schub.util > gov.util) gov = { name: "schub", util: schub.util };
  return { checks: { biegung, randdruck, schub }, governing: gov, ok: biegung.ok && randdruck.ok && schub.ok };
}

// ==== Optimierungsschleife ================================================

const DEF_MAT = { fcd_Nmm2: 20.0, cfd: 0.6, rho: 14.0 };   // Platzhalter — vom Statiker/Polycare zu bestaetigen

function geomOf(w) { return { H_m: w.height_mm / 1000, L_m: w.length_mm / 1000, t_m: w.thickness_mm / 1000 }; }
function pruefe(w, vorg, N) {
  const m = { ...DEF_MAT, ...(vorg.material || {}) };
  return nachweiseWand({ ...geomOf(w), qk_area: vorg.load.qk_area, gammaQ: vorg.load.gammaQ,
    strands: w.tension_columns.filter(c => c.durchgehend).length, force_kN: N, ...m });
}
function stepsOf(vorg) { return vorg.steps || []; }
// Prestress-Durchreiche: Hardware-Felder (rod_mm, blech_mm, top_connection) bleiben erhalten
function psOf(vorg, extra) { const p = vorg.prestress || {};
  return { ...extra, rod_mm: p.rod_mm, blech_mm: p.blech_mm, top_connection: p.top_connection, columns_grid: p.columns_grid }; }
function buildN(vorg, sp) {
  return buildWall(vorg.name, vorg.length_mm, vorg.height_mm, vorg.openings || [], vorg.sides, psOf(vorg, { max_span_grid: sp }), stepsOf(vorg));
}

/** Optimierung: min. Material (zuerst Strangabstand grob, dann kleinste passende Kraft N). */
export function autoAuslegung(vorg) {
  const kand = vorg.kandidaten || [3, 2, 1];
  const fixedN = vorg.prestress && vorg.prestress.force_kN;
  const Nr = vorg.Nrange || { min: 10, max: 150, step: 5 };
  const Ns = fixedN != null ? [fixedN] : range(Nr.min, Nr.max, Nr.step);
  const log = []; let last = null;
  for (const sp of kand) {
    const w = buildN(vorg, sp); const strands = w.tension_columns.filter(c => c.durchgehend).length;
    let hit = null;
    for (const N of Ns) { const c = pruefe(w, vorg, N); last = { sp, strands, N, c }; if (c.ok) { hit = { N, c }; break; } }
    log.push({ max_span_grid: sp, strands, N: hit ? hit.N : null, util: hit ? hit.c.governing.util : (last ? last.c.governing.util : null), governing: hit ? hit.c.governing.name : null, ok: !!hit });
    if (hit) {
      const wf = buildWall(vorg.name, vorg.length_mm, vorg.height_mm, vorg.openings || [], vorg.sides, psOf(vorg, { max_span_grid: sp, force_kN: hit.N }), stepsOf(vorg));
      wf.verification = { status: "geprüft", auslegung: { max_span_grid: sp, force_kN: hit.N, strands }, nachweise: hit.c.checks, governing: hit.c.governing, material: { ...DEF_MAT, ...(vorg.material || {}) }, iterationen: log.length };
      return { wandelement: wf, status: "konvergiert", iterationen: log };
    }
  }
  const wf = buildWall(vorg.name, vorg.length_mm, vorg.height_mm, vorg.openings || [], vorg.sides, psOf(vorg, { max_span_grid: kand[kand.length - 1], force_kN: last.N }), stepsOf(vorg));
  wf.verification = { status: "nicht erfüllt", auslegung: { max_span_grid: last.sp, force_kN: last.N, strands: last.strands }, nachweise: last.c.checks, governing: last.c.governing, material: { ...DEF_MAT, ...(vorg.material || {}) }, iterationen: log.length };
  return { wandelement: wf, status: "nicht erfüllt", iterationen: log };
}

/** Nachweis-Modus: feste Auslegung (max_span_grid + force_kN) nur pruefen. */
export function nachweisPruefen(vorg) {
  const sp = (vorg.prestress && vorg.prestress.max_span_grid) || 3;
  const N = (vorg.prestress && vorg.prestress.force_kN) || 0;
  const w = buildWall(vorg.name, vorg.length_mm, vorg.height_mm, vorg.openings || [], vorg.sides, psOf(vorg, { max_span_grid: sp, force_kN: N }), stepsOf(vorg));
  const c = pruefe(w, vorg, N);
  w.verification = { status: c.ok ? "geprüft" : "nicht erfüllt", auslegung: { max_span_grid: sp, force_kN: N, strands: w.tension_columns.filter(c => c.durchgehend).length }, nachweise: c.checks, governing: c.governing, material: { ...DEF_MAT, ...(vorg.material || {}) }, modus: "nachweis" };
  return { wandelement: w, status: c.ok ? "erfüllt" : "nicht erfüllt", nachweis: c };
}

function range(a, b, s) { const r = []; for (let v = a; v <= b + 1e-9; v += s) r.push(+v.toFixed(3)); return r; }
