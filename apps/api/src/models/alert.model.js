import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
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
export const Alert = models.Alert || model('Alert', alertSchema);
