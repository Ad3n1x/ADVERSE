import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const eventSchema = new Schema({
  stage: { type: String, maxlength: 40, required: true },
  message: { type: String, maxlength: 240, required: true },
  progress: { type: Number, min: 0, max: 100, required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

const researchJobSchema = new Schema({
  jobId: { type: String, required: true, unique: true, maxlength: 100 },
  ownerId: { type: String, required: true, index: true, maxlength: 100 },
  workspaceId: { type: String, required: true, maxlength: 100 },
  idempotencyKey: { type: String, required: true, maxlength: 100 },
  activeKey: { type: String, default: undefined },
  query: { type: String, required: true, maxlength: 500 },
  plannerKind: { type: String, enum: ['research', 'plan', 'compare', 'create', 'explore'], required: true },
  status: { type: String, enum: ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'], default: 'queued', index: true },
  stage: { type: String, enum: ['queued', 'planning', 'searching', 'checking', 'saving', 'paused', 'completed', 'failed', 'cancelled'], default: 'queued' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  events: { type: [eventSchema], default: [] },
  attempts: { type: Number, min: 0, default: 0 },
  maxAttempts: { type: Number, min: 1, max: 5, default: 3 },
  nextRunAt: { type: Date, default: Date.now, index: true },
  leaseOwner: { type: String, default: '' },
  leaseExpiresAt: { type: Date, default: null, index: true },
  heartbeatAt: { type: Date, default: null },
  cancelRequested: { type: Boolean, default: false },
  pauseRequested: { type: Boolean, default: false },
  pipelineVersion: { type: String, default: 'legacy-v1', maxlength: 40 },
  resolvedIntent: { type: Schema.Types.Mixed, default: undefined },
  workflow: { type: Schema.Types.Mixed, default: undefined },
  answerStatus: { type: Schema.Types.Mixed, default: undefined },
  candidateSources: { type: [Schema.Types.Mixed], default: [] },
  searchMeta: { type: Schema.Types.Mixed, default: {} },
  searchCompleted: { type: Boolean, default: false },
  checkedSources: { type: [Schema.Types.Mixed], default: [] },
  checksCompleted: { type: Boolean, default: false },
  sourceCount: { type: Number, min: 0, default: 0 },
  successfulSearches: { type: Number, min: 0, default: 0 },
  providerNames: { type: [String], default: [] },
  coverage: { type: String, maxlength: 500, default: '' },
  errorCode: { type: String, maxlength: 80, default: '' },
  errorMessage: { type: String, maxlength: 300, default: '' },
  startedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

researchJobSchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true });
researchJobSchema.index({ activeKey: 1 }, { unique: true, sparse: true });
researchJobSchema.index({ status: 1, nextRunAt: 1, leaseExpiresAt: 1, createdAt: 1 });
researchJobSchema.index({ ownerId: 1, workspaceId: 1, createdAt: -1 });

export const ExperienceResearchJob = models.ExperienceResearchJob
  || model('ExperienceResearchJob', researchJobSchema);
