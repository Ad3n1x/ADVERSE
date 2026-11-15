<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as Cesium from 'cesium';
import { createApplicationViewer } from 'gods-eye-view/application/viewer';
import 'cesium/Build/Cesium/Widgets/widgets.css';

type Quake = {
  id: string;
  place: string;
  magnitude: number | null;
  occurredAt: number | null;
  longitude: number;
  latitude: number;
  depthKm: number | null;
  url: string;
};

const mapHost = ref<HTMLDivElement | null>(null);
const creditHost = ref<HTMLDivElement | null>(null);
const events = ref<Quake[]>([]);
const loading = ref(true);
const error = ref('');
const updatedAt = ref('');
const eventCount = ref(0);
let viewer: Cesium.Viewer | null = null;
let quakeLayer: Cesium.GeoJsonDataSource | null = null;
let disposed = false;

const feedUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

function formatTime(value: number | null) {
  if (!value) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function refreshEvents() {
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch(feedUrl, { headers: { Accept: 'application/geo+json' } });
    if (!response.ok) throw new Error(`USGS feed returned HTTP ${response.status}`);
    const payload = await response.json();
    if (disposed || !viewer) return;

    const features = Array.isArray(payload.features) ? payload.features : [];
    const nextEvents: Quake[] = features.map((feature: any) => {
      const coordinates = feature.geometry?.coordinates ?? [];
      return {
        id: String(feature.id ?? ''),
        place: String(feature.properties?.place ?? 'Location not supplied'),
        magnitude: Number.isFinite(feature.properties?.mag) ? feature.properties.mag : null,
        occurredAt: Number.isFinite(feature.properties?.time) ? feature.properties.time : null,
        longitude: Number(coordinates[0]),
        latitude: Number(coordinates[1]),
        depthKm: Number.isFinite(coordinates[2]) ? Number(coordinates[2]) : null,
        url: String(feature.properties?.url ?? 'https://earthquake.usgs.gov/earthquakes/'),
      };
    }).filter((event: Quake) => Number.isFinite(event.longitude) && Number.isFinite(event.latitude));

    if (quakeLayer) await viewer.dataSources.remove(quakeLayer, true);
    quakeLayer = await Cesium.GeoJsonDataSource.load(payload, {
      clampToGround: false,
      markerColor: Cesium.Color.fromCssColorString('#f59e0b'),
      markerSize: 9,
      markerSymbol: 'circle',
    });
    if (disposed) {
      quakeLayer = null;
      return;
    }
    await viewer.dataSources.add(quakeLayer);
    events.value = nextEvents.slice(0, 8);
    eventCount.value = nextEvents.length;
    updatedAt.value = new Date(Number(payload.metadata?.generated) || Date.now()).toLocaleString();
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : 'Unable to load the public earthquake feed.';
  } finally {
    if (!disposed) loading.value = false;
  }
}

function focusEvent(event: Quake) {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(event.longitude, event.latitude, 900000),
    duration: 1.2,
  });
}

onMounted(async () => {
  try {
    if (!mapHost.value || !creditHost.value) throw new Error('The globe container is unavailable.');
    viewer = createApplicationViewer({
      container: mapHost.value,
      creditContainer: creditHost.value,
      showRenderLoopErrors: false,
    });
    viewer.scene.globe.show = true;
    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: new Cesium.Credit('© OpenStreetMap contributors', true),
      maximumLevel: 19,
    }));
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 12, 23000000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });
    await refreshEvents();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The 3D globe could not be started.';
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  disposed = true;
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = null;
  quakeLayer = null;
});
</script>

