/**
 * Utilidades de formato compartidas por el Simulador y sus exportaciones.
 *
 * Centraliza dos cosas que deben verse igual en pantalla, en el PDF y en las
 * leyendas de las gráficas:
 *  - La distancia epicentral del receptor (estación virtual), derivada de la
 *    malla FDM, para no repetir el cálculo en cada componente.
 *  - El formato de enteros grandes: con separador de miles de PUNTO, "6.000"
 *    se lee como "seis" en español. Aquí agrupamos con ESPACIO FINO (U+202F),
 *    nunca con punto ni coma (p. ej. "6 000 pasos").
 *
 * @module lib/format
 */
import { GridInfo } from './types';

/**
 * Distancia epicentral horizontal del receptor al epicentro, en kilómetros.
 *
 * Es la separación en superficie entre la fuente y la estación virtual,
 * calculada desde la malla: |receiverX − sourceX| · dx. No incluye la
 * profundidad focal (esa sería la distancia hipocentral).
 *
 * @param gridInfo Información de la malla FDM de la simulación.
 * @returns Distancia epicentral en km.
 */
export function epicentralDistanceKm(gridInfo: GridInfo): number {
  return (Math.abs(gridInfo.receiverX - gridInfo.sourceX) * gridInfo.dx) / 1000;
}

/**
 * Distancia epicentral formateada para mostrar (1 decimal, con "km").
 *
 * @param gridInfo Información de la malla FDM.
 * @returns Cadena como "2.5 km".
 */
export function epicentralDistanceLabel(gridInfo: GridInfo): string {
  return `${epicentralDistanceKm(gridInfo).toFixed(1)} km`;
}

/** Texto completo de la estación virtual para leyendas y parámetros. */
export function stationLabel(gridInfo: GridInfo): string {
  return `Estación virtual a ${epicentralDistanceLabel(gridInfo)} del epicentro, en superficie`;
}

/**
 * Formatea un entero grande agrupando de a tres cifras con ESPACIO FINO
 * (U+202F), nunca con punto ni coma. Así "6000" → "6 000" (no "6.000", que en
 * español se leería como seis).
 *
 * @param n Número entero (se redondea).
 * @returns Cadena agrupada con espacio fino.
 */
export function formatBigInt(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(Math.round(n)).toString();
  // Agrupa de a 3 desde la derecha con espacio fino U+202F.
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return sign + grouped;
}
