import { describe, it, expect, vi, afterEach } from 'vitest';

// El módulo catalog importa `supabase` desde ./supabase. Lo mockeamos para
// controlar la respuesta y no depender de credenciales reales en el test.
vi.mock('./supabase', () => ({ supabase: null }));

import { loadCatalog } from './catalog';

const originalFetch = global.fetch;

function mockJsonFetch(map: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const key = Object.keys(map).find(k => String(url).includes(k));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    return Promise.resolve({ ok: true, status: 200, json: async () => map[key] } as Response);
  });
}

describe('loadCatalog (fallback JSON cuando no hay Supabase)', () => {
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('combina CM y Galeras y devuelve la cantidad total', async () => {
    global.fetch = mockJsonFetch({
      '/data/cm/index.json': {
        events: [
          { id: 'CM_1', date: '2024-01-01', time: '00:00:00', magnitude: 4.2, folder: 'Colombia', stations: [{ latitude: 1, longitude: -77 }, { latitude: 2, longitude: -78 }] },
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
    expect(rows).toHaveLength(3);
    // Tipos correctos
    expect(rows.filter(r => r.event_type === 'tectonic')).toHaveLength(2);
    expect(rows.filter(r => r.event_type === 'volcanic')).toHaveLength(1);
    // El volcánico queda con magnitud null y región Galeras
    const g = rows.find(r => r.event_id === 'G_1')!;
    expect(g.magnitude).toBeNull();
    expect(g.region).toBe('Nariño (Galeras)');
    expect(g.volcanic_subtype).toBe('lp');
    // El CM usa el centroide de sus estaciones
    const cm1 = rows.find(r => r.event_id === 'CM_1')!;
    expect(cm1.latitude).toBeCloseTo(1.5, 5);
    expect(cm1.longitude).toBeCloseTo(-77.5, 5);
    expect(cm1.station_count).toBe(2);
  });

  it('devuelve lista vacía si no hay datos', async () => {
    global.fetch = mockJsonFetch({}) as typeof fetch;
    const rows = await loadCatalog();
    expect(rows).toHaveLength(0);
  });
});
