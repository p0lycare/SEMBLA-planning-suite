// @ts-check
/**
 * SEMBLA AX — der EINE Baustein fuer zugaengliche Bedienelemente der Suite.
 *
 * Er beantwortet genau drei Fragen und sonst keine:
 *
 *  (a) **Wie heisst ein Bedienelement, und wie wird es erklaert?**
 *      Der NAME bleibt kurz („Loeschen", „Wand A loeschen"), die ERKLAERUNG wandert in
 *      eine eigene Beschreibung und landet ueber `aria-describedby` auf einem REALEN
 *      Textelement im Accessibility Tree. Ein blosses `title` ist ausdruecklich KEIN
 *      tragfaehiger Name: es erscheint je nach Browser/Hilfsmittel gar nicht, nie bei
 *      Tastaturfokus und nie als Beschreibung neben einem eigenen Namen.
 *
 *  (b) **Wie erscheint derselbe Text sichtbar?**
 *      Als Tooltip bei Maus-Hover UND bei Tastaturfokus, schliessbar mit Escape,
 *      lesbar auch beim Ueberfahren mit der Maus (er blendet nicht sofort weg).
 *      Der Tooltip ist reine SICHTBARMACHUNG derselben Beschreibung — er ist nie die
 *      einzige Quelle einer Pflichtinformation.
 *
 *  (c) **Wie verhaelt sich ein modaler Dialog?**
 *      Rolle und Name, Fokus beim Oeffnen hinein, Tab/Shift+Tab bleiben drin,
 *      Hintergrund waehrenddessen nicht bedienbar, beim Schliessen Fokus zurueck an
 *      den Ausloeser (oder einen benannten Ersatz). Escape ist ABBRUCH und speichert
 *      niemals still.
 *
 * ## Warum eigene Umsetzung und nicht das native `<dialog>`
 * Die Suite hat ihre Dialoge als `.overlay[hidden] > .modal` gebaut; ihr Oeffnen und
 * Schliessen laeuft ueber `hidden`, ihr Abbruch ueber benannte Funktionen, die bewusst
 * NICHTS speichern. Ein Umbau auf `<dialog>`/`showModal()` haette drei Preise, die das
 * Paket nicht zahlen will:
 *   1. `showModal()` gibt es nur im echten Browser — die Smoke-Tests fahren die ECHTE
 *      Seitenlogik unter einem minimalen DOM-Double; ein nicht nachbaubarer nativer
 *      Modalzustand waere genau die Pruefung, die dann fehlt.
 *   2. Das native Escape schliesst den Dialog SELBST, am Abbruchweg der Seite vorbei —
 *      die Meldung „es wurde nichts gespeichert" haenge dann an einem zweiten Pfad.
 *   3. `<dialog>` bringt eigene ::backdrop-Darstellung und eigenes Positionsverhalten
 *      mit; das waere ein optischer Umbau aller Dialoge in einem Paket, das keine
 *      Darstellung aendern soll.
 * Umgesetzt ist deshalb das, was das native Element zusagt — Rolle, Name, Fokusfalle,
 * gesperrter Hintergrund, Fokusrueckgabe — an der BESTEHENDEN Struktur.
 *
 * ## Grenzen (bewusst)
 * Rein und DOM-nah: kein Speicherzugriff, keine Fachlogik, keine Fremdbibliothek, kein
 * gespeichertes Feld. Der Baustein liest und setzt ausschliesslich Attribute, Fokus und
 * Sichtbarkeit; er entscheidet nie, WAS ein Bedienelement tut.
 *
 * Verwendung:
 *   import * as AX from './shared/sembla-ax.js';
 *   AX.stilEinhaengen();                      // einmal je Seite
 *   AX.tooltips();                            // einmal je Seite
 *   const b = AX.benennung('Wand A löschen', 'Entfernt das Wandelement …');
 *   html += `<button ${b.attrs}>Löschen</button>${b.html}`;
 *   const dlg = AX.modalDialog({ overlay: $('pp-overlay'), titelId: 'pp-titel',
 *                                abbruch: ppAbbruch });
 */

/** Selektor der von Haus aus fokussierbaren Bedienelemente (fuer die Fokusfalle). */
export const FOKUSSIERBAR = [
  'a[href]', 'button', 'input', 'select', 'textarea',
  '[tabindex]',
].join(',');

