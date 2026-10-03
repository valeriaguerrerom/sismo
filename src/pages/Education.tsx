import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Waves, Zap, Award,
  CheckCircle, XCircle, RotateCcw, Layers, ArrowRight, Clock,
  Target, TrendingUp, Globe, Info, Calculator, BookMarked, Library, HelpCircle,
  Flame, Activity
} from '../lib/icons';
import {
  loadQuizQuestions, loadTimelineEvents,
  type QuizQuestion, type TimelineEvent,
} from '../lib/educationData';
import {
  WAVE_INFO, COMPONENT_NOTE, DEPTH_CLASSES, INTENSITY_FACTORS, type WaveInfo,
} from '../lib/educationContent';
import { FdmMethodology } from '../components/education/FdmMethodology';
import { Glossary } from '../components/education/Glossary';
import { References } from '../components/education/References';
import { Tooltip } from '../components/ui/Tooltip';
import { VolcanoLoader } from '../components/ui/VolcanoLoader';
import { useAuth } from '../lib/authContext';
import { WAVE_COLORS } from '../lib/waveColors';
import { startTour } from '../tours/useTour';
import { buildEducacionSteps } from '../tours/educacion';

/* ─── Animación de partículas por tipo de onda ───
 * Muestra el MOVIMIENTO FÍSICO real de las partículas del medio, no una traza.
 * Una malla de puntos se desplaza desde su posición de reposo según el tipo:
 *   · P: longitudinal — las partículas se acercan y se alejan a lo largo del
 *        eje de propagación (compresión y dilatación). No hay desplazamiento
 *        transversal.
 *   · S: transversal — desplazamiento perpendicular a la propagación, igual a
 *        toda profundidad (onda de cuerpo).
 *   · Love: superficial — cizalla horizontal perpendicular a la propagación,
 *        con amplitud máxima en la superficie que decae con la profundidad.
 *   · Rayleigh: superficial — movimiento elíptico retrógrado en el plano
 *        vertical, con amplitud que decae con la profundidad.
 * La propagación va en +X; la profundidad crece hacia abajo (filas).
 */
function AnimatedWave({ type, color, playing }: { type: 'P' | 'S' | 'Love' | 'Rayleigh'; color: string; playing: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let raf: number;
    const animate = () => {
      setPhase(p => (p + 0.05) % (Math.PI * 2));
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const COLS = 24;      // partículas en horizontal (eje de propagación)
  const ROWS = 5;       // filas en profundidad (para ondas superficiales)
  const W = 400, H = 90;
  const dx = W / (COLS + 1);
  const dy = (H - 20) / (ROWS + 1);
  const k = 0.5;        // número de onda espacial
  const amp = 7;        // amplitud base en px

  // Las ondas de superficie solo tienen varias filas visibles; las de cuerpo,
  // una sola fila central (su movimiento no depende de la profundidad aquí).
  const rows = (type === 'Love' || type === 'Rayleigh') ? ROWS : 1;

  const dots: { cx: number; cy: number; op: number }[] = [];
  for (let r = 0; r < rows; r++) {
    // Profundidad normalizada 0 (superficie) → 1 (fondo) y su decaimiento.
    const depthN = rows > 1 ? r / (rows - 1) : 0;
    const decay = rows > 1 ? Math.exp(-1.6 * depthN) : 1;
    const y0 = rows > 1 ? 12 + (r + 1) * dy : H / 2;
    for (let c = 0; c < COLS; c++) {
      const x0 = (c + 1) * dx;
      const theta = k * c - phase * 4; // fase de la onda viajera en +X
      let cx = x0, cy = y0;
      if (type === 'P') {
        // Longitudinal: desplazamiento SOLO en X (compresión/dilatación).
        cx = x0 + Math.sin(theta) * amp * 1.4;
      } else if (type === 'S') {
        // Transversal: desplazamiento SOLO en Y (perpendicular).
        cy = y0 + Math.sin(theta) * amp * 1.6;
      } else if (type === 'Love') {
        // Superficial, cizalla horizontal: desplazamiento en X, decae con prof.
        cx = x0 + Math.sin(theta) * amp * 1.6 * decay;
      } else {
        // Rayleigh: elíptico retrógrado en el plano vertical (X–Y), decae.
        cx = x0 + Math.sin(theta) * amp * decay;
        cy = y0 - Math.cos(theta) * amp * 1.3 * decay; // retrógrado
      }
      dots.push({ cx, cy, op: rows > 1 ? 0.35 + 0.65 * decay : 1 });
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" role="img"
      aria-label={`Animación del movimiento de partículas de la onda ${type}`}>
      {/* Flecha de dirección de propagación */}
      <line x1="6" y1={H - 6} x2="60" y2={H - 6} stroke="#9ca3af" strokeWidth="1" />
      <path d={`M 60 ${H - 9} L 66 ${H - 6} L 60 ${H - 3} Z`} fill="#9ca3af" />
      <text x="70" y={H - 3} fontSize="9" fill="#9ca3af">propagación</text>
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx.toFixed(1)} cy={d.cy.toFixed(1)} r="2.6" fill={color} opacity={d.op} />
      ))}
    </svg>
  );
}

