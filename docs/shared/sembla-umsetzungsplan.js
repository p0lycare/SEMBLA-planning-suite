// @ts-check
/**
 * SEMBLA Umsetzungsplan — Logik der Standardansicht von Modul 8 (Issue #55).
 *
 * Rein/DOM-frei. Eigene Datei nach der shared/-Regel a+b: genutzt von Modul 8
 * (`docs/blog.html`), vom Schreibschritt des Cron (`umsetzungsplan-schreiben.mjs`) UND
 * von den eigenen Tests (`tests/module/test-umsetzungsplan.mjs`).
 *
 * WAS DAS IST. Modul 8 ist die oeffentliche Arbeitsoberflaeche des autonomen
 * Entwicklungsworkflows. Der Backlog wird NICHT mehr im Browser ausgewertet, sondern
 * vom Cron: er liest global (Phase A), ordnet, formuliert und legt das Ergebnis als
 * versioniertes Artefakt `umsetzungsplan.js` ins Repo. Diese Datei enthaelt alles, was
 * daran maschinell entschieden wird — die Oberflaeche rendert nur.
 *
 * DREI INVARIANTEN, DIE DEN PLAN EHRLICH HALTEN:
 *
 *   1. ORDNUNG IST RECHNUNG, KEIN URTEIL. `ordne()` ist eine reine Funktion ueber
 *      DEKLARIERTE Felder (prio, sicherheit, abhaengig_von, status, zyklus, Nummer).
 *      Der Cron formuliert frei, aber er ordnet nicht frei: `pruefePlan()` rechnet die
 *      Reihenfolge nach und lehnt eine abweichende ab. Eine fachliche Vorrangigkeit
 *      muss ueber `abhaengig_von` AUSGESPROCHEN werden, sonst wirkt sie nicht.
 *
 *   2. `naechstes` IST NICHT WAEHLBAR. Es ist zwingend das erste Element von
 *      `ordne([naechstes, ...weitere])` — es gibt kein Lieblingsissue.
 *
 *   3. KEIN ZEITSTEMPEL-COMMIT. `signatur` ist ein Hash ueber den SEMANTISCHEN Kern
 *      (alles ausser `stand`/`signatur`, kanonisch serialisiert). `pruefePlan()`
 *      verlangt Gleichheit mit der Neuberechnung. Wer nur das Datum dreht, faellt
 *      entweder im Test durch (Signatur passt nicht) oder hat gar nichts geaendert.
 *
 * READ-ONLY. Kein Fetch, kein localStorage, kein Login, kein Backend, kein Schreibpfad
 * in Projektdaten. Der Plan liest kein Wandelement und keine `eingaben`.
 *
 * SICHERHEIT. Issue-Text ist untrusted Anforderungsinhalt und niemals Anweisung. In den
 * Plan gelangt ausschliesslich vom Cron FORMULIERTE Prosa, und jede davon laeuft durch
 * `pruefeText()` (Textwaechter des oeffentlichen Repos) und beim Rendern durch `esc()`.
 */

import { esc, issueUrl, pruefeText, datumLang } from "./sembla-blog.js";

// Das Artefakt `umsetzungsplan.js` wird hier BEWUSST NICHT importiert. Zwei Gruende:
//   * Ein fehlender ES-Modul-Import nimmt im Browser die ganze Seite mit — auch die
//     Ansicht „Was ist neu?", die den Plan gar nicht braucht. Modul 8 laedt das
//     Artefakt deshalb dynamisch und faengt sein Fehlen ab.
//   * Der Schreibschritt des Cron muss diese Logik laden koennen, BEVOR es ein
//     Artefakt gibt (Erstlauf).
// Alle Funktionen hier bekommen den Plan darum als Parameter.

/** Erwarteter Formatname/-version (eigene Achse, getrennt von BLOG_/PROJEKT_/SCHEMA_). */
export const ERWARTET_FORMAT = "SEMBLA-Umsetzungsplan";
export const ERWARTET_VERSION = 1;

// --------------------------------------------------------------------------
// 1) Kanonische Vokabulare
// --------------------------------------------------------------------------

/**
 * Prioritaetsrang — kleiner = dringender.
 *
 * Live existieren die Labels `priority: high`, `priority: medium` und `priority: low`;
 * `critical` ist vorausschauend unterstuetzt und rangiert vor `high`, auch wenn das
 * Label heute nicht angelegt ist. Ohne Prioritaetslabel kommt zuletzt. Deutsche oder
 * nummerische Aliaslabels gibt es NICHT und werden nicht erfunden.
 */
