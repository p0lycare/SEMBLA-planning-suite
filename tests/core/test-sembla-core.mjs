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
  AUSGLEICH_ACHSVERSATZ, AUSGLEICH_DICHTE_JE_M, verteileAusgleichspunkte, normAusgleichspunkte,
  DECKENANSCHLUSS_JE_M, verteileDeckenanschluss, normDeckenanschluss,
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
t("beide Wandenden auf der 2. Rasterachse + neben Tuer haben Saeulen", () => {
  // [V-3]/[V-11] (#104): links 1, rechts N-2 — nie im aeusseren Randfeld (0 bzw. N-1).
  for (const key of Object.keys(REFERENCE_WALLS)) {
    const w = buildReference(key);
    const ks = new Set(w.tension_columns.map(c => c.k));
    assert(ks.has(1) && ks.has(w.N_grid - 2), `${key}: Enden auf 1 / N-2`);
    assert(!ks.has(0) && !ks.has(w.N_grid - 1), `${key}: Randfeld bleibt frei`);
  }
  const w = buildReference("ref2_wand_tuer");
  const ks = new Set(w.tension_columns.map(c => c.k));
  const op = w.openings[0];
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
// ---- [V-3]/[V-11] Grundachsen aus dem Verband der untersten Lage (Issue #104) ----
// Die vier geforderten Randverbaende getrennt. Die Achslisten sind eingefroren, weil genau ihre
// Lage die Fachregel ist — nicht nur ihre Anzahl. Der Abgleich mit dem echten Python-Orakel
// steht weiter unten (die Orakel-Hilfe ist erst dort definiert).
const ksOf = (ps, L = 2000, ops = []) =>
  buildWall("sa", L, 2600, ops, null, ps).tension_columns.map(c => c.k);
const lage0Of = (L, ops = []) =>
  buildWall("l0", L, 2600, ops).courses[0].stones.map(s => (s.x1 - s.x0) / GRID);

t("[V-3] i3 an beiden Raendern: Grundachsen sind die Steinmitten", () => {
  deepEqual(lage0Of(6 * GRID), [3, 3]);
  const ks = ksOf({ max_span_grid: 3 }, 6 * GRID);
  deepEqual(ks, [1, 3, 4]);
  assert(!ks.includes(0) && !ks.includes(5), "Randfeld bleibt frei");
});
t("[V-11] i2 nur am Anfang: linke Achse auf der 2. Rasterachse", () => {
  deepEqual(lage0Of(5 * GRID), [2, 3]);
  const ks = ksOf({ max_span_grid: 3 }, 5 * GRID);
  deepEqual(ks, [1, 3]);
  assert(!ks.includes(0) && !ks.includes(4), "Randfeld bleibt frei");
});
t("[V-11] i2 nur am Ende: rechte Achse auf der 2. Rasterachse von rechts", () => {
  // Eine bis zum Boden reichende Tuer erzwingt den i2-Abschluss rechts.
  const ops = [new Opening(3, 7, 0, 8, "tuer")];
  deepEqual(lage0Of(9 * GRID, ops), [3, 2]);
  const ks = ksOf({ max_span_grid: 3 }, 9 * GRID, ops);
  assert(ks.includes(1) && ks.includes(7), "1 und N-2 gesetzt");
  assert(!ks.includes(0) && !ks.includes(8), "Randfeld bleibt frei");
  deepEqual(ks, [1, 2, 5, 7]);
});
t("[V-11] i2 an beiden Raendern", () => {
  deepEqual(lage0Of(4 * GRID), [2, 2]);
  const ks = ksOf({ max_span_grid: 3 }, 4 * GRID);
  deepEqual(ks, [1, 2]);
  assert(!ks.includes(0) && !ks.includes(3), "Randfeld bleibt frei");
});
t("[V-11] einzelner i2: genau EINE Achse auf der 2. Rasterachse", () => {
  // Kuerzestmoegliche Wand — der einzige i2 ist erster UND letzter Stein, es gilt die
  // Anfangsregel. Ohne diesen Vorrang staenden 1 (a+1) und 0 (N-2) gegeneinander.
  deepEqual(lage0Of(2 * GRID), [2]);
  deepEqual(ksOf({ max_span_grid: 3 }, 2 * GRID), [1]);
});
t("[V-11] ein i2 im Inneren erzeugt KEINE Grundachse", () => {
  // [N3] Ein i2 hat keine Rastermitte — es wird keine erfunden; die Abdeckung macht [V-2].
  const ops = [new Opening(6, 10, 0, 8, "tuer")];
  deepEqual(lage0Of(14 * GRID, ops), [3, 3, 2, 2]);
  const ks = ksOf({ max_span_grid: 3 }, 14 * GRID, ops);
  for (const k of [1, 4, 12]) assert(ks.includes(k), `Grundachse ${k} fehlt`);
  assert(!ks.includes(0) && !ks.includes(13), "Randfeld bleibt frei");
  deepEqual(ks, [1, 3, 4, 5, 8, 10, 12]);
});
t("[V-3] JEDE i3-Mitte der untersten Lage ist eine Grundachse (MUSS statt SOLL)", () => {
  for (const L of [2000, 5000, 3000]) {
    const w = buildWall("v3", L, 2600, [], null, { max_span_grid: 3 });
    const ks = new Set(w.tension_columns.map(c => c.k));
    const mitten = w.courses[0].stones
      .filter(s => (s.x1 - s.x0) / GRID === 3).map(s => s.x0 / GRID + 1);
    assert(mitten.length > 0, `Testwand L=${L} ohne i3 in der untersten Lage`);
    for (const m of mitten) assert(ks.has(m), `L=${L}: i3-Mitte ${m} fehlt`);
  }
  for (const key of Object.keys(REFERENCE_WALLS)) {
    const w = buildReference(key);
    const ks = new Set(w.tension_columns.map(c => c.k));
    for (const s of w.courses[0].stones)
      if ((s.x1 - s.x0) / GRID === 3)
        assert(ks.has(s.x0 / GRID + 1), `${key}: i3-Mitte ${s.x0 / GRID + 1} fehlt`);
  }
});
t("[V-5] abgeloest: die gespeicherte Startachse wirkt nicht mehr (M5)", () => {
  for (const L of [2 * GRID, 4 * GRID, 5 * GRID, 2000, 3000]) {
    const a = buildWall("sa0", L, 2600, [], null, { max_span_grid: 3, start_axis_grid: 0 });
    const b = buildWall("sa1", L, 2600, [], null, { max_span_grid: 3, start_axis_grid: 1 });
    deepEqual(a.tension_columns, b.tension_columns);
    // Das Feld bleibt lesbarer Altbestand — es wird nur nicht mehr angewendet ([N5]).
    assert(a.prestress.start_axis_grid === 0 && b.prestress.start_axis_grid === 1,
      `L=${L}: Feld muss unveraendert mitreisen`);
  }
  const ohne = buildWall("ohne", 2000, 2600, [], null, { max_span_grid: 3 });
  deepEqual(ohne.tension_columns.map(c => c.k), [1, 3, 5, 8, 11, 13, 14]);
});
t("Zusatzachsen bleiben additiv, columns_grid hat Vorrang", () => {
  // [M6] Oeffnungskanten ([V-8]) ergaenzen die Grundachsen weiterhin.
  const op = [new Opening(5, 11, 0, 10, "tuer")];
  const w = buildWall("sa", 2000, 2600, op, null, { max_span_grid: 3 });
  const ks = new Set(w.tension_columns.map(c => c.k));
  assert(ks.has(4) && ks.has(11), "Oeffnungskanten");
  assert(!ks.has(0) && !ks.has(15), "aeusseres Randfeld bleibt frei");
  assert(ks.has(14), "N-2 traegt das rechte Wandende");
  // [N1]/[V-9] Manuelle Achsen werden weder ergaenzt noch verschoben.
  const m = buildWall("sa", 2000, 2600, [], null,
    { max_span_grid: 3, start_axis_grid: 1, columns_grid: [0, 8, 15] });
  deepEqual(m.tension_columns.map(c => c.k), [0, 8, 15]);
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
  // Seit der Vorratssatz 250 mm fuehrt, deckt ihn eine 250er Wand exakt ab. Der Sonderpfad
  // wird deshalb ueber einen eingeschraenkten Vorratssatz geprueft: 375 mm passt arithmetisch
  // nicht in 250 mm, also bleibt genau EIN Sonderzuschnitt.
  const w = buildWall("bbs", 250, 2600, [], null, { blech_lengths_mm: [375] });
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
  assert(r.teile.map(tl => tl.raster_mm).join("+") === "1125+1125+250",
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
  // Geprueft wird der Override je Achse — welche Rasterlage die erste Achse hat, ist dafuer
  // unerheblich (seit #104 ist es 1 statt 0).
  const k0 = w.tension_columns[0].k;
  deepEqual(wirksameZwischenpunkte(w).filter(x => x.k === k0).map(x => x.z_mm), [400, 1400]);
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
// Einbaulagen des Spannsystems (#92): Fussoffset am Fuss [A-19], Spannplattendicke am Kopf
// [Z-8]. Gerechnet wird beides im Core; die Werte selbst leitet Modul 1 aus dem Katalog ab
// ([A-19] Fussoffset = halbe Kopplungsmutterhoehe, [Z-8] Kopfzuschlag = Spannplattendicke).
// Die Tests hier halten GENAU die im Handbuch dokumentierte Wirkung beider Regeln fest.
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

t("#92 [A-19] Fussoffset verkuerzt den Bedarf und verschiebt die Stueckzerlegung", () => {
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

t("#92 [Z-8] Oberer Bedarf = Segmenthoehe + Spannplattendicke + Ueberstand (echtes Python-Orakel)", () => {
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

t("#92 [A-19]/[Z-8] Fussoffset, oberer Bedarf, Stueckzerlegung und Konflikte sind py/mjs bit-gleich", () => {
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

t("#92 [Z-8] Kopfblech bekommt keinen Plattenzuschlag (kein Ersatzmass, [A-2])", () => {
  const w = buildWall(WAND92.name, WAND92.length_mm, WAND92.height_mm, [], null,
    { ...PS92, top_connection: "blech", rod_fuss_offset_mm: 0 });
  const sg = w.tension_columns[0].segments[0];
  assert(sg.anker_oben === "kopfblech", sg.anker_oben);
  assert(sg.bedarf_mm === WAND92.height_mm + 10, "nur Ueberstand: " + sg.bedarf_mm);
});

t("#92 [A-19] Der Fussoffset zieht die Zwischenpunkt-Sperren mit ([Z-7] unveraendert)", () => {
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

t("#92 [A-19]/[Z-8] Fussoffset nur am Bodenblech, Kopfzuschlag nur unter der Spannplatte", () => {
  // Wand mit Fenster: die Spalten unter/ueber der Oeffnung liefern die drei Faelle, die die
  // beiden Regeln unterscheiden — Bruestung (Fuss am Bodenblech, oben KEIN Oberkantenbezug),
  // Sturz (Fuss auf einer Spannplatte, oben Wandoberkante) und die volle Spalte daneben.
  const ps = { ...PS92, zwischenpunkte_mm: [] };
  const w = buildWall("einbaulagen_oeffnung", 8 * GRID, 2000,
    [new Opening(3, 6, 2, 6)], null, ps);
  const inOeffnung = w.tension_columns.filter((c) => 3 <= c.k && c.k < 6);
  assert(inOeffnung.length > 0, "Testvoraussetzung: Spalten an der Oeffnung");
  for (const c of inOeffnung) {
    const bruest = c.segments.find((s) => s.z0_mm === 0);
    const sturz = c.segments.find((s) => s.z1_mm === 2000 && s.z0_mm > 0);
    // [A-19] Die Bruestung sitzt auf dem Bodenblech: der Fussoffset gilt, ihr oberes Ende ist
    // aber ein Zwischenanker — [Z-8] greift dort nicht, es gibt weder Platte noch Ueberstand.
    if (bruest) {
      assert(bruest.anker_unten === "bodenblech", bruest.anker_unten);
      assert(bruest.bedarf_mm === (bruest.z1_mm - bruest.z0_mm) - 25,
        "Bruestung: nur Fussoffset, kein Kopfzuschlag: " + bruest.bedarf_mm);
    }
    // [A-19] Der Sturz sitzt auf einer Spannplatte, NICHT auf dem Bodenblech: kein Fussoffset.
    // [Z-8] Oben erreicht er die Wandoberkante unter einer Spannplatte: Platte + Ueberstand.
    if (sturz) {
      assert(sturz.anker_unten === "spannplatte", sturz.anker_unten);
      assert(sturz.bedarf_mm === (sturz.z1_mm - sturz.z0_mm) + 12 + 10,
        "Sturz: kein Fussoffset, aber Kopfzuschlag: " + sturz.bedarf_mm);
    }
  }
  // Gegenprobe [Z-8]: dieselbe Wand mit Kopfblech — der Sturz deckt dann NUR den Ueberstand,
  // die Bruestung bleibt bit-gleich (sie hat keinen Oberkantenbezug).
  const wb = buildWall("einbaulagen_oeffnung", 8 * GRID, 2000,
    [new Opening(3, 6, 2, 6)], null, { ...ps, top_connection: "blech" });
  for (const c of wb.tension_columns.filter((x) => 3 <= x.k && x.k < 6)) {
    const sturz = c.segments.find((s) => s.z1_mm === 2000 && s.z0_mm > 0);
    if (sturz) assert(sturz.bedarf_mm === (sturz.z1_mm - sturz.z0_mm) + 10,
      "Kopfblech: nur Ueberstand: " + sturz.bedarf_mm);
  }
  // Die Paritaet zum Python-Orakel deckt der eigene Paritaetsfall oben ab; `orakel()` hier
  // faehrt bewusst OHNE Oeffnungen, und ein zweites Orakel-Skript nur fuer diesen Test waere
  // ein Duplikat. Gemessen wird hier die dokumentierte WIRKUNG, nicht noch einmal die Paritaet.
});

t("#92 [A-19]/[Z-8] Ohne Einbaumasse ist das Ergebnis bit-genau der Altstand", () => {
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

t("#92 [A-19]/[Z-8] Fussoffset und Kopfzuschlag reisen durch psOf() (Auto-Modus)", () => {
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

t("#92 [A-19]/[Z-8] Nachweis-Modus reicht dieselben Einbaulagen durch", () => {
  const ps = { max_span_grid: 3, force_kN: 60, rod_lengths_mm: [1000, 500], rod_rest_mm: 210,
    rod_overhang_mm: 10, top_connection: "spannplatte", rod_fuss_offset_mm: 25, rod_kopf_zuschlag_mm: 12 };
  const w = nachweisPruefen({ ...ENGINE_BASE, height_mm: 2000, prestress: ps,
    load: { qk_area: 1.0, gammaQ: 1.5 } }).wandelement;
  assert(w.prestress.rod_fuss_offset_mm === 25 && w.prestress.rod_kopf_zuschlag_mm === 12, "Durchreiche");
  assert(w.tension_columns[0].segments[0].bedarf_mm === 1997, "Bedarf im Nachweis-Modus");
});

t("#92 [A-19]/[Z-8] ohne Einbaulagen bleibt die Auslegung bit-genau der Altstand", () => {
  const ps = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
    top_connection: "spannplatte" };
  const a = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: ps,
    load: { qk_area: 0.5, gammaQ: 1.5 } });
  const b = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, load: { qk_area: 0.5, gammaQ: 1.5 },
    prestress: { ...ps, rod_fuss_offset_mm: 0, rod_kopf_zuschlag_mm: null } });
  assert(JSON.stringify(a.wandelement) === JSON.stringify(b.wandelement), "bit-gleich");
  assert(!("rod_fuss_offset_mm" in a.wandelement.prestress), "kein Schluessel ohne Angabe");
});

// ---------------------------------------------------------------------------
// SCHLUESSELWEITE DER KOPPLUNGSMUTTER (#97) — reine DURCHREICHE
// ---------------------------------------------------------------------------
// Modul 1 leitet `kupplung_sw_mm` aus dem gewaehlten Katalogprodukt ab; der Kern reicht es
// unveraendert durch, damit die Ausgaben die Mutter spaeter masstaeblich zeichnen koennen, ohne
// den Katalog zu lesen ([D-1]). GERECHNET wird damit nichts — genau das halten die Tests fest:
// das Wandelement ist mit und ohne das Feld bis auf diesen einen Schluessel bit-gleich.
// Gefahren wird derselbe `orakel()`-Weg wie bei #92: das ECHTE Python-Orakel als Unterprozess,
// damit die Behauptung "beide Kerne bit-gleich" fuer dieses Feld auch belegt ist.
const PS97 = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
  top_connection: "spannplatte", kupplung_sw_mm: 17 };
const WAND97 = { name: "schluesselweite", length_mm: 6 * GRID, height_mm: 2000 };
const bau97 = (ps) => buildWall(WAND97.name, WAND97.length_mm, WAND97.height_mm, [], null, ps);

t("#97 Die Schluesselweite reist durch den Kern und ist py/mjs bit-gleich (echtes Python-Orakel)", () => {
  const js = bau97(PS97);
  assert(js.prestress.kupplung_sw_mm === 17,
    "Schluesselweite im Wandelement: " + js.prestress.kupplung_sw_mm);
  deepEqual(js, orakel({ ...WAND97, prestress: PS97 }));   // bit-genau, ganzes Wandelement
  // Ein zweites Produkt mit anderer Schluesselweite ergibt einen anderen Wert — und aendert
  // sonst NICHTS: die Zerlegung ist bis auf diesen Schluessel dieselbe.
  const js24 = bau97({ ...PS97, kupplung_sw_mm: 24 });
  assert(js24.prestress.kupplung_sw_mm === 24, "zweites Mass: " + js24.prestress.kupplung_sw_mm);
  deepEqual({ ...js24, prestress: { ...js24.prestress, kupplung_sw_mm: 17 } }, js);
});

t("#97 Ohne Schluesselweite ist das Ergebnis bit-genau der Altstand", () => {
  const { kupplung_sw_mm, ...ohne } = PS97;                // eslint-disable-line no-unused-vars
  const a = bau97(ohne);
  // Weder `0` noch `null` erfinden ein Feld — und beide sind bit-genau der Fall ohne Angabe.
  deepEqual(bau97({ ...ohne, kupplung_sw_mm: 0 }), a);
  deepEqual(bau97({ ...ohne, kupplung_sw_mm: null }), a);
  assert(!("kupplung_sw_mm" in a.prestress),
    "kein Schluessel ohne Angabe: " + Object.keys(a.prestress).join(","));
  // Und die Nullwirkung gegen den gesetzten Fall: nur dieser eine Schluessel kommt hinzu.
  const mit = bau97(PS97);
  delete mit.prestress.kupplung_sw_mm;
  deepEqual(mit, a);
});

t("#97 Die Schluesselweite reist durch psOf() (Auslegung und Nachweis)", () => {
  // `psOf()` in `sembla-engine.js` ist eine FELDLISTE und baut `prestress` je Iteration neu —
  // ohne Eintrag dort waere das Feld nach der ersten Iteration weg.
  const last = { qk_area: 0.5, gammaQ: 1.5 };
  const auto = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: PS97, load: last });
  assert(auto.wandelement.prestress.kupplung_sw_mm === 17,
    "nach der Auslegung: " + auto.wandelement.prestress.kupplung_sw_mm);
  const nw = nachweisPruefen({ ...ENGINE_BASE, height_mm: 2000, load: { qk_area: 1.0, gammaQ: 1.5 },
    prestress: { ...PS97, max_span_grid: 3, force_kN: 60 } }).wandelement;
  assert(nw.prestress.kupplung_sw_mm === 17, "im Nachweis-Modus: " + nw.prestress.kupplung_sw_mm);
  // Und auch hier: die Auslegung selbst bleibt bit-genau der Altstand.
  const { kupplung_sw_mm, ...ohne } = PS97;                // eslint-disable-line no-unused-vars
  const b = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: ohne, load: last });
  delete auto.wandelement.prestress.kupplung_sw_mm;
  deepEqual(auto.wandelement, b.wandelement);
  assert(!("kupplung_sw_mm" in b.wandelement.prestress), "kein Schluessel ohne Angabe");
});

// ---------------------------------------------------------------------------
// EINBAUHOEHE UND SCHLUESSELWEITE DER SPANNMUTTER (#97) — reine DURCHREICHE
// ---------------------------------------------------------------------------
// Modul 1 leitet `spannmutter_h_mm`/`spannmutter_sw_mm` aus dem gewaehlten Katalogprodukt ab;
// der Kern reicht beide unveraendert durch, damit die Ausgaben die Mutter spaeter masstaeblich
// zeichnen koennen, ohne den Katalog zu lesen ([D-1]). GERECHNET wird damit nichts — genau das
// halten die Tests fest: das Wandelement ist mit und ohne die Felder bis auf diese Schluessel
// bit-gleich. Gefahren wird derselbe `orakel()`-Weg wie bei #92 und der Kopplungsmutter: das
// ECHTE Python-Orakel als Unterprozess, damit "beide Kerne bit-gleich" belegt ist.
const PS97SM = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
  top_connection: "spannplatte", spannmutter_h_mm: 10, spannmutter_sw_mm: 17 };
const WAND97SM = { name: "spannmutter", length_mm: 6 * GRID, height_mm: 2000 };
const bau97sm = (ps) => buildWall(WAND97SM.name, WAND97SM.length_mm, WAND97SM.height_mm, [], null, ps);

t("#97 Beide Spannmuttermasse reisen durch den Kern und sind py/mjs bit-gleich (echtes Orakel)", () => {
  const js = bau97sm(PS97SM);
  assert(js.prestress.spannmutter_h_mm === 10, "Einbauhoehe: " + js.prestress.spannmutter_h_mm);
  assert(js.prestress.spannmutter_sw_mm === 17, "Schluesselweite: " + js.prestress.spannmutter_sw_mm);
  deepEqual(js, orakel({ ...WAND97SM, prestress: PS97SM }));   // bit-genau, ganzes Wandelement
  // Ein zweites Produkt mit anderen Massen ergibt andere Werte — und aendert sonst NICHTS.
  const js2 = bau97sm({ ...PS97SM, spannmutter_h_mm: 8, spannmutter_sw_mm: 13 });
  assert(js2.prestress.spannmutter_h_mm === 8 && js2.prestress.spannmutter_sw_mm === 13,
    "zweites Produkt: " + js2.prestress.spannmutter_h_mm + "/" + js2.prestress.spannmutter_sw_mm);
  deepEqual({ ...js2, prestress: { ...js2.prestress, spannmutter_h_mm: 10, spannmutter_sw_mm: 17 } }, js);
  deepEqual(js2, orakel({ ...WAND97SM, prestress: { ...PS97SM, spannmutter_h_mm: 8, spannmutter_sw_mm: 13 } }));
});

t("#97 Ohne Spannmuttermass ist das Ergebnis bit-genau der Altstand", () => {
  const { spannmutter_h_mm, spannmutter_sw_mm, ...ohne } = PS97SM;   // eslint-disable-line no-unused-vars
  const a = bau97sm(ohne);
  // Weder `0` noch `null` erfinden ein Feld — und beide sind bit-genau der Fall ohne Angabe.
  deepEqual(bau97sm({ ...ohne, spannmutter_h_mm: 0, spannmutter_sw_mm: 0 }), a);
  deepEqual(bau97sm({ ...ohne, spannmutter_h_mm: null, spannmutter_sw_mm: null }), a);
  assert(!("spannmutter_h_mm" in a.prestress) && !("spannmutter_sw_mm" in a.prestress),
    "kein Schluessel ohne Angabe: " + Object.keys(a.prestress).join(","));
  // Auch der Kern ohne Angabe ist py/mjs bit-gleich — das Ausbleiben des Schluessels ebenso.
  deepEqual(a, orakel({ ...WAND97SM, prestress: ohne }));
  // Die beiden Masse sind UNABHAENGIG: eine gepflegte Hoehe ohne Schluesselweite ergibt genau
  // ein Feld, und die Rechnung bleibt dieselbe.
  const nurH = bau97sm({ ...ohne, spannmutter_h_mm: 10 });
  assert(nurH.prestress.spannmutter_h_mm === 10 && !("spannmutter_sw_mm" in nurH.prestress),
    "nur die Hoehe: " + Object.keys(nurH.prestress).join(","));
  deepEqual(nurH, orakel({ ...WAND97SM, prestress: { ...ohne, spannmutter_h_mm: 10 } }));
  // Und die Nullwirkung gegen den gesetzten Fall: nur diese Schluessel kommen hinzu.
  const mit = bau97sm(PS97SM);
  delete mit.prestress.spannmutter_h_mm; delete mit.prestress.spannmutter_sw_mm;
  deepEqual(mit, a);
});

t("#97 Beide Spannmuttermasse reisen durch psOf() (Auslegung und Nachweis)", () => {
  // `psOf()` in `sembla-engine.js` ist eine FELDLISTE und baut `prestress` je Iteration neu —
  // ohne Eintrag dort waeren die Felder nach der ersten Iteration weg.
  const last = { qk_area: 0.5, gammaQ: 1.5 };
  const auto = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: PS97SM, load: last });
  assert(auto.wandelement.prestress.spannmutter_h_mm === 10
    && auto.wandelement.prestress.spannmutter_sw_mm === 17,
    "nach der Auslegung: " + JSON.stringify(auto.wandelement.prestress.spannmutter_h_mm) + "/"
      + JSON.stringify(auto.wandelement.prestress.spannmutter_sw_mm));
  const nw = nachweisPruefen({ ...ENGINE_BASE, height_mm: 2000, load: { qk_area: 1.0, gammaQ: 1.5 },
    prestress: { ...PS97SM, max_span_grid: 3, force_kN: 60 } }).wandelement;
  assert(nw.prestress.spannmutter_h_mm === 10 && nw.prestress.spannmutter_sw_mm === 17,
    "im Nachweis-Modus: " + nw.prestress.spannmutter_h_mm + "/" + nw.prestress.spannmutter_sw_mm);
  // Und auch hier: die Auslegung selbst bleibt bit-genau der Altstand.
  const { spannmutter_h_mm, spannmutter_sw_mm, ...ohne } = PS97SM;   // eslint-disable-line no-unused-vars
  const b = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: ohne, load: last });
  delete auto.wandelement.prestress.spannmutter_h_mm;
  delete auto.wandelement.prestress.spannmutter_sw_mm;
  deepEqual(auto.wandelement, b.wandelement);
  assert(!("spannmutter_h_mm" in b.wandelement.prestress)
    && !("spannmutter_sw_mm" in b.wandelement.prestress), "kein Schluessel ohne Angabe");
});

// ---------------------------------------------------------------------------
// BREITE DER SPANNPLATTE (#97) — reine DURCHREICHE
// ---------------------------------------------------------------------------
// Modul 1 leitet `spannplatte_b_mm` aus dem Katalogfeld `breite_mm` der Rolle „Spannplatte" ab;
// der Kern reicht die Breite unveraendert durch, damit die Ausgaben die Platte spaeter
// masstaeblich zeichnen koennen, ohne den Katalog zu lesen ([D-1]). GERECHNET wird damit nichts
// — genau das halten die Tests fest: das Wandelement ist mit und ohne das Feld bis auf diesen
// einen Schluessel bit-gleich. Nicht zu verwechseln mit `rod_kopf_zuschlag_mm`, der DICKE
// derselben Platte: die ist ein echter Rechenwert und geht in den Bedarf ein.
// Gefahren wird derselbe `orakel()`-Weg wie bei #92, der Kopplungsmutter und der Spannmutter:
// das ECHTE Python-Orakel als Unterprozess, damit "beide Kerne bit-gleich" belegt ist.
const PS97SP = { rod_lengths_mm: [1000, 500], rod_rest_mm: 210, rod_overhang_mm: 10,
  top_connection: "spannplatte", spannplatte_b_mm: 120 };
const WAND97SP = { name: "spannplatte", length_mm: 6 * GRID, height_mm: 2000 };
const bau97sp = (ps) => buildWall(WAND97SP.name, WAND97SP.length_mm, WAND97SP.height_mm, [], null, ps);

t("#97 Die Plattenbreite reist durch den Kern und ist py/mjs bit-gleich (echtes Orakel)", () => {
  const js = bau97sp(PS97SP);
  assert(js.prestress.spannplatte_b_mm === 120, "Breite: " + js.prestress.spannplatte_b_mm);
  deepEqual(js, orakel({ ...WAND97SP, prestress: PS97SP }));   // bit-genau, ganzes Wandelement
  // Ein zweites Produkt mit anderer Breite ergibt einen anderen Wert — und aendert sonst NICHTS.
  const js2 = bau97sp({ ...PS97SP, spannplatte_b_mm: 110 });
  assert(js2.prestress.spannplatte_b_mm === 110, "zweites Produkt: " + js2.prestress.spannplatte_b_mm);
  deepEqual({ ...js2, prestress: { ...js2.prestress, spannplatte_b_mm: 120 } }, js);
  deepEqual(js2, orakel({ ...WAND97SP, prestress: { ...PS97SP, spannplatte_b_mm: 110 } }));
});

t("#97 Ohne Plattenbreite ist das Ergebnis bit-genau der Altstand", () => {
  const { spannplatte_b_mm, ...ohne } = PS97SP;               // eslint-disable-line no-unused-vars
  const a = bau97sp(ohne);
  // Weder `0` noch `null` erfinden ein Feld — und beide sind bit-genau der Fall ohne Angabe.
  deepEqual(bau97sp({ ...ohne, spannplatte_b_mm: 0 }), a);
  deepEqual(bau97sp({ ...ohne, spannplatte_b_mm: null }), a);
  assert(!("spannplatte_b_mm" in a.prestress),
    "kein Schluessel ohne Angabe: " + Object.keys(a.prestress).join(","));
  // Auch der Kern ohne Angabe ist py/mjs bit-gleich — das Ausbleiben des Schluessels ebenso.
  deepEqual(a, orakel({ ...WAND97SP, prestress: ohne }));
  // Und die Nullwirkung gegen den gesetzten Fall: nur dieser eine Schluessel kommt hinzu.
  const mit = bau97sp(PS97SP);
  delete mit.prestress.spannplatte_b_mm;
  deepEqual(mit, a);
  // Die Breite ist UNABHAENGIG von der Dicke (`rod_kopf_zuschlag_mm`): ein gesetzter
  // Kopfzuschlag rechnet unveraendert weiter, die Breite kommt nur als Feld hinzu.
  const mitDicke = bau97sp({ ...ohne, rod_kopf_zuschlag_mm: 10 });
  const beide = bau97sp({ ...PS97SP, rod_kopf_zuschlag_mm: 10 });
  assert(beide.prestress.spannplatte_b_mm === 120 && beide.prestress.rod_kopf_zuschlag_mm === 10,
    "beide Masse: " + Object.keys(beide.prestress).join(","));
  delete beide.prestress.spannplatte_b_mm;
  deepEqual(beide, mitDicke);
});

t("#97 Die Plattenbreite reist durch psOf() (Auslegung und Nachweis)", () => {
  // `psOf()` in `sembla-engine.js` ist eine FELDLISTE und baut `prestress` je Iteration neu —
  // ohne Eintrag dort waere das Feld nach der ersten Iteration weg.
  const last = { qk_area: 0.5, gammaQ: 1.5 };
  const auto = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: PS97SP, load: last });
  assert(auto.wandelement.prestress.spannplatte_b_mm === 120,
    "nach der Auslegung: " + JSON.stringify(auto.wandelement.prestress.spannplatte_b_mm));
  const nw = nachweisPruefen({ ...ENGINE_BASE, height_mm: 2000, load: { qk_area: 1.0, gammaQ: 1.5 },
    prestress: { ...PS97SP, max_span_grid: 3, force_kN: 60 } }).wandelement;
  assert(nw.prestress.spannplatte_b_mm === 120,
    "im Nachweis-Modus: " + nw.prestress.spannplatte_b_mm);
  // Und auch hier: die Auslegung selbst bleibt bit-genau der Altstand.
  const { spannplatte_b_mm, ...ohne } = PS97SP;               // eslint-disable-line no-unused-vars
  const b = autoAuslegung({ ...ENGINE_BASE, height_mm: 2000, prestress: ohne, load: last });
  delete auto.wandelement.prestress.spannplatte_b_mm;
  deepEqual(auto.wandelement, b.wandelement);
  assert(!("spannplatte_b_mm" in b.wandelement.prestress), "kein Schluessel ohne Angabe");
});

