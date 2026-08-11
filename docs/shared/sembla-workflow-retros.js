// @ts-check
/**
 * SEMBLA Workflow-Retros — Logik der dritten Ansicht von Modul 8 (Issue #65).
 *
 * Rein/DOM-frei. Eigene Datei nach der shared/-Regel a+b: genutzt von Modul 8
 * (`docs/blog.html`), vom Schreibschritt (`workflow-retros-schreiben.mjs`) UND von den
 * eigenen Tests (`tests/module/test-workflow-retros.mjs`).
 *
 * WAS DAS IST. Der Retro-Cron bewertet ausschliesslich belegte, bereits VEROEFFENTLICHTE
 * Umsetzungsruns. Diese Bewertung lebt bisher nur lokal und war fuer Tibor mobil nicht
 * einsehbar. Modul 8 zeigt sie deshalb — genau wie den Umsetzungsplan — aus einem
 * versionierten, sanitisierten Artefakt (`workflow-retros.js`).
 *
 * DREI ZUSICHERUNGEN:
 *
 *   1. KENNZAHLEN SIND RECHNUNG, KEIN DATUM. `kennzahlen()` leitet jede Gesamtzahl bei
 *      JEDER Ausgabe frisch aus den validen Einzelruns ab. Es gibt im Artefakt keinen
 *      gespeicherten Aggregatwert, der von den Einzelruns abweichen koennte.
 *
 *   2. FEHLENDES BLEIBT LEER. Ein nicht belegter Wert ist `null` und wird als „nicht
 *      belegt" ausgewiesen; er wird NIE durch 0 oder einen Mittelwert ersetzt. Jede
 *      Kennzahl nennt ihren eigenen Nenner (`von` = Runs mit belegtem Wert).
 *
 *   3. DER FILTER IST ANZEIGE. `filterRuns()` waehlt nur Karten aus; die Kennzahlen
 *      kommen immer aus dem vollen validen Bestand.
 *
 * READ-ONLY UND STATISCH. Kein Fetch, kein localStorage, kein Backend, kein Schreibpfad
 * in Projektdaten. Die lokalen Workflow-, Queue-, Manifest-, Retro- und Sessiondateien
 * werden hier NIEMALS gelesen — sie sind Belegquelle des Schreibschritts, nicht Eingabe
 * der Oberflaeche.
 *
 * SICHERHEIT. Das Repo ist oeffentlich. Jeder Freitext laeuft durch `pruefeText()` (den
 * einen Textwaechter aus `sembla-blog.js`) und zusaetzlich durch `RETRO_VERBOTEN`
 * (Sitzungskennungen, Dateipfade); beim Rendern durch `esc()`.
 */

import { esc, issueUrl, pruefeText, datumLang, REPO } from "./sembla-blog.js";

// Das Artefakt `workflow-retros.js` wird hier BEWUSST NICHT importiert — gleicher Grund
// wie beim Umsetzungsplan: ein fehlgeschlagener statischer Import nimmt im Browser die
// ganze Seite mit, und der Schreibschritt muss diese Logik schon vor dem Erstlauf laden
// koennen. Alle Funktionen bekommen die Runs als Parameter.

/** Erwarteter Formatname/-version (eigene Achse, getrennt von PLAN_/BLOG_/SCHEMA_). */
export const ERWARTET_FORMAT = "SEMBLA-Workflow-Retros";
export const ERWARTET_VERSION = 1;

// --------------------------------------------------------------------------
// 1) Kanonisches Vokabular
// --------------------------------------------------------------------------

/**
 * Die DREI kanonischen Retro-Klassifikationen — genau die des Retro-Maszstabs.
 * Es gibt keine vierte, keine „teilweise" und keine erfundene Zwischenstufe.
 */
export const KLASSIFIKATION_TEXT = {
  beibehalten: "beibehalten",
  beobachten: "beobachten",
  aenderung_vorschlagen: "Änderung vorschlagen",
};

/** Kurze Erklaerung je Klassifikation (Filterbeschriftung und Legende). */
export const KLASSIFIKATION_HINWEIS = {
  beibehalten: "Workflow greift messbar — unveraendert weiterfahren.",
  beobachten: "Geliefert, aber ein Befund soll im naechsten Lauf sinken.",
  aenderung_vorschlagen: "Wiederholt belegte Luecke — Aenderung wird Tibor vorgeschlagen.",
};

/** Hoechstlaengen der Freitexte. */
export const LAENGE = { titel: 120, nutzerergebnis: 400, teststatus: 240, erkenntnis: 240 };

