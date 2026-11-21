import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Save, ShieldCheck } from 'lucide-react';
import { request } from '../../lib/api';
import type { ExperienceClaim, ExperienceSource, ClaimAssessment, ClaimEvidenceRole } from './experience-types';

const assessments: Array<{ value: ClaimAssessment; label: string }> = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'supported', label: 'Analyst considers supported' },
  { value: 'conflicting', label: 'Conflicting evidence found' },
  { value: 'insufficient', label: 'Insufficient evidence' },
];

export default function ExperienceClaimsPanel({
  workspaceId, sources, onClaimsChange, refreshKey = 0,
}: {
  workspaceId: string;
  sources: ExperienceSource[];
  onClaimsChange: (claims: ExperienceClaim[]) => void;
  refreshKey?: number;
}) {
  const [claims, setClaims] = useState<ExperienceClaim[]>([]);
  const [claimText, setClaimText] = useState('');
  const [assessment, setAssessment] = useState<ClaimAssessment>('unreviewed');
  const [rationale, setRationale] = useState('');
  const [evidenceSelection, setEvidenceSelection] = useState<Record<string, ClaimEvidenceRole>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    request<{ data: ExperienceClaim[] }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/claims')
      .then(response => {
        if (cancelled) return;
        const loaded = Array.isArray(response.data) ? response.data : [];
        setClaims(loaded);
        onClaimsChange(loaded);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError('Claim records could not be loaded. Your source list is still available.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, refreshKey]);

  const sourceTitles = useMemo(() => new Map(sources.map(source => [source.url, source.title || source.url])), [sources]);

  async function persist(next: ExperienceClaim[]) {
    if (saving) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const response = await request<{ data: ExperienceClaim[] }>(
        '/experience/workspaces/' + encodeURIComponent(workspaceId) + '/claims',
        { method: 'PUT', body: JSON.stringify({ claims: next }) },
      );
      const saved = Array.isArray(response.data) ? response.data : next;
      setClaims(saved);
      onClaimsChange(saved);
      setNotice('Claim ledger saved to this workspace.');
    } catch {
      setError('The claim changes could not be saved. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  function updateClaim(claimId: string, patch: Partial<ExperienceClaim>) {
    setClaims(current => {
      const next = current.map(claim => claim.claimId === claimId ? { ...claim, ...patch } : claim);
      onClaimsChange(next);
      return next;
    });
  }

  function addClaim() {
    const text = claimText.trim();
    if (text.length < 5 || saving) return;
    const claimId = window.crypto?.randomUUID?.() || ('claim-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    const claim: ExperienceClaim = {
      claimId, text, assessment, rationale: rationale.trim(),
      evidenceLinks: Object.entries(evidenceSelection).map(([url, role]) => ({ url, role })),
    };
    void persist([...claims, claim]);
    setClaimText('');
    setRationale('');
    setAssessment('unreviewed');
    setEvidenceSelection({});
  }

  return (
    <section className="experience-claims-panel" aria-labelledby="experience-claims-title">
      <div className="experience-extension-heading">
        <div><span className="experience-section-label"><ShieldCheck size={13} /> CLAIM LEDGER</span><h3 id="experience-claims-title">Connect statements to sources</h3></div>
        <span>{claims.length} saved claims</span>
      </div>
      <p className="experience-extension-intro">ADVERSE extracts candidate statements from saved source excerpts and links them as context. They remain unreviewed until you assess the original sources. You can also add your own statements.</p>
      <div className="experience-claim-create">
        <label>
          <span>STATEMENT TO EXAMINE</span>
          <textarea aria-label="Statement to examine" value={claimText} maxLength={1000} rows={3} onChange={event => setClaimText(event.target.value)} placeholder="Write one specific, checkable statement…" />
        </label>
        <div className="experience-claim-create-row">
          <label>
            <span>ANALYST ASSESSMENT</span>
            <select aria-label="New claim assessment" value={assessment} onChange={event => setAssessment(event.target.value as ClaimAssessment)}>
              {assessments.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="experience-claim-rationale">
            <span>RATIONALE / OPEN QUESTION</span>
            <input aria-label="New claim rationale" value={rationale} maxLength={1000} onChange={event => setRationale(event.target.value)} placeholder="What still needs checking?" />
          </label>
        </div>
        {sources.length > 0 && <div className="experience-claim-source-picker">
          <span>LINK SOURCES (OPTIONAL)</span>
          {sources.map(source => {
            const selected = evidenceSelection[source.url];
            const title = source.title || source.url;
            return <div className="experience-claim-source-option" key={source.url}>
              <label>
                <input
                  type="checkbox"
                  aria-label={'Link source: ' + title}
                  checked={Boolean(selected)}
                  onChange={event => setEvidenceSelection(current => {
                    const next = { ...current };
                    if (event.target.checked) next[source.url] = 'context';
                    else delete next[source.url];
                    return next;
                  })}
                />
                <span>{title}</span>
              </label>
              <select
                aria-label={'Evidence role for ' + title}
                value={selected || 'context'}
                disabled={!selected}
                onChange={event => setEvidenceSelection(current => ({ ...current, [source.url]: event.target.value as ClaimEvidenceRole }))}
              >
                <option value="supports">Supports</option>
                <option value="challenges">Challenges</option>
                <option value="context">Context</option>
              </select>
            </div>;
          })}
        </div>}
        <button className="experience-extension-primary" type="button" disabled={saving || claimText.trim().length < 5} onClick={addClaim}>
          <Plus size={14} /> Add claim
        </button>
      </div>
      {loading && <p className="experience-extension-muted">Loading saved claims…</p>}
      {!loading && !claims.length && <p className="experience-extension-empty">No claims recorded yet. Add a statement when you have something specific to examine.</p>}
      {claims.map(claim => (
        <article className="experience-claim-card" key={claim.claimId}>
          <div className="experience-claim-card-head">
            <strong>{claim.text}</strong>
            <span className={'experience-claim-status status-' + claim.assessment}>{claim.assessment.replace('_', ' ').toUpperCase()}</span>
            {claim.claimId.startsWith('auto-') && <span className="experience-claim-auto-label">AUTO-EXTRACTED</span>}
          </div>
          {claim.evidenceLinks.length > 0 && <div className="experience-claim-linked-sources">
            {claim.evidenceLinks.map(link => <span key={link.url}>{link.role.toUpperCase()} · {sourceTitles.get(link.url) || link.url}</span>)}
          </div>}
          <label className="experience-claim-edit">
            <span>ASSESSMENT</span>
            <select value={claim.assessment} onChange={event => updateClaim(claim.claimId, { assessment: event.target.value as ClaimAssessment })}>
              {assessments.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="experience-claim-edit">
            <span>RATIONALE</span>
            <textarea value={claim.rationale || ''} maxLength={1000} rows={2} onChange={event => updateClaim(claim.claimId, { rationale: event.target.value })} placeholder="Record the reasoning or remaining uncertainty…" />
          </label>
          <button className="experience-extension-save" type="button" disabled={saving} onClick={() => void persist(claims)}>
            <Save size={13} /> Save assessment
          </button>
        </article>
      ))}
      {error && <p className="experience-extension-error" role="alert">{error}</p>}
      {notice && <p className="experience-extension-success" role="status"><Check size={12} /> {notice}</p>}
    </section>
  );
}
