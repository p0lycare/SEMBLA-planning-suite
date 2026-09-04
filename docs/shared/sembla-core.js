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
export const BLECH = 1000;              // Standard-Modullänge des Kopfblechs (Modulzählung)
export const BLECH_THICK = 15;          // Stahlblech-Dicke (mm)
// Bodenblech-Zerlegung ([A-10]/[A-11]/[A-12]): das Bodenblech ist KEINE durchgehende Platte,
// sondern eine Folge realer Bleche aus dem Vorratssatz der Standardlängen.
export const BLECH_MIN_MM = 375;        // kleinste Bodenblech-Standardlänge (3 Raster)
export const BLECH_MAX_MM = 1250;       // groesste Bodenblech-Standardlänge (10 Raster)
export const BLECH_SPIEL = 2;           // Bauteilmass = Rastermass - 2 mm ([A-12])
/** Volle Standardreihe 375…1250 mm im 125-mm-Raster (deterministischer Fallback, [A-10]). */
export const BLECH_LAENGEN = [1250, 1125, 1000, 875, 750, 625, 500, 375];
export const CHAMBER_OFFSET = 62.5;     // Kammerzentrum -> Lattice x = 62.5 + 125k
export const MAX_SPAN_GRID = 3;         // Vorspannung max. alle 3 Raster (375mm)
export const FORBIDDEN_N = new Set([1, 4]);
export const MIN_FERTIGMASS_MM = 200;   // kleinstes einbaubares Fertigmass eines Zuschnitts ([Z-5])
export const ROD_OVERHANG = 10;         // Ueberstand des Reststuecks ueber die Wandoberkante ([Z-6])

export class SemblaError extends Error {}
export class InvalidDimensionError extends SemblaError {}
export class InvalidOpeningError extends SemblaError {}
export class InvalidInterlockError extends SemblaError {}

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

// ---------- Gesperrte Stosshoehen ([Z-7]) ----------
// Auf der Hoehe eines wirksamen Zwischenspannpunkts sitzt das Einlegeblech in seiner
// Vertiefung ([A-14]); dort darf keine Kopplungsmutter liegen. Gesperrt ist die EXAKTE
// lagengenaue Hoehe — es gibt keine vertikale Sperrzone, weil es dafuer kein bestaetigtes
// Mass gibt und ein geratenes Band den Zuschnitt still verschoebe.

/** Sperrhoehen auf die fuer diese Strecke wirksamen eingrenzen (sortiert, dedupliziert). */
function normSperren(sperrenMm, bedarfMm, letztesEndeStoss) {
  const b = _mm(bedarfMm);
  const arr = (Array.isArray(sperrenMm) ? sperrenMm : []).map(Number)
    .filter((x) => Number.isFinite(x) && x > 1e-9
      && (x < b - 1e-9 || (letztesEndeStoss && Math.abs(x - b) < 1e-9)))
    .map(_mm);
  return [...new Set(arr)].sort((a, b2) => a - b2);
}

/** true, wenn `hMm` eine gesperrte Hoehe ist (uebliche mm-Epsilon-Gleichheit, keine Zone). */
function _gesperrt(hMm, SP) { return SP.some((z) => Math.abs(z - hMm) < 1e-9); }

/** true, wenn die Stueckfolge einen STOSS auf einer gesperrten Hoehe hat. */
function _stossTrifft(stuecke, SP, bedarfMm, letztesEndeStoss) {
  if (!SP.length || !stuecke || !stuecke.length) return false;
  let z = 0;
  for (let i = 0; i < stuecke.length; i++) {
    z = _mm(z + stuecke[i].len_mm);
    const istStoss = (i < stuecke.length - 1) || letztesEndeStoss;
    if (istStoss && _gesperrt(z, SP)) return true;
  }
  return false;
}

/**
 * Stossfreie Kombination in der Vorzugsordnung aus [Z-2] ([Z-5] bleibt zwingend).
 *
 * Gesucht wird mit Tiefensuche in genau der Reihenfolge, in der die ungesperrte Kombination
 * waehlt (groesste zulaessige Groesse zuerst): die zuerst gefundene stossfreie Folge ist damit
 * die nach [Z-2] bevorzugte unter allen stossfreien. Gemerkt wird je Restlaenge — die
 * kumulierte Hoehe ist aus ihr eindeutig bestimmt (`bedarf − rest`), das Ergebnis also
 * unabhaengig vom Suchweg. Nicht nach [Z-5] einbaubare Folgen zaehlen NICHT als stossfrei:
 * sie waeren ein Konflikt hoeheren Rangs und werden dem regulaeren Weg ueberlassen.
 * @returns {Array<{len_mm:number,art:"standard"|"sonder",quelle_mm:number}>|null}
 */
