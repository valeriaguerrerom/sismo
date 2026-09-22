import { describe, it, expect } from 'vitest';
import { computeRecordLayout } from './recordLayout';
import type { StationTravelTime } from '../../lib/api3d';

function st(code: string, dist: number, tP: number | null, tS: number | null): StationTravelTime {
  return {
    code, name: code, latitude: 0, longitude: 0, approx: true,
    distancia_epicentral_km: dist, distancia_hipocentral_km: dist, distancia_grados: dist / 111,
    azimut: 0, tP, tS, tS_menos_tP: (tP != null && tS != null) ? tS - tP : null,
  };
}

describe('computeRecordLayout', () => {
  const opts = { width: 300, height: 500, maxTime: 50 };

  it('ordena las trazas por distancia epicentral ascendente', () => {
    const stations = [st('C', 30, 5, 9), st('A', 5, 1, 2), st('B', 15, 3, 5)];
    const layout = computeRecordLayout(stations, opts);
    expect(layout.map(l => l.code)).toEqual(['A', 'B', 'C']);
    // x debe crecer con la distancia
    expect(layout[0].x).toBeLessThan(layout[1].x);
    expect(layout[1].x).toBeLessThan(layout[2].x);
  });

  it('coloca la marca S más abajo (mayor y) que la P', () => {
    const layout = computeRecordLayout([st('A', 10, 2, 4)], opts);
    const tr = layout[0];
    expect(tr.yP).not.toBeNull();
    expect(tr.yS).not.toBeNull();
    expect(tr.yS!).toBeGreaterThan(tr.yP!);
  });

  it('la marca P se ubica proporcional al tiempo (eje Y hacia abajo)', () => {
    const layout = computeRecordLayout([st('A', 10, 10, 20)], { ...opts, maxTime: 50 });
    const tr = layout[0];
    // padTop=20, tScale=(500-20-20)/50=9.2 → yP = 20 + 10*9.2 = 112
    expect(tr.yP).toBeCloseTo(20 + 10 * ((500 - 20 - 20) / 50), 1);
  });

  it('maneja tiempos nulos (sin fase) devolviendo null', () => {
    const layout = computeRecordLayout([st('A', 10, null, null)], opts);
    expect(layout[0].yP).toBeNull();
    expect(layout[0].yS).toBeNull();
  });

  it('centra una única traza', () => {
    const layout = computeRecordLayout([st('A', 10, 1, 2)], opts);
    expect(layout[0].x).toBeCloseTo(150, 5);
  });
});
