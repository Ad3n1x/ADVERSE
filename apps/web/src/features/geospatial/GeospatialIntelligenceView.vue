<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import * as Cesium from 'cesium';
import { createApplicationViewer } from 'gods-eye-view/application/viewer';
import 'cesium/Build/Cesium/Widgets/widgets.css';

type Quake = {
  id: string; place: string; magnitude: number | null; occurredAt: number | null;
  longitude: number; latitude: number; depthKm: number | null; url: string;
};
type NaturalEvent = {
  id: string; title: string; category: string; occurredAt: string;
  longitude: number; latitude: number; url: string; locationBasis: string;
};
type FeedTab = 'earthquakes' | 'natural';
type StacCollection = { id: string; title: string; description: string; license: string; href: string };
const props = defineProps<{
  onSave?: (title: string, url: string, excerpt: string, publisher: string, entityType: 'organization' | 'domain' | 'document') => Promise<boolean>;
  canSave?: () => boolean;
}>();

const mapHost = ref<HTMLDivElement | null>(null);
const creditHost = ref<HTMLDivElement | null>(null);
const earthquakes = ref<Quake[]>([]);
const naturalEvents = ref<NaturalEvent[]>([]);
const activeFeed = ref<FeedTab>('earthquakes');
const loadingQuakes = ref(true);
const loadingNatural = ref(true);
const quakeError = ref('');
const naturalError = ref('');
const quakeUpdatedAt = ref('');
const naturalUpdatedAt = ref('');
const quakeCount = ref(0);
const naturalCount = ref(0);
const stacCollections = ref<StacCollection[]>([]);
const stacLoading = ref(true);
const stacError = ref('');
const stacUpdatedAt = ref('');
const stacEndpoint = 'https://earth-search.aws.element84.com/v1/collections';
const savingEventId = ref('');
const savedEventIds = ref<string[]>([]);
const saveError = ref('');
const canSave = computed(() => props.canSave?.() ?? false);
const activeEvents = computed(() => activeFeed.value === 'earthquakes' ? earthquakes.value : naturalEvents.value);
const activeLoading = computed(() => activeFeed.value === 'earthquakes' ? loadingQuakes.value : loadingNatural.value);
const activeError = computed(() => activeFeed.value === 'earthquakes' ? quakeError.value : naturalError.value);
const activeUpdatedAt = computed(() => activeFeed.value === 'earthquakes' ? quakeUpdatedAt.value : naturalUpdatedAt.value);
let viewer: Cesium.Viewer | null = null;
let quakeLayer: Cesium.GeoJsonDataSource | null = null;
let naturalLayer: Cesium.GeoJsonDataSource | null = null;
let disposed = false;

const usgsUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const eonetUrl = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=40';

function representativeCoordinate(geometry: any): { coordinates: number[]; basis: string } | null {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  if (geometry.type === 'Point' && geometry.coordinates.length >= 2) {
    return { coordinates: geometry.coordinates, basis: 'reported point' };
  }
  const rings = geometry.type === 'Polygon'
    ? [geometry.coordinates[0]]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates.map((polygon: any[]) => polygon?.[0])
      : geometry.type === 'LineString' || geometry.type === 'MultiPoint'
        ? [geometry.coordinates]
        : [];
  const positions = rings.flat().filter((position: any) =>
    Array.isArray(position) && Number.isFinite(position[0]) && Number.isFinite(position[1])
  );
  if (!positions.length) return null;
  const longitude = positions.reduce((sum: number, position: number[]) => sum + position[0], 0) / positions.length;
  const latitude = positions.reduce((sum: number, position: number[]) => sum + position[1], 0) / positions.length;
  return { coordinates: [longitude, latitude], basis: 'approximate geometry centre' };
}

