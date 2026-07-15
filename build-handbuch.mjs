import fs from "node:fs";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
  TableOfContents, PageBreak, PageNumber, Header, Footer
} from "docx";

const CW = 9360; // content width US Letter, 1" margins
const ACC = "1F6FEB", INK = "1C2430", LINE = "CCCCCC", HEADBG = "EEF2F7", FBG = "F4F7FB", WARNBG = "FBE9E2", NOTEBG = "FFF8E6";
const MONO = "Consolas";

const P = (text, opts = {}) => new Paragraph({ spacing: { after: 120, ...(opts.spacing || {}) }, children: [new TextRun({ text, ...opts })] });
const lead = (t) => new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: t, size: 24, color: "33414F" })] });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const bullet = (t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: runsFrom(t) });
const num = (t) => new Paragraph({ numbering: { reference: "nums", level: 0 }, spacing: { after: 60 }, children: runsFrom(t) });

// **bold** inline parsing
function runsFrom(t) {
  const out = []; const parts = String(t).split(/(\*\*[^*]+\*\*)/g);
  for (const p of parts) { if (!p) continue; if (p.startsWith("**") && p.endsWith("**")) out.push(new TextRun({ text: p.slice(2, -2), bold: true })); else out.push(new TextRun(p)); }
  return out;
}
function box(lines, fill, accent) {
  return new Paragraph({
    spacing: { before: 80, after: 120 }, shading: { type: ShadingType.CLEAR, fill },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: accent || ACC, space: 6 } },
    children: lines.flatMap((ln, i) => [...runsFrom(ln), ...(i < lines.length - 1 ? [new TextRun({ break: 1 })] : [])]),
  });
}
const note = (t) => box([t], NOTEBG, "E0B400");
const warn = (t) => box([t], WARNBG, "C9461C");
function formula(lines) {
  return new Paragraph({
    spacing: { before: 80, after: 120 }, shading: { type: ShadingType.CLEAR, fill: FBG },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACC, space: 6 } },
    children: lines.flatMap((ln, i) => [new TextRun({ text: ln, font: MONO, size: 20, color: "0B3A73" }), ...(i < lines.length - 1 ? [new TextRun({ break: 1 })] : [])]),
  });
}
function table(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: LINE };
  const borders = { top: border, left: border, bottom: border, right: border };
  const mk = (text, { head = false, mono = false, w } = {}) => new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, fill: HEADBG } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: head, font: mono ? MONO : undefined, size: head ? 18 : 20, color: mono ? "0B3A73" : INK })] })],
  });
  const headRow = new TableRow({ tableHeader: true, children: headers.map((h, i) => mk(h, { head: true, w: widths[i] })) });
  const bodyRows = rows.map(r => new TableRow({ children: r.map((c, i) => mk(String(c), { mono: i === 0 && c.__mono, w: widths[i] })) }));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows: [headRow, ...bodyRows] });
}
// helper to mark first column monospace
const M = (s) => { const o = new String(s); o.__mono = true; return o; };

const children = [];
const push = (...x) => children.push(...x);

// ---------- Titel ----------
push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "SEMBLA Planungs-Suite", bold: true, size: 52, color: INK })] }));
push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Handbuch", bold: true, size: 36, color: ACC })] }));
push(lead("Funktionsbeschreibung aller Module und nachvollziehbare Aufbereitung der Berechnungen (Statik, Verbinder-Bemessung, Mengen). Für die interne Produktentwicklung und zur Prüfung durch Statiker."));
push(warn("Zur Einordnung: Die Suite ist eine Planungshilfe, kein prüffähiger Standsicherheitsnachweis. Material-, Prüf- und Sicherheitswerte stammen aus dem Gutachten Prof. Schermer bzw. der Bibliothek der Arbeitsmappe (Kap. 5.12) und sind projektbezogen vom Tragwerksplaner / von Polycare zu bestätigen. Der Statik-Nachweis (Kap. 5) folgt dem Gutachten Prof. Schermer, Az. 2025_7001 Rev 01 vom 18.05.2026 (nicht öffentlich), i. V. m. Z-3.15-2157, DIN EN 1996-1-1, DIN 4103-1 und DIN EN 1991-1-4."));
push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: "Inhalt", bold: true, size: 24 })] }));
push(new TableOfContents("Inhalt", { hyperlink: true, headingStyleRange: "1-2" }));
push(new Paragraph({ children: [new PageBreak()] }));

// ---------- 1 ----------
push(H1("1 · Überblick & Zielgruppe"));
push(lead("Die SEMBLA Planungs-Suite plant vorgespannte Trockenmauerwerks-Wände aus den Systemsteinen i2 und i3 – vom ersten Entwurf bis zu Fertigung, Montage und BIM."));
push(P("Neun Werkzeuge (Module 1–9) greifen auf ein gemeinsames Datenmodell zu (das „Wandelement”). Modul 1 erzeugt es; alle weiteren Module lesen es. So bleibt die Planung über alle Gewerke konsistent."));
push(P("Einstieg: 00_Übersicht.html im selben Ordner öffnen. Jedes Tool ist eine eigenständige HTML-Datei und läuft ohne Installation im Browser."));
push(P("Dieses Handbuch richtet sich an (a) Statiker, die die Berechnungsansätze prüfen wollen (Kap. 5 + 11), und (b) das interne Entwicklungsteam, das die Suite ohne Programmier-Hintergrund weiterentwickelt (Kap. 4 + 15)."));

