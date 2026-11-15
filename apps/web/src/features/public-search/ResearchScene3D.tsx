import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';

type GraphNode = { id: string; name: string; group: string; val: number };
type GraphLink = { source: string; target: string; label: string };

const nodes: GraphNode[] = [
  { id: 'question', name: 'Research question', group: 'core', val: 12 },
  { id: 'source-a', name: 'Public records', group: 'source', val: 6 },
  { id: 'source-b', name: 'News archive', group: 'source', val: 5 },
  { id: 'source-c', name: 'Research paper', group: 'source', val: 5 },
  { id: 'entity-a', name: 'Entity A', group: 'entity', val: 8 },
  { id: 'entity-b', name: 'Entity B', group: 'entity', val: 7 },
  { id: 'entity-c', name: 'Organisation', group: 'entity', val: 7 },
  { id: 'event-a', name: 'Recorded event', group: 'event', val: 5 },
  { id: 'event-b', name: 'Historical record', group: 'event', val: 5 },
  { id: 'claim-a', name: 'Candidate claim', group: 'claim', val: 6 },
  { id: 'claim-b', name: 'Comparison lead', group: 'claim', val: 5 },
  { id: 'archive', name: 'Archived capture', group: 'source', val: 5 },
  { id: 'evidence', name: 'Evidence review', group: 'core', val: 8 }
];
const links: GraphLink[] = [
  { source: 'question', target: 'source-a', label: 'search result' },
  { source: 'question', target: 'source-b', label: 'search result' },
  { source: 'question', target: 'source-c', label: 'search result' },
  { source: 'source-a', target: 'entity-a', label: 'mentions' },
  { source: 'source-b', target: 'entity-b', label: 'mentions' },
  { source: 'source-c', target: 'entity-c', label: 'mentions' },
  { source: 'entity-a', target: 'entity-b', label: 'recorded link' },
  { source: 'entity-b', target: 'entity-c', label: 'recorded link' },
  { source: 'entity-a', target: 'event-a', label: 'associated record' },
  { source: 'entity-c', target: 'event-b', label: 'associated record' },
  { source: 'event-a', target: 'claim-a', label: 'context' },
  { source: 'event-b', target: 'claim-b', label: 'context' },
  { source: 'source-b', target: 'archive', label: 'archived capture' },
  { source: 'archive', target: 'evidence', label: 'preserved source' },
  { source: 'claim-a', target: 'evidence', label: 'review' },
  { source: 'claim-b', target: 'evidence', label: 'review' },
  { source: 'evidence', target: 'question', label: 'research loop' }
];

const palette: Record<string, string> = {
  core: '#78f0df',
  source: '#60b9ff',
  entity: '#9c8cff',
  event: '#e9bf79',
  claim: '#ff8e9c'
};

export default function ResearchScene3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 720, height: 390 });
  const [compact, setCompact] = useState(false);
  const graphData = useMemo(() => ({
    nodes: compact ? nodes.slice(0, 10) : nodes,
    links: compact ? links.slice(0, 11) : links
  }), [compact]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      setSize({ width: Math.max(280, Math.floor(rect.width)), height: Math.max(320, Math.floor(rect.height)) });
      const lowMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      setCompact(window.matchMedia('(max-width: 700px), (prefers-reduced-motion: reduce)').matches || (typeof lowMemory === 'number' && lowMemory <= 4));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener('resize', update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.cameraPosition({ x: 0, y: 0, z: compact ? 300 : 245 });
    const controls = graph.controls?.();
    if (controls) {
      controls.autoRotate = !compact;
      controls.autoRotateSpeed = 0.32;
      controls.enablePan = false;
      controls.minDistance = 130;
      controls.maxDistance = 440;
    }
  }, [compact, size.width]);

  return <div className="landing-3d-stage" ref={hostRef} role="img" aria-label="Interactive illustrative three-dimensional network showing a research question connected to public sources, entities, events and evidence review">
    <div className="landing-3d-grid" aria-hidden="true"/>
    <div className="landing-3d-orbit landing-3d-orbit-one" aria-hidden="true"/>
    <div className="landing-3d-orbit landing-3d-orbit-two" aria-hidden="true"/>
    <ForceGraph3D
      ref={graphRef}
      width={size.width}
      height={size.height}
      graphData={graphData}
      backgroundColor="rgba(0,0,0,0)"
      nodeLabel={(node: GraphNode) => node.name}
      nodeColor={(node: GraphNode) => palette[node.group] || '#78f0df'}
      nodeVal={(node: GraphNode) => node.val}
      nodeResolution={compact ? 5 : 8}
      linkColor={() => 'rgba(104, 190, 220, 0.52)'}
      linkWidth={0.65}
      linkOpacity={0.52}
      linkDirectionalParticles={compact ? 0 : 1}
      linkDirectionalParticleWidth={1.4}
      linkDirectionalParticleSpeed={0.002}
      enableNodeDrag={false}
      enableNavigationControls
      showNavInfo={false}
      cooldownTicks={compact ? 35 : 70}
      warmupTicks={compact ? 8 : 18}
      d3AlphaDecay={0.035}
      controlType="orbit"
    />
    <div className="landing-3d-label landing-3d-label-top">LIVE RELATIONSHIP MODEL <span>ILLUSTRATIVE DATA</span></div>
    <div className="landing-3d-label landing-3d-label-bottom"><span><i className="source"/> SOURCES</span><span><i className="entity"/> ENTITIES</span><span><i className="claim"/> REVIEW LEADS</span></div>
    <div className="landing-3d-hint">DRAG TO EXPLORE · SCROLL TO DISCOVER</div>
  </div>;
}
