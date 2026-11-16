import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Compass, FileSearch, Layers3, Network,
  Clock3, Plus, Search, Sparkles, Trash2, Workflow, X
} from 'lucide-react';
import './experience-home.css';

type IntentKind = 'research' | 'plan' | 'compare' | 'create' | 'explore';
type SavedIntent = { id: string; intent: string; kind: IntentKind; createdAt: number };
const HISTORY_KEY = 'adverse.experience.history.v1';
const HISTORY_LIMIT = 8;

const examples = [
  { icon: FileSearch, label: 'Research a topic', prompt: 'Research the latest advances in renewable energy storage' },
  { icon: Workflow, label: 'Plan a project', prompt: 'Help me plan a new software project from idea to launch' },
  { icon: Layers3, label: 'Compare options', prompt: 'Compare the best approaches for building a fast web application' },
];

function classifyIntent(value: string): IntentKind {
  const text = value.toLowerCase();
  if (/compare|versus| vs |difference|better than/.test(text)) return 'compare';
  if (/plan|schedule|roadmap|organize|steps|project/.test(text)) return 'plan';
  if (/build|create|design|make|develop|write/.test(text)) return 'create';
  if (/research|investigate|find|source|learn|understand/.test(text)) return 'research';
  return 'explore';
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

  function openIntent(value: string) {
    const trimmed = value.trim().slice(0, 500);
    if (!trimmed) return;
    const nextKind = classifyIntent(trimmed);
    setIntent(trimmed);
    setActiveIntent(trimmed);
    setShowDetails(true);
    setHistory(current => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, intent: trimmed, kind: nextKind, createdAt: Date.now() },
      ...current.filter(item => item.intent.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, HISTORY_LIMIT));
  }

  function removeIntent(id: string) {
    setHistory(current => current.filter(item => item.id !== id));
  }
  const kind = useMemo(() => classifyIntent(activeIntent), [activeIntent]);
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
            <div className="experience-history-head"><span className="experience-section-label"><Clock3 size={13} /> RECENT WORKSPACES</span><span>{history.length} saved locally</span></div>
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
              <button type="button" className="experience-reset" onClick={() => { setShowDetails(false); setActiveIntent(''); setIntent(''); }}><Plus size={14} /> New intent</button>
            </div>
            <p className="experience-intent-echo">“{activeIntent}”</p>
            <p className="experience-workspace-description">{workspace.description}</p>
            <div className="experience-workspace-grid">
              <div className="experience-plan">
                <span className="experience-section-label">A POSSIBLE FLOW</span>
                {workspace.steps.map((step, index) => <div className="experience-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><b>{step}</b></div>)}
              </div>
              <div className="experience-spaces">
                <span className="experience-section-label">YOUR WORKING SPACES</span>
                {workspace.spaces.map((space, index) => <div className="experience-space" key={space}><span>{index === 0 ? <FileSearch size={15} /> : index === 1 ? <Layers3 size={15} /> : <Compass size={15} />}</span>{space}<ArrowUpRight size={13} /></div>)}
              </div>
            </div>
            <div className="experience-preview-note"><Sparkles size={14} /> This is an interaction-model preview. Connected services and external actions are not active in this phase preview.</div>
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