// ---------- 2 ----------
push(H1("2 · Grundlagen, Raster & Bausteine"));
push(H2("2.1 Systemraster"));
push(table(["Größe", "Wert", "Bedeutung"], [
  [M("GRID"), "125 mm", "Längsraster (Steine, Nuten, Verbinderachsen)"],
  [M("COURSE"), "200 mm", "Lagenhöhe (eine Steinreihe)"],
  [M("THICK"), "125 mm", "Wandstärke"],
  [M("CHAMBER_OFFSET"), "62,5 mm", "Kammer-/Strangmitte ab Steinanfang → Achsen bei x = 62,5 + 125·k mm"],
  [M("ROD"), "1100 mm", "Standard-Gewindestange (in Modul 1 überschreibbar)"],
  [M("MAX_SPAN_GRID"), "3", "Vorspannung höchstens alle 3 Raster (375 mm)"],
  [M("FORBIDDEN_N"), "{1, 4}", "nicht baubare / nicht versetzbare Segmentbreiten (Raster)"],
], [2600, 1500, 5260]));
push(H2("2.2 Steine"));
push(table(["Stein", "Länge", "Raster", "Kammern", "Nuten", "Rolle"], [
  ["i3", "375 mm", "3", "3", "2", "Regelstein – wird maximiert"],
  ["i2", "250 mm", "2", "2", "1", "nur zum Auffüllen der Wandenden"],
], [900, 1100, 900, 1200, 1100, 4160]));
push(P("Nuten sind die innenliegenden Stege im 12,5-cm-Raster, in denen Verbinder befestigt werden – nie auf einer Steinkante/Stoßfuge. Kammern sind die durchgehenden Hohlräume (vertikal) für Gewindestangen/Lattice."));
push(H2("2.3 Aufbau-Regeln (Verband)"));
push(bullet("**i3-Maximierung:** jede Lage wird mit möglichst vielen i3 belegt; i2 nur als Endsteine."));
push(bullet("**Versatz:** Stoßfugen benachbarter Lagen müssen mindestens 1 Raster versetzt sein (gemeldet in validation.versatz_ok, in Modul 1 als Warnung)."));
push(bullet("**Öffnungen** (Tür, Fenster, Durchbruch) lassen die Steine aus; der Sturz darüber wird wieder aufgefüllt."));
push(bullet("**Maße:** Länge = Vielfaches von 125 mm, Höhe = Vielfaches von 200 mm; FORBIDDEN_N-Breiten unzulässig."));
push(H2("2.4 Vorspannstränge & Anschlüsse (Bauteil-Logik)"));
push(P("Vorspannstränge sitzen auf den Kammerachsen (x = 62,5 + 125·k). Pro durchgehend gefülltem vertikalen Abschnitt entsteht ein Strang-Segment. Über/unter Öffnungen wird der Strang unterbrochen (mehrere Segmente). Nur durchgehende Stränge (volle Wandhöhe) zählen statisch. Für Sonderkonstruktionen können die Achsen in Modul 1 manuell gesetzt werden (prestress.columns_grid) – dann gilt exakt dieser Achsen-Satz."));
push(formula([
  "gewindestangen = ceil( h / rod )      verbindungsmuttern = gewindestangen - 1",
  "letzte_stange  = h - (gewindestangen-1)*rod",
  "verschnitt     = gewindestangen*rod - h",
]));
push(H2("2.5 Anschlüsse (Bodenblech / Kopfblech / Spannplatte)"));
push(bullet("**Fuß immer Bodenblech** (Stahlblech 15 mm, so lang/breit wie die Wand, in Modulen der Blechlänge). Je Strang von unten eine **Senkkopfschraube**, oben eine **Kopplungsmutter**, in die die Gewindestange eingeschraubt wird."));
push(bullet("**Oberer Anschluss** wahlweise **Kopfblech** (Blechmodule wie unten, Standard) oder **Spannplatte** je Strang auf der oberen Steinkante (prestress.top_connection = blech | spannplatte)."));
push(bullet("**Zwischenanker** (Segmentenden an Öffnungen) sind Spannplatten auf der Steinkante."));
push(bullet("BOM je Wand: senkkopfschrauben, kopplungsmuttern_basis, spannplatten, spannmuttern, stahlblech_module (+ stahlblech_mm, dicke), Gewindestangen (Standard + Sonderlänge)."));
push(H2("2.6 Stoßfugen & Dichtstreifen"));
push(P("Die vertikalen Stoßfugen zwischen Steinen werden gezählt (bom.stossfugen). Für erhöhte Anforderungen (z. B. Schallschutz) werden Dichtstreifen eingelegt (je Fuge 20 cm = 1 Steinreihe); die Stückliste weist die Gesamtlänge aus (bom.dichtstreifen_mm)."));
push(H2("2.7 Staffelung (getreppter Aufbau)"));
push(P("Eine Wand muss nicht rechteckig sein: über Stufen lässt sich die Oberkante bereichsweise absenken (getreppte Kontur, z. B. Musterwände). Jede Stufe ist ein Längsbereich [x0, x1] mit reduzierter Höhe; die eingegebene „Höhe” bleibt die Maximalhöhe. Stufen sind keine Öffnungen (kein Loch), sondern Teil der Außenkontur – daher keine Öffnungs-Überlappungen."));
push(bullet("Steine werden je Längsabschnitt nur bis zur lokalen Oberkante gemauert (i3-Maximierung, Versatz gelten weiter)."));
push(bullet("**Vorspannung läuft an der Treppe entlang:** an jeder Höhenstufe wird beidseitig der Kante ein Strang gesetzt (hohe und niedrige Seite) – analog zu den Laibungen an Öffnungen."));
push(bullet("Stränge sind je Abschnitt nur so hoch wie die lokale Oberkante (segmentiert); nur volle-Höhe-Stränge zählen statisch als durchgehend."));
push(bullet("In Modul 1 werden Stufen bemaßt: Breite an der Stufen-Oberkante und Höhe ab Boden (türkis, getrennt von Öffnungs-/Gesamtmaßen)."));

// ---------- 3 ----------
push(H1("3 · Datenmodell „Wandelement” & Projekt-Bundle"));
push(P("Das Wandelement ist eine JSON-Struktur und die „Single Source of Truth”. Wichtigste Felder:"));
push(table(["Feld", "Inhalt"], [
  [M("length_mm, height_mm"), "Wandmaße"],
  [M("grid_mm, course_mm, thickness_mm, rod_mm"), "verwendete Raster / Stangenlänge"],
  [M("N_grid, lagen"), "Raster- und Lagenanzahl"],
  [M("courses[]"), "je Lage {lage, stones:[{x0,x1,type}]} (mm)"],
  [M("openings[]"), "{g0,g1,l0,l1,art}; art = tuer · fenster · durchbruch"],
  [M("steps[]"), "Staffelung/getreppte Kontur: {x0_mm,x1_mm,height_mm}"],
  [M("tension_columns[]"), "Stränge: {k,x_mm,durchgehend,segments[],gewindestangen,…}"],
  [M("sides"), "Vorder-/Rückseite je Funktion (fassade · innenausbau · sicht · installation)"],
  [M("base_plate, top_plate"), "Boden-/Kopfblech: {laenge_mm, breite_mm, dicke_mm(15), modul_mm, module}; top_plate=null bei Spannplatten"],
  [M("prestress"), "{max_span_grid, force_kN, rod_mm, blech_mm, top_connection, columns_grid}"],
  [M("bom"), "i2/i3, gewindestangen, verbindungsmuttern, senkkopfschrauben, kopplungsmuttern_basis, spannplatten, spannmuttern, stahlblech_module/_mm, stossfugen, dichtstreifen_mm, verschnitt_mm"],
  [M("validation"), "{buildable, versatz_ok, versatz_violations, …}"],
  [M("verification"), "Statik-Status, Auslegung, Nachweise (von der Engine)"],
], [3400, 5960]));
push(H2("3.1 Projekt-Bundle"));
push(P("Damit zwischen den Modulen keine Einzeldateien jongliert werden, gibt es ein mitwachsendes Bundle:"));
push(formula(['{ "format":"SEMBLA-Projekt", "wandelement":{…}, "verbinder_layout":{…} }']));
push(P("Das Bundle ist das einzige Austauschformat der Suite. Modul 1 exportiert das Bundle, Modul 2 (Horizontaler Wandaufbau) reichert es um verbinder_layout (inkl. Beplankungsfeld) an, die Stückliste liest beides aus einer Datei. Alle Module und der Revit-Import (pyRevit) akzeptieren wahlweise ein Bundle oder ein blankes Wandelement und entpacken es selbst – daher nur je ein Export-Button (Projekt-Bundle) und einheitliche Lade-Buttons „… / Bundle laden”."));
push(P("Prozess kompakt: Modul 1 → Bundle → Modul 2 (Horizontaler Wandaufbau, reichert an) → Bundle → alle übrigen Module & Revit."));

