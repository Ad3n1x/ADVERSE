import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Maximize2, Minimize2, Network, Search, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Entity, Evidence, Relationship } from '../../types/research';
import { getRecordId as key } from '../../lib/ids';

const Graph3D = ForceGraph3D as any;
type Props = {
  entities: Entity[];
  evidence: Evidence[];
  relationships: Relationship[];
  onSelect: (entity: Entity) => void;
  selectedId: string;
  query: string;
  layoutKey: string;
};

function verificationLabel(status: unknown) {
  const value = String(status || 'unverified').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (['verified', 'confirmed', 'independently verified'].includes(value)) return 'Verified';
  if (['disputed', 'conflicting', 'contradicted', 'rejected'].includes(value)) return 'Disputed';
  if (['unverified', 'unknown', 'pending', 'not reviewed', ''].includes(value)) return 'Unverified';
  return 'Needs review';
}
function verificationColor(status: unknown) {
  const label = verificationLabel(status);
  return label === 'Verified' ? '#5ee0a0' : label === 'Disputed' ? '#fb7185' : label === 'Needs review' ? '#fbbf24' : '#91a8c7';
}
function relationshipKey(r: Relationship) {
  return String(key(r) || `${r.fromEntityId}-${r.type}-${r.toEntityId}`);
}

