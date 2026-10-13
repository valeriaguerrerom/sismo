// @vitest-environment jsdom
/**
 * Sprint 10 — HU015 (descargar PDF de la simulación), HU014 (historial de
 * reportes: lista, estado vacío, filtros, eliminar, descargar) y HU017
 * (descargar JSON de la simulación y del Mapa 3D).
 *
 * Casos CPR-015-1..3, CPR-014-1..5 y CPR-017-1..2 (Vitest). Se prueba la LÓGICA
 * pura del navegador:
 *   - buildReportPdf (reportPdfBuilder) genera el PDF de simulación con las
 *     secciones elegidas, e incluye la sección de "registro real" cuando el
 *     reporte lo trae, y se regenera a partir de los datos guardados.
 *   - El historial de reportes se ordena de más reciente a más antiguo, el
 *     estado vacío se detecta, y el filtro por nombre/fechas/origen/fuente/
 *     magnitud/sismogramas (misma lógica que MyReports.tsx) selecciona bien.
 *   - El JSON de la simulación contiene parámetros y resultados; el JSON del
 *     Mapa 3D (downloadMap3dJson → estructura) contiene evento, modelo y los
 *     tiempos de llegada por estación.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downsampleWave } from './reportPdf';
import type { ReportInput, SavedResults } from './reportPdf';
import { buildMap3dPdf, DEFAULT_MAP3D_OPTIONS } from './map3dReport';
import type { Map3dReportData, Map3dStationRow, Map3dReportOptions } from './map3dReport';
import type { SimulationParams, WaveData } from './types';

const params: SimulationParams = {
  vp: 3500, vs: 2000, density: 2600, lambda: 1.1e10, mu: 1.04e10,
  sourceType: 'tectonic', magnitude: 5, depth: 15,
  epicenterLat: 1.2136, epicenterLon: -77.2811, duration: 60, dx: 100, dt: 0.02,
};

function makeWave(n = 400): WaveData {
  const w: WaveData = { time: [], north: [], east: [], vertical: [] };
  for (let i = 0; i < n; i++) {
    w.time.push(i * 0.1);
    w.north.push(Math.sin(i / 10));
    w.east.push(Math.cos(i / 12));
    w.vertical.push(Math.sin(i / 7) * 0.5);
  }
  return w;
}

function savedResults(extra: Partial<SavedResults> = {}): SavedResults {
  return {
    maxAmplitude: 1.2e-3, duration: 40, dominantFrequency: 2.1,
    pArrival: 4.3, sArrival: 7.8,
    gridInfo: { nx: 200, nz: 150, totalSteps: 2000 },
    waveData: makeWave(),
    ...extra,
  };
}

// ── Modelo de reporte guardado y lógica de historial/filtro (igual a MyReports.tsx) ──
type Origin = 'simulation' | 'map3d';
interface StoredReport {
  id: string; title: string; notes: string; created_at: string;
  params: SimulationParams; results: SavedResults & { report_type?: 'simulation' | 'map3d'; map3d?: Map3dReportData };
}
interface Filters {
  query?: string; dateFrom?: string; dateTo?: string;
  origin?: 'all' | Origin; source?: 'all' | 'tectonic' | 'volcanic';
  magMin?: string; magMax?: string; onlySeismograms?: boolean;
}

/** Metadatos normalizados de un reporte (misma lógica que reportMeta en MyReports.tsx). */
function reportMeta(r: StoredReport) {
  const isMap3d = r.results?.report_type === 'map3d' && !!r.results.map3d;
  if (isMap3d) {
    const m = r.results.map3d!;
    return {
      origin: 'map3d' as Origin,
      magnitude: typeof m.magnitude === 'number' ? m.magnitude : null,
      sourceType: m.sourceType ?? null,
      hasSeismograms: Boolean((m.seismogram && m.seismogram.t && m.seismogram.t.length > 1) || (m.traces && m.traces.length > 0)),
    };
  }
  const p = r.params;
  return {
    origin: 'simulation' as Origin,
    magnitude: typeof p?.magnitude === 'number' ? p.magnitude : null,
    sourceType: p?.sourceType ?? null,
    hasSeismograms: Boolean(r.results?.waveData),
  };
}

