import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const evidenceSchema = new Schema({
  investigationId: { type: String, index: true, required: true }, title: { type: String, required: true, maxlength: 240 },
  url: { type: String, required: true, maxlength: 2048 }, sourceType: { type: String, enum: ['web','archive','organization','document','manual','domain'], default: 'web' },
  publisher: { type: String, default: '' }, originalUrl: { type: String, maxlength: 2048, default: '' }, canonicalUrl: { type: String, maxlength: 2048, default: '' }, publishedAt: { type: Date, default: null }, retrievedAt: { type: Date, required: true },
  excerpt: { type: String, maxlength: 5000, default: '' }, verificationStatus: { type: String, enum: ['unverified','supported','conflicting','insufficient'], default: 'unverified' },
  contentHash: { type: String, default: '' }, contentHashAlgorithm: { type: String, default: 'sha256' }, contentHashScope: { type: String, default: 'excerpt' }, reviewChecklist: { type: Schema.Types.Mixed, default: {} }, reviewRationale: { type: String, maxlength: 1000, default: '' }, reviewedAt: { type: Date, default: null }, reviewedBy: { type: String, default: '' }, entities: [{ type: String }], captureTimestamp: { type: String, default: '' }
}, stamp);
evidenceSchema.index({ investigationId: 1, retrievedAt: -1 });
export const Evidence = models.Evidence || model('Evidence', evidenceSchema);
