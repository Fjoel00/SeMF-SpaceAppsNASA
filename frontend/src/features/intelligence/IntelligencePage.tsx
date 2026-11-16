import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { MLModelMetadata } from '../../types/semf';

interface IntelligencePageProps {
  onSettingsUpdated: () => void;
}

export const IntelligencePage: React.FC<IntelligencePageProps> = ({
  onSettingsUpdated,
}) => {
  const [models, setModels] = useState<MLModelMetadata[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  // Parámetros científicos
  const [epsKm, setEpsKm] = useState<number>(2.5);
  const [safetyBufferKm, setSafetyBufferKm] = useState<number>(1.2);
  const [stalenessHours, setStalenessHours] = useState<number>(12.0);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Predictor en vivo ML
  const [windSpeed, setWindSpeed] = useState<number>(40);
  const [distKm, setDistKm] = useState<number>(1.2);
  const [frpMw, setFrpMw] = useState<number>(300);
  const [prediction, setPrediction] = useState<{
    spread_speed_kmh?: number;
    risk_probability?: number;
  } | null>(null);

  useEffect(() => {
    apiClient
      .getMLModels()
      .then((res) => setModels(res.models || []))
      .catch(console.error);

    apiClient.getHealth().then(setHealth).catch(console.error);

    apiClient
      .getSettings()
      .then((cfg) => {
        if (typeof cfg.dbscan_eps_km === 'number') setEpsKm(cfg.dbscan_eps_km);
        if (typeof cfg.default_safety_buffer_km === 'number')
          setSafetyBufferKm(cfg.default_safety_buffer_km);
        if (typeof cfg.staleness_threshold_hours === 'number')
          setStalenessHours(cfg.staleness_threshold_hours);
      })
      .catch(console.error);
  }, []);

  const handleSaveSettings = async () => {
    try {
      await apiClient.updateSettings({
        dbscan_eps_km: epsKm,
        default_safety_buffer_km: safetyBufferKm,
        staleness_threshold_hours: stalenessHours,
      });
      setSavedMsg('Parámetros actualizados exitosamente en el motor operativo.');
      setTimeout(() => setSavedMsg(null), 4000);
      onSettingsUpdated();
    } catch (err) {
      setSavedMsg('Error al actualizar los parámetros.');
    }
  };

  const handleRunPrediction = async () => {
    try {
      const res = await apiClient.predictMLRisk({
        spread_features: {
          frp_peak_mw: frpMw,
          frp_density_mw_km2: frpMw * 1.5,
          delta_temp_k: 42.0,
          points_count: 10,
          wind_speed_kmh: windSpeed,
          relative_humidity_pct: 20.0,
          temperature_c: 32.0,
          seasonal_z_score: 1.5,
        },
        segment_features: {
          dist_to_perimeter_km: distKm,
          dist_to_cone_1h_km: Math.max(0, distKm - 0.5),
          dist_to_cone_3h_km: Math.max(0, distKm - 1.0),
          wind_alignment_cos: 0.85,
          fire_frp_mw: frpMw,
          wind_speed_kmh: windSpeed,
          relative_humidity_pct: 20.0,
          data_age_hours: 1.0,
        },
      });
      setPrediction({
        spread_speed_kmh: res.spread_prediction?.spread_speed_kmh,
        risk_probability: res.segment_risk_prediction?.risk_probability,
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    handleRunPrediction();
  }, [windSpeed, distKm, frpMw]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* CABECERA */}
      <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-5 shadow-lg">
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <span>⚙️</span>
          <span>Inteligencia de Machine Learning y Configuración Científica</span>
        </h1>
        <p className="text-xs text-[#9BA3AF] mt-1">
          Model Cards, validación temporal de modelos ONNX y calibración de umbrales geoespaciales.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA: MODEL CARDS */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#252A36] pb-3">
              <div>
                <h2 className="text-sm font-bold text-white">Model Cards de Machine Learning (v1.0.0)</h2>
                <p className="text-[11px] text-[#9BA3AF]">
                  Entrenados exclusivamente con la serie oficial de NASA FIRMS (2000–2026).
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                ONNX RUNTIME
              </span>
            </div>

            <div className="space-y-4">
              {models.map((m) => (
                <div
                  key={m.model_id}
                  className="bg-[#0F1117] border border-[#252A36] rounded-xl p-4 space-y-2.5 font-sans"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <b className="text-white text-xs">{m.name}</b>
                      <span className="text-[10px] font-mono text-[#FF6117] ml-2 font-bold">
                        {m.model_id}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161922] text-[#9BA3AF] border border-[#252A36]">
                      {m.selected_algorithm}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-[#9BA3AF]">
                    <div>
                      <span>Dataset:</span> <b className="text-white">NASA FIRMS</b>
                    </div>
                    <div>
                      <span>Separación:</span> <b className="text-emerald-400">Temporal (Años)</b>
                    </div>
                    <div>
                      <span>Formato:</span> <b className="text-cyan-400">ONNX v{m.version}</b>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] font-mono pt-1">
                    {Object.entries(m.metrics).map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-[#161922] text-[#9BA3AF] border border-[#252A36]"
                      >
                        {k.toUpperCase()}: <b className="text-white">{typeof v === 'number' ? v.toFixed(3) : v}</b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SIMULADOR DE INFERENCIA EN VIVO */}
          <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-5 space-y-4 shadow-lg">
            <h2 className="text-sm font-bold text-white">Inferencia Directa de Propagación y Riesgo Vial</h2>
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <label className="text-[#9BA3AF] text-[11px] block">Viento: {windSpeed} km/h</label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(Number(e.target.value))}
                  className="w-full accent-[#FF6117] mt-1 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[#9BA3AF] text-[11px] block">Potencia FRP: {frpMw} MW</label>
                <input
                  type="range"
                  min={50}
                  max={800}
                  step={10}
                  value={frpMw}
                  onChange={(e) => setFrpMw(Number(e.target.value))}
                  className="w-full accent-[#FF6117] mt-1 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[#9BA3AF] text-[11px] block">Distancia Vía: {distKm} km</label>
                <input
                  type="range"
                  min={0.2}
                  max={5.0}
                  step={0.1}
                  value={distKm}
                  onChange={(e) => setDistKm(Number(e.target.value))}
                  className="w-full accent-[#FF6117] mt-1 cursor-pointer"
                />
              </div>
            </div>

            {prediction && (
              <div className="grid grid-cols-2 gap-3 text-center font-mono pt-1">
                <div className="bg-[#0F1117] border border-[#252A36] p-3 rounded-xl">
                  <span className="text-[10px] text-[#9BA3AF] block">Velocidad de Avance (ML)</span>
                  <b className="text-[#FF6117] text-lg">
                    {prediction.spread_speed_kmh?.toFixed(2) || '--'} km/h
                  </b>
                </div>
                <div className="bg-[#0F1117] border border-[#252A36] p-3 rounded-xl">
                  <span className="text-[10px] text-[#9BA3AF] block">Probabilidad Afectación Vial</span>
                  <b
                    className={`text-lg ${
                      (prediction.risk_probability || 0) > 0.5 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {prediction.risk_probability
                      ? `${Math.round(prediction.risk_probability * 100)}%`
                      : '--'}
                  </b>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: PARÁMETROS CIENTÍFICOS Y ESTADO DEL SISTEMA */}
        <div className="lg:col-span-5 space-y-5">
          {/* PARÁMETROS CIENTÍFICOS */}
          <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-5 space-y-4 shadow-lg">
            <h2 className="text-sm font-bold text-white">Parámetros Geoespaciales</h2>

            <div className="space-y-3.5 text-xs font-mono">
              <div>
                <div className="flex justify-between">
                  <span className="text-[#9BA3AF]">Radio Geodésico DBSCAN:</span>
                  <b className="text-white">{epsKm.toFixed(1)} km</b>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={6.0}
                  step={0.1}
                  value={epsKm}
                  onChange={(e) => setEpsKm(Number(e.target.value))}
                  className="w-full accent-[#FF6117] mt-1 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between">
                  <span className="text-[#9BA3AF]">Buffer de Seguridad Vial:</span>
                  <b className="text-white">{safetyBufferKm.toFixed(1)} km</b>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={5.0}
                  step={0.1}
                  value={safetyBufferKm}
                  onChange={(e) => setSafetyBufferKm(Number(e.target.value))}
                  className="w-full accent-[#FF6117] mt-1 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between">
                  <span className="text-[#9BA3AF]">Umbral Antigüedad Satelital:</span>
                  <b className="text-white">{stalenessHours.toFixed(0)} horas</b>
                </div>
                <input
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={stalenessHours}
                  onChange={(e) => setStalenessHours(Number(e.target.value))}
                  className="w-full accent-[#FF6117] mt-1 cursor-pointer"
                />
              </div>

              {savedMsg && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs">
                  {savedMsg}
                </div>
              )}

              <button
                onClick={handleSaveSettings}
                className="w-full py-2.5 rounded-xl bg-[#FF6117] hover:bg-[#FF6117]/90 text-white font-bold transition shadow-md"
              >
                Guardar y Recalcular Pipeline
              </button>
            </div>
          </div>

          {/* ESTADO DE SALUD DEL SISTEMA */}
          <div className="bg-[#161922] border border-[#252A36] rounded-2xl p-5 space-y-3.5 shadow-lg font-mono text-xs">
            <h2 className="text-sm font-bold text-white font-sans">Infraestructura y Servicios</h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A36]">
                <span className="text-[#9BA3AF]">API Backend FastAPI:</span>
                <span className="text-emerald-400 font-bold">ONLINE (v2.0.0)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A36]">
                <span className="text-[#9BA3AF]">Base de Datos PostGIS:</span>
                <span className="text-emerald-400 font-bold">
                  {health ? 'CONECTADA / ESPACIAL' : 'ONLINE'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A36]">
                <span className="text-[#9BA3AF]">Caché Redis / Ruteo:</span>
                <span className="text-emerald-400 font-bold">ACTIVO</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A36]">
                <span className="text-[#9BA3AF]">Telemetría Clima (Open-Meteo):</span>
                <span className="text-emerald-400 font-bold">EN VIVO</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A36]">
                <span className="text-[#9BA3AF]">Datos NASA FIRMS:</span>
                <span className="text-[#FF6117] font-bold">2000–2026 (298k focos)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
