# ADVERSE Vue 3 + CesiumJS migration

## Decision and boundary

ADVERSE is being migrated in stages from its existing React/TypeScript workspace toward Vue 3. The geospatial foundation is the actual God's Eye View (GEV) Cesium viewer, not a separately recreated globe.

Upstream project: https://github.com/bilawalsidhu/gods-eye-view
Pinned upstream commit: `44d9e573bd8762ece5a6b29ea3d9911a13f76e41`
Upstream license: MIT. Retain required copyright and license notices for reused upstream code; review bundled data and provider terms separately.

The current branch deliberately keeps the existing React shell running while a Vue geospatial feature is introduced as an isolated island. This avoids replacing authentication, research, evidence, admin and PWA behavior before equivalent Vue routes exist. It is an integration milestone, not a completed framework migration.

## Product and safety boundaries

- ADVERSE remains a public-source research and evidence workspace.
- Preserve the existing Express API, MongoDB data model, authentication, authorization, user workspaces, investigations, evidence records and provenance.
- Only integrate public, attributable, non-personal geospatial layers and aggregate environmental/event/infrastructure data.
- Do not port or expose named-person search, face recognition, private camera feeds, individual/device/vehicle tracking, or other features intended to monitor a private person.
- Do not proxy provider credentials to browsers.
- Every displayed dataset must show its source, update time, limitations and an authoritative link where available.
- Geospatial observations are informational and may be delayed or incomplete; they are not a safety-critical navigation or emergency-response service.

## Implemented in this branch

- Added Vue 3, CesiumJS, the Vue Vite plugin, the Cesium Vite plugin and a pinned Git dependency on GEV.
- Uses GEV's exported `gods-eye-view/application/viewer` helper to create the Cesium viewer and inherit its viewer setup/lifecycle behavior.
- Added a Vue single-file geospatial workspace, mounted through a small React compatibility wrapper while the wider application remains React.
- Added a USGS past-24-hour earthquake GeoJSON layer and a NASA EONET open natural-events layer, with selectable markers, separate feed tabs, refresh states, timestamps and source attribution.
- Added a public STAC collection catalogue backed by Element 84 Earth Search, with publisher links, collection identifiers, licence metadata and a retryable loading/error state.
- Redesigned the geospatial workspace with a responsive intelligence layout, source cards, feed metrics, map legend, reduced-motion support and mobile breakpoints.
- Uses OpenStreetMap tiles with visible attribution.
- Added a Geospatial navigation item. The feature is lazy-loaded so the Cesium bundle is not part of the initial workspace route.
- Excludes Cesium's large static asset folders from PWA precaching to avoid making the service worker cache the full globe runtime.
- Updated the quality-gate runtime to Node 24.22.2, which satisfies the pinned GEV package's declared Node engine range.
- Added `docs/OPEN_SOURCE_ECOSYSTEM_RESEARCH.md` with a reviewed shortlist of relevant public repositories, licenses, fit, integration priorities and explicit adoption cautions.

This integration uses the GEV viewer export, not the complete GEV standalone application. GEV's application lifecycle API requires the consumer to supply its own scene, controls, data and tools constructors; ADVERSE does not import the full standalone catalog or its unrelated provider features.

## External repository decisions

- **GeoLibre (MIT):** use as an architectural reference for cloud-native formats and browser-side spatial analysis. Do not transplant its complete React/Tauri application.
- **GeoLens (Apache-2.0):** use as a benchmark for dataset catalogue, source freshness and version history. Preserve ADVERSE's existing Express/MongoDB architecture and evidence model.
- **STAC Browser (ISC):** its STAC discovery model informed the current lightweight catalogue panel. The panel currently reads collection metadata from the allowlisted Earth Search endpoint; a full STAC item-search/map-preview route remains future work.
- **Sigma.js (MIT):** benchmark against the current force graph before considering a graph-renderer replacement.
- **deck.gl (MIT) and Turf.js (MIT):** defer until dense map rendering or concrete spatial-analysis features justify the added runtime/dependency cost.
- **MapLibre GL JS:** shortlist for a future 2D map mode; verify exact license metadata and provider terms before code reuse.

See [Open-source ecosystem research](OPEN_SOURCE_ECOSYSTEM_RESEARCH.md) for the full assessment.

## Verification snapshot

For commit `aaba94f9ce426c4c40aa147711b340746150490b`, GitHub reported successful quality-gate, CI and security workflow runs. CI included browser smoke tests, API syntax/regression tests, live API health/readiness, frontend typecheck and production build. GitHub's Vercel commit status reported deployment completed.

These checks establish that the configured checks and deployment completed for that commit. They do not establish full React-to-Vue route parity or prove every Cesium runtime interaction in the deployed preview. The subsequent documentation-only commit triggers a fresh CI/deployment cycle.

## Remaining migration work

1. Perform a real browser check against the Vercel preview: authenticate, open Geospatial, verify globe rendering, Cesium workers, OpenStreetMap tiles, USGS feed, event selection, attribution, mobile layout, console and network errors.
2. Port the remaining workspace UI and routes to Vue 3: authentication, settings, investigations, search, evidence vault, entities/relationships, graph, monitoring, admin and download flows.
3. Define and test the Vue-side API client and route guards against the existing Express API. Preserve existing API contracts and owner/tenant isolation.
4. Add a public STAC/OGC catalogue only after a server-side allowlist and source/provenance contract are designed.
5. Verify mobile interaction, accessibility, Cesium asset paths, CSP, service-worker behavior, memory use and performance.
6. Run type checks, frontend production build, API regression tests and browser smoke tests after each route migration.
7. Keep the React implementation available as rollback until the Vue route set has parity.
8. Do not merge or deploy the migration automatically. Production cutover requires successful CI and a production-like preview check.

## Runtime

GEV currently declares Node `>=24.14.0 <25 || >=26 <27`. The quality-gate workflow uses Node 24.22.2. The Render API service is separate under `apps/api` and remains on its own runtime; this frontend dependency does not require changing the API service's runtime.

## Status

The GEV/Cesium foundation was merged into `main` through PR #19 (merge commit `4fab90ed9fad3ce0d1e185ebb10a9aee03ff61d1`). The geospatial workspace now combines the GEV viewer, USGS earthquakes, NASA EONET public natural events, an Element 84 Earth Search STAC collection catalogue, and a redesigned responsive interface. GitHub checks passed for the merged foundation. The later data-layer and UI commits are undergoing fresh CI checks. A fresh Vercel deployment and real-browser verification are still required; a prior Vercel deployment attempt was blocked by the daily deployment rate limit. The wider workspace remains a staged React/Vue hybrid, not a completed React-to-Vue conversion.
