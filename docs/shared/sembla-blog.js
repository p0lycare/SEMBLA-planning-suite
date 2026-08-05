// @ts-check
/**
 * SEMBLA Blog — Logik des Projektblogs (Modul 8, Issue #48).
 *
 * Rein/DOM-frei: alle Funktionen nehmen Daten und geben Daten oder HTML-Zeichenketten
 * zurueck. Eigene Datei nach der shared/-Regel a+b: genutzt von Modul 8 UND von den
 * eigenen Tests (`tests/module/test-blog.mjs`).
 *
 * Zwei Datenquellen, strikt getrennt:
 *   1. „Was ist neu?"  — statische, im Repo versionierte Liste (`blog-eintraege.js`).
 *      Funktioniert offline; `pruefeEintraege()` ist der Validator-Kern.
 *   2. „Projektstatus" — offene Issues der oeffentlichen GitHub-API. Gruppiert wird
 *      AUSSCHLIESSLICH nach expliziten `status:`-Labels — es gibt KEINE Heuristik aus
 *      Titeln oder Texten. Was kein Statuslabel traegt, landet sichtbar in „Ohne Status".
 *      Angezeigt werden nur Nummer, Titel, Labels und Meilenstein; Bodies und Kommentare
 *      werden nicht einmal uebernommen (`filterIssue`).
 *
 * Read-only: kein Login, kein Backend, kein Schreibpfad. Der Blog liest NICHTS aus dem
 * Wandelement und schreibt NICHTS in das Eingaben-Modell.
 */

import { EINTRAEGE, BLOG_FORMAT, BLOG_VERSION } from "./blog-eintraege.js";

export { EINTRAEGE, BLOG_FORMAT, BLOG_VERSION };

/** Repository, dessen Issues angezeigt werden. */
export const REPO = "p0lycare/SEMBLA-planning-suite";

/** Oeffentliche Issue-API (nur offene Issues, ohne Authentifizierung). */
export const ISSUES_URL =
  `https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`;

/** localStorage-Schluessel des Anzeigecaches (KEIN Projektdatum — nur Darstellung). */
export const CACHE_KEY = "sembla:blog:issues";

/** Erlaubte Eintragstypen mit Beschriftung des Chips. */
export const TYPEN = {
  feature: "Neu",
  fix: "Behoben",
  doku: "Doku",
  intern: "Intern",
};

/**
 * Statusgruppen in Anzeigereihenfolge — dringend zuerst.
 * `label` ist der EXAKTE GitHub-Labelname; `null` = Sammelgruppe ohne Statuslabel.
 */
export const STATUS_GRUPPEN = [
  { id: "blocked",  label: "status: blocked",        titel: "Blockiert",
    hinweis: "Wartet auf eine Klaerung oder eine fremde Zuarbeit." },
  { id: "decision", label: "status: decision needed", titel: "Entscheidung nötig",
    hinweis: "Hier wird eine Entscheidung von Tibor gebraucht." },
  { id: "progress", label: "status: in progress",     titel: "In Arbeit",
    hinweis: "Wird gerade umgesetzt." },
  { id: "ready",    label: "status: ready",           titel: "Bereit",
    hinweis: "Vorbereitet, kann begonnen werden." },
  { id: "ohne",     label: null,                      titel: "Ohne Status",
    hinweis: "Kein status:-Label gesetzt — Status daher unbekannt." },
];

/** Dringlichkeitsrang der `priority:`-Labels (kleiner = dringender). */
const PRIO_RANG = { critical: 0, hoch: 1, high: 1, mittel: 2, medium: 2, niedrig: 3, low: 3,
  1: 1, 2: 2, 3: 3, 4: 4 };
const PRIO_UNBEKANNT = 5;

/** Verstaendliche Fehlertexte des Statusabrufs (nie ein gerateter Status). */
export const FEHLER_TEXT = {
  netz: "Keine Verbindung zu GitHub — der Projektstatus konnte nicht abgerufen werden.",
  limit: "GitHubs Abruflimit ist erreicht (60 Abrufe je Stunde und Netzwerk). "
    + "Bitte später erneut versuchen.",
  http: "GitHub hat den Abruf abgelehnt — der Projektstatus konnte nicht geladen werden.",
  format: "Die Antwort von GitHub war unerwartet aufgebaut — kein Status anzeigbar.",
};

/** Link auf ein Issue im Browser. */
export const issueUrl = (nr) => `https://github.com/${REPO}/issues/${nr}`;

