#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pruebas de Integración de Endpoints REST API v1 y Motor de Machine Learning
"""

import os
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.app.api.v1.router import dispatch_api_request


class TestApiAndMLIntegration(unittest.TestCase):
    def test_health_and_openapi_endpoints(self):
        status, health = dispatch_api_request("GET", "/api/v1/health", {})
        self.assertEqual(status, 200)
        self.assertEqual(health["status"], "healthy")
        self.assertEqual(health["components"]["ml_engine"]["status"], "READY")

        status_oa, spec = dispatch_api_request("GET", "/openapi.json", {})
        self.assertEqual(status_oa, 200)
        self.assertEqual(spec["openapi"], "3.1.0")
        self.assertIn("/api/v1/routing/evacuate", spec["paths"])

    def test_dashboard_and_active_fires_endpoints(self):
        status, dash = dispatch_api_request("GET", "/api/v1/dashboard/summary", {})
        self.assertEqual(status, 200)
        self.assertIn("kpis", dash)
        self.assertIn("top_active_events", dash)
        self.assertGreaterEqual(len(dash["top_active_events"]), 1)

        status_g, geojson = dispatch_api_request("GET", "/api/v1/fires/geojson", {})
        self.assertEqual(status_g, 200)
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertGreaterEqual(len(geojson["features"]), 1)

    def test_shelters_and_ml_endpoints(self):
        status_s, shelters = dispatch_api_request("GET", "/api/v1/shelters", {})
        self.assertEqual(status_s, 200)
        self.assertGreaterEqual(shelters["total_shelters"], 15)

        status_m, models = dispatch_api_request("GET", "/api/v1/ml/models", {})
        self.assertEqual(status_m, 200)
        self.assertEqual(len(models["models"]), 4)

        status_h, hazard = dispatch_api_request(
            "POST",
            "/api/v1/ml/predict-hazard",
            {
                "latitude": -31.42,
                "longitude": -64.18,
                "week_iso": 38,
                "historical_eq_count": 75.0,
                "wind_speed_kmh": 45.0,
                "temp_max_c": 36.0,
                "rh_min_pct": 12.0,
                "fwi_estimate": 55.0,
                "drought_days": 30,
            },
        )
        self.assertEqual(status_h, 200)
        self.assertIn("hazard_score_24h", hazard)
        self.assertIn("hazard_score_48h", hazard)
        self.assertIn("hazard_score_72h", hazard)
        self.assertGreater(hazard["hazard_score_24h"], 40.0)

        status_p, pred = dispatch_api_request(
            "POST",
            "/api/v1/ml/predict-risk",
            {
                "spread_features": {
                    "frp_peak_mw": 280.0,
                    "wind_speed_kmh": 42.0,
                    "relative_humidity_pct": 18.0,
                    "temperature_c": 34.0,
                },
                "segment_features": {
                    "dist_to_perimeter_km": 0.8,
                    "dist_to_cone_1h_km": 0.2,
                    "dist_to_cone_3h_km": 0.0,
                    "wind_alignment_cos": 0.9,
                    "fire_frp_mw": 280.0,
                    "wind_speed_kmh": 42.0,
                    "relative_humidity_pct": 18.0,
                    "data_age_hours": 1.5,
                },
            },
        )
        self.assertEqual(status_p, 200)
        self.assertGreater(pred["spread_prediction"]["spread_speed_kmh"], 0.3)
        self.assertGreater(pred["segment_risk_prediction"]["risk_probability"], 0.5)

    def test_routing_endpoint_422_on_bad_coordinates(self):
        status, err = dispatch_api_request(
            "POST",
            "/api/v1/routing/evacuate",
            {"origin_lat": 999.0, "origin_lon": -65.0},
        )
        self.assertEqual(status, 422)
        self.assertIn("detail", err)

    def test_simulation_and_settings_endpoints(self):
        status_sim, sim = dispatch_api_request(
            "POST",
            "/api/v1/fires/simulate",
            {
                "injected_fires": [{"lat": -33.21, "lon": -66.02, "severity": "catastrophic"}],
                "weather": {
                    "wind_speed_kmh": 55.0,
                    "wind_direction_deg": 210.0,
                    "temperature_c": 37.0,
                    "relative_humidity_pct": 14.0,
                },
            },
        )
        self.assertEqual(status_sim, 200)
        self.assertTrue(sim["simulation_active"])
        self.assertTrue(sim["weather"]["is_extreme_30_30_30"])
        self.assertEqual(len(sim["events"]), 1)

        status_cfg, cfg = dispatch_api_request(
            "PUT",
            "/api/v1/settings",
            {"dbscan_eps_km": 2.5, "default_safety_buffer_km": 1.2},
        )
        self.assertEqual(status_cfg, 200)
        self.assertEqual(cfg["public_port"], 8090)

    def test_frontend_bundle_and_docs_integrity(self):
        index_html = os.path.join(ROOT_DIR, "frontend", "dist", "index.html")
        bundle_js = os.path.join(ROOT_DIR, "frontend", "dist", "assets", "semf-bundle.js")
        self.assertTrue(os.path.isfile(index_html))
        self.assertTrue(os.path.isfile(bundle_js))

        for doc_name in [
            "PLAN_MAESTRO_SEMF_2.0.md",
            "ARQUITECTURA.md",
            "DISEÑO_UX_UI.md",
            "ML_ROADMAP.md",
            "ROADMAP.md",
            "DECISIONES_TECNICAS.md",
        ]:
            self.assertTrue(os.path.isfile(os.path.join(ROOT_DIR, "docs", doc_name)))



if __name__ == "__main__":
    unittest.main()
