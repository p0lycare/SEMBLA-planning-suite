// @ts-check
/**
 * SEMBLA Zeichnung — technische Zeichnung (Wandabwicklung) als Planblatt.
 *
 * Erzeugt aus dem KANONISCHEN Wandelement (Single Source of Truth) das
 * masstabsgetreue Zeichnungsblatt: Wandabwicklung mit Verlege- und Vorspannplan,
 * Bemassung, Blatt-Tabellen, Legende und Schriftfeld ([D-1] … [D-8]).
 *
 * Fachliche Herkunft: portiert aus dem Legacy-Modul
 * `legacy/Modul-Fertigung/SEMBLA_Fertigungszeichnung.html` (Wandabwicklung +
 * Bemassung + Schriftfeld), aber auf die heutige Architektur gezogen:
 *   * keine eigene Datenquelle (kein Datei-Upload) — nur das aktive Wandelement,
 *   * kein eigener Datei-Download und kein jsPDF — der ZIP-Export laeuft zentral
 *     ueber Modul 0 (`sembla-export.js`), gedruckt wird aus dem Modul heraus,
 *   * kein BOM-Duplikat — Mengen kommen aus `sembla-bom.js`,
 *   * Stangenstuecke und ihre Stoesse aus `stangenStuecke()` (`sembla-montage.js`), also
 *     aus derselben Ableitung wie Wandansicht und Montageanleitung ([D-4]) — inklusive
 *     des Ueberstands des Reststuecks ueber die Wandoberkante ([Z-6]),
 *   * Zuschnittkonflikte des Kerns stehen als Mangelblock auf dem Blatt ([Z-5]/[Z-6]):
 *     ein unvollstaendiger Zuschnitt wird nie als vollstaendiges Blatt ausgegeben.
 *
 * Masstab: `waehleMasstab()` waehlt aus der Normreihe den GROESSTEN Masstab, bei dem
 * die Wand ins nutzbare Zeichenfeld des Blattformats passt. Das SVG traegt
 * `width`/`height` in Papier-mm, ist also im Druck masstabsgetreu ([D-2]).
 *
 * Rein/DOM-frei (Rueckgabe sind SVG-/HTML-Zeichenketten). Eigene Datei nach der
 * shared/-Regel a+b: genutzt von Modul 7 (Vorschau + Druck) UND vom zentralen
 * Export in Modul 0 — beide Wege nutzen `blattHtml()`/`zeichnungSvg()`, es gibt
 * also nur EINE Zeichenableitung ([D-6]). Eigene Tests: `tests/module/test-zeichnung.mjs`.
 *
 * Einheiten: Wandmasse mm, Zeichenkoordinaten Papier-mm.
 */

import { semblaBomItems, semblaBomMenge } from "./sembla-bom.js";
import { stangenStuecke, topLagen, stueckFarbe, STUECK_FARBE, STUECK_LABEL } from "./sembla-montage.js";

const GRID_FALLBACK = 125, COURSE_FALLBACK = 200, ROD_FALLBACK = 1100;

const _grid = w => w.grid_mm || GRID_FALLBACK;
const _course = w => w.course_mm || COURSE_FALLBACK;
const _rod = w => w.rod_mm || ROD_FALLBACK;
const _lagen = w => w.lagen || Math.round(w.height_mm / _course(w));

const _fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const _esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Zahl auf 3 Dezimalen kuerzen — haelt die SVG-Zeichenkette stabil/vergleichbar. */
const _n = v => (Math.round((isFinite(v) ? v : 0) * 1000) / 1000).toString();

// ------------------------------------------------------------ Blatt & Masstab

/** Norm-Masstabsreihe (Zeichnung ist immer 1:x mit x aus dieser Reihe, [D-2]). */
export const MASSSTAEBE = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];

/**
 * Blattformate (quer). `feld_mm` = nutzbares Zeichenfeld nach Abzug von Rand,
 * Seitenspalte (Tabellen) und Schriftfeld; `druckhoehe_mm` = Blatt-Innenhoehe,
 * damit das Blatt im Druck genau eine Seite fuellt.
 */
export const BLATT = {
  a3: { label: "A3 quer", seite: "A3 landscape", rand_mm: 10, feld_mm: { w: 345, h: 200 }, druckhoehe_mm: 277 },
  a4: { label: "A4 quer", seite: "A4 landscape", rand_mm: 8, feld_mm: { w: 195, h: 135 }, druckhoehe_mm: 194 },
};

/** @type {ReadonlyArray<'a3'|'a4'>} */
export const FORMATE = ["a3", "a4"];

/** Zeichnungsrand (Papier-mm) fuer Masse, Reihennummern und Beschriftung. */
export const PAD_MM = 14;

/** Vom Zeichenfeld durch den Rand belegte Papier-mm (x / y; y zusaetzlich fuer die untere Masskette). */
const RAND_X = 2 * PAD_MM, RAND_Y = 2 * PAD_MM + 4;

/**
 * Standard-Darstellungsoptionen des Zeichnungsmoduls. Das sind AUSSCHLIESSLICH
 * Darstellungsoptionen — keine Geometrie-, Statik- oder Produktwerte; nichts
 * davon wird aus dem Wandelement kopiert ([D-7]).
 */
export function standardOptionen() {
  return { format: "a3", masse: true, steintypen: true, planinhalt: "Wandabwicklung", wasserzeichen: false };
}

