/**
 * Leyenda fija de la escena 3D (estilo Swaves): título, símbolos (estación,
 * hipocentro, frentes de onda P/S), barra de escala, flecha norte y rampa de
 * profundidad.
 *
 * La barra de escala y el ancho del dominio provienen del backend
 * (/api/scene-geometry). Si no están disponibles, esas piezas se omiten.
 *
 * Tipografía: Inter (la misma del sitio y de las etiquetas de la escena),
 * legible sobre el fondo oscuro.
 *
 * @module map3d/Legend
 */
import { useState } from 'react';
import { WAVE_COLORS } from '../../lib/waveColors';
import { kmToSceneUnits, depthToY, TERRAIN_EXAGGERATION, DOMAIN_WIDTH_KM, DOMAIN } from './domain';

// Factores de escala REALES, calculados desde las constantes de domain.ts (no
// escritos a mano). Si cambian las constantes, estos valores se actualizan solos.
//   HORIZ_PER_DEPTH_KM: cuántos km horizontales ocupa en el dibujo 1 km de
//     profundidad = (u/km profundidad)/(u/km horizontal). <1 porque la
//     profundidad está comprimida respecto a la horizontal.
//   RELIEF_EXAGGERATION: exageración vertical del relieve de la superficie.
const HORIZ_PER_DEPTH_KM = Math.abs(depthToY(1)) / kmToSceneUnits(1);
const RELIEF_EXAGGERATION = TERRAIN_EXAGGERATION;

/** Redondea a 2 decimales y quita ceros sobrantes (0.67 → "0.67", 2.0 → "2"). */
function fmtNum(v: number, dec = 2): string {
  return Number(v.toFixed(dec)).toString();
}

/**
 * Barra de escala de respaldo (cuando el backend no la entrega): elige un
 * número "redondo" de km ~1/4 del ancho del dominio (50, 100, 20…) para que la
 * barra ocupe una fracción legible del ancho total.
 */
function fallbackScaleKm(): number {
  const quarter = DOMAIN_WIDTH_KM / 4;
  const candidates = [10, 20, 25, 50, 100, 150, 200];
  // El mayor candidato que no supere ~1/3 del dominio.
  const limit = DOMAIN_WIDTH_KM / 3;
  let best = candidates[0];
  for (const c of candidates) if (c <= limit && Math.abs(c - quarter) <= Math.abs(best - quarter)) best = c;
  return best;
}

/** Rampa de profundidad de respaldo (etiquetas derivadas de DOMAIN.depthMax). */
function fallbackDepthRamp(): { label: string; color: string }[] {
  const max = DOMAIN.depthMax;
  const stops = [0, Math.round(max / 3), Math.round((2 * max) / 3), max];
  return stops.map(km => ({ label: `${km}`, color: '' }));
}

interface LegendProps {
  /** Barra de escala calculada por el backend {km, scene_units} o null. */
  scaleBar?: { km: number; scene_units: number } | null;
  /** Ancho del dominio en km (para rotular la barra) o null. */
  domainWidthKm?: number | null;
  /** Rampa de color por profundidad de los hipocentros del catálogo. */
  depthRamp?: { label: string; color: string }[];
}

/** Símbolos principales de la escena (coherentes con Scene3D). */
const ITEMS = [
  { label: 'Estación', color: '#9CA3AF', shape: 'triangle' as const },
  { label: 'Hipocentro', color: '#ffffff', shape: 'circle' as const },
  { label: 'Frente de onda P', color: WAVE_COLORS.P, shape: 'ring' as const },
  { label: 'Frente de onda S', color: WAVE_COLORS.S, shape: 'ring' as const },
];

// Escala de profundidad SECUENCIAL de un solo tono azul: claro (superficial) →
// oscuro (profundo). No usa púrpura, terracota, verde ni ocre, para no
// confundirse con los frentes de onda P/S. Coincide con la rampa del backend
// (_depth_color en api/scene.py) para que la leyenda y las esferas de
// hipocentros usen exactamente los mismos azules.
const DEPTH_PALETTE = ['#93C5FD', '#5B9BE0', '#3570B5', '#1E3A6E'];

/** Tipografía de la leyenda (Inter, la del sitio; coincide con las etiquetas 3D). */
const LABEL_FONT = "'Inter', system-ui, sans-serif";

