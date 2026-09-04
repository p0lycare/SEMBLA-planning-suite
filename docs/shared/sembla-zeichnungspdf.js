// @ts-check
/**
 * SEMBLA Zeichnungs-PDF — die gesammelte Blattausgabe je Geschoss (Issue #98).
 *
 * ZWECK. Bis hierher gab es in der Suite ueberhaupt keinen Dateiweg fuer eine
 * Zeichnung: Modul 7 und Modul 9 drucken ihr Blatt (`window.print()`), und der
 * zentrale Export in Modul 0 bietet Zeichnungen nicht an. Wer die Unterlagen eines
 * Geschosses braucht, druckt heute Blatt fuer Blatt von Hand — mit einem
 * Zeigerwechsel je Wand. Dieser Baustein macht daraus EINEN Download: ein ZIP mit
 * genau einer PDF je Geschoss, darin zuerst der Lageplan und danach je zugeordneter
 * Wand genau ein technisches Wandblatt.
 *
 * ABLEITUNG ≠ RASTERUNG — der Punkt, an dem dieser Baustein haengt. Hier wird
 * NICHTS gezeichnet und NICHTS gerechnet: keine Geometrie, kein Masstab, keine
 * Kontur, keine Menge, kein Schriftfeld. Gelesen werden ausschliesslich die beiden
 * KANONISCHEN Vollblattableitungen —
 *
 *     `sembla-lageplan.js`  blattHtml(daten, opts)   ([N-1] … [N-9])
 *     `sembla-zeichnung.js` blattHtml(w, eing, opts) ([D-6]: „es gibt keine zweite
 *                                                     Blatt-/Zeichenlogik")
 *
 * — und in ein anderes Dateiformat verpackt. Das Verhaeltnis dieses Bausteins zum
 * Blatt ist dasselbe wie das von `zip.js` zu den Dateien: er kennt seinen Inhalt
 * nicht. Ein zweiter Zeichen- oder Rechenpfad entsteht dadurch nicht.
 *
 * PAPIERGENAU OHNE UMRECHNUNG. `ZEICHNUNG_CSS`/`LAGEPLAN_CSS` geben `.zsheet`/
 * `.lpsheet` seit #61/#89 ihre Groesse FEST in Papier-mm (`blattInnen(format)`),
 * damit Vorschau und Ausdruck dieselbe Box sind. Genau davon lebt die PDF-Seite:
 * MediaBox = `BLATT[format].papier_mm`, das Blattbild sitzt bei `rand_mm` und ist
 * exakt `blattInnen()` gross. Das ist eine reine Platzierung — kein Reskalieren,
 * kein Umbruch; der Norm-Masstab nach [D-2]/[N-8] bleibt unberuehrt.
 *
 * GERASTERT, UND DAS AUSDRUECKLICH. Eine Seite traegt genau EIN Bild des fertigen
 * Blattes. Das ist der Preis dafuer, das VOLLSTAENDIGE Blatt (Zeichnung UND
 * Tabellen UND Legende UND Schriftfeld) zu zeigen, ohne seine Darstellung ein
 * zweites Mal zu bauen — Text im PDF ist deshalb nicht markierbar. Der
 * Planhintergrund ([N-9]) reist dabei ohne Zutun mit: er steckt als Data-URL im
 * Blatt und wird mitgerastert.
 *
 * REIN UND LESEND. Kein Speicherzugriff, kein aktiver Zeiger, keine Mutation:
 * Mappe, Wandelemente, Eingaben und Planbilder werden nur GELESEN, und die Leser
 * werden uebergeben (dasselbe Muster wie `hierarchieExport`). Kein neues
 * gespeichertes Feld, kein Schema-/Formatversionssprung, keine neue Regel-ID.
 *
 * DOM. Wie `zip.js` („kein DOM ausser der Download-Hilfe") enthaelt diese Datei
 * genau EINE DOM-nutzende Funktion: `blattBild()`, die Rasterhilfe des Browsers.
 * Alles andere ist rein und laeuft in Node — deshalb ist die PDF-Struktur im Test
 * deterministisch pruefbar, waehrend die Pixel dem Browser gehoeren.
 *
 * ES-Modul.
 */

