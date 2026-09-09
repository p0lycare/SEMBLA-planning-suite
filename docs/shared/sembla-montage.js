// @ts-check
/**
 * SEMBLA Montage — ereignis-/baugruppenbasierte Ableitung der Montageanleitung.
 *
 * Gliedert den Wandaufbau nicht mehr lagenweise, sondern nach den tatsaechlichen
 * Montageereignissen (erste Gewindestange, Kopplung/neue Stange, oberer Abschluss)
 * und den dazugehoerigen, durchgehend nummerierten Steinreihen.
 *
 * Voran steht der steinfreie **Schnitt 0** ([A-9]): nur Bodenblech/Grundplatte und
 * die ersten Gewindestangen. Er ist rein additiv — die Fussereignisse bleiben
 * zusaetzlich in ihrem regulaeren Abschnitt, es wird nichts verschoben. Alle
 * Baugruppenbilder nutzen denselben globalen Massstab (`abschnitt.z_top_mm`), damit
 * die Darstellung mit fortschreitendem Montagestand nicht waechst oder schrumpft.
 *
 * Quelle ist AUSSCHLIESSLICH das Wandelement (Single Source of Truth):
 *   * `tension_columns[].segments[]` — je Strang die realen Segmente mit
 *     `z0_mm/z1_mm`, `gewindestangen`, `anker_unten`, `anker_oben`,
 *   * `courses[].stones` + `steps` — Steinreihen und Wandkontur.
 * Es wird NIE aus einer globalen/pauschalen Stangenhoehe oder aus einem
 * Repraesentanten-Strang hochgerechnet: Straenge duerfen unterschiedlich viele
 * Stangen und unterschiedliche Endhoehen haben (gestaffelte Waende).
 *
 * Kopplungshoehen innerhalb eines Segments liegen bei `z0_mm + j·rod_mm`
 * (Vollstangen zuerst, Reststange oben) — genau die Arithmetik, aus der der Core
 * `letzte_stange_mm = h − (stueck−1)·rod_mm` bildet. Der Core wird dafuer nicht
 * geaendert; hier wird nur gelesen.
 *
 * Eigene Datei (shared/-Regel a+b): genutzt von Modul 5 (Vorschau/Druck) UND vom
 * zentralen Export (`sembla-export.js`), mit eigenen Tests
 * (`tests/module/test-montage.mjs`). Rein/DOM-frei: die Funktionen liefern Daten
 * bzw. SVG-/HTML-Zeichenketten, greifen aber nie auf `document`/`window` zu.
 *
 * Einheiten: mm (intern), Ausgabe in cm/m (Labels).
 */

import { semblaBomItems, semblaBomMenge } from "./sembla-bom.js";

const COURSE_FALLBACK = 200;
const GRID_FALLBACK = 125;
const ROD_FALLBACK = 1100;

/** Sichtbarer Stangenueberstand ueber die letzte dargestellte Steinreihe (mm). */
export const UEBERSTAND_MM = 80;

/**
 * Farbschluessel der Stangenstuecke ([D-4]) — EINE Quelle fuer alle Ausgaben, die den
 * Zuschnitt zeigen: Modul 1 (Wandansicht), Modul 5 (Baugruppenbilder) und Modul 7
 * (technische Zeichnung). Er liegt hier, weil dieselbe Datei schon die Stueckableitung
 * (`stangenEnden`/`stueckArt`) haelt — ein zweiter Farbschluessel waere Drift.
 */
export const STUECK_FARBE = { standard: "#1f6feb", sonder: "#e8702a", rest: "#7a3fd6" };

/** Klartext der Stueckarten — identisch in Wandansicht, Baugruppenbild und Zeichnungslegende. */
export const STUECK_LABEL = { standard: "Standardlänge", sonder: "Sonderzuschnitt", rest: "Reststück oben" };

/** Farbe einer Stueckart; unbekannt/fehlend gilt als Standardlaenge (nie eine erfundene Farbe). */
export function stueckFarbe(art) {
  return Object.prototype.hasOwnProperty.call(STUECK_FARBE, art) ? STUECK_FARBE[art] : STUECK_FARBE.standard;
}

/**
 * Darstellungsschluessel der BLECHSTOSSMARKE ([D-4], [A-11]/#91) — Kennfarbe und Klartext
 * der Marke, die zwei Bodenblechteile voneinander trennt.
 *
 * Er liegt hier neben `STUECK_FARBE`/`SPANN_FARBE`, weil dieselbe Datei schon die
 * Blechzerlegung liest (`bodenblechTeile`/`bodenblechStoesse`) und die Marke zeichnet
 * (`bodenblechSvg`): Blatt und Legende muessen dieselbe Farbe zeigen, und ein Hex-Wert
 * unmittelbar in der Zeichenzeile waere genau die Drift, die [D-4] ausschliesst.
 *
 * WEISS, weil die Marke IM stahlfarbenen Blechstreifen liegt (#91): die frueher benutzte
 * Konturfarbe las sich dort wie ein eigenes Bauteil unter dem Blech.
 */
export const BLECHSTOSS = { farbe: "#fff", label: "Blechstoß" };

/**
 * Darstellungsschluessel der Spannkomponenten ([D-4], #110/#106) — Kennfarben und Symbolmasse
 * der Schrauben, Muttern, Kopplungsmuttern und Spannplatten.
 *
 * Er liegt hier, weil dieselbe Datei schon den Zuschnittschluessel (`STUECK_FARBE`), den
 * Zwischenpunkt (`ZWISCHENPUNKT`) und das Bodenblech (`bodenblechSvg`) fuehrt: die
 * Zeichengeometrie desselben Bauteils muss in Wandansicht (Modul 1) und technischer Zeichnung
 * (Modul 7) gleich aussehen, ein modul-eigener Schluessel waere genau die Drift, die [D-4]
 * ausschliesst. Die WERTE der Farben sind unveraendert die bisherigen.
 */
export const SPANN_FARBE = { platte: "#14559c", mutter: "#0b3a73" };

/**
 * Symbolmasse der Spannkomponenten in PAPIER-MM — FEST, unabhaengig von Wandgroesse,
 * Blattmasstab und Zoom (#106).
 *
 * WARUM NICHT MEHR "Vielfache der Lagenhoehe" (#110): die Lagenhoehe in Zeichenkoordinaten
 * haengt in BEIDEN Ausgaben an der Wandgroesse. Modul 1 rechnet `sc = (1000-2*pad)/L`, der
 * Maszstab folgt also allein der WANDLAENGE; Modul 7 waehlt mit `waehleMasstab(L,H,format)`
 * den Blattmasstab nach Wandlaenge und -hoehe. Eine 2-m-Wand bekam damit rund vierfach
 * groessere Muttern als eine 8-m-Wand — dasselbe Bauteil in derselben Ansicht in
 * verschiedenen Groessen. #110 wollte Zoom-Unabhaengigkeit erreichen und hat dafuer
 * Wandgroessen-ABHAENGIGKEIT eingebaut.
 *
 * Fest in Papier-mm ist deshalb der Massstab dieser Symbole. Das ist KEINE neue Konvention,
 * sondern genau die, mit der beide Module ihre Strichstaerken und Schriftgroessen schon immer
 * fuehren (`SW = 0.22` in Modul 7, `font-size` in viewBox-Einheiten in Modul 1): ein Symbol
 * ist eine Darstellungsmarke und kein gemessenes Bauteil. Bewusst KEINE Bauteilmasse: fuer die
 * normale Mutter kommt die Einbauhoehe aus dem Katalog ([A-19]/[Z-8]) und darf nicht aus einem
 * Symbol zurueckgelesen werden.
 *
 * Masstabstreu sind allein die Masse, die der Aufrufer als REALES Bauteilmass hereingibt: die
 * BREITE der Spannplatte (110 mm, `platte_b_mm`), seit #97 ihre DICKE sowie HOEHE und
 * DURCHMESSER (Schluesselweite) der Kopplungsmutter. Fuer die drei Letzteren bleiben
 * `platte_h`, `kupplung_h` und `d` der Rueckfall, wenn das Mass fehlt; erfunden wird nie eines.
 */
export const SPANN_MM = {
  mutter_h: 1.8,       // Hoehe der normalen Mutter / Spannmutter
  kupplung_h: 4.5,     // Symbolhoehe der Kopplungsmutter, wenn das reale Mass fehlt (#97)
  d: 2.4,              // Durchmesser der Mutter; Rueckfall der Kopplungsmutter ohne SW (#97)
  kopf_h: 1.6,         // Hoehe des Schraubenkopfs
  kopf_d: 3.4,         // Durchmesser des Schraubenkopfs (groesser als der Schaft)
  schaft_d: 1.4,       // Durchmesser des Schraubenschafts
  platte_h: 1.2,       // Dicke der Spannplatte
  platte_b_mm: 110,    // Breite der Spannplatte in mm (BAUTEILMASS, masstabstreu)
  platte_b_min: 3.2,   // Sichtbarkeitsuntergrenze der Plattenbreite (Symbolmass)
  blech_b: 4.4,        // Balkenbreite des Einlegeblechs ([A-14])
  blech_schenkel: 1.6, // Schenkellaenge des Einlegeblechs
  dc_schenkel: 3.6,    // Schenkellaenge je Winkel des Deckenanschlusses ([P-24])
  dc_h: 4.0,           // Hoehe des Z ueber der Wandoberkante (Winkelstoss bis Decke)
  dc_versatz: 1.6,     // Versatz des senkrechten Z-Zuges nach LINKS neben die Spannachse (#97)
  strich: 0.40,        // Strichstaerke offener Profile
};

/**
 * ZEICHENKOORDINATEN JE PAPIER-MM — die eine Stelle, an der die beiden Einheitensysteme
 * aufeinandertreffen ([D-4], #106).
 *
 * `blatt`: Modul 7 rechnet unmittelbar in Papier-mm ([D-2]), der Faktor ist 1.
 * `ansicht`: Modul 1 rechnet in viewBox-Einheiten seines FESTEN Ansichtsmasstabs (#106): eine
 * Lage ist dort immer 60 Einheiten hoch. Der Faktor 5 macht daraus die Symbolgroessen
 * Mutter 9, Kopplungsmutter 22,5 und Zylinderdurchmesser 12 Einheiten — also 15 %, 37,5 %
 * und 20 % der LAGENHOEHE. Weil der Masstab der Ansicht fest ist, ist ein festes Zeichenmass
 * dort GLEICHBEDEUTEND mit einem konstanten Verhaeltnis zum Stein; die Symbole brauchen dafuer
 * keine eigene Rechnung. (Vor #106 hing der Ansichtsmasstab an der Wandlaenge — dann war
 * genau das nicht gleichbedeutend, und keine Wahl am Symbol konnte beides erfuellen.)
 */
export const SPANN_EINHEIT = { blatt: 1, ansicht: 5 };

/**
 * Vereinfachte Seitenansicht eines Zylinders (Mutter/Kopplungsmutter) — EIN Zeichenweg fuer
 * Wandansicht und Zeichnung ([D-4], #110/#106).
 *
 * Gezeichnet wird ein kantiger, gefuellter Koerper OHNE ueberstehende Stirnkanten. Die
 * ueberstehenden Kantenlinien aus #110 sind ersatzlos entfallen: sie sollten den Zylinder
 * andeuten, lasen sich in beiden Ausgaben aber als Serifen am Bauteil und machten die Mutter
 * breiter als sie ist. Kreis und Sechseck entfallen weiterhin ausdruecklich — ein Kreis liest
 * sich nicht als Mutter, und zwei Kreise unterscheiden Mutter und Kopplungsmutter nicht.
 *
 * @param {number} x Zeichenkoordinate der Spannachse
 * @param {number} y Zeichenkoordinate der Einbauhoehe (Mitte; mit `opts.auf` die UNTERKANTE)
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {number} hMm Hoehe des Koerpers in Papier-mm
 * @param {number} dMm Durchmesser des Koerpers in Papier-mm
 * @param {{n?:(v:number)=>any,farbe?:string,klasse?:string,auf?:boolean}} [opts]
 *        `auf`: das Bauteil SITZT AUF `y` (Unterkante), statt darauf zentriert zu sein.
 * @returns {string} SVG-Fragment
 */
function _zylinderSvg(x, y, e, hMm, dMm, opts = {}) {
  return _zylinderSvgZ(x, y, hMm * e, dMm * e, opts);
}

/**
 * Derselbe Koerper, aber mit Hoehe und Durchmesser bereits in ZEICHENKOORDINATEN — die eine
 * Stelle, an der das Rechteck entsteht.
 *
 * Gebraucht wird die Variante, seit die Kopplungsmutter ihre Hoehe wahlweise aus dem realen
 * Bauteilmass bezieht (#97): dort ist die Hoehe `hoehe_mm * sc` und laesst sich nicht mehr als
 * Papier-mm ausdruecken, ohne durch `e` zu teilen. Fuer den Symbolzweig aendert sich nichts —
 * `hMm * e` steht unveraendert an derselben Stelle wie zuvor.
 *
 * @param {number} x @param {number} y @param {number} h Hoehe @param {number} b Durchmesser
 * @param {{n?:(v:number)=>any,farbe?:string,klasse?:string,auf?:boolean}} [opts]
 * @returns {string} SVG-Fragment
 */
function _zylinderSvgZ(x, y, h, b, opts = {}) {
  const n = opts.n || (v => v);
  const farbe = opts.farbe || SPANN_FARBE.mutter;
  const kl = opts.klasse ? ` class="${opts.klasse}"` : "";
  const yo = opts.auf ? y - h : y - h / 2;
  return `<rect${kl} x="${n(x - b / 2)}" y="${n(yo)}" width="${n(b)}" height="${n(h)}" `
    + `fill="${farbe}"/>`;
}

/**
 * Normale Mutter / Spannmutter als kurzer Zylinder in Seitenansicht ([D-4], #110/#106).
 * @param {number} x @param {number} y Einbauhoehe (Mitte; mit `opts.auf` die Unterkante)
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {{n?:(v:number)=>any,farbe?:string,klasse?:string,auf?:boolean}} [opts]
 * @returns {string} SVG-Fragment
 */
