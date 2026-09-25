/**
 * Marca de SismoNariño: pin de ubicación sobre el volcán Galeras cruzado por
 * una traza sísmica. Se usa como isotipo (barra, favicon, pie de página) y
 * opcionalmente con el nombre al lado.
 *
 * El isotipo es una imagen de marca (`public/images/logo-mark.png`) con
 * colores fijos, no depende del tema claro/oscuro del visor.
 */

/** Ruta del isotipo recortado y optimizado (fondo transparente). */
const LOGO_MARK_SRC = '/images/logo-mark.png';

interface LogoMarkProps {
  size?: number;
  className?: string;
  /** Radio de esquina relativo al tamaño (0–0.5). Se mantiene por compatibilidad. */
  rounded?: number;
}

/** Solo el isotipo: pin + volcán + traza sísmica. */
export function LogoMark({ size = 36, className = '', rounded }: LogoMarkProps) {
  return (
    <img
      src={LOGO_MARK_SRC}
      width={size}
      height={size}
      className={className}
      style={rounded != null ? { borderRadius: `${rounded * 100}%` } : undefined}
      alt="SismoNariño"
      draggable={false}
    />
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
          <span className="text-[#2D6A4F] text-[10px] leading-none block mt-0.5">
            Simulador triaxial
          </span>
        </span>
      )}
    </span>
  );
}
