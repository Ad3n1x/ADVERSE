import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Compass, FileSearch, Layers3, LogOut, Network,
  Clock3, Plus, Search, Sparkles, Trash2, Workflow, X, Check, Globe2
} from 'lucide-react';
import { request } from '../../lib/api';
import ExperienceConstellation from './ExperienceConstellation';
import ExperienceClaimsPanel from './ExperienceClaimsPanel';
import ExperienceCoveragePanel from './ExperienceCoveragePanel';
import ExperienceDossierActions from './ExperienceDossierActions';
import ExperienceRunHistoryPanel from './ExperienceRunHistoryPanel';
import WorkspaceAccessDocuments from './WorkspaceAccessDocuments';
import ExperienceSourceTimeline from './ExperienceSourceTimeline';
import type { ExperienceClaim, ExperienceSource } from './experience-types';
import './experience-home.css';

const GeospatialIntelligencePanel = lazy(() => import('../geospatial/GeospatialIntelligencePanel'));

type IntentKind = 'research' | 'plan' | 'compare' | 'create' | 'explore';
type SavedIntent = { id: string; intent: string; kind: IntentKind; createdAt: number };
type SourceReviewStatus = 'unreviewed' | 'useful' | 'not_relevant';
type SourceReviewFilter = 'all' | SourceReviewStatus;

type ExperienceSearchResponse = { data: ExperienceSource[]; meta?: { coverage?: string; providerError?: string; successfulSearches?: number; providers?: string[] } };
type ResearchJobSnapshot = { id: string; workspaceId: string; status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'; stage: string; progress: number; attempts: number; sourceCount: number; successfulSearches: number; providerNames: string[]; coverage: string; errorMessage?: string };
const HISTORY_KEY = 'adverse.experience.history.v1';
const HISTORY_LIMIT = 8;

const examples = [
  { icon: FileSearch, label: 'Research a topic', prompt: 'Research the latest advances in renewable energy storage' },
  { icon: Workflow, label: 'Plan a project', prompt: 'Help me plan a new software project from idea to launch' },
  { icon: Layers3, label: 'Compare options', prompt: 'Compare the best approaches for building a fast web application' },
];

type IntentPlan = {
  kind: IntentKind;
  request: string;
  focus: string;
  outcome: string;
  constraints: string[];
  steps: string[];
  spaces: string[];
  approvalRequired: boolean;
  semanticType?: string;
  subject?: string;
  searchQuery?: string;
  sourcePreference?: string;
  providerLabel?: string;
  entities?: Array<{ text: string; kind: string; role: string }>;
};

type GuidedTaskStep = {
  id: string;
  title: string;
  instruction: string;
  sourceUrl: string | null;
  sourceTitle: string;
  status: 'next' | 'in_progress' | 'completed' | 'blocked';
};
type GuidedTaskPlan = { title: string; summary: string; steps: GuidedTaskStep[]; updatedAt?: string };

function buildGuidedTaskPlan(plan: IntentPlan, sources: ExperienceSource[], previous: GuidedTaskPlan | null = null): GuidedTaskPlan {
  const semantic = String(plan.semanticType || '').toLowerCase();
  const application = semantic === 'application' || /\b(apply|admission|application portal)\b/i.test(plan.request);
  const fees = semantic === 'fees-costs' || /\b(price|fees?|tuition|cost)\b/i.test(plan.request);
  const focus = plan.focus || plan.request;
  const institution = /\b(abuad|university|college|polytechnic|institute)\b/i.test(focus);
  const definitions: Array<{ title: string; instruction: string; terms: string[] }> = application ? [
    { title: 'Find the official admissions destination', instruction: 'Open the institution’s official admissions page. Confirm that the page belongs to the institution before entering personal information.', terms: ['admission', 'admissions', 'application', 'portal'] },
    { title: 'Confirm the requested programme is offered', instruction: 'Check the exact programme name, award and study level. Do not assume a similar programme title is identical.', terms: ['mechatronics', 'programme', 'program', 'course', 'department'] },
    { title: 'Check entry requirements and eligibility', instruction: 'Compare the published requirements with your own qualifications. Treat missing or unclear criteria as questions to confirm with admissions.', terms: ['entry requirements', 'eligibility', 'admission requirements', 'direct entry'] },
    { title: 'Confirm fees and application dates', instruction: 'Check the current academic session, fee schedule, deadlines and any separate acceptance or application charges.', terms: ['fees', 'fee schedule', 'tuition', 'deadline', 'charges'] },
    { title: 'Prepare the required documents', instruction: 'Make a checklist from the official document requirements. Keep original documents secure and do not share passwords or payment details with ADVERSE.', terms: ['documents', 'requirements', 'credentials', 'results'] },
    { title: 'Review the application before submitting', instruction: 'Use the official portal to complete the form. Check every entry yourself. ADVERSE will not submit the application or make payments without your explicit approval.', terms: ['apply', 'application', 'portal', 'admissions'] },
  ] : fees ? [
    { title: 'Confirm the exact institution and programme', instruction: 'Make sure the fee information applies to the named institution, exact programme and study level—not another university or a similarly named course.', terms: ['abuad', 'mechatronics', 'programme', 'program', 'degree'] },
    { title: 'Find the official fee schedule', instruction: 'Look for the institution’s current official fee schedule or admissions notice. Prefer pages published by the institution over third-party estimates.', terms: ['fees', 'fee schedule', 'tuition', 'school fees', 'charges'] },
    { title: 'Separate tuition from additional charges', instruction: 'Check whether the published amount includes acceptance, registration, laboratory, accommodation, feeding and other compulsory charges.', terms: ['tuition', 'acceptance', 'registration', 'accommodation', 'charges'] },
    { title: 'Confirm the academic session and payment timing', instruction: 'Check the session or year covered, whether fees are per semester or session, and the official payment deadlines.', terms: ['2026', '2027', 'session', 'semester', 'payment', 'deadline'] },
    { title: 'Resolve anything the public fee schedule does not answer', instruction: 'If programme-specific fees are not published, use the institution’s official admissions or contact page to confirm the amount. Keep estimates clearly separate from confirmed fees.', terms: ['contact', 'admissions', 'fees', 'bursary', 'finance'] },
  ] : (plan.steps || []).slice(0, 6).map((title, index) => ({
    title,
    instruction: index === 0
      ? 'Start with the most authoritative source linked to this step. Check that it directly addresses your requested outcome.'
      : 'Use the linked source to complete this part of the task. If the instructions differ from earlier findings, pause and re-check the original source.',
    terms: title.toLowerCase().split(/\s+/).filter(word => word.length > 3),
  }));
  const prior = new Map((previous?.steps || []).map(step => [step.id, step]));
  const coreTerms = focus.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3 && !['degree','course','programme','program','price','fees','tuition','find','official','current'].includes(word));
  const steps = definitions.map((definition, index) => {
    const id = 'step-' + (index + 1);
    const source = sources.map(item => {
      const text = [item.title, item.publisher, item.url, item.excerpt].join(' ').toLowerCase();
      const matchedCore = coreTerms.filter(term => text.includes(term)).length;
      const matchedTask = definition.terms.filter(term => text.includes(term)).length;
      const official = /\.(edu\.ng|edu|gov\.ng|gov)(\.|\/|$)/i.test(item.url) ? 2 : 0;
      return { item, score: matchedCore * 3 + matchedTask + official, matchedCore, matchedTask };
    }).filter(candidate => candidate.matchedCore > 0 && candidate.matchedTask > 0)
      .sort((a, b) => b.score - a.score)[0];
    const matchedSource = source && source.score >= (institution ? 4 : 2) ? source.item : null;
    const old = prior.get(id);
    return {
      id, title: definition.title, instruction: definition.instruction,
      sourceUrl: matchedSource?.url || null, sourceTitle: matchedSource?.title || '',
      status: old?.status || (index === 0 ? 'in_progress' : 'next'),
    } as GuidedTaskStep;
  });
  return {
    title: application ? 'Your application pathway' : fees ? 'Your cost-checking pathway' : 'Your guided task',
    summary: application
      ? 'ADVERSE has organised the application journey. Follow the official instructions and verify requirements before submitting anything.'
      : fees
        ? 'ADVERSE will help verify the right programme costs, separate confirmed charges from unknowns, and take you to the relevant official pages.'
        : 'Follow the steps in order. ADVERSE links relevant sources and keeps your progress so you can continue later.',
    steps, updatedAt: new Date().toISOString(),
  };
}

