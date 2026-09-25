/**
 * Hechos históricos y geográficos de Nariño usados en la interfaz.
 *
 * Estos valores NO se calculan desde la base de datos: son datos históricos
 * y geográficos generales. Se centralizan aquí, cada uno con su fuente, para
 * que quede documentado de dónde salieron y no se pierdan como valores mágicos
 * en el JSX.
 *
 * @module data/hechos-narino
 */

/** Sismo más fuerte registrado en Nariño (histórico). */
export const SISMO_MAS_FUERTE = {
  valor: 'Mw 8.1',
  descripcion: 'Sismo más fuerte — Tumaco, 1979',
  // Fuente: Servicio Geológico Colombiano (SGC). Terremoto de Tumaco del
  // 12 de diciembre de 1979, Mw 8.1 (con tsunami).
  fuente: 'Servicio Geológico Colombiano (SGC)',
};

/** Altura del Volcán Galeras. */
export const ALTURA_GALERAS = {
  valor: '4,276 m',
  descripcion: 'Altura del Volcán Galeras',
  // Fuente: SGC. Altitud de la cima del Volcán Galeras.
  fuente: 'Servicio Geológico Colombiano (SGC)',
};

/** Número de volcanes activos vigilados por el OVSP en Nariño. */
export const VOLCANES_ACTIVOS = {
  valor: 7,
  descripcion: 'Volcanes activos vigilados por el OVSP',
  // Fuente: SGC — Observatorio Vulcanológico y Sismológico de Pasto (OVSP),
  // informes mensuales de actividad volcánica. Los 7 volcanes vigilados son:
  // Galeras, Cumbal, Doña Juana, Azufral, Las Ánimas, Chiles y Cerro Negro.
  detalle: 'Galeras, Cumbal, Doña Juana, Azufral, Las Ánimas, Chiles, Cerro Negro',
  fuente: 'SGC — OVSP Pasto (informes mensuales)',
};

/**
 * Coordenadas geográficas (lat, lon) de los 7 volcanes activos vigilados por el
 * OVSP y del sismo de Tumaco 1979. Se usan para ubicar los marcadores del mini
 * mapa del Home. Fuente: SGC — OVSP (coordenadas publicadas de cada edificio
 * volcánico) y catálogo SGC/USGS para el sismo de Tumaco.
 */
/*
 * Alturas (m s. n. m.) tomadas del catálogo del Global Volcanism Program
 * (Smithsonian) — cifras consistentes con las publicadas por el SGC/OVSP.
 * Las Ánimas no tiene altura oficial publicada por el SGC ni el GVP: se deja en
 * null y en la interfaz solo se muestra su nombre (no se inventa).
 * Coordenadas: Global Volcanism Program (edificio volcánico principal).
 */
export const VOLCANES_COORDS = [
  { nombre: 'Galeras', lat: 1.217, lon: -77.367, altura: 4276 },
  { nombre: 'Cumbal', lat: 0.82, lon: -77.96, altura: 4764 },
  { nombre: 'Doña Juana', lat: 1.47, lon: -76.92, altura: 4137 },
  { nombre: 'Azufral', lat: 1.08, lon: -77.68, altura: 4070 },
  { nombre: 'Las Ánimas', lat: 1.24, lon: -77.60, altura: null },
  { nombre: 'Chiles', lat: 0.798, lon: -77.951, altura: 4756 },
  { nombre: 'Cerro Negro', lat: 0.98, lon: -77.88, altura: 4445 },
] as const;

/**
 * Epicentro del terremoto de Tumaco del 12 de diciembre de 1979 (Mw 8.1),
 * mar adentro frente a la frontera Colombia–Ecuador (WNW de Tumaco).
 * Fuente: catálogo USGS/ISC-GEM (1.60°N, 79.36°O), sismo usp00014fc.
 */
export const TUMACO_1979 = {
  nombre: 'Epicentro, 1979',
  lat: 1.60,
  lon: -79.36,
  tooltip: 'Terremoto de Tumaco, 12 de diciembre de 1979, Mw 8.1',
} as const;

/** Pasto (capital de Nariño): punto de referencia del mini mapa. */
export const PASTO_REF = { nombre: 'Pasto', lat: 1.2136, lon: -77.2811 } as const;

/** Monitoreo permanente del SGC (dato de contexto, no numérico calculado). */
export const MONITOREO_SGC = {
  valor: '24/7',
  descripcion: 'Monitoreo del SGC (OVSP)',
  fuente: 'Servicio Geológico Colombiano (OVSP)',
};
