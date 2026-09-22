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
    ...users.map(u => [u.full_name || '—', u.email, u.role === 'admin' ? 'Administrador' : 'Investigador', u.institution || '—', u.occupation || '—', u.research_area || '—', u.city || '—', u.country || '—', u.usage_purpose || '—', u.active ? 'Activo' : 'Inactivo', fmt(u.created_at), fmt(u.last_login)]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(usuarios), 'Usuarios');

  const sims = [
    ['Fecha', 'Título', 'Usuario', 'Email', 'Fuente', 'Magnitud', 'Profundidad (km)', 'Vp', 'Vs', 'Densidad', 'Frec. dominante (Hz)', 'tP (s)', 'tS (s)'],
    ...reports.map(r => {
      const p = r.params as Record<string, number | string>;
      const res = r.results as Record<string, number>;
      return [
        fmt(r.created_at), r.title, r.profiles?.full_name || '—', r.profiles?.email || '—',
        p.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica', p.magnitude, p.depth, p.vp, p.vs, p.density,
        res.dominantFrequency != null ? Number(res.dominantFrequency.toFixed(2)) : '—',
        res.pArrival != null ? Number(res.pArrival.toFixed(2)) : '—',
        res.sArrival != null ? Number(res.sArrival.toFixed(2)) : '—',
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sims), 'Simulaciones');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `sismonarino_reporte_admin_${stamp}.xlsx`);
}

/** Descarga el reporte administrativo como PDF. */
export function exportAdminPdf(input: AdminReportInput): void {
  const { stats, users, reports, period } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 15;
  const W = 210 - M * 2;
  let y = M;

  doc.setFillColor(107, 91, 149);
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

  heading('Simulaciones por mes');
  const byMonth = simulationsByMonth(reports);
  table(['Mes', 'Simulaciones'], byMonth.length ? byMonth.map(m => [m.month, m.count]) : [['—', 0]], [60, 40]);

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
