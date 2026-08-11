// Fokussierter Test: Umsetzungsplan (Modul 8, Issue #55).
//
// Prueft den PRODUKTIONS-Baustein docs/shared/sembla-umsetzungsplan.js und das echte
// Artefakt docs/shared/umsetzungsplan.js direkt — nicht ueber Stubs:
//   * Vokabulare: priority-/status-Labels streng, mehrere oder unbekannte sind Fehler,
//   * Ordnung: reine Funktion ueber deklarierte Felder, jedes Kriterium einzeln belegt,
//   * Abhaengigkeitstiefe inkl. gemeldetem Zyklus,
//   * Signatur: unabhaengig von Schluesselreihenfolge/Whitespace, unabhaengig vom
//     `stand`, aber empfindlich gegen JEDE inhaltliche Aenderung,
//   * Validator: jede Regel schlaegt einzeln an; Partition; nachgerechnete Reihenfolge;
//     `naechstes` ist nicht waehlbar,
//   * Renderer: alle vier Abschnitte, Escaping, kein Teilplan bei Fehlern,
//   * das ECHTE Artefakt: gueltig, signaturtreu, byteidentisch zur Neuerzeugung,
//     ohne verbotene Inhalte,
//   * read-only/DOM-frei/kein Netz.
//
// Checkout-autark: alle Plaene ausser dem echten Artefakt sind synthetisch.

import { readFileSync } from "node:fs";
import * as P from "../../docs/shared/sembla-umsetzungsplan.js";
import { PLAN, PLAN_FORMAT, PLAN_VERSION } from "../../docs/shared/umsetzungsplan.js";

const checks = []; const ok = (n, c) => checks.push([n, !!c]);
const meldungen = (r) => r.fehler.map(f => `${f.feld}: ${f.meldung}`).join(" | ");

// --------------------------------------------------------------------------
// Bausteine fuer synthetische Plaene
// --------------------------------------------------------------------------
const E = (issue, patch = {}) => ({
  issue, titel: `Issue ${issue}`, prio: "high", status: "ready",
  sicherheit: false, abhaengig_von: [], zyklus: true, ...patch,
});
const ENT = (issue, patch = {}) => E(issue, {
  status: "decision needed",
  frage: "Soll A oder B gebaut werden?",
  optionen: [{ text: "A", wirkung: "schnell, aber grob" }, { text: "B", wirkung: "langsam, aber sauber" }],
  empfehlung: "B, weil der Fehler sonst spaeter teuer wird.", ...patch,
});
const BLO = (issue, patch = {}) => E(issue, {
  status: "blocked", ursache: "Wartet auf eine fremde Zuarbeit.",
  naechster_schritt: "Zuarbeit anfordern und danach neu bewerten.", ...patch,
});

/** Einen gueltigen Plan bauen und mit korrekter Signatur versehen. */
function plan(teile) {
  const p = { stand: "2026-08-11", entscheidungen: [], naechstes: null, weitere: [], blockiert: [], ...teile };
  return { ...p, signatur: P.planSignatur(p) };
}

// --------------------------------------------------------------------------
// 1) Vokabulare: Prioritaet und Status
// --------------------------------------------------------------------------
ok("Prioritaetsrang critical < high < medium < low < ohne",
  P.PRIO_RANG.critical < P.PRIO_RANG.high && P.PRIO_RANG.high < P.PRIO_RANG.medium
  && P.PRIO_RANG.medium < P.PRIO_RANG.low && P.PRIO_RANG.low < P.PRIO_RANG.ohne);
ok("die live vorhandenen Labels werden erkannt",
  P.prioAusLabels(["priority: high"]).prio === "high"
  && P.prioAusLabels(["priority: medium"]).prio === "medium"
  && P.prioAusLabels(["priority: low"]).prio === "low");
ok("critical ist vorausschauend zulaessig, auch ohne existierendes Label",
  P.prioAusLabels(["priority: critical"]).prio === "critical"
  && P.prioAusLabels(["priority: critical"]).fehler === null);
ok("ohne priority:-Label gilt der Rang ohne — und das ist kein Fehler",
  P.prioAusLabels(["enhancement"]).prio === "ohne" && P.prioAusLabels([]).fehler === null);
