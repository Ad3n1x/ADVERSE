import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const experienceSourceSchema = new Schema({
  url: { type: String, required: true, maxlength: 2048 },
  title: { type: String, default: '', maxlength: 500 },
  excerpt: { type: String, default: '', maxlength: 2000 },
  publisher: { type: String, default: '', maxlength: 240 },
  provider: { type: String, default: '', maxlength: 160 },
  providers: { type: [String], default: [] },
  sourceType: { type: String, default: 'web', maxlength: 40 },
  reviewStatus: { type: String, enum: ['unreviewed', 'useful', 'not_relevant'], default: 'unreviewed' },
  analystNote: { type: String, default: '', maxlength: 1000 },
  publishedAt: { type: String, default: null, maxlength: 40 },
  retrievedAt: { type: String, default: null, maxlength: 40 },
  linkCheck: {
    status: { type: String, enum: ['reachable', 'not_confirmed', 'not_checked'], default: 'not_checked' },
    checkedAt: { type: String, default: null, maxlength: 40 },
    note: { type: String, default: '', maxlength: 500 },
  },
  savedAt: { type: Date, default: Date.now },
}, { _id: false });

const experienceClaimLinkSchema = new Schema({
  url: { type: String, required: true, maxlength: 2048 },
  role: { type: String, enum: ['supports', 'challenges', 'context'], required: true },
}, { _id: false });

const experienceClaimSchema = new Schema({
  claimId: { type: String, required: true, maxlength: 100 },
  text: { type: String, required: true, maxlength: 1000 },
  assessment: { type: String, enum: ['unreviewed', 'supported', 'conflicting', 'insufficient'], default: 'unreviewed' },
  rationale: { type: String, default: '', maxlength: 1000 },
  evidenceLinks: { type: [experienceClaimLinkSchema], default: [] },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const experienceRunSchema = new Schema({
  runId: { type: String, required: true, maxlength: 100 },
  query: { type: String, required: true, maxlength: 500 },
  plannerKind: { type: String, enum: ['research', 'plan', 'compare', 'create', 'explore'], required: true },
  sourceCount: { type: Number, min: 0, max: 12, default: 0 },
  successfulSearches: { type: Number, min: 0, max: 20, default: 0 },
  providerNames: { type: [String], default: [] },
  coverage: { type: String, default: '', maxlength: 500 },
  recordedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const experienceWorkspaceSchema = new Schema({
  workspaceId: { type: String, required: true, maxlength: 100 },
  ownerId: { type: String, required: true, index: true },
  intent: { type: String, required: true, maxlength: 500 },
  kind: { type: String, enum: ['research', 'plan', 'compare', 'create', 'explore'], required: true },
  sources: { type: [experienceSourceSchema], default: [] },
  claims: { type: [experienceClaimSchema], default: [] },
  researchRuns: { type: [experienceRunSchema], default: [] },
  createdAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, versionKey: false });

experienceWorkspaceSchema.index({ ownerId: 1, updatedAt: -1 });
experienceWorkspaceSchema.index({ ownerId: 1, workspaceId: 1 }, { unique: true });

export const ExperienceWorkspace = models.ExperienceWorkspace
  || model('ExperienceWorkspace', experienceWorkspaceSchema);
