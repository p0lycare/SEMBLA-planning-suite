// @ts-check
/**
 * SEMBLA Geschossplan — Planbild, Kalibrierung und Rasteroverlay ([L-8]/[L-9]).
 *
 * Der Geschossplan ist der HINTERGRUND der Verortung, nie eine Datenquelle
 * ([L-9]): aus dem Bild wird nichts abgeleitet — keine Wand, keine Laenge und
 * vor allem kein Massstab. Massstab (`mm_je_pixel`) und Versatz sind
 * ausdruecklich gesetzte ANZEIGEPARAMETER; ohne Kalibrierung gibt es kein
 * Raster ueber dem Plan (und keinen geschaetzten Ersatzwert).
 *
 * Zwei Koordinatensysteme, streng getrennt:
 *
 *   Bildpixel  — das gelieferte Rasterbild, Ursprung oben links.
 *   Raster-mm  — die Welt der Projektmappe ([L-1]): mm = grid × 125.
 *
 *   mm  = versatz + px × mm_je_pixel
 *   px  = (mm − versatz) / mm_je_pixel
 *
 * Der Versatz ist also die Raster-mm-Lage der linken oberen Bildecke. Damit
 * wird der PLAN ans Raster geschoben, nie das Raster an den Plan ([L-1]).
 *
 * Das Planbild liegt NICHT im localStorage ([L-8]) — dort wuerde es bei ~5 MB
 * den ganzen Projektstand mitreissen —, sondern in einer eigenen IndexedDB
 * (`sembla-plaene`, ein Datensatz je Geschoss-Kennung). Die Projektmappe haelt
 * davon nur Dateiname, Bildmasse, Massstab und Versatz.
 *
 * Dieses Modul ist DOM-frei (kein `document`, kein `window`): die Zeichnung
 * entsteht als SVG-Zeichenkette, die Ablage ueber IndexedDB. Fuer Tests laesst
 * sich die IndexedDB-Fabrik ueber `setzeIndexedDB()` einschleusen.
 *
 * Eigene Datei nach shared-Regel (b): eigene Tests (tests/module/test-plan.mjs).
 */

/** Laengsraster in mm ([G-1]) — die Einheit der Lage ([L-1]). */
export const GRID_MM = 125;

/** Jede wievielte Rasterlinie als Hauptlinie gezeichnet wird (8 × 125 = 1 m). */
export const HAUPTLINIE_JE = 8;

/**
 * Zulaessige Planformate ([L-8]). AUSSCHLIESSLICH Rasterbilder — ein PDF wird
 * benannt abgewiesen (s. `pruefePlanDatei`), nicht naeherungsweise gedeutet.
 */
export const PLAN_FORMATE = Object.freeze([
  { mime: "image/png", endungen: [".png"], label: "PNG" },
  { mime: "image/jpeg", endungen: [".jpg", ".jpeg"], label: "JPEG" },
  { mime: "image/webp", endungen: [".webp"], label: "WebP" },
]);

/** Dokumentierte Groessengrenze je Plan ([L-8]). Darueber wird gemeldet, nie verkleinert. */
export const PLAN_MAX_BYTES = 20 * 1024 * 1024;

/** Klartext der zulaessigen Formate (fuer Meldungen und `accept`-Attribute). */
export const PLAN_ACCEPT = PLAN_FORMATE.flatMap((f) => [f.mime, ...f.endungen]).join(",");

// --- Formatpruefung ([L-8]) -----------------------------------------------

function _endung(name) {
  const s = String(name || "");
  const i = s.lastIndexOf(".");
  return i < 0 ? "" : s.slice(i).toLowerCase();
}

/**
 * Eine angebotene Plandatei pruefen. Liefert Klartext-Fehler (leer = zulaessig).
 * Es wird NICHTS umgedeutet: ein unbekanntes Format wird abgewiesen, nicht
 * „versucht“ ([P-9]).
 * @param {{name?:string, type?:string, size?:number}} datei
 * @returns {string[]}
 */
