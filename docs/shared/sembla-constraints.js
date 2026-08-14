// @ts-check
/**
 * SEMBLA Constraints — Bemassungen und Loeser des Layout-Editors
 * (Kapitel 16.10, [K-1]…[K-13]).
 *
 * Alle Waende sind achsparallel ([L-2]). Damit zerfaellt die Verortung in ZWEI
 * unabhaengige eindimensionale Aufgaben ([K-1]), und jede Bemassung ist eine
 * lineare Gleichung
 *
 *     wert(bis) − wert(von) = mass_mm
 *
 * Geloest wird direkt mit einer Vereinigungssuche, die den Abstand zur Wurzel
 * mitfuehrt ("union-find with offset") — KEINE Iteration, KEINE Toleranz,
 * KEINE Startwerte ([K-5]). Alle Werte sind Vielfache von 0,5 mm (Masse
 * ganzzahlig, Kantenabstand zur Mittellinie ±62,5 mm) und damit in IEEE-754
 * exakt darstellbar; ein Rundungsdrift kann nicht entstehen.
 *
 * Lage einer Wand ([L-1], Fassung ab C3.2; `orientierung` seit #84):
 *
 *   lage = { start_mm: {x, y}, richtung: "x"|"y",
 *            orientierung: "+x"|"-x"|"+y"|"-y", laenge_grid: n }
 *   lage = null                      // unverortet
 *
 * `start_mm` ist der Ankerpunkt: er liegt auf der MITTELLINIE der Wand, am Ende
 * mit der kleineren Koordinate. Position in Vielfachen von 0,5 mm (s. `_istHalbe`),
 * Laenge im 125-mm-Raster, Breite konstant 125 mm.
 *
 * `orientierung` ist die GERICHTETE Wandorientierung (#84): die Achse aus
 * `richtung` plus das Vorzeichen der Zeichenrichtung. Sie unterscheidet Vorder-
 * und Rueckseite der Wand und liegt GENAU EINMAL hier in der kanonischen Lage —
 * Geschosseditor und Lageplan leiten beide Aussenkanten ueber `wandSeiten()` ab.
 * KONVENTION: in Blickrichtung der Orientierung liegt die VORDERSEITE RECHTS
 * (Welt-/Papierkoordinaten, x nach rechts, y nach unten); ihre Normale ist die
 * um +90° gedrehte Orientierung ((dx,dy) → (−dy,dx)). Fuer Geometrie, Loeser und
 * Bemassung ist die Orientierung wirkungslos — sie erreicht weder `wandRechteck`
 * noch `bezugsOffset`. Altstaende ohne das Feld werden beim Lesen deterministisch
 * und verlustfrei auf die POSITIVE Richtung ihrer Achse normalisiert.
 *
 * Dieses Modul ist REIN und DOM-frei und importiert nichts. Es kennt weder
 * Projektmappe noch Speicher — es rechnet auf Listen von {id, lage} und
 * Bemassungen. Persistenz liegt in `storage.js`, die Struktur in
 * `sembla-projektmappe.js`, die Bedienung in `docs/geschossplan.html`.
 *
 * Eigene Datei nach shared-Regel (b): eigene Tests (tests/module/test-constraints.mjs).
 */

/** Laengsraster in mm ([G-1]). Einheit der WandLAENGE ([L-1]). */
export const GRID_MM = 125;

/** Wandbreite in mm — konstant, nicht bemassbar ([K-2]). */
export const BREITE_MM = 125;

/** Abstand Mittellinie ↔ Laengskante. Vielfaches von 0,5 mm ([K-5]). */
export const HALB_BREITE_MM = BREITE_MM / 2;

/** Zulaessige Achsen ([K-1]). */
export const ACHSEN = /** @type {ReadonlyArray<'x'|'y'>} */ (["x", "y"]);

/**
 * Die vier — und einzigen — gerichteten Wandorientierungen (#84). Die
 * Achskomponente MUSS `lage.richtung` entsprechen; ein Widerspruch wird in
 * `lageFehler` gemeldet, nie still umgedeutet.
 */
export const ORIENTIERUNGEN = /** @type {ReadonlyArray<'+x'|'-x'|'+y'|'-y'>} */ (
  ["+x", "-x", "+y", "-y"]);

/**
 * Die beiden Wandseiten (#84) mit Kennbuchstabe und Kennfarbe — EINE Definition
 * fuer Geschosseditor und Lageplan. Die Farben sind bewusst keine der
 * Zustandsfarben aus [K-8], und die Kennzeichnung ist nie nur Farbe: der
 * Kennbuchstabe steht immer dabei.
 */
export const SEITEN = Object.freeze({
  vorder: Object.freeze({ kuerzel: "V", name: "Vorderseite", farbe: "#c2571a" }),
  rueck: Object.freeze({ kuerzel: "R", name: "Rückseite", farbe: "#5b3fa8" }),
});

/** Die drei — und einzigen — Bezuege je Wand und Achse ([K-2]). */
export const BEZUEGE = /** @type {ReadonlyArray<'min'|'mitte'|'max'>} */ (["min", "mitte", "max"]);

/** Kennung des Grundbezugs: der Geschossursprung ([K-4]). */
export const URSPRUNG = "@ursprung";

/**
 * Lage des Geschossursprungs, wenn keine gespeichert ist (#76). Das ist
 * zugleich die verlustfreie Deutung eines Altstands ohne das Feld: „Feld fehlt"
 * und „Feld ist 0/0" bedeuten exakt dasselbe, weshalb die Uebernahme idempotent
 * ist und ohne Formatbump auskommt.
 */
export const URSPRUNG_STANDARD = Object.freeze({ x: 0, y: 0 });

/**
 * Zustaende einer Wand und ihre Farben ([K-8]).
 * Vorrang: fehler > aktiv > bestimmt > frei.
 */
