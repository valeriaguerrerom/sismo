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

// Tras un redeploy, el navegador puede conservar un index.html viejo que apunta
// a chunks con hash que ya no existen. Cuando un import dinámico (p. ej. el
// generador de PDF) falla por eso, Vite emite 'vite:preloadError'. Recargamos
// una sola vez para traer el index.html nuevo y sus chunks actuales.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'sn-reloaded-preload';
  if (!sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, '1');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
