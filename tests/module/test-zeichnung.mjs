// Fokussierter Test: technische Zeichnung (Issue #36, Regeln [D-1] … [D-8]).
//
// Prueft den PRODUKTIONS-Baustein docs/shared/sembla-zeichnung.js und seine Verdrahtung
// im zentralen Export (sembla-export.js/baueDateien) direkt — nicht ueber Stubs:
//   * [D-1] Zeichnung entsteht allein aus dem kanonischen Wandelement,
//   * [D-2] Norm-Masstab + mm-genaues SVG (Zeichnung passt wirklich ins Blattfeld),
//   * [D-3] Bemassung: ALLE Masszahlen als reine Millimeterwerte ohne Suffix,
//           Einheit genau einmal im Schriftfeld (#64),
//   * [D-4] Darstellung von Steinen/Oeffnungen/Kontur/Blechen/Stangen inkl. realer
//           Stangenstuecke (Kopplungen, Sonderlaengen) aus stangenEnden(),
//   * [D-5] keine Regellisten auf dem Blatt — die Regel verlangt Aussagewahrheit,
//           keine Darstellung (#61),
//   * [D-6] EINE Ableitung fuer Vorschau und Export,
//   * [D-7] eingaben.zeichnung enthaelt nur Darstellungsoptionen,
//   * [D-8] Schriftfeld nur mit den zwingenden Angaben, ohne Nachweis (#61).
//
// Checkout-autark: alle Waende kommen synthetisch aus dem Core, keine Fixture-Dateien,
// keine vertrauliche Geometrie.

import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { standardEingaben } from "../../docs/shared/storage.js";
import { einbauteile, semblaBomItems } from "../../docs/shared/sembla-bom.js";
import { stangenEnden, stangenStuecke, STUECK_FARBE, STUECK_LABEL,
         bodenblechTeile, bodenblechStoesse, BLECHSTOSS, abschnittSvg, montageAbschnitte,
         // #110: die gemeinsame Symbolquelle der Spannkomponenten — das Blatt darf dafuer
         // keine eigene Geometrie und keine eigenen Hex-Werte fuehren ([D-4]).
         SPANN_FARBE, SPANN_MM, SPANN_EINHEIT, kupplungDurchmesser, mutterSvg,
         // #97: nur fuer den Vergleich Modul 1 <-> Modul 7 — die Wandansicht ruft genau diese
         // Funktion mit ihrer eigenen Einheit auf, das Blatt mit seiner.
         spannplatteSvg as Z_spannplatteSvg,
         kopplungsmutterSvg as Z_kopplungsmutterSvg,
         ZWISCHENPUNKT, DECKENANSCHLUSS } from "../../docs/shared/sembla-montage.js";
import { wirksameZwischenpunkte } from "../../docs/shared/sembla-core.js";
import * as Z from "../../docs/shared/sembla-zeichnung.js";
import { baueDateien, zeichnungHtml, zeichnungSvgText } from "../../docs/shared/sembla-export.js";
// #79 NUR als Vergleichsmassstab fuer Wortlaut und Kennfarbe (Drift-Waechter). Der
// Produktivcode der Zeichnung importiert daraus AUSDRUECKLICH NICHTS — zwei
// Ausgabemodule duerfen nicht aneinanderhaengen; genau das prueft dieser Test mit.
import * as LP from "../../docs/shared/sembla-lageplan.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

// --- Referenzfaelle (synthetisch aus dem Core) -----------------------------
// W  : Wand mit Tuer, gestaffelt -> Oeffnungs-, Bruestungs- und Staffelungsmasse
// W ist ein ausdruecklicher KOPFBLECH-Fall: das Blatt zeigt Boden- UND Kopfblech. Der obere
// Anschluss wird deshalb AUSGESPROCHEN und nicht dem allgemeinen Default ueberlassen.
const W = buildWall("IW-01", 3000, 2600, [new Opening(6, 12, 0, 10, "tuer")], null,
  { top_connection: "blech" },
  [{ x0_mm: 1500, x1_mm: 2250, height_mm: 2000 }]);
// WF : Fenster mit Bruestung (l0 > 0)
const WF = buildWall("IW-02", 4000, 2600, [new Opening(8, 14, 4, 10, "fenster")]);
// WL : lange Wand -> groberer Masstab
const WL = buildWall("IW-03", 12000, 4000, []);
// WSP: oberer Anschluss SPANNPLATTE ([A-2]) -> das Blatt zeigt die Platte am Strangende (#110)
const WSP = buildWall("IW-05", 3000, 2600, [], null, { top_connection: "spannplatte" });
// WSP8: dieselbe Wand, aber MIT dem realen Katalogmass der Spannplattendicke (#92/#97).
// Der Kopfzuschlag IST die Plattendicke; ueber ihn kommt sie in die Zeichnung ([D-4]).
const WSP8 = buildWall("IW-06", 3000, 2600, [], null,
  { top_connection: "spannplatte", rod_kopf_zuschlag_mm: 8 });
// WKU30/WKU45: dieselbe Wand mit der REALEN Kopplungsmutterhoehe (#92/#97). Im Wandelement
// steht die HALBE Hoehe als Fussoffset ([A-19]) — gezeichnet wird das Doppelte. Es gibt dafuer
// kein eigenes Feld, und es wird auch keines angelegt.
const WKU30 = buildWall("IW-07", 3000, 2600, [], null, { rod_fuss_offset_mm: 15 });
const WKU45 = buildWall("IW-08", 3000, 2600, [], null, { rod_fuss_offset_mm: 22.5 });
// WSW17/WSW24: dieselbe Wand mit gefuehrter SCHLUESSELWEITE (#97). Sie steht als
// `prestress.kupplung_sw_mm` im Wandelement — abgeleitet beim Auslegen aus dem gewaehlten
// Katalogprodukt. Das Blatt liest sie nur; der Katalog wird hier nie angefasst ([D-1]).
const WSW17 = buildWall("IW-09", 3000, 2600, [], null,
  { rod_fuss_offset_mm: 15, kupplung_sw_mm: 17 });
const WSW24 = buildWall("IW-10", 3000, 2600, [], null,
  { rod_fuss_offset_mm: 15, kupplung_sw_mm: 24 });
// WSM/WSMG: oberer Anschluss SPANNPLATTE mit gefuehrten SPANNMUTTERmassen (#97). Beide stehen
// als `prestress.spannmutter_h_mm`/`spannmutter_sw_mm` im Wandelement — abgeleitet beim
// Auslegen aus dem gewaehlten Katalogprodukt. Das Blatt liest sie nur ([D-1]). WSMG ist
// dieselbe Wand mit einem deutlich groesseren Produkt.
const WSM = buildWall("IW-11", 3000, 2600, [], null,
  { top_connection: "spannplatte", rod_kopf_zuschlag_mm: 8,
    spannmutter_h_mm: 10, spannmutter_sw_mm: 17 });
// Bewusst DERSELBE Wandname wie WSM: die Bit-Gleichheitsprobe unten vergleicht die Blaetter
// zeichenweise, und der Name steht im Schriftfeld — es soll sich nur das Produkt unterscheiden.
const WSMG = buildWall("IW-11", 3000, 2600, [], null,
  { top_connection: "spannplatte", rod_kopf_zuschlag_mm: 8,
    spannmutter_h_mm: 24, spannmutter_sw_mm: 30 });

const eingaben = standardEingaben();
eingaben.projekt.name = "Rettungswache";
eingaben.projekt.bauherr = "Landkreis";
eingaben.projekt.plan_nr = "A-12";
eingaben.projekt.index = "2";
eingaben.projekt.gez = "TB";

// --- 1) [D-7] Darstellungsoptionen: Standard, Normalisierung, Eingaben-Modell ---
const std = Z.standardOptionen();
ok("Standardoptionen: A3, Masse und Steintypen an, ohne Wasserzeichen",
  std.format === "a3" && std.masse === true && std.steintypen === true && std.wasserzeichen === false);
ok("standardEingaben() enthaelt den Zeichnungsabschnitt mit denselben Werten",
  JSON.stringify(standardEingaben().zeichnung) === JSON.stringify(std));
ok("eingaben.zeichnung enthaelt NUR Darstellungsoptionen (keine Geometrie/Statik/Produkte)",
  Object.keys(std).sort().join(",") === "format,masse,planinhalt,steintypen,wasserzeichen");
ok("unbekanntes Format faellt auf A3 zurueck", Z.normOptionen({ format: "a0" }).format === "a3");
ok("leerer Planinhalt faellt auf den Standard zurueck", Z.normOptionen({ planinhalt: "" }).planinhalt === "Wandabwicklung");
ok("Altprojekt ohne eingaben.zeichnung liefert die Standardoptionen",
  JSON.stringify(Z.optionenAusEingaben({})) === JSON.stringify(std));
ok("gespeicherte Optionen werden uebernommen",
  Z.optionenAusEingaben({ zeichnung: { format: "a4", masse: false } }).format === "a4"
  && Z.optionenAusEingaben({ zeichnung: { format: "a4", masse: false } }).masse === false);

// --- 2) [D-2] Masstab: Normreihe, groesster passender, Blattfeld eingehalten ---
ok("Masstab kommt aus der Normreihe", Z.MASSSTAEBE.includes(Z.waehleMasstab(3000, 2600, "a3")));
const mA3 = Z.waehleMasstab(3000, 2600, "a3"), mA4 = Z.waehleMasstab(3000, 2600, "a4");
ok("A4 braucht einen gleichen oder groberen Masstab als A3", mA4 >= mA3);
ok("laengere Wand -> grober Masstab", Z.waehleMasstab(12000, 4000, "a3") > mA3);
let passtImmer = true, masstabTreu = true;
for (const w of [W, WF, WL, buildWall("k", 1000, 1000, []), buildWall("g", 9000, 3400, [])]) {
  for (const f of ["a3", "a4"]) {
    const z = Z.zeichnungSvg(w, { format: f });
    const feld = Z.BLATT[f].feld_mm;
    if (z.breite_mm > feld.w + 1e-9 || z.hoehe_mm > feld.h + 1e-9) passtImmer = false;
    // Zeichenmass im SVG = Wandmass / Masstab + Rand
    const sollB = w.length_mm / z.masstab + 2 * Z.PAD_MM;
    if (Math.abs(z.breite_mm - sollB) > 1e-6) masstabTreu = false;
    // Die SVG-Attribute sind auf 3 Dezimalen gekuerzt (stabile Zeichenkette).
    const mm = z.svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
    if (!mm || Math.abs(+mm[1] - z.breite_mm) > 5e-4 || Math.abs(+mm[2] - z.hoehe_mm) > 5e-4) masstabTreu = false;
  }
}
ok("gewaehlter Masstab haelt das Blattfeld inkl. Zeichnungsrand ein", passtImmer);
ok("SVG traegt mm-Masse und ist exakt 1:Masstab", masstabTreu);
const zA3 = Z.zeichnungSvg(W, { format: "a3" });
ok("SVG hat viewBox in Papier-mm", zA3.viewBox === `0 0 ${zA3.breite_mm} ${zA3.hoehe_mm}`);

// --- 3) [D-1]/[D-4] Zeichnungsinhalt aus dem Wandelement -------------------
const svg = zA3.svg;
const steine = W.courses.reduce((s, c) => s + c.stones.length, 0);
ok("jeder Stein des Wandelements ist gezeichnet", (svg.match(/<rect/g) || []).length >= steine);
ok("i3- und i2-Steine sind unterscheidbar dargestellt",
  svg.includes(Z.FARBE.i3) && svg.includes(Z.FARBE.i2));
ok("Steintypen beschriftet (Option an)", />i3</.test(svg));
ok("Steintyp-Beschriftung abschaltbar", !/>i3</.test(Z.zeichnungSvg(W, { steintypen: false }).svg));
ok("Oeffnung ist mit ihrer Art beschriftet", />Tür</.test(svg) && svg.includes(Z.FARBE.oeffnung));
ok("Fensteroeffnung wird als Fenster beschriftet", />Fenster</.test(Z.zeichnungSvg(WF, {}).svg));
ok("gestufte Wandkontur als Polylinie", /<polyline/.test(svg));
ok("Bodenblech und Kopfblech gezeichnet", (svg.match(new RegExp(Z.FARBE.stahl, "g")) || []).length >= 2);
ok("Steinreihen sind nummeriert (1 … lagen)",
  svg.includes(">" + W.lagen + "</text>") && svg.includes(">1</text>"));

// Stangenstuecke: Anzahl der gezeichneten Linien = Summe der realen Stuecke (stangenStuecke)
let stueckSoll = 0, sonderSoll = 0;
for (const col of W.tension_columns) {
  for (const sg of col.segments) {
    stueckSoll += stangenStuecke(W, sg).length;
    for (const st of (sg.stuecke || [])) if (st.art === "sonder") sonderSoll++;
  }
}
const stangenLinien = (svg.match(new RegExp(`stroke="${Z.FARBE.stange}"`, "g")) || []).length;
const sonderLinien = (svg.match(new RegExp(`stroke="${Z.FARBE.stange_sonder}"`, "g")) || []).length;
ok("Stangen werden stueckweise aus den realen `stuecke` gezeichnet",
  stangenLinien + sonderLinien === stueckSoll && stueckSoll > W.tension_columns.length);
ok("Sonderlaengen sind eigens gekennzeichnet", sonderSoll > 0 && sonderLinien === sonderSoll);
// Kopplungen und Verankerungen sind markiert — seit #110 als ZYLINDER in Seitenansicht
// (Rechteck + zwei Stirnkanten) statt als Kreis. Die Aussage der Pruefung ist unveraendert:
// die Anker- und Kopplungsstellen sind im Blatt gekennzeichnet, und zwar in der Mutterfarbe.
const RE_MUTTER = new RegExp(`<rect x="[-\\d.]+" y="[-\\d.]+" width="[-\\d.]+" `
  + `height="([-\\d.]+)" fill="${Z.FARBE.mutter}"/>`, "g");
const mutterHoehen = svg => [...svg.matchAll(RE_MUTTER)].map(m => +m[1]);
ok("Kopplungen/Verankerungen sind markiert",
  svg.includes(Z.FARBE.mutter) && mutterHoehen(svg).length > 0);
ok("[#110] keine Kreis- oder Sechseckdarstellung mehr im Blatt",
  !/<circle/.test(svg) && !/<polygon/.test(svg));

