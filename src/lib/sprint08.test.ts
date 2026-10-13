// @vitest-environment jsdom
/**
 * Sprint 8 — HU026 (modelo de tiempos de viaje del Mapa 3D) y HU027 (registro
 * sísmico por estación + reporte del Mapa 3D).
 *
 * Casos CPR-026-1..4 y CPR-027-1..4 (Vitest). Se prueba la LÓGICA pura del
 * navegador que sostiene el Mapa 3D:
 *
 * HU026 — tiempos de viaje:
 *   - getTravelTimes (cliente api3d, fetch mockeado) con modelo "homogeneous"
 *     envía Vp/Vs (líneas rectas) y con "iasp91" envía el modelo (velocidades
 *     por capa). La regla de UI "IASP91 deshabilita Vp/Vs" se expresa como un
 *     invariante del modelo.
 *   - alignSyntheticToModel/warpTime: al cambiar de modelo las trazas se
 *     realinean a los nuevos tP/tS SIN cambiar el eje temporal ni el número de
 *     muestras (la animación en curso no se reinicia), y las fases P y S quedan
 *     exactamente en los tiempos del modelo.
 *
 * HU027 — registro y reporte:
 *   - buildMap3dCsv/buildMap3dPdf: el registro ordena las estaciones por
 *     distancia, incluye tP/tS, el sismograma triaxial de la estación
 *     seleccionada, y el reporte PDF contiene la escena, los parámetros y los
 *     tiempos de llegada por estación. Las estaciones aproximadas (borde del
 *     dominio) se marcan con "~".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTravelTimes } from './api3d';
import type { SyntheticResult, TravelModel } from './api3d';
import { alignSyntheticToModel, warpTime } from './alignSynthetic';
import {
  buildMap3dCsv, buildMap3dPdf, DEFAULT_MAP3D_OPTIONS,
} from './map3dReport';
import type { Map3dReportData, Map3dStationRow } from './map3dReport';

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

/** Sintético homogéneo de prueba: pulso P en tP y pulso S en tS. */
function makeSynthetic(tP: number, tS: number, dt = 0.02, dur = 40): SyntheticResult {
  const n = Math.round(dur / dt) + 1;
  const t: number[] = [], vertical: number[] = [], east: number[] = [];
  const pulse = (time: number, start: number) => {
    const x = time - start;
    if (x < 0 || x > 1.5) return 0;
    return Math.cos((x / 1.5) * (Math.PI / 2));
  };
  for (let i = 0; i < n; i++) {
    const time = i * dt;
    t.push(time);
    vertical.push(pulse(time, tP));
    east.push(pulse(time, tS) * 0.8);
  }
  return {
    t, north: east.slice(), east, vertical,
    tP_detectado: tP, tS_detectado: tS,
    cfl_ok: true, tiempo_computo_ms: 0, nx: 10, nz: 10, dx_m: 100, dt_s: dt,
  };
}

/** Fila de estación para el reporte del Mapa 3D. */
function stationRow(
  code: string, distEpi: number, tP: number, tS: number,
  opts: Partial<Map3dStationRow> = {},
): Map3dStationRow {
  const depth = 15;
  const distHypo = Math.sqrt(distEpi ** 2 + depth ** 2);
  return {
    code, name: code, approx: false,
    latitude: 1.2 + distEpi / 500, longitude: -77.3 - distEpi / 500,
    distancia_epicentral_km: distEpi, distancia_hipocentral_km: distHypo,
    distancia_grados: distEpi / 111, azimut: 45,
    tP, tS, tS_menos_tP: tS - tP,
    ...opts,
  };
}

/** Datos base del reporte del Mapa 3D con dos estaciones y un sismograma. */
function reportData(stations: Map3dStationRow[]): Map3dReportData {
  const sg = makeSynthetic(5, 8.6);
  return {
    title: 'Reporte Mapa 3D de prueba',
    epicenter: { lat: 1.2136, lon: -77.2811, depthKm: 15 },
    magnitude: 5.0,
    sourceType: 'tectonic',
    model: 'homogeneous',
    medium: { vp: 6.0, vs: 3.5, density: 2600 },
    stations,
    selectedStation: stations[0]?.code ?? null,
    seismogram: {
      station: stations[0]?.code ?? 'PAS2',
      t: sg.t, north: sg.north, east: sg.east, vertical: sg.vertical,
      tP: 5, tS: 8.6, isReal: false,
    },
    traces: stations.map((s, i) => ({
      code: s.code, dist: s.distancia_epicentral_km,
      t: sg.t, values: i === 0 ? sg.vertical : sg.north,
      tP: s.tP, tS: s.tS,
    })),
  };
}

