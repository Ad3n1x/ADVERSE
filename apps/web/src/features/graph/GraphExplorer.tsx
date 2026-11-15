import { lazy, Suspense, useState } from 'react';
import type { Entity, Evidence, Relationship } from '../../types/research';
import Graph3D from './Graph3D';

const Graph2D = lazy(() => import('./Graph'));

type Props = {
  entities: Entity[];
  evidence: Evidence[];
  relationships: Relationship[];
  onSelect: (entity: Entity) => void;
  selectedId: string;
  query: string;
  layoutKey: string;
};

export default function GraphExplorer(props: Props) {
  const [dimension, setDimension] = useState<'3d' | '2d'>('3d');
  return (
    <div className="graph-explorer-shell">
      <div className="graph-dimension-switch" role="group" aria-label="Graph display mode">
        <button type="button" className={dimension === '3d' ? 'active' : ''} aria-pressed={dimension === '3d'} onClick={() => setDimension('3d')}>3D space</button>
        <button type="button" className={dimension === '2d' ? 'active' : ''} aria-pressed={dimension === '2d'} onClick={() => setDimension('2d')}>2D layout</button>
      </div>
      {dimension === '3d'
        ? <Graph3D {...props} />
        : <Suspense fallback={<div className="graph3d-empty">Loading 2D graph…</div>}><Graph2D {...props} /></Suspense>}
    </div>
  );
}