ok("mehrere priority:-Labels sind ein sichtbarer Fehler",
  /mehrere priority/.test(P.prioAusLabels(["priority: high", "priority: low"]).fehler || ""));
ok("unbekanntes priority:-Label ist ein sichtbarer Fehler, keine stille Einordnung",
  /unbekanntes priority/.test(P.prioAusLabels(["priority: hoch"]).fehler || "")
  && /unbekanntes priority/.test(P.prioAusLabels(["priority: 1"]).fehler || ""));
ok("Labelvergleich ist unabhaengig von Gross-/Kleinschreibung",
  P.prioAusLabels(["Priority: High"]).prio === "high");

ok("status:-Labels werden ebenso streng gelesen",
  P.statusAusLabels(["status: in progress"]).status === "in progress"
  && P.statusAusLabels(["status: blocked"]).status === "blocked"
  && P.statusAusLabels([]).status === "ohne"
  && /mehrere status/.test(P.statusAusLabels(["status: ready", "status: blocked"]).fehler || "")
  && /unbekanntes status/.test(P.statusAusLabels(["status: irgendwas"]).fehler || ""));

// --------------------------------------------------------------------------
// 2) Ordnung — jedes Kriterium einzeln, alles andere gleich
// --------------------------------------------------------------------------
const nrn = (l) => l.map(e => e.issue).join(",");
ok("1. Prioritaet schlaegt alles",
  nrn(P.ordne([E(1, { prio: "low" }), E(2, { prio: "critical" }), E(3, { prio: "medium" })])) === "2,3,1");
ok("2. Sicherheit/Baubarkeit vor dem Rest derselben Prioritaet",
  nrn(P.ordne([E(1), E(2, { sicherheit: true })])) === "2,1");
ok("3. geringere Abhaengigkeitstiefe zuerst",
  nrn(P.ordne([E(1, { abhaengig_von: [2] }), E(2)], { 1: 1, 2: 0 })) === "2,1");
ok("4. in progress vor ready innerhalb derselben Prioritaet",
  nrn(P.ordne([E(9, { status: "ready" }), E(8, { status: "in progress" })])) === "8,9");
ok("4. aber eine echte Abhaengigkeit schlaegt den Fortschritt",
  nrn(P.ordne([E(8, { status: "in progress", abhaengig_von: [9] }), E(9, { status: "ready" })],
    { 8: 1, 9: 0 })) === "9,8");
ok("5. aktueller Zyklus vor zurueckgestelltem",
  nrn(P.ordne([E(1, { zyklus: false }), E(2, { zyklus: true })])) === "2,1");
ok("6. zuletzt die Issue-Nummer aufsteigend",
  nrn(P.ordne([E(30), E(7), E(19)])) === "7,19,30");
ok("ordne ist rein — die Eingabeliste bleibt unveraendert",
  (() => { const l = [E(30), E(7)]; P.ordne(l); return nrn(l) === "30,7"; })());
ok("Sicherheit schlaegt NICHT die Prioritaet",
  nrn(P.ordne([E(1, { prio: "low", sicherheit: true }), E(2, { prio: "high" })])) === "2,1");

// --------------------------------------------------------------------------
// 3) Abhaengigkeitstiefe
// --------------------------------------------------------------------------
const t1 = P.tiefen([E(1), E(2, { abhaengig_von: [1] }), E(3, { abhaengig_von: [2] })]);
ok("Tiefe zaehlt die laengste Kette", t1.tiefe[1] === 0 && t1.tiefe[2] === 1 && t1.tiefe[3] === 2);
ok("kein Zyklus gemeldet, wo keiner ist", t1.zyklen.length === 0);
const t2 = P.tiefen([E(1, { abhaengig_von: [2] }), E(2, { abhaengig_von: [1] })]);
ok("ein Zyklus wird gemeldet statt aufgeloest", t2.zyklen.length > 0);
const t3 = P.tiefen([E(1, { abhaengig_von: [999] })]);
ok("unbekannte Referenz erzeugt keine Tiefe und keinen Absturz", t3.tiefe[1] === 0);

// --------------------------------------------------------------------------
// 4) Signatur — der Kern des „kein Zeitstempel-Commit"
// --------------------------------------------------------------------------
const basis = plan({ naechstes: E(5, { begruendung: "Weil es dran ist." }) });
ok("Signatur ist eine achtstellige Hexzahl", /^[0-9a-f]{8}$/.test(basis.signatur));
ok("nur der Stand geaendert ⇒ GLEICHE Signatur",
  P.planSignatur({ ...basis, stand: "2099-01-01" }) === basis.signatur);
