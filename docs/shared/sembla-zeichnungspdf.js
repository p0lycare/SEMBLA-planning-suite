// @ts-check
/**
 * SEMBLA Zeichnungs-PDF — die gesammelte Blattausgabe je Geschoss (Issues #98/#107).
 *
 * ZWECK. Modul 7 und Modul 9 drucken ihr Blatt (`window.print()`); wer die
 * Unterlagen eines Geschosses braucht, druckt sonst Blatt fuer Blatt von Hand — mit
 * einem Zeigerwechsel je Wand. Dieser Baustein macht daraus EINEN Download: je
 * Geschoss genau eine PDF, darin zuerst der Lageplan und danach je zugeordneter Wand
 * genau ein technisches Wandblatt. Ausgeloest wird das im zentralen Exportdialog von
 * Modul 0 (#107) — es gibt keinen zweiten Ausgang.
 *
 * ABLEITUNG ≠ DARSTELLUNG — der Punkt, an dem dieser Baustein haengt. Gerechnet wird
 * hier NICHTS: keine Geometrie, kein Masstab, keine Kontur, keine Menge, kein
 * Schriftfeldinhalt. Die ZEICHNUNGEN kommen unveraendert aus den kanonischen
 * Ableitungen —
 *
 *     `sembla-lageplan.js`  lageplanSvg(daten, opts)  ([N-1] … [N-9])
 *     `sembla-zeichnung.js` zeichnungSvg(w, opts)     ([D-6])
 *
 * — und werden als `inner` in ihr Blattfeld gesetzt, genau wie es
 * `lageplanSvgDatei()`/`zeichnungSvgDatei()` schon tun. Alle Blattzahlen und -texte
 * stammen aus den dort exportierten DATENLISTEN (`bomZeilen`, `vorspannZeilen`,
 * `einbauteilZeilen`, `konfliktZeilen`, `verzahnungZeilen`, `kopfFelder`) und
 * Darstellungsschluesseln (`FARBE`, `BRANDKLASSE`, `VERZAHNUNG`, `ART_SYMBOL`).
 *
 * WARUM DAS BLATT HIER SVG-NATIV GESETZT WIRD (und nicht das Blatt-HTML gerastert).
 * Bis c74837c wurde `blattHtml()` samt CSS in ein `<foreignObject>` gepackt und als
 * Bild in eine Leinwand gezeichnet. Das ist reproduzierbar gescheitert:
 *
 *     Failed to execute 'toBlob' on 'HTMLCanvasElement':
 *     Tainted canvases may not be exported.
 *
 * Blink fuehrt ein SVG-Bild als NICHT single-origin, sobald sein Baum ueberhaupt ein
 * `foreignObject` enthaelt — unabhaengig von Inhalt und Herkunft. Die Leinwand ist
 * damit verunreinigt und `toBlob()` wirft. Das traf JEDES Blatt; der Lageplan ist
 * nur Seite 1 und brach deshalb zuerst ab. Der Planhintergrund war NICHT die
 * Ursache: er steckt als Data-URL im Blatt und ist single-origin (#98/#107).
 *
 * Daraus folgt die Invariante dieses Bausteins: **jedes in die Leinwand gerenderte
 * Blatt ist eine reine, selbstgenuegsame SVG-Zeichenkette** — kein `foreignObject`,
 * kein externer Verweis, kein Stylesheet, keine Fremdbibliothek. Genau diese
 * Zeichenkette liefert `blattSvg()`, und genau sie wird im Test geprueft.
 *
 * Der Preis ist benannt: Tabellen, Legende, Schriftfeld und Fusstexte werden hier
 * SVG-nativ gesetzt (Rechtecke, Linien, `<text>` mit eigener Umbruchrechnung) statt
 * vom Browser aus HTML/CSS gelayoutet. Das Blatt ist damit INHALTSGLEICH, nicht
 * pixelgleich: Wortlaut, Farben, Reihenfolge und Werte sind dieselben, Zeilenumbruch
 * und Kastenhoehen weichen ab. Die Masse der Bloecke sind aus `ZEICHNUNG_CSS`/
 * `LAGEPLAN_CSS` uebernommen (ueber `MM_JE_PX`), damit das Zeichenfeld dieselbe
 * Groesse hat wie im Druck und der Norm-Masstab nach [D-2]/[N-8] unberuehrt bleibt.
 * Die Wortlaute stehen bewusst LOKAL (wie der Brandschutzschluessel in
 * `sembla-zeichnung.js` seit #79): `sembla-zeichnung.js` bleibt unberuehrt, und die
 * Gleichheit sichert der Test statt einer Verdrahtung.
 *
 * PAPIERGENAU OHNE UMRECHNUNG. Das Blatt-SVG rechnet in Papier-mm und ist genau
 * `blattInnen(format)` gross; die PDF-Seite hat `BLATT[format].papier_mm` als
 * MediaBox und setzt das Blattbild bei `rand_mm`. Eine reine Platzierung — kein
 * Reskalieren, kein Umbruch.
 *
 * GERASTERT, UND DAS AUSDRUECKLICH. Eine Seite traegt genau EIN Bild des fertigen
 * Blattes; Text im PDF ist deshalb nicht markierbar. Der Planhintergrund ([N-9])
 * reist ohne Zutun mit.
 *
 * REIN UND LESEND. Kein Speicherzugriff, kein aktiver Zeiger, keine Mutation. Kein
 * neues gespeichertes Feld, kein Schema-/Formatversionssprung, keine neue Regel-ID.
 *
 * DOM. Genau EINE DOM-nutzende Funktion: `blattBild()`, die Rasterhilfe des
 * Browsers. Alles andere ist rein und laeuft in Node — deshalb sind Blattfolge,
 * Blatt-SVG und PDF-Struktur im Test deterministisch pruefbar, waehrend die
 * Bildpunkte dem Browser gehoeren.
 *
 * ES-Modul.
 */

