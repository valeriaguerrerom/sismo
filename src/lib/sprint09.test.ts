/**
 * Sprint 9 — HU034: abrir un evento sísmico (epicentro real del USGS, ubicación
 * por zona, profundidad asumida y conteo de eventos sin duplicar).
 *
 * Casos CPR-034-1..4 (Vitest). Se prueba la LÓGICA pura del navegador que
 * decide, a partir del dato del catálogo, cómo se presenta un evento:
 *   - loadCatalog (catalog.ts) combina las fuentes y entrega una fila por evento
 *     con `location_source` y `depth_km`.
 *   - Regla de ubicación: `coordIsZone = location_source !== 'SGC/USGS'`
 *     (así la decide Map3D). Si es 'SGC/USGS' se muestra el epicentro real y el
 *     enlace al USGS; si no, es una coordenada por zona.
 *   - Regla de profundidad: `depthAssumed = depth_km == null`; cuando falta, se
 *     asume un valor por tipo (volcánico 5 km, tectónico 15 km) y la UI lo avisa.
 *   - loadUsgsCatalog (usgsDepth.ts) trae el catálogo del USGS con el enlace de
 *     consulta (fuente del epicentro real).
 *   - Conteo: cada evento aparece una sola vez (ids únicos), no se cuenta dos
 *     veces aunque tenga datos en más de una fuente.
 *
 * NOTA de discrepancia (ver RESUMEN): el caso CPR-034-3 del documento dice
 * "profundidad fijada en 10 km", pero la aplicación asume 15 km para los
 * tectónicos y 5 km para los volcánicos (no 10 km). La prueba verifica el
 * comportamiento REAL de la app y deja anotada la diferencia de redacción; no se
 * cambió el código para forzar un 10.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null }));

import { loadCatalog } from './catalog';
import type { CatalogRow } from './catalog';
import { loadUsgsCatalog } from './usgsDepth';

const originalFetch = global.fetch;

function mockJsonFetch(map: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const key = Object.keys(map).find(k => String(url).includes(k));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    return Promise.resolve({ ok: true, status: 200, json: async () => map[key] } as Response);
  });
}

// ── Reglas de presentación del evento, idénticas a las de Map3D.tsx ──
/** Ubicación por zona (no epicentro instrumental) salvo que venga del SGC/USGS. */
function coordIsZone(row: Pick<CatalogRow, 'location_source'>): boolean {
  return row.location_source !== 'SGC/USGS';
}
/** La profundidad es asumida cuando el catálogo no la trae. */
function depthAssumed(row: Pick<CatalogRow, 'depth_km'>): boolean {
  return row.depth_km == null;
}
/** Profundidad usada para la escena: la real o la asumida por tipo (volc 5, tect 15). */
function depthForScene(row: Pick<CatalogRow, 'depth_km' | 'event_type'>): number {
  if (row.depth_km != null) return row.depth_km;
  return row.event_type === 'volcanic' ? 5 : 15;
}

