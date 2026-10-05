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
  /** Fondo oscuro (p. ej. la barra del Mapa 3D): aclara el nombre y el subtítulo. */
  dark?: boolean;
}

/** Isotipo + nombre, como aparece en la barra de navegación. */
export function Logo({ size = 36, className = '', wordmark = true, textClassName, dark = false }: LogoProps) {
  // Color del nombre: el que pidan explícitamente; si no, blanco en fondo
  // oscuro y tinta en fondo claro.
  const nameColor = textClassName ?? (dark ? 'text-white' : 'text-[#1A1A2E]');
  // El subtítulo verde no contrasta sobre el tinta oscuro; en modo oscuro se
  // usa el dorado de la marca, que sí resalta.
  const subColor = dark ? 'text-[#D4A853]' : 'text-[#2D6A4F]';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} className="flex-shrink-0" />
      {wordmark && (
        <span className="text-left leading-none whitespace-nowrap">
          <span className={`font-bold text-base tracking-tight block ${nameColor}`}>SismoNariño</span>
          <span className={`${subColor} text-[10px] leading-none block mt-0.5`}>
            Simulador triaxial
          </span>
        </span>
      )}
    </span>
  );
}