export function pruefePlanDatei(datei) {
  const d = datei || {};
  const name = String(d.name || "");
  const typ = String(d.type || "").toLowerCase();
  const endung = _endung(name);
  /** @type {string[]} */
  const f = [];

  if (typ === "application/pdf" || endung === ".pdf") {
    f.push(
      "PDF-Pläne werden nicht gelesen ([L-8]): sie zu rendern verlangte eine Fremdbibliothek "
      + "im Betrieb, die diese Suite bewusst nicht lädt. Bitte den Plan vorher als PNG oder "
      + "JPEG exportieren (in den meisten PDF-Programmen: „Exportieren als Bild“, 150–300 dpi).",
    );
    return f;
  }

  const passt = PLAN_FORMATE.find((x) => x.mime === typ)
    || (typ === "" ? PLAN_FORMATE.find((x) => x.endungen.includes(endung)) : null);
  if (!passt) {
    f.push(`Format nicht zulässig (${typ || endung || "unbekannt"}). Erlaubt sind nur Rasterbilder: `
      + PLAN_FORMATE.map((x) => x.label).join(", ") + " ([L-8]).");
  }
  const groesse = Number(d.size);
  if (Number.isFinite(groesse) && groesse > PLAN_MAX_BYTES) {
    f.push(`Plan ist ${(groesse / 1048576).toFixed(1)} MB groß — die Grenze liegt bei `
      + `${PLAN_MAX_BYTES / 1048576} MB ([L-8]). Es wird nichts automatisch verkleinert; `
      + "bitte den Plan mit geringerer Auflösung exportieren.");
  }
  return f;
}

/** Kurzform: darf diese Datei als Plan geladen werden? */
export function planDateiZulaessig(datei) { return pruefePlanDatei(datei).length === 0; }

// --- Kalibrierung ([L-9]) --------------------------------------------------

/** Pixelabstand zweier Punkte im Bild. @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
export function pixelAbstand(a, b) {
  if (!a || !b) return null;
  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Den zweiten Punkt der Kalibrierlinie ORTHOGONAL zum ersten zwingen (Feinschliff
 * Etappe C4a). Gemessen wird an Grundrissen praktisch immer waagerecht oder
 * senkrecht; eine leicht schiefe Linie ist dabei ein Ablesefehler, der den
 * Massstab still verfaelscht. Gewaehlt wird die Achse mit der GROESSEREN
 * Pixeldifferenz — geraten wird nichts, die Vorgabe ist rein geometrisch.
 *
 * Bei genau gleichen Differenzen gewinnt die waagerechte Achse (feste Regel,
 * damit dieselbe Eingabe stets dasselbe Ergebnis liefert).
 *
 * @param {{x:number,y:number}} p1 @param {{x:number,y:number}} p2
 * @returns {{x:number,y:number}|null} `null`, wenn ein Punkt unbrauchbar ist
 */
export function orthogonalPunkt(p1, p2) {
  if (!p1 || !p2) return null;
  const x1 = _zahl(p1.x), y1 = _zahl(p1.y), x2 = _zahl(p2.x), y2 = _zahl(p2.y);
  if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
  return Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? { x: x2, y: y1 } : { x: x1, y: y2 };
}

/**
 * Massstab aus einer Kalibrierlinie ([L-9]): zwei Bildpunkte plus die reale
 * Strecke in mm. Unbrauchbare Angaben (Punkte zu dicht, Strecke ≤ 0) werden
 * ABGEWIESEN — es wird kein Ersatzmassstab geschaetzt.
 *
 * @param {{x:number,y:number}} p1 @param {{x:number,y:number}} p2 @param {number} strecke_mm
 * @returns {{mm_je_pixel:number, pixel:number, strecke_mm:number}}
 */
