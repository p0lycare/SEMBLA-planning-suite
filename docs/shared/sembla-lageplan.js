// @ts-check
/**
 * SEMBLA Lageplan — technische Draufsicht eines Geschosses als Planblatt
 * (Modul 9, Kapitel 16.11, [N-1] … [N-9]).
 *
 * Erzeugt aus den KANONISCHEN Daten — Projektmappe (Struktur, Lage, Bemassungen),
 * Wandspeicher (Hoehe, Wandtyp, Brandschutzklassifikation) und dem deterministischen
 * Constraint-Loeser — das
 * masstabsgetreue Lageplanblatt: Draufsicht aller zugeordneten und gueltig
 * verorteten Waende, vorhandene treibende Bemassungen, Legende, Wandkennzeichnung
 * (aussenliegende Nummernblasen mit Fuehrungslinie, #73) und Schriftfeld. Die
 * Vollstaendigkeit wird weiter abgeleitet ([N-7]) und im Schriftfeld-Feld „Stand"
 * ausgewiesen; einen eigenen Meldungsblock traegt das Blatt seit #73 nicht mehr —
 * [N-7] ist Aussagewahrheit, keine Darstellungspflicht.
 *
 * Abgrenzung — was dieses Modul ausdruecklich NICHT ist:
 *   * **keine Bearbeitung.** Der Layout-Editor (`geschossplan.html`) bleibt der
 *     einzige Ort, an dem Lage und Bemassungen entstehen ([N-1]); die
 *     Brandschutzklassifikation gehoert allein Modul 1 (#79). Hier wird nur
 *     gelesen: es gibt keine Schreibfunktion, keinen Speicherzugriff, keinen
 *     zweiten Verortungsweg. Aus `storage.js` kommt AUSSCHLIESSLICH der reine
 *     Normalisierer `normBrandklasse` — die eine kanonische Stelle, an der die
 *     Werte F0/F30 und der Standard F0 definiert sind. Eine zweite Werteliste
 *     hier waere genau die Drift, die das verhindert; ein Speicherzugriff
 *     entsteht dadurch nicht.
 *   * **keine eigene Wandgeometrie.** Rechtecke, Bezuege und Masse kommen aus
 *     `sembla-constraints.js` und `sembla-massbild.js` — demselben Baustein, mit
 *     dem der Editor zeichnet ([N-5]). Eine nachgebaute zweite Zeichenrechnung
 *     waere genau die Drift, die das verhindert.
 *   * **keine zweite Lagehaltung.** Jede Ausgabe entsteht frisch aus
 *     (Mappe, Geschoss, Loeserergebnis) ([N-3]); wo Masse bestimmen, ist das
 *     Loesungsergebnis maszgebend und nicht die gespeicherte Rohposition ([N-4]).
 *   * **keine Bildauswertung.** Der Geschossplan liegt seit #80 als HINTERGRUND unter
 *     der Zeichnung ([N-9]) — aber er bleibt, was [L-9] sagt: keine Datenquelle. Aus
 *     dem Bild wird nichts abgeleitet; uebergeben wird ein fertiger Rahmen in
 *     WELT-MILLIMETERN samt Bilddaten, gerechnet hat ihn `planRahmenMm()` in
 *     `sembla-plan.js` aus dem GESPEICHERTEN Massstab und Versatz. Dieses Modul
 *     kennt weder Bildspeicher noch Pixel und rechnet keinen Massstab nach.
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
  ACHSEN, FARBEN, GRID_MM, HALB_BREITE_MM, SEITEN,
  normLage, lageFehler, laengeMm, wandRechteck, wandSeiten, pruefeGeschoss, zustand,
  ursprungPunkt,
} from "./sembla-constraints.js";
import { massKontext, massGeometrie, massTextLayout, massAnker, massPfad } from "./sembla-massbild.js";
import { findeGeschoss, kopfdaten as mappeKopfdaten, laengenAbgleich } from "./sembla-projektmappe.js";
// #79: NUR der reine Normalisierer der Brandschutzklassifikation (F0/F30, Standard
// F0) — kein Speicherzugriff, keine Lese- oder Schreibfunktion. Er liegt kanonisch in
// storage.js, weil Modul 1 (Schreibweg) und der Geschosseditor dieselbe Stelle nutzen.
import { normBrandklasse } from "./storage.js";

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
 * Schriftgroesse der Masszahl in Papier-mm. Sie steht als Konstante da, weil sie an
 * ZWEI Stellen gebraucht wird: in der gezeichneten Zahl und in der Huellflaeche, mit
 * der die Nummernblase ihr ausweicht (#59). Zwei Literale liefen auseinander.
 */
const MASSTEXT_FS_MM = 2;

/**
 * Geschaetzte Zeichenbreite als Anteil der Schriftgroesse. DOM-frei gibt es keine
 * Textmetrik; derselbe Faktor liegt schon dem Zeilenumbruch der SVG-Datei zugrunde.
 * Bewusst eher grosszuegig — eine zu breit angenommene Zahl laesst die Blase einen
 * Schritt weiter ausweichen, eine zu schmale liesse sie auf der Zahl liegen.
 */
const ZEICHEN_BREITE = 0.5;

/** Halbe Strichbreite der Masslinien (Papier-mm) fuer die Ueberdeckungspruefung. */
const MASS_LINIE_HALB_MM = 0.16;

/**
 * Nummernblase der Wandkennzeichnung (#73), beide Werte in PAPIER-mm: Radius der
 * Blase und Abstand ihres Mittelpunkts von der Wandkante. Papier-mm statt Welt-mm,
 * damit die Blase in jedem Massstab gleich gross und lesbar bleibt; die Summe liegt
 * bewusst unter PAD_MM — die Blase steht damit immer im Zeichnungsrand des Blattes
 * und veraendert weder `ausdehnung()` noch den gewaehlten Massstab.
 */
const MARKER_R_MM = 2.1;
const MARKER_ABSTAND_MM = 4.5;

/** Schriftgroesse der Nummer in der Blase (Papier-mm) — gezeichnet UND geprueft. */
const MARKER_FS_MM = 2.1;

/**
 * Schrittweite des Ausweichens (#59) in Papier-mm: ein Blasendurchmesser plus ein
 * schmaler Spalt. Kleiner waere ein Schleichweg (viele Schritte, bis es reicht),
 * groesser risse die Blase unnoetig weit von ihrer Wand weg.
 */
const MARKER_SCHRITT_MM = 2 * MARKER_R_MM + 0.4;

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

/**
 * Brandschutzklassifikation im Blatt (#79) — Darstellung, sonst nichts. Die
 * Klassifikation ist eine reine PLANUNGSKENNZEICHNUNG: aus ihr wird kein Nachweis,
 * keine Freigabe und keine Materialregel abgeleitet, und sie veraendert weder
 * Wandgeometrie noch Massstab, Bemassung oder Vollstaendigkeit.
 *
 * Getragen wird die Unterscheidung von ZWEI Merkmalen, die BEIDE ohne Farbe
 * auskommen — der Schwarz-Weiss-Ausdruck muss sie zeigen, Farbe allein genuegt
 * nicht:
 *   * `kuerzel` steht als Kurztext an der Wand, in PAPIER-mm. Eine 125 mm breite
 *     Wand ist bei 1:100 nur 1,25 Papier-mm breit; eine Kennzeichnung IN der
 *     Flaeche waere in den groben Massstaeben unlesbar, der Kurztext bleibt es
 *     in jedem.
 *   * `schraffur` legt bei F30 zusaetzlich das Schraffurmuster ueber die
 *     Wandflaeche — die gelaeufige Bauzeichnungskonvention, auf einen Blick
 *     erkennbar. F0 bleibt bewusst OHNE Schraffur und damit darstellungsgleich
 *     zum bisherigen Blatt.
 * `farbe` kommt nur additiv dazu und ist bewusst keine der Zustandsfarben ([K-8])
 * und keine der V/R-Farben (#84).
 */
export const BRANDKLASSE = Object.freeze({
  F0: Object.freeze({ kuerzel: "F0", name: "ohne Brandschutzklassifikation",
    merkmal: "ohne Schraffur", farbe: "#5b6673", schraffur: false }),
  F30: Object.freeze({ kuerzel: "F30", name: "Brandschutzklassifikation F30",
    merkmal: "diagonal schraffiert", farbe: "#0b7285", schraffur: true }),
});

/** Kennung und Kachelmass (Papier-mm) der F30-Schraffur. */
const SCHRAFFUR_ID = "lpbrand-f30";
const SCHRAFFUR_MM = 0.9;

/**
 * Papier-mm, um die der Brandschutz-Kurztext neben der Wandkante steht — auf der
 * der Nummernblase GEGENUEBERLIEGENDEN Seite (x-Wand unten, y-Wand rechts), damit
 * sich beide Kennzeichnungen nicht ins Gehege kommen. Wie die Blase liegt er damit
 * im Zeichnungsrand (< PAD_MM) und veraendert weder `ausdehnung()` noch den
 * gewaehlten Massstab.
 */