// ---------- 4 ----------
push(H1("4 · Architektur, Kerne & Workflow"));
push(P("Die fachliche Logik liegt in getesteten Kernen (reine Bibliotheken). Die Werkzeuge sind eigenständige HTML-Dateien, per Build-Schritt aus Kern + Vorlage zusammengesetzt – keine Code-Duplizierung."));
push(table(["Was", "Datei(en)", "Inhalt"], [
  ["Wandaufbau-Kern", M("Phase-1/sembla_core.py (Referenz) · Phase-2/sembla-core.mjs"), "Verband, Stränge, BOM, Validierung. Python = Referenz, JS = bit-genaue Portierung (Parität über Fixtures)."],
  ["Wand-Statik", M("docs/shared/sembla-statik.js"), "Schermer-Nachweis: Wand (Biegung via Prüfwert-Interpolation, Schub, Druckrand, Bodenreibung, Deckenwinkel) + Spannsystem (Stange, Schrauben, Platten, Steinpressung) + Transport (Zusatz)."],
  ["Auslegungs-Engine", M("docs/shared/sembla-engine.js"), "Iteration: optimiert Strangabstand & Vorspannkraft bis alle Nachweise erfüllt sind."],
  ["Horizontaler Wandaufbau", M("Modul-Wandaufbau/…"), "Verbinder (Panelfugen = Achsen) + Latten/Dämmung + Beplankungsfeld."],
  ["CAD/BIM", M("Projekt-Manager/sembla-cad.mjs · obj-to-ifc.mjs"), "DXF, IFC4 (inkl. echter Steingeometrie als FacetedBrep)."],
  ["Roboter", M("Modul-Roboter/sembla-robot.mjs"), "Montagesequenz (Pick&Place + Vorspannen)."],
  ["Bauteilgeometrie", M("Bauteil-OBJ/i2_SEMBLA.obj · i3_SEMBLA.obj (+ .ifc)"), "echte Steingeometrie (X=Länge, Y=Tiefe, Z=Höhe; Nullpunkt unten-vorne-links)."],
], [2100, 3400, 3860]));
push(H2("4.1 Bauen & Veröffentlichen"));
push(P("Tools mit Vorlage: node build-*.mjs im jeweiligen Ordner. Danach spiegelt node publish-werkzeuge.mjs (Suite-Stammordner) alle Tools nach SEMBLA Werkzeuge/ – so laufen Entwicklungs- und Auslieferungsstand nie auseinander."));
push(H2("4.2 Testen"));
push(P("Jeder Kern/jede Oberfläche ist durch automatisierte Tests abgesichert (test-*.mjs / smoke_*.mjs, Python: Phase-1/test_sembla_core.py). Vor jeder Übernahme sollten alle Tests grün sein."));

// ---------- 5 STATIK ----------
push(H1("5 · Statik – Modell, Herleitung & Beispiel"));
push(lead("Dieses Kapitel legt den vollständigen Nachweis offen, damit ein Statiker ihn nachvollziehen und bestätigen kann. Grundlage ist das Gutachten Prof. Schermer (Az. 2025_7001 Rev 01 vom 18.05.2026) i. V. m. Z-3.15-2157, DIN EN 1996-1-1, DIN 4103-1 und DIN EN 1991-1-4. Der Rechenkern (Modul 6) ist 1:1 aus der geprüften Arbeitsmappe „SEMBLA_Wand_Statik_v01” portiert und gegen deren Zahlen verifiziert."));
push(P("Der Nachweis gliedert sich in zwei Komplexe: **A) Wandnachweise** (Biegung, Schub, Druckrand, Bodenanschluss, Deckenwinkel) und **B) Bauteilnachweise Spannsystem** (Gewindestange, Schrauben, Kopf-/Fußplatte, Steinpressung). Abschnitt 5.13 rechnet ein vollständiges Beispiel."));

push(H2("5.1 Modellannahmen"));
push(bullet("Nicht-tragende Innenwand, vorgespanntes Trockenmauerwerk; Wand spannt vertikal, oben und unten gelenkig gehalten – **Einfeldträger über die Höhe h**."));
push(bullet("Horizontallast wirkt als Flächenlast senkrecht zur Wand (Wind-Innendruck bzw. Trennwandlast DIN 4103-1)."));
push(bullet("Die Vorspannung erzeugt Drucknormalkraft in den Lagerfugen; die Biegetragfähigkeit m_Rk wird **nicht gerechnet, sondern aus Prüfwerten des Gutachtens (§6.2)** über die Wand-Vorspannkraft N_v interpoliert."));
push(bullet("**Günstig/ungünstig getrennt:** für die Biegetragfähigkeit wird die reduzierte Vorspannung N_v,fav angesetzt (konservativ, da Vorspannung hier hilft), für Druckrand und Bodenreibung die erhöhte N_v,sup (konservativ, da Vorspannung dort ungünstig wirkt)."));
push(bullet("Maßgebend ist der Lastfall mit der höchsten Schnittgröße aus {Wind, DIN 4103-1 Kat. I, Kat. II}."));

push(H2("5.2 Lasten"));
push(H3("5.2.1 Wind (DIN EN 1991-1-4)"));
push(formula([
  "qb   = f(Windzone)      WLZ 1..4 -> 0,32 / 0,39 / 0,47 / 0,56 kN/m²",
  "qp   = qb · 2,1         (vereinfacht Binnenland - standortabhängig prüfen)",
  "Cpi  = 0,9 · cpe,10     (dominante Öffnung/Tor offen; sonst ±0,2)",
  "w_i  = qp · Cpi         (Innendruck auf die Innenwand)",
  "w_Ed = γ_Q · w_i        (Wind leitend; γ_Q = 1,5)",
]));
push(H3("5.2.2 Trennwandlast (DIN 4103-1)"));
push(P("Horizontale Linienlast q₁ in der Angriffshöhe a = 0,90 m: Kat. I (Wohnen/Büro) q₁ = 0,5 kN/m; Kat. II (Verkehrsflächen/Rettungswache) q₁ = 1,0 kN/m."));

