import React, { useState } from 'react';
import { useSeMFStore } from '../stores/useSeMFStore';
import type { ActiveFiresPayload, NavigationViewId } from '../types/semf';

interface MissionControlLayoutProps {
  firesData: ActiveFiresPayload | null;
  isLoading: boolean;
  onRefreshData: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavigationViewId;
  label: string;
  icon: string;
  badge?: string;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'monitor', label: 'Monitor NRT', icon: '🛰️' },
  { id: 'tactical', label: 'Consola Táctica', icon: '🎯' },
  { id: 'routing', label: 'Rutas de Escape', icon: '🧭', badge: 'CRÍTICO' },
  { id: 'historical', label: 'Histórico 26a', icon: '📅' },
  { id: 'ml-analytics', label: 'Inteligencia ML', icon: '🧠', badge: 'ONNX' },
  { id: 'shelters', label: 'Red Refugios', icon: '🛡️' },
  { id: 'settings', label: 'Configuración', icon: '⚙️' },
];

export const MissionControlLayout: React.FC<MissionControlLayoutProps> = ({
  firesData,
  isLoading,
  onRefreshData,
  children,
}) => {
  const { activeView, setActiveView, simulation, setSimulationMode } = useSeMFStore();
  const [searchQuery, setSearchQuery] = useState('');
  const weather = firesData?.weather;
  const kpis = firesData?.kpis;

  return (
    <div className="h-screen w-screen bg-[#141416] text-[#EAEAEA] flex flex-col overflow-hidden font-sans">
      {/* HEADER SUPERIOR SUPER MODERNO CON ESTILO DE REFERENCIA (#FF6117 + #252525) */}
      <header className="h-16 bg-[#1E1E22] border-b border-[#2E2E34] px-5 flex items-center justify-between shrink-0 z-30 shadow-md">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#FF6117] flex items-center justify-center text-white font-black text-lg shadow-lg shadow-[#FF6117]/30">
            🔥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-base text-white">
                SeMF <span className="text-[#FF6117]">2.0</span>
              </span>
              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-[#252525] text-[#FF6117] border border-[#FF6117]/40 font-bold">
                NASA FIRMS + ML
              </span>
              {simulation.enabled && (
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-[#FF6117]/20 text-[#FF6117] border border-[#FF6117] font-bold animate-pulse">
                  SIMULACIÓN ACTIVA
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#A0A0A8]">
              Monitoreo Táctico y Evacuación • Sierras de Córdoba y San Luis
            </p>
          </div>
        </div>

        {/* BUSCADOR EN CÁPSULA (ESTILO DE LA IMAGEN DE REFERENCIA) */}
        <div className="hidden md:flex items-center bg-[#252525] border border-[#38383E] rounded-full px-4 py-1.5 w-72 focus-within:border-[#FF6117] transition shadow-inner">
          <span className="text-[#A0A0A8] mr-2 text-xs">🔍</span>
          <input
            type="text"
            placeholder="Buscar frente o refugio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-[#EAEAEA] placeholder-[#707078] outline-none w-full"
          />
        </div>

        {/* TELEMETRÍA EN CÁPSULAS FLOTANTES */}
        <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#252525] px-3.5 py-1.5 rounded-full border border-[#38383E]">
            <span className="w-2 h-2 rounded-full bg-[#FF6117]" />
            <span className="text-[#A0A0A8]">VIENTO:</span>
            <span className="text-white font-bold">
              {weather ? `${weather.wind_speed_kmh} km/h` : '--'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#252525] px-3.5 py-1.5 rounded-full border border-[#38383E]">
            <span className="text-[#A0A0A8]">TEMP:</span>
            <span className="text-white font-bold">
              {weather ? `${weather.temperature_c}°C (${weather.relative_humidity_pct}% HR)` : '--'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#252525] px-3.5 py-1.5 rounded-full border border-[#38383E]">
            <span className="text-[#A0A0A8]">PICO FRP:</span>
            <span className="text-[#FF6117] font-bold">
              {kpis ? `${kpis.peak_pass_frp_mw} MW` : '--'}
            </span>
          </div>
        </div>

        {/* BOTONES DE ACCIÓN RÁPIDA (CON EL BOTÓN + NUEVO ESCENARIO DE LA REFERENCIA) */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setActiveView('tactical');
              setSimulationMode(!simulation.enabled);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-[#FF6117] hover:bg-[#ff7533] text-white shadow-lg shadow-[#FF6117]/30 transition transform active:scale-95"
          >
            <span>+</span>
            <span>Nuevo Escenario</span>
          </button>

          <button
            onClick={onRefreshData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-full text-xs font-semibold bg-[#252525] hover:bg-[#323238] text-[#EAEAEA] border border-[#38383E] transition"
          >
            {isLoading ? '⏳' : '🔄 Sincronizar'}
          </button>
        </div>
      </header>

      {/* CUERPO PRINCIPAL: BARRA LATERAL REDONDEADA + VISTA DE CONTENIDO */}
      <div className="flex-1 min-h-0 flex overflow-hidden p-3 gap-3">
        <aside className="w-60 bg-[#1E1E22] border border-[#2E2E34] rounded-3xl flex flex-col justify-between p-3.5 shrink-0 overflow-y-auto shadow-xl">
          <div className="space-y-2">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#A0A0A8]">
              Consola Operativa
            </div>
            <nav className="space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between transition ${
                      isActive
                        ? 'bg-[#FF6117] text-white shadow-md shadow-[#FF6117]/25 font-bold'
                        : 'text-[#A0A0A8] hover:text-white hover:bg-[#252525] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          isActive
                            ? 'bg-white text-[#FF6117]'
                            : 'bg-[#FF6117]/20 text-[#FF6117] border border-[#FF6117]/40'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* TARJETA DE ESTADO CON ESTILO CÁPSULA */}
          <div className="p-3.5 rounded-2xl bg-[#252525] border border-[#38383E] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#A0A0A8]">FIRMS Feed</span>
              <span className="text-emerald-400 font-mono font-bold">
                {firesData?.metadata.is_synthetic ? 'DEMO CALIB' : 'REAL NRT'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#A0A0A8]">Proyección</span>
              <span className="text-white font-mono font-semibold">UTM 20S</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#A0A0A8]">ML Engines</span>
              <span className="text-[#FF6117] font-mono font-bold">4 Modelos</span>
            </div>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL */}
        <main className="flex-1 min-h-0 bg-[#1E1E22] border border-[#2E2E34] rounded-3xl overflow-y-auto shadow-xl">
          {children}
        </main>
      </div>
    </div>
  );
};