/** Optionen normalisieren (unbekannt/fehlend -> Standard). */
export function normOptionen(o) {
  const s = standardOptionen();
  const z = o || {};
  return {
    format: FORMATE.includes(z.format) ? z.format : s.format,
    masse: z.masse === undefined ? s.masse : !!z.masse,
    steintypen: z.steintypen === undefined ? s.steintypen : !!z.steintypen,
    planinhalt: (z.planinhalt === undefined || z.planinhalt === null || z.planinhalt === "") ? s.planinhalt : String(z.planinhalt),
    wasserzeichen: !!z.wasserzeichen,
  };
}

/** Optionen aus dem Eingaben-Modell (`eingaben.zeichnung`) lesen und normalisieren. */
export function optionenAusEingaben(eingaben) {
  return normOptionen(eingaben && eingaben.zeichnung);
}

/**
 * Groesster Norm-Masstab, bei dem die Wand (mm) ins Zeichenfeld (Papier-mm) passt.
 * Passt sie in keinen, gilt der groebste der Reihe ([D-2]).
 *
 * Der Zeichnungsrand (Masse/Reihennummern, `PAD_MM`) wird MITGERECHNET: nur so passt
 * die fertige Zeichnung wirklich ins Feld. Sonst muesste der Browser sie im Druck
 * herunterskalieren und der angeschriebene Masstab waere falsch.
 * @param {number} L Wandlaenge mm @param {number} H Wandhoehe mm @param {'a3'|'a4'} [format]
 */
export function waehleMasstab(L, H, format = "a3") {
  const f = (BLATT[format] || BLATT.a3).feld_mm;
  const nutzbarW = Math.max(1, f.w - RAND_X), nutzbarH = Math.max(1, f.h - RAND_Y);
  const need = Math.max(L / nutzbarW, H / nutzbarH);
  return MASSSTAEBE.find(s => s >= need) || MASSSTAEBE[MASSSTAEBE.length - 1];
}

// ------------------------------------------------------------------- Farben

/**
 * Darstellungsschluessel der Zeichnung ([D-4]) — identisch in Vorschau und Export.
 * Die Stangenfarben kommen aus `STUECK_FARBE` (`sembla-montage.js`), damit Wandansicht
 * (Modul 1), Baugruppenbild (Modul 5) und Zeichnung denselben Zuschnitt gleich zeigen.
 */
export const FARBE = {
  i3: "#e3e6ea", i2: "#cbd0d6", stein_rand: "#9aa1a9", stein_text: "#7c838c",
  oeffnung: "#c9461c", kontur: "#13202e", stahl: "#5b6673", stahl_rand: "#3a4350",
  stange: STUECK_FARBE.standard, stange_sonder: STUECK_FARBE.sonder, stange_rest: STUECK_FARBE.rest,
  platte: "#14559c", mutter: "#0b3a73",
  mass: "#46505e", staffel: "#0a7f8c", reihe: "#8f96a0",
};

// ------------------------------------------------------- Planungshinweise [D-5]

/**
 * Vorspann-Zielregeln aus dem Legacy-Blatt, die die Suite NOCH NICHT rechnet. Sie sind
 * PLANUNGSHINWEISE und werden NICHT automatisch geprueft — das Blatt darf sie darum nie
 * als erfuellte Tatsache ausgeben ([D-5]). Titel und Fussnote sind Teil dieser Regel.
 *
 * [V-2] (jeder Stein von einer Spannachse gehalten) und [V-3] (Achsen mittig im i3 der
 * untersten Lage) sind seit der Umstellung der Achsverteilung im Rechenkern umgesetzt und
 * durch Regressionstests gedeckt. Sie stehen deshalb NICHT mehr hier, sondern in
 * GEPRUEFTE_REGELN — sie als ungeprueft auszuweisen waere ebenso unwahr wie umgekehrt.
 */
export const PLANUNGSHINWEISE = [
  { farbe: "#e8a01c", text: "Bei Öffnungen &gt; 750 mm: auf jeder Seite zwei Spannachsen nebeneinander." },
  { farbe: "#8b5cc7", text: "Jedes Blech muss von mindestens zwei Spannachsen gehalten werden." },
];

/**
 * Vorspann-Regeln, die der Rechenkern tatsaechlich einhaelt und die am gezeichneten
 * Wandelement nachweisbar sind. Nur solche duerfen als erfuellt dargestellt werden ([D-5]).
 */
export const GEPRUEFTE_REGELN = [
  { farbe: "#1f6feb", text: "Jeder Stein wird von mindestens einer Spannachse gehalten ([V-2])." },
  { farbe: "#1f9d55", text: "Automatisch gesetzte Spannachsen liegen möglichst mittig im i3-Stein der untersten Steinreihe ([V-3])." },
];

/** Ueberschrift der Liste der eingehaltenen Regeln ([D-5]). */
export const GEPRUEFT_TITEL = "Vom Rechenkern eingehaltene Vorspannregeln";

/** Ueberschrift der Hinweisliste — unmissverstaendlich als ungeprueft gekennzeichnet ([D-5]). */
export const HINWEIS_TITEL = "Planungshinweise / Zielregeln – nicht automatisch geprüft";

/** Fussnote zur Hinweisliste ([D-5]). */
export const HINWEIS_FUSS = "Diese Regeln sind Zielvorgaben für die Planung. Die Zeichnung stellt den "
  + "berechneten Zustand dar; ob die Regeln eingehalten sind, ist planerisch zu prüfen.";

/** Ueberschrift des Mangelblocks — Zuschnittkonflikte des Kerns ([Z-5]/[Z-6]). */
export const MANGEL_TITEL = "Zuschnittkonflikte – Blatt unvollständig";

/** Nachweis-Feld im Schriftfeld — nie „bestanden", kein Rueckgriff auf ein Rechenmodell ([D-8]). */
export const NACHWEIS_TEXT = "nicht Bestandteil dieser Zeichnung – separat prüfen";

// ------------------------------------------------------------------ Zeichnung