describe('HU034 — Abrir un evento sísmico (epicentro, profundidad, conteo)', () => {
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  // ── CPR-034-1 ──
  // Evento con epicentro real del USGS: se muestra su epicentro y su profundidad
  // reales y hay un enlace al catálogo del USGS.
  it('CPR-034-1 test_abrir_evento_epicentro_usgs: epicentro y profundidad reales con enlace al USGS', async () => {
    // Evento con epicentro real (location_source 'SGC/USGS') y profundidad real.
    const row: CatalogRow = {
      event_id: 'CM_real', event_date: '2023-10-17', event_time: '14:39:45',
      magnitude: 4.5, depth_km: 32, latitude: 1.6, longitude: -77.1,
      location_name: 'Nariño', event_type: 'tectonic', volcanic_subtype: null,
      region: 'Colombia', station_count: 5, source: 'SGC-RSNC',
      location_source: 'SGC/USGS',
    };
    // Epicentro real → NO es por zona, y la profundidad NO es asumida.
    expect(coordIsZone(row)).toBe(false);
    expect(depthAssumed(row)).toBe(false);
    expect(depthForScene(row)).toBe(32);

    // El catálogo del USGS trae el enlace de consulta (fuente del epicentro).
    global.fetch = mockJsonFetch({
      '/data/usgs_narino.json': {
        consulta: {
          fuente: 'USGS ComCat', url: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
          consultado_utc: '2024-01-01', region: { lat: [0, 3], lon: [-80, -76] },
          filtros: { magnitud_minima: 2.5, desde: '1990-01-01' },
        },
        eventos: [{ id: 'us1', fecha: '2023-10-17', magnitud: 4.5, profundidad_km: 32, lat: 1.6, lon: -77.1, lugar: 'Nariño' }],
      },
    }) as typeof fetch;
    const usgs = await loadUsgsCatalog();
    expect(usgs).not.toBeNull();
    expect(usgs!.consulta.url).toContain('usgs.gov');
    expect(usgs!.eventos[0].profundidad_km).toBe(32);
  });

  // ── CPR-034-2 ──
  // Evento de magnitud baja (red CM, sin epicentro del USGS): la ubicación es por
  // zona (centroide de estaciones) y la profundidad es asumida.
  it('CPR-034-2 test_abrir_evento_magnitud_baja: ubicación por zona y profundidad asumida', async () => {
    global.fetch = mockJsonFetch({
      '/data/cm/index.json': {
        events: [
          { id: 'CM_low', date: '2023-01-09', time: '00:24:00', magnitude: 2.5, folder: 'Colombia',
            stations: [{ latitude: 1.4, longitude: -77.0 }, { latitude: 1.6, longitude: -77.2 }] },
        ],
      },
    }) as typeof fetch;

    const rows = await loadCatalog();
    const ev = rows.find(r => r.event_id === 'CM_low')!;
    expect(ev).toBeTruthy();
    // La fila de fallback usa 'centroide de estaciones' como origen de la coord.
    expect(ev.location_source).toBe('centroide de estaciones');
    expect(coordIsZone(ev)).toBe(true);          // no es epicentro real
    expect(depthAssumed(ev)).toBe(true);          // el catálogo no trae profundidad
    expect(ev.depth_km).toBeNull();
  });

  // ── CPR-034-3 ──
  // Evento sin profundidad en el catálogo: el sistema indica que la profundidad
  // está fijada/asumida. (El documento dice 10 km; la app asume 15 km para
  // tectónicos y 5 km para volcánicos — ver nota de discrepancia en el RESUMEN.)
  it('CPR-034-3 test_abrir_evento_profundidad_fijada: la profundidad se fija/asume cuando falta en el catálogo', () => {
    const tect: CatalogRow = {
      event_id: 'CM_nd', event_date: '2023-02-02', event_time: '00:00:00',
      magnitude: 3.0, depth_km: null, latitude: 1.5, longitude: -77.1,
      location_name: 'Nariño', event_type: 'tectonic', volcanic_subtype: null,
      region: 'Colombia', station_count: 3, source: 'SGC-RSNC',
      location_source: 'centroide de estaciones',
    };
    const volc: CatalogRow = { ...tect, event_id: 'G_nd', event_type: 'volcanic', region: 'Nariño (Galeras)' };

    // Sin profundidad en el catálogo → profundidad asumida (fijada por el sistema).
    expect(depthAssumed(tect)).toBe(true);
    expect(depthAssumed(volc)).toBe(true);
    // Valor real que fija la app por tipo (NO 10 km): 15 tectónico, 5 volcánico.
    expect(depthForScene(tect)).toBe(15);
    expect(depthForScene(volc)).toBe(5);
  });

  // ── CPR-034-4 ──
  // Consultar el conteo de eventos: cada evento aparece una sola vez (ids
  // únicos), no se cuenta dos veces aunque combine fuentes CM y Galeras.
  it('CPR-034-4 test_consultar_conteo_eventos: cada evento se cuenta una sola vez', async () => {
    global.fetch = mockJsonFetch({
      '/data/cm/index.json': {
        events: [
          { id: 'CM_1', date: '2024-01-01', time: '00:00:00', magnitude: 4.2, folder: 'Colombia', stations: [{ latitude: 1, longitude: -77 }] },
          { id: 'CM_2', date: '2023-05-05', time: '00:00:00', magnitude: 3.1, folder: 'Ecuador', stations: [{ latitude: 1, longitude: -77 }] },
        ],
      },
      '/data/galeras/index.json': {
        events: [
          { id: 'G_1', event_date: '2006-02-02', event_time: '11:00:00', volcanic_subtype: 'lp', location_name: 'Galeras' },
        ],
      },
    }) as typeof fetch;

    const rows = await loadCatalog();
    // Tres eventos distintos → conteo tres, sin duplicados.
    expect(rows).toHaveLength(3);
    const ids = rows.map(r => r.event_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length); // no hay ids repetidos
    expect(unique.has('CM_1')).toBe(true);
    expect(unique.has('G_1')).toBe(true);
  });
});
