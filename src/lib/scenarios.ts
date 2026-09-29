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
 * (el más didáctico: P y S bien separadas).
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'superficial-didactico',
    name: 'Cortical didáctico (P y S separadas)',
    expectation:
      'Fuente somera de mecanismo inverso: la P llega primero y, bien separada, un tren de onda S fuerte. Domina la componente Norte.',
    params: build({
      vp: 3200, vs: 1850, density: 2500, sourceType: 'tectonic',
      magnitude: 4.5, depth: 2, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 8, dx: 20, dt: 0.004,
      strike: 20, dip: 35, rake: 90, stationAzimuth: 30, epicentralDistanceKm: 4,
      sourceCycles: 1,
    }),
  },
  {
    id: 'cortical-superficial-narino',
    name: 'Cortical andino (Nariño)',
    expectation:
      'Sismo cortical del suroccidente andino, algo más fuerte: P y S bien marcadas con un buen tren de ondas en las tres componentes.',
    params: build({
      vp: 3500, vs: 2000, density: 2600, sourceType: 'tectonic',
      magnitude: 5.0, depth: 4, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 9, dx: 24, dt: 0.0045,
      strike: 30, dip: 50, rake: 60, stationAzimuth: 60, epicentralDistanceKm: 4,
      sourceCycles: 1,
    }),
  },
  {
    id: 'cortical-profundo',
    name: 'Cortical más profundo (P y S más separadas)',
    expectation:
      'La misma corteza con la fuente más profunda: la P y la S llegan más separadas entre sí, con energía en las tres componentes. Compáralo con el somero.',
    params: build({
      vp: 3600, vs: 2050, density: 2700, sourceType: 'tectonic',
      magnitude: 5.5, depth: 5, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 7.5, dx: 20, dt: 0.004,
      strike: 30, dip: 45, rake: 80, stationAzimuth: 45, epicentralDistanceKm: 6,
      sourceCycles: 1,
    }),
  },
  {
    id: 'volcano-tectonico-galeras',
    name: 'Volcano-tectónico del Galeras',
    expectation:
      'Evento volcánico somero (fuente isótropa): domina la onda P, la vertical es pequeña y la transversal casi nula (no hay cizalla). Tren de ondas corto y rápido.',
    params: build({
      vp: 3000, vs: 1700, density: 2500, sourceType: 'volcanic',
      magnitude: 3.5, depth: 3, epicenterLat: 1.2216, epicenterLon: -77.3742,
      duration: 9, dx: 20, dt: 0.005,
      strike: 30, dip: 45, rake: 90, stationAzimuth: 45, epicentralDistanceKm: 4,
      sourceCycles: 1,
    }),
  },
  {
    id: 'pasto-deposito-volcanico',
    name: 'Pasto sobre depósitos volcánicos (dos capas)',
    expectation:
      'Capa blanda de depósitos volcánicos sobre roca: aparece la reflexión en la interfaz y la sacudida en superficie dura más y se amplifica (reverberación en la capa blanda). Compárala con un modelo homogéneo.',
    params: build({
      vp: 4000, vs: 2300, density: 2600, sourceType: 'tectonic',
      magnitude: 4.5, depth: 2, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 7.5, dx: 20, dt: 0.0035,
      strike: 30, dip: 45, rake: 90, stationAzimuth: 45, epicentralDistanceKm: 4,
      sourceCycles: 1,
      // Capa superficial blanda (valores REPRESENTATIVOS con fines educativos,
      // no un estudio de sitio calibrado; ver docs/modelo-capas.md).
      subsurfaceModel: 'twoLayer',
      layerThickness: 0.5, layerVp: 1800, layerVs: 600, layerDensity: 1900,
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
