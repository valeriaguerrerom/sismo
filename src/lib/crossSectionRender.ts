/**
 * Renderizador ÚNICO del corte del subsuelo (pantalla y PDF).
 *
 * `drawCrossSection` dibuja un fotograma del campo sobre cualquier contexto 2D
 * (el canvas en pantalla o un canvas offscreen para el PDF), de modo que ambos
 * usan exactamente el mismo render. Dibuja el dominio como un rectángulo con
 * ejes en km respetando la proporción real, la superficie libre, la zona
 * absorbente sombreada, la fuente/estación en sus posiciones reales, los
 * frentes teóricos P y S recortados al dominio, y usa la paleta del sitio sobre
 * fondo claro con escala GLOBAL por defecto.
 *
 * @module lib/crossSectionRender
 */
import { WavefieldSnapshot, GridInfo } from './types';

const CREMA: [number, number, number] = [250, 246, 240];
const TERRACOTA: [number, number, number] = [196, 85, 58];
const TERRACOTA_OSC: [number, number, number] = [122, 42, 28];
const VERDE: [number, number, number] = [45, 106, 79];

function lerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

export type CrossLayer = 'ux' | 'uz' | 'mag';
export type CrossScaleMode = 'global' | 'frame';

/** Color de una muestra según la capa (magnitud secuencial, componente divergente). */
function colorFor(val: number, peak: number, layer: CrossLayer): [number, number, number] {
  const n = Math.max(-1, Math.min(1, val / (peak + 1e-30)));
  if (layer === 'mag') {
    const t = Math.pow(Math.min(Math.abs(n), 1), 0.6);
    return t < 0.5 ? lerp(CREMA, TERRACOTA, t / 0.5) : lerp(TERRACOTA, TERRACOTA_OSC, (t - 0.5) / 0.5);
  }
  const t = Math.sign(n) * Math.pow(Math.abs(n), 0.6);
  return t < 0 ? lerp(CREMA, TERRACOTA, -t) : lerp(CREMA, VERDE, t);
}

/** Marcas de eje en valores redondos dentro de [0, max]. */
export function niceTicks(max: number, target: number): number[] {
  if (!(max > 0)) return [0];
  const raw = max / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v * 10) / 10);
  return ticks;
}

/** Etiqueta y desplazamiento de capa dentro del Float32Array [ux|uz|mag]. */
const LAYER_OFFSET: Record<CrossLayer, number> = { ux: 0, uz: 1, mag: 2 };

export interface CrossSectionDrawOpts {
  ctx: CanvasRenderingContext2D;
  /** Ancho y alto en px del área de dibujo del contexto. */
  width: number;
  height: number;
  snapshot: WavefieldSnapshot;
  gridInfo: GridInfo;   // sub-grid (nx, nz y posiciones fuente/receptor)
  fullGrid: GridInfo;   // grid completo (dx real, nx, nz) para la escala física
  vp: number;
  vs: number;
  layer: CrossLayer;
  scaleMode: CrossScaleMode;
  /** Pico global (máx |valor| de la capa activa sobre todos los fotogramas). */
  globalPeak: number;
  absThick?: number;
  /** Escala tipográfica extra (para el PDF de alta resolución). */
  fontScale?: number;
  /**
   * Retardo del pico del pulso de la fuente Ricker, t0 (s). Los frentes
   * teóricos empiezan a expandirse desde t0 (no desde 0), porque la energía
   * sale de la fuente cuando el pulso alcanza su máximo. Radio = V·(t − t0).
   */
  sourceDelay?: number;
  /**
   * Índice Z de la interfaz de capas en el grid del corte (0 = homogéneo). Si
   * es > 0 se dibuja una línea horizontal en esa profundidad con los nombres
   * de las capas (modelo de dos capas).
   */
  interfaceZ?: number;
  /** Nombre de la capa superficial (p. ej. "Depósitos"). */
  layerTopName?: string;
  /** Nombre del semiespacio (p. ej. "Roca"). */
  layerBottomName?: string;
}

/**
 * Dibuja el corte del subsuelo en el contexto dado. Respeta la proporción real
 * del dominio: el área de trazado se centra con la misma escala km/px en X y Z.
 */
