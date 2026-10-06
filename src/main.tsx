import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
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

// Captura errores de import() dinámico que NO pasan por vite:preloadError
// (p. ej. import() dentro de onClick, no en el módulo). Si el error es un
// chunk desactualizado, recarga una vez.
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '');
  if (/dynamically imported module|loading chunk|failed to fetch/i.test(msg)) {
    const KEY = 'sn-chunk-reload';
    if (!sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, '1');
      window.location.reload();
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
