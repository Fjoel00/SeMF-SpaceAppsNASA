import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { HistoricalCalendarPayload } from '../../types/semf';

export const HistoricalCalendarPage: React.FC = () => {
  const [mode, setMode] = useState<'annual' | 'interval'>('annual');
  const [year, setYear] = useState<number>(2025);
  const [rangeFrom, setRangeFrom] = useState<number>(2012);
  const [rangeTo, setRangeTo] = useState<number>(2025);
  const [selectedWeek, setSelectedWeek] = useState<number>(36);
  const [bbox, setBbox] = useState<string | null>(null);
  const [data, setData] = useState<HistoricalCalendarPayload | null>(null);

  useEffect(() => {
    apiClient
      .getHistoricalCalendar({
        mode,
        year,
        range_from: rangeFrom,
        range_to: rangeTo,
        week: selectedWeek,
        bbox,
      })
      .then(setData)
      .catch(console.error);
  }, [mode, year, rangeFrom, rangeTo, selectedWeek, bbox]);

  if (!data) {
    return (
      <div className="p-6 text-slate-400 font-mono text-sm">
        Cargando serie climatológica de 26 años (2000–2026)...
      </div>
    );
  }

  const weekDetail = data.kpis.selected_week_detail;

  return (
    <div className="p-5 space-y-5">
      {/* CABECERA Y FILTROS TEMPORALES / ESPACIALES */}
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-white">{data.metadata.title}</h1>
          <p className="text-xs text-slate-400">
            {data.metadata.total_archive_detections.toLocaleString()} registros reales NASA FIRMS •{' '}
            Córdoba ({data.metadata.cordoba_detections.toLocaleString()}) y San Luis (
            {data.metadata.san_luis_detections.toLocaleString()})
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap font-mono text-xs">
          <div className="flex rounded-lg bg-[#111827] p-1 border border-[#1E293B]">
            <button
              onClick={() => setMode('annual')}
              className={`px-3 py-1 rounded ${
                mode === 'annual' ? 'bg-orange-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              Anual
            </button>
            <button
              onClick={() => setMode('interval')}
              className={`px-3 py-1 rounded ${
                mode === 'interval' ? 'bg-orange-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              Intervalo
            </button>
          </div>

          {mode === 'annual' ? (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-[#111827] border border-[#1E293B] rounded-lg px-3 py-1.5 text-white"
            >
              {Array.from({ length: 27 }, (_, i) => 2026 - i).map((yr) => (
                <option key={yr} value={yr}>
                  Año {yr}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={2000}
                max={2026}
                value={rangeFrom}
                onChange={(e) => setRangeFrom(Number(e.target.value))}
                className="w-20 bg-[#111827] border border-[#1E293B] rounded px-2 py-1 text-white"
              />
              <span>a</span>
              <input
                type="number"
                min={2000}
                max={2026}
                value={rangeTo}
                onChange={(e) => setRangeTo(Number(e.target.value))}
                className="w-20 bg-[#111827] border border-[#1E293B] rounded px-2 py-1 text-white"
              />
            </div>
          )}

          <select
            value={bbox || ''}
            onChange={(e) => setBbox(e.target.value || null)}
            className="bg-[#111827] border border-[#1E293B] rounded-lg px-3 py-1.5 text-cyan-300"
          >
            <option value="">BBox: Región Completa (Córdoba + San Luis)</option>
            <option value="-66.4,-33.4,-65.8,-33.0">
              BBox: Sierras de San Luis (El Trapiche / Potrero)
            </option>
            <option value="-65.3,-32.2,-64.8,-31.5">
              BBox: Valle de Traslasierra (Mina Clavero)
            </option>
            <option value="-64.7,-31.5,-64.1,-30.8">
              BBox: Sierras Chicas y Punilla (Córdoba)
            </option>
          </select>
        </div>
      </div>

      {/* KPIS DEL PERÍODO Y SEMANA SELECCIONADA */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono">
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4">
          <span className="text-xs text-slate-400">Focos Armonizados</span>
          <div className="text-2xl font-bold text-white mt-1">
            {data.kpis.total_harmonized_eq.toLocaleString()} eq
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {data.kpis.total_viirs_count} VIIRS + {data.kpis.total_modis_count} MODIS
          </div>
        </div>

        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4">
          <span className="text-xs text-slate-400">Potencia Térmica Acumulada</span>
          <div className="text-2xl font-bold text-orange-400 mt-1">
            {data.kpis.total_frp_mw.toLocaleString()} MW
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Celdas activas en BBox: {data.metadata.active_cells_count}
          </div>
        </div>

        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4">
          <span className="text-xs text-slate-400">
            Semana Ecológica Seleccionada (S{weekDetail.week})
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {weekDetail.observed_harmonized} eq
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Esperado Histórico (μ ± σ): {weekDetail.baseline_mean} ± {weekDetail.baseline_std}
          </div>
        </div>

        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4">
          <span className="text-xs text-slate-400">Anomalía Estadística Z-Score</span>
          <div
            className={`text-2xl font-bold mt-1 ${
              weekDetail.z_score >= 1.2
                ? 'text-red-400'
                : weekDetail.z_score > 0
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {weekDetail.z_score >= 0 ? `+${weekDetail.z_score}` : weekDetail.z_score} σ
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{weekDetail.status}</div>
        </div>
      </div>

      {/* MATRIZ DE 52 SEMANAS AGRUPADA EN 12 MESES */}
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">
            Matriz Climatológica de 52 Semanas ISO (Haga clic en cualquier semana)
          </h2>
          <span className="text-xs font-mono text-amber-400">
            Temporada Crítica: {data.kpis.peak_season_window}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12 gap-2">
          {data.months.map((m) => {
            const mWeeks = data.weeks.filter(
              (w) => Math.min(11, Math.floor((w.week - 1) / 4.33)) === m.month_num - 1
            );
            return (
              <div
                key={m.month_num}
                className="bg-[#111827] border border-[#1E293B] rounded-lg p-2 space-y-1.5"
              >
                <div className="text-xs font-bold text-center text-slate-300 border-b border-slate-800 pb-1">
                  {m.month_short}
                </div>
                {mWeeks.map((w) => {
                  const tierColor =
                    w.tier === 4
                      ? 'bg-red-500/25 border-red-500/50 text-red-200'
                      : w.tier === 3
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-200'
                      : w.tier === 2
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200';
                  return (
                    <button
                      key={w.week}
                      onClick={() => setSelectedWeek(w.week)}
                      className={`w-full px-2 py-1 rounded border text-[11px] font-mono flex items-center justify-between ${tierColor} ${
                        w.week === selectedWeek ? 'ring-2 ring-white' : ''
                      }`}
                    >
                      <span>S{w.week}</span>
                      <b>{Math.round(w.observed_harmonized)}</b>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
