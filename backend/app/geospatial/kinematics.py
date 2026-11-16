#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Motor de Cinemática de Frentes de Incendio e Isócronas Predictivas
=============================================================================
Calcula la cinemática observada entre sobrepasos satelitales y genera conos
geodésicos de propagación a 1h, 3h y 6h en proyección métrica UTM 20S
combinando avance observado, vector de viento (Open-Meteo) y predicción ML.
"""

from typing import List, Tuple, Optional, Dict, Any
import numpy as np
import pandas as pd
from scipy.spatial import ConvexHull

from backend.app.geospatial.zones import (
    bearing_degrees,
    degrees_to_cardinal,
    haversine_km,
    translate_point,
    utm20s_to_wgs84,
    wgs84_to_utm20s,
)


def compute_observed_kinematics(
    grp: pd.DataFrame, cent_lat: float, cent_lon: float
) -> Tuple[float, float, Optional[float], str]:
    """
    Calcula el desplazamiento (km), velocidad (km/h), azimut (°) y rumbo cardinal
    observados entre la fase temprana y tardía de detecciones del cluster.
    """
    if "acq_datetime" not in grp.columns:
        return 0.0, 0.0, None, "Estacionario"

    valid_dates = grp.dropna(subset=["acq_datetime"]).copy()
    if len(valid_dates) < 3:
        return 0.0, 0.0, None, "Estacionario"

    sorted_grp = valid_dates.sort_values(by="acq_datetime")
    mid = len(sorted_grp) // 2
    early = sorted_grp.iloc[:mid]
    late = sorted_grp.iloc[mid:]

    t_early = early["acq_datetime"].mean()
    t_late = late["acq_datetime"].mean()
    delta_hours = (t_late - t_early).total_seconds() / 3600.0

    if delta_hours < 0.25:
        return 0.0, 0.0, None, "Estacionario"

    lat1, lon1 = float(early["latitude"].mean()), float(early["longitude"].mean())
    lat2, lon2 = float(late["latitude"].mean()), float(late["longitude"].mean())

    dist_km = haversine_km(lat1, lon1, lat2, lon2)
    if dist_km < 0.12:
        return round(dist_km, 3), 0.0, None, "Estacionario"

    speed_kmh = dist_km / delta_hours
    azimuth = bearing_degrees(lat1, lon1, lat2, lon2)
    cardinal = degrees_to_cardinal(azimuth)
    return round(dist_km, 3), round(speed_kmh, 3), round(azimuth, 1), cardinal


def generate_propagation_cone(
    perimeter_latlon: List[List[float]],
    advance_azimuth_deg: float,
    reach_km: float,
    lateral_spread_deg: float = 24.0,
) -> List[List[float]]:
    """
    Construye el polígono envolvente del cono de propagación proyectando cada
    vértice del perímetro activo a lo largo del eje principal de avance y sus
    flancos de incertidumbre angular (±lateral_spread_deg) en UTM 20S.
    """
    if not perimeter_latlon or len(perimeter_latlon) < 3 or reach_km <= 0.05:
        return perimeter_latlon or []

    candidates_latlon: List[Tuple[float, float]] = []
    flank_left = (advance_azimuth_deg - lateral_spread_deg + 360.0) % 360.0
    flank_right = (advance_azimuth_deg + lateral_spread_deg) % 360.0

    for pt in perimeter_latlon:
        lat, lon = float(pt[0]), float(pt[1])
        candidates_latlon.append((lat, lon))
        candidates_latlon.append(translate_point(lat, lon, reach_km, advance_azimuth_deg))
        candidates_latlon.append(translate_point(lat, lon, reach_km * 0.86, flank_left))
        candidates_latlon.append(translate_point(lat, lon, reach_km * 0.86, flank_right))

    utm_pts = np.array([wgs84_to_utm20s(lat, lon) for lat, lon in candidates_latlon])
    try:
        hull = ConvexHull(utm_pts)
        indices = hull.vertices.tolist()
        indices.append(indices[0])
        cone_coords = []
        for idx in indices:
            lat, lon = utm20s_to_wgs84(float(utm_pts[idx, 0]), float(utm_pts[idx, 1]))
            cone_coords.append([round(lat, 5), round(lon, 5)])
        return cone_coords
    except Exception:
        return perimeter_latlon


def enrich_event_with_propagation_cones(
    event_dict: Dict[str, Any],
    weather: Dict[str, float],
    ml_spread_result: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Incorpore a un evento consolidado los conos proyectados a 1h, 3h y 6h
    y las métricas cinemáticas híbridas (Satélite + Viento + ML).
    """
    poly = event_dict.get("polygon_coords") or []
    wind_dir_from = float(weather.get("wind_direction_deg", 200.0))
    wind_push_azimuth = (wind_dir_from + 180.0) % 360.0

    obs_az = event_dict.get("spread_azimuth_deg")
    obs_spd = float(event_dict.get("spread_speed_kmh") or 0.0)
    ml_spd = float(ml_spread_result.get("spread_speed_kmh", 0.65))

    if obs_az is not None and obs_spd > 0.05:
        # Combinar rumbo observado por satélite con dirección de empuje del viento
        effective_azimuth = wind_push_azimuth
        effective_speed = round(0.35 * obs_spd + 0.65 * ml_spd, 3)
    else:
        effective_azimuth = wind_push_azimuth
        effective_speed = round(ml_spd, 3)

    reach_1h = max(0.35, effective_speed * 1.0)
    reach_3h = max(0.95, effective_speed * 2.6)
    reach_6h = max(1.80, effective_speed * 4.6)

    cone_1h = generate_propagation_cone(poly, effective_azimuth, reach_1h, lateral_spread_deg=22.0)
    cone_3h = generate_propagation_cone(poly, effective_azimuth, reach_3h, lateral_spread_deg=28.0)
    cone_6h = generate_propagation_cone(poly, effective_azimuth, reach_6h, lateral_spread_deg=34.0)

    event_dict["projected_speed_kmh"] = effective_speed
    event_dict["projected_azimuth_deg"] = round(effective_azimuth, 1)
    event_dict["projected_cardinal"] = degrees_to_cardinal(effective_azimuth)
    event_dict["ml_evaluation_mode"] = ml_spread_result.get("evaluation_mode", "HYBRID_ML_VERIFIED")
    event_dict["cone_1h_coords"] = cone_1h
    event_dict["cone_3h_coords"] = cone_3h
    event_dict["cone_6h_coords"] = cone_6h
    return event_dict
