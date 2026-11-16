import React from 'react';

export const EscapeView: React.FC = () => {
  return (
    <div className="relative w-full h-[calc(100vh-120px)] flex flex-col justify-end p-4">
      <div className="glass-panel rounded-2xl p-4 text-center">
        <h2 className="font-display font-bold text-lg text-white">Rutas de Evacuación Segura</h2>
        <p className="text-xs text-slate-400">Detección de focos activos y salida guiada a refugios</p>
      </div>
    </div>
  );
};
