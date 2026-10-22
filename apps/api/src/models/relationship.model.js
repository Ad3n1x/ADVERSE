import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const relationshipSchema = new Schema({
  investigationId: { type: String, index: true, required: true }, fromEntityId: { type: String, required: true }, toEntityId: { type: String, required: true },
  type: { type: String, enum: ['owns','operates','publishes','references','uses','acquired','associated','supports','contradicts','documents'], default: 'associated' },
  evidenceIds: [{ type: String }], confidence: { type: String, enum: ['low','medium','high'], default: 'low' }, rationale: { type: String, maxlength: 1000, default: '' }, verificationStatus: { type: String, enum: ['unverified','supported','conflicting','insufficient'], default: 'unverified' }
}, stamp);
relationshipSchema.index({ investigationId: 1, fromEntityId: 1, toEntityId: 1 });
export const Relationship = models.Relationship || model('Relationship', relationshipSchema);
