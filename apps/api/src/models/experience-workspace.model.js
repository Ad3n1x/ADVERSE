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
  publishedAt: { type: String, default: null, maxlength: 40 },
  retrievedAt: { type: String, default: null, maxlength: 40 },
  linkCheck: {
    status: { type: String, enum: ['reachable', 'not_confirmed', 'not_checked'], default: 'not_checked' },
    checkedAt: { type: String, default: null, maxlength: 40 },
    note: { type: String, default: '', maxlength: 500 },
  },
  savedAt: { type: Date, default: Date.now },
}, { _id: false });

const experienceWorkspaceSchema = new Schema({
  workspaceId: { type: String, required: true, maxlength: 100 },
  ownerId: { type: String, required: true, index: true },
  intent: { type: String, required: true, maxlength: 500 },
  kind: { type: String, enum: ['research', 'plan', 'compare', 'create', 'explore'], required: true },
  sources: { type: [experienceSourceSchema], default: [] },
  createdAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, versionKey: false });

experienceWorkspaceSchema.index({ ownerId: 1, updatedAt: -1 });
experienceWorkspaceSchema.index({ ownerId: 1, workspaceId: 1 }, { unique: true });

export const ExperienceWorkspace = models.ExperienceWorkspace
  || model('ExperienceWorkspace', experienceWorkspaceSchema);
