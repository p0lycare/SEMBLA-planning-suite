// @ts-check
/**
 * SEMBLA Lageplan — technische Draufsicht eines Geschosses als Planblatt
 * (Modul 9, Kapitel 16.11, [N-1] … [N-8]).
 *
 * Erzeugt aus den KANONISCHEN Daten — Projektmappe (Struktur, Lage, Bemassungen),
 * Wandspeicher (Hoehe, Wandtyp) und dem deterministischen Constraint-Loeser — das
 * masstabsgetreue Lageplanblatt: Draufsicht aller zugeordneten und gueltig
 * verorteten Waende, vorhandene treibende Bemassungen, Legende, Wandkennzeichnung,
 * Vollstaendigkeitsmeldungen und Schriftfeld.
 *
 * Abgrenzung — was dieses Modul ausdruecklich NICHT ist:
 *   * **keine Bearbeitung.** Der Layout-Editor (`geschossplan.html`) bleibt der
 *     einzige Ort, an dem Lage und Bemassungen entstehen ([N-1]). Hier wird nur
 *     gelesen: es gibt keine Schreibfunktion, keinen Speicherzugriff, keinen
 *     zweiten Verortungsweg.
 *   * **keine eigene Wandgeometrie.** Rechtecke, Bezuege und Masse kommen aus
 *     `sembla-constraints.js` und `sembla-massbild.js` — demselben Baustein, mit
 *     dem der Editor zeichnet ([N-5]). Eine nachgebaute zweite Zeichenrechnung
 *     waere genau die Drift, die das verhindert.
 *   * **keine zweite Lagehaltung.** Jede Ausgabe entsteht frisch aus
 *     (Mappe, Geschoss, Loeserergebnis) ([N-3]); wo Masse bestimmen, ist das
 *     Loesungsergebnis maszgebend und nicht die gespeicherte Rohposition ([N-4]).
 *   * **kein Planbild.** Der Geschossplan ist Hintergrund der Verortung und keine
 *     Datenquelle ([L-9]); im Ausgabeblatt hat ein Rasterbild nichts zu suchen.
 *   * **kein IFC/BIM, keine Planerkennung, keine Mengen-/Kostenrechnung.**
 *
 * Massstab: `waehleMasstab()` waehlt aus der Bauzeichnungsreihe den GROESSTEN
 * Massstab, bei dem das Geschoss ins nutzbare Zeichenfeld passt. Das SVG traegt
 * `width`/`height` in Papier-mm, ist also im Druck masstabsgetreu. Passt das
 * Geschoss selbst bei 1:500 nicht, bleibt es bei 1:500 und das Blatt sagt
 * sichtbar, dass es zu gross ist — es wird weder beschnitten noch gekachelt
 * und nie ein Massstab ausserhalb der Reihe erfunden ([N-8]).
 *
 * Rein und DOM-frei (Rueckgabe sind SVG-/HTML-Zeichenketten). Eigene Datei nach
 * shared-Regel a+b: genutzt von Modul 9 (Vorschau) UND von dessen Export — beide
 * Wege laufen durch `blattHtml()`/`lageplanSvg()`, es gibt also nur EINE
 * Zeichenableitung (Muss 9). Eigene Tests: `tests/module/test-lageplan.mjs`.
 *
 * Einheiten: Wand- und Lagemasse mm, Zeichenkoordinaten Papier-mm.
 */

import {
  ACHSEN, FARBEN, GRID_MM, HALB_BREITE_MM,
  normLage, laengeMm, wandRechteck, pruefeGeschoss, zustand,
} from "./sembla-constraints.js";
import { massKontext, massGeometrie, massAnker, massPfad } from "./sembla-massbild.js";
import { findeGeschoss, kopfdaten as mappeKopfdaten, laengenAbgleich } from "./sembla-projektmappe.js";

// ------------------------------------------------------------ Blatt & Masstab

/**
 * Massstabsreihe des Bauzeichnens fuer Grundrisse/Lageplaene. Bewusst NICHT die
 * Reihe der Wandabwicklung (Modul 7): ein Geschoss ist um Groessenordnungen
 * groesser als eine einzelne Wand, 1:5 … 1:20 waeren dort nie erreichbar.
 */
export const MASSSTAEBE = [50, 100, 200, 250, 500];

/**
 * Blattformate (quer). `feld_mm` = nutzbares Zeichenfeld nach Abzug von Rand,
 * Seitenspalte (Legende/Tabelle/Meldungen) und Schriftfeld; `druckhoehe_mm` =
 * Blatt-Innenhoehe, damit das Blatt im Druck genau eine Seite fuellt.
 */
export const BLATT = {
  a3: { label: "A3 quer", seite: "A3 landscape", rand_mm: 10, feld_mm: { w: 345, h: 200 }, druckhoehe_mm: 277 },
  a4: { label: "A4 quer", seite: "A4 landscape", rand_mm: 8, feld_mm: { w: 195, h: 135 }, druckhoehe_mm: 194 },
};

/** @type {ReadonlyArray<'a3'|'a4'>} */
export const FORMATE = ["a3", "a4"];

/** Zeichnungsrand (Papier-mm) fuer Wandnamen und Massbeschriftung. */
export const PAD_MM = 10;

/** Vom Zeichenfeld durch den Rand belegte Papier-mm. */
const RAND_X = 2 * PAD_MM, RAND_Y = 2 * PAD_MM;

