// @ts-check
/**
 * SEMBLA Statik — Nachweis vorgespannter, nicht-tragender Trockenmauerwerkswände.
 * Grundlage: Gutachten Prof. Schermer (Az. 2025_7001 Rev 01 vom 18.05.2026),
 * Z-3.15-2157, DIN EN 1996-1-1, DIN 4103-1, DIN EN 1991-1-4.
 *
 * Portiert 1:1 aus der geprüften Arbeitsmappe „SEMBLA_Wand_Statik_v01.xlsx“.
 * Reine Funktionen (kein DOM). Einheiten: kN, m, mm, N/mm².
 *
 * Zwei Nachweiskomplexe:
 *   A) Wand      — Biegung, Schub, Druckrand, Bodenanschluss (Reibung), Deckenwinkel
 *   B) Spannsystem — Gewindestange, Kopplungsmutter, Spannschrauben, Kopf-/Fußplatte
 * Zusätzlich (nicht im Gutachten): Transport-/Hebezustand (Planungshilfe).
 */

/** Lineare Regression (Excel FORECAST): Kleinste-Quadrate-Gerade y(x) durch (xs,ys), Vorhersage bei x. */
export function forecastLin(x, xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return my - slope * mx + slope * x;
}

/** Bezugsgeschwindigkeitsdruck qb aus Windzone 1–4 (DIN EN 1991-1-4/NA). */
export function qbAusWLZ(wlz) { return [0.32, 0.39, 0.47, 0.56][Math.max(1, Math.min(4, wlz)) - 1]; }

/** A0) Lasten: Wind (qp, Innendruck Cpi) + Bemessungsflächenlast w_Ed. */
export function lasten(p) {
  const qb = qbAusWLZ(p.wlz);
  const qp = qb * (p.qpFaktor ?? 2.1);                 // Böengeschwindigkeitsdruck (vereinfacht)
  const CpiFaktor = p.torDominant ? 0.9 : 0.2;         // dominante Öffnung → 0,9·cpe,10, sonst ±0,2
  const Cpi = CpiFaktor * p.cpe10;
  const w_i = qp * Cpi;                                // Innendruck auf Innenwand
  const w_Ed = p.mitWind ? (p.gammaQ ?? 1.5) * w_i : 0;// Wind leitend
  return { qb, qp, Cpi, w_i, w_Ed };
}

/** A1) Vorspannung: F∞, Bemessungs-Vorspannkraft je m (günstig/ungünstig), M-Stab-Nachweis (Fließen). */
export function vorspannung(p) {
  const n = 1 / p.e_m;                                 // Stäbe je m
  const F_infty = p.F0 * (1 - p.deltaF);               // Restvorspannkraft je Stab
  const F_inf_ok = F_infty >= p.F_inf_min - 1e-9;
  const Nv_fav = F_infty * n / p.gammaP_fav;           // günstig (Biegung/Druck-Interpolation)
  const Nv_sup = p.F0 * n * p.gammaP_sup;              // ungünstig (Druckrand, Boden)
  // M-Stab: Zug aus Fließen des Gewindequerschnitts (γs), Info-Nachweis wie Deckblatt
  const Ft_Rd_yield = p.As * p.fyk_Stab / p.gamma_s / 1000;
  const Ft_Ed = p.F0 * p.gammaP_sup;
  const eta_Mstab = Ft_Ed / Ft_Rd_yield;
  return { n, F_infty, F_inf_ok, Nv_fav, Nv_sup, Ft_Rd_yield, Ft_Ed, eta_Mstab };
}

