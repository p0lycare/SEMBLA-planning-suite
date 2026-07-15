import { nachweise, nachweisWand, nachweisSpannsystem, lasten, vorspannung, forecastLin, transport, DEFAULTS } from "../../docs/shared/sembla-statik.js";
let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log("  ok  " + n); } catch (e) { fail++; console.log("FAIL  " + n + "\n        " + e.message); } };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error((m || "") + `: ${a} != ${b} (±${tol})`); };
const P = DEFAULTS;

// ---- Referenzwerte aus SEMBLA_Wand_Statik_v01.xlsx (γP,fav=γP,sup=1,1) ----
t("Lasten: qb=0,39 · qp=0,819 · Cpi=0,72 · w_Ed=0,8845", () => {
  const L = lasten(P);
  near(L.qb, 0.39, 1e-9, "qb"); near(L.qp, 0.819, 1e-6, "qp");
  near(L.Cpi, 0.72, 1e-6, "Cpi"); near(L.w_Ed, 0.88452, 1e-5, "w_Ed");
});
t("Vorspannung: F∞=14,74 · Nv,fav=35,73 · Nv,sup=64,53", () => {
  const V = vorspannung(P);
  near(V.F_infty, 14.74, 1e-6, "F∞"); if (!V.F_inf_ok) throw new Error("F∞≥F,inf");
  near(V.Nv_fav, 35.7333, 1e-3, "Nv,fav"); near(V.Nv_sup, 64.5333, 1e-3, "Nv,sup");
  near(V.eta_Mstab, 0.81492, 1e-4, "η_M-Stab");
});
t("FORECAST m_Rk(35,73) ≈ 2,6205 kNm/m", () => {
  near(forecastLin(35.7333, [26.7, 80, 240], [2.4, 3.7, 7.6]), 2.6205, 2e-3, "m_Rk");
});
t("Wand Biegung: m_Ed=0,9951 · m_Rd=1,3102 · η=0,7595", () => {
  const w = nachweisWand(P);
  near(w.biegung.m_Ed, 0.99509, 1e-4, "m_Ed"); near(w.biegung.m_Rd, 1.31025, 2e-3, "m_Rd");
  near(w.biegung.eta, 0.75946, 2e-3, "η_Bieg"); if (!w.biegung.ok) throw new Error("ok");
});
t("Wand Schub: v_Ed=1,3268 · η=0,3791", () => {
  const w = nachweisWand(P);
  near(w.schub.v_Ed, 1.32678, 1e-4, "v_Ed"); near(w.schub.eta, 0.37908, 1e-4, "η_Schub");
});
t("Wand Druckrand: σ_Ed=0,9193 · η=0,0919", () => {
  const w = nachweisWand(P);
  near(w.druck.sig_Ed, 0.91930, 1e-4, "σ_Ed"); near(w.druck.eta, 0.09193, 1e-4, "η_Druck");
});
t("Wand Boden: μ_d=0,333 · N_Ed=69,63 · V_Rd=23,21 · η=0,0572", () => {
  const w = nachweisWand(P);
  near(w.boden.mu_d, 0.33333, 1e-4, "μ_d"); near(w.boden.N_Ed, 69.6255, 1e-3, "N_Ed");
  near(w.boden.V_Rd, 23.2085, 2e-3, "V_Rd"); near(w.boden.eta, 0.05717, 1e-4, "η_Boden");
});
t("Wand Winkel: V_Winkel=1,990 kN · n=5", () => {
  const w = nachweisWand(P);
  near(w.winkel.V_Winkel, 1.99017, 1e-4, "V_Winkel"); if (w.winkel.n_Winkel !== 5) throw new Error("n_Winkel=" + w.winkel.n_Winkel);
});
t("Wand η_max = 0,7595 (Biegung maßgebend)", () => {
  near(nachweisWand(P).eta_max, 0.75946, 2e-3, "η_max_Wand");
});

