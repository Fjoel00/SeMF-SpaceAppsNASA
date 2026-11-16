import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import { useSeMFStore } from '../../stores/useSeMFStore';
import type {
  ActiveFiresPayload,
  EvacuationPlanResponse,
  SafeShelter,
} from '../../types/semf';
import { TacticalMapCanvas } from '../../components/map/TacticalMapCanvas';

interface EscapeRoutingPageProps {
  firesData: ActiveFiresPayload | null;
  shelters: SafeShelter[];
}

export const EscapeRoutingPage: React.FC<EscapeRoutingPageProps> = ({
  firesData,
  shelters,
}) => {
  const {
    userOrigin,
    setUserOrigin,
    targetShelterId,
    setTargetShelterId,
    safetyBufferKm,
    setSafetyBufferKm,
  } = useSeMFStore();

  const [plan, setPlan] = useState<EvacuationPlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [simulatedAgeHours, setSimulatedAgeHours] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const computeRoutes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.calculateEvacuationPlan({
        origin_lat: userOrigin.lat,
        origin_lon: userOrigin.lon,
        target_shelter_id: targetShelterId,
        safety_buffer_km: safetyBufferKm,
        max_alternatives: 4,
        allow_unverified_shelters: true,
        simulated_data_age_hours: simulatedAgeHours,
      });
      setPlan(res);
      setSelectedRouteId(
        res.recommended_route?.route_id || res.alternative_routes[0]?.route_id || null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error calculando rutas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    computeRoutes();
  }, [userOrigin.lat, userOrigin.lon, targetShelterId, safetyBufferKm, simulatedAgeHours]);

  const activeRoute =
    plan?.alternative_routes.find((r) => r.route_id === selectedRouteId) ||
    plan?.recommended_route ||
    null;

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
      {/* COLUMNA IZQUIERDA: CONFIGURACIÓN Y COMPARADOR DE RUTAS */}
      <div className="lg:col-span-5 space-y-4 overflow-y-auto pr-1">
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">
              Planificador de Rutas de Evacuación
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Determinista + ML ONNX
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <label className="text-slate-400 text-[10px] block">Latitud Origen</label>
              <input
                type="number"
                step="0.005"
                value={userOrigin.lat}
                onChange={(e) => setUserOrigin(Number(e.target.value), userOrigin.lon)}
                className="w-full bg-[#111827] border border-[#1E293B] rounded px-2.5 py-1.5 text-white mt-0.5"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px] block">Longitud Origen</label>
              <input
                type="number"
                step="0.005"
                value={userOrigin.lon}
                onChange={(e) => setUserOrigin(userOrigin.lat, Number(e.target.value))}
                className="w-full bg-[#111827] border border-[#1E293B] rounded px-2.5 py-1.5 text-white mt-0.5"
              />
            </div>
          </div>

          <div className="text-xs space-y-1">
            <label className="text-slate-400 text-[11px] block">
              Destino Seguro (Refugio / Cuartel de Bomberos / Hospital)
            </label>
            <select
              value={targetShelterId || ''}
              onChange={(e) => setTargetShelterId(e.target.value || null)}
              className="w-full bg-[#111827] border border-[#1E293B] rounded-lg px-2.5 py-2 text-xs text-slate-200 font-mono"
            >
              <option value="">
                Selección Automática Óptima (Fuera de Conos y Verificado)
              </option>
              {shelters.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name} ({sh.locality}) {!sh.is_verified_reliable ? '[NO VERIFICADO]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">Buffer de Seguridad Térmica:</span>
              <b className="text-orange-400">{safetyBufferKm.toFixed(1)} km</b>
            </div>
            <input
              type="range"
              min={0.4}
              max={4.5}
              step={0.1}
              value={safetyBufferKm}
              onChange={(e) => setSafetyBufferKm(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          {/* BOTONES DE PRUEBA DE ESCENARIOS CRÍTICOS */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <button
              onClick={() => {
                setSimulatedAgeHours(null);
                setTargetShelterId('SHL-SL-001');
                setUserOrigin(-33.15, -66.064);
              }}
              className="px-2 py-1 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              Escenario Vía Libre
            </button>
            <button
              onClick={() => {
                setSimulatedAgeHours(null);
                setTargetShelterId('SHL-SL-001');
                setUserOrigin(-33.275, -65.953);
              }}
              className="px-2 py-1 rounded text-[10px] font-mono bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
            >
              Escenario Cruce Fuego (El Trapiche)
            </button>
            <button
              onClick={() =>
                setSimulatedAgeHours(simulatedAgeHours ? null : 20.0)
              }
              className="px-2 py-1 rounded text-[10px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30"
            >
              {simulatedAgeHours ? 'Restaurar Frescura NRT' : 'Simular Datos >12h'}
            </button>
          </div>
        </div>

        {/* ADVERTENCIAS GLOBALES */}
        {error && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-xs text-red-200 font-mono">
            {error}
          </div>
        )}

        {plan?.global_warnings.map((w, i) => (
          <div
            key={`${w.code}_${i}`}
            className={`p-3 rounded-xl border text-xs ${
              w.severity === 'CRITICAL'
                ? 'bg-red-950/70 border-red-500 text-red-200'
                : 'bg-amber-950/50 border-amber-500/50 text-amber-200'
            }`}
          >
            <div className="font-mono font-bold text-[11px]">{w.code}</div>
            <p className="mt-0.5">{w.message}</p>
          </div>
        ))}

        {/* LISTA COMPARATIVA DE RUTAS ALTERNATIVAS */}
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Rutas Alternativas Evaluadas ({plan?.alternative_routes.length || 0})
            </h3>
            {loading && (
              <span className="text-[11px] font-mono text-cyan-400">Calculando...</span>
            )}
          </div>

          <div className="space-y-2">
            {plan?.alternative_routes.map((rt) => {
              const isSelected = rt.route_id === activeRoute?.route_id;
              const badgeStyle =
                rt.safety_status === 'SAFE'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : rt.safety_status === 'WARNING'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-red-500/25 text-red-300 border-red-500/50';

              return (
                <div
                  key={rt.route_id}
                  onClick={() => setSelectedRouteId(rt.route_id)}
                  className={`p-3 rounded-lg border cursor-pointer transition space-y-1.5 ${
                    isSelected
                      ? 'bg-[#111827] border-cyan-500/60'
                      : 'bg-[#111827]/60 border-[#1E293B] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-white">
                      {rt.route_id} • {rt.corridor_name}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badgeStyle}`}>
                      {rt.safety_status} {rt.is_recommended ? '★ RECOMENDADA' : ''}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-300">
                    Destino: <b>{rt.target_shelter.name}</b>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-400">
                    <div>
                      Dist: <b className="text-white">{rt.distance_km} km</b>
                    </div>
                    <div>
                      ETA: <b className="text-white">{rt.estimated_time_min} min</b>
                    </div>
                    <div>
                      Riesgo ML:{' '}
                      <b className="text-cyan-400">
                        {(rt.ml_risk_score * 100).toFixed(1)}%
                      </b>
                    </div>
                  </div>

                  {rt.blocked_reasons.map((br, idx) => (
                    <div key={idx} className="text-[11px] font-mono text-red-400">
                      ⛔ {br}
                    </div>
                  ))}
                  {rt.warnings.map((wr, idx) => (
                    <div key={idx} className="text-[11px] font-mono text-amber-300">
                      ⚠️ {wr}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* COLUMNA DERECHA: MAPA DE RUTAS Y PERFIL DE EXPOSICIÓN POR SEGMENTO */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="flex-1 min-h-[400px]">
          <TacticalMapCanvas
            events={firesData?.events || []}
            shelters={shelters}
            routes={plan?.alternative_routes || []}
            conservativeCorridor={
              plan?.conservative_escape_corridor?.corridor_coords || null
            }
            userOrigin={userOrigin}
            onMapClickCoordinates={(lat, lon) => setUserOrigin(lat, lon)}
          />
        </div>

        {/* PERFIL LONGITUDINAL DE DISTANCIA AL FUEGO Y RIESGO ML */}
        {activeRoute && (
          <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300">
                Perfil de Proximidad al Fuego — {activeRoute.route_id} (Mín:{' '}
                {activeRoute.min_distance_to_fire_km} km | Buffer:{' '}
                {activeRoute.effective_safety_buffer_km} km)
              </h3>
              <span className="text-[11px] font-mono text-cyan-400">
                Modo: {activeRoute.ml_evaluation_mode}
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 font-mono text-[10px]">
              {activeRoute.proximity_profile.slice(0, 16).map((pt, idx) => (
                <div
                  key={idx}
                  className={`p-1.5 rounded border text-center ${
                    pt.tier === 'BLOCKED'
                      ? 'bg-red-950/60 border-red-500/50 text-red-300'
                      : pt.tier === 'WARNING'
                      ? 'bg-amber-950/50 border-amber-500/40 text-amber-300'
                      : 'bg-[#111827] border-[#1E293B] text-emerald-300'
                  }`}
                >
                  <div className="text-slate-400">Km {pt.km_mark}</div>
                  <div className="font-bold">{pt.dist_to_fire_km} km</div>
                  <div>{pt.ml_risk_pct}% ML</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
