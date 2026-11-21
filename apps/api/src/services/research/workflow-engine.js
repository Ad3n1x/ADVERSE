import { WorkflowSchema } from './research-contracts.js';

function providerPolicy(intent) {
  if (intent?.sourcePreference === 'official') return 'official-first';
  if (intent?.sourcePreference === 'primary-and-independent') return 'primary-and-independent';
  if (intent?.sourcePreference === 'documentation') return 'documentation-first';
  return 'balanced';
}

export function buildResearchWorkflow(intent = {}, workflowId = 'research-workflow', now = new Date()) {
  const type = String(intent.type || 'general-research');
  const template = type === 'verification' ? 'verify' : type === 'comparison' ? 'decide' : 'investigate';
  const policy = providerPolicy(intent);
  const steps = [];

  if (Array.isArray(intent.entities) && intent.entities.length) {
    steps.push({
      id: 'resolve-entities',
      type: 'resolve-entity',
      objective: 'Resolve the named institution, programme, people and geographic scope.',
      required: true,
      providerPolicy: policy,
      requiredFields: ['primary entities'],
      status: 'pending',
      evidenceIds: [],
      completedAt: null
    });
  }

  steps.push({
    id: 'discover-sources',
    type: 'discover-source',
    objective: 'Find sources that match the resolved subject and the user’s intended task.',
    required: true,
    providerPolicy: policy,
    requiredFields: ['relevant sources'],
    status: 'pending',
    evidenceIds: [],
    completedAt: null
  });
  steps.push({
    id: 'check-source-access',
    type: 'verify-source',
    objective: 'Check public source reachability and record access limitations; this is not factual verification.',
    required: true,
    providerPolicy: policy,
    requiredFields: ['source access observations'],
    status: 'pending',
    evidenceIds: [],
    completedAt: null
  });
  steps.push({
    id: 'extract-evidence',
    type: 'extract-evidence',
    objective: 'Extract traceable claim candidates from the saved source material.',
    required: true,
    providerPolicy: policy,
    requiredFields: ['source-linked claims'],
    status: 'pending',
    evidenceIds: [],
    completedAt: null
  });

  if (template === 'decide' || template === 'verify' || type === 'fees-costs') {
    steps.push({
      id: 'compare-evidence',
      type: 'compare-evidence',
      objective: template === 'verify'
        ? 'Compare supporting evidence, independent reporting and counterevidence.'
        : 'Compare the relevant options, figures, dates and material differences.',
      required: true,
      providerPolicy: template === 'verify' ? 'primary-and-independent' : policy,
      requiredFields: ['comparison or corroboration'],
      status: 'pending',
      evidenceIds: [],
      completedAt: null
    });
  }

  steps.push({
    id: 'prepare-outcome',
    type: 'prepare-outcome',
    objective: 'Report what is supported, missing, conflicting or not found without inventing an answer.',
    required: true,
    providerPolicy: policy,
    requiredFields: ['answer status'],
    status: 'pending',
    evidenceIds: [],
    completedAt: null
  });

  const timestamp = now.toISOString();
  return WorkflowSchema.parse({
    workflowId,
    template,
    intentId: workflowId + ':intent',
    status: 'pending',
    steps,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

/** Mark only operations that actually ran and met their declared completion conditions. */
export function finalizeResearchWorkflow(workflowInput, outcome = {}, now = new Date()) {
  const workflow = WorkflowSchema.parse(workflowInput);
  const completedAt = now.toISOString();
  const entityCount = Array.isArray(outcome.entities) ? outcome.entities.length : 0;
  const sourceCount = Number(outcome.sourceCount || 0);
  const checkedCount = Number(outcome.checkedCount || 0);
  const claimCount = Number(outcome.claimCount || 0);
  const comparisonCount = Number(outcome.comparisonCount || 0);
  const answerStatus = String(outcome.answerStatus?.status || 'insufficient_evidence');
  const evidenceIds = (Array.isArray(outcome.evidenceIds) ? outcome.evidenceIds : [])
    .filter(value => typeof value === 'string' && value.length > 0).slice(0, 100);

  const steps = workflow.steps.map(step => {
    let status = step.status;
    if (step.type === 'resolve-entity') status = entityCount ? 'completed' : 'skipped';
    if (step.type === 'discover-source') status = sourceCount ? 'completed' : 'failed';
    if (step.type === 'verify-source') status = checkedCount ? 'completed' : 'blocked';
    if (step.type === 'extract-evidence') status = claimCount ? 'completed' : 'blocked';
    if (step.type === 'compare-evidence') status = comparisonCount ? 'completed' : 'blocked';
    if (step.type === 'prepare-outcome') status = answerStatus === 'needs_clarification' ? 'blocked' : 'completed';
    return {
      ...step,
      status,
      evidenceIds: step.type === 'discover-source' || step.type === 'verify-source' || step.type === 'extract-evidence'
        ? evidenceIds
        : step.evidenceIds,
      completedAt: ['completed', 'skipped'].includes(status) ? completedAt : null
    };
  });

  const required = steps.filter(step => step.required);
  const completed = required.filter(step => ['completed', 'skipped'].includes(step.status)).length;
  const failed = required.some(step => step.status === 'failed');
  const status = failed ? 'failed' : completed === required.length ? 'completed' : 'partially_completed';

  return WorkflowSchema.parse({
    ...workflow,
    steps,
    status,
    updatedAt: completedAt
  });
}