import * as MAPPE from "./sembla-projektmappe.js";
import {
  BLATT as BLATT_LP, blattHtml as lageplanBlatt, blattInnen as blattInnenLp,
  druckCss as druckCssLp, lageplanDaten, lageplanTitel, LAGEPLAN_CSS,
  normOptionen as normOptionenLp,
} from "./sembla-lageplan.js";
import {
  BLATT as BLATT_Z, blattHtml as wandBlatt, blattInnen as blattInnenZ,
  druckCss as druckCssZ, normOptionen as normOptionenZ, optionenAusEingaben,
  zeichnungTitel, ZEICHNUNG_CSS,
} from "./sembla-zeichnung.js";

// --------------------------------------------------------------- Konstanten

/**
 * Rasterdichte der Blattbilder in Punkten je Zoll. 300 dpi ist der uebliche
 * Planwert: ein A3-Blatt wird damit 4961 × 3508 Bildpunkte, eine 0,16-mm-Masslinie
 * knapp zwei Punkte breit — duenn, aber durchgehend. Der Wert ist bewusst eine
 * Konstante und keine Bedienoption: er ist eine Eigenschaft der Ausgabe, keine
 * fachliche Entscheidung, und ein verstellbarer Wert waere ein zweiter Grund,
 * warum zwei Ausdrucke desselben Blattes verschieden aussehen.
 */
export const DPI = 300;

/** CSS-Referenzaufloesung: 1 CSS-Pixel = 1/96 Zoll (fest in jedem Browser). */
const CSS_DPI = 96;

/**
 * Die Regeln, die `druckCss()` im `@media print`-Block setzt und die beim Rastern
 * sonst ausfielen — der Bildschirmrahmen ist eine Bildschirmzugabe und gehoert
 * nicht aufs Papier. Erfunden wird hier nichts: es ist woertlich die Entscheidung
 * der beiden Ausgabemodule (`.zsheet{outline:none;box-shadow:none}` bzw.
 * `.lpsheet{…}`), nur ohne die Medienabfrage, die im Bild nie greifen kann.
 */
const DRUCK_ZUSATZ = ".zsheet{outline:none;box-shadow:none}"
  + ".lpsheet{outline:none;box-shadow:none}";

// ------------------------------------------------------------- Dateinamen

/**
 * Dateisicherer Namensstamm. Bewusst LOKAL und nicht aus `sembla-archiv.js`
 * importiert: der Zeichnungsexport haengt fachlich nicht am Projektarchiv, und
 * `sembla-lageplan.js` haelt sich fuer `dateiRumpf()` aus demselben Grund eine
 * eigene Fassung. Es ist eine Schreibweise, keine Fachregel.
 * @param {any} name @returns {string}
 */
export function sicherStamm(name) {
  const um = { "\u00e4": "ae", "\u00f6": "oe", "\u00fc": "ue", "\u00c4": "Ae", "\u00d6": "Oe",
    "\u00dc": "Ue", "\u00df": "ss" };
  return String(name == null ? "" : name)
    // Umlaute werden UEBERTRAGEN statt getilgt: „Gebaeude" liest sich, „Geb_ude"
    // nicht. Das ist eine Schreibweise fuer Dateinamen und beruehrt keinen
    // gespeicherten Namen — in Mappe und Blatt steht weiter der echte.
    .replace(/[\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df]/g, (c) => um[c])
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unbenannt";
}

/**
 * Verstaendliche und zugleich kollisionsfreie Dateinamen je Geschoss.
 *
 * Zuerst der sprechende Name `Gebaeude_Geschoss`. Weil das Gebaeude darin steht,
 * kollidieren zwei „EG" in verschiedenen Gebaeuden gar nicht erst; erst wenn ein
 * Gebaeude zwei gleichnamige Geschosse fuehrt, bekommen ALLE Mitglieder dieser
 * Gruppe ihre Kennung angehaengt — nicht nur die spaeteren. Sonst haenge die
 * Benennung an der Reihenfolge, und dasselbe Geschoss hiesse in zwei
 * Exportlaeufen verschieden.
 * @param {Array<{id:string, gebaeude:string, geschoss:string}>} eintraege
 * @returns {string[]}
 */
