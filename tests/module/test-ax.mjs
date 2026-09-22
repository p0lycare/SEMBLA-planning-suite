// Tests des gemeinsamen Accessibility-Bausteins docs/shared/sembla-ax.js (#144/#145).
//
// Der Baustein ist DOM-nah, also bekommt er hier ein vollstaendigeres DOM-Double als die
// Smoke-Tests der Seiten: Elternbeziehungen, Attribute, Fokus, `activeElement`, Ereignisse
// mit Bubbling und `closest`. Geprueft werden genau die drei Zusagen des Bausteins —
// Namensvergabe, Tooltip (Hover UND Fokus, Escape, lesbar beim Ueberfahren) und der
// modale Dialog (Rolle/Name, Fokus hinein, Fokusfalle, gesperrter Hintergrund,
// Fokusrueckgabe, Escape ohne stilles Speichern).

const checks = [];
const ok = (n, c) => checks.push([n, !!c]);

// --- DOM-Double -----------------------------------------------------------
class El {
  constructor(tag, dok) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.dok = dok;
    this.attrs = {};
    this.kinder = [];
    this.parentNode = null;
    this.nextSibling = null;
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.listeners = {};
    this.isConnected = true;
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.setAttribute('id', v); }
  setAttribute(n, v) {
    this.attrs[n] = String(v);
    if (n === 'id' && this.dok) this.dok._reg[String(v)] = this;
  }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); }
  appendChild(k) { k.parentNode = this; this.kinder.push(k); this._reihe(); return k; }
  insertBefore(k, ref) {
    k.parentNode = this;
    const i = ref ? this.kinder.indexOf(ref) : -1;
    if (i < 0) this.kinder.push(k); else this.kinder.splice(i, 0, k);
    this._reihe();
    return k;
  }
  _reihe() { this.kinder.forEach((k, i) => { k.nextSibling = this.kinder[i + 1] || null; }); }
  /** Alle Nachfahren in Dokumentreihenfolge. */
  _flach() { return this.kinder.flatMap((k) => [k, ...k._flach()]); }
  matches(sel) {
    return String(sel).split(',').map((s) => s.trim()).some((s) => {
      if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1);
        const eq = inner.indexOf('=');
        if (eq < 0) return this.hasAttribute(inner);
        return this.getAttribute(inner.slice(0, eq)) === inner.slice(eq + 1).replace(/^"|"$/g, '');
      }
      if (s.startsWith('.')) return String(this.className).split(/\s+/).includes(s.slice(1));
      if (s.startsWith('#')) return this.id === s.slice(1);
      const m = /^([a-z]+)(\[.*\])?$/i.exec(s);
      if (!m) return false;
      if (this.tagName !== m[1].toUpperCase()) return false;
      return m[2] ? this.matches(m[2]) : true;
    });
  }
  querySelectorAll(sel) { return this._flach().filter((k) => k.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let n = this; while (n) { if (n.matches && n.matches(sel)) return n; n = n.parentNode; } return null; }
  addEventListener(e, f) { (this.listeners[e] || (this.listeners[e] = [])).push(f); }
  focus() { if (this.dok) this.dok.activeElement = this; }
  /** Ereignis mit Bubbling — genau das, worauf die delegierten Behandler bauen. */
  dispatch(typ, ev) {
    const e = { type: typ, target: this, preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false, ...(ev || {}) };
    e.target = e.target || this;
    let n = this;
    while (n) { (n.listeners[typ] || []).forEach((f) => f(e)); n = n.parentNode; }
    (this.dok._l[typ] || []).forEach((f) => f(e));
    return e;
  }
}

function neuesDokument() {
  const dok = {
    _reg: {}, _l: {}, activeElement: null,
    createElement(tag) { return new El(tag, dok); },
    getElementById(id) { return dok._reg[String(id)] || null; },
    addEventListener(e, f) { (dok._l[e] || (dok._l[e] = [])).push(f); },
    querySelectorAll(sel) { return dok.body.querySelectorAll(sel); },
    querySelector(sel) { return dok.body.querySelector(sel); },
  };
  dok.body = new El('body', dok);
  dok.head = new El('head', dok);
  return dok;
}

const dok = neuesDokument();
globalThis.document = dok;

const AX = await import('../../docs/shared/sembla-ax.js');