function classifyIntent(value: string): IntentKind {
  const text = value.toLowerCase();
  if (/\b(compare|versus|vs\.?|difference|better than|pros and cons)\b/.test(text)) return 'compare';
  if (/\b(?:apply\s+(?:to|for)|application\s+(?:to|for)|admission(?:s)?\s+(?:to|for))\b/i.test(text)) return 'plan';
  if (/\b(plan|schedule|roadmap|organize|steps|project|timeline)\b/.test(text)) return 'plan';
  if (/\b(build|create|design|make|develop|write|draft|generate)\b/.test(text)) return 'create';
  if (/\b(research|investigate|find|source|learn|understand|explain|analy[sz]e)\b/.test(text)) return 'research';
  return 'explore';
}

function buildIntentPlan(value: string): IntentPlan {
  const request = value.trim().replace(/\s+/g, ' ');
  const kind = classifyIntent(request);
  const actionPattern = /\b(buy|purchase|book|publish|delete|transfer|deploy|submit|pay|post|order|cancel)\b|\b(send|message|email|invite|share)\b.{0,50}\b(to|with|via|through)\b/i;
  const constraints = [
    ...Array.from(request.matchAll(/\b(?:under|below|within|before|after|by|between)\s+[^,.;!?]+/gi), match => match[0].trim()),
    ...Array.from(request.matchAll(/\b(?:using|with|without)\s+[^,.;!?]+/gi), match => match[0].trim()),
  ].slice(0, 4);
  const applicationSubject = request.match(/\b(?:apply|application|admission|admissions)\s+(?:to|for)\s+(.+)$/i)?.[1]?.trim();
  const focus = (applicationSubject || request
    .replace(/^(?:(?:please|can you|could you|i want to|i need to|help me|help us|we need to)\s+)*/i, '')
    .replace(/^(?:research|investigate|find|source|learn|understand|explain|analy[sz]e|plan|schedule|compare|create|build|design|make|develop|write|draft|generate|explore)\s+/i, '')
    .replace(/\b(?:under|below|within|before|after|by|between|using|with|without)\s+[^,.;!?]+/gi, '')
    .trim()
    .replace(/^[,;: -]+|[,;: -]+$/g, '')) || request;
  const outcomeByKind: Record<IntentKind, string> = {
    research: 'A concise evidence-led understanding with sources and unanswered questions',
    plan: 'A sequence of milestones, dependencies, and practical next steps',
    compare: 'A side-by-side evaluation with explicit criteria and trade-offs',
    create: 'A defined deliverable with requirements and a review path',
    explore: 'A clearer direction, useful discoveries, and a concrete next step',
  };
  return {
    kind,
    request,
    focus: focus.slice(0, 180),
    outcome: outcomeByKind[kind],
    constraints,
    steps: ({
      research: ['Clarify the question and scope', 'Gather relevant sources', 'Review evidence and open questions'],
      plan: ['Define the desired outcome', 'Break the work into milestones', 'Identify dependencies and next actions'],
      compare: ['Identify the available options', 'Choose evaluation criteria', 'Compare evidence and trade-offs'],
      create: ['Define the expected output', 'Collect requirements and resources', 'Create and review the result'],
      explore: ['Identify what matters most', 'Explore useful directions', 'Choose a concrete next step'],
    } as Record<IntentKind, string[]>)[kind],
    spaces: ({
      research: ['Source collection', 'Key findings', 'Open questions'],
      plan: ['Milestones', 'Task flow', 'Resources'],
      compare: ['Options', 'Evaluation criteria', 'Decision notes'],
      create: ['Brief', 'Working material', 'Review'],
      explore: ['Starting point', 'Discoveries', 'Next direction'],
    } as Record<IntentKind, string[]>)[kind],
    approvalRequired: actionPattern.test(request),
  };
}

const intentCopy: Record<IntentKind, { title: string; description: string; steps: string[]; spaces: string[] }> = {
  research: {
    title: 'Research workspace',
    description: 'A focused space for gathering useful sources, understanding the topic, and keeping important findings together.',
    steps: ['Clarify the question and scope', 'Gather relevant sources', 'Organize findings and open questions'],
    spaces: ['Source collection', 'Key findings', 'Open questions'],
  },
  plan: {
    title: 'Planning workspace',
    description: 'A structured environment for turning a broad goal into milestones, dependencies, and manageable next steps.',
    steps: ['Define the desired outcome', 'Break the work into milestones', 'Identify dependencies and next actions'],
    spaces: ['Milestones', 'Task flow', 'Resources'],
  },
  compare: {
    title: 'Comparison workspace',
    description: 'A side-by-side environment for evaluating alternatives against clear criteria instead of juggling disconnected tabs.',
    steps: ['Identify the options', 'Choose evaluation criteria', 'Compare evidence and trade-offs'],
    spaces: ['Options', 'Evaluation criteria', 'Decision notes'],
  },
  create: {
    title: 'Creation workspace',
    description: 'A working environment for shaping an idea, collecting the material it needs, and moving toward a finished result.',
    steps: ['Define the output', 'Collect requirements and resources', 'Build and review the result'],
    spaces: ['Brief', 'Working material', 'Review'],
  },
  explore: {
    title: 'Exploration workspace',
    description: 'A flexible space that helps turn an open-ended thought into a clearer direction and useful discoveries.',
    steps: ['Identify what matters most', 'Explore useful directions', 'Choose a concrete next step'],
    spaces: ['Starting point', 'Discoveries', 'Next direction'],
  },
};

