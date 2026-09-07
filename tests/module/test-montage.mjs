// Fokussierter Test: ereignis-/baugruppenbasierte Montageanleitung (Issue #23).
//
// Prueft die DOM-freie Ableitung (docs/shared/sembla-montage.js) und den ECHTEN
// Export-Produktpfad (montageHtml/baueDateien aus docs/shared/sembla-export.js) —
// kein Stub, kein Hilfs-Nachbau. Der Vorschau-Produktpfad von Modul 5 und die
// Deckungsgleichheit Vorschau <-> Export liegen in smoke_montage.mjs.
//
// Schwerpunkte:
//   * Abschnitte aus den REALEN tension_columns[].segments + Wandkontur
//     (keine globale Stangenhoehe, keine Annahme gleicher Segmentzahl/-hoehe),
//   * durchgehende, lueckenlose Steinreihen-Nummerierung 1..lagen,
//   * Ereignis + Steinreihenbereich je Abschnitt,
//   * gestaffelte Waende: getrennte Stangenendhoehen/Wandabschluesse,
//   * Kopplungsregel: Ereignis bei z liegt nach floor(z/200) Reihen und vor der naechsten,
//     Stange ragt sichtbar ueber die letzte dargestellte Reihe,
//   * wenige, paginierte A4-Seiten statt einer Seite pro Steinreihe,
//   * Schnitt 0 nach [A-9]: steinfreie Fuss-Baugruppe als zusaetzliche erste
//     Darstellung, streng additiv (die regulaeren Abschnitte bleiben unveraendert),
//   * global konstanter Massstab/Viewport ueber ALLE Baugruppenbilder.
//
// Testwaende sind synthetisch aus dem Core gebaut -> checkout-autark, keine realen
// oder gitignorierten Geometrien.

import { readFileSync } from "node:fs";
import { buildWall, Opening } from "../../docs/shared/sembla-core.js";
import { standardEingaben } from "../../docs/shared/storage.js";
import {
  montageEreignisse, montageAbschnitte, abschnittSvg, konturSvg,
  montageSeiten, montageSeitenHtml, montageDokument, posCm, UEBERSTAND_MM,
  STUECK_FARBE, STUECK_LABEL, stueckFarbe, stueckArt, stangenEnden, stangenStuecke,
  topLagen, oberkantenAbschnitte, bodenblechTeile, bodenblechStoesse,
} from "../../docs/shared/sembla-montage.js";
import { semblaBom } from "../../docs/shared/sembla-bom.js";
import { FARBE as Z_FARBE } from "../../docs/shared/sembla-zeichnung.js";
import { montageHtml, baueDateien } from "../../docs/shared/sembla-export.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

// --- Testwaende ------------------------------------------------------------
// (1) Rechteckwand, (2) gestaffelte Wand wie die Musterwand AWG (3,00 x 2,60 m,
// ohne Oeffnungen, drei Hoehenstufen -> Stangenendhoehen 2600/2000/1400),
// (3) Tuerwand (Segment oberhalb der Oeffnung -> neue Stange mitten in der Wand).
// Alle drei sind ausdrueckliche KOPFBLECH-Faelle: ihre Abschluss-Ereignisse, `anker_oben` und
// die Seitentexte haengen am oberen Anschluss. `top_connection` wird deshalb AUSGESPROCHEN und
// nicht dem allgemeinen Default ueberlassen.
const PS_BLECH = { top_connection: "blech" };
const WR = buildWall("IW-Rechteck", 3000, 2600, [], null, PS_BLECH);
const WAWG = buildWall("Musterwand AWG", 3000, 2600, [], null, PS_BLECH,
  [{ x0_mm: 1500, x1_mm: 2250, height_mm: 2000 }, { x0_mm: 2250, x1_mm: 3000, height_mm: 1400 }]);
const WT = buildWall("Tuerwand", 3000, 2600, [new Opening(6, 12, 0, 10, "tuer")], null, PS_BLECH);
// (4)/(5) Waende MIT bestimmtem Reststueck ([Z-6]): einmal reines Rechteck (alle Segmente mit
// Oberkantenbezug), einmal mit Fenster (Bruestung/Sturz OHNE Oberkantenbezug daneben) — nur so
// ist die Fallunterscheidung des Ueberstands ueberhaupt pruefbar.
const PS_REST = { rod_lengths_mm: [1000], rod_rest_mm: 100, rod_overhang_mm: 10 };
const WU5 = buildWall("IW-Reststueck", 2000, 2600, [], null, PS_REST);
const WFB = buildWall("IW-Rest-Fenster", 3000, 2600, [new Opening(6, 10, 4, 10, "fenster")], null, PS_REST);

const eingaben = standardEingaben();
eingaben.projekt.name = "Rettungswache";
eingaben.projekt.plan_nr = "A-12";

const alleR = montageAbschnitte(WR), alleA = montageAbschnitte(WAWG), alleT = montageAbschnitte(WT);
// Schnitt 0 ([A-9]) ist additiv vorangestellt; die regulaeren Baugruppenabschnitte
// sind die uebrigen — alle Alt-Zusicherungen gelten unveraendert fuer diese.
const echte = abs => abs.filter(a => a.art !== "schnitt0");
const absR = echte(alleR), absA = echte(alleA), absT = echte(alleT);
const absU5 = echte(montageAbschnitte(WU5)), absFB = echte(montageAbschnitte(WFB));

// --- 1) Erste Darstellung: Bodenblech + erste Stangen + mehrere Reihen -----
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA]]) {
  const a1 = abs[0], ev = a1.ereignisse[0];
  const fussK = new Set(w.tension_columns.filter(c => (c.segments || []).some(s => s.z0_mm === 0)).map(c => c.k));
  ok(`${name}: Abschnitt 1 beginnt mit dem Fuss-Ereignis (Bodenblech, erste Stangen)`,
    ev.art === "fuss" && ev.z_mm === 0 && /Bodenblech/.test(ev.text) && /Sechskantschraube/.test(ev.text));
  ok(`${name}: Abschnitt 1 nennt ALLE Fussstraenge`,
    ev.straenge.length === fussK.size && ev.straenge.every(s => fussK.has(s.k)));
  ok(`${name}: Abschnitt 1 zeigt mehrere erste Steinreihen`,
    a1.reihen.von === 1 && a1.reihen.bis >= 2);
  const svg = abschnittSvg(w, a1, 900, 430);
  ok(`${name}: Abschnitt-1-Bild zeigt Bodenblech, Stangen und Reihennummern`,
    svg.includes("#5b6673") && svg.includes("#1f6feb")
    && new RegExp(`>${a1.reihen.von}</text>`).test(svg) && new RegExp(`>${a1.reihen.bis}</text>`).test(svg));
}

// --- 2) Durchgehende, lueckenlose Steinreihen-Nummerierung -----------------
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA], ["Tuer", WT, absT]]) {
  const reihen = abs.flatMap(a => { const r = []; for (let i = a.reihen.von; i <= a.reihen.bis; i++) r.push(i); return r; });
  ok(`${name}: Reihenbereiche decken 1..${w.lagen} lueckenlos und ohne Ueberlappung ab`,
    reihen.length === w.lagen && reihen.every((r, i) => r === i + 1));
  ok(`${name}: Reihenbereiche sind aufsteigend und anschliessend`,
    abs.every((a, i) => i === 0 ? a.reihen.von === 1 : a.reihen.von === abs[i - 1].reihen.bis + 1));
  // Jedes Baugruppenbild beschriftet genau die Reihen seines Abschnitts
  const alleNummern = abs.every(a => {
    const svg = abschnittSvg(w, a, 900, 430);
    const nums = [...svg.matchAll(/font-weight="600"[^>]*>(\d+)<\/text>/g)].map(m => +m[1]).sort((x, y) => x - y);
    const soll = []; for (let i = a.reihen.von; i <= a.reihen.bis; i++) soll.push(i);
    return nums.join(",") === soll.join(",");
  });
  ok(`${name}: jedes Baugruppenbild nummeriert genau seine Steinreihen`, alleNummern);
}

