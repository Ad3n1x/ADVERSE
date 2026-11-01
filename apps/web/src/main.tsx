import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './features/graph/graph-viewer.css';
import './media-analysis.css';
import './bright-theme.css';
import './pwa-install.css';
import './connection-status.css';

// The Android APK identifies itself with a dedicated user-agent marker.
// Set this before React mounts so download prompts never flash inside the app.
const isNativeAndroid = /ADVERSENativeAndroid\//i.test(navigator.userAgent);
if (isNativeAndroid) {
  document.documentElement.classList.add('adverse-native-android');
  document.documentElement.dataset.adverseApp = 'android';
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
import './shared-link-handler.css';
import './polish.css';
import './search-engine-theme.css';
