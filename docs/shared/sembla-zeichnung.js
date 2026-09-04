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
 * Verzahnungsbereiche (#82, [G-10]): der vom Rechenkern gerechnete Verband zeigt sie nur
 * als Luecke; das Blatt kennzeichnet sie deshalb ausdruecklich an ihrer Rasterlage
 * (gestrichelte Begrenzung, Schraffur der ausgesparten Zellen, Kurztext) und erklaert das
 * in der Legende. Regelwidrige Bereiche und die dadurch nicht baubaren Restbreiten stehen
 * benannt in einem eigenen Mangelkasten. Gelesen wird nur — angelegt werden sie in Modul 1;
 * abgeleitet wird daraus nichts (Vorspannung bleibt nach [G-11] unberuehrt).
 *
 * Brandschutzklassifikation (#79): das Blatt weist sie als Kurztext im Zeichnungsrand
 * aus und erklaert beide Klassen in der Legende. Sie wird AUSSCHLIESSLICH GELESEN —
 * gewaehlt wird sie in Modul 1 —, ist eine reine Planungskennzeichnung und veraendert
 * an dieser Zeichnung nichts (kein Masstab, keine Geometrie, keine Menge).
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

import { ART_LABEL, ART_SYMBOL, einbauteile, semblaBomItems, semblaBomMenge } from "./sembla-bom.js";
import { stangenStuecke, topLagen, stueckFarbe, STUECK_FARBE, STUECK_LABEL,
         bodenblechSvg, bodenblechTeile, bodenblechStoesse } from "./sembla-montage.js";
// #79: NUR der reine Normalisierer der Brandschutzklassifikation (F0/F30, Standard
// F0) — kein Speicherzugriff, keine Lese- oder Schreibfunktion. Er liegt kanonisch in
// storage.js, weil Modul 1 (der einzige Schreibweg) dieselbe Stelle nutzt; eine zweite
// Werteliste hier waere genau die Drift, die das verhindert.
import { normBrandklasse } from "./storage.js";

const GRID_FALLBACK = 125, COURSE_FALLBACK = 200, ROD_FALLBACK = 1100;

const _grid = w => w.grid_mm || GRID_FALLBACK;
const _course = w => w.course_mm || COURSE_FALLBACK;
const _rod = w => w.rod_mm || ROD_FALLBACK;
const _lagen = w => w.lagen || Math.round(w.height_mm / _course(w));

const _fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const _esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Zahl auf 3 Dezimalen kuerzen — haelt die SVG-Zeichenkette stabil/vergleichbar. */
const _n = v => (Math.round((isFinite(v) ? v : 0) * 1000) / 1000).toString();

/**
 * Massbeschriftung: der Millimeterwert als reine Zahl ([D-3], #64). Ohne Suffix
 * und ohne Tausenderpunkt — die Einheit steht genau einmal im Schriftfeld, und
 * eine Gruppierung waere in einer Massangabe nur ein zweites Trennzeichen neben
 * dem Dezimalkomma. Umgerechnet wird NICHTS: der Wert ist der Wandwert in mm.
 */
const _mm = v => (Math.round((isFinite(v) ? v : 0) * 10) / 10).toString().replace(".", ",");

// ------------------------------------------------------------ Blatt & Masstab

/** Norm-Masstabsreihe (Zeichnung ist immer 1:x mit x aus dieser Reihe, [D-2]). */
export const MASSSTAEBE = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];

/**
 * Blattformate (quer). `papier_mm` = reales Papiermass, `rand_mm` = Druckrand
 * (`@page margin`), `feld_mm` = nutzbares Zeichenfeld nach Abzug von Rand,
 * Seitenspalte (Tabellen) und Schriftfeld.
 *
 * Die druckbare Innenflaeche steht NICHT als eigenes Feld daneben, sondern wird
 * ueber `blattInnen()` aus Papiermass und Rand gerechnet: sonst gaebe es zwei
 * Wahrheiten fuer dieselbe Groesse (frueher `druckhoehe_mm`), und genau daran ist
 * die Vorschau auseinandergelaufen (#61).
 */
export const BLATT = {
  a3: { label: "A3 quer", seite: "A3 landscape", papier_mm: { w: 420, h: 297 }, rand_mm: 10, feld_mm: { w: 345, h: 200 } },
  a4: { label: "A4 quer", seite: "A4 landscape", papier_mm: { w: 297, h: 210 }, rand_mm: 8, feld_mm: { w: 195, h: 135 } },
};

/** @type {ReadonlyArray<'a3'|'a4'>} */
export const FORMATE = ["a3", "a4"];

/**
 * Druckbare Innenflaeche des Blattes in Papier-mm (Papiermass abzueglich Rand) —
 * die kanonische Blattgeometrie fuer Bildschirm UND Druck ([D-6]).
 *
 * `ZEICHNUNG_CSS` gibt `.zsheet` genau dieses Mass; damit ist das Blatt in der
 * Vorschau dieselbe Box wie auf dem Papier und die Pixelmasse im Blattinneren
 * (Seitenspalte, Raender, Schriftgroessen) stehen in beiden Medien zu derselben
 * Bezugsbreite. Der Bildschirm skaliert das fertige Blatt nur noch gleichmaessig.
 * @param {'a3'|'a4'} [format] @returns {{w:number,h:number}}
 */
export function blattInnen(format = "a3") {
  const b = BLATT[FORMATE.includes(/** @type {any} */ (format)) ? format : "a3"];
  return { w: b.papier_mm.w - 2 * b.rand_mm, h: b.papier_mm.h - 2 * b.rand_mm };
}

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
  // Verzahnung (#82): bewusst NICHT die Oeffnungsfarbe — ein Verzahnungsbereich ist
  // keine Oeffnung und kein Durchbruch ([G-10]) und darf mit ihnen nicht verwechselt
  // werden. Derselbe Kennwert wie in der Wandansicht von Modul 1.
  verzahnung: "#8b5cf6",
};