/** A2) Schnittgrößen Einfeldträger (l = Wandhöhe h), drei Lastfälle Wind / DIN 4103 Kat I / Kat II. */
export function schnittgroessen(p, L, V) {
  const h = p.h_m, a = p.a_4103, gQ = p.gammaQ ?? 1.5;
  const mEd_W = L.w_Ed * h ** 2 / 8;
  const vEd_W = L.w_Ed * h / 2;
  const mEd_I = gQ * p.q1_I * a * (h - a) / h;
  const vEd_I = gQ * p.q1_I * (h - a) / h;
  const mEd_II = gQ * p.q1_II * a * (h - a) / h;
  const vEd_II = gQ * p.q1_II * (h - a) / h;
  const mEd = Math.max(mEd_W, mEd_I, mEd_II);
  const vEd = Math.max(vEd_W, vEd_I, vEd_II);
  const N_Ed_Boden = V.Nv_sup + p.gamma_w * p.t_m * h; // Fußnormalkraft = Vorspannung(ungünstig) + Eigengewicht
  return { mEd_W, vEd_W, mEd_I, vEd_I, mEd_II, vEd_II, mEd, vEd, N_Ed_Boden };
}

/** A) Kompaktnachweis Wand. */
export function nachweisWand(p) {
  const L = lasten(p);
  const V = vorspannung(p);
  const S = schnittgroessen(p, L, V);

  // Biegung — m_Rk interpoliert aus Prüfwerten §6.2 über Nv,fav, γM=2,0.
  // Extrapolation abgesichert: über Prüfbereich wird die Tragfähigkeit auf den obersten
  // geprüften Punkt gekappt (kein Kredit jenseits der Versuche); unter Prüfbereich Warnung.
  const xs = p.pruef.map(q => q.Nv), ys = p.pruef.map(q => q.mRk);
  const NvMin = Math.min(...xs), NvMax = Math.max(...xs);
  let interpol = 'ok', m_Rk;
  if (V.Nv_fav > NvMax + 1e-9) { m_Rk = forecastLin(NvMax, xs, ys); interpol = 'above'; }
  else { m_Rk = forecastLin(V.Nv_fav, xs, ys); if (V.Nv_fav < NvMin - 1e-9) interpol = 'below'; }
  const m_Rd = m_Rk / p.gammaM_wand;
  const eta_Biegung = S.mEd / m_Rd;

  // Schub (Platte)
  const v_Rd = p.v_Rd;
  const eta_Schub = S.vEd / v_Rd;

  // Druckrand-Spannung
  const sig_Ed = V.Nv_sup / (p.t_m * 1000) + 6 * S.mEd / (p.t_m ** 2 * 1000);
  const sig_Rd = p.f_k / p.gammaM_wand;
  const eta_Druck = sig_Ed / sig_Rd;

  // Bodenanschluss — Reibung Stahl/Beton
  const mu_d = p.mu_k / p.gamma_mu;
  const V_Rd_Boden = mu_d * S.N_Ed_Boden;
  const eta_Boden = S.vEd / V_Rd_Boden;

  // Deckenanschluss — Anschlusskraft Stahlwinkel (Nachweis Winkel separat)
  const V_Winkel = S.vEd * p.eW_Winkel;
  const n_Winkel = Math.ceil(p.L_m / p.eW_Winkel) + 1;

  const eta_max = Math.max(eta_Biegung, eta_Schub, eta_Druck, eta_Boden);
  return {
    lasten: L, vor: V, schnitt: S,
    biegung: { m_Ed: S.mEd, m_Rk, m_Rd, eta: eta_Biegung, ok: eta_Biegung <= 1 + 1e-9, Nv: V.Nv_fav, NvMin, NvMax, interpol },
    schub: { v_Ed: S.vEd, v_Rd, eta: eta_Schub, ok: eta_Schub <= 1 + 1e-9 },
    druck: { sig_Ed, sig_Rd, eta: eta_Druck, ok: eta_Druck <= 1 + 1e-9 },
    boden: { mu_d, V_Ed: S.vEd, N_Ed: S.N_Ed_Boden, V_Rd: V_Rd_Boden, eta: eta_Boden, ok: eta_Boden <= 1 + 1e-9 },
    winkel: { V_Winkel, n_Winkel, eW: p.eW_Winkel },
    eta_max, ok: eta_max <= 1 + 1e-9,
  };
}