function _kombiniereStossfrei(bedarfMm, laengenMm, SP, minMm, letztesEndeStoss) {
  const L = normLaengen(laengenMm);
  if (!L.length) return null;
  const b = _mm(bedarfMm);
  /** @type {Map<number, any[]|null>} */
  const memo = new Map();
  const rec = (rest) => {
    if (rest <= 1e-9) return [];
    if (memo.has(rest)) return memo.get(rest);
    memo.set(rest, null);                       // Zyklusschutz (kann nicht auftreten, kostet nichts)
    const pos = _mm(b - rest);
    let out = null;
    const passend = L.filter((l) => l <= rest + 1e-9);
    if (!passend.length) {
      // Sonderzuschnitt fuer den Restbetrag — sein oberes Ende ist das Ende der Strecke.
      const q = quelleFuerMass(rest, L);
      if (q != null && rest >= minMm - 1e-9
        && !(letztesEndeStoss && _gesperrt(_mm(pos + rest), SP))) {
        out = [{ len_mm: rest, art: "sonder", quelle_mm: q }];
      }
    } else {
      for (const l of passend) {                // absteigend: groesste zuerst ([Z-2])
        const r2 = _mm(rest - l);
        // [Z-5] unveraendert zwingend: Rest danach 0, >= Mindestmass oder weiter auffuellbar.
        if (!(r2 <= 1e-9 || r2 >= minMm - 1e-9 || L.some((x) => x <= r2 + 1e-9))) continue;
        const ende = _mm(pos + l);
        const istStoss = r2 > 1e-9 || letztesEndeStoss;
        if (istStoss && _gesperrt(ende, SP)) continue;
        const t = rec(r2);
        if (t) { out = [{ len_mm: l, art: "standard", quelle_mm: l }, ...t]; break; }
      }
    }
    memo.set(rest, out);
    return out;
  };
  return rec(_mm(b));
}

/**
 * Bedarf deterministisch aus den ausgewaehlten Standardlaengen kombinieren ([Z-2]).
 *
 * `sperrenMm` sind Hoehen UEBER DEM FUSS der Strecke, auf denen KEIN Stoss liegen darf
 * ([Z-7], Zwischenspannpunkte nach [A-14]/[A-15]). Ohne Sperren laeuft bit-genau der
 * bisherige Weg — die Sperrpruefung ist ein eigener, nachgeschalteter Pfad und veraendert
 * das Ergebnis der ungesperrten Kombination an keiner Stelle.
 *
 * @param {number} bedarfMm benoetigte Gesamtlaenge (Geometrie, wird NIE veraendert)
 * @param {number[]} laengenMm ausgewaehlte Standardlaengen
 * @param {number} [minMm] Mindest-Fertigmass ([Z-5])
 * @param {number[]|null} [sperrenMm] Hoehen ueber dem Fuss, auf denen kein Stoss liegen darf
 * @param {boolean} [letztesEndeStoss] true, wenn auch das obere Ende der Strecke ein Stoss ist
 *        (Kopplung zum Reststueck [Z-6]); false, wenn dort das Bauteilende liegt
 * @returns {{stuecke:Array<{len_mm:number,art:"standard"|"sonder",quelle_mm:number}>,
 *            konflikt:string|null}}
 */