export function kalibriere(p1, p2, strecke_mm) {
  const px = pixelAbstand(p1, p2);
  const mm = Number(strecke_mm);
  if (px == null || !(px > 0)) {
    throw new Error("Kalibrierlinie zu kurz: die beiden Punkte liegen auf demselben Bildpunkt.");
  }
  if (!Number.isFinite(mm) || !(mm > 0)) {
    throw new Error("Bitte die reale Länge der Kalibrierlinie als positive Zahl in mm angeben.");
  }
  return { mm_je_pixel: mm / px, pixel: px, strecke_mm: mm };
}

/**
 * Massstab als 1:x — reine ANZEIGE der Kalibrierung, kein Zeichnungsmassstab
 * ([D-2] bleibt davon unberuehrt). Bezugsgroesse ist 1 Bildpixel bei 96 dpi.
 * @param {number|null|undefined} mm_je_pixel
 */
export function massstabText(mm_je_pixel) {
  const v = Number(mm_je_pixel);
  if (!Number.isFinite(v) || !(v > 0)) return "kein Maßstab gesetzt";
  return `1 Pixel = ${v.toFixed(v < 1 ? 3 : 2)} mm · 1 m = ${(1000 / v).toFixed(1)} Pixel`;
}

// --- Umrechnung Bildpixel ↔ Raster-mm --------------------------------------

function _zahl(v) { return (v == null || v === "" || !Number.isFinite(+v)) ? null : +v; }

/**
 * Ist der Plan kalibriert? Nur dann laesst sich ein Raster darueberlegen ([L-9]).
 * @param {any} plan Planblock der Projektmappe
 */
export function planKalibriert(plan) {
  const v = _zahl(plan && plan.mm_je_pixel);
  return v != null && v > 0;
}

/** Bildpunkt → Raster-mm. `null`, wenn nicht kalibriert (es wird nichts geraten). */
export function pixelZuMm(plan, px, py) {
  if (!planKalibriert(plan)) return null;
  const k = +plan.mm_je_pixel;
  return {
    x: (_zahl(plan.versatz_x_mm) || 0) + Number(px) * k,
    y: (_zahl(plan.versatz_y_mm) || 0) + Number(py) * k,
  };
}

/** Raster-mm → Bildpunkt. `null`, wenn nicht kalibriert. */
export function mmZuPixel(plan, mx, my) {
  if (!planKalibriert(plan)) return null;
  const k = +plan.mm_je_pixel;
  return {
    x: (Number(mx) - (_zahl(plan.versatz_x_mm) || 0)) / k,
    y: (Number(my) - (_zahl(plan.versatz_y_mm) || 0)) / k,
  };
}

/** Rasterpunkt (ganzzahlig, [L-1]) → Bildpunkt. */
export function gridZuPixel(plan, gx, gy) {
  return mmZuPixel(plan, Number(gx) * GRID_MM, Number(gy) * GRID_MM);
}

/**
 * Bildpunkt → NAECHSTGELEGENER Rasterpunkt ([L-1]: die Lage ist ganzzahlig).
 * Das ist ausdruecklich ein Eingabe-Fang beim Zeichnen (C4), keine nachtraegliche
 * Rundung gespeicherter Lagen — die gibt es nicht.
 * @returns {{x:number,y:number}|null}
 */
export function pixelZuGrid(plan, px, py) {
  const mm = pixelZuMm(plan, px, py);
  if (!mm) return null;
  return { x: Math.round(mm.x / GRID_MM), y: Math.round(mm.y / GRID_MM) };
}

/**
 * Lage und Groesse des Planbildes in RASTER-MM ([L-9]) — das, was ein in
 * Millimetern gezeichneter Grundriss (Layout-Editor, Etappe C4a) als Hintergrund
 * braucht. `null`, wenn der Plan nicht kalibriert ist oder die Bildmasse fehlen:
 * dann gibt es keine mm-Groesse, und es wird keine geschaetzt.
 *
 * @param {any} plan @param {{breite_px?:number, hoehe_px?:number}} [masse] Ersatzmasse (Bilddatensatz)
 * @returns {{x:number, y:number, breite:number, hoehe:number, mm_je_pixel:number}|null}
 */
