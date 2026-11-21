import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicPlan } from './experience.routes.js';

test('intent planner creates a focused comparison workspace', () => {
  const plan = deterministicPlan('Compare solar and wind power for a small home under $5000');
  assert.equal(plan.kind, 'compare');
  assert.match(plan.focus, /solar and wind power/i);
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.spaces.length, 3);
  assert.ok(plan.constraints.some(value => /under \$5000/i.test(value)));
});

test('intent planner flags consequential external actions for approval', () => {
  const plan = deterministicPlan('Book a service appointment for next week');
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.kind, 'explore');
  assert.ok(plan.steps.length >= 2);
});

test('intent planner does not flag ordinary research as an external action', () => {
  const plan = deterministicPlan('Research public transport options in Lagos');
  assert.equal(plan.kind, 'research');
  assert.equal(plan.approvalRequired, false);
  assert.match(plan.focus, /public transport options in Lagos/i);
});


test('application intent keeps its named institution as the focus, not a constraint', () => {
  const plan = deterministicPlan('I want to apply for ABUAD');
  assert.equal(plan.kind, 'plan');
  assert.equal(plan.focus, 'ABUAD');
  assert.equal(plan.subject, 'ABUAD');
  assert.equal(plan.searchQuery, 'ABUAD');
  assert.equal(plan.semanticType, 'application');
  assert.ok(!plan.constraints.some(value => /for ABUAD/i.test(value)));
  assert.match(plan.outcome, /official admissions route/i);
  assert.ok(plan.steps.some(value => /application|admission|requirements|deadline/i.test(value)));
  assert.deepEqual(plan.spaces, ['Official admissions route', 'Entry requirements & deadlines', 'Application next steps']);
});

test('application intent preserves a multi-word institution name', () => {
  const plan = deterministicPlan('I would like to apply to University of Lagos');
  assert.equal(plan.focus, 'University of Lagos');
  assert.equal(plan.searchQuery, 'University of Lagos');
});

test('ordinary constraints remain constraints without swallowing the subject', () => {
  const plan = deterministicPlan('Compare solar and wind power under $5000');
  assert.match(plan.focus, /solar and wind power/i);
  assert.ok(plan.constraints.some(value => /under \$5000/i.test(value)));
});
