/**
 * Reportes administrativos exportables en Excel y PDF (RF-23).
 *
 * Genera un libro Excel (SheetJS) con hojas de resumen, usuarios y
 * simulaciones por período, y un PDF equivalente con jsPDF.
 * @module adminExport
 */
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import type { AdminReport, AdminUser, DashboardStats } from './adminData';
import { characterize, type Characterization } from './adminChars';
import { sanitizeCell } from './csvSafe';

/** Paleta de marca para los gráficos del PDF (RGB). */
const PDF_COLORS = {
  terracotta: [196, 85, 58] as [number, number, number],
  forest: [45, 106, 79] as [number, number, number],
  gold: [212, 168, 83] as [number, number, number],
  purple: [107, 91, 149] as [number, number, number],
  ink: [26, 26, 46] as [number, number, number],
  grayTrack: [237, 229, 228] as [number, number, number],
  grayText: [120, 113, 108] as [number, number, number],
};

/** Serie de colores para barras de categorías (en orden). */
const PDF_BAR_SERIES: [number, number, number][] = [
  PDF_COLORS.terracotta, PDF_COLORS.forest, PDF_COLORS.purple, PDF_COLORS.gold, PDF_COLORS.grayText,
];

/** Sanea cada celda de texto de una fila contra inyección de fórmulas (XLSX). */
function safeRow<T>(row: T[]): (T | string)[] {
  return row.map(sanitizeCell);
}

export interface AdminReportInput {
  stats: DashboardStats;
  users: AdminUser[];
  reports: AdminReport[];
  period: { from?: string; to?: string };
}

function periodLabel(p: AdminReportInput['period']): string {
  if (p.from && p.to) return `${p.from} a ${p.to}`;
  if (p.from) return `desde ${p.from}`;
  if (p.to) return `hasta ${p.to}`;
  return 'todo el histórico';
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/** Cuenta simulaciones por mes (YYYY-MM) para el período filtrado. */
export function simulationsByMonth(reports: AdminReport[]): { month: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of reports) {
    const key = r.created_at.slice(0, 7);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
}

/** Descarga el reporte administrativo como .xlsx. */
export function exportAdminExcel(input: AdminReportInput): void {
  const { stats, users, reports, period } = input;
  const wb = XLSX.utils.book_new();

  const resumen = [
    ['SismoNariño — Reporte administrativo'],
    ['Período', periodLabel(period)],
    ['Generado', new Date().toLocaleString('es-CO')],
    [],
    ['Indicador', 'Valor'],
    ['Investigadores registrados', stats.users],
    ['Cuentas activas', stats.activeUsers],
    ['Administradores', stats.roles.admin],
    ['Investigadores (rol estándar)', stats.roles.user],
    ['Simulaciones guardadas (total)', stats.reports],
    ['Simulaciones en el período', reports.length],
    ['Eventos sísmicos en BD', stats.events],
    ['  Tectónicos', stats.eventsByType.tectonic],
    ['  Volcánicos', stats.eventsByType.volcanic],
    ['Preguntas del quiz', stats.questions],
    ['Datos curiosos de ondas', stats.facts],
    ['Eventos de la línea de tiempo', stats.timeline],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');

  const porMes = [['Mes', 'Simulaciones'], ...simulationsByMonth(reports).map(r => [r.month, r.count])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porMes), 'Simulaciones por mes');

  const usuarios = [
    ['Nombre', 'Email', 'Rol', 'Institución', 'Ocupación', 'Área de investigación', 'Ciudad', 'País', 'Propósito de uso', 'Estado', 'Registro', 'Último acceso'],
    ...users.map(u => safeRow([u.full_name || '—', u.email, u.role === 'admin' ? 'Administrador' : 'Investigador', u.institution || '—', u.occupation || '—', u.research_area || '—', u.city || '—', u.country || '—', u.usage_purpose || '—', u.active ? 'Activo' : 'Inactivo', fmt(u.created_at), fmt(u.last_login)])),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(usuarios), 'Usuarios');

  const sims = [
    ['Fecha', 'Título', 'Usuario', 'Email', 'Fuente', 'Magnitud', 'Profundidad (km)', 'Vp', 'Vs', 'Densidad', 'Frec. dominante (Hz)', 'tP (s)', 'tS (s)'],
    ...reports.map(r => {
      const p = r.params as Record<string, number | string>;
      const res = r.results as Record<string, number>;
      return safeRow([
        fmt(r.created_at), r.title, r.profiles?.full_name || '—', r.profiles?.email || '—',
        p.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica', p.magnitude, p.depth, p.vp, p.vs, p.density,
        res.dominantFrequency != null ? Number(res.dominantFrequency.toFixed(2)) : '—',
        res.pArrival != null ? Number(res.pArrival.toFixed(2)) : '—',
        res.sArrival != null ? Number(res.sArrival.toFixed(2)) : '—',
      ]);
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sims), 'Simulaciones');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `sismonarino_reporte_admin_${stamp}.xlsx`);
}

/**
 * Dibuja un gráfico de barras verticales en el PDF.
 * @returns la coordenada Y debajo del gráfico.
 */
function drawBarChart(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  data: { label: string; count: number }[],
  color: [number, number, number],
): number {
  const max = Math.max(1, ...data.map(d => d.count));
  const n = Math.max(1, data.length);
  const gap = 3;
  const barW = (w - gap * (n - 1)) / n;
  const baseY = y + h;

  // Líneas guía horizontales + eje.
  doc.setDrawColor(...PDF_COLORS.grayTrack);
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const gy = y + (h * i) / 4;
    doc.line(x, gy, x + w, gy);
  }

  data.forEach((d, i) => {
    const bh = (d.count / max) * h;
    const bx = x + i * (barW + gap);
    const by = baseY - bh;
    doc.setFillColor(...color);
    doc.roundedRect(bx, by, barW, Math.max(0.5, bh), 1, 1, 'F');
    // Valor encima de la barra.
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(String(d.count), bx + barW / 2, by - 1.5, { align: 'center' });
    // Etiqueta debajo del eje.
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.grayText);
    doc.text(d.label, bx + barW / 2, baseY + 4, { align: 'center' });
  });

  return baseY + 8;
}