/** Verzoegerung, mit der ein Tooltip nach dem Verlassen ausblendet (ms). */
export const TIP_VERZUG_MS = 250;

/** Kennung des einen sichtbaren Tooltip-Kastens der Seite. */
export const TIP_ID = 'ax-tip';

/** Attribut, mit dem eine Seite ihre Hintergrundbereiche fuer Dialoge markiert. */
export const HINTERGRUND_ATTR = 'data-ax-hintergrund';

export const AX_CSS = `
/* Nur fuer Hilfsmittel: sichtbar im Accessibility Tree, unsichtbar auf dem Schirm.
   BEWUSST nicht display:none/visibility:hidden — beides nimmt den Text auch aus dem
   Accessibility Tree und damit aus jeder aria-describedby-Beziehung. */
.ax-sr{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;
       overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
/* Dateiauswahl: optisch unsichtbar, aber FOKUSSIERBAR. Ein hidden-Input laesst sich
   nur mit der Maus ueber sein label ausloesen — mit der Tastatur gar nicht. */
.ax-datei{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.ax-datei:focus-visible + label,.ax-datei:focus + label{outline:2px solid var(--sb-accent,#1f6feb);outline-offset:2px}
#${TIP_ID}{position:fixed;z-index:1000;max-width:320px;background:#13202e;color:#fff;
  border-radius:8px;padding:7px 10px;font-size:12.5px;line-height:1.45;
  box-shadow:0 6px 20px rgba(20,32,46,.28);pointer-events:auto}
#${TIP_ID}[hidden]{display:none}
`;

let _zaehler = 0;
/**
 * Eine in dieser Seite eindeutige Kennung erzeugen.
 * @param {string} [praefix]
 * @returns {string}
 */
export function neueId(praefix) {
  _zaehler += 1;
  return `${praefix || 'ax'}-${_zaehler}`;
}

/** HTML-Text maskieren (derselbe Satz Zeichen wie in den Modulen). */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Objektbezug einer wiederholten Aktion ([Namensvergabe]).
 *
 * Aus „Löschen" + „Wand A" wird „Wand A löschen" — der Name nennt also SELBST, worauf
 * er wirkt, statt die Zuordnung der Vorlesereihenfolge zu ueberlassen. Ohne Objekt
 * bleibt die Aktion unveraendert; eine technische Kennung wird NICHT als Erklaerung
 * eingesetzt (sie taugt als Unterscheidung, nicht als Bedeutung) — wer nur eine
 * Kennung hat, uebergibt sie ueber `zusatz` und bekommt sie in Klammern angehaengt.
 *
 * @param {string} aktion z. B. „Löschen"
 * @param {string|null|undefined} objekt z. B. „Wand A"
 * @param {string} [zusatz] unterscheidender Kontext bei gleichen Namen
 * @returns {string}
 */
export function objektAktion(aktion, objekt, zusatz) {
  const a = String(aktion == null ? '' : aktion).trim();
  const o = String(objekt == null ? '' : objekt).trim();
  const z = String(zusatz == null ? '' : zusatz).trim();
  const kern = o ? (a ? `${o} ${a.charAt(0).toLowerCase() + a.slice(1)}` : o) : a;
  return z ? `${kern} (${z})` : kern;
}

/**
 * Name und Beschreibung fuer ein per `innerHTML` erzeugtes Bedienelement.
 *
 * Liefert die ATTRIBUTE fuer das Bedienelement und das MARKUP der Beschreibung. Beide
 * gehoeren in dieselbe gerenderte Zeichenkette: dann leben und sterben sie gemeinsam,
 * und ein Neuzeichnen hinterlaesst keine verwaisten Beschreibungsknoten.
 *
 * @param {string} name kurzer Name (kein Erklaerabsatz)
 * @param {string} [beschreibung] die Erklaerung — sie landet NIE im Namen
 * @returns {{id:string|null, attrs:string, html:string}}
 */
export function benennung(name, beschreibung) {
  const n = String(name == null ? '' : name).trim();
  const b = String(beschreibung == null ? '' : beschreibung).trim();
  if (!b) return { id: null, attrs: n ? `aria-label="${esc(n)}"` : '', html: '' };
  const id = neueId('ax-b');
  const attrs = (n ? `aria-label="${esc(n)}" ` : '')
    + `aria-describedby="${id}" data-ax-tip="${id}"`;
  return { id, attrs, html: `<span class="ax-sr" id="${id}">${esc(b)}</span>` };
}