/**
 * Brandschutzklassifikation auf dem Blatt (#79) — Darstellung, sonst nichts. Die
 * Klassifikation ist eine reine PLANUNGSKENNZEICHNUNG: aus ihr wird kein Nachweis,
 * keine Freigabe und keine Materialregel abgeleitet, und sie veraendert weder
 * Wandabwicklung noch Masstab, Bemassung, Stueckliste oder Schriftfeld.
 *
 * Getragen wird die Unterscheidung OHNE Farbe: der `kuerzel`-Kurztext steht im
 * freien oberen Zeichnungsrand des Blattes, `name` benennt ihn in Worten in der
 * Legende. Beides bleibt im Schwarz-Weiss-Ausdruck lesbar; `farbe` kommt nur
 * additiv dazu.
 *
 * Anders als im Lageplan (Modul 9) und im Geschosseditor gibt es hier BEWUSST
 * KEINE Schraffur: dort ist die Wand ein leeres Rechteck der Draufsicht, hier ist
 * die Wandflaeche der Zeichnungsinhalt selbst (Steine je Lage, Oeffnungen,
 * Vorspannstraenge, Stangenstuecke, Bleche). Ein Muster darueber verdeckte genau
 * das Ausfuehrungsnoetige.
 *
 * Wortlaut und Kennfarbe muessen zu `BRANDKLASSE` in `sembla-lageplan.js` und in
 * `geschossplan.html` passen. Importiert wird von dort NICHTS: zwei Ausgabemodule
 * duerfen nicht aneinanderhaengen, und die Geometrie ist ohnehin verschieden
 * (dort Draufsicht, hier Abwicklung). Kanonisch sind allein die WERTE F0/F30 samt
 * Standard — sie kommen aus `storage.js` (`normBrandklasse`), nicht von hier.
 */
export const BRANDKLASSE = Object.freeze({
  F0: Object.freeze({ kuerzel: "F0", name: "ohne Brandschutzklassifikation", farbe: "#5b6673" }),
  F30: Object.freeze({ kuerzel: "F30", name: "Brandschutzklassifikation F30", farbe: "#0b7285" }),
});

/**
 * Der Kurztext im Blatt wird ausgeschrieben („Brandschutz F30"), weil die
 * eigenstaendige SVG-Datei keine Legende traegt und fuer sich lesbar sein muss.
 * Legendenschluessel bleibt das blosse Kuerzel.
 */
export const BRAND_PRAEFIX = "Brandschutz ";

/**
 * Lage des Kurztextes in PAPIER-mm: Abstand von der rechten Zeichnungskante,
 * Grundlinie von oben, Schriftgroesse. Er sitzt im ohnehin vorhandenen
 * Zeichnungsrand (`PAD_MM`) UEBER der Wandoberkante — die einzige nachweislich
 * freie Zone: unten liegt die Gesamtlaengenkette, links Hoehenkette und
 * Reihennummern, in der Flaeche die Wand selbst. `PAD_MM`, `RAND_X`/`RAND_Y` und
 * `waehleMasstab()` bleiben damit unberuehrt — die Angabe kostet keinen Millimeter
 * Zeichenfeld und verschiebt den Masstab nicht.
 */
const BRAND_RAND_MM = 1, BRAND_BASIS_MM = 3.4, BRAND_FS_MM = 3;

/**
 * Verzahnungsbereich auf dem Blatt (#82, [G-10]) — Darstellung, sonst nichts.
 *
 * Ein Verzahnungsbereich ist ein Laengsabschnitt der Wand, in dem alternierend in jeder
 * zweiten Lage die Steine fehlen, damit eine rechtwinklig kreuzende Wand konstruktiv
 * eingreifen kann. Im Verband ist er bisher nur eine LUECKE und damit von einem Fehler
 * nicht zu unterscheiden; das Blatt weist ihn deshalb ausdruecklich aus.
 *
 * Getragen wird die Unterscheidung OHNE Farbe, durch zwei nicht farbliche Merkmale:
 * die GESTRICHELTEN Begrenzungslinien an den beiden Bereichsraendern (ueber die volle
 * Hoehe des Bereichs) und die SCHRAFFUR in den ausgesparten Zellen. `name` benennt
 * beides in Worten in der Legende, `kuerzel` ist der Kurztext im Bereich selbst;
 * `FARBE.verzahnung` kommt nur additiv dazu.
 *
 * Anders als bei der Brandschutzklassifikation (#79) ist die Schraffur hier zulaessig
 * und sogar das treffende Mittel: sie liegt AUSSCHLIESSLICH auf den ausgesparten,
 * also steinfreien Zellen und verdeckt damit nichts vom Ausfuehrungsnoetigen.
 *
 * Gelesen wird ausschliesslich `wandelement.interlocks` — die vom Rechenkern bereits
 * normalisierten und validierten Bereiche. Abgeleitet wird daraus NICHTS: Tiling,
 * Vorspannung ([G-11]), Stueckliste und Nachweis bleiben unberuehrt.
 */
export const VERZAHNUNG = Object.freeze({
  kuerzel: "Verzahnung",
  name: "Verzahnungsbereich — gestrichelt begrenzt, in jeder zweiten Lage schraffierte "
    + "Aussparung für den Anschluss einer rechtwinklig kreuzenden Wand",
});

/** Schraffurabstand und Strichstaerken der Verzahnungskennzeichnung in PAPIER-mm. */
const VZ_SCHRAFFUR_MM = 1.6, VZ_LW = 0.18, VZ_RAND_LW = 0.3;

// --------------------------------------------------------- Blatt-Ueberschriften