/**
 * Blickfeld, wenn im Geschoss keine einzige Wand verortet ist: 10 m im Quadrat um
 * den Geschossursprung. Das ist eine ANSICHT, keine erfundene Geometrie — gezeichnet
 * wird nichts, und der leere Stand wird als solcher gemeldet ([N-7]).
 */
const LEER_FELD_MM = 10000;

/** Papier-mm, um die die Massbeschriftung ueber ihrer Masslinie steht. */
const MASSTEXT_MM = 1.6;

/**
 * Darstellungsschluessel des Blattes. `fehler` uebernimmt bewusst die Fehlerfarbe
 * des Editors ([K-8]): eine an Widerspruch oder Kollision beteiligte Wand ist auch
 * im ausgedruckten Plan als solche erkennbar.
 */
export const FARBE = {
  wand: "#d7dbe0", wand_rand: "#13202e", mittellinie: "#7c838c",
  fehler: FARBEN.fehler, frei: "#5b6673",
  mass: "#33415c", text: "#1c2430", raster: "#c9d2dc", ursprung: "#33415c",
};

// ------------------------------------------------------------------- Helfer

const _esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
  (c) => /** @type {any} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Zahl auf 3 Dezimalen kuerzen — haelt die SVG-Zeichenkette stabil/vergleichbar. */
const _n = (v) => (Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000).toString();

const _fmt = (n, d = 0) => (Number.isFinite(n) ? n : 0)
  .toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Ein Feld des Schriftfelds/der Tabelle: leer bleibt leer, nie „undefined". */
const _wert = (v) => (v == null || v === "" ? "–" : String(v));

// -------------------------------------------------------- Darstellungsoptionen

/**
 * Standard-Darstellungsoptionen. Das sind AUSSCHLIESSLICH Darstellungsoptionen und
 * werden bewusst NICHT gespeichert: Modul 9 legt keine neue Datenstruktur an und
 * schreibt keinen `eingaben`-Abschnitt.
 */
export function standardOptionen() {
  return { format: "a3", masse: true, kennzeichnung: true, raster: false, wasserzeichen: false };
}

/** Optionen normalisieren (unbekannt/fehlend -> Standard). */
export function normOptionen(o) {
  const s = standardOptionen();
  const z = o || {};
  return {
    format: FORMATE.includes(z.format) ? z.format : s.format,
    masse: z.masse === undefined ? s.masse : !!z.masse,
    kennzeichnung: z.kennzeichnung === undefined ? s.kennzeichnung : !!z.kennzeichnung,
    raster: z.raster === undefined ? s.raster : !!z.raster,
    wasserzeichen: !!z.wasserzeichen,
  };
}

/**
 * Groesster Massstab der Reihe, bei dem das Geschoss (mm) ins Zeichenfeld
 * (Papier-mm) passt. Der Zeichnungsrand wird mitgerechnet — nur so passt die
 * fertige Zeichnung wirklich ins Feld und der angeschriebene Massstab stimmt.
 * Passt es in keinen, gilt der groebste der Reihe ([N-8]).
 * @param {number} breite_mm @param {number} hoehe_mm @param {'a3'|'a4'} [format]
 */
export function waehleMasstab(breite_mm, hoehe_mm, format = "a3") {
  const f = (BLATT[format] || BLATT.a3).feld_mm;
  const nutzbarW = Math.max(1, f.w - RAND_X), nutzbarH = Math.max(1, f.h - RAND_Y);
  const need = Math.max(Number(breite_mm) / nutzbarW, Number(hoehe_mm) / nutzbarH);
  return MASSSTAEBE.find((s) => s >= need) || MASSSTAEBE[MASSSTAEBE.length - 1];
}

// ------------------------------------------------------------------ Ableitung

/**
 * Die EINE frische Ableitung eines Geschosses ([N-3]). Sie liest ausschliesslich
 * kanonische Daten und rechnet jedes Mal neu; es gibt keinen Zwischenstand und
 * keine zweite Lagehaltung.
 *
 * @param {{mappe:any, geschossId:string,
 *          elemente?:Array<{id:string,name?:string,wandelement?:any}>}} arg
 *   `elemente` sind die vorhandenen Wandelemente (Form von `listeElemente()`).
 *   Sie liefern AUSSCHLIESSLICH Hoehe und Wandtyp — die Mappe kennt beides nicht
 *   und bekommt keine Kopie ([P-1]). Fehlt ein Element, ist der Eintrag verwaist
 *   ([L-4]) und es wird nichts geraten.
 */
