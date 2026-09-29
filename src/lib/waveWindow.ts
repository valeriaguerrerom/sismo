/**
 * Ventana "del evento" para los sismogramas (B1). Devuelve el rango temporal
 * [start, end] que encuadra el pulso sísmico: desde un poco antes del arribo P
 * (o del primer punto con energía apreciable) hasta un poco después de que la
 * señal decae. Así el pulso llena el gráfico en vez de perderse en una ventana
 * larga con mucho reposo o cola.
 *
 * La misma función la usan la pantalla (`WaveChart` vía `Simulation`) y el
 * reporte PDF, para que ambos muestren el mismo encuadre.
 *
 * @module lib/waveWindow
 */
import type { WaveData } from './types';

export interface EventWindowOpts {
  /** Arribo P (s), si se conoce. Ancla el inicio de la ventana (P − padBefore). */
  pArrival?: number;
  /** Arribo S (s), si se conoce. */
  sArrival?: number;
  /** Segundos de "aire" antes del arribo P. Por defecto 0.3 s. */
  padBefore?: number;
  /** Segundos de "aire" tras el decaimiento de la última fase. Por defecto 0.8 s. */
  padAfter?: number;
}

/**
 * Calcula la ventana del evento para encuadrar el pulso en el gráfico.
 *
 * Criterio (acordado con el usuario):
 *  - **Inicio**: unos `padBefore` s antes del arribo P (o, si no se conoce P,
 *    antes del primer instante con energía sobre el 5 % del pico).
 *  - **Fin**: unos `padAfter` s después de que la energía de la ÚLTIMA fase cae
 *    por debajo del 5 % de su pico (último instante de la envolvente ≥ 5 % del
 *    máximo). Si se conoce S, la ventana llega al menos hasta la S.
 *
 * Si la señal es muy corta o plana, devuelve la duración completa.
 */
export function computeEventWindow(
  wave: WaveData,
  opts: EventWindowOpts = {},
): { start: number; end: number } {
  const { pArrival, sArrival, padBefore = 0.3, padAfter = 0.8 } = opts;
  const t = wave.time;
  const n = t.length;
  const full = { start: t[0] ?? 0, end: t[n - 1] ?? 1 };
  if (n < 8) return full;

  // Envolvente por magnitud de las tres componentes.
  const mag = new Array<number>(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const m = Math.abs(wave.north[i]) + Math.abs(wave.east[i]) + Math.abs(wave.vertical[i]);
    mag[i] = m;
    if (m > peak) peak = m;
  }
  if (peak <= 0) return full;
  const thr = peak * 0.05; // 5 % del pico

  // Primer y último instante por encima del umbral (la última fase que decae).
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < n; i++) {
    if (mag[i] >= thr) { if (firstIdx < 0) firstIdx = i; lastIdx = i; }
  }
  if (firstIdx < 0) return full;

  const onsetT = t[firstIdx];
  const decayT = t[lastIdx];

  // Inicio: padBefore antes del arribo P (si se conoce y es válido) o del onset
  // de energía, lo que sea más temprano para no cortar el comienzo del pulso.
  const pRef = (pArrival !== undefined && pArrival > 0) ? pArrival : onsetT;
  const anchorStart = Math.min(pRef, onsetT);
  let start = Math.max(full.start, anchorStart - padBefore);
  // Fin: padAfter tras el decaimiento de la última fase (y al menos hasta S).
  const anchorEnd = Math.max(decayT, sArrival ?? decayT);
  let end = Math.min(full.end, anchorEnd + padAfter);

  // Salvaguarda mínima (solo casos degenerados): al menos 1.5 s de ventana.
  if (end - start < 1.5) {
    const mid = (start + end) / 2;
    start = Math.max(full.start, mid - 0.75);
    end = Math.min(full.end, mid + 0.75);
  }
  if (end <= start) return full;
  return { start, end };
}