export function mutterSvg(x, y, e, opts = {}) {
  return _zylinderSvg(x, y, e, SPANN_MM.mutter_h, SPANN_MM.d, opts);
}

/**
 * Kopplungsmutter als DEUTLICH laengerer Zylinder in Seitenansicht ([D-4], #110/#106/#97) —
 * dieselbe Grundform wie `mutterSvg`, nur die Hoehe unterscheidet sich.
 *
 * Seit #97 ist die HOEHE masstabsgetreu, sobald der Aufrufer das reale Bauteilmass als
 * `opts.hoehe_mm` samt `opts.sc` hereingibt: sie ist dann `hoehe_mm * sc` und laesst sich im
 * Blatt abmessen. Das Mass ist KEIN neues Feld — es ist die doppelte Einbaulage, die seit #92
 * als `prestress.rod_fuss_offset_mm` (halbe Kopplungsmutterhoehe, [A-19]) im Wandelement steht;
 * hier wird sie nur gezeichnet und nichts daraus abgeleitet. OHNE das Mass bleibt es beim
 * bisherigen festen Symbolmass `SPANN_MM.kupplung_h` — es wird keine Hoehe erfunden und keine
 * nachgerechnet, und das Ergebnis ist dann wertgleich zum Stand vor #97. Bis dahin war die
 * Hoehe IMMER symbolisch: dieselbe Marke fuer eine 30-mm- wie fuer eine 45-mm-Mutter.
 *
 * Der Weg ist bewusst derselbe wie bei der Spannplattendicke (s. `spannplatteSvg`): gleicher
 * Optionsschalter, gleicher Rueckfall, und ausdruecklich KEINE Untergrenze auf dem
 * masstabsgetreuen Zweig — eine kurze Mutter in kleinem Masstab IST kurz, und eine Untergrenze
 * waere ein zweites, verstecktes Mass, das dem abgemessenen Wert widerspraeche. Nur ein nicht
 * zeichenbares Ergebnis faellt auf das Symbolmass zurueck; die Mutter entfaellt nie.
 *
 * Seit dem Folgepaket zu #97 gilt dasselbe fuer den DURCHMESSER, sobald der Aufrufer die reale
 * SCHLUESSELWEITE als `opts.sw_mm` hereingibt (s. `kupplungDurchmesser`) — gleicher
 * Optionsschalter, gleiches `sc`, gleicher Rueckfall auf `SPANN_MM.d`. Bis dahin war die Breite
 * IMMER symbolisch: dieselbe Marke fuer eine SW-17- wie fuer eine SW-24-Mutter, und weil das
 * Symbolmass grosszuegig gewaehlt ist, war sie deutlich zu breit.
 *
 * @param {number} x @param {number} y Stosshoehe (Mitte; mit `opts.auf` die Unterkante)
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {{n?:(v:number)=>any,farbe?:string,klasse?:string,auf?:boolean,
 *          hoehe_mm?:number,sw_mm?:number,sc?:number}} [opts]
 *        `hoehe_mm`/`sc`: reale Einbauhoehe in mm und Zeichenkoordinaten je mm (#97).
 *        `sw_mm`: reale Schluesselweite in mm (#97) — masstabsgetreu statt Symbolmass.
 * @returns {string} SVG-Fragment
 */
export function kopplungsmutterSvg(x, y, e, opts = {}) {
  return _zylinderSvgZ(x, y, kupplungHoehe(e, opts), kupplungDurchmesser(e, opts), opts);
}

/**
 * Zeichenbreite der Kopplungsmutter — die EINE Stelle, an der ueber reale Schluesselweite und
 * Symbolmass entschieden wird ([D-4], #97).
 *
 * Sie liegt hier und nicht bei den Aufrufern, weil zwei Zeichnungen davon abhaengen: die Mutter
 * selbst und die weisse Stoss-Haarlinie nach #112, die ihre Breite mit einem festen Faktor aus
 * genau diesem Durchmesser ableitet. Zwei getrennte Rechnungen waeren die Drift, die [D-4]
 * ausschliesst.
 *
 * Die Schluesselweite ist KEIN neues Feld — sie steht als `prestress.kupplung_sw_mm` am
 * Wandelement, abgeleitet beim Auslegen aus dem gewaehlten Katalogprodukt; hier wird sie nur
 * gezeichnet und nichts daraus abgeleitet. OHNE das Mass bleibt es beim festen Symbolmass
 * `SPANN_MM.d`, und das Ergebnis ist dann bit-gleich zum Stand davor.
 *
 * Ausdruecklich KEINE Untergrenze auf dem masstabsgetreuen Zweig (Entscheid zu #97, wie bei
 * Plattendicke und Mutternhoehe): eine schmale Mutter in kleinem Masstab IST schmal. Bei
 * SW 17 und 1:100 sind das 0,17 Papier-mm — schmaler als die Gewindestangenlinie. Das ist
 * gewollt; eine Untergrenze waere ein zweites, verstecktes Mass, das dem abgemessenen Wert
 * widerspraeche. Nur ein nicht zeichenbares Ergebnis faellt zurueck; die Mutter entfaellt nie.
 *
 * Geprueft wird das ZEICHENERGEBNIS und nicht nur die Eingabe: nur ein Wert > 0 darf die Mutter
 * tragen, damit sie nie zu einer Breite von 0 zusammenfaellt.
 *
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {{sw_mm?:number,sc?:number}} [opts]
 * @returns {number} Durchmesser in Zeichenkoordinaten
 */
export function kupplungDurchmesser(e, opts = {}) {
  const swMm = +opts.sw_mm, sc = +opts.sc;
  const bMass = (isFinite(swMm) && swMm > 0 && isFinite(sc) && sc > 0) ? swMm * sc : 0;
  return bMass > 0 ? bMass : SPANN_MM.d * e;
}

/**
 * Zeichenhoehe der Kopplungsmutter — die EINE Stelle, an der ueber reales Mass und Symbolmass
 * entschieden wird ([D-4], #97).
 *
 * Sie liegt hier und nicht bei den Aufrufern, weil zwei Zeichnungen davon abhaengen: die Mutter
 * selbst und der Schaftbeginn der Sechskantschraube, der nach [A-19] ihre halbe Hoehe ist. Zwei
 * getrennte Rechnungen waeren die Drift, die [D-4] ausschliesst.
 *
 * Geprueft wird das ZEICHENERGEBNIS und nicht nur die Eingabe: nur ein Wert > 0 darf die Mutter
 * tragen, damit sie nie zu einer Hoehe von 0 zusammenfaellt.
 *
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {{hoehe_mm?:number,sc?:number}} [opts]
 * @returns {number} Hoehe in Zeichenkoordinaten
 */
export function kupplungHoehe(e, opts = {}) {
  const hMm = +opts.hoehe_mm, sc = +opts.sc;
  const hMass = (isFinite(hMm) && hMm > 0 && isFinite(sc) && sc > 0) ? hMm * sc : 0;
  return hMass > 0 ? hMass : SPANN_MM.kupplung_h * e;
}

/**
 * Sechskantschraube am Wandfuss als ZWEI Zylinder in Seitenansicht: Schaft und Kopf
 * ([A-19], #97).
 *
 * Die Bauteilfolge am Fuss ist von unten nach oben Schraubenkopf, Bodenblech,
 * Kopplungsmutter — der KOPF ragt unter dem Bodenblech frei heraus, die Kopplungsmutter
 * LIEGT AUF dem Blech, und Schraube und erste Gewindestange stecken je zur Haelfte in der
 * Mutter ([A-19]). Genau diese Folge zeichnet die Funktion: der Schaft beginnt in der MITTE
 * der aufsitzenden Kopplungsmutter, laeuft durch das Blech und endet an dessen Unterkante,
 * darunter sitzt der breitere Kopf. Bis #97 stand am Fuss eine normale Mutter, halb im
 * Bodenblech, und die Schraube fehlte ganz.
 *
 * Die Blechdicke ist ein ZEICHENMASS des Aufrufers (beide Module skalieren die 10 mm mit
 * ihrer eigenen Sichtbarkeitsuntergrenze) — sie wird hier nicht nachgerechnet.
 *
 * @param {number} x Zeichenkoordinate der Spannachse
 * @param {number} y Zeichenkoordinate der OBERKANTE Bodenblech (= Steinunterkante, z = 0)
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {number} blech Blechdicke in Zeichenkoordinaten
 * @param {{n?:(v:number)=>any,farbe?:string,klasse?:string,hoehe_mm?:number,sc?:number}} [opts]
 *        `hoehe_mm`/`sc`: reale Kopplungsmutterhoehe (#97) — sie bestimmt den Schaftbeginn.
 * @returns {string} SVG-Fragment (Schaft, dann Kopf)
 */
export function schraubeSvg(x, y, e, blech, opts = {}) {
  const n = opts.n || (v => v);
  const farbe = opts.farbe || SPANN_FARBE.mutter;
  const kl = opts.klasse ? ` class="${opts.klasse}"` : "";
  const kh = SPANN_MM.kopf_h * e, kd = SPANN_MM.kopf_d * e, sd = SPANN_MM.schaft_d * e;
  // Schaft: von der Mitte der aufsitzenden Kopplungsmutter ([A-19]: je zur Haelfte) durch das
  // Bodenblech bis an dessen Unterkante. Kopf: unmittelbar darunter, ragt frei heraus.
  //
  // #97: Der Schaftbeginn ist ein aus der Mutternhoehe ABGELEITETER Wert und kein eigenes
  // Bauteilmass der Schraube — er folgt deshalb derselben Entscheidung wie die Mutter und wird
  // ueber `kupplungHoehe()` aus derselben Quelle geholt. Ohne reales Mass bleibt er bit-gleich.
  // Die eigenen Symbolmasse der Schraube (`kopf_h`, `kopf_d`, `schaft_d`) sind unberuehrt.
  const y0 = y - kupplungHoehe(e, opts) / 2, y1 = y + blech;
  return `<rect${kl} x="${n(x - sd / 2)}" y="${n(y0)}" width="${n(sd)}" `
    + `height="${n(y1 - y0)}" fill="${farbe}"/>`
    + `<rect${kl} x="${n(x - kd / 2)}" y="${n(y1)}" width="${n(kd)}" height="${n(kh)}" `
    + `fill="${farbe}"/>`;
}

/**
 * HOEHE der Spannplatte in Zeichenkoordinaten — die EINE Fassung dieser Regel ([D-4], #97).
 *
 * Sie liegt als eigener Baustein hier, seit ein zweiter Leser sie braucht: das Z des
 * Deckenanschlusses legt seinen unteren Schenkel auf die PLATTENOBERKANTE (#97) und muss
 * dieselbe Hoehe rechnen wie die Platte selbst. Zwei Fassungen derselben Regel waeren die
 * Drift, die [D-4]/[P-6] ausschliessen — der Schenkel schwebte oder saesse in der Platte,
 * sobald sich eine der beiden aendert.
 *
 * DICKE: das reale Bauteilmass, wenn der Aufrufer es kennt — sonst unveraendert das feste
 * Symbolmass. Geprueft wird das ZEICHENERGEBNIS und nicht nur die Eingabe: nur ein Wert
 * > 0 darf die Platte tragen, damit sie nie zu einer Hoehe von 0 zusammenfaellt.
 *
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {number} sc Zeichenkoordinaten je mm
 * @param {any} dickeMm reale Plattendicke in mm (`prestress.rod_kopf_zuschlag_mm`) oder fehlend
 * @returns {number} Hoehe in Zeichenkoordinaten
 */
function _plattenDicke(e, sc, dickeMm) {
  const dMm = +dickeMm;
  const hMass = (isFinite(dMm) && dMm > 0 && sc > 0) ? dMm * sc : 0;
  return hMass > 0 ? hMass : SPANN_MM.platte_h * e;
}