/**
 * Dibuja un "donut" de dos categorías con leyenda a la derecha.
 * jsPDF no tiene arcos, así que se aproxima con segmentos de triángulo (pie)
 * y un círculo blanco al centro para el efecto donut.
 * @returns la coordenada Y debajo del gráfico.
 */
function drawDonut(
  doc: jsPDF, cx: number, cy: number, r: number,
  parts: { label: string; value: number; color: [number, number, number] }[],
  legendX: number,
): number {
  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  let startAngle = -Math.PI / 2; // arranca arriba
  const steps = 90;

  for (const p of parts) {
    const frac = p.value / total;
    const endAngle = startAngle + frac * Math.PI * 2;
    doc.setFillColor(...p.color);
    // Aproximar el sector con triángulos finos (abanico desde el centro).
    const segs = Math.max(1, Math.round(steps * frac));
    for (let i = 0; i < segs; i++) {
      const a0 = startAngle + ((endAngle - startAngle) * i) / segs;
      const a1 = startAngle + ((endAngle - startAngle) * (i + 1)) / segs;
      doc.triangle(
        cx, cy,
        cx + r * Math.cos(a0), cy + r * Math.sin(a0),
        cx + r * Math.cos(a1), cy + r * Math.sin(a1),
        'F',
      );
    }
    startAngle = endAngle;
  }

  // Centro blanco → efecto donut.
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r * 0.58, 'F');
  // Total al centro.
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.text(String(total), cx, cy + 1, { align: 'center' });
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.grayText);
  doc.text('usuarios', cx, cy + 4.5, { align: 'center' });

  // Leyenda.
  let ly = cy - r + 2;
  for (const p of parts) {
    const pct = Math.round((p.value / total) * 100);
    doc.setFillColor(...p.color);
    doc.circle(legendX + 1.5, ly - 1, 1.5, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.text(`${p.label}: ${p.value} (${pct}%)`, legendX + 5, ly);
    ly += 7;
  }
  doc.setFont('helvetica', 'normal');

  return cy + r + 6;
}

/**
 * Dibuja barras horizontales de una dimensión de caracterización.
 * @returns la coordenada Y debajo del bloque.
 */