export function planRahmenMm(plan, masse) {
  if (!planKalibriert(plan)) return null;
  const k = +plan.mm_je_pixel;
  const b = _zahl(plan.breite_px) ?? _zahl(masse && masse.breite_px);
  const h = _zahl(plan.hoehe_px) ?? _zahl(masse && masse.hoehe_px);
  if (b == null || h == null || !(b > 0) || !(h > 0)) return null;
  return {
    x: _zahl(plan.versatz_x_mm) || 0,
    y: _zahl(plan.versatz_y_mm) || 0,
    breite: b * k, hoehe: h * k, mm_je_pixel: k,
  };
}

/**
 * Der VORLAEUFIGE Anzeigefaktor eines noch nicht kalibrierten Plans (#52).
 *
 * Fest 1 Bildpixel = 1 mm. Das ist ausdruecklich KEIN geschaetzter Massstab: er
 * wird nie gespeichert, geht in keine Umrechnung von Wandlagen ein und traegt in
 * jedem Rahmen das Kennzeichen `vorlaeufig`. Er existiert allein, damit der Plan
 * als Hintergrund ueberhaupt sichtbar ist — sonst liesse sich die Kalibrierlinie
 * gar nicht erst in ihn hineinklicken ([L-9]).
 */
export const VORLAEUFIG_MM_JE_PIXEL = 1;

/**
 * Lage und Groesse eines NICHT kalibrierten Planbildes fuer die reine Anzeige
 * (#52). `null`, sobald der Plan kalibriert ist (dann gilt `planRahmenMm`) oder
 * die Bildmasse fehlen — erfunden wird nichts.
 *
 * @param {any} plan @param {{breite_px?:number, hoehe_px?:number}} [masse]
 * @returns {{x:number, y:number, breite:number, hoehe:number, mm_je_pixel:number, vorlaeufig:true}|null}
 */
export function planVorschauRahmen(plan, masse) {
  if (planKalibriert(plan)) return null;
  const b = _zahl(plan && plan.breite_px) ?? _zahl(masse && masse.breite_px);
  const h = _zahl(plan && plan.hoehe_px) ?? _zahl(masse && masse.hoehe_px);
  if (b == null || h == null || !(b > 0) || !(h > 0)) return null;
  const k = VORLAEUFIG_MM_JE_PIXEL;
  return {
    x: _zahl(plan && plan.versatz_x_mm) || 0,
    y: _zahl(plan && plan.versatz_y_mm) || 0,
    breite: b * k, hoehe: h * k, mm_je_pixel: k, vorlaeufig: true,
  };
}

/**
 * Der Rahmen, mit dem die Zeichenflaeche das Bild einhaengt: der ECHTE Massstab,
 * sonst der vorlaeufige (#52). Genau eine Quelle — die Oberflaeche entscheidet
 * das nicht noch einmal selbst.
 * @param {any} plan @param {{breite_px?:number, hoehe_px?:number}} [masse]
 */
export function planAnsichtRahmen(plan, masse) {
  return planRahmenMm(plan, masse) || planVorschauRahmen(plan, masse);
}

/**
 * Weltpunkt (mm der Zeichenflaeche) → Bildpunkt in einem Rahmen. Das ist der
 * Rueckweg der Kalibrierung AUF der Buehne: gemessen wird in Bildpixeln, damit
 * der Massstab vom Blick (Zoom/Pan) unabhaengig bleibt.
 * @param {{x:number,y:number,mm_je_pixel:number}|null} rahmen
 * @param {{x:number,y:number}} punkt
 * @returns {{x:number,y:number}|null}
 */
