import React from 'react';
import { Calendar, Navigation, AlertTriangle } from 'lucide-react';
import { ActiveTab } from '../../types';

interface BottomNavProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab }) => {
  return (
    <nav 
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-surface-border pb-safe bg-[#0A0E14]/90 backdrop-blur-xl"
    >
      <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
        {/* Tab 1: Calendario */}
        <button
          id="nav-tab-calendar"
          onClick={() => onChangeTab('calendar')}
          className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] transition-all duration-200 ${
            activeTab === 'calendar'
              ? 'text-fire scale-105 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-selected={activeTab === 'calendar'}
          role="tab"
        >
          <Calendar className="w-5 h-5 mb-1" />
          <span className="text-[11px] tracking-tight">Calendario</span>
        </button>

        {/* Tab 3: SOS Elevated Center Button */}
        <div className="relative -top-3">
          <button
            id="nav-tab-panic"
            onClick={() => onChangeTab('panic')}
            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center font-bold shadow-lg transition-transform duration-200 active:scale-95 ${
              activeTab === 'panic'
                ? 'bg-danger text-white ring-4 ring-danger/30 shadow-sos-glow scale-105'
                : 'bg-gradient-to-tr from-danger to-red-500 text-white shadow-danger/40 hover:scale-105'
            }`}
            aria-label="Botón de Pánico SOS de emergencia"
            role="tab"
          >
            <AlertTriangle className="w-6 h-6 animate-pulse" />
            <span className="text-[10px] font-black tracking-widest uppercase">SOS</span>
          </button>
        </div>

        {/* Tab 2: Rutas de Escape */}
        <button
          id="nav-tab-escape"
          onClick={() => onChangeTab('escape')}
          className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] transition-all duration-200 ${
            activeTab === 'escape'
              ? 'text-cyan-info scale-105 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-selected={activeTab === 'escape'}
          role="tab"
        >
          <Navigation className="w-5 h-5 mb-1" />
          <span className="text-[11px] tracking-tight">Rutas Escape</span>
        </button>
      </div>
    </nav>
  );
};
