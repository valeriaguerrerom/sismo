/**
 * Capítulo 1: Ondas sísmicas.
 *
 * Interacción principal: un corte vertical del suelo con una malla de
 * partículas que se mueven según el tipo de onda elegido (P, S con sus
 * variantes SV y SH, Love, Rayleigh). El usuario toca cualquier partícula para
 * seguir su trayectoria, y abajo un sismómetro a todo el ancho dibuja en tiempo
 * real las componentes vertical y horizontal.
 *
 * Física representada (Shearer, 2019):
 *   P: longitudinal, el suelo se comprime y dilata en la dirección de avance.
 *   S (SV): transversal en el plano vertical, perpendicular al avance.
 *   S (SH) y Love: movimiento horizontal perpendicular al avance; se observan
 *     en una vista en planta (desde arriba).
 *   Love y Rayleigh: ondas superficiales cuya amplitud decae con la profundidad.
 *   Rayleigh: movimiento elíptico retrógrado; en superficie la componente
 *     vertical y la horizontal van desfasadas un cuarto de periodo.
 *
 * El modo carrera muestra un sismo a la izquierda y una estación a la derecha:
 * P y S salen juntas y la S llega después; con ese retraso se estima la
 * distancia. Incluye un reto visual de cinco rondas.
 *
 * @module education/WaveLab
 */
import { useEffect, useRef, useState } from 'react';
import { WAVE_COLORS } from '../../lib/waveColors';
import { WAVE_INFO } from '../../lib/educationContent';
import { Play, Pause, RotateCcw, CheckCircle, XCircle } from '../../lib/icons';

/** Tipo de onda que el laboratorio sabe animar (S se desdobla en SV y SH). */
type LabWave = 'P' | 'SV' | 'SH' | 'Love' | 'Rayleigh';

/** Color de cada modo (SV y SH comparten el color de la S). */
const LAB_COLOR: Record<LabWave, string> = {
  P: WAVE_COLORS.P,
  SV: WAVE_COLORS.S,
  SH: WAVE_COLORS.S,
  Love: WAVE_COLORS.Love,
  Rayleigh: WAVE_COLORS.Rayleigh,
};

/** Las que se ven mejor en planta (movimiento horizontal transversal). */
const PLAN_VIEW: Record<LabWave, boolean> = { P: false, SV: false, SH: true, Love: true, Rayleigh: false };
/** Las superficiales decaen con la profundidad. */
const SURFACE: Record<LabWave, boolean> = { P: false, SV: false, SH: false, Love: true, Rayleigh: true };

/**
 * Desplazamiento de una partícula respecto a su reposo.
 * `theta` es la fase (número de onda por posición menos tiempo), `amp` la
 * amplitud base y `decay` el factor por profundidad (1 en superficie).
 *   dx = a lo largo del eje de propagación (horizontal del corte).
 *   dy = perpendicular en el plano de la vista.
 */
function displacement(w: LabWave, theta: number, amp: number, decay: number): { dx: number; dy: number } {
  switch (w) {
    case 'P':
      return { dx: Math.sin(theta) * amp * 1.4, dy: 0 };
    case 'SV':
      return { dx: 0, dy: Math.sin(theta) * amp * 1.6 };
    case 'SH':
      // En planta, dy es el eje norte-sur; el movimiento es transversal y, al no
      // ser superficial, no decae con la profundidad.
      return { dx: 0, dy: Math.sin(theta) * amp * 1.6 };
    case 'Love':
      // En planta: cizalla horizontal transversal. En superficie la amplitud es
      // la misma para todas las partículas de esa capa; el decaimiento con la
      // profundidad se muestra aparte, en el perfil lateral.
      return { dx: 0, dy: Math.sin(theta) * amp * 1.6 * decay };
    case 'Rayleigh':
      // Elíptica retrógrada en el plano vertical; decae con la profundidad.
      return { dx: Math.sin(theta) * amp * decay, dy: -Math.cos(theta) * amp * 1.3 * decay };
  }
}

interface Props {
  /** Se llama cuando el usuario termina el reto (marca el capítulo). */
  onChallengeDone?: () => void;
}

