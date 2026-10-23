import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-icon-192.svg', 'pwa-icon-512.svg'],
      manifest: {
        id: '/',
        name: 'ADVERSE — Public-Source Intelligence Workspace',
        short_name: 'ADVERSE',
        description: 'Investigate public sources, map connections, trace timelines, and organize evidence with transparent provenance.',
        theme_color: '#080d12',
        background_color: '#080d12',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        share_target: {
          action: '/?share_target=1',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' }
        },
        icons: [
          { src: '/pwa-icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Open Intelligence Desk', short_name: 'IntelliDesk', url: '/?tab=Intelligence%20Desk' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/download\/?$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:4000' } }
});
