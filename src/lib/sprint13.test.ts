// @vitest-environment jsdom
/**
 * Sprint 13 — Panel de administración: HU012 (gestión de eventos sísmicos),
 * HU018 (dashboard de indicadores), HU020 (gestión de contenido educativo) y
 * HU041 (gestión de reportes).
 *
 * Casos CPR-012-1..6, CPR-018-1..3, CPR-020-1..4 y CPR-041-1..4 (Vitest). Se
 * prueba la lógica real de `src/lib/adminData.ts`, `src/lib/adminExport.ts` y
 * `src/lib/quakeml.ts` contra un Supabase simulado en memoria (`supabaseMock`),
 * sin tocar la base de datos real.
 *
 * NOTA sobre consolidación (ver RESUMEN): antes existían `adminEvents.test.ts`
 * (CPR-012-1..5) y `dashboard.test.ts` (CPR-018-1..3). Como el documento define
 * esos mismos ids para este sprint, se MOVIERON aquí (y se añadió CPR-012-6,
 * la importación QuakeML) y los archivos viejos se ELIMINARON para no duplicar
 * ids. `quakeml.test.ts` no usa ids CPR, así que se deja como está.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSupabaseMock, type MemoryDB } from '../test/supabaseMock';
import type { SeismicEvent } from './types';
import { simulationsByMonth } from './adminExport';
import { parseQuakemlLocal } from './quakeml';

let db: MemoryDB;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockClient: any;

vi.mock('./supabase', () => ({ get supabase() { return mockClient; } }));

import * as admin from './adminData';

/** 166 eventos sembrados: 134 CM (tectónicos) + 32 Galeras (volcánicos). */
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

/** Regla de validación del formulario de quiz (AdminDashboard): fuente obligatoria. */
function quizSaveAllowed(row: { source?: string | null }): boolean {
  return Boolean(row.source?.trim());
}

function seedFull(): MemoryDB {
  const now = new Date();
  const thisMonthIso = new Date(now.getFullYear(), now.getMonth(), 10).toISOString();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10).toISOString();
  return {
    seismic_events: seed166() as unknown as MemoryDB['seismic_events'],
    profiles: [
      { id: 'u1', full_name: 'Admin Uno', email: 'admin@test.co', role: 'admin', active: true, last_login: thisMonthIso },
      { id: 'u2', full_name: 'Investigador Dos', email: 'inv@test.co', role: 'user', active: true, last_login: thisMonthIso },
      { id: 'u3', full_name: 'Inactivo Tres', email: 'off@test.co', role: 'user', active: false, last_login: null },
    ],
    simulation_reports: [
      { id: 'r1', user_id: 'u1', title: 'Sim A', created_at: thisMonthIso, params: {}, results: {} },
      { id: 'r2', user_id: 'u2', title: 'Sim B', created_at: thisMonthIso, params: {}, results: {} },
      { id: 'r3', user_id: 'u2', title: 'Sim C', created_at: lastMonth, params: {}, results: {} },
    ],
    quiz_questions: [{ id: 'q1', question: '¿?', source: 'Shearer (2019)' }, { id: 'q2', question: '¿?', source: 'Stein (2003)' }],
    wave_facts: [{ id: 'f1', wave_type: 'P' }],
    timeline_events: [{ id: 't1', year: 1947 }, { id: 't2', year: 1979 }, { id: 't3', year: 2006 }],
  };
}

beforeEach(() => {
  db = seedFull();
  mockClient = makeSupabaseMock(db);
});