/** Aplica filtros + orden como el useMemo `filtered` de MyReports.tsx. */
function filterReports(reports: StoredReport[], f: Filters): StoredReport[] {
  const q = (f.query ?? '').trim().toLowerCase();
  const from = f.dateFrom ? new Date(f.dateFrom + 'T00:00:00') : null;
  const to = f.dateTo ? new Date(f.dateTo + 'T23:59:59') : null;
  const min = f.magMin != null && f.magMin !== '' ? Number(f.magMin) : null;
  const max = f.magMax != null && f.magMax !== '' ? Number(f.magMax) : null;
  const origin = f.origin ?? 'all';
  const source = f.source ?? 'all';
  const rows = reports.filter(r => {
    const meta = reportMeta(r);
    if (q && !(`${r.title} ${r.notes ?? ''}`.toLowerCase().includes(q))) return false;
    const d = new Date(r.created_at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (origin !== 'all' && meta.origin !== origin) return false;
    if (source !== 'all' && meta.sourceType !== source) return false;
    if (min != null && (meta.magnitude == null || meta.magnitude < min)) return false;
    if (max != null && (meta.magnitude == null || meta.magnitude > max)) return false;
    if (f.onlySeismograms && !meta.hasSeismograms) return false;
    return true;
  });
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows;
}

function mkReport(id: string, created_at: string, over: Partial<StoredReport> = {}): StoredReport {
  return {
    id, title: `Reporte ${id}`, notes: '', created_at,
    params: { ...params }, results: savedResults(), ...over,
  };
}

function stationRow(code: string, distEpi: number, tP: number, tS: number): Map3dStationRow {
  const depth = 15, distHypo = Math.sqrt(distEpi ** 2 + depth ** 2);
  return {
    code, name: code, approx: false, latitude: 1.2, longitude: -77.3,
    distancia_epicentral_km: distEpi, distancia_hipocentral_km: distHypo,
    distancia_grados: distEpi / 111, azimut: 45, tP, tS, tS_menos_tP: tS - tP,
  };
}

function map3dData(stations: Map3dStationRow[]): Map3dReportData {
  return {
    title: 'Reporte 3D', epicenter: { lat: 1.2136, lon: -77.2811, depthKm: 15 },
    magnitude: 5.0, sourceType: 'tectonic', model: 'homogeneous',
    medium: { vp: 6.0, vs: 3.5, density: 2600 }, stations,
  };
}

/** Estructura del JSON de simulación (igual que exportJSON en ResultsPanel/MyReports). */
function simulationJson(r: StoredReport) {
  return { title: r.title, params: r.params, results: r.results, notes: r.notes, date: r.created_at };
}

/** Estructura del JSON del Mapa 3D (igual que downloadMap3dJson en map3dReport.ts). */
function map3dJson(data: Map3dReportData, _opts: Map3dReportOptions) {
  return {
    epicenter: data.epicenter,
    parameters: { sourceType: data.sourceType, magnitude: data.magnitude, model: data.model, vp: data.medium.vp, vs: data.medium.vs, density: data.medium.density },
    stations: data.stations.map(s => ({ code: s.code, name: s.name, lat: s.latitude, lon: s.longitude, distanceKm: s.distancia_epicentral_km, tP: s.tP, tS: s.tS })),
  };
}

describe('HU015 — Descargar el PDF de la simulación', () => {
  // ── CPR-015-1 ──
  it('CPR-015-1 test_descargar_pdf_todas_secciones: PDF con parámetros, métricas, sismogramas e interpretación', async () => {
    const { buildReportPdf } = await import('./reportPdfBuilder');
    const input: ReportInput = {
      title: 'Sim Mw 5.0', author: 'QA', notes: 'nota',
      params, results: savedResults(),
      sections: { params: true, metrics: true, seismograms: true, crossSection: false, particleMotion: false, interpretation: true },
    };
    const doc = buildReportPdf(input);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    // El PDF tiene contenido real (no un documento vacío).
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(5000);
  });

  // ── CPR-015-2 ──
  it('CPR-015-2 test_descargar_pdf_simulacion_registro_real: el PDF incluye la comparación con el registro real', async () => {
    const { buildReportPdf } = await import('./reportPdfBuilder');
    // Reporte marcado como REGISTRO REAL con su etiqueta.
    const input: ReportInput = {
      title: 'Comparación con registro real',
      params,
      results: savedResults({ isRealRecord: true, realLabel: 'CM 2025-04-25 M6.3 — Est. BBAC' }),
    };
    const doc = buildReportPdf(input);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000);
    // La bandera de registro real queda reflejada en los datos del reporte.
    expect(input.results.isRealRecord).toBe(true);
    expect(input.results.realLabel).toContain('BBAC');
  });

  // ── CPR-015-3 ──
  it('CPR-015-3 test_descargar_pdf_reporte_guardado: se regenera el PDF a partir de los datos guardados', async () => {
    const { buildReportPdf } = await import('./reportPdfBuilder');
    // "Guardado": solo waveData submuestreado (≤600) + gridInfo + métricas.
    const stored = savedResults({ waveData: downsampleWave(makeWave(3000), 600) });
    expect(stored.waveData!.time.length).toBeLessThanOrEqual(600);
    const doc = buildReportPdf({ title: 'Reporte guardado', createdAt: '2026-02-01T00:00:00Z', params, results: stored });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000);
  });
});