/** Segmente eines Strangs (Fallback fuer Alt-Bundles ohne `segments`). */
function _segmente(w, col) {
  if (Array.isArray(col.segments) && col.segments.length) return col.segments;
  return [{ z0_mm: 0, z1_mm: w.height_mm, gewindestangen: col.gewindestangen, anker_unten: "bodenblech", anker_oben: "kopfblech" }];
}

/** Lokale Wandoberkante an der x-Position (Staffelung, mm). */
function _obenBei(w, x_mm) {
  for (const st of (w.steps || [])) if (x_mm >= st.x0_mm && x_mm < st.x1_mm) return st.height_mm;
  return w.height_mm;
}

/**
 * Bemassungsschicht (Papier-mm): Gesamtmasse in m, Oeffnungs-/Bruestungs- und
 * Staffelungsmasse in cm ([D-3]).
 */
function _bemassung(w, X, Y, pad, wPx, hPx, sc, L, H, openings) {
  const C = FARBE.mass, A = FARBE.oeffnung, STP = FARBE.staffel;
  const mC = mm => _fmt(mm / 10, (mm / 10) % 1 !== 0 ? 1 : 0) + " cm";
  const mM = mm => _fmt(mm / 1000, 2) + " m";
  const T = 1.3, F = 2.4, LW = 0.3;
  const tk = (x, y, v) => v
    ? `<line x1="${_n(x - T)}" y1="${_n(y - T)}" x2="${_n(x + T)}" y2="${_n(y + T)}" stroke="${C}" stroke-width="${LW}"/>`
    : `<line x1="${_n(x - T)}" y1="${_n(y + T)}" x2="${_n(x + T)}" y2="${_n(y - T)}" stroke="${C}" stroke-width="${LW}"/>`;
  const lab = (x, y, t, c) => `<rect x="${_n(x - (t.length * 0.72 + 0.8))}" y="${_n(y - 2.7)}" width="${_n(t.length * 1.44 + 1.6)}" height="3.1" rx="0.5" fill="#fff" fill-opacity="0.85"/>`
    + `<text x="${_n(x)}" y="${_n(y - 0.4)}" font-size="${F}" fill="${c || C}" text-anchor="middle">${t}</text>`;
  const hD = (ax, bx, yp, t, c) => {
    const cc = c || C;
    return `<line x1="${_n(ax)}" y1="${_n(yp)}" x2="${_n(bx)}" y2="${_n(yp)}" stroke="${cc}" stroke-width="${LW}"/>` + tk(ax, yp) + tk(bx, yp) + lab((ax + bx) / 2, yp, t, cc);
  };
  const vD = (ay, by, xp, t, c) => {
    const cc = c || C, m = (ay + by) / 2;
    return `<line x1="${_n(xp)}" y1="${_n(ay)}" x2="${_n(xp)}" y2="${_n(by)}" stroke="${cc}" stroke-width="${LW}"/>` + tk(xp, ay, 1) + tk(xp, by, 1)
      + `<text x="${_n(xp - 1)}" y="${_n(m + 1)}" font-size="${F}" fill="${cc}" text-anchor="middle" transform="rotate(-90 ${_n(xp - 1)} ${_n(m + 1)})">${t}</text>`;
  };
  let s = "";
  const left0 = pad, right0 = pad + wPx, bot0 = Y(0), top0 = Y(H);
  s += hD(left0, right0, bot0 + 7, mM(L));
  s += vD(top0, bot0, left0 - 7, mM(H));
  for (const op of openings) {
    const L_ = Math.min(X(op.x0), X(op.x1)), R_ = Math.max(X(op.x0), X(op.x1)), T_ = Y(op.y1), B_ = Y(op.y0);
    s += hD(L_, R_, T_ - 2, mC(op.x1 - op.x0), A);
    s += vD(T_, B_, L_ - 2, mC(op.y1 - op.y0), A);
    if (op.y0 > 1e-6) s += vD(B_, bot0, L_ - 2, mC(op.y0), A);
  }
  for (const st of (w.steps || [])) {
    const L_ = Math.min(X(st.x0_mm), X(st.x1_mm)), R_ = Math.max(X(st.x0_mm), X(st.x1_mm)), T_ = Y(st.height_mm);
    s += hD(L_, R_, T_ - 2, mC(st.x1_mm - st.x0_mm), STP);
    s += vD(T_, bot0, R_ + 2, mC(st.height_mm), STP);
  }
  return s;
}

/** Bildunterschrift/Kopfzeile der Zeichnung (Wand, Masse, Masstab). */
export function zeichnungTitel(w, masstab, planinhalt = "Wandabwicklung") {
  return planinhalt + " · " + (w.name || "Wand") + " · "
    + _fmt(w.length_mm / 1000, 3) + " × " + _fmt(w.height_mm / 1000, 2) + " m · M 1:" + masstab;
}

/**
 * Masstabsgetreue Wandabwicklung als SVG.
 *
 * Zeichnet ausschliesslich aus dem Wandelement: Steine je Lage (i2/i3), Oeffnungen,
 * gestufte Kontur, Boden-/Kopfblech, Vorspannstraenge mit den REALEN Stangenstuecken
 * (Kopplungen, Sonderlaengen) und Ankerungen, Bemassung, Steinreihen-Nummerierung.
 *
 * @param {object} w Wandelement
 * @param {object} [opts] Darstellungsoptionen (siehe `normOptionen`)
 * @returns {{svg:string,inner:string,masstab:number,breite_mm:number,hoehe_mm:number,viewBox:string}}
 */