export const FARBEN = Object.freeze({
  fehler: "#d92b2b",    // rot   — Widerspruch [K-6] oder Kollision [K-13]
  aktiv: "#1f9d4d",     // gruen — AKTIVE Wand (genau eine, in Bearbeitung). Mehrfach
                        //         AUSGEWAEHLTE Waende sind reine Bedienung und bekommen
                        //         keine eigene Zustandsfarbe, nur einen Rahmen.
  bestimmt: "#1a1a1a",  // schwarz — in x UND y bestimmt
  frei: "#7fb6e6",      // hellblau — in mindestens einer Achse frei
});

// --- kleine Helfer --------------------------------------------------------

function _zahlOderNull(v) {
  return (v == null || v === "" || !Number.isFinite(+v)) ? null : +v;
}

function _istGanzzahl(v) {
  return Number.isInteger(v);
}

/**
 * Vielfaches von 0,5 mm — das zulaessige Positionsraster ([L-1], Fassung ab C3.2).
 * Ganzzahlig geht nicht: die 125 mm breite Wand legt jede Laengskante genau
 * 62,5 mm neben ihre Mittellinie, ein Mass Kante→Mittellinie landet also
 * zwangslaeufig auf einem halben Millimeter. Kleiner wird es nie.
 */
function _istHalbe(v) {
  return Number.isFinite(v) && Number.isInteger(v * 2);
}

/** Die jeweils andere Achse. @param {'x'|'y'} achse */
export function andereAchse(achse) {
  return achse === "x" ? "y" : "x";
}

// --- Lage -----------------------------------------------------------------

/**
 * Eine Lage normalisieren. Krumme Werte werden NICHT gerundet ([L-1]) — sie
 * bleiben stehen und fallen in `lageFehler` auf.
 * @param {any} lage
 */
export function normLage(lage) {
  if (lage == null || typeof lage !== "object") return null;
  const s = lage.start_mm || {};
  // Altstand ohne gerichtete Orientierung (#84): deterministisch und verlustfrei
  // die POSITIVE Richtung der vorhandenen Achse — Altdaten trugen nie eine Seite,
  // es geht also nichts verloren. Ein gesetzter Wert bleibt unangetastet und wird
  // in `lageFehler` gegen die Achse geprueft, nie still umgedeutet.
  const orientierung = (lage.orientierung == null && ACHSEN.includes(lage.richtung))
    ? "+" + lage.richtung
    : (lage.orientierung == null ? null : String(lage.orientierung));
  return {
    start_mm: { x: _zahlOderNull(s.x), y: _zahlOderNull(s.y) },
    richtung: lage.richtung,
    orientierung,
    laenge_grid: _zahlOderNull(lage.laenge_grid),
  };
}

/**
 * Fehler einer Lage ([L-1]/[L-2]): Position ganzzahlig in mm, Richtung
 * orthogonal, Laenge ganzzahlig im 125-mm-Raster. `null` = unverortet, kein Fehler.
 * @param {any} lage @param {string} [bezeichnung] @returns {string[]}
 */
export function lageFehler(lage, bezeichnung) {
  const wo = bezeichnung ? `Wand „${bezeichnung}“: ` : "";
  if (lage == null) return [];
  const l = normLage(lage);
  if (!l) return [`${wo}Lage ist kein Objekt.`];
  const f = [];
  for (const a of ACHSEN) {
    const v = l.start_mm[a];
    if (!_istHalbe(v)) {
      f.push(`${wo}Position ${a} muss ein Vielfaches von 0,5 mm sein (gefunden: ${v ?? "—"}) — [L-1].`);
    }
  }
  if (!ACHSEN.includes(l.richtung)) {
    f.push(`${wo}Richtung muss „x“ oder „y“ sein (gefunden: ${l.richtung ?? "—"}) — [L-2].`);
  }
  // Gerichtete Orientierung (#84): nur die vier Werte, und die Achskomponente muss
  // zur Richtung passen. Fehlt sie bei ungueltiger Richtung, genuegt der eine
  // Richtungsfehler — normLage konnte dann keinen Standard bilden.
  if (l.orientierung != null || ACHSEN.includes(l.richtung)) {
    if (!ORIENTIERUNGEN.includes(l.orientierung)) {
      f.push(`${wo}Orientierung muss „+x“, „-x“, „+y“ oder „-y“ sein (gefunden: ${l.orientierung ?? "—"}) — #84.`);
    } else if (ACHSEN.includes(l.richtung) && l.orientierung.slice(1) !== l.richtung) {
      f.push(`${wo}Orientierung „${l.orientierung}“ widerspricht der Achse „${l.richtung}“ — gemeldet, nicht umgedeutet (#84).`);
    }
  }
  if (!_istGanzzahl(l.laenge_grid) || Number(l.laenge_grid) < 1) {
    f.push(`${wo}Länge muss ganzzahlig in Rastereinheiten und mindestens 1 sein (gefunden: ${l.laenge_grid ?? "—"}) — [L-1].`);
  }
  return f;
}

// --- Geschossursprung ([K-4], #76) ----------------------------------------

/**
 * Die Lage des Geschossursprungs normalisieren (#76). Fehlt der Punkt oder eine
 * seiner Koordinaten, gilt 0 — genau der Stand vor #76, als der Ursprung fest
 * auf (0,0) sass. Ein VORHANDENER, aber unbrauchbarer Wert wird NICHT auf 0
 * gebogen: er bleibt `null` und faellt in `ursprungFehler` auf ([P-9]).
 * @param {any} u @returns {{x:number|null, y:number|null}}
 */
export function normUrsprung(u) {
  const o = (u && typeof u === "object") ? u : {};
  const koord = (v) => (v == null || v === "") ? 0 : _zahlOderNull(v);
  return { x: koord(o.x), y: koord(o.y) };
}

/**
 * Fehler einer Ursprungslage (#76). Zulaessig sind Vielfache von 0,5 mm — dasselbe
 * Positionsraster wie die Wandlage ([L-1]); der Ursprung ist ein Punkt in
 * derselben Welt und bekommt kein eigenes, feineres Raster.
 * @param {any} u @param {string} [bezeichnung] @returns {string[]}
 */
