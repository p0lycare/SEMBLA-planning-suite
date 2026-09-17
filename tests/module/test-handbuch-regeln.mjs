// Regressionstest des Regelwerktextes an seiner Quelle (Issue #136).
//
// Geprueft wird NICHT das erzeugte DOCX, sondern die editierbare Handbuchquelle
// build-handbuch.mjs: Kapitel 16 muss die neue Wandhoehenlogik verbindlich tragen
// (freie Zielhoehe, genau EINE obere Ausgleichslage, benannter Konflikt bei
// deaktivierter Ausgleichslage, Katalogprodukt/Sonderzuschnitt/Pruefhinweis als
// gekennzeichnete Zielregeln) und darf die abgeloeste Regel "Wandhoehe ist ein
// Vielfaches von 200 mm" nicht mehr als geltende Bedingung behaupten.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QUELLE = readFileSync(join(WURZEL, "build-handbuch.mjs"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL  " + n); } };
const hat = (n, s) => ok(n, QUELLE.includes(s));

// Text der Regel mit der gegebenen Kennung — die DEFINIERENDE Zeile (ein
// push(bullet(...)) je Regel), nicht ein blosser Querverweis aus einer anderen Regel.
const ZEILEN = QUELLE.split("\n");
function regel(id) {
  const marke = 'push(bullet("**[' + id;
  const z = ZEILEN.find(l => l.startsWith(marke) &&
    (l[marke.length] === "]" || l[marke.length] === " "));
  return z || null;
}
const inRegel = (n, id, s) => {
  const t = regel(id);
  ok(n, t !== null && t.includes(s));
};

// ------------------------------------------------- alte Vielfachen-Regel ist weg
console.log("[G-2] Die 200-mm-Vielfachen-Pflicht ist keine geltende Regel mehr:");
{
  // Der alte Wortlaut darf nur noch zitiert vorkommen (Herkunftsnotiz), nie als
  // Bedingung in einem Regel- oder Kapiteltext.
  const treffer = [...QUELLE.matchAll(/Wandhöhe = Vielfaches von 200 mm/g)];
  ok("kein Regelsatz „Wandhöhe = Vielfaches von 200 mm“ mehr",
    treffer.every(m => {
      const um = QUELLE.slice(Math.max(0, m.index - 80), m.index);
      return um.includes("frühere Fassung") || um.includes("Bis dahin galt");
    }));
  ok("keine Formulierung „Höhe = Vielfaches von 200 mm“",
    !QUELLE.includes("Höhe = Vielfaches von 200 mm"));
  inRegel("[G-2] keine Rasterbindung der Wandhöhe mehr", "G-2", "freie Zielhöhe");
  inRegel("[G-2] alte Fassung ausdruecklich abgeloest", "G-2", "abgelöst");
  inRegel("[G-2] COURSE bleibt die regulaere Lagenhoehe", "G-2", "COURSE = 200 mm");
  inRegel("[G-2] COURSE wird nicht umgedeutet", "G-2", "nicht umgedeutet");
}

// ------------------------------------------------- [G-13] Zerlegung
console.log("[G-13] Freie Zielhoehe und genau eine obere Ausgleichslage:");
{
  ok("[G-13] existiert", regel("G-13") !== null);
  inRegel("genau eine Ausgleichslage", "G-13", "**genau eine**");
  inRegel("immer an der globalen Oberkante", "G-13", "globalen Oberkante");
  inRegel("nie mehrfach", "G-13", "**nie mehrfach**");
  inRegel("Zerlegung n = floor(H/COURSE)", "G-13", "⌊H / COURSE⌋");
  inRegel("Resthoehe benannt", "G-13", "rest = H − n · COURSE");
  inRegel("Zielhoehe wird nie gerundet", "G-13", "in keinem Pfad gerundet");
  inRegel("nie mehrere niedrigere Lagen kombiniert", "G-13", "niemals mehrere niedrigere Lagen");
  inRegel("kein Optimierer ueber Steinhoehen", "G-13", "Optimierer über Steinhöhen gibt es ausdrücklich **nicht**");
  inRegel("Staffelung bleibt im 200-mm-Raster", "G-13", "bleiben im 200-mm-Raster");
}

// ------------------------------------------------- [G-14] Aktivierung & Konflikt
console.log("[G-14] Aktivierung und sichtbarer Konflikt:");
{
  ok("[G-14] existiert", regel("G-14") !== null);
  inRegel("Flag benannt", "G-14", "ausgleichslage_aktiv");
  inRegel("nur explizites true aktiviert", "G-14", "**nur ein ausdrückliches true**");
  inRegel("benannter Konflikt", "G-14", "hoehe_nicht_im_lagenraster");
  inRegel("Exportname des Konflikts", "G-14", "AUSGLEICH_KONFLIKT");
  inRegel("nie still gerundet", "G-14", "**nie still gerundet**");
  inRegel("kein stiller Ersatz", "G-14", "nie stillschweigend durch eine Ausgleichslage ersetzt");
  inRegel("Altbestand unveraendert", "G-14", "Altbestand ohne das Feld");
}

