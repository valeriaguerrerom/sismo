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
  /** Arribo P (s), si se conoce. Sirve para anclar el inicio de la ventana. */
  pArrival?: number;
  /** Arribo S (s), si se conoce. */
  sArrival?: number;
  /** Segundos de "aire" antes del inicio del pulso. Por defecto 1.5 s. */
  padBefore?: number;
  /** Segundos de "aire" después del final del pulso. Por defecto 2.5 s. */
  padAfter?: number;
}

/**
 * Calcula la ventana del evento. Estrategia:
 *  - Inicio: el menor entre (P − padBefore) y (primer instante con |señal| por
 *    encima del 5 % del pico) − padBefore, acotado a ≥ 0.
 *  - Fin: el instante en que la envolvente cae por debajo del 5 % del pico tras
 *    su máximo, + padAfter (y al menos hasta S + padAfter si se conoce).
 *
 * Si la señal es muy corta o plana, devuelve la duración completa.
 */
export function computeEventWindow(
  wave: WaveData,
  opts: EventWindowOpts = {},
): { start: number; end: number } {
  const { pArrival, sArrival, padBefore = 1.5, padAfter = 2.5 } = opts;
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
  const thr = peak * 0.05;

  // Primer y último instante por encima del umbral.
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < n; i++) {
    if (mag[i] >= thr) { if (firstIdx < 0) firstIdx = i; lastIdx = i; }
  }
  if (firstIdx < 0) return full;

  const onsetT = t[firstIdx];
  const decayT = t[lastIdx];

  // Inicio: un poco antes del onset, o antes de P si se conoce y es anterior.
  const anchorStart = Math.min(onsetT, pArrival ?? onsetT);
  let start = Math.max(full.start, anchorStart - padBefore);
  // Fin: tras el decaimiento (y al menos tras la S si se conoce), con aire.
  const anchorEnd = Math.max(decayT, sArrival ?? decayT);
  let end = Math.min(full.end, anchorEnd + padAfter);

  // Salvaguarda: ventana mínima razonable de 6 s.
  if (end - start < 6) {
    const mid = (start + end) / 2;
    start = Math.max(full.start, mid - 3);
    end = Math.min(full.end, mid + 3);
  }
  if (end <= start) return full;
  return { start, end };
}
