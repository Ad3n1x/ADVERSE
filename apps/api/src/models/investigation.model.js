import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const investigationSchema = new Schema({
  title: { type: String, required: true, maxlength: 120 }, question: { type: String, maxlength: 1000, default: '' },
  status: { type: String, enum: ['active','paused','archived'], default: 'active' }, notes: { type: String, maxlength: 10000, default: '' },
  ownerId: { type: String, default: 'local-user' },
  aiReviewHistory: { type: [Schema.Types.Mixed], default: [] },
  agentRunHistory: { type: [Schema.Types.Mixed], default: [] },
  agentRunState: { type: Schema.Types.Mixed, default: {} }
}, stamp);
investigationSchema.index({ updatedAt: -1 });
export const Investigation = models.Investigation || model('Investigation', investigationSchema);
