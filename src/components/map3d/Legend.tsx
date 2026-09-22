/**
 * Leyenda fija de la escena 3D (estilo Swaves): título, símbolos (estación,
 * hipocentro, ondas P/S), barra de escala, flecha norte y rampa de profundidad.
 *
 * La barra de escala y el ancho del dominio provienen del backend
 * (/api/scene-geometry). Si no están disponibles, esas piezas se omiten.
 *
 * @module map3d/Legend
 */

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
  { label: 'Estación', color: '#ff4d4d', shape: 'triangle' as const },
  { label: 'Hipocentro', color: '#ffffff', shape: 'circle' as const },
  { label: 'Ondas P', color: '#ff4d4d', shape: 'ring' as const },
  { label: 'Ondas S', color: '#22d3ee', shape: 'ring' as const },
];

/** Leyenda posicionada abajo a la derecha sobre la escena. */
export function Legend({ scaleBar, domainWidthKm, depthRamp }: LegendProps) {
  // La barra se dibuja a un ancho fijo en px; el rótulo usa los km del backend.
  const BAR_PX = 60;
  const barKm = scaleBar?.km ?? null;

  return (
    <div className="absolute bottom-3 right-3 z-10 bg-black/50 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2 font-mono max-w-[200px]">
      {/* Título corto */}
      <div className="text-[11px] font-bold text-stone-100 mb-1.5 flex items-center gap-1.5">
        <span className="text-[#C4553A]">◉</span> Mapa 3D · Nariño
      </div>

      {/* Símbolos principales */}
      <div className="space-y-1.5">
        {ITEMS.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="inline-flex w-3.5 justify-center">
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
            <span className="text-[10px] text-stone-200 tracking-wide">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Rampa de profundidad de los hipocentros del catálogo */}
      {depthRamp && depthRamp.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="text-[9px] text-stone-400 uppercase mb-1">Profundidad</div>
          <div className="flex h-2 rounded overflow-hidden">
            {depthRamp.map(r => (
              <span key={r.label} className="flex-1" style={{ backgroundColor: r.color }} title={r.label} />
            ))}
          </div>
          <div className="flex justify-between mt-0.5">
            {depthRamp.map(r => (
              <span key={r.label} className="text-[8px] text-stone-400">{r.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Barra de escala + flecha norte */}
      <div className="mt-2 pt-2 border-t border-white/10 flex items-end justify-between gap-3">
        {barKm != null && (
          <div
            className="flex flex-col items-start"
            title={domainWidthKm != null ? `Dominio ≈ ${Math.round(domainWidthKm)} km de ancho` : undefined}
          >
            <div className="h-1.5 bg-stone-200 rounded-sm" style={{ width: `${BAR_PX}px` }} />
            <span className="text-[8px] text-stone-400 mt-0.5">{barKm} km</span>
          </div>
        )}
        {/* Flecha norte: el norte es hacia -Z (vista por defecto → "hacia atrás"). */}
        <div className="flex flex-col items-center">
          <span className="text-[#D4A853] text-sm leading-none">↑</span>
          <span className="text-[9px] font-bold text-stone-200">N</span>
        </div>
      </div>
    </div>
  );
}
