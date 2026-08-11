// Fokussierter Test: technische Zeichnung (Issue #36, Regeln [D-1] … [D-8]).
//
// Prueft den PRODUKTIONS-Baustein docs/shared/sembla-zeichnung.js und seine Verdrahtung
// im zentralen Export (sembla-export.js/baueDateien) direkt — nicht ueber Stubs:
//   * [D-1] Zeichnung entsteht allein aus dem kanonischen Wandelement,
//   * [D-2] Norm-Masstab + mm-genaues SVG (Zeichnung passt wirklich ins Blattfeld),
//   * [D-3] Bemassung (m gesamt, cm fuer Oeffnung/Bruestung/Staffelung),
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
import { semblaBomItems } from "../../docs/shared/sembla-bom.js";
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

// --- 4) [D-3] Bemassung ----------------------------------------------------
ok("Gesamtlaenge und -hoehe in m bemasst", / m<\/text>/.test(svg));
ok("Oeffnungsmasse in cm bemasst", / cm<\/text>/.test(svg));
ok("Staffelungsmass in der Staffelungsfarbe", svg.includes(Z.FARBE.staffel));
const bruestung = Z.zeichnungSvg(WF, {}).svg;
ok("Bruestungshoehe wird bemasst (Fenster mit l0 > 0)",
  (bruestung.match(/ cm<\/text>/g) || []).length >= 3);
ok("Bemassung abschaltbar", !/ m<\/text>/.test(Z.zeichnungSvg(W, { masse: false }).svg));

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

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
