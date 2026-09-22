/**
 * Sección de registro (sismogramas por estación) del "Mapa 3D".
 *
 * Una traza vertical por estación, ordenadas por distancia epicentral de
 * izquierda a derecha. Eje Y = tiempo hacia abajo. Marcas horizontales P
 * (rojo) y S (cian) en los tiempos que devuelve el backend. Las trazas se
 * revelan progresivamente según el reloj de la animación (`elapsed`).
 *
 * @module map3d/RecordSection
 */
import { useMemo } from 'react';
import type { StationTravelTime, SyntheticResult } from '../../lib/api3d';
import { computeRecordLayout } from './recordLayout';

interface Props {
  stations: StationTravelTime[];
  /** Sintético por estación (componente vertical), o real si el usuario lo pidió. */
  traces: Record<string, SyntheticResult | null>;
  /** Códigos de estación cuya traza aún se está calculando (spinner). */
  loadingTraces?: Set<string>;
  elapsed: number;
  maxTime: number;
  width?: number;
  height?: number;
  selectedStation: string | null;
  onSelectStation?: (code: string) => void;
}

const COLOR_P = '#ff4d4d';
const COLOR_S = '#22d3ee';
const TRACE_HALF_WIDTH = 26; // px a cada lado del eje de la traza

/**
 * Dibuja la sección de registro como SVG.
 */
export function RecordSection({
  stations, traces, loadingTraces, elapsed, maxTime, width = 320, height = 520,
  selectedStation, onSelectStation,
}: Props) {
  const layout = useMemo(
    () => computeRecordLayout(stations, { width, height, maxTime }),
    [stations, width, height, maxTime],
  );

  const padTop = 20;
  const tScale = maxTime > 0 ? (height - padTop - 20) / maxTime : 0;
  const yNow = padTop + elapsed * tScale;

  /** Construye la polilínea de la forma de onda vertical de una estación. */
  function buildWavePath(code: string, x: number): string | null {
    const syn = traces[code];
    if (!syn || syn.t.length === 0) return null;
    const comp = syn.vertical;
    let maxAbs = 1e-9;
    for (const v of comp) maxAbs = Math.max(maxAbs, Math.abs(v));
    const pts: string[] = [];
    for (let i = 0; i < syn.t.length; i++) {
      const tt = syn.t[i];
      if (tt > elapsed) break; // solo hasta el reloj actual
      const y = padTop + tt * tScale;
      const amp = (comp[i] / maxAbs) * TRACE_HALF_WIDTH;
      pts.push(`${(x + amp).toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.length > 1 ? `M ${pts.join(' L ')}` : null;
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="font-mono">
      {/* Eje de tiempo (etiquetas cada 5 s) */}
      {maxTime > 0 && Array.from({ length: Math.floor(maxTime / 5) + 1 }, (_, k) => k * 5).map(sec => {
        const y = padTop + sec * tScale;
        return (
          <g key={sec}>
            <line x1={0} y1={y} x2={width} y2={y} stroke="#1e293b" strokeWidth={0.5} />
            <text x={2} y={y - 2} fontSize={8} fill="#64748b">{sec}s</text>
          </g>
        );
      })}

      {/* Línea del reloj actual */}
      <line x1={0} y1={yNow} x2={width} y2={yNow} stroke="#eab308" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />

      {layout.map(tr => {
        const isSel = tr.code === tr.code && selectedStation === tr.code;
        const wavePath = buildWavePath(tr.code, tr.x);
        return (
          <g key={tr.code} onClick={() => onSelectStation?.(tr.code)} style={{ cursor: 'pointer' }}>
            {/* Eje vertical de la traza */}
            <line x1={tr.x} y1={padTop} x2={tr.x} y2={height - 20} stroke={isSel ? '#94a3b8' : '#334155'} strokeWidth={isSel ? 1 : 0.5} />

            {/* Forma de onda (revelada hasta elapsed) */}
            {wavePath && (
              <path d={wavePath} fill="none" stroke={isSel ? '#e2e8f0' : '#94a3b8'} strokeWidth={0.8} />
            )}

            {/* Marca P */}
            {tr.yP != null && elapsed >= (tr.tP ?? Infinity) && (
              <g>
                <line x1={tr.x - TRACE_HALF_WIDTH} y1={tr.yP} x2={tr.x + TRACE_HALF_WIDTH} y2={tr.yP} stroke={COLOR_P} strokeWidth={1.5} />
                <text x={tr.x + TRACE_HALF_WIDTH + 2} y={tr.yP + 3} fontSize={8} fill={COLOR_P}>P</text>
              </g>
            )}
            {/* Marca S */}
            {tr.yS != null && elapsed >= (tr.tS ?? Infinity) && (
              <g>
                <line x1={tr.x - TRACE_HALF_WIDTH} y1={tr.yS} x2={tr.x + TRACE_HALF_WIDTH} y2={tr.yS} stroke={COLOR_S} strokeWidth={1.5} />
                <text x={tr.x + TRACE_HALF_WIDTH + 2} y={tr.yS + 3} fontSize={8} fill={COLOR_S}>S</text>
              </g>
            )}

            {/* Spinner mientras la traza se calcula */}
            {loadingTraces?.has(tr.code) && (
              <circle cx={tr.x} cy={padTop + 12} r={5} fill="none" stroke="#C4553A" strokeWidth={1.5}
                strokeDasharray="8 8" opacity={0.8}>
                <animateTransform attributeName="transform" type="rotate"
                  from={`0 ${tr.x} ${padTop + 12}`} to={`360 ${tr.x} ${padTop + 12}`}
                  dur="0.8s" repeatCount="indefinite" />
              </circle>
            )}

            {/* Etiqueta de estación y distancia */}
            <text x={tr.x} y={height - 8} fontSize={8} fill={isSel ? '#e2e8f0' : '#94a3b8'} textAnchor="middle">{tr.code}</text>
            <text x={tr.x} y={height - 1} fontSize={6.5} fill="#64748b" textAnchor="middle">{tr.distancia_km.toFixed(0)}km</text>
          </g>
        );
      })}
    </svg>
  );
}
