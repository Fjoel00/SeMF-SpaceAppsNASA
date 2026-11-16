import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';

interface SettingsPageProps {
  onSettingsUpdated: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onSettingsUpdated,
}) => {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [epsKm, setEpsKm] = useState<number>(2.5);
  const [safetyBufferKm, setSafetyBufferKm] = useState<number>(1.2);
  const [stalenessHours, setStalenessHours] = useState<number>(12.0);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
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

  const handleSave = async () => {
    await apiClient.updateSettings({
      dbscan_eps_km: epsKm,
      default_safety_buffer_km: safetyBufferKm,
      staleness_threshold_hours: stalenessHours,
    });
    setSavedMsg('Parámetros científicos actualizados y pipeline recalculado.');
    onSettingsUpdated();
  };

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white">
          Parámetros Científicos y Geoespaciales
        </h2>

        <div className="space-y-3 text-xs font-mono">
          <div>
            <label className="text-slate-400 block">
              Radio Geodésico DBSCAN Haversine (eps_km):{' '}
              <b className="text-white">{epsKm} km</b>
            </label>
            <input
              type="range"
              min={0.5}
              max={8.0}
              step={0.1}
              value={epsKm}
              onChange={(e) => setEpsKm(Number(e.target.value))}
              className="w-full accent-orange-500 mt-1"
            />
          </div>

          <div>
            <label className="text-slate-400 block">
              Buffer de Seguridad Vial por Defecto:{' '}
              <b className="text-white">{safetyBufferKm} km</b>
            </label>
            <input
              type="range"
              min={0.4}
              max={5.0}
              step={0.1}
              value={safetyBufferKm}
              onChange={(e) => setSafetyBufferKm(Number(e.target.value))}
              className="w-full accent-emerald-500 mt-1"
            />
          </div>

          <div>
            <label className="text-slate-400 block">
              Umbral de Antigüedad de Datos Satelitales:{' '}
              <b className="text-white">{stalenessHours} horas</b>
            </label>
            <input
              type="range"
              min={2}
              max={48}
              step={1}
              value={stalenessHours}
              onChange={(e) => setStalenessHours(Number(e.target.value))}
              className="w-full accent-cyan-500 mt-1"
            />
          </div>

          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold"
          >
            Guardar y Recalcular Clustering
          </button>

          {savedMsg && <div className="text-emerald-400">{savedMsg}</div>}
        </div>
      </div>

      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-white">
          Estado de Salud de Servicios (Healthcheck)
        </h2>
        <pre className="p-3 rounded-lg bg-[#111827] border border-[#1E293B] text-xs font-mono text-emerald-300 overflow-x-auto">
          {health ? JSON.stringify(health, null, 2) : 'Consultando /api/v1/health...'}
        </pre>
      </div>
    </div>
  );
};
