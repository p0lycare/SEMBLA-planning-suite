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
 * Dazu kommt seit #59 die KOLLISIONSFREIE Anordnung der Masszahlen
 * (`massTextLayout`): gleichzeitig sichtbare Zahlen duerfen einander nicht
 * ueberdecken. Der automatische Ausweichversatz ist fluechtige Darstellung —
 * er wird bei jeder Ableitung frisch gerechnet, nie gespeichert und aendert
 * weder Masswert noch Masslinie. Editor und Lageplan rufen DIESELBE Funktion
 * auf, damit beide dieselbe Anordnung zeigen ([N-5]).
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
 * Kanonisches Mass der Beschriftungsflaeche einer Masszahl in Welt-mm (#59):
 * `zeichen` ist die Breite je Zeichen laengs der Schrift, `hoehe` die Zeilenhoehe
 * quer dazu — zugleich die Schrittweite des automatischen Ausweichens. Bewusst
 * BLICKUNABHAENGIG (weder Editor-Zoom noch Papiermassstab gehen ein), damit
 * Editor und Lageplan bitgenau dieselbe Anordnung errechnen.
 */
export const MASS_TEXT_MM = { zeichen: 110, hoehe: 200 };

/**
 * Beschriftungsflaeche einer Masszahl in Weltkoordinaten (mm): das Rechteck der
 * dargestellten Zahl an ihrer Stelle nach Staffelung, `linie_mm` und `text_mm`.
 * Die Zahl steht ueber der Masslinie; in Achse y ist sie um −90° gedreht, laengs
 * und quer tauschen deshalb die Seiten (wie in `massAnker`).
 *
 * @param {{achse:'x'|'y', v1:number, v2:number, q:number, mass:number|null,
 *          versatz:{x:number,y:number}}} g
 * @returns {{x_min:number, x_max:number, y_min:number, y_max:number}}
 */
export function massTextFlaeche(g) {
  const breite = Math.max(1, String(g.mass ?? "").length) * MASS_TEXT_MM.zeichen;
  const laengs = (g.v1 + g.v2) / 2;
  if (g.achse === "x") {
    const x = laengs + g.versatz.x, y = g.q + g.versatz.y;
    return { x_min: x - breite / 2, x_max: x + breite / 2, y_min: y - MASS_TEXT_MM.hoehe, y_max: y };
  }
  const x = g.q + g.versatz.x, y = laengs + g.versatz.y;
  return { x_min: x - MASS_TEXT_MM.hoehe, x_max: x, y_min: y - breite / 2, y_max: y + breite / 2 };
}

/**
 * Kollisionsfreie Anordnung der Masszahlen (#59). Deterministisch aus
 * Reihenfolge und Geometrie: die Liste kommt in Mappenreihenfolge, die erste
 * Zahl bleibt an ihrer Stelle, jede weitere weicht in ganzen `hoehe`-Schritten
 * quer zur Messrichtung nach aussen (+q) aus, bis ihre Flaeche keine bereits
 * platzierte mehr ueberdeckt. Gespeicherte `linie_mm`/`text_mm` wirken ZUERST
 * und gehen unveraendert in die Pruefung ein.
 *
 * Der Ausweichversatz steckt allein im `versatz` der zurueckgegebenen KOPIE —
 * er ist fluechtig und wird nie gespeichert. Masslinie (`q`), Fusspunkte,
 * Endwerte und Masswert bleiben bitgenau; ohne Kollision ist der Eintrag das
 * unveraenderte Eingabeobjekt. Ausgeblendet wird nichts, `null` bleibt `null`.
 *
 * @param {Array<{achse:'x'|'y', v1:number, v2:number, q:number, mass:number|null,
 *                versatz:{x:number,y:number}}|null>} geometrien
 *        Ergebnisse von `massGeometrie` in Mappenreihenfolge
 * @returns {Array<object|null>} gleiche Laenge und Reihenfolge
 */
export function massTextLayout(geometrien) {
  /** @type {Array<{x_min:number,x_max:number,y_min:number,y_max:number}>} */
  const belegt = [];
  const frei = (f) => belegt.every((b) =>
    f.x_min >= b.x_max || b.x_min >= f.x_max || f.y_min >= b.y_max || b.y_min >= f.y_max);
  return (Array.isArray(geometrien) ? geometrien : []).map((g) => {
    if (!g) return null;
    const quer = g.achse === "x" ? "y" : "x";
    const mitAuto = (auto) =>
      auto ? { ...g, versatz: { ...g.versatz, [quer]: g.versatz[quer] + auto } } : g;
    let auto = 0;
    // Terminiert immer OHNE Kappe: `belegt` ist endlich, und jeder Schritt schiebt
    // die Flaeche monoton nach +q — jenseits der am weitesten aussen liegenden
    // belegten Flaeche ist sie zwangslaeufig frei. Eine feste Obergrenze liesse
    // bei genuegend deckungsgleichen Zahlen wieder eine Ueberdeckung zu.
    while (!frei(massTextFlaeche(mitAuto(auto)))) {
      auto += MASS_TEXT_MM.hoehe;
    }
    const platziert = mitAuto(auto);
    belegt.push(massTextFlaeche(platziert));
    return platziert;
  });
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
