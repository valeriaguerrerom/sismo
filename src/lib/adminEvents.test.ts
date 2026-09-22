// @vitest-environment jsdom
/**
 * HU012 — Gestionar datos sísmicos (admin).
 * Prueba loadEvents / createEvent / updateEvent / deleteEvent (src/lib/adminData)
 * y el filtro local de búsqueda por texto, contra un Supabase simulado en
 * memoria (setup/teardown por test, sin tocar la BD real).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSupabaseMock, type MemoryDB } from '../test/supabaseMock';
import type { SeismicEvent } from './types';

// DB en memoria compartida con el mock. Se reinicia en cada test.
let db: MemoryDB;

vi.mock('./supabase', () => ({
  get supabase() { return mockClient; },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockClient: any;

// Import diferido: adminData lee `supabase` en cada llamada (ensure()).
import * as admin from './adminData';

/** Genera 166 eventos sembrados: 134 CM (tectónicos) + 32 Galeras (volcánicos). */
function seed166(): SeismicEvent[] {
  const events: SeismicEvent[] = [];
  for (let i = 0; i < 134; i++) {
    events.push({
      id: `cm-${i}`, event_date: `2024-0${(i % 9) + 1}-15`, event_time: '12:00:00',
      magnitude: 2.5 + (i % 5) * 0.3, depth_km: 15, latitude: 1.5, longitude: -77.5,
      location_name: `Nariño CM ${i}`, event_type: 'tectonic', source: 'SGC', notes: '',
    } as SeismicEvent);
  }
  for (let i = 0; i < 32; i++) {
    events.push({
      id: `gal-${i}`, event_date: `2006-01-0${(i % 9) + 1}`, event_time: '06:00:00',
      magnitude: null as unknown as number, depth_km: 5, latitude: 1.2216, longitude: -77.3742,
      location_name: `Volcán Galeras — Evento ${i}`, event_type: 'volcanic', source: 'SGC-OVSP', notes: '',
    } as SeismicEvent);
  }
  return events;
}

beforeEach(() => {
  db = { seismic_events: seed166() as unknown as MemoryDB['seismic_events'] };
  mockClient = makeSupabaseMock(db);
});

describe('HU012 — Gestión de eventos sísmicos (admin)', () => {
  it('CPR-012-1 test_listar_eventos: la carga inicial devuelve 166 eventos', async () => {
    const events = await admin.loadEvents();
    expect(events).toHaveLength(166);
  });

  it('CPR-012-2 test_crear_evento_valido: el evento se crea y aparece en el listado', async () => {
    const nuevo = {
      event_date: '2026-09-20', event_time: '00:00:00', magnitude: 4.0, depth_km: 15,
      latitude: 1.2136, longitude: -77.2811, location_name: 'Pasto, Nariño',
      event_type: 'tectonic' as const, source: 'SGC', notes: '',
    };
    const created = await admin.createEvent(nuevo);
    expect(created.id).toBeTruthy();
    expect(created.location_name).toBe('Pasto, Nariño');

    const events = await admin.loadEvents();
    expect(events).toHaveLength(167);
    expect(events.some(e => e.location_name === 'Pasto, Nariño' && e.magnitude === 4.0)).toBe(true);
  });

  it('CPR-012-3 test_editar_magnitud: magnitude 4.0 → 4.3 se actualiza', async () => {
    const created = await admin.createEvent({
      event_date: '2026-09-20', event_time: '00:00:00', magnitude: 4.0, depth_km: 15,
      latitude: 1.2136, longitude: -77.2811, location_name: 'Evento prueba edición',
      event_type: 'tectonic', source: 'SGC', notes: '',
    });

    await admin.updateEvent(created.id, { magnitude: 4.3 });

    const events = await admin.loadEvents();
    const edited = events.find(e => e.id === created.id);
    expect(edited?.magnitude).toBe(4.3);
  });

  it('CPR-012-4 test_eliminar_evento: el evento ya no aparece en el listado', async () => {
    const created = await admin.createEvent({
      event_date: '2026-09-20', event_time: '00:00:00', magnitude: 4.0, depth_km: 15,
      latitude: 1.2136, longitude: -77.2811, location_name: 'Evento prueba borrado',
      event_type: 'tectonic', source: 'SGC', notes: '',
    });
    expect((await admin.loadEvents()).some(e => e.id === created.id)).toBe(true);

    await admin.deleteEvent(created.id);

    const events = await admin.loadEvents();
    expect(events.some(e => e.id === created.id)).toBe(false);
    expect(events).toHaveLength(166); // vuelve al conteo original
  });

  it('CPR-012-5 test_buscar_por_texto: q="Galeras" solo devuelve volcánicos de Galeras', async () => {
    const events = await admin.loadEvents();
    // Filtro local equivalente al del AdminDashboard (por nombre/ubicación).
    const q = 'Galeras'.toLowerCase();
    const filtered = events.filter(e => e.location_name.toLowerCase().includes(q));
    expect(filtered.length).toBe(32);
    expect(filtered.every(e => e.event_type === 'volcanic')).toBe(true);
  });
});
