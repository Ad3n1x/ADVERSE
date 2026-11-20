import { useMemo } from 'react';
import { Globe2, CalendarDays, Layers3, Compass } from 'lucide-react';
import type { ExperienceSource } from './experience-types';

export default function ExperienceCoveragePanel({ sources }: { sources: ExperienceSource[] }) {
  const snapshot = useMemo(() => {
    const hosts = new Set<string>();
    const providers = new Set<string>();
    let multiProvider = 0;
    let missingDates = 0;
    let missingPublisher = 0;
    for (const source of sources) {
      try { hosts.add(new URL(source.url).hostname.toLowerCase()); } catch { /* Ignore malformed URLs. */ }
      const represented = new Set([...(source.providers || []), ...(source.provider ? [source.provider] : [])].map(value => value.trim()).filter(Boolean));
      represented.forEach(value => providers.add(value));
      if (represented.size > 1) multiProvider++;
      if (!source.publishedAt) missingDates++;
      if (!source.publisher && !source.provider) missingPublisher++;
    }
    return { hosts: hosts.size, providers: providers.size, multiProvider, missingDates, missingPublisher };
  }, [sources]);
  if (!sources.length) return null;
  const gaps: string[] = [];
  if (snapshot.hosts <= 1 && sources.length > 1) gaps.push('Results are concentrated on one hostname; look for independent publishers.');
  if (snapshot.missingDates) gaps.push(snapshot.missingDates + ' source(s) have no publication date in returned metadata.');
  if (snapshot.missingPublisher) gaps.push(snapshot.missingPublisher + ' source(s) have no publisher label.');
  if (!snapshot.multiProvider) gaps.push('No result has an explicit match from more than one provider.');
  return (
    <section className="experience-coverage-panel" aria-labelledby="experience-coverage-title">
      <div className="experience-extension-heading">
        <div><span className="experience-section-label"><Globe2 size={13} /> COVERAGE SNAPSHOT</span><h3 id="experience-coverage-title">What this result set covers</h3></div>
        <span>Descriptive metadata only</span>
      </div>
      <div className="experience-coverage-metrics">
        <div><strong>{sources.length}</strong><span>SOURCES</span></div>
        <div><strong>{snapshot.hosts}</strong><span>HOSTNAMES</span></div>
        <div><strong>{snapshot.providers}</strong><span>PROVIDERS</span></div>
        <div><strong>{snapshot.missingDates}</strong><span>NO PUBLICATION DATE</span></div>
      </div>
      <div className="experience-coverage-subline"><span><Layers3 size={12} /> {snapshot.multiProvider} source(s) have multiple explicit provider matches</span><span><CalendarDays size={12} /> {snapshot.missingPublisher} missing publisher labels</span></div>
      {gaps.length > 0 && <div className="experience-coverage-gaps"><strong><Compass size={12} /> Research gaps to consider</strong>{gaps.map(gap => <p key={gap}>{gap}</p>)}</div>}
      <p className="experience-extension-caveat">Different hostnames or provider matches do not establish independent ownership or corroboration. This panel does not calculate credibility or truth.</p>
    </section>
  );
}
