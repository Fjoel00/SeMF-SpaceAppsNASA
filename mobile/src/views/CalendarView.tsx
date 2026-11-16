import React from 'react';

export const CalendarView: React.FC = () => {
  return (
    <div className="p-4 space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <h2 className="font-display font-bold text-lg text-white">Calendario de Incendios</h2>
        <p className="text-xs text-slate-400">Histórico oficial 2000–2026 NASA FIRMS MODIS/VIIRS</p>
      </div>
    </div>
  );
};