export function lageplanDaten({ mappe, geschossId, elemente }) {
  const treffer = geschossId ? findeGeschoss(mappe, geschossId) : null;
  if (!treffer) {
    throw new Error(`Geschoss „${geschossId || "—"}“ gibt es in dieser Projektmappe nicht.`);
  }
  const { gebaeude, geschoss } = treffer;
  const projekt = mappeKopfdaten(mappe);            // { name, …kopfdaten } ([N-6])

  /** @type {Map<string, any>} */
  const nachId = new Map();
  for (const e of (Array.isArray(elemente) ? elemente : [])) {
    if (e && e.id != null) nachId.set(String(e.id), e);
  }

  const waendeRoh = geschoss.waende;
  const bemassungenRoh = geschoss.bemassungen || [];
  // Der kanonische Loeser — dieselbe Funktion, die der Editor nach jeder Aenderung
  // fährt. Iteration, Toleranz oder Startwerte gibt es hier so wenig wie dort ([K-5]).
  const erg = pruefeGeschoss(waendeRoh, bemassungenRoh);
  const koll = erg.kollisionen || [];
  const ctx = massKontext(waendeRoh, erg);

  /** @type {Array<{art:string,text:string}>} */
  const meldungen = [];
  /** @type {Array<{art:string,text:string}>} */
  const hinweise = [];
  const name = (id) => {
    const w = waendeRoh.find((x) => x.id === String(id));
    return (w && (w.name || w.id)) || String(id);
  };

  const waende = waendeRoh.map((w) => {
    const el = nachId.get(w.id) || null;
    const we = el && el.wandelement ? el.wandelement : null;
    const lage = normLage(w.lage);
    const pos = erg.positionen[w.id];
    const rechteck = w.lage == null ? null : wandRechteck(w.lage, pos);
    const bestimmt = erg.bestimmt[w.id] || { x: false, y: false };
    const eintrag = {
      id: w.id,
      name: w.name || w.id,
      verwaist: !el,
      richtung: lage ? lage.richtung : null,
      laenge_mm: laengeMm(w.lage),
      hoehe_mm: we && Number.isFinite(+we.height_mm) ? +we.height_mm : null,
      wandtyp: we && we.wandtyp ? String(we.wandtyp) : null,
      rechteck,
      bestimmt,
      zustand: zustand(w.id, erg, { kollisionen: koll }),
    };
    if (w.lage == null) {
      meldungen.push({ art: "unverortet", text:
        `Wand „${eintrag.name}“ ist im Geschoss eingetragen, aber nicht verortet — sie fehlt `
        + "deshalb im Plan. Verortet wird sie im Layout-Editor ([L-4])." });
    }
    if (eintrag.verwaist) {
      meldungen.push({ art: "verwaist", text:
        `Wand „${eintrag.name}“ ist ein verwaister Eintrag: zu dieser Kennung gibt es kein `
        + "Wandelement. Höhe und Wandtyp bleiben deshalb offen ([L-4])." });
    }
    if (we) {
      const ab = laengenAbgleich(w.lage, we.length_mm);
      if (ab.abweichung) {
        meldungen.push({ art: "laenge", text:
          `Wand „${eintrag.name}“: gezeichnete Länge ${_fmt(ab.lage_mm)} mm, Wandelement `
          + `${_fmt(ab.wand_mm)} mm. Die Abweichung wird gemeldet, nicht angeglichen ([L-3]).` });
      }
    }
    if (w.lage != null && !(bestimmt.x && bestimmt.y)) {
      // [K-8]: „frei" ist der Normalfall vor dem Bemassen und kein Mangel des Blattes.
      hinweise.push({ art: "unbestimmt", text:
        `Wand „${eintrag.name}“ ist ${bestimmt.x ? "nur in x" : bestimmt.y ? "nur in y" : "in keiner Achse"}`
        + " durch Maße bestimmt — die Lage stammt insoweit aus der gezeichneten Position ([K-8])." });
    }
    return eintrag;
  });

  // Bemassungen: Reihenfolge und Index sind die der Mappe — die Staffelung der
  // Massdarstellung haengt daran und ist damit dieselbe wie im Editor ([N-5]).
  const massbilder = bemassungenRoh.map((bm, i) => massGeometrie(bm, i, ctx));
  bemassungenRoh.forEach((bm, i) => {
    if (massbilder[i]) return;
    meldungen.push({ art: "mass_ohne_wand", text:
      `Bemaßung „${bm && bm.id ? bm.id : "ohne Kennung"}“ ist nicht darstellbar (ein Bezug fehlt `
      + "oder seine Wand ist nicht verortet) — gemeldet statt still entfernt ([L-4])." });
  });

  for (const w of (erg.widersprueche || [])) {
    meldungen.push({ art: "widerspruch", text:
      `Widerspruch: Bemaßung „${w.bemassung}“ weicht um ${_fmt(Math.abs(w.differenz_mm))} mm vom `
      + `bereits festgelegten Abstand in ${w.achse} ab`
      + (w.konflikt_mit ? ` (im Widerspruch zu „${w.konflikt_mit}“)` : "")
      + ". Die Positionen behalten den letzten widerspruchsfreien Stand ([K-6])." });
  }
  for (const k of koll) {
    meldungen.push({ art: "kollision", text:
      `Kollision: „${name(k.a)}“ und „${name(k.b)}“ überlappen sich um `
      + `${_fmt(k.ueberlappung_mm.x)} × ${_fmt(k.ueberlappung_mm.y)} mm — gemeldet, nichts `
      + "verschoben ([K-13])." });
  }
  for (const f of (erg.fehler || [])) {
    meldungen.push({ art: "massfehler", text: `Ungültige Bemaßung: ${f}` });
  }
  for (const r of (erg.redundanzen || [])) {
    hinweise.push({ art: "redundanz", text:
      `Bemaßung „${r.bemassung}“ wiederholt in ${r.achse} widerspruchsfrei einen bereits `
      + "bestimmten Abstand (redundant) — Hinweis, kein Fehler; sie bleibt wirksam ([K-7])." });
  }
  if (!waende.some((w) => w.rechteck)) {
    meldungen.push({ art: "leer", text:
      "In diesem Geschoss ist keine Wand verortet — der Plan bleibt leer. Es wird keine Lage "
      + "erfunden ([L-1])." });
  }

  return {
    projekt: { id: (mappe && mappe.projekt && mappe.projekt.id) || null, name: projekt.name },
    gebaeude: { id: gebaeude.id, name: gebaeude.name },
    geschoss: { id: geschoss.id, name: geschoss.name, hoehe_mm: geschoss.hoehe_mm },
    kopfdaten: projekt,
    waende,
    bemassungen: bemassungenRoh,
    massbilder,
    ergebnis: erg,
    kollisionen: koll,
    meldungen,
    hinweise,
    /** [N-7]: nur ein mangelfreier Stand wird als vollstaendig ausgegeben. */
    vollstaendig: meldungen.length === 0,
  };
}