/**
 * Spannplatte MIT ihrer Spannmutter als Anschlusssymbol ([A-3]/[D-4], #110/#106/#97).
 *
 * Die Platte LIEGT AUF der Auflagerkante — immer, oben wie unten. Bis #106 zeichnete der
 * obere Anschluss sie von der Kante nach UNTEN und damit in die Wand hinein; das war falsch,
 * die obere Spannplatte liegt auf der Wandoberkante auf.
 *
 * Auf der Platte SITZT die SPANNMUTTER, und sie wird hier mitgezeichnet statt vom Aufrufer:
 * der Rechenkern zaehlt je Spannplatten-Anker zwingend genau eine Spannmutter
 * (`sembla-core.js`, `segSpannmutter++` gemeinsam mit `segSpannplatten++` — oben wie unten),
 * eine Platte OHNE Mutter ist also kein Zustand, den es gibt. Bis #97 fehlte sie in beiden
 * Ansichten, weil beide Aufrufer sie einzeln haetten zeichnen muessen; genau diese Trennung
 * war die Fehlerquelle. Die Stueckliste war davon nie betroffen — sie zaehlt aus dem
 * Rechenkern und nicht aus der Zeichnung.
 *
 * KEINE Unterlegscheibe: im normalen Wandabschluss gibt es sie am Spannglied nicht. Scheiben
 * treten allein am Deckenanschluss auf und kommen dort im Set des Deckenanschlusses mit
 * (Fachauskunft 2026-09-08). Die Stuecklistenposition „Unterlegscheibe (Wandabschluss)"
 * (#92, Menge je Spannplatte) widerspricht dem und ist als MENGENfrage offen — sie wird hier
 * ausdruecklich nicht nachgezeichnet, statt eine Scheibe zu zeigen, die es nicht gibt.
 *
 * Die BREITE ist ein Bauteilmass (`SPANN_MM.platte_b_mm` = 110 mm) und wird mit `sc`
 * masstabsgetreu umgerechnet — sie liegt als Auflagerflaeche entlang der Wand und kann
 * abgemessen werden.
 *
 * Seit #97 gilt dasselbe fuer die DICKE, sobald der Aufrufer sie als `opts.dicke_mm`
 * hereingibt: sie ist dann `dicke_mm * sc` und laesst sich im Blatt abmessen. Das Mass ist
 * KEIN neues Feld — es ist die Spannplattendicke, die seit #92 als
 * `prestress.rod_kopf_zuschlag_mm` im Wandelement steht; hier wird sie nur gezeichnet und
 * nichts daraus abgeleitet. OHNE das Mass bleibt es beim bisherigen festen Symbolmass
 * `SPANN_MM.platte_h` — es wird keine Dicke erfunden, und das Ergebnis ist dann wertgleich
 * zum Stand vor #97. Bis dahin war die Dicke IMMER symbolisch: dieselbe flache Marke fuer
 * eine 6-mm- wie fuer eine 15-mm-Platte, und wer nachmass, mass ein Symbol.
 *
 * Auf dem masstabsgetreuen Zweig gibt es ausdruecklich KEINE Untergrenze (Entscheid zu #97):
 * eine duenne Platte in kleinem Masstab IST duenn, und eine Untergrenze waere ein zweites,
 * verstecktes Mass, das dem abgemessenen Wert widerspraeche. Nur ein nicht zeichenbares
 * Ergebnis (`dicke_mm * sc` nicht > 0) faellt auf das Symbolmass zurueck — die Platte
 * entfaellt nie. Die BREITEN-Untergrenze unten bleibt davon unberuehrt; sie ist eine andere
 * Achse und loest ein anderes Problem (Verwechslung mit dem schmaleren Bauteil).
 *
 * Die Breite hat aber eine UNTERGRENZE im Symbolmass (`platte_b_min`, #106): bei kleinem
 * Blattmasstab wird die masstabstreue Breite kleiner als der feste Mutternzylinder, und die
 * Platte laese sich dann als das schmalere Bauteil lesen, das sie nicht ist. Die Untergrenze
 * greift erst weit unterhalb der Masstaebe, in denen man ein Bauteil abmisst; oberhalb bleibt
 * die Breite unveraendert masstabstreu. `opts.min` ueberschreibt sie (Aufrufer-Untergrenze).
 *
 * @param {number} x Zeichenkoordinate der Spannachse
 * @param {number} y Zeichenkoordinate der Auflagerkante
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {number} sc Zeichenkoordinaten je mm
 * @param {{n?:(v:number)=>any,farbe?:string,klasse?:string,min?:number,dicke_mm?:number}} [opts]
 *        `dicke_mm`: reale Plattendicke in mm (#97) — masstabsgetreu statt Symbolmass.
 * @returns {string} SVG-Fragment
 */
export function spannplatteSvg(x, y, e, sc, opts = {}) {
  const n = opts.n || (v => v);
  // DICKE aus dem einen Baustein (s. `_plattenDicke`) — wertgleich zum Stand davor.
  const h = _plattenDicke(e, sc, opts.dicke_mm);
  const b = Math.max(opts.min != null ? opts.min : SPANN_MM.platte_b_min * e,
    SPANN_MM.platte_b_mm * sc);
  const farbe = opts.farbe || SPANN_FARBE.platte;
  const kl = opts.klasse ? ` class="${opts.klasse}"` : "";
  // Platte zuerst, dann die aufsitzende Spannmutter auf ihrer Oberkante (`y - h`).
  return `<rect${kl} x="${n(x - b / 2)}" y="${n(y - h)}" `
    + `width="${n(b)}" height="${n(h)}" fill="${farbe}"/>`
    + mutterSvg(x, y - h, e, { n: opts.n, klasse: opts.klasse, auf: true,
      farbe: opts.mutter_farbe || SPANN_FARBE.mutter });
}

/**
 * Darstellungsschluessel des Zwischenspannpunkts ([A-14], #93) — Kennfarbe und Klartext.
 *
 * Er liegt hier und nicht im Modul, weil die Zeichengeometrie desselben Bauteils in mehreren
 * Ausgaben gleich aussehen muss ([D-4]); ein modul-eigener Schluessel waere Drift. Die Farbe
 * ist bewusst KEINE der Zuschnittfarben (`STUECK_FARBE`) und keine der Anschlussfarben
 * (`FARBE.platte`/`FARBE.mutter`): das Einlegeblech ist ein eigenes Bauteil und darf mit
 * Stangenstueck, Spannplatte ([A-3]) und Mutter nicht verwechselt werden.
 */
export const ZWISCHENPUNKT = { farbe: "#0a7d6b", label: "Einlegeblech (Zwischenspannpunkt)" };

/**
 * Symbol eines Zwischenspannpunkts: nach unten geoeffnetes eckiges C-Profil auf der
 * Lagen-Oberkante ([A-14]).
 *
 * Balkenbreite, Schenkel und Strichstaerke sind FESTE SYMBOLMASSE aus `SPANN_MM` (#106) und
 * bewusst KEINE Bauteilmasse: fuer das Einlegeblech gibt es noch keine bestaetigten
 * Abmessungen, und ein hier gesetztes mm-Mass laese sich als solche lesen. Aus dem Symbol
 * wird nichts abgeleitet. Bis #106 gaben die Aufrufer die Masse als Vielfache der Lagenhoehe
 * herein — dasselbe Blech war damit je Wandgroesse verschieden gross.
 *
 * Auf dem Querbalken sitzt real GENAU EINE Mutter von oben ([A-16]). Sie wird gezeichnet,
 * sobald `opts.e` (Zeichenkoordinaten je Papier-mm) vorliegt — als eigener kurzer Zylinder
 * aus `mutterSvg()`, also demselben Symbol wie jede andere Mutter ([D-4], #110), und sie
 * SITZT AUF dem Balken statt auf ihm zentriert zu sein. Ohne `e` bleibt das Ergebnis der
 * unveraenderte Polylinienzug; der Zug steht in jedem Fall ZUERST in der Zeichenkette.
 *
 * @param {number} x Zeichenkoordinate der Spannachse
 * @param {number} y Zeichenkoordinate der Lagen-Oberkante
 * @param {{breite?:number,schenkel?:number,strich?:number,farbe?:string,klasse?:string,
 *          e?:number,n?:(v:number)=>any,mutter_farbe?:string}} [opts]
 * @returns {string} SVG-Fragment (offener Polylinienzug, ggf. plus Mutter)
 */
export function zwischenpunktSvg(x, y, opts = {}) {
  const e = opts.e > 0 ? opts.e : 0;
  const bez = e > 0 ? e : 1;   // ohne `e` bleiben die Zeichenmasse in Zeichenkoordinaten
  const b = (opts.breite != null ? opts.breite : SPANN_MM.blech_b * bez) / 2;
  const h = opts.schenkel != null ? opts.schenkel : SPANN_MM.blech_schenkel * bez;
  const sw = opts.strich != null ? opts.strich : SPANN_MM.strich * bez;
  const farbe = opts.farbe || ZWISCHENPUNKT.farbe;
  const kl = opts.klasse ? ` class="${opts.klasse}"` : "";
  const n = opts.n || (v => v);
  // Querbalken auf der Oberkante, beide Schenkel nach UNTEN -> die Oeffnung zeigt nach unten.
  const pts = `${n(x - b)},${n(y + h)} ${n(x - b)},${n(y)} ${n(x + b)},${n(y)} `
    + `${n(x + b)},${n(y + h)}`;
  let s = `<polyline${kl} points="${pts}" fill="none" stroke="${farbe}" `
    + `stroke-width="${n(sw)}" stroke-linejoin="miter"/>`;
  // Die Mutter SITZT AUF dem Querbalken ([A-16]) — Unterkante auf der Oberkante des Balkens.
  if (e > 0)
    s += mutterSvg(x, y, e, { n: opts.n, klasse: opts.klasse, auf: true,
      farbe: opts.mutter_farbe || SPANN_FARBE.mutter });
  return s;
}

/**
 * Darstellungsschluessel des Deckenanschlusses ([P-24]/[D-4], #95/#97) — Kennfarbe und Klartext.
 *
 * Er liegt hier aus demselben Grund wie der Zwischenpunkt: dieselbe Baugruppe muss in der
 * Wandansicht (Modul 1) und im Zeichnungsblatt (Modul 7) gleich aussehen, ein modul-eigener
 * Schluessel waere die Drift, die [D-4] ausschliesst.
 *
 * Die Farbe ist ROT (Fachvorgabe 2026-09-08) und bewusst KEINE der Zuschnittfarben
 * (`STUECK_FARBE`), keine der Anschlussfarben (`SPANN_FARBE`) und nicht die des Einlegeblechs
 * (`ZWISCHENPUNKT`): der Deckenanschluss ist eine eigene Baugruppe und darf mit Stangenstueck,
 * Spannplatte, Mutter und Einlegeblech nicht verwechselbar sein.
 */
export const DECKENANSCHLUSS = { farbe: "#c0392b", label: "Deckenanschluss" };

/**
 * Symbol des Deckenanschlusses ([P-24]/[D-4], #95/#97): ein rotes Z ueber der Wandoberkante —
 * oberer Schenkel nach LINKS, unterer nach RECHTS (Fachvorgabe 2026-09-08).
 *
 * Gezeichnet wird die BAUGRUPPE als eine Marke, nicht ihre neun Einzelteile: die beiden Winkel
 * bilden die zwei Schenkel, der senkrechte Zug dazwischen den Winkelstoss an der Spannachse.
 * Schrauben, Scheiben, Anker und Bohrschrauben werden ausdruecklich NICHT gezeichnet — sie
 * stehen in der Stueckliste ([P-24]), und ein Symbol ist eine Darstellungsmarke und kein
 * Montagebild.
 *
 * Schenkellaenge, Hoehe, Versatz und Strichstaerke sind FESTE SYMBOLMASSE aus `SPANN_MM`
 * ([D-9]) und bewusst KEINE Bauteilmasse: die Masse der beiden Winkel liegen nicht vor und stehen im
 * Katalog als ausdruecklich vorlaeufige Platzhalter — ein hier gesetztes mm-Mass liesse sich
 * als Bauteilmass zurueckzulesen. Aus dem Symbol wird nichts abgeleitet.
 *
 * Das Symbol ist ein OFFENER Polylinienzug ohne Fuellung und traegt damit auch im
 * Schwarz-Weiss-Ausdruck seine eigene Form — wie das Einlegeblech und anders als die
 * gefuellten Zylinder.
 *
 * LAGE (#97): Bis dahin lag der senkrechte Zug GENAU auf der Spannachse und der untere
 * Schenkel GENAU auf der Wandoberkante — also auf den beiden Linien, die schon belegt sind:
 * die Gewindestange liegt seit #112 als letzte Bauteilgruppe im Vordergrund und verdeckte den
 * senkrechten Zug, die Spannplatte sitzt auf der Oberkante und verschluckte den Schenkel.
 * Beides ist reine Darstellung und wird deshalb hier geloest, nicht durch eine andere Achse:
 *
 *  - der senkrechte Zug steht um das feste Symbolmass `dc_versatz` LINKS NEBEN der Achse.
 *    Der Versatz ist groesser als die halbe Mutternbreite (`d`/2), der Zug laeuft also auch an
 *    der Spannmutter vorbei. Verschoben wird in ZEICHENKOORDINATEN und nicht auf eine physische
 *    Wandseite: Modul 1 spiegelt in der Rueckansicht, und eine Seitenwahl spraenge dort.
 *  - der untere Schenkel liegt unmittelbar OBERHALB der Plattenoberkante — die Strichstaerke
 *    vollstaendig ausserhalb des Plattenrechtecks, nicht auf dessen Kante zentriert. Er liegt
 *    damit im Hoehenband der aufsitzenden Spannmutter (`mutter_h` > `strich`) und ragt nicht
 *    ueber deren Oberkante hinaus.
 *  - weil `dc_schenkel` > `dc_versatz` ist, KREUZT der untere Schenkel die Spannachse nach
 *    rechts. Die feste Orientierung (oben links, unten rechts) bleibt unveraendert.
 *
 * Der Bezug fuer die Plattenoberkante ist die schon vorhandene Plattendicke
 * (`prestress.rod_kopf_zuschlag_mm`), gerechnet mit DEMSELBEN Baustein wie die Platte selbst
 * (`_plattenDicke`) — es entsteht keine zweite Fassung dieser Regel ([D-4]). OHNE das Mass —
 * und ebenso an einer Achse, die oben ein KOPFBLECH statt einer Spannplatte traegt und damit
 * gar keine Platte hat — bleibt es beim benannten festen Symbolmass `SPANN_MM.platte_h * e`.
 * Es wird kein Mass erfunden und kein Sonderfall gebaut.
 *
 * @param {number} x Zeichenkoordinate der Spannachse (= Lage des Anschlusspunkts)
 * @param {number} y Zeichenkoordinate der Wandoberkante (Auflagerkante der Spannplatte)
 * @param {number} e Zeichenkoordinaten je Papier-mm (`SPANN_EINHEIT`)
 * @param {{n?:(v:number)=>any,farbe?:string,klasse?:string,strich?:number,
 *          dicke_mm?:number,sc?:number}} [opts]
 *        `dicke_mm`/`sc`: reale Plattendicke in mm und Zeichenkoordinaten je mm (#97).
 * @returns {string} SVG-Fragment (offener Polylinienzug)
 */
export function deckenanschlussSvg(x, y, e, opts = {}) {
  const n = opts.n || (v => v);
  const b = SPANN_MM.dc_schenkel * e, h = SPANN_MM.dc_h * e;
  const sw = opts.strich != null ? opts.strich : SPANN_MM.strich * e;
  const farbe = opts.farbe || DECKENANSCHLUSS.farbe;
  const kl = opts.klasse ? ` class="${opts.klasse}"` : "";
  // Senkrechter Zug LINKS neben der Spannachse (#97) und unterer Schenkel unmittelbar oberhalb
  // der Plattenoberkante — die halbe Strichstaerke haelt ihn vollstaendig aus der Platte heraus.
  const xv = x - SPANN_MM.dc_versatz * e;
  const yu = y - _plattenDicke(e, opts.sc, opts.dicke_mm) - sw / 2;
  // Oberer Schenkel (Winkel Decke) nach LINKS, senkrechter Stoss dazwischen, unterer Schenkel
  // (Winkel Wand) nach RECHTS ueber die Spannachse — die Reihenfolge ist die Fachvorgabe und
  // nicht frei.
  const pts = `${n(xv - b)},${n(yu - h)} ${n(xv)},${n(yu - h)} ${n(xv)},${n(yu)} `
    + `${n(xv + b)},${n(yu)}`;
  return `<polyline${kl} points="${pts}" fill="none" stroke="${farbe}" `
    + `stroke-width="${n(sw)}" stroke-linejoin="miter"/>`;
}

