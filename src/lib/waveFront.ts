/**
 * Radio del frente de onda (P o S) en función del tiempo, coherente con el
 * modelo de velocidades activo.
 *
 * Los anillos del mapa 3D deben tocar cada estación justo en su tP (anillo P) y
 * su tS (anillo S). Con el modelo homogéneo eso equivale a `radio = v·t`, pero
 * con IASP91 los tiempos de viaje no son lineales con la distancia (la velocidad
 * crece con la profundidad). Para que el anillo cruce cada estación exactamente
 * en su tiempo de llegada, construimos la curva distancia↔tiempo a partir de los
 * propios tiempos de viaje por estación (que ya vienen del modelo) y la
 * interpolamos de forma monótona.
 *
 * @module lib/waveFront
 */
import type { StationTravelTime } from './api3d';

/** Par (tiempo de llegada, distancia hipocentral) usado como ancla de la curva. */
interface Anchor {
  t: number;
  d: number;
}

/**
 * Devuelve una función `t → distancia hipocentral (km)` del frente de la fase
 * indicada, consistente con el modelo que generó los `travelTimes`.
 *
 * Estrategia:
 *  - Reúne los pares (tiempo de llegada, distancia hipocentral) de las estaciones
 *    con tiempo válido para esa fase, ordenados por tiempo y con duplicados de
 *    tiempo colapsados (curva estrictamente creciente).
 *  - Entre anclas interpola linealmente; antes de la primera ancla usa la
 *    velocidad del primer tramo (recta desde el origen al primer punto); después
 *    de la última, extrapola con la velocidad del último tramo.
 *  - Si no hay suficientes anclas (0 o 1 estación), cae a `v·t` con `fallbackVKmS`.
 *
 * El resultado hace que el anillo pase por cada estación exactamente en su tiempo
 * de llegada, porque esas estaciones son los nodos de interpolación.
 *
 * @param travelTimes Tiempos de viaje por estación (del modelo activo).
 * @param phase 'P' usa tP; 'S' usa tS.
 * @param fallbackVKmS Velocidad (km/s) de respaldo si faltan anclas.
 */
export function makeWaveFrontRadius(
  travelTimes: StationTravelTime[],
  phase: 'P' | 'S',
  fallbackVKmS: number,
): (t: number) => number {
  // 1) Anclas válidas (tiempo > 0 y distancia > 0).
  const raw: Anchor[] = [];
  for (const s of travelTimes) {
    const t = phase === 'P' ? s.tP : s.tS;
    const d = s.distancia_hipocentral_km;
    if (t != null && t > 0 && d > 0) raw.push({ t, d });
  }
  raw.sort((a, b) => a.t - b.t);

  // Colapsar tiempos casi iguales (quedarse con la mayor distancia) para que la
  // curva sea estrictamente creciente en t.
  const anchors: Anchor[] = [];
  for (const a of raw) {
    const last = anchors[anchors.length - 1];
    if (last && Math.abs(a.t - last.t) < 1e-6) {
      if (a.d > last.d) last.d = a.d;
    } else {
      anchors.push({ ...a });
    }
  }

  // 2) Pocas anclas: velocidad constante de respaldo.
  if (anchors.length < 2) {
    const v = anchors.length === 1 ? anchors[0].d / anchors[0].t : fallbackVKmS;
    const vel = v > 0 ? v : fallbackVKmS;
    return (t: number) => (t > 0 ? vel * t : 0);
  }

  // 3) Interpolación monótona por tramos.
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  // Velocidad del primer tramo (origen → primera ancla) y del último tramo.
  const vFirst = first.d / first.t;
  const prev = anchors[anchors.length - 2];
  const vLast = (last.d - prev.d) / (last.t - prev.t);

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t <= first.t) return Math.max(0, vFirst * t);
    if (t >= last.t) return last.d + vLast * (t - last.t);
    // Buscar el tramo [i, i+1] que contiene t.
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      if (t <= b.t) {
        const frac = (t - a.t) / (b.t - a.t);
        return a.d + frac * (b.d - a.d);
      }
    }
    return last.d;
  };
}
