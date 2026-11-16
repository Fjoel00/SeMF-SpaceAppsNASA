/**
 * SeMF 2.0 — Definiciones de Tipos Estrictos TypeScript (Contratos OpenAPI 3.1)
 */

export type NavigationViewId =
  | 'dashboard'
  | 'monitor'
  | 'tactical'
  | 'routing'
  | 'historical'
  | 'ml-analytics'
  | 'shelters'
  | 'settings';

export interface WeatherTelemetry {
  wind_speed_kmh: number;
  wind_direction_deg: number;
  wind_push_azimuth_deg: number;
  temperature_c: number;
  relative_humidity_pct: number;
  is_extreme_30_30_30: boolean;
  fire_weather_index: number;
  telemetry_source: string;
  updated_at_utc: string;
}

export interface ThermalDetectionPoint {
  point_id: string;
  latitude: number;
  longitude: number;
  sensor_family: 'VIIRS' | 'MODIS';
  satellite_name: string;
  temp_ch4_k: number;
  temp_ch5_k: number;
  delta_temp_k: number;
  is_saturated_i4: boolean;
  frp_mw: number;
  frp_harmonized_mw: number;
  pixel_area_km2: number;
  frp_density_mw_km2: number;
  viirs_equiv_count: number;
  confidence_cat: 'Low' | 'Nominal' | 'High';
  confidence_score: number;
  acq_datetime: string;
  daynight: string;
  scan_km: number;
  track_km: number;
  cluster_id: number;
  is_synthetic: boolean;
}

export interface FireFrontEvent {
  event_id: string;
  event_type: string;
  location_name: string;
  province: string;
  cluster_numeric_id: number;
  centroid_lat: number;
  centroid_lon: number;
  points_count: number;
  viirs_count: number;
  modis_count: number;
  multisensor_confirmed: boolean;
  satellites_involved: string;
  frp_peak_mw: number;
  frp_total_mw: number;
  frp_max_mw: number;
  frp_mean_density_mw_km2: number;
  fre_est_mj: number;
  temp_brightness_max_k: number;
  mean_delta_temp_k: number;
  detection_area_ha: number;
  detection_area_km2: number;
  first_detected: string;
  last_detected: string;
  duration_hours: number;
  spread_vector_km: number;
  spread_speed_kmh: number;
  spread_azimuth_deg: number | null;
  spread_cardinal: string;
  projected_speed_kmh: number;
  projected_azimuth_deg: number;
  projected_cardinal: string;
  ml_evaluation_mode: string;
  severity_level: string;
  polygon_coords: [number, number][];
  cone_1h_coords: [number, number][];
  cone_3h_coords: [number, number][];
  cone_6h_coords: [number, number][];
  is_synthetic: boolean;
}

export interface ActiveFiresPayload {
  metadata: {
    generated_at_utc: string;
    bbox: string;
    day_range: number;
    is_synthetic: boolean;
    total_detections: number;
    active_fronts_count: number;
    isolated_hotspots_count: number;
    dbscan_eps_km: number;
  };
  kpis: {
    viirs_detections: number;
    modis_detections: number;
    harmonized_equivalent_detections: number;
    peak_pass_frp_mw: number;
    total_estimated_fre_mj: number;
    total_estimated_fre_gj: number;
    total_detection_envelope_ha: number;
    multisensor_confirmed_fronts: number;
    viirs_i4_saturated_count: number;
  };
  weather: WeatherTelemetry;
  satellite_breakdown: Record<string, { count: number; percentage: number }>;
  temporal_series: Array<{
    timestamp_hour_utc: string;
    sensor_family: string;
    detections: number;
    pass_frp_mw: number;
    max_brightness_k: number;
  }>;
  cross_sensor_calibration: {
    total_viirs_hotspots: number;
    total_modis_hotspots: number;
    empirical_count_ratio: number;
    theoretical_nadir_footprint_ratio: number;
    effective_detection_ratio_literature: number;
    colocated_fronts_count: number;
    mean_temp_ch4_difference_k: number;
    viirs_i4_saturated_pixels: number;
    calibration_model: string;
  };
  events: FireFrontEvent[];
  points: ThermalDetectionPoint[];
}

export interface SafeShelter {
  id: string;
  name: string;
  category: 'FIRE_STATION' | 'HOSPITAL' | 'CIVIL_DEFENSE' | 'EVAC_CENTER' | 'CUSTOM_POINT';
  province: string;
  locality: string;
  access_road: string;
  lat: number;
  lon: number;
  capacity_persons: number;
  has_medical_support: boolean;
  has_water_supply: boolean;
  is_verified_reliable: boolean;
  operational_status: string;
  effective_status?: 'OPEN' | 'STANDBY' | 'COMPROMISED';
  contact_phone?: string;
  is_threatened_by_fire?: boolean;
  nearest_fire_distance_km?: number;
  nearest_fire_id?: string | null;
}