push(H2("5.3 Vorspannung"));
push(formula([
  "n       = 1 / e                    Stäbe je m  (Regelraster e = 0,375 m)",
  "F∞      = F0 · (1 − ΔF)            Restvorspannkraft je Stab (ΔF ≈ 0,33)",
  "Prüfung  F∞ ≥ F,inf                (rechnerische Untergrenze)",
  "N_v,fav = F∞ · n / γ_P,fav         günstig  (Biegung)",
  "N_v,sup = F0 · n · γ_P,sup         ungünstig (Druckrand, Boden)",
]));
push(P("γ_P,fav ist frei wählbar 1,0–2,0 (Auswahlhilfe 5.11); γ_P,sup Default 1,1."));

push(H2("5.4 Schnittgrößen (Einfeldträger, l = h)"));
push(formula([
  "Wind:     m_Ed,W = w_Ed · h²/8      v_Ed,W = w_Ed · h/2",
  "DIN 4103: m_Ed   = γ_Q · q₁ · a·(h−a)/h    v_Ed = γ_Q · q₁ · (h−a)/h",
  "maßgebend: m_Ed = MAX(W, Kat I, Kat II)     v_Ed analog",
  "Fußkraft:  N_Ed,B = N_v,sup + γ_w · t · h",
]));

push(H2("5.5 Nachweis Biegung"));
push(P("m_Rk wird über N_v,fav aus den Prüfwerten §6.2 linear interpoliert (Regressionsgerade, Excel-FORECAST):"));
push(formula([
  "m_Rk = FORECAST(N_v,fav ; m_Rk-Prüfwerte ; N_v-Prüfwerte)",
  "m_Rd = m_Rk / γ_M          (γ_M = 2,0)",
  "η_Biegung = m_Ed / m_Rd    ≤ 1",
]));
push(warn("Bereichsgrenzen: Liegt N_v,fav über dem obersten Prüfpunkt, wird m_Rk auf diesen gekappt (kein Tragfähigkeits-Kredit jenseits der Versuche) und gewarnt; unterhalb des untersten Prüfpunkts erfolgt eine Extrapolations-Warnung."));

push(H2("5.6 Nachweis Schub (Platte)"));
push(formula(["η_Schub = v_Ed / v_Rd      (v_Rd = 3,5 kN/m, Gutachten §6.3)"]));

push(H2("5.7 Nachweis Druckrand"));
push(formula([
  "σ_Ed = N_v,sup/(t·1000) + 6·m_Ed/(t²·1000)   [N/mm²]",
  "σ_Rd = f_k / γ_M",
  "η_Druck = σ_Ed / σ_Rd",
]));
push(note("Die Formel ist in der „je-Meter”-Konvention geschrieben (N_v in kN/m, t in m); das Ergebnis ergibt sich in N/mm²."));

push(H2("5.8 Nachweis Bodenanschluss (Reibung Stahl/Beton)"));
push(formula([
  "μ_d  = μ_k / γ_M,μ           (μ_k = 0,5 ; γ_M,μ = 1,5)",
  "V_Rd = μ_d · N_Ed,B          η_Boden = v_Ed / V_Rd",
]));

push(H2("5.9 Deckenanschluss (Winkel – Anschlusskraft)"));
push(formula(["V_Winkel = v_Ed · e_W        Anzahl = ROUNDUP(l / e_W) + 1"]));
push(P("Die Anschlusskraft wird an den Stahlbau übergeben; Nachweis des Winkels und seiner Verankerung erfolgt separat."));

push(H2("5.10 Spannsystem-Bauteile"));
push(formula([
  "F_t,Ed = F0 · γ_P,sup                              (Zug je Stab)",
  "Gewindestange, Fließen (maßg.):  F_t,Rd = A_s · f_yk / γ_s",
  "Gewindestange/Schraube, EC3:     F_t,Rd = k₂ · f_ub · A_s / γ_M2",
  "                                 k₂ = 0,90 Sechskant · 0,63 Senkschraube",
  "Kopf-/Fußplatte:  M_Ed = F_t,Ed·1000·L_span/4 ; W = b·t²/6 ; σ = M/W ≤ f_yk/γ_M0",
  "                  L_span = t·1000 − 2·b_Steg",
  "Steinpressung:    σ = F_t,Ed·1000 / (2·b_Steg·l_P) ≤ f_k/γ_M",
]));
push(bullet("Der **Gewindestangen-Fließnachweis** (A_s·f_yk/γ_s) ist maßgebend und geht in η_max,Spannsystem ein."));
push(bullet("Die **Senkschraube** (k₂ = 0,63) wird als Warn-Alternative geführt; maßgebend ist die Sechskantschraube."));
push(bullet("Die **Teilflächenpressung** prüft die konzentrierte Stabkraft auf die Steinstege unter der Ankerplatte (Auflagerlänge l_P je Stab, Default = Raster; β = 1,0 konservativ)."));
push(bullet("**Kopplungsmutter:** vorhandene Länge ≥ Mindestlänge (3·d bei M10 = 30 mm)."));

push(H2("5.11 Maßgebende Ausnutzung & γ_P-Auswahlhilfe"));
push(P("η_max,gesamt = MAX(η_max,Wand ; η_max,Spannsystem); erfüllt, wenn ≤ 1,0."));
push(table(["γ_P,fav", "Ansatz", "Wann verwenden"], [
  ["1,0", "Lidl, kein Abschlag", "Prüfnachweis vollständig, Nachspann-Regime etabliert (F∞ ≥ 15 kN/Stab)"],
  ["1,1", "EC-üblich", "Regelfall neuer Nachweise mit Prüfwerten"],
  ["1,35", "erhöht konservativ", "Verluste unsicher / kein Nachspann-Regime / Kriechzahl am oberen Rand"],
  ["2,0", "worst case", "kein Prüfnachweis für die konkrete Lage / sensible Nutzung"],
], [1300, 2900, 5160]));