export function zeichnungSvg(w, opts = {}) {
  const o = normOptionen(opts);
  const G = _grid(w), C = _course(w), L = w.length_mm, H = w.height_mm;
  const masstab = waehleMasstab(L, H, o.format);
  const sc = 1 / masstab, pad = PAD_MM;              // sc: Papier-mm je Wand-mm
  const wPx = L * sc, hPx = H * sc, vbW = wPx + 2 * pad, vbH = hPx + 2 * pad + 4;
  const X = x => pad + x * sc, Y = y => pad + (hPx - y * sc);
  const SW = 0.22, LF = Math.min(3.2, C * sc * 0.55);
  let s = "";

  // Steine je Lage
  for (const c of (w.courses || [])) {
    const y1 = (c.lage + 1) * C, y0 = c.lage * C;
    for (const st of (c.stones || [])) {
      const fill = st.type === "i3" ? FARBE.i3 : FARBE.i2;
      s += `<rect x="${_n(X(st.x0))}" y="${_n(Y(y1))}" width="${_n((st.x1 - st.x0) * sc)}" height="${_n(C * sc)}" `
        + `fill="${fill}" stroke="${FARBE.stein_rand}" stroke-width="${SW}"/>`;
      if (o.steintypen && (st.x1 - st.x0) * sc > 7 && C * sc > 4.5)
        s += `<text x="${_n(X((st.x0 + st.x1) / 2))}" y="${_n(Y((y0 + y1) / 2) + LF * 0.35)}" font-size="${_n(LF)}" `
          + `fill="${FARBE.stein_text}" text-anchor="middle">${st.type}</text>`;
    }
  }

  // Oeffnungen
  for (const op of (w.openings || [])) {
    const x0 = op.g0 * G, x1 = op.g1 * G, y0 = op.l0 * C, y1 = op.l1 * C;
    s += `<rect x="${_n(X(x0))}" y="${_n(Y(y1))}" width="${_n((x1 - x0) * sc)}" height="${_n((y1 - y0) * sc)}" `
      + `fill="#fff" stroke="${FARBE.oeffnung}" stroke-width="${_n(SW * 1.6)}" stroke-dasharray="1.6 1.1"/>`;
    s += `<text x="${_n(X((x0 + x1) / 2))}" y="${_n(Y((y0 + y1) / 2) + 1)}" font-size="${_n(Math.min(3.4, LF * 1.2))}" `
      + `fill="${FARBE.oeffnung}" text-anchor="middle">${op.art === "fenster" ? "Fenster" : (op.art === "durchbruch" ? "Durchbruch" : "Tür")}</text>`;
  }

  // Gestufte Wandkontur (aus topLagen -> dieselbe Konturableitung wie die Montage)
  const tl = topLagen(w), N = tl.length;
  {
    const pts = [[0, 0], [0, tl[0] * C]];
    for (let k = 0; k < N; k++) {
      pts.push([(k + 1) * G, tl[k] * C]);
      if (k < N - 1 && tl[k + 1] !== tl[k]) pts.push([(k + 1) * G, tl[k + 1] * C]);
    }
    pts.push([L, 0], [0, 0]);
    s += `<polyline points="${pts.map(p => _n(X(p[0])) + "," + _n(Y(p[1]))).join(" ")}" fill="none" `
      + `stroke="${FARBE.kontur}" stroke-width="${_n(SW * 2.4)}"/>`;
  }

  // Anschluesse: Bodenblech durchgehend, Kopfblech je Rasterspalte (wenn oben Blech)
  const bth = Math.max(1.2, (w.bom && w.bom.stahlblech_dicke_mm ? w.bom.stahlblech_dicke_mm : 15) * sc);
  const topConn = (w.prestress && w.prestress.top_connection) || "blech";
  s += `<rect x="${_n(X(0))}" y="${_n(Y(0))}" width="${_n(L * sc)}" height="${_n(bth)}" `
    + `fill="${FARBE.stahl}" stroke="${FARBE.stahl_rand}" stroke-width="${_n(SW * 0.5)}"/>`;
  if (topConn === "blech") {
    for (let k = 0; k < N; k++) {
      const h = tl[k] * C;
      if (h <= 0) continue;
      s += `<rect x="${_n(X(k * G))}" y="${_n(Y(h) - bth)}" width="${_n(G * sc)}" height="${_n(bth)}" `
        + `fill="${FARBE.stahl}" stroke="${FARBE.stahl_rand}" stroke-width="${_n(SW * 0.4)}"/>`;
    }
  }

  // Vorspannstraenge: reale Segmente + reale Stangenstuecke (Kopplungen, Sonderlaengen)
  const pw = Math.max(2.2, 110 * sc);
  for (const col of (w.tension_columns || [])) {
    const x = X(col.x_mm), lt = _obenBei(w, col.x_mm);
    for (const sg of _segmente(w, col)) {
      // Gezeichnet werden die REALEN Stuecke samt Ueberstand des Reststuecks ([Z-6]/[D-4]) —
      // dieselbe Geometrie wie in Modul 1/5, deshalb aus `stangenStuecke()` und nicht aus den
      // Kopplungshoehen: die kappen den Ueberstand ab und liessen ein kurzes Reststueck
      // verschwinden. Ein leeres Ergebnis heisst gemeldeter Zuschnittkonflikt — dann wird
      // NICHTS gezeichnet, statt eine Stange zu erfinden (die Meldung steht im Blatt).
      const stuecke = stangenStuecke(w, sg);
      for (let i = 0; i < stuecke.length; i++) {
        const st = stuecke[i], letzter = i === stuecke.length - 1;
        // Das Reststueck ist kurz — es traegt deshalb zusaetzlich zur Farbe eine groessere
        // Strichstaerke, damit es auch im Schwarz-Weiss-Druck als eigenes Bauteil auffaellt.
        const dick = st.art === "rest" ? 3.4 : 2.6;
        s += `<line x1="${_n(x)}" y1="${_n(Y(st.z0_mm))}" x2="${_n(x)}" y2="${_n(Y(st.z1_mm))}" `
          + `stroke="${stueckFarbe(st.art)}" stroke-width="${_n(SW * dick)}"/>`;
        if (!letzter) s += `<circle cx="${_n(x)}" cy="${_n(Y(st.z1_mm))}" r="${_n(SW * 3)}" fill="${FARBE.mutter}"/>`;
      }
      const au = sg.anker_unten || (sg.z0_mm === 0 ? "bodenblech" : "spannplatte");
      const ao = sg.anker_oben || (sg.z1_mm === lt ? topConn : "spannplatte");
      if (au === "bodenblech") s += `<circle cx="${_n(x)}" cy="${_n(Y(sg.z0_mm))}" r="${_n(SW * 3)}" fill="${FARBE.mutter}"/>`;
      else s += `<rect x="${_n(x - pw / 2)}" y="${_n(Y(sg.z0_mm) - 1.8)}" width="${_n(pw)}" height="1.8" rx="0.3" fill="${FARBE.platte}"/>`;
      if (ao === "spannplatte") s += `<rect x="${_n(x - pw / 2)}" y="${_n(Y(sg.z1_mm))}" width="${_n(pw)}" height="1.8" rx="0.3" fill="${FARBE.platte}"/>`;
      else s += `<circle cx="${_n(x)}" cy="${_n(Y(sg.z1_mm))}" r="${_n(SW * 2.6)}" fill="${FARBE.mutter}"/>`;
    }
  }

  // Bemassung + Steinreihen-Nummerierung
  if (o.masse) {
    const ops = (w.openings || []).map(op => ({ x0: op.g0 * G, x1: op.g1 * G, y0: op.l0 * C, y1: op.l1 * C }));
    s += _bemassung(w, X, Y, pad, wPx, hPx, sc, L, H, ops);
  }
  for (let r = 0; r < _lagen(w); r++) {
    const yc = Y((r + 0.5) * C);
    s += `<text x="${_n(pad - 3)}" y="${_n(yc + 1)}" font-size="${_n(Math.min(3, LF))}" fill="${FARBE.reihe}" text-anchor="end">${r + 1}</text>`;
  }

  const viewBox = `0 0 ${_n(vbW)} ${_n(vbH)}`;
  // width/height in Papier-mm => im Druck exakt 1:masstab ([D-2])
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${_n(vbW)}mm" height="${_n(vbH)}mm" `
    + `preserveAspectRatio="xMidYMid meet" role="img" aria-label="${_esc(zeichnungTitel(w, masstab, o.planinhalt))}">${s}</svg>`;
  return { svg, inner: s, masstab, breite_mm: vbW, hoehe_mm: vbH, viewBox };
}