/**
 * Das Blatt fuehrt KEINE Regellisten (#61). Weder die vom Rechenkern eingehaltenen
 * Vorspannregeln noch die noch ungerechneten Zielregeln stehen darauf, und damit auch
 * keine erklaerende Fussnote dazu: gebraucht wird auf dem Blatt die Wand mit ihren
 * Massen, Stuecken und IDs, nicht Regelkunde. [D-5] ist eine Regel der
 * AUSSAGEWAHRHEIT und keine Darstellungspflicht — Geprueftes und Ungeprueftes nie zu
 * vermischen heisst nicht, beides auflisten zu muessen; das Weglassen behauptet nichts.
 * Die offenen Zielregeln (Oeffnung > 750 mm beidseitig zwei Achsen; jedes Blech von zwei
 * Achsen gehalten) stehen unveraendert im Handbuch, Kapitel 16.8.
 */

/** Ueberschrift des Mangelblocks — Zuschnittkonflikte des Kerns ([Z-5]/[Z-6]). */
export const MANGEL_TITEL = "Zuschnittkonflikte – Blatt unvollständig";

/**
 * Ueberschrift des Verzahnungs-Mangelblocks ([G-10]/[G-12], #82).
 *
 * Bewusst ein EIGENER Kasten neben den Zuschnittkonflikten und nicht deren Ueberschrift:
 * ein abgewiesener Verzahnungsbereich ist nach [G-12] ausdruecklich KEIN
 * Baubarkeitsausschluss, das Blatt darf sich deshalb nicht pauschal fuer unvollstaendig
 * erklaeren. Was gezeichnet ist, ist vollstaendig — der abgewiesene Bereich ist schlicht
 * nicht ausgefuehrt, und genau das steht hier ([D-5]: Geprueftes und Ungeprueftes nie
 * vermischen).
 */
export const VERZAHNUNG_TITEL = "Verzahnung – regelwidrige Bereiche";

/** Titel der Einbauteil-ID-Tabelle des Blattes ([P-19]). */
export const EINBAUTEIL_TITEL = "Einbauteile Gewindestangen – IDs je Spannachse";

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
 * Diagonalschraffur eines Rechtecks (Papier-mm) als einzelne Linien.
 *
 * Bewusst OHNE `<pattern>`/`url(#…)`: das Blatt-SVG wird in Vorschau, Druck-HTML und
 * eigenstaendiger Datei ausgeliefert und kann mehrfach in einem Dokument stehen — eine
 * Musterdefinition braeuchte eine dokumentweit eindeutige ID und waere damit ein zweiter,
 * kontextabhaengiger Mechanismus. Die Linien werden exakt am Rechteck GEKAPPT (kein
 * Clip-Pfad), die Ausgabe ist deshalb rein rechnerisch und deterministisch.
 */
function _schraffur(x, y, w, h, farbe) {
  if (!(w > 0) || !(h > 0)) return "";
  let s = "";
  // Geradenschar x + y = c (Richtung „/"), c laeuft ueber die Diagonale des Rechtecks.
  const c0 = x + y, c1 = x + w + y + h;
  for (let c = c0 + VZ_SCHRAFFUR_MM; c < c1; c += VZ_SCHRAFFUR_MM) {
    const xa = Math.max(x, c - (y + h)), xb = Math.min(x + w, c - y);
    if (!(xb > xa)) continue;
    s += `<line x1="${_n(xa)}" y1="${_n(c - xa)}" x2="${_n(xb)}" y2="${_n(c - xb)}" `
      + `stroke="${farbe}" stroke-width="${VZ_LW}"/>`;
  }
  return s;
}

/**
 * Kennzeichnung der Verzahnungsbereiche (#82, [G-10]) als eigene SVG-Gruppe.
 *
 * Gelesen wird ausschliesslich `w.interlocks` — die vom Rechenkern normalisierten,
 * GUELTIGEN Bereiche; ein abgewiesener Bereich steht dort nicht und wird deshalb auch
 * nicht gezeichnet (er erscheint benannt im Mangelblock). Die Hoehe kommt je Rasterspalte
 * aus `topLagen()`, also aus derselben kanonischen Kontur wie Wandumriss und Kopfblech
 * ([D-4]): ueber einer Spalte ohne Wand (Staffelung, lokale Hoehe 0) wird NICHTS
 * gezeichnet, statt eine Kennzeichnung ins Leere zu setzen.
 *
 * Drei Bestandteile, davon zwei ohne jede Farbe lesbar:
 *   (a) Schraffur GENAU in den ausgesparten Zellen (Lage `li` mit `li % 2 === start_parity`,
 *       zusammenhaengende Spaltenlaeufe der Bereichsbreite) — dort steht kein Stein,
 *       es wird also nichts verdeckt,
 *   (b) gestrichelte Begrenzungslinien an beiden Bereichsraendern ueber die volle
 *       lokale Hoehe,
 *   (c) der Kurztext im obersten ausgesparten Feld — dieses ist konstruktionsbedingt
 *       steinfrei; er entfaellt, wenn das Feld dafuer zu klein ist (wie die
 *       Steintyp-Beschriftung).
 *
 * Ohne Verzahnungsbereich wird die leere Zeichenkette geliefert — keine leere Gruppe.
 */
