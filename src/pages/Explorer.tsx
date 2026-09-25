import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Badge } from '../components/ui/Badge';
import { SeismicMap, MapPoint } from '../components/explorer/SeismicMap';
import {
  Database, MapPin, Search, Waves, Flame, Clock, Activity, Radio,
  X, ChevronLeft, ChevronRight, Mountain, Upload, HelpCircle,
} from '../lib/icons';
import { MseedUpload } from '../components/explorer/MseedUpload';
import { Tooltip } from '../components/ui/Tooltip';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { loadCatalog } from '../lib/catalog';
import { startTour } from '../tours/useTour';
import { buildExploradorSteps } from '../tours/explorador';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Props {
  onLoadRealData?: (
    waveData: { time: number[]; north: number[]; east: number[]; vertical: number[] },
    label: string,
    eventMeta: { date: string; duration: number; sourceType?: 'tectonic' | 'volcanic'; magnitude?: number; depth?: number; lat?: number; lon?: number },
  ) => void;
}

type SourceKind = 'volcanic' | 'tectonic' | 'upload';

interface GalerasEvent {
  id: string;
  event_date: string;
  event_time: string;
  station: string;
  sampling_rate: number;
  duration: number;
  num_samples: number;
  components: string[];
  event_type: string;
  volcanic_subtype?: string;
  volcanic_subtype_label?: string;
  source: string;
  location_name: string;
}

interface WaveSeries {
  time: number[];
  north: number[];
  east: number[];
  vertical: number[];
}

interface CMStation {
  station: string;
  location: string;
  instrument_type: string;
  physical_quantity: string;
  sampling_rate: number;
  duration: number;
  num_samples: number;
  had_gaps: boolean;
  latitude?: number;
  longitude?: number;
  approx_location?: boolean;
}

interface CMEvent {
  id: string;
  magnitude: number;
  date: string;
  time: string;
  folder: string;
  latitude?: number;
  longitude?: number;
  stations: CMStation[];
}

