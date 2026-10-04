/**
 * Capítulo 4: Historia sísmica y volcánica de Nariño.
 *
 * Interacción principal: un mapa de Nariño con los eventos de la línea de
 * tiempo ubicados por sus coordenadas, junto a la línea de tiempo cronológica.
 * Al tocar un evento en el mapa se resalta en la línea de tiempo y al revés.
 * Un filtro separa eventos tectónicos y volcánicos. Cada evento muestra su
 * fecha, magnitud, intensidad en Pasto si existe, y su fuente.
 *
 * Los datos se leen de Supabase con respaldo en el contenido verificado del
 * código. Las coordenadas de los sismos históricos provienen de la tabla 1 de
 * Sarabia y Cifuentes (2018), basada en el SISH del SGC; las de los eventos del
 * Galeras corresponden a su cráter (SGC).
 *
 * @module education/HistoryLab
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadTimelineEvents, type TimelineEvent } from '../../lib/educationData';
import { TIMELINE } from '../../lib/educationContent';
import { SeismicMap, type MapPoint } from '../explorer/SeismicMap';
import { VolcanoLoader } from '../ui/VolcanoLoader';
import { RotateCcw } from '../../lib/icons';
import type { LatLngBoundsExpression } from 'leaflet';

type Filter = 'todos' | 'tectonic' | 'volcanic';

const COLOR = { tectonic: '#2D6A4F', volcanic: '#C4553A' };

/** Coordenadas verificadas por id de evento (respaldo si la BD aún no las trae). */
const COORDS_BY_ID = new Map(
  TIMELINE.map(t => [t.id, { lat: t.lat, lon: t.lon, note: t.locationNote }]),
);

/**
 * Completa lat/lon/location_note desde el contenido verificado cuando la fila de
 * Supabase no los trae. Pasa mientras no se haya aplicado la migración de
 * coordenadas y el seed; así el mapa funciona igual. Hace match por id.
 */
function backfillCoords(e: TimelineEvent): TimelineEvent {
  if (e.lat != null && e.lon != null) return e;
  const c = COORDS_BY_ID.get(e.id);
  if (!c || c.lat == null || c.lon == null) return e;
  return { ...e, lat: c.lat, lon: c.lon, location_note: e.location_note ?? c.note };
}

interface Props {
  onChallengeDone?: () => void;
}

