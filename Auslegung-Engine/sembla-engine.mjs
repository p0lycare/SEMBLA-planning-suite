// @ts-check
/**
 * SEMBLA Auslegungs-Engine — schließt die Statik-Iterationsschleife.
 * autoAuslegung: optimiert Strangabstand (grob→fein) UND Vorspannkraft N (min Material),
 *   bis alle Nachweise erfüllt sind (maßgebender Nachweis treibt).
 * nachweisPruefen: reiner Nachweis-Modus für eine fest vorgegebene Auslegung.
 * Module bleiben rein/einbahnig; nur die Engine kennt die Schleife.
 */
import { buildWall } from "../docs/shared/sembla-core.js";
import { nachweiseWand } from "../Modul-3-Statik/sembla-statik.mjs";

const DEF_MAT = { fcd_Nmm2: 20.0, cfd: 0.6, rho: 14.0 };   // Platzhalter — vom Statiker/Polycare zu bestätigen

function geomOf(w) { return { H_m: w.height_mm / 1000, L_m: w.length_mm / 1000, t_m: w.thickness_mm / 1000 }; }
function pruefe(w, vorg, N) {
  const m = { ...DEF_MAT, ...(vorg.material || {}) };
  return nachweiseWand({ ...geomOf(w), qk_area: vorg.load.qk_area, gammaQ: vorg.load.gammaQ,
    strands: w.tension_columns.filter(c => c.durchgehend).length, force_kN: N, ...m });
}
function rodOf(vorg) { return vorg.prestress && vorg.prestress.rod_mm; }
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

/** Nachweis-Modus: feste Auslegung (max_span_grid + force_kN) nur prüfen. */
export function nachweisPruefen(vorg) {
  const sp = (vorg.prestress && vorg.prestress.max_span_grid) || 3;
  const N = (vorg.prestress && vorg.prestress.force_kN) || 0;
  const w = buildWall(vorg.name, vorg.length_mm, vorg.height_mm, vorg.openings || [], vorg.sides, psOf(vorg, { max_span_grid: sp, force_kN: N }), stepsOf(vorg));
  const c = pruefe(w, vorg, N);
  w.verification = { status: c.ok ? "geprüft" : "nicht erfüllt", auslegung: { max_span_grid: sp, force_kN: N, strands: w.tension_columns.filter(c => c.durchgehend).length }, nachweise: c.checks, governing: c.governing, material: { ...DEF_MAT, ...(vorg.material || {}) }, modus: "nachweis" };
  return { wandelement: w, status: c.ok ? "erfüllt" : "nicht erfüllt", nachweis: c };
}

function range(a, b, s) { const r = []; for (let v = a; v <= b + 1e-9; v += s) r.push(+v.toFixed(3)); return r; }
