/**
 * Colores oficiales por TIPO DE ONDA sísmica, usados en todo el sitio
 * (Educación, metodología FDM, glosario, PDF, Mapa 3D).
 *
 * No confundir con los colores por COMPONENTE del registro triaxial
 * (Norte/Este/Vertical), que viven en la paleta `signal` de tailwind.config.js
 * y NO cambian: N terracota, E verde, Z ocre.
 * @module waveColors
 */

/** Tipos de onda con color asignado. */
export type WaveType = 'P' | 'S' | 'Love' | 'Rayleigh';

/**
 * Color único por tipo de onda (hex), coherente con la paleta de marca:
 * - P        → terracota (color primario, acción/primera llegada)
 * - S        → verde bosque
 * - Love     → azul noche
 * - Rayleigh → ocre
 */
export const WAVE_COLORS: Record<WaveType, string> = {
  P: '#C4553A',
  S: '#2D6A4F',
  Love: '#1A1A2E',
  Rayleigh: '#C9A227',
};

/** Igual que WAVE_COLORS pero como terna RGB (para jsPDF). */
export const WAVE_COLORS_RGB: Record<WaveType, [number, number, number]> = {
  P: [196, 85, 58],
  S: [45, 106, 79],
  Love: [26, 26, 46],
  Rayleigh: [201, 162, 39],
};
