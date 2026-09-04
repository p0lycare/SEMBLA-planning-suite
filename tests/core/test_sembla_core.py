#!/usr/bin/env python3
"""Testsuite fuer den SEMBLA Core. Lauf: python3 -m unittest -v  (oder pytest)."""
import json, math, os, unittest
import sembla_core as sc
from sembla_core import (build_wall, build_reference, Opening, is_buildable,
                         InvalidDimensionError, InvalidOpeningError,
                         GRID, COURSE, ROD, CHAMBER_OFFSET, MAX_SPAN_GRID, REFERENCE_WALLS)

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


class ReferenceFixtures(unittest.TestCase):
    """Die drei Referenzwaende muessen die goldenen Fixtures exakt reproduzieren."""
    def test_reproduces_golden_fixtures(self):
        for key in REFERENCE_WALLS:
            with self.subTest(wall=key):
                with open(os.path.join(FIX, f"{key}.json")) as f:
                    golden = json.load(f)
                self.assertEqual(build_reference(key), golden)

    def test_reference_walls_buildable(self):
        for key in REFERENCE_WALLS:
            with self.subTest(wall=key):
                self.assertTrue(is_buildable(build_reference(key)))


class TilingAndVersatz(unittest.TestCase):
    def test_versatz_for_non_multiple_of_3(self):
        # Breiten, die KEIN Vielfaches von 3 Rastern sind: i2-Abschluss -> Versatz
        for n in range(2, 41):
            if n in sc.FORBIDDEN_N or n % 3 == 0:
                continue
            w = build_wall("t", n * GRID, 2000, [])
            with self.subTest(N=n):
                self.assertTrue(w["validation"]["versatz_ok"])
                self.assertTrue(is_buildable(w))

    def test_versatz_forced_for_multiple_of_3(self):
        # Versatz wird auch bei Vielfachen von 37,5 cm erzwungen (3 i2 in jeder 2. Lage)
        for n in (6, 9, 12, 15, 18):
            w = build_wall("t", n * GRID, 2000, [])
            with self.subTest(N=n):
                self.assertTrue(w["validation"]["versatz_ok"])
                self.assertTrue(is_buildable(w))
                self.assertGreater(w["bom"]["i2"], 0)

    def test_n3_pure_i3_no_joints(self):
        w = build_wall("t", 3 * GRID, 1000, [])      # Einzelstein je Lage, keine Fugen
        self.assertEqual(w["bom"]["i2"], 0)
        self.assertTrue(w["validation"]["versatz_ok"])

    def test_i3_maximized_non_mult3(self):
        per = {1: 2, 2: 1}                            # minimale i2 je Lage
        for n in range(5, 30):
            if n in sc.FORBIDDEN_N or n % 3 == 0:
                continue
            w = build_wall("t", n * GRID, 1000, [])  # 5 Lagen
            with self.subTest(N=n):
                self.assertEqual(w["bom"]["i2"], 5 * per[n % 3])

    def test_i2_only_at_ends(self):
        # i2 nur als Abschluss an den Enden, nie im Feld (auch bei erzwungenem Versatz)
        for n in (5, 6, 7, 8, 9, 10, 12, 15):
            w = build_wall("t", n * GRID, 800, [])
            for c in w["courses"]:
                types = [s["type"] for s in c["stones"]]
                i, j = 0, len(types)
                while i < j and types[i] == "i2": i += 1
                while j > i and types[j-1] == "i2": j -= 1
                with self.subTest(N=n, lage=c["lage"]):
                    self.assertNotIn("i2", types[i:j], f"i2 im Feld: {types}")

    def test_n4_not_buildable(self):
        w = build_wall("starr", 4 * GRID, 800, [])
        self.assertFalse(is_buildable(w))
        self.assertTrue(w["validation"]["invalid_segments"])

    def test_courses_fill_full_length_when_no_opening(self):
        w = build_wall("t", 2000, 600, [])
        for c in w["courses"]:
            self.assertEqual(c["stones"][0]["x0"], 0)
            self.assertEqual(c["stones"][-1]["x1"], 2000)

    def test_only_i2_i3_used(self):
        w = build_reference("ref2_wand_tuer")
        for c in w["courses"]:
            for s in c["stones"]:
                self.assertIn(s["type"], ("i2", "i3"))
                self.assertIn(s["x1"] - s["x0"], (250, 375))


