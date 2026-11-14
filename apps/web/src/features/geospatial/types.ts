/**
 * ADVERSE geospatial contracts.
 *
 * Provider data is normalized into this shape before it reaches the UI.
 * Coordinates use GeoJSON order: [longitude, latitude].
 */
export type GeoPosition = [longitude: number, latitude: number];

export type GeoEventCategory =
  | 'earthquake'
  | 'weather'
  | 'environment'
  | 'transport'
  | 'infrastructure'
  | 'public_notice'
  | 'other';

export type GeoEvent = {
  id: string;
  title: string;
  category: GeoEventCategory;
  position: GeoPosition;
  observedAt: string;
  source: {
    name: string;
    url: string;
    license?: string;
  };
  summary?: string;
  confidence: 'unassessed' | 'low' | 'medium' | 'high';
  evidenceIds: string[];
  publicInterestOnly: true;
};

export type GeoJsonFeature = {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point';
    coordinates: GeoPosition;
  };
  properties: Omit<GeoEvent, 'id' | 'position'>;
};

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

export type GeoLayerState = {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  events: GeoEvent[];
  updatedAt: string | null;
};