/** Leyenda posicionada abajo a la derecha sobre la escena. */
export function Legend({ scaleBar, domainWidthKm, depthRamp }: LegendProps) {
  // La barra se dibuja a un ancho fijo en px; el rótulo usa los km del backend
  // o, si no llegó, un valor de respaldo calculado desde el dominio (así la
  // barra NUNCA desaparece aunque el backend no responda).
  const BAR_PX = 80;
  const barKm = scaleBar?.km ?? fallbackScaleKm();
  const widthKm = domainWidthKm ?? DOMAIN_WIDTH_KM;
  // Rampa de profundidad: la del backend o la de respaldo. Siempre presente.
  const ramp = (depthRamp && depthRamp.length > 0) ? depthRamp : fallbackDepthRamp();

  // En móvil la leyenda tapaba media escena. Se colapsa a un botón "ⓘ" y el
  // usuario la despliega cuando quiere; en pantallas grandes (lg+) va siempre
  // abierta como antes.
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-3 right-3 z-10" style={{ fontFamily: LABEL_FONT }}>
      {/* Botón compacto SOLO en móvil cuando está cerrada: despliega la leyenda. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="lg:hidden flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-bold text-stone-100"
          aria-label="Mostrar leyenda del mapa"
        >
          <span className="text-[#C4553A]">◉</span> Leyenda
        </button>
      )}

      {/* Panel de la leyenda: oculto en móvil si está cerrada; siempre visible en lg+. */}
      <div
        className={`${open ? 'block' : 'hidden'} lg:block bg-black/55 backdrop-blur-sm rounded-lg border border-white/15 px-3 py-2.5 max-w-[220px]`}
      >
      {/* Título + botón de cerrar (solo móvil) */}
      <div className="text-[12px] font-bold text-stone-100 mb-2 flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5"><span className="text-[#C4553A]">◉</span> Mapa 3D de Nariño</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="lg:hidden text-stone-400 text-base leading-none px-1"
          aria-label="Ocultar leyenda"
        >
          ×
        </button>
      </div>

      {/* Símbolos principales */}
      <div className="space-y-1.5">
        {ITEMS.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="inline-flex w-3.5 justify-center shrink-0">
              {item.shape === 'circle' && (
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              )}
              {item.shape === 'ring' && (
                <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: item.color }} />
              )}
              {item.shape === 'triangle' && (
                <span
                  className="w-0 h-0"
                  style={{
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderBottom: `9px solid ${item.color}`,
                  }}
                />
              )}
            </span>
            <span className="text-[11px] text-stone-100">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Aclaración del símbolo "~" que acompaña a algunas estaciones. */}
      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-start gap-1.5">
        <span className="text-[11px] text-stone-200">~</span>
        <span className="text-[10px] leading-snug text-stone-300">
          Ubicación aproximada (casco urbano del municipio).
        </span>
      </div>

      {/* Rampa de profundidad de los hipocentros del catálogo (azul secuencial,
          para no confundirse con los frentes P/S). Siempre presente: usa la del
          backend o, si no llegó, la de respaldo derivada de DOMAIN.depthMax. */}
      <div className="mt-2.5 pt-2 border-t border-white/10">
        <div className="text-[10px] text-stone-300 mb-1">Profundidad (km)</div>
        <div className="flex h-2.5 rounded overflow-hidden">
          {ramp.map((r, i) => (
            <span
              key={r.label}
              className="flex-1"
              style={{ backgroundColor: DEPTH_PALETTE[i] ?? DEPTH_PALETTE[DEPTH_PALETTE.length - 1] }}
              title={r.label}
            />
          ))}
        </div>
        <div className="flex justify-between mt-0.5">
          {ramp.map(r => (
            <span key={r.label} className="text-[9px] text-stone-300">{r.label}</span>
          ))}
        </div>
      </div>

      {/* Barra de escala + flecha norte (más grandes y legibles) */}
      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-end justify-between gap-3">
        <div
          className="flex flex-col items-start"
          title={`Dominio ≈ ${Math.round(widthKm)} km de ancho`}
        >
          <div className="h-2 bg-stone-100 rounded-sm" style={{ width: `${BAR_PX}px` }} />
          <span className="text-[11px] font-semibold text-stone-100 mt-1">{barKm} km</span>
        </div>
        {/* Flecha norte: en la vista por defecto y superior el norte queda arriba. */}
        <div className="flex flex-col items-center">
          <span className="text-[#D4A853] text-2xl leading-none">↑</span>
          <span className="text-[12px] font-bold text-stone-100">N</span>
        </div>
      </div>

      {/* Nota de escalas reales (valores calculados desde domain.ts). Aclara que
          la profundidad está comprimida respecto a la horizontal y que el
          relieve está exagerado, para no leer la escena como si fuera a escala. */}
      <div className="mt-2 pt-2 border-t border-white/10 text-[9px] leading-snug text-stone-400">
        1 km de profundidad se dibuja como {fmtNum(HORIZ_PER_DEPTH_KM)} km horizontales; relieve exagerado {fmtNum(RELIEF_EXAGGERATION, 1)} veces.
      </div>
      </div>
    </div>
  );
}