// #110/#106: dieselben Symbolformen wie in der Wandansicht von Modul 1 — geprueft an der
// GEMEINSAMEN Quelle. Die Hoehen im Blatt sind seit #106 die FESTEN Papier-mm aus `SPANN_MM`
// und haengen nicht mehr am Blattmasstab; die Kopplungsmutter bleibt messbar laenger.
{
  const E = SPANN_EINHEIT.blatt;
  const rnd = v => Math.round(v * 1000) / 1000;
  const hM = rnd(SPANN_MM.mutter_h * E), hK = rnd(SPANN_MM.kupplung_h * E);
  const hKopf = rnd(SPANN_MM.kopf_h * E);
  // Erwartete Stellen aus dem realen Wandelement: je innerem Stoss eine Kopplungsmutter,
  // je Fussanschluss eine AUFLIEGENDE Kopplungsmutter samt Schraube ([A-19]/#97), je
  // oberem Mutteranschluss eine kurze Spannmutter.
  let stoesse = 0, fuesse = 0, koepfe = 0, platten = 0;
  for (const col of W.tension_columns)
    for (const sg of col.segments) {
      stoesse += Math.max(0, stangenStuecke(W, sg).length - 1);
      const au = sg.anker_unten || (sg.z0_mm === 0 ? "bodenblech" : "spannplatte");
      const ao = sg.anker_oben || (sg.z1_mm === W.height_mm ? "blech" : "spannplatte");
      if (au === "bodenblech") fuesse++; else platten++;
      if (ao !== "spannplatte") koepfe++; else platten++;
    }
  ok("[#106] alle Kopplungsmuttern stehen im VORDERGRUND, als eigene Gruppe",
    /<g class="kop">/.test(svg)
    && svg.indexOf('<g class="kop">') > svg.indexOf('<g class="zsp">'));
  const kop = /<g class="kop">([\s\S]*?)<\/g>/.exec(svg);
  const kopH = kop ? [...kop[1].matchAll(RE_MUTTER)].map(m => +m[1]) : [];
  ok("[#106] die Vordergrundgruppe traegt genau die Kopplungen und die Fussanschluesse",
    stoesse > 0 && fuesse > 0 && kopH.length === stoesse + fuesse
    && kopH.every(h => Math.abs(h - hK) < 1e-9));
  ok("[#110] die Kopplungsmutter ist im Blatt messbar laenger als die normale Mutter",
    hK > hM && Math.abs(hK / hM - 2.5) < 1e-6);
  // #97: die Schraube am Fuss — Kopf und Schaft, je Fussanschluss einmal.
  const alleH = mutterHoehen(svg);
  ok("[#97] je Fussanschluss steht eine Schraube mit Kopf im Blatt",
    alleH.filter(h => Math.abs(h - hKopf) < 1e-9).length === fuesse);
  // Kurze Muttern im Blatt: je Kopfblech-Anschluss eine Spannmutter, je Einlegeblech eine
  // Mutter ([A-16]) — und seit #97 je SPANNPLATTE eine Spannmutter, oben wie unten. Der
  // Rechenkern zaehlt genau so (`segSpannmutter` faellt mit `segSpannplatten` zusammen).
  ok("[#97] je Kopfblech, je Einlegeblech UND je Spannplatte genau eine kurze Mutter",
    koepfe > 0 && platten > 0 && alleH.filter(h => Math.abs(h - hM) < 1e-9).length
      === koepfe + platten + wirksameZwischenpunkte(W).length);
  ok("[#97] die Zahl der gezeichneten Spannmuttern deckt sich mit der Stueckliste",
    koepfe + platten === (W.bom && W.bom.spannmuttern));
  ok("[#110] Symbolgeometrie und Kennfarben kommen geteilt aus sembla-montage.js",
    Z.FARBE.mutter === SPANN_FARBE.mutter && Z.FARBE.platte === SPANN_FARBE.platte
    && svg.includes(mutterSvg(0, 0, E, { n: v => rnd(v) }).slice(0, 9)));

  // --- #106: das Blatt zeichnet dasselbe Bauteil in JEDEM Masstab gleich gross -----------
  // Das ist der eigentliche Fehler, den #106 behebt: `sc = 1/masstab` und der Masstab kommt
  // aus der Wandgroesse — eine kleine Wand bekam damit ein Mehrfaches der Symbolgroesse.
  {
    const klein = Z.zeichnungSvg(buildWall("IW-K1", 2000, 2200, [], null, null), { format: "a3" });
    const gross = Z.zeichnungSvg(buildWall("IW-K2", 9000, 3000, [], null, null), { format: "a3" });
    const h = z => [...z.svg.matchAll(RE_MUTTER)].map(m => +m[1]);
    ok("[#106] verschiedene Wandgroessen fuehren zu verschiedenen Blattmasstaeben",
      klein.masstab !== gross.masstab);
    ok("[#106] dasselbe Bauteil ist auf beiden Blaettern GLEICH GROSS (keine Wandabhaengigkeit)",
      h(klein).length > 0 && h(gross).length > 0
      && new Set([...h(klein), ...h(gross)].map(v => rnd(v))).size
         === new Set(h(klein).map(v => rnd(v))).size
      && Math.max(...h(klein)) === Math.max(...h(gross))
      && Math.min(...h(klein)) === Math.min(...h(gross)));
    // Vollstaendig: die vorkommenden Hoehen sind GENAU die vier festen Symbolmasse. Der
    // Schraubenschaft ist dabei das einzige Mass, das eine Blechdicke mitnimmt (er reicht von
    // der Mutternmitte bis an die Blechunterkante) — auch die ist ein Zeichenmass des Blattes.
    const schaft = z => rnd(SPANN_MM.kupplung_h / 2 + Math.max(1.2, 15 / z.masstab));
    const soll = z => new Set([hKopf, hM, schaft(z), hK].map(v => rnd(v)));
    ok("[#106] die Symbolhoehen sind genau die festen Papier-mm aus SPANN_MM",
      [klein, gross].every(z => {
        const ist = new Set(h(z).map(v => rnd(v)));
        return ist.size === soll(z).size && [...ist].every(v => soll(z).has(v)); }));
  }

  // Die Spannplatte ist ein langgezogenes flaches Rechteck: an einer Wand mit Spannplatte
  // oben steht sie im Blatt mit der Bauteilbreite (110 mm) und der festen Dicke, und sie
  // LIEGT AUF der Kante — nicht in der Wand (#106).
  const zSp = Z.zeichnungSvg(WSP, {}), svgSp = zSp.svg, mSp = zSp.masstab;
  const re = new RegExp(`<rect x="[-\\d.]+" y="[-\\d.]+" width="([-\\d.]+)" `
    + `height="([-\\d.]+)" fill="${Z.FARBE.platte}"/>`);
  const mm = re.exec(svgSp);
  ok("[#106] die Spannplatte ist ein langgezogenes, flaches Rechteck (Bauteilbreite 110 mm)",
    !!mm && Math.abs(+mm[1] - rnd(SPANN_MM.platte_b_mm / mSp)) < 1e-3
    && Math.abs(+mm[2] - rnd(SPANN_MM.platte_h * E)) < 1e-3 && +mm[1] > 4 * +mm[2]);
  ok("[#106] die obere Spannplatte liegt AUF der Wandoberkante, nicht in der Wand", (() => {
    // Der Plattenrahmen muss vollstaendig OBERHALB der Oberkante liegen. Die Oberkante ist
    // die kleinste y-Koordinate der Wandkontur; in SVG ist "oberhalb" das kleinere y.
    const alle = [...svgSp.matchAll(new RegExp(`<rect x="[-\\d.]+" y="([-\\d.]+)" `
      + `width="[-\\d.]+" height="([-\\d.]+)" fill="${Z.FARBE.platte}"/>`, "g"))]
      .map(m => ({ y: +m[1], h: +m[2] }));
    const kontur = /<polyline points="([^"]+)"/.exec(svgSp)[1].split(" ")
      .map(q => +q.split(",")[1]);
    const oben = Math.min(...kontur);
    return alle.length > 0 && alle.some(r => Math.abs((r.y + r.h) - oben) < 1e-3)
      && alle.every(r => r.y + r.h <= oben + 1e-3);
  })());

  // --- #97: die Platte wird mit ihrer REALEN Katalogdicke gezeichnet ----------------------
  // Gebaut wird ueber den echten Core-Pfad; die Dicke kommt allein aus dem Wandelement
  // (`prestress.rod_kopf_zuschlag_mm`, #92) und wird hier nur gezeichnet. Geprueft wird am
  // REALEN Blatt-SVG, nicht am Zeichenbaustein.
  const zSp8 = Z.zeichnungSvg(WSP8, {}), svgSp8 = zSp8.svg, mSp8 = zSp8.masstab;
  const plattenVon = t => [...t.matchAll(new RegExp(`<rect x="[-\\d.]+" y="([-\\d.]+)" `
    + `width="([-\\d.]+)" height="([-\\d.]+)" fill="${Z.FARBE.platte}"/>`, "g"))]
    .map(m => ({ y: +m[1], b: +m[2], h: +m[3] }));
  ok("[#97] das Wandelement fuehrt die Plattendicke als Katalogmass",
    WSP8.prestress.rod_kopf_zuschlag_mm === 8
    && WSP.prestress.rod_kopf_zuschlag_mm === undefined);
  ok("[#97] im Blatt ist die Plattenhoehe 8 mm mal Blattmasstab", (() => {
    const p8 = plattenVon(svgSp8);
    return p8.length > 0 && p8.every(r => Math.abs(r.h - rnd(8 / mSp8)) < 1e-3);
  })());
  ok("[#97] die Spannmutter sitzt im Blatt unmittelbar auf der Plattenoberkante", (() => {
    const p8 = plattenVon(svgSp8);
    const mu = [...svgSp8.matchAll(new RegExp(`<rect x="[-\\d.]+" y="([-\\d.]+)" `
      + `width="[-\\d.]+" height="([-\\d.]+)" fill="${Z.FARBE.mutter}"/>`, "g"))]
      .map(m => ({ y: +m[1], h: +m[2] }));
    return p8.length > 0 && p8.every(r =>
      mu.some(m => Math.abs((m.y + m.h) - r.y) < 1e-3 && Math.abs(m.h - rnd(hM)) < 1e-3));
  })());
  ok("[#97] die Platte liegt auch mit realer Dicke AUF der Wandoberkante", (() => {
    const kontur = /<polyline points="([^"]+)"/.exec(svgSp8)[1].split(" ")
      .map(q => +q.split(",")[1]);
    const oben = Math.min(...kontur);
    return plattenVon(svgSp8).every(r => r.y + r.h <= oben + 1e-3);
  })());
  ok("[#97] Breite, Farben und Plattenzahl bleiben gegenueber dem Symbolstand unveraendert",
    plattenVon(svgSp8).length === plattenVon(svgSp).length
    && plattenVon(svgSp8).every(r => Math.abs(r.b - rnd(SPANN_MM.platte_b_mm / mSp8)) < 1e-3));
  // Ohne bekanntes Mass wird NICHTS erfunden — das Blatt von WSP bleibt der Altstand.
  ok("[#97] ohne Katalogmass bleibt das Blatt beim festen Symbolmass",
    plattenVon(svgSp).every(r => Math.abs(r.h - rnd(SPANN_MM.platte_h * E)) < 1e-3)
    && mSp === mSp8 && plattenVon(svgSp8)[0].h !== plattenVon(svgSp)[0].h);
  // [D-4]/#97 Muss: Modul 1 und Modul 7 messen dieselbe Plattendicke. Das Blatt rechnet in
  // Papier-mm (`1/masstab`), die Wandansicht in ihren viewBox-Einheiten — verglichen wird
  // deshalb das ZURUECKGERECHNETE Bauteilmass in mm, und das muss beidseits 8 mm sein.
  ok("[#97] Modul 1 und Modul 7 zeigen dieselbe masstaebliche Dicke", (() => {
    const scM1 = (1000 - 2 * 46) / WSP8.length_mm;
    const m1 = Z_spannplatteSvg(0, 0, SPANN_EINHEIT.ansicht, scM1,
      { dicke_mm: WSP8.prestress.rod_kopf_zuschlag_mm });
    const hM1 = +/height="([-\d.]+)"/.exec(m1)[1] / scM1;
    const hM7 = plattenVon(svgSp8)[0].h * mSp8;
    return Math.abs(hM1 - 8) < 1e-9 && Math.abs(hM7 - 8) < 1e-2;
  })());
}

// --- #97: die Kopplungsmutter wird mit ihrer REALEN Einbauhoehe gezeichnet -----------------
// Gebaut wird ueber den echten Core-Pfad; die Hoehe ist das DOPPELTE des Fussoffsets aus #92
// ([A-19]) und wird hier nur gezeichnet. Geprueft wird am REALEN Blatt-SVG.
{
  const E = SPANN_EINHEIT.blatt;
  const rnd = v => Math.round(v * 1000) / 1000;
  const zK30 = Z.zeichnungSvg(WKU30, {}), zK45 = Z.zeichnungSvg(WKU45, {});
  // Dieselbe Wand OHNE das Mass — identische Geometrie, identischer Masstab, identische
  // Stueckelung; der EINZIGE Unterschied ist die Zeichenvorgabe der Mutter. Genau daran laesst
  // sich zeigen, dass die Aenderung eine reine Zeichenaenderung ist.
  const WKUo = { ...WKU30, prestress: { ...WKU30.prestress } };
  delete WKUo.prestress.rod_fuss_offset_mm;
  const zKo = Z.zeichnungSvg(WKUo, {});
  const kopGruppe = t => { const m = /<g class="kop">([\s\S]*?)<\/g>/.exec(t);
    return m ? [...m[1].matchAll(RE_MUTTER)].map(q => +q[1]) : []; };

  ok("[#97] das Wandelement fuehrt die halbe Mutternhoehe als Fussoffset (kein neues Feld)",
    WKU30.prestress.rod_fuss_offset_mm === 15 && WKU45.prestress.rod_fuss_offset_mm === 22.5
    && WSP.prestress.rod_fuss_offset_mm === undefined
    && !("rod_kupplung_hoehe_mm" in WKU30.prestress));
  ok("[#97] im Blatt ist die Mutternhoehe 30 mm mal Blattmasstab", (() => {
    const h = kopGruppe(zK30.svg);
    return h.length > 0 && h.every(v => Math.abs(v - rnd(30 / zK30.masstab)) < 1e-3); })());
  ok("[#97] zwei Katalogprodukte ergeben im Blatt sichtbar verschieden hohe Muttern", (() => {
    const a = kopGruppe(zK30.svg), b = kopGruppe(zK45.svg);
    return a.length > 0 && a.length === b.length && zK30.masstab === zK45.masstab
      && b.every(v => Math.abs(v - rnd(45 / zK45.masstab)) < 1e-3) && b[0] > a[0]; })());
  ok("[#97] ohne Hoehenmass bleibt das Blatt beim festen Symbolmass", (() => {
    const h = kopGruppe(zKo.svg);
    return h.length > 0 && h.every(v => Math.abs(v - rnd(SPANN_MM.kupplung_h * E)) < 1e-3)
      && h[0] !== kopGruppe(zK30.svg)[0]; })());
  ok("[#97] die Fussmutter LIEGT weiterhin auf dem Bodenblech, der Stoss bleibt zentriert",
    (() => {
      const fuss = WKU30.tension_columns.flatMap(c => c.segments)
        .filter(g => (g.anker_unten || (g.z0_mm === 0 ? "bodenblech" : "spannplatte"))
          === "bodenblech").length;
      // Die Fussmuttern sitzen genau auf der Steinunterkante (z = 0): Unterkante = Y(0), das
      // ist die groesste y-Koordinate der Wandkontur.
      const kontur = /<polyline points="([^"]+)"/.exec(zK30.svg)[1].split(" ")
        .map(q => +q.split(",")[1]);
      const unten = Math.max(...kontur);
      const kop = /<g class="kop">([\s\S]*?)<\/g>/.exec(zK30.svg);
      const rects = [...kop[1].matchAll(new RegExp(`<rect x="[-\\d.]+" y="([-\\d.]+)" `
        + `width="[-\\d.]+" height="([-\\d.]+)" fill="${Z.FARBE.mutter}"/>`, "g"))]
        .map(m => ({ y: +m[1], h: +m[2] }));
      const auf = rects.filter(r => Math.abs((r.y + r.h) - unten) < 1e-3);
      return fuss > 0 && auf.length === fuss && auf.every(r => r.y < unten); })());
  // RUECKFALL-Gegenprobe: WKU30 fuehrt KEINE Schluesselweite, der Durchmesser bleibt deshalb
  // das Symbolmass. Die masstabsgetreue Breite steht im eigenen Block darunter.
  ok("[#97] ohne Schluesselweite bleibt der Durchmesser das feste Symbolmass", (() => {
    const kop = /<g class="kop">([\s\S]*?)<\/g>/.exec(zK30.svg)[1];
    const b = [...kop.matchAll(/width="([-\d.]+)"/g)].map(m => +m[1]);
    return b.length > 0 && b.every(v => Math.abs(v - rnd(SPANN_MM.d * E)) < 1e-3); })());
  // Der eigentliche Nachweis, dass NUR gezeichnet wurde: alles ausser den mutterfarbenen
  // Rechtecken (Kopplungsmuttern, Schraube, Spannmuttern) ist zwischen "mit Mass" und "ohne
  // Mass" BYTEGLEICH — Steine, Bleche, Stangenstuecke, Bemassung und Masstab inbegriffen.
  ok("[#97] Stangenzuschnitt, Bleche, Bemassung und Masstab bleiben wertgleich", (() => {
    const strip = t => t.replace(new RegExp(`<rect[^>]*fill="${Z.FARBE.mutter}"/>`, "g"), "")
      .replace(/<g class="kop">[\s\S]*?<\/g>/, "");
    return zK30.masstab === zKo.masstab && strip(zK30.svg) === strip(zKo.svg)
      && strip(zK30.svg).length > 0; })());
  ok("[#97] auch die Stueckliste des Blattes bleibt wertgleich",
    JSON.stringify(semblaBomItems(WKU30)) === JSON.stringify(semblaBomItems(WKUo))
    && JSON.stringify(WKU30.tension_columns.flatMap(c => c.segments)
        .map(g => stangenStuecke(WKU30, g)))
      === JSON.stringify(WKUo.tension_columns.flatMap(c => c.segments)
        .map(g => stangenStuecke(WKUo, g))));
  // [D-4]/#97 Muss: Modul 1 und Modul 7 messen dieselbe Mutternhoehe. Das Blatt rechnet in
  // Papier-mm (`1/masstab`), die Wandansicht in ihren viewBox-Einheiten — verglichen wird das
  // ZURUECKGERECHNETE Bauteilmass in mm, und das muss beidseits 30 mm sein.
  ok("[#97] Modul 1 und Modul 7 zeigen dieselbe masstaebliche Mutternhoehe", (() => {
    const scM1 = 60 / 200;   // Modul 1: fester Ansichtsmasstab, viewBox-Einheiten je mm
    const m1 = Z_kopplungsmutterSvg(0, 0, SPANN_EINHEIT.ansicht,
      { hoehe_mm: 2 * WKU30.prestress.rod_fuss_offset_mm, sc: scM1 });
    const hM1 = +/height="([-\d.]+)"/.exec(m1)[1] / scM1;
    const hM7 = kopGruppe(zK30.svg)[0] * zK30.masstab;
    return Math.abs(hM1 - 30) < 1e-9 && Math.abs(hM7 - 30) < 1e-2; })());
}