function drawHBars(
  doc: jsPDF, x: number, y: number, w: number,
  title: string, buckets: { label: string; count: number }[], total: number,
): number {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(title, x, y);
  doc.setFont('helvetica', 'normal');
  let cy = y + 4;

  const max = Math.max(1, ...buckets.map(b => b.count));
  if (buckets.length === 0) {
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.grayText);
    doc.text('Sin datos.', x, cy);
    return cy + 4;
  }

  buckets.forEach((b, i) => {
    const pct = Math.round((b.count / total) * 100);
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.ink);
    const label = b.label.length > 24 ? b.label.slice(0, 23) + '…' : b.label;
    doc.text(label, x, cy);
    doc.setTextColor(...PDF_COLORS.grayText);
    doc.text(`${b.count} · ${pct}%`, x + w, cy, { align: 'right' });
    // Pista + barra.
    const barY = cy + 1.2;
    doc.setFillColor(...PDF_COLORS.grayTrack);
    doc.roundedRect(x, barY, w, 1.6, 0.8, 0.8, 'F');
    const barW = (b.count / max) * w;
    doc.setFillColor(...PDF_BAR_SERIES[i % PDF_BAR_SERIES.length]);
    doc.roundedRect(x, barY, Math.max(0.8, barW), 1.6, 0.8, 0.8, 'F');
    cy += 6;
  });
  return cy + 2;
}

