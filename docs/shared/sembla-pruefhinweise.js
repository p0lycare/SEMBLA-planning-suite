// SEMBLA — Prüfhinweise einer Wand und ihre Prüfvermerke ([P-25], Felix Bauroth 06./10.11.2026).
//
// Ein PRÜFHINWEIS ist ein Befund des Rechenkerns, der KEIN Baubarkeitsausschluss ist, aber von
// Hand geprüft werden soll (z. B. Rückfall der festen Stangenfolge [Z-9], Randfeld des
// Deckenanschlusses [A-26]/[A-27], ungehaltene Steine bei manuellen Spannachsen [V-9]). Er
// bleibt stehen, solange die Ursache besteht — daran ändert dieser Baustein nichts. Neu ist der
// PRÜFVERMERK: wer den Hinweis geprüft hat, markiert ihn mit Kürzel und Datum als „geprüft".
//
// Gespeichert wird der Vermerk am Wandelement im OPTIONALEN Feld `pruefvermerke` — einem Array
// aus `{ art, fingerabdruck, kuerzel, datum }`, höchstens ein Eintrag je Hinweisart. Ein
// Altbestand ohne das Feld hat nichts geprüft; es wird nichts migriert und nichts erfunden
// (kein Schema- und kein Formatsprung, `PROJEKT_VERSION` bleibt 2).
//
// Der FINGERABDRUCK bindet den Vermerk an genau den geprüften Stand: Hinweisart, die
// vollständigen Befunddaten des Rechenkerns und die Wandgeometrie (Länge, Höhe, Öffnungen,
// Staffelungen, Verzahnungen, Ausgleichslage). Ändert sich eines davon, passt der Vermerk nicht
// mehr und der Hinweis ist wieder AKTIV. Geraten oder „ungefähr gleich" gibt es nicht ([P-9]).
//
// Rein und DOM-/speicherfrei. Benutzt von Modul 1 (Anzeige und Markieren) und lesbar für jeden
// anderen Leser eines Wandelements (Anzeige im Geschossplan folgt separat): `pruefhinweise(w)`
// liefert die Hinweise samt Status allein aus dem gespeicherten Wandelement. Die Zeichnung
// (Modul 7) und ihr PDF lesen das Feld NICHT — der Vermerk steht auf keinem Blatt.

/** Höchstlänge des Prüferkürzels. */
export const KUERZEL_MAX = 6;
const KUERZEL_RE = /^[A-Za-zÄÖÜäöüß0-9][A-Za-zÄÖÜäöüß0-9.\-]*$/;
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Die Hinweisarten, deren Daten im Wandelement stehen — Kennung, Regel und Datenquelle.
 * Reihenfolge = Anzeigereihenfolge in Modul 1. Nicht enthalten sind Befunde, die eine Wand
 * NICHT baubar machen (ungültige Abschnitte, Versatzverletzung, ungültige Segmente,
 * nicht baubare Restbreiten, unbaubarer Bodenblechbereich [A-29]): dort gibt es nichts zu
 * quittieren, nur zu beheben.
 */
export const HINWEIS_ARTEN = Object.freeze([
  { art: "z5_zuschnitt", regel: "Z-5",
    daten: v => (v.zuschnitt_konflikte || []).filter(k => k.grund !== "stoss_auf_zwischenpunkt") },
  { art: "z7_stoss_zwischenpunkt", regel: "Z-7",
    daten: v => (v.zuschnitt_konflikte || []).filter(k => k.grund === "stoss_auf_zwischenpunkt") },
  { art: "z9_stangenfolge", regel: "Z-9", daten: v => v.stangenschema_rueckfall || [] },
  { art: "a17_zwischenpunkt", regel: "A-17", daten: v => v.zwischenpunkt_fehler || [] },
  { art: "a24_ausgleichspunkt", regel: "A-24", daten: v => v.ausgleich_fehler || [] },
  { art: "a27_deckenanschluss_fehler", regel: "A-27", daten: v => v.deckenanschluss_fehler || [] },
  { art: "a26_deckenanschluss_rand", regel: "A-26", daten: v => v.deckenanschluss_rand || [] },
  // [A-26] Kurze Wand unter 3 Feldern (Fassung 2026-11-10): genau ein Anschluss in Feld 1.
  { art: "a26_deckenanschluss_kurzwand", regel: "A-26", daten: v => v.deckenanschluss_kurzwand || [] },
  { art: "a26_deckenanschluss_luecken", regel: "A-26", daten: v => v.deckenanschluss_luecken || [] },
  { art: "a30_aussparung", regel: "A-30", daten: v => v.aussparung_fehler || [] },
  { art: "g17_ausgleichslage", regel: "G-17", daten: v => v.ausgleich_sonderzuschnitte || [] },
  { art: "v9_ungehaltene_steine", regel: "V-2", daten: v => v.ungehaltene_steine || [] },
  { art: "g12_verzahnung", regel: "G-12", daten: v => v.interlock_fehler || [] },
  // [A-32] Bodenblech im Verband: je Grund eine Art. `achse_auf_partnerblech` ist ein reiner
  // Hinweis (ℹ) ohne Prüfauftrag und deshalb nicht dabei.
  ...["durchlaufend_lage1_belegt", "fuge_an_kuerzung", "sonderzuschnitt", "kein_bodenblech"].map(g => (
    { art: "a32_" + g, regel: "A-32",
      daten: v => (v.verzahnung_bodenblech || []).filter(h => h.grund === g) })),
]);
const ART_NACH_KENNUNG = new Map(HINWEIS_ARTEN.map(a => [a.art, a]));

