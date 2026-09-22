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
  };
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
    ? `Simulación FDM 2D (${gridInfo.nx}×${gridInfo.nz} puntos, ${gridInfo.totalSteps} pasos)`
    : 'Simulación FDM 2D';

  let text = `${grid} de un evento de fuente ${typeLabel} Mw ${params.magnitude.toFixed(1)} a ${params.depth} km de profundidad (${depthDesc}). `;
  text += `El medio se modeló con Vp = ${params.vp} m/s, Vs = ${params.vs} m/s y densidad ${params.density} kg/m³ (Vp/Vs = ${(params.vp / params.vs).toFixed(2)}). `;
  text += `La frecuencia dominante del registro es ${dominantFrequency.toFixed(1)} Hz. `;

  if (pArrival !== undefined && sArrival !== undefined) {
    text += `La onda P llega a los ${pArrival.toFixed(2)} s y la onda S a los ${sArrival.toFixed(2)} s, con una diferencia S−P de ${(sArrival - pArrival).toFixed(2)} s, proporcional a la distancia hipocentral. `;
  }

  text += params.sourceType === 'volcanic'
    ? 'El mecanismo isótropo (explosivo) produce una radiación más uniforme, típica de sismicidad volcánica somera. '
    : 'El mecanismo de doble par produce lóbulos de radiación diferenciados entre componentes, típico de fracturas tectónicas. ';

  text += 'La visualización muestra la propagación del campo de ondas 2D con frentes P (rápidos) y S (lentos) expandiéndose desde el hipocentro.';

  if (gridInfo?.dtAdjusted) text += ' ⚠️ dt fue ajustado automáticamente por condición CFL.';
  if (gridInfo?.dxAdjusted) text += ' ⚠️ dx fue aumentado para acomodar la profundidad focal solicitada.';
  return text;
}