// ---------------------------------------------------------------------------
// RANDVERBAENDE [V-3]/[V-11] (Paritaetsvertrag mit dem Python-Orakel, Issue #104)
// ---------------------------------------------------------------------------
// Akzeptanztest 1+3 des Pakets: die vier i2-/i3-Randkombinationen werden als REALE Waende
// ueber buildWall gebaut und ihre tension_columns gegen das ECHTE Python-Orakel gestellt —
// zusaetzlich zu den oben schon gepruesten, neu eingefrorenen Fixtures. Das Orakel bekommt
// hier auch Oeffnungen, weil der i2-Abschluss rechts eine bis zum Boden reichende Tuer
// braucht (das rechteckige Tiling setzt den i2 immer nach vorne).
console.log("RANDVERBAENDE [V-3]/[V-11] (Paritaetsvertrag mit dem Python-Orakel):");
const PY_RAND = `
import json, sys
sys.path.insert(0, ${JSON.stringify(PYDIR)})
from sembla_core import build_wall, Opening
a = json.loads(sys.argv[1])
ops = [Opening(*o) for o in a["openings"]]
print(json.dumps(build_wall(a["name"], a["length_mm"], a["height_mm"], ops, None, a["prestress"])))
`;
const orakelRand = (arg) =>
  JSON.parse(execFileSync("python3", ["-c", PY_RAND, JSON.stringify(arg)], { encoding: "utf8" }));

