// @ts-check
/**
 * SEMBLA Blog — Logik der Ansicht „Was ist neu?" (Modul 8, Issues #48/#55).
 *
 * Rein/DOM-frei: alle Funktionen nehmen Daten und geben Daten oder HTML-Zeichenketten
 * zurueck. Eigene Datei nach der shared/-Regel a+b: genutzt von Modul 8, von
 * `sembla-umsetzungsplan.js` UND von den eigenen Tests (`tests/module/test-blog.mjs`).
 *
 * Quelle ist die statische, im Repo versionierte Aenderungsliste (`blog-eintraege.js`);
 * `pruefeEintraege()` ist der Validator-Kern. Sie funktioniert ohne Netz.
 *
 * SEIT #55 GIBT ES HIER KEINEN GITHUB-PFAD MEHR. Die frueheren Bausteine der Ansicht
 * „Projektstatus" (Issue-API, Statusgruppen, Anzeigecache, Entscheidungsabsatz aus dem
 * Issue-Body) sind ersatzlos entfallen: den Backlog wertet der Cron aus und legt das
 * Ergebnis als versioniertes Artefakt `umsetzungsplan.js` ab. Modul 8 ruft nichts mehr
 * ab und speichert nichts mehr — kein Fetch, kein localStorage, kein Ratelimit.
 *
 * Read-only: kein Login, kein Backend, kein Schreibpfad. Der Blog liest NICHTS aus dem
 * Wandelement und schreibt NICHTS in das Eingaben-Modell.
 */

import { EINTRAEGE, BLOG_FORMAT, BLOG_VERSION } from "./blog-eintraege.js";

export { EINTRAEGE, BLOG_FORMAT, BLOG_VERSION };

/** Repository, auf dessen Issues verwiesen wird. */
export const REPO = "p0lycare/SEMBLA-planning-suite";

/** Erlaubte Eintragstypen mit Beschriftung des Chips. */
export const TYPEN = {
  feature: "Neu",
  fix: "Behoben",
  doku: "Doku",
  intern: "Intern",
};

/** Link auf ein Issue im Browser. */
export const issueUrl = (nr) => `https://github.com/${REPO}/issues/${nr}`;

/** HTML-Escaping (alle Nutz- und Fremddaten laufen hierdurch). */
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --------------------------------------------------------------------------
// 1) Textwaechter — gilt fuer JEDEN oeffentlich ausgelieferten Freitext
// --------------------------------------------------------------------------

/**
 * Verbotene Inhalte — dieses Repo ist oeffentlich und jeder Push ist sofort live.
 * Reihenfolge egal; getroffen wird auf allen Textfeldern der Aenderungsliste UND auf
 * jeder Prosa des Umsetzungsplans (`sembla-umsetzungsplan.js` nutzt `pruefeText`).
 */
