/**
 * Alinea un sismograma sintético (generado por el FDM homogéneo) a las llegadas
 * P y S del modelo de velocidades activo.
 *
 * Problema que resuelve: el backend genera cada traza con un medio homogéneo
 * (vp/vs constantes), de modo que la onda P arranca en `tP_fdm = dist/vp` y la S
 * en `tS_fdm = dist/vs`. Pero las marcas de llegada en el mapa y en la sección de
 * registro usan los tiempos del modelo seleccionado (p. ej. IASP91 vía taup), que
 * NO coinciden con `dist/vp`. Resultado: la marca P quedaba desfasada del inicio
 * real de la onda P dentro de la traza.
 *
 * Solución: una deformación lineal por tramos del eje temporal (time warping) que
 * reposiciona las fases sin alterar su forma. Puntos de anclaje:
 *   t=0            → t=0            (origen del sismo)
 *   t=tP_fdm       → t=tP_modelo    (inicio de P)
 *   t=tS_fdm       → t=tS_modelo    (inicio de S)
 *   t>tS_fdm       → se continúa con el ritmo del tramo S (coda)
 *
 * Así, cada muestra de la traza original se recoloca en el eje del modelo y las
 * ondas P y S empiezan EXACTAMENTE en tP/tS del modelo. Para el modelo homogéneo
 * (tP_fdm≈tP_modelo, tS_fdm≈tS_modelo) la transformación es casi la identidad, por
 * lo que no distorsiona ese caso. La amplitud de cada muestra no se toca; solo su
 * instante. Es correcto porque un sismograma es una secuencia de amplitudes en el
 * tiempo: mover coherentemente los instantes de las fases es la forma estándar de
 * "colocar" fases teóricas sobre una forma de onda, preservando su morfología.
 *
 * @module lib/alignSynthetic
 */
import type { SyntheticResult } from './api3d';

/** Mínima separación temporal para evitar divisiones por cero (s). */
const EPS = 1e-6;

/**
 * Mapea un instante del eje FDM (`tFdm`) al eje del modelo, usando los tiempos de
 * fase de origen (`pFrom`,`sFrom`) y destino (`pTo`,`sTo`). Lineal por tramos.
 */
export function warpTime(
  tFdm: number,
  pFrom: number, sFrom: number,
  pTo: number, sTo: number,
): number {
  if (tFdm <= 0) return 0;
  // Tramo 0 → P: escala el pre-P para que P caiga en pTo.
  if (tFdm <= pFrom) {
    const r = pFrom > EPS ? tFdm / pFrom : 1;
    return r * pTo;
  }
  // Tramo P → S: escala el intervalo P-S para que S caiga en sTo.
  if (tFdm <= sFrom) {
    const span = Math.max(EPS, sFrom - pFrom);
    const r = (tFdm - pFrom) / span;
    return pTo + r * (sTo - pTo);
  }
  // Tramo posterior a S (coda): mantiene el ritmo del tramo P-S del destino.
  const spanFrom = Math.max(EPS, sFrom - pFrom);
  const spanTo = Math.max(EPS, sTo - pTo);
  const rate = spanTo / spanFrom;
  return sTo + (tFdm - sFrom) * rate;
}

/**
 * Devuelve una copia del sintético con sus muestras recolocadas para que las
 * fases P y S arranquen en `tPModel`/`tSModel`. Reasigna cada muestra al nuevo
 * instante y vuelve a muestrear sobre el eje temporal original (mismo `t[]`) por
 * interpolación lineal, de modo que el consumidor sigue leyendo `syn.t` como eje.
 *
 * Si no hay tiempos de modelo válidos (null) o la traza está vacía, devuelve el
 * sintético sin cambios.
 *
 * @param syn Sintético crudo del backend (eje FDM homogéneo).
 * @param tPModel Llegada P del modelo activo (s), o null.
 * @param tSModel Llegada S del modelo activo (s), o null.
 */
export function alignSyntheticToModel(
  syn: SyntheticResult,
  tPModel: number | null,
  tSModel: number | null,
): SyntheticResult {
  const n = syn.t.length;
  if (n === 0 || tPModel == null || tSModel == null) return syn;

  const pFrom = syn.tP_detectado;
  const sFrom = syn.tS_detectado;
  // Datos de origen degenerados: no se puede deformar con seguridad.
  if (!(sFrom > pFrom) || !(tSModel > tPModel) || pFrom <= 0) return syn;

  // 1) Nuevos instantes de cada muestra tras la deformación.
  const warped = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    warped[i] = warpTime(syn.t[i], pFrom, sFrom, tPModel, tSModel);
  }

  // 2) Re-muestreo sobre el eje original syn.t por interpolación lineal.
  //    Para cada t objetivo, buscamos entre qué muestras deformadas cae.
  const resample = (src: number[]): number[] => {
    const out = new Array<number>(n).fill(0);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const target = syn.t[i];
      // Antes de la primera muestra deformada: amplitud 0 (reposo pre-señal).
      if (target <= warped[0]) { out[i] = src[0]; continue; }
      // Después de la última: mantener el último valor.
      if (target >= warped[n - 1]) { out[i] = src[n - 1]; continue; }
      while (j < n - 1 && warped[j + 1] < target) j++;
      const t0 = warped[j], t1 = warped[j + 1];
      const span = t1 - t0;
      const frac = span > EPS ? (target - t0) / span : 0;
      out[i] = src[j] + frac * (src[j + 1] - src[j]);
    }
    return out;
  };

  return {
    ...syn,
    north: resample(syn.north),
    east: resample(syn.east),
    vertical: resample(syn.vertical),
    // Las fases ahora caen exactamente en los tiempos del modelo.
    tP_detectado: tPModel,
    tS_detectado: tSModel,
  };
}
