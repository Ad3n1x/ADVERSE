import { AnswerStatusSchema } from './research-contracts.js';

const REQUIRED_FIELDS = {
  'fees-costs': ['institution', 'programme', 'tuition', 'currency', 'academic session'],
  application: ['institution', 'application route'],
  eligibility: ['institution', 'eligibility requirements'],
  'programme-availability': ['institution', 'programme'],
  deadline: ['deadline'],
  'scholarship-funding': ['scholarship details'],
  destination: ['official destination'],
  verification: ['primary evidence', 'independent corroboration']
};

const CLAIM_TYPES = {
  institution: ['institution'],
  programme: ['programme'],
  tuition: ['tuition'],
  currency: ['tuition'],
  'academic session': ['academic-session'],
  'application route': ['application-route'],
  'eligibility requirements': ['eligibility', 'requirement'],
  deadline: ['deadline', 'date'],
  'scholarship details': ['scholarship'],
  'official destination': ['application-route', 'general-fact'],
  'primary evidence': ['general-fact'],
  'independent corroboration': ['general-fact']
};

function fieldEvidence(field, claims) {
  const allowedTypes = CLAIM_TYPES[field] || [];
  return claims.filter(claim => {
    if (!allowedTypes.includes(claim.type) || !Array.isArray(claim.sourceIds) || !claim.sourceIds.length) return false;
    if (claim.assessment !== 'supported') return false;
    if (field === 'tuition') return Number.isFinite(Number(claim.value?.amount));
    if (field === 'currency') return Boolean(claim.value?.currency);
    if (field === 'academic session') return Boolean(claim.academicSession);
    return true;
  }).flatMap(claim => claim.sourceIds).filter((value, index, all) => all.indexOf(value) === index).slice(0, 20);
}

/**
 * Evaluates completion from supported, source-linked typed claims.
 * Provider success counts and AI-generated prose never satisfy required fields.
 */
export function evaluateAnswerStatus({
  intent = {},
  claims = [],
  sourceCount = 0,
  searchCompleted = false,
  requiredFields
} = {}) {
  const fields = requiredFields || REQUIRED_FIELDS[intent.type] || [];
  const safeClaims = Array.isArray(claims) ? claims : [];
  const required = fields.map(field => {
    const evidenceIds = fieldEvidence(field, safeClaims);
    return { field, required: true, satisfied: evidenceIds.length > 0, evidenceIds };
  });
  const requiredCount = required.length;
  const satisfiedCount = required.filter(item => item.satisfied).length;
  const completionRatio = requiredCount ? satisfiedCount / requiredCount : 0;
  const conflictCount = safeClaims.filter(claim => claim.assessment === 'conflicting').length;
  const unresolvedQuestions = required.filter(item => !item.satisfied).map(item => item.field);

  let status;
  let explanation;
  if (intent.clarificationNeeded) {
    status = 'needs_clarification';
    explanation = 'A missing detail materially changes the research target.';
  } else if (conflictCount > 0) {
    status = 'conflicting';
    explanation = 'At least one extracted claim has conflicting evidence and needs review.';
  } else if (requiredCount > 0 && satisfiedCount === requiredCount) {
    status = 'answered';
    explanation = 'Every required answer field has supporting, source-linked evidence.';
  } else if (satisfiedCount > 0) {
    status = 'partially_answered';
    explanation = 'Some required fields have supporting evidence, but important questions remain unresolved.';
  } else if (searchCompleted && sourceCount === 0) {
    status = 'not_found';
    explanation = 'The completed search returned no usable sources for the requested goal.';
  } else {
    status = 'insufficient_evidence';
    explanation = 'Available material does not yet support the required answer fields.';
  }

  return AnswerStatusSchema.parse({
    status,
    requiredFields: required,
    completionRatio,
    unresolvedQuestions,
    conflictCount,
    explanation,
    evaluatedAt: new Date().toISOString()
  });
}
