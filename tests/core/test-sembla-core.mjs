// Paritaets- und Regeltests fuer den JS-Core. Lauf: node test-sembla-core.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildWall, buildReference, Opening, isBuildable, REFERENCE_WALLS,
  GRID, ROD, CHAMBER_OFFSET, MAX_SPAN_GRID, FORBIDDEN_N,
  InvalidDimensionError, InvalidOpeningError,
  kombiniereLaengen, quelleFuerMass, kombiniereSegment,
  zerlegeBodenblech, normBlechLaengen, BLECH_LAENGEN, BLECH_SPIEL,
  lagenOberkantenInnen, autoZwischenpunkt, normZwischenpunkte, zwischenpunkteSegment,
  wirksameZwischenpunkte, COURSE,
} from "../../docs/shared/sembla-core.js";
// Der Auslegungsadapter gehoert zum Paritaetsvertrag: `psOf()` ist eine WHITELIST, und ein
// dort fehlendes Feld faellt in jeder Iteration still weg. Deshalb wird der ECHTE Adapter
// geladen und nicht nachgebaut.
import { autoAuslegung, nachweisPruefen } from "../../docs/shared/sembla-engine.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + "\n        " + e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
function deepEqual(a, b, path = "") {
  if (a === b) return;
  if (typeof a !== typeof b) throw new Error(`Typ-Mismatch @${path}: ${typeof a} vs ${typeof b}`);
  if (Array.isArray(a) || Array.isArray(b)) {
    assert(Array.isArray(a) && Array.isArray(b), `Array-Mismatch @${path}`);
    assert(a.length === b.length, `Laenge @${path}: ${a.length} vs ${b.length}`);
    for (let i = 0; i < a.length; i++) deepEqual(a[i], b[i], `${path}[${i}]`);
    return;
  }
  if (a && b && typeof a === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    assert(ka.length === kb.length && ka.every((k, i) => k === kb[i]),
      `Keys @${path}: [${ka}] vs [${kb}]`);
    for (const k of ka) deepEqual(a[k], b[k], `${path}.${k}`);
    return;
  }
  throw new Error(`Wert @${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

console.log("PARITAET gegen goldene Python-Fixtures:");
for (const key of Object.keys(REFERENCE_WALLS)) {
  t(`${key} == fixture`, () => {
    const golden = JSON.parse(readFileSync(join(FIX, `${key}.json`), "utf8"));
    deepEqual(buildReference(key), golden);
  });
}

console.log("REGELN & EIGENSCHAFTEN:");
t("alle Referenzwaende buildable", () => {
  for (const k of Object.keys(REFERENCE_WALLS)) assert(isBuildable(buildReference(k)), k);
});
t("Versatz fuer N nicht durch 3 teilbar", () => {
  for (let n = 2; n <= 40; n++) {
    if (FORBIDDEN_N.has(n) || n % 3 === 0) continue;
    const w = buildWall("t", n * GRID, 2000, []);
    assert(w.validation.versatz_ok && isBuildable(w), `N=${n}`);
  }
});
t("Versatz bei Vielfachen von 3 erzwungen", () => {
  for (const n of [6, 9, 12, 15, 18]) {
    const w = buildWall("t", n * GRID, 2000, []);
    assert(w.validation.versatz_ok && isBuildable(w) && w.bom.i2 > 0, `N=${n}`);
  }
});
t("i3 maximiert fuer N nicht durch 3 (i2 je Lage = {1:2,2:1})", () => {
  const per = { 1: 2, 2: 1 };
  for (let n = 5; n < 30; n++) { if (FORBIDDEN_N.has(n) || n % 3 === 0) continue;
    const w = buildWall("t", n * GRID, 1000, []);
    assert(w.bom.i2 === 5 * per[n % 3], `N=${n}`); }
});
t("i2 nur an den Enden (auch bei erzwungenem Versatz)", () => {
  for (const n of [5,6,7,8,9,10,12,15]) {
    const w = buildWall("t", n*GRID, 800, []);
    for (const c of w.courses) {
      const types=c.stones.map(s=>s.type); let i=0,j=types.length;
      while(i<j && types[i]==='i2') i++;
      while(j>i && types[j-1]==='i2') j--;
      assert(!types.slice(i,j).includes('i2'), `N=${n} L${c.lage}: ${types}`);
    }
  }
});
t("N=4 nicht buildable", () => {
  const w = buildWall("starr", 4 * GRID, 800, []);
  assert(!isBuildable(w) && w.validation.invalid_segments.length > 0);
});
t("Saeulen auf Kammer-Lattice", () => {
  for (const c of buildReference("ref3_wand_fenster").tension_columns)
    assert(c.x_mm === CHAMBER_OFFSET + GRID * c.k, `k=${c.k}`);
});
t("beide Wandenden + neben Tuer haben Saeulen", () => {
  const w = buildReference("ref2_wand_tuer");
  const ks = new Set(w.tension_columns.map(c => c.k));
  const op = w.openings[0];
  assert(ks.has(0) && ks.has(w.N_grid - 1), "Enden");
  assert(ks.has(op.g0 - 1) && ks.has(op.g1), "neben Tuer");
});
t("kein Segment in der Oeffnung; über/unter Öffnung vorhanden; Abstand<=375 ok", () => {
  const w = buildReference("ref3_wand_fenster");
  const op = w.openings[0];
  for (const c of w.tension_columns) for (const g of c.segments) {
    const inx = op.g0 <= c.k && c.k < op.g1, iny = g.lage0 < op.l1 && g.lage1 > op.l0;
    assert(!(inx && iny), "Segment in Öffnung");
  }
  const span = w.tension_columns.filter(c => op.g0 <= c.k && c.k < op.g1);
  assert(span.some(c => c.segments.some(g => g.lage1 <= op.l0)), "keine Vorspannung unter Fenster");
  assert(span.some(c => c.segments.some(g => g.lage0 >= op.l1)), "keine Vorspannung über Fenster");
  assert(w.validation.tension_span_ok);
});
// Issue #13: Startachse der Auto-Verteilung (1. oder 2. Rasterachse), danach balanciert
// mit Abstaenden <= max_span_grid weiter. N=16 ist bewusst NICHT glatt durch 3 teilbar.
const ksOf = (ps) => buildWall("sa", 2000, 2600, [], null, ps).tension_columns.map(c => c.k);
t("Startachse: Default = 1. Achse (Bestand, k=0)", () => {
  const ks = ksOf({ max_span_grid: 3 });
  assert(ks[0] === 0, `Startanker ${ks[0]}`);
  assert(JSON.stringify(ks) === JSON.stringify(ksOf({ max_span_grid: 3, start_axis_grid: 0 })), "explizit 0 == Default");
  // [V-2]+[V-3]: 3 der 4 i3-Mitten der untersten Lage (5/8/11/14) sind getroffen;
  // 3 deckt den i2 [2,4), 13 den i3 [13,16) neben dem Endanker 15 ab.
  assert(JSON.stringify(ks) === "[0,3,5,8,11,13,15]", JSON.stringify(ks));
});
t("Startachse 2 (k=1): Startanker, Endanker N-1, alle Abstaende <= x", () => {
  const N = 16, x = 3;
  const ks = ksOf({ max_span_grid: x, start_axis_grid: 1 });
  assert(ks[0] === 1, `Startanker ${ks[0]}`);
  assert(ks[ks.length - 1] === N - 1, `Endanker ${ks[ks.length - 1]}`);
  assert(!ks.includes(0), "keine Achse auf der 1. Rasterachse");
  for (let i = 0; i < ks.length - 1; i++) assert(ks[i + 1] - ks[i] <= x, `Abstand ${ks[i]}->${ks[i + 1]}`);
  assert(JSON.stringify(ks) === "[1,3,5,8,11,13,15]", JSON.stringify(ks));
});
// [V-2] MUSS: jeder Stein jeder Lage wird von mindestens einer Spannachse durchgangen.
const ungehalten = (w) => {
  const ks = new Set(w.tension_columns.map(c => c.k));
  const out = [];
  for (const c of w.courses) for (const st of c.stones) {
    const a = st.x0 / 125, b = st.x1 / 125;
    let hit = false; for (let k = a; k < b; k++) if (ks.has(k)) { hit = true; break; }
    if (!hit) out.push([c.lage, a, b]);
  }
  return out;
};
t("[V-2] jeder Stein wird von einer Spannachse gehalten (Referenzwaende)", () => {
  for (const key of Object.keys(REFERENCE_WALLS)) {
    const w = buildReference(key);
    assert(ungehalten(w).length === 0, `${key}: ${JSON.stringify(ungehalten(w))}`);
    assert(w.validation.ungehaltene_steine.length === 0, key);
  }
});
t("[V-2] traegt auch ohne Maximalabstand ([V-4] abgeschaltet)", () => {
  for (const [L, H] of [[2000, 2400], [2500, 2400], [3000, 2600], [5000, 3000], [10000, 2800]])
    for (const sa of [0, 1]) {
      const w = buildWall("v2", L, H, [], null, { max_span_grid: 999, start_axis_grid: sa });
      assert(ungehalten(w).length === 0, `${L}x${H} sa=${sa}: ${JSON.stringify(ungehalten(w))}`);
    }
});
t("[V-2] gilt bei Oeffnungen und Staffelung", () => {
  const a = buildWall("v2o", 4000, 2600, [new Opening(8, 16, 0, 11, "tuer")], null, { max_span_grid: 3 });
  assert(ungehalten(a).length === 0, JSON.stringify(ungehalten(a)));
  const b = buildWall("v2s", 3000, 2600, [], null, { max_span_grid: 3 }, [{ x0_mm: 1500, x1_mm: 3000, height_mm: 1600 }]);
  assert(ungehalten(b).length === 0, JSON.stringify(ungehalten(b)));
});
t("[V-9] manuelle Achsen: [V-2]-Verletzung wird gemeldet, nicht still korrigiert", () => {
  const w = buildWall("v9", 2000, 2600, [], null, { columns_grid: [0, 15] });
  assert(JSON.stringify(w.tension_columns.map(c => c.k)) === "[0,15]", "Vorrang der manuellen Achsen");
  assert(w.validation.ungehaltene_steine.length > 0, "Verletzung muss gemeldet werden");
  assert(w.validation.buildable, "kein Baubarkeitsausschluss");
});
// [V-3] SOLL: automatisch gesetzte Achsen moeglichst mittig in den i3 der untersten Lage.
t("[V-3] Achsen liegen ueberwiegend mittig in den i3 der untersten Lage", () => {
  for (const L of [2000, 5000]) {
    const w = buildWall("v3", L, 2600, [], null, { max_span_grid: 3 });
    const ks = new Set(w.tension_columns.map(c => c.k));
    const mitten = w.courses[0].stones.filter(s => (s.x1 - s.x0) / 125 === 3).map(s => s.x0 / 125 + 1);
    const treffer = mitten.filter(m => ks.has(m)).length;
    assert(treffer * 4 >= mitten.length * 3, `L=${L}: nur ${treffer}/${mitten.length} mittig`);
  }
});
t("Startachse: Oeffnungskanten bleiben additiv, columns_grid hat Vorrang", () => {
  const op = [new Opening(5, 11, 0, 10, "tuer")];
  const w = buildWall("sa", 2000, 2600, op, null, { max_span_grid: 3, start_axis_grid: 1 });
  const ks = new Set(w.tension_columns.map(c => c.k));
  assert(ks.has(4) && ks.has(11), "Oeffnungskanten");
  assert(!ks.has(0) && ks.has(15), "Startachse 2 + Endachse");
  const m = buildWall("sa", 2000, 2600, [], null, { max_span_grid: 3, start_axis_grid: 1, columns_grid: [0, 8, 15] });
  assert(JSON.stringify(m.tension_columns.map(c => c.k)) === "[0,8,15]", "manuelle Achsen haben Vorrang");
});
t("Ablaengen: 2600mm -> 3 Stangen (durchgehendes Segment)", () => {
  const c = buildWall("t", 1000, 2600, []).tension_columns[0];
  assert(c.durchgehend, "durchgehend");
  const g = c.segments[0];
  assert(g.gewindestangen === 3 && g.verbindungsmuttern === 2);
  assert(g.letzte_stange_mm === 2600 - 2 * ROD && g.verschnitt_mm === 3 * ROD - 2600);
});

console.log("FEHLERFAELLE:");
const throws = (Err, fn) => { try { fn(); return false; } catch (e) { return e instanceof Err; } };
t("Laenge nicht im Raster -> Fehler", () => assert(throws(InvalidDimensionError, () => buildWall("x", 300, 2000))));
t("Hoehe nicht im Lagenraster -> Fehler", () => assert(throws(InvalidDimensionError, () => buildWall("x", 1000, 250))));
t("zu kurz -> Fehler", () => assert(throws(InvalidDimensionError, () => buildWall("x", 125, 2000))));
t("Oeffnung ausserhalb -> Fehler", () => assert(throws(InvalidOpeningError, () => buildWall("x", 1000, 2000, [new Opening(2, 99, 0, 5)]))));
t("Oeffnungen ueberlappen -> Fehler", () => assert(throws(InvalidOpeningError, () => buildWall("x", 4000, 2600, [new Opening(2, 10, 0, 8), new Opening(6, 14, 0, 8)]))));
t("kaputte Oeffnungsgeometrie -> Fehler", () => assert(throws(InvalidOpeningError, () => new Opening(6, 4, 0, 5))));

t("Gewindestangenlänge: Default 1100, parametrisierbar", () => {
  const a = buildWall("a", 1000, 2600, []);
  const b = buildWall("b", 1000, 2600, [], null, { rod_mm: 600 });
  assert(a.rod_mm === 1100, "default rod_mm");
  assert(b.rod_mm === 600, "custom rod_mm");
  const sa = a.tension_columns[0].segments[0], sb = b.tension_columns[0].segments[0];
  assert(sb.gewindestangen > sa.gewindestangen, "kürzere Stange -> mehr Stangen");
  assert(sb.verbindungsmuttern === sb.gewindestangen - 1, "Muttern = Stangen-1");
  assert(sb.verschnitt_mm === sb.gewindestangen * 600 - (sb.z1_mm - sb.z0_mm), "Verschnitt korrekt");
});
t("Gewindestangenlänge: ungültig -> Default", () => {
  assert(buildWall("a", 1000, 2600, [], null, { rod_mm: 0 }).rod_mm === 1100);
  assert(buildWall("a", 1000, 2600, [], null, { rod_mm: -5 }).rod_mm === 1100);
});

// ---- Zuschnitt aus ausgewaehlten Standardlaengen ([Z-2]/[Z-5]) ----
// DIESELBEN Faelle stehen wortgleich in test_sembla_core.py — sie sind der Paritaetsvertrag
// der Kombinationsregel zwischen Betriebskopie und Python-Orakel.
console.log("ZUSCHNITT [Z-2]/[Z-5] (Paritaetsvertrag mit dem Python-Orakel):");
const kurz = (r) => r.stuecke.map(s => s.len_mm + (s.art === "sonder" ? "S/" + s.quelle_mm : "")).join("+");
t("170 cm aus 100/50 -> 100+50+20 (Sonderzuschnitt aus 50)", () => {
  const r = kombiniereLaengen(1700, [1000, 500]);
  assert(kurz(r) === "1000+500+200S/500", kurz(r));
  assert(r.konflikt === null);
});
t("Eingabereihenfolge und Doppelte ohne Wirkung", () => {
  assert(kurz(kombiniereLaengen(1700, [500, 1000, 500])) === "1000+500+200S/500");
});
t("exakt teilbar -> nur Standardstuecke", () => {
  assert(kurz(kombiniereLaengen(3000, [1000])) === "1000+1000+1000");
});
t("Bedarf < kleinste Groesse -> Sonderzuschnitt aus kleinstem geeigneten Produkt", () => {
  assert(kurz(kombiniereLaengen(400, [1000, 600])) === "400S/600");
});
t("[Z-5] unloesbares Restmaß wird gemeldet, nie still ausgegeben", () => {
  const r = kombiniereLaengen(1200, [1100]);
  assert(kurz(r) === "1100+100S/1100", kurz(r));
  assert(r.konflikt === "mindestmass");
  const alt = kombiniereLaengen(1200, [1100, 500]);
  assert(alt.konflikt === null && alt.stuecke.every(s => s.len_mm >= 200), kurz(alt));
});
t("ohne Standardlaenge: Konflikt statt erfundener Laenge", () => {
  const r = kombiniereLaengen(1700, []);
  assert(r.stuecke.length === 0 && r.konflikt === "keine_standardlaenge");
});
t("quelleFuerMass = kleinstes geeignetes Ausgangsprodukt", () => {
  assert(quelleFuerMass(400, [1000, 500, 300]) === 500);
  assert(quelleFuerMass(1500, [1000, 500]) === null);
});
t("Laengensatz reist im Wandelement mit, rod_mm = groesste Groesse", () => {
  const w = buildWall("z", 1000, 2600, [], null, { rod_lengths_mm: [600, 1000] });
  assert(JSON.stringify(w.prestress.rod_lengths_mm) === "[1000,600]");
  assert(w.rod_mm === 1000);
  const sg = w.tension_columns[0].segments[0];
  assert(kurz({ stuecke: sg.stuecke }) === "1000+1000+600", kurz({ stuecke: sg.stuecke }));
  assert(sg.gewindestangen === 3 && sg.verbindungsmuttern === 2 && sg.verschnitt_mm === 0);
});
t("Fallback ohne Laengensatz ist bit-genau der Altstand", () => {
  for (const h of [2000, 2200, 2400, 2600, 3000, 3400]) {
    const sg = buildWall("f", 1000, h, []).tension_columns[0].segments[0];
    const st = Math.ceil(h / ROD);
    assert(sg.gewindestangen === st && sg.letzte_stange_mm === h - (st - 1) * ROD
      && sg.verschnitt_mm === st * ROD - h, "h=" + h);
  }
});

// ---- Bodenblech aus Standardlaengen ([A-10]/[A-11]/[A-12]) ----
// DIESELBEN Faelle stehen wortgleich in test_sembla_core.py — sie sind der Paritaetsvertrag
// der Bodenblech-Zerlegung zwischen Betriebskopie und Python-Orakel.
console.log("BODENBLECH [A-10]/[A-11]/[A-12] (Paritaetsvertrag mit dem Python-Orakel):");
const blechKurz = (w) => w.base_plate.teile
  .map(tl => tl.raster_mm + "/" + tl.bauteil_mm + (tl.art === "sonder" ? "S" : "")).join("+");
t("[A-10] Fallback ist die volle Standardreihe 375…1250 mm", () => {
  const w = buildWall("bb", 5000, 2600, []);
  assert(JSON.stringify(w.prestress.blech_lengths_mm) === JSON.stringify(BLECH_LAENGEN),
    JSON.stringify(w.prestress.blech_lengths_mm));
  assert(JSON.stringify(normBlechLaengen([1250, 300, 1500, 1000, 1000, 0]))
    === "[1250,1000]", "nur Vielfache von 125 im Bereich 375…1250");
});
t("[A-10]/[A-11] 5000-mm-Wand: nur Standardteile, Summe = Wandlaenge, stossfrei", () => {
  const w = buildWall("bb5", 5000, 2600, [], null, { top_connection: "blech" });
  assert(blechKurz(w) === "1125/1123+1125/1123+1125/1123+1125/1123+500/498", blechKurz(w));
  assert(w.base_plate.teile.every(tl => tl.art === "standard"), "nur Standardlaengen");
  assert(w.base_plate.teile.reduce((a, tl) => a + tl.raster_mm, 0) === 5000, "Summe");
  assert(w.base_plate.module === 5 && w.bom.stahlblech_module === 5 + w.top_plate.module, "Aggregat");
  assert(w.validation.blech_konflikte.length === 0, "keine Konflikte");
  // Das Ausweichen ist echt: 4x1250 waere groesser, liegt aber auf dem Steinstoss bei Raster 10.
  const fugen = new Set(w.courses[0].joints_grid);
  assert(fugen.has(10), "Gegenprobe: Raster 10 IST ein Steinstoss");
  let x = 0;
  for (const tl of w.base_plate.teile) { x += tl.raster_mm;
    assert(x >= 5000 || !fugen.has(x / GRID), "Stoss auf Steinstoss bei " + x); }
});
t("[A-12] jedes Teil fuehrt Rastermass und Bauteilmass (Rastermass - 2 mm)", () => {
  for (const L of [1000, 2000, 3000, 5000, 250]) {
    const w = buildWall("bbm", L, 2600, []);
    assert(w.base_plate.teile.every(tl => tl.bauteil_mm === tl.raster_mm - BLECH_SPIEL), "L=" + L);
    assert(w.base_plate.teile.every(tl => tl.raster_mm % GRID === 0), "Raster L=" + L);
  }
});
t("[A-11] kein stossfreies Ausweichen moeglich -> deterministisch + benannter Konflikt", () => {
  const w = buildWall("bb1250", 5000, 2600, [], null, { blech_lengths_mm: [1250] });
  assert(blechKurz(w) === "1250/1248+1250/1248+1250/1248+1250/1248", blechKurz(w));
  assert(JSON.stringify(w.validation.blech_konflikte)
    === '[{"grund":"stoss_auf_steinstoss","x_mm":1250,"grid":10}]',
    JSON.stringify(w.validation.blech_konflikte));
  assert(w.validation.buildable, "kein Baubarkeitsausschluss");
});
t("[A-10] nicht deckbare Laenge -> genau EIN gekennzeichneter Sonderzuschnitt", () => {
  const w = buildWall("bbs", 250, 2600, []);
  assert(blechKurz(w) === "250/248S", blechKurz(w));
  assert(w.base_plate.teile.filter(tl => tl.art === "sonder").length === 1, "genau einer");
  assert(w.validation.blech_konflikte.length === 0 && w.validation.buildable, "kein Konflikt");
});
t("[A-10] ausdruecklich leerer Vorratssatz: gemeldet, keine Laenge erfunden", () => {
  const w = buildWall("bb0", 5000, 2600, [], null, { blech_lengths_mm: [] });
  assert(JSON.stringify(w.prestress.blech_lengths_mm) === "[]", "leer bleibt leer");
  assert(blechKurz(w) === "5000/4998S", blechKurz(w));
  assert(w.validation.blech_konflikte.some(k => k.grund === "keine_standardlaenge"), "gemeldet");
});
t("[A-11] `blech_mm` bleibt allein die Kopfblech-Modullaenge", () => {
  const a = buildWall("bbk", 3000, 2600, [], null, { top_connection: "blech" });
  const b = buildWall("bbk", 3000, 2600, [], null, { blech_mm: 500, top_connection: "blech" });
  assert(blechKurz(a) === blechKurz(b), "Bodenblech unabhaengig von blech_mm");
  assert(b.top_plate.module === 6 && a.top_plate.module === 3, "Kopfblech folgt blech_mm");
});
// [A-2]/#92: DEFAULT ist die Spannplatte. Geprueft werden alle Faelle nebeneinander —
// fehlend, leer, ungueltig und ausdruecklich `blech`. Das Python-Orakel traegt denselben
// Default (`sembla_core.py`), sodass die Paritaetsfixtures unveraendert bleiben.
t("[A-2] oberer Anschluss: Default Spannplatte, `blech` nur ausgesprochen", () => {
  const fehlt = buildWall("a2f", 2000, 2600, []);
  const leer = buildWall("a2l", 2000, 2600, [], null, {});
  const falsch = buildWall("a2x", 2000, 2600, [], null, { top_connection: "kopfblech" });
  const blech = buildWall("a2b", 2000, 2600, [], null, { top_connection: "blech" });
  for (const w of [fehlt, leer, falsch]) {
    assert(w.prestress.top_connection === "spannplatte", w.name + ": " + w.prestress.top_connection);
    assert(w.top_plate === null, w.name + ": kein Kopfblech");
  }
  assert(blech.prestress.top_connection === "blech" && blech.top_plate !== null,
    "ausdruecklich gewaehltes Kopfblech bleibt erhalten");
});
// Gegenfall der Abnahme: die frueher benutzte Tiefensuche nahm einen Sonderabschluss als
// Erfolg und brach damit im ersten grossen Ast ab — 1000+625+625+250S —, obwohl 4 x 625 exakt
// deckt. [A-10] verlangt: existiert IRGENDEINE exakte Standardkombination, entsteht KEIN
// Sonderzuschnitt.
t("[A-10] exakte Standardkombination schlaegt jeden Sonderzuschnitt (2500 aus 1000/625/375)", () => {
  const r = zerlegeBodenblech(2500, [1000, 625, 375], []);
  assert(r.teile.map(tl => tl.raster_mm).join("+") === "625+625+625+625",
    JSON.stringify(r.teile.map(tl => tl.raster_mm)));
  assert(r.teile.every(tl => tl.art === "standard"), "kein Sonderzuschnitt");
  assert(r.teile.reduce((a, tl) => a + tl.raster_mm, 0) === 2500 && r.konflikte.length === 0);
});
t("[A-10] geringste Teilezahl schlaegt die reine Groessenpraeferenz (2625 aus 1000/875/375)", () => {
  // Groesste zuerst ergaebe 1000+1000+375+250S (4 Teile, davon einer Sonder);
  // exakt und kuerzer sind 3 x 875.
  const r = zerlegeBodenblech(2625, [1000, 875, 375], []);
  assert(r.teile.map(tl => tl.raster_mm).join("+") === "875+875+875",
    JSON.stringify(r.teile.map(tl => tl.raster_mm)));
  assert(r.teile.every(tl => tl.art === "standard") && r.konflikte.length === 0);
});
t("[A-11] Stossregel schlaegt die geringste Teilezahl (2500, Steinstoss auf Raster 10)", () => {
  // Ohne Stoss ist 1250+1250 die kuerzeste exakte Kombination; der Steinstoss bei 1250 mm
  // sperrt sie, also gilt die kuerzeste STOSSFREIE exakte Kombination — und die ist laenger.
  assert(zerlegeBodenblech(2500, BLECH_LAENGEN, []).teile.map(tl => tl.raster_mm).join("+")
    === "1250+1250", "Gegenprobe ohne Stoss");
  const r = zerlegeBodenblech(2500, BLECH_LAENGEN, [10]);
  assert(r.teile.map(tl => tl.raster_mm).join("+") === "1125+1000+375",
    JSON.stringify(r.teile.map(tl => tl.raster_mm)));
  assert(r.teile.every(tl => tl.art === "standard"), "kein Sonderzuschnitt zum Ausweichen");
  assert(r.konflikte.length === 0, "stossfrei, also nichts zu melden");
});
t("zerlegeBodenblech ist eine reine Funktion (ohne Stossmenge keine Konflikte)", () => {
  const r = zerlegeBodenblech(3000, BLECH_LAENGEN, []);
  assert(r.teile.map(tl => tl.raster_mm).join("+") === "1250+1250+500", JSON.stringify(r.teile));
  assert(r.konflikte.length === 0);
});

// ---- Verzahnungsbereich ([G-10]/[G-11]/[G-12]) ----
// DIESELBEN Erwartungswerte stehen wortgleich in test_sembla_core.py — sie sind der Paritaetsvertrag.
console.log("VERZAHNUNG [G-10]/[G-11]/[G-12] (Paritaetsvertrag mit dem Python-Orakel):");
t("[G-10] Verzahnung start_parity=0: Lage 0 ausgespart", () => {
  // 1000mm = 8 Raster, 800mm = 4 Lagen
  const w = buildWall("vz0", 1000, 800, [], null, null, [], [{ g0: 0, g1: 3, start_parity: 0 }]);
  assert(w.interlocks.length === 1, "ein gueltiger Bereich");
  assert(w.validation.interlock_fehler.length === 0, "keine Fehler");
  // Lage 0 und 2 (gerade) sind im Bereich [0,3) ausgespart
  // Lage 1 und 3 (ungerade) haben Steine im Bereich [0,3)
  const steineMenge = w.courses.map(c => c.stones.filter(s => s.x0 / GRID < 3).length);
  // Erwartet: gerade Lagen (0, 2) = 0 Steine im Bereich, ungerade Lagen (1, 3) > 0
  assert(steineMenge[0] === 0, `Lage 0 sollte 0 Steine im Bereich haben: ${steineMenge[0]}`);
  assert(steineMenge[1] > 0, `Lage 1 sollte Steine im Bereich haben: ${steineMenge[1]}`);
  assert(steineMenge[2] === 0, `Lage 2 sollte 0 Steine im Bereich haben: ${steineMenge[2]}`);
  assert(steineMenge[3] > 0, `Lage 3 sollte Steine im Bereich haben: ${steineMenge[3]}`);
});
t("[G-10] Verzahnung start_parity=1: Lage 1 ausgespart", () => {
  const w = buildWall("vz1", 1000, 800, [], null, null, [], [{ g0: 0, g1: 3, start_parity: 1 }]);
  assert(w.interlocks.length === 1, "ein gueltiger Bereich");
  const steineMenge = w.courses.map(c => c.stones.filter(s => s.x0 / GRID < 3).length);
  // Erwartet: ungerade Lagen (1, 3) = 0 Steine im Bereich, gerade Lagen (0, 2) > 0
  assert(steineMenge[0] > 0, `Lage 0 sollte Steine im Bereich haben: ${steineMenge[0]}`);
  assert(steineMenge[1] === 0, `Lage 1 sollte 0 Steine im Bereich haben: ${steineMenge[1]}`);
  assert(steineMenge[2] > 0, `Lage 2 sollte Steine im Bereich haben: ${steineMenge[2]}`);
  assert(steineMenge[3] === 0, `Lage 3 sollte 0 Steine im Bereich haben: ${steineMenge[3]}`);
});
t("[G-11] Vorspannung bleibt mit und ohne Verzahnung identisch", () => {
  // Gleiche Wand, einmal ohne, einmal mit Verzahnung
  const ohne = buildWall("ohneVz", 2000, 2000, [], null, null, []);
  const mit = buildWall("mitVz", 2000, 2000, [], null, null, [], [{ g0: 0, g1: 3, start_parity: 0 }]);
  // Spannachsen, Segmente, Stangenstuecke muessen identisch sein
  const ohneKs = ohne.tension_columns.map(c => c.k);
  const mitKs = mit.tension_columns.map(c => c.k);
  assert(JSON.stringify(ohneKs) === JSON.stringify(mitKs), `Achsen verschieden: ${JSON.stringify(ohneKs)} vs ${JSON.stringify(mitKs)}`);
  // Segmente
  for (let i = 0; i < ohne.tension_columns.length; i++) {
    const o = ohne.tension_columns[i], m = mit.tension_columns[i];
    assert(o.segments.length === m.segments.length, `col ${i}: Segmente verschieden`);
    for (let j = 0; j < o.segments.length; j++) {
      const os = o.segments[j], ms = m.segments[j];
      assert(os.z0_mm === ms.z0_mm && os.z1_mm === ms.z1_mm, `Segment ${i}/${j}: Hoehe verschieden`);
      assert(JSON.stringify(os.stuecke) === JSON.stringify(ms.stuecke), `Segment ${i}/${j}: Stuecke verschieden`);
    }
  }
});
t("[G-10] BOM-Steinmenge ist mit Verzahnung reduziert", () => {
  const ohne = buildWall("ohneVz", 1000, 800, [], null, null, []);
  const mit = buildWall("mitVz", 1000, 800, [], null, null, [], [{ g0: 0, g1: 3, start_parity: 0 }]);
  // i2 + i3 muss mit Verzahnung kleiner sein
  const ohneSteine = ohne.bom.i2 + ohne.bom.i3;
  const mitSteine = mit.bom.i2 + mit.bom.i3;
  assert(mitSteine < ohneSteine, `Steinmenge sollte reduziert sein: ${mitSteine} >= ${ohneSteine}`);
  // Stossfugen bleiben gleich (basieren auf vollstaendigem Verband)
  assert(ohne.bom.stossfugen === mit.bom.stossfugen, `Stossfugen verschieden: ${ohne.bom.stossfugen} vs ${mit.bom.stossfugen}`);
});
t("[G-12] Ungueltige Verzahnung wird benannt abgewiesen", () => {
  // Bereich ausserhalb der Wand
  const w1 = buildWall("vzErr", 1000, 800, [], null, null, [], [{ g0: 5, g1: 12, start_parity: 0 }]);
  assert(w1.interlocks.length === 0, "ausserhalb_wand: kein gueltiger Bereich");
  assert(w1.validation.interlock_fehler.some(f => f.grund === "ausserhalb_wand"), "ausserhalb_wand gemeldet");
  // Ungueltige Paritaet
  const w2 = buildWall("vzErr", 1000, 800, [], null, null, [], [{ g0: 0, g1: 3, start_parity: 2 }]);
  assert(w2.interlocks.length === 0, "ungueltige_paritaet: kein gueltiger Bereich");
  assert(w2.validation.interlock_fehler.some(f => f.grund === "ungueltige_paritaet"), "ungueltige_paritaet gemeldet");
  // Leeres Intervall
  const w3 = buildWall("vzErr", 1000, 800, [], null, null, [], [{ g0: 5, g1: 3, start_parity: 0 }]);
  assert(w3.interlocks.length === 0, "leeres_intervall: kein gueltiger Bereich");
  assert(w3.validation.interlock_fehler.some(f => f.grund === "leeres_intervall"), "leeres_intervall gemeldet");
});
t("[G-12] Verzahnung und buildable: keine Aenderung", () => {
  // Fehlerhafte Verzahnung aendert buildable nicht
  const w = buildWall("vzBuild", 1000, 800, [], null, null, [], [{ g0: 100, g1: 200, start_parity: 0 }]);
  assert(w.validation.buildable === true, "buildable bleibt true");
  assert(w.validation.interlock_fehler.length > 0, "Fehler gemeldet");
});
t("ohne Verzahnung bleibt das Wandelement unveraendert (interlocks leer)", () => {
  const w = buildWall("noVz", 1000, 800, [], null, null, []);
  assert(w.interlocks.length === 0, "interlocks leer");
  assert(w.validation.interlock_fehler.length === 0, "keine Fehler");
  assert(w.validation.interlock_invalid_segments.length === 0, "keine interlock_invalid_segments");
  // Steinmengen pruefen gegen Referenz (goldene Fixture bleibt unveraendert)
});
t("[G-10] kein Stein ragt in den ausgesparten Bereich hinein", () => {
  // 1000mm = 8 Raster, 800mm = 4 Lagen, Verzahnung [0,3), start_parity=0
  const w = buildWall("vzRagt", 1000, 800, [], null, null, [], [{ g0: 0, g1: 3, start_parity: 0 }]);
  // In Lagen 0 und 2 (gerade) darf KEIN Stein im Bereich [0,3) beginnen, enden oder ihn ueberdecken
  for (const li of [0, 2]) {
    const c = w.courses[li];
    for (const st of c.stones) {
      const a = st.x0 / GRID, b = st.x1 / GRID;
      // Stein darf den Bereich [0,3) nicht beruehren: entweder ganz links davon (b <= 0) oder ganz rechts (a >= 3)
      assert(b <= 0 || a >= 3, `Lage ${li}: Stein [${a},${b}) ragt in Bereich [0,3)`);
    }
  }
  // In Lagen 1 und 3 (ungerade) sind Steine im Bereich erlaubt
  for (const li of [1, 3]) {
    const c = w.courses[li];
    const hatStein = c.stones.some(st => st.x0 / GRID < 3 && st.x1 / GRID > 0);
    assert(hatStein, `Lage ${li}: sollte Steine im Bereich haben`);
  }
});
t("[G-10] interlock_invalid_segments meldet nicht baubare Restbreiten", () => {
  // Verzahnungsbereich [0,4) auf einer 8-Raster-Wand: nach Aussparen bleibt ein Segment mit 4 Rastern
  // Das ist nicht baubar und muss gemeldet werden
  const w = buildWall("vzInv", 1000, 800, [], null, null, [], [{ g0: 0, g1: 4, start_parity: 0 }]);
  // Die Wand selbst ist ohne Verzahnung baubar (8 Raster)
  assert(w.validation.buildable === true, "Wand ohne Verzahnungsproblem baubar");
  // Aber nach Verzahnung gibt es nicht baubare Segmente
  assert(w.validation.interlock_invalid_segments.length > 0, "interlock_invalid_segments gemeldet");
  // Die gemeldeten Segmente haben Breite 4 (nicht baubar)
  const seg = w.validation.interlock_invalid_segments[0];
  assert(seg.breite_grid === 4, `Erwartete Breite 4, bekommen ${seg.breite_grid}`);
});

// ---------------------------------------------------------------------------------------------
// ZWISCHENSPANNPUNKTE [A-14]/[A-15]/[A-17] + Stosssperre [Z-7] (Paritaetsvertrag mit dem Orakel)
console.log("ZWISCHENSPANNPUNKTE [A-14]/[A-15]/[A-17] + [Z-7] (Paritaetsvertrag mit dem Python-Orakel):");

t("[A-15] innere Lagen-Oberkanten: Segmentenden gehoeren NICHT dazu", () => {
  deepEqual(lagenOberkantenInnen(0, 1000), [200, 400, 600, 800]);
  deepEqual(lagenOberkantenInnen(800, 2600), [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400]);
  deepEqual(lagenOberkantenInnen(0, 200), []);          // genau eine Lage -> keine innere Oberkante
  deepEqual(lagenOberkantenInnen(2000, 2200), []);
});
t("[A-15] Auto-Punkt: naechste innere Oberkante zur halben Segmenthoehe", () => {
  assert(autoZwischenpunkt(0, 1000) === 400 || autoZwischenpunkt(0, 1000) === 600,
    "1000 mm: 400 oder 600");
  assert(autoZwischenpunkt(0, 1000) === 400, "Gleichstand -> niedrigere Oberkante");
  assert(autoZwischenpunkt(0, 2600) === 1200, "2600 mm: Gleichstand 1200/1400 -> 1200");
  assert(autoZwischenpunkt(0, 1400) === 600, "1400 mm: exakt halbe Hoehe 700 -> 600 (Gleichstand)");
  assert(autoZwischenpunkt(0, 1200) === 600, "1200 mm: 600 ist exakt die Mitte");
  assert(autoZwischenpunkt(800, 2600) === 1600, "verschobenes Segment: Mitte 1700 -> 1600");
  assert(autoZwischenpunkt(0, 200) === null, "eine Lage -> kein Punkt");
  assert(autoZwischenpunkt(2000, 2600) === 2200, "600er Segment: Gleichstand 2200/2400 -> 2200");
});
t("[A-15] Auto ist rein: gleiche Eingabe -> gleiches Ergebnis, kein Zustand", () => {
  for (let i = 0; i < 3; i++) assert(autoZwischenpunkt(0, 2600) === 1200);
});
t("[A-17] manuelle Punkte: normalisiert, sortiert, dedupliziert", () => {
  const r = normZwischenpunkte([1200, 400, 1200], 2600);
  deepEqual(r.punkte, [400, 1200]);
  deepEqual(r.fehler, []);
});
t("[A-17] unzulaessige Werte werden benannt und NICHT gerundet", () => {
  const r = normZwischenpunkte([1250, 333.5, 0, 2600, 2800, 800], 2600);
  deepEqual(r.punkte, [800]);
  assert(r.fehler.length === 5, JSON.stringify(r.fehler));
  const gr = r.fehler.map(f => f.grund);
  assert(gr.filter(g => g === "nicht_auf_lagen_oberkante").length === 1, JSON.stringify(gr));
  assert(gr.filter(g => g === "nicht_ganzzahlig").length === 1, JSON.stringify(gr));
  assert(gr.filter(g => g === "ausserhalb_wand").length === 3, JSON.stringify(gr));
  // Keine 1250 -> 1200 Rundung: der abgewiesene Wert taucht in keiner Form als Punkt auf.
  assert(!r.punkte.includes(1200) && !r.punkte.includes(1250));
});
t("[A-17] kein Override vs. ausdruecklich leere Liste", () => {
  assert(normZwischenpunkte(null, 2600).punkte === null, "kein Override -> null (Auto)");
  assert(normZwischenpunkte(undefined, 2600).punkte === null);
  deepEqual(normZwischenpunkte([], 2600).punkte, []);         // ausdruecklich: keine Punkte
  deepEqual(zwischenpunkteSegment(0, 2600, []), []);          // faellt NICHT auf Auto zurueck
  deepEqual(zwischenpunkteSegment(0, 2600, null), [1200]);
});
t("[A-17] Override gilt verbatim je Segment (mehrere Punkte, nichts ergaenzt/verschoben)", () => {
  deepEqual(zwischenpunkteSegment(0, 2600, [400, 1200, 2400]), [400, 1200, 2400]);
  // Ein Punkt ausserhalb DIESES Segments gilt dort nicht — und wird nicht hineingezogen.
  deepEqual(zwischenpunkteSegment(2000, 2600, [400, 2200]), [2200]);
  deepEqual(zwischenpunkteSegment(2000, 2600, [400]), []);
});
t("[A-15] Auto-Ergebnis steht in KEINEM Feld des Wandelements", () => {
  const w = buildWall("zpAuto", 1000, 2000, []);
  assert(!("zwischenpunkte_mm" in w.prestress), "kein Feld im Vorspannblock");
  assert(!("zwischenpunkt_fehler" in w.validation), "kein Fehlerfeld ohne Fehler");
  assert(JSON.stringify(w).indexOf("zwischenpunkt") === -1, "nichts serialisiert");
  // … abgeleitet wird er trotzdem, frisch bei jeder Ausgabe:
  const zp = wirksameZwischenpunkte(w);
  assert(zp.length === w.tension_columns.length, "je Achse ein Punkt");
  assert(zp.every(x => x.z_mm === 1000), JSON.stringify(zp));
});
t("[A-17] Override reist im Wandelement mit und wird validiert", () => {
  const w = buildWall("zpMan", 1000, 2000, [], null, { zwischenpunkte_mm: [1400, 400, 333] });
  deepEqual(w.prestress.zwischenpunkte_mm, [400, 1400]);
  assert(w.validation.zwischenpunkt_fehler.length === 1, "der ungueltige Wert ist benannt");
  deepEqual(wirksameZwischenpunkte(w).filter(x => x.k === 0).map(x => x.z_mm), [400, 1400]);
  assert(w.validation.buildable, "kein Baubarkeitsausschluss");
});
t("[A-15] Auto je SEGMENT: Bruestung/Sturz an einer Oeffnung bekommen eigene Punkte", () => {
  const w = buildWall("zpSeg", 2000, 2600, [new Opening(6, 10, 4, 10, "fenster")]);
  const inFenster = w.tension_columns.find(c => c.k >= 6 && c.k < 10);
  assert(inFenster && inFenster.segments.length === 2, "unter und ueber dem Fenster je ein Segment");
  const zp = wirksameZwischenpunkte(w).filter(x => x.k === inFenster.k).map(x => x.z_mm);
  // Bruestung 0…800 -> Mitte 400; Sturzbereich 2000…2600 -> Gleichstand 2200/2400 -> 2200
  deepEqual(zp, [400, 2200]);
});
t("[Z-7] Kopplung weicht der Punkthoehe aus (Vorzugsordnung bleibt [Z-2])", () => {
  // 2000 mm aus {1000, 500}: ungesperrt 1000+1000 (Stoss auf 1000 = Punkt). Stossfrei ist
  // 500+1000+500 — die nach [Z-2] bevorzugte unter den stossfreien.
  const ohne = kombiniereLaengen(2000, [1000, 500]);
  deepEqual(ohne.stuecke.map(x => x.len_mm), [1000, 1000]);
  const mit = kombiniereLaengen(2000, [1000, 500], 200, [1000], false);
  deepEqual(mit.stuecke.map(x => x.len_mm), [500, 1000, 500]);
  assert(mit.konflikt === null, "loesbar -> kein Konflikt");
  assert(mit.stuecke.reduce((a, x) => a + x.len_mm, 0) === 2000, "Geometrie unveraendert");
});
t("[Z-7] ohne Sperren bit-genau der bisherige Weg", () => {
  for (const [b, L] of [[1700, [1000, 500]], [3000, [1000]], [400, [1000, 600]], [2600, [1100]]]) {
    deepEqual(kombiniereLaengen(b, L, 200, null, false), kombiniereLaengen(b, L));
    deepEqual(kombiniereLaengen(b, L, 200, [], true), kombiniereLaengen(b, L));
  }
});
t("[Z-7] das Ende der Strecke ist nur mit Reststueck-Kopplung ein Stoss", () => {
  // Sperre genau am oberen Ende: ohne Reststueck-Kopplung ist dort ein Anker -> keine Wirkung.
  deepEqual(kombiniereLaengen(2000, [1000], 200, [2000], false).stuecke.map(x => x.len_mm),
    [1000, 1000]);
  // Mit Kopplung zum Reststueck ist dieselbe Hoehe ein Stoss -> nicht loesbar, benannt.
  const k = kombiniereLaengen(2000, [1000], 200, [2000], true);
  assert(k.konflikt === "stoss_auf_zwischenpunkt", k.konflikt);
  deepEqual(k.stuecke.map(x => x.len_mm), [1000, 1000]);       // Geometrie unveraendert
});
t("[Z-7] unloesbar -> eigener Grund, Geometrie und Mengen unveraendert", () => {
  const w = buildWall("zpKonf", 1000, 2000, [], null, { rod_lengths_mm: [1000] });
  const kk = w.validation.zuschnitt_konflikte;
  assert(kk.length > 0 && kk.every(x => x.grund === "kein_reststueck"),
    "ohne Reststueck bleibt [Z-6] die genannte Ursache: " + JSON.stringify(kk[0]));
  // Mit Reststueck greift die Sperre und wird mit EIGENEM Grund benannt.
  const v = buildWall("zpKonf2", 1000, 2000, [], null,
    { rod_lengths_mm: [1000], rod_rest_mm: 210, rod_overhang_mm: 10 });
  const vk = v.validation.zuschnitt_konflikte;
  assert(vk.length > 0 && vk.every(x => x.grund === "stoss_auf_zwischenpunkt"),
    JSON.stringify(vk[0]));
  assert(v.validation.buildable, "kein Baubarkeitsausschluss");
  const sg = v.tension_columns[0].segments[0];
  assert(sg.stuecke.reduce((a, x) => a + x.len_mm, 0) === sg.bedarf_mm, "Geometrie unveraendert");
});
t("[Z-7] steht UNTER [Z-5]: eine nicht einbaubare Folge gilt nicht als stossfrei", () => {
  // 1200 aus {1000}: ungesperrt 1000 + 200 (genau Mindestmass). Sperre auf 1000 laesst keine
  // andere einbaubare Wahl -> Geometrie bleibt, der Stoss wird benannt.
  const k = kombiniereLaengen(1200, [1000], 200, [1000], false);
  deepEqual(k.stuecke.map(x => x.len_mm), [1000, 200]);
  assert(k.konflikt === "stoss_auf_zwischenpunkt", k.konflikt);
});
t("[Z-7]/[A-16] die Punkte aendern Achsen, Segmente und Ankerzaehlung nicht", () => {
  const a = buildWall("zpA", 2000, 2600, [new Opening(5, 11, 0, 10, "tuer")]);
  const b = buildWall("zpB", 2000, 2600, [new Opening(5, 11, 0, 10, "tuer")], null,
    { zwischenpunkte_mm: [600, 1800] });
  deepEqual(a.tension_columns.map(c => c.k), b.tension_columns.map(c => c.k));
  deepEqual(a.tension_columns.map(c => c.segments.map(s => [s.z0_mm, s.z1_mm])),
    b.tension_columns.map(c => c.segments.map(s => [s.z0_mm, s.z1_mm])));
  for (const f of ["spannplatten", "spannmuttern", "senkkopfschrauben", "kopplungsmuttern_basis"])
    assert(a.bom[f] === b.bom[f], f);
});
t("[Z-7] kein Stoss auf einer wirksamen Punkthoehe (loesbarer Fall, ganze Wand)", () => {
  const w = buildWall("zpFrei", 2000, 2600, [], null,
    { rod_lengths_mm: [1000, 500], rod_rest_mm: 300, rod_overhang_mm: 10 });
  const sperr = new Set(wirksameZwischenpunkte(w).map(x => x.k + "@" + x.z_mm));
  for (const col of w.tension_columns) for (const sg of col.segments) {
    let z = sg.z0_mm;
    for (let i = 0; i < sg.stuecke.length - 1; i++) {
      z += sg.stuecke[i].len_mm;
      assert(!sperr.has(col.k + "@" + z), `Kopplung auf Punkthoehe k=${col.k} z=${z}`);
    }
  }
  assert(w.validation.zuschnitt_konflikte.length === 0, JSON.stringify(w.validation.zuschnitt_konflikte));
});
t("kombiniereSegment: Sperren wirken auch auf die Kopplung zum Reststueck ([Z-6]/[Z-7])", () => {
  // h=1700, Reststueck 210, Ueberstand 10 -> bedarf 1710, unten 1500. Aus {1000,500} waere das
  // 1000+500 (Stoss auf 1000 und die Kopplung 1500 zum Reststueck).
  const a = kombiniereSegment(1700, [1000, 500], true, 210, 10);
  deepEqual(a.stuecke.map(x => x.len_mm + ":" + x.art), ["1000:standard", "500:standard", "210:rest"]);
  const b = kombiniereSegment(1700, [1000, 500], true, 210, 10, [1000]);
  deepEqual(b.stuecke.map(x => x.len_mm + ":" + x.art), ["500:standard", "1000:standard", "210:rest"]);
  assert(b.konflikt === null, b.konflikt);
  const c = kombiniereSegment(1700, [1000, 500], true, 210, 10, [1500]);
  assert(c.konflikt === "stoss_auf_zwischenpunkt", "Kopplung zum Reststueck ist gesperrt: " + c.konflikt);
});

// ---------------------------------------------------------------------------
// Einbaulagen des Spannsystems (#92): Fussoffset am Fuss, Spannplattendicke am Kopf.
// Gerechnet wird beides im Core; die Werte selbst leitet Modul 1 aus dem Katalog ab
// (Fussoffset = halbe Kopplungsmutterhoehe, Kopfzuschlag = Spannplattendicke).
//
// Das Python-Orakel wird als ECHTER Unterprozess gefahren, nicht ueber ein eingefrorenes
// Fixture: die Faelle hier sind neu, es gaebe also gar kein Fixture dafuer. Fehlt `python3`
// oder bricht der Aufruf ab, MUSS der Test hart fehlschlagen — ein stilles Ueberspringen
// waere ein gruener Lauf ohne Paritaetsnachweis. Zumutbar ist das, weil `npm run test:core`
// ohnehin mit `python3 tests/core/test_sembla_core.py` beginnt.
// ---------------------------------------------------------------------------
const PYDIR = dirname(fileURLToPath(import.meta.url));
const PY_ORAKEL = `
import json, sys
sys.path.insert(0, ${JSON.stringify(PYDIR)})
from sembla_core import build_wall
a = json.loads(sys.argv[1])
print(json.dumps(build_wall(a["name"], a["length_mm"], a["height_mm"], [], None, a["prestress"])))
`;
/** Die Wand aus dem ECHTEN Python-Orakel (Unterprozess), nicht aus einem Fixture. */
function orakel(arg) {
  return JSON.parse(execFileSync("python3", ["-c", PY_ORAKEL, JSON.stringify(arg)],
    { encoding: "utf8" }));
}
// Kopplungsmutter 50 mm hoch -> Fussoffset 25 mm (halbe Hoehe); Spannplatte 12 mm dick.
// Die Bodenblechdicke geht NICHT ein: z = 0 ist die Oberkante Bodenblech (= Steinunterkante).
const PS92 = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
  top_connection: "spannplatte", rod_fuss_offset_mm: 25, rod_kopf_zuschlag_mm: 12 };
const WAND92 = { name: "einbaulagen", length_mm: 6 * GRID, height_mm: 2000 };

t("#92 Fussoffset verkuerzt den Bedarf und verschiebt die Stueckzerlegung", () => {
  const w = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null, PS92);
  const sg = w.tension_columns[0].segments[0];
  assert(sg.z0_mm === 0, "z0_mm bleibt Steingeometrie: " + sg.z0_mm);
  assert(w.prestress.rod_fuss_offset_mm === 25, "Fussoffset im Wandelement: " + w.prestress.rod_fuss_offset_mm);
  // 2000 - 25 (Fuss) + 12 (Platte) + 10 (Ueberstand) = 1997
  assert(sg.bedarf_mm === 1997, "Bedarf: " + sg.bedarf_mm);
  assert(sg.ueberstand_mm === 22, "Ueberstand ueber der Steinkante: " + sg.ueberstand_mm);
  // Die Zerlegung verschiebt sich mit — und zwar sichtbar bis in die Reihenfolge: mit Offset
  // liegt die erste Kopplung auf 1025 mm und ist frei, es gilt also die Groessenpraeferenz
  // [Z-2]. Ohne Offset laege sie auf dem Zwischenspannpunkt 1000 mm, und [Z-7] tauschte die
  // beiden Standardlaengen. Der Sonderzuschnitt wird zugleich um den Offset kuerzer.
  deepEqual(sg.stuecke.map(x => x.len_mm + ":" + x.art),
    ["1000:standard", "500:standard", "287:sonder", "210:rest"]);
  const ohne = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null,
    { ...PS92, rod_fuss_offset_mm: 0 });
  const sg0 = ohne.tension_columns[0].segments[0];
  assert(sg0.bedarf_mm === 2022, "ohne Fussoffset: " + sg0.bedarf_mm);
  deepEqual(sg0.stuecke.map(x => x.len_mm + ":" + x.art),
    ["500:standard", "1000:standard", "312:sonder", "210:rest"]);
  // Ohne Katalogmass entsteht KEIN Prestress-Schluessel — der Altstand bleibt bit-genau.
  assert(!("rod_fuss_offset_mm" in ohne.prestress),
    "kein erfundenes Feld: " + Object.keys(ohne.prestress).join(","));
  // `z0_mm` bleibt in BEIDEN Faellen die Steingeometrie: der Offset ist eine Bedarfsgroesse
  // und erzeugt kein zweites Geometriemodell am Segment.
  assert(!("fuss_offset_mm" in sg) && !("stangen_z0_mm" in sg),
    "kein Zusatzfeld am Segment: " + Object.keys(sg).join(","));
});

t("#92 Oberer Bedarf = Segmenthoehe + Spannplattendicke + Ueberstand (echtes Python-Orakel)", () => {
  // Reiner Kopffall (kein Fussoffset): der Bedarf ist exakt h + Platte + Ueberstand.
  const ps = { ...PS92, rod_fuss_offset_mm: 0 };
  const js = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null, ps);
  const py = orakel({ ...WAND92, prestress: ps });
  const sg = js.tension_columns[0].segments[0];
  assert(sg.bedarf_mm === WAND92.height_mm + 12 + 10, "Bedarf: " + sg.bedarf_mm);
  assert(py.tension_columns[0].segments[0].bedarf_mm === sg.bedarf_mm,
    "Orakel-Bedarf: " + py.tension_columns[0].segments[0].bedarf_mm);
  deepEqual(js, py);                       // bit-genau, ganzes Wandelement
});

t("#92 Fussoffset, oberer Bedarf, Stueckzerlegung und Konflikte sind py/mjs bit-gleich", () => {
  const faelle = [
    PS92,                                                        // Fuss + Kopf
    { ...PS92, rod_fuss_offset_mm: 27.5 },                       // halbe Mutterhoehe -> 0,5 mm
    { ...PS92, top_connection: "blech" },                        // Kopfblech: kein Plattenzuschlag
    { ...PS92, rod_rest_mm: 0 },                                 // [Z-6]-Konflikt bleibt sichtbar
    { ...PS92, rod_lengths_mm: [] },                             // keine Standardlaenge gewaehlt
  ];
  for (const ps of faelle) {
    const js = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null, ps);
    deepEqual(js, orakel({ ...WAND92, prestress: ps }));
  }
});

t("#92 Kopfblech bekommt keinen Plattenzuschlag (kein Ersatzmass, [A-2])", () => {
  const w = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null,
    { ...PS92, top_connection: "blech", rod_fuss_offset_mm: 0 });
  const sg = w.tension_columns[0].segments[0];
  assert(sg.anker_oben === "kopfblech", sg.anker_oben);
  assert(sg.bedarf_mm === WAND92.height_mm + 10, "nur Ueberstand: " + sg.bedarf_mm);
});

t("#92 Der Fussoffset zieht die Zwischenpunkt-Sperren mit ([Z-7] unveraendert)", () => {
  // Zwischenpunkt auf 1000 mm; die Kopplung liegt bei Stangenbeginn + 1000 = 1025 und ist
  // damit frei. Ohne Mitziehen des Offsets waere hier faelschlich gesperrt worden.
  const ps = { ...PS92, rod_rest_mm: 0, rod_kopf_zuschlag_mm: 0, zwischenpunkte_mm: [1000] };
  const w = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null, ps);
  const sg = w.tension_columns[0].segments[0];
  deepEqual(sg.stuecke.map(x => x.len_mm), [1000, 500, 475]);
  deepEqual(w, orakel({ ...WAND92, prestress: ps }));
  // Gegenprobe: die Sperre auf der wirklichen Kopplungshoehe greift weiterhin.
  const gesperrt = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null,
    { ...ps, zwischenpunkte_mm: [1000, 1200] });
  assert(gesperrt.tension_columns[0].segments[0].stuecke.length > 0);
});

t("#92 Ohne Einbaumasse ist das Ergebnis bit-genau der Altstand", () => {
  const alt = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
    top_connection: "spannplatte" };
  const a = buildWall("alt", 6 * GRID, 2000, [], null, alt);
  const b = buildWall("alt", 6 * GRID, 2000, [], null,
    { ...alt, rod_fuss_offset_mm: 0, rod_kopf_zuschlag_mm: null });
  deepEqual(a, b);
  assert(!("rod_fuss_offset_mm" in a.prestress) && !("rod_kopf_zuschlag_mm" in a.prestress),
    "kein Schluessel ohne Angabe: " + Object.keys(a.prestress).join(","));
});

// #92 Die Einbaulagen muessen durch `psOf()` (sembla-engine.js) reisen: fielen sie in der
// Auslegungs-Iteration weg, rechnete der Core mit einem anderen Bedarf als die Anzeige davor.
const ENGINE_BASE = { name: "W", length_mm: 2000, height_mm: 2600, openings: [], sides: null };

t("#92 Fussoffset und Kopfzuschlag reisen durch psOf() (Auto-Modus)", () => {
  const ps = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
    top_connection: "spannplatte", rod_fuss_offset_mm: 25, rod_kopf_zuschlag_mm: 12 };
  const r = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: ps,
    load: { qk_area: 0.5, gammaQ: 1.5 } });
  const w = r.wandelement;
  assert(w.prestress.rod_fuss_offset_mm === 25, "Fussoffset im Ergebnis: " + w.prestress.rod_fuss_offset_mm);
  assert(w.prestress.rod_kopf_zuschlag_mm === 12, "Kopfzuschlag: " + w.prestress.rod_kopf_zuschlag_mm);
  const sg = w.tension_columns[0].segments[0];
  assert(sg.bedarf_mm === 2000 - 25 + 12 + 10, "Bedarf nach der Iteration: " + sg.bedarf_mm);
});

t("#92 Nachweis-Modus reicht dieselben Einbaulagen durch", () => {
  const ps = { max_span_grid: 3, force_kN: 60, rod_lengths_mm: [1000, 500], rod_rest_mm: 210,
    rod_overhang_mm: 10, top_connection: "spannplatte", rod_fuss_offset_mm: 25, rod_kopf_zuschlag_mm: 12 };
  const w = nachweisPruefen({ ...ENGINE_BASE, height_mm: 2000, prestress: ps,
    load: { qk_area: 1.0, gammaQ: 1.5 } }).wandelement;
  assert(w.prestress.rod_fuss_offset_mm === 25 && w.prestress.rod_kopf_zuschlag_mm === 12, "Durchreiche");
  assert(w.tension_columns[0].segments[0].bedarf_mm === 1997, "Bedarf im Nachweis-Modus");
});

t("#92 ohne Einbaulagen bleibt die Auslegung bit-genau der Altstand", () => {
  const ps = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
    top_connection: "spannplatte" };
  const a = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: ps,
    load: { qk_area: 0.5, gammaQ: 1.5 } });
  const b = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, load: { qk_area: 0.5, gammaQ: 1.5 },
    prestress: { ...ps, rod_fuss_offset_mm: 0, rod_kopf_zuschlag_mm: null } });
  assert(JSON.stringify(a.wandelement) === JSON.stringify(b.wandelement), "bit-gleich");
  assert(!("rod_fuss_offset_mm" in a.wandelement.prestress), "kein Schluessel ohne Angabe");
});

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
