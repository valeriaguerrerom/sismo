import { useState, useRef, useLayoutEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from '../../lib/icons';

interface TooltipProps {
  content: string;
  children?: ReactNode;
  showIcon?: boolean;
  /**
   * Solo hover (escritorio): el clic NO fija el tooltip. Úsalo cuando el
   * Tooltip envuelve un control con su propia acción (p. ej. las pestañas de la
   * Visualización): al hacer clic, el tooltip se oculta y la acción del control
   * corre normal, en vez de quedar "pegado". Sin esta bandera, el texto sin
   * ícono se puede tocar para fijar el tooltip (útil en táctil).
   */
  hoverOnly?: boolean;
  /** Clases extra para el disparador (p. ej. `flex-1` para ocupar el ancho). */
  className?: string;
  /** Si es true, no muestra el tooltip (pero sí renderiza al hijo). */
  disabled?: boolean;
}

/** Ancho fijo del tooltip (px). Se usa para clampear con precisión al viewport. */
const TIP_WIDTH = 224; // 14rem

/**
 * Tooltip que aparece al pasar el cursor. Se renderiza en un portal sobre
 * `document.body` y se posiciona con `position: fixed` según la posición real
 * del disparador. El portal evita que transforms/overflow de contenedores
 * ancestros (columnas sticky, tarjetas con hover, etc.) desplacen el tooltip.
 * Se recalcula la posición al hacer scroll o redimensionar, y se ajusta (clamp)
 * al ancho de la ventana para que nunca se corte por ningún borde.
 */
export function Tooltip({ content, children, showIcon = false, hoverOnly = false, className = '', disabled = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  // En táctil no hay hover: el tooltip se fija con un toque y se cierra tocando
  // fuera o tocando de nuevo. `pinned` distingue ese modo del hover de escritorio.
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);

  const measure = useCallback(() => {
    if (!triggerRef.current) return;
    const margin = 8;
    const maxW = Math.min(TIP_WIDTH, window.innerWidth - margin * 2);
    const trg = triggerRef.current.getBoundingClientRect();
    const centerX = trg.left + trg.width / 2;
    let left = centerX - maxW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - maxW - margin));
    const top = trg.bottom + 8;
    const arrow = Math.max(10, Math.min(centerX - left, maxW - 10));
    setPos({ left, top, arrow });
  }, []);

  // Medir al mostrarse y re-medir si el usuario hace scroll o cambia el tamaño.
  useLayoutEffect(() => {
    if (!visible) { setPos(null); return; }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [visible, content, measure]);

  // Al fijar por toque, cerrar cuando se toca/clica fuera del disparador.
  useLayoutEffect(() => {
    if (!pinned) return;
    const onDocDown = (e: Event) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setPinned(false); setVisible(false);
      }
    };
    document.addEventListener('pointerdown', onDocDown, true);
    return () => document.removeEventListener('pointerdown', onDocDown, true);
  }, [pinned]);

  // Alterna el tooltip fijado (toque). Solo lo llama el ícono de información (o
  // el texto cuando NO hay control envuelto), nunca el contenedor de un botón.
  const toggle = () => setPinned(p => { const np = !p; setVisible(np); return np; });

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex items-center gap-1 ${className}`}
      // El hover (escritorio) se mantiene en todo el disparador; NO se pone
      // onClick aquí para no interceptar los clics del control que se envuelve
      // (botones, selectores, deslizadores). El toque táctil se maneja en el
      // ícono de información (o en el texto si no hay ícono).
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => { if (!pinned) setVisible(false); }}
    >
      {/* Sin ícono: por defecto el texto se puede tocar para fijar el tooltip
          (útil en táctil). Con `hoverOnly` (el Tooltip envuelve un control con
          su propia acción, p. ej. las pestañas) el clic NO fija el tooltip: lo
          oculta y deja fluir la acción del control, para que no quede "pegado".
          Con ícono, el texto/control se deja intacto. */}
      {showIcon ? children : (
        <span
          className="cursor-help"
          onClick={() => { if (hoverOnly) { setPinned(false); setVisible(false); } else { toggle(); } }}
        >
          {children}
        </span>
      )}
      {showIcon && (
        <Info
          size={13}
          className="text-stone-400 cursor-help shrink-0"
          role="button"
          aria-label="Ver explicación"
          tabIndex={0}
          // El toque/clic SOBRE EL ÍCONO fija el tooltip. stopPropagation aquí
          // evita que el gesto sobre el ícono active el control envuelto, pero
          // el clic sobre el control (fuera del ícono) fluye normal.
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        />
      )}
      {visible && pos && !disabled && createPortal(
        <span
          style={{
            position: 'fixed', left: pos.left, top: pos.top,
            width: Math.min(TIP_WIDTH, window.innerWidth - 16),
          }}
          className="z-[300] normal-case font-normal tracking-normal bg-[#1A1A2E] text-white text-[11px] rounded-lg px-3 py-2 shadow-xl leading-relaxed pointer-events-none"
        >
          {content}
          <span
            className="absolute bottom-full border-4 border-transparent border-b-[#1A1A2E]"
            style={{ left: pos.arrow, transform: 'translateX(-50%)' }}
          />
        </span>,
        document.body,
      )}
    </span>
  );
}