for (const [titel, arg, sollK] of [
  ["i3 an beiden Raendern", { name: "i3i3", length_mm: 6 * GRID, height_mm: 2600,
    openings: [], prestress: { max_span_grid: 3 } }, [1, 3, 4]],
  ["i2 nur am Anfang", { name: "i2A", length_mm: 5 * GRID, height_mm: 2600,
    openings: [], prestress: { max_span_grid: 3 } }, [1, 3]],
  ["i2 nur am Ende", { name: "i2Z", length_mm: 9 * GRID, height_mm: 2600,
    openings: [[3, 7, 0, 8, "tuer"]], prestress: { max_span_grid: 3 } }, [1, 2, 5, 7]],
  ["i2 an beiden Raendern", { name: "i2B", length_mm: 4 * GRID, height_mm: 2600,
    openings: [], prestress: { max_span_grid: 3 } }, [1, 2]],
  ["einzelner i2 (M4)", { name: "i2E", length_mm: 2 * GRID, height_mm: 2600,
    openings: [], prestress: { max_span_grid: 3 } }, [1]],
  // M5 am realen Pfad: dieselbe Wand mit gespeicherter Startachse 1 — Orakel und Core muessen
  // beide die Startachse ignorieren und dieselben Achsen liefern.
  ["Altstand mit start_axis_grid 1", { name: "sa1", length_mm: 2000, height_mm: 2600,
    openings: [], prestress: { max_span_grid: 3, start_axis_grid: 1 } },
    [1, 3, 5, 8, 11, 13, 14]],
]) {
  t(`${titel}: Core == Python-Orakel`, () => {
    const ops = arg.openings.map((o) => new Opening(...o));
    const js = buildWall(arg.name, arg.length_mm, arg.height_mm, ops, null, arg.prestress);
    const py = orakelRand(arg);
    deepEqual(js.tension_columns, py.tension_columns);
    deepEqual(js.tension_columns.map((c) => c.k), sollK);
    // Die Randregel darf die Steinaufteilung nicht anfassen ([N4]).
    deepEqual(js.courses, py.courses);
    assert(js.validation.ungehaltene_steine.length === 0, "[V-2] bleibt erfuellt");
  });
}

