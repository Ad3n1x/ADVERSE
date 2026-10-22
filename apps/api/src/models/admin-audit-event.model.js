import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const adminAuditSchema = new Schema({
  actorId: { type: String, default: 'system', index: true },
  actorEmail: { type: String, default: '' },
  action: { type: String, required: true, maxlength: 100, index: true },
  targetType: { type: String, default: '', maxlength: 80 },
  targetId: { type: String, default: '', maxlength: 160 },
  details: { type: Schema.Types.Mixed, default: {} },
  ipHash: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
adminAuditSchema.index({ createdAt: -1 });
export const AdminAuditEvent = models.AdminAuditEvent || model('AdminAuditEvent', adminAuditSchema);