/**
 * Ausdehnung des Blattinhalts in Weltmillimetern: alle Wandrechtecke und — wenn
 * dargestellt — alle Masse. `null` = nichts Verortetes.
 * @param {any} daten @param {{masse?:boolean}} [o]
 */
export function ausdehnung(daten, o) {
  let x_min = Infinity, x_max = -Infinity, y_min = Infinity, y_max = -Infinity;
  const dazu = (a, b, c, d) => {
    x_min = Math.min(x_min, a); y_min = Math.min(y_min, b);
    x_max = Math.max(x_max, c); y_max = Math.max(y_max, d);
  };
  for (const w of daten.waende) {
    if (w.rechteck) dazu(w.rechteck.x_min, w.rechteck.y_min, w.rechteck.x_max, w.rechteck.y_max);
  }
  if (!o || o.masse !== false) {
    // Die Masse liegen bereits als GEMEINSAME Geometrie vor — genau die, mit der
    // gezeichnet wird. Ein zweiter Rechenweg fuer die Ausdehnung koennte davon
    // abweichen und das Blatt beschneiden.
    for (const g of daten.massbilder) {
      if (!g) continue;
      for (const l of [g.v1, g.v2]) {
        for (const q of [g.q1, g.q2, g.q]) {
          if (g.achse === "x") dazu(l, q, l, q); else dazu(q, l, q, l);
        }
      }
    }
  }
  return Number.isFinite(x_min) ? { x_min, y_min, x_max, y_max } : null;
}

// ------------------------------------------------------------------ Zeichnung

/**
 * Die Draufsicht als SVG in Papier-Millimetern (im Druck echt 1:x).
 *
 * @param {any} daten Ergebnis von `lageplanDaten`
 * @param {any} [opts]
 * @returns {{svg:string, inner:string, masstab:number, passt:boolean,
 *            breite_mm:number, hoehe_mm:number, benoetigt:number}}
 */