export function kombiniereLaengen(bedarfMm, laengenMm, minMm = MIN_FERTIGMASS_MM,
                                  sperrenMm = null, letztesEndeStoss = false) {
  const SP = normSperren(sperrenMm, bedarfMm, letztesEndeStoss);
  if (SP.length) {
    // [Z-7] Erst wird eine stossfreie Kombination gesucht — in DERSELBEN Vorzugsordnung wie
    // unten ([Z-2] groesste zuerst) und nur unter den nach [Z-5] zulaessigen Wahlen. Gibt es
    // keine, bleibt die Geometrie und die regulaere Kombination unveraendert und der Konflikt
    // wird BENANNT (nie still verletzt, nie ein erfundenes Mass, [P-6]/[P-9]).
    const frei = _kombiniereStossfrei(bedarfMm, laengenMm, SP, minMm, letztesEndeStoss);
    if (frei) return { stuecke: frei, konflikt: null };
    const k = kombiniereLaengen(bedarfMm, laengenMm, minMm);
    // Ein bereits gemeldeter Zuschnittkonflikt ([Z-5]/Vorratssatz) bleibt die genannte Ursache:
    // ein Segment fuehrt genau EINEN Grund, und die hoeher stehende Regel wird nicht verdeckt.
    if (!_stossTrifft(k.stuecke, SP, bedarfMm, letztesEndeStoss)) return k;
    return { stuecke: k.stuecke, konflikt: k.konflikt || "stoss_auf_zwischenpunkt" };
  }
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
 * @param {number[]|null} [sperrenMm] Hoehen ueber dem Segmentfuss ohne Stoss ([Z-7])
 * @param {number} [minMm] Mindest-Fertigmass ([Z-5])
 * @returns {{stuecke:Array<{len_mm:number,art:"standard"|"sonder"|"rest",quelle_mm:number}>,
 *            konflikt:string|null, bedarf_mm:number}}
 */
export function kombiniereSegment(hMm, laengenMm, obenAnOk, restMm, ueberstandMm,
                                  sperrenMm = null, minMm = MIN_FERTIGMASS_MM) {
  const R = (+restMm > 0) ? _mm(+restMm) : 0;
  const UE = (+ueberstandMm > 0) ? _mm(+ueberstandMm) : 0;
  // Ohne Oberkantenbezug oder ohne gewaehltes Reststueck bleibt alles wie bisher ([Z-2]).
  if (!obenAnOk || !R) {
    // Das obere Ende der Strecke ist hier das Segmentende (Anker), also kein Stoss.
    const k = kombiniereLaengen(hMm, laengenMm, minMm, sperrenMm, false);
    // Fehlendes Reststueck an der Oberkante ist ein SICHTBARER Konflikt, keine stille Ausnahme.
    // Rangfolge: [Z-6] steht UEBER der Stosssperre [Z-7]. Ein Segment fuehrt genau einen Grund,
    // und der fehlende obere Abschluss darf nicht von der niedriger stehenden Sperre verdeckt
    // werden; jeder andere bestehende Grund behaelt seinen Vorrang unveraendert.
    if (obenAnOk && !R) {
      const g = (k.konflikt && k.konflikt !== "stoss_auf_zwischenpunkt") ? k.konflikt : "kein_reststueck";
      return { ...k, konflikt: g, bedarf_mm: _mm(hMm) };
    }
    return { ...k, bedarf_mm: _mm(hMm) };
  }
  const bedarf = _mm(hMm + UE);
  const unten = _mm(bedarf - R);
  if (unten < -1e-9) return { stuecke: [], konflikt: "reststueck_zu_lang", bedarf_mm: bedarf };
  const restStueck = { len_mm: R, art: "rest", quelle_mm: R };
  if (unten <= 1e-9) return { stuecke: [restStueck], konflikt: null, bedarf_mm: bedarf };
  // Unterhalb des Reststuecks ist AUCH das obere Ende ein Stoss: die Kopplung zum Reststueck
  // ([Z-6]). Sie unterliegt der Sperre nach [Z-7] wie jede andere Kopplung.
  const k = kombiniereLaengen(unten, laengenMm, minMm, sperrenMm, true);
  if (!k.stuecke.length) return { stuecke: [], konflikt: k.konflikt || "kein_ausgangsprodukt", bedarf_mm: bedarf };
  return { stuecke: [...k.stuecke, restStueck], konflikt: k.konflikt, bedarf_mm: bedarf };
}

// ---------- Zwischenspannpunkte ([A-14]/[A-15]/[A-17], #93) ----------
// Ein Zwischenspannpunkt ist ein EINLEGEBLECH in einer Vertiefung der Steinlage, das die
// Gewindestange waehrend der Montage temporaer fixiert und zentriert; angezogen wird es mit
// GENAU EINER Mutter von oben ([A-16]). Fachlich ist das etwas anderes als die Spannplatte am
// Segmentende einer Oeffnung ([A-3]) — die bleibt unveraendert.
//
// Die Punkte sind LAGENGENAU: sie liegen auf einer Steinlagen-Oberkante ECHT INNERHALB des
// Segments. Die Segmentenden selbst sind Anker und keine Zwischenpunkte; ein Segment ohne
// innere Lagen-Oberkante (genau eine Lage) erzeugt deshalb KEINEN Punkt — es wird keiner
// erfunden.
//
// Abgeleitet wird bei JEDER Rechnung frisch. Das Ergebnis der Ableitung wird NICHT gespeichert
// und NICHT als manueller Wert ausgegeben: gespeichert ist ausschliesslich ein ausdruecklich
// gesetzter Override in `prestress.zwischenpunkte_mm` ([A-17]).

/**
 * Steinlagen-Oberkanten ECHT INNERHALB eines Segments (aufsteigend).
 * @param {number} z0Mm Segmentfuss @param {number} z1Mm Segmentkopf @param {number} [courseMm]
 * @returns {number[]}
 */
export function lagenOberkantenInnen(z0Mm, z1Mm, courseMm = COURSE) {
  const out = [];
  if (!(courseMm > 0)) return out;
  const erste = Math.floor(z0Mm / courseMm) + 1;
  for (let r = erste; r * courseMm < z1Mm - 1e-9; r++) {
    const z = r * courseMm;
    if (z > z0Mm + 1e-9) out.push(z);
  }
  return out;
}

/**
 * Automatischer Zwischenspannpunkt eines Segments ([A-15]).
 *
 * Genommen wird die innere Lagen-Oberkante mit dem KLEINSTEN ABSTAND zur halben Segmenthoehe;
 * bei Gleichstand deterministisch die NIEDRIGERE (die Kandidaten laufen aufsteigend, und nur ein
 * strikt kleinerer Abstand gewinnt). Ohne innere Lagen-Oberkante gibt es keinen Punkt -> null.
 * @param {number} z0Mm @param {number} z1Mm @param {number} [courseMm]
 * @returns {number|null}
 */
export function autoZwischenpunkt(z0Mm, z1Mm, courseMm = COURSE) {
  const kand = lagenOberkantenInnen(z0Mm, z1Mm, courseMm);
  if (!kand.length) return null;
  const mitte = (z0Mm + z1Mm) / 2;
  let best = kand[0], bestD = Math.abs(kand[0] - mitte);
  for (const z of kand.slice(1)) {
    const d = Math.abs(z - mitte);
    if (d < bestD - 1e-9) { best = z; bestD = d; }
  }
  return best;
}

/**
 * Manuelle Zwischenspannpunkte normalisieren und validieren ([A-17]).
 *
 * Zulaessig sind ganzzahlige Vielfache der Lagenhoehe ECHT INNERHALB der Wand. Ein unzulaessiger
 * Wert wird NICHT auf eine andere Lage gerundet — er wird benannt (`fehler`) und nicht angewandt
 * ([P-9]); gerundet entstuende still ein anderer Punkt als der gesetzte.
 *
 * `punkte === null` heisst „kein Override" (Auto-Ableitung). Eine AUSDRUECKLICH leere Liste ist
 * dagegen die Aussage „diese Wand hat keine Zwischenspannpunkte" und faellt nicht auf Auto zurueck.
 * @param {number[]|null|undefined} arr @param {number} heightMm Wandhoehe @param {number} [courseMm]
 * @returns {{punkte:number[]|null,fehler:Array<{grund:string,wert:any}>}}
 */
export function normZwischenpunkte(arr, heightMm, courseMm = COURSE) {
  if (!Array.isArray(arr)) return { punkte: null, fehler: [] };
  const out = [], fehler = [];
  for (const raw of arr) {
    const z = Number(raw);
    if (!Number.isInteger(z)) { fehler.push({ grund: "nicht_ganzzahlig", wert: raw }); continue; }
    if (z % courseMm !== 0) { fehler.push({ grund: "nicht_auf_lagen_oberkante", wert: raw }); continue; }
    if (z <= 0 || z >= heightMm) { fehler.push({ grund: "ausserhalb_wand", wert: raw }); continue; }
    out.push(z);
  }
  return { punkte: [...new Set(out)].sort((a, b) => a - b), fehler };
}

/**
 * Wirksame Zwischenspannpunkte EINES Segments (aufsteigend, absolute Hoehen in mm).
 *
 * Mit Override gelten genau die gesetzten Punkte, die in diesem Segment eine innere
 * Lagen-Oberkante sind — nichts wird verschoben und nichts ergaenzt. Ohne Override gilt die
 * Ableitung nach [A-15].
 * @param {number} z0Mm @param {number} z1Mm @param {number[]|null} [override] @param {number} [courseMm]
 * @returns {number[]}
 */
export function zwischenpunkteSegment(z0Mm, z1Mm, override = null, courseMm = COURSE) {
  const innen = lagenOberkantenInnen(z0Mm, z1Mm, courseMm);
  if (Array.isArray(override))
    return innen.filter((z) => override.some((o) => Math.abs(Number(o) - z) < 1e-9));
  const a = autoZwischenpunkt(z0Mm, z1Mm, courseMm);
  return a == null ? [] : [a];
}

/**
 * Wirksame Zwischenspannpunkte eines fertigen Wandelements — die EINE Ableitung fuer jede
 * Ausgabe, die sie zeigt. Frisch gerechnet, nie gespeichert.
 * @param {any} w Wandelement
 * @returns {Array<{k:number,x_mm:number,z_mm:number,z0_mm:number,z1_mm:number}>}
 */
export function wirksameZwischenpunkte(w) {
  if (!w || !Array.isArray(w.tension_columns)) return [];
  const C = (w.course_mm > 0) ? w.course_mm : COURSE;
  const ov = (w.prestress && Array.isArray(w.prestress.zwischenpunkte_mm))
    ? w.prestress.zwischenpunkte_mm : null;
  const out = [];
  for (const col of w.tension_columns) for (const sg of (col.segments || []))
    for (const z of zwischenpunkteSegment(sg.z0_mm, sg.z1_mm, ov, C))
      out.push({ k: col.k, x_mm: col.x_mm, z_mm: z, z0_mm: sg.z0_mm, z1_mm: sg.z1_mm });
  return out;
}

// ---------- Bodenblech aus Standardlaengen ([A-10]/[A-11]/[A-12]) ----------
// Das Bodenblech ist kein wandlanges Einzelteil, sondern eine Folge REALER Bleche. Zerlegt wird
// deterministisch aus dem VORRATSSATZ der Standardlaengen (Vielfache von 125 mm, 375…1250 mm):
// moeglichst wenige und moeglichst grosse Teile (die Ordnung dieser beiden Kriterien steht
// unten) — verwandt mit der Groessenpraeferenz aus [Z-2] beim Gewindestangenzuschnitt.
//
// [A-10] Der Sonderzuschnitt ist die AUSNAHME und keine Abkuerzung: existiert IRGENDEINE exakte
// Kombination aus Standardlaengen, entsteht kein Sonderzuschnitt. Gewaehlt wird deshalb in ZWEI
// getrennten Stufen — erst wird der Raum der EXAKTEN Kombinationen vollstaendig ausgewertet, und
// nur wenn er leer ist, kommt der Sonderpfad. (Eine Tiefensuche, die einen Sonderabschluss als
// Erfolg nimmt, bricht zu frueh ab: sie akzeptiert in einem frueh betretenen grossen Ast einen
// Rest, obwohl ein anderer Ast exakt aufgeht — z. B. 2500 mm aus {1000, 625, 375}, wo
// 4 x 625 exakt deckt.)
//
// Unter den exakten Kombinationen entscheidet zuerst die GERINGSTE Teilezahl, danach
// deterministisch die groessten Teile (groesste Standardlaenge zuerst). Beides zusammen ist
// "moeglichst wenige und moeglichst grosse Teile" aus [A-10]: gerechnet wird als Minimum ueber
// die Restlaenge (je Position gemerkt), und weil die Laengen absteigend durchlaufen werden und
// nur eine STRIKT kleinere Teilezahl gewinnt, ist das Ergebnis die lexikographisch groesste
// unter den kuerzesten Kombinationen.
//
// [A-11] ist ein MUSS und steht UEBER dieser Optimierung: kein Blechstoss darf auf einem
// Steinstoss der untersten Lage liegen. Optimiert wird deshalb zuerst unter den STOSSFREIEN
// exakten Kombinationen. Gibt es exakte, aber keine stossfreie, wird die nach obiger Ordnung
// beste EXAKTE genommen und jeder verletzte Stoss BENANNT gemeldet — nie still verletzt und
// nie zugunsten eines Sonderzuschnitts umgangen.
//
// Nur wenn KEINE exakte Kombination die Laenge deckt, greift der Sonderpfad: Groessenpraeferenz
// von unten, und GENAU EIN Sonderzuschnitt am Ende — fuer den Rest, in den keine Standardlaenge
// mehr passt. Auch dieser Pfad weicht Stoessen zuerst aus und meldet, was uebrig bleibt.

/** Vorratssatz auf zulaessige Bodenblech-Standardlaengen eingrenzen. @param {number[]} l */
export function normBlechLaengen(l) {
  return normLaengen(l).filter((x) => Number.isInteger(x) && x % GRID === 0
    && x >= BLECH_MIN_MM && x <= BLECH_MAX_MM);
}

/**
 * Bodenblech einer Wand deterministisch in reale Teile zerlegen ([A-10]/[A-11]/[A-12]).
 * @param {number} lengthMm Wandlaenge (Vielfaches von 125 mm)
 * @param {number[]} laengenMm Vorratssatz der Standardlaengen
 * @param {number[]} [stossGrid] Rasterpositionen der Steinstoesse der untersten Lage
 * @returns {{teile:Array<{x0_mm:number,raster_mm:number,bauteil_mm:number,art:"standard"|"sonder"}>,
 *            konflikte:Array<{grund:string,x_mm?:number,grid?:number}>}}
 */
export function zerlegeBodenblech(lengthMm, laengenMm, stossGrid = []) {
  const L = normBlechLaengen(laengenMm);
  const stoss = new Set((stossGrid || []).map(Number));
  const konflikte = [];
  if (!L.length) konflikte.push({ grund: "keine_standardlaenge" });
  // Das Wandende ist kein Stoss — dort endet das Bodenblech ohnehin.
  const frei = (x) => x >= lengthMm || !stoss.has(x / GRID);

  // Stufe 1: EXAKTE Kombination — geringste Teilezahl, darunter die groessten Teile.
  // `strict` = die Stossregel [A-11] wird eingehalten.
  const exakt = (strict) => {
    /** @type {Map<number, {anzahl:number,teile:any[]}|null>} */
    const memo = new Map();
    const rec = (x) => {
      if (x === lengthMm) return { anzahl: 0, teile: [] };
      if (memo.has(x)) return memo.get(x);
      let best = null;
      for (const l of L) {                                 // absteigend: groesste zuerst
        if (x + l > lengthMm) continue;
        if (strict && !frei(x + l)) continue;              // [A-11]
        const t = rec(x + l);
        if (!t) continue;
        // Nur eine STRIKT kleinere Teilezahl gewinnt -> bei Gleichstand bleibt die zuerst
        // gefundene, also die mit der groesseren Laenge an dieser Stelle.
        if (best === null || t.anzahl + 1 < best.anzahl) {
          best = { anzahl: t.anzahl + 1,
                   teile: [{ x0_mm: x, raster_mm: l, art: "standard" }, ...t.teile] };
        }
      }
      memo.set(x, best);
      return best;
    };
    const r = rec(0);
    return r ? r.teile : null;
  };

  // Stufe 2: Sonderpfad — nur wenn keine exakte Kombination existiert. Groessenpraeferenz von
  // unten; GENAU EIN Sonderzuschnitt am Ende fuer den Rest, in den keine Standardlaenge passt.
  const mitSonder = (strict) => {
    /** @type {Map<number, any[]|null>} */
    const memo = new Map();
    const rec = (x) => {
      if (x === lengthMm) return [];
      if (memo.has(x)) return memo.get(x);
      let out = null;
      for (const l of L) {                                 // absteigend: groesste zuerst
        if (x + l > lengthMm) continue;
        if (strict && !frei(x + l)) continue;              // [A-11]
        const t = rec(x + l);
        if (t) { out = [{ x0_mm: x, raster_mm: l, art: "standard" }, ...t]; break; }
      }
      if (!out) {
        const rest = lengthMm - x;
        // [A-10] Sonderzuschnitt nur, wenn arithmetisch KEINE Standardlaenge mehr passt.
        if (rest > 0 && !L.some((l) => l <= rest)) out = [{ x0_mm: x, raster_mm: rest, art: "sonder" }];
      }
      memo.set(x, out);
      return out;
    };
    return rec(0);
  };

  // Reihenfolge der Wahl: stossfrei exakt -> exakt (Stoss gemeldet) -> stossfrei mit
  // Sonderzuschnitt -> mit Sonderzuschnitt (Stoss gemeldet). Gemeldet wird danach an EINER
  // Stelle aus der gewaehlten Folge, damit kein Pfad still eine Stossverletzung durchlaesst.
  const teile = exakt(true) || exakt(false) || mitSonder(true) || mitSonder(false) || [];
  for (const tl of teile) {
    const e = tl.x0_mm + tl.raster_mm;
    if (!frei(e)) konflikte.push({ grund: "stoss_auf_steinstoss", x_mm: e, grid: e / GRID });
  }
  return {
    teile: teile.map((tl) => ({ x0_mm: tl.x0_mm, raster_mm: tl.raster_mm,
      bauteil_mm: tl.raster_mm - BLECH_SPIEL, art: tl.art })),
    konflikte,
  };
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
  // Bodenblech-Standardlaengen ([A-10]): der VORRATSSATZ ist Core-Parameter. Fehlt das Feld,
  // gilt der deterministische Fallback mit der vollen Standardreihe 375…1250 mm — es wird
  // also nie eine Laenge geraten und nie aus `blech_mm` abgeleitet (das bleibt allein die
  // Modullaenge des Kopfblechs). Ist das Feld AUSDRUECKLICH gesetzt und leer, hat der Aufrufer
  // die Auswahl bereits ausgewertet: dann wird keine Standardlaenge erfunden, die Zerlegung
  // meldet `keine_standardlaenge` und weist das Bodenblech als Sonderzuschnitt aus.
  const blechExplizit = Array.isArray(p && p.blech_lengths_mm);
  const blechL = blechExplizit ? normBlechLaengen(p.blech_lengths_mm) : BLECH_LAENGEN.slice();
  // Oberer Anschluss ([A-2], #92): DEFAULT ist die SPANNPLATTE. Fehlt das Feld oder traegt es
  // einen unbekannten Wert, gilt der beschlossene Standard — Kopfblech bleibt waehlbar, muss
  // dafuer aber AUSGESPROCHEN werden. Ein gespeichertes "blech" wird hier nie umgeschrieben.
  const top = (p && (p.top_connection === "spannplatte" || p.top_connection === "blech")) ? p.top_connection : "spannplatte";
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
  const out = { max_span_grid: m, force_kN: fk, rod_mm: rod, rod_lengths_mm: rodL, blech_mm: blech,
           blech_lengths_mm: blechL,
           top_connection: top, columns_grid: cg, start_axis_grid: sa,
           rod_rest_mm: rr, rod_overhang_mm: ue };
  // Manuelle Zwischenspannpunkte ([A-17]) sind ein OVERRIDE: der Schluessel entsteht nur, wenn
  // er ausdruecklich gesetzt ist. Fehlt er, gilt die Auto-Ableitung ([A-15]) — und weil sie
  // nirgends gespeichert wird, entsteht im Wandelement AUCH KEIN Feld dafuer. `buildWall`
  // ersetzt die rohe Liste unten durch die validierte (dedupliziert, sortiert).
  if (Array.isArray(p && p.zwischenpunkte_mm)) out.zwischenpunkte_mm = p.zwischenpunkte_mm.slice();
  return out;
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

// ---------- Verzahnungsbereich ([G-10]/[G-11]/[G-12]) ----------
// Ein Verzahnungsbereich ist ein Laengsabschnitt [g0, g1) der Wand, in dem alternierend in jeder
// zweiten Lage die Steine fehlen — Zweck ist das konstruktive Ineinandergreifen rechtwinklig
// kreuzender Einzelwaende. Die Startparitaet (0 = unterste Lage ausgespart, 1 = erst die zweite
// Lage ausgespart) ist frei waehlbar und bleibt ueber alle Lagen identisch.
// [G-11] Die Vorspannachsen werden aus dem VOLLSTAENDIGEN Steinverband berechnet, OHNE die
// Verzahnungsaussparungen — Vorspannung bleibt also bitgleich.

/**
 * Normalisiert und validiert Verzahnungsbereiche.
 * @param {Array|null} arr rohe interlocks
 * @param {number} N Wandlaenge in Rastern
 * @param {Array<{g0:number,g1:number}>} openings Oeffnungen (zur Ueberlappungspruefung)
 * @returns {{interlocks:Array<{g0:number,g1:number,start_parity:number}>,fehler:Array<{grund:string,bereich:object}>}}
 */
export function normInterlocks(arr, N, openings = []) {
  if (!Array.isArray(arr) || !arr.length) return { interlocks: [], fehler: [] };
  const out = [], fehler = [];
  for (const raw of arr) {
    const g0 = Number(raw.g0), g1 = Number(raw.g1);
    const sp = Number(raw.start_parity);
    const bereich = { g0: raw.g0, g1: raw.g1, start_parity: raw.start_parity };
    // Ganzzahlig, gueltiges Intervall, innerhalb der Wand
    if (!Number.isInteger(g0) || !Number.isInteger(g1)) {
      fehler.push({ grund: "nicht_ganzzahlig", bereich }); continue;
    }
    if (g1 <= g0) {
      fehler.push({ grund: "leeres_intervall", bereich }); continue;
    }
    if (g0 < 0 || g1 > N) {
      fehler.push({ grund: "ausserhalb_wand", bereich }); continue;
    }
    if (sp !== 0 && sp !== 1) {
      fehler.push({ grund: "ungueltige_paritaet", bereich }); continue;
    }
    // Ueberlappung mit Oeffnungen
    let overlap = false;
    for (const op of openings) {
      if (g0 < op.g1 && op.g0 < g1) { overlap = true; break; }
    }
    if (overlap) {
      fehler.push({ grund: "ueberlappt_oeffnung", bereich }); continue;
    }
    out.push({ g0, g1, start_parity: sp });
  }
  // Sortieren nach g0
  out.sort((a, b) => a.g0 - b.g0);
  // Ueberlappung untereinander pruefen
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].g1 > out[i + 1].g0) {
      fehler.push({ grund: "ueberlappt_verzahnung", bereich: out[i + 1] });
      out.splice(i + 1, 1); i--;
    }
  }
  return { interlocks: out, fehler };
}

