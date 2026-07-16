import { readFileSync } from "node:fs";
import * as statik from "../../docs/shared/sembla-statik.js";

const html = readFileSync(new URL("../../docs/statik.html", import.meta.url), "utf8");
// Nur das klassische App-Skript evaluieren (das Modul-Skript <script type="module"> hat Attribute
// und wird von diesem Muster nicht erfasst — es enthält import und liefe in eval nicht).
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El {
  constructor(id){ this.id=id; this.value=undefined; this.textContent=''; this._h=''; this.className=''; this.style={}; this.files=[]; this.listeners={}; }
  addEventListener(e,f){ (this.listeners[e]||(this.listeners[e]=[])).push(f); }
  dispatch(e){ (this.listeners[e]||[]).forEach(f=>f({target:this})); }
  get innerHTML(){ return this._h; } set innerHTML(v){ this._h=v; }
}
const dv={
  h_m:'3.00',L_m:'6.00',t_m:'0.123',mitWind:'ja',n_oeff:'0',
  f_k:'20',gamma_w:'13.8',gammaM_wand:'2.0',v_Rd:'3.5',mu_k:'0.5',gamma_mu:'1.5',
  stab:'M10',As:'58',fyk_Stab:'640',fub_Stab:'800',gamma_s:'1.25',
  wlz:'2',qpFaktor:'2.1',cpe10:'0.8',torDominant:'dominant',gammaQ:'1.5',q1_I:'0.5',q1_II:'1.0',a_4103:'0.9',
  e_m:'0.375',F0:'22',deltaF:'0.33',F_inf_min:'11',gammaP_fav:'1.1',gammaP_sup:'1.1',
  Nv1:'26.7',mRk1:'2.4',Nv2:'80',mRk2:'3.7',Nv3:'240',mRk3:'7.6',
  b_Steg:'20',b_KpO:'120',t_KpO:'15',b_FpU:'120',t_FpU:'15',fyk_Platte:'235',gammaM0:'1.0',gammaM2:'1.25',k2_SK:'0.9',k2_Senk:'0.63',L_Mutter_min:'30',L_Mutter_vorh:'35',l_Platte:'375',
  eW_Winkel:'1.5',rho:'13.8',fy:'235',gammaG:'1.35',dyn:'1.30',nAnker:'2',blechB_mm:'80',blechT_mm:'35',hebelBlech_m:'0.375'
};
const document={ _e:{}, getElementById(id){ let e=this._e[id]; if(!e){ e=this._e[id]=new El(id); if(id in dv) e.value=dv[id]; } return e; } };
globalThis.document=document; globalThis.window={}; globalThis.alert=()=>{};
// Storage-Mock: aktives Wandelement mit Referenz-Geometrie (h=3,0 · l=6,0 · t=0,123 · 0 Öffnungen)
// — entspricht genau den DOM-Defaults/Excel-Prüfwerten. Ohne aktives Element rechnet Modul 3
// bewusst NICHT mehr (kein fiktives Wandelement), siehe separater Leer-Test unten.
let _subs=[];
const storeMock={ aktivId:()=>'w-ref', aktiveEingaben:()=>null,
  aktivesWandelement:()=>({name:'Referenz', length_mm:6000, height_mm:3000, thickness_mm:123, openings:[]}),
  abonniere:(cb)=>{ _subs.push(cb); return ()=>{}; } };
eval(script);

globalThis.window.SEMBLA={ statik, store:storeMock };
globalThis.window.__statikInit();
const S=globalThis.window.__statik;
const checks=[]; const ok=(n,c)=>checks.push([n,!!c]);
const near=(a,b,t)=>Math.abs(a-b)<=t;

