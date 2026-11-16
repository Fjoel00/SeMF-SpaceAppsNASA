#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Modelos de Dominio Geoespacial
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any


@dataclass
class ThermalPointModel:
    latitude: float
    longitude: float
    sensor_family: str
    satellite_name: str
    temp_ch4_k: float
    temp_ch5_k: float
    delta_temp_k: float
    frp_mw: float
    frp_harmonized_mw: float
    pixel_area_km2: float
    frp_density_mw_km2: float
    viirs_equiv_count: float
    confidence_cat: str
    confidence_score: float
    acq_datetime: str
    daynight: str
    scan_km: float
    track_km: float
    cluster_id: int = -1
    event_type: str = "Foco Aislado"
    is_synthetic: bool = False
    is_saturated_i4: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class FireEventModel:
    event_id: str
    event_type: str
    location_name: str
    province: str
    cluster_numeric_id: int
    centroid_lat: float
    centroid_lon: float
    points_count: int
    viirs_count: int
    modis_count: int
    multisensor_confirmed: bool
    satellites_involved: str
    frp_peak_mw: float
    frp_total_mw: float
    frp_max_mw: float
    frp_mean_mw: float
    frp_mean_density_mw_km2: float
    fre_est_mj: float
    temp_brightness_max_k: float
    mean_delta_temp_k: float
    detection_area_ha: float
    detection_area_km2: float
    first_detected: str
    last_detected: str
    duration_hours: float
    spread_vector_km: float
    spread_speed_kmh: float
    spread_azimuth_deg: Optional[float]
    spread_cardinal: str
    severity_level: str
    polygon_coords: List[List[float]] = field(default_factory=list)
    cone_1h_coords: List[List[float]] = field(default_factory=list)
    cone_3h_coords: List[List[float]] = field(default_factory=list)
    cone_6h_coords: List[List[float]] = field(default_factory=list)
    is_synthetic: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
