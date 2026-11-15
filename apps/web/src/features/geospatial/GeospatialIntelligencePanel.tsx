import { useEffect, useRef } from 'react';
import { createApp } from 'vue';
import GeospatialIntelligenceView from './GeospatialIntelligenceView.vue';

type GeospatialSaveHandler = (
  title: string,
  url: string,
  excerpt: string,
  publisher: string,
  entityType: 'organization' | 'domain' | 'document',
) => Promise<boolean>;

type Props = {
  onSave?: GeospatialSaveHandler;
  canSave?: boolean;
};

export default function GeospatialIntelligencePanel({ onSave, canSave = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latestProps = useRef({ onSave, canSave });
  latestProps.current = { onSave, canSave };

  useEffect(() => {
    if (!host.current) return;
    const app = createApp(GeospatialIntelligenceView, {
      onSave: (...args: Parameters<GeospatialSaveHandler>) =>
        latestProps.current.onSave?.(...args) ?? Promise.resolve(false),
      canSave: () => latestProps.current.canSave,
    });
    app.mount(host.current);
    return () => app.unmount();
  }, []);

  return <div className="geospatial-vue-mount" ref={host} />;
}
