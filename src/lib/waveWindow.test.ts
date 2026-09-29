import { describe, it, expect } from 'vitest';
import { computeEventWindow } from './waveWindow';
import type { WaveData } from './types';

/**
 * Construye una WaveData sintética con energía solo entre [onset, decay] s
 * (un pulso simple) muestreada a `dt`. Fuera de esa banda la señal es cero.
 */
function synthWave(onset: number, decay: number, total: number, dt = 0.02): WaveData {
  const time: number[] = [];
  const north: number[] = [];
  const east: number[] = [];
  const vertical: number[] = [];
  const mid = (onset + decay) / 2;
  const halfWidth = (decay - onset) / 2;
  for (let t = 0; t <= total + 1e-9; t += dt) {
    time.push(Number(t.toFixed(4)));
    // Envolvente tipo campana dentro de [onset, decay], cero fuera.
    let a = 0;
    if (t >= onset && t <= decay) {
      const x = (t - mid) / halfWidth; // -1..1
      a = Math.cos((x * Math.PI) / 2) * Math.sin(t * 20); // oscila dentro de la campana
    }
    north.push(a);
    east.push(a * 0.6);
    vertical.push(a * 0.8);
  }
  return { time, north, east, vertical };
}

describe('computeEventWindow (B2)', () => {
  it('encuadra el pulso: inicio ~0.3 s antes de P, fin ~0.8 s tras el decaimiento', () => {
    // Señal entre 1.6 y 3.1 s en una duración total de 8 s (el caso reportado).
    const wave = synthWave(1.6, 3.1, 8);
    const win = computeEventWindow(wave, { pArrival: 1.6, sArrival: 2.4 });
    // Inicio: ~P − 0.3 = 1.3 (tolerancia por muestreo).
    expect(win.start).toBeGreaterThan(1.0);
    expect(win.start).toBeLessThan(1.45);
    // Fin: ~decaimiento (≈3.1) + 0.8 = 3.9 (tolerancia por umbral 5 %).
    expect(win.end).toBeGreaterThan(3.5);
    expect(win.end).toBeLessThan(4.2);
    // Ya no debe llegar a 0–6.
    expect(win.end - win.start).toBeLessThan(3.2);
  });

  it('no recorta por debajo de la señal disponible', () => {
    const wave = synthWave(1.6, 3.1, 8);
    const win = computeEventWindow(wave, { pArrival: 1.6, sArrival: 2.4 });
    expect(win.start).toBeGreaterThanOrEqual(0);
    expect(win.end).toBeLessThanOrEqual(8);
  });

  it('señal plana o muy corta devuelve la duración completa', () => {
    const flat: WaveData = { time: [0, 0.1, 0.2], north: [0, 0, 0], east: [0, 0, 0], vertical: [0, 0, 0] };
    const win = computeEventWindow(flat);
    expect(win.start).toBe(0);
    expect(win.end).toBe(0.2);
  });
});
