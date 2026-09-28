/**
 * Barra de progreso de la simulación FDM. Inline (no interrumpe con overlay):
 * muestra el isotipo del volcán latiendo, el porcentaje de avance y un dato
 * curioso rotativo, en el estilo unificado con el loader del Mapa 3D pero en
 * variante clara (fondo del Simulador). El cómputo corre en el backend, así que
 * el porcentaje es una estimación de avance, no el paso exacto del motor.
 *
 * @module components/simulation/ProgressBar
 */
import { useEffect, useState } from 'react';
import { SimProgress } from '../../lib/types';
import { VolcanoLoader } from '../ui/VolcanoLoader';
import { LOADER_FACTS, randomFactIndex } from '../../lib/loaderFacts';

interface Props {
  progress: SimProgress;
}

export function ProgressBar({ progress }: Props) {
  // Dato curioso rotativo mientras corre la simulación.
  const [factIndex, setFactIndex] = useState(randomFactIndex);
  useEffect(() => {
    const id = setInterval(() => {
      setFactIndex(prev => (prev + 1) % LOADER_FACTS.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <VolcanoLoader size={64} label="" />
        <h3 className="mt-4 text-lg font-bold text-[#1A1A2E]">Generando pseudo-sismograma…</h3>
        <p className="mt-0.5 font-mono text-[11px] text-[#C4553A]">Resolviendo la ecuación de onda elástica (FDM)</p>

        {/* Barra de avance (el cómputo ocurre en el servidor). */}
        <div className="mt-5 w-full">
          <div className="flex items-center justify-between font-mono text-[10px] text-stone-500 mb-1.5">
            <span>Procesando en el servidor…</span>
            <span className="text-[#C4553A] font-bold">{progress.percent}%</span>
          </div>
          <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#C4553A] to-[#D4A853] rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Dato curioso rotativo (entretiene la espera). */}
        <div className="mt-6 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#C4553A] mb-1">¿Sabías que…?</p>
          <p key={factIndex} className="text-[12px] leading-snug text-stone-600 animate-fade-in">
            {LOADER_FACTS[factIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