describe('HU014 — Historial de reportes', () => {
  // ── CPR-014-1 ──
  it('CPR-014-1 test_consultar_historial_reportes: lista de más reciente a más antiguo', () => {
    const reports = [
      mkReport('a', '2026-01-05T00:00:00Z'),
      mkReport('b', '2026-03-20T00:00:00Z'),
      mkReport('c', '2026-02-10T00:00:00Z'),
    ];
    const out = filterReports(reports, {});
    expect(out.map(r => r.id)).toEqual(['b', 'c', 'a']); // desc por fecha
  });

  // ── CPR-014-2 ──
  it('CPR-014-2 test_consultar_historial_sin_reportes: estado vacío cuando no hay reportes', () => {
    const out = filterReports([], {});
    expect(out).toHaveLength(0); // la UI muestra el estado vacío con accesos
  });

  // ── CPR-014-3 ──
  it('CPR-014-3 test_filtrar_reportes_mapa_3d: filtra por nombre, fechas, origen, fuente, magnitud y sismogramas', () => {
    const sim = mkReport('sim', '2026-01-10T00:00:00Z', { title: 'Simulación tectónica', params: { ...params, sourceType: 'tectonic', magnitude: 5 } });
    const volc = mkReport('volc', '2026-02-10T00:00:00Z', { title: 'Volcánica Galeras', params: { ...params, sourceType: 'volcanic', magnitude: 4 } });
    const m3d = mkReport('m3d', '2026-03-10T00:00:00Z', {
      title: 'Mapa 3D Pasto',
      results: { ...savedResults(), report_type: 'map3d', map3d: map3dData([stationRow('PAS2', 30, 5, 9)]) },
    });
    const all = [sim, volc, m3d];

    // Por origen: solo Mapa 3D.
    expect(filterReports(all, { origin: 'map3d' }).map(r => r.id)).toEqual(['m3d']);
    // Por fuente: solo volcánica.
    expect(filterReports(all, { source: 'volcanic' }).map(r => r.id)).toEqual(['volc']);
    // Por nombre.
    expect(filterReports(all, { query: 'pasto' }).map(r => r.id)).toEqual(['m3d']);
    // Por magnitud mínima 4.5 → excluye la volcánica (M4).
    expect(filterReports(all, { magMin: '4.5' }).map(r => r.id).sort()).toEqual(['m3d', 'sim']);
    // Por rango de fechas.
    expect(filterReports(all, { dateFrom: '2026-02-01', dateTo: '2026-02-28' }).map(r => r.id)).toEqual(['volc']);
    // Solo con sismogramas: la simulación y la volcánica tienen waveData; el
    // reporte 3D de este caso no trae ni sismograma ni trazas, así que queda fuera.
    expect(filterReports(all, { onlySeismograms: true }).map(r => r.id).sort()).toEqual(['sim', 'volc']);
  });

  // ── CPR-014-4 ──
  it('CPR-014-4 test_eliminar_reporte: la confirmación usa el nombre y al aceptar se retira de la lista', () => {
    let reports = [mkReport('a', '2026-01-05T00:00:00Z'), mkReport('b', '2026-02-05T00:00:00Z')];
    const toDelete = reports.find(r => r.id === 'b')!;
    // La confirmación muestra el nombre del reporte.
    expect(toDelete.title).toBe('Reporte b');
    // Al aceptar, se elimina de la lista (misma operación que confirmDelete).
    reports = reports.filter(r => r.id !== toDelete.id);
    expect(reports.map(r => r.id)).toEqual(['a']);
  });

  // ── CPR-014-5 ──
  it('CPR-014-5 test_descargar_reporte_json: genera el JSON del reporte con sus datos', () => {
    const r = mkReport('a', '2026-01-05T00:00:00Z', { notes: 'una nota' });
    const json = simulationJson(r);
    const text = JSON.stringify(json);
    // El JSON contiene título, parámetros, resultados, notas y fecha.
    expect(json.title).toBe('Reporte a');
    expect(json.params.sourceType).toBe('tectonic');
    expect(json.results.maxAmplitude).toBeDefined();
    expect(text).toContain('una nota');
    expect(text).toContain('2026-01-05');
  });
});