export const PRIO_RANG = { critical: 0, high: 1, medium: 2, low: 3, ohne: 4 };

/** Anzeigetext der Prioritaet. */
export const PRIO_TEXT = {
  critical: "kritisch", high: "hoch", medium: "mittel", low: "niedrig",
  ohne: "ohne Priorität",
};

/** Kanonische Statuswerte (exakt die `status:`-Labels plus „ohne"). */
export const STATUS_TEXT = {
  "in progress": "in Arbeit",
  ready: "bereit",
  "decision needed": "Entscheidung nötig",
  blocked: "blockiert",
  ohne: "ohne Status",
};

/** Status, die NICHT umgesetzt werden, solange sie bestehen. */
export const NICHT_UMSETZBAR = ["decision needed", "blocked"];

/** Hoechstlaengen der Freitexte (der Textwaechter kommt aus sembla-blog.js). */
export const LAENGE = {
  titel: 120, frage: 240, option: 120, wirkung: 240, empfehlung: 280,
  begruendung: 280, ursache: 240, naechster_schritt: 240,
};

const normLabel = (l) => String(l || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Prioritaet aus den Labels eines Issues ableiten.
 * Mehrere oder unbekannte `priority:`-Labels sind ein sichtbarer Fehler — nie eine
 * stille Einordnung als „ohne".
 * @returns {{prio:string,fehler:string|null}}
 */
export function prioAusLabels(labels) {
  const gefunden = [];
  for (const l of (Array.isArray(labels) ? labels : [])) {
    const m = /^priority:\s*(.+)$/.exec(normLabel(l));
    if (m) gefunden.push(m[1]);
  }
  if (!gefunden.length) return { prio: "ohne", fehler: null };
  if (gefunden.length > 1) {
    return { prio: "ohne", fehler: `mehrere priority:-Labels (${gefunden.join(", ")})` };
  }
  if (!Object.prototype.hasOwnProperty.call(PRIO_RANG, gefunden[0]) || gefunden[0] === "ohne") {
    return { prio: "ohne", fehler: `unbekanntes priority:-Label: ${gefunden[0]}` };
  }
  return { prio: gefunden[0], fehler: null };
}

/**
 * Status aus den Labels eines Issues ableiten (gleiche Strenge wie bei der Prioritaet).
 * @returns {{status:string,fehler:string|null}}
 */
export function statusAusLabels(labels) {
  const gefunden = [];
  for (const l of (Array.isArray(labels) ? labels : [])) {
    const m = /^status:\s*(.+)$/.exec(normLabel(l));
    if (m) gefunden.push(m[1]);
  }
  if (!gefunden.length) return { status: "ohne", fehler: null };
  if (gefunden.length > 1) {
    return { status: "ohne", fehler: `mehrere status:-Labels (${gefunden.join(", ")})` };
  }
  if (!Object.prototype.hasOwnProperty.call(STATUS_TEXT, gefunden[0]) || gefunden[0] === "ohne") {
    return { status: "ohne", fehler: `unbekanntes status:-Label: ${gefunden[0]}` };
  }
  return { status: gefunden[0], fehler: null };
}

// --------------------------------------------------------------------------
// 2) Abhaengigkeitstiefe und Ordnung
// --------------------------------------------------------------------------

/** Alle Eintraege eines Plans in einer Liste (Reihenfolge egal — nur zum Nachschlagen). */
export function alleEintraege(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const liste = [];
  for (const feld of ["entscheidungen", "weitere", "blockiert"]) {
    if (Array.isArray(p[feld])) liste.push(...p[feld].filter((e) => e && typeof e === "object"));
  }
  if (p.naechstes && typeof p.naechstes === "object") liste.push(p.naechstes);
  return liste;
}

/**
 * Abhaengigkeitstiefe je Issue-Nummer.
 *
 * Tiefe 0 = haengt an nichts, was der Plan kennt. Sonst 1 + groesste Tiefe der
 * referenzierten Issues. Ein Zyklus wird GEMELDET, nicht aufgeloest — betroffene
 * Nummern bekommen keine Tiefe (und `pruefePlan` lehnt den Plan ab).
 *
 * @param {any[]} eintraege alle Eintraege des Plans
 * @returns {{tiefe:Record<number,number>, zyklen:number[]}}
 */
export function tiefen(eintraege) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  const refs = new Map();
  for (const e of liste) {
    if (!e || typeof e !== "object" || !Number.isInteger(e.issue)) continue;
    refs.set(e.issue, (Array.isArray(e.abhaengig_von) ? e.abhaengig_von : [])
      .filter((n) => Number.isInteger(n)));
  }

  const tiefe = /** @type {Record<number,number>} */ ({});
  const zyklen = [];
  const zustand = new Map();          // 0 = laeuft, 1 = fertig

  const geh = (nr) => {
    if (zustand.get(nr) === 1) return tiefe[nr];
    if (zustand.get(nr) === 0) { if (!zyklen.includes(nr)) zyklen.push(nr); return 0; }
    zustand.set(nr, 0);
    let t = 0;
    for (const r of (refs.get(nr) || [])) {
      // Unbekannte Referenzen zaehlen als Tiefe 0; `pruefePlan` meldet sie eigens.
      if (!refs.has(r)) continue;
      t = Math.max(t, geh(r) + 1);
    }
    zustand.set(nr, 1);
    tiefe[nr] = t;
    return t;
  };

  for (const nr of refs.keys()) geh(nr);
  zyklen.sort((a, b) => a - b);
  return { tiefe, zyklen };
}

