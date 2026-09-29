/**
 * Escenarios predeterminados del Simulador.
 *
 * Cada escenario llena TODOS los parámetros con valores respaldados por fuentes
 * (ver docs/escenarios-simulador.md) y validados con el motor real: sin rebotes
 * de borde dentro de la ventana útil, al menos 10 nodos por longitud de onda y
 * cómputo por debajo de 15 s. Elegir un escenario carga sus parámetros; el
 * usuario puede modificarlos después.
 *
 * @module lib/scenarios
 */
import { SimulationParams } from './types';
import { computeLame } from './simulation';

/** Metadatos de un escenario más su preset de parámetros. */
export interface Scenario {
  /** Identificador estable del escenario. */
  id: string;
  /** Nombre corto para el selector. */
  name: string;
  /** Qué se espera observar en las trazas (frase corta para el estudiante). */
  expectation: string;
  /** Parámetros completos del escenario. */
  params: SimulationParams;
}

/** Construye los parámetros completos calculando λ y μ desde Vp/Vs/ρ. */
function build(p: Omit<SimulationParams, 'lambda' | 'mu'>): SimulationParams {
  const { lambda, mu } = computeLame(p.vp, p.vs, p.density);
  return { ...p, lambda, mu };
}

/**
 * Lista de escenarios. El primero es el que se carga al abrir el Simulador
 * (el más didáctico: P, S y tren de ondas superficiales bien separados).
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'superficial-didactico',
    name: 'Superficial didáctico (P, S y superficiales)',
    expectation:
      'Fuente somera a mayor distancia: observa la P, luego la S y, justo después, el tren de ondas superficiales en la vertical y la radial.',
    params: build({
      vp: 3200, vs: 1850, density: 2500, sourceType: 'tectonic',
      magnitude: 4.0, depth: 2, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 7, dx: 20, dt: 0.0045,
      strike: 20, dip: 35, rake: 60, stationAzimuth: 40, epicentralDistanceKm: 6,
    }),
  },
  {
    id: 'cortical-superficial-narino',
    name: 'Cortical superficial andino (Nariño)',
    expectation:
      'Sismo cortical típico del suroccidente andino: P, S y tren superficial, con energía en las tres componentes (la transversal muestra el SH del mecanismo).',
    params: build({
      vp: 3500, vs: 2000, density: 2600, sourceType: 'tectonic',
      magnitude: 5.0, depth: 5, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 7, dx: 22, dt: 0.004,
      strike: 30, dip: 40, rake: 80, stationAzimuth: 45, epicentralDistanceKm: 6,
    }),
  },
  {
    id: 'cortical-profundo',
    name: 'Cortical más profundo (comparación)',
    expectation:
      'La misma corteza pero con la fuente más profunda: la P y la S se separan más y el tren superficial casi desaparece. Compáralo con el superficial.',
    params: build({
      vp: 3500, vs: 2000, density: 2600, sourceType: 'tectonic',
      magnitude: 5.5, depth: 9, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 8, dx: 22, dt: 0.004,
      strike: 30, dip: 40, rake: 80, stationAzimuth: 45, epicentralDistanceKm: 5,
    }),
  },
  {
    id: 'volcano-tectonico-galeras',
    name: 'Volcano-tectónico del Galeras',
    expectation:
      'Evento volcánico somero (fuente isótropa): domina la onda P y la componente transversal es casi nula (no hay cizalla). La señal decae rápido a la calma.',
    params: build({
      vp: 3000, vs: 1700, density: 2500, sourceType: 'volcanic',
      magnitude: 2.5, depth: 3, epicenterLat: 1.2216, epicenterLon: -77.3742,
      duration: 7, dx: 28, dt: 0.0055,
      strike: 30, dip: 45, rake: 90, stationAzimuth: 45, epicentralDistanceKm: 5,
    }),
  },
];

/** Escenario por defecto al abrir el Simulador (el más didáctico). */
export function defaultScenario(): Scenario {
  return SCENARIOS[0];
}

/** Devuelve un escenario por su id, o undefined si no existe. */
export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find(s => s.id === id);
}
