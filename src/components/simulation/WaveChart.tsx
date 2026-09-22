import { useMemo } from 'react';
import { WaveData } from '../../lib/types';

interface WaveChartProps {
  data: WaveData;
  label: string;
  component: 'north' | 'east' | 'vertical';
  color: string;
  height?: number;
  visibleRatio?: number;
  pArrival?: number;
  sArrival?: number;
  /**
   * Normalización robusta para datos reales: escala por el percentil 99 en vez
   * del pico absoluto, y satura suavemente. Evita que un transitorio/pico al
   * inicio aplaste toda la señal contra el cero (registro que se ve "plano").
   */
  robustScale?: boolean;
}

export function WaveChart({ data, label, component, color, height = 120, visibleRatio = 1, pArrival, sArrival, robustScale = false }: WaveChartProps) {
  const svgData = useMemo(() => {
    if (!data.time.length) return null;

    const w = 800, h = height;
    const padLeft = 50, padRight = 12, padTop = 8, padBottom = 24;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const values = data[component];
    const minT = data.time[0];
    const maxT = data.time[data.time.length - 1];

    // Referencia de amplitud: pico absoluto (simulación FDM, ya bien escalada)
    // o percentil 99 con saturación suave (datos reales, para no aplastar la
    // señal cuando hay un pico dominante al inicio).
    let refAmp: number;
    if (robustScale) {
      const absSorted = values.map(Math.abs).sort((a, b) => a - b);
      const p99 = absSorted[Math.floor(absSorted.length * 0.99)] || absSorted[absSorted.length - 1] || 1e-10;
      refAmp = p99 < 1e-10 ? 1e-10 : p99;
    } else {
      refAmp = Math.max(...values.map(Math.abs), 1e-10);
    }
    // Amplitud mostrada en las etiquetas del eje Y.
    const maxAbs = refAmp;

    const toX = (t: number) => padLeft + ((t - minT) / (maxT - minT)) * plotW;
    const toY = (v: number) => {
      let s = v / refAmp;
      // Con escala robusta, saturamos para que el pico no se salga del gráfico.
      if (robustScale) s = Math.max(-1.15, Math.min(1.15, s));
      return padTop + plotH / 2 - s * (plotH / 2 - 2);
    };

    const step = Math.max(1, Math.floor(data.time.length / 600));
    const totalVisible = Math.max(1, Math.floor((data.time.length / step) * visibleRatio));

    const points: string[] = [];
    for (let i = 0; i < totalVisible; i++) {
      const srcIdx = i * step;
      if (srcIdx >= data.time.length) break;
      points.push(`${toX(data.time[srcIdx])},${toY(values[srcIdx])}`);
    }
    const path = points.length > 1 ? `M ${points.join(' L ')}` : '';

    const lastIdx = Math.min((totalVisible - 1) * step, data.time.length - 1);
    const cursorX = toX(data.time[lastIdx]);
    const cursorY = toY(values[lastIdx]);

    const gridLines = Array.from({ length: 7 }, (_, i) => {
      const t = minT + (i / 6) * (maxT - minT);
      return { x: toX(t), label: t.toFixed(0) + 's' };
    });

    const ampLabels = [
      { y: toY(maxAbs), label: `+${(maxAbs * 1e6).toFixed(1)}μm/s` },
      { y: toY(0), label: '0' },
      { y: toY(-maxAbs), label: `-${(maxAbs * 1e6).toFixed(1)}μm/s` },
    ];

    // Arrival marker positions
    const pX = pArrival !== undefined && pArrival >= minT && pArrival <= maxT ? toX(pArrival) : null;
    const sX = sArrival !== undefined && sArrival >= minT && sArrival <= maxT ? toX(sArrival) : null;

    return { path, gridLines, ampLabels, midY: toY(0), w, h, padLeft, padTop, padBottom, cursorX, cursorY, pX, sX };
  }, [data, component, height, visibleRatio, pArrival, sArrival]);

  if (!svgData) return null;

  const showCursor = visibleRatio < 1;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">{label}</span>
      </div>
      <div className="bg-white rounded-lg border border-stone-100 overflow-hidden">
        <svg viewBox={`0 0 ${svgData.w} ${svgData.h}`} className="w-full" style={{ height: `${height}px` }} preserveAspectRatio="none">
          {svgData.gridLines.map((gl, i) => (
            <g key={i}>
              <line x1={gl.x} y1={svgData.padTop} x2={gl.x} y2={svgData.h - svgData.padBottom} stroke="#E8E6E1" strokeWidth="0.5" />
              <text x={gl.x} y={svgData.h - 6} textAnchor="middle" fontSize="8" fill="#a8a29e">{gl.label}</text>
            </g>
          ))}
          <line x1={svgData.padLeft} y1={svgData.midY} x2={svgData.w - 12} y2={svgData.midY} stroke="#D6D3D1" strokeWidth="0.8" strokeDasharray="3,3" />
          {svgData.ampLabels.map((al, i) => (
            <text key={i} x={svgData.padLeft - 4} y={al.y + 3} textAnchor="end" fontSize="7" fill="#a8a29e">{al.label}</text>
          ))}

          {/* P-wave arrival marker */}
          {svgData.pX !== null && (
            <>
              <line x1={svgData.pX} y1={svgData.padTop} x2={svgData.pX} y2={svgData.h - svgData.padBottom} stroke="#2D6A4F" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
              <text x={svgData.pX + 3} y={svgData.padTop + 10} fontSize="7" fill="#2D6A4F" fontWeight="bold">P</text>
            </>
          )}
          {/* S-wave arrival marker */}
          {svgData.sX !== null && (
            <>
              <line x1={svgData.sX} y1={svgData.padTop} x2={svgData.sX} y2={svgData.h - svgData.padBottom} stroke="#C4553A" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
              <text x={svgData.sX + 3} y={svgData.padTop + 10} fontSize="7" fill="#C4553A" fontWeight="bold">S</text>
            </>
          )}

          {svgData.path && (
            <path d={svgData.path} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
          {showCursor && svgData.path && (
            <>
              <circle cx={svgData.cursorX} cy={svgData.cursorY} r="4" fill={color} opacity="0.8" />
              <circle cx={svgData.cursorX} cy={svgData.cursorY} r="8" fill={color} opacity="0.15" />
              <line x1={svgData.cursorX} y1={svgData.padTop} x2={svgData.cursorX} y2={svgData.h - svgData.padBottom} stroke={color} strokeWidth="0.5" opacity="0.3" strokeDasharray="2,2" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