/**
 * Rangschluessel eines Eintrags — die vollstaendige, deklarierte Ordnung.
 *
 * Reihenfolge der Kriterien (jedes schlaegt alle folgenden):
 *   1. Prioritaet            critical > high > medium > low > ohne
 *   2. Sicherheit/Baubarkeit `sicherheit: true` zuerst
 *   3. Abhaengigkeiten       geringere Tiefe zuerst (Voraussetzung vor Folgearbeit)
 *   4. Fortschritt           `status: in progress` vor allem anderen — Angefangenes
 *                            wird fertiggestellt, ABER erst nachdem Abhaengigkeiten
 *                            und Entscheidungen respektiert sind (daher nach 3.)
 *   5. Zyklus/Meilenstein    `zyklus: true` (aktueller Produktzyklus) zuerst
 *   6. Fachliche Reihenfolge Issue-Nummer aufsteigend — der letzte, deterministische
 *                            Stich. Wer eine andere Reihenfolge braucht, sagt sie
 *                            ueber `abhaengig_von`; freies Umsortieren gibt es nicht.
 */
export function rangSchluessel(e, tiefe = {}) {
  const p = e && Object.prototype.hasOwnProperty.call(PRIO_RANG, e.prio)
    ? PRIO_RANG[e.prio] : PRIO_RANG.ohne;
  return [
    p,
    e && e.sicherheit === true ? 0 : 1,
    (e && Number.isInteger(e.issue) && tiefe[e.issue] !== undefined) ? tiefe[e.issue] : 0,
    e && e.status === "in progress" ? 0 : 1,
    e && e.zyklus === true ? 0 : 1,
    e && Number.isInteger(e.issue) ? e.issue : Number.MAX_SAFE_INTEGER,
  ];
}

/** Eintraege deterministisch ordnen (stabil, reine Funktion — kein Urteil). */
export function ordne(eintraege, tiefe = {}) {
  const liste = (Array.isArray(eintraege) ? eintraege : []).slice();
  return liste.sort((a, b) => {
    const ka = rangSchluessel(a, tiefe), kb = rangSchluessel(b, tiefe);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });
}

const nummern = (liste) => (Array.isArray(liste) ? liste : [])
  .map((e) => (e && Number.isInteger(e.issue) ? e.issue : -1)).join(",");

// --------------------------------------------------------------------------
// 3) Semantische Signatur
// --------------------------------------------------------------------------

/**
 * Feste Feldreihenfolge des Plans. Sie legt zugleich die Byte-Reihenfolge der
 * erzeugten Datei fest — ohne sie haenge die Ausgabe an der Schluesselreihenfolge
 * der Eingabe, und „gleicher Plan ⇒ gleiche Datei" gaelte nicht mehr.
 */
export const PLAN_FELDER = ["stand", "signatur", "entscheidungen", "naechstes", "weitere", "blockiert"];

