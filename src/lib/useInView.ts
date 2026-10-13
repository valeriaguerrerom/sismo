import { useEffect, useRef, useState } from 'react';

/**
 * Detecta cuándo un elemento entra por primera vez en el viewport.
 *
 * Usa un `IntersectionObserver` para activar animaciones de entrada al hacer
 * scroll. El estado pasa a `true` una sola vez (al primer cruce del umbral) y
 * no se revierte: el observer se desconecta tras la primera intersección.
 *
 * @param threshold Fracción del elemento visible (0 a 1) que dispara la
 *   detección. Por defecto `0.1` (10 % visible).
 * @returns Un objeto con `ref` (asígnalo al elemento a observar) e `inView`
 *   (booleano que indica si el elemento ya entró en el viewport).
 */
export function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, inView };
}
