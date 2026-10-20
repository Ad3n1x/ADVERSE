import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '256kb' }));

const investigations = new Map();
const createInvestigationSchema = z.object({ title: z.string().trim().min(1).max(120), question: z.string().trim().max(1000).default('') });
app.get('/api/v1/health', (_req, res) => res.json({ ok: true, service: 'adverse-api', mode: 'starter', timestamp: new Date().toISOString() }));
app.get('/api/v1/investigations', (_req, res) => res.json({ data: [...investigations.values()], meta: { persistence: 'memory-only', count: investigations.size } }));
app.post('/api/v1/investigations', (req, res) => {
  const parsed = createInvestigationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a title of 1–120 characters.', details: parsed.error.flatten() } });
  const now = new Date().toISOString();
  const record = { id: crypto.randomUUID(), ...parsed.data, createdAt: now, updatedAt: now, status: 'active', evidence: [], entities: [], relationships: [] };
  investigations.set(record.id, record);
  return res.status(201).json({ data: record, meta: { persistence: 'memory-only' } });
});
app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } }));
app.use((err, _req, res, _next) => { console.error('Request failed:', err?.message || 'unknown error'); res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } }); });
