import { describe, it, expect } from 'vitest';
import { alignSyntheticToModel, warpTime } from './alignSynthetic';
import type { SyntheticResult } from './api3d';

/**
 * Construye un sintético de prueba con un eje temporal uniforme y dos "paquetes"
 * de energía: la onda P arrancando en `tP` y la S en `tS`. Fuera de esos
 * paquetes la señal es cero (reposo), de modo que el "inicio de la onda P" es
 * detectable como el primer instante en que la amplitud supera un umbral.
 */
function makeSynthetic(tP: number, tS: number, dt = 0.02, dur = 40): SyntheticResult {
  const n = Math.round(dur / dt) + 1;
  const t: number[] = [];
  const vertical: number[] = [];
  const east: number[] = [];
  // Un pulso de 1.5 s con ONSET ABRUPTO (amplitud máxima en la primera muestra
  // tras la llegada) para que el "inicio" sea detectable justo en `start`.
  const pulse = (time: number, start: number) => {
    const x = time - start;
    if (x < 0 || x > 1.5) return 0;
    return Math.cos((x / 1.5) * (Math.PI / 2)); // 1 en el inicio, 0 al final
  };
  for (let i = 0; i < n; i++) {
    const time = i * dt;
    t.push(time);
    vertical.push(pulse(time, tP));          // P más visible en la vertical
    east.push(pulse(time, tS) * 0.8);        // S en la horizontal
  }
  return {
    t, north: east.slice(), east, vertical,
    tP_detectado: tP, tS_detectado: tS,
    cfl_ok: true, tiempo_computo_ms: 0, nx: 10, nz: 10, dx_m: 100, dt_s: dt,
  };
}

/** Primer instante en que |vertical| supera un umbral relativo (inicio de P). */
function onsetTime(syn: SyntheticResult, comp: 'vertical' | 'east', relThr = 0.1): number | null {
  const series = syn[comp];
  let maxAbs = 1e-9;
  for (const v of series) maxAbs = Math.max(maxAbs, Math.abs(v));
  const thr = maxAbs * relThr;
  for (let i = 0; i < series.length; i++) {
    if (Math.abs(series[i]) >= thr) return syn.t[i];
  }
  return null;
}

describe('warpTime', () => {
  it('mapea los anclajes 0, P y S exactamente', () => {
    expect(warpTime(0, 4, 7, 6, 12)).toBeCloseTo(0, 6);
    expect(warpTime(4, 4, 7, 6, 12)).toBeCloseTo(6, 6);   // P origen → P destino
    expect(warpTime(7, 4, 7, 6, 12)).toBeCloseTo(12, 6);  // S origen → S destino
  });

  it('es monótona creciente', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 30; t += 0.5) {
      const w = warpTime(t, 4, 7, 6, 12);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('alignSyntheticToModel', () => {
  it('mueve el inicio de la onda P al tP del modelo (tolerancia pequeña)', () => {
    // Sintético homogéneo: P en 4 s, S en 7 s.
    const syn = makeSynthetic(4, 7);
    // Modelo IASP91 (ejemplo): P llega antes (3.2 s) y S en 6.1 s.
    const tPModel = 3.2, tSModel = 6.1;
    const aligned = alignSyntheticToModel(syn, tPModel, tSModel);

    const onsetP = onsetTime(aligned, 'vertical');
    const onsetS = onsetTime(aligned, 'east');
    expect(onsetP).not.toBeNull();
    expect(onsetS).not.toBeNull();
    // El inicio de P debe caer en el tP del modelo dentro de ~1 paso de muestreo.
    expect(Math.abs(onsetP! - tPModel)).toBeLessThan(0.05);
    expect(Math.abs(onsetS! - tSModel)).toBeLessThan(0.05);
    // Los tiempos reportados quedan EXACTAMENTE en los del modelo.
    expect(aligned.tP_detectado).toBeCloseTo(tPModel, 6);
    expect(aligned.tS_detectado).toBeCloseTo(tSModel, 6);
  });

  it('para el modelo homogéneo (tP/tS iguales) no mueve el inicio', () => {
    const syn = makeSynthetic(4, 7);
    const aligned = alignSyntheticToModel(syn, 4, 7);
    const onsetP = onsetTime(aligned, 'vertical');
    expect(Math.abs(onsetP! - 4)).toBeLessThan(0.05);
  });

  it('devuelve el sintético sin cambios si faltan tiempos de modelo', () => {
    const syn = makeSynthetic(4, 7);
    expect(alignSyntheticToModel(syn, null, 7)).toBe(syn);
    expect(alignSyntheticToModel(syn, 4, null)).toBe(syn);
  });
});
