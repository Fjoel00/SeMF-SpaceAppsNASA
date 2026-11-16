#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Orquestador Central de Inteligencia Satelital, Geoespacial y Rutas
=============================================================================
Coordina todos los servicios de dominio:
- Ingesta y armonización física MODIS/VIIRS.
- Clustering DBSCAN Haversine + proyección métrica EPSG:32720 + isócronas 1h/3h/6h.
- Telemetría meteorológica Open-Meteo y detección 30-30-30.
- Simulación de escenarios tácticos aislados.
- Consultas sobre el catálogo de refugios con auditoría de proximidad al fuego.
- Cálculo de rutas de evacuación inteligentes (OSRM + SafetyValidator + ML).
- Generación de exportaciones abiertas GeoJSON (OGC RFC 7946) y CSV.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import pandas as pd

from backend.app.core.config import settings
from backend.app.core.database import db_manager
from backend.app.geospatial.clustering import FireEventClusterer
from backend.app.geospatial.kinematics import enrich_event_with_propagation_cones
from backend.app.geospatial.zones import (
    degrees_to_cardinal,
    haversine_km,
    resolve_toponym_and_province,
)
from backend.app.routing.engine import IntelligentEvacuationEngine
from backend.app.services.firms_ingestor import FIRMSDataIngestor
from backend.app.services.harmonizer import ModisViirsHarmonizer
from backend.app.services.historical_service import historical_service
from backend.app.services.weather_service import WeatherService
from ml.inference.predictor import MLRiskPredictor


