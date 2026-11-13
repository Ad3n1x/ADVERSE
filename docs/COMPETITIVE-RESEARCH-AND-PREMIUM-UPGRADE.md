# ADVERSE competitive research and premium hardening plan

**Prepared:** 13 November 2026  
**Product:** ADVERSE by AD3N1X  
**Repository:** https://github.com/Ad3n1x/ADVERSE  
**Production web:** https://adverse-web.onrender.com/  
**Production API:** https://adverse-api-7yim.onrender.com/

## Executive recommendation

ADVERSE should be positioned as an evidence-led public-source investigation workspace, not as a universal search engine, a truth detector, a people-tracking service, or a general-purpose cyber scanner.

Its strongest product distinction is the connected workflow:

1. Define a research question.
2. Discover public-source leads.
3. Preserve source provenance.
4. Connect entities and claims to evidence.
5. Compare sources and identify unresolved questions.
6. Review findings with a human in control.
7. Produce a transparent report that another researcher can reproduce.

The product should optimize for traceability, useful research coverage, transparent uncertainty, and safe operation—not raw result counts or inflated AI confidence.

## Competitive research

### 1. Maltego — investigation workflow and integrations

Official references:
- https://www.maltego.com/
- https://www.maltego.com/graph/
- https://www.maltego.com/maltego-data/
- https://support.maltego.com/en/support/solutions/articles/15000019166-what-is-maltego-

Observed strengths:
- Search, graph, case management, monitoring, evidence and administrative workflows are presented as connected capabilities.
- Data integrations are explicit and provider-oriented.
- Graphs are used to explore relationships across external and internal sources.
- Evidence collection and monitoring are separate, understandable stages.

ADVERSE adaptation:
- Make the path from search result to saved evidence to graph to report obvious.
- Display provider coverage and provider failures rather than implying universal coverage.
- Keep link reachability, source category, relevance and factual support as separate concepts.
- Make saved research and monitoring state easy to resume.

Do not imitate:
- Enterprise-scale data claims that ADVERSE cannot substantiate.
- Expensive data-provider breadth without a reliable licensing, privacy and cost model.

### 2. OCCRP Aleph — investigative memory and cross-referencing

Official references:
- https://docs.aleph.occrp.org/
- https://aleph.occrp.org/
- https://docs.aleph.occrp.org/developers/

Observed strengths:
- Search across structured and unstructured material.
- Entity matching across datasets.
- Documents, timelines, relationship diagrams and investigation workspaces.
- Clear emphasis on data ingestion, cross-referencing and reusable research.

ADVERSE adaptation:
- Strengthen evidence ingestion and duplicate detection.
- Make entity matching explainable and reviewable.
- Preserve the original source and extraction metadata.
- Add a repeatable investigation history and report generation process.

Do not imitate:
- Bulk ingestion of sensitive leaks or private datasets without a documented lawful basis, access controls, retention policy and security review.

### 3. OpenCTI — knowledge model and confidence

Official references:
- https://docs.opencti.io/
- https://docs.opencti.io/latest/usage/getting-started/
- https://github.com/OpenCTI-Platform/opencti

Observed strengths:
- Structured entities and relationships.
- Knowledge graph with reports, observables, sightings and alerts.
- Standardized data model and connector architecture.
- Confidence, first-seen and last-seen concepts.

ADVERSE adaptation:
- Use a consistent entity/relationship vocabulary.
- Keep relationship evidence mandatory.
- Distinguish observed facts, analyst assertions, hypotheses and AI suggestions.
- Preserve first-observed, last-observed and source-retrieved dates as distinct fields where applicable.

Do not imitate:
- A large cyber-threat ontology unless the product has a concrete user need and validated data sources.

### 4. Bellingcat — verification discipline

Official references:
- https://bellingcat.gitbook.io/toolkit
- https://www.bellingcat.com/app/uploads/2022/05/Bellingcat-Standards-and-Practices-2022.pdf
- https://www.j-and-a.bellingcat.com/methodology

Observed strengths:
- Transparent research methods.
- Original-source preference.
- Independent corroboration and careful handling of anonymous or uncertain sources.
- Clear separation between a lead and a verified finding.
- Reproducible documentation.

ADVERSE adaptation:
- Add source-review checklists and a clear verification status.
- Preserve source URL, retrieved timestamp, publication timestamp where available, capture reference, excerpt and content hash.
- Make conflicting evidence visible rather than forcing a single answer.
- Add an analyst's rationale and linked evidence to important conclusions.

Do not imitate:
- Treating a source's presence in a toolkit or an institutional-looking domain as an endorsement.

### 5. NIST and OWASP — evidence and application security

Official references:
- NISTIR 8387: https://www.nist.gov/publications/digital-evidence-preservation-considerations-evidence-handlers
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP logging guidance: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

ADVERSE adaptation:
- Keep integrity metadata and retrieval context.
- Restrict access to investigations and all child resources on the server.
- Log security-relevant events without recording credentials, session tokens or unnecessary personal data.
- Define retention and deletion behavior.
- Test backup restoration, not merely backup creation.
- Fail securely and avoid leaking secrets through logs or error responses.