export function ursprungFehler(u, bezeichnung) {
  const wo = bezeichnung ? `Geschoss „${bezeichnung}“: ` : "";
  if (u == null) return [];                                   // fehlt = 0/0 ([K-4])
  if (typeof u !== "object") return [`${wo}Ursprung ist kein Punkt.`];
  const n = normUrsprung(u);
  const f = [];
  for (const a of ACHSEN) {
    if (!_istHalbe(n[a])) {
      f.push(`${wo}Ursprung ${a} muss ein Vielfaches von 0,5 mm sein (gefunden: ${n[a] ?? "—"}) — [K-4]/[L-1].`);
    }
  }
  return f;
}

/**
 * Der WIRKSAME Ursprung: normalisiert, und bei fehlerhafter Angabe der Standard.
 * Der Loeser darf nie mit `null` rechnen — ein kaputtes Feld wird an seiner
 * Fundstelle gemeldet (`ursprungFehler`/`validiereMappe`) und hier nicht ein
 * zweites Mal stillschweigend gedeutet.
 * @param {any} u @returns {{x:number, y:number}}
 */
export function ursprungPunkt(u) {
  const n = normUrsprung(u);
  return {
    x: _istHalbe(n.x) ? /** @type {number} */ (n.x) : URSPRUNG_STANDARD.x,
    y: _istHalbe(n.y) ? /** @type {number} */ (n.y) : URSPRUNG_STANDARD.y,
  };
}

/**
 * Die deterministische Nachfuehrung der Ursprungsmasse beim VERSCHIEBEN des
 * Ursprungs (#76).
 *
 * Ein Ursprungsmass misst `mass = wert(bis) − U[achse]` ([K-4]: der Ursprung ist
 * immer der START). Soll die Wand stehen bleiben, folgt der neue Wert in
 * geschlossener Form:
 *
 *     mass' = mass − (U'[achse] − U[achse])
 *
 * Vorzeichen und Bezugsseite bleiben dabei KONSTRUKTIV erhalten: es gibt keine
 * zweite Leserichtung, und `bis` wird nicht angefasst. Masse zwischen zwei
 * Wandbezuegen sind Differenzen und von U unabhaengig — sie kommen nicht vor.
 *
 * Geprueft wird das Ergebnis mit `bemassungFehler`, also der EINEN vorhandenen
 * Massregel ([K-3] nicht negativ, [K-12] ganzzahlig). Es wird nichts gerundet,
 * gedreht oder geloescht: unbrauchbare Ergebnisse stehen in `ungueltig` und der
 * Aufrufer weist die ganze Uebernahme ab.
 *
 * @param {any[]} bemassungen @param {any} alt @param {any} neu
 * @param {Map<string,any>} [lagen] bekannte Waende (fuer die Massregeln)
 * @returns {{delta:{x:number,y:number},
 *            aenderungen:{id:string, achse:'x'|'y', alt_mm:number, neu_mm:number, bemassung:any}[],
 *            ungueltig:{id:string, achse:'x'|'y', alt_mm:number, neu_mm:number, fehler:string[]}[]}}
 */
export function ursprungNachfuehrung(bemassungen, alt, neu, lagen) {
  const a = ursprungPunkt(alt);
  const b = ursprungPunkt(neu);
  const delta = { x: b.x - a.x, y: b.y - a.y };
  const aenderungen = [];
  const ungueltig = [];
  for (const roh of (Array.isArray(bemassungen) ? bemassungen : [])) {
    const n = normBemassung(roh);
    if (n.von != null) continue;                              // kein Ursprungsmass
    const achse = /** @type {'x'|'y'} */ (n.achse);
    if (!ACHSEN.includes(achse) || !delta[achse]) continue;   // andere Achse: unberuehrt
    if (n.mass_mm == null) continue;                          // schon ohne Mass: faellt anderswo auf
    const neu_mm = n.mass_mm - delta[achse];
    const bem = { ...n, mass_mm: neu_mm };
    const fehler = bemassungFehler(bem, lagen);
    const eintrag = { id: n.id, achse, alt_mm: n.mass_mm, neu_mm };
    if (fehler.length) ungueltig.push({ ...eintrag, fehler });
    else aenderungen.push({ ...eintrag, bemassung: bem });
  }
  return { delta, aenderungen, ungueltig };
}

/** Wandlaenge in mm aus der Lage. `null` = unverortet/ungueltig. @param {any} lage */
export function laengeMm(lage) {
  const l = normLage(lage);
  return (l && _istGanzzahl(l.laenge_grid)) ? Number(l.laenge_grid) * GRID_MM : null;
}

/**
 * Offset eines Bezugs gegenueber dem Ankerpunkt `start_mm` ([K-2]).
 *
 *   laengs (Achse = Richtung):  min 0 · mitte L/2 · max L
 *   quer   (Achse ≠ Richtung):  min −62,5 · mitte 0 · max +62,5
 *
 * @param {any} lage @param {'x'|'y'} achse @param {'min'|'mitte'|'max'} bezug
 * @returns {number|null}
 */
export function bezugsOffset(lage, achse, bezug) {
  const l = normLage(lage);
  if (!l || !ACHSEN.includes(achse) || !BEZUEGE.includes(bezug)) return null;
  if (!ACHSEN.includes(l.richtung)) return null;
  if (achse === l.richtung) {
    const L = laengeMm(l);
    if (L == null) return null;
    return bezug === "min" ? 0 : bezug === "mitte" ? L / 2 : L;
  }
  return bezug === "min" ? -HALB_BREITE_MM : bezug === "mitte" ? 0 : HALB_BREITE_MM;
}

/**
 * Absolute Koordinate eines Bezugs.
 * @param {any} lage @param {'x'|'y'} achse @param {'min'|'mitte'|'max'} bezug
 * @param {{x:number,y:number}} [position] Ankerpunkt (Standard: `lage.start_mm`)
 * @returns {number|null}
 */
