# ADVERSE intent understanding

## Purpose

ADVERSE interprets the outcome behind a search request and converts it into a bounded, inspectable research plan. It must preserve the user's wording, identify the subject and relevant constraints, and avoid turning guesses into facts.

## Interpretation layers

1. **Deterministic baseline** — classifies clear request patterns and provides useful behaviour without external AI credentials.
2. **Groq and Gemini** — when configured, both interpret the same request independently and concurrently. They return structured intent, primary subject, entities, constraints, ambiguities, subgoals, source preference and up to three proposed searches.
3. **Arbitration** — clear high-confidence deterministic intent is retained; otherwise matching model interpretations are combined, and disagreements are resolved using the models' bounded confidence estimates. These estimates are not calibrated probabilities.
4. **Multi-goal extraction** — the deterministic baseline and both AI providers retain one primary intent plus up to three secondary intent types. The planner allocates bounded search slots to each distinct objective while preserving the original request.
5. **Research planning** — the search planner expands the original question with bounded intent-specific queries. The autonomous follow-up planner receives the full intent, prior investigation context when supplied, and a short summary of gathered public-source context.
6. **Outcome contracts** — clear tasks resolve into concrete research entities, geography, required evidence tasks and completion criteria. For supported institution/programme fee requests, the planner searches the institution's official domain and the exact programme instead of generic price keywords.
7. **Human inspection** — the workspace shows the expected outcome and its required investigation tasks. Discovery completion is distinct from evidence review and answer synthesis.

## Supported intent families

- Applications and enrolment
- Eligibility and qualification checks
- Fees and costs
- Programme or service availability
- Deadlines and important dates
- Scholarships and funding
- Official destinations and working links
- Claim verification and counterevidence
- Current events and updates
- Historical reconstruction
- Comparisons
- How-to and troubleshooting
- Public entity research
- General research when no narrower intent is supported

## Provider configuration

- Groq: `GROQ_API_KEY`, optional `GROQ_INTENT_MODEL`
- Gemini: `GEMINI_API_KEY`, optional `GEMINI_INTENT_MODEL` (falls back to `GEMINI_MODEL`, then `gemini-2.5-flash`)

Credentials are read server-side. Do not expose them to browser code or logs. Each provider has a bounded request timeout. The intent cache is short-lived and scoped by a one-way hash of the configured credential pair, model names, request and context.

## Failure behaviour

- If one model fails, the other can still provide the interpretation.
- If both fail or neither is configured, deterministic interpretation continues.
- Search planning keeps the original query and never treats a model's interpretation or a search result as verified fact.
- Provider status is exposed in the response metadata so degraded operation is visible.

## Important limits

- This is bounded public-source search, not exhaustive whole-web crawling.
- Official-source preference and domain-targeted queries are retrieval strategies, not proof that a result is official.
- A completed background discovery job means source collection and destination checks have finished; it does not mean the user's objective is answered. Source review, claim assessment and synthesis remain separate stages.
- Institution aliases and programme names are explicit deterministic mappings. They must be expanded cautiously and never treated as evidence that a programme is currently offered.
- AI-generated subgoals, secondary intents and search suggestions are hypotheses, not findings.
- Multi-goal detection is bounded: it can miss implied tasks or over-detect overlapping wording, so the original request remains available to the search planner and user.
- The system should ask for clarification only when an ambiguity materially changes the research task.
- Eligibility, costs, deadlines, accreditation and other consequential claims must be checked against current primary sources.