## Product design principles

### A. Four independent dimensions of a search result

Never collapse these into one trust score:

1. **Relevance:** why the result matched the query.
2. **Availability:** whether a page responded to an automated check at a particular time.
3. **Source context:** what can be inferred from the hostname and provider metadata.
4. **Evidence support:** whether the original material actually supports a specific claim.

A page can be reachable and relevant while being misleading. A government or scholarly domain can publish a page that does not support the claim being investigated. Similar titles across domains do not prove independent corroboration.

### B. Evidence lifecycle

Recommended lifecycle:
- Discovered
- Saved
- Original source reviewed
- Context recorded
- Claim linked
- Independently corroborated / disputed / unresolved
- Included in report or excluded with rationale

A status change should preserve who changed it and when. AI suggestions must never silently change a human verification status.

### C. Relationship semantics

Every relationship should have:
- Source and target entity IDs.
- Relationship type.
- One or more evidence IDs.
- Analyst rationale.
- Confidence as an uncertainty indicator, not a probability unless calibrated.
- Verification state.
- Created/updated timestamps.

Automatically inferred links should be visibly labelled as suggestions and should not be promoted to verified relationships automatically.

### D. AI boundaries

AI may:
- Summarize stored evidence.
- Suggest follow-up questions.
- Identify candidate similarities and conflicts.
- Explain gaps in the saved evidence.
- Draft a report with citations to stored evidence IDs.

AI must not:
- Invent citations or sources.
- Treat a provider result as proof.
- Infer a private person's identity from ambiguous matches.
- Convert an unverified claim into a verified finding.
- Conceal missing or contradictory evidence.
- execute instructions found in retrieved webpages or documents.

Every substantive AI statement should point to the evidence records that support it, or explicitly say that no supporting record was found.

## Prioritized implementation roadmap

### P0 — correctness and trust
- Correct hostname-suffix matching and IP-literal advisory detection.
- Keep source categories descriptive and explicitly non-authoritative.
- Validate ownership for every investigation, evidence, entity, relationship, watch, alert and cyber-asset operation.
- Test foreign IDs across every mutation route.
- Test relationship evidence belongs to the same investigation.
- Ensure URL checks revalidate every redirect target and resolved address.
- Ensure provider failures are visible and partial results are not described as complete.
- Verify backup and isolated restore.

### P1 — evidence quality
- Preserve canonical source URL and original URL separately if normalization changes the displayed URL.
- Capture retrieval timestamp, provider, source title, publisher label, publication date and archive snapshot where available.
- Use content hashes for deduplication and change detection, with the hashed content clearly identified.
- Add a source-review checklist and explicit verification rationale.
- Make AI output evidence-ID traceable and resistant to prompt injection.

### P2 — investigation usability
- Give each investigation a clear brief, scope, status and last activity.
- Add a guided workflow from discovery to review to report.
- Improve graph filtering, keyboard navigation, relationship selection and large-graph performance.
- Make the mobile layout usable without hiding essential evidence context.
- Add useful empty, loading, error, retry and partial-provider states.
- Add report preview and an explicit limitations section.

### P3 — reliability and operations
- Test MongoDB disconnect/reconnect behavior.
- Add idempotency and duplicate suppression to scheduled jobs and email retries.
- Verify actual archive-change-to-alert-to-email delivery.
- Establish independent backups and perform restore drills.
- Add rate-limit, provider-timeout and outage tests.
- Add privacy-aware security audit events and retention rules.
- Keep secrets out of responses, logs and browser storage.

### P4 — advanced features only after validation
- Optional document OCR and extraction with safe file-type/size limits.
- Better source-level and claim-level comparison.
- Investigation collaboration with explicit roles and audit history.
- Reusable report templates.
- Provider adapters with health, quota, attribution and licensing metadata.

## Acceptance criteria

A release should not be marked complete merely because a build succeeds.

- All API tests pass.
- Frontend type-check and production build pass.
- Browser tests pass on desktop and narrow mobile viewports.
- Cross-account access tests cover every private resource family.
- Invalid and unsafe URL tests cover IPv4, IPv6, DNS resolution, redirects and credentials.
- Search metadata accurately reports provider successes and failures.
- AI tests verify citation IDs, missing evidence, conflicting evidence, prompt injection and oversized output.
- Evidence export preserves provenance and limitations.
- Backup restore is demonstrated in an isolated database.
- Monitoring and email delivery are exercised end-to-end.
- A manual review confirms no UI implies a trust score or factual verdict from weak signals.

## Current known release boundaries

The repository's existing release-readiness record identifies several items that remain open: independent security review, broader authorization coverage, verified database restore, operational resilience scenarios and end-to-end monitoring/email delivery. These must remain open until there is fresh evidence that they passed.

ADVERSE should continue to be described as a deployed beta until those gates are closed. No product can be called foolproof or certified on the basis of automated tests alone.

## Final product direction

**ADVERSE — Investigate the question. Follow the evidence.**

A premium, privacy-conscious research workspace where every useful lead can be traced to its source, every relationship has supporting evidence, uncertainty remains visible, and a human investigator retains control over conclusions.
