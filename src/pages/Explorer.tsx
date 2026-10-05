import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { SeismicMap, MapPoint, MapArea } from '../components/explorer/SeismicMap';
import {
  Database, MapPin, Search, Waves, Flame, Clock, Activity, Radio,
  X, ChevronLeft, ChevronRight, Upload, HelpCircle,
} from '../lib/icons';
import { MseedUpload } from '../components/explorer/MseedUpload';
import { Tooltip } from '../components/ui/Tooltip';
import { VolcanoLoader } from '../components/ui/VolcanoLoader';
import { useAuth } from '../lib/authContext';
import { loadCatalog } from '../lib/catalog';
import { getStations, Station } from '../lib/api3d';
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
  /** Lleva un MiniSEED subido al Mapa 3D, asociado a su estación real. */
  onLoadMseedToMap3d?: (
    waveData: { time: number[]; north: number[]; east: number[]; vertical: number[] },
    meta: { station: string; filename: string; sourceType: 'tectonic' | 'volcanic' },
  ) => void;
}

type SourceKind = 'volcanic' | 'tectonic' | 'upload';

interface GalerasEvent {
  id: string;
  event_date: string;
  event_time: string;
  station: string;
  /** Frecuencia de muestreo ORIGINAL del equipo (Hz). */
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
  /** Frecuencia decimada (para dibujar). */
  sampling_rate: number;
  /** Frecuencia ORIGINAL del equipo (Hz), tomada de la cabecera MiniSEED. */
  original_sampling_rate?: number;
  duration: number;
  num_samples: number;
  had_gaps: boolean;
}

interface CMEvent {
  id: string;
  magnitude: number;
  date: string;
  time: string;
  folder: string;
  latitude?: number;
  longitude?: number;
  /** Profundidad real (km) si el catálogo la trae, o null. */
  depthKm?: number | null;
  /** 'SGC/USGS' = epicentro real; otro valor/null = coordenada por zona. */
  locationSource?: string | null;
  stations: CMStation[];
}