/**
 * Kurzen Namen an ein VORHANDENES Element haengen.
 * @param {any} el @param {string} name
 */
export function benenne(el, name) {
  if (!el || typeof el.setAttribute !== 'function') return;
  const n = String(name == null ? '' : name).trim();
  if (n) el.setAttribute('aria-label', n);
}

/**
 * Ein vorhandenes Textelement als Beschreibung verknuepfen — der Regelfall, wenn die
 * Erklaerung ohnehin sichtbar auf der Seite steht (Hinweiszeile, Optionstext). Es
 * entsteht KEIN zweiter Text; verknuepft wird der, den man sieht.
 * @param {any} el @param {any} textEl
 * @returns {string|null} Kennung des Textelements
 */
export function verknuepfe(el, textEl) {
  if (!el || !textEl || typeof el.setAttribute !== 'function') return null;
  let id = (typeof textEl.getAttribute === 'function' && textEl.getAttribute('id')) || textEl.id || '';
  if (!id) {
    id = neueId('ax-b');
    if (typeof textEl.setAttribute === 'function') textEl.setAttribute('id', id);
    else textEl.id = id;
  }
  el.setAttribute('aria-describedby', id);
  el.setAttribute('data-ax-tip', id);
  return id;
}

/**
 * Den sichtbaren Tooltip einer BESTEHENDEN Beschreibung an einem ZWEITEN Element
 * ausloesen — ohne eine zweite Beschreibung anzulegen.
 *
 * Gebraucht wird das, wo Bedienelement und Hoverflaeche auseinanderfallen: ein
 * Haekchen liegt in seinem `<label>`, die sichtbare Flaeche ist aber der Beschriftungs-
 * text daneben. `aria-describedby` gehoert dann an das EINGABEELEMENT (nur dort wird es
 * vorgelesen), der Tooltip-Ausloeser `data-ax-tip` an das umgebende Label — beide zeigen
 * auf DENSELBEN Textknoten, es entsteht also kein zweiter Text und keine zweite Aussage.
 * @param {any} el @param {string|null|undefined} id Kennung des Beschreibungstextes
 */
export function tippZiel(el, id) {
  if (!el || typeof el.setAttribute !== 'function') return;
  const i = String(id == null ? '' : id).trim();
  if (i) el.setAttribute('data-ax-tip', i);
}

/**
 * Beschreibung fuer ein vorhandenes Element ERZEUGEN (wenn es keinen sichtbaren Text
 * gibt, an den sich anknuepfen liesse). Der Knoten ist nur fuer Hilfsmittel sichtbar
 * und wird unmittelbar hinter dem Bedienelement eingehaengt.
 * @param {any} el @param {string} text @param {any} [dok]
 * @returns {string|null}
 */
export function beschreibe(el, text, dok) {
  const d = dok || (typeof document !== 'undefined' ? document : null);
  const t = String(text == null ? '' : text).trim();
  if (!el || !d || !t || typeof el.setAttribute !== 'function') return null;
  const vorhanden = typeof el.getAttribute === 'function' ? el.getAttribute('data-ax-tip') : null;
  const alt = vorhanden && typeof d.getElementById === 'function' ? d.getElementById(vorhanden) : null;
  if (alt) { alt.textContent = t; return vorhanden; }
  if (typeof d.createElement !== 'function') return null;
  const span = d.createElement('span');
  const id = neueId('ax-b');
  span.className = 'ax-sr';
  span.id = id;
  if (typeof span.setAttribute === 'function') span.setAttribute('id', id);
  span.textContent = t;
  const eltern = el.parentNode;
  if (eltern && typeof eltern.insertBefore === 'function') eltern.insertBefore(span, el.nextSibling || null);
  else if (d.body && typeof d.body.appendChild === 'function') d.body.appendChild(span);
  else return null;
  el.setAttribute('aria-describedby', id);
  el.setAttribute('data-ax-tip', id);
  return id;
}

/**
 * Das Stylesheet des Bausteins EINMAL je Dokument einhaengen.
 * @param {any} [dok]
 */
