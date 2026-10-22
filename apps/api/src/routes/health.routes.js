import express from 'express';

export function createHealthRouter({ isDb, mongoose }) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'adverse-api', timestamp: new Date().toISOString() });
  });

  // Readiness is stricter than liveness so production traffic only reaches a
  // process with working persistence and a configured session-signing secret.
  router.get('/ready', (_req, res) => {
    const production = process.env.NODE_ENV === 'production';
    const databaseReady = isDb() && mongoose.connection.readyState === 1;
    const sessionSecretReady = Boolean(String(process.env.JWT_SECRET || '').trim());
    const ready = !production || (databaseReady && sessionSecretReady);
    const payload = {
      ok: ready,
      status: ready ? 'ready' : 'not_ready',
      service: 'adverse-api',
      checks: {
        database: databaseReady ? 'ok' : production ? 'unavailable' : 'optional_in_development',
        sessionSecret: sessionSecretReady ? 'configured' : 'missing',
      },
      timestamp: new Date().toISOString(),
    };
    res.status(ready ? 200 : 503).json(payload);
  });

  return router;
}
