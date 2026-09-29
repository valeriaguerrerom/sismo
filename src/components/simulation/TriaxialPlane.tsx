import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { WavefieldSnapshot, GridInfo } from '../../lib/types';
import { Play, Pause, SkipBack, RotateCcw, Eye } from '../../lib/icons';

interface Props {
  /** Fotogramas del campo submuestreado (Ux, Uz, |u| concatenados). */
  snapshots: WavefieldSnapshot[];
  /** Grid submuestreado del heatmap (nx, nz y posiciones fuente/receptor). */
  gridInfo: GridInfo;
  /** Grid completo (para la escala física en km: dx real y nº de nodos). */
  fullGrid: GridInfo;
  /** Vp y Vs para los frentes teóricos P y S (m/s). */
  vp: number;
  vs: number;
  /** Grosor de la zona absorbente en nodos del grid COMPLETO. */
  absThick?: number;
  /** Arribos P y S a la estación (s), para el indicador de llegada. */
  pArrival: number;
  sArrival: number;
  /** Tiempo actual (s) compartido con los sismogramas para sincronizar. */
  currentTime: number;
  /** Notifica el nuevo tiempo cuando el usuario mueve el control del corte. */
  onTimeChange: (t: number) => void;
  playing: boolean;
  onPlayingChange: (p: boolean) => void;
}

/**
 * Capas del campo. `mul` es el desplazamiento dentro del Float32Array del
 * snapshot (Ux, Uz y |u| se guardan concatenados).
 */
const LAYERS = [
  { key: 'ux', label: 'Radial', full: 'Ux (horizontal en el plano)', mul: 0, diverging: true },
  { key: 'uz', label: 'Vertical', full: 'Uz', mul: 1, diverging: true },
  { key: 'mag', label: 'Magnitud', full: '|u|', mul: 2, diverging: false },
] as const;

type LayerKey = (typeof LAYERS)[number]['key'];

// Paleta del sitio.
const TERRACOTA: [number, number, number] = [196, 85, 58];   // #C4553A
const CREMA: [number, number, number] = [250, 246, 240];      // ~crema
const VERDE: [number, number, number] = [45, 106, 79];        // #2D6A4F
const TERRACOTA_OSC: [number, number, number] = [122, 42, 28]; // terracota oscuro

function lerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

/**
 * Corte del subsuelo: propagación del campo de ondas en un corte vertical.
 *
 * Dibuja el dominio físico como un rectángulo con ejes en km (distancia
 * horizontal abajo, profundidad a la izquierda con 0 arriba). Marca la
 * superficie libre, sombrea la zona absorbente (no es parte del modelo),
 * ubica la fuente y la estación en sus posiciones reales, superpone los
 * frentes teóricos P y S, y usa la paleta del sitio sobre fondo claro. El
 * reproductor comparte el tiempo con los sismogramas.
 */
