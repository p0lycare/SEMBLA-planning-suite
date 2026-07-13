// @ts-check
/**
 * SEMBLA Roboter-Export — erzeugt aus einem Wandelement eine geordnete,
 * maschinenlesbare Montagesequenz ("robotischer Aufbau"). Herstellerneutral.
 *
 * Reihenfolge: untere Stahlplatten → erste Gewindestangen → Steine lagenweise
 * bottom-up (je Lage von links) → Verbindungsmuttern an den Kopplungshöhen →
 * obere Stahlplatten → Vorspannen.
 *
 * Koordinaten: Ursprung Wand unten-links-vorne; x=Länge, y=Wandstärke, z=Höhe (oben);
 * Einheiten mm. Platzierungs-Referenz = Stein-Ecke unten-links-vorne.
 */

export function wallToSequence(wall, opts = {}) {
  const approach = opts.approachClearance_mm ?? 150;
  const T = wall.thickness_mm || 125;
  const COURSE = wall.course_mm || 200;
  const rod = wall.rod_mm || 1100;
  const tc = wall.tension_columns || [];
  const rods = tc.length ? tc[0].gewindestangen : 0;

  const steps = []; let seq = 0;
  const add = o => { steps.push(Object.assign({ seq: ++seq }, o)); };

  const topConn = (wall.prestress && wall.prestress.top_connection) || "blech";
  add({ op: "PLACE_BASE_PLATE", x_mm: 0, y_mm: T / 2, z_mm: 0, length_mm: wall.length_mm, width_mm: T, thickness_mm: 15, note: "Bodenblech (15 mm, Module)" });
  for (const c of tc) add({ op: "DRIVE_SCREW", strand: c.k, x_mm: c.x_mm, y_mm: T / 2, z_mm: 0, note: "Senkkopfschraube von unten + Kopplungsmutter oben" });
  for (const c of tc) add({ op: "INSERT_ROD", strand: c.k, x_mm: c.x_mm, y_mm: T / 2, z_mm: 0, segment: 1, note: "erste Gewindestange in Kopplungsmutter einschrauben" });

  const coupH = []; for (let j = 1; j < rods; j++) coupH.push(j * rod);
  let cIdx = 0;
  for (const course of wall.courses) {
    const li = course.lage;
    const ordered = [...course.stones].sort((a, b) => a.x0 - b.x0);
    ordered.forEach((st, idx) => add({
      op: "PLACE_STONE", part: st.type, lage: li, idx,
      pose: { x_mm: st.x0, y_mm: 0, z_mm: li * COURSE, rz_deg: 0 },
      length_mm: st.x1 - st.x0, height_mm: COURSE, thickness_mm: T,
    }));
    const top = (li + 1) * COURSE;
    while (cIdx < coupH.length && coupH[cIdx] <= top + 1e-6) {
      for (const c of tc) add({ op: "COUPLE_NUT", strand: c.k, x_mm: c.x_mm, y_mm: T / 2, z_mm: coupH[cIdx], segment: cIdx + 2, note: "Verbindungsmutter (handfest)" });
      cIdx++;
    }
  }
  if (topConn === "blech") add({ op: "PLACE_TOP_PLATE", x_mm: 0, y_mm: T / 2, z_mm: wall.height_mm, length_mm: wall.length_mm, width_mm: T, thickness_mm: 15, note: "Kopfblech (15 mm, Module)" });
  else for (const c of tc) add({ op: "PLACE_SPANNPLATTE_TOP", strand: c.k, x_mm: c.x_mm, y_mm: T / 2, z_mm: wall.height_mm, note: "Spannplatte auf Steinkante" });
  add({ op: "TENSION", note: "Vorspannung aufbringen (Spannmuttern anziehen)" });

  const placeStones = steps.filter(s => s.op === "PLACE_STONE").length;
  return {
    format: "SEMBLA-RobotSequence", version: "1.0",
    wall: { name: wall.name || "Wandelement", length_mm: wall.length_mm, height_mm: wall.height_mm, thickness_mm: T, lagen: wall.lagen, N_grid: wall.N_grid },
    frame: { origin: "Wand unten-links-vorne", x: "Länge", y: "Wandstärke", z: "Höhe (oben)", units: "mm", place_ref: "Stein-Ecke unten-links-vorne" },
    config: { approach_clearance_mm: approach, course_height_mm: COURSE, rod_length_mm: rod,
      stone_types: { i2: { length_mm: 250, height_mm: COURSE, thickness_mm: T }, i3: { length_mm: 375, height_mm: COURSE, thickness_mm: T } } },
    summary: { steps: steps.length, place_stones: placeStones,
      bleche: 1 + (topConn === "blech" ? 1 : 0), spannplatten: topConn === "blech" ? 0 : tc.length,
      senkkopfschrauben: tc.length, strands: tc.length, rods_per_strand: rods, couplings: coupH.length * tc.length },
    steps,
  };
}

export function sequenceToCsv(prog) {
  const rows = [["seq", "op", "part", "lage", "idx", "x_mm", "y_mm", "z_mm", "rz_deg", "length_mm", "note"]];
  for (const s of prog.steps) {
    const p = s.pose || {};
    rows.push([s.seq, s.op, s.part || "", s.lage ?? "", s.idx ?? "",
      (p.x_mm ?? s.x_mm ?? ""), (p.y_mm ?? s.y_mm ?? ""), (p.z_mm ?? s.z_mm ?? ""),
      (p.rz_deg ?? ""), (s.length_mm ?? ""), String(s.note || "").replace(/;/g, ",")]);
  }
  return rows.map(r => r.join(";")).join("\n") + "\n";
}