export function buildWall(name, lengthMm, heightMm, openings = [], sides = null, prestress = null, steps = [], interlocks = null) {
  const PS = normPrestress(prestress);
  const maxSpan = PS.max_span_grid;
  const ROD_ = PS.rod_mm;
  const TOP = PS.top_connection;   // 'blech' (Kopfblech) | 'spannplatte'
  validateInputs(lengthMm, heightMm, openings);
  const N = lengthMm / GRID, L = heightMm / COURSE;
  // [G-10]/[G-12] Verzahnungsbereiche normalisieren und validieren
  const IL = normInterlocks(interlocks, N, openings);
  // [A-17] Manuelle Zwischenspannpunkte validieren. Ohne Override bleibt `punkte` null und die
  // Auto-Ableitung nach [A-15] greift je Segment — gespeichert wird davon nichts.
  const ZP = normZwischenpunkte(PS.zwischenpunkte_mm, heightMm, COURSE);
  if (ZP.punkte) PS.zwischenpunkte_mm = ZP.punkte;

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

  // ---- Erster Durchgang: VOLLSTAENDIGER Steinverband (Basis fuer occ und Vorspannung) ----
  // [G-11] Die Spannachsen werden aus dem VOLLSTAENDIGEN Steinverband berechnet, OHNE die
  // Verzahnungsaussparungen. Dieser erste Durchgang laeuft IMMER — auch bei Verzahnungsbereichen.
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

  // `occ`, `steinIvVoll` und `wunschVoll` basieren auf dem VOLLSTAENDIGEN Verband (vor dem Aussparen) — [G-11].
  const occ = []; for (let r = 0; r < L; r++) occ.push(new Array(N).fill(false));
  const steinIvVoll = [];
  // [V-3] Wunschpositionen: Mitte der i3-Steine der untersten Lage — VOR dem Aussparen!
  const wunschVoll = new Set();
  for (const c of courses) for (const st of c.stones) {
    const a = st.x0 / GRID, b = st.x1 / GRID;
    for (let cc = a; cc < b; cc++) occ[c.lage][cc] = true;
    steinIvVoll.push([a, b]);
    // [V-3] Nur unterste Lage (lage 0), nur i3 (Breite 3 Raster) — hat eine echte Rastermitte
    if (c.lage === 0 && b - a === 3) wunschVoll.add(a + 1);
  }

  // ---- Zweiter Durchgang: Aussparung fuer Verzahnungsbereiche ([G-10]) ----
  // Bei gültigen Verzahnungsbereichen wird das Tiling DETERMINISTISCH NEU GERECHNET: die
  // Bereiche werden wie Luecken aus den runs/cuts herausgeschnitten, bevor `pickTiling` laeuft.
  // So endet kein Stein im Bereich und der verbleibende Verband wird deterministisch neu gelegt.
  // Stoßfugen und occ bleiben beim vollstaendigen Verband — Vorspannung bleibt bitgleich ([G-11]).
  const interlockInvalidSegments = [];
  if (IL.interlocks.length) {
    let prevIl = new Set();
    for (let li = 0; li < L; li++) {
      // Pruefen, ob diese Lage in mindestens einem Verzahnungsbereich ausgespart wird
      const relevantIls = IL.interlocks.filter(il => li % 2 === il.start_parity);
      if (!relevantIls.length) {
        // Keine Aussparung in dieser Lage — Steine bleiben unveraendert, prev fuer naechste Lage
        prevIl = new Set(courses[li].joints_grid);
        continue;
      }
      // cuts aus dem vollstaendigen Verband holen (gleicher Weg wie oben)
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
      // Verzahnungsbereiche DIESER Lage (passende Paritaet) wie Luecken herausschneiden
      for (const il of relevantIls) {
        const nc = [];
        for (const [s, e] of cuts) {
          if (il.g1 <= s || il.g0 >= e) { nc.push([s, e]); continue; }
          if (il.g0 > s) nc.push([s, il.g0]);
          if (il.g1 < e) nc.push([il.g1, e]);
        }
        cuts = nc;
      }
      // Neues Tiling fuer die reduzierte Lage
      const stones = [];
      for (const [s, e] of cuts) {
        const w = e - s;
        // Nicht baubare Restbreiten durch Verzahnung melden (getrennt von den strukturellen)
        if (FORBIDDEN_N.has(w)) {
          const seg = { lage: li, start_grid: s, breite_grid: w };
          if (!interlockInvalidSegments.some(x => x.lage === li && x.start_grid === s && x.breite_grid === w))
            interlockInvalidSegments.push(seg);
        }
        const comp = pickTiling(s, w, prevIl);
        let g = s;
        for (const b of comp) {
          stones.push({ type: b === 2 ? "i2" : "i3", x0: g * GRID, x1: (g + b) * GRID });
          g += b;
        }
      }
      courses[li].stones = stones;
      // prev fuer die naechste Lage kommt aus dem vollstaendigen Verband (joints_grid unveraendert)
      prevIl = new Set(courses[li].joints_grid);
    }
  }
  // ---- Spannachsen ----------------------------------------------------------------
  // Hierarchie: [V-1] Kammerraster > [V-9] manuelle Achsen > [V-2] Steinabdeckung (MUSS)
  // > [V-7]/[V-8] Zusatzachsen an Stufen-/Oeffnungskanten > [V-3] Mitte i3 unterste Lage
  // > [V-4] Maximalabstand als OBERGRENZE.
  //
  // [V-4] ist bewusst die LETZTE Stufe und nicht mehr die Verteilungsregel: die Steinabdeckung
  // [V-2] impliziert den Abstand NICHT (nachweisbar entstehen sonst Luecken bis 5 Raster =
  // 625 mm, obwohl jeder Stein gehalten ist), und umgekehrt beweist ein eingehaltenes
  // Maximalraster die Abdeckung nicht. Beide Regeln sind unabhaengig und beide gelten.
  // [G-11] Steinabdeckung basiert auf dem VOLLSTAENDIGEN Verband (steinIvVoll, vor dem Aussparen).
  // Deterministische Reihenfolge fuer den Stabbing-Greedy: nach rechtem, dann linkem Rand.
  steinIvVoll.sort((p, q) => (p[1] - q[1]) || (p[0] - q[0]));
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
    // [V-3] Wunschpositionen: Mitte der i3-Steine der untersten Lage — aus dem VOLLSTAENDIGEN
    // Verband (wunschVoll, oben berechnet). Ein i2 hat keine Rastermitte (zwei Zellen) und
    // liefert deshalb keine Wunschposition — es wird nichts geraten.
    // [V-2] MUSS: jeder Stein jeder Lage wird von mindestens einer Achse durchgangen.
    // Stabbing-Greedy ueber alle Steine; gesetzt wird die RECHTESTE Zelle des Steins, weil sie
    // die meisten folgenden Steine miterschlaegt (minimale Achsenzahl). Liegt im Stein eine
    // Wunschposition nach [V-3], hat diese Vorrang vor der Reichweite — sie kostet hoechstens
    // zusaetzliche Achsen, nie die Abdeckung.
    for (const [a, b] of steinIvVoll) {
      if (gehalten(colSet, a, b)) continue;
      let pos = b - 1;
      for (let k = b - 1; k >= a; k--) if (wunschVoll.has(k)) { pos = k; break; }
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
      // [A-14]/[A-15]/[Z-7] Wirksame Zwischenspannpunkte dieses Segments; ihre Hoehen sind fuer
      // Kopplungen gesperrt. Uebergeben werden sie RELATIV zum Segmentfuss, weil die Kombination
      // die Strecke rechnet und ihre absolute Lage nicht kennt.
      const zpSeg = zwischenpunkteSegment(z0, z1, ZP.punkte, COURSE);
      const kombi = kombiniereSegment(h, PS.rod_lengths_mm, topReach, PS.rod_rest_mm,
        PS.rod_overhang_mm, zpSeg.map((z) => z - z0));
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

  // Stahlbleche: das Bodenblech liegt über die volle Wandlänge, besteht dort aber aus REALEN
  // Teilen ([A-10]/[A-11]/[A-12]) statt aus einer Modulzählung; Kopfblech unverändert nur bei
  // top_connection=='blech' und weiterhin in Modulen der Blechlänge (Slicing folgt getrennt).
  const occCols = topLage.filter(t => t > 0).length;
  const topEdgeLen = occCols * GRID;
  const bodenZerlegung = zerlegeBodenblech(lengthMm, PS.blech_lengths_mm,
    courses.length ? courses[0].joints_grid : []);
  const bodenTeile = bodenZerlegung.teile;
  const bodenModule = bodenTeile.length;      // Anzahl REALER Bodenblechteile
  const kopfModule = (TOP === "blech") ? Math.ceil(topEdgeLen / PS.blech_mm) : 0;
  const basePlate = { rolle: "bodenblech", laenge_mm: lengthMm, breite_mm: THICK, dicke_mm: BLECH_THICK, modul_mm: PS.blech_mm, module: bodenModule, teile: bodenTeile };
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
    // [G-10] Verzahnungsbereiche (optional, nur die validen)
    interlocks: IL.interlocks,
    sides: normSides(sides),
    prestress: PS,
    base_plate: basePlate, top_plate: topPlate,
    tension_columns: columns, bom,
    validation: {
      buildable, versatz_ok: versatzOk, versatz_violations: viol,
      tension_span_ok: spanOk, rigid_lagen: rigidLagen, invalid_segments: invalidSegments,
      zuschnitt_konflikte: zuschnittKonflikte,
      // [A-11] Blechstoesse, die auf einem Steinstoss der untersten Lage liegen, sowie ein
      // leerer Vorratssatz — sichtbare Meldung, KEIN Baubarkeitsausschluss.
      blech_konflikte: bodenZerlegung.konflikte,
      // [V-2] Steine ohne Spannachse. Auto-Pfad: immer leer. Manuelle Achsen: echter Befund.
      ungehaltene_steine: ungehalteneSteine,
      // [G-12] Ungueltige/fehlerhafte Verzahnungsbereiche (sichtbare Warnung, kein Baubarkeitsausschluss)
      interlock_fehler: IL.fehler,
      // [A-17] Abgewiesene manuelle Zwischenspannpunkte — benannt, nicht angewandt, nie gerundet.
      // Der Schluessel entsteht NUR im Fehlerfall: eine Wand ohne Override soll kein Feld
      // bekommen, das es vorher nicht gab (das gilt fuer die Auto-Ableitung ebenso).
      ...(ZP.fehler.length ? { zwischenpunkt_fehler: ZP.fehler } : {}),
      // [G-10] Nicht baubare Restbreiten durch Verzahnungsaussparung (z.B. 1 oder 4 Raster)
      interlock_invalid_segments: interlockInvalidSegments,
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
// Die Referenzwaende sind ausdrueckliche KOPFBLECH-Faelle: ihre goldenen Fixtures tragen
// `top_connection: "blech"`. Der Wert wird hier AUSGESPROCHEN statt dem Default ueberlassen —
// sonst verschoebe ein spaeterer Wechsel des allgemeinen Defaults die Goldwerte still.
// Der Default in `normPrestress` bleibt davon unberuehrt.
export function buildReference(key) {
  const [name, l, h, ops] = REFERENCE_WALLS[key];
  return buildWall(name, l, h, ops, null, { top_connection: "blech" });
}