// ---------------------------------------------------------------- Blatt-Daten

/** Stuecklisten-Zeilen des Blattes (Mengen aus `sembla-bom.js`, nur Menge > 0). */
export function bomZeilen(w) {
  return semblaBomItems(w).filter(it => it.menge > 0).map(it => ({ label: it.label, menge: semblaBomMenge(it) }));
}

/** Vorspann-Kennzahlen des Blattes (reine Ablesewerte aus dem Wandelement). */
export function vorspannZeilen(w) {
  const ps = w.prestress || {};
  const cols = w.tension_columns || [];
  let stangen = 0, sonder = new Set(), rest = new Set(), restAnz = 0;
  for (const col of cols) {
    for (const sg of _segmente(w, col)) {
      const stuecke = stangenStuecke(w, sg);
      stangen += stuecke.length;
      for (const st of stuecke) {
        // [Z-6] Reststuecke werden GETRENNT ausgewiesen: eigenes Bauteil, eigene Katalogrolle —
        // sie duerfen nicht unter den Sonderlaengen mitlaufen.
        if (st.art === "rest") {
          restAnz++;
          if (st.len_mm != null) rest.add(Math.round(st.len_mm));
          continue;
        }
        if (st.art !== "sonder") continue;
        // Materiallaenge, nicht die gezeichnete Spanne — das Fertigmass steht im Blatt.
        const len = st.len_mm != null ? st.len_mm : sg.letzte_stange_mm;
        if (len != null) sonder.add(Math.round(len));
      }
    }
  }
  const rows = [
    { label: "Spannachsen", wert: String(cols.length) },
    { label: "max. Achsabstand", wert: ps.max_span_grid != null ? ps.max_span_grid + " Raster" : "–" },
    { label: "Startachse", wert: (ps.start_axis_grid ? 2 : 1) + ". Rasterachse" },
    { label: "Vorspannkraft N", wert: ps.force_kN != null ? _fmt(ps.force_kN, 0) + " kN" : "–" },
    { label: "Gewindestange", wert: _fmt(_rod(w) / 10, 0) + " cm" },
    { label: "Stangenstücke", wert: stangen + "×" },
    { label: "Sonderlängen", wert: sonder.size ? [...sonder].sort((a, b) => a - b).map(m => _fmt(m / 10, 0) + " cm").join(", ") : "–" },
    // [Z-6]: Ohne Reststueck ist der obere Abschluss OFFEN. Das wird beim Namen genannt und
    // nicht als „–" verschwiegen (ein „–" liest sich wie „nicht erforderlich"); ersetzt wird
    // es nie durch eine Standardlaenge. Die betroffenen Segmente stehen im Mangelblock.
    { label: "Reststück oben", wert: rest.size
        ? [...rest].sort((a, b) => a - b).map(m => _fmt(m / 10, 1) + " cm").join(", ") + " · " + restAnz + "×"
        : (konfliktZeilen(w).length ? "fehlt — siehe Zuschnittkonflikte" : "–") },
    { label: "oberer Anschluss", wert: ((w.prestress && w.prestress.top_connection) || "blech") === "blech" ? "Kopfblech" : "Spannplatte" },
  ];
  return rows;
}