// ------------------------------------------------- [G-15] kanonische Lagenkanten
console.log("[G-15] Kanonische Lagenkanten:");
{
  ok("[G-15] existiert", regel("G-15") !== null);
  for (const f of ["unterkante_mm", "oberkante_mm", "hoehe_mm"])
    inRegel("Feld " + f + " benannt", "G-15", f);
  inRegel("keine Nachrechnung aus dem Lagenindex", "G-15", "Lagenindex × 200 mm");
  inRegel("ausgleich=true nur an der Ausgleichslage", "G-15", "ausgleich = true");
}

// ------------------------------------------------- [G-16]…[G-18] Zielregeln
console.log("[G-16]…[G-18] Katalogprodukt, Sonderzuschnitt, Pruefhinweis:");
{
  for (const id of ["G-16", "G-17", "G-18"]) {
    ok("[" + id + "] existiert", regel(id) !== null);
    inRegel("[" + id + "] als Zielregel gekennzeichnet", id, "ZIEL – OFFEN");
    inRegel("[" + id + "] Stand: nicht implementiert", id, "nicht implementiert");
  }
  inRegel("Ausgleichsstein ist Katalogprodukt", "G-16", "Bauteilkatalog");
  inRegel("Ausgleichsstein in i2 und i3", "G-16", "**i2** und **i3**");
  inRegel("reale Hoehe aus dem Katalog", "G-16", "reale Höhe (hoehe_mm)");
  inRegel("keine Zahl im Handbuch festgeschrieben", "G-16", "**keine Zahl**");

  inRegel("Sonderzuschnitt ohne Mindesthoehe", "G-17", "**keine Mindesthöhe**");
  inRegel("keine erfundene untere Schranke", "G-17", "nicht behauptet");
  inRegel("[Z-5] wird nicht auf Steine uebertragen", "G-17", "auf Steine **nicht übertragen**");
  inRegel("keine Verschnitt-/Einkaufsoptimierung", "G-17", "**Einkaufsoptimierung**");

  inRegel("Pruefhinweis nennt reales Maß", "G-18", "reale Maß der obersten Lage in Millimetern");
  inRegel("Pruefhinweis ist sichtbar", "G-18", "sichtbar");
  inRegel("keine numerische Warnschwelle", "G-18", "numerische Warnschwelle gibt es nicht");
  inRegel("kein Baubarkeitsausschluss", "G-18", "**kein** Baubarkeitsausschluss");
}

// ------------------------------------------------- [G-19] und betroffene Regeln
console.log("[G-19] Betroffene Regeln beziehen sich auf reale Lagenkanten:");
{
  ok("[G-19] existiert", regel("G-19") !== null);
  for (const v of ["**[A-15]**", "**[A-6]**", "**[P-19]**", "**[Z-7]**"])
    inRegel("[G-19] verweist auf " + v, "G-19", v);
  inRegel("[G-19] nennt die Ausgaben", "G-19", "Wandansicht, technische Zeichnung, 3D und IFC");

  inRegel("[A-15] nutzt reale Lagen-Oberkanten", "A-15", "realen Lagen-Oberkanten");
  inRegel("[A-15] kein Vielfaches aus dem Lagenindex", "A-15", "gerechnetes Vielfaches von 200 mm");
  inRegel("[A-17] Override auf realer Lagenkante", "A-17", "nie aus Lagenindex × 200 mm abgeleitet");
  inRegel("[A-6] Dichtstreifen nach realer Lagenhoehe", "A-6", "reale Höhe der Lage");
  inRegel("[A-6] keine Pauschalrechnung", "A-6", "Fugen × 200 mm");
  inRegel("[A-6] Stand gekennzeichnet", "A-6", "noch nicht implementiert");
  inRegel("[P-19] Stueckliste nennt reale Maße", "P-19", "realen Lagenkanten");
  inRegel("[P-19] Ausgleichslage als eigene Position", "P-19", "**eigene Position**");
  inRegel("[P-19] Stand gekennzeichnet", "P-19", "noch nicht implementiert");
  inRegel("[L-5] Standard-Wandhöhe ohne Rasterpflicht", "L-5", "freie Zielhöhe");
}

// ------------------------------------------------- Kapitel ausserhalb 16
console.log("Handbuchstellen ausserhalb Kapitel 16:");
{
  hat("Kap. 2.3 nennt die freie Zielhöhe", "die Höhe ist eine **freie Zielhöhe**");
  hat("Kap. 2.6 bindet den Dichtstreifen an die reale Lagenhöhe",
    "je Fuge über die **reale Höhe der Lage**");
  hat("Kap. 3 fuehrt die Lagenkanten im Datenmodell",
    "unterkante_mm, oberkante_mm, hoehe_mm");
  hat("Kap. 3 fuehrt das Aktivierungsfeld", 'M("ausgleichslage_aktiv")');
  hat("Glossar kennt die Ausgleichslage", '["Ausgleichslage"');
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
