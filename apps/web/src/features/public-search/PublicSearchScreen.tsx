import { ArrowRight, BookOpen, BrainCircuit, Clock3, FileSearch, Fingerprint, GitBranch, Network, Radar, ShieldCheck, Sparkles } from 'lucide-react';
import './research-direction.css';

type Props = { onSignIn: () => void; onCreateAccount: () => void };

const capabilities = [
  { icon: BrainCircuit, title: 'Autonomous research', text: 'Turn a research question into a multi-step investigation. ADVERSE can plan searches, pursue useful leads and keep the work organized.' },
  { icon: FileSearch, title: 'Evidence collection', text: 'Save source pages, excerpts and provenance in an investigation collection so findings stay connected to where they came from.' },
  { icon: Network, title: 'Entity & relationship mapping', text: 'Build an interactive graph of entities, saved sources and recorded relationships to explore how pieces of information connect.' },
  { icon: GitBranch, title: 'Source comparison', text: 'Compare saved material, map similar claims and surface research gaps. Similarity is a lead for review, not proof that a claim is true.' },
  { icon: Clock3, title: 'Historical research', text: 'Explore archived webpage captures, compare snapshots and reconstruct the evidence recorded in a collection at a chosen time.' },
  { icon: Radar, title: 'Monitoring & specialist tools', text: 'Use the workspace’s monitoring and cyber-intelligence panels for supported public-data research and follow-up.' }
];

export default function PublicSearchScreen({ onSignIn, onCreateAccount }: Props) {
 return <main className="adverse-landing">
  <header className="landing-nav">
   <a className="landing-brand" href="/" aria-label="ADVERSE home"><span className="landing-mark"><Fingerprint size={21}/></span><span>ADVERSE<small>INTELLIGENCE WORKSPACE</small></span></a>
   <nav aria-label="Main navigation"><a href="#capabilities">Capabilities</a><a href="#workflow">How it works</a><button className="landing-nav-login" onClick={onSignIn}>Sign in <ArrowRight size={15}/></button></nav>
  </header>
  <section className="landing-hero">
   <div className="landing-hero-copy">
    <span className="landing-kicker"><span className="landing-live-dot"/> AUTONOMOUS INTELLIGENCE RESEARCH</span>
    <h1>Investigate the question.<br/><em>Follow the evidence.</em></h1>
    <p className="landing-lede">ADVERSE is an AI-assisted intelligence research workspace for multi-step public-source research, evidence organization and connection discovery.</p>
    <div className="landing-actions"><button className="landing-primary" onClick={onCreateAccount}>Create your workspace <ArrowRight size={17}/></button><button className="landing-secondary" onClick={onSignIn}>Sign in</button></div>
    <p className="landing-access-note"><ShieldCheck size={14}/> The investigation tools are inside the secure workspace after you sign in.</p>
   </div>
   <div className="landing-preview" aria-label="Illustrative preview of an intelligence investigation workspace">
    <div className="preview-top"><span><span className="preview-dot"/> ADVERSE / INTELLIGENCE DESK</span><span>WORKSPACE PREVIEW</span></div>
    <div className="preview-question"><small>INVESTIGATION BRIEF</small><b>Map the public evidence around a research question</b><span>Multi-step research · Source review · Relationship discovery</span></div>
    <div className="preview-flow">
     <div className="preview-node preview-root"><Radar size={17}/><span>Research question</span></div>
     <div className="preview-branches"><div className="preview-node"><FileSearch size={16}/><span>Source collection</span><small>Public records & pages</small></div><div className="preview-node"><Network size={16}/><span>Entity mapping</span><small>People, orgs & links</small></div><div className="preview-node"><GitBranch size={16}/><span>Evidence review</span><small>Compare & find gaps</small></div></div>
    </div>
    <div className="preview-footer"><span><span className="preview-dot"/> INVESTIGATION WORKFLOW</span><span>Illustrative interface preview</span></div>
   </div>
  </section>
  <section className="landing-proof-strip" aria-label="Product principles"><div><Sparkles size={17}/><span><b>Agent-assisted</b><small>Multi-step research workflows</small></span></div><div><BookOpen size={17}/><span><b>Source-backed</b><small>Keep evidence attached to findings</small></span></div><div><ShieldCheck size={17}/><span><b>Human-reviewed</b><small>Inspect sources and limitations</small></span></div></section>
  <section className="landing-capabilities" id="capabilities">
   <div className="landing-section-heading"><span className="landing-kicker">INSIDE THE WORKSPACE</span><h2>Research tools, not just search results.</h2><p>These are the core capabilities you can access after creating an account or signing in.</p></div>
   <div className="landing-capability-grid">{capabilities.map(({icon:Icon,title,text})=><article className="landing-capability" key={title}><span className="landing-capability-icon"><Icon size={19}/></span><h3>{title}</h3><p>{text}</p><span className="landing-access-tag"><ShieldCheck size={12}/> Available after sign in</span></article>)}</div>
  </section>
  <section className="landing-workflow" id="workflow"><div><span className="landing-kicker">A CLEAR WORKFLOW</span><h2>From a question to an organized investigation.</h2><p>Start with a question, let the research workflow gather material, then inspect and organize what the sources actually support.</p><button className="landing-primary" onClick={onCreateAccount}>Enter ADVERSE <ArrowRight size={16}/></button></div><ol><li><b>01</b><span><strong>Start an investigation</strong><small>Define the question and create a research collection.</small></span></li><li><b>02</b><span><strong>Research and gather sources</strong><small>Run supported searches and save relevant public evidence.</small></span></li><li><b>03</b><span><strong>Review connections and gaps</strong><small>Explore relationships, compare sources and inspect limitations.</small></span></li><li><b>04</b><span><strong>Export your findings</strong><small>Turn organized research into a structured report.</small></span></li></ol></section>
  <section className="landing-boundaries"><ShieldCheck size={19}/><div><b>Evidence first. Conclusions are yours to verify.</b><p>ADVERSE supports research; it does not guarantee that sources are accurate, that every lead is found, or that AI-generated analysis is correct. Verify important claims against original sources. Use it for lawful research involving public information, not private surveillance or unauthorized access.</p></div></section>
  <footer className="landing-footer"><a className="landing-brand" href="/"><span className="landing-mark"><Fingerprint size={18}/></span><span>ADVERSE<small>INTELLIGENCE WORKSPACE</small></span></a><span>Built by <a href="https://github.com/Ad3n1x" target="_blank" rel="noreferrer">AD3N1X</a></span></footer>
 </main>;
}
