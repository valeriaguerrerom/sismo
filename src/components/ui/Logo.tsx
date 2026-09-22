/**
 * Marca de SismoNariño: volcán Galeras cruzado por una traza sísmica,
 * sobre un sello redondeado en tinta oscura. Se usa como isotipo (barra,
 * favicon, huella de pie de página) y opcionalmente con el nombre al lado.
 *
 * Es un asset de marca con colores fijos (no depende del tema claro/oscuro
 * del visor): mantiene su identidad igual en ambos modos, como el logo de
 * cualquier producto.
 */

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Radio de esquina relativo al tamaño (0–0.5). 0.28 ≈ rounded-2xl de Tailwind. */
  rounded?: number;
}

/** Solo el isotipo: sello con el volcán y la traza sísmica. */
export function LogoMark({ size = 36, className = '', rounded = 0.28 }: LogoMarkProps) {
  const r = 100 * rounded;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="SismoNariño"
    >
      <defs>
        <linearGradient id="sn-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22223A" />
          <stop offset="100%" stopColor="#14141F" />
        </linearGradient>
        <linearGradient id="sn-volcano" x1="10" y1="70" x2="90" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D9694B" />
          <stop offset="100%" stopColor="#B44730" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100" height="100" rx={r} fill="url(#sn-bg)" />
      <rect x="1.5" y="1.5" width="97" height="97" rx={Math.max(r - 1.5, 0)} fill="none" stroke="#FFFFFF" strokeOpacity="0.06" />

      {/* sol / actividad */}
      <circle cx="68" cy="30" r="6.5" fill="#D4A853" />

      {/* silueta del Galeras con cráter */}
      <path
        d="M12 68 L36 34 Q39.5 29.5 43 34 L47 40 L50 35 L53 40 L57 34 Q60.5 29.5 64 34 L88 68 Z"
        fill="url(#sn-volcano)"
      />
      <path d="M43 34 L47 40 L50 35 L53 40 L57 34 L54.5 45 L45.5 45 Z" fill="#14141F" fillOpacity="0.32" />

      {/* terreno */}
      <rect x="6" y="68" width="88" height="7" rx="1" fill="#2D6A4F" />

      {/* traza sísmica */}
      <polyline
        points="6,84 17,84 21,79 25,90 29,73 33,92 37,81 41,86 45,84 55,84 58,79 61,89 64,81 67,85 70,84 94,84"
        fill="none"
        stroke="#FAFAF8"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  size?: number;
  className?: string;
  /** Muestra "SismoNariño" + subtítulo junto al isotipo. */
  wordmark?: boolean;
  /** Clase de color para el nombre (por defecto tinta / blanco según fondo). */
  textClassName?: string;
}

/** Isotipo + nombre, como aparece en la barra de navegación. */
export function Logo({ size = 36, className = '', wordmark = true, textClassName = 'text-[#1A1A2E]' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="text-left leading-none">
          <span className={`font-bold text-base tracking-tight block ${textClassName}`}>SismoNariño</span>
          <span className="text-[#2D6A4F] text-[9px] leading-none block tracking-[0.15em] uppercase mt-0.5">
            Simulador Triaxial
          </span>
        </span>
      )}
    </span>
  );
}