export function bezugsWert(lage, achse, bezug, position) {
  const off = bezugsOffset(lage, achse, bezug);
  if (off == null) return null;
  const anker = position ? position[achse] : normLage(lage)?.start_mm[achse];
  return (anker == null || !Number.isFinite(anker)) ? null : anker + off;
}

/**
 * Grundrissrechteck einer Wand in mm (125 mm breit).
 * @param {any} lage @param {{x:number,y:number}} [position]
 * @returns {{x_min:number,x_max:number,y_min:number,y_max:number}|null}
 */
export function wandRechteck(lage, position) {
  const l = normLage(lage);
  if (!l || lageFehler(l).length) return null;
  const p = position || l.start_mm;
  const L = /** @type {number} */ (laengeMm(l));
  return l.richtung === "x"
    ? { x_min: p.x, x_max: p.x + L, y_min: p.y - HALB_BREITE_MM, y_max: p.y + HALB_BREITE_MM }
    : { x_min: p.x - HALB_BREITE_MM, x_max: p.x + HALB_BREITE_MM, y_min: p.y, y_max: p.y + L };
}

// --- Gerichtete Orientierung und Wandseiten (#84) ---------------------------

/** Einheitsvektor je Orientierung — Welt-mm, x nach rechts, y nach unten. */
const _O_VEKTOR = Object.freeze({
  "+x": Object.freeze({ x: 1, y: 0 }), "-x": Object.freeze({ x: -1, y: 0 }),
  "+y": Object.freeze({ x: 0, y: 1 }), "-y": Object.freeze({ x: 0, y: -1 }),
});

/**
 * Orientierung um +90° gedreht ((dx,dy) → (−dy,dx)): der Zyklus
 * +x → +y → −x → −y → +x. GENAU diese Drehung fuehrt der Editor beim
 * 90°-Drehen einer Wand aus — die physische Vorderseite folgt damit der Wand.
 * Zweimal 90° laesst die Geometrie bit-genau stehen, tauscht aber — physikalisch
 * korrekt — die Seiten (= `wendeOrientierung`).
 * @param {any} orientierung @returns {'+x'|'-x'|'+y'|'-y'|null}
 */
export function dreheOrientierung(orientierung) {
  const d = _O_VEKTOR[orientierung];
  if (!d) return null;
  const g = { x: -d.y, y: d.x };
  return /** @type {any} */ (ORIENTIERUNGEN.find((o) => _O_VEKTOR[o].x === g.x && _O_VEKTOR[o].y === g.y) || null);
}

/**
 * Orientierung um 180° gewendet — tauscht AUSSCHLIESSLICH Vorder- und
 * Rueckseite; Achse, Anker und Laenge bleiben unberuehrt (#84).
 * @param {any} orientierung @returns {'+x'|'-x'|'+y'|'-y'|null}
 */
export function wendeOrientierung(orientierung) {
  return dreheOrientierung(dreheOrientierung(orientierung));
}

/**
 * Die beiden LAENGSAUSSENKANTEN einer verorteten Wand mit ihrer V/R-Zuordnung —
 * die EINE gemeinsame Ableitung fuer Geschosseditor und Lageplan (#84).
 *
 * Konvention (s. Kopfkommentar): die Vorderseiten-Normale ist die um +90°
 * gedrehte Orientierung; in Blickrichtung liegt die Vorderseite damit rechts.
 * `aussen` ist der Einheitsvektor von der Wand weg — fuer die Platzierung der
 * Kennbuchstaben. Unverortete oder fehlerhafte Lagen liefern `null`: es wird
 * keine Seite erfunden.
 *
 * @param {any} lage @param {{x:number,y:number}} [position]
 * @returns {{orientierung:string,
 *            vorder:{a:{x:number,y:number}, b:{x:number,y:number}, aussen:{x:number,y:number}},
 *            rueck:{a:{x:number,y:number}, b:{x:number,y:number}, aussen:{x:number,y:number}}}|null}
 */
export function wandSeiten(lage, position) {
  const l = normLage(lage);
  if (!l || lageFehler(l).length) return null;
  const r = wandRechteck(l, position);
  if (!r) return null;
  const d = _O_VEKTOR[l.orientierung];
  const n = { x: -d.y, y: d.x };                 // Vorderseiten-Normale (+90°)
  const kante = (v) => v.x > 0
    ? { a: { x: r.x_max, y: r.y_min }, b: { x: r.x_max, y: r.y_max }, aussen: v }
    : v.x < 0
      ? { a: { x: r.x_min, y: r.y_min }, b: { x: r.x_min, y: r.y_max }, aussen: v }
      : v.y > 0
        ? { a: { x: r.x_min, y: r.y_max }, b: { x: r.x_max, y: r.y_max }, aussen: v }
        : { a: { x: r.x_min, y: r.y_min }, b: { x: r.x_max, y: r.y_min }, aussen: v };
  return {
    orientierung: l.orientierung,
    vorder: kante(n),
    rueck: kante({ x: -n.x, y: -n.y }),
  };
}

// --- Bemassungen ----------------------------------------------------------

/**
 * Einen Bemassungs-Endpunkt normalisieren. `null` = Geschossursprung ([K-4]) —
 * zulaessig ist das nur als START der Bemassung (`von`), damit ein Fixiermass
 * "vom Ursprung 1000 mm zur Wand" das erwartete Vorzeichen hat.
 * @param {any} p @returns {{wand:string,bezug:string}|null}
 */
export function normEndpunkt(p) {
  if (p == null) return null;
  if (typeof p !== "object") return { wand: String(p), bezug: "mitte" };
  return { wand: p.wand == null ? "" : String(p.wand), bezug: p.bezug == null ? "" : String(p.bezug) };
}

/**
 * Eine Bemassung normalisieren. Nichts wird zurechtgebogen — ungueltige
 * Angaben fallen in `bemassungFehler` auf.
 * @param {any} b
 */
