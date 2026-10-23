import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './features/graph/graph-viewer.css';
import './media-analysis.css';
import './bright-theme.css';
import './pwa-install.css';
import './connection-status.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