ok("Signatur ist unabhaengig von der Schluesselreihenfolge",
  P.planSignatur({ blockiert: [], weitere: [], naechstes: basis.naechstes, entscheidungen: [], stand: "x" })
  === basis.signatur);
ok("Signatur ist unabhaengig von Whitespace in Texten",
  P.planSignatur({ ...basis, naechstes: { ...basis.naechstes, begruendung: "  Weil   es dran ist.  " } })
  === basis.signatur);
ok("geaenderte Prosa ⇒ ANDERE Signatur",
  P.planSignatur({ ...basis, naechstes: { ...basis.naechstes, begruendung: "Anderer Grund." } })
  !== basis.signatur);
ok("geaenderte Issue-Nummer ⇒ ANDERE Signatur",
  P.planSignatur({ ...basis, naechstes: { ...basis.naechstes, issue: 6 } }) !== basis.signatur);
ok("zusaetzlicher Eintrag ⇒ ANDERE Signatur",
  P.planSignatur({ ...basis, weitere: [E(9)] }) !== basis.signatur);
ok("planKern laesst stand und signatur weg",
  !("stand" in P.planKern(basis)) && !("signatur" in P.planKern(basis)));

// --------------------------------------------------------------------------
// 5) Validator: jede Regel schlaegt einzeln an
// --------------------------------------------------------------------------
ok("gueltiger Plan ist fehlerfrei", P.pruefePlan(basis).ok);
ok("fehlender Plan wird benannt statt geraten",
  !P.pruefePlan(null).ok && /kein Umsetzungsplan/.test(meldungen(P.pruefePlan(null)))
  && !P.pruefePlan(undefined).ok && !P.pruefePlan([]).ok);
ok("fehlender/kaputter Stand wird gemeldet",
  /stand/.test(meldungen(P.pruefePlan({ ...basis, stand: "11.08.2026" })))
  && /kein gueltiges Datum/.test(meldungen(P.pruefePlan({ ...basis, stand: "2026-02-31" }))));
ok("unbekanntes Feld auf oberster Ebene wird gemeldet",
  /unbekanntes Feld: notiz/.test(meldungen(P.pruefePlan({ ...basis, notiz: "x" }))));
ok("fehlende Abschnitte werden gemeldet",
  /weitere/.test(meldungen(P.pruefePlan({ ...basis, weitere: undefined }))));

// Die Signaturpruefung ist die maschinelle Sperre gegen den Zeitstempel-Commit.
ok("gedrehter Zeitstempel ohne Inhaltsaenderung faellt durch",
  /passt nicht zum Inhalt/.test(meldungen(P.pruefePlan({ ...basis, stand: "2026-08-12" })))
  === false);   // Stand geht nicht in die Signatur ein: bleibt gueltig …
ok("… aber eine Handaenderung am Inhalt faellt auf",
  /passt nicht zum Inhalt/.test(meldungen(P.pruefePlan(
    { ...basis, naechstes: { ...basis.naechstes, titel: "heimlich geaendert" } }))));
ok("fehlende Signatur wird gemeldet",
  /signatur/.test(meldungen(P.pruefePlan({ ...basis, signatur: undefined }))));
ok("die Signaturpruefung laesst sich fuer den Schreibschritt abschalten",
  P.pruefePlan({ ...basis, signatur: undefined }, { signatur: false }).ok);

// Eintragsfelder
const mitN = (patch) => P.pruefePlan(plan({ naechstes: E(5, { begruendung: "Grund.", ...patch }) }));
ok("Pflichtfeld fehlt wird gemeldet", /Pflichtfeld fehlt: prio/.test(meldungen(mitN({ prio: undefined }))));
ok("unbekanntes Feld im Eintrag wird gemeldet", /unbekanntes Feld: assignee/.test(meldungen(mitN({ assignee: "x" }))));
ok("unbekannte prio wird gemeldet", /prio unbekannt/.test(meldungen(mitN({ prio: "hoch" }))));
ok("unbekannter status wird gemeldet", /status unbekannt/.test(meldungen(mitN({ status: "wip" }))));
ok("sicherheit/zyklus muessen boolesch sein",
  /sicherheit muss/.test(meldungen(mitN({ sicherheit: "ja" })))
  && /zyklus muss/.test(meldungen(mitN({ zyklus: 1 }))));