function formatTime(value: number | string | null) {
  if (!value) return 'Time unavailable';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function refreshEarthquakes() {
  loadingQuakes.value = true;
  quakeError.value = '';
  try {
    const response = await fetch(usgsUrl, { headers: { Accept: 'application/geo+json' } });
    if (!response.ok) throw new Error(`USGS feed returned HTTP ${response.status}`);
    const payload = await response.json();
    if (disposed || !viewer) return;
    const features = Array.isArray(payload.features) ? payload.features : [];
    const parsed: Quake[] = features.map((feature: any) => {
      const coordinates = feature.geometry?.coordinates ?? [];
      return {
        id: String(feature.id ?? ''),
        place: String(feature.properties?.place ?? 'Location not supplied'),
        magnitude: Number.isFinite(feature.properties?.mag) ? feature.properties.mag : null,
        occurredAt: Number.isFinite(feature.properties?.time) ? feature.properties.time : null,
        longitude: Number(coordinates[0]), latitude: Number(coordinates[1]),
        depthKm: Number.isFinite(coordinates[2]) ? Number(coordinates[2]) : null,
        url: String(feature.properties?.url ?? 'https://earthquake.usgs.gov/earthquakes/'),
      };
    }).filter((event: Quake) => Number.isFinite(event.longitude) && Number.isFinite(event.latitude));
    if (quakeLayer) await viewer.dataSources.remove(quakeLayer, true);
    quakeLayer = await Cesium.GeoJsonDataSource.load(payload, {
      clampToGround: false, markerColor: Cesium.Color.fromCssColorString('#f3ad55'),
      markerSize: 9, markerSymbol: 'circle',
    });
    if (disposed) { quakeLayer = null; return; }
    await viewer.dataSources.add(quakeLayer);
    earthquakes.value = parsed.slice(0, 10);
    quakeCount.value = parsed.length;
    quakeUpdatedAt.value = new Date(Number(payload.metadata?.generated) || Date.now()).toLocaleString();
  } catch (cause) {
    if (!disposed) quakeError.value = cause instanceof Error ? cause.message : 'Unable to load the USGS feed.';
  } finally {
    if (!disposed) loadingQuakes.value = false;
  }
}

async function refreshNaturalEvents() {
  loadingNatural.value = true;
  naturalError.value = '';
  try {
    const response = await fetch(eonetUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`NASA EONET returned HTTP ${response.status}`);
    const payload = await response.json();
    if (disposed || !viewer) return;
    const sourceEvents = Array.isArray(payload.events) ? payload.events : [];
    const parsed: NaturalEvent[] = sourceEvents.map((event: any) => {
      const latestGeometry = [...(event.geometry ?? [])].reverse().find((item: any) => representativeCoordinate(item));
      const location = latestGeometry ? representativeCoordinate(latestGeometry) : null;
      if (!latestGeometry || !location) return null;
      const [longitude, latitude] = location.coordinates;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
      return {
        id: String(event.id ?? event.title),
        title: String(event.title ?? 'Public natural event'),
        category: String(event.categories?.map((item: any) => item.title).filter(Boolean).join(' · ') || 'Natural event'),
        occurredAt: String(latestGeometry.date ?? ''),
        longitude: Number(longitude), latitude: Number(latitude), locationBasis: location.basis,
        url: String(event.sources?.[0]?.url ?? event.link ?? ('https://eonet.gsfc.nasa.gov/events/' + encodeURIComponent(String(event.id ?? '')))),
      };
    }).filter((event: NaturalEvent | null): event is NaturalEvent => Boolean(event));
    const geoJson = {
      type: 'FeatureCollection',
      features: parsed.map(event => ({
        type: 'Feature',
        id: event.id,
        geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] },
        properties: { title: event.title, category: event.category, date: event.occurredAt, url: event.url },
      })),
    };
    if (naturalLayer) await viewer.dataSources.remove(naturalLayer, true);
    naturalLayer = await Cesium.GeoJsonDataSource.load(geoJson as any, {
      clampToGround: false, markerColor: Cesium.Color.fromCssColorString('#69c8d7'),
      markerSize: 11, markerSymbol: 'circle',
    });
    if (disposed) { naturalLayer = null; return; }
    await viewer.dataSources.add(naturalLayer);
    naturalEvents.value = parsed.slice(0, 10);
    naturalCount.value = parsed.length;
    naturalUpdatedAt.value = new Date().toLocaleString();
  } catch (cause) {
    if (!disposed) naturalError.value = cause instanceof Error ? cause.message : 'Unable to load NASA EONET events.';
  } finally {
    if (!disposed) loadingNatural.value = false;
  }
}