export function pdfNamen(eintraege) {
  const roh = eintraege.map((e) => `${sicherStamm(e.gebaeude)}_${sicherStamm(e.geschoss)}`);
  const zaehler = new Map();
  for (const r of roh) zaehler.set(r, (zaehler.get(r) || 0) + 1);
  return roh.map((r, i) => (zaehler.get(r) > 1 ? `${r}__${sicherStamm(eintraege[i].id)}` : r) + ".pdf");
}

/** Name des ZIP-Archivs (ohne Endung) — der Bezug ist das gewaehlte Projekt. */
export function zipName(mappe) {
  const m = MAPPE.normMappe(mappe);
  return "SEMBLA_Zeichnungen_" + sicherStamm(m.projekt.name || "Projekt");
}

// ------------------------------------------------------------- Blattfolge

/**
 * Die Seiten EINES Geschosses: Lageplan zuerst, danach je zugeordneter Wand
 * genau ein Wandblatt — beides in der Reihenfolge der Projektmappe.
 *
 * Gerechnet wird nichts: `lageplanDaten()` leitet nach [N-3] bei jedem Aufruf
 * frisch aus Mappe und kanonischem Loeserergebnis ab, `blattHtml()` baut daraus
 * das Blatt. Fehlt das Wandelement, ist das ein verwaister Eintrag ([L-4]): er
 * wird BENANNT und uebersprungen, nie durch geratene Werte ersetzt.
 *
 * `format` betrifft AUSSCHLIESSLICH den Lageplan (Modul 9 kennt keine gespeicherte
 * Formatwahl, Standard A3); das Wandblatt folgt `eingaben.zeichnung` ([D-7]).
 *
 * @param {{mappe:any, geschossId:string, elemente:any[],
 *   leseEingaben:(id:string)=>any, hintergrund?:any, format?:string}} p
 * @returns {{seiten:Array<object>, luecken:string[]}}
 */