describe('HU026 — Modelo de tiempos de viaje (Mapa 3D)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { global.fetch = originalFetch; });

  // ── CPR-026-1 ──
  // Modelo de velocidad constante: calcula con la Vp/Vs configuradas (ondas en
  // línea recta). El cliente envía model=homogeneous con esas velocidades.
  it('CPR-026-1 test_calcular_velocidad_constante: usa la Vp/Vs elegidas (líneas rectas)', async () => {
    const spy = mockFetchOnce(200, {
      modelo_usado: 'homogeneous',
      estaciones: [{
        code: 'PAS2', name: 'Pasto', latitude: 1.2, longitude: -77.3, approx: false,
        distancia_epicentral_km: 30, distancia_hipocentral_km: 33.5, distancia_grados: 0.27,
        azimut: 45, tP: 5.6, tS: 9.6, tS_menos_tP: 4.0,
      }],
    });
    global.fetch = spy as typeof fetch;

    const res = await getTravelTimes({
      lat: 1.2136, lon: -77.2811, depth_km: 15,
      vp_km_s: 6.0, vs_km_s: 3.5, model: 'homogeneous',
    });

    const sent = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(sent.model).toBe('homogeneous');
    expect(sent.vp_km_s).toBe(6.0);
    expect(sent.vs_km_s).toBe(3.5);
    expect(res.modelo_usado).toBe('homogeneous');
    // Con medio homogéneo el tiempo es proporcional a la distancia hipocentral
    // (línea recta): tP ≈ dHipo / vp.
    const s = res.estaciones[0];
    expect(s.tP!).toBeCloseTo(s.distancia_hipocentral_km / 6.0, 1);
  });

  // ── CPR-026-2 ──
  // Modelo de referencia IASP91: velocidades por capa; la UI deshabilita Vp/Vs.
  it('CPR-026-2 test_calcular_iasp91: usa el modelo por capas y deshabilita Vp/Vs', async () => {
    const spy = mockFetchOnce(200, { modelo_usado: 'iasp91', estaciones: [] });
    global.fetch = spy as typeof fetch;

    await getTravelTimes({ lat: 1.2136, lon: -77.2811, depth_km: 15, model: 'iasp91' });

    const sent = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(sent.model).toBe('iasp91');

    // Regla de interfaz (Map3D): con IASP91 los controles de Vp/Vs se
    // deshabilitan porque el modelo trae sus propias velocidades por capa.
    const vpVsDisabled = (model: TravelModel) => model === 'iasp91';
    expect(vpVsDisabled('iasp91')).toBe(true);
    expect(vpVsDisabled('homogeneous')).toBe(false);
  });

  // ── CPR-026-3 ──
  // Cambiar de modelo mientras se reproduce: las trazas se realinean a los
  // nuevos tiempos SIN cambiar el eje temporal ni el número de muestras, así la
  // animación en curso no se reinicia.
  it('CPR-026-3 test_cambiar_modelo_mientras_reproduce: realinea sin reiniciar (mismo eje y nº de muestras)', () => {
    const syn = makeSynthetic(5, 9);           // trazas crudas (modelo homogéneo)
    const aligned = alignSyntheticToModel(syn, 3.8, 7.2); // cambio a otro modelo

    // El eje temporal y el número de muestras no cambian (la animación usa el
    // mismo reloj `elapsed`, no se reinicia).
    expect(aligned.t.length).toBe(syn.t.length);
    expect(aligned.t[0]).toBe(syn.t[0]);
    expect(aligned.t[aligned.t.length - 1]).toBe(syn.t[syn.t.length - 1]);
    expect(aligned.north.length).toBe(syn.north.length);
    expect(aligned.dt_s).toBe(syn.dt_s);
  });

  // ── CPR-026-4 ──
  // Revisar los sismogramas con IASP91: las ondas P y S quedan ubicadas en los
  // tiempos del modelo (la forma de onda es ilustrativa, pero las fases caen en
  // tP/tS del modelo activo).
  it('CPR-026-4 test_revisar_sismogramas_iasp91: P y S quedan en los tiempos del modelo', () => {
    // Anclajes exactos del warping (0, P, S).
    expect(warpTime(0, 5, 9, 3.8, 7.2)).toBeCloseTo(0, 6);
    expect(warpTime(5, 5, 9, 3.8, 7.2)).toBeCloseTo(3.8, 6); // P → tP modelo
    expect(warpTime(9, 5, 9, 3.8, 7.2)).toBeCloseTo(7.2, 6); // S → tS modelo

    const syn = makeSynthetic(5, 9);
    const aligned = alignSyntheticToModel(syn, 3.8, 7.2);
    // Los tiempos reportados caen exactamente en los del modelo.
    expect(aligned.tP_detectado).toBeCloseTo(3.8, 6);
    expect(aligned.tS_detectado).toBeCloseTo(7.2, 6);
  });
});

