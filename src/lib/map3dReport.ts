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
  latitude?: number;
  longitude?: number;
  distancia_epicentral_km: number;
  distancia_hipocentral_km: number;
  distancia_grados: number;
  azimut: number;
  tP: number | null;
  tS: number | null;
  tS_menos_tP: number | null;
}

/** Traza de una estación para el registro sísmico multi-estación. */
export interface Map3dTrace {
  code: string;
  /** Distancia epicentral (km) para ordenar de izquierda a derecha. */
  dist: number;
  t: number[];
  /** Componente vertical (o la que represente la traza). */
  values: number[];
  tP?: number | null;
  tS?: number | null;
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
  /** Sismograma triaxial de la estación seleccionada (opcional). */
  seismogram?: Map3dSeismogram | null;
  /** Trazas de todas las estaciones con señal (para el registro multi-estación). */
  traces?: Map3dTrace[];
  /** Estación seleccionada, para resaltarla en mapa y registro. */
  selectedStation?: string | null;
}

/** Qué secciones incluir en el reporte. */
export interface Map3dReportOptions {
  epicentro: boolean;
  parametros: boolean;
  tiemposViaje: boolean;
  /** Mini-mapa de vista superior con estaciones y epicentro. */
  mapa: boolean;
  /** Registro sísmico con las trazas de todas las estaciones. */
  registro: boolean;
  /** Sismograma triaxial de la estación seleccionada. */
  sismograma: boolean;
}