export function blaetterFuerGeschoss(p) {
  const format = (p.format === "a4" || p.format === "a3") ? p.format : "a3";
  /** @type {Array<object>} */
  const seiten = [];
  /** @type {string[]} */
  const luecken = [];
  const treffer = MAPPE.findeGeschoss(p.mappe, p.geschossId);
  if (!treffer) throw new Error(`Geschoss „${p.geschossId}“ gibt es in dieser Projektmappe nicht.`);
  const gs = treffer.geschoss;
  const ort = `${treffer.gebaeude.name} · ${gs.name}`;

  // --- Seite 1: der Lageplan des Geschosses ([N-1] … [N-9]) ---------------
  const lpOpt = normOptionenLp({ format });
  const daten = lageplanDaten({
    mappe: p.mappe, geschossId: p.geschossId, elemente: p.elemente,
    hintergrund: p.hintergrund,
  });
  const lp = lageplanBlatt(daten, lpOpt);
  seiten.push({
    art: "lageplan",
    titel: lageplanTitel(daten, lp.masstab),
    html: lp.html,
    css: LAGEPLAN_CSS + druckCssLp(lp.format) + DRUCK_ZUSATZ,
    format: lp.format,
    papier_mm: { ...BLATT_LP[lp.format].papier_mm },
    rand_mm: BLATT_LP[lp.format].rand_mm,
    blatt_mm: blattInnenLp(/** @type {any} */ (lp.format)),
  });

  // --- Danach je Wand ein vollstaendiges Wandblatt ([D-6]) ----------------
  const nachId = new Map();
  for (const e of (Array.isArray(p.elemente) ? p.elemente : [])) {
    if (e && e.id != null) nachId.set(String(e.id), e);
  }
  for (const w of gs.waende) {
    const el = nachId.get(String(w.id));
    if (!el || !el.wandelement) {
      luecken.push(`${ort} · „${w.name || w.id}“: kein Wandelement im Wandspeicher — `
        + "verwaister Eintrag ([L-4]); kein Wandblatt in der PDF.");
      continue;
    }
    // Kopfdaten nach [L-11] und Darstellungsoptionen nach [D-7] kommen aus
    // GENAU den Funktionen, die auch Modul 7 benutzt — hier wird nichts vorbelegt.
    const eingaben = p.leseEingaben(String(w.id)) || {};
    // KEINE Formatvorgabe von aussen: `eingaben.zeichnung` ist die in Modul 7
    // getroffene Darstellungswahl dieser Wand ([D-7]). Die Seite ist damit
    // buchstaeblich das Blatt, das Modul 7 druckt — auch wenn dadurch A3- und
    // A4-Seiten in einer Datei stehen (PDF bemasst jede Seite fuer sich).
    const zOpt = normOptionenZ(optionenAusEingaben(eingaben));
    let blatt;
    try {
      blatt = wandBlatt(el.wandelement, eingaben, zOpt);
    } catch (e) {
      luecken.push(`${ort} · „${w.name || w.id}“: das Wandblatt ist nicht ableitbar `
        + `(${e && e.message ? e.message : String(e)}); kein Wandblatt in der PDF.`);
      continue;
    }
    seiten.push({
      art: "wand",
      titel: zeichnungTitel(el.wandelement, blatt.masstab, zOpt.planinhalt),
      html: blatt.html,
      css: ZEICHNUNG_CSS + druckCssZ(blatt.format) + DRUCK_ZUSATZ,
      format: blatt.format,
      papier_mm: { ...BLATT_Z[blatt.format].papier_mm },
      rand_mm: BLATT_Z[blatt.format].rand_mm,
      blatt_mm: blattInnenZ(/** @type {any} */ (blatt.format)),
    });
  }
  return { seiten, luecken };
}

/**
 * Die Blattfolge des GANZEN Projekts — eine PDF je Geschoss, in der Reihenfolge
 * der Projektmappe. Ein Geschoss ohne Wand bekommt trotzdem seine Datei: sein
 * Lageplan ist eine vollwertige Aussage ueber ein leeres Geschoss.
 *
 * Rein und synchron: das ist die Fassung, ueber die VOR dem Download geredet
 * wird ([P-9]) — erst danach wird gerastert.
 *
 * @param {{mappe:any, elemente:any[], leseEingaben:(id:string)=>any,
 *   hintergruende?:Map<string,any>, format?:string}} p
 * @returns {{geschosse:Array<{id:string,name:string,datei:string,seiten:Array<object>}>,
 *   luecken:string[], zipName:string}}
 */
export function blaetterProjekt(p) {
  const m = MAPPE.normMappe(p.mappe);
  const orte = MAPPE.alleGeschosse(m);
  const namen = pdfNamen(orte.map((o) => ({
    id: o.geschoss.id, gebaeude: o.gebaeude.name, geschoss: o.geschoss.name,
  })));
  /** @type {Array<{id:string,name:string,datei:string,seiten:Array<object>}>} */
  const geschosse = [];
  /** @type {string[]} */
  const luecken = [];
  orte.forEach((o, i) => {
    const ort = `${o.gebaeude.name} · ${o.geschoss.name}`;
    let erg;
    try {
      erg = blaetterFuerGeschoss({
        mappe: m, geschossId: o.geschoss.id, elemente: p.elemente,
        leseEingaben: p.leseEingaben, format: p.format,
        hintergrund: p.hintergruende ? p.hintergruende.get(o.geschoss.id) : undefined,
      });
    } catch (e) {
      // Ein nicht ableitbares Geschoss bekommt KEINE halbe PDF, sondern einen Satz.
      luecken.push(`${ort}: der Lageplan ist nicht ableitbar `
        + `(${e && e.message ? e.message : String(e)}); keine PDF für dieses Geschoss.`);
      return;
    }
    for (const l of erg.luecken) luecken.push(l);
    geschosse.push({ id: o.geschoss.id, name: ort, datei: namen[i], seiten: erg.seiten });
  });
  return { geschosse, luecken, zipName: zipName(m) };
}

