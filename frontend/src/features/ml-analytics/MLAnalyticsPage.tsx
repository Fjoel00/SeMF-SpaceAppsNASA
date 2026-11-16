import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { MLModelMetadata } from '../../types/semf';

export const MLAnalyticsPage: React.FC = () => {
  const [models, setModels] = useState<MLModelMetadata[]>([]);
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [windSpeed, setWindSpeed] = useState<number>(42);
  const [distKm, setDistKm] = useState<number>(0.9);
  const [frpMw, setFrpMw] = useState<number>(320);

  useEffect(() => {
    apiClient
      .getMLModels()
      .then((res) => setModels(res.models || []))
      .catch(console.error);
  }, []);

  const runLivePrediction = async () => {
    const res = await apiClient.predictMLRisk({
      spread_features: {
        frp_peak_mw: frpMw,
        frp_density_mw_km2: frpMw * 1.8,
        delta_temp_k: 45.0,
        points_count: 12,
        wind_speed_kmh: windSpeed,
        relative_humidity_pct: 18.0,
        temperature_c: 34.0,
        seasonal_z_score: 1.9,
      },
      segment_features: {
        dist_to_perimeter_km: distKm,
        dist_to_cone_1h_km: Math.max(0, distKm - 0.5),
        dist_to_cone_3h_km: Math.max(0, distKm - 1.2),
        wind_alignment_cos: 0.88,
        fire_frp_mw: frpMw,
        wind_speed_kmh: windSpeed,
        relative_humidity_pct: 18.0,
        data_age_hours: 1.5,
      },
    });
    setSimResult(res);
  };

  useEffect(() => {
    runLivePrediction();
  }, [windSpeed, distKm, frpMw]);

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {models.map((m) => (
          <div
            key={m.model_id}
            className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {m.model_id} v{m.version}
                </span>
                <h2 className="text-sm font-bold text-white mt-1.5">{m.name}</h2>
              </div>
              <span className="text-xs font-mono text-emerald-400">
                {m.selected_algorithm}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              {Object.entries(m.metrics).map(([k, v]) => (
                <div
                  key={k}
                  className="p-2.5 rounded-lg bg-[#111827] border border-[#1E293B]"
                >
                  <span className="text-[10px] text-slate-400 uppercase block">{k}</span>
                  <b className="text-white text-sm">{v}</b>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-mono text-slate-400">
                Importancia de Variables (Permutation Importance)
              </div>
              {m.feature_importances.slice(0, 5).map((fi) => (
                <div key={fi.feature} className="space-y-0.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-300">{fi.feature}</span>
                    <span className="text-cyan-400">
                      {(fi.importance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-cyan-500"
                      style={{ width: `${Math.min(100, fi.importance * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[11px] text-slate-400 space-y-1 border-t border-[#1E293B] pt-3">
              <div className="font-mono text-slate-300">
                Artefactos: {m.artifacts.onnx} | {m.artifacts.joblib}
              </div>
              {m.known_limitations.map((lim, idx) => (
                <div key={idx}>• {lim}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* PROBADOR INTERACTIVO DE INFERENCIA EN VIVO */}
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white">
          Laboratorio de Inferencia en Tiempo Real (ONNX / Joblib)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div>
            <label className="text-slate-400 block">
              Velocidad de Viento: <b className="text-white">{windSpeed} km/h</b>
            </label>
            <input
              type="range"
              min={5}
              max={90}
              value={windSpeed}
              onChange={(e) => setWindSpeed(Number(e.target.value))}
              className="w-full accent-cyan-500 mt-1"
            />
          </div>
          <div>
            <label className="text-slate-400 block">
              Distancia Tramo Vial al Perímetro: <b className="text-white">{distKm} km</b>
            </label>
            <input
              type="range"
              min={0.1}
              max={10.0}
              step={0.1}
              value={distKm}
              onChange={(e) => setDistKm(Number(e.target.value))}
              className="w-full accent-orange-500 mt-1"
            />
          </div>
          <div>
            <label className="text-slate-400 block">
              FRP Pico del Frente: <b className="text-white">{frpMw} MW</b>
            </label>
            <input
              type="range"
              min={20}
              max={800}
              step={10}
              value={frpMw}
              onChange={(e) => setFrpMw(Number(e.target.value))}
              className="w-full accent-red-500 mt-1"
            />
          </div>
        </div>

        {simResult && (
          <pre className="p-3 rounded-lg bg-[#111827] border border-[#1E293B] text-xs font-mono text-cyan-300 overflow-x-auto">
            {JSON.stringify(simResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
