import crypto from 'node:crypto';
import { Investigation, Evidence, Entity, Relationship } from './models.js';
import { analyzeEvidenceFree } from './free-analyst.js';

function tokenFrom(req) {
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (auth) return auth;
  const cookie = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('adverse_session='));
  if (!cookie) return '';
  try { return decodeURIComponent(cookie.slice('adverse_session='.length)); } catch { return ''; }
}

function verifySession(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'adverse-local-development-secret-change-before-deploy');
    if (!secret) return null;
    const expected = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest();
    const supplied = Buffer.from(parts[2], 'base64url');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: String(payload.sub) };
  } catch { return null; }
}

export function registerFreeAnalystRoute(app) {
  app.post('/api/v1/investigations/:id/free-analyst', async (req, res) => {
    const user = verifySession(tokenFrom(req));
    if (!user) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to use the free evidence analyst.' } });
    try {
      const investigation = await Investigation.findOne({ _id: req.params.id, ownerId: user.id }).lean();
      if (!investigation) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Investigation not found.' } });
      const [evidence, entities, relationships] = await Promise.all([
        Evidence.find({ investigationId: req.params.id }).sort({ createdAt: -1 }).limit(100).lean(),
        Entity.find({ investigationId: req.params.id }).limit(300).lean(),
        Relationship.find({ investigationId: req.params.id }).limit(500).lean()
      ]);
      return res.json({ data: analyzeEvidenceFree(evidence, entities, relationships) });
    } catch (error) {
      console.error('Free evidence analyst failed:', error?.message || 'unknown error');
      return res.status(500).json({ error: { code: 'ANALYST_FAILED', message: 'The free evidence analysis could not be completed.' } });
    }
  });
}