ok("issue muss positive Ganzzahl sein", /issue muss/.test(meldungen(mitN({ issue: 0 }))));
ok("zu langer Titel wird gemeldet", /titel ist laenger/.test(meldungen(mitN({ titel: "x".repeat(121) }))));
ok("abhaengig_von muss eine Zahlenliste sein",
  /abhaengig_von muss/.test(meldungen(mitN({ abhaengig_von: ["#7"] }))));
ok("fehlende Begruendung bei naechstes wird gemeldet",
  /begruendung ist leer/.test(meldungen(mitN({ begruendung: "  " }))));

// Verbotene Inhalte — der Plan ist oeffentlich und sofort live.
ok("E-Mail in der Begruendung wird abgewiesen",
  /E-Mail-Adresse/.test(meldungen(mitN({ begruendung: "Rueckfrage an a.b@c.de" }))));
ok("lokaler Pfad in der Begruendung wird abgewiesen",
  /absoluter lokaler Pfad/.test(meldungen(mitN({ begruendung: "siehe /home/steinberger/x.js" }))));
ok("kopierter Issue-Body (mehrzeilig) wird abgewiesen",
  /mehrzeiliger Text/.test(meldungen(mitN({ begruendung: "Zeile eins\nZeile zwei" }))));

// Entscheidungen
const mitE = (patch) => P.pruefePlan(plan({ entscheidungen: [ENT(5, patch)] }));
ok("Entscheidung ohne Frage wird gemeldet", /frage ist leer/.test(meldungen(mitE({ frage: "" }))));
ok("Entscheidung ohne Empfehlung wird gemeldet", /empfehlung/.test(meldungen(mitE({ empfehlung: undefined }))));
ok("Entscheidung braucht mindestens zwei Optionen",
  /mindestens zwei/.test(meldungen(mitE({ optionen: [{ text: "A", wirkung: "x" }] }))));
ok("jede Option braucht Text und Auswirkung",
  /optionen\[1\]\.wirkung/.test(meldungen(mitE({
    optionen: [{ text: "A", wirkung: "x" }, { text: "B", wirkung: "" }] }))));
ok("gueltige Entscheidung ist fehlerfrei", P.pruefePlan(plan({ entscheidungen: [ENT(5)] })).ok);

// Blockiert
const mitB = (patch) => P.pruefePlan(plan({ blockiert: [BLO(5, patch)] }));
ok("Blockade braucht Ursache und naechsten Schritt",
  /ursache/.test(meldungen(mitB({ ursache: undefined })))
  && /naechster_schritt/.test(meldungen(mitB({ naechster_schritt: "" }))));
ok("im Abschnitt blockiert muss der Status blocked sein",
  /steht unter/.test(meldungen(mitB({ status: "ready" }))));

// --------------------------------------------------------------------------
// 6) Partition, Referenzen, nachgerechnete Ordnung
// --------------------------------------------------------------------------
ok("dasselbe Issue darf nicht zweimal im Plan stehen",
  /steht mehrfach/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(5, { begruendung: "x." }), weitere: [E(5)] })))));
ok("decision needed darf nicht als umsetzbar gefuehrt werden",
  /darf nicht als umsetzbar/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(5, { begruendung: "x.", status: "decision needed" }) })))));
ok("blocked darf nicht als umsetzbar gefuehrt werden",
  /darf nicht als umsetzbar/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(5, { begruendung: "x." }), weitere: [E(6, { status: "blocked" })] })))));
ok("Referenz auf ein Issue ausserhalb des Plans wird gemeldet",
  /nicht vorkommt/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(5, { begruendung: "x.", abhaengig_von: [999] }) })))));
ok("Selbstreferenz wird gemeldet",
  /auf sich selbst/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(5, { begruendung: "x.", abhaengig_von: [5] }) })))));
ok("Abhaengigkeitszyklus wird gemeldet",
  /Abhaengigkeitszyklus/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(5, { begruendung: "x.", abhaengig_von: [6] }),
    weitere: [E(6, { abhaengig_von: [5] })] })))));

