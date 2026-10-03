/**
 * Capítulo 2: Magnitud.
 *
 * Interacción principal: comparar dos sismos. Cada uno se elige de la historia
 * de Nariño (línea de tiempo) o con una magnitud libre. El laboratorio muestra
 * cuántas veces es mayor la amplitud del movimiento (diez veces por unidad de
 * magnitud) y la energía liberada (unas 32 veces por unidad), esta última con
 * una cuadrícula de bloques donde un bloque es la energía del sismo menor.
 *
 * Energía sísmica: log10 E = 1.5 Mw + 4.8, con E en joules (Hanks y Kanamori,
 * 1979; Shearer, 2019). Reto final: estimar cuántas veces más energía libera un
 * sismo que otro.
 *
 * @module education/MagnitudeLab
 */
import { useEffect, useMemo, useState } from 'react';
import { loadTimelineEvents, type TimelineEvent } from '../../lib/educationData';
import { SRC } from '../../lib/educationContent';
import { VolcanoLoader } from '../ui/VolcanoLoader';
import { CheckCircle, XCircle, RotateCcw } from '../../lib/icons';

/** Energía en joules a partir de la magnitud (log10 E = 1.5 Mw + 4.8). */
function energyJoules(mw: number): number {
  return Math.pow(10, 1.5 * mw + 4.8);
}

/** Formatea una energía grande en joules de forma legible. */
function fmtEnergy(e: number): string {
  if (e >= 1e18) return `${(e / 1e18).toFixed(1)} EJ`;
  if (e >= 1e15) return `${(e / 1e15).toFixed(1)} PJ`;
  if (e >= 1e12) return `${(e / 1e12).toFixed(1)} TJ`;
  if (e >= 1e9) return `${(e / 1e9).toFixed(1)} GJ`;
  return `${(e / 1e6).toFixed(1)} MJ`;
}

/** Extrae un número de magnitud de un texto como "Mw 6.1" (o null). */
function parseMw(magnitude: string | null): number | null {
  if (!magnitude) return null;
  const m = magnitude.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

interface EventOption {
  id: string;
  label: string;
  mw: number;
}

interface Props {
  onChallengeDone?: () => void;
}

export function MagnitudeLab({ onChallengeDone }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTimelineEvents().then(e => { setEvents(e); setLoading(false); }); }, []);

  // Opciones de sismos con magnitud numérica (de la historia de Nariño).
  const options = useMemo<EventOption[]>(() => {
    const list: EventOption[] = [];
    for (const e of events) {
      const mw = parseMw(e.magnitude);
      if (mw != null) list.push({ id: e.id, label: `${e.year} · ${e.title}`, mw });
    }
    return list.sort((a, b) => b.mw - a.mw);
  }, [events]);

  // Dos sismos por defecto: el mayor y uno menor conocido (1947).
  const [magA, setMagA] = useState(8.1);
  const [magB, setMagB] = useState(6.1);

  // Al cargar, fija por defecto 1979 (Mw 8.1) y 1947 (Mw 6.1) si existen.
  useEffect(() => {
    if (options.length === 0) return;
    const big = options.find(o => o.mw >= 8) ?? options[0];
    const small = options.find(o => Math.abs(o.mw - 6.1) < 0.3) ?? options[options.length - 1];
    setMagA(big.mw);
    setMagB(small.mw);
  }, [options]);

  if (loading) return <div className="py-10"><VolcanoLoader size={40} label="Cargando sismos de la historia…" /></div>;

  const hi = Math.max(magA, magB);
  const lo = Math.min(magA, magB);
  const dMag = hi - lo;
  const ampTimes = Math.pow(10, dMag);               // amplitud: 10 por unidad
  const energyRatio = energyJoules(hi) / energyJoules(lo); // energía exacta

  // Número redondeado y legible, con separador de miles (sin notación científica).
  const nice = (x: number) => {
    const r = x >= 100 ? Math.round(x / 10) * 10 : Math.round(x);
    return r.toLocaleString('es-CO');
  };

  return (
    <div className="space-y-4">
      {/* Comparador de dos sismos */}
      <div className="grid sm:grid-cols-2 gap-3">
        <MagPicker label="Sismo A" value={magA} onChange={setMagA} options={options} color="#C4553A" />
        <MagPicker label="Sismo B" value={magB} onChange={setMagB} options={options} color="#2D6A4F" />
      </div>

      {/* Comparación numérica */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-4">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-[11px] text-stone-500">Amplitud del movimiento</div>
            <div className="text-2xl font-black text-[#1A1A2E]">unas {nice(ampTimes)} veces</div>
            <div className="text-[11px] text-stone-400">mayor en el más grande</div>
          </div>
          <div>
            <div className="text-[11px] text-stone-500">Energía liberada</div>
            <div className="text-2xl font-black text-[#C4553A]">unas {nice(energyRatio)} veces</div>
            <div className="text-[11px] text-stone-400">{fmtEnergy(energyJoules(hi))} frente a {fmtEnergy(energyJoules(lo))}</div>
          </div>
        </div>
      </div>

      {/* Cuadrícula de bloques de energía */}
      <EnergyBlocks ratio={energyRatio} hi={hi} lo={lo} />

      {/* Texto corto */}
      <p className="text-sm text-stone-600 leading-relaxed">
        Cada punto de magnitud multiplica por diez la amplitud del movimiento registrado y por unas 32 veces la energía liberada.
        Por eso un sismo de magnitud 8 libera miles de veces más energía que uno de magnitud 6, aunque en la escala solo haya dos números de diferencia.
      </p>

      {/* Magnitud frente a intensidad, con el ejemplo de 1947 */}
      <div className="bg-white rounded-xl border border-stone-200/60 p-4">
        <p className="text-sm text-stone-600 leading-relaxed">
          La magnitud mide la energía del sismo en su origen y es un solo número. La intensidad mide qué tan fuerte se sintió en un lugar y cambia de un sitio a otro.
          El sismo de Pasto de 1947 tuvo magnitud Mw 6.1 y alcanzó intensidad VIII en Pasto.
        </p>
      </div>

      {/* Reto */}
      <EnergyChallenge onDone={onChallengeDone} />

      {/* Fuente al pie */}
      <p className="text-[10px] text-stone-400 leading-snug">
        Fuente: {SRC.hanksKanamori1979.cita} {SRC.shearer2019.cita} Intensidad de 1947: {SRC.sarabia2018.cita}
      </p>
    </div>
  );
}

