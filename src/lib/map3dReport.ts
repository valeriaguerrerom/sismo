/**
 * Reportes del "Mapa 3D": PDF (jsPDF) y CSV con secciones opcionales.
 *
 * Empaqueta lo que el usuario ve en el Mapa 3D — epicentro, tiempos de viaje
 * P/S por estación, parámetros del medio y (opcional) el sismograma de la
 * estación seleccionada — en un documento descargable. El usuario elige qué
 * secciones incluir. Todo el cálculo ya viene resuelto del backend; este módulo
 * solo formatea.
 *
 * Se guarda en `simulation_reports` con `results.report_type = 'map3d'` para
 * que "Mis Reportes" sepa que debe regenerarlo con este módulo (y no con el de
 * simulación).
 *
 * @module map3dReport
 */
import { jsPDF } from 'jspdf';

// ─── Tipos de datos del reporte ───

/** Una fila de tiempos de viaje por estación (subconjunto de StationTravelTime). */
export interface Map3dStationRow {
  code: string;
  name: string;
  approx: boolean;
  distancia_epicentral_km: number;
  distancia_hipocentral_km: number;
  distancia_grados: number;
  azimut: number;
  tP: number | null;
  tS: number | null;
  tS_menos_tP: number | null;
}

/** Sismograma triaxial de una estación (para la sección opcional). */
export interface Map3dSeismogram {
  station: string;
  t: number[];
  north: number[];
  east: number[];
  vertical: number[];
  tP?: number | null;
  tS?: number | null;
}

/** Datos completos del reporte del Mapa 3D. */
export interface Map3dReportData {
  title: string;
  author?: string;
  createdAt?: string | Date;
  /** Nombre/fecha del evento del catálogo, si se cargó uno. */
  eventLabel?: string | null;
  epicenter: { lat: number; lon: number; depthKm: number };
  magnitude: number;
  sourceType: 'tectonic' | 'volcanic';
  model: string; // 'homogeneous' | 'iasp91'
  medium: { vp: number; vs: number; density: number }; // vp/vs en km/s
  stations: Map3dStationRow[];
  /** Sismograma de la estación seleccionada (opcional). */
  seismogram?: Map3dSeismogram | null;
}

/** Qué secciones incluir en el reporte. */
export interface Map3dReportOptions {
  epicentro: boolean;
  parametros: boolean;
  tiemposViaje: boolean;
  sismograma: boolean;
}

export const DEFAULT_MAP3D_OPTIONS: Map3dReportOptions = {
  epicentro: true,
  parametros: true,
  tiemposViaje: true,
  sismograma: false,
};

// ─── Estilo (coherente con reportPdf.ts) ───

const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COLORS = {
  primary: [196, 85, 58] as [number, number, number],
  green: [45, 106, 79] as [number, number, number],
  gold: [212, 168, 83] as [number, number, number],
  cyan: [34, 211, 238] as [number, number, number],
  text: [26, 26, 46] as [number, number, number],
  muted: [120, 113, 108] as [number, number, number],
  line: [214, 211, 209] as [number, number, number],
};

