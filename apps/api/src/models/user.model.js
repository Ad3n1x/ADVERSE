import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const userSchema = new Schema({ email: { type: String, required: true, unique: true, lowercase: true, trim: true }, displayName: { type: String, required: true, maxlength: 80 }, passwordHash: { type: String, required: true }, role: { type: String, enum: ['user','admin'], default: 'user', index: true }, passwordResetTokenHash: { type: String, default: '', index: true }, passwordResetExpiresAt: { type: Date, default: null }, providerCredentialsEncrypted: { type: String, default: '' }, status: { type: String, enum: ['active','suspended'], default: 'active', index: true } }, { timestamps: true, versionKey: false });
export const User = models.User || model('User', userSchema);
