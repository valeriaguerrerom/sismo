/**
 * Loader de carga con el isotipo de SismoNariño (volcán) latiendo y ondas
 * sísmicas concéntricas que se expanden detrás. Reemplaza los spinners
 * genéricos para dar identidad a las esperas. Respeta prefers-reduced-motion
 * (sin animación, solo el isotipo estático) vía las clases de index.css.
 *
 * @module components/ui/VolcanoLoader
 */
import { LogoMark } from './Logo';

interface VolcanoLoaderProps {
  /** Tamaño del isotipo en px. */
  size?: number;
  /** Texto opcional bajo el loader. */
  label?: string;
  /** Si ocupa toda la pantalla y centra (para el gate de sesión). */
  fullscreen?: boolean;
  /** Variante para fondos oscuros (texto claro), p. ej. el visor del Mapa 3D. */
  dark?: boolean;
}

export function VolcanoLoader({ size = 48, label = 'Cargando…', fullscreen = false, dark = false }: VolcanoLoaderProps) {
  const ring = size * 1.05;
  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center" style={{ width: size * 1.6, height: size * 1.6 }}>
        {/* Ondas sísmicas concéntricas terracota. */}
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className={`volcano-loader-ring absolute rounded-full border ${i === 1 ? 'd1' : i === 2 ? 'd2' : ''}`}
            style={{ width: ring, height: ring, borderColor: '#C4553A' }}
            aria-hidden="true"
          />
        ))}
        {/* Isotipo del volcán latiendo. */}
        <LogoMark size={size} className="volcano-loader-mark relative" />
      </div>
      {label && <span className={`text-sm ${dark ? 'text-stone-300' : 'text-stone-400'}`}>{label}</span>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAFAF8' }}>
        {content}
      </div>
    );
  }
  return content;
}