interface CMStationData {
  event_id: string;
  station: string;
  instrument_type: string;
  physical_quantity: string;
  sampling_rate: number;
  duration: number;
  waveData: WaveSeries;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZE = 8;

const GALERAS_COORDS = { lat: 1.2216, lon: -77.3742 };
const COLOR_VOLCANIC = '#C4553A';
const COLOR_TECTONIC = '#2D6A4F';

const VOLCANIC_SUBTYPES = [
  { value: 'all', label: 'Todos', short: 'Todos' },
  { value: 'lp', label: 'Largo Período', short: 'LP' },
  { value: 'to', label: 'Tornillo', short: 'Tornillo' },
  { value: 'tr', label: 'Tremor', short: 'Tremor' },
  { value: 'va', label: 'Volcano-Tectónico', short: 'VT' },
];

const CM_REGIONS = ['all', 'Colombia', 'Ecuador'] as const;

/** Etiqueta legible por código de subtipo volcánico. */
const SUBTYPE_LABELS: Record<string, string> = {
  lp: 'Largo Período', to: 'Tornillo', tr: 'Tremor', va: 'Volcano-Tectónico',
};

/**
 * Desplaza ligeramente los puntos que comparten coordenada exacta (el cráter
 * del Galeras) para que los marcadores no se apilen. Determinístico por índice.
 */
function jitter(lat: number, lon: number, index: number): [number, number] {
  const angle = (index * 137.5 * Math.PI) / 180; // ángulo áureo
  const r = 0.012 * Math.sqrt(index + 1);
  return [lat + r * Math.cos(angle), lon + r * Math.sin(angle)];
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

/** Mini sismograma SVG para una componente. */
function WaveTrace({ data, label, color }: { data: number[]; label: string; color: string }) {
  if (!data || data.length === 0) return null;
  const w = 800, h = 70, mid = h / 2;

  // Amplitud de referencia robusta: en vez del pico global (que aplasta la
  // señal cuando hay un arribo dominante), usamos un percentil alto (p99).
  // Así la energía "normal" del sismograma se ve, no solo el pico.
  const absVals = data.map(Math.abs).sort((a, b) => a - b);
  const p99 = absVals[Math.floor(absVals.length * 0.99)] || absVals[absVals.length - 1] || 1;
  const ref = p99 < 1e-10 ? 1 : p99;
  const amp = (v: number) => {
    // Escala por p99 y satura suavemente para que el pico no se salga.
    const s = v / ref;
    const clamped = Math.max(-1.15, Math.min(1.15, s));
    return mid - clamped * (mid - 4);
  };

  // Envelope min/max por columna de píxel: recorre TODAS las muestras y por
  // cada columna dibuja el rango [min, max] de las muestras que caen ahí.
  const n = data.length;
  const topPts: string[] = [];
  const botPts: string[] = [];
  for (let x = 0; x < w; x++) {
    const i0 = Math.floor((x * n) / w);
    const i1 = Math.max(i0 + 1, Math.floor(((x + 1) * n) / w));
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i < i1 && i < n; i++) {
      const v = data[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === Infinity) { lo = 0; hi = 0; }
    topPts.push(`${x},${amp(hi).toFixed(1)}`);
    botPts.push(`${x},${amp(lo).toFixed(1)}`);
  }
  // Área rellena entre el máximo y el mínimo (aspecto de sismograma real).
  const areaPath = `M ${topPts.join(' L ')} L ${botPts.reverse().join(' L ')} Z`;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-bold text-stone-500">{label}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16 bg-stone-50 rounded border border-stone-100" preserveAspectRatio="none">
        <line x1="0" y1={mid} x2={w} y2={mid} stroke="#e7e5e4" strokeWidth="0.5" />
        <path d={areaPath} fill={color} fillOpacity="0.85" stroke={color} strokeWidth="0.4" />
      </svg>
    </div>
  );
}

/** Controles de paginación. */
function Pager({ page, total, pageSize, onChange, accent }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void; accent: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-1 py-2">
      <span className="text-[11px] text-stone-400">{from}–{to} de {total}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 disabled:opacity-40 hover:bg-stone-50"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-[11px] font-bold px-1" style={{ color: accent }}>{page} / {totalPages}</span>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 disabled:opacity-40 hover:bg-stone-50"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function Explorer({ onLoadRealData }: Props) {
  const { user, markTourSeen } = useAuth();

  // ── Tour guiado (Driver.js) ──
  const tourRef = useRef(false); // evita relanzar el auto-tour
  const launchTour = useCallback(() => {
    startTour(buildExploradorSteps({ canUpload: Boolean(user) }), { onDone: () => markTourSeen('explorador') });
  }, [markTourSeen, user]);

  // Lanza el tour la primera vez que el usuario entra al módulo.
  useEffect(() => {
    if (tourRef.current || !user) return;
    if (user.tours_vistos?.explorador) return;
    tourRef.current = true;
    const id = requestAnimationFrame(() => setTimeout(launchTour, 500));
    return () => cancelAnimationFrame(id);
  }, [user, launchTour]);

  // Fuente activa (filtro primario)
  const [source, setSource] = useState<SourceKind>('volcanic');

  // Datos
  const [galeras, setGaleras] = useState<GalerasEvent[]>([]);
  const [cm, setCm] = useState<CMEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState('');
  const [subtype, setSubtype] = useState('all');
  const [region, setRegion] = useState<string>('all');
  const [minMag, setMinMag] = useState('');

  // Selección + waveform
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [galerasWave, setGalerasWave] = useState<WaveSeries | null>(null);
  const [loadingWave, setLoadingWave] = useState(false);
  const [selectedStation, setSelectedStation] = useState<CMStation | null>(null);
  const [cmWave, setCmWave] = useState<CMStationData | null>(null);
  const [loadingCMWave, setLoadingCMWave] = useState(false);

  // Paginación
  const [page, setPage] = useState(1);

  // ─── Carga de datos ───
  // La LISTA de eventos viene del catálogo (tabla seismic_events de Supabase).
  // El DETALLE de estaciones de cada evento CM se toma de los JSON por event_id.
  useEffect(() => {
    async function load() {
      setLoading(true);
      // Catálogo = fuente de verdad de qué eventos existen (Supabase).
      const catalog = await loadCatalog();

      // Detalle de estaciones por evento CM (desde el índice JSON, por id).
      let stationsByEvent: Record<string, CMStation[]> = {};
      try {
        const cmIndex = await fetch('/data/cm/index.json').then(r => r.json());
        for (const e of cmIndex.events ?? []) stationsByEvent[e.id] = e.stations ?? [];
      } catch { stationsByEvent = {}; }

      // Metadatos de forma de onda por evento Galeras (duración, muestras, Hz).
      // El catálogo de Supabase no los guarda, así que se toman del índice JSON.
      const galMetaById: Record<string, { sampling_rate: number; duration: number; num_samples: number; station: string; components: string[] }> = {};
      try {
        const galIndex = await fetch('/data/galeras/index.json').then(r => r.json());
        for (const e of galIndex.events ?? []) {
          galMetaById[e.id] = {
            sampling_rate: e.sampling_rate ?? 0,
            duration: e.duration ?? 0,
            num_samples: e.num_samples ?? 0,
            station: e.station ?? 'CUFP',
            components: e.components ?? ['E', 'N', 'Z'],
          };
        }
      } catch { /* sin índice: quedan en 0 */ }

      // Mapear filas del catálogo a las estructuras que ya usa el Explorer.
      const gal: GalerasEvent[] = catalog
        .filter(r => r.event_type === 'volcanic')
        .map(r => {
          const meta = galMetaById[r.event_id];
          return {
            id: r.event_id,
            event_date: r.event_date,
            event_time: r.event_time,
            station: meta?.station ?? 'CUFP',
            sampling_rate: meta?.sampling_rate ?? 0,
            duration: meta?.duration ?? 0,
            num_samples: meta?.num_samples ?? 0,
            components: meta?.components ?? ['E', 'N', 'Z'],
            event_type: 'volcanic',
            volcanic_subtype: r.volcanic_subtype ?? undefined,
            volcanic_subtype_label: SUBTYPE_LABELS[r.volcanic_subtype ?? ''] ?? undefined,
            source: r.source,
            location_name: r.location_name,
          };
        });

      const cmEvents: CMEvent[] = catalog
        .filter(r => r.event_type === 'tectonic')
        .map(r => ({
          id: r.event_id,
          magnitude: r.magnitude ?? 0,
          date: r.event_date,
          time: r.event_time,
          folder: r.region ?? 'Colombia',
          stations: stationsByEvent[r.event_id] ?? [],
        }));

      setGaleras(gal);
      setCm(cmEvents);
      setLoading(false);
    }
    load();
  }, []);

  // Reset al cambiar fuente o filtros
  useEffect(() => {
    setPage(1);
    setSelectedId(null);
    setGalerasWave(null);
    setSelectedStation(null);
    setCmWave(null);
  }, [source, search, subtype, region, minMag]);

  // ─── Filtrado ───
  const filteredGaleras = useMemo(() => {
    let g = [...galeras];
    if (subtype !== 'all') g = g.filter(e => e.volcanic_subtype === subtype);
    if (search) {
      const q = search.toLowerCase();
      g = g.filter(e => e.location_name?.toLowerCase().includes(q) || e.station?.toLowerCase().includes(q) || e.event_date.includes(q));
    }
    return g.sort((a, b) => (b.event_date + b.event_time).localeCompare(a.event_date + a.event_time));
  }, [galeras, subtype, search]);

  const filteredCM = useMemo(() => {
    let c = [...cm];
    if (region !== 'all') c = c.filter(e => e.folder === region);
    if (minMag) { const m = Number(minMag); if (!isNaN(m)) c = c.filter(e => e.magnitude >= m); }
    if (search) {
      const q = search.toLowerCase();
      c = c.filter(e => e.date.includes(q) || e.stations.some(s => s.station.toLowerCase().includes(q)));
    }
    return c.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [cm, region, minMag, search]);

  const activeList = source === 'volcanic' ? filteredGaleras : filteredCM;
  const pageItems = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Puntos del mapa ───
  // Volcánico: un punto por evento (disperso alrededor del cráter).
  // Tectónico: un punto por ESTACIÓN única que registró los eventos filtrados.
  const mapPoints: MapPoint[] = useMemo(() => {
    if (source === 'volcanic') {
      return filteredGaleras.map((e, i) => {
        const [lat, lon] = jitter(GALERAS_COORDS.lat, GALERAS_COORDS.lon, i);
        return {
          id: e.id, lat, lon, color: COLOR_VOLCANIC,
          label: `${e.volcanic_subtype_label ?? 'Volcánico'} — ${e.event_date}`,
          sublabel: `${e.event_time} UTC · Est. ${e.station}`,
        };
      });
    }
    // Agrupar estaciones únicas y contar cuántos eventos registró cada una
    const byStation = new Map<string, { st: CMStation; count: number }>();
    for (const ev of filteredCM) {
      for (const st of ev.stations) {
        if (st.latitude == null || st.longitude == null) continue;
        const entry = byStation.get(st.station);
        if (entry) entry.count++;
        else byStation.set(st.station, { st, count: 1 });
      }
    }
    return Array.from(byStation.values()).map(({ st, count }) => ({
      id: `station-${st.station}`,
      lat: st.latitude!,
      lon: st.longitude!,
      color: COLOR_TECTONIC,
      label: `Estación ${st.station}${st.approx_location ? ' (aprox.)' : ''}`,
      sublabel: `${st.location} · ${count} evento${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''}`,
    }));
  }, [source, filteredGaleras, filteredCM]);

  const mapView = source === 'volcanic'
    ? { center: [GALERAS_COORDS.lat, GALERAS_COORDS.lon] as [number, number], zoom: 12 }
    : { center: [1.5, -77.5] as [number, number], zoom: 7 };

  // En tectónico, encuadrar todas las estaciones visibles.
  const mapBounds = useMemo(() => {
    if (source !== 'tectonic' || mapPoints.length === 0) return null;
    const lats = mapPoints.map(p => p.lat);
    const lons = mapPoints.map(p => p.lon);
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ] as [[number, number], [number, number]];
  }, [source, mapPoints]);

  // ─── Handlers ───
  const loadGalerasWave = useCallback(async (ev: GalerasEvent) => {
    if (selectedId === ev.id) { setSelectedId(null); setGalerasWave(null); return; }
    setSelectedId(ev.id);
    setLoadingWave(true);
    setGalerasWave(null);
    try {
      const res = await fetch(`/data/galeras/${ev.id}.json`);
      const data = await res.json();
      setGalerasWave(data.waveData);
    } catch { /* ignore */ }
    setLoadingWave(false);
  }, [selectedId]);

  const selectCM = useCallback((ev: CMEvent) => {
    if (selectedId === ev.id) { setSelectedId(null); setSelectedStation(null); setCmWave(null); return; }
    setSelectedId(ev.id);
    setSelectedStation(null);
    setCmWave(null);
  }, [selectedId]);

  const loadCMStationWave = useCallback(async (ev: CMEvent, st: CMStation) => {
    setSelectedStation(st);
    setLoadingCMWave(true);
    setCmWave(null);
    try {
      const res = await fetch(`/data/cm/${ev.id}/${st.station}.json`);
      const data: CMStationData = await res.json();
      setCmWave(data);
    } catch { /* ignore */ }
    setLoadingCMWave(false);
  }, []);

  const handleMapSelect = useCallback((id: string) => {
    // En tectónico los marcadores son estaciones (id 'station-XX'): solo informativos.
    if (source === 'tectonic') return;
    const idx = filteredGaleras.findIndex(e => e.id === id);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1);
    const ev = filteredGaleras.find(e => e.id === id);
    if (ev) loadGalerasWave(ev);
  }, [source, filteredGaleras, loadGalerasWave]);