/** Der semantische Kern: alles ausser `stand` und `signatur`. */
export function planKern(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const kern = {};
  for (const k of Object.keys(p)) {
    if (k === "stand" || k === "signatur") continue;
    kern[k] = p[k];
  }
  return kern;
}

/**
 * Format und Version des Artefakts pruefen — eine eigene Achse, getrennt von
 * BLOG_VERSION, PROJEKT_VERSION, KATALOG_VERSION und SCHEMA_VERSION.
 * @returns {{feld:string,meldung:string}[]} leer = ok
 */
export function pruefeFormat(format, version) {
  const fehler = [];
  if (format !== ERWARTET_FORMAT) {
    fehler.push({ feld: "PLAN_FORMAT", meldung: `erwartet „${ERWARTET_FORMAT}", gelesen „${format}"` });
  }
  if (version !== ERWARTET_VERSION) {
    fehler.push({ feld: "PLAN_VERSION", meldung: `erwartet ${ERWARTET_VERSION}, gelesen ${version}` });
  }
  return fehler;
}

/**
 * Kanonische Serialisierung: Schluessel sortiert, Whitespace in Texten normalisiert,
 * `undefined` wie `null`. Damit ist die Signatur unabhaengig von Schreibreihenfolge und
 * Formatierung — sie aendert sich genau dann, wenn sich der INHALT aendert.
 */
function kanon(w) {
  if (Array.isArray(w)) return "[" + w.map(kanon).join(",") + "]";
  if (w && typeof w === "object") {
    return "{" + Object.keys(w).sort()
      .map((k) => JSON.stringify(k) + ":" + kanon(w[k])).join(",") + "}";
  }
  if (typeof w === "string") return JSON.stringify(w.replace(/\s+/g, " ").trim());
  if (w === undefined) return "null";
  return JSON.stringify(w);
}

/** FNV-1a (32 Bit) als achtstellige Hexzahl — pur, ohne Fremdbibliothek. */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Signatur des semantischen Kerns. */
export function planSignatur(plan) {
  return fnv1a(kanon(planKern(plan)));
}

// --------------------------------------------------------------------------
// 4) Validator
// --------------------------------------------------------------------------

const RE_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const RE_SIG = /^[0-9a-f]{8}$/;

/**
 * Echtes Kalenderdatum? `Date.parse` genuegt hier NICHT: es rollt „2026-02-31" still
 * auf den 3. Maerz weiter und meldete damit ein erfundenes Datum als gueltig.
 */
function echtesDatum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

const BASIS_FELDER = ["issue", "titel", "prio", "status", "sicherheit", "abhaengig_von", "zyklus"];
const FELDER = {
  entscheidungen: BASIS_FELDER.concat(["frage", "optionen", "empfehlung"]),
  naechstes: BASIS_FELDER.concat(["begruendung"]),
  weitere: BASIS_FELDER.slice(),
  blockiert: BASIS_FELDER.concat(["ursache", "naechster_schritt", "blockiert_durch"]),
};

/**
 * Umsetzungsplan pruefen.
 *
 * @param {any} plan zu pruefender Plan
 * @param {{signatur?:boolean}} [opt] `signatur:false` prueft die Signatur NICHT
 *   (der Schreibschritt rechnet sie erst danach aus)
 * @returns {{ok:boolean, fehler:{feld:string,meldung:string}[]}}
 */