<template>
  <section class="geo-shell" aria-label="Geospatial intelligence workspace">
    <header class="geo-heading">
      <div>
        <p class="geo-kicker">ADVERSE / PUBLIC GEOSPATIAL DATA</p>
        <h2>Geospatial Intelligence</h2>
        <p class="geo-subtitle">Explore attributed public event data on the God's Eye View 3D globe.</p>
      </div>
      <button class="geo-refresh" type="button" :disabled="loading" @click="refreshEvents">
        {{ loading ? 'Updating…' : 'Refresh feed' }}
      </button>
    </header>

    <div class="geo-grid">
      <div class="geo-map-card">
        <div ref="mapHost" class="geo-map" role="img" aria-label="Interactive 3D globe showing public earthquake feed markers"></div>
        <div ref="creditHost" class="geo-credits"></div>
        <div class="geo-map-label">GLOBAL VIEW <span>·</span> 3D GLOBE</div>
      </div>

      <aside class="geo-side">
        <div class="geo-stat">
          <span>EVENTS IN FEED</span>
          <strong>{{ eventCount.toLocaleString() }}</strong>
          <small>USGS · Past 24 hours</small>
        </div>
        <div class="geo-events">
          <div class="geo-events-title">
            <h3>Recent events</h3>
            <span>{{ events.length }} shown</span>
          </div>
          <p v-if="loading && !events.length" class="geo-muted">Loading public event data…</p>
          <p v-else-if="error" class="geo-error">{{ error }}</p>
          <p v-else-if="!events.length" class="geo-muted">No events are currently available.</p>
          <button v-for="event in events" :key="event.id" class="geo-event" type="button" @click="focusEvent(event)">
            <span class="geo-magnitude">{{ event.magnitude === null ? '—' : event.magnitude.toFixed(1) }}</span>
            <span class="geo-event-copy">
              <strong>{{ event.place }}</strong>
              <small>{{ formatTime(event.occurredAt) }}</small>
              <small>{{ event.latitude.toFixed(2) }}, {{ event.longitude.toFixed(2) }}<template v-if="event.depthKm !== null"> · {{ event.depthKm.toFixed(1) }} km deep</template></small>
            </span>
          </button>
        </div>
        <div class="geo-provenance">
          <strong>Source & limitations</strong>
          <a href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson" target="_blank" rel="noreferrer">United States Geological Survey (USGS) ↗</a>
          <small>Feed timestamp: {{ updatedAt || 'Waiting for source' }}</small>
          <small>Public observations can be revised, delayed or incomplete. This view is informational, not an emergency or navigation service.</small>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.geo-shell{display:grid;gap:18px;color:var(--text,#e8eef5)}
.geo-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.geo-kicker{margin:0 0 7px;color:#7ea8d2;font-size:10px;font-weight:800;letter-spacing:.16em}
.geo-heading h2{margin:0;font-size:clamp(22px,3vw,30px);letter-spacing:-.04em}
.geo-subtitle{margin:7px 0 0;color:var(--muted,#91a0b3);font-size:13px}
.geo-refresh{border:1px solid var(--border,#334155);border-radius:10px;background:#172536;color:#e8eef5;padding:10px 14px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.geo-refresh:disabled{opacity:.55;cursor:wait}
.geo-grid{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(260px,.8fr);gap:14px;min-height:540px}
.geo-map-card{position:relative;overflow:hidden;min-height:540px;border:1px solid var(--border,#263548);border-radius:16px;background:#07111c}
.geo-map{position:absolute;inset:0}
.geo-credits{position:absolute;right:8px;bottom:5px;z-index:2;font-size:10px;color:#d7e2ef}
.geo-map-label{position:absolute;left:14px;top:14px;padding:8px 11px;border:1px solid #ffffff24;border-radius:8px;background:#07111cce;color:#e8eef5;font-size:10px;font-weight:800;letter-spacing:.12em;pointer-events:none}
.geo-map-label span{color:#f59e0b;padding:0 4px}
.geo-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.geo-stat,.geo-events,.geo-provenance{border:1px solid var(--border,#263548);border-radius:14px;background:var(--panel,#101b29);padding:15px}
.geo-stat span,.geo-stat small,.geo-provenance small{display:block;color:var(--muted,#91a0b3);font-size:11px}
.geo-stat strong{display:block;margin:5px 0;font-size:30px;letter-spacing:-.04em}
.geo-events{flex:1;min-height:200px}
.geo-events-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.geo-events-title h3{margin:0;font-size:14px}
.geo-events-title span{color:var(--muted,#91a0b3);font-size:10px}
.geo-event{display:flex;width:100%;gap:10px;text-align:left;padding:10px 0;border:0;border-top:1px solid var(--border,#263548);background:transparent;color:inherit;cursor:pointer}
.geo-event:hover{background:#ffffff08}
.geo-magnitude{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:10px;background:#f59e0b1c;color:#fbbf24;font-size:12px;font-weight:800}
.geo-event-copy{display:grid;gap:3px;min-width:0}
.geo-event-copy strong{font-size:11px;line-height:1.4}
.geo-event-copy small{color:var(--muted,#91a0b3);font-size:10px}
.geo-provenance{display:grid;gap:7px}
.geo-provenance strong{font-size:12px}
.geo-provenance a{color:#8fc5ff;font-size:11px;text-decoration:none}
.geo-muted,.geo-error{font-size:12px;color:var(--muted,#91a0b3)}
.geo-error{color:#fca5a5}
@media(max-width:900px){.geo-grid{grid-template-columns:1fr}.geo-map-card{min-height:420px}.geo-side{display:grid;grid-template-columns:1fr 1fr}.geo-stat{grid-column:1/-1}.geo-provenance{grid-column:1/-1}}
@media(max-width:560px){.geo-heading{flex-direction:column}.geo-grid{min-height:0}.geo-map-card{min-height:350px}.geo-side{display:flex}.geo-event{padding:12px 0}}
</style>