// ---------------------------------------------------------------------------
// AUSGLEICHSPUNKTE [A-20]/[A-21]/[A-22]/[A-23] (Issue #96)
// ---------------------------------------------------------------------------
// Hier stehen genau die Abnahmefaelle, die die goldenen Fixtures NICHT tragen koennen: keine
// der drei Referenzwaende ist 3,25 m lang, und die Abstandsaussage ist eine Eigenschaft ueber
// viele Waende statt ueber drei. Gefahren wird derselbe `orakelRand()`-Weg wie bei den
// Randverbaenden — das ECHTE Python-Orakel als Unterprozess —, damit die Bitgleichheit auch
// dieser Faelle bewiesen ist und nicht nur die der eingefrorenen Fixtures.
console.log("AUSGLEICHSPUNKTE [A-20]…[A-23] (Paritaetsvertrag mit dem Python-Orakel):");

t("[A-20]/[A-21] 3,25-m-Wand: zehn Punkte, beide Wandenden eingerechnet (Core == Orakel)", () => {
  const arg = { name: "ag325", length_mm: 3250, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3 } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.ausgleichspunkte, orakelRand(arg).ausgleichspunkte);
  // ceil(3 * 3,25) = 10 — und die Wandenden zaehlen in die Dichte hinein, stehen also als
  // eigene Punkte in der Liste (Variante A der Entscheidung vom 2026-09-07).
  assert(js.ausgleichspunkte.length === 10, "Punktzahl: " + js.ausgleichspunkte.length);
  assert(js.ausgleichspunkte.length
    === Math.ceil(AUSGLEICH_DICHTE_JE_M * arg.length_mm / 1000), "Dichte");
  deepEqual(js.ausgleichspunkte.filter((p) => p.art === "wandende").map((p) => p.x_mm),
    [0, 3250]);
  // [A-21] Jede Bodenblech-Stossmitte traegt einen Pflichtpunkt. Diese Wand hat echte Stoesse
  // (1250 + 1125 + 875) — die Zusicherung laeuft also nicht ins Leere.
  const stoesse = js.base_plate.teile.slice(0, -1).map((tl) => tl.x0_mm + tl.raster_mm);
  assert(stoesse.length === 2, "Testvoraussetzung Blechstoesse: " + JSON.stringify(stoesse));
  for (const x of stoesse)
    assert(js.ausgleichspunkte.some((p) => p.x_mm === x && p.art === "blechstoss"),
      "Pflichtpunkt fehlt an der Stossmitte " + x);
  // Aufsteigend, innerhalb der Wand, und die Dichte wird nirgends unterschritten.
  for (let i = 1; i < js.ausgleichspunkte.length; i++)
    assert(js.ausgleichspunkte[i].x_mm > js.ausgleichspunkte[i - 1].x_mm,
      "nicht aufsteigend bei " + i);
  assert(js.ausgleichspunkte.every((p) => p.x_mm >= 0 && p.x_mm <= arg.length_mm), "in der Wand");
  // Zweimal rechnen ergibt dieselbe Liste (reine Funktion, kein Zustand).
  deepEqual(js.ausgleichspunkte,
    buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress).ausgleichspunkte);
});

