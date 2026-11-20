import { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { request } from '../../lib/api';
import type { ExperienceResearchRun } from './experience-types';

export default function ExperienceRunHistoryPanel({ workspaceId, refreshKey }: { workspaceId: string; refreshKey: number }) {
  const [runs, setRuns] = useState<ExperienceResearchRun[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    request<{ data: ExperienceResearchRun[] }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/runs')
      .then(response => { if (!cancelled) setRuns(Array.isArray(response.data) ? response.data : []); })
      .catch(() => { if (!cancelled) setRuns([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, refreshKey]);
  return (
    <section className="experience-run-history" aria-labelledby="experience-run-history-title">
      <div className="experience-extension-heading">
        <div><span className="experience-section-label"><History size={13} /> RESEARCH HISTORY</span><h3 id="experience-run-history-title">Reproducible search runs</h3></div>
        <span>{runs.length} saved · latest 20 retained</span>
      </div>
      {loading && <p className="experience-extension-muted">Loading research history…</p>}
      {!loading && !runs.length && <p className="experience-extension-empty">A search record will appear after discovery completes.</p>}
      {runs.slice(0, 8).map(run => (
        <article className="experience-run-row" key={run.runId}>
          <div><strong>{run.query}</strong><span>{new Date(run.recordedAt).toLocaleString()} · {run.plannerKind.toUpperCase()}</span></div>
          <div className="experience-run-count"><strong>{run.sourceCount}</strong><span>SOURCES</span></div>
          <div className="experience-run-count"><strong>{run.successfulSearches}</strong><span>PROVIDER SUCCESSES</span></div>
          <span className="experience-run-providers">{run.providerNames.length ? run.providerNames.join(' · ') : 'Provider details unavailable'}</span>
        </article>
      ))}
      <p className="experience-extension-caveat"><RefreshCw size={11} /> These records show what ADVERSE returned at the time; they do not guarantee identical results on a later run.</p>
    </section>
  );
}
