/**
 * Laboratorio de ondas sísmicas.
 *
 * Muestra el movimiento FÍSICO de las partículas del medio al paso de cada
 * onda, no una traza. El usuario elige el tipo (P, S, Love, Rayleigh), ajusta
 * frecuencia y velocidad de la animación, puede seguir una partícula y ver su
 * trayectoria, y observa un sismómetro virtual en la superficie que dibuja en
 * tiempo real sus componentes vertical y horizontal.
 *
 * Física representada (Shearer, 2019):
 *   P: longitudinal, desplazamiento a lo largo del eje de propagación.
 *   S: transversal, desplazamiento perpendicular.
 *   Love: superficial, cizalla horizontal; se muestra en vista superior.
 *   Rayleigh: superficial, elíptica retrógrada que decae con la profundidad.
 *
 * Incluye un reto de 5 rondas: se muestra una trayectoria o un sismograma y el
 * usuario elige qué onda es, con explicación al responder.
 *
 * @module education/WaveLab
 */
import { useEffect, useRef, useState } from 'react';
import { WAVE_COLORS, type WaveType } from '../../lib/waveColors';
import { WAVE_INFO } from '../../lib/educationContent';
import { Play, Pause, Target, RotateCcw, CheckCircle, XCircle } from '../../lib/icons';

const WAVES: WaveType[] = ['P', 'S', 'Love', 'Rayleigh'];

/**
 * Desplazamiento de una partícula respecto a su reposo, para un tipo de onda.
 * `col` es la fase espacial (índice de columna), `phase` el tiempo, `decay` el
 * factor por profundidad (1 en superficie). Devuelve {dx, dy} en px.
 */
function displacement(type: WaveType, theta: number, amp: number, decay: number): { dx: number; dy: number } {
  switch (type) {
    case 'P':
      // Longitudinal: solo a lo largo del eje de propagación (horizontal).
      return { dx: Math.sin(theta) * amp * 1.4, dy: 0 };
    case 'S':
      // Transversal: solo perpendicular (vertical en la vista de corte).
      return { dx: 0, dy: Math.sin(theta) * amp * 1.6 };
    case 'Love':
      // Cizalla horizontal (en vista superior, el eje "y" es el norte-sur).
      return { dx: 0, dy: Math.sin(theta) * amp * 1.6 * decay };
    case 'Rayleigh':
      // Elíptica retrógrada en el plano vertical, decae con la profundidad.
      return { dx: Math.sin(theta) * amp * decay, dy: -Math.cos(theta) * amp * 1.3 * decay };
  }
}

interface Props {
  /** Abre el Simulador o el Mapa 3D con un caso parecido. */
  onOpenSimulator?: () => void;
  onOpenMap3D?: () => void;
  /** Se llama cuando el usuario termina el reto (para marcar el capítulo). */
  onChallengeDone?: () => void;
}