t("[A-23] keine Auffuellung liegt naeher als 20 mm an einer Spannachse (Core == Orakel)", () => {
  let geprueft = 0, geklemmt = 0;
  for (const n of [2, 3, 5, 6, 7, 8, 9, 10, 13, 16, 20, 26, 33, 40]) {
    const arg = { name: "agv" + n, length_mm: n * GRID, height_mm: 2600, openings: [],
      prestress: { max_span_grid: 3 } };
    const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
    deepEqual(js.ausgleichspunkte, orakelRand(arg).ausgleichspunkte);
    const achsen = js.tension_columns.map((c) => c.x_mm);
    for (const p of js.ausgleichspunkte) {
      if (p.art !== "auffuellung") continue;
      const d = Math.min(...achsen.map((xa) => Math.abs(xa - p.x_mm)));
      assert(d >= AUSGLEICH_ACHSVERSATZ, `L=${n * GRID}, x=${p.x_mm}: Abstand ${d}`);
      // Ein Abstand von GENAU dem Versatz kann nur aus der Klemmung stammen: eine
      // ungeklemmte Auffuellung liegt auf einem ganzen Millimeter, die Achse auf 62,5 + 125k,
      // ihr Abstand ist also zwangslaeufig ein halber Millimeter und nie glatt 20.
      if (d === AUSGLEICH_ACHSVERSATZ) geklemmt++;
      geprueft++;
    }
  }
  assert(geprueft > 0, "keine Auffuellung geprueft");
  // Gegenprobe, dass die Regel kein totes Recht ist: in dieser Reihe wird wirklich geklemmt
  // (875 mm und 4125 mm). Ohne diese Zusicherung wuerde ein versehentlich abgeschalteter
  // Versatz gruen durchlaufen.
  assert(geklemmt > 0, "der Achsversatz hat in der ganzen Reihe nie gegriffen");
  // [A-21] Pflichtpunkte sind vom Versatz ausgenommen — sie liegen auf ganzen Rastermassen
  // und damit ohnehin 62,5 mm neben jeder Achse; geprueft wird, dass keiner verschoben wurde.
  const w = buildWall("agp", 5000, 2600, [], null, { top_connection: "blech" });
  for (const p of w.ausgleichspunkte)
    if (p.art !== "auffuellung")
      assert(Number.isInteger(p.x_mm) && p.x_mm % GRID === 0,
        "Pflichtpunkt verschoben: " + p.x_mm);
});

