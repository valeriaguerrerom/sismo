/**
 * Centro de aprendizaje sísmico.
 *
 * Cinco capítulos, cada uno con su propio laboratorio interactivo (ondas,
 * magnitud, profundidad, historia y metodología) y tres apartados de consulta
 * (glosario, referencias y quiz). El progreso de cada capítulo se marca cuando
 * el usuario completa su reto, no al abrirlo. Al terminar los cinco aparece una
 * tarjeta de cierre para poner en práctica lo aprendido en el Simulador o el
 * Mapa 3D. La navegación entre capítulos es una columna en escritorio y una
 * fila deslizable en móvil.
 *
 * @module pages/Education
 */
import { useRef, useState } from 'react';
import { Check, HelpCircle, X } from '../lib/icons';
import { WaveLab } from '../components/education/WaveLab';
import { MagnitudeLab } from '../components/education/MagnitudeLab';
import { DepthLab } from '../components/education/DepthLab';
import { HistoryLab } from '../components/education/HistoryLab';
import { FdmMethodology } from '../components/education/FdmMethodology';
import { Glossary } from '../components/education/Glossary';
import { References } from '../components/education/References';
import { SeismicQuiz } from '../components/education/SeismicQuiz';
import { useChapterProgress } from '../lib/useChapterProgress';
import type { Page } from '../lib/types';

interface Props {
  onNavigate?: (page: Page) => void;
}

/** Capítulos del centro de aprendizaje, en orden. */
type ChapterId = 'ondas' | 'magnitud' | 'profundidad' | 'historia' | 'metodologia';
type ExtraId = 'glosario' | 'referencias' | 'quiz';

const CHAPTERS: { id: ChapterId; label: string }[] = [
  { id: 'ondas', label: 'Ondas' },
  { id: 'magnitud', label: 'Magnitud' },
  { id: 'profundidad', label: 'Profundidad' },
  { id: 'historia', label: 'Historia' },
  { id: 'metodologia', label: 'Metodología' },
];

const EXTRAS: { id: ExtraId; label: string }[] = [
  { id: 'glosario', label: 'Glosario' },
  { id: 'referencias', label: 'Referencias' },
  { id: 'quiz', label: 'Quiz' },
];