  const clearFilters = () => { setSearch(''); setSubtype('all'); setRegion('all'); setMinMag(''); };
  const hasFilters = search || subtype !== 'all' || region !== 'all' || minMag;

  // ─── Conteos por subtipo (para chips) ───
  const subtypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of galeras) {
      const k = e.volcanic_subtype ?? 'other';
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [galeras]);

  // ═══ RENDER ═══
  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-16">
      {/* Header */}
      <div className="bg-white border-b border-stone-200/60 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-[#1A1A2E] font-bold text-xl flex items-center gap-2">
            <Database size={20} className="text-[#C4553A]" />
            Explorador de Registros Sísmicos
            {/* Botón de ayuda: repite el tour guiado cuando el usuario quiera. */}
            <Tooltip content="Ver guía">
              <button
                type="button"
                onClick={launchTour}
                aria-label="Ver guía"
                className={`flex items-center justify-center w-6 h-6 rounded-full border border-stone-200 text-stone-400 hover:text-[#C4553A] hover:border-[#C4553A]/40 transition-colors ${user && !user.tours_vistos?.explorador ? 'help-pulse' : ''}`}
              >
                <HelpCircle size={14} />
              </button>
            </Tooltip>
          </h1>
          <p className="text-stone-400 text-xs mt-0.5">
            Sismogramas triaxiales reales de Nariño · Volcán Galeras (OVSP) y Red Sismológica Nacional (SGC)
            {user && <span className="text-stone-300"> · Sesión: {user.full_name || user.email} ({ROLE_LABELS[user.role]})</span>}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* ═══ SELECTOR DE FUENTE (filtro primario) ═══ */}
        <div data-tour="exp-fuente" className={`grid gap-3 ${user ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
          <button
            data-tour="exp-fuente-volcanic"
            onClick={() => setSource('volcanic')}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
              source === 'volcanic'
                ? 'border-[#C4553A] bg-[#C4553A]/5 shadow-sm'
                : 'border-stone-200/60 bg-white hover:border-[#C4553A]/40'
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${source === 'volcanic' ? 'bg-[#C4553A] text-white' : 'bg-[#C4553A]/10 text-[#C4553A]'}`}>
              <Flame size={20} />
            </div>
            <div>
              <div className="font-bold text-[#1A1A2E] text-sm">Sismos Volcánicos</div>
              <div className="text-[11px] text-stone-400">Volcán Galeras · {galeras.length} eventos · 4 tipos</div>
            </div>
          </button>

          <button
            data-tour="exp-fuente-tectonic"
            onClick={() => setSource('tectonic')}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
              source === 'tectonic'
                ? 'border-[#2D6A4F] bg-[#2D6A4F]/5 shadow-sm'
                : 'border-stone-200/60 bg-white hover:border-[#2D6A4F]/40'
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${source === 'tectonic' ? 'bg-[#2D6A4F] text-white' : 'bg-[#2D6A4F]/10 text-[#2D6A4F]'}`}>
              <Mountain size={20} />
            </div>
            <div>
              <div className="font-bold text-[#1A1A2E] text-sm">Sismos Tectónicos</div>
              <div className="text-[11px] text-stone-400">Red Sismológica Nacional · {cm.length} eventos</div>
            </div>
          </button>

          {user && (
            <button
              data-tour="exp-fuente-upload"
              onClick={() => setSource('upload')}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                source === 'upload'
                  ? 'border-[#6B5B95] bg-[#6B5B95]/5 shadow-sm'
                  : 'border-stone-200/60 bg-white hover:border-[#6B5B95]/40'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${source === 'upload' ? 'bg-[#6B5B95] text-white' : 'bg-[#6B5B95]/10 text-[#6B5B95]'}`}>
                <Upload size={20} />
              </div>
              <div>
                <div className="font-bold text-[#1A1A2E] text-sm">Mi archivo MiniSEED</div>
                <div className="text-[11px] text-stone-400">Carga y procesa tus propios registros</div>
              </div>
            </button>
          )}
        </div>

        {source === 'upload' && user && (
          <MseedUpload onLoadRealData={onLoadRealData} />
        )}

        {/* ═══ SUB-FILTROS CONTEXTUALES ═══ */}
        {source !== 'upload' && (
        <div data-tour="exp-filtros" className="bg-white rounded-xl border border-stone-200/60 p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder={source === 'volcanic' ? 'Buscar por fecha o estación...' : 'Buscar por fecha o estación...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-stone-200 rounded-lg bg-stone-50 text-stone-700 focus:outline-none focus:border-[#C4553A]"
            />
          </div>

          {source === 'volcanic' ? (
            <div className="flex flex-wrap gap-1.5">
              {VOLCANIC_SUBTYPES.map(s => {
                const count = s.value === 'all' ? galeras.length : (subtypeCounts[s.value] || 0);
                const active = subtype === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => setSubtype(s.value)}
                    className={`text-[11px] font-semibold px-3 py-2 rounded-lg border transition-colors ${
                      active ? 'bg-[#C4553A] text-white border-[#C4553A]' : 'bg-white text-stone-600 border-stone-200 hover:border-[#C4553A]/40'
                    }`}
                  >
                    {s.label} <span className={active ? 'text-white/70' : 'text-stone-400'}>{count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="py-2 px-2.5 text-xs border border-stone-200 rounded-lg bg-stone-50 text-stone-700 focus:outline-none focus:border-[#2D6A4F]"
              >
                {CM_REGIONS.map(r => <option key={r} value={r}>{r === 'all' ? 'Todas las regiones' : r}</option>)}
              </select>
              <input
                type="number" step="0.1" placeholder="Mag. mín."
                value={minMag}
                onChange={e => setMinMag(e.target.value)}
                className="w-24 py-2 px-2.5 text-xs border border-stone-200 rounded-lg bg-stone-50 text-stone-700 focus:outline-none focus:border-[#2D6A4F]"
              />
            </>
          )}

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] font-semibold text-stone-400 hover:text-[#C4553A] px-2 py-2">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        )}

        {/* ═══ LAYOUT: LISTA + MAPA ═══ */}
        {source !== 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
          {/* Lista */}
          <div data-tour="exp-lista" className="bg-white rounded-xl border border-stone-200/60 p-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-4 border-stone-200 border-t-[#C4553A] animate-spin" />
              </div>
            ) : activeList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                {source === 'volcanic' ? <Flame size={36} className="text-stone-300 mb-3" /> : <Radio size={36} className="text-stone-300 mb-3" />}
                <p className="text-sm font-semibold text-stone-500">
                  {source === 'tectonic' && cm.length === 0
                    ? 'Los sismos tectónicos aún no están disponibles'
                    : 'Ningún evento coincide con los filtros'}
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  {source === 'tectonic' && cm.length === 0
                    ? 'Se cargarán al procesar los datos de la Red Sismológica Nacional'
                    : 'Prueba ajustando la búsqueda o los filtros'}
                </p>
                {hasFilters && (
                  <button onClick={clearFilters} className="mt-3 text-xs font-semibold text-[#C4553A]">Limpiar filtros</button>
                )}
              </div>
            ) : (
              <>
                <div className="divide-y divide-stone-100">
                  {pageItems.map(ev => {
                    const isGal = source === 'volcanic';
                    const g = ev as GalerasEvent;
                    const c = ev as CMEvent;
                    const isOpen = selectedId === ev.id;
                    const accent = isGal ? COLOR_VOLCANIC : COLOR_TECTONIC;
                    return (
                      <div key={ev.id}>
                        <button
                          onClick={() => isGal ? loadGalerasWave(g) : selectCM(c)}
                          className="w-full text-left px-2 py-3 flex items-center gap-3 rounded-lg transition-colors hover:bg-stone-50"
                          style={isOpen ? { backgroundColor: `${accent}0d` } : undefined}
                        >
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}1a` }}>
                            {isGal ? <Activity size={16} style={{ color: accent }} /> : <Radio size={16} style={{ color: accent }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-[#1A1A2E]">{isGal ? g.event_date : c.date}</span>
                              <span className="text-[10px] text-stone-400">{isGal ? g.event_time : c.time} UTC</span>
                              {isGal ? (
                                g.volcanic_subtype_label && (
                                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#6B5B95]/10 text-[#6B5B95]">
                                    {g.volcanic_subtype_label}
                                  </span>
                                )
                              ) : (
                                <>
                                  <span className={`font-bold font-mono text-xs ${c.magnitude >= 5 ? 'text-[#C4553A]' : 'text-stone-700'}`}>M{c.magnitude.toFixed(1)}</span>
                                  <Badge label="Tectónico" variant="tectonic" />
                                  <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">{c.folder}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-stone-400 mt-0.5">
                              {isGal ? (
                                <>
                                  <span className="flex items-center gap-1"><Waves size={9} /> {g.components.join(', ')}</span>
                                  <span className="flex items-center gap-1"><Clock size={9} /> {g.duration}s</span>
                                  <span>{g.num_samples} muestras · {g.sampling_rate.toFixed(0)} Hz</span>
                                </>
                              ) : (
                                <span className="flex items-center gap-1"><Waves size={9} /> {c.stations.length} estaciones · {c.stations.map(s => s.station).join(', ')}</span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: accent }}>
                            {isOpen ? 'Ocultar' : (isGal ? 'Ver sismograma' : 'Ver estaciones')}
                          </span>
                        </button>

                        {/* Expandido: Galeras */}
                        {isOpen && isGal && (
                          <div className="px-2 pb-4 animate-fade-in">
                            {loadingWave ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="w-6 h-6 rounded-full border-[3px] border-stone-200 border-t-[#C4553A] animate-spin" />
                              </div>
                            ) : galerasWave ? (
                              <div className="space-y-2 bg-stone-50/50 rounded-xl p-3 border border-stone-100">
                                <WaveTrace data={galerasWave.north} label="Norte (N)" color="#2D6A4F" />
                                <WaveTrace data={galerasWave.east} label="Este (E)" color="#C4553A" />
                                <WaveTrace data={galerasWave.vertical} label="Vertical (Z)" color="#D4A853" />
                                <button
                                  onClick={() => galerasWave && onLoadRealData?.(galerasWave, `Galeras ${g.event_date} — ${g.volcanic_subtype_label ?? ''}`.trim(), { date: g.event_date, duration: g.duration, sourceType: 'volcanic' })}
                                  className="mt-2 w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white text-xs font-bold py-2.5 rounded-lg btn-hover"
                                >
                                  <Activity size={14} /> Cargar en Simulador
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-stone-400 text-center py-4">Error al cargar datos</p>
                            )}
                          </div>
                        )}

                        {/* Expandido: CM */}
                        {isOpen && !isGal && (
                          <div className="px-2 pb-4 animate-fade-in">
                            <div className="bg-stone-50/50 rounded-xl p-3 border border-stone-100">
                              <div className="text-[10px] font-bold text-stone-500 mb-2 uppercase tracking-wide">Estaciones — elige una para ver el sismograma</div>
                              <div className="grid grid-cols-2 gap-2">
                                {c.stations.map(st => (
                                  <button
                                    key={st.station}
                                    onClick={() => loadCMStationWave(c, st)}
                                    className={`text-left p-2.5 rounded-lg border transition-colors ${
                                      selectedStation?.station === st.station ? 'border-[#2D6A4F] bg-[#2D6A4F]/5' : 'border-stone-200 hover:border-[#2D6A4F]/40'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-[#1A1A2E]">{st.station}</span>
                                      <span className="text-[9px] text-stone-400">{st.sampling_rate} Hz</span>
                                    </div>
                                    <div className="text-[10px] text-stone-500 mt-0.5">{st.instrument_type}</div>
                                  </button>
                                ))}
                              </div>
                              {selectedStation && (
                                <div className="mt-3 pt-3 border-t border-stone-200">
                                  {loadingCMWave ? (
                                    <div className="flex items-center justify-center py-6">
                                      <div className="w-6 h-6 rounded-full border-[3px] border-stone-200 border-t-[#2D6A4F] animate-spin" />
                                    </div>
                                  ) : (cmWave && cmWave.event_id === c.id && cmWave.station === selectedStation.station) ? (
                                    <div className="space-y-2">
                                      <WaveTrace data={cmWave.waveData.north} label="Norte (N)" color="#2D6A4F" />
                                      <WaveTrace data={cmWave.waveData.east} label="Este (E)" color="#C4553A" />
                                      <WaveTrace data={cmWave.waveData.vertical} label="Vertical (Z)" color="#D4A853" />
                                      <button
                                        onClick={() => onLoadRealData?.(
                                          cmWave.waveData,
                                          `CM ${c.date} M${c.magnitude} — Est. ${cmWave.station}`,
                                          { date: c.date, duration: cmWave.duration, sourceType: 'tectonic', magnitude: c.magnitude, depth: 15, lat: c.latitude, lon: c.longitude },
                                        )}
                                        className="mt-2 w-full flex items-center justify-center gap-2 bg-[#2D6A4F] text-white text-xs font-bold py-2.5 rounded-lg btn-hover"
                                      >
                                        <Activity size={14} /> Cargar en Simulador
                                      </button>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-stone-400 text-center py-4">Error al cargar datos</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Pager page={page} total={activeList.length} pageSize={PAGE_SIZE} onChange={setPage} accent={source === 'volcanic' ? COLOR_VOLCANIC : COLOR_TECTONIC} />
              </>
            )}
          </div>

          {/* Mapa */}
          <div data-tour="exp-mapa" className="lg:sticky lg:top-20 h-[380px] lg:h-[calc(100vh-140px)]">
            <div className="bg-white rounded-xl border border-stone-200/60 p-2 h-full flex flex-col">
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <MapPin size={13} className={source === 'volcanic' ? 'text-[#C4553A]' : 'text-[#2D6A4F]'} />
                <span className="text-xs font-bold text-[#1A1A2E]">
                  {source === 'volcanic' ? 'Mapa · Volcán Galeras' : 'Mapa · Estaciones sismológicas'}
                </span>
                <span className="text-[10px] text-stone-400 ml-auto">
                  {source === 'volcanic' ? 'Epicentros' : 'Ubicación aprox. de estaciones'}
                </span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden">
                {source === 'tectonic' && mapPoints.length === 0 ? (
                  <div className="h-full flex items-center justify-center bg-stone-50 rounded-xl">
                    <p className="text-xs text-stone-400 text-center px-4">
                      Sin coordenadas de epicentro disponibles todavía
                    </p>
                  </div>
                ) : (
                  <SeismicMap
                    points={mapPoints}
                    selectedId={source === 'volcanic' ? selectedId : null}
                    onSelect={handleMapSelect}
                    center={mapView.center}
                    zoom={mapView.zoom}
                    bounds={mapBounds}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