function _verzahnungSvg(w, X, Y, sc, tl, G, C, LF) {
  const ils = (w.interlocks || []);
  if (!ils.length) return "";
  const F = FARBE.verzahnung;
  let s = `<g class="verzahnung">`;
  for (const il of ils) {
    const k0 = Math.max(0, Math.round(il.g0)), k1 = Math.min(tl.length, Math.round(il.g1));
    if (!(k1 > k0)) continue;
    const par = il.start_parity === 1 ? 1 : 0;
    let obenLage = 0;
    for (let k = k0; k < k1; k++) obenLage = Math.max(obenLage, tl[k]);
    if (obenLage <= 0) continue;                     // keine Wand -> keine Kennzeichnung
    s += `<g data-verzahnung="${k0}-${k1}">`;
    // (a) Schraffur je ausgesparter Lage, zusammenhaengende Spaltenlaeufe in einem Zug
    let letzteLage = -1, textLauf = null;
    for (let li = par; li < obenLage; li += 2) {
      let a = null;
      for (let k = k0; k <= k1; k++) {
        const da = k < k1 && tl[k] > li;
        if (da && a === null) a = k;
        if (!da && a !== null) {
          s += _schraffur(X(a * G), Y((li + 1) * C), (k - a) * G * sc, C * sc, F);
          if (li > letzteLage) { letzteLage = li; textLauf = [a, k]; }
          else if (textLauf && (k - a) > (textLauf[1] - textLauf[0])) textLauf = [a, k];
          a = null;
        }
      }
    }
    // (b) Begrenzungslinien an den Bereichsraendern (gestrichelt, volle lokale Hoehe)
    for (const [k, h] of [[k0, tl[k0]], [k1, tl[k1 - 1]]]) {
      if (h <= 0) continue;
      s += `<line x1="${_n(X(k * G))}" y1="${_n(Y(0))}" x2="${_n(X(k * G))}" y2="${_n(Y(h * C))}" `
        + `stroke="${F}" stroke-width="${VZ_RAND_LW}" stroke-dasharray="1.6 1.1"/>`;
    }
    // (c) Kurztext im obersten ausgesparten Feld (steinfrei) — nur, wenn er dort hinpasst
    if (textLauf) {
      const [a, b] = textLauf, breite = (b - a) * G * sc, fs = Math.min(2.6, LF);
      if (breite > VERZAHNUNG.kuerzel.length * fs * 0.6 && C * sc > 3) {
        s += `<text x="${_n(X((a + b) / 2 * G))}" y="${_n(Y((letzteLage + 0.5) * C) + fs * 0.35)}" `
          + `font-size="${_n(fs)}" fill="${F}" text-anchor="middle">${VERZAHNUNG.kuerzel}`
          + `<title>${_esc(VERZAHNUNG.name)}</title></text>`;
      }
    }
    s += `</g>`;
  }
  return s + `</g>`;
}

/**
 * Bemassungsschicht (Papier-mm): Gesamt-, Oeffnungs-, Bruestungs- und
 * Staffelungsmasse ALLE als reine Millimeterzahl ([D-3]). Es gibt genau eine
 * Einheit, sie steht einmal im Schriftfeld — nicht an jeder Masszahl.
 */
function _bemassung(w, X, Y, pad, wPx, hPx, sc, L, H, openings) {
  const C = FARBE.mass, A = FARBE.oeffnung, STP = FARBE.staffel;
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
  s += hD(left0, right0, bot0 + 7, _mm(L));
  s += vD(top0, bot0, left0 - 7, _mm(H));
  for (const op of openings) {
    const L_ = Math.min(X(op.x0), X(op.x1)), R_ = Math.max(X(op.x0), X(op.x1)), T_ = Y(op.y1), B_ = Y(op.y0);
    s += hD(L_, R_, T_ - 2, _mm(op.x1 - op.x0), A);
    s += vD(T_, B_, L_ - 2, _mm(op.y1 - op.y0), A);
    if (op.y0 > 1e-6) s += vD(B_, bot0, L_ - 2, _mm(op.y0), A);
  }
  for (const st of (w.steps || [])) {
    const L_ = Math.min(X(st.x0_mm), X(st.x1_mm)), R_ = Math.max(X(st.x0_mm), X(st.x1_mm)), T_ = Y(st.height_mm);
    s += hD(L_, R_, T_ - 2, _mm(st.x1_mm - st.x0_mm), STP);
    s += vD(T_, bot0, R_ + 2, _mm(st.height_mm), STP);
  }
  return s;
}

