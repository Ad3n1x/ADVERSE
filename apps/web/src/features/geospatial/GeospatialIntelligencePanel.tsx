import { useEffect, useRef } from 'react';
import { createApp } from 'vue';
import GeospatialIntelligenceView from './GeospatialIntelligenceView.vue';

type GeospatialSaveHandler = (
  title: string,
  url: string,
  excerpt: string,
  publisher: string,
  sourceType: string,
) => void | Promise<void>;

type Props = {
  onSave?: GeospatialSaveHandler;
  canSave?: boolean;
};

export default function GeospatialIntelligencePanel({ onSave, canSave = false }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const app = createApp(GeospatialIntelligenceView, { onSave, canSave });
    app.mount(host.current);
    return () => app.unmount();
  }, [onSave, canSave]);

  return <div className="geospatial-vue-mount" ref={host} />;
}
