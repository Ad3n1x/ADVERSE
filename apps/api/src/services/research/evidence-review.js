export const EVIDENCE_REVIEW_CHECKS = Object.freeze([
  'originalSourceOpened',
  'authorChecked',
  'publicationDateChecked',
  'supportingMaterialChecked',
  'contextChecked',
]);

/**
 * Build a human-authored evidence review update. A supported/conflicting status
 * requires every review check and a written rationale; this is workflow
 * discipline, not an automated assessment of truth.
 */
export function buildEvidenceReview(input, reviewerId, now = new Date()) {
  const status = input?.verificationStatus;
  if (!['unverified', 'supported', 'conflicting', 'insufficient'].includes(status)) {
    return { ok: false, error: 'Choose a valid evidence review status.' };
  }
  const checklist = Object.fromEntries(EVIDENCE_REVIEW_CHECKS.map(key => [key, input?.reviewChecklist?.[key] === true]));
  const rationale = String(input?.reviewRationale || '').trim().slice(0, 1000);
  if (status === 'supported' || status === 'conflicting') {
    if (EVIDENCE_REVIEW_CHECKS.some(key => !checklist[key])) {
      return { ok: false, error: 'Complete every source-review check before marking evidence supported or conflicting.' };
    }
    if (rationale.length < 10) {
      return { ok: false, error: 'Add a review rationale of at least 10 characters before recording this status.' };
    }
  }
  if (status === 'insufficient' && rationale.length < 10) {
    return { ok: false, error: 'Explain why the available material is insufficient (at least 10 characters).' };
  }
  return {
    ok: true,
    value: {
      verificationStatus: status,
      reviewChecklist: checklist,
      reviewRationale: rationale,
      reviewedAt: now,
      reviewedBy: String(reviewerId || '').slice(0, 100),
    },
  };
}

/** Keep a bounded, append-only record of human review transitions. */
export function createEvidenceReviewHistoryEntry(previous, next, reviewerId, now = new Date()) {
  return {
    previousStatus: String(previous?.verificationStatus || 'unverified'),
    verificationStatus: String(next?.verificationStatus || 'unverified'),
    reviewRationale: String(next?.reviewRationale || '').slice(0, 1000),
    reviewChecklist: { ...(next?.reviewChecklist || {}) },
    changedAt: now,
    changedBy: String(reviewerId || '').slice(0, 100),
  };
}
