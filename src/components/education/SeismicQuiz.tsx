/**
 * Quiz del centro de aprendizaje.
 *
 * Entre ocho y diez preguntas ligadas a los capítulos, algunas visuales (una
 * trayectoria o un sismograma para identificar la onda, o una profundidad para
 * clasificar). Al responder se muestra la explicación y la fuente. Al final se
 * da el puntaje y, por cada pregunta fallada, un acceso directo al capítulo
 * correspondiente para repasar.
 *
 * Los datos se leen de Supabase con respaldo en el contenido verificado del
 * código (educationData / educationContent).
 *
 * @module education/SeismicQuiz
 */
import { useEffect, useRef, useState } from 'react';
import { loadQuizQuestions, type QuizQuestion } from '../../lib/educationData';
import { type WaveType } from '../../lib/waveColors';
import { VolcanoLoader } from '../ui/VolcanoLoader';
import { CheckCircle, XCircle, RotateCcw, ArrowRight, Award, ArrowRight as GoIcon } from '../../lib/icons';

type ChapterId = 'ondas' | 'magnitud' | 'profundidad' | 'historia' | 'metodologia';

/** Capítulo al que lleva cada categoría del quiz (para repasar un fallo). */
const CATEGORY_CHAPTER: Record<string, ChapterId> = {
  ondas: 'ondas',
  magnitud: 'magnitud',
  tectonica: 'profundidad',
  profundidad: 'profundidad',
  volcanes: 'historia',
  general: 'metodologia',
};
const CHAPTER_LABEL: Record<ChapterId, string> = {
  ondas: 'Ondas', magnitud: 'Magnitud', profundidad: 'Profundidad', historia: 'Historia', metodologia: 'Metodología',
};

interface Props {
  onGoToChapter?: (id: ChapterId) => void;
}