/** Hoechstzahl der Erkenntnisse je Run (mehr waere keine Retro, sondern ein Protokoll). */
export const MAX_ERKENNTNISSE = 3;

/**
 * Erlaubte Felder eines Runs — zugleich die Byte-Reihenfolge der erzeugten Datei.
 * Ein unbekanntes Feld ist ein harter Fehler: nur so kann nichts Internes (etwa eine
 * Sitzungskennung oder ein Rohprotokoll) versehentlich mitreisen.
 */
export const FELDER = [
  "paket", "nr", "datum", "titel", "issues", "commit", "ergebnis", "nutzerergebnis",
  "veroeffentlicht", "laufzeit_s", "reflexions_turns", "implementierungs_turns",
  "korrektur_turns", "korrektur_runden", "diff_dateien", "diff_plus", "diff_minus",
  "test_wiederholungen", "verdeckte_exitcodes", "teststatus", "erkenntnisse",
];

/** Felder, die `null` sein duerfen, wenn der Wert nicht belegt ist. */
export const NULLBAR = [
  "laufzeit_s", "reflexions_turns", "implementierungs_turns", "korrektur_turns",
  "korrektur_runden", "diff_dateien", "diff_plus", "diff_minus",
  "test_wiederholungen", "verdeckte_exitcodes",
];

/**
 * Zusaetzlich verbotene Inhalte — ueber `VERBOTEN` aus `sembla-blog.js` hinaus.
 * Sitzungskennungen und Dateipfade sind interne Betriebsdaten und gehoeren nicht in eine
 * oeffentliche Ansicht; Modulnamen und Testbefehle genuegen fachlich vollstaendig.
 */
