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
import ExperienceSourceTimeline from './ExperienceSourceTimeline';
import type { ExperienceClaim, ExperienceSource } from './experience-types';
import './experience-home.css';

const GeospatialIntelligencePanel = lazy(() => import('../geospatial/GeospatialIntelligencePanel'));

type IntentKind = 'research' | 'plan' | 'compare' | 'create' | 'explore';
type SavedIntent = { id: string; intent: string; kind: IntentKind; createdAt: number };
type SourceReviewStatus = 'unreviewed' | 'useful' | 'not_relevant';
type SourceReviewFilter = 'all' | SourceReviewStatus;

type ExperienceSearchResponse = { data: ExperienceSource[]; meta?: { coverage?: string; providerError?: string; successfulSearches?: number; providers?: string[] } };
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
};

function classifyIntent(value: string): IntentKind {
  const text = value.toLowerCase();
  if (/\b(compare|versus|vs\.?|difference|better than|pros and cons)\b/.test(text)) return 'compare';
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
    ...Array.from(request.matchAll(/\b(?:under|below|within|before|after|by|between|for)\s+[^,.;!?]+/gi), match => match[0].trim()),
    ...Array.from(request.matchAll(/\b(?:using|with|without)\s+[^,.;!?]+/gi), match => match[0].trim()),
  ].slice(0, 4);
  const focus = request
    .replace(/^(?:(?:please|can you|could you|i want to|i need to|help me|help us|we need to)\s+)*/i, '')
    .replace(/^(?:research|investigate|find|source|learn|understand|explain|analy[sz]e|plan|schedule|compare|create|build|design|make|develop|write|draft|generate|explore)\s+/i, '')
    .replace(/\b(?:under|below|within|before|after|by|between|for|using|with|without)\s+[^,.;!?]+/gi, '')
    .trim()
    .replace(/^[,;: -]+|[,;: -]+$/g, '') || request;
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
  const [resolveError, setResolveError] = useState('');
  const [sourceCoverage, setSourceCoverage] = useState('');
  const [sourceSyncStatus, setSourceSyncStatus] = useState<'idle' | 'saved' | 'local'>('idle');
  const [plannerMode, setPlannerMode] = useState<'gemini' | 'deterministic'>('deterministic');
  const [showGeospatial, setShowGeospatial] = useState(false);
  const [resolvedPlan, setResolvedPlan] = useState<IntentPlan | null>(null);
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
    setPlannerMode('deterministic');
    setResolvedPlan(intentPlan);
    setHistory(current => [
      { id: workspaceId, intent: trimmed, kind: intentPlan.kind, createdAt },
      ...current.filter(item => item.intent.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, HISTORY_LIMIT));
    let activePlan = intentPlan;
    try {
      const resolved = await request<{ data: { plan: IntentPlan; engine?: { mode?: 'gemini' | 'deterministic'; provider?: string; model?: string } } }>(
        '/experience/resolve',
        { method: 'POST', body: JSON.stringify({ intent: trimmed }) },
      );
      if (resolutionId !== resolutionSequence.current) return;
      if (resolved.data?.plan) {
        activePlan = resolved.data.plan;
        setResolvedPlan(activePlan);
        setPlannerMode(resolved.data.engine?.mode === 'gemini' ? 'gemini' : 'deterministic');
        setHistory(current => current.map(item => item.intent.toLowerCase() === trimmed.toLowerCase()
          ? { ...item, kind: activePlan.kind }
          : item));
      }
    } catch {
      // The local intent planner remains available if the optional AI endpoint is unavailable.
    }
    try {
      await request('/experience/workspaces', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, intent: trimmed, kind: activePlan.kind, createdAt }),
      });
    } catch {
      // Signed-out users retain local history; authenticated users sync when the API is available.
    }
    if (resolutionId !== resolutionSequence.current) return;
    try {
      const query = activePlan.focus.length >= 2 ? activePlan.focus : trimmed;
      const response = await request<ExperienceSearchResponse>('/public-search?q=' + encodeURIComponent(query));
      if (resolutionId !== resolutionSequence.current) return;
      const freshSources = Array.isArray(response.data) ? response.data.slice(0, 12) : [];
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
        return {
          ...source,
          reviewStatus: saved?.reviewStatus || 'unreviewed',
          analystNote: saved?.analystNote || '',
          ...(saved?.savedAt ? { savedAt: saved.savedAt } : {}),
        };
      };
      const mergedByUrl = new Map(savedSources.slice(0, 24).map(source => [source.url, {
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
        // Search and source review remain usable if the optional run-history record cannot sync.
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
          setSourceSyncStatus('local');
          setReviewSaveNotice('Destination checked for this session, but the result could not be synced to the account.');
        }
      } else {
        setSourceSyncStatus('local');
        setReviewSaveNotice('Destination check is available in this session only.');
      }
    } catch {
      setReviewSaveNotice('ADVERSE could not complete this link check. That does not prove the destination is dead.');
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
      setSources(nextSources);
      try {
        const saved = await request<{ data: ExperienceSource[] }>(
          '/experience/workspaces/' + encodeURIComponent(activeWorkspaceId) + '/sources',
          { method: 'PUT', body: JSON.stringify({ sources: nextSources }) },
        );
        if (sequence !== sourceSaveSequence.current) return;
        setSources(Array.isArray(saved.data) ? saved.data : nextSources);
        setSourceSyncStatus('saved');
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
      const reachable = additions.filter(item => item.linkCheck?.status === 'reachable').length;
      setReviewSaveNotice(`Added ${additions.length} alternative candidate(s); ${reachable} were reachable when checked. Candidates are not endorsements or fact verification.`);
    } catch {
      setReviewSaveNotice('Alternative search is temporarily unavailable. The original source remains in your workspace.');
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
        setSourceSyncStatus('local');
        setReviewSaveNotice('The event could not be synced. It has not been marked as saved.');
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
          <span className="experience-mode"><i /> INTELLIGENCE ENVIRONMENT</span>
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
            placeholder="I want to research, plan, compare, create..."
            maxLength={500}
          />
          {intent && <button className="experience-clear" type="button" aria-label="Clear intent" onClick={() => setIntent('')}><X size={16} /></button>}
          <button className="experience-submit" type="submit" disabled={!intent.trim()}>Shape workspace <ArrowRight size={16} /></button>
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
              <button type="button" className="experience-reset" onClick={() => { setShowDetails(false); setActiveIntent(''); setActiveWorkspaceId(''); setIntent(''); setSources([]); setClaims([]); setSourceNotes({}); setSourceReviewFilter('all'); setResolveError(''); setSourceCoverage(''); setResolvedPlan(null); setPlannerMode('deterministic'); setShowGeospatial(false); }}><Plus size={14} /> New intent</button>
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
            <div className="experience-planner-mode"><span>INTENT PLANNER</span><strong>{plannerMode === 'gemini' ? 'Google Gemini' : 'Local structured planner'}</strong></div>
            {plan.approvalRequired && <div className="experience-approval-note"><Sparkles size={14} /> This request appears to involve an external action. ADVERSE will require your explicit review and approval before any connected service can act.</div>}
            <p className="experience-workspace-description">{workspace.description}</p>
            <div className="experience-workspace-grid">
              <div className="experience-plan">
                <span className="experience-section-label">A POSSIBLE FLOW</span>
                {plan.steps.map((step, index) => <div className="experience-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><b>{step}</b></div>)}
              </div>
              <div className="experience-spaces">
                <span className="experience-section-label">YOUR WORKING SPACES</span>
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
              <ExperienceClaimsPanel key={activeWorkspaceId} workspaceId={activeWorkspaceId} sources={sources} onClaimsChange={setClaims} />
              <ExperienceDossierActions workspaceId={activeWorkspaceId} intent={activeIntent} sources={sources} claims={claims} />
              <ExperienceRunHistoryPanel workspaceId={activeWorkspaceId} refreshKey={runRefreshKey} />
            </>}
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
