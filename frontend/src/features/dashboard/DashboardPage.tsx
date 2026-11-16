import React, { useState } from 'react';
import { useSeMFStore } from '../../stores/useSeMFStore';
import type { ActiveFiresPayload, SafeShelter } from '../../types/semf';
import { TacticalMapCanvas } from '../../components/map/TacticalMapCanvas';

interface DashboardPageProps {
  firesData: ActiveFiresPayload | null;
  shelters: SafeShelter[];
}

/**
 * Componente de Medidor Radial en Arco (Inspirado en la imagen de referencia del usuario)
 */
const RadialArcGauge: React.FC<{
  percentage: number;
  label: string;
  sublabel: string;
  color?: string;
  maxVal?: number;
  currVal?: number | string;
}> = ({ percentage, label, sublabel, color = '#FF6117', maxVal, currVal }) => {
  const radius = 54;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * Math.PI; // Semi-círculo (180 grados)
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-3 bg-[#252525] border border-[#38383E] rounded-3xl relative overflow-hidden shadow-lg">
      <div className="text-[11px] font-bold text-[#A0A0A8] uppercase tracking-wider mb-1">
        {label}
      </div>

      <div className="relative w-36 h-20 flex items-center justify-center">
        <svg height={radius * 2} width={radius * 2} className="rotate-180 transform -translate-y-4">
          {/* Arco de Fondo */}
          <circle
            stroke="#38383E"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset: 0 }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeLinecap="round"
          />
          {/* Arco de Progreso con Gradiente */}
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease' }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            strokeLinecap="round"
          />
        </svg>

        {/* Callout Flotante de Porcentaje */}
        <div className="absolute top-2.5 right-2 px-2 py-0.5 rounded-full bg-[#1A1A1E] text-[10px] font-mono font-bold text-white border border-[#38383E]">
          {percentage}%
        </div>

        {/* Valor Central */}
        <div className="absolute bottom-1 text-center">
          <div className="text-xl font-black font-mono text-white tracking-tight">
            {currVal !== undefined ? currVal : `${percentage}%`}
          </div>
        </div>
      </div>

      <div className="text-[11px] text-[#A0A0A8] mt-1 font-medium text-center">
        {sublabel}
      </div>
    </div>
  );
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  firesData,
  shelters,
}) => {
  const { selectedEvent, setSelectedEvent, setActiveView } = useSeMFStore();
  const [filterProv, setFilterProv] = useState<'ALL' | 'CORDOBA' | 'SAN_LUIS'>('ALL');

  if (!firesData) {
    return (
      <div className="p-8 text-[#A0A0A8] font-mono text-sm flex items-center gap-3">
        <div className="w-4 h-4 rounded-full border-2 border-[#FF6117] border-t-transparent animate-spin" />
        Sincronizando telemetría multi-sensor y frentes activos...
      </div>
    );
  }

  const { kpis, metadata, events, points } = firesData;

  const filteredEvents = events.filter((ev) => {
    if (filterProv === 'CORDOBA') return ev.province.includes('Córdoba');
    if (filterProv === 'SAN_LUIS') return ev.province.includes('San Luis');
    return true;
  });

  return (
    <div className="p-5 space-y-5">
      {/* SECCIÓN 1: CONTROLES SEGMENTADOS EN CÁPSULA (ESTILO REFERENCIA) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#252525] p-1 rounded-full border border-[#38383E] shadow-inner">
            <button
              onClick={() => setFilterProv('ALL')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                filterProv === 'ALL'
                  ? 'bg-[#FF6117] text-white shadow-md'
                  : 'text-[#A0A0A8] hover:text-white'
              }`}
            >
              Todos ({events.length})
            </button>
            <button
              onClick={() => setFilterProv('CORDOBA')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                filterProv === 'CORDOBA'
                  ? 'bg-[#FF6117] text-white shadow-md'
                  : 'text-[#A0A0A8] hover:text-white'
              }`}
            >
              Córdoba
            </button>
            <button
              onClick={() => setFilterProv('SAN_LUIS')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                filterProv === 'SAN_LUIS'
                  ? 'bg-[#FF6117] text-white shadow-md'
                  : 'text-[#A0A0A8] hover:text-white'
              }`}
            >
              San Luis
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#A0A0A8]">Última Sincronización:</span>
          <span className="px-3 py-1 rounded-full bg-[#252525] border border-[#38383E] text-xs font-mono font-bold text-white">
            {metadata.last_overpass_utc || 'Hace 14 min'}
          </span>
        </div>
      </div>

      {/* SECCIÓN 2: 4 MEDIDORES RADIALES EN ARCO (RADIAL ARC GAUGES DE LA REFERENCIA) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RadialArcGauge
          percentage={83}
          label="Severidad de Amenaza"
          currVal={`${kpis.peak_pass_frp_mw} MW`}
          sublabel="Frente Crítico: El Trapiche"
          color="#FF6117"
        />

        <RadialArcGauge
          percentage={92}
          label="Sincronización Satelital"
          currVal="92%"
          sublabel="Fusión MODIS (1km) + VIIRS (375m)"
          color="#FF8A3D"
        />

        <RadialArcGauge
          percentage={66}
          label="Capacidad de Refugios"
          currVal={`${shelters.length} Efectores`}
          sublabel="24 Cuarteles y Centros Abiertos"
          color="#10B981"
        />

        <RadialArcGauge
          percentage={48}
          label="Superficie Activa"
          currVal={`${kpis.total_detection_envelope_ha} ha`}
          sublabel="Proyección Métrica UTM 20S"
          color="#F59E0B"
        />
      </div>

      {/* SECCIÓN 3: MAPA SATELITAL REAL Y LISTA DE FRENTES ORDENADA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 h-[500px]">
          <TacticalMapCanvas
            events={filteredEvents}
            points={points}
            shelters={shelters}
            selectedEventId={selectedEvent?.event_id || filteredEvents[0]?.event_id}
            onSelectEvent={(ev) => setSelectedEvent(ev)}
            defaultBasemap="satellite"
          />
        </div>

        <div className="lg:col-span-5 bg-[#252525] border border-[#38383E] rounded-3xl p-5 flex flex-col h-[500px] shadow-xl">
          <div className="flex items-center justify-between border-b border-[#38383E] pb-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF6117]" />
                Ranking de Frentes Activos
              </h3>
              <p className="text-[11px] text-[#A0A0A8]">Ordenados por energía radiativa pico</p>
            </div>
            <button
              onClick={() => setActiveView('routing')}
              className="px-3.5 py-1.5 rounded-full bg-[#FF6117] text-white text-xs font-bold shadow-md hover:bg-[#ff7533] transition"
            >
              Planificar Escape →
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {filteredEvents.map((ev) => {
              const isSelected = ev.event_id === selectedEvent?.event_id;
              return (
                <div
                  key={ev.event_id}
                  onClick={() => setSelectedEvent(ev)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#1A1A1E] border-[#FF6117] shadow-lg'
                      : 'bg-[#1E1E22] border-[#38383E] hover:border-[#FF6117]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${ev.severity_level === 'CRITICAL' ? 'bg-[#FF6117]' : 'bg-amber-400'}`} />
                      {ev.event_id}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#252525] text-[#FF6117] text-[10px] font-mono font-bold border border-[#FF6117]/30">
                      {ev.frp_peak_mw} MW
                    </span>
                  </div>

                  <div className="text-xs text-[#EAEAEA] font-semibold mt-1">
                    {ev.location_name} • {ev.province}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#2E2E34] text-[11px] font-mono text-[#A0A0A8]">
                    <div>
                      <span>Área: </span>
                      <b className="text-white">{ev.detection_area_ha} ha</b>
                    </div>
                    <div>
                      <span>Avance: </span>
                      <b className="text-white">{ev.spread_speed_kmh} km/h</b>
                    </div>
                    <div>
                      <span>Rumbo: </span>
                      <b className="text-white">{ev.spread_azimuth_deg}°</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