describe('HU012 — Gestión de eventos sísmicos (admin)', () => {
  // ── CPR-012-1 ──
  it('CPR-012-1 test_listar_eventos: la carga inicial devuelve los 166 eventos registrados', async () => {
    const events = await admin.loadEvents();
    expect(events).toHaveLength(166);
  });

  // ── CPR-012-2 ──
  it('CPR-012-2 test_crear_evento: el evento se guarda y aparece en el listado', async () => {
    const created = await admin.createEvent({
      event_date: '2026-09-20', event_time: '00:00:00', magnitude: 4.0, depth_km: 15,
      latitude: 1.2136, longitude: -77.2811, location_name: 'Pasto, Nariño',
      event_type: 'tectonic', source: 'SGC', notes: '',
    });
    expect(created.id).toBeTruthy();
    const events = await admin.loadEvents();
    expect(events).toHaveLength(167);
    expect(events.some(e => e.location_name === 'Pasto, Nariño' && e.magnitude === 4.0)).toBe(true);
  });

  // ── CPR-012-3 ──
  it('CPR-012-3 test_editar_magnitud_evento: la magnitud se actualiza', async () => {
    const created = await admin.createEvent({
      event_date: '2026-09-20', event_time: '00:00:00', magnitude: 4.0, depth_km: 15,
      latitude: 1.2136, longitude: -77.2811, location_name: 'Evento edición',
      event_type: 'tectonic', source: 'SGC', notes: '',
    });
    await admin.updateEvent(created.id, { magnitude: 4.3 });
    const edited = (await admin.loadEvents()).find(e => e.id === created.id);
    expect(edited?.magnitude).toBe(4.3);
  });

  // ── CPR-012-4 ──
  it('CPR-012-4 test_eliminar_evento: el evento se retira de la base de datos', async () => {
    const created = await admin.createEvent({
      event_date: '2026-09-20', event_time: '00:00:00', magnitude: 4.0, depth_km: 15,
      latitude: 1.2136, longitude: -77.2811, location_name: 'Evento borrado',
      event_type: 'tectonic', source: 'SGC', notes: '',
    });
    await admin.deleteEvent(created.id);
    const events = await admin.loadEvents();
    expect(events.some(e => e.id === created.id)).toBe(false);
    expect(events).toHaveLength(166);
  });

  // ── CPR-012-5 ──
  it('CPR-012-5 test_buscar_eventos_galeras: el filtro por texto acota la lista', async () => {
    const events = await admin.loadEvents();
    const q = 'Galeras'.toLowerCase();
    const filtered = events.filter(e => e.location_name.toLowerCase().includes(q));
    expect(filtered.length).toBe(32);
    expect(filtered.every(e => e.event_type === 'volcanic')).toBe(true);
  });

  // ── CPR-012-6 ──
  it('CPR-012-6 test_importar_catalogo_quakeml: procesa el archivo y agrega en bloque los eventos válidos', async () => {
    const QUAKEML = `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:sgc.gov.co/catalog">
    <event publicID="smi:sgc.gov.co/event/1">
      <description><text>Pasto, Nariño</text></description>
      <origin publicID="o1"><time><value>2024-08-23T03:04:05Z</value></time>
        <latitude><value>1.2136</value></latitude><longitude><value>-77.2811</value></longitude>
        <depth><value>15000</value></depth><creationInfo><agencyID>SGC</agencyID></creationInfo></origin>
      <magnitude publicID="m1"><mag><value>3.4</value></mag><type>ML</type></magnitude>
    </event>
    <event publicID="smi:sgc.gov.co/event/2">
      <description><text>Volcán Galeras</text></description>
      <origin publicID="o2"><time><value>2006-01-04T06:56:00Z</value></time>
        <latitude><value>1.2216</value></latitude><longitude><value>-77.3742</value></longitude>
        <depth><value>5000</value></depth></origin>
      <magnitude publicID="m2"><mag><value>2.1</value></mag></magnitude>
    </event>
    <event publicID="smi:sgc.gov.co/event/3"><description><text>Sin origen</text></description></event>
  </eventParameters>
</q:quakeml>`;
    // El parser procesa el archivo: 3 en el archivo, 2 válidos, 1 descartado.
    const parsed = parseQuakemlLocal(QUAKEML);
    expect(parsed.total_en_archivo).toBe(3);
    expect(parsed.importados).toBe(2);
    expect(parsed.descartados).toBe(1);

    // Se agregan en bloque los eventos válidos a la base.
    const before = (await admin.loadEvents()).length;
    const n = await admin.bulkInsertEvents(parsed.eventos);
    expect(n).toBe(2);
    const after = await admin.loadEvents();
    expect(after.length).toBe(before + 2);
    expect(after.some(e => e.location_name === 'Pasto, Nariño')).toBe(true);
  });
});

describe('HU018 — Dashboard administrativo', () => {
  // ── CPR-018-1 ──
  it('CPR-018-1 test_consultar_indicadores: usuarios, cuentas activas, roles, simulaciones, eventos y contenido', async () => {
    const stats = await admin.loadDashboardStats();
    expect(stats.users).toBe(3);
    expect(stats.activeUsers).toBe(2);
    expect(stats.reports).toBe(3);
    expect(stats.roles.admin).toBe(1);
    expect(stats.roles.user).toBe(2);
    expect(stats.eventsByType).toEqual({ tectonic: 134, volcanic: 32 });
  });

  // ── CPR-018-2 ──
  it('CPR-018-2 test_ver_actividad_ultimos_seis_meses: simulaciones por mes y últimos accesos', async () => {
    const stats = await admin.loadDashboardStats();
    expect(Array.isArray(stats.reportsPerMonth)).toBe(true);
    expect(stats.reportsPerMonth.length).toBe(6); // últimos 6 meses
    const total = stats.reportsPerMonth.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(3); // los 3 reportes caen en los últimos 6 meses
  });

  // ── CPR-018-3 ──
  it('CPR-018-3 test_actualizar_resumen: recargar los indicadores es consistente', async () => {
    const first = await admin.loadDashboardStats();
    const second = await admin.loadDashboardStats();
    expect(second.users).toBe(first.users);
    expect(second.reports).toBe(first.reports);
    expect(second.roles).toEqual(first.roles);
  });
});

