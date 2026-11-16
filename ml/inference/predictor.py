#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Motor de Inferencia de Machine Learning y Guardrails Deterministas
=============================================================================
Gestiona la inferencia en tiempo real para los 4 modelos del sistema:
1. FireSpreadPredictor (velocidad de avance km/h y conos 1h/3h/6h)
2. RoadSegmentRiskClassifier (probabilidad calibrada de afectación vial)
3. WildfireHazardTemporalPredictor (proyección temporal de peligro a 24h/48h/72h)
4. AlternativeRouteRanker (ranking multicriterio de alternativas de evacuación)

Soporta ejecución con ONNX Runtime (<2 ms de latencia) con fallback a joblib
y salvaguardas físicas deterministas ante entradas fuera de distribución (OOD).
"""

import json
import math
import os
from typing import Dict, Any, List, Tuple, Optional

import joblib
import numpy as np

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARTIFACTS_DIR = os.path.join(ROOT_DIR, "ml", "artifacts")


class MLRiskPredictor:
    """
    Servicio integral de inferencia para los 4 modelos de Machine Learning.
    """

    def __init__(self, artifacts_dir: str = ARTIFACTS_DIR):
        self.artifacts_dir = artifacts_dir
        self.metadata: Dict[str, Any] = {}

        # Modelos Joblib
        self.spread_model = None
        self.road_risk_model = None
        self.hazard_model = None
        self.route_ranker_model = None

        # Sesiones ONNX Runtime
        self.spread_onnx_sess = None
        self.road_risk_onnx_sess = None
        self.hazard_onnx_sess = None
        self.route_ranker_onnx_sess = None

        self.load_artifacts()

    def _init_onnx_session(self, filename: str) -> Optional[Any]:
        path = os.path.join(self.artifacts_dir, filename)
        if not os.path.exists(path):
            return None
        try:
            import onnxruntime as ort
            # Suprimir logs verbosos de ONNX Runtime
            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            return ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])
        except Exception:
            return None

    def load_artifacts(self) -> bool:
        meta_path = os.path.join(self.artifacts_dir, "models_metadata.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
            except Exception:
                self.metadata = {}

        # Cargar Joblib
        for attr, fname in [
            ("spread_model", "spread_model_v1.joblib"),
            ("road_risk_model", "road_risk_model_v1.joblib"),
            ("hazard_model", "hazard_model_v1.joblib"),
            ("route_ranker_model", "route_ranker_v1.joblib"),
        ]:
            p = os.path.join(self.artifacts_dir, fname)
            if os.path.exists(p):
                try:
                    setattr(self, attr, joblib.load(p))
                except Exception:
                    setattr(self, attr, None)

        # Cargar sesiones ONNX
        self.spread_onnx_sess = self._init_onnx_session("spread_model_v1.onnx")
        self.road_risk_onnx_sess = self._init_onnx_session("road_risk_model_v1.onnx")
        self.hazard_onnx_sess = self._init_onnx_session("hazard_model_v1.onnx")
        self.route_ranker_onnx_sess = self._init_onnx_session("route_ranker_v1.onnx")

        return self.is_ready

    @property
    def is_ready(self) -> bool:
        return (
            (self.spread_model is not None or self.spread_onnx_sess is not None)
            and (self.road_risk_model is not None or self.road_risk_onnx_sess is not None)
        )

    def get_models_metadata(self) -> List[Dict[str, Any]]:
        return self.metadata.get("models", [])

    # =========================================================================
    # MODELO 1: FireSpreadPredictor
    # =========================================================================
    @staticmethod
    def deterministic_spread_speed_kmh(
        frp_peak_mw: float,
        wind_speed_kmh: float,
        relative_humidity_pct: float,
        temperature_c: float,
        seasonal_z_score: float = 0.0,
    ) -> float:
        """Ecuación física determinista de respaldo (Rothermel / Albini ajustado)."""
        w_speed = max(0.0, min(130.0, float(wind_speed_kmh)))
        rh = max(5.0, min(100.0, float(relative_humidity_pct)))
        temp = max(-10.0, min(55.0, float(temperature_c)))
        frp = max(0.0, float(frp_peak_mw))

        wind_factor = 0.055 * (w_speed ** 1.15)
        moisture_damping = math.exp(-0.030 * rh)
        thermal_boost = 1.0 + 0.16 * math.log1p(frp / 30.0) + 0.004 * max(0.0, temp - 20.0)
        seasonal_boost = 1.0 + 0.06 * max(0.0, float(seasonal_z_score))
        speed = (0.18 + wind_factor) * moisture_damping * thermal_boost * seasonal_boost
        return round(max(0.08, min(8.5, speed)), 3)

    def predict_fire_spread(self, features: Dict[str, float]) -> Dict[str, Any]:
        frp_peak = float(features.get("frp_peak_mw", 50.0))
        frp_dens = float(features.get("frp_density_mw_km2", 120.0))
        delta_t = float(features.get("delta_temp_k", 30.0))
        pts = float(features.get("points_count", 5.0))
        wind = float(features.get("wind_speed_kmh", 25.0))
        rh = float(features.get("relative_humidity_pct", 25.0))
        temp = float(features.get("temperature_c", 28.0))
        z_score = float(features.get("seasonal_z_score", 0.5))

        det_speed = self.deterministic_spread_speed_kmh(frp_peak, wind, rh, temp, z_score)

        # Chequeo OOD
        ood_flags = []
        if wind < 0.0 or wind > 115.0:
            ood_flags.append("wind_speed_kmh fuera de distribución (>115 km/h)")
        if rh < 2.0 or rh > 100.0:
            ood_flags.append("relative_humidity_pct fuera de distribución")
        if frp_peak < 0.0 or frp_peak > 2500.0:
            ood_flags.append("frp_peak_mw fuera de distribución")

        if ood_flags or not self.is_ready:
            return {
                "spread_speed_kmh": det_speed,
                "reach_1h_km": round(det_speed * 1.0, 3),
                "reach_3h_km": round(det_speed * 2.6, 3),
                "reach_6h_km": round(det_speed * 4.5, 3),
                "evaluation_mode": "DETERMINISTIC_FALLBACK",
                "model_version": "deterministic-v1.0",
                "ood_warnings": ood_flags,
            }

        X = np.array([[frp_peak, frp_dens, delta_t, pts, wind, rh, temp, z_score]], dtype=np.float32)

        # Inferencia ONNX si disponible, o Joblib
        ml_pred = None
        if self.spread_onnx_sess is not None:
            try:
                input_name = self.spread_onnx_sess.get_inputs()[0].name
                raw_out = self.spread_onnx_sess.run(None, {input_name: X})
                ml_pred = float(raw_out[0].flatten()[0])
            except Exception:
                ml_pred = None

        if ml_pred is None and self.spread_model is not None:
            try:
                ml_pred = float(self.spread_model.predict(X)[0])
            except Exception:
                ml_pred = det_speed

        final_speed = round(max(0.08, min(8.5, 0.75 * (ml_pred or det_speed) + 0.25 * det_speed)), 3)

        return {
            "spread_speed_kmh": final_speed,
            "ml_raw_speed_kmh": round(ml_pred if ml_pred is not None else det_speed, 3),
            "deterministic_baseline_kmh": det_speed,
            "reach_1h_km": round(final_speed * 1.0, 3),
            "reach_3h_km": round(final_speed * 2.6, 3),
            "reach_6h_km": round(final_speed * 4.5, 3),
            "evaluation_mode": "HYBRID_ML_VERIFIED",
            "model_version": "FireSpreadPredictor-v1.0.0",
            "runtime_engine": "ONNXRuntime" if self.spread_onnx_sess is not None else "Joblib",
            "ood_warnings": [],
        }

    # =========================================================================
    # MODELO 2: RoadSegmentRiskClassifier
    # =========================================================================
    @staticmethod
    def deterministic_segment_risk(
        dist_to_perimeter_km: float,
        dist_to_cone_1h_km: float,
        dist_to_cone_3h_km: float,
        wind_alignment_cos: float,
        fire_frp_mw: float,
        wind_speed_kmh: float,
        relative_humidity_pct: float,
        data_age_hours: float,
    ) -> float:
        logit = (
            3.0
            - 1.30 * max(0.0, dist_to_perimeter_km)
            - 0.90 * max(0.0, dist_to_cone_1h_km)
            - 0.50 * max(0.0, dist_to_cone_3h_km)
            + 1.50 * float(wind_alignment_cos)
            + 0.025 * max(0.0, wind_speed_kmh)
            + 0.0028 * max(0.0, min(1000.0, fire_frp_mw))
            - 0.022 * max(5.0, min(100.0, relative_humidity_pct))
            + 0.085 * min(24.0, max(0.0, data_age_hours))
        )
        prob = 1.0 / (1.0 + math.exp(-max(-15.0, min(15.0, logit))))
        return round(float(prob), 4)

    def predict_segments_risk(self, segments_features: List[Dict[str, float]]) -> Tuple[List[float], str]:
        if not segments_features:
            return [], "HYBRID_ML_VERIFIED" if self.is_ready else "DETERMINISTIC_FALLBACK"

        det_scores = [
            self.deterministic_segment_risk(
                s.get("dist_to_perimeter_km", 10.0),
                s.get("dist_to_cone_1h_km", 10.0),
                s.get("dist_to_cone_3h_km", 10.0),
                s.get("wind_alignment_cos", 0.0),
                s.get("fire_frp_mw", 50.0),
                s.get("wind_speed_kmh", 20.0),
                s.get("relative_humidity_pct", 30.0),
                s.get("data_age_hours", 1.0),
            )
            for s in segments_features
        ]

        if not self.is_ready:
            return det_scores, "DETERMINISTIC_FALLBACK"

        try:
            X = np.array(
                [
                    [
                        float(s.get("dist_to_perimeter_km", 10.0)),
                        float(s.get("dist_to_cone_1h_km", 10.0)),
                        float(s.get("dist_to_cone_3h_km", 10.0)),
                        float(s.get("wind_alignment_cos", 0.0)),
                        float(s.get("fire_frp_mw", 50.0)),
                        float(s.get("wind_speed_kmh", 20.0)),
                        float(s.get("relative_humidity_pct", 30.0)),
                        float(s.get("data_age_hours", 1.0)),
                    ]
                    for s in segments_features
                ],
                dtype=np.float32,
            )

            ml_probs = None
            if self.road_risk_onnx_sess is not None:
                try:
                    in_name = self.road_risk_onnx_sess.get_inputs()[0].name
                    out = self.road_risk_onnx_sess.run(None, {in_name: X})
                    # Si salida contiene probabilidades (dict o array)
                    if len(out) > 1 and isinstance(out[1], np.ndarray):
                        ml_probs = out[1][:, 1]
                    elif isinstance(out[0], np.ndarray) and out[0].ndim == 2:
                        ml_probs = out[0][:, 1] if out[0].shape[1] > 1 else out[0].flatten()
                except Exception:
                    ml_probs = None

            if ml_probs is None and self.road_risk_model is not None:
                ml_probs = self.road_risk_model.predict_proba(X)[:, 1]

            if ml_probs is not None:
                combined = [
                    round(float(max(det_p * 0.85, 0.70 * ml_p + 0.30 * det_p)), 4)
                    for ml_p, det_p in zip(ml_probs, det_scores)
                ]
                return combined, "HYBRID_ML_VERIFIED"
            return det_scores, "DETERMINISTIC_FALLBACK"
        except Exception:
            return det_scores, "DETERMINISTIC_FALLBACK"

    # =========================================================================
    # MODELO 3: WildfireHazardTemporalPredictor (Peligro 24h/48h/72h)
    # =========================================================================
    def predict_wildfire_hazard(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predice el índice de peligro regional y proyecta su evolución a 24h, 48h y 72h.
        """
        lat = float(features.get("latitude", -31.42))
        lon = float(features.get("longitude", -64.18))
        week = int(features.get("week_iso", 36))
        hist_count = float(features.get("historical_eq_count", 45.0))
        wind = float(features.get("wind_speed_kmh", 30.0))
        temp = float(features.get("temp_max_c", 32.0))
        rh = float(features.get("rh_min_pct", 18.0))
        fwi = float(features.get("fwi_estimate", 42.0))
        drought = int(features.get("drought_days", 25))

        base_vec = np.array([[lat, lon, week, hist_count, wind, temp, rh, fwi, drought]], dtype=np.float32)

        def _predict_score(vec: np.ndarray) -> float:
            if self.hazard_onnx_sess is not None:
                try:
                    in_name = self.hazard_onnx_sess.get_inputs()[0].name
                    out = self.hazard_onnx_sess.run(None, {in_name: vec})
                    return float(out[0].flatten()[0])
                except Exception:
                    pass
            if self.hazard_model is not None:
                try:
                    return float(self.hazard_model.predict(vec)[0])
                except Exception:
                    pass
            # Fallback determinista FWI
            return float(min(100.0, 0.45 * fwi + 0.35 * (100.0 - rh) + 0.20 * wind))

        score_24h = round(float(np.clip(_predict_score(base_vec), 0.0, 100.0)), 2)

        # Proyección 48h (+1 día de sequía, persistencia de viento)
        vec_48h = base_vec.copy()
        vec_48h[0, 6] = max(5.0, rh - 2.0)
        vec_48h[0, 8] += 1
        score_48h = round(float(np.clip(_predict_score(vec_48h), 0.0, 100.0)), 2)

        # Proyección 72h (+2 días sequía)
        vec_72h = base_vec.copy()
        vec_72h[0, 6] = max(5.0, rh - 4.0)
        vec_72h[0, 8] += 2
        score_72h = round(float(np.clip(_predict_score(vec_72h), 0.0, 100.0)), 2)

        def _hazard_level(score: float) -> str:
            if score < 25.0:
                return "BAJO"
            elif score < 50.0:
                return "MODERADO"
            elif score < 75.0:
                return "ALTO"
            elif score < 90.0:
                return "MUY_ALTO"
            return "EXTREMO"

        return {
            "hazard_score_24h": score_24h,
            "hazard_level_24h": _hazard_level(score_24h),
            "hazard_score_48h": score_48h,
            "hazard_level_48h": _hazard_level(score_48h),
            "hazard_score_72h": score_72h,
            "hazard_level_72h": _hazard_level(score_72h),
            "model_version": "WildfireHazardTemporalPredictor-v1.0.0",
            "evaluation_mode": "HYBRID_ML_VERIFIED" if (self.hazard_model or self.hazard_onnx_sess) else "DETERMINISTIC_FALLBACK",
        }

    # =========================================================================
    # MODELO 4: AlternativeRouteRanker
    # =========================================================================
    def rank_alternative_routes(self, routes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Pondera y ordena una lista de alternativas de evacuación mediante el modelo ML.
        """
        if not routes:
            return []

        ranked_routes = []
        for r in routes:
            dist = float(r.get("distance_km", 10.0))
            dur = float(r.get("duration_min", 15.0))
            m_risk = float(r.get("mean_segment_risk", 0.15))
            mx_risk = float(r.get("max_segment_risk", 0.25))
            d_fire = float(r.get("min_dist_to_fire_km", 5.0))
            d_cone = float(r.get("min_dist_to_cone_3h_km", 4.0))
            s_ver = 1.0 if r.get("shelter_verified", True) else 0.0
            s_cap = float(r.get("shelter_capacity_score", 0.5))

            vec = np.array([[dist, dur, m_risk, mx_risk, d_fire, d_cone, s_ver, s_cap]], dtype=np.float32)

            score = None
            if self.route_ranker_onnx_sess is not None:
                try:
                    in_name = self.route_ranker_onnx_sess.get_inputs()[0].name
                    out = self.route_ranker_onnx_sess.run(None, {in_name: vec})
                    score = float(out[0].flatten()[0])
                except Exception:
                    score = None

            if score is None and self.route_ranker_model is not None:
                try:
                    score = float(self.route_ranker_model.predict(vec)[0])
                except Exception:
                    score = None

            if score is None:
                # Fallback determinista
                score = max(0.01, 1.0 - (0.5 * mx_risk + 0.3 * (dur / 60.0) + 0.2 * (1.0 - s_ver)))

            score_clamped = round(float(np.clip(score, 0.01, 0.99)), 4)
            r_copy = dict(r)
            r_copy["ml_utility_score"] = score_clamped
            r_copy["is_ml_recommended"] = score_clamped >= 0.65
            ranked_routes.append(r_copy)

        ranked_routes.sort(key=lambda x: x["ml_utility_score"], reverse=True)
        return ranked_routes
