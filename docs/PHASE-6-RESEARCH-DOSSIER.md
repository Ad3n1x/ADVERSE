# Phase 6 — research dossier export

**Status:** Implemented in the intent-first workspace.

Researchers can export a workspace as JSON or Markdown. The dossier includes the research intent, saved source metadata, original URLs, dates, link-check observations, source review state, analyst notes, claims, evidence-link roles, and explicit limitations.

The JSON export includes a SHA-256 digest over the serialized payload before the integrity manifest is attached. This helps detect accidental modification of a saved export. It is not a digital signature, trusted timestamp, immutable storage guarantee, or proof that the sources are authentic.

Exports are created in the browser from the current workspace state. The user must review the downloaded dossier before relying on or sharing it.