// --- 3) Ableitung aus den REALEN Segmenten je Strang -----------------------
// AWG: Straenge haben unterschiedlich viele Stangen (2 und 3) und drei Endhoehen.
const stangenZahlen = new Set(WAWG.tension_columns.flatMap(c => c.segments.map(s => s.gewindestangen)));
const endHoehen = new Set(WAWG.tension_columns.flatMap(c => c.segments.map(s => s.z1_mm)));
ok("AWG-Testwand hat unterschiedliche Stangenzahlen je Strang (Voraussetzung des Tests)",
  stangenZahlen.size > 1 && endHoehen.size === 3);
// Manipulierte Stangenzahl im ERSTEN Strang darf die Ableitung der anderen nicht verschieben
const wManip = JSON.parse(JSON.stringify(WAWG));
wManip.tension_columns[0].gewindestangen = 99;
ok("kein Hochrechnen aus tension_columns[0]: Aggregat des ersten Strangs bleibt wirkungslos",
  JSON.stringify(montageAbschnitte(wManip).map(a => [a.reihen, a.ereignisse.map(e => e.art + e.z_mm)]))
  === JSON.stringify(alleA.map(a => [a.reihen, a.ereignisse.map(e => e.art + e.z_mm)])));
// Ein zusaetzliches Segment eines einzelnen Strangs erzeugt ein zusaetzliches Ereignis
const wExtra = JSON.parse(JSON.stringify(WR));
wExtra.tension_columns[2].segments = [{ z0_mm: 0, z1_mm: 1000, lage0: 0, lage1: 5, gewindestangen: 1, anker_unten: "bodenblech", anker_oben: "spannplatte" },
  { z0_mm: 1000, z1_mm: 2600, lage0: 5, lage1: 13, gewindestangen: 2, anker_unten: "spannplatte", anker_oben: "kopfblech" }];
const evExtra = montageEreignisse(wExtra);
ok("Segmente eines EINZELNEN Strangs erzeugen eigene Ereignisse (Zwischenabschluss + Neustart)",
  evExtra.some(e => e.art === "abschluss" && e.z_mm === 1000 && e.straenge.length === 1)
  && evExtra.some(e => e.art === "neustart" && e.z_mm === 1000 && e.straenge.length === 1));
const src = readFileSync(new URL("../../docs/shared/sembla-montage.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok("sembla-montage.js greift nirgends auf einen Repraesentanten-Strang zu",
  !/tension_columns\s*\[\s*0\s*\]/.test(src) && !/tc\s*\[\s*0\s*\]/.test(src));
ok("sembla-montage.js ist DOM-frei", !/\bdocument\b/.test(src) && !/\bwindow\b/.test(src));

// --- 4) Ereignis + Steinreihenbereich je Abschnitt -------------------------
const ARTEN = new Set(["fuss", "neustart", "kopplung", "abschluss"]);
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA], ["Tuer", WT, absT]]) {
  ok(`${name}: jeder Abschnitt nennt Ereignis(se) mit Hoehe und Straengen`,
    abs.every(a => a.ereignisse.length >= 1 && a.ereignisse.every(e =>
      ARTEN.has(e.art) && e.straenge.length >= 1 && e.text.includes(posCm(e.z_mm)))));
  ok(`${name}: jeder Abschnitt nennt seinen Steinreihenbereich`,
    abs.every(a => a.reihen_text === (a.reihen.von === a.reihen.bis
      ? "Reihe " + a.reihen.von : "Reihen " + a.reihen.von + "–" + a.reihen.bis)));
  const seiten = montageSeiten(w, eingaben);
  ok(`${name}: jede Abschnittsseite zeigt Ereignis-Label und Reihenbereich`,
    seiten.filter(s => s.art === "abschnitt").every((s, i) => s.html.includes(abs[i].reihen_text)
      && abs[i].ereignisse.every(e => s.html.includes(posCm(e.z_mm)))));
}

// --- 5) Gestaffelte Bereiche werden korrekt getrennt -----------------------
const abschluesse = absA.flatMap(a => a.ereignisse.filter(e => e.art === "abschluss").map(e => ({ nr: a.nr, z: e.z_mm, e })));
ok("AWG: drei getrennte Abschluss-Ereignisse (140/200/260 cm)",
  abschluesse.length === 3 && abschluesse.map(x => x.z).join(",") === "1400,2000,2600");
ok("AWG: die drei Abschluesse liegen in verschiedenen Abschnitten",
  new Set(abschluesse.map(x => x.nr)).size === 3);
ok("AWG: je Abschluss nur die Straenge der jeweiligen Hoehenstufe",
  abschluesse.every(x => x.e.straenge.every(s => s.seg_z1_mm === x.z)
    && x.e.straenge.length === WAWG.tension_columns.filter(c => c.segments.some(s => s.z1_mm === x.z)).length));
ok("AWG: Kopplung auf 110 cm betrifft alle Straenge, Kopplung auf 220 cm nur die hohen",
  (() => {
    const k110 = absA.flatMap(a => a.ereignisse).find(e => e.art === "kopplung" && e.z_mm === 1100);
    const k220 = absA.flatMap(a => a.ereignisse).find(e => e.art === "kopplung" && e.z_mm === 2200);
    return k110 && k220 && k110.straenge.length === WAWG.tension_columns.length
      && k220.straenge.length < k110.straenge.length
      && k220.straenge.every(s => s.seg_z1_mm === 2600);
  })());
// Stufenweise abgeschlossene Straenge werden erst im Abschluss-Abschnitt gedeckelt
const abA3 = absA.find(a => a.ereignisse.some(e => e.art === "abschluss" && e.z_mm === 1400));
ok("AWG: 140-cm-Straenge im Abschluss-Abschnitt mit Kopfblech dargestellt",
  abA3.straenge.filter(s => s.seg_z1_mm === 1400).every(s => s.abgeschlossen && s.anker_oben === "kopfblech")
  && abschnittSvg(WAWG, abA3, 900, 430).includes("Abschluss 140 cm"));
// Tuerwand: neue Stange oberhalb der Oeffnung als eigenes Ereignis
const neustart = absT.flatMap(a => a.ereignisse).filter(e => e.art === "neustart");
ok("Tuerwand: neue Stange ueber der Oeffnung als eigenes Ereignis (Spannplatte)",
  neustart.length === 1 && neustart[0].z_mm === 2000
  && neustart[0].straenge.every(s => s.anker === "spannplatte") && /Spannplatte/.test(neustart[0].text));

// --- 6) Wenige, paginierte A4-Seiten --------------------------------------
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA], ["Tuer", WT, absT]]) {
  const seiten = montageSeiten(w, eingaben);
  ok(`${name}: Seitenzahl = Uebersicht + Abschnitte und deutlich unter der Reihenzahl`,
    seiten.length === echte(montageAbschnitte(w)).length + 1 + (seiten.some(s => s.art === "schnitt0") ? 1 : 0)
    && seiten.length < w.lagen);
  const doc = montageDokument(w, eingaben);
  ok(`${name}: A4-Paginierung im Dokument, keine Seite pro Steinreihe`,
    /@page\{size:A4 portrait/.test(doc) && /page-break-after:always/.test(doc)
    && (doc.match(/class="mseite"/g) || []).length === seiten.length && !/pcourse/.test(doc));
}
// Keine leere Zusatzseite nur fuer den oberen Abschluss
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA], ["Tuer", WT, absT]]) {
  const letzter = abs[abs.length - 1];
  ok(`${name}: oberer Abschluss steckt im letzten Abschnitt (keine leere Zusatzseite)`,
    letzter.reihen.bis === w.lagen && letzter.reihen.von <= w.lagen
    && letzter.ereignisse.some(e => e.art === "abschluss" && e.z_mm === w.height_mm));
  ok(`${name}: kein Abschnitt ohne Steinreihen`, abs.every(a => a.reihen.bis >= a.reihen.von));
}

