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

function fieldEvidence(field, claims, intent) {
  const supported = claims.filter(claim =>
    claim.assessment === 'supported' &&
    Array.isArray(claim.sourceIds) &&
    claim.sourceIds.length > 0
  );
  const entityTargets = (Array.isArray(intent?.entities) ? intent.entities : [])
    .filter(entity => entity && entity.kind === (field === 'institution' ? 'institution' : 'programme'))
    .flatMap(entity => [entity.text, entity.matchedText].filter(Boolean))
    .map(value => String(value).toLocaleLowerCase());

  if (field === 'institution' || field === 'programme') {
    const fallbackType = field === 'institution' ? 'institution' : 'programme';
    return supported.filter(claim => {
      if (!entityTargets.length) return claim.type === fallbackType;
      const statement = String(claim.statement || '').toLocaleLowerCase();
      return entityTargets.some(target => statement.includes(target));
    }).flatMap(claim => claim.sourceIds);
  }
  if (field === 'tuition') {
    return supported.filter(claim => claim.type === 'tuition' && Number.isFinite(Number(claim.value?.amount)))
      .flatMap(claim => claim.sourceIds);
  }
  if (field === 'currency') {
    return supported.filter(claim => Boolean(claim.value?.currency)).flatMap(claim => claim.sourceIds);
  }
  if (field === 'academic session') {
    return supported.filter(claim => Boolean(claim.academicSession)).flatMap(claim => claim.sourceIds);
  }
  if (field === 'primary evidence' || field === 'independent corroboration') {
    // These require source-lineage and source-type assessment not yet established by claim extraction.
    return [];
  }
  const allowedTypes = CLAIM_TYPES[field] || [];
  return supported.filter(claim => allowedTypes.includes(claim.type)).flatMap(claim => claim.sourceIds);
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
    const evidenceIds = fieldEvidence(field, safeClaims, intent);
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
