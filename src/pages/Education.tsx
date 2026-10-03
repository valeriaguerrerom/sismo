/**
 * Centro de aprendizaje sísmico.
 *
 * Estructura de "capítulos" (ruta numerada en una barra lateral): Ondas,
 * Magnitud, Profundidad, Historia y Metodología. Cada capítulo es un
 * laboratorio con un lienzo interactivo grande y texto corto al lado. El
 * progreso por capítulo se guarda en localStorage. Glosario, referencias y
 * quiz quedan en un bloque aparte. La fuente de cada capítulo va al pie.
 *
 * @module pages/Education
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, Award, CheckCircle, XCircle, RotateCcw, ArrowRight,
  BookMarked, Library, Flame, Activity, Check, HelpCircle,
} from '../lib/icons';
import { Tooltip } from '../components/ui/Tooltip';
import { useAuth } from '../lib/authContext';
import { startTour } from '../tours/useTour';
import { buildEducacionSteps } from '../tours/educacion';
import {
  loadQuizQuestions, loadTimelineEvents,
  type QuizQuestion, type TimelineEvent,
} from '../lib/educationData';
import { FdmMethodology } from '../components/education/FdmMethodology';
import { Glossary } from '../components/education/Glossary';
import { References } from '../components/education/References';
import { WaveLab } from '../components/education/WaveLab';
import { DepthLab } from '../components/education/DepthLab';
import { VolcanoLoader } from '../components/ui/VolcanoLoader';
import { useChapterProgress } from '../lib/useChapterProgress';
import type { Page } from '../lib/types';

interface Props {
  onNavigate?: (page: Page) => void;
}

/* ═══════════════ Capítulo: Magnitud (escala interactiva) ═══════════════ */
function MagnitudeScale() {
  const [mag, setMag] = useState(5.0);
  const energy = Math.pow(10, 1.5 * mag + 4.8);
  const radius = Math.min(120, Math.pow(10, (mag - 2) * 0.5) * 8);

  const info = (m: number) => {
    if (m < 3) return { label: 'Micro', desc: 'Generalmente no se siente; solo lo detectan los instrumentos.', color: '#94a3b8' };
    if (m < 4) return { label: 'Menor', desc: 'Se siente levemente. Rara vez causa daño.', color: '#2D6A4F' };
    if (m < 5) return { label: 'Ligero', desc: 'Se siente de forma notable; objetos pueden moverse.', color: '#22c55e' };
    if (m < 6) return { label: 'Moderado', desc: 'Puede causar daño en construcciones vulnerables.', color: '#C4553A' };
    if (m < 7) return { label: 'Fuerte', desc: 'Daño importante en la zona cercana al epicentro.', color: '#ef4444' };
    if (m < 8) return { label: 'Mayor', desc: 'Daño severo en áreas extensas.', color: '#dc2626' };
    return { label: 'Gran sismo', desc: 'Destrucción cerca del epicentro; efectos a gran distancia.', color: '#7f1d1d' };
  };
  const i = info(mag);
  const fmtE = (e: number) => e >= 1e18 ? `${(e / 1e18).toFixed(1)} EJ` : e >= 1e15 ? `${(e / 1e15).toFixed(1)} PJ` : e >= 1e12 ? `${(e / 1e12).toFixed(1)} TJ` : e >= 1e9 ? `${(e / 1e9).toFixed(1)} GJ` : `${(e / 1e6).toFixed(1)} MJ`;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200/60 p-5">
        <div className="relative h-48 bg-stone-50 rounded-xl border border-stone-200/60 flex items-center justify-center overflow-hidden">
          <div className="rounded-full transition-all duration-500 flex items-center justify-center"
            style={{ width: `${radius}px`, height: `${radius}px`, backgroundColor: `${i.color}20`, border: `2px solid ${i.color}` }}>
            <span className="text-2xl font-black" style={{ color: i.color }}>{mag.toFixed(1)}</span>
          </div>
        </div>
        <input type="range" min={2} max={9.5} step={0.1} value={mag} onChange={e => setMag(Number(e.target.value))} className="w-full mt-3" style={{ accentColor: i.color }} />
        <div className="flex justify-between text-[10px] text-stone-500 mt-1"><span>2.0</span><span>5.0</span><span>9.5</span></div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${i.color}10`, border: `1px solid ${i.color}30` }}>
            <div className="text-lg font-black" style={{ color: i.color }}>{i.label}</div>
            <div className="text-[10px] text-stone-500 mt-0.5">Mw {mag.toFixed(1)}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-center border border-stone-200/60">
            <div className="text-[10px] text-stone-500">Energía liberada</div>
            <div className="text-xs font-bold text-[#1A1A2E]">{fmtE(energy)}</div>
          </div>
        </div>
      </div>
      <p className="text-sm text-stone-600 leading-relaxed">{i.desc}</p>
      <p className="text-sm text-stone-600 leading-relaxed">
        Cada unidad de magnitud multiplica por diez la amplitud del movimiento y por unas 32 veces la energía liberada.
      </p>
      <p className="text-[10px] text-stone-400 leading-snug">Fuente: Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.</p>
    </div>
  );
}

/* ═══════════════ Capítulo: Historia (línea de tiempo) ═══════════════ */
function HistoricalTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(0);

  useEffect(() => { loadTimelineEvents().then(e => { setEvents(e); setLoading(false); }); }, []);
  if (loading || events.length === 0) return <div className="py-8"><VolcanoLoader size={40} label="Cargando línea de tiempo…" /></div>;

  const ev = events[sel];
  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-5">
      <div className="relative mb-6">
        <div className="h-1 bg-stone-200 rounded-full" />
        <div className="flex justify-between absolute inset-x-0 -top-3 flex-wrap gap-y-6">
          {events.map((e, i) => (
            <button key={e.id} onClick={() => setSel(i)} className="flex flex-col items-center group">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                sel === i ? 'bg-[#C4553A] text-white scale-110' : e.event_type === 'volcanic' ? 'bg-[#C4553A]/20 text-[#C4553A]' : 'bg-stone-200 text-stone-500'
              }`}>
                {e.event_type === 'volcanic' ? <Flame size={13} /> : <Activity size={13} />}
              </div>
              <span className={`text-[9px] mt-1 font-bold ${sel === i ? 'text-[#C4553A]' : 'text-stone-400'}`}>{e.year}</span>
            </button>
          ))}
        </div>
      </div>
      <div key={sel} className="animate-fade-in mt-10 rounded-xl p-4 border" style={{
        backgroundColor: ev.event_type === 'volcanic' ? '#C4553A08' : '#2D6A4F08',
        borderColor: ev.event_type === 'volcanic' ? '#C4553A20' : '#2D6A4F20',
      }}>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: ev.event_type === 'volcanic' ? '#C4553A' : '#2D6A4F' }}>
            {ev.event_type === 'volcanic' ? <Flame size={13} /> : <Activity size={13} />}
            {ev.event_type === 'volcanic' ? 'Evento volcánico' : 'Evento tectónico'}
          </span>
          <span className="text-xs text-stone-400">· {ev.event_date ?? ev.year}</span>
          {ev.magnitude && <span className="text-xs font-semibold text-stone-500">· {ev.magnitude}</span>}
        </div>
        <h4 className="text-xl font-black text-[#1A1A2E] mb-2">{ev.title}</h4>
        <p className="text-stone-600 text-sm leading-relaxed">{ev.description}</p>
        {ev.source && (
          <p className="text-[10px] text-stone-400 mt-3 leading-snug">
            Fuente: {ev.source}
            {ev.source_url && <> <a href={ev.source_url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline break-all">{ev.source_url}</a></>}
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ Quiz (bloque aparte) ═══════════════ */
function SeismicQuiz() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => { loadQuizQuestions().then(q => { setQuestions(q); setLoading(false); }); }, []);
  if (loading || questions.length === 0) return <div className="py-8"><VolcanoLoader size={40} label="Cargando preguntas…" /></div>;

  const q = questions[current];
  const answer = (idx: number) => { if (showResult) return; setSelected(idx); setShowResult(true); if (idx === q.correct_index) setScore(s => s + 1); };
  const next = () => { if (current < questions.length - 1) { setCurrent(c => c + 1); setSelected(null); setShowResult(false); } else setFinished(true); };
  const reset = () => { setCurrent(0); setSelected(null); setScore(0); setShowResult(false); setFinished(false); };

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="bg-white rounded-2xl border border-stone-200/60 p-8 text-center">
        <h3 className="text-xl font-black text-[#1A1A2E] mb-2">Resultado</h3>
        <div className="text-4xl font-black mb-2" style={{ color: pct >= 60 ? '#2D6A4F' : '#C4553A' }}>{score}/{questions.length}</div>
        <p className="text-stone-500 text-sm mb-6">Acertaste el {pct}% de las preguntas</p>
        <button onClick={reset} className="flex items-center gap-2 mx-auto bg-[#2D6A4F] text-white px-6 py-2.5 rounded-xl font-bold text-sm"><RotateCcw size={14} /> Intentar de nuevo</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
      <div className="bg-stone-50 px-5 py-3 flex items-center justify-between border-b border-stone-200/60">
        <span className="text-[#1A1A2E] text-sm font-bold flex items-center gap-2"><Award size={16} className="text-[#C4553A]" /> Quiz sísmico</span>
        <span className="text-stone-500 text-xs">{current + 1}/{questions.length} · {score} pts</span>
      </div>
      <div className="p-5">
        <h3 className="text-base font-bold text-[#1A1A2E] mb-4">{q.question}</h3>
        <div className="space-y-2 mb-4">
          {q.options.map((opt, idx) => {
            let cls = 'border-stone-200 bg-stone-50 text-stone-700';
            if (showResult) {
              if (idx === q.correct_index) cls = 'border-green-500/30 bg-green-500/10 text-green-700';
              else if (idx === selected) cls = 'border-red-500/30 bg-red-500/10 text-red-700';
              else cls = 'border-stone-100 bg-stone-50 text-stone-400';
            }
            return (
              <button key={idx} onClick={() => answer(idx)} className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-3 ${cls}`}>
                <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {showResult && idx === q.correct_index ? <CheckCircle size={14} className="text-green-500" /> : showResult && idx === selected ? <XCircle size={14} className="text-red-500" /> : String.fromCharCode(65 + idx)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
        {showResult && (
          <div className={`rounded-xl p-3 mb-4 ${selected === q.correct_index ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            <p className={`text-xs leading-relaxed ${selected === q.correct_index ? 'text-green-700' : 'text-red-700'}`}>
              <span className="font-bold">{selected === q.correct_index ? '✓ ¡Correcto!' : '✗ Incorrecto.'}</span> {q.explanation}
            </p>
            {q.source && (
              <p className="text-[10px] text-stone-500 mt-1.5 leading-snug">
                Fuente: {q.source}
                {q.source_url && <> <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline break-all">{q.source_url}</a></>}
              </p>
            )}
          </div>
        )}
        {showResult && (
          <button onClick={next} className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white py-2.5 rounded-xl font-bold text-sm">
            {current < questions.length - 1 ? <><ArrowRight size={14} /> Siguiente pregunta</> : <><Award size={14} /> Ver resultado</>}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ Página principal ═══════════════ */
type ChapterId = 'ondas' | 'magnitud' | 'profundidad' | 'historia' | 'metodologia';
type ExtraId = 'glosario' | 'referencias' | 'quiz';

export function Education({ onNavigate }: Props) {
  const [active, setActive] = useState<ChapterId | ExtraId>('ondas');
  const { isDone, markDone } = useChapterProgress();
  const { user, markTourSeen } = useAuth();

  // ── Tour guiado ──
  const tourRef = useRef(false); // evita relanzar el auto-tour
  const launchTour = useCallback(() => {
    startTour(buildEducacionSteps(), { onDone: () => markTourSeen('educacion') });
  }, [markTourSeen]);

  // Auto-lanza el tour la primera vez que el usuario entra al módulo.
  useEffect(() => {
    if (tourRef.current || !user) return;
    if (user.tours_vistos?.educacion) return;
    tourRef.current = true;
    const id = requestAnimationFrame(() => setTimeout(launchTour, 500));
    return () => cancelAnimationFrame(id);
  }, [user, launchTour]);

  const chapters: { id: ChapterId; label: string; intro: string }[] = [
    { id: 'ondas', label: 'Ondas', intro: 'Cómo se mueve el suelo al paso de cada tipo de onda.' },
    { id: 'magnitud', label: 'Magnitud', intro: 'Cómo se mide la energía de un sismo.' },
    { id: 'profundidad', label: 'Profundidad', intro: 'Cómo se clasifican los sismos según la profundidad de su foco.' },
    { id: 'historia', label: 'Historia', intro: 'Sismos y erupciones que marcaron a Nariño.' },
    { id: 'metodologia', label: 'Metodología', intro: 'Cómo el simulador resuelve la ecuación de onda.' },
  ];
  const extras: { id: ExtraId; label: string; icon: JSX.Element }[] = [
    { id: 'glosario', label: 'Glosario', icon: <BookMarked size={15} /> },
    { id: 'referencias', label: 'Referencias', icon: <Library size={15} /> },
    { id: 'quiz', label: 'Quiz', icon: <Award size={15} /> },
  ];

  const chapterIndex = chapters.findIndex(c => c.id === active);
  const activeChapter = chapters[chapterIndex] ?? null;

  const goSim = () => onNavigate?.('simulation');
  const goMap = () => onNavigate?.('map3d');

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      <div className="bg-white border-b border-stone-200/60 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-[#1A1A2E] font-bold text-xl flex items-center gap-2">
            <BookOpen size={20} className="text-[#C4553A]" /> Centro de aprendizaje sísmico
            {/* Botón de ayuda: repite el tour guiado del módulo. */}
            <Tooltip content="Ver guía" hoverOnly>
              <button
                type="button"
                onClick={launchTour}
                aria-label="Ver guía"
                className={`flex items-center justify-center w-6 h-6 rounded-full border border-stone-200 text-stone-400 hover:text-[#C4553A] hover:border-[#C4553A]/40 transition-colors ${user && !user.tours_vistos?.educacion ? 'help-pulse' : ''}`}
              >
                <HelpCircle size={14} />
              </button>
            </Tooltip>
          </h1>
          <p className="text-stone-400 text-xs mt-0.5">Recorre los capítulos; cada uno es un laboratorio interactivo</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[220px_1fr] gap-6">
        {/* Barra lateral: capítulos numerados + extras */}
        <nav className="lg:sticky lg:top-20 self-start space-y-4">
          <div data-tour="edu-capitulos">
            <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-2 px-1">Capítulos</div>
            <ol className="space-y-1">
              {chapters.map((c, i) => {
                const done = isDone(c.id);
                const on = active === c.id;
                return (
                  <li key={c.id}>
                    <button onClick={() => setActive(c.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${on ? 'bg-[#C4553A] text-white' : 'bg-white text-stone-600 border border-stone-200'}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${on ? 'bg-white/20 text-white' : done ? 'bg-[#2D6A4F] text-white' : 'bg-stone-100 text-stone-500'}`}>
                        {done && !on ? <Check size={11} /> : i + 1}
                      </span>
                      {c.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div data-tour="edu-consulta">
            <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400 mb-2 px-1">Consulta</div>
            <div className="space-y-1">
              {extras.map(x => (
                <button key={x.id} onClick={() => setActive(x.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${active === x.id ? 'bg-[#1A1A2E] text-white' : 'bg-white text-stone-600 border border-stone-200'}`}>
                  {x.icon} {x.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Contenido */}
        <div key={active} data-tour="edu-contenido" className="animate-fade-in-up min-w-0">
          {activeChapter && (
            <div className="mb-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#C4553A]/10 text-[#C4553A] flex items-center justify-center text-sm font-black">{chapterIndex + 1}</span>
              <div>
                <h2 className="text-xl font-black text-[#1A1A2E] leading-tight">{activeChapter.label}</h2>
                <p className="text-stone-500 text-sm">{activeChapter.intro}</p>
              </div>
            </div>
          )}

          {active === 'ondas' && (
            <WaveLab onOpenSimulator={goSim} onOpenMap3D={goMap} onChallengeDone={() => markDone('ondas')} />
          )}
          {active === 'magnitud' && (
            <div className="space-y-4">
              <MagnitudeScale />
              <button onClick={goSim} className="text-xs font-bold px-3 py-2 rounded-lg bg-[#C4553A]/10 text-[#C4553A] border border-[#C4553A]/20">
                Simular un sismo con la magnitud que elijas
              </button>
            </div>
          )}
          {active === 'profundidad' && (
            <DepthLab onOpenMap3D={goMap} onChallengeDone={() => markDone('profundidad')} />
          )}
          {active === 'historia' && (
            <div className="space-y-4">
              <HistoricalTimeline />
              <button onClick={goMap} className="text-xs font-bold px-3 py-2 rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/20">
                Ver estos eventos en el Mapa 3D
              </button>
            </div>
          )}
          {active === 'metodologia' && (
            <div className="space-y-4">
              <FdmMethodology />
              <button onClick={goSim} className="text-xs font-bold px-3 py-2 rounded-lg bg-[#C4553A]/10 text-[#C4553A] border border-[#C4553A]/20">
                Abrir el Simulador y probar el método
              </button>
            </div>
          )}

          {active === 'glosario' && (
            <div>
              <h2 className="text-xl font-black text-[#1A1A2E] mb-3">Glosario de términos</h2>
              <Glossary />
            </div>
          )}
          {active === 'referencias' && (
            <div>
              <h2 className="text-xl font-black text-[#1A1A2E] mb-3">Referencias</h2>
              <References />
            </div>
          )}
          {active === 'quiz' && (
            <div>
              <h2 className="text-xl font-black text-[#1A1A2E] mb-3">Pon a prueba lo que aprendiste</h2>
              <SeismicQuiz />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