push(H2("5.12 Materialkennwerte & Prüfwerte (Bibliothek)"));
push(warn("Die Werte stammen aus dem Gutachten bzw. der Bibliothek der Arbeitsmappe und sind projektbezogen vom Tragwerksplaner zu bestätigen. In Modul 6 sind sie editierbar."));
push(table(["Größe", "Wert", "Quelle/Bedeutung"], [
  [M("f_k"), "20 N/mm²", "Wanddruckfestigkeit (§5.2)"],
  [M("γ_M"), "2,0", "Teilsicherheit Wand-Material"],
  [M("γ_w"), "13,8 kN/m³", "Wichte vorgespannte Wand"],
  [M("v_Rd"), "3,5 kN/m", "Plattenschub (§6.3)"],
  [M("Prüfwerte §6.2"), "26,7→2,4 · 80→3,7 · 240→7,6", "N_v [kN/m] → m_Rk [kNm/m]"],
  [M("A_s/f_yk/f_ub (M10)"), "58 mm² · 640 · 800 N/mm²", "Gewindestange 8.8"],
  [M("γ_s / γ_M2"), "1,25 / 1,25", "Spannstahl / Schraube"],
  [M("μ_k / γ_M,μ"), "0,5 / 1,5", "Reibung Stahl/Beton"],
], [2500, 3000, 3860]));

push(H2("5.13 Beispielrechnung – Aschersleben, Rettungswache IW-01"));
push(P("Innenwand h = 3,00 m · l = 6,00 m · t = 0,123 m; Stein i3, f_k = 20 N/mm²; Gewindestange M10 8.8; Raster e = 0,375 m; F0 = 22 kN; WLZ 2; Tor dominant; Kat. II; γ_P,fav = γ_P,sup = 1,1."));
push(H3("Lasten & Vorspannung"));
push(formula([
  "qb = 0,39 ; qp = 0,39·2,1 = 0,819 ; Cpi = 0,9·0,8 = 0,72",
  "w_i = 0,819·0,72 = 0,590 ; w_Ed = 1,5·0,590 = 0,885 kN/m²",
  "n = 1/0,375 = 2,667/m ; F∞ = 22·(1−0,33) = 14,74 kN/Stab  (≥ 11 ✓)",
  "N_v,fav = 14,74·2,667/1,1 = 35,73 kN/m",
  "N_v,sup = 22·2,667·1,1     = 64,53 kN/m",
]));
push(H3("Schnittgrößen"));
push(formula([
  "m_Ed,W = 0,885·3²/8 = 0,995 kNm/m   (maßgebend)",
  "v_Ed,W = 0,885·3/2  = 1,327 kN/m",
  "Kat. II: m_Ed = 1,5·1,0·0,9·2,1/3 = 0,945 ; v_Ed = 1,5·1,0·0,7 = 1,05",
  "N_Ed,B = 64,53 + 13,8·0,123·3 = 69,63 kN/m",
]));
push(H3("Wandnachweise"));
push(table(["Nachweis", "E_d", "R_d", "η", "Status"], [
  ["Biegung", "0,995 kNm/m", "1,310 kNm/m", "0,759", "OK"],
  ["Schub", "1,327 kN/m", "3,50 kN/m", "0,379", "OK"],
  ["Druckrand", "0,919 N/mm²", "10,0 N/mm²", "0,092", "OK"],
  ["Boden (Reibung)", "1,327 kN/m", "23,21 kN/m", "0,057", "OK"],
], [2500, 2100, 2100, 1000, 1660]));
push(P("m_Rk = FORECAST(35,73) = 2,62 kNm/m → m_Rd = 1,310. Deckenwinkel: V_Winkel = 1,327·1,5 = 1,99 kN, 5 Winkel. **η_max,Wand = 0,759** (Biegung maßgebend)."));
push(H3("Spannsystem"));
push(table(["Bauteil", "E_d", "R_d", "η", "Status"], [
  ["Stange – Fließen (maßg.)", "24,2 kN", "29,70 kN", "0,815", "OK"],
  ["Stange/Schraube – EC3 (SK)", "24,2 kN", "33,41 kN", "0,724", "OK"],
  ["Schraube unten – Senk", "24,2 kN", "23,39 kN", "1,035", "NICHT OK"],
  ["Kopf-/Fußplatte", "111,6 N/mm²", "235 N/mm²", "0,475", "OK"],
  ["Steinpressung", "1,61 N/mm²", "10,0 N/mm²", "0,161", "OK"],
], [2500, 2100, 1900, 1000, 1860]));
push(P("**η_max,Spannsystem = 0,815** (Gewindestange Fließen). Die Senkschraube überschreitet 100 % → nur Sechskantschraube zulässig."));
push(box(["Ergebnis:  η_max,gesamt = MAX(0,759 ; 0,815) = 0,815  →  NACHWEIS ERFÜLLT"], "E3F5EA", "1F9D55"));

// ---------- 6 Modul 1 ----------
push(H1("6 · Modul 1 · Wand planen & auslegen"));
push(P("Zweck: erzeugt das geprüfte Wandelement – zeichnen + statisch auslegen in einem Schritt."));
push(P("Eingaben: Länge, Höhe, Seiten-Funktionen, Öffnungen (inkl. Durchbrüche per Klick), Horizontallast q_k + gamma_Q, Material (f_cd, C_fd, rho), Gewindestangenlänge, Modus (Auto/Nachweis).", {}));
push(P("Ablauf: Verband i3-maximiert, Stränge (mit Segmenten über/unter Öffnungen) abgeleitet, dann Auslegungs-Engine (Kap. 4). Ergebnis: maßstäbliches Wandbild mit ein-/ausblendbarer Bemaßung, Nachweis-Tabelle, Stückliste, Iterationsprotokoll."));
push(bullet("**Versatz-/Baubarkeits-Warnung:** bei Verstoß rote Warnung + Status-Badge „Verband regelwidrig”."));
push(bullet("**Durchbrüche:** Steine per Klick entfernen/auffüllen; über/unter allen Öffnungen Vorspannung unterbrochen."));
push(bullet("**Staffelung:** getreppte Wandkontur über Stufen (Abschnitt 2.7) inkl. Bemaßung."));
push(bullet("**Export:** ein Format – „Projekt-Bundle (JSON)”."));