// --- 7) Kopplungsregel + Stangenueberstand (bestaetigte Fachregel) --------
const k1100 = absR.flatMap(a => a.ereignisse).find(e => e.art === "kopplung" && e.z_mm === 1100);
ok("Kopplung bei 1100 mm: nach Reihe 5, vor Reihe 6",
  k1100 && k1100.reihe_vor === 5 && /nach Reihe 5 und <b>vor<\/b> Reihe 6/.test(k1100.text));
ok("Kopplung bei 1100 mm eroeffnet den Abschnitt, der mit Reihe 6 beginnt",
  absR.some(a => a.reihen.von === 6 && a.ereignisse.includes(k1100))
  && absR.some(a => a.reihen.bis === 5 && !a.ereignisse.includes(k1100)));
// Randfall: Ereignishoehe genau auf einer Reihengrenze (Stangenlaenge 1200 mm)
const W12 = buildWall("Rod1200", 3000, 2600, [], null, { rod_mm: 1200 });
const abs12 = echte(montageAbschnitte(W12));
const k1200 = abs12.flatMap(a => a.ereignisse).find(e => e.art === "kopplung" && e.z_mm === 1200);
const ab12 = abs12.find(a => a.ereignisse.includes(k1200));
ok("Randfall 1200 mm (genau Reihengrenze): nach Reihe 6, vor Reihe 7",
  k1200 && k1200.reihe_vor === 6 && /nach Reihe 6 und <b>vor<\/b> Reihe 7/.test(k1200.text)
  && ab12 && ab12.reihen.von === 7
  && abs12.some(a => a.reihen.bis === 6 && !a.ereignisse.includes(k1200)));
ok("Randfall 1200 mm: Stange endet genau auf der Reihengrenze und wird sichtbar verlaengert dargestellt",
  abs12[0].z_bis_mm === 1200 && abs12[0].straenge.every(s =>
    s.z_oben_real_mm === 1200 && s.zeichen_oben_mm === 1200 + UEBERSTAND_MM));
// Stange ragt sichtbar ueber die letzte dargestellte Reihe hinaus
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA], ["Tuer", WT, absT]]) {
  const weiter = abs.filter(a => a.straenge.some(s => !s.abgeschlossen));
  ok(`${name}: weiterlaufende Stangen ragen ueber die letzte dargestellte Reihe`,
    weiter.length > 0 && weiter.every(a => a.straenge.filter(s => !s.abgeschlossen)
      .every(s => s.zeichen_oben_mm > a.z_bis_mm)));
  ok(`${name}: Ueberstand mindestens ${UEBERSTAND_MM} mm oder bis zum echten Stangenende`,
    weiter.every(a => a.straenge.filter(s => !s.abgeschlossen).every(s =>
      s.zeichen_oben_mm >= Math.min(a.z_bis_mm + UEBERSTAND_MM, s.z_oben_real_mm)
      && s.zeichen_oben_mm === Math.max(s.z_oben_real_mm, a.z_bis_mm + UEBERSTAND_MM))));
  // Geometrie im SVG: Stangenende liegt oberhalb (kleineres y) der Oberkante der letzten Reihe
  const a = weiter[0];
  const svg = abschnittSvg(w, a, 900, 430);
  const yStange = [...svg.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1" y2="([\d.]+)" stroke="#1f6feb"/g)].map(m => +m[2]);
  const yReihe = [...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)"[^>]*stroke="#7d848c"/g)].map(m => +m[1]);
  ok(`${name}: im Bild endet die Stange oberhalb der obersten Steinreihe`,
    yStange.length && yReihe.length && Math.min(...yStange) < Math.min(...yReihe));
  ok(`${name}: offenes Stangenende markiert (Kopplung folgt)`, svg.includes('fill="#fff" stroke="#1f6feb"'));
}
// Ein abgeschlossener Strang endet GENAU an der Materialoberkante seines Segments:
// Segmentende + `ueberstand_mm`. Der Ueberstand ist nach [Z-6] ausschliesslich an Segmenten
// MIT Oberkantenbezug bestimmt (dort > 0, weil dort das Reststueck sitzt); Bruestung und Sturz
// an einer Oeffnung haben keinen und enden bit-genau am Segmentende. Beides steht hier in
// EINER Zusicherung, damit kein Fall durch eine „>=„-Schranke rutscht.
const segZu = (w, s) => (w.tension_columns.find(c => c.k === s.k) || { segments: [] })
  .segments.find(g => g.z0_mm === s.z_unten_mm && g.z1_mm === s.seg_z1_mm);
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA], ["Tuer", WT, absT],
  ["Reststueck", WU5, absU5], ["Reststueck+Fenster", WFB, absFB]]) {
  const zu = abs.flatMap(a => a.straenge).filter(s => s.abgeschlossen);
  ok(`${name}: abgeschlossene Straenge enden genau an der Materialoberkante ([Z-6])`,
    zu.length > 0 && zu.every(s => {
      const g = segZu(w, s);
      return !!g && s.zeichen_oben_mm === s.seg_z1_mm + (g.ueberstand_mm || 0);
    }));
}
// Die Fallunterscheidung selbst muss an der gemischten Wand wirklich vorkommen, sonst
// pruefte die Zusicherung oben nur einen der beiden Faelle.
{
  const zu = absFB.flatMap(a => a.straenge).filter(s => s.abgeschlossen);
  const mitOk = zu.filter(s => (segZu(WFB, s).ueberstand_mm || 0) > 0);
  const ohneOk = zu.filter(s => !(segZu(WFB, s).ueberstand_mm || 0));
  ok("gemischte Wand enthaelt Segmente MIT und OHNE Oberkantenbezug (Voraussetzung)",
    mitOk.length > 0 && ohneOk.length > 0);
  ok("[Z-6] nur Segmente mit Oberkantenbezug ragen ueber ihr Segmentende hinaus",
    mitOk.every(s => s.zeichen_oben_mm > s.seg_z1_mm)
    && ohneOk.every(s => s.zeichen_oben_mm === s.seg_z1_mm));
}

// --- 8) Wand-/Projektbezug, Orientierung, Bauteilpositionen ---------------
const seitenR = montageSeiten(WR, eingaben);
ok("jede Seite tragt Projekt- und Wandbezug",
  seitenR.every(s => s.html.includes("Rettungswache") && s.html.includes("IW-Rechteck"))
  && seitenR.every(s => /Seite \d+ von \d+/.test(s.html)));
ok("Uebersichtsseite: Masse, Reihen, Straenge, Ablauftabelle, Kurz-Stueckliste",
  /Raster/.test(seitenR[0].html) && /13 Steinreihen/.test(seitenR[0].html)
  && /Ablauf der Baugruppenabschnitte/.test(seitenR[0].html)
  && /Stückliste \(Kurzform\)/.test(seitenR[0].html) && /Stein i3/.test(seitenR[0].html));