ok("falsch sortierte Warteschlange wird gemeldet",
  /Reihenfolge weicht/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(5, { begruendung: "x." }), weitere: [E(9), E(7)] })))));
ok("richtig sortierte Warteschlange ist fehlerfrei",
  P.pruefePlan(plan({ naechstes: E(5, { begruendung: "x." }), weitere: [E(7), E(9)] })).ok);
ok("naechstes ist NICHT waehlbar — ein Lieblingsissue faellt auf",
  /nach der Ordnung waere #6/.test(meldungen(P.pruefePlan(plan({
    naechstes: E(9, { begruendung: "x." }), weitere: [E(6)] })))));
ok("umsetzbare Issues ohne naechstes waeren stiller Stillstand",
  /stiller Stillstand/.test(meldungen(P.pruefePlan(plan({ naechstes: null, weitere: [E(6)] })))));
ok("gar nichts Umsetzbares ist zulaessig (alles wartet auf Entscheidung)",
  P.pruefePlan(plan({ entscheidungen: [ENT(5)], naechstes: null, weitere: [] })).ok);
ok("falsch sortierte Entscheidungen/Blockaden werden gemeldet",
  /entscheidungen: Reihenfolge/.test(meldungen(P.pruefePlan(plan({
    entscheidungen: [ENT(9), ENT(7)] }))))
  && /blockiert: Reihenfolge/.test(meldungen(P.pruefePlan(plan({
    blockiert: [BLO(9), BLO(7)] })))));

// --------------------------------------------------------------------------
// 7) Format
// --------------------------------------------------------------------------
ok("pruefeFormat akzeptiert das erwartete Format",
  P.pruefeFormat("SEMBLA-Umsetzungsplan", 1).length === 0);
ok("fremdes Format/fremde Version werden benannt",
  P.pruefeFormat("SEMBLA-Projekt", 1).length === 1 && P.pruefeFormat("SEMBLA-Umsetzungsplan", 2).length === 1);

// --------------------------------------------------------------------------
// 8) Renderer
// --------------------------------------------------------------------------
const voll = plan({
  entscheidungen: [ENT(5)],
  naechstes: E(6, { begruendung: "Weil es die Voraussetzung ist." }),
  weitere: [E(7, { abhaengig_von: [6] })],
  blockiert: [BLO(8, { blockiert_durch: [6] })],
});
ok("der Beispielplan ist gueltig" + (P.pruefePlan(voll).ok ? "" : ": " + meldungen(P.pruefePlan(voll))),
  P.pruefePlan(voll).ok);
const vHtml = P.planAnsicht(voll);
ok("alle vier Abschnitte erscheinen",
  /gruppe-entscheidungen/.test(vHtml) && /gruppe-naechstes/.test(vHtml)
  && /gruppe-weitere/.test(vHtml) && /gruppe-blockiert/.test(vHtml));
ok("die Abschnitte stehen in fester Reihenfolge",
  vHtml.indexOf("gruppe-entscheidungen") < vHtml.indexOf("gruppe-naechstes")
  && vHtml.indexOf("gruppe-naechstes") < vHtml.indexOf("gruppe-weitere")
  && vHtml.indexOf("gruppe-weitere") < vHtml.indexOf("gruppe-blockiert"));
ok("jede Karte traegt den stabilen Anker issue-<nr>",
  [5, 6, 7, 8].every(n => vHtml.includes(`id="issue-${n}"`)));
ok("Entscheidung zeigt Frage, beide Optionen mit Wirkung und Empfehlung",
  /<b>Brauche Entscheidung:<\/b> Soll A oder B/.test(vHtml)
  && /<b>A<\/b> <span class="wirkung">schnell/.test(vHtml)
  && /<b>B<\/b> <span class="wirkung">langsam/.test(vHtml)
  && /<b>Empfehlung:<\/b> B, weil/.test(vHtml));
