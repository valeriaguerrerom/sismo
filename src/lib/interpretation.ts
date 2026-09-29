/**
 * Interpretación educativa automática de una simulación (RF-12).
 *
 * Se comparte entre el panel de resultados y el generador de reportes PDF
 * para que ambos muestren exactamente el mismo texto.
 * @module interpretation
 */
import type { SimulationParams } from './types';

/** Métricas mínimas necesarias para redactar la interpretación. */
export interface InterpretationInput {
  params: SimulationParams;
  dominantFrequency: number;
  maxAmplitude?: number;
  pArrival?: number;
  sArrival?: number;
  gridInfo?: {
    nx: number;
    nz: number;
    totalSteps: number;
    dtAdjusted?: boolean;
    dxAdjusted?: boolean;
    receiverX?: number;
    sourceX?: number;
    dx?: number;
    epicentralDistanceKm?: number;
  };
}

/** Distancia epicentral (km) desde gridInfo, si hay datos suficientes. */
function epicentralKm(gridInfo: InterpretationInput['gridInfo']): number | null {
  if (!gridInfo) return null;
  if (typeof gridInfo.epicentralDistanceKm === 'number') return gridInfo.epicentralDistanceKm;
  if (typeof gridInfo.receiverX === 'number' && typeof gridInfo.sourceX === 'number' && typeof gridInfo.dx === 'number') {
    return (Math.abs(gridInfo.receiverX - gridInfo.sourceX) * gridInfo.dx) / 1000;
  }
  return null;
}

/** Clasifica la profundidad focal según la convención sismológica. */
export function depthClass(depthKm: number): 'superficial' | 'intermedia' | 'profunda' {
  return depthKm < 30 ? 'superficial' : depthKm < 70 ? 'intermedia' : 'profunda';
}

/** Genera el texto interpretativo de una simulación. */
export function interpretSimulation(input: InterpretationInput): string {
  const { params, dominantFrequency, gridInfo, pArrival, sArrival } = input;
  const typeLabel = params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica';
  const depthDesc = depthClass(params.depth);
  const grid = gridInfo
    ? `Simulación FDM (${gridInfo.nx}×${gridInfo.nz} puntos, ${gridInfo.totalSteps} pasos)`
    : 'Simulación FDM';

  let text = `${grid} de un evento de fuente ${typeLabel} Mw ${params.magnitude.toFixed(1)} a ${params.depth} km de profundidad (${depthDesc}). `;
  text += `El medio se modeló con Vp = ${params.vp} m/s, Vs = ${params.vs} m/s y densidad ${params.density} kg/m³ (Vp/Vs = ${(params.vp / params.vs).toFixed(2)}). `;
  text += `La frecuencia dominante del registro es ${dominantFrequency.toFixed(1)} Hz. `;

  const distKm = epicentralKm(gridInfo);
  if (distKm !== null) {
    text += `El registro se tomó en una estación virtual a ${distKm.toFixed(1)} km del epicentro, en superficie. `;
  }

  if (pArrival !== undefined && sArrival !== undefined) {
    text += `La onda P llega a los ${pArrival.toFixed(2)} s y la onda S a los ${sArrival.toFixed(2)} s, con una diferencia S−P de ${(sArrival - pArrival).toFixed(2)} s, proporcional a la distancia hipocentral. `;
  }

  text += params.sourceType === 'volcanic'
    ? 'El mecanismo isótropo (explosivo) irradia de forma uniforme y casi sin ondas de cizalla, por lo que la componente transversal es prácticamente nula: la energía se reparte entre la radial y la vertical, típico de sismicidad volcánica somera.'
    : 'El registro triaxial se arma con dos simulaciones 2D en el plano del corte: P-SV (radial y vertical) y SH (transversal), excitadas por el tensor de momento del doble par; luego la radial y la transversal se rotan a Norte y Este según el acimut de la estación, así las tres componentes son independientes.';

  if (gridInfo?.dtAdjusted) text += ' ⚠️ dt fue ajustado automáticamente por condición CFL.';
  if (gridInfo?.dxAdjusted) text += ' ⚠️ dx fue aumentado para acomodar la profundidad focal solicitada.';
  return text;
}