export default function Graph({ entities, evidence, relationships, onSelect, selectedId, query, layoutKey }: Props) {
  const [relationshipFilter, setRelationshipFilter] = useState('all');
  const [activeEntityId, setActiveEntityId] = useState('');
  const [selectedRelationshipId, setSelectedRelationshipId] = useState('');
  const [size, setSize] = useState({ width: 800, height: 560 });
  const [fullscreen, setFullscreen] = useState(false);
  const [search, setSearch] = useState(query);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<any>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => setSize(current => ({
      ...current, width: Math.max(280, Math.floor(host.clientWidth))
    })));
    observer.observe(host);
    setSize(current => ({ ...current, width: Math.max(280, Math.floor(host.clientWidth)) }));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement === shellRef.current;
      setFullscreen(active);
      setSize(current => ({ ...current, height: active ? Math.max(360, window.innerHeight - 30) : 560 }));
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const needle = search.trim().toLowerCase();
  const visibleEntities = useMemo(() => entities.filter(e =>
    `${e.name} ${e.type} ${e.description || ''}`.toLowerCase().includes(needle)
  ), [entities, needle]);
  const visibleIds = useMemo(() => new Set(visibleEntities.map(e => String(key(e) || e.name))), [visibleEntities]);
  const visibleEvidence = useMemo(() => evidence.filter(item =>
    `${item.title || ''} ${item.publisher || ''} ${item.excerpt || ''} ${item.url || ''}`.toLowerCase().includes(needle)
  ), [evidence, needle]);
  const sourceNodes = useMemo(() => visibleEvidence.map((item, index) => ({
    id: 'source-node-' + String(key(item) || index),
    name: item.title || item.publisher || item.url || 'Saved source',
    kind: 'source',
    type: 'Saved evidence',
    url: item.url || '',
    evidenceId: String(key(item) || index),
    description: item.publisher || item.excerpt || item.url || ''
  })), [visibleEvidence]);
  const visibleRelations = useMemo(() => relationships.filter(r =>
    visibleIds.has(String(r.fromEntityId)) && visibleIds.has(String(r.toEntityId)) &&
    (relationshipFilter === 'all' || r.type === relationshipFilter)
  ), [relationships, visibleIds, relationshipFilter]);
  const graphData = useMemo(() => {
    const nodes = [
      ...visibleEntities.map(entity => ({
        id: String(key(entity) || entity.name), name: entity.name || 'Unnamed entity',
        kind: 'entity', type: entity.type || 'Entity', description: entity.description || '',
        evidenceIds: entity.evidenceIds || [], canonicalUrl: entity.canonicalUrl || ''
      })),
      ...sourceNodes
    ];
    const sourceByEvidence = new Map(sourceNodes.map(source => [source.evidenceId, source]));
    const links: any[] = visibleRelations.map(r => ({
      id: relationshipKey(r), source: String(r.fromEntityId), target: String(r.toEntityId),
      kind: 'relationship', type: r.type, verificationStatus: r.verificationStatus,
      rationale: r.rationale, evidenceIds: r.evidenceIds || []
    }));
    visibleEntities.forEach(entity => (entity.evidenceIds || []).forEach(id => {
      const source = sourceByEvidence.get(String(id));
      if (source) links.push({
        id: 'evidence-' + String(key(entity) || entity.name) + '-' + source.id,
        source: String(key(entity) || entity.name), target: source.id,
        kind: 'evidence', type: 'supported by', verificationStatus: 'source-linked'
      });
    }));
    visibleRelations.forEach(r => (r.evidenceIds || []).forEach(id => {
      const source = sourceByEvidence.get(String(id));
      if (source) links.push({
        id: 'relationship-evidence-' + relationshipKey(r) + '-' + source.id,
        source: String(r.fromEntityId), target: source.id,
        kind: 'evidence', type: 'source for ' + r.type, verificationStatus: 'source-linked',
        relationshipId: relationshipKey(r)
      });
    }));
    return { nodes, links };
  }, [visibleEntities, sourceNodes, visibleRelations]);

  const activeEntity = visibleEntities.find(e => String(key(e) || e.name) === activeEntityId);
  const activeRelations = activeEntity ? visibleRelations.filter(r =>
    String(r.fromEntityId) === activeEntityId || String(r.toEntityId) === activeEntityId
  ) : [];
  const relationTypes = [...new Set(relationships.map(r => r.type))].sort();
  const resetCamera = () => graphRef.current?.zoomToFit?.(700, 90);
  const zoom = (factor: number) => {
    const current = graphRef.current?.cameraPosition?.();
    if (current) graphRef.current?.cameraPosition?.(
      { x: current.x * factor, y: current.y * factor, z: current.z * factor },
      undefined, 350
    );
  };
  const toggleFullscreen = async () => {
    const target = shellRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch { /* Browser may deny fullscreen; graph controls remain available. */ }
  };
  const saveLayout = () => {
    const positions = Object.fromEntries(graphData.nodes.map((node: any) => [
      String(node.id), { x: node.x, y: node.y, z: node.z }
    ]));
    try { localStorage.setItem('adverse-3d-layout:' + layoutKey, JSON.stringify(positions)); } catch { /* Storage may be unavailable. */ }
  };
  const restoreLayout = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('adverse-3d-layout:' + layoutKey) || '{}');
      graphData.nodes.forEach((node: any) => {
        const position = saved[String(node.id)];
        if (position && [position.x, position.y, position.z].every(Number.isFinite)) {
          Object.assign(node, position, { fx: position.x, fy: position.y, fz: position.z });
        }
      });
      graphRef.current?.d3ReheatSimulation?.();
      resetCamera();
    } catch { /* Ignore invalid saved layouts. */ }
  };

  if (!entities.length && !evidence.length) return (
    <div className="graph-preview graph-empty"><Network size={24} /><b>No graph data yet</b>
      <span>Run research or save sources in this collection. The 3D evidence network will appear here.</span>
    </div>
  );
  if (!graphData.nodes.length) return (
    <div className="graph-preview graph-empty"><Search size={22} /><b>No matching records</b>
      <span>Try another entity name, source title, publisher or description.</span>
    </div>
  );

  return <section className="adverse-3d-workspace">
    <header className="adverse-3d-header">
      <div>
        <div className="adverse-3d-kicker"><span className="adverse-3d-live" /> WEBGL / THREE.JS ENGINE</div>
        <h3>Spatial intelligence network</h3>
        <p>Drag to orbit · Scroll to zoom · Drag nodes to reposition · Select a node to inspect</p>
      </div>
      <div className="adverse-3d-counts">
        <span><b>{visibleEntities.length}</b> entities</span>
        <span><b>{sourceNodes.length}</b> sources</span>
        <span><b>{graphData.links.length}</b> connections</span>
      </div>
    </header>
    <div className="adverse-3d-toolbar">
      <label className="adverse-3d-search"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter entities and sources…" /></label>
      <select aria-label="Filter relationship type" value={relationshipFilter} onChange={e => setRelationshipFilter(e.target.value)}>
        <option value="all">All connections</option>
        {relationTypes.map(type => <option key={type} value={type}>{type}</option>)}
      </select>
      <button type="button" onClick={zoom.bind(null, 0.78)} aria-label="Zoom out"><ZoomOut size={15} /></button>
      <button type="button" onClick={zoom.bind(null, 1.28)} aria-label="Zoom in"><ZoomIn size={15} /></button>
      <button type="button" onClick={resetCamera}><RotateCcw size={15} /> Recenter</button>
      <button type="button" onClick={saveLayout}>Save layout</button>
      <button type="button" onClick={restoreLayout}>Restore</button>
      <button type="button" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {fullscreen ? 'Exit' : 'Expand'}</button>
    </div>
    <div ref={shellRef} className="adverse-3d-canvas" style={{ height: size.height }}>
      <div ref={hostRef} className="adverse-3d-canvas-host">
        <Graph3D
          ref={graphRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor="#050914"
          showNavInfo={false}
          controlType="orbit"
          nodeLabel={(node: any) => `${node.name} · ${node.type}${node.description ? '\\n' + node.description : ''}`}
          nodeColor={(node: any) => node.kind === 'source' ? '#55e0bd' : String(node.id) === selectedId ? '#f8d477' : '#7ba7ff'}
          nodeVal={(node: any) => node.kind === 'source' ? 3.5 : Math.max(4, Math.min(12, 4 + (node.evidenceIds || []).length))}
          nodeResolution={16}
          linkColor={(link: any) => link.kind === 'evidence' ? '#42d6b5' : verificationColor(link.verificationStatus)}
          linkWidth={(link: any) => link.kind === 'evidence' ? 0.8 : 1.4}
          linkOpacity={0.72}
          linkDirectionalParticles={(link: any) => link.kind === 'evidence' ? 2 : 1}
          linkDirectionalParticleWidth={1.8}
          linkDirectionalParticleSpeed={0.003}
          linkDirectionalParticleColor={(link: any) => link.kind === 'evidence' ? '#68f0d0' : verificationColor(link.verificationStatus)}
          onNodeClick={(node: any) => {
            const entity = visibleEntities.find(e => String(key(e) || e.name) === String(node.id));
            if (entity) { setActiveEntityId(String(key(entity) || entity.name)); setSelectedRelationshipId(''); onSelect(entity); }
            else if (node.url) window.open(node.url, '_blank', 'noopener,noreferrer');
          }}
          onLinkClick={(link: any) => setSelectedRelationshipId(String(link.relationshipId || link.id || ''))}
          onEngineStop={() => graphRef.current?.zoomToFit?.(500, 100)}
          enableNodeDrag
          enableNavigationControls
          enablePointerInteraction
          cooldownTicks={100}
          d3AlphaDecay={0.035}
          d3VelocityDecay={0.28}
        />
        <div className="adverse-3d-hud"><span>3D SCENE ACTIVE</span><span>ENTITY / SOURCE FIELD</span><span>ORBIT CAMERA</span></div>
      </div>
    </div>
    <div className="adverse-3d-legend">
      <span><i className="entity" /> Entities</span><span><i className="source" /> Saved sources</span>
      <span><i className="verified" /> Verified label</span><span><i className="disputed" /> Disputed label</span>
      <small>Colours represent saved review labels, not independent verification.</small>
    </div>
    {activeEntity && <section className="adverse-3d-inspector">
      <div><div className="adverse-3d-kicker">SELECTED ENTITY</div><h4>{activeEntity.name}</h4>
        <p>{activeEntity.type}{activeEntity.description ? ' · ' + activeEntity.description : ''}</p></div>
      <div className="adverse-3d-inspector-stats"><b>{activeRelations.length}</b> connected relationships</div>
      {activeRelations.map(r => <button type="button" key={relationshipKey(r)} className={selectedRelationshipId === relationshipKey(r) ? 'active' : ''} onClick={() => setSelectedRelationshipId(relationshipKey(r))}>
        {visibleEntities.find(e => String(key(e) || e.name) === String(r.fromEntityId))?.name || 'Unknown'} <strong>{r.type}</strong> {visibleEntities.find(e => String(key(e) || e.name) === String(r.toEntityId))?.name || 'Unknown'}
        <small>{verificationLabel(r.verificationStatus)} · {(r.evidenceIds || []).length} source links</small>
      </button>)}
      {selectedRelationshipId && <p className="adverse-3d-rationale">{activeRelations.find(r => relationshipKey(r) === selectedRelationshipId)?.rationale || 'No additional relationship rationale recorded.'}</p>}
    </section>}
  </section>;
}