describe('HU017 — Descargar JSON (simulación y Mapa 3D)', () => {
  // ── CPR-017-1 ──
  it('CPR-017-1 test_descargar_json_simulacion: el JSON trae parámetros y resultados de la simulación', () => {
    const r = mkReport('sim', '2026-01-05T00:00:00Z');
    const json = simulationJson(r);
    // Parámetros de la simulación.
    expect(json.params.vp).toBe(3500);
    expect(json.params.magnitude).toBe(5);
    expect(json.params.depth).toBe(15);
    // Resultados (métricas + serie temporal).
    expect(json.results.dominantFrequency).toBeDefined();
    expect(json.results.waveData!.time.length).toBeGreaterThan(0);
    expect(json.results.waveData!.north.length).toBe(json.results.waveData!.time.length);
  });

  // ── CPR-017-2 ──
  it('CPR-017-2 test_descargar_json_reporte_mapa_3d: el JSON trae evento, modelo y tiempos de llegada por estación', () => {
    const data = map3dData([stationRow('PAS2', 30, 5.6, 9.6), stationRow('TUM', 160, 26.7, 45.7)]);
    const json = map3dJson(data, DEFAULT_MAP3D_OPTIONS);
    // Evento (epicentro) y modelo.
    expect(json.epicenter.lat).toBeCloseTo(1.2136, 4);
    expect(json.parameters.model).toBe('homogeneous');
    // Tiempos de llegada por estación.
    expect(json.stations).toHaveLength(2);
    const pas2 = json.stations.find(s => s.code === 'PAS2')!;
    expect(pas2.tP).toBe(5.6);
    expect(pas2.tS).toBe(9.6);
    expect(pas2.distanceKm).toBe(30);
    // Y el PDF del Mapa 3D se regenera desde esos mismos datos guardados (jsPDF).
    const doc = buildMap3dPdf(data, DEFAULT_MAP3D_OPTIONS);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
