// Vergleichstest der BAUTEILDARSTELLUNG in Modul 1 (Wandansicht), Modul 5 (Baugruppenbild)
// und Modul 7 (Zeichnungsblatt) — Auftrag Tibor vom 2026-10-07: Schraube, Muttern und
// Einlegebleche sahen in Modul 7 anders aus als in Modul 1, und das ist wiederholt passiert.
//
// Gezeichnet wird DIESELBE Wand auf den ECHTEN Pfaden:
//  - Modul 1: das klassische Seitenskript von docs/wandplanung.html unter einem DOM-Double,
//    Speicher = die echte storage.js auf einem localStorage-Mock;
//  - Modul 7: `wandelementAktualisiert()` (der Lesepfad von docs/zeichnung.html) + `zeichnungSvg()`;
//  - Modul 5: derselbe Lesepfad (docs/montage.html) + `montageAbschnitte()`/`abschnittSvg()`.
// Verglichen werden die gezeichneten Masse von Sechskantschraube (Schaft, Kopf),
// Kopplungsmutter, Spannmutter, Spannplatte, Einlegeblech (Balken, Schenkel, Strich) samt
// Mutter — zurueckgerechnet in WAND-mm (je Modul durch seinen Massstab geteilt).
//
// MIT Katalogmassen muessen alle drei Module in Wand-mm GLEICH zeichnen.
// OHNE Katalogmass gilt [D-9] (Symbolmasse fest je Darstellungseinheit): dann muessen die
// Module in ihrer DARSTELLUNGSEINHEIT gleich zeichnen (Papier-mm bzw. 5 Einheiten je Papier-mm),
// in Wand-mm unterscheiden sie sich nach dem Blattmassstab — das ist die offene Entscheidung
// zu [D-9], hier ausdruecklich festgehalten, damit jede ANDERE Abweichung rot wird.
//
// PFLICHT vor jedem Push, der die Darstellung eines Bauteils aendert (CLAUDE.md).
import { readFileSync } from "node:fs";
import { buildWall, Opening, GRID, COURSE, wirksameZwischenpunkte, wandLagenKanten,
         AUSGLEICH_KONFLIKT } from "../../docs/shared/sembla-core.js";
import * as ENG from "../../docs/shared/sembla-engine.js";

class MemStorage {
  constructor(){ this.m = new Map(); }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k,v){ this.m.set(k, String(v)); }
  removeItem(k){ this.m.delete(k); }
}
globalThis.localStorage = new MemStorage();

// ---- DOM-Double fuer das Seitenskript von Modul 1 (Muster: smoke_wp.mjs) ----------------
class El{constructor(id){this.id=id;this.value=undefined;this.textContent='';this._h='';
  this.style={setProperty(k,v){this[k]=v;}};this.listeners={};this._tb=null;this.checked=false;
  this.dataset={};this.attrs={};this.parentNode=null;this.isConnected=true;this._kinder=[];
  this._qs={};this.disabled=false;this.hidden=false;}
  addEventListener(e,f){(this.listeners[e]||(this.listeners[e]=[])).push(f);}
  dispatch(e,ev){(this.listeners[e]||[]).forEach(f=>f(ev||{target:this}));}
  setAttribute(n,v){ this.attrs[n]=String(v); if(n==='id'){ this.id=String(v); document._e[String(v)]=this; } }
  getAttribute(n){ return Object.prototype.hasOwnProperty.call(this.attrs,n)?this.attrs[n]:null; }
  removeAttribute(n){ delete this.attrs[n]; }
  hasAttribute(n){ return Object.prototype.hasOwnProperty.call(this.attrs,n); }
  insertBefore(k){ k.parentNode=this; this._kinder.push(k); return k; }
  removeChild(k){ const i=this._kinder.indexOf(k); if(i>=0){ this._kinder.splice(i,1); k.parentNode=null; k.isConnected=false; } return k; }
  remove(){ if(this.parentNode) this.parentNode.removeChild(this); this.isConnected=false; }
  focus(){ document.activeElement=this; }
  getBoundingClientRect(){ return this._rect || {left:0,width:1000}; }
  get innerHTML(){return this._h;} set innerHTML(v){this._h=v;}
  querySelector(s){ if(s==='tbody'){ if(!this._tb)this._tb=new El('tb'); return this._tb;}
    if(!this._qs[s]){ const e=new El('x'); e.parentNode=this; this._qs[s]=e; } return this._qs[s]; }
  querySelectorAll(){return [];}
  appendChild(k){ if(k){ k.parentNode=this; this._kinder.push(k); } return k; } }
