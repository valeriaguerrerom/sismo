/**
 * Rangos y validación física de los parámetros del Simulador.
 *
 * Es la fuente de verdad en el frontend, espejo de `PARAM_RANGES` y del
 * validador de `SimulationParams` en `backend/core/fdm.py`. Cualquier cambio de
 * rango debe hacerse en ambos lados. El backend valida SIEMPRE lo mismo: la
 * validación del navegador es solo para dar retroalimentación inmediata.
 *
 * @module lib/paramLimits
 */
import { SimulationParams } from './types';

/** Rango [min, max] permitido por parámetro. */
export const PARAM_RANGES: Record<string, [number, number]> = {
  vp: [1500, 8000],
  vs: [500, 4500],
  density: [1500, 3500],
  magnitude: [2.0, 9.0],
  depth: [1, 100],
  duration: [5, 120],
  dx: [10, 200],
  strike: [0, 360],
  dip: [0, 90],
  rake: [-180, 180],
  stationAzimuth: [0, 360],
  // Nariño y su entorno inmediato (incluye la red CM Colombia-Ecuador).
  epicenterLat: [-1.0, 3.0],
  epicenterLon: [-79.5, -75.5],
};

/** Factor de seguridad de Vs respecto a Vp/√2 (para que λ > 0 con margen). */
export const VS_VP_SAFETY = 0.98;

/** Vs máxima físicamente válida para una Vp dada (λ ≥ 0). */
export function maxVsForVp(vp: number): number {
  return (vp / Math.SQRT2) * VS_VP_SAFETY;
}

/** Resultado de un ajuste: valor corregido y, si hubo cambio, el porqué. */
export interface Adjustment {
  value: number;
  message?: string;
}

/** Ajusta un valor al rango [min, max] del parámetro, con mensaje si cambió. */
export function clampToRange(key: string, value: number): Adjustment {
  const range = PARAM_RANGES[key];
  if (!range || Number.isNaN(value)) return { value };
  const [min, max] = range;
  if (value < min) return { value: min, message: `Ajustado al mínimo (${min}).` };
  if (value > max) return { value: max, message: `Ajustado al máximo (${max}).` };
  return { value };
}

/**
 * Aplica todas las restricciones físicas a un conjunto de parámetros y devuelve
 * los parámetros corregidos más los mensajes por campo que explican cada ajuste.
 *
 * Restricciones:
 *  - Cada parámetro dentro de su rango [min, max].
 *  - Vs < Vp/√2 (para que λ = ρ(Vp² − 2Vs²) no sea negativo).
 *  - dx que dé al menos 10 nodos por longitud de onda mínima (Vs / f_max), con
 *    f_max ≈ 2.5·f0 (f0 = 2 Hz volcánica, 3.5 Hz tectónica).
 *
 * @param p Parámetros propuestos.
 * @returns { params, messages } con los valores corregidos y avisos por campo.
 */
export function validateParams(p: SimulationParams): { params: SimulationParams; messages: Record<string, string> } {
  const out = { ...p };
  const messages: Record<string, string> = {};

  // 1. Rangos por campo.
  (Object.keys(PARAM_RANGES) as (keyof SimulationParams)[]).forEach(k => {
    const v = out[k];
    if (typeof v === 'number') {
      const adj = clampToRange(k as string, v);
      if (adj.message) messages[k as string] = adj.message;
      (out[k] as number) = adj.value;
    }
  });

  // 2. Vs < Vp/√2 (λ > 0).
  const vsMax = maxVsForVp(out.vp);
  if (out.vs > vsMax) {
    out.vs = Math.round(vsMax);
    messages.vs = `Vs ajustada a ${out.vs} m/s para que λ no sea negativo (Vs < Vp/√2).`;
  }

  // 3. dx ≤ el que da 10 nodos/λ mínima para la frecuencia de la fuente.
  const f0 = out.sourceType === 'volcanic' ? 2.0 : 3.5;
  const fMax = 2.5 * f0;
  const lambdaMin = out.vs / fMax;
  const dxMax = lambdaMin / 10;
  if (out.dx > dxMax) {
    const dxLo = PARAM_RANGES.dx[0];
    out.dx = Math.max(dxLo, Math.floor(dxMax));
    messages.dx = `dx ajustado a ${out.dx} m para tener al menos 10 nodos por longitud de onda (evita dispersión numérica).`;
  }

  return { params: out, messages };
}
