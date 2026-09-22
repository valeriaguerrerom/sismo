import { describe, it, expect } from 'vitest';
import { downsampleWave } from './reportPdf';
import { interpretSimulation, depthClass } from './interpretation';
import { simulationsByMonth } from './adminExport';
import type { SimulationParams, WaveData } from './types';

const params: SimulationParams = {
  vp: 3500, vs: 2000, density: 2600, lambda: 1.1e10, mu: 1.04e10,
  sourceType: 'tectonic', magnitude: 5, depth: 15,
  epicenterLat: 1.2136, epicenterLon: -77.2811, duration: 60, dx: 100, dt: 0.02,
};

describe('downsampleWave', () => {
  const n = 3000;
  const wave: WaveData = { time: [], north: [], east: [], vertical: [] };
  for (let i = 0; i < n; i++) {
    wave.time.push(i * 0.02);
    wave.north.push(Math.sin(i / 50));
    wave.east.push(0);
    wave.vertical.push(i === 1234 ? 9 : 0); // pico aislado
  }

  it('reduce a como máximo maxPoints muestras', () => {
    const out = downsampleWave(wave, 600);
    expect(out.time.length).toBeLessThanOrEqual(600);
    expect(out.north.length).toBe(out.time.length);
    expect(out.east.length).toBe(out.time.length);
    expect(out.vertical.length).toBe(out.time.length);
  });

  it('conserva los picos de amplitud', () => {
    const out = downsampleWave(wave, 600);
    expect(Math.max(...out.vertical)).toBe(9);
  });

  it('no altera series ya cortas', () => {
    const short: WaveData = { time: [0, 1, 2], north: [1, 2, 3], east: [0, 0, 0], vertical: [0, 0, 0] };
    expect(downsampleWave(short, 600)).toBe(short);
  });
});

describe('interpretSimulation (RF-12)', () => {
  it('describe fuente, profundidad, medio y arribos', () => {
    const text = interpretSimulation({ params, dominantFrequency: 2.5, pArrival: 4.3, sArrival: 7.8, gridInfo: { nx: 200, nz: 150, totalSteps: 3000 } });
    expect(text).toContain('tectónica');
    expect(text).toContain('Mw 5.0');
    expect(text).toContain('superficial');
    expect(text).toContain('200×150');
    expect(text).toContain('2.5 Hz');
    expect(text).toContain('S−P de 3.50 s');
    expect(text).toContain('doble par');
  });

  it('distingue el mecanismo volcánico y advierte ajustes de malla', () => {
    const text = interpretSimulation({ params: { ...params, sourceType: 'volcanic', depth: 80 }, dominantFrequency: 1, gridInfo: { nx: 100, nz: 100, totalSteps: 10, dtAdjusted: true } });
    expect(text).toContain('volcánica');
    expect(text).toContain('profunda');
    expect(text).toContain('isótropo');
    expect(text).toContain('CFL');
  });

  it('clasifica la profundidad focal', () => {
    expect(depthClass(10)).toBe('superficial');
    expect(depthClass(50)).toBe('intermedia');
    expect(depthClass(120)).toBe('profunda');
  });
});

describe('simulationsByMonth (RF-23)', () => {
  it('agrupa reportes por mes en orden cronológico', () => {
    const mk = (d: string) => ({ id: d, user_id: 'u', title: 't', notes: '', created_at: d, params: {}, results: {} });
    const rows = [mk('2026-03-10T00:00:00Z'), mk('2026-01-05T00:00:00Z'), mk('2026-03-22T00:00:00Z')];
    expect(simulationsByMonth(rows)).toEqual([{ month: '2026-01', count: 1 }, { month: '2026-03', count: 2 }]);
  });
});

describe('buildReportPdf (RF-19)', () => {
  it('genera un PDF con al menos una página y contenido', async () => {
    const { buildReportPdf } = await import('./reportPdf');
    const wave: WaveData = { time: [], north: [], east: [], vertical: [] };
    for (let i = 0; i < 400; i++) {
      wave.time.push(i * 0.1);
      wave.north.push(Math.sin(i / 10));
      wave.east.push(Math.cos(i / 12));
      wave.vertical.push(Math.sin(i / 7) * 0.5);
    }
    const doc = buildReportPdf({
      title: 'Prueba Mw 5.0',
      author: 'QA',
      notes: 'Nota de prueba',
      params,
      results: { maxAmplitude: 1.2e-3, duration: 40, dominantFrequency: 2.1, pArrival: 4.3, sArrival: 7.8, gridInfo: { nx: 200, nz: 150, totalSteps: 2000 }, waveData: wave },
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const out = doc.output('arraybuffer');
    expect(out.byteLength).toBeGreaterThan(5000);
  });
});