// ---------------------------------------------------------------------------
// AUSGLEICHSPUNKT-OVERRIDE [A-24] (Issue #96)
// ---------------------------------------------------------------------------
// Gefahren wird derselbe `orakelRand()`-Weg wie oben — das ECHTE Python-Orakel als
// Unterprozess. Die Harness reicht `prestress` als Objekt durch, der Override reist also
// ueber genau den Weg mit, den auch die Engine und Modul 1 benutzen.
console.log("\nAUSGLEICHSPUNKT-OVERRIDE [A-24] (Paritaetsvertrag mit dem Python-Orakel):");

t("[A-24] ohne Override ist die Verteilung unveraendert (mehrere Laengen, Core == Orakel)", () => {
  // Akzeptanztest 1. Zusaetzlich zur Bitgleichheit gegen das Orakel wird hier ausdruecklich
  // geprueft, dass durch die neue Verzweigung KEIN Feld entsteht, das es vorher nicht gab —
  // weder im Vorspannblock noch in der Validierung. Genau das haelt die goldenen Fixtures grün.
  for (const n of [2, 5, 8, 13, 26, 40]) {
    const arg = { name: "agov" + n, length_mm: n * GRID, height_mm: 2600, openings: [],
      prestress: { max_span_grid: 3 } };
    const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
    deepEqual(js.ausgleichspunkte, orakelRand(arg).ausgleichspunkte);
    // Ohne Override ist die Verteilung wortwoertlich die reine Funktion aus [A-20]…[A-23].
    const stoesse = js.base_plate.teile.slice(0, -1).map((tl) => tl.x0_mm + tl.raster_mm);
    deepEqual(js.ausgleichspunkte,
      verteileAusgleichspunkte(n * GRID, stoesse, js.tension_columns.map((c) => c.x_mm)));
    assert(!("ausgleich_override_mm" in js.prestress), "Feld ohne Override entstanden");
    assert(!("ausgleich_fehler" in js.validation), "Fehlerfeld ohne Override entstanden");
    assert(js.ausgleichspunkte.every((p) => p.art !== "manuell"), "art manuell ohne Override");
  }
});

t("[A-24] mit Override gilt genau die Liste — keine Auffuellung, kein Pflichtpunkt (Core == Orakel)", () => {
  // Akzeptanztest 2. Die Wand ist 3,25 m lang: die Verteilung ergaebe zehn Punkte mit beiden
  // Wandenden und zwei Blechstossmitten. Der Override setzt DREI Punkte, von denen KEINER ein
  // Wandende und keiner eine Stossmitte ist — waere irgendetwas nachgeschoben, faellt es auf.
  const arg = { name: "agovA", length_mm: 3250, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3, ausgleich_override_mm: [300, 1700, 2900] } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.ausgleichspunkte, orakelRand(arg).ausgleichspunkte);
  deepEqual(js.ausgleichspunkte, [{ x_mm: 300, art: "manuell" }, { x_mm: 1700, art: "manuell" },
    { x_mm: 2900, art: "manuell" }]);
  // Die Verteilung ist vollstaendig gesperrt: nichts aufgefuellt, kein Wandende, kein Blechstoss.
  const auto = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, { max_span_grid: 3 });
  assert(auto.ausgleichspunkte.length === 10, "Testvoraussetzung Auto-Punktzahl");
  assert(!js.ausgleichspunkte.some((p) => p.x_mm === 0 || p.x_mm === 3250), "Wandende ergaenzt");
  assert(!("ausgleich_fehler" in js.validation), "unerwarteter Fehlereintrag");
  // Zurueckgegeben wird die VALIDIERTE Liste am Wandelement (Must 1) — hier unveraendert.
  deepEqual(js.prestress.ausgleich_override_mm, [300, 1700, 2900]);
  // Die Stuecklistenmenge folgt der Punktzahl ([A-18]) — hier also drei statt zehn.
  assert(js.ausgleichspunkte.length === 3, "Punktzahl mit Override");
});

