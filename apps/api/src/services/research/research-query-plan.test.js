import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchQueryPlan } from './research-query-plan.js';

test('research query plan preserves the complete user request and adds fee-specific sub-questions', () => {
  const queries = buildResearchQueryPlan('abuad price for mechatronics degree', {
    type: 'fees-costs',
    searchQuery: 'abuad mechatronics degree',
    suggestedQueries: [
      { query: 'ABUAD official undergraduate fee schedule for Mechatronics', reason: 'Find primary fee evidence' },
      { query: 'ABUAD mechatronics fees current academic session', reason: 'Confirm session-specific cost' },
    ],
  });
  assert.equal(queries[0], 'abuad price for mechatronics degree');
  assert.ok(queries.some(query => /ABUAD official undergraduate fee schedule/i.test(query)));
  assert.ok(queries.some(query => /ABUAD mechatronics fees current academic session/i.test(query)));
  assert.ok(queries.length <= 3);
});

test('research query plan deduplicates suggestions and caps provider fan-out', () => {
  const queries = buildResearchQueryPlan('apply for ABUAD', {
    suggestedQueries: [
      { query: 'official ABUAD admissions portal', reason: 'official' },
      { query: 'official ABUAD admissions portal', reason: 'duplicate' },
    ],
  });
  assert.equal(queries[0], 'apply for ABUAD');
  assert.equal(queries.filter(query => query.toLowerCase() === 'official abuad admissions portal').length, 1);
  assert.ok(queries.length <= 3);
});
