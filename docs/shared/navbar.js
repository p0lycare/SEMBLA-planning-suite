// @ts-check
/**
 * SEMBLA Navbar — gemeinsame Kopfleiste aller Module.
 *
 * Zeigt die Reiter der Module 0-6 (aktiver hervorgehoben) und das aktive
 * Wandelement mit Wechsel-Moeglichkeit. Der Zustand lebt im localStorage
 * (storage.js) und ueberlebt Seitenwechsel — kein stehender Rahmen/iframe noetig.
 *
 * Verwendung je Seite:
 *   <script type="module">
 *     import { mountNavbar } from './shared/navbar.js';
 *     mountNavbar(0);   // Index des eigenen Moduls
 *   </script>
 */

import * as store from "./storage.js";

/** Modul-Register: Nummer, Datei, Kurzname (Reiter), Titel. */
export const MODULE = [
  { nr: 0, datei: "index.html",       kurz: "Start",      titel: "Übersicht & Verwaltung" },
  { nr: 1, datei: "wandplanung.html", kurz: "Wand",       titel: "Wandplanung & Auslegung" },
  { nr: 2, datei: "wandaufbau.html",  kurz: "Aufbau",     titel: "Horizontaler Wandaufbau" },
  { nr: 3, datei: "statik.html",      kurz: "Statik",     titel: "Statischer Nachweis" },
  { nr: 4, datei: "stueckliste.html", kurz: "Stückliste", titel: "Stückliste & Kosten" },
  { nr: 5, datei: "montage.html",     kurz: "Montage",    titel: "Montageanleitung" },
  { nr: 6, datei: "ifc-3d.html",      kurz: "3D / IFC",   titel: "3D-Vorschau & IFC (experimentell)" },
];

const CSS = `
:root{ --sb-bg:#f4f5f7; --sb-panel:#fff; --sb-ink:#1c2430; --sb-muted:#6b7682;
       --sb-line:#dfe3e8; --sb-accent:#1f6feb; --sb-ink2:#13202e; --sb-ok:#1f9d55; }
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
     background:var(--sb-bg);color:var(--sb-ink);font-size:15px;line-height:1.5}
.sb-nav{background:var(--sb-ink2);color:#fff;display:flex;align-items:center;gap:6px;
        flex-wrap:wrap;padding:8px 16px;position:sticky;top:0;z-index:50;
        box-shadow:0 1px 6px rgba(0,0,0,.15)}
.sb-brand{font-weight:800;font-size:16px;color:#fff;text-decoration:none;margin-right:10px;white-space:nowrap}
.sb-brand span{color:#7fa9ef;font-weight:600;font-size:12px;margin-left:6px}
.sb-tabs{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.sb-tab{display:inline-flex;align-items:center;gap:6px;color:#c5d2e0;text-decoration:none;
        padding:5px 10px;border-radius:7px;font-size:13px;white-space:nowrap}
.sb-tab:hover{background:rgba(255,255,255,.08);color:#fff}
.sb-tab.active{background:var(--sb-accent);color:#fff;font-weight:600}
.sb-tab .n{opacity:.7;font-variant-numeric:tabular-nums}
.sb-active{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.08);
           border-radius:8px;padding:4px 8px}
.sb-active label{font-size:11px;color:#9fb0c0;white-space:nowrap}
.sb-active select{background:#0e1a26;color:#fff;border:1px solid #2b3d50;border-radius:6px;
                  padding:4px 6px;font-size:13px;max-width:220px}
.sb-active .empty{font-size:12.5px;color:#e0a54c}
`;

let _unsub = null;

/**
 * Kopfleiste in die Seite einhaengen.
 * @param {number} activeIndex Modul-Nummer der aktuellen Seite (0-6)
 */
export function mountNavbar(activeIndex = 0) {
  store.migrieren();

  if (!document.getElementById("sb-nav-css")) {
    const st = document.createElement("style");
    st.id = "sb-nav-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  let nav = document.querySelector(".sb-nav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "sb-nav";
    document.body.insertBefore(nav, document.body.firstChild);
  }

  const tabs = MODULE.map((m) => {
    const active = m.nr === activeIndex ? " active" : "";
    return `<a class="sb-tab${active}" href="${m.datei}" title="${m.titel}">`
      + `<span class="n">${m.nr}</span> ${m.kurz}</a>`;
  }).join("");

  nav.innerHTML =
    `<a class="sb-brand" href="index.html">SEMBLA<span>Planungs-Suite</span></a>`
    + `<div class="sb-tabs">${tabs}</div>`
    + `<div class="sb-active" id="sb-active"></div>`;

  const abmelden = _renderAktiv();
  // Doppel-Mount vermeiden
  if (_unsub) _unsub();
  _unsub = store.abonniere(() => _renderAktiv());

  return abmelden;
}

/** Bereich "aktives Element" neu zeichnen (Auswahl/Wechsel). */
function _renderAktiv() {
  const host = document.getElementById("sb-active");
  if (!host) return () => {};
  const liste = store.listeElemente();
  const aktiv = store.aktivId();

  if (!liste.length) {
    host.innerHTML = `<span class="empty">kein Wandelement · in „Start" anlegen</span>`;
    return () => {};
  }

  const opts = liste.map((e) =>
    `<option value="${e.id}"${e.id === aktiv ? " selected" : ""}>${_esc(e.name)}</option>`
  ).join("");

  host.innerHTML = `<label for="sb-sel">Aktiv:</label>`
    + `<select id="sb-sel" title="Aktives Wandelement wählen">${opts}</select>`;

  const sel = /** @type {HTMLSelectElement} */ (document.getElementById("sb-sel"));
  sel.addEventListener("change", () => store.setzeAktiv(sel.value));
  return () => {};
}

function _esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
