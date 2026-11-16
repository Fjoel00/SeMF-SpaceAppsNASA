import React from 'react';
import { Calendar, Flame, Info, RefreshCw, Wind, ShieldCheck } from 'lucide-react';
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
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}> = [
  {
    id: 'historical',
    label: 'Calendario histórico',
    shortLabel: 'Calendario',
    icon: Calendar,
    badge: '2000–2026',
  },
  {
    id: 'tactical',
    label: 'Mapa de evacuación',
    shortLabel: 'Mapa',
    icon: Flame,
    badge: 'En vivo',
  },
  {
    id: 'intelligence',
    label: 'Información y modelos',
    shortLabel: 'Información',
    icon: Info,
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

  const activeFiresCount = firesData?.events.length || 0;

  return (
    <div className="min-h-[100dvh] w-full bg-[#F7F8FA] text-[#202938] flex flex-col font-sans selection:bg-[#F36B35]/20">
      {/* HEADER SUPERIOR (DESKTOP & MOBILE) */}
      <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/95 backdrop-blur-md border-b border-[#E7EAF0] px-4 sm:px-6 flex items-center justify-between shadow-subtle shrink-0">
        {/* LOGO E IDENTIDAD */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#F36B35] flex items-center justify-center text-white shadow-sm shrink-0">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-base md:text-lg text-[#202938]">
                SeMF <span className="text-[#F36B35]">2.0</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-[#16A36A] border border-emerald-200">
                <ShieldCheck className="w-3 h-3" />
                NASA FIRMS Real
              </span>
            </div>
            <p className="hidden md:block text-[11px] text-[#687385] leading-tight">
              Monitoreo y asistencia para evacuaciones • Córdoba y San Luis
            </p>
          </div>
        </div>

        {/* NAVEGACIÓN EN ESCRITORIO (3 PESTAÑAS) */}
        <nav
          className="hidden md:flex items-center bg-[#F7F8FA] p-1 rounded-xl border border-[#E7EAF0]"
          role="tablist"
          aria-label="Navegación principal"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                aria-label={item.label}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-white text-[#202938] shadow-sm font-bold border border-[#E7EAF0]'
                    : 'text-[#687385] hover:text-[#202938] hover:bg-white/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#F36B35]' : 'text-[#687385]'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium ${
                      isActive
                        ? 'bg-[#FDF2EC] text-[#F36B35]'
                        : 'bg-white text-[#687385] border border-[#E7EAF0]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* TELEMETRÍA Y ACCIONES RÁPIDAS */}
        <div className="flex items-center gap-2.5">
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-[#F7F8FA] px-3 py-1.5 rounded-lg border border-[#E7EAF0]">
              <Wind className="w-3.5 h-3.5 text-[#687385]" />
              <span className="text-[#687385]">Viento:</span>
              <span className="font-semibold text-[#202938]">
                {weather ? `${weather.wind_speed_kmh} km/h` : '--'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#FDF2EC] px-3 py-1.5 rounded-lg border border-[#F36B35]/20">
              <span className="w-2 h-2 rounded-full bg-[#F36B35] animate-pulse" />
              <span className="text-[#687385]">Focos:</span>
              <span className="font-bold text-[#F36B35]">{activeFiresCount}</span>
            </div>
          </div>

          <button
            onClick={onRefreshData}
            disabled={isLoading}
            aria-label="Actualizar datos satelitales"
            className="p-2 rounded-xl bg-white border border-[#E7EAF0] text-[#687385] hover:text-[#202938] hover:border-[#F36B35] transition shadow-subtle disabled:opacity-50"
            title="Sincronizar telemetría satelital"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#F36B35]' : ''}`} />
          </button>
        </div>
      </header>

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main className="flex-1 min-h-0 relative flex flex-col pb-20 md:pb-0">
        {children}
      </main>

      {/* FOOTER DISCRETO EN ESCRITORIO */}
      <footer className="hidden md:flex h-8 bg-white border-t border-[#E7EAF0] px-6 items-center justify-between text-xs text-[#687385] shrink-0 font-sans">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#16A36A]" />
          <span>Datos oficiales: <b>NASA FIRMS (MODIS 2000–2026, VIIRS 2012–2026)</b></span>
          <span className="text-slate-300">•</span>
          <span className="text-[#16A36A] font-medium">CERO datos sintéticos</span>
        </div>
        <div>
          <span>
            Actualización:{' '}
            {firesData?.metadata.generated_at_utc
              ? new Date(firesData.metadata.generated_at_utc).toLocaleString('es-AR', {
                  timeZone: 'UTC',
                }) + ' UTC'
              : 'Reciente'}
          </span>
        </div>
      </footer>

      {/* BARRA DE NAVEGACIÓN INFERIOR MÓVIL (MOBILE BOTTOM BAR) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E7EAF0] px-2 py-1 pb-safe shadow-drawer flex items-center justify-around"
        role="tablist"
        aria-label="Navegación móvil inferior"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isActive}
              aria-label={item.label}
              onClick={() => setActiveView(item.id)}
              className={`flex-1 min-h-[48px] py-1 px-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                isActive
                  ? 'text-[#F36B35] font-bold'
                  : 'text-[#687385] hover:text-[#202938]'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-colors ${
                  isActive ? 'bg-[#FDF2EC]' : 'bg-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#F36B35]' : 'text-[#687385]'}`} />
              </div>
              <span className="text-[11px] leading-none tracking-tight">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