export default function ExperienceHome({ onLogout, userEmail }: { onLogout: () => void; userEmail: string }) {
  const [intent, setIntent] = useState('');
  const [activeIntent, setActiveIntent] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [history, setHistory] = useState<SavedIntent[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [sources, setSources] = useState<ExperienceSource[]>([]);
  const [claims, setClaims] = useState<ExperienceClaim[]>([]);
  const [runRefreshKey, setRunRefreshKey] = useState(0);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [sourceReviewFilter, setSourceReviewFilter] = useState<SourceReviewFilter>('all');
  const [sourceNotes, setSourceNotes] = useState<Record<string, string>>({});
  const [reviewSavingUrl, setReviewSavingUrl] = useState('');
  const [checkingUrl, setCheckingUrl] = useState('');
  const [alternativeSearchingUrl, setAlternativeSearchingUrl] = useState('');
  const [reviewSaveNotice, setReviewSaveNotice] = useState('');
  const sourceSaveSequence = useRef(0);
  const [isResolving, setIsResolving] = useState(false);
  const [researchJob, setResearchJob] = useState<ResearchJobSnapshot | null>(null);
  const [jobControlNotice, setJobControlNotice] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [sourceCoverage, setSourceCoverage] = useState('');
  const [sourceSyncStatus, setSourceSyncStatus] = useState<'idle' | 'saved' | 'local'>('idle');
  const [plannerMode, setPlannerMode] = useState<'ai' | 'deterministic'>('deterministic');
  const [showGeospatial, setShowGeospatial] = useState(false);
  const [resolvedPlan, setResolvedPlan] = useState<IntentPlan | null>(null);
  const [guidedTask, setGuidedTask] = useState<GuidedTaskPlan | null>(null);
  const [taskSaveNotice, setTaskSaveNotice] = useState('');
  const resolutionSequence = useRef(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const safe = parsed.filter((item): item is SavedIntent =>
            item && typeof item.id === 'string' &&
            typeof item.intent === 'string' && item.intent.length <= 500 &&
            ['research', 'plan', 'compare', 'create', 'explore'].includes(item.kind) &&
            typeof item.createdAt === 'number'
          ).slice(0, HISTORY_LIMIT);
          setHistory(safe);
        }
      }
    } catch {
      // Storage may be disabled or unavailable; the workspace still works in memory.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Quota/private-mode failures must not block workspace use.
    }
  }, [history, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    let cancelled = false;
    request<{ data: SavedIntent[] }>('/experience/workspaces')
      .then(response => {
        if (cancelled || !Array.isArray(response.data)) return;
        const remote = response.data.filter(item =>
          item && typeof item.id === 'string' && typeof item.intent === 'string' &&
          ['research', 'plan', 'compare', 'create', 'explore'].includes(item.kind) &&
          typeof item.createdAt === 'number'
        );
        setHistory(current => {
          const merged = new Map<string, SavedIntent>();
          for (const item of [...remote, ...current]) merged.set(item.id, item);
          return [...merged.values()]
            .sort((a, b) => b.createdAt - a.createdAt)
            .filter((item, index, all) => all.findIndex(other => other.intent.toLowerCase() === item.intent.toLowerCase()) === index)
            .slice(0, HISTORY_LIMIT);
        });
      })
      .catch(() => {
        // Guests and offline users keep their browser-local workspace history.
      });
    return () => { cancelled = true; };
  }, [storageReady]);

  async function openIntent(value: string, existingWorkspaceId?: string) {
    const trimmed = value.trim().slice(0, 500);
    if (!trimmed) return;
    const resolutionId = ++resolutionSequence.current;
    sourceSaveSequence.current += 1;
    setCheckingUrl('');
    setAlternativeSearchingUrl('');
    setReviewSavingUrl('');
    const intentPlan = buildIntentPlan(trimmed);
    const workspaceId = existingWorkspaceId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Date.now();
    setActiveWorkspaceId(workspaceId);
    setShowGeospatial(false);
    setSourceReviewFilter('all');
    setSourceNotes({});
    setReviewSaveNotice('');
    setIntent(trimmed);
    setActiveIntent(trimmed);
    setShowDetails(true);
    setSources([]);
    setClaims([]);
    setResolveError('');
    setSourceCoverage('');
    setSourceSyncStatus('idle');
    setIsResolving(true);
    setResearchJob(null);
    setJobControlNotice('');
    setPlannerMode('deterministic');
    setResolvedPlan(intentPlan);
    setHistory(current => [
      { id: workspaceId, intent: trimmed, kind: intentPlan.kind, createdAt },
      ...current.filter(item => item.intent.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, HISTORY_LIMIT));
    let activePlan = intentPlan;
    try {
      const resolved = await request<{ data: { plan: IntentPlan; engine?: { mode?: 'ai' | 'deterministic'; provider?: string; model?: string } } }>(
        '/experience/resolve',
        { method: 'POST', body: JSON.stringify({ intent: trimmed }) },
      );
      if (resolutionId !== resolutionSequence.current) return;
      if (resolved.data?.plan) {
        activePlan = resolved.data.plan;
        setResolvedPlan(activePlan);
        setPlannerMode(resolved.data.engine?.mode === 'ai' ? 'ai' : 'deterministic');
        setHistory(current => current.map(item => item.intent.toLowerCase() === trimmed.toLowerCase()
          ? { ...item, kind: activePlan.kind }
          : item));
      }
    } catch {
      // The local intent planner remains available if the optional AI endpoint is unavailable.
    }
    let workspaceSynced = false;
    try {
      await request('/experience/workspaces', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, intent: trimmed, kind: activePlan.kind, createdAt }),
      });
      workspaceSynced = true;
      if (existingWorkspaceId) {
        try {
          const savedTask = await request<{ data: GuidedTaskPlan | null }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/task');
          previousTaskPlan = savedTask.data || null;
        } catch {
          // Older workspaces may not have a saved guided task yet.
        }
      }
    } catch {
      // Guests and offline sessions use the direct public-search fallback.
    }
    const initialTask = buildGuidedTaskPlan(activePlan, [], previousTaskPlan);
    setGuidedTask(initialTask);
    if (workspaceSynced) {
      try {
        const saved = await request<{ data: GuidedTaskPlan }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/task', {
          method: 'PUT', body: JSON.stringify(initialTask),
        });
        setGuidedTask(saved.data);
      } catch {
        setTaskSaveNotice('Progress is available in this session; cloud task sync is unavailable.');
      }
    }
    if (resolutionId !== resolutionSequence.current) return;
    try {
      // Keep the full natural-language request intact from intent resolution through background discovery.
      const query = trimmed;
      let response: ExperienceSearchResponse;
      let freshSources: ExperienceSource[] = [];
      let queuedJob: ResearchJobSnapshot | null = null;
      if (workspaceSynced) {
        try {
          const queued = await request<{ data: ResearchJobSnapshot }>('/experience/jobs', {
            method: 'POST',
            body: JSON.stringify({
              workspaceId, query, plannerKind: activePlan.kind,
              idempotencyKey: window.crypto?.randomUUID?.() || ('job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
            }),
          });
          queuedJob = queued.data;
          setResearchJob(queuedJob);
        } catch {
          // If persistent jobs are unavailable, preserve the existing direct-search experience.
        }
      }
      if (queuedJob) {
        let currentJob = queuedJob;
        let polls = 0;
        while (!['completed', 'failed', 'cancelled', 'paused'].includes(currentJob.status) && polls < 240) {
          await new Promise(resolve => window.setTimeout(resolve, 4000));
          if (resolutionId !== resolutionSequence.current) return;
          const latest = await request<{ data: ResearchJobSnapshot }>('/experience/jobs/' + encodeURIComponent(currentJob.id));
          currentJob = latest.data;
          setResearchJob(currentJob);
          polls += 1;
        }
        if (currentJob.status !== 'completed') {
          const message = currentJob.status === 'paused'
            ? 'Research is paused. Resume it when you are ready.'
            : currentJob.status === 'cancelled'
              ? 'Research was cancelled. Any evidence already saved remains in this workspace.'
              : currentJob.status === 'failed'
                ? (currentJob.errorMessage || 'Research could not be completed after automatic retries.')
                : 'Research is taking longer than expected. Your job is still saved; reopen this workspace to check its status.';
          throw new Error(message);
        }
        const saved = await request<{ data: ExperienceSource[] }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/sources');
        freshSources = Array.isArray(saved.data) ? saved.data.slice(0, 24) : [];
        response = { data: freshSources, meta: {
          coverage: currentJob.coverage,
          successfulSearches: currentJob.successfulSearches,
          providers: currentJob.providerNames,
        } };
      } else {
        response = await request<ExperienceSearchResponse>('/public-search?q=' + encodeURIComponent(query));
        freshSources = Array.isArray(response.data) ? response.data.slice(0, 12) : [];
      }
      if (resolutionId !== resolutionSequence.current) return;
      let savedSources: ExperienceSource[] = [];
      try {
        const saved = await request<{ data: ExperienceSource[] }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/sources');
        savedSources = Array.isArray(saved.data) ? saved.data : [];
      } catch {
        // Guest workspaces and offline sessions do not have cloud source history.
      }
      if (resolutionId !== resolutionSequence.current) return;
      const savedByUrl = new Map(savedSources.map(source => [source.url, source]));
      const mergeReviewState = (source: ExperienceSource): ExperienceSource => {
        const saved = savedByUrl.get(source.url);
        const savedCheckTime = Date.parse(saved?.linkCheck?.checkedAt || '') || 0;
        const freshCheckTime = Date.parse(source.linkCheck?.checkedAt || '') || 0;
        const savedHasCheck = Boolean(saved?.linkCheck && saved.linkCheck.status !== 'not_checked');
        const freshHasCheck = Boolean(source.linkCheck && source.linkCheck.status !== 'not_checked');
        const linkCheck = savedHasCheck && (!freshHasCheck || savedCheckTime >= freshCheckTime)
          ? saved?.linkCheck
          : source.linkCheck || saved?.linkCheck;
        const savedSourceType = saved?.sourceType && saved.sourceType !== 'web' ? saved.sourceType : null;
        return {
          ...source,
          ...(savedSourceType ? { sourceType: savedSourceType } : {}),
          alternativeFor: saved?.alternativeFor || source.alternativeFor || null,
          linkCheck,
          publisher: source.publisher || saved?.publisher || '',
          provider: source.provider || saved?.provider || '',
          providers: [...new Set([...(saved?.providers || []), ...(source.providers || [])])].slice(0, 8),
          reviewStatus: saved?.reviewStatus || 'unreviewed',
          analystNote: saved?.analystNote || '',
          ...(saved?.savedAt ? { savedAt: saved.savedAt } : {}),
        };
      };
      const mergedByUrl = new Map<string, ExperienceSource>(savedSources.slice(0, 24).map(source => [source.url, {
        ...source,
        reviewStatus: source.reviewStatus || 'unreviewed',
        analystNote: source.analystNote || '',
      }]));
      let skippedFreshSources = false;
      for (const source of freshSources) {
        const merged = mergeReviewState(source);
        if (mergedByUrl.has(source.url) || mergedByUrl.size < 24) {
          mergedByUrl.set(source.url, merged);
        } else {
          skippedFreshSources = true;
        }
      }
      const mergedSources = [...mergedByUrl.values()].slice(0, 24);
      if (skippedFreshSources) {
        setReviewSaveNotice('This workspace has reached its 24-source limit. Existing evidence was preserved; create a new workspace to save additional results.');
      }
      setSources(mergedSources);
      setSourceNotes(Object.fromEntries(mergedSources.map(source => [source.url, source.analystNote || ''])));
      if (freshSources.length) {
        try {
          const persisted = await request<{ data: ExperienceSource[] }>(
            '/experience/workspaces/' + encodeURIComponent(workspaceId) + '/sources',
            { method: 'PUT', body: JSON.stringify({ sources: mergedSources }) },
          );
          if (resolutionId === resolutionSequence.current) {
            const normalized = Array.isArray(persisted.data) ? persisted.data : mergedSources;
            setSources(normalized);
            setSourceNotes(Object.fromEntries(normalized.map(source => [source.url, source.analystNote || ''])));
            setSourceSyncStatus('saved');
          }
        } catch {
          if (resolutionId === resolutionSequence.current) setSourceSyncStatus('local');
        }
      } else if (savedSources.length) {
        setSourceSyncStatus('saved');
      }
      if (queuedJob) {
        // The background worker already persisted this run and generated unreviewed claim candidates.
        if (resolutionId === resolutionSequence.current) setRunRefreshKey(value => value + 1);
      } else {
        try {
          const providerNames = Array.from(new Set(mergedSources.flatMap(source => [
            ...(source.providers || []),
            ...(source.provider ? [source.provider] : []),
          ]))).slice(0, 8);
          const runId = window.crypto?.randomUUID?.() || ('run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
          await request('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/runs', {
            method: 'POST',
            body: JSON.stringify({
              runId,
              query,
              plannerKind: activePlan.kind,
              sourceCount: mergedSources.length,
              successfulSearches: Number(response.meta?.successfulSearches || 0),
              providerNames,
              coverage: response.meta?.coverage || '',
            }),
          });
          if (resolutionId === resolutionSequence.current) setRunRefreshKey(value => value + 1);
        } catch {
          // Direct search and source review remain usable if optional run-history sync fails.
        }
      }
      const nextGuidedTask = buildGuidedTaskPlan(activePlan, mergedSources, previousTaskPlan);
      setGuidedTask(nextGuidedTask);
      if (workspaceSynced) {
        try {
          const savedTask = await request<{ data: GuidedTaskPlan }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/task', {
            method: 'PUT', body: JSON.stringify(nextGuidedTask),
          });
          if (resolutionId === resolutionSequence.current) setGuidedTask(savedTask.data);
        } catch {
          if (resolutionId === resolutionSequence.current) setTaskSaveNotice('Task progress is only saved in this session right now.');
        }
      }
      setSourceCoverage(response.meta?.coverage || 'Public search results are limited to available connected providers.');
      if (!mergedSources.length) {
        setResolveError(response.meta?.providerError || 'No public sources were returned. Try a more specific request.');
      }
    } catch (error) {
      if (resolutionId === resolutionSequence.current) setResolveError(error instanceof Error ? error.message : 'Public source discovery is temporarily unavailable.');
    } finally {
      if (resolutionId === resolutionSequence.current) setIsResolving(false);
    }
  }

  async function saveGuidedTask(next: GuidedTaskPlan) {
    setGuidedTask(next);
    setTaskSaveNotice('Saving progress…');
    if (!activeWorkspaceId) {
      setTaskSaveNotice('Progress is kept for this session only.');
      return;
    }
    try {
      const saved = await request<{ data: GuidedTaskPlan }>('/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/task', {
        method: 'PUT', body: JSON.stringify(next),
      });
      setGuidedTask(saved.data);
      setTaskSaveNotice('Progress saved. You can continue this task later.');
    } catch {
      setTaskSaveNotice('Could not sync progress to your workspace. It remains visible in this session.');
    }
  }

  function continueGuidedStep(stepId: string) {
    const step = guidedTask?.steps.find(item => item.id === stepId);
    if (!step) return;
    if (step.sourceUrl) {
      try {
        const url = new URL(step.sourceUrl);
        if (url.protocol === 'https:') window.open(url.href, '_blank', 'noopener,noreferrer');
      } catch {
        // Invalid or unsupported source destinations are never opened.
      }
    }
    const next = {
      ...guidedTask!,
      steps: guidedTask!.steps.map(item => item.id === stepId
        ? { ...item, status: 'in_progress' as const }
        : item.status === 'in_progress' ? { ...item, status: 'next' as const } : item),
      updatedAt: new Date().toISOString(),
    };
    void saveGuidedTask(next);
  }

  async function researchForGuidedStep(stepId: string) {
    const step = guidedTask?.steps.find(item => item.id === stepId);
    if (!step || !activeWorkspaceId || !activeIntent || isResolving) return;
    const focusedQuery = activeIntent + '. Find authoritative, current sources specifically for: ' + step.title + '. Preserve the original institution, programme and constraints.';
    setIsResolving(true);
    setTaskSaveNotice('Searching for evidence for this step…');
    try {
      const queued = await request<{ data: ResearchJobSnapshot }>('/experience/jobs', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          query: focusedQuery,
          plannerKind: resolvedPlan?.kind || 'research',
          idempotencyKey: window.crypto?.randomUUID?.() || ('task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
        }),
      });
      let current = queued.data;
      setResearchJob(current);
      let polls = 0;
      while (!['completed', 'failed', 'cancelled', 'paused'].includes(current.status) && polls < 240) {
        await new Promise(resolve => window.setTimeout(resolve, 4000));
        const latest = await request<{ data: ResearchJobSnapshot }>('/experience/jobs/' + encodeURIComponent(current.id));
        current = latest.data;
        setResearchJob(current);
        polls += 1;
      }
      if (current.status !== 'completed') throw new Error(current.errorMessage || 'ADVERSE could not finish the focused source search.');
      const saved = await request<{ data: ExperienceSource[] }>('/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/sources');
      const nextSources = Array.isArray(saved.data) ? saved.data : [];
      setSources(nextSources);
      setSourceNotes(Object.fromEntries(nextSources.map(item => [item.url, item.analystNote || ''])));
      setSourceSyncStatus('saved');
      setSourceCoverage(current.coverage || '');
      const nextTask = buildGuidedTaskPlan(resolvedPlan || buildIntentPlan(activeIntent), nextSources, guidedTask);
      setGuidedTask(nextTask);
      const savedTask = await request<{ data: GuidedTaskPlan }>('/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/task', {
        method: 'PUT', body: JSON.stringify(nextTask),
      });
      setGuidedTask(savedTask.data);
      setRunRefreshKey(value => value + 1);
      setTaskSaveNotice('Focused search finished. ADVERSE updated the sources and step links.');
    } catch (error) {
      setTaskSaveNotice(error instanceof Error ? error.message : 'Focused research is temporarily unavailable.');
    } finally {
      setIsResolving(false);
    }
  }

  function completeGuidedStep(stepId: string) {
    if (!guidedTask) return;
    const completing = guidedTask.steps.find(item => item.id === stepId)?.status !== 'completed';
    let promoted = false;
    const steps = guidedTask.steps.map(item => {
      if (item.id === stepId) return { ...item, status: completing ? 'completed' as const : 'in_progress' as const };
      if (completing && !promoted && item.status === 'next') {
        promoted = true;
        return { ...item, status: 'in_progress' as const };
      }
      return item;
    });
    const next = { ...guidedTask, steps, updatedAt: new Date().toISOString() };
    void saveGuidedTask(next);
  }

  async function controlResearchJob(action: 'pause' | 'resume' | 'cancel') {
    if (!researchJob?.id) return;
    const controlledWorkspaceId = researchJob.workspaceId;
    setJobControlNotice(action === 'pause' ? 'Pause requested…' : action === 'resume' ? 'Resuming research…' : 'Cancellation requested…');
    try {
      const result = await request<{ data: ResearchJobSnapshot }>('/experience/jobs/' + encodeURIComponent(researchJob.id) + '/' + action, {
        method: 'POST', body: JSON.stringify({}),
      });
      let current = result.data;
      setResearchJob(current);
      if (action === 'resume') {
        setIsResolving(true);
        setJobControlNotice('Research resumed from its latest saved checkpoint.');
        let polls = 0;
        while (!['completed', 'failed', 'cancelled', 'paused'].includes(current.status) && polls < 240) {
          await new Promise(resolve => window.setTimeout(resolve, 4000));
          const latest = await request<{ data: ResearchJobSnapshot }>('/experience/jobs/' + encodeURIComponent(current.id));
          current = latest.data;
          setResearchJob(current);
          polls += 1;
        }
        if (current.status === 'completed' && activeWorkspaceId === controlledWorkspaceId) {
          const saved = await request<{ data: ExperienceSource[] }>('/experience/workspaces/' + encodeURIComponent(controlledWorkspaceId) + '/sources');
          const nextSources = Array.isArray(saved.data) ? saved.data : [];
          setSources(nextSources);
          setSourceNotes(Object.fromEntries(nextSources.map(item => [item.url, item.analystNote || ''])));
          setSourceSyncStatus('saved');
          setSourceCoverage(current.coverage || '');
          setRunRefreshKey(value => value + 1);
          setJobControlNotice('Research completed. Sources are saved in this workspace.');
        } else {
          setJobControlNotice(current.errorMessage || (current.status === 'paused' ? 'Research is paused.' : 'Research did not complete.'));
        }
      } else {
        setJobControlNotice(action === 'pause' ? 'ADVERSE will pause at the next safe checkpoint.' : 'ADVERSE will stop at the next safe checkpoint.');
      }
    } catch (error) {
      setJobControlNotice(error instanceof Error ? error.message : 'The research control could not be applied.');
    } finally {
      if (action === 'resume') setIsResolving(false);
    }
  }

  async function updateSourceReview(url: string, patch: Partial<Pick<ExperienceSource, 'reviewStatus' | 'analystNote'>>) {
    if (!activeWorkspaceId || reviewSavingUrl || checkingUrl || alternativeSearchingUrl) return;
    const sequence = ++sourceSaveSequence.current;
    const nextSources = sources.map(source => source.url === url ? { ...source, ...patch } : source);
    setSources(nextSources);
    setReviewSavingUrl(url);
    setReviewSaveNotice('');
    try {
      const saved = await request<{ data: ExperienceSource[] }>(
        '/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/sources',
        { method: 'PUT', body: JSON.stringify({ sources: nextSources }) },
      );
      if (sequence === sourceSaveSequence.current && Array.isArray(saved.data)) {
        setSources(saved.data.map(source => ({
          ...source,
          reviewStatus: source.reviewStatus || 'unreviewed',
          analystNote: source.analystNote || '',
        })));
        setSourceSyncStatus('saved');
        setReviewSaveNotice('Review saved to this workspace.');
      }
    } catch {
      if (sequence === sourceSaveSequence.current) {
        setSourceSyncStatus('local');
        setReviewSaveNotice('Could not sync this review. Your current changes remain visible in this session.');
      }
    } finally {
      if (sequence === sourceSaveSequence.current) setReviewSavingUrl('');
    }
  }

  async function checkSourceLink(source: ExperienceSource) {
    if (checkingUrl || alternativeSearchingUrl || reviewSavingUrl) return;
    const sequence = ++sourceSaveSequence.current;
    setCheckingUrl(source.url);
    setReviewSaveNotice('');
    try {
      const response = await request<{ data: {
        status: 'reachable' | 'not_confirmed';
        checkedAt: string;
        httpStatus: number | null;
        finalUrl: string | null;
        redirects: Array<{ status: number; from: string; to: string }>;
        note: string;
        title?: string;
        excerpt?: string;
      } }>('/public-search/check-link', {
        method: 'POST',
        body: JSON.stringify({ url: source.url }),
      });
      if (sequence !== sourceSaveSequence.current) return;
      const nextSources = sources.map(item => item.url === source.url ? {
        ...item,
        title: response.data.title || item.title,
        excerpt: response.data.excerpt || item.excerpt,
        linkCheck: {
          status: response.data.status,
          checkedAt: response.data.checkedAt,
          httpStatus: response.data.httpStatus,
          finalUrl: response.data.finalUrl,
          redirects: response.data.redirects || [],
          note: response.data.note || '',
        },
      } : item);
      setSources(nextSources);
      if (activeWorkspaceId) {
        try {
          const saved = await request<{ data: ExperienceSource[] }>(
            '/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/sources',
            { method: 'PUT', body: JSON.stringify({ sources: nextSources }) },
          );
          if (sequence !== sourceSaveSequence.current) return;
          setSources(Array.isArray(saved.data) ? saved.data : nextSources);
          setSourceSyncStatus('saved');
          setReviewSaveNotice('Destination check saved. Reachability describes access at check time, not factual trustworthiness.');
        } catch {
          if (sequence === sourceSaveSequence.current) {
            setSourceSyncStatus('local');
            setReviewSaveNotice('Destination checked for this session, but the result could not be synced to the account.');
          }
        }
      } else {
        setSourceSyncStatus('local');
        setReviewSaveNotice('Destination check is available in this session only.');
      }
    } catch {
      if (sequence === sourceSaveSequence.current) {
        setReviewSaveNotice('ADVERSE could not complete this link check. That does not prove the destination is dead.');
      }
    } finally {
      if (sequence === sourceSaveSequence.current) setCheckingUrl('');
    }
  }

  async function findAlternatives(source: ExperienceSource) {
    if (alternativeSearchingUrl || checkingUrl || reviewSavingUrl) return;
    const sequence = ++sourceSaveSequence.current;
    const availableSlots = 24 - sources.length;
    if (availableSlots <= 0) {
      setReviewSaveNotice('This workspace has reached its 24-source limit. Start a new workspace to collect more alternatives.');
      return;
    }
    const query = [activeIntent, source.title, source.publisher].filter(Boolean).join(' ').slice(0, 200);
    if (query.length < 2) return;
    setAlternativeSearchingUrl(source.url);
    setReviewSaveNotice('');
    try {
      const response = await request<ExperienceSearchResponse>('/public-search?q=' + encodeURIComponent(query));
      if (sequence !== sourceSaveSequence.current) return;
      const originalHostname = new URL(source.url).hostname.toLowerCase();
      const originalHost = originalHostname.startsWith('www.') ? originalHostname.slice(4) : originalHostname;
      const existingUrls = new Set(sources.map(item => item.url));
      const candidates = (Array.isArray(response.data) ? response.data : []).filter(candidate => {
        try {
          const parsed = new URL(candidate.url);
          const candidateHostname = parsed.hostname.toLowerCase();
          const host = candidateHostname.startsWith('www.') ? candidateHostname.slice(4) : candidateHostname;
          return candidate.url !== source.url && host !== originalHost && !existingUrls.has(candidate.url);
        } catch {
          return false;
        }
      }).slice(0, availableSlots);
      if (!candidates.length) {
        setReviewSaveNotice('No distinct alternative destinations were found. A failed automated check is not proof that the original site is dead.');
        return;
      }
      const additions: ExperienceSource[] = candidates.map(candidate => ({
        ...candidate,
        sourceType: 'alternative',
        alternativeFor: source.url,
        reviewStatus: 'unreviewed',
        analystNote: '',
      }));
      const nextSources = [...sources, ...additions].slice(0, 24);
      let syncedToWorkspace = false;
      setSources(nextSources);
      try {
        const saved = await request<{ data: ExperienceSource[] }>(
          '/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/sources',
          { method: 'PUT', body: JSON.stringify({ sources: nextSources }) },
        );
        if (sequence !== sourceSaveSequence.current) return;
        setSources(Array.isArray(saved.data) ? saved.data : nextSources);
        setSourceSyncStatus('saved');
        syncedToWorkspace = true;
      } catch {
        if (sequence === sourceSaveSequence.current) setSourceSyncStatus('local');
      }
      if (sequence === sourceSaveSequence.current && activeWorkspaceId) {
        const runId = window.crypto?.randomUUID?.() || ('alternatives-' + Date.now());
        await request('/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/runs', {
          method: 'POST',
          body: JSON.stringify({
            runId,
            query,
            plannerKind: 'explore',
            sourceCount: Math.min(additions.length, 12),
            successfulSearches: Math.max(0, Math.min(response.meta?.successfulSearches || 0, 20)),
            providerNames: (response.meta?.providers || []).slice(0, 8),
            coverage: (response.meta?.coverage || 'Alternative candidates found from public search.').slice(0, 500),
          }),
        }).catch(() => undefined);
        setRunRefreshKey(value => value + 1);
      }
      if (sequence !== sourceSaveSequence.current) return;
      const reachable = additions.filter(item => item.linkCheck?.status === 'reachable').length;
      const persistence = syncedToWorkspace ? 'saved to this workspace' : 'available in this session only';
      setReviewSaveNotice(`Added ${additions.length} alternative candidate(s), ${persistence}; ${reachable} were reachable when checked. Candidates are not endorsements or fact verification.`);
    } catch {
      if (sequence === sourceSaveSequence.current) {
        setReviewSaveNotice('Alternative search is temporarily unavailable. The original source remains in your workspace.');
      }
    } finally {
      if (sequence === sourceSaveSequence.current) setAlternativeSearchingUrl('');
    }
  }

  async function saveGeospatialSource(
    title: string,
    url: string,
    excerpt: string,
    publisher: string,
    sourceType: 'organization' | 'domain' | 'document',
  ): Promise<boolean> {
    if (!activeWorkspaceId || !url || checkingUrl || alternativeSearchingUrl || reviewSavingUrl) return false;
    const sequence = ++sourceSaveSequence.current;
    if (sources.some(source => source.url === url)) return true;
    if (sources.length >= 24) {
      setReviewSaveNotice('This workspace has reached its 24-source limit. Start a new workspace before saving more public event observations.');
      return false;
    }
    const source: ExperienceSource = {
      title: title.slice(0, 240),
      url,
      excerpt: excerpt.slice(0, 2000),
      publisher: publisher.slice(0, 180),
      provider: publisher.slice(0, 120),
      sourceType,
      retrievedAt: new Date().toISOString(),
      reviewStatus: 'unreviewed',
      analystNote: '',
    };
    const nextSources = [...sources, source];
    setSources(nextSources);
    try {
      const saved = await request<{ data: ExperienceSource[] }>(
        '/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/sources',
        { method: 'PUT', body: JSON.stringify({ sources: nextSources }) },
      );
      if (sequence !== sourceSaveSequence.current) return false;
      const normalized = Array.isArray(saved.data) ? saved.data : nextSources;
      setSources(normalized);
      setSourceNotes(Object.fromEntries(normalized.map(item => [item.url, item.analystNote || ''])));
      setSourceSyncStatus('saved');
      setReviewSaveNotice('Public event observation saved to this workspace.');
      return true;
    } catch {
      if (sequence === sourceSaveSequence.current) {
        setSourceNotes(current => ({ ...current, [source.url]: '' }));
        setSourceSyncStatus('local');
        setReviewSaveNotice('Public event observation is saved for this session only; account sync is unavailable.');
        return true;
      }
      return false;
    }
  }

  const reviewCounts = useMemo(() => ({
    all: sources.length,
    unreviewed: sources.filter(source => !source.reviewStatus || source.reviewStatus === 'unreviewed').length,
    useful: sources.filter(source => source.reviewStatus === 'useful').length,
    not_relevant: sources.filter(source => source.reviewStatus === 'not_relevant').length,
  }), [sources]);
  const filteredSources = useMemo(
    () => sourceReviewFilter === 'all'
      ? sources
      : sources.filter(source => (source.reviewStatus || 'unreviewed') === sourceReviewFilter),
    [sources, sourceReviewFilter],
  );

  function removeIntent(id: string) {
    setHistory(current => current.filter(item => item.id !== id));
    void request('/experience/workspaces/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {
      // Browser-local removal remains immediate if cloud sync is unavailable.
    });
  }
  const localPlan = useMemo(() => buildIntentPlan(activeIntent), [activeIntent]);
  const plan = resolvedPlan?.request === activeIntent ? resolvedPlan : localPlan;
  const kind = plan.kind;
  const workspace = intentCopy[kind];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openIntent(intent);
  }

  return (
    <main className="experience-shell">
      <div className="experience-ambient" aria-hidden="true">
        <div className="experience-orbit orbit-one" />
        <div className="experience-orbit orbit-two" />
        <div className="experience-core"><span /></div>
        <div className="experience-node node-one" />
        <div className="experience-node node-two" />
        <div className="experience-node node-three" />
      </div>

      <header className="experience-topbar">
        <a className="experience-brand" href="/experience" aria-label="ADVERSE experience home">
          <span className="experience-brand-mark"><Network size={18} /></span>
          <span>ADVERSE<small>BEYOND BROWSING</small></span>
        </a>
        <div className="experience-top-actions">
          <span className="experience-mode"><i /> YOUR RESEARCH WORKSPACE</span>
          <span className="experience-account" title={userEmail}>{userEmail}</span><button className="experience-signout" type="button" onClick={onLogout}>Sign out <LogOut size={14} /></button>
        </div>
      </header>

      <section className="experience-hero">
        <div className="experience-kicker"><Sparkles size={14} /> THE INTERNET, ARRANGED AROUND YOUR INTENT</div>
        <h1>Stop searching for pages.<br /><span>Start with what you want to do.</span></h1>
        <p className="experience-lede">Tell ADVERSE what you are trying to accomplish. Your workspace should form around the task — not the other way around.</p>

        <form className="experience-intent-form" onSubmit={submit}>
          <div className="experience-input-icon"><Compass size={20} /></div>
          <label className="experience-sr-only" htmlFor="adverse-intent">What do you want to accomplish?</label>
          <input
            id="adverse-intent"
            value={intent}
            onChange={event => setIntent(event.target.value)}
            placeholder="Tell ADVERSE what you need to accomplish…"
            maxLength={500}
          />
          {intent && <button className="experience-clear" type="button" aria-label="Clear intent" onClick={() => setIntent('')}><X size={16} /></button>}
          <button className="experience-submit" type="submit" disabled={!intent.trim()}>Start investigation <ArrowRight size={16} /></button>
        </form>
        <div className="experience-input-foot"><span><Search size={12} /> Start with an outcome, question, or task</span><span>Up to 500 characters</span></div>

        {!showDetails ? (
          <>
          <div className="experience-examples">
            <div className="experience-examples-label">START WITH AN EXAMPLE</div>
            <div className="experience-example-grid">
              {examples.map(item => {
                const Icon = item.icon;
                return <button key={item.label} className="experience-example" type="button" onClick={() => openIntent(item.prompt)}>
                  <span className="experience-example-icon"><Icon size={17} /></span>
                  <span>{item.label}</span><ArrowUpRight size={14} />
                </button>;
              })}
            </div>
          </div>
          {history.length > 0 && <section className="experience-history">
            <div className="experience-history-head"><span className="experience-section-label"><Clock3 size={13} /> RECENT WORKSPACES</span><span>{history.length} saved · syncs when signed in</span></div>
            <div className="experience-history-list">
              {history.map(item => <div className="experience-history-item" key={item.id}>
                <button type="button" className="experience-history-open" onClick={() => openIntent(item.intent, item.id)}>
                  <span className="experience-history-kind">{item.kind.toUpperCase()}</span>
                  <span className="experience-history-text">{item.intent}</span>
                  <ArrowUpRight size={14} />
                </button>
                <button type="button" className="experience-history-delete" aria-label={`Delete saved workspace: ${item.intent}`} onClick={() => removeIntent(item.id)}><Trash2 size={14} /></button>
              </div>)}
            </div>
          </section>}
          </>
        ) : (
          <section className="experience-workspace" aria-live="polite">
            <div className="experience-workspace-head">
              <div><span className="experience-section-label"><i /> WORKSPACE FOR YOUR INTENT</span><h2>{workspace.title}</h2></div>
              <button type="button" className="experience-reset" onClick={() => { setShowDetails(false); setActiveIntent(''); setActiveWorkspaceId(''); setIntent(''); setSources([]); setClaims([]); setSourceNotes({}); setSourceReviewFilter('all'); setResolveError(''); setSourceCoverage(''); setResolvedPlan(null); setPlannerMode('deterministic'); setResearchJob(null); setJobControlNotice(''); setShowGeospatial(false); }}><Plus size={14} /> New intent</button>
            </div>
            <p className="experience-intent-echo">“{activeIntent}”</p>
            <div className="experience-intent-blueprint">
              <div className="experience-blueprint-item">
                <span>DETECTED FOCUS</span>
                <strong>{plan.focus}</strong>
              </div>
              <div className="experience-blueprint-item">
                <span>EXPECTED OUTCOME</span>
                <strong>{plan.outcome}</strong>
              </div>
              {plan.constraints.length > 0 && <div className="experience-blueprint-item experience-blueprint-wide">
                <span>REQUESTED CONSTRAINTS</span>
                <div className="experience-constraint-list">{plan.constraints.map(item => <span key={item}>{item}</span>)}</div>
              </div>}
            </div>
            <div className="experience-planner-mode"><span>INTENT PLANNER</span><strong>{plannerMode === 'ai' ? (plan.providerLabel || 'Groq / Gemini semantic planner') : 'Local semantic planner'}</strong></div>
            {plan.approvalRequired && <div className="experience-approval-note"><Sparkles size={14} /> This request appears to involve an external action. ADVERSE will require your explicit review and approval before any connected service can act.</div>}
            <p className="experience-workspace-description">{workspace.description}</p>
            <section className="experience-journey" aria-labelledby="experience-journey-title" aria-live="polite">
              <div className="experience-journey-heading">
                <div><span className="experience-section-label">YOUR INVESTIGATION</span><h3 id="experience-journey-title">Progress at a glance</h3></div>
                <span className="experience-journey-state">{researchJob?.status === 'completed' ? 'Research complete' : researchJob?.status === 'paused' ? 'Paused' : researchJob?.status === 'failed' ? 'Needs attention' : isResolving ? 'Working on your request' : resolveError ? 'Needs attention' : sources.length ? 'Discovery complete' : 'Ready to begin'}</span>
              </div>
              {researchJob && <div className="experience-job-progress">
                <div className="experience-job-progress-label"><span>{researchJob.stage === 'queued' ? 'Waiting for a research worker' : researchJob.stage === 'completed' ? 'Research saved to workspace' : researchJob.stage === 'failed' ? 'Research stopped' : researchJob.stage === 'paused' ? 'Research paused' : 'ADVERSE · ' + researchJob.stage}</span><strong>{researchJob.progress}%</strong></div>
                <div className="experience-job-progress-track"><span style={{ width: researchJob.progress + '%' }} /></div>
                <small>{researchJob.successfulSearches} successful provider searches · {researchJob.sourceCount} saved sources · {researchJob.attempts || 0} attempt(s)</small>
              </div>}
              {researchJob && <div className="experience-job-controls">
                {['queued', 'running'].includes(researchJob.status) && <button type="button" onClick={() => void controlResearchJob('pause')}>Pause research</button>}
                {researchJob.status === 'paused' && <button type="button" onClick={() => void controlResearchJob('resume')}>Resume research</button>}
                {['queued', 'running', 'paused'].includes(researchJob.status) && <button type="button" onClick={() => void controlResearchJob('cancel')}>Cancel</button>}
              </div>}
              {jobControlNotice && <p className="experience-job-control-notice" role="status">{jobControlNotice}</p>}
              <ol className="experience-journey-steps">
                <li className="is-complete">
                  <span className="experience-journey-marker">1</span>
                  <div><strong>Understand the request</strong><small>{plannerMode === 'ai' ? (plan.providerLabel || 'AI intent planner') : 'Local semantic fallback'} · {plan.focus}</small></div>
                  <span className="experience-journey-status">READY</span>
                </li>
                <li className={isResolving ? 'is-active' : resolveError ? 'is-error' : sources.length ? 'is-complete' : 'is-pending'}>
                  <span className="experience-journey-marker">2</span>
                  <div><strong>Discover public sources</strong><small>{researchJob ? researchJob.stage + ' · ' + researchJob.progress + '% complete' : isResolving ? 'Searching connected public providers…' : resolveError ? 'Search needs another attempt' : sources.length ? sources.length + ' source candidates collected' : 'Waiting to search'}</small></div>
                  <span className="experience-journey-status">{isResolving ? 'IN PROGRESS' : resolveError ? 'RETRY' : sources.length ? 'DONE' : 'NEXT'}</span>
                </li>
                <li className={sources.length && reviewCounts.unreviewed === 0 ? 'is-complete' : sources.length ? 'is-active' : 'is-pending'}>
                  <span className="experience-journey-marker">3</span>
                  <div><strong>Review and organize evidence</strong><small>{sources.length ? reviewCounts.unreviewed + ' still need review · ' + reviewCounts.useful + ' marked useful' : 'Source review begins when results arrive'}</small></div>
                  <span className="experience-journey-status">{sources.length ? reviewCounts.unreviewed ? 'REVIEW' : 'DONE' : 'LOCKED'}</span>
                </li>
                <li className={claims.length > 0 ? 'is-active' : 'is-pending'}>
                  <span className="experience-journey-marker">4</span>
                  <div><strong>Build a cited research brief</strong><small>{claims.length ? claims.length + ' claim record(s) available to include' : 'Prepare the outcome from reviewed sources and linked evidence'}</small></div>
                  <span className="experience-journey-status">{claims.length ? 'READY' : 'NEXT'}</span>
                </li>
              </ol>
              <p className="experience-journey-next"><strong>Recommended next step:</strong> {isResolving ? 'ADVERSE is collecting sources. You can review the plan while it works.' : resolveError ? 'Retry the search or narrow the request if providers returned no usable results.' : !sources.length ? 'Start with a question or task above to begin an investigation.' : reviewCounts.unreviewed ? 'Open the original sources and mark the useful ones. ADVERSE keeps unreviewed material separate from verified findings.' : 'Use the dossier tools below to prepare a source-linked brief.'}</p>
            </section>
            {guidedTask && <section className="experience-task-guide" aria-labelledby="experience-task-guide-title">
              <div className="experience-task-guide-head">
                <div><span className="experience-section-label"><Workflow size={13} /> GUIDED TASK</span><h3 id="experience-task-guide-title">{guidedTask.title}</h3></div>
                <span>{guidedTask.steps.filter(step => step.status === 'completed').length}/{guidedTask.steps.length} complete</span>
              </div>
              <p>{guidedTask.summary}</p>
              <ol className="experience-task-steps">
                {guidedTask.steps.map((step, index) => <li key={step.id} className={step.status === 'completed' ? 'is-done' : step.status === 'in_progress' ? 'is-current' : ''}>
                  <span className="experience-task-step-number">{step.status === 'completed' ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span>
                  <div className="experience-task-step-body">
                    <strong>{step.title}</strong>
                    <p>{step.instruction}</p>
                    {step.sourceUrl && <a href={step.sourceUrl} target="_blank" rel="noopener noreferrer">{step.sourceTitle || 'Open relevant source'} <ArrowUpRight size={12} /></a>}
                    {!step.sourceUrl && !isResolving && <small className="experience-task-no-source">No sufficiently relevant source is linked yet. ADVERSE can run a focused follow-up search for this step.</small>}
                  </div>
                  <div className="experience-task-step-actions">
                    {step.sourceUrl && <button type="button" onClick={() => continueGuidedStep(step.id)}>{step.status === 'in_progress' ? 'Continue' : 'Open step'}</button>}
                    {!step.sourceUrl && <button type="button" disabled={isResolving} onClick={() => void researchForGuidedStep(step.id)}>Find source</button>}
                    <button type="button" className="experience-task-complete" onClick={() => completeGuidedStep(step.id)}>{step.status === 'completed' ? 'Reopen' : 'Mark done'}</button>
                  </div>
                </li>)}
              </ol>
              {taskSaveNotice && <small className="experience-task-save-notice" role="status">{taskSaveNotice}</small>}
            </section>}
            <details className="experience-advanced-tools">
              <summary>Advanced research tools <span>Coverage · 3D globe · claims · exports · history · sharing</span></summary>
              <div className="experience-advanced-tools-content">
                <div className="experience-workspace-grid">
                  <div className="experience-plan">
                    <span className="experience-section-label">RESEARCH FLOW</span>
                    {plan.steps.map((step, index) => <div className="experience-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><b>{step}</b></div>)}
                  </div>
                  <div className="experience-spaces">
                    <span className="experience-section-label">WORKING SPACES</span>
                    {plan.spaces.map((space, index) => <div className="experience-space" key={space}><span>{index === 0 ? <FileSearch size={15} /> : index === 1 ? <Layers3 size={15} /> : <Compass size={15} />}</span>{space}<ArrowUpRight size={13} /></div>)}
                  </div>
                </div>
                <ExperienceCoveragePanel sources={sources} />
                <section className="experience-geospatial-launch" aria-labelledby="experience-geospatial-title">
              <div>
                <span className="experience-section-label"><Globe2 size={13} /> PUBLIC-EVENT GEOSPATIAL INTELLIGENCE</span>
                <h3 id="experience-geospatial-title">Explore the public world in 3D</h3>
                <p>View attributed USGS earthquake and NASA natural-event observations on a 3D globe. Locations may be approximate; this is not personal-location tracking.</p>
              </div>
              <button type="button" className="experience-extension-primary" aria-expanded={showGeospatial} aria-controls="experience-geospatial-view" onClick={() => setShowGeospatial(value => !value)}>
                <Globe2 size={14} /> {showGeospatial ? 'Hide 3D globe' : 'Open 3D globe'}
              </button>
            </section>
            {showGeospatial && <div id="experience-geospatial-view" className="experience-geospatial-view">
              <Suspense fallback={<div className="experience-constellation-loading">Preparing the public geospatial workspace…</div>}>
                <GeospatialIntelligencePanel onSave={saveGeospatialSource} canSave={Boolean(activeWorkspaceId)} />
              </Suspense>
            </div>}
            {activeWorkspaceId && <>
              <ExperienceClaimsPanel key={activeWorkspaceId} workspaceId={activeWorkspaceId} sources={sources} onClaimsChange={setClaims} refreshKey={runRefreshKey} />
              <ExperienceDossierActions workspaceId={activeWorkspaceId} intent={activeIntent} sources={sources} claims={claims} />
              <ExperienceRunHistoryPanel workspaceId={activeWorkspaceId} refreshKey={runRefreshKey} />
              <WorkspaceAccessDocuments workspaceId={activeWorkspaceId} />
            </>}
              </div>
            </details>
            <section className="experience-live-sources" aria-live="polite">
              <div className="experience-live-sources-head">
                <span className="experience-section-label"><i /> LIVE PUBLIC DISCOVERY</span>
                <span>{isResolving ? 'Searching public sources…' : sources.length ? `${sources.length} sources · ${sourceSyncStatus === 'saved' ? 'workspace synced' : sourceSyncStatus === 'local' ? 'local session' : 'results ready'}` : 'Source discovery'}</span>
              </div>
              {isResolving && <div className="experience-source-loading"><span /> Querying available public search providers and checking result metadata.</div>}
              {!isResolving && resolveError && <p className="experience-source-error">{resolveError}</p>}
              {!isResolving && sources.length > 0 && <ExperienceConstellation intent={activeIntent} sources={sources} claims={claims} />}
              {!isResolving && sources.length > 0 && <>
                <div className="experience-review-toolbar" role="group" aria-label="Filter sources by review state">
                  {([
                    ['all', 'All', reviewCounts.all],
                    ['unreviewed', 'Unreviewed', reviewCounts.unreviewed],
                    ['useful', 'Useful', reviewCounts.useful],
                    ['not_relevant', 'Not relevant', reviewCounts.not_relevant],
                  ] as Array<[SourceReviewFilter, string, number]>).map(([filter, label, count]) => (
                    <button
                      key={filter}
                      type="button"
                      className={sourceReviewFilter === filter ? 'active' : ''}
                      aria-pressed={sourceReviewFilter === filter}
                      onClick={() => setSourceReviewFilter(filter)}
                    >
                      {label}<span>{count}</span>
                    </button>
                  ))}
                </div>
                {filteredSources.length > 0 ? <div className="experience-source-list">
                  {filteredSources.map((source) => {
                    const reviewStatus = source.reviewStatus || 'unreviewed';
                    const sourceSaving = reviewSavingUrl === source.url;
                    const noteDraft = sourceNotes[source.url] ?? source.analystNote ?? '';
                    return <article className="experience-source-card" key={source.url}>
                      <div className="experience-source-index">{String(sources.findIndex(item => item.url === source.url) + 1).padStart(2, '0')}</div>
                      <div className="experience-source-content">
                        <div className="experience-source-title-row">
                          <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}<ArrowUpRight size={13} /></a>
                          <span className={'experience-review-status status-' + reviewStatus.replace('_', '-')}>{reviewStatus === 'not_relevant' ? 'NOT RELEVANT' : reviewStatus.toUpperCase()}</span>
                        </div>
                        <span>{source.publisher || source.provider || 'Public source'} · {source.linkCheck?.status === 'reachable' ? 'Reachable when checked' : source.linkCheck?.status === 'not_confirmed' ? 'Reachability not confirmed' : 'Not checked'}{source.linkCheck?.httpStatus ? ' · HTTP ' + source.linkCheck.httpStatus : ''}{source.linkCheck?.redirects?.length ? ' · ' + source.linkCheck.redirects.length + ' redirect(s)' : ''}{source.providers?.length ? ' · ' + source.providers.length + ' provider matches' : ''}</span>
                        {source.alternativeFor && <p className="experience-source-alternative">ALTERNATIVE CANDIDATE · Found as a possible alternative to <a href={source.alternativeFor} target="_blank" rel="noreferrer">{source.alternativeFor}</a></p>}
                        {source.linkCheck?.finalUrl && source.linkCheck.finalUrl !== source.url && <p className="experience-source-final-url">Final destination: <a href={source.linkCheck.finalUrl} target="_blank" rel="noreferrer">{source.linkCheck.finalUrl}</a></p>}
                        {source.linkCheck?.note && <p className="experience-source-link-note">{source.linkCheck.note}</p>}
                        {source.excerpt && <p>{source.excerpt.slice(0, 280)}</p>}
                        <div className="experience-source-review-actions" aria-label={'Review source: ' + (source.title || source.url)}>
                          <button type="button" className="reset" disabled={Boolean(checkingUrl) || Boolean(alternativeSearchingUrl) || Boolean(reviewSavingUrl)} onClick={() => void checkSourceLink(source)}>{checkingUrl === source.url ? 'Checking…' : source.linkCheck?.status === 'not_checked' ? 'Check link' : 'Recheck link'}</button>
                          {source.linkCheck?.status !== 'reachable' && source.sourceType !== 'alternative' && <button type="button" className="reset" disabled={Boolean(checkingUrl) || Boolean(alternativeSearchingUrl) || Boolean(reviewSavingUrl)} onClick={() => void findAlternatives(source)}>{alternativeSearchingUrl === source.url ? 'Finding…' : 'Find alternatives'}</button>}
                          <button type="button" className={reviewStatus === 'useful' ? 'selected' : ''} disabled={Boolean(reviewSavingUrl) || Boolean(checkingUrl) || Boolean(alternativeSearchingUrl)} onClick={() => void updateSourceReview(source.url, { reviewStatus: 'useful' })}><Check size={13} /> Useful</button>
                          <button type="button" className={reviewStatus === 'not_relevant' ? 'selected' : ''} disabled={Boolean(reviewSavingUrl) || Boolean(checkingUrl) || Boolean(alternativeSearchingUrl)} onClick={() => void updateSourceReview(source.url, { reviewStatus: 'not_relevant' })}><X size={13} /> Not relevant</button>
                          <button type="button" className="reset" disabled={Boolean(reviewSavingUrl) || Boolean(checkingUrl) || Boolean(alternativeSearchingUrl) || reviewStatus === 'unreviewed'} onClick={() => void updateSourceReview(source.url, { reviewStatus: 'unreviewed' })}>Reset</button>
                          {sourceSaving && <span className="experience-review-saving">Saving…</span>}
                        </div>
                        <label className="experience-source-note">
                          <span>ANALYST NOTE <small>Private to this workspace</small></span>
                          <textarea
                            value={noteDraft}
                            maxLength={1000}
                            rows={2}
                            aria-label={'Analyst note for ' + (source.title || source.url)}
                            placeholder="Record why this source matters or what still needs checking…"
                            onChange={event => setSourceNotes(current => ({ ...current, [source.url]: event.target.value }))}
                          />
                          <button
                            type="button"
                            disabled={Boolean(reviewSavingUrl) || noteDraft === (source.analystNote || '')}
                            onClick={() => {
                              const note = noteDraft.trim();
                              setSourceNotes(current => ({ ...current, [source.url]: note }));
                              void updateSourceReview(source.url, { analystNote: note });
                            }}
                          >Save note</button>
                        </label>
                      </div>
                    </article>;
                  })}
                </div> : <div className="experience-review-empty">No sources match this review filter.</div>}
              </>}
              {!isResolving && sources.length > 0 && <ExperienceSourceTimeline sources={sources} />}
              {sourceCoverage && <p className="experience-source-coverage">{sourceCoverage}</p>}
              {reviewSaveNotice && <p className="experience-review-save-notice" role="status">{reviewSaveNotice}</p>}
              <p className="experience-source-disclaimer">Review labels are your triage decisions, not factual verdicts or proof. Search results are leads, not verified facts. Open original sources and assess their context. ADVERSE does not execute purchases, bookings, messages, deployments, or other external actions from this preview.</p>
            </section>
          </section>
        )}
      </section>

      <footer className="experience-footer">
        <span>ADVERSE <i>•</i> A new way to work with the open internet</span>
        <span>Intent first. Experience follows.</span>
      </footer>
    </main>
  );
}