export function lageplanSvg(daten, opts) {
  const o = normOptionen(opts);
  const feld = (BLATT[o.format] || BLATT.a3).feld_mm;
  const a = ausdehnung(daten, o) || {
    x_min: -LEER_FELD_MM / 2, y_min: -LEER_FELD_MM / 2,
    x_max: LEER_FELD_MM / 2, y_max: LEER_FELD_MM / 2,
  };
  const bW = Math.max(GRID_MM, a.x_max - a.x_min), bH = Math.max(GRID_MM, a.y_max - a.y_min);
  const masstab = waehleMasstab(bW, bH, /** @type {any} */ (o.format));
  const benoetigt = Math.max(bW / Math.max(1, feld.w - RAND_X), bH / Math.max(1, feld.h - RAND_Y));
  // [N-8]: Passt es selbst im groebsten Massstab nicht, bleibt der Massstab in der
  // Reihe und das Blatt sagt es. Beschnitten oder gekachelt wird NICHTS — die
  // Zeichnung bleibt vollstaendig, auch wenn sie dann ueber das Feld hinausragt.
  const passt = benoetigt <= masstab;

  /** Welt-mm -> Papier-mm. */
  const X = (v) => PAD_MM + (v - a.x_min) / masstab;
  const Y = (v) => PAD_MM + (v - a.y_min) / masstab;
  const S = (v) => v / masstab;
  const breite_mm = bW / masstab + RAND_X, hoehe_mm = bH / masstab + RAND_Y;

  const teile = [];

  if (o.raster) {
    // Reine Orientierungshilfe im 125-mm-Raster ([G-1]) — nur, wenn sie ueberhaupt
    // lesbar ist; sonst waere es eine graue Flaeche, die Masse verdeckt.
    const w = S(GRID_MM);
    if (w >= 1.2) {
      const d = [];
      for (let g = Math.ceil(a.x_min / GRID_MM); g * GRID_MM <= a.x_max; g++) {
        d.push(`M${_n(X(g * GRID_MM))} ${_n(Y(a.y_min))}V${_n(Y(a.y_max))}`);
      }
      for (let g = Math.ceil(a.y_min / GRID_MM); g * GRID_MM <= a.y_max; g++) {
        d.push(`M${_n(X(a.x_min))} ${_n(Y(g * GRID_MM))}H${_n(X(a.x_max))}`);
      }
      teile.push(`<path class="lpraster" d="${d.join("")}" fill="none" stroke="${FARBE.raster}"`
        + ` stroke-width="0.08"/>`);
    }
  }

  // Der Geschossursprung ist der einzige Grundbezug ([K-4]) und gehoert damit ins Blatt.
  if (a.x_min <= 0 && a.x_max >= 0 && a.y_min <= 0 && a.y_max >= 0) {
    const k = 2.2;
    teile.push(`<g class="lpursprung"><path d="M${_n(X(0) - k)} ${_n(Y(0))}H${_n(X(0) + k)}`
      + `M${_n(X(0))} ${_n(Y(0) - k)}V${_n(Y(0) + k)}" fill="none" stroke="${FARBE.ursprung}"`
      + ` stroke-width="0.2"/><text x="${_n(X(0) + k + 0.6)}" y="${_n(Y(0) - 0.8)}"`
      + ` font-size="1.8" fill="${FARBE.ursprung}">0/0</text></g>`);
  }

  for (const w of daten.waende) {
    if (!w.rechteck) continue;                       // unverortet: gemeldet, nicht gezeichnet
    const r = w.rechteck;
    const farbe = w.zustand === "fehler" ? FARBE.fehler : FARBE.wand_rand;
    const x = X(r.x_min), y = Y(r.y_min), bw = S(r.x_max - r.x_min), bh = S(r.y_max - r.y_min);
    const st = [`<g class="lpwand z-${w.zustand}" data-wand="${_esc(w.id)}">`,
      `<rect x="${_n(x)}" y="${_n(y)}" width="${_n(bw)}" height="${_n(bh)}"`
      + ` fill="${w.zustand === "fehler" ? FARBE.fehler : FARBE.wand}"`
      + ` fill-opacity="${w.zustand === "fehler" ? ".22" : "1"}" stroke="${farbe}"`
      + ` stroke-width="0.25"><title>${_esc(w.name)}</title></rect>`];
    // Mittellinie gestrichelt: sie ist Bezug ([K-2]), keine Bauteilkante.
    const mx1 = w.richtung === "x" ? x : x + bw / 2, mx2 = w.richtung === "x" ? x + bw : mx1;
    const my1 = w.richtung === "x" ? y + bh / 2 : y, my2 = w.richtung === "x" ? my1 : y + bh;
    st.push(`<line x1="${_n(mx1)}" y1="${_n(my1)}" x2="${_n(mx2)}" y2="${_n(my2)}"`
      + ` stroke="${FARBE.mittellinie}" stroke-width="0.1" stroke-dasharray="1.2 0.8"/>`);
    if (o.kennzeichnung) {
      const cx = x + bw / 2, cy = y + bh / 2;
      const dreh = w.richtung === "y" ? ` transform="rotate(-90 ${_n(cx)} ${_n(cy)})"` : "";
      st.push(`<text x="${_n(cx)}" y="${_n(cy + 0.75)}" font-size="2.1" text-anchor="middle"`
        + ` fill="${FARBE.text}"${dreh}>${_esc(w.name)}</text>`);
    }
    st.push("</g>");
    teile.push(st.join(""));
  }

  if (o.masse) {
    const streitig = new Set((daten.ergebnis.widersprueche || [])
      .flatMap((w) => [w.bemassung, w.konflikt_mit]).filter(Boolean));
    const doppelt = new Set((daten.ergebnis.redundanzen || []).map((r) => r.bemassung));
    daten.massbilder.forEach((g, i) => {
      if (!g) return;
      // Umgerechnet wird die GEMEINSAME Geometrie — Werte, Bezuege, Staffelung,
      // `linie_mm` und `text_mm` stehen damit exakt wie im Editor ([N-5]).
      const p = {
        achse: g.achse,
        v1: g.achse === "x" ? X(g.v1) : Y(g.v1), v2: g.achse === "x" ? X(g.v2) : Y(g.v2),
        q1: g.achse === "x" ? Y(g.q1) : X(g.q1), q2: g.achse === "x" ? Y(g.q2) : X(g.q2),
        q: g.achse === "x" ? Y(g.q) : X(g.q),
        versatz: { x: S(g.versatz.x), y: S(g.versatz.y) },
      };
      const streit = streitig.has(g.id);
      const farbe = streit ? FARBE.fehler : FARBE.mass;
      const t = massAnker(p, 0).anker;
      const dreh = g.achse === "y" ? ` transform="rotate(-90 ${_n(t.x)} ${_n(t.y)})"` : "";
      teile.push(`<g class="lpmass${streit ? " streit" : ""}${doppelt.has(g.id) ? " redundant" : ""}"`
        + ` data-bemassung="${_esc(g.id)}">`
        + `<path d="${massPfad(p, 1, _n)}" fill="none" stroke="${farbe}" stroke-width="0.16"`
        + (doppelt.has(g.id) && !streit ? ` stroke-dasharray="1.4 0.8"` : "") + `/>`
        + `<text x="${_n(t.x)}" y="${_n(t.y - MASSTEXT_MM)}" font-size="2" text-anchor="middle"`
        + ` fill="${farbe}"${dreh}>${_esc(String(g.mass))} mm${streit ? " ⚠" : ""}</text></g>`);
      void i;
    });
  }

  const inner = teile.join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${_n(breite_mm)} ${_n(hoehe_mm)}"`
    + ` width="${_n(breite_mm)}mm" height="${_n(hoehe_mm)}mm" class="lpdraw">`
    + `<rect x="0" y="0" width="${_n(breite_mm)}" height="${_n(hoehe_mm)}" fill="#ffffff"/>`
    + inner + `</svg>`;
  return { svg, inner, masstab, passt, breite_mm, hoehe_mm, benoetigt };
}

