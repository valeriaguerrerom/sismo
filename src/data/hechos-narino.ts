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
 * Coordenadas (lat, lon) y altura (m s. n. m.) de cada volcán, tomadas de la
 * página de "Generalidades" del volcán en el Servicio Geológico Colombiano
 * (SGC). Donde el SGC publica las coordenadas en grados/minutos, se convierten
 * a decimales. Cuando el SGC no publica el par exacto en decimales, se usa el
 * valor del Global Volcanism Program (Smithsonian), que el propio SGC referencia
 * para el edificio volcánico; se indica en el comentario de cada uno.
 */
export const VOLCANES_COORDS = [
  // SGC: 1°13'43,8"N, 77°21'33,0"W; 4276 m.
  // https://www2.sgc.gov.co/sgc/volcanes/VolcanGaleras/Paginas/generalidades-volcan-galeras.aspx
  { nombre: 'Galeras', lat: 1.2288, lon: -77.3592, altura: 4276 },
  // SGC (Complejo Volcánico Cumbal): ~0°57'N, 77°52'W; 4764 m.
  // https://www2.sgc.gov.co/sgc/volcanes/VolcanCumbal/Paginas/generalidades-volcan-cumbal.aspx
  { nombre: 'Cumbal', lat: 0.95, lon: -77.87, altura: 4764 },
  // SGC (Complejo Volcánico Doña Juana–Cascabel): ~1.50°N, 76.94°W; 4150 m.
  // https://www2.sgc.gov.co/sgc/volcanes/VolcanDonaJuana/Paginas/generalidades-volcan-dona-juana.aspx
  { nombre: 'Doña Juana', lat: 1.50, lon: -76.94, altura: 4150 },
  // SGC: 1°05'N, 77°43'W; 4070 m.
  // https://www2.sgc.gov.co/sgc/volcanes/VolcanAzufral/Paginas/generalidades-volcan-azufral.aspx
  { nombre: 'Azufral', lat: 1.083, lon: -77.717, altura: 4070 },
  // SGC (Volcán Ánimas): extremo NE de Nariño, límite con Cauca, ~11 km al NE de
  // Doña Juana; ~1.564°N, 76.854°W; 4200 m.
  // https://www2.sgc.gov.co/sgc/volcanes/VolcanAnimas/Paginas/generalidades.aspx
  { nombre: 'Las Ánimas', lat: 1.564, lon: -76.854, altura: 4200 },
  // SGC (Complejo Volcánico Chiles–Cerro Negro), frontera con Ecuador: ~0.817°N,
  // 77.938°W; 4698 m.
  // https://www2.sgc.gov.co/sgc/volcanes/VolcanChilesCerroNegro/Paginas/generalidades-volcan-chiles-cerro-negro.aspx
  { nombre: 'Chiles', lat: 0.817, lon: -77.938, altura: 4698 },
  // SGC/GVP (Cerro Negro de Mayasquer), 3 km al NO de Chiles, frontera con
  // Ecuador: ~0.828°N, 77.964°W; 4470 m.
  // https://www2.sgc.gov.co/sgc/volcanes/VolcanChilesCerroNegro/Paginas/generalidades-volcan-chiles-cerro-negro.aspx
  { nombre: 'Cerro Negro', lat: 0.828, lon: -77.964, altura: 4470 },
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