export function stilEinhaengen(dok) {
  const d = dok || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.createElement !== 'function' || !d.head) return;
  if (typeof d.getElementById === 'function' && d.getElementById('ax-css')) return;
  const st = d.createElement('style');
  st.id = 'ax-css';
  st.textContent = AX_CSS;
  if (typeof d.head.appendChild === 'function') d.head.appendChild(st);
}

// =====================================================================
//  (b) Tooltip
// =====================================================================

let _tipInstalliert = false;
let _tipZiel = null;
let _tipTimer = null;

/** Den Beschreibungstext eines Ausloesers holen — immer aus DEMSELBEN Textknoten. */
function _tipText(el, d) {
  if (!el || typeof el.getAttribute !== 'function') return '';
  const id = el.getAttribute('data-ax-tip');
  if (!id || typeof d.getElementById !== 'function') return '';
  const q = d.getElementById(id);
  return q ? String(q.textContent || '') : '';
}

/**
 * Die Tooltip-Schicht der Seite installieren — EINMAL je Seite.
 *
 * Gezeigt wird bei `pointerover` UND `focusin`, geschlossen bei `pointerout`/`focusout`
 * (mit kurzer Nachlaufzeit, damit der Kasten mit der Maus erreichbar bleibt) sowie bei
 * Escape. Der Kasten traegt `role="tooltip"`; die Beschreibung selbst haengt dauerhaft
 * ueber `aria-describedby` am Bedienelement und ist damit auch OHNE Hover verfuegbar.
 *
 * @param {object} [opts] @param {any} [opts.dokument]
 * @returns {{zeige(el):void, verstecke():void, ziel():any, kasten():any}}
 */
export function tooltips(opts) {
  const d = (opts && opts.dokument) || (typeof document !== 'undefined' ? document : null);
  const steuerung = {
    zeige: (el) => _tipZeige(el, d),
    verstecke: () => _tipVerstecke(d),
    ziel: () => _tipZiel,
    kasten: () => (d && typeof d.getElementById === 'function' ? d.getElementById(TIP_ID) : null),
  };
  if (!d || _tipInstalliert) return steuerung;
  _tipInstalliert = true;
  if (typeof d.addEventListener !== 'function') return steuerung;

  const ausloeser = (ev) => {
    const t = ev && ev.target;
    if (!t) return null;
    if (typeof t.closest === 'function') return t.closest('[data-ax-tip]');
    return (typeof t.getAttribute === 'function' && t.getAttribute('data-ax-tip')) ? t : null;
  };
  d.addEventListener('pointerover', (ev) => { const a = ausloeser(ev); if (a) _tipZeige(a, d); });
  d.addEventListener('focusin', (ev) => { const a = ausloeser(ev); if (a) _tipZeige(a, d); });
  // Nachlaufzeit: der Kasten bleibt lesbar, solange die Maus zu ihm unterwegs ist.
  d.addEventListener('pointerout', (ev) => { if (ausloeser(ev)) _tipSpaeterVerstecken(d); });
  d.addEventListener('focusout', (ev) => { if (ausloeser(ev)) _tipVerstecke(d); });
  d.addEventListener('keydown', (ev) => { if (ev && ev.key === 'Escape') _tipVerstecke(d); });
  return steuerung;
}

function _tipKasten(d) {
  if (!d || typeof d.getElementById !== 'function') return null;
  let k = d.getElementById(TIP_ID);
  if (k) return k;
  if (typeof d.createElement !== 'function') return null;
  k = d.createElement('div');
  k.id = TIP_ID;
  if (typeof k.setAttribute === 'function') { k.setAttribute('id', TIP_ID); k.setAttribute('role', 'tooltip'); }
  k.hidden = true;
  if (d.body && typeof d.body.appendChild === 'function') d.body.appendChild(k);
  // Maus ueber dem Kasten haelt ihn offen — sonst waere er beim Lesen nicht erreichbar.
  if (typeof k.addEventListener === 'function') {
    k.addEventListener('pointerover', () => { if (_tipTimer != null) { clearTimeout(_tipTimer); _tipTimer = null; } });
    k.addEventListener('pointerout', () => _tipSpaeterVerstecken(d));
  }
  return k;
}