async function refreshStacCatalog() {
  stacLoading.value = true;
  stacError.value = '';
  try {
    const response = await fetch(stacEndpoint, { headers: { Accept: 'application/geo+json, application/json' } });
    if (!response.ok) throw new Error(`STAC catalogue returned HTTP ${response.status}`);
    const payload = await response.json();
    if (disposed) return;
    const collections = Array.isArray(payload.collections) ? payload.collections : [];
    stacCollections.value = collections.slice(0, 5).map((collection: any) => {
      const id = String(collection.id ?? '');
      const selfLink = Array.isArray(collection.links) ? collection.links.find((link: any) => link.rel === 'self')?.href : '';
      const safeHref = typeof selfLink === 'string' && selfLink.startsWith('https://earth-search.aws.element84.com/')
        ? selfLink
        : `https://earth-search.aws.element84.com/v1/collections/${encodeURIComponent(id)}`;
      return {
        id,
        title: String(collection.title ?? id),
        description: String(collection.description ?? 'Public STAC collection'),
        license: String(collection.license ?? 'See publisher terms'),
        href: safeHref,
      };
    }).filter((collection: StacCollection) => Boolean(collection.id));
    stacUpdatedAt.value = new Date().toLocaleString();
  } catch (cause) {
    if (!disposed) stacError.value = cause instanceof Error ? cause.message : 'Unable to load the public STAC catalogue.';
  } finally {
    if (!disposed) stacLoading.value = false;
  }
}

async function refreshAll() {
  await Promise.allSettled([refreshEarthquakes(), refreshNaturalEvents(), refreshStacCatalog()]);
}

function focusEvent(event: Quake | NaturalEvent) {
  if (!viewer) return;
  const altitude = 'magnitude' in event ? 900000 : 1700000;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(event.longitude, event.latitude, altitude),
    duration: 1.25,
  });
}

async function saveEvent(event: Quake | NaturalEvent) {
  if (!canSave.value || !props.onSave) {
    saveError.value = 'Choose an active collection in the workspace header before saving evidence.';
    return;
  }
  if (savedEventIds.value.includes(event.id)) return;
  savingEventId.value = event.id;
  saveError.value = '';
  const isQuake = 'magnitude' in event;
  const publisher = isQuake ? 'United States Geological Survey (USGS)' : 'NASA Earth Observatory Natural Event Tracker (EONET)';
  const title = (isQuake ? 'Earthquake: ' + event.place : 'Natural event: ' + event.title).slice(0, 240);
  const eventTime = isQuake ? formatTime(event.occurredAt) : formatTime(event.occurredAt);
  const detail = [
    'Public geospatial observation saved from an attributed source feed.',
    'Publisher: ' + publisher,
    'Event time: ' + eventTime,
    'Coordinates: ' + event.latitude.toFixed(5) + ', ' + event.longitude.toFixed(5),
    isQuake ? 'Magnitude: ' + (event.magnitude === null ? 'not supplied' : event.magnitude.toFixed(1)) : 'Category: ' + event.category,
    !isQuake ? 'Location basis: ' + event.locationBasis : 'Depth (km): ' + (event.depthKm === null ? 'not supplied' : event.depthKm.toFixed(1)),
    'Retrieved at: ' + new Date().toISOString(),
    'This record preserves the source observation; it is not independent verification.',
  ].join('\\n');
  try {
    const saved = await props.onSave(title, event.url, detail, publisher, 'document');
    if (!saved) throw new Error('The event was not saved. Check the collection and try again.');
    savedEventIds.value = [...savedEventIds.value, event.id];
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : 'Unable to save this event to the active collection.';
  } finally {
    savingEventId.value = '';
  }
}

onMounted(async () => {
  try {
    if (!mapHost.value || !creditHost.value) throw new Error('The globe container is unavailable.');
    viewer = createApplicationViewer({
      container: mapHost.value, creditContainer: creditHost.value, showRenderLoopErrors: false,
    });
    viewer.scene.globe.show = true;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.skyAtmosphere.show = true;
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: new Cesium.Credit('© OpenStreetMap contributors', true),
      maximumLevel: 19,
    }));
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(8, 12, 23000000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });
    await refreshAll();
  } catch (cause) {
    quakeError.value = cause instanceof Error ? cause.message : 'The 3D globe could not be started.';
    loadingQuakes.value = false;
    loadingNatural.value = false;
  }
});

onBeforeUnmount(() => {
  disposed = true;
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = null;
  quakeLayer = null;
  naturalLayer = null;
});
</script>

