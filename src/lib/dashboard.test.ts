// @vitest-environment jsdom
/**
 * HU018 — Dashboard administrativo.
 * Prueba loadDashboardStats (src/lib/adminData): indicadores definidos,
 * reportes por mes y que "actualizar" (volver a cargar) funciona sin error.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSupabaseMock, type MemoryDB } from '../test/supabaseMock';

let db: MemoryDB;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockClient: any;

vi.mock('./supabase', () => ({
  get supabase() { return mockClient; },
}));

import { loadDashboardStats } from './adminData';

function seedDB(): MemoryDB {
  const now = new Date();
  const thisMonthIso = new Date(now.getFullYear(), now.getMonth(), 10).toISOString();
  return {
    profiles: [
      { id: 'u1', full_name: 'Admin Uno', email: 'admin@test.co', role: 'admin', active: true, last_login: thisMonthIso },
      { id: 'u2', full_name: 'Investigador Dos', email: 'inv@test.co', role: 'user', active: true, last_login: thisMonthIso },
      { id: 'u3', full_name: 'Inactivo Tres', email: 'off@test.co', role: 'user', active: false, last_login: null },
    ],
    seismic_events: [
      { id: 'e1', event_type: 'tectonic' }, { id: 'e2', event_type: 'tectonic' }, { id: 'e3', event_type: 'volcanic' },
    ],
    simulation_reports: [
      { id: 'r1', created_at: thisMonthIso }, { id: 'r2', created_at: thisMonthIso },
    ],
    quiz_questions: [{ id: 'q1' }, { id: 'q2' }],
    wave_facts: [{ id: 'f1' }],
    timeline_events: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
  };
}

beforeEach(() => {
  db = seedDB();
  mockClient = makeSupabaseMock(db);
});

describe('HU018 — Dashboard administrativo', () => {
  it('CPR-018-1 test_cargar_dashboard_stats: users, activeUsers, roles y reports vienen definidos', async () => {
    const stats = await loadDashboardStats();
    expect(stats.users).toBe(3);
    expect(stats.activeUsers).toBe(2);
    expect(stats.reports).toBe(2);
    expect(stats.roles).toBeDefined();
    expect(stats.roles.admin).toBe(1);
    expect(stats.roles.user).toBe(2);
    expect(stats.eventsByType).toEqual({ tectonic: 2, volcanic: 1 });
  });

  it('CPR-018-2 test_reports_por_mes: reportsPerMonth es un array con conteo por mes', async () => {
    const stats = await loadDashboardStats();
    expect(Array.isArray(stats.reportsPerMonth)).toBe(true);
    expect(stats.reportsPerMonth.length).toBe(6); // últimos 6 meses
    for (const b of stats.reportsPerMonth) {
      expect(b).toHaveProperty('label');
      expect(typeof b.count).toBe('number');
    }
    // Los 2 reportes sembrados caen en el mes actual (último bucket).
    const total = stats.reportsPerMonth.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(2);
  });

  it('CPR-018-3 test_actualizar_dashboard: recargar (onRefresh) no falla y es consistente', async () => {
    const first = await loadDashboardStats();
    // "Actualizar" simplemente vuelve a cargar los indicadores.
    const second = await loadDashboardStats();
    expect(second.users).toBe(first.users);
    expect(second.reports).toBe(first.reports);
    expect(second.roles).toEqual(first.roles);
  });
});
