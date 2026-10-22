import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const userSchema = new Schema({ email: { type: String, required: true, unique: true, lowercase: true, trim: true }, displayName: { type: String, required: true, maxlength: 80 }, passwordHash: { type: String, required: true }, passwordResetTokenHash: { type: String, default: '', index: true }, passwordResetExpiresAt: { type: Date, default: null }, providerCredentialsEncrypted: { type: String, default: '' }, status: { type: String, enum: ['active','suspended'], default: 'active', index: true } }, { timestamps: true, versionKey: false });
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
  ownerId: { type: String, default: 'local-user' },
  aiReviewHistory: { type: [Schema.Types.Mixed], default: [] }
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
  lastCaptureDigest: { type: String, default: '' },
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
  emailNextAttemptAt: { type: Date, default: null, index: true },
  emailLastError: { type: String, maxlength: 300, default: '' },
  emailSentAt: { type: Date, default: null },
  observedAt: { type: Date, default: Date.now },
  acknowledgedAt: { type: Date, default: null }
}, stamp);
alertSchema.index({ investigationId: 1, observedAt: -1 });
export const Watch = models.Watch || model('Watch', watchSchema);
export const Alert = models.Alert || model('Alert', alertSchema);

const cyberAssetSchema = new Schema({
  investigationId: { type: String, index: true, required: true },
  url: { type: String, required: true, maxlength: 2048 },
  hostname: { type: String, required: true, maxlength: 253 },
  label: { type: String, maxlength: 160, default: '' },
  authorizedByUser: { type: Boolean, required: true, default: false },
  verificationToken: { type: String, maxlength: 100, default: '' },
  verificationStatus: { type: String, enum: ['pending','verified'], default: 'pending' },
  verifiedAt: { type: Date, default: null },
  intervalHours: { type: Number, enum: [1, 6, 12, 24], default: 6 },
  enabled: { type: Boolean, default: true },
  lastCheckedAt: { type: Date, default: null },
  nextCheckAt: { type: Date, default: Date.now, index: true },
  lastSnapshotHash: { type: String, default: '' },
  lastDnsFingerprint: { type: String, default: '' },
  lastHttpStatus: { type: Number, default: null },
  lastCertificateFingerprint: { type: String, default: '' },
  lastError: { type: String, maxlength: 500, default: '' }
}, stamp);
cyberAssetSchema.index({ investigationId: 1, createdAt: -1 });
cyberAssetSchema.index({ enabled: 1, nextCheckAt: 1 });
const cyberEventSchema = new Schema({
  investigationId: { type: String, index: true, required: true },
  assetId: { type: String, required: true, index: true },
  type: { type: String, enum: ['baseline','availability','content-change','dns-change','certificate-observation','check-failed'], required: true },
  severity: { type: String, enum: ['info','low','medium','high'], default: 'info' },
  title: { type: String, required: true, maxlength: 240 },
  message: { type: String, required: true, maxlength: 1200 },
  url: { type: String, required: true, maxlength: 2048 },
  observedAt: { type: Date, default: Date.now },
  details: { type: Schema.Types.Mixed, default: {} },
  acknowledgedAt: { type: Date, default: null }
}, stamp);
cyberEventSchema.index({ investigationId: 1, observedAt: -1 });
export const CyberAsset = models.CyberAsset || model('CyberAsset', cyberAssetSchema);
export const CyberEvent = models.CyberEvent || model('CyberEvent', cyberEventSchema);



// Admin and operations telemetry. No passwords, tokens, raw search queries, or provider secrets are stored here.
const adminAuditSchema = new Schema({
  actorId: { type: String, default: 'system', index: true },
  actorEmail: { type: String, default: '' },
  action: { type: String, required: true, maxlength: 100, index: true },
  targetType: { type: String, default: '', maxlength: 80 },
  targetId: { type: String, default: '', maxlength: 160 },
  details: { type: Schema.Types.Mixed, default: {} },
  ipHash: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
adminAuditSchema.index({ createdAt: -1 });
export const AdminAuditEvent = models.AdminAuditEvent || model('AdminAuditEvent', adminAuditSchema);

const searchMetricSchema = new Schema({
  kind: { type: String, enum: ['search','request','provider_test','link_check'], default: 'request', index: true },
  route: { type: String, required: true, maxlength: 160, index: true },
  method: { type: String, maxlength: 10, default: 'GET' },
  status: { type: Number, default: 0, index: true },
  durationMs: { type: Number, default: 0 },
  userId: { type: String, default: '', index: true },
  provider: { type: String, default: '' },
  resultCount: { type: Number, default: 0 },
  errorCode: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
searchMetricSchema.index({ createdAt: -1 });
searchMetricSchema.index({ kind: 1, createdAt: -1 });
export const SearchMetric = models.SearchMetric || model('SearchMetric', searchMetricSchema);

const platformConfigSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, default: {} },
  updatedBy: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
export const PlatformConfig = models.PlatformConfig || model('PlatformConfig', platformConfigSchema);

const incidentSchema = new Schema({
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, default: '', maxlength: 4000 },
  severity: { type: String, enum: ['low','medium','high','critical'], default: 'medium', index: true },
  status: { type: String, enum: ['open','investigating','resolved'], default: 'open', index: true },
  source: { type: String, default: 'admin', maxlength: 80 },
  createdBy: { type: String, default: '' },
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
incidentSchema.index({ status: 1, createdAt: -1 });
export const Incident = models.Incident || model('Incident', incidentSchema);

const jobRunSchema = new Schema({
  name: { type: String, required: true, maxlength: 120, index: true },
  status: { type: String, enum: ['running','success','failed','skipped'], default: 'running', index: true },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: null },
  durationMs: { type: Number, default: 0 },
  message: { type: String, default: '', maxlength: 1000 },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { versionKey: false });
jobRunSchema.index({ startedAt: -1 });
export const JobRun = models.JobRun || model('JobRun', jobRunSchema);

const linkCheckSchema = new Schema({
  url: { type: String, required: true, maxlength: 2048 },
  normalizedUrl: { type: String, required: true, maxlength: 2048, index: true },
  status: { type: Number, default: 0 },
  ok: { type: Boolean, default: false, index: true },
  latencyMs: { type: Number, default: 0 },
  checkedAt: { type: Date, default: Date.now, index: true },
  error: { type: String, default: '', maxlength: 300 }
}, { versionKey: false });
linkCheckSchema.index({ checkedAt: -1 });
export const LinkCheck = models.LinkCheck || model('LinkCheck', linkCheckSchema);