export function rahmenPunktZuPixel(rahmen, punkt) {
  if (!rahmen || !punkt) return null;
  const k = _zahl(rahmen.mm_je_pixel);
  if (k == null || !(k > 0)) return null;
  return { x: (Number(punkt.x) - rahmen.x) / k, y: (Number(punkt.y) - rahmen.y) / k };
}

/**
 * Die im Bild sichtbaren Rasterlinien ([L-9]) — als Bildpixel-Koordinaten.
 * Ohne Kalibrierung ist die Liste LEER: es wird kein Raster erfunden.
 *
 * @param {any} plan @param {number} breite_px @param {number} hoehe_px
 * @returns {{x:Array<{px:number,grid:number,haupt:boolean}>, y:Array<{px:number,grid:number,haupt:boolean}>}}
 */
export function rasterLinien(plan, breite_px, hoehe_px) {
  const leer = { x: [], y: [] };
  if (!planKalibriert(plan)) return leer;
  const b = _zahl(breite_px), h = _zahl(hoehe_px);
  if (b == null || h == null || b <= 0 || h <= 0) return leer;
  const k = +plan.mm_je_pixel;
  // Zu feine Raster sind unlesbar und kosten nur Knoten — dann lieber nichts
  // zeichnen und es in der Oberflaeche benennen (s. `rasterLesbar`).
  if (!rasterLesbar(plan)) return leer;

  const achse = (laenge_px, versatz_mm) => {
    const von = Math.ceil((versatz_mm) / GRID_MM);
    const bis = Math.floor((versatz_mm + laenge_px * k) / GRID_MM);
    const out = [];
    for (let g = von; g <= bis; g++) {
      out.push({ px: (g * GRID_MM - versatz_mm) / k, grid: g, haupt: g % HAUPTLINIE_JE === 0 });
    }
    return out;
  };
  return {
    x: achse(b, _zahl(plan.versatz_x_mm) || 0),
    y: achse(h, _zahl(plan.versatz_y_mm) || 0),
  };
}

/** Rasterweite in Bildpixeln (null = nicht kalibriert). */
export function rasterWeitePx(plan) {
  return planKalibriert(plan) ? GRID_MM / +plan.mm_je_pixel : null;
}

/**
 * Ist das Raster bei diesem Massstab ueberhaupt darstellbar? Unter 2 Bildpixeln
 * je Rastereinheit waere es eine graue Flaeche — dann wird es weggelassen und
 * das GESAGT, statt ein unlesbares Netz zu zeichnen.
 */
export function rasterLesbar(plan) {
  const w = rasterWeitePx(plan);
  return w != null && w >= 2;
}

// --- Zeichnung (SVG-Zeichenkette, DOM-frei) --------------------------------

function _esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function _r(v) { return Math.round(Number(v) * 100) / 100; }

/** Armlaenge und Mittelluecke eines Kreuzmarkers, in Vielfachen der Strichbreite. */
export const KREUZ_ARM = 9;
export const KREUZ_LUECKE = 3;

/**
 * Pfad eines Kreuzmarkers mit AUSGESPARTER MITTE — die anzuklickende Stelle bleibt
 * sichtbar. `mass` ist die Bezugsgroesse (1 Schirmpixel in Bildpixeln, also 1/zoom),
 * damit der Marker bei jedem Zoom gleich gross erscheint.
 * @param {number} x @param {number} y @param {number} mass
 * @returns {string} SVG-Pfaddaten
 */
export function kreuzPfad(x, y, mass) {
  const m = Number(mass) > 0 ? Number(mass) : 1;
  const a = KREUZ_ARM * m, g = KREUZ_LUECKE * m;
  const cx = _r(x), cy = _r(y);
  return `M${_r(x - a)} ${cy}H${_r(x - g)}M${_r(x + g)} ${cy}H${_r(x + a)}`
    + `M${cx} ${_r(y - a)}V${_r(y - g)}M${cx} ${_r(y + g)}V${_r(y + a)}`;
}

