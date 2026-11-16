import React, { useState } from 'react';
import { useSeMFStore } from '../../stores/useSeMFStore';
import type { SafeShelter } from '../../types/semf';

interface SheltersPageProps {
  shelters: SafeShelter[];
}

export const SheltersPage: React.FC<SheltersPageProps> = ({ shelters }) => {
  const { setTargetShelterId, setActiveView } = useSeMFStore();
  const [filterProvince, setFilterProvince] = useState<string>('ALL');
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);

  const filtered = shelters.filter((s) => {
    if (filterProvince !== 'ALL' && s.province !== filterProvince) return false;
    if (onlyVerified && !s.is_verified_reliable) return false;
    return true;
  });

  return (
    <div className="p-5 space-y-4">
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold text-white">
            Directorio Auditado de Refugios, Cuarteles de Bomberos y Hospitales
          </h1>
          <p className="text-xs text-slate-400">
            Verificación en tiempo real de distancia a frentes activos y disponibilidad hídrica/médica
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <select
            value={filterProvince}
            onChange={(e) => setFilterProvince(e.target.value)}
            className="bg-[#111827] border border-[#1E293B] rounded-lg px-3 py-1.5 text-slate-200"
          >
            <option value="ALL">Todas las Provincias ({shelters.length})</option>
            <option value="Córdoba">Provincia de Córdoba</option>
            <option value="San Luis">Provincia de San Luis</option>
          </select>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyVerified}
              onChange={(e) => setOnlyVerified(e.target.checked)}
              className="accent-emerald-500"
            />
            <span>Solo Verificados</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((sh) => (
          <div
            key={sh.id}
            className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-2.5 flex flex-col justify-between"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                  {sh.id} • {sh.category}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    sh.is_verified_reliable
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {sh.is_verified_reliable ? '✓ VERIFICADO' : '⚠️ NO VERIFICADO'}
                </span>
              </div>

              <h3 className="text-sm font-bold text-white">{sh.name}</h3>
              <p className="text-xs text-slate-400">
                {sh.locality}, {sh.province} • Vía: {sh.access_road}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-[#111827] p-2.5 rounded-lg border border-[#1E293B]">
              <div>
                <span className="text-slate-400 block text-[10px]">Capacidad</span>
                <b className="text-white">{sh.capacity_persons} pers.</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Fuego más cerc.</span>
                <b className="text-emerald-400">
                  {sh.nearest_fire_distance_km ?? '--'} km
                </b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Médico/Agua</span>
                <b className="text-slate-200">
                  {sh.has_medical_support ? 'Sí' : 'No'} / {sh.has_water_supply ? 'Sí' : 'No'}
                </b>
              </div>
            </div>

            <button
              onClick={() => {
                setTargetShelterId(sh.id);
                setActiveView('routing');
              }}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-[#111827] hover:bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 transition"
            >
              Fijar como Destino de Evacuación
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
