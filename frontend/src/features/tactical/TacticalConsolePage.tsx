import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Info,
  Locate,
  Navigation,
  Shield,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
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
  } = useSeMFStore();

  const [activeTab, setActiveTab] = useState<'rutas' | 'focos' | 'refugios'>('rutas');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(true);
  const [showManualCoords, setShowManualCoords] = useState<boolean>(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  // Estado del cálculo de rutas
  const [plan, setPlan] = useState<EvacuationPlanResponse | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [isRoutingLoading, setIsRoutingLoading] = useState<boolean>(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const events = firesData?.events || [];
  const activeEv: FireFrontEvent | null = selectedEvent || events[0] || null;

  // Cálculo explícito bajo demanda (PASO 3)
  const handleCalculateRoute = async () => {
    setIsRoutingLoading(true);
    setRoutingError(null);
    try {
      const res = await apiClient.calculateEvacuationPlan({
        origin_lat: userOrigin.lat,
        origin_lon: userOrigin.lon,
        target_shelter_id: targetShelterId,
        safety_buffer_km: safetyBufferKm,
        max_alternatives: 3,
        allow_unverified_shelters: true,
      });
      setPlan(res);
      setSelectedRouteIndex(0);
    } catch (err) {
      setRoutingError(err instanceof Error ? err.message : 'Error al calcular la ruta de evacuación');
    } finally {
      setIsRoutingLoading(false);
    }
  };

  // Geolocalización real del navegador
  const handleRequestGps = () => {
    if (!navigator.geolocation) {
      setGpsError('La geolocalización no es compatible con este navegador.');
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
        setGpsError(`No se pudo obtener la ubicación: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Rutas disponibles del plan
  const allRoutes = plan
    ? [
        ...(plan.recommended_route ? [plan.recommended_route] : []),
        ...plan.alternative_routes.filter(
          (r) => r.route_id !== plan.recommended_route?.route_id
        ),
      ]
    : [];

  const currentRoute = allRoutes[selectedRouteIndex] || plan?.recommended_route || null;

  const cycleNextRoute = () => {
    if (allRoutes.length > 1) {
      setSelectedRouteIndex((prev) => (prev + 1) % allRoutes.length);
    }
  };

  // Destino seleccionado
  const selectedShelter = shelters.find((s) => s.id === targetShelterId);

  return (
    <div className="relative w-full h-[calc(100dvh-56px)] md:h-[calc(100dvh-64px)] overflow-hidden flex bg-[#F7F8FA]">
      {/* 1. MAPA HERO DE FONDO A PANTALLA COMPLETA */}
      <div className="flex-1 h-full w-full relative">
        <TacticalMapCanvas
          events={events}
          points={firesData?.points || []}
          shelters={shelters}
          routes={currentRoute ? [currentRoute] : allRoutes}
          conservativeCorridor={plan?.conservative_escape_corridor?.corridor_coords || null}
          userOrigin={userOrigin}
          selectedEventId={activeEv?.event_id || null}
          onSelectEvent={(ev) => {
            setSelectedEvent(ev);
            setActiveTab('focos');
            setIsPanelCollapsed(false);
          }}
          onMapClickCoordinates={(lat, lon) => {
            setUserOrigin(lat, lon);
          }}
          onRequestUserGps={handleRequestGps}
          heightClass="h-full"
          defaultBasemap="streets"
        />
      </div>

      {/* 2. PANEL LATERAL ESCRITORIO (>= 768px) */}
      <div
        className={`hidden md:flex absolute top-4 left-4 bottom-4 z-20 transition-all duration-300 ${
          isPanelCollapsed ? 'w-12' : 'w-full max-w-[420px]'
        }`}
      >
        <div className="w-full h-full bg-white/95 backdrop-blur-md border border-[#E7EAF0] rounded-2xl shadow-card flex flex-col overflow-hidden">
          {/* Header con pestañas */}
          <div className="p-3 border-b border-[#E7EAF0] flex items-center justify-between shrink-0 bg-[#F7F8FA]">
            {!isPanelCollapsed && (
              <div className="flex bg-white p-1 rounded-xl border border-[#E7EAF0] gap-1 shadow-subtle">
                <button
                  onClick={() => setActiveTab('rutas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    activeTab === 'rutas'
                      ? 'bg-[#F36B35] text-white shadow-sm'
                      : 'text-[#687385] hover:text-[#202938]'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Rutas</span>
                </button>
                <button
                  onClick={() => setActiveTab('focos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    activeTab === 'focos'
                      ? 'bg-[#F36B35] text-white shadow-sm'
                      : 'text-[#687385] hover:text-[#202938]'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Focos ({events.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('refugios')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    activeTab === 'refugios'
                      ? 'bg-[#F36B35] text-white shadow-sm'
                      : 'text-[#687385] hover:text-[#202938]'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Refugios ({shelters.length})</span>
                </button>
              </div>
            )}

            <button
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              className="p-2 rounded-xl text-[#687385] hover:text-[#202938] hover:bg-white border border-transparent hover:border-[#E7EAF0] transition"
              title={isPanelCollapsed ? 'Expandir panel' : 'Colapsar panel'}
            >
              {isPanelCollapsed ? '▶' : '◀'}
            </button>
          </div>

          {/* Contenido del panel lateral */}
          {!isPanelCollapsed && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'rutas' && renderEvacuationWizard()}
              {activeTab === 'focos' && renderFiresTab()}
              {activeTab === 'refugios' && renderSheltersTab()}
            </div>
          )}
        </div>
      </div>

      {/* 3. BOTTOM SHEET MÓVIL (< 768px) */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-16 z-30 transition-all duration-300 flex flex-col bg-white border-t border-[#E7EAF0] rounded-t-3xl shadow-drawer ${
          isMobileSheetOpen ? 'max-h-[75dvh]' : 'max-h-[64px]'
        }`}
      >
        {/* Cabecera táctil para abrir/cerrar */}
        <div
          onClick={() => setIsMobileSheetOpen(!isMobileSheetOpen)}
          className="p-3 flex items-center justify-between cursor-pointer border-b border-[#E7EAF0] bg-white rounded-t-3xl select-none shrink-0"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 rounded-full bg-[#E7EAF0] mx-auto absolute top-2 left-1/2 -translate-x-1/2" />
            <Navigation className="w-4 h-4 text-[#F36B35]" />
            <span className="font-bold text-xs text-[#202938]">
              {plan ? 'Resultado de evacuación' : 'Asistente de escape en 3 pasos'}
            </span>
          </div>
          <button className="p-1 text-[#687385]">
            {isMobileSheetOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>

        {/* Pestañas rápidas en móvil */}
        {isMobileSheetOpen && (
          <div className="px-4 pt-2 flex gap-1 border-b border-[#E7EAF0] bg-[#F7F8FA] shrink-0">
            <button
              onClick={() => setActiveTab('rutas')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'rutas' ? 'bg-white text-[#F36B35] shadow-sm' : 'text-[#687385]'
              }`}
            >
              Rutas
            </button>
            <button
              onClick={() => setActiveTab('focos')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'focos' ? 'bg-white text-[#F36B35] shadow-sm' : 'text-[#687385]'
              }`}
            >
              Focos ({events.length})
            </button>
            <button
              onClick={() => setActiveTab('refugios')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'refugios' ? 'bg-white text-[#F36B35] shadow-sm' : 'text-[#687385]'
              }`}
            >
              Refugios ({shelters.length})
            </button>
          </div>
        )}

        {/* Contenido deslizable */}
        {isMobileSheetOpen && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'rutas' && renderEvacuationWizard()}
            {activeTab === 'focos' && renderFiresTab()}
            {activeTab === 'refugios' && renderSheltersTab()}
          </div>
        )}
      </div>
    </div>
  );

  // ASISTENTE DE EVACUACIÓN EN 3 PASOS
  function renderEvacuationWizard() {
    return (
      <div className="space-y-4">
        {/* PASO 1 — ¿DÓNDE ESTÁS? */}
        <div className="bg-[#F7F8FA] border border-[#E7EAF0] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#F36B35] text-white flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span className="font-bold text-xs text-[#202938]">Tu ubicación</span>
            </div>
            <button
              onClick={handleRequestGps}
              disabled={gpsLoading}
              className="px-3 py-1.5 rounded-xl bg-white text-[#3978D5] border border-[#E7EAF0] text-xs font-semibold hover:border-[#3978D5] transition flex items-center gap-1.5 shadow-subtle disabled:opacity-50"
            >
              <Locate className="w-3.5 h-3.5" />
              <span>{gpsLoading ? 'Localizando...' : 'Usar mi ubicación'}</span>
            </button>
          </div>

          <p className="text-xs text-[#687385]">
            Ubicación actual marcada en el mapa. También puedes pulsar directamente sobre el mapa para cambiarla.
          </p>

          {gpsError && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC4545]">
              {gpsError}
            </div>
          )}

          {/* Selector de coordenadas manual opcional */}
          <div className="pt-1">
            <button
              onClick={() => setShowManualCoords(!showManualCoords)}
              className="text-[11px] text-[#687385] hover:text-[#202938] flex items-center gap-1 font-medium"
            >
              <span>{showManualCoords ? 'Ocultar coordenadas' : 'Ajustar coordenadas manualmente'}</span>
              {showManualCoords ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showManualCoords && (
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#E7EAF0]">
                <div>
                  <label className="text-[10px] text-[#687385] block font-medium">Latitud</label>
                  <input
                    type="number"
                    step="0.001"
                    value={userOrigin.lat}
                    onChange={(e) => setUserOrigin(Number(e.target.value), userOrigin.lon)}
                    className="w-full bg-white border border-[#E7EAF0] rounded-xl px-2.5 py-1 text-xs text-[#202938] mt-0.5 outline-none focus:border-[#F36B35]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#687385] block font-medium">Longitud</label>
                  <input
                    type="number"
                    step="0.001"
                    value={userOrigin.lon}
                    onChange={(e) => setUserOrigin(userOrigin.lat, Number(e.target.value))}
                    className="w-full bg-white border border-[#E7EAF0] rounded-xl px-2.5 py-1 text-xs text-[#202938] mt-0.5 outline-none focus:border-[#F36B35]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PASO 2 — ¿A DÓNDE NECESITAS LLEGAR? */}
        <div className="bg-[#F7F8FA] border border-[#E7EAF0] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#F36B35] text-white flex items-center justify-center text-xs font-bold">
              2
            </span>
            <span className="font-bold text-xs text-[#202938]">Elegí un lugar seguro</span>
          </div>

          <select
            value={targetShelterId || ''}
            onChange={(e) => setTargetShelterId(e.target.value || null)}
            aria-label="Seleccionar refugio"
            className="w-full bg-white border border-[#E7EAF0] rounded-xl px-3 py-2 text-xs font-medium text-[#202938] outline-none focus:border-[#F36B35] shadow-subtle"
          >
            <option value="">Buscar el refugio más seguro automáticamente</option>
            {shelters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.locality}) — Cap: {s.capacity_persons} personas
              </option>
            ))}
          </select>

          {selectedShelter && (
            <div className="bg-white border border-[#E7EAF0] rounded-xl p-3 text-xs space-y-1">
              <div className="font-bold text-[#202938]">{selectedShelter.name}</div>
              <div className="text-[#687385]">
                {selectedShelter.locality}, {selectedShelter.province}
              </div>
              <div className="text-[11px] text-[#16A36A] font-semibold">
                🛡️ Capacidad: {selectedShelter.capacity_persons} personas
              </div>
            </div>
          )}
        </div>

        {/* PASO 3 — CONSULTAR RUTA */}
        <div className="space-y-3">
          <button
            onClick={handleCalculateRoute}
            disabled={isRoutingLoading}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#F36B35] hover:bg-[#F36B35]/95 text-white font-bold text-sm transition shadow-card flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Navigation className={`w-4 h-4 ${isRoutingLoading ? 'animate-spin' : ''}`} />
            <span>{isRoutingLoading ? 'Buscando ruta segura...' : 'Buscar ruta segura'}</span>
          </button>

          {routingError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-[#DC4545]">
              {routingError}
            </div>
          )}
        </div>

        {/* RESULTADO DE LA EVACUACIÓN (SEMÁFORO DE 3 ESTADOS) */}
        {plan && (
          <div className="space-y-3 pt-2">
            {/* Tarjeta principal con el estado semafórico del backend */}
            {plan.overall_status === 'SAFE_ROUTE_VERIFIED' && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-[#16A36A] space-y-1.5 shadow-subtle">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-[#16A36A] shrink-0" />
                  <span>Ruta despejada</span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Se identificó una ruta sin conflictos detectados con los focos analizados.
                </p>
              </div>
            )}

            {plan.overall_status === 'ROUTE_WITH_CAUTION_WARNINGS' && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[#E5A000] space-y-1.5 shadow-subtle">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-[#E5A000] shrink-0" />
                  <span>Precaución</span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  La ruta presenta proximidad a zonas de actividad de fuego. Se recomienda máxima precaución.
                </p>
              </div>
            )}

            {plan.overall_status === 'NO_SAFE_ROAD_AVAILABLE' && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-[#DC4545] space-y-1.5 shadow-subtle">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <XCircle className="w-5 h-5 text-[#DC4545] shrink-0" />
                  <span>Ruta bloqueada</span>
                </div>
                <p className="text-xs text-red-900 leading-relaxed">
                  Se detectaron condiciones de riesgo que impiden recomendar esta ruta.
                </p>
              </div>
            )}

            {/* Ficha resumen: Destino, Distancia, Tiempo, Estado */}
            {currentRoute && (
              <div className="bg-white border border-[#E7EAF0] rounded-2xl p-4 space-y-3 shadow-subtle">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#687385] font-medium">
                    {currentRoute.is_recommended ? 'Ruta recomendada' : 'Ruta alternativa'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      currentRoute.safety_status === 'SAFE'
                        ? 'bg-emerald-50 text-[#16A36A]'
                        : currentRoute.safety_status === 'WARNING'
                        ? 'bg-amber-50 text-[#E5A000]'
                        : 'bg-red-50 text-[#DC4545]'
                    }`}
                  >
                    {currentRoute.safety_status === 'SAFE'
                      ? 'Despejada'
                      : currentRoute.safety_status === 'WARNING'
                      ? 'Con precaución'
                      : 'Bloqueada'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0]">
                    <span className="text-[10px] text-[#687385] block">Distancia</span>
                    <b className="text-sm text-[#202938]">{currentRoute.distance_km} km</b>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0]">
                    <span className="text-[10px] text-[#687385] block">Tiempo</span>
                    <b className="text-sm text-[#202938]">{currentRoute.estimated_time_min} min</b>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0]">
                    <span className="text-[10px] text-[#687385] block">Destino</span>
                    <b className="text-xs text-[#202938] truncate block">
                      {currentRoute.target_shelter?.name || 'Refugio Seguro'}
                    </b>
                  </div>
                </div>

                {allRoutes.length > 1 && (
                  <button
                    onClick={cycleNextRoute}
                    className="w-full py-2 rounded-xl bg-[#F7F8FA] hover:bg-slate-100 border border-[#E7EAF0] text-xs font-semibold text-[#202938] transition"
                  >
                    Ver otra alternativa ({selectedRouteIndex + 1} de {allRoutes.length})
                  </button>
                )}
              </div>
            )}

            {/* Corredor conservador si corresponde */}
            {plan.conservative_escape_corridor && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-950 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-[#F36B35]">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Escape conservador por flanco activado</span>
                </div>
                <p className="text-[11px] text-orange-800 leading-normal">
                  {plan.conservative_escape_corridor.instruction}
                </p>
              </div>
            )}

            {/* Acordeón secundario: Detalles técnicos */}
            <div className="pt-1">
              <button
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="w-full py-1.5 text-xs text-[#687385] hover:text-[#202938] flex items-center justify-between font-medium"
              >
                <span>Ver detalles técnicos</span>
                {showTechnicalDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showTechnicalDetails && (
                <div className="p-3 bg-[#F7F8FA] border border-[#E7EAF0] rounded-xl text-[11px] space-y-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-[#687385]">Rutas transitables:</span>
                    <b className="text-[#202938]">{plan.passable_routes_count}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#687385]">Rutas bloqueadas por fuego:</span>
                    <b className="text-[#DC4545]">{plan.blocked_routes_count}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#687385]">Buffer de seguridad:</span>
                    <b className="text-[#202938]">{plan.safety_parameters.requested_buffer_km} km</b>
                  </div>
                  {currentRoute && (
                    <div className="pt-2 border-t border-[#E7EAF0] space-y-1 text-[#687385]">
                      <div>
                        Riesgo vial ML: <b>{Math.round(currentRoute.max_segment_ml_risk * 100)}%</b>
                      </div>
                      <div>
                        Distancia mínima al perímetro:{' '}
                        <b>{currentRoute.min_distance_to_fire_km.toFixed(1)} km</b>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Aviso visible de Defensa Civil */}
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-[#E5A000] shrink-0 mt-0.5" />
              <span>
                <b>Aviso importante:</b> La información brindada es orientativa. Siga siempre las indicaciones oficiales de Bomberos y Defensa Civil.
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PESTAÑA: FOCOS Y FRENTES ACTIVOS
  function renderFiresTab() {
    return (
      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="p-8 text-center bg-[#F7F8FA] rounded-2xl border border-[#E7EAF0] space-y-2">
            <span className="text-3xl">🌿</span>
            <p className="font-bold text-sm text-[#202938]">No hay focos activos en esta zona</p>
            <p className="text-xs text-[#687385]">
              No se detectan anomalías térmicas satelitales en las últimas pasadas oficiales de NASA FIRMS.
            </p>
          </div>
        ) : (
          <>
            {activeEv && (
              <div className="bg-[#FDF2EC] border border-[#F36B35]/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#202938]">{activeEv.location_name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F36B35] text-white font-bold">
                    {activeEv.event_id}
                  </span>
                </div>
                <div className="text-xs text-[#687385]">
                  Provincia: <b className="text-[#202938]">{activeEv.province}</b> • Puntos:{' '}
                  <b className="text-[#202938]">{activeEv.points_count}</b>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-white border border-[#E7EAF0]">
                    <span className="text-[10px] text-[#687385] block">Potencia (FRP)</span>
                    <b className="text-xs text-[#F36B35]">{Math.round(activeEv.frp_peak_mw)} MW</b>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#E7EAF0]">
                    <span className="text-[10px] text-[#687385] block">Superficie</span>
                    <b className="text-xs text-[#202938]">{activeEv.detection_area_ha} ha</b>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#E7EAF0]">
                    <span className="text-[10px] text-[#687385] block">Avance ML</span>
                    <b className="text-xs text-orange-600">{activeEv.projected_speed_kmh} km/h</b>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setUserOrigin(activeEv.centroid_lat + 0.015, activeEv.centroid_lon);
                    setActiveTab('rutas');
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#F36B35] hover:bg-[#F36B35]/90 text-white font-bold text-xs transition shadow-sm"
                >
                  Calcular escape desde este punto
                </button>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold text-[#687385] block">
                Todos los frentes detectados ({events.length})
              </span>
              {events.map((ev) => (
                <div
                  key={ev.event_id}
                  onClick={() => setSelectedEvent(ev)}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    ev.event_id === activeEv?.event_id
                      ? 'bg-white border-[#F36B35] ring-1 ring-[#F36B35] shadow-subtle'
                      : 'bg-white border-[#E7EAF0] hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs text-[#202938]">{ev.location_name}</div>
                    <div className="text-[11px] text-[#687385]">
                      {ev.province} • {ev.points_count} focos térmicos
                    </div>
                  </div>
                  <div className="text-right">
                    <b className="text-xs text-[#F36B35]">{Math.round(ev.frp_peak_mw)} MW</b>
                    <span className="text-[10px] text-[#687385] block">{ev.projected_speed_kmh} km/h</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // PESTAÑA: REFUGIOS Y BOMBEROS
  function renderSheltersTab() {
    return (
      <div className="space-y-2.5">
        <div className="p-3 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] text-xs text-[#687385]">
          Catálogo auditado de cuarteles de Bomberos Voluntarios y centros de evacuación de Córdoba y San Luis.
        </div>

        {shelters.map((s) => (
          <div
            key={s.id}
            className={`p-3 rounded-xl border transition ${
              s.id === targetShelterId
                ? 'bg-[#ECFDF5] border-[#16A36A] ring-1 ring-[#16A36A]'
                : 'bg-white border-[#E7EAF0] hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-xs text-[#202938]">{s.name}</div>
                <div className="text-[11px] text-[#687385]">
                  {s.locality}, {s.province}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-[#16A36A] border border-emerald-200">
                Verificado
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-[#E7EAF0]">
              <span className="text-[#687385]">
                Capacidad: <b>{s.capacity_persons} personas</b>
              </span>
              <button
                onClick={() => {
                  setTargetShelterId(s.id);
                  setActiveTab('rutas');
                }}
                className="text-xs font-semibold text-[#F36B35] hover:underline"
              >
                Elegir como destino
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }
};