export function pruefePlan(plan, opt = {}) {
  const pruefeSignatur = opt.signatur !== false;
  const fehler = [];
  const melde = (feld, m) => fehler.push({ feld: String(feld), meldung: m });

  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    melde("plan", "es liegt kein Umsetzungsplan vor");
    return { ok: false, fehler };
  }

  for (const k of Object.keys(plan)) {
    if (!PLAN_FELDER.includes(k)) melde("plan", `unbekanntes Feld: ${k}`);
  }

  if (!RE_DATUM.test(String(plan.stand || ""))) melde("stand", "fehlt oder passt nicht zu YYYY-MM-DD");
  else if (!echtesDatum(plan.stand)) melde("stand", "ist kein gueltiges Datum");

  if (pruefeSignatur) {
    if (!RE_SIG.test(String(plan.signatur || ""))) melde("signatur", "fehlt oder ist keine achtstellige Hexzahl");
    else if (plan.signatur !== planSignatur(plan)) {
      melde("signatur", "passt nicht zum Inhalt — der Plan wurde von Hand veraendert "
        + "oder es wurde nur der Zeitstempel gedreht");
    }
  }

  for (const feld of ["entscheidungen", "weitere", "blockiert"]) {
    if (!Array.isArray(plan[feld])) melde(feld, "fehlt oder ist keine Liste");
  }
  if (plan.naechstes !== null && (!plan.naechstes || typeof plan.naechstes !== "object"
    || Array.isArray(plan.naechstes))) {
    melde("naechstes", "muss ein Eintrag oder null sein");
  }
  if (fehler.some((f) => ["entscheidungen", "weitere", "blockiert", "naechstes"].includes(f.feld))) {
    return { ok: false, fehler };
  }

  // --- Eintraege einzeln -------------------------------------------------
  const gesehen = new Set();
  const pruefeEintrag = (e, feld, abschnitt) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) { melde(feld, "kein Objekt"); return; }
    const erlaubt = FELDER[abschnitt];
    for (const k of Object.keys(e)) {
      if (!erlaubt.includes(k)) melde(feld, `unbekanntes Feld: ${k}`);
    }
    for (const k of erlaubt) {
      if (abschnitt === "blockiert" && k === "blockiert_durch") continue;   // optional
      if (e[k] === undefined) melde(feld, `Pflichtfeld fehlt: ${k}`);
    }

    if (!Number.isInteger(e.issue) || e.issue <= 0) melde(feld, "issue muss eine positive Ganzzahl sein");
    else if (gesehen.has(e.issue)) melde(feld, `Issue #${e.issue} steht mehrfach im Plan`);
    else gesehen.add(e.issue);

    for (const msg of pruefeText(e.titel, LAENGE.titel)) melde(feld, `titel ${msg}`);

    if (!Object.prototype.hasOwnProperty.call(PRIO_RANG, e.prio)) {
      melde(feld, `prio unbekannt: ${e.prio} (erlaubt: ${Object.keys(PRIO_RANG).join(", ")})`);
    }
    if (!Object.prototype.hasOwnProperty.call(STATUS_TEXT, e.status)) {
      melde(feld, `status unbekannt: ${e.status} (erlaubt: ${Object.keys(STATUS_TEXT).join(", ")})`);
    }
    if (typeof e.sicherheit !== "boolean") melde(feld, "sicherheit muss true/false sein");
    if (typeof e.zyklus !== "boolean") melde(feld, "zyklus muss true/false sein");
    for (const k of ["abhaengig_von", "blockiert_durch"]) {
      if (e[k] === undefined) continue;
      if (!Array.isArray(e[k]) || !e[k].every((n) => Number.isInteger(n) && n > 0)) {
        melde(feld, `${k} muss eine Liste positiver Ganzzahlen sein`);
      }
    }

    if (abschnitt === "entscheidungen") {
      for (const msg of pruefeText(e.frage, LAENGE.frage)) melde(feld, `frage ${msg}`);
      for (const msg of pruefeText(e.empfehlung, LAENGE.empfehlung)) melde(feld, `empfehlung ${msg}`);
      if (!Array.isArray(e.optionen) || e.optionen.length < 2) {
        melde(feld, "optionen muss mindestens zwei Moeglichkeiten nennen");
      } else {
        e.optionen.forEach((o, j) => {
          if (!o || typeof o !== "object") { melde(feld, `optionen[${j}] ist kein Objekt`); return; }
          for (const k of Object.keys(o)) {
            if (!["text", "wirkung"].includes(k)) melde(feld, `optionen[${j}] unbekanntes Feld: ${k}`);
          }
          for (const msg of pruefeText(o.text, LAENGE.option)) melde(feld, `optionen[${j}].text ${msg}`);
          for (const msg of pruefeText(o.wirkung, LAENGE.wirkung)) melde(feld, `optionen[${j}].wirkung ${msg}`);
        });
      }
    }
    if (abschnitt === "naechstes") {
      for (const msg of pruefeText(e.begruendung, LAENGE.begruendung)) melde(feld, `begruendung ${msg}`);
    }
    if (abschnitt === "blockiert") {
      for (const msg of pruefeText(e.ursache, LAENGE.ursache)) melde(feld, `ursache ${msg}`);
      for (const msg of pruefeText(e.naechster_schritt, LAENGE.naechster_schritt)) {
        melde(feld, `naechster_schritt ${msg}`);
      }
      if (e.status !== "blocked") melde(feld, `Issue #${e.issue} steht unter „blockiert", traegt aber status „${e.status}"`);
    }
    // Was eine Entscheidung oder eine Blockade hat, wird nicht umgesetzt.
    if ((abschnitt === "naechstes" || abschnitt === "weitere") && NICHT_UMSETZBAR.includes(e.status)) {
      melde(feld, `Issue #${e.issue} traegt status „${e.status}" und darf nicht als umsetzbar gefuehrt werden`);
    }
  };

  plan.entscheidungen.forEach((e, i) => pruefeEintrag(e, `entscheidungen[${i}]`, "entscheidungen"));
  if (plan.naechstes) pruefeEintrag(plan.naechstes, "naechstes", "naechstes");
  plan.weitere.forEach((e, i) => pruefeEintrag(e, `weitere[${i}]`, "weitere"));
  plan.blockiert.forEach((e, i) => pruefeEintrag(e, `blockiert[${i}]`, "blockiert"));

  // --- Referenzen und Zyklen --------------------------------------------
  const eintraege = alleEintraege(plan);
  for (const e of eintraege) {
    if (!e || !Number.isInteger(e.issue)) continue;
    for (const k of ["abhaengig_von", "blockiert_durch"]) {
      for (const r of (Array.isArray(e[k]) ? e[k] : [])) {
        if (r === e.issue) melde(`#${e.issue}`, `${k} verweist auf sich selbst`);
        else if (!gesehen.has(r)) melde(`#${e.issue}`, `${k} verweist auf #${r}, das im Plan nicht vorkommt`);
      }
    }
  }
  const { tiefe, zyklen } = tiefen(eintraege);
  if (zyklen.length) {
    melde("abhaengig_von", `Abhaengigkeitszyklus zwischen #${zyklen.join(", #")} — nicht aufloesbar`);
  }

  // --- Ordnung: nachgerechnet, nicht geglaubt ---------------------------
  if (nummern(plan.entscheidungen) !== nummern(ordne(plan.entscheidungen, tiefe))) {
    melde("entscheidungen", "Reihenfolge weicht von der berechneten Ordnung ab");
  }
  if (nummern(plan.blockiert) !== nummern(ordne(plan.blockiert, tiefe))) {
    melde("blockiert", "Reihenfolge weicht von der berechneten Ordnung ab");
  }
  if (nummern(plan.weitere) !== nummern(ordne(plan.weitere, tiefe))) {
    melde("weitere", "Reihenfolge weicht von der berechneten Ordnung ab");
  }
  if (plan.naechstes) {
    const erst = ordne([plan.naechstes].concat(plan.weitere), tiefe)[0];
    if (!erst || erst.issue !== plan.naechstes.issue) {
      melde("naechstes", `nach der Ordnung waere #${erst && erst.issue} als Naechstes umzusetzen, `
        + `im Plan steht #${plan.naechstes.issue}`);
    }
  } else if (plan.weitere.length) {
    melde("naechstes", "es gibt umsetzbare Issues, aber kein naechstes — das waere ein stiller Stillstand");
  }

  return { ok: fehler.length === 0, fehler };
}

