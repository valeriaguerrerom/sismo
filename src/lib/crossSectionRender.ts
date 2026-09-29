/**
 * Renderizado del corte del subsuelo a un PNG (data URL) para el PDF.
 *
 * Dibuja un fotograma del campo (capa magnitud) en un corte vertical con ejes
 * en km, superficie libre, zona absorbente sombreada, fuente/estación y los
 * frentes teóricos P y S. Es una versión estática y autocontenida de la vista
 * en pantalla (TriaxialPlane), para incrustarla en el reporte.
 *
 * @module lib/crossSectionRender
 */
import { WavefieldSnapshot, GridInfo } from './types';

const CREMA: [number, number, number] = [250, 246, 240];
const TERRACOTA: [number, number, number] = [196, 85, 58];
const TERRACOTA_OSC: [number, number, number] = [122, 42, 28];

function lerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

/** Color de magnitud: crema (0) → terracota → terracota oscuro (alto). */
function magColor(v: number, peak: number): [number, number, number] {
  const t = Math.pow(Math.min(Math.abs(v) / (peak + 1e-30), 1), 0.6);
  return t < 0.5 ? lerp(CREMA, TERRACOTA, t / 0.5) : lerp(TERRACOTA, TERRACOTA_OSC, (t - 0.5) / 0.5);
}

function niceTicks(min: number, max: number, target: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v * 10) / 10);
  return ticks;
}

export interface CrossSectionRenderOpts {
  snapshot: WavefieldSnapshot;
  gridInfo: GridInfo;   // sub-grid (nx, nz, source/receiver)
  fullGrid: GridInfo;   // full grid (dx real, nx, nz)
  vp: number;
  vs: number;
  absThick?: number;
  widthPx?: number;
}

/**
 * Dibuja un fotograma del corte del subsuelo (capa magnitud) y devuelve un PNG
 * como data URL, listo para `addImage` en jsPDF.
 */
export function renderCrossSectionPng(opts: CrossSectionRenderOpts): string {
  const { snapshot, gridInfo, fullGrid, vp, vs, absThick = 44, widthPx = 900 } = opts;
  const { nx, nz } = gridInfo;
  const size = nx * nz;
  const domainWkm = (fullGrid.nx * fullGrid.dx) / 1000;
  const domainHkm = (fullGrid.nz * fullGrid.dx) / 1000;
  const aspect = domainHkm / domainWkm;

  const W = widthPx;
  const H = Math.round(widthPx * (aspect * 0.62 + 0.22)); // deja espacio para ejes
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FAFAF8'; ctx.fillRect(0, 0, W, H);

  const scale = W / 1000;
  const mL = 62 * scale, mR = 16 * scale, mT = 24 * scale, mB = 40 * scale;
  const plotW = W - mL - mR, plotH = H - mT - mB;

  // Campo (magnitud).
  const off = 2 * size; // |u| es la tercera capa
  let peak = 1e-30;
  for (let k = 0; k < size; k++) { const a = Math.abs(snapshot.field[off + k]); if (a > peak) peak = a; }
  peak = peak * 0.5 + 1e-30;
  const img = ctx.createImageData(nx, nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const v = snapshot.field[off + i * nz + j];
      const [r, g, b] = magColor(v, peak);
      const p = (j * nx + i) * 4;
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = nx; tmp.height = nz;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, nx, nz, mL, mT, plotW, plotH);

  // Zona absorbente.
  const aw = (absThick / fullGrid.nx) * plotW, ah = (absThick / fullGrid.nz) * plotH;
  ctx.fillStyle = 'rgba(120,113,108,0.30)';
  ctx.fillRect(mL, mT, aw, plotH); ctx.fillRect(mL + plotW - aw, mT, aw, plotH); ctx.fillRect(mL, mT + plotH - ah, plotW, ah);
  ctx.strokeStyle = '#D6D3D1'; ctx.lineWidth = 1; ctx.strokeRect(mL, mT, plotW, plotH);
  // Superficie libre.
  ctx.strokeStyle = '#1A1A2E'; ctx.lineWidth = 2.5 * scale;
  ctx.beginPath(); ctx.moveTo(mL, mT); ctx.lineTo(mL + plotW, mT); ctx.stroke();

  const srcFx = gridInfo.sourceX / (nx - 1), srcFz = gridInfo.sourceZ / (nz - 1);
  const recFx = gridInfo.receiverX / (nx - 1), recFz = gridInfo.receiverZ / (nz - 1);
  const sx = mL + srcFx * plotW, sz = mT + srcFz * plotH;
  const rx = mL + recFx * plotW, rz = mT + recFz * plotH;

  // Frentes P y S.
  const t = snapshot.time;
  const front = (radiusKm: number, letter: string) => {
    if (radiusKm <= 0) return;
    const rXpx = (radiusKm / domainWkm) * plotW, rZpx = (radiusKm / domainHkm) * plotH;
    ctx.strokeStyle = 'rgba(87,83,78,0.8)'; ctx.setLineDash([3 * scale, 3 * scale]); ctx.lineWidth = 1.3 * scale;
    ctx.beginPath(); ctx.ellipse(sx, sz, rXpx, rZpx, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const lx = sx + rXpx * 0.7, ly = sz - rZpx * 0.7;
    if (lx > mL && lx < mL + plotW && ly > mT && ly < mT + plotH) { ctx.fillStyle = '#57534E'; ctx.font = `bold ${11 * scale}px sans-serif`; ctx.fillText(letter, lx, ly); }
  };
  front(vs * t / 1000, 'S'); front(vp * t / 1000, 'P');

  // Fuente (estrella) y estación (triángulo).
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 === 0 ? 8 * scale : 3.6 * scale; const px = sx + Math.cos(a) * rr, py = sz + Math.sin(a) * rr; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fillStyle = '#C4553A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * scale; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx, rz - 8 * scale); ctx.lineTo(rx - 7 * scale, rz + 5 * scale); ctx.lineTo(rx + 7 * scale, rz + 5 * scale); ctx.closePath();
  ctx.fillStyle = '#2D6A4F'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * scale; ctx.fill(); ctx.stroke();

  // Ejes.
  ctx.fillStyle = '#78716C'; ctx.font = `${9 * scale}px sans-serif`; ctx.textAlign = 'center';
  for (const tk of niceTicks(0, domainWkm, 6)) { const px = mL + (tk / domainWkm) * plotW; ctx.fillText(`${tk}`, px, mT + plotH + 14 * scale); }
  ctx.fillText('Distancia horizontal (km)', mL + plotW / 2, mT + plotH + 30 * scale);
  ctx.textAlign = 'right';
  for (const tk of niceTicks(0, domainHkm, 5)) { const py = mT + (tk / domainHkm) * plotH; ctx.fillText(`${tk}`, mL - 6 * scale, py + 3 * scale); }
  ctx.save(); ctx.translate(13 * scale, mT + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Profundidad (km)', 0, 0); ctx.restore();
  ctx.textAlign = 'left'; ctx.fillStyle = '#1A1A2E'; ctx.font = `bold ${8.5 * scale}px sans-serif`;
  ctx.fillText('Superficie libre', mL + 4 * scale, mT - 7 * scale);

  return canvas.toDataURL('image/png');
}
