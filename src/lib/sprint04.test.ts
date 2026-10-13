/**
 * Sprint 4 — HU043 (interpretación educativa) y HU038 (escenarios predefinidos).
 *
 * Casos CPR-043-1 a CPR-043-4 y CPR-038-1 a CPR-038-4 (Vitest).
 * Prueban lógica pura del navegador: el texto interpretativo que genera
 * `interpretSimulation` según el tipo de fuente y el modelo de capas, y los
 * escenarios predefinidos de `src/lib/scenarios`.
 */
import { describe, it, expect } from 'vitest';
import { interpretSimulation, type InterpretationInput } from './interpretation';
import { SCENARIOS, defaultScenario } from './scenarios';
import { validateParams } from './paramLimits';
import type { SimulationParams } from './types';

/** Construye parámetros válidos mínimos para la interpretación. */
function params(over: Partial<SimulationParams> = {}): SimulationParams {
  return {
    vp: 3500, vs: 2000, density: 2600, lambda: 1, mu: 1,
    sourceType: 'tectonic', magnitude: 5.0, depth: 15,
    epicenterLat: 1.2136, epicenterLon: -77.2811,
    duration: 10, dx: 100, dt: 0.02, ...over,
  };
}

function input(over: Partial<InterpretationInput> = {}): InterpretationInput {
  return {
    params: params(over.params),
    dominantFrequency: 3.5,
    pArrival: 2.0,
    sArrival: 3.5,
    gridInfo: { nx: 200, nz: 150, totalSteps: 500, dx: 100, receiverX: 150, sourceX: 100 },
    ...over,
  };
}

describe('HU043 — Interpretación educativa de la simulación', () => {
  it('CPR-043-1 test_leer_interpretacion_simulacion_tectonica: explica arribos, S−P y amplitud en lenguaje sencillo', () => {
    const text = interpretSimulation(input({ params: params({ sourceType: 'tectonic' }) }));
    // Menciona los arribos P y S y la diferencia S−P.
    expect(text).toMatch(/onda P llega/i);
    expect(text).toMatch(/onda S/i);
    expect(text).toMatch(/S−P|S-P/);
    // Describe el carácter tectónico (doble par / SH transversal).
    expect(text).toMatch(/doble par|transversal|SH/i);
  });

  it('CPR-043-2 test_leer_interpretacion_simulacion_volcanica: se adapta y explica la fuente isótropa', () => {
    const text = interpretSimulation(input({ params: params({ sourceType: 'volcanic' }) }));
    expect(text).toMatch(/isótropo|isotrop/i);
    expect(text).toMatch(/transversal.*(nula|casi)|cizalla/i);
    // No debe describirlo como doble par tectónico.
    expect(text).not.toMatch(/doble par/i);
  });

  it('CPR-043-3 test_leer_interpretacion_capa_blanda: menciona el efecto de la capa sobre la S y la duración', () => {
    const p = params({ subsurfaceModel: 'twoLayer', layerThickness: 0.5, depth: 2 });
    const text = interpretSimulation(input({ params: p }));
    expect(text).toMatch(/capa/i);
    expect(text).toMatch(/amplif/i);        // amplifica la onda S
    expect(text).toMatch(/prolong|sacudida/i); // prolonga la sacudida
  });

  it('CPR-043-4 test_consultar_significado_metrica: el texto explica el significado de las métricas clave', () => {
    const text = interpretSimulation(input());
    // La interpretación da el significado de métricas: relación Vp/Vs,
    // frecuencia dominante y la separación S−P (proporcional a la distancia).
    expect(text).toMatch(/Vp\/Vs/);
    expect(text).toMatch(/frecuencia dominante/i);
    expect(text).toMatch(/proporcional a la distancia/i);
  });
});

describe('HU038 — Escenarios predefinidos del Simulador', () => {
  it('CPR-038-1 test_abrir_simulador_primera_vez: el escenario por defecto es "Pasto sobre depósitos volcánicos (dos capas)"', () => {
    const def = defaultScenario();
    expect(def).toBe(SCENARIOS[0]);
    expect(def.name).toMatch(/Pasto sobre depósitos volcánicos/i);
    expect(def.params.subsurfaceModel).toBe('twoLayer');
  });

  it('CPR-038-2 test_elegir_escenario_volcano_tectonico_galeras: llena todos los parámetros y describe qué observar', () => {
    const galeras = SCENARIOS.find(s => /Galeras/i.test(s.name));
    expect(galeras, 'no existe el escenario del Galeras').toBeTruthy();
    expect(galeras!.params.sourceType).toBe('volcanic');
    // Todos los parámetros numéricos clave están definidos (escenario completo).
    for (const k of ['vp', 'vs', 'density', 'magnitude', 'depth', 'duration', 'dx', 'dt'] as const) {
      expect(typeof galeras!.params[k], `falta ${k}`).toBe('number');
    }
    // Describe qué se espera observar.
    expect(galeras!.expectation.length).toBeGreaterThan(10);
  });

  it('CPR-038-3 test_validar_cinco_escenarios: ningún escenario requiere ajustes (cumplen rangos y física)', () => {
    expect(SCENARIOS.length).toBe(5);
    for (const sc of SCENARIOS) {
      const { messages } = validateParams(sc.params);
      // validateParams devuelve mensajes SOLO cuando corrige algo; vacío = OK.
      expect(Object.keys(messages), `el escenario "${sc.name}" requirió ajustes: ${JSON.stringify(messages)}`).toHaveLength(0);
    }
  });

  it('CPR-038-4 test_modificar_magnitud_escenario: cambiar un parámetro deja los params distintos del preset (pasa a "Personalizado")', () => {
    const sc = SCENARIOS[0];
    const modificado = { ...sc.params, magnitude: sc.params.magnitude + 1 };
    // El estado ya no coincide con NINGÚN escenario predefinido → "Personalizado".
    const coincide = SCENARIOS.some(s =>
      s.params.magnitude === modificado.magnitude &&
      s.params.vp === modificado.vp &&
      s.params.subsurfaceModel === modificado.subsurfaceModel &&
      s.params.sourceType === modificado.sourceType);
    expect(coincide).toBe(false);
  });
});
