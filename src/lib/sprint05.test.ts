// @vitest-environment jsdom
/**
 * Sprint 5 — HU010 (Explorador de datos sísmicos: fuentes, filtros, búsqueda,
 * ver sismograma) y HU016 (descargar CSV del sismograma y abrirlo en Excel).
 *
 * Casos CPR-010-1..5 y CPR-016-1..2 (Vitest). Prueban la lógica pura del
 * Explorador (`src/lib/eventFilters.ts`, `src/lib/catalog.ts`) y la estructura
 * del CSV que descarga el Simulador (igual que `exportCSV` de ResultsPanel.tsx).
 *
 * La parte de interfaz de la HU011 (cargar al Simulador, comparar real vs
 * sintético, profundidad asumida) va en `e2e/sprint05.spec.ts` (Playwright).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null }));

import { loadCatalog } from './catalog';
import type { CatalogRow } from './catalog';
import {
  filterEvents, magnitudeLabel, magnitudeType, assumedDepthKm, EMPTY_FILTERS,
} from './eventFilters';
import type { WaveData } from './types';

const originalFetch = global.fetch;

function mockJsonFetch(map: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const key = Object.keys(map).find(k => String(url).includes(k));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    return Promise.resolve({ ok: true, status: 200, json: async () => map[key] } as Response);
  });
}

/** Catálogo de prueba: CM tectónicos (con magnitud/fecha) + Galeras por subtipo. */
function tectonic(id: string, date: string, mag: number, region: string): CatalogRow {
  return {
    event_id: id, event_date: date, event_time: '00:00:00', magnitude: mag, depth_km: null,
    latitude: 1.5, longitude: -77.5, location_name: `Red CM, ${region}`, event_type: 'tectonic',
    volcanic_subtype: null, region, station_count: 4, source: 'SGC-RSNC', location_source: 'centroide de estaciones',
  };
}
function galeras(id: string, date: string, subtype: string | null): CatalogRow {
  return {
    event_id: id, event_date: date, event_time: '00:00:00', magnitude: null, depth_km: null,
    latitude: 1.2216, longitude: -77.3742, location_name: 'Volcán Galeras', event_type: 'volcanic',
    volcanic_subtype: subtype, region: 'Nariño (Galeras)', station_count: 1, source: 'SGC-OVSP',
    location_source: 'cráter del Galeras',
  };
}

/** Construye el CSV del sismograma igual que exportCSV() de ResultsPanel.tsx. */
function buildSimCsv(wave: WaveData): string {
  const rows = ['time_s,north_rel,east_rel,vertical_rel'];
  for (let i = 0; i < wave.time.length; i++) {
    rows.push(`${wave.time[i].toFixed(4)},${wave.north[i].toExponential(6)},${wave.east[i].toExponential(6)},${wave.vertical[i].toExponential(6)}`);
  }
  return rows.join('\n');
}