const dv={len:'1.25',hgt:'3000',sideVorne:'fassade',sideHinten:'innenausbau',qk:'1.00',gammaQ:'1.50',
  modus:'auto',spacing:'3',force:'60',fcd:'20',cfd:'0.60',rho:'14',blechCm:'100',
  topConn:'spannplatte',abdichtung:'nicht_abgedichtet',brandklasse:'F0'};
const document={_e:{},activeElement:null,
  getElementById(id){let e=this._e[id];if(!e){e=this._e[id]=new El(id);if(id in dv)e.value=dv[id];}return e;},
  createElement(){return new El('_');},
  querySelector(){return null;},
  querySelectorAll(sel){ if(!/data-ax-hintergrund/.test(String(sel))) return [];
    return Object.values(this._e).filter(e=>e.hasAttribute&&e.hasAttribute('data-ax-hintergrund')); },
  head:{appendChild(){}}};
document.body=new El('body');
globalThis.document=document;
document.getElementById('app').setAttribute('data-ax-hintergrund','');
globalThis.window={print(){}, _h:{}, addEventListener(e,f){(this._h[e]||(this._h[e]=[])).push(f);},
  dispatch(e,ev){(this._h[e]||[]).forEach(f=>f(ev||{}));}};
globalThis.alert=()=>{}; globalThis.confirm=()=>true;

const store = await import("../../docs/shared/storage.js");
const KAT = await import("../../docs/shared/sembla-katalog.js");
const AX = await import("../../docs/shared/sembla-ax.js");
const REP = await import("../../docs/shared/sembla-reparatur.js");
const MONT = await import("../../docs/shared/sembla-montage.js");
const WA = await import("../../docs/shared/sembla-wandanlage.js");
const ZEICH = await import("../../docs/shared/sembla-zeichnung.js");

window.SEMBLA={ buildWall, Opening, GRID, COURSE, autoAuslegung: ENG.autoAuslegung,
  nachweisPruefen: ENG.nachweisPruefen, store, KAT, AX, oeffneReparatur: REP.oeffneReparatur,
  wandLagenKanten, lagenOberkanteMm: MONT.lagenOberkanteMm,
  ROLLE_RECHNUNG: WA.ROLLE_RECHNUNG, AUSGLEICH_KONFLIKT, ausgleichSteinHoehen: WA.ausgleichSteinHoehen,
  STUECK_FARBE: MONT.STUECK_FARBE, STUECK_LABEL: MONT.STUECK_LABEL, stueckFarbe: MONT.stueckFarbe,
  stangenStuecke: MONT.stangenStuecke, bodenblechSvg: MONT.bodenblechSvg,
  stangenFarbFolge: MONT.stangenFarbFolge, stangenLegende: MONT.stangenLegende,
  bodenblechTeile: MONT.bodenblechTeile, bodenblechStoesse: MONT.bodenblechStoesse,
  BLECHSTOSS: MONT.BLECHSTOSS, bodenblechAussparungen: MONT.bodenblechAussparungen,
  AUSSPARUNG: MONT.AUSSPARUNG, ZWISCHENPUNKT: MONT.ZWISCHENPUNKT,
  zwischenpunktSvg: MONT.zwischenpunktSvg, wirksameZwischenpunkte,
  DECKENANSCHLUSS: MONT.DECKENANSCHLUSS, deckenanschlussSvg: MONT.deckenanschlussSvg,
  AUSGLEICHSPUNKT: MONT.AUSGLEICHSPUNKT, ausgleichspunktSvg: MONT.ausgleichspunktSvg,
  SPANN_FARBE: MONT.SPANN_FARBE, SPANN_EINHEIT: MONT.SPANN_EINHEIT, SPANN_MM: MONT.SPANN_MM,
  mutterSvg: MONT.mutterSvg, kopplungsmutterSvg: MONT.kopplungsmutterSvg,
  spannplatteSvg: MONT.spannplatteSvg, schraubeSvg: MONT.schraubeSvg };

