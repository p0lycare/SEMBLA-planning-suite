// Paritaets- und Regeltests fuer den JS-Core. Lauf: node test-sembla-core.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildWall, buildReference, Opening, isBuildable, REFERENCE_WALLS,
  GRID, ROD, CHAMBER_OFFSET, MAX_SPAN_GRID, FORBIDDEN_N,
  InvalidDimensionError, InvalidOpeningError,
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

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