/** Bildunterschrift/Kopfzeile der Zeichnung (Wand, Masse, Masstab). */
export function zeichnungTitel(w, masstab, planinhalt = "Wandabwicklung") {
  // Direkt aus `length_mm`/`height_mm` — keine Meter-Schattenumrechnung (#64).
  return planinhalt + " · " + (w.name || "Wand") + " · "
    + _mm(w.length_mm) + " × " + _mm(w.height_mm) + " · M 1:" + masstab;
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

  // Wandkontur je Rasterspalte (lokale Oberkante) — die kanonische Ableitung aus
  // `sembla-montage.js`. Sie traegt Wandumriss, Kopfbleche UND die Verzahnungskennzeichnung;
  // eine zweite Konturrechnung waere nach [A-1]/[D-4] unzulaessig.
  const tl = topLagen(w), N = tl.length;

  // Verzahnungsbereiche (#82, [G-10]): eigene Gruppe unmittelbar NACH den Steinen und
  // VOR Kontur, Blechen, Straengen, Bemassung und Brandschutz-Kurztext. Damit verdeckt sie
  // nichts vom Ausfuehrungsnoetigen, und die Brandschutzgruppe bleibt die letzte des SVG.
  s += _verzahnungSvg(w, X, Y, sc, tl, G, C, LF);

  // Gestufte Wandkontur (aus topLagen -> dieselbe Konturableitung wie die Montage)
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

  // Anschluesse: Bodenblech als REALE TEILFOLGE mit Stoessen ([A-10]/[A-11]/[A-12]),
  // Kopfblech unveraendert je Rasterspalte (wenn oben Blech).
  //
  // Gezeichnet wird ueber `bodenblechSvg()` aus `sembla-montage.js` — dieselbe
  // Ableitung, die Baugruppenbild und Wandueberblick von Modul 5 benutzen. Damit sind
  // Teilgrenzen und Stosspositionen zwischen den Ausgaben zwangslaeufig gleich, und es
  // entsteht KEINE zweite Blechzerlegung im Ausgabemodul ([A-1]/[D-4]) — genau dasselbe
  // Muster wie bei `topLagen()` und `stangenStuecke()`. Weil das Blatt-SVG hier
  // entsteht, tragen Vorschau, Druck-HTML und die eigenstaendige SVG-Datei dieselbe
  // Zeichenkette ([D-6]). Masstab, Bemassung und Kopfblech bleiben unberuehrt.
  const bth = Math.max(1.2, (w.bom && w.bom.stahlblech_dicke_mm ? w.bom.stahlblech_dicke_mm : 15) * sc);
  const topConn = (w.prestress && w.prestress.top_connection) || "blech";
  s += bodenblechSvg(w, X, Y, sc, bth, { n: _n, rand: SW * 0.5 });
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

  // Brandschutzklassifikation (#79): eigene Gruppe ZULETZT — sie kann damit von
  // nichts ueberzeichnet werden und verdeckt selbst nichts, weil sie im freien
  // oberen Zeichnungsrand steht (s. BRAND_*). Anders als im Lageplan gibt es keine
  // Auszeichnung Wand fuer Wand: das Blatt zeigt GENAU EINE Wand, die Angabe gilt
  // also dem Blatt. Gelesen wird nur; gewaehlt wird sie ausschliesslich in Modul 1.
  // Fehlt das Feld oder traegt es einen unbekannten Wert, gilt F0 — nie eine
  // geratene oder als geprueft dargestellte Angabe.
  {
    const bk = BRANDKLASSE[normBrandklasse(w.brandklasse)];
    s += `<g class="brand" data-brandklasse="${bk.kuerzel}">`
      + `<text x="${_n(vbW - BRAND_RAND_MM)}" y="${_n(BRAND_BASIS_MM)}" font-size="${_n(BRAND_FS_MM)}" `
      + `text-anchor="end" fill="${bk.farbe}">${BRAND_PRAEFIX}${bk.kuerzel}`
      + `<title>${_esc(bk.name)} — Planungskennzeichnung, kein Nachweis; `
      + `gewählt wird sie in Modul 1.</title></text></g>`;
  }

  const viewBox = `0 0 ${_n(vbW)} ${_n(vbH)}`;
  // width/height in Papier-mm => im Druck exakt 1:masstab ([D-2])
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${_n(vbW)}mm" height="${_n(vbH)}mm" `
    + `preserveAspectRatio="xMidYMid meet" role="img" aria-label="${_esc(zeichnungTitel(w, masstab, o.planinhalt))}">${s}</svg>`;
  return { svg, inner: s, masstab, breite_mm: vbW, hoehe_mm: vbH, viewBox };
}

// ---------------------------------------------------------------- Blatt-Daten

/**
 * Stuecklisten-Zeilen des Blattes (Mengen aus `sembla-bom.js`, nur Menge > 0).
 *
 * Gewindestangenstuecke tragen ihr Art-SYMBOL voran ([P-19]): das Blatt kennzeichnet
 * Standardteil, Sonderzuschnitt und Reststueck damit auch ohne Farbe. Die Beplankung
 * (Latten/Platten/Modul-2-Verbinder) hat hier ohnehin nie eine Zeile — das Blatt liest
 * allein das Wandelement ([D-1]).
 */