const BRAND_ABSTAND_MM = 2.6;

// ------------------------------------------------------------------- Helfer

const _esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
  (c) => /** @type {any} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Zahl auf 3 Dezimalen kuerzen — haelt die SVG-Zeichenkette stabil/vergleichbar. */
const _n = (v) => (Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000).toString();

const _fmt = (n, d = 0) => (Number.isFinite(n) ? n : 0)
  .toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Ein Wert des Zeichnungskopfs: leer bleibt LEER (#59) — kein Gedankenstrich, kein
 * „###", kein „undefined". Ein Platzhalter taeuscht einen Inhalt vor, den es nicht
 * gibt; die Wandtabelle hat davon getrennt ihr eigenes „–" fuer fehlende Masse.
 */
const _leer = (v) => (v == null || v === "" ? "" : String(v));

/** Der Planinhalt dieses Blattes — er ist fest, weil Modul 9 genau eine Ausgabe hat. */
const PLANINHALT = "Lageplan (Draufsicht)";

// -------------------------------------------------------- Darstellungsoptionen

/**
 * Standard-Darstellungsoptionen. Das sind AUSSCHLIESSLICH Darstellungsoptionen und
 * werden bewusst NICHT gespeichert: Modul 9 legt keine neue Datenstruktur an und
 * schreibt keinen `eingaben`-Abschnitt.
 */
export function standardOptionen() {
  return { format: "a3", masse: true, kennzeichnung: true, raster: false, wasserzeichen: false,
    transparenz: TRANSPARENZ_STANDARD };
}

/**
 * Standardtransparenz des Planhintergrunds in Prozent (#80, [N-9]): 30 % —
 * also 70 % Deckkraft. Der Grundriss ist damit klar zu erkennen, Wandkanten und
 * Masszahlen behalten aber ihren Kontrast. Der Wert ist eine Vorgabe, keine
 * Rechenregel; verstellt wird er in Modul 9 und nirgends gespeichert.
 */
export const TRANSPARENZ_STANDARD = 30;

/** Prozentwert 0…100, ganzzahlig — ausserhalb wird geklemmt, Unsinn faellt auf `ersatz`. */
function _prozent(v, ersatz) {
  if (v === undefined || v === null || v === "" || !Number.isFinite(+v)) return ersatz;
  return Math.min(100, Math.max(0, Math.round(+v)));
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
    // #80/[N-9]: reine Darstellung, ganzzahlige Prozent, NIE gespeichert.
    transparenz: _prozent(z.transparenz, s.transparenz),
  };
}

// -------------------------------------------------------- Planhintergrund [N-9]

/**
 * Zustaende des Planhintergrunds (#80, [N-9]) — genau einer je Blatt:
 *
 *   `keiner`           dem Geschoss ist kein Plan hinterlegt: es gibt nichts zu sagen.
 *   `gesetzt`          kalibrierter Plan mit Bild — der Hintergrund wird gezeichnet.
 *   `nicht_kalibriert` Plan hinterlegt, aber ohne gesetzten Massstab ([L-9]): KEIN
 *                      Hintergrund. Der vorlaeufige Editorfaktor 1 Bildpunkt = 1 mm
 *                      ist eine Bedienhilfe und hat in einer maszstaeblichen
 *                      Unterlage nichts zu suchen — geschaetzt wird nichts.
 *   `bild_fehlt`       Massstab und Versatz stehen, das Bild liegt aber nicht in
 *                      diesem Browser ([L-8]) — benannt, nicht ersetzt.
 *   `unbrauchbar`      als gesetzt uebergeben, aber ohne Bilddaten oder ohne
 *                      brauchbare Rahmengeometrie — ebenfalls benannt, nie geraten.
 */
export const HINTERGRUND_TEXT = {
  keiner: "",
  gesetzt: "Der hinterlegte Geschossplan liegt mit seinem gespeicherten Maßstab und Versatz "
    + "als Hintergrund unter der Zeichnung. Aus dem Bild wird nichts abgeleitet ([L-9]/[N-9]).",
  nicht_kalibriert: "Für den hinterlegten Geschossplan ist kein Maßstab gesetzt — er erscheint "
    + "deshalb nicht als Hintergrund. Kalibriert wird im Geschossplaner ([L-9]).",
  bild_fehlt: "Zum hinterlegten Geschossplan liegt in diesem Browser kein Bild — Maßstab und "
    + "Versatz bleiben erhalten, ein Hintergrund wird nicht gezeichnet ([L-8]).",
  unbrauchbar: "Der übergebene Planhintergrund ist unbrauchbar (Bilddaten oder Bildmaße fehlen) "
    + "— es wird kein Hintergrund gezeichnet und keine Lage geraten ([L-9]).",
};

/**
 * Den uebergebenen Planhintergrund normalisieren. Erwartet wird ein FERTIGER Rahmen
 * in Welt-Millimetern — gerechnet von `planRahmenMm()` in `sembla-plan.js` aus dem
 * gespeicherten `mm_je_pixel` und Versatz ([N-9]). Hier wird nichts umgerechnet und
 * nichts geschaetzt: fehlen Bilddaten oder Masse, ist der Hintergrund `unbrauchbar`.
 *
 * @param {any} h `{status, url, x, y, breite, hoehe, name?, mm_je_pixel?}`
 * @returns {{status:string, url:string|null, x:number, y:number, breite:number,
 *            hoehe:number, name:string|null, mm_je_pixel:number|null, text:string}}
 */
export function normHintergrund(h) {
  const z = h && typeof h === "object" ? h : {};
  const zahl = (v) => (Number.isFinite(+v) ? +v : null);
  const roh = String(z.status || "keiner");
  const bekannt = Object.prototype.hasOwnProperty.call(HINTERGRUND_TEXT, roh);
  let status = bekannt ? roh : "unbrauchbar";
  const url = z.url == null || z.url === "" ? null : String(z.url);
  const x = zahl(z.x), y = zahl(z.y), b = zahl(z.breite), hh = zahl(z.hoehe);
  const brauchbar = !!url && x != null && y != null && b != null && hh != null && b > 0 && hh > 0;
  if (status === "gesetzt" && !brauchbar) status = "unbrauchbar";
  return {
    status,
    url: status === "gesetzt" ? url : null,
    x: x || 0, y: y || 0, breite: b || 0, hoehe: hh || 0,
    name: z.name == null || z.name === "" ? null : String(z.name),
    mm_je_pixel: zahl(z.mm_je_pixel),
    text: HINTERGRUND_TEXT[status] || HINTERGRUND_TEXT.unbrauchbar,
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
 *          elemente?:Array<{id:string,name?:string,wandelement?:any}>,
 *          hintergrund?:any}} arg
 *   `elemente` sind die vorhandenen Wandelemente (Form von `listeElemente()`).
 *   Sie liefern AUSSCHLIESSLICH Hoehe, Wandtyp und Brandschutzklassifikation — die
 *   Mappe kennt nichts davon und bekommt keine Kopie ([P-1]). Fehlt ein Element, ist
 *   der Eintrag verwaist ([L-4]) und es wird nichts geraten.
 *   `hintergrund` ist der fertige Planrahmen in Welt-mm (#80, [N-9], s.
 *   `normHintergrund`) — read-only durchgereicht, nie hier berechnet.
 */