/** Strangtabelle (je Spannachse Position und Stangenzahl) — Datenzugriff/Detailblatt. */
export function strangZeilen(w) {
  return (w.tension_columns || []).map(col => {
    let stangen = 0;
    for (const sg of _segmente(w, col)) stangen += stangenStuecke(w, sg).length;
    return { label: "k" + col.k + " · x = " + _fmt(col.x_mm / 10, 1) + " cm", wert: stangen + "×" };
  });
}

/**
 * Klartext der Zuschnittkonflikte ([Z-5]/[Z-6]) — je Grund ein Satz. Die Gruende sind die
 * des Rechenkerns (`validation.zuschnitt_konflikte[].grund`); ein unbekannter Grund wird
 * unveraendert benannt statt weggelassen.
 */
export const KONFLIKT_TEXT = {
  kein_reststueck: "Oberer Wandabschluss offen: kein Reststück gewählt ([Z-6]) — Vorspannung nicht bestückbar.",
  reststueck_zu_lang: "Gewähltes Reststück ist länger als das Segment ([Z-6]) — keine Zerlegung möglich.",
  mindestmass: "Fertigmaß unter dem Mindestmaß ([Z-5]) — weitere Standardlänge wählen.",
  kein_ausgangsprodukt: "Kein Ausgangsprodukt für das nötige Fertigmaß ([Z-2]/[Z-5]).",
  keine_standardlaenge: "Keine Standardlänge gewählt ([Z-1]) — Zerlegung nicht bestimmt.",
};

/**
 * Zuschnittkonflikte des Wandelements als Blattzeilen, gruppiert nach Grund.
 *
 * Das Blatt darf einen unvollstaendigen Zuschnitt NICHT als vollstaendig zeigen: fehlt das
 * Reststueck des oberen Abschlusses ([Z-6]), sind Zeichnung UND Stueckliste unvollstaendig,
 * und beides muss auf dem Blatt stehen — bisher war der Befund nur in Modul 1 sichtbar.
 * Gelesen wird ausschliesslich `validation.zuschnitt_konflikte`; hier wird nichts
 * nachgerechnet und nichts bewertet ([D-1]).
 */
export function konfliktZeilen(w) {
  const zk = (w.validation && w.validation.zuschnitt_konflikte) || [];
  const nach = new Map();
  for (const k of zk) {
    const g = String(k.grund || "unbekannt");
    const e = nach.get(g) || { grund: g, anzahl: 0, straenge: new Set() };
    e.anzahl++; if (k.k != null) e.straenge.add(k.k);
    nach.set(g, e);
  }
  return [...nach.values()].map(e => ({
    grund: e.grund,
    text: KONFLIKT_TEXT[e.grund] || e.grund,
    anzahl: e.anzahl,
    straenge: [...e.straenge].sort((a, b) => a - b),
  }));
}

/**
 * Mangelblock des Blattes ([Z-5]/[Z-6]) — leer, wenn es keinen Konflikt gibt (kein leerer
 * Kasten, wie bei der Legende in [D-4]).
 */
export function maengelHtml(w) {
  const z = konfliktZeilen(w);
  if (!z.length) return "";
  return `<div class="zmangel">`
    + z.map(e => `<div><span class="chip"></span><span>${_esc(e.text)} `
      + `Betrifft ${e.anzahl} Segment(e)`
      + (e.straenge.length ? ` in Spannachse ${e.straenge.map(k => "k" + k).join(", ")}` : "")
      + `.</span></div>`).join("")
    + `</div><div class="zfuss">Bis zur Behebung sind Zeichnung und Stückliste dieses Blattes `
    + `unvollständig: Für die betroffenen Segmente ist kein Zuschnitt bestimmt — es wird `
    + `ausdrücklich keine Länge und keine Ersatzstange angenommen.</div>`;
}

// ------------------------------------------------------------------ Blatt-HTML

const _tab = rows => `<table class="ztab"><tbody>`
  + rows.map(r => `<tr><td>${r.label}</td><td class="r">${_esc(r.wert !== undefined ? r.wert : r.menge)}</td></tr>`).join("")
  + `</tbody></table>`;

/**
 * Schriftfeld des Blattes. Kopfdaten kommen aus `eingaben.projekt` (Modul 0) —
 * die Zeichnung fuehrt keine eigenen Projektfelder ([D-7]). Das Nachweis-Feld ist
 * bewusst KEIN Ergebnisfeld ([D-8]).
 */
export function schriftfeldHtml(w, eingaben = {}, masstab = 25, opts = {}) {
  const o = normOptionen(opts);
  const p = (eingaben && eingaben.projekt) || {};
  const dim = _fmt(w.length_mm / 1000, 3) + " × " + _fmt(w.height_mm / 1000, 2) + " m";
  const row = (k, v) => `<div class="ztb-row"><div class="k">${k}</div><div class="v">${_esc(v) || "–"}</div></div>`;
  return `<div class="ztitleblock">`
    + `<div class="col">${row("Projekt", p.name || w.name)}${row("Bauherrenschaft", p.bauherr)}${row("Planverfasser", p.planverfasser)}</div>`
    + `<div class="col">${row("Phase", p.phase)}${row("Planinhalt", o.planinhalt)}${row("Wand", (w.name || "–") + " · " + dim)}</div>`
    + `<div class="col">`
    + row("Plan Nr.", p.plan_nr || "###")
    + row("Index", p.index)
    + `<div class="ztb-row"><div class="k">Maßstab</div><div class="v">1 : ${masstab}</div></div>`
    + row("Gez.", p.gez)
    + `<div class="ztb-row"><div class="k">Statik</div><div class="v nw">${NACHWEIS_TEXT}</div></div>`
    + `</div></div>`;
}

