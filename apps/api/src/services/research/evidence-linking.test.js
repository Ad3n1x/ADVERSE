import assert from 'node:assert/strict';
import test from 'node:test';
import { linkEvidenceAutomatically } from './evidence-linking.js';

test('automatically links a source to mentioned entities and existing relationships without upgrading verification', async () => {
  const entities = [
    { id: 'person-1', investigationId: 'case-1', name: 'Alice Morgan', evidenceIds: [] },
    { id: 'org-1', investigationId: 'case-1', name: 'Acme Research', evidenceIds: [] },
    { id: 'unrelated', investigationId: 'case-1', name: 'Northstar Labs', evidenceIds: [] },
  ];
  const evidence = [{
    id: 'source-1', investigationId: 'case-1',
    title: 'Alice Morgan joined Acme Research',
    excerpt: 'The article names Alice Morgan and Acme Research in the same report.',
    entities: [],
  }];
  const relationships = [{
    id: 'rel-1', investigationId: 'case-1', fromEntityId: 'person-1',
    toEntityId: 'org-1', type: 'associated', evidenceIds: [],
    verificationStatus: 'unverified', confidence: 'low',
  }];
  const collections = { entities, evidence, relationships };
  const listFor = async (_model, collection, investigationId) =>
    collections[collection].filter(item => item.investigationId === investigationId);

  const result = await linkEvidenceAutomatically({
    investigationId: 'case-1',
    savedSources: evidence,
    Evidence: {}, Entity: {}, Relationship: {},
    listFor,
    isDb: () => false,
    memory: { entities: new Map(), evidence: new Map(), relationships: new Map() },
    logger: { warn() {} },
  });

  assert.equal(result.evidenceEntityLinksAdded, 2);
  assert.equal(result.relationshipEvidenceLinksAdded, 1);
  assert.deepEqual(new Set(evidence[0].entities), new Set(['person-1', 'org-1']));
  assert.deepEqual(entities[0].evidenceIds, ['source-1']);
  assert.deepEqual(entities[1].evidenceIds, ['source-1']);
  assert.deepEqual(entities[2].evidenceIds, []);
  assert.deepEqual(relationships[0].evidenceIds, ['source-1']);
  assert.equal(relationships[0].verificationStatus, 'unverified');
  assert.equal(relationships[0].confidence, 'low');
});

test('does not attach a source to a relationship unless both endpoints are mentioned', async () => {
  const entities = [
    { id: 'a', investigationId: 'case-1', name: 'Alice Morgan', evidenceIds: [] },
    { id: 'b', investigationId: 'case-1', name: 'Acme Research', evidenceIds: [] },
  ];
  const evidence = [{ id: 'source-2', investigationId: 'case-1', title: 'Alice Morgan profile', excerpt: '', entities: [] }];
  const relationships = [{ id: 'rel-2', investigationId: 'case-1', fromEntityId: 'a', toEntityId: 'b', evidenceIds: [] }];
  const collections = { entities, evidence, relationships };
  const listFor = async (_model, collection, investigationId) =>
    collections[collection].filter(item => item.investigationId === investigationId);

  const result = await linkEvidenceAutomatically({
    investigationId: 'case-1', savedSources: evidence,
    Evidence: {}, Entity: {}, Relationship: {}, listFor,
    isDb: () => false,
    logger: { warn() {} },
  });

  assert.equal(result.evidenceEntityLinksAdded, 1);
  assert.equal(result.relationshipEvidenceLinksAdded, 0);
  assert.deepEqual(relationships[0].evidenceIds, []);
});
