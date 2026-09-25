/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Paleta central de SismoNariño (roles semánticos) ──
        // Los hex son los reales usados en el código, no los medidos de capturas.
        brand: {
          // Terracota: acción principal y alertas.
          terracotta: '#C4553A',
          // Verde bosque: datos reales, enlaces y acciones secundarias.
          forest: '#2D6A4F',
          // Azul noche: títulos y texto principal.
          ink: '#1A1A2E',
          // Crema: fondo global.
          cream: '#FAFAF8',
          // Gris de texto secundario (oscurecido para cumplir WCAG AA sobre crema).
          muted: '#5A5A5A',
          // Ocre: exclusivo para la componente BHZ (vertical) en señales.
          ochre: '#C9A227',
        },
        // Componentes de señal triaxial (fijas en todo el sitio).
        signal: {
          bhn: '#C4553A', // Norte  — terracota
          bhe: '#2D6A4F', // Este   — verde
          bhz: '#C9A227', // Vertical — ocre
        },
      },
    },
  },
  plugins: [],
};