// ---------- 7 Modul 2 · Horizontaler Wandaufbau (Verbinder + Latten/Dämmung) ----------
push(H1("7 · Modul 2 · Horizontaler Wandaufbau"));
push(P("Zweck: Verbinder- UND Latten-/Dämmungsplanung in einem Schritt (ersetzt die früheren Module Verbinder und Latten). Die Panelfugen bestimmen die Verbinderachsen; daraus werden Latten und Dämmpakete abgeleitet."));
push(H2("Verbinderachsen aus Panelfugen"));
push(bullet("**Panelmaß** (Standard 62,5 × 150 cm, änderbar) legt die Verbinderachsen fest: vertikale Achsen an den Panel-Längsfugen, horizontale an den Panel-Höhenfugen – plus Zwischenachsen, wenn der Max-Abstand überschritten wird."));
push(bullet("Zusätzlich an Wandkanten (Randabstand) und an den Öffnungskanten; keine Verbinder innerhalb von Öffnungen."));
push(bullet("**Beplankungsfeld:** häufig wird nur ein Teil der Wand beplankt – ein rechteckiges Feld (aufziehen, rastet aufs Panelraster) begrenzt Verbinder, Latten und Dämmung; im Layout als feld_cm exportiert. Standard = ganze Wand."));
push(H2("Nachweis je Verbinder"));
push(formula([
  "R_d    = R_k / gamma_M          [kN]   (zul. Zuglast je Verbinder)",
  "coeff  = gamma_Q · w_k          [kN/m²]",
  "A_t    = Feldfläche / Anzahl    A_t / A_tmax ≤ 100 %  (A_tmax = R_d / coeff)",
]));
push(bullet("Verbinder-Katalog: FA-1 (R_k 0,50), FA-2 schwer (0,80), IA-1 leicht (0,25), Universal (0,50); je gamma_M = 2,0."));
push(H2("Latten & Dämmung"));
push(bullet("Latten verlaufen vertikal auf den Verbinderachsen; an Öffnungen und am Feldrand abgeschnitten."));
push(bullet("Stöße liegen zwischen zwei Verbindern (mittig); Wandhöhe > Lattenlänge → 1D-Zuschnitt mit Reststück-Wiederverwendung."));
push(bullet("Dämmung je Gefach (lichter Abstand zwischen Latten) × Höhe minus Öffnungen → Fläche je Paket."));
push(bullet("Eingaben: Lattenbreite (4 cm), Stangenlänge (150 cm), Dämmdicke. Ausgaben: Projekt-Bundle (Wandelement + Verbinder-Layout), Zuschnittliste (CSV)."));

// ---------- 9 Montage ----------
push(H1("8 · Modul 3 · Montageplanung"));
push(P("Zweck: lagenweise Aufbauanleitung mit Vorspann-Schritten und Gesamt-Stückliste. Interaktiver Lagen-Viewer, Wandüberblick mit Bemaßung, Vorspann-Hinweise (Stangenlänge, Kopplungshöhen aus rod_mm), druckbare Anleitung."));

// ---------- 10 Roboter ----------
push(H1("9 · Modul 4 · Roboter-Export"));
push(P("Zweck: maschinenlesbare Montagesequenz für den robotischen Aufbau – herstellerneutral als JSON/CSV. Schrittfolge: Bodenblech + Senkkopfschrauben/Kopplungsmuttern am Fuß, PLACE_STONE (Lage für Lage), Gewindestangen/Kopplungen, Kopfblech bzw. Spannplatten, abschließend TENSION. Referenzsystem: Nullpunkt unten-links-vorne, X=Länge, Y=Wandstärke, Z=Höhe, mm; Platzierungsbezug Stein-Ecke unten-links-vorne."));

// ---------- 11 Projekt-Manager ----------
push(H1("10 · Modul 5 · Projekt-Manager (DXF/IFC)"));
push(P("Zweck: mehrere Wände zu einem Projekt zusammenführen, im 2D-Grundriss platzieren, Sammel-Stückliste, CAD/BIM-Export."));
push(bullet("**DXF:** Grundriss und Ansichten (Layer für Steine, Vorspannung, Öffnungen)."));
push(bullet("**IFC4:** jede Wand als IfcWallStandardCase, Öffnungen als Voids, Steine als IfcBuildingElementProxy. Optional echte Geometrie (BREP): i2/i3 als IfcFacetedBrep, je Typ einmal als IfcRepresentationMap, pro Stein per IfcMappedItem referenziert (schlanke Datei)."));

// ---------- 12 Statik-Modul (Werkzeug) ----------
push(H1("11 · Modul 6 · Statik (Werkzeug)"));
push(lead("Die Oberfläche zum Schermer-Nachweis aus Kapitel 5. Alle Formeln und die Beispielrechnung stehen dort; dieses Kapitel beschreibt Bedienung, Ein-/Ausgaben und die Bundle-Anbindung."));
push(P("Eingaben (editierbar wie die Bibliothek der Arbeitsmappe): Geometrie (h, l, t, Öffnungszahl), Material (f_k, γ_w, γ_M, v_Rd, μ_k, γ_M,μ), Gewindestange (Auswahl M8–M20 füllt A_s/f_yk/f_ub), Lasten (Windzone, q_p-Faktor, c_pe,10, Torsituation, γ_Q, DIN-4103-Werte), Vorspannung (Raster e, F0, ΔF, F,inf, γ_P,fav wählbar 1,0–2,0, γ_P,sup), Prüfwerte §6.2, Spannsystem-Bauteile (Steg, Kopf-/Fußplatte, k₂-Werte, Mutter, Auflagerlänge l_P), Deckenwinkel-Abstand."));
push(P("Ausgaben: **Kompaktnachweis Wand** (Biegung, Schub, Druckrand, Boden, Deckenwinkel) und **Kompaktnachweis Spannsystem** (Stange EC3 + Fließen, Spannschraube, Schraube unten Sechskant/Senk, Kopf-/Fußplatte, Steinpressung, Mutter). Jede Karte zeigt E_d, R_d, Auslastung η und Status; oben die Gesamtausnutzung η_max,gesamt = MAX(Wand, Spannsystem)."));
push(bullet("**Bundle-Anbindung:** Geometrie und Öffnungszahl werden aus dem Projekt-Bundle / Wandelement übernommen (Kap. 3)."));
push(bullet("**Interpolations-Absicherung:** Biege-Prüfwerte werden bei Überschreitung des Prüfbereichs gekappt und gewarnt (Kap. 5.5)."));
push(H2("12.1 Transport / Hebezustand (Zusatz, nicht Gutachten)"));
push(P("Separater Spot-Check für das Anschlagblech beim Heben (vorübergehende Bemessungssituation, eigenes Faktorenregime γ_G·dyn). Eigengewicht als Streckenlast n_Ed = γ_w · t · h."));
push(formula([
  "G_Ek = n_Ed · L / n_Anker      G_Ed = γ_G · dyn · G_Ek   [kN]",
  "erf. Tragfähigkeit Anschlagmittel = G_Ed·1000 / 9,81   [kg]",
  "M_Ed = G_Ed · hebelBlech / 4   W = b·t²/6   σ = M_Ed·1e6 / W  →  σ ≤ f_y",
]));
push(warn("Der Hebe-Nachweis prüft nur das Stahlblech, nicht die Mauerwerksbiegung zwischen den Anschlagpunkten und nicht den Ankerauszug aus dem Mauerwerk — diese sind gesondert zu führen."));

// ---------- 13 3D ----------
push(H1("12 · Modul 7 · 3D-Vorschau"));
push(P("Zweck: Echtzeit-3D des Wandelements (Steine i2/i3, Vorspannstränge segmentiert, Öffnungen), drehbar – für die Abstimmung mit Architekten/Bauherren. Optional echte Steingeometrie (eingebettete OBJ) mit massiven Stegen und offenen Kammern."));

