import React from 'react';
import { useSeMFStore } from '../../stores/useSeMFStore';
import type { ActiveFiresPayload } from '../../types/semf';
import { TacticalMapCanvas } from '../../components/map/TacticalMapCanvas';

interface MonitorPageProps {
  firesData: ActiveFiresPayload | null;
}

export const MonitorPage: React.FC<MonitorPageProps> = ({ firesData }) => {
  const { selectedPixel, setSelectedPixel, layers, toggleLayer } = useSeMFStore();

  if (!firesData) return null;
  const activePixel = selectedPixel || firesData.points[0] || null;
  const calib = firesData.cross_sensor_calibration;

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
      {/* COLUMNA IZQUIERDA: CONTROLES DE CAPAS Y MAPA MULTISENSOR */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => toggleLayer('viirsPoints')}
              className={`px-3 py-1 rounded-md text-xs font-mono border ${
                layers.viirsPoints
                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
            >
              VIIRS 375m ({firesData.kpis.viirs_detections})
            </button>
            <button
              onClick={() => toggleLayer('modisPoints')}
              className={`px-3 py-1 rounded-md text-xs font-mono border ${
                layers.modisPoints
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
            >
              MODIS 1km ({firesData.kpis.modis_detections})
            </button>
            <button
              onClick={() => toggleLayer('firePerimeters')}
              className={`px-3 py-1 rounded-md text-xs font-mono border ${
                layers.firePerimeters
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}
            >
              Perímetros DBSCAN ({firesData.events.length})
            </button>
          </div>

          <a
            href="/api/v1/fires/geojson"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1 rounded-md text-xs font-mono bg-[#111827] hover:bg-slate-800 text-cyan-400 border border-[#1E293B]"
          >
            Exportar GeoJSON OGC
          </a>
        </div>

        <div className="flex-1 min-h-[420px]">
          <TacticalMapCanvas
            events={firesData.events}
            points={firesData.points}
          />
        </div>
      </div>

      {/* COLUMNA DERECHA: INSPECTOR FÍSICO DE PÍXEL Y ARMONIZACIÓN */}
      <div className="lg:col-span-4 space-y-4 overflow-y-auto">
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-white">
            Inspector Radiométrico de Píxel
          </h2>
          {activePixel ? (
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">ID / Sensor:</span>
                <span className="text-orange-400 font-bold">
                  {activePixel.point_id} • {activePixel.sensor_family} ({activePixel.satellite_name})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Coordenadas:</span>
                <span className="text-white">
                  [{activePixel.latitude}, {activePixel.longitude}]
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Canal 4 (~4 µm MIR):</span>
                <span className="text-red-400 font-bold">
                  {activePixel.temp_ch4_k} K {activePixel.is_saturated_i4 ? '(SATURACIÓN I4)' : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Canal 5 (~11 µm TIR):</span>
                <span className="text-slate-200">{activePixel.temp_ch5_k} K</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Anomalía Térmica (ΔT):</span>
                <span className="text-amber-400 font-bold">
                  +{activePixel.delta_temp_k} K
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Huella (Scan × Track):</span>
                <span className="text-slate-200">
                  {activePixel.scan_km} × {activePixel.track_km} km ({activePixel.pixel_area_km2} km²)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Densidad Radiativa:</span>
                <span className="text-cyan-400 font-bold">
                  {activePixel.frp_density_mw_km2} MW/km²
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Confianza Normalizada:</span>
                <span className="text-emerald-400">
                  {activePixel.confidence_cat} ({Math.round(activePixel.confidence_score * 100)}%)
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Sin píxel seleccionado.</p>
          )}
        </div>

        {/* LISTADO DE DETECCIONES INDIVIDUALES */}
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Píxeles Térmicos Armonizados ({firesData.points.length})
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">
              Co-detectados: {calib.colocated_fronts_count}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {firesData.points.map((pt) => (
              <button
                key={pt.point_id}
                onClick={() => setSelectedPixel(pt)}
                className={`w-full text-left p-2 rounded-lg border text-xs font-mono flex items-center justify-between transition ${
                  activePixel?.point_id === pt.point_id
                    ? 'bg-orange-500/15 border-orange-500/40 text-white'
                    : 'bg-[#111827] border-[#1E293B] text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>
                  {pt.sensor_family} • {pt.satellite_name}
                </span>
                <span className="text-orange-400 font-bold">
                  {pt.frp_mw} MW ({pt.temp_ch4_k}K)
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
