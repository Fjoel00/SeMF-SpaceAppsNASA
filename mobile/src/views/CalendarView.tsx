import React, { useState, useEffect, useMemo } from 'react';
import { 
  Flame, Calendar as CalendarIcon, Info, ChevronRight, X, 
  TrendingUp, AlertTriangle, ShieldCheck, Database 
} from 'lucide-react';
import { ZoneId } from '../types';

interface WeekCellData {
  w: number;
  eq: number;
  frp: number;
  z: number;
  t: 1 | 2 | 3 | 4; // 1: Bajo, 2: Medio, 3: Alto, 4: Extremo
  lvl: string;
}

interface ZoneCalendarData {
  province: string;
  total_cells: number;
  baseline: { week: number; baseline_mean: number; baseline_std: number }[];
  matrix: Record<string, WeekCellData[]>;
}

const ZONE_OPTIONS: { id: ZoneId; label: string; file: string }[] = [
  { id: 'san_luis', label: 'San Luis (capital y alrededores)', file: '/data/calendar/san_luis.json' },
  { id: 'cordoba', label: 'Sierras de Córdoba', file: '/data/calendar/cordoba.json' },
  { id: 'regional', label: 'Toda la región (SL + CBA)', file: '/data/calendar/regional.json' },
];

export const CalendarView: React.FC = () => {
  const [selectedZone, setSelectedZone] = useState<ZoneId>('san_luis');
  const [zoneData, setZoneData] = useState<ZoneCalendarData | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedWeekDetail, setSelectedWeekDetail] = useState<{
    year: number;
    week: number;
    cell: WeekCellData;
    baseline: { baseline_mean: number; baseline_std: number };
  } | null>(null);

  // Load metadata on mount
  useEffect(() => {
    fetch('/data/calendar/metadata.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => setMetadata(meta))
      .catch((e) => console.error('Error cargando metadata del calendario:', e));
  }, []);

  // Lazy load zone dataset when chip changes
  useEffect(() => {
    setIsLoading(true);
    const zoneOpt = ZONE_OPTIONS.find((z) => z.id === selectedZone) || ZONE_OPTIONS[0];

    fetch(zoneOpt.file)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ZoneCalendarData) => {
        setZoneData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error cargando datos de zona:', err);
        setIsLoading(false);
      });
  }, [selectedZone]);

  // Current ISO week calculation for "Esta semana"
  const currentStatus = useMemo(() => {
    if (!zoneData) return null;

    // Use current year (2026) or fallback to latest in dataset
    const year = 2026;
    const yearData = zoneData.matrix[String(year)] || zoneData.matrix['2025'];
    if (!yearData) return null;

    // Estimate current ISO week (or closed week 46 if near year-end)
    const currentWeekNum = metadata?.current_closed_week || 46;
    const currentCell = yearData.find((w) => w.w === currentWeekNum) || yearData[yearData.length - 1];
    const base = zoneData.baseline[currentCell.w - 1] || { baseline_mean: 100, baseline_std: 50 };

    return {
      year,
      week: currentCell.w,
      cell: currentCell,
      baseline: base,
    };
  }, [zoneData, metadata]);

  // Month labels for the 52 weeks
  const monthLabels = [
    { label: 'Ene', startWeek: 1 },
    { label: 'Feb', startWeek: 5 },
    { label: 'Mar', startWeek: 9 },
    { label: 'Abr', startWeek: 14 },
    { label: 'May', startWeek: 18 },
    { label: 'Jun', startWeek: 23 },
    { label: 'Jul', startWeek: 27 },
    { label: 'Ago', startWeek: 31 },
    { label: 'Sep', startWeek: 36 },
    { label: 'Oct', startWeek: 40 },
    { label: 'Nov', startWeek: 45 },
    { label: 'Dic', startWeek: 49 },
  ];

  const getTierColor = (tier: number) => {
    switch (tier) {
      case 4:
        return 'bg-danger text-white border-red-400 shadow-sm shadow-red-500/50';
      case 3:
        return 'bg-fire text-white border-orange-400 shadow-sm shadow-orange-500/40';
      case 2:
        return 'bg-amber-500/80 text-white border-amber-400';
      default:
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40';
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case 'extremo':
        return 'bg-red-500/20 border-red-500/40 text-red-300';
      case 'alto':
        return 'bg-orange-500/20 border-orange-500/40 text-orange-300';
      case 'medio':
        return 'bg-amber-500/20 border-amber-500/40 text-amber-300';
      default:
        return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Zone Selector Chips (San Luis by default) */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
          Zona Geográfica de Consulta
        </label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {ZONE_OPTIONS.map((zone) => (
            <button
              key={zone.id}
              onClick={() => setSelectedZone(zone.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition active:scale-95 ${
                selectedZone === zone.id
                  ? 'bg-fire text-white border-fire shadow-fire-glow font-bold'
                  : 'glass-pill text-slate-300 border-white/10 hover:border-white/20'
              }`}
            >
              {zone.label}
            </button>
          ))}
        </div>
      </div>

      {/* Card "Esta Semana" */}
      {currentStatus && (
        <div className="glass-panel rounded-2xl p-4 border border-surface-border bg-gradient-to-br from-[#121927] to-[#0D131D] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Esta Semana (Semana ISO {currentStatus.week})
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getRiskBadge(currentStatus.cell.lvl)}`}>
              Riesgo {currentStatus.cell.lvl}
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-black font-display text-white tabular-nums tracking-tight">
                {Math.round(currentStatus.cell.eq)}
                <span className="text-xs font-normal text-slate-400 ml-1">focos est.</span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {currentStatus.cell.lvl === 'Extremo'
                  ? '⚠️ Temporada crítica con anomalía severa sobre el promedio.'
                  : currentStatus.cell.lvl === 'Alto'
                  ? 'Alerta activa: recurrencia elevada respecto a la media histórica.'
                  : currentStatus.cell.lvl === 'Medio'
                  ? 'Actividad moderada dentro de los parámetros estacionales.'
                  : 'Baja recurrencia de ignición en esta época del año.'}
              </p>
            </div>

            <div className="text-right font-mono text-[11px] text-slate-400">
              <div>Media: {Math.round(currentStatus.baseline.baseline_mean)} focos</div>
              <div className={currentStatus.cell.z >= 1.0 ? 'text-red-400 font-bold' : 'text-slate-300'}>
                Z-Score: {currentStatus.cell.z >= 0 ? `+${currentStatus.cell.z}` : currentStatus.cell.z}σ
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 52-Week Heatmap Matrix */}
      <div className="glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-sm text-white">Matriz Histórica (2000–2026)</h2>
            <p className="text-[10px] text-slate-400">52 semanas ISO por año. Deslizá horizontalmente.</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-emerald-700"></span>
            <span>Bajo</span>
            <span className="w-2 h-2 rounded-sm bg-fire ml-1"></span>
            <span>Alto</span>
            <span className="w-2 h-2 rounded-sm bg-danger ml-1"></span>
            <span>Extremo</span>
          </div>
        </div>

        {isLoading || !zoneData ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-fire border-t-transparent rounded-full animate-spin"></div>
            <span>Cargando matriz optimizada (&lt;100 KB)...</span>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar pb-2">
            <div className="min-w-[700px] space-y-1">
              {/* Header with Month Indicators */}
              <div className="flex items-center text-[10px] font-mono text-slate-500 pl-12 pb-1">
                {monthLabels.map((m) => (
                  <div key={m.label} className="w-[54px] text-left">
                    {m.label}
                  </div>
                ))}
              </div>

              {/* Rows for Recent Years (Descending 2026 down to 2012 / 2000) */}
              {Object.keys(zoneData.matrix)
                .sort((a, b) => parseInt(b) - parseInt(a))
                .slice(0, 15) // Recent 15 years for high mobile density
                .map((yearStr) => {
                  const weeks = zoneData.matrix[yearStr];
                  return (
                    <div key={yearStr} className="flex items-center gap-1">
                      <span className="w-10 text-[11px] font-mono text-slate-400 text-right pr-2 shrink-0">
                        {yearStr}
                      </span>
                      <div className="flex gap-0.5 flex-1">
                        {weeks.map((w) => (
                          <button
                            key={w.w}
                            onClick={() =>
                              setSelectedWeekDetail({
                                year: parseInt(yearStr),
                                week: w.w,
                                cell: w,
                                baseline: zoneData.baseline[w.w - 1] || { baseline_mean: 0, baseline_std: 0 },
                              })
                            }
                            title={`Año ${yearStr} - Semana ${w.w}: ${w.eq} focos (${w.lvl})`}
                            aria-label={`Semana ${w.w} año ${yearStr}`}
                            className={`h-5 flex-1 rounded-[2px] transition-transform duration-100 active:scale-125 hover:ring-1 hover:ring-white ${getTierColor(
                              w.t
                            )}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Metadata & Attribution Footer */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3 text-cyan-info" />
          <span>NASA FIRMS MODIS/VIIRS</span>
        </div>
        <span>Actualizado: {metadata?.generated_at_utc ? metadata.generated_at_utc.substring(0, 10) : '2026-11-15'}</span>
      </div>

      {/* Interactive Bottom Sheet on Cell Tap */}
      {selectedWeekDetail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#101722] border-t border-white/10 rounded-t-3xl p-5 space-y-4 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-info font-bold">
                  Detalle de Semana Histórica
                </span>
                <h3 className="font-display font-bold text-lg text-white">
                  Año {selectedWeekDetail.year} — Semana ISO {selectedWeekDetail.week}
                </h3>
              </div>
              <button
                onClick={() => setSelectedWeekDetail(null)}
                className="w-8 h-8 rounded-full bg-surface-glass border border-white/10 flex items-center justify-center text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-400 block">Detecciones Satelitales</span>
                <span className="text-xl font-bold text-white tabular-nums">
                  {selectedWeekDetail.cell.eq}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">focos armonizados</span>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-400 block">Potencia Radiativa (FRP)</span>
                <span className="text-xl font-bold text-orange-400 tabular-nums">
                  {selectedWeekDetail.cell.frp} MW
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">energía térmica</span>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-400 block">Media Histórica Esperada</span>
                <span className="text-base font-bold text-slate-200 tabular-nums">
                  {Math.round(selectedWeekDetail.baseline.baseline_mean)} ± {Math.round(selectedWeekDetail.baseline.baseline_std)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">rango climatológico</span>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-400 block">Anomalía Z-Score</span>
                <span className={`text-base font-bold tabular-nums ${
                  selectedWeekDetail.cell.z >= 1.0 ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {selectedWeekDetail.cell.z >= 0 ? `+${selectedWeekDetail.cell.z}` : selectedWeekDetail.cell.z}σ
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Nivel {selectedWeekDetail.cell.lvl}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-glass border border-white/10 text-xs text-slate-300 leading-relaxed">
              <span className="font-bold text-white">Interpretación: </span>
              {selectedWeekDetail.cell.z >= 1.5
                ? 'Anomalía térmica severa. El número de igniciones superó ampliamente el umbral del desvío estándar regional.'
                : selectedWeekDetail.cell.z >= 0.5
                ? 'Actividad moderadamente superior a la media histórica observada en el período 2000–2026.'
                : 'Comportamiento dentro del promedio o bajo, sin desviaciones significativas.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