class PlatformOrchestrator:
    def __init__(self):
        self.ml_predictor = MLRiskPredictor()
        self.ingestor = FIRMSDataIngestor()
        self.harmonizer = ModisViirsHarmonizer()
        self.routing_engine = IntelligentEvacuationEngine(self.ml_predictor)
        self._active_state: Dict[str, Any] = {}
        self.refresh_active_fires(force_synthetic=settings.use_synthetic_data)

    def refresh_active_fires(
        self,
        bbox: Optional[str] = None,
        day_range: Optional[int] = None,
        force_synthetic: bool = False,
    ) -> Dict[str, Any]:
        target_bbox = bbox or settings.default_bbox
        target_days = day_range or settings.default_day_range

        if force_synthetic:
            df_raw = self.ingestor.generate_calibrated_fallback(target_bbox)
        else:
            df_raw = self.ingestor.fetch_all(area=target_bbox, day_range=target_days, use_cache=True)
            if df_raw.empty:
                df_raw = self.ingestor.generate_calibrated_fallback(target_bbox)

        df_clean = self.harmonizer.harmonize(df_raw)
        clusterer = FireEventClusterer(
            eps_km=settings.dbscan_eps_km,
            min_samples=settings.dbscan_min_samples,
        )
        df_clustered = clusterer.cluster_points(df_clean)
        df_events = clusterer.compute_event_metrics(df_clustered)
        cross_calib = self.harmonizer.compute_cross_sensor_calibration(df_clustered)

        # Obtener clima de referencia para el frente principal
        if not df_events.empty:
            lead_lat = float(df_events.iloc[0]["centroid_lat"])
            lead_lon = float(df_events.iloc[0]["centroid_lon"])
        else:
            lead_lat, lead_lon = -33.255, -65.953

        weather = WeatherService.get_weather_for_coordinates(lead_lat, lead_lon)

        events_list: List[Dict[str, Any]] = []
        if not df_events.empty:
            for _, row in df_events.iterrows():
                ev_dict = {
                    "event_id": str(row["event_id"]),
                    "event_type": str(row["event_type"]),
                    "location_name": str(row["location_name"]),
                    "province": str(row["province"]),
                    "cluster_numeric_id": int(row["cluster_numeric_id"]),
                    "centroid_lat": float(row["centroid_lat"]),
                    "centroid_lon": float(row["centroid_lon"]),
                    "points_count": int(row["points_count"]),
                    "viirs_count": int(row["viirs_count"]),
                    "modis_count": int(row["modis_count"]),
                    "multisensor_confirmed": bool(row["multisensor_confirmed"]),
                    "satellites_involved": str(row["satellites_involved"]),
                    "frp_peak_mw": float(row["frp_peak_mw"]),
                    "frp_total_mw": float(row["frp_total_mw"]),
                    "frp_max_mw": float(row["frp_max_mw"]),
                    "frp_mean_density_mw_km2": float(row["frp_mean_density_mw_km2"]),
                    "fre_est_mj": float(row["fre_est_mj"]),
                    "temp_brightness_max_k": float(row["temp_brightness_max_k"]),
                    "mean_delta_temp_k": float(row["mean_delta_temp_k"]),
                    "detection_area_ha": float(row["detection_area_ha"]),
                    "detection_area_km2": float(row["detection_area_km2"]),
                    "first_detected": str(row["first_detected"]),
                    "last_detected": str(row["last_detected"]),
                    "duration_hours": float(row["duration_hours"]),
                    "spread_vector_km": float(row["spread_vector_km"]),
                    "spread_speed_kmh": float(row["spread_speed_kmh"]),
                    "spread_azimuth_deg": (
                        float(row["spread_azimuth_deg"]) if pd.notna(row["spread_azimuth_deg"]) else None
                    ),
                    "spread_cardinal": str(row["spread_cardinal"]),
                    "severity_level": str(row["severity_level"]),
                    "polygon_coords": row["polygon_coords"],
                    "is_synthetic": bool(row.get("is_synthetic", False)),
                }

                ml_spread = self.ml_predictor.predict_fire_spread({
                    "frp_peak_mw": ev_dict["frp_peak_mw"],
                    "frp_density_mw_km2": ev_dict["frp_mean_density_mw_km2"],
                    "delta_temp_k": ev_dict["mean_delta_temp_k"],
                    "points_count": ev_dict["points_count"],
                    "wind_speed_kmh": weather["wind_speed_kmh"],
                    "relative_humidity_pct": weather["relative_humidity_pct"],
                    "temperature_c": weather["temperature_c"],
                    "seasonal_z_score": 1.2,
                })
                enrich_event_with_propagation_cones(ev_dict, weather, ml_spread)
                events_list.append(ev_dict)

        points_list: List[Dict[str, Any]] = []
        if not df_clustered.empty:
            for idx, pt in df_clustered.iterrows():
                points_list.append({
                    "point_id": f"PT_{idx:04d}",
                    "latitude": round(float(pt["latitude"]), 5),
                    "longitude": round(float(pt["longitude"]), 5),
                    "sensor_family": str(pt["sensor_family"]),
                    "satellite_name": str(pt["satellite_name"]),
                    "temp_ch4_k": round(float(pt["temp_ch4_k"]), 2),
                    "temp_ch5_k": round(float(pt["temp_ch5_k"]), 2),
                    "delta_temp_k": round(float(pt["delta_temp_k"]), 2),
                    "is_saturated_i4": bool(pt.get("is_saturated_i4", False)),
                    "frp_mw": round(float(pt["frp_mw"]), 2),
                    "frp_harmonized_mw": round(float(pt["frp_harmonized_mw"]), 2),
                    "pixel_area_km2": round(float(pt["pixel_area_km2"]), 4),
                    "frp_density_mw_km2": round(float(pt["frp_density_mw_km2"]), 2),
                    "viirs_equiv_count": round(float(pt["viirs_equiv_count"]), 2),
                    "confidence_cat": str(pt["confidence_cat"]),
                    "confidence_score": round(float(pt["confidence_score"]), 2),
                    "acq_datetime": str(pt["acq_datetime"]),
                    "daynight": str(pt.get("daynight", "D")),
                    "scan_km": round(float(pt["scan_km"]), 2),
                    "track_km": round(float(pt["track_km"]), 2),
                    "cluster_id": int(pt.get("cluster_id", -1)),
                    "is_synthetic": bool(pt.get("is_synthetic", False)),
                })

        # Serie temporal por pasada satelital
        temporal_series = []
        if not df_clustered.empty and "acq_datetime" in df_clustered.columns:
            valid_t = df_clustered.dropna(subset=["acq_datetime"]).copy()
            if not valid_t.empty:
                valid_t["pass_hour"] = valid_t["acq_datetime"].dt.strftime("%Y-%m-%d %H:00")
                grouped_t = (
                    valid_t.groupby(["pass_hour", "sensor_family"])
                    .agg(
                        detections=("frp_mw", "count"),
                        pass_frp_mw=("frp_mw", "sum"),
                        max_brightness_k=("temp_ch4_k", "max"),
                    )
                    .reset_index()
                )
                for _, trow in grouped_t.iterrows():
                    temporal_series.append({
                        "timestamp_hour_utc": str(trow["pass_hour"]),
                        "sensor_family": str(trow["sensor_family"]),
                        "detections": int(trow["detections"]),
                        "pass_frp_mw": round(float(trow["pass_frp_mw"]), 2),
                        "max_brightness_k": round(float(trow["max_brightness_k"]), 2),
                    })

        active_fronts = [e for e in events_list if e["cluster_numeric_id"] >= 0]
        isolated_cnt = len(events_list) - len(active_fronts)
        total_pts = len(points_list)
        viirs_cnt = sum(1 for p in points_list if p["sensor_family"] == "VIIRS")
        modis_cnt = sum(1 for p in points_list if p["sensor_family"] == "MODIS")
        harm_eq = round(sum(p["viirs_equiv_count"] for p in points_list), 1)
        peak_frp = max((e["frp_peak_mw"] for e in events_list), default=0.0)
        total_fre = round(sum(e["fre_est_mj"] for e in events_list), 1)
        total_area_ha = round(sum(e["detection_area_ha"] for e in active_fronts), 1)
        multisensor_cnt = sum(1 for e in active_fronts if e["multisensor_confirmed"])

        sat_counts: Dict[str, int] = {}
        for p in points_list:
            s = p["satellite_name"]
            sat_counts[s] = sat_counts.get(s, 0) + 1
        sat_breakdown = {
            k: {
                "count": v,
                "percentage": round((v / max(1, total_pts)) * 100.0, 2),
            }
            for k, v in sorted(sat_counts.items(), key=lambda item: item[1], reverse=True)
        }

        payload = {
            "metadata": {
                "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "bbox": target_bbox,
                "day_range": target_days,
                "is_synthetic": bool(any(p["is_synthetic"] for p in points_list)),
                "total_detections": total_pts,
                "active_fronts_count": len(active_fronts),
                "isolated_hotspots_count": isolated_cnt,
                "dbscan_eps_km": settings.dbscan_eps_km,
            },
            "kpis": {
                "viirs_detections": viirs_cnt,
                "modis_detections": modis_cnt,
                "harmonized_equivalent_detections": harm_eq,
                "peak_pass_frp_mw": round(peak_frp, 2),
                "total_estimated_fre_mj": total_fre,
                "total_estimated_fre_gj": round(total_fre / 1000.0, 2),
                "total_detection_envelope_ha": total_area_ha,
                "multisensor_confirmed_fronts": multisensor_cnt,
                "viirs_i4_saturated_count": sum(1 for p in points_list if p["is_saturated_i4"]),
            },
            "weather": weather,
            "satellite_breakdown": sat_breakdown,
            "temporal_series": temporal_series,
            "cross_sensor_calibration": cross_calib,
            "events": events_list,
            "points": points_list,
        }

        self._active_state = payload
        db_manager.save_active_fires_snapshot(payload)
        return payload

    def get_active_fires(self) -> Dict[str, Any]:
        if not self._active_state:
            return self.refresh_active_fires()
        return self._active_state

    def get_shelters_with_threat_audit(self) -> Dict[str, Any]:
        shelters = db_manager.load_shelters()
        fires = self.get_active_fires().get("events", [])
        audited = []
        open_count = 0
        compromised_count = 0

        for sh in shelters:
            comp, min_d, nearest_id = self.routing_engine.is_shelter_compromised(
                sh, fires, settings.default_safety_buffer_km
            )
            sh_copy = dict(sh)
            sh_copy["is_threatened_by_fire"] = comp
            sh_copy["nearest_fire_distance_km"] = min_d
            sh_copy["nearest_fire_id"] = nearest_id
            if comp:
                sh_copy["effective_status"] = "COMPROMISED"
                compromised_count += 1
            else:
                sh_copy["effective_status"] = sh.get("operational_status", "OPEN")
                open_count += 1
            audited.append(sh_copy)

        audited.sort(key=lambda x: (0 if x.get("is_verified_reliable", True) else 1, -x["capacity_persons"]))
        return {
            "total_shelters": len(audited),
            "operational_safe_count": open_count,
            "compromised_count": compromised_count,
            "verified_count": sum(1 for s in audited if s.get("is_verified_reliable", True)),
            "shelters": audited,
        }

    def get_dashboard_summary(self) -> Dict[str, Any]:
        fires_data = self.get_active_fires()
        shelters_data = self.get_shelters_with_threat_audit()
        hist_summary = historical_service.query_calendar(mode="annual", year=2025, selected_week=36)
        ml_models = self.ml_predictor.get_models_metadata()

        return {
            "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "metadata": fires_data["metadata"],
            "kpis": fires_data["kpis"],
            "weather": fires_data["weather"],
            "satellite_breakdown": fires_data["satellite_breakdown"],
            "temporal_series": fires_data["temporal_series"],
            "cross_sensor_calibration": fires_data["cross_sensor_calibration"],
            "top_active_events": fires_data["events"][:6],
            "shelters_summary": {
                "total": shelters_data["total_shelters"],
                "operational_safe": shelters_data["operational_safe_count"],
                "compromised": shelters_data["compromised_count"],
                "verified": shelters_data["verified_count"],
            },
            "historical_context": hist_summary["kpis"],
            "ml_status": {
                "models_loaded": self.ml_predictor.is_ready,
                "active_models_count": len(ml_models),
                "models": [
                    {
                        "model_id": m["model_id"],
                        "version": m["version"],
                        "algorithm": m["selected_algorithm"],
                        "metrics": m["metrics"],
                    }
                    for m in ml_models
                ],
            },
        }

    def simulate_operational_scenario(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Construye frentes de incendio e isócronas para el modo de Simulación /
        Inyección Operativa sin alterar los registros reales satelitales.
        """
        injected_list = payload.get("injected_fires", [])
        weather_override = payload.get("weather") or {}
        weather = WeatherService.get_weather_for_coordinates(
            lat=-33.255, lon=-65.953, custom_override=weather_override
        )

        sim_events = []
        for idx, item in enumerate(injected_list):
            lat = float(item.get("lat", -33.22))
            lon = float(item.get("lon", -65.95))
            severity = str(item.get("severity", "critical")).lower()
            loc_name, prov = resolve_toponym_and_province(lat, lon)

            if severity == "catastrophic":
                frp_mw, area_ha = 750.0, 920.0
                sev_label = "Crítico (Megaincendio)"
            elif severity == "moderate":
                frp_mw, area_ha = 120.0, 140.0
                sev_label = "Severidad Moderada"
            else:
                frp_mw, area_ha = 360.0, 380.0
                sev_label = "Severidad Alta"

            poly = FireEventClusterer._generate_buffer_polygon_utm(lat, lon, area_ha / 100.0)
            ev_dict = {
                "event_id": item.get("event_id") or f"SIM_FIRE_{idx + 1:03d}",
                "event_type": "Frente Simulado (Inyección Operativa)",
                "location_name": f"{loc_name} [Simulación]",
                "province": prov,
                "cluster_numeric_id": 100 + idx,
                "centroid_lat": round(lat, 5),
                "centroid_lon": round(lon, 5),
                "points_count": 8,
                "viirs_count": 6,
                "modis_count": 2,
                "multisensor_confirmed": True,
                "satellites_involved": "Simulador Táctico SeMF 2.0",
                "frp_peak_mw": frp_mw,
                "frp_total_mw": frp_mw * 1.4,
                "frp_max_mw": frp_mw,
                "frp_mean_density_mw_km2": round(frp_mw / 1.2, 2),
                "fre_est_mj": round(frp_mw * 3600.0, 1),
                "temp_brightness_max_k": 367.0,
                "mean_delta_temp_k": 48.5,
                "detection_area_ha": area_ha,
                "detection_area_km2": round(area_ha / 100.0, 2),
                "first_detected": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                "last_detected": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                "duration_hours": 1.5,
                "spread_vector_km": 1.2,
                "spread_speed_kmh": 0.0,
                "spread_azimuth_deg": None,
                "spread_cardinal": degrees_to_cardinal(weather["wind_push_azimuth_deg"]),
                "severity_level": sev_label,
                "polygon_coords": poly,
                "is_synthetic": True,
                "is_simulated": True,
            }

            ml_spread = self.ml_predictor.predict_fire_spread({
                "frp_peak_mw": frp_mw,
                "frp_density_mw_km2": ev_dict["frp_mean_density_mw_km2"],
                "delta_temp_k": 48.5,
                "points_count": 8,
                "wind_speed_kmh": weather["wind_speed_kmh"],
                "relative_humidity_pct": weather["relative_humidity_pct"],
                "temperature_c": weather["temperature_c"],
                "seasonal_z_score": 1.8,
            })
            enrich_event_with_propagation_cones(ev_dict, weather, ml_spread)
            sim_events.append(ev_dict)

        return {
            "simulation_active": True,
            "weather": weather,
            "events": sim_events,
        }

    def export_active_geojson(self) -> Dict[str, Any]:
        """Exporta frentes e isócronas en formato estándar OGC GeoJSON (RFC 7946)."""
        events = self.get_active_fires().get("events", [])
        features = []
        for ev in events:
            poly = ev.get("polygon_coords") or []
            if len(poly) >= 3:
                coords_lonlat = [[round(float(p[1]), 5), round(float(p[0]), 5)] for p in poly]
                props = {k: v for k, v in ev.items() if not k.endswith("_coords")}
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [coords_lonlat]},
                    "properties": props,
                })
        return {
            "type": "FeatureCollection",
            "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
            "features": features,
        }


orchestrator = PlatformOrchestrator()