// --- #97: die Kopplungsmutter wird mit ihrer REALEN Schluesselweite gezeichnet -------------
// Gebaut wird ueber den echten Core-Pfad; die Breite ist `kupplung_sw_mm` aus dem Wandelement
// und wird hier nur gezeichnet. Geprueft wird am REALEN Blatt-SVG — Vorschau, Druck-HTML und
// SVG-Datei tragen dieselbe Zeichenkette, weil sie alle aus `zeichnungSvg()` stammen ([D-6]).
{
  const E = SPANN_EINHEIT.blatt;
  const rnd = v => Math.round(v * 1000) / 1000;
  const z17 = Z.zeichnungSvg(WSW17, {}), z24 = Z.zeichnungSvg(WSW24, {});
  // Dieselbe Wand OHNE das Mass — identische Geometrie, identischer Masstab, identische
  // Stueckelung; der EINZIGE Unterschied ist die Zeichenvorgabe der Mutterbreite.
  const WSWo = { ...WSW17, prestress: { ...WSW17.prestress } };
  delete WSWo.prestress.kupplung_sw_mm;
  const zo = Z.zeichnungSvg(WSWo, {});
  const kopBreiten = t => { const m = /<g class="kop">([\s\S]*?)<\/g>/.exec(t);
    return m ? [...m[1].matchAll(/width="([-\d.]+)"/g)].map(q => +q[1]) : []; };
  const kopHoehen = t => { const m = /<g class="kop">([\s\S]*?)<\/g>/.exec(t);
    return m ? [...m[1].matchAll(RE_MUTTER)].map(q => +q[1]) : []; };
  // Waagerechte weisse Linien = die Haarlinien am Stangenstoss (#112); die senkrechte
  // Blechstossmarke aus #91 wird an der Geometrie ausgeschlossen, nicht an der Farbe.
  const haarB = t => [...t.matchAll(
    /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#fff"/g)]
    .filter(m => +m[2] === +m[4]).map(m => +m[3] - +m[1]);

  ok("[#97] das Wandelement fuehrt die Schluesselweite (kein neues Feld, nur gelesen)",
    WSW17.prestress.kupplung_sw_mm === 17 && WSW24.prestress.kupplung_sw_mm === 24
    && WKU30.prestress.kupplung_sw_mm === undefined);
  ok("[#97] im Blatt ist die Mutternbreite 17 mm mal Blattmasstab", (() => {
    const b = kopBreiten(z17.svg);
    return b.length > 0 && b.every(v => Math.abs(v - rnd(17 / z17.masstab)) < 1e-3); })());
  ok("[#97] zwei Schluesselweiten ergeben im Blatt verschieden breite Muttern", (() => {
    const a = kopBreiten(z17.svg), b = kopBreiten(z24.svg);
    return a.length > 0 && a.length === b.length && z17.masstab === z24.masstab
      && b.every(v => Math.abs(v - rnd(24 / z24.masstab)) < 1e-3) && b[0] > a[0]; })());
  ok("[#97] die gezeichnete HOEHE aendert sich dabei nicht", (() => {
    const a = kopHoehen(z17.svg), b = kopHoehen(z24.svg);
    return a.length > 0 && a.length === b.length
      && a.every((v, i) => Math.abs(v - b[i]) < 1e-9); })());
  // Bit-Gleichheit ueber den ECHTEN Core-Pfad: dieselbe Wand, nie mit Schluesselweite gebaut,
  // ergibt zeichenweise dasselbe Blatt wie die Wand, der das Feld entnommen wurde.
  ok("[#97] ohne Schluesselweite ist das Blatt BIT-GLEICH zum Stand davor", (() => {
    const WNie = buildWall("IW-09", 3000, 2600, [], null, { rod_fuss_offset_mm: 15 });
    const zNie = Z.zeichnungSvg(WNie, {});
    return zo.svg === zNie.svg && zo.svg !== z17.svg && zo.masstab === z17.masstab
      && kopBreiten(zo.svg).length > 0
      && kopBreiten(zo.svg).every(v => Math.abs(v - rnd(SPANN_MM.d * E)) < 1e-3); })());
  // Der eigentliche Nachweis, dass NUR gezeichnet wurde: alles ausser den mutterfarbenen
  // Rechtecken und den Haarlinien ist zwischen "mit Mass" und "ohne Mass" BYTEGLEICH.
  ok("[#97] Stangenzuschnitt, Bleche, Bemassung und Masstab bleiben wertgleich", (() => {
    const strip = t => t.replace(new RegExp(`<rect[^>]*fill="${Z.FARBE.mutter}"/>`, "g"), "")
      .replace(/<g class="kop">[\s\S]*?<\/g>/, "")
      .replace(/<line [^>]*stroke="#fff"[^>]*\/>/g, "");
    return z17.masstab === zo.masstab && strip(z17.svg) === strip(zo.svg)
      && strip(z17.svg).length > 0; })());
  // [#112] Die Haarlinie folgt dem WIRKSAMEN Durchmesser und bleibt in allen drei Faellen
  // breiter als die Mutter, die sie markiert — auch bei einer schmalen Mutter.
  ok("[#112] die Haarlinie ist auch mit Schluesselweite breiter als die Mutter", (() => {
    const paare = [[z17, 17], [z24, 24], [zo, null]];
    return paare.every(([z, sw]) => {
      const hb = haarB(z.svg), kb = kopBreiten(z.svg);
      const soll = sw == null ? SPANN_MM.d * E : sw / z.masstab;
      return hb.length > 0 && kb.length > 0
        && hb.every(v => Math.abs(v - rnd(soll * 1.5)) < 1e-3)
        && hb.every(v => v > Math.max(...kb) - 1e-9); }); })());
  // [D-4]/#97 Muss: Modul 1 und Modul 7 messen dieselbe Schluesselweite. Verglichen wird das
  // ZURUECKGERECHNETE Bauteilmass in mm, und das muss beidseits 17 mm sein.
  ok("[#97] Modul 1 und Modul 7 zeigen dieselbe masstaebliche Mutternbreite", (() => {
    const scM1 = 60 / 200;   // Modul 1: fester Ansichtsmasstab, viewBox-Einheiten je mm
    const m1 = Z_kopplungsmutterSvg(0, 0, SPANN_EINHEIT.ansicht,
      { sw_mm: WSW17.prestress.kupplung_sw_mm, sc: scM1 });
    const bM1 = +/width="([-\d.]+)"/.exec(m1)[1] / scM1;
    const bM7 = kopBreiten(z17.svg)[0] * z17.masstab;
    return Math.abs(bM1 - 17) < 1e-9 && Math.abs(bM7 - 17) < 1e-2; })());
  // Das Blatt darf die Breite nicht selbst nachrechnen — sie kommt aus der EINEN Funktion.
  ok("[#97] das Blatt zeichnet genau `kupplungDurchmesser()`", (() => {
    const b = kopBreiten(z17.svg)[0];
    return Math.abs(b - rnd(kupplungDurchmesser(E, { sw_mm: 17, sc: 1 / z17.masstab })))
      < 1e-3; })());
}

// --- #97: die SPANNMUTTER wird mit ihrer REALEN Hoehe und Schluesselweite gezeichnet -------
// Gebaut wird ueber den echten Core-Pfad; beide Masse kommen allein aus dem Wandelement
// (`prestress.spannmutter_h_mm`/`spannmutter_sw_mm`) und werden hier nur gezeichnet. Geprueft
// wird am REALEN Blatt-SVG — Vorschau, Druck-HTML und die eigenstaendige SVG-Datei tragen
// dieselbe Zeichenkette, weil sie alle aus `zeichnungSvg()` stammen ([D-6]).
{
  const E = SPANN_EINHEIT.blatt;
  const rnd = v => Math.round(v * 1000) / 1000;
  const zSm = Z.zeichnungSvg(WSM, {}), zSmG = Z.zeichnungSvg(WSMG, {});
  // Dieselbe Wand OHNE die beiden Masse, ueber den echten Core-Pfad nie damit gebaut.
  const WSMo = buildWall("IW-11", 3000, 2600, [], null,
    { top_connection: "spannplatte", rod_kopf_zuschlag_mm: 8 });
  const zSmo = Z.zeichnungSvg(WSMo, {});
  const platten = t => [...t.matchAll(new RegExp(`<rect x="[-\\d.]+" y="([-\\d.]+)" `
    + `width="[-\\d.]+" height="([-\\d.]+)" fill="${Z.FARBE.platte}"/>`, "g"))]
    .map(m => ({ y: +m[1], h: +m[2] }));
  // Spannmuttern: mutterfarbene Rechtecke, die mit ihrer UNTERKANTE auf einer
  // Plattenoberkante sitzen — genau die Definition aus [A-3]/#97. Die Auswahl darf nicht
  // einfach "alle mutterfarbenen Rechtecke" sein: die Kopplungsgruppe ist zwar ausgenommen,
  // die Sechskantschraube am Fuss traegt aber dieselbe Kennfarbe ([A-19]).
  const spannMu = t => { const pl = platten(t);
    return [...t.replace(/<g class="kop">[\s\S]*?<\/g>/, "")
      .matchAll(new RegExp(`<rect x="([-\\d.]+)" y="([-\\d.]+)" width="([-\\d.]+)" `
        + `height="([-\\d.]+)" fill="${Z.FARBE.mutter}"/>`, "g"))]
      .map(m => ({ x: +m[1], y: +m[2], b: +m[3], h: +m[4] }))
      .filter(r => pl.some(q => Math.abs((r.y + r.h) - q.y) < 1e-3)); };

  ok("[#97] das Wandelement fuehrt beide Spannmuttermasse (kein neues Feld, nur gelesen)",
    WSM.prestress.spannmutter_h_mm === 10 && WSM.prestress.spannmutter_sw_mm === 17
    && WSMG.prestress.spannmutter_h_mm === 24 && WSMG.prestress.spannmutter_sw_mm === 30
    && WSMo.prestress.spannmutter_h_mm === undefined
    && WSMo.prestress.spannmutter_sw_mm === undefined);
  ok("[#97] im Blatt kommen GENAU diese Masse an (Mass mal Blattmasstab)", (() => {
    const m = spannMu(zSm.svg);
    return m.length > 0 && m.every(r => Math.abs(r.h - rnd(10 / zSm.masstab)) < 1e-3
      && Math.abs(r.b - rnd(17 / zSm.masstab)) < 1e-3); })());
  ok("[#97] ein deutlich groesseres Produkt zeichnet eine hoehere UND breitere Mutter", (() => {
    const a = spannMu(zSm.svg), b = spannMu(zSmG.svg);
    return a.length > 0 && a.length === b.length && zSm.masstab === zSmG.masstab
      && b.every(r => Math.abs(r.h - rnd(24 / zSmG.masstab)) < 1e-3
        && Math.abs(r.b - rnd(30 / zSmG.masstab)) < 1e-3)
      && b[0].h > a[0].h && b[0].b > a[0].b; })());
  ok("[#97] sie sitzt auch mit realem Mass unmittelbar auf der Plattenoberkante", (() => {
    // Jede Platte traegt genau eine Spannmutter, und keine davon ragt in die Platte hinein
    // (`y < Plattenoberkante`). Ohne die Aufsitzlage waere die Auswahl oben leer — geprueft
    // wird deshalb zusaetzlich, dass ueberhaupt so viele gefunden werden wie Platten da sind.
    const pl = platten(zSmG.svg), mu = spannMu(zSmG.svg);
    return pl.length > 0 && mu.length === pl.length
      && pl.every(r => mu.some(m => Math.abs((m.y + m.h) - r.y) < 1e-3 && m.y < r.y)); })());
  ok("[#97] ohne die Masse ist das Blatt BIT-GLEICH zum Symbolstand", (() => {
    const m = spannMu(zSmo.svg);
    return zSmo.svg !== zSm.svg && zSmo.masstab === zSm.masstab && m.length > 0
      && m.every(r => Math.abs(r.h - rnd(SPANN_MM.mutter_h * E)) < 1e-3
        && Math.abs(r.b - rnd(SPANN_MM.d * E)) < 1e-3); })());
  // Der eigentliche Nachweis, dass NUR gezeichnet wurde: alles ausser den mutterfarbenen
  // Rechtecken ist zwischen "mit Mass" und "ohne Mass" BYTEGLEICH — Stangenzuschnitt, Platten,
  // Bleche, Bemassung, Tabellen, Schriftfeld und Masstab.
  ok("[#97] Zuschnitt, Platten, Mengen, Bemassung und Masstab bleiben wertgleich", (() => {
    const strip = t => t.replace(new RegExp(`<rect[^>]*fill="${Z.FARBE.mutter}"/>`, "g"), "");
    return zSm.masstab === zSmo.masstab && strip(zSm.svg) === strip(zSmo.svg)
      && strip(zSmG.svg) === strip(zSmo.svg) && strip(zSm.svg).length > 0; })());
  // [D-4]/#97 Muss: Modul 1 und Modul 7 zeigen fuer DIESELBE Wand dieselbe Groesse. Verglichen
  // wird das ZURUECKGERECHNETE Bauteilmass in mm — beidseits 24 mm hoch und 30 mm breit.
  ok("[#97] Modul 1 und Modul 7 zeigen dieselbe masstaebliche Spannmuttergroesse", (() => {
    const scM1 = 60 / 200;   // Modul 1: fester Ansichtsmasstab, viewBox-Einheiten je mm
    const m1 = Z_spannplatteSvg(0, 0, SPANN_EINHEIT.ansicht, scM1,
      { dicke_mm: WSMG.prestress.rod_kopf_zuschlag_mm,
        mutter_h_mm: WSMG.prestress.spannmutter_h_mm,
        mutter_sw_mm: WSMG.prestress.spannmutter_sw_mm });
    const r = [...m1.matchAll(/width="([-\d.]+)" height="([-\d.]+)"/g)].map(q =>
      ({ b: +q[1], h: +q[2] }));
    const m7 = spannMu(zSmG.svg)[0];
    return r.length === 2 && Math.abs(r[1].h / scM1 - 24) < 1e-9
      && Math.abs(r[1].b / scM1 - 30) < 1e-9
      && Math.abs(m7.h * zSmG.masstab - 24) < 1e-2
      && Math.abs(m7.b * zSmG.masstab - 30) < 1e-2; })());
  // [D-6]: eine Zeichenableitung — dieselbe Zeichenkette in Vorschau, Druck und SVG-Datei.
  // Der Exportweg rechnet mit `optionenAusEingaben`; seine Marke wird deshalb aus genau diesen
  // Optionen gebildet, wie beim Deckenanschluss-Nachweis weiter unten.
  const marke = (z) => { const mu = spannMu(z.svg);
    return mu.length ? `<rect x="${mu[0].x}" y="${mu[0].y}" width="${mu[0].b}" `
      + `height="${mu[0].h}" fill="${Z.FARBE.mutter}"/>` : null; };
  ok("[#97]/[D-6] Vorschau, Druck-HTML und SVG-Datei tragen dieselbe Spannmutter", (() => {
    const a3 = marke(Z.zeichnungSvg(WSMG, Z.normOptionen({ format: "a3" })));
    const ex = marke(Z.zeichnungSvg(WSMG, Z.optionenAusEingaben(eingaben)));
    return !!a3 && !!ex
      && Z.zeichnungDokument(WSMG, eingaben, { format: "a3" }).includes(a3)
      && Z.zeichnungSvgDatei(WSMG, eingaben, { format: "a3" }).includes(a3)
      && zeichnungHtml(WSMG, eingaben).includes(ex)
      && zeichnungSvgText(WSMG, eingaben).includes(ex); })());
  // Der Katalog wird in Modul 7 nie angefasst ([D-1]/N2): das Blatt kennt nur das Wandelement.
  ok("[#97] Modul 7 importiert dafuer nichts aus dem Katalog",
    !/sembla-katalog/.test(readFileSync("docs/shared/sembla-zeichnung.js", "utf8")));
}

// #110: das Einlegeblech des Zwischenspannpunkts steht jetzt AUCH im Blatt — dieselbe
// Symbolform wie in Modul 1, aus derselben Quelle, mit genau einer Mutter obenauf ([A-16]).
{
  const zp = wirksameZwischenpunkte(W);
  const grp = /<g class="zsp">([\s\S]*?)<\/g>/.exec(svg);
  ok("[#110] Zwischenspannpunkte werden als eigene Gruppe gezeichnet",
    zp.length > 0 && !!grp);
  const profile = grp ? (grp[1].match(/<polyline /g) || []).length : 0;
  const muttern = grp ? (grp[1].match(/<rect /g) || []).length : 0;
  ok("[#110] je wirksamem Punkt genau ein C-Profil und genau eine Mutter",
    profile === zp.length && muttern === zp.length);
  ok("[#110] das C-Profil ist nach unten geoeffnet und nicht gefuellt",
    grp && /fill="none"/.test(grp[1]) && (() => {
      const pts = /points="([^"]+)"/.exec(grp[1])[1].split(" ").map(t => t.split(",").map(Number));
      return pts.length === 4 && pts[1][1] === pts[2][1]
        && pts[0][1] > pts[1][1] && pts[3][1] > pts[2][1]; })());
  ok("[#110] es traegt die Kennfarbe des Einlegeblechs, keine neue Farbe",
    grp && grp[1].includes(ZWISCHENPUNKT.farbe));
  // Die Gruppe liegt VOR Bemassung und Brandschutz: sie verdeckt kein Ausfuehrungsmass,
  // und die Brandschutzgruppe bleibt die letzte des Blattes ([D-4]/#79).
  //
  // UMGEKEHRT MIT #112: bis dahin verlangte diese Stelle ausdruecklich, dass das Einlegeblech
  // NACH den Straengen steht. Genau das war der gemeldete Fehler — das C-Profil legte sich
  // ueber die durchlaufende Gewindestange. Die Stange ist das Bauteil, an dem die Vorspannung
  // abgelesen wird, und liegt seither im Vordergrund; das Einlegeblech steht deshalb jetzt
  // DAVOR. Die uebrige Aussage von #110 bleibt: die Gruppe verdeckt kein Ausfuehrungsmass.
  ok("[#112] die Einlegeblech-Gruppe steht VOR den Straengen und vor Bemassung/Brandschutz",
    svg.indexOf('<g class="zsp">') < svg.indexOf('<g class="stg">')
    && svg.indexOf('<g class="zsp">') > svg.indexOf('<g class="dcs">')
    && svg.indexOf('<g class="zsp">') < svg.indexOf('<g class="brand"'));
  // #106: der Vordergrund der Kopplungsmuttern kommt danach, bleibt aber vor Bemassung und
  // Brandschutzgruppe — er verdeckt kein Ausfuehrungsmass.
  ok("[#106] der Kopplungs-Vordergrund liegt vor Bemassung und Brandschutzgruppe",
    svg.indexOf('<g class="kop">') < svg.indexOf('<g class="brand"'));
  ok("[#110] die Legende benennt das Einlegeblech in Worten",
    Z.legendeHtml(W).includes(ZWISCHENPUNKT.label)
    && !Z.legendeHtml(W).includes('class="dot" style="background:' + Z.FARBE.mutter));
}

