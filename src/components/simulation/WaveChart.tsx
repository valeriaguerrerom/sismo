import { useMemo } from 'react';
import { WaveData } from '../../lib/types';
import { niceTimeTicks } from '../../lib/format';

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
  /**
   * Amplitud de referencia EXTERNA para la normalización (escala común). Si se
   * pasa, las tres componentes se dibujan contra el mismo máximo (el mayor de
   * N/E/Z), así se ve que la P domina en la vertical y la S en las horizontales.
   * Si es undefined, cada traza se normaliza contra su propio pico.
   */
  refAmpOverride?: number;
  /**
   * Si se pasa, dibuja una línea vertical tenue en ese tiempo (s) para marcar
   * desde cuándo pueden aparecer reflexiones artificiales de los bordes del
   * modelo. Lo que hay después no debe interpretarse como señal real.
   */
  reflectionsAfter?: number;
  /**
   * Ventana temporal visible (s). Si se pasan, el eje X se recorta a
   * [windowStart, windowEnd] (modo "Ajustar al evento", B1) en vez de mostrar
   * toda la duración. La amplitud se sigue midiendo con la señal completa para
   * no exagerar la escala. El cursor de reproducción se mapea a esta ventana.
   */
  windowStart?: number;
  windowEnd?: number;
}

export function WaveChart({ data, label, component, color, height = 120, visibleRatio = 1, pArrival, sArrival, robustScale = false, refAmpOverride, reflectionsAfter, windowStart, windowEnd }: WaveChartProps) {
  const svgData = useMemo(() => {
    if (!data.time.length) return null;

    const w = 800, h = height;
    const padLeft = 50, padRight = 12, padTop = 8, padBottom = 24;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const values = data[component];
    const dataMinT = data.time[0];
    const dataMaxT = data.time[data.time.length - 1];
    // Ventana visible: recorte al evento si se pasa, si no toda la señal.
    const minT = windowStart !== undefined ? Math.max(dataMinT, windowStart) : dataMinT;
    const maxT = windowEnd !== undefined ? Math.min(dataMaxT, windowEnd) : dataMaxT;

    // Referencia de amplitud: pico absoluto (simulación FDM, ya bien escalada)
    // o percentil 99 con saturación suave (datos reales, para no aplastar la
    // señal cuando hay un pico dominante al inicio).
    let refAmp: number;
    if (refAmpOverride && refAmpOverride > 0) {
      // Escala común: mismo máximo para las tres componentes.
      refAmp = refAmpOverride;
    } else if (robustScale) {
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
    // El cursor de reproducción avanza sobre la DURACIÓN COMPLETA (visibleRatio
    // es fracción de toda la señal), aunque el eje esté recortado a la ventana.
    const playT = dataMinT + (dataMaxT - dataMinT) * visibleRatio;

    const points: string[] = [];
    for (let i = 0; i < data.time.length; i += step) {
      const t = data.time[i];
      // Solo dibujamos dentro de la ventana visible y hasta el tiempo de
      // reproducción (para que la traza "crezca" al reproducir).
      if (t < minT) continue;
      if (t > maxT || t > playT) break;
      points.push(`${toX(t)},${toY(values[i])}`);
    }
    const path = points.length > 1 ? `M ${points.join(' L ')}` : '';

    // Posición del cursor: recortada a la ventana visible.
    const cursorT = Math.max(minT, Math.min(maxT, playT));
    let cursorIdx = 0;
    for (let i = 0; i < data.time.length; i++) { if (data.time[i] >= cursorT) { cursorIdx = i; break; } cursorIdx = i; }
    const cursorX = toX(cursorT);
    const cursorY = toY(values[cursorIdx]);

    // Marcas del eje de tiempo en valores redondos (0, 2, 4, 6, 8, 10, 12…),
    // no en fracciones arbitrarias del rango. Se elige un paso "bonito"
    // (1, 2, 5, 10…) para tener ~6 marcas parejas dentro de [minT, maxT].
    const gridLines = niceTimeTicks(minT, maxT).map(t => ({ x: toX(t), label: t.toFixed(0) + 's' }));

    // Amplitud NORMALIZADA: la señal FDM no está calibrada, así que el eje se
    // muestra en [-1, 0, +1] respecto al pico de referencia (sin µm/s).
    const ampLabels = [
      { y: toY(maxAbs), label: '+1' },
      { y: toY(0), label: '0' },
      { y: toY(-maxAbs), label: '−1' },
    ];

    // Arrival marker positions
    const pX = pArrival !== undefined && pArrival >= minT && pArrival <= maxT ? toX(pArrival) : null;
    const sX = sArrival !== undefined && sArrival >= minT && sArrival <= maxT ? toX(sArrival) : null;
    // Marca de reflexiones de borde (si la ventana llega hasta ese tiempo).
    const refX = reflectionsAfter !== undefined && reflectionsAfter > minT && reflectionsAfter <= maxT ? toX(reflectionsAfter) : null;

    return { path, gridLines, ampLabels, midY: toY(0), w, h, padLeft, padTop, padBottom, cursorX, cursorY, pX, sX, refX };
  }, [data, component, height, visibleRatio, pArrival, sArrival, robustScale, refAmpOverride, reflectionsAfter, windowStart, windowEnd]);

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

          {/* Arribo P: gris, línea punteada fina (se distingue por el trazo y la
              etiqueta, no por color). */}
          {svgData.pX !== null && (
            <>
              <line x1={svgData.pX} y1={svgData.padTop} x2={svgData.pX} y2={svgData.h - svgData.padBottom} stroke="#78716C" strokeWidth="1" strokeDasharray="2,2" opacity="0.8" />
              <text x={svgData.pX + 3} y={svgData.padTop + 10} fontSize="8" fill="#57534E" fontWeight="bold">P</text>
            </>
          )}
          {/* Arribo S: gris, línea de guiones largos (distinta de la P). */}
          {svgData.sX !== null && (
            <>
              <line x1={svgData.sX} y1={svgData.padTop} x2={svgData.sX} y2={svgData.h - svgData.padBottom} stroke="#78716C" strokeWidth="1" strokeDasharray="7,3" opacity="0.8" />
              <text x={svgData.sX + 3} y={svgData.padTop + 10} fontSize="8" fill="#57534E" fontWeight="bold">S</text>
            </>
          )}
          {/* Reflexiones de borde: línea vertical tenue. Lo que hay a la derecha
              es artificial (rebotes de los límites de la malla). */}
          {svgData.refX !== null && (
            <>
              <line x1={svgData.refX} y1={svgData.padTop} x2={svgData.refX} y2={svgData.h - svgData.padBottom} stroke="#C4553A" strokeWidth="1" strokeDasharray="2,3" opacity="0.5" />
              <text x={svgData.refX + 3} y={svgData.padTop + 10} fontSize="7" fill="#C4553A" opacity="0.9">reflex.</text>
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