/**
 * Plan mit Rasteroverlay als SVG ([L-9], reine Anzeige).
 *
 * Der viewBox liegt in BILDPIXELN — damit ist der Plan auch OHNE Kalibrierung
 * darstellbar (dann eben ohne Raster) und ein Klick ins Bild laesst sich direkt
 * als Bildpunkt lesen (`svgPunktZuPixel`).
 *
 * @param {any} plan Planblock der Projektmappe (Massstab/Versatz)
 * @param {{bildUrl?:string|null, breite_px:number, hoehe_px:number, zoom?:number,
 *          kalibrierpunkte?:Array<{x:number,y:number}>, marken?:Array<{x:number,y:number,titel?:string}>,
 *          beschriftung?:boolean}} opt
 * @returns {string} SVG
 */
export function planSvg(plan, opt) {
  const o = opt || /** @type {any} */ ({});
  const b = _zahl(o.breite_px) || 0;
  const h = _zahl(o.hoehe_px) || 0;
  if (!(b > 0) || !(h > 0)) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>';
  }
  const zoom = _zahl(o.zoom) || 1;
  const linien = rasterLinien(plan, b, h);
  // Strichstaerken in BILDPIXELN, damit sie auf dem Schirm konstant duenn bleiben.
  const s = 1 / zoom;

  const teile = [];
  teile.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${_r(b * zoom)}" height="${_r(h * zoom)}"`
    + ` viewBox="0 0 ${_r(b)} ${_r(h)}" class="planblatt">`);
  if (o.bildUrl) {
    teile.push(`<image href="${_esc(o.bildUrl)}" x="0" y="0" width="${_r(b)}" height="${_r(h)}"`
      + ' preserveAspectRatio="none"/>');
  } else {
    teile.push(`<rect x="0" y="0" width="${_r(b)}" height="${_r(h)}" fill="#f2f5f9"/>`);
  }

  if (linien.x.length || linien.y.length) {
    const fein = [], haupt = [];
    for (const l of linien.x) {
      (l.haupt ? haupt : fein).push(`M${_r(l.px)} 0V${_r(h)}`);
    }
    for (const l of linien.y) {
      (l.haupt ? haupt : fein).push(`M0 ${_r(l.px)}H${_r(b)}`);
    }
    if (fein.length) {
      teile.push(`<path d="${fein.join("")}" fill="none" stroke="#2f6fb3" stroke-opacity=".35"`
        + ` stroke-width="${_r(s)}" class="rasterfein"/>`);
    }
    if (haupt.length) {
      teile.push(`<path d="${haupt.join("")}" fill="none" stroke="#2f6fb3" stroke-opacity=".75"`
        + ` stroke-width="${_r(s * 1.6)}" class="rasterhaupt"/>`);
    }
    if (o.beschriftung !== false) {
      // Metermarken nur an den Hauptlinien — mehr waere bei jedem Zoom unlesbar.
      const t = [];
      for (const l of linien.x) {
        if (!l.haupt) continue;
        t.push(`<text x="${_r(l.px + 2 * s)}" y="${_r(12 * s)}" font-size="${_r(10 * s)}"`
          + ` fill="#2f6fb3">${l.grid * GRID_MM / 1000} m</text>`);
      }
      for (const l of linien.y) {
        if (!l.haupt) continue;
        t.push(`<text x="${_r(2 * s)}" y="${_r(l.px - 3 * s)}" font-size="${_r(10 * s)}"`
          + ` fill="#2f6fb3">${l.grid * GRID_MM / 1000} m</text>`);
      }
      if (t.length) teile.push(`<g class="rastertext">${t.join("")}</g>`);
    }
  }

  // Kalibrierlinie: die beiden gesetzten Punkte und ihre Verbindung. Die Linie ist
  // GESTRICHELT (sie ist Messhilfe, keine Zeichnungskante), die Punkte sind
  // KREUZMARKER MIT AUSGESPARTER MITTE — ein voller Punkt verdeckt genau die Stelle,
  // die man treffen will (Feinschliff Etappe C4a).
  const kp = Array.isArray(o.kalibrierpunkte) ? o.kalibrierpunkte.filter(Boolean) : [];
  if (kp.length) {
    if (kp.length >= 2) {
      teile.push(`<line x1="${_r(kp[0].x)}" y1="${_r(kp[0].y)}" x2="${_r(kp[1].x)}" y2="${_r(kp[1].y)}"`
        + ` stroke="#c0392b" stroke-width="${_r(s * 1.6)}"`
        + ` stroke-dasharray="${_r(s * 7)} ${_r(s * 5)}" class="kallinie"/>`);
    }
    for (const p of kp.slice(0, 2)) {
      teile.push(`<path d="${kreuzPfad(p.x, p.y, s)}" fill="none" stroke="#c0392b"`
        + ` stroke-width="${_r(s * 1.6)}" class="kalpunkt"/>`);
    }
  }

  // Marken (spaeter: verortete Waende). Hier nur die Durchreiche — C4 fuellt sie.
  for (const mk of (Array.isArray(o.marken) ? o.marken : [])) {
    if (!mk) continue;
    teile.push(`<circle cx="${_r(mk.x)}" cy="${_r(mk.y)}" r="${_r(s * 3)}" fill="#1e7e34"`
      + (mk.titel ? `><title>${_esc(mk.titel)}</title></circle>` : "/>"));
  }

  teile.push("</svg>");
  return teile.join("");
}

