import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Compass, FileSearch, Layers3, Network,
  Clock3, Plus, Search, Sparkles, Trash2, Workflow, X
} from 'lucide-react';
import { request } from '../../lib/api';
import ExperienceConstellation from './ExperienceConstellation';
import './experience-home.css';

type IntentKind = 'research' | 'plan' | 'compare' | 'create' | 'explore';
type SavedIntent = { id: string; intent: string; kind: IntentKind; createdAt: number };
type ExperienceSource = { title?: string; url: string; excerpt?: string; publisher?: string; provider?: string; linkCheck?: { status?: string; note?: string } };
type ExperienceSearchResponse = { data: ExperienceSource[]; meta?: { coverage?: string; providerError?: string; successfulSearches?: number } };
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
  const actionPattern = /\b(buy|book|publish|delete|transfer|deploy|submit|pay|post|order|cancel)\b|\b(send|message)\b.{0,40}\b(to|via|through)\b/i;
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

export default function ExperienceHome() {
  const [intent, setIntent] = useState('');
  const [activeIntent, setActiveIntent] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [history, setHistory] = useState<SavedIntent[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [sources, setSources] = useState<ExperienceSource[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [sourceCoverage, setSourceCoverage] = useState('');
  const [plannerMode, setPlannerMode] = useState<'gemini' | 'deterministic'>('deterministic');
  const [resolvedPlan, setResolvedPlan] = useState<IntentPlan | null>(null);

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

  async function openIntent(value: string) {
    const trimmed = value.trim().slice(0, 500);
    if (!trimmed) return;
    const intentPlan = buildIntentPlan(trimmed);
    const workspaceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = Date.now();
    setIntent(trimmed);
    setActiveIntent(trimmed);
    setShowDetails(true);
    setSources([]);
    setResolveError('');
    setSourceCoverage('');
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
    try {
      const query = activePlan.focus.length >= 2 ? activePlan.focus : trimmed;
      const response = await request<ExperienceSearchResponse>('/public-search?q=' + encodeURIComponent(query));
      setSources(Array.isArray(response.data) ? response.data.slice(0, 12) : []);
      setSourceCoverage(response.meta?.coverage || 'Public search results are limited to available connected providers.');
      if (!response.data?.length) {
        setResolveError(response.meta?.providerError || 'No public sources were returned. Try a more specific request.');
      }
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : 'Public source discovery is temporarily unavailable.');
    } finally {
      setIsResolving(false);
    }
  }

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
          <span className="experience-mode"><i /> EXPERIENCE PREVIEW</span>
          <a className="experience-old-link" href="/">Current ADVERSE <ArrowUpRight size={14} /></a>
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
                <button type="button" className="experience-history-open" onClick={() => openIntent(item.intent)}>
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
              <button type="button" className="experience-reset" onClick={() => { setShowDetails(false); setActiveIntent(''); setIntent(''); setSources([]); setResolveError(''); setSourceCoverage(''); setResolvedPlan(null); setPlannerMode('deterministic'); }}><Plus size={14} /> New intent</button>
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
            <section className="experience-live-sources" aria-live="polite">
              <div className="experience-live-sources-head">
                <span className="experience-section-label"><i /> LIVE PUBLIC DISCOVERY</span>
                <span>{isResolving ? 'Searching public sources…' : sources.length ? `${sources.length} sources found` : 'Source discovery'}</span>
              </div>
              {isResolving && <div className="experience-source-loading"><span /> Querying available public search providers and checking result metadata.</div>}
              {!isResolving && resolveError && <p className="experience-source-error">{resolveError}</p>}
              {!isResolving && sources.length > 0 && <ExperienceConstellation intent={activeIntent} sources={sources} />}
              {!isResolving && sources.length > 0 && <div className="experience-source-list">
                {sources.map((source, index) => <article className="experience-source-card" key={source.url}>
                  <div className="experience-source-index">{String(index + 1).padStart(2, '0')}</div>
                  <div className="experience-source-content">
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}<ArrowUpRight size={13} /></a>
                    <span>{source.publisher || source.provider || 'Public source'} · {source.linkCheck?.status === 'reachable' ? 'Reachable when checked' : source.linkCheck?.status === 'not_confirmed' ? 'Reachability not confirmed' : 'Not checked'}</span>
                    {source.excerpt && <p>{source.excerpt.slice(0, 280)}</p>}
                  </div>
                </article>)}
              </div>}
              {sourceCoverage && <p className="experience-source-coverage">{sourceCoverage}</p>}
              <p className="experience-source-disclaimer">Search results are leads, not verified facts. Open original sources and assess their context. ADVERSE does not execute purchases, bookings, messages, deployments, or other external actions from this preview.</p>
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