// ------------------------------------------------------- Rasterhilfe (DOM)

/**
 * Ein fertiges Blatt als Bild — die EINZIGE DOM-nutzende Funktion dieser Datei.
 *
 * Gerendert wird das Blatt-HTML mit seinem eigenen CSS in einem `foreignObject`,
 * das als Bild in eine Leinwand gezeichnet wird. Damit rendert der BROWSER das
 * bestehende Blatt — es wird nichts nachgebaut, und `.zsheet`/`.lpsheet` behalten
 * ihre in Papier-mm gesetzte Groesse. Die aeussere SVG-Groesse in Bildpunkten
 * skaliert dieselbe Box auf die Zieldichte; der `viewBox` bleibt die
 * CSS-Pixelgroesse des Blattes, sonst wuerde umbrochen statt vergroessert.
 *
 * Es wird nichts von aussen nachgeladen: der Planhintergrund steckt bereits als
 * Data-URL im Blatt. Deshalb bleibt die Leinwand unverunreinigt und `toBlob()`
 * darf lesen.
 *
 * @param {{html:string, css:string, blatt_mm:{w:number,h:number}}} seite
 * @param {number} [dpi]
 * @returns {Promise<{daten:Uint8Array, typ:'jpeg'|'png', breite_px:number, hoehe_px:number}>}
 */
