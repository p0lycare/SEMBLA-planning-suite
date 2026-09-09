// @ts-check
/**
 * SEMBLA Reparaturdialog — unaufloesbare Produktreferenzen einer Wand aufloesen.
 *
 * Die Wand haelt nur Produkt-Kennungen je Verwendungsrolle ([P-13]); der Katalog ist
 * eine eigene Ressource. Verschwindet ein Produkt daraus — korrigiertes Mass, geloescht,
 * andere Katalogfassung —, zeigt die Wand weiter auf eine Kennung, die es nicht mehr
 * gibt (#115, in Modul 4 sichtbar als #116). Bewusst wird dabei nichts geraten und
 * nichts still bereinigt; genannt werden musste die Luecke bisher aber, ohne sie
 * beheben zu koennen. Genau das macht dieser Dialog.
 *
 * ENTSCHEIDEND: hier entsteht KEIN zweiter Schreibweg. Geschrieben wird
 * ausschliesslich ueber `store.setzeProduktrolle(rolle, ids, elementId)` — derselbe
 * Weg, den Modul 1/2 beim Ankreuzen nehmen und den der Sammel-Editor des
 * Geschosseditors fuer mehrere Waende benutzt. Und es entsteht keine zweite
 * Auswahllogik: die Kandidaten kommen aus `KAT.rollenOptionen`, also aus derselben
 * Quelle wie das Dropdown der Rollenzeile.
 *
 * Gemeinsame Oberflaeche nach dem Muster von `navbar.js` (eigene Datei, mehrere
 * Nutzer). Die reine Ermittlung steht als `wandBefund()` daneben und ist ohne DOM
 * pruefbar.
 *
 * ZUSTAENDIGKEIT — eine Wand, nicht ein Projekt:
 * Der Dialog arbeitet auf GENAU EINER Wand und ueberlaesst die Neurechnung nach [Z-1]
 * der aufrufenden Seite (`aufFertig`). Das ist keine Bequemlichkeit, sondern die
 * Grenze des Sicheren: massgebende Standardlaengen (Stange, Blech, Latte, Steinbreite)
 * gehen in die Zerlegung des Wandelements ein, und den Auslegungspfad dafuer haben nur
 * Modul 1/2 fuer die AKTIVE Wand bzw. der Layout-Editor fuer fremde Waende
 * (`rechneWandelement`). Eine projektweite Reparatur ohne diesen Pfad wuerde die alte
 * Zerlegung im gespeicherten Wandelement stehen lassen — deshalb gibt es sie hier
 * nicht, sondern nur die Vorpruefung in Modul 0 (`store.referenzPruefung`).
 *
 * Verwendung je Seite:
 *   import { oeffneReparatur, wandBefund } from './shared/sembla-reparatur.js';
 *   oeffneReparatur({ modul: 1, elementId: id, aufFertig: () => run() });
 */

import * as store from "./storage.js";
import * as KAT from "./sembla-katalog.js";

/** Einmalig eingehaengte Formatvorlage (die Seiten bringen nur ihre eigene mit). */
let _stilDa = false;

const STIL = `
.sbr-ovl{position:fixed;inset:0;background:rgba(20,32,46,.45);display:flex;
  align-items:center;justify-content:center;z-index:60;padding:16px}
.sbr-box{background:var(--sb-panel,#fff);color:var(--sb-ink,#1c2430);
  border:1px solid var(--sb-line,#dfe3e8);border-radius:10px;padding:18px 20px;
  max-width:760px;width:100%;max-height:88vh;overflow:auto;font-size:13.5px;line-height:1.5}
.sbr-box h2{font-size:15px;margin:0 0 8px}
.sbr-lead{color:var(--sb-muted,#6b7682);margin:0 0 14px}
.sbr-pos{border:1px solid var(--sb-line,#dfe3e8);border-radius:8px;padding:10px 12px;margin:0 0 10px}
.sbr-pos b{font-size:13px}
.sbr-alt{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
  color:var(--sb-warn,#c9461c)}
.sbr-zeile{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.sbr-zeile select{width:auto;min-width:260px;max-width:100%}
.sbr-fuss{display:flex;gap:8px;align-items:center;margin-top:16px;flex-wrap:wrap}
.sbr-fuss .sbr-hin{color:var(--sb-muted,#6b7682);font-size:12px;flex:1 1 200px}
.sbr-box button{padding:6px 12px;border:1px solid var(--sb-line,#dfe3e8);border-radius:7px;
  background:#fff;font-size:13px;cursor:pointer}
.sbr-box button.sbr-prim{background:var(--sb-accent,#1f6feb);border-color:var(--sb-accent,#1f6feb);color:#fff}
.sbr-box button[disabled]{opacity:.5;cursor:not-allowed}
`;