export function WaveLab({ onOpenSimulator, onOpenMap3D, onChallengeDone }: Props) {
  const [type, setType] = useState<WaveType>('P');
  const [playing, setPlaying] = useState(true);
  const [freq, setFreq] = useState(1); // factor de frecuencia espacial
  const [speed, setSpeed] = useState(1); // factor de velocidad de animación
  const [follow, setFollow] = useState(false);

  const phaseRef = useRef(0);
  const [, setTick] = useState(0); // fuerza re-render por frame

  // Historial del sismómetro (componentes vertical y horizontal en superficie).
  const seisRef = useRef<{ v: number[]; h: number[] }>({ v: [], h: [] });

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      phaseRef.current = (phaseRef.current + 0.04 * speed) % (Math.PI * 2);
      setTick(t => (t + 1) % 100000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  // Reinicia el historial del sismómetro al cambiar de onda.
  useEffect(() => { seisRef.current = { v: [], h: [] }; }, [type]);

  const info = WAVE_INFO.find(w => w.key === type)!;
  const color = WAVE_COLORS[type];
  const isLove = type === 'Love';
  const isSurface = type === 'Love' || type === 'Rayleigh';

  // ── Geometría del lienzo ──
  const W = 640, H = 300;
  const COLS = 30;
  const ROWS = isSurface ? 6 : 3;
  const marginX = 30, marginTop = 28, marginBottom = 44;
  const gridW = W - 2 * marginX;
  const gridH = H - marginTop - marginBottom;
  const dxc = gridW / (COLS - 1);
  const dyc = ROWS > 1 ? gridH / (ROWS - 1) : 0;
  const k = 0.45 * freq; // número de onda espacial
  const amp = 9;
  const phase = phaseRef.current;

  // Partícula seguida: columna central, fila superior (superficie).
  const followCol = Math.round(COLS * 0.5);
  const followRow = 0;

  // Rastro de la partícula seguida (se recalcula cada frame según su órbita).
  const trail: string[] = [];
  if (follow) {
    const x0 = marginX + followCol * dxc;
    const y0 = marginTop + followRow * dyc;
    for (let s = 0; s <= 40; s++) {
      const th = k * followCol - (phase - s * 0.12) * 4;
      const d = displacement(type, th, amp, 1);
      trail.push(`${(x0 + d.dx).toFixed(1)},${(y0 + d.dy).toFixed(1)}`);
    }
  }

  // Sismómetro: la partícula de superficie en la columna del sensor.
  const sensorCol = Math.round(COLS * 0.78);
  {
    const th = k * sensorCol - phase * 4;
    const d = displacement(type, th, amp, 1);
    const s = seisRef.current;
    s.v.push(d.dy); s.h.push(d.dx);
    if (s.v.length > 120) { s.v.shift(); s.h.shift(); }
  }

  // Puntos de la malla.
  const dots: { x: number; y: number; op: number; hi: boolean }[] = [];
  for (let r = 0; r < ROWS; r++) {
    const depthN = ROWS > 1 ? r / (ROWS - 1) : 0;
    const decay = isSurface ? Math.exp(-1.5 * depthN) : 1;
    for (let c = 0; c < COLS; c++) {
      const x0 = marginX + c * dxc;
      const y0 = marginTop + r * dyc;
      const th = k * c - phase * 4;
      const d = displacement(type, th, amp, decay);
      const hi = follow && c === followCol && r === followRow;
      dots.push({ x: x0 + d.dx, y: y0 + d.dy, op: isSurface ? 0.3 + 0.7 * decay : 1, hi });
    }
  }

  // Sismograma del sensor (vertical y horizontal), como mini trazas.
  const seisPath = (vals: number[], cy: number): string => {
    if (vals.length < 2) return '';
    const w = 150, x0 = W - marginX - w;
    const pts = vals.map((v, i) => `${(x0 + (i / 119) * w).toFixed(1)},${(cy - v).toFixed(1)}`);
    return `M ${pts.join(' L ')}`;
  };

  return (
    <div className="space-y-4">
      {/* Selector de onda */}
      <div className="flex flex-wrap gap-2">
        {WAVES.map(w => (
          <button key={w} onClick={() => setType(w)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
            style={type === w
              ? { backgroundColor: WAVE_COLORS[w], color: '#fff', borderColor: WAVE_COLORS[w] }
              : { backgroundColor: '#fff', color: '#57534e', borderColor: '#e7e5e4' }}>
            {w === 'P' ? 'Onda P' : w === 'S' ? 'Onda S' : `Onda ${w}`}
          </button>
        ))}
      </div>

      {/* Lienzo de partículas */}
      <div className="bg-white rounded-xl border border-stone-200/60 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }} role="img"
          aria-label={`Movimiento de partículas de la onda ${type}`}>
          {/* Rótulo de vista */}
          <text x={marginX} y={16} fontSize={11} fill="#78716c">
            {isLove ? 'Vista superior (planta)' : 'Corte del suelo (profundidad hacia abajo)'}
          </text>

          {/* Superficie (línea) para ondas de cuerpo y Rayleigh */}
          {!isLove && (
            <line x1={0} y1={marginTop} x2={W} y2={marginTop} stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 3" />
          )}

          {/* Flecha de propagación */}
          <line x1={marginX} y1={H - 24} x2={marginX + 54} y2={H - 24} stroke="#9ca3af" strokeWidth={1} />
          <path d={`M ${marginX + 54} ${H - 27} L ${marginX + 60} ${H - 24} L ${marginX + 54} ${H - 21} Z`} fill="#9ca3af" />
          <text x={marginX + 66} y={H - 21} fontSize={9} fill="#9ca3af">propagación</text>

          {/* Rastro de la partícula seguida */}
          {follow && trail.length > 1 && (
            <path d={`M ${trail.join(' L ')}`} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5} strokeDasharray="2 2" />
          )}

          {/* Malla de partículas */}
          {dots.map((d, i) => (
            <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.hi ? 4.5 : 2.6}
              fill={d.hi ? color : color} opacity={d.hi ? 1 : d.op}
              stroke={d.hi ? '#1A1A2E' : 'none'} strokeWidth={d.hi ? 1 : 0} />
          ))}

          {/* Sismómetro virtual en la superficie (triángulo) */}
          {!isLove && (() => {
            const sx = marginX + sensorCol * dxc;
            return (
              <g>
                <path d={`M ${sx - 6} ${marginTop} L ${sx + 6} ${marginTop} L ${sx} ${marginTop - 9} Z`} fill="#1A1A2E" />
                <text x={sx + 9} y={marginTop - 2} fontSize={8} fill="#78716c">sismómetro</text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Sismómetro: trazas en tiempo real (vertical y horizontal) */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-3">
        <div className="text-[11px] font-semibold text-stone-500 mb-1">Sismómetro en la superficie (tiempo real)</div>
        <svg viewBox={`0 0 ${W} 90`} className="w-full" style={{ display: 'block' }}>
          <text x={6} y={22} fontSize={9} fill="#78716c">Vertical</text>
          <line x1={W - marginX - 150} y1={28} x2={W - marginX} y2={28} stroke="#f0efed" strokeWidth={1} />
          <path d={seisPath(seisRef.current.v, 28)} fill="none" stroke={color} strokeWidth={1.4} />
          <text x={6} y={68} fontSize={9} fill="#78716c">Horizontal</text>
          <line x1={W - marginX - 150} y1={72} x2={W - marginX} y2={72} stroke="#f0efed" strokeWidth={1} />
          <path d={seisPath(seisRef.current.h, 72)} fill="none" stroke={color} strokeWidth={1.4} />
        </svg>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl border border-stone-200/60 p-3">
        <button onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#C4553A] text-white">
          {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pausar' : 'Animar'}
        </button>
        <button onClick={() => setFollow(f => !f)}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${follow ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-stone-600 border-stone-200'}`}>
          <Target size={13} /> Seguir una partícula
        </button>
        <label className="flex items-center gap-2 text-[11px] text-stone-500">
          Frecuencia
          <input type="range" min={0.5} max={2} step={0.1} value={freq} onChange={e => setFreq(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-stone-500">
          Velocidad
          <input type="range" min={0.3} max={2.5} step={0.1} value={speed} onChange={e => setSpeed(Number(e.target.value))} />
        </label>
      </div>

      {/* Texto corto (al lado en pantallas anchas via el contenedor del capítulo) */}
      <p className="text-sm text-stone-600 leading-relaxed">{info.desc}</p>

      {/* Botones a Simulador / Mapa 3D con un caso parecido */}
      <div className="flex flex-wrap gap-2">
        {onOpenSimulator && (
          <button onClick={onOpenSimulator} className="text-xs font-bold px-3 py-2 rounded-lg bg-[#C4553A]/10 text-[#C4553A] border border-[#C4553A]/20">
            Ver estas ondas en el Simulador
          </button>
        )}
        {onOpenMap3D && (
          <button onClick={onOpenMap3D} className="text-xs font-bold px-3 py-2 rounded-lg bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/20">
            Ver la propagación en el Mapa 3D
          </button>
        )}
      </div>

      {/* Reto */}
      <WaveChallenge onDone={onChallengeDone} />

      {/* Fuente al pie */}
      <p className="text-[10px] text-stone-400 leading-snug">Fuente: {info.source.cita}</p>
    </div>
  );
}

/* ─── Reto: 5 rondas de "¿qué onda es?" ─── */
const CHALLENGE_ROUNDS: { type: WaveType; hint: string; explain: string }[] = [
  { type: 'P', hint: 'La partícula se mueve adelante y atrás a lo largo de la dirección de propagación.', explain: 'Es una onda P: movimiento longitudinal (compresión y dilatación).' },
  { type: 'S', hint: 'La partícula se mueve perpendicular a la dirección de propagación.', explain: 'Es una onda S: movimiento transversal (cizalla).' },
  { type: 'Rayleigh', hint: 'La partícula describe una elipse en el plano vertical y el movimiento decae con la profundidad.', explain: 'Es una onda Rayleigh: movimiento elíptico retrógrado superficial.' },
  { type: 'Love', hint: 'En vista superior, el suelo se sacude de lado a lado (horizontal), perpendicular a la propagación.', explain: 'Es una onda Love: cizalla horizontal superficial.' },
  { type: 'P', hint: 'Es la primera en llegar y comprime el material en la dirección en que viaja.', explain: 'Es una onda P: la más rápida y longitudinal.' },
];

function WaveChallenge({ onDone }: { onDone?: () => void }) {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<WaveType | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const r = CHALLENGE_ROUNDS[round];
  const answered = picked !== null;

  const pick = (w: WaveType) => {
    if (answered) return;
    setPicked(w);
    if (w === r.type) setScore(s => s + 1);
  };
  const next = () => {
    if (round < CHALLENGE_ROUNDS.length - 1) { setRound(round + 1); setPicked(null); }
    else { setFinished(true); onDone?.(); }
  };
  const reset = () => { setRound(0); setPicked(null); setScore(0); setFinished(false); };

  if (finished) {
    return (
      <div className="bg-white rounded-xl border border-stone-200/60 p-5 text-center">
        <div className="text-sm font-bold text-[#1A1A2E] mb-1">Reto completado</div>
        <div className="text-2xl font-black mb-2" style={{ color: score >= 3 ? '#2D6A4F' : '#C4553A' }}>{score}/{CHALLENGE_ROUNDS.length}</div>
        <button onClick={reset} className="flex items-center gap-1.5 mx-auto text-xs font-bold px-3 py-1.5 rounded-lg bg-[#2D6A4F] text-white">
          <RotateCcw size={13} /> Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[#1A1A2E]">Reto: ¿qué onda es?</span>
        <span className="text-[11px] text-stone-400">{round + 1}/{CHALLENGE_ROUNDS.length} · {score} pts</span>
      </div>
      <p className="text-sm text-stone-600 mb-3">{r.hint}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {WAVES.map(w => {
          let cls = 'bg-stone-50 border-stone-200 text-stone-600';
          if (answered) {
            if (w === r.type) cls = 'bg-green-500/10 border-green-500/40 text-green-700';
            else if (w === picked) cls = 'bg-red-500/10 border-red-500/40 text-red-700';
          }
          return (
            <button key={w} onClick={() => pick(w)}
              className={`px-2 py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 ${cls}`}>
              {answered && w === r.type && <CheckCircle size={12} className="text-green-600" />}
              {answered && w === picked && w !== r.type && <XCircle size={12} className="text-red-500" />}
              {w}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="text-xs text-stone-600 bg-stone-50 rounded-lg p-2.5 mb-3">{r.explain}</div>
      )}
      {answered && (
        <button onClick={next} className="w-full text-xs font-bold py-2 rounded-lg bg-[#C4553A] text-white">
          {round < CHALLENGE_ROUNDS.length - 1 ? 'Siguiente' : 'Ver resultado'}
        </button>
      )}
    </div>
  );
}
