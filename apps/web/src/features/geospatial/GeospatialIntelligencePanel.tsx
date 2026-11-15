import { useEffect, useRef } from 'react';
import { createApp } from 'vue';
import GeospatialIntelligenceView from './GeospatialIntelligenceView.vue';

export default function GeospatialIntelligencePanel() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const app = createApp(GeospatialIntelligenceView);
    app.mount(host.current);
    return () => app.unmount();
  }, []);

  return <div className="geospatial-vue-mount" ref={host} />;
}