/** B) Kompaktnachweis Spannsystem (Bauteile). */
export function nachweisSpannsystem(p) {
  const L_span = p.t_m * 1000 - 2 * p.b_Steg;          // statische Spannweite Platte [mm]
  const Ft_Ed = p.F0 * p.gammaP_sup;                   // kN je Stab (ungünstig)
  const Rd_bolt = k2 => k2 * p.fub_Stab * p.As / p.gammaM2 / 1000; // kN

  const stange = { Ft_Ed, Ft_Rd: Rd_bolt(p.k2_SK), eta: Ft_Ed / Rd_bolt(p.k2_SK) };
  // M-Stab — Fließen des Gewindequerschnitts (A_s·f_yk/γ_s). Maßgebender Stangennachweis.
  const Ft_Rd_yield = p.As * p.fyk_Stab / p.gamma_s / 1000;
  const stangeYield = { Ft_Ed, Ft_Rd: Ft_Rd_yield, eta: Ft_Ed / Ft_Rd_yield };
  const spannSK = { Ft_Ed, Ft_Rd: Rd_bolt(p.k2_SK), eta: Ft_Ed / Rd_bolt(p.k2_SK) };
  const untenSK = { Ft_Ed, Ft_Rd: Rd_bolt(p.k2_SK), eta: Ft_Ed / Rd_bolt(p.k2_SK) };
  const untenSenk = { Ft_Ed, Ft_Rd: Rd_bolt(p.k2_Senk), eta: Ft_Ed / Rd_bolt(p.k2_Senk) };
  const mutter = { L_vorh: p.L_Mutter_vorh, L_min: p.L_Mutter_min, ok: p.L_Mutter_vorh >= p.L_Mutter_min };

  // Kopf-/Fußplatte: Einfeldträger auf 2 Stegen, mittige Punktlast F = F0·γP,sup
  const plattenNW = (b, t) => {
    const M_Ed = p.F0 * p.gammaP_sup * 1000 * L_span / 4;  // Nmm
    const W_el = b * t ** 2 / 6;                            // mm³
    const sig_Ed = M_Ed / W_el;                            // N/mm²
    const sig_Rd = p.fyk_Platte / p.gammaM0;
    return { M_Ed, W_el, sig_Ed, sig_Rd, eta: sig_Ed / sig_Rd };
  };
  const kopfplatte = plattenNW(p.b_KpO, p.t_KpO);
  const fussplatte = plattenNW(p.b_FpU, p.t_FpU);

  // Teilflächenpressung Stein unter der Ankerplatte: konzentrierte Stabkraft F auf die
  // Auflagerfläche der Platte über den Steinstegen (2 Stege × Auflagerlänge je Stab).
  // A_Stein = 2·b_Steg·l_Platte ; σ_Rd = f_k/γ_M (β = 1,0, konservativ; EC6 §6.1.3 erlaubt ggf. Erhöhung).
  const A_Stein = 2 * p.b_Steg * p.l_Platte;
  const sig_Stein = p.F0 * p.gammaP_sup * 1000 / A_Stein;
  const sigRd_Stein = p.f_k / p.gammaM_wand;
  const steinPressung = { F: p.F0 * p.gammaP_sup, A: A_Stein, l_Platte: p.l_Platte, sig_Ed: sig_Stein, sig_Rd: sigRd_Stein, eta: sig_Stein / sigRd_Stein };

  // η_max: maßgebender Stangennachweis (Fließen), SK-Schrauben, Platten, Steinpressung.
  // Senkschraube bleibt Warn-Alternative (nicht im Max).
  const eta_max = Math.max(stange.eta, stangeYield.eta, spannSK.eta, untenSK.eta, kopfplatte.eta, fussplatte.eta, steinPressung.eta);
  return {
    L_span, stange, stangeYield, mutter, spannSK, untenSK, untenSenk, kopfplatte, fussplatte, steinPressung,
    eta_max, ok: eta_max <= 1 + 1e-9,
  };
}

/** Wand-Eigengewicht als Streckenlast nEd [kN/m] = ρ·t·h. */
export function eigengewichtLinie(h_m, rho = 14.0, t_m = 0.125) { return rho * t_m * h_m; }

