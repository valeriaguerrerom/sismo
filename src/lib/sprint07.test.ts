/**
 * Sprint 7 — HU009: Mapa 3D de propagación (frentes P/S, estaciones, escala de
 * profundidad y comparación por profundidad del hipocentro).
 *
 * Casos CPR-009-1 .. CPR-009-5. Pruebas de la LÓGICA pura del navegador que
 * sostiene el Mapa 3D (Vitest):
 *   - getStations / getTravelTimes (cliente api3d, fetch mockeado): el mapa se
 *     abre pidiendo el catálogo de estaciones y, al colocar el epicentro, pide
 *     los tiempos de llegada P/S a cada estación.
 *   - niceTicks (crossSectionRender): la escala/eje de profundidad del corte usa
 *     marcas en valores redondos dentro del rango.
 *   - makeWaveFrontRadius (waveFront): los anillos P y S nacen en el hipocentro
 *     (radio 0 en t=0), crecen de forma monótona y tocan cada estación justo en
 *     su tiempo de llegada; la fase S va por detrás de la P.
 *   - Comparación 15 km vs 150 km: a mayor profundidad la distancia hipocentral
 *     a una misma estación crece (Pitágoras), así que el frente tarda más en
 *     llegar — se verifica con tiempos de viaje del modelo homogéneo.
 *
 * El cálculo numérico (tiempos de viaje, geometría de escena) vive en el
 * backend; aquí se prueba el contrato del cliente y las funciones puras del
 * frontend que dibujan y animan la propagación.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStations, getTravelTimes } from './api3d';
import type { StationTravelTime } from './api3d';
import { makeWaveFrontRadius } from './waveFront';
import { niceTicks } from './crossSectionRender';

/** Respuesta fetch simulada (ok si 2xx). */
function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

/** Construye un StationTravelTime homogéneo coherente: d = v·t. */
function st(code: string, dHypo: number, tP: number, tS: number): StationTravelTime {
  return {
    code, name: code, latitude: 0, longitude: 0, approx: true,
    distancia_epicentral_km: dHypo, distancia_hipocentral_km: dHypo,
    distancia_grados: dHypo / 111, azimut: 0,
    tP, tS, tS_menos_tP: tS - tP,
  };
}

/**
 * Tiempo de viaje homogéneo (modelo del Mapa 3D) a una estación en superficie:
 * distancia hipocentral = √(epicentral² + prof²); t = dHipo / v.
 */
function homogeneousArrival(epicentralKm: number, depthKm: number, vKmS: number): number {
  return Math.sqrt(epicentralKm ** 2 + depthKm ** 2) / vKmS;
}