/** HTML-Escaping (alle Nutz- und Fremddaten laufen hierdurch). */
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --------------------------------------------------------------------------
// 1) Validator-Kern der Aenderungsliste
// --------------------------------------------------------------------------

const RE_ID = /^chg-(\d{4})(\d{2})(\d{2})-(\d{2})$/;
const RE_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const FELDER = ["id", "datum", "typ", "issue", "titel", "testbitte"];
const PFLICHT = ["id", "datum", "typ", "issue", "titel"];

/**
 * Verbotene Inhalte — dieses Repo ist oeffentlich und jeder Push ist sofort live.
 * Reihenfolge egal; getroffen wird auf allen Textfeldern eines Eintrags.
 */
const VERBOTEN = [
  { name: "E-Mail-Adresse", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "Token/Zugangsdaten",
    re: /\b(gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|[A-Za-z_]*(?:token|secret|passwor[dt])\s*[:=]\s*\S+)\b/i },
  { name: "absoluter lokaler Pfad",
    re: /(^|[\s("'])(?:\/(?:home|Users|root|var|etc|tmp|mnt|opt)\/|[A-Za-z]:[\\/])/ },
  { name: "mehrzeiliger Text (Issue-Body?)", re: /[\r\n]/ },
  { name: "Markdown-Zitat/Ueberschrift (Issue-Body?)", re: /(^|\s)(>\s|#{1,6}\s|```|- \[[ x]\])/ },
];

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
      if (typeof e[f] !== "string") { melde(i, id, `${f} muss Text sein`); continue; }
      if (e[f].trim() === "") { melde(i, id, `${f} ist leer`); continue; }
      if (e[f].length > LAENGE[f]) melde(i, id, `${f} ist laenger als ${LAENGE[f]} Zeichen`);
      for (const v of VERBOTEN) {
        if (v.re.test(e[f])) melde(i, id, `${f} enthaelt Verbotenes: ${v.name}`);
      }
    }

    if (i > 0 && _key(eintraege[i - 1]) <= _key(e)) {
      melde(i, id, "Reihenfolge verletzt (erwartet: neu -> alt, streng absteigend)");
    }
  });

  return { ok: fehler.length === 0, fehler };
}

// --------------------------------------------------------------------------
// 2) Ansicht „Was ist neu?"
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
// 3) Ansicht „Projektstatus"
// --------------------------------------------------------------------------

/**
 * Ein API-Issue auf die anzeigbaren Felder eindampfen.
 * Pull Requests werden verworfen (`pull_request`), Bodies/Kommentare/Autoren gar nicht
 * erst uebernommen — sie koennen damit auch nicht in den Cache geraten.
 * @returns {{number:number,title:string,labels:string[],milestone:string|null,url:string}|null}
 */
export function filterIssue(roh) {
  if (!roh || typeof roh !== "object") return null;
  if (roh.pull_request) return null;
  const nr = Number(roh.number);
  if (!Number.isInteger(nr) || nr <= 0) return null;
  const labels = Array.isArray(roh.labels)
    ? roh.labels.map((l) => String(l && typeof l === "object" ? l.name : l || "")).filter(Boolean)
    : [];
  const ms = roh.milestone && roh.milestone.title ? String(roh.milestone.title) : null;
  return {
    number: nr,
    title: String(roh.title == null ? "" : roh.title),
    labels,
    milestone: ms,
    url: issueUrl(nr),
  };
}

/** Ganze API-Antwort filtern. */
export function filterIssues(rohListe) {
  if (!Array.isArray(rohListe)) return [];
  return rohListe.map(filterIssue).filter(Boolean);
}

const normLabel = (l) => String(l || "").trim().toLowerCase().replace(/\s+/g, " ");

/** Gruppe eines Issues — ausschliesslich aus den Labels, nie aus dem Titel. */
export function gruppeVon(issue) {
  const labels = (issue && issue.labels || []).map(normLabel);
  for (const g of STATUS_GRUPPEN) {
    if (g.label && labels.includes(g.label)) return g.id;
  }
  return "ohne";
}

/** AWG-Meilenstein? (zaehlt als dringlichkeitssteigernd). */
export function istAwg(issue) {
  return /\bawg\b/i.test(String(issue && issue.milestone || ""));
}

/**
 * Dringlichkeit aus `priority:*`-Labels und AWG-Meilenstein — kleiner = dringender.
 * Ohne Angaben bleibt es beim neutralen Rang; es wird nichts aus Text geraten.
 */
export function dringlichkeit(issue) {
  let rang = PRIO_UNBEKANNT;
  for (const l of (issue && issue.labels || [])) {
    const m = /^priority:\s*(.+)$/.exec(normLabel(l));
    if (!m) continue;
    const r = PRIO_RANG[m[1]];
    if (r !== undefined && r < rang) rang = r;
  }
  return rang - (istAwg(issue) ? 0.5 : 0);
}

/**
 * Issues nach Statuslabel gruppieren; Gruppenreihenfolge = STATUS_GRUPPEN
 * (dringend zuerst), innerhalb einer Gruppe nach Dringlichkeit, dann Nummer.
 * Leere Gruppen entfallen — „Ohne Status" bleibt sichtbar, sobald sie belegt ist.
 */
export function gruppiereIssues(issues) {
  const liste = Array.isArray(issues) ? issues : [];
  return STATUS_GRUPPEN.map((g) => ({
    ...g,
    issues: liste
      .filter((i) => gruppeVon(i) === g.id)
      .sort((a, b) => dringlichkeit(a) - dringlichkeit(b) || a.number - b.number),
  })).filter((g) => g.issues.length);
}

/** Eine Issue-Karte. Anker `#issue-<nr>`. */
export function issueKarte(issue) {
  const chips = (issue.labels || [])
    .map((l) => `<span class="chip label">${esc(l)}</span>`).join("");
  return `<article class="karte" id="issue-${esc(issue.number)}">`
    + `<div class="kopf">`
    + `<span class="chip nr">#${esc(issue.number)}</span>`
    + (issue.milestone ? `<span class="chip ms${istAwg(issue) ? " awg" : ""}">${esc(issue.milestone)}</span>` : "")
    + `</div>`
    + `<h3 class="titel">${esc(issue.title)}</h3>`
    + (chips ? `<div class="labels">${chips}</div>` : "")
    + `<div class="fuss">`
    + `<a class="ref" href="${esc(issue.url || issueUrl(issue.number))}" target="_blank" rel="noopener">Auf GitHub öffnen</a>`
    + `<a class="anker" href="#issue-${esc(issue.number)}" title="Link zu diesem Issue">#issue-${esc(issue.number)}</a>`
    + `</div></article>`;
}

/** Ansicht „Projektstatus" als HTML (Gruppen dringend zuerst). */
export function issueKarten(gruppen) {
  const gs = Array.isArray(gruppen) ? gruppen : [];
  if (!gs.length) return `<p class="leer">Zurzeit sind keine offenen Issues gemeldet.</p>`;
  return gs.map((g) =>
    `<section class="gruppe gruppe-${esc(g.id)}">`
    + `<h2 class="gtitel">${esc(g.titel)} <span class="anzahl">${g.issues.length}</span></h2>`
    + `<p class="ghinweis">${esc(g.hinweis)}</p>`
    + g.issues.map(issueKarte).join("")
    + `</section>`
  ).join("");
}

/**
 * Verstaendlicher Fallback statt eines falschen Status.
 * @param {string} grund Schluessel aus FEHLER_TEXT
 * @param {string} [stand] ISO-Zeitpunkt des letzten erfolgreichen Abrufs (Cache)
 */
export function fehlerHinweis(grund, stand) {
  const text = FEHLER_TEXT[grund] || FEHLER_TEXT.netz;
  const zusatz = stand
    ? `Angezeigt wird der zuletzt erfolgreich abgerufene Stand von ${esc(standText(stand))}. `
      + `Er kann veraltet sein.`
    : `Es liegt kein früherer Stand vor, deshalb wird hier kein Status angezeigt.`;
  return `<div class="fehler" role="status">`
    + `<b>Status nicht abrufbar.</b> ${esc(text)} ${zusatz}`
    + `</div>`;
}

/** „Stand"-Angabe lesbar machen (ISO -> lokal, fehlertolerant). */
export function standText(iso) {
  const t = Date.parse(String(iso || ""));
  if (Number.isNaN(t)) return String(iso || "unbekannt");
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())} Uhr`;
}

// --------------------------------------------------------------------------
// 4) Deep-Links
// --------------------------------------------------------------------------

/**
 * Anker eines Deep-Links auswerten.
 * @param {string} hash z. B. "#chg-20260805-01" oder "#issue-31"
 * @returns {{ansicht:"neu"|"status", id:string}|null} null bei unbekanntem Anker
 */
export function ankerZiel(hash) {
  const h = String(hash || "").replace(/^#/, "").trim();
  if (RE_ID.test(h)) return { ansicht: "neu", id: h };
  if (/^issue-\d+$/.test(h)) return { ansicht: "status", id: h };
  return null;
}
