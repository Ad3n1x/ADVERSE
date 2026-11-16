import { buildIntentWorkspace } from '../services/experience/intent-engine.js';

export function registerIntentRoutes(app, {
  limitProvider, wrap, sendError, optionalAuth, getUserProviderKeys,
}) {
  app.post('/api/v1/experience/intent', limitProvider, optionalAuth, wrap(async (req, res) => {
    const intent = String(req.body?.intent || '').trim().slice(0, 500);
    if (intent.length < 5) return sendError(res, 400, 'INTENT_TOO_SHORT', 'Describe what you want to accomplish in at least five characters.');
    let credentials = {};
    if (req.user && typeof getUserProviderKeys === 'function') {
      try { credentials = await getUserProviderKeys(req.user.id) || {}; }
      catch { credentials = {}; }
    }
    const result = await buildIntentWorkspace({ intent, credentials });
    res.json({
      data: result.plan,
      meta: {
        engine: result.engine,
        fallback: result.fallback,
        notice: result.fallback
          ? 'The AI provider was unavailable or not configured. This workspace was generated using a local rules-based fallback.'
          : 'AI-generated workspace plan. Review the plan before taking any action; ADVERSE has not executed external actions.',
      },
    });
  }));
}
