import { useState, useEffect } from 'react';
import {
  BookOpen, Waves, Zap, Award,
  CheckCircle, XCircle, RotateCcw, Layers, ArrowRight, Clock,
  Target, TrendingUp, Globe, Info, Calculator, BookMarked, Library
} from '../lib/icons';
import { loadQuizQuestions, loadWaveFacts, loadTimelineEvents, QuizQuestion, TimelineEvent } from '../lib/educationData';
import { FdmMethodology } from '../components/education/FdmMethodology';
import { Glossary } from '../components/education/Glossary';
import { References } from '../components/education/References';

/* ─── Animated Wave SVG ─── */
function AnimatedWave({ type, color, playing }: { type: string; color: string; playing: boolean }) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let raf: number;
    const animate = () => {
      setOffset(o => (o + 0.8) % 400);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const generatePath = () => {
    const points: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const x = i * 2;
      let y = 40;
      const t = (x + offset) * 0.03;
      if (type === 'P') {
        y = 40 + Math.sin(t * 3) * 18 * Math.exp(-Math.abs(x - 200) * 0.003);
      } else if (type === 'S') {
        y = 40 + Math.sin(t * 2) * 24 * Math.exp(-Math.abs(x - 200) * 0.002);
      } else if (type === 'Love') {
        y = 40 + Math.sin(t * 1.2) * 28 * Math.exp(-Math.abs(x - 200) * 0.0015);
      } else {
        y = 40 + (Math.sin(t * 1.0) * 22 + Math.sin(t * 0.5) * 10) * Math.exp(-Math.abs(x - 200) * 0.0015);
      }
      points.push(`${x},${y.toFixed(1)}`);
    }
    return `M ${points.join(' L ')}`;
  };

  return (
    <svg viewBox="0 0 400 80" className="w-full h-20">
      <line x1="0" y1="40" x2="400" y2="40" stroke="#d6d3d1" strokeWidth="0.5" />
      <path d={generatePath()} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Interactive Wave Explorer ─── */
function WaveExplorer() {
  const [selected, setSelected] = useState<'P' | 'S' | 'Love' | 'Rayleigh'>('P');
  const [playing, setPlaying] = useState(true);
  const [facts, setFacts] = useState<Record<string, string[]>>({});
  const [currentFact, setCurrentFact] = useState('');

  useEffect(() => { loadWaveFacts().then(setFacts); }, []);

  // Pick random fact when wave type changes
  useEffect(() => {
    const waveFacts = facts[selected] || [];
    if (waveFacts.length > 0) {
      setCurrentFact(waveFacts[Math.floor(Math.random() * waveFacts.length)]);
    }
  }, [selected, facts]);

  const waves = {
    P: {
      name: 'Onda P (Primaria)',
      color: '#6B5B95',
      speed: '3–8 km/s',
      motion: 'Compresión-dilatación',
      icon: <Zap size={18} />,
      desc: 'Las más rápidas. Comprimen y dilatan el material en la dirección de propagación, como el sonido. Viajan por sólidos, líquidos y gases. Son las primeras en llegar a los sismógrafos.',
      damage: 'Bajo',
      component: 'Vertical (Z)',
      fact: ['Pueden atravesar el núcleo líquido de la Tierra, por eso se detectan en todo el planeta.', 'Viajan a ~6 km/s en la corteza terrestre, más rápido que cualquier avión.', 'Fueron las primeras ondas sísmicas identificadas, de ahí su nombre "Primarias".'],
    },
    S: {
      name: 'Onda S (Secundaria)',
      color: '#C4553A',
      speed: '2–5 km/s',
      motion: 'Corte transversal',
      icon: <Waves size={18} />,
      desc: 'Mueven el suelo perpendicular a su dirección de viaje. No se propagan en líquidos. Son las principales causantes de daño estructural en edificaciones.',
      damage: 'Alto',
      component: 'Horizontal (N, E)',
      fact: ['Su ausencia en el núcleo externo de la Tierra demostró que este es líquido.', 'Son las principales responsables del daño en edificaciones durante un sismo.', 'Se mueven como una serpiente, perpendicular a la dirección de propagación.'],
    },
    Love: {
      name: 'Onda Love',
      color: '#2D6A4F',
      speed: '2–4.5 km/s',
      motion: 'Cizalla horizontal',
      icon: <TrendingUp size={18} />,
      desc: 'Ondas superficiales que sacuden el suelo horizontalmente. Resultan de la interferencia de ondas S en capas superficiales. Muy destructivas para edificios altos.',
      damage: 'Muy alto',
      component: 'Horizontal (N, E)',
      fact: ['Nombradas por Augustus Love, quien las predijo matemáticamente en 1911.', 'Son especialmente destructivas para edificios altos por su movimiento horizontal.', 'Solo se propagan en la superficie, no penetran al interior de la Tierra.'],
    },
    Rayleigh: {
      name: 'Onda Rayleigh',
      color: '#6B5B95',
      speed: '1–4 km/s',
      motion: 'Elíptico (rodamiento)',
      icon: <Globe size={18} />,
      desc: 'Producen un movimiento elíptico como olas en el mar. Son las de mayor amplitud a larga distancia y generan el "rolling" que se siente en los sismos grandes.',
      damage: 'Muy alto',
      component: 'Vertical + Horizontal',
      fact: ['Lord Rayleigh las predijo en 1885. Son las ondas que más se sienten en sismos lejanos.', 'Producen un movimiento elíptico retrógrado, como olas del mar en reversa.', 'Son las ondas de mayor amplitud a grandes distancias del epicentro.'],
    },
  };

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

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-stone-50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-stone-500 uppercase tracking-wide">Daño</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: w.color }}>{w.damage}</div>
          </div>
          <div className="bg-stone-50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-stone-500 uppercase tracking-wide">Componente</div>
            <div className="text-xs font-bold text-[#1A1A2E] mt-0.5">{w.component}</div>
          </div>
          <div className="bg-stone-50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-stone-500 uppercase tracking-wide">Velocidad</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: w.color }}>{w.speed}</div>
          </div>
        </div>

        <div className="bg-[#D4A853]/10 border border-[#D4A853]/20 rounded-lg p-3 flex gap-2">
          <Info size={14} className="text-[#D4A853] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#D4A853] leading-relaxed"><span className="font-bold">Dato curioso:</span> {currentFact || 'Cargando...'}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Seismic Quiz ─── */
