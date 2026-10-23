import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInvestigativeRoutes, investigativeRoutesForRound } from './investigative-routes.js';

test('the plan begins with primary records and active counterevidence', () => {
  const routes = buildInvestigativeRoutes('Investigate a public policy decision');
  assert.deepEqual(investigativeRoutesForRound(routes, 1).map(route => route.id), [
    'primary-records', 'counterevidence',
  ]);
  assert.match(routes.find(route => route.id === 'counterevidence').purpose, /alternative explanations/i);
});

test('the plan seeks independent sourcing and timeline evidence in round two', () => {
  const routes = buildInvestigativeRoutes('Review the public policy decision');
  assert.deepEqual(investigativeRoutesForRound(routes, 2).map(route => route.id), [
    'independent-corroboration', 'chronology-archives',
  ]);
});

test('financial investigations get a public-record money trail, without private-life searches', () => {
  const routes = buildInvestigativeRoutes('Investigate a public contract and audit');
  const money = routes.find(route => route.id === 'follow-the-money');
  assert.ok(money);
  assert.match(money.query, /procurement award contract amount/i);
  assert.match(money.reporterStep, /shared name/i);
  assert.doesNotMatch(money.query, /home address|personal phone|private account/i);
  assert.ok(investigativeRoutesForRound(routes, 3).some(route => route.id === 'follow-the-money'));
});

test('media questions add a provenance route instead of asserting image identity', () => {
  const routes = buildInvestigativeRoutes('Verify this viral video');
  const media = routes.find(route => route.id === 'media-provenance');
  assert.ok(media);
  assert.match(media.check, /not proof of identity/i);
  assert.ok(investigativeRoutesForRound(routes, 3).some(route => route.id === 'media-provenance'));
});

test('public-institution questions expose a manual disclosure route but never claim to file requests', () => {
  const routes = buildInvestigativeRoutes('Investigate a ministry policy decision');
  const access = routes.find(route => route.id === 'public-records-access');
  assert.ok(access);
  assert.match(access.reporterStep, /does not file it automatically/i);
});

test('routes are bounded, distinct, and empty questions return no plan', () => {
  assert.deepEqual(buildInvestigativeRoutes(' '), []);
  const routes = buildInvestigativeRoutes('A'.repeat(500));
  assert.ok(routes.length >= 6);
  assert.ok(routes.every(route => route.query.length <= 230 && route.label.length > 0));
  assert.equal(new Set(routes.map(route => route.id)).size, routes.length);
  assert.deepEqual(investigativeRoutesForRound(routes, 5), []);
});