// ---------- 14 Stückliste ----------
push(H1("13 · Modul 8 · Stückliste & Kosten"));
push(P("Zweck: Material-Auszug mit editierbaren Preisen und Excel-Export. Aus dem Wandelement: Steine, Gewindestangen, Muttern, Platten. Mit zusätzlichem Verbinder-Layout/Bundle kommen Verbinder, Latten und Dämmung automatisch hinzu. Ausgabe: Summe netto, €/m² Wandfläche (Öffnungen abgezogen), Excel/CSV."));

// ---------- 15 Fertigung ----------
push(H1("14 · Modul 9 · Fertigungszeichnung"));
push(P("Zweck: bemaßter Verlege-, Vorspann- und Verbinderplan je Wand mit Schriftfeld und Stückliste – druckbar als PDF (A3/A4 quer)."));

// ---------- 16 Weiterentwicklung ----------
push(H1("15 · Weiterentwicklung (für Nicht-Programmierer)"));
push(P("Die häufigsten Anpassungen lassen sich an klar benannten Stellen vornehmen. Wichtig: nach jeder Änderung Tests laufen lassen und publish-werkzeuge.mjs ausführen."));
push(table(["Ich möchte ändern…", "Stelle"], [
  ["System-Konstanten (Raster, Wandstärke, Stangen-Standard, max. Spannabstand, verbotene Breiten)", M("Konstantenblock in Phase-1/sembla_core.py UND Phase-2/sembla-core.mjs (gleich halten!)")],
  ["Material-/Sicherheitswerte der Statik", M("DEF_MAT in sembla-engine.mjs; DEFAULTS in sembla-statik.mjs")],
  ["Statik-Formeln", M("docs/shared/sembla-statik.js")],
  ["Auslegungs-Strategie (Kandidaten, N-Bereich)", M("autoAuslegung() in sembla-engine.mjs")],
  ["Verbinder + Latten/Dämmung", M("Modul-Wandaufbau/SEMBLA_Wandaufbau.html (Panelfugen = Achsen, Beplankungsfeld)")],
  ["Preise der Stückliste", "direkt im Tool editierbar; Default-Preise in Modul-Stueckliste/…"],
], [4000, 5360]));
push(note("Goldene Regel zur Parität: Der Wandaufbau-Kern existiert zweimal – Python (Referenz) und JavaScript (für die Tools). Wer eine Aufbau-Regel ändert, muss beide Dateien gleich halten; die Paritätstests vergleichen sie über goldene Fixtures. Bei bewussten Änderungen werden die Fixtures neu erzeugt."));

// ---------- 17 Glossar ----------
push(H1("16 · Glossar & Quellen"));
push(table(["Begriff", "Bedeutung"], [
  ["Wandelement", "parametrische JSON-Beschreibung einer Wand (Single Source of Truth)"],
  ["Lage (course)", "eine Steinreihe, 200 mm hoch"],
  ["Raster (grid)", "Längseinheit 125 mm"],
  ["Nut", "innenliegender Steg im 12,5-cm-Raster zur Verbinder-Befestigung"],
  ["Kammer", "durchgehender Hohlraum für Gewindestange/Lattice"],
  ["durchgehender Strang", "Vorspannstrang über volle Wandhöhe – statisch wirksam"],
  ["Versatz", "Mindest-Fugenversatz (1 Raster) benachbarter Lagen"],
  ["klaffende Fuge", "Grenzzustand: keine Zugspannung in der Lagerfuge (Kernmoment)"],
  ["Auslastung (util)", "Einwirkung / Widerstand; ≤ 1,0 = erfüllt"],
  ["UK", "Unterkonstruktion (Holzlattung)"],
  ["BOM", "Stückliste (bill of materials)"],
], [2600, 6760]));
push(P("Quellen: Kempen Krause, „Statische Betrachtung nichttragender Mauerwerkswände”, Proj.-Nr. 20260304. SEMBLA-Systemparameter (Polycare)."));

// ---------- 18 Regelwerk (hierarchisch) ----------
push(H1("17 · Regelwerk – alle Systemregeln hierarchisch"));
push(lead("Vollständiger, nach Themen gegliederter Katalog der im System hinterlegten Regeln. Jede Regel trägt eine Kennung (z. B. [G-1]) zur Referenzierung. Die Regeln sind in den genannten Kernen/Modulen umgesetzt und durch Tests abgesichert."));

push(H2("18.1 Geometrie & Verband  [G]"));
push(bullet("**[G-1]** Längsraster GRID = 125 mm; Wandlänge = Vielfaches von 125 mm."));
push(bullet("**[G-2]** Lagenhöhe COURSE = 200 mm; Wandhöhe = Vielfaches von 200 mm."));
push(bullet("**[G-3]** Wandstärke THICK = 125 mm (Systemsteine i2/i3)."));
push(bullet("**[G-4]** i3-Maximierung: jede Lage mit möglichst vielen i3 belegen; i2 nur als Endsteine."));
push(bullet("**[G-5]** Läuferverband, Überbindemaß 125 mm; Fugenversatz benachbarter Lagen ≥ 1 Raster (sonst Warnung validation.versatz_ok = false)."));
push(bullet("**[G-6]** Verbotene Segmentbreiten FORBIDDEN_N = {1, 4} Raster (nicht baubar/versetzbar)."));
push(bullet("**[G-7]** Wandende: Beginn in der 2. Achse, nicht am Randstein."));
push(bullet("**[G-8]** Öffnungen (Tür/Fenster/Durchbruch) lassen Steine aus; der Sturz darüber wird aufgefüllt."));
push(bullet("**[G-9]** Staffelung: getreppte Oberkante über Stufen [x0, x1, height]; Stufen sind Außenkontur, keine Öffnungen."));

push(H2("18.2 Kammern, Nuten & Vorspannstränge  [V]"));
push(bullet("**[V-1]** Kammer-/Strangmitte CHAMBER_OFFSET = 62,5 mm → Vorspannachsen bei x = 62,5 + 125·k mm."));
push(bullet("**[V-2]** Vorspannung höchstens alle 3 Raster (MAX_SPAN_GRID = 3 = 375 mm); Regelraster e = 0,375 m."));
push(bullet("**[V-3]** Nur durchgehende Stränge (volle Wandhöhe) sind statisch wirksam; über/unter Öffnungen wird der Strang in Segmente unterbrochen."));
push(bullet("**[V-4]** An jeder Stufenkante beidseitig ein Strang (hohe und niedrige Seite)."));
push(bullet("**[V-5]** Öffnungen: je Seite +2 zusätzliche Spannstäbe."));
push(bullet("**[V-6]** Manuelle Achsen (prestress.columns_grid) überschreiben das Regelraster exakt."));
push(bullet("**[V-7]** Gewindestangen = ceil(h / rod), Verbindungsmuttern = Stangen − 1; ROD-Standard 1100 mm (überschreibbar)."));