const r=S.nachweise(S.readP());
// ---- Wand (Excel-Referenz γP=1,1) ----
ok('Wand η_Biegung ≈ 0,759 & OK', near(r.wand.biegung.eta,0.75946,2e-3)&&r.wand.biegung.ok);
ok('Wand η_Schub ≈ 0,379', near(r.wand.schub.eta,0.37908,1e-3));
ok('Wand η_Druck ≈ 0,092', near(r.wand.druck.eta,0.09193,1e-3));
ok('Wand η_Boden ≈ 0,057', near(r.wand.boden.eta,0.05717,1e-3));
ok('Wand η_max ≈ 0,759 (Biegung maßg.)', near(r.wand.eta_max,0.75946,2e-3));
ok('Winkel n=5 · V_Winkel≈1,99 kN', r.wand.winkel.n_Winkel===5 && near(r.wand.winkel.V_Winkel,1.99017,2e-3));
// ---- Spannsystem ----
ok('Spann L_span=83 mm · Stange η≈0,724', near(r.spann.L_span,83,1e-6)&&near(r.spann.stange.eta,0.72438,1e-3));
ok('Spann Senkschraube η≈1,035 → NICHT OK', near(r.spann.untenSenk.eta,1.03482,2e-3)&&r.spann.untenSenk.eta>1);
ok('Spann Kopfplatte η≈0,475', near(r.spann.kopfplatte.eta,0.47485,1e-3));
ok('Spann M-Stab Fließen η≈0,815 (maßgebend)', near(r.spann.stangeYield.eta,0.81492,1e-3));
ok('Spann Steinpressung σ≈1,61 · η≈0,161', near(r.spann.steinPressung.sig_Ed,1.6133,2e-3)&&near(r.spann.steinPressung.eta,0.16133,2e-3));
ok('Spann η_max ≈ 0,815 (M-Stab-Fließen, Senk nicht im Max)', near(r.spann.eta_max,0.81492,1e-3));
// ---- Gesamt ----
ok('η_max_gesamt ≈ 0,815 (Spannsystem maßgebend) & erfüllt', near(r.eta_max_gesamt,0.81492,1e-3)&&r.ok);
ok('Biegung im Prüfbereich (interpol=ok)', r.wand.biegung.interpol==='ok');
ok('Öffnungen: 16 Regel / 16 gesamt', r.oeffnungen.n_regel===16 && r.oeffnungen.n_gesamt===16);
// ---- UI gerendert ----
ok('Karten gerendert (Biegung/Stange/Transport)', document.getElementById('cardBieg').innerHTML.length>80 && document.getElementById('cardStange').innerHTML.length>80 && document.getElementById('cardTrans').innerHTML.length>80);
ok('Neue Karten: M-Stab-Fließen + Steinpressung', /Fließen/.test(document.getElementById('cardMStab').innerHTML) && /Teilflächenpressung/.test(document.getElementById('cardStein').innerHTML));
ok('Summary erfüllt', /erfüllt/.test(document.getElementById('sumBadge').textContent) && !/NICHT/.test(document.getElementById('sumBadge').textContent));
ok('Unten-Karte zeigt beide Varianten', /Senkschraube/.test(document.getElementById('cardUnten').innerHTML));
// ---- Interaktion: Stangenauswahl M8 -> As sinkt, η Stange steigt ----
const st=document.getElementById('stab'); st.value='M8'; st.dispatch('change');
ok('Stab M8: A_s auf 36,6 gesetzt', near(+document.getElementById('As').value,36.6,1e-6));
ok('Stab M8: η_Stange steigt > 1 (NICHT OK)', S.nachweise(S.readP()).spann.stange.eta>1);
document.getElementById('stab').value='M10'; document.getElementById('stab').dispatch('change');
// ---- Interaktion: γP,fav worst case erhöht Biege-Ausnutzung ----
const gp=document.getElementById('gammaP_fav'); gp.value='2.0'; gp.dispatch('change');
ok('γP,fav=2,0 erhöht η_Biegung', S.nachweise(S.readP()).wand.biegung.eta>0.75946);
gp.value='1.1'; gp.dispatch('change');
// ---- Interaktion: sehr hohe DIN-Last -> Nachweis kippt ----
const q=document.getElementById('q1_II'); q.value='80'; q.dispatch('input');
ok('hohe DIN-Last -> Summary NICHT erfüllt', /NICHT/.test(document.getElementById('sumBadge').textContent));
q.value='1.0'; q.dispatch('input');
ok('zurückgesetzt -> wieder erfüllt', /erfüllt/.test(document.getElementById('sumBadge').textContent)&&!/NICHT/.test(document.getElementById('sumBadge').textContent));
// ---- Storage: aktives Wandelement füllt Geometrie/Öffnungen ----
S.applyWand({name:'IW-Test',length_mm:2000,height_mm:2600,thickness_mm:125,openings:[{g0:5,g1:11,l0:0,l1:10}]},'Aktives Wandelement');
ok('applyWand: h=2,60 · L=2,000 · t=0,125 · 1 Öffnung', document.getElementById('h_m').value==='2.60' && document.getElementById('L_m').value==='2.000' && document.getElementById('t_m').value==='0.125' && document.getElementById('n_oeff').value===1);
ok('applyWand: Info nennt Wandelement', /IW-Test/.test(document.getElementById('wandinfo').textContent));

// ---- Ohne aktives Element: kein (fiktiver) Nachweis, sondern klare Leer-Anzeige ----
storeMock.aktivId=()=>null; storeMock.aktivesWandelement=()=>null;
_subs.forEach(cb=>cb());   // externer Wechsel auf "kein aktives Element"
ok('Leer: Summary geleert (Geometrie fehlt)', document.getElementById('sumBadge').textContent==='—' && /Geometrie fehlt/.test(document.getElementById('sumText').innerHTML));
ok('Leer: Nachweis-Karten geleert', document.getElementById('cardBieg').innerHTML==='' && document.getElementById('cardStange').innerHTML==='');
ok('Leer: Geometriefelder geblankt', document.getElementById('h_m').value==='' && document.getElementById('L_m').value==='' && document.getElementById('n_oeff').value==='');
ok('Leer: Info nennt kein aktives Wandelement', /Kein aktives Wandelement/.test(document.getElementById('wandinfo').textContent));

let fail=0; for(const [n,c] of checks){ console.log((c?'  ok  ':'FAIL  ')+n); if(!c)fail++; }
console.log(`\n${checks.length-fail}/${checks.length} ok`); process.exit(fail?1:0);