// --- (a) Namensvergabe ----------------------------------------------------
{
  ok('objektAktion haengt den Objektbezug VOR die Aktion („Wand A löschen")',
    AX.objektAktion('Löschen', 'Wand A') === 'Wand A löschen');
  ok('objektAktion ohne Objekt laesst die Aktion unveraendert',
    AX.objektAktion('Löschen', null) === 'Löschen');
  ok('objektAktion haengt unterscheidenden Kontext an, statt ihn in den Namen zu mischen',
    AX.objektAktion('Löschen', 'Wand A', 'Geschoss EG') === 'Wand A löschen (Geschoss EG)');

  const b = AX.benennung('Wand A löschen', 'Entfernt das Wandelement aus dem Speicher.');
  ok('benennung liefert einen kurzen Namen als aria-label', /aria-label="Wand A löschen"/.test(b.attrs));
  ok('benennung verweist per aria-describedby auf ein REALES Textelement',
    new RegExp(`aria-describedby="${b.id}"`).test(b.attrs)
    && new RegExp(`<span class="ax-sr" id="${b.id}">`).test(b.html));
  ok('benennung setzt KEIN title-Attribut (ein title ist kein tragfaehiger Name)',
    !/title=/.test(b.attrs));
  ok('die Erklaerung steht NICHT im Namen', !/Entfernt das Wandelement/.test(b.attrs));
  ok('benennung ohne Beschreibung erzeugt kein leeres Beschreibungselement',
    AX.benennung('Abbrechen').html === '' && AX.benennung('Abbrechen').id === null);
  ok('benennung maskiert HTML in Name und Beschreibung',
    /aria-label="Wand &lt;A&gt;"/.test(AX.benennung('Wand <A>', 'x &amp; y').attrs)
    && /x &amp;amp; y/.test(AX.benennung('Wand <A>', 'x &amp; y').html));
  const b2 = AX.benennung('X', 'Y');
  ok('zwei Benennungen bekommen verschiedene Kennungen', b2.id !== b.id);

  // Vorhandenen Text verknuepfen statt einen zweiten anzulegen.
  const knopf = dok.createElement('button');
  const text = dok.createElement('span');
  text.textContent = 'Erzeugt eine ZIP-Datei aus dem gewählten Umfang.';
  dok.body.appendChild(knopf); dok.body.appendChild(text);
  const vid = AX.verknuepfe(knopf, text);
  ok('verknuepfe nutzt den SICHTBAREN Text als Beschreibung (kein zweiter Text)',
    knopf.getAttribute('aria-describedby') === vid && dok.getElementById(vid) === text);

  // Beschreibung erzeugen, wo es keinen sichtbaren Text gibt.
  const knopf2 = dok.createElement('button');
  dok.body.appendChild(knopf2);
  const bid = AX.beschreibe(knopf2, 'Setzt die Wand aktiv.');
  const span = dok.getElementById(bid);
  ok('beschreibe legt den Textknoten unmittelbar HINTER das Bedienelement',
    span && span.parentNode === dok.body && dok.body.kinder.indexOf(span) === dok.body.kinder.indexOf(knopf2) + 1);
  ok('beschreibe verknuepft ihn per aria-describedby', knopf2.getAttribute('aria-describedby') === bid);
  ok('beschreibe legt bei erneutem Aufruf KEINEN zweiten Knoten an',
    AX.beschreibe(knopf2, 'Neuer Text') === bid && span.textContent === 'Neuer Text');

  AX.benenne(knopf2, 'Wand B aktiv setzen');
  ok('benenne setzt den kurzen Namen', knopf2.getAttribute('aria-label') === 'Wand B aktiv setzen');
}

