/**
 * Reporte PDF de simulación (RF-19) — API ligera.
 *
 * Este módulo se importa de forma estática desde varias pantallas, así que se
 * mantiene LIGERO: solo tipos, `downsampleWave` y un `downloadReportPdf` que
 * carga el constructor pesado (jsPDF + fuente Unicode) por import dinámico solo
 * al momento de exportar. Así jsPDF y la fuente no entran en el bundle inicial.
 *
 * @module reportPdf
 */
import type { SimulationParams, WaveData } from './types';

/** Métricas persistidas de una simulación en `simulation_reports.results`. */
export interface SavedResults {
  maxAmplitude: number;
  duration: number;
  dominantFrequency: number;
  pArrival: number;
  sArrival: number;
  pArrivalDetected?: boolean;
  sArrivalDetected?: boolean;
  gridInfo?: { nx: number; nz: number; totalSteps: number; dtAdjusted?: boolean; dxAdjusted?: boolean; epicentralDistanceKm?: number; firstBounceS?: number };
  /** Series submuestreadas (≤ 600 puntos) para reconstruir las gráficas. */
  waveData?: WaveData;
  /**
   * true cuando `waveData` es un REGISTRO REAL (SGC/OVSP) cargado desde el
   * Explorador, no el pseudo-sismograma simulado. En ese caso el PDF dibuja la
   * señal real (mismos ejes que la pantalla) y no las llegadas P/S teóricas.
   */
  isRealRecord?: boolean;
  /** Etiqueta del registro real (p. ej. "CM 2025-04-25 M6.3 — Est. BBAC"). */
  realLabel?: string;
  /**
   * Escala de amplitud usada en los sismogramas: 'common' (las tres trazas
   * contra el máximo de las tres) o 'component' (cada una contra su pico). El
   * PDF la replica y la indica en la leyenda. Por defecto 'common'.
   */
  ampScale?: 'common' | 'component';
  /**
   * Datos del corte del subsuelo para incluir tres fotogramas en el PDF
   * (llegada de la P, llegada de la S y un momento después). Opcional: solo se
   * pasa cuando el usuario marca esa sección y hay fotogramas disponibles.
   */
  crossSection?: CrossSectionData;
  /**
   * Imagen del "Movimiento de partícula" (hodograma 3D) para el PDF. Opcional:
   * solo se pasa cuando el usuario marca esa sección y hay señal disponible.
   */
  particleMotion?: ParticleMotionData;
}

/** Imagen PNG (data URL) del hodograma 3D + su pie de figura. */
export interface ParticleMotionData {
  dataUrl: string;
  caption: string;
}

/** Imágenes PNG (data URL) de los tres fotogramas del corte, con su tiempo. */
export interface CrossSectionData {
  frames: { time: number; label: string; dataUrl: string }[];
  /** Componente mostrada (magnitud, radial o vertical). */
  component: string;
  /** Nota al pie del corte (misma que en pantalla, con la nota de escala global). */
  caption: string;
}

/** Qué secciones incluir en el PDF (todas por defecto). */
export interface PdfSections {
  params: boolean;
  metrics: boolean;
  seismograms: boolean;
  crossSection: boolean;
  particleMotion: boolean;
  interpretation: boolean;
}

/** Datos de entrada para el reporte. */
export interface ReportInput {
  title: string;
  author?: string;
  notes?: string;
  createdAt?: string | Date;
  params: SimulationParams;
  results: SavedResults;
  /** Secciones a incluir. Si se omite, se incluyen todas. */
  sections?: PdfSections;
}

/**
 * Reduce una serie a como máximo `maxPoints` muestras conservando el
 * valor de mayor magnitud de cada bloque (evita perder picos).
 */
export function downsampleWave(wave: WaveData, maxPoints = 600): WaveData {
  const n = wave.time.length;
  if (n <= maxPoints) return wave;
  const block = Math.ceil(n / maxPoints);
  const out: WaveData = { time: [], north: [], east: [], vertical: [] };
  for (let i = 0; i < n; i += block) {
    const end = Math.min(n, i + block);
    let bestIdx = i;
    let best = -1;
    for (let j = i; j < end; j++) {
      const mag = Math.abs(wave.north[j]) + Math.abs(wave.east[j]) + Math.abs(wave.vertical[j]);
      if (mag > best) { best = mag; bestIdx = j; }
    }
    out.time.push(wave.time[bestIdx]);
    out.north.push(wave.north[bestIdx]);
    out.east.push(wave.east[bestIdx]);
    out.vertical.push(wave.vertical[bestIdx]);
  }
  return out;
}

/**
 * Genera y descarga el reporte PDF. Carga el constructor pesado (jsPDF + la
 * fuente Unicode incrustada) por import dinámico, de modo que ese código solo
 * se descargue cuando el usuario realmente exporta un PDF.
 */
export async function downloadReportPdf(input: ReportInput, filename?: string): Promise<void> {
  const { buildReportPdf } = await import('./reportPdfBuilder');
  const doc = buildReportPdf(input);
  const safe = (filename || input.title).replace(/[^\w-]+/g, '_').slice(0, 60);
  doc.save(`reporte_${safe}.pdf`);
}