import { ART_LABEL, ART_SYMBOL } from "./sembla-bom.js";
import { SEITEN } from "./sembla-constraints.js";
import {
  BLATT as BLATT_LP, blattInnen as blattInnenLp, BRANDKLASSE as BRAND_LP,
  FARBE as FARBE_LP, kopfFelder, lageplanDaten, lageplanSvg, lageplanTitel,
  MASSSTAEBE as MASSSTAEBE_LP, normOptionen as normOptionenLp,
  VERZAHNUNG as VERZAHNUNG_LP,
} from "./sembla-lageplan.js";
import { bodenblechStoesse, bodenblechTeile, STUECK_LABEL } from "./sembla-montage.js";
import * as MAPPE from "./sembla-projektmappe.js";
import {
  BLATT as BLATT_Z, blattInnen as blattInnenZ, bomZeilen, BRANDKLASSE as BRAND_Z,
  einbauteilZeilen, EINBAUTEIL_TITEL, FARBE as FARBE_Z, konfliktZeilen, MANGEL_TITEL,
  normOptionen as normOptionenZ, optionenAusEingaben, verzahnungZeilen,
  VERZAHNUNG as VERZAHNUNG_Z, VERZAHNUNG_TITEL, vorspannZeilen, zeichnungSvg,
  zeichnungTitel,
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

/**
 * 1 CSS-Pixel in Papier-mm (1/96 Zoll, fest in jedem Browser). Damit werden die
 * Blockmasse der beiden Blatt-Stylesheets in die mm-Welt des Blatt-SVG uebernommen,
 * statt neue zu erfinden — das Zeichenfeld ist dadurch so gross wie im Druck.
 */
const MM_JE_PX = 25.4 / 96;
const _mmPx = (px) => px * MM_JE_PX;

// Blattraster — woertlich `.zsheet`/`.lpsheet` (padding 14px, Spalte 300px, gap 10px).
const RAND_MM = _mmPx(14), SPALTE_MM = _mmPx(300), LUECKE_MM = _mmPx(10);
// Kasten (`.zbox`/`.lpbox`: padding 7px 9px) und Abstand der Kaesten (gap 8px).
const KASTEN_PAD_X = _mmPx(9), KASTEN_PAD_Y = _mmPx(7), KASTEN_LUECKE = _mmPx(8);

// Schriftgroessen in Papier-mm — dieselben Werte wie im Blatt-CSS.
const FS_CAP = _mmPx(12);        // .zcap/.lpcap
const FS_H4 = _mmPx(10);         // .zbox h4/.lpbox h4
const FS_TAB = _mmPx(11);        // table.ztab
const FS_TAB_LP = _mmPx(10.5);   // table.lptab
const FS_KOPFZEILE = _mmPx(9);   // table.lptab th
const FS_IDS = _mmPx(9);         // .zbox.zids table.ztab
const FS_KLEIN = _mmPx(10);      // .zlegende/.lplegende/.zmangel/.lpbg-info
const FS_FUSS = _mmPx(9.5);      // .zfuss
const FS_WARN = _mmPx(10.5);     // .lpzugross
const FS_KOPF_V = _mmPx(11);     // .ztb-row .v
const FS_KOPF_K = _mmPx(9.5);    // .ztb-row .k

/** Zeilenabstand als Vielfaches der Schriftgroesse (CSS: line-height ~1.4). */
const ZEILE_F = 1.4;

/**
 * Geschaetzte Zeichenbreite als Vielfaches der Schriftgroesse. SVG kennt keinen
 * Umbruch; gerechnet wird deshalb wie in `lageplanSvgDatei()` mit ~0,5 · Schrift-
 * groesse je Zeichen. Das ist bei proportionaler Schrift eine Schaetzung — sie
 * bricht eher zu frueh um, statt Text aus dem Kasten laufen zu lassen.
 */
const ZEICHEN_F = 0.5;

/** Schriftfamilie des Blatt-SVG. */
const SCHRIFT = "sans-serif";

// Farben der Blattbeigaben — woertlich aus `ZEICHNUNG_CSS`/`LAGEPLAN_CSS`.
const TINTE = "#1c2430", GRAU = "#6b7682", RAHMEN = "#dfe3e8", LINIE = "#f1f3f6";
const TRENN = "#e3e7ec", KOPF_GRUND = "#f4f6f8", KOPF_RAHMEN = "#13202e";
const CAP_FARBE = "#33414f", MANGEL_FARBE = "#c9461c", INFO_FARBE = "#4a5663";
const WARN_GRUND = "#fbe6dd", WARN_RAHMEN = "#f0cdbe", WARN_FARBE = "#7d2a10";

/** Kennungen der Klipppfade des Blattes — je Seite genau ein SVG, also eindeutig. */
const CLIP_SPALTE = "zpdf-spalte", CLIP_FELD = "zpdf-feld";

// ------------------------------------------------------------- SVG-Bausteine

const _esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
  (c) => /** @type {any} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Zahl auf 3 Dezimalen kuerzen — haelt die SVG-Zeichenkette stabil/vergleichbar. */
const _n = (v) => (Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000).toString();

/** Deutsche Zahlschreibweise — dieselbe wie in den Blattbausteinen. */
const _fmt = (n, d = 0) => (Number.isFinite(n) ? n : 0)
  .toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Millimetermass im Schriftfeld der Wandzeichnung — woertlich `_mm()` aus
 * `sembla-zeichnung.js` (eine Dezimale, Komma, KEIN Tausenderpunkt). Eine andere
 * Schreibweise waere hier ein zweites Mass fuer dieselbe Wand.
 */
const _mmMass = (v) => (Math.round((Number.isFinite(v) ? v : 0) * 10) / 10)
  .toString().replace(".", ",");

/** Eine Textzeile. @param {{fs?:number, farbe?:string, fett?:boolean, anker?:string}} [o] */
function _text(x, y, text, o = {}) {
  const t = String(text == null ? "" : text);
  if (t === "") return "";
  return `<text x="${_n(x)}" y="${_n(y)}" font-size="${_n(o.fs || FS_TAB)}"`
    + ` font-family="${SCHRIFT}"${o.fett ? ` font-weight="600"` : ""}`
    + `${o.anker ? ` text-anchor="${o.anker}"` : ""} fill="${o.farbe || TINTE}">${_esc(t)}</text>`;
}

/** Ein Rechteck (Flaeche und/oder Rahmen). */
function _rect(x, y, w, h, o = {}) {
  return `<rect x="${_n(x)}" y="${_n(y)}" width="${_n(Math.max(0, w))}"`
    + ` height="${_n(Math.max(0, h))}" fill="${o.fuellung || "none"}"`
    + `${o.rahmen ? ` stroke="${o.rahmen}" stroke-width="${_n(o.lw || 0.2)}"` : ""}`
    + `${o.rund ? ` rx="${_n(o.rund)}"` : ""}/>`;
}

/** Eine waagerechte Linie. */
function _hlinie(x, y, w, farbe) {
  return `<line x1="${_n(x)}" y1="${_n(y)}" x2="${_n(x + w)}" y2="${_n(y)}"`
    + ` stroke="${farbe}" stroke-width="0.15"/>`;
}

/**
 * Text auf eine Kastenbreite umbrechen. Ein einzelnes ueberlanges Wort (eine
 * Einbauteil-ID-Kette etwa) wird hart getrennt statt aus dem Kasten geschoben.
 * @returns {string[]} mindestens eine (moeglicherweise leere) Zeile
 */
function _umbruch(text, breite, fs) {
  const max = Math.max(4, Math.floor(breite / (fs * ZEICHEN_F)));
  const worte = String(text == null ? "" : text).split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const zeilen = [];
  let akt = "";
  const schiebe = () => { if (akt) { zeilen.push(akt); akt = ""; } };
  for (let wort of worte) {
    while (wort.length > max) {
      schiebe();
      zeilen.push(wort.slice(0, max));
      wort = wort.slice(max);
    }
    if (!akt) akt = wort;
    else if (akt.length + 1 + wort.length <= max) akt += " " + wort;
    else { schiebe(); akt = wort; }
  }
  schiebe();
  return zeilen.length ? zeilen : [""];
}

/**
 * Die Marke eines Legenden- oder Mangeleintrags. `bar`/`plate`/`dot` sind woertlich
 * die `<i>`-Kaestchen der HTML-Legende (14 × 4, 11 × 9, 8 × 8 Pixel), `chip` der
 * Mangelpunkt (10 × 10) und `kuerzel` der Buchstabenschluessel (#79/#82) — er traegt
 * schwarz-weiss und haengt deshalb nicht an einer Farbe.
 * @returns {{svg:string, breite:number}}
 */
function _marke(x, basis, fs, z) {
  if (z.form === "kuerzel") {
    const t = String(z.kuerzel || "");
    return { svg: _text(x, basis, t, { fs, farbe: z.marke_farbe, fett: true }),
      breite: t.length * fs * ZEICHEN_F + fs * 0.5 };
  }
  if (z.form === "dot") {
    const r = _mmPx(4);
    return { svg: `<circle cx="${_n(x + r)}" cy="${_n(basis - fs * 0.32)}" r="${_n(r)}"`
      + ` fill="${z.marke_farbe}"/>`, breite: 2 * r + fs * 0.4 };
  }
  if (z.form === "chip") {
    const s = _mmPx(10);
    return { svg: _rect(x, basis - s * 0.85, s, s, { fuellung: MANGEL_FARBE, rund: _mmPx(2) }),
      breite: s + fs * 0.5 };
  }
  const w = z.form === "plate" ? _mmPx(11) : _mmPx(14);
  const h = z.form === "plate" ? _mmPx(9) : _mmPx(4);
  return { svg: _rect(x, basis - h * (z.form === "plate" ? 0.85 : 1.1), w, h,
    { fuellung: z.marke_farbe, rund: _mmPx(2) }), breite: w + fs * 0.4 };
}

/**
 * Eine Zeilenliste in eine Kastenbreite setzen — der eine Fluss-Setzer des Blattes.
 *
 * Zeilenarten: `tab` (Bezeichnung links, Wert rechts — die HTML-Tabellen der
 * Seitenspalte), `spalten` (mehrspaltige Tabellenzeile mit Anteilen), `punkte`
 * (Legendenreihe, fliessend wie flex-wrap), `punkt` (Marke + Text, ein Eintrag
 * je Zeile: die Mangelpunkte), `text` (Fliesstext) und `luecke`.
 * Jede Art bricht innerhalb ihrer Spaltenbreite um; abgeschnitten wird nichts.
 * @returns {{svg:string, hoehe:number}}
 */
function _fluss(x, y, breite, zeilen) {
  let s = "", yy = y;
  for (const z of zeilen) {
    if (!z) continue;
    const fs = z.fs || FS_TAB;
    const zh = fs * ZEILE_F;
    if (z.art === "luecke") { yy += z.hoehe == null ? zh * 0.35 : z.hoehe; continue; }
    if (z.art === "tab") {
      // Der Wert steht rechtsbuendig wie `td.r`, und die Bezeichnung bekommt den
      // Platz, den sie braucht — genau wie in der HTML-Tabelle, deren Wertspalte nur
      // so breit ist wie ihr Inhalt. Bei der ID-Tabelle ([P-19]) ist es umgekehrt:
      // dort ist die Bezeichnung kurz und die ID-Kette lang, also richtet sich die
      // Bezeichnungsspalte nach ihrem Text und der Wert steht linksbuendig.
      const labelB = z.wertLinks
        ? Math.min(breite * 0.45,
          String(z.label == null ? "" : z.label).length * fs * ZEICHEN_F + fs)
        : breite * 0.82 - fs * 0.5;
      const wertB = breite - labelB - fs * 0.5;
      const l = _umbruch(z.label, labelB, fs);
      // Passt der Wert nicht in seine Spalte, bekommt er eigene Zeilen UNTER der
      // Bezeichnung — quer ueber die ganze Kastenbreite. Sonst muesste ein langes Wort
      // („Zuschnittkonflikte") mitten im Wort getrennt werden, und das liest sich wie
      // ein anderer Begriff.
      const eigen = !z.wertLinks
        && String(z.wert == null ? "" : z.wert).length * fs * ZEICHEN_F > wertB;
      const v = _umbruch(z.wert, eigen ? breite : wertB, fs);
      l.forEach((t, i) => { s += _text(x, yy + (i + 1) * zh, t, { fs }); });
      const vy = eigen ? l.length : 0;
      v.forEach((t, i) => {
        s += z.wertLinks
          ? _text(x + labelB + fs * 0.5, yy + (i + 1) * zh, t, { fs })
          : _text(x + breite, yy + (vy + i + 1) * zh, t, { fs, anker: "end", fett: true });
      });
      yy += (eigen ? l.length + v.length : Math.max(l.length, v.length)) * zh;
      continue;
    }
    if (z.art === "spalten") {
      const summe = z.zellen.reduce((a, c) => a + (c.anteil || 1), 0);
      let zx = x, reihen = 1;
      const teile = [];
      for (const c of z.zellen) {
        const cb = breite * (c.anteil || 1) / summe;
        const t = _umbruch(c.text, cb - fs * 0.4, fs);
        reihen = Math.max(reihen, t.length);
        teile.push({ t, zx, cb, c });
        zx += cb;
      }
      for (const p of teile) {
        p.t.forEach((t, i) => {
          const yb = yy + (i + 1) * zh;
          s += p.c.anker === "end"
            ? _text(p.zx + p.cb - fs * 0.4, yb, t, { fs, fett: p.c.fett, farbe: p.c.farbe, anker: "end" })
            : _text(p.zx, yb, t, { fs, fett: p.c.fett, farbe: p.c.farbe });
        });
      }
      yy += reihen * zh;
      if (z.linie) s += _hlinie(x, yy + zh * 0.12, breite, z.linie);
      continue;
    }
    if (z.art === "punkte") {
      // Wie `.zlegende`/`.lplegende` (display:flex;flex-wrap:wrap): die Eintraege
      // fliessen nebeneinander und brechen erst am Kastenrand um. Einer je Zeile
      // waere kein anderer Inhalt, aber ein deutlich hoeherer Kasten — und in der
      // Seitenspalte kostet Hoehe am Ende sichtbare Eintraege.
      const lueckeX = _mmPx(10);
      /** @type {Array<Array<{e:any, b:number}>>} */
      const reihen = [];
      let reihe = [], frei = breite;
      for (const e of z.eintraege) {
        const mb = _marke(0, 0, fs, e).breite;
        const b = mb + String(e.text).length * fs * ZEICHEN_F;
        if (reihe.length && b > frei) { reihen.push(reihe); reihe = []; frei = breite; }
        reihe.push({ e, b: Math.min(b, breite) });
        frei -= b + lueckeX;
      }
      if (reihe.length) reihen.push(reihe);
      for (const r of reihen) {
        let hoch = 1, rx = x;
        for (const { e, b } of r) {
          const basis = yy + zh;
          const m = _marke(rx, basis, fs, e);
          const t = _umbruch(e.text, Math.max(b, breite / r.length) - m.breite, fs);
          hoch = Math.max(hoch, t.length);
          s += m.svg;
          t.forEach((tt, i) => { s += _text(rx + m.breite, basis + i * zh, tt, { fs, farbe: e.farbe }); });
          rx += b + lueckeX;
        }
        yy += hoch * zh;
      }
      continue;
    }
    if (z.art === "punkt") {
      const basis = yy + zh;
      const m = _marke(x, basis, fs, z);
      const t = _umbruch(z.text, breite - m.breite, fs);
      s += m.svg;
      t.forEach((tt, i) => { s += _text(x + m.breite, basis + i * zh, tt, { fs, farbe: z.farbe }); });
      yy += t.length * zh;
      continue;
    }
    for (const t of _umbruch(z.text, breite, fs)) {
      yy += zh;
      s += _text(x, yy, t, { fs, farbe: z.farbe, fett: z.fett });
    }
  }
  return { svg: s, hoehe: yy - y };
}

/**
 * Ein Kasten der Seitenspalte (`.zbox`/`.lpbox`): Rahmen, Ueberschrift, Fluss.
 * Die Ueberschrift bleibt in ihrer Originalschreibweise — `text-transform` ist eine
 * Darstellungsangabe des Stylesheets und kein anderer Wortlaut.
 * @returns {{svg:string, hoehe:number}}
 */
function _kasten(x, y, breite, titel, zeilen, o = {}) {
  const innen = breite - 2 * KASTEN_PAD_X;
  const kopfH = titel ? FS_H4 * ZEILE_F + _mmPx(5) : 0;
  const f = _fluss(x + KASTEN_PAD_X, y + KASTEN_PAD_Y + kopfH, innen, zeilen);
  const hoehe = 2 * KASTEN_PAD_Y + kopfH + f.hoehe;
  let s = _rect(x, y, breite, hoehe, {
    rahmen: o.mangel ? MANGEL_FARBE : RAHMEN, lw: o.mangel ? 0.4 : 0.25, rund: _mmPx(3),
  });
  if (titel) {
    s += _text(x + KASTEN_PAD_X, y + KASTEN_PAD_Y + FS_H4, titel,
      { fs: FS_H4, farbe: o.mangel ? MANGEL_FARBE : GRAU, fett: true });
  }
  return { svg: s + f.svg, hoehe };
}

/**
 * Das Schriftfeld (`.ztitleblock`/`.lptitleblock`): Spalten mit Anteilen, je Spalte
 * k/v-Zeilen. Die Reihenhoehe folgt dem groessten Umbruchbedarf der Reihe — ein
 * langer Projektname bekommt eine zweite Zeile, statt abgeschnitten zu werden.
 * Zurueckgegeben wird erst das MASS: die Blattaufteilung braucht die Hoehe, bevor
 * gezeichnet werden kann.
 * @returns {{hoehe:number, zeichne:(x:number,y:number)=>string}}
 */
function _schriftfeld(breite, spalten, kBreite) {
  const summe = spalten.reduce((a, c) => a + c.anteil, 0);
  const breiten = spalten.map((c) => breite * c.anteil / summe);
  const reihen = spalten.reduce((m, c) => Math.max(m, c.felder.length), 0);
  const teile = spalten.map((c, i) => c.felder.map(
    (f) => _umbruch(f.v, breiten[i] - kBreite - _mmPx(12), FS_KOPF_V)));
  /** @type {number[]} */
  const reihenH = [];
  for (let r = 0; r < reihen; r++) {
    let n = 1;
    for (const sp of teile) if (sp[r]) n = Math.max(n, sp[r].length);
    reihenH.push(n * FS_KOPF_V * ZEILE_F + _mmPx(8));
  }
  const hoehe = reihenH.reduce((a, b) => a + b, 0);
  return {
    hoehe,
    zeichne(x, y) {
      let s = _rect(x, y, breite, hoehe, { fuellung: "#ffffff", rahmen: KOPF_RAHMEN, lw: 0.4, rund: _mmPx(3) });
      let cx = x;
      spalten.forEach((c, ci) => {
        const cb = breiten[ci];
        if (ci) s += `<line x1="${_n(cx)}" y1="${_n(y)}" x2="${_n(cx)}" y2="${_n(y + hoehe)}"`
          + ` stroke="#cfd5db" stroke-width="0.15"/>`;
        let fy = y;
        c.felder.forEach((f, ri) => {
          const rh = reihenH[ri];
          s += _rect(cx, fy, kBreite, rh, { fuellung: KOPF_GRUND });
          if (ri) s += _hlinie(cx, fy, cb, TRENN);
          s += _text(cx + _mmPx(6), fy + FS_KOPF_K + _mmPx(4), f.k, { fs: FS_KOPF_K, farbe: GRAU });
          teile[ci][ri].forEach((t, i) => {
            s += _text(cx + kBreite + _mmPx(6), fy + FS_KOPF_V * ZEILE_F * (i + 1) - _mmPx(1), t,
              { fs: FS_KOPF_V, fett: true, farbe: f.warn ? WARN_FARBE : TINTE });
          });
          fy += rh;
        });
        cx += cb;
      });
      return s;
    },
  };
}

/**
 * Die kanonische Zeichnung in ihr Blattfeld setzen — in NATUERLICHER Papier-mm-Groesse
 * und zentriert; nur wenn sie nicht ins Feld passt, wird sie gleichmaessig verkleinert
 * (genau das tut `.zsvg svg{max-width:100%;max-height:100%;width:auto}` im Blatt).
 * Vergroessert wird NIE — der angeschriebene Masstab waere sonst unwahr ([D-2]/[N-8]).
 * Eingebettet wird `inner` unveraendert in einem verschachtelten `<svg>` mit der
 * originalen viewBox, wie in `lageplanSvgDatei()`/`zeichnungSvgDatei()`.
 */
function _zeichnungInFeld(feld, inner, vb) {
  const sc = Math.min(1, feld.w / Math.max(0.001, vb.w), feld.h / Math.max(0.001, vb.h));
  const w = vb.w * sc, h = vb.h * sc;
  const x = feld.x + (feld.w - w) / 2, y = feld.y + (feld.h - h) / 2;
  return `<svg x="${_n(x)}" y="${_n(y)}" width="${_n(w)}" height="${_n(h)}"`
    + ` viewBox="${_n(vb.x)} ${_n(vb.y)} ${_n(vb.w)} ${_n(vb.h)}"`
    + ` preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

/**
 * Wasserzeichen „Vorabzug" (`.zwm`/`.lpwm`) — dieselbe Farbe und Drehung wie im
 * Blatt. Gross geschrieben, weil das Stylesheet `text-transform:uppercase` setzt.
 */
function _wasserzeichen(blatt) {
  const cx = blatt.w / 2, cy = blatt.h / 2;
  return `<g class="wm" transform="rotate(-32 ${_n(cx)} ${_n(cy)})">`
    + `<text x="${_n(cx)}" y="${_n(cy + _mmPx(50))}" font-size="${_n(_mmPx(150))}"`
    + ` font-family="${SCHRIFT}" font-weight="800" letter-spacing="${_n(_mmPx(8))}"`
    + ` text-anchor="middle" fill="rgba(201,70,28,.14)">VORABZUG</text></g>`;
}

/** Die drei Felder des Blattes aus Blattmass und Schriftfeldhoehe. */
function _blattfelder(blatt, kopfH) {
  const innen = blatt.w - 2 * RAND_MM;
  const h = blatt.h - 2 * RAND_MM - LUECKE_MM - kopfH;
  return {
    zeichnung: { x: RAND_MM, y: RAND_MM, w: innen - SPALTE_MM - LUECKE_MM, h },
    spalte: { x: RAND_MM + innen - SPALTE_MM, y: RAND_MM, w: SPALTE_MM, h },
    kopf: { x: RAND_MM, y: blatt.h - RAND_MM - kopfH, w: innen, h: kopfH },
  };
}

/** Die Kaesten der Seitenspalte stapeln — geklippt wie `overflow:hidden` im Blatt. */
function _seitenspalte(feld, kaesten) {
  let s = `<clipPath id="${CLIP_SPALTE}">`
    + _rect(feld.x, feld.y, feld.w, feld.h, { fuellung: "#000" }) + `</clipPath>`
    + `<g clip-path="url(#${CLIP_SPALTE})">`;
  let y = feld.y;
  for (const k of kaesten) {
    if (!k) continue;
    const box = _kasten(feld.x, y, feld.w, k.titel, k.zeilen, k);
    s += box.svg;
    y += box.hoehe + KASTEN_LUECKE;
  }
  return s + `</g>`;
}

/** Der Zeichnungskasten mit Titelzeile und optionalen Warnabsaetzen. */
function _zeichnungskasten(feld, titel, warnungen, inner, vb) {
  let s = _rect(feld.x, feld.y, feld.w, feld.h, { rahmen: RAHMEN, lw: 0.25, rund: _mmPx(3) });
  let y = feld.y;
  const capH = FS_CAP * ZEILE_F + _mmPx(4);
  s += _text(feld.x + _mmPx(8), y + FS_CAP + _mmPx(5), titel, { fs: FS_CAP, fett: true, farbe: CAP_FARBE });
  y += capH;
  s += _hlinie(feld.x, y, feld.w, RAHMEN);
  for (const text of (warnungen || [])) {
    const z = _umbruch(text, feld.w - 2 * _mmPx(8), FS_WARN);
    const h = z.length * FS_WARN * ZEILE_F + _mmPx(6);
    s += _rect(feld.x, y, feld.w, h, { fuellung: WARN_GRUND });
    z.forEach((t, i) => {
      s += _text(feld.x + _mmPx(8), y + _mmPx(3) + (i + 1) * FS_WARN * ZEILE_F, t,
        { fs: FS_WARN, farbe: WARN_FARBE });
    });
    y += h;
    s += _hlinie(feld.x, y, feld.w, WARN_RAHMEN);
  }
  const innenFeld = { x: feld.x + _mmPx(6), y: y + _mmPx(6),
    w: feld.w - 2 * _mmPx(6), h: feld.y + feld.h - y - 2 * _mmPx(6) };
  return s + _zeichnungInFeld(innenFeld, inner, vb);
}

// ------------------------------------------------- Wortlaut der Blattbeigaben
//
// Diese Texte stehen bewusst LOKAL — dasselbe Muster wie der
// Brandschutz-Darstellungsschluessel in `sembla-zeichnung.js` seit #79: zwei
// Ausgabewege duerfen nicht aneinanderhaengen, `sembla-zeichnung.js` bleibt
// unberuehrt, und die Wortlaut- und Farbgleichheit zu `legendeHtml()`/
// `maengelHtml()`/`schriftfeldHtml()` sichert der Test — nicht eine Verdrahtung.
// Alle Kennfarben, Kuerzel und Bauteilnamen kommen dagegen aus den kanonischen
// Konstanten (`FARBE`, `BRANDKLASSE`, `VERZAHNUNG`, `ART_*`, `STUECK_LABEL`,
// `SEITEN`); eine zweite Werteliste gaebe es hier nicht.

/** Fusstext des Mangelblocks der Wandzeichnung ([Z-5]/[Z-6]). */
export const MANGEL_FUSS = "Bis zur Behebung sind Zeichnung und Stückliste dieses Blattes "
  + "unvollständig: Für die betroffenen Segmente ist kein Zuschnitt bestimmt — es wird "
  + "ausdrücklich keine Länge und keine Ersatzstange angenommen.";

/** Fusstext des Verzahnungs-Mangelblocks ([G-10]/[G-12]). */
export const VERZAHNUNG_FUSS = "Abgewiesene Bereiche sind im gezeichneten Verband "
  + "nicht ausgeführt: die Steine stehen dort wie ohne Verzahnung. Der Anschluss ist "
  + "in „Wandplanung\" zu berichtigen — hier wird nichts angenommen und nichts "
  + "stillschweigend zurechtgerückt.";

/** Kennzeichnungsschluessel der Einbauteile unter der Legende ([P-19]). */
export const EINBAUTEIL_FUSS = `${ART_SYMBOL.standard} ${ART_LABEL.standard} · `
  + `${ART_SYMBOL.sonder} ${ART_LABEL.sonder} · ${ART_SYMBOL.rest} ${ART_LABEL.rest} · `
  + "Einbauteil-ID GS-k<Spannachse>.<Segment von unten>.<Stück von unten> — "
  + "dieselben IDs führt die Baustellenstückliste (Modul 4).";

/** Erklaerung des Verzahnungskastens im Lageplanblatt (#83). */
export const VERZAHNUNG_INFO = "Diese Wände greifen an ihren Verzahnungsbereichen "
  + "ineinander — zulässige Verbindung, keine Kollision ([K-13]/[G-10]). Im Plan ist "
  + `die Stelle als ${VERZAHNUNG_LP.merkmal} gekennzeichnet.`;

/**
 * Der Darstellungsschluessel des LAGEPLANblattes (#79/#83/#84) als Datenliste —
 * dieselben Eintraege, dieselbe Reihenfolge und derselbe Wortlaut wie
 * `legendeHtml()` in `sembla-lageplan.js`.
 */
export function legendeLageplan() {
  return [
    { form: "plate", marke_farbe: FARBE_LP.wand, text: "Wand (125 mm breit)" },
    { form: "bar", marke_farbe: FARBE_LP.mittellinie, text: "Mittellinie (Bezug, [K-2])" },
    { form: "bar", marke_farbe: SEITEN.vorder.farbe,
      text: `Kante in Kennfarbe: ${SEITEN.vorder.name} der Wand` },
    { form: "bar", marke_farbe: SEITEN.rueck.farbe,
      text: `Kante in Kennfarbe: ${SEITEN.rueck.name} der Wand` },
    { form: "bar", marke_farbe: BRAND_LP.F0.farbe,
      text: `${BRAND_LP.F0.kuerzel} ${BRAND_LP.F0.name} — Wandfläche ${BRAND_LP.F0.merkmal}` },
    { form: "plate", marke_farbe: BRAND_LP.F30.farbe,
      text: `${BRAND_LP.F30.kuerzel} ${BRAND_LP.F30.name} — Wandfläche `
        + `${BRAND_LP.F30.merkmal} (Planungskennzeichnung, kein Nachweis)` },
    { form: "bar", marke_farbe: FARBE_LP.mass, text: "treibende Bemaßung ([K-3])" },
    { form: "kuerzel", kuerzel: "1", marke_farbe: TINTE,
      text: "Nummernblase der Wand — Name s. „Wände im Geschoss\"" },
    { form: "plate", marke_farbe: FARBE_LP.fehler, text: "Widerspruch / Kollision ([K-6]/[K-13])" },
  ];
}

/**
 * Der Darstellungsschluessel des WANDblattes ([D-4]/[P-19], #79/#82) als Datenliste —
 * dieselben Eintraege, dieselbe Reihenfolge und derselbe Wortlaut wie `legendeHtml(w)`
 * in `sembla-zeichnung.js`. Die bedingten Eintraege haengen an genau denselben
 * Abfragen: ein Alt-Wandelement ohne reale Blechteile bekommt sie nicht ([D-4]).
 */
export function legendeWand(w) {
  const el = w || {};
  return [
    { form: "bar", marke_farbe: FARBE_Z.stange, text: `Gewindestange (${STUECK_LABEL.standard})` },
    { form: "bar", marke_farbe: FARBE_Z.stange_sonder, text: `${STUECK_LABEL.sonder} / abgelängt` },
    { form: "bar", marke_farbe: FARBE_Z.stange_rest, text: `${STUECK_LABEL.rest} ([Z-6])` },
    { form: "dot", marke_farbe: FARBE_Z.mutter, text: "Kopplung / Verankerung" },
    { form: "plate", marke_farbe: FARBE_Z.platte, text: "Spannplatte" },
    { form: "plate", marke_farbe: FARBE_Z.stahl, text: "Boden-/Kopfblech" },
    ...(bodenblechStoesse(el).length
      ? [{ form: "dot", marke_farbe: FARBE_Z.kontur, text: "Blechstoß (Bodenblech)" }] : []),
    ...(bodenblechTeile(el).some((t) => t.art === "sonder")
      ? [{ form: "plate", marke_farbe: FARBE_Z.stange_sonder,
        text: `Bodenblech ${STUECK_LABEL.sonder} (schraffiert)` }] : []),
    { form: "plate", marke_farbe: FARBE_Z.i3, text: "i3 (37,5 cm)" },
    { form: "plate", marke_farbe: FARBE_Z.i2, text: "i2 (25 cm)" },
    { form: "kuerzel", kuerzel: BRAND_Z.F0.kuerzel, marke_farbe: BRAND_Z.F0.farbe,
      text: BRAND_Z.F0.name },
    { form: "kuerzel", kuerzel: BRAND_Z.F30.kuerzel, marke_farbe: BRAND_Z.F30.farbe,
      text: BRAND_Z.F30.name },
    ...((el.interlocks || []).length
      ? [{ form: "kuerzel", kuerzel: VERZAHNUNG_Z.kuerzel, marke_farbe: FARBE_Z.verzahnung,
        text: VERZAHNUNG_Z.name }] : []),
  ];
}

// -------------------------------------------------------- Blattkomposition

/**
 * Das LAGEPLANblatt als reine, selbstgenuegsame SVG-Zeichenkette ([N-1] … [N-9]).
 *
 * Gerechnet wird nichts: `lageplanSvg()` liefert Zeichnung und Masstab,
 * `kopfFelder()` das Schriftfeld ([N-6]/[L-11]), `daten.waende` die Wandtabelle und
 * `daten.hintergrund`/`daten.verzahnungen` die beiden bedingten Kaesten. Der
 * Planhintergrund steckt als Data-URL in `inner` und reist unveraendert mit ([N-9]).
 * @returns {{inhalt:string, titel:string, format:string, masstab:number, blatt_mm:{w:number,h:number}}}
 */
export function lageplanBlattInhalt(daten, opts) {
  const o = normOptionenLp(opts);
  const z = lageplanSvg(daten, o);
  const blatt = blattInnenLp(/** @type {any} */ (o.format));
  const titel = lageplanTitel(daten, z.masstab);

  // Schriftfeld zuerst: die Blattaufteilung braucht seine Hoehe. Fuenf Spalten zu je
  // zwei Feldern — genau die Aufteilung von `schriftfeldHtml()` (#59).
  const felder = kopfFelder({ ...daten, _passt: z.passt }, z.masstab);
  const spalten = [];
  const anteile = [1.5, 1.2, 1, 1, 0.9];
  for (let i = 0; i < felder.length; i += 2) {
    spalten.push({ anteil: anteile[spalten.length] || 1, felder: felder.slice(i, i + 2) });
  }
  const kopf = _schriftfeld(blatt.w - 2 * RAND_MM, spalten, _mmPx(70));
  const f = _blattfelder(blatt, kopf.hoehe);

  // Warnabsaetze: zwei GETRENNTE Gruende mit verschiedenen Auswegen ([N-8], #59).
  const warnungen = [];
  if (!z.passt) {
    warnungen.push(z.benoetigt > z.masstab
      ? `Das Geschoss ist für dieses Blatt zu groß: selbst 1 : `
        + `${MASSSTAEBE_LP[MASSSTAEBE_LP.length - 1]} genügt nicht (benötigt wären 1 : `
        + `${Math.ceil(z.benoetigt)}). Die Zeichnung bleibt vollständig und wird weder `
        + `beschnitten noch gekachelt — der Ausdruck ist dann aber nicht maßstabsgetreu. `
        + `Größeres Blattformat wählen oder das Geschoss fachlich teilen ([N-8]).`
      : `Der Maßstab 1 : ${z.masstab} passt, aber die ausgewichenen Nummernblasen `
        + `brauchen mehr Zeichnungsrand, als dieses Blattfeld hergibt `
        + `(${_fmt(z.voll_breite_mm, 1)} × ${_fmt(z.voll_hoehe_mm, 1)} mm bei einem Feld von `
        + `${_fmt((BLATT_LP[o.format] || BLATT_LP.a3).feld_mm.w)} × `
        + `${_fmt((BLATT_LP[o.format] || BLATT_LP.a3).feld_mm.h)} mm). Jede Blase bleibt `
        + `vollständig sichtbar und wird nicht beschnitten — der Ausdruck ist dann aber `
        + `nicht maßstabsgetreu. Größeres Blattformat wählen ([N-8]).`);
  }

  // Wandtabelle: Nummer (= Nummernblase im Plan), Wandname, Hoehe — und sonst nichts (#89).
  const tabelle = [{ art: "spalten", fs: FS_KOPFZEILE, linie: TRENN, zellen: [
    { text: "Nr.", anteil: 0.11, anker: "end", farbe: GRAU, fett: true },
    { text: "Wand", anteil: 0.59, farbe: GRAU, fett: true },
    { text: "Höhe", anteil: 0.3, anker: "end", farbe: GRAU, fett: true },
  ] }];
  if (daten.waende.length) {
    for (const w of daten.waende) {
      tabelle.push({ art: "spalten", fs: FS_TAB_LP, linie: LINIE, zellen: [
        { text: String(w.nr), anteil: 0.11, anker: "end", fett: true },
        { text: w.name, anteil: 0.59 },
        { text: w.hoehe_mm == null ? "–" : _fmt(w.hoehe_mm) + " mm", anteil: 0.3, anker: "end" },
      ] });
    }
  } else {
    tabelle.push({ art: "text", fs: FS_TAB_LP, text: "keine Wand eingetragen" });
  }

  // Planhintergrund (#80/[N-9]) und Verzahnungen (#83) nur, wenn es sie gibt — sonst
  // waere es ein Kasten ueber eine Sache, die es nicht gibt.
  const hg = daten.hintergrund || null;
  let hgZeile = null;
  if (hg && hg.status !== "keiner") {
    const gezeigt = hg.status === "gesetzt" && o.transparenz < 100;
    const zusatz = hg.status !== "gesetzt" ? ""
      : gezeigt
        ? ` Dargestellt mit ${_fmt(o.transparenz)} % Transparenz${hg.name ? ` (${hg.name})` : ""}.`
        : " Die Transparenz steht auf 100 % — der Hintergrund ist deshalb ausgeblendet.";
    hgZeile = { art: "text", fs: FS_KLEIN, farbe: INFO_FARBE, text: hg.text + zusatz };
  }
  const verz = (daten.verzahnungen || []).map((v) => ({
    art: "text", fs: FS_TAB_LP,
    text: `• „${v.name_a}“ und „${v.name_b}“ — Rasterfeld ${v.raster.a} bzw. ${v.raster.b}`,
  }));

  const inhalt = _rect(0, 0, blatt.w, blatt.h, { fuellung: "#ffffff" })
    + (o.wasserzeichen ? _wasserzeichen(blatt) : "")
    + _zeichnungskasten(f.zeichnung, titel, warnungen, z.inner,
      { x: z.rand.links ? -z.rand.links : 0, y: z.rand.oben ? -z.rand.oben : 0,
        w: z.voll_breite_mm, h: z.voll_hoehe_mm })
    + _seitenspalte(f.spalte, [
      { titel: "Wände im Geschoss", zeilen: tabelle },
      { titel: "Darstellung", zeilen: [
        { art: "punkte", fs: FS_KLEIN, eintraege: legendeLageplan() }] },
      hgZeile ? { titel: "Planhintergrund", zeilen: [hgZeile] } : null,
      verz.length ? { titel: "Verzahnungen", zeilen: [
        { art: "text", fs: FS_KLEIN, farbe: INFO_FARBE, text: VERZAHNUNG_INFO }, ...verz,
      ] } : null,
    ])
    + kopf.zeichne(f.kopf.x, f.kopf.y);

  return { inhalt, titel, format: o.format, masstab: z.masstab, blatt_mm: blatt };
}

/**
 * Das WANDblatt als reine, selbstgenuegsame SVG-Zeichenkette ([D-1] … [D-8]).
 *
 * Zeichnung, Mengen, Kennzahlen, IDs und Maengel kommen unveraendert aus
 * `sembla-zeichnung.js`; das Format folgt der in Modul 7 getroffenen
 * Darstellungswahl dieser Wand ([D-7]).
 * @returns {{inhalt:string, titel:string, format:string, masstab:number, blatt_mm:{w:number,h:number}}}
 */
export function wandBlattInhalt(w, eingaben = {}, opts = {}) {
  const o = normOptionenZ(opts);
  const z = zeichnungSvg(w, o);
  const blatt = blattInnenZ(/** @type {any} */ (o.format));
  const titel = zeichnungTitel(w, z.masstab, o.planinhalt);

  // Schriftfeld: GENAU die zwingenden Angaben ([D-8], #61). Ein leeres optionales
  // Feld erzeugt keine Zeile — kein „–", kein „###".
  const p = (eingaben && eingaben.projekt) || {};
  const dim = _mmMass(w.length_mm) + " × " + _mmMass(w.height_mm);
  const nurGesetzt = (arr) => arr.filter((f) => f.v !== undefined && f.v !== null && String(f.v) !== "");
  const kopf = _schriftfeld(blatt.w - 2 * RAND_MM, [
    { anteil: 2.2, felder: nurGesetzt([
      { k: "Projekt", v: p.name || w.name }, { k: "Wand", v: (w.name || "") + " · " + dim }]) },
    { anteil: 1.2, felder: nurGesetzt([
      { k: "Planinhalt", v: o.planinhalt }, { k: "Plan Nr.", v: p.plan_nr },
      { k: "Index", v: p.index }]) },
    { anteil: 1.1, felder: nurGesetzt([
      { k: "Maßstab", v: `1 : ${z.masstab}` }, { k: "Einheit", v: "mm" },
      { k: "Gez.", v: p.gez }]) },
  ], _mmPx(96));
  const f = _blattfelder(blatt, kopf.hoehe);

  const ids = einbauteilZeilen(w);
  const mangel = konfliktZeilen(w);
  const vz = verzahnungZeilen(w);

  const inhalt = _rect(0, 0, blatt.w, blatt.h, { fuellung: "#ffffff" })
    + (o.wasserzeichen ? _wasserzeichen(blatt) : "")
    + _zeichnungskasten(f.zeichnung, titel, null, z.inner,
      { x: 0, y: 0, w: z.breite_mm, h: z.hoehe_mm })
    + _seitenspalte(f.spalte, [
      { titel: "Baustellenstückliste (Mengen)", zeilen: bomZeilen(w)
        .map((r) => ({ art: "tab", fs: FS_TAB, label: r.label, wert: r.menge })) },
      ids.length ? { titel: EINBAUTEIL_TITEL, zeilen: ids
        .map((r) => ({ art: "tab", fs: FS_IDS, wertLinks: true, label: r.label, wert: r.wert })) } : null,
      { titel: "Vorspannung", zeilen: vorspannZeilen(w)
        .map((r) => ({ art: "tab", fs: FS_TAB, label: r.label, wert: r.wert })) },
      mangel.length ? { titel: MANGEL_TITEL, mangel: true, zeilen: [
        ...mangel.map((e) => ({ art: "punkt", form: "chip", fs: FS_KLEIN,
          text: `${e.text} Betrifft ${e.anzahl} Segment(e)`
            + (e.straenge.length ? ` in Spannachse ${e.straenge.map((k) => "k" + k).join(", ")}` : "")
            + "." })),
        { art: "text", fs: FS_FUSS, farbe: GRAU, text: MANGEL_FUSS },
      ] } : null,
      vz.length ? { titel: VERZAHNUNG_TITEL, mangel: true, zeilen: [
        ...vz.map((e) => ({ art: "punkt", form: "chip", fs: FS_KLEIN,
          text: `${e.text} ${e.wo}.` })),
        { art: "text", fs: FS_FUSS, farbe: GRAU, text: VERZAHNUNG_FUSS },
      ] } : null,
      { titel: "Darstellung", zeilen: [
        { art: "punkte", fs: FS_KLEIN, eintraege: legendeWand(w) },
        { art: "text", fs: FS_FUSS, farbe: GRAU, text: EINBAUTEIL_FUSS },
      ] },
    ])
    + kopf.zeichne(f.kopf.x, f.kopf.y);

  return { inhalt, titel, format: o.format, masstab: z.masstab, blatt_mm: blatt };
}

/**
 * Die Zeichenkette, die TATSAECHLICH gerastert wird — der Ort der Invariante aus
 * #98/#107: kein `foreignObject`, kein externer Verweis, kein Stylesheet.
 *
 * Ohne Pixelmasse traegt das Wurzelelement seine Papier-mm und ist damit eine
 * eigenstaendig lesbare Blattdatei; mit Pixelmassen rastert der Browser dieselbe
 * `viewBox` auf die Zieldichte (der Zeichnungsinhalt wird dabei nicht umbrochen,
 * sondern gleichmaessig vergroessert).
 * @param {{titel?:string, inhalt:string, blatt_mm:{w:number,h:number}}} seite
 * @param {{breite_px?:number, hoehe_px?:number}} [px]
 */
export function blattSvg(seite, px = {}) {
  const w = seite.blatt_mm.w, h = seite.blatt_mm.h;
  const mitPx = Number.isFinite(px.breite_px) && Number.isFinite(px.hoehe_px);
  const groesse = mitPx
    ? ` width="${_n(px.breite_px)}" height="${_n(px.hoehe_px)}"`
    : ` width="${_n(w)}mm" height="${_n(h)}mm"`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${groesse}`
    + ` viewBox="0 0 ${_n(w)} ${_n(h)}">`
    + `<title>${_esc(seite.titel || "")}</title>`
    + `<clipPath id="${CLIP_FELD}">${_rect(0, 0, w, h, { fuellung: "#000" })}</clipPath>`
    + `<g clip-path="url(#${CLIP_FELD})">${seite.inhalt}</g></svg>`;
}

// ------------------------------------------------------------- Dateinamen

/**
 * Dateisicherer Namensstamm. Bewusst LOKAL und nicht aus `sembla-archiv.js`
 * importiert: der Zeichnungsexport haengt fachlich nicht am Projektarchiv, und
 * `sembla-lageplan.js` haelt sich fuer `dateiRumpf()` aus demselben Grund eine
 * eigene Fassung. Es ist eine Schreibweise, keine Fachregel.
 * @param {any} name @returns {string}
 */
export function sicherStamm(name) {
  const um = { "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe",
    "Ü": "Ue", "ß": "ss" };
  return String(name == null ? "" : name)
    // Umlaute werden UEBERTRAGEN statt getilgt: „Gebaeude" liest sich, „Geb_ude"
    // nicht. Das ist eine Schreibweise fuer Dateinamen und beruehrt keinen
    // gespeicherten Namen — in Mappe und Blatt steht weiter der echte.
    .replace(/[äöüÄÖÜß]/g, (c) => um[c])
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
 * frisch aus Mappe und kanonischem Loeserergebnis ab. Fehlt das Wandelement, ist
 * das ein verwaister Eintrag ([L-4]): er wird BENANNT und uebersprungen, nie
 * durch geratene Werte ersetzt.
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
  const daten = lageplanDaten({
    mappe: p.mappe, geschossId: p.geschossId, elemente: p.elemente,
    hintergrund: p.hintergrund,
  });
  const lp = lageplanBlattInhalt(daten, { format });
  seiten.push({
    art: "lageplan",
    titel: lp.titel,
    inhalt: lp.inhalt,
    format: lp.format,
    papier_mm: { ...BLATT_LP[lp.format].papier_mm },
    rand_mm: BLATT_LP[lp.format].rand_mm,
    blatt_mm: lp.blatt_mm,
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
    let blatt;
    try {
      blatt = wandBlattInhalt(el.wandelement, eingaben, optionenAusEingaben(eingaben));
    } catch (e) {
      luecken.push(`${ort} · „${w.name || w.id}“: das Wandblatt ist nicht ableitbar `
        + `(${e && e.message ? e.message : String(e)}); kein Wandblatt in der PDF.`);
      continue;
    }
    seiten.push({
      art: "wand",
      titel: blatt.titel,
      inhalt: blatt.inhalt,
      format: blatt.format,
      papier_mm: { ...BLATT_Z[blatt.format].papier_mm },
      rand_mm: BLATT_Z[blatt.format].rand_mm,
      blatt_mm: blatt.blatt_mm,
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
 * Gerastert wird GENAU die Zeichenkette aus `blattSvg()`: ein reines, in Papier-mm
 * gerechnetes SVG ohne `foreignObject`, ohne Stylesheet und ohne jeden externen
 * Verweis. Genau deshalb bleibt die Leinwand unverunreinigt und `toBlob()` darf
 * lesen — der Fehler „Tainted canvases may not be exported" aus #98/#107 kann hier
 * nicht mehr entstehen. Der Planhintergrund ([N-9]) steckt als Data-URL im Blatt
 * und ist single-origin; er wird mitgerastert und bleibt sichtbar.
 *
 * @param {{titel?:string, inhalt:string, blatt_mm:{w:number,h:number}}} seite
 * @param {number} [dpi]
 * @returns {Promise<{daten:Uint8Array, typ:'jpeg'|'png', breite_px:number, hoehe_px:number}>}
 */
export async function blattBild(seite, dpi = DPI) {
  const zielPx = (mm) => Math.max(1, Math.round(mm * dpi / 25.4));
  const breite = zielPx(seite.blatt_mm.w), hoehe = zielPx(seite.blatt_mm.h);
  const svg = blattSvg(seite, { breite_px: breite, hoehe_px: hoehe });
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