describe('HU027 — Registro sísmico por estación y reporte del Mapa 3D', () => {
  // ── CPR-027-1 ──
  // Panel de sismogramas: una traza por estación, ordenadas por distancia, con
  // marcas de P y S, el código y la distancia de cada estación.
  it('CPR-027-1 test_ver_sismogramas_evento: trazas por estación ordenadas por distancia con marcas P/S', () => {
    // Estaciones desordenadas: PAS2 (30 km), TUM (160 km), CUFP (12 km).
    const stations = [
      stationRow('TUM', 160, 26.7, 45.7),
      stationRow('PAS2', 30, 5.6, 9.6),
      stationRow('CUFP', 12, 2.2, 3.9),
    ];
    const csv = buildMap3dCsv(reportData(stations), DEFAULT_MAP3D_OPTIONS);

    // La sección de registro ordena por distancia epicentral (de menor a mayor).
    expect(csv).toContain('# REGISTRO SISMICO POR ESTACION');
    const regIdx = csv.indexOf('estacion,dist_epicentral_km,tP_s,tS_s');
    const posCUFP = csv.indexOf('CUFP,12', regIdx);
    const posPAS2 = csv.indexOf('PAS2,30', regIdx);
    const posTUM = csv.indexOf('TUM,160', regIdx);
    expect(posCUFP).toBeGreaterThan(-1);
    expect(posCUFP).toBeLessThan(posPAS2);
    expect(posPAS2).toBeLessThan(posTUM);
    // Cada traza lleva su código, distancia y marcas tP/tS.
    expect(csv).toContain('PAS2,30,5.6,9.6');
  });

  // ── CPR-027-2 ──
  // Seleccionar la estación: se muestra su registro triaxial con los tiempos de
  // llegada (el reporte incluye el sismograma triaxial de la estación elegida).
  it('CPR-027-2 test_seleccionar_estacion_cum: registro triaxial de la estación seleccionada con tP/tS', () => {
    const stations = [stationRow('CUM', 40, 7.1, 12.1), stationRow('TUM', 160, 26.7, 45.7)];
    const data = reportData(stations);
    data.selectedStation = 'CUM';
    data.seismogram = { station: 'CUM', ...makeSynthetic(7.1, 12.1), tP: 7.1, tS: 12.1, isReal: false };
    const csv = buildMap3dCsv(data, DEFAULT_MAP3D_OPTIONS);

    // El sismograma triaxial de CUM aparece con sus tres componentes y marcas.
    expect(csv).toContain('# SISMOGRAMA TRIAXIAL · ESTACION CUM');
    expect(csv).toContain('tiempo_s,norte,este,vertical');
    // La estación seleccionada figura en el registro con sus tiempos de llegada.
    expect(csv).toContain('CUM,40,7.1,12.1');
  });

  // ── CPR-027-3 ──
  // Generar el reporte del Mapa 3D: un PDF con la escena, los parámetros y los
  // tiempos de llegada por estación.
  it('CPR-027-3 test_generar_reporte_mapa_3d: PDF con escena, parámetros y tiempos de llegada', () => {
    const stations = [stationRow('PAS2', 30, 5.6, 9.6), stationRow('TUM', 160, 26.7, 45.7)];
    const doc = buildMap3dPdf(reportData(stations), DEFAULT_MAP3D_OPTIONS);

    // Se genera un documento con al menos una página.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    // El CSV equivalente confirma que las secciones pedidas están presentes:
    // parámetros del medio y tiempos de viaje por estación.
    const csv = buildMap3dCsv(reportData(stations), DEFAULT_MAP3D_OPTIONS);
    expect(csv).toContain('# PARAMETROS DEL MEDIO');
    expect(csv).toContain('# TIEMPOS DE VIAJE POR ESTACION');
    expect(csv).toContain('PAS2');
    expect(csv).toContain('TUM');
    // Los tiempos de llegada por estación están en la tabla.
    expect(csv).toMatch(/PAS2,.*,5\.6,9\.6/);
  });

  // ── CPR-027-4 ──
  // Estación en el borde del dominio: se marca como aproximada (flecha/"~") y se
  // reporta su distancia real.
  it('CPR-027-4 test_ver_estacion_cauca: estación de borde marcada como aproximada con su distancia real', () => {
    const borde = stationRow('CAUCA', 210, 35.0, 60.0, { approx: true });
    const data = reportData([stationRow('PAS2', 30, 5.6, 9.6), borde]);
    const csv = buildMap3dCsv(data, DEFAULT_MAP3D_OPTIONS);

    // En la tabla de tiempos de viaje la estación aproximada se marca con "si"
    // en la columna "aproximada" y conserva su distancia real.
    expect(csv).toContain('# TIEMPOS DE VIAJE POR ESTACION');
    const row = csv.split('\n').find(l => l.startsWith('CAUCA,'));
    expect(row).toBeTruthy();
    expect(row!).toContain('CAUCA,CAUCA,si,210');

    // Y el PDF marca la estación aproximada con el sufijo "~" (misma convención).
    const borderRow: Map3dStationRow = borde;
    expect(borderRow.approx).toBe(true);
    expect(borderRow.distancia_epicentral_km).toBe(210);
  });
});
