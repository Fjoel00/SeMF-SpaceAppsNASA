#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pruebas Unitarias — Armonización Científica MODIS/VIIRS y Motor Geoespacial
"""

import os
import sys
import unittest
import pandas as pd

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.app.geospatial.clustering import FireEventClusterer
from backend.app.geospatial.zones import (
    buffer_polygon_metric,
    haversine_km,
    polygon_area_km2_utm,
    segment_to_polygon_distance_km,
    utm20s_to_wgs84,
    wgs84_to_utm20s,
)
from backend.app.services.firms_ingestor import FIRMSDataIngestor
from backend.app.services.harmonizer import ModisViirsHarmonizer
from backend.app.services.historical_service import historical_service


class TestScientificAndGeospatial(unittest.TestCase):
    def test_utm20s_roundtrip_precision(self):
        """Verifica que la proyección WGS84 <-> UTM 20S (EPSG:32720) tenga error < 1 metro."""
        lat, lon = -33.255, -65.953  # El Trapiche, San Luis
        x, y = wgs84_to_utm20s(lat, lon)
        lat2, lon2 = utm20s_to_wgs84(x, y)
        self.assertAlmostEqual(lat, lat2, places=4)
        self.assertAlmostEqual(lon, lon2, places=4)
        self.assertLess(haversine_km(lat, lon, lat2, lon2) * 1000.0, 1.0)

    def test_real_firms_ingestion_and_harmonization(self):
        """Verifica la carga de las 31 detecciones reales de NASA FIRMS y su armonización física."""
        ingestor = FIRMSDataIngestor()
        df_raw = ingestor.fetch_all(use_cache=True)
        self.assertGreaterEqual(len(df_raw), 31)

        harmonizer = ModisViirsHarmonizer()
        df_clean = harmonizer.harmonize(df_raw)
        self.assertEqual(len(df_clean), len(df_raw))
        self.assertIn("VIIRS", set(df_clean["sensor_family"]))
        self.assertIn("MODIS", set(df_clean["sensor_family"]))
        self.assertTrue((df_clean["delta_temp_k"] > 0).all())
        self.assertTrue(df_clean["is_saturated_i4"].any())

    def test_haversine_dbscan_and_utm_area_calculation(self):
        """Verifica que DBSCAN consolide los frentes reales de Córdoba y San Luis con áreas métricas."""
        ingestor = FIRMSDataIngestor()
        harmonizer = ModisViirsHarmonizer()
        df_clean = harmonizer.harmonize(ingestor.fetch_all(use_cache=True))

        clusterer = FireEventClusterer(eps_km=2.5, min_samples=2)
        df_clustered = clusterer.cluster_points(df_clean)
        df_events = clusterer.compute_event_metrics(df_clustered)

        self.assertGreaterEqual(len(df_events), 8)
        lead_event = df_events.iloc[0]
        self.assertGreater(lead_event["frp_peak_mw"], 300.0)
        self.assertTrue(lead_event["multisensor_confirmed"])
        self.assertGreater(lead_event["detection_area_ha"], 10.0)
        self.assertGreaterEqual(len(lead_event["polygon_coords"]), 4)

    def test_metric_buffer_and_segment_intersection(self):
        """Verifica cálculo de área UTM, expansión de buffer y detección de intersección."""
        square_poly = [
            [-33.20, -66.00],
            [-33.20, -65.98],
            [-33.22, -65.98],
            [-33.22, -66.00],
            [-33.20, -66.00],
        ]
        base_area = polygon_area_km2_utm(square_poly)
        self.assertGreater(base_area, 3.0)

        buffered = buffer_polygon_metric(square_poly, buffer_km=1.0)
        buf_area = polygon_area_km2_utm(buffered)
        self.assertGreater(buf_area, base_area)

        # Segmento que cruza el polígono
        dist_cut, is_cut = segment_to_polygon_distance_km(-33.19, -65.99, -33.23, -65.99, square_poly)
        self.assertTrue(is_cut)
        self.assertEqual(dist_cut, 0.0)

        # Segmento alejado
        dist_safe, is_cut_safe = segment_to_polygon_distance_km(-33.10, -66.00, -33.10, -65.95, square_poly)
        self.assertFalse(is_cut_safe)
        self.assertGreater(dist_safe, 8.0)

    def test_historical_calendar_bbox_and_empirical_baseline(self):
        """Verifica que el calendario histórico de 26 años filtre por BBox y calcule Z-Scores reales."""
        full_cal = historical_service.query_calendar(mode="annual", year=2025, selected_week=36)
        self.assertEqual(len(full_cal["weeks"]), 52)
        self.assertEqual(len(full_cal["months"]), 12)

        sub_cal = historical_service.query_calendar(
            mode="interval",
            range_from=2015,
            range_to=2024,
            bbox="-66.3,-33.4,-65.8,-33.0",
            selected_week=36,
        )
        self.assertLess(sub_cal["metadata"]["active_cells_count"], full_cal["metadata"]["active_cells_count"])
        self.assertGreater(sub_cal["metadata"]["active_cells_count"], 0)


if __name__ == "__main__":
    unittest.main()