// ---------------------------------------------------------------------------- Fingerabdruck

/** Kanonische Serialisierung: Schlüssel sortiert, `undefined` entfällt — wie JSON, nur stabil. */
export function kanonisch(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x === undefined ? null : x);
  if (Array.isArray(x)) return "[" + x.map(kanonisch).join(",") + "]";
  return "{" + Object.keys(x).filter(k => x[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ":" + kanonisch(x[k])).join(",") + "}";
}

/** 53-Bit-Hash (cyrb53) als Hex — deterministisch, ohne Fremd-Lib. */
function hash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Die Wandgeometrie, an die ein Vermerk gebunden ist. Planungskennzeichen (Wandtyp,
 *  Brandschutz, Abdichtung, Name) gehören bewusst NICHT dazu. */
export function wandSignatur(w) {
  w = w || {};
  return {
    length_mm: w.length_mm ?? null, height_mm: w.height_mm ?? null,
    openings: w.openings || [], steps: w.steps || [], interlocks: w.interlocks || [],
    ausgleichslage_aktiv: w.ausgleichslage_aktiv === true,
  };
}

/** Fingerabdruck eines Hinweises: Art + vollständige Befunddaten + Wandgeometrie. */
export function fingerabdruck(art, daten, w) {
  return hash(kanonisch({ art, daten: daten ?? null, wand: wandSignatur(w) }));
}

/** Hinweisart eines Hinweises, der NUR als Text vorliegt (Rückfall für Hinweise, die noch
 *  keine eigene Art haben). Die Art hängt dann am Wortlaut, der Abdruck an Wortlaut + Wand. */
export function textArt(text) { return "text:" + hash(String(text)); }

// ---------------------------------------------------------------------------- Vermerke

/** Prüferkürzel prüfen: Fehlermeldung oder `null`. Abgewiesen, nie gekürzt ([P-9]). */
export function kuerzelFehler(k) {
  if (typeof k !== "string" || !k.trim()) return "Kürzel fehlt — bitte das Prüferkürzel eintragen.";
  const t = k.trim();
  if (t.length > KUERZEL_MAX) return `Kürzel „${t}“ ist zu lang (höchstens ${KUERZEL_MAX} Zeichen).`;
  if (!KUERZEL_RE.test(t)) return `Kürzel „${t}“ enthält unzulässige Zeichen (nur Buchstaben, Ziffern, Punkt, Bindestrich).`;
  return null;
}

/** Kalenderdatum JJJJ-MM-TT (lokal) — echtes Datum, nicht nur das Muster. */
export function datumOk(d) {
  if (typeof d !== "string" || !DATUM_RE.test(d)) return false;
  const [j, m, t] = d.split("-").map(Number);
  const x = new Date(j, m - 1, t);
  return x.getFullYear() === j && x.getMonth() === m - 1 && x.getDate() === t;
}

