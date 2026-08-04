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
} from "../../docs/shared/sembla-montage.js";
import { montageHtml, baueDateien } from "../../docs/shared/sembla-export.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);

// --- Testwaende ------------------------------------------------------------
// (1) Rechteckwand, (2) gestaffelte Wand wie die Musterwand AWG (3,00 x 2,60 m,
// ohne Oeffnungen, drei Hoehenstufen -> Stangenendhoehen 2600/2000/1400),
// (3) Tuerwand (Segment oberhalb der Oeffnung -> neue Stange mitten in der Wand).
const WR = buildWall("IW-Rechteck", 3000, 2600, []);
const WAWG = buildWall("Musterwand AWG", 3000, 2600, [], null, null,
  [{ x0_mm: 1500, x1_mm: 2250, height_mm: 2000 }, { x0_mm: 2250, x1_mm: 3000, height_mm: 1400 }]);
const WT = buildWall("Tuerwand", 3000, 2600, [new Opening(6, 12, 0, 10, "tuer")]);

const eingaben = standardEingaben();
eingaben.projekt.name = "Rettungswache";
eingaben.projekt.plan_nr = "A-12";

const alleR = montageAbschnitte(WR), alleA = montageAbschnitte(WAWG), alleT = montageAbschnitte(WT);
// Schnitt 0 ([A-9]) ist additiv vorangestellt; die regulaeren Baugruppenabschnitte
// sind die uebrigen — alle Alt-Zusicherungen gelten unveraendert fuer diese.
const echte = abs => abs.filter(a => a.art !== "schnitt0");
const absR = echte(alleR), absA = echte(alleA), absT = echte(alleT);

// --- 1) Erste Darstellung: Bodenblech + erste Stangen + mehrere Reihen -----
for (const [name, w, abs] of [["Rechteck", WR, absR], ["AWG", WAWG, absA]]) {
  const a1 = abs[0], ev = a1.ereignisse[0];
  const fussK = new Set(w.tension_columns.filter(c => (c.segments || []).some(s => s.z0_mm === 0)).map(c => c.k));
  ok(`${name}: Abschnitt 1 beginnt mit dem Fuss-Ereignis (Bodenblech, erste Stangen)`,
    ev.art === "fuss" && ev.z_mm === 0 && /Bodenblech/.test(ev.text) && /Senkkopfschraube/.test(ev.text));
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
// Abgeschlossene Straenge werden NICHT kuenstlich verlaengert
ok("abgeschlossene Straenge enden genau an der Segmentoberkante",
  [...absR, ...absA, ...absT].every(a => a.straenge.filter(s => s.abgeschlossen)
    .every(s => s.zeichen_oben_mm === s.seg_z1_mm)));

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
const bodenBreite = svg => +(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"[^>]*fill="#5b6673"/.exec(svg) || [])[1];
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

let fail = 0; for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`); process.exit(fail ? 1 : 0);