// [P-24]/[D-10]/#95/#97: der Deckenanschluss steht als rotes Z im Blatt — dieselbe Symbolform
// wie in Modul 1, aus derselben Quelle, je Anschlusspunkt des Rechenkerns genau einmal.
{
  const dc = W.deckenanschlusspunkte || [];
  const grp = /<g class="dcs">([\s\S]*?)<\/g>/.exec(svg);
  ok("[#95] Deckenanschlusspunkte werden als eigene Gruppe gezeichnet",
    dc.length > 0 && !!grp);
  ok("[#95] je Anschlusspunkt genau ein Symbol, und keine Achse wird erfunden",
    grp && (grp[1].match(/<polyline /g) || []).length === dc.length
    && dc.every(p => (W.tension_columns || []).some(c => c.k === p.k)));
  ok("[#95] das Z ist offen, oberer Schenkel links, unterer rechts", (() => {
    if (!grp) return false;
    const pts = /points="([^"]+)"/.exec(grp[1])[1].split(" ").map(t => t.split(",").map(Number));
    // SVG-y waechst nach unten: der obere Schenkel liegt LINKS und HOEHER, der untere RECHTS.
    return /fill="none"/.test(grp[1]) && pts.length === 4
      && pts[0][1] === pts[1][1] && pts[2][1] === pts[3][1] && pts[0][1] < pts[2][1]
      && pts[0][0] < pts[1][0] && pts[1][0] === pts[2][0] && pts[2][0] < pts[3][0]; })());
  ok("[#95] es traegt die Kennfarbe des Deckenanschlusses, keine neue Farbe",
    grp && grp[1].includes(DECKENANSCHLUSS.farbe));
  // [D-9]: die Zeichenmasse sind die FESTEN Symbolmasse in Papier-mm — nicht aus der Wandgroesse
  // oder dem Blattmasstab gerechnet. Geprueft an der gezeichneten Geometrie selbst.
  ok("[D-9] Schenkellaenge, Hoehe und Strichstaerke sind die festen Symbolmasse", (() => {
    if (!grp) return false;
    const e = SPANN_EINHEIT.blatt;
    const pts = /points="([^"]+)"/.exec(grp[1])[1].split(" ").map(t => t.split(",").map(Number));
    const sw = +/stroke-width="([-\d.]+)"/.exec(grp[1])[1];
    return Math.abs((pts[1][0] - pts[0][0]) - SPANN_MM.dc_schenkel * e) < 1e-6
      && Math.abs((pts[3][0] - pts[2][0]) - SPANN_MM.dc_schenkel * e) < 1e-6
      && Math.abs((pts[2][1] - pts[1][1]) - SPANN_MM.dc_h * e) < 1e-6
      && Math.abs(sw - SPANN_MM.strich * e) < 1e-6; })());
  // Die Gruppe steht VOR den Straengen: Gewindestange, Spannplatte und Kopplungsmutter liegen
  // damit im Vordergrund (#112) und werden vom Symbol nicht verdeckt.
  ok("[#112] die Gruppe steht vor den Straengen — die Gewindestange bleibt im Vordergrund",
    svg.indexOf('<g class="dcs">') < svg.indexOf(`stroke="${Z.FARBE.stange}"`)
    && svg.indexOf('<g class="dcs">') < svg.indexOf('<g class="kop">'));
  ok("[#95] die Legende benennt den Deckenanschluss in Worten",
    Z.legendeHtml(W).includes(DECKENANSCHLUSS.label)
    && !Z.legendeHtml({}).includes(DECKENANSCHLUSS.label));
  ok("[#95] Modul 7 fuehrt fuer das Symbol keine eigene Geometrie und keinen eigenen Hex-Wert",
    (() => {
      const q = readFileSync(new URL("../../docs/shared/sembla-zeichnung.js", import.meta.url), "utf8");
      return /deckenanschlussSvg/.test(q) && !/"#c0392b"/.test(q); })());

  // --- #97: die LAGE des Z am realen Blatt ------------------------------------------------
  // Gemeldet war: der senkrechte Zug lag auf der Gewindestangenachse und wurde von ihr
  // verdeckt, der untere Schenkel lag auf der Wandoberkante und damit unter der Spannplatte.
  // Geprueft wird am erzeugten Blatt-SVG gegen die dort wirklich gezeichneten Bauteile — die
  // Achse kommt aus den STANGENLINIEN, die Plattenoberkante aus der PLATTE bzw. aus der auf der
  // Wandoberkante sitzenden Spannmutter. Nichts davon wird nachgerechnet.
  const E97 = SPANN_EINHEIT.blatt, rnd97 = v => Math.round(v * 1000) / 1000;
  const dcPunkte = t => [...(/<g class="dcs">([\s\S]*?)<\/g>/.exec(t) || ["", ""])[1]
    .matchAll(/<polyline points="([^"]+)"[^>]*stroke-width="([-\d.]+)"/g)]
    .map(m => ({ p: m[1].split(" ").map(q => q.split(",").map(Number)), sw: +m[2] }));
  // Senkrechte Stangenlinien (x1 === x2) — die Achsen, an denen gezeichnet wurde.
  const stangenX = t => [...(/<g class="stg">([\s\S]*?)<\/g>/.exec(t) || ["", ""])[1]
    .matchAll(/<line x1="([-\d.]+)" y1="[-\d.]+" x2="([-\d.]+)"/g)]
    .filter(m => m[1] === m[2]).map(m => +m[1]);
  const rects97 = (t, fill) => [...t.matchAll(new RegExp(`<rect x="([-\\d.]+)" y="([-\\d.]+)" `
    + `width="([-\\d.]+)" height="([-\\d.]+)" fill="${fill}"/>`, "g"))]
    .map(m => ({ x: +m[1], y: +m[2], b: +m[3], h: +m[4] }));
  const achseVon = z => z.p[1][0] + SPANN_MM.dc_versatz * E97;

  ok("[#97] der senkrechte Zug steht LINKS neben der Gewindestangenachse", (() => {
    const zz = dcPunkte(svg), ax = stangenX(svg);
    return zz.length > 0 && zz.every(z => z.p[1][0] === z.p[2][0]
      && ax.some(x => Math.abs(x - achseVon(z)) < 2e-3 && z.p[1][0] < x)); })());
  ok("[#97] der untere Schenkel kreuzt die Achse nach rechts", (() => {
    const zz = dcPunkte(svg);
    return zz.length > 0 && zz.every(z => z.p[2][0] < achseVon(z)
      && z.p[3][0] > achseVon(z)); })());
  // W traegt oben ein KOPFBLECH und damit GAR KEINE Spannplatte: dort gilt derselbe benannte
  // feste Symbolrueckfall wie bei fehlender Dicke — kein Sonderfall, kein erfundenes Mass.
  // Bezugskante ist die Spannmutter, die auf der lokalen Wandoberkante sitzt.
  ok("[#97] mit Kopfblech steht das Symbol an der benannten festen Symbollage", (() => {
    const zz = dcPunkte(svg);
    const mu = rects97(svg, Z.FARBE.mutter)
      .filter(r => Math.abs(r.h - rnd97(SPANN_MM.mutter_h * E97)) < 2e-3);
    return W.prestress.top_connection === "blech" && zz.length > 0 && zz.every(z => {
      const ax = achseVon(z);
      const treffer = mu.filter(r => Math.abs((r.x + r.b / 2) - ax) < 2e-3)
        .sort((a, b) => a.y - b.y)[0];
      const oben = treffer.y + treffer.h;   // Unterkante der Mutter = lokale Wandoberkante
      return Math.abs((z.p[2][1] + z.sw / 2) - (oben - SPANN_MM.platte_h * E97)) < 3e-3; }); })());
  // Mit realer Spannplatte ist der Bezug die PLATTENOBERKANTE: der Schenkel liegt vollstaendig
  // darueber und bleibt im Hoehenband der aufsitzenden Spannmutter.
  const svg97 = Z.zeichnungSvg(WSP8, {}).svg;
  ok("[#97] mit Spannplatte liegt der Schenkel vollstaendig ueber deren Oberkante", (() => {
    const zz = dcPunkte(svg97), pl = rects97(svg97, Z.FARBE.platte);
    return zz.length > 0 && pl.length > 0 && zz.every(z => {
      const ax = achseVon(z);
      const p = pl.filter(r => Math.abs((r.x + r.b / 2) - ax) < 2e-3)
        .sort((a, b) => a.y - b.y)[0];
      return !!p && (z.p[2][1] + z.sw / 2) <= p.y + 2e-3; }); })());
  ok("[#97] und er bleibt unterhalb der Spannmutteroberkante", (() => {
    const zz = dcPunkte(svg97), pl = rects97(svg97, Z.FARBE.platte);
    return zz.length > 0 && zz.every(z => {
      const ax = achseVon(z);
      const p = pl.filter(r => Math.abs((r.x + r.b / 2) - ax) < 2e-3)
        .sort((a, b) => a.y - b.y)[0];
      return !!p && (z.p[2][1] - z.sw / 2)
        >= p.y - SPANN_MM.mutter_h * E97 - 2e-3; }); })());
  // REIHENFOLGE (#97): Platte und Spannmutter zuerst, dann das Symbol, dann die Stange.
  ok("[#97] Reihenfolge im Blatt: Platte/Mutter -> Symbol -> Gewindestange",
    svg97.lastIndexOf(`fill="${Z.FARBE.platte}"`) < svg97.indexOf('<g class="dcs">')
    && svg97.indexOf('<g class="dcs">') < svg97.indexOf('<g class="stg">')
    && svg97.indexOf('<g class="dcs">') < svg97.indexOf('<g class="kop">'));
  // [D-6]: eine Zeichenableitung — Vorschau, Druck-HTML und die eigenstaendige SVG-Datei
  // (auch die des zentralen Exports) tragen dieselbe Zeichenkette.
  ok("[#97]/[D-6] Vorschau, Druck-HTML und SVG-Datei tragen dieselbe Symbolgruppe", (() => {
    const g = /<g class="dcs">[\s\S]*?<\/g>/.exec(svg)[0];
    return Z.zeichnungDokument(W, eingaben, { format: "a3" }).includes(g)
      && Z.zeichnungSvgDatei(W, eingaben, { format: "a3" }).includes(g)
      && zeichnungHtml(W, eingaben).includes(
        /<g class="dcs">[\s\S]*?<\/g>/.exec(Z.zeichnungSvg(W,
          Z.optionenAusEingaben(eingaben)).svg)[0])
      && zeichnungSvgText(W, eingaben).includes(
        /<g class="dcs">[\s\S]*?<\/g>/.exec(Z.zeichnungSvg(W,
          Z.optionenAusEingaben(eingaben)).svg)[0]); })());
}

