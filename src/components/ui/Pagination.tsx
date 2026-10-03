/**
 * Controles de paginación reutilizables para las listas largas de la app
 * (reportes, panel admin, eventos del Mapa 3D). Muestra "Anterior / Página X de
 * N / Siguiente" y, opcionalmente, el rango de elementos visibles.
 *
 * Dos temas: claro (por defecto, tarjetas blancas) y oscuro (`theme="dark"`,
 * para el modal de eventos del Mapa 3D). No gestiona el estado: recibe `page`
 * y `onChange`; el contenedor hace el `slice`.
 * @module components/ui/Pagination
 */
import { ChevronLeft, ChevronRight } from '../../lib/icons';

/** Props del componente de paginación. */
interface PaginationProps {
  /** Página actual (1-indexada). */
  page: number;
  /** Total de elementos de la lista (ya filtrada). */
  totalItems: number;
  /** Elementos por página. */
  pageSize: number;
  /** Se llama con la nueva página al pulsar Anterior/Siguiente. */
  onChange: (page: number) => void;
  /** Tema de color. 'light' para tarjetas blancas, 'dark' para fondos oscuros. */
  theme?: 'light' | 'dark';
  /** Clase extra para el contenedor. */
  className?: string;
}

/**
 * Barra de paginación. Se oculta sola si solo hay una página (no estorba cuando
 * la lista es corta).
 */
export function Pagination({ page, totalItems, pageSize, onChange, theme = 'light', className = '' }: PaginationProps) {
  const total = Math.max(1, Math.ceil(totalItems / pageSize));
  if (total <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  const dark = theme === 'dark';
  const btn = dark
    ? 'border-white/15 text-stone-200 enabled:hover:bg-white/10 disabled:opacity-30'
    : 'border-stone-200 text-stone-600 enabled:hover:bg-stone-100 disabled:opacity-40';
  const label = dark ? 'text-stone-400' : 'text-stone-500';

  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap pt-1 ${className}`}>
      <span className={`text-xs ${label}`}>
        {from}–{to} de {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Página anterior"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:cursor-not-allowed ${btn}`}
        >
          <ChevronLeft size={14} /> Anterior
        </button>
        <span className={`text-xs font-semibold ${label}`}>
          {page} de {total}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(total, page + 1))}
          disabled={page >= total}
          aria-label="Página siguiente"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:cursor-not-allowed ${btn}`}
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
