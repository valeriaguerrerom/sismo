import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { WavefieldSnapshot, GridInfo } from '../../lib/types';
import { Play, Pause, SkipBack, RotateCcw, Eye } from '../../lib/icons';
import { Tooltip } from '../ui/Tooltip';
import { drawCrossSection, computeGlobalPeak, CrossLayer, CrossScaleMode } from '../../lib/crossSectionRender';

interface Props {
  /** Fotogramas del campo submuestreado (Ux, Uz, |u| en Float32Array). */
  snapshots: WavefieldSnapshot[];
  /** Grid submuestreado del corte (nx, nz y posiciones fuente/receptor). */
  gridInfo: GridInfo;
  /** Grid completo (para la escala física en km: dx real y nº de nodos). */
  fullGrid: GridInfo;
  vp: number;
  vs: number;
  absThick?: number;
  pArrival: number;
  sArrival: number;
  /** Tiempo actual (s) compartido con los sismogramas para sincronizar. */
  currentTime: number;
  onTimeChange: (t: number) => void;
  playing: boolean;
  onPlayingChange: (p: boolean) => void;
}

const LAYERS: { key: CrossLayer; label: string; tip: string }[] = [
  { key: 'mag', label: 'Magnitud', tip: 'Qué tan fuerte se mueve el suelo en cada punto, sin importar la dirección: combina el movimiento radial y el vertical.' },
  { key: 'ux', label: 'Radial', tip: 'Movimiento en la dirección horizontal del corte (hacia/desde la fuente). Aquí se ve bien la onda P y parte de la S.' },
  { key: 'uz', label: 'Vertical', tip: 'Movimiento hacia arriba y abajo. La onda P y la superficial dejan una huella clara en esta componente.' },
];

/**
 * Mapa de calor del subsuelo: propagación del campo de ondas en un corte
 * vertical. Usa el renderizador compartido (drawCrossSection), el mismo que el
 * PDF. Escala global por defecto y reproductor sincronizado con los sismogramas.
 */