// --- #112: die Gewindestangen liegen im Vordergrund, jeder Stoss traegt eine Haarlinie ----
// Gemeldet war: Bleche, Einlegebleche und Symbole legten sich ueber die Stangenlinie, und die
// Stueckelung war am Blatt nicht ablesbar, wo zwei Stuecke DERSELBEN Art aneinanderstossen.
// Beides ist reine AUSGABEREIHENFOLGE plus eine zusaetzliche Marke — Stueckgeometrie und
// Stossposition kommen unveraendert aus `stangenStuecke()`.
{
  const grp = /<g class="stg">([\s\S]*?)<\/g>/.exec(svg);
  ok("[#112] die Stangenlinien stehen in einer eigenen Gruppe", !!grp);
  // Die Gruppe kommt NACH allem, was die Stange bisher verdecken konnte: Steine, Kontur,
  // Boden-/Kopfblech, Deckenanschluss-Symbole und Einlegebleche. Seit der Rueckmeldung vom
  // 2026-09-09 gehoert dazu auch der Kopplungsvordergrund (#106) — er stand bis dahin
  // ausdruecklich DAHINTER, s. die naechste Zusicherung. Danach folgen nur noch Bemassung
  // und Brandschutzgruppe (#79).
  ok("[#112] sie steht nach Steinen, Blechen, Deckenanschluss und Einlegeblechen", (() => {
    // Ohne die Brandschutzgruppe gesucht: deren Kennfarbe fuer F0 ist zufaellig dieselbe wie
    // die des Blechs, und sie steht bauartbedingt ZULETZT (#79) — sie ist kein Bauteil.
    const bis = svg.slice(0, svg.indexOf('<g class="brand"'));
    const stg = bis.indexOf('<g class="stg">');
    return stg > bis.lastIndexOf(`fill="${Z.FARBE.stahl}"`)        // Boden- und Kopfblech
      && stg > bis.lastIndexOf(`fill="${Z.FARBE.i3}"`)             // Steine
      && stg > bis.lastIndexOf('<polyline points=')                // Wandkontur
      && stg > bis.indexOf('<g class="dcs">')                      // Deckenanschluss-Symbole
      && stg > bis.indexOf('<g class="zsp">'); })());              // Einlegebleche
  // UMGEDREHT MIT DER RUECKMELDUNG VOM 2026-09-09: bis dahin verlangte diese Stelle
  // ausdruecklich, dass die Stangengruppe VOR den Kopplungsmuttern steht — die Mutter lag
  // damit obenauf. Sie ist aber ein OPAKES Bauteil ueber genau dem Stoss, den die weisse
  // Haarlinie markiert, und verschluckte damit Stangenende und Haarlinie: also genau die
  // beiden Angaben, wegen derer hingesehen wird. Jetzt gilt die umgekehrte Forderung. Die
  // Aussage gegen Bemassung und Brandschutzgruppe bleibt unveraendert.
  ok("[#112] die Kopplungsmuttern stehen DAVOR — Stange und Haarlinie liegen obenauf",
    svg.indexOf('<g class="kop">') < svg.indexOf('<g class="stg">')
    && svg.indexOf('<g class="stg">') < svg.indexOf('<g class="brand"'));
  // Die Mutter bleibt trotzdem als Bauteil erkennbar: sie ist deutlich breiter als die
  // Stangenlinie und schaut beidseits hervor — die Stange laeuft durch sie hindurch, sie
  // verschwindet nicht unter ihr.
  ok("[#112] die Kopplungsmutter ist breiter als die Stange, die davor liegt", (() => {
    const g = /<g class="kop">([\s\S]*?)<\/g>/.exec(svg);
    const br = [...g[1].matchAll(/width="([-\d.]+)"/g)].map(m => +m[1]);
    const sw = [...grp[1].matchAll(/stroke-width="([-\d.]+)"/g)].map(m => +m[1]);
    return br.length > 0 && sw.length > 0 && Math.min(...br) > Math.max(...sw); })());
  // Kein Stangenstrich liegt mehr ausserhalb der Gruppe — sonst waere die Aussage nur
  // teilweise wahr, und genau ein vergessener Strich bliebe verdeckt.
  ok("[#112] ALLE Stangenstriche liegen in der Gruppe, keiner davor oder danach", (() => {
    const ohne = svg.replace(/<g class="stg">[\s\S]*?<\/g>/, "");
    return !new RegExp(`stroke="${Z.FARBE.stange}"`).test(ohne)
      && !new RegExp(`stroke="${Z.FARBE.stange_sonder}"`).test(ohne)
      && !new RegExp(`stroke="${Z.FARBE.stange_rest}"`).test(ohne); })());
  // Die weisse Haarlinie: genau eine je Stoss, gezaehlt gegen die REALEN Stuecke.
  const HAAR = /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#fff" stroke-width="([-\d.]+)"\/>/g;
  // Seit #91 ist auch die Blechstossmarke weiss. Sie ist SENKRECHT, die Haarlinie am
  // Stangenstoss WAAGERECHT — unterschieden wird deshalb an der Geometrie, nicht an der
  // Farbe; eine Klasse am Blatt-SVG waere eine Aenderung an der Zeichnung fuer den Test.
  const haare = svg => [...svg.matchAll(HAAR)]
    .filter(m => +m[2] === +m[4])
    .map(m => ({ x1: +m[1], y: +m[2], x2: +m[3], sw: +m[5] }));
  let stoesseSoll = 0;
  for (const col of W.tension_columns)
    for (const sg of col.segments) stoesseSoll += Math.max(0, stangenStuecke(W, sg).length - 1);
  ok("[#112] je Stangenstoss genau eine weisse Haarlinie",
    stoesseSoll > 0 && haare(svg).length === stoesseSoll);
  ok("[#112] sie liegen alle in der Stangengruppe, also vor der Stange",
    grp && haare(grp[1]).length === stoesseSoll);
  // Sie sitzt quer zur Stange auf `z1_mm` des UNTEREN Stuecks — geprueft an der gezeichneten
  // Geometrie gegen die Stossposition aus `stangenStuecke()`, nicht gegen eine Nachrechnung.
  ok("[#112] sie steht waagerecht auf der Stossposition z1_mm des unteren Stuecks", (() => {
    const sc = 1 / zA3.masstab, pad = Z.PAD_MM;   // Zeichnungsrand unveraendert (#112)
    const hPx = W.height_mm * sc;
    const soll = [];
    for (const col of W.tension_columns)
      for (const sg of col.segments) {
        const st = stangenStuecke(W, sg);
        for (let i = 0; i < st.length - 1; i++)
          soll.push({ x: pad + col.x_mm * sc, y: pad + (hPx - st[i].z1_mm * sc) });
      }
    const ist = haare(svg);
    return soll.length === ist.length && soll.every(q => ist.some(h =>
      Math.abs((h.x1 + h.x2) / 2 - q.x) < 1e-3 && Math.abs(h.y - q.y) < 1e-3
      && h.x2 > h.x1)); })());
  // Breite: ABGELEITET aus dem Durchmesser der Kopplungsmutter und messbar BREITER als sie —
  // sonst verschwaende die Linie vollstaendig unter dem Bauteil, das ueber ihr liegt.
  // RUECKFALL-Gegenprobe: `W` fuehrt keine Schluesselweite — dann ist der wirksame Durchmesser
  // das Symbolmass, und die Haarlinie bleibt bit-gleich zum Stand vor #97. Die Gegenprobe MIT
  // Schluesselweite steht im Blattbreiten-Block weiter unten.
  ok("[#112] ohne Schluesselweite ist sie breiter als die Mutter (aus SPANN_MM.d)", (() => {
    const b = SPANN_MM.d * 1.5 * SPANN_EINHEIT.blatt;
    const ist = haare(svg);
    return ist.length > 0 && ist.every(h => Math.abs((h.x2 - h.x1) - b) < 1e-3)
      && b > SPANN_MM.d * SPANN_EINHEIT.blatt; })());
  ok("[#112] sie ist eine Haarlinie — duenner als jede Stangenlinie", (() => {
    const ist = haare(svg);
    return ist.length > 0 && ist.every(h => h.sw < 0.22 * 2.6); })());
  // Ein Strang aus EINEM Stueck hat keinen Stoss — dann darf auch keine Haarlinie entstehen.
  ok("[#112] ein einstueckiger Strang bekommt keine Haarlinie", (() => {
    const W1 = buildWall("IW-H1", 1000, 800, [], null, { rod_lengths_mm: [3000] });
    const s1 = Z.zeichnungSvg(W1, {}).svg;
    const stuecke = W1.tension_columns.flatMap(c => c.segments)
      .reduce((a, sg) => a + stangenStuecke(W1, sg).length, 0);
    const stoesse = W1.tension_columns.flatMap(c => c.segments)
      .reduce((a, sg) => a + Math.max(0, stangenStuecke(W1, sg).length - 1), 0);
    return stuecke > 0 && stoesse === 0 && haare(s1).length === 0; })());
  // Nichts an der Stange selbst hat sich geaendert: Farben und Strichstaerken der Stuecke
  // bleiben, und der Kopplungsvordergrund traegt unveraendert seine Muttern.
  ok("[#112] Farben und Strichstaerken der Stangenstuecke sind unveraendert", (() => {
    const dick = a => a === "rest" ? 3.4 : 2.6;
    let n = 0;
    for (const col of W.tension_columns)
      for (const sg of col.segments)
        for (const st of stangenStuecke(W, sg)) {
          const re = new RegExp(`stroke="${STUECK_FARBE[st.art]}" stroke-width="`
            + `${Math.round(0.22 * dick(st.art) * 1000) / 1000}"`);
          if (!re.test(svg)) return false;
          n++;
        }
    return n > 0; })());

  // MUSS-NICHT der Rueckmeldung vom 2026-09-09: ausser der Reihenfolge aendert sich NICHTS.
  // Belegt wird das nicht an einem eingefrorenen Abzug (der verschoebe sich mit jeder anderen
  // Blattaenderung mit), sondern gegen die KANONISCHE Quelle: Anzahl und Koordinaten jedes
  // Stangenstrichs, jeder Haarlinie und jeder Kopplungsmutter werden aus `stangenStuecke()`
  // und den realen Segmenten nachgebaut und muessen exakt getroffen sein. Eine verschobene,
  // verlorene oder doppelt gezeichnete Marke faellt damit auf, eine reine Umsortierung nicht.
  const SOLL = (() => {
    const sc = 1 / zA3.masstab, pad = Z.PAD_MM, hPx = W.height_mm * sc;
    const X = x => pad + x * sc, Y = z => pad + (hPx - z * sc);
    const stangen = [], haare = [], kop = [];
    for (const col of W.tension_columns)
      for (const sg of col.segments) {
        const st = stangenStuecke(W, sg);
        for (let i = 0; i < st.length; i++) {
          stangen.push({ x: X(col.x_mm), y0: Y(st[i].z0_mm), y1: Y(st[i].z1_mm) });
          if (i < st.length - 1) {
            haare.push({ x: X(col.x_mm), y: Y(st[i].z1_mm) });
            kop.push({ x: X(col.x_mm), y: Y(st[i].z1_mm) });   // Mutter am Stoss
          }
        }
        // Fussmutter: nur wo der untere Anker das Bodenblech ist ([A-19]).
        const au = sg.anker_unten || (sg.z0_mm === 0 ? "bodenblech" : "spannplatte");
        if (au === "bodenblech") kop.push({ x: X(col.x_mm), y: Y(sg.z0_mm) });
      }
    return { stangen, haare, kop };
  })();
  const nah = (a, b) => Math.abs(a - b) < 1e-3;

  ok("[#112] Anzahl und Koordinaten der Stangenstriche sind unveraendert", (() => {
    const ist = [...grp[1].matchAll(
      /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="(?!#fff)/g)]
      .map(m => ({ x: +m[1], y0: +m[2], y1: +m[4] }));
    return ist.length === SOLL.stangen.length && SOLL.stangen.length > 0
      && SOLL.stangen.every(q => ist.some(i =>
        nah(i.x, q.x) && nah(i.y0, q.y0) && nah(i.y1, q.y1))); })());

  ok("[#112] Anzahl und Koordinaten der Haarlinien sind unveraendert", (() => {
    const ist = haare(svg);
    return ist.length === SOLL.haare.length && SOLL.haare.length > 0
      && SOLL.haare.every(q => ist.some(h =>
        nah((h.x1 + h.x2) / 2, q.x) && nah(h.y, q.y))); })());

  // Die Kopplungsmuttern sind gefuellte Rechtecke; der Bezugspunkt ist ihre MITTE, das
  // Rechteck steht also eine halbe Hoehe hoeher. Die Fussmutter sitzt AUF dem Blech, ihre
  // Unterkante liegt damit auf der Ankerhoehe — beide Faelle werden zugelassen, weil hier
  // die MENGE geprueft wird und nicht die Einbaulage (die haengt an #97 und ist unberuehrt).
  ok("[#112] Anzahl und Koordinaten der Kopplungsmuttern sind unveraendert", (() => {
    const g = /<g class="kop">([\s\S]*?)<\/g>/.exec(svg);
    const ist = [...g[1].matchAll(
      /x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
      .map(m => ({ x: +m[1] + +m[3] / 2, y: +m[2], h: +m[4] }));
    return ist.length === SOLL.kop.length && SOLL.kop.length > 0
      && SOLL.kop.every(q => ist.some(i => nah(i.x, q.x)
        && (nah(i.y + i.h / 2, q.y) || nah(i.y + i.h, q.y)))); })());
}

{
  ok("[#110] Modul 7 fuehrt keine eigene Symbolgeometrie und keine eigenen Hex-Werte", (() => {
    const q = readFileSync(new URL("../../docs/shared/sembla-zeichnung.js", import.meta.url), "utf8");
    return /import \{[\s\S]*?mutterSvg[\s\S]*?\} from "\.\/sembla-montage\.js"/.test(q)
      && !/"#14559c"/.test(q) && !/"#0b3a73"/.test(q)
      && !/<circle cx=[^]]*FARBE\.mutter/.test(q); })());
}

// [D-4] gemeinsamer Farbschluessel: Modul 1, 5 und 7 einfaerben denselben Zuschnitt gleich.
ok("Stangenfarben kommen aus STUECK_FARBE (sembla-montage.js), kein eigener Farbsatz",
  Z.FARBE.stange === STUECK_FARBE.standard && Z.FARBE.stange_sonder === STUECK_FARBE.sonder
  && Z.FARBE.stange_rest === STUECK_FARBE.rest);
ok("die Zeichnung leitet Stueckart und Stueckgeometrie nicht selbst ab (beide kommen geteilt)", (() => {
  const q = readFileSync(new URL("../../docs/shared/sembla-zeichnung.js", import.meta.url), "utf8");
  return /import \{[^}]*stangenStuecke[^}]*\} from "\.\/sembla-montage\.js"/.test(q)
    && !/function _stueckArt/.test(q)
    // keine eigene Kumulation der Stuecklaengen im Zeichenbaustein ([P-6])
    && !/\+=\s*st\.len_mm|\+\s*st\.len_mm/.test(q);
})());

// Reststueck am oberen Wandabschluss ([Z-6]) ist in der Zeichnung eigens erkennbar.
// Standardlaengen 100/50 cm, Reststueck 30 cm, Ueberstand 1 cm -> 100+100+31(Sonder)+30(Rest).
const WR6 = buildWall("IW-04", 3000, 2600, [], null,
  { rod_lengths_mm: [1000, 500], rod_rest_mm: 300, rod_overhang_mm: 10 });
const svgR6 = Z.zeichnungSvg(WR6, {}).svg;
const zaehl = (t, f) => (t.match(new RegExp(`stroke="${f}"`, "g")) || []).length;
const sollArt = a => WR6.tension_columns.flatMap(c => c.segments)
  .reduce((n, sg) => n + (sg.stuecke || []).filter(p => p.art === a).length, 0);
ok("Testwand enthaelt alle drei Stueckarten (Voraussetzung des Tests)",
  ["standard", "sonder", "rest"].every(a => sollArt(a) > 0));
ok("Reststueck, Sonderzuschnitt und Standardlaenge sind getrennt eingefaerbt",
  ["standard", "sonder", "rest"].every(a => zaehl(svgR6, STUECK_FARBE[a]) === sollArt(a)));
ok("Legende erklaert auch das Reststueck am oberen Abschluss",
  Z.legendeHtml().includes(STUECK_LABEL.rest) && /\[Z-6\]/.test(Z.legendeHtml())
  && Z.blattHtml(WR6, eingaben, {}).html.includes(STUECK_LABEL.rest));
ok("ohne Reststueck steht die Reststueck-Farbe nicht im Blatt-SVG (nichts erfinden)",
  !Z.zeichnungSvg(W, {}).svg.includes(STUECK_FARBE.rest));

// --- 4) [D-3] Bemassung: reine Millimeterwerte ohne Suffix (#64) -----------
// Geprueft wird an den gezeichneten MASSTEXTKNOTEN, nicht an einem globalen
// mm-Zaehler: `width="…mm"` am SVG-Wurzelelement, Materialangaben in Tabellen
// und Meldungstexte duerfen ihre Einheit selbstverstaendlich behalten.
/** Alle Textknoten eines SVG mit ihrer Farbe. */
const textKnoten = (s) => [...s.matchAll(/<text\b[^>]*fill="([^"]+)"[^>]*>([^<]*)<\/text>/g)]
  .map(m => ({ farbe: m[1], text: m[2] }));
/**
 * Textknoten, die eine Massbeschriftung sind (Mass-, Oeffnungs-, Staffelfarbe).
 * Die Art-Beschriftung IN der Oeffnung („Tür"/„Fenster"/„Durchbruch") traegt
 * dieselbe Farbe, ist aber kein Mass und wird deshalb ausgenommen — die
 * Reihennummern haben mit `FARBE.reihe` ohnehin eine eigene Farbe.
 */
const ART_TEXTE = ["Tür", "Fenster", "Durchbruch"];
const massTexte = (s) => textKnoten(s)
  .filter(t => [Z.FARBE.mass, Z.FARBE.oeffnung, Z.FARBE.staffel].includes(t.farbe))
  .map(t => t.text)
  .filter(t => !ART_TEXTE.includes(t));

const mt = massTexte(svg);
// W = 3000 x 2600, Tuer 750 breit / 2000 hoch, Staffelstufe 750 lang / 2000 hoch.
ok("Gesamtlaenge und -hoehe stehen als reine mm-Zahl (3000 / 2600)",
  mt.includes("3000") && mt.includes("2600"));
ok("Oeffnungsbreite und -hoehe stehen als reine mm-Zahl (750 / 2000)",
  mt.includes("750") && mt.includes("2000"));
ok("Staffelungsmass steht in der Staffelungsfarbe und als reine mm-Zahl",
  textKnoten(svg).filter(t => t.farbe === Z.FARBE.staffel).map(t => t.text)
    .some(t => t === "750") && svg.includes(Z.FARBE.staffel));
ok("KEIN Masstext traegt ein Einheitensuffix (mm/cm/m)",
  mt.length > 0 && mt.every(t => !/\s(?:mm|cm|m)$/.test(t)));
ok("keine Meter-/Zentimeter-Schattenumrechnung in den Masstexten",
  mt.every(t => !/^\d+,\d{2,3}$/.test(t)) && !mt.includes("3,000") && !mt.includes("2,60"));

const bruestung = Z.zeichnungSvg(WF, {}).svg;
const mtF = massTexte(bruestung);
// WF = 4000 x 2600, Fenster 750 breit, 1200 hoch, Bruestung 800.
ok("Bruestungshoehe wird bemasst (Fenster mit l0 > 0) — reine mm-Zahl",
  mtF.includes("800") && mtF.includes("1200") && mtF.includes("750"));
ok("auch beim Fenster traegt kein Masstext ein Suffix",
  mtF.length > 0 && mtF.every(t => !/\s(?:mm|cm|m)$/.test(t)));
ok("Bemassung abschaltbar", massTexte(Z.zeichnungSvg(W, { masse: false }).svg).length === 0);

// [#64] Titel und Wandangabe fuehren direkt auf length_mm/height_mm zurueck.
const titel = Z.zeichnungTitel(W, 25);
ok("Zeichnungstitel nennt die Wandmasse in mm ohne Umrechnung",
  titel.includes(W.length_mm + " × " + W.height_mm) && !/\bm ·/.test(titel));

// --- 5) Blatt: Tabellen, Legende, Hinweise, Schriftfeld --------------------
const blatt = Z.blattHtml(W, eingaben, { format: "a3" });
ok("Blatt nennt Masstab und Wand in der Kopfzeile",
  blatt.html.includes("M 1:" + blatt.masstab) && blatt.html.includes("IW-01"));
const bomLabels = semblaBomItems(W).filter(it => it.menge > 0).map(it => it.label);
ok("Stueckliste im Blatt kommt aus sembla-bom.js (kein eigenes Mengenmodell)",
  bomLabels.length > 0 && bomLabels.every(l => blatt.html.includes(l)));
ok("Vorspann-Kennzahlen im Blatt",
  blatt.html.includes("Spannachsen") && blatt.html.includes("Gewindestange") && blatt.html.includes("Sonderlängen"));
ok("Spannachsen-Zahl stimmt mit dem Wandelement",
  Z.vorspannZeilen(W).find(r => r.label === "Spannachsen").wert === String(W.tension_columns.length));
// [#104] Die Startachse ist ersatzlos zurueckgebaut: [V-5] ist durch [V-3]/[V-11] abgeloest,
// das Feld ist wirkungslos und wird im Blatt nicht mehr genannt. Die uebrigen Kennzahlen
// bleiben in Reihenfolge und Wortlaut unveraendert stehen.
ok("[#104] Vorspann-Kennzahlen fuehren keine Startachse mehr",
  !Z.vorspannZeilen(W).some(r => r.label === "Startachse")
  && !/Startachse/.test(blatt.html));
ok("[#104] die uebrigen Vorspann-Kennzahlen stehen unveraendert in dieser Reihenfolge",
  JSON.stringify(Z.vorspannZeilen(W).map(r => r.label))
  === JSON.stringify(["Spannachsen", "max. Achsabstand", "Vorspannkraft N", "Gewindestange",
    "Stangenstücke", "Sonderlängen", "Reststück oben", "oberer Anschluss"]));
ok("Strangzeilen je Spannachse", Z.strangZeilen(W).length === W.tension_columns.length);

// --- [P-19] Einbauteil-IDs: Liste und Zeichnung benennen dieselben KONKRETEN Stuecke -------
// Geprueft wird kein erklaertes Schema, sondern die Gleichheit der ausgegebenen IDs. Quelle ist
// beidseitig `einbauteile()`; das Blatt fuehrt sie in seiner Strangtabelle ([D-6]).
{
  const teile = einbauteile(W);
  const idsBlatt = Z.einbauteilZeilen(W).flatMap(r => r.wert.split(" ").map(s => s.replace(/^[^A-Z]+/, "")));
  ok("[P-19] Blatt-ID-Tabelle enthaelt jede konkrete Einbauteil-ID",
    teile.length > 0 && teile.every(t => idsBlatt.includes(t.id)));
  ok("[P-19] Blatt-ID-Tabelle enthaelt KEINE ID, die es nicht gibt",
    idsBlatt.length === teile.length && new Set(idsBlatt).size === teile.length);
  ok("[P-19] jede ID steht im gerenderten Blatt-HTML", teile.every(t => blatt.html.includes(t.id)));
  ok("[P-19] Zeichnung und Stueckliste nutzen dieselben IDs (kein zweites Schema)", (() => {
    const ausListe = semblaBomItems(W).filter(it => it.ids && it.ids.length).flatMap(it => it.ids);
    return ausListe.sort().join() === teile.map(t => t.id).sort().join(); })());
  ok("[P-19] jede ID traegt ihr Art-Symbol unmittelbar voran (schwarz-weiss lesbar)",
    Z.strangZeilen(W).every(r => r.teile.every(s => /^[■◆▲]GS-k\d+\.\d+\.\d+$/.test(s))));
  ok("[P-19] Blatt erklaert Symbole UND ID-Schema in der Legende",
    /■ Standardteil/.test(blatt.html) && /◆ Sonderzuschnitt/.test(blatt.html)
    && /▲ Reststück oben/.test(blatt.html)
    && /Einbauteil-ID GS-k&lt;Spannachse&gt;/.test(blatt.html));
  ok("[P-19] Mengentabelle des Blattes kennzeichnet die Stueckart mit Symbol",
    Z.bomZeilen(W).filter(r => /Gewindestange/.test(r.label)).every(r => /^[■◆▲] /.test(r.label))
    && Z.bomZeilen(W).filter(r => /Stein i/.test(r.label)).every(r => !/^[■◆▲] /.test(r.label)));
  ok("[P-19] ID-Ableitung ist deterministisch (zweimal bitgleich)",
    JSON.stringify(Z.einbauteilZeilen(W)) === JSON.stringify(Z.einbauteilZeilen(W)));
  // Der zentrale Export nutzt dieselbe Blattableitung ([D-6]) — also auch dieselben IDs.
  ok("[P-19] Export-Blatt fuehrt dieselben IDs wie die Vorschau",
    teile.every(t => zeichnungHtml(W, eingaben).includes(t.id)));
}
ok("Legende erklaert den Darstellungsschluessel",
  /Gewindestange \(Standardlänge\)/.test(blatt.html) && /Sonderlänge/.test(blatt.html)
  && /Boden-\/Kopfblech/.test(blatt.html));

// [D-4]/[Z-6] Das Reststueck am oberen Wandabschluss ist ein EIGENES Bauteil und muss auf dem
// Blatt als solches erkennbar sein: eigene Farbe, eigener Legendeneintrag, eigene Kennzahl.
// Es darf weder wie eine Standardlaenge aussehen noch unter den Sonderlaengen mitlaufen.
{
  const WR = buildWall("IW-Rest", 2000, 2600, [], null, { rod_lengths_mm: [1000], rod_rest_mm: 100 });
  const stuecke = WR.tension_columns.flatMap(c => c.segments).flatMap(g => g.stuecke || []);
  ok("[Z-6] Referenzwand traegt Reststuecke im Wandelement (Slicing steht im JSON)",
    stuecke.some(s => s.art === "rest"));
  const svg = Z.zeichnungSvg(WR, {}).svg;
  ok("[D-4] Reststueck wird in eigener Farbe gezeichnet",
    svg.includes(Z.FARBE.stange_rest) && Z.FARBE.stange_rest !== Z.FARBE.stange
    && Z.FARBE.stange_rest !== Z.FARBE.stange_sonder);
  ok("[D-4] Legende benennt das Reststueck", /Reststück oben/.test(Z.legendeHtml()));
  const zr = Z.vorspannZeilen(WR).find(r => r.label === "Reststück oben");
  ok("[Z-6] Reststueck als eigene Kennzahl mit Laenge und Anzahl",
    !!zr && /10,0 cm/.test(zr.wert) && zr.wert.includes(stuecke.filter(s => s.art === "rest").length + "×"));
  ok("[Z-6] Reststueck laeuft NICHT unter den Sonderlaengen mit", (() => {
    const so = Z.vorspannZeilen(WR).find(r => r.label === "Sonderlängen").wert;
    return !/10,0 cm/.test(so) && !/^10 cm/.test(so);
  })());
  ok("[Z-6] ohne Reststueck wird keine Laenge erfunden (keine ersatzweise Standardlaenge)", (() => {
    const WO = buildWall("IW-ohne", 2000, 2600, [], null, { rod_lengths_mm: [1000] });
    const wert = Z.vorspannZeilen(WO).find(r => r.label === "Reststück oben").wert;
    return !/cm/.test(wert) && !Z.zeichnungSvg(WO, {}).svg.includes(Z.FARBE.stange_rest);
  })());
}

// [Z-6]/[D-4] Das Reststueck wird mit seiner REALEN Materiallaenge gezeichnet — der Ueberstand
// ueber die Wandoberkante ist eingebautes Material und darf nicht abgeschnitten werden. Vorher
// kappte die Zeichnung das letzte Stueck auf das Segmentende: das Reststueck war um genau den
// Ueberstand zu kurz und bei rod_rest_mm <= rod_overhang_mm gar nicht mehr sichtbar.
console.log("\n[Z-6] Reststueck: Geometrie inkl. Ueberstand");
{
  // Laengen der im SVG mit `farbe` gezeichneten senkrechten Linien (in Papier-mm).
  const linien = (svg, farbe) => [...svg.matchAll(
    /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="([^"]+)"/g)]
    .filter(m => m[5] === farbe).map(m => Math.abs(+m[2] - +m[4]));

  const WR = buildWall("IW-Rest", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 100, rod_overhang_mm: 10 });
  const zr = Z.zeichnungSvg(WR, {});
  const sc = 1 / zr.masstab;
  const restL = linien(zr.svg, Z.FARBE.stange_rest);
  const segR = WR.tension_columns[0].segments[0];
  const restStueck = segR.stuecke[segR.stuecke.length - 1];
  ok("Testwand: Reststueck 100 mm mit 10 mm Ueberstand (Voraussetzung)",
    restStueck.art === "rest" && restStueck.len_mm === 100 && segR.ueberstand_mm === 10);
  ok("[Z-6] gezeichnete Reststuecklaenge == Materiallaenge (Ueberstand nicht gekappt)",
    restL.length === WR.tension_columns.length
    && restL.every(l => Math.abs(l - restStueck.len_mm * sc) < 0.01));
  ok("[Z-6] das Reststueck ragt ueber die Wandoberkante hinaus (Ueberstand sichtbar)", (() => {
    // y der Wandoberkante = PAD_MM; das obere Ende des Reststuecks liegt darueber (kleineres y)
    const oben = [...zr.svg.matchAll(
      /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="([^"]+)"/g)]
      .filter(m => m[5] === Z.FARBE.stange_rest).map(m => Math.min(+m[2], +m[4]));
    return oben.length > 0 && oben.every(y => y < Z.PAD_MM - 1e-9
      && Math.abs(y - (Z.PAD_MM - segR.ueberstand_mm * sc)) < 0.01);
  })());
  ok("[Z-6] Kopplungshoehen bleiben das Segmentende (stangenEnden unveraendert)",
    stangenEnden(WR, segR)[segR.stuecke.length - 1] === segR.z1_mm);

  // Der Fall, der das Stueck ganz verschwinden liess: Reststueck == Ueberstand.
  const WK = buildWall("IW-kurz", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 10, rod_overhang_mm: 10 });
  const zk = Z.zeichnungSvg(WK, {});
  const kurzL = linien(zk.svg, Z.FARBE.stange_rest);
  ok("[Z-6] Reststueck bleibt sichtbar, wenn es so lang ist wie der Ueberstand",
    kurzL.length === WK.tension_columns.length
    && kurzL.every(l => Math.abs(l - 10 * (1 / zk.masstab)) < 0.01));
  ok("[Z-6] auch dieses kurze Stueck steht als eigene Position in der Blatt-Stueckliste",
    Z.bomZeilen(WK).some(r => /Reststück/.test(r.label)));
}

