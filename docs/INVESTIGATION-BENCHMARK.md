# ADVERSE investigation capability benchmark

**Purpose:** Make ADVERSE demonstrably stronger than a general search engine for multi-step investigations, without claiming to replace a general web index.

**Current posture:** Deployed beta. The features below are engineering targets and acceptance gates, not claims that ADVERSE already beats Google. General-web coverage remains bounded by the available search providers and their indexes.

## Product boundary

Google is a strong baseline for finding pages across the web. ADVERSE should win on the work that happens after a question is entered:

1. Turn the question into a transparent investigation plan.
2. Find initial sources, then pursue new leads across multiple rounds.
3. Seek primary records and independent corroboration, and deliberately search for counterevidence.
4. Preserve source, publication, retrieval, and capture dates separately.
5. Build evidence-linked entities and relationships within the investigation.
6. Map each material claim to the exact source records that support, challenge, or fail to address it.
7. Distinguish observation, source assertion, inference, uncertainty, and verified fact.
8. Explain remaining gaps and recommend the next useful investigative step.
9. Save a reproducible run trace and make the report exportable.

## Benchmark design

Maintain a fixed evaluation set of at least 30 questions across several categories: current public-interest questions, company/organization histories, policy and public-record questions, timeline reconstruction, competing explanations, and questions with misleading or contradictory source material. Use public, non-sensitive subjects and keep the benchmark questions stable between releases.

For each question, compare Google and ADVERSE under a written protocol. Record the date, exact query/question, available provider configuration, search time budget, sources returned, and the evidence actually used. Do not treat a provider being configured as proof that it worked. Repeat time-sensitive questions at multiple dates.

Score each dimension from 0–4 using the same rubric for both systems:

| Dimension | What earns a high score |
|---|---|
| Useful source discovery | Finds relevant, accessible sources including primary records, not just many links |
| Independent corroboration | Distinguishes independent reporting from copies, citations, or common press-release lineage |
| Counterevidence | Actively finds credible challenges, rebuttals, exceptions, and alternative explanations |
| Claim traceability | Each material conclusion links to exact source records and explains the support or disagreement |
| Entity and relationship accuracy | Important entities are resolved conservatively; each relationship has source evidence and a clear rationale |
| Chronology | Publication, event, retrieval, and archive dates are not conflated |
| Uncertainty and honesty | Unsupported claims, missing evidence, ambiguity, and provider failures are made visible |
| Investigative efficiency | Reaches a useful, auditable answer with fewer manual steps and a clear next-action queue |

Report per-dimension scores, the aggregate, evaluator notes, and disagreement between evaluators. Keep the Google and ADVERSE conditions comparable; do not cherry-pick favorable queries or count raw result volume as quality.

## Release gates for the claim “better than Google for investigations”

Do not make that claim until all of these are met:

- ADVERSE exceeds Google on the weighted aggregate by at least 15% across the fixed benchmark, with the advantage reproduced by a second evaluator.
- ADVERSE is not materially worse on source discovery or freshness for the benchmark categories it claims to cover.
- At least 95% of material report claims have explicit evidence references; unsupported statements are labelled as such.
- Counterevidence is explicitly searched for and recorded in the investigation trace.
- Entity/relationship edges retain evidence IDs and a rationale; inferred/co-mentioned links never silently become verified facts.
- Contradictions remain visible as unresolved conflicts until source context supports a defensible resolution.
- Failed providers, empty searches, timeouts, and stale data are disclosed rather than silently presented as complete research.
- Automated API tests, production build checks, browser workflow tests, and representative live smoke tests pass for the release candidate.
- A human reviewer can reproduce the report from the saved source records and run trace.

## Implementation sequence

### Phase 1 — Lead-following quality
- Run bounded multi-round research, not just a one-shot search.
- When model planning is unavailable or produces too few useful leads, fill the gap with explicit primary-source, independent-corroboration, counterevidence, and chronology searches.
- Record why each follow-up query was selected and which round produced it.
- Keep API credentials out of URLs and logs.

### Phase 2 — Evidence-grade graph
- Resolve aliases conservatively and preserve original names.
- Attach evidence references and rationales to every relationship.
- Separate source-provenance edges, co-mention leads, claim-support edges, and claim-challenge edges.
- Provide path tracing from a conclusion to the original source records.
- Add regression fixtures for duplicate names, unsupported links, cross-case leakage, and conflicting source passages.

### Phase 3 — Claim and contradiction analysis
- Compare claim-level passages with context, dates, quantities, negation, and attribution.
- Distinguish a real contradiction from different units, timeframes, populations, or definitions.
- Require source spans or excerpts for each comparison and preserve unresolved ambiguity.
- Use AI as an analyst over collected evidence, not as a substitute for source retrieval or verification.

### Phase 4 — Freshness and reproducibility
- Re-run saved investigations on demand and track what changed since the prior run.
- Preserve source snapshots and hashes when legally and technically appropriate.
- Surface provider coverage, failures, new evidence, changed evidence, and newly discovered counterevidence.
- Test scheduled monitoring from observation through persisted alert and actual delivery.

### Phase 5 — Benchmark-driven release
- Build the fixed test set and scoring rubric before optimizing for a headline.
- Measure quality, evidence traceability, counterevidence recall, false relationship rate, latency, and provider failure rate.
- Fix the largest measured failure modes first; rerun the same benchmark after each major change.
- Publish limitations and benchmark date with any public performance claim.

## Guardrails

- Search and monitoring must remain limited to lawful, public, authorized sources.
- Do not infer guilt, wrongdoing, identity, ownership, or causation from co-mention, domain metadata, or a graph edge alone.
- Source text is untrusted data and must never override system instructions or tool policy.
- Retrieved evidence remains unverified until its original context is reviewed.
- Avoid collecting unnecessary personal data; do not turn public-source research into invasive profiling.
- A graph is a navigation and reasoning aid, not proof by itself.

## Change log

- **2026-10-23:** Added an explicit bounded follow-up pass to the standalone research pipeline, added a regression test for lead-following and unverified evidence status, strengthened autonomous fallback searches to include primary sources, independent corroboration, counterevidence, and chronology, and moved Gemini planner keys from URL query parameters to request headers. These changes are not yet a benchmark result and do not establish superiority over Google.