export interface DangerousSegmentInfo {
  segment_index: number;
  km_mark: number;
  length_km: number;
  tier: 'WARNING' | 'BLOCKED';
  ml_risk_probability: number;
  dist_to_perimeter_km: number;
  nearest_fire_id: string | null;
  start_coord: [number, number];
  end_coord: [number, number];
}

export interface EvaluatedRouteOption {
  route_id: string;
  corridor_name: string;
  source_engine: string;
  target_shelter: SafeShelter;
  distance_km: number;
  estimated_time_min: number;
  effective_cost_score: number;
  safety_status: 'SAFE' | 'WARNING' | 'BLOCKED';
  is_passable: boolean;
  is_recommended: boolean;
  general_bearing_deg: number;
  general_cardinal: string;
  min_distance_to_fire_km: number;
  effective_safety_buffer_km: number;
  ml_risk_score: number;
  max_segment_ml_risk: number;
  ml_evaluation_mode: string;
  dangerous_segments_count: number;
  dangerous_segments: DangerousSegmentInfo[];
  blocked_reasons: string[];
  warnings: string[];
  coordinates: [number, number][];
  proximity_profile: Array<{
    km_mark: number;
    dist_to_fire_km: number;
    ml_risk_pct: number;
    tier: 'SAFE' | 'WARNING' | 'BLOCKED';
  }>;
}

export interface EvacuationPlanResponse {
  overall_status:
    | 'SAFE_ROUTE_VERIFIED'
    | 'ROUTE_WITH_CAUTION_WARNINGS'
    | 'NO_SAFE_ROAD_AVAILABLE';
  generated_at_utc: string;
  origin: { lat: number; lon: number };
  safety_parameters: {
    requested_buffer_km: number;
    data_age_hours: number;
    is_stale_fire_data: boolean;
    active_fires_evaluated: number;
  };
  global_warnings: Array<{ code: string; severity: string; message: string }>;
  recommended_route: EvaluatedRouteOption | null;
  alternative_routes: EvaluatedRouteOption[];
  passable_routes_count: number;
  blocked_routes_count: number;
  conservative_escape_corridor: {
    mode: string;
    threatening_fire_id: string;
    escape_azimuth_deg: number;
    escape_cardinal: string;
    recommended_distance_km: number;
    safe_flank_point: { lat: number; lon: number };
    corridor_coords: [number, number][];
    instruction: string;
  } | null;
}

export interface HistoricalCalendarPayload {
  metadata: {
    title: string;
    region: string;
    total_archive_detections: number;
    cordoba_detections: number;
    san_luis_detections: number;
    mode: 'annual' | 'interval';
    selected_year: number;
    range_from: number;
    range_to: number;
    selected_week: number;
    bbox_filter: {
      min_lon: number;
      min_lat: number;
      max_lon: number;
      max_lat: number;
    } | null;
    active_cells_count: number;
    total_cells_count: number;
    generated_at_utc: string;
  };
  kpis: {
    total_harmonized_eq: number;
    total_viirs_count: number;
    total_modis_count: number;
    total_frp_mw: number;
    selected_week_detail: HistoricalWeekCell;
    peak_season_window: string;
  };
  weeks: HistoricalWeekCell[];
  months: Array<{
    month_num: number;
    month_short: string;
    month_name: string;
    baseline_expected: number;
    observed_harmonized: number;
    observed_frp_mw: number;
    is_peak_season: boolean;
  }>;
  cells: Array<{
    cell_id: string;
    lat: number;
    lon: number;
    zone_name: string;
    province: string;
    total_harmonized_eq: number;
    period_eq: number;
    period_frp_mw: number;
  }>;
  yearly_breakdown: Array<{ year: number; detections: number }>;
}

export interface HistoricalWeekCell {
  week: number;
  month: string;
  baseline_mean: number;
  baseline_std: number;
  upper_band: number;
  lower_band: number;
  observed_harmonized: number;
  observed_viirs: number;
  observed_modis: number;
  observed_raw: number;
  observed_frp_mw: number;
  z_score: number;
  status: string;
  tier: number;
  pending: boolean;
  is_selected: boolean;
}

export interface MLModelMetadata {
  model_id: string;
  name: string;
  version: string;
  selected_algorithm: string;
  evaluated_algorithms: Record<string, Record<string, number>>;
  training_dataset: {
    name: string;
    samples_total: number;
    samples_train: number;
    samples_test: number;
    sha256: string;
  };
  input_features: string[];
  target_variable: string;
  metrics: Record<string, number>;
  feature_importances: Array<{ feature: string; importance: number }>;
  trained_at_utc: string;
  artifacts: { joblib: string; onnx: string };
  known_limitations: string[];
}