// --------------------------------------------------------------------------
// 5) Ansicht
// --------------------------------------------------------------------------

const chipPrio = (e) => `<span class="chip prio prio-${esc(e.prio)}">${esc(PRIO_TEXT[e.prio] || e.prio)}</span>`;
const chipStatus = (e) => `<span class="chip stat stat-${esc(String(e.status).replace(/\s+/g, "-"))}">`
  + `${esc(STATUS_TEXT[e.status] || e.status)}</span>`;

const fuss = (e) => `<div class="fuss">`
  + `<a class="ref" href="${esc(issueUrl(e.issue))}" target="_blank" rel="noopener">Issue #${esc(e.issue)} öffnen</a>`
  + `<a class="anker" href="#issue-${esc(e.issue)}" title="Link zu diesem Issue">#issue-${esc(e.issue)}</a>`
  + `</div>`;

const kopf = (e) => `<div class="kopf">`
  + `<span class="chip nr">#${esc(e.issue)}</span>${chipPrio(e)}${chipStatus(e)}`
  + (e.sicherheit === true ? `<span class="chip sicherheit">Sicherheit/Baubarkeit</span>` : "")
  + `</div><h3 class="titel">${esc(e.titel)}</h3>`;

/** Karte „Entscheidung fuer Tibor": konkrete Frage, Optionen mit Wirkung, Empfehlung. */
export function entscheidungKarte(e) {
  const optionen = (Array.isArray(e.optionen) ? e.optionen : []).map((o) =>
    `<li><b>${esc(o.text)}</b> <span class="wirkung">${esc(o.wirkung)}</span></li>`).join("");
  return `<article class="karte entscheidung" id="issue-${esc(e.issue)}">`
    + kopf(e)
    + `<p class="frage"><b>Brauche Entscheidung:</b> ${esc(e.frage)}</p>`
    + (optionen ? `<ul class="optionen">${optionen}</ul>` : "")
    + `<p class="empfehlung"><b>Empfehlung:</b> ${esc(e.empfehlung)}</p>`
    + fuss(e);
}

