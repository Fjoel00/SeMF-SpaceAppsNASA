import React, { useState } from 'react';
import { useSeMFStore } from '../../stores/useSeMFStore';
import type { ActiveFiresPayload } from '../../types/semf';
import { TacticalMapCanvas } from '../../components/map/TacticalMapCanvas';

interface TacticalConsolePageProps {
  firesData: ActiveFiresPayload | null;
}

export const TacticalConsolePage: React.FC<TacticalConsolePageProps> = ({
  firesData,
}) => {
  const {
    selectedEvent,
    setSelectedEvent,
    simulation,
    setSimulationEnabled,
    updateSimulationWeather,
    addInjectedFire,
    clearInjectedFires,
    setActiveView,
  } = useSeMFStore();
  const [simSeverity, setSimSeverity] = useState<'moderate' | 'critical' | 'catastrophic'>('critical');

  if (!firesData) return null;
  const activeEv = selectedEvent || firesData.events[0] || null;

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
      {/* PANEL IZQUIERDO: CONTROL DE INCIDENTES Y SIMULADOR */}
      <div className="lg:col-span-4 space-y-4 overflow-y-auto">
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">
              Comando Táctico de Frente
            </h2>
            {activeEv && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                {activeEv.event_id}
              </span>
            )}
          </div>

          {activeEv && (
            <div className="space-y-2.5 text-xs">
              <div className="text-slate-300 font-medium">
                {activeEv.location_name} ({activeEv.province})
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-center">
                <div className="p-2 rounded bg-[#111827] border border-[#1E293B]">
                  <span className="text-[10px] text-slate-400 block">Superficie</span>
                  <b className="text-white">{activeEv.detection_area_ha} ha</b>
                </div>
                <div className="p-2 rounded bg-[#111827] border border-[#1E293B]">
                  <span className="text-[10px] text-slate-400 block">Velocidad ML</span>
                  <b className="text-orange-400">{activeEv.projected_speed_kmh} km/h</b>
                </div>
                <div className="p-2 rounded bg-[#111827] border border-[#1E293B]">
                  <span className="text-[10px] text-slate-400 block">Rumbo</span>
                  <b className="text-cyan-400">
                    {activeEv.projected_cardinal} ({activeEv.projected_azimuth_deg}°)
                  </b>
                </div>
              </div>
              <div className="flex justify-between font-mono text-[11px] text-slate-400 pt-1">
                <span>Energía Radiativa (FRE):</span>
                <b className="text-amber-300">{(activeEv.fre_est_mj / 1000).toFixed(2)} GJ</b>
              </div>
              <div className="flex justify-between font-mono text-[11px] text-slate-400">
                <span>Satélites:</span>
                <b className="text-slate-200">{activeEv.satellites_involved}</b>
              </div>
              <button
                onClick={() => setActiveView('routing')}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                Calcular Evacuación desde este Frente
              </button>
            </div>
          )}
        </div>

        {/* SIMULADOR DE INYECCIÓN OPERATIVA */}
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Inyección Operativa (Simulador)
              </h3>
              <p className="text-[11px] text-slate-400">
                Entrenamiento controlado de brigadas sin alterar datos reales
              </p>
            </div>
            <input
              type="checkbox"
              checked={simulation.enabled}
              onChange={(e) => setSimulationEnabled(e.target.checked)}
              className="w-4 h-4 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div>
              <div className="flex justify-between text-slate-300">
                <span>Velocidad Viento:</span>
                <b className="text-orange-400">{simulation.windSpeedKmh} km/h</b>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={simulation.windSpeedKmh}
                onChange={(e) =>
                  updateSimulationWeather({ windSpeedKmh: Number(e.target.value) })
                }
                className="w-full accent-orange-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300">
                <span>Dirección Viento (Origen):</span>
                <b className="text-cyan-400">{simulation.windDirectionDeg}°</b>
              </div>
              <input
                type="range"
                min={0}
                max={359}
                value={simulation.windDirectionDeg}
                onChange={(e) =>
                  updateSimulationWeather({ windDirectionDeg: Number(e.target.value) })
                }
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-400 block">Temp: {simulation.temperatureC}°C</span>
                <input
                  type="range"
                  min={8}
                  max={46}
                  value={simulation.temperatureC}
                  onChange={(e) =>
                    updateSimulationWeather({ temperatureC: Number(e.target.value) })
                  }
                  className="w-full accent-red-500"
                />
              </div>
              <div>
                <span className="text-slate-400 block">HR: {simulation.relativeHumidityPct}%</span>
                <input
                  type="range"
                  min={8}
                  max={90}
                  value={simulation.relativeHumidityPct}
                  onChange={(e) =>
                    updateSimulationWeather({
                      relativeHumidityPct: Number(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <select
                value={simSeverity}
                onChange={(e) =>
                  setSimSeverity(e.target.value as 'moderate' | 'critical' | 'catastrophic')
                }
                className="bg-[#111827] border border-[#1E293B] rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="moderate">Moderado (120 MW)</option>
                <option value="critical">Crítico (360 MW)</option>
                <option value="catastrophic">Catastrófico (750 MW)</option>
              </select>

              <button
                onClick={clearInjectedFires}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
              >
                Limpiar ({simulation.injectedFires.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MAPA TÁCTICO DERECHO */}
      <div className="lg:col-span-8 min-h-[480px]">
        <TacticalMapCanvas
          events={firesData.events}
          points={firesData.points}
          selectedEventId={activeEv?.event_id}
          onSelectEvent={(ev) => setSelectedEvent(ev)}
          onMapClickCoordinates={(lat, lon) => {
            if (simulation.enabled) {
              addInjectedFire(lat, lon, simSeverity);
            }
          }}
        />
      </div>
    </div>
  );
};
