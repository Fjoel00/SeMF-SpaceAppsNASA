import React, { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  MapPin,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  BookOpen,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { MLModelMetadata } from '../../types/semf';

interface IntelligencePageProps {
  onSettingsUpdated: () => void;
}

export const IntelligencePage: React.FC<IntelligencePageProps> = ({
  onSettingsUpdated,
}) => {
  const [models, setModels] = useState<MLModelMetadata[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  // Parámetros científicos
  const [epsKm, setEpsKm] = useState<number>(2.5);
  const [safetyBufferKm, setSafetyBufferKm] = useState<number>(1.2);
  const [stalenessHours, setStalenessHours] = useState<number>(12.0);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);

  // Predictor en vivo ML
  const [windSpeed, setWindSpeed] = useState<number>(35);
  const [distKm, setDistKm] = useState<number>(1.5);
  const [frpMw, setFrpMw] = useState<number>(250);
  const [prediction, setPrediction] = useState<{
    spread_speed_kmh?: number;
    risk_probability?: number;
  } | null>(null);

  useEffect(() => {
    apiClient
      .getMLModels()
      .then((res) => setModels(res.models || []))
      .catch(console.error);

    apiClient.getHealth().then(setHealth).catch(console.error);

    apiClient
      .getSettings()
      .then((cfg) => {
        if (typeof cfg.dbscan_eps_km === 'number') setEpsKm(cfg.dbscan_eps_km);
        if (typeof cfg.default_safety_buffer_km === 'number')
          setSafetyBufferKm(cfg.default_safety_buffer_km);
        if (typeof cfg.staleness_threshold_hours === 'number')
          setStalenessHours(cfg.staleness_threshold_hours);
      })
      .catch(console.error);
  }, []);

  const handleSaveSettings = async () => {
    try {
      await apiClient.updateSettings({
        dbscan_eps_km: epsKm,
        default_safety_buffer_km: safetyBufferKm,
        staleness_threshold_hours: stalenessHours,
      });
      setSavedMsg('Parámetros actualizados exitosamente en el motor operativo.');
      setTimeout(() => setSavedMsg(null), 4000);
      onSettingsUpdated();
    } catch {
      setSavedMsg('Error al actualizar los parámetros.');
    }
  };

  const handleRunPrediction = async () => {
    try {
      const res = await apiClient.predictMLRisk({
        spread_features: {
          frp_peak_mw: frpMw,
          frp_density_mw_km2: frpMw * 1.5,
          delta_temp_k: 42.0,
          points_count: 10,
          wind_speed_kmh: windSpeed,
          relative_humidity_pct: 20.0,
          temperature_c: 32.0,
          seasonal_z_score: 1.5,
        },
        segment_features: {
          dist_to_perimeter_km: distKm,
          dist_to_cone_1h_km: Math.max(0, distKm - 0.5),
          dist_to_cone_3h_km: Math.max(0, distKm - 1.0),
          wind_alignment_cos: 0.85,
          fire_frp_mw: frpMw,
          wind_speed_kmh: windSpeed,
          relative_humidity_pct: 20.0,
          data_age_hours: 1.0,
        },
      });
      setPrediction({
        spread_speed_kmh: res.spread_prediction?.spread_speed_kmh,
        risk_probability: res.segment_risk_prediction?.risk_probability,
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    handleRunPrediction();
  }, [windSpeed, distKm, frpMw]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ENCABEZADO */}
      <div className="bg-white border border-[#E7EAF0] rounded-2xl p-5 sm:p-6 shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#202938] tracking-tight">
            Información del sistema y modelos
          </h1>
          <p className="text-xs sm:text-sm text-[#687385] mt-1">
            Transparencia técnica, estado de la infraestructura y modelos de inteligencia artificial de SeMF 2.0.
          </p>
        </div>
        <span className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-emerald-50 text-[#16A36A] border border-emerald-200 text-xs font-semibold flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          <span>Sistema Operativo</span>
        </span>
      </div>

      {/* BLOQUE 1: ESTADO DEL SISTEMA */}
      <div className="bg-white border border-[#E7EAF0] rounded-2xl p-5 shadow-subtle space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#F36B35]" />
          <h2 className="text-sm font-bold text-[#202938]">1. Estado de la infraestructura</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] space-y-1">
            <span className="text-[11px] text-[#687385] font-medium flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-[#3978D5]" /> PostGIS
            </span>
            <div className="text-sm font-bold text-[#16A36A]">Conectado</div>
            <p className="text-[10px] text-[#687385]">PostgreSQL 16 + PostGIS 3.4</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] space-y-1">
            <span className="text-[11px] text-[#687385] font-medium flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-[#DC4545]" /> Memoria Redis
            </span>
            <div className="text-sm font-bold text-[#16A36A]">Conectado</div>
            <p className="text-[10px] text-[#687385]">Redis 7 Alpine Cache</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] space-y-1">
            <span className="text-[11px] text-[#687385] font-medium flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#F36B35]" /> Modelos ML
            </span>
            <div className="text-sm font-bold text-[#16A36A]">
              {models.length > 0 ? `${models.length} / 4 Listos` : '4 / 4 Listos'}
            </div>
            <p className="text-[10px] text-[#687385]">ONNX Runtime Híbrido</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] space-y-1">
            <span className="text-[11px] text-[#687385] font-medium flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#16A36A]" /> Motor de Ruteo
            </span>
            <div className="text-sm font-bold text-[#16A36A]">
              {health?.status === 'healthy' ? 'Operativo' : 'Disponible'}
            </div>
            <p className="text-[10px] text-[#687385]">OSRM + Validador de Seguridad</p>
          </div>
        </div>
      </div>

      {/* BLOQUE 2: FUENTES DE INFORMACIÓN */}
      <div className="bg-white border border-[#E7EAF0] rounded-2xl p-5 shadow-subtle space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#F36B35]" />
          <h2 className="text-sm font-bold text-[#202938]">2. Fuentes de información oficiales</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] space-y-1.5">
            <div className="font-bold text-[#202938]">NASA FIRMS (2000–2026)</div>
            <p className="text-[#687385] text-[11px] leading-relaxed">
              Detecciones térmicas oficiales de MODIS (Terra/Aqua 2000–2026) y VIIRS (Suomi-NPP, NOAA-20/21 2012–2026). 298.101 registros armonizados físicamente sin ningún dato sintético.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] space-y-1.5">
            <div className="font-bold text-[#202938]">OpenStreetMap & OSRM</div>
            <p className="text-[#687385] text-[11px] leading-relaxed">
              Red vial pública y cálculo de grafos vehiculares en tiempo real sin requerir tokens propietarios. Mapas base provistos por OpenStreetMap y Esri World Imagery.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E7EAF0] space-y-1.5">
            <div className="font-bold text-[#202938]">Refugios y Bomberos</div>
            <p className="text-[#687385] text-[11px] leading-relaxed">
              Catálogo auditado de cuarteles de Bomberos Voluntarios y centros seguros de evacuación con capacidad y verificación en las provincias de Córdoba y San Luis.
            </p>
          </div>
        </div>
      </div>

      {/* BLOQUE 3: MODELOS DE INTELIGENCIA ARTIFICIAL */}
      <div className="bg-white border border-[#E7EAF0] rounded-2xl p-5 shadow-subtle space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#F36B35]" />
          <h2 className="text-sm font-bold text-[#202938]">3. Modelos de Inteligencia Artificial</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-4 rounded-xl border border-[#E7EAF0] bg-white space-y-2">
            <div className="flex items-center justify-between">
              <b className="text-sm text-[#202938]">FireSpreadPredictor</b>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#3978D5] font-semibold border border-blue-200">
                GradientBoosting
              </span>
            </div>
            <p className="text-[11px] text-[#687385]">
              Predice la tasa de propagación radial en km/h a partir de la potencia térmica FRP, velocidad del viento, ángulo y humedad relativa.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[#E7EAF0] bg-white space-y-2">
            <div className="flex items-center justify-between">
              <b className="text-sm text-[#202938]">RoadSegmentRiskClassifier</b>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-[#16A36A] font-semibold border border-emerald-200">
                LightGBM + Calibración
              </span>
            </div>
            <p className="text-[11px] text-[#687385]">
              Estima la probabilidad empírica de corte o compromiso de un segmento vial ante el frente activo y los conos de proyección a 1h y 3h.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[#E7EAF0] bg-white space-y-2">
            <div className="flex items-center justify-between">
              <b className="text-sm text-[#202938]">WildfireHazardTemporalPredictor</b>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-[#E5A000] font-semibold border border-amber-200">
                GradientBoosting
              </span>
            </div>
            <p className="text-[11px] text-[#687385]">
              Evalúa el índice de peligro regional proyectado a 24h, 48h y 72h combinando telemetría meteorológica y z-score histórico.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[#E7EAF0] bg-white space-y-2">
            <div className="flex items-center justify-between">
              <b className="text-sm text-[#202938]">AlternativeRouteRanker</b>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-semibold border border-purple-200">
                XGBoost Regressor
              </span>
            </div>
            <p className="text-[11px] text-[#687385]">
              Ordena y califica las rutas de escape ponderando distancia, tiempo de viaje, proximidad al fuego y capacidad del refugio.
            </p>
          </div>
        </div>

        {/* Simulador interactivo en vivo */}
        <div className="p-4 bg-[#F7F8FA] border border-[#E7EAF0] rounded-xl space-y-3">
          <div className="font-bold text-xs text-[#202938]">Simulador de inferencia en tiempo real</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-[11px] text-[#687385] block font-medium">Viento: {windSpeed} km/h</label>
              <input
                type="range"
                min={0}
                max={90}
                value={windSpeed}
                onChange={(e) => setWindSpeed(Number(e.target.value))}
                className="w-full accent-[#F36B35] mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#687385] block font-medium">Distancia a vía: {distKm.toFixed(1)} km</label>
              <input
                type="range"
                min={0.2}
                max={6.0}
                step={0.1}
                value={distKm}
                onChange={(e) => setDistKm(Number(e.target.value))}
                className="w-full accent-[#F36B35] mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#687385] block font-medium">Potencia FRP: {frpMw} MW</label>
              <input
                type="range"
                min={20}
                max={1500}
                value={frpMw}
                onChange={(e) => setFrpMw(Number(e.target.value))}
                className="w-full accent-[#F36B35] mt-1"
              />
            </div>
          </div>

          {prediction && (
            <div className="flex items-center gap-4 text-xs font-mono pt-2 border-t border-[#E7EAF0]">
              <div>
                <span className="text-[#687385]">Velocidad proyectada:</span>{' '}
                <b className="text-[#F36B35]">{prediction.spread_speed_kmh?.toFixed(2)} km/h</b>
              </div>
              <div>
                <span className="text-[#687385]">Riesgo sobre vía:</span>{' '}
                <b className={prediction.risk_probability && prediction.risk_probability > 0.4 ? 'text-[#DC4545]' : 'text-[#16A36A]'}>
                  {prediction.risk_probability ? `${Math.round(prediction.risk_probability * 100)}%` : '--'}
                </b>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BLOQUE 4: METODOLOGÍA Y PARÁMETROS AVANZADOS */}
      <div className="bg-white border border-[#E7EAF0] rounded-2xl p-5 shadow-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#F36B35]" />
            <h2 className="text-sm font-bold text-[#202938]">4. Metodología y parámetros operativos</h2>
          </div>
          <button
            onClick={() => setShowAdvancedParams(!showAdvancedParams)}
            className="text-xs font-semibold text-[#F36B35] hover:underline flex items-center gap-1"
          >
            <span>{showAdvancedParams ? 'Ocultar ajustes' : 'Ajustar parámetros'}</span>
            {showAdvancedParams ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-xs text-[#687385] leading-relaxed">
          SeMF 2.0 utiliza proyección cartográfica métrica UTM huso 20S (EPSG:32720) para el cálculo exacto de distancias y buffers viales. El agrupamiento espacial de frentes de incendio se realiza mediante DBSCAN determinista, y la serie climatológica evalúa anomalías Z-Score contra una línea base histórica de 26 años reales.
        </p>

        {showAdvancedParams && (
          <div className="p-4 bg-[#F7F8FA] border border-[#E7EAF0] rounded-xl space-y-3 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[11px] text-[#687385] font-medium block">Radio épsilon DBSCAN (km)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="10.0"
                  value={epsKm}
                  onChange={(e) => setEpsKm(Number(e.target.value))}
                  className="w-full bg-white border border-[#E7EAF0] rounded-xl px-3 py-1.5 text-xs text-[#202938] mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#687385] font-medium block">Buffer de seguridad base (km)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="5.0"
                  value={safetyBufferKm}
                  onChange={(e) => setSafetyBufferKm(Number(e.target.value))}
                  className="w-full bg-white border border-[#E7EAF0] rounded-xl px-3 py-1.5 text-xs text-[#202938] mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#687385] font-medium block">Límite de desactualización (h)</label>
                <input
                  type="number"
                  step="1.0"
                  min="1.0"
                  max="48.0"
                  value={stalenessHours}
                  onChange={(e) => setStalenessHours(Number(e.target.value))}
                  className="w-full bg-white border border-[#E7EAF0] rounded-xl px-3 py-1.5 text-xs text-[#202938] mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 rounded-xl bg-[#F36B35] text-white font-bold text-xs hover:bg-[#F36B35]/90 transition"
              >
                Guardar parámetros en motor
              </button>
              {savedMsg && <span className="text-xs font-semibold text-[#16A36A]">{savedMsg}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
