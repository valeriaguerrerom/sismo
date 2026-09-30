/**
 * Constructor del PDF de reporte de simulación (RF-19). Módulo PESADO: importa
 * jsPDF y la fuente Unicode incrustada, por eso se carga SOLO de forma dinámica
 * desde `reportPdf.ts` (import() al exportar), y no entra en el bundle inicial.
 *
 * @module reportPdfBuilder
 */
import { jsPDF } from 'jspdf';
import { interpretSimulation, sourceFreqAdjustedNote } from './interpretation';
import { computeEventWindow } from './waveWindow';
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

/** Interpola dos colores hex (#rrggbb) y devuelve [r,g,b] 0-255. */
function mixHex(a: string, b: string, t: number): [number, number, number] {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return [
    Math.round(pa[0] + (pb[0] - pa[0]) * t),
    Math.round(pa[1] + (pb[1] - pa[1]) * t),
    Math.round(pa[2] + (pb[2] - pa[2]) * t),
  ];
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

/**
 * Primer rebote de borde = el MENOR entre el de la P y el de la S (con roca
 * rápida la P rebota antes). Tiempo tras el cual pueden aparecer reflexiones
 * artificiales de los límites de la malla. null si no hay datos.
 */
function earliestBounce(gridInfo?: { firstBounceP?: number; firstBounceS?: number }): number | null {
  if (!gridInfo) return null;
  const bs = [gridInfo.firstBounceP, gridInfo.firstBounceS].filter(
    (b): b is number => typeof b === 'number' && b > 0,
  );
  return bs.length ? Math.min(...bs) : null;
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
  reflectionsAfter?: number,
  winStart?: number,
  winEnd?: number,
) {
  // Marco
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  // Línea base
  doc.setDrawColor(230, 228, 225);
  doc.line(x, y + h / 2, x + w, y + h / 2);

  // Ventana temporal visible (B1): recorte al evento si se pasa.
  const tMin = winStart !== undefined ? Math.max(time[0] ?? 0, winStart) : (time[0] ?? 0);
  const tMax = winEnd !== undefined ? Math.min(time[time.length - 1] || 1, winEnd) : (time[time.length - 1] || 1);
  const tSpan = tMax - tMin || 1;
  // refMax = escala común (máximo de las tres componentes). Si no se pasa, se
  // normaliza contra el máximo de esta traza (escala por componente).
  let vMax = refMax && refMax > 0 ? refMax : 0;
  if (vMax === 0) { for (const v of values) vMax = Math.max(vMax, Math.abs(v)); }
  if (vMax === 0) vMax = 1;

  const px = (t: number) => x + ((t - tMin) / tSpan) * w;
  const py = (v: number) => y + h / 2 - (v / vMax) * (h / 2) * 0.9;

  // Líneas verticales de arribo: ambas en GRIS, diferenciadas por el patrón de
  // línea (P punteada fina, S guiones largos). Las LETRAS se dibujan al final,
  // arriba y sobre un chip blanco, para que la curva no las tape (B1).
  const markerLine = (t: number | undefined, dash: number[]) => {
    if (t === undefined || t < tMin || t > tMax) return;
    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern(dash, 0);
    doc.line(px(t), y, px(t), y + h);
    doc.setLineDashPattern([], 0);
  };
  markerLine(pArrival, [0.6, 0.6]);
  markerLine(sArrival, [1.6, 0.8]);
  // Marca de reflexiones de borde (terracota tenue): lo que hay a la derecha
  // es artificial (rebotes de los límites de la malla), no señal real.
  if (reflectionsAfter !== undefined && reflectionsAfter > tMin && reflectionsAfter <= tMax) {
    doc.setDrawColor(196, 85, 58);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([0.5, 0.8], 0);
    doc.line(px(reflectionsAfter), y, px(reflectionsAfter), y + h);
    doc.setLineDashPattern([], 0);
  }

  // Traza (solo los puntos dentro de la ventana visible).
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  const pts: [number, number][] = [];
  for (let i = 0; i < time.length; i++) {
    if (time[i] < tMin || time[i] > tMax) continue;
    pts.push([px(time[i]), py(values[i])]);
  }
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }

  // Letras P/S encima de la traza, con chip blanco, para que no se pierdan
  // bajo la curva (B1). Se sitúan en el borde superior del marco.
  const markerLabel = (t: number | undefined, letter: string) => {
    if (t === undefined || t < tMin || t > tMax) return;
    const lx = px(t) + 0.4;
    doc.setFontSize(6.5);
    doc.setFont(FONT, 'bold');
    const tw = doc.getTextWidth(letter);
    doc.setFillColor(255, 255, 255);
    doc.rect(lx - 0.4, y + 0.6, tw + 0.8, 3, 'F');
    doc.setTextColor(...COLORS.muted);
    doc.text(letter, lx, y + 3);
    doc.setFont(FONT, 'normal');
  };
  markerLabel(pArrival, 'P');
  markerLabel(sArrival, 'S');

  // Etiqueta de la componente (esquina superior izquierda), sobre chip blanco.
  doc.setFontSize(8);
  doc.setFont(FONT, 'bold');
  const lw = doc.getTextWidth(label);
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 1.2, y + 0.6, lw + 1, 3.6, 'F');
  doc.setTextColor(...color);
  doc.text(label, x + 1.5, y + 3.5);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.text(`${tMin.toFixed(0)} s`, x, y + h + 3);
  doc.text(`${tMax.toFixed(0)} s`, x + w, y + h + 3, { align: 'right' });
}

