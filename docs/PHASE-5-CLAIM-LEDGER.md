# Phase 5 — claim ledger

**Status:** Implemented in the intent-first workspace.

The claim ledger lets a researcher record a specific statement under examination and link it to sources already saved in the same workspace. Each link is labelled as supporting, challenging, or contextual. The analyst can record a rationale and an assessment of unreviewed, supported, conflicting, or insufficient.

The API validates claim shape, assessment values, duplicate identifiers, evidence-link roles, and source ownership. A claim cannot link to an arbitrary URL or to a source from another workspace. Records are stored inside the owner-scoped workspace object.

Assessment labels are human judgements; they are not automated truth verdicts, calibrated probabilities, or certifications. The ledger does not promote claims automatically when source metadata changes.