/**
 * Klickpunkt der SVG-Flaeche in einen BILDPUNKT umrechnen. Die Flaeche ist um
 * `zoom` skaliert; der viewBox liegt in Bildpixeln.
 * @param {{links:number, oben:number, zoom?:number}} rahmen Position der Flaeche im Fenster
 * @param {{x:number, y:number}} klick Fensterkoordinaten (clientX/clientY)
 * @returns {{x:number,y:number}}
 */
export function svgPunktZuPixel(rahmen, klick) {
  const zoom = _zahl(rahmen && rahmen.zoom) || 1;
  return {
    x: (Number(klick.x) - Number(rahmen.links)) / zoom,
    y: (Number(klick.y) - Number(rahmen.oben)) / zoom,
  };
}

// --- Ablage des Bildes (IndexedDB, [L-8]) ----------------------------------

/** Name der eigenen Plan-Datenbank — bewusst getrennt vom localStorage-Projektstand. */
export const DB_NAME = "sembla-plaene";
export const DB_VERSION = 1;
export const DB_STORE = "plaene";

let _idbFactory = null;                 // null = die des Browsers verwenden

/**
 * IndexedDB-Fabrik einschleusen (Tests). `null` stellt den Browserstand wieder her.
 * @param {any} factory
 */
export function setzeIndexedDB(factory) { _idbFactory = factory || null; }

function _idb() {
  const f = _idbFactory || (typeof globalThis !== "undefined" ? globalThis.indexedDB : null);
  if (!f) {
    throw new Error("Dieser Browser stellt keinen IndexedDB-Speicher bereit — Planbilder können "
      + "nicht abgelegt werden. Ein Ausweichen in den localStorage ist ausgeschlossen ([L-8]).");
  }
  return f;
}

/** Ist ueberhaupt ein Planspeicher vorhanden? (Oberflaeche meldet das, statt zu scheitern.) */
export function planSpeicherVerfuegbar() {
  try { return !!_idb(); } catch { return false; }
}

function _anfrage(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error || new Error("IndexedDB-Zugriff fehlgeschlagen."));
  });
}

async function _oeffne() {
  const req = _idb().open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
  };
  return await _anfrage(req);
}

async function _mitStore(modus, fn) {
  const db = await _oeffne();
  try {
    const tx = db.transaction(DB_STORE, modus);
    const ergebnis = await fn(tx.objectStore(DB_STORE));
    return ergebnis;
  } finally {
    if (db.close) db.close();
  }
}

