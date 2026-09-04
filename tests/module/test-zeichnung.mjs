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
         bodenblechTeile, bodenblechStoesse, abschnittSvg, montageAbschnitte } from "../../docs/shared/sembla-montage.js";
import * as Z from "../../docs/shared/sembla-zeichnung.js";
import { baueDateien, zeichnungHtml, zeichnungSvgText } from "../../docs/shared/sembla-export.js";
// #79 NUR als Vergleichsmassstab fuer Wortlaut und Kennfarbe (Drift-Waechter). Der
// Produktivcode der Zeichnung importiert daraus AUSDRUECKLICH NICHTS — zwei
// Ausgabemodule duerfen nicht aneinanderhaengen; genau das prueft dieser Test mit.
import * as LP from "../../docs/shared/sembla-lageplan.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

// --- Referenzfaelle (synthetisch aus dem Core) -----------------------------
// W  : Wand mit Tuer, gestaffelt -> Oeffnungs-, Bruestungs- und Staffelungsmasse
const W = buildWall("IW-01", 3000, 2600, [new Opening(6, 12, 0, 10, "tuer")], null, null,
  [{ x0_mm: 1500, x1_mm: 2250, height_mm: 2000 }]);
// WF : Fenster mit Bruestung (l0 > 0)
const WF = buildWall("IW-02", 4000, 2600, [new Opening(8, 14, 4, 10, "fenster")]);
// WL : lange Wand -> groberer Masstab
const WL = buildWall("IW-03", 12000, 4000, []);

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
ok("Kopplungen/Verankerungen sind markiert", svg.includes(Z.FARBE.mutter) && /<circle/.test(svg));

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
ok("Startachse wird aus prestress abgelesen",
  Z.vorspannZeilen(W).find(r => r.label === "Startachse").wert === "1. Rasterachse");
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
  // #e8702a = STUECK_FARBE.sonder, #13202e = FARBE.kontur (Stosslinie).
  const rects = (svg) => {
    const alle = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)"[^>]*fill="(#5b6673|#e8702a)"/g)]
      .map(m => ({ x: +m[1], y: +m[2], w: +m[3], sonder: m[4] === "#e8702a" }));
    return alle.length ? alle.filter(r => r.y === alle[0].y) : [];
  };
  const stossX = (svg) => {
    const r = rects(svg);
    if (!r.length) return [];
    return [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="[-\d.]+" y2="[-\d.]+" stroke="#13202e"/g)]
      .filter(m => +m[2] === r[0].y).map(m => +m[1]).sort((a, b) => a - b);
  };
  ok("[D-4] Testfarben sind die kanonischen Werte (Blech, Sonderzuschnitt, Kontur)",
    Z.FARBE.stahl === "#5b6673" && STUECK_FARBE.sonder === "#e8702a"
    && Z.FARBE.kontur === "#13202e");

  // (a) Mehrteilig mit ungleichen Teilen: genau die kanonischen Stoesse, keine Modulfugen
  const WBM = buildWall("Blech-mehr", 4625, 2600, [], null, { blech_lengths_mm: [1250, 1125] });
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