export function normBemassung(b) {
  const o = (b && typeof b === "object") ? b : {};
  const t = o.text_mm;
  return {
    id: o.id == null ? "" : String(o.id),
    achse: o.achse,
    von: normEndpunkt(o.von),
    bis: normEndpunkt(o.bis),
    mass_mm: _zahlOderNull(o.mass_mm),
    text_mm: (t && typeof t === "object")
      ? { x: _zahlOderNull(t.x) ?? 0, y: _zahlOderNull(t.y) ?? 0 }
      : null,
    // Querversatz der MASSDARSTELLUNG (Masslinie samt Zahl und mitwachsenden
    // Hilfslinien) in mm, quer zur Messrichtung — reine Darstellung.
    // Der Loeser sieht das Feld NIE: es kommt in keiner Gleichung vor ([K-5]).
    // `text_mm` bleibt daneben unveraendert der Versatz der ZAHL allein.
    linie_mm: _zahlOderNull(o.linie_mm),
  };
}

/**
 * Ist die Bemassung ein Laengenmass ([K-11])? Beide Endpunkte liegen auf
 * DERSELBEN Wand, in deren Laengsachse, auf den beiden Stirnkanten.
 * @param {any} b @param {Map<string,any>} [lagen] Lage je Wand-Id (fuer die Richtungspruefung)
 */
export function istLaengenmass(b, lagen) {
  const n = normBemassung(b);
  if (!n.von || !n.bis) return false;
  if (n.von.wand !== n.bis.wand) return false;
  const bezuege = [n.von.bezug, n.bis.bezug].sort().join("|");
  if (bezuege !== "max|min") return false;
  if (!lagen) return true;
  const l = normLage(lagen.get(n.von.wand));
  return !!l && l.richtung === n.achse;
}

/**
 * Pruefung eines Laengenmasses ([K-11]): ganzzahliges Vielfaches von 125 mm.
 * Ein anderer Wert wird ABGEWIESEN und nennt die beiden naechstliegenden
 * zulaessigen Masse — er wird nicht gerundet ([P-9]).
 * @param {any} mass_mm
 * @returns {{ok:boolean, naechste:[number,number]|null, meldung:string|null}}
 */
export function pruefeLaengenmass(mass_mm) {
  const v = _zahlOderNull(mass_mm);
  if (v == null || !_istGanzzahl(v) || v < GRID_MM) {
    return {
      ok: false, naechste: null,
      meldung: `Länge muss ein ganzzahliges Vielfaches von ${GRID_MM} mm und mindestens ${GRID_MM} mm sein — [K-11].`,
    };
  }
  if (v % GRID_MM === 0) return { ok: true, naechste: null, meldung: null };
  const unten = Math.floor(v / GRID_MM) * GRID_MM;
  const oben = unten + GRID_MM;
  return {
    ok: false,
    naechste: /** @type {[number,number]} */ ([unten, oben]),
    meldung: `${v} mm ist kein Vielfaches von ${GRID_MM} mm. Zulässig wären ${unten} mm oder ${oben} mm — [K-11].`,
  };
}

/**
 * Fehler einer einzelnen Bemassung ([K-1]…[K-3], [K-11], [K-12]).
 * @param {any} b @param {Map<string,any>} [lagen] bekannte Waende (Lage je Id)
 * @returns {string[]}
 */
export function bemassungFehler(b, lagen) {
  const n = normBemassung(b);
  const wo = `Bemaßung „${n.id || "ohne Kennung"}“: `;
  const f = [];
  if (!n.id) f.push(`${wo}ohne Kennung.`);
  if (!ACHSEN.includes(n.achse)) {
    f.push(`${wo}Achse muss „x“ oder „y“ sein (gefunden: ${n.achse ?? "—"}) — [K-1].`);
  }
  if (!n.bis) {
    // Der Ursprung ist der ANFANG einer Bemassung: "vom Ursprung 1000 mm zur Wand".
    // Als Ziel gelesen kehrte sich das Vorzeichen um und ein Fixiermass landete im Negativen.
    f.push(`${wo}Zielbezug fehlt — der Ursprung ist nur als Startbezug zulässig — [K-4].`);
  }
  for (const [rolle, p] of /** @type {const} */ ([["Startbezug", n.von], ["Zielbezug", n.bis]])) {
    if (p == null) continue;                        // Ursprung ([K-4])
    if (!p.wand) f.push(`${wo}${rolle} ohne Wand — [K-2].`);
    if (!BEZUEGE.includes(/** @type {any} */ (p.bezug))) {
      f.push(`${wo}${rolle} muss „min“, „mitte“ oder „max“ sein (gefunden: ${p.bezug || "—"}) — [K-2].`);
    }
    if (p.wand && lagen && !lagen.has(p.wand)) {
      f.push(`${wo}${rolle} verweist auf die unbekannte Wand „${p.wand}“ — [K-10].`);
    }
  }
  if (n.mass_mm == null) {
    f.push(`${wo}ohne Maß — ein rein messendes Maß gibt es nicht — [K-3].`);
  } else if (!_istGanzzahl(n.mass_mm)) {
    f.push(`${wo}Maß muss ganzzahlig in Millimetern sein (gefunden: ${n.mass_mm}) — [K-12].`);
  } else if (n.mass_mm < 0) {
    f.push(`${wo}Maß darf nicht negativ sein (gefunden: ${n.mass_mm} mm) — [K-3].`);
  }
  if (n.von && n.bis && n.von.wand === n.bis.wand && n.von.bezug === n.bis.bezug) {
    f.push(`${wo}Start- und Zielbezug sind derselbe Punkt — [K-3].`);
  }
  // Ein unbrauchbarer Querversatz wird BENANNT abgewiesen, nicht still auf 0
  // gesetzt: sonst waere eine kaputte Datei nachher unauffaellig ([P-9]).
  if (b && typeof b === "object" && b.linie_mm != null && n.linie_mm == null) {
    f.push(`${wo}Querversatz der Maßdarstellung muss eine Zahl in Millimetern sein (gefunden: ${b.linie_mm}).`);
  }
  if (istLaengenmass(n, lagen)) {
    const p = pruefeLaengenmass(n.mass_mm);
    if (!p.ok && n.mass_mm != null) f.push(wo + p.meldung);
  } else if (n.von && n.bis && n.von.wand === n.bis.wand) {
    // Zwei Bezuege derselben Wand, die KEIN Laengenmass sind: quer waere die
    // Wanddicke (nicht bemassbar, [K-2]), laengs eine Mittellinien-Selbstbezug.
    f.push(`${wo}zwischen zwei Bezügen derselben Wand ist nur das Längenmaß zwischen den Stirnkanten zulässig; die Wanddicke ist nicht bemaßbar — [K-2]/[K-11].`);
  }
  return f;
}

