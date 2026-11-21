import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchWorkflow, finalizeResearchWorkflow } from './workflow-engine.js';

test('fees research uses official-first investigation with an explicit comparison step', () => {
  const workflow = buildResearchWorkflow({
    type: 'fees-costs',
    preferences: { sourcePreference: 'official' },
    entities: [{ text: 'Afe Babalola University', kind: 'institution' }]
  }, 'job-1');

  assert.equal(workflow.template, 'investigate');
  assert.ok(workflow.steps.some(step => step.type === 'compare-evidence'));
  assert.ok(workflow.steps.every(step => step.providerPolicy === 'official-first'));
});

test('verification uses a primary-and-independent evidence workflow', () => {
  const workflow = buildResearchWorkflow({
    type: 'verification',
    preferences: { sourcePreference: 'primary-and-independent' }
  }, 'job-2');

  assert.equal(workflow.template, 'verify');
  assert.ok(workflow.steps.some(step => step.type === 'compare-evidence'));
  assert.ok(workflow.steps.find(step => step.type === 'compare-evidence').objective.includes('counterevidence'));
});

test('workflow does not claim completion when required evidence or comparison is missing', () => {
  const workflow = buildResearchWorkflow({
    type: 'fees-costs',
    entities: [{ text: 'Afe Babalola University', kind: 'institution' }]
  }, 'job-3');
  const final = finalizeResearchWorkflow(workflow, {
    entities: [{ kind: 'institution', text: 'Afe Babalola University' }],
    sourceCount: 2,
    checkedCount: 2,
    claimCount: 1,
    comparisonCount: 0,
    answerStatus: { status: 'insufficient_evidence' },
    evidenceIds: ['https://example.edu/fees']
  });

  assert.equal(final.status, 'partially_completed');
  assert.equal(final.steps.find(step => step.type === 'discover-source').status, 'completed');
  assert.equal(final.steps.find(step => step.type === 'compare-evidence').status, 'blocked');
});