/** Z) Transport / Hebezustand — Last je Anschlagpunkt und Blech-Biegung (Planungshilfe, nicht Gutachten). */
export function transport(p) {
  const nEd = eigengewichtLinie(p.h_m, p.rho ?? 14.0, p.t_m ?? 0.125);
  const GEk = nEd * p.L_m / p.nAnker;
  const GEd = (p.gammaG ?? 1.35) * (p.dyn ?? 1.30) * GEk;
  const GEd_kg = GEd * 1000 / 9.81;
  const W = p.blechB_mm * p.blechT_mm * p.blechT_mm / 6;
  const MEd = GEd * p.hebelBlech_m / 4;
  const sigma = MEd * 1e6 / W;
  return { nEd, GEk, GEd, GEd_kg, W, MEd, sigma, util: sigma / p.fy, ok: sigma <= p.fy + 1e-9 };
}

/** Öffnungen: Zusatzstäbe + Gesamtanzahl Gewindestangen (Regelbereich, Start 2. Achse). */
export function oeffnungen(p) {
  const n_regel = Math.floor(p.L_m / p.e_m);
  const n_zusatz = p.n_oeff * p.zusatz_je_seite * 2;
  const n_gesamt = n_regel + n_zusatz;
  return { n_regel, n_zusatz, n_gesamt, ankerplatten: 2 * n_gesamt, muttern: 2 * n_gesamt };
}

/** Komplettnachweis aus einem Parametersatz. */
export function nachweise(p) {
  const wand = nachweisWand(p);
  const spann = nachweisSpannsystem(p);
  return {
    wand, spann, transport: transport(p), oeffnungen: oeffnungen(p),
    eta_max_gesamt: Math.max(wand.eta_max, spann.eta_max),
    ok: Math.max(wand.eta_max, spann.eta_max) <= 1 + 1e-9,
  };
}

/** Gewindestangen-Katalog (8.8): As [mm²], fyk/fub [N/mm²]. */
export const STAB_KATALOG = {
  M8: { d: 8, As: 36.6, fyk: 640, fub: 800 },
  M10: { d: 10, As: 58, fyk: 640, fub: 800 },
  M12: { d: 12, As: 84.3, fyk: 640, fub: 800 },
  M16: { d: 16, As: 157, fyk: 640, fub: 800 },
  M20: { d: 20, As: 245, fyk: 640, fub: 800 },
};

/** Standardwerte gemäß Arbeitsmappe (Aschersleben — Rettungswache, IW-01). */
export const DEFAULTS = {
  // Geometrie
  h_m: 3.0, L_m: 6.0, t_m: 0.123, mitWind: true,
  // Material / Bibliothek
  f_k: 20, gamma_w: 13.8, gammaM_wand: 2.0,
  // Gewindestange (M10 8.8)
  As: 58, fyk_Stab: 640, fub_Stab: 800, gamma_s: 1.25,
  // Lasten
  wlz: 2, qpFaktor: 2.1, cpe10: 0.8, torDominant: true, gammaQ: 1.5,
  q1_I: 0.5, q1_II: 1.0, a_4103: 0.9,
  // Vorspannung
  e_m: 0.375, F0: 22, deltaF: 0.33, F_inf_min: 11, gammaP_fav: 1.1, gammaP_sup: 1.1,
  // Prüfwerte Biegung §6.2
  pruef: [{ Nv: 26.7, mRk: 2.4 }, { Nv: 80, mRk: 3.7 }, { Nv: 240, mRk: 7.6 }],
  v_Rd: 3.5,
  // Bodenanschluss
  mu_k: 0.5, gamma_mu: 1.5,
  // Deckenwinkel
  eW_Winkel: 1.5,
  // Spannsystem-Bauteile
  b_Steg: 20, b_KpO: 120, t_KpO: 15, b_FpU: 120, t_FpU: 15,
  fyk_Platte: 235, gammaM0: 1.0, gammaM2: 1.25, k2_SK: 0.9, k2_Senk: 0.63,
  L_Mutter_min: 30, L_Mutter_vorh: 35, l_Platte: 375,
  // Öffnungen
  n_oeff: 0, zusatz_je_seite: 2,
  // Transport / Hebezustand
  rho: 13.8, fy: 235, gammaG: 1.35, dyn: 1.30, nAnker: 2,
  blechB_mm: 80, blechT_mm: 35, hebelBlech_m: 0.375,
};