/**
 * Fehler einer ganzen Bemassungsliste (inkl. doppelter Kennungen).
 * @param {any[]} liste @param {Map<string,any>} [lagen] @returns {string[]}
 */
export function bemassungenFehler(liste, lagen) {
  const f = [];
  if (!Array.isArray(liste)) return ["Bemaßungen müssen eine Liste sein."];
  const gesehen = new Set();
  for (const b of liste) {
    f.push(...bemassungFehler(b, lagen));
    const id = normBemassung(b).id;
    if (id) {
      if (gesehen.has(id)) f.push(`Bemaßung „${id}“: Kennung doppelt vergeben — [L-4].`);
      gesehen.add(id);
    }
  }
  return f;
}

// --- Vereinigungssuche mit Offset ([K-5]) ---------------------------------

/**
 * `wert(knoten) − wert(elter)` wird im Offset mitgefuehrt. Rein iterativ
 * implementiert (kein Rekursionslimit), Ergebnis reihenfolgeunabhaengig
 * gegenueber Pfadverkuerzung.
 */
function _neueMenge() {
  /** @type {Map<string,{elter:string, offset:number}>} */
  const knoten = new Map();
  const sichern = (k) => { if (!knoten.has(k)) knoten.set(k, { elter: k, offset: 0 }); };

  /** @returns {{wurzel:string, offset:number}} wert(k) = wert(wurzel) + offset */
  function finde(k) {
    sichern(k);
    const pfad = [];
    let cur = k;
    let e = /** @type {{elter:string,offset:number}} */ (knoten.get(cur));
    while (e.elter !== cur) { pfad.push(cur); cur = e.elter; e = /** @type {any} */ (knoten.get(cur)); }
    // Pfadverkuerzung mit aufsummierten Offsets
    let acc = 0;
    for (let i = pfad.length - 1; i >= 0; i--) {
      const n = /** @type {any} */ (knoten.get(pfad[i]));
      acc += n.offset;
      knoten.set(pfad[i], { elter: cur, offset: acc });
    }
    return { wurzel: cur, offset: k === cur ? 0 : /** @type {any} */ (knoten.get(k)).offset };
  }

  /**
   * Verknuepft a und b mit `wert(b) − wert(a) = delta`.
   * @returns {{status:'verbunden'|'redundant'|'widerspruch', differenz:number}}
   */
  function vereinige(a, b, delta) {
    const ra = finde(a), rb = finde(b);
    if (ra.wurzel === rb.wurzel) {
      const ist = rb.offset - ra.offset;
      const diff = delta - ist;
      return diff === 0
        ? { status: "redundant", differenz: 0 }
        : { status: "widerspruch", differenz: diff };
    }
    // wert(wurzel_b) − wert(wurzel_a) = delta − offset_b + offset_a
    knoten.set(rb.wurzel, { elter: ra.wurzel, offset: delta - rb.offset + ra.offset });
    return { status: "verbunden", differenz: 0 };
  }

  return { finde, vereinige, sichern };
}

// --- Loeser ---------------------------------------------------------------

/**
 * @typedef {{id:string, lage:any}} Wandeintrag
 */

/**
 * Verortung eines Geschosses loesen ([K-1]…[K-9]).
 *
 * Vorgehen je Achse: alle gueltigen Bemassungen werden der Reihe nach in die
 * Vereinigungssuche gegeben. Eine Bemassung, die einem bereits festliegenden
 * Abstand WIDERSPRICHT, wird NICHT angewandt, sondern gemeldet — so bleiben die
 * Positionen auf dem letzten widerspruchsfreien Stand ([K-6]). Eine
 * widerspruchsfreie Wiederholung ist redundant und bleibt wirksam ([K-7]).
 *
 * Waende mit Kette zum Ursprung sind BESTIMMT und bekommen die geloeste
 * Koordinate. Waende ohne diese Kette bleiben FREI; ihre Gruppe wird am
 * Mitglied mit der (lexikographisch) kleinsten Kennung verankert und aus dessen
 * gespeicherter Position abgeleitet — das ist reihenfolgeunabhaengig und damit
 * deterministisch ([K-5]).
 *
 * @param {Wandeintrag[]} waende Nur verortete Waende werden geloest; `lage: null` wird uebergangen.
 * @param {any[]} [bemassungen]
 * @param {any} [ursprung] Lage des Geschossursprungs ([K-4], #76). Fehlt sie, gilt 0/0 —
 *   damit rechnen Altstaende und Alt-Aufrufer bitgenau wie zuvor.
 */