export function SeismicQuiz({ onGoToChapter }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState<QuizQuestion[]>([]);

  // Fase para los glifos visuales animados.
  const phaseRef = useRef(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => { phaseRef.current = (phaseRef.current + 0.06) % (Math.PI * 2); setTick(t => (t + 1) % 1e6); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Se arma un intento de 9 preguntas (entre 8 y 10) que SIEMPRE incluye las
  // visuales, para que el quiz tenga variedad, y se baraja el conjunto final.
  useEffect(() => {
    loadQuizQuestions().then(all => {
      const visual = all.filter(q => detectVisual(q) !== null);
      const rest = all.filter(q => detectVisual(q) === null);
      const set = [...visual, ...rest.slice(0, Math.max(0, 9 - visual.length))];
      for (let i = set.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [set[i], set[j]] = [set[j], set[i]]; }
      setQuestions(set);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="py-8"><VolcanoLoader size={40} label="Cargando preguntas…" /></div>;
  if (questions.length === 0) return <p className="text-sm text-stone-500">No hay preguntas disponibles.</p>;

  const q = questions[current];
  const showResult = selected !== null;
  const visual = detectVisual(q);

  const answer = (idx: number) => {
    if (showResult) return;
    setSelected(idx);
    if (idx === q.correct_index) setScore(s => s + 1);
    else setFailed(f => [...f, q]);
  };
  const next = () => {
    if (current < questions.length - 1) { setCurrent(c => c + 1); setSelected(null); }
    else setFinished(true);
  };
  const reset = () => { setCurrent(0); setSelected(null); setScore(0); setFinished(false); setFailed([]); };

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="bg-white rounded-2xl border border-stone-200/60 p-6">
        <div className="text-center">
          <h3 className="text-xl font-black text-[#1A1A2E] mb-1">Resultado</h3>
          <div className="text-4xl font-black mb-1" style={{ color: pct >= 60 ? '#2D6A4F' : '#C4553A' }}>{score}/{questions.length}</div>
          <p className="text-stone-500 text-sm mb-4">Acertaste el {pct}% de las preguntas</p>
        </div>
        {failed.length > 0 && (
          <div className="border-t border-stone-100 pt-4">
            <p className="text-xs font-bold text-stone-500 mb-2">Repasa los temas que fallaste</p>
            <div className="space-y-2">
              {failed.map((f, i) => {
                const chap = CATEGORY_CHAPTER[f.category] ?? 'metodologia';
                return (
                  <div key={i} className="flex items-center justify-between gap-3 bg-stone-50 rounded-lg p-2.5">
                    <span className="text-xs text-stone-600 min-w-0 truncate">{f.question}</span>
                    <button onClick={() => onGoToChapter?.(chap)} className="flex-shrink-0 flex items-center gap-1 text-xs font-bold text-[#C4553A]">
                      {CHAPTER_LABEL[chap]} <GoIcon size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={reset} className="flex items-center gap-2 mx-auto mt-5 bg-[#2D6A4F] text-white px-6 py-2.5 rounded-xl font-bold text-sm">
          <RotateCcw size={14} /> Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
      <div className="bg-stone-50 px-5 py-3 flex items-center justify-between border-b border-stone-200/60">
        <span className="text-[#1A1A2E] text-sm font-bold">Quiz sísmico</span>
        <span className="text-stone-500 text-xs">{current + 1}/{questions.length} · {score} pts</span>
      </div>
      <div className="p-5">
        <h3 className="text-base font-bold text-[#1A1A2E] mb-3">{q.question}</h3>

        {/* Glifo visual si la pregunta lo pide */}
        {visual && (
          <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-2 mb-4">
            {visual.kind === 'trajectory' && <TrajectoryGlyph wave={visual.wave} phase={phaseRef.current} />}
            {visual.kind === 'seismogram' && <SeismoGlyph wave={visual.wave} phase={phaseRef.current} />}
            {visual.kind === 'depth' && <DepthGlyph km={visual.km} />}
          </div>
        )}

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
              <span className="font-bold">{selected === q.correct_index ? 'Correcto.' : 'Incorrecto.'}</span> {q.explanation}
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

/* ─── Detección de preguntas visuales por su id o texto ─── */
type Visual =
  | { kind: 'trajectory'; wave: WaveType }
  | { kind: 'seismogram'; wave: WaveType }
  | { kind: 'depth'; km: number };

function detectVisual(q: QuizQuestion): Visual | null {
  // Por id (contenido de respaldo) o por el texto de la pregunta (filas de
  // Supabase, cuyo id es un UUID), para que el glifo salga en ambos casos.
  const id = q.id?.toString() ?? '';
  const t = q.question.toLowerCase();
  if (id === 'q-visual-trayectoria-rayleigh' || (t.includes('trayectoria') && t.includes('qué onda'))) return { kind: 'trajectory', wave: 'Rayleigh' };
  if (id === 'q-visual-sismograma-s' || (t.includes('sismograma') && t.includes('perpendicular'))) return { kind: 'seismogram', wave: 'S' };
  if (id === 'q-visual-profundidad' || (t.includes('120 km') && t.includes('clasifica'))) return { kind: 'depth', km: 120 };
  return null;
}

/* ─── Glifos visuales (reusan la física de ondas de forma simple) ─── */
function waveDisp(wave: WaveType, theta: number, amp: number): { dx: number; dy: number } {
  switch (wave) {
    case 'P': return { dx: Math.sin(theta) * amp * 1.4, dy: 0 };
    case 'S': return { dx: 0, dy: Math.sin(theta) * amp * 1.6 };
    case 'Love': return { dx: 0, dy: Math.sin(theta) * amp * 1.6 };
    case 'Rayleigh': return { dx: Math.sin(theta) * amp, dy: -Math.cos(theta) * amp * 1.3 };
  }
}

function TrajectoryGlyph({ wave, phase }: { wave: WaveType; phase: number }) {
  const W = 200, H = 100, cx = W / 2, cy = H / 2, amp = 22;
  const trail: string[] = [];
  for (let s = 0; s <= 56; s++) { const d = waveDisp(wave, (s / 56) * Math.PI * 2, amp); trail.push(`${(cx + d.dx).toFixed(1)},${(cy + d.dy).toFixed(1)}`); }
  const d = waveDisp(wave, phase, amp);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 240, display: 'block', margin: '0 auto' }}>
      <line x1={10} y1={cy} x2={W - 24} y2={cy} stroke="#e7e5e4" strokeWidth={1} />
      <path d={`M ${trail.join(' L ')}`} fill="none" stroke="#9ca3af" strokeWidth={1.4} strokeDasharray="3 2" />
      <circle cx={(cx + d.dx).toFixed(1)} cy={(cy + d.dy).toFixed(1)} r={5} fill="#1A1A2E" />
    </svg>
  );
}

/**
 * Componentes del sismómetro para el glifo del quiz (vertical y transversal).
 * S: transversal; Rayleigh: vertical; P: ninguna de las dos domina (radial).
 */
function seismoComp(wave: WaveType, theta: number, amp: number): { v: number; transversal: number } {
  switch (wave) {
    case 'P': return { v: 0, transversal: 0 };
    case 'S': return { v: 0, transversal: Math.sin(theta) * amp };
    case 'Love': return { v: 0, transversal: Math.sin(theta) * amp };
    case 'Rayleigh': return { v: -Math.cos(theta) * amp, transversal: 0 };
  }
}

function SeismoGlyph({ wave, phase }: { wave: WaveType; phase: number }) {
  const W = 240, H = 100, amp = 14;
  const trace = (axis: 'v' | 'transversal', cy: number): string => {
    const pts: string[] = [];
    for (let i = 0; i <= 72; i++) { const c = seismoComp(wave, phase - (72 - i) * 0.12, amp); pts.push(`${(10 + (i / 72) * (W - 20)).toFixed(1)},${(cy - (axis === 'v' ? c.v : c.transversal)).toFixed(1)}`); }
    return `M ${pts.join(' L ')}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 280, display: 'block', margin: '0 auto' }}>
      <text x={6} y={12} fontSize={9} fill="#78716c">Vertical</text>
      <path d={trace('v', 30)} fill="none" stroke="#1A1A2E" strokeWidth={1.4} />
      <text x={6} y={64} fontSize={9} fill="#78716c">Transversal</text>
      <path d={trace('transversal', 82)} fill="none" stroke="#1A1A2E" strokeWidth={1.4} />
    </svg>
  );
}

function DepthGlyph({ km }: { km: number }) {
  const W = 240, H = 110, maxKm = 300, pad = 16;
  const y = pad + (km / maxKm) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 280, display: 'block', margin: '0 auto' }}>
      <rect x={pad} y={pad} width={W - 2 * pad} height={(70 / maxKm) * (H - 2 * pad)} fill="#2D6A4F" opacity={0.08} />
      <rect x={pad} y={pad + (70 / maxKm) * (H - 2 * pad)} width={W - 2 * pad} height={(230 / maxKm) * (H - 2 * pad)} fill="#D4A853" opacity={0.08} />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#e7e5e4" strokeWidth={1} />
      <text x={pad + 2} y={pad + 10} fontSize={8} fill="#2D6A4F">0 a 70 km</text>
      <text x={pad + 2} y={pad + (70 / maxKm) * (H - 2 * pad) + 11} fontSize={8} fill="#B8860B">70 a 300 km</text>
      <circle cx={W / 2} cy={y} r={6} fill="#C4553A" />
      <text x={W / 2 + 10} y={y + 3} fontSize={9} fill="#1A1A2E">foco a {km} km</text>
    </svg>
  );
}
