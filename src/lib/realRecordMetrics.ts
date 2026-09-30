/**
 * Métricas de un REGISTRO REAL (SGC/OVSP) calculadas directamente sobre la
 * señal, sin ninguna simulación FDM de apoyo. Se usan en el panel de
 * resultados y en el reporte PDF cuando lo que se carga es un sismograma real
 * (no un pseudo-sismograma simulado).
 *
 * A diferencia de una simulación, aquí NO hay malla, ni arribos P/S teóricos,
 * ni fotogramas: solo lo que se puede medir sobre las tres trazas reales.
 *
 * @module lib/realRecordMetrics
 */
import type { WaveData } from './types';

/** Métricas medibles sobre un registro real triaxial. */
export interface RealRecordMetrics {
  /** Pico de amplitud (unidades arbitrarias, señal normalizada a ±1). */
  maxAmplitude: number;
  /** Duración total del registro (s). */
  duration: number;
  /** Frecuencia de muestreo estimada del registro decimado (Hz). */
  sampleRate: number;
  /** Número de muestras por componente. */
  numSamples: number;
  /** Frecuencia dominante estimada (Hz) por densidad espectral (DFT). */
  dominantFrequency: number;
  /** Instante del pico de energía |u| respecto al inicio (s). */
  peakTime: number;
}

/**
 * Estima la frecuencia dominante de la señal como la frecuencia con mayor
 * energía en el espectro de la magnitud del movimiento |u| = √(N²+E²+Z²).
 * Usa una DFT directa sobre un número acotado de bins (la señal ya está
 * decimada, así que basta con explorar hasta Nyquist con pocos cientos de
 * frecuencias). No pretende precisión de laboratorio: es un descriptor.
 */
function estimateDominantFrequency(mag: number[], dt: number): number {
  const n = mag.length;
  if (n < 8 || dt <= 0) return 0;
  // Quita la media para no meter un pico enorme en f=0.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += mag[i];
  mean /= n;

  const nyquist = 0.5 / dt;
  // Exploramos un número acotado de frecuencias entre ~0.1 Hz y Nyquist.
  const NBINS = 240;
  const fMin = Math.max(0.1, nyquist / NBINS);
  let bestF = 0;
  let bestPower = -1;
  for (let k = 1; k <= NBINS; k++) {
    const f = fMin + ((nyquist - fMin) * (k - 1)) / (NBINS - 1);
    const w = 2 * Math.PI * f * dt;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const v = mag[i] - mean;
      re += v * Math.cos(w * i);
      im -= v * Math.sin(w * i);
    }
    const power = re * re + im * im;
    if (power > bestPower) {
      bestPower = power;
      bestF = f;
    }
  }
  return bestF;
}

/**
 * Calcula las métricas medibles de un registro real triaxial.
 *
 * @param waveData Series Norte/Este/Vertical del registro real.
 * @returns Métricas de amplitud, duración, muestreo y frecuencia dominante.
 */
export function computeRealRecordMetrics(waveData: WaveData): RealRecordMetrics {
  const { time, north, east, vertical } = waveData;
  const n = time.length;
  if (n === 0) {
    return { maxAmplitude: 0, duration: 0, sampleRate: 0, numSamples: 0, dominantFrequency: 0, peakTime: 0 };
  }

  const duration = time[n - 1] ?? 0;
  const dt = n > 1 ? (duration - (time[0] ?? 0)) / (n - 1) : 0;
  const sampleRate = dt > 0 ? 1 / dt : 0;

  // Pico de amplitud y magnitud del movimiento |u| para el descriptor espectral.
  const mag = new Array<number>(n);
  let maxAmplitude = 0;
  let peakMag = 0;
  let peakIdx = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(north[i]);
    const b = Math.abs(east[i]);
    const c = Math.abs(vertical[i]);
    if (a > maxAmplitude) maxAmplitude = a;
    if (b > maxAmplitude) maxAmplitude = b;
    if (c > maxAmplitude) maxAmplitude = c;
    const m = Math.sqrt(north[i] * north[i] + east[i] * east[i] + vertical[i] * vertical[i]);
    mag[i] = m;
    if (m > peakMag) { peakMag = m; peakIdx = i; }
  }

  const dominantFrequency = estimateDominantFrequency(mag, dt);

  return {
    maxAmplitude,
    duration,
    sampleRate,
    numSamples: n,
    dominantFrequency,
    peakTime: time[peakIdx] ?? 0,
  };
}