export function loese(waende, bemassungen, ursprung) {
  const U = ursprungPunkt(ursprung);
  /** @type {Map<string,any>} */
  const lagen = new Map();
  const ids = [];
  for (const w of (Array.isArray(waende) ? waende : [])) {
    const id = w && w.id != null ? String(w.id) : "";
    if (!id) continue;
    lagen.set(id, w.lage ?? null);
    if (w.lage != null && lageFehler(w.lage).length === 0) ids.push(id);
  }
  ids.sort();

  const liste = Array.isArray(bemassungen) ? bemassungen.map(normBemassung) : [];
  const fehler = bemassungenFehler(liste, lagen);
  const widersprueche = [];
  const redundanzen = [];

  /** @type {Record<'x'|'y', ReturnType<typeof _neueMenge>>} */
  const mengen = { x: _neueMenge(), y: _neueMenge() };
  for (const a of ACHSEN) {
    mengen[a].sichern(URSPRUNG);
    for (const id of ids) mengen[a].sichern(id);
  }

  /** Merkt sich, welche Bemassung einen Abstand zuerst festgelegt hat (fuer die Konfliktmeldung). */
  /** @type {Record<'x'|'y', Map<string,string>>} */
  const quelle = { x: new Map(), y: new Map() };
  const schluessel = (a, b) => [a, b].sort().join("→");

  for (const b of liste) {
    if (bemassungFehler(b, lagen).length) continue;                  // ungueltig: gemeldet, nicht angewandt
    const achse = /** @type {'x'|'y'} */ (b.achse);
    const bis = /** @type {{wand:string,bezug:any}} */ (b.bis);
    if (istLaengenmass(b, lagen)) continue;                          // treibt die Laenge, nicht die Position ([K-11])

    const knotenVon = b.von ? b.von.wand : URSPRUNG;                 // `von: null` = Geschossursprung ([K-4])
    const offVon = b.von ? bezugsOffset(lagen.get(b.von.wand), achse, /** @type {any} */ (b.von.bezug)) : 0;
    const knotenBis = bis.wand;
    const offBis = bezugsOffset(lagen.get(bis.wand), achse, bis.bezug);
    if (offVon == null || offBis == null) continue;                  // unverortete Wand: kein Constraint
    if ((b.von && !ids.includes(knotenVon)) || !ids.includes(knotenBis)) continue;

    // wert(bis) − wert(von) = mass  ⇒  anker(bis) − anker(von) = mass − offBis + offVon
    const delta = /** @type {number} */ (b.mass_mm) - offBis + offVon;
    const r = mengen[achse].vereinige(knotenVon, knotenBis, delta);
    const k = schluessel(knotenVon, knotenBis);
    if (r.status === "widerspruch") {
      widersprueche.push({
        achse, bemassung: b.id,
        konflikt_mit: quelle[achse].get(k) || null,
        differenz_mm: r.differenz,
        meldung: `Bemaßung „${b.id}“ (${achse}) widerspricht dem bereits festgelegten Abstand um ${r.differenz} mm`
          + (quelle[achse].get(k) ? ` — im Widerspruch zu „${quelle[achse].get(k)}“` : "")
          + " — [K-6].",
      });
    } else if (r.status === "redundant") {
      redundanzen.push({
        achse, bemassung: b.id,
        meldung: `Bemaßung „${b.id}“ (${achse}) wiederholt einen bereits bestimmten Abstand widerspruchsfrei (redundant) — [K-7].`,
      });
    } else if (!quelle[achse].has(k)) {
      quelle[achse].set(k, b.id);
    }
  }

  // Positionen ableiten
  /** @type {Record<string,{x:number,y:number}>} */
  const positionen = {};
  /** @type {Record<string,{x:boolean,y:boolean}>} */
  const bestimmt = {};
  /** @type {Record<'x'|'y', Record<string,string>>} */
  const gruppen = { x: {}, y: {} };

  for (const a of ACHSEN) {
    const wurzelVonUrsprung = mengen[a].finde(URSPRUNG).wurzel;
    /** @type {Map<string,string>} Wurzel → Ankerwand (kleinste Kennung) */
    const anker = new Map();
    for (const id of ids) {                                          // ids ist sortiert ⇒ erste ist die kleinste
      const w = mengen[a].finde(id).wurzel;
      if (w !== wurzelVonUrsprung && !anker.has(w)) anker.set(w, id);
    }
    for (const id of ids) {
      const { wurzel, offset } = mengen[a].finde(id);
      const gespeichert = Number(normLage(lagen.get(id))?.start_mm[a]);
      let wert;
      if (wurzel === wurzelVonUrsprung) {
        // Relativ zum Ursprung, PLUS dessen eigene Lage (#76). Vor #76 sass er fest
        // auf 0 — `U` ist dann 0 und die Rechnung bitgenau die alte.
        wert = U[a] + offset - mengen[a].finde(URSPRUNG).offset;
        (bestimmt[id] = bestimmt[id] || { x: false, y: false })[a] = true;
      } else {
        const ankerId = /** @type {string} */ (anker.get(wurzel));
        const ankerLage = normLage(lagen.get(ankerId));
        const ankerWert = Number(ankerLage?.start_mm[a]);
        wert = ankerWert + (offset - mengen[a].finde(ankerId).offset);
        (bestimmt[id] = bestimmt[id] || { x: false, y: false })[a] = false;
      }
      if (!Number.isFinite(wert)) wert = gespeichert;
      (positionen[id] = positionen[id] || { x: 0, y: 0 })[a] = wert;
      gruppen[a][id] = wurzel === wurzelVonUrsprung ? URSPRUNG : /** @type {string} */ (anker.get(wurzel));
    }
  }

  const offen = ids.filter((id) => !(bestimmt[id]?.x && bestimmt[id]?.y));
  return {
    ids, positionen, bestimmt, gruppen,
    widersprueche, redundanzen, fehler,
    offen,
    /** Wandkennungen, die an einem Widerspruch beteiligt sind ([K-8]). */
    fehlerhafteWaende: _betroffeneWaende(liste, widersprueche),
  };
}

function _betroffeneWaende(liste, widersprueche) {
  const nachId = new Map(liste.map((b) => [b.id, b]));
  const out = new Set();
  for (const w of widersprueche) {
    for (const bid of [w.bemassung, w.konflikt_mit]) {
      const b = bid ? nachId.get(bid) : null;
      if (!b) continue;
      if (b.von?.wand) out.add(b.von.wand);
      if (b.bis?.wand) out.add(b.bis.wand);
    }
  }
  return [...out].sort();
}

// --- Kollisionen ([K-13]) -------------------------------------------------