// [Z-5]/[Z-6] Zuschnittkonflikte: das Blatt darf einen unvollstaendigen Zuschnitt nicht als
// vollstaendig ausgeben. Bisher stand der Befund NUR in Modul 1; Blatt und Export schwiegen.
console.log("\n[Z-5]/[Z-6] Zuschnittkonflikte stehen auf dem Blatt");
{
  const WO = buildWall("IW-ohne", 2000, 2600, [], null, { rod_lengths_mm: [1000] });
  const zk = Z.konfliktZeilen(WO);
  ok("konfliktZeilen liest validation.zuschnitt_konflikte (kein_reststueck)",
    zk.length === 1 && zk[0].grund === "kein_reststueck"
    && zk[0].anzahl === WO.validation.zuschnitt_konflikte.length
    && zk[0].straenge.length === WO.tension_columns.length);
  const blattO = Z.blattHtml(WO, eingaben, {}).html;
  ok("Blatt benennt den Konflikt im Mangelblock", blattO.includes(Z.MANGEL_TITEL)
    && blattO.includes("zmangel") && blattO.includes(Z.KONFLIKT_TEXT.kein_reststueck));
  ok("Blatt sagt, dass es damit unvollstaendig ist", /unvollständig/.test(blattO));
  ok("Kennzahl „Reststück oben\" verschweigt den Mangel nicht als „–\"",
    Z.vorspannZeilen(WO).find(r => r.label === "Reststück oben").wert !== "–");
  ok("derselbe Mangel steht im zentralen Export ([D-6])",
    zeichnungHtml(WO, eingaben, {}).includes(Z.KONFLIKT_TEXT.kein_reststueck));

  // Ohne Konflikt gibt es keinen leeren Kasten (wie bei der Legende in [D-4]).
  const WG = buildWall("IW-gut", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 100, rod_overhang_mm: 10 });
  ok("ohne Konflikt kein Mangelblock", Z.konfliktZeilen(WG).length === 0
    && Z.maengelHtml(WG) === "" && !Z.blattHtml(WG, eingaben, {}).html.includes(Z.MANGEL_TITEL));

  // Unbestimmter Zuschnitt: nichts zeichnen und nichts erfinden.
  const WL2 = buildWall("IW-lang", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 5000, rod_overhang_mm: 10 });
  const segL = WL2.tension_columns[0].segments[0];
  ok("Testwand: Zerlegung unbestimmt (reststueck_zu_lang, leeres `stuecke`)",
    segL.zuschnitt_konflikt === "reststueck_zu_lang" && segL.stuecke.length === 0);
  const svgL = Z.zeichnungSvg(WL2, {}).svg;
  ok("[Z-6] unbestimmtes Segment wird NICHT gezeichnet (keine Ersatzstange)",
    !svgL.includes(Z.FARBE.stange_rest) && !svgL.includes(`stroke="${Z.FARBE.stange}"`)
    && !svgL.includes(`stroke="${Z.FARBE.stange_sonder}"`));
  ok("Blatt benennt reststueck_zu_lang",
    Z.blattHtml(WL2, eingaben, {}).html.includes(Z.KONFLIKT_TEXT.reststueck_zu_lang));
  ok("[P-6] Blatt-Stueckliste erfindet dafuer keine Gewindestangen-Position",
    !Z.bomZeilen(WL2).some(r => /Gewindestange/.test(r.label)));
}

// [D-5] (#61) Das Blatt fuehrt KEINE Regellisten — weder eingehaltene noch offene Zielregeln,
// und keinen erklaerenden Fusstext dazu. [D-5] bleibt als Aussagewahrheitsregel scharf: wo keine
// Regel genannt ist, kann auch nichts vermischt werden. Geprueft wird die Abwesenheit an den
// wortwoertlichen Texten der frueheren Bloecke, damit ein Rueckfall auffaellt.
ok("keine Liste eingehaltener Vorspannregeln mehr im Blatt",
  !/eingehaltene Vorspannregeln/.test(blatt.html)
  && !/mindestens einer Spannachse gehalten/.test(blatt.html)
  && !/mittig im i3-Stein/.test(blatt.html));
ok("keine Liste ungepruefter Zielregeln mehr im Blatt",
  !/nicht automatisch geprüft/.test(blatt.html)
  && !/Planungshinweis/.test(blatt.html) && !/Zielregel/.test(blatt.html)
  && !/750 mm/.test(blatt.html)
  && !/von mindestens zwei Spannachsen gehalten/.test(blatt.html));
ok("kein erklaerender Regel-Fusstext mehr im Blatt",
  !/Zielvorgaben für die Planung/.test(blatt.html)
  && !/planerisch zu prüfen/.test(blatt.html)
  && !/eingehalten/.test(blatt.html) && !/erfüllt/i.test(blatt.html));
ok("der Baustein exportiert die Regellisten gar nicht mehr",
  !("PLANUNGSHINWEISE" in Z) && !("GEPRUEFTE_REGELN" in Z) && !("GEPRUEFT_TITEL" in Z)
  && !("HINWEIS_TITEL" in Z) && !("HINWEIS_FUSS" in Z)
  && !("hinweiseHtml" in Z) && !("gepruefteHtml" in Z));
ok("die Regeln selbst sind unberuehrt: [V-2] ist am Wandelement weiter erfuellt",
  W.validation.ungehaltene_steine.length === 0);
// Der zentrale Export ist dieselbe Ableitung ([D-6]) und damit ebenso reduziert.
ok("auch das Export-Blatt traegt keine Regeltexte", (() => {
  const h = zeichnungHtml(W, eingaben);
  return !/nicht automatisch geprüft/.test(h) && !/eingehaltene Vorspannregeln/.test(h)
    && !/Zielvorgaben für die Planung/.test(h); })());

// [D-8]/(#61) Schriftfeld: genau die zwingenden Angaben, kein Platzhalter, kein Nachweis.
const feldNamen = [...blatt.html.matchAll(/<div class="ztb-row"><div class="k">([^<]*)<\/div>/g)]
  .map(m => m[1]);
ok("Schriftfeld fuehrt GENAU die festgelegten Felder in dieser Reihenfolge",
  feldNamen.join("|") === "Projekt|Wand|Planinhalt|Plan Nr.|Index|Maßstab|Einheit|Gez.");
ok("Schriftfeld nutzt die Projekt-Kopfdaten aus Modul 0",
  blatt.html.includes("Rettungswache") && blatt.html.includes("A-12")
  && blatt.html.includes("TB"));
ok("Verwaltungsangaben stehen nicht mehr auf dem Blatt (am Projekt gepflegt, [L-11])",
  !/Bauherrenschaft/.test(blatt.html) && !/Planverfasser/.test(blatt.html)
  && !/>Phase</.test(blatt.html) && !blatt.html.includes("Landkreis"));
// Fehlende optionale Angabe: keine Zeile, kein "–" und kein "###" — ein Platzhalter liest sich
// wie eine gepflegte Angabe. Geprueft an einer Wand ohne jede Kopfdatenpflege.
{
  const leer = Z.blattHtml(W, {}, {}).html;
  const namenLeer = [...leer.matchAll(/<div class="ztb-row"><div class="k">([^<]*)<\/div>/g)].map(m => m[1]);
  ok("ohne Kopfdaten entfallen die optionalen Zeilen ganz",
    namenLeer.join("|") === "Projekt|Wand|Planinhalt|Maßstab|Einheit"
    && !/Plan Nr\./.test(leer) && !/>Index</.test(leer) && !/>Gez\.</.test(leer));
  ok("kein Platzhaltertext im Schriftfeld",
    !/<div class="v">–<\/div>/.test(leer) && !leer.includes("###")
    && !/<div class="v">–<\/div>/.test(blatt.html) && !blatt.html.includes("###"));
}
ok("Schriftfeld nennt den Masstab", blatt.html.includes("1 : " + blatt.masstab));
// [D-3]/#64: die Einheit steht GENAU EINMAL im Schriftfeld — und nur dort.
const einheitFelder = [...blatt.html.matchAll(
  /<div class="ztb-row"><div class="k">Einheit<\/div><div class="v">([^<]*)<\/div><\/div>/g)];
ok("Schriftfeld hat genau ein Feld „Einheit“ mit dem Wert mm",
  einheitFelder.length === 1 && einheitFelder[0][1] === "mm");
ok("Wandangabe im Schriftfeld steht in mm (keine Meter-Schattenumrechnung)",
  blatt.html.includes("IW-01 · " + W.length_mm + " × " + W.height_mm));
// (#61) Das Blatt fuehrt gar kein Statik-Feld mehr: dass die Zeichnung nichts nachweist, folgt
// daraus, dass sie kein Nachweisfeld hat — ein Erklaersatz dazu war Blattballast. [D-8] bleibt
// unveraendert scharf: kein Ergebnis und kein Zugriff auf ein Nachweismodell.
ok("kein Statik-/Erklaerfeld mehr im Schriftfeld",
  !/>Statik</.test(blatt.html) && !/separat prüfen/.test(blatt.html)
  && !/nicht Bestandteil dieser Zeichnung/.test(blatt.html)
  && !("NACHWEIS_TEXT" in Z));
ok("kein Nachweis-Ergebnis im Blatt (kein bestanden/erfüllt/η)",
  !/bestanden/i.test(blatt.html) && !/η/.test(blatt.html));
