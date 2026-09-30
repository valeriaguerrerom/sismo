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
  /**
   * true cuando lo que se muestra es un REGISTRO REAL (SGC/OVSP) cargado desde
   * el Explorador, no un pseudo-sismograma simulado. En ese caso la
   * interpretación NO presenta los arribos P/S ni las velocidades como medidos
   * en la señal (vienen del modelo de apoyo del mapa de calor): describe el
   * registro real y aclara que la propagación es de un modelo equivalente.
   */
  isRealRecord?: boolean;
  /** Etiqueta del registro real (p. ej. "Galeras 2006-12-24"). */
  realLabel?: string;
  /** Duración real del registro (s), para el texto del registro real. */
  realDuration?: number;
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

/** Frecuencia por defecto de la fuente según el tipo (Hz). */
function defaultSourceFreq(sourceType: SimulationParams['sourceType']): number {
  return sourceType === 'volcanic' ? 2.0 : 3.5;
}

/**
 * Detecta si la frecuencia de la fuente se BAJÓ automáticamente por dispersión
 * (solo en el modelo de dos capas, cuando el usuario no fijó `sourceFreq`). El
 * motor la reduce para que la capa lenta tenga ≥10 nodos/λ. Devuelve la nota
 * educativa o null si no aplica. Se usa igual en métricas, PDF e interpretación.
 */
export function sourceFreqAdjustedNote(
  params: SimulationParams,
  dominantFrequency: number,
): string | null {
  if (params.subsurfaceModel !== 'twoLayer') return null;
  // Si el usuario fijó una frecuencia manual (>0), no fue un autoajuste.
  if (typeof params.sourceFreq === 'number' && params.sourceFreq > 0) return null;
  const def = defaultSourceFreq(params.sourceType);
  // Se considera ajustada si quedó por debajo del valor por tipo (con margen).
  if (dominantFrequency >= def - 0.05) return null;
  return `La frecuencia de la fuente se ajustó a ${dominantFrequency.toFixed(1)} Hz para representar bien la capa blanda sin dispersión numérica.`;
}

/**
 * Interpretación para un REGISTRO REAL (SGC/OVSP). No presenta los arribos P/S
 * ni las velocidades como medidos en la señal: describe el registro tal cual
 * (red, estación, duración) y aclara que la propagación del mapa de calor es de
 * un modelo FDM equivalente, no del registro.
 */
function interpretRealRecord(input: InterpretationInput): string {
  const { params, realLabel, realDuration, gridInfo } = input;
  const red = (realLabel ?? '').startsWith('CM')
    ? 'la Red Sismológica Nacional de Colombia (SGC)'
    : 'el Observatorio Vulcanológico y Sismológico de Pasto (SGC-OVSP)';
  const deRed = red.startsWith('el ') ? 'del ' + red.slice(3) : 'de ' + red;

  // gridInfo no se usa en registros reales (no hay simulación de apoyo).
  void gridInfo;

  let text = `Registro sísmico REAL${realLabel ? ` (${realLabel})` : ''} ${deRed}. `;
  if (typeof realDuration === 'number' && realDuration > 0) {
    text += `Es una señal medida por un sismómetro triaxial (componentes Norte, Este y Vertical), de ${realDuration.toFixed(0)} s de duración, decimada para su visualización. `;
  } else {
    text += 'Es una señal medida por un sismómetro triaxial (componentes Norte, Este y Vertical), decimada para su visualización. ';
  }
  text += 'Las trazas muestran el movimiento real del suelo en la estación. ';
  text += 'Para explorar cómo se propaga la energía en el subsuelo (mapa de calor y movimiento de partícula) usa el laboratorio de simulación, donde puedes ajustar el modelo. ';
  text += params.sourceType === 'volcanic'
    ? 'En eventos volcánicos del Galeras (fuente esencialmente isótropa) domina la onda P y la componente transversal es débil, algo típico de la sismicidad volcánica somera.'
    : 'En eventos tectónicos la onda S suele ser fuerte en las componentes horizontales, con una diferencia S−P que crece con la distancia al foco.';
  return text;
}

/** Genera el texto interpretativo de una simulación. */
export function interpretSimulation(input: InterpretationInput): string {
  // Un registro real tiene su propia interpretación (no describe una simulación).
  if (input.isRealRecord) return interpretRealRecord(input);

  const { params, dominantFrequency, gridInfo, pArrival, sArrival } = input;
  const typeLabel = params.sourceType === 'volcanic' ? 'volcánica' : 'tectónica';
  const depthDesc = depthClass(params.depth);
  const grid = gridInfo
    ? `Simulación FDM (${gridInfo.nx}×${gridInfo.nz} puntos, ${gridInfo.totalSteps} pasos)`
    : 'Simulación FDM';

  let text = `${grid} de un evento de fuente ${typeLabel} Mw ${params.magnitude.toFixed(1)} a ${params.depth} km de profundidad (${depthDesc}). `;
  text += `El medio se modeló con Vp = ${params.vp} m/s, Vs = ${params.vs} m/s y densidad ${params.density} kg/m³ (Vp/Vs = ${(params.vp / params.vs).toFixed(2)}). `;
  text += `La frecuencia dominante del registro es ${dominantFrequency.toFixed(1)} Hz. `;
  const freqNote = sourceFreqAdjustedNote(params, dominantFrequency);
  if (freqNote) text += freqNote + ' ';

  const distKm = epicentralKm(gridInfo);
  if (distKm !== null) {
    text += `El registro se tomó en una estación virtual a ${distKm.toFixed(1)} km del epicentro, en superficie. `;
  }

  if (pArrival !== undefined && sArrival !== undefined) {
    text += `La onda P llega a los ${pArrival.toFixed(2)} s y la onda S a los ${sArrival.toFixed(2)} s, con una diferencia S−P de ${(sArrival - pArrival).toFixed(2)} s, proporcional a la distancia hipocentral. `;
  }

  text += params.sourceType === 'volcanic'
    ? 'El mecanismo isótropo (explosivo) irradia de forma uniforme y casi sin ondas de cizalla, por lo que la componente transversal es prácticamente nula: la energía se reparte entre la radial y la vertical, típico de sismicidad volcánica somera.'
    : 'El registro triaxial combina el movimiento en el plano del corte, P-SV (radial y vertical), y el movimiento fuera del plano, SH (transversal), excitados por el tensor de momento del doble par; luego la radial y la transversal se rotan a Norte y Este según el acimut de la estación, así las tres componentes son independientes.';

  // Nota del modelo de dos capas: lo observable depende de dónde está la fuente
  // respecto a la interfaz. Solo con la fuente DENTRO de la capa hay una
  // reflexión que vuelve a la estación; con la fuente en la roca lo que domina
  // es la amplificación de la S y una sacudida más prolongada en superficie.
  if (params.subsurfaceModel === 'twoLayer') {
    const layerH = params.layerThickness ?? 0.5;
    text += ' ' + (params.depth < layerH
      ? `Hay una capa superficial blanda de ${layerH} km sobre un semiespacio de roca: como la fuente está dentro de la capa, parte de la energía se refleja en la interfaz y regresa a la estación, y el suelo blando amplifica y prolonga la sacudida.`
      : `Hay una capa superficial blanda de ${layerH} km sobre un semiespacio de roca, con la fuente en la roca por debajo: la capa blanda amplifica la onda S y prolonga la sacudida en superficie (reverberación en la capa). No llega una reflexión aislada de la interfaz a la estación en esta geometría.`);
  }

  return text;
}
