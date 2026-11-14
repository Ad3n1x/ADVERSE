# ADVERSE geospatial intelligence integration

## Decision

Integrate the geospatial interaction pattern, not a wholesale copy of God's Eye View.
ADVERSE remains React + TypeScript + Vite, Express, and MongoDB. The initial contract
is provider-neutral GeoJSON so a CesiumJS globe can be added without coupling the
research model to one map renderer.

## First implementation boundary

- A normalized event must have a stable ID, title, category, valid WGS84 coordinates,
  observation time, and a public source URL.
- Coordinates are always `[longitude, latitude]` (GeoJSON order).
- Every visible event carries source attribution and an explicit confidence state.
- Map records may link to existing ADVERSE evidence IDs; they do not replace evidence.
- Unknown, malformed, or unprovenanced records are rejected by the normalizer.
- Keep public-interest datasets separate from user-submitted material.

## Planned application integration

1. Add a Geospatial Intelligence workspace tab.
2. Load the globe lazily so the existing IntelliDesk remains lightweight.
3. Render GeoJSON through CesiumJS/Resium with attribution and source links visible.
4. Selecting a map event opens its evidence/source context; selecting an evidence item
   can focus the corresponding map feature when coordinates exist.
5. Add server-side provider adapters with caching, rate limits, timeouts, source
   attribution, and provider-specific license checks.
6. Use MongoDB 2dsphere indexes for the first spatial queries. Introduce PostGIS only
   if real query volume or spatial-analysis requirements justify another datastore.

## Data-source and safety rules

- Start with public, aggregate, non-sensitive feeds such as USGS earthquake events and
  official weather/environment alerts.
- Do not ingest private camera feeds, personal device locations, or data intended to
  identify or track private individuals.
- Do not expose operational targeting, evasion, or real-time tracking features.
- Preserve provider terms, attribution, refresh limits, and commercial-use restrictions.
  A public URL does not mean its data is unrestricted.
- Never treat a map marker as proof. Link it to its original source and show the
  provider timestamp, retrieval timestamp, and verification status separately.

## God's Eye View attribution and licensing

The referenced God's Eye View repository publishes its source under MIT, but its
license explicitly excludes third-party datasets and runtime provider data. ADVERSE
should implement compatible ideas independently and must not copy bundled datasets
or assets without checking their individual terms. If source code is ever reused,
retain the required MIT copyright and permission notice and review all third-party
dependencies and data terms first.

## Current scope

This branch establishes the shared TypeScript contract and validation/GeoJSON
conversion layer. It does not yet include a Cesium renderer, provider ingestion,
database migration, or production deployment. Those are separate implementation
steps requiring dependency installation and build/integration tests.
