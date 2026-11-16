import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import { useSeMFStore } from '../../stores/useSeMFStore';
import type {
  ActiveFiresPayload,
  EvacuationPlanResponse,
  FireFrontEvent,
  SafeShelter,
} from '../../types/semf';
import { TacticalMapCanvas } from '../../components/map/TacticalMapCanvas';

interface TacticalConsolePageProps {
  firesData: ActiveFiresPayload | null;
  shelters: SafeShelter[];
}

export const TacticalConsolePage: React.FC<TacticalConsolePageProps> = ({
  firesData,
  shelters,
}) => {
  const {
    selectedEvent,
    setSelectedEvent,
    userOrigin,
    setUserOrigin,
    targetShelterId,
    setTargetShelterId,
    safetyBufferKm,
    setSafetyBufferKm,
  } = useSeMFStore();

  const [activeSideTab, setActiveSideTab] = useState<'frentes' | 'rutas' | 'refugios'>('frentes');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(false);

  // Estado del cálculo de rutas de escape
  const [plan, setPlan] = useState<EvacuationPlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState<boolean>(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const events = firesData?.events || [];
  const activeEv: FireFrontEvent | null = selectedEvent || events[0] || null;

  // Cálculo determinista y ML de rutas
  const computeRoutes = async () => {
    setIsRoutingLoading(true);
    setRoutingError(null);
    try {
      const res = await apiClient.calculateEvacuationPlan({
        origin_lat: userOrigin.lat,
        origin_lon: userOrigin.lon,
        target_shelter_id: targetShelterId,
        safety_buffer_km: safetyBufferKm,
        max_alternatives: 4,
        allow_unverified_shelters: true,
      });
      setPlan(res);
      setSelectedRouteId(
        res.recommended_route?.route_id || res.alternative_routes[0]?.route_id || null
      );
    } catch (err) {
      setRoutingError(err instanceof Error ? err.message : 'Error al calcular rutas');
    } finally {
      setIsRoutingLoading(false);
    }
  };

  useEffect(() => {
    computeRoutes();
  }, [userOrigin.lat, userOrigin.lon, targetShelterId, safetyBufferKm]);

  // Obtener geolocalización real del usuario
  const requestUserGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocalización no soportada por el navegador.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        setUserOrigin(lat, lon);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(`Error GPS: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const activeRoute =
    plan?.alternative_routes.find((r) => r.route_id === selectedRouteId) ||
    plan?.recommended_route ||
    null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0F1117] flex">
      {/* MAPA A PANTALLA COMPLETA */}
      <div className="flex-1 h-full w-full relative">
        <TacticalMapCanvas
          events={events}
          points={firesData?.points || []}
          shelters={shelters}
          routes={plan?.alternative_routes || []}
          conservativeCorridor={plan?.conservative_escape_corridor?.corridor_coords || null}
          userOrigin={userOrigin}
          selectedEventId={activeEv?.event_id || null}
          onSelectEvent={(ev) => {
            setSelectedEvent(ev);
            setActiveSideTab('frentes');
            setIsPanelCollapsed(false);
          }}
          onMapClickCoordinates={(lat, lon) => {
            setUserOrigin(lat, lon);
          }}
          heightClass="h-full"
          defaultBasemap="satellite"
        />
      </div>

      {/* PANEL LATERAL FLOTANTE COLAPSABLE */}
      <div
        className={`absolute top-3 left-3 bottom-3 z-30 transition-all duration-300 flex ${
          isPanelCollapsed ? 'w-10' : 'w-full max-w-[420px]'
        }`}
      >
        {/* CUERPO DEL PANEL */}
        {!isPanelCollapsed && (
          <div className="flex-1 h-full bg-[#161922]/95 backdrop-blur-md border border-[#252A36] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* CABECERA CON PESTAÑAS DEL PANEL */}
            <div className="p-3 border-b border-[#252A36] flex items-center justify-between shrink-0">
              <div
                className="flex bg-[#0F1117] p-1 rounded-xl border border-[#252A36] gap-1"
                role="tablist"
                aria-label="Controles tácticos"
              >
                <button
                  role="tab"
                  aria-selected={activeSideTab === 'frentes'}
                  onClick={() => setActiveSideTab('frentes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeSideTab === 'frentes'
                      ? 'bg-[#FF6117] text-white shadow'
                      : 'text-[#9BA3AF] hover:text-white'
                  }`}
                >
                  🔥 Focos ({events.length})
                </button>
                <button
                  role="tab"
                  aria-selected={activeSideTab === 'rutas'}
                  onClick={() => setActiveSideTab('rutas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeSideTab === 'rutas'
                      ? 'bg-[#FF6117] text-white shadow'
                      : 'text-[#9BA3AF] hover:text-white'
                  }`}
                >
                  🧭 Rutas
                </button>
                <button
                  role="tab"
                  aria-selected={activeSideTab === 'refugios'}
                  onClick={() => setActiveSideTab('refugios')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeSideTab === 'refugios'
                      ? 'bg-[#FF6117] text-white shadow'
                      : 'text-[#9BA3AF] hover:text-white'
                  }`}
                >
                  🛡️ Refugios ({shelters.length})
                </button>
              </div>

              <button
                onClick={() => setIsPanelCollapsed(true)}
                aria-label="Ocultar panel lateral"
                className="p-1.5 rounded-lg text-[#9BA3AF] hover:text-white hover:bg-[#1F2430] transition"
                title="Colapsar panel"
              >
                ◀
              </button>
            </div>

            {/* CONTENIDO DESPLAZABLE DEL PANEL */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
              {/* SUBPESTAÑA 1: FOCOS Y FRENTES ACTIVOS */}
              {activeSideTab === 'frentes' && (
                <div className="space-y-3">
                  {events.length === 0 ? (
                    <div className="p-8 text-center bg-[#0F1117] rounded-xl border border-[#252A36] space-y-2">
                      <span className="text-3xl">🌿</span>
                      <p className="text-white font-bold text-sm">No hay focos activos en esta zona</p>
                      <p className="text-[#9BA3AF] text-xs">
                        No se detectan anomalías térmicas satelitales en las últimas pasadas de NASA FIRMS.
                      </p>
                    </div>
                  ) : (
                    <>
                      {activeEv && (
                        <div className="bg-[#0F1117] border border-[#FF6117]/40 rounded-xl p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-bold text-sm">
                              {activeEv.location_name}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold">
                              {activeEv.event_id}
                            </span>
                          </div>
                          <div className="text-[#9BA3AF] text-[11px] font-mono">
                            Provincia: <b className="text-white">{activeEv.province}</b> • Puntos:{' '}
                            <b className="text-white">{activeEv.points_count}</b>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-center font-mono">
                            <div className="p-2 rounded-lg bg-[#161922] border border-[#252A36]">
                              <span className="text-[10px] text-[#9BA3AF] block">Potencia (FRP)</span>
                              <b className="text-[#FF6117]">{Math.round(activeEv.frp_peak_mw)} MW</b>
                            </div>
                            <div className="p-2 rounded-lg bg-[#161922] border border-[#252A36]">
                              <span className="text-[10px] text-[#9BA3AF] block">Superficie</span>
                              <b className="text-white">{activeEv.detection_area_ha} ha</b>
                            </div>
                            <div className="p-2 rounded-lg bg-[#161922] border border-[#252A36]">
                              <span className="text-[10px] text-[#9BA3AF] block">Avance ML</span>
                              <b className="text-orange-400">{activeEv.projected_speed_kmh} km/h</b>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setUserOrigin(activeEv.centroid_lat + 0.015, activeEv.centroid_lon);
                              setActiveSideTab('rutas');
                            }}
                            className="w-full py-2 rounded-xl bg-[#FF6117] hover:bg-[#FF6117]/90 text-white font-bold text-xs transition shadow-md"
                          >
                            Calcular Escape desde este Punto
                          </button>
                        </div>
                      )}

                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-mono uppercase text-[#9BA3AF] tracking-wider font-bold block">
                          Todos los Frentes Detectados ({events.length})
                        </span>
                        {events.map((ev) => {
                          const isSel = ev.event_id === activeEv?.event_id;
                          return (
                            <div
                              key={ev.event_id}
                              onClick={() => setSelectedEvent(ev)}
                              className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                                isSel
                                  ? 'bg-[#1F2430] border-[#FF6117]'
                                  : 'bg-[#0F1117] border-[#252A36] hover:border-[#FF6117]/50'
                              }`}
                            >
                              <div>
                                <div className="text-white font-bold">{ev.location_name}</div>
                                <div className="text-[11px] text-[#9BA3AF] font-mono">
                                  {ev.province} • {ev.points_count} detecciones satelitales
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <b className="text-[#FF6117]">{Math.round(ev.frp_peak_mw)} MW</b>
                                <span className="text-[10px] text-[#9BA3AF] block">
                                  {ev.projected_speed_kmh} km/h
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* SUBPESTAÑA 2: RUTAS DE EVACUACIÓN Y ESCAPE */}
              {activeSideTab === 'rutas' && (
                <div className="space-y-3.5">
                  <div className="bg-[#0F1117] border border-[#252A36] rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold text-xs">Ubicación de Salida</span>
                      <button
                        onClick={requestUserGps}
                        disabled={gpsLoading}
                        aria-label="Usar mi ubicación GPS"
                        className="px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800 text-[11px] font-semibold hover:bg-cyan-900 transition flex items-center gap-1"
                      >
                        <span>📍</span>
                        <span>{gpsLoading ? 'Localizando...' : 'Mi GPS'}</span>
                      </button>
                    </div>

                    {gpsError && (
                      <p className="text-red-400 text-[11px] font-mono">{gpsError}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <label className="text-[10px] text-[#9BA3AF] block">Latitud</label>
                        <input
                          type="number"
                          step="0.001"
                          value={userOrigin.lat}
                          onChange={(e) => setUserOrigin(Number(e.target.value), userOrigin.lon)}
                          className="w-full bg-[#161922] border border-[#252A36] rounded-lg px-2.5 py-1 text-white text-xs mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#9BA3AF] block">Longitud</label>
                        <input
                          type="number"
                          step="0.001"
                          value={userOrigin.lon}
                          onChange={(e) => setUserOrigin(userOrigin.lat, Number(e.target.value))}
                          className="w-full bg-[#161922] border border-[#252A36] rounded-lg px-2.5 py-1 text-white text-xs mt-0.5"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-[#9BA3AF] block">
                        Refugio de Destino (Opcional)
                      </label>
                      <select
                        value={targetShelterId || ''}
                        onChange={(e) => setTargetShelterId(e.target.value || null)}
                        aria-label="Seleccionar refugio de destino"
                        className="w-full bg-[#161922] border border-[#252A36] rounded-lg px-2.5 py-1.5 text-white text-xs mt-0.5"
                      >
                        <option value="">Refugio más seguro automático</option>
                        {shelters.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.province}) — Cap: {s.capacity_persons}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-[#9BA3AF]">Distancia de Seguridad:</span>
                        <b className="text-white">{safetyBufferKm.toFixed(1)} km</b>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={5.0}
                        step={0.1}
                        value={safetyBufferKm}
                        onChange={(e) => setSafetyBufferKm(Number(e.target.value))}
                        className="w-full accent-[#FF6117] cursor-pointer mt-1"
                      />
                    </div>
                  </div>

                  {/* ESTADO GENERAL DE LA RUTA */}
                  {isRoutingLoading ? (
                    <div className="p-6 text-center text-[#9BA3AF] font-mono text-xs flex items-center justify-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                      <span>Evaluando geometría vial contra perímetros activos...</span>
                    </div>
                  ) : routingError ? (
                    <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-red-300 text-xs">
                      {routingError}
                    </div>
                  ) : plan ? (
                    <div className="space-y-2.5">
                      {/* BANNER DE ESTADO */}
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between ${
                          plan.overall_status === 'SAFE_ROUTE_VERIFIED'
                            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                            : plan.overall_status === 'ROUTE_WITH_CAUTION_WARNINGS'
                            ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                            : 'bg-red-950/40 border-red-500/50 text-red-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {plan.overall_status === 'SAFE_ROUTE_VERIFIED'
                              ? '✅'
                              : plan.overall_status === 'ROUTE_WITH_CAUTION_WARNINGS'
                              ? '⚠️'
                              : '🛑'}
                          </span>
                          <div>
                            <div className="font-bold">
                              {plan.overall_status === 'SAFE_ROUTE_VERIFIED'
                                ? 'Vía Despejada y Segura'
                                : plan.overall_status === 'ROUTE_WITH_CAUTION_WARNINGS'
                                ? 'Precaución por Proximidad al Fuego'
                                : 'Ruta Principal Bloqueada por Fuego'}
                            </div>
                            <div className="text-[10px] opacity-80">
                              {plan.passable_routes_count} rutas transitables • {plan.blocked_routes_count} bloqueadas
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CORREDOR DE FLANCO CONSERVADOR SI TODAS ESTÁN BLOQUEADAS */}
                      {plan.conservative_escape_corridor && (
                        <div className="p-3 bg-orange-950/40 border border-orange-500/60 rounded-xl text-orange-200 text-xs space-y-1">
                          <div className="font-bold flex items-center gap-1.5">
                            <span>🛡️</span>
                            <span>Escape Conservador por Flanco Activado</span>
                          </div>
                          <p className="text-[11px] opacity-90">
                            {plan.conservative_escape_corridor.instruction}
                          </p>
                        </div>
                      )}

                      {/* LISTA DE RUTAS ALTERNATIVAS */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-mono text-[#9BA3AF] uppercase font-bold block">
                          Alternativas Disponibles
                        </span>
                        {plan.alternative_routes.map((r) => {
                          const isSel = r.route_id === (activeRoute?.route_id || selectedRouteId);
                          const isSafe = r.safety_status === 'SAFE';
                          const isWarn = r.safety_status === 'WARNING';
                          return (
                            <div
                              key={r.route_id}
                              onClick={() => setSelectedRouteId(r.route_id)}
                              className={`p-3 rounded-xl border cursor-pointer transition ${
                                isSel
                                  ? 'bg-[#1F2430] border-[#FF6117]'
                                  : 'bg-[#0F1117] border-[#252A36] hover:border-[#FF6117]/40'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white">{r.corridor_name}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                    isSafe
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : isWarn
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-red-500/20 text-red-300'
                                  }`}
                                >
                                  {isSafe ? 'DESPEJADA' : isWarn ? 'PRECAUCIÓN' : 'BLOQUEADA'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[11px] font-mono text-[#9BA3AF] mt-1.5">
                                <span>Distancia: <b>{r.distance_km} km</b></span>
                                <span>Tiempo: <b>{Math.round(r.estimated_time_min)} min</b></span>
                                <span>Riesgo ML: <b className="text-white">{Math.round(r.ml_risk_score * 100)}%</b></span>
                              </div>

                              {r.blocked_reasons.length > 0 && (
                                <p className="text-red-400 text-[10px] mt-1 italic">
                                  {r.blocked_reasons[0]}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* SUBPESTAÑA 3: REFUGIOS Y BOMBEROS */}
              {activeSideTab === 'refugios' && (
                <div className="space-y-2.5">
                  <span className="text-[11px] font-mono text-[#9BA3AF] uppercase font-bold block">
                    Puntos de Evacuación Auditados ({shelters.length})
                  </span>
                  {shelters.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setTargetShelterId(s.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        targetShelterId === s.id
                          ? 'bg-[#1F2430] border-[#FF6117]'
                          : 'bg-[#0F1117] border-[#252A36] hover:border-[#FF6117]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{s.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                          {s.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9BA3AF] mt-0.5">
                        {s.locality}, {s.province}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#9BA3AF] mt-1.5 pt-1 border-t border-[#252A36]">
                        <span>Capacidad: <b className="text-white">{s.capacity_persons} personas</b></span>
                        <span className="text-cyan-400">Seleccionar como destino</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BOTÓN COLAPSAR / EXPANDIR PANEL */}
        {isPanelCollapsed && (
          <button
            onClick={() => setIsPanelCollapsed(false)}
            aria-label="Expandir controles tácticos"
            className="w-10 h-10 rounded-xl bg-[#161922] border border-[#252A36] text-[#FF6117] hover:text-white flex items-center justify-center font-bold text-sm shadow-xl hover:bg-[#FF6117] hover:border-[#FF6117] transition"
            title="Expandir controles"
          >
            ▶
          </button>
        )}
      </div>
    </div>
  );
};