/* ─── Interactive Wave Explorer ─── */
function WaveExplorer() {
  const [selected, setSelected] = useState<'P' | 'S' | 'Love' | 'Rayleigh'>('P');
  const [playing, setPlaying] = useState(true);

  const ICONS: Record<'P' | 'S' | 'Love' | 'Rayleigh', JSX.Element> = {
    P: <Zap size={18} />, S: <Waves size={18} />, Love: <TrendingUp size={18} />, Rayleigh: <Globe size={18} />,
  };
  // Metadatos verificados (con fuente) desde educationContent.ts.
  const waves = Object.fromEntries(
    WAVE_INFO.map(info => [info.key, {
      ...info,
      color: WAVE_COLORS[info.key],
      icon: ICONS[info.key],
    }]),
  ) as Record<'P' | 'S' | 'Love' | 'Rayleigh', WaveInfo & { color: string; icon: JSX.Element }>;

  const w = waves[selected];

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
      <div className="flex border-b border-stone-200/60">
        {(Object.keys(waves) as Array<keyof typeof waves>).map(key => (
          <button
            key={key}
            onClick={() => setSelected(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all ${
              selected === key
                ? 'text-white'
                : 'text-stone-500 bg-stone-50'
            }`}
            style={selected === key ? { backgroundColor: '#C4553A', opacity: 0.9 } : {}}
          >
            {waves[key].icon}
            <span className="hidden sm:inline">{key}</span>
          </button>
        ))}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-black text-[#1A1A2E]">{w.name}</h3>
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${w.color}15`, color: w.color }}>{w.speed}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{w.motion}</span>
            </div>
          </div>
          <button
            onClick={() => setPlaying(!playing)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ backgroundColor: `${w.color}15`, color: w.color }}
          >
            {playing ? '⏸ Pausar' : '▶ Animar'}
          </button>
        </div>

        <div className="bg-stone-50 rounded-xl border border-stone-200/60 p-3 mb-4">
          <AnimatedWave type={selected} color={w.color} playing={playing} />
        </div>

        <p className="text-sm text-stone-600 leading-relaxed mb-4">{w.desc}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-stone-50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-stone-500 tracking-wide">Tipo</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: w.color }}>
              {w.type === 'cuerpo' ? 'Onda de cuerpo' : 'Onda superficial'}
            </div>
          </div>
          <div className="bg-stone-50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-stone-500 tracking-wide">Velocidad típica</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: w.color }}>{w.speed}</div>
          </div>
        </div>

        {/* Nota sobre la componente observada (reemplaza "Componente: Z"). */}
        <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-3 mb-4 flex gap-2">
          <Info size={14} className="text-stone-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-stone-600 leading-relaxed">{COMPONENT_NOTE}</p>
        </div>

        {/* Fuente del contenido de esta onda. */}
        <p className="text-[10px] text-stone-400 leading-snug">Fuente: {w.source.cita}</p>
      </div>
    </div>
  );
}

