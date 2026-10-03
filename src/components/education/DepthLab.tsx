/**
 * Laboratorio de profundidad con datos reales del USGS (ComCat).
 *
 * Dibuja un corte longitud (eje horizontal) contra profundidad (eje vertical
 * hacia abajo) con los hipocentros reales de la región de Nariño, coloreados
 * por profundidad y con las franjas estándar superficial (hasta 70 km),
 * intermedio (70 a 300) y profundo (300 a 700). Al pasar el cursor por un
 * evento muestra su fecha, magnitud, profundidad y lugar. Incluye un reto de
 * clasificar 5 eventos reales por su franja de profundidad.
 *
 * Fuente de los datos: USGS Earthquake Hazards Program (ComCat), descargados
 * por backend/scripts/fetch_usgs_depth.py (ver public/data/usgs_narino.json).
 *
 * @module education/DepthLab
 */
import { useEffect, useMemo, useState } from 'react';
import { loadUsgsCatalog, type UsgsCatalog, type UsgsEvent } from '../../lib/usgsDepth';
import { DEPTH_CLASSES, SRC } from '../../lib/educationContent';
import { VolcanoLoader } from '../ui/VolcanoLoader';
import { RotateCcw, CheckCircle, XCircle } from '../../lib/icons';

// Paleta de profundidad (azul secuencial, coherente con la leyenda del Mapa 3D).
const DEPTH_PALETTE = ['#93C5FD', '#5B9BE0', '#3570B5', '#1E3A6E'];

/** Color por profundidad (km): más oscuro cuanto más profundo. */
function depthColor(km: number): string {
  if (km < 35) return DEPTH_PALETTE[0];
  if (km < 70) return DEPTH_PALETTE[1];
  if (km < 300) return DEPTH_PALETTE[2];
  return DEPTH_PALETTE[3];
}

/** Franja estándar de un evento según su profundidad. */
function depthBand(km: number): string {
  return (DEPTH_CLASSES.find(c => km >= c.from && km < c.to) ?? DEPTH_CLASSES[DEPTH_CLASSES.length - 1]).label;
}

interface Props {
  onChallengeDone?: () => void;
}