export function WaveLab({ onChallengeDone }: Props) {
  const [wave, setWave] = useState<LabWave>('P');
  const [playing, setPlaying] = useState(true);
  const [follow, setFollow] = useState<{ r: number; c: number } | null>(null);

  const phaseRef = useRef(0);
  const [, setTick] = useState(0);

  // Historial del sismómetro de superficie (vertical y horizontal).
  const seis = useRef<{ v: number[]; h: number[] }>({ v: [], h: [] });

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      phaseRef.current = (phaseRef.current + 0.045) % (Math.PI * 2);
      setTick(t => (t + 1) % 1e6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Al cambiar de onda, reinicia el sismómetro y la partícula seguida.
  useEffect(() => { seis.current = { v: [], h: [] }; setFollow(null); }, [wave]);

  const color = LAB_COLOR[wave];
  const plan = PLAN_VIEW[wave];
  const surface = SURFACE[wave];
  const infoKey = wave === 'SV' || wave === 'SH' ? 'S' : wave;
  const info = WAVE_INFO.find(w => w.key === infoKey)!;

  // ── Geometría del lienzo de partículas ──
  const W = 560, H = 240;
  const COLS = 26;
  const ROWS = surface ? 7 : 4;
  const mX = 26, mTop = 26, mBot = 20;
  const gridW = W - 2 * mX;
  const gridH = H - mTop - mBot;
  const dxc = gridW / (COLS - 1);
  const dyc = ROWS > 1 ? gridH / (ROWS - 1) : 0;
  const k = 0.5;         // número de onda espacial
  const amp = 8;
  const phase = phaseRef.current;

  // Partícula del sensor (columna fija en superficie) para el sismómetro.
  const sensorCol = Math.round(COLS * 0.8);
  {
    const th = k * sensorCol - phase * 4;
    const d = displacement(wave, th, amp, 1);
    const s = seis.current;
    s.v.push(d.dy); s.h.push(d.dx);
    if (s.v.length > 160) { s.v.shift(); s.h.shift(); }
  }

  // Malla de partículas.
  const dots: { r: number; c: number; x: number; y: number; op: number; hi: boolean }[] = [];
  for (let r = 0; r < ROWS; r++) {
    const depthN = ROWS > 1 ? r / (ROWS - 1) : 0;
    const decay = surface ? Math.exp(-1.6 * depthN) : 1;
    for (let c = 0; c < COLS; c++) {
      const x0 = mX + c * dxc;
      const y0 = mTop + r * dyc;
      const th = k * c - phase * 4;
      const d = displacement(wave, th, amp, decay);
      const hi = follow?.r === r && follow?.c === c;
      // En planta la "profundidad" no aplica: todas las partículas se ven con la
      // misma opacidad. En corte, las superficiales se atenúan con la profundidad.
      const op = surface && !plan ? 0.35 + 0.65 * decay : 1;
      dots.push({ r, c, x: x0 + d.dx, y: y0 + d.dy, op, hi });
    }
  }

  // Trayectoria de la partícula seguida (un ciclo completo).
  const trail: string[] = [];
  if (follow) {
    const x0 = mX + follow.c * dxc;
    const y0 = mTop + follow.r * dyc;
    const depthN = ROWS > 1 ? follow.r / (ROWS - 1) : 0;
    const decay = surface ? Math.exp(-1.6 * depthN) : 1;
    for (let s = 0; s <= 48; s++) {
      const th = (s / 48) * Math.PI * 2;
      const d = displacement(wave, th, amp, decay);
      trail.push(`${(x0 + d.dx).toFixed(1)},${(y0 + d.dy).toFixed(1)}`);
    }
  }

  // Sismograma del sensor como mini traza.
  const seisPath = (vals: number[], cy: number): string => {
    if (vals.length < 2) return '';
    const n = vals.length;
    const pts = vals.map((v, i) => `${(mX + (i / (n - 1)) * gridW).toFixed(1)},${(cy - v).toFixed(1)}`);
    return `M ${pts.join(' L ')}`;
  };

  const waveBtns: { id: LabWave; label: string }[] = [
    { id: 'P', label: 'P' },
    { id: 'SV', label: 'S (SV)' },
    { id: 'SH', label: 'S (SH)' },
    { id: 'Love', label: 'Love' },
    { id: 'Rayleigh', label: 'Rayleigh' },
  ];

  return (
    <div className="space-y-4">
      {/* Selector de onda */}
      <div className="flex flex-wrap gap-2">
        {waveBtns.map(b => (
          <button
            key={b.id}
            onClick={() => setWave(b.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
            style={wave === b.id
              ? { backgroundColor: LAB_COLOR[b.id], color: '#fff', borderColor: LAB_COLOR[b.id] }
              : { backgroundColor: '#fff', color: '#57534e', borderColor: '#e7e5e4' }}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
        {/* Lienzo principal: corte o planta + perfil de amplitud para Love */}
        <div className="bg-white rounded-xl border border-stone-200/60 overflow-hidden">
          <div className="flex">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }} role="img"
              aria-label={`Movimiento de partículas de la onda ${wave}`}>
              <text x={mX} y={15} fontSize={10} fill="#78716c">
                {plan ? 'Vista en planta (desde arriba)' : 'Corte del suelo (profundidad hacia abajo)'}
              </text>

              {/* Superficie para corte */}
              {!plan && (
                <line x1={0} y1={mTop} x2={W} y2={mTop} stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 3" />
              )}

              {/* Flecha de propagación */}
              <line x1={mX} y1={H - 8} x2={mX + 44} y2={H - 8} stroke="#9ca3af" strokeWidth={1} />
              <path d={`M ${mX + 44} ${H - 11} L ${mX + 50} ${H - 8} L ${mX + 44} ${H - 5} Z`} fill="#9ca3af" />
              <text x={mX + 56} y={H - 5} fontSize={9} fill="#9ca3af">propagación</text>

              {/* Trayectoria de la partícula seguida */}
              {follow && trail.length > 1 && (
                <path d={`M ${trail.join(' L ')}`} fill="none" stroke={color} strokeWidth={1.3} opacity={0.55} strokeDasharray="2 2" />
              )}

              {/* Malla de partículas (clic para seguir) */}
              {dots.map((d) => (
                <circle
                  key={`${d.r}-${d.c}`}
                  cx={d.x.toFixed(1)} cy={d.y.toFixed(1)}
                  r={d.hi ? 4.5 : 2.5}
                  fill={color} opacity={d.hi ? 1 : d.op}
                  stroke={d.hi ? '#1A1A2E' : 'none'} strokeWidth={d.hi ? 1 : 0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFollow(f => (f?.r === d.r && f?.c === d.c ? null : { r: d.r, c: d.c }))}
                />
              ))}

              {/* Sismómetro en superficie (solo en corte) */}
              {!plan && (() => {
                const sx = mX + sensorCol * dxc;
                return (
                  <g>
                    <path d={`M ${sx - 6} ${mTop} L ${sx + 6} ${mTop} L ${sx} ${mTop - 9} Z`} fill="#1A1A2E" />
                    <text x={sx + 9} y={mTop - 2} fontSize={8} fill="#78716c">sismómetro</text>
                  </g>
                );
              })()}
            </svg>

            {/* Perfil de amplitud contra profundidad (solo ondas superficiales) */}
            {surface && (
              <div className="flex-shrink-0 border-l border-stone-100 px-2 py-2" style={{ width: 92 }}>
                <AmplitudeProfile color={color} plan={plan} />
              </div>
            )}
          </div>
        </div>

        {/* Texto corto al lado */}
        <div className="space-y-2">
          <p className="text-sm text-stone-600 leading-relaxed">{info.desc}</p>
          {plan && (
            <p className="text-xs text-stone-500 leading-relaxed">
              En planta, todas las partículas de la superficie se mueven con la misma amplitud. El decaimiento con la profundidad se muestra en el perfil lateral.
            </p>
          )}
          {wave === 'Rayleigh' && (
            <p className="text-xs text-stone-500 leading-relaxed">
              En superficie, las componentes vertical y horizontal van desfasadas un cuarto de periodo: por eso la partícula describe una elipse.
            </p>
          )}
          <p className="text-xs text-stone-500">Toca cualquier partícula para seguir su trayectoria.</p>
        </div>
      </div>

      {/* Sismómetro a todo el ancho, sincronizado */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-3">
        <div className="text-[11px] font-semibold text-stone-500 mb-1">Sismómetro en la superficie</div>
        <svg viewBox={`0 0 ${W} 86`} className="w-full" style={{ display: 'block' }}>
          <text x={6} y={20} fontSize={9} fill="#78716c">Vertical</text>
          <line x1={mX} y1={26} x2={mX + gridW} y2={26} stroke="#f0efed" strokeWidth={1} />
          <path d={seisPath(seis.current.v, 26)} fill="none" stroke={color} strokeWidth={1.5} />
          <text x={6} y={64} fontSize={9} fill="#78716c">Horizontal</text>
          <line x1={mX} y1={70} x2={mX + gridW} y2={70} stroke="#f0efed" strokeWidth={1} />
          <path d={seisPath(seis.current.h, 70)} fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-stone-200/60 p-3">
        <button onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#C4553A] text-white">
          {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pausar' : 'Animar'}
        </button>
        {follow && (
          <button onClick={() => setFollow(null)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600">
            Dejar de seguir la partícula
          </button>
        )}
        <span className="text-[11px] text-stone-400">Toca una partícula para ver su trayectoria</span>
      </div>

      {/* Modo carrera: P y S salen juntas; la S llega después */}
      <WaveRace />

      {/* Reto visual */}
      <WaveChallenge onDone={onChallengeDone} />

      {/* Fuente al pie */}
      <p className="text-[10px] text-stone-400 leading-snug">Fuente: {info.source.cita}</p>
    </div>
  );
}

/* ─── Perfil de amplitud contra profundidad (ondas superficiales) ─── */
function AmplitudeProfile({ color, plan }: { color: string; plan: boolean }) {
  const w = 76, h = 150, pad = 14;
  const rows = 7;
  // Amplitud relativa por profundidad: 1 en superficie, decae exponencial.
  const pts: string[] = [];
  for (let r = 0; r < rows; r++) {
    const depthN = r / (rows - 1);
    const a = Math.exp(-1.6 * depthN);
    const x = pad + a * (w - 2 * pad);
    const y = pad + depthN * (h - 2 * pad);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ display: 'block' }}>
      <text x={2} y={9} fontSize={7.5} fill="#78716c">amplitud</text>
      {/* eje de profundidad */}
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e7e5e4" strokeWidth={1} />
      <path d={`M ${pts.join(' L ')}`} fill="none" stroke={color} strokeWidth={1.6} />
      {pts.map((p, i) => {
        const [x, y] = p.split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r={2} fill={color} />;
      })}
      <text x={pad - 2} y={h - 2} fontSize={7} fill="#78716c">prof.</text>
      {plan && <text x={2} y={h - 10} fontSize={6.5} fill="#a8a29e">decae</text>}
    </svg>
  );
}

/* ─── Modo carrera: estimar la distancia con el retraso S menos P ─── */
function WaveRace() {
  const VP = 6, VS = 3.5; // km/s (valores didácticos corticales)
  const [distKm, setDistKm] = useState(60);
  const [t, setT] = useState(0);           // tiempo de la animación (s)
  const [running, setRunning] = useState(false);
  const [guess, setGuess] = useState('');
  const [checked, setChecked] = useState(false);

  const tP = distKm / VP;
  const tS = distKm / VS;
  // Distancia estimada a partir del retraso S-P (fórmula del enunciado).
  const estimate = (dtSP: number) => (dtSP * VP * VS) / (VP - VS);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT(prev => {
        const next = prev + dt * 4; // 4x para que no sea lento
        if (next >= tS + 1.5) { setRunning(false); return tS + 1.5; }
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, tS]);

  const start = () => { setT(0); setChecked(false); setGuess(''); setRunning(true); };

  // Geometría de la pista.
  const W = 560, H = 90, x0 = 40, x1 = W - 40;
  const span = x1 - x0;
  const pPos = x0 + Math.min(1, (t * VP) / distKm) * span;
  const sPos = x0 + Math.min(1, (t * VS) / distKm) * span;
  const pArrived = t >= tP;
  const sArrived = t >= tS;

  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-xs font-bold text-[#1A1A2E]">Modo carrera: la P siempre gana</span>
        <label className="flex items-center gap-2 text-[11px] text-stone-500">
          Distancia
          <input type="range" min={20} max={160} step={5} value={distKm} onChange={e => { setDistKm(Number(e.target.value)); setT(0); setRunning(false); setChecked(false); }} />
          <span className="font-mono text-stone-600">{distKm} km</span>
        </label>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        {/* pista */}
        <line x1={x0} y1={30} x2={x1} y2={30} stroke="#e7e5e4" strokeWidth={2} />
        <line x1={x0} y1={58} x2={x1} y2={58} stroke="#e7e5e4" strokeWidth={2} />
        {/* sismo (izquierda) y estación (derecha) */}
        <circle cx={x0} cy={44} r={5} fill="#1A1A2E" />
        <text x={x0 - 6} y={78} fontSize={8} fill="#78716c">sismo</text>
        <path d={`M ${x1 - 6} 44 L ${x1 + 6} 44 L ${x1} 35 Z`} fill="#1A1A2E" />
        <text x={x1 - 18} y={78} fontSize={8} fill="#78716c">estación</text>
        {/* frentes P y S */}
        <circle cx={pPos} cy={30} r={5} fill={WAVE_COLORS.P} opacity={pArrived ? 0.4 : 1} />
        <text x={x0} y={22} fontSize={9} fill={WAVE_COLORS.P}>P</text>
        <circle cx={sPos} cy={58} r={5} fill={WAVE_COLORS.S} opacity={sArrived ? 0.4 : 1} />
        <text x={x0} y={70} fontSize={9} fill={WAVE_COLORS.S}>S</text>
      </svg>

      <div className="flex flex-wrap items-center gap-3 mt-1">
        <button onClick={start} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#C4553A] text-white">
          Lanzar las ondas
        </button>
        <span className="text-[11px] text-stone-500 font-mono">
          tP {tP.toFixed(1)} s · tS {tS.toFixed(1)} s · retraso {(tS - tP).toFixed(1)} s
        </span>
      </div>

      {/* Estimar distancia con el retraso */}
      {sArrived && (
        <div className="mt-3 bg-stone-50 border border-stone-200/60 rounded-lg p-3">
          <p className="text-xs text-stone-600 mb-2">
            Con el retraso de {(tS - tP).toFixed(1)} s, estima a qué distancia ocurrió el sismo.
            Fórmula: d = (tS − tP) · Vp · Vs / (Vp − Vs), con Vp {VP} y Vs {VS} km/s.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" value={guess} onChange={e => setGuess(e.target.value)} placeholder="km"
              className="w-24 px-2 py-1.5 rounded-lg border border-stone-200 text-sm" />
            <button onClick={() => setChecked(true)} disabled={guess === ''} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#2D6A4F] text-white disabled:opacity-40">
              Comprobar
            </button>
            {checked && (
              <span className="text-xs font-semibold" style={{ color: Math.abs(Number(guess) - estimate(tS - tP)) <= 10 ? '#2D6A4F' : '#C4553A' }}>
                Estimación: {estimate(tS - tP).toFixed(0)} km · real: {distKm} km
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Reto visual: 5 rondas de "¿qué onda es?" ─── */
type ChallengeMode = 'trayectoria' | 'sismograma';
const ROUNDS: { answer: 'P' | 'S' | 'Love' | 'Rayleigh'; show: LabWave; mode: ChallengeMode; explain: string }[] = [
  { answer: 'P', show: 'P', mode: 'trayectoria', explain: 'La partícula va y viene a lo largo del eje de propagación: es una onda P, longitudinal.' },
  { answer: 'S', show: 'SV', mode: 'sismograma', explain: 'El movimiento es perpendicular al avance, casi sin componente en la dirección de propagación: es una onda S.' },
  { answer: 'Rayleigh', show: 'Rayleigh', mode: 'trayectoria', explain: 'La partícula describe una elipse en el plano vertical: es una onda Rayleigh, elíptica retrógrada.' },
  { answer: 'Love', show: 'Love', mode: 'trayectoria', explain: 'Movimiento horizontal de lado a lado, perpendicular a la propagación: es una onda Love.' },
  { answer: 'S', show: 'SV', mode: 'trayectoria', explain: 'La partícula se mueve perpendicular a la propagación, sin avanzar: es una onda S.' },
];
const ANSWERS: ('P' | 'S' | 'Love' | 'Rayleigh')[] = ['P', 'S', 'Love', 'Rayleigh'];

function TrajectoryGlyph({ show, phase }: { show: LabWave; phase: number }) {
  const W = 200, H = 110, cx = W / 2, cy = H / 2, amp = 24;
  const trail: string[] = [];
  for (let s = 0; s <= 56; s++) {
    const th = (s / 56) * Math.PI * 2;
    const d = displacement(show, th, amp, 1);
    trail.push(`${(cx + d.dx).toFixed(1)},${(cy + d.dy).toFixed(1)}`);
  }
  const d = displacement(show, phase, amp, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 240, display: 'block', margin: '0 auto' }}>
      <line x1={10} y1={cy} x2={W - 24} y2={cy} stroke="#e7e5e4" strokeWidth={1} />
      <path d={`M ${W - 30} ${cy - 4} L ${W - 24} ${cy} L ${W - 30} ${cy + 4}`} fill="none" stroke="#d6d3d1" strokeWidth={1} />
      <path d={`M ${trail.join(' L ')}`} fill="none" stroke="#9ca3af" strokeWidth={1.4} strokeDasharray="3 2" />
      <circle cx={(cx + d.dx).toFixed(1)} cy={(cy + d.dy).toFixed(1)} r={5} fill="#1A1A2E" />
    </svg>
  );
}

function SeismoGlyph({ show, phase }: { show: LabWave; phase: number }) {
  const W = 240, H = 110, amp = 15;
  const trace = (axis: 'v' | 'h', cy: number): string => {
    const pts: string[] = [];
    for (let i = 0; i <= 76; i++) {
      const th = phase - (76 - i) * 0.12;
      const d = displacement(show, th, amp, 1);
      const val = axis === 'v' ? d.dy : d.dx;
      pts.push(`${(10 + (i / 76) * (W - 20)).toFixed(1)},${(cy - val).toFixed(1)}`);
    }
    return `M ${pts.join(' L ')}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 280, display: 'block', margin: '0 auto' }}>
      <text x={6} y={13} fontSize={9} fill="#78716c">Vertical</text>
      <line x1={10} y1={32} x2={W - 10} y2={32} stroke="#f0efed" strokeWidth={1} />
      <path d={trace('v', 32)} fill="none" stroke="#1A1A2E" strokeWidth={1.4} />
      <text x={6} y={70} fontSize={9} fill="#78716c">Horizontal</text>
      <line x1={10} y1={88} x2={W - 10} y2={88} stroke="#f0efed" strokeWidth={1} />
      <path d={trace('h', 88)} fill="none" stroke="#1A1A2E" strokeWidth={1.4} />
    </svg>
  );
}

function WaveChallenge({ onDone }: { onDone?: () => void }) {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const phaseRef = useRef(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => { phaseRef.current = (phaseRef.current + 0.06) % (Math.PI * 2); setTick(t => (t + 1) % 1e6); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const r = ROUNDS[round];
  const answered = picked !== null;
  const phase = phaseRef.current;

  const pick = (a: string) => { if (answered) return; setPicked(a); if (a === r.answer) setScore(s => s + 1); };
  const next = () => {
    if (round < ROUNDS.length - 1) { setRound(round + 1); setPicked(null); }
    else { setFinished(true); onDone?.(); }
  };
  const reset = () => { setRound(0); setPicked(null); setScore(0); setFinished(false); };

  if (finished) {
    return (
      <div className="bg-white rounded-xl border border-stone-200/60 p-5 text-center">
        <div className="text-sm font-bold text-[#1A1A2E] mb-1">Reto completado</div>
        <div className="text-2xl font-black mb-2" style={{ color: score >= 3 ? '#2D6A4F' : '#C4553A' }}>{score}/{ROUNDS.length}</div>
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
        <span className="text-[11px] text-stone-400">{round + 1}/{ROUNDS.length} · {score} pts</span>
      </div>
      <p className="text-xs text-stone-500 mb-2">
        {r.mode === 'trayectoria' ? 'Observa la trayectoria de la partícula y elige la onda.' : 'Observa el sismograma y elige la onda.'}
      </p>
      <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-2 mb-3">
        {r.mode === 'trayectoria' ? <TrajectoryGlyph show={r.show} phase={phase} /> : <SeismoGlyph show={r.show} phase={phase} />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {ANSWERS.map(a => {
          let cls = 'bg-stone-50 border-stone-200 text-stone-600';
          if (answered) {
            if (a === r.answer) cls = 'bg-green-500/10 border-green-500/40 text-green-700';
            else if (a === picked) cls = 'bg-red-500/10 border-red-500/40 text-red-700';
          }
          return (
            <button key={a} onClick={() => pick(a)}
              className={`px-2 py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 ${cls}`}>
              {answered && a === r.answer && <CheckCircle size={12} className="text-green-600" />}
              {answered && a === picked && a !== r.answer && <XCircle size={12} className="text-red-500" />}
              {a}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-2 mb-2 flex items-center gap-3">
            <div className="flex-shrink-0" style={{ width: 110 }}>
              {r.mode === 'trayectoria' ? <TrajectoryGlyph show={r.show} phase={phase} /> : <SeismoGlyph show={r.show} phase={phase} />}
            </div>
            <div className="min-w-0">
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1"
                style={{ backgroundColor: `${WAVE_COLORS[r.answer]}20`, color: WAVE_COLORS[r.answer] }}>
                Onda {r.answer}
              </span>
              <p className="text-xs text-stone-600 leading-snug">{r.explain}</p>
            </div>
          </div>
          <button onClick={next} className="w-full text-xs font-bold py-2 rounded-lg bg-[#C4553A] text-white">
            {round < ROUNDS.length - 1 ? 'Siguiente' : 'Ver resultado'}
          </button>
        </>
      )}
    </div>
  );
}