export function HistoryLab({ onChallengeDone }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('todos');
  const [sel, setSel] = useState<string | null>(null);
  const [seenMap, setSeenMap] = useState(false); // reto: tocó un evento en el mapa

  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    loadTimelineEvents().then(e => { setEvents(e.map(backfillCoords)); setLoading(false); });
  }, []);

  const filtered = useMemo(
    () => events.filter(e => filter === 'todos' || e.event_type === filter),
    [events, filter],
  );
  const mapped = useMemo(() => filtered.filter(e => e.lat != null && e.lon != null), [filtered]);

  const points = useMemo<MapPoint[]>(() => mapped.map(e => ({
    id: e.id,
    lat: e.lat as number,
    lon: e.lon as number,
    label: `${e.year} · ${e.title}`,
    sublabel: e.magnitude ?? (e.event_type === 'volcanic' ? 'Evento volcánico' : 'Evento tectónico'),
    color: COLOR[e.event_type],
    highlighted: e.id === sel,
  })), [mapped, sel]);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (mapped.length === 0) return null;
    const lats = mapped.map(e => e.lat as number);
    const lons = mapped.map(e => e.lon as number);
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [mapped]);

  // Al seleccionar, desplaza la tarjeta correspondiente de la línea de tiempo.
  const select = (id: string, fromMap: boolean) => {
    setSel(id);
    if (fromMap) setSeenMap(true);
    itemRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  if (loading) return <div className="py-10"><VolcanoLoader size={40} label="Cargando la historia sísmica…" /></div>;

  return (
    <div className="space-y-4">
      {/* Filtro tectónico / volcánico */}
      <div className="flex gap-2">
        {([['todos', 'Todos'], ['tectonic', 'Tectónicos'], ['volcanic', 'Volcánicos']] as [Filter, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              filter === id ? 'text-white border-transparent' : 'bg-white text-stone-500 border-stone-200'
            }`}
            style={filter === id ? { backgroundColor: id === 'volcanic' ? COLOR.volcanic : id === 'tectonic' ? COLOR.tectonic : '#1A1A2E' } : {}}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Mapa: altura fija en todos los tamaños para que Leaflet tenga un
            tamaño resuelto al montar (evita teselas cortadas y mal encuadre). */}
        <div className="rounded-xl border border-stone-200/60 overflow-hidden h-[360px] lg:h-[460px]">
          <SeismicMap
            points={points}
            selectedId={sel}
            onSelect={(id) => select(id, true)}
            center={[1.4, -78.0]}
            zoom={7}
            bounds={bounds}
          />
        </div>

        {/* Línea de tiempo */}
        <div className="rounded-xl border border-stone-200/60 bg-white p-2 h-[360px] lg:h-[460px] overflow-y-auto scrollbar-thin">
          <ol className="relative border-l border-stone-200 ml-3">
            {filtered.map(e => {
              const on = e.id === sel;
              return (
                <li key={e.id} className="ml-4 mb-2">
                  <span className="absolute -left-[7px] w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: COLOR[e.event_type] }} />
                  <button
                    ref={el => { itemRefs.current[e.id] = el; }}
                    onClick={() => select(e.id, false)}
                    className={`w-full text-left rounded-lg p-2.5 transition-colors ${on ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#1A1A2E]">{e.year}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${COLOR[e.event_type]}18`, color: COLOR[e.event_type] }}>
                        {e.event_type === 'volcanic' ? 'Volcánico' : 'Tectónico'}
                      </span>
                      {e.magnitude && <span className="text-[11px] text-stone-500">{e.magnitude}</span>}
                    </div>
                    <div className="text-sm font-semibold text-[#1A1A2E] mt-0.5">{e.title}</div>
                    {on && (
                      <div className="mt-1.5">
                        <p className="text-xs text-stone-600 leading-relaxed">{e.description}</p>
                        {e.location_note && <p className="text-[10px] text-stone-400 mt-1">Ubicación: {e.location_note}.</p>}
                        {!e.lat && <p className="text-[10px] text-stone-400 mt-1">Sin punto en el mapa (sin coordenadas publicadas).</p>}
                        {e.source && (
                          <p className="text-[10px] text-stone-400 mt-1 leading-snug">
                            Fuente: {e.source}
                            {e.source_url && <> <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline break-all">{e.source_url}</a></>}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <p className="text-sm text-stone-600 leading-relaxed">
        Nariño vive dos tipos de amenaza: los sismos de las fallas de la corteza y de la subducción en la costa pacífica, y la actividad del volcán Galeras.
        Toca un evento en el mapa o en la línea de tiempo para ver su información.
      </p>

      {/* Reto sencillo: identificar el tipo de un par de eventos tras explorar */}
      <HistoryChallenge events={events} enabled={seenMap} onDone={onChallengeDone} />
    </div>
  );
}

/* ─── Reto: tectónico o volcánico ─── */
function HistoryChallenge({ events, enabled, onDone }: { events: TimelineEvent[]; enabled: boolean; onDone?: () => void }) {
  const rounds = useMemo(() => {
    const tec = events.filter(e => e.event_type === 'tectonic');
    const vol = events.filter(e => e.event_type === 'volcanic');
    const pick = <T,>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
    return [...pick(tec, 3), ...pick(vol, 2)].sort(() => Math.random() - 0.5);
  }, [events]);

  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!enabled) {
    return (
      <div className="bg-stone-50 border border-stone-200/60 rounded-xl p-4 text-center text-xs text-stone-500">
        Explora al menos un evento en el mapa para desbloquear el reto.
      </div>
    );
  }
  if (rounds.length === 0) return null;

  const e = rounds[round];
  const correct = e.event_type;
  const answered = picked !== null;

  const pick = (t: string) => { if (answered) return; setPicked(t); if (t === correct) setScore(s => s + 1); };
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
        <span className="text-xs font-bold text-[#1A1A2E]">Reto: ¿tectónico o volcánico?</span>
        <span className="text-[11px] text-stone-400">{round + 1}/{rounds.length} · {score} pts</span>
      </div>
      <p className="text-sm text-stone-600 mb-3">{e.year} · {e.title}</p>
      <div className="grid grid-cols-2 gap-2">
        {(['tectonic', 'volcanic'] as const).map(t => {
          let cls = 'bg-stone-50 border-stone-200 text-stone-600';
          if (answered) {
            if (t === correct) cls = 'bg-green-500/10 border-green-500/40 text-green-700';
            else if (t === picked) cls = 'bg-red-500/10 border-red-500/40 text-red-700';
          }
          return (
            <button key={t} onClick={() => pick(t)} className={`px-2 py-2 rounded-lg border text-xs font-bold ${cls}`}>
              {t === 'tectonic' ? 'Tectónico' : 'Volcánico'}
            </button>
          );
        })}
      </div>
      {answered && (
        <button onClick={next} className="w-full mt-3 text-xs font-bold py-2 rounded-lg bg-[#C4553A] text-white">
          {round < rounds.length - 1 ? 'Siguiente' : 'Ver resultado'}
        </button>
      )}
    </div>
  );
}