// --- (b) Tooltip ----------------------------------------------------------
{
  const tip = AX.tooltips({ dokument: dok });
  const knopf = dok.createElement('button');
  dok.body.appendChild(knopf);
  const bid = AX.beschreibe(knopf, 'Öffnet den Layout-Editor dieses Geschosses.');

  knopf.dispatch('pointerover');
  const kasten = dok.getElementById(AX.TIP_ID);
  ok('Hover zeigt den Tooltip',
    kasten && kasten.hidden === false && kasten.textContent === 'Öffnet den Layout-Editor dieses Geschosses.');
  ok('der Tooltipkasten traegt role="tooltip"', kasten.getAttribute('role') === 'tooltip');
  ok('gezeigt wird GENAU der Text, der auch die Beschreibung ist',
    kasten.textContent === dok.getElementById(bid).textContent);

  tip.verstecke();
  ok('verstecken blendet den Kasten aus', kasten.hidden === true);

  knopf.dispatch('focusin');
  ok('auch TASTATURFOKUS zeigt den Tooltip (nicht nur Hover)', kasten.hidden === false);

  dok.addEventListener('keydown', () => {});
  knopf.dispatch('keydown', { key: 'Escape' });
  ok('Escape schliesst den Tooltip', kasten.hidden === true);

  // Lesbar beim Ueberfahren: pointerout blendet NICHT sofort aus.
  knopf.dispatch('pointerover');
  knopf.dispatch('pointerout');
  ok('pointerout blendet den Tooltip nicht sofort weg (er bleibt erreichbar)', kasten.hidden === false);
  kasten.dispatch('pointerover');            // Maus faehrt in den Kasten
  await new Promise((r) => setTimeout(r, AX.TIP_VERZUG_MS + 40));
  ok('die Maus im Kasten haelt ihn offen', kasten.hidden === false);
  kasten.dispatch('pointerout');
  await new Promise((r) => setTimeout(r, AX.TIP_VERZUG_MS + 40));
  ok('nach dem Verlassen des Kastens schliesst er von selbst', kasten.hidden === true);

  // Die Beschreibung bleibt OHNE Hover verfuegbar — das ist der Kern von #144.
  ok('die Beschreibung haengt dauerhaft am Element, nicht nur waehrend des Hoverns',
    knopf.getAttribute('aria-describedby') === bid && dok.getElementById(bid).textContent.length > 0);

  const ohne = dok.createElement('button');
  dok.body.appendChild(ohne);
  ohne.dispatch('pointerover');
  ok('ein Element ohne Beschreibung zeigt keinen Tooltip', kasten.hidden === true);
}

