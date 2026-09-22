import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import 'leaflet/dist/leaflet.css';
import './index.css';

// Always start at top on load/reload
window.scrollTo(0, 0);
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
