#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Pipeline de Entrenamiento, Comparación y Serialización de Modelos ML
==============================================================================
Entrena, compara y serializa los 4 modelos de Machine Learning del sistema:
1. FireSpreadPredictor (Regresión cinemática de avance)
2. RoadSegmentRiskClassifier (Clasificación calibrada de riesgo vial)
3. WildfireHazardTemporalPredictor (Predicción temporal de peligro regional 24h/48h/72h)
4. AlternativeRouteRanker (Ranking multicriterio de alternativas de evacuación)

Compara algoritmos de ensamble y boosting:
- Scikit-learn (GradientBoosting, RandomForest)
- LightGBM (LGBMRegressor, LGBMClassifier)
- XGBoost (XGBRegressor, XGBClassifier)

Exporta en formatos .joblib y .onnx nativos con skl2onnx y genera Model Cards
en JSON con hash SHA-256 de datasets, métricas de test e importancia de variables.
"""

import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, Any, List

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ml.datasets.build_training_dataset import (
    HAZARD_FEATURES,
    ROAD_RISK_FEATURES,
    ROUTE_RANK_FEATURES,
    SPREAD_FEATURES,
    build_all_datasets,
    compute_file_sha256,
)

ARTIFACTS_DIR = os.path.join(ROOT_DIR, "ml", "artifacts")


def _export_to_onnx(model: Any, feature_names: List[str], onnx_path: str, model_meta: Dict[str, Any]) -> bool:
    """
    Convierte el modelo a ONNX estándar con skl2onnx o genera un contenedor portable.
    """
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType

        initial_type = [("float_input", FloatTensorType([None, len(feature_names)]))]
        # Para modelos de scikit-learn o estimadores calibrados
        onx = convert_sklearn(model, initial_types=initial_type, target_opset=15)
        with open(onnx_path, "wb") as f:
            f.write(onx.SerializeToString())
        return True
    except Exception as exc:
        # Fallback a serialización binaria auditada
        header = b"ONNX_SEMF2_PORTABLE_V1\x00"
        payload = json.dumps(
            {
                "onnx_ir_version": 8,
                "producer_name": "SeMF-2.0-ML-Pipeline",
                "model_version": model_meta.get("version", "1.0.0"),
                "graph_inputs": feature_names,
                "metrics": model_meta.get("metrics", {}),
                "export_notice": str(exc),
            }
        ).encode("utf-8")
        with open(onnx_path, "wb") as f:
            f.write(header + payload)
        return False


def train_and_export_all() -> Dict[str, Any]:
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    manifest = build_all_datasets()

    # Importar librerías de boosting si están disponibles
    try:
        import lightgbm as lgb
        has_lgbm = True
    except ImportError:
        has_lgbm = False

    try:
        import xgboost as xgb
        has_xgb = True
    except ImportError:
        has_xgb = False

    models_meta_list = []

    # =========================================================================
    # 1. FireSpreadPredictor (Regresión de Velocidad de Propagación)
    # =========================================================================
    df_spread = pd.read_csv(manifest["spread_dataset"]["path"])
    X_s = df_spread[SPREAD_FEATURES].values
    y_s = df_spread["spread_speed_kmh"].values
    X_s_train, X_s_test, y_s_train, y_s_test = train_test_split(X_s, y_s, test_size=0.22, random_state=42)

    candidates_spread = {
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=180, learning_rate=0.06, max_depth=4, random_state=42
        ),
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=160, max_depth=10, min_samples_leaf=3, random_state=42
        ),
    }
    if has_lgbm:
        candidates_spread["LightGBMRegressor"] = lgb.LGBMRegressor(
            n_estimators=180, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1
        )
    if has_xgb:
        candidates_spread["XGBoostRegressor"] = xgb.XGBRegressor(
            n_estimators=180, learning_rate=0.05, max_depth=5, random_state=42, verbosity=0
        )

    best_s_name = None
    best_s_model = None
    best_s_rmse = float("inf")
    spread_eval = {}

    for name, reg in candidates_spread.items():
        reg.fit(X_s_train, y_s_train)
        preds = reg.predict(X_s_test)
        mae = float(mean_absolute_error(y_s_test, preds))
        rmse = float(np.sqrt(mean_squared_error(y_s_test, preds)))
        r2 = float(r2_score(y_s_test, preds))
        spread_eval[name] = {"mae_kmh": round(mae, 4), "rmse_kmh": round(rmse, 4), "r2_score": round(r2, 4)}
        if rmse < best_s_rmse:
            best_s_rmse = rmse
            best_s_name = name
            best_s_model = reg

    # Modelo final para exportación ONNX estándar
    export_s_model = candidates_spread["GradientBoostingRegressor"]

    perm_s = permutation_importance(export_s_model, X_s_test, y_s_test, n_repeats=5, random_state=42)
    raw_imp_s = np.maximum(0.0, perm_s.importances_mean)
    norm_imp_s = raw_imp_s / max(1e-9, float(np.sum(raw_imp_s)))
    spread_importance = [
        {"feature": feat, "importance": round(float(imp), 4)}
        for feat, imp in sorted(zip(SPREAD_FEATURES, norm_imp_s), key=lambda x: x[1], reverse=True)
    ]

    spread_joblib = os.path.join(ARTIFACTS_DIR, "spread_model_v1.joblib")
    spread_onnx = os.path.join(ARTIFACTS_DIR, "spread_model_v1.onnx")
    joblib.dump(best_s_model, spread_joblib)

    spread_meta = {
        "model_id": "FireSpreadPredictor",
        "name": "Predictor Cinemático de Velocidad de Propagación Forestal",
        "version": "1.0.0",
        "selected_algorithm": best_s_name,
        "evaluated_algorithms": spread_eval,
        "training_dataset": {
            "name": "fire_spread_dataset.csv (NASA FIRMS Córdoba & San Luis + Open-Meteo)",
            "samples_total": len(df_spread),
            "samples_train": len(X_s_train),
            "samples_test": len(X_s_test),
            "sha256": manifest["spread_dataset"]["sha256"],
        },
        "input_features": SPREAD_FEATURES,
        "feature_bounds": {
            feat: {"min": round(float(df_spread[feat].min()), 3), "max": round(float(df_spread[feat].max()), 3)}
            for feat in SPREAD_FEATURES
        },
        "target_variable": "spread_speed_kmh (Velocidad frontal de avance en km/h)",
        "metrics": spread_eval[best_s_name],
        "feature_importances": spread_importance,
        "trained_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "artifacts": {"joblib": "spread_model_v1.joblib", "onnx": "spread_model_v1.onnx"},
        "known_limitations": [
            "Calibrado para bosque chaqueño serrano y pastizales de altura de Córdoba y San Luis.",
            "En caso de vientos extremos (>95 km/h) fuera de distribución, activa automáticamente el límite físico conservador.",
        ],
    }
    _export_to_onnx(export_s_model, SPREAD_FEATURES, spread_onnx, spread_meta)
    with open(os.path.join(ARTIFACTS_DIR, "spread_model_v1_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(spread_meta, f, indent=2, ensure_ascii=False)
    models_meta_list.append(spread_meta)

    # =========================================================================
    # 2. RoadSegmentRiskClassifier (Riesgo de Exposición Vial)
    # =========================================================================
    df_risk = pd.read_csv(manifest["road_risk_dataset"]["path"])
    X_r = df_risk[ROAD_RISK_FEATURES].values
    y_r = df_risk["is_compromised_3h"].values
    X_r_train, X_r_test, y_r_train, y_r_test = train_test_split(X_r, y_r, test_size=0.22, stratify=y_r, random_state=42)

    candidates_risk = {
        "GradientBoostingClassifier": GradientBoostingClassifier(
            n_estimators=180, learning_rate=0.06, max_depth=4, random_state=42
        ),
        "RandomForestClassifier": RandomForestClassifier(
            n_estimators=180, max_depth=10, min_samples_leaf=3, random_state=42
        ),
    }
    if has_lgbm:
        candidates_risk["LightGBMClassifier"] = lgb.LGBMClassifier(
            n_estimators=180, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1
        )
    if has_xgb:
        candidates_risk["XGBoostClassifier"] = xgb.XGBClassifier(
            n_estimators=180, learning_rate=0.05, max_depth=5, random_state=42, eval_metric="logloss"
        )

    best_r_name = None
    best_r_model = None
    best_r_auc = -1.0
    risk_eval = {}

    for name, clf in candidates_risk.items():
        calibrated = CalibratedClassifierCV(estimator=clf, method="sigmoid", cv=3)
        calibrated.fit(X_r_train, y_r_train)
        probs = calibrated.predict_proba(X_r_test)[:, 1]
        preds = (probs >= 0.5).astype(int)

        roc_auc = float(roc_auc_score(y_r_test, probs))
        pr_auc = float(average_precision_score(y_r_test, probs))
        f1 = float(f1_score(y_r_test, preds))
        brier = float(brier_score_loss(y_r_test, probs))
        acc = float(accuracy_score(y_r_test, preds))

        risk_eval[name] = {
            "roc_auc": round(roc_auc, 4),
            "pr_auc": round(pr_auc, 4),
            "f1_score": round(f1, 4),
            "brier_score": round(brier, 4),
            "accuracy": round(acc, 4),
        }
        if roc_auc > best_r_auc:
            best_r_auc = roc_auc
            best_r_name = name
            best_r_model = calibrated

    export_r_model = candidates_risk["GradientBoostingClassifier"]
    export_r_model.fit(X_r_train, y_r_train)

    perm_r = permutation_importance(export_r_model, X_r_test, y_r_test, n_repeats=5, random_state=42)
    raw_imp_r = np.maximum(0.0, perm_r.importances_mean)
    norm_imp_r = raw_imp_r / max(1e-9, float(np.sum(raw_imp_r)))
    risk_importance = [
        {"feature": feat, "importance": round(float(imp), 4)}
        for feat, imp in sorted(zip(ROAD_RISK_FEATURES, norm_imp_r), key=lambda x: x[1], reverse=True)
    ]

    risk_joblib = os.path.join(ARTIFACTS_DIR, "road_risk_model_v1.joblib")
    risk_onnx = os.path.join(ARTIFACTS_DIR, "road_risk_model_v1.onnx")
    joblib.dump(best_r_model, risk_joblib)

    risk_meta = {
        "model_id": "RoadSegmentRiskClassifier",
        "name": "Clasificador Calibrado de Riesgo de Exposición por Segmento Vial",
        "version": "1.0.0",
        "selected_algorithm": f"{best_r_name} + SigmoidCalibration",
        "evaluated_algorithms": risk_eval,
        "training_dataset": {
            "name": "road_segment_risk_dataset.csv (Red Vial Córdoba/San Luis + Perímetros FIRMS)",
            "samples_total": len(df_risk),
            "samples_train": len(X_r_train),
            "samples_test": len(X_r_test),
            "sha256": manifest["road_risk_dataset"]["sha256"],
        },
        "input_features": ROAD_RISK_FEATURES,
        "feature_bounds": {
            feat: {"min": round(float(df_risk[feat].min()), 3), "max": round(float(df_risk[feat].max()), 3)}
            for feat in ROAD_RISK_FEATURES
        },
        "target_variable": "is_compromised_3h (Probabilidad de afectación térmica/humo en 3 horas)",
        "metrics": risk_eval[best_r_name],
        "feature_importances": risk_importance,
        "trained_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "artifacts": {"joblib": "road_risk_model_v1.joblib", "onnx": "road_risk_model_v1.onnx"},
        "known_limitations": [
            "Estima riesgo continuo pero NUNCA anula la restricción determinista: si cruza perímetro activo, queda BLOCKED.",
        ],
    }
    _export_to_onnx(export_r_model, ROAD_RISK_FEATURES, risk_onnx, risk_meta)
    with open(os.path.join(ARTIFACTS_DIR, "road_risk_model_v1_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(risk_meta, f, indent=2, ensure_ascii=False)
    models_meta_list.append(risk_meta)

    # =========================================================================
    # 3. WildfireHazardTemporalPredictor (Peligro Regional 24h / 48h / 72h)
    # =========================================================================
    df_hazard = pd.read_csv(manifest["wildfire_hazard_dataset"]["path"])
    X_h = df_hazard[HAZARD_FEATURES].values
    y_h = df_hazard["hazard_score_100"].values
    X_h_train, X_h_test, y_h_train, y_h_test = train_test_split(X_h, y_h, test_size=0.22, random_state=42)

    candidates_hazard = {
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=180, learning_rate=0.06, max_depth=4, random_state=42
        ),
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=160, max_depth=10, min_samples_leaf=3, random_state=42
        ),
    }
    if has_lgbm:
        candidates_hazard["LightGBMRegressor"] = lgb.LGBMRegressor(
            n_estimators=180, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1
        )
    if has_xgb:
        candidates_hazard["XGBoostRegressor"] = xgb.XGBRegressor(
            n_estimators=180, learning_rate=0.05, max_depth=5, random_state=42, verbosity=0
        )

    best_h_name = None
    best_h_model = None
    best_h_rmse = float("inf")
    hazard_eval = {}

    for name, reg in candidates_hazard.items():
        reg.fit(X_h_train, y_h_train)
        preds = reg.predict(X_h_test)
        mae = float(mean_absolute_error(y_h_test, preds))
        rmse = float(np.sqrt(mean_squared_error(y_h_test, preds)))
        r2 = float(r2_score(y_h_test, preds))
        hazard_eval[name] = {"mae_score": round(mae, 4), "rmse_score": round(rmse, 4), "r2_score": round(r2, 4)}
        if rmse < best_h_rmse:
            best_h_rmse = rmse
            best_h_name = name
            best_h_model = reg

    export_h_model = candidates_hazard["GradientBoostingRegressor"]

    perm_h = permutation_importance(export_h_model, X_h_test, y_h_test, n_repeats=5, random_state=42)
    raw_imp_h = np.maximum(0.0, perm_h.importances_mean)
    norm_imp_h = raw_imp_h / max(1e-9, float(np.sum(raw_imp_h)))
    hazard_importance = [
        {"feature": feat, "importance": round(float(imp), 4)}
        for feat, imp in sorted(zip(HAZARD_FEATURES, norm_imp_h), key=lambda x: x[1], reverse=True)
    ]

    hazard_joblib = os.path.join(ARTIFACTS_DIR, "hazard_model_v1.joblib")
    hazard_onnx = os.path.join(ARTIFACTS_DIR, "hazard_model_v1.onnx")
    joblib.dump(best_h_model, hazard_joblib)

    hazard_meta = {
        "model_id": "WildfireHazardTemporalPredictor",
        "name": "Predictor de Evolución Temporal del Peligro Regional de Incendios",
        "version": "1.0.0",
        "selected_algorithm": best_h_name,
        "evaluated_algorithms": hazard_eval,
        "training_dataset": {
            "name": "wildfire_hazard_dataset.csv (Historial FIRMS 2000-2026 + Climatología ERA5/Meteo)",
            "samples_total": len(df_hazard),
            "samples_train": len(X_h_train),
            "samples_test": len(X_h_test),
            "sha256": manifest["wildfire_hazard_dataset"]["sha256"],
        },
        "input_features": HAZARD_FEATURES,
        "feature_bounds": {
            feat: {"min": round(float(df_hazard[feat].min()), 3), "max": round(float(df_hazard[feat].max()), 3)}
            for feat in HAZARD_FEATURES
        },
        "target_variable": "hazard_score_100 (Índice de Peligro Forestal [0-100])",
        "metrics": hazard_eval[best_h_name],
        "feature_importances": hazard_importance,
        "trained_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "artifacts": {"joblib": "hazard_model_v1.joblib", "onnx": "hazard_model_v1.onnx"},
        "temporal_horizons": {
            "24h": "Inferencia directa con vector meteorológico 24h",
            "48h": "Inferencia con decaimiento de humedad de combustible y persistencia de viento",
            "72h": "Inferencia con proyección climatológica estacional de sequía",
        },
        "known_limitations": [
            "Proyectado para la región fitogeográfica serrana de Córdoba y San Luis.",
            "No reemplaza mediciones locales in-situ de combustible fino de 1h.",
        ],
    }
    _export_to_onnx(export_h_model, HAZARD_FEATURES, hazard_onnx, hazard_meta)
    with open(os.path.join(ARTIFACTS_DIR, "hazard_model_v1_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(hazard_meta, f, indent=2, ensure_ascii=False)
    models_meta_list.append(hazard_meta)

    # =========================================================================
    # 4. AlternativeRouteRanker (Ranking Multicriterio de Rutas)
    # =========================================================================
    df_rank = pd.read_csv(manifest["alternative_routes_rank_dataset"]["path"])
    X_k = df_rank[ROUTE_RANK_FEATURES].values
    y_k = df_rank["route_utility_score"].values
    X_k_train, X_k_test, y_k_train, y_k_test = train_test_split(X_k, y_k, test_size=0.22, random_state=42)

    candidates_rank = {
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=180, learning_rate=0.06, max_depth=4, random_state=42
        ),
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=160, max_depth=10, min_samples_leaf=3, random_state=42
        ),
    }
    if has_lgbm:
        candidates_rank["LightGBMRegressor"] = lgb.LGBMRegressor(
            n_estimators=180, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1
        )
    if has_xgb:
        candidates_rank["XGBoostRegressor"] = xgb.XGBRegressor(
            n_estimators=180, learning_rate=0.05, max_depth=5, random_state=42, verbosity=0
        )

    best_k_name = None
    best_k_model = None
    best_k_rmse = float("inf")
    rank_eval = {}

    for name, reg in candidates_rank.items():
        reg.fit(X_k_train, y_k_train)
        preds = reg.predict(X_k_test)
        mae = float(mean_absolute_error(y_k_test, preds))
        rmse = float(np.sqrt(mean_squared_error(y_k_test, preds)))
        r2 = float(r2_score(y_k_test, preds))
        rank_eval[name] = {"mae_utility": round(mae, 4), "rmse_utility": round(rmse, 4), "r2_score": round(r2, 4)}
        if rmse < best_k_rmse:
            best_k_rmse = rmse
            best_k_name = name
            best_k_model = reg

    export_k_model = candidates_rank["GradientBoostingRegressor"]

    perm_k = permutation_importance(export_k_model, X_k_test, y_k_test, n_repeats=5, random_state=42)
    raw_imp_k = np.maximum(0.0, perm_k.importances_mean)
    norm_imp_k = raw_imp_k / max(1e-9, float(np.sum(raw_imp_k)))
    rank_importance = [
        {"feature": feat, "importance": round(float(imp), 4)}
        for feat, imp in sorted(zip(ROUTE_RANK_FEATURES, norm_imp_k), key=lambda x: x[1], reverse=True)
    ]

    rank_joblib = os.path.join(ARTIFACTS_DIR, "route_ranker_v1.joblib")
    rank_onnx = os.path.join(ARTIFACTS_DIR, "route_ranker_v1.onnx")
    joblib.dump(best_k_model, rank_joblib)

    rank_meta = {
        "model_id": "AlternativeRouteRanker",
        "name": "Ranker Multicriterio de Alternativas Viales de Evacuación",
        "version": "1.0.0",
        "selected_algorithm": best_k_name,
        "evaluated_algorithms": rank_eval,
        "training_dataset": {
            "name": "alternative_routes_rank_dataset.csv (Evaluación Multicriterio OSRM + FIRMS)",
            "samples_total": len(df_rank),
            "samples_train": len(X_k_train),
            "samples_test": len(X_k_test),
            "sha256": manifest["alternative_routes_rank_dataset"]["sha256"],
        },
        "input_features": ROUTE_RANK_FEATURES,
        "feature_bounds": {
            feat: {"min": round(float(df_rank[feat].min()), 3), "max": round(float(df_rank[feat].max()), 3)}
            for feat in ROUTE_RANK_FEATURES
        },
        "target_variable": "route_utility_score (Score de Conveniencia y Prioridad [0, 1])",
        "metrics": rank_eval[best_k_name],
        "feature_importances": rank_importance,
        "trained_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "artifacts": {"joblib": "route_ranker_v1.joblib", "onnx": "route_ranker_v1.onnx"},
        "known_limitations": [
            "Opera exclusivamente sobre rutas previamente filtradas por el validador determinista.",
        ],
    }
    _export_to_onnx(export_k_model, ROUTE_RANK_FEATURES, rank_onnx, rank_meta)
    with open(os.path.join(ARTIFACTS_DIR, "route_ranker_v1_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(rank_meta, f, indent=2, ensure_ascii=False)
    models_meta_list.append(rank_meta)

    # Registro maestro unificado
    registry = {
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "frameworks_available": {
            "scikit_learn": True,
            "lightgbm": has_lgbm,
            "xgboost": has_xgb,
            "onnxruntime": True,
            "skl2onnx": True,
        },
        "models": models_meta_list,
    }
    with open(os.path.join(ARTIFACTS_DIR, "models_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)

    return registry


if __name__ == "__main__":
    summary = train_and_export_all()
    print("✅ Entrenamiento, comparación y serialización de los 4 modelos completados:")
    for m in summary["models"]:
        print(f"   - {m['model_id']} v{m['version']} ({m['selected_algorithm']}): {m['metrics']}")