/* ─── Selector de magnitud: evento de la historia o magnitud libre ─── */
function MagPicker({ label, value, onChange, options, color }: {
  label: string; value: number; onChange: (v: number) => void; options: EventOption[]; color: string;
}) {
  const matchId = options.find(o => Math.abs(o.mw - value) < 0.001)?.id ?? 'libre';
  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-4">
      <div className="text-xs font-bold mb-2" style={{ color }}>{label}</div>
      <select
        value={matchId}
        onChange={e => { const o = options.find(x => x.id === e.target.value); if (o) onChange(o.mw); }}
        className="w-full px-2 py-1.5 rounded-lg border border-stone-200 text-xs mb-3 bg-white"
      >
        {options.map(o => <option key={o.id} value={o.id}>{o.label} (Mw {o.mw.toFixed(1)})</option>)}
        <option value="libre">Magnitud libre…</option>
      </select>
      <div className="flex items-center gap-3">
        <input type="range" min={3} max={9} step={0.1} value={value} onChange={e => onChange(Number(e.target.value))} className="flex-1" style={{ accentColor: color }} />
        <span className="text-lg font-black w-14 text-right" style={{ color }}>{value.toFixed(1)}</span>
      </div>
    </div>
  );
}

/* ─── Cuadrícula de bloques: TODOS los bloques valen lo mismo ─── */
function EnergyBlocks({ ratio, hi, lo }: { ratio: number; hi: number; lo: number }) {
  const MAX_BLOCKS = 150;
  const rounded = Math.max(1, Math.round(ratio));
  // Si no caben todos, cada bloque vale "perBlock" sismos del menor (mismo valor
  // para todos). El de referencia solo se distingue con un borde.
  const perBlock = rounded > MAX_BLOCKS ? Math.ceil(rounded / MAX_BLOCKS) : 1;
  const blocks = Math.max(1, Math.round(rounded / perBlock));

  const equiv = perBlock === 1
    ? `cada bloque equivale a 1 sismo de Mw ${lo.toFixed(1)}`
    : `cada bloque equivale a ${perBlock.toLocaleString('es-CO')} sismos de Mw ${lo.toFixed(1)}`;

  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-4">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-1">
        <span className="text-xs font-bold text-[#1A1A2E]">Bloques de energía</span>
        <span className="text-[11px] text-stone-400">{equiv}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: blocks }).map((_, i) => (
          <span
            key={i}
            className="rounded-sm"
            style={{
              width: 11, height: 11,
              backgroundColor: '#C4553A',
              // El bloque de referencia (el primero) se distingue solo con borde.
              border: i === 0 ? '2px solid #1A1A2E' : 'none',
            }}
          />
        ))}
      </div>
      <p className="text-[11px] text-stone-500 mt-2 leading-snug">
        Todos los bloques valen lo mismo: {equiv}. El bloque con borde oscuro es la referencia (el sismo menor).
        En total, la energía de Mw {hi.toFixed(1)} equivale a unas {rounded.toLocaleString('es-CO')} veces la de Mw {lo.toFixed(1)}.
      </p>
    </div>
  );
}