export const VERBOTEN = [
  { name: "E-Mail-Adresse", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "Token/Zugangsdaten",
    re: /\b(gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|[A-Za-z_]*(?:token|secret|passwor[dt])\s*[:=]\s*\S+)\b/i },
  { name: "absoluter lokaler Pfad",
    re: /(^|[\s("'])(?:\/(?:home|Users|root|var|etc|tmp|mnt|opt)\/|[A-Za-z]:[\\/])/ },
  { name: "mehrzeiliger Text (Issue-Body?)", re: /[\r\n]/ },
  { name: "Markdown-Zitat/Ueberschrift (Issue-Body?)", re: /(^|\s)(>\s|#{1,6}\s|```|- \[[ x]\])/ },
];

/**
 * Einen einzelnen Freitext pruefen.
 * @param {any} wert zu pruefender Text
 * @param {number} max Hoechstlaenge in Zeichen
 * @returns {string[]} Meldungen ohne Feldnamen (der Aufrufer stellt ihn voran); leer = ok
 */
export function pruefeText(wert, max) {
  const m = [];
  if (typeof wert !== "string") { m.push("muss Text sein"); return m; }
  if (wert.trim() === "") { m.push("ist leer"); return m; }
  if (wert.length > max) m.push(`ist laenger als ${max} Zeichen`);
  for (const v of VERBOTEN) {
    if (v.re.test(wert)) m.push(`enthaelt Verbotenes: ${v.name}`);
  }
  return m;
}

// --------------------------------------------------------------------------
// 2) Validator-Kern der Aenderungsliste
// --------------------------------------------------------------------------

const RE_ID = /^chg-(\d{4})(\d{2})(\d{2})-(\d{2})$/;
const RE_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const FELDER = ["id", "datum", "typ", "issue", "titel", "testbitte"];
const PFLICHT = ["id", "datum", "typ", "issue", "titel"];

const LAENGE = { titel: 120, testbitte: 240 };

/** Sortierschluessel „neu -> alt": Datum, dann laufende Nummer. */
function _key(e) {
  const m = RE_ID.exec(String(e && e.id || ""));
  return String(e && e.datum || "") + "#" + (m ? m[4] : "00");
}

/**
 * Aenderungsliste pruefen (Format, Eindeutigkeit, Sortierung, verbotene Inhalte).
 * @param {any[]} [eintraege] Liste; Standard ist die produktive `EINTRAEGE`.
 * @returns {{ok:boolean, fehler:{index:number,id:string,meldung:string}[]}}
 */
export function pruefeEintraege(eintraege = EINTRAEGE) {
  const fehler = [];
  const melde = (i, id, m) => fehler.push({ index: i, id: String(id || "?"), meldung: m });

  if (!Array.isArray(eintraege)) {
    melde(-1, "", "EINTRAEGE ist keine Liste");
    return { ok: false, fehler };
  }

  const gesehen = new Set();
  eintraege.forEach((e, i) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) { melde(i, "", "kein Objekt"); return; }
    const id = e.id;

    for (const f of PFLICHT) {
      if (e[f] === undefined || e[f] === null || e[f] === "") melde(i, id, `Pflichtfeld fehlt: ${f}`);
    }
    for (const f of Object.keys(e)) {
      if (!FELDER.includes(f)) melde(i, id, `unbekanntes Feld: ${f}`);
    }

    const m = RE_ID.exec(String(id || ""));
    if (!m) melde(i, id, "id passt nicht zu chg-YYYYMMDD-NN");
    if (gesehen.has(id)) melde(i, id, "id kommt mehrfach vor");
    gesehen.add(id);

    if (!RE_DATUM.test(String(e.datum || ""))) melde(i, id, "datum passt nicht zu YYYY-MM-DD");
    else if (m && `${m[1]}-${m[2]}-${m[3]}` !== e.datum) melde(i, id, "datum passt nicht zum Datumsteil der id");
    else if (Number.isNaN(Date.parse(e.datum + "T00:00:00Z"))) melde(i, id, "datum ist kein gueltiges Datum");

    if (!Object.prototype.hasOwnProperty.call(TYPEN, e.typ)) {
      melde(i, id, `typ unbekannt: ${e.typ} (erlaubt: ${Object.keys(TYPEN).join(", ")})`);
    }

    if (typeof e.issue !== "number" || !Number.isInteger(e.issue) || e.issue <= 0) {
      melde(i, id, "issue muss eine positive Ganzzahl sein");
    }

    for (const f of ["titel", "testbitte"]) {
      if (e[f] === undefined) continue;
      for (const msg of pruefeText(e[f], LAENGE[f])) melde(i, id, `${f} ${msg}`);
    }

    if (i > 0 && _key(eintraege[i - 1]) <= _key(e)) {
      melde(i, id, "Reihenfolge verletzt (erwartet: neu -> alt, streng absteigend)");
    }
  });

  return { ok: fehler.length === 0, fehler };
}

// --------------------------------------------------------------------------
// 3) Ansicht „Was ist neu?"
// --------------------------------------------------------------------------

/** Datum als „5. August 2026". */
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
  "September", "Oktober", "November", "Dezember"];

export function datumLang(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  return `${Number(m[3])}. ${MONATE[Number(m[2]) - 1]} ${m[1]}`;
}

/** Eine Eintragskarte. Die `id` ist zugleich der Deep-Link-Anker. */
export function blogKarte(e) {
  const typ = TYPEN[e.typ] || e.typ;
  return `<article class="karte" id="${esc(e.id)}">`
    + `<div class="kopf">`
    + `<span class="chip typ-${esc(e.typ)}">${esc(typ)}</span>`
    + `<span class="datum">${esc(datumLang(e.datum))}</span>`
    + `</div>`
    + `<h3 class="titel">${esc(e.titel)}</h3>`
    + (e.testbitte ? `<p class="testbitte"><b>Bitte testen:</b> ${esc(e.testbitte)}</p>` : "")
    + `<div class="fuss">`
    + `<a class="ref" href="${esc(issueUrl(e.issue))}" target="_blank" rel="noopener">Issue #${esc(e.issue)}</a>`
    + `<a class="anker" href="#${esc(e.id)}" title="Link zu dieser Änderung">#${esc(e.id)}</a>`
    + `</div></article>`;
}

/** Ansicht „Was ist neu?" als HTML (Karten, neu -> alt). */
export function blogKarten(eintraege = EINTRAEGE) {
  const liste = Array.isArray(eintraege) ? eintraege : [];
  if (!liste.length) {
    return `<p class="leer">Noch keine Einträge.</p>`;
  }
  return liste.map(blogKarte).join("");
}

// --------------------------------------------------------------------------
// 4) Deep-Links
// --------------------------------------------------------------------------

/**
 * Anker eines Deep-Links auswerten.
 *
 * `#issue-<nr>` fuehrt seit #55 in den Umsetzungsplan (frueher: „Projektstatus").
 * Der Anker selbst bleibt damit stabil — alte Links funktionieren weiter.
 *
 * @param {string} hash z. B. "#chg-20260805-01" oder "#issue-31"
 * @returns {{ansicht:"neu"|"plan", id:string}|null} null bei unbekanntem Anker
 */
export function ankerZiel(hash) {
  const h = String(hash || "").replace(/^#/, "").trim();
  if (RE_ID.test(h)) return { ansicht: "neu", id: h };
  if (/^issue-\d+$/.test(h)) return { ansicht: "plan", id: h };
  return null;
}
