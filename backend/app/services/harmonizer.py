#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Motor Científico de Armonización Física Multi-Sensor (MODIS & VIIRS)
===============================================================================
Normaliza y unifica física y estadísticamente las detecciones MODIS (1 km) y
VIIRS (375 m):
1) Unifica canales térmicos MIR (~4 µm) y TIR (~11 µm).
2) Calcula la anomalía térmica de combustión (ΔT = T4 - T5) y detecta saturación
   física del canal I4 de VIIRS (≥ 366.5 K).
3) Calcula la huella real proyectada (scan_km × track_km) y la Densidad de
   Potencia Radiativa (MW/km²).
4) Estandariza escalas de confianza (0-100% vs l/n/h) a categoría + score [0, 1].
5) Calcula el factor de equivalencia inter-sensor VIIRS/MODIS.
"""

import math
from datetime import datetime
from typing import Tuple, Dict, Any

import numpy as np
import pandas as pd


class ModisViirsHarmonizer:
    SAT_MAP = {
        "N20": "NOAA-20",
        "1": "NOAA-20",
        "J1": "NOAA-20",
        "NOAA-20": "NOAA-20",
        "N21": "NOAA-21",
        "2": "NOAA-21",
        "J2": "NOAA-21",
        "NOAA-21": "NOAA-21",
        "N": "Suomi-NPP",
        "SNPP": "Suomi-NPP",
        "SUOMI-NPP": "Suomi-NPP",
        "TERRA": "Terra",
        "T": "Terra",
        "AQUA": "Aqua",
        "A": "Aqua",
    }

    @staticmethod
    def _map_confidence_row(val: Any) -> Tuple[str, float]:
        if pd.isna(val):
            return "Nominal", 0.50
        s_val = str(val).strip().lower()
        if s_val in ("h", "high"):
            return "High", 0.95
        if s_val in ("n", "nominal"):
            return "Nominal", 0.65
        if s_val in ("l", "low"):
            return "Low", 0.30
        try:
            num = float(s_val)
            score = round(max(0.0, min(1.0, num / 100.0)), 2)
            if num >= 80.0:
                return "High", score
            if num >= 30.0:
                return "Nominal", score
            return "Low", score
        except ValueError:
            return "Nominal", 0.50

    def harmonize(self, df_raw: pd.DataFrame) -> pd.DataFrame:
        if df_raw.empty:
            return pd.DataFrame()

        df = df_raw.copy()

        # 1. Identificación vectorizada de familia de sensor
        if "sensor_family" not in df.columns:
            inst = df["instrument"].astype(str).str.upper() if "instrument" in df.columns else pd.Series("", index=df.index)
            src = df["sensor_source"].astype(str).str.upper() if "sensor_source" in df.columns else pd.Series("", index=df.index)
            sat = df["satellite"].astype(str).str.strip().str.upper() if "satellite" in df.columns else pd.Series("", index=df.index)
            has_ti4 = df["bright_ti4"].notna() if "bright_ti4" in df.columns else pd.Series(False, index=df.index)

            is_viirs = (
                inst.str.contains("VIIRS", na=False)
                | src.str.contains("VIIRS", na=False)
                | sat.isin(["N", "N20", "N21", "J1", "J2", "NOAA-20", "NOAA-21", "SNPP"])
                | has_ti4
            )
            df["sensor_family"] = np.where(is_viirs, "VIIRS", "MODIS")

        if "satellite" in df.columns:
            df["satellite_name"] = (
                df["satellite"]
                .astype(str)
                .str.strip()
                .str.upper()
                .map(lambda x: self.SAT_MAP.get(x, x))
            )
        else:
            df["satellite_name"] = df["sensor_family"]

        # 2. Unificación de canales térmicos ~4 µm (MIR) y ~11 µm (TIR)
        col_t4_viirs = pd.to_numeric(df["bright_ti4"], errors="coerce") if "bright_ti4" in df.columns else pd.Series(np.nan, index=df.index)
        col_t4_modis = pd.to_numeric(df["brightness"], errors="coerce") if "brightness" in df.columns else pd.Series(np.nan, index=df.index)
        df["temp_ch4_k"] = col_t4_viirs.combine_first(col_t4_modis)

        col_t5_viirs = pd.to_numeric(df["bright_ti5"], errors="coerce") if "bright_ti5" in df.columns else pd.Series(np.nan, index=df.index)
        col_t5_modis = pd.to_numeric(df["bright_t31"], errors="coerce") if "bright_t31" in df.columns else pd.Series(np.nan, index=df.index)
        df["temp_ch5_k"] = col_t5_viirs.combine_first(col_t5_modis)

        df["delta_temp_k"] = (df["temp_ch4_k"] - df["temp_ch5_k"]).round(2)
        df["is_saturated_i4"] = (df["sensor_family"] == "VIIRS") & (df["temp_ch4_k"] >= 366.5)

        # 3. Huella espacial proyectada y Densidad Radiativa (MW/km²)
        nominal_dim = np.where(df["sensor_family"] == "VIIRS", 0.375, 1.0)
        scan_s = pd.to_numeric(df["scan"], errors="coerce") if "scan" in df.columns else pd.Series(np.nan, index=df.index)
        track_s = pd.to_numeric(df["track"], errors="coerce") if "track" in df.columns else pd.Series(np.nan, index=df.index)

        df["scan_km"] = scan_s.fillna(pd.Series(nominal_dim, index=df.index)).clip(lower=0.2, upper=5.0)
        df["track_km"] = track_s.fillna(pd.Series(nominal_dim, index=df.index)).clip(lower=0.2, upper=5.0)
        df["pixel_area_km2"] = (df["scan_km"] * df["track_km"]).round(4)

        df["frp_mw"] = pd.to_numeric(df["frp"], errors="coerce").fillna(0.0).clip(lower=0.0).round(2)
        df["frp_density_mw_km2"] = (df["frp_mw"] / df["pixel_area_km2"].replace(0, np.nan)).fillna(0.0).round(2)

        # 4. Estandarización de Confianza
        conf_mapped = df["confidence"].apply(self._map_confidence_row)
        df["confidence_cat"] = [r[0] for r in conf_mapped]
        df["confidence_score"] = [r[1] for r in conf_mapped]

        # 5. Equivalencia inter-sensor VIIRS/MODIS
        clipped_area = df["pixel_area_km2"].clip(lower=0.5, upper=6.0)
        df["viirs_equiv_count"] = np.where(
            df["sensor_family"] == "VIIRS",
            1.0,
            np.round(4.0 * np.sqrt(clipped_area), 2),
        )
        df["frp_harmonized_mw"] = np.where(
            df["sensor_family"] == "MODIS",
            (df["frp_mw"] * 0.92).round(2),
            df["frp_mw"].round(2),
        )

        # 6. Timestamp UTC estandarizado
        def _parse_dt(row):
            d_str = str(row.get("acq_date", "")).strip()
            t_str = str(row.get("acq_time", "")).strip().split(".")[0].zfill(4)
            try:
                return datetime.strptime(f"{d_str} {t_str}", "%Y-%m-%d %H%M")
            except Exception:
                return pd.NaT

        df["acq_datetime"] = df.apply(_parse_dt, axis=1)

        if "is_synthetic" not in df.columns:
            df["is_synthetic"] = False

        # 7. Filtro de consistencia física terrestre
        valid_mask = (
            df["latitude"].notna()
            & df["longitude"].notna()
            & df["temp_ch4_k"].notna()
            & df["temp_ch4_k"].between(270.0, 550.0)
            & df["latitude"].between(-90.0, 90.0)
            & df["longitude"].between(-180.0, 180.0)
        )
        df_clean = df[valid_mask].copy()

        cols_priority = [
            "latitude", "longitude", "sensor_family", "satellite_name",
            "temp_ch4_k", "temp_ch5_k", "delta_temp_k", "is_saturated_i4",
            "frp_mw", "frp_harmonized_mw", "pixel_area_km2", "frp_density_mw_km2",
            "viirs_equiv_count", "confidence_cat", "confidence_score",
            "acq_datetime", "daynight", "scan_km", "track_km", "is_synthetic",
        ]
        remaining = [c for c in df_clean.columns if c not in cols_priority]
        return df_clean[cols_priority + remaining]

    @staticmethod
    def compute_cross_sensor_calibration(df: pd.DataFrame) -> Dict[str, Any]:
        if df.empty or "sensor_family" not in df.columns:
            return {"status": "Sin datos para calibración"}

        viirs_df = df[df["sensor_family"] == "VIIRS"]
        modis_df = df[df["sensor_family"] == "MODIS"]

        total_v = len(viirs_df)
        total_m = len(modis_df)
        empirical_ratio = round(total_v / total_m, 2) if total_m > 0 else 4.0

        colocated_count = 0
        mean_delta_t4 = 0.0
        if total_v > 0 and total_m > 0 and "cluster_id" in df.columns:
            shared = set(viirs_df["cluster_id"]).intersection(set(modis_df["cluster_id"])) - {-1}
            colocated_count = len(shared)
            if colocated_count > 0:
                v_sub = viirs_df[viirs_df["cluster_id"].isin(shared)]
                m_sub = modis_df[modis_df["cluster_id"].isin(shared)]
                mean_delta_t4 = round(float(v_sub["temp_ch4_k"].mean() - m_sub["temp_ch4_k"].mean()), 2)

        saturated_count = int(df["is_saturated_i4"].sum()) if "is_saturated_i4" in df.columns else 0

        return {
            "total_viirs_hotspots": total_v,
            "total_modis_hotspots": total_m,
            "empirical_count_ratio": empirical_ratio,
            "theoretical_nadir_footprint_ratio": 7.11,
            "effective_detection_ratio_literature": 4.0,
            "colocated_fronts_count": colocated_count,
            "mean_temp_ch4_difference_k": mean_delta_t4,
            "viirs_i4_saturated_pixels": saturated_count,
            "calibration_model": "Multi-Sensor Footprint Transfer & Harmonized Hotspot Count (SeMF 2.0)",
            "modis_equivalent_multiplier_applied": True,
        }
