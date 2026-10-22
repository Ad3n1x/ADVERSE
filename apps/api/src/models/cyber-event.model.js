import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
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
export const CyberEvent = models.CyberEvent || model('CyberEvent', cyberEventSchema);
