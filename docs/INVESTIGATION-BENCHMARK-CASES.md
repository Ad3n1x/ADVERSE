# ADVERSE vs. Google: fixed investigation benchmark

**Status:** Evaluation fixture, not a completed result. Run the same prompts against Google Search/AI Mode and ADVERSE within the same date window, then have a second reviewer score the saved evidence.

## Run protocol

- Run each case in a clean session with no prior notes or hidden context.
- Give both products the same question and a comparable time budget (10 minutes per case for the first pass; record actual time).
- Record date/time, locale, product/mode, exact prompt, providers configured for ADVERSE, queries executed, links opened, evidence saved, and final output.
- Do not mark a source as independent just because its domain differs. Follow citation chains and shared press releases when possible.
- Score only what is actually linked or present in the output. Missing evidence is not a pass. A generated claim without an inspectable source earns no traceability credit.
- For current facts, repeat the case at least 7 days later and check whether the answer reports what changed.
- Use two reviewers for at least 10 randomly selected cases. Record disagreements rather than averaging them away.

## Fixed case set

### Primary records and institutional accountability

1. **Public decision trail:** For a recent major city transport project, identify the approving authority, original decision document, approval date, stated cost, and any later revisions. Distinguish the original estimate from updated estimates.
2. **Public spending:** Investigate a publicly announced government technology contract. Find the procurement notice or award record, the contracting authority, amount, award date, and any official audit or review. Separate allegation from established finding.
3. **Regulatory change:** Trace a recent public regulation from proposal to final rule. Find the primary text, consultation period, final effective date, and at least one documented response from an affected group.
4. **Court record:** Summarize a completed public court case using primary court documents where available. Separate allegations, arguments, procedural rulings, and final disposition.
5. **Public statistics:** Find the original statistical release behind a widely repeated unemployment, inflation, or population figure. Record the measure, period, geography, release date, and methodology caveat.
6. **Environmental claim:** Investigate a public claim about pollution or environmental impact. Find the original measurement or regulator report, methodology, location, timeframe, and credible counterevidence.

### Organization and corporate history

7. **Ownership trail:** Trace the public ownership history of a large company through official filings and acquisition announcements. Separate legal ownership, brand ownership, and operational partnerships.
8. **Product timeline:** Reconstruct the launch, major version changes, and end-of-support dates for a widely used technology product. Prefer dated release notes and official announcements.
9. **Company claim audit:** Compare a company’s public performance claim with its underlying filing or published methodology and independent reporting. Identify which numbers are comparable and which are not.
10. **Merger chronology:** Reconstruct a public merger from announcement through regulatory approval and completion. Do not treat the announcement date as the completion date.
11. **Public incident review:** Investigate a publicly disclosed service outage. Separate the initial statement, later technical postmortem, customer impact, and unresolved questions.
12. **Supply-chain claim:** Investigate a public claim about where a product is manufactured or sourced. Distinguish official disclosures, supplier statements, and independent reporting.

### Timelines and lead-following

13. **Conflicting dates:** A public event has two reported dates. Find the earliest primary record, later corrections, and whether the sources refer to different milestones.
14. **Quote origin:** Trace a widely circulated public quotation to its earliest accessible recording, transcript, or document. Flag versions whose wording or context differs.
15. **Policy outcome:** Investigate a claim that a policy caused a measurable outcome. Build a timeline and distinguish correlation, official explanation, independent evaluation, and alternative causes.
16. **Incident chronology:** Reconstruct a publicly reported infrastructure incident using time-stamped official updates, technical records, and independent reporting. Mark gaps in the timeline.
17. **Correction history:** Find a public news or institutional statement that was corrected later. Compare original wording, correction date, corrected facts, and what remains uncertain.
18. **Multi-hop lead:** Begin with a public announcement, identify the named program or contractor, follow the trail to its primary documents, then find an independent review or rebuttal.

### Counterevidence and competing explanations

19. **Claim vs. denial:** Investigate a disputed public statement. Locate both the original claim and the strongest accessible response; do not decide the dispute from repetition alone.
20. **Different figures:** Two sources report different amounts for the same project. Determine whether the figures describe different dates, currencies, scope, approved budgets, or actual spending before calling it a contradiction.
21. **Competing causes:** For a public economic or infrastructure outcome, identify at least two plausible explanations and the evidence each explanation relies on.
22. **Viral statistic:** Audit a widely shared statistic. Find its original source, sample or denominator, date range, and at least one credible methodological critique.
23. **Copied reporting:** Choose a story repeated across several websites. Trace whether those articles independently investigated it or reused one press release, wire story, or original report.
24. **Missing context:** Investigate a short quote or image caption presented as proof of a public claim. Find the full source context and determine what the excerpt does and does not establish.

### Entity and relationship accuracy

25. **Same-name entities:** Investigate two organizations or products with similar names. Determine whether sources clearly distinguish them and avoid merging records based only on name similarity.
26. **Relationship evidence:** Verify a public relationship claim between two organizations (ownership, contract, partnership, or litigation). Require evidence that directly supports the specific relationship and its date.
27. **Graph path audit:** Start with a public claim and follow three relationship edges. For every edge, identify its evidence record and state whether it is direct evidence, source provenance, co-mention, or inference.
28. **Alias resolution:** Trace an organization with a former name, abbreviation, and rebrand. Preserve the names and dates instead of treating every mention as a separate organization or assuming all aliases are equivalent.
29. **Source independence:** Compare three reports about the same event. Inspect links, citations, authorship, and statements to identify what is genuinely independent and what shares a source lineage.
30. **Evidence gap audit:** Investigate a well-documented public issue and list what cannot yet be established from available public evidence. Explain which missing primary record or test would most reduce uncertainty.

## Score sheet (0–4 per dimension)

For each case, score these eight dimensions separately:

1. **Useful source discovery:** 0 = irrelevant/no usable sources; 4 = relevant primary and independent sources with clear provenance.
2. **Primary-source handling:** 0 = none or misrepresented; 4 = original records found and interpreted in context.
3. **Independent corroboration:** 0 = repetitions treated as independent; 4 = citation lineage and independence explicitly assessed.
4. **Counterevidence:** 0 = only confirms initial premise; 4 = credible challenges and alternatives actively pursued.
5. **Claim traceability:** 0 = unsupported narrative; 4 = material claims linked to exact saved evidence with reasons.
6. **Entity/relationship accuracy:** 0 = unsupported merges/edges; 4 = cautious resolution and evidence attached to each relationship.
7. **Chronology and freshness:** 0 = dates conflated or stale facts presented as current; 4 = event/publication/retrieval dates separated and changes noted.
8. **Uncertainty and honesty:** 0 = speculation presented as fact; 4 = ambiguity, failed searches, missing evidence, and limitations explicit.

Maximum: 32 points per case, 960 across 30 cases. Report the per-case table, per-dimension averages, median, completion time, and reviewer disagreement. Do not convert scores into a superiority claim unless the release gates in `INVESTIGATION-BENCHMARK.md` are satisfied.

## Evidence log template

For every run, capture:

- Case ID and prompt
- Product/mode and date/time
- Search queries and lead rounds
- Providers used and any errors
- Source URLs, publisher/host, publication date, retrieval date, and source type
- Claims and the evidence records cited for each
- Counterevidence found and still missing
- Relationship edges and the evidence for each edge
- Scores by dimension, reviewer notes, elapsed time, and unresolved disagreement