export function drawCrossSection(opts: CrossSectionDrawOpts): void {
  const { ctx, width: W, height: H, snapshot, gridInfo, fullGrid, vp, vs, layer, scaleMode, globalPeak, absThick = 44 } = opts;
  const { nx, nz } = gridInfo;
  const size = nx * nz;
  const domainWkm = (fullGrid.nx * fullGrid.dx) / 1000;
  const domainHkm = (fullGrid.nz * fullGrid.dx) / 1000;

  const scale = (W / 1000) * (opts.fontScale ?? 1);
  // Piso de 13px: todo el texto del corte (ejes, etiquetas, "Superficie libre",
  // "Fuente", "Estación") se dibuja a ≥13px, en pantalla y en el PDF.
  const fs = (px: number) => Math.max(13, px) * (W / 1000) * (opts.fontScale ?? 1);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#FAFAF8';
  ctx.fillRect(0, 0, W, H);

  // Márgenes (dejan sitio a los ejes y etiquetas ≥12px).
  const mL = 74 * scale, mR = 18 * scale, mT = 30 * scale, mB = 58 * scale;
  const availW = W - mL - mR, availH = H - mT - mB;
  // Proporción real: misma escala km/px en ambos ejes.
  const kmPerPx = Math.max(domainWkm / availW, domainHkm / availH);
  const plotW = domainWkm / kmPerPx;
  const plotH = domainHkm / kmPerPx;
  const x0 = mL + (availW - plotW) / 2;
  const y0 = mT + (availH - plotH) / 2;

  // Pico según el modo de escala.
  const off = LAYER_OFFSET[layer] * size;
  let peak: number;
  if (scaleMode === 'global') {
    peak = globalPeak * 0.5 + 1e-30;
  } else {
    let fp = 1e-30;
    for (let k = 0; k < size; k++) { const a = Math.abs(snapshot.field[off + k]); if (a > fp) fp = a; }
    peak = fp * 0.5 + 1e-30;
  }

  // Campo → ImageData a resolución nativa, escalado con interpolación suave.
  const img = ctx.createImageData(nx, nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const v = snapshot.field[off + i * nz + j];
      const [r, g, b] = colorFor(v, peak, layer);
      const p = (j * nx + i) * 4;
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = nx; tmp.height = nz;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, nx, nz, x0, y0, plotW, plotH);

  // Zona absorbente sombreada.
  const aw = (absThick / fullGrid.nx) * plotW, ah = (absThick / fullGrid.nz) * plotH;
  ctx.fillStyle = 'rgba(120,113,108,0.30)';
  ctx.fillRect(x0, y0, aw, plotH);
  ctx.fillRect(x0 + plotW - aw, y0, aw, plotH);
  ctx.fillRect(x0, y0 + plotH - ah, plotW, ah);
  ctx.strokeStyle = 'rgba(120,113,108,0.55)';
  ctx.setLineDash([4 * scale, 3 * scale]); ctx.lineWidth = 1;
  ctx.strokeRect(x0 + aw, y0, plotW - 2 * aw, plotH - ah);
  ctx.setLineDash([]);

  // Marco del dominio.
  ctx.strokeStyle = '#D6D3D1'; ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, plotW, plotH);

  // ── Interfaz entre capas (modelo de dos capas) ──
  // Línea horizontal punteada a la profundidad de la interfaz, con los nombres
  // de las capas a cada lado. Se dibuja antes de fuente/estación y frentes.
  const ifaceZ = opts.interfaceZ ?? 0;
  if (ifaceZ > 0 && ifaceZ < nz - 1) {
    const iy = y0 + (ifaceZ / (nz - 1)) * plotH;
    ctx.save();
    ctx.strokeStyle = '#1A1A2E'; ctx.lineWidth = 1.6 * scale;
    ctx.setLineDash([7 * scale, 4 * scale]);
    ctx.beginPath(); ctx.moveTo(x0, iy); ctx.lineTo(x0 + plotW, iy); ctx.stroke();
    ctx.setLineDash([]);
    // Nombres de las capas (con halo blanco para leerse sobre el mapa).
    const topName = opts.layerTopName ?? 'Capa superficial';
    const botName = opts.layerBottomName ?? 'Semiespacio (roca)';
    ctx.font = `bold ${fs(12)}px sans-serif`; ctx.textAlign = 'left';
    const drawHalo = (text: string, lx: number, ly: number) => {
      ctx.lineWidth = 3 * scale; ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(text, lx, ly);
      ctx.fillStyle = '#1A1A2E'; ctx.fillText(text, lx, ly);
    };
    // "Capa superficial" arriba de la línea (si hay hueco) y "roca" debajo.
    drawHalo(topName, x0 + plotW - 4 * scale - ctx.measureText(topName).width, iy - 4 * scale);
    drawHalo(botName, x0 + plotW - 4 * scale - ctx.measureText(botName).width, iy + fs(12) + 2 * scale);
    ctx.restore();
  }

  const srcFx = gridInfo.sourceX / (nx - 1), srcFz = gridInfo.sourceZ / (nz - 1);
  const recFx = gridInfo.receiverX / (nx - 1), recFz = gridInfo.receiverZ / (nz - 1);
  const sx = x0 + srcFx * plotW, sz = y0 + srcFz * plotH;
  const rx = x0 + recFx * plotW, rz = y0 + recFz * plotH;

  // Frentes teóricos P y S, RECORTADOS al rectángulo del dominio. El frente
  // parte del instante en que el pulso de la fuente alcanza su pico (t0), no
  // de t=0: radio = V·(t − t0). Antes de t0 no hay frente (energía aún no sale).
  const t = snapshot.time;
  const t0 = opts.sourceDelay ?? 0;
  const tEff = Math.max(0, t - t0);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, plotW, plotH); ctx.clip();
  const front = (radiusKm: number, letter: string) => {
    if (radiusKm <= 0) return;
    const rpx = radiusKm / kmPerPx; // misma escala en X y Z ⇒ círculo real
    ctx.strokeStyle = 'rgba(87,83,78,0.8)';
    ctx.setLineDash([3 * scale, 3 * scale]); ctx.lineWidth = 1.4 * scale;
    ctx.beginPath(); ctx.arc(sx, sz, rpx, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const lx = sx + rpx * 0.7, ly = sz - rpx * 0.7;
    if (lx > x0 && lx < x0 + plotW && ly > y0 && ly < y0 + plotH) {
      ctx.fillStyle = '#57534E'; ctx.font = `bold ${fs(13)}px sans-serif`; ctx.fillText(letter, lx, ly);
    }
  };
  front(vs * tEff / 1000, 'S');
  front(vp * tEff / 1000, 'P');
  ctx.restore();

  // Superficie libre (borde superior).
  ctx.strokeStyle = '#1A1A2E'; ctx.lineWidth = 2.5 * scale;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + plotW, y0); ctx.stroke();

  // Fuente (estrella terracota) y estación (triángulo verde).
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 === 0 ? 9 * scale : 4 * scale; const px = sx + Math.cos(a) * rr, py = sz + Math.sin(a) * rr; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fillStyle = '#C4553A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * scale; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx, rz - 9 * scale); ctx.lineTo(rx - 8 * scale, rz + 5 * scale); ctx.lineTo(rx + 8 * scale, rz + 5 * scale); ctx.closePath();
  ctx.fillStyle = '#2D6A4F'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * scale; ctx.fill(); ctx.stroke();

  // Etiquetas de fuente y estación (texto ≥13px). Se dibujan con un halo blanco
  // para leerse sobre el mapa de calor. "Estación" va DEBAJO del triángulo (la
  // estación está en la superficie, arriba) para no chocar con "Superficie libre".
  // Rótulo con CHIP blanco semitransparente detrás (no solo halo): así las
  // líneas de la cuadrícula o de los frentes no cruzan el texto. Respeta el
  // textAlign actual (center para Fuente/Estación, left para Superficie libre).
  const labelChip = (text: string, lx: number, ly: number) => {
    const fh = fs(13);
    const tw = ctx.measureText(text).width;
    const align = ctx.textAlign;
    let bx = lx - tw / 2;
    if (align === 'left' || align === 'start') bx = lx;
    else if (align === 'right' || align === 'end') bx = lx - tw;
    const padX = 3 * scale, padY = 2 * scale;
    const rx0 = bx - padX, ry0 = ly - fh * 0.80 - padY;
    const rw = tw + padX * 2, rh = fh * 1.05 + padY * 2, rr = 3 * scale;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.beginPath();
    ctx.moveTo(rx0 + rr, ry0);
    ctx.arcTo(rx0 + rw, ry0, rx0 + rw, ry0 + rh, rr);
    ctx.arcTo(rx0 + rw, ry0 + rh, rx0, ry0 + rh, rr);
    ctx.arcTo(rx0, ry0 + rh, rx0, ry0, rr);
    ctx.arcTo(rx0, ry0, rx0 + rw, ry0, rr);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1A1A2E'; ctx.fillText(text, lx, ly);
  };
  ctx.font = `bold ${fs(13)}px sans-serif`; ctx.textAlign = 'center';
  labelChip('Fuente', sx, sz + 22 * scale);
  labelChip('Estación', rx, rz + 20 * scale);
  ctx.textAlign = 'start';

  // Ejes en km (texto ≥13px).
  ctx.fillStyle = '#57534E'; ctx.font = `${fs(13)}px sans-serif`;
  ctx.textAlign = 'center';
  for (const tk of niceTicks(domainWkm, 6)) {
    const px = x0 + (tk / domainWkm) * plotW;
    ctx.strokeStyle = '#EEEBE8'; ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + plotH); ctx.stroke();
    ctx.fillText(`${tk}`, px, y0 + plotH + 18 * scale);
  }
  ctx.fillText('Distancia horizontal (km)', x0 + plotW / 2, y0 + plotH + 36 * scale);
  ctx.textAlign = 'right';
  for (const tk of niceTicks(domainHkm, 5)) {
    const py = y0 + (tk / domainHkm) * plotH;
    ctx.strokeStyle = '#EEEBE8'; ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x0 + plotW, py); ctx.stroke();
    ctx.fillText(`${tk}`, x0 - 7 * scale, py + fs(13) * 0.35);
  }
  ctx.save();
  ctx.translate(18 * scale, y0 + plotH / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#57534E'; ctx.font = `${fs(13)}px sans-serif`;
  ctx.fillText('Profundidad (km)', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.font = `bold ${fs(13)}px sans-serif`;
  labelChip('Superficie libre', x0 + 5 * scale, y0 - 9 * scale);
}

/**
 * Calcula el pico global de una capa (máx |valor|) sobre todos los fotogramas.
 * Para 'mag' recorre la magnitud reconstruida; para componentes, su columna.
 */
export function computeGlobalPeak(snapshots: WavefieldSnapshot[], layer: CrossLayer): number {
  let peak = 1e-30;
  for (const s of snapshots) {
    const size = s.nx * s.nz;
    const off = LAYER_OFFSET[layer] * size;
    for (let k = 0; k < size; k++) { const a = Math.abs(s.field[off + k]); if (a > peak) peak = a; }
  }
  return peak;
}

export interface CrossSectionRenderOpts {
  snapshot: WavefieldSnapshot;
  gridInfo: GridInfo;
  fullGrid: GridInfo;
  vp: number;
  vs: number;
  layer?: CrossLayer;
  scaleMode?: CrossScaleMode;
  globalPeak: number;
  absThick?: number;
  widthPx?: number;
  /** Retardo del pico del pulso (t0, s): los frentes parten en t0. */
  sourceDelay?: number;
  /**
   * Escala tipográfica extra. En el PDF, donde el fotograma se imprime a pocos
   * cm, hay que subirla para que el texto llegue a ≥7 pt en la página. El
   * constructor del PDF la calcula a partir del ancho impreso del fotograma.
   */
  fontScale?: number;
  /** Índice Z de la interfaz de capas (0 = homogéneo). */
  interfaceZ?: number;
  /** Nombre de la capa superficial. */
  layerTopName?: string;
  /** Nombre del semiespacio. */
  layerBottomName?: string;
}

/**
 * Renderiza un fotograma del corte a un PNG (data URL) usando EXACTAMENTE el
 * mismo dibujo que la pantalla (drawCrossSection). Para el PDF.
 */
export function renderCrossSectionPng(opts: CrossSectionRenderOpts): string {
  const { snapshot, gridInfo, fullGrid, vp, vs, globalPeak, absThick = 44, widthPx = 1000 } = opts;
  const domainWkm = (fullGrid.nx * fullGrid.dx) / 1000;
  const domainHkm = (fullGrid.nz * fullGrid.dx) / 1000;
  const W = widthPx;
  // Alto para que el plot mantenga proporción + espacio de ejes.
  const H = Math.round(W * (domainHkm / domainWkm) * 0.82 + 90);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  drawCrossSection({
    ctx, width: W, height: H, snapshot, gridInfo, fullGrid, vp, vs,
    layer: opts.layer ?? 'mag', scaleMode: opts.scaleMode ?? 'global',
    globalPeak, absThick, sourceDelay: opts.sourceDelay ?? 0,
    fontScale: opts.fontScale ?? 1,
    interfaceZ: opts.interfaceZ ?? 0,
    layerTopName: opts.layerTopName,
    layerBottomName: opts.layerBottomName,
  });
  return canvas.toDataURL('image/png');
}

/**
 * Escala tipográfica para que el texto del corte llegue a ≥ `minPt` puntos
 * cuando el fotograma se imprime con ancho `imgWidthMm` en el PDF.
 *
 * El texto base se dibuja a 13 px lógicos en un lienzo de `canvasW` px; sobre la
 * página ese lienzo mide `imgWidthMm`. La altura impresa (mm) del texto es
 * 13·fontScale/1000·imgWidthMm; despejando para `minPt` (7 pt ≈ 2.47 mm).
 */
export function fontScaleForPdf(imgWidthMm: number, minPt = 7, canvasW = 1000): number {
  const minMm = (minPt / 72) * 25.4;
  const needed = (minMm * canvasW) / (13 * Math.max(imgWidthMm, 1));
  return Math.max(1, needed);
}