function _tipZeige(el, d) {
  const text = _tipText(el, d);
  if (!text) return;
  const k = _tipKasten(d);
  if (!k) return;
  if (_tipTimer != null) { clearTimeout(_tipTimer); _tipTimer = null; }
  _tipZiel = el;
  k.textContent = text;
  k.hidden = false;
  if (typeof el.getBoundingClientRect === 'function' && k.style) {
    const r = el.getBoundingClientRect();
    k.style.left = Math.max(6, Math.round(r.left)) + 'px';
    k.style.top = Math.round(r.bottom + 6) + 'px';
  }
}

function _tipSpaeterVerstecken(d) {
  if (_tipTimer != null) clearTimeout(_tipTimer);
  _tipTimer = setTimeout(() => { _tipTimer = null; _tipVerstecke(d); }, TIP_VERZUG_MS);
}

function _tipVerstecke(d) {
  if (_tipTimer != null) { clearTimeout(_tipTimer); _tipTimer = null; }
  _tipZiel = null;
  const k = d && typeof d.getElementById === 'function' ? d.getElementById(TIP_ID) : null;
  if (k) k.hidden = true;
}

/** Nur fuer Tests: die installierte Tooltip-Schicht zuruecksetzen. */
export function _tooltipsZuruecksetzen() {
  if (_tipTimer != null) { clearTimeout(_tipTimer); _tipTimer = null; }
  _tipInstalliert = false;
  _tipZiel = null;
}

// =====================================================================
//  (c) Modaler Dialog
// =====================================================================

/** Wie viele modale Dialoge gerade offen sind (der Hintergrund geht erst beim letzten wieder auf). */
let _offen = 0;

function _alle(d, sel) {
  if (!d || typeof d.querySelectorAll !== 'function') return [];
  const t = d.querySelectorAll(sel);
  return t ? Array.from(t) : [];
}

function _sichtbar(el) {
  if (!el) return false;
  if (el.hidden === true) return false;
  if (el.disabled === true) return false;
  if (typeof el.getAttribute === 'function') {
    const ti = el.getAttribute('tabindex');
    if (ti != null && Number(ti) < 0) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
  }
  return true;
}

/**
 * Modalen Dialog verwalten. Die Seite behaelt ihre eigenen Oeffnen-/Schliessen- und
 * Abbruchfunktionen — dieser Baustein setzt NUR Semantik, Fokus und Hintergrundsperre.
 * Ein zweiter Schreibweg entsteht dadurch nicht: gespeichert wird weiterhin
 * ausschliesslich dort, wo es die Seite tut.
 *
 * @param {object} opts
 * @param {any} opts.overlay Hintergrundflaeche des Dialogs (`.overlay`)
 * @param {any} [opts.dialog] der Kasten selbst; ohne Angabe `overlay`
 * @param {string} [opts.titelId] Kennung der Ueberschrift (wird `aria-labelledby`)
 * @param {string} [opts.name] Name, wenn es keine Ueberschrift gibt
 * @param {() => void} [opts.abbruch] Abbruch (Escape/Hintergrundklick) — speichert NIE
 * @param {boolean} [opts.escape] eigenes Escape binden (Standard: ja)
 * @param {() => any} [opts.ersatzFokus] Fokusziel, wenn der Ausloeser verschwunden ist
 * @param {() => any} [opts.erstFokus] gewuenschtes Fokusziel beim Oeffnen
 * @param {boolean} [opts.modal] MODAL (Standard) oder nicht — s. u.
 * @param {any} [opts.dokument]
 */
