/**
 * Generación de reportes PDF de simulación (RF-19).
 *
 * Construye un PDF con jsPDF que incluye parámetros, métricas, los tres
 * sismogramas (N, E, Z) dibujados como líneas y la interpretación
 * educativa. Funciona tanto desde el simulador (resultado completo) como
 * desde "Mis Reportes" (resultado guardado con series submuestreadas).
 * @module reportPdf
 */
import { jsPDF } from 'jspdf';
import type { SimulationParams, WaveData } from './types';
import { interpretSimulation } from './interpretation';
import { LOGO_MARK_DATA_URL } from './logoDataUrl';

/** Métricas persistidas de una simulación en `simulation_reports.results`. */
export interface SavedResults {
  maxAmplitude: number;
  duration: number;
  dominantFrequency: number;
  pArrival: number;
  sArrival: number;
  pArrivalDetected?: boolean;
  sArrivalDetected?: boolean;
  gridInfo?: { nx: number; nz: number; totalSteps: number; dtAdjusted?: boolean; dxAdjusted?: boolean };
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
}

/** Datos de entrada para el reporte. */
export interface ReportInput {
  title: string;
  author?: string;
  notes?: string;
  createdAt?: string | Date;
  params: SimulationParams;
  results: SavedResults;
}

const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLORS = {
  primary: [196, 85, 58] as [number, number, number],
  green: [45, 106, 79] as [number, number, number],
  gold: [212, 168, 83] as [number, number, number],
  text: [26, 26, 46] as [number, number, number],
  muted: [120, 113, 108] as [number, number, number],
  line: [214, 211, 209] as [number, number, number],
};

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

