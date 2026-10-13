/**
 * Casos de prueba del Sprint 1 (HU005 y HU006).
 * Cada caso lleva el identificador CPR del documento Casos_de_pruebas_Sprint1.
 * Ubicación en el repositorio: src/lib/sprint1.test.ts
 */
import { describe, it, expect } from 'vitest';
import { defaultParams, computeLame, presetForSource } from './simulation';
import { validateParams, maxEpicentralDistanceKm } from './paramLimits';

describe('HU005 Configurar las variables elásticas del subsuelo', () => {
  it('CPR-005-1 test_valores_por_defecto', () => {
    const p = defaultParams();
    expect(p.vp).toBe(3500);
    expect(p.vs).toBe(2000);
    expect(p.density).toBe(2600);
    expect(p.mu / 1e9).toBeCloseTo(10.4, 3);
    expect(p.lambda / 1e9).toBeCloseTo(11.05, 3);
  });

  it('CPR-005-2 test_calculo_lame', () => {
    const { lambda, mu } = computeLame(4000, 2300, 2600);
    expect(mu / 1e9).toBeCloseTo(13.754, 3);
    expect(lambda / 1e9).toBeCloseTo(14.092, 3);
  });

  it('CPR-005-3 test_ajuste_vp_fuera_de_rango', () => {
    const { params, messages } = validateParams({ ...defaultParams(), vp: 9000 });
    expect(params.vp).toBe(8000);
    expect(messages.vp).toContain('máximo');
  });

  it('CPR-005-4 test_vs_mayor_que_vp_raiz2', () => {
    const { params, messages } = validateParams({ ...defaultParams(), vp: 3000, vs: 2900 });
    expect(params.vs).toBe(Math.round((3000 / Math.SQRT2) * 0.98));
    expect(params.vs).toBeLessThan(3000 / Math.SQRT2);
    expect(messages.vs).toContain('λ');
  });
});

describe('HU006 Seleccionar el tipo de fuente sísmica y sus parámetros', () => {
  it('CPR-006-1 test_preset_tectonico', () => {
    const p = presetForSource('tectonic');
    expect(p.sourceType).toBe('tectonic');
    expect(p.magnitude).toBe(5.0);
    expect(p.depth).toBe(4);
    expect([p.strike, p.dip, p.rake]).toEqual([30, 45, 90]);
  });

  it('CPR-006-2 test_preset_volcanico', () => {
    const p = presetForSource('volcanic');
    expect(p.sourceType).toBe('volcanic');
    expect(p.epicenterLat).toBeCloseTo(1.2216, 4);
    expect(p.epicenterLon).toBeCloseTo(-77.3742, 4);
    expect(p.magnitude).toBe(4.5);
  });

  it('CPR-006-3 test_ajuste_magnitud_profundidad', () => {
    const { params, messages } = validateParams({ ...defaultParams(), magnitude: 10, depth: 150 });
    expect(params.magnitude).toBe(9);
    expect(params.depth).toBe(100);
    expect(messages.magnitude).toBeDefined();
    expect(messages.depth).toBeDefined();
  });

  it('CPR-006-4 test_ajuste_mecanismo_focal', () => {
    const { params } = validateParams({ ...defaultParams(), dip: 120, rake: 200 });
    expect(params.dip).toBe(90);
    expect(params.rake).toBe(180);
  });

  it('CPR-006-5 test_distancia_maxima_por_malla', () => {
    expect(maxEpicentralDistanceKm(20)).toBe(6.5);
    const { params, messages } = validateParams({ ...defaultParams(), dx: 20, epicentralDistanceKm: 12 });
    expect(params.epicentralDistanceKm).toBe(6.5);
    expect(messages.epicentralDistanceKm).toContain('6.5');
  });

  it('CPR-006-6 test_ajuste_dx_dispersion', () => {
    const { params, messages } = validateParams({ ...defaultParams(), dx: 50 });
    expect(params.dx).toBe(22);
    expect(messages.dx).toContain('10 nodos');
  });

  it('CPR-006-7 test_epicentro_fuera_de_narino', () => {
    const { params } = validateParams({ ...defaultParams(), epicenterLat: 5, epicenterLon: -70 });
    expect(params.epicenterLat).toBe(3);
    expect(params.epicenterLon).toBe(-75.5);
  });
});
