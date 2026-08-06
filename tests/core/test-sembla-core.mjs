// Paritaets- und Regeltests fuer den JS-Core. Lauf: node test-sembla-core.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildWall, buildReference, Opening, isBuildable, REFERENCE_WALLS,
  GRID, ROD, CHAMBER_OFFSET, MAX_SPAN_GRID, FORBIDDEN_N,
  InvalidDimensionError, InvalidOpeningError,
  kombiniereLaengen, quelleFuerMass,
} from "../../docs/shared/sembla-core.js";

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

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
