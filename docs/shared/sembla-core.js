// @ts-check
/**
 * SEMBLA Core - Vanilla-JS-Portierung der Referenz-Implementierung (sembla_core.py).
 * Erzeugt aus Laenge/Hoehe/Oeffnungen ein Wandelement (Single Source of Truth).
 * Bit-genau identisch zum Python-Core (gepruefte Paritaet gegen die goldenen Fixtures).
 *
 * Einheiten: mm. 'grid' = Rastereinheit (125mm), 'lage' = Lagenindex (200mm).
 */

export const GRID = 125;
export const COURSE = 200;
export const THICK = 125;
export const ROD = 1100;
export const BLECH = 1000;              // Standard-Modullänge der Stahlbleche (Boden/Kopf)
export const BLECH_THICK = 15;          // Stahlblech-Dicke (mm)
export const CHAMBER_OFFSET = 62.5;     // Kammerzentrum -> Lattice x = 62.5 + 125k
export const MAX_SPAN_GRID = 3;         // Vorspannung max. alle 3 Raster (375mm)
export const FORBIDDEN_N = new Set([1, 4]);
export const MIN_FERTIGMASS_MM = 200;   // kleinstes einbaubares Fertigmass eines Zuschnitts ([Z-5])
export const ROD_OVERHANG = 10;         // Ueberstand des Reststuecks ueber die Wandoberkante ([Z-6])

export class SemblaError extends Error {}
export class InvalidDimensionError extends SemblaError {}
export class InvalidOpeningError extends SemblaError {}

/**
 * @typedef {{g0:number,g1:number,l0:number,l1:number,art:string}} OpeningLike
 */

/** Validiertes Oeffnungs-Objekt. */
export class Opening {
  /** @param {number} g0 @param {number} g1 @param {number} l0 @param {number} l1 @param {string} [art] */
  constructor(g0, g1, l0, l1, art = "tuer") {
    if (g1 <= g0) throw new InvalidOpeningError(`g1<=g0 (${g0},${g1})`);
    if (l1 <= l0) throw new InvalidOpeningError(`l1<=l0 (${l0},${l1})`);
    if (g0 < 0 || l0 < 0) throw new InvalidOpeningError("negative Koordinate");
    if (art !== "tuer" && art !== "fenster" && art !== "durchbruch") throw new InvalidOpeningError("unbekannte art " + art);
    this.g0 = g0; this.g1 = g1; this.l0 = l0; this.l1 = l1; this.art = art;
  }
  asDict() { return { g0: this.g0, g1: this.g1, l0: this.l0, l1: this.l1, art: this.art }; }
}

/** Python-kompatibles Runden (round-half-to-even) — wichtig fuer Paritaet. */
function pyRound(x) {
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return (f % 2 === 0) ? f : f + 1;
}

// ---------- Zuschnitt aus ausgewaehlten Standardlaengen ([Z-2]/[Z-5]) ----------
// Die ausgewaehlten Katalogprodukte sind ein VORRATSSATZ an Standardlaengen, die tatsaechlich
// KOMBINIERT werden: groesste geeignete Groesse zuerst, mit kleineren ausgewaehlten Groessen
// auffuellen, das verbleibende Fertigmass als sichtbar gekennzeichneter Sonderzuschnitt aus dem
// kleinsten geeigneten Ausgangsprodukt. Keine Saegefuge, keine Reststueck-Wiederverwendung,
// keine Einkaufs-/Verschnittoptimierung.
//
// [Z-5] (Mindest-Fertigmass) steht als Baubarkeitsregel UEBER der Groessenpraeferenz: eine
// Standardgroesse wird nur gewaehlt, wenn der danach verbleibende Rest 0, mindestens das
// Mindest-Fertigmass oder mit einer weiteren ausgewaehlten Groesse auffuellbar ist. Laesst der
// Vorratssatz keine solche Wahl zu (z. B. nur EINE Standardlaenge), wird die Groessenpraeferenz
// beibehalten und der Konflikt SICHTBAR gemeldet (`konflikt: "mindestmass"`) — es entsteht nie
// still ein nicht einbaubares Kurzstueck und nie eine erfundene Laenge ([P-6]/[P-9]).

/** Rundungsschutz fuer mm-Arithmetik (Katalogmasse sind ganzzahlige mm). */
function _mm(x) { return Math.round(x * 1e6) / 1e6; }

