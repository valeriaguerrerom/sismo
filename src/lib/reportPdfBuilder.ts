/**
 * Constructor del PDF de reporte de simulación (RF-19). Módulo PESADO: importa
 * jsPDF y la fuente Unicode incrustada, por eso se carga SOLO de forma dinámica
 * desde `reportPdf.ts` (import() al exportar), y no entra en el bundle inicial.
 *
 * @module reportPdfBuilder
 */
import { jsPDF } from 'jspdf';
import { interpretSimulation } from './interpretation';
import { LOGO_MARK_DATA_URL } from './logoDataUrl';
import { PLEX_REGULAR_B64, PLEX_BOLD_B64 } from './pdfFont';
import type { ReportInput } from './reportPdf';

/** Nombre de la fuente Unicode incrustada (IBM Plex Sans) usada en todo el PDF. */
const FONT = 'PlexSans';

/**
 * Agrupa un entero de a tres cifras con espacio (nunca punto ni coma): en
 * español "6.000" se leería como seis. Usa espacio normal para no depender de
 * glifos especiales en el subset de la fuente.
 */
function groupInt(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Registra la fuente TTF Unicode (IBM Plex Sans, subset) en el documento para
 * que rinda griegas (λ, μ), símbolos (√, ·, ×), tildes y ñ sin caracteres raros.
 */
function registerFont(doc: jsPDF) {
  doc.addFileToVFS('PlexSans-Regular.ttf', PLEX_REGULAR_B64);
  doc.addFont('PlexSans-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('PlexSans-Bold.ttf', PLEX_BOLD_B64);
  doc.addFont('PlexSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');
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
  refMax?: number,
) {
  // Marco
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  // Línea base
  doc.setDrawColor(230, 228, 225);
  doc.line(x, y + h / 2, x + w, y + h / 2);

  const tMax = time[time.length - 1] || 1;
  // refMax = escala común (máximo de las tres componentes). Si no se pasa, se
  // normaliza contra el máximo de esta traza (escala por componente).
  let vMax = refMax && refMax > 0 ? refMax : 0;
  if (vMax === 0) { for (const v of values) vMax = Math.max(vMax, Math.abs(v)); }
  if (vMax === 0) vMax = 1;

  const px = (t: number) => x + (t / tMax) * w;
  const py = (v: number) => y + h / 2 - (v / vMax) * (h / 2) * 0.9;

  // Marcadores de arribo: ambos en GRIS, diferenciados por el patrón de línea
  // (P punteada fina, S guiones largos) y su etiqueta, no por color.
  const marker = (t: number | undefined, dash: number[], letter: string) => {
    if (t === undefined || t <= 0 || t > tMax) return;
    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern(dash, 0);
    doc.line(px(t), y, px(t), y + h);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.muted);
    doc.setFont(FONT, 'bold');
    doc.text(letter, px(t) + 0.6, y + h - 1.5);
    doc.setFont(FONT, 'normal');
  };
  marker(pArrival, [0.6, 0.6], 'P');
  marker(sArrival, [1.6, 0.8], 'S');

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
  doc.setFont(FONT, 'bold');
  doc.text(label, x + 1.5, y + 3.5);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.text('0 s', x, y + h + 3);
  doc.text(`${tMax.toFixed(0)} s`, x + w, y + h + 3, { align: 'right' });
}

/** Construye el documento PDF (sin descargarlo). */
export function buildReportPdf(input: ReportInput): jsPDF {
  const { title, author, notes, createdAt, params, results } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerFont(doc);
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
  doc.setFont(FONT, 'bold');
  doc.setFontSize(15);
  doc.text('SismoNariño, Reporte de Simulación', MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.text('Simulador Triaxial de Pseudo-Sismogramas, Universidad Mariana, Nariño, Colombia', MARGIN, 16);
  y = 30;

  doc.setTextColor(...COLORS.text);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(13);
  doc.text(title, MARGIN, y);
  y += 6;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Generado: ${fmtDate(createdAt)}${author ? `  ·  Autor: ${author}` : ''}`, MARGIN, y);
  y += 8;

  // ── Parámetros ──
  const section = (label: string) => {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.green);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 1.5;
    doc.setDrawColor(...COLORS.green);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 5;
    doc.setTextColor(...COLORS.text);
    doc.setFont(FONT, 'normal');
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
      doc.setFont(FONT, 'bold');
      doc.text(row[1], cx + colW * 0.55, y);
      doc.setFont(FONT, 'normal');
    });
    y += 8;
  };

  // λ y μ: usar los del resultado si vienen; si no (p. ej. la respuesta del
  // backend usa `lambda_`), recalcularlos desde Vp/Vs/ρ para evitar NaN.
  const muVal = Number.isFinite(params.mu) && params.mu > 0
    ? params.mu
    : params.density * params.vs * params.vs;
  const lambdaVal = Number.isFinite(params.lambda) && params.lambda !== 0
    ? params.lambda
    : params.density * params.vp * params.vp - 2 * muVal;
  const lambdaGPa = lambdaVal / 1e9;
  const muGPa = muVal / 1e9;

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
    ['λ (Lamé)', `${(lambdaGPa).toFixed(2)} GPa`],
    ['μ (Lamé)', `${(muGPa).toFixed(2)} GPa`],
    ['Duración', `${results.duration.toFixed(0)} s`],
    ['dx / dt', `${params.dx} m / ${params.dt} s`],
  ]);

  section('Métricas del resultado');
  const metricRows: [string, string][] = [
    ['Amplitud máxima', `${results.maxAmplitude.toExponential(2)} u.a.`],
    ['Frecuencia dominante', `${results.dominantFrequency.toFixed(2)} Hz`],
    ['Arribo onda P', `${results.pArrival.toFixed(2)} s${results.pArrivalDetected === false ? ' (teórico)' : ''}`],
    ['Arribo onda S', `${results.sArrival.toFixed(2)} s${results.sArrivalDetected === false ? ' (teórico)' : ''}`],
    ['Diferencia S − P', `${(results.sArrival - results.pArrival).toFixed(2)} s`],
    ['Duración registrada', `${results.duration.toFixed(0)} s`],
  ];
  if (results.gridInfo) {
    metricRows.push(['Malla FDM', `${results.gridInfo.nx} × ${results.gridInfo.nz}`]);
    // Enteros grandes: agrupados con espacio (no punto ni coma; en español
    // "6.000" se leería como seis). Espacio normal para no depender de glifos.
    metricRows.push(['Pasos temporales', groupInt(results.gridInfo.totalSteps)]);
    if (typeof results.gridInfo.epicentralDistanceKm === 'number') {
      metricRows.push(['Estación virtual', `${results.gridInfo.epicentralDistanceKm.toFixed(1)} km del epicentro, en superficie`]);
    }
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
    // Escala común por defecto: máximo de las tres componentes (así se aprecia
    // que la P domina en la vertical y la S en las horizontales). En 'component'
    // cada traza se normaliza contra su propio pico (refMax = undefined).
    const scaleCommon = results.ampScale !== 'component';
    let commonMax = 0;
    for (const arr of [wd.north, wd.east, wd.vertical]) {
      for (const v of arr) commonMax = Math.max(commonMax, Math.abs(v));
    }
    const refMax = scaleCommon ? commonMax : undefined;
    // Colores de componente (global): Norte terracota, Este verde bosque,
    // Vertical ocre.
    const traces: [number[], [number, number, number], string][] = [
      [wd.north, COLORS.primary, 'Norte (N)'],
      [wd.east, COLORS.green, 'Este (E)'],
      [wd.vertical, COLORS.gold, 'Vertical (Z)'],
    ];
    for (const [vals, color, label] of traces) {
      if (y + traceH + gap > 285) { doc.addPage(); y = MARGIN; }
      // En registro real se omiten los marcadores P/S (undefined).
      drawTrace(doc, MARGIN, y, CONTENT_W, traceH, wd.time, vals, color, label,
        real ? undefined : results.pArrival,
        real ? undefined : results.sArrival,
        refMax);
      y += traceH + gap;
    }
    const scaleNote = scaleCommon
      ? 'Escala común: las tres trazas normalizadas contra el máximo de las tres (±1).'
      : 'Escala por componente: cada traza normalizada contra su propio máximo (±1).';
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(
      real
        ? `Registro real de la red del SGC/OVSP, señal decimada. ${scaleNote}`
        : `Líneas grises: arribo P (punteada) y S (guiones). ${scaleNote} Señal no calibrada.`,
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
    doc.text('SismoNariño, motor FDM. Valeria Guerrero y Luisa Basante, Universidad Mariana, 2026.', MARGIN, 292);
    doc.text(`Página ${p} de ${pages}`, PAGE_W - MARGIN, 292, { align: 'right' });
  }

  return doc;
}