/** Construye el documento PDF (sin descargarlo). */
export function buildReportPdf(input: ReportInput): jsPDF {
  const { title, author, notes, createdAt, params, results } = input;
  // Secciones a incluir (todas por defecto si no se especifica).
  const sec = input.sections ?? {
    params: true, metrics: true, seismograms: true, crossSection: true, particleMotion: true, interpretation: true,
  };
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
  // El título es texto del usuario: puede ser largo, así que se envuelve al
  // ancho de contenido y nunca se corta (B1).
  const titleLines = doc.splitTextToSize(title, CONTENT_W) as string[];
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 5.4 + 0.6;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  const genLine = `Generado: ${fmtDate(createdAt)}${author ? `  ·  Autor: ${author}` : ''}`;
  const genLines = doc.splitTextToSize(genLine, CONTENT_W) as string[];
  doc.text(genLines, MARGIN, y);
  y += genLines.length * 3.6 + 5;

  // ── Parámetros ──
  // Dibuja un título de sección en mayúscula/minúscula (sentence case), no en
  // mayúsculas. Acepta `keepWith`: alto (mm) del primer bloque que debe caber
  // junto al título; si no cabe, salta de página ANTES de dibujar el título
  // para no dejar títulos huérfanos al pie de la página (A3).
  const section = (label: string, keepWith = 0) => {
    // Alto aproximado del título + subrayado + separación (≈ 11.5 mm).
    const titleH = 11.5;
    if (y + titleH + keepWith > 285) { doc.addPage(); y = MARGIN; }
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.green);
    doc.text(label, MARGIN, y);
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

  if (sec.params) {
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
  }

  if (sec.metrics) {
  section('Métricas del resultado');
  const isReal = results.isRealRecord === true;
  // En un REGISTRO REAL no hay arribos P/S teóricos ni malla: solo se reportan
  // las magnitudes medibles sobre la señal (amplitud, frecuencia, duración).
  const metricRows: [string, string][] = isReal
    ? [
        ['Amplitud máxima', `${results.maxAmplitude.toExponential(2)} u.a.`],
        ['Frecuencia dominante', `${results.dominantFrequency.toFixed(2)} Hz`],
        ['Duración del registro', `${results.duration.toFixed(0)} s`],
      ]
    : [
        ['Amplitud máxima', `${results.maxAmplitude.toExponential(2)} u.a.`],
        ['Frecuencia dominante', `${results.dominantFrequency.toFixed(2)} Hz`],
        ['Arribo onda P', `${results.pArrival.toFixed(2)} s${results.pArrivalDetected === false ? ' (teórico)' : ''}`],
        ['Arribo onda S', `${results.sArrival.toFixed(2)} s${results.sArrivalDetected === false ? ' (teórico)' : ''}`],
        ['Diferencia S − P', `${(results.sArrival - results.pArrival).toFixed(2)} s`],
        ['Duración registrada', `${results.duration.toFixed(0)} s`],
      ];
  if (!isReal && results.gridInfo) {
    metricRows.push(['Malla FDM', `${results.gridInfo.nx} × ${results.gridInfo.nz}`]);
    // Enteros grandes: agrupados con espacio (no punto ni coma; en español
    // "6.000" se leería como seis). Espacio normal para no depender de glifos.
    metricRows.push(['Pasos temporales', groupInt(results.gridInfo.totalSteps)]);
    if (typeof results.gridInfo.epicentralDistanceKm === 'number') {
      metricRows.push(['Estación virtual', `${results.gridInfo.epicentralDistanceKm.toFixed(1)} km del epicentro, en superficie`]);
    }
  }
  kv(metricRows);
  // El aviso de reflexiones de borde va SOLO en la sección de sismogramas (no
  // se duplica aquí en métricas).
  // Nota si la frecuencia de la fuente se ajustó por dispersión (dos capas).
  {
    const fnote = sourceFreqAdjustedNote(params, results.dominantFrequency);
    if (fnote) {
      y += 1;
      doc.setFontSize(7.5); doc.setTextColor(45, 106, 79);
      const lines = doc.splitTextToSize(fnote, CONTENT_W) as string[];
      doc.text(lines, MARGIN, y);
      y += lines.length * 3.4 + 2;
      doc.setTextColor(...COLORS.text);
    }
  }
  }

  // ── Sismogramas ──
  if (sec.seismograms && results.waveData && results.waveData.time.length > 1) {
    const real = results.isRealRecord === true;
    // Con registro real, el reporte muestra la MISMA señal que la pantalla y no
    // las llegadas P/S teóricas del FDM (el registro real no las trae).
    // El título se queda junto a la primera traza (24 mm) para no quedar
    // huérfano al pie de página (A3).
    section(real ? 'Sismograma triaxial (registro real)' : 'Sismogramas triaxiales', 24 + 7);
    if (real && results.realLabel) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      const rl = doc.splitTextToSize(results.realLabel, CONTENT_W) as string[];
      doc.text(rl, MARGIN, y);
      y += rl.length * 3.6 + 2;
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
    // Tiempo del primer rebote de borde: si la ventana lo supera, se marca en
    // las trazas y se advierte que lo posterior es artificial (no en real).
    const bounceMin = earliestBounce(results.gridInfo);
    const reflAfter = (!real && bounceMin !== null && results.duration > bounceMin + 0.05)
      ? bounceMin : undefined;
    // Encuadre "del evento" (B1): el PDF muestra el tramo del pulso, no toda la
    // duración, para que el sismograma se lea. Mismo criterio que la pantalla.
    const win = computeEventWindow(wd, real ? {} : { pArrival: results.pArrival, sArrival: results.sArrival });
    if (reflAfter !== undefined) {
      doc.setFontSize(7.5); doc.setTextColor(196, 85, 58);
      // Si el rebote queda FUERA de la ventana mostrada, la línea punteada no se
      // ve; el aviso lo dice así en vez de mencionar la línea.
      const bounceVisible = reflAfter <= win.end + 1e-6;
      const note = bounceVisible
        ? `Después de ${reflAfter.toFixed(1)} s aparecen reflexiones artificiales en los bordes del modelo; no las interpretes como señal real (línea punteada terracota).`
        : `Después de ${reflAfter.toFixed(1)} s aparecen reflexiones artificiales en los bordes del modelo (fuera de la ventana mostrada); no las interpretes como señal real.`;
      const lines = doc.splitTextToSize(note, CONTENT_W) as string[];
      doc.text(lines, MARGIN, y);
      y += lines.length * 3.4 + 2;
      doc.setTextColor(...COLORS.muted);
    }
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
        refMax, reflAfter, win.start, win.end);
      y += traceH + gap;
    }
    const scaleNote = scaleCommon
      ? 'Escala común: las tres trazas normalizadas contra el máximo de las tres (±1).'
      : 'Escala por componente: cada traza normalizada contra su propio máximo (±1).';
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    const winNote = (win.start > (wd.time[0] ?? 0) + 0.1 || win.end < (wd.time[wd.time.length - 1] ?? 0) - 0.1)
      ? ` Ventana ajustada al evento (${win.start.toFixed(0)}–${win.end.toFixed(0)} s).`
      : '';
    const seisNote = real
      ? `Registro real de la red del SGC/OVSP, señal decimada. ${scaleNote}${winNote}`
      : `Líneas grises: arribo P (punteada) y S (guiones). ${scaleNote} Señal no calibrada.${winNote}`;
    const seisLines = doc.splitTextToSize(seisNote, CONTENT_W) as string[];
    doc.text(seisLines, MARGIN, y);
    y += seisLines.length * 3.2 + 4;
  }

  // ── Mapa de calor del subsuelo (tres fotogramas ordenados) ──
  if (sec.crossSection && results.crossSection && results.crossSection.frames.length) {
    const cs = results.crossSection;
    const frames = cs.frames;
    const gapX = 4;
    // Disposición '2plus1' (por defecto con 3 fotogramas): dos arriba y uno
    // centrado abajo, más grande. Así los rótulos de los ejes se leen a ≥7 pt
    // en la página (B1). Con menos de 3 fotogramas, una fila centrada.
    const use2plus1 = (cs.layout ?? (frames.length === 3 ? '2plus1' : 'row')) === '2plus1' && frames.length === 3;

    // Alto del primer fotograma para el cálculo de huérfanos (A3).
    const firstProps0 = doc.getImageProperties(frames[0].dataUrl);
    const topW0 = use2plus1 ? (CONTENT_W - gapX) / 2 : (CONTENT_W - gapX * (Math.min(3, frames.length) - 1)) / Math.min(3, frames.length);
    const firstH0 = topW0 * (firstProps0.height / firstProps0.width);
    section('Mapa de calor del subsuelo', 5 + 5 + firstH0 + 4);
    // Componente mostrada.
    doc.setFont(FONT, 'normal'); doc.setFontSize(8); doc.setTextColor(...COLORS.muted);
    doc.text(`Componente: ${cs.component}`, MARGIN, y);
    y += 5;

    // Dibuja un fotograma (rótulo + tiempo + imagen) en (cx, ty) con ancho w.
    // Devuelve el alto total ocupado.
    const drawFrame = (fr: { time: number; label: string; dataUrl: string }, cx: number, ty: number, w: number): number => {
      const props = doc.getImageProperties(fr.dataUrl);
      const imgH = w * (props.height / props.width);
      doc.setFont(FONT, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...COLORS.text);
      const ll = doc.splitTextToSize(fr.label, w) as string[];
      doc.text(ll, cx, ty);
      const labelH = ll.length * 3.1;
      doc.setFont(FONT, 'normal'); doc.setTextColor(...COLORS.muted);
      doc.text(`t = ${fr.time.toFixed(2)} s`, cx, ty + labelH + 0.4);
      doc.addImage(fr.dataUrl, 'PNG', cx, ty + labelH + 1.6, w, imgH);
      return labelH + 1.6 + imgH;
    };

    if (use2plus1) {
      const topW = (CONTENT_W - gapX) / 2;
      // Fila superior: dos fotogramas.
      const topH = Math.max(
        drawFrame(frames[0], MARGIN, y, topW),
        drawFrame(frames[1], MARGIN + topW + gapX, y, topW),
      );
      y += topH + 6;
      // Fila inferior: un fotograma centrado, más grande (coordinado con
      // buildCrossSectionFrames que lo rindió con la tipografía adecuada).
      const botW = 118;
      const botProps = doc.getImageProperties(frames[2].dataUrl);
      const botTotalH = (botProps.height / botProps.width) * botW + 6;
      if (y + botTotalH > 285) { doc.addPage(); y = MARGIN; }
      const botX = MARGIN + (CONTENT_W - botW) / 2;
      const bh = drawFrame(frames[2], botX, y, botW);
      y += bh + 6;
    } else {
      const cols = Math.min(3, Math.max(1, frames.length));
      const imgW = (CONTENT_W - gapX * (cols - 1)) / cols;
      const rowW = cols * imgW + (cols - 1) * gapX;
      const rowX0 = MARGIN + (CONTENT_W - rowW) / 2;
      let rowH = 0;
      frames.forEach((fr, i) => {
        const cx = rowX0 + i * (imgW + gapX);
        rowH = Math.max(rowH, drawFrame(fr, cx, y, imgW));
      });
      y += rowH + 6;
    }
    // Leyenda única de escala (barra de color) + nota de escala global.
    if (y + 16 > 290) { doc.addPage(); y = MARGIN; }
    const barW = 42, barH = 3.2;
    const grad = ['#faf6f0', '#c4553a', '#7a2a1c'];
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const tt = i / (steps - 1);
      // interpolación simple crema→terracota→oscuro
      const seg = tt < 0.5 ? tt / 0.5 : (tt - 0.5) / 0.5;
      const c0 = tt < 0.5 ? grad[0] : grad[1];
      const c1 = tt < 0.5 ? grad[1] : grad[2];
      const rgb = mixHex(c0, c1, seg);
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.rect(MARGIN + (i / steps) * barW, y, barW / steps + 0.2, barH, 'F');
    }
    doc.setFontSize(7); doc.setTextColor(...COLORS.muted);
    doc.text('0', MARGIN, y + barH + 3);
    doc.text('máx', MARGIN + barW, y + barH + 3, { align: 'right' });
    y += barH + 6;
    const capLines = doc.splitTextToSize(cs.caption, CONTENT_W) as string[];
    doc.text(capLines, MARGIN, y);
    y += capLines.length * 3.5 + 4;
  }

  // ── Movimiento de partícula (hodograma 3D) ──
  if (sec.particleMotion && results.particleMotion && results.particleMotion.dataUrl) {
    const pm = results.particleMotion;
    // Imagen cuadrada centrada, a media anchura de contenido.
    const props = doc.getImageProperties(pm.dataUrl);
    const imgW = Math.min(CONTENT_W, 96);
    const imgH = imgW * (props.height / props.width);
    // El título se queda junto a la imagen + la leyenda (A3).
    section('Movimiento de partícula', imgH + 4 + 4);
    const cx = MARGIN + (CONTENT_W - imgW) / 2;
    doc.addImage(pm.dataUrl, 'PNG', cx, y, imgW, imgH);
    y += imgH + 4;
    // Leyenda de tramos (P terracota, S verde, reposo gris). Separadores con
    // comas y punto y coma (A4), no middots.
    doc.setFont(FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(...COLORS.muted);
    doc.text('Tramos: gris, reposo; terracota, onda P; verde, onda S', MARGIN, y);
    y += 4;
    // Si el arribo S no se detectó automáticamente (se usó el valor teórico),
    // el tramo verde marca la ventana esperada, no un pico medido (A4).
    if (results.sArrivalDetected === false) {
      doc.setFontSize(6.5); doc.setTextColor(...COLORS.muted);
      const tn = doc.splitTextToSize(
        'El arribo S es teórico (no se detectó un pico claro); el tramo verde marca la ventana S esperada.',
        CONTENT_W) as string[];
      doc.text(tn, MARGIN, y);
      y += tn.length * 3.2 + 1;
    }
    const capLines = doc.splitTextToSize(pm.caption, CONTENT_W) as string[];
    doc.setFont(FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(...COLORS.text);
    doc.text(capLines, MARGIN, y);
    y += capLines.length * 3.5 + 4;
  }

  // ── Interpretación ──
  if (sec.interpretation) {
  // El título se queda con al menos ~4 líneas del texto (A3).
  section('Interpretación educativa', 4 * 4.5);
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  const interp = interpretSimulation({
    params,
    dominantFrequency: results.dominantFrequency,
    maxAmplitude: results.maxAmplitude,
    pArrival: results.pArrival,
    sArrival: results.sArrival,
    gridInfo: results.gridInfo,
    // Con registro real, la interpretación describe el REGISTRO (no la
    // simulación de apoyo) y no presenta arribos P/S teóricos como medidos.
    isRealRecord: results.isRealRecord,
    realLabel: results.realLabel,
    realDuration: results.isRealRecord ? results.duration : undefined,
  }).replace(/⚠️/g, '(!)');
  const lines = doc.splitTextToSize(interp, CONTENT_W) as string[];
  doc.text(lines, MARGIN, y);
  y += lines.length * 4.5 + 4;
  }

  if (notes && notes.trim()) {
    // El título se queda con al menos ~3 líneas de la nota (A3).
    section('Notas del usuario', 3 * 4.5);
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
