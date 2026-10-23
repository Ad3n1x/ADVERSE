import assert from 'node:assert/strict';
import test from 'node:test';
import { runResearchPipeline } from './research-pipeline.js';

function makeHarness({ results = [], existingEvidence = [], scrape = async () => ({ title: 'Page title', excerpt: 'Useful excerpt', retrievedAt: new Date().toISOString() }) } = {}) {
  const stores = { evidence: [...existingEvidence], entities: [], relationships: [] };
  let nextId = 0;
  const id = () => 'record-' + (++nextId);
  const model = { Evidence: {}, Entity: {}, Relationship: {} };
  const listFor = async (_model, collection, investigationId) =>
    stores[collection].filter(item => item.investigationId === investigationId);
  const saveRecord = async (_model, collection, record) => {
    const saved = { ...record, id: record.id || id() };
    stores[collection].push(saved);
    return saved;
  };
  const validatePublicUrl = value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Unsafe URL');
    }
    return url;
  };
  const searchAllPublic = async query => ({ results: results.map(item => ({ ...item, matchedQuery: query })) });
  return {
    stores,
    dependencies: {
      investigationId: 'case-1',
      queries: ['example research'],
      Evidence: model.Evidence,
      Entity: model.Entity,
      Relationship: model.Relationship,
      id,
      listFor,
      saveRecord,
      scrapePublicPage: scrape,
      searchAllPublic,
      validatePublicUrl,
      logger: { warn() {}, error() {} },
    },
  };
}

test('research pipeline saves evidence and builds source-provenance graph links', async () => {
  const harness = makeHarness({
    results: [{ title: 'Example report', url: 'https://www.example.com/report', publisher: 'Example Press', provider: 'Test index', excerpt: 'Snippet' }],
  });

  const result = await runResearchPipeline(harness.dependencies);

  assert.equal(result.savedCount, 1);
  assert.equal(result.graphEntitiesAdded, 2);
  assert.equal(result.graphRelationshipsAdded, 1);
  assert.equal(result.results[0].verificationStatus, 'unverified');
  assert.equal(harness.stores.evidence.length, 1);
  assert.equal(harness.stores.entities.length, 2);
  assert.equal(harness.stores.relationships[0].type, 'publishes');
  assert.equal(harness.stores.relationships[0].confidence, 'low');
  assert.match(harness.stores.relationships[0].rationale, /does not validate/i);
});

test('research pipeline deduplicates provider URLs and skips already-saved evidence', async () => {
  const url = 'https://example.com/report';
  const harness = makeHarness({
    results: [
      { title: 'Report', url, publisher: 'Example', provider: 'Index A' },
      { title: 'Duplicate result', url: 'https://EXAMPLE.com/report', publisher: 'Example', provider: 'Index B' },
    ],
    existingEvidence: [{ id: 'existing', investigationId: 'case-1', url }],
  });

  const result = await runResearchPipeline(harness.dependencies);

  assert.equal(result.discoveredCount, 1);
  assert.equal(result.alreadyStoredCount, 1);
  assert.equal(result.savedCount, 0);
  assert.equal(harness.stores.entities.length, 0);
});

test('research pipeline reports unavailable providers without attempting persistence', async () => {
  const harness = makeHarness();
  harness.dependencies.searchAllPublic = async () => { throw new Error('provider offline'); };

  const result = await runResearchPipeline(harness.dependencies);

  assert.equal(result.failure, 'RESEARCH_UNAVAILABLE');
  assert.deepEqual(result.details.providerFailures, ['provider offline']);
  assert.equal(harness.stores.evidence.length, 0);
});

test('research pipeline bounds scraping to twelve candidates and records scrape failures', async () => {
  const results = Array.from({ length: 15 }, (_, index) => ({
    title: 'Report ' + index,
    url: 'https://example.com/report-' + index,
    publisher: 'Example',
    provider: 'Test index',
  }));
  let scrapeCount = 0;
  const harness = makeHarness({
    results,
    scrape: async () => {
      scrapeCount++;
      throw new Error('blocked');
    },
  });

  const result = await runResearchPipeline(harness.dependencies);

  assert.equal(scrapeCount, 12);
  assert.equal(result.scrapeAttempted, 12);
  assert.equal(result.scrapedCount, 0);
  assert.equal(result.scrapeFailures.length, 12);
  assert.equal(result.savedCount, 15);
});