/** Legende des Darstellungsschluessels ([D-4]). */
export function legendeHtml() {
  const i = (c, cls) => `<i class="${cls || ""}" style="background:${c}"></i>`;
  return `<div class="zlegende">`
    + `<span>${i(FARBE.stange)}Gewindestange (${STUECK_LABEL.standard})</span>`
    + `<span>${i(FARBE.stange_sonder)}${STUECK_LABEL.sonder} / abgelängt</span>`
    + `<span>${i(FARBE.stange_rest)}${STUECK_LABEL.rest} ([Z-6])</span>`
    + `<span>${i(FARBE.mutter, "dot")}Kopplung / Verankerung</span>`
    + `<span>${i(FARBE.platte, "plate")}Spannplatte</span>`
    + `<span>${i(FARBE.stahl, "plate")}Boden-/Kopfblech</span>`
    + `<span>${i(FARBE.i3, "plate")}i3 (37,5 cm)</span>`
    + `<span>${i(FARBE.i2, "plate")}i2 (25 cm)</span>`
    + `</div>`;
}

/** Hinweisliste der noch ungerechneten Vorspann-Zielregeln — ausdruecklich ungeprueft ([D-5]). */
export function hinweiseHtml() {
  return `<div class="zregeln">`
    + PLANUNGSHINWEISE.map((r, i) => `<div><span class="chip" style="background:${r.farbe}"></span><span>${i + 1}. ${r.text}</span></div>`).join("")
    + `</div><div class="zfuss">${HINWEIS_FUSS}</div>`;
}

/** Liste der vom Rechenkern eingehaltenen Vorspannregeln ([D-5]). */
export function gepruefteHtml() {
  return `<div class="zregeln">`
    + GEPRUEFTE_REGELN.map((r, i) => `<div><span class="chip" style="background:${r.farbe}"></span><span>${i + 1}. ${r.text}</span></div>`).join("")
    + `</div>`;
}

/**
 * Das komplette Zeichnungsblatt als HTML-Baustein (Zeichnung + Tabellen + Legende
 * + Hinweise + Schriftfeld). Vorschau (Modul 7) und zentraler Export nutzen GENAU
 * diese Funktion — es gibt keine zweite Blatt-/Zeichenlogik ([D-6]).
 *
 * @param {object} w @param {object} [eingaben] @param {object} [opts]
 * @returns {{html:string,masstab:number,format:string,svg:string}}
 */
export function blattHtml(w, eingaben = {}, opts = {}) {
  const o = normOptionen(opts);
  const z = zeichnungSvg(w, o);
  const html = `<div class="zsheet fmt-${o.format}${o.wasserzeichen ? " wm" : ""}">`
    + (o.wasserzeichen ? `<div class="zwm"><span>Vorabzug</span></div>` : "")
    + `<div class="zdraw"><div class="zcap">${_esc(zeichnungTitel(w, z.masstab, o.planinhalt))}</div>`
    + `<div class="zsvg">${z.svg}</div></div>`
    + `<aside class="zside">`
    + `<div class="zbox"><h4>Stückliste (Mengen)</h4>${_tab(bomZeilen(w))}</div>`
    + `<div class="zbox"><h4>Vorspannung</h4>${_tab(vorspannZeilen(w))}</div>`
    // [Z-5]/[Z-6] Zuschnittkonflikte stehen VOR der Legende und nur, wenn es welche gibt:
    // ein unvollstaendiger Zuschnitt darf auf dem Blatt nicht als vollstaendig erscheinen.
    + (maengelHtml(w) ? `<div class="zbox mangel"><h4>${MANGEL_TITEL}</h4>${maengelHtml(w)}</div>` : "")
    + `<div class="zbox"><h4>Darstellung</h4>${legendeHtml()}</div>`
    + `<div class="zbox"><h4>${GEPRUEFT_TITEL}</h4>${gepruefteHtml()}</div>`
    + `<div class="zbox"><h4>${HINWEIS_TITEL}</h4>${hinweiseHtml()}</div>`
    + `</aside>`
    + schriftfeldHtml(w, eingaben, z.masstab, o)
    + `</div>`;
  return { html, masstab: z.masstab, format: o.format, svg: z.svg };
}

