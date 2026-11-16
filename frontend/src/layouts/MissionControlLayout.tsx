import React from 'react';
import { useSeMFStore } from '../stores/useSeMFStore';
import type { ActiveFiresPayload, NavigationViewId } from '../types/semf';

interface MissionControlLayoutProps {
  firesData: ActiveFiresPayload | null;
  isLoading: boolean;
  onRefreshData: () => void;
  children: React.ReactNode;
}

const MAIN_TABS: Array<{
  id: NavigationViewId;
  label: string;
  icon: string;
  badge?: string;
}> = [
  {
    id: 'historical',
    label: 'Calendario histórico',
    icon: '📅',
    badge: '2000–2026',
  },
  {
    id: 'tactical',
    label: 'Consola táctica',
    icon: '🎯',
    badge: 'EN VIVO',
  },
  {
    id: 'intelligence',
    label: 'Inteligencia y configuración',
    icon: '⚙️',
  },
];

export const MissionControlLayout: React.FC<MissionControlLayoutProps> = ({
  firesData,
  isLoading,
  onRefreshData,
  children,
}) => {
  const { activeView, setActiveView } = useSeMFStore();
  const weather = firesData?.weather;

  // Normalizar vista activa a una de las 3 pestañas principales
  const currentTab: NavigationViewId =
    activeView === 'historical'
      ? 'historical'
      : activeView === 'intelligence' || activeView === 'settings' || activeView === 'ml-analytics'
      ? 'intelligence'
      : 'tactical';

  return (
    <div className="h-screen w-screen bg-[#0F1117] text-[#EAEAEA] flex flex-col overflow-hidden font-sans">
      {/* HEADER SUPERIOR */}
      <header className="h-16 bg-[#161922] border-b border-[#252A36] px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF6117] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-[#FF6117]/30">
            🔥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-lg text-white">
                SeMF <span className="text-[#FF6117]">2.0</span>
              </span>
              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-[#1F2430] text-[#FF6117] border border-[#FF6117]/40 font-bold">
                NASA FIRMS REAL
              </span>
            </div>
            <p className="text-[11px] text-[#9BA3AF]">
              Sistema de Alerta Temprana y Evacuación • Sierras de Córdoba y San Luis
            </p>
          </div>
        </div>

        {/* 3 PESTAÑAS PRINCIPALES */}
        <nav
          className="flex items-center bg-[#0F1117] p-1 rounded-xl border border-[#252A36]"
          role="tablist"
          aria-label="Pestañas principales de navegación"
        >
          {MAIN_TABS.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.label}
                onClick={() => setActiveView(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-[#FF6117] text-white shadow-md shadow-[#FF6117]/25'
                    : 'text-[#9BA3AF] hover:text-white hover:bg-[#1A1E29]'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden md:inline">{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                      isActive
                        ? 'bg-black/30 text-white'
                        : 'bg-[#252A36] text-[#FF6117]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* TELEMETRÍA Y ACCIONES RÁPIDAS */}
        <div className="flex items-center gap-3">
          <div className="hidden xl:flex items-center gap-2.5 text-xs font-mono">
            <div className="flex items-center gap-1.5 bg-[#1F2430] px-3 py-1 rounded-full border border-[#2B3242]">
              <span className="text-[#9BA3AF]">Viento:</span>
              <span className="text-white font-bold">
                {weather ? `${weather.wind_speed_kmh} km/h` : '--'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#1F2430] px-3 py-1 rounded-full border border-[#2B3242]">
              <span className="text-[#9BA3AF]">Focos:</span>
              <span className="text-[#FF6117] font-bold">
                {firesData ? `${firesData.events.length} activos` : '0'}
              </span>
            </div>
          </div>

          <button
            onClick={onRefreshData}
            disabled={isLoading}
            aria-label="Actualizar datos satelitales"
            className="p-2 rounded-lg bg-[#1F2430] border border-[#2B3242] text-[#9BA3AF] hover:text-white hover:border-[#FF6117] transition disabled:opacity-50"
            title="Sincronizar telemetría satelital"
          >
            <span className={isLoading ? 'animate-spin inline-block' : ''}>🔄</span>
          </button>
        </div>
      </header>

      {/* ÁREA DE CONTENIDO */}
      <main className="flex-1 min-h-0 overflow-hidden relative bg-[#0F1117]">
        {children}
      </main>

      {/* FOOTER OFICIAL CON FUENTE Y ACTUALIZACIÓN */}
      <footer className="h-7 bg-[#161922] border-t border-[#252A36] px-4 flex items-center justify-between text-[11px] text-[#9BA3AF] shrink-0 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Datos oficiales: <b>NASA FIRMS (MODIS 2000–2026, VIIRS 2012–2026)</b></span>
          <span className="hidden sm:inline text-slate-600">•</span>
          <span className="hidden sm:inline text-emerald-400 font-semibold">CERO datos sintéticos</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Actualizado: {firesData?.metadata.generated_at_utc ? new Date(firesData.metadata.generated_at_utc).toLocaleString('es-AR', { timeZone: 'UTC' }) + ' UTC' : 'Reciente'}</span>
        </div>
      </footer>
    </div>
  );
};