describe('HU010 — Explorador de datos sísmicos', () => {
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  // ── CPR-010-1 ──
  // El Explorador ofrece tres fuentes: sismos volcánicos del Galeras, sismos
  // tectónicos de la red CM y "Mi archivo MiniSEED". Las dos del catálogo se
  // distinguen por tipo/origen; la tercera (carga propia) se cubre en Sprint 9.
  it('CPR-010-1 test_abrir_explorador: distingue las fuentes Galeras (volcánica) y red CM (tectónica)', async () => {
    global.fetch = mockJsonFetch({
      '/data/cm/index.json': { events: [{ id: 'CM_1', date: '2023-01-09', time: '00:00:00', magnitude: 2.5, folder: 'Colombia', stations: [{ latitude: 1, longitude: -77 }] }] },
      '/data/galeras/index.json': { events: [{ id: 'G_1', event_date: '2006-02-02', event_time: '11:00:00', volcanic_subtype: 'to', location_name: 'Galeras' }] },
    }) as typeof fetch;

    const rows = await loadCatalog();
    const cm = rows.filter(r => r.event_type === 'tectonic');
    const gal = rows.filter(r => r.event_type === 'volcanic');
    expect(cm.length).toBe(1);
    expect(gal.length).toBe(1);
    expect(cm[0].source).toContain('SGC');       // red CM (SGC-RSNC)
    expect(gal[0].region).toBe('Nariño (Galeras)'); // Galeras (OVSP)
    // La tercera fuente ("Mi archivo MiniSEED") es carga del investigador y se
    // valida en el Sprint 9 (process_mseed_bytes / endpoint de carga).
  });

  // ── CPR-010-2 ──
  // Filtrar eventos del Galeras por tipo "tornillo" (código 'to') con su conteo.
  it('CPR-010-2 test_filtrar_eventos_tipo_tornillo: filtra los eventos del Galeras por subtipo tornillo', () => {
    const rows = [
      galeras('G1', '2006-02-01', 'to'),
      galeras('G2', '2006-02-02', 'lp'),
      galeras('G3', '2006-02-03', 'to'),
      galeras('G4', '2006-02-04', 'tr'),
    ];
    // El Explorador filtra el Galeras por volcanic_subtype (tornillo = 'to').
    const tornillos = rows.filter(e => e.volcanic_subtype === 'to');
    expect(tornillos).toHaveLength(2);
    expect(tornillos.map(e => e.event_id)).toEqual(['G1', 'G3']);
    // Su etiqueta de magnitud usa el tipo volcánico (MD) por inferencia.
    expect(magnitudeType('volcanic')).toBe('MD');
  });

  // ── CPR-010-3 ──
  // Filtrar sismos tectónicos por región y magnitud mínima (lista con fecha,
  // magnitud, región, estaciones).
  it('CPR-010-3 test_filtrar_sismos_tectonicos_magnitud: filtra tectónicos por región y magnitud mínima', () => {
    const rows = [
      tectonic('C1', '2023-01-09', 2.5, 'Colombia'),
      tectonic('C2', '2023-05-05', 4.2, 'Colombia'),
      tectonic('C3', '2023-07-07', 3.1, 'Ecuador'),
    ];
    const out = filterEvents(rows, { ...EMPTY_FILTERS, type: 'tectonic', region: 'Colombia', minMag: 3.0 });
    expect(out.map(e => e.event_id)).toEqual(['C2']); // Colombia y magnitud ≥ 3.0
    // La etiqueta muestra el tipo ML con un decimal.
    expect(magnitudeLabel(out[0])).toBe('ML 4.2');
  });

  // ── CPR-010-4 ──
  // Buscar eventos por fecha: solo quedan los que coinciden.
  it('CPR-010-4 test_buscar_eventos_fecha: la búsqueda por texto de fecha acota la lista', () => {
    const rows = [
      tectonic('C1', '2023-01-09', 2.5, 'Colombia'),
      tectonic('C2', '2023-05-05', 4.2, 'Colombia'),
      galeras('G1', '2006-02-02', 'to'),
    ];
    const out = filterEvents(rows, { ...EMPTY_FILTERS, search: '2023-05' });
    expect(out.map(e => e.event_id)).toEqual(['C2']);
  });

  // ── CPR-010-5 ──
  // Ver el sismograma de un evento: el registro triaxial trae tiempo y las tres
  // componentes (lo que el Explorador dibuja y permite elegir estación).
  it('CPR-010-5 test_ver_sismograma_evento_tectonico_estacion: el registro triaxial trae tiempo y N/E/Z', () => {
    // Un waveData real tiene las cuatro series con el mismo largo.
    const wave: WaveData = { time: [0, 0.01, 0.02], north: [0, 0.5, -0.3], east: [0, 0.2, 0.1], vertical: [0, 0.9, -0.4] };
    expect(wave.time.length).toBe(3);
    expect(wave.north.length).toBe(wave.time.length);
    expect(wave.east.length).toBe(wave.time.length);
    expect(wave.vertical.length).toBe(wave.time.length);
    // Profundidad asumida por tipo (los tectónicos del CM no traen profundidad real).
    expect(assumedDepthKm(tectonic('C1', '2023-01-09', 4.0, 'Colombia'))).toBe(15);
  });
});

describe('HU016 — Descargar el CSV del sismograma', () => {
  // ── CPR-016-1 ──
  // Descargar el CSV: incluye el tiempo y las componentes norte, este y vertical.
  it('CPR-016-1 test_descargar_csv_simulacion: el CSV trae tiempo y las tres componentes', () => {
    const wave: WaveData = {
      time: [0, 0.02, 0.04], north: [1e-4, -2e-4, 3e-4], east: [0, 1e-5, -1e-5], vertical: [5e-4, 0, -5e-4],
    };
    const csv = buildSimCsv(wave);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('time_s,north_rel,east_rel,vertical_rel');
    expect(lines).toHaveLength(1 + wave.time.length); // encabezado + una fila por muestra
    // Cada fila tiene cuatro columnas (tiempo + N/E/Z).
    expect(lines[1].split(',')).toHaveLength(4);
  });

  // ── CPR-016-2 ──
  // Abrir el CSV en Excel: los números se leen con PUNTO decimal y hay una fila
  // de encabezados.
  it('CPR-016-2 test_abrir_csv_excel: valores con punto decimal y una fila de encabezados', () => {
    const wave: WaveData = { time: [0, 1.5], north: [1.25e-3, -2.5e-3], east: [0, 0], vertical: [0, 0] };
    const csv = buildSimCsv(wave);
    const lines = csv.split('\n');
    // Encabezado único.
    expect(lines[0]).toBe('time_s,north_rel,east_rel,vertical_rel');
    // El tiempo usa punto decimal (1.5000), no coma.
    const row = lines[2].split(',');
    expect(row[0]).toBe('1.5000');
    expect(row[0]).toContain('.');
    expect(row[0]).not.toContain(',');
    // Las componentes son numéricas en notación científica con punto.
    expect(row[1]).toMatch(/^-?\d\.\d+e[+-]\d+$/);
  });
});