/**
 * Reale Bodenblechteile einer Wand ([A-10]/[A-11]/[A-12]) — KANONISCHER LESER.
 *
 * Zerlegt wird ausschliesslich im Rechenkern (`zerlegeBodenblech()` in `sembla-core.js`);
 * `w.base_plate.teile` ist die einzige Quelle fuer Teilgrenzen, Rastermasse und
 * Sonderzuschnittart. Diese Funktion RECHNET NICHTS NACH — sie liest, normalisiert die
 * Art auf `standard`/`sonder` und liefert den Alt-Fallback. Eine zweite Zerlegung in
 * einem Ausgabemodul waere nach [A-1]/[D-4] unzulaessig.
 *
 * Gezeichnet wird `raster_mm` (die Teile summieren sich per Konstruktion exakt auf
 * `length_mm`), NIE das um `BLECH_SPIEL` = 2 mm kuerzere `bauteil_mm`: das ist das
 * Fertigungsmass und im Bild keine Luecke.
 *
 * Alt-Wandelemente ohne das Feld (vor der Core-Zerlegung gebaut) liefern GENAU EIN
 * Teil ueber die volle Wandlaenge — die bisherige durchgehende Darstellung, ohne eine
 * Teilung zu erfinden.
 *
 * @param {any} w Wandelement
 * @returns {Array<{x0_mm:number,raster_mm:number,art:"standard"|"sonder"}>}
 */
export function bodenblechTeile(w) {
  const L = (w && +w.length_mm) || 0;
  const t = (w && w.base_plate && Array.isArray(w.base_plate.teile)) ? w.base_plate.teile : null;
  if (!t || !t.length) return [{ x0_mm: 0, raster_mm: L, art: "standard" }];
  return t.map(p => ({ x0_mm: +p.x0_mm, raster_mm: +p.raster_mm,
                       art: p.art === "sonder" ? "sonder" : "standard" }));
}

/**
 * INNERE Stossfugen des Bodenblechs als absolute x-Positionen in mm — die kumulierten
 * Rastermasse aus `bodenblechTeile()`. Das Wandende ist kein Stoss (dort endet das Blech
 * ohnehin), ein einteiliges bzw. Alt-Blech liefert deshalb eine leere Liste.
 * @param {any} w @returns {number[]}
 */
export function bodenblechStoesse(w) {
  const t = bodenblechTeile(w), out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t[i].x0_mm + t[i].raster_mm);
  return out;
}

/** Reihenfolge mehrerer Ereignisse auf derselben Hoehe: erst schliessen, dann koppeln, dann neu ansetzen. */
const ART_RANG = { abschluss: 0, kopplung: 1, fuss: 2, neustart: 3 };

const _fmt = (n, d = 0) => (isFinite(n) ? n : 0).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const _esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/** Hoehe/Position in cm, ohne unnoetige Nullen (z. B. 62,5 mm -> "6,25 cm"). */
export function posCm(mm) {
  let t = (mm / 10).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return t.replace(".", ",") + " cm";
}

const _course = w => w.course_mm || COURSE_FALLBACK;
const _grid = w => w.grid_mm || GRID_FALLBACK;
const _rod = w => w.rod_mm || ROD_FALLBACK;
const _lagen = w => w.lagen || Math.round(w.height_mm / _course(w));

/** Segmente eines Strangs (Fallback fuer Alt-Bundles ohne `segments`). */
function _segmente(w, col) {
  if (Array.isArray(col.segments) && col.segments.length) return col.segments;
  return [{ z0_mm: 0, z1_mm: w.height_mm, gewindestangen: col.gewindestangen, anker_unten: "bodenblech", anker_oben: "kopfblech" }];
}

/** Stangenzahl eines Segments (aus dem Segment, nie aus einem anderen Strang). */
function _stueck(w, sg) {
  if (Array.isArray(sg.stuecke) && sg.stuecke.length) return sg.stuecke.length;
  if (sg.gewindestangen != null) return Math.max(1, sg.gewindestangen);
  return Math.max(1, Math.ceil((sg.z1_mm - sg.z0_mm) / _rod(w)));
}

/**
 * Oberkanten der einzelnen Stangen eines Segments (letzter Wert = Segmentende).
 *
 * Quelle ist die KANONISCHE Stueckliste des Segments (`stuecke`, [Z-2]/[Z-3]): die
 * Kopplungshoehen sind deren Kumulativsummen. Weil die Stuecke echte, unterschiedliche
 * Standardlaengen sein koennen, gibt es hier bewusst keine Rechnung „z0 + j·rod" mehr —
 * sonst entstuende ein zweites Stueckmodell neben dem Core ([P-6]). Alt-Bundles ohne
 * `stuecke` behalten die gleichmaessige Aufteilung ueber eine Pauschallaenge.
 *
 * ACHTUNG — das sind KOPPLUNGSHOEHEN, keine Zeichengeometrie: der letzte Wert ist
 * ausdruecklich das SEGMENTENDE und enthaelt deshalb den Ueberstand des Reststuecks
 * ([Z-6]) NICHT. Weil Σ`stuecke` = `bedarf_mm` = Segmenthoehe + Ueberstand ist, waere
 * ein Zeichnen bis zu diesem Wert um genau den Ueberstand zu kurz (und bei
 * `rod_rest_mm ≤ rod_overhang_mm` sogar null lang). Wer STUECKE zeichnet, nimmt
 * `stangenStuecke()`; wer Montageereignisse an Stoessen bildet, nimmt diese Funktion.
 */
export function stangenEnden(w, sg) {
  const out = [];
  if (Array.isArray(sg.stuecke) && sg.stuecke.length) {
    let z = sg.z0_mm;
    for (const st of sg.stuecke) { z += st.len_mm; out.push(z); }
    out[out.length - 1] = sg.z1_mm;           // Rundungsschutz: letztes Ende ist das Segmentende
    return out;
  }
  const rod = _rod(w), st = _stueck(w, sg);
  for (let j = 1; j < st; j++) out.push(sg.z0_mm + j * rod);
  out.push(sg.z1_mm);
  return out;
}

/**
 * Gezeichnete Stuecke eines Segments in Wandkoordinaten ([D-4]/[Z-6]) — die EINE
 * Geometriequelle fuer jede Ansicht, die den Zuschnitt stueckweise zeigt (Modul 1,
 * Modul 5, Modul 7 und der zentrale Export).
 *
 * Jedes Stueck traegt seine reale Materiallaenge `len_mm` aus dem Wandelement und die
 * Spanne `z0_mm…z1_mm`, in der es zu zeichnen ist. Beim LETZTEN Stueck eines Segments
 * mit Oberkantenbezug liegt `z1_mm` um den Ueberstand [Z-6] UEBER der Wandoberkante:
 * der Ueberstand ist eingebautes Material (Platz fuer Kopfblech/Spannplatte und
 * Spannmutter) und wird deshalb dargestellt, nicht auf die Oberkante gekappt. Nach
 * unten bleibt der Rundungsschutz aus `stangenEnden()` erhalten (nie kuerzer als das
 * Segmentende).
 *
 * Ein Segment mit VORHANDENEM, aber LEEREM `stuecke` ist ein gemeldeter
 * Zuschnittkonflikt ([Z-6]: `reststueck_zu_lang`/`kein_ausgangsprodukt`) — dort gibt es
 * nichts zu zeichnen, und es wird auch nichts erfunden (keine Ersatzstange). Nur
 * Alt-Bundles OHNE das Feld fallen auf die gleichmaessige Aufteilung zurueck.
 *
 * @param {any} w @param {any} sg Segment
 * @returns {Array<{z0_mm:number,z1_mm:number,len_mm:number,art:string}>}
 */
export function stangenStuecke(w, sg) {
  const hat = Array.isArray(sg.stuecke);
  if (hat && !sg.stuecke.length) return [];
  const out = [];
  if (hat) {
    let z = sg.z0_mm;
    for (let i = 0; i < sg.stuecke.length; i++) {
      const st = sg.stuecke[i], letzter = i === sg.stuecke.length - 1;
      const ende = z + st.len_mm;
      out.push({ z0_mm: z, z1_mm: letzter ? Math.max(sg.z1_mm, ende) : ende,
        len_mm: st.len_mm, art: stueckArt(w, sg, i, letzter) });
      z = ende;
    }
    return out;
  }
  const enden = stangenEnden(w, sg);
  let z = sg.z0_mm;
  for (let i = 0; i < enden.length; i++) {
    out.push({ z0_mm: z, z1_mm: enden[i], len_mm: enden[i] - z,
      art: stueckArt(w, sg, i, i === enden.length - 1) });
    z = enden[i];
  }
  return out;
}

/**
 * Art des i-ten Stangenstuecks eines Segments (`standard`/`sonder`/`rest`) aus den
 * kanonischen `stuecke` ([Z-2]/[Z-3]/[Z-6]).
 *
 * Hier — und nicht in den einzelnen Ausgaben — weil Modul 1, Modul 5 und Modul 7 die
 * Stuecke gleich einfaerben muessen ([D-4]). Alt-Bundles ohne `stuecke` behalten den
 * bisherigen Fallback: nur das LETZTE Stueck kann eine Sonderlaenge sein, ein Reststueck
 * wird nie erraten.
 * @param {any} w @param {any} sg Segment @param {number} i Stueckindex @param {boolean} letzter
 */
export function stueckArt(w, sg, i, letzter) {
  const st = Array.isArray(sg.stuecke) ? sg.stuecke[i] : null;
  if (st && st.art) return st.art;
  if (letzter && sg.letzte_stange_mm != null && Math.round(sg.letzte_stange_mm) !== Math.round(_rod(w))) return "sonder";
  return "standard";
}

/**
 * Sichtbare Stangenstuecke eines Segments bis zum aktuellen Montagestand.
 *
 * `echtMm` = reale Oberkante des zuletzt gesetzten Stuecks, `obenMm` = gezeichnete
 * Oberkante (kann den Ueberstand nach [A-9]/UEBERSTAND_MM enthalten). Der Ueberstand
 * wird dem LETZTEN wirklich gesetzten Stueck zugeschlagen — nie dem naechsten, das
 * noch nicht montiert ist. Alt-Bundles ohne `stuecke` liefern eine leere Liste; die
 * Zeichnung faellt dann auf die Einzellinie zurueck.
 *
 * Am ABGESCHLOSSENEN Segment ist `obenMm` das Segmentende; das reicht fuer das
 * Reststueck [Z-6] nicht, weil dessen Ueberstand oberhalb der Wandoberkante liegt und
 * eingebautes Material ist. Gezeichnet wird deshalb bis zur realen Materialoberkante,
 * wenn die hoeher liegt als die Montage-Darstellung ([D-4]: dieselbe Geometrie wie
 * `stangenStuecke()`).
 */
function _stueckeSicht(w, sg, echtMm, obenMm) {
  if (!Array.isArray(sg.stuecke) || !sg.stuecke.length) return [];
  const out = [];
  let z = sg.z0_mm, material = sg.z0_mm;
  for (let i = 0; i < sg.stuecke.length; i++) {
    const art = stueckArt(w, sg, i, i === sg.stuecke.length - 1);
    const z1 = z + sg.stuecke[i].len_mm;
    out.push({ z0_mm: z, z1_mm: Math.min(z1, echtMm), art });
    z = z1; material = z1;
    if (z >= echtMm - 1e-9) break;
  }
  if (out.length) out[out.length - 1].z1_mm = Math.max(obenMm, material);
  return out;
}

/** Lokale Oberkante je Rasterspalte (Lagenzahl) — Wandkontur inkl. Staffelung. */
export function topLagen(w) {
  const G = _grid(w), C = _course(w), L = _lagen(w);
  const N = w.N_grid || Math.round(w.length_mm / G);
  const out = [];
  for (let k = 0; k < N; k++) {
    const xc = (k + 0.5) * G; let h = w.height_mm;
    for (const s of (w.steps || [])) { if (xc >= s.x0_mm && xc < s.x1_mm) { h = s.height_mm; break; } }
    out.push(Math.max(0, Math.min(L, Math.round(h / C))));
  }
  return out;
}

/**
 * Horizontale Abschnitte der TATSAECHLICH GEBAUTEN Wandoberkante ([A-1]/[D-4]).
 *
 * Faltet `topLagen()` zu maximalen Laeufen gleicher lokaler Oberkante — die kanonische
 * Ableitung fuer jede Ansicht, die den oberen Wandabschluss zeigt (Kopfblech in der
 * technischen Zeichnung und in der 3D-Vorschau). Rasterspalten OHNE Wand (lokale
 * Oberkante 0, z. B. eine Aussparung ueber die volle Hoehe) liefern KEINEN Abschnitt:
 * dort steht nichts, worauf ein Blech liegen koennte — es entsteht eine echte Luecke
 * statt eines schwebenden Abschnitts.
 *
 * Die Summe der Abschnittslaengen ist konstruktionsbedingt `top_plate.laenge_mm` des
 * Rechenkerns (dort `occCols * GRID`), damit Darstellung und Mengen dieselbe fachliche
 * Kontur benutzen und nicht auseinanderlaufen koennen. REIN GEOMETRISCH: die Art des
 * oberen Anschlusses (`prestress.top_connection`) aendert die Kontur nicht und wird
 * hier bewusst nicht ausgewertet.
 *
 * @param {any} w Wandelement
 * @returns {Array<{x0_mm:number,x1_mm:number,hoehe_mm:number,lagen:number}>}
 */
