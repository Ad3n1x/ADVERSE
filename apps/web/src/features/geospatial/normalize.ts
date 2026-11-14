import type { GeoEvent, GeoEventCategory, GeoPosition, GeoJsonFeatureCollection } from './types';

const categories = new Set<GeoEventCategory>([
  'earthquake', 'weather', 'environment', 'transport',
  'infrastructure', 'public_notice', 'other',
]);

function isPosition(value: unknown): value is GeoPosition {
  if (!Array.isArray(value) || value.length < 2) return false;
  const [longitude, latitude] = value;
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180
    && latitude >= -90 && latitude <= 90;
}

/** Reject malformed or unprovenanced records rather than drawing misleading markers. */
export function normalizeGeoEvent(input: unknown): GeoEvent | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const source = value.source as Record<string, unknown> | undefined;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.title !== 'string' || !value.title.trim()) return null;
  if (!categories.has(value.category as GeoEventCategory)) return null;
  if (!isPosition(value.position)) return null;
  if (typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt))) return null;
  if (!source || typeof source.name !== 'string' || typeof source.url !== 'string') return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  const confidence = value.confidence;
  if (!['unassessed', 'low', 'medium', 'high'].includes(String(confidence))) return null;
  const evidenceIds = Array.isArray(value.evidenceIds)
    ? value.evidenceIds.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id: value.id,
    title: value.title,
    category: value.category as GeoEventCategory,
    position: value.position,
    observedAt: value.observedAt,
    source: {
      name: source.name,
      url: source.url,
      ...(typeof source.license === 'string' ? { license: source.license } : {}),
    },
    ...(typeof value.summary === 'string' ? { summary: value.summary } : {}),
    confidence: confidence as GeoEvent['confidence'],
    evidenceIds,
    publicInterestOnly: true,
  };
}

export function toGeoJson(events: GeoEvent[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => ({
      type: 'Feature',
      id: event.id,
      geometry: { type: 'Point', coordinates: event.position },
      properties: {
        title: event.title,
        category: event.category,
        observedAt: event.observedAt,
        source: event.source,
        ...(event.summary ? { summary: event.summary } : {}),
        confidence: event.confidence,
        evidenceIds: event.evidenceIds,
        publicInterestOnly: true,
      },
    })),
  };
}