export function TriaxialPlane({
  snapshots, gridInfo, fullGrid, vp, vs, absThick = 44,
  pArrival, sArrival, currentTime, onTimeChange, playing, onPlayingChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { nx, nz } = gridInfo;
  const size = nx * nz;
  const [speed, setSpeed] = useState(1);
  const [layer, setLayer] = useState<LayerKey>('mag');
  const rafRef = useRef<number>(0);

  // ── Escala física ──
  // Ancho y alto del dominio en km, a partir del grid COMPLETO (dx real).
  const domainWkm = (fullGrid.nx * fullGrid.dx) / 1000;
  const domainHkm = (fullGrid.nz * fullGrid.dx) / 1000;
  // Zona absorbente en fracción del dominio (grosor en nodos / nº de nodos).
  const absFracX = absThick / fullGrid.nx;
  const absFracZ = absThick / fullGrid.nz;
  // Posiciones fuente/receptor en fracción [0..1] del dominio (grid submuestreado).
  const srcFx = gridInfo.sourceX / (nx - 1);
  const srcFz = gridInfo.sourceZ / (nz - 1);
  const recFx = gridInfo.receiverX / (nx - 1);
  const recFz = gridInfo.receiverZ / (nz - 1);
  // Profundidad y distancia reales para etiquetas.
  const srcDepthKm = srcFz * domainHkm;
  const epicDistKm = Math.abs(recFx - srcFx) * domainWkm;

  // Índice del fotograma más cercano al tiempo actual (sincronización).
  const frameIdx = useMemo(() => {
    if (!snapshots.length) return 0;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < snapshots.length; i++) {
      const d = Math.abs(snapshots[i].time - currentTime);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }, [snapshots, currentTime]);

  const lastTime = snapshots.length ? snapshots[snapshots.length - 1].time : 0;

  // Rampa de color por capa (fondo claro).
  const colorFor = useCallback((val: number, peak: number, key: LayerKey): [number, number, number] => {
    const n = Math.max(-1, Math.min(1, val / (peak + 1e-30)));
    if (key === 'mag') {
      // Secuencial: crema (0) → terracota oscuro (alto).
      const t = Math.pow(Math.min(Math.abs(n), 1), 0.6);
      return t < 0.5 ? lerp(CREMA, TERRACOTA, t / 0.5) : lerp(TERRACOTA, TERRACOTA_OSC, (t - 0.5) / 0.5);
    }
    // Divergente: terracota (negativo) → crema (cero) → verde bosque (positivo).
    const t = Math.sign(n) * Math.pow(Math.abs(n), 0.6);
    return t < 0 ? lerp(CREMA, TERRACOTA, -t) : lerp(CREMA, VERDE, t);
  }, []);

  // Dibuja el corte para el fotograma indicado.
  const draw = useCallback((fi: number) => {
    const canvas = canvasRef.current;
    const snap = snapshots[fi];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FAFAF8';
    ctx.fillRect(0, 0, W, H);

    // Márgenes para los ejes (en px del canvas, escalados por dpr vía W/H).
    const scale = W / 1000; // referencia de diseño a 1000 px de ancho
    const mL = 62 * scale, mR = 16 * scale, mT = 26 * scale, mB = 40 * scale;
    const plotW = W - mL - mR, plotH = H - mT - mB;

    // Campo del fotograma → ImageData a resolución nativa, escalado al plot.
    if (snap) {
      const layerDef = LAYERS.find(l => l.key === layer)!;
      const off = layerDef.mul * size;
      let framePeak = 1e-30;
      for (let k = 0; k < size; k++) { const a = Math.abs(snap.field[off + k]); if (a > framePeak) framePeak = a; }
      const peak = framePeak * 0.5 + 1e-30;
      const img = ctx.createImageData(nx, nz);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const v = snap.field[off + i * nz + j];
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
      ctx.drawImage(tmp, 0, 0, nx, nz, mL, mT, plotW, plotH);
    }

    // Zona absorbente sombreada (laterales + inferior): no es parte del modelo.
    ctx.fillStyle = 'rgba(120,113,108,0.30)';
    const aw = absFracX * plotW, ah = absFracZ * plotH;
    ctx.fillRect(mL, mT, aw, plotH);                    // izquierda
    ctx.fillRect(mL + plotW - aw, mT, aw, plotH);       // derecha
    ctx.fillRect(mL, mT + plotH - ah, plotW, ah);       // inferior
    // Línea del borde interno de la zona absorbente (discontinua).
    ctx.strokeStyle = 'rgba(120,113,108,0.55)';
    ctx.setLineDash([4 * scale, 3 * scale]); ctx.lineWidth = 1;
    ctx.strokeRect(mL + aw, mT, plotW - 2 * aw, plotH - ah);
    ctx.setLineDash([]);

    // Marco del dominio.
    ctx.strokeStyle = '#D6D3D1'; ctx.lineWidth = 1;
    ctx.strokeRect(mL, mT, plotW, plotH);

    // Superficie libre (borde superior) resaltada.
    ctx.strokeStyle = '#1A1A2E'; ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.moveTo(mL, mT); ctx.lineTo(mL + plotW, mT); ctx.stroke();

    // Posiciones en px.
    const sx = mL + srcFx * plotW, sz = mT + srcFz * plotH;
    const rx = mL + recFx * plotW, rz = mT + recFz * plotH;

    // Frentes teóricos P (Vp·t) y S (Vs·t) desde la fuente, en gris punteado.
    const t = snap ? snap.time : currentTime;
    const kmPerPxX = domainWkm / plotW, kmPerPxZ = domainHkm / plotH;
    const drawFront = (radiusKm: number, letter: string) => {
      if (radiusKm <= 0) return;
      // El dominio no es isótropo en px (dx igual en X y Z, así que kmPerPx es
      // igual), pero por seguridad dibujamos una elipse con ambos radios.
      const rXpx = radiusKm / kmPerPxX, rZpx = radiusKm / kmPerPxZ;
      ctx.strokeStyle = 'rgba(87,83,78,0.75)';
      ctx.setLineDash([3 * scale, 3 * scale]); ctx.lineWidth = 1.3 * scale;
      ctx.beginPath(); ctx.ellipse(sx, sz, rXpx, rZpx, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // Etiqueta sobre el frente, hacia arriba-derecha de la fuente.
      const lx = sx + rXpx * 0.7, ly = sz - rZpx * 0.7;
      if (lx > mL && lx < mL + plotW && ly > mT && ly < mT + plotH) {
        ctx.fillStyle = '#57534E'; ctx.font = `bold ${11 * scale}px sans-serif`;
        ctx.fillText(letter, lx, ly);
      }
    };
    drawFront(vs * t / 1000, 'S');   // S primero (más lento, radio menor) para que P quede encima
    drawFront(vp * t / 1000, 'P');

    // Fuente: estrella terracota en su profundidad real.
    const star = (cx: number, cy: number, R: number, col: string) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? R : R * 0.45;
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * scale; ctx.fill(); ctx.stroke();
    };
    star(sx, sz, 8 * scale, '#C4553A');

    // Estación: triángulo en la superficie.
    ctx.beginPath();
    ctx.moveTo(rx, rz - 8 * scale); ctx.lineTo(rx - 7 * scale, rz + 5 * scale); ctx.lineTo(rx + 7 * scale, rz + 5 * scale); ctx.closePath();
    ctx.fillStyle = '#2D6A4F'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * scale; ctx.fill(); ctx.stroke();

    // Etiquetas de fuente y estación.
    ctx.fillStyle = '#1A1A2E'; ctx.font = `bold ${10 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Fuente', sx, sz + 20 * scale);
    ctx.fillText('Estación', rx, rz - 12 * scale);
    ctx.textAlign = 'start';

    // ── Ejes en km ──
    ctx.fillStyle = '#78716C'; ctx.font = `${9 * scale}px sans-serif`;
    // Eje X (distancia horizontal, abajo).
    const xticks = niceTicks(0, domainWkm, 6);
    ctx.textAlign = 'center';
    for (const tk of xticks) {
      const px = mL + (tk / domainWkm) * plotW;
      ctx.strokeStyle = '#E7E5E4'; ctx.beginPath(); ctx.moveTo(px, mT); ctx.lineTo(px, mT + plotH); ctx.stroke();
      ctx.fillText(`${tk}`, px, mT + plotH + 14 * scale);
    }
    ctx.fillText('Distancia horizontal (km)', mL + plotW / 2, mT + plotH + 30 * scale);
    // Eje Z (profundidad, izquierda, 0 arriba).
    const zticks = niceTicks(0, domainHkm, 5);
    ctx.textAlign = 'right';
    for (const tk of zticks) {
      const py = mT + (tk / domainHkm) * plotH;
      ctx.strokeStyle = '#E7E5E4'; ctx.beginPath(); ctx.moveTo(mL, py); ctx.lineTo(mL + plotW, py); ctx.stroke();
      ctx.fillText(`${tk}`, mL - 6 * scale, py + 3 * scale);
    }
    // Etiqueta del eje de profundidad (vertical).
    ctx.save();
    ctx.translate(14 * scale, mT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = '#78716C'; ctx.font = `${9 * scale}px sans-serif`;
    ctx.fillText('Profundidad (km)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'start';

    // Etiqueta "Superficie libre".
    ctx.fillStyle = '#1A1A2E'; ctx.font = `bold ${8.5 * scale}px sans-serif`;
    ctx.fillText('Superficie libre', mL + 4 * scale, mT - 8 * scale);
  }, [snapshots, layer, nx, nz, size, colorFor, srcFx, srcFz, recFx, recFz, absFracX, absFracZ, domainWkm, domainHkm, vp, vs, currentTime]);

  useEffect(() => { draw(frameIdx); }, [frameIdx, draw]);

  // Ajuste de resolución del canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      draw(frameIdx);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw]);

  // Reproducción: avanza el TIEMPO compartido (~15 s a 1x sobre toda la ventana).
  useEffect(() => {
    if (!playing || !lastTime) return;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000; prev = now;
      const advance = (lastTime / 15) * speed * dt; // recorre la ventana en ~15 s
      let nt = currentTimeRef.current + advance;
      if (nt >= lastTime) { nt = lastTime; onPlayingChange(false); }
      onTimeChange(nt);
      if (nt < lastTime) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, lastTime]);

  // Ref del tiempo actual para el loop de rAF (evita recrearlo en cada frame).
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const activeLayer = LAYERS.find(l => l.key === layer)!;
  const pReached = currentTime >= pArrival && pArrival > 0;
  const sReached = currentTime >= sArrival && sArrival > 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-[clamp(280px,46vh,460px)] rounded-xl border border-stone-200/60 shadow-sm bg-[#FAFAF8]"
        />
        {/* Capa activa */}
        <div className="absolute top-2 right-3">
          <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-white/90 text-[#1A1A2E] border border-stone-200 shadow-sm">
            {activeLayer.label} · {activeLayer.full}
          </span>
        </div>
        {/* Tiempo + indicador de llegada P/S */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {pReached && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#57534E] text-white">P en estación</span>}
          {sReached && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#1A1A2E] text-white">S en estación</span>}
          <span className="bg-white/90 border border-stone-200 shadow-sm text-[#1A1A2E] font-mono text-xs px-3 py-1.5 rounded-lg">
            t = {currentTime.toFixed(3)} s
          </span>
        </div>
      </div>

      {/* Selector de capa */}
      <div className="flex items-center gap-2 flex-wrap">
        <Eye size={13} className="text-stone-400" />
        {LAYERS.map(l => {
          const on = l.key === layer;
          return (
            <button key={l.key} onClick={() => setLayer(l.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                on ? 'bg-[#C4553A] text-white border-transparent shadow-md' : 'text-stone-400 border-stone-200 bg-white'
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {/* Reproducción (comparte el tiempo con los sismogramas) */}
      <div className="flex items-center gap-2 bg-stone-50 rounded-xl p-2 border border-stone-100">
        <button onClick={() => { onTimeChange(0); onPlayingChange(false); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500"><SkipBack size={12} /></button>
        <button onClick={() => { if (currentTime >= lastTime) onTimeChange(0); onPlayingChange(!playing); }} className="p-2 rounded-lg bg-[#C4553A] text-white shadow-sm">{playing ? <Pause size={13} /> : <Play size={13} />}</button>
        <button onClick={() => { onTimeChange(0); onPlayingChange(true); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500"><RotateCcw size={12} /></button>
        <input type="range" min={0} max={lastTime} step={lastTime / 200 || 0.01} value={Math.min(currentTime, lastTime)} onChange={e => { onTimeChange(Number(e.target.value)); onPlayingChange(false); }} className="flex-1" />
        <span className="text-[9px] font-mono text-stone-400 w-16 text-right">{currentTime.toFixed(1)}/{lastTime.toFixed(0)}s</span>
        <div className="flex gap-0.5">
          {[0.5, 1, 2].map(s => (<button key={s} onClick={() => setSpeed(s)} className={`text-[9px] px-2 py-1 rounded font-bold ${speed === s ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{s}x</button>))}
        </div>
      </div>

      {/* Leyenda de escala + marcas */}
      <div className="flex items-center justify-between text-[9px] text-stone-500 px-1 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="text-[#C4553A]">★</span> Fuente (profundidad {srcDepthKm.toFixed(1)} km)</span>
          <span className="flex items-center gap-1"><span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#2D6A4F]" /> Estación ({epicDistKm.toFixed(1)} km)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-[#57534E]" /> Frentes P y S</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>{layer === 'mag' ? '0' : '−'}</span>
          <span className="inline-block w-24 h-2.5 rounded-full border border-stone-200" style={{ background: layer === 'mag'
            ? 'linear-gradient(90deg,#faf6f0,#c4553a,#7a2a1c)'
            : 'linear-gradient(90deg,#c4553a,#faf6f0,#2d6a4f)' }} />
          <span>{layer === 'mag' ? 'máx' : '+'}</span>
        </div>
      </div>

      <p className="text-[10px] text-stone-400 leading-snug">
        El corte muestra el movimiento en el plano vertical (radial y vertical). La componente transversal (SH) no aparece en el corte; se ve en los sismogramas. La zona gris de los bordes es la capa absorbente y no forma parte del modelo.
      </p>
    </div>
  );
}

/** Marcas de eje en valores redondos (0, 2, 4, …) dentro de [min, max]. */
function niceTicks(min: number, max: number, target: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    ticks.push(Math.round(v * 10) / 10);
  }
  return ticks;
}