/** Standardlaengen normalisieren: nur > 0, dedupliziert, ABSTEIGEND. @param {number[]} l */
export function normLaengen(l) {
  const arr = (Array.isArray(l) ? l : []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  return [...new Set(arr)].sort((a, b) => b - a);
}

/**
 * Kleinstes Ausgangsprodukt, aus dem ein Fertigmass geschnitten werden kann
 * (kleinste ausgewaehlte Standardlaenge >= Mass). Keine passende -> null.
 * @param {number} massMm @param {number[]} laengenMm
 */
export function quelleFuerMass(massMm, laengenMm) {
  let out = null;
  for (const l of normLaengen(laengenMm)) if (l >= massMm - 1e-9) out = l;   // absteigend -> letzter Treffer = kleinster
  return out;
}

/**
 * Bedarf deterministisch aus den ausgewaehlten Standardlaengen kombinieren ([Z-2]).
 * @param {number} bedarfMm benoetigte Gesamtlaenge (Geometrie, wird NIE veraendert)
 * @param {number[]} laengenMm ausgewaehlte Standardlaengen
 * @param {number} [minMm] Mindest-Fertigmass ([Z-5])
 * @returns {{stuecke:Array<{len_mm:number,art:"standard"|"sonder",quelle_mm:number}>,
 *            konflikt:string|null}}
 */
export function kombiniereLaengen(bedarfMm, laengenMm, minMm = MIN_FERTIGMASS_MM) {
  const L = normLaengen(laengenMm);
  const stuecke = [];
  if (!L.length) return { stuecke, konflikt: "keine_standardlaenge" };
  let rest = _mm(bedarfMm), konflikt = null, guard = 0;
  while (rest > 1e-9 && guard++ < 10000) {
    const passend = L.filter((l) => l <= rest + 1e-9);            // absteigend
    if (!passend.length) break;                                   // Rest < kleinste Standardgroesse
    // [Z-5] vor Groessenpraeferenz: Rest danach 0, >= Mindestmass oder weiter auffuellbar
    let pick = passend.find((l) => {
      const r2 = _mm(rest - l);
      return r2 <= 1e-9 || r2 >= minMm - 1e-9 || L.some((x) => x <= r2 + 1e-9);
    });
    if (pick == null) { pick = passend[0]; konflikt = "mindestmass"; }   // sichtbar, nie still
    stuecke.push({ len_mm: pick, art: "standard", quelle_mm: pick });
    rest = _mm(rest - pick);
  }
  if (rest > 1e-9) {
    const q = quelleFuerMass(rest, L);
    if (q == null) return { stuecke: [], konflikt: "kein_ausgangsprodukt" };
    if (rest < minMm - 1e-9) konflikt = "mindestmass";
    stuecke.push({ len_mm: rest, art: "sonder", quelle_mm: q });
  }
  return { stuecke, konflikt };
}

// ---------- Reststueck am oberen Wandabschluss ([Z-6]) ----------
// Die Waende werden im Innenraum montiert: unter der Decke ist kein Platz mehr, um eine lange
// Gewindestange einzufaedeln. Das OBERSTE Stueck eines Stranges, der an der Wandoberkante endet,
// ist deshalb IMMER ein kurzes, im Katalog eigens als Reststueck gewaehltes Produkt.
//
// Geometrie: das Reststueck ragt um `ueberstandMm` ueber die Wandoberkante hinaus (Platz fuer
// Kopfblech/Spannplatte + Spannmutter), sein unteres Ende liegt darunter. Zu bestuecken ist
// also `h + ueberstand`, nicht `h`. Fuer Segmente, die NICHT an der Wandoberkante enden
// (Bruestung/Sturz an einer Oeffnung), gilt die Regel nicht — dort ist der Einbau nicht beengt.
//
// Hierarchie unterhalb des Reststuecks unveraendert ([Z-2]): von unten immer die groesste noch
// passende Standardlaenge, dann kleinere, und erst wenn keine mehr passt genau EIN
// Sonderzuschnitt — der damit direkt unter dem Reststueck sitzt.

/**
 * Stueckliste eines Strangsegments ([Z-2] + [Z-6]).
 * @param {number} hMm Segmenthoehe (Geometrie, wird NIE veraendert)
 * @param {number[]} laengenMm ausgewaehlte Standardlaengen
 * @param {boolean} obenAnOk true, wenn das Segment an der Wandoberkante endet
 * @param {number} restMm Laenge des gewaehlten Reststueck-Produkts (0/null = keins gewaehlt)
 * @param {number} ueberstandMm Ueberstand des Reststuecks ueber die Wandoberkante
 * @param {number} [minMm] Mindest-Fertigmass ([Z-5])
 * @returns {{stuecke:Array<{len_mm:number,art:"standard"|"sonder"|"rest",quelle_mm:number}>,
 *            konflikt:string|null, bedarf_mm:number}}
 */
export function kombiniereSegment(hMm, laengenMm, obenAnOk, restMm, ueberstandMm, minMm = MIN_FERTIGMASS_MM) {
  const R = (+restMm > 0) ? _mm(+restMm) : 0;
  const UE = (+ueberstandMm > 0) ? _mm(+ueberstandMm) : 0;
  // Ohne Oberkantenbezug oder ohne gewaehltes Reststueck bleibt alles wie bisher ([Z-2]).
  if (!obenAnOk || !R) {
    const k = kombiniereLaengen(hMm, laengenMm, minMm);
    // Fehlendes Reststueck an der Oberkante ist ein SICHTBARER Konflikt, keine stille Ausnahme.
    if (obenAnOk && !R) return { ...k, konflikt: k.konflikt || "kein_reststueck", bedarf_mm: _mm(hMm) };
    return { ...k, bedarf_mm: _mm(hMm) };
  }
  const bedarf = _mm(hMm + UE);
  const unten = _mm(bedarf - R);
  if (unten < -1e-9) return { stuecke: [], konflikt: "reststueck_zu_lang", bedarf_mm: bedarf };
  const restStueck = { len_mm: R, art: "rest", quelle_mm: R };
  if (unten <= 1e-9) return { stuecke: [restStueck], konflikt: null, bedarf_mm: bedarf };
  const k = kombiniereLaengen(unten, laengenMm, minMm);
  if (!k.stuecke.length) return { stuecke: [], konflikt: k.konflikt || "kein_ausgangsprodukt", bedarf_mm: bedarf };
  return { stuecke: [...k.stuecke, restStueck], konflikt: k.konflikt, bedarf_mm: bedarf };
}

/** @returns {Set<number>} absolute Rasterpositionen der inneren Fugen (ohne Segmentenden). */
function segJoints(startGrid, tiling) {
  const js = new Set(); let c = startGrid;
  for (let i = 0; i < tiling.length - 1; i++) { c += tiling[i]; js.add(c); }
  return js;
}

/** i3-maximale Lagen-Varianten fuer Breite n (Raster). i2 immer nur an den Enden. */
function candidates(n) {
  if (n < 2) return [[]];
  const r = n % 3;
  if (r === 2) { const f = Array((n - 2) / 3).fill(3); return [[2, ...f], [...f, 2]]; }
  if (r === 1) { const f = Array((n - 4) / 3).fill(3); return [[2, 2, ...f], [...f, 2, 2]]; }
  const m = n / 3;
  if (m === 1) return [[3]];
  const f = Array(m - 2).fill(3);
  return [Array(m).fill(3), [2, 2, ...f, 2], [2, ...f, 2, 2]];
}

/** Vergleich (notConflict, i3count, dist): >0 wenn a strikt groesser. */
function keyCmp(a, b) {
  if (a[0] !== b[0]) return (a[0] ? 1 : 0) - (b[0] ? 1 : 0);
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/** Waehlt unter den i3-maximalen Varianten die, die der Lage darunter ausweicht. */
function pickTiling(startGrid, n, prev) {
  let best = null;
  for (const comp of candidates(n)) {
    const js = segJoints(startGrid, comp);
    const conflict = [...js].some(j => prev.has(j));
    const i3 = comp.filter(b => b === 3).length;
    let dist = 99;
    if (js.size && prev.size) dist = Math.min(...[...js].flatMap(j => [...prev].map(f => Math.abs(j - f))));
    const key = [!conflict, i3, dist];
    if (best === null || keyCmp(key, best.key) > 0) best = { key, comp };
  }
  return best.comp;
}

function balancedFill(a, b, maxstep) {
  if (b <= a) return [a];
  const k = Math.ceil((b - a) / maxstep);
  const out = [];
  for (let i = 0; i <= k; i++) out.push(pyRound(a + (b - a) * i / k));
  return out;
}

function validateInputs(lengthMm, heightMm, openings) {
  if (!Number.isInteger(lengthMm) || lengthMm % GRID !== 0)
    throw new InvalidDimensionError(`Wandlaenge ${lengthMm} ist kein Vielfaches von ${GRID} mm`);
  if (lengthMm < 2 * GRID)
    throw new InvalidDimensionError(`Wandlaenge ${lengthMm} < Mindestmass ${2 * GRID} mm`);
  if (!Number.isInteger(heightMm) || heightMm % COURSE !== 0)
    throw new InvalidDimensionError(`Wandhoehe ${heightMm} ist kein Vielfaches von ${COURSE} mm`);
  if (heightMm < COURSE)
    throw new InvalidDimensionError(`Wandhoehe ${heightMm} < ${COURSE} mm`);
  const N = lengthMm / GRID, L = heightMm / COURSE;
  for (const op of openings) {
    if (op.g1 > N) throw new InvalidOpeningError(`Oeffnung ueber Wandlaenge (g1=${op.g1} > N=${N})`);
    if (op.l1 > L) throw new InvalidOpeningError(`Oeffnung ueber Wandhoehe (l1=${op.l1} > L=${L})`);
  }
  for (let i = 0; i < openings.length; i++)
    for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i], b = openings[j];
      if (a.g0 < b.g1 && b.g0 < a.g1 && a.l0 < b.l1 && b.l0 < a.l1)
        throw new InvalidOpeningError(`Oeffnungen ueberlappen: #${i} und #${j}`);
    }
}