/** Karte „Als Naechstes" — mit der Begruendung, warum genau dieses Issue. */
export function naechstesKarte(e) {
  return `<article class="karte naechstes" id="issue-${esc(e.issue)}">`
    + kopf(e)
    + `<p class="begruendung"><b>Warum jetzt:</b> ${esc(e.begruendung)}</p>`
    + fuss(e);
}

/** Karte der geordneten Warteschlange. */
export function weiteresKarte(e, platz) {
  const abh = (Array.isArray(e.abhaengig_von) ? e.abhaengig_von : []);
  return `<article class="karte weiteres" id="issue-${esc(e.issue)}">`
    + `<div class="kopf"><span class="chip platz">${esc(platz)}.</span>`
    + `<span class="chip nr">#${esc(e.issue)}</span>${chipPrio(e)}${chipStatus(e)}`
    + (e.sicherheit === true ? `<span class="chip sicherheit">Sicherheit/Baubarkeit</span>` : "")
    + `</div><h3 class="titel">${esc(e.titel)}</h3>`
    + (abh.length ? `<p class="abhaengig">Setzt voraus: ${abh.map((n) => "#" + esc(n)).join(", ")}</p>` : "")
    + fuss(e);
}

/** Karte „Blockiert": Ursache und nachvollziehbarer naechster Schritt. */
export function blockiertKarte(e) {
  const durch = (Array.isArray(e.blockiert_durch) ? e.blockiert_durch : []);
  return `<article class="karte blockiert" id="issue-${esc(e.issue)}">`
    + kopf(e)
    + `<p class="ursache"><b>Blockiert:</b> ${esc(e.ursache)}`
    + (durch.length ? ` <span class="durch">(durch ${durch.map((n) => "#" + esc(n)).join(", ")})</span>` : "")
    + `</p>`
    + `<p class="schritt"><b>Nächster Schritt:</b> ${esc(e.naechster_schritt)}</p>`
    + fuss(e);
}

const abschnitt = (id, titel, hinweis, inhalt) =>
  `<section class="gruppe gruppe-${esc(id)}">`
  + `<h2 class="gtitel">${esc(titel)}</h2>`
  + `<p class="ghinweis">${esc(hinweis)}</p>${inhalt}</section>`;

/**
 * Der vollstaendige Plan als HTML — vier Abschnitte in fester Reihenfolge.
 * Erwartet einen GEPRUEFTEN Plan; ein ungueltiger wird nie teilweise gerendert
 * (die Oberflaeche ruft dafuer `fehlerHinweis()`).
 */
export function planAnsicht(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const ent = Array.isArray(p.entscheidungen) ? p.entscheidungen : [];
  const weit = Array.isArray(p.weitere) ? p.weitere : [];
  const blo = Array.isArray(p.blockiert) ? p.blockiert : [];

  return abschnitt("entscheidungen", `Entscheidungen für dich (${ent.length})`,
    "Hier komme ich ohne dich nicht weiter. Entschieden wird im Issue auf GitHub.",
    ent.length ? ent.map(entscheidungKarte).join("")
      : `<p class="leer">Zurzeit ist keine Entscheidung offen.</p>`)
  + abschnitt("naechstes", "Als Nächstes",
    "Das Issue, das nach der Rangfolge als Nächstes umgesetzt wird.",
    p.naechstes ? naechstesKarte(p.naechstes)
      : `<p class="leer">Kein umsetzbares Issue — alles Offene wartet auf eine Entscheidung oder ist blockiert.</p>`)
  + abschnitt("weitere", `Danach (${weit.length})`,
    "Geordnet nach Priorität, Sicherheit, Abhängigkeiten, Fortschritt und Zyklus.",
    weit.length ? weit.map((e, i) => weiteresKarte(e, i + 2)).join("")
      : `<p class="leer">Nichts weiter in der Warteschlange.</p>`)
  + abschnitt("blockiert", `Blockiert (${blo.length})`,
    "Wird nicht umgesetzt, solange die genannte Abhängigkeit besteht.",
    blo.length ? blo.map(blockiertKarte).join("")
      : `<p class="leer">Nichts blockiert.</p>`);
}

