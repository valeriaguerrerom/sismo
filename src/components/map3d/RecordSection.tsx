/**
 * Sección de registro (sismogramas por estación) del "Mapa 3D".
 *
 * Una traza vertical por estación, ordenadas por distancia epicentral de
 * izquierda a derecha. Eje Y = tiempo hacia abajo. Marcas horizontales P
 * (terracota) y S (verde) en los tiempos que devuelve el backend. Las trazas se
 * revelan progresivamente según el reloj de la animación (`elapsed`).
 *
 * La sección se estira a la ALTURA REAL del contenedor (ResizeObserver), para
 * que el eje de tiempo use todo el panel y las etiquetas de estación queden
 * pegadas al borde inferior, sin huecos vacíos. Tipografía legible (≥ 11 px).
 *
 * @module map3d/RecordSection
 */
import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import type { StationTravelTime, SyntheticResult } from '../../lib/api3d';
import { computeRecordLayout } from './recordLayout';
import { WAVE_COLORS } from '../../lib/waveColors';

interface Props {
  stations: StationTravelTime[];
  /** Sintético por estación (componente vertical), o real si el usuario lo pidió. */
  traces: Record<string, SyntheticResult | null>;
  /** Códigos de estación cuya traza aún se está calculando (spinner). */
  loadingTraces?: Set<string>;
  elapsed: number;
  maxTime: number;
  selectedStation: string | null;
  onSelectStation?: (code: string) => void;
  /**
   * Modo esqueleto: dibuja un boceto atenuado (7 trazas grises tenues, eje de
   * tiempo y nombres) como fondo del estado vacío, sin datos reales. No es
   * interactivo. Usa las 7 estaciones del dominio como marcadores de posición.
   */
  skeleton?: boolean;
}

/** Códigos de las 7 estaciones del dominio, para el esqueleto del estado vacío. */
const SKELETON_STATIONS = ['TUM', 'TUM3C', 'PAS2', 'CUM', 'CRU', 'BBAC', 'CPOP2'];

const COLOR_P = WAVE_COLORS.P;
const COLOR_S = WAVE_COLORS.S;
const TRACE_HALF_WIDTH = 26; // px a cada lado del eje de la traza
const LABEL_FONT = "'Inter', system-ui, sans-serif";
// Reserva inferior para las etiquetas: dos líneas horizontales (código +
// distancia) necesitan ~34 px; si se rotan 45° necesitan más alto para no
// cortarse. Se elige según `rotateLabels`.
const LABEL_FOOTER_FLAT = 34;
const LABEL_FOOTER_ROT = 64;
const PAD_TOP = 22;

/**
 * Dibuja la sección de registro como SVG, ocupando toda la altura disponible.
 */