/**
 * Ueberlappende Waende finden. Bündiges Beruehren (Ueberschneidung 0) ist
 * ZULAESSIG und keine Kollision. Es wird nichts verschoben oder gekuerzt —
 * nur gemeldet ([K-13]).
 *
 * @param {Wandeintrag[]} waende
 * @param {Record<string,{x:number,y:number}>} [positionen] geloeste Positionen (Standard: gespeicherte Lage)
 * @returns {{a:string,b:string,ueberlappung_mm:{x:number,y:number},meldung:string}[]}
 */
export function kollisionen(waende, positionen) {
  const eintraege = [];
  for (const w of (Array.isArray(waende) ? waende : [])) {
    const id = w && w.id != null ? String(w.id) : "";
    if (!id || w.lage == null) continue;
    const r = wandRechteck(w.lage, positionen ? positionen[id] : undefined);
    if (r) eintraege.push({ id, r });
  }
  eintraege.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));

  const out = [];
  for (let i = 0; i < eintraege.length; i++) {
    for (let j = i + 1; j < eintraege.length; j++) {
      const A = eintraege[i], B = eintraege[j];
      const ux = Math.min(A.r.x_max, B.r.x_max) - Math.max(A.r.x_min, B.r.x_min);
      const uy = Math.min(A.r.y_max, B.r.y_max) - Math.max(A.r.y_min, B.r.y_min);
      if (ux > 0 && uy > 0) {
        out.push({
          a: A.id, b: B.id,
          ueberlappung_mm: { x: ux, y: uy },
          meldung: `Wände „${A.id}“ und „${B.id}“ überlappen sich um ${ux} × ${uy} mm — [K-13].`,
        });
      }
    }
  }
  return out;
}

// --- Zustand und Farbe ([K-8]) --------------------------------------------

/**
 * Zustand einer Wand. Vorrang: fehler > aktiv > bestimmt > frei.
 * @param {string} wandId
 * @param {{bestimmt:Record<string,{x:boolean,y:boolean}>, fehlerhafteWaende:string[]}} ergebnis
 * @param {{aktiv?:string|null, kollisionen?:{a:string,b:string}[]}} [opt]
 * @returns {'fehler'|'aktiv'|'bestimmt'|'frei'}
 */
export function zustand(wandId, ergebnis, opt) {
  const o = opt || {};
  const koll = (o.kollisionen || []).some((k) => k.a === wandId || k.b === wandId);
  if (koll || (ergebnis.fehlerhafteWaende || []).includes(wandId)) return "fehler";
  if (o.aktiv && o.aktiv === wandId) return "aktiv";
  const b = ergebnis.bestimmt ? ergebnis.bestimmt[wandId] : null;
  return (b && b.x && b.y) ? "bestimmt" : "frei";
}

/** Farbe zum Zustand ([K-8]). @param {string} wandId */
export function farbe(wandId, ergebnis, opt) {
  return FARBEN[zustand(wandId, ergebnis, opt)];
}

// --- Verschieben ([K-9]) --------------------------------------------------

/**
 * Eine Wand ziehen. Bewegt wird die GANZE starre Gruppe; eine in der Achse
 * bestimmte Wand laesst sich dort nicht ziehen, und der Grund wird benannt.
 * Ein gesetztes Mass wird dabei NIE geaendert ([K-9]).
 *
 * Liefert eine NEUE Wandliste (die uebergebene bleibt unveraendert).
 *
 * @param {Wandeintrag[]} waende
 * @param {any[]} bemassungen
 * @param {string} wandId
 * @param {{x?:number, y?:number}} versatz ganzzahlig in mm ([K-12])
 * @param {any} [ursprung] Lage des Geschossursprungs ([K-4], #76)
 */
export function verschiebe(waende, bemassungen, wandId, versatz, ursprung) {
  const erg = loese(waende, bemassungen, ursprung);
  const gesperrt = { x: false, y: false };
  const meldungen = [];
  /** @type {Record<'x'|'y', number>} */
  const wirksam = { x: 0, y: 0 };

  for (const a of ACHSEN) {
    const d = Math.trunc(Number(versatz?.[a] ?? 0)) || 0;
    if (!d) continue;
    if (erg.bestimmt[wandId]?.[a]) {
      gesperrt[a] = true;
      meldungen.push(`Wand „${wandId}“ ist in ${a} durch Bemaßungen bestimmt und lässt sich dort nicht ziehen — [K-9].`);
      continue;
    }
    wirksam[a] = d;
  }

  /** @type {Record<'x'|'y', Set<string>>} */
  const gruppe = { x: new Set(), y: new Set() };
  for (const a of ACHSEN) {
    if (!wirksam[a]) continue;
    const g = erg.gruppen[a][wandId];
    for (const id of erg.ids) if (erg.gruppen[a][id] === g) gruppe[a].add(id);
  }

  const neu = (Array.isArray(waende) ? waende : []).map((w) => {
    const id = w && w.id != null ? String(w.id) : "";
    if (!id || w.lage == null || !erg.ids.includes(id)) return w;
    const basis = erg.positionen[id] || normLage(w.lage)?.start_mm;
    const x = Number(basis?.x) + (gruppe.x.has(id) ? wirksam.x : 0);
    const y = Number(basis?.y) + (gruppe.y.has(id) ? wirksam.y : 0);
    const l = normLage(w.lage);
    return { ...w, lage: { ...l, start_mm: { x, y } } };
  });

  const bewegt = [...new Set([...gruppe.x, ...gruppe.y])].sort();
  return { waende: neu, gesperrt, bewegt, meldungen };
}

// --- Bequemer Gesamtdurchlauf ---------------------------------------------

/**
 * Loesen und Kollisionspruefung in einem Aufruf — das, was die Oberflaeche
 * nach jeder Aenderung braucht.
 * @param {Wandeintrag[]} waende @param {any[]} [bemassungen]
 * @param {any} [ursprung] Lage des Geschossursprungs ([K-4], #76)
 */
export function pruefeGeschoss(waende, bemassungen, ursprung) {
  const erg = loese(waende, bemassungen, ursprung);
  const koll = kollisionen(waende, erg.positionen);
  return { ...erg, kollisionen: koll };
}
