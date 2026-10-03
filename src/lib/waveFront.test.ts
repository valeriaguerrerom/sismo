import { describe, it, expect } from 'vitest';
import { makeWaveFrontRadius } from './waveFront';
import type { StationTravelTime } from './api3d';

function st(code: string, dHypo: number, tP: number | null, tS: number | null): StationTravelTime {
  return {
    code, name: code, latitude: 0, longitude: 0, approx: true,
    distancia_epicentral_km: dHypo, distancia_hipocentral_km: dHypo, distancia_grados: dHypo / 111,
    azimut: 0, tP, tS, tS_menos_tP: (tP != null && tS != null) ? tS - tP : null,
  };
}

describe('makeWaveFrontRadius', () => {
  it('con velocidad constante da radio = v·t (modelo homogéneo)', () => {
    // Estaciones coherentes con vp=6 km/s: d = 6·t.
    const tts = [st('A', 60, 10, 20), st('B', 120, 20, 40)];
    const rP = makeWaveFrontRadius(tts, 'P', 6);
    expect(rP(10)).toBeCloseTo(60, 3);
    expect(rP(20)).toBeCloseTo(120, 3);
    expect(rP(15)).toBeCloseTo(90, 3); // interpolación lineal intermedia
  });

  it('el anillo P toca cada estación EXACTAMENTE en su tP (modelo no lineal)', () => {
    // Tiempos no lineales con la distancia (como IASP91): el radio en t=tP debe
    // ser la distancia hipocentral de esa estación, por construcción.
    const tts = [
      st('A', 50, 8, 15),
      st('B', 110, 15, 28),
      st('C', 200, 24, 46),
    ];
    const rP = makeWaveFrontRadius(tts, 'P', 6);
    expect(rP(8)).toBeCloseTo(50, 3);
    expect(rP(15)).toBeCloseTo(110, 3);
    expect(rP(24)).toBeCloseTo(200, 3);

    const rS = makeWaveFrontRadius(tts, 'S', 3.5);
    expect(rS(15)).toBeCloseTo(50, 3);
    expect(rS(28)).toBeCloseTo(110, 3);
    expect(rS(46)).toBeCloseTo(200, 3);
  });

  it('es monótona creciente en el tiempo', () => {
    const tts = [st('A', 50, 8, 15), st('B', 200, 24, 46)];
    const rP = makeWaveFrontRadius(tts, 'P', 6);
    let prev = -Infinity;
    for (let t = 0; t <= 40; t += 1) {
      const r = rP(t);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('cae a velocidad de respaldo si no hay anclas suficientes', () => {
    const rP = makeWaveFrontRadius([], 'P', 6);
    expect(rP(10)).toBeCloseTo(60, 3);
    expect(rP(0)).toBe(0);
  });
});
