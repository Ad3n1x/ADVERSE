import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './features/graph/graph-viewer.css';
import './media-analysis.css';
import './bright-theme.css';
import './pwa-install.css';
import './connection-status.css';
import './shared-link-handler.css';
import './polish.css';
import './search-engine-theme.css';
import './adverse-neo.css';

// The Android APK identifies itself with a dedicated user-agent marker.
// Set this before React mounts so download prompts never flash inside the app.
const isNativeAndroid = /ADVERSENativeAndroid\//i.test(navigator.userAgent);
if (isNativeAndroid) {
  document.documentElement.classList.add('adverse-native-android');
  document.documentElement.dataset.adverseApp = 'android';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('ADVERSE could not start: the #root application mount is missing.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