/**
 * Baut ein Wandelement.
 * @param {string} name
 * @param {number} lengthMm Vielfaches von 125, >=250
 * @param {number} heightMm Vielfaches von 200, >=200
 * @param {Opening[]} [openings]
 * @returns {object} Wandelement (siehe wandelement.schema.json)
 */
export const SEITEN_FUNKTIONEN = ["fassade", "innenausbau", "sicht", "installation"];
export const DEFAULT_SIDES = { vorne: { funktion: "fassade" }, hinten: { funktion: "innenausbau" } };
function normSides(s) {
  const f = (v, d) => (v && SEITEN_FUNKTIONEN.includes(v.funktion)) ? v.funktion : d;
  return { vorne: { funktion: f(s && s.vorne, "fassade") }, hinten: { funktion: f(s && s.hinten, "innenausbau") } };
}

export const DEFAULT_PRESTRESS = { max_span_grid: MAX_SPAN_GRID, force_kN: null, start_axis_grid: 0 };
function normPrestress(p) {
  const m = (p && Number.isInteger(p.max_span_grid) && p.max_span_grid >= 1) ? p.max_span_grid : MAX_SPAN_GRID;
  const fk = (p && p.force_kN != null) ? p.force_kN : null;
  // Gewindestangen-Standardlaengen ([Z-1]): der VORRATSSATZ der gewaehlten Katalogprodukte ist
  // die verbindliche Quelle.
  //
  // FEHLT das Feld ganz (Altstand/Altaufruf), gilt unveraendert der kompatible Fallback aus dem
  // Einzelwert `rod_mm` bzw. ROD — dann ist der Satz einelementig und die Kombination liefert
  // bit-genau das bisherige Ergebnis.
  //
  // Ist das Feld dagegen AUSDRUECKLICH gesetzt und leer, hat der Aufrufer die Auswahl bereits
  // ausgewertet und sagt: es ist keine Standardlaenge gewaehlt. Dann wird KEINE erfunden — weder
  // als `rod_mm` noch als reales Stueck. Der Zuschnitt bleibt sichtbar offen
  // (`zuschnitt_konflikte`: `keine_standardlaenge`), statt still 1100 mm zu behaupten.
  const rodExplizit = Array.isArray(p && p.rod_lengths_mm);
  let rodL = normLaengen(p && p.rod_lengths_mm);
  let rod;
  if (rodL.length) rod = rodL[0];
  else if (rodExplizit) rod = null;
  else { rod = (p && p.rod_mm != null && +p.rod_mm > 0) ? +p.rod_mm : ROD; rodL = [rod]; }
  const blech = (p && p.blech_mm != null && +p.blech_mm > 0) ? +p.blech_mm : BLECH;
  const top = (p && (p.top_connection === "spannplatte" || p.top_connection === "blech")) ? p.top_connection : "blech";
  // manuelle Spannachsen (Rasterindizes) – wenn gesetzt, exakt diese statt Auto-Verteilung
  let cg = Array.isArray(p && p.columns_grid) ? p.columns_grid.map(Number).filter(k => Number.isInteger(k) && k >= 0) : null;
  cg = (cg && cg.length) ? [...new Set(cg)].sort((a, b) => a - b) : null;
  // Startachse der Auto-Verteilung: 0 = 1. Rasterachse (Standard/Bestand), 1 = 2. Rasterachse
  const sa = (p && (p.start_axis_grid === 1 || p.start_axis_grid === "1")) ? 1 : 0;
  // Reststueck am oberen Wandabschluss ([Z-6]). `rod_rest_mm` ist das in Modul 1 als Reststueck
  // gewaehlte Katalogprodukt (genau eins); fehlt es, bleibt die Zerlegung wie bisher und der
  // Konflikt wird je Segment sichtbar gemeldet. `rod_overhang_mm` ist der Ueberstand ueber die
  // Wandoberkante — konfigurierbar, weil er von Kopfblech/Spannplatte + Spannmutter abhaengt.
  const rr = (p && p.rod_rest_mm != null && +p.rod_rest_mm > 0) ? +p.rod_rest_mm : 0;
  const ue = (p && p.rod_overhang_mm != null && +p.rod_overhang_mm >= 0) ? +p.rod_overhang_mm : ROD_OVERHANG;
  return { max_span_grid: m, force_kN: fk, rod_mm: rod, rod_lengths_mm: rodL, blech_mm: blech,
           top_connection: top, columns_grid: cg, start_axis_grid: sa,
           rod_rest_mm: rr, rod_overhang_mm: ue };
}