ok("der Abschnitt Als Naechstes nennt die Begruendung", /<b>Warum jetzt:<\/b> Weil es die Voraussetzung ist\./.test(vHtml));
ok("Blockade nennt Ursache, Verursacher und naechsten Schritt",
  /<b>Blockiert:<\/b> Wartet auf eine fremde Zuarbeit\./.test(vHtml)
  && /durch #6/.test(vHtml) && /<b>Nächster Schritt:<\/b> Zuarbeit anfordern/.test(vHtml));
ok("die Warteschlange nennt Voraussetzungen", /Setzt voraus: #6/.test(vHtml));
ok("jede Karte verlinkt ihr Issue auf github.com",
  [5, 6, 7, 8].every(n => vHtml.includes(`https://github.com/p0lycare/SEMBLA-planning-suite/issues/${n}`)));
ok("leere Abschnitte erhalten einen Hinweis statt leerem Markup",
  (P.planAnsicht(plan({})).match(/class="leer"/g) || []).length === 4);

const boese = P.planAnsicht(plan({
  naechstes: E(6, { titel: '<img src=x onerror="alert(1)">', begruendung: "<script>alert(2)</" + "script>" }) }));
ok("Plantexte werden escaped",
  !/<img src=x|<script>alert/i.test(boese) && /&lt;img src=x/.test(boese));

ok("standText nennt das Datum in Langform", P.standText(voll) === "Stand: 11. August 2026");
ok("standText ist fehlertolerant", P.standText({ stand: "quatsch" }) === "Stand unbekannt");
const fh = P.fehlerHinweis(P.pruefePlan(null));
ok("der Fehlerhinweis benennt und rendert keinen Ersatzplan",
  /Kein gültiger Umsetzungsplan/.test(fh) && /kein Umsetzungsplan/.test(fh)
  && !/gruppe-|karte /.test(fh));

// --------------------------------------------------------------------------
// 9) Das ECHTE Artefakt
// --------------------------------------------------------------------------
ok("Artefakt traegt Formatname und -version",
  PLAN_FORMAT === "SEMBLA-Umsetzungsplan" && PLAN_VERSION === 1
  && P.pruefeFormat(PLAN_FORMAT, PLAN_VERSION).length === 0);
const echt = P.pruefePlan(PLAN);
if (!echt.ok) console.log("  Validator-Fehler im echten Plan: " + meldungen(echt));
ok("der echte Plan besteht den vollen Validator (inkl. Signatur)", echt.ok);
ok("die abgelegte Signatur ist die neu berechnete — kein Zeitstempel-Commit",
  PLAN.signatur === P.planSignatur(PLAN));

const dateiIst = readFileSync(new URL("../../docs/shared/umsetzungsplan.js", import.meta.url), "utf8");
ok("das Artefakt ist byteidentisch zu seiner Neuerzeugung (deterministischer Writer)",
  dateiIst === P.rendereDatei(PLAN));
ok("das Artefakt enthaelt nur Daten (keine Logik)",
  !/\bfunction\b|=>/.test(dateiIst.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")));
ok("der echte Plan nennt ein umsetzbares naechstes Issue", PLAN.naechstes && PLAN.naechstes.issue > 0);
ok("der echte Plan fuehrt kein decision/blocked als umsetzbar",
  [PLAN.naechstes].concat(PLAN.weitere).filter(Boolean)
    .every(e => !P.NICHT_UMSETZBAR.includes(e.status)));
ok("jedes Issue steht im echten Plan genau einmal",
  (() => { const n = P.alleEintraege(PLAN).map(e => e.issue); return new Set(n).size === n.length; })());

// --------------------------------------------------------------------------
// 10) Read-only, DOM-frei, kein Netz
// --------------------------------------------------------------------------
const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
const src = ohneKommentar(readFileSync(
  new URL("../../docs/shared/sembla-umsetzungsplan.js", import.meta.url), "utf8"));
ok("Baustein ist DOM-frei", !/document\.|window\.|localStorage\./.test(src));
ok("Baustein ruft nichts ab und kennt keine Zugangsdaten",
  !/fetch\(|api\.github\.com|Authorization|client_secret/i.test(src));
ok("Baustein liest kein Wandelement und kein Eingaben-Modell",
  !/storage\.js|wandelement|mergeEingaben|buildWall/i.test(src));
ok("Baustein importiert das Artefakt NICHT statisch (fehlender Plan darf die Seite nicht toeten)",
  !/^import[^\n]*umsetzungsplan\.js/m.test(src));

let fail = 0;
for (const [n, c] of checks) { console.log((c ? "  ok  " : "FAIL  ") + n); if (!c) fail++; }
console.log(`\n${checks.length - fail}/${checks.length} ok`);
process.exit(fail ? 1 : 0);
