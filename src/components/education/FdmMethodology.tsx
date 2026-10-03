/**
 * Capítulo 5: Metodología del método de diferencias finitas.
 *
 * Explica, paso a paso, cómo el simulador resuelve la ecuación de onda
 * elástica. Tres pasos tienen una mini interacción:
 *   Malla (dx): cuántos nodos caben por longitud de onda y aviso de dispersión
 *     cuando son menos de diez.
 *   CFL: una onda 1D que se vuelve inestable si dt supera dx/(Vp·√2).
 *   Fuente: la ondícula de Ricker cambiando con la frecuencia.
 *
 * Los valores del Simulador se leen de los presets reales (simulation.ts); si
 * cambian allí, esta ficha se actualiza sola. Al final, un reto corto marca el
 * capítulo como completado.
 *
 * @module education/FdmMethodology
 */
import { useEffect, useState } from 'react';
import { tectonicParams, volcanicParams } from '../../lib/simulation';
import { CheckCircle, XCircle, RotateCcw } from '../../lib/icons';

// Valores REALES del Simulador (presets), no escritos a mano.
const TEC = tectonicParams();
const VOL = volcanicParams();
const F0_TEC = 3.5; // Hz, fuente tectónica
const F0_VOL = 2.0; // Hz, fuente volcánica

/** CFL 2D: dt máximo estable = dx / (Vp·√2). */
const cflMax = (dx: number, vp: number) => dx / (vp * Math.SQRT2);

type StepId = 'ecuacion' | 'malla' | 'tiempo' | 'cfl' | 'fuente' | 'salida';

const STEPS: { id: StepId; title: string }[] = [
  { id: 'ecuacion', title: '1. Ecuación de onda elástica' },
  { id: 'malla', title: '2. La malla y el tamaño de celda' },
  { id: 'tiempo', title: '3. Avance en el tiempo' },
  { id: 'cfl', title: '4. Estabilidad: condición CFL' },
  { id: 'fuente', title: '5. La fuente del sismo' },
  { id: 'salida', title: '6. Registro y detección de arribos' },
];

interface Props {
  onChallengeDone?: () => void;
}