export const DEFAULT_MAP3D_OPTIONS: Map3dReportOptions = {
  epicentro: true,
  parametros: true,
  tiemposViaje: true,
  mapa: true,
  registro: true,
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

  // ── Mini-mapa de vista superior (estaciones + epicentro por lat/lon) ──
  const stationsWithCoords = data.stations.filter(s => s.latitude != null && s.longitude != null);
  if (opts.mapa && stationsWithCoords.length > 0) {
    section('Mapa de estaciones (vista superior)');
    const mapH = 78;
    if (y + mapH + 10 > 285) { doc.addPage(); y = MARGIN; }
    const mx = MARGIN, my = y, mw = CONTENT_W, mh = mapH;

    // Límites geográficos: estaciones + epicentro, con margen.
    const lats = [...stationsWithCoords.map(s => s.latitude!), data.epicenter.lat];
    const lons = [...stationsWithCoords.map(s => s.longitude!), data.epicenter.lon];
    let minLat = Math.min(...lats), maxLat = Math.max(...lats);
    let minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const padLat = Math.max((maxLat - minLat) * 0.15, 0.1);
    const padLon = Math.max((maxLon - minLon) * 0.15, 0.1);
    minLat -= padLat; maxLat += padLat; minLon -= padLon; maxLon += padLon;
    // Escala isométrica: usa la misma unidad en X e Y para no deformar.
    const spanLon = maxLon - minLon, spanLat = maxLat - minLat;
    const sc = Math.min(mw / spanLon, mh / spanLat);
    const offX = mx + (mw - spanLon * sc) / 2;
    const offY = my + (mh - spanLat * sc) / 2;
    const gx2 = (lon: number) => offX + (lon - minLon) * sc;
    const gy2 = (lat: number) => my + mh - (offY - my) - (lat - minLat) * sc;

    // Marco + fondo
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...COLORS.line); doc.setLineWidth(0.3);
    doc.rect(mx, my, mw, mh, 'FD');
    // Norte (flecha arriba-izquierda)
    doc.setFontSize(7); doc.setTextColor(...COLORS.muted); doc.setFont('helvetica', 'bold');
    doc.text('N ↑', mx + 3, my + 6);
    doc.setFont('helvetica', 'normal');

    // Estaciones (triángulos) con etiqueta
    for (const s of stationsWithCoords) {
      const px = gx2(s.longitude!), py = gy2(s.latitude!);
      const sel = s.code === data.selectedStation;
      doc.setFillColor(...(sel ? COLORS.gold : COLORS.primary));
      // Triángulo apuntando arriba
      doc.triangle(px, py - 2.2, px - 1.9, py + 1.6, px + 1.9, py + 1.6, 'F');
      doc.setFontSize(6); doc.setTextColor(...COLORS.text);
      doc.text(s.code, px + 2.5, py + 1.5);
    }
    // Epicentro (círculo con halo claro sólido, sin depender de opacidad/GState)
    const ex = gx2(data.epicenter.lon), ey = gy2(data.epicenter.lat);
    doc.setFillColor(240, 205, 195); doc.circle(ex, ey, 3, 'F');
    doc.setFillColor(...COLORS.primary); doc.circle(ex, ey, 1.4, 'F');
    doc.setFontSize(6.5); doc.setTextColor(...COLORS.primary); doc.setFont('helvetica', 'bold');
    doc.text('Epicentro', ex + 2.5, ey - 1.5);
    doc.setFont('helvetica', 'normal');

    y = my + mh + 4;
    doc.setFontSize(6.5); doc.setTextColor(...COLORS.muted);
    doc.text('▲ estaciones · ◉ epicentro · proyección equirectangular local (norte arriba).', MARGIN, y);
    y += 6;
  }

  // ── Registro sísmico multi-estación (réplica de la columna izquierda) ──
  const tracesForPlot = (data.traces ?? []).filter(t => t.t.length > 1 && t.values.length > 1);
  if (opts.registro && tracesForPlot.length > 0) {
    section('Registro sísmico por estación');
    const sorted = [...tracesForPlot].sort((a, b) => a.dist - b.dist);
    const plotH = 82;
    if (y + plotH + 12 > 285) { doc.addPage(); y = MARGIN; }
    const rx = MARGIN, ry = y, rw = CONTENT_W, rh = plotH;
    doc.setFillColor(15, 20, 32); doc.rect(rx, ry, rw, rh, 'F'); // fondo oscuro como en la app
    // Tiempo máximo global para escalar el eje Y (tiempo hacia abajo).
    let tMax = 1;
    for (const tr of sorted) tMax = Math.max(tMax, tr.t[tr.t.length - 1] || 0);
    const colW = rw / sorted.length;
    const padTop = 6, padBot = 8;
    const toY = (t: number) => ry + padTop + (t / tMax) * (rh - padTop - padBot);
    // Rejilla de tiempo cada 10 s
    doc.setDrawColor(60, 70, 90); doc.setLineWidth(0.15);
    doc.setFontSize(5.5); doc.setTextColor(150, 160, 175);
    for (let sec = 0; sec <= tMax; sec += 10) {
      const yy = toY(sec);
      doc.line(rx, yy, rx + rw, yy);
      doc.text(`${sec}s`, rx + 0.6, yy - 0.6);
    }
    // Trazas verticales
    sorted.forEach((tr, i) => {
      const cx = rx + colW * i + colW / 2;
      const sel = tr.code === data.selectedStation;
      // Eje de la traza
      doc.setDrawColor(70, 80, 100); doc.setLineWidth(0.15);
      doc.line(cx, ry + padTop, cx, ry + rh - padBot);
      // Amplitud normalizada -> desplazamiento horizontal
      let maxAbs = 1e-9;
      for (const v of tr.values) maxAbs = Math.max(maxAbs, Math.abs(v));
      const amp = colW * 0.42;
      doc.setDrawColor(sel ? 212 : 226, sel ? 168 : 232, sel ? 83 : 240); doc.setLineWidth(0.25);
      const step = Math.max(1, Math.floor(tr.values.length / 400));
      let prev: [number, number] | null = null;
      for (let k = 0; k < tr.values.length; k += step) {
        const cur: [number, number] = [cx + (tr.values[k] / maxAbs) * amp, toY(tr.t[k])];
        if (prev) doc.line(prev[0], prev[1], cur[0], cur[1]);
        prev = cur;
      }
      // Marcas P (verde) y S (cian)
      if (tr.tP != null && tr.tP > 0 && tr.tP <= tMax) {
        doc.setDrawColor(...COLORS.green); doc.setLineWidth(0.5);
        doc.line(cx - colW * 0.38, toY(tr.tP), cx + colW * 0.38, toY(tr.tP));
      }
      if (tr.tS != null && tr.tS > 0 && tr.tS <= tMax) {
        doc.setDrawColor(...COLORS.cyan); doc.setLineWidth(0.5);
        doc.line(cx - colW * 0.38, toY(tr.tS), cx + colW * 0.38, toY(tr.tS));
      }
      // Etiqueta de estación
      doc.setFontSize(5.5); doc.setTextColor(sel ? 212 : 220, sel ? 168 : 226, sel ? 83 : 232);
      doc.setFont('helvetica', 'bold');
      doc.text(tr.code, cx, ry + rh - 2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    });
    y = ry + rh + 4;
    doc.setFontSize(6.5); doc.setTextColor(...COLORS.muted);
    doc.text('Estaciones ordenadas por distancia epicentral. Marcas: P (verde), S (cian). Amplitud normalizada por traza.', MARGIN, y);
    y += 6;
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

  if (opts.registro && data.traces && data.traces.length > 0) {
    lines.push('# REGISTRO SISMICO POR ESTACION (componente vertical)');
    const sorted = [...data.traces].filter(t => t.t.length > 1).sort((a, b) => a.dist - b.dist);
    // Marcas P/S por estación
    lines.push('estacion,dist_epicentral_km,tP_s,tS_s');
    for (const tr of sorted) {
      lines.push(`${esc(tr.code)},${tr.dist},${tr.tP ?? ''},${tr.tS ?? ''}`);
    }
    lines.push('');
    // Series (una columna por estación, muestreadas a ~600 puntos comunes)
    lines.push('# SERIES (vertical, normalizada por estacion)');
    lines.push(['tiempo_s', ...sorted.map(t => esc(t.code))].join(','));
    const tMax = Math.max(...sorted.map(t => t.t[t.t.length - 1] || 0), 1);
    const N = 600;
    // Precalcular máximos para normalizar.
    const maxAbs = sorted.map(t => t.values.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9));
    for (let k = 0; k <= N; k++) {
      const tt = (k / N) * tMax;
      const row = [tt.toFixed(3)];
      sorted.forEach((tr, si) => {
        // Índice más cercano en el tiempo de esa traza.
        const idx = Math.min(tr.t.length - 1, Math.round((tt / (tr.t[tr.t.length - 1] || 1)) * (tr.t.length - 1)));
        const v = tr.values[idx] ?? 0;
        row.push((v / maxAbs[si]).toFixed(4));
      });
      lines.push(row.join(','));
    }
    lines.push('');
  }

  if (opts.sismograma && data.seismogram && data.seismogram.t.length > 1) {
    const sg = data.seismogram;
    lines.push(`# SISMOGRAMA TRIAXIAL · ESTACION ${sg.station}`);
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