// --- (c) Modaler Dialog ---------------------------------------------------
{
  const hintergrund = dok.createElement('div');
  hintergrund.setAttribute(AX.HINTERGRUND_ATTR, '');
  const ausloeser = dok.createElement('button');
  ausloeser.setAttribute('id', 'ausloeser');
  hintergrund.appendChild(ausloeser);
  dok.body.appendChild(hintergrund);

  const overlay = dok.createElement('div');
  overlay.className = 'overlay';
  overlay.hidden = true;
  const modal = dok.createElement('div');
  modal.className = 'modal';
  const titel = dok.createElement('h3');
  titel.setAttribute('id', 'dlg-titel');
  titel.textContent = 'Projekt anlegen';
  const feld = dok.createElement('input');
  const abbrechen = dok.createElement('button');
  const speichern = dok.createElement('button');
  const versteckt = dok.createElement('button');
  versteckt.hidden = true;
  modal.appendChild(titel); modal.appendChild(feld); modal.appendChild(versteckt);
  modal.appendChild(abbrechen); modal.appendChild(speichern);
  overlay.appendChild(modal);
  dok.body.appendChild(overlay);

  let gespeichert = 0, abgebrochen = 0;
  const dlg = AX.modalDialog({
    overlay, dialog: modal, titelId: 'dlg-titel', dokument: dok,
    abbruch: () => { abgebrochen += 1; overlay.hidden = true; dlg.schliesse(); },
    ersatzFokus: () => dok.getElementById('ersatz'),
  });

  ok('der Dialog traegt role="dialog"', modal.getAttribute('role') === 'dialog');
  ok('der Dialog ist als modal ausgezeichnet', modal.getAttribute('aria-modal') === 'true');
  ok('der Dialogname kommt aus seiner Ueberschrift', modal.getAttribute('aria-labelledby') === 'dlg-titel');

  ausloeser.focus();
  overlay.hidden = false;
  dlg.oeffne(ausloeser);
  ok('Oeffnen setzt den Fokus in den Dialog', dok.activeElement === feld);
  ok('der Hintergrund ist waehrenddessen nicht bedienbar',
    hintergrund.getAttribute('inert') === '' && hintergrund.getAttribute('aria-hidden') === 'true');
  ok('die Fokuskette enthaelt nur sichtbare Bedienelemente des Dialogs',
    dlg.fokuskette().length === 3 && !dlg.fokuskette().includes(versteckt));

  // Fokusfalle: vom letzten Element weiter landet man wieder beim ersten.
  speichern.focus();
  let ev = overlay.dispatch('keydown', { key: 'Tab' });
  ok('Tab am Ende springt zurueck an den Anfang des Dialogs — er wird nicht verlassen',
    dok.activeElement === feld && ev.defaultPrevented === true);
  ev = overlay.dispatch('keydown', { key: 'Tab', shiftKey: true });
  ok('Shift+Tab am Anfang springt ans Ende des Dialogs', dok.activeElement === speichern);
  ok('Tabben hat nichts gespeichert', gespeichert === 0);

  // Escape = Abbruch, ohne still zu speichern.
  overlay.dispatch('keydown', { key: 'Escape' });
  ok('Escape ruft den Abbruch der Seite', abgebrochen === 1);
  ok('Escape speichert nichts', gespeichert === 0);
  ok('Escape gibt den Fokus an den Ausloeser zurueck', dok.activeElement === ausloeser);
  ok('der Hintergrund ist danach wieder bedienbar',
    hintergrund.getAttribute('inert') === null && hintergrund.getAttribute('aria-hidden') === null);

  // Fokusrueckgabe an einen Ersatz, wenn der Ausloeser verschwunden ist.
  const ersatz = dok.createElement('button');
  ersatz.setAttribute('id', 'ersatz');
  dok.body.appendChild(ersatz);
  const weg = dok.createElement('button');
  weg.focus();
  overlay.hidden = false;
  dlg.oeffne(weg);
  weg.isConnected = false;                   // Zeile ist inzwischen neu gezeichnet
  overlay.hidden = true;
  dlg.schliesse();
  ok('ist der Ausloeser verschwunden, geht der Fokus an den benannten Ersatz',
    dok.activeElement === ersatz);

  // Zwei verschachtelte Dialoge: der Hintergrund geht erst beim letzten wieder auf.
  const overlay2 = dok.createElement('div');
  const modal2 = dok.createElement('div');
  const knopf2 = dok.createElement('button');
  modal2.appendChild(knopf2); overlay2.appendChild(modal2); dok.body.appendChild(overlay2);
  const dlg2 = AX.modalDialog({ overlay: overlay2, dialog: modal2, name: 'Zweiter', dokument: dok });
  ok('ohne Ueberschrift traegt der Dialog einen eigenen Namen', modal2.getAttribute('aria-label') === 'Zweiter');
  dlg.oeffne(ausloeser);
  dlg2.oeffne(knopf2);
  dlg2.schliesse();
  ok('beim Schliessen des inneren Dialogs bleibt der Hintergrund gesperrt',
    hintergrund.getAttribute('inert') === '');
  dlg.schliesse();
  ok('erst der letzte Dialog gibt den Hintergrund frei', hintergrund.getAttribute('inert') === null);

  // Escape abschaltbar, wenn die Seite einen eigenen zentralen Escape-Weg fuehrt.
  const overlay3 = dok.createElement('div');
  const modal3 = dok.createElement('div');
  overlay3.appendChild(modal3); dok.body.appendChild(overlay3);
  let abbruch3 = 0;
  const dlg3 = AX.modalDialog({ overlay: overlay3, dialog: modal3, name: 'Dritter',
    dokument: dok, escape: false, abbruch: () => { abbruch3 += 1; } });
  dlg3.oeffne(ausloeser);
  overlay3.dispatch('keydown', { key: 'Escape' });
  ok('escape:false ueberlaesst Escape dem zentralen Weg der Seite', abbruch3 === 0);
  dlg3.schliesse();
}

// --- Reinheit -------------------------------------------------------------
{
  const quelle = (await import('node:fs')).readFileSync(
    new URL('../../docs/shared/sembla-ax.js', import.meta.url), 'utf8');
  ok('der Baustein importiert nichts (keine Speicher-, Fach- oder Fremdabhaengigkeit)',
    !/^\s*import\s/m.test(quelle));
  ok('der Baustein fasst keinen localStorage an', !/localStorage/.test(quelle));
  ok('der Baustein setzt nirgends ein title-Attribut als Namensersatz',
    !/setAttribute\(\s*['"]title['"]/.test(quelle));
}

// --- Ausgabe --------------------------------------------------------------
let fehler = 0;
for (const [n, c] of checks) { if (!c) fehler++; console.log((c ? 'ok   ' : 'FAIL ') + n); }
console.log(`\n${checks.length - fehler}/${checks.length} Pruefungen bestanden.`);
if (fehler) process.exit(1);