t("Spannsystem: L_span=83 mm · Stange η=0,7244", () => {
  const s = nachweisSpannsystem(P);
  near(s.L_span, 83, 1e-9, "L_span"); near(s.stange.Ft_Ed, 24.2, 1e-6, "Ft,Ed");
  near(s.stange.Ft_Rd, 33.408, 1e-3, "Ft,Rd"); near(s.stange.eta, 0.72438, 1e-4, "η_Stange");
});
t("Spannsystem: Senkschraube η=1,035 → NICHT OK", () => {
  const s = nachweisSpannsystem(P);
  near(s.untenSenk.eta, 1.03482, 1e-4, "η_Senk"); if (s.untenSenk.eta <= 1) throw new Error("Senk sollte NICHT OK");
});
t("Spannsystem: Kopfplatte σ_Ed≈111,6 · η=0,4748", () => {
  const s = nachweisSpannsystem(P);
  near(s.kopfplatte.sig_Ed, 111.59, 0.1, "σ_KpO"); near(s.kopfplatte.eta, 0.47485, 1e-4, "η_KpO");
});
t("Spannsystem: M-Stab Fließen η=0,8149 · jetzt maßgebend", () => {
  const s = nachweisSpannsystem(P);
  near(s.stangeYield.eta, 0.81492, 1e-4, "η_MStab"); near(s.stangeYield.Ft_Rd, 29.696, 1e-3, "Ft,Rd,yield");
});
t("Spannsystem: Steinpressung σ_Ed=1,613 · η=0,161", () => {
  const s = nachweisSpannsystem(P);
  near(s.steinPressung.sig_Ed, 1.6133, 1e-3, "σ_Stein"); near(s.steinPressung.eta, 0.16133, 1e-3, "η_Stein");
});
t("Spannsystem η_max = 0,8149 (M-Stab-Fließen maßgebend)", () => {
  near(nachweisSpannsystem(P).eta_max, 0.81492, 1e-4, "η_max_Spann");
});
t("Gesamt: η_max_gesamt = 0,8149 (Spannsystem maßgebend) · erfüllt", () => {
  const r = nachweise(P);
  near(r.eta_max_gesamt, 0.81492, 1e-4, "η_gesamt"); if (!r.ok) throw new Error("sollte erfüllt");
});
t("Interpolation: im Prüfbereich → interpol='ok'", () => {
  if (nachweisWand(P).biegung.interpol !== 'ok') throw new Error("sollte ok");
});
t("Interpolation: hohe Vorspannung → 'above', m_Rk gekappt auf Nv_max", () => {
  const w = nachweisWand({ ...P, F0: 160, gammaP_fav: 1.0 }); // Nv,fav weit über 240
  if (w.biegung.interpol !== 'above') throw new Error("sollte above, ist " + w.biegung.interpol);
  near(w.biegung.m_Rk, 7.6, 0.05, "m_Rk gekappt≈7,6");
});
t("Steinpressung: kürzere Auflagerlänge erhöht η", () => {
  const s = nachweisSpannsystem({ ...P, l_Platte: 120 });
  if (!(s.steinPressung.eta > nachweisSpannsystem(P).steinPressung.eta)) throw new Error("η sollte steigen");
});
t("Transport (behalten): GEd = γG·dyn·GEk · Blech σ o.k.", () => {
  const r = transport(P);
  near(r.GEd, 1.35 * 1.30 * (13.8 * 0.123 * 3 * 6 / 2), 0.01, "GEd"); if (!r.ok) throw new Error("ok");
});
t("Öffnungen: 16 Regelstäbe, 0 Zusatz, 16 gesamt", () => {
  const o = nachweise(P).oeffnungen;
  if (o.n_regel !== 16 || o.n_gesamt !== 16) throw new Error("n_regel=" + o.n_regel + " n_gesamt=" + o.n_gesamt);
});
t("γP,fav=2,0 (worst case) erhöht η_Biegung deutlich", () => {
  const w = nachweisWand({ ...P, gammaP_fav: 2.0 });
  if (!(w.biegung.eta > nachweisWand(P).biegung.eta)) throw new Error("η sollte steigen");
});

console.log(`\n${pass} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
