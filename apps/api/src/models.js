import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const userSchema = new Schema({ email: { type: String, required: true, unique: true, lowercase: true, trim: true }, displayName: { type: String, required: true, maxlength: 80 }, passwordHash: { type: String, required: true } }, { timestamps: true, versionKey: false });
export const User = models.User || model('User', userSchema);
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

const watchSchema = new Schema({
  investigationId: { type: String, index: true, required: true },
  url: { type: String, required: true, maxlength: 2048 },
  label: { type: String, maxlength: 160, default: '' },
  intervalHours: { type: Number, enum: [6, 12, 24], default: 24 },
  enabled: { type: Boolean, default: true },
  lastCaptureTimestamp: { type: String, default: '' },
  lastCheckedAt: { type: Date, default: null },
  nextCheckAt: { type: Date, default: Date.now },
  lastError: { type: String, maxlength: 500, default: '' }
}, stamp);
watchSchema.index({ enabled: 1, nextCheckAt: 1 });
const alertSchema = new Schema({
  investigationId: { type: String, index: true, required: true },
  watchId: { type: String, required: true },
  title: { type: String, required: true, maxlength: 240 },
  message: { type: String, required: true, maxlength: 1000 },
  url: { type: String, required: true, maxlength: 2048 },
  captureTimestamp: { type: String, required: true },
  emailStatus: { type: String, enum: ['pending', 'sent', 'disabled'], default: 'pending', index: true },
  emailAttempts: { type: Number, default: 0 },
  emailLastError: { type: String, maxlength: 300, default: '' },
  emailSentAt: { type: Date, default: null },
  observedAt: { type: Date, default: Date.now },
  acknowledgedAt: { type: Date, default: null }
}, stamp);
alertSchema.index({ investigationId: 1, observedAt: -1 });
export const Watch = models.Watch || model('Watch', watchSchema);
export const Alert = models.Alert || model('Alert', alertSchema);