t("[A-24] Wandenden sind zulaessig, Doppelte werden zusammengefasst (Core == Orakel)", () => {
  const arg = { name: "agovB", length_mm: 2000, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3, ausgleich_override_mm: [2000, 500, 500, 0] } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.ausgleichspunkte, orakelRand(arg).ausgleichspunkte);
  // Sortiert, dedupliziert — und 0/L sind gueltig, anders als bei [A-17].
  deepEqual(js.ausgleichspunkte.map((p) => p.x_mm), [0, 500, 2000]);
  assert(!("ausgleich_fehler" in js.validation), "Doppelte sind kein Befund");
  deepEqual(js.prestress.ausgleich_override_mm, [0, 500, 2000]);
});

t("[A-24] unzulaessige Werte werden benannt und nie gerundet (Core == Orakel)", () => {
  const arg = { name: "agovC", length_mm: 2000, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3, ausgleich_override_mm: [400, -1, 2001, 1200] } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.ausgleichspunkte, orakelRand(arg).ausgleichspunkte);
  deepEqual(js.ausgleichspunkte.map((p) => p.x_mm), [400, 1200]);
  deepEqual(js.validation.ausgleich_fehler,
    [{ grund: "ausserhalb_wand", wert: -1 }, { grund: "ausserhalb_wand", wert: 2001 }]);
  // Nichts wurde auf 0 bzw. 2000 gebogen — die abgewiesenen Werte tauchen NIRGENDS auf.
  assert(!js.ausgleichspunkte.some((p) => p.x_mm === 0 || p.x_mm === 2000), "gerundet statt gemeldet");
  // Nicht ganzzahlig ist ebenfalls ein Befund, kein Rundungsfall (nur JS-seitig: das Orakel
  // bekaeme aus JSON dafuer einen Gleitkommawert und meldet ihn gleichlautend).
  const j2 = normAusgleichspunkte([7.5, 800], 2000);
  deepEqual(j2.punkte, [800]);
  deepEqual(j2.fehler, [{ grund: "nicht_ganzzahlig", wert: 7.5 }]);
});

t("[A-24] der Override reist durch psOf() (Auto- und Nachweis-Modus)", () => {
  // Dieselbe Begruendung wie bei #92: `psOf()` ist eine WHITELIST. Fiele der Override in der
  // Iteration weg, rechnete der Core mit seiner Verteilung weiter und die in Modul 1 gesetzten
  // Punkte waeren unwirksam — samt der daraus folgenden Stuecklistenmenge nach [A-18].
  const ov = [200, 900, 1800];
  const a = autoAuslegung({ ...ENGINE_BASE, prestress: { ausgleich_override_mm: ov },
    load: { qk_area: 0.5, gammaQ: 1.5 } }).wandelement;
  deepEqual(a.prestress.ausgleich_override_mm, ov);
  deepEqual(a.ausgleichspunkte.map((p) => p.x_mm), ov);
  const b = nachweisPruefen({ ...ENGINE_BASE, prestress: { max_span_grid: 3, force_kN: 60,
    ausgleich_override_mm: ov }, load: { qk_area: 1.0, gammaQ: 1.5 } }).wandelement;
  deepEqual(b.ausgleichspunkte.map((p) => p.x_mm), ov);
  // Ohne Override bleibt die Auslegung bit-genau der Altstand.
  const c = autoAuslegung({ ...ENGINE_BASE, load: { qk_area: 0.5, gammaQ: 1.5 } }).wandelement;
  assert(!("ausgleich_override_mm" in c.prestress), "kein Schluessel ohne Override");
  assert(c.ausgleichspunkte.every((p) => p.art !== "manuell"), "Verteilung unveraendert");
});

t("[A-24] die ausdruecklich leere Liste faellt nicht auf die Verteilung zurueck (Core == Orakel)", () => {
  const arg = { name: "agovD", length_mm: 3250, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3, ausgleich_override_mm: [] } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.ausgleichspunkte, orakelRand(arg).ausgleichspunkte);
  deepEqual(js.ausgleichspunkte, []);
  deepEqual(js.prestress.ausgleich_override_mm, []);
  // `null`/fehlend heisst dagegen „kein Override" — die Verteilung greift wieder.
  deepEqual(normAusgleichspunkte(null, 3250), { punkte: null, fehler: [] });
  deepEqual(normAusgleichspunkte(undefined, 3250), { punkte: null, fehler: [] });
});

// ---------------------------------------------------------------------------
// DECKENANSCHLUSSPUNKTE [A-26] und ihr Override [A-27] (Issue #95, Paket 2)
// ---------------------------------------------------------------------------
// Gefahren wird derselbe `orakelRand()`-Weg wie bei den Ausgleichspunkten — das ECHTE
// Python-Orakel als Unterprozess. Die Verteilung ist ausdruecklich KEINE Statik: ein Punkt je
// angefangenem Meter, Kandidat ist jede Spannachse (Festlegung vom 2026-09-08).
console.log("\nDECKENANSCHLUSSPUNKTE [A-26] (Paritaetsvertrag mit dem Python-Orakel):");

t("[A-26] ein Punkt je angefangenem Meter, erste und letzte Achse gesetzt (Core == Orakel)", () => {
  for (const n of [2, 5, 8, 13, 26, 33, 40]) {
    const arg = { name: "dc" + n, length_mm: n * GRID, height_mm: 2600, openings: [],
      prestress: { max_span_grid: 3 } };
    const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
    deepEqual(js.deckenanschlusspunkte, orakelRand(arg).deckenanschlusspunkte);
    const achsen = js.tension_columns.map((c) => c.k);
    const ziel = Math.max(1, Math.ceil(DECKENANSCHLUSS_JE_M * arg.length_mm / 1000));
    const soll = Math.min(ziel, achsen.length);
    assert(js.deckenanschlusspunkte.length === soll,
      `L=${n * GRID}: ${js.deckenanschlusspunkte.length} statt ${soll}`);
    // Jeder Punkt liegt auf einer WIRKLICH vorhandenen Spannachse — nie zwischen zweien.
    for (const p of js.deckenanschlusspunkte) {
      assert(achsen.includes(p.k), `L=${n * GRID}: k=${p.k} ist keine Spannachse`);
      const col = js.tension_columns.find((c) => c.k === p.k);
      assert(p.x_mm === col.x_mm, "x_mm weicht von der Achse ab");
      assert(p.art === "auto", "art");
    }
    // Aufsteigend und ohne Doppelte.
    for (let i = 1; i < js.deckenanschlusspunkte.length; i++)
      assert(js.deckenanschlusspunkte[i].k > js.deckenanschlusspunkte[i - 1].k, "nicht aufsteigend");
    // Ab zwei Punkten sind Rand- und Endachse gesetzt ([A-26]).
    if (soll >= 2) {
      assert(js.deckenanschlusspunkte[0].k === achsen[0], "erste Achse fehlt");
      assert(js.deckenanschlusspunkte[soll - 1].k === achsen[achsen.length - 1], "letzte Achse fehlt");
    }
    // Zweimal rechnen ergibt dieselbe Liste (reine Funktion, kein Zustand).
    deepEqual(js.deckenanschlusspunkte,
      buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress).deckenanschlusspunkte);
  }
});

