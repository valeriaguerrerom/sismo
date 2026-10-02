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

/**
 * Pico absoluto común de las tres componentes (N, E, Z). Es la referencia de la
 * "escala común": al normalizar las tres trazas contra este valor se aprecia que
 * la P se registra más en la vertical y la S más en las horizontales, cosa que
 * la normalización por componente oculta.
 *
 * @param wave Series triaxiales.
 * @returns Máximo de |N|, |E|, |Z| (≥ 1e-10 para no dividir por cero).
 */
export function commonMaxAmplitude(wave: { north: number[]; east: number[]; vertical: number[] }): number {
  let m = 1e-10;
  for (const arr of [wave.north, wave.east, wave.vertical]) {
    for (const v of arr) {
      const a = Math.abs(v);
      if (a > m) m = a;
    }
  }
  return m;
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

/**
 * Genera marcas de tiempo en valores REDONDOS para el eje de un sismograma.
 *
 * En vez de dividir el rango en fracciones arbitrarias (que dan 0, 2, 4, 6, 9,
 * 11, 13…), elige un paso "bonito" (1, 2, 5, 10, 20…) para que las marcas caigan
 * en enteros parejos (0, 2, 4, 6, 8, 10, 12…) con aproximadamente `target`
 * divisiones.
 *
 * @param min Tiempo inicial (s).
 * @param max Tiempo final (s).
 * @param target Número aproximado de intervalos deseado (por defecto 6).
 * @returns Lista de tiempos (s) en valores redondos dentro de [min, max].
 */
export function niceTimeTicks(min: number, max: number, target = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const rawStep = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / pow; // 1..10
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = niceNorm * pow;
  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let t = first; t <= max + step * 1e-6; t += step) {
    // Redondeo para evitar residuos de coma flotante (p. ej. 5.999999).
    ticks.push(Math.round(t / step) * step);
  }
  return ticks;
}