function fmtDate(d?: string | Date): string {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

function drawTrace(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number[],
  values: number[],
  color: [number, number, number],
  label: string,
  pArrival?: number,
  sArrival?: number,
) {
  // Marco
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  // Línea base
  doc.setDrawColor(230, 228, 225);
  doc.line(x, y + h / 2, x + w, y + h / 2);

  const tMax = time[time.length - 1] || 1;
  let vMax = 0;
  for (const v of values) vMax = Math.max(vMax, Math.abs(v));
  if (vMax === 0) vMax = 1;

  const px = (t: number) => x + (t / tMax) * w;
  const py = (v: number) => y + h / 2 - (v / vMax) * (h / 2) * 0.9;

  // Marcadores de arribo
  const marker = (t: number | undefined, c: [number, number, number]) => {
    if (t === undefined || t <= 0 || t > tMax) return;
    doc.setDrawColor(...c);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(px(t), y, px(t), y + h);
    doc.setLineDashPattern([], 0);
  };
  marker(pArrival, COLORS.green);
  marker(sArrival, COLORS.primary);

  // Traza
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  const pts: [number, number][] = [];
  for (let i = 0; i < time.length; i++) pts.push([px(time[i]), py(values[i])]);
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }

  // Etiqueta
  doc.setFontSize(8);
  doc.setTextColor(...color);
  doc.setFont('helvetica', 'bold');
  doc.text(label, x + 1.5, y + 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.text('0 s', x, y + h + 3);
  doc.text(`${tMax.toFixed(0)} s`, x + w, y + h + 3, { align: 'right' });
}

/** Construye el documento PDF (sin descargarlo). */
export function buildReportPdf(input: ReportInput): jsPDF {
  const { title, author, notes, createdAt, params, results } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // ── Encabezado ──
  doc.setFillColor(...COLORS.text);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  // Isotipo de la marca a la derecha, sobre un chip claro para que el pin y el
  // volcán (tinta/terracota) contrasten con la banda oscura.
  try {
    const ls = 15, lx = PAGE_W - MARGIN - ls, ly = 3.5;
    doc.setFillColor(250, 246, 242); // crema
    doc.roundedRect(lx - 1.5, ly - 1.5, ls + 3, ls + 3, 2.5, 2.5, 'F');
    doc.addImage(LOGO_MARK_DATA_URL, 'PNG', lx, ly, ls, ls);
  } catch { /* si el visor no soporta la imagen, el encabezado sigue con texto */ }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SismoNariño, Reporte de Simulación', MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Simulador Triaxial de Pseudo-Sismogramas, Universidad Mariana, Nariño, Colombia', MARGIN, 16);
  y = 30;

  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Generado: ${fmtDate(createdAt)}${author ? `  ·  Autor: ${author}` : ''}`, MARGIN, y);
  y += 8;

  // ── Parámetros ──
  const section = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.green);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 1.5;
    doc.setDrawColor(...COLORS.green);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 5;
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'normal');
  };

  const kv = (rows: [string, string][], cols = 2) => {
    const colW = CONTENT_W / cols;
    doc.setFontSize(8.5);
    rows.forEach((row, i) => {
      const cx = MARGIN + (i % cols) * colW;
      if (i > 0 && i % cols === 0) y += 5;
      doc.setTextColor(...COLORS.muted);
      doc.text(row[0], cx, y);
      doc.setTextColor(...COLORS.text);
      doc.setFont('helvetica', 'bold');
      doc.text(row[1], cx + colW * 0.55, y);
      doc.setFont('helvetica', 'normal');
    });
    y += 8;
  };

  section('Parámetros del subsuelo y de la fuente');
  kv([
    ['Tipo de fuente', params.sourceType === 'volcanic' ? 'Volcánica (isótropa)' : 'Tectónica (doble par)'],
    ['Magnitud', `Mw ${params.magnitude.toFixed(1)}`],
    ['Profundidad focal', `${params.depth} km`],
    ['Epicentro', `${params.epicenterLat.toFixed(4)}, ${params.epicenterLon.toFixed(4)}`],
    ['Vp', `${params.vp} m/s`],
    ['Vs', `${params.vs} m/s`],
    ['Densidad', `${params.density} kg/m³`],
    ['Vp/Vs', (params.vp / params.vs).toFixed(2)],
    ['λ (Lamé)', `${(params.lambda / 1e9).toFixed(2)} GPa`],
    ['μ (Lamé)', `${(params.mu / 1e9).toFixed(2)} GPa`],
    ['Duración', `${params.duration} s`],
    ['dx / dt', `${params.dx} m / ${params.dt} s`],
  ]);

  section('Métricas del resultado');
  const metricRows: [string, string][] = [
    ['Amplitud máxima', `${results.maxAmplitude.toExponential(2)} (u.a.)`],
    ['Frecuencia dominante', `${results.dominantFrequency.toFixed(2)} Hz`],
    ['Arribo onda P', `${results.pArrival.toFixed(2)} s${results.pArrivalDetected === false ? ' (teórico)' : ''}`],
    ['Arribo onda S', `${results.sArrival.toFixed(2)} s${results.sArrivalDetected === false ? ' (teórico)' : ''}`],
    ['Diferencia S − P', `${(results.sArrival - results.pArrival).toFixed(2)} s`],
    ['Duración registrada', `${results.duration.toFixed(0)} s`],
  ];
  if (results.gridInfo) {
    metricRows.push(['Malla FDM', `${results.gridInfo.nx} × ${results.gridInfo.nz}`]);
    metricRows.push(['Pasos temporales', `${results.gridInfo.totalSteps}`]);
  }
  kv(metricRows);

  // ── Sismogramas ──
  if (results.waveData && results.waveData.time.length > 1) {
    const real = results.isRealRecord === true;
    // Con registro real, el reporte muestra la MISMA señal que la pantalla y no
    // las llegadas P/S teóricas del FDM (el registro real no las trae).
    section(real ? 'Sismograma triaxial (registro real)' : 'Sismogramas triaxiales');
    if (real && results.realLabel) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.text(results.realLabel, MARGIN, y);
      y += 5;
    }
    const wd = results.waveData;
    const traceH = 24;
    const gap = 7;
    const traces: [number[], [number, number, number], string][] = [
      [wd.north, COLORS.green, 'Norte (N)'],
      [wd.east, COLORS.primary, 'Este (E)'],
      [wd.vertical, COLORS.gold, 'Vertical (Z)'],
    ];
    for (const [vals, color, label] of traces) {
      if (y + traceH + gap > 285) { doc.addPage(); y = MARGIN; }
      // En registro real se omiten los marcadores P/S (undefined).
      drawTrace(doc, MARGIN, y, CONTENT_W, traceH, wd.time, vals, color, label,
        real ? undefined : results.pArrival,
        real ? undefined : results.sArrival);
      y += traceH + gap;
    }
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(
      real
        ? 'Registro real de la red del SGC/OVSP, señal decimada. Amplitud normalizada por traza.'
        : 'Líneas punteadas: arribo P (verde) y S (terracota). Amplitud normalizada por traza, unidades arbitrarias.',
      MARGIN, y);
    y += 7;
  }

  // ── Interpretación ──
  if (y > 230) { doc.addPage(); y = MARGIN; }
  section('Interpretación educativa');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  const interp = interpretSimulation({
    params,
    dominantFrequency: results.dominantFrequency,
    maxAmplitude: results.maxAmplitude,
    pArrival: results.pArrival,
    sArrival: results.sArrival,
    gridInfo: results.gridInfo,
  }).replace(/⚠️/g, '(!)');
  const lines = doc.splitTextToSize(interp, CONTENT_W) as string[];
  doc.text(lines, MARGIN, y);
  y += lines.length * 4.5 + 4;

  if (notes && notes.trim()) {
    if (y > 250) { doc.addPage(); y = MARGIN; }
    section('Notas del usuario');
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(notes.trim(), CONTENT_W) as string[];
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 4.5 + 4;
  }

  // ── Pie de página en todas las páginas ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text('SismoNariño · Motor FDM 2D · Valeria Guerrero & Luisa Basante · Universidad Mariana (2026)', MARGIN, 292);
    doc.text(`Página ${p} de ${pages}`, PAGE_W - MARGIN, 292, { align: 'right' });
  }

  return doc;
}

/** Genera y descarga el reporte PDF. */
export function downloadReportPdf(input: ReportInput, filename?: string): void {
  const doc = buildReportPdf(input);
  const safe = (filename || input.title).replace(/[^\w-]+/g, '_').slice(0, 60);
  doc.save(`reporte_${safe}.pdf`);
}
