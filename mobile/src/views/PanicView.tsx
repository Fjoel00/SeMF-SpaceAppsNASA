import React from 'react';

export const PanicView: React.FC = () => {
  return (
    <div className="p-4 space-y-4">
      <div className="glass-panel rounded-2xl p-4 text-center">
        <h2 className="font-display font-bold text-lg text-danger">Protocolo de Pánico SOS</h2>
        <p className="text-xs text-slate-400">Emisión de alerta geolocalizada en 1 toque</p>
      </div>
    </div>
  );
};
