/**
 * Envoltura visual compartida por Iniciar sesión, Registrarse, Recuperar
 * contraseña y Nueva contraseña. Diseño de una sola columna: logo, título,
 * subtítulo y la tarjeta del formulario, centrados en la página.
 *
 * El contenido se alinea ARRIBA a una distancia fija del navbar para que las
 * cuatro pantallas empiecen en la misma posición (sin centrado vertical, que
 * dejaba vacíos distintos según el alto del formulario).
 *
 * @module components/auth/AuthLayout
 */
import { ReactNode } from 'react';
import { LogoMark } from '../ui/Logo';

interface Props {
  /** Título grande (p. ej. "Iniciar sesión"). */
  title: string;
  /** Subtítulo bajo el título. */
  subtitle: string;
  /** Acción del logo (ir a Inicio). */
  onHome: () => void;
  /** Tarjeta del formulario y contenidos que van bajo el encabezado. */
  children: ReactNode;
  /** Contenido opcional entre el encabezado y la tarjeta (p. ej. avisos). */
  headerExtra?: ReactNode;
}

export function AuthLayout({ title, subtitle, onHome, children, headerExtra }: Props) {
  return (
    <div className="flex-1 min-h-0 bg-[#FAFAF8] px-4 pt-20 pb-8">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-4">
          <button onClick={onHome} className="inline-flex mx-auto mb-3" aria-label="Ir a Inicio">
            <LogoMark size={44} />
          </button>
          <h1 className="text-2xl font-black text-[#1A1A2E]">{title}</h1>
          <p className="text-stone-400 text-sm mt-1">{subtitle}</p>
          {headerExtra}
        </div>
        {children}
      </div>
    </div>
  );
}
