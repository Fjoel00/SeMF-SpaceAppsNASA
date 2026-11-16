#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Puntuador de Riesgo Vial mediante Machine Learning (Por Segmento)
============================================================================
Consume los segmentos validados por SafetyValidator, ejecuta inferencia en lote
con RoadSegmentRiskClassifier y construye el perfil longitudinal de riesgo y el
costo compuesto de cada ruta alternativa.
"""

from typing import Dict, Any, List
from ml.inference.predictor import MLRiskPredictor


class MLRiskScorer:
    def __init__(self, predictor: MLRiskPredictor):
        self.predictor = predictor

    def score_route_segments(
        self,
        route_candidate: Dict[str, Any],
        geom_eval: Dict[str, Any],
        shelter: Dict[str, Any],
    ) -> Dict[str, Any]:
        segments: List[Dict[str, Any]] = geom_eval.get("segments", [])
        if not segments:
            return {
                "ml_evaluation_mode": "HYBRID_ML_VERIFIED" if self.predictor.is_ready else "DETERMINISTIC_FALLBACK",
                "mean_ml_risk_score": 0.0,
                "max_ml_risk_score": 0.0,
                "dangerous_segments_count": 0,
                "dangerous_segments": [],
                "effective_penalized_minutes": float(route_candidate.get("base_duration_min", 10.0)),
                "proximity_profile": [],
                "enriched_segments": [],
            }

        probs, mode = self.predictor.predict_segments_risk(segments)
        enriched_segments = []
        dangerous_segments = []
        proximity_profile = []

        total_length = max(0.01, sum(float(s["length_km"]) for s in segments))
        base_dur_min = float(route_candidate.get("base_duration_min", 10.0))
        penalized_minutes = 0.0
        weighted_risk_sum = 0.0
        max_risk = 0.0

        for seg, prob in zip(segments, probs):
            seg_copy = dict(seg)
            det_status = seg_copy["deterministic_status"]
            # Si el validador determinista ya marcó BLOCKED, la probabilidad efectiva de peligro es 1.0
            effective_prob = 1.0 if det_status == "BLOCKED" else round(float(prob), 4)
            seg_copy["ml_risk_probability"] = effective_prob

            if det_status == "BLOCKED":
                risk_tier = "BLOCKED"
            elif det_status == "WARNING" or effective_prob >= 0.48:
                risk_tier = "WARNING"
            else:
                risk_tier = "SAFE"

            seg_copy["combined_tier"] = risk_tier
            enriched_segments.append(seg_copy)

            if risk_tier in ("WARNING", "BLOCKED"):
                dangerous_segments.append({
                    "segment_index": seg_copy["segment_index"],
                    "km_mark": seg_copy["km_mark"],
                    "length_km": seg_copy["length_km"],
                    "tier": risk_tier,
                    "ml_risk_probability": effective_prob,
                    "dist_to_perimeter_km": seg_copy["dist_to_perimeter_km"],
                    "nearest_fire_id": seg_copy["nearest_fire_id"],
                    "start_coord": seg_copy["start_coord"],
                    "end_coord": seg_copy["end_coord"],
                })

            proximity_profile.append({
                "km_mark": seg_copy["km_mark"],
                "dist_to_fire_km": round(min(25.0, float(seg_copy["dist_to_perimeter_km"])), 2),
                "ml_risk_pct": round(effective_prob * 100.0, 1),
                "tier": risk_tier,
            })

            seg_time = base_dur_min * (float(seg_copy["length_km"]) / total_length)
            warning_penalty = 0.85 if det_status == "WARNING" else 0.0
            ml_penalty = 2.4 * (effective_prob ** 2)
            penalized_minutes += seg_time * (1.0 + warning_penalty + ml_penalty)

            weighted_risk_sum += effective_prob * float(seg_copy["length_km"])
            if effective_prob > max_risk:
                max_risk = effective_prob

        # Penalización adicional si el refugio destino no tiene información verificada
        if not shelter.get("is_verified_reliable", True):
            penalized_minutes += 25.0

        mean_risk = round(weighted_risk_sum / total_length, 4)

        return {
            "ml_evaluation_mode": mode,
            "mean_ml_risk_score": mean_risk,
            "max_ml_risk_score": round(max_risk, 4),
            "dangerous_segments_count": len(dangerous_segments),
            "dangerous_segments": dangerous_segments,
            "effective_penalized_minutes": round(penalized_minutes, 2),
            "proximity_profile": proximity_profile,
            "enriched_segments": enriched_segments,
        }
