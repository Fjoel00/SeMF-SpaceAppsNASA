#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Clustering Espaciotemporal DBSCAN y Reconstrucción de Perímetros
===========================================================================
Agrupa anomalías térmicas en Frentes de Incendio Activos usando DBSCAN con
métrica geodésica Haversine y reconstruye envolventes métricas en EPSG:32720
(UTM Zona 20S), calculando superficie en hectáreas, FRP pico por pasada e
integración trapezoidal de Energía Radiativa del Fuego (FRE en MJ).
"""

import math
from typing import Dict, Any, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.spatial import ConvexHull
from sklearn.cluster import DBSCAN

from backend.app.geospatial.kinematics import compute_observed_kinematics
from backend.app.geospatial.zones import (
    EARTH_RADIUS_KM,
    polygon_area_km2_utm,
    resolve_toponym_and_province,
    utm20s_to_wgs84,
    wgs84_to_utm20s,
)


class FireEventClusterer:
    def __init__(self, eps_km: float = 2.5, min_samples: int = 2):
        self.eps_km = eps_km
        self.min_samples = min_samples

    def cluster_points(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df

        df_res = df.copy()
        coords_rad = np.radians(df_res[["latitude", "longitude"]].values)
        eps_rad = self.eps_km / EARTH_RADIUS_KM

        db = DBSCAN(eps=eps_rad, min_samples=self.min_samples, metric="haversine")
        df_res["cluster_id"] = db.fit_predict(coords_rad)
        df_res["event_type"] = np.where(df_res["cluster_id"] >= 0, "Frente Activo", "Foco Aislado")
        return df_res

    def compute_event_metrics(self, df_clustered: pd.DataFrame) -> pd.DataFrame:
        if df_clustered.empty:
            return pd.DataFrame()

        events: List[Dict[str, Any]] = []

        grouped = df_clustered[df_clustered["cluster_id"] >= 0].groupby("cluster_id")
        for cid, grp in grouped:
            events.append(self._process_cluster_group(int(cid), grp))

        isolated = df_clustered[df_clustered["cluster_id"] == -1]
        for idx, row in isolated.iterrows():
            cid_str = f"ISO_{row.name}"
            frp_val = round(float(row["frp_mw"]), 2)
            area_km2 = round(float(row["pixel_area_km2"]), 4)
            area_ha = round(area_km2 * 100.0, 2)
            temp_val = round(float(row["temp_ch4_k"]), 2)
            sat_name = str(row.get("satellite_name", row.get("satellite", "N/A")))
            iso_lat = round(float(row["latitude"]), 5)
            iso_lon = round(float(row["longitude"]), 5)
            loc_name, prov = resolve_toponym_and_province(iso_lat, iso_lon)
            iso_poly = self._generate_buffer_polygon_utm(iso_lat, iso_lon, area_km2)

            events.append({
                "event_id": cid_str,
                "event_type": "Foco Aislado",
                "location_name": loc_name,
                "province": prov,
                "cluster_numeric_id": -1,
                "centroid_lat": iso_lat,
                "centroid_lon": iso_lon,
                "points_count": 1,
                "viirs_count": 1 if row["sensor_family"] == "VIIRS" else 0,
                "modis_count": 1 if row["sensor_family"] == "MODIS" else 0,
                "multisensor_confirmed": False,
                "satellites_involved": sat_name,
                "frp_peak_mw": frp_val,
                "frp_total_mw": frp_val,
                "frp_max_mw": frp_val,
                "frp_mean_mw": frp_val,
                "frp_mean_density_mw_km2": round(float(row.get("frp_density_mw_km2", 0.0)), 2),
                "fre_est_mj": round(frp_val * 3600.0, 1),
                "temp_brightness_max_k": temp_val,
                "max_temp_k": temp_val,
                "mean_delta_temp_k": round(float(row["delta_temp_k"]), 2),
                "detection_area_km2": area_km2,
                "detection_area_ha": area_ha,
                "est_area_km2": area_km2,
                "est_area_ha": area_ha,
                "first_detected": row["acq_datetime"],
                "last_detected": row["acq_datetime"],
                "duration_hours": 0.0,
                "spread_vector_km": 0.0,
                "spread_speed_kmh": 0.0,
                "spread_azimuth_deg": None,
                "spread_cardinal": "Estacionario",
                "severity_level": self._classify_severity(frp_val),
                "polygon_coords": iso_poly,
                "is_synthetic": bool(row.get("is_synthetic", False)),
            })

        df_events = pd.DataFrame(events)
        if not df_events.empty:
            df_events = df_events.sort_values(by="frp_peak_mw", ascending=False).reset_index(drop=True)
        return df_events

    def _process_cluster_group(self, cid: int, grp: pd.DataFrame) -> Dict[str, Any]:
        lats = grp["latitude"].values
        lons = grp["longitude"].values
        cent_lat = float(np.mean(lats))
        cent_lon = float(np.mean(lons))
        loc_name, prov = resolve_toponym_and_province(cent_lat, cent_lon)

        pts_count = len(grp)
        viirs_count = int((grp["sensor_family"] == "VIIRS").sum())
        modis_count = int((grp["sensor_family"] == "MODIS").sum())
        multisensor = bool(viirs_count > 0 and modis_count > 0)

        sat_col = "satellite_name" if "satellite_name" in grp.columns else "satellite"
        sats = sorted(list(set(grp[sat_col].dropna().astype(str)))) if sat_col in grp.columns else []
        satellites_involved = ", ".join(sats) if sats else "N/A"

        frp_tot = float(grp["frp_mw"].sum())
        frp_max = float(grp["frp_mw"].max())
        frp_mean = float(grp["frp_mw"].mean())
        frp_mean_density = float(grp["frp_density_mw_km2"].mean()) if "frp_density_mw_km2" in grp.columns else 0.0
        max_temp = float(grp["temp_ch4_k"].max())
        mean_delta = float(grp["delta_temp_k"].mean())

        valid_time_grp = grp.dropna(subset=["acq_datetime"])
        if not valid_time_grp.empty:
            pass_frp = valid_time_grp.groupby("acq_datetime")["frp_mw"].sum()
            frp_peak_pass = float(pass_frp.max())
            if len(pass_frp) >= 2:
                times_sorted = sorted(pass_frp.index)
                fre_mj = 0.0
                for idx_t in range(len(times_sorted) - 1):
                    t1, t2 = times_sorted[idx_t], times_sorted[idx_t + 1]
                    dt_sec = (t2 - t1).total_seconds()
                    if 0 < dt_sec <= 36 * 3600:
                        fre_mj += 0.5 * (float(pass_frp[t1]) + float(pass_frp[t2])) * dt_sec
                if fre_mj <= 0.0:
                    fre_mj = frp_peak_pass * 3600.0
            else:
                fre_mj = frp_peak_pass * 3600.0
        else:
            frp_peak_pass = frp_max
            fre_mj = frp_max * 3600.0

        area_km2, poly_coords = self._calculate_convex_hull_utm(lats, lons)
        if area_km2 <= 0.0:
            area_km2 = float(grp["pixel_area_km2"].sum())
        if poly_coords is None:
            poly_coords = self._generate_buffer_polygon_utm(cent_lat, cent_lon, area_km2)

        spread_km, speed_kmh, azimuth, cardinal = compute_observed_kinematics(grp, cent_lat, cent_lon)

        dt_min = grp["acq_datetime"].min()
        dt_max = grp["acq_datetime"].max()
        duration_h = 0.0
        if pd.notna(dt_min) and pd.notna(dt_max) and dt_max > dt_min:
            duration_h = round((dt_max - dt_min).total_seconds() / 3600.0, 2)

        area_km2_r = round(area_km2, 3)
        area_ha_r = round(area_km2 * 100.0, 1)

        return {
            "event_id": f"FIRE_CLUSTER_{cid:03d}",
            "event_type": "Frente Activo",
            "location_name": loc_name,
            "province": prov,
            "cluster_numeric_id": int(cid),
            "centroid_lat": round(cent_lat, 5),
            "centroid_lon": round(cent_lon, 5),
            "points_count": pts_count,
            "viirs_count": viirs_count,
            "modis_count": modis_count,
            "multisensor_confirmed": multisensor,
            "satellites_involved": satellites_involved,
            "frp_peak_mw": round(frp_peak_pass, 2),
            "frp_total_mw": round(frp_tot, 2),
            "frp_max_mw": round(frp_max, 2),
            "frp_mean_mw": round(frp_mean, 2),
            "frp_mean_density_mw_km2": round(frp_mean_density, 2),
            "fre_est_mj": round(fre_mj, 1),
            "temp_brightness_max_k": round(max_temp, 2),
            "max_temp_k": round(max_temp, 2),
            "mean_delta_temp_k": round(mean_delta, 2),
            "detection_area_km2": area_km2_r,
            "detection_area_ha": area_ha_r,
            "est_area_km2": area_km2_r,
            "est_area_ha": area_ha_r,
            "first_detected": dt_min,
            "last_detected": dt_max,
            "duration_hours": duration_h,
            "spread_vector_km": spread_km,
            "spread_speed_kmh": speed_kmh,
            "spread_azimuth_deg": azimuth,
            "spread_cardinal": cardinal,
            "severity_level": self._classify_severity(frp_peak_pass),
            "polygon_coords": poly_coords,
            "is_synthetic": bool(grp["is_synthetic"].any()) if "is_synthetic" in grp.columns else False,
        }

    def _calculate_convex_hull_utm(
        self, lats: np.ndarray, lons: np.ndarray
    ) -> Tuple[float, Optional[List[List[float]]]]:
        if len(lats) < 3:
            return 0.0, None

        pts_utm = np.array([wgs84_to_utm20s(float(lat), float(lon)) for lat, lon in zip(lats, lons)])
        try:
            hull = ConvexHull(pts_utm)
            hull_indices = hull.vertices.tolist()
            hull_indices.append(hull_indices[0])
            poly_coords = [
                [round(float(lats[i]), 5), round(float(lons[i]), 5)] for i in hull_indices
            ]
            area_km2 = polygon_area_km2_utm(poly_coords)
            return max(0.02, area_km2), poly_coords
        except Exception:
            return 0.0, None

    @staticmethod
    def _generate_buffer_polygon_utm(
        cent_lat: float, cent_lon: float, area_km2: float, num_sides: int = 16
    ) -> List[List[float]]:
        area = max(0.04, float(area_km2))
        radius_m = max(220.0, min(math.sqrt(area / math.pi) * 1000.0, 4000.0))
        cx, cy = wgs84_to_utm20s(cent_lat, cent_lon)

        coords = []
        for i in range(num_sides):
            angle = 2.0 * math.pi * i / num_sides
            px = cx + radius_m * math.cos(angle)
            py = cy + radius_m * math.sin(angle)
            lat, lon = utm20s_to_wgs84(px, py)
            coords.append([round(lat, 5), round(lon, 5)])

        coords.append(coords[0])
        return coords

    @staticmethod
    def _classify_severity(frp_peak_mw: float) -> str:
        if frp_peak_mw >= 300.0:
            return "Crítico (Megaincendio)"
        if frp_peak_mw >= 100.0:
            return "Severidad Alta"
        if frp_peak_mw >= 25.0:
            return "Severidad Moderada"
        return "Severidad Baja"
