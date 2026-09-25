import { useEffect, useRef, useState } from 'react';
import { Page } from '../../lib/types';
import { LogoMark } from '../ui/Logo';

interface Props {
  onNavigate?: (page: Page) => void;
}

/** Evento real cuya forma de onda decimada alimenta la traza del footer. */
const FOOTER_WAVE = '/data/cm/CM_M6.3_2025-04-25T11-44-52/BBAC.json';
const TRACE_W = 1440;
const TRACE_H = 40;

/** Detecta prefers-reduced-motion (para no animar la traza). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Traza sísmica del footer: usa una forma de onda real decimada (componente
 * vertical del sismo ML 6.3, estación BBAC). Se dibuja de izquierda a derecha
 * una sola vez cuando el footer entra en pantalla (~2.5 s, ease-in-out), en
 * gris con baja opacidad para no competir con el contenido. Con
 * prefers-reduced-motion aparece dibujada sin animación.
 */
function FooterTrace() {
  const [path, setPath] = useState<string | null>(null);
  const [len, setLen] = useState(0);
  const [inView, setInView] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    let active = true;
    fetch(FOOTER_WAVE)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { waveData?: { vertical: number[] } } | null) => {
        const vals = d?.waveData?.vertical;
        if (!active || !vals || vals.length < 2) return;
        let peak = 1e-9;
        for (const v of vals) { const a = Math.abs(v); if (a > peak) peak = a; }
        const n = vals.length;
        const pts: string[] = [];
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * TRACE_W;
          const y = TRACE_H / 2 - (vals[i] / peak) * (TRACE_H / 2 - 2);
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        setPath(`M ${pts.join(' L ')}`);
      })
      .catch(() => { /* sin traza: el footer queda sin la línea superior */ });
    return () => { active = false; };
  }, []);

  // Longitud del trazo para animar el "dibujado".
  useEffect(() => {
    if (path && pathRef.current) setLen(pathRef.current.getTotalLength());
  }, [path]);

  // Observador que se dispara CADA vez que el footer entra/sale de la vista,
  // para redibujar la traza en cada reingreso (no solo la primera vez).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [path]);

  const dash = reduced ? undefined : len;
  // Fuera de vista: oculto (offset = longitud). En vista: dibujado (offset 0).
  const offset = reduced ? 0 : (inView && len > 0 ? 0 : len);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden" style={{ height: TRACE_H }} aria-hidden="true">
      {path && (
        <svg viewBox={`0 0 ${TRACE_W} ${TRACE_H}`} className="w-full" style={{ height: TRACE_H }} preserveAspectRatio="none">
          <path
            ref={pathRef}
            d={path}
            fill="none"
            stroke="#5A5A5A"
            strokeWidth="1"
            strokeLinejoin="round"
            opacity="0.28"
            style={{
              strokeDasharray: dash,
              strokeDashoffset: offset,
              transition: reduced ? undefined : 'stroke-dashoffset 2.5s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>
      )}
    </div>
  );
}

export function Footer({ onNavigate }: Props) {
  return (
    <footer className="bg-white border-t border-stone-200/60">
      {/* Traza sísmica real que atraviesa todo el ancho, se dibuja al entrar. */}
      <FooterTrace />
      <div className="app-container pb-6 pt-2">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LogoMark size={26} rounded={0.32} />
            <span className="font-bold text-sm text-[#1A1A2E]">SismoNariño</span>
          </div>
          <p className="text-[#5A5A5A] text-xs text-center">
            Desarrollado por Valeria Guerrero y Luisa Basante, Universidad Mariana, Pasto, Nariño
            {onNavigate && (
              <>
                {'. '}
                <button onClick={() => onNavigate('about')} className="text-[#2D6A4F] font-semibold hover:underline">
                  Acerca del proyecto
                </button>
              </>
            )}
          </p>
          <p className="text-[#5A5A5A] text-xs">
            Datos: SGC y OVSP
          </p>
        </div>
      </div>
    </footer>
  );
}
