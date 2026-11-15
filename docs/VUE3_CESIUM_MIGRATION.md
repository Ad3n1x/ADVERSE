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
- Added a USGS past-24-hour earthquake GeoJSON layer with selectable event markers, a recent-events list, refresh, timestamp and source attribution.
- Uses OpenStreetMap tiles with visible attribution.
- Added a Geospatial navigation item. The feature is lazy-loaded so the Cesium bundle is not part of the initial workspace route.
- Excludes Cesium's large static asset folders from PWA precaching to avoid making the service worker cache the full globe runtime.
- Updated the quality-gate runtime to Node 24.22.2, which satisfies the pinned GEV package's declared Node engine range.

This integration uses the GEV viewer export, not the complete GEV standalone application. GEV's application lifecycle API requires the consumer to supply its own scene, controls, data and tools constructors; ADVERSE does not import the full standalone catalog or its unrelated provider features.

## Remaining migration work

1. Port the remaining workspace UI and routes to Vue 3: authentication, settings, investigations, search, evidence vault, entities/relationships, graph, monitoring, admin and download flows.
2. Define and test the Vue-side API client and route guards against the existing Express API. Preserve the existing API contracts and owner/tenant isolation.
3. Expand the geospatial layer adapter only for public, attributable, non-personal datasets after source and provider-term review.
4. Verify mobile interaction, accessibility, Cesium asset paths, CSP, service-worker behavior, memory use and performance.
5. Run type checks, frontend production build, API regression tests and browser smoke tests.
6. Keep the React implementation available as rollback until the Vue route set has parity.
7. Do not merge or deploy the migration automatically. Production cutover requires successful CI and a production-like preview check.

## Runtime

GEV currently declares Node `>=24.14.0 <25 || >=26 <27`. The quality-gate workflow uses Node 24.22.2. The Render API service is separate under `apps/api` and remains on its own runtime; this frontend dependency does not require changing the API service's runtime.

## Status

The first real GEV/Cesium feature slice is now committed to this migration branch. The branch is still a staged hybrid, not a completed React-to-Vue conversion. Production remains unchanged pending CI, preview verification and completion of the remaining routes.

The earlier React Globe.gl prototype in PR #18 is not the final geospatial engine and should not be merged as the replacement for this implementation.
