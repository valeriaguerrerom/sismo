/**
 * Progreso de los capítulos del centro de aprendizaje, guardado en localStorage.
 *
 * Guarda un conjunto de ids de capítulo completados. "Completado" lo marca cada
 * capítulo cuando el usuario termina su reto. Es solo para la UI (marcas de
 * avance); no afecta a ningún dato del servidor.
 *
 * @module lib/useChapterProgress
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'sismonarino.educacion.progreso';

/** Lee el conjunto de capítulos completados de localStorage (tolerante a fallos). */
function readStore(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter(x => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function useChapterProgress() {
  const [done, setDone] = useState<Set<string>>(() => readStore());

  // Sincroniza entre pestañas: si otra pestaña cambia el progreso, se refleja.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setDone(readStore());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: Set<string>) => {
    setDone(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* sin persistencia */ }
  }, []);

  /** Marca un capítulo como completado. */
  const markDone = useCallback((id: string) => {
    setDone(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* sin persistencia */ }
      return next;
    });
  }, []);

  const isDone = useCallback((id: string) => done.has(id), [done]);

  return { done, isDone, markDone, persist };
}