const html = readFileSync(new URL("../../docs/wandplanung.html", import.meta.url), "utf8");
eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const F = MONT.SPANN_FARBE, ZP = MONT.ZWISCHENPUNKT;
const E1 = MONT.SPANN_EINHEIT.ansicht, E5 = MONT.SPANN_EINHEIT.montage, E7 = MONT.SPANN_EINHEIT.blatt;

// ---- Auslesen der gezeichneten Masse --------------------------------------------------
const attr = (t, n) => { const m = new RegExp(`\\s${n}="([-\\d.e]+)"`).exec(t); return m ? +m[1] : NaN; };
const rects = (svg, farbe) => [...svg.matchAll(/<rect\b[^>]*>/g)].map(m => m[0])
  .filter(t => t.includes(`fill="${farbe}"`))
  .map(t => ({ y: attr(t, "y"), w: attr(t, "width"), h: attr(t, "height") }));
const r2 = v => (Math.round(v * 100) / 100).toFixed(2);
const menge = a => [...new Set(a)].sort();
/**
 * Die gezeichneten Bauteilmasse einer Ansicht, geteilt durch `f` (der Massstab fuer Wand-mm,
 * die Darstellungseinheit fuer den Symbolvergleich). Je Bauteil die MENGE der verschiedenen
 * Masse — wie oft ein Teil vorkommt, haengt am Bildausschnitt (Modul 5 je Abschnitt).
 */
function masse(svg, f) {
  const sr = rects(svg, F.schraube);                       // je Schraube: Schaft, dann Kopf
  const schaft = [], kopf = [];
  for (let i = 0; i + 1 < sr.length; i += 2) { schaft.push(r2(sr[i].w / f)); kopf.push(r2(sr[i + 1].w / f) + "x" + r2(sr[i + 1].h / f)); }
  const zyl = farbe => menge(rects(svg, farbe).map(r => r2(r.w / f) + "x" + r2(r.h / f)));
  const pl = rects(svg, F.platte);
  const eb = [...svg.matchAll(/<polyline\b[^>]*>/g)].map(m => m[0])
    .filter(t => t.includes(`stroke="${ZP.farbe}"`)).map(t => {
      const p = /points="([^"]+)"/.exec(t)[1].trim().split(/\s+/).map(q => q.split(",").map(Number));
      return { b: r2((p[2][0] - p[1][0]) / f), s: r2((p[0][1] - p[1][1]) / f), sw: r2(attr(t, "stroke-width") / f) };
    });
  return {
    schraube_schaft: menge(schaft), schraube_kopf: menge(kopf),
    kopplungsmutter: zyl(F.kupplung), mutter: zyl(F.mutter),
    spannplatte_b: menge(pl.map(r => r2(r.w / f))), spannplatte_h: menge(pl.map(r => r2(r.h / f))),
    einlegeblech_balken: menge(eb.map(e => e.b)), einlegeblech_schenkel: menge(eb.map(e => e.s)),
    einlegeblech_strich: menge(eb.map(e => e.sw)),
  };
}
/** Teile ohne Katalogmass — nach [D-9] immer Symbol (s. Kopf dieser Datei). */
const SYMBOL_IMMER = ["einlegeblech_schenkel", "einlegeblech_strich"];
const TEILE = ["schraube_schaft", "schraube_kopf", "kopplungsmutter", "mutter",
  "spannplatte_b", "spannplatte_h", "einlegeblech_balken", "einlegeblech_schenkel", "einlegeblech_strich"];