export const RETRO_VERBOTEN = [
  { name: "Sitzungskennung",
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { name: "Dateipfad",
    re: /[\w.-]+\/[\w.-]+\.(?:js|mjs|cjs|html|json|md|py|docx|css|txt|log|ya?ml)\b/i },
];

const RE_PAKET = /^wp-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
const RE_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const RE_COMMIT = /^[0-9a-f]{40}$/;

/**
 * Echtes Kalenderdatum? `Date.parse` genuegt nicht: es rollt „2026-02-31" still weiter
 * und meldete damit ein erfundenes Datum als gueltig.
 */
function echtesDatum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

/** Einen Freitext pruefen — Textwaechter des Repos plus die Retro-Verbote. */
export function pruefeRetroText(wert, max) {
  const m = pruefeText(wert, max);
  if (typeof wert !== "string") return m;
  for (const v of RETRO_VERBOTEN) {
    if (v.re.test(wert)) m.push(`enthaelt Verbotenes: ${v.name}`);
  }
  return m;
}

// --------------------------------------------------------------------------
// 2) Ordnung und Anker
// --------------------------------------------------------------------------

/** Sortierschluessel „neu -> alt": Datum, dann laufende Nummer des Tages. */
export function runSchluessel(run) {
  const r = run && typeof run === "object" ? run : {};
  return String(r.datum || "") + "#" + String(Number.isInteger(r.nr) ? r.nr : 0).padStart(2, "0");
}

/** Runs deterministisch ordnen: neueste zuerst (reine Funktion). */
export function ordneRuns(runs) {
  return (Array.isArray(runs) ? runs.slice() : []).sort((a, b) => {
    const ka = runSchluessel(a), kb = runSchluessel(b);
    return ka < kb ? 1 : (ka > kb ? -1 : 0);
  });
}

/** Stabiler Anker/DOM-Bezeichner eines Runs (kollidiert nicht mit #chg-… / #issue-…). */
export function ankerId(run) {
  const r = run && typeof run === "object" ? run : {};
  return "retro-" + String(r.datum || "").replace(/-/g, "")
    + "-" + String(Number.isInteger(r.nr) ? r.nr : 0).padStart(2, "0");
}

// --------------------------------------------------------------------------
// 3) Validator
// --------------------------------------------------------------------------

/**
 * Retro-Runs pruefen.
 *
 * @param {any} runs zu pruefende Liste
 * @returns {{ok:boolean, fehler:{feld:string,meldung:string}[]}}
 */
export function pruefeRetros(runs) {
  const fehler = [];
  const melde = (feld, m) => fehler.push({ feld: String(feld), meldung: m });

  if (!Array.isArray(runs)) {
    melde("runs", "es liegen keine Workflow-Retros vor");
    return { ok: false, fehler };
  }
  if (!runs.length) {
    melde("runs", "die Liste ist leer — es gibt nichts auszuwerten");
    return { ok: false, fehler };
  }

  const pakete = new Set();
  const schluessel = new Set();

  runs.forEach((r, i) => {
    const feld = `runs[${i}]`;
    if (!r || typeof r !== "object" || Array.isArray(r)) { melde(feld, "kein Objekt"); return; }

    for (const k of Object.keys(r)) {
      if (!FELDER.includes(k)) melde(feld, `unbekanntes Feld: ${k}`);
    }
    for (const k of FELDER) {
      if (r[k] === undefined) melde(feld, `Pflichtfeld fehlt: ${k}`);
      else if (r[k] === null && !NULLBAR.includes(k)) melde(feld, `${k} darf nicht null sein`);
    }

    if (!RE_PAKET.test(String(r.paket || ""))) {
      melde(feld, "paket passt nicht zu wp-YYYY-MM-DD-<kennung>");
    } else if (pakete.has(r.paket)) melde(feld, `Paket ${r.paket} steht mehrfach in der Liste`);
    else pakete.add(r.paket);

    if (!Number.isInteger(r.nr) || r.nr < 1 || r.nr > 99) {
      melde(feld, "nr muss eine Ganzzahl von 1 bis 99 sein");
    }
    if (!RE_DATUM.test(String(r.datum || ""))) melde(feld, "datum passt nicht zu YYYY-MM-DD");
    else if (!echtesDatum(r.datum)) melde(feld, "datum ist kein gueltiges Datum");

    const s = runSchluessel(r);
    if (schluessel.has(s)) melde(feld, `Datum und nr kommen mehrfach vor (${s})`);
    schluessel.add(s);

    for (const [k, max] of [["titel", LAENGE.titel], ["nutzerergebnis", LAENGE.nutzerergebnis],
      ["teststatus", LAENGE.teststatus]]) {
      for (const msg of pruefeRetroText(r[k], max)) melde(feld, `${k} ${msg}`);
    }

    if (!Array.isArray(r.issues) || !r.issues.length
      || !r.issues.every((n) => Number.isInteger(n) && n > 0)) {
      melde(feld, "issues muss mindestens eine positive Ganzzahl nennen");
    }
    if (!RE_COMMIT.test(String(r.commit || ""))) {
      melde(feld, "commit muss ein vollstaendiger 40-stelliger Hash sein");
    }
    if (!Object.prototype.hasOwnProperty.call(KLASSIFIKATION_TEXT, r.ergebnis)) {
      melde(feld, `ergebnis unbekannt: ${r.ergebnis} `
        + `(erlaubt: ${Object.keys(KLASSIFIKATION_TEXT).join(", ")})`);
    }
    if (typeof r.veroeffentlicht !== "boolean") melde(feld, "veroeffentlicht muss true/false sein");

    for (const k of NULLBAR) {
      const w = r[k];
      if (w === null || w === undefined) continue;
      if (!Number.isInteger(w) || w < 0) melde(feld, `${k} muss null oder eine Ganzzahl >= 0 sein`);
      else if (k === "laufzeit_s" && w === 0) melde(feld, "laufzeit_s muss groesser als 0 sein");
    }

    if (!Array.isArray(r.erkenntnisse)) melde(feld, "erkenntnisse muss eine Liste sein");
    else {
      if (r.erkenntnisse.length > MAX_ERKENNTNISSE) {
        melde(feld, `erkenntnisse nennt ${r.erkenntnisse.length} Punkte, `
          + `erlaubt sind hoechstens ${MAX_ERKENNTNISSE}`);
      }
      r.erkenntnisse.forEach((e, j) => {
        for (const msg of pruefeRetroText(e, LAENGE.erkenntnis)) {
          melde(feld, `erkenntnisse[${j}] ${msg}`);
        }
      });
    }

    if (i > 0 && runSchluessel(runs[i - 1]) <= s) {
      melde(feld, "Reihenfolge verletzt (erwartet: neu -> alt, streng absteigend)");
    }
  });

  return { ok: fehler.length === 0, fehler };
}

/** Format und Version des Artefakts pruefen (eigene Achse). */
export function pruefeFormat(format, version) {
  const fehler = [];
  if (format !== ERWARTET_FORMAT) {
    fehler.push({ feld: "RETRO_FORMAT", meldung: `erwartet „${ERWARTET_FORMAT}", gelesen „${format}"` });
  }
  if (version !== ERWARTET_VERSION) {
    fehler.push({ feld: "RETRO_VERSION", meldung: `erwartet ${ERWARTET_VERSION}, gelesen ${version}` });
  }
  return fehler;
}

// --------------------------------------------------------------------------
// 4) Kennzahlen — jedes Mal frisch aus den Einzelruns
// --------------------------------------------------------------------------

/** Summe eines Zahlenfelds ueber alle Runs, die es belegen. */
function summe(runs, feld) {
  let wert = 0, von = 0;
  for (const r of runs) {
    const w = r && r[feld];
    if (Number.isInteger(w)) { wert += w; von++; }
  }
  return { wert: von ? wert : null, von, gesamt: runs.length };
}

/**
 * Gesamtlage aus den validen Einzelruns.
 *
 * Jede Kennzahl nennt ihren eigenen Nenner (`von`): fehlende Werte werden weder geraten
 * noch als 0 gezaehlt, sie verkleinern sichtbar die Grundlage. Es wird NICHTS davon
 * gespeichert — die Ansicht rechnet bei jeder Ausgabe neu.
 */
export function kennzahlen(runs) {
  const liste = (Array.isArray(runs) ? runs : []).filter((r) => r && typeof r === "object");
  const dauer = summe(liste, "laufzeit_s");
  const runden = summe(liste, "korrektur_runden");
  return {
    runs: liste.length,
    veroeffentlicht: {
      wert: liste.filter((r) => r.veroeffentlicht === true).length,
      von: liste.length, gesamt: liste.length,
    },
    laufzeit_schnitt_s: {
      wert: dauer.von ? dauer.wert / dauer.von : null,
      von: dauer.von, gesamt: liste.length,
    },
    korrektur_runden: {
      wert: runden.wert, von: runden.von, gesamt: liste.length,
      runs_mit: liste.filter((r) => Number.isInteger(r.korrektur_runden) && r.korrektur_runden > 0).length,
    },
    test_wiederholungen: summe(liste, "test_wiederholungen"),
    verdeckte_exitcodes: summe(liste, "verdeckte_exitcodes"),
  };
}

/** Runs auf eine Klassifikation einschraenken (`"alle"` = alles zeigen). */
export function filterRuns(runs, klassifikation) {
  const liste = (Array.isArray(runs) ? runs : []).filter((r) => r && typeof r === "object");
  if (!Object.prototype.hasOwnProperty.call(KLASSIFIKATION_TEXT, klassifikation)) return liste;
  return liste.filter((r) => r.ergebnis === klassifikation);
}

// --------------------------------------------------------------------------
// 5) Ansicht
// --------------------------------------------------------------------------

/** Sekunden als „29:31 min" (kaufmaennisch gerundet, keine erfundene Genauigkeit). */
export function dauerText(sek) {
  if (!Number.isFinite(sek) || sek === null) return "nicht belegt";
  const g = Math.round(sek);
  return `${Math.floor(g / 60)}:${String(g % 60).padStart(2, "0")} min`;
}

const zahlText = (w, einheit = "") =>
  Number.isInteger(w) ? `${w}${einheit}` : "nicht belegt";

const turnsText = (r) => {
  const teile = [];
  teile.push(`Rückspiegelung ${zahlText(r.reflexions_turns)}`);
  teile.push(`Umsetzung ${zahlText(r.implementierungs_turns)}`);
  teile.push(`Korrektur ${zahlText(r.korrektur_turns)}`);
  return teile.join(" · ");
};

const diffText = (r) => (Number.isInteger(r.diff_dateien)
  ? `${r.diff_dateien} Dateien · +${zahlText(r.diff_plus)} / −${zahlText(r.diff_minus)}`
  : "nicht belegt");

const wertZeile = (name, wert) =>
  `<li><span class="wname">${esc(name)}</span><span class="wwert">${esc(wert)}</span></li>`;

/** Link auf den oeffentlichen Commit (Kurzform als Beschriftung). */
export const commitUrl = (sha) => `https://github.com/${REPO}/commit/${sha}`;

/**
 * Eine Run-Karte. Aufgeklappt wird mit dem eingebauten `details`/`summary` des Browsers
 * — kein eigenes Klickskript, damit die Karte auch ohne JavaScript-Zustand bedienbar
 * bleibt und die Trefferflaeche (`summary`) gross genug ist.
 */
export function retroKarte(run) {
  const r = run && typeof run === "object" ? run : {};
  const issues = (Array.isArray(r.issues) ? r.issues : []);
  const erk = (Array.isArray(r.erkenntnisse) ? r.erkenntnisse : []);
  return `<details class="karte retro" id="${esc(ankerId(r))}">`
    + `<summary class="rsum">`
    + `<span class="kopf">`
    + `<span class="chip klass klass-${esc(r.ergebnis)}">`
    + `${esc(KLASSIFIKATION_TEXT[r.ergebnis] || r.ergebnis)}</span>`
    + issues.map((n) => `<span class="chip nr">#${esc(n)}</span>`).join("")
    + `<span class="datum">${esc(datumLang(r.datum))}</span>`
    + `</span>`
    + `<span class="rtitel">${esc(r.titel)}</span>`
    + `<span class="rpaket">${esc(r.paket)}</span>`
    + `</summary>`
    + `<div class="rinhalt">`
    + `<p class="ergebnis"><b>Nutzerergebnis:</b> ${esc(r.nutzerergebnis)}</p>`
    + `<ul class="rwerte">`
    + wertZeile("Laufzeit", dauerText(r.laufzeit_s))
    + wertZeile("Claude-Turns", turnsText(r))
    + wertZeile("Korrekturrunden", zahlText(r.korrektur_runden))
    + wertZeile("Diff-Umfang", diffText(r))
    + wertZeile("Vermeidbare Testwiederholungen", zahlText(r.test_wiederholungen))
    + wertZeile("Verdeckte Test-Exitcodes", zahlText(r.verdeckte_exitcodes))
    + wertZeile("Veröffentlicht", r.veroeffentlicht === true ? "ja, live geprüft" : "nein")
    + `</ul>`
    + `<p class="rtests"><b>Tests:</b> ${esc(r.teststatus)}</p>`
    + (erk.length
      ? `<ul class="rerk">${erk.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
      : `<p class="leer">Keine Erkenntnis festgehalten.</p>`)
    + `<div class="fuss">`
    + issues.map((n) => `<a class="ref" href="${esc(issueUrl(n))}" target="_blank" `
      + `rel="noopener">Issue #${esc(n)}</a>`).join("")
    + `<a class="ref" href="${esc(commitUrl(r.commit))}" target="_blank" rel="noopener">`
    + `Commit ${esc(String(r.commit).slice(0, 7))}</a>`
    + `<a class="anker" href="#${esc(ankerId(r))}" title="Link zu diesem Run">`
    + `#${esc(ankerId(r))}</a>`
    + `</div>`
    + `</div></details>`;
}

/** Die Kartenliste (neueste zuerst). */
export function retroKarten(runs) {
  const liste = ordneRuns(runs);
  if (!liste.length) {
    return `<p class="leer">Kein Run mit dieser Bewertung.</p>`;
  }
  return liste.map(retroKarte).join("");
}

const kzFeld = (name, wert, fuss) =>
  `<div class="kzfeld"><span class="kzwert">${esc(wert)}</span>`
  + `<span class="kzname">${esc(name)}</span>`
  + (fuss ? `<span class="kzvon">${esc(fuss)}</span>` : "")
  + `</div>`;

const belegt = (k) => k.von === k.gesamt
  ? `alle ${k.gesamt} Runs belegt` : `${k.von} von ${k.gesamt} Runs belegt`;

/** Die Gesamtlage als HTML — Karten/Felder, ausdruecklich keine Tabelle. */
export function kennzahlenHtml(k) {
  const kz = k && typeof k === "object" ? k : {};
  return `<div class="kz">`
    + kzFeld("veröffentlichte Runs", String(kz.runs || 0), "")
    + kzFeld("erfolgreich veröffentlicht",
      `${kz.veroeffentlicht ? kz.veroeffentlicht.wert : 0} / ${kz.runs || 0}`, "live geprüft")
    + kzFeld("Laufzeit im Schnitt",
      dauerText(kz.laufzeit_schnitt_s ? kz.laufzeit_schnitt_s.wert : null),
      kz.laufzeit_schnitt_s ? belegt(kz.laufzeit_schnitt_s) : "")
    + kzFeld("Korrekturrunden",
      kz.korrektur_runden ? zahlText(kz.korrektur_runden.wert) : "nicht belegt",
      kz.korrektur_runden
        ? `in ${kz.korrektur_runden.runs_mit} Runs · ${belegt(kz.korrektur_runden)}` : "")
    + kzFeld("vermeidbare Testwiederholungen",
      kz.test_wiederholungen ? zahlText(kz.test_wiederholungen.wert) : "nicht belegt",
      kz.test_wiederholungen ? belegt(kz.test_wiederholungen) : "")
    + kzFeld("verdeckte Test-Exitcodes",
      kz.verdeckte_exitcodes ? zahlText(kz.verdeckte_exitcodes.wert) : "nicht belegt",
      kz.verdeckte_exitcodes ? belegt(kz.verdeckte_exitcodes) : "")
    + `</div>`;
}

/** „Stand"-Angabe: Anzahl und neuester Run — abgeleitet, nicht gespeichert. */
export function metaText(runs) {
  const liste = ordneRuns(runs);
  if (!liste.length) return "Keine Retro-Daten vorhanden";
  return `${liste.length} ${liste.length === 1 ? "Run" : "Runs"}`
    + ` · neuester ${datumLang(liste[0].datum)}`;
}

/**
 * Sichtbare Meldung statt geratener Kennzahlen.
 * Fehlt das Artefakt oder verletzt ein Run das Format, wird NICHTS gerendert — keine
 * Teilkennzahl, keine Teilliste.
 */
export function retroFehlerHinweis(pruefung) {
  const f = (pruefung && Array.isArray(pruefung.fehler) ? pruefung.fehler : []);
  const erste = f.slice(0, 3).map((x) => `${x.feld}: ${x.meldung}`).join(" · ");
  return `<div class="fehler" role="status">`
    + `<b>Keine gültigen Workflow-Retros.</b> `
    + `Die Auswertung fehlt oder ist fehlerhaft, deshalb wird hier nichts angezeigt — `
    + `geratene Kennzahlen wären schlimmer als keine. `
    + (erste ? `Gemeldet: ${esc(erste)}${f.length > 3 ? ` (und ${f.length - 3} weitere)` : ""}. ` : "")
    + `Bitte im Repo korrigieren.`
    + `</div>`;
}

// --------------------------------------------------------------------------
// 6) Das Artefakt schreiben (genutzt vom Schreibschritt)
// --------------------------------------------------------------------------

/** Fester Kopf der erzeugten Datei — konstant, damit die Ausgabe bytestabil bleibt. */
const DATEI_KOPF = `// @ts-check
/**
 * SEMBLA Workflow-Retros — das Datenartefakt (Modul 8, Issue #65).
 *
 * ERZEUGT — NICHT VON HAND BEARBEITEN. Geschrieben wird ausschliesslich ueber
 * \`workflow-retros-schreiben.mjs\` (npm run retros:schreiben). Reine Daten, keine Logik;
 * die Auswertung liegt in \`sembla-workflow-retros.js\`.
 *
 * Enthalten sind ausschliesslich bereits veroeffentlichte Umsetzungsruns mit bewusst
 * sanitisierten, deklarierten Feldern. Ein nicht belegter Wert steht als \`null\` und
 * wird NICHT geraten. Gesamtkennzahlen stehen hier absichtlich NICHT — sie werden bei
 * jeder Ausgabe frisch aus diesen Einzelruns gerechnet.
 *
 * ACHTUNG — dieses Repo ist oeffentlich: keine Pfade, keine Sitzungskennungen, keine
 * Nutzernamen, keine E-Mail-Adressen, keine Tokens, keine Prompt- oder Issue-Rohtexte,
 * keine Logs und keine vollstaendigen Toolausgaben.
 * \`tests/module/test-workflow-retros.mjs\` prueft das maschinell.
 */
`;

/**
 * Die Runs als Inhalt der Datei `workflow-retros.js` erzeugen.
 * Deterministisch: gleiche Runs ⇒ bytegleiche Ausgabe (feste Feld- und Satzreihenfolge).
 */
export function rendereDatei(runs) {
  const liste = ordneRuns(runs).map((r) => {
    const daten = {};
    for (const k of FELDER) if (r[k] !== undefined) daten[k] = r[k];
    return daten;
  });
  return DATEI_KOPF
    + `\n/** Formatname des Austauschformats (eigene Achse, getrennt von PLAN_/BLOG_/SCHEMA_). */\n`
    + `export const RETRO_FORMAT = ${JSON.stringify(ERWARTET_FORMAT)};\n`
    + `\n/** Formatversion der Workflow-Retros. */\n`
    + `export const RETRO_VERSION = ${JSON.stringify(ERWARTET_VERSION)};\n`
    + `\n/** @type {any[]} */\n`
    + `export const RUNS = ${JSON.stringify(liste, null, 2)};\n`;
}