export function oberkantenAbschnitte(w) {
  const G = _grid(w), C = _course(w), tl = topLagen(w);
  const out = [];
  for (let k = 0; k < tl.length; k++) {
    if (tl[k] <= 0) continue;
    const letzte = out[out.length - 1];
    if (letzte && letzte.lagen === tl[k] && letzte.x1_mm === k * G) letzte.x1_mm = (k + 1) * G;
    else out.push({ x0_mm: k * G, x1_mm: (k + 1) * G, hoehe_mm: tl[k] * C, lagen: tl[k] });
  }
  return out;
}

// ---------------------------------------------------------------- Ereignisse

/**
 * Alle Montageereignisse der Wand, aufsteigend nach Hoehe.
 *
 * Ereignisarten:
 *   `fuss`      — Segmentbeginn auf dem Bodenblech (erste Gewindestange),
 *   `neustart`  — Segmentbeginn oberhalb des Bodens (Spannplatte, neue Stange),
 *   `kopplung`  — Stangenstoss innerhalb eines Segments,
 *   `abschluss` — Segmentende (Kopfblech an der Wandoberkante oder Spannplatte).
 *
 * Ereignisse gleicher Art auf gleicher Hoehe werden zu EINEM Ereignis mit allen
 * betroffenen Straengen zusammengefasst; jeder Strang bleibt einzeln sichtbar.
 * `reihe_vor` = Zahl der vollstaendig darunterliegenden Steinreihen
 * (`floor(z/COURSE)`): das Ereignis liegt NACH dieser Reihe und VOR der naechsten.
 * @param {any} w Wandelement
 */
export function montageEreignisse(w) {
  const C = _course(w);
  const roh = [];
  for (const col of (w.tension_columns || [])) {
    for (const sg of _segmente(w, col)) {
      const st = _stueck(w, sg);
      const ankerU = sg.anker_unten || (sg.z0_mm === 0 ? "bodenblech" : "spannplatte");
      const ankerO = sg.anker_oben || "spannplatte";
      roh.push({ art: ankerU === "bodenblech" ? "fuss" : "neustart", z_mm: sg.z0_mm, col, sg, anker: ankerU });
      for (const [i, z] of stangenEnden(w, sg).slice(0, -1).entries())
        roh.push({ art: "kopplung", z_mm: z, col, sg, stange_nr: i + 1, anker: "kopplungsmutter" });
      roh.push({ art: "abschluss", z_mm: sg.z1_mm, col, sg, anker: ankerO });
    }
  }
  /** @type {Map<string, any>} */
  const map = new Map();
  for (const r of roh) {
    const key = r.art + "@" + r.z_mm;
    let e = map.get(key);
    if (!e) { e = { art: r.art, z_mm: r.z_mm, reihe_vor: Math.floor(r.z_mm / C), straenge: [] }; map.set(key, e); }
    e.straenge.push({
      k: r.col.k, x_mm: r.col.x_mm, anker: r.anker, stange_nr: r.stange_nr || null,
      seg_z0_mm: r.sg.z0_mm, seg_z1_mm: r.sg.z1_mm, stangen: _stueck(w, r.sg),
      letzte_stange_mm: r.sg.letzte_stange_mm != null ? r.sg.letzte_stange_mm : null,
    });
  }
  const evs = [...map.values()].sort((a, b) => (a.z_mm - b.z_mm) || (ART_RANG[a.art] - ART_RANG[b.art]));
  for (const e of evs) {
    e.straenge.sort((p, q) => p.x_mm - q.x_mm);
    Object.assign(e, _ereignisTexte(e));
  }
  return evs;
}

/** Titel + erklaerender Text eines Ereignisses (nennt Hoehe und alle Straenge). */
function _ereignisTexte(e) {
  const n = e.straenge.length;
  const xs = e.straenge.map(s => posCm(s.x_mm)).join(", ");
  const h = posCm(e.z_mm);
  const straenge = n === 1 ? "1 Strang" : n + " Stränge";
  if (e.art === "fuss") {
    return {
      titel: "Bodenblech und erste Gewindestangen",
      text: `<b>Bodenblech</b> (10 mm, in Modulen) auf Höhe ${h} verlegen und ausrichten. An `
        + `${straenge} je eine <b>Sechskantschraube von unten</b> und eine <b>Kopplungsmutter oben</b> `
        + `setzen, dann die erste <b>Gewindestange</b> einschrauben. Strangpositionen x = ${xs}.`,
    };
  }
  if (e.art === "neustart") {
    return {
      titel: "Neue Gewindestange ansetzen auf " + h,
      text: `Auf ${h} je Strang eine <b>Spannplatte</b> auf die Steinkante legen und eine <b>neue `
        + `Gewindestange</b> ansetzen (Segmentbeginn über Öffnung/Aussparung). ${straenge} · x = ${xs}.`,
    };
  }
  if (e.art === "kopplung") {
    return {
      titel: "Kopplung auf " + h,
      text: `Auf ${h} — also nach Reihe ${e.reihe_vor} und <b>vor</b> Reihe ${e.reihe_vor + 1} — die `
        + `Gewindestangen mit <b>Kopplungsmuttern</b> verlängern und handfest sichern `
        + `(Zwischenspannpunkt, Lagesicherung). ${straenge} · x = ${xs}.`,
    };
  }
  const kopf = e.straenge.filter(s => s.anker === "kopfblech");
  const platte = e.straenge.filter(s => s.anker !== "kopfblech");
  const teile = [];
  if (kopf.length) teile.push(`<b>Kopfblech</b> (10 mm, in Modulen) auflegen und die <b>Spannmuttern</b> `
    + `anziehen (Endvorspannung) — x = ${kopf.map(s => posCm(s.x_mm)).join(", ")}`);
  if (platte.length) teile.push(`je Strang die <b>Spannplatte</b> auf die obere Steinkante legen und die `
    + `<b>Spannmutter</b> anziehen — x = ${platte.map(s => posCm(s.x_mm)).join(", ")}`);
  return {
    titel: "Oberer Abschluss auf " + h,
    text: `Oberkante ${h} erreicht (${straenge}): ` + teile.join("; ") + ".",
  };
}

// -------------------------------------------------------------- Abschnitte

/**
 * Baugruppenabschnitte: je Abschnitt die Ereignisse einer Ankerreihe und der
 * anschliessend zu montierende Steinreihenbereich.
 *
 * Regeln:
 *   * Ereignisse derselben Ankerreihe bilden EINEN Abschnitt (keine unnoetigen
 *     Seiten); jede Hoehe und jeder Strang bleibt darin einzeln sichtbar.
 *   * Ein Abschnitt beginnt mit seinen Ereignissen und endet vor den Ereignissen
 *     des naechsten Abschnitts.
 *   * Ereignisgruppen ohne eigene Steinreihen (typisch: oberer Abschluss nach der
 *     letzten Reihe) erzeugen KEINEN eigenen Abschnitt, sondern gehen sichtbar in
 *     den letzten Abschnitt ein.
 *   * Die Reihenbereiche decken 1..w.lagen lueckenlos und ohne Ueberlappung ab.
 * @param {any} w Wandelement
 */
export function montageAbschnitte(w) {
  const lagen = _lagen(w);
  const evs = montageEreignisse(w);
  // 1) nach Ankerreihe gruppieren (Ereignisse sind nach Hoehe sortiert, also auch nach Ankerreihe)
  const gruppen = [];
  for (const e of evs) {
    const g = gruppen[gruppen.length - 1];
    if (g && g.anker === e.reihe_vor) g.ereignisse.push(e);
    else gruppen.push({ anker: e.reihe_vor, ereignisse: [e] });
  }
  // 2) Reihenbereiche zuordnen — lueckenlos, ohne leere Abschnitte
  const abschnitte = []; let cursor = 1; let offen = [];
  gruppen.forEach((g, i) => {
    const bis = (i + 1 < gruppen.length) ? gruppen[i + 1].anker : lagen;
    const von = cursor;
    const ereignisse = offen.concat(g.ereignisse); offen = [];
    if (bis < von) {                                  // keine eigenen Reihen -> nicht als Seite fuehren
      if (abschnitte.length) abschnitte[abschnitte.length - 1].ereignisse.push(...ereignisse);
      else offen = ereignisse;                        // ganz unten: dem ersten Abschnitt voranstellen
      return;
    }
    abschnitte.push({ anker_reihe: g.anker, ereignisse, reihen: { von, bis } });
    cursor = bis + 1;
  });
  if (offen.length && abschnitte.length) abschnitte[0].ereignisse.unshift(...offen);
  // 3) Kennwerte je Abschnitt (Straenge, Hoehen, Titel)
  const C = _course(w);
  abschnitte.forEach((ab, i) => {
    ab.art = "abschnitt";
    ab.nr = i + 1;
    ab.z_von_mm = (ab.reihen.von - 1) * C;
    ab.z_bis_mm = ab.reihen.bis * C;
    ab.straenge = _strangZustand(w, ab);
    const weiter = ab.straenge.filter(s => !s.abgeschlossen);
    ab.stange_oberkante_mm = Math.max(ab.z_bis_mm, ...ab.straenge.map(s => s.zeichen_oben_mm));
    ab.stange_weiter_mm = weiter.length ? Math.max(...weiter.map(s => s.zeichen_oben_mm)) : null;
    ab.reihen_text = ab.reihen.von === ab.reihen.bis ? "Reihe " + ab.reihen.von : "Reihen " + ab.reihen.von + "–" + ab.reihen.bis;
    ab.titel = "Abschnitt " + ab.nr + " · " + ab.ereignisse[0].titel;
  });
  // 4) Schnitt 0 ([A-9]) additiv voranstellen — die bestehenden Abschnitte bleiben unveraendert
  const s0 = _schnittNull(w, evs);
  if (s0) abschnitte.unshift(s0);
  // 5) globaler Massstab/Viewport fuer ALLE Baugruppenbilder (auch Schnitt 0)
  const zTop = Math.max(w.height_mm, C, ...abschnitte.map(a => a.stange_oberkante_mm));
  abschnitte.forEach(ab => { ab.z_top_mm = zTop; });
  return abschnitte;
}

/**
 * Schnitt 0 nach [A-9]: steinfreie Fuss-Baugruppe (Bodenblech/Grundplatte + erste
 * Gewindestangen) als zusaetzliche, vorgelagerte Darstellung.
 *
 * Streng additiv: die Fussereignisse bleiben zusaetzlich in ihrem regulaeren
 * Abschnitt; hier werden dieselben Ereignisobjekte nur ein weiteres Mal gezeigt.
 * Ohne Fussereignis (kein Segment auf dem Bodenblech) entsteht KEIN Schnitt 0 und
 * damit keine leere Seite (sicherer Leerfall, [P-9]).
 * @param {any} w @param {any[]} evs Ereignisse aus montageEreignisse()
 */
function _schnittNull(w, evs) {
  const fuss = evs.filter(e => e.art === "fuss");
  if (!fuss.length) return null;
  const straenge = _fussZustand(w);
  if (!straenge.length) return null;
  return {
    art: "schnitt0", nr: 0, anker_reihe: 0,
    ereignisse: fuss,                               // dieselben Objekte, nicht verschoben
    reihen: { von: 1, bis: 0 },                     // leerer Bereich = keine Steinreihen
    z_von_mm: 0, z_bis_mm: 0,
    straenge,
    stange_oberkante_mm: Math.max(0, ...straenge.map(s => s.zeichen_oben_mm)),
    stange_weiter_mm: null,
    reihen_text: "ohne Steinreihen",
    titel: "Schnitt 0 · Bodenblech und erste Gewindestangen",
  };
}

/**
 * Strangzustand des Schnitts 0: je Segment auf dem Bodenblech nur die ERSTE
 * Gewindestange, bis zu ihrer ersten Kopplungs- bzw. Segmentoberkante. Noch keine
 * Kopplungsmutter gesetzt; oben abgeschlossen nur, wenn das Segment aus genau
 * einer Stange besteht.
 */
function _fussZustand(w) {
  const out = [];
  for (const col of (w.tension_columns || [])) {
    for (const sg of _segmente(w, col)) {
      const ankerU = sg.anker_unten || (sg.z0_mm === 0 ? "bodenblech" : "spannplatte");
      if (ankerU !== "bodenblech") continue;
      const enden = stangenEnden(w, sg);
      const eins = enden.length === 1;                // einzige Stange = zugleich Segmentende
      out.push({
        k: col.k, x_mm: col.x_mm,
        z_unten_mm: sg.z0_mm, seg_z1_mm: sg.z1_mm,
        z_oben_real_mm: enden[0], zeichen_oben_mm: enden[0], abgeschlossen: eins,
        anker_unten: ankerU, anker_oben: sg.anker_oben || "spannplatte",
        stangen: _stueck(w, sg), kopplungen_mm: [],
        stuecke_sicht: _stueckeSicht(w, sg, enden[0], enden[0]),
      });
    }
  }
  return out.sort((a, b) => a.x_mm - b.x_mm);
}

/** Schluessel eines Segments (Strang + Segmentgrenzen) — verbindet Ereignis und Zeichnung. */
const _segKey = (k, z0, z1) => k + ":" + z0 + "-" + z1;

/**
 * Zustand der Vorspannstraenge in einem Abschnitt — je Segment, das Reihen dieses
 * Abschnitts belegt oder in einem seiner Ereignisse vorkommt.
 *
 * `abgeschlossen` ist genau dann wahr, wenn das Abschluss-Ereignis des Segments in
 * DIESEM Abschnitt liegt — dann wird die Stange bis zur Segmentoberkante mit
 * Kopfblech/Spannplatte gezeichnet. Andernfalls laeuft die Stange weiter und wird
 * sichtbar ueber die letzte dargestellte Steinreihe hinaus gezeichnet
 * (offenes Stangenende, Kopplung folgt).
 */
