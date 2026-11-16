#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Servicio de Ingesta Satelital NASA FIRMS (MODIS & VIIRS NRT)
=======================================================================
Gestiona la descarga desde la API oficial de NASA FIRMS, la lectura desde
la caché local verificada en data/raw/ y la generación del modo de demostración
científicamente calibrado cuando se solicita modo sintético/offline.
"""

import io
import os
import time
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np
import pandas as pd
import requests

from backend.app.core.config import DATA_DIR, settings


class FIRMSDataIngestor:
    BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    DEFAULT_SOURCES = [
        "VIIRS_NOAA20_NRT",
        "VIIRS_SNPP_NRT",
        "VIIRS_NOAA21_NRT",
        "MODIS_NRT",
    ]

    def __init__(self, map_key: Optional[str] = None, cache_dir: Optional[str] = None):
        self.map_key = map_key if map_key is not None else settings.firms_map_key
        self.cache_dir = cache_dir or os.path.join(DATA_DIR, "raw")
        os.makedirs(self.cache_dir, exist_ok=True)

    def fetch_source(
        self,
        source: str,
        area: str,
        day_range: int = 5,
        date: Optional[str] = None,
        use_cache: bool = True,
    ) -> pd.DataFrame:
        clean_area = area.replace(",", "_")
        date_suffix = f"_{date}" if date else ""
        cache_file = os.path.join(self.cache_dir, f"{source}_{clean_area}{date_suffix}_{day_range}d.csv")

        if use_cache and os.path.exists(cache_file):
            try:
                df = pd.read_csv(cache_file)
                if not df.empty:
                    df["sensor_source"] = source
                    df["is_synthetic"] = False
                return df
            except Exception:
                pass

        if not self.map_key or len(self.map_key.strip()) < 8:
            return pd.DataFrame()

        url = (
            f"{self.BASE_URL}/{self.map_key}/{source}/{area}/{day_range}/{date}"
            if date
            else f"{self.BASE_URL}/{self.map_key}/{source}/{area}/{day_range}"
        )

        try:
            response = requests.get(url, timeout=25)
            if response.status_code == 200 and len(response.text.strip()) > 0:
                if "No fires detected" in response.text or "Invalid MAP_KEY" in response.text:
                    return pd.DataFrame()
                df = pd.read_csv(io.StringIO(response.text))
                if not df.empty:
                    df["sensor_source"] = source
                    df["is_synthetic"] = False
                    df.to_csv(cache_file, index=False)
                return df
        except Exception:
            pass

        return pd.DataFrame()

    def fetch_all(
        self,
        area: str = settings.default_bbox,
        day_range: int = 5,
        date: Optional[str] = None,
        sources: Optional[List[str]] = None,
        use_cache: bool = True,
    ) -> pd.DataFrame:
        if sources is None:
            sources = self.DEFAULT_SOURCES

        dfs = []
        for src in sources:
            df_src = self.fetch_source(src, area, day_range, date=date, use_cache=use_cache)
            if not df_src.empty:
                dfs.append(df_src)
            if not use_cache and self.map_key:
                time.sleep(0.4)

        if not dfs:
            return pd.DataFrame()

        df_raw = pd.concat(dfs, ignore_index=True)
        df_raw["is_synthetic"] = False
        return df_raw

    def generate_calibrated_fallback(self, area: str = settings.default_bbox) -> pd.DataFrame:
        try:
            coords = [float(x) for x in area.split(",")]
            min_lon, min_lat, max_lon, max_lat = coords[0], coords[1], coords[2], coords[3]
        except Exception:
            min_lon, min_lat, max_lon, max_lat = -66.0, -33.5, -63.5, -31.0

        rng = np.random.default_rng(42)
        records = []
        centers = [
            (min_lat + 0.12 * (max_lat - min_lat), min_lon + 0.05 * (max_lon - min_lon)),  # El Trapiche
            (min_lat + 0.70 * (max_lat - min_lat), min_lon + 0.40 * (max_lon - min_lon)),  # Traslasierra
            (min_lat + 0.82 * (max_lat - min_lat), min_lon + 0.75 * (max_lon - min_lon)),  # Sierras Chicas
        ]
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        for clat, clon in centers:
            n_viirs = int(rng.integers(14, 28))
            for i in range(n_viirs):
                dlat = float(rng.normal(0, 0.008))
                dlon = float(rng.normal(0, 0.008) + i * 0.0002)
                t4 = float(rng.uniform(330.0, 367.0))
                t5 = t4 - float(rng.uniform(18.0, 52.0))
                frp = float(rng.exponential(22.0) + 2.5)
                conf = str(rng.choice(["h", "n", "l"], p=[0.65, 0.28, 0.07]))
                records.append({
                    "latitude": round(clat + dlat, 5),
                    "longitude": round(clon + dlon, 5),
                    "bright_ti4": round(t4, 2),
                    "scan": 0.39,
                    "track": 0.37,
                    "acq_date": today_str,
                    "acq_time": f"{int(rng.integers(12, 21)):02d}{int(rng.integers(0, 59)):02d}",
                    "satellite": "NOAA-20",
                    "confidence": conf,
                    "version": "2.0NRT",
                    "bright_ti5": round(t5, 2),
                    "frp": round(frp, 2),
                    "daynight": "D",
                    "sensor_source": "VIIRS_NOAA20_NRT",
                })

            for _ in range(max(2, n_viirs // 5)):
                dlat = float(rng.normal(0, 0.012))
                dlon = float(rng.normal(0, 0.012))
                t_m = float(rng.uniform(316.0, 360.0))
                t31 = t_m - float(rng.uniform(14.0, 36.0))
                frp = float(rng.exponential(32.0) + 6.0)
                records.append({
                    "latitude": round(clat + dlat, 5),
                    "longitude": round(clon + dlon, 5),
                    "brightness": round(t_m, 2),
                    "scan": 1.15,
                    "track": 1.05,
                    "acq_date": today_str,
                    "acq_time": f"{int(rng.integers(12, 21)):02d}{int(rng.integers(0, 59)):02d}",
                    "satellite": "Aqua",
                    "confidence": int(rng.integers(55, 96)),
                    "version": "6.1NRT",
                    "bright_t31": round(t31, 2),
                    "frp": round(frp, 2),
                    "daynight": "D",
                    "sensor_source": "MODIS_NRT",
                })

        df = pd.DataFrame(records)
        df["is_synthetic"] = True
        return df