push(H2("18.3 Anschlüsse & Vorspann-Regime  [A]"));
push(bullet("**[A-1]** Fuß immer Bodenblech (Stahl 15 mm, wandlang, in Blechmodulen); je Strang unten Senkkopfschraube, oben Kopplungsmutter."));
push(bullet("**[A-2]** Oberer Anschluss: Kopfblech (Standard) oder Spannplatte je Strang (prestress.top_connection)."));
push(bullet("**[A-3]** Zwischenanker an Segmentenden (Öffnungen) = Spannplatten auf der Steinkante."));
push(bullet("**[A-4]** Verankerung: Ankerplatte t = 15 mm bzw. Kopplung im Hohlkasten (Flansch ≥ 15 mm)."));
push(bullet("**[A-5]** Nachspann-Regime: F∞ ≥ 15 kN/Stab, Nachspann-Auslösung bei 18 kN/Stab; rechnerische Untergrenze F,inf."));
push(bullet("**[A-6]** Stoßfugen werden gezählt; Dichtstreifen je Fuge 20 cm (Schallschutz), Gesamtlänge in der BOM."));
push(bullet("**[A-7]** Verzinkung nicht erforderlich (Umweltklasse C1/XC1 innen)."));

push(H2("18.4 Horizontaler Wandaufbau – Verbinder & UK (Modul 2)  [U]"));
push(bullet("**[U-1]** Verbinder-/UK-Nutenraster = 12,5·k cm (innenliegende Stege); Steinfugen auf diesem Raster sind Fugen, keine Nuten."));
push(bullet("**[U-2]** Vorspannungsraster = 6,25 + 12,5·k cm (Kammermitte, immer innenliegend → durchgehend)."));
push(bullet("**[U-3]** Verbinder horizontal nur auf einer innenliegenden Nut (nie in einer Stoßfuge)."));
push(bullet("**[U-4]** Verbinder vertikal in Steinmitte (10 + 20·k cm bei 20-cm-Steinen; nie auf einer Lagerfuge)."));
push(bullet("**[U-5]** Panelfugen = Verbinderachsen; Zwischenachsen bei Überschreitung des Max-Abstands; zusätzlich Achsen an Wand- und Öffnungskanten; keine Verbinder in Öffnungen."));
push(bullet("**[U-6]** Beplankung volle Wandbreite über Auskragung: äußerste Achse auf nächster Nut, max. Randüberstand 12,5 cm (1 Nut)."));
push(bullet("**[U-7]** Beplankungsfeld begrenzt Verbinder/Latten/Dämmung, rastet aufs Panelraster; Verbinder folgen dem Feld auch in der Höhe."));
push(bullet("**[U-8]** Latten vertikal auf den Achsen, an Öffnungen/Feldrand geschnitten; Stöße mittig zwischen zwei Verbindern; 1D-Zuschnitt mit Reststück-Nutzung."));
push(bullet("**[U-9]** Verbindertyp folgt Wand-Aufbau/Seite aus Modul 1 (fassade → FA, innenausbau → IA) und ist in Modul 2 nicht neu wählbar."));

push(H2("18.5 Statik (Gutachten Schermer)  [S]"));
push(bullet("**[S-1]** Statisches System: Einfeldträger über die Höhe h, oben und unten gelenkig."));
push(bullet("**[S-2]** Maßgebender Lastfall = MAX(Wind, DIN 4103-1 Kat. I, Kat. II)."));
push(bullet("**[S-3]** Biegetragfähigkeit m_Rk aus Prüfwerten §6.2 über N_v interpoliert; über den Prüfbereich gekappt + Warnung."));
push(bullet("**[S-4]** N_v,fav (günstig) für Biegung; N_v,sup (ungünstig) für Druckrand und Bodenreibung."));
push(bullet("**[S-5]** γ_M = 2,0 (Wand); γ_s = γ_M2 = 1,25; γ_Q = 1,5; γ_M,μ = 1,5."));
push(bullet("**[S-6]** γ_P,fav frei wählbar 1,0–2,0 (Auswahlhilfe 5.11); γ_P,sup Default 1,1."));
push(bullet("**[S-7]** Spannsystem: Gewindestangen-Fließen maßgebend; Senkschraube nur Warn-Alternative (nicht in η_max)."));
push(bullet("**[S-8]** η_max,gesamt = MAX(η_Wand, η_Spannsystem) ≤ 1,0 = Nachweis erfüllt."));
push(bullet("**[S-9]** Deckenwinkel-Anschlusskraft wird an den Stahlbau übergeben (Winkel/Verankerung separat)."));
push(bullet("**[S-10]** Transport/Hebezustand ist ein separater Spot-Check (nicht Teil des Gutachtens)."));

push(H2("18.6 Prozess, Datenmodell & Fertigung  [P]"));
push(bullet("**[P-1]** Das Wandelement ist die Single Source of Truth: Modul 1 erzeugt es, alle übrigen Module lesen es."));
push(bullet("**[P-2]** Austauschformat = Projekt-Bundle {wandelement, verbinder_layout}; ein Export-Button, einheitliche Lade-Buttons."));
push(bullet("**[P-3]** Wandaufbau-Kern doppelt (Python = Referenz, JS = Portierung); Parität über goldene Fixtures."));
push(bullet("**[P-4]** Referenzsystem: Nullpunkt unten-links-vorne; X = Länge, Y = Wandstärke, Z = Höhe (mm)."));
push(bullet("**[P-5]** Nach jeder Änderung: Tests grün halten und publish-werkzeuge.mjs ausführen (Entwicklungs-/Auslieferungsstand konsistent)."));

// ---------- Dokument ----------
const doc = new Document({
  creator: "SEMBLA Planungs-Suite",
  title: "SEMBLA Planungs-Suite – Handbuch",
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: "13202E" },
        paragraph: { spacing: { before: 320, after: 140 }, border: { top: { style: BorderStyle.SINGLE, size: 12, color: "13202E", space: 6 } }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: "Arial", color: "13202E" },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "33414F" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 300 } } } }] },
      { reference: "nums", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 600, hanging: 300 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "SEMBLA Planungs-Suite – Handbuch", color: "9AA1AA", size: 16 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Planungshilfe – Berechnungen vom Tragwerksplaner zu bestätigen · Seite ", color: "9AA1AA", size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: "9AA1AA", size: 16 })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync("doku/SEMBLA_Handbuch.docx", buf); console.log("OK", buf.length, "bytes"); });
