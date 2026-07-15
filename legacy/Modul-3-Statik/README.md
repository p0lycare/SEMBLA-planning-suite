# Modul 6 — Statik vorgespannter, nicht-tragender Wände

`SEMBLA_Statik.html` — eigenständige HTML-Datei, öffnet per Doppelklick. Führt den Nachweis vorgespannter, nicht-tragender SEMBLA-Trockenmauerwerkswände nach dem **Gutachten Prof. Schermer (Az. 2025_7001 Rev 01 vom 18.05.2026)**, Z-3.15-2157, DIN EN 1996-1-1, DIN 4103-1 und DIN EN 1991-1-4. Der Rechenkern ist 1:1 aus der geprüften Arbeitsmappe **`SEMBLA_Wand_Statik_v01.xlsx`** portiert.

## Nachweise

**A — Kompaktnachweis Wand**
1. **Biegung Wandmitte** — `m_Ed = MAX(Wind w·h²/8; DIN 4103-1 Kat. I; Kat. II)`; `m_Rk` linear interpoliert (Excel-FORECAST) aus den Prüfwerten §6.2 über die Wand-Vorspannkraft `N_v,fav`; `m_Rd = m_Rk / γ_M`.
2. **Schub (Platte)** — `v_Ed` gegen `v_Rd` (Gutachten §6.3).
3. **Druckrand-Spannung** — `σ_Ed = N_v,sup/(t·1000) + 6·m_Ed/(t²·1000)` gegen `f_k/γ_M`.
4. **Bodenanschluss (Reibung)** — `μ_d = μ_k/γ_M,μ`; `N_Ed = N_v,sup + γ_w·t·h`; `V_Rd = μ_d·N_Ed`.
5. **Deckenanschluss (Winkel)** — Anschlusskraft `V_Winkel = v_Ed·e_W` + Winkelanzahl (Nachweis Winkel/Verankerung separat, Übergabe Stahlbau).

**B — Kompaktnachweis Spannsystem**
Gewindestange (Zug), Spannschraube oben, Schraube unten (Sechskant vs. Senkschraube), Kopf-/Fußplatte (Biegung als Einfeldträger auf 2 Stegen, `L_span = t·1000 − 2·b_Steg`), Kopplungsmutter-Mindestlänge. `F_t,Ed = F_0·γ_P,sup`, `F_t,Rd = k₂·f_ub·A_s/γ_M2`.

**Vorspannung** — `F∞ = F_0·(1−ΔF)`, Prüfung `F∞ ≥ F,inf`; `N_v,fav = F∞·n/γ_P,fav`, `N_v,sup = F_0·n·γ_P,sup`. **γ_P,fav frei wählbar 1,0–2,0** (Lidl / EC-üblich / konservativ / worst case).

**Z — Transport / Hebezustand** (Zusatz, nicht Teil des Gutachtens): Last je Anschlagpunkt, Blech-Biegung.

Geometrie und Öffnungszahl können aus einem **Wandelement / Projekt-Bundle (JSON)** übernommen werden; alle Kennwerte (Material, Prüfwerte §6.2, Sicherheitsbeiwerte, Windzone, Gewindestange) sind editierbar wie im Bibliothek-Blatt der Excel. Jede Karte zeigt Werte, Auslastung η und Status; oben die Gesamtausnutzung `η_max_gesamt = MAX(Wand, Spannsystem)`.

## Verifikation
`test-statik.mjs` reproduziert die Zahlen der Arbeitsmappe (γ_P=1,1): η_Biegung 0,759 · η_Schub 0,379 · η_Druck 0,092 · η_Boden 0,057 · η_max Wand 0,759; Spannsystem η 0,724, Senkschraube 1,035 (NICHT OK), Kopfplatte 0,475. `smoke_statik.mjs` prüft die gebaute Oberfläche inkl. Interaktion (20 Checks).

> **Hinweis:** Rechtliche Grundlage ist das Gutachten Prof. Schermer (nicht öffentlich). Das Tool ersetzt keine geprüfte Einzelstatik; Verankerung, Deckenwinkel und Anschlagmittel sind gesondert nachzuweisen.

## Dateien
- `SEMBLA_Statik.html` — das Tool (per Doppelklick öffnen)
- `sembla-statik.mjs` — Rechen-Bibliothek · `test-statik.mjs` / `smoke_statik.mjs` — Tests
- `statik.template.html` + `build-statik.mjs` — Vorlage und Build