ok("Abschnittsseiten: Orientierung + Bauteilpositionen der Straenge",
  seitenR.filter(s => s.art === "abschnitt").every((s, i) => /Blick von vorne, x ab links/.test(s.html)
    && /Bauteilpositionen dieses Abschnitts/.test(s.html)
    && absR[i].straenge.every(st => s.html.includes(posCm(st.x_mm)))));
ok("Anschluss oben je Strang benannt (Kopfblech/Spannplatte/Kopplung)",
  /Kopfblech \+ Spannmutter/.test(seitenR[seitenR.length - 1].html)
  && /Kopplungsmutter \(Stange läuft weiter\)/.test(seitenR[1].html));
ok("Uebersichtsseite nennt die bestaetigte Kopplungsregel",
  /vor<\/b> der Steinreihe/.test(seitenR[0].html));
ok("Wandueberblick zeigt Reihennummern und den hervorgehobenen Bereich",
  konturSvg(WR, absR[1], 900, 210).includes("hervorgehoben: " + absR[1].reihen_text));

// --- 9) Export-Produktpfad ------------------------------------------------
ok("montageHtml ist selbsttragendes HTML ohne externe Nachladepfade",
  /^<!DOCTYPE html>/.test(montageHtml(WAWG, eingaben)) && /<\/html>$/.test(montageHtml(WAWG, eingaben))
  && !/<script/i.test(montageHtml(WAWG, eingaben)) && !/https?:\/\//.test(montageHtml(WAWG, eingaben)));
ok("montageHtml == montageDokument (Export nutzt die geteilte Ableitung, kein Stub)",
  montageHtml(WAWG, eingaben) === montageDokument(WAWG, eingaben)
  && montageHtml(WAWG, eingaben).includes(montageSeitenHtml(WAWG, eingaben)));
const projekt = { format: "SEMBLA-Projekt", version: 2, name: "Rettungswache AWG", wandelement: WAWG, eingaben };
const nurMontage = baueDateien(projekt, ["montage"]);
ok("baueDateien(['montage']) liefert genau eine HTML-Datei",
  nurMontage.length === 1 && nurMontage[0].name === "Montageanleitung_Rettungswache_AWG.html");
ok("Dateiinhalt ist der Generator-Output inkl. Projektbezug aus den Eingaben",
  nurMontage[0].data === montageHtml(WAWG, eingaben) && nurMontage[0].data.includes("Rettungswache"));
ok("Projektname aus eingaben.projekt schlaegt im Export durch",
  !baueDateien({ ...projekt, eingaben: standardEingaben() }, ["montage"])[0].data.includes("Rettungswache"));
const exportSrc = readFileSync(new URL("../../docs/shared/sembla-export.js", import.meta.url), "utf8");
ok("sembla-export.js hat keine eigene Montage-Zeichenlogik mehr (kein Duplikat)",
  /from "\.\/sembla-montage\.js"/.test(exportSrc)
  && !/_courseStrip/.test(exportSrc) && !/vorspannSteps/.test(exportSrc));

// --- 10) Schnitt 0: steinfreie Fuss-Baugruppe, additiv ([A-9]) ------------
for (const [name, w, alle, abs] of [["Rechteck", WR, alleR, absR], ["AWG", WAWG, alleA, absA], ["Tuer", WT, alleT, absT]]) {
  const s0 = alle[0];
  ok(`${name}: Schnitt 0 ist die ALLERERSTE Darstellung`,
    s0.art === "schnitt0" && s0.nr === 0 && alle.slice(1).every(a => a.art !== "schnitt0"));
  ok(`${name}: Schnitt 0 fuehrt keine Steinreihen`,
    s0.reihen.bis < s0.reihen.von && s0.z_von_mm === 0 && s0.z_bis_mm === 0 && s0.reihen_text === "ohne Steinreihen");
  // Nur die Fuss-Segmente, nur die ERSTE Stange je Strang
  const fussSeg = w.tension_columns.flatMap(c => c.segments.filter(sg => sg.z0_mm === 0).map(sg => ({ c, sg })));
  ok(`${name}: Schnitt 0 zeigt genau die Straenge auf dem Bodenblech`,
    s0.straenge.length === fussSeg.length
    && s0.straenge.every(st => st.z_unten_mm === 0 && st.anker_unten === "bodenblech"));
  ok(`${name}: Schnitt 0 zeigt je Strang nur die erste Gewindestange`,
    s0.straenge.every(st => {
      const sg = fussSeg.find(x => x.c.x_mm === st.x_mm).sg;
      const ersteOK = sg.gewindestangen > 1 ? Math.min(sg.z1_mm, w.rod_mm) : sg.z1_mm;
      return st.z_oben_real_mm === ersteOK && st.zeichen_oben_mm === ersteOK && st.kopplungen_mm.length === 0;
    }));
  ok(`${name}: Schnitt 0 nennt nur Fuss-Ereignisse`,
    s0.ereignisse.length >= 1 && s0.ereignisse.every(e => e.art === "fuss" && e.z_mm === 0));
  // Bild: Bodenblech + Stangen, aber KEINE Steine, KEINE Reihennummern, KEINE Kontur/Oeffnung
  const svg0 = abschnittSvg(w, s0, 900, 430);
  ok(`${name}: Schnitt-0-Bild zeigt Bodenblech und Gewindestangen`,
    svg0.includes(`fill="#5b6673"`) && /stroke="#1f6feb" stroke-width="2.4"/.test(svg0)
    && /Bodenblech und erste Gewindestangen/.test(svg0));
  ok(`${name}: Schnitt-0-Bild zeigt KEINE Steine, Reihennummern, Kontur oder Oeffnungen`,
    !/stroke="#7d848c"/.test(svg0)              // Steinreihen dieses Abschnitts
    && !/fill="#e9ebee"/.test(svg0)             // bereits montierte Reihen
    && !/font-weight="600"/.test(svg0)          // Reihennummern
    && !/<polyline/.test(svg0)                  // Wandkontur
    && !/stroke-dasharray="5 4"/.test(svg0));   // Oeffnungen
  // ADDITIV: die regulaeren Abschnitte sind unveraendert (Ereignisse bleiben dort)
  ok(`${name}: Abschnitt 1 behaelt sein Fuss-Ereignis (nichts herausgezogen)`,
    abs[0].ereignisse.some(e => e.art === "fuss" && e.z_mm === 0)
    && s0.ereignisse.every(e => abs[0].ereignisse.includes(e)));
  ok(`${name}: Abschnitt 1 bleibt selbsterklaerend (Titel, Reihen, Ereignistext)`,
    abs[0].nr === 1 && abs[0].reihen.von === 1 && /^Abschnitt 1 · /.test(abs[0].titel)
    && abs[0].ereignisse[0].text.length > 0);
  // Seiten: Schnitt 0 als eigene erste Abschnittsseite, danach die Abschnitte
  const seiten = montageSeiten(w, eingaben);
  ok(`${name}: Seite 2 ist Schnitt 0, danach folgen die Abschnitte`,
    seiten[0].art === "uebersicht" && seiten[1].art === "schnitt0"
    && seiten.slice(2).every(s => s.art === "abschnitt")
    && seiten.length === alle.length + 1);
  ok(`${name}: Schnitt-0-Seite nennt sich so und fuehrt keine Steinreihen`,
    /Schnitt 0/.test(seiten[1].html) && /keine Steinreihen<\/b>/.test(seiten[1].html)
    && !/Danach montieren/.test(seiten[1].html));
  ok(`${name}: Uebersichtstabelle listet Schnitt 0 ohne Reihenbereich`,
    /<td>Schnitt 0<\/td>/.test(seiten[0].html) && /<td>—<\/td>/.test(seiten[0].html));
  ok(`${name}: Seitenzaehlung bleibt luecken- und dublettenfrei`,
    seiten.every((s, i) => s.html.includes(`Seite ${i + 1} von ${seiten.length}`)));
}
// Sicherer Leerfall: ohne Fussereignis KEIN Schnitt 0 und keine leere Seite
const wOhneFuss = JSON.parse(JSON.stringify(WR));
for (const c of wOhneFuss.tension_columns)
  c.segments = c.segments.map(sg => ({ ...sg, z0_mm: 200, anker_unten: "spannplatte" }));
const absOhneFuss = montageAbschnitte(wOhneFuss);
ok("ohne Fussereignis entsteht KEIN Schnitt 0 (sicherer Leerfall, keine leere Seite)",
  absOhneFuss.every(a => a.art !== "schnitt0")
  && montageSeiten(wOhneFuss, eingaben).every(s => s.art !== "schnitt0"));

// --- 11) Global konstanter Massstab/Viewport ueber alle Bilder ------------
// Bezugspunkt: Oberkante von Steinreihe 1 (identische Weltkoordinate 200 mm) muss in
// JEDEM Baugruppenbild auf derselben y-Position liegen; ebenso Bodenblech und Skalierung.
const yBoden = svg => +(/<rect x="[\d.]+" y="([\d.]+)"[^>]*fill="#5b6673"/.exec(svg) || [])[1];
// Das Bodenblech ist seit der Core-Zerlegung eine TEILFOLGE ([A-10]): die Skalierung
// steckt in der SUMME der Teilbreiten, nicht in der ersten. Gefiltert wird auf die
// y-Position des Wandfusses, damit das Farbfeld der Legende nicht mitzaehlt.
const bodenRects = svg => {
  const y = yBoden(svg);
  return [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*fill="(?:#5b6673|#e8702a)"/g)]
    .filter(m => +m[2] === y);
};
const bodenBreite = svg => bodenRects(svg).reduce((a, m) => a + +m[3], 0);
for (const [name, w, alle] of [["Rechteck", WR, alleR], ["AWG", WAWG, alleA], ["Tuer", WT, alleT]]) {
  const bilder = alle.map(a => abschnittSvg(w, a, 900, 430));
  const yB = bilder.map(yBoden), bB = bilder.map(bodenBreite);
  ok(`${name}: Wandfuss liegt in ALLEN Bildern auf derselben y-Position`,
    yB.every(v => isFinite(v)) && new Set(yB.map(v => v.toFixed(4))).size === 1);
  ok(`${name}: Massstab (Bodenblechbreite = Wandlaenge) ist in ALLEN Bildern identisch`,
    bB.every(v => isFinite(v)) && new Set(bB.map(v => v.toFixed(4))).size === 1);
  const yOben = alle.map(a => a.z_top_mm);
  ok(`${name}: alle Abschnitte tragen denselben globalen Viewport-Oberrand`,
    yOben.every(v => v === yOben[0]) && yOben[0] >= w.height_mm);
  // EINE gemeinsame Abbildung Y(z) = yBoden − z·sc: die Oberkante der jeweils obersten
  // Reihe muss in jedem Bild exakt auf ihrer echten Welthoehe liegen (kein Verschieben/Zoomen).
  const sc = bB[0] / w.length_mm, C = w.course_mm || 200;
  const treffer = alle.filter(a => a.art !== "schnitt0").map(a => {
    const ys = [...abschnittSvg(w, a, 900, 430)
      .matchAll(/<rect x="[\d.]+" y="([\d.]+)"[^>]*stroke="#7d848c"/g)].map(m => +m[1]);
    return Math.abs(Math.min(...ys) - (yB[0] - a.reihen.bis * C * sc)) < 1e-6;
  });
  ok(`${name}: Steinreihen liegen in JEDEM Bild auf ihrer echten Welthoehe (eine Abbildung)`,
    treffer.length > 1 && treffer.every(Boolean));
  // Der Fortschritt darf die Wanddarstellung nicht wachsen lassen: gleiche Reihe -> gleiche Hoehe
  const hoehe = a => { const m = [...abschnittSvg(w, a, 900, 430).matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)"[^>]*stroke="#7d848c"/g)].map(x => +x[1]); return m.length ? m[0] : null; };
  const hs = alle.map(hoehe).filter(v => v != null);
  ok(`${name}: eine Steinreihe ist in jedem Abschnitt gleich hoch gezeichnet`,
    hs.length > 1 && new Set(hs.map(v => v.toFixed(4))).size === 1);
}
// Staffelwand: der globale Oberrand richtet sich nach der HOECHSTEN Stelle, nicht nach der Stufe
ok("AWG (Staffelwand): globaler Oberrand deckt die volle Wandhoehe ab",
  alleA.every(a => a.z_top_mm >= WAWG.height_mm)
  && alleA.every(a => a.z_top_mm >= a.stange_oberkante_mm));

// --- 12) Zuschnitt im Baugruppenbild: EIN Farbschluessel fuer Modul 1/5/7 ([D-4]) ---
// Testwand mit allen drei Stueckarten: Standardlaengen 100/50 cm, Reststueck 30 cm,
// Ueberstand 1 cm -> 2610 mm zu bestuecken = 100 + 100 + 31 (Sonder) + 30 (Rest).
const WZ = buildWall("Zuschnitt", 3000, 2600, [], null,
  { rod_lengths_mm: [1000, 500], rod_rest_mm: 300, rod_overhang_mm: 10 });
const alleZ = montageAbschnitte(WZ);
const arten = new Set(WZ.tension_columns.flatMap(c => c.segments).flatMap(g => g.stuecke || []).map(p => p.art));
ok("Testwand enthaelt alle drei Stueckarten (Voraussetzung des Tests)",
  arten.has("standard") && arten.has("sonder") && arten.has("rest"));

ok("Farbschluessel hat genau die drei Stueckarten mit unterschiedlichen Farben",
  Object.keys(STUECK_FARBE).sort().join(",") === "rest,sonder,standard"
  && new Set(Object.values(STUECK_FARBE)).size === 3);
ok("unbekannte/fehlende Stueckart gilt als Standardlaenge (keine erfundene Farbe)",
  stueckFarbe("quatsch") === STUECK_FARBE.standard && stueckFarbe(undefined) === STUECK_FARBE.standard
  && stueckFarbe("hasOwnProperty") === STUECK_FARBE.standard);
ok("Modul 7 verdrahtet genau diesen Schluessel (kein zweiter Farbsatz)",
  Z_FARBE.stange === STUECK_FARBE.standard && Z_FARBE.stange_sonder === STUECK_FARBE.sonder
  && Z_FARBE.stange_rest === STUECK_FARBE.rest);
ok("Spannplatte ist NICHT mehr die Sonderzuschnittsfarbe (Bauteil != Zuschnitt)",
  Z_FARBE.platte !== STUECK_FARBE.sonder
  && !Object.values(STUECK_FARBE).includes(Z_FARBE.platte));
ok("stueckArt liest die kanonischen `stuecke` (Art des letzten Stuecks = rest)",
  (() => { const sg = WZ.tension_columns[0].segments[0]; const n = sg.stuecke.length;
    return stueckArt(WZ, sg, n - 1, true) === "rest" && stueckArt(WZ, sg, 0, false) === "standard"; })());

// stuecke_sicht deckt die gezeichnete Stange lueckenlos ab und endet an ihrer
// Materialoberkante (bei Abschluss inklusive [Z-6]-Ueberstand).
let sichtOk = true, kopplungOk = true, restZuOben = true;
for (const ab of alleZ) for (const st of ab.straenge) {
  const ps = st.stuecke_sicht;
  if (!ps.length) { sichtOk = false; continue; }
  if (Math.abs(ps[0].z0_mm - st.z_unten_mm) > 1e-9) sichtOk = false;
  if (Math.abs(ps[ps.length - 1].z1_mm - st.zeichen_oben_mm) > 1e-9) sichtOk = false;
  if (ps.some((p, i) => i > 0 && Math.abs(p.z0_mm - ps[i - 1].z1_mm) > 1e-9)) sichtOk = false;
  if (ps.some(p => p.z1_mm < p.z0_mm - 1e-9)) sichtOk = false;
  // Der Ueberstand gehoert dem LETZTEN gesetzten Stueck — nicht dem noch nicht montierten
  if (ps.length !== st.kopplungen_mm.length + 1) kopplungOk = false;
  if (st.abgeschlossen && ps[ps.length - 1].art !== "rest") restZuOben = false;
}
ok("stuecke_sicht deckt die gezeichnete Stange lueckenlos bis zur Materialoberkante ab", sichtOk);
ok("Ueberstand zaehlt zum letzten gesetzten Stueck (Stuecke = Kopplungen + 1)", kopplungOk);
ok("abgeschlossene Straenge schliessen mit dem Reststueck ab ([Z-6])", restZuOben);

// Bild: ein Strich je Stueck in der Farbe seiner Art (kein Strich je Strang)
const abZ = alleZ[alleZ.length - 1];
const svgZ = abschnittSvg(WZ, abZ, 900, 430);
const striche = f => (svgZ.match(new RegExp(`<line x1="([\\d.]+)" y1="[\\d.]+" x2="\\1" y2="[\\d.]+" stroke="${f}" stroke-width="2.4"`, "g")) || []).length;
const sollJeArt = a => abZ.straenge.reduce((n, st) => n + st.stuecke_sicht.filter(p => p.art === a).length, 0);
ok("Baugruppenbild zeichnet je Stueck einen Strich in der Farbe seiner Art",
  ["standard", "sonder", "rest"].every(a => sollJeArt(a) > 0 && striche(STUECK_FARBE[a]) === sollJeArt(a)));
ok("Baugruppenbild traegt die Zuschnitt-Legende mit den gezeichneten Arten",
  /Zuschnitt:/.test(svgZ) && ["standard", "sonder", "rest"].every(a => svgZ.includes(STUECK_LABEL[a])));
ok("die Legende nennt nur Arten, die auch gezeichnet wurden",
  (() => { const s0 = abschnittSvg(WZ, alleZ[0], 900, 430);   // Schnitt 0: nur die erste Stange
    return !s0.includes(STUECK_LABEL.rest) && s0.includes(STUECK_LABEL.standard); })());
ok("Vorschau == Export: die Legende steckt im geteilten SVG, nicht im Modul",
  montageSeitenHtml(WZ, eingaben).includes(svgZ) && montageDokument(WZ, eingaben).includes("Zuschnitt:"));

// Alt-Bundle ohne `stuecke`: leere Sichtliste, Einzellinie, keine Stueckart-Legende (Entscheidung 5)
const wAlt = JSON.parse(JSON.stringify(WZ));
for (const col of wAlt.tension_columns) for (const sg of col.segments) delete sg.stuecke;
const alleAlt = montageAbschnitte(wAlt);
const svgAlt = abschnittSvg(wAlt, alleAlt[alleAlt.length - 1], 900, 430);
ok("Alt-Bundle ohne `stuecke`: stuecke_sicht bleibt leer",
  alleAlt.every(a => a.straenge.every(st => Array.isArray(st.stuecke_sicht) && st.stuecke_sicht.length === 0)));
ok("Alt-Bundle faellt auf die Einzellinie je Strang zurueck (kein Zeichenfehler)",
  (svgAlt.match(new RegExp(`stroke="${STUECK_FARBE.standard}" stroke-width="2.4"`, "g")) || []).length
    === alleAlt[alleAlt.length - 1].straenge.length);
// Der Legendenkasten selbst kann durch die realen Bodenblechstoesse belegt sein (die
// WERDEN gezeichnet und muessen nach [D-4] aufloesbar bleiben); ohne `stuecke` darf aber
// keine STUECKART des Stangenzuschnitts darin stehen. Der Sonderzuschnitt wird als exakter
// Textknoten geprueft, damit der Bodenblech-Eintrag nicht mit ihm verwechselt wird.
ok("Alt-Bundle zeigt KEINE Stueckart-Legende des Stangenzuschnitts (nichts erfinden)",
  !svgAlt.includes(STUECK_LABEL.rest) && !svgAlt.includes(STUECK_LABEL.standard)
  && !new RegExp(`>${STUECK_LABEL.sonder}<`).test(svgAlt));

// --- Abschnitte der lokalen Wandoberkante (Issue #24, [A-1]/[D-4]) ---------
// `oberkantenAbschnitte()` ist die KANONISCHE Ableitung der horizontalen Abschnitte der
// tatsaechlich gebauten Oberkante — dieselbe Kontur wie `topLagen()`, nur zu maximalen
// Laeufen gleicher Hoehe gefaltet. Sie ist REIN GEOMETRISCH: die Art des oberen
// Anschlusses (Kopfblech/Spannplatte) aendert die Kontur nicht.
{
  // Rechteckwand: genau EIN Abschnitt ueber die volle Laenge
  const aR = oberkantenAbschnitte(WR);
  ok("Rechteck: genau ein Oberkanten-Abschnitt ueber die volle Wandlaenge",
    aR.length === 1 && aR[0].x0_mm === 0 && aR[0].x1_mm === 3000
    && aR[0].hoehe_mm === 2600 && aR[0].lagen === 13);

  // Musterwand AWG mit vier Hoehen 2600/2200/1800/1400 (Fall aus Issue #24)
  const W4 = buildWall("AWG vier Stufen", 4000, 2600, [], null, PS_BLECH, [
    { x0_mm: 1000, x1_mm: 2000, height_mm: 2200 },
    { x0_mm: 2000, x1_mm: 3000, height_mm: 1800 },
    { x0_mm: 3000, x1_mm: 4000, height_mm: 1400 },
  ]);
  const a4 = oberkantenAbschnitte(W4);
  ok("AWG-Staffelung: vier Abschnitte 2600/2200/1800/1400",
    a4.length === 4 && a4.map(a => a.hoehe_mm).join(",") === "2600,2200,1800,1400");
  ok("AWG-Staffelung: Abschnittsgrenzen lueckenlos 0/1000/2000/3000/4000",
    a4[0].x0_mm === 0 && a4[3].x1_mm === 4000
    && a4.every((a, i) => i === 0 || a.x0_mm === a4[i - 1].x1_mm));
  ok("AWG-Staffelung: jeder Abschnitt liegt auf der lokalen Oberkante JEDER seiner Spalten",
    (() => { const tl = topLagen(W4), G = W4.grid_mm, C = W4.course_mm;
      return a4.every(a => { for (let k = a.x0_mm / G; k < a.x1_mm / G; k++)
        if (tl[k] * C !== a.hoehe_mm) return false; return true; }); })());
  // Summenparitaet zu top_plate und zur Stuecklisten-BOM ([A-1])
  const summe4 = a4.reduce((s, a) => s + (a.x1_mm - a.x0_mm), 0);
  ok("AWG-Staffelung: Summe der Abschnittslaengen == top_plate.laenge_mm",
    summe4 === W4.top_plate.laenge_mm);
  ok("AWG-Staffelung: Modulzahl aus den Abschnitten == BOM-Kopfblechmodule",
    Math.ceil(summe4 / W4.prestress.blech_mm) === semblaBom(W4).stahlblech_module_kopf);

  // Rein geometrisch: Spannplatte statt Kopfblech laesst die Kontur unveraendert
  const W4sp = buildWall("AWG vier Stufen (Spannplatte)", 4000, 2600, [], null,
    { top_connection: "spannplatte" }, W4.steps);
  ok("Kontur ist unabhaengig von der Anschlussart (Spannplatte == Blech)",
    JSON.stringify(oberkantenAbschnitte(W4sp)) === JSON.stringify(a4) && W4sp.top_plate === null);

  // Stufe auf Hoehe 0: dort steht keine Wand -> kein Abschnitt, echte Luecke
  const W0 = buildWall("Wand mit Aussparung", 4000, 2600, [], null, PS_BLECH,
    [{ x0_mm: 1000, x1_mm: 2000, height_mm: 0 }]);
  const a0 = oberkantenAbschnitte(W0);
  ok("Stufe auf Hoehe 0 erzeugt keinen schwebenden Abschnitt (echte Luecke)",
    a0.length === 2 && a0[0].x1_mm === 1000 && a0[1].x0_mm === 2000
    && a0.reduce((s, a) => s + (a.x1_mm - a.x0_mm), 0) === W0.top_plate.laenge_mm);
}

// --- 13) stangenStuecke(): die EINE Zeichengeometrie der Stuecke ([D-4]/[Z-6]) ----------
// Getrennt von stangenEnden(): dort sind es KOPPLUNGSHOEHEN (letzter Wert = Segmentende, ohne
// Ueberstand), hier die zu zeichnenden Spannen (letztes Stueck bis zur Materialoberkante).
{
  const WU = buildWall("Ueberstand", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 100, rod_overhang_mm: 10 });
  const sg = WU.tension_columns[0].segments[0];
  const st = stangenStuecke(WU, sg);
  ok("stangenStuecke: ein Eintrag je reales Stueck", st.length === sg.stuecke.length);
  ok("stangenStuecke: Laengen und Arten kommen unveraendert aus dem Wandelement",
    st.every((p, i) => p.len_mm === sg.stuecke[i].len_mm && p.art === sg.stuecke[i].art));
  ok("stangenStuecke: die Stuecke stossen luecken- und ueberlappungsfrei aneinander",
    st[0].z0_mm === sg.z0_mm && st.every((p, i) => i === 0 || p.z0_mm === st[i - 1].z1_mm));
  ok("[Z-6] das letzte Stueck reicht um den Ueberstand ueber das Segmentende",
    st[st.length - 1].z1_mm === sg.z1_mm + sg.ueberstand_mm
    && st[st.length - 1].z1_mm - st[st.length - 1].z0_mm === st[st.length - 1].len_mm);
  ok("[Z-6] gezeichnete Gesamtlaenge == bestuecktes Material (`bedarf_mm`)",
    st.reduce((a, p) => a + (p.z1_mm - p.z0_mm), 0) === sg.bedarf_mm);
  ok("stangenEnden bleibt die Kopplungsableitung (letzter Wert = Segmentende)",
    stangenEnden(WU, sg)[sg.stuecke.length - 1] === sg.z1_mm);

  // Reststueck == Ueberstand: die Spanne darf nicht auf 0 zusammenfallen.
  const WK = buildWall("kurz", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 10, rod_overhang_mm: 10 });
  const sk = stangenStuecke(WK, WK.tension_columns[0].segments[0]);
  ok("[Z-6] Reststueck == Ueberstand behaelt eine Spanne > 0",
    sk[sk.length - 1].art === "rest" && sk[sk.length - 1].z1_mm - sk[sk.length - 1].z0_mm === 10);

  // Segment ohne Oberkantenbezug (Bruestung an einer Oeffnung) bleibt bit-genau wie zuvor.
  const WF = buildWall("Fenster", 3000, 2600, [new Opening(6, 10, 4, 10, "fenster")], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 100, rod_overhang_mm: 10 });
  const bru = WF.tension_columns.flatMap(c => c.segments).find(g => g.z1_mm < WF.height_mm);
  ok("Testwand hat ein Segment ohne Oberkantenbezug (Voraussetzung)", !!bru && !bru.ueberstand_mm);
  ok("[Z-6] Segment ohne Oberkantenbezug endet exakt am Segmentende",
    stangenStuecke(WF, bru).slice(-1)[0].z1_mm === bru.z1_mm);

  // Unbestimmte Zerlegung: leeres `stuecke` heisst Konflikt, nicht Altstand.
  const WL = buildWall("lang", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 5000, rod_overhang_mm: 10 });
  const sl = WL.tension_columns[0].segments[0];
  ok("[Z-6] leeres `stuecke` (Konflikt) liefert keine Zeichengeometrie",
    sl.zuschnitt_konflikt === "reststueck_zu_lang" && stangenStuecke(WL, sl).length === 0);

  // Alt-Bundle OHNE das Feld faellt weiterhin auf die gleichmaessige Aufteilung zurueck.
  const alt = { ...WU, rod_mm: 1100,
    tension_columns: [{ k: 0, x_mm: 62.5, segments: [{ z0_mm: 0, z1_mm: 2200, gewindestangen: 2 }] }] };
  const sa = stangenStuecke(alt, alt.tension_columns[0].segments[0]);
  ok("Alt-Bundle ohne `stuecke`: gleichmaessige Aufteilung, Ende am Segmentende",
    sa.length === 2 && sa[0].z1_mm === 1100 && sa[1].z1_mm === 2200
    && sa.every(p => p.art === "standard"));
}

