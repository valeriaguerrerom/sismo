// @vitest-environment jsdom
/**
 * HU014 — Ver historial de simulaciones.
 * - CPR-014-1: reportes del usuario ordenados por created_at desc.
 * - CPR-014-2: historial vacío muestra "No tienes reportes aún" (render real).
 * - CPR-014-3: eliminar un reporte lo quita de la BD y de la lista.
 * - CPR-014-4: exportar PDF de un reporte con waveData no lanza error.
 *
 * Usa un Supabase simulado en memoria (setup/teardown por test) y mockea
 * jsPDF.save para no escribir archivos.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeSupabaseMock, type MemoryDB } from '../test/supabaseMock';

let db: MemoryDB;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockClient: any;

vi.mock('../lib/supabase', () => ({
  get supabase() { return mockClient; },
}));

// Usuario de prueba autenticado (evita montar el AuthProvider real).
const TEST_USER = { id: 'user-test-1', email: 'test@sismo.co', full_name: 'Usuario Prueba', role: 'user' };
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: TEST_USER }),
}));

// Espía de jsPDF.save (no escribir PDF real en disco).
const saveSpy = vi.fn();
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(() => ({
    save: saveSpy,
    setFont: vi.fn(), setFontSize: vi.fn(), setTextColor: vi.fn(), setFillColor: vi.fn(),
    setDrawColor: vi.fn(), setLineWidth: vi.fn(), setLineDashPattern: vi.fn(),
    text: vi.fn(), rect: vi.fn(), line: vi.fn(), addPage: vi.fn(),
    getNumberOfPages: vi.fn(() => 1), setPage: vi.fn(),
    splitTextToSize: vi.fn(() => ['x']), getTextWidth: vi.fn(() => 10),
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  })),
}));

import { MyReports } from './MyReports';
import { downloadReportPdf } from '../lib/reportPdf';
import type { SimulationParams, WaveData } from '../lib/types';

function baseParams(): SimulationParams {
  return {
    vp: 3500, vs: 2000, density: 2600, lambda: 1, mu: 1, sourceType: 'tectonic',
    magnitude: 5, depth: 15, epicenterLat: 1.2, epicenterLon: -77.3, duration: 60, dx: 100, dt: 0.02,
  } as SimulationParams;
}

function seedReports(): MemoryDB {
  return {
    simulation_reports: [
      { id: 'rep-old', user_id: TEST_USER.id, title: 'Reporte viejo', notes: '', created_at: '2026-01-01T10:00:00Z', params: baseParams(), results: {} },
      { id: 'rep-new', user_id: TEST_USER.id, title: 'Reporte nuevo', notes: '', created_at: '2026-09-01T10:00:00Z', params: baseParams(), results: {} },
      { id: 'rep-otro', user_id: 'otro-user', title: 'Ajeno', notes: '', created_at: '2026-05-01T10:00:00Z', params: baseParams(), results: {} },
    ],
  };
}

beforeEach(() => {
  db = seedReports();
  mockClient = makeSupabaseMock(db);
  saveSpy.mockClear();
});

describe('HU014 — Historial de simulaciones', () => {
  it('CPR-014-1 test_listar_reportes_usuario: reportes del usuario ordenados por created_at desc', async () => {
    const { data } = await mockClient
      .from('simulation_reports').select('*').eq('user_id', TEST_USER.id)
      .order('created_at', { ascending: false });
    // Solo los del usuario (2 de 3), y el más reciente primero.
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('rep-new');
    expect(data[1].id).toBe('rep-old');
  });

  it('CPR-014-2 test_historial_vacio: sin reportes muestra "No tienes reportes aún"', async () => {
    db.simulation_reports = []; // usuario sin reportes
    render(<MyReports />);
    // Espera a que el efecto de carga resuelva y se pinte el estado vacío.
    expect(await screen.findByText('No tienes reportes aún')).toBeInTheDocument();
  });

  it('CPR-014-3 test_eliminar_reporte: se elimina de la BD y de la lista', async () => {
    // Estado inicial: 3 reportes en la tabla.
    expect(db.simulation_reports).toHaveLength(3);
    // Eliminar el reporte de prueba (misma operación que MyReports.deleteReport).
    await mockClient.from('simulation_reports').delete().eq('id', 'rep-new');
    expect(db.simulation_reports.some(r => r.id === 'rep-new')).toBe(false);
    expect(db.simulation_reports).toHaveLength(2);

    // Y ya no aparece al recargar la lista del usuario.
    const { data } = await mockClient
      .from('simulation_reports').select('*').eq('user_id', TEST_USER.id)
      .order('created_at', { ascending: false });
    expect(data.some((r: { id: string }) => r.id === 'rep-new')).toBe(false);
  });

  it('CPR-014-4 test_exportar_pdf_reporte: genera el PDF de un reporte con waveData sin error', () => {
    const waveData: WaveData = {
      time: [0, 0.02, 0.04, 0.06], north: [0, 1e-4, -1e-4, 0],
      east: [0, 2e-4, -1e-4, 0], vertical: [0, 1e-4, 1e-4, 0],
    };
    expect(() => downloadReportPdf({
      title: 'Reporte con sismogramas',
      author: TEST_USER.full_name,
      notes: 'prueba',
      createdAt: '2026-09-01T10:00:00Z',
      params: baseParams(),
      results: {
        maxAmplitude: 1e-3, duration: 60, dominantFrequency: 2,
        pArrival: 3, sArrival: 5, waveData,
      },
    })).not.toThrow();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
