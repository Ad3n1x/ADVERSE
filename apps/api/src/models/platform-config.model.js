import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const platformConfigSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, default: {} },
  updatedBy: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
export const PlatformConfig = models.PlatformConfig || model('PlatformConfig', platformConfigSchema);
