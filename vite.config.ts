/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Excluir dependencias, el backend (pytest) y las pruebas E2E (Playwright,
    // que se corren con `playwright test`, no con Vitest) de la suite de Vitest.
    exclude: ['node_modules/**', 'backend/**', 'dist/**', 'e2e/**'],
  },
  server: {
    proxy: {
      // Redirige las llamadas /api al backend FastAPI en desarrollo.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    // `vite preview` sirve el dist de producción; proxyea /api al backend local
    // (equivalente al proxy de Nginx del contenedor e2e) para las pruebas E2E
    // en local sin Docker.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // El peso viene de three.js + leaflet (librerías 3D/mapa necesarias).
    // Separamos vendors en chunks y subimos el umbral del aviso.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          leaflet: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
});
