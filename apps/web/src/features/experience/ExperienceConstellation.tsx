import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ExperienceClaim, ExperienceSource } from './experience-types';

type NodeKind = 'intent' | 'source' | 'alternative' | 'claim';
type SourceNode = {
  id: string;
  name: string;
  color: string;
  group: NodeKind;
  url?: string;
  assessment?: string;
};
type SourceLink = {
  source: string;
  target: string;
  role: 'discovery' | 'supports' | 'challenges' | 'context';
};
type SourceGraph = { nodes: SourceNode[]; links: SourceLink[] };
type Props = { intent: string; sources: ExperienceSource[]; claims?: ExperienceClaim[] };

const ForceGraph3D = lazy(() => import('react-force-graph-3d'));

const palette: Record<NodeKind, string> = {
  intent: '#8cf0d8',
  source: '#66b9db',
  alternative: '#e6b26b',
  claim: '#b7a3ff',
};

const roleColors: Record<SourceLink['role'], string> = {
  discovery: 'rgba(111, 218, 197, 0.38)',
  supports: 'rgba(91, 224, 160, 0.78)',
  challenges: 'rgba(255, 142, 156, 0.78)',
  context: 'rgba(174, 190, 207, 0.58)',
};

export default function ExperienceConstellation({ intent, sources, claims = [] }: Props) {
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
    const nodes: SourceNode[] = [{ id: 'intent', name: intent, color: palette.intent, group: 'intent' }];
    const links: SourceLink[] = [];
    const sourceIds = new Map<string, string>();

    for (const [index, source] of sources.slice(0, 24).entries()) {
      const id = 'source-' + index;
      sourceIds.set(source.url, id);
      nodes.push({
        id,
        name: source.title || source.url,
        color: source.sourceType === 'alternative' ? palette.alternative : palette.source,
        group: source.sourceType === 'alternative' ? 'alternative' : 'source',
        url: source.url,
      });
      links.push({ source: 'intent', target: id, role: 'discovery' });
    }

    for (const source of sources.slice(0, 24)) {
      if (!source.alternativeFor) continue;
      const alternativeId = sourceIds.get(source.url);
      const originalId = sourceIds.get(source.alternativeFor);
      if (alternativeId && originalId) {
        links.push({ source: alternativeId, target: originalId, role: 'context' });
      }
    }

    for (const [index, claim] of claims.slice(0, 24).entries()) {
      const id = 'claim-' + encodeURIComponent(claim.claimId || String(index)).slice(0, 100);
      nodes.push({
        id,
        name: claim.text,
        color: palette.claim,
        group: 'claim',
        assessment: claim.assessment,
      });
      links.push({ source: 'intent', target: id, role: 'context' });
      for (const evidenceLink of claim.evidenceLinks || []) {
        const sourceId = sourceIds.get(evidenceLink.url);
        if (sourceId && ['supports', 'challenges', 'context'].includes(evidenceLink.role)) {
          links.push({
            source: id,
            target: sourceId,
            role: evidenceLink.role,
          });
        }
      }
    }

    return { nodes, links };
  }, [intent, sources, claims]);

  if (!enabled || sources.length === 0) return null;

  return (
    <div className="experience-constellation">
      <div className="experience-constellation-heading">
        <span>3D EVIDENCE NETWORK</span>
        <span>{sources.length} sources · {claims.length} analyst claims</span>
      </div>
      <div className="experience-constellation-canvas">
        <Suspense fallback={<div className="experience-constellation-loading">Preparing 3D environment…</div>}>
          <ForceGraph3D
            graphData={graphData}
            width={width}
            height={300}
            backgroundColor="#081219"
            nodeLabel={(node: object) => {
              const item = node as SourceNode;
              if (item.group === 'claim') return item.name + ' · ' + (item.assessment || 'unreviewed');
              if (item.group === 'alternative') return 'Alternative candidate: ' + item.name;
              return item.name;
            }}
            nodeColor={(node: object) => palette[(node as SourceNode).group] || palette.source}
            nodeVal={(node: object) => (node as SourceNode).group === 'intent' ? 10 : (node as SourceNode).group === 'claim' ? 7 : (node as SourceNode).group === 'alternative' ? 6 : 5}
            nodeRelSize={5}
            linkColor={(link: object) => roleColors[(link as SourceLink).role] || roleColors.discovery}
            linkLabel={(link: object) => {
              const role = (link as SourceLink).role;
              return role === 'discovery' ? 'Discovered from this intent' : 'Analyst-linked: ' + role;
            }}
            linkWidth={1.1}
            linkOpacity={0.72}
            linkDirectionalParticles={(link: object) => (link as SourceLink).role === 'discovery' ? 0 : 1}
            linkDirectionalParticleWidth={1.4}
            linkDirectionalParticleSpeed={0.002}
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
      <p className="experience-constellation-note">
        Interactive WebGL view. Green, red and grey links reflect analyst-selected evidence roles, not verified truth. On smaller screens or when reduced motion is enabled, ADVERSE uses the source and claim lists instead.
      </p>
    </div>
  );
}
