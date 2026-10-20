import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const evidenceSchema = new Schema({
  investigationId: { type: String, index: true, required: true }, title: { type: String, required: true, maxlength: 240 },
  url: { type: String, required: true, maxlength: 2048 }, sourceType: { type: String, enum: ['web','archive','organization','document','manual','domain'], default: 'web' },
  publisher: { type: String, default: '' }, publishedAt: { type: Date, default: null }, retrievedAt: { type: Date, required: true },
  excerpt: { type: String, maxlength: 5000, default: '' }, verificationStatus: { type: String, enum: ['unverified','supported','conflicting','insufficient'], default: 'unverified' },
  contentHash: { type: String, default: '' }, entities: [{ type: String }], captureTimestamp: { type: String, default: '' }
}, stamp);
const entitySchema = new Schema({
  investigationId: { type: String, index: true, required: true }, name: { type: String, required: true, maxlength: 200 },
  type: { type: String, enum: ['organization','domain','product','technology','document','event','claim','person'], default: 'organization' },
  description: { type: String, maxlength: 2000, default: '' }, canonicalUrl: { type: String, default: '' }, evidenceIds: [{ type: String }]
}, stamp);
const relationshipSchema = new Schema({
  investigationId: { type: String, index: true, required: true }, fromEntityId: { type: String, required: true }, toEntityId: { type: String, required: true },
  type: { type: String, enum: ['owns','operates','publishes','references','uses','acquired','associated','supports','contradicts','documents'], default: 'associated' },
  evidenceIds: [{ type: String }], confidence: { type: String, enum: ['low','medium','high'], default: 'low' }, rationale: { type: String, maxlength: 1000, default: '' }, verificationStatus: { type: String, enum: ['unverified','supported','conflicting','insufficient'], default: 'unverified' }
}, stamp);
const investigationSchema = new Schema({
  title: { type: String, required: true, maxlength: 120 }, question: { type: String, maxlength: 1000, default: '' },
  status: { type: String, enum: ['active','paused','archived'], default: 'active' }, notes: { type: String, maxlength: 10000, default: '' },
  ownerId: { type: String, default: 'local-user' }
}, stamp);
investigationSchema.index({ updatedAt: -1 });
evidenceSchema.index({ investigationId: 1, retrievedAt: -1 });
entitySchema.index({ investigationId: 1, name: 1 });
relationshipSchema.index({ investigationId: 1, fromEntityId: 1, toEntityId: 1 });
export const Investigation = models.Investigation || model('Investigation', investigationSchema);
export const Evidence = models.Evidence || model('Evidence', evidenceSchema);
export const Entity = models.Entity || model('Entity', entitySchema);
export const Relationship = models.Relationship || model('Relationship', relationshipSchema);
