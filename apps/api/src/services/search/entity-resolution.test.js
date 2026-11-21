import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntentEntities } from './entity-resolution.js';

test('resolves ABUAD and Mechatronics to canonical Nigerian entities without AI', () => {
  const result = resolveIntentEntities('abuad price for mechatronics degree');

  assert.deepEqual(result.entities.slice(0, 2), [
    {
      text: 'Afe Babalola University',
      matchedText: 'ABUAD',
      kind: 'institution',
      role: 'primary-subject',
      country: 'Nigeria'
    },
    {
      text: 'Mechatronics Engineering',
      matchedText: 'Mechatronics',
      kind: 'programme',
      role: 'requested-programme'
    }
  ]);
  assert.deepEqual(result.preferences, { country: 'Nigeria', currency: 'NGN' });
});

test('recognizes common Nigerian university aliases and preserves their original spelling', () => {
  const result = resolveIntentEntities('I want to apply to UNILAG');
  assert.equal(result.entities[0].text, 'University of Lagos');
  assert.equal(result.entities[0].matchedText, 'UNILAG');
  assert.equal(result.preferences.currency, 'NGN');
});

test('does not invent a location or entity for an unrelated generic request', () => {
  const result = resolveIntentEntities('Explain how a database index works');
  assert.deepEqual(result.entities, []);
  assert.deepEqual(result.preferences, {});
});
