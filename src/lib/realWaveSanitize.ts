/**
 * Saneamiento de registros reales con TRANSITORIO DE BORDE al inicio.
 *
 * Algunos JSON del Galeras (los reprocesados con diezmado sobre trazas largas)
 * traen un pico artificial enorme en las primeras muestras: es el transitorio
 * del filtro antialias del `decimate`, no señal sísmica. Ese pico domina la
 * normalización y aplasta la señal real (queda ~500× más pequeña), así que los
 * sismogramas se ven planos y la "ventana del evento" colapsa a 0–1 s.
 *
 * Esta función detecta ese transitorio de arranque y lo atenúa (taper a cero en
 * la ventana inicial afectada), sin inventar señal: solo elimina un artefacto
 * de procesamiento. Si el registro no tiene ese patrón (los eventos cortos
 * originales), se devuelve intacto.
 *
 * @module lib/realWaveSanitize
 */
import type { WaveData } from './types';

/** Percentil p (0–100) de un array (copia ordenada). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

/**
 * Sanea una WaveData de registro real quitando un transitorio de borde inicial
 * si lo hay. Devuelve la MISMA referencia si no hace falta tocar nada.
 */
export function sanitizeRealWave(wave: WaveData): WaveData {
  const n = wave.time.length;
  if (n < 40) return wave;

  const mag = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    mag[i] = Math.abs(wave.north[i]) + Math.abs(wave.east[i]) + Math.abs(wave.vertical[i]);
  }
  const peak = Math.max(...mag);
  if (peak <= 0) return wave;

  // Percentil 99 del CUERPO de la señal (ignorando el arranque). Si el pico
  // global es muchísimo mayor que el p99 y ocurre al inicio, es un transitorio
  // de borde artificial, no el evento.
  const sortedBody = mag.slice(Math.floor(n * 0.02)).slice().sort((a, b) => a - b);
  const p99 = percentile(sortedBody, 99) || 1e-30;
  const peakIdx = mag.indexOf(peak);
  const onsetFrac = peakIdx / n;

  const isEdgeTransient = peak / p99 > 20 && onsetFrac < 0.05;
  if (!isEdgeTransient) return wave;

  // Fin del transitorio: se avanza desde el pico hasta que la magnitud se
  // mantenga por debajo de ~4× el p99 del cuerpo durante VARIAS muestras
  // seguidas (el transitorio del filtro decae de forma oscilante, así que una
  // sola muestra baja no basta). Tope del 5 % de las muestras para no comerse
  // señal real.
  const maxCut = Math.floor(n * 0.05);
  const backTo = 4 * p99;
  const settleNeeded = Math.max(5, Math.floor(n * 0.004)); // muestras seguidas bajo el umbral
  let cut = peakIdx;
  let settled = 0;
  while (cut < maxCut) {
    if (mag[cut] <= backTo) {
      settled++;
      if (settled >= settleNeeded) break;
    } else {
      settled = 0;
    }
    cut++;
  }
  cut = Math.min(cut + 2, maxCut); // un par de muestras de margen

  // Taper coseno a cero en [0, cut]: elimina el transitorio sin dejar un escalón
  // (que volvería a meter un frente artificial en el espectro).
  const out: WaveData = {
    time: wave.time.slice(),
    north: wave.north.slice(),
    east: wave.east.slice(),
    vertical: wave.vertical.slice(),
  };
  for (let i = 0; i <= cut; i++) {
    const w = 0.5 * (1 - Math.cos((Math.PI * i) / (cut + 1))); // 0→1 suave
    out.north[i] *= w;
    out.east[i] *= w;
    out.vertical[i] *= w;
  }
  return out;
}
