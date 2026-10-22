import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
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
export const Watch = models.Watch || model('Watch', watchSchema);