/* ─── Quiz sísmico ─── */
function SeismicQuiz() {
  // Preguntas desde Supabase (con fuente); si falla, respaldo verificado.
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

  const handleAnswer = (idx: number) => {
    if (showResult) return;
    setSelected(idx);
    setShowResult(true);
    if (idx === q.correct_index) setScore(s => s + 1);
  };

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1);
      setSelected(null);
      setShowResult(false);
    } else {
      setFinished(true);
    }
  };

  const handleReset = () => {
    setCurrent(0);
    setSelected(null);
    setScore(0);
    setShowResult(false);
    setFinished(false);
  };

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '👏' : pct >= 40 ? '📚' : '💪';
    const msg = pct >= 80 ? '¡Excelente! Dominas la sismología' : pct >= 60 ? '¡Muy bien! Buen conocimiento' : pct >= 40 ? 'Vas por buen camino' : 'Sigue aprendiendo, ¡tú puedes!';

    return (
      <div className="bg-white rounded-2xl border border-stone-200/60 p-8 text-center">
        <div className="text-5xl mb-4">{emoji}</div>
        <h3 className="text-2xl font-black text-[#1A1A2E] mb-2">{msg}</h3>
        <div className="text-4xl font-black mb-2" style={{ color: pct >= 60 ? '#2D6A4F' : '#C4553A' }}>
          {score}/{questions.length}
        </div>
        <p className="text-stone-500 text-sm mb-6">Respondiste correctamente el {pct}% de las preguntas</p>
        <div className="w-full bg-stone-100 rounded-full h-3 mb-6 max-w-xs mx-auto">
          <div className="h-3 rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: pct >= 60 ? '#2D6A4F' : '#C4553A' }} />
        </div>
        <button onClick={handleReset} className="flex items-center gap-2 mx-auto bg-[#2D6A4F] text-white px-6 py-2.5 rounded-xl font-bold text-sm">
          <RotateCcw size={14} /> Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
      <div className="bg-stone-50 px-5 py-3 flex items-center justify-between border-b border-stone-200/60">
        <div className="flex items-center gap-2">
          <Award size={16} className="text-[#C4553A]" />
          <span className="text-[#1A1A2E] text-sm font-bold">Quiz sísmico</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-stone-500 text-xs">{current + 1}/{questions.length}</span>
          <span className="text-[#2D6A4F] text-xs font-bold">{score} pts</span>
        </div>
      </div>

      <div className="w-full bg-stone-100 h-1">
        <div className="h-1 bg-[#2D6A4F] transition-all duration-300" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="p-5">
        <h3 className="text-base font-bold text-[#1A1A2E] mb-4">{q.question}</h3>

        <div className="space-y-2 mb-4">
          {q.options.map((opt, idx) => {
            let cls = 'border-stone-200 bg-stone-50 text-stone-700';
            if (showResult) {
              if (idx === q.correct_index) cls = 'border-green-500/30 bg-green-500/10 text-green-400';
              else if (idx === selected && idx !== q.correct_index) cls = 'border-red-500/30 bg-red-500/10 text-red-400';
              else cls = 'border-stone-100 bg-stone-50 text-stone-400';
            }
            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-3 ${cls}`}
              >
                <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ borderColor: showResult && idx === q.correct_index ? '#22c55e' : showResult && idx === selected ? '#ef4444' : 'rgba(255,255,255,0.1)' }}>
                  {showResult && idx === q.correct_index ? <CheckCircle size={14} className="text-green-500" /> :
                   showResult && idx === selected ? <XCircle size={14} className="text-red-500" /> :
                   String.fromCharCode(65 + idx)}
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
                {q.source_url && (
                  <> <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline break-all">{q.source_url}</a></>
                )}
              </p>
            )}
          </div>
        )}

        {showResult && (
          <button onClick={handleNext} className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white py-2.5 rounded-xl font-bold text-sm">
            {current < questions.length - 1 ? <><ArrowRight size={14} /> Siguiente pregunta</> : <><Award size={14} /> Ver resultado</>}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Visualizador de profundidad ─── */
function DepthVisualizer() {
  const [depth, setDepth] = useState(15);

  // Clasificación ESTÁNDAR por profundidad (Stein y Wysession, 2003). No se
  // calcula ninguna "intensidad" a partir de la profundidad sola.
  const cls = DEPTH_CLASSES.find(c => depth >= c.from && depth < c.to) ?? DEPTH_CLASSES[DEPTH_CLASSES.length - 1];
  const classColor = cls.label === 'Superficial' ? '#C4553A' : cls.label === 'Intermedio' ? '#D4A853' : '#2D6A4F';

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
      <h3 className="font-black text-[#1A1A2E] mb-1 flex items-center gap-2">
        <Layers size={18} className="text-[#C4553A]" />
        Profundidad del foco
      </h3>
      <p className="text-xs text-stone-500 mb-4">Mueve el control para ver cómo se clasifica un sismo según la profundidad de su foco</p>

      <div className="flex gap-5">
        <div className="flex-1">
          <div className="relative h-64 rounded-xl overflow-hidden border border-stone-200">
            {/* Earth layers */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #8B7355 0%, #6B4423 20%, #4A3520 40%, #3D2B1A 60%, #2A1F14 80%, #1A1410 100%)' }} />
            <div className="absolute top-0 left-0 right-0 h-6 bg-green-600/80 flex items-center justify-center">
              <span className="text-[9px] text-[#1A1A2E] font-bold">SUPERFICIE</span>
            </div>

            {/* Depth marker */}
            <div
              className="absolute left-0 right-0 flex items-center transition-all duration-300"
              style={{ top: `${Math.min(90, (depth / 700) * 100 + 10)}%` }}
            >
              <div className="w-full h-0.5" style={{ backgroundColor: classColor }} />
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="relative">
                  <div className="w-5 h-5 rounded-full animate-ping absolute" style={{ backgroundColor: classColor, opacity: 0.3 }} />
                  <div className="w-5 h-5 rounded-full relative flex items-center justify-center" style={{ backgroundColor: classColor }}>
                    <Target size={10} className="text-[#1A1A2E]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Depth labels */}
            <div className="absolute right-2 top-8 text-[9px] text-[#1A1A2E]/60">0 km</div>
            <div className="absolute right-2 top-1/4 text-[9px] text-[#1A1A2E]/60">70 km</div>
            <div className="absolute right-2 top-1/2 text-[9px] text-[#1A1A2E]/60">300 km</div>
            <div className="absolute right-2 bottom-2 text-[9px] text-[#1A1A2E]/60">700 km</div>
          </div>

          <input
            type="range"
            min={1}
            max={700}
            value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            className="w-full mt-3"
            style={{ accentColor: classColor }}
          />
          <div className="text-center text-xs text-stone-500 mt-1">Profundidad: <span className="font-bold" style={{ color: classColor }}>{depth} km</span></div>
        </div>

        <div className="w-44 space-y-3">
          <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${classColor}10`, border: `1px solid ${classColor}30` }}>
            <div className="text-[10px] text-stone-500">Clasificación</div>
            <div className="text-sm font-black" style={{ color: classColor }}>{cls.label}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {cls.from}–{cls.to} km
            </div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-center border border-stone-200/60">
            <div className="text-[10px] text-stone-500">Profundidad</div>
            <div className="text-sm font-bold text-[#1A1A2E]">{depth} km</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/60">
            <p className="text-[10px] text-stone-600 leading-relaxed">{cls.desc}</p>
          </div>
        </div>
      </div>

      {/* La intensidad NO depende solo de la profundidad: se aclaran los factores. */}
      <div className="mt-4 bg-[#D4A853]/10 border border-[#D4A853]/30 rounded-xl p-3 flex gap-2">
        <Info size={14} className="text-[#B8860B] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#1A1A2E] leading-relaxed">{INTENSITY_FACTORS}</p>
      </div>
      <p className="text-[10px] text-stone-400 mt-2 leading-snug">Fuente: Stein, S., & Wysession, M. (2003). An Introduction to Seismology, Earthquakes, and Earth Structure.</p>
    </div>
  );
}