class ChamberLattice(unittest.TestCase):
    def test_columns_on_lattice(self):
        w = build_reference("ref3_wand_fenster")
        for col in w["tension_columns"]:
            self.assertEqual(col["x_mm"], CHAMBER_OFFSET + GRID * col["k"])

    def test_columns_are_unique_and_sorted(self):
        ks = [c["k"] for c in build_reference("ref2_wand_tuer")["tension_columns"]]
        self.assertEqual(ks, sorted(set(ks)))


class TensionRules(unittest.TestCase):
    def test_both_ends_have_columns(self):
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            ks = {c["k"] for c in w["tension_columns"]}
            with self.subTest(wall=key):
                self.assertIn(0, ks)
                self.assertIn(w["N_grid"] - 1, ks)

    def test_columns_beside_openings(self):
        w = build_reference("ref2_wand_tuer")
        ks = {c["k"] for c in w["tension_columns"]}
        op = w["openings"][0]
        self.assertIn(op["g0"] - 1, ks)   # links der Tuer
        self.assertIn(op["g1"], ks)       # rechts der Tuer

    # Issue #13: Startachse der Auto-Verteilung (1. oder 2. Rasterachse), danach balanciert
    # mit Abstaenden <= max_span_grid weiter. N=16 ist bewusst NICHT glatt durch 3 teilbar.
    @staticmethod
    def _ks(**ps):
        return [c["k"] for c in build_wall("sa", 2000, 2600, [], prestress=ps)["tension_columns"]]

    def test_start_axis_default_is_first_axis(self):
        ks = self._ks(max_span_grid=3)
        self.assertEqual(ks[0], 0)
        self.assertEqual(ks, self._ks(max_span_grid=3, start_axis_grid=0))
        # [V-2]+[V-3]: 3 der 4 i3-Steine der untersten Lage (Mitten 5/8/11/14) werden mittig
        # getroffen; 3 deckt den i2 [2,4), 13 den i3 [13,16) neben dem Endanker 15 ab.
        self.assertEqual(ks, [0, 3, 5, 8, 11, 13, 15])

    def test_start_axis_second_axis(self):
        N, x = 16, 3
        ks = self._ks(max_span_grid=x, start_axis_grid=1)
        self.assertEqual(ks[0], 1)              # Startanker
        self.assertEqual(ks[-1], N - 1)         # Endanker
        self.assertNotIn(0, ks)
        for a, b in zip(ks, ks[1:]):
            self.assertLessEqual(b - a, x, f"Abstand {a}->{b}")
        self.assertEqual(ks, [1, 3, 5, 8, 11, 13, 15])

    # ---- [V-2] MUSS: jeder Stein wird von mindestens einer Spannachse durchgangen ----
    @staticmethod
    def _ungehalten(w):
        ks = {c["k"] for c in w["tension_columns"]}
        return [(c["lage"], st["x0"] // GRID, st["x1"] // GRID)
                for c in w["courses"] for st in c["stones"]
                if not any(k in ks for k in range(st["x0"] // GRID, st["x1"] // GRID))]

    def test_v2_jeder_stein_von_achse_gehalten(self):
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            self.assertEqual(self._ungehalten(w), [], key)
            self.assertEqual(w["validation"]["ungehaltene_steine"], [], key)

    def test_v2_gilt_auch_ohne_maximalabstand(self):
        # [V-4] als Obergrenze abgeschaltet (sehr grosser Wert) -> [V-2] muss allein tragen.
        for L, H in ((2000, 2400), (2500, 2400), (3000, 2600), (5000, 3000), (10000, 2800)):
            for sa in (0, 1):
                w = build_wall("v2", L, H, [], prestress={"max_span_grid": 999, "start_axis_grid": sa})
                self.assertEqual(self._ungehalten(w), [], f"{L}x{H} sa={sa}")

    def test_v2_bei_oeffnungen_und_staffelung(self):
        w = build_wall("v2o", 4000, 2600, [Opening(8, 16, 0, 11, "tuer")],
                       prestress={"max_span_grid": 3, "start_axis_grid": 0})
        self.assertEqual(self._ungehalten(w), [])
        w2 = build_wall("v2s", 3000, 2600, [], prestress={"max_span_grid": 3},
                        steps=[{"x0_mm": 1500, "x1_mm": 3000, "height_mm": 1600}])
        self.assertEqual(self._ungehalten(w2), [])

    def test_v2_verletzung_bei_manuellen_achsen_wird_gemeldet(self):
        # [V-9] manuelle Achsen haben Vorrang, werden aber gegen [V-2] geprueft und sichtbar
        # gemeldet — ohne stille Korrektur und ohne Baubarkeitsausschluss.
        w = build_wall("v9", 2000, 2600, [], prestress={"columns_grid": [0, 15]})
        self.assertEqual([c["k"] for c in w["tension_columns"]], [0, 15])
        offen = w["validation"]["ungehaltene_steine"]
        self.assertTrue(offen, "Verletzung muss gemeldet werden")
        self.assertTrue(w["validation"]["buildable"], "kein Baubarkeitsausschluss")
        for e in offen:
            self.assertIn(e["typ"], ("i2", "i3"))
            self.assertIn("lage", e); self.assertIn("start_grid", e); self.assertIn("breite_grid", e)

    # ---- [V-3] SOLL: automatische Achsen moeglichst mittig in den i3 der untersten Lage ----
    def test_v3_achsen_mittig_in_i3_der_untersten_lage(self):
        for L in (2000, 5000):
            w = build_wall("v3", L, 2600, [], prestress={"max_span_grid": 3})
            ks = {c["k"] for c in w["tension_columns"]}
            mitten = {st["x0"] // GRID + 1 for st in w["courses"][0]["stones"]
                      if (st["x1"] - st["x0"]) // GRID == 3}
            # deutliche Mehrheit der i3-Mitten ist getroffen (nicht alle: Start-/Endanker binden)
            self.assertGreaterEqual(len(mitten & ks) * 4, len(mitten) * 3, f"L={L}")

    def test_v3_erzwingt_keine_achse_im_i2(self):
        # i2 hat keine Rastermitte -> es darf keine Wunschposition erfunden werden.
        w = build_wall("v3b", 2000, 2600, [], prestress={"max_span_grid": 3})
        ks = [c["k"] for c in w["tension_columns"]]
        self.assertEqual(ks, sorted(set(ks)))
        self.assertTrue(all(0 <= k < 16 for k in ks))

    def test_start_axis_extras_and_manual_precedence(self):
        op = [Opening(5, 11, 0, 10, "tuer")]
        ks = {c["k"] for c in build_wall("sa", 2000, 2600, op,
                                         prestress={"max_span_grid": 3, "start_axis_grid": 1})["tension_columns"]}
        self.assertIn(4, ks); self.assertIn(11, ks)      # Oeffnungskanten additiv
        self.assertNotIn(0, ks); self.assertIn(15, ks)
        m = build_wall("sa", 2000, 2600, [], prestress={"max_span_grid": 3, "start_axis_grid": 1,
                                                        "columns_grid": [0, 8, 15]})
        self.assertEqual([c["k"] for c in m["tension_columns"]], [0, 8, 15])

    def test_max_span_within_runs(self):
        # innerhalb durchgehender Steinfelder <= 375 mm (3 Raster)
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            self.assertTrue(w["validation"]["tension_span_ok"], key)

    def test_segments_avoid_openings_and_cover_above_below(self):
        w = build_reference("ref3_wand_fenster")
        op = w["openings"][0]
        for c in w["tension_columns"]:
            inx = op["g0"] <= c["k"] < op["g1"]
            for g in c["segments"]:
                iny = g["lage0"] < op["l1"] and g["lage1"] > op["l0"]
                self.assertFalse(inx and iny, "Segment in Oeffnung")
        span = [c for c in w["tension_columns"] if op["g0"] <= c["k"] < op["g1"]]
        self.assertTrue(any(any(g["lage1"] <= op["l0"] for g in c["segments"]) for c in span), "keine Vorspannung unter Fenster")
        self.assertTrue(any(any(g["lage0"] >= op["l1"] for g in c["segments"]) for c in span), "keine Vorspannung ueber Fenster")

    def test_rod_count_and_ablaengen(self):
        w = build_wall("t", 1000, 2600, [])   # 2600/1100 -> 3 Stangen
        col = w["tension_columns"][0]
        self.assertTrue(col["durchgehend"])
        seg = col["segments"][0]
        self.assertEqual(seg["gewindestangen"], 3)
        self.assertEqual(seg["verbindungsmuttern"], 2)
        self.assertEqual(seg["letzte_stange_mm"], 2600 - 2 * ROD)  # 400
        self.assertEqual(seg["verschnitt_mm"], 3 * ROD - 2600)     # 700

    def test_rod_length_parameter(self):
        a = build_wall("a", 1000, 2600, [])
        b = build_wall("b", 1000, 2600, [], prestress={"rod_mm": 600})
        self.assertEqual(a["rod_mm"], 1100)
        self.assertEqual(b["rod_mm"], 600)
        sa = a["tension_columns"][0]["segments"][0]
        sb = b["tension_columns"][0]["segments"][0]
        self.assertGreater(sb["gewindestangen"], sa["gewindestangen"])     # kürzere Stange -> mehr Stangen
        self.assertEqual(sb["verbindungsmuttern"], sb["gewindestangen"] - 1)
        self.assertEqual(sb["verschnitt_mm"], sb["gewindestangen"] * 600 - (sb["z1_mm"] - sb["z0_mm"]))
        # ungültige Werte -> Default
        self.assertEqual(build_wall("a", 1000, 2600, [], prestress={"rod_mm": 0})["rod_mm"], 1100)
        self.assertEqual(build_wall("a", 1000, 2600, [], prestress={"rod_mm": -5})["rod_mm"], 1100)


class ZuschnittKombination(unittest.TestCase):
    """Zuschnitt aus ausgewaehlten Standardlaengen ([Z-2]/[Z-5]).

    DIESELBEN Faelle stehen wortgleich in test-sembla-core.mjs — sie sind der
    Paritaetsvertrag der Kombinationsregel zwischen Orakel und Betriebskopie.
    """
    @staticmethod
    def kurz(r):
        return "+".join(str(s["len_mm"]) + ("S/" + str(s["quelle_mm"]) if s["art"] == "sonder" else "")
                        for s in r["stuecke"])

    def test_170cm_aus_100_50(self):
        r = sc.kombiniere_laengen(1700, [1000, 500])
        self.assertEqual(self.kurz(r), "1000+500+200S/500")
        self.assertIsNone(r["konflikt"])

    def test_reihenfolge_und_doppelte_ohne_wirkung(self):
        self.assertEqual(self.kurz(sc.kombiniere_laengen(1700, [500, 1000, 500])), "1000+500+200S/500")

    def test_exakt_teilbar(self):
        self.assertEqual(self.kurz(sc.kombiniere_laengen(3000, [1000])), "1000+1000+1000")

    def test_bedarf_kleiner_als_kleinste_groesse(self):
        self.assertEqual(self.kurz(sc.kombiniere_laengen(400, [1000, 600])), "400S/600")

    def test_mindestmass_wird_gemeldet(self):
        r = sc.kombiniere_laengen(1200, [1100])
        self.assertEqual(self.kurz(r), "1100+100S/1100")
        self.assertEqual(r["konflikt"], "mindestmass")
        alt = sc.kombiniere_laengen(1200, [1100, 500])
        self.assertIsNone(alt["konflikt"])
        self.assertTrue(all(s["len_mm"] >= sc.MIN_FERTIGMASS_MM for s in alt["stuecke"]))

    def test_ohne_standardlaenge(self):
        r = sc.kombiniere_laengen(1700, [])
        self.assertEqual(r["stuecke"], [])
        self.assertEqual(r["konflikt"], "keine_standardlaenge")

    def test_quelle_fuer_mass(self):
        self.assertEqual(sc.quelle_fuer_mass(400, [1000, 500, 300]), 500)
        self.assertIsNone(sc.quelle_fuer_mass(1500, [1000, 500]))

    def test_laengensatz_im_wandelement(self):
        w = build_wall("z", 1000, 2600, [], prestress={"rod_lengths_mm": [600, 1000]})
        self.assertEqual(w["prestress"]["rod_lengths_mm"], [1000, 600])
        self.assertEqual(w["rod_mm"], 1000)
        sg = w["tension_columns"][0]["segments"][0]
        self.assertEqual(self.kurz({"stuecke": sg["stuecke"]}), "1000+1000+600")
        self.assertEqual(sg["gewindestangen"], 3)
        self.assertEqual(sg["verbindungsmuttern"], 2)
        self.assertEqual(sg["verschnitt_mm"], 0)

    def test_fallback_bitgenau_wie_altstand(self):
        for h in (2000, 2200, 2400, 2600, 3000, 3400):
            with self.subTest(h=h):
                sg = build_wall("f", 1000, h, [])["tension_columns"][0]["segments"][0]
                st = math.ceil(h / ROD)
                self.assertEqual(sg["gewindestangen"], st)
                self.assertEqual(sg["letzte_stange_mm"], h - (st - 1) * ROD)
                self.assertEqual(sg["verschnitt_mm"], st * ROD - h)


class Bodenblech(unittest.TestCase):
    """Bodenblech aus Standardlaengen ([A-10]/[A-11]/[A-12]).

    DIESELBEN Faelle stehen wortgleich in test-sembla-core.mjs — sie sind der
    Paritaetsvertrag der Zerlegung zwischen Orakel und Betriebskopie.
    """
    @staticmethod
    def kurz(w):
        return "+".join(str(t["raster_mm"]) + "/" + str(t["bauteil_mm"])
                        + ("S" if t["art"] == "sonder" else "")
                        for t in w["base_plate"]["teile"])

    def test_fallback_ist_volle_standardreihe(self):
        w = build_wall("bb", 5000, 2600, [])
        self.assertEqual(w["prestress"]["blech_lengths_mm"], list(sc.BLECH_LAENGEN))
        self.assertEqual(sc.norm_blech_laengen([1250, 300, 1500, 1000, 1000, 0]), [1250, 1000])

    def test_5000er_wand_nur_standardteile_stossfrei(self):
        w = build_wall("bb5", 5000, 2600, [])
        self.assertEqual(self.kurz(w), "1125/1123+1125/1123+1125/1123+1125/1123+500/498")
        self.assertTrue(all(t["art"] == "standard" for t in w["base_plate"]["teile"]))
        self.assertEqual(sum(t["raster_mm"] for t in w["base_plate"]["teile"]), 5000)
        self.assertEqual(w["base_plate"]["module"], 5)
        self.assertEqual(w["bom"]["stahlblech_module"], 5 + w["top_plate"]["module"])
        self.assertEqual(w["validation"]["blech_konflikte"], [])
        # Das Ausweichen ist echt: 4x1250 waere groesser, liegt aber auf dem Steinstoss Raster 10.
        fugen = set(w["courses"][0]["joints_grid"])
        self.assertIn(10, fugen)
        x = 0
        for t in w["base_plate"]["teile"]:
            x += t["raster_mm"]
            self.assertTrue(x >= 5000 or (x // GRID) not in fugen, f"Stoss bei {x}")

    def test_rastermass_und_bauteilmass(self):
        for L in (1000, 2000, 3000, 5000, 250):
            w = build_wall("bbm", L, 2600, [])
            with self.subTest(L=L):
                for t in w["base_plate"]["teile"]:
                    self.assertEqual(t["bauteil_mm"], t["raster_mm"] - sc.BLECH_SPIEL)
                    self.assertEqual(t["raster_mm"] % GRID, 0)

    def test_kein_ausweichen_moeglich_konflikt_gemeldet(self):
        w = build_wall("bb1250", 5000, 2600, [], prestress={"blech_lengths_mm": [1250]})
        self.assertEqual(self.kurz(w), "1250/1248+1250/1248+1250/1248+1250/1248")
        self.assertEqual(w["validation"]["blech_konflikte"],
                         [{"grund": "stoss_auf_steinstoss", "x_mm": 1250, "grid": 10}])
        self.assertTrue(w["validation"]["buildable"])

    def test_nicht_deckbare_laenge_genau_ein_sonderzuschnitt(self):
        w = build_wall("bbs", 250, 2600, [])
        self.assertEqual(self.kurz(w), "250/248S")
        self.assertEqual(len([t for t in w["base_plate"]["teile"] if t["art"] == "sonder"]), 1)
        self.assertEqual(w["validation"]["blech_konflikte"], [])
        self.assertTrue(w["validation"]["buildable"])

    def test_leerer_vorratssatz_wird_gemeldet(self):
        w = build_wall("bb0", 5000, 2600, [], prestress={"blech_lengths_mm": []})
        self.assertEqual(w["prestress"]["blech_lengths_mm"], [])
        self.assertEqual(self.kurz(w), "5000/4998S")
        self.assertTrue(any(k["grund"] == "keine_standardlaenge"
                            for k in w["validation"]["blech_konflikte"]))

    def test_blech_mm_bleibt_kopfblech_modullaenge(self):
        a = build_wall("bbk", 3000, 2600, [])
        b = build_wall("bbk", 3000, 2600, [], prestress={"blech_mm": 500})
        self.assertEqual(self.kurz(a), self.kurz(b))
        self.assertEqual(a["top_plate"]["module"], 3)
        self.assertEqual(b["top_plate"]["module"], 6)

    # Gegenfall der Abnahme: die frueher benutzte Tiefensuche nahm einen Sonderabschluss als
    # Erfolg und brach im ersten grossen Ast ab — 1000+625+625+250S —, obwohl 4 x 625 exakt
    # deckt. [A-10] verlangt: existiert IRGENDEINE exakte Standardkombination, entsteht KEIN
    # Sonderzuschnitt.
    def test_exakte_kombination_schlaegt_sonderzuschnitt(self):
        r = sc.zerlege_bodenblech(2500, [1000, 625, 375], [])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [625, 625, 625, 625])
        self.assertTrue(all(t["art"] == "standard" for t in r["teile"]))
        self.assertEqual(sum(t["raster_mm"] for t in r["teile"]), 2500)
        self.assertEqual(r["konflikte"], [])

    def test_geringste_teilezahl_schlaegt_groessenpraeferenz(self):
        # Groesste zuerst ergaebe 1000+1000+375+250S (4 Teile, davon einer Sonder);
        # exakt und kuerzer sind 3 x 875.
        r = sc.zerlege_bodenblech(2625, [1000, 875, 375], [])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [875, 875, 875])
        self.assertTrue(all(t["art"] == "standard" for t in r["teile"]))
        self.assertEqual(r["konflikte"], [])

    def test_stossregel_schlaegt_geringste_teilezahl(self):
        # Ohne Stoss ist 1250+1250 die kuerzeste exakte Kombination; der Steinstoss bei 1250 mm
        # sperrt sie, also gilt die kuerzeste STOSSFREIE exakte Kombination — und die ist laenger.
        ohne = sc.zerlege_bodenblech(2500, sc.BLECH_LAENGEN, [])
        self.assertEqual([t["raster_mm"] for t in ohne["teile"]], [1250, 1250])
        r = sc.zerlege_bodenblech(2500, sc.BLECH_LAENGEN, [10])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [1125, 1000, 375])
        self.assertTrue(all(t["art"] == "standard" for t in r["teile"]))
        self.assertEqual(r["konflikte"], [])

    def test_zerlege_bodenblech_ist_reine_funktion(self):
        r = sc.zerlege_bodenblech(3000, sc.BLECH_LAENGEN, [])
        self.assertEqual([t["raster_mm"] for t in r["teile"]], [1250, 1250, 500])
        self.assertEqual(r["konflikte"], [])


class InvalidInputs(unittest.TestCase):
    def test_length_not_on_grid(self):
        with self.assertRaises(InvalidDimensionError):
            build_wall("x", 300, 2000, [])

    def test_height_not_on_course(self):
        with self.assertRaises(InvalidDimensionError):
            build_wall("x", 1000, 250, [])

    def test_too_short(self):
        with self.assertRaises(InvalidDimensionError):
            build_wall("x", 125, 2000, [])

    def test_opening_out_of_bounds(self):
        with self.assertRaises(InvalidOpeningError):
            build_wall("x", 1000, 2000, [Opening(2, 99, 0, 5)])

    def test_opening_above_wall(self):
        with self.assertRaises(InvalidOpeningError):
            build_wall("x", 2000, 1000, [Opening(2, 6, 0, 99)])

    def test_opening_overlap(self):
        with self.assertRaises(InvalidOpeningError):
            build_wall("x", 4000, 2600, [Opening(2, 10, 0, 8), Opening(6, 14, 0, 8)])

    def test_bad_opening_geometry(self):
        with self.assertRaises(InvalidOpeningError):
            Opening(6, 4, 0, 5)   # g1<g0
        with self.assertRaises(InvalidOpeningError):
            Opening(2, 6, 5, 5)   # l1<=l0


class Verzahnung(unittest.TestCase):
    """Verzahnungsbereich ([G-10]/[G-11]/[G-12]).

    DIESELBEN Erwartungswerte stehen wortgleich in test-sembla-core.mjs —
    sie sind der Paritaetsvertrag.
    """

    def test_verzahnung_start_parity_0(self):
        # 1000mm = 8 Raster, 800mm = 4 Lagen
        w = build_wall("vz0", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        self.assertEqual(len(w["interlocks"]), 1)
        self.assertEqual(len(w["validation"]["interlock_fehler"]), 0)
        # Lage 0 und 2 (gerade) sind im Bereich [0,3) ausgespart
        for li in (0, 2):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertEqual(len(steine), 0, f"Lage {li}: sollte 0 Steine im Bereich haben")
        # Lage 1 und 3 (ungerade) haben Steine im Bereich
        for li in (1, 3):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertGreater(len(steine), 0, f"Lage {li}: sollte Steine im Bereich haben")

    def test_verzahnung_start_parity_1(self):
        w = build_wall("vz1", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 1}])
        self.assertEqual(len(w["interlocks"]), 1)
        # Lage 1 und 3 (ungerade) sind im Bereich ausgespart
        for li in (1, 3):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertEqual(len(steine), 0, f"Lage {li}: sollte 0 Steine im Bereich haben")
        # Lage 0 und 2 (gerade) haben Steine im Bereich
        for li in (0, 2):
            steine = [s for s in w["courses"][li]["stones"] if s["x0"] // GRID < 3]
            self.assertGreater(len(steine), 0, f"Lage {li}: sollte Steine im Bereich haben")

    def test_vorspannung_identisch_mit_und_ohne_verzahnung(self):
        # [G-11] Vorspannung bleibt bitgleich
        ohne = build_wall("ohneVz", 2000, 2000, [])
        mit = build_wall("mitVz", 2000, 2000, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        ohne_ks = [c["k"] for c in ohne["tension_columns"]]
        mit_ks = [c["k"] for c in mit["tension_columns"]]
        self.assertEqual(ohne_ks, mit_ks)
        for i, (o, m) in enumerate(zip(ohne["tension_columns"], mit["tension_columns"])):
            self.assertEqual(len(o["segments"]), len(m["segments"]), f"col {i}: Segmente verschieden")
            for j, (os, ms) in enumerate(zip(o["segments"], m["segments"])):
                self.assertEqual(os["z0_mm"], ms["z0_mm"])
                self.assertEqual(os["z1_mm"], ms["z1_mm"])
                self.assertEqual(os["stuecke"], ms["stuecke"])

    def test_bom_steinmenge_reduziert(self):
        ohne = build_wall("ohneVz", 1000, 800, [])
        mit = build_wall("mitVz", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        ohne_steine = ohne["bom"]["i2"] + ohne["bom"]["i3"]
        mit_steine = mit["bom"]["i2"] + mit["bom"]["i3"]
        self.assertLess(mit_steine, ohne_steine)
        # Stossfugen bleiben gleich (basieren auf vollstaendigem Verband)
        self.assertEqual(ohne["bom"]["stossfugen"], mit["bom"]["stossfugen"])

    def test_ungueltige_verzahnung_gemeldet(self):
        # Bereich ausserhalb der Wand
        w1 = build_wall("vzErr", 1000, 800, [], interlocks=[{"g0": 5, "g1": 12, "start_parity": 0}])
        self.assertEqual(len(w1["interlocks"]), 0)
        self.assertTrue(any(f["grund"] == "ausserhalb_wand" for f in w1["validation"]["interlock_fehler"]))
        # Ungueltige Paritaet
        w2 = build_wall("vzErr", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 2}])
        self.assertEqual(len(w2["interlocks"]), 0)
        self.assertTrue(any(f["grund"] == "ungueltige_paritaet" for f in w2["validation"]["interlock_fehler"]))
        # Leeres Intervall
        w3 = build_wall("vzErr", 1000, 800, [], interlocks=[{"g0": 5, "g1": 3, "start_parity": 0}])
        self.assertEqual(len(w3["interlocks"]), 0)
        self.assertTrue(any(f["grund"] == "leeres_intervall" for f in w3["validation"]["interlock_fehler"]))

    def test_verzahnung_aendert_buildable_nicht(self):
        # Fehlerhafte Verzahnung aendert buildable nicht
        w = build_wall("vzBuild", 1000, 800, [], interlocks=[{"g0": 100, "g1": 200, "start_parity": 0}])
        self.assertTrue(w["validation"]["buildable"])
        self.assertGreater(len(w["validation"]["interlock_fehler"]), 0)

    def test_ohne_verzahnung_interlocks_leer(self):
        w = build_wall("noVz", 1000, 800, [])
        self.assertEqual(len(w["interlocks"]), 0)
        self.assertEqual(len(w["validation"]["interlock_fehler"]), 0)
        self.assertEqual(len(w["validation"]["interlock_invalid_segments"]), 0)

    def test_kein_stein_ragt_in_ausgesparten_bereich(self):
        # In ausgesparten Lagen darf kein Stein den Bereich [0,3) beruehren
        w = build_wall("vzRagt", 1000, 800, [], interlocks=[{"g0": 0, "g1": 3, "start_parity": 0}])
        for li in (0, 2):
            for st in w["courses"][li]["stones"]:
                a, b = st["x0"] // GRID, st["x1"] // GRID
                # Stein darf den Bereich [0,3) nicht beruehren
                self.assertTrue(b <= 0 or a >= 3, f"Lage {li}: Stein [{a},{b}) ragt in Bereich [0,3)")
        # In Lagen 1 und 3 sind Steine im Bereich erlaubt
        for li in (1, 3):
            hat_stein = any(st["x0"] // GRID < 3 and st["x1"] // GRID > 0 for st in w["courses"][li]["stones"])
            self.assertTrue(hat_stein, f"Lage {li}: sollte Steine im Bereich haben")

    def test_interlock_invalid_segments_gemeldet(self):
        # Verzahnungsbereich [0,4) auf 8-Raster-Wand: nach Aussparen bleibt Segment mit 4 Rastern
        w = build_wall("vzInv", 1000, 800, [], interlocks=[{"g0": 0, "g1": 4, "start_parity": 0}])
        # Wand ohne Verzahnungsproblem baubar (8 Raster)
        self.assertTrue(w["validation"]["buildable"])
        # Aber nach Verzahnung gibt es nicht baubare Segmente
        self.assertGreater(len(w["validation"]["interlock_invalid_segments"]), 0)
        # Die gemeldeten Segmente haben Breite 4 (nicht baubar)
        seg = w["validation"]["interlock_invalid_segments"][0]
        self.assertEqual(seg["breite_grid"], 4)


class BomConsistency(unittest.TestCase):
    def test_bom_matches_courses_and_columns(self):
        for key in REFERENCE_WALLS:
            w = build_reference(key)
            i2 = sum(1 for c in w["courses"] for s in c["stones"] if s["type"] == "i2")
            i3 = sum(1 for c in w["courses"] for s in c["stones"] if s["type"] == "i3")
            with self.subTest(wall=key):
                self.assertEqual(w["bom"]["i2"], i2)
                self.assertEqual(w["bom"]["i3"], i3)
                # Anker: je Segment 2 Enden -> Senkkopf(Fuss) + Spannmutter(sonst) == 2*Segmente
                nseg = sum(len(c["segments"]) for c in w["tension_columns"])
                self.assertEqual(w["bom"]["senkkopfschrauben"] + w["bom"]["spannmuttern"], 2 * nseg)
                # Dichtstreifen-Laenge = Stossfugen * Lagenhoehe
                self.assertEqual(w["bom"]["dichtstreifen_mm"], w["bom"]["stossfugen"] * COURSE)
                self.assertEqual(w["bom"]["gewindestangen"],
                                 sum(c["gewindestangen"] for c in w["tension_columns"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