// --- 14) Modul 5: das abgeschlossene Segment zeigt den Ueberstand ebenfalls ([D-4]) -----
{
  const WU = buildWall("Ueberstand-M5", 2000, 2600, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 100, rod_overhang_mm: 10 });
  const letzte = montageAbschnitte(WU).slice(-1)[0];
  const mitRest = letzte.straenge.filter(s => (s.stuecke_sicht || []).some(p => p.art === "rest"));
  ok("letzter Baugruppenabschnitt zeigt Reststuecke (Voraussetzung)", mitRest.length > 0);
  ok("[Z-6] das Reststueck im Baugruppenbild endet an der Materialoberkante, nicht am Segmentende",
    mitRest.every(s => {
      const p = s.stuecke_sicht[s.stuecke_sicht.length - 1];
      return p.art === "rest" && p.z1_mm === s.seg_z1_mm + 10 && p.z1_mm - p.z0_mm === 100;
    }));
}


// --- 15) Reale Bodenblechteile und ihre Stoesse im Bild (#91, [A-10]/[A-11]/[A-12]) ----
// Die Zerlegung gehoert dem Rechenkern; Modul 5 darf sie nur ZEIGEN. Geprueft wird am
// echten Pfad: buildWall -> abschnittSvg/konturSvg -> erzeugtes SVG.
{
  // Alle Blechrechtecke eines Bildes an der y-Position des Wandfusses, in Zeichenreihenfolge.
  // Literale Regexe (keine `new RegExp`-Zeichenketten): die Farbwerte stehen ausgeschrieben,
  // damit die Zusicherung nicht an einer Escaping-Ebene haengt. #5b6673 = FARBE.stahl,
  // #e8702a = STUECK_FARBE.sonder, #13202e = FARBE.kontur (Stosslinie).
  const RE_BLECH = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*fill="(#5b6673|#e8702a)"/g;
  ok("[D-4] Testfarben sind die kanonischen Werte des Darstellungsschluessels",
    STUECK_FARBE.sonder === "#e8702a" && Z_FARBE.stahl === "#5b6673"
    && Z_FARBE.kontur === "#13202e");
  const rects = (svg) => {
    const alle = [...svg.matchAll(RE_BLECH)]
      .map(m => ({ x: +m[1], y: +m[2], w: +m[3], sonder: m[4] === "#e8702a" }));
    return alle.length ? alle.filter(r => r.y === alle[0].y) : [];
  };
  // Stosslinien liegen auf der OBERKANTE des Blechstreifens; die gleichfarbige Musterlinie
  // der Legende steht tiefer im Blatt und wird deshalb ueber ihre y-Position ausgeschlossen.
  const stossX = (svg) => {
    const r = rects(svg);
    if (!r.length) return [];
    return [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="[\d.]+" y2="[\d.]+" stroke="#13202e"/g)]
      .filter(m => +m[2] === r[0].y).map(m => +m[1]).sort((a, b) => a - b);
  };

  // (a) Mehrteilig, ungleiche Teile -> genau die kanonischen Stoesse, KEINE Modulfugen
  const WM = buildWall("Blech-mehr", 4625, 2600, [], null, { blech_lengths_mm: [1250, 1125] });
  const teileM = bodenblechTeile(WM);
  ok("[A-10] Testwand hat mehrere Bodenblechteile ungleicher Laenge (Voraussetzung)",
    teileM.length > 2 && new Set(teileM.map(t => t.raster_mm)).size > 1
    && teileM.every(t => t.art === "standard"));
  const abM = montageAbschnitte(WM), bildM = abschnittSvg(WM, abM[abM.length - 1], 900, 430);
  const rM = rects(bildM);
  ok("Modul 5 zeichnet je Bodenblechteil genau ein Rechteck, in Reihenfolge",
    rM.length === teileM.length
    && rM.every((r, i) => Math.abs(r.x - rM[0].x - teileM[i].x0_mm * (rM[0].w / teileM[0].raster_mm)) < 1e-6));
  const scM = rM[0].w / teileM[0].raster_mm;
  ok("[#91] Σ gezeichnete Teilbreiten == Wandlaenge (Rastermass, nicht Bauteilmass)",
    Math.abs(rM.reduce((a, r) => a + r.w, 0) - WM.length_mm * scM) < 1e-9
    // jede Breite ist das RASTERMASS; das um BLECH_SPIEL kuerzere Bauteilmass waere messbar
    // schmaler und wuerde die Summe unter die Wandlaenge druecken.
    && rM.every((r, i) => Math.abs(r.w - teileM[i].raster_mm * scM) < 1e-9)
    && rM.every((r, i) => Math.abs(r.w - (teileM[i].raster_mm - 2) * scM) > 1e-6)
    && teileM.some(t => t.raster_mm !== teileM[0].raster_mm));
  ok("[A-11] Stosslinien liegen genau an den kumulierten Rastermassen",
    stossX(bildM).length === bodenblechStoesse(WM).length
    && bodenblechStoesse(WM).every((xm, i) => Math.abs(stossX(bildM)[i] - (rM[0].x + xm * scM)) < 1e-6));
  ok("[#91] keine fiktiven gleichmaessigen Modulfugen (Stoesse != Vielfache von modul_mm)",
    bodenblechStoesse(WM).some(xm => xm % WM.base_plate.modul_mm !== 0));
  ok("Wandueberblick zeigt dieselben kanonischen Stosspositionen wie das Baugruppenbild",
    (() => {
      const k = konturSvg(WM, null, 900, 250), rk = rects(k), sk = stossX(k);
      const sck = rk[0].w / teileM[0].raster_mm;
      return rk.length === teileM.length && sk.length === bodenblechStoesse(WM).length
        && bodenblechStoesse(WM).every((xm, i) => Math.abs(sk[i] - (rk[0].x + xm * sck)) < 1e-6);
    })());

  // (b) Erzwungener Sonderzuschnitt: eigene Position, Farbe UND nicht farbliches Merkmal
  const WS = buildWall("Blech-sonder", 2000, 2600, [], null, { blech_lengths_mm: [1250] });
  const teileS = bodenblechTeile(WS);
  ok("[A-10] erzwungener Sonderzuschnitt am Wandende (Voraussetzung)",
    teileS.length === 2 && teileS[1].art === "sonder" && teileS[1].x0_mm === 1250
    && teileS[1].raster_mm === 750);
  const abS = montageAbschnitte(WS), bildS = abschnittSvg(WS, abS[abS.length - 1], 900, 430);
  const rS = rects(bildS);
  ok("Sonderzuschnitt steht an seiner Position und ist farblich gekennzeichnet",
    rS.length === 2 && !rS[0].sonder && rS[1].sonder
    && Math.abs(rS[1].x - (rS[0].x + rS[0].w)) < 1e-9);
  // Die Schraffur besteht aus senkrechten Strichen INNERHALB des Sonderteils. Sie ist das
  // Merkmal, das den Sonderzuschnitt auch im Schwarz-Weiss-Ausdruck traegt — geprueft wird
  // deshalb ausdruecklich Geometrie, nicht Farbe: senkrecht (x1 == x2), im Teil liegend,
  // und im Standardteil daneben darf sie NICHT vorkommen.
  const schraffur = (svg, r) =>
    [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#3a4350"/g)]
      .map(m => ({ x1: +m[1], y0: +m[2], x2: +m[3], y1: +m[4] }))
      .filter(t => t.x1 === t.x2 && t.y1 > t.y0 && t.x1 > r.x && t.x1 < r.x + r.w);
  ok("[#91] Sonderzuschnitt traegt zusaetzlich ein NICHT FARBLICHES Merkmal (Schraffur)",
    schraffur(bildS, rS[1]).length >= 2 && schraffur(bildS, rS[0]).length === 0);
  ok("[D-4] die Legende benennt Blechstoss und Bodenblech-Sonderzuschnitt in Worten",
    /Blechstoß/.test(bildS) && /Bodenblech Sonderzuschnitt \(schraffiert\)/.test(bildS));

  // (c) Alt-Wandelement ohne `teile`: EIN durchgehendes Blech, nichts erfunden
  const WA = JSON.parse(JSON.stringify(WM));
  delete WA.base_plate.teile;
  ok("Alt-Fall: bodenblechTeile liefert genau ein Teil ueber die volle Laenge",
    (() => { const t = bodenblechTeile(WA);
      return t.length === 1 && t[0].x0_mm === 0 && t[0].raster_mm === WA.length_mm
        && t[0].art === "standard" && bodenblechStoesse(WA).length === 0; })());
  const abA = montageAbschnitte(WA), bildA = abschnittSvg(WA, abA[abA.length - 1], 900, 430);
  const rA = rects(bildA);
  ok("Alt-Fall: Baugruppenbild zeigt EIN durchgehendes Bodenblech ohne Stosslinie",
    rA.length === 1 && Math.abs(rA[0].w - WA.length_mm * scM) < 1e-9
    && stossX(bildA).length === 0 && !rA[0].sonder);
  ok("Alt-Fall: Wandueberblick zeigt ebenfalls EIN durchgehendes Bodenblech",
    (() => { const k = konturSvg(WA, null, 900, 250);
      return rects(k).length === 1 && stossX(k).length === 0; })());
  ok("Alt-Fall: keine erfundene Blech-Legende (weder Stoss noch Sonderzuschnitt)",
    !/Blechstoß/.test(bildA) && !/Bodenblech Sonderzuschnitt/.test(bildA));

  // (d) Vorschau == Export: das Blech steckt im GETEILTEN SVG, nicht im Modul
  ok("[D-6] die Teilfolge steckt im geteilten Baugruppen-SVG (Vorschau == Export)",
    montageDokument(WS, eingaben).includes(bildS));
}

let fail = 0; for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`); process.exit(fail ? 1 : 0);
