import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
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