/**
 * Planbild eines Geschosses ablegen ([L-8]). Der Schluessel ist die stabile
 * Geschoss-Kennung der Projektmappe ([L-4]) — nie der Dateiname.
 *
 * @param {string} geschossId
 * @param {any} blob das Bild (Blob/File)
 * @param {{name?:string, typ?:string, groesse?:number, breite_px?:number, hoehe_px?:number, zeit?:string}} meta
 * @returns {Promise<object>} der abgelegte Datensatz (ohne das Bild)
 */
export async function speicherePlan(geschossId, blob, meta) {
  const id = String(geschossId || "");
  if (!id) throw new Error("Planbild ohne Geschoss-Kennung kann nicht abgelegt werden ([L-4]).");
  if (!blob) throw new Error("Kein Planbild übergeben.");
  const m = meta || {};
  const satz = {
    id,
    name: String(m.name || ""),
    typ: String(m.typ || ""),
    groesse: _zahl(m.groesse),
    breite_px: _zahl(m.breite_px),
    hoehe_px: _zahl(m.hoehe_px),
    zeit: m.zeit || new Date().toISOString(),
    blob,
  };
  try {
    await _mitStore("readwrite", (s) => _anfrage(s.put(satz)));
  } catch (e) {
    const grund = (e && e.name === "QuotaExceededError")
      ? "Der Browserspeicher ist voll — der Plan wurde NICHT abgelegt ([L-8])."
      : `Planbild konnte nicht abgelegt werden (${e && e.message ? e.message : e}).`;
    throw new Error(grund);
  }
  const { blob: _weg, ...ohneBild } = satz;
  return ohneBild;
}

/**
 * Planbild eines Geschosses lesen. `null` = kein Bild vorhanden — das ist KEIN
 * Fehler, sondern der Normalfall in einem anderen Browser ([L-9]).
 * @param {string} geschossId @returns {Promise<object|null>}
 */
export async function holePlan(geschossId) {
  const id = String(geschossId || "");
  if (!id) return null;
  try {
    return (await _mitStore("readonly", (s) => _anfrage(s.get(id)))) || null;
  } catch { return null; }
}

/** Planbild entfernen (kein Fehler, wenn keines da war). @param {string} geschossId */
export async function loeschePlan(geschossId) {
  const id = String(geschossId || "");
  if (!id) return false;
  try {
    await _mitStore("readwrite", (s) => _anfrage(s.delete(id)));
    return true;
  } catch { return false; }
}

/** Kennungen aller abgelegten Planbilder (fuer Aufraeum-Meldungen). @returns {Promise<string[]>} */
export async function listePlaene() {
  try {
    const keys = await _mitStore("readonly", (s) => _anfrage(s.getAllKeys()));
    return (keys || []).map(String);
  } catch { return []; }
}

/**
 * Freier Browserspeicher, soweit der Browser ihn nennt ([L-8]: Grenzen sind zu
 * dokumentieren). `null` = keine Auskunft — dann wird nichts geschaetzt.
 * @returns {Promise<{belegt:number, kontingent:number}|null>}
 */
export async function speicherStand() {
  try {
    const st = globalThis.navigator && globalThis.navigator.storage;
    if (!st || !st.estimate) return null;
    const e = await st.estimate();
    if (!e || !Number.isFinite(e.quota)) return null;
    return { belegt: Number(e.usage) || 0, kontingent: Number(e.quota) };
  } catch { return null; }
}

/** Bytes lesbar machen (Meldungen ueber Plangroesse/Speicher). @param {number|null} n */
export function bytesText(n) {
  const v = _zahl(n);
  if (v == null) return "–";
  if (v >= 1048576) return (v / 1048576).toFixed(1) + " MB";
  if (v >= 1024) return (v / 1024).toFixed(0) + " kB";
  return v + " B";
}