function SeismicQuiz() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => { loadQuizQuestions().then(q => { setQuestions(q); setLoading(false); }); }, []);

  if (loading || questions.length === 0) return <div className="text-center py-8 text-stone-400">Cargando preguntas...</div>;

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
        <button onClick={handleReset} className="flex items-center gap-2 mx-auto bg-[#6B5B95] text-white px-6 py-2.5 rounded-xl font-bold text-sm">
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
          <span className="text-[#1A1A2E] text-sm font-bold">Quiz Sísmico</span>
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
          <div className={`rounded-xl p-3 mb-4 text-xs leading-relaxed ${selected === q.correct_index ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
            <span className="font-bold">{selected === q.correct_index ? '✓ ¡Correcto!' : '✗ Incorrecto.'}</span> {q.explanation}
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

/* ─── Earthquake Depth Visualizer ─── */
function DepthVisualizer() {
  const [depth, setDepth] = useState(15);

  const classification = depth < 70 ? 'Superficial' : depth < 300 ? 'Intermedio' : 'Profundo';
  const classColor = depth < 70 ? '#ef4444' : depth < 300 ? '#C4553A' : '#2D6A4F';
  const intensity = depth < 30 ? 'Muy alta' : depth < 70 ? 'Alta' : depth < 150 ? 'Moderada' : 'Baja';

  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 p-5">
      <h3 className="font-black text-[#1A1A2E] mb-1 flex items-center gap-2">
        <Layers size={18} className="text-[#C4553A]" />
        Profundidad y Daño Sísmico
      </h3>
      <p className="text-xs text-stone-500 mb-4">Mueve el control para explorar cómo la profundidad afecta la intensidad en superficie</p>

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

        <div className="w-40 space-y-3">
          <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${classColor}10`, border: `1px solid ${classColor}30` }}>
            <div className="text-[10px] text-stone-500 uppercase">Clasificación</div>
            <div className="text-sm font-black" style={{ color: classColor }}>{classification}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-center border border-stone-200/60">
            <div className="text-[10px] text-stone-500 uppercase">Intensidad</div>
            <div className="text-sm font-bold text-[#1A1A2E]">{intensity}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-center border border-stone-200/60">
            <div className="text-[10px] text-stone-500 uppercase">Profundidad</div>
            <div className="text-sm font-bold text-[#1A1A2E]">{depth} km</div>
          </div>
          <div className="bg-[#D4A853]/10 border border-[#D4A853]/20 rounded-xl p-3">
            <p className="text-[10px] text-[#D4A853] leading-relaxed">
              {depth < 30 && 'Sismos muy superficiales causan el mayor daño. La energía se libera cerca de la superficie.'}
              {depth >= 30 && depth < 70 && 'Sismos superficiales. Aún causan daño significativo en la zona epicentral.'}
              {depth >= 70 && depth < 300 && 'Sismos intermedios. Se sienten en áreas amplias pero con menor intensidad.'}
              {depth >= 300 && 'Sismos profundos. Rara vez causan daño significativo en superficie.'}
            </p>
          </div>
        </div>
      </div>
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
        Escala de Magnitud Interactiva
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