export function modalDialog(opts) {
  const o = opts || {};
  // NICHT jeder Dialog ist modal, und ein nicht modaler darf nicht so tun.
  // `modal: false` ist fuer Bedienblaetter gedacht, deren Zweck GERADE die Arbeit am
  // Hintergrund ist (im Editor etwa die Planverwaltung: kalibriert und verschoben wird
  // auf der Zeichenflaeche, waehrend das Blatt offenbleibt). Ein solcher Dialog bekommt
  // Rolle, Namen, Fokus beim Oeffnen und Fokusrueckgabe beim Schliessen — aber KEIN
  // `aria-modal`, KEINE Fokusfalle und KEINE Hintergrundsperre. Beides zu behaupten
  // waere eine falsche Zusage an die Hilfsmittel.
  const modal = o.modal !== false;
  const d = o.dokument || (typeof document !== 'undefined' ? document : null);
  const overlay = o.overlay;
  const kasten = o.dialog || overlay;
  let ausloeser = null;
  let istOffen = false;

  if (kasten && typeof kasten.setAttribute === 'function') {
    kasten.setAttribute('role', 'dialog');
    if (modal) kasten.setAttribute('aria-modal', 'true');
    else if (typeof kasten.removeAttribute === 'function') kasten.removeAttribute('aria-modal');
    if (o.titelId) kasten.setAttribute('aria-labelledby', String(o.titelId));
    else if (o.name) kasten.setAttribute('aria-label', String(o.name));
    kasten.setAttribute('tabindex', '-1');
  }

  /** Alle fokussierbaren Elemente des Dialogs, in Dokumentreihenfolge. */
  function kette() {
    const wurzel = kasten && typeof kasten.querySelectorAll === 'function' ? kasten : null;
    if (!wurzel) return [];
    const t = wurzel.querySelectorAll(FOKUSSIERBAR);
    return (t ? Array.from(t) : []).filter(_sichtbar);
  }

  function fokussiere(el) {
    if (el && typeof el.focus === 'function') { el.focus(); return true; }
    return false;
  }

  function hintergrundSperren(an) {
    if (!modal) return;
    for (const el of _alle(d, `[${HINTERGRUND_ATTR}]`)) {
      if (typeof el.setAttribute !== 'function') continue;
      if (an) { el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); }
      else if (typeof el.removeAttribute === 'function') { el.removeAttribute('aria-hidden'); el.removeAttribute('inert'); }
    }
  }

  /** Tab/Shift+Tab bleiben im Dialog; Escape bricht ab und speichert nie. */
  function beiTaste(ev) {
    if (!istOffen || !ev) return;
    if (ev.key === 'Escape') {
      if (o.escape === false) return;
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof o.abbruch === 'function') o.abbruch();
      return;
    }
    if (ev.key !== 'Tab') return;
    if (!modal) return;                     // nicht modal: der Fokus darf hinaus
    const k = kette();
    if (!k.length) return;
    const aktuell = d && d.activeElement ? d.activeElement : null;
    let i = k.indexOf(aktuell);
    if (i < 0) i = ev.shiftKey ? 0 : k.length - 1;
    const ziel = ev.shiftKey ? k[(i - 1 + k.length) % k.length] : k[(i + 1) % k.length];
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    fokussiere(ziel);
  }

  if (overlay && typeof overlay.addEventListener === 'function') overlay.addEventListener('keydown', beiTaste);

  return {
    /**
     * Anmelden, dass der Dialog jetzt offen ist: Hintergrund sperren, Fokus hinein.
     * Die Sichtbarkeit selbst (`overlay.hidden`) bleibt Sache der Seite.
     * @param {any} [vonEl] ausloesendes Element; ohne Angabe das gerade fokussierte
     */
    oeffne(vonEl) {
      ausloeser = vonEl || (d && d.activeElement) || null;
      if (!istOffen) { istOffen = true; if (modal) _offen += 1; }
      hintergrundSperren(true);
      const wunsch = typeof o.erstFokus === 'function' ? o.erstFokus() : null;
      if (!fokussiere(wunsch)) { const k = kette(); if (!fokussiere(k[0])) fokussiere(kasten); }
    },
    /** Anmelden, dass der Dialog zu ist: Hintergrund frei, Fokus zurueck. */
    schliesse() {
      if (istOffen) { istOffen = false; if (modal) _offen = Math.max(0, _offen - 1); }
      if (_offen === 0) hintergrundSperren(false);
      const zurueck = (ausloeser && ausloeser.isConnected !== false) ? ausloeser : null;
      ausloeser = null;
      if (fokussiere(zurueck)) return;
      fokussiere(typeof o.ersatzFokus === 'function' ? o.ersatzFokus() : null);
    },
    /** @returns {boolean} */
    offen() { return istOffen; },
    /** Nur fuer Tests/Weiterverwendung: die aktuelle Fokuskette. */
    fokuskette: kette,
    /** Der Tastenbehandler — fuer Seiten, die ihn an einer anderen Stelle binden. */
    beiTaste,
  };
}

/** Nur fuer Tests: den Zaehler offener Dialoge zuruecksetzen. */
export function _dialogeZuruecksetzen() { _offen = 0; }
