import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const entitySchema = new Schema({
  investigationId: { type: String, index: true, required: true }, name: { type: String, required: true, maxlength: 200 },
  type: { type: String, enum: ['organization','domain','product','technology','document','event','claim','person'], default: 'organization' },
  description: { type: String, maxlength: 2000, default: '' }, canonicalUrl: { type: String, default: '' }, evidenceIds: [{ type: String }]
}, stamp);
entitySchema.index({ investigationId: 1, name: 1 });
export const Entity = models.Entity || model('Entity', entitySchema);