/* ─── Historical Timeline ─── */
function HistoricalTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTimelineEvents().then(e => { setEvents(e); setLoading(false); }); }, []);

  if (loading || events.length === 0) return <div className="text-center py-8 text-stone-400">Cargando línea de tiempo...</div>;

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
                {e.event_type === 'volcanic' ? '🌋' : '⚡'}
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
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold" style={{ color: ev.event_type === 'volcanic' ? '#C4553A' : '#2D6A4F' }}>
            {ev.event_type === 'volcanic' ? '🌋 Evento Volcánico' : '⚡ Evento Tectónico'}
          </span>
          {ev.magnitude !== '—' && <span className="text-xs text-stone-400">· Mw {ev.magnitude}</span>}
        </div>
        <h4 className="text-2xl font-black text-[#1A1A2E] mb-2">{ev.title}</h4>
        <p className="text-stone-600 text-sm leading-relaxed">{ev.description}</p>
      </div>
    </div>
  );
}

/* ─── Main Education Page ─── */
export function Education() {
  const [activeSection, setActiveSection] = useState<string>('waves');

  const sections = [
    { id: 'waves', label: 'Tipos de Ondas', icon: <Waves size={16} />, color: '#2D6A4F' },
    { id: 'magnitude', label: 'Escala de Magnitud', icon: <TrendingUp size={16} />, color: '#C4553A' },
    { id: 'depth', label: 'Profundidad', icon: <Layers size={16} />, color: '#6B5B95' },
    { id: 'fdm', label: 'Metodología FDM', icon: <Calculator size={16} />, color: '#2D6A4F' },
    { id: 'timeline', label: 'Línea de Tiempo', icon: <Clock size={16} />, color: '#6B5B95' },
    { id: 'glossary', label: 'Glosario', icon: <BookMarked size={16} />, color: '#D4A853' },
    { id: 'references', label: 'Referencias', icon: <Library size={16} />, color: '#6B5B95' },
    { id: 'quiz', label: 'Quiz Sísmico', icon: <Award size={16} />, color: '#C4553A' },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      <div className="bg-white border-b border-stone-200/60 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-[#1A1A2E] font-bold text-xl flex items-center gap-2">
            <BookOpen size={20} className="text-[#C4553A]" />
            Centro de Aprendizaje Sísmico
          </h1>
          <p className="text-stone-400 text-xs mt-0.5">Explora, interactúa y aprende sobre sismología, volcanes y la geología de Nariño</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 mb-6">
          {sections.map(s => (
            <button
              key={s.id}
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

        <div key={activeSection} className="animate-fade-in-up">
          {activeSection === 'waves' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Tipos de Ondas Sísmicas</h2>
                <p className="text-stone-500 text-sm mt-1">Explora las diferentes ondas que se generan durante un sismo y cómo se propagan</p>
              </div>
              <WaveExplorer />
            </div>
          )}

          {activeSection === 'magnitude' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Escala de Magnitud</h2>
                <p className="text-stone-500 text-sm mt-1">Comprende cómo se mide la energía de un sismo y su potencial destructivo</p>
              </div>
              <MagnitudeScale />
            </div>
          )}

          {activeSection === 'depth' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Profundidad Sísmica</h2>
                <p className="text-stone-500 text-sm mt-1">Descubre cómo la profundidad del foco afecta la intensidad del sismo en superficie</p>
              </div>
              <DepthVisualizer />
            </div>
          )}

          {activeSection === 'timeline' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Historia Sísmica de Nariño</h2>
                <p className="text-stone-500 text-sm mt-1">Eventos que han marcado la historia sísmica y volcánica de la región</p>
              </div>
              <HistoricalTimeline />
            </div>
          )}

          {activeSection === 'fdm' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Metodología: Método de Diferencias Finitas</h2>
                <p className="text-stone-500 text-sm mt-1">Cómo el simulador resuelve la ecuación de onda elástica paso a paso</p>
              </div>
              <FdmMethodology />
            </div>
          )}

          {activeSection === 'glossary' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Glosario de Términos</h2>
                <p className="text-stone-500 text-sm mt-1">Conceptos de sismología, ondas, método numérico y contexto regional de Nariño</p>
              </div>
              <Glossary />
            </div>
          )}

          {activeSection === 'references' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Referencias Bibliográficas</h2>
                <p className="text-stone-500 text-sm mt-1">Fuentes académicas, software y estándares de datos en los que se basa SismoNariño</p>
              </div>
              <References />
            </div>
          )}

          {activeSection === 'quiz' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-black text-[#1A1A2E]">Pon a Prueba tu Conocimiento</h2>
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
