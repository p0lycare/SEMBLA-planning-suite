// @ts-check
/**
 * SEMBLA Navbar — gemeinsame Kopfleiste aller Module.
 *
 * Zeigt die Reiter der Module 0-9 (aktiver hervorgehoben) und das aktive
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

/**
 * Modul-Register: Nummer, Datei, Kurzname (Reiter), Titel.
 *
 * `versteckt: true` blendet das Modul nur aus der Navigation und der
 * Modulübersicht aus (Zyklus-Fokus, s. Issue #20) — die Seite bleibt per
 * direkter URL erreichbar, Code/Tests/Export bleiben unberührt.
 */
export const MODULE = [
  { nr: 0, datei: "index.html",       kurz: "Start",      titel: "Übersicht & Verwaltung" },
  { nr: 1, datei: "wandplanung.html", kurz: "Wand",       titel: "Wandplanung & Auslegung" },
  { nr: 2, datei: "wandaufbau.html",  kurz: "Aufbau",     titel: "Horizontaler Wandaufbau", versteckt: true },
  { nr: 3, datei: "statik.html",      kurz: "Statik",     titel: "Statischer Nachweis", versteckt: true },
  { nr: 4, datei: "stueckliste.html", kurz: "Stückliste", titel: "Baustellenstückliste (Einbauteile)" },
  { nr: 5, datei: "montage.html",     kurz: "Montage",    titel: "Montageanleitung", versteckt: true },
  { nr: 6, datei: "ifc-3d.html",      kurz: "3D / IFC",   titel: "3D-Vorschau & IFC (experimentell)" },
  { nr: 7, datei: "zeichnung.html",   kurz: "Zeichnung",  titel: "Technische Zeichnung (Wandabwicklung)" },
  { nr: 8, datei: "blog.html",        kurz: "Blog",       titel: "Umsetzungsplan & Änderungen" },
  { nr: 9, datei: "lageplan.html",    kurz: "Lageplan",   titel: "Lageplan des Geschosses (Draufsicht)" },
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
.sb-pfad{display:flex;align-items:center;gap:6px;font-size:12px;color:#9fb0c0;white-space:nowrap;
         padding:4px 8px;background:rgba(255,255,255,.05);border-radius:8px}
.sb-pfad b{color:#dbe6f2;font-weight:600}
.sb-pfad .k{color:#7fa9ef}
`;

let _unsub = null;

/**
 * Kopfleiste in die Seite einhaengen.
 * @param {number} activeIndex Modul-Nummer der aktuellen Seite (0-9)
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

  // Versteckte Module erscheinen nicht als Reiter — ausser man steht gerade darauf.
  const tabs = MODULE.filter((m) => !m.versteckt || m.nr === activeIndex).map((m) => {
    const active = m.nr === activeIndex ? " active" : "";
    return `<a class="sb-tab${active}" href="${m.datei}" title="${m.titel}">`
      + `<span class="n">${m.nr}</span> ${m.kurz}</a>`;
  }).join("");

  nav.innerHTML =
    `<a class="sb-brand" href="index.html">SEMBLA<span>Planungs-Suite</span></a>`
    + `<div class="sb-tabs">${tabs}</div>`
    + `<div class="sb-pfad" id="sb-pfad"></div>`
    + `<div class="sb-active" id="sb-active"></div>`;

  const abmelden = _renderAktiv();
  // Doppel-Mount vermeiden
  if (_unsub) _unsub();
  _unsub = store.abonniere(() => _renderAktiv());

  return abmelden;
}

/**
 * Bereich "aktives Element" neu zeichnen (Auswahl/Wechsel) plus den aktiven Pfad
 * Projekt · Geschoss · Wand ([L-10]).
 *
 * Die Auswahl bietet nur an, was sich nach [L-10] auch aktivieren LAESST: die Waende
 * des aktiven Geschosses und die (noch) keinem Geschoss zugeordneten. Waende fremder
 * Geschosse fehlen bewusst — sie werden in Modul 0 aktiviert, wo sich ihr Geschoss
 * ausdruecklich aktiv setzen laesst. Es wird nie ein Eltern-Zeiger still mitgesetzt.
 */
function _renderAktiv() {
  _renderPfad();
  const host = document.getElementById("sb-active");
  if (!host) return () => {};
  const aktiv = store.aktivId();
  const gs = store.aktivesGeschoss();
  const waehlbar = store.listeElemente().filter((e) => {
    const ort = store.wandVerortung(e.id);
    return !ort || (gs && ort.geschoss.id === gs.geschoss.id);
  });

  if (!waehlbar.length) {
    host.innerHTML = store.listeElemente().length
      ? `<span class="empty">keine Wand im aktiven Geschoss · in „Start" wählen</span>`
      : `<span class="empty">kein Wandelement · in „Start" anlegen</span>`;
    return () => {};
  }

  const opts = waehlbar.map((e) =>
    `<option value="${e.id}"${e.id === aktiv ? " selected" : ""}>${_esc(e.name)}</option>`
  ).join("");

  host.innerHTML = `<label for="sb-sel">Aktiv:</label>`
    + `<select id="sb-sel" title="Aktives Wandelement wählen">${opts}</select>`;

  const sel = /** @type {HTMLSelectElement} */ (document.getElementById("sb-sel"));
  sel.addEventListener("change", () => {
    try { store.setzeAktiv(sel.value); }
    catch (e) { sel.title = e && e.message ? e.message : String(e); _renderAktiv(); }
  });
  return () => {};
}

/** Aktiver Pfad Projekt · Geschoss · Wand — reine Anzeige der drei Zeiger ([L-10]). */
function _renderPfad() {
  const host = document.getElementById("sb-pfad");
  if (!host) return;
  const m = store.holeMappe();
  const gs = store.aktivesGeschoss();
  const w = store.aktivesElement();
  const teil = (label, wert) => `<span><span class="k">${label}</span> `
    + (wert ? `<b>${_esc(wert)}</b>` : "–") + "</span>";
  host.innerHTML = teil("Projekt", m ? m.projekt.name : null)
    + teil("Geschoss", gs ? gs.geschoss.name : null)
    + teil("Wand", w ? w.name : null);
}

function _esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