// -------------------------------------------------------------- Blattbausteine

/** Titel des Blattes — Projekt, Gebaeude, Geschoss, Massstab. */
export function lageplanTitel(daten, masstab) {
  return `Lageplan ${daten.geschoss.name} · ${daten.gebaeude.name} · ${daten.projekt.name}`
    + ` — 1 : ${masstab}`;
}

/**
 * Schriftfeld des Blattes. Kopfdaten kommen AUSSCHLIESSLICH aus
 * `mappe.projekt.kopfdaten` ([N-6]/[L-11]) — der wandbezogene Altbestand
 * `eingaben.projekt` wird hier nie herangezogen, weil ein Lageplan keine
 * einzelne Wand hat und es immer genau eine Quelle geben muss.
 */
export function schriftfeldHtml(daten, masstab, opts) {
  const o = normOptionen(opts);
  const k = daten.kopfdaten || {};
  const b = BLATT[o.format] || BLATT.a3;
  const row = (label, wert, cls) => `<div class="lptb-row"><div class="k">${label}</div>`
    + `<div class="v${cls ? " " + cls : ""}">${_esc(_wert(wert))}</div></div>`;
  return `<div class="lptitleblock">`
    + `<div class="col">${row("Projekt", daten.projekt.name)}`
    + row("Bauherrenschaft", k.bauherr) + row("Planverfasser", k.planverfasser) + `</div>`
    + `<div class="col">${row("Gebäude", daten.gebaeude.name)}`
    + row("Geschoss", daten.geschoss.name)
    + row("Planinhalt", "Lageplan (Draufsicht)") + `</div>`
    + `<div class="col">${row("Plan Nr.", k.plan_nr || "###")}`
    + row("Index", k.index)
    + `<div class="lptb-row"><div class="k">Maßstab</div><div class="v">1 : ${masstab}`
    + `${daten._passt === false ? " (Blatt zu klein)" : ""}</div></div>`
    + row("Gez.", k.gez) + `</div>`
    + `<div class="col">${row("Phase", k.phase)}`
    + row("Blattformat", b.label)
    + row("Stand", daten.vollstaendig ? "vollständig" : "nicht vollständig",
      daten.vollstaendig ? "" : "warn")
    + `</div></div>`;
}

/** Legende des Darstellungsschluessels. */
export function legendeHtml() {
  const i = (c, cls) => `<i class="${cls || ""}" style="background:${c}"></i>`;
  return `<div class="lplegende">`
    + `<span>${i(FARBE.wand, "plate")}Wand (125 mm breit)</span>`
    + `<span>${i(FARBE.mittellinie)}Mittellinie (Bezug, [K-2])</span>`
    + `<span>${i(FARBE.mass)}treibende Bemaßung ([K-3])</span>`
    + `<span>${i(FARBE.fehler, "plate")}Widerspruch / Kollision ([K-6]/[K-13])</span>`
    + `</div>`;
}

/** Wandtabelle: Kennzeichnung, Länge, Höhe, Wandtyp, Bestimmtheit. */
export function wandTabelleHtml(daten) {
  const typ = (t) => (t === "ohne_wind" ? "ohne Wind" : t === "mit_wind" ? "mit Wind" : "–");
  const best = (b) => (b.x && b.y ? "x/y" : b.x ? "nur x" : b.y ? "nur y" : "frei");
  const zeilen = daten.waende.map((w) => `<tr><td>${_esc(w.name)}</td>`
    + `<td class="r">${w.laenge_mm == null ? "–" : _fmt(w.laenge_mm) + " mm"}</td>`
    + `<td class="r">${w.hoehe_mm == null ? "–" : _fmt(w.hoehe_mm) + " mm"}</td>`
    + `<td>${_esc(typ(w.wandtyp))}</td>`
    + `<td>${w.rechteck ? _esc(best(w.bestimmt)) : "unverortet"}</td></tr>`).join("");
  return `<table class="lptab"><thead><tr><th>Wand</th><th class="r">Länge</th>`
    + `<th class="r">Höhe</th><th>Wandtyp</th><th>Lage</th></tr></thead>`
    + `<tbody>${zeilen || '<tr><td colspan="5">keine Wand eingetragen</td></tr>'}</tbody></table>`;
}

/**
 * Meldungen und Hinweise auf dem Blatt ([N-7]). Ein unvollstaendiger Stand steht
 * ausdruecklich als solcher da — er wird nie als vollstaendig ausgegeben.
 */
export function meldungenHtml(daten) {
  const liste = (arr, cls) => arr.map((m) => `<li class="${cls}">${_esc(m.text)}</li>`).join("");
  if (!daten.meldungen.length && !daten.hinweise.length) {
    return `<div class="lpmeld"><p class="ok">Vollständig: alle eingetragenen Wände sind verortet, `
      + `keine Widersprüche, keine Kollisionen.</p></div>`;
  }
  return `<div class="lpmeld">`
    + (daten.meldungen.length
      ? `<p class="warn"><b>Dieser Lageplan ist nicht vollständig</b> — `
        + `${daten.meldungen.length} Punkt(e):</p><ul>${liste(daten.meldungen, "warn")}</ul>`
      : `<p class="ok">Vollständig: keine offenen Punkte.</p>`)
    + (daten.hinweise.length
      ? `<p class="hint">Hinweise (kein Mangel):</p><ul>${liste(daten.hinweise, "hint")}</ul>`
      : "")
    + `</div>`;
}