function _strangZustand(w, ab) {
  const zVon = ab.z_von_mm, zBis = ab.z_bis_mm;
  const beteiligt = new Map();                       // segKey -> {abschluss:boolean}
  for (const e of ab.ereignisse) for (const st of e.straenge) {
    const key = _segKey(st.k, st.seg_z0_mm, st.seg_z1_mm);
    const v = beteiligt.get(key) || { abschluss: false };
    if (e.art === "abschluss") v.abschluss = true;
    beteiligt.set(key, v);
  }
  const out = [];
  for (const col of (w.tension_columns || [])) {
    for (const sg of _segmente(w, col)) {
      const key = _segKey(col.k, sg.z0_mm, sg.z1_mm);
      const bet = beteiligt.get(key);
      const belegt = sg.z0_mm < zBis && sg.z1_mm > zVon;
      if (!belegt && !bet) continue;
      const enden = stangenEnden(w, sg);
      const abgeschlossen = !!(bet && bet.abschluss);
      const echt = abgeschlossen ? sg.z1_mm : (enden.find(z => z >= zBis) != null ? enden.find(z => z >= zBis) : sg.z1_mm);
      // Am abgeschlossenen Segment ist die gezeichnete Oberkante die MATERIALoberkante: das
      // Reststueck ragt um den Ueberstand ueber das Segmentende ([Z-6]) und ist eingebautes
      // Material. Für Zwischenstände bleibt der reine Darstellungsüberstand maßgebend.
      const stuecke = abgeschlossen ? stangenStuecke(w, sg) : [];
      const materialOben = stuecke.length ? stuecke[stuecke.length - 1].z1_mm : sg.z1_mm;
      const oben = abgeschlossen ? materialOben : Math.max(echt, zBis + UEBERSTAND_MM);
      out.push({
        k: col.k, x_mm: col.x_mm,
        z_unten_mm: sg.z0_mm, seg_z1_mm: sg.z1_mm,
        z_oben_real_mm: echt, zeichen_oben_mm: oben, abgeschlossen,
        anker_unten: sg.anker_unten || (sg.z0_mm === 0 ? "bodenblech" : "spannplatte"),
        anker_oben: sg.anker_oben || "spannplatte",
        stangen: _stueck(w, sg),
        // bereits gesetzte Kopplungsmuttern = Stangenstoesse unterhalb der aktuellen Oberkante
        kopplungen_mm: enden.slice(0, -1).filter(z => z < echt),
        // reale Stuecke bis zum Montagestand — Zeichenfeedback des Zuschnitts ([D-4])
        stuecke_sicht: _stueckeSicht(w, sg, echt, oben),
      });
    }
  }
  return out.sort((a, b) => a.x_mm - b.x_mm);
}

// ------------------------------------------------------------ Zeichenbausteine

// Stangenfarben kommen aus STUECK_FARBE ([D-4]) — kein zweiter Farbschluessel.
// `platte` ist bewusst NICHT mehr die Sonderzuschnittsfarbe: die Spannplatte ist ein
// Bauteil, kein Zuschnitt, und darf mit ihm nicht verwechselt werden.
const FARBE = {
  i3: "#cfd3d8", i2: "#bcc2c9", stein_rand: "#7d848c",
  fertig: "#e9ebee", fertig_rand: "#c3c8cf",
  stange: STUECK_FARBE.standard, stange_sonder: STUECK_FARBE.sonder, stange_rest: STUECK_FARBE.rest,
  stahl: "#5b6673", stahl_rand: "#3a4350",
  platte: SPANN_FARBE.platte, mutter: SPANN_FARBE.mutter, kontur: "#13202e",
  raster: "#8a93a0", oeffnung: "#c9461c", text: "#6b7682",
};

/**
 * Bodenblech als REALE TEILFOLGE zeichnen — EIN Zeichenweg fuer alle Ausgaben ([D-4]).
 *
 * Genutzt vom Baugruppenbild und vom Wandueberblick (Modul 5) UND von der technischen
 * Zeichnung (Modul 7, per Import). Damit koennen Teilgrenzen und Stosspositionen
 * zwischen den Modulen nicht auseinanderlaufen; eine modul-eigene Blechzeichnung waere
 * genau die zweite Wahrheit, die [A-1]/[D-4] ausschliessen.
 *
 * Getragen wird die Unterscheidung Standardteil/Sonderzuschnitt von ZWEI Merkmalen:
 * der Kennfarbe aus `STUECK_FARBE` (derselbe Schluessel wie beim Stangenzuschnitt) UND
 * einer Schraffur quer ueber das Teil — sie haelt den Sonderzuschnitt im
 * Schwarz-Weiss-Ausdruck lesbar. Anders als bei der Brandschutzkennzeichnung liegt sie
 * NICHT ueber der Wandflaeche, sondern nur im 15-mm-Blechstreifen unter der Wand: sie
 * verdeckt also nichts vom Ausfuehrungsnoetigen, sie IST die Ausfuehrungsangabe.
 *
 * Das 2-mm-Spiel zwischen den realen Bauteilen wird BEWUSST NICHT gezeichnet — bei
 * 1:50 waeren das 0,04 mm Papier: als Luecke unsichtbar, als Mass irrefuehrend. Der
 * Stoss ist eine Linie, keine Luecke.
 *
 * @param {any} w Wandelement
 * @param {(x:number)=>number} X Weltkoordinate x (mm) -> Zeichenkoordinate
 * @param {(z:number)=>number} Y Weltkoordinate z (mm) -> Zeichenkoordinate
 * @param {number} sc Massstabsfaktor (Zeichenkoordinaten je mm)
 * @param {number} bth Blechdicke in Zeichenkoordinaten
 * @param {{n?:(v:number)=>any,rand?:number,stoss?:number,schraffur?:number}} [opts]
 *        `n` = Zahlenformatierer des aufrufenden Moduls (Modul 7 rundet auf Papier-mm),
 *        `rand`/`stoss`/`schraffur` = Strichstaerken in Zeichenkoordinaten.
 */
export function bodenblechSvg(w, X, Y, sc, bth, opts = {}) {
  const n = opts.n || (v => v);
  const rand = opts.rand != null ? opts.rand : 0.6;
  const sStoss = opts.stoss != null ? opts.stoss : Math.max(0.8, rand * 2.2);
  const sSchr = opts.schraffur != null ? opts.schraffur : Math.max(0.4, rand * 0.9);
  const y0 = Y(0);
  let s = "";
  for (const t of bodenblechTeile(w)) {
    // Linke Kante SPIEGELFEST: die Wandansicht von Modul 1 zeigt die Rueckseite mit
    // fallendem `X` ([D-4]/#91). Bei steigendem `X` ist `Math.min` bitgenau `X(t.x0_mm)`,
    // die Ausgaben von Modul 5 und Modul 7 bleiben also zeichengleich.
    const bw = t.raster_mm * sc;
    const x = Math.min(X(t.x0_mm), X(t.x0_mm + t.raster_mm));
    s += `<rect x="${n(x)}" y="${n(y0)}" width="${n(bw)}" height="${n(bth)}" `
      + `fill="${t.art === "sonder" ? STUECK_FARBE.sonder : FARBE.stahl}" `
      + `stroke="${FARBE.stahl_rand}" stroke-width="${n(rand)}"/>`;
    // Nicht farbliches Merkmal des Sonderzuschnitts: Schraffur quer im Streifen.
    if (t.art === "sonder") {
      // Abstand am Streifen ausgerichtet, nach unten aber so gekappt, dass auch ein
      // kurzes Teil bei kleinem Masstab noch mindestens zwei Striche traegt — ein
      // einzelner Strich waere als Muster nicht erkennbar.
      const step = Math.min(Math.max(3, bth * 2.5), bw / 3);
      for (let hx = x + step; hx < x + bw - step * 0.4; hx += step)
        s += `<line x1="${n(hx)}" y1="${n(y0)}" x2="${n(hx)}" y2="${n(y0 + bth)}" `
          + `stroke="${FARBE.stahl_rand}" stroke-width="${n(sSchr)}"/>`;
    }
  }
  // Stossfugen an den KUMULIERTEN Rastermassen — WEISS und genau blechhoch (#91).
  // Sie liegen vollstaendig IM Blechstreifen (Oberkante `y0` bis Unterkante `y0 + bth`):
  // die frueher nach unten herausgezogene Marke in Konturfarbe las sich wie ein eigenes
  // Bauteil oder eine Fuge UNTER dem Blech statt wie eine Teilgrenze DARIN. Weiss steht
  // auf dem stahlfarbenen Streifen und traegt die Marke auch im Schwarz-Weiss-Ausdruck.
  for (const xm of bodenblechStoesse(w))
    s += `<line x1="${n(X(xm))}" y1="${n(y0)}" x2="${n(X(xm))}" y2="${n(y0 + bth)}" `
      + `stroke="${BLECHSTOSS.farbe}" stroke-width="${n(sStoss)}"/>`;
  return s;
}

/** Konturzug der Wand (Aussenkante inkl. Staffelung) als Punktliste in mm. */
function _konturPunkte(w) {
  const G = _grid(w), C = _course(w), tl = topLagen(w);
  const pts = [[0, 0], [0, tl[0] * C]];
  for (let k = 0; k < tl.length; k++) {
    pts.push([(k + 1) * G, tl[k] * C]);
    if (k < tl.length - 1 && tl[k + 1] !== tl[k]) pts.push([(k + 1) * G, tl[k + 1] * C]);
  }
  pts.push([w.length_mm, 0], [0, 0]);
  return pts;
}

/**
 * Baugruppenbild eines Abschnitts (reines SVG-Innere, mm-basiert).
 * Zeigt: bereits montierte Reihen (blass), die Reihen dieses Abschnitts mit
 * Nummern, Bodenblech/Kopfblech/Spannplatten, die Gewindestangen mit
 * Positionsangabe und die Ereignishoehen.
 * @param {any} w @param {any} ab Abschnitt aus montageAbschnitte()
 * @param {number} [vbW] @param {number} [vbH]
 */