export async function blattBild(seite, dpi = DPI) {
  const cssPx = (mm) => mm * CSS_DPI / 25.4;
  const zielPx = (mm) => Math.max(1, Math.round(mm * dpi / 25.4));
  const bw = seite.blatt_mm.w, bh = seite.blatt_mm.h;
  const breite = zielPx(bw), hoehe = zielPx(bh);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}"`
    + ` viewBox="0 0 ${cssPx(bw)} ${cssPx(bh)}">`
    + `<foreignObject x="0" y="0" width="100%" height="100%">`
    + `<div xmlns="http://www.w3.org/1999/xhtml">`
    + `<style>*{box-sizing:border-box}${seite.css}</style>${seite.html}</div>`
    + `</foreignObject></svg>`;
  // Blob statt Data-URL: ein Blatt mit Planhintergrund wird schnell mehrere
  // Megabyte gross, und eine Data-URL dieser Laenge ist nicht überall zulaessig.
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const bild = new Image();
    bild.width = breite; bild.height = hoehe;
    bild.src = url;
    // `decode()` wartet auf das FERTIG dekodierte Bild — ohne das zeichnete die
    // Leinwand eine leere Flaeche, sobald ein Planhintergrund im Blatt steckt.
    if (typeof bild.decode === "function") await bild.decode();
    else await new Promise((ja, nein) => { bild.onload = ja; bild.onerror = () => nein(new Error("Blatt nicht darstellbar.")); });
    const lw = document.createElement("canvas");
    lw.width = breite; lw.height = hoehe;
    const ctx = lw.getContext("2d");
    if (!ctx) throw new Error("Dieser Browser stellt keine 2D-Zeichenfläche bereit.");
    // Weisser Grund: das Blatt ist Papier, und ein JPEG kennt keine Transparenz.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, breite, hoehe);
    ctx.drawImage(bild, 0, 0, breite, hoehe);
    const blob = await new Promise((ja) => lw.toBlob(ja, "image/jpeg", 0.92));
    if (!blob) throw new Error("Das Blattbild konnte nicht gelesen werden.");
    return {
      daten: new Uint8Array(await blob.arrayBuffer()), typ: "jpeg",
      breite_px: breite, hoehe_px: hoehe,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --------------------------------------------------------------- PDF-Bytes

const _ENC = new TextEncoder();
const _ascii = (s) => _ENC.encode(s);

/** Byteweiser Anhaenger mit laufender Laenge — die xref braucht echte Offsets. */
function _puffer() {
  /** @type {Uint8Array[]} */
  const teile = [];
  let laenge = 0;
  return {
    get laenge() { return laenge; },
    schreibe(x) {
      const b = (x instanceof Uint8Array) ? x : _ascii(String(x));
      teile.push(b); laenge += b.length; return b.length;
    },
    fertig() {
      const out = new Uint8Array(laenge);
      let o = 0;
      for (const t of teile) { out.set(t, o); o += t.length; }
      return out;
    },
  };
}

/**
 * PDF-Textzeichenkette als UTF-16BE-Hexstring. Umlaute und typografische
 * Anfuehrungszeichen stehen in den Blatt-Titeln; PDFDocEncoding traefe sie nur
 * halb, und Klammern muessten einzeln maskiert werden.
 */
function _pdfText(s) {
  let hex = "FEFF";
  for (const zeichen of String(s == null ? "" : s)) {
    let cp = /** @type {number} */ (zeichen.codePointAt(0));
    if (cp > 0xFFFF) {                                   // Ersatzpaar
      cp -= 0x10000;
      hex += (0xD800 + (cp >> 10)).toString(16).padStart(4, "0").toUpperCase();
      hex += (0xDC00 + (cp & 0x3FF)).toString(16).padStart(4, "0").toUpperCase();
    } else {
      hex += cp.toString(16).padStart(4, "0").toUpperCase();
    }
  }
  return "<" + hex + ">";
}

/** Millimeter in PDF-Punkte (1 pt = 1/72 Zoll), auf 1/1000 gerundet. */
function _pt(mm) { return Math.round(mm * 72 / 25.4 * 1000) / 1000; }

/**
 * Ein PNG als PDF-Bildstrom OHNE Entpacken.
 *
 * Das ist kein Kunststueck, sondern eine Deckungsgleichheit: PDFs
 * `/FlateDecode` mit `/Predictor 15` ist woertlich das Zeilenfilter-Verfahren
 * von PNG. Die aneinandergehaengten IDAT-Bloecke koennen deshalb unveraendert
 * als Bildstrom stehen. Was nicht passt — Farbtiefe ≠ 8, Palette, Alphakanal,
 * Zeilensprung — wird BENANNT abgewiesen und nicht naeherungsweise gedeutet.
 */
function _pngStrom(bytes) {
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error("Das Blattbild ist kein PNG.");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8, breite = 0, hoehe = 0, tiefe = 0, farbtyp = -1, sprung = 0;
  /** @type {Uint8Array[]} */
  const idat = [];
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p);
    const typ = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const von = p + 8;
    if (typ === "IHDR") {
      breite = dv.getUint32(von); hoehe = dv.getUint32(von + 4);
      tiefe = bytes[von + 8]; farbtyp = bytes[von + 9]; sprung = bytes[von + 12];
    } else if (typ === "IDAT") {
      idat.push(bytes.subarray(von, von + len));
    } else if (typ === "IEND") break;
    p = von + len + 4;
  }
  if (tiefe !== 8 || sprung !== 0 || (farbtyp !== 0 && farbtyp !== 2)) {
    throw new Error("Dieses PNG ist nicht direkt einbettbar (nur 8 Bit, Graustufen oder RGB, "
      + "ohne Alphakanal und ohne Zeilensprung). Bitte JPEG liefern.");
  }
  const farben = farbtyp === 2 ? 3 : 1;
  const gesamt = idat.reduce((s, b) => s + b.length, 0);
  const daten = new Uint8Array(gesamt);
  let o = 0;
  for (const b of idat) { daten.set(b, o); o += b.length; }
  return {
    daten, breite, hoehe, farben,
    farbraum: farbtyp === 2 ? "/DeviceRGB" : "/DeviceGray",
    filter: "/FlateDecode",
    parms: `/DecodeParms << /Predictor 15 /Colors ${farben} /BitsPerComponent 8 /Columns ${breite} >>`,
  };
}