/**
 * Das komplette Lageplanblatt als HTML-Baustein. Vorschau (Modul 9) und Export
 * nutzen GENAU diese Funktion — es gibt keine zweite Blatt-/Zeichenlogik (Muss 9).
 *
 * @param {any} daten @param {any} [opts]
 * @returns {{html:string, svg:string, masstab:number, passt:boolean, format:string, optionen:any}}
 */
export function blattHtml(daten, opts) {
  const o = normOptionen(opts);
  const z = lageplanSvg(daten, o);
  const mit = { ...daten, _passt: z.passt };
  const html = `<div class="lpsheet fmt-${o.format}${o.wasserzeichen ? " wm" : ""}">`
    + (o.wasserzeichen ? `<div class="lpwm"><span>Vorabzug</span></div>` : "")
    + `<div class="lpdrawbox"><div class="lpcap">${_esc(lageplanTitel(daten, z.masstab))}</div>`
    + (z.passt ? "" : `<div class="lpzugross">Das Geschoss ist für dieses Blatt <b>zu groß</b>: `
      + `selbst 1 : ${MASSSTAEBE[MASSSTAEBE.length - 1]} genügt nicht `
      + `(benötigt wären 1 : ${Math.ceil(z.benoetigt)}). Die Zeichnung bleibt vollständig und wird `
      + `weder beschnitten noch gekachelt — der Ausdruck ist dann aber <b>nicht maßstabsgetreu</b>. `
      + `Größeres Blattformat wählen oder das Geschoss fachlich teilen ([N-8]).</div>`)
    + `<div class="lpsvg">${z.svg}</div></div>`
    + `<aside class="lpside">`
    + `<div class="lpbox"><h4>Wände im Geschoss</h4>${wandTabelleHtml(daten)}</div>`
    + `<div class="lpbox"><h4>Darstellung</h4>${legendeHtml()}</div>`
    + `<div class="lpbox"><h4>Vollständigkeit</h4>${meldungenHtml(daten)}</div>`
    + `</aside>`
    + schriftfeldHtml(mit, z.masstab, o)
    + `</div>`;
  return { html, svg: z.svg, masstab: z.masstab, passt: z.passt, format: o.format, optionen: o };
}

/** CSS des Blattes — von Vorschau (Modul 9) und Export-Dokument gemeinsam genutzt. */
export const LAGEPLAN_CSS = `
  .lpsheet{position:relative;background:#fff;color:#1c2430;
           font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
           border:1px solid #b9c0c8;padding:14px;display:grid;
           grid-template-columns:1fr 300px;grid-template-rows:1fr auto;gap:10px}
  .lpsheet.fmt-a3{aspect-ratio:420/297}
  .lpsheet.fmt-a4{aspect-ratio:297/210}
  .lpwm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        pointer-events:none;z-index:20;overflow:hidden}
  .lpwm span{transform:rotate(-32deg);font-size:150px;font-weight:800;letter-spacing:8px;
             text-transform:uppercase;color:rgba(201,70,28,.14);white-space:nowrap;
             -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lpdrawbox{grid-column:1;grid-row:1;border:1px solid #dfe3e8;border-radius:3px;
             display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .lpcap{font-size:12px;font-weight:600;padding:5px 8px;border-bottom:1px solid #dfe3e8;
         color:#33414f;flex:0 0 auto}
  .lpzugross{font-size:10.5px;line-height:1.45;padding:5px 8px;background:#fbe6dd;color:#7d2a10;
             border-bottom:1px solid #f0cdbe;flex:0 0 auto}
  .lpsvg{flex:1;display:flex;align-items:center;justify-content:center;padding:6px;min-height:0}
  .lpsvg svg{max-width:100%;max-height:100%;width:auto;height:auto;display:block}
  .lpside{grid-column:2;grid-row:1;display:flex;flex-direction:column;gap:8px;min-height:0;
          overflow:hidden}
  .lpbox{border:1px solid #dfe3e8;border-radius:3px;padding:7px 9px;min-height:0;overflow:hidden}
  .lpbox h4{margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#6b7682}
  table.lptab{width:100%;border-collapse:collapse;font-size:10.5px}
  table.lptab th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.3px;
                 color:#6b7682;border-bottom:1px solid #e3e7ec;padding:1px 2px;font-weight:600}
  table.lptab td{padding:1.5px 2px;vertical-align:top;border-bottom:1px solid #f1f3f6}
  table.lptab td.r,table.lptab th.r{text-align:right;font-variant-numeric:tabular-nums}
  .lplegende{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:10px}
  .lplegende span{display:flex;align-items:center;gap:4px}
  .lplegende i{width:14px;height:4px;border-radius:2px;display:inline-block}
  .lplegende i.plate{height:9px;width:11px}
  .lpmeld{font-size:9.5px;line-height:1.45}
  .lpmeld p{margin:0 0 3px}
  .lpmeld ul{margin:0 0 5px;padding-left:14px}
  .lpmeld li{margin:1px 0}
  .lpmeld .warn{color:#7d2a10}
  .lpmeld .ok{color:#1f6f45}
  .lpmeld .hint{color:#6b7682}
  .lptitleblock{grid-column:1 / span 2;grid-row:2;display:grid;
                grid-template-columns:1.4fr 1.1fr 1.1fr 1fr;border:1.5px solid #13202e;
                border-radius:3px;overflow:hidden;font-size:11px}
  .lptitleblock .col{border-right:1px solid #cfd5db}
  .lptitleblock .col:last-child{border-right:none}
  .lptb-row{display:grid;grid-template-columns:92px 1fr;border-bottom:1px solid #e3e7ec}
  .lptb-row:last-child{border-bottom:none}
  .lptb-row .k{background:#f4f6f8;color:#6b7682;font-size:9.5px;text-transform:uppercase;
               letter-spacing:.3px;padding:4px 7px;border-right:1px solid #e3e7ec;
               display:flex;align-items:center}
  .lptb-row .v{padding:4px 7px;font-weight:600;display:flex;align-items:center}
  .lptb-row .v.warn{color:#7d2a10}
`;

