import { ArrowRight, BookOpen, BrainCircuit, CheckCircle2, Compass, Fingerprint, GitBranch, Globe2, Network, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import './research-direction.css';
import IntelligenceScene from '../../components/layout/IntelligenceScene';

type Props = { onSignIn: () => void; onCreateAccount: (objective?: string) => void };

const capabilities = [
  { icon: BrainCircuit, title: 'Understand the objective', text: 'Start with a goal in ordinary language. ADVERSE treats the request as an investigation to organize, not merely a phrase to match.' },
  { icon: Compass, title: 'Discover useful destinations', text: 'Search supported public sources, inspect result context and follow relevant leads without pretending every website or service is connected.' },
  { icon: BookOpen, title: 'Keep evidence attached', text: 'Save source pages, excerpts and provenance in an investigation. Findings remain traceable to the material collected.' },
  { icon: Network, title: 'See how things connect', text: 'Explore recorded entities, sources and relationships in the 2D and 3D connections explorer.' },
  { icon: GitBranch, title: 'Compare and reassess', text: 'Review overlapping sources, claim groups, research gaps and historical snapshots. Similarity is a lead for review, not proof.' },
  { icon: CheckCircle2, title: 'Track real progress', text: 'Keep investigation state and saved work together. ADVERSE distinguishes collected information from verified conclusions and completed external actions.' }
];

const examples = [
  'Find universities in Nigeria offering Mechatronics Engineering and compare their official admission requirements.',
  'Research the public evidence behind a company and map its products, partners and sources.',
  'Compare the current and archived versions of a public website.'
];

export default function PublicSearchScreen({ onSignIn, onCreateAccount }: Props) {
 const [objective, setObjective] = useState('');
 const begin = () => {
   // Authentication is required before an objective can be persisted or researched.
   onCreateAccount(objective.trim());
 };
 return <main className="adverse-landing"><IntelligenceScene />
  <header className="landing-nav">
   <a className="landing-brand" href="/" aria-label="ADVERSE home"><span className="landing-mark"><Fingerprint size={21}/></span><span>ADVERSE<small>INTERNET INTERACTION LAYER</small></span></a>
   <nav aria-label="Main navigation"><a href="#capabilities">Capabilities</a><a href="#how-it-works">How it works</a><button className="landing-nav-login" onClick={onSignIn}>Sign in <ArrowRight size={15}/></button></nav>
  </header>
  <section className="landing-hero">
   <div className="landing-hero-copy">
    <span className="landing-kicker"><span className="landing-live-dot"/> BEYOND BROWSING</span>
    <h1>Tell the internet<br/><em>what you want to do.</em></h1>
    <p className="landing-lede">ADVERSE is an intelligent interaction layer between people and the internet. Express an objective; ADVERSE helps discover relevant public information, organize the evidence and coordinate the next steps.</p>
    <form className="landing-objective" onSubmit={event => { event.preventDefault(); begin(); }}>
      <label htmlFor="adverse-objective">WHAT ARE YOU TRYING TO ACCOMPLISH?</label>
      <textarea id="adverse-objective" value={objective} onChange={event => setObjective(event.target.value)} placeholder="Describe the outcome you want…" rows={3} maxLength={1000}/>
      <div className="landing-objective-footer"><span>{objective.length}/1000 · Sign in to start and save an objective</span><button className="landing-primary" type="submit" disabled={objective.trim().length < 2}>Start with ADVERSE <ArrowRight size={17}/></button></div>
    </form>
    <p className="landing-access-note"><ShieldCheck size={14}/> You stay in control. External actions that require authorization must be reviewed and approved by you.</p>
   </div>
   <div className="landing-preview" aria-label="Illustrative preview of an objective workspace">
    <div className="preview-top"><span><span className="preview-dot"/> ADVERSE / OBJECTIVE SPACE</span><span>CONCEPTUAL WORKFLOW</span></div>
    <div className="preview-question"><small>YOUR OBJECTIVE</small><b>Find a suitable university and understand how to apply</b><span>One goal · Relevant sources · Coordinated next steps</span></div>
    <div className="preview-flow">
     <div className="preview-node preview-root"><Sparkles size={17}/><span>Understand intent</span></div>
     <div className="preview-branches"><div className="preview-node"><Globe2 size={16}/><span>Discover</span><small>Official sites & services</small></div><div className="preview-node"><Network size={16}/><span>Connect</span><small>Evidence & relationships</small></div><div className="preview-node"><CheckCircle2 size={16}/><span>Progress</span><small>Review next steps</small></div></div>
    </div>
    <div className="preview-footer"><span><span className="preview-dot"/> OBJECTIVE-DRIVEN INTERNET</span><span>Illustrative, not a live task</span></div>
   </div>
  </section>
  <section className="landing-examples" aria-label="Example objectives"><span className="landing-kicker">START WITH AN OUTCOME</span><div>{examples.map(item=><button key={item} type="button" onClick={()=>setObjective(item)}>{item}<ArrowRight size={14}/></button>)}</div></section>
  <section className="landing-proof-strip" aria-label="Product principles"><div><Sparkles size={17}/><span><b>Intent-led</b><small>Start with the outcome</small></span></div><div><BookOpen size={17}/><span><b>Evidence-backed</b><small>Keep sources connected</small></span></div><div><ShieldCheck size={17}/><span><b>User-controlled</b><small>Review consequential actions</small></span></div></section>
  <section className="landing-capabilities" id="capabilities">
   <div className="landing-section-heading"><span className="landing-kicker">THE INTERACTION LAYER</span><h2>One objective. Connected internet capabilities.</h2><p>ADVERSE organizes discovery, research and supported interactions around what you are trying to accomplish.</p></div>
   <div className="landing-capability-grid">{capabilities.map(({icon:Icon,title,text})=><article className="landing-capability" key={title}><span className="landing-capability-icon"><Icon size={19}/></span><h3>{title}</h3><p>{text}</p><span className="landing-access-tag"><ShieldCheck size={12}/> Evidence and user control</span></article>)}</div>
  </section>
  <section className="landing-workflow" id="how-it-works"><div><span className="landing-kicker">HOW ADVERSE WORKS</span><h2>From intention to informed action.</h2><p>ADVERSE connects the steps that are usually scattered across search engines, tabs, source pages and separate tools. External service automation is available only where supported and permitted.</p><button className="landing-primary" onClick={() => onCreateAccount()}>Create your workspace <ArrowRight size={16}/></button></div><ol><li><b>01</b><span><strong>Describe the outcome</strong><small>Explain what you want to accomplish in ordinary language.</small></span></li><li><b>02</b><span><strong>Discover relevant resources</strong><small>Find public information, services and useful destinations.</small></span></li><li><b>03</b><span><strong>Organize the work</strong><small>Keep evidence, entities, relationships and research progress together.</small></span></li><li><b>04</b><span><strong>Review and continue</strong><small>Inspect sources, choose next steps and approve actions where required.</small></span></li></ol></section>
  <section className="landing-boundaries"><ShieldCheck size={19}/><div><b>Useful, connected and honest about its limits.</b><p>ADVERSE does not claim universal website access or guaranteed task completion. Source accuracy must be checked, and actions involving accounts, payments, submissions or other consequential changes require appropriate user authorization. A discovered destination is not the same as a completed action.</p></div></section>
  <footer className="landing-footer"><a className="landing-brand" href="/"><span className="landing-mark"><Fingerprint size={18}/></span><span>ADVERSE<small>BEYOND BROWSING</small></span></a><span>Built by <a href="https://github.com/Ad3n1x" target="_blank" rel="noreferrer">AD3N1X</a></span></footer>
 </main>;
}