/**
 * Die Seiten als PDF-Bytes. Bewusst ein winziger, bildbasierter Schreiber statt
 * einer Fremdbibliothek: eine Seite traegt genau ein Bild — kein Font, kein Pfad,
 * kein Text im Inhalt —, und eine npm-Abhaengigkeit fuer neunzig Zeilen
 * Objektsyntax waere ein schlechter Tausch. Erzeugt wird ausdruecklich
 * DETERMINISTISCH: kein Datum, keine `/ID`, keine Zufallszahl. Dieselben Seiten
 * ergeben dieselben Bytes.
 *
 * Zur Orientierung im fertigen Dokument bekommt jede Seite ihr Lesezeichen mit
 * dem Blatt-Titel — dieselbe Zeichenkette, die auch oben auf dem Blatt steht.
 *
 * @param {Array<{titel:string, papier_mm:{w:number,h:number}, rand_mm:number,
 *   blatt_mm:{w:number,h:number},
 *   bild:{daten:Uint8Array, typ:'jpeg'|'png', breite_px:number, hoehe_px:number}}>} seiten
 * @returns {Uint8Array}
 */
export function pdfBytes(seiten) {
  if (!Array.isArray(seiten) || !seiten.length) throw new Error("Ohne Seite gibt es keine PDF.");
  /** @type {any[]} */
  const objekte = [];                         // Index 0 = Objekt 1
  const nr = () => objekte.length + 1;

  const KATALOG = nr(); objekte.push("");     // 1 (spaeter gefuellt)
  const BAUM = nr(); objekte.push("");        // 2
  const UMRISS = nr(); objekte.push("");      // 3

  /** @type {number[]} */
  const seitenNr = [];
  for (const s of seiten) {
    const b = s.bild;
    if (!b || !(b.daten instanceof Uint8Array) || !b.daten.length) {
      throw new Error(`Für die Seite „${s.titel}“ liegt kein Blattbild vor.`);
    }
    let strom = b.daten, farbraum = "/DeviceRGB", filter = "/DCTDecode", parms = "";
    if (b.typ === "png") {
      const png = _pngStrom(b.daten);
      strom = png.daten; farbraum = png.farbraum; filter = png.filter; parms = png.parms;
    } else if (!(b.daten[0] === 0xFF && b.daten[1] === 0xD8)) {
      throw new Error(`Das Blattbild der Seite „${s.titel}“ ist kein JPEG.`);
    }
    const bildNr = nr();
    objekte.push({
      kopf: `<< /Type /XObject /Subtype /Image /Width ${b.breite_px} /Height ${b.hoehe_px}`
        + ` /ColorSpace ${farbraum} /BitsPerComponent 8 /Filter ${filter}${parms ? " " + parms : ""}`
        + ` /Length ${strom.length} >>`,
      strom,
    });
    // Das Blatt sitzt am Papierrand und ist exakt blattInnen() gross — eine reine
    // Platzierung in Punkten, keine Skalierung des Zeichnungsinhalts ([D-2]/[N-8]).
    const x = _pt(s.rand_mm), y = _pt(s.rand_mm);
    const bw = _pt(s.blatt_mm.w), bh = _pt(s.blatt_mm.h);
    const inhalt = `q\n${bw} 0 0 ${bh} ${x} ${y} cm\n/Im0 Do\nQ\n`;
    const inhaltNr = nr();
    objekte.push({ kopf: `<< /Length ${_ascii(inhalt).length} >>`, strom: _ascii(inhalt) });
    const seiteNr = nr();
    objekte.push(`<< /Type /Page /Parent ${BAUM} 0 R /MediaBox [0 0 ${_pt(s.papier_mm.w)} ${_pt(s.papier_mm.h)}]`
      + ` /Resources << /XObject << /Im0 ${bildNr} 0 R >> >> /Contents ${inhaltNr} 0 R >>`);
    seitenNr.push(seiteNr);
  }

  // Lesezeichen: eines je Seite, in Seitenreihenfolge verkettet.
  const marken = seiten.map(() => { const n = nr(); objekte.push(""); return n; });
  seiten.forEach((s, i) => {
    objekte[marken[i] - 1] = `<< /Title ${_pdfText(s.titel)} /Parent ${UMRISS} 0 R`
      + (i > 0 ? ` /Prev ${marken[i - 1]} 0 R` : "")
      + (i < seiten.length - 1 ? ` /Next ${marken[i + 1]} 0 R` : "")
      + ` /Dest [${seitenNr[i]} 0 R /Fit] >>`;
  });

  objekte[KATALOG - 1] = `<< /Type /Catalog /Pages ${BAUM} 0 R /Outlines ${UMRISS} 0 R /PageMode /UseOutlines >>`;
  objekte[BAUM - 1] = `<< /Type /Pages /Kids [${seitenNr.map((n) => n + " 0 R").join(" ")}]`
    + ` /Count ${seitenNr.length} >>`;
  objekte[UMRISS - 1] = `<< /Type /Outlines /First ${marken[0]} 0 R`
    + ` /Last ${marken[marken.length - 1]} 0 R /Count ${marken.length} >>`;

  const buf = _puffer();
  buf.schreibe("%PDF-1.4\n");
  // Binaerkennung in der zweiten Zeile: sie sagt jedem Werkzeug, dass die Datei
  // nicht als Text behandelt werden darf.
  buf.schreibe(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  /** @type {number[]} */
  const offsets = [];
  objekte.forEach((o, i) => {
    offsets.push(buf.laenge);
    buf.schreibe(`${i + 1} 0 obj\n`);
    if (typeof o === "string") {
      buf.schreibe(o + "\n");
    } else {
      buf.schreibe(/** @type {any} */ (o).kopf + "\nstream\n");
      buf.schreibe(/** @type {any} */ (o).strom);
      buf.schreibe("\nendstream\n");
    }
    buf.schreibe("endobj\n");
  });
  const xref = buf.laenge;
  buf.schreibe(`xref\n0 ${objekte.length + 1}\n`);
  buf.schreibe("0000000000 65535 f \n");
  for (const o of offsets) buf.schreibe(String(o).padStart(10, "0") + " 00000 n \n");
  buf.schreibe(`trailer\n<< /Size ${objekte.length + 1} /Root ${KATALOG} 0 R >>\n`);
  buf.schreibe(`startxref\n${xref}\n%%EOF\n`);
  return buf.fertig();
}

/**
 * Die Blattfolge rastern und je Geschoss eine PDF bauen.
 *
 * `rendere` wird UEBERGEBEN: im Browser die Rasterhilfe `blattBild`, im Test ein
 * fester Ersatz. Dadurch entsteht auch ohne Browser eine echte, gueltige PDF mit
 * richtiger Seitenzahl, Seitengroesse und Seitenreihenfolge — nur die Bildpunkte
 * sind dort Platzhalter.
 *
 * Scheitert eine einzelne Seite, wird der GANZE Lauf mit Nennung abgebrochen:
 * eine PDF, der eine Wand fehlt, sieht vollstaendig aus und ist es nicht.
 *
 * @param {{geschosse:Array<{name:string,datei:string,seiten:Array<object>}>}} plan
 * @param {{rendere:(seite:any, dpi:number)=>Promise<any>, dpi?:number}} p
 * @returns {Promise<Array<{name:string, data:Uint8Array}>>}
 */
export async function pdfDateien(plan, p) {
  const dpi = Number.isFinite(p.dpi) ? Number(p.dpi) : DPI;
  /** @type {Array<{name:string, data:Uint8Array}>} */
  const dateien = [];
  for (const g of plan.geschosse) {
    const seiten = [];
    for (const s of g.seiten) {
      let bild;
      try {
        bild = await p.rendere(s, dpi);
      } catch (e) {
        throw new Error(`„${g.name}“, Blatt „${s.titel}“ konnte nicht dargestellt werden `
          + `(${e && e.message ? e.message : String(e)}). Es wurde nichts heruntergeladen.`);
      }
      seiten.push({ ...s, bild });
    }
    dateien.push({ name: g.datei, data: pdfBytes(seiten) });
  }
  return dateien;
}