/** Heutiges lokales Datum als JJJJ-MM-TT. */
export function heute(jetzt = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${p(jetzt.getMonth() + 1)}-${p(jetzt.getDate())}`;
}

/** Anzeige TT.MM.JJJJ. */
export function datumText(d) { return datumOk(d) ? d.split("-").reverse().join(".") : String(d); }

function vermerkOk(v) {
  return !!v && typeof v === "object" && typeof v.art === "string" && v.art
    && typeof v.fingerabdruck === "string" && v.fingerabdruck
    && kuerzelFehler(v.kuerzel) === null && datumOk(v.datum);
}

/**
 * Die gültigen Vermerke eines Wandelements, LESEND normalisiert. Fehlt das Feld (Altbestand),
 * ist die Liste leer = nichts geprüft. Ein unzulässiger Eintrag zählt NICHT als Prüfung (der
 * Hinweis bleibt aktiv — die sichere Seite) und wird in `ungueltig` benannt, nie still
 * gelöscht; das gespeicherte Element wird hier nicht umgeschrieben.
 */
export function pruefvermerke(w) {
  const roh = w && w.pruefvermerke;
  if (roh == null) return { vermerke: [], ungueltig: [] };
  if (!Array.isArray(roh)) return { vermerke: [], ungueltig: [roh] };
  const vermerke = [], ungueltig = [];
  for (const v of roh) (vermerkOk(v) ? vermerke : ungueltig).push(v);
  return { vermerke, ungueltig };
}

/**
 * Vermerk setzen (rein): liefert die NEUE Vermerkliste. Je Art höchstens ein Vermerk — ein
 * neuer ersetzt den alten. `aktuelleArten` (optional) räumt dabei Vermerke für Arten ab, deren
 * Hinweis gar nicht mehr besteht (Ursache weg ⇒ erledigt). Wirft bei unzulässigem Kürzel/Datum.
 */
export function setzeVermerk(liste, { art, fingerabdruck: fp, kuerzel, datum }, aktuelleArten = null) {
  const f = kuerzelFehler(kuerzel); if (f) throw new Error(f);
  if (!datumOk(datum)) throw new Error(`Datum „${datum}“ ist kein gültiges Kalenderdatum.`);
  if (typeof art !== "string" || !art || typeof fp !== "string" || !fp)
    throw new Error("Prüfvermerk ohne Hinweisart oder Fingerabdruck.");
  // Unzulässige Einträge bleiben unangetastet (benannt, nie still gelöscht); von den gültigen
  // fällt der alte Vermerk derselben Art und — mit `aktuelleArten` — jeder erledigte weg.
  const behalten = (Array.isArray(liste) ? liste : []).filter(v => !vermerkOk(v)
    || (v.art !== art && (!aktuelleArten || aktuelleArten.includes(v.art))));
  return [...behalten, { art, fingerabdruck: fp, kuerzel: kuerzel.trim(), datum }];
}

/** Vermerk einer Art aufheben (rein). */
export function entferneVermerk(liste, art) {
  return (Array.isArray(liste) ? liste : []).filter(v => !v || v.art !== art);
}

/** Status eines Hinweises: der passende Vermerk (gleiche Art UND gleicher Abdruck) oder null. */
export function vermerkFuer(w, art, fp) {
  return pruefvermerke(w).vermerke.find(v => v.art === art && v.fingerabdruck === fp) || null;
}

/**
 * Alle Prüfhinweise einer Wand aus ihren Befunddaten — samt Status. Für jeden Leser des
 * Wandelements (Modul 1, Geschossplan): `[{ art, regel, daten, fingerabdruck, vermerk }]`,
 * `vermerk` ist null für aktive Hinweise.
 */
export function pruefhinweise(w) {
  const v = (w && w.validation) || {};
  const aus = [];
  for (const a of HINWEIS_ARTEN) {
    const daten = a.daten(v);
    if (!daten.length) continue;
    const fp = fingerabdruck(a.art, daten, w);
    aus.push({ art: a.art, regel: a.regel, daten, fingerabdruck: fp, vermerk: vermerkFuer(w, a.art, fp) });
  }
  return aus;
}

/** Fingerabdruck für eine bekannte Art aus dem Wandelement (null, wenn kein Befund). */
export function abdruckFuerArt(w, art) {
  const a = ART_NACH_KENNUNG.get(art); if (!a) return null;
  const daten = a.daten((w && w.validation) || {});
  return daten.length ? fingerabdruck(art, daten, w) : null;
}

/** Klartext des Vermerks: „geprüft von XY am 11.11.2026". */
export function vermerkText(v) { return `geprüft von ${v.kuerzel} am ${datumText(v.datum)}`; }