export function TriaxialPlane({
  snapshots, gridInfo, fullGrid, vp, vs, absThick = 44,
  pArrival, sArrival, currentTime, onTimeChange, playing, onPlayingChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(1);
  const [layer, setLayer] = useState<CrossLayer>('mag');
  const [scaleMode, setScaleMode] = useState<CrossScaleMode>('global');
  const rafRef = useRef<number>(0);

  const domainWkm = (fullGrid.nx * fullGrid.dx) / 1000;
  const domainHkm = (fullGrid.nz * fullGrid.dx) / 1000;
  const { nx, nz } = gridInfo;
  const srcDepthKm = (gridInfo.sourceZ / (nz - 1)) * domainHkm;
  const epicDistKm = Math.abs(gridInfo.receiverX - gridInfo.sourceX) / (nx - 1) * domainWkm;

  // Pico global de la capa activa (para la escala global). Se recalcula solo
  // cuando cambian los fotogramas o la capa.
  const globalPeak = useMemo(() => computeGlobalPeak(snapshots, layer), [snapshots, layer]);

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

  const draw = useCallback((fi: number) => {
    const canvas = canvasRef.current;
    const snap = snapshots[fi];
    if (!canvas || !snap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCrossSection({
      ctx, width: canvas.width, height: canvas.height,
      snapshot: snap, gridInfo, fullGrid, vp, vs, layer, scaleMode, globalPeak, absThick,
    });
  }, [snapshots, gridInfo, fullGrid, vp, vs, layer, scaleMode, globalPeak, absThick]);

  useEffect(() => { draw(frameIdx); }, [frameIdx, draw]);

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

  // Ref del tiempo actual para el loop de rAF.
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (!playing || !lastTime) return;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000; prev = now;
      const advance = (lastTime / 15) * speed * dt;
      let nt = currentTimeRef.current + advance;
      if (nt >= lastTime) { nt = lastTime; onPlayingChange(false); }
      onTimeChange(nt);
      if (nt < lastTime) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, lastTime]);

  const activeLayer = LAYERS.find(l => l.key === layer)!;
  const pReached = currentTime >= pArrival && pArrival > 0;
  const sReached = currentTime >= sArrival && sArrival > 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-[clamp(300px,50vh,480px)] rounded-xl border border-stone-200/60 shadow-sm bg-[#FAFAF8]"
        />
        <div className="absolute top-2 right-3">
          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-white/90 text-[#1A1A2E] border border-stone-200 shadow-sm">
            {activeLayer.label}
          </span>
        </div>
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {pReached && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#57534E] text-white">P en estación</span>}
          {sReached && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1A1A2E] text-white">S en estación</span>}
          <span className="bg-white/90 border border-stone-200 shadow-sm text-[#1A1A2E] font-mono text-xs px-3 py-1.5 rounded-lg">
            t = {currentTime.toFixed(3)} s
          </span>
        </div>
      </div>

      {/* Selector de capa + escala */}
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
              <Tooltip content={l.tip} showIcon={!on}>{l.label}</Tooltip>
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-stone-500">
          <Tooltip content="Global: colorea todos los fotogramas contra el máximo de toda la simulación, así los residuos tardíos se ven tenues. Por fotograma: cada instante se colorea contra su propio máximo (resalta detalles débiles).">Escala</Tooltip>
          {(['global', 'frame'] as CrossScaleMode[]).map(m => (
            <button key={m} onClick={() => setScaleMode(m)}
              className={`px-2 py-1 rounded font-bold ${scaleMode === m ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>
              {m === 'global' ? 'Global' : 'Por fotograma'}
            </button>
          ))}
        </span>
      </div>

      {/* Reproducción (comparte el tiempo con los sismogramas) */}
      <div className="flex items-center gap-2 bg-stone-50 rounded-xl p-2 border border-stone-100">
        <button onClick={() => { onTimeChange(0); onPlayingChange(false); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500"><SkipBack size={12} /></button>
        <button onClick={() => { if (currentTime >= lastTime) onTimeChange(0); onPlayingChange(!playing); }} className="p-2 rounded-lg bg-[#C4553A] text-white shadow-sm">{playing ? <Pause size={13} /> : <Play size={13} />}</button>
        <button onClick={() => { onTimeChange(0); onPlayingChange(true); }} className="p-1.5 rounded-lg bg-white border border-stone-200 text-stone-500"><RotateCcw size={12} /></button>
        <input type="range" min={0} max={lastTime || 0.01} step={(lastTime / 200) || 0.01} value={Math.min(currentTime, lastTime)} onChange={e => { onTimeChange(Number(e.target.value)); onPlayingChange(false); }} className="flex-1" />
        <span className="text-[9px] font-mono text-stone-400 w-16 text-right">{currentTime.toFixed(1)}/{lastTime.toFixed(0)}s</span>
        <div className="flex gap-0.5">
          {[0.5, 1, 2].map(s => (<button key={s} onClick={() => setSpeed(s)} className={`text-[9px] px-2 py-1 rounded font-bold ${speed === s ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'}`}>{s}x</button>))}
        </div>
      </div>

      {/* Leyenda de escala + marcas */}
      <div className="flex items-center justify-between text-[10px] text-stone-500 px-1 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="text-[#C4553A]">★</span><Tooltip content="Punto donde se origina el sismo (hipocentro), a la profundidad focal.">Fuente</Tooltip> ({srcDepthKm.toFixed(1)} km prof.)</span>
          <span className="flex items-center gap-1"><span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#2D6A4F]" /><Tooltip content="Sismógrafo virtual en la superficie que registra el movimiento del suelo.">Estación</Tooltip> ({epicDistKm.toFixed(1)} km)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-[#57534E]" /><Tooltip content="Círculos que marcan hasta dónde han viajado teóricamente la onda P (rápida) y la S (lenta) desde la fuente en este instante.">Frentes P y S</Tooltip></span>
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
        El corte muestra el movimiento en el plano vertical (radial y vertical). La componente transversal (SH) no aparece en el corte; se ve en los sismogramas. La zona gris de los bordes es la <Tooltip content="Franja de los bordes que absorbe las ondas para que no reboten y ensucien el registro. No es parte del terreno real.">capa absorbente</Tooltip> y no forma parte del modelo. La escala de color es {scaleMode === 'global' ? 'global (igual para toda la simulación)' : 'por fotograma'}.
      </p>
    </div>
  );
}