ok("Zeichnung nutzt kein Statik-/Engine-Modell",
  !/sembla-statik|sembla-engine|nachweise\(/.test(readFileSync(new URL("../../docs/shared/sembla-zeichnung.js", import.meta.url), "utf8")));

// Wasserzeichen nur auf Wunsch
ok("Wasserzeichen standardmaessig aus", !/Vorabzug/.test(blatt.html));
ok("Wasserzeichen zuschaltbar", /Vorabzug/.test(Z.blattHtml(W, eingaben, { wasserzeichen: true }).html));

// --- 6) Dokument + SVG-Datei ----------------------------------------------
const dok = Z.zeichnungDokument(W, eingaben, { format: "a4" });
ok("Dokument ist selbsttragendes HTML", /^<!DOCTYPE html>/.test(dok) && /<\/html>$/.test(dok.trim()));
ok("Dokument bringt das Blatt-CSS mit", dok.includes(".ztitleblock"));
ok("Dokument setzt @page auf das gewaehlte Format", /@page\{size:A4 landscape/.test(dok));
ok("A3 setzt @page auf A3 landscape", /@page\{size:A3 landscape/.test(Z.zeichnungDokument(W, eingaben, { format: "a3" })));
// Keine Fremd-Lib und kein CDN im Betrieb: weder Nutzung noch Ladeadresse (Erwaehnung in
// einem erklaerenden Kommentar ist erlaubt, ein Aufruf/eine URL nicht).
const zSrc = readFileSync(new URL("../../docs/shared/sembla-zeichnung.js", import.meta.url), "utf8");
// Erlaubt ist allein der SVG-Namensraum (xmlns), sonst keine externe Adresse.
const fremdUrls = (zSrc.match(/https?:\/\/[^" ]*/g) || []).filter(u => u !== "http://www.w3.org/2000/svg");
ok("kein jsPDF/html2canvas-Aufruf und keine CDN-Adresse im Zeichnungsbaustein",
  fremdUrls.length === 0 && !/jsPDF\s*\(|new\s+jsPDF|html2canvas\s*\(|import\s+.*jspdf/i.test(zSrc));
ok("Modul 7 laedt keine externe Bibliothek",
  !/<script[^>]+src=/.test(readFileSync(new URL("../../docs/zeichnung.html", import.meta.url), "utf8")));

const datei = Z.zeichnungSvgDatei(W, eingaben, { format: "a3" });
ok("SVG-Datei ist eigenstaendig (XML-Prolog + xmlns)",
  /^<\?xml/.test(datei) && datei.includes('xmlns="http://www.w3.org/2000/svg"'));
ok("SVG-Datei traegt mm-Masse", /width="[\d.]+mm"/.test(datei) && /height="[\d.]+mm"/.test(datei));
ok("SVG-Datei nennt Wand, Masse und Masstab", datei.includes("IW-01") && datei.includes("M 1:"));
// (#61) Auch die eigenstaendige SVG-Ausgabe ist reduziert: Projekt, Plan-Nr., Index — kein
// erklaerender Statik-Satz. Der zentrale Export ist damit durchgaengig gleich knapp.
ok("SVG-Datei traegt keinen Statik-Erklaersatz",
  !/separat prüfen/.test(datei) && !/nicht Bestandteil dieser Zeichnung/.test(datei)
  && !/Statik/.test(datei));
ok("SVG-Datei nennt Projekt, Plan-Nr. und Index", datei.includes("Rettungswache")
  && datei.includes("Plan A-12") && datei.includes("Index 2"));
ok("SVG-Datei enthaelt die Zeichnung selbst", (datei.match(/<rect/g) || []).length >= steine);

// --- 6c) #79 Brandschutzklassifikation: Kurztext + Legende, schwarz-weiss lesbar ---
// Reine PLANUNGSKENNZEICHNUNG: gelesen aus dem Wandelement, normalisiert ueber die
// kanonische Stelle (storage.js). Geprueft wird (a) dass sie auf dem Blatt steht,
// (b) dass sie ohne Farbe lesbar ist, (c) dass Vorschau, Druck-HTML und SVG-Datei
// DIESELBE Zeichenkette tragen ([D-6]) und (d) dass sonst nichts anders wird.
console.log("\n[#79] Brandschutzklassifikation auf dem Zeichnungsblatt");
{
  // Dieselbe Wand dreimal — nur das Feld unterscheidet sich. Nur so ist der
  // Bitvergleich „ausser der Kennzeichnung unveraendert" ueberhaupt aussagekraeftig.
  const W79 = buildWall("IW-79", 3000, 2600, [new Opening(6, 12, 0, 10, "tuer")]);
  const W79ohne = JSON.parse(JSON.stringify(W79));                       // kein Feld -> F0
  const W79f30 = JSON.parse(JSON.stringify(W79)); W79f30.brandklasse = "F30";
  const W79f0 = JSON.parse(JSON.stringify(W79)); W79f0.brandklasse = "F0";
  const W79krumm = JSON.parse(JSON.stringify(W79)); W79krumm.brandklasse = "F90";

  /** Die Kennzeichnungsgruppe des SVG als Zeichenkette (leer, wenn es keine gibt). */
  const gruppe = s => (s.match(/<g class="brand"[\s\S]*?<\/g>/) || [])[0] || "";
  const svg30 = Z.zeichnungSvg(W79f30, { format: "a3" }).svg;
  const svgOhne = Z.zeichnungSvg(W79ohne, { format: "a3" }).svg;
  const g30 = gruppe(svg30), gOhne = gruppe(svgOhne);

  ok("[#79] F30-Wand traegt den Kurztext F30 im Blatt-SVG",
    g30.includes("Brandschutz F30") && /data-brandklasse="F30"/.test(g30));
  ok("[#79] Wand OHNE das Feld wird als F0 ausgewiesen (Standard, nichts geraten)",
    gOhne.includes("Brandschutz F0") && /data-brandklasse="F0"/.test(gOhne)
    && !("brandklasse" in W79ohne));
  ok("[#79] unbekannter Wert gilt als F0 und wird nie als F30 dargestellt",
    gruppe(Z.zeichnungSvg(W79krumm, {}).svg).includes("Brandschutz F0")
    && !gruppe(Z.zeichnungSvg(W79krumm, {}).svg).includes("F30"));
  ok("[#79] ausdruecklich gesetztes F0 zeichnet wie ein fehlendes Feld",
    gruppe(Z.zeichnungSvg(W79f0, {}).svg) === gruppe(Z.zeichnungSvg(W79ohne, {}).svg));

  // Der Kurztext steht im ohnehin vorhandenen Zeichnungsrand UEBER der Wandoberkante
  // (y < PAD_MM) und liegt damit nachweislich nicht auf der Wandflaeche.
  const y30 = +(g30.match(/ y="([\d.]+)"/) || [])[1];
  ok("[#79] der Kurztext liegt im Zeichnungsrand, nicht auf der Wand",
    y30 > 0 && y30 < Z.PAD_MM);
  // Zuletzt gezeichnet: nichts kann ihn ueberdecken.
  ok("[#79] die Kennzeichnung ist die letzte Gruppe des SVG",
    svg30.endsWith(g30 + "</svg>"));

  // Legende: BEIDE Klassen, jede mit ihrer Bedeutung in Worten.
  const leg = Z.legendeHtml();
  ok("[#79] Legende benennt beide Klassifikationen mit ihrer Bedeutung in Worten",
    leg.includes(Z.BRANDKLASSE.F0.name) && leg.includes(Z.BRANDKLASSE.F30.name)
    && /<b[^>]*>F0<\/b>/.test(leg) && /<b[^>]*>F30<\/b>/.test(leg));
  const blatt30 = Z.blattHtml(W79f30, eingaben, { format: "a3" }).html;
  ok("[#79] die Legendeneintraege stehen im gerenderten Blatt",
    blatt30.includes(Z.BRANDKLASSE.F0.name) && blatt30.includes(Z.BRANDKLASSE.F30.name));

  // Schwarz-weiss: nach Entfernen ALLER Farbangaben bleibt die Angabe lesbar und
  // F0/F30 unterscheidbar. Farbe ist damit nachweislich nur additiv.
  const ohneFarbe = s => s.replace(/(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/g, "")
    .replace(/style="color:#[0-9a-fA-F]{3,8}"/g, "");
  ok("[#79] die Angabe haengt nicht an einer Farbe (Schwarz-Weiss-Ausdruck)",
    ohneFarbe(g30).includes("Brandschutz F30")
    && !ohneFarbe(g30).includes("Brandschutz F0")
    && ohneFarbe(gOhne).includes("Brandschutz F0")
    && ohneFarbe(Z.legendeHtml()).includes(Z.BRANDKLASSE.F30.name)
    && ohneFarbe(Z.legendeHtml()).includes(Z.BRANDKLASSE.F0.name));

  // [D-6] EIN Pfad: Vorschau, Druck-HTML, eigenstaendige SVG-Datei und die Dateien des
  // zentralen Exports tragen BYTEWEISE dieselbe Kennzeichnungsgruppe.
  ok("[#79] Druck-Dokument und SVG-Datei tragen dieselbe Angabe wie die Vorschau",
    g30.length > 0
    && Z.zeichnungDokument(W79f30, eingaben, { format: "a3" }).includes(g30)
    && Z.zeichnungSvgDatei(W79f30, eingaben, { format: "a3" }).includes(g30));
  ok("[#79] der zentrale Export nutzt dieselbe Ableitung (HTML + SVG)",
    zeichnungHtml(W79f30, eingaben).includes(g30)
    && zeichnungSvgText(W79f30, eingaben).includes(g30));
  {
    const p79 = { format: "SEMBLA-Projekt", version: 2, name: "IW-79", wandelement: W79f30, eingaben };
    const d79 = baueDateien(p79, ["zeichnung"]);
    ok("[#79] beide Zeichnungsdateien des ZIP-Exports tragen die Angabe",
      d79.length === 2 && d79.every(f => f.data.includes(g30)));
  }

  // Nichts sonst aendert sich: Masstab, Blattmasse, Steine, Masstexte, Schriftfeld.
  const z30 = Z.zeichnungSvg(W79f30, { format: "a3" }), z0 = Z.zeichnungSvg(W79ohne, { format: "a3" });
  ok("[#79] Masstab und Blattmasse sind mit und ohne F30 identisch",
    z30.masstab === z0.masstab && z30.breite_mm === z0.breite_mm && z30.hoehe_mm === z0.hoehe_mm
    && z30.viewBox === z0.viewBox);
  ok("[#79] die Wandabwicklung ist ausser der Kennzeichnung bitgleich",
    svg30.replace(g30, "") === svgOhne.replace(gOhne, ""));
  ok("[#79] keine Schraffur/kein Muster ueber der Wandflaeche (nichts verdeckt)",
    !/<pattern/.test(svg30) && !/url\(#/.test(svg30)
    && (svg30.match(/<rect/g) || []).length === (svgOhne.match(/<rect/g) || []).length);
  ok("[#79] die Bemassung bleibt unveraendert",
    massTexte(svg30).join("|") === massTexte(svgOhne).join("|") && massTexte(svg30).length > 0);
  ok("[#79] der Schriftfeld-Feldsatz bleibt unveraendert", (() => {
    const felder = t => [...t.matchAll(/<div class="ztb-row"><div class="k">([^<]*)<\/div>/g)]
      .map(m => m[1]).join("|");
    return felder(blatt30) === felder(Z.blattHtml(W79ohne, eingaben, { format: "a3" }).html)
      && felder(blatt30) === "Projekt|Wand|Planinhalt|Plan Nr.|Index|Maßstab|Einheit|Gez.";
  })());
  ok("[#79] die Klassifikation steht NICHT im Schriftfeld", (() => {
    const tb = (blatt30.match(/<div class="ztitleblock">[\s\S]*?$/) || [""])[0];
    return !/Brandschutz/.test(tb) && !/F30/.test(tb);
  })());

  // Keine Ableitung, kein Nachweisanspruch, keine Regelkunde auf dem Blatt.
  ok("[#79] aus der Klassifikation folgt nichts (Stueckliste/Kennzahlen unveraendert)",
    JSON.stringify(Z.bomZeilen(W79f30)) === JSON.stringify(Z.bomZeilen(W79ohne))
    && JSON.stringify(Z.vorspannZeilen(W79f30)) === JSON.stringify(Z.vorspannZeilen(W79ohne))
    && JSON.stringify(Z.konfliktZeilen(W79f30)) === JSON.stringify(Z.konfliktZeilen(W79ohne)));
  ok("[#79] das F30-Blatt behauptet keine Pruefung und traegt keinen Regel-Fusstext",
    !/bestanden/i.test(blatt30) && !/erfüllt/i.test(blatt30) && !/eingehalten/.test(blatt30)
    && !/Zielregel/.test(blatt30) && !/Planungshinweis/.test(blatt30)
    && !/Freigabe/.test(blatt30) && !/>Statik</.test(blatt30));

  // Nur gelesen: das Wandelement wird durch keine Ausgabe veraendert.
  {
    const vorher = JSON.stringify(W79f30);
    Z.blattHtml(W79f30, eingaben, {});
    Z.zeichnungDokument(W79f30, eingaben, {});
    Z.zeichnungSvgDatei(W79f30, eingaben, {});
    zeichnungHtml(W79f30, eingaben); zeichnungSvgText(W79f30, eingaben);
    ok("[#79] die Zeichnung liest nur — das Wandelement bleibt unveraendert",
      JSON.stringify(W79f30) === vorher);
  }

  // Herkunft der Werte: genau EIN storage.js-Import, und der holt nur den reinen
  // Normalisierer. Kein Speicherzugriff, kein Schreibweg, keine zweite Werteliste.
  // Die Importliste steht bewusst als `{…}` im Muster: `[\s\S]*?` liefe sonst vom
  // ERSTEN import der Datei bis hierher und pruefte gar nicht die eigene Zeile.
  const storageImporte = [...zSrc.matchAll(/import\s+(\{[^}]*\})\s+from\s+"\.\/storage\.js"/g)];
  ok("[#79] aus dem Speicher kommt genau EIN Import — und der holt nur normBrandklasse",
    storageImporte.length === 1 && storageImporte[0][1].trim() === "{ normBrandklasse }"
    && (zSrc.match(/from\s+"\.\/storage\.js"/g) || []).length === 1);
  ok("[#79] der Zeichnungsbaustein hat keinen Speicher-/Schreibpfad",
    !/localStorage|setItem|getItem|mergeEingaben|setzeAktiv|speichere/.test(zSrc));
  ok("[#79] kein Produktionsimport aus sembla-lageplan.js und kein dynamischer Import",
    !/from\s+"\.\/sembla-lageplan\.js"/.test(zSrc) && !/import\s*\(/.test(zSrc));
  ok("[#79] die Zeichnung fuehrt keine eigene Werteliste F0/F30",
    !/BRANDKLASSEN|BRANDKLASSE_DEFAULT/.test(zSrc)
    && (zSrc.match(/normBrandklasse\(/g) || []).length === 1);
  // Wortlaut und Kennfarbe muessen zum Lageplan passen — geprueft, nicht verdrahtet.
  ok("[#79] Wortlaut und Kennfarbe stimmen mit dem Lageplan ueberein (kein Drift)",
    ["F0", "F30"].every(k => Z.BRANDKLASSE[k].kuerzel === LP.BRANDKLASSE[k].kuerzel
      && Z.BRANDKLASSE[k].name === LP.BRANDKLASSE[k].name
      && Z.BRANDKLASSE[k].farbe === LP.BRANDKLASSE[k].farbe));
  ok("[#79] die Klassifikation ist keine gespeicherte Darstellungsoption",
    !("brandklasse" in Z.standardOptionen())
    && Object.keys(Z.standardOptionen()).sort().join(",") === "format,masse,planinhalt,steintypen,wasserzeichen");
}

// --- 6b) #61 Blattgeometrie: Vorschau und Druck aus DENSELBEN BLATT-Daten ---
// Die Vorschau darf nicht das aeussere Papierverhaeltnis zeigen, waehrend gedruckt der
// Innenbereich ausgegeben wird — und die Blattgroesse darf nur EINMAL definiert sein.
// Referenz sind hier die echten DIN-Querformatmasse, nicht der Code selbst.
const DIN = { a3: { w: 420, h: 297 }, a4: { w: 297, h: 210 } };
let papierEcht = true, cssMass = true, druckOhneGeometrie = true, seitenverhaeltnis = true;
for (const f of Z.FORMATE) {
  const b = Z.BLATT[f], i = Z.blattInnen(f);
  if (b.papier_mm.w !== DIN[f].w || b.papier_mm.h !== DIN[f].h) papierEcht = false;
  // Innenflaeche = Papier abzueglich des Randes, den druckCss() als @page-margin setzt
  if (i.w !== DIN[f].w - 2 * b.rand_mm || i.h !== DIN[f].h - 2 * b.rand_mm) papierEcht = false;
  // Vorschau-Basisgeometrie: feste Papier-mm in der gemeinsamen CSS-Basis
  if (!new RegExp(`\\.zsheet\\.fmt-${f}\\{width:${i.w}mm;height:${i.h}mm\\}`).test(Z.ZEICHNUNG_CSS)) cssMass = false;
  // Druck-CSS: @page passt zu BLATT und definiert KEINE zweite Blattgeometrie
  const d = Z.druckCss(f);
  if (!d.startsWith(`@page{size:${b.seite};margin:${b.rand_mm}mm}`)) druckOhneGeometrie = false;
  const regel = (d.match(/\.zsheet\{([^}]*)\}/) || [])[1] || "";
  if (/width|height|aspect-ratio/.test(regel)) druckOhneGeometrie = false;
  // Seitenverhaeltnis Vorschau == Druck (beide sind die druckbare Innenflaeche)
  const cssV = i.w / i.h, druckV = (DIN[f].w - 2 * b.rand_mm) / (DIN[f].h - 2 * b.rand_mm);
  if (Math.abs(cssV - druckV) > 1e-12) seitenverhaeltnis = false;
}
ok("BLATT fuehrt das reale Papiermass; die Innenflaeche wird daraus gerechnet", papierEcht);
ok("Vorschau-Basisgeometrie steht in Papier-mm in ZEICHNUNG_CSS", cssMass);
ok("druckCss() setzt nur @page — keine zweite Blattgeometrie", druckOhneGeometrie);
ok("A3 und A4: Vorschau und Druck haben dasselbe Seitenverhaeltnis", seitenverhaeltnis);
ok("kein aeusseres Papierverhaeltnis mehr in der Blatt-CSS-Basis", !/aspect-ratio/.test(Z.ZEICHNUNG_CSS));
ok("die Blattgroesse ist genau einmal definiert (nur in ZEICHNUNG_CSS)",
  (Z.ZEICHNUNG_CSS.match(/\.zsheet\.fmt-\w+\{width:/g) || []).length === Z.FORMATE.length
  && !/\.zsheet\.fmt-/.test(Z.druckCss("a3")) && !/\.zsheet\.fmt-/.test(Z.druckCss("a4")));
// Der Rahmen der Vorschau darf die Boxgeometrie nicht veraendern (sonst waere das
// gedruckte Blatt um die Rahmenstaerke anders proportioniert als die Vorschau).
ok("Blattrahmen liegt ausserhalb der Boxgeometrie (outline, box-sizing)",
  /\.zsheet\{[^}]*box-sizing:border-box/.test(Z.ZEICHNUNG_CSS)
  && /\.zsheet\{[^}]*outline:1px/.test(Z.ZEICHNUNG_CSS)
  && !/\.zsheet\{[^}]*border:1px/.test(Z.ZEICHNUNG_CSS));
// Das Blatt selbst bleibt derselbe eine Inhaltsbaustein
ok("blattHtml() traegt weiterhin genau die Formatklasse des Blattes",
  Z.blattHtml(W, eingaben, { format: "a3" }).html.includes('class="zsheet fmt-a3"')
  && Z.blattHtml(W, eingaben, { format: "a4" }).html.includes('class="zsheet fmt-a4"'));

// --- 7) [D-6] Eine Ableitung: Export == Modulbaustein ---------------------
ok("zeichnungHtml() des Exports ist genau zeichnungDokument() mit den Eingaben-Optionen",
  zeichnungHtml(W, eingaben) === Z.zeichnungDokument(W, eingaben, Z.optionenAusEingaben(eingaben)));
ok("zeichnungSvgText() des Exports ist genau zeichnungSvgDatei()",
  zeichnungSvgText(W, eingaben) === Z.zeichnungSvgDatei(W, eingaben, Z.optionenAusEingaben(eingaben)));
const eingA4 = JSON.parse(JSON.stringify(eingaben)); eingA4.zeichnung = { format: "a4" };
ok("gespeicherte Optionen wirken im zentralen Export", /@page\{size:A4 landscape/.test(zeichnungHtml(W, eingA4)));
const exportSrc = readFileSync(new URL("../../docs/shared/sembla-export.js", import.meta.url), "utf8");
ok("sembla-export.js delegiert an sembla-zeichnung.js (keine eigene Zeichenlogik)",
  /from "\.\/sembla-zeichnung\.js"/.test(exportSrc) && !/<polyline|<rect x=/.test(exportSrc));

// --- 8) Verdrahtung in baueDateien ---------------------------------------
const projekt = { format: "SEMBLA-Projekt", version: 2, name: "Rettungswache IW-01", wandelement: W, eingaben };
const nurZ = baueDateien(projekt, ["zeichnung"]);
ok("baueDateien(['zeichnung']) liefert SVG + HTML", nurZ.length === 2
  && nurZ.some(f => f.name === "Zeichnung_Rettungswache_IW-01.svg")
  && nurZ.some(f => f.name === "Zeichnung_Rettungswache_IW-01.html"));
ok("Dateiinhalte sind der Generator-Output (kein Stub)",
  nurZ.find(f => f.name.endsWith(".svg")).data === zeichnungSvgText(W, eingaben)
  && nurZ.find(f => f.name.endsWith(".html")).data === zeichnungHtml(W, eingaben));
ok("ohne Auswahl keine Zeichnungsdatei",
  !baueDateien(projekt, ["projekt", "stueckliste"]).some(f => /^Zeichnung_/.test(f.name)));

// --- 9) Robustheit: Alt-Bundle ohne `stuecke`/`segments` ------------------
const alt = JSON.parse(JSON.stringify(W));
for (const col of alt.tension_columns) for (const sg of col.segments) delete sg.stuecke;
const altSvg = Z.zeichnungSvg(alt, {}).svg;
ok("Alt-Bundle ohne `stuecke` zeichnet weiterhin Stangen", altSvg.includes(Z.FARBE.stange));
const alt2 = JSON.parse(JSON.stringify(W));
for (const col of alt2.tension_columns) delete col.segments;
ok("Alt-Bundle ohne `segments` zeichnet weiterhin ein Blatt",
  Z.blattHtml(alt2, eingaben, {}).html.includes("ztitleblock"));

// --- 10) Modul 7 (Oberflaeche) liest nur, schreibt nur seinen Abschnitt --
const modul = readFileSync(new URL("../../docs/zeichnung.html", import.meta.url), "utf8");
ok("Modul 7 schreibt ausschliesslich eingaben.zeichnung",
  /mergeEingaben\('zeichnung'/.test(modul)
  && !/setzeWandelement|speichereWandelement|store\.setzeAktiv\(/.test(modul));
ok("Modul 7 hat keinen eigenen Datei-Download",
  !/downloadZip|download\s*=|createObjectURL|type="file"/.test(modul));
ok("Modul 7 verweist fuer Dateien auf den zentralen Export", /Export in „Start"/.test(modul));
ok("Modul 7 nutzt den gemeinsamen Baustein (kein eigenes SVG-Zeichnen)",
  /sembla-zeichnung\.js/.test(modul) && !/<polyline|COURSE\s*\*/.test(modul));
ok("Modul 7 haengt sich als Modul 7 in die Navbar", /mountNavbar\(7\)/.test(modul));
ok("Modul 7 zeigt ohne aktives Wandelement einen Verweis auf Modul 0 (kein Demo)",
  /Kein aktives Wandelement/.test(modul) && !/function demo\(/.test(modul));
// [#79] Die Klassifikation wird angezeigt, nie gesetzt: kein Auswahlfeld, kein
// Schreibweg, keine eigene Werteliste — normalisiert wird ueber die kanonische Stelle.
ok("[#79] Modul 7 hat KEIN Bedienelement fuer die Brandschutzklassifikation",
  !/<select[^>]*brandklasse/i.test(modul) && !/<input[^>]*brandklasse/i.test(modul)
  && !/value="F30"/.test(modul));
ok("[#79] Modul 7 zeigt die Klassifikation nur an und schreibt sie nicht",
  /ovBrand/.test(modul) && /store\.normBrandklasse\(/.test(modul)
  && !/\.brandklasse\s*=/.test(modul)
  && !/mergeEingaben\('(?!zeichnung)/.test(modul));
ok("[#79] Modul 7 fuehrt keine eigene F0/F30-Liste und zeichnet die Angabe nicht selbst",
  !/BRANDKLASSEN|'F30'\s*:/.test(modul) && !/<g class="brand"/.test(modul));
// #61: keine unabhaengigen Papiermasse und kein zweiter Renderer in der Oberflaeche —
// die Papiergroesse kommt ausschliesslich aus BLATT/blattInnen().
ok("Modul 7 hat keine eigenen Papiermasse und kein eigenes Seitenverhaeltnis",
  !/\b(420|297|277|281|210|194)\b/.test(modul) && !/aspect-ratio/.test(modul));
ok("Modul 7 bezieht die Blattgeometrie aus dem gemeinsamen Baustein",
  /blattInnen/.test(modul) && /S\.blattInnen/.test(modul));
ok("Modul 7 skaliert nur den Bildschirm (ein Faktor auf das ganze Blatt)",
  /transform:scale\(var\(--zskala/.test(modul) && /Math\.min\(1,/.test(modul)
  && /transform:none/.test(modul));

// --- Reale Bodenblechteile und ihre Stoesse im Blatt (#91, [A-10]/[A-11]/[A-12]) -------
// Modul 7 ZEIGT die Zerlegung des Rechenkerns, es leitet keine eigene ab: gezeichnet wird
// ueber `bodenblechSvg()` aus `sembla-montage.js` — dieselbe Ableitung wie in Modul 5.
// Geprueft wird am echten Pfad buildWall -> zeichnungSvg und zusaetzlich, dass Vorschau,
// Druck-HTML und die eigenstaendige SVG-Datei dieselbe Zeichenkette tragen ([D-6]).
{
  // Blechrechtecke an der y-Position des Wandfusses; #5b6673 = FARBE.stahl,
  // #e8702a = STUECK_FARBE.sonder, #fff = BLECHSTOSS.farbe (Stossmarke, #91).
  const rects = (svg) => {
    const alle = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"[^>]*fill="(#5b6673|#e8702a)"/g)]
      .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], sonder: m[5] === "#e8702a" }));
    return alle.length ? alle.filter(r => r.y === alle[0].y) : [];
  };
  const stossX = (svg) => {
    const r = rects(svg);
    if (!r.length) return [];
    return stossLinien(svg).map(l => l.x);
  };
  // #91: beide Enden der Marke, damit die Blechhoehe pruefbar bleibt.
  const stossLinien = (svg) => {
    const r = rects(svg);
    if (!r.length) return [];
    return [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#fff"/g)]
      .filter(m => +m[2] === r[0].y && +m[1] === +m[3])
      .map(m => ({ x: +m[1], y0: +m[2], y1: +m[4] }))
      .sort((a, b) => a.x - b.x);
  };
  ok("[D-4] Testfarben sind die kanonischen Werte (Blech, Sonderzuschnitt, Stossmarke)",
    Z.FARBE.stahl === "#5b6673" && STUECK_FARBE.sonder === "#e8702a"
    && BLECHSTOSS.farbe === "#fff");

  // (a) Mehrteilig mit ungleichen Teilen: genau die kanonischen Stoesse, keine Modulfugen
  const WBM = buildWall("Blech-mehr", 4625, 2600, [], null,
    { blech_lengths_mm: [1250, 1125], top_connection: "blech" });
  const tM = bodenblechTeile(WBM);
  ok("[A-10] Testwand hat mehrere Bodenblechteile ungleicher Laenge (Voraussetzung)",
    tM.length > 2 && new Set(tM.map(t => t.raster_mm)).size > 1);
  const svgM = Z.zeichnungSvg(WBM, { format: "a3" }).svg;
  const rM = rects(svgM), scM = rM.length ? rM[0].w / tM[0].raster_mm : 0;
  ok("Modul 7 zeichnet je Bodenblechteil genau ein Rechteck, in Reihenfolge",
    rM.length === tM.length
    && rM.every((r, i) => Math.abs(r.x - (rM[0].x + tM[i].x0_mm * scM)) < 5e-3));
  ok("[#91] Σ gezeichnete Teilbreiten == Wandlaenge (Rastermass, nicht Bauteilmass)",
    Math.abs(rM.reduce((a, r) => a + r.w, 0) - WBM.length_mm * scM) < 5e-3
    && rM.every((r, i) => Math.abs(r.w - tM[i].raster_mm * scM) < 5e-3)
    && rM.every((r, i) => Math.abs(r.w - (tM[i].raster_mm - 2) * scM) > 1e-9));
  ok("[A-11] Stosslinien liegen genau an den kumulierten Rastermassen",
    stossX(svgM).length === bodenblechStoesse(WBM).length
    && bodenblechStoesse(WBM).every((xm, i) => Math.abs(stossX(svgM)[i] - (rM[0].x + xm * scM)) < 5e-3));
  ok("[#91] keine fiktiven gleichmaessigen Modulfugen (Stoesse != Vielfache von modul_mm)",
    bodenblechStoesse(WBM).some(xm => xm % WBM.base_plate.modul_mm !== 0));
  // #91: die Marke ist WEISS und liegt vollstaendig im Blechstreifen — sie ragt nicht
  // unter das Blech heraus und traegt damit keine Fuge vor, die es nicht gibt.
  ok("[#91] jede Stossmarke ist weiss und reicht hoechstens von Blechober- bis -unterkante",
    (() => {
      const ls = stossLinien(svgM);
      if (!ls.length || ls.length !== bodenblechStoesse(WBM).length) return false;
      const oben = rM[0].y, unten = rM[0].y + rM[0].h;
      return ls.every(l => l.y0 === oben && l.y1 > l.y0 && l.y1 <= unten + 5e-3);
    })());

  // (b) Modul 5 und Modul 7 zeigen DIESELBE Teilfolge: gleiche Anzahl, gleiche
  // Sonderarten und gleiche RELATIVE Stosslagen (die Massstaebe sind verschieden).
  const rel = (r, st) => st.map(x => (x - r[0].x) / r.reduce((a, z) => a + z.w, 0));
  const abM5 = montageAbschnitte(WBM);
  const svg5 = abschnittSvg(WBM, abM5[abM5.length - 1], 900, 430);
  const r5 = rects(svg5);
  ok("[#91] Modul 5 und Modul 7 zeigen dieselbe Teilfolge und dieselben relativen Stoesse",
    r5.length === rM.length
    && r5.every((r, i) => r.sonder === rM[i].sonder)
    && rel(r5, stossX(svg5)).every((v, i) => Math.abs(v - rel(rM, stossX(svgM))[i]) < 1e-6));

  // (c) Erzwungener Sonderzuschnitt: eigene Position, Farbe UND Schraffur
  const WBS = buildWall("Blech-sonder", 2000, 2600, [], null, { blech_lengths_mm: [1250] });
  const tS = bodenblechTeile(WBS);
  ok("[A-10] erzwungener Sonderzuschnitt am Wandende (Voraussetzung)",
    tS.length === 2 && tS[1].art === "sonder" && tS[1].x0_mm === 1250 && tS[1].raster_mm === 750);
  const svgS = Z.zeichnungSvg(WBS, { format: "a3" }).svg;
  const rS = rects(svgS);
  ok("Sonderzuschnitt steht an seiner Position und ist farblich gekennzeichnet",
    rS.length === 2 && !rS[0].sonder && rS[1].sonder
    && Math.abs(rS[1].x - (rS[0].x + rS[0].w)) < 5e-3);
  // Nicht farbliches Merkmal: senkrechte Schraffurstriche INNERHALB des Sonderteils —
  // geprueft wird Geometrie, nicht Farbe, und im Standardteil darf sie nicht vorkommen.
  const schraffur = (svg, r) =>
    [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#3a4350"/g)]
      .map(m => ({ x1: +m[1], y0: +m[2], x2: +m[3], y1: +m[4] }))
      .filter(t => t.x1 === t.x2 && t.y1 > t.y0 && t.x1 > r.x && t.x1 < r.x + r.w);
  ok("[#91] Sonderzuschnitt traegt zusaetzlich ein NICHT FARBLICHES Merkmal (Schraffur)",
    schraffur(svgS, rS[1]).length >= 2 && schraffur(svgS, rS[0]).length === 0);
  ok("[D-4] die Legende benennt Blechstoss und Bodenblech-Sonderzuschnitt in Worten",
    /Blechstoß \(Bodenblech\)/.test(Z.legendeHtml(WBS))
    && Z.legendeHtml(WBS).includes(`Bodenblech ${STUECK_LABEL.sonder} (schraffiert)`));

  // (d) EIN Zeichenpfad: Vorschau, Druck-HTML und eigenstaendige SVG-Datei sind gleich
  const blechGruppe = svgS.slice(svgS.indexOf(`fill="${STUECK_FARBE.sonder}"`) - 120,
                                svgS.indexOf(`fill="${STUECK_FARBE.sonder}"`) + 40);
  ok("[D-6] Vorschau, Druck-HTML und SVG-Datei tragen dieselbe Blech-Zeichenkette",
    blechGruppe.length > 40
    && Z.blattHtml(WBS, eingaben, { format: "a3" }).html.includes(blechGruppe)
    && Z.zeichnungDokument(WBS, eingaben, { format: "a3" }).includes(blechGruppe)
    && Z.zeichnungSvgDatei(WBS, eingaben, { format: "a3" }).includes(blechGruppe)
    && zeichnungHtml(WBS, eingaben, { format: "a3" }).includes(blechGruppe));

  // (e) Alt-Wandelement ohne `teile`: EIN durchgehendes Blech, nichts erfunden
  const WBA = JSON.parse(JSON.stringify(WBM));
  delete WBA.base_plate.teile;
  const svgA = Z.zeichnungSvg(WBA, { format: "a3" }).svg, rA = rects(svgA);
  ok("Alt-Fall: Blatt zeigt EIN durchgehendes Bodenblech ohne Stosslinie",
    rA.length === 1 && !rA[0].sonder && stossX(svgA).length === 0
    && Math.abs(rA[0].w - WBA.length_mm * scM) < 5e-3);
  ok("Alt-Fall: keine erfundene Blech-Legende (weder Stoss noch Sonderzuschnitt)",
    !/Blechstoß/.test(Z.legendeHtml(WBA)) && !/Bodenblech Sonderzuschnitt/.test(Z.legendeHtml(WBA)));
  ok("Alt-Fall: die Legende ohne Argument bleibt zeichengleich zum bisherigen Stand",
    !/Blechstoß/.test(Z.legendeHtml()) && !/Bodenblech Sonderzuschnitt/.test(Z.legendeHtml()));

  // (f) Nicht-Ziele: Masstab und Kopfblech bleiben unberuehrt
  ok("[#91] Nicht-Ziel: der Blattmasstab bleibt unveraendert",
    Z.zeichnungSvg(WBM, { format: "a3" }).masstab === Z.zeichnungSvg(WBA, { format: "a3" }).masstab);
  ok("[#91] Nicht-Ziel: das Kopfblech bleibt eine Modulfolge je Rasterspalte",
    (() => {
      const kopf = (svg) => [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)"[^>]*fill="#5b6673"/g)]
        .map(m => ({ y: +m[2], w: +m[3] })).filter(r => r.y !== rects(svg)[0].y);
      const a = kopf(svgM), b = kopf(svgA);
      return a.length > 1 && a.length === b.length
        && a.every((r, i) => Math.abs(r.w - b[i].w) < 1e-9 && Math.abs(r.y - b[i].y) < 1e-9);
    })());
}

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
