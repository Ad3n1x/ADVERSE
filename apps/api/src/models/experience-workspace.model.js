import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const experienceWorkspaceSchema = new Schema({
  workspaceId: { type: String, required: true, maxlength: 100 },
  ownerId: { type: String, required: true, index: true },
  intent: { type: String, required: true, maxlength: 500 },
  kind: { type: String, enum: ['research', 'plan', 'compare', 'create', 'explore'], required: true },
  createdAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, versionKey: false });

experienceWorkspaceSchema.index({ ownerId: 1, updatedAt: -1 });
experienceWorkspaceSchema.index({ ownerId: 1, workspaceId: 1 }, { unique: true });

export const ExperienceWorkspace = models.ExperienceWorkspace
  || model('ExperienceWorkspace', experienceWorkspaceSchema);
