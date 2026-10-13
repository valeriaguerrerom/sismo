// @vitest-environment jsdom
/**
 * Sprint 14 — HU042: página de Inicio (presentación y cifras reales).
 *
 * Casos CPR-042-1..3 (Vitest). Prueban la capa de datos del Home
 * (`src/lib/homeStats.ts`): las cifras (total de eventos y período de años) se
 * derivan de `seismic_events`, y ante una conexión lenta o sin Supabase el
 * Home recibe cifras de respaldo (nunca valores vacíos / en cero), que es lo
 * que sostiene el esqueleto de carga de la interfaz.
 *
 * La presentación visual del Home (hero, accesos a los módulos) se prueba
 * indirectamente: estas pruebas verifican que los datos que alimenta la página
 * nunca llegan vacíos. El acceso a los módulos según la sesión se cubre en el
 * Sprint 6 (Playwright).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock del cliente Supabase: por defecto null (fuerza el fallback). Los tests
// que necesitan datos reales lo sustituyen con un stub encadenable.
let mockClient: unknown = null;
vi.mock('./supabase', () => ({ get supabase() { return mockClient; } }));

import { loadHomeStats } from './homeStats';

/** Stub mínimo de supabase: from().select() resuelve con las filas dadas. */
function stubSupabase(rows: unknown[]) {
  return {
    from() {
      return { select() { return Promise.resolve({ data: rows, error: null }); } };
    },
  };
}

afterEach(() => { mockClient = null; vi.restoreAllMocks(); });

describe('HU042 — Página de Inicio (cifras reales)', () => {
  // ── CPR-042-1 ──
  // Abrir el Inicio sin sesión: la plataforma se presenta con cifras reales
  // (nunca vacías). Aquí se verifica que la capa de datos del Home siempre
  // entrega una estructura completa de indicadores.
  it('CPR-042-1 test_abrir_pagina_inicio_sin_sesion: el Home recibe indicadores completos (no vacíos)', async () => {
    mockClient = stubSupabase([
      { event_date: '2006-02-02', magnitude: null, event_type: 'volcanic' },
      { event_date: '2023-01-09', magnitude: 4.2, event_type: 'tectonic' },
      { event_date: '2026-04-25', magnitude: 6.3, event_type: 'tectonic' },
    ]);
    const stats = await loadHomeStats();
    // Todas las cifras que presenta el Home están definidas.
    expect(stats.total_eventos).toBe(3);
    expect(stats.eventos_cm).toBe(2);
    expect(stats.eventos_galeras).toBe(1);
    expect(stats.anio_min).not.toBeNull();
    expect(stats.anio_max).not.toBeNull();
  });

  // ── CPR-042-2 ──
  // Consultar las estadísticas: total de eventos y período de años desde la BD.
  it('CPR-042-2 test_consultar_estadisticas: total de eventos y período de años desde seismic_events', async () => {
    mockClient = stubSupabase([
      { event_date: '2006-02-02', magnitude: null, event_type: 'volcanic' },
      { event_date: '2006-05-10', magnitude: null, event_type: 'volcanic' },
      { event_date: '2026-04-25', magnitude: 6.3, event_type: 'tectonic' },
    ]);
    const stats = await loadHomeStats();
    expect(stats.total_eventos).toBe(3);               // total de eventos
    expect(stats.anio_min).toBe(2006);                 // período de años (BD)
    expect(stats.anio_max).toBe(2026);
    expect(stats.anios_registro).toBe(2026 - 2006 + 1);
    expect(stats.magnitud_maxima).toBe(6.3);
  });

  // ── CPR-042-3 ──
  // Conexión lenta / sin Supabase: el Home recibe cifras de respaldo en vez de
  // valores vacíos (lo que permite mostrar el esqueleto y luego datos, no ceros).
  it('CPR-042-3 test_abrir_inicio_conexion_lenta: sin Supabase devuelve cifras de respaldo (no vacías)', async () => {
    mockClient = null; // simula que no hay conexión a Supabase
    const stats = await loadHomeStats();
    // Nunca devuelve ceros/vacíos: trae el respaldo documentado.
    expect(stats.total_eventos).toBeGreaterThan(0);
    expect(stats.anio_min).not.toBeNull();
    expect(stats.anio_max).not.toBeNull();
    expect(stats.magnitud_maxima).not.toBeNull();
    expect(stats.eventos_cm + stats.eventos_galeras).toBe(stats.total_eventos);
  });
});