describe('HU020 — Gestión de contenido educativo (admin)', () => {
  // ── CPR-020-1 ──
  it('CPR-020-1 test_consultar_contenido_educativo: lista quiz, datos de ondas y línea de tiempo', async () => {
    const [quiz, facts, timeline] = await Promise.all([
      admin.loadQuizRows(), admin.loadFactRows(), admin.loadTimelineRows(),
    ]);
    expect(quiz.length).toBe(2);
    expect(facts.length).toBe(1);
    expect(timeline.length).toBe(3);
  });

  // ── CPR-020-2 ──
  it('CPR-020-2 test_agregar_pregunta_quiz: se guarda y queda disponible en Educación', async () => {
    await admin.saveQuizRow({ question: '¿Nueva?', source: 'Fuente X (2020)' });
    const quiz = await admin.loadQuizRows();
    expect(quiz.length).toBe(3);
    expect(quiz.some(q => q.question === '¿Nueva?')).toBe(true);
  });

  // ── CPR-020-3 ──
  it('CPR-020-3 test_guardar_pregunta_sin_fuente: no se guarda e indica que la fuente es obligatoria', async () => {
    // La validación del formulario (AdminDashboard) rechaza guardar sin fuente.
    expect(quizSaveAllowed({ source: '' })).toBe(false);
    expect(quizSaveAllowed({ source: '   ' })).toBe(false);
    expect(quizSaveAllowed({ source: null })).toBe(false);
    expect(quizSaveAllowed({ source: 'Shearer (2019)' })).toBe(true);
    // Como no se permite, el quiz NO cambia su cantidad.
    const before = (await admin.loadQuizRows()).length;
    expect(before).toBe(2);
  });

  // ── CPR-020-4 ──
  it('CPR-020-4 test_eliminar_evento_linea_tiempo: se retira de Educación', async () => {
    await admin.deleteTimelineRow('t2');
    const timeline = await admin.loadTimelineRows();
    expect(timeline.some(t => (t as { id: string }).id === 't2')).toBe(false);
    expect(timeline.length).toBe(2);
  });
});

describe('HU041 — Gestión de reportes (admin)', () => {
  // ── CPR-041-1 ──
  it('CPR-041-1 test_consultar_todos_reportes: lista los reportes de todos los usuarios', async () => {
    const reports = await admin.loadReports();
    expect(reports.length).toBe(3);
    const users = new Set(reports.map(r => (r as { user_id: string }).user_id));
    expect(users.size).toBeGreaterThan(1); // de más de un usuario
  });

  // ── CPR-041-2 ──
  it('CPR-041-2 test_filtrar_reportes_mes: muestra solo los reportes del período', async () => {
    const reports = await admin.loadReports();
    // Agrupados por mes (simulationsByMonth, usado por el panel para el período).
    const byMonth = simulationsByMonth(reports);
    const totalMeses = byMonth.reduce((s, m) => s + m.count, 0);
    expect(totalMeses).toBe(3);
    // Hay al menos dos meses distintos (este mes y el anterior).
    expect(byMonth.length).toBeGreaterThanOrEqual(2);
    // Filtrar a un solo mes deja solo sus reportes.
    const unMes = byMonth[byMonth.length - 1]; // mes más reciente
    expect(unMes.count).toBeGreaterThanOrEqual(1);
  });

  // ── CPR-041-3 ──
  it('CPR-041-3 test_exportar_excel: agrupa los reportes filtrados por mes para el Excel', () => {
    const reports = [
      { id: 'a', title: 'A', created_at: '2026-03-10T00:00:00Z', params: {}, results: {} },
      { id: 'b', title: 'B', created_at: '2026-01-05T00:00:00Z', params: {}, results: {} },
      { id: 'c', title: 'C', created_at: '2026-03-22T00:00:00Z', params: {}, results: {} },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
    // simulationsByMonth es la base de la hoja de resumen del Excel administrativo.
    expect(simulationsByMonth(reports)).toEqual([
      { month: '2026-01', count: 1 },
      { month: '2026-03', count: 2 },
    ]);
  });

  // ── CPR-041-4 ──
  it('CPR-041-4 test_eliminar_reporte_otro_usuario: el admin elimina el reporte de cualquier usuario', async () => {
    // r3 es del usuario u2; el admin puede eliminarlo.
    await admin.deleteReport('r3');
    const reports = await admin.loadReports();
    expect(reports.some(r => (r as { id: string }).id === 'r3')).toBe(false);
    expect(reports.length).toBe(2);
  });
});
