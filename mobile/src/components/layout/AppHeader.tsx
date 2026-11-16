import React from 'react';
import { Flame, WifiOff, ShieldCheck } from 'lucide-react';
import { AppHealthState } from '../../types';

interface AppHeaderProps {
  health: AppHealthState | null;
  isOnline: boolean;
  subtitle?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ health, isOnline, subtitle }) => {
  const isDemo = health?.mode === 'demo' || !health?.firmsLive;

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-surface-border pt-safe bg-[#0A0E14]/85 backdrop-blur-md">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fire to-amber-alert flex items-center justify-center shadow-fire-glow">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-bold text-sm tracking-wide text-white">SeMF Mobile</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-glass border border-white/10 text-cyan-info font-mono">
                SL / CBA
              </span>
            </div>
            {subtitle && (
              <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950/80 border border-red-800 text-red-300">
              <WifiOff className="w-3 h-3 text-red-400" />
              <span>Offline</span>
            </span>
          ) : isDemo ? (
            <span 
              title="Operando con archivo local histórico y rutas estáticas de respaldo"
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Modo demo</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>FIRMS Live</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
