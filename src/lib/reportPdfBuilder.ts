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
  // Marca de reflexiones de borde (terracota tenue): lo que hay a la derecha
  // es artificial (rebotes de los límites de la malla), no señal real.
  if (reflectionsAfter !== undefined && reflectionsAfter > 0 && reflectionsAfter <= tMax) {
    doc.setDrawColor(196, 85, 58);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([0.5, 0.8], 0);
    doc.line(px(reflectionsAfter), y, px(reflectionsAfter), y + h);
    doc.setLineDashPattern([], 0);
  }

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
  doc.text(title, MARGIN, y);
  y += 6;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Generado: ${fmtDate(createdAt)}${author ? `  ·  Autor: ${author}` : ''}`, MARGIN, y);
  y += 8;

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
  // Aviso de reflexiones si la ventana supera el primer rebote de borde.
  {
    const bounceS = results.gridInfo?.firstBounceS;
    if (results.isRealRecord !== true && typeof bounceS === 'number' && bounceS > 0 && results.duration > bounceS + 0.05) {
      y += 1;
      doc.setFontSize(7.5); doc.setTextColor(196, 85, 58);
      const note = `Después de ${bounceS.toFixed(1)} s aparecen reflexiones artificiales en los bordes del modelo; no las interpretes como señal real.`;
      const lines = doc.splitTextToSize(note, CONTENT_W) as string[];
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
    // Tiempo del primer rebote de borde: si la ventana lo supera, se marca en
    // las trazas y se advierte que lo posterior es artificial (no en real).
    const bounceS = results.gridInfo?.firstBounceS;
    const reflAfter = (!real && typeof bounceS === 'number' && bounceS > 0 && results.duration > bounceS + 0.05)
      ? bounceS : undefined;
    if (reflAfter !== undefined) {
      doc.setFontSize(7.5); doc.setTextColor(196, 85, 58);
      const note = `Después de ${reflAfter.toFixed(1)} s aparecen reflexiones artificiales en los bordes del modelo; no las interpretes como señal real (línea punteada terracota).`;
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
        refMax, reflAfter);
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

  // ── Mapa de calor del subsuelo (tres fotogramas ordenados) ──
  if (sec.crossSection && results.crossSection && results.crossSection.frames.length) {
    const cs = results.crossSection;
    // Los tres fotogramas caben mejor juntos: se dibujan a media anchura de
    // contenido para que entren dos por fila o uno por bloque segun el alto.
    // Los tres fotogramas se dibujan en UNA fila (P, S, después) para leer la
    // secuencia de un vistazo; si no caben tres, se reparten y centran.
    const frames = cs.frames;
    // Ancho de imagen: tres columnas en una fila (A4). Gap fijo entre marcos.
    const gapX = 4;
    const cols = Math.min(3, Math.max(1, frames.length));
    const imgW = (CONTENT_W - gapX * (cols - 1)) / cols;
    // Alto de la primera imagen (todos los fotogramas comparten proporción).
    const firstProps = doc.getImageProperties(frames[0].dataUrl);
    const firstH = imgW * (firstProps.height / firstProps.width);
    // El título debe quedarse junto a: línea "Componente:" (5) + rótulos (5) +
    // la fila de imágenes (firstH). Así no queda huérfano (A3).
    section('Mapa de calor del subsuelo', 5 + 5 + firstH + 4);
    // Componente mostrada.
    doc.setFont(FONT, 'normal'); doc.setFontSize(8); doc.setTextColor(...COLORS.muted);
    doc.text(`Componente: ${cs.component}`, MARGIN, y);
    y += 5;
    // Fila de fotogramas centrada. Si el nº de columnas < 3 (pocos frames),
    // se centra el bloque para evitar un hueco grande a la derecha (A4).
    const rowW = cols * imgW + (cols - 1) * gapX;
    const rowX0 = MARGIN + (CONTENT_W - rowW) / 2;
    const rowY = y;
    let rowH = 0;
    frames.forEach((fr, i) => {
      const props = doc.getImageProperties(fr.dataUrl);
      const imgH = imgW * (props.height / props.width);
      const cx = rowX0 + i * (imgW + gapX);
      doc.setFont(FONT, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...COLORS.text);
      doc.text(`${fr.label}`, cx, rowY);
      doc.setFont(FONT, 'normal'); doc.setTextColor(...COLORS.muted);
      doc.text(`t = ${fr.time.toFixed(2)} s`, cx, rowY + 3.3);
      doc.addImage(fr.dataUrl, 'PNG', cx, rowY + 4.5, imgW, imgH);
      rowH = Math.max(rowH, imgH + 4.5);
    });
    y = rowY + rowH + 6;
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
