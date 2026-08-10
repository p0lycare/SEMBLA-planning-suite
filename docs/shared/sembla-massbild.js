// @ts-check
/**
 * SEMBLA Massbild — die gemeinsame Weltgeometrie der MASSDARSTELLUNG
 * (Kapitel 16.10 [K-*], Kapitel 16.11 [N-5]).
 *
 * Bis Issue #54 lag diese Rechnung ausschliesslich inline in
 * `docs/geschossplan.html`. Mit Modul 9 (Lageplan) gibt es einen ZWEITEN Leser,
 * der dieselben Masse BITGENAU so zeigen muss wie der Editor: gleiche Bezuege,
 * gleiche Werte, gleiche Staffelung, gleiche gespeicherten Darstellungsversaetze
 * `linie_mm`/`text_mm` ([N-5]). Eine zweite, nachgebaute Zeichenrechnung waere genau
 * die Copy-Paste-Drift, die das verhindert — deshalb wohnt sie hier, und beide
 * Seiten rechnen ausschliesslich damit. Die Bearbeitungsoberflaeche wird dadurch
 * NICHT zur Ausgabequelle: sie ist gleichrangiger Aufrufer wie das Blatt.
 *
 * Hier steht ausdruecklich NUR die Weltgeometrie in Millimetern. In der jeweiligen
 * Oberflaeche bleiben:
 *   * Blick und Strichbreiten (Zoom, `V.mm`, Papier-mm),
 *   * Trefferradien und Trefferflaechen,
 *   * der LAUFENDE Zug der Bedienung (er wird als `opt.zusatz_q` hereingegeben und
 *     ist ausdruecklich nichts Gespeichertes),
 *   * Farben, Klassen und Beschriftungstexte.
 *
 * Zwei Darstellungsfelder wirken — und nur hier:
 *
 *   * `linie_mm` verschiebt die GANZE Massdarstellung quer zur Messrichtung
 *     (Masslinie, Zahl und die dadurch laenger/kuerzer werdenden Hilfslinien). Die
 *     FUSSPUNKTE (`q1`/`q2`) bleiben an den unveraenderten Bezuegen — das Mass
 *     bleibt, was es misst.
 *   * `text_mm` verschiebt allein die Zahl relativ dazu.
 *
 * Beide aendern NIE Masswert, Bezuege oder Achse und erreichen den Loeser nie
 * ([K-5]): dieses Modul rechnet, der Loeser in `sembla-constraints.js` sieht die
 * Felder nicht. Fehlen sie, steht alles bitgenau an der automatisch gestaffelten
 * Stelle — es wird keine erfunden.
 *
 * Rein und DOM-frei. Eigene Datei nach shared-Regel a+b: zwei Nutzer
 * (`docs/geschossplan.html`, `docs/shared/sembla-lageplan.js`) und eigene Tests
 * (`tests/module/test-massbild.mjs`).
 *
 * Einheiten: Millimeter (Weltkoordinaten des Geschosses).
 */

import { ACHSEN, normBemassung, bezugsWert, wandRechteck, normLage } from "./sembla-constraints.js";

/**
 * Abstand der Masslinie vom Bauteil, je Mass gestaffelt, damit sich Masse nicht
 * decken. Die Staffelung haengt am INDEX des Masses in der Liste des Geschosses —
 * sie ist damit reihenfolgetreu und in Editor und Blatt dieselbe.
 */
export const MASS_ABSTAND_MM = 250;

/**
 * Nachschlagekontext fuer die Massgeometrie: Lage und GELOESTE Position je Wand.
 *
 * Die geloeste Position schlaegt die gespeicherte Rohposition ([N-4]): wo Masse
 * bestimmen, ist das Loesungsergebnis maszgebend, und `lage.start_mm` bleibt der
 * letzte gueltige gespeicherte Stand (kein Rueckschreiben, keine zweite Wahrheit).
 *
 * @param {Array<{id:string, lage:any}>} waende
 * @param {{positionen?:Record<string,{x:number,y:number}>}} [ergebnis] Ergebnis von `loese`/`pruefeGeschoss`
 * @returns {{lage:(id:string)=>any, position:(id:string)=>({x:number,y:number}|undefined)}}
 */
export function massKontext(waende, ergebnis) {
  /** @type {Map<string,any>} */
  const lagen = new Map();
  for (const w of (Array.isArray(waende) ? waende : [])) {
    const id = w && w.id != null ? String(w.id) : "";
    if (id) lagen.set(id, w.lage ?? null);
  }
  const pos = (ergebnis && ergebnis.positionen) || {};
  return {
    lage: (id) => (lagen.has(String(id)) ? lagen.get(String(id)) : undefined),
    position: (id) => pos[String(id)],
  };
}

/**
 * Lage eines Bemassungs-Endpunkts: Wert auf der Achse und Mitte quer dazu.
 * `null` (Endpunkt) = Geschossursprung ([K-4]); `null` (Rueckgabe) = nicht
 * darstellbar (unbekannte oder unverortete Wand) — es wird keine Null geraten.
 *
 * @param {any} p Endpunkt `{wand,bezug}` oder `null`
 * @param {'x'|'y'} achse
 * @param {{lage:(id:string)=>any, position:(id:string)=>any}} ctx
 * @returns {{wert:number, quer:number}|null}
 */
