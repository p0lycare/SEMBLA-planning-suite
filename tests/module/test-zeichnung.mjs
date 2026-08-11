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
//   * [D-5] Vorspann-Zielregeln nur als ungepruefte Planungshinweise,
//   * [D-6] EINE Ableitung fuer Vorschau und Export,
//   * [D-7] eingaben.zeichnung enthaelt nur Darstellungsoptionen,
//   * [D-8] Schriftfeld behauptet keinen statischen Nachweis.
//
// Checkout-autark: alle Waende kommen synthetisch aus dem Core, keine Fixture-Dateien,
// keine vertrauliche Geometrie.

import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { standardEingaben } from "../../docs/shared/storage.js";
import { einbauteile, semblaBomItems } from "../../docs/shared/sembla-bom.js";
import { stangenEnden, stangenStuecke, STUECK_FARBE, STUECK_LABEL } from "../../docs/shared/sembla-montage.js";
import * as Z from "../../docs/shared/sembla-zeichnung.js";
import { baueDateien, zeichnungHtml, zeichnungSvgText } from "../../docs/shared/sembla-export.js";

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

// [D-5] Trennung: was der Kern rechnet, steht als eingehalten; der Rest bleibt ungeprueft.
// [V-2]/[V-3] sind seit der Umstellung der Achsverteilung implementiert und regressionsgetestet,
// die beiden restlichen Zielregeln (750-mm-Oeffnung, Blech von zwei Achsen) nicht.
ok("beide offenen Vorspann-Zielregeln stehen im Blatt", Z.PLANUNGSHINWEISE.length === 2
  && Z.PLANUNGSHINWEISE.every(r => blatt.html.includes(r.text)));
ok("offene Zielregeln sind als nicht automatisch geprueft gekennzeichnet",
  /nicht automatisch geprüft/.test(blatt.html) && blatt.html.includes(Z.HINWEIS_FUSS));
ok("[V-2]/[V-3] stehen als eingehaltene Regeln, nicht mehr als Zielregeln",
  Z.GEPRUEFTE_REGELN.length === 2
  && Z.GEPRUEFTE_REGELN.every(r => blatt.html.includes(r.text))
  && blatt.html.includes(Z.GEPRUEFT_TITEL)
  && Z.PLANUNGSHINWEISE.every(r => !/\[V-2\]|\[V-3\]/.test(r.text)));
// Die eingehaltenen Regeln sind am Wandelement tatsaechlich nachweisbar — das Blatt behauptet
// nichts, was der Kern nicht liefert.
ok("[V-2] ist am gezeichneten Wandelement wirklich erfuellt",
  W.validation.ungehaltene_steine.length === 0);
// Keine bejahende Aussage ueber die OFFENEN Regeln: "erfüllt" faellt ganz weg, "eingehalten"
// kommt nur im Titel der gepruefen Liste und in der offenen Pruefaufforderung vor.
ok("Blatt behauptet nirgends, die offenen Zielregeln seien erfuellt/geprueft",
  !/erfüllt/i.test(blatt.html)
  && (blatt.html.match(/eingehalten/g) || []).length
     === (blatt.html.match(/ob die Regeln eingehalten sind/g) || []).length
       + (blatt.html.match(/eingehaltene Vorspannregeln/g) || []).length);

// [D-8] Schriftfeld: Kopfdaten aus eingaben.projekt, kein Nachweis-Ergebnis
ok("Schriftfeld nutzt die Projekt-Kopfdaten aus Modul 0",
  blatt.html.includes("Rettungswache") && blatt.html.includes("Landkreis")
  && blatt.html.includes("A-12") && blatt.html.includes("TB"));
ok("Schriftfeld nennt den Masstab", blatt.html.includes("1 : " + blatt.masstab));
// [D-3]/#64: die Einheit steht GENAU EINMAL im Schriftfeld — und nur dort.
const einheitFelder = [...blatt.html.matchAll(
  /<div class="ztb-row"><div class="k">Einheit<\/div><div class="v">([^<]*)<\/div><\/div>/g)];
ok("Schriftfeld hat genau ein Feld „Einheit“ mit dem Wert mm",
  einheitFelder.length === 1 && einheitFelder[0][1] === "mm");
ok("Wandangabe im Schriftfeld steht in mm (keine Meter-Schattenumrechnung)",
  blatt.html.includes("IW-01 · " + W.length_mm + " × " + W.height_mm));
ok("Nachweis-Feld verweist auf die separate Pruefung",
  blatt.html.includes(Z.NACHWEIS_TEXT) && /separat prüfen/.test(blatt.html));
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
ok("SVG-Datei verweist auf die separate statische Pruefung", datei.includes(Z.NACHWEIS_TEXT));
ok("SVG-Datei enthaelt die Zeichnung selbst", (datei.match(/<rect/g) || []).length >= steine);

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
// #61: keine unabhaengigen Papiermasse und kein zweiter Renderer in der Oberflaeche —
// die Papiergroesse kommt ausschliesslich aus BLATT/blattInnen().
ok("Modul 7 hat keine eigenen Papiermasse und kein eigenes Seitenverhaeltnis",
  !/\b(420|297|277|281|210|194)\b/.test(modul) && !/aspect-ratio/.test(modul));
ok("Modul 7 bezieht die Blattgeometrie aus dem gemeinsamen Baustein",
  /blattInnen/.test(modul) && /S\.blattInnen/.test(modul));
ok("Modul 7 skaliert nur den Bildschirm (ein Faktor auf das ganze Blatt)",
  /transform:scale\(var\(--zskala/.test(modul) && /Math\.min\(1,/.test(modul)
  && /transform:none/.test(modul));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