export function abschnittSvg(w, ab, vbW = 900, vbH = 430) {
  const C = _course(w), G = _grid(w), L = w.length_mm;
  const padL = 52, padR = 34, padT = 34, padB = 26;
  // Massstab: global konstant ueber alle Baugruppenbilder ([A-9]); `z_top_mm` setzt
  // montageAbschnitte(). Fallback nur fuer direkt gebaute Abschnitte ohne dieses Feld.
  const zTop = ab.z_top_mm != null ? ab.z_top_mm : Math.max(ab.stange_oberkante_mm, ab.z_bis_mm, C);
  const sc = Math.min((vbW - padL - padR) / L, (vbH - padT - padB) / zTop);
  const yBase = padT + zTop * sc;
  const X = x => padL + x * sc, Y = z => yBase - z * sc;
  const li0 = ab.reihen.von - 1, li1 = ab.reihen.bis - 1;
  let s = "";

  // bereits montierte Reihen (Orientierung, blass)
  for (const c of (w.courses || [])) {
    if (c.lage >= li0) continue;
    for (const st of c.stones)
      s += `<rect x="${X(st.x0)}" y="${Y((c.lage + 1) * C)}" width="${(st.x1 - st.x0) * sc}" height="${C * sc}" `
        + `fill="${FARBE.fertig}" stroke="${FARBE.fertig_rand}" stroke-width="0.6"/>`;
  }
  // Reihen dieses Abschnitts
  for (const c of (w.courses || [])) {
    if (c.lage < li0 || c.lage > li1) continue;
    for (const st of c.stones) {
      const bw = (st.x1 - st.x0) * sc;
      s += `<rect x="${X(st.x0)}" y="${Y((c.lage + 1) * C)}" width="${bw}" height="${C * sc}" `
        + `fill="${st.type === "i3" ? FARBE.i3 : FARBE.i2}" stroke="${FARBE.stein_rand}" stroke-width="1.1"/>`;
      if (bw > 24) s += `<text x="${X((st.x0 + st.x1) / 2)}" y="${Y(c.lage * C) - C * sc / 2 + 3.5}" `
        + `font-size="9.5" fill="#5b6670" text-anchor="middle">${st.type}</text>`;
    }
    // Reihennummer (durchgehende Nummerierung, 1-basiert)
    const yc = Y(c.lage * C) - C * sc / 2 + 3.5;
    s += `<text x="${X(0) - 8}" y="${yc}" font-size="10" font-weight="600" fill="#46505e" text-anchor="end">${c.lage + 1}</text>`;
  }
  // Öffnungen im dargestellten Bereich
  for (const o of (w.openings || [])) {
    if (o.l1 <= 0 || o.l0 > li1) continue;
    const oy1 = Math.min(o.l1, li1 + 1), ox = X(o.g0 * G), ow = (o.g1 - o.g0) * G * sc;
    s += `<rect x="${ox}" y="${Y(oy1 * C)}" width="${ow}" height="${(oy1 - o.l0) * C * sc}" fill="#fff" `
      + `stroke="${FARBE.oeffnung}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    if (ow > 46) s += `<text x="${ox + ow / 2}" y="${Y(o.l0 * C) - 6}" font-size="9.5" fill="${FARBE.oeffnung}" `
      + `text-anchor="middle">${o.art === "fenster" ? "Fenster" : o.art === "durchbruch" ? "Durchbruch" : "Tür"}</text>`;
  }
  // Wandkontur (Staffelung sichtbar) — in Schnitt 0 nicht: dort nur die Fuss-Baugruppe ([A-9])
  if (ab.art !== "schnitt0")
    s += `<polyline points="${_konturPunkte(w).map(p => X(p[0]) + "," + Y(Math.min(p[1], zTop))).join(" ")}" `
      + `fill="none" stroke="${FARBE.kontur}" stroke-width="1.2" stroke-opacity="0.55"/>`;
  // Bodenblech als reale Teilfolge mit Stoessen ([A-10]/[A-11]/[A-12]) — gezeichnet
  // ueber den gemeinsamen `bodenblechSvg()`, also identisch zu Wandueberblick und
  // technischer Zeichnung. Alt-Wandelemente ohne `base_plate.teile` ergeben dort
  // genau ein Teil ueber die volle Laenge und damit die bisherige Vollplatte.
  const bth = Math.max(3, 15 * sc);
  s += bodenblechSvg(w, X, Y, sc, bth, { rand: 0.6 });

  // Kopfblech-Abschnitte der in diesem Abschnitt abgeschlossenen Straenge
  for (const e of ab.ereignisse) {
    if (e.art !== "abschluss") continue;
    const kopf = e.straenge.filter(x => x.anker === "kopfblech");
    if (!kopf.length) continue;
    const x0 = Math.max(0, Math.min(...kopf.map(x => x.x_mm)) - G / 2);
    const x1 = Math.min(L, Math.max(...kopf.map(x => x.x_mm)) + G / 2);
    s += `<rect x="${X(x0)}" y="${Y(e.z_mm) - bth}" width="${(x1 - x0) * sc}" height="${bth}" `
      + `fill="${FARBE.stahl}" stroke="${FARBE.stahl_rand}" stroke-width="0.5"/>`;
  }

  // Gewindestangen
  const pw = Math.max(6, 110 * sc);
  ab.straenge.forEach((st, i) => {
    const x = X(st.x_mm);
    // Stueckweise nach dem gemeinsamen Farbschluessel ([D-4]): Standardlaenge,
    // Sonderzuschnitt und Reststueck sind auch im Baugruppenbild unterscheidbar.
    // Alt-Bundles ohne `stuecke` fallen auf die Einzellinie zurueck.
    if (st.stuecke_sicht && st.stuecke_sicht.length) {
      for (const p of st.stuecke_sicht)
        s += `<line x1="${x}" y1="${Y(p.z0_mm)}" x2="${x}" y2="${Y(p.z1_mm)}" `
          + `stroke="${stueckFarbe(p.art)}" stroke-width="2.4"/>`;
    } else {
      s += `<line x1="${x}" y1="${Y(st.z_unten_mm)}" x2="${x}" y2="${Y(st.zeichen_oben_mm)}" `
        + `stroke="${FARBE.stange}" stroke-width="2.4"/>`;
    }
    // NACHZIEHPUNKT [P-6] (#110/#106): die folgenden Anker-, Kopplungs- und Plattenformen sind
    // die ALTEN (Kreis/flacher Balken) und laufen damit gegen die vereinfachte Seitenansicht,
    // die `mutterSvg`/`kopplungsmutterSvg`/`spannplatteSvg`/`schraubeSvg` fuer Modul 1 und
    // Modul 7 fuehren. Das Baugruppenbild von Modul 5 stand ausdruecklich NICHT im Umfang von
    // #110 und #106 und bleibt deshalb hier bit-gleich; umgestellt wird es in einem eigenen
    // Paket. Kennfarben sind schon gemeinsam (`FARBE.mutter`/`FARBE.platte` aus `SPANN_FARBE`).
    // Es fehlen hier deshalb weiterhin: die feste Symbolgroesse (#106), die Schraube am Fuss
    // und die aufsitzende statt zentrierte Mutter ([A-19]/#97).
    // Fussanschluss
    if (st.anker_unten === "bodenblech") s += `<circle cx="${x}" cy="${Y(st.z_unten_mm)}" r="2.8" fill="${FARBE.mutter}"/>`;
    else s += `<rect x="${x - pw / 2}" y="${Y(st.z_unten_mm) - 3}" width="${pw}" height="3" fill="${FARBE.platte}"/>`;
    // Kopplungen in diesem Abschnitt
    for (const zk of st.kopplungen_mm)
      s += `<rect x="${x - 4.5}" y="${Y(zk) - 3}" width="9" height="6" rx="1.5" fill="${FARBE.mutter}"/>`;
    // Kopf: abgeschlossen -> Platte/Mutter, sonst offenes Stangenende (ueberstehend)
    if (st.abgeschlossen) {
      if (st.anker_oben === "kopfblech") s += `<circle cx="${x}" cy="${Y(st.seg_z1_mm)}" r="2.6" fill="${FARBE.mutter}"/>`;
      else s += `<rect x="${x - pw / 2}" y="${Y(st.seg_z1_mm)}" width="${pw}" height="3" fill="${FARBE.platte}"/>`;
    } else {
      s += `<circle cx="${x}" cy="${Y(st.zeichen_oben_mm)}" r="2.2" fill="#fff" stroke="${FARBE.stange}" stroke-width="1.4"/>`;
    }
    // Positions-Chip (gestaffelt gegen Überlappung)
    const cy = Y(st.zeichen_oben_mm) - ((i % 2) ? 8 : 19);
    const lbl = posCm(st.x_mm).replace(" cm", "");
    s += `<rect x="${x - 17}" y="${cy - 9}" width="34" height="11" rx="2" fill="${FARBE.stange}"/>`
      + `<text x="${x}" y="${cy - 0.8}" font-size="8" fill="#fff" text-anchor="middle">${lbl}</text>`;
  });

  // Ereignishoehen als gestrichelte Linie mit Beschriftung
  for (const e of ab.ereignisse) {
    const y = Y(Math.min(e.z_mm, zTop));
    s += `<line x1="${X(0) - 6}" y1="${y}" x2="${X(L) + 6}" y2="${y}" stroke="${FARBE.oeffnung}" `
      + `stroke-width="0.8" stroke-dasharray="4 3" stroke-opacity="0.75"/>`;
    const t = _kurzEreignis(e);
    s += `<rect x="${X(L) + 6 - (t.length * 4.6 + 6)}" y="${y - 12}" width="${t.length * 4.6 + 6}" height="10.5" fill="#fff" fill-opacity="0.85"/>`
      + `<text x="${X(L) + 4}" y="${y - 3.8}" font-size="8" fill="${FARBE.oeffnung}" text-anchor="end">${t}</text>`;
  }

  // Zuschnitt-Legende — Teil des SVG, damit Vorschau (Modul 5) und Export garantiert
  // dasselbe Bild zeigen. Nur die Arten, die in DIESEM Abschnitt gezeichnet wurden;
  // ohne `stuecke` (Alt-Bundle) entfaellt sie ersatzlos ([D-4]).
  s += _zuschnittLegende(w, ab, padL, vbH - 6);

  // Kopfzeile
  if (ab.art === "schnitt0") {
    s += `<text x="${padL - 6}" y="14" font-size="11" fill="${FARBE.text}">`
      + `Schnitt 0 · Bodenblech und erste Gewindestangen · ohne Steinreihen · `
      + `${ab.straenge.length} Vorspannstränge · Blick von vorne, x ab links · Raster 12,5 cm</text>`;
    s += `<text x="${padL - 6}" y="26" font-size="9" fill="${FARBE.text}">`
      + `Zahl im Chip = Strangposition ab links (cm) · offenes Stangenende = Kopplung folgt · Maßstab wie in allen Abschnitten</text>`;
  } else {
    s += `<text x="${padL - 6}" y="14" font-size="11" fill="${FARBE.text}">`
      + `Abschnitt ${ab.nr} · ${ab.reihen_text} · Höhe ${posCm(ab.z_von_mm)}–${posCm(ab.z_bis_mm)} · `
      + `${ab.straenge.length} Vorspannstränge · Blick von vorne, x ab links · Raster 12,5 cm</text>`;
    s += `<text x="${padL - 6}" y="26" font-size="9" fill="${FARBE.text}">`
      + `Zahl links = Steinreihe · Zahl im Chip = Strangposition ab links (cm) · offenes Stangenende = Kopplung folgt</text>`;
  }
  return s;
}

/**
 * Legende des Zuschnitts (Stueckarten) fuer ein Baugruppenbild — dieselbe Reihenfolge
 * und dieselben Texte wie in Modul 1 und Modul 7 ([D-4]). Leer, wenn nichts stueckweise
 * gezeichnet wurde.
 *
 * Seit der realen Bodenblechzerlegung fuehrt sie zusaetzlich den Blechstoss und — nur
 * bei tatsaechlich vorhandenem Teil — den Sonderzuschnitt des Bodenblechs samt seinem
 * NICHT FARBLICHEN Merkmal in Worten. Beides steht ausdruecklich nur dann da, wenn es
 * auch gezeichnet wurde: eine Kennzeichnung ohne Gegenstand waere derselbe leere
 * Kasten, den [D-4] schon fuer die Stueckarten ausschliesst.
 */
function _zuschnittLegende(w, ab, x0, y) {
  const arten = ["standard", "sonder", "rest"]
    .filter(a => (ab.straenge || []).some(st => (st.stuecke_sicht || []).some(p => p.art === a)));
  const stoss = bodenblechStoesse(w).length > 0;
  const sonderBlech = bodenblechTeile(w).some(t => t.art === "sonder");
  if (!arten.length && !stoss && !sonderBlech) return "";
  let lx = x0;
  let s = `<text x="${lx}" y="${y}" font-size="9" fill="${FARBE.text}">Zuschnitt:</text>`;
  lx += 52;
  for (const a of arten) {
    s += `<line x1="${lx}" y1="${y - 3}" x2="${lx + 14}" y2="${y - 3}" stroke="${stueckFarbe(a)}" stroke-width="2.6"/>`
      + `<text x="${lx + 18}" y="${y}" font-size="9" fill="${FARBE.text}">${STUECK_LABEL[a]}</text>`;
    lx += 26 + STUECK_LABEL[a].length * 5;
  }
  if (stoss) {
    const t = BLECHSTOSS.label;
    // Das Feld zeigt die Marke SO, WIE SIE IM BLATT STEHT (#91): eine weisse Linie IN
    // einem stahlfarbenen Blechfeld. Eine weisse Linie auf dem hellen Blattgrund allein
    // waere unsichtbar, eine schwarze zeigte eine Farbe, die es im Blatt nicht mehr gibt.
    s += `<rect x="${lx}" y="${y - 7}" width="14" height="6" fill="${FARBE.stahl}" `
      + `stroke="${FARBE.stahl_rand}" stroke-width="0.5"/>`
      + `<line x1="${lx + 7}" y1="${y - 7}" x2="${lx + 7}" y2="${y - 1}" stroke="${BLECHSTOSS.farbe}" stroke-width="1.6"/>`
      + `<text x="${lx + 18}" y="${y}" font-size="9" fill="${FARBE.text}">${t}</text>`;
    lx += 26 + t.length * 5;
  }
  if (sonderBlech) {
    const t = `Bodenblech ${STUECK_LABEL.sonder} (schraffiert)`;
    s += `<rect x="${lx}" y="${y - 7}" width="14" height="6" fill="${STUECK_FARBE.sonder}" `
      + `stroke="${FARBE.stahl_rand}" stroke-width="0.5"/>`
      + `<line x1="${lx + 5}" y1="${y - 7}" x2="${lx + 5}" y2="${y - 1}" stroke="${FARBE.stahl_rand}" stroke-width="0.5"/>`
      + `<line x1="${lx + 10}" y1="${y - 7}" x2="${lx + 10}" y2="${y - 1}" stroke="${FARBE.stahl_rand}" stroke-width="0.5"/>`
      + `<text x="${lx + 18}" y="${y}" font-size="9" fill="${FARBE.text}">${t}</text>`;
  }
  return s;
}

/** Kurzlabel eines Ereignisses fuer die Zeichnung. */
function _kurzEreignis(e) {
  const h = posCm(e.z_mm);
  if (e.art === "fuss") return "Bodenblech + 1. Stange " + h;
  if (e.art === "neustart") return "neue Stange " + h;
  if (e.art === "kopplung") return "Kopplung " + h;
  return "Abschluss " + h;
}

/**
 * Bemaßungsschicht (mm) — einheitlich mit den anderen Modulen: Wandlänge/-höhe und
 * Öffnungsmaße, optional das 12,5-cm-/20-cm-Raster.
 */
function _dimLayer(X, Y, w, opts) {
  const G = _grid(w), C = _course(w), L = w.length_mm, H = w.height_mm;
  if (!opts.masse && !opts.raster) return "";
  const CO = "#46505e", A = FARBE.oeffnung, GR = "#9aa3ad";
  const mC = mm => _fmt(mm / 10, (mm / 10) % 1 !== 0 ? 1 : 0) + " cm", mM = mm => _fmt(mm / 1000, 2) + " m";
  const tk = (x, y, v) => v ? `<line x1="${x - 3}" y1="${y - 3}" x2="${x + 3}" y2="${y + 3}" stroke="${CO}" stroke-width="1"/>`
    : `<line x1="${x - 3}" y1="${y + 3}" x2="${x + 3}" y2="${y - 3}" stroke="${CO}" stroke-width="1"/>`;
  const lab = (x, y, t, c) => `<rect x="${x - (t.length * 2.9 + 3)}" y="${y - 9.6}" width="${t.length * 5.8 + 6}" height="11" rx="1.5" fill="#fff" fill-opacity="0.82"/>`
    + `<text x="${x}" y="${y - 1.5}" font-size="9" fill="${c || CO}" text-anchor="middle">${t}</text>`;
  const hD = (ax, bx, yp, t, c) => { const cc = c || CO; return `<line x1="${ax}" y1="${yp}" x2="${bx}" y2="${yp}" stroke="${cc}" stroke-width="1"/>` + tk(ax, yp) + tk(bx, yp) + lab((ax + bx) / 2, yp, t, cc); };
  const vD = (ay, by, xp, t, c) => { const cc = c || CO; const m = (ay + by) / 2; return `<line x1="${xp}" y1="${ay}" x2="${xp}" y2="${by}" stroke="${cc}" stroke-width="1"/>` + tk(xp, ay, 1) + tk(xp, by, 1)
    + `<text x="${xp - 3.5}" y="${m + 3}" font-size="9" fill="${cc}" text-anchor="middle" transform="rotate(-90 ${xp - 3.5} ${m + 3})">${t}</text>`; };
  let s = "";
  if (opts.raster) {
    for (let gx = 0; gx <= L + 1e-6; gx += G) s += `<line x1="${X(gx)}" y1="${Y(H)}" x2="${X(gx)}" y2="${Y(0)}" stroke="${GR}" stroke-width="0.6" stroke-opacity="0.3"/>`;
    for (let gy = 0; gy <= H + 1e-6; gy += C) s += `<line x1="${X(0)}" y1="${Y(gy)}" x2="${X(L)}" y2="${Y(gy)}" stroke="${GR}" stroke-width="0.6" stroke-opacity="0.3"/>`;
  }
  if (opts.masse) {
    s += hD(X(0), X(L), Y(0) + 20, mM(L));
    s += vD(Y(H), Y(0), X(0) - 20, mM(H));
    for (const o of (w.openings || [])) {
      const l = X(o.g0 * G), r = X(o.g1 * G), t = Y(o.l1 * C), b = Y(o.l0 * C);
      s += hD(l, r, t - 6, mC((o.g1 - o.g0) * G), A);
      s += vD(t, b, l - 6, mC((o.l1 - o.l0) * C), A);
      if (o.l0 > 0) s += vD(b, Y(0), l - 6, mC(o.l0 * C), A);
    }
  }
  return s;
}

/**
 * Wandueberblick (Kontur, Öffnungen, Reihennummern) — Orientierungsbild.
 * Mit `ab` wird der Reihenbereich dieses Abschnitts hervorgehoben.
 * @param {any} w @param {any} [ab] @param {number} [vbW] @param {number} [vbH]
 * @param {{masse?:boolean,raster?:boolean}} [opts]
 */
export function konturSvg(w, ab = null, vbW = 900, vbH = 250, opts = {}) {
  const C = _course(w), G = _grid(w), L = w.length_mm, H = w.height_mm;
  const zeig_masse = opts.masse !== false, zeig_raster = !!opts.raster;
  const padL = zeig_masse ? 62 : 44, padR = 24, padT = 16, padB = zeig_masse ? 40 : 26;
  const sc = Math.min((vbW - padL - padR) / L, (vbH - padT - padB) / H);
  const yBase = padT + H * sc;
  const X = x => padL + x * sc, Y = z => yBase - z * sc;
  const von = ab ? ab.reihen.von : 0, bis = ab ? ab.reihen.bis : -1;
  let s = "";
  for (const c of (w.courses || [])) {
    const hi = (c.lage + 1 >= von && c.lage + 1 <= bis);
    for (const st of c.stones)
      s += `<rect x="${X(st.x0)}" y="${Y((c.lage + 1) * C)}" width="${(st.x1 - st.x0) * sc}" height="${C * sc}" `
        + `fill="${hi ? FARBE.stange : (st.type === "i3" ? "#dfe2e6" : FARBE.i3)}" fill-opacity="${hi ? 0.8 : 1}" `
        + `stroke="#aeb3ba" stroke-width="0.6"/>`;
  }
  for (const o of (w.openings || []))
    s += `<rect x="${X(o.g0 * G)}" y="${Y(o.l1 * C)}" width="${(o.g1 - o.g0) * G * sc}" height="${(o.l1 - o.l0) * C * sc}" `
      + `fill="#fff" stroke="${FARBE.oeffnung}" stroke-width="1.1" stroke-dasharray="4 3"/>`;
  s += `<polyline points="${_konturPunkte(w).map(p => X(p[0]) + "," + Y(p[1])).join(" ")}" fill="none" `
    + `stroke="${FARBE.kontur}" stroke-width="1.3"/>`;
  // Auch der Wandueberblick zeigt die realen Bodenblechteile und ihre Stoesse — sonst
  // stuende ueber dem Baugruppenbild eine widerspruechliche Vollplatte. Derselbe
  // gemeinsame Zeichenweg, dieselben kumulierten Stosspositionen.
  const bth = Math.max(2.5, 15 * sc);
  s += bodenblechSvg(w, X, Y, sc, bth, { rand: 0.5 });
  for (const col of (w.tension_columns || [])) for (const sg of _segmente(w, col))
    s += `<line x1="${X(col.x_mm)}" y1="${Y(sg.z0_mm)}" x2="${X(col.x_mm)}" y2="${Y(sg.z1_mm)}" `
      + `stroke="${FARBE.stange}" stroke-width="0.9" stroke-opacity="0.55"/>`;
  const L_ = _lagen(w);
  for (let r = 0; r < L_; r++) {
    const yc = Y(r * C) - C * sc / 2 + 3;
    const zeig = (C * sc >= 9) || (r === 0) || (r === L_ - 1) || ((r + 1) % 5 === 0) || (r + 1 === von) || (r + 1 === bis);
    if (zeig) s += `<text x="${X(0) - 6}" y="${yc}" font-size="8.5" fill="${(r + 1 >= von && r + 1 <= bis) ? "#1f6feb" : "#8f96a0"}" text-anchor="end">${r + 1}</text>`;
  }
  s += _dimLayer(X, Y, w, { masse: zeig_masse, raster: zeig_raster });
  s += `<text x="${padL}" y="${vbH - 4}" font-size="9.5" fill="${FARBE.text}">`
    + `Wand ${_fmt(L / 1000, 3)} × ${_fmt(H / 1000, 2)} m · ${L_} Steinreihen · Blick von vorne, x ab links`
    + (ab ? ` · hervorgehoben: ${ab.reihen_text}` : "") + "</text>";
  return s;
}

