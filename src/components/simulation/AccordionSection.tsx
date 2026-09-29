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
  /** Título mostrado en el encabezado (en formato oración, sin mayúsculas). */
  title: string;
  /** Ícono opcional a la izquierda del título. */
  icon?: ReactNode;
  /** Si la sección está abierta (controlado por el padre). */
  open: boolean;
  /** Se invoca al hacer clic en el encabezado (el padre alterna el estado). */
  onToggle: () => void;
  /** Ancla opcional para el tour guiado (atributo data-tour del contenedor). */
  dataTour?: string;
  /** Ancla del tour en el ENCABEZADO (altura fija, mejor para posicionar el popover). */
  headerDataTour?: string;
  children: ReactNode;
}

/**
 * Tarjeta con encabezado clicable que muestra u oculta su contenido.
 * El estado de apertura lo controla el panel padre (acordeón exclusivo).
 *
 * Dentro de una columna flex (`flex flex-col`): las secciones CERRADAS no se
 * encogen (`shrink-0`), así su encabezado siempre se ve completo con su espacio
 * normal; la sección ABIERTA ocupa el espacio restante (`flex-1 min-h-0`) y solo
 * SU CONTENIDO tiene scroll interno cuando no cabe. El encabezado nunca scrollea
 * (queda fijo arriba de la sección).
 */
export function AccordionSection({ title, icon, open, onToggle, dataTour, headerDataTour, children }: AccordionSectionProps) {
  return (
    <div
      data-tour={dataTour}
      className={`bg-white rounded-xl border border-stone-200/60 overflow-hidden flex flex-col ${
        open ? 'flex-1 min-h-0' : 'shrink-0'
      }`}
    >
      <button
        type="button"
        data-tour={headerDataTour}
        onClick={onToggle}
        aria-expanded={open}
        className="shrink-0 w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-stone-50/70 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-sm font-bold text-[#1A1A2E]">
          {icon}
          {title}
        </span>
        <ChevronRight
          size={14}
          className="text-stone-400 transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
      </button>
      {/* Solo el CONTENIDO de la sección abierta scrollea; pb-1 deja un pequeño
          margen para que el último campo no quede pegado ni cortado. */}
      {open && <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
