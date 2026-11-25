// Logik-Test der Achsen-Zuordnung hochgeladener Steinmodelle (docs/shared/sembla-ifc.js).
//
// Anlass: In Modul 6 lagen hochgeladene 3D-Modelle falsch in der Wand, sobald die Datei nicht
// exakt X=Laenge / Y=Tiefe / Z=Hoehe in mm mit dem Ursprung in der Steinecke mitbrachte — eine
// Y-oben-Datei (Rhino/Blender) lag flach (125 hoch, 200 tief) und versetzt. Seither bringt
// `objStein()` JEDE Datei auf die kanonische Lage: Achsen per Automatik aus dem Abgleich der
// BBox mit dem Nennmass des Steintyps, Einheit mm/cm/m, Ursprung immer auf der Min-Ecke.
// 3D-Vorschau und der OBJ-Pfad des IFC-Exports benutzen dieselbe Funktion.
//
// Die realen Bauteilmodelle sind vertraulich und NICHT im Repo: getestet wird ausschliesslich
// mit synthetischen Quadern.
//
// Aufruf:  node tests/module/test-obj-achsen.mjs

import { readFileSync } from "node:fs";
import { buildWall } from "../../docs/shared/sembla-core.js";

const IFC = await import("../../docs/shared/sembla-ifc.js");

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };
const nah = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- Synthetischer Quader mit AUSSEN orientierten Flaechen ------------------------------
// Kanonisch: X=Laenge, Y=Tiefe, Z=Hoehe (mm), Min-Ecke im Ursprung. `abb` bildet jede Ecke
// in die Achslage der "Datei" ab (Drehung/Spiegelung, Einheit, Versatz).
function quaderObj(l, tf, h, abb = (p) => p, { dreheFlaechen = false } = {}) {
  const v = [[0, 0, 0], [l, 0, 0], [l, tf, 0], [0, tf, 0], [0, 0, h], [l, 0, h], [l, tf, h], [0, tf, h]];
  // Umlauf gegen den Uhrzeigersinn von aussen gesehen (Normalen zeigen nach aussen)
  let f = [[1, 4, 3, 2], [5, 6, 7, 8], [1, 2, 6, 5], [3, 4, 8, 7], [1, 5, 8, 4], [2, 3, 7, 6]];
  if (dreheFlaechen) f = f.map((q) => q.slice().reverse());
  return v.map((p) => "v " + abb(p).join(" ")).join("\n") + "\n" + f.map((q) => "f " + q.join(" ")).join("\n") + "\n";
}
/** Vorzeichenbehaftetes Volumen (mm³): > 0 ⇔ Flaechen zeigen nach aussen. */
function volumen(V, faces) {
  let s = 0;
  for (const f of faces) for (let i = 1; i < f.length - 1; i++) {
    const a = V[f[0]], b = V[f[i]], c = V[f[i + 1]];
    s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return s / 6;
}
const bbox = (V) => IFC.objBBox(V);
const istNennlage = (st, typ) => {
  const bb = bbox(st.V), soll = IFC.STEIN_NENNMASS[typ];
  return bb && bb.min.every((c) => nah(c, 0)) && nah(bb.max[0], soll.laenge) && nah(bb.max[1], soll.tiefe) && nah(bb.max[2], soll.hoehe);
};

// --- Nennmass -----------------------------------------------------------------------------
t("Nennmass i2 = 250 × 125 × 200 mm, i3 = 375 × 125 × 200 mm",
  JSON.stringify(IFC.STEIN_NENNMASS.i2) === JSON.stringify({ laenge: 250, tiefe: 125, hoehe: 200 })
  && JSON.stringify(IFC.STEIN_NENNMASS.i3) === JSON.stringify({ laenge: 375, tiefe: 125, hoehe: 200 }));

// --- (1) Kanonische Datei: ohne Eingriff sofort richtig ------------------------------------
for (const [typ, l] of [["i2", 250], ["i3", 375]]) {
  const st = IFC.objStein(quaderObj(l, 125, 200), typ);
  t(`${typ} kanonisch: Automatik waehlt X=Laenge, Y=Tiefe, Z=Hoehe, mm`,
    JSON.stringify(st.achsen) === JSON.stringify(IFC.OBJ_ACHSEN_STANDARD) && st.automatik === true);
  t(`${typ} kanonisch: passt zum Nennmass, Abweichung 0`, st.passt === true && nah(st.abweichung_mm, 0));
  t(`${typ} kanonisch: Geometrie unveraendert (Min-Ecke 0, Nennmass)`, istNennlage(st, typ));
  t(`${typ} kanonisch: Flaechen zeigen weiter nach aussen`, nah(volumen(st.V, st.faces), l * 125 * 200, 1e-3));
}

// --- (2) Y-oben-Datei (Rhino/Blender-Achslage), Ursprung versetzt — der Fall aus der Meldung ---
{
  // Drehung Z-oben → Y-oben: (x, y, z) → (x, z, −y); dazu ein beliebiger Versatz.
  const yOben = (p) => [p[0] - 3, p[2] + 7, -p[1] + 40];
  const st = IFC.objStein(quaderObj(375, 125, 200, yOben), "i3");
  t("Y-oben: Automatik erkennt Hochachse +Y, Laengsachse +X",
    st.achsen.hoehe === "+y" && st.achsen.laenge === "+x" && st.achsen.einheit === "mm");
  t("Y-oben: Tiefe rechtshaendig ergaenzt (−Z) — reine Drehung, keine Spiegelung",
    st.achsen.tiefe === "-z" && IFC.objIstGespiegelt(st.achsen) === false);
  t("Y-oben: erkannte Masse 375 × 125 × 200 mm, passt",
    st.passt && nah(st.masse.laenge, 375) && nah(st.masse.tiefe, 125) && nah(st.masse.hoehe, 200));
  t("Y-oben: Stein steht aufrecht in Nennlage — Ursprung auf die Min-Ecke normiert", istNennlage(st, "i3"));
  t("Y-oben: Flaechen zeigen nach aussen", nah(volumen(st.V, st.faces), 375 * 125 * 200, 1e-3));
  // Gegenprobe: mit der frueher fest angenommenen Lage laege er flach (125 hoch, 200 tief).
  const alt = IFC.objStein(quaderObj(375, 125, 200, yOben), "i3", IFC.OBJ_ACHSEN_STANDARD);
  t("Y-oben, Gegenprobe: die alte feste Annahme ergibt 200 tief / 125 hoch und passt NICHT",
    nah(alt.masse.tiefe, 200) && nah(alt.masse.hoehe, 125) && alt.passt === false && alt.automatik === false);
  // Reiner Y/Z-Tausch (Spiegelung der Achslage) wird genauso erkannt.
  const tausch = IFC.objStein(quaderObj(250, 125, 200, (p) => [p[0], p[2], p[1]]), "i2");
  t("Y/Z getauscht: ebenfalls Hochachse +Y, Stein in Nennlage", tausch.achsen.hoehe === "+y" && istNennlage(tausch, "i2"));
}

// --- (3) Laengsachse quer, Einheit cm/m ------------------------------------------------------
{
  const quer = IFC.objStein(quaderObj(375, 125, 200, (p) => [-p[1], p[0], p[2]]), "i3");   // um Z gedreht
  t("Laenge entlang Y: Automatik waehlt Laengsachse Y, Hochachse Z",
    quer.achsen.laenge === "+y" && quer.achsen.hoehe === "+z" && quer.achsen.tiefe === "-x" && istNennlage(quer, "i3"));
  const cm = IFC.objStein(quaderObj(250, 125, 200, (p) => p.map((c) => c / 10)), "i2");
  t("Einheit cm erkannt und auf mm umgerechnet", cm.achsen.einheit === "cm" && cm.passt && istNennlage(cm, "i2"));
  const m = IFC.objStein(quaderObj(375, 125, 200, (p) => [p[0] / 1000, p[2] / 1000, -p[1] / 1000]), "i3");
  t("Einheit m + Y-oben zugleich erkannt", m.achsen.einheit === "m" && m.achsen.hoehe === "+y" && m.passt && istNennlage(m, "i3"));
  const knapp = IFC.objStein(quaderObj(249.2, 124.6, 199.9), "i2");
  t("kleine Abweichung (< Toleranz) gilt als passend, Mass wird NICHT zurechtskaliert",
    knapp.passt && nah(knapp.abweichung_mm, 0.8) && nah(bbox(knapp.V).max[0], 249.2));
}

// --- (4) Falsche Datei: nichts wird schoengerechnet -----------------------------------------
{
  const fremd = IFC.objStein(quaderObj(300, 100, 100), "i3");
  t("fremde Masse: passt = false, Abweichung benannt", fremd.passt === false && fremd.abweichung_mm > IFC.OBJ_TOLERANZ_MM);
  const vertauscht = IFC.objStein(quaderObj(250, 125, 200), "i3");
  t("i2-Datei als i3 geladen: passt nicht (Laenge 250 statt 375)", vertauscht.passt === false && nah(vertauscht.abweichung_mm, 125));
  const leer = IFC.objStein("# nichts\n", "i2");
  t("leere Datei: leer = true, kanonische Zuordnung, keine Ausnahme",
    leer.leer === true && leer.passt === false && JSON.stringify(leer.achsen) === JSON.stringify(IFC.OBJ_ACHSEN_STANDARD));
  t("Automatik ist deterministisch", JSON.stringify(IFC.objAchsenAuto(IFC.parseObj(quaderObj(375, 125, 200)).V, "i3"))
    === JSON.stringify(IFC.objAchsenAuto(IFC.parseObj(quaderObj(375, 125, 200)).V, "i3")));
}

// --- (5) Gespeicherte Zuordnung schlaegt die Automatik; Vorzeichen und Spiegelung ------------
{
  const txt = quaderObj(375, 125, 200);
  const kopf = IFC.objStein(txt + "v 10 10 190\n", "i3", { laenge: "+x", hoehe: "-z", einheit: "mm" });   // Marker nahe der Oberseite
  t("gespeicherte Zuordnung gilt (automatik = false), fehlende Tiefe wird rechtshaendig ergaenzt",
    kopf.automatik === false && kopf.achsen.tiefe === "-y" && IFC.objIstGespiegelt(kopf.achsen) === false);
  const marker = kopf.V[kopf.V.length - 1];
  t("Hochachse −Z stellt den Stein auf den Kopf (Marker oben → unten), Min-Ecke bleibt 0",
    nah(marker[2], 10) && nah(marker[1], 115) && nah(marker[0], 10) && bbox(kopf.V).min.every((c) => nah(c, 0)));
  t("gedreht: Flaechen zeigen nach aussen", volumen(kopf.V, kopf.faces) > 0);
  const gesp = IFC.objStein(txt, "i3", { laenge: "+x", tiefe: "-y", hoehe: "+z", einheit: "mm" });
  t("Tiefe −Y bei +X/+Z ist eine Spiegelung — Umlaufrichtung wird gedreht, Flaechen bleiben aussen",
    IFC.objIstGespiegelt(gesp.achsen) === true && nah(volumen(gesp.V, gesp.faces), 375 * 125 * 200, 1e-3) && istNennlage(gesp, "i3"));
  t("normObjAchsen: doppelt belegte Achse, unbekannte Einheit, Unsinn ⇒ null",
    IFC.normObjAchsen({ laenge: "+x", hoehe: "-x" }) === null
    && IFC.normObjAchsen({ laenge: "+x", hoehe: "+z", tiefe: "+z" }) === null
    && IFC.normObjAchsen({ laenge: "+x", hoehe: "+z", einheit: "zoll" }) === null
    && IFC.normObjAchsen({ laenge: "x", hoehe: "+z" }) === null
    && IFC.normObjAchsen(null) === null && IFC.normObjAchsen("+x") === null);
  t("ungueltige gespeicherte Zuordnung ⇒ Automatik statt Fehlbild",
    IFC.objStein(txt, "i3", { laenge: "+q", hoehe: "+z" }).automatik === true);
  t("objTiefenAchse: X/Z → +Y, X/Y → −Z, Y/Z → −X",
    IFC.objTiefenAchse("+x", "+z") === "+y" && IFC.objTiefenAchse("+x", "+y") === "-z" && IFC.objTiefenAchse("+y", "+z") === "-x");
}

// --- (6) Parser: Zeilenenden, Einrueckung, relative Indizes ----------------------------------
{
  const basis = IFC.parseObj(quaderObj(250, 125, 200));
  const crlf = IFC.parseObj(quaderObj(250, 125, 200).replace(/\n/g, "\r\n"));
  t("CRLF-Datei wird gleich gelesen", JSON.stringify(crlf) === JSON.stringify(basis) && basis.V.length === 8 && basis.faces.length === 6);
  const eingerueckt = IFC.parseObj(quaderObj(250, 125, 200).split("\n").map((z) => "  " + z.replace(" ", "\t")).join("\n"));
  t("eingerueckte Zeilen und Tabulatoren werden gelesen", JSON.stringify(eingerueckt) === JSON.stringify(basis));
  const rel = IFC.parseObj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\nvn 0 0 1\nvt 0 0\nf 1/1/1 2/1/1 3/1/1\nf 1 2\nf 1 2 99\n");
  t("relative (negative) Indizes, v/vt/vn-Tripel; zu kurze und ungueltige Flaechen entfallen",
    rel.V.length === 3 && rel.faces.length === 2 && JSON.stringify(rel.faces[0]) === "[0,1,2]" && JSON.stringify(rel.faces[1]) === "[0,1,2]");
}

// --- (7) IFC-Export: derselbe Stein wie in der Vorschau --------------------------------------
{
  const W = buildWall("OBJ-Wand", 2000, 1000, []);
  const ohneZufall = (s) => s.replace(/'[0-9A-Za-z_$]{22}'/g, "'GUID'").replace(/FILE_NAME\([^\n]*\n/, "");
  const yOben = (p) => [p[0] + 11, p[2] - 5, -p[1]];
  const kanon = IFC.wandelementToIfc(W, { realGeom: true, objText: { i2: quaderObj(250, 125, 200), i3: quaderObj(375, 125, 200) } });
  const gedreht = IFC.wandelementToIfc(W, { realGeom: true, objText: { i2: quaderObj(250, 125, 200, yOben), i3: quaderObj(375, 125, 200, yOben) } });
  t("IFC mit OBJ: es entsteht ein FacetedBrep je Steintyp", (kanon.match(/IFCFACETEDBREP/g) || []).length === 2);
  t("IFC: Y-oben-Datei mit versetztem Ursprung ergibt DIESELBE Datei wie die kanonische",
    ohneZufall(gedreht) === ohneZufall(kanon));
  // Jeder Brep-Punkt liegt im Nennquader des Steins (Meter) — nichts ragt aus der Wandtiefe.
  const brepPunkte = (kanon.match(/IFCCARTESIANPOINT\(\(([-\d.]+),([-\d.]+),([-\d.]+)\)\)/g) || [])
    .map((z) => z.match(/[-\d.]+/g).map(Number));
  t("IFC: keine Steinkoordinate ausserhalb der Wandtiefe 0…0,125 m", brepPunkte.every((p) => p[1] >= 0 && p[1] <= 0.125 + 1e-9));
  // Die im Dialog gewaehlte Zuordnung gilt auch hier (opts.objAchsen).
  const kopf = { laenge: "+x", tiefe: "-y", hoehe: "-z", einheit: "mm" };
  const mitMarker = quaderObj(375, 125, 200) + "v 10 10 190\nf 1 2 9\n";
  const a = IFC.wandelementToIfc(W, { realGeom: true, objText: { i3: mitMarker }, objAchsen: { i3: kopf } });
  const b = IFC.wandelementToIfc(W, { realGeom: true, objText: { i3: mitMarker } });
  t("IFC: opts.objAchsen wirkt (Marker bei z = 0,010 m statt 0,190 m)",
    /IFCCARTESIANPOINT\(\(0\.010000,0\.115000,0\.010000\)\)/.test(a) && /IFCCARTESIANPOINT\(\(0\.010000,0\.010000,0\.190000\)\)/.test(b));
  t("IFC: OBJ ohne Geometrie ⇒ Quader statt leerem Brep",
    !/IFCFACETEDBREP/.test(IFC.wandelementToIfc(W, { realGeom: true, objText: { i2: "# leer\n", i3: "# leer\n" } })));
  t("IFC ohne OBJ: unveraendert reine Quader", !/IFCFACETEDBREP/.test(IFC.wandelementToIfc(W)));
}

// --- (8) Anti-Drift: Modul 6 hat keine eigene Achsenlogik mehr -------------------------------
{
  const html = readFileSync(new URL("../../docs/ifc-3d.html", import.meta.url), "utf8");
  t("Modul 6 bezieht objStein/objAchsenAuto aus sembla-ifc.js",
    /import \{[^}]*objStein[^}]*objAchsenAuto[^}]*\} from '\.\/shared\/sembla-ifc\.js'/.test(html));
  t("Modul 6: kein eigener OBJ-Zeilenparser mehr (v/f werden nur in sembla-ifc.js gelesen)",
    !/ln\[0\]==="v"/.test(html) && !/split\("\\n"\)/.test(html));
  t("Modul 6: Dialog mit Laengsachse, Hochachse, Tiefe, Einheit und Soll/Ist-Tabelle vorhanden",
    ["objDlg", "objAxL", "objAxH", "objAxT", "objAxU", "objDlgTab", "objDlgAuto", "objDlgOk", "objDlgCancel"]
      .every((id) => html.includes('id="' + id + '"')));
}

console.log(`\ntest-obj-achsen: ${pass} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
