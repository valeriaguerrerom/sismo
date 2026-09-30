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
 * Cada tarjeta ocupa el ALTO DE SU CONTENIDO (sin scroll interno propio): la
 * sección abierta crece lo que necesite y la cerrada queda solo con su
 * encabezado. `shrink-0` evita que el flex de la columna aplaste las tarjetas.
 * El scroll vive SOLO en la columna (una sola barra); la sección no scrollea
 * por dentro, para no tener dos barras anidadas con textos largos.
 */
export function AccordionSection({ title, icon, open, onToggle, dataTour, headerDataTour, children }: AccordionSectionProps) {
  return (
    <div
      data-tour={dataTour}
      className="shrink-0 bg-white rounded-xl border border-stone-200/60 overflow-hidden"
    >
      <button
        type="button"
        data-tour={headerDataTour}
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-stone-50/70 transition-colors"
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
      {/* El cuerpo abierto crece hasta el alto de su contenido, SIN scroll
          interno propio: así no aparece una segunda barra de scroll dentro de la
          sección (se veía mal con textos largos como la interpretación). Cuando
          el conjunto no cabe, es la COLUMNA la que scrollea, una sola barra. */}
      {open && (
        <div className="animate-soft-in px-4 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}