export function massEndpunkt(p, achse, ctx) {
  if (p == null) return { wert: 0, quer: 0 };
  const lage = ctx.lage(p.wand);
  if (lage == null) return null;
  const pos = ctx.position(p.wand);
  const wert = bezugsWert(lage, achse, p.bezug, pos);
  const r = wandRechteck(lage, pos);
  if (wert == null || !r) return null;
  return { wert, quer: achse === "x" ? (r.y_min + r.y_max) / 2 : (r.x_min + r.x_max) / 2 };
}

/**
 * Geometrie einer Bemassung in Weltkoordinaten (mm). `null` = nicht darstellbar.
 *
 * @param {any} bem die Bemassung (roh oder normalisiert)
 * @param {number} idx Index in der Massliste des Geschosses (Staffelung)
 * @param {{lage:(id:string)=>any, position:(id:string)=>any}} ctx
 * @param {{zusatz_q?:number}} [opt] laufender, NICHT gespeicherter Querversatz der Bedienung
 * @returns {{id:string, achse:'x'|'y', v1:number, v2:number, q1:number, q2:number,
 *            q:number, mass:number|null, versatz:{x:number,y:number}}|null}
 */
export function massGeometrie(bem, idx, ctx, opt) {
  const n = normBemassung(bem);
  if (!ACHSEN.includes(/** @type {any} */ (n.achse)) || !n.bis) return null;
  const achse = /** @type {'x'|'y'} */ (n.achse);
  const v = massEndpunkt(n.von, achse, ctx);
  const b = massEndpunkt(n.bis, achse, ctx);
  if (!v || !b) return null;
  const t = n.text_mm || { x: 0, y: 0 };
  const zusatz = Number(opt && opt.zusatz_q) || 0;
  return {
    id: n.id,
    achse,
    v1: v.wert, v2: b.wert,
    q1: v.quer, q2: b.quer,
    q: Math.max(v.quer, b.quer) + MASS_ABSTAND_MM * (Number(idx) + 1)
       + (Number(n.linie_mm) || 0) + zusatz,
    mass: n.mass_mm,
    versatz: { x: Number(t.x) || 0, y: Number(t.y) || 0 },
  };
}

/**
 * Die EINE Quelle der Beschriftungslage — Zeichnen, Treffen, Ziehen und die
 * Inline-Eingabe des Editors sowie das Blatt leiten alle daraus ab, damit sie nie
 * auseinanderlaufen.
 *
 * `anker` ist der Punkt auf der Masslinie samt Labelversatz, `mitte` die Mitte der
 * dargestellten Zahl (sie steht um `textHoehe` ueber der Linie; in Achse y ist die
 * Zahl um −90° gedreht, laengs und quer tauschen deshalb die Seiten). Der
 * Querversatz der Masslinie steckt schon in `g.q` — die Zahl folgt ihm von selbst.
 *
 * @param {{achse:'x'|'y', v1:number, v2:number, q:number, versatz:{x:number,y:number}}} g
 * @param {number} textHoehe Hoehe der Zahl ueber der Masslinie in Weltmass (mm)
 */
export function massAnker(g, textHoehe) {
  const laengs = (g.v1 + g.v2) / 2;
  const x = (g.achse === "x" ? laengs : g.q) + g.versatz.x;
  const y = (g.achse === "x" ? g.q : laengs) + g.versatz.y;
  const h = Number(textHoehe) || 0;
  return { anker: { x, y }, mitte: g.achse === "x" ? { x, y: y - h } : { x: x - h, y } };
}

/**
 * Der Pfad einer Massdarstellung: Hilfslinie am Start, Hilfslinie am Ziel,
 * Masslinie. `tick` ist der Ueberstand der Hilfslinien ueber die Masslinie.
 *
 * Gerundet wird ausdruecklich vom AUFRUFER (`runden`), damit Editor (2 Dezimalen)
 * und Blatt (Papier-mm) ihre gewohnte Zeichenkette behalten, ohne dass es zwei
 * Pfadrechnungen gibt.
 *
 * @param {{achse:'x'|'y', v1:number, v2:number, q1:number, q2:number, q:number}} g
 * @param {number} tick @param {(v:number)=>(number|string)} [runden]
 */
export function massPfad(g, tick, runden) {
  const r = runden || ((v) => v);
  const pt = (laengs, quer) => (g.achse === "x" ? `${r(laengs)} ${r(quer)}` : `${r(quer)} ${r(laengs)}`);
  const ueber = g.q + (Number(tick) || 0);
  return `M${pt(g.v1, g.q1)}L${pt(g.v1, ueber)}`
    + `M${pt(g.v2, g.q2)}L${pt(g.v2, ueber)}`
    + `M${pt(g.v1, g.q)}L${pt(g.v2, g.q)}`;
}

/**
 * Nur weitergereicht, damit Aufrufer die Lage nicht aus einem zweiten Baustein holen
 * muessen, wenn sie ohnehin schon mit der Massdarstellung arbeiten.
 */
export { normLage };
