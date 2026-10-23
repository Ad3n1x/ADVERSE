import test from 'node:test';
import assert from 'node:assert/strict';
import { findIndexedPublicResults, indexPublicSearchResults } from './public-search-index.js';

test('public index safely falls back when persistent storage is unavailable', async () => {
  const previous = globalThis.__ADVERSE_MONGO_READY__;
  try {
    globalThis.__ADVERSE_MONGO_READY__ = false;
    assert.deepEqual(await findIndexedPublicResults('public search'), []);
    assert.deepEqual(await indexPublicSearchResults([{ url: 'https://example.org', title: 'Example' }], 'example'), { indexed: 0 });
  } finally {
    if (previous === undefined) delete globalThis.__ADVERSE_MONGO_READY__;
    else globalThis.__ADVERSE_MONGO_READY__ = previous;
  }
});
