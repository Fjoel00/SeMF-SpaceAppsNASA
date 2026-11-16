-- =============================================================================
-- SeMF 2.0 - Inicialización de Base de Datos Espacial PostgreSQL 16 + PostGIS 3.4
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS fire_events (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    province VARCHAR(64) NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    centroid_lon DOUBLE PRECISION NOT NULL,
    points_count INTEGER NOT NULL DEFAULT 1,
    viirs_count INTEGER NOT NULL DEFAULT 0,
    modis_count INTEGER NOT NULL DEFAULT 0,
    multisensor_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    satellites_involved VARCHAR(128),
    frp_peak_mw DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    frp_total_mw DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    fre_est_mj DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    temp_brightness_max_k DOUBLE PRECISION NOT NULL DEFAULT 300.0,
    mean_delta_temp_k DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    detection_area_ha DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    spread_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    spread_azimuth_deg DOUBLE PRECISION,
    spread_cardinal VARCHAR(16),
    severity_level VARCHAR(64) NOT NULL,
    first_detected_utc TIMESTAMP WITH TIME ZONE,
    last_detected_utc TIMESTAMP WITH TIME ZONE,
    is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    perimeter_geom GEOMETRY(Polygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_fire_events_perimeter_gist
    ON fire_events USING GIST (perimeter_geom);

CREATE TABLE IF NOT EXISTS safe_shelters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    province VARCHAR(64) NOT NULL,
    locality VARCHAR(128) NOT NULL,
    access_road VARCHAR(255),
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    capacity_persons INTEGER NOT NULL DEFAULT 100,
    has_medical_support BOOLEAN NOT NULL DEFAULT FALSE,
    has_water_supply BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified_reliable BOOLEAN NOT NULL DEFAULT TRUE,
    operational_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    contact_phone VARCHAR(64),
    geom_point GEOMETRY(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_safe_shelters_geom_gist
    ON safe_shelters USING GIST (geom_point);