export function RecordSection({
  stations, traces, loadingTraces, elapsed, maxTime,
  selectedStation, onSelectStation, skeleton = false,
}: Props) {
  // Medir el contenedor para estirar el SVG a su alto/ancho reales. Se reajusta
  // al redimensionar la ventana y al mostrar/ocultar los paneles laterales.
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 520 });
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || 320;
      const h = el.clientHeight || 520;
      // Acotar la altura: así el SVG no se estira "gigante" cuando el panel
      // hereda una altura muy grande de la escena 3D, pero sigue aprovechando
      // el alto disponible (ResizeObserver) hasta un tope razonable.
      setSize({ width: Math.max(160, w), height: Math.min(640, Math.max(300, h)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;

  // Separación entre columnas (depende solo de width y nº de estaciones). Si es
  // pequeña, las etiquetas del pie no caben en horizontal y se rotan 45°, lo
  // que exige RESERVAR más alto abajo para que no se corten.
  const nStations = stations.length;
  const padX = 40;
  const colGap = nStations > 1 ? (width - 2 * padX) / (nStations - 1) : width;
  const rotateLabels = colGap < 56;
  const LABEL_FOOTER = rotateLabels ? LABEL_FOOTER_ROT : LABEL_FOOTER_FLAT;

  const layout = useMemo(
    () => computeRecordLayout(stations, { width, height: height - LABEL_FOOTER + 20, maxTime, paddingTop: PAD_TOP }),
    [stations, width, height, maxTime, LABEL_FOOTER],
  );

  // Escala de tiempo: desde PAD_TOP hasta justo encima del pie de etiquetas.
  const axisBottom = height - LABEL_FOOTER;
  const tScale = maxTime > 0 ? (axisBottom - PAD_TOP) / maxTime : 0;
  const yNow = PAD_TOP + elapsed * tScale;

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
      const y = PAD_TOP + tt * tScale;
      const amp = (comp[i] / maxAbs) * TRACE_HALF_WIDTH;
      pts.push(`${(x + amp).toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.length > 1 ? `M ${pts.join(' L ')}` : null;
  }

  // ── Modo esqueleto: boceto atenuado del estado vacío (sin datos reales) ──
  if (skeleton) {
    const n = SKELETON_STATIONS.length;
    const padX = 40;
    const usableW = Math.max(1, width - 2 * padX);
    return (
      <div ref={hostRef} className="w-full h-full min-h-[320px] overflow-hidden" aria-hidden="true">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMin meet" style={{ fontFamily: LABEL_FONT, display: 'block' }}>
          {/* Eje de tiempo tenue */}
          {Array.from({ length: 7 }, (_, k) => k).map(k => {
            const y = PAD_TOP + (k / 6) * (height - LABEL_FOOTER - PAD_TOP);
            return (
              <g key={k}>
                <line x1={0} y1={y} x2={width} y2={y} stroke="#1e293b" strokeWidth={0.5} opacity={0.5} />
                <text x={3} y={y - 3} fontSize={11} fill="#475569">{k * 5}s</text>
              </g>
            );
          })}
          {/* 7 trazas grises tenues con una onda suave de relleno */}
          {SKELETON_STATIONS.map((code, i) => {
            const x = n === 1 ? width / 2 : padX + (usableW * i) / (n - 1);
            const pts: string[] = [];
            for (let s = 0; s <= 40; s++) {
              const yy = PAD_TOP + (s / 40) * (height - LABEL_FOOTER - PAD_TOP);
              const amp = Math.sin(s * 0.6 + i) * 6 * (s > 8 ? 1 : s / 8);
              pts.push(`${(x + amp).toFixed(1)},${yy.toFixed(1)}`);
            }
            return (
              <g key={code} opacity={0.18}>
                <line x1={x} y1={PAD_TOP} x2={x} y2={height - LABEL_FOOTER} stroke="#64748b" strokeWidth={0.5} />
                <path d={`M ${pts.join(' L ')}`} fill="none" stroke="#94a3b8" strokeWidth={0.8} />
              </g>
            );
          })}
          {/* Nombres de las estaciones (marcadores de posición). Si las
              columnas quedan muy juntas (panel angosto del estado vacío), se
              rotan 45° para que no se amontonen ("TUM3CCPOP2…"). */}
          {(() => {
            const gap = n > 1 ? usableW / (n - 1) : width;
            const rot = gap < 42;
            return SKELETON_STATIONS.map((code, i) => {
              const x = n === 1 ? width / 2 : padX + (usableW * i) / (n - 1);
              return rot ? (
                <text key={code} x={x} y={height - 10} fontSize={10} fill="#475569" textAnchor="end" opacity={0.5}
                  transform={`rotate(-45 ${x} ${height - 10})`}>{code}</text>
              ) : (
                <text key={code} x={x} y={height - 8} fontSize={11} fill="#475569" textAnchor="middle" opacity={0.5}>{code}</text>
              );
            });
          })()}
        </svg>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="w-full h-full min-h-[320px] overflow-hidden">
      {/* El SVG usa una altura en píxeles (acotada) para que no se deforme ni
          se desborde sobre la escena 3D. */}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMin meet" style={{ fontFamily: LABEL_FONT, display: 'block' }}>
        {/* Eje de tiempo (etiquetas cada 5 s) */}
        {maxTime > 0 && Array.from({ length: Math.floor(maxTime / 5) + 1 }, (_, k) => k * 5).map(sec => {
          const y = PAD_TOP + sec * tScale;
          return (
            <g key={sec}>
              <line x1={0} y1={y} x2={width} y2={y} stroke="#1e293b" strokeWidth={0.5} />
              <text x={3} y={y - 3} fontSize={11} fill="#94a3b8">{sec}s</text>
            </g>
          );
        })}

        {/* Línea del reloj actual */}
        <line x1={0} y1={yNow} x2={width} y2={yNow} stroke="#eab308" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />

        {layout.map(tr => {
          const isSel = selectedStation === tr.code;
          const wavePath = buildWavePath(tr.code, tr.x);
          const yP = tr.tP != null ? PAD_TOP + tr.tP * tScale : null;
          const yS = tr.tS != null ? PAD_TOP + tr.tS * tScale : null;
          return (
            <g key={tr.code} onClick={() => onSelectStation?.(tr.code)} style={{ cursor: 'pointer' }}>
              {/* Eje vertical de la traza */}
              <line x1={tr.x} y1={PAD_TOP} x2={tr.x} y2={axisBottom} stroke={isSel ? '#94a3b8' : '#334155'} strokeWidth={isSel ? 1 : 0.5} />

              {/* Forma de onda (revelada hasta elapsed) */}
              {wavePath && (
                <path d={wavePath} fill="none" stroke={isSel ? '#e2e8f0' : '#94a3b8'} strokeWidth={0.9} />
              )}

              {/* Marca P */}
              {yP != null && elapsed >= (tr.tP ?? Infinity) && (
                <g>
                  <line x1={tr.x - TRACE_HALF_WIDTH} y1={yP} x2={tr.x + TRACE_HALF_WIDTH} y2={yP} stroke={COLOR_P} strokeWidth={1.5} />
                  <text x={tr.x + TRACE_HALF_WIDTH + 2} y={yP + 4} fontSize={11} fontWeight={700} fill={COLOR_P}>P</text>
                </g>
              )}
              {/* Marca S */}
              {yS != null && elapsed >= (tr.tS ?? Infinity) && (
                <g>
                  <line x1={tr.x - TRACE_HALF_WIDTH} y1={yS} x2={tr.x + TRACE_HALF_WIDTH} y2={yS} stroke={COLOR_S} strokeWidth={1.5} />
                  <text x={tr.x + TRACE_HALF_WIDTH + 2} y={yS + 4} fontSize={11} fontWeight={700} fill={COLOR_S}>S</text>
                </g>
              )}

              {/* Spinner mientras la traza se calcula */}
              {loadingTraces?.has(tr.code) && (
                <circle cx={tr.x} cy={PAD_TOP + 12} r={5} fill="none" stroke="#C4553A" strokeWidth={1.5}
                  strokeDasharray="8 8" opacity={0.8}>
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${tr.x} ${PAD_TOP + 12}`} to={`360 ${tr.x} ${PAD_TOP + 12}`}
                    dur="0.8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Pie de cada traza: código (línea 1) y distancia (línea 2). Si
                  las columnas están muy juntas se rotan 45° (hay reserva de
                  LABEL_FOOTER_ROT px abajo para que no se corten). */}
              {rotateLabels ? (
                // Rotado: dos textos cortos, uno sobre otro, anclados por su
                // extremo derecho en el eje de la traza, girados −45°.
                <g transform={`rotate(-45 ${tr.x} ${axisBottom + 8})`}>
                  <text x={tr.x} y={axisBottom + 8} fontSize={11} fontWeight={isSel ? 700 : 600} fill={isSel ? '#e2e8f0' : '#cbd5e1'} textAnchor="end">{tr.code}</text>
                  <text x={tr.x} y={axisBottom + 20} fontSize={10} fill="#94a3b8" textAnchor="end">{tr.distancia_km.toFixed(0)} km</text>
                </g>
              ) : (
                <>
                  <text x={tr.x} y={axisBottom + 15} fontSize={11} fontWeight={isSel ? 700 : 600} fill={isSel ? '#e2e8f0' : '#cbd5e1'} textAnchor="middle">{tr.code}</text>
                  <text x={tr.x} y={axisBottom + 28} fontSize={11} fill="#94a3b8" textAnchor="middle">{tr.distancia_km.toFixed(0)} km</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
