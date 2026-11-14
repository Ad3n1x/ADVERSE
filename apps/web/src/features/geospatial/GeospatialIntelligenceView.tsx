import { useCallback, useEffect, useMemo, useState } from 'react';
import Globe from 'react-globe.gl';
import { Activity, ExternalLink, Globe2, RefreshCw, ShieldCheck } from 'lucide-react';
import { normalizeGeoEvent } from './normalize';
import type { GeoEvent } from './types';
import './geospatial.css';

const FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const GLOBE_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BACKGROUND_TEXTURE = 'https://unpkg.com/three-globe/example/img/night-sky.png';

type FeedState = 'loading' | 'ready' | 'error';

export default function GeospatialIntelligenceView() {
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [status, setStatus] = useState<FeedState>('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<GeoEvent | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const response = await fetch(FEED_URL, { headers: { Accept: 'application/geo+json, application/json' } });
      if (!response.ok) throw new Error('USGS feed returned HTTP ' + response.status);
      const payload = await response.json() as { features?: Array<Record<string, unknown>> };
      const normalized = (payload.features || []).map((raw) => {
        const properties = raw.properties as Record<string, unknown> | undefined;
        const geometry = raw.geometry as { coordinates?: unknown } | undefined;
        const coordinates = geometry?.coordinates;
        if (!properties || !Array.isArray(coordinates)) return null;
        const event = normalizeGeoEvent({
          id: String(raw.id || properties.code || ''),
          title: String(properties.title || properties.place || 'Earthquake event'),
          category: 'earthquake',
          position: coordinates.slice(0, 2),
          observedAt: new Date(Number(properties.time)).toISOString(),
          source: { name: 'USGS Earthquake Hazards Program', url: String(properties.url || FEED_URL), license: 'USGS public data' },
          summary: String(properties.place || 'Location not supplied'),
          confidence: 'unassessed',
          evidenceIds: [],
        });
        return event;
      }).filter((event): event is GeoEvent => Boolean(event));
      setEvents(normalized);
      setLastUpdated(new Date().toISOString());
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the public earthquake feed.');
      setStatus('error');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const points = useMemo(() => events.map((event) => ({
    ...event,
    lat: event.position[1],
    lng: event.position[0],
    size: Math.max(0.12, Math.min(0.7, 0.12 + Math.max(0, Number(event.summary?.match(/M([0-9.]+)/)?.[1] || 0)) * 0.07)),
  })), [events]);

  return (
    <section className="geo-workspace">
      <div className="geo-toolbar">
        <div className="geo-toolbar-copy">
          <span className="geo-kicker"><Globe2 size={13}/> PUBLIC GEOSPATIAL INTELLIGENCE</span>
          <h2>Earth observation</h2>
          <p>Explore verified public geographic event feeds. Every marker links back to its originating source.</p>
        </div>
        <div className="geo-feed-status">
          <span className={'geo-status-dot ' + status}/>
          <span>{status === 'loading' ? 'Updating feed' : status === 'ready' ? 'Feed connected' : 'Feed unavailable'}</span>
          <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={status === 'loading'}><RefreshCw size={14}/> Refresh</button>
        </div>
      </div>
      {error && <div className="geo-error" role="alert">{error}. The globe remains available; try refreshing shortly.</div>}
      <div className="geo-globe-panel">
        <div className="geo-globe-legend"><span><i className="geo-legend-earthquake"/> Earthquake event</span><span>USGS · Past 24 hours</span></div>
        <div className="geo-globe-canvas">
          <Globe
            width={undefined}
            height={520}
            globeImageUrl={GLOBE_TEXTURE}
            backgroundImageUrl={BACKGROUND_TEXTURE}
            showAtmosphere
            atmosphereColor="#79d9c4"
            atmosphereAltitude={0.18}
            pointsData={points}
            pointLat="lat"
            pointLng="lng"
            pointAltitude={0.012}
            pointRadius="size"
            pointColor={() => '#f0b86d'}
            pointResolution={8}
            pointsMerge={false}
            pointLabel={(point: object) => {
              const event = point as GeoEvent & { summary?: string };
              return '<div class="geo-point-tooltip"><strong>' + event.title.replace(/[<>]/g, '') + '</strong><br/>' + (event.summary || '') + '</div>';
            }}
            onPointClick={(point: object) => setSelected(point as GeoEvent)}
            animateIn
          />
          {status === 'loading' && <div className="geo-loading"><RefreshCw size={16}/> Loading public event data…</div>}
        </div>
        <div className="geo-globe-footer"><span><ShieldCheck size={13}/> Public-source data only · Not a real-time tracking system</span><span>{lastUpdated ? 'Updated ' + new Date(lastUpdated).toLocaleTimeString() : 'Awaiting first update'}</span></div>
      </div>
      <div className="geo-summary-grid">
        <div className="geo-summary-card"><Activity size={16}/><span>EVENTS IN FEED</span><strong>{events.length}</strong></div>
        <div className="geo-summary-card"><Globe2 size={16}/><span>DATA COVERAGE</span><strong>Global</strong></div>
        <div className="geo-summary-card"><ShieldCheck size={16}/><span>PROVENANCE</span><strong>Source linked</strong></div>
      </div>
      <div className="geo-events-panel">
        <div className="geo-events-heading"><div><h3>Latest public events</h3><p>USGS earthquake observations from the past 24 hours.</p></div><span>{events.length} records</span></div>
        {events.length === 0 && status === 'ready' && <p className="geo-empty">No events were returned by the selected feed.</p>}
        <div className="geo-event-list">
          {events.slice(0, 12).map((event) => (
            <button type="button" className={'geo-event-row ' + (selected?.id === event.id ? 'selected' : '')} key={event.id} onClick={() => setSelected(event)}>
              <span className="geo-event-marker"/>
              <span className="geo-event-copy"><strong>{event.title}</strong><small>{new Date(event.observedAt).toLocaleString()} · {event.position[1].toFixed(2)}, {event.position[0].toFixed(2)}</small></span>
              <ExternalLink size={14}/>
            </button>
          ))}
        </div>
      </div>
      {selected && <aside className="geo-selected-event"><div><span className="geo-kicker">SELECTED OBSERVATION</span><h3>{selected.title}</h3><p>{selected.summary}</p><small>Observed {new Date(selected.observedAt).toLocaleString()} · Coordinates {selected.position[1].toFixed(4)}, {selected.position[0].toFixed(4)}</small></div><a href={selected.source.url} target="_blank" rel="noreferrer">Open original USGS record <ExternalLink size={13}/></a><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Close</button></aside>}
      <p className="geo-disclaimer">Map observations are informational and may be delayed or revised by their provider. A marker is not independent verification. Always consult the linked source and its data terms.</p>
    </section>
  );
}
