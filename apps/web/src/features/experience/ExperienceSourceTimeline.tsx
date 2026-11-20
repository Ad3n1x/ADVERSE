import { useMemo } from 'react';
import { Clock3 } from 'lucide-react';
import type { ExperienceSource } from './experience-types';

type TimelineEvent = { key: string; timestamp: number; label: string; title: string };

export default function ExperienceSourceTimeline({ sources }: { sources: ExperienceSource[] }) {
  const events = useMemo(() => {
    const items: TimelineEvent[] = [];
    for (const source of sources) {
      const title = source.title || source.url;
      const candidates: Array<[string, string | null | undefined]> = [
        ['Published', source.publishedAt],
        ['Retrieved', source.retrievedAt],
        ['Added to workspace', source.savedAt],
        ['Reachability checked', source.linkCheck?.checkedAt],
      ];
      for (const [label, value] of candidates) {
        if (!value) continue;
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) continue;
        items.push({ key: source.url + '|' + label, timestamp, label, title });
      }
    }
    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);
  }, [sources]);
  if (!events.length) return null;
  return (
    <section className="experience-source-timeline" aria-labelledby="experience-timeline-title">
      <div className="experience-extension-heading">
        <div><span className="experience-section-label"><Clock3 size={13} /> SOURCE CHRONOLOGY</span><h3 id="experience-timeline-title">Known source dates</h3></div>
        <span>{events.length} dated events</span>
      </div>
      <ol>
        {events.map(event => <li key={event.key}>
          <time dateTime={new Date(event.timestamp).toISOString()}>{new Date(event.timestamp).toLocaleString()}</time>
          <strong>{event.label}</strong><span title={event.title}>{event.title}</span>
        </li>)}
      </ol>
      <p className="experience-extension-caveat">Publication, retrieval, workspace-save, and link-check dates are separate observations. None is treated as the date an underlying event occurred.</p>
    </section>
  );
}