export function bomZeilen(w) {
  return semblaBomItems(w).filter(it => it.menge > 0)
    .map(it => ({ label: (it.art ? ART_SYMBOL[it.art] + " " : "") + it.label, menge: semblaBomMenge(it) }));
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

/**
 * Strangtabelle (je Spannachse Position, Stangenzahl und die KONKRETEN Einbauteil-IDs
 * ihrer Stücke) — Datenzugriff/Detailblatt.
 *
 * Die IDs stehen hier und nicht an jedem Stück im SVG: bei 1:50 sind die Stücke wenige
 * Millimeter hoch, eine Beschriftung je Stück würde das Blatt zusetzen. Die Achse `k` ist
 * am gezeichneten Strang angeschrieben, Segment und Stück werden von unten gezählt — damit
 * ist jede ID der Baustellenstückliste eindeutig einem gezeichneten Stück zuzuordnen
 * ([P-19]). Gerechnet wird nichts: die IDs kommen aus `einbauteile()` ([D-1]).
 */
export function strangZeilen(w) {
  const nachAchse = new Map();
  for (const t of einbauteile(w)) {
    const l = nachAchse.get(t.k) || [];
    l.push(t); nachAchse.set(t.k, l);
  }
  return (w.tension_columns || []).map(col => {
    let stangen = 0;
    for (const sg of _segmente(w, col)) stangen += stangenStuecke(w, sg).length;
    const teile = nachAchse.get(col.k) || [];
    return {
      label: "k" + col.k + " · x = " + _fmt(col.x_mm / 10, 1) + " cm",
      wert: stangen + "×",
      ids: teile.map(t => t.id),
      // Jede ID traegt ihr Art-SYMBOL unmittelbar voran: so ist Standardteil,
      // Sonderzuschnitt und Reststück auch im Schwarz-Weiss-Druck am Blatt ablesbar, ohne
      // die Fertigmaße zu wiederholen (die stehen in der Stücklisten-Tabelle des Blattes).
      teile: teile.map(t => ART_SYMBOL[t.art] + t.id),
    };
  });
}

/**
 * Blattzeilen der Einbauteil-IDs je Spannachse ([P-19]) — nur Achsen mit Stücken. Eine Achse
 * traegt selten mehr als fuenf Stücke; die Zeile bleibt damit kurz genug fuer die Seitenspalte
 * des Blattes, und es muss keine ID ans gezeichnete Stück geschrieben werden.
 */
export function einbauteilZeilen(w) {
  return strangZeilen(w).filter(r => r.teile.length)
    .map(r => ({ label: r.label, wert: r.teile.join(" ") }));
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
 * Klartext der Verzahnungsbefunde ([G-10]/[G-12], #82) — je Grund ein Satz. Die Gruende sind
 * die des Rechenkerns (`validation.interlock_fehler[].grund`); ein unbekannter Grund wird
 * unveraendert benannt statt weggelassen.
 */
export const VERZAHNUNG_GRUND = {
  nicht_ganzzahlig: "Position oder Breite nicht ganzzahlig ([G-10]) — Bereich abgewiesen.",
  leeres_intervall: "Leeres Intervall, Breite kleiner oder gleich null ([G-10]) — Bereich abgewiesen.",
  ausserhalb_wand: "Bereich liegt außerhalb der Wandgrenzen ([G-10]) — Bereich abgewiesen.",
  ungueltige_paritaet: "Ungültige Startlage, erwartet wird die unterste oder die zweite Lage ([G-10]) — Bereich abgewiesen.",
  ueberlappt_oeffnung: "Bereich überlappt eine Öffnung ([G-10]) — Bereich abgewiesen.",
  ueberlappt_verzahnung: "Bereich überlappt einen anderen Verzahnungsbereich ([G-10]) — Bereich abgewiesen.",
};

/** Klartext der nicht baubaren Restbreite, die erst durch die Aussparung entsteht ([G-6]). */
export const VERZAHNUNG_RESTSEGMENT = "Restbreite neben der Aussparung nicht baubar ([G-6]) — "
  + "Bereichsbreite oder Wandlänge ändern.";

/**
 * Verzahnungsbefunde des Wandelements als Blattzeilen ([G-10]/[G-12], #82).
 *
 * Zwei Quellen, beide unveraendert aus dem Rechenkern gelesen und hier weder nachgerechnet
 * noch bewertet ([D-1]):
 *   * `validation.interlock_fehler` — abgewiesene Bereiche samt Grund und Rasterlage. Sie
 *     stehen NICHT in `wandelement.interlocks` und sind deshalb im Verband auch nicht
 *     ausgefuehrt; genau darum muessen sie benannt werden ([P-9]).
 *   * `validation.interlock_invalid_segments` — Restbreiten, die erst durch die Aussparung
 *     nicht mehr baubar sind ([G-6]), mit Steinreihe und Rasterlage.
 * Die Rasterlage eines abgewiesenen Bereichs kann roh und damit unbrauchbar sein (z.B. nicht
 * ganzzahlig) — sie wird dann als fehlend benannt statt gerundet.
 */
export function verzahnungZeilen(w) {
  const v = (w && w.validation) || {};
  const zeilen = [];
  for (const f of (v.interlock_fehler || [])) {
    const g = String(f.grund || "unbekannt");
    const b = f.bereich || {};
    const ganz = Number.isInteger(b.g0) && Number.isInteger(b.g1);
    zeilen.push({
      art: "bereich", grund: g, text: VERZAHNUNG_GRUND[g] || g,
      wo: ganz ? `Raster ${b.g0}–${b.g1}` : "Rasterlage nicht auswertbar",
    });
  }
  for (const seg of (v.interlock_invalid_segments || [])) {
    zeilen.push({
      art: "restsegment", grund: "restbreite_nicht_baubar", text: VERZAHNUNG_RESTSEGMENT,
      wo: `Steinreihe ${seg.lage + 1}, Raster ${seg.start_grid}, Breite ${seg.breite_grid} Raster`,
    });
  }
  return zeilen;
}

/**
 * Verzahnungs-Mangelblock des Blattes ([G-10]/[G-12], #82) — leer, wenn es keinen Befund
 * gibt (kein leerer Kasten, wie bei der Legende in [D-4]).
 *
 * Der Schlusssatz sagt genau, was gilt: der abgewiesene Bereich ist im gezeichneten Verband
 * nicht ausgefuehrt. Er behauptet ausdruecklich NICHT, das Blatt sei unvollstaendig — nach
 * [G-12] ist das kein Baubarkeitsausschluss, und die Zeichnung zeigt den tatsaechlich
 * gerechneten Verband.
 */
export function verzahnungMaengelHtml(w) {
  const z = verzahnungZeilen(w);
  if (!z.length) return "";
  return `<div class="zmangel">`
    + z.map(e => `<div><span class="chip"></span><span>${_esc(e.text)} ${_esc(e.wo)}.</span></div>`).join("")
    + `</div><div class="zfuss">Abgewiesene Bereiche sind im gezeichneten Verband `
    + `<b>nicht ausgeführt</b>: die Steine stehen dort wie ohne Verzahnung. Der Anschluss ist `
    + `in „Wandplanung" zu berichtigen — hier wird nichts angenommen und nichts stillschweigend `
    + `zurechtgerückt.</div>`;
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
 * Schriftfeld des Blattes — GENAU die zwingenden Angaben ([D-8], #61): Projekt, Wand mit
 * ihren Massen, Planinhalt, Plan-Nr., Index, Masstab, Einheit und Zeichner. Kopfdaten
 * kommen aus `eingaben.projekt` (Modul 0), die Zeichnung fuehrt keine eigenen
 * Projektfelder ([D-7]).
 *
 * Bauherrenschaft, Planverfasser und Phase stehen NICHT mehr hier: sie entscheiden am
 * Blatt nichts und sind am Projekt gepflegt ([L-11]). Ebenso entfaellt das frueher
 * verpflichtende Statik-Feld — die Zeichnung weist ohnehin nichts nach, und ein leeres
 * Erklaerfeld ist kein Nachweis ([D-8] unveraendert: kein Ergebnis, kein Rechenmodell).
 *
 * Eine FEHLENDE optionale Angabe erzeugt keine Zeile (kein „–", kein „###"): ein
 * Platzhalter liest sich wie eine gepflegte Angabe, die es nicht gibt.
 */
export function schriftfeldHtml(w, eingaben = {}, masstab = 25, opts = {}) {
  const o = normOptionen(opts);
  const p = (eingaben && eingaben.projekt) || {};
  const dim = _mm(w.length_mm) + " × " + _mm(w.height_mm);   // reine mm-Werte (#64)
  const row = (k, v) => (v === undefined || v === null || String(v) === "")
    ? "" : `<div class="ztb-row"><div class="k">${k}</div><div class="v">${_esc(v)}</div></div>`;
  return `<div class="ztitleblock">`
    + `<div class="col">${row("Projekt", p.name || w.name)}${row("Wand", (w.name || "") + " · " + dim)}</div>`
    + `<div class="col">${row("Planinhalt", o.planinhalt)}${row("Plan Nr.", p.plan_nr)}${row("Index", p.index)}</div>`
    + `<div class="col">`
    + `<div class="ztb-row"><div class="k">Maßstab</div><div class="v">1 : ${masstab}</div></div>`
    // Die EINE Einheitenangabe des Blattes (#64): alle Masszahlen der Zeichnung
    // sind reine Millimeterwerte und tragen deshalb kein Suffix ([D-3]).
    + `<div class="ztb-row"><div class="k">Einheit</div><div class="v">mm</div></div>`
    + row("Gez.", p.gez)
    + `</div></div>`;
}

/**
 * Legende des Darstellungsschluessels ([D-4]).
 *
 * Das Wandelement ist OPTIONAL und wird nur fuer die Eintraege gebraucht, die es nicht
 * immer gibt: der Verzahnungseintrag (#82) erscheint ausschliesslich, wenn die Wand
 * wirklich einen Verzahnungsbereich fuehrt — ein Schluessel fuer eine nicht gezeichnete
 * Kennzeichnung waere derselbe leere Kasten, den [D-4] schon fuer die Legende ausschliesst.
 * Ohne Argument bleibt die Legende zeichengleich zum bisherigen Stand.
 */
export function legendeHtml(w) {
  const i = (c, cls) => `<i class="${cls || ""}" style="background:${c}"></i>`;
  return `<div class="zlegende">`
    + `<span>${i(FARBE.stange)}Gewindestange (${STUECK_LABEL.standard})</span>`
    + `<span>${i(FARBE.stange_sonder)}${STUECK_LABEL.sonder} / abgelängt</span>`
    + `<span>${i(FARBE.stange_rest)}${STUECK_LABEL.rest} ([Z-6])</span>`
    + `<span>${i(FARBE.mutter, "dot")}Kopplung / Verankerung</span>`
    + `<span>${i(FARBE.platte, "plate")}Spannplatte</span>`
    + `<span>${i(FARBE.stahl, "plate")}Boden-/Kopfblech</span>`
    // Reale Bodenblechteile ([A-10]/[A-11]/[A-12]): Stoss und Sonderzuschnitt stehen
    // NUR dann in der Legende, wenn sie im Blatt auch gezeichnet wurden — ein
    // Alt-Wandelement ohne `base_plate.teile` zeigt eine durchgehende Platte und
    // bekommt deshalb keinen dieser Eintraege ([D-4]). Der Sonderzuschnitt traegt sein
    // NICHT FARBLICHES Merkmal (die Schraffur) ausdruecklich in Worten, damit er im
    // Schwarz-Weiss-Ausdruck aufloesbar bleibt.
    + (bodenblechStoesse(w).length
        ? `<span>${i(FARBE.kontur, "dot")}Blechstoß (Bodenblech)</span>` : "")
    + (bodenblechTeile(w).some(t => t.art === "sonder")
        ? `<span>${i(FARBE.stange_sonder, "plate")}Bodenblech ${STUECK_LABEL.sonder} (schraffiert)</span>` : "")
    + `<span>${i(FARBE.i3, "plate")}i3 (37,5 cm)</span>`
    + `<span>${i(FARBE.i2, "plate")}i2 (25 cm)</span>`
    // Brandschutzklassifikation (#79): BEIDE Klassen stehen hier, jede mit ihrer
    // Bedeutung in Worten — der Kurztext auf dem Blatt ist sonst nicht aufloesbar.
    // Schluessel ist das KUERZEL, kein Farbfeld: `FARBE.stahl` ist dieselbe Farbe
    // wie die kanonische F0-Kennfarbe, ein Farbfeld hiesse also zugleich
    // „Boden-/Kopfblech". Der Buchstabenschluessel folgt ohnehin dem ■/◆/▲-Muster
    // aus [P-19] und traegt schwarz-weiss.
    + `<span><b style="color:${BRANDKLASSE.F0.farbe}">${BRANDKLASSE.F0.kuerzel}</b>`
    + ` ${BRANDKLASSE.F0.name}</span>`
    + `<span><b style="color:${BRANDKLASSE.F30.farbe}">${BRANDKLASSE.F30.kuerzel}</b>`
    + ` ${BRANDKLASSE.F30.name}</span>`
    // Verzahnung (#82): NUR bei vorhandenem Bereich, und wie beim Brandschutz als
    // BUCHSTABENSCHLUESSEL statt Farbfeld — die Kennzeichnung selbst traegt ohne Farbe
    // (gestrichelte Begrenzung + Schraffur der Aussparungen), also darf auch ihr
    // Legendeneintrag nicht an einer Farbe haengen.
    + (((w && w.interlocks) || []).length
        ? `<span><b style="color:${FARBE.verzahnung}">${VERZAHNUNG.kuerzel}</b>`
          + ` ${VERZAHNUNG.name}</span>`
        : "")
    + `</div>`
    // [P-19] Der Kennzeichnungsschluessel der Einbauteile steht ausdruecklich MIT Symbolen
    // dabei: Farbe allein waere im Schwarz-Weiss-Druck keine Kennzeichnung.
    // Wortlaut aus ART_LABEL — genau der der Baustellenstückliste, damit Blatt und Liste
    // dieselben Begriffe benutzen und nicht zwei Namen für dasselbe Bauteil führen.
    + `<div class="zfuss">${ART_SYMBOL.standard} ${ART_LABEL.standard} · `
    + `${ART_SYMBOL.sonder} ${ART_LABEL.sonder} · ${ART_SYMBOL.rest} ${ART_LABEL.rest} · `
    + `Einbauteil-ID GS-k&lt;Spannachse&gt;.&lt;Segment von unten&gt;.&lt;Stück von unten&gt; — `
    + `dieselben IDs führt die Baustellenstückliste (Modul 4).</div>`;
}

/**
 * Das komplette Zeichnungsblatt als HTML-Baustein (Zeichnung + Tabellen + Legende
 * + Schriftfeld). Vorschau (Modul 7) und zentraler Export nutzen GENAU
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
    + `<div class="zbox"><h4>Baustellenstückliste (Mengen)</h4>${_tab(bomZeilen(w))}</div>`
    // [P-19] Konkrete Einbauteil-IDs je Spannachse — Liste und Zeichnung benennen dieselben
    // Stücke. Leer (kein Kasten), wenn die Wand keine bestückte Spannachse hat.
    + (einbauteilZeilen(w).length
        ? `<div class="zbox zids"><h4>${EINBAUTEIL_TITEL}</h4>${_tab(einbauteilZeilen(w))}</div>` : "")
    + `<div class="zbox"><h4>Vorspannung</h4>${_tab(vorspannZeilen(w))}</div>`
    // [Z-5]/[Z-6] Zuschnittkonflikte stehen VOR der Legende und nur, wenn es welche gibt:
    // ein unvollstaendiger Zuschnitt darf auf dem Blatt nicht als vollstaendig erscheinen.
    + (maengelHtml(w) ? `<div class="zbox mangel"><h4>${MANGEL_TITEL}</h4>${maengelHtml(w)}</div>` : "")
    // [G-10]/[G-12] Regelwidrige Verzahnungsbereiche und die dadurch nicht mehr baubaren
    // Restbreiten stehen als EIGENER Kasten daneben (#82) — sie sind kein Zuschnittkonflikt
    // und ausdruecklich kein Baubarkeitsausschluss; ohne Befund gibt es keinen Kasten.
    + (verzahnungMaengelHtml(w)
        ? `<div class="zbox mangel"><h4>${VERZAHNUNG_TITEL}</h4>${verzahnungMaengelHtml(w)}</div>` : "")
    // Der Darstellungsschluessel bleibt — ohne ihn sind Stueckart und Einbauteil-ID am
    // Blatt nicht lesbar ([D-4]/[P-19]). Regellisten stehen hier NICHT mehr (#61, s. o.);
    // die frei werdende Flaeche bleibt der Zeichnung und wird nicht neu belegt.
    + `<div class="zbox"><h4>Darstellung</h4>${legendeHtml(w)}</div>`
    + `</aside>`
    + schriftfeldHtml(w, eingaben, z.masstab, o)
    + `</div>`;
  return { html, masstab: z.masstab, format: o.format, svg: z.svg };
}

/**
 * CSS des Blattes — von Vorschau (Modul 7) und Export-Dokument gemeinsam genutzt.
 *
 * Die Blattgroesse steht hier FEST in Papier-mm (aus `blattInnen()`) statt als
 * Seitenverhaeltnis: eine nur bildschirmbreite Box haette dieselben Pixelmasse im
 * Blattinneren (Seitenspalte 300px, Raender, Schriftgroessen) zu einer ganz anderen
 * Bezugsbreite gestellt als der Druck — die Vorschau haette also umbrochen statt
 * skaliert (#61). Der Rahmen ist bewusst `outline`, weil er die Boxgeometrie nicht
 * veraendern darf; im Druck faellt er weg.
 */
export const ZEICHNUNG_CSS = `
  .zsheet{position:relative;box-sizing:border-box;background:#fff;color:#1c2430;
          font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          outline:1px solid #b9c0c8;padding:14px;display:grid;
          grid-template-columns:1fr 300px;grid-template-rows:1fr auto;gap:10px;overflow:hidden}
${FORMATE.map(f => `  .zsheet.fmt-${f}{width:${blattInnen(f).w}mm;height:${blattInnen(f).h}mm}`).join("\n")}
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
  /* Einbauteil-IDs ([P-19]): dichter Satz, damit die konkreten IDs je Spannachse in die
     Seitenspalte passen — die Zelle darf umbrechen, damit keine ID abgeschnitten wird. */
  .zbox.zids table.ztab{font-size:9px}
  .zbox.zids table.ztab td.r{text-align:left;font-weight:500;word-break:break-word}
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
`;

/**
 * Druck-CSS je Blattformat (eine Seite, quer) — `@page` aus denselben `BLATT`-Daten.
 *
 * Die Blattgeometrie steht ausschliesslich in `ZEICHNUNG_CSS`; hier wird sie NICHT
 * noch einmal gesetzt. Eine nur im Druck wirksame Hoehenkorrektur haette Vorschau
 * und Ausgabe wieder verschieden proportioniert (#61) — uebrig bleiben Seitenformat,
 * Rand und die reine Druckkosmetik.
 */
export function druckCss(format = "a3") {
  const b = BLATT[FORMATE.includes(format) ? format : "a3"];
  return `@page{size:${b.seite};margin:${b.rand_mm}mm}`
    + `@media print{html,body{background:#fff;margin:0;padding:0}`
    + `.zsheet{outline:none;box-shadow:none}`
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
  // Dieselbe Reduktion wie im Schriftfeld (#61): Projekt, Plan-Nr. und Index — kein
  // erklaerender Statik-Satz. Fehlt eine Angabe, entfaellt sie ganz statt als Platzhalter.
  const sub = [p.name, p.plan_nr ? "Plan " + p.plan_nr : "", p.index ? "Index " + p.index : ""]
    .filter(Boolean).join(" · ");
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