function fmtDate(d?: string | Date): string {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

const modelLabel = (m: string) => (m === 'iasp91' ? 'IASP91 (Tierra estratificada)' : 'Homogéneo (medio constante)');

// ─── PDF ───

/** Construye el PDF del reporte del Mapa 3D con las secciones elegidas. */
export function buildMap3dPdf(data: Map3dReportData, opts: Map3dReportOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // Encabezado
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_W, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SismoNariño — Reporte del Mapa 3D', MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Propagación de ondas y tiempos de viaje · Universidad Mariana · Nariño, Colombia', MARGIN, 16);
  y = 30;

  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(data.title, MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Generado: ${fmtDate(data.createdAt)}${data.author ? `  ·  Autor: ${data.author}` : ''}`,
    MARGIN, y,
  );
  y += 8;

  const section = (label: string) => {
    if (y > 265) { doc.addPage(); y = MARGIN; }
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

  // ── Epicentro / evento ──
  if (opts.epicentro) {
    section('Epicentro y fuente');
    const rows: [string, string][] = [
      ['Latitud', `${data.epicenter.lat.toFixed(4)}°`],
      ['Longitud', `${data.epicenter.lon.toFixed(4)}°`],
      ['Profundidad', `${data.epicenter.depthKm} km`],
      ['Magnitud', `${data.magnitude.toFixed(1)}`],
      ['Tipo de fuente', data.sourceType === 'volcanic' ? 'Volcánica' : 'Tectónica'],
      ['Modelo de tiempos', modelLabel(data.model)],
    ];
    if (data.eventLabel) rows.unshift(['Evento', data.eventLabel]);
    kv(rows);
  }

  // ── Parámetros del medio ──
  if (opts.parametros) {
    section('Parámetros del medio');
    kv([
      ['Vp', `${data.medium.vp} km/s`],
      ['Vs', `${data.medium.vs} km/s`],
      ['Densidad', `${data.medium.density} kg/m³`],
      ['Vp/Vs', (data.medium.vp / data.medium.vs).toFixed(2)],
    ]);
  }

  // ── Tabla de tiempos de viaje por estación ──
  if (opts.tiemposViaje && data.stations.length > 0) {
    section('Tiempos de viaje por estación');
    const cols = [
      { h: 'Estación', w: 26 },
      { h: 'Dist. epi (km)', w: 28 },
      { h: 'Dist. hipo (km)', w: 30 },
      { h: 'Azimut (°)', w: 24 },
      { h: 'tP (s)', w: 22 },
      { h: 'tS (s)', w: 22 },
      { h: 'S−P (s)', w: 22 },
    ];
    // Cabecera
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    let cx = MARGIN;
    for (const c of cols) { doc.text(c.h, cx, y); cx += c.w; }
    y += 1.5;
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 4;
    // Filas
    doc.setFont('helvetica', 'normal');
    for (const s of data.stations) {
      if (y > 280) { doc.addPage(); y = MARGIN; }
      const vals = [
        s.code + (s.approx ? ' ~' : ''),
        s.distancia_epicentral_km.toFixed(1),
        s.distancia_hipocentral_km.toFixed(1),
        s.azimut.toFixed(1),
        s.tP != null ? s.tP.toFixed(2) : '—',
        s.tS != null ? s.tS.toFixed(2) : '—',
        s.tS_menos_tP != null ? s.tS_menos_tP.toFixed(2) : '—',
      ];
      cx = MARGIN;
      vals.forEach((v, i) => {
        doc.setTextColor(...(i === 0 ? COLORS.text : COLORS.muted));
        doc.text(v, cx, y);
        cx += cols[i].w;
      });
      y += 4.5;
    }
    y += 3;
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.muted);
    doc.text('~ ubicación aproximada (pendiente de confirmación SGC).', MARGIN, y);
    y += 6;
  }

  // ── Sismograma de la estación seleccionada ──
  if (opts.sismograma && data.seismogram && data.seismogram.t.length > 1) {
    section(`Sismograma triaxial · Estación ${data.seismogram.station}`);
    const sg = data.seismogram;
    const traceH = 24, gap = 7;
    const traces: [number[], [number, number, number], string][] = [
      [sg.north, COLORS.green, 'Norte (N)'],
      [sg.east, COLORS.primary, 'Este (E)'],
      [sg.vertical, COLORS.gold, 'Vertical (Z)'],
    ];
    const tMax = sg.t[sg.t.length - 1] || 1;
    for (const [vals, color, label] of traces) {
      if (y + traceH + gap > 285) { doc.addPage(); y = MARGIN; }
      // Marco
      doc.setDrawColor(...COLORS.line); doc.setLineWidth(0.2);
      doc.rect(MARGIN, y, CONTENT_W, traceH);
      doc.setDrawColor(230, 228, 225);
      doc.line(MARGIN, y + traceH / 2, MARGIN + CONTENT_W, y + traceH / 2);
      // Escalas
      let maxAbs = 1e-9;
      for (const v of vals) maxAbs = Math.max(maxAbs, Math.abs(v));
      const px = (t: number) => MARGIN + (t / tMax) * CONTENT_W;
      const py = (v: number) => y + traceH / 2 - (v / maxAbs) * (traceH / 2 - 2);
      // Marcas P/S
      const marker = (t: number | null | undefined, c: [number, number, number]) => {
        if (t == null || t <= 0 || t > tMax) return;
        doc.setDrawColor(...c); doc.setLineDashPattern([1, 1], 0);
        doc.line(px(t), y, px(t), y + traceH); doc.setLineDashPattern([], 0);
      };
      marker(sg.tP, COLORS.green);
      marker(sg.tS, COLORS.cyan);
      // Traza (submuestreada a ~600 puntos)
      doc.setDrawColor(...color); doc.setLineWidth(0.3);
      const step = Math.max(1, Math.floor(vals.length / 600));
      let prev: [number, number] | null = null;
      for (let i = 0; i < vals.length; i += step) {
        const cur: [number, number] = [px(sg.t[i]), py(vals[i])];
        if (prev) doc.line(prev[0], prev[1], cur[0], cur[1]);
        prev = cur;
      }
      // Etiqueta
      doc.setFontSize(8); doc.setTextColor(...color); doc.setFont('helvetica', 'bold');
      doc.text(label, MARGIN + 1.5, y + 3.5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLORS.muted); doc.setFontSize(6.5);
      doc.text('0 s', MARGIN, y + traceH + 3);
      doc.text(`${tMax.toFixed(0)} s`, MARGIN + CONTENT_W, y + traceH + 3, { align: 'right' });
      y += traceH + gap;
    }
    doc.setFontSize(7); doc.setTextColor(...COLORS.muted);
    doc.text('Líneas punteadas: arribo P (verde) y S (cian). Amplitud normalizada por traza.', MARGIN, y);
    y += 6;
  }

  // Pie de página
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text('SismoNariño · Mapa 3D · Valeria Guerrero & Luisa Basante · Universidad Mariana (2026)', MARGIN, 292);
    doc.text(`Página ${p} de ${pages}`, PAGE_W - MARGIN, 292, { align: 'right' });
  }

  return doc;
}

/** Genera y descarga el PDF del reporte del Mapa 3D. */
export function downloadMap3dPdf(data: Map3dReportData, opts: Map3dReportOptions): void {
  const doc = buildMap3dPdf(data, opts);
  const safe = data.title.replace(/[^\w-]+/g, '_').slice(0, 60);
  doc.save(`mapa3d_${safe}.pdf`);
}

// ─── CSV ───

/** Construye el contenido CSV del reporte con las secciones elegidas. */
export function buildMap3dCsv(data: Map3dReportData, opts: Map3dReportOptions): string {
  const lines: string[] = [];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  lines.push(`# SismoNariño — Reporte del Mapa 3D`);
  lines.push(`# ${data.title}`);
  lines.push(`# Generado: ${fmtDate(data.createdAt)}${data.author ? ` · Autor: ${data.author}` : ''}`);
  lines.push('');

  if (opts.epicentro) {
    lines.push('# EPICENTRO Y FUENTE');
    lines.push('campo,valor');
    if (data.eventLabel) lines.push(`evento,${esc(data.eventLabel)}`);
    lines.push(`latitud,${data.epicenter.lat}`);
    lines.push(`longitud,${data.epicenter.lon}`);
    lines.push(`profundidad_km,${data.epicenter.depthKm}`);
    lines.push(`magnitud,${data.magnitude}`);
    lines.push(`tipo_fuente,${data.sourceType === 'volcanic' ? 'volcanica' : 'tectonica'}`);
    lines.push(`modelo_tiempos,${data.model}`);
    lines.push('');
  }

  if (opts.parametros) {
    lines.push('# PARAMETROS DEL MEDIO');
    lines.push('campo,valor');
    lines.push(`vp_km_s,${data.medium.vp}`);
    lines.push(`vs_km_s,${data.medium.vs}`);
    lines.push(`densidad_kg_m3,${data.medium.density}`);
    lines.push(`vp_vs,${(data.medium.vp / data.medium.vs).toFixed(3)}`);
    lines.push('');
  }

  if (opts.tiemposViaje && data.stations.length > 0) {
    lines.push('# TIEMPOS DE VIAJE POR ESTACION');
    lines.push('estacion,nombre,aproximada,dist_epicentral_km,dist_hipocentral_km,dist_grados,azimut_grados,tP_s,tS_s,tS_menos_tP_s');
    for (const s of data.stations) {
      lines.push([
        esc(s.code), esc(s.name), s.approx ? 'si' : 'no',
        s.distancia_epicentral_km, s.distancia_hipocentral_km, s.distancia_grados, s.azimut,
        s.tP ?? '', s.tS ?? '', s.tS_menos_tP ?? '',
      ].join(','));
    }
    lines.push('');
  }

  if (opts.sismograma && data.seismogram && data.seismogram.t.length > 1) {
    const sg = data.seismogram;
    lines.push(`# SISMOGRAMA · ESTACION ${sg.station}`);
    lines.push('tiempo_s,norte,este,vertical');
    // Submuestrear a ~1000 puntos para que el CSV no sea gigante.
    const step = Math.max(1, Math.floor(sg.t.length / 1000));
    for (let i = 0; i < sg.t.length; i += step) {
      lines.push(`${sg.t[i]},${sg.north[i] ?? ''},${sg.east[i] ?? ''},${sg.vertical[i] ?? ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Genera y descarga el CSV del reporte del Mapa 3D. */
export function downloadMap3dCsv(data: Map3dReportData, opts: Map3dReportOptions): void {
  const csv = buildMap3dCsv(data, opts);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mapa3d_${data.title.replace(/[^\w-]+/g, '_').slice(0, 60)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
