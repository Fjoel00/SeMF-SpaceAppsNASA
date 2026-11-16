#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Servicio del Calendario Histórico Climatológico (2000–2026)
======================================================================
Proporciona análisis sobre la serie histórica oficial de 27 años (298,101
detecciones satelitales armonizadas en Córdoba y San Luis), permitiendo filtrar
por año individual, intervalo de años, sensor (Todos, Solo VIIRS, Solo MODIS)
y Bounding Box espacial interactivo.

100% Empírico: CERO datos sintéticos ni curvas sinusoidales modeladas.
"""

from datetime import datetime, timezone
import json
import math
import os
from typing import Dict, Any, List, Optional
import numpy as np

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GRID_PATH = os.path.join(ROOT_DIR, "data", "processed", "historico_riesgo_grid.json")


class HistoricalCalendarService:
    MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    MONTH_NAMES_FULL = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ]

    def __init__(self):
        self._grid_data: Optional[Dict[str, Any]] = None
        self._load_grid_data()

    def _load_grid_data(self):
        if os.path.exists(GRID_PATH):
            try:
                with open(GRID_PATH, "r", encoding="utf-8") as f:
                    self._grid_data = json.load(f)
            except Exception as e:
                print(f"⚠️ Error cargando grilla histórica {GRID_PATH}: {e}")
                self._grid_data = None

    def get_raw_grid(self) -> Dict[str, Any]:
        if not self._grid_data:
            self._load_grid_data()
        return self._grid_data or {"metadata": {}, "cells": [], "regional_baseline": []}

    def query_calendar(
        self,
        mode: str = "annual",
        year: int = 2025,
        range_from: int = 2000,
        range_to: int = 2025,
        bbox: Optional[str] = None,
        selected_week: int = 36,
        sensor: str = "all",
    ) -> Dict[str, Any]:
        if not self._grid_data:
            self._load_grid_data()

        year = max(2000, min(2026, int(year)))
        range_from = max(2000, min(2026, int(range_from)))
        range_to = max(range_from, min(2026, int(range_to)))
        selected_week = max(1, min(52, int(selected_week)))
        sensor = str(sensor).lower().strip()

        raw_cells = self._grid_data.get("cells", []) if self._grid_data else []
        meta = self._grid_data.get("metadata", {}) if self._grid_data else {}
        current_closed_week = meta.get("current_closed_week", 45)

        bbox_parsed = None
        active_cells = raw_cells
        if bbox:
            try:
                parts = [float(x) for x in bbox.split(",")]
                if len(parts) == 4:
                    min_lon, min_lat, max_lon, max_lat = parts
                    bbox_parsed = {
                        "min_lon": min_lon,
                        "min_lat": min_lat,
                        "max_lon": max_lon,
                        "max_lat": max_lat,
                    }
                    active_cells = [
                        c for c in raw_cells
                        if (min_lat <= c["lat"] <= max_lat and min_lon <= c["lon"] <= max_lon)
                    ]
            except Exception:
                pass

        closed_years = list(range(2000, 2026))  # 2000..2025 inclusive (26 años cerrados)

        # 1. Calcular serie empírica por semana (1..52) y año (2000..2026) en las celdas activas
        week_year_counts = {w: {y: 0.0 for y in range(2000, 2027)} for w in range(1, 53)}
        week_year_viirs = {w: {y: 0 for y in range(2000, 2027)} for w in range(1, 53)}
        week_year_modis = {w: {y: 0 for y in range(2000, 2027)} for w in range(1, 53)}
        week_year_frp = {w: {y: 0.0 for y in range(2000, 2027)} for w in range(1, 53)}

        for c in active_cells:
            weeks_dict = c.get("weeks", {})
            for w_str, w_info in weeks_dict.items():
                w = int(w_str)
                if w < 1 or w > 52:
                    continue
                by_year = w_info.get("by_year", {})
                for yr_str, vals in by_year.items():
                    y = int(yr_str)
                    if y < 2000 or y > 2026:
                        continue
                    v_cnt = vals.get("viirs", 0)
                    m_cnt = vals.get("modis", 0)
                    eq_cnt = vals.get("eq", 0.0)
                    frp_val = vals.get("frp_mw", 0.0)

                    if sensor == "viirs":
                        metric_val = float(v_cnt)
                    elif sensor == "modis":
                        metric_val = float(m_cnt)
                    else:
                        metric_val = float(eq_cnt)

                    week_year_counts[w][y] += metric_val
                    week_year_viirs[w][y] += v_cnt
                    week_year_modis[w][y] += m_cnt
                    week_year_frp[w][y] += frp_val

        # 2. Calcular envolvente estacional (μ ± 1σ) por semana sobre los 26 años cerrados
        baseline_by_week = {}
        for w in range(1, 53):
            # Para el sensor seleccionado, calcular media y desvío en años cerrados
            yr_series = [week_year_counts[w][y] for y in closed_years]
            mean_val = float(np.mean(yr_series)) if yr_series else 0.0
            std_val = float(np.std(yr_series, ddof=1)) if len(yr_series) > 1 else max(1.0, mean_val * 0.35)
            baseline_by_week[w] = (round(mean_val, 2), round(max(0.2, std_val), 2))

        # 3. Construir datos de las 52 semanas para la vista consultada
        weeks_data = []
        total_observed = 0.0
        total_viirs = 0
        total_modis = 0
        total_frp = 0.0

        for w in range(1, 53):
            b_mean, b_std = baseline_by_week[w]
            m_idx = min(11, int((w - 1) / 4.33))
            m_short = self.MONTH_NAMES_SHORT[m_idx]

            # Si es año 2026 y semana superior al corte disponible -> parcial / pendiente
            is_pending = bool(mode == "annual" and year == 2026 and w > current_closed_week)

            if is_pending or not active_cells:
                obs_val = 0.0
                obs_v = 0
                obs_m = 0
                obs_frp = 0.0
                z_score = 0.0
                status = "Sin datos / Semana futura"
                tier = 0
            else:
                if mode == "interval":
                    yrs = list(range(range_from, range_to + 1))
                    n_yrs = max(1, len(yrs))
                    obs_val = round(sum(week_year_counts[w][y] for y in yrs) / n_yrs, 1)
                    obs_v = int(round(sum(week_year_viirs[w][y] for y in yrs) / n_yrs))
                    obs_m = int(round(sum(week_year_modis[w][y] for y in yrs) / n_yrs))
                    obs_frp = round(sum(week_year_frp[w][y] for y in yrs) / n_yrs, 1)
                else:
                    obs_val = round(week_year_counts[w][year], 1)
                    obs_v = week_year_viirs[w][year]
                    obs_m = week_year_modis[w][year]
                    obs_frp = round(week_year_frp[w][year], 1)

                z_score = round((obs_val - b_mean) / max(0.5, b_std), 2)

                if z_score >= 2.0 or (31 <= w <= 43 and obs_val > b_mean * 1.5):
                    status = "Alerta Extrema (Z ≥ +2.0)"
                    tier = 4
                elif z_score >= 1.0 or (30 <= w <= 44 and obs_val > b_mean * 1.15):
                    status = "Actividad Alta (Z ≥ +1.0)"
                    tier = 3
                elif z_score <= -2.0:
                    status = "Déficit Extremo (Z ≤ -2.0)"
                    tier = 1
                elif z_score <= -0.5:
                    status = "Actividad Baja"
                    tier = 1
                else:
                    status = "Normal Climatológica"
                    tier = 2

                total_observed += obs_val
                total_viirs += obs_v
                total_modis += obs_m
                total_frp += obs_frp

            weeks_data.append({
                "week": w,
                "month": m_short,
                "baseline_mean": b_mean,
                "baseline_std": b_std,
                "upper_band": round(b_mean + b_std, 2),
                "lower_band": round(max(0.0, b_mean - b_std), 2),
                "observed_harmonized": obs_val,
                "observed_viirs": obs_v,
                "observed_modis": obs_m,
                "observed_raw": obs_v + obs_m,
                "observed_frp_mw": obs_frp,
                "z_score": z_score,
                "status": status,
                "tier": tier,
                "pending": is_pending,
                "is_selected": (w == selected_week),
            })

        # Resumen mensual (12 meses)
        months_summary = []
        for m_i in range(12):
            m_weeks = [w for w in weeks_data if min(11, int((w["week"] - 1) / 4.33)) == m_i]
            months_summary.append({
                "month_num": m_i + 1,
                "month_short": self.MONTH_NAMES_SHORT[m_i],
                "month_name": self.MONTH_NAMES_FULL[m_i],
                "baseline_expected": round(sum(w["baseline_mean"] for w in m_weeks), 1),
                "observed_harmonized": round(sum(w["observed_harmonized"] for w in m_weeks), 1),
                "observed_frp_mw": round(sum(w["observed_frp_mw"] for w in m_weeks), 1),
                "is_peak_season": (m_i + 1) in (8, 9, 10),
            })

        sel_w_obj = next((w for w in weeks_data if w["week"] == selected_week), weeks_data[35])

        # Matriz completa 52 semanas x 27 años para el heatmap interactivo
        heatmap_matrix = []
        for yr in range(2026, 1999, -1):
            row_weeks = []
            for w in range(1, 53):
                is_p = bool(yr == 2026 and w > current_closed_week)
                if is_p:
                    cnt = -1.0  # Marca especial para "semana futura"
                    z = 0.0
                else:
                    cnt = round(week_year_counts[w][yr], 1)
                    bm, bs = baseline_by_week[w]
                    z = round((cnt - bm) / max(0.5, bs), 2)
                row_weeks.append({
                    "week": w,
                    "year": yr,
                    "count": cnt,
                    "z_score": z,
                    "viirs": week_year_viirs[w][yr],
                    "modis": week_year_modis[w][yr],
                    "frp_mw": round(week_year_frp[w][yr], 1),
                    "pending": is_p,
                })
            heatmap_matrix.append({
                "year": yr,
                "is_partial": (yr == 2026),
                "weeks": row_weeks,
                "annual_total": round(sum(rw["count"] for rw in row_weeks if rw["count"] >= 0), 1),
            })

        yearly_breakdown = [
            {"year": hm["year"], "detections": hm["annual_total"]}
            for hm in sorted(heatmap_matrix, key=lambda x: x["year"])
        ]

        return {
            "metadata": {
                "title": "Serie Histórica Oficial NASA FIRMS MODIS + VIIRS (2000–2026)",
                "region": "Provincias de Córdoba y San Luis, Argentina",
                "data_source": "NASA FIRMS Official (MODIS C6.1 2000–2026 + VIIRS C2 2012–2026)",
                "total_archive_detections": meta.get("total_points_harmonized", 298101),
                "mode": mode,
                "selected_year": year,
                "range_from": range_from,
                "range_to": range_to,
                "selected_week": selected_week,
                "selected_sensor": sensor,
                "bbox_filter": bbox_parsed,
                "active_cells_count": len(active_cells),
                "total_cells_count": len(raw_cells),
                "current_closed_week_2026": current_closed_week,
                "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            "kpis": {
                "total_harmonized_eq": round(total_observed, 1),
                "total_viirs_count": total_viirs,
                "total_modis_count": total_modis,
                "total_frp_mw": round(total_frp, 1),
                "selected_week_detail": sel_w_obj,
                "peak_season_window": "Agosto – Octubre (Semanas ISO 31 a 44)",
            },
            "weeks": weeks_data,
            "months": months_summary,
            "heatmap": heatmap_matrix,
            "yearly_breakdown": yearly_breakdown,
        }


historical_service = HistoricalCalendarService()