export function DepthLab({ onChallengeDone }: Props) {
  const [cat, setCat] = useState<UsgsCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<UsgsEvent | null>(null);

  useEffect(() => { loadUsgsCatalog().then(c => { setCat(c); setLoading(false); }); }, []);

  if (loading) return <div className="py-10"><VolcanoLoader size={40} label="Cargando catálogo del USGS…" /></div>;
  if (!cat || cat.eventos.length === 0) {
    return <p className="text-sm text-stone-500">No se pudo cargar el catálogo del USGS. Ejecuta <code>backend/scripts/fetch_usgs_depth.py</code>.</p>;
  }

  return (
    <div className="space-y-4">
      <DepthCrossSection cat={cat} hover={hover} setHover={setHover} />

      {/* Fuente con la fecha de consulta real */}
      <p className="text-[10px] text-stone-400 leading-snug">
        Fuente: USGS ComCat, consultado el {cat.consulta.consultado_utc}. {cat.eventos.length} eventos (M ≥ {cat.consulta.filtros.magnitud_minima}, desde {cat.consulta.filtros.desde}).{' '}
        <a href={cat.consulta.url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline break-all">consulta</a>
      </p>

      {/* Nota de subducción, con fuente regional verificable */}
      <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-3">
        <p className="text-xs text-stone-600 leading-relaxed">
          La mayoría de los sismos de la región son superficiales; algunos son intermedios.
          Esto es coherente con la subducción de la placa de Nazca bajo el occidente de Colombia.
        </p>
        <p className="text-[10px] text-stone-400 mt-1">
          Fuente: {SRC.vargasMann2013.cita}
        </p>
      </div>

      <DepthChallenge cat={cat} onDone={onChallengeDone} />
    </div>
  );
}

/* ─── Corte longitud vs profundidad ─── */
function DepthCrossSection({ cat, hover, setHover }: { cat: UsgsCatalog; hover: UsgsEvent | null; setHover: (e: UsgsEvent | null) => void }) {
  const W = 640, H = 320;
  const padL = 44, padR = 16, padT = 16, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const lonMin = cat.consulta.region.lon[0], lonMax = cat.consulta.region.lon[1];
  const maxDepth = 300; // escala del eje (la región llega a ~170 km)

  const x = (lon: number) => padL + ((lon - lonMin) / (lonMax - lonMin)) * plotW;
  const y = (km: number) => padT + (km / maxDepth) * plotH;

  // Franjas (hasta donde alcanza la escala de 300 km).
  const bands = useMemo(() => [
    { from: 0, to: 70, label: 'Superficial', color: '#2D6A4F' },
    { from: 70, to: 300, label: 'Intermedio', color: '#D4A853' },
  ], []);

  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-3 relative">
      <div className="text-[11px] font-semibold text-stone-500 mb-1">Corte longitud contra profundidad (hipocentros reales)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        {/* Franjas de profundidad */}
        {bands.map(b => (
          <g key={b.label}>
            <rect x={padL} y={y(b.from)} width={plotW} height={y(b.to) - y(b.from)} fill={b.color} opacity={0.06} />
            <text x={padL + 4} y={y(b.from) + 12} fontSize={9} fill={b.color}>{b.label} ({b.from}–{b.to} km)</text>
          </g>
        ))}
        {/* Líneas de referencia 70, 300 km */}
        {[70, 300].map(d => d <= maxDepth && (
          <line key={d} x1={padL} y1={y(d)} x2={W - padR} y2={y(d)} stroke="#d6d3d1" strokeWidth={0.5} strokeDasharray="3 3" />
        ))}

        {/* Eje de profundidad (etiquetas) */}
        {[0, 70, 150, 300].map(d => (
          <text key={d} x={6} y={y(d) + 3} fontSize={9} fill="#78716c">{d} km</text>
        ))}
        {/* Eje de longitud */}
        <text x={padL} y={H - 8} fontSize={9} fill="#78716c">{lonMin}°</text>
        <text x={W - padR - 24} y={H - 8} fontSize={9} fill="#78716c">{lonMax}°</text>
        <text x={(padL + W - padR) / 2 - 24} y={H - 8} fontSize={9} fill="#78716c">longitud</text>

        {/* Hipocentros */}
        {cat.eventos.map(e => (
          <circle
            key={e.id}
            cx={x(e.lon).toFixed(1)}
            cy={y(Math.min(e.profundidad_km, maxDepth)).toFixed(1)}
            r={hover?.id === e.id ? 5 : 2.6}
            fill={depthColor(e.profundidad_km)}
            opacity={0.8}
            stroke={hover?.id === e.id ? '#1A1A2E' : 'none'}
            strokeWidth={hover?.id === e.id ? 1 : 0}
            onMouseEnter={() => setHover(e)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </svg>

      {/* Tooltip del evento */}
      {hover && (
        <div className="absolute top-2 right-2 bg-[#1A1A2E] text-white text-[11px] rounded-lg px-3 py-2 max-w-[240px] pointer-events-none">
          <div className="font-bold">{hover.fecha ?? 'fecha ?'}</div>
          <div>Magnitud {hover.magnitud ?? '?'} · Profundidad {hover.profundidad_km} km</div>
          <div className="text-stone-300">{hover.lugar ?? 'lugar no disponible'}</div>
          <div className="text-[#D4A853]">{depthBand(hover.profundidad_km)}</div>
        </div>
      )}
    </div>
  );
}

/* ─── Reto: clasificar 5 eventos por profundidad ─── */
function DepthChallenge({ cat, onDone }: { cat: UsgsCatalog; onDone?: () => void }) {
  // Elige 5 eventos variados (algunos intermedios para que no sean todos iguales).
  const rounds = useMemo(() => {
    const inter = cat.eventos.filter(e => e.profundidad_km >= 70);
    const sup = cat.eventos.filter(e => e.profundidad_km < 70);
    const pick = <T,>(arr: T[], n: number) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
    const sel = [...pick(inter, 2), ...pick(sup, 3)];
    return sel.sort(() => Math.random() - 0.5);
  }, [cat]);

  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (rounds.length === 0) return null;
  const e = rounds[round];
  const correct = depthBand(e.profundidad_km);
  const answered = picked !== null;
  const options = ['Superficial', 'Intermedio', 'Profundo'];

  const pick = (b: string) => {
    if (answered) return;
    setPicked(b);
    if (b === correct) setScore(s => s + 1);
  };
  const next = () => {
    if (round < rounds.length - 1) { setRound(round + 1); setPicked(null); }
    else { setFinished(true); onDone?.(); }
  };
  const reset = () => { setRound(0); setPicked(null); setScore(0); setFinished(false); };

  if (finished) {
    return (
      <div className="bg-white rounded-xl border border-stone-200/60 p-5 text-center">
        <div className="text-sm font-bold text-[#1A1A2E] mb-1">Reto completado</div>
        <div className="text-2xl font-black mb-2" style={{ color: score >= 3 ? '#2D6A4F' : '#C4553A' }}>{score}/{rounds.length}</div>
        <button onClick={reset} className="flex items-center gap-1.5 mx-auto text-xs font-bold px-3 py-1.5 rounded-lg bg-[#2D6A4F] text-white">
          <RotateCcw size={13} /> Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[#1A1A2E]">Reto: clasifica por profundidad</span>
        <span className="text-[11px] text-stone-400">{round + 1}/{rounds.length} · {score} pts</span>
      </div>
      <p className="text-sm text-stone-600 mb-1">{e.fecha} · {e.lugar ?? 'lugar no disponible'}</p>
      <p className="text-sm font-semibold text-[#1A1A2E] mb-3">Profundidad: {e.profundidad_km} km</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {options.map(o => {
          let cls = 'bg-stone-50 border-stone-200 text-stone-600';
          if (answered) {
            if (o === correct) cls = 'bg-green-500/10 border-green-500/40 text-green-700';
            else if (o === picked) cls = 'bg-red-500/10 border-red-500/40 text-red-700';
          }
          return (
            <button key={o} onClick={() => pick(o)} className={`px-2 py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 ${cls}`}>
              {answered && o === correct && <CheckCircle size={12} className="text-green-600" />}
              {answered && o === picked && o !== correct && <XCircle size={12} className="text-red-500" />}
              {o}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <div className="text-xs text-stone-600 bg-stone-50 rounded-lg p-2.5 mb-3">
            {e.profundidad_km} km es un sismo <b>{correct.toLowerCase()}</b> (superficial &lt; 70 km, intermedio 70–300 km, profundo 300–700 km).
          </div>
          <button onClick={next} className="w-full text-xs font-bold py-2 rounded-lg bg-[#C4553A] text-white">
            {round < rounds.length - 1 ? 'Siguiente' : 'Ver resultado'}
          </button>
        </>
      )}
    </div>
  );
}
