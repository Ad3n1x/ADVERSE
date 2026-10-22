import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const stamp = { timestamps: true, versionKey: false };
const searchMetricSchema = new Schema({
  kind: { type: String, enum: ['search','request','provider_test','link_check'], default: 'request', index: true },
  route: { type: String, required: true, maxlength: 160, index: true },
  method: { type: String, maxlength: 10, default: 'GET' },
  status: { type: Number, default: 0, index: true },
  durationMs: { type: Number, default: 0 },
  userId: { type: String, default: '', index: true },
  provider: { type: String, default: '' },
  resultCount: { type: Number, default: 0 },
  errorCode: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
searchMetricSchema.index({ createdAt: -1 });
searchMetricSchema.index({ kind: 1, createdAt: -1 });
export const SearchMetric = models.SearchMetric || model('SearchMetric', searchMetricSchema);