// ---- Die drei Lesepfade ----------------------------------------------------------------
const WP = () => window.__wp;
/** Modul 1: Seite neu laden (aktives Element) und die gezeichnete Ansicht lesen. */
function modul1() {
  window.__wpInit();
  return { svg: document.getElementById("plan").innerHTML, sc: WP().ansichtSc(), we: WP().RESULT.wandelement };
}
/** Der gemeinsame Lesepfad von Modul 5 und Modul 7 (`aktuellerStand`/`frischerStand`). */
function lesestand() {
  const el = store.aktivesElement();
  return WA.wandelementAktualisiert(el.wandelement, store.eingabenMitKopfdaten(), store.holeKatalog(), ENG);
}
function modul7() {
  const erg = lesestand(), z = ZEICH.zeichnungSvg(erg.wandelement, {});
  return { svg: z.svg, sc: 1 / z.masstab, erg };
}
function modul5() {
  const erg = lesestand(), w = erg.wandelement, abs = MONT.montageAbschnitte(w);
  return { svg: abs.map(a => MONT.abschnittSvg(w, a)).join(""), sc: MONT.abschnittMasstab(w, abs[0]), erg };
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const zeige = m => TEILE.map(t => t + "=" + m[t].join("|")).join("  ");

// ---- Aufbau: Projekt mit Standardkatalog v6, Wand 1250 x 3000 aus dem Geschosseditor-Pfad ---
const katText = readFileSync(new URL("../../docs/vorlagen/SEMBLA_Standardkatalog-v6.json", import.meta.url), "utf8");
store.fuegeProjektHinzu("Vergleich");
store.importiereKatalogText(katText);
const neu = WA.legeWandAn(store, { name: "W1250", laenge_mm: 1250, hoehe_mm: 3000, wandtyp: "mit_wind" });
// Ein Einlegeblech (Zwischenspannpunkt, [A-14]) auf 1600 mm — ueber den Lesepfad gerechnet.
{
  const el = store.holeElement(neu.id);
  const we = { ...el.wandelement, prestress: { ...el.wandelement.prestress, zwischenpunkte_mm: [1600] } };
  store.speichere(el.name, WA.wandelementAktualisiert(we, el.eingaben, store.holeKatalog(), ENG).wandelement, neu.id);
}
store.setzeAktiv(neu.id);

// ---- (1) MIT Katalogmassen: alle drei Module zeichnen in Wand-mm gleich ------------------
{
  const m1 = modul1(), m7 = modul7(), m5 = modul5();
  ok("Aufbau: Wand gerechnet, Einlegeblech vorhanden, Lesepfad frisch",
    m7.erg.aktualisiert && wirksameZwischenpunkte(m7.erg.wandelement).length > 0
    && m1.we.prestress.top_connection === "spannplatte");
  const a = masse(m1.svg, m1.sc), b = masse(m7.svg, m7.sc), c = masse(m5.svg, m5.sc);
  ok("mit Katalog: alle Bauteile in Modul 1 vorhanden",
    TEILE.every(t => a[t].length > 0));
  for (const t of TEILE.filter(t => !SYMBOL_IMMER.includes(t))) {
    ok(`mit Katalog: ${t} Modul 1 == Modul 7 (Wand-mm) — M1 ${a[t]} / M7 ${b[t]}`, gleich(a[t], b[t]));
    ok(`mit Katalog: ${t} Modul 1 == Modul 5 (Wand-mm) — M1 ${a[t]} / M5 ${c[t]}`, gleich(a[t], c[t]));
  }
  // Schenkel und Strich des Einlegeblechs haben KEIN Katalogmass und sind nach [D-9] immer
  // Symbolmass: gleich in der Darstellungseinheit, in Wand-mm je nach Blattmassstab verschieden
  // (offene Entscheidung zu [D-9], 2026-10-07).
  const a1 = masse(m1.svg, E1), b7 = masse(m7.svg, E7), c5 = masse(m5.svg, E5);
  for (const t of SYMBOL_IMMER)
    ok(`mit Katalog [D-9]: ${t} gleich in Papier-mm — M1 ${a1[t]} / M7 ${b7[t]} / M5 ${c5[t]}`,
      a1[t].length > 0 && gleich(a1[t], b7[t]) && gleich(a1[t], c5[t]));
  // Gegenprobe gegen die Katalogwerte v6 (nicht nur untereinander gleich, sondern richtig).
  ok("mit Katalog: Masse entsprechen dem Standardkatalog v6",
    gleich(a.schraube_schaft, ["10.00"]) && gleich(a.schraube_kopf, ["17.00x7.00"])
    && gleich(a.kopplungsmutter, ["17.00x30.00"]) && gleich(a.mutter, ["17.00x10.00", "17.00x8.00"])
    && gleich(a.spannplatte_b, ["120.00"]) && gleich(a.spannplatte_h, ["10.00"])
    && gleich(a.einlegeblech_balken, ["30.00"]));
  if (TEILE.some(t => !SYMBOL_IMMER.includes(t) && (!gleich(a[t], b[t]) || !gleich(a[t], c[t])))) console.log("M1 " + zeige(a) + "\nM7 " + zeige(b) + "\nM5 " + zeige(c));
}

// ---- (2) Kopfblech oben: die Spannmutter steht allein unter dem Blech -------------------
{
  const tc = document.getElementById("topConn"); tc.value = "blech"; tc.dispatch("change");
  ok("Kopfblech: Modul 1 hat umgestellt und gespeichert",
    store.aktivesElement().wandelement.prestress.top_connection === "blech");
  const m1 = modul1(), m7 = modul7(), m5 = modul5();
  const a = masse(m1.svg, m1.sc), b = masse(m7.svg, m7.sc), c = masse(m5.svg, m5.sc);
  ok("Kopfblech: keine Spannplatte mehr, Spannmutter vorhanden",
    a.spannplatte_b.length === 0 && a.mutter.includes("17.00x10.00"));
  for (const t of ["mutter", "kopplungsmutter", "schraube_kopf", "schraube_schaft", "einlegeblech_balken"]) {
    ok(`Kopfblech: ${t} Modul 1 == Modul 7 == Modul 5 (Wand-mm)`, gleich(a[t], b[t]) && gleich(a[t], c[t]));
  }
  tc.value = "spannplatte"; tc.dispatch("change");
}

// ---- (3) Ursache 2026-10-07: Produkt fehlt im Katalog -> Rueckfall „gespeicherter Stand" ----
// Modul 1 leitet jedes Mass aus den AUFLOESBAREN Produkten ab; Modul 5/7 zeigten den
// gespeicherten Stand — und der fuehrte die Masse nicht (z. B. im Geschosseditor gezeichnet,
// in Modul 1 nur angesehen). Folge: Schraube und Muttern als grosse Symbole in Modul 7.
{
  const el = store.aktivesElement();
  const ps = { ...el.wandelement.prestress };
  for (const f of WA.AUSWEISUNGS_FELDER) delete ps[f];          // Altstand ohne Ausweisungsmasse
  store.speichere(el.name, { ...el.wandelement, prestress: ps }, el.id);
  const rod = KAT.rollenIds(store.holeProdukte(1, el.id), "rod_std");
  store.setzeProduktrolle("rod_std", [...rod, "gewindestange-m10-1000"], el.id);   // v3-Kennung
  const m7 = modul7(), m5 = modul5(), m1 = modul1();
  ok("Produkt fehlt: Modul 5/7 zeigen den gespeicherten Stand (benannter Grund)",
    !m7.erg.aktualisiert && m7.erg.grund === "produkt_fehlt" && m5.erg.grund === "produkt_fehlt");
  ok("Produkt fehlt: der gespeicherte Stand fuehrt die Masse nicht (Pruefaufbau)",
    !("senkkopf_sw_mm" in store.aktivesElement().wandelement.prestress));
  const a = masse(m1.svg, m1.sc), b = masse(m7.svg, m7.sc), c = masse(m5.svg, m5.sc);
  for (const t of ["schraube_kopf", "schraube_schaft", "kopplungsmutter", "mutter", "spannplatte_b", "einlegeblech_balken"]) {
    ok(`Produkt fehlt: ${t} Modul 1 == Modul 7 == Modul 5 (Wand-mm) — M1 ${a[t]} / M7 ${b[t]} / M5 ${c[t]}`,
      gleich(a[t], b[t]) && gleich(a[t], c[t]));
  }
  ok("Produkt fehlt: Schraubenkopf masstaeblich 17 x 7 in Modul 7 (nicht Symbol)",
    gleich(b.schraube_kopf, ["17.00x7.00"]));
  ok("Produkt fehlt: geschrieben wird dabei nichts",
    !("senkkopf_sw_mm" in store.aktivesElement().wandelement.prestress));
  store.setzeProduktrolle("rod_std", rod, el.id);
}

// ---- (4) OHNE Katalogmasse: [D-9] — gleich in der Darstellungseinheit --------------------
// Projekt OHNE Katalog: kein Bauteil hat ein reales Mass, alle zeichnen ihr Symbolmass.
{
  store.fuegeProjektHinzu("Ohne Katalog");
  const w0 = WA.legeWandAn(store, { name: "W0", laenge_mm: 1250, hoehe_mm: 3000, wandtyp: "mit_wind" });
  const el = store.holeElement(w0.id);
  store.speichere(el.name, { ...el.wandelement, prestress: { ...el.wandelement.prestress, zwischenpunkte_mm: [1600] } }, w0.id);
  // Das Einlegeblech braucht die Neurechnung des Cores — ohne Katalog ueber die Engine direkt.
  {
    const we = store.holeElement(w0.id).wandelement;
    const neuW = ENG.autoAuslegung({ name: we.name, length_mm: we.length_mm, height_mm: we.height_mm,
      openings: [], sides: null, steps: [], interlocks: [], prestress: we.prestress,
      load: { ...WA.LAST_VORGABE } }).wandelement;
    store.speichere(el.name, neuW, w0.id);
  }
  store.setzeAktiv(w0.id);
  ok("ohne Katalog: kein wirksamer Katalog", store.holeKatalog() == null);
  const m1 = modul1(), m7 = modul7(), m5 = modul5();
  ok("ohne Katalog: Einlegeblech vorhanden",
    wirksameZwischenpunkte(m7.erg.wandelement).length > 0);
  // Symbolteile: verglichen in der DARSTELLUNGSEINHEIT (je Papier-mm).
  const a = masse(m1.svg, E1), b = masse(m7.svg, E7), c = masse(m5.svg, E5);
  for (const t of ["schraube_schaft", "schraube_kopf", "kopplungsmutter", "mutter", "spannplatte_h",
    "einlegeblech_balken", "einlegeblech_schenkel", "einlegeblech_strich"]) {
    ok(`ohne Katalog [D-9]: ${t} gleich in Papier-mm — M1 ${a[t]} / M7 ${b[t]} / M5 ${c[t]}`,
      a[t].length > 0 && gleich(a[t], b[t]) && gleich(a[t], c[t]));
  }
  // Die Plattenbreite ist auch ohne Katalog ein festes BAUTEILmass (110 mm) -> Wand-mm.
  const pa = masse(m1.svg, m1.sc).spannplatte_b, pb = masse(m7.svg, m7.sc).spannplatte_b,
    pc = masse(m5.svg, m5.sc).spannplatte_b;
  ok(`ohne Katalog: Spannplattenbreite 110 mm in allen drei Modulen — ${pa} / ${pb} / ${pc}`,
    gleich(pa, ["110.00"]) && gleich(pb, pa) && gleich(pc, pa));
}

let bad = 0;
for (const [n, c] of checks) { if (!c) bad++; console.log((c ? "  ok  " : "FAIL  ") + n); }
console.log(`\n${checks.length - bad}/${checks.length} ok`);
process.exit(bad ? 1 : 0);
