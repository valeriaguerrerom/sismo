import { useRef, useEffect, useState, useCallback } from 'react';
import { WavefieldSnapshot, GridInfo } from '../../lib/types';
import { Play, Pause, SkipBack, RotateCcw, Eye } from '../../lib/icons';

interface Props {
  snapshots: WavefieldSnapshot[];
  gridInfo: GridInfo;
  maxAmplitude: number;
}

/**
 * Capas del campo de onda. `mul` es el desplazamiento dentro del Float32Array
 * del snapshot (Ux, Uz y |u| se guardan concatenados).
 */
const LAYERS = [
  { key: 'ux', label: 'Ux', full: 'Horizontal', color: '#2D6A4F', mul: 0 },
  { key: 'uz', label: 'Uz', full: 'Vertical', color: '#C4553A', mul: 1 },
  { key: 'mag', label: '|u|', full: 'Magnitud', color: '#D4A853', mul: 2 },
] as const;

type LayerKey = (typeof LAYERS)[number]['key'];

/**
 * Mapa de calor 2D de la propagación de ondas (corte del subsuelo).
 *
 * Reemplaza la antigua vista 3D (Three.js) por un heatmap dibujado con Canvas
 * 2D: eje X = distancia horizontal, eje Z = profundidad (hacia abajo), color =
 * amplitud del campo. Es más claro para interpretar la propagación, más estable
 * (sin WebGL) y mucho más liviano. Conserva las tres capas seleccionables y los
 * controles de reproducción.
 */