/* ─── Reto: adivinar cuántas veces más energía ─── */
const CHALLENGE: { a: number; b: number }[] = [
  { a: 7.0, b: 6.0 },
  { a: 8.1, b: 6.1 },
  { a: 5.0, b: 4.0 },
  { a: 6.5, b: 5.0 },
  { a: 8.0, b: 7.0 },
];

function EnergyChallenge({ onDone }: { onDone?: () => void }) {
  const [round, setRound] = useState(0);
  const [guess, setGuess] = useState('');
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const r = CHALLENGE[round];
  const real = energyJoules(r.a) / energyJoules(r.b);

  const check = () => {
    if (checked || guess === '') return;
    setChecked(true);
    // Acierto si está dentro de un factor 2 del valor real (escala logarítmica).
    const g = Number(guess);
    if (g > 0 && real / g <= 2 && g / real <= 2) setScore(s => s + 1);
  };
  const next = () => {
    if (round < CHALLENGE.length - 1) { setRound(round + 1); setGuess(''); setChecked(false); }
    else { setFinished(true); onDone?.(); }
  };
  const reset = () => { setRound(0); setGuess(''); setChecked(false); setScore(0); setFinished(false); };

  if (finished) {
    return (
      <div className="bg-white rounded-xl border border-stone-200/60 p-5 text-center">
        <div className="text-sm font-bold text-[#1A1A2E] mb-1">Reto completado</div>
        <div className="text-2xl font-black mb-2" style={{ color: score >= 3 ? '#2D6A4F' : '#C4553A' }}>{score}/{CHALLENGE.length}</div>
        <button onClick={reset} className="flex items-center gap-1.5 mx-auto text-xs font-bold px-3 py-1.5 rounded-lg bg-[#2D6A4F] text-white">
          <RotateCcw size={13} /> Intentar de nuevo
        </button>
      </div>
    );
  }

  const close = checked && Number(guess) > 0 && real / Number(guess) <= 2 && Number(guess) / real <= 2;

  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[#1A1A2E]">Reto: ¿cuántas veces más energía?</span>
        <span className="text-[11px] text-stone-400">{round + 1}/{CHALLENGE.length} · {score} pts</span>
      </div>
      <p className="text-sm text-stone-600 mb-3">
        ¿Cuántas veces más energía libera un sismo de Mw {r.a.toFixed(1)} que uno de Mw {r.b.toFixed(1)}?
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input type="number" value={guess} onChange={e => setGuess(e.target.value)} placeholder="veces" disabled={checked}
          className="w-28 px-2 py-1.5 rounded-lg border border-stone-200 text-sm" />
        {!checked
          ? <button onClick={check} disabled={guess === ''} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#2D6A4F] text-white disabled:opacity-40">Comprobar</button>
          : <button onClick={next} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#C4553A] text-white">{round < CHALLENGE.length - 1 ? 'Siguiente' : 'Ver resultado'}</button>}
      </div>
      {checked && (
        <div className={`text-xs rounded-lg p-2.5 flex items-start gap-2 ${close ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'}`}>
          {close ? <CheckCircle size={14} className="flex-shrink-0 mt-0.5" /> : <XCircle size={14} className="flex-shrink-0 mt-0.5" />}
          <span>Son unas <b>{Math.round(real).toLocaleString('es-CO')} veces</b> más energía (cada unidad de magnitud son unas 32 veces).</span>
        </div>
      )}
    </div>
  );
}