export function Education({ onNavigate }: Props) {
  const [active, setActive] = useState<ChapterId | ExtraId>('ondas');
  const { isDone, markDone } = useChapterProgress();
  const [showHelp, setShowHelp] = useState(false);

  // Al cambiar de apartado, sube el contenido a la vista (sin saltos bruscos).
  const contentRef = useRef<HTMLDivElement>(null);
  const go = (id: ChapterId | ExtraId) => {
    setActive(id);
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const chapterIndex = CHAPTERS.findIndex(c => c.id === active);
  const allChaptersDone = CHAPTERS.every(c => isDone(c.id));

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      {/* Encabezado */}
      <div className="bg-white border-b border-stone-200/60 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[#1A1A2E] font-bold text-xl">Centro de aprendizaje sísmico</h1>
            <p className="text-stone-400 text-xs mt-0.5">Cinco capítulos interactivos sobre los sismos de Nariño</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="Cómo usar los capítulos"
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border border-stone-200 text-stone-400 hover:text-[#C4553A] hover:border-[#C4553A]/40 transition-colors"
          >
            <HelpCircle size={16} />
          </button>
        </div>
      </div>

      {/* Barra de capítulos: fila deslizable en móvil, columna en escritorio */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 lg:grid lg:grid-cols-[200px_1fr] lg:gap-6">
        <nav className="lg:sticky lg:top-20 self-start mb-4 lg:mb-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-2 px-1 hidden lg:block">Capítulos</div>
          {/* En móvil: fila con scroll horizontal. En escritorio: lista vertical. */}
          <ol className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 scrollbar-thin snap-x">
            {CHAPTERS.map((c, i) => {
              const on = active === c.id;
              const done = isDone(c.id);
              return (
                <li key={c.id} className="flex-shrink-0 snap-start">
                  <button
                    onClick={() => go(c.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                      on ? 'bg-[#C4553A] text-white' : 'bg-white text-stone-600 border border-stone-200'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                      on ? 'bg-white/20 text-white' : done ? 'bg-[#2D6A4F] text-white' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {done && !on ? <Check size={11} /> : i + 1}
                    </span>
                    {c.label}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-2 mt-4 px-1 hidden lg:block">Consulta</div>
          <ol className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 mt-2 lg:mt-0 scrollbar-thin snap-x">
            {EXTRAS.map(x => {
              const on = active === x.id;
              return (
                <li key={x.id} className="flex-shrink-0 snap-start">
                  <button
                    onClick={() => go(x.id)}
                    className={`w-full px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                      on ? 'bg-[#1A1A2E] text-white' : 'bg-white text-stone-600 border border-stone-200'
                    }`}
                  >
                    {x.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Contenido del apartado activo */}
        <div key={active} ref={contentRef} className="animate-fade-in min-w-0 scroll-mt-20">
          {active === 'ondas' && <WaveLab onChallengeDone={() => markDone('ondas')} />}
          {active === 'magnitud' && <MagnitudeLab onChallengeDone={() => markDone('magnitud')} />}
          {active === 'profundidad' && <DepthLab onChallengeDone={() => markDone('profundidad')} />}
          {active === 'historia' && <HistoryLab onChallengeDone={() => markDone('historia')} />}
          {active === 'metodologia' && <FdmMethodology onChallengeDone={() => markDone('metodologia')} />}
          {active === 'glosario' && <Glossary />}
          {active === 'referencias' && <References />}
          {active === 'quiz' && <SeismicQuiz onGoToChapter={(id) => go(id)} />}

          {/* Cierre: aparece bajo cualquier capítulo cuando los cinco están
              completos. Un solo lugar para pasar a la práctica. */}
          {chapterIndex >= 0 && allChaptersDone && (
            <div className="mt-6 rounded-2xl border border-[#2D6A4F]/25 bg-[#2D6A4F]/5 p-5">
              <h3 className="text-base font-bold text-[#1A1A2E]">Completaste los cinco capítulos</h3>
              <p className="text-sm text-stone-600 mt-1 leading-relaxed">
                Ya puedes poner en práctica lo aprendido: genera tus propios sismogramas o explora la propagación en la región.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => onNavigate?.('simulation')} className="text-sm font-bold px-4 py-2 rounded-lg bg-[#C4553A] text-white">
                  Ir al Simulador
                </button>
                <button onClick={() => onNavigate?.('map3d')} className="text-sm font-bold px-4 py-2 rounded-lg bg-[#2D6A4F] text-white">
                  Ir al Mapa 3D
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ayuda breve: cómo usar los capítulos */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/40 px-4" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-2xl border border-stone-200/60 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-base font-bold text-[#1A1A2E]">Cómo usar el centro de aprendizaje</h3>
              <button onClick={() => setShowHelp(false)} aria-label="Cerrar" className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
            </div>
            <ul className="text-sm text-stone-600 space-y-2 leading-relaxed">
              <li>Recorre los cinco capítulos en orden o salta al que te interese desde la barra de arriba.</li>
              <li>Cada capítulo tiene una interacción grande con la que puedes experimentar, y un reto corto al final.</li>
              <li>Al terminar el reto, el capítulo queda marcado con un check verde.</li>
              <li>Cuando completes los cinco, verás un acceso para practicar en el Simulador y el Mapa 3D.</li>
              <li>En Consulta tienes el glosario, las referencias y un quiz general.</li>
            </ul>
            <button onClick={() => setShowHelp(false)} className="mt-5 w-full text-sm font-bold py-2.5 rounded-lg bg-[#C4553A] text-white">
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
