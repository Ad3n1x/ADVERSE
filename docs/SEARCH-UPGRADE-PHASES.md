# ADVERSE search upgrade: phases 2–4

This record tracks the implementation of the search experience and retrieval upgrades. It is an engineering note, not a claim of parity with Google Search.

## Phase 2 — Search experience

- Searches can be represented in the URL as `?q=...` and opened directly.
- Indexed-title and prior-query suggestions appear as the user types, with arrow-key selection and Enter/Escape support.
- The page reads a shared query on load and runs it automatically.
- `/` and `Ctrl/⌘ + K` focus the search field when the user is not typing elsewhere.
- Search links can be copied from the results view.
- Result metadata can explain when a page came from the persistent index.
- Existing source and link-status filters remain in place.

## Phase 3 — Persistent public-source index

- Added a MongoDB document model with a unique canonical URL, hostname, title, excerpt, publisher/provider metadata, published/first-seen/last-seen/last-fetched timestamps, and a content hash.
- Added a weighted MongoDB text index favouring titles and publisher names over excerpts.
- Each successful public search can upsert a bounded set of results and readable previews.
- Later searches can reuse previously indexed pages while still querying live providers.
- Index creation is attempted at API startup; index lookup failures degrade to live search rather than failing the entire request.

## Phase 4 — Retrieval and result explanations

- The persistent index is queried with a bounded set of query variants produced by the existing query planner.
- Duplicate live/indexed URLs are merged before ranking so provider agreement and index metadata are not discarded.
- Freshness receives a bounded boost only when the query explicitly asks for current or recent information; evergreen queries are not freshness-biased.
- Indexed and live results are merged, deduplicated, domain-diversified, and relevance-ranked.
- Result explanations describe why an item was retrieved; link reachability, source categories, title similarity, and provider agreement are not presented as truth scores.
- The API reports whether the index is enabled and how many index matches were retrieved.

## Deliberate limitations and next gates

- This is an incremental index of pages discovered through configured public search providers, not a general-purpose crawler of the whole web.
- Text search and query variants are not embedding-based semantic retrieval. A future semantic layer should be evaluated against a labelled query set before rollout.
- Index freshness and deletion/retention policies need an explicit operational policy before large-scale growth.
- Search relevance should be evaluated using representative queries, reciprocal-rank metrics, duplicate rates, freshness checks, and human-reviewed evidence quality. Current automated tests cover ranking invariants, freshness intent, index fallback, and browser flows; they do not establish Google-scale relevance.
- Confirm API deployment, frontend production build, public-search response contracts, and a live query before declaring this rollout complete.