/* ─── Magnitude Scale Visualizer ─── */
function MagnitudeScale() {
  const [mag, setMag] = useState(5.0);

  const energy = Math.pow(10, 1.5 * mag + 4.8);
  const tnt = energy / 4.184e9;
  const radius = Math.min(120, Math.pow(10, (mag - 2) * 0.5) * 8);

  const getDescription = (m: number) => {
    if (m < 3) return { label: 'Micro', desc: 'Generalmente no se siente. Solo detectado por instrumentos.', color: '#94a3b8' };
    if (m < 4) return { label: 'Menor', desc: 'Se siente levemente. Rara vez causa daño.', color: '#2D6A4F' };
    if (m < 5) return { label: 'Ligero', desc: 'Se siente notablemente. Objetos pueden caer de estantes.', color: '#22c55e' };
    if (m < 6) return { label: 'Moderado', desc: 'Puede causar daño en edificaciones vulnerables.', color: '#C4553A' };
    if (m < 7) return { label: 'Fuerte', desc: 'Daño significativo en zona epicentral. Puede ser destructivo.', color: '#ef4444' };
    if (m < 8) return { label: 'Mayor', desc: 'Destrucción severa en áreas extensas.', color: '#dc2626' };
    return { label: 'Gran sismo', desc: 'Destrucción total cerca del epicentro. Efectos globales.', color: '#7f1d1d' };
  };

  const info = getDescription(mag);

  const formatEnergy = (e: number) => {
    if (e >= 1e18) return `${(e / 1e18).toFixed(1)} EJ`;
    if (e >= 1e15) return `${(e / 1e15).toFixed(1)} PJ`;
    if (e >= 1e12) return `${(e / 1e12).toFixed(1)} TJ`;
    if (e >= 1e9) return `${(e / 1e9).toFixed(1)} GJ`;
    if (e >= 1e6) return `${(e / 1e6).toFixed(1)} MJ`;
    return `${e.toFixed(0)} J`;
  };

  const formatTNT = (t: number) => {
    if (t >= 1e9) return `${(t / 1e9).toFixed(1)} Gt`;
    if (t >= 1e6) return `${(t / 1e6).toFixed(1)} Mt`;
    if (t >= 1e3) return `${(t / 1e3).toFixed(1)} kt`;
    return `${t.toFixed(1)} t`;
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
      <h3 className="font-black text-[#1A1A2E] mb-1 flex items-center gap-2">
        <TrendingUp size={18} className="text-[#C4553A]" />
        Escala de magnitud interactiva
      </h3>
      <p className="text-xs text-stone-500 mb-4">Explora cómo la magnitud afecta la energía liberada y el potencial destructivo</p>

      <div className="flex gap-5 items-start">
        <div className="flex-1">
          <div className="relative h-48 bg-stone-50 rounded-xl border border-stone-200/60 flex items-center justify-center overflow-hidden">
            <div
              className="rounded-full transition-all duration-500 flex items-center justify-center"
              style={{
                width: `${radius}px`,
                height: `${radius}px`,
                backgroundColor: `${info.color}20`,
                border: `2px solid ${info.color}`,
              }}
            >
              <span className="text-2xl font-black" style={{ color: info.color }}>{mag.toFixed(1)}</span>
            </div>
            {mag >= 5 && (
              <div
                className="absolute rounded-full animate-ping"
                style={{
                  width: `${radius * 1.3}px`,
                  height: `${radius * 1.3}px`,
                  backgroundColor: `${info.color}10`,
                  border: `1px solid ${info.color}30`,
                }}
              />
            )}
          </div>

          <input
            type="range"
            min={2}
            max={9.5}
            step={0.1}
            value={mag}
            onChange={e => setMag(Number(e.target.value))}
            className="w-full mt-3"
            style={{ accentColor: info.color }}
          />
          <div className="flex justify-between text-[10px] text-stone-500 mt-1">
            <span>2.0</span><span>4.0</span><span>6.0</span><span>8.0</span><span>9.5</span>
          </div>
        </div>

        <div className="w-44 space-y-3">
          <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${info.color}10`, border: `1px solid ${info.color}30` }}>
            <div className="text-lg font-black" style={{ color: info.color }}>{info.label}</div>
            <div className="text-[10px] text-stone-500 mt-0.5">Mw {mag.toFixed(1)}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/60">
            <div className="text-[10px] text-stone-500 uppercase">Energía</div>
            <div className="text-xs font-bold text-[#1A1A2E]">{formatEnergy(energy)}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/60">
            <div className="text-[10px] text-stone-500 uppercase">Equiv. TNT</div>
            <div className="text-xs font-bold text-[#1A1A2E]">{formatTNT(tnt)}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/60">
            <p className="text-[10px] text-stone-600 leading-relaxed">{info.desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Línea de tiempo histórica ─── */
function HistoricalTimeline() {
  // Eventos desde Supabase (con fuente y enlace); si falla, respaldo verificado.
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(0);

  useEffect(() => { loadTimelineEvents().then(e => { setEvents(e); setLoading(false); }); }, []);

  if (loading || events.length === 0) return <div className="py-8"><VolcanoLoader size={40} label="Cargando línea de tiempo…" /></div>;

  const ev = events[selectedEvent];

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 p-6">
      {/* Horizontal timeline bar */}
      <div className="relative mb-6">
        <div className="h-1 bg-stone-200 rounded-full" />
        <div className="flex justify-between absolute inset-x-0 -top-3">
          {events.map((e, i) => (
            <button key={i} onClick={() => setSelectedEvent(i)} className="flex flex-col items-center group">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${
                selectedEvent === i
                  ? 'bg-[#C4553A] text-white scale-110 shadow-lg shadow-[#C4553A]/30'
                  : e.event_type === 'volcanic' ? 'bg-[#C4553A]/20 text-[#C4553A]' : 'bg-stone-200 text-stone-500'
              }`}>
                {e.event_type === 'volcanic' ? <Flame size={13} /> : <Activity size={13} />}
              </div>
              <span className={`text-[9px] mt-1 font-bold ${selectedEvent === i ? 'text-[#C4553A]' : 'text-stone-400'}`}>{e.year}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected event detail */}
      <div key={selectedEvent} className="animate-fade-in mt-8 rounded-xl p-5 border" style={{
        backgroundColor: ev.event_type === 'volcanic' ? '#C4553A08' : '#2D6A4F08',
        borderColor: ev.event_type === 'volcanic' ? '#C4553A20' : '#2D6A4F20',
      }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: ev.event_type === 'volcanic' ? '#C4553A' : '#2D6A4F' }}>
            {ev.event_type === 'volcanic' ? <Flame size={13} /> : <Activity size={13} />}
            {ev.event_type === 'volcanic' ? 'Evento volcánico' : 'Evento tectónico'}
          </span>
          <span className="text-xs text-stone-400">· {ev.event_date ?? ev.year}</span>
          {ev.magnitude && <span className="text-xs font-semibold text-stone-500">· {ev.magnitude}</span>}
        </div>
        <h4 className="text-2xl font-black text-[#1A1A2E] mb-2">{ev.title}</h4>
        <p className="text-stone-600 text-sm leading-relaxed">{ev.description}</p>
        {/* Fuente del evento (con enlace si existe). */}
        {ev.source && (
          <p className="text-[10px] text-stone-400 mt-3 leading-snug">
            Fuente: {ev.source}
            {ev.source_url && (
              <> <a href={ev.source_url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline break-all">{ev.source_url}</a></>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Main Education Page ─── */
export function Education() {
  const { user, markTourSeen } = useAuth();
  const [activeSection, setActiveSection] = useState<string>('waves');

  // ── Tour guiado (Driver.js) ──
  const tourRef = useRef(false); // evita relanzar el auto-tour
  const launchTour = useCallback(() => {
    // El tour puede cambiar de sección para mostrar el contenido de cada paso.
    startTour(buildEducacionSteps({ openSection: setActiveSection }), {
      onDone: () => { markTourSeen('educacion'); setActiveSection('waves'); },
    });
  }, [markTourSeen]);

  // Lanza el tour la primera vez que el usuario entra al módulo.
  useEffect(() => {
    if (tourRef.current || !user) return;
    if (user.tours_vistos?.educacion) return;
    tourRef.current = true;
    const id = requestAnimationFrame(() => setTimeout(launchTour, 500));
    return () => cancelAnimationFrame(id);
  }, [user, launchTour]);

  const sections = [
    { id: 'waves', label: 'Tipos de ondas', icon: <Waves size={16} />, color: '#2D6A4F' },
    { id: 'magnitude', label: 'Escala de magnitud', icon: <TrendingUp size={16} />, color: '#C4553A' },
    { id: 'depth', label: 'Profundidad', icon: <Layers size={16} />, color: '#1A1A2E' },
    { id: 'fdm', label: 'Metodología FDM', icon: <Calculator size={16} />, color: '#2D6A4F' },
    { id: 'timeline', label: 'Línea de tiempo', icon: <Clock size={16} />, color: '#C9A227' },
    { id: 'glossary', label: 'Glosario', icon: <BookMarked size={16} />, color: '#D4A853' },
    { id: 'references', label: 'Referencias', icon: <Library size={16} />, color: '#C4553A' },
    { id: 'quiz', label: 'Quiz sísmico', icon: <Award size={16} />, color: '#C4553A' },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      <div className="bg-white border-b border-stone-200/60 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-[#1A1A2E] font-bold text-xl flex items-center gap-2">
            <BookOpen size={20} className="text-[#C4553A]" />
            Centro de aprendizaje sísmico
            {/* Botón de ayuda: repite el tour guiado cuando el usuario quiera. */}
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
          <p className="text-stone-400 text-xs mt-0.5">Explora, interactúa y aprende sobre sismología, volcanes y la geología de Nariño</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div data-tour="edu-tabs" className="flex flex-wrap gap-2 mb-6">
          {sections.map(s => (
            <button
              key={s.id}
              data-tour={`edu-tab-${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeSection === s.id
                  ? 'text-white'
                  : 'bg-white text-stone-500 border border-stone-200'
              }`}
              style={activeSection === s.id ? { backgroundColor: '#C4553A', opacity: 0.9 } : {}}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>

        <div data-tour="edu-contenido" key={activeSection} className="animate-fade-in-up">
          {activeSection === 'waves' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Tipos de ondas sísmicas</h2>
                <p className="text-stone-500 text-sm mt-1">Explora las ondas que se generan durante un sismo y cómo se mueve el suelo a su paso</p>
              </div>
              <WaveExplorer />
            </div>
          )}

          {activeSection === 'magnitude' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Escala de magnitud</h2>
                <p className="text-stone-500 text-sm mt-1">Comprende cómo se mide la energía de un sismo y su potencial destructivo</p>
              </div>
              <MagnitudeScale />
            </div>
          )}

          {activeSection === 'depth' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Profundidad sísmica</h2>
                <p className="text-stone-500 text-sm mt-1">Cómo se clasifican los sismos según la profundidad de su foco</p>
              </div>
              <DepthVisualizer />
            </div>
          )}

          {activeSection === 'timeline' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Historia sísmica de Nariño</h2>
                <p className="text-stone-500 text-sm mt-1">Eventos que han marcado la historia sísmica y volcánica de la región</p>
              </div>
              <HistoricalTimeline />
            </div>
          )}

          {activeSection === 'fdm' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Metodología: método de diferencias finitas</h2>
                <p className="text-stone-500 text-sm mt-1">Cómo el simulador resuelve la ecuación de onda elástica paso a paso</p>
              </div>
              <FdmMethodology />
            </div>
          )}

          {activeSection === 'glossary' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Glosario de términos</h2>
                <p className="text-stone-500 text-sm mt-1">Conceptos de sismología, ondas, método numérico y contexto regional de Nariño</p>
              </div>
              <Glossary />
            </div>
          )}

          {activeSection === 'references' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Referencias</h2>
                <p className="text-stone-500 text-sm mt-1">Fuentes para aprender y base técnica del proyecto</p>
              </div>
              <References />
            </div>
          )}

          {activeSection === 'quiz' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Pon a prueba lo que aprendiste</h2>
                <p className="text-stone-500 text-sm mt-1">Responde preguntas sobre sismología, volcanes y la geología de Nariño</p>
              </div>
              <SeismicQuiz />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
