import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const linkCheckSchema = new Schema({
  url: { type: String, required: true, maxlength: 2048 },
  normalizedUrl: { type: String, required: true, maxlength: 2048, index: true },
  status: { type: Number, default: 0 },
  ok: { type: Boolean, default: false, index: true },
  latencyMs: { type: Number, default: 0 },
  checkedAt: { type: Date, default: Date.now, index: true },
  error: { type: String, default: '', maxlength: 300 }
}, { versionKey: false });
linkCheckSchema.index({ checkedAt: -1 });
export const LinkCheck = models.LinkCheck || model('LinkCheck', linkCheckSchema);
