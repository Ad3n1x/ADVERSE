import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const cyberAssetSchema = new Schema({
  investigationId: { type: String, index: true, required: true },
  url: { type: String, required: true, maxlength: 2048 },
  hostname: { type: String, required: true, maxlength: 253 },
  label: { type: String, maxlength: 160, default: '' },
  authorizedByUser: { type: Boolean, required: true, default: false },
  verificationToken: { type: String, maxlength: 100, default: '' },
  verificationStatus: { type: String, enum: ['pending','verified'], default: 'pending' },
  verifiedAt: { type: Date, default: null },
  intervalHours: { type: Number, enum: [1, 6, 12, 24], default: 6 },
  enabled: { type: Boolean, default: true },
  lastCheckedAt: { type: Date, default: null },
  nextCheckAt: { type: Date, default: Date.now, index: true },
  lastSnapshotHash: { type: String, default: '' },
  lastDnsFingerprint: { type: String, default: '' },
  lastHttpStatus: { type: Number, default: null },
  lastCertificateFingerprint: { type: String, default: '' },
  lastError: { type: String, maxlength: 500, default: '' }
}, stamp);
cyberAssetSchema.index({ investigationId: 1, createdAt: -1 });
cyberAssetSchema.index({ enabled: 1, nextCheckAt: 1 });
export const CyberAsset = models.CyberAsset || model('CyberAsset', cyberAssetSchema);
