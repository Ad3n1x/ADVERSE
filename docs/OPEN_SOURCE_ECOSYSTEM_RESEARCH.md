# ADVERSE open-source ecosystem review

Review date: 2026-11-15

This review identifies reusable libraries and architectural references for ADVERSE. It does not authorize copying an entire application, changing the production backend, or adding dependencies without a measured need.

## ADVERSE's integration rules

- Keep ADVERSE's Express/MongoDB API, authentication, owner-scoped investigations, evidence records, and existing user data.
- Use public, attributable, non-personal datasets only in geospatial features.
- Keep original source URLs, retrieval timestamps, publication timestamps, content hashes, provenance, and human review status.
- Prefer small libraries and standards over adopting another full product.
- Review each dependency's exact release, transitive dependencies, license, maintenance, security posture, and bundle/runtime cost before adding it.
- Do not treat visual proximity, a graph edge, a model output, or a dataset match as proof of a claim.

## Repository findings

| Repository | License reported by GitHub | Fit for ADVERSE | Recommendation |
|---|---|---|---|
| [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) | MIT | Existing Cesium-based 3D globe foundation. The migration branch pins upstream commit `44d9e573bd8762ece5a6b29ea3d9911a13f76e41`. | Keep as the 3D globe foundation. Reuse only the viewer and explicitly reviewed public-data components. |
| [GeoLibre](https://github.com/opengeos/GeoLibre) | MIT | Strong reference for cloud-native geospatial formats, browser-side spatial analysis, DuckDB-WASM Spatial, MapLibre, deck.gl, and optional Cesium rendering. Its complete application is a large React/Tauri product. | Study its architecture and formats. Do not transplant the full application or its 1,000+ tool runtime into ADVERSE. Evaluate individual libraries only when a real use case and performance budget exist. |
| [GeoLens](https://github.com/geolens-io/geolens) | Apache-2.0 | Closely matches the missing geospatial catalogue problem: dataset source records, freshness checks, version history, STAC/OGC APIs, map previews, and source health. It uses FastAPI/PostGIS/React and is a separate full application. | Use as a product/architecture benchmark. Adapt the concepts to ADVERSE's existing evidence/provenance model; do not replace the Express/MongoDB backend with GeoLens. Review any copied code and NOTICE obligations separately. |
| [STAC Browser](https://github.com/radiantearth/stac-browser) | ISC | Vue-based browser for static STAC catalogues and STAC APIs. Its discovery model informed ADVERSE's current public STAC collection panel. | Keep the current lightweight catalogue integration for now. Consider a dedicated STAC Browser route only if item-level discovery becomes a core workflow; retain the allowlisted source and provenance rules. |
| [Sigma.js](https://github.com/jacomyal/sigma.js) | MIT | WebGL graph renderer designed for thousands of nodes and edges. ADVERSE currently uses `react-force-graph-2d`. | Benchmark against the current graph using representative investigation sizes before replacing anything. Preserve ADVERSE's evidence-linked node/edge semantics and accessible detail panels. |
| [Graphology](https://github.com/graphology/graphology) | Verify package/repository license before adoption | Graph data structure and algorithms that pair with Sigma.js. | Consider together with Sigma only if profiling shows the current graph model/layout is a bottleneck. |
| [deck.gl](https://github.com/visgl/deck.gl) | MIT | GPU-powered rendering for large public geospatial datasets, aggregation and heatmap-style layers. | Candidate for dense 2D layers after the Cesium baseline is stable. Avoid adding it just to render the current small earthquake feed. |
| [Turf.js](https://github.com/Turfjs/turf) | MIT | Modular geospatial operations in JavaScript/TypeScript, such as bounding boxes, distances, intersections and point-in-polygon. | Good small-scope candidate when ADVERSE introduces a specific spatial filter or measurement feature. Import only required modules where practical. |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | GitHub API did not assert an SPDX license during this review | Vector-tile 2D mapping and a possible lightweight map alternative to the 3D globe. | Keep on the shortlist for a 2D mode, but verify the exact repository license and attribution/provider terms before code reuse. |
| [Protomaps / PMTiles](https://github.com/protomaps/PMTiles) | Verify exact repository license before adoption | Self-contained, cloud-hosted vector tile archives can reduce dependence on a hosted tile server. | Evaluate only if ADVERSE needs predictable offline-ish/public basemap hosting and has a suitable hosting budget. |

## Priority order

1. **Finish and validate the existing GEV/Cesium slice.** Confirm the Vercel preview actually loads the globe, Cesium workers, OpenStreetMap tiles, and the USGS feed in a real browser. CI success alone is not a visual runtime test.
2. **Add a public geospatial dataset catalogue.** Use a small allowlisted set of public STAC/OGC catalogues. Each layer needs publisher, canonical source URL, licence/attribution, last checked/updated timestamp, spatial and temporal coverage where provided, and limitations.
3. **Connect spatial records to existing evidence.** Reuse the existing Evidence model and its source/provenance fields. Add a typed geospatial metadata extension only after the API contract and migration strategy are designed; do not create a parallel unowned dataset store.
4. **Profile the relationship graph.** Compare current force-graph rendering with Sigma.js on synthetic graphs at 100, 500, 1,000 and 5,000 nodes. Measure initial render, interaction latency, memory, and mobile behavior. Switch only if it is a clear improvement.
5. **Add spatial analysis selectively.** Turf.js is a reasonable first small dependency for a specific feature. deck.gl and DuckDB-WASM Spatial should wait until dataset size and analysis requirements justify their additional bundle/runtime cost.
6. **Continue the React-to-Vue migration route by route.** Port authentication, settings, investigations, search, evidence, graph, monitoring and admin with parity tests. Keep the current React application as rollback until every required route has passed.

## Licensing and provenance notes

- A repository's top-level license does not automatically cover bundled third-party data, imagery, tiles, fonts, models, or provider APIs.
- Keep upstream copyright and license notices when adapting code.
- Record dataset publisher, exact source URL, retrieval time, source-reported update time, licence/terms link, and transformation history.
- OpenStreetMap tile use must follow the tile provider's current usage policy; visible attribution alone does not grant unlimited tile usage.
- Never present a source's presence in a catalogue as a validation of the source's claims.

## Verification snapshot

The GEV/Cesium foundation was merged into `main` as `4fab90ed9fad3ce0d1e185ebb10a9aee03ff61d1`. The current geospatial workspace additionally includes USGS earthquakes, NASA EONET natural events, an Element 84 Earth Search STAC collection catalogue and a responsive UI. The foundation commit passed GitHub CI, quality and security checks. Subsequent UI/data-source commits are undergoing fresh checks. A fresh Vercel deployment and browser verification remain necessary; the earlier Vercel preview was rate-limited.