function stilEinhaengen() {
  if (_stilDa) return;
  const s = document.createElement("style");
  s.textContent = STIL;
  document.head.appendChild(s);
  _stilDa = true;
}

function esc(x) {
  return String(x == null ? "" : x).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * Unaufloesbare Kennungen EINER Wand je Verwendungsrolle — rein lesend, DOM-frei.
 *
 * Aufgeloest wird ausschliesslich mit `KAT.produkt()`, der einen Stelle, an der eine
 * Kennung zu einem Produkt wird. Eine Rolle erscheint nur, wenn sie tatsaechlich eine
 * unaufloesbare Kennung fuehrt.
 *
 * @param {number} modul 1 oder 2 — der Eigentuemer der betrachteten Rollen ([P-13])
 * @param {string} elementId
 * @param {any} katalog der wirksame Katalog (null = keiner)
 * @returns {Array<{rolle:string,label:string,ids:string[],fehlendeIds:string[]}>}
 */
export function wandBefund(modul, elementId, katalog) {
  if (!katalog) return [];
  const block = store.holeProdukte(modul, elementId);
  const out = [];
  for (const r of KAT.rollenVonModul(modul)) {
    const ids = KAT.rollenIds(block, r.id);
    const fehlendeIds = ids.filter((pid) => !KAT.produkt(katalog, pid));
    if (fehlendeIds.length) out.push({ rolle: r.id, label: KAT.rollenLabel(r.id), ids, fehlendeIds });
  }
  return out;
}

/**
 * Den Reparaturdialog fuer eine Wand oeffnen.
 *
 * Ohne Befund wird KEIN Dialog gezeigt — die Rueckmeldung geht dann ueber `aufMeldung`.
 * Abbrechen aendert nichts; uebernommen wird erst, wenn JEDE Zeile entschieden ist
 * (Ersatzprodukt oder ausdruecklich „ersatzlos entfernen“).
 *
 * @param {{modul:number, elementId?:string, aufFertig?:()=>void,
 *          aufMeldung?:(text:string, ok:boolean)=>void}} opts
 */
export function oeffneReparatur(opts) {
  const modul = Number(opts && opts.modul);
  const elementId = (opts && opts.elementId) || store.aktivId();
  const melde = (opts && opts.aufMeldung) || (() => {});
  const fertig = (opts && opts.aufFertig) || (() => {});

  if (!elementId) { melde("Kein aktives Wandelement — es gibt nichts zu reparieren.", false); return; }

  const st = store.katalogStatus();
  const kat = st.katalog;
  if (!kat) {
    melde("Kein wirksamer Bauteilkatalog — ohne Katalog gibt es keine Ersatzprodukte "
      + "zur Auswahl. Zuordnung in Modul 0 ([L-12]).", false);
    return;
  }

  const befund = wandBefund(modul, elementId, kat);
  if (!befund.length) {
    melde("Alle gewählten Produkte dieser Wand sind im Katalog auffindbar — "
      + "es war nichts zu reparieren.", true);
    return;
  }

  stilEinhaengen();

  // Eine Zeile je (Rolle, fehlende Kennung): dieselbe Kennung kann an mehreren
  // Verwendungsstellen haengen, und dort gehoert sie zu unterschiedlichen Kandidaten.
  const zeilen = [];
  for (const b of befund) for (const alt of b.fehlendeIds) zeilen.push({ ...b, alt });

  const ovl = document.createElement("div");
  ovl.className = "sbr-ovl";
  ovl.setAttribute("role", "dialog");
  ovl.setAttribute("aria-modal", "true");
  ovl.setAttribute("aria-label", "Bauteile ohne Produkt im Katalog");

  const el = store.holeElement(elementId);
  const wandName = (el && el.name) || elementId;

  let h = '<div class="sbr-box">'
    + "<h2>Bauteile ohne Produkt im Katalog</h2>"
    + '<p class="sbr-lead">Die Wand <b>' + esc(wandName) + "</b> verwendet "
    + zeilen.length + " Produkt-Kennung(en), die „" + esc(kat.name)
    + "“ nicht enthält. Diese Positionen bleiben unbepreist, bis hier festgelegt ist, "
    + "was an ihre Stelle tritt.</p>";

  zeilen.forEach((z, i) => {
    // Angeboten wird genau die Kandidatenliste der Rollenzeile — ohne die bereits
    // gewaehlten und ohne die fehlende selbst.
    const schon = new Set(z.ids);
    const opts2 = KAT.rollenOptionen(kat, z.rolle)
      .filter((o) => !schon.has(o.id));
    h += '<div class="sbr-pos">'
      + "<b>" + esc(z.label) + "</b><br>"
      + 'nicht auffindbar: <span class="sbr-alt">' + esc(z.alt) + "</span>"
      + '<div class="sbr-zeile">'
      + '<label for="sbr-w-' + i + '">künftig:</label>'
      + '<select id="sbr-w-' + i + '" data-sbr="' + i + '">'
      + '<option value="">– bitte wählen –</option>'
      + '<option value="__weg__">ersatzlos entfernen</option>'
      + opts2.map((o) => '<option value="' + esc(o.id) + '">' + esc(o.name)
          + (o.merkmale ? " · " + esc(o.merkmale) : "") + "</option>").join("")
      + "</select></div>";
    if (!opts2.length) {
      h += '<div class="sbr-lead" style="margin:6px 0 0">Kein weiteres Produkt dieser '
        + "Kategorie im Katalog — hier bleibt nur „ersatzlos entfernen“ oder erst ein "
        + "passendes Produkt in Modul 10 anlegen.</div>";
    }
    h += "</div>";
  });

  h += '<div class="sbr-fuss">'
    + '<span class="sbr-hin">Abbrechen ändert nichts. Maßwirksame Verwendungsstellen '
    + "lassen die Wand danach neu rechnen ([Z-1]).</span>"
    + '<button type="button" id="sbr-ab">Abbrechen</button>'
    + '<button type="button" id="sbr-ok" class="sbr-prim" disabled>Übernehmen</button>'
    + "</div></div>";
  ovl.innerHTML = h;
  document.body.appendChild(ovl);

  const wahl = new Array(zeilen.length).fill("");
  const btnOk = /** @type {HTMLButtonElement} */ (ovl.querySelector("#sbr-ok"));
  const schliesse = () => { ovl.remove(); };

  ovl.addEventListener("change", (ev) => {
    const t = /** @type {any} */ (ev.target);
    if (!t || !t.dataset || t.dataset.sbr == null) return;
    wahl[Number(t.dataset.sbr)] = String(t.value || "");
    btnOk.disabled = wahl.some((w) => !w);
  });

  ovl.querySelector("#sbr-ab").addEventListener("click", () => {
    schliesse();
    melde("Reparatur abgebrochen — die Produktauswahl der Wand ist unverändert.", true);
  });

  ovl.addEventListener("keydown", (ev) => {
    if (ev && /** @type {any} */ (ev).key === "Escape") {
      schliesse();
      melde("Reparatur abgebrochen — die Produktauswahl der Wand ist unverändert.", true);
    }
  });

  ovl.querySelector("#sbr-ok").addEventListener("click", () => {
    if (wahl.some((w) => !w)) return;

    // Erst RECHNEN, dann schreiben: je Rolle die neue Kennungsmenge vollstaendig
    // bilden. Sonst schriebe eine Rolle mit zwei fehlenden Kennungen zweimal und die
    // zweite Runde saehe den bereits geaenderten Stand.
    /** @type {Map<string,{modul:number,ids:string[]}>} */
    const neu = new Map();
    zeilen.forEach((z, i) => {
      const stand = neu.get(z.rolle) || { modul, ids: [...z.ids] };
      const ohne = stand.ids.filter((x) => x !== z.alt);
      const ersatz = wahl[i];
      stand.ids = (ersatz === "__weg__" || ohne.includes(ersatz)) ? ohne : [...ohne, ersatz];
      neu.set(z.rolle, stand);
    });

    try {
      for (const [rolleId, stand] of neu) store.setzeProduktrolle(rolleId, stand.ids, elementId);
    } catch (e) {
      melde("Reparatur fehlgeschlagen: " + ((e && e.message) || String(e))
        + " Es wurde nichts geändert.", false);
      schliesse();
      return;
    }

    schliesse();
    const ersetzt = wahl.filter((w) => w !== "__weg__").length;
    const entfernt = wahl.length - ersetzt;
    melde("Reparatur übernommen: " + ersetzt + " Kennung(en) ersetzt"
      + (entfernt ? ", " + entfernt + " ersatzlos entfernt" : "") + ".", true);
    // Die Neurechnung nach [Z-1] gehoert der aufrufenden Seite — sie besitzt den
    // Auslegungspfad; hier wird sie nur ausgeloest.
    fertig();
  });

  const erstes = ovl.querySelector("select");
  if (erstes) /** @type {any} */ (erstes).focus();
}
