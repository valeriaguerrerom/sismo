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
    // Excluir dependencias y el backend (pytest) de la suite de Vitest.
    exclude: ['node_modules/**', 'backend/**', 'dist/**'],
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