<template>
  <section class="geo-shell" aria-label="Geospatial intelligence workspace">
    <header class="geo-heading">
      <div class="geo-title-group">
        <p class="geo-kicker"><span class="geo-kicker-dot"></span> ADVERSE / PUBLIC GEOSPATIAL DATA</p>
        <h2>Global event monitor</h2>
        <p class="geo-subtitle">A live geographic picture built from attributed public event feeds.</p>
      </div>
      <button class="geo-refresh" type="button" :disabled="loadingQuakes || loadingNatural" @click="refreshAll">
        <span class="geo-refresh-icon">↻</span>
        {{ loadingQuakes || loadingNatural ? 'Refreshing feeds…' : 'Refresh data' }}
      </button>
    </header>

    <div class="geo-metrics">
      <article class="geo-metric geo-metric-amber">
        <span class="geo-metric-icon">⌁</span>
        <div><small>EARTHQUAKES · USGS</small><strong>{{ quakeCount.toLocaleString() }}</strong><span>Past 24 hours</span></div>
        <i></i>
      </article>
      <article class="geo-metric geo-metric-cyan">
        <span class="geo-metric-icon">✳</span>
        <div><small>NATURAL EVENTS · NASA</small><strong>{{ naturalCount.toLocaleString() }}</strong><span>Currently open events</span></div>
        <i></i>
      </article>
      <article class="geo-metric geo-metric-blue">
        <span class="geo-metric-icon">◎</span>
        <div><small>PUBLIC DATA SOURCES</small><strong>03</strong><span>Public data and catalogue sources</span></div>
        <i></i>
      </article>
    </div>

    <div class="geo-workspace">
      <div class="geo-map-card">
        <div ref="mapHost" class="geo-map" role="img" aria-label="Interactive 3D globe showing public earthquake and natural event markers"></div>
        <div ref="creditHost" class="geo-credits"></div>
        <div class="geo-map-topline">
          <div class="geo-map-label"><span class="geo-live-pulse"></span> GLOBAL EVENT VIEW</div>
          <span class="geo-map-coordinate">3D / WGS84</span>
        </div>
        <div class="geo-map-legend">
          <span><i class="legend-quake"></i> Earthquakes</span>
          <span><i class="legend-natural"></i> Natural events</span>
        </div>
        <div class="geo-map-footnote">Public observations · Not for emergency response</div>
      </div>

      <aside class="geo-side">
        <div class="geo-feed-panel">
          <div class="geo-panel-heading">
            <div><p class="geo-panel-kicker">LIVE PUBLIC FEEDS</p><h3>Event explorer</h3></div>
            <span class="geo-source-count">02 SOURCES</span>
          </div>
          <div class="geo-feed-tabs" role="tablist" aria-label="Choose public event feed">
            <button type="button" role="tab" :aria-selected="activeFeed === 'earthquakes'" :class="{ active: activeFeed === 'earthquakes' }" @click="activeFeed = 'earthquakes'">
              <i class="legend-quake"></i> Earthquakes <b>{{ quakeCount }}</b>
            </button>
            <button type="button" role="tab" :aria-selected="activeFeed === 'natural'" :class="{ active: activeFeed === 'natural' }" @click="activeFeed = 'natural'">
              <i class="legend-natural"></i> Natural <b>{{ naturalCount }}</b>
            </button>
          </div>
          <div class="geo-events-head"><strong>{{ activeFeed === 'earthquakes' ? 'Recent seismic activity' : 'Active natural events' }}</strong><span>{{ activeEvents.length }} shown</span></div>
          <div class="geo-event-list">
            <div v-if="activeLoading && !activeEvents.length" class="geo-state"><span class="geo-loader"></span> Loading attributed public data…</div>
            <div v-else-if="activeError" class="geo-state geo-state-error">{{ activeError }} <button type="button" @click="activeFeed === 'earthquakes' ? refreshEarthquakes() : refreshNaturalEvents()">Retry</button></div>
            <div v-else-if="!activeEvents.length" class="geo-state">No events are currently available from this feed.</div>
            <div v-for="event in activeEvents" :key="event.id" class="geo-event">
              <button class="geo-event-focus" type="button" @click="focusEvent(event)" :aria-label="'Focus globe on ' + ('place' in event ? event.place : event.title)">
                <span v-if="'magnitude' in event" class="geo-event-mark geo-event-mark-quake">{{ event.magnitude === null ? '—' : event.magnitude.toFixed(1) }}</span>
                <span v-else class="geo-event-mark geo-event-mark-natural">✳</span>
                <span class="geo-event-copy">
                  <strong>{{ 'place' in event ? event.place : event.title }}</strong>
                  <small>{{ 'magnitude' in event ? formatTime(event.occurredAt) : event.category + ' · ' + formatTime(event.occurredAt) }}</small>
                  <small>{{ event.latitude.toFixed(2) }}, {{ event.longitude.toFixed(2) }}<template v-if="'locationBasis' in event"> · {{ event.locationBasis }}</template></small>
                </span>
                <span class="geo-event-arrow">↗</span>
              </button>
              <button class="geo-save-event" type="button" :disabled="!canSave || savingEventId === event.id || savedEventIds.includes(event.id)" @click="saveEvent(event)">
                {{ savedEventIds.includes(event.id) ? 'Saved' : savingEventId === event.id ? 'Saving…' : 'Save evidence' }}
              </button>
            </div>
          </div>
          <p v-if="saveError" class="geo-save-note geo-state-error">{{ saveError }}</p>
          <p v-else-if="!canSave" class="geo-save-note">Select a collection in the workspace header to save event records into Evidence Vault.</p>
          <div class="geo-feed-updated"><span class="geo-feed-status"></span> Updated {{ activeUpdatedAt || 'when source responds' }}</div>
        </div>


        <div class="geo-catalog-panel">
          <div class="geo-panel-heading"><div><p class="geo-panel-kicker">STAC / OPEN GEOSPATIAL DATA</p><h3>Public imagery catalogue</h3></div><span class="geo-catalog-count">{{ stacCollections.length }}</span></div>
          <p class="geo-catalog-intro">Discover public Earth-observation datasets through an open SpatioTemporal Asset Catalog API.</p>
          <div v-if="stacLoading && !stacCollections.length" class="geo-catalog-state"><span class="geo-loader"></span> Loading collection metadata…</div>
          <p v-else-if="stacError" class="geo-catalog-state geo-state-error">{{ stacError }} <button type="button" @click="refreshStacCatalog">Retry</button></p>
          <a v-for="collection in stacCollections" :key="collection.id" class="geo-catalog-item" :href="collection.href" target="_blank" rel="noreferrer">
            <span class="geo-catalog-symbol">▦</span><span><strong>{{ collection.title }}</strong><small>{{ collection.id }} · {{ collection.license }}</small></span><b>↗</b>
          </a>
          <div class="geo-catalog-footer"><a :href="stacEndpoint" target="_blank" rel="noreferrer">Element 84 / Earth Search ↗</a><span>{{ stacUpdatedAt ? 'Checked ' + stacUpdatedAt : 'Catalogue status pending' }}</span></div>
        </div>
        <div class="geo-provenance">
          <div class="geo-panel-heading"><div><p class="geo-panel-kicker">TRACEABLE BY DESIGN</p><h3>Source provenance</h3></div><span class="geo-shield">✓</span></div>
          <a class="geo-source-link" href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson" target="_blank" rel="noreferrer">
            <span class="geo-source-symbol geo-source-symbol-amber">U</span><span><strong>USGS Earthquake Hazards</strong><small>Past 24-hour GeoJSON feed</small></span><b>↗</b>
          </a>
          <a class="geo-source-link" href="https://eonet.gsfc.nasa.gov/" target="_blank" rel="noreferrer">
            <span class="geo-source-symbol geo-source-symbol-cyan">N</span><span><strong>NASA Earth Observatory</strong><small>Earth Observatory Natural Event Tracker</small></span><b>↗</b>
          </a>
          <p class="geo-limitations">Feeds may be revised, delayed or incomplete. Source presence does not independently verify an event. This workspace is informational, not an emergency or navigation service.</p>
        </div>
      </aside>
    </div>
    <footer class="geo-footer"><span>GEOSPATIAL INTELLIGENCE / AD3N1X</span><span>Open data · Source-linked · Non-personal</span></footer>
  </section>