function normSteps(steps, lengthMm, heightMm) {
  const out = [];
  for (const s of (steps || [])) {
    const x0 = Math.max(0, pyRound((s.x0_mm || 0) / GRID) * GRID);
    const x1 = Math.min(lengthMm, pyRound((s.x1_mm || 0) / GRID) * GRID);
    const h = Math.max(0, Math.min(heightMm, pyRound((s.height_mm || 0) / COURSE) * COURSE));
    if (x1 > x0) out.push({ x0_mm: x0, x1_mm: x1, height_mm: h });
  }
  return out;
}

export function buildWall(name, lengthMm, heightMm, openings = [], sides = null, prestress = null, steps = []) {
  const PS = normPrestress(prestress);
  const maxSpan = PS.max_span_grid;
  const ROD_ = PS.rod_mm;
  const TOP = PS.top_connection;   // 'blech' (Kopfblech) | 'spannplatte'
  validateInputs(lengthMm, heightMm, openings);
  const N = lengthMm / GRID, L = heightMm / COURSE;

  // Staffelung / getreppter Aufbau: je Spalte eine lokale Oberkante (Anzahl Lagen)
  const STEPS = normSteps(steps, lengthMm, heightMm);
  const topLage = new Array(N);
  for (let k = 0; k < N; k++) {
    const xc = (k + 0.5) * GRID; let h = heightMm;
    for (const s of STEPS) { if (xc >= s.x0_mm && xc < s.x1_mm) { h = s.height_mm; break; } }
    topLage[k] = Math.max(0, Math.min(L, pyRound(h / COURSE)));
  }
  const runsAt = (li) => { const runs = []; let s = null;
    for (let k = 0; k < N; k++) { const present = topLage[k] > li; if (present) { if (s === null) s = k; } else if (s !== null) { runs.push([s, k]); s = null; } }
    if (s !== null) runs.push([s, N]); return runs; };

  const courses = []; let prev = new Set();
  const rigidLagen = []; const invalidSegments = [];
  for (let li = 0; li < L; li++) {
    let cuts = runsAt(li);
    for (const op of openings) {
      if (op.l0 <= li && li < op.l1) {
        const nc = [];
        for (const [s, e] of cuts) {
          if (op.g1 <= s || op.g0 >= e) { nc.push([s, e]); continue; }
          if (op.g0 > s) nc.push([s, op.g0]);
          if (op.g1 < e) nc.push([op.g1, e]);
        }
        cuts = nc;
      }
    }
    const stones = []; let joints = new Set(); let rig = false;
    for (const [s, e] of cuts) {
      const w = e - s;
      if (FORBIDDEN_N.has(w)) {
        rig = true;
        const seg = { lage: li, start_grid: s, breite_grid: w };
        if (!invalidSegments.some(x => x.lage === li && x.start_grid === s && x.breite_grid === w))
          invalidSegments.push(seg);
      }
      const comp = pickTiling(s, w, prev);
      for (const j of segJoints(s, comp)) joints.add(j);
      let g = s;
      for (const b of comp) {
        stones.push({ type: b === 2 ? "i2" : "i3", x0: g * GRID, x1: (g + b) * GRID });
        g += b;
      }
    }
    if (rig) rigidLagen.push(li);
    courses.push({ lage: li, stones, joints_grid: [...joints].sort((a, b) => a - b) });
    prev = joints;
  }

  let versatzOk = true; const viol = [];
  for (let li = 0; li < L - 1; li++) {
    const a = new Set(courses[li].joints_grid);
    const bad = courses[li + 1].joints_grid.filter(x => a.has(x));
    if (bad.length) { versatzOk = false; viol.push({ zwischen_lagen: [li, li + 1], fugen_grid: bad.slice().sort((p, q) => p - q) }); }
  }

  // ---- Vorspannstränge: Segmente je durchgehend belegtem Bereich (über/unter Öffnungen) ----
  const occ = []; for (let r = 0; r < L; r++) occ.push(new Array(N).fill(false));
  for (const c of courses) for (const st of c.stones) { const a = st.x0 / GRID, b = st.x1 / GRID; for (let cc = a; cc < b; cc++) occ[c.lage][cc] = true; }
  // ---- Spannachsen ----------------------------------------------------------------
  // Hierarchie: [V-1] Kammerraster > [V-9] manuelle Achsen > [V-2] Steinabdeckung (MUSS)
  // > [V-7]/[V-8] Zusatzachsen an Stufen-/Oeffnungskanten > [V-3] Mitte i3 unterste Lage
  // > [V-4] Maximalabstand als OBERGRENZE.
  //
  // [V-4] ist bewusst die LETZTE Stufe und nicht mehr die Verteilungsregel: die Steinabdeckung
  // [V-2] impliziert den Abstand NICHT (nachweisbar entstehen sonst Luecken bis 5 Raster =
  // 625 mm, obwohl jeder Stein gehalten ist), und umgekehrt beweist ein eingehaltenes
  // Maximalraster die Abdeckung nicht. Beide Regeln sind unabhaengig und beide gelten.
  const steinIv = [];
  for (const c of courses) for (const st of c.stones) steinIv.push([st.x0 / GRID, st.x1 / GRID]);
  // Deterministische Reihenfolge fuer den Stabbing-Greedy: nach rechtem, dann linkem Rand.
  steinIv.sort((p, q) => (p[1] - q[1]) || (p[0] - q[0]));
  /** Wird das Rasterintervall [a,b) von mindestens einer Achse aus `S` durchgangen? */
  const gehalten = (S, a, b) => { for (let k = a; k < b; k++) if (S.has(k)) return true; return false; };

  let colArr;
  if (PS.columns_grid) {
    // [V-9] Sonderkonstruktion: exakt die manuell gesetzten Achsen verwenden. Sie werden NICHT
    // ergaenzt (auch nicht um [V-2]/[V-4]) — der Anwender uebernimmt die Verteilung ganz.
    // Verletzungen der Muss-Regel [V-2] werden unten sichtbar gemeldet.
    colArr = PS.columns_grid.filter(k => k >= 0 && k < N).sort((a, b) => a - b);
  } else {
    // [V-5] Startachse (0 = 1. Rasterachse, Standard; 1 = 2. Rasterachse) und letzte Achse N-1.
    const a0 = Math.min(PS.start_axis_grid, N - 1);
    const colSet = new Set([a0, N - 1]);
    // [V-8] Oeffnungen: beidseitig eine Achse (die Steine daneben tragen den Sturz ab).
    for (const op of openings) { if (op.g0 - 1 >= 0) colSet.add(op.g0 - 1); if (op.g1 <= N - 1) colSet.add(op.g1); }
    // [V-7] Stufenkanten: an jeder Höhenstufe ein Strang beidseitig der Kante.
    for (let k = 0; k < N - 1; k++) { if (topLage[k] !== topLage[k + 1]) { colSet.add(k); colSet.add(k + 1); } }
    // [V-3] Wunschpositionen: Mitte der i3-Steine der untersten Lage. Ein i2 hat keine
    // Rastermitte (zwei Zellen) und liefert deshalb keine Wunschposition — es wird geraten nicht.
    const wunsch = new Set();
    for (const st of (courses[0] ? courses[0].stones : [])) {
      const a = st.x0 / GRID, b = st.x1 / GRID;
      if (b - a === 3) wunsch.add(a + 1);
    }
    // [V-2] MUSS: jeder Stein jeder Lage wird von mindestens einer Achse durchgangen.
    // Stabbing-Greedy ueber alle Steine; gesetzt wird die RECHTESTE Zelle des Steins, weil sie
    // die meisten folgenden Steine miterschlaegt (minimale Achsenzahl). Liegt im Stein eine
    // Wunschposition nach [V-3], hat diese Vorrang vor der Reichweite — sie kostet hoechstens
    // zusaetzliche Achsen, nie die Abdeckung.
    for (const [a, b] of steinIv) {
      if (gehalten(colSet, a, b)) continue;
      let pos = b - 1;
      for (let k = b - 1; k >= a; k--) if (wunsch.has(k)) { pos = k; break; }
      colSet.add(pos);
    }
    // [V-4] Obergrenze: verbleibende Luecken > max_span_grid balanciert auffuellen (rein additiv,
    // die Abdeckung aus [V-2] bleibt dabei zwingend erhalten).
    const roh = [...colSet].filter(k => k >= 0 && k < N).sort((a, b) => a - b);
    const fin = new Set(roh);
    for (let i = 0; i + 1 < roh.length; i++) {
      if (roh[i + 1] - roh[i] > maxSpan) for (const c of balancedFill(roh[i], roh[i + 1], maxSpan)) fin.add(c);
    }
    colArr = [...fin].filter(k => k >= 0 && k < N).sort((a, b) => a - b);
  }
  // [V-2] Nachweis der Steinabdeckung. Im Auto-Pfad ist die Liste konstruktionsbedingt leer und
  // dient als Selbstkontrolle; bei manuellen Achsen ([V-9]) ist sie der geforderte Abgleich gegen
  // die Muss-Regel. Sichtbar gemeldet, aber KEIN Baubarkeitsausschluss: die Sonderkonstruktion
  // ist eine bewusste Anwenderentscheidung und wird nie still korrigiert.
  const achsSet = new Set(colArr);
  const ungehalteneSteine = [];
  for (const c of courses) for (const st of c.stones) {
    const a = st.x0 / GRID, b = st.x1 / GRID;
    if (!gehalten(achsSet, a, b))
      ungehalteneSteine.push({ lage: c.lage, start_grid: a, breite_grid: b - a, typ: st.type });
  }
  const columns = [];
  let anchSenkkopf = 0, anchSpannmutter = 0, anchSpannplatten = 0;
  for (const k of colArr) {
    const localTop = topLage[k] * COURSE;
    const segs = []; let r = 0;
    while (r < L) {
      if (!occ[r][k]) { r++; continue; }
      let r2 = r; while (r2 + 1 < L && occ[r2 + 1][k]) r2++;
      const z0 = r * COURSE, z1 = (r2 + 1) * COURSE, h = z1 - z0;
      // Anschluss-Ausbildung je Segmentende:
      //   Fuß der Wand (z0==0)      -> Bodenblech: Senkkopfschraube + Kopplungsmutter
      //   Wandoberkante (z1==Top)   -> Kopfblech (Spannmutter) ODER Spannplatte (Platte + Spannmutter)
      //   Zwischenende (an Öffnung) -> Spannplatte auf der Steinkante (Platte + Spannmutter)
      const bottomBase = z0 === 0;
      const topReach = z1 === localTop;
      // [Z-2]/[Z-3]/[Z-6] Die Stuecke eines Segments sind ECHTE Standardlaengen aus dem
      // Vorratssatz plus hoechstens ein Sonderzuschnitt; an der Wandoberkante sitzt darueber
      // zwingend das Reststueck. Diese Stueckliste ist die KANONISCHE Ableitung — Stueckzahl,
      // Kopplungen (Montage) und Mengen (BOM) lesen ausschliesslich sie, es gibt keine zweite
      // Rechnung aus einer pauschalen Stangenlaenge. Nur SEGMENTE MIT OBERKANTENBEZUG erhalten
      // Reststueck und Ueberstand — Bruestung/Sturz an einer Oeffnung bleiben unveraendert.
      const kombi = kombiniereSegment(h, PS.rod_lengths_mm, topReach, PS.rod_rest_mm, PS.rod_overhang_mm);
      const stuecke = kombi.stuecke, stueck = stuecke.length;
      const quelleSumme = stuecke.reduce((a, s) => a + s.quelle_mm, 0);
      const ankerUnten = bottomBase ? "bodenblech" : "spannplatte";
      const ankerOben = topReach ? (TOP === "blech" ? "kopfblech" : "spannplatte") : "spannplatte";
      let segSenkkopf = 0, segSpannmutter = 0, segSpannplatten = 0;
      if (bottomBase) segSenkkopf++; else { segSpannmutter++; segSpannplatten++; }
      if (ankerOben === "kopfblech") segSpannmutter++; else { segSpannmutter++; segSpannplatten++; }
      anchSenkkopf += segSenkkopf; anchSpannmutter += segSpannmutter; anchSpannplatten += segSpannplatten;
      segs.push({ z0_mm: z0, z1_mm: z1, lage0: r, lage1: r2 + 1, gewindestangen: stueck,
        stuecke, zuschnitt_konflikt: kombi.konflikt,
        // `bedarf_mm` = tatsaechlich zu bestueckende Stanglaenge (an der Oberkante h + Ueberstand,
        // sonst h). Der Verschnitt misst sich daran, damit der Ueberstand NICHT als Verschnitt
        // erscheint — er ist eingebautes Material.
        bedarf_mm: kombi.bedarf_mm, ueberstand_mm: kombi.bedarf_mm - h,
        letzte_stange_mm: stueck ? stuecke[stueck - 1].len_mm : h,
        // Ein Zuschnittkonflikt kann `stuecke` LEER lassen ([Z-6]: `reststueck_zu_lang`,
        // `kein_ausgangsprodukt`). Dann gibt es keine Stange, also auch keine Kopplung und
        // keinen Verschnitt: die Zaehlung darf nicht ins Negative laufen (−1 Kopplungsmutter
        // je Segment lief bisher in jede Summe und damit in die Stueckliste).
        verschnitt_mm: stueck ? quelleSumme - kombi.bedarf_mm : 0,
        verbindungsmuttern: Math.max(0, stueck - 1), anker_unten: ankerUnten, anker_oben: ankerOben,
        senkkopfschrauben: segSenkkopf, spannplatten: segSpannplatten, spannmuttern: segSpannmutter });
      r = r2 + 1;
    }
    if (!segs.length) continue;
    const durch = segs.length === 1 && segs[0].z0_mm === 0 && segs[0].z1_mm === topLage[k] * COURSE;
    columns.push({ k, x_mm: CHAMBER_OFFSET + GRID * k, durchgehend: durch, segments: segs,
      gewindestangen: segs.reduce((a, sg) => a + sg.gewindestangen, 0),
      verbindungsmuttern: segs.reduce((a, sg) => a + sg.verbindungsmuttern, 0),
      senkkopfschrauben: segs.reduce((a, sg) => a + sg.senkkopfschrauben, 0),
      spannplatten: segs.reduce((a, sg) => a + sg.spannplatten, 0),
      spannmuttern: segs.reduce((a, sg) => a + sg.spannmuttern, 0) });
  }
  let spanOk = true;
  for (let r = 0; r < L; r++) {
    let c = 0;
    while (c < N) {
      if (!occ[r][c]) { c++; continue; }
      let c2 = c; while (c2 + 1 < N && occ[r][c2 + 1]) c2++;   // gefüllter Bereich [c..c2]
      const present = columns.filter(col => col.k >= c && col.k <= c2 && col.segments.some(sg => sg.lage0 <= r && r < sg.lage1)).map(col => col.k);
      for (let i = 0; i < present.length - 1; i++) if (present[i + 1] - present[i] > maxSpan) spanOk = false;
      c = c2 + 1;
    }
  }
  // Stoßfugen (vertikale Fugen zwischen Steinen) -> Dichtstreifen (je 200 mm hoch = 1 Steinreihe)
  const stossfugen = courses.reduce((a, c) => a + c.joints_grid.length, 0);

  // Stahlbleche: Bodenblech immer über die volle Wandlänge; Kopfblech nur bei top_connection=='blech'
  const occCols = topLage.filter(t => t > 0).length;
  const topEdgeLen = occCols * GRID;
  const bodenModule = Math.ceil(lengthMm / PS.blech_mm);
  const kopfModule = (TOP === "blech") ? Math.ceil(topEdgeLen / PS.blech_mm) : 0;
  const basePlate = { rolle: "bodenblech", laenge_mm: lengthMm, breite_mm: THICK, dicke_mm: BLECH_THICK, modul_mm: PS.blech_mm, module: bodenModule };
  const topPlate = (TOP === "blech")
    ? { rolle: "kopfblech", laenge_mm: topEdgeLen, breite_mm: THICK, dicke_mm: BLECH_THICK, modul_mm: PS.blech_mm, module: kopfModule }
    : null;

  const bom = { i2: 0, i3: 0 };
  for (const c of courses) for (const s of c.stones) bom[s.type] += 1;
  bom.gewindestangen = columns.reduce((a, c) => a + c.gewindestangen, 0);
  bom.verbindungsmuttern = columns.reduce((a, c) => a + c.verbindungsmuttern, 0);
  bom.senkkopfschrauben = anchSenkkopf;
  bom.kopplungsmuttern_basis = anchSenkkopf;   // eine Kopplungsmutter je Fußanker
  bom.spannplatten = anchSpannplatten;
  bom.spannmuttern = anchSpannmutter;
  bom.stahlblech_module = bodenModule + kopfModule;
  bom.stahlblech_mm = lengthMm + (TOP === "blech" ? topEdgeLen : 0);
  bom.stahlblech_dicke_mm = BLECH_THICK;
  bom.stossfugen = stossfugen;
  bom.dichtstreifen_mm = stossfugen * COURSE;
  bom.verschnitt_mm = columns.reduce((a, c) => a + c.segments.reduce((b, sg) => b + sg.verschnitt_mm, 0), 0);

  // [Z-5]/[Z-6] Zuschnitt-Konflikte sichtbar machen (nie still): je betroffenes Segment ein
  // Eintrag. Sie sind KEIN Baubarkeitsausschluss (die Mengen bleiben unveraendert), sondern eine
  // ausdrueckliche Meldung, dass der Vorratssatz kein einbaubares Fertigmass zulaesst
  // (`mindestmass`/`kein_ausgangsprodukt`/`keine_standardlaenge`) bzw. dass fuer den oberen
  // Wandabschluss kein Reststueck gewaehlt ist (`kein_reststueck`) oder das gewaehlte laenger
  // ist als das ganze Segment (`reststueck_zu_lang`). Ohne Katalogauswahl ist das der
  // Regelfall — gemeldet statt still ein Mass zu erfinden.
  const zuschnittKonflikte = [];
  for (const col of columns) for (const sg of col.segments) {
    if (sg.zuschnitt_konflikt) {
      zuschnittKonflikte.push({ k: col.k, z0_mm: sg.z0_mm, z1_mm: sg.z1_mm,
        grund: sg.zuschnitt_konflikt, fertigmass_mm: sg.letzte_stange_mm });
    }
  }

  const buildable = invalidSegments.length === 0;  // strukturell; Versatz separat
  return {
    name, length_mm: lengthMm, height_mm: heightMm,
    grid_mm: GRID, course_mm: COURSE, thickness_mm: THICK, rod_mm: ROD_,
    N_grid: N, lagen: L,
    openings: openings.map(op => op.asDict()),
    steps: STEPS,
    sides: normSides(sides),
    prestress: PS,
    base_plate: basePlate, top_plate: topPlate,
    tension_columns: columns, bom,
    validation: {
      buildable, versatz_ok: versatzOk, versatz_violations: viol,
      tension_span_ok: spanOk, rigid_lagen: rigidLagen, invalid_segments: invalidSegments,
      zuschnitt_konflikte: zuschnittKonflikte,
      // [V-2] Steine ohne Spannachse. Auto-Pfad: immer leer. Manuelle Achsen: echter Befund.
      ungehaltene_steine: ungehalteneSteine,
    },
    courses,
  };
}

export const isBuildable = (w) => !!w.validation.buildable;

export const REFERENCE_WALLS = {
  ref1_glatte_wand: ["ref1_glatte_wand", 1000, 2000, []],
  ref2_wand_tuer: ["ref2_wand_tuer", 2000, 2600, [new Opening(5, 11, 0, 10, "tuer")]],
  ref3_wand_fenster: ["ref3_wand_fenster", 2000, 2600, [new Opening(6, 10, 4, 10, "fenster")]],
};
export function buildReference(key) {
  const [name, l, h, ops] = REFERENCE_WALLS[key];
  return buildWall(name, l, h, ops);
}
