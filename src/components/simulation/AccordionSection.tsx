/**
 * Sección colapsable (acordeón) para los paneles de parámetros y resultados.
 *
 * Es un componente CONTROLADO: el padre decide qué sección está abierta a través
 * de `open` y reacciona al clic con `onToggle`. Esto permite un acordeón
 * exclusivo (tipo radio) por columna: al abrir una sección, el padre cierra las
 * demás de esa misma columna. Así nunca se corta contenido por tener varias
 * secciones abiertas a la vez.
 *
 * @module components/simulation/AccordionSection
 */
import { type ReactNode } from 'react';
import { ChevronRight } from '../../lib/icons';

interface AccordionSectionProps {
  /** Título mostrado en el encabezado (se pinta en mayúsculas). */
  title: string;
  /** Ícono opcional a la izquierda del título. */
  icon?: ReactNode;
  /** Si la sección está abierta (controlado por el padre). */
  open: boolean;
  /** Se invoca al hacer clic en el encabezado (el padre alterna el estado). */
  onToggle: () => void;
  /** Ancla opcional para el tour guiado (atributo data-tour del contenedor). */
  dataTour?: string;
  children: ReactNode;
}

/**
 * Tarjeta con encabezado clicable que muestra u oculta su contenido.
 * El estado de apertura lo controla el panel padre (acordeón exclusivo).
 */
export function AccordionSection({ title, icon, open, onToggle, dataTour, children }: AccordionSectionProps) {
  return (
    <div data-tour={dataTour} className="bg-white rounded-xl border border-stone-200/60 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-stone-50/70 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#1A1A2E]">
          {icon}
          {title}
        </span>
        <ChevronRight
          size={14}
          className="text-stone-400 transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
