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

/** Número de volcanes activos monitoreados en Nariño. */
export const VOLCANES_ACTIVOS = {
  valor: 4,
  descripcion: 'Volcanes activos en Nariño',
  // Fuente: SGC — Observatorio Vulcanológico y Sismológico de Pasto (OVSP).
  // Galeras, Cumbal, Azufral y Chiles-Cerro Negro.
  detalle: 'Galeras, Cumbal, Azufral, Chiles-Cerro Negro',
  fuente: 'SGC — OVSP Pasto',
};

/** Monitoreo permanente del SGC (dato de contexto, no numérico calculado). */
export const MONITOREO_SGC = {
  valor: '24/7',
  descripcion: 'Monitoreo del SGC (OVSP)',
  fuente: 'Servicio Geológico Colombiano (OVSP)',
};