/** Druck-CSS je Blattformat (eine Seite, quer) — @page + Blatt-Innenhoehe. */
export function druckCss(format = "a3") {
  const b = BLATT[FORMATE.includes(/** @type {any} */ (format)) ? format : "a3"];
  return `@page{size:${b.seite};margin:${b.rand_mm}mm}`
    + `@media print{html,body{background:#fff;margin:0;padding:0}`
    + `.lpsheet{width:auto;max-width:none;border:none;box-shadow:none;aspect-ratio:auto;`
    + `height:${b.druckhoehe_mm}mm;overflow:hidden}`
    + `.lpwm span{color:rgba(201,70,28,.22)}}`;
}

/**
 * Vollstaendiges, selbsttragendes Lageplanblatt als HTML-Dokument (druckbar,
 * „Als PDF speichern" liefert das A3-/A4-Blatt). Kein Fremd-Baustein noetig.
 */
export function lageplanDokument(daten, opts) {
  const b = blattHtml(daten, opts);
  const titel = "SEMBLA Lageplan — " + daten.projekt.name + " · " + daten.geschoss.name;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">`
    + `<title>${_esc(titel)}</title>`
    + `<style>body{margin:0;padding:8mm;background:#eceef1}${LAGEPLAN_CSS}${druckCss(b.format)}</style>`
    + `</head><body>${b.html}</body></html>`;
}

/**
 * Die Draufsicht als eigenstaendige SVG-Datei (masstabsgetreu, mm-Masse im
 * Wurzelelement). Enthaelt eine Kopf- und eine Fusszeile, damit die Datei fuer sich
 * lesbar ist — Projekt, Gebaeude, Geschoss, Massstab und der Vollstaendigkeitsstand.
 */
export function lageplanSvgDatei(daten, opts) {
  const o = normOptionen(opts);
  const z = lageplanSvg(daten, o);
  const kopf = 6;                                     // Papier-mm fuer die Kopfzeile
  const vbW = z.breite_mm, vbH = z.hoehe_mm + kopf + 4;
  const titel = lageplanTitel(daten, z.masstab);
  const k = daten.kopfdaten || {};
  const sub = [k.plan_nr ? "Plan " + k.plan_nr : "", k.index ? "Index " + k.index : "",
    daten.vollstaendig ? "Stand: vollständig"
      : `Stand: nicht vollständig (${daten.meldungen.length} Punkt(e), s. Blatt)`,
    z.passt ? "" : "Blatt zu klein — nicht maßstabsgetreu"].filter(Boolean).join(" · ");
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${_n(vbW)} ${_n(vbH)}" `
    + `width="${_n(vbW)}mm" height="${_n(vbH)}mm">\n`
    + `<title>${_esc(titel)}</title>\n`
    + `<rect x="0" y="0" width="${_n(vbW)}" height="${_n(vbH)}" fill="#ffffff"/>\n`
    + `<text x="3" y="4" font-size="2.8" font-family="sans-serif" fill="${FARBE.wand_rand}">`
    + `${_esc(titel)}</text>\n`
    + `<text x="3" y="${_n(vbH - 1.4)}" font-size="2" font-family="sans-serif" fill="${FARBE.mass}">`
    + `${_esc(sub)}</text>\n`
    + `<g transform="translate(0 ${kopf})">${z.inner}</g>\n`
    + `</svg>\n`;
}

/**
 * Dateinamen-Rumpf der Ausgabe — aus Projekt und Geschoss der AUSWAHL abgeleitet,
 * damit die Datei zum sichtbaren Blattbezug passt ([N-2]).
 */
export function dateiRumpf(daten) {
  const sicher = (s) => String(s == null ? "" : s)
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unbenannt";
  return `SEMBLA_Lageplan_${sicher(daten.projekt.name)}_${sicher(daten.geschoss.name)}`;
}

/**
 * Die beiden Ausgabedateien des Moduls. Vorschau und Export laufen durch denselben
 * Pfad — der Export ist nur die Verpackung dessen, was im Blatt steht (Muss 9).
 * @returns {Array<{name:string, data:string}>}
 */
export function lageplanDateien(daten, opts) {
  const rumpf = dateiRumpf(daten);
  return [
    { name: rumpf + ".html", data: lageplanDokument(daten, opts) },
    { name: rumpf + ".svg", data: lageplanSvgDatei(daten, opts) },
  ];
}

/** Nur weitergereicht, damit Aufrufer nicht zwei Bausteine fuer dieselben Achsen brauchen. */
export { ACHSEN, GRID_MM, HALB_BREITE_MM };