/** Descarga el reporte administrativo como PDF (con gráficas). */
export function exportAdminPdf(input: AdminReportInput): void {
  const { stats, users, reports, period } = input;
  const chars = characterize(users);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 15;
  const W = 210 - M * 2;
  let y = M;

  doc.setFillColor(26, 26, 46);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SismoNariño — Reporte administrativo', M, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${periodLabel(period)}  ·  Generado: ${new Date().toLocaleString('es-CO')}`, M, 16);
  y = 30;

  const heading = (t: string) => {
    if (y > 270) { doc.addPage(); y = M; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(45, 106, 79);
    doc.text(t.toUpperCase(), M, y);
    y += 1.5;
    doc.setDrawColor(45, 106, 79);
    doc.line(M, y, M + W, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(26, 26, 46);
  };

  const table = (headers: string[], rows: (string | number)[][], widths: number[]) => {
    doc.setFontSize(7.5);
    const rowH = 5;
    const drawHeader = () => {
      doc.setFillColor(245, 245, 244);
      doc.rect(M, y - 3.5, W, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      let x = M + 1;
      headers.forEach((h, i) => { doc.text(h, x, y); x += widths[i]; });
      doc.setFont('helvetica', 'normal');
      y += rowH;
    };
    drawHeader();
    for (const r of rows) {
      if (y > 282) { doc.addPage(); y = M; drawHeader(); }
      let x = M + 1;
      r.forEach((c, i) => {
        const txt = String(c ?? '—');
        const maxChars = Math.floor(widths[i] / 1.55);
        doc.text(txt.length > maxChars ? txt.slice(0, maxChars - 1) + '…' : txt, x, y);
        x += widths[i];
      });
      y += rowH;
    }
    y += 4;
  };

  heading('Indicadores generales');
  table(['Indicador', 'Valor'], [
    ['Usuarios registrados', stats.users],
    ['Usuarios activos', stats.activeUsers],
    ['Administradores / usuarios', `${stats.roles.admin} / ${stats.roles.user}`],
    ['Simulaciones guardadas (total)', stats.reports],
    ['Simulaciones en el período', reports.length],
    ['Eventos sísmicos en BD (tect. / volc.)', `${stats.events} (${stats.eventsByType.tectonic} / ${stats.eventsByType.volcanic})`],
    ['Preguntas quiz / datos de ondas / línea de tiempo', `${stats.questions} / ${stats.facts} / ${stats.timeline}`],
  ], [110, 70]);

  // ── Gráficas: simulaciones por mes (barras) + roles (donut) ──
  heading('Simulaciones por mes');
  const byMonth = simulationsByMonth(reports);
  if (byMonth.length) {
    // Etiqueta corta "YYYY-MM" → "MM/YY" para que quepa.
    const barData = byMonth.map(m => {
      const [yr, mo] = m.month.split('-');
      return { label: `${mo}/${yr.slice(2)}`, count: m.count };
    });
    y = drawBarChart(doc, M, y, W, 35, barData, PDF_COLORS.terracotta);
    y += 2;
  } else {
    doc.setFontSize(8); doc.setTextColor(...PDF_COLORS.grayText);
    doc.text('Sin simulaciones en el período.', M, y); y += 6;
  }

  heading('Distribución de roles');
  y = drawDonut(doc, M + 20, y + 18, 16, [
    { label: 'Administradores', value: stats.roles.admin, color: PDF_COLORS.terracotta },
    { label: 'Investigadores', value: stats.roles.user, color: PDF_COLORS.forest },
  ], M + 50);
  y += 2;

  // ── Caracterización de usuarios (barras horizontales en dos columnas) ──
  heading('Caracterización de investigadores');
  {
    const colW = (W - 8) / 2;
    const leftX = M;
    const rightX = M + colW + 8;
    const startY = y;
    const yl1 = drawHBars(doc, leftX, startY, colW, 'Por ocupación', chars.ocupacion, chars.total);
    const yr1 = drawHBars(doc, rightX, startY, colW, 'Por institución', chars.institucion, chars.total);
    let rowY = Math.max(yl1, yr1) + 3;
    if (rowY > 250) { doc.addPage(); rowY = M; }
    const yl2 = drawHBars(doc, leftX, rowY, colW, 'Por área de interés', chars.area, chars.total);
    const yr2 = drawHBars(doc, rightX, rowY, colW, 'Por ciudad', chars.ciudad, chars.total);
    y = Math.max(yl2, yr2) + 4;
  }

  heading('Usuarios registrados');
  table(
    ['Nombre', 'Email', 'Rol', 'Institución', 'Ocupación', 'Estado'],
    users.map(u => [u.full_name || '—', u.email, u.role === 'admin' ? 'Admin' : 'Invest.', u.institution || '—', u.occupation || '—', u.active ? 'Activo' : 'Inactivo']),
    [38, 50, 16, 36, 24, 16],
  );

  heading('Simulaciones del período');
  table(
    ['Fecha', 'Título', 'Usuario', 'Fuente', 'Mw', 'Prof. km'],
    reports.map(r => {
      const p = r.params as Record<string, number | string>;
      return [fmt(r.created_at), r.title, r.profiles?.full_name || r.profiles?.email || '—', p.sourceType === 'volcanic' ? 'Volc.' : 'Tect.', p.magnitude, p.depth];
    }),
    [32, 60, 42, 16, 14, 16],
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108);
    doc.text('SismoNariño · Panel de administración · Universidad Mariana (2026)', M, 292);
    doc.text(`Página ${p} de ${pages}`, 210 - M, 292, { align: 'right' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`sismonarino_reporte_admin_${stamp}.pdf`);
}

// ─── Caracterización de usuarios (exportable en Excel y PDF) ───

/** Secciones de la caracterización con su título para exportar. */
function charSections(c: Characterization): { title: string; buckets: { label: string; count: number }[] }[] {
  return [
    { title: 'Por ocupación', buckets: c.ocupacion },
    { title: 'Por institución', buckets: c.institucion },
    { title: 'Por área de interés', buckets: c.area },
    { title: 'Por ciudad', buckets: c.ciudad },
  ];
}

/** Descarga la caracterización de usuarios como .xlsx (una hoja por dimensión). */
export function exportCharacterizationExcel(c: Characterization): void {
  const wb = XLSX.utils.book_new();
  const pct = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0);

  const resumen: (string | number)[][] = [
    ['SismoNariño — Caracterización de usuarios'],
    ['Generado', new Date().toLocaleString('es-CO')],
    ['Total de usuarios', c.total],
    [],
    ['Dimensión', 'Categoría', 'Usuarios', '% del total'],
  ];
  for (const s of charSections(c)) {
    for (const b of s.buckets) resumen.push([s.title.replace('Por ', ''), sanitizeCell(b.label), b.count, `${pct(b.count)}%`]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Caracterización');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `sismonarino_caracterizacion_${stamp}.xlsx`);
}

/** Descarga la caracterización de usuarios como PDF con barras simples. */
export function exportCharacterizationPdf(c: Characterization): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 15;
  const W = 210 - M * 2;
  let y = M;
  const pct = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0);

  doc.setFillColor(196, 85, 58);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SismoNariño — Caracterización de usuarios', M, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total: ${c.total} usuarios  ·  Generado: ${new Date().toLocaleString('es-CO')}`, M, 16);
  y = 30;

  for (const s of charSections(c)) {
    if (y > 250) { doc.addPage(); y = M; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(45, 106, 79);
    doc.text(s.title.toUpperCase(), M, y);
    y += 1.5;
    doc.setDrawColor(45, 106, 79);
    doc.line(M, y, M + W, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(26, 26, 46);

    const max = Math.max(1, ...s.buckets.map(b => b.count));
    const barMaxW = 70;
    for (const b of s.buckets) {
      if (y > 282) { doc.addPage(); y = M; }
      doc.text(b.label.length > 34 ? b.label.slice(0, 33) + '…' : b.label, M, y);
      const bw = (b.count / max) * barMaxW;
      doc.setFillColor(b.label === 'Sin dato' ? 214 : 196, b.label === 'Sin dato' ? 211 : 85, b.label === 'Sin dato' ? 209 : 58);
      doc.rect(M + 90, y - 3, bw, 3.5, 'F');
      doc.text(`${b.count} · ${pct(b.count)}%`, M + 90 + barMaxW + 4, y);
      y += 6;
    }
    y += 4;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108);
    doc.text('SismoNariño · Caracterización de usuarios · Universidad Mariana (2026)', M, 292);
    doc.text(`Página ${p} de ${pages}`, 210 - M, 292, { align: 'right' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`sismonarino_caracterizacion_${stamp}.pdf`);
}

// ─── Exportación de logs de cargas MiniSEED ───

export interface MseedLogsExportInput {
  logs: import('./adminData').MseedUploadLog[];
  stats?: import('./adminData').MseedUploadStats[];
  topUploaders?: import('./adminData').TopMseedUploader[];
  failureReasons?: import('./adminData').MseedFailureReason[];
  period: { from?: string; to?: string };
}

/**
 * Exporta los logs de cargas MiniSEED a Excel con múltiples hojas.
 */
export function exportMseedLogsExcel(input: MseedLogsExportInput) {
  const wb = XLSX.utils.book_new();
  const period = periodLabel(input.period);

  // Hoja 1: Logs detallados
  const logsSheet = XLSX.utils.aoa_to_sheet([
    safeRow(['Logs de Cargas MiniSEED', `Período: ${period}`]),
    [],
    safeRow(['Fecha/Hora', 'Usuario', 'Archivo', 'Tamaño (KB)', 'Éxito', 'Error', 'Estación', 'Duración (s)', 'Muestras', 'Tiempo Proc. (ms)']),
    ...input.logs.map(l => safeRow([
      fmt(l.uploaded_at),
      l.profiles?.full_name || l.profiles?.email || 'Usuario',
      l.filename,
      l.file_size_bytes ? Math.round(l.file_size_bytes / 1024) : '—',
      l.success ? 'Sí' : 'No',
      l.error_reason || '—',
      l.selected_station || '—',
      l.duration_seconds?.toFixed(2) || '—',
      l.final_sample_count || '—',
      l.processing_time_ms || '—',
    ])),
  ]);
  XLSX.utils.book_append_sheet(wb, logsSheet, 'Logs');

  // Hoja 2: Estadísticas por día (si existen)
  if (input.stats && input.stats.length > 0) {
    const statsSheet = XLSX.utils.aoa_to_sheet([
      safeRow(['Estadísticas Agregadas por Día']),
      [],
      safeRow(['Fecha', 'Total', 'Exitosas', 'Fallidas', 'Tasa Éxito %', 'Usuarios Únicos', 'Tiempo Prom. (ms)', 'MB Procesados']),
      ...input.stats.map(s => safeRow([
        s.upload_date,
        s.total_uploads,
        s.successful_uploads,
        s.failed_uploads,
        s.success_rate_pct.toFixed(2),
        s.unique_users,
        s.avg_processing_time_ms,
        (s.total_bytes_processed / (1024 * 1024)).toFixed(2),
      ])),
    ]);
    XLSX.utils.book_append_sheet(wb, statsSheet, 'Estadísticas');
  }

  // Hoja 3: Top usuarios (si existen)
  if (input.topUploaders && input.topUploaders.length > 0) {
    const topSheet = XLSX.utils.aoa_to_sheet([
      safeRow(['Top Usuarios por Cargas Exitosas']),
      [],
      safeRow(['Usuario', 'Email', 'Total Cargas', 'Exitosas', 'Fallidas', 'Tasa Éxito %', 'Duración Total (h)', 'Última Carga']),
      ...input.topUploaders.map(u => safeRow([
        u.user_name || 'Sin nombre',
        u.user_email,
        u.total_uploads,
        u.successful_uploads,
        u.failed_uploads,
        u.success_rate_pct.toFixed(2),
        u.total_duration_hours.toFixed(2),
        fmt(u.last_upload),
      ])),
    ]);
    XLSX.utils.book_append_sheet(wb, topSheet, 'Top Usuarios');
  }

  // Hoja 4: Razones de fallo (si existen)
  if (input.failureReasons && input.failureReasons.length > 0) {
    const failSheet = XLSX.utils.aoa_to_sheet([
      safeRow(['Razones de Fallo Más Frecuentes']),
      [],
      safeRow(['Razón', 'Cantidad', 'Porcentaje %', 'Ejemplo', 'Última Vez']),
      ...input.failureReasons.map(f => safeRow([
        f.error_reason,
        f.failure_count,
        f.percentage.toFixed(2),
        f.example_filename,
        fmt(f.last_occurrence),
      ])),
    ]);
    XLSX.utils.book_append_sheet(wb, failSheet, 'Fallos');
  }

  const fileName = `cargas_miniseed_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exporta los logs de cargas MiniSEED a PDF.
 */
export function exportMseedLogsPdf(input: MseedLogsExportInput) {
  const doc = new jsPDF();
  const margin = 14;
  let y = margin;

  // Helper para agregar nueva página si no hay espacio
  const checkPage = (needed: number) => {
    if (y + needed > 280) {
      doc.addPage();
      y = margin;
    }
  };

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text('Reporte de Cargas MiniSEED', margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.grayText);
  doc.text(`Período: ${periodLabel(input.period)}`, margin, y);
  y += 10;

  // Resumen general
  const totalLogs = input.logs.length;
  const successCount = input.logs.filter(l => l.success).length;
  const failCount = totalLogs - successCount;
  const successRate = totalLogs > 0 ? ((successCount / totalLogs) * 100).toFixed(1) : '0';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text('Resumen', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total de cargas: ${totalLogs}`, margin + 2, y);
  y += 5;
  doc.setTextColor(...PDF_COLORS.forest);
  doc.text(`Exitosas: ${successCount} (${successRate}%)`, margin + 2, y);
  y += 5;
  doc.setTextColor(...PDF_COLORS.terracotta);
  doc.text(`Fallidas: ${failCount}`, margin + 2, y);
  y += 10;

  // Top usuarios (si existen)
  if (input.topUploaders && input.topUploaders.length > 0) {
    checkPage(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text('Top Usuarios', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    input.topUploaders.slice(0, 10).forEach((u, i) => {
      checkPage(5);
      doc.setTextColor(...PDF_COLORS.grayText);
      doc.text(`${i + 1}. ${u.user_name || u.user_email}`, margin + 2, y);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(`${u.successful_uploads}/${u.total_uploads} exitosas`, 120, y);
      y += 5;
    });
    y += 5;
  }

  // Razones de fallo (si existen)
  if (input.failureReasons && input.failureReasons.length > 0) {
    checkPage(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text('Razones de Fallo', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    input.failureReasons.slice(0, 10).forEach((f, i) => {
      checkPage(5);
      doc.setTextColor(...PDF_COLORS.grayText);
      const reason = f.error_reason.length > 40 ? f.error_reason.slice(0, 37) + '...' : f.error_reason;
      doc.text(`${i + 1}. ${reason}`, margin + 2, y);
      doc.setTextColor(...PDF_COLORS.terracotta);
      doc.text(`${f.failure_count} (${f.percentage.toFixed(1)}%)`, 140, y);
      y += 5;
    });
    y += 5;
  }

  // Tabla de logs (solo últimos 50 para no sobrecargar el PDF)
  checkPage(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text('Logs Recientes', margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.grayText);
  doc.text('Fecha', margin, y);
  doc.text('Archivo', margin + 30, y);
  doc.text('Estado', margin + 90, y);
  doc.text('Error', margin + 110, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  input.logs.slice(0, 50).forEach(l => {
    checkPage(5);
    doc.setTextColor(...PDF_COLORS.ink);
    const date = l.uploaded_at ? new Date(l.uploaded_at).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }) : '—';
    doc.text(date, margin, y);
    
    const filename = l.filename.length > 25 ? l.filename.slice(0, 22) + '...' : l.filename;
    doc.text(filename, margin + 30, y);
    
    doc.setTextColor(...(l.success ? PDF_COLORS.forest : PDF_COLORS.terracotta));
    doc.text(l.success ? 'OK' : 'Error', margin + 90, y);
    
    if (!l.success && l.error_reason) {
      doc.setTextColor(...PDF_COLORS.grayText);
      const error = l.error_reason.length > 30 ? l.error_reason.slice(0, 27) + '...' : l.error_reason;
      doc.text(error, margin + 110, y);
    }
    y += 4;
  });

  const fileName = `cargas_miniseed_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