/** „Stand"-Angabe des Plans (Datum in Langform). */
export function standText(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  return RE_DATUM.test(String(p.stand || ""))
    ? `Stand: ${datumLang(p.stand)}` : "Stand unbekannt";
}

/**
 * Sichtbare Meldung statt eines geratenen Plans.
 * Fehlt der Plan oder ist er ungueltig, wird NICHTS gerendert — nur benannt, was
 * nicht stimmt. Es gibt keinen Teilplan und keine Ersatzinhalte.
 */
export function fehlerHinweis(pruefung) {
  const f = (pruefung && Array.isArray(pruefung.fehler) ? pruefung.fehler : []);
  const erste = f.slice(0, 3).map((x) => `${x.feld}: ${x.meldung}`).join(" · ");
  return `<div class="fehler" role="status">`
    + `<b>Kein gültiger Umsetzungsplan.</b> `
    + `Der Plan fehlt oder ist fehlerhaft, deshalb wird hier nichts angezeigt — `
    + `ein geratener Plan wäre schlimmer als keiner. `
    + (erste ? `Gemeldet: ${esc(erste)}${f.length > 3 ? ` (und ${f.length - 3} weitere)` : ""}. ` : "")
    + `Bitte im Repo korrigieren.`
    + `</div>`;
}

// --------------------------------------------------------------------------
// 6) Das Artefakt schreiben (genutzt vom Cron-Schreibschritt)
// --------------------------------------------------------------------------

/** Fester Kopf der erzeugten Datei — konstant, damit die Ausgabe bytestabil bleibt. */
const DATEI_KOPF = `// @ts-check
/**
 * SEMBLA Umsetzungsplan — das Planartefakt (Modul 8, Issue #55).
 *
 * ERZEUGT — NICHT VON HAND BEARBEITEN. Geschrieben wird ausschliesslich ueber
 * \`umsetzungsplan-schreiben.mjs\` (npm run plan:schreiben). Reine Daten, keine Logik;
 * die Auswertung liegt in \`sembla-umsetzungsplan.js\`.
 *
 * \`signatur\` ist ein Hash ueber den semantischen Kern (alles ausser \`stand\` und
 * \`signatur\` selbst). Der Schreibschritt vergleicht sie und schreibt NUR bei
 * inhaltlicher Aenderung — reine Zeitstempel-Commits sind damit ausgeschlossen, und
 * \`pruefePlan()\` rechnet beides nach.
 *
 * ACHTUNG — dieses Repo ist oeffentlich: keine E-Mail-Adressen, keine Tokens, keine
 * absoluten lokalen Pfade, keine kopierten Issue-Bodies, keine personenbezogenen Daten.
 * \`tests/module/test-umsetzungsplan.mjs\` prueft das maschinell.
 */
`;

/**
 * Den Plan als Inhalt der Datei `umsetzungsplan.js` erzeugen.
 * Deterministisch: gleicher Plan ⇒ bytegleiche Ausgabe.
 */
export function rendereDatei(plan) {
  const p = plan && typeof plan === "object" ? plan : {};
  const daten = {};
  for (const k of PLAN_FELDER) if (p[k] !== undefined) daten[k] = p[k];
  return DATEI_KOPF
    + `\n/** Formatname des Austauschformats (eigene Achse, getrennt von BLOG_/PROJEKT_/SCHEMA_). */\n`
    + `export const PLAN_FORMAT = ${JSON.stringify(ERWARTET_FORMAT)};\n`
    + `\n/** Formatversion des Umsetzungsplans. */\n`
    + `export const PLAN_VERSION = ${JSON.stringify(ERWARTET_VERSION)};\n`
    + `\n/** @type {any} */\n`
    + `export const PLAN = ${JSON.stringify(daten, null, 2)};\n`;
}