export function lageplanDaten({ mappe, geschossId, elemente, hintergrund }) {
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
  // Der GESPEICHERTE Geschossursprung ([K-4], #76) — der Lageplan liest ihn wie
  // jedes andere kanonische Datum und zeichnet ihn dort, wo er steht ([N-3]).
  const ursprung = ursprungPunkt(geschoss.ursprung_mm);
  // Der kanonische Loeser — dieselbe Funktion, die der Editor nach jeder Aenderung
  // fährt. Iteration, Toleranz oder Startwerte gibt es hier so wenig wie dort ([K-5]).
  const erg = pruefeGeschoss(waendeRoh, bemassungenRoh, ursprung);
  const koll = erg.kollisionen || [];
  const ctx = massKontext(waendeRoh, erg, ursprung);

  /** @type {Array<{art:string,text:string}>} */
  const meldungen = [];
  /** @type {Array<{art:string,text:string}>} */
  const hinweise = [];
  const name = (id) => {
    const w = waendeRoh.find((x) => x.id === String(id));
    return (w && (w.name || w.id)) || String(id);
  };

  const waende = waendeRoh.map((w, i) => {
    const el = nachId.get(w.id) || null;
    const we = el && el.wandelement ? el.wandelement : null;
    const lage = normLage(w.lage);
    const pos = erg.positionen[w.id];
    const rechteck = w.lage == null ? null : wandRechteck(w.lage, pos);
    const bestimmt = erg.bestimmt[w.id] || { x: false, y: false };
    const eintrag = {
      id: w.id,
      // Laufende Nummer der Zeichnung (#59): Index+1 der KANONISCHEN Mappenreihenfolge
      // `geschoss.waende` — einschliesslich unverorteter und verwaister Eintraege, damit
      // Zeichnung und rechte Liste lueckenlos dieselbe Zuordnung tragen. Sie ist reine
      // Darstellung: nicht gespeichert, keine zweite Wandkennung. Identifiziert wird
      // weiter ueber die stabile `id` (`data-wand`) und den Namen (`<title>`).
      nr: i + 1,
      name: w.name || w.id,
      verwaist: !el,
      richtung: lage ? lage.richtung : null,
      orientierung: lage ? lage.orientierung : null,
      // Vorder-/Rueckkante (#84): DIESELBE Ableitung wie im Geschosseditor
      // (`wandSeiten` aus sembla-constraints.js) auf der geloesten Position —
      // unverortet oder fehlerhaft bleibt es `null`, keine Seite wird erfunden.
      seiten: w.lage == null ? null : wandSeiten(w.lage, pos),
      laenge_mm: laengeMm(w.lage),
      hoehe_mm: we && Number.isFinite(+we.height_mm) ? +we.height_mm : null,
      wandtyp: we && we.wandtyp ? String(we.wandtyp) : null,
      // Brandschutzklassifikation (#79): dieselbe Bahn wie Hoehe und Wandtyp, aber
      // NORMALISIERT — ein Wandelement ohne das Feld (Neuanlage, Altbestand,
      // importierte Datei) gilt als F0, ein unbekannter Wert ebenfalls. Ohne
      // Wandelement bleibt sie `null`: eine verwaiste Wand bekommt keine erfundene
      // Klassifikation und steht in der Tabelle ohne Angabe ([L-4]/[P-9]).
      brandklasse: we ? normBrandklasse(we.brandklasse) : null,
      rechteck,
      bestimmt,
      zustand: zustand(w.id, erg, { kollisionen: koll }),
    };
    if (w.lage == null) {
      meldungen.push({ art: "unverortet", text:
        `Wand „${eintrag.name}“ ist im Geschoss eingetragen, aber nicht verortet — sie fehlt `
        + "deshalb im Plan. Verortet wird sie im Layout-Editor ([L-4])." });
    } else if (!rechteck) {
      // Verortet, aber ungueltig (z. B. eine zur Achse widerspruechliche Orientierung,
      // #84): benannt gemeldet statt still aus dem Blatt zu fallen ([N-7]).
      meldungen.push({ art: "lage_ungueltig", text:
        `Wand „${eintrag.name}“ hat eine ungültige Lage und fehlt deshalb im Plan: `
        + lageFehler(w.lage).join(" ") });
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
  // Die Masszahlen laufen zusaetzlich durch die kollisionsfreie Anordnung (#59):
  // DIESELBE Funktion wie im Editor, damit beide dieselben Textlagen zeigen —
  // Masslinien, Werte und die gespeicherten Bemassungen bleiben unveraendert.
  const massbilder = massTextLayout(bemassungenRoh.map((bm, i) => massGeometrie(bm, i, ctx)));
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
  // Planhintergrund (#80, [N-9]): ein fehlender oder unkalibrierter Plan ist ein
  // HINWEIS, kein Mangel — er sagt nichts ueber die Vollstaendigkeit der Planung
  // ([N-7]) und darf `vollstaendig` deshalb nicht kippen. Benannt wird er trotzdem,
  // sichtbar auf dem Blatt (`hintergrundHtml`), damit niemand einen fehlenden
  // Hintergrund fuer eine leere Bestandsfläche haelt.
  const hg = normHintergrund(hintergrund);
  if (hg.status !== "keiner" && hg.status !== "gesetzt") {
    hinweise.push({ art: "planhintergrund", text: hg.text });
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
    /** Der gespeicherte Grundbezug ([K-4], #76) — Zeichnung und Ausdehnung nutzen ihn. */
    ursprung,
    kopfdaten: projekt,
    /** Der durchgereichte Planhintergrund (#80, [N-9]) — read-only, nie gerechnet. */
    hintergrund: hg,
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

// ------------------------------------------- Ueberdeckungsfreie Blasen (#59)
//
// Die Nummernblase steht seit #73 an fester Papier-mm-Stelle quer zur Wand. In einem
// dicht bebauten, bemassten Geschoss liegt sie damit regelmaessig AUF einer anderen
// Blase oder auf einer Masszahl/Masslinie — die Nummer ist dann unlesbar oder nicht
// mehr eindeutig zuzuordnen. Die folgenden Helfer bilden die dafuer noetigen
// Huellflaechen in PAPIER-mm; ausgewichen wird in `lageplanSvg()`.
//
// Alles hier ist FLUECHTIGE Darstellung: gerechnet bei jeder Ausgabe neu, nirgends
// gespeichert, ohne jede Rueckwirkung auf Masswert, Masslinie, Wandgeometrie,
// Massstab, Blattausdehnung oder die Anordnung aus `massTextLayout`.

/** Achsparallele Huellflaeche aus zwei Ecken. */
const _flaeche = (x1, y1, x2, y2) => ({
  x_min: Math.min(x1, x2), x_max: Math.max(x1, x2),
  y_min: Math.min(y1, y2), y_max: Math.max(y1, y2),
});

/** Ueberdecken sich zwei Flaechen? Beruehrung allein ist KEINE Ueberdeckung. */
const _ueberdeckt = (a, b) => !(a.x_min >= b.x_max || b.x_min >= a.x_max
  || a.y_min >= b.y_max || b.y_min >= a.y_max);

/**
 * Huellflaeche der GEZEICHNETEN Masszahl in Papier-mm. Abgeleitet wird sie aus
 * demselben Ankerpunkt (`massAnker`) und demselben Hub (`MASSTEXT_MM`), mit dem die
 * Zahl auch gesetzt wird — ein zweites Textmodell gibt es nicht. In Achse y ist die
 * Zahl um −90° um den Anker gedreht; laengs und quer tauschen deshalb die Seiten.
 *
 * @param {any} p Massgeometrie in Papier-mm @param {string} text die dargestellte Zahl
 */
function masstextFlaeche(p, text) {
  const t = massAnker(p, 0).anker;
  const b = Math.max(1, String(text).length) * MASSTEXT_FS_MM * ZEICHEN_BREITE;
  // Von der Grundlinie aus: Oberlaenge nach oben, ein Rest nach unten.
  const oben = MASSTEXT_MM + MASSTEXT_FS_MM, unten = MASSTEXT_MM - MASSTEXT_FS_MM * 0.25;
  if (p.achse === "x") return _flaeche(t.x - b / 2, t.y - oben, t.x + b / 2, t.y - unten);
  return _flaeche(t.x - oben, t.y - b / 2, t.x - unten, t.y + b / 2);
}

/**
 * Huellflaechen der GEZEICHNETEN Masslinie und ihrer beiden Hilfslinien in Papier-mm
 * — dieselben drei Strecken, die `massPfad(p, 1, …)` zeichnet. Sie gehoeren zur
 * Massdarstellung und werden deshalb mitgeprueft; eine Blase auf der Masslinie ist so
 * wenig lesbar wie eine auf der Zahl.
 */
function masslinienFlaechen(p) {
  const pt = (laengs, quer) => (p.achse === "x" ? { x: laengs, y: quer } : { x: quer, y: laengs });
  const ueber = p.q + 1;                            // derselbe `tick` wie beim Zeichnen
  const seg = (a, b) => _flaeche(
    Math.min(a.x, b.x) - MASS_LINIE_HALB_MM, Math.min(a.y, b.y) - MASS_LINIE_HALB_MM,
    Math.max(a.x, b.x) + MASS_LINIE_HALB_MM, Math.max(a.y, b.y) + MASS_LINIE_HALB_MM);
  return [
    seg(pt(p.v1, p.q1), pt(p.v1, ueber)),
    seg(pt(p.v2, p.q2), pt(p.v2, ueber)),
    seg(pt(p.v1, p.q), pt(p.v2, p.q)),
  ];
}

/**
 * Huellflaeche einer Nummernblase samt ihrer Zahl (Papier-mm). Der Kreis wird als
 * achsparalleles Huellrechteck genommen — konservativ und deterministisch; eine
 * dreistellige Nummer ragt ueber den Kreis hinaus und verbreitert die Flaeche.
 */
function blaseFlaeche(cx, cy, nr) {
  const halb = Math.max(MARKER_R_MM,
    String(nr).length * MARKER_FS_MM * ZEICHEN_BREITE / 2);
  return _flaeche(cx - halb, cy - MARKER_R_MM, cx + halb, cy + MARKER_R_MM);
}

/**
 * Der TATSAECHLICHE Ueberstand der platzierten Nummernblasen ueber den bisherigen
 * Zeichenbereich `[0,0] … [breite,hoehe]` (Papier-mm, je Seite, nie negativ).
 *
 * Warum es das braucht (#59): Kandidat 0 sitzt `MARKER_ABSTAND_MM + MARKER_R_MM`
 * = 6,6 mm vor der Wandkante und damit sicher im `PAD_MM`-Rand (10 mm). Jede
 * Ausweichstufe zieht aber `MARKER_SCHRITT_MM` = 4,6 mm ab — ab der zweiten Stufe
 * laeuft die Blase zwangslaeufig aus dem Blatt und war bisher abgeschnitten. Der
 * Rand wird deshalb NACH der Platzierung um genau das gemessene Mass erweitert.
 *
 * Gemessen wird an den GEZEICHNETEN Blasen, mit derselben Huellflaeche, mit der sie
 * einander ausweichen — Kreis UND Zahl, ein zweites Flaechenmodell gibt es nicht.
 * Ohne Ausweichen ist jeder Wert 0: das Blatt bleibt dann bitgenau das bisherige.
 *
 * @param {Array<{x_min:number,y_min:number,x_max:number,y_max:number}>} blasen
 * @param {number} breite_mm @param {number} hoehe_mm
 */
function blasenRand(blasen, breite_mm, hoehe_mm) {
  let links = 0, oben = 0, rechts = 0, unten = 0;
  for (const f of blasen) {
    links = Math.max(links, -f.x_min);
    oben = Math.max(oben, -f.y_min);
    rechts = Math.max(rechts, f.x_max - breite_mm);
    unten = Math.max(unten, f.y_max - hoehe_mm);
  }
  return { links, oben, rechts, unten };
}

// ------------------------------------------------------------------ Zeichnung

/**
 * Die Draufsicht als SVG in Papier-Millimetern (im Druck echt 1:x).
 *
 * @param {any} daten Ergebnis von `lageplanDaten`
 * @param {any} [opts]
 * @returns {{svg:string, inner:string, masstab:number, passt:boolean,
 *            breite_mm:number, hoehe_mm:number, benoetigt:number,
 *            rand:{links:number,oben:number,rechts:number,unten:number},
 *            voll_breite_mm:number, voll_hoehe_mm:number}}
 *   `breite_mm`/`hoehe_mm` sind unveraendert der Zeichenbereich der Zeichnung
 *   selbst; `rand` und `voll_*` sind die AUSGEGEBENE Flaeche einschliesslich des
 *   Blasenueberstands (#59) — `inner` ist in beiden Faellen dieselbe Zeichenkette.
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

  /** Welt-mm -> Papier-mm. */
  const X = (v) => PAD_MM + (v - a.x_min) / masstab;
  const Y = (v) => PAD_MM + (v - a.y_min) / masstab;
  const S = (v) => v / masstab;
  const breite_mm = bW / masstab + RAND_X, hoehe_mm = bH / masstab + RAND_Y;

  const teile = [];

  // ---- Schraffurmuster der Brandschutzklassifikation (#79) ---------------
  //
  // `<defs>` zeichnet selbst nichts und steht deshalb vorn — die Reihenfolge der
  // sichtbaren Knoten (Hintergrund, Wand, Seiten, Marker, Masse) bleibt unberuehrt.
  // Es gehoert zwingend in `inner`: `lageplanSvgDatei()` uebernimmt genau diese
  // Zeichenkette, ein Muster am Wurzelelement fehlte in der Exportdatei. Erzeugt
  // wird es nur, wenn es auch gebraucht wird — sonst waere das Blatt einer reinen
  // F0-Planung nicht mehr das bisherige.
  if (daten.waende.some((w) => w.rechteck && w.brandklasse === "F30")) {
    teile.push(`<defs><pattern id="${SCHRAFFUR_ID}" width="${_n(SCHRAFFUR_MM)}"`
      + ` height="${_n(SCHRAFFUR_MM)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
      + `<line x1="0" y1="0" x2="0" y2="${_n(SCHRAFFUR_MM)}"`
      + ` stroke="${BRANDKLASSE.F30.farbe}" stroke-width="0.18"/></pattern></defs>`);
  }

  // ---- Planhintergrund (#80, [N-9]) -------------------------------------
  //
  // ZUERST, damit alles Gezeichnete darueber liegt: SVG malt in Dokumentreihenfolge,
  // Wand-, Seiten-, Marker- und Massknoten folgen unten. Platziert wird ueber
  // GENAU dieselben Abbildungen wie die Wandgeometrie (`X`/`Y`/`S`); der Rahmen
  // selbst ist bereits in Welt-mm und kommt aus `planRahmenMm()` — hier wird kein
  // Massstab nachgerechnet und `ausdehnung()`/`waehleMasstab()` bleiben unberuehrt,
  // das Bild verschiebt also weder Blattmassstab noch Wandlage.
  //
  // Die Deckkraft ist ein ATTRIBUT, kein Stil: die eigenstaendige SVG-Datei traegt
  // kein Stylesheet, und Vorschau, Druck-HTML und Exportdatei entstehen aus genau
  // dieser einen Zeichenkette. Bei 100 % Transparenz entfaellt das Bild ganz —
  // ein unsichtbares Bild waere sonst reine Dateilast.
  const hg = daten.hintergrund;
  if (hg && hg.status === "gesetzt" && hg.url && o.transparenz < 100) {
    const deck = (100 - o.transparenz) / 100;
    // Geklippt auf das Blattfeld: der Plan ist meist groesser als der Wandbestand,
    // und `lageplanSvgDatei()` schiebt diese Zeichnung unter eine Kopfzeile — ohne
    // Klippung ueberdeckte ein Ueberstand Titel und Fusszeile.
    teile.push(`<g class="lpbg">`
      + `<clipPath id="lpbg-clip"><rect x="0" y="0" width="${_n(breite_mm)}"`
      + ` height="${_n(hoehe_mm)}"/></clipPath>`
      + `<image clip-path="url(#lpbg-clip)" href="${_esc(hg.url)}"`
      + ` x="${_n(X(hg.x))}" y="${_n(Y(hg.y))}"`
      + ` width="${_n(S(hg.breite))}" height="${_n(S(hg.hoehe))}"`
      + ` preserveAspectRatio="none" opacity="${_n(deck)}"/></g>`);
  }

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

  // Der Geschossursprung ist der einzige Grundbezug ([K-4]) und gehoert damit ins
  // Blatt — seit #76 an seiner GESPEICHERTEN Stelle statt fest bei 0/0. Die
  // Beschriftung bleibt „0/0“: sie benennt den Nullpunkt des MASSSYSTEMS, und
  // genau das ist er auch nach dem Verschieben.
  const u = ursprungPunkt(daten.ursprung);
  if (a.x_min <= u.x && a.x_max >= u.x && a.y_min <= u.y && a.y_max >= u.y) {
    const k = 2.2;
    teile.push(`<g class="lpursprung"><path d="M${_n(X(u.x) - k)} ${_n(Y(u.y))}H${_n(X(u.x) + k)}`
      + `M${_n(X(u.x))} ${_n(Y(u.y) - k)}V${_n(Y(u.y) + k)}" fill="none" stroke="${FARBE.ursprung}"`
      + ` stroke-width="0.2"/><text x="${_n(X(u.x) + k + 0.6)}" y="${_n(Y(u.y) - 0.8)}"`
      + ` font-size="1.8" fill="${FARBE.ursprung}">0/0</text></g>`);
  }

  // ---- Massdarstellung in Papier-mm: EINMAL gerechnet (#59) --------------
  //
  // Vorgezogen wird nur die RECHNUNG, nicht die Ausgabe: die Massgruppen entstehen
  // unveraendert nach den Waenden (SVG malt in Dokumentreihenfolge). Gebraucht wird
  // sie hier, weil die Nummernblase den Massen ausweichen muss und diese sonst zum
  // Zeitpunkt ihrer Platzierung noch gar nicht gerechnet waeren. Beide Seiten nutzen
  // damit dieselben Zahlen — ein zweiter Rechenweg koennte auseinanderlaufen.
  const streitig = new Set((daten.ergebnis.widersprueche || [])
    .flatMap((w) => [w.bemassung, w.konflikt_mit]).filter(Boolean));
  const doppelt = new Set((daten.ergebnis.redundanzen || []).map((r) => r.bemassung));
  /**
   * Parallel zu `daten.massbilder`: `null`, wo NICHTS gezeichnet wird (Bemassung
   * ausgeblendet, nicht darstellbar oder Nullmass, s. u.). Nur Gezeichnetes ist ein
   * Hindernis — einem unsichtbaren Mass auszuweichen waere nicht nachvollziehbar.
   */
  const massPapier = daten.massbilder.map((g) => {
    if (!g || !o.masse || g.mass === 0) return null;
    return {
      p: {
        achse: g.achse,
        v1: g.achse === "x" ? X(g.v1) : Y(g.v1), v2: g.achse === "x" ? X(g.v2) : Y(g.v2),
        q1: g.achse === "x" ? Y(g.q1) : X(g.q1), q2: g.achse === "x" ? Y(g.q2) : X(g.q2),
        q: g.achse === "x" ? Y(g.q) : X(g.q),
        versatz: { x: S(g.versatz.x), y: S(g.versatz.y) },
      },
      text: String(g.mass) + (streitig.has(g.id) ? " ⚠" : ""),
    };
  });

  /**
   * Die Flaechen, denen eine Nummernblase ausweicht (#59): Masszahlen, Masslinien
   * samt Hilfslinien — und, waehrend der Wandschleife wachsend, die bereits
   * platzierten Blasen. Wandflaechen stehen ausdruecklich NICHT darin: sie duerfen
   * notfalls ueberdeckt werden, sonst gaebe es Faelle ohne Loesung.
   *
   * Die gespeicherten Darstellungsversaetze `linie_mm`/`text_mm` und die Anordnung
   * aus `massTextLayout` stecken bereits in `daten.massbilder` — sie wirken damit
   * ZUERST und gehen unveraendert in die Pruefung ein.
   */
  const hindernisse = [];
  for (const mp of massPapier) {
    if (!mp) continue;
    hindernisse.push(masstextFlaeche(mp.p, mp.text), ...masslinienFlaechen(mp.p));
  }

  /**
   * Die TATSAECHLICH platzierten Blasenflaechen — dieselben Objekte, die auch
   * Hindernis werden. Aus ihnen entsteht nach der Schleife der Ueberstand ueber den
   * Zeichenbereich (#59); gerechnet wird nichts nach, gespeichert wird nichts.
   */
  const blasen = [];

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
    st.push("</g>");
    teile.push(st.join(""));
    // Brandschutzklassifikation (#79): eigene Gruppe NACH dem Wandknoten und VOR
    // Seitenkanten und Nummernblase — die Schraffur liegt damit auf der Wandflaeche,
    // aber unter V/R-Kante und Blase. Eigene Gruppe (wie #84/#73), damit der
    // Wandknoten selbst unveraendert bleibt. Getragen wird die Unterscheidung ohne
    // Farbe: F30 zusaetzlich schraffiert, und BEIDE Klassen tragen ihren Kurztext.
    // Sie ist reine Kennzeichnung und haengt deshalb NICHT am Schalter
    // „Wände kennzeichnen" — der gehoert der Nummernblase als Lesehilfe.
    const bk = w.brandklasse ? BRANDKLASSE[w.brandklasse] : null;
    if (bk) {
      const querB = w.richtung !== "y";
      const btx = querB ? x + bw / 2 : x + bw + BRAND_ABSTAND_MM;
      const bty = querB ? y + bh + BRAND_ABSTAND_MM : y + bh / 2 + 0.65;
      const bg = [`<g class="lpbrand" data-wand="${_esc(w.id)}"`
        + ` data-brandklasse="${_esc(w.brandklasse)}">`];
      if (bk.schraffur) {
        bg.push(`<rect class="lpbrand-flaeche" x="${_n(x)}" y="${_n(y)}" width="${_n(bw)}"`
          + ` height="${_n(bh)}" fill="url(#${SCHRAFFUR_ID})"/>`);
      }
      bg.push(`<text class="lpbrand-kz" x="${_n(btx)}" y="${_n(bty)}" font-size="1.8"`
        + ` text-anchor="${querB ? "middle" : "start"}" fill="${bk.farbe}">`
        + `${_esc(bk.kuerzel)}</text>`);
      bg.push("</g>");
      teile.push(bg.join(""));
    }
    if (w.seiten) {
      // Vorder-/Rueckkante (#84): dieselbe Ableitung wie im Editor (`wandSeiten`),
      // hier nur in Papier-mm umgerechnet. Kantenlinie plus Kennbuchstabe AUSSEN —
      // nie nur Farbe. Eigene Gruppe NACH dem Wandknoten (wie die Nummernblase,
      // #73); `data-orientierung` traegt den kanonischen Wert. Der Buchstabe sitzt
      // am Viertelpunkt der Kante, damit er der mittigen Nummernblase und ihrer
      // Fuehrungslinie nicht in die Quere kommt.
      const sg = [`<g class="lpseiten" data-wand="${_esc(w.id)}"`
        + ` data-orientierung="${_esc(w.seiten.orientierung)}">`];
      for (const [art, s] of [["vorder", w.seiten.vorder], ["rueck", w.seiten.rueck]]) {
        const sf = SEITEN[art];
        const ax = X(s.a.x), ay = Y(s.a.y), bx = X(s.b.x), by = Y(s.b.y);
        sg.push(`<line class="lpseite lpseite-${art}" x1="${_n(ax)}" y1="${_n(ay)}"`
          + ` x2="${_n(bx)}" y2="${_n(by)}" stroke="${sf.farbe}" stroke-width="0.4"/>`);
        const tx = ax + (bx - ax) * 0.25 + s.aussen.x * 1.7;
        const ty = ay + (by - ay) * 0.25 + s.aussen.y * 1.7;
        sg.push(`<text class="lpseite-kz" x="${_n(tx)}" y="${_n(ty + 0.65)}" font-size="1.8"`
          + ` text-anchor="middle" fill="${sf.farbe}">${sf.kuerzel}</text>`);
      }
      sg.push("</g>");
      teile.push(sg.join(""));
    }
    if (o.kennzeichnung) {
      // Aussenliegende Nummernblase mit Fuehrungslinie (#73). Die kurze laufende
      // Nummer (#59) steht NICHT mehr im Wandrechteck — eine 125 mm breite Wand ist
      // bei 1:50 nur 2,5 Papier-mm breit, die Zahl lag also praktisch auf
      // Mittellinie und Nachbarmassen. Die Blase sitzt in festem Papier-mm-Abstand
      // QUER zur Wandrichtung (x-Wand: oberhalb, y-Wand: links) — deterministisch
      // und unrotiert, damit sie bei beiden Richtungen gleich lesbar ist; die
      // Fuehrungslinie laeuft vom Blasenrand auf die Wandkante. Der volle Name steht
      // unveraendert im `<title>` der Wand und mit derselben Nummer in der rechten
      // Wandtabelle; die Blase traegt `data-wand` fuer die eindeutige Zuordnung.
      const quer = w.richtung !== "y";
      // Ueberdeckungsfreie Platzierung (#59). Kandidat 0 ist BITGENAU die Lage von
      // #73; jeder weitere schiebt die Blase auf DERSELBEN Normalen um einen festen
      // Schritt weiter nach aussen (x-Wand nach oben, y-Wand nach links). Ankerpunkt
      // und Richtung der Fuehrungslinie bleiben dabei unveraendert — sie wird nur
      // laenger und zeigt weiter auf dieselbe Wandkante.
      //
      // Terminiert ohne Kappe (wie `massTextLayout`): `hindernisse` ist endlich und
      // jeder Schritt bewegt die Flaeche monoton nach aussen — jenseits des am
      // weitesten aussen liegenden Hindernisses ist sie zwangslaeufig frei. Eine
      // feste Obergrenze liesse bei genuegend Nachbarn wieder eine Ueberdeckung zu.
      const mitte = (k) => ({
        x: quer ? x + bw / 2 : x - MARKER_ABSTAND_MM - k * MARKER_SCHRITT_MM,
        y: quer ? y - MARKER_ABSTAND_MM - k * MARKER_SCHRITT_MM : y + bh / 2,
      });
      let stufe = 0;
      for (;;) {
        const m = mitte(stufe);
        const f = blaseFlaeche(m.x, m.y, w.nr);
        if (!hindernisse.some((h) => _ueberdeckt(f, h))) break;
        stufe++;
      }
      const m = mitte(stufe);
      const cx = m.x, cy = m.y;
      // Die eigene Flaeche wird Hindernis fuer die folgenden Waende: die erste Blase
      // bleibt stehen, jede weitere weicht ihr aus (Reihenfolge = Mappenreihenfolge).
      // Dieselbe Flaeche geht in `blasen` und traegt damit den Ueberstand (#59) —
      // eine zweite, nachgerechnete Flaeche koennte davon abweichen.
      const eigen = blaseFlaeche(cx, cy, w.nr);
      hindernisse.push(eigen);
      blasen.push(eigen);
      const ax = quer ? cx : x, ay = quer ? y : cy;          // Ankerpunkt Wandkante
      const lx = quer ? cx : cx + MARKER_R_MM;               // Beginn am Blasenrand
      const ly = quer ? cy + MARKER_R_MM : cy;
      teile.push(`<g class="lpmarker" data-wand="${_esc(w.id)}">`
        + `<line x1="${_n(lx)}" y1="${_n(ly)}" x2="${_n(ax)}" y2="${_n(ay)}"`
        + ` stroke="${FARBE.mittellinie}" stroke-width="0.12"/>`
        + `<circle cx="${_n(cx)}" cy="${_n(cy)}" r="${_n(MARKER_R_MM)}" fill="#ffffff"`
        + ` stroke="${farbe}" stroke-width="0.18"/>`
        + `<text x="${_n(cx)}" y="${_n(cy + 0.75)}" font-size="${MARKER_FS_MM}"`
        + ` text-anchor="middle"`
        + ` fill="${FARBE.text}">${_esc(w.nr)}</text></g>`);
    }
  }

  if (o.masse) {
    daten.massbilder.forEach((g, i) => {
      if (!g) return;
      // Nullmasse werden NICHT gezeichnet (#59): eine Bemassung mit 0 mm — typisch die
      // Fixierung einer Kante am Geschossursprung ([K-4]) — haette zwei deckungsgleiche
      // Hilfslinien, eine Masslinie ohne Ausdehnung und die Zahl „0" mitten im Plan; sie
      // verdeckt Nachbarmasse und behauptet eine Strecke, die es nicht gibt. Ausgelassen
      // wird die GANZE Gruppe samt `data-bemassung`, damit im Blatt nichts Unsichtbares
      // liegen bleibt. Das ist ausschliesslich Darstellung: das Datum bleibt in
      // `geschoss.bemassungen`, der Loeser wendet es unveraendert an, und `massbilder`
      // behaelt Laenge und Index — die Staffelung der uebrigen Masse bleibt damit
      // bitgenau die des Editors ([N-5]). Verglichen wird strikt gegen exakt 0, damit
      // `null` (kein Mass) seine bestehende Behandlung behaelt.
      if (g.mass === 0) return;
      // Umgerechnet wurde die GEMEINSAME Geometrie schon oben (#59) — Werte, Bezuege,
      // Staffelung, `linie_mm` und `text_mm` stehen damit exakt wie im Editor ([N-5]),
      // und die Nummernblase hat GENAU diese Zahlen gemieden. Ein zweites Umrechnen
      // hier waere ein zweiter Rechenweg fuer dieselbe Darstellung.
      const p = massPapier[i].p;
      const streit = streitig.has(g.id);
      const farbe = streit ? FARBE.fehler : FARBE.mass;
      const t = massAnker(p, 0).anker;
      const dreh = g.achse === "y" ? ` transform="rotate(-90 ${_n(t.x)} ${_n(t.y)})"` : "";
      teile.push(`<g class="lpmass${streit ? " streit" : ""}${doppelt.has(g.id) ? " redundant" : ""}"`
        + ` data-bemassung="${_esc(g.id)}">`
        + `<path d="${massPfad(p, 1, _n)}" fill="none" stroke="${farbe}" stroke-width="0.16"`
        + (doppelt.has(g.id) && !streit ? ` stroke-dasharray="1.4 0.8"` : "") + `/>`
        + `<text x="${_n(t.x)}" y="${_n(t.y - MASSTEXT_MM)}" font-size="${MASSTEXT_FS_MM}"`
        + ` text-anchor="middle"`
        // Reine Millimeterzahl ohne Suffix (#64) — genau wie im Editor ([N-5]);
        // die Einheit steht einmal im Schriftfeld.
        + ` fill="${farbe}"${dreh}>${_esc(String(g.mass))}${streit ? " ⚠" : ""}</text></g>`);
    });
  }

  const inner = teile.join("");

  // ---- Ausgegebener Zeichenbereich (#59) ---------------------------------
  //
  // Erst JETZT steht fest, wie weit die Nummernblasen ausgewichen sind. Der Bereich
  // waechst um genau ihren gemessenen Ueberstand — und zwar AUSSCHLIESSLICH am
  // Wurzelelement: die viewBox bekommt einen negativen Ursprung, jede Zeichen-
  // koordinate in `inner` bleibt damit unangetastet. Wandlagen, Bemassungen,
  // Marker, Planhintergrund (samt seiner Klippung auf `breite_mm`/`hoehe_mm`) und
  // Schriftfeld behalten so ihre Lage, und ohne Ueberstand ist die Zeichenkette
  // bitgenau die bisherige.
  //
  // Was ausdruecklich NICHT geschieht: `ausdehnung()` und `waehleMasstab()` sehen
  // die Blasen nach wie vor nicht — der gewaehlte Massstab bleibt unveraendert. Ein
  // Rueckgriff waere zirkulaer (Massstab bestimmt die Blasenlage, die Blasenlage
  // bestimmte den Massstab).
  const rand = blasenRand(blasen, breite_mm, hoehe_mm);
  const voll_breite_mm = breite_mm + rand.links + rand.rechts;
  const voll_hoehe_mm = hoehe_mm + rand.oben + rand.unten;
  const vbX = rand.links ? -rand.links : 0, vbY = rand.oben ? -rand.oben : 0;

  // [N-8]: Passt es selbst im groebsten Massstab nicht, bleibt der Massstab in der
  // Reihe und das Blatt sagt es. Beschnitten oder gekachelt wird NICHTS — die
  // Zeichnung bleibt vollstaendig, auch wenn sie dann ueber das Feld hinausragt.
  // Geprueft wird die TATSAECHLICH ausgegebene Flaeche: ein zu breiter Blasenrand
  // laesst das Blatt die Zeichnung ebenso herunterskalieren wie ein zu grobes
  // Geschoss, und dann waere ein unkommentiertes „1 : x" im Schriftfeld unwahr.
  // Bewusst als Konjunktion: ohne Ueberstand ist das bitgenau der bisherige
  // Ausdruck, ohne jede Fliesskomma-Umformung.
  const passt = benoetigt <= masstab
    && (rand.links + rand.oben + rand.rechts + rand.unten === 0
      || (voll_breite_mm <= feld.w && voll_hoehe_mm <= feld.h));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${_n(vbX)} ${_n(vbY)}`
    + ` ${_n(voll_breite_mm)} ${_n(voll_hoehe_mm)}"`
    + ` width="${_n(voll_breite_mm)}mm" height="${_n(voll_hoehe_mm)}mm" class="lpdraw">`
    + `<rect x="${_n(vbX)}" y="${_n(vbY)}" width="${_n(voll_breite_mm)}"`
    + ` height="${_n(voll_hoehe_mm)}" fill="#ffffff"/>`
    + inner + `</svg>`;
  return { svg, inner, masstab, passt, breite_mm, hoehe_mm, benoetigt,
    rand, voll_breite_mm, voll_hoehe_mm };
}

// -------------------------------------------------------------- Blattbausteine

/** Titel des Blattes — Projekt, Gebaeude, Geschoss, Massstab. */
export function lageplanTitel(daten, masstab) {
  return `Lageplan ${daten.geschoss.name} · ${daten.gebaeude.name} · ${daten.projekt.name}`
    + ` — 1 : ${masstab}`;
}

/**
 * Der EINE Feldsatz des Zeichnungskopfs (#59) — neun Angaben in fester Reihenfolge,
 * mehr braucht es nicht, um einen Lageplan eindeutig zu identifizieren. Bauherrschaft,
 * Planverfasser, Phase, Zeichner und Blattformat stehen deshalb NICHT mehr auf dem
 * Blatt; sie bleiben in `mappe.projekt.kopfdaten` erhalten und erscheinen weiter im
 * Schriftfeld der Wandzeichnung (Modul 7). Der kuerzere Kopf gibt seine Hoehe an
 * Draufsicht und Wandliste zurueck (`.lpsheet` hat `grid-template-rows:1fr auto`).
 *
 * Diese Liste ist die gemeinsame Quelle von `schriftfeldHtml()` (Blatt) UND
 * `lageplanSvgDatei()` (eigenstaendige Datei): beide stellen GENAU sie dar, nur
 * verschieden. Es gibt keinen zweiten Feldsatz und keine zweite Datenquelle —
 * gelesen wird ausschliesslich `daten` aus `lageplanDaten()` (und damit
 * `mappe.projekt.kopfdaten`, [N-6]/[L-11]) und der uebergebene Massstab.
 *
 * @param {any} daten Ergebnis von `lageplanDaten` (`_passt` optional, s. `blattHtml`)
 * @param {number} masstab
 * @returns {Array<{k:string, v:string, warn?:boolean}>} leerer `v` = Feld bleibt leer
 */
export function kopfFelder(daten, masstab) {
  const k = daten.kopfdaten || {};
  return [
    { k: "Projekt", v: _leer(daten.projekt.name) },
    { k: "Gebäude", v: _leer(daten.gebaeude.name) },
    { k: "Geschoss", v: _leer(daten.geschoss.name) },
    { k: "Planinhalt", v: PLANINHALT },
    // Plan-Nr. und Index sind die einzigen OPTIONALEN Felder: fehlen sie, bleibt die
    // Zelle leer ([N-7] im Kleinen — nichts erfinden, auch keine Kennung).
    { k: "Plan Nr.", v: _leer(k.plan_nr) },
    { k: "Index", v: _leer(k.index) },
    { k: "Maßstab", v: `1 : ${masstab}${daten._passt === false ? " (Blatt zu klein)" : ""}` },
    // Die EINE Einheitenangabe der Ausgabe (#64): die Maßzahlen in der Zeichnung
    // sind reine Millimeterwerte und tragen deshalb kein Suffix.
    { k: "Einheit", v: "mm" },
    { k: "Stand", v: daten.vollstaendig ? "vollständig" : "nicht vollständig",
      warn: !daten.vollstaendig },
  ];
}

/**
 * Schriftfeld des Blattes — die HTML-Darstellung von `kopfFelder()`. Die Felder
 * stehen zu zweit in einer Spalte und damit in ZWEI statt drei Zeilen; genau daraus
 * entsteht die zurueckgewonnene Blattflaeche.
 *
 * `opts` bleibt Teil der Signatur (Aufruf aus `blattHtml`), wird aber nicht mehr
 * gebraucht: das Blattformat steht nicht mehr im Kopf.
 */
export function schriftfeldHtml(daten, masstab, opts) {          // eslint-disable-line no-unused-vars
  const felder = kopfFelder(daten, masstab);
  const row = (f) => `<div class="lptb-row"><div class="k">${_esc(f.k)}</div>`
    + `<div class="v${f.warn ? " warn" : ""}">${_esc(f.v)}</div></div>`;
  let spalten = "";
  for (let i = 0; i < felder.length; i += 2) {
    spalten += `<div class="col">${felder.slice(i, i + 2).map(row).join("")}</div>`;
  }
  return `<div class="lptitleblock">${spalten}</div>`;
}

/** Legende des Darstellungsschluessels. */
export function legendeHtml() {
  const i = (c, cls) => `<i class="${cls || ""}" style="background:${c}"></i>`;
  return `<div class="lplegende">`
    + `<span>${i(FARBE.wand, "plate")}Wand (125 mm breit)</span>`
    + `<span>${i(FARBE.mittellinie)}Mittellinie (Bezug, [K-2])</span>`
    // #84: Vorder-/Rueckkante — Kennbuchstabe UND Farbe, nie nur Farbe.
    + `<span>${i(SEITEN.vorder.farbe)}<b>V</b> ${SEITEN.vorder.name} der Wand</span>`
    + `<span>${i(SEITEN.rueck.farbe)}<b>R</b> ${SEITEN.rueck.name} der Wand</span>`
    // #79: Brandschutzklassifikation — beide Klassen benannt, und das
    // unterscheidende Merkmal steht IN WORTEN dabei, damit der Schluessel auch im
    // Schwarz-Weiss-Ausdruck traegt. Der Zusatz sagt, was die Angabe nicht ist.
    + `<span>${i(BRANDKLASSE.F0.farbe)}<b>${BRANDKLASSE.F0.kuerzel}</b> `
    + `${BRANDKLASSE.F0.name} — Wandfläche ${BRANDKLASSE.F0.merkmal}</span>`
    + `<span>${i(BRANDKLASSE.F30.farbe, "plate")}<b>${BRANDKLASSE.F30.kuerzel}</b> `
    + `${BRANDKLASSE.F30.name} — Wandfläche ${BRANDKLASSE.F30.merkmal} `
    + `(Planungskennzeichnung, kein Nachweis)</span>`
    + `<span>${i(FARBE.mass)}treibende Bemaßung ([K-3])</span>`
    // #59/#73: die Nummernblase ist eine reine Lesehilfe des Blattes und keine
    // Wandkennung — nachgeschlagen wird sie in der Wandliste.
    + `<span><b>1</b> Nummernblase der Wand — Name s. „Wände im Geschoss"</span>`
    + `<span>${i(FARBE.fehler, "plate")}Widerspruch / Kollision ([K-6]/[K-13])</span>`
    + `</div>`;
}

/**
 * Der Planhintergrund als Blattangabe (#80, [N-9]). Ist dem Geschoss gar kein Plan
 * hinterlegt, entsteht KEIN Kasten — dann gibt es nichts zu berichten, und das Blatt
 * bleibt bitgenau das bisherige. In allen anderen Faellen steht hier, ob der
 * Hintergrund gezeichnet ist, und wenn nicht, WARUM nicht.
 *
 * Das ist eine Angabe, kein Mangel: die Vollstaendigkeit ([N-7]) bleibt unberuehrt.
 * @param {any} daten @param {any} [opts] normalisierte Optionen (fuer die Transparenz)
 */
export function hintergrundHtml(daten, opts) {
  const hg = daten && daten.hintergrund ? daten.hintergrund : normHintergrund(null);
  if (hg.status === "keiner") return "";
  const o = normOptionen(opts);
  const gezeigt = hg.status === "gesetzt" && o.transparenz < 100;
  const zusatz = hg.status !== "gesetzt" ? ""
    : gezeigt
      ? ` Dargestellt mit ${_fmt(o.transparenz)} % Transparenz${hg.name ? ` (${_esc(hg.name)})` : ""}.`
      : " Die Transparenz steht auf 100 % — der Hintergrund ist deshalb ausgeblendet.";
  return `<div class="lpbox"><h4>Planhintergrund</h4>`
    + `<p class="lpbg-info">${_esc(hg.text)}${zusatz}</p></div>`;
}

/**
 * Wandtabelle: Nummer, Name, Länge, Höhe, Wandtyp, Brandschutz, Bestimmtheit.
 *
 * Die Nummer der ersten Spalte ist GENAU die, die in der Draufsicht in der
 * Nummernblase der Wand steht (#59/#73) — die Tabelle ist damit der Schluessel von
 * der kurzen Zahl im Plan zum vollstaendigen Wandnamen. Unverortete und verwaiste Eintraege stehen
 * weiter mit ihrer Nummer in der Liste; es wird keine Lage und keine Ersatzkennung
 * erfunden ([L-4]/[N-7]).
 *
 * Die Spalte „Brandschutz" (#79) nennt die Klassifikation als Text — damit steht sie
 * auch dort, wo die Zeichnung klein ist, und ein verwaister Eintrag bleibt sichtbar
 * OHNE Angabe („–"), statt still als F0 zu erscheinen.
 */
export function wandTabelleHtml(daten) {
  const typ = (t) => (t === "ohne_wind" ? "ohne Wind" : t === "mit_wind" ? "mit Wind" : "–");
  const brand = (b) => (b && BRANDKLASSE[b] ? BRANDKLASSE[b].kuerzel : "–");
  const best = (b) => (b.x && b.y ? "x/y" : b.x ? "nur x" : b.y ? "nur y" : "frei");
  const zeilen = daten.waende.map((w) => `<tr><td class="nr">${_esc(w.nr)}</td>`
    + `<td>${_esc(w.name)}</td>`
    + `<td class="r">${w.laenge_mm == null ? "–" : _fmt(w.laenge_mm) + " mm"}</td>`
    + `<td class="r">${w.hoehe_mm == null ? "–" : _fmt(w.hoehe_mm) + " mm"}</td>`
    + `<td>${_esc(typ(w.wandtyp))}</td>`
    + `<td>${_esc(brand(w.brandklasse))}</td>`
    + `<td>${w.rechteck ? _esc(best(w.bestimmt)) : "unverortet"}</td></tr>`).join("");
  return `<table class="lptab"><thead><tr><th class="nr">Nr.</th><th>Wand</th>`
    + `<th class="r">Länge</th>`
    + `<th class="r">Höhe</th><th>Wandtyp</th><th>Brandschutz</th><th>Lage</th></tr></thead>`
    + `<tbody>${zeilen || '<tr><td colspan="7">keine Wand eingetragen</td></tr>'}</tbody></table>`;
}

/**
 * Das komplette Lageplanblatt als HTML-Baustein. Vorschau (Modul 9) und Export
 * nutzen GENAU diese Funktion — es gibt keine zweite Blatt-/Zeichenlogik (Muss 9).
 *
 * @param {any} daten @param {any} [opts]
 * @returns {{html:string, svg:string, masstab:number, passt:boolean, benoetigt:number,
 *            format:string, optionen:any}}
 */
export function blattHtml(daten, opts) {
  const o = normOptionen(opts);
  const z = lageplanSvg(daten, o);
  const mit = { ...daten, _passt: z.passt };
  const html = `<div class="lpsheet fmt-${o.format}${o.wasserzeichen ? " wm" : ""}">`
    + (o.wasserzeichen ? `<div class="lpwm"><span>Vorabzug</span></div>` : "")
    + `<div class="lpdrawbox"><div class="lpcap">${_esc(lageplanTitel(daten, z.masstab))}</div>`
    // Zwei GETRENNTE Gruende, warum die Zeichnung nicht ins Feld passt — sie haben
    // verschiedene Auswege und deshalb verschiedene Texte. Der Massstabsfall steht
    // unveraendert; der zweite kommt mit #59 dazu: der Massstab reicht, aber die
    // ausgewichenen Nummernblasen brauchen mehr Rand, als das Feld hergibt. Ein
    // gemeinsamer Text behauptete ein zu grosses Geschoss, das es nicht gibt.
    + (z.passt ? "" : z.benoetigt > z.masstab
      ? `<div class="lpzugross">Das Geschoss ist für dieses Blatt <b>zu groß</b>: `
      + `selbst 1 : ${MASSSTAEBE[MASSSTAEBE.length - 1]} genügt nicht `
      + `(benötigt wären 1 : ${Math.ceil(z.benoetigt)}). Die Zeichnung bleibt vollständig und wird `
      + `weder beschnitten noch gekachelt — der Ausdruck ist dann aber <b>nicht maßstabsgetreu</b>. `
      + `Größeres Blattformat wählen oder das Geschoss fachlich teilen ([N-8]).</div>`
      : `<div class="lpzugross">Der Maßstab 1 : ${z.masstab} passt, aber die ausgewichenen `
      + `<b>Nummernblasen</b> brauchen mehr Zeichnungsrand, als dieses Blattfeld hergibt `
      + `(${_fmt(z.voll_breite_mm, 1)} × ${_fmt(z.voll_hoehe_mm, 1)} mm bei einem Feld von `
      + `${_fmt((BLATT[o.format] || BLATT.a3).feld_mm.w)} × `
      + `${_fmt((BLATT[o.format] || BLATT.a3).feld_mm.h)} mm). Jede Blase bleibt vollständig `
      + `sichtbar und wird nicht beschnitten — der Ausdruck ist dann aber <b>nicht `
      + `maßstabsgetreu</b>. Größeres Blattformat wählen ([N-8]).</div>`)
    + `<div class="lpsvg">${z.svg}</div></div>`
    + `<aside class="lpside">`
    + `<div class="lpbox"><h4>Wände im Geschoss</h4>${wandTabelleHtml(daten)}</div>`
    + `<div class="lpbox"><h4>Darstellung</h4>${legendeHtml()}</div>`
    // #80/[N-9]: nur vorhanden, wenn dem Geschoss ein Plan hinterlegt ist — sonst
    // waere es ein Kasten ueber eine Sache, die es nicht gibt.
    + hintergrundHtml(daten, o)
    // Der fruehere Block „Vollstaendigkeit" ist mit #73 ersatzlos entfallen: das
    // Blatt ist Ausfuehrungsunterlage, keine Pruefliste. [N-7] bleibt gewahrt —
    // das Schriftfeld weist den Stand aus, und `daten.meldungen`/`hinweise` stehen
    // Aufrufern (Modul-9-Seitenleiste) unveraendert zur Verfuegung.
    + `</aside>`
    + schriftfeldHtml(mit, z.masstab, o)
    + `</div>`;
  // `benoetigt` reist mit, damit ein Aufrufer die beiden Gruende eines `passt: false`
  // unterscheiden kann, ohne die Zeichnung ein zweites Mal abzuleiten (#59).
  return { html, svg: z.svg, masstab: z.masstab, passt: z.passt, benoetigt: z.benoetigt,
    format: o.format, optionen: o };
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
  table.lptab td.nr,table.lptab th.nr{width:20px;text-align:right;padding-right:5px;
                                      font-variant-numeric:tabular-nums}
  table.lptab td.nr{font-weight:700;color:#1c2430}
  /* #80: Angabe zum Planhintergrund — nur vorhanden, wenn ein Plan hinterlegt ist. */
  .lpbg-info{margin:0;font-size:10px;line-height:1.45;color:#4a5663}
  .lplegende{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:10px}
  .lplegende span{display:flex;align-items:center;gap:4px}
  .lplegende i{width:14px;height:4px;border-radius:2px;display:inline-block}
  .lplegende i.plate{height:9px;width:11px}
  /* Fuenf Spalten zu je zwei Feldern (#59): der Kopf ist damit ZWEI statt drei Zeilen
     hoch, und die gewonnene Hoehe faellt ueber grid-template-rows:1fr auto an
     Draufsicht und Wandliste. Der Wert bricht bei Bedarf um — abgeschnitten wird
     nichts, ein halber Projektname waere schlimmer als eine dritte Zeile. */
  .lptitleblock{grid-column:1 / span 2;grid-row:2;display:grid;
                grid-template-columns:1.5fr 1.2fr 1fr 1fr .9fr;border:1.5px solid #13202e;
                border-radius:3px;overflow:hidden;font-size:11px}
  .lptitleblock .col{border-right:1px solid #cfd5db;min-width:0}
  .lptitleblock .col:last-child{border-right:none}
  .lptb-row{display:grid;grid-template-columns:70px 1fr;border-bottom:1px solid #e3e7ec}
  .lptb-row:last-child{border-bottom:none}
  .lptb-row .k{background:#f4f6f8;color:#6b7682;font-size:9.5px;text-transform:uppercase;
               letter-spacing:.3px;padding:4px 6px;border-right:1px solid #e3e7ec;
               display:flex;align-items:center}
  .lptb-row .v{padding:4px 6px;font-weight:600;display:flex;align-items:center;
               min-width:0;overflow-wrap:anywhere}
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
  const titel = lageplanTitel(daten, z.masstab);
  // GENAU derselbe Feldsatz wie im Schriftfeld des Blattes (#59) — dieselbe Funktion,
  // dieselbe Reihenfolge, dieselbe Quelle. Die Datei stellt ihn nur als Textzeile statt
  // als Tabelle dar; ein zweiter Kopf oder ein zweiter Renderer entsteht dabei nicht.
  // `_passt` wird wie in `blattHtml()` aufgesetzt, damit „(Blatt zu klein)" hier ebenso
  // am Massstab steht. Leere Felder fallen weg — kein Platzhalter.
  const felder = kopfFelder({ ...daten, _passt: z.passt }, z.masstab);
  const stuecke = felder.filter((f) => f.v !== "").map((f) => `${f.k}: ${f.v}`);
  // Nur die Anzahl — die Einzelmeldungen stehen seit #73 nicht mehr auf dem Blatt,
  // ein Verweis „s. Blatt" waere also falsch. Nachgesehen wird in Modul 9 selbst.
  if (!daten.vollstaendig) stuecke.push(`${daten.meldungen.length} Punkt(e) offen`);

  // Die Fusszeile wird deterministisch nach GESCHAETZTER Breite umgebrochen
  // (Zeichenbreite ~ 0,5 · Schriftgroesse), damit sie auch bei einem schmalen Geschoss
  // im Blatt bleibt: abgeschnitten wird nichts, die Datei waechst stattdessen um die
  // noetigen Zeilen. Der Massstab der Zeichnung bleibt davon unberuehrt.
  // Gerechnet wird mit der AUSGEGEBENEN Breite (#59) — sie schliesst den Rand der
  // ausgewichenen Nummernblasen ein und ist ohne Ueberstand bitgenau `breite_mm`.
  const FS = 2, RAND = 3, ZEILE = FS + 0.6;
  const proZeile = Math.max(24, Math.floor((z.voll_breite_mm - 2 * RAND) / (FS * 0.5)));
  /** @type {string[]} */
  const zeilen = [];
  for (const s of stuecke) {
    const i = zeilen.length - 1;
    if (i >= 0 && (zeilen[i] + " · " + s).length <= proZeile) zeilen[i] += " · " + s;
    else zeilen.push(s);
  }
  // Die Datei zeichnet in einem bei 0/0 beginnenden Blatt und schiebt die Zeichnung
  // per `translate` unter die Kopfzeile. Der Blasenrand (#59) waechst deshalb hier
  // in die Blattmasse UND in die Verschiebung — sonst liefe eine nach links oder
  // oben ausgewichene Blase aus der Datei heraus oder in die Kopfzeile hinein. Ohne
  // Ueberstand sind beide Summanden 0 und die Datei ist bitgenau die bisherige.
  const vbW = z.voll_breite_mm;
  const vbH = z.voll_hoehe_mm + kopf + 4 + Math.max(0, zeilen.length - 1) * ZEILE;
  // `class="lpkopf"` macht die Kopfangaben unterscheidbar von der Massbeschriftung der
  // Zeichnung (gleiche Schriftgroesse) — fuer Leser der Datei wie fuer den Test.
  const fuss = zeilen.map((s, i) =>
    `<text class="lpkopf" x="${RAND}" y="${_n(vbH - 1.4 - (zeilen.length - 1 - i) * ZEILE)}"`
    + ` font-size="${FS}" font-family="sans-serif" fill="${FARBE.mass}">${_esc(s)}</text>\n`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${_n(vbW)} ${_n(vbH)}" `
    + `width="${_n(vbW)}mm" height="${_n(vbH)}mm">\n`
    + `<title>${_esc(titel)}</title>\n`
    + `<rect x="0" y="0" width="${_n(vbW)}" height="${_n(vbH)}" fill="#ffffff"/>\n`
    + `<text x="${RAND}" y="4" font-size="2.8" font-family="sans-serif" fill="${FARBE.wand_rand}">`
    + `${_esc(titel)}</text>\n`
    + fuss
    + `<g transform="translate(${_n(z.rand.links)} ${_n(kopf + z.rand.oben)})">${z.inner}</g>\n`
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