export function TriaxialPlane({ snapshots, gridInfo }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { nx, nz } = gridInfo;
  const size = nx * nz;

  const [playing, setPlaying] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  // Una sola capa activa a la vez para un heatmap legible.
  const [layer, setLayer] = useState<LayerKey>('mag');

  // Silueta del departamento de Nariño (para recortar el heatmap con su forma
  // en vez de un rectángulo). Se guarda como polígonos normalizados en [0..1]
  // sobre el bounding box del contorno, listos para escalar al canvas.
  const [silhouette, setSilhouette] = useState<[number, number][][] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/terrain/narino_border.json')
      .then(r => (r.ok ? r.json() : null))
      .then((segs: number[][][] | null) => {
        if (!alive || !segs || !segs.length) return;
        // segs es un array de tramos [[lon,lat],...]. Calculamos el bounding box
        // global y normalizamos cada punto a [0..1] (x = lon, y = lat invertida
        // porque en pantalla el norte va arriba).
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const seg of segs) for (const [lon, lat] of seg) {
          if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        }
        const dLon = maxLon - minLon || 1, dLat = maxLat - minLat || 1;
        const norm = segs.map(seg => seg.map(([lon, lat]) => [
          (lon - minLon) / dLon,
          1 - (lat - minLat) / dLat,
        ] as [number, number]));
        setSilhouette(norm);
      })
      .catch(() => { /* sin silueta: se usa el rectángulo completo */ });
    return () => { alive = false; };
  }, []);

  // Rampa de color por capa. Devuelve [r,g,b] en 0..255.
  const colorFor = useCallback((val: number, peak: number, key: LayerKey): [number, number, number] => {
    if (key === 'mag') {
      // Magnitud: rampa cálida tipo "inferno" pero con piso brillante (el alpha
      // ya oculta las zonas nulas, así que no necesitamos empezar en negro).
      // púrpura profundo → magenta → terracota → dorado → blanco.
      const t = Math.pow(Math.min(Math.abs(val) / (peak + 1e-30), 1), 0.4);
      if (t < 0.25) { const u = t / 0.25; return [Math.round(90 + u * 90), Math.round(30 + u * 20), Math.round(90 + u * 10)]; }
      if (t < 0.55) { const u = (t - 0.25) / 0.3; return [Math.round(180 + u * 16), Math.round(50 + u * 35), Math.round(100 - u * 55)]; }
      if (t < 0.8) { const u = (t - 0.55) / 0.25; return [Math.round(196 + u * 56), Math.round(85 + u * 83), Math.round(45 + u * 10)]; }
      const u = (t - 0.8) / 0.2; return [255, Math.round(168 + u * 87), Math.round(55 + u * 200)];
    }
    // Ux / Uz: divergente sobre fondo oscuro. Negativo = frío, positivo = cálido.
    // Colores plenos y luminosos (el alpha ya atenúa las zonas de campo débil).
    const n = Math.max(-1, Math.min(1, val / (peak + 1e-30)));
    const t = Math.pow(Math.abs(n), 0.45);
    if (key === 'ux') {
      // cian brillante (−) ↔ verde bosque brillante (+)
      return n < 0
        ? [Math.round(70 + (1 - t) * 120), Math.round(200 + t * 30), Math.round(190 + t * 30)]
        : [Math.round(90 + (1 - t) * 100), Math.round(200 + t * 20), Math.round(120 + (1 - t) * 60)];
    }
    // uz: azul cielo (−) ↔ terracota/naranja (+)
    return n < 0
      ? [Math.round(90 + (1 - t) * 110), Math.round(170 + t * 40), Math.round(240)]
      : [Math.round(240), Math.round(120 + (1 - t) * 60), Math.round(70 + (1 - t) * 80)];
  }, []);

  // Dibuja el frame indicado en el canvas.
  const draw = useCallback((fi: number) => {
    const canvas = canvasRef.current;
    const snap = snapshots[fi];
    if (!canvas || !snap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const layerDef = LAYERS.find(l => l.key === layer)!;
    const off = layerDef.mul * size;

    // Pico por frame para buen contraste (normalización agresiva).
    let framePeak = 1e-30;
    for (let k = 0; k < size; k++) {
      const a = Math.abs(snap.field[off + k]);
      if (a > framePeak) framePeak = a;
    }
    const peak = framePeak * 0.35 + 1e-30;

    // El campo está en orden [i*nz + j] con i en X (0..nx) y j en Z (0..nz).
    // Pintamos a resolución nativa nx×nz en un ImageData pequeño y luego lo
    // escalamos al canvas con imageSmoothing para un heatmap suave.
    const img = ctx.createImageData(nx, nz);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const v = snap.field[off + i * nz + j];
        const [r, g, b] = colorFor(v, peak, layer);
        // Alpha proporcional a la intensidad: donde el campo es ~0 el heatmap es
        // transparente y deja ver el relleno del territorio (clave para t=0 y
        // para que la onda se lea como un frente que "ilumina" el mapa).
        const intensity = Math.min(Math.abs(v) / (peak + 1e-30), 1);
        const alpha = Math.round(Math.pow(intensity, 0.6) * 255);
        // Pixel destino: x = i, y = j (profundidad hacia abajo).
        const p = (j * nx + i) * 4;
        img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = alpha;
      }
    }

    // Buffer temporal a resolución nativa, luego escalado al canvas visible.
    const tmp = document.createElement('canvas');
    tmp.width = nx; tmp.height = nz;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, W, H);

    // Área de dibujo: la silueta de Nariño (si cargó) o todo el canvas. La
    // silueta se escala a un cuadro con margen, manteniendo su proporción.
    const pad = Math.min(W, H) * 0.04;
    let silPath: Path2D | null = null;
    let box = { x: 0, y: 0, w: W, h: H };
    if (silhouette && silhouette.length) {
      // La silueta está normalizada en [0..1]; conservamos su relación de
      // aspecto real (Nariño es más ancho que alto) centrada en el canvas.
      const aspect = 0.95; // alto/ancho aproximado del contorno normalizado
      const availW = W - pad * 2, availH = H - pad * 2;
      let boxW = availW, boxH = availW * aspect;
      if (boxH > availH) { boxH = availH; boxW = availH / aspect; }
      box = { x: (W - boxW) / 2, y: (H - boxH) / 2, w: boxW, h: boxH };
      silPath = new Path2D();
      for (const seg of silhouette) {
        seg.forEach(([nxp, nyp], k) => {
          const px = box.x + nxp * box.w;
          const py = box.y + nyp * box.h;
          if (k === 0) silPath!.moveTo(px, py); else silPath!.lineTo(px, py);
        });
      }
    }

    // Fondo del recuadro completo (azul noche muy oscuro, mejor que negro puro).
    ctx.fillStyle = '#0f1424';
    ctx.fillRect(0, 0, W, H);

    // Relleno tenue de la silueta de Nariño: así en t=0 (campo casi nulo) se ve
    // el "lienzo" con la forma del departamento, no una pantalla negra. Se pinta
    // ANTES del heatmap para que la propagación quede por encima.
    if (silPath) {
      ctx.fillStyle = '#1c2438'; // territorio en reposo (gris azulado)
      ctx.fill(silPath);
    }

    // Heatmap recortado a la silueta (o al canvas si no hay silueta).
    ctx.save();
    if (silPath) ctx.clip(silPath);
    ctx.drawImage(tmp, 0, 0, nx, nz, box.x, box.y, box.w, box.h);
    ctx.restore();

    // Contorno de la silueta encima, para que se lea la forma de Nariño.
    if (silPath) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.5;
      ctx.stroke(silPath);
    }

    // Marcas de fuente (epicentro) y receptor, posicionadas dentro del cuadro
    // de la silueta (o del canvas si no hay silueta).
    const sx = box.x + (gridInfo.sourceX / nx) * box.w;
    const sz = box.y + (gridInfo.sourceZ / nz) * box.h;
    const rx = box.x + (gridInfo.receiverX / nx) * box.w;
    const rz = box.y + (gridInfo.receiverZ / nz) * box.h;

    // Epicentro (círculo terracota con halo).
    ctx.beginPath(); ctx.arc(sx, sz, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(196,85,58,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sz, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#C4553A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();

    // Receptor (triángulo dorado).
    ctx.beginPath();
    ctx.moveTo(rx, rz - 7); ctx.lineTo(rx - 6, rz + 5); ctx.lineTo(rx + 6, rz + 5); ctx.closePath();
    ctx.fillStyle = '#D4A853'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
  }, [snapshots, layer, nx, nz, size, gridInfo.sourceX, gridInfo.sourceZ, gridInfo.receiverX, gridInfo.receiverZ, colorFor, silhouette]);

  // Redibujar cuando cambia el frame o la capa.
  useEffect(() => { draw(frameIdx); }, [frameIdx, draw]);

  // Ajustar la resolución interna del canvas a su tamaño en pantalla.
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

  // Reproducción: ~15 s a 1x recorriendo todos los snapshots.
  useEffect(() => {
    if (!playing || !snapshots.length) return;
    const msPerFrame = Math.max(16, Math.round((15000 / snapshots.length) / speed));
    const iv = setInterval(() => {
      setFrameIdx(p => { if (p + 1 >= snapshots.length) { setPlaying(false); return p; } return p + 1; });
    }, msPerFrame);
    return () => clearInterval(iv);
  }, [playing, speed, snapshots.length]);

  const t = snapshots[frameIdx]?.time ?? 0;
  const pct = snapshots.length > 1 ? Math.round((frameIdx / (snapshots.length - 1)) * 100) : 0;
  const activeLayer = LAYERS.find(l => l.key === layer)!;

  return (
    <div className="space-y-3">
      {/* Heatmap */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-[clamp(260px,44vh,440px)] rounded-xl overflow-hidden border border-stone-200/60 shadow-lg bg-[#0f1424]"
        />
        {/* Etiqueta de contexto geográfico */}
        {silhouette && (
          <div className="absolute top-2 left-3 text-[10px] font-bold text-white/80 bg-black/30 px-2 py-0.5 rounded backdrop-blur-sm">
            Departamento de Nariño
          </div>
        )}
        {/* Etiqueta explícita: es un resultado físico real de la simulación */}
        <div className="absolute bottom-3 left-3 text-[9px] font-medium text-white/70 bg-black/40 px-2 py-1 rounded backdrop-blur-sm border border-white/10 max-w-[60%] leading-tight">
          Campo de onda simulado (Ux, Uz, |u|) · motor de diferencias finitas
        </div>
        {/* Capa activa */}
        <div className="absolute top-2 right-3">
          <span className="text-[9px] font-bold px-2 py-1 rounded-md text-white backdrop-blur-sm border border-white/10" style={{ backgroundColor: activeLayer.color + 'dd' }}>
            {activeLayer.label} · {activeLayer.full}
          </span>
        </div>
        {/* Tiempo */}
        <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white font-mono text-xs px-3 py-1.5 rounded-lg border border-white/10">
          t = {t.toFixed(3)} s
        </div>
      </div>

      {/* Selector de capa (una a la vez) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Eye size={13} className="text-stone-400" />
        {LAYERS.map(l => {
          const on = l.key === layer;
          return (
            <button key={l.key} onClick={() => setLayer(l.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                on ? 'text-white border-transparent shadow-md' : 'text-stone-400 border-stone-200 bg-white'
              }`}
              style={on ? { backgroundColor: l.color, boxShadow: `0 2px 8px ${l.color}40` } : {}}
            >
              <span className={`w-2.5 h-2.5 rounded-sm ${on ? 'bg-white/30 border border-white/50' : 'border border-stone-300'}`} />
              {l.label} · {l.full}
            </button>
          );
        })}
      </div>

      {/* Reproducción */}
      <div className="flex items-center gap-2 bg-stone-50 rounded-xl p-2 border border-stone-100">
        <button onClick={() => { setFrameIdx(0); setPlaying(false); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500"><SkipBack size={12} /></button>
        <button onClick={() => { if (frameIdx >= snapshots.length - 1) setFrameIdx(0); setPlaying(!playing); }} className="p-2 rounded-lg bg-[#C4553A] text-white shadow-sm">{playing ? <Pause size={13} /> : <Play size={13} />}</button>
        <button onClick={() => { setFrameIdx(0); setPlaying(true); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500"><RotateCcw size={12} /></button>
        <input type="range" min={0} max={Math.max(0, snapshots.length - 1)} value={frameIdx} onChange={e => { setFrameIdx(Number(e.target.value)); setPlaying(false); }} className="flex-1" />
        <span className="text-[9px] font-mono text-stone-400 w-12 text-right">{pct}%</span>
        <div className="flex gap-0.5">
          {[0.5, 1, 2].map(s => (<button key={s} onClick={() => setSpeed(s)} className={`text-[9px] px-2 py-1 rounded font-bold ${speed === s ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{s}x</button>))}
        </div>
      </div>

      {/* Escala de color + leyenda */}
      <div className="flex items-center justify-between text-[9px] text-stone-400 px-1 gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#C4553A] shadow-sm shadow-[#C4553A]/40" /> Epicentro (fuente)</span>
          <span className="flex items-center gap-1"><span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#D4A853]" /> Sismógrafo (receptor)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Baja</span>
          <span className="inline-block w-24 h-2.5 rounded-full" style={{ background: layer === 'mag'
            ? 'linear-gradient(90deg,#5a1e5a,#b43255,#c4553a,#ffa832,#ffffff)'
            : layer === 'ux'
              ? 'linear-gradient(90deg,#46c8be,#1c2438,#5ac878)'
              : 'linear-gradient(90deg,#5aaaf0,#1c2438,#f0783c)' }} />
          <span>Alta</span>
        </div>
      </div>
    </div>
  );
}