export function FdmMethodology({ onChallengeDone }: Props) {
  const [open, setOpen] = useState<StepId>('ecuacion');

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-4">
      {/* Índice de pasos */}
      <div className="space-y-2">
        {STEPS.map(s => (
          <button key={s.id} onClick={() => setOpen(s.id)}
            className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
              open === s.id ? 'bg-white border-stone-300 text-[#1A1A2E]' : 'bg-white/60 border-stone-200/60 text-stone-500'
            }`}>
            {s.title}
          </button>
        ))}
        {/* Valores reales del Simulador */}
        <div className="bg-white rounded-xl border border-stone-200/60 p-3 text-[11px] leading-relaxed mt-2 text-stone-600">
          <div className="font-bold text-stone-700 mb-1">Valores del Simulador</div>
          <div className="mb-1">
            <span className="font-semibold">Tectónico:</span> Vp {TEC.vp} m/s, Vs {TEC.vs} m/s, ρ {TEC.density} kg/m³, dx {TEC.dx} m, dt {TEC.dt} s, duración {TEC.duration} s, fuente {F0_TEC} Hz.
          </div>
          <div>
            <span className="font-semibold">Volcánico:</span> Vp {VOL.vp} m/s, Vs {VOL.vs} m/s, ρ {VOL.density} kg/m³, dx {VOL.dx} m, dt {VOL.dt} s, duración {VOL.duration} s, fuente {F0_VOL} Hz.
          </div>
        </div>
      </div>

      {/* Contenido del paso + su mini interacción */}
      <div className="bg-white rounded-2xl border border-stone-200/60 p-5 text-sm text-stone-600 leading-relaxed animate-fade-in min-w-0" key={open}>
        {open === 'ecuacion' && <StepEquation />}
        {open === 'malla' && <StepMesh />}
        {open === 'tiempo' && <StepTime />}
        {open === 'cfl' && <StepCfl />}
        {open === 'fuente' && <StepSource />}
        {open === 'salida' && <StepOutput />}

        {/* Reto al final, visible en el último paso */}
        {open === 'salida' && <MethodChallenge onDone={onChallengeDone} />}
      </div>
    </div>
  );
}

/* ─── Paso 1: ecuación ─── */
function StepEquation() {
  return (
    <div>
      <h3 className="text-lg font-black text-[#1A1A2E] mb-3">Ecuación de onda elástica</h3>
      <p>El subsuelo se modela como un medio elástico. El desplazamiento del suelo obedece la ecuación de onda elástica:</p>
      <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
        ρ ∂²u/∂t² = (λ + 2μ) ∇(∇·u) − μ ∇×(∇×u) + f
      </div>
      <p>
        Los parámetros de Lamé salen de las variables físicas que configuras: μ = ρ·Vs² y λ = ρ·Vp² − 2μ.
        El término f es la fuente del sismo. El simulador resuelve esta ecuación en una malla de puntos.
      </p>
    </div>
  );
}

/* ─── Paso 2: malla con control de dx (nodos por longitud de onda) ─── */
function StepMesh() {
  const [dx, setDx] = useState(TEC.dx);
  // Longitud de onda mínima = Vs / f0 (la S es la más lenta, su λ es la más corta).
  const lambdaMin = TEC.vs / F0_TEC; // m
  const nodes = lambdaMin / dx;
  const poor = nodes < 10;

  return (
    <div>
      <h3 className="text-lg font-black text-[#1A1A2E] mb-3">La malla y el tamaño de celda</h3>
      <p>
        El dominio se divide en una malla de puntos separados una distancia dx. Si las celdas son demasiado grandes,
        la onda no se representa bien y aparece dispersión numérica. La regla práctica es tener al menos diez puntos por longitud de onda.
      </p>
      <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-3 my-3">
        <label className="flex items-center gap-3 text-xs text-stone-500 mb-3">
          Tamaño de celda dx
          <input type="range" min={10} max={120} step={2} value={dx} onChange={e => setDx(Number(e.target.value))} className="flex-1" />
          <span className="font-mono text-stone-700 w-14 text-right">{dx} m</span>
        </label>
        {/* Visual: una longitud de onda cubierta por nodos */}
        <MeshGlyph nodes={nodes} />
        <div className={`text-sm font-semibold mt-2 ${poor ? 'text-[#C4553A]' : 'text-[#2D6A4F]'}`}>
          {nodes.toFixed(1)} nodos por longitud de onda {poor ? '· muy pocos, habría dispersión numérica' : '· suficiente'}
        </div>
      </div>
      <p className="text-[11px] text-stone-400">Longitud de onda mínima = Vs / frecuencia = {TEC.vs} / {F0_TEC} ≈ {lambdaMin.toFixed(0)} m (preset tectónico).</p>
    </div>
  );
}

function MeshGlyph({ nodes }: { nodes: number }) {
  const W = 300, H = 54, pad = 10;
  const span = W - 2 * pad;
  const count = Math.max(2, Math.min(40, Math.round(nodes)));
  const good = nodes >= 10;
  // Una longitud de onda (seno) y los nodos de la malla encima.
  const path: string[] = [];
  for (let i = 0; i <= 80; i++) { const x = pad + (i / 80) * span; const y = H / 2 - Math.sin((i / 80) * Math.PI * 2) * 14; path.push(`${x.toFixed(1)},${y.toFixed(1)}`); }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
      <path d={`M ${path.join(' L ')}`} fill="none" stroke="#d6d3d1" strokeWidth={1.5} />
      {Array.from({ length: count }).map((_, i) => {
        const x = pad + (i / (count - 1)) * span;
        return <circle key={i} cx={x} cy={H / 2} r={2.4} fill={good ? '#2D6A4F' : '#C4553A'} />;
      })}
    </svg>
  );
}

/* ─── Paso 3: avance temporal ─── */
function StepTime() {
  return (
    <div>
      <h3 className="text-lg font-black text-[#1A1A2E] mb-3">Avance en el tiempo</h3>
      <p>El cálculo avanza en pasos de tamaño dt con un esquema explícito de salto de rana:</p>
      <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
        u<sup>n+1</sup> = 2u<sup>n</sup> − u<sup>n−1</sup> + dt² (L u<sup>n</sup> + f<sup>n</sup>) / ρ
      </div>
      <p>Solo se guardan dos instantes anteriores, así que usa poca memoria. El cálculo corre en el servidor y el resultado se envía al navegador.</p>
    </div>
  );
}

/* ─── Paso 4: CFL con onda 1D inestable ─── */
function StepCfl() {
  const vp = TEC.vp / 1000; // km/s para la demo
  const dx = 0.1;           // km
  const maxDt = dx / (vp * Math.SQRT2);
  const [dt, setDt] = useState(maxDt * 0.8);
  const unstable = dt > maxDt;

  // Animación de una onda 1D que crece sin control si es inestable.
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => { setT(v => (v + 0.03) % 10); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const W = 320, H = 90, pad = 10, span = W - 2 * pad;
  // Factor de crecimiento: estable mantiene amplitud; inestable crece con n.
  const courant = dt / maxDt;
  const growth = unstable ? Math.pow(1 + (courant - 1) * 1.5, (t * 12) % 14) : 1;
  const amp = Math.min(38, 16 * growth);
  const pts: string[] = [];
  for (let i = 0; i <= 90; i++) {
    const x = pad + (i / 90) * span;
    const sign = unstable ? ((i % 2 === 0) ? 1 : -1) : 1; // inestable: oscilación nodo a nodo
    const y = H / 2 - sign * Math.sin((i / 90) * Math.PI * 4 - t * 4) * amp;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <div>
      <h3 className="text-lg font-black text-[#1A1A2E] mb-3">Estabilidad: condición CFL</h3>
      <p>Un esquema explícito solo es estable si la onda no recorre más de una celda por paso de tiempo:</p>
      <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
        dt ≤ dx / (Vp · √2)
      </div>
      <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-3 my-3">
        <label className="flex items-center gap-3 text-xs text-stone-500 mb-2">
          Paso de tiempo dt
          <input type="range" min={maxDt * 0.3} max={maxDt * 1.6} step={maxDt * 0.02} value={dt} onChange={e => setDt(Number(e.target.value))} className="flex-1" />
          <span className="font-mono text-stone-700 w-20 text-right">{dt.toFixed(4)} s</span>
        </label>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
          <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#f0efed" strokeWidth={1} />
          <path d={`M ${pts.join(' L ')}`} fill="none" stroke={unstable ? '#C4553A' : '#2D6A4F'} strokeWidth={1.6} />
        </svg>
        <div className={`text-sm font-semibold ${unstable ? 'text-[#C4553A]' : 'text-[#2D6A4F]'}`}>
          {unstable ? 'Inestable: la solución crece sin control y explota.' : `Estable (dt máximo ≈ ${maxDt.toFixed(4)} s).`}
        </div>
      </div>
      <p>Si el dt que eliges viola la condición de Courant, Friedrichs y Lewy, el simulador lo reduce automáticamente y te avisa.</p>
    </div>
  );
}

/* ─── Paso 5: fuente de Ricker por frecuencia ─── */
function StepSource() {
  const [f0, setF0] = useState(F0_TEC);
  const W = 320, H = 110, pad = 12, span = W - 2 * pad;
  // Ondícula de Ricker: (1 - 2π²f²t²) exp(-π²f²t²), centrada.
  const ricker = (tt: number) => { const a = Math.PI * Math.PI * f0 * f0 * tt * tt; return (1 - 2 * a) * Math.exp(-a); };
  const dur = 1.2; // s mostrados
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const tt = -dur / 2 + (i / 120) * dur;
    const x = pad + (i / 120) * span;
    const y = H / 2 - ricker(tt) * 36;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <div>
      <h3 className="text-lg font-black text-[#1A1A2E] mb-3">La fuente del sismo</h3>
      <p>
        La fuente es una ondícula de Ricker aplicada en el foco. Su frecuencia controla qué tan "fina" es la señal:
        más frecuencia, pulsos más cortos y longitudes de onda más pequeñas. Para sismos tectónicos el simulador usa un mecanismo de doble par;
        para volcánicos, uno isótropo (explosivo).
      </p>
      <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-3 my-3">
        <label className="flex items-center gap-3 text-xs text-stone-500 mb-2">
          Frecuencia de la fuente
          <input type="range" min={1} max={6} step={0.5} value={f0} onChange={e => setF0(Number(e.target.value))} className="flex-1" />
          <span className="font-mono text-stone-700 w-14 text-right">{f0.toFixed(1)} Hz</span>
        </label>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
          <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#f0efed" strokeWidth={1} />
          <path d={`M ${pts.join(' L ')}`} fill="none" stroke="#C4553A" strokeWidth={1.8} />
        </svg>
      </div>
      <p className="text-[11px] text-stone-400">El preset tectónico usa {F0_TEC} Hz y el volcánico {F0_VOL} Hz.</p>
    </div>
  );
}

/* ─── Paso 6: salida ─── */
function StepOutput() {
  return (
    <div>
      <h3 className="text-lg font-black text-[#1A1A2E] mb-3">Registro y detección de arribos</h3>
      <p>
        Un receptor virtual en superficie registra el movimiento del suelo en sus tres componentes. Los tiempos de llegada
        de las ondas P y S se detectan con un algoritmo que compara la energía reciente con la de fondo, y se contrastan con el valor teórico tiempo = distancia / velocidad.
      </p>
      <div className="font-mono text-sm bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 text-center">
        CFL máx. tectónico ≈ {cflMax(TEC.dx, TEC.vp).toFixed(4)} s · dt usado {TEC.dt} s
      </div>
    </div>
  );
}

/* ─── Reto: tres preguntas sobre el método ─── */
const Q: { q: string; options: string[]; correct: number; explain: string }[] = [
  { q: '¿Para qué sirve la condición CFL?', options: ['Para acelerar el cálculo', 'Para que la solución sea estable', 'Para subir la magnitud'], correct: 1, explain: 'La condición CFL limita el paso de tiempo para que el esquema explícito no diverja.' },
  { q: 'Si las celdas (dx) son muy grandes, ¿qué ocurre?', options: ['Aparece dispersión numérica', 'La onda viaja más rápido', 'No cambia nada'], correct: 0, explain: 'Con pocos nodos por longitud de onda la malla no representa bien la onda y aparece dispersión.' },
  { q: '¿Qué controla la frecuencia de la ondícula de Ricker?', options: ['La magnitud del sismo', 'El tamaño del dominio', 'Qué tan cortos son los pulsos y las longitudes de onda'], correct: 2, explain: 'A mayor frecuencia, pulsos más cortos y longitudes de onda más pequeñas.' },
];

function MethodChallenge({ onDone }: { onDone?: () => void }) {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const r = Q[round];
  const answered = picked !== null;
  const pick = (i: number) => { if (answered) return; setPicked(i); if (i === r.correct) setScore(s => s + 1); };
  const next = () => { if (round < Q.length - 1) { setRound(round + 1); setPicked(null); } else { setFinished(true); onDone?.(); } };
  const reset = () => { setRound(0); setPicked(null); setScore(0); setFinished(false); };

  if (finished) {
    return (
      <div className="mt-5 border-t border-stone-100 pt-4 text-center">
        <div className="text-sm font-bold text-[#1A1A2E] mb-1">Reto completado</div>
        <div className="text-2xl font-black mb-2" style={{ color: score >= 2 ? '#2D6A4F' : '#C4553A' }}>{score}/{Q.length}</div>
        <button onClick={reset} className="flex items-center gap-1.5 mx-auto text-xs font-bold px-3 py-1.5 rounded-lg bg-[#2D6A4F] text-white">
          <RotateCcw size={13} /> Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-stone-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[#1A1A2E]">Reto: comprueba lo que entendiste</span>
        <span className="text-[11px] text-stone-400">{round + 1}/{Q.length} · {score} pts</span>
      </div>
      <p className="text-sm font-semibold text-[#1A1A2E] mb-3">{r.q}</p>
      <div className="space-y-2 mb-3">
        {r.options.map((o, i) => {
          let cls = 'border-stone-200 bg-stone-50 text-stone-700';
          if (answered) {
            if (i === r.correct) cls = 'border-green-500/40 bg-green-500/10 text-green-700';
            else if (i === picked) cls = 'border-red-500/40 bg-red-500/10 text-red-700';
          }
          return (
            <button key={i} onClick={() => pick(i)} className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${cls}`}>
              {answered && i === r.correct && <CheckCircle size={13} className="text-green-600 flex-shrink-0" />}
              {answered && i === picked && i !== r.correct && <XCircle size={13} className="text-red-500 flex-shrink-0" />}
              {o}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <p className="text-xs text-stone-600 bg-stone-50 rounded-lg p-2.5 mb-3">{r.explain}</p>
          <button onClick={next} className="w-full text-xs font-bold py-2 rounded-lg bg-[#C4553A] text-white">
            {round < Q.length - 1 ? 'Siguiente' : 'Ver resultado'}
          </button>
        </>
      )}
    </div>
  );
}