// ------------------------------------------------------------------- Seiten

/** Gemeinsames Stylesheet der Montageanleitung (Vorschau-Druck UND Export). */
export const MONTAGE_CSS = `
  @page{size:A4 portrait;margin:12mm}
  .mdoc{font-family:system-ui,Arial,sans-serif;color:#1c2430;font-size:12px;line-height:1.45}
  .mseite{page-break-after:always;break-after:page;page-break-inside:avoid;padding:0 0 6px}
  .mseite:last-child{page-break-after:auto;break-after:auto}
  .mkopf{display:flex;justify-content:space-between;font-size:10px;color:#6b7682;border-bottom:1px solid #e5e7eb;padding-bottom:3px;margin-bottom:8px}
  .mdoc h1{font-size:17px;margin:0 0 6px} .mdoc h2{font-size:13.5px;margin:12px 0 6px;color:#333}
  .mdoc h3{font-size:12px;margin:10px 0 4px;color:#46505e}
  .mdoc p{margin:4px 0}
  .mbild{border:1px solid #e5e7eb;border-radius:6px;margin:8px 0;page-break-inside:avoid}
  .mbild svg{width:100%;height:auto;display:block}
  ol.mev{margin:6px 0;padding-left:18px} ol.mev li{margin:5px 0}
  .mev .art{display:inline-block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#1f6feb;margin-right:5px}
  table.mtab{width:100%;border-collapse:collapse;font-size:11.5px}
  table.mtab td,table.mtab th{padding:3px 4px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}
  table.mtab td:last-child,table.mtab th:last-child{text-align:right;font-variant-numeric:tabular-nums}
  .mhinweis{font-size:10.5px;color:#6b7682;border-top:1px solid #e5e7eb;margin-top:10px;padding-top:6px;line-height:1.5}
`;

/** Kurzlabel der Ereignisarten (Vorschau UND Dokument). */
export const ART_LABEL = { fuss: "Erste Stange", neustart: "Neue Stange", kopplung: "Kopplung", abschluss: "Oberer Abschluss" };

/** Kurz-Stückliste (nur Menge > 0) als HTML-Zeilen — Mengen aus sembla-bom.js. */
function _bomRows(w) {
  return semblaBomItems(w).filter(it => it.menge > 0)
    .map(it => `<tr><td>${it.label}</td><td>${semblaBomMenge(it)}</td></tr>`).join("");
}

/**
 * Seiten der Montageanleitung: Übersichtsseite + je Baugruppenabschnitt eine Seite.
 * Dieselbe Ableitung/Zeichnung nutzen die Vorschau in Modul 5 und der zentrale Export.
 * @param {any} w Wandelement @param {any} [eingaben] Eingaben-Modell (genutzt: `projekt`)
 * @returns {Array<{art:string,titel:string,html:string,abschnitt:any}>}
 */
export function montageSeiten(w, eingaben = {}) {
  const projekt = (eingaben && eingaben.projekt) || {};
  const abschnitte = montageAbschnitte(w);
  const anzahl = abschnitte.length + 1;
  const pName = projekt.name || w.name || "SEMBLA-Projekt";
  const wName = w.name || "Wandelement";
  const kopf = nr => `<div class="mkopf"><span>${_esc(pName)} · Wand ${_esc(wName)}</span>`
    + `<span>Montageanleitung · Seite ${nr} von ${anzahl}</span></div>`;
  const seiten = [];

  // --- Seite 1: Übersicht (Wand-/Projektbezug, Kontur, Ablauf, Kurz-Stückliste)
  let u = kopf(1);
  u += `<h1>Montageanleitung — ${_esc(wName)}</h1>`;
  u += `<p>Projekt <b>${_esc(pName)}</b>${projekt.plan_nr ? " · Plan-Nr. " + _esc(projekt.plan_nr) : ""}`
    + `${projekt.index ? " · Index " + _esc(projekt.index) : ""}. Maße `
    + `${_fmt(w.length_mm / 1000, 3)} × ${_fmt(w.height_mm / 1000, 2)} m · ${w.N_grid} Raster · `
    + `${_lagen(w)} Steinreihen · ${(w.tension_columns || []).length} Vorspannstränge · `
    + `${abschnitte.filter(ab => ab.art !== "schnitt0").length} Baugruppenabschnitte`
    + `${abschnitte.some(ab => ab.art === "schnitt0") ? " (zzgl. Schnitt 0)" : ""}.</p>`;
  u += `<div class="mbild"><svg viewBox="0 0 900 250" preserveAspectRatio="xMidYMid meet">${konturSvg(w, null, 900, 250)}</svg></div>`;
  u += "<h2>Ablauf der Baugruppenabschnitte</h2><table class=\"mtab\">"
    + "<tr><th>Abschnitt</th><th>Ereignis(se)</th><th>Steinreihen</th></tr>"
    + abschnitte.map(ab => `<tr><td>${ab.art === "schnitt0" ? "Schnitt 0" : ab.nr}</td>`
      + `<td>${ab.ereignisse.map(e => _esc(e.titel)).join("<br>")}</td>`
      + `<td>${ab.art === "schnitt0" ? "—" : ab.reihen.von + "–" + ab.reihen.bis}</td></tr>`).join("")
    + "</table>";
  u += `<h2>Stückliste (Kurzform)</h2><table class="mtab">${_bomRows(w)}</table>`;
  u += `<div class="mhinweis"><b>Hinweis.</b> Aufbau von unten, Steinreihen durchgehend nummeriert
    (Reihe 1 = unterste Reihe, je 20 cm). i3-Steine maximiert, i2 nur als Abschluss an den Enden,
    Versatz beachten. Vorspannung in den durchgehenden Hohlkammern; Zwischenkopplungen handfest
    (Lagesicherung), Endvorspannung über die Stahlbleche/Spannplatten. Eine Kopplung wird immer
    <b>vor</b> der Steinreihe gesetzt, die die Stangenoberkante überschneidet — die Mutter bleibt
    zugänglich. Die vollständige Stückliste mit Preisen liefert Modul „Stückliste“.</div>`;
  seiten.push({ art: "uebersicht", titel: "Übersicht", abschnitt: null, html: `<section class="mseite">${u}</section>` });

  // --- Folgeseiten: Schnitt 0 (falls vorhanden) und je Abschnitt eine Seite
  abschnitte.forEach((ab, i) => {
    const s0 = ab.art === "schnitt0";
    let b = kopf(i + 2);
    b += `<h1>${_esc(ab.titel)}</h1>`;
    b += s0
      ? `<p><b>Vorbereitende Fuß-Baugruppe</b> · ${ab.straenge.length} Stränge · noch <b>keine Steinreihen</b>. `
        + `Diese Darstellung zeigt ausschließlich Bodenblech/Grundplatte und die ersten Gewindestangen; `
        + `die Steinreihen folgen ab Abschnitt 1.</p>`
      : `<p><b>${ab.reihen_text}</b> · Höhe ${posCm(ab.z_von_mm)} bis ${posCm(ab.z_bis_mm)} · `
        + `${ab.straenge.length} Stränge in diesem Abschnitt.</p>`;
    b += `<h3>Ereignisse in ${s0 ? "Schnitt 0" : "diesem Abschnitt"}</h3><ol class="mev">`
      + ab.ereignisse.map(e => `<li><span class="art">${ART_LABEL[e.art]} · ${posCm(e.z_mm)}</span>${e.text}</li>`).join("")
      + "</ol>";
    b += s0 ? "<h3>Fuß-Baugruppe ohne Steinreihen</h3>" : `<h3>Danach montieren: ${ab.reihen_text}</h3>`;
    b += `<div class="mbild"><svg viewBox="0 0 900 430" preserveAspectRatio="xMidYMid meet">${abschnittSvg(w, ab, 900, 430)}</svg></div>`;
    if (!s0) b += `<div class="mbild"><svg viewBox="0 0 900 210" preserveAspectRatio="xMidYMid meet">${konturSvg(w, ab, 900, 210)}</svg></div>`;
    b += `<h3>Bauteilpositionen ${s0 ? "in Schnitt 0" : "dieses Abschnitts"}</h3><table class="mtab">`
      + "<tr><th>Strang x (ab links)</th><th>Stange von–bis</th><th>Anschluss oben</th></tr>"
      + ab.straenge.map(st => `<tr><td>${posCm(st.x_mm)}</td>`
        + `<td>${posCm(st.z_unten_mm)} – ${posCm(st.z_oben_real_mm)}</td>`
        + `<td>${st.abgeschlossen ? (st.anker_oben === "kopfblech" ? "Kopfblech + Spannmutter" : "Spannplatte + Spannmutter") : "Kopplungsmutter (Stange läuft weiter)"}</td></tr>`).join("")
      + "</table>";
    seiten.push({ art: s0 ? "schnitt0" : "abschnitt", titel: ab.titel, abschnitt: ab, html: `<section class="mseite">${b}</section>` });
  });
  return seiten;
}

/** Seiten-HTML (ohne Dokumenthülle) — identisch in Vorschau-Druck und Export. */
export function montageSeitenHtml(w, eingaben) {
  return `<div class="mdoc">${montageSeiten(w, eingaben).map(s => s.html).join("")}</div>`;
}

/** Vollstaendiges, selbsttragendes Dokument (A4, druckbar). */
export function montageDokument(w, eingaben) {
  const titel = "SEMBLA Montageanleitung — " + (w.name || "Wandelement");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${_esc(titel)}</title>`
    + `<style>body{margin:0 auto;max-width:190mm;padding:10mm}${MONTAGE_CSS}</style></head>`
    + `<body>${montageSeitenHtml(w, eingaben)}</body></html>`;
}