</template>

<style scoped>
.geo-shell{--geo-panel:#0e1927;--geo-border:rgba(139,166,196,.16);--geo-muted:#8b9caf;display:grid;gap:18px;min-width:0;color:var(--text,#e8eef5)}
.geo-heading{display:flex;align-items:center;justify-content:space-between;gap:18px}
.geo-kicker{display:flex;align-items:center;gap:8px;margin:0 0 9px;color:#88a8c9;font-size:10px;font-weight:800;letter-spacing:.17em}
.geo-kicker-dot,.geo-live-pulse,.geo-feed-status{width:7px;height:7px;border-radius:50%;background:#64d5ae;box-shadow:0 0 0 4px #64d5ae1b}
.geo-heading h2{margin:0;font-size:clamp(23px,3vw,32px);font-weight:750;letter-spacing:-.045em}
.geo-subtitle{margin:7px 0 0;color:var(--geo-muted);font-size:13px}
.geo-refresh{display:inline-flex;align-items:center;gap:9px;min-height:42px;padding:0 15px;border:1px solid var(--geo-border);border-radius:11px;background:linear-gradient(135deg,#1c3044,#132234);color:#e8f2fc;font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:transform .2s,border-color .2s}
.geo-refresh:hover:not(:disabled){transform:translateY(-1px);border-color:#6f9fc5}
.geo-refresh:disabled{opacity:.65;cursor:wait}
.geo-refresh-icon{font-size:18px;color:#9bc6e8}
.geo-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.geo-metric{position:relative;display:flex;align-items:center;gap:13px;min-width:0;overflow:hidden;padding:15px 16px;border:1px solid var(--geo-border);border-radius:14px;background:linear-gradient(135deg,rgba(19,35,52,.98),rgba(11,22,35,.96));box-shadow:0 12px 28px rgba(0,0,0,.1)}
.geo-metric-icon{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:12px;font-size:21px;background:#ffffff09}
.geo-metric div{display:grid;gap:3px;min-width:0}
.geo-metric small{color:#91a6ba;font-size:9px;font-weight:800;letter-spacing:.1em}
.geo-metric strong{font-size:25px;line-height:1.1;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.geo-metric div span{color:var(--geo-muted);font-size:10px}
.geo-metric i{position:absolute;right:-20px;bottom:-32px;width:100px;height:75px;border-radius:50%;filter:blur(24px);opacity:.16}
.geo-metric-amber .geo-metric-icon,.geo-metric-amber i{color:#f2b45e;background:#e9a74b1c}.geo-metric-amber i{background:#e9a74b}
.geo-metric-cyan .geo-metric-icon,.geo-metric-cyan i{color:#70d3df;background:#64c9d51c}.geo-metric-cyan i{background:#64c9d5}
.geo-metric-blue .geo-metric-icon,.geo-metric-blue i{color:#8bb8f4;background:#7aaaf31c}.geo-metric-blue i{background:#7aaaf3}
.geo-workspace{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,.82fr);gap:14px;min-height:590px}
.geo-map-card{position:relative;isolation:isolate;overflow:hidden;min-height:590px;border:1px solid var(--geo-border);border-radius:17px;background:radial-gradient(ellipse at 50% 45%,#12344b 0%,#091725 56%,#07111d 100%);box-shadow:0 18px 44px rgba(0,0,0,.18)}
.geo-map{position:absolute;inset:0}
.geo-map:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(4,12,21,.38),transparent 24%,transparent 76%,rgba(4,12,21,.38))}
.geo-credits{position:absolute;right:9px;bottom:6px;z-index:3;color:#d7e2ef;font-size:10px}
.geo-map-topline{position:absolute;z-index:2;top:15px;left:15px;right:15px;display:flex;align-items:center;justify-content:space-between;pointer-events:none}
.geo-map-label,.geo-map-coordinate{display:inline-flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #ffffff20;border-radius:9px;background:rgba(5,16,28,.82);backdrop-filter:blur(12px);color:#e9f2fb;font-size:9px;font-weight:800;letter-spacing:.13em}
.geo-live-pulse{width:6px;height:6px;box-shadow:0 0 0 4px #64d5ae20}
.geo-map-coordinate{color:#a4b7ca;font-weight:700}
.geo-map-legend{position:absolute;z-index:2;left:15px;bottom:17px;display:flex;gap:14px;padding:9px 12px;border:1px solid #ffffff1c;border-radius:9px;background:rgba(5,16,28,.82);backdrop-filter:blur(12px);color:#d6e3ef;font-size:10px;pointer-events:none}
.geo-map-legend span{display:flex;align-items:center;gap:7px}
.legend-quake,.legend-natural{display:inline-block;width:8px;height:8px;border-radius:50%}
.legend-quake{background:#f3ad55;box-shadow:0 0 10px #f3ad5580}
.legend-natural{background:#69c8d7;box-shadow:0 0 10px #69c8d780}
.geo-map-footnote{position:absolute;z-index:2;right:14px;bottom:18px;color:#a9bac9;font-size:9px;pointer-events:none}
.geo-side{display:flex;flex-direction:column;gap:13px;min-width:0}
.geo-feed-panel,.geo-provenance{min-width:0;border:1px solid var(--geo-border);border-radius:15px;background:linear-gradient(155deg,rgba(17,31,47,.98),rgba(11,22,35,.98));box-shadow:0 12px 28px rgba(0,0,0,.1)}
.geo-feed-panel{display:flex;flex:1;flex-direction:column;min-height:350px;padding:15px}
.geo-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
.geo-panel-kicker{margin:0 0 4px;color:#8099b1;font-size:9px;font-weight:800;letter-spacing:.14em}
.geo-panel-heading h3{margin:0;color:#eaf2fa;font-size:15px;letter-spacing:-.02em}
.geo-source-count{padding:6px 8px;border:1px solid var(--geo-border);border-radius:7px;color:#8fa6bc;font-size:8px;font-weight:800;letter-spacing:.1em}
.geo-feed-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:15px 0 13px;padding:4px;border:1px solid #ffffff0c;border-radius:10px;background:#071321}
.geo-feed-tabs button{display:flex;align-items:center;justify-content:center;gap:7px;min-width:0;padding:9px 6px;border:1px solid transparent;border-radius:7px;background:transparent;color:#91a5b9;font:inherit;font-size:10px;font-weight:700;cursor:pointer}
.geo-feed-tabs button.active{border-color:#6c94b522;background:#1a2b3e;color:#f1f6fc;box-shadow:0 3px 10px #0002}
.geo-feed-tabs button b{color:#a7bbce;font-size:9px;font-variant-numeric:tabular-nums}
.geo-feed-tabs .legend-quake,.geo-feed-tabs .legend-natural{width:7px;height:7px}
.geo-events-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px}
.geo-events-head strong{font-size:11px;color:#dce8f4}
.geo-events-head span{font-size:9px;color:#8195aa}
.geo-event-list{flex:1;min-height:150px;overflow:auto;scrollbar-width:thin;scrollbar-color:#334b62 transparent}
.geo-event{display:flex;align-items:center;gap:6px;width:100%;padding:8px 2px;border-top:1px solid #ffffff0c}
.geo-event-focus{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:3px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer;transition:background .15s}
.geo-event-focus:hover{background:#ffffff08}
.geo-event-mark{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:10px;font-size:11px;font-weight:800}
.geo-event-mark-quake{background:#f3ad5518;color:#f6c17d}
.geo-event-mark-natural{background:#69c8d718;color:#8ee1e8;font-size:16px}
.geo-event-copy{display:grid;gap:3px;min-width:0;flex:1}
.geo-event-copy strong{overflow:hidden;color:#e5eef7;font-size:10px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.geo-event-copy small{overflow:hidden;color:#8da1b5;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
.geo-event-arrow{color:#708aa2;font-size:14px;opacity:0;transition:opacity .15s}
.geo-event-focus:hover .geo-event-arrow{opacity:1}
.geo-save-event{flex:0 0 auto;padding:7px 8px;border:1px solid #7199bd30;border-radius:7px;background:#75b6df0b;color:#a9cbe8;font:inherit;font-size:8px;font-weight:800;cursor:pointer;white-space:nowrap}
.geo-save-event:hover:not(:disabled){border-color:#75b6df70;background:#75b6df18}
.geo-save-event:disabled{opacity:.48;cursor:not-allowed}
.geo-save-note{margin:8px 0 0;color:#8297ac;font-size:9px;line-height:1.5}
.geo-state{display:flex;align-items:center;gap:9px;padding:17px 3px;color:#93a6b9;font-size:11px}
.geo-state-error{align-items:flex-start;color:#f0a6a6}
.geo-state-error button{border:0;background:transparent;color:#9acbfa;font:inherit;text-decoration:underline;cursor:pointer}
.geo-loader{width:13px;height:13px;border:2px solid #60758a;border-top-color:#9bc6e8;border-radius:50%;animation:geo-spin .8s linear infinite}
@keyframes geo-spin{to{transform:rotate(360deg)}}
.geo-feed-updated{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid #ffffff0c;color:#8499ad;font-size:9px}
.geo-feed-status{width:6px;height:6px;box-shadow:none}
.geo-provenance{padding:15px}
.geo-shield{display:grid;place-items:center;width:27px;height:27px;border:1px solid #64d5ae33;border-radius:8px;background:#64d5ae12;color:#7bdbb8;font-size:13px}
.geo-source-link{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px;border:1px solid #ffffff0d;border-radius:10px;background:#ffffff04;color:inherit;text-decoration:none;transition:border-color .15s,background .15s}
.geo-source-link:hover{border-color:#7199bd55;background:#ffffff08}
.geo-source-symbol{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:8px;font-size:11px;font-weight:900}
.geo-source-symbol-amber{background:#f3ad551c;color:#f3bd75}.geo-source-symbol-cyan{background:#69c8d71c;color:#82dce5}
.geo-source-link span:nth-child(2){display:grid;gap:3px;min-width:0;flex:1}
.geo-source-link strong{color:#dce8f4;font-size:10px}
.geo-source-link small{color:#8499ad;font-size:9px}
.geo-source-link>b{color:#8ca5bb;font-size:12px}
.geo-limitations{margin:12px 1px 0;color:#8093a7;font-size:9px;line-height:1.6}
.geo-footer{display:flex;justify-content:space-between;gap:10px;padding:1px 2px;color:#71869b;font-size:8px;font-weight:800;letter-spacing:.12em}
@media(max-width:1050px){.geo-workspace{grid-template-columns:minmax(0,1.3fr) minmax(280px,.9fr)}}
@media(max-width:850px){.geo-workspace{grid-template-columns:1fr}.geo-map-card{min-height:470px}.geo-side{display:grid;grid-template-columns:1fr 1fr;align-items:stretch}.geo-feed-panel{min-height:420px}.geo-provenance{align-self:start}}
@media(max-width:600px){.geo-heading{align-items:flex-start;flex-direction:column}.geo-refresh{min-height:40px}.geo-metrics{grid-template-columns:1fr;gap:8px}.geo-metric{padding:12px 14px}.geo-metric-icon{width:35px;height:35px;flex-basis:35px}.geo-metric strong{font-size:22px}.geo-map-card{min-height:390px}.geo-side{display:flex}.geo-feed-panel{min-height:390px}.geo-map-footnote{display:none}.geo-footer{flex-direction:column;gap:5px}}
@media(prefers-reduced-motion:reduce){.geo-loader{animation:none}.geo-refresh,.geo-event,.geo-source-link{transition:none}}

.geo-catalog-panel{padding:15px;border:1px solid var(--geo-border);border-radius:15px;background:linear-gradient(155deg,rgba(17,31,47,.98),rgba(11,22,35,.98));box-shadow:0 12px 28px rgba(0,0,0,.1)}
.geo-catalog-count{display:grid;place-items:center;min-width:26px;height:26px;padding:0 7px;border:1px solid #75b6df30;border-radius:8px;background:#75b6df10;color:#9bc9ed;font-size:10px;font-weight:800}
.geo-catalog-intro{margin:10px 0;color:#8297ac;font-size:9px;line-height:1.55}
.geo-catalog-item{display:flex;align-items:center;gap:9px;margin-top:7px;padding:9px;border:1px solid #ffffff0c;border-radius:9px;background:#ffffff04;color:inherit;text-decoration:none;transition:border-color .15s,background .15s}
.geo-catalog-item:hover{border-color:#75b6df55;background:#ffffff08}
.geo-catalog-symbol{display:grid;place-items:center;flex:0 0 29px;width:29px;height:29px;border-radius:8px;background:#75b6df17;color:#9bc9ed;font-size:16px}
.geo-catalog-item span:nth-child(2){display:grid;gap:3px;min-width:0;flex:1}
.geo-catalog-item strong{overflow:hidden;color:#dce8f4;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
.geo-catalog-item small{overflow:hidden;color:#8499ad;font-size:8px;text-overflow:ellipsis;white-space:nowrap}
.geo-catalog-item>b{color:#8ca5bb;font-size:12px}
.geo-catalog-state{display:flex;align-items:center;gap:8px;padding:10px 0;color:#93a6b9;font-size:10px}
.geo-catalog-state button{border:0;background:transparent;color:#9acbfa;font:inherit;text-decoration:underline;cursor:pointer}
.geo-catalog-footer a{color:#8fbce0;text-decoration:none}.geo-catalog-footer{display:flex;justify-content:space-between;gap:8px;margin-top:11px;padding-top:9px;border-top:1px solid #ffffff0c;color:#788da2;font-size:8px}
</style>
