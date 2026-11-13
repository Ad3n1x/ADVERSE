import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSourceContext, inspectPublicLink, titleSimilarity } from './source-assessment.js';

test('institutional classification matches a real suffix boundary', () => {
  assert.equal(assessSourceContext('https://records.gov.uk/page').category, 'institutional-domain');
  assert.equal(assessSourceContext('https://records.gov.ng/page').category, 'institutional-domain');
  assert.equal(assessSourceContext('https://gov.uk.attacker.example/page').category, 'publisher-or-website');
});

test('scholarly and reference categories are descriptive, not trust verdicts', () => {
  const scholarly = assessSourceContext('https://api.crossref.org/works');
  assert.equal(scholarly.category, 'scholarly-or-international');
  assert.equal(scholarly.classificationBasis, 'hostname-suffix-heuristic');
  assert.ok(scholarly.limitations.some(item => item.includes('does not prove')));
  assert.equal(assessSourceContext('https://en.wikipedia.org/wiki/Research').category, 'reference-work');
});

test('invalid URLs return a stable unknown-source structure', () => {
  const result = assessSourceContext('not a url');
  assert.equal(result.category, 'unknown');
  assert.ok(Array.isArray(result.signals));
  assert.ok(Array.isArray(result.limitations));
});

test('IPv4 and IPv6 literals are detected as link advisories', () => {
  assert.ok(inspectPublicLink('https://192.0.2.10/path').signals.some(item => item.includes('IP address')));
  assert.ok(inspectPublicLink('https://[2001:db8::1]/').signals.some(item => item.includes('IP address')));
  assert.equal(inspectPublicLink('https://example.org/').signals.some(item => item.includes('IP address')), false);
});

test('shortened links and embedded credentials receive explicit advisories', () => {
  assert.ok(inspectPublicLink('https://bit.ly/example').signals.some(item => item.includes('link-shortening')));
  assert.ok(inspectPublicLink('https://user:pass@example.org/').signals.some(item => item.includes('embedded credentials')));
});

test('title similarity remains bounded and handles empty input', () => {
  assert.equal(titleSimilarity('', 'A title'), 0);
  assert.ok(titleSimilarity('Public research report', 'Public research report') === 1);
  assert.ok(titleSimilarity('Alpha beta', 'Gamma delta') >= 0 && titleSimilarity('Alpha beta', 'Gamma delta') <= 1);
});
