# ADVERSE — Product Vision

**Product direction:** An intent-to-action assistant grounded in public information and traceable evidence.

## The problem

People often know what they want to accomplish but do not know which official pages, requirements, documents, decisions or next steps will get them there. Traditional keyword search returns pages; it does not reliably organize the whole objective into a path the user can follow.

## Core promise

ADVERSE should understand the user's complete objective, discover and assess the information needed, and guide the user through the work until the objective is resolved or the remaining blockers are clear.

The product is not merely a research workspace, a universal web index, a truth detector, or a general-purpose chatbot.

## Required end-to-end workflow

For a request such as:

> I want to apply for Mechatronics at ABUAD; find the fees and explain how to apply.

ADVERSE must:

1. Interpret the complete request into a primary goal, subgoals, entities, constraints, required information and desired outcome. Preserve the original wording and context.
2. Identify the official institution, programme, application, fee and policy destinations. Prefer primary sources, verify redirects/reachability, and retain source provenance.
3. Assemble a concise, cited procedure with requirements, fees, deadlines, required documents and uncertainties clearly separated into confirmed, conflicting, unavailable and unknown.
4. Link to and open the exact relevant destination for the current step. A generic search-results page is not a substitute when a specific official application page is known.
5. Maintain a persistent task checklist and progress state. A completed search is not the same as a completed user objective.
6. Explain what the user should do next, what information is needed, what to expect and which details still need confirmation.
7. Re-evaluate the plan when the user reports progress, changes constraints or encounters a dead link. Search for alternatives and explain why the route changed.
8. Keep consequential external actions—submitting forms, paying fees, creating accounts, sending messages or committing the user to terms—under the user's explicit control and confirmation.

## Product principles

- **Intent before keywords:** interpret the objective and constraints before selecting search work.
- **Original request preserved:** model interpretations may enrich the plan but may not erase or silently rewrite the user's goal.
- **Primary-source preference:** prefer official and primary sources for consequential requirements; source preference is not proof of authenticity.
- **Evidence before conclusions:** every substantive factual step must link to supporting source records or clearly state that support is missing.
- **Uncertainty stays visible:** distinguish confirmed facts, conflicting claims, unverified leads and unknowns.
- **Progress is objective-based:** discovery, evidence review, answer synthesis and user completion are separate states.
- **Human control:** guide and prepare actions; never silently submit, pay, message, register or make commitments.
- **Bounded coverage:** disclose provider failures, quotas and coverage gaps. Do not claim exhaustive internet search.
- **Privacy and authorization:** private investigations remain owner-scoped. Monitoring is limited to assets the user owns or is explicitly authorized to monitor.

## Existing capabilities versus the complete vision

The current `main` implementation already contains deterministic intent classification, Groq/Gemini intent interpretation when configured, multi-goal extraction, bounded search planning, outcome-intelligence helpers, public-source discovery, destination checks, provenance records, evidence/claim workflows and report exports.

That is a substantial foundation, but it must not be described as complete intent-to-action fulfilment. The complete product still requires a verified, end-to-end guided procedure, durable user task progress, reliable step-specific destination opening, progress-driven replanning and clear completion criteria across supported objective families.

The advanced workflow work in the existing `fix/full-intent-focused-research` branch is a candidate implementation, not a merged or production-verified release. It is substantially ahead of and behind-diverged from `main`, and its pull request has conflicts/release checks to reconcile. Do not merge it wholesale without rebasing, reviewing the full diff, resolving CodeQL findings and rerunning the complete release suite.

## Acceptance criteria

A supported objective is not complete merely because search results were returned. For each supported objective family, acceptance requires:

- A test proving the full request, entities, constraints and multiple subgoals are retained.
- A reproducible research plan with bounded queries and explicit provider status.
- Relevant primary-source candidates with provenance and destination-check evidence.
- A generated procedure whose steps cite the saved evidence records.
- Explicit confirmed/unknown/conflicting states for material claims.
- Persistent task progress that survives refresh and can be resumed.
- A next-step decision that changes correctly when the user reports progress or a blocker.
- An exact destination link for the current step where one exists.
- No consequential external action without user confirmation.
- Browser tests for success, ambiguity, missing sources, provider failure, dead destinations and resumed work.

## Non-goals

- Claiming to search every page on the internet.
- Assigning a single credibility score to domains or search results.
- Treating reachability, an AI interpretation or a source match as proof.
- Automatically submitting applications, making payments, sending messages or creating accounts.
- Monitoring private systems or assets without explicit authorization.

## Change-control rule

This document records the product owner's explicit intent-to-action clarification in the ADVERSE pull-request discussion on 21 November 2026. It supersedes any narrower description that presents ADVERSE as only a source-discovery or evidence-organization workspace. Implementation status must still be reported separately from this target vision.
