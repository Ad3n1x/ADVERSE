import mongoose from 'mongoose';

const { Schema, model: createModel, models } = mongoose;

const publicSearchDocumentSchema = new Schema({
  canonicalUrl: { type: String, required: true, unique: true, maxlength: 2048 },
  hostname: { type: String, required: true, maxlength: 255, index: true },
  title: { type: String, default: '', maxlength: 500 },
  excerpt: { type: String, default: '', maxlength: 6000 },
  publisher: { type: String, default: '', maxlength: 240 },
  provider: { type: String, default: '', maxlength: 160 },
  providers: { type: [String], default: [] },
  sourceType: { type: String, default: 'web', maxlength: 40 },
  publishedAt: { type: Date, default: null },
  firstSeenAt: { type: Date, default: Date.now, index: true },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  lastFetchedAt: { type: Date, default: null },
  contentHash: { type: String, default: '', maxlength: 64 },
  matchedQueries: { type: [String], default: [] },
}, { timestamps: true, versionKey: false });

publicSearchDocumentSchema.index(
  { title: 'text', excerpt: 'text', publisher: 'text' },
  { weights: { title: 8, publisher: 3, excerpt: 1 }, name: 'public_search_text' },
);
publicSearchDocumentSchema.index({ lastSeenAt: -1 });
publicSearchDocumentSchema.index({ title: 1 });

export const PublicSearchDocument = models.PublicSearchDocument
  || createModel('PublicSearchDocument', publicSearchDocumentSchema);
