import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

type SourceNode = { id: string; name: string; color: string; group: string; url?: string };
type SourceLink = { source: string; target: string };
type SourceGraph = { nodes: SourceNode[]; links: SourceLink[] };
type Props = { intent: string; sources: Array<{ title?: string; url: string; provider?: string; publisher?: string }> };

const ForceGraph3D = lazy(() => import('react-force-graph-3d'));

export default function ExperienceConstellation({ intent, sources }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px) and (prefers-reduced-motion: no-preference)');
    const update = () => {
      const canvas = document.createElement('canvas');
      const webglAvailable = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
      setEnabled(query.matches && webglAvailable);
      setWidth(Math.max(320, Math.min(860, window.innerWidth - 80)));
    };
    update();
    query.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      query.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const graphData = useMemo<SourceGraph>(() => {
    const nodes: SourceNode[] = [{ id: 'intent', name: intent, color: '#8cf0d8', group: 'intent' }];
    const links: SourceLink[] = [];
    for (const [index, source] of sources.slice(0, 12).entries()) {
      const id = 'source-' + index;
      nodes.push({
        id,
        name: source.title || source.url,
        color: '#66b9db',
        group: 'source',
        url: source.url,
      });
      links.push({ source: 'intent', target: id });
    }
    return { nodes, links };
  }, [intent, sources]);

  if (!enabled || sources.length === 0) return null;

  return (
    <div className="experience-constellation">
      <div className="experience-constellation-heading">
        <span>3D SOURCE CONSTELLATION</span>
        <span>Drag to explore · Select a node to inspect</span>
      </div>
      <div className="experience-constellation-canvas">
        <Suspense fallback={<div className="experience-constellation-loading">Preparing 3D environment…</div>}>
          <ForceGraph3D
            graphData={graphData}
            width={width}
            height={270}
            backgroundColor="#081219"
            nodeLabel="name"
            nodeColor={(node: object) => (node as SourceNode).color}
            nodeRelSize={5}
            linkColor={() => 'rgba(111, 218, 197, 0.38)'}
            linkWidth={1.1}
            linkOpacity={0.7}
            enableNodeDrag={false}
            enableNavigationControls
            showNavInfo={false}
            onNodeClick={(node: object) => {
              const url = (node as SourceNode).url;
              if (url) window.open(url, '_blank', 'noopener,noreferrer');
            }}
            cooldownTicks={90}
            warmupTicks={30}
          />
        </Suspense>
      </div>
      <p className="experience-constellation-note">Interactive WebGL view. On smaller screens or when reduced motion is enabled, ADVERSE uses the source list instead.</p>
    </div>
  );
}