interface CMStationData {
  event_id: string;
  station: string;
  instrument_type: string;
  physical_quantity: string;
  sampling_rate: number;
  original_sampling_rate?: number;
  duration: number;
  waveData: WaveSeries;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZE = 8;

/** Cráter del Volcán Galeras (fuente OVSP). */
const GALERAS_CRATER = { lat: 1.2288, lon: -77.3592 };
/** Estación que registró los eventos volcánicos del Galeras. */
const GALERAS_STATION = { code: 'CUFP', lat: 1.2200, lon: -77.3480 };

const COLOR_VOLCANIC = '#C4553A';
const COLOR_TECTONIC = '#2D6A4F';
const COLOR_INK = '#1A1A2E';

/** Colores de las componentes, iguales que en el Simulador. */
const WAVE_COLORS = { north: '#C4553A', east: '#2D6A4F', vertical: '#D4A853' };

// Las coordenadas de las estaciones vienen del backend (GET /api/stations,
// respaldado por backend/core/stations.py). No se duplican aquí.

const VOLCANIC_SUBTYPES = [
  { value: 'all', label: 'Todos' },
  { value: 'lp', label: 'Largo período' },
  { value: 'to', label: 'Tornillo' },
  { value: 'tr', label: 'Tremor' },
  { value: 'va', label: 'Volcano-tectónico' },
  { value: 'none', label: 'Sin clasificar' },
];

const CM_REGIONS = ['all', 'Colombia', 'Ecuador'] as const;

/** Etiqueta legible (sentence case) por código de subtipo volcánico. */
const SUBTYPE_LABELS: Record<string, string> = {
  lp: 'Largo período', to: 'Tornillo', tr: 'Tremor', va: 'Volcano-tectónico',
};

/** Nombre del instrumento en español, con tildes, según el tipo de la cabecera. */
function instrumentLabelEs(raw: string): string {
  const s = (raw || '').toLowerCase();
  if (s.includes('broadband') || s.includes('banda ancha')) return 'Velocímetro de banda ancha';
  if (s.includes('short') || s.includes('periodo corto') || s.includes('período corto')) return 'Velocímetro de periodo corto';
  if (s.includes('strong') || s.includes('acele')) return 'Acelerómetro de movimiento fuerte';
  return raw;
}

/** Magnitud física medida por la componente, en español. */
function physicalQuantityEs(raw: string): string {
  const s = (raw || '').toLowerCase();
  if (s.includes('acel')) return 'aceleración';
  if (s.includes('veloc')) return 'velocidad';
  return raw || 'movimiento';
}

/** Formatea una duración con un decimal y espacio: "122.9 s". */
function fmtDuration(sec: number): string {
  return `${sec.toFixed(1)} s`;
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

/**
 * Mini sismograma SVG de una componente. Dibuja la envolvente min/max sobre
 * TODAS las muestras (no diezma la señal; el submuestreo a 3000 solo aplica al
 * guardar el JSON). Amplitud normalizada de forma robusta (percentil 99).
 */
function WaveTrace({ data, label, color }: { data: number[]; label: string; color: string }) {
  if (!data || data.length === 0) return null;
  const w = 800, h = 70, mid = h / 2;

  const absVals = data.map(Math.abs).sort((a, b) => a - b);
  const p99 = absVals[Math.floor(absVals.length * 0.99)] || absVals[absVals.length - 1] || 1;
  const ref = p99 < 1e-10 ? 1 : p99;
  const amp = (v: number) => {
    const s = v / ref;
    const clamped = Math.max(-1.15, Math.min(1.15, s));
    return mid - clamped * (mid - 4);
  };

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

/**
 * Grupo de las tres componentes (Norte, Este, Vertical) con un eje de tiempo en
 * segundos COMPARTIDO abajo y la magnitud física normalizada en el título. Los
 * colores coinciden con el Simulador (Norte terracota, Este verde, Vertical ocre).
 */
function TriaxialPreview({ wave, duration, physical }: { wave: WaveSeries; duration: number; physical: string }) {
  // Marcas del eje de tiempo (0, ¼, ½, ¾, fin) en segundos.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => (f * duration));
  return (
    <div className="space-y-2 bg-stone-50/50 rounded-xl p-3 border border-stone-100">
      <p className="text-[10px] text-stone-500">
        Movimiento del suelo ({physicalQuantityEs(physical)}, normalizado). Ejes: Norte, Este y Vertical a la misma escala.
      </p>
      <WaveTrace data={wave.north} label="Norte (N)" color={WAVE_COLORS.north} />
      <WaveTrace data={wave.east} label="Este (E)" color={WAVE_COLORS.east} />
      <WaveTrace data={wave.vertical} label="Vertical (Z)" color={WAVE_COLORS.vertical} />
      {/* Eje de tiempo compartido por las tres trazas. */}
      <div className="flex justify-between text-[9px] text-stone-400 px-0.5 pt-0.5">
        {ticks.map((t, i) => <span key={i}>{t.toFixed(1)} s</span>)}
      </div>
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

export function Explorer({ onLoadRealData, onLoadMseedToMap3d }: Props) {
  const { user, markTourSeen } = useAuth();

  // ── Tour guiado (Driver.js) ──
  const tourRef = useRef(false); // evita relanzar el auto-tour
  const launchTour = useCallback(() => {
    startTour(buildExploradorSteps({ canUpload: Boolean(user) }), { onDone: () => markTourSeen('explorador') });
  }, [markTourSeen, user]);

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
  // Estaciones (coordenadas oficiales) desde el backend, única fuente de verdad.
  const [stations, setStations] = useState<Station[]>([]);

  // Filtros
  const [search, setSearch] = useState('');
  const [subtype, setSubtype] = useState('all');
  const [region, setRegion] = useState<string>('all');
  const [minMag, setMinMag] = useState('');
  // Filtro por estación: al hacer clic en una estación del mapa (tectónico), se
  // muestran solo los eventos que ESA estación registró. null = sin filtro.
  const [mapStation, setMapStation] = useState<string | null>(null);

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
  useEffect(() => {
    async function load() {
      setLoading(true);
      const catalog = await loadCatalog();

      // Detalle de estaciones por evento CM (desde el índice JSON, por id).
      let stationsByEvent: Record<string, CMStation[]> = {};
      try {
        const cmIndex = await fetch('/data/cm/index.json').then(r => r.json());
        for (const e of cmIndex.events ?? []) stationsByEvent[e.id] = e.stations ?? [];
      } catch { stationsByEvent = {}; }

      // Metadatos de forma de onda por evento Galeras (Hz original, duración…).
      const galMetaById: Record<string, { sampling_rate: number; duration: number; num_samples: number; station: string; components: string[] }> = {};
      try {
        const galIndex = await fetch('/data/galeras/index.json').then(r => r.json());
        for (const e of galIndex.events ?? []) {
          galMetaById[e.id] = {
            // Frecuencia ORIGINAL del equipo (no la diezmada para dibujar).
            sampling_rate: e.original_sampling_rate ?? e.sampling_rate ?? 0,
            duration: e.duration ?? 0,
            num_samples: e.num_samples ?? 0,
            station: e.station ?? 'CUFP',
            components: e.components ?? ['E', 'N', 'Z'],
          };
        }
      } catch { /* sin índice: quedan en 0 */ }

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
          latitude: r.latitude,
          longitude: r.longitude,
          depthKm: r.depth_km,
          locationSource: r.location_source,
          stations: stationsByEvent[r.event_id] ?? [],
        }));

      setGaleras(gal);
      setCm(cmEvents);
      setLoading(false);
    }
    load();
  }, []);

  // Coordenadas de estaciones desde el backend (core/stations.py). Si el
  // backend no responde, el mapa tectónico queda sin marcadores pero la lista
  // sigue funcionando.
  useEffect(() => {
    let alive = true;
    getStations().then(s => { if (alive) setStations(s); }).catch(() => { /* sin mapa de estaciones */ });
    return () => { alive = false; };
  }, []);

  // Reset al cambiar fuente o filtros
  useEffect(() => {
    setPage(1);
    setSelectedId(null);
    setGalerasWave(null);
    setSelectedStation(null);
    setCmWave(null);
  }, [source, search, subtype, region, minMag, mapStation]);

  // Al cambiar de fuente, limpiar el filtro por estación del mapa (solo aplica
  // a tectónico).
  useEffect(() => { setMapStation(null); }, [source]);

  // ─── Filtrado ───
  const filteredGaleras = useMemo(() => {
    let g = [...galeras];
    if (subtype === 'none') g = g.filter(e => !e.volcanic_subtype);
    else if (subtype !== 'all') g = g.filter(e => e.volcanic_subtype === subtype);
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
    // Filtro por estación del mapa: solo eventos registrados por esa estación.
    if (mapStation) c = c.filter(e => e.stations.some(s => s.station === mapStation));
    if (search) {
      const q = search.toLowerCase();
      c = c.filter(e => e.date.includes(q) || e.stations.some(s => s.station.toLowerCase().includes(q)));
    }
    return c.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [cm, region, minMag, search, mapStation]);

  const activeList = source === 'volcanic' ? filteredGaleras : filteredCM;
  const pageItems = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Evento CM abierto (para resaltar sus estaciones en el mapa).
  const openCMEvent = useMemo(
    () => (source === 'tectonic' ? filteredCM.find(e => e.id === selectedId) ?? null : null),
    [source, filteredCM, selectedId],
  );

  // ─── Puntos y área del mapa ───
  // Volcánico: cráter + estación registradora (sin epicentros individuales).
  // Tectónico: las 7 estaciones de la red; se resaltan las del evento abierto.
  const mapPoints: MapPoint[] = useMemo(() => {
    if (source === 'volcanic') {
      return [
        {
          id: 'crater', lat: GALERAS_CRATER.lat, lon: GALERAS_CRATER.lon, color: COLOR_VOLCANIC,
          label: 'Cráter del Volcán Galeras', sublabel: 'Zona de origen de la sismicidad volcánica (OVSP)',
          badge: 'Galeras',
        },
        {
          id: `station-${GALERAS_STATION.code}`, lat: GALERAS_STATION.lat, lon: GALERAS_STATION.lon, color: COLOR_INK,
          label: `Estación ${GALERAS_STATION.code}`, sublabel: 'Estación que registró los eventos',
          station: true, badge: GALERAS_STATION.code,
        },
      ];
    }
    // Tectónico: todas las estaciones de la red (del backend, siempre visibles).
    const recording = new Set(openCMEvent?.stations.map(s => s.station) ?? []);
    const pts: MapPoint[] = stations.map(s => ({
      id: `station-${s.code}`,
      lat: s.latitude,
      lon: s.longitude,
      color: COLOR_TECTONIC,
      station: true,
      highlighted: recording.has(s.code) || mapStation === s.code,
      badge: s.code,
      label: `Estación ${s.code}${s.approx ? ' (ubicación aproximada)' : ''}`,
      sublabel: mapStation === s.code
        ? `${s.name} · mostrando sus eventos (clic para quitar)`
        : recording.has(s.code) ? `${s.name} · registró este evento` : `${s.name} · clic para ver sus eventos`,
    }));
    // Al abrir un evento, marcar su UBICACIÓN en el mapa. HONESTIDAD: el catálogo
    // no trae el epicentro real; la coordenada es el CENTROIDE de las estaciones
    // que lo registraron, así que se rotula como aproximada, no como epicentro.
    if (openCMEvent && openCMEvent.latitude != null && openCMEvent.longitude != null) {
      pts.push({
        id: `event-${openCMEvent.id}`,
        lat: openCMEvent.latitude,
        lon: openCMEvent.longitude,
        color: COLOR_VOLCANIC,
        badge: `ML ${openCMEvent.magnitude.toFixed(1)}`,
        label: `Evento ML ${openCMEvent.magnitude.toFixed(1)}, ${openCMEvent.folder}`,
        sublabel: openCMEvent.locationSource === 'SGC/USGS'
          ? 'Epicentro del catálogo del USGS (ComCat).'
          : 'Ubicación aproximada (centroide de las estaciones que lo registraron); el catálogo no incluye el epicentro ni la profundidad real.',
      });
    }
    return pts;
  }, [source, openCMEvent, stations, mapStation]);

  const mapArea: MapArea | null = source === 'volcanic'
    ? { lat: GALERAS_CRATER.lat, lon: GALERAS_CRATER.lon, radiusMeters: 3000, color: COLOR_VOLCANIC, label: 'Zona de origen de la sismicidad volcánica según el OVSP' }
    : null;

  const mapView = source === 'volcanic'
    ? { center: [GALERAS_CRATER.lat, GALERAS_CRATER.lon] as [number, number], zoom: 13 }
    : { center: [1.35, -77.7] as [number, number], zoom: 7 };

  // Tectónico: encuadrar todas las ESTACIONES (fijo; no depende del evento
  // abierto, para que seleccionar un evento no vuelva a hacer zoom al mapa).
  const mapBounds = useMemo(() => {
    if (source !== 'tectonic' || !stations.length) return null;
    const lats = stations.map(s => s.latitude);
    const lons = stations.map(s => s.longitude);
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ] as [[number, number], [number, number]];
  }, [source, stations]);

  // ─── Handlers ───
  const loadGalerasWave = useCallback(async (ev: GalerasEvent) => {
    if (selectedId === ev.id) { setSelectedId(null); setGalerasWave(null); return; }
    setSelectedId(ev.id);
    setLoadingWave(true);
    setGalerasWave(null);
    try {
      // Cargar directo desde /data/galeras/{id}.json
      const res = await fetch(`/data/galeras/${ev.id}.json`);
      const data = await res.json();
      setGalerasWave(data.waveData);
    } catch (error) {
      console.warn(`[Explorer] Error cargando waveform para evento ${ev.id}:`, error);
    }
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
    // Clic en una ESTACIÓN del mapa (tectónico): filtra los eventos por los que
    // esa estación registró (toggle: volver a hacer clic lo quita). El cráter
    // del Galeras es solo informativo.
    if (id.startsWith('station-')) {
      if (source === 'tectonic') {
        const code = id.replace('station-', '');
        setMapStation(prev => (prev === code ? null : code));
      }
      return;
    }
    if (id === 'crater') return;
    const idx = filteredGaleras.findIndex(e => e.id === id);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1);
    const ev = filteredGaleras.find(e => e.id === id);
    if (ev) loadGalerasWave(ev);
  }, [filteredGaleras, loadGalerasWave, source]);

  const clearFilters = () => { setSearch(''); setSubtype('all'); setRegion('all'); setMinMag(''); setMapStation(null); };
  const hasFilters = search || subtype !== 'all' || region !== 'all' || minMag || mapStation;

  // ─── Conteos por subtipo (para chips). "Sin clasificar" = sin subtipo. ───
  const subtypeCounts = useMemo(() => {
    const counts: Record<string, number> = { none: 0 };
    for (const e of galeras) {
      if (!e.volcanic_subtype) counts.none += 1;
      else counts[e.volcanic_subtype] = (counts[e.volcanic_subtype] || 0) + 1;
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
            Explorador de registros sísmicos
            <Tooltip content="Ver guía" hoverOnly>
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
            Sismogramas triaxiales reales de Nariño del Volcán Galeras (OVSP) y la Red Sismológica Nacional (SGC)
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
              <div className="font-bold text-[#1A1A2E] text-sm">Sismos volcánicos</div>
              <div className="text-[11px] text-stone-400">Volcán Galeras · {galeras.length} eventos</div>
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
              <Activity size={20} />
            </div>
            <div>
              <div className="font-bold text-[#1A1A2E] text-sm">Sismos tectónicos</div>
              <div className="text-[11px] text-stone-400">Red Sismológica Nacional · {cm.length} eventos</div>
            </div>
          </button>

          {user && (
            <button
              data-tour="exp-fuente-upload"
              onClick={() => setSource('upload')}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                source === 'upload'
                  ? 'border-[#1A1A2E] bg-[#1A1A2E]/5 shadow-sm'
                  : 'border-stone-200/60 bg-white hover:border-[#1A1A2E]/30'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${source === 'upload' ? 'bg-[#1A1A2E] text-white' : 'bg-[#1A1A2E]/10 text-[#1A1A2E]'}`}>
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
          <MseedUpload onLoadRealData={onLoadRealData} onLoadToMap3d={onLoadMseedToMap3d} />
        )}

        {/* ═══ SUB-FILTROS CONTEXTUALES ═══ */}
        {source !== 'upload' && (
        <div data-tour="exp-filtros" className="bg-white rounded-xl border border-stone-200/60 p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar por fecha o estación…"
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

          {/* Chip del filtro por estación (clic en el mapa). Ocupa toda la fila. */}
          {source === 'tectonic' && mapStation && (
            <div className="w-full flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2D6A4F] bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 rounded-full px-2.5 py-1">
                <MapPin size={12} /> Eventos registrados por {mapStation}
                <button onClick={() => setMapStation(null)} aria-label="Quitar filtro de estación" className="hover:text-[#C4553A]"><X size={12} /></button>
              </span>
              <span className="text-[11px] text-stone-400">Haz clic en otra estación del mapa para cambiarla.</span>
            </div>
          )}
          {/* Pista: en tectónico el mapa es interactivo. */}
          {source === 'tectonic' && !mapStation && (
            <span className="w-full text-[11px] text-stone-400 mt-0.5">Tip: haz clic en una estación del mapa para ver solo sus eventos.</span>
          )}
        </div>
        )}

        {/* ═══ LAYOUT: LISTA + MAPA ═══ */}
        {source !== 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
          {/* Lista (en móvil va PRIMERO; el mapa queda debajo) */}
          <div data-tour="exp-lista" className="bg-white rounded-xl border border-stone-200/60 p-3 order-1">
            {loading ? (
              <div className="py-16"><VolcanoLoader size={44} label="Cargando registros…" /></div>
            ) : activeList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                {source === 'volcanic' ? <Flame size={36} className="text-stone-300 mb-3" /> : <Radio size={36} className="text-stone-300 mb-3" />}
                <p className="text-sm font-semibold text-stone-500">Ningún evento coincide con los filtros</p>
                <p className="text-xs text-stone-400 mt-1">Prueba ajustando la búsqueda o los filtros</p>
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
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1A1A2E]/[0.07] text-[#1A1A2E]">
                                  {g.volcanic_subtype_label ?? 'Sin clasificar'}
                                </span>
                              ) : (
                                <>
                                  <span className={`font-bold font-mono text-xs ${c.magnitude >= 5 ? 'text-[#C4553A]' : 'text-stone-700'}`}>ML {c.magnitude.toFixed(1)}</span>
                                  <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">{c.folder}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-stone-400 mt-0.5">
                              {isGal ? (
                                <>
                                  <span className="flex items-center gap-1"><Radio size={9} /> Est. {g.station}</span>
                                  <span className="flex items-center gap-1"><Clock size={9} /> {fmtDuration(g.duration)}</span>
                                  <span>{g.num_samples} muestras · {g.sampling_rate.toFixed(0)} Hz</span>
                                </>
                              ) : (
                                <span className="flex items-center gap-1"><Waves size={9} /> {c.stations.length} estaciones · {c.stations.map(s => s.station).join(', ')}</span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: COLOR_VOLCANIC }}>
                            {isOpen ? 'Ocultar' : (isGal ? 'Ver sismograma' : 'Ver estaciones')}
                          </span>
                        </button>

                        {/* Expandido: Galeras */}
                        {isOpen && isGal && (
                          <div className="px-2 pb-4 animate-fade-in">
                            {loadingWave ? (
                              <div className="py-6"><VolcanoLoader size={34} label="Cargando forma de onda…" /></div>
                            ) : galerasWave ? (
                              <div className="space-y-2">
                                <TriaxialPreview wave={galerasWave} duration={g.duration} physical="velocidad" />
                                <button
                                  onClick={() => galerasWave && onLoadRealData?.(galerasWave, `Galeras ${g.event_date} — ${g.volcanic_subtype_label ?? 'Sin clasificar'}`.trim(), { date: g.event_date, duration: g.duration, sourceType: 'volcanic' })}
                                  className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white text-xs font-bold py-2.5 rounded-lg btn-hover"
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
                              <div className="text-[11px] font-semibold text-stone-500 mb-2">Elige una estación para ver su sismograma</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                                      <span className="text-[9px] text-stone-400">{(st.original_sampling_rate ?? st.sampling_rate).toFixed(0)} Hz</span>
                                    </div>
                                    <div className="text-[10px] text-stone-500 mt-0.5">{instrumentLabelEs(st.instrument_type)}</div>
                                  </button>
                                ))}
                              </div>
                              {selectedStation && (
                                <div className="mt-3 pt-3 border-t border-stone-200">
                                  {loadingCMWave ? (
                                    <div className="py-5"><VolcanoLoader size={32} label="Cargando forma de onda…" /></div>
                                  ) : (cmWave && cmWave.event_id === c.id && cmWave.station === selectedStation.station) ? (
                                    <div className="space-y-2">
                                      <TriaxialPreview wave={cmWave.waveData} duration={cmWave.duration} physical={cmWave.physical_quantity} />
                                      {c.depthKm == null && (
                                        <p className="text-[10px] text-stone-400 leading-snug">
                                          Profundidad no disponible en el catálogo; se usa 15 km para la simulación.
                                        </p>
                                      )}
                                      <button
                                        onClick={() => onLoadRealData?.(
                                          cmWave.waveData,
                                          `CM ${c.date} ML ${c.magnitude.toFixed(1)}, Est. ${cmWave.station}`,
                                          { date: c.date, duration: cmWave.duration, sourceType: 'tectonic', magnitude: c.magnitude, depth: c.depthKm ?? 15, lat: c.latitude, lon: c.longitude },
                                        )}
                                        className="w-full flex items-center justify-center gap-2 bg-[#C4553A] text-white text-xs font-bold py-2.5 rounded-lg btn-hover"
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

          {/* Mapa (en móvil va DEBAJO de la lista) */}
          <div data-tour="exp-mapa" className="order-2 lg:sticky lg:top-20 h-[320px] lg:h-[calc(100vh-140px)]">
            <div className="bg-white rounded-xl border border-stone-200/60 p-2 h-full flex flex-col">
              <div className="flex flex-col gap-0.5 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className={source === 'volcanic' ? 'text-[#C4553A]' : 'text-[#2D6A4F]'} />
                  <span className="text-xs font-bold text-[#1A1A2E]">
                    {source === 'volcanic' ? 'Mapa del Volcán Galeras' : 'Mapa de estaciones'}
                  </span>
                </div>
                <span className="text-[10px] text-stone-400 pl-5">
                  {source === 'volcanic' ? 'Zona de origen' : 'Red del SGC en Nariño'}
                </span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden">
                <SeismicMap
                  points={mapPoints}
                  selectedId={source === 'volcanic' ? selectedId : null}
                  onSelect={handleMapSelect}
                  center={mapView.center}
                  zoom={mapView.zoom}
                  bounds={mapBounds}
                  area={mapArea}
                />
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