t("[A-26] die kurze Wand traegt genau einen Punkt (Core == Orakel)", () => {
  // Mindestens einer, auch unter einem Meter — und zwar die ERSTE Achse, statt eine Mitte zu
  // erfinden. Zwei Raster ist die kuerzeste baubare Wand.
  const arg = { name: "dckurz", length_mm: 2 * GRID, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3 } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.deckenanschlusspunkte, orakelRand(arg).deckenanschlusspunkte);
  assert(js.deckenanschlusspunkte.length === 1, "Punktzahl: " + js.deckenanschlusspunkte.length);
  assert(js.deckenanschlusspunkte[0].k === js.tension_columns[0].k, "nicht die erste Achse");
  // Reine Funktion, direkt geprueft: mehr Zielpunkte als Achsen ergibt ALLE Achsen und
  // erfindet keine weitere Stelle.
  deepEqual(verteileDeckenanschluss(9000, [1, 4, 7]), [1, 4, 7]);
  deepEqual(verteileDeckenanschluss(3000, []), []);
});

console.log("\nDECKENANSCHLUSS-OVERRIDE [A-27] (Paritaetsvertrag mit dem Python-Orakel):");

t("[A-27] ohne Override entsteht kein Feld — die Verteilung bleibt bit-genau (Core == Orakel)", () => {
  for (const n of [5, 13, 26]) {
    const arg = { name: "dcov" + n, length_mm: n * GRID, height_mm: 2600, openings: [],
      prestress: { max_span_grid: 3 } };
    const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
    deepEqual(js.deckenanschlusspunkte, orakelRand(arg).deckenanschlusspunkte);
    assert(!("deckenanschluss_grid" in js.prestress), "Schluessel ohne Override entstanden");
    assert(!("deckenanschluss_fehler" in js.validation), "Fehlerschluessel ohne Override");
    assert(js.deckenanschlusspunkte.every((p) => p.art === "auto"), "art");
  }
});

t("[A-27] mit Override gilt genau die Liste — nichts wird aufgefuellt (Core == Orakel)", () => {
  const arg = { name: "dcovA", length_mm: 3250, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3, deckenanschluss_grid: [3, 12] } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.deckenanschlusspunkte, orakelRand(arg).deckenanschlusspunkte);
  deepEqual(js.deckenanschlusspunkte.map((p) => p.k), [3, 12]);
  assert(js.deckenanschlusspunkte.every((p) => p.art === "manuell"), "art");
  // Die Verteilung ist vollstaendig gesperrt: die Auto-Wand traegt hier vier Punkte.
  const auto = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, { max_span_grid: 3 });
  assert(auto.deckenanschlusspunkte.length === 4, "Testvoraussetzung Auto-Punktzahl");
  assert(!("deckenanschluss_fehler" in js.validation), "unerwarteter Fehlereintrag");
  // Zurueckgegeben wird die VALIDIERTE Liste am Wandelement.
  deepEqual(js.prestress.deckenanschluss_grid, [3, 12]);
});

t("[A-27] Doppelte werden zusammengefasst, Nicht-Achsen benannt (Core == Orakel)", () => {
  const arg = { name: "dcovB", length_mm: 3250, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3, deckenanschluss_grid: [12, 3, 3, 2, 99] } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.deckenanschlusspunkte, orakelRand(arg).deckenanschlusspunkte);
  deepEqual(js.deckenanschlusspunkte.map((p) => p.k), [3, 12]);
  // 2 ist eine Rasterspalte OHNE Spannachse, 99 liegt ausserhalb der Wand — beide werden
  // benannt und NICHT auf die Nachbarachse geschoben.
  deepEqual(js.validation.deckenanschluss_fehler,
    [{ grund: "keine_spannachse", wert: 2 }, { grund: "ausserhalb_wand", wert: 99 }]);
  assert(!js.deckenanschlusspunkte.some((p) => p.k === 2 || p.k === 1 || p.k === 99),
    "abgewiesener Wert doch angewandt");
  deepEqual(js.prestress.deckenanschluss_grid, [3, 12]);
  // Nicht ganzzahlig ist ebenfalls ein Befund, kein Rundungsfall (nur JS-seitig).
  deepEqual(normDeckenanschluss([1.5, 3], [1, 3], 26),
    { punkte: [3], fehler: [{ grund: "nicht_ganzzahlig", wert: 1.5 }] });
});

t("[A-27] die ausdruecklich leere Liste faellt nicht auf die Verteilung zurueck (Core == Orakel)", () => {
  const arg = { name: "dcovC", length_mm: 3250, height_mm: 2600, openings: [],
    prestress: { max_span_grid: 3, deckenanschluss_grid: [] } };
  const js = buildWall(arg.name, arg.length_mm, arg.height_mm, [], null, arg.prestress);
  deepEqual(js.deckenanschlusspunkte, orakelRand(arg).deckenanschlusspunkte);
  deepEqual(js.deckenanschlusspunkte, []);
  deepEqual(js.prestress.deckenanschluss_grid, []);
  // `null`/fehlend heisst dagegen „kein Override" — die Verteilung greift wieder.
  deepEqual(normDeckenanschluss(null, [1, 3], 26), { punkte: null, fehler: [] });
  deepEqual(normDeckenanschluss(undefined, [1, 3], 26), { punkte: null, fehler: [] });
});

t("[A-27] der Override reist durch psOf() (Auto- und Nachweis-Modus)", () => {
  // `psOf()` ist eine WHITELIST: fiele der Override in der Iteration weg, rechnete der Core
  // mit seiner Verteilung weiter und die in Modul 1 gesetzten Punkte waeren unwirksam.
  const auto = autoAuslegung({ ...ENGINE_BASE, load: { qk_area: 0.5, gammaQ: 1.5 } }).wandelement;
  const ov = [auto.tension_columns[1].k];
  const a = autoAuslegung({ ...ENGINE_BASE, prestress: { deckenanschluss_grid: ov },
    load: { qk_area: 0.5, gammaQ: 1.5 } }).wandelement;
  deepEqual(a.prestress.deckenanschluss_grid, ov);
  deepEqual(a.deckenanschlusspunkte.map((p) => p.k), ov);
  const b = nachweisPruefen({ ...ENGINE_BASE, prestress: { max_span_grid: 3, force_kN: 60,
    deckenanschluss_grid: ov }, load: { qk_area: 1.0, gammaQ: 1.5 } }).wandelement;
  deepEqual(b.deckenanschlusspunkte.map((p) => p.k), ov);
  // Ohne Override bleibt die Auslegung bit-genau der Altstand.
  assert(!("deckenanschluss_grid" in auto.prestress), "kein Schluessel ohne Override");
  assert(auto.deckenanschlusspunkte.every((p) => p.art !== "manuell"), "Verteilung unveraendert");
});

t("[A-26]/[A-27] Modul 3 bleibt unberuehrt: keine Vorspann- oder Mengenwirkung", () => {
  // Die Punkte sind eine Planungs- und Montageangabe, kein Nachweis. Weder Spannachsen noch
  // Stueckliste noch Validierung duerfen sich durch einen Override bewegen ([A-26]).
  const basis = buildWall("dcw", 3250, 2600, [], null, { max_span_grid: 3 });
  const mit = buildWall("dcw", 3250, 2600, [], null,
    { max_span_grid: 3, deckenanschluss_grid: [basis.tension_columns[0].k] });
  deepEqual(mit.bom, basis.bom);
  deepEqual(mit.tension_columns, basis.tension_columns);
  deepEqual(mit.ausgleichspunkte, basis.ausgleichspunkte);
  deepEqual(mit.validation, basis.validation);
});

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
