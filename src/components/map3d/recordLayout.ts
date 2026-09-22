/**
 * Lógica pura de disposición de la "sección de registro" (record section).
 *
 * Separada de la UI para poder testearla: ordena las trazas por distancia
 * epicentral y calcula las posiciones (x, y) de las marcas P y S. Sin física.
 *
 * @module map3d/recordLayout
 */
import type { StationTravelTime } from '../../lib/api3d';

/** Una traza colocada en la sección de registro. */
export interface TraceLayout {
  code: string;
  distancia_km: number;
  /** Coordenada X (px) del centro de la traza (por distancia). */
  x: number;
  /** Posición Y (px) de la marca P, o null si no hay tiempo. */
  yP: number | null;
  /** Posición Y (px) de la marca S, o null si no hay tiempo. */
  yS: number | null;
  tP: number | null;
  tS: number | null;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Tiempo máximo (s) que cubre el eje vertical. */
  maxTime: number;
  paddingX?: number;
  paddingTop?: number;
}

/**
 * Ordena las estaciones por distancia epicentral y calcula el layout.
 *
 * Eje X = distancia epicentral (izquierda→derecha, ascendente).
 * Eje Y = tiempo hacia abajo (0 arriba, maxTime abajo).
 *
 * @param stations Tiempos por estación (del backend).
 * @param opts Dimensiones y tiempo máximo.
 * @returns Trazas ordenadas con posiciones de marcas P/S.
 */
export function computeRecordLayout(
  stations: StationTravelTime[],
  opts: LayoutOptions,
): TraceLayout[] {
  const { width, height, maxTime } = opts;
  const padX = opts.paddingX ?? 40;
  const padTop = opts.paddingTop ?? 20;

  const sorted = [...stations].sort(
    (a, b) => a.distancia_epicentral_km - b.distancia_epicentral_km,
  );

  const n = sorted.length;
  const usableW = Math.max(1, width - 2 * padX);
  const usableH = Math.max(1, height - padTop - 20);
  const tScale = maxTime > 0 ? usableH / maxTime : 0;

  return sorted.map((s, i) => {
    const x = n === 1 ? width / 2 : padX + (usableW * i) / (n - 1);
    const yP = s.tP != null ? padTop + s.tP * tScale : null;
    const yS = s.tS != null ? padTop + s.tS * tScale : null;
    return {
      code: s.code,
      distancia_km: s.distancia_epicentral_km,
      x,
      yP,
      yS,
      tP: s.tP,
      tS: s.tS,
    };
  });
}
