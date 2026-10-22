import crypto from 'node:crypto';
import { timingSafeEqual, scryptSync } from 'node:crypto';

/**
 * Authentication and account lifecycle handlers.
 * Route registration and middleware remain in auth.routes.js.
 */
export function createAuthController({
  authSchema, sendError, ownerEmail, isDb, User, memory, id, setSession, tokenFor,
  Investigation, Evidence, Entity, Relationship, Watch, Alert, CyberAsset, CyberEvent,
}) {
  const clearSession = (res) => {
    res.setHeader('Set-Cookie', `adverse_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  };

  async function register(req, res) {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Use a valid email and a password of at least 12 characters.', parsed.error.flatten());
    const email = parsed.data.email.toLowerCase();
    if (email === ownerEmail()) return sendError(res, 403, 'OWNER_EMAIL_RESERVED', 'This email is reserved for the workspace owner. Use administrator sign-in instead.');
    const existing = isDb()
      ? await User.findOne({ email })
      : [...memory.users.values()].find((user) => user.email === email);
    if (existing) return sendError(res, 409, 'ACCOUNT_EXISTS', 'An account with this email already exists.');

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = `${salt}:${scryptSync(parsed.data.password, salt, 64).toString('hex')}`;
    const user = isDb()
      ? await User.create({ email, displayName: parsed.data.displayName || email.split('@')[0], passwordHash })
      : { id: id(), email, displayName: parsed.data.displayName || email.split('@')[0], passwordHash };
    if (!isDb()) memory.users.set(user.id, user);

    const safeUser = { id: String(user.id || user._id), email: user.email, displayName: user.displayName };
    setSession(res, tokenFor(safeUser));
    return res.status(201).json({ data: safeUser });
  }

  async function login(req, res) {
    const parsed = authSchema.pick({ email: true, password: true }).safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Enter a valid email and password.');
    const email = parsed.data.email.toLowerCase();
    const user = isDb()
      ? await User.findOne({ email }).lean()
      : [...memory.users.values()].find((item) => item.email === email);
    if (!user) return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

    const [salt, hash] = (user.passwordHash || '').split(':');
    if (!salt || !hash) return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const candidate = scryptSync(parsed.data.password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    const safeUser = {
      id: String(user.id || user._id), email: user.email,
      displayName: user.displayName, role: user.role || 'user',
    };
    setSession(res, tokenFor(safeUser));
    return res.json({ data: safeUser });
  }

  async function me(req, res) {
    const user = isDb()
      ? await User.findById(req.user.id).select('email displayName role status').lean()
      : memory.users.get(req.user.id);
    if (!user) return sendError(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
    const email = String(user.email || '').toLowerCase();
    return res.json({
      data: {
        id: String(user.id || user._id), email: user.email, displayName: user.displayName,
        role: email === ownerEmail() ? 'owner' : (user.role || 'user'),
      },
    });
  }

  function logout(_req, res) {
    clearSession(res);
    return res.status(204).end();
  }

  async function deleteAccount(req, res) {
    const uid = String(req.user.id);
    if (isDb()) {
      const owned = await Investigation.find({ ownerId: uid }).select('_id').lean();
      const investigationIds = owned.map((item) => String(item._id));
      await Promise.all([
        Investigation.deleteMany({ ownerId: uid }),
        Evidence.deleteMany({ investigationId: { $in: investigationIds } }),
        Entity.deleteMany({ investigationId: { $in: investigationIds } }),
        Relationship.deleteMany({ investigationId: { $in: investigationIds } }),
        Watch.deleteMany({ investigationId: { $in: investigationIds } }),
        Alert.deleteMany({ investigationId: { $in: investigationIds } }),
        CyberAsset.deleteMany({ investigationId: { $in: investigationIds } }),
        CyberEvent.deleteMany({ investigationId: { $in: investigationIds } }),
        User.deleteOne({ _id: uid }),
      ]);
    } else {
      for (const [investigationId, item] of memory.investigations) {
        if (String(item.ownerId) !== uid) continue;
        memory.investigations.delete(investigationId);
        for (const collection of ['evidence', 'entities', 'relationships', 'watches', 'alerts', 'cyberAssets', 'cyberEvents']) {
          for (const [recordId, record] of memory[collection]) {
            if (String(record.investigationId) === String(investigationId)) memory[collection].delete(recordId);
          }
        }
      }
      memory.users.delete(uid);
    }
    clearSession(res);
    return res.status(204).end();
  }

  return { register, login, me, logout, deleteAccount };
}
