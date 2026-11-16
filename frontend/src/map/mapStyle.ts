import type { StyleSpecification } from 'maplibre-gl';

/**
 * Fuentes y estilos de mapa base 100% libres y públicos (CERO API keys requeridas).
 * Cumple estrictamente con las especificaciones de OpenStreetMap y Esri World Imagery.
 */

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const ESRI_ATTRIBUTION = 'Esri, Maxar, Earthstar Geographics';

export const OPENSTREETMAP_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ESRI_SATELLITE_RASTER_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export type BasemapMode = 'streets' | 'satellite';

export const createMapLibreStyle = (defaultMode: BasemapMode = 'satellite'): StyleSpecification => ({
  version: 8,
  sources: {
    esriSatellite: {
      type: 'raster',
      tiles: [ESRI_SATELLITE_RASTER_URL],
      tileSize: 256,
      attribution: ESRI_ATTRIBUTION,
    },
    osmStreets: {
      type: 'raster',
      tiles: [OPENSTREETMAP_RASTER_URL],
      tileSize: 256,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'basemap-satellite',
      type: 'raster',
      source: 'esriSatellite',
      layout: {
        visibility: defaultMode === 'satellite' ? 'visible' : 'none',
      },
    },
    {
      id: 'basemap-streets',
      type: 'raster',
      source: 'osmStreets',
      layout: {
        visibility: defaultMode === 'streets' ? 'visible' : 'none',
      },
    },
  ],
});
