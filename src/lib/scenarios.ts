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
 * Lista de escenarios. El primero es el que se carga al abrir el Simulador.
 *
 * Todos los valores de velocidades y densidades son REPRESENTATIVOS con fines
 * educativos (no un estudio de sitio calibrado). Los parámetros se eligieron
 * midiendo criterios objetivos en el motor real (ver docs/escenarios-simulador.md):
 * cola tras la S mayor que en el mismo caso homogéneo (en los de capa), P
 * visible (≥15 % de la S en escala común), las tres componentes con señal
 * (la menor ≥25 % de la mayor, salvo la transversal del volcánico que es casi
 * nula por ser fuente isótropa), el pulso llenando la ventana del evento, sin
 * rebotes de borde (P ni S) dentro de la duración, ≥10 nodos por longitud de
 * onda y cómputo < 15 s.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'pasto-deposito-volcanico',
    name: 'Pasto sobre depósitos volcánicos (dos capas)',
    expectation:
      'Capa blanda de depósitos volcánicos sobre roca: la onda S se amplifica y la sacudida se prolonga después de su llegada. Compárala con un modelo homogéneo.',
    params: build({
      vp: 4000, vs: 2300, density: 2600, sourceType: 'tectonic',
      magnitude: 4.5, depth: 2, epicenterLat: 1.2136, epicenterLon: -77.2811,
      // dx 25 y duración 6.5 s: el primer rebote de borde (P) llega a ~8.5 s,
      // fuera de la ventana; cómputo ~11 s. Mecanismo (dip 45, rake 60, az 45)
      // equilibra las tres componentes.
      duration: 6.5, dx: 25, dt: 0.0039,
      strike: 30, dip: 45, rake: 60, stationAzimuth: 45, epicentralDistanceKm: 4,
      sourceCycles: 1,
      subsurfaceModel: 'twoLayer',
      layerThickness: 0.5, layerVp: 1800, layerVs: 600, layerDensity: 1900,
    }),
  },
  {
    id: 'cortical-superficial-narino',
    name: 'Cortical andino (Nariño, dos capas)',
    expectation:
      'Sismo cortical andino con una capa de sedimentos moderadamente blanda sobre roca: P y S bien marcadas y una cola algo prolongada por la capa.',
    params: build({
      vp: 3500, vs: 2000, density: 2600, sourceType: 'tectonic',
      magnitude: 5.0, depth: 3, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 6.5, dx: 25, dt: 0.0045,
      strike: 30, dip: 45, rake: 60, stationAzimuth: 45, epicentralDistanceKm: 4,
      sourceCycles: 1,
      // Sedimentos moderadamente blandos sobre la roca (contraste moderado).
      subsurfaceModel: 'twoLayer',
      layerThickness: 0.6, layerVp: 2600, layerVs: 1000, layerDensity: 2100,
    }),
  },
  {
    id: 'volcano-tectonico-galeras',
    name: 'Volcano-tectónico del Galeras (dos capas)',
    expectation:
      'Evento volcánico (fuente isótropa) con depósitos piroclásticos sobre roca volcánica: domina la P, la transversal es casi nula (no hay cizalla) y la capa prolonga la sacudida.',
    params: build({
      vp: 3000, vs: 1700, density: 2500, sourceType: 'volcanic',
      magnitude: 3.5, depth: 2.5, epicenterLat: 1.2216, epicenterLon: -77.3742,
      duration: 6, dx: 25, dt: 0.0053,
      strike: 30, dip: 45, rake: 90, stationAzimuth: 45, epicentralDistanceKm: 3,
      sourceCycles: 1,
      // Depósitos piroclásticos blandos sobre roca volcánica.
      subsurfaceModel: 'twoLayer',
      layerThickness: 0.4, layerVp: 1900, layerVs: 700, layerDensity: 1800,
    }),
  },
  {
    id: 'cortical-profundo',
    name: 'Cortical más profundo (homogéneo)',
    expectation:
      'Corteza homogénea con la fuente más profunda: la P y la S llegan bien separadas, con energía en las tres componentes. Comparación sin capa.',
    params: build({
      vp: 3600, vs: 2050, density: 2700, sourceType: 'tectonic',
      magnitude: 5.5, depth: 5, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 6, dx: 20, dt: 0.004,
      strike: 30, dip: 45, rake: 80, stationAzimuth: 45, epicentralDistanceKm: 6,
      sourceCycles: 1,
    }),
  },
  {
    id: 'superficial-didactico',
    name: 'Cortical didáctico (homogéneo)',
    expectation:
      'Corteza homogénea somera: la P llega primero y, bien separada, un tren de onda S fuerte, con energía en las tres componentes. Comparación sin capa.',
    params: build({
      vp: 3200, vs: 1850, density: 2500, sourceType: 'tectonic',
      magnitude: 4.5, depth: 2, epicenterLat: 1.2136, epicenterLon: -77.2811,
      duration: 6, dx: 20, dt: 0.004,
      strike: 20, dip: 45, rake: 60, stationAzimuth: 35, epicentralDistanceKm: 4,
      sourceCycles: 1,
    }),
  },
];

/** Escenario por defecto al abrir el Simulador (Pasto sobre depósitos). */
export function defaultScenario(): Scenario {
  return SCENARIOS[0];
}

/** Devuelve un escenario por su id, o undefined si no existe. */
export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find(s => s.id === id);
}