/** CSS des Blattes — von Vorschau (Modul 7) und Export-Dokument gemeinsam genutzt. */
export const ZEICHNUNG_CSS = `
  .zsheet{position:relative;background:#fff;color:#1c2430;
          font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          border:1px solid #b9c0c8;padding:14px;display:grid;
          grid-template-columns:1fr 300px;grid-template-rows:1fr auto;gap:10px}
  .zsheet.fmt-a3{aspect-ratio:420/297}
  .zsheet.fmt-a4{aspect-ratio:297/210}
  .zwm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
       pointer-events:none;z-index:20;overflow:hidden}
  .zwm span{transform:rotate(-32deg);font-size:150px;font-weight:800;letter-spacing:8px;
            text-transform:uppercase;color:rgba(201,70,28,.14);white-space:nowrap;
            -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .zdraw{grid-column:1;grid-row:1;border:1px solid #dfe3e8;border-radius:3px;
         display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .zcap{font-size:12px;font-weight:600;padding:5px 8px;border-bottom:1px solid #dfe3e8;color:#33414f;flex:0 0 auto}
  .zsvg{flex:1;display:flex;align-items:center;justify-content:center;padding:6px;min-height:0}
  .zsvg svg{max-width:100%;max-height:100%;width:auto;height:auto;display:block}
  .zside{grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden}
  .zbox{border:1px solid #dfe3e8;border-radius:3px;padding:7px 9px}
  .zbox h4{margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#6b7682}
  table.ztab{width:100%;border-collapse:collapse;font-size:11px}
  table.ztab td{padding:1.5px 2px;vertical-align:top}
  table.ztab td.r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .zregeln{font-size:10px;line-height:1.4}
  .zregeln div{display:flex;gap:6px;margin:3px 0}
  .zregeln .chip{flex:0 0 10px;height:10px;border-radius:2px;margin-top:1px}
  .zbox.mangel{border-color:#c9461c;border-width:1.5px}
  .zbox.mangel h4{color:#c9461c}
  .zmangel{font-size:10px;line-height:1.4}
  .zmangel div{display:flex;gap:6px;margin:3px 0}
  .zmangel .chip{flex:0 0 10px;height:10px;border-radius:2px;margin-top:1px;background:#c9461c;
                 -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .zfuss{font-size:9.5px;color:#6b7682;margin-top:4px;line-height:1.4}
  .zlegende{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:10px}
  .zlegende span{display:flex;align-items:center;gap:4px}
  .zlegende i{width:14px;height:4px;border-radius:2px;display:inline-block}
  .zlegende i.plate{height:9px;width:11px}
  .zlegende i.dot{height:8px;width:8px;border-radius:50%}
  .ztitleblock{grid-column:1 / span 2;grid-row:2;display:grid;
               grid-template-columns:2.2fr 1.2fr 1.1fr;border:1.5px solid #13202e;
               border-radius:3px;overflow:hidden;font-size:11px}
  .ztitleblock .col{border-right:1px solid #cfd5db}
  .ztitleblock .col:last-child{border-right:none}
  .ztb-row{display:grid;grid-template-columns:96px 1fr;border-bottom:1px solid #e3e7ec}
  .ztb-row:last-child{border-bottom:none}
  .ztb-row .k{background:#f4f6f8;color:#6b7682;font-size:9.5px;text-transform:uppercase;
              letter-spacing:.3px;padding:4px 7px;border-right:1px solid #e3e7ec;display:flex;align-items:center}
  .ztb-row .v{padding:4px 7px;font-weight:600;display:flex;align-items:center}
  .ztb-row .v.nw{font-weight:500;color:#7d2a10;font-size:10px}
`;

/** Druck-CSS je Blattformat (eine Seite, quer) — @page + Blatt-Innenhoehe. */
export function druckCss(format = "a3") {
  const b = BLATT[FORMATE.includes(format) ? format : "a3"];
  return `@page{size:${b.seite};margin:${b.rand_mm}mm}`
    + `@media print{html,body{background:#fff;margin:0;padding:0}`
    + `.zsheet{width:auto;max-width:none;border:none;box-shadow:none;aspect-ratio:auto;height:${b.druckhoehe_mm}mm;overflow:hidden}`
    + `.zwm span{color:rgba(201,70,28,.22)}}`;
}

/**
 * Vollstaendiges, selbsttragendes Zeichnungsblatt als HTML-Dokument (druckbar,
 * „Als PDF speichern" liefert das A3-/A4-Blatt). Kein Fremd-Lib, kein jsPDF.
 */
export function zeichnungDokument(w, eingaben = {}, opts = {}) {
  const b = blattHtml(w, eingaben, opts);
  const titel = "SEMBLA Zeichnung — " + (w.name || "Wandelement");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${_esc(titel)}</title>`
    + `<style>body{margin:0;padding:8mm;background:#eceef1}${ZEICHNUNG_CSS}${druckCss(b.format)}</style>`
    + `</head><body>${b.html}</body></html>`;
}

/**
 * Die Zeichnung als eigenstaendige SVG-Datei (masstabsgetreu, mm-Masse im
 * Wurzelelement). Enthaelt zusaetzlich die Kopfzeile mit Wand, Massen und Masstab,
 * damit die Datei fuer sich lesbar ist ([D-2]).
 */
export function zeichnungSvgDatei(w, eingaben = {}, opts = {}) {
  const o = normOptionen(opts);
  const z = zeichnungSvg(w, o);
  const kopf = 6;                                     // Papier-mm fuer die Kopfzeile
  const vbW = z.breite_mm, vbH = z.hoehe_mm + kopf;
  const titel = zeichnungTitel(w, z.masstab, o.planinhalt);
  const p = (eingaben && eingaben.projekt) || {};
  const sub = [p.name, p.plan_nr ? "Plan " + p.plan_nr : "", p.index ? "Index " + p.index : "",
    "Statik: " + NACHWEIS_TEXT].filter(Boolean).join(" · ");
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${_n(vbW)} ${_n(vbH)}" `
    + `width="${_n(vbW)}mm" height="${_n(vbH)}mm">\n`
    + `<title>${_esc(titel)}</title>\n`
    + `<rect x="0" y="0" width="${_n(vbW)}" height="${_n(vbH)}" fill="#ffffff"/>\n`
    + `<text x="3" y="4" font-size="2.8" font-family="sans-serif" fill="${FARBE.kontur}">${_esc(titel)}</text>\n`
    + `<text x="3" y="${_n(vbH - 1.4)}" font-size="2" font-family="sans-serif" fill="${FARBE.mass}">${_esc(sub)}</text>\n`
    + `<g transform="translate(0 ${kopf})">${z.inner}</g>\n`
    + `</svg>\n`;
}
