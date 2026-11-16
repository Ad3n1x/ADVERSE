import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Compass, FileSearch, Layers3, Network,
  Plus, Search, Sparkles, Workflow, X
} from 'lucide-react';
import './experience-home.css';

type IntentKind = 'research' | 'plan' | 'compare' | 'create' | 'explore';

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
  const kind = useMemo(() => classifyIntent(activeIntent), [activeIntent]);
  const workspace = intentCopy[kind];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = intent.trim();
    if (!trimmed) return;
    setActiveIntent(trimmed);
    setShowDetails(true);
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
          <div className="experience-examples">
            <div className="experience-examples-label">START WITH AN EXAMPLE</div>
            <div className="experience-example-grid">
              {examples.map(item => {
                const Icon = item.icon;
                return <button key={item.label} className="experience-example" type="button" onClick={() => { setIntent(item.prompt); setActiveIntent(item.prompt); setShowDetails(true); }}>
                  <span className="experience-example-icon"><Icon size={17} /></span>
                  <span>{item.label}</span><ArrowUpRight size={14} />
                </button>;
              })}
            </div>
          </div>
        ) : (
          <section className="experience-workspace" aria-live="polite">
            <div className="experience-workspace-head">
              <div><span className="experience-section-label"><i /> WORKSPACE FOR YOUR INTENT</span><h2>{workspace.title}</h2></div>
              <button type="button" className="experience-reset" onClick={() => { setShowDetails(false); setActiveIntent(''); }}><Plus size={14} /> New intent</button>
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
