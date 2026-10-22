import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
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