describe('HU009 — Mapa 3D de propagación (frentes P/S, estaciones, profundidad)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { global.fetch = originalFetch; });

  // ── CPR-009-1 ──
  // Abrir el Mapa 3D carga el catálogo de estaciones (terreno + estaciones). El
  // cliente pide /api/stations y recibe la lista que el escenario renderiza.
  it('CPR-009-1 abrir_mapa_carga_estaciones: el Mapa 3D pide el catálogo de estaciones de Nariño', async () => {
    const spy = mockFetchOnce(200, {
      estaciones: [
        { code: 'PAS2', name: 'Pasto', latitude: 1.21, longitude: -77.28, altitude_m: 2800, approx: false, source: 'SGC' },
        { code: 'TUM', name: 'Tumaco', latitude: 1.8, longitude: -78.7, altitude_m: 5, approx: false, source: 'SGC' },
        { code: 'CUFP', name: 'Galeras', latitude: 1.22, longitude: -77.37, altitude_m: 4100, approx: false, source: 'OVSP' },
      ],
    });
    global.fetch = spy as typeof fetch;

    const estaciones = await getStations();

    expect(String(spy.mock.calls[0][0])).toContain('/api/stations');
    expect(estaciones).toHaveLength(3);
    // Cada estación trae coordenadas para colocarla sobre el terreno.
    for (const s of estaciones) {
      expect(typeof s.latitude).toBe('number');
      expect(typeof s.longitude).toBe('number');
      expect(s.code.length).toBeGreaterThan(0);
    }
    expect(estaciones.map(s => s.code)).toContain('PAS2');
  });

  // ── CPR-009-2 ──
  // Colocar el epicentro cerca de Pasto dispara el cálculo de los tiempos de
  // llegada P y S a cada estación (POST /api/travel-times con lat/lon/prof).
  it('CPR-009-2 colocar_epicentro_calcula_tiempos: al fijar el epicentro se piden los tiempos de llegada P/S', async () => {
    const spy = mockFetchOnce(200, {
      modelo_usado: 'homogeneous',
      estaciones: [
        st('PAS2', 30, 5.0, 8.6),
        st('TUM', 160, 26.7, 45.7),
      ],
    });
    global.fetch = spy as typeof fetch;

    // Epicentro cerca de Pasto, 15 km de profundidad.
    const res = await getTravelTimes({ lat: 1.2136, lon: -77.2811, depth_km: 15 });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/travel-times');
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(init?.body as string);
    expect(sent.lat).toBeCloseTo(1.2136, 4);
    expect(sent.lon).toBeCloseTo(-77.2811, 4);
    expect(sent.depth_km).toBe(15);

    // Cada estación recibe su tP y tS, con tS posterior a tP (S más lenta).
    expect(res.estaciones.length).toBe(2);
    for (const s of res.estaciones) {
      expect(s.tP).not.toBeNull();
      expect(s.tS).not.toBeNull();
      expect(s.tS!).toBeGreaterThan(s.tP!);
    }
  });

  // ── CPR-009-3 ──
  // Reproducir la propagación: los frentes P y S nacen en el hipocentro
  // (radio 0 en t=0), crecen de forma monótona y la S queda por detrás de la P.
  it('CPR-009-3 propagacion_frentes_nacen_en_hipocentro: los anillos P/S parten de 0 y la S va detrás de la P', () => {
    // Estaciones coherentes con vp=6, vs=3.5 km/s (homogéneo): d = v·t.
    const tts = [
      st('A', 60, 10, 17.14),
      st('B', 120, 20, 34.29),
    ];
    const rP = makeWaveFrontRadius(tts, 'P', 6);
    const rS = makeWaveFrontRadius(tts, 'S', 3.5);

    // Nacen en el hipocentro: radio 0 al inicio.
    expect(rP(0)).toBe(0);
    expect(rS(0)).toBe(0);

    // Crecen de forma monótona en el tiempo.
    let prevP = -Infinity, prevS = -Infinity;
    for (let t = 0; t <= 20; t += 1) {
      const p = rP(t), s = rS(t);
      expect(p).toBeGreaterThanOrEqual(prevP);
      expect(s).toBeGreaterThanOrEqual(prevS);
      prevP = p; prevS = s;
      // En cualquier instante la P va por delante (más rápida) que la S.
      if (t > 0) expect(p).toBeGreaterThan(s);
    }
  });

  // ── CPR-009-4 ──
  // El anillo de cada fase toca su estación EXACTAMENTE en el tiempo de llegada
  // correspondiente (nodo de interpolación) — base del "ver el corte" temporal.
  it('CPR-009-4 anillo_toca_estacion_en_su_llegada: el frente P/S cruza cada estación en su tP/tS', () => {
    const tts = [
      st('A', 50, 8, 15),
      st('B', 110, 15, 28),
      st('C', 200, 24, 46),
    ];
    const rP = makeWaveFrontRadius(tts, 'P', 6);
    const rS = makeWaveFrontRadius(tts, 'S', 3.5);

    // En t = tP el radio del anillo P es la distancia hipocentral de esa estación.
    expect(rP(8)).toBeCloseTo(50, 3);
    expect(rP(15)).toBeCloseTo(110, 3);
    expect(rP(24)).toBeCloseTo(200, 3);
    // En t = tS lo mismo para el anillo S.
    expect(rS(15)).toBeCloseTo(50, 3);
    expect(rS(28)).toBeCloseTo(110, 3);
    expect(rS(46)).toBeCloseTo(200, 3);

    // La escala/eje de profundidad del corte usa marcas en valores redondos.
    const ticks = niceTicks(60, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(60);
    // Monótonas y crecientes.
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
  });

  // ── CPR-009-5 ──
  // Comparar 15 km vs 150 km de profundidad para una misma estación: a mayor
  // profundidad la distancia hipocentral crece (Pitágoras), así que el tiempo de
  // llegada aumenta y el frente tarda más en alcanzar la estación.
  it('CPR-009-5 comparar_profundidad_15_vs_150: a mayor profundidad el frente tarda más en llegar', () => {
    const epicentralKm = 40;   // misma estación en los dos casos
    const vP = 6.0;            // km/s, modelo homogéneo del Mapa 3D

    const tShallow = homogeneousArrival(epicentralKm, 15, vP);
    const tDeep = homogeneousArrival(epicentralKm, 150, vP);

    // Un hipocentro más profundo => llegada más tardía a la misma estación.
    expect(tDeep).toBeGreaterThan(tShallow);

    // Y el frente (radio del anillo) de cada caso alcanza su propia distancia
    // hipocentral justo en ese tiempo: el anillo del evento profundo necesita
    // más tiempo para cruzar la estación.
    const dShallow = Math.sqrt(epicentralKm ** 2 + 15 ** 2);
    const dDeep = Math.sqrt(epicentralKm ** 2 + 150 ** 2);
    const frontShallow = makeWaveFrontRadius([st('S', dShallow, tShallow, tShallow * 1.73)], 'P', vP);
    const frontDeep = makeWaveFrontRadius([st('D', dDeep, tDeep, tDeep * 1.73)], 'P', vP);

    // En el instante en que el frente superficial YA tocó su estación, el frente
    // profundo todavía no ha alcanzado la suya (su distancia es mayor).
    expect(frontShallow(tShallow)).toBeCloseTo(dShallow, 3);
    expect(frontDeep(tShallow)).toBeLessThan(dDeep);
    expect(frontDeep(tDeep)).toBeCloseTo(dDeep, 3);
  });
});
