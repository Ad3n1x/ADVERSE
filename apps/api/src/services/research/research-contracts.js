import { z } from 'zod';

const shortText = (max = 300) => z.string().trim().min(1).max(max);
const id = z.string().trim().min(1).max(160);
const dateText = z.string().trim().min(1).max(40);

export const ResolvedIntentSchema = z.object({
  originalQuery: z.string().trim().min(2).max(500),
  type: z.enum([
    'application', 'eligibility', 'fees-costs', 'programme-availability',
    'deadline', 'scholarship-funding', 'destination', 'verification',
    'current-events', 'historical', 'comparison', 'how-to',
    'public-entity', 'general-research'
  ]),
  goal: shortText(300),
  subject: z.string().max(300).default(''),
  entities: z.array(z.object({
    text: shortText(150),
    kind: z.enum(['institution', 'programme', 'location', 'person', 'organisation', 'product', 'date', 'unknown']),
    role: z.string().max(80).default('context')
  })).max(20).default([]),
  constraints: z.array(z.string().max(200)).max(20).default([]),
  preferences: z.object({
    country: z.string().max(100).optional(),
    currency: z.string().max(8).optional(),
    sourcePreference: z.string().max(60).default('balanced'),
    academicSession: z.string().max(40).optional()
  }).default({ sourcePreference: 'balanced' }),
  subgoals: z.array(z.string().max(200)).max(12).default([]),
  clarificationNeeded: z.boolean().default(false),
  ambiguities: z.array(z.string().max(200)).max(10).default([]),
  confidence: z.number().min(0).max(1)
}).strict();

export const StepSchema = z.object({
  id,
  type: z.enum([
    'resolve-entity', 'discover-source', 'verify-source', 'extract-evidence',
    'compare-evidence', 'resolve-conflict', 'prepare-outcome'
  ]),
  objective: shortText(300),
  requiredFields: z.array(shortText(80)).max(20).default([]),
  providerPolicy: z.enum(['official-first', 'primary-and-independent', 'balanced', 'documentation-first']).default('balanced'),
  status: z.enum(['pending', 'running', 'completed', 'blocked', 'failed', 'skipped']).default('pending'),
  evidenceIds: z.array(id).max(100).default([]),
  completedAt: dateText.nullable().default(null)
}).strict();

export const WorkflowSchema = z.object({
  workflowId: id,
  template: z.enum(['decide', 'verify', 'investigate']),
  intentId: id,
  status: z.enum(['pending', 'running', 'paused', 'completed', 'partially_completed', 'failed']),
  steps: z.array(StepSchema).min(1).max(20),
  createdAt: dateText,
  updatedAt: dateText
}).strict();

export const SourceSchema = z.object({
  sourceId: id,
  url: z.string().url(),
  title: z.string().max(500).default(''),
  excerpt: z.string().max(5000).default(''),
  publisher: z.string().max(250).default(''),
  provider: z.string().max(150).default(''),
  publishedAt: dateText.nullable().default(null),
  retrievedAt: dateText,
  entityMatches: z.array(z.object({
    entity: shortText(150),
    matched: z.boolean(),
    matchType: z.enum(['exact', 'alias', 'contextual', 'none'])
  })).max(20).default([]),
  relevance: z.object({
    score: z.number().min(0).max(100),
    matchedTerms: z.array(z.string()).max(50).default([]),
    intentMatch: z.boolean(),
    entityMatch: z.boolean(),
    accepted: z.boolean(),
    rejectionReasons: z.array(z.string().max(200)).max(10).default([])
  }),
  sourceType: z.enum(['official', 'primary', 'academic', 'news', 'reference', 'community', 'unknown']).default('unknown'),
  verificationStatus: z.enum(['unverified', 'reachable', 'not-confirmed']).default('unverified')
}).strict();

export const TypedClaimSchema = z.object({
  claimId: id,
  type: z.enum([
    'institution', 'programme', 'tuition', 'additional-fee', 'currency',
    'academic-session', 'deadline', 'eligibility', 'requirement',
    'application-route', 'scholarship', 'location', 'date', 'general-fact'
  ]),
  statement: shortText(1500),
  value: z.object({
    amount: z.number().finite().nullable().default(null),
    currency: z.string().max(8).nullable().default(null),
    unit: z.string().max(80).nullable().default(null),
    text: z.string().max(500).nullable().default(null)
  }).default({ amount: null, currency: null, unit: null, text: null }),
  entityId: id.nullable().default(null),
  academicSession: z.string().max(40).nullable().default(null),
  sourceIds: z.array(z.string().trim().min(1).max(2048)).min(1).max(20),
  assessment: z.enum(['unreviewed', 'supported', 'conflicting', 'insufficient']).default('unreviewed'),
  confidence: z.number().min(0).max(1).default(0)
}).strict();

export const AnswerStatusSchema = z.object({
  status: z.enum([
    'answered', 'partially_answered', 'not_found', 'conflicting',
    'insufficient_evidence', 'needs_clarification'
  ]),
  requiredFields: z.array(z.object({
    field: shortText(100),
    required: z.boolean(),
    satisfied: z.boolean(),
    evidenceIds: z.array(id).max(20).default([])
  })).max(20),
  completionRatio: z.number().min(0).max(1),
  unresolvedQuestions: z.array(z.string().max(240)).max(20).default([]),
  conflictCount: z.number().int().min(0),
  explanation: z.string().max(1500),
  evaluatedAt: dateText
}).strict();
