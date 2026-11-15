import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { Entity, Evidence, Relationship } from '../../types/research';
import { getRecordId as key } from '../../lib/ids';

type Props = {
  entities: Entity[];
  evidence: Evidence[];
  relationships: Relationship[];
  onSelect: (entity: Entity) => void;
  selectedId: string;
  query: string;
  layoutKey: string;
};
type Node = {
  id: string;
  name: string;
  kind: 'entity' | 'source';
  type: string;
  description: string;
  url?: string;
  evidenceIds: string[];
};
type Link = {
  source: string;
  target: string;
  type: string;
  kind: 'relationship' | 'evidence';
  verificationStatus?: string;
};
const ForceGraph3DComponent = ForceGraph3D as ComponentType<any>;

function Graph3D({ entities, evidence, relationships, onSelect, selectedId, query, layoutKey }: Props) {
  const graphRef = useRef<any>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 520 });
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const selectedEntity = entities.find(entity => String(key(entity) || entity.name) === selectedId);
  const selectedEvidence = evidence.find((item, index) => 'source-' + String(key(item) || index) === selectedSourceId);
  const selectedRelationships = selectedEntity ? relationships.filter(item => String(item.fromEntityId) === selectedId || String(item.toEntityId) === selectedId) : [];
  const selectedEvidenceIds = new Set([...(selectedEntity?.evidenceIds || []), ...selectedRelationships.flatMap(item => item.evidenceIds || [])].map(String));
  const connectedEvidence = evidence.filter((item, index) => selectedEvidenceIds.has(String(key(item) || index)));
  const normalizedQuery = query.trim().toLowerCase();

  const graphData = useMemo(() => {
    const visibleEntities = entities.filter(entity =>
      (entity.name + ' ' + entity.type + ' ' + (entity.description || '')).toLowerCase().includes(normalizedQuery)
    );
    const entityIds = new Set(visibleEntities.map(entity => String(key(entity) || entity.name)));
    const visibleEvidence = evidence.filter(item =>
      ((item.title || '') + ' ' + (item.publisher || '') + ' ' + (item.url || '') + ' ' + (item.excerpt || '')).toLowerCase().includes(normalizedQuery)
    );
    const sourceNodes: Node[] = visibleEvidence.map((item, index) => ({
      id: 'source-' + String(key(item) || index),
      name: item.title || item.publisher || item.url || 'Saved source',
      kind: 'source',
      type: 'evidence source',
      description: item.publisher || item.url || 'Saved research source',
      url: item.url || undefined,
      evidenceIds: [String(key(item) || index)]
    }));
    const sourceIds = new Set(sourceNodes.map(node => node.id));
    const entityNodes: Node[] = visibleEntities.map(entity => ({
      id: String(key(entity) || entity.name),
      name: entity.name || 'Unnamed entity',
      kind: 'entity',
      type: entity.type || 'entity',
      description: entity.description || '',
      evidenceIds: (entity.evidenceIds || []).map(String)
    }));
    const links: Link[] = relationships
      .filter(item => entityIds.has(String(item.fromEntityId)) && entityIds.has(String(item.toEntityId)))
      .map(item => ({
        source: String(item.fromEntityId),
        target: String(item.toEntityId),
        type: item.type || 'related',
        kind: 'relationship',
        verificationStatus: item.verificationStatus
      }));
    for (const entity of visibleEntities) {
      const entityId = String(key(entity) || entity.name);
      for (const evidenceId of entity.evidenceIds || []) {
        const sourceId = 'source-' + String(evidenceId);
        if (sourceIds.has(sourceId)) links.push({ source: entityId, target: sourceId, type: 'supported by saved source', kind: 'evidence' });
      }
    }
    for (const relationship of relationships) {
      if (!entityIds.has(String(relationship.fromEntityId)) || !entityIds.has(String(relationship.toEntityId))) continue;
      for (const evidenceId of relationship.evidenceIds || []) {
        const sourceId = 'source-' + String(evidenceId);
        if (sourceIds.has(sourceId)) {
          links.push({ source: String(relationship.fromEntityId), target: sourceId, type: 'source attached to ' + (relationship.type || 'relationship'), kind: 'evidence' });
          links.push({ source: String(relationship.toEntityId), target: sourceId, type: 'source attached to ' + (relationship.type || 'relationship'), kind: 'evidence' });
        }
      }
    }
    return { nodes: [...entityNodes, ...sourceNodes], links };
  }, [entities, evidence, relationships, normalizedQuery]);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const update = () => setSize(current => {
      const width = Math.max(280, Math.floor(element.clientWidth));
      return current.width === width ? current : { ...current, width };
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedSourceId('');
  }, [layoutKey]);

  useEffect(() => {
    if (!graphData.nodes.length) return;
    const frame = requestAnimationFrame(() => graphRef.current?.zoomToFit?.(650, 90));
    return () => cancelAnimationFrame(frame);
  }, [graphData.nodes.length, graphData.links.length, layoutKey]);

  const fit = () => graphRef.current?.zoomToFit?.(550, 90);
  const zoom = (factor: number) => {
    const current = graphRef.current?.cameraPosition?.();
    if (current) graphRef.current?.cameraPosition?.({ x: current.x / factor, y: current.y / factor, z: current.z / factor }, undefined, 250);
  };

  if (!graphData.nodes.length) {
    return <div className="graph3d-empty"><b>No 3D network data yet</b><span>Save evidence or record entities and relationships in this collection. The 3D network is built from those saved records.</span></div>;
  }

  return (
    <section className="graph3d-panel" aria-label="Three-dimensional evidence relationship graph">
      <div className="graph3d-toolbar">
        <div><strong>3D RELATIONSHIP SPACE</strong><span>{graphData.nodes.filter(node => node.kind === 'entity').length} entities · {graphData.nodes.filter(node => node.kind === 'source').length} sources · {graphData.links.length} links</span></div>
        <div className="graph3d-controls">
          <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">＋</button>
          <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
          <button type="button" onClick={fit}>Fit network</button>
        </div>
      </div>
      <div className="graph3d-canvas" ref={shellRef} style={{ height: size.height }} role="region" aria-label="Drag to rotate the 3D network; scroll to zoom; select a node for details">
        <ForceGraph3DComponent
          ref={graphRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor="#070d18"
          showNavInfo={false}
          controlType="orbit"
          nodeLabel={(node: Node) => node.name + ' · ' + node.type + (node.description ? '\n' + node.description : '')}
          nodeColor={(node: Node) => node.id === selectedId ? '#ffe08a' : node.kind === 'source' ? '#52d6b0' : '#62cfff'}
          nodeVal={(node: Node) => node.kind === 'source' ? 3 : 5 + Math.min(5, node.evidenceIds.length)}
          nodeResolution={10}
          linkColor={(link: Link) => link.kind === 'evidence' ? '#52d6b0' : ['verified', 'confirmed', 'independently verified'].includes(String(link.verificationStatus || '').toLowerCase()) ? '#66d3a0' : ['disputed', 'conflicting', 'contradicted', 'rejected'].includes(String(link.verificationStatus || '').toLowerCase()) ? '#ff7171' : '#6c8db8'}
          linkWidth={(link: Link) => link.kind === 'evidence' ? 0.8 : 1.25}
          linkOpacity={0.72}
          linkLabel={(link: Link) => link.type + ' · ' + (link.kind === 'evidence' ? 'saved source association' : link.verificationStatus || 'unverified')}
          linkDirectionalParticles={(link: Link) => link.kind === 'evidence' ? 2 : 1}
          linkDirectionalParticleWidth={1.8}
          linkDirectionalParticleSpeed={0.003}
          linkDirectionalArrowLength={2.8}
          linkDirectionalArrowRelPos={1}
          cooldownTicks={120}
          d3AlphaDecay={0.035}
          d3VelocityDecay={0.32}
          enableNodeDrag
          enableNavigationControls
          onEngineStop={() => graphRef.current?.zoomToFit?.(450, 85)}
          onNodeClick={(node: Node) => {
            if (node.kind === 'entity') {
              const entity = entities.find(item => String(key(item) || item.name) === node.id);
              if (entity) onSelect(entity);
            } else {
              setSelectedSourceId(node.id);
            }
          }}
          rendererConfig={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
        />
      </div>
      {(selectedEntity || selectedEvidence) && <aside className="graph3d-inspector" aria-live="polite">
        {selectedEntity && <div className="graph3d-inspector-main">
          <div className="graph3d-inspector-heading"><span>SELECTED ENTITY</span><b>{selectedEntity.name}</b><small>{selectedEntity.type || 'Entity'}</small></div>
          {selectedEntity.description && <p>{selectedEntity.description}</p>}
          <div className="graph3d-inspector-columns">
            <div><small>RECORDED RELATIONSHIPS</small><b>{selectedRelationships.length}</b></div>
            <div><small>LINKED EVIDENCE</small><b>{connectedEvidence.length}</b></div>
          </div>
          {selectedRelationships.length > 0 && <div className="graph3d-inspector-section"><strong>RELATIONSHIPS</strong>
            {selectedRelationships.map((relationship, index) => {
              const otherId = String(relationship.fromEntityId) === selectedId ? String(relationship.toEntityId) : String(relationship.fromEntityId);
              const other = entities.find(entity => String(key(entity) || entity.name) === otherId);
              return <button type="button" className="graph3d-relation-row" key={String(key(relationship) || index)} onClick={() => other && onSelect(other)}>
                <span>{relationship.type || 'Related to'} <b>{other?.name || 'Unknown entity'}</b></span>
                <small>{relationship.verificationStatus || 'Unverified'} · confidence {relationship.confidence || 'not recorded'}</small>
              </button>;
            })}
          </div>}
          {connectedEvidence.length > 0 && <div className="graph3d-inspector-section"><strong>ASSOCIATED EVIDENCE</strong>
            {connectedEvidence.map((item, index) => <button type="button" className="graph3d-source-row" key={String(key(item) || index)} onClick={() => setSelectedSourceId('source-' + String(key(item) || index))}>
              <span>{item.title || item.publisher || 'Saved source'}</span><small>{item.publisher || item.sourceType || 'Source'} · {item.verificationStatus || 'Unverified'}</small>
            </button>)}
          </div>}
        </div>}
        {selectedEvidence && <div className="graph3d-inspector-source">
          <div className="graph3d-inspector-heading"><span>SELECTED SOURCE</span><b>{selectedEvidence.title || selectedEvidence.publisher || 'Saved source'}</b><small>{selectedEvidence.publisher || selectedEvidence.sourceType || 'Evidence'}</small></div>
          <p>{selectedEvidence.excerpt || 'No excerpt was saved for this source.'}</p>
          <div className="graph3d-source-meta"><span>{selectedEvidence.verificationStatus || 'Unverified'}</span><span>{selectedEvidence.publishedAt ? 'Published ' + new Date(selectedEvidence.publishedAt).toLocaleDateString() : 'Publication date not recorded'}</span></div>
          {selectedEvidence.url && <a href={selectedEvidence.url} target="_blank" rel="noopener noreferrer">Open original source ↗</a>}
        </div>}
      </aside>}
      <div className="graph3d-legend"><span><i className="entity-dot"/> Entities</span><span><i className="source-dot"/> Saved sources</span><span><i className="edge-dot"/> Recorded relationship</span><small>Rotate by dragging · Scroll to zoom · Select nodes to inspect</small></div>
      <p className="graph3d-disclaimer">Connections represent relationships recorded in this collection. They are not independent verification of a claim.</p>
    </section>
  );
}
export default Graph3D;
