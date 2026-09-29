import { useState, useRef, useLayoutEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from '../../lib/icons';

interface TooltipProps {
  content: string;
  children?: ReactNode;
  showIcon?: boolean;
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
export function Tooltip({ content, children, showIcon = false }: TooltipProps) {
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

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => { if (!pinned) setVisible(false); }}
      // Toque/clic: alterna el tooltip fijado (clave para pantallas táctiles,
      // donde no hay hover). Evita que el gesto dispare acciones del contenedor.
      onClick={(e) => { e.stopPropagation(); setPinned(p => { const np = !p; setVisible(np); return np; }); }}
    >
      {children}
      {showIcon && <Info size={13} className="text-stone-400 cursor-help" />}
      {visible && pos && createPortal(
        <span
          style={{
            position: 'fixed', left: pos.left, top: pos.top,
            width: Math.min(TIP_WIDTH, window.innerWidth - 16),
          }}
          className="z-[100] normal-case font-normal tracking-normal bg-[#1A1A2E] text-white text-[11px] rounded-lg px-3 py-2 shadow-xl leading-relaxed pointer-events-none"
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
