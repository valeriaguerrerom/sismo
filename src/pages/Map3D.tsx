/**
 * Página "Mapa 3D" — visualización estilo Swaves de propagación de ondas
 * sísmicas en Nariño. Layout de 3 columnas: sismogramas (izq), escena 3D
 * (centro), controles + parámetros (der).
 *
 * Todo el cálculo (tiempos de viaje, sintéticos) lo hace el backend. Esta
 * página solo orquesta llamadas HTTP y dibuja. El epicentro se coloca sobre
 * el mapa (clic) o se precarga desde un evento.
 *
 * @module pages/Map3D
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, MapPin, Radio, Loader, AlertCircle, List, X, FileDown, Save, Check, HelpCircle,
} from '../lib/icons';
import { Tooltip } from '../components/ui/Tooltip';
import { VolcanoLoader } from '../components/ui/VolcanoLoader';
import { Scene3D } from '../components/map3d/Scene3D';
import { Legend } from '../components/map3d/Legend';
import { RecordSection } from '../components/map3d/RecordSection';
import { loadNarinoRing } from '../components/map3d/narinoSilhouette';
import {
  getStations, getTravelTimes, getSynthetic, getRayPath, getWaveform,
  getSceneGeometry, getSceneEvents,
  type Station, type StationTravelTime, type SyntheticResult, type TravelModel,
  type RayPathResult, type WaveformResult, type SceneGeometry, type SceneHypocenter,
  type SceneEventInput, ApiError,
} from '../lib/api3d';
import { loadCatalog, type CatalogRow } from '../lib/catalog';
import {
  filterEvents, hasActiveFilters, magnitudeLabel, assumedDepthKm,
  DEPTH_RANGES, EMPTY_FILTERS, type EventFilters, type DepthRangeId,
} from '../lib/eventFilters';
import { LOADER_FACTS, randomFactIndex } from '../lib/loaderFacts';
import { useAuth } from '../lib/authContext';
import { supabase } from '../lib/supabase';
import { startTour } from '../tours/useTour';
import { buildMapa3dSteps } from '../tours/mapa3d';
import {
  downloadMap3dPdf, downloadMap3dCsv, DEFAULT_MAP3D_OPTIONS,
  type Map3dReportData, type Map3dReportOptions,
} from '../lib/map3dReport';

interface CatalogEvent {
  id: string;
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  date: string;
  label: string;
  sourceType: 'tectonic' | 'volcanic';
  nStations: number;
}

/** Etiqueta legible por código de subtipo volcánico. */
const SUBTYPE_LABELS: Record<string, string> = {
  lp: 'Largo Período', to: 'Tornillo', tr: 'Tremor', va: 'Volcano-Tectónico',
};

/**
 * Traduce cualquier error del backend a un mensaje claro en español, según el
 * tipo. Nunca se muestra "Error 500" crudo: se explica qué pasó y qué hacer.
 */
function friendlyError(e: unknown, contexto: string): string {
  const err = e as ApiError;
  const status = typeof err?.status === 'number' ? err.status : -1;
  if (status === 0) {
    return 'No se pudo conectar con el servidor. Verifica que el backend esté activo e inténtalo de nuevo.';
  }
  if (status === 429) {
    return 'Demasiadas solicitudes seguidas. Espera unos segundos e inténtalo de nuevo.';
  }
  if (status === 422) {
    return `${contexto}: algún valor no es válido. Revisa los parámetros e inténtalo de nuevo.`;
  }
  if (status >= 500) {
    return `${contexto}: el servidor tuvo un problema procesando la solicitud. Vuelve a intentarlo en un momento.`;
  }
  // Mensaje del backend si viene en español; si no, uno genérico.
  return err?.message ? `${contexto}: ${err.message}` : `${contexto}: ocurrió un error inesperado.`;
}

interface Map3DProps {
  /** MiniSEED subido para asociar a su estación real (traza + estación). */
  mseedLoad?: { waveData: { time: number[]; north: number[]; east: number[]; vertical: number[] }; station: string; filename: string; sourceType: 'tectonic' | 'volcanic'; nonce: number } | null;
  /** Se llama tras consumir mseedLoad, para que App lo limpie. */
  onMseedLoadUsed?: () => void;
}

/** Página principal del Mapa 3D. */
export function Map3D({ mseedLoad, onMseedLoadUsed }: Map3DProps = {}) {
  // Datos base
  const [stations, setStations] = useState<Station[]>([]);
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  // Filas crudas del catálogo (CatalogRow) para filtrar con la lógica común.
  const [catalogRows, setCatalogRows] = useState<CatalogRow[]>([]);
  const [message, setMessage] = useState('Coloca un epicentro en el mapa o carga un evento.');

  // Geometría de escena calculada por el backend (posiciones preferidas).
  const [sceneGeometry, setSceneGeometry] = useState<SceneGeometry | null>(null);
  // Hipocentros del catálogo posicionados por el backend (esferas por profundidad).
  const [hypocenters, setHypocenters] = useState<SceneHypocenter[]>([]);
  const [depthRamp, setDepthRamp] = useState<{ label: string; color: string }[]>([]);

  // Estado sísmico
  const [epicenter, setEpicenter] = useState<{ lat: number; lon: number; depthKm: number } | null>(null);
  const [travelTimes, setTravelTimes] = useState<StationTravelTime[]>([]);
  const [model, setModel] = useState<TravelModel>('homogeneous');
  const [vp, setVp] = useState(3.5); // km/s (para anillos y homogéneo)
  const [vs, setVs] = useState(2.0);
  const [density, setDensity] = useState(2600);
  const [magnitude, setMagnitude] = useState(5.0);
  const [depthKm, setDepthKm] = useState(15);
  const [sourceType, setSourceType] = useState<'tectonic' | 'volcanic'>('tectonic');

  // Sintéticos por estación (componente vertical para las trazas)
  const [traces, setTraces] = useState<Record<string, SyntheticResult | null>>({});
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [stationDetail, setStationDetail] = useState<SyntheticResult | null>(null);
  const [rayPath, setRayPath] = useState<RayPathResult | null>(null);
  // Señal real por estación (waveforms): disponibilidad, si se muestra, y datos.
  const [realAvailable, setRealAvailable] = useState<Record<string, boolean>>({});
  const [showReal, setShowReal] = useState<Record<string, boolean>>({});
  const [realWave, setRealWave] = useState<Record<string, WaveformResult | null>>({});
  const [showTriaxial, setShowTriaxial] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);

  // Animación
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(5);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // UI
  const [showEventList, setShowEventList] = useState(false);
  const [loadingTT, setLoadingTT] = useState(false);
  // Índice del dato curioso que se muestra en el overlay de carga (rota solo).
  const [factIndex, setFactIndex] = useState(0);
  // Solicitud de carga pendiente de confirmar cuando ya hay una generación en
  // curso: el usuario decide si reemplazarla (cargar la nueva) o seguir con la
  // actual. Puede venir de un evento del catálogo o de un epicentro manual.
  type PendingRequest =
    | { kind: 'event'; ev: CatalogEvent }
    | { kind: 'epicenter'; lat: number; lon: number };
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  // Coordenadas del clic en el terreno pendientes de CONFIRMAR como epicentro.
  // Al hacer clic no se coloca de inmediato: primero se pregunta al usuario.
  const [epicenterPrompt, setEpicenterPrompt] = useState<{ lat: number; lon: number } | null>(null);
  // Reporte del Mapa 3D (modal de opciones + formato + guardado).
  const { user, markTourSeen } = useAuth();

  // ── Tour guiado (Driver.js) ──
  const tourRef = useRef(false); // evita relanzar el auto-tour
  const launchTour = useCallback(() => {
    startTour(buildMapa3dSteps(), { onDone: () => markTourSeen('mapa3d') });
  }, [markTourSeen]);

  // Lanza el tour la primera vez que el usuario entra al módulo.
  useEffect(() => {
    if (tourRef.current || !user) return;
    if (user.tours_vistos?.mapa3d) return;
    tourRef.current = true;
    const id = requestAnimationFrame(() => setTimeout(launchTour, 500));
    return () => cancelAnimationFrame(id);
  }, [user, launchTour]);

  const [showReport, setShowReport] = useState(false);
  const [reportOpts, setReportOpts] = useState<Map3dReportOptions>(DEFAULT_MAP3D_OPTIONS);
  const [reportFormat, setReportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [savingReport, setSavingReport] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  // El reporte debe GUARDARSE antes de poder descargarlo (CSV/PDF). Este flag
  // se pone en true cuando el guardado en "Mis Reportes" tuvo éxito. Para
  // usuarios sin sesión no hay guardado, así que se permite descargar directo.
  const [reportSaved, setReportSaved] = useState(false);
  // Contenedor de la escena 3D (para capturar su canvas en el reporte PDF).
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  // Silueta del departamento de Nariño para el mapa del reporte (se carga una vez).
  const narinoRingRef = useRef<[number, number][] | null>(null);

  /**
   * Captura el canvas WebGL de la escena 3D como PNG (data URL).
   * Requiere preserveDrawingBuffer en el renderer (activado en Scene3D).
   * Devuelve null si no encuentra el canvas o falla la captura.
   */
  const captureScene = useCallback((): string | null => {
    const canvas = sceneContainerRef.current?.querySelector('canvas');
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('[Map3D] No se pudo capturar la escena 3D:', e);
      return null;
    }
  }, []);
  const [viewCommand, setViewCommand] = useState<{ view: 'north' | 'cut' | 'top' | 'fit'; nonce: number } | null>(null);
  const setView = (view: 'north' | 'cut' | 'top' | 'fit') => setViewCommand({ view, nonce: Date.now() });
  // Filtros de la lista de eventos.
  // Filtros de la lista de eventos (misma lógica que el Explorador, en
  // src/lib/eventFilters.ts). Orden aparte (no es un filtro).
  const [evFilters, setEvFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [evSort, setEvSort] = useState<'date' | 'magnitude'>('date');
  const [panelsCollapsed, setPanelsCollapsed] = useState(false);
  // Modo "colocar epicentro": resalta el mapa y cambia la ayuda superior para
  // indicar que el usuario ya puede hacer clic en el terreno. Se activa desde el
  // estado vacío del panel de sismogramas y se apaga al colocar un epicentro.
  const [placingEpicenter, setPlacingEpicenter] = useState(false);

  // Eventos filtrados y ordenados para la lista "Cargar evento". Usa la lógica
  // de filtros COMPARTIDA con el Explorador (src/lib/eventFilters.ts) sobre las
  // filas crudas del catálogo, y luego ordena por fecha o magnitud.
  const filteredRows = useMemo(() => {
    const rows = filterEvents(catalogRows, evFilters);
    rows.sort((a, b) => evSort === 'magnitude'
      ? (b.magnitude ?? 0) - (a.magnitude ?? 0)
      : (b.event_date + b.event_time).localeCompare(a.event_date + a.event_time));
    return rows;
  }, [catalogRows, evFilters, evSort]);

  // Mapa id → CatalogEvent (para cargar en la escena al elegir una fila).
  const eventById = useMemo(() => {
    const m = new Map<string, CatalogEvent>();
    for (const e of events) m.set(e.id, e);
    return m;
  }, [events]);

  // Tiempo máximo del eje de sismogramas = mayor tS + margen
  const maxTime = useMemo(() => {
    const maxTs = travelTimes.reduce((m, t) => Math.max(m, t.tS ?? 0), 0);
    return Math.max(20, Math.ceil(maxTs * 1.15));
  }, [travelTimes]);

  // ── Carga inicial: estaciones + catálogo de eventos (seismic_events) ──
  // La lista de eventos viene del catálogo (misma fuente que Explorer y Home).
  useEffect(() => {
    getStations()
      .then(setStations)
      .catch((e) => setMessage(friendlyError(e, 'No se pudieron cargar las estaciones')));

    // Silueta de Nariño para el mapa del reporte PDF (mismo polígono del 3D).
    loadNarinoRing().then(ring => { narinoRingRef.current = ring; }).catch(() => {});

    // Geometría de escena calculada por el backend. Si falla, Scene3D usa el
    // fallback local de domain.ts (regla: el cálculo vive en el backend).
    getSceneGeometry()
      .then(setSceneGeometry)
      .catch(() => setSceneGeometry(null));

    async function loadEvents() {
      const catalog = await loadCatalog();
      setCatalogRows(catalog);
      const out: CatalogEvent[] = catalog.map(r => {
        const isVolc = r.event_type === 'volcanic';
        const subLabel = r.volcanic_subtype ? SUBTYPE_LABELS[r.volcanic_subtype] ?? '' : '';
        return {
          id: r.event_id,
          lat: r.latitude,
          lon: r.longitude,
          depthKm: isVolc ? 5 : 15, // profundidad asumida para la escena (no hay dato real)
          magnitude: r.magnitude ?? (isVolc ? 4.5 : 0),
          date: r.event_date,
          label: isVolc
            ? `Galeras · ${subLabel} · ${r.event_date}`.replace('·  ·', '·')
            : `M${r.magnitude ?? '?'} · ${r.event_date} · ${r.region ?? ''}`,
          sourceType: isVolc ? 'volcanic' : 'tectonic',
          nStations: r.station_count,
        };
      });
      setEvents(out);

      // Posicionar los eventos del catálogo como hipocentros (backend calcula
      // x/y/z, radio y color por profundidad). Son distintos del epicentro activo.
      try {
        const input: SceneEventInput[] = out.map(e => ({
          id: e.id,
          lat: e.lat,
          lon: e.lon,
          depth_km: e.depthKm,
          magnitude: e.magnitude,
          event_type: e.sourceType,
          label: e.label,
        }));
        const res = await getSceneEvents(input);
        setHypocenters(res.hypocenters);
        setDepthRamp(res.depth_color_ramp);
      } catch {
        setHypocenters([]);
        setDepthRamp([]);
      }
    }
    loadEvents();
  }, []);

  // ── Recalcular tiempos de viaje cuando cambia epicentro / modelo / velocidades ──
  const recomputeTravelTimes = useCallback(async (epi: { lat: number; lon: number; depthKm: number }) => {
    setLoadingTT(true);
    setMessage('Calculando tiempos de viaje...');
    try {
      const res = await getTravelTimes({
        lat: epi.lat, lon: epi.lon, depth_km: epi.depthKm,
        vp_km_s: vp, vs_km_s: vs, model,
      });
      setTravelTimes(res.estaciones);
      setMessage('Tiempos de viaje calculados. Generando sismogramas…');
    } catch (e) {
      setMessage(friendlyError(e, 'No se pudieron calcular los tiempos de viaje'));
      setTravelTimes([]);
    } finally {
      setLoadingTT(false);
    }
  }, [vp, vs, model]);

  useEffect(() => {
    if (epicenter) recomputeTravelTimes(epicenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicenter, model]);

  // ── Cargar sintéticos por estación, de forma INCREMENTAL ──
  // Cada estación actualiza `traces` y `loadingTraces` en cuanto termina, para
  // mostrar una barra de progreso real. Un `runId` garantiza que solo la última
  // generación escriba estado (evita que una carga vieja pise a la nueva).
  const [loadingTraces, setLoadingTraces] = useState<Set<string>>(new Set());
  const runIdRef = useRef(0);

  const loadSynthetics = useCallback(async (tts: StationTravelTime[]) => {
    const runId = ++runIdRef.current;
    setLoadingTraces(new Set(tts.map(t => t.code)));
    setTraces({}); // limpiar previos para evitar trazas viejas
    // Lanzar todas en paralelo, pero aplicar cada resultado en cuanto llega.
    await Promise.all(tts.map(async (tt) => {
      let syn: SyntheticResult | null = null;
      try {
        syn = await getSynthetic({
          vp: vp * 1000, vs: vs * 1000, density, magnitude, depth_km: depthKm,
          source_type: sourceType, distance_km: tt.distancia_hipocentral_km,
          nx: 160, nz: 120, dt_max_s: 0.02,
        });
      } catch {
        syn = null;
      }
      // Descartar si ya empezó otra generación (la última gana).
      if (runId !== runIdRef.current) return;
      setTraces(prev => ({ ...prev, [tt.code]: syn }));
      setLoadingTraces(prev => {
        const next = new Set(prev);
        next.delete(tt.code);
        return next;
      });
    }));
  }, [vp, vs, density, magnitude, depthKm, sourceType]);

  useEffect(() => {
    if (travelTimes.length > 0) {
      loadSynthetics(travelTimes);
      // Seleccionar por defecto la estación más cercana (define el corte).
      const nearest = travelTimes[0]?.code;
      if (nearest && !selectedStation) selectStation(nearest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelTimes]);

  // ── Consumir un MiniSEED subido desde el Explorador ──
  // La traza se asocia a su estación real (que tiene coordenadas en el catálogo)
  // como "señal real cargada por el usuario". NO trae epicentro: por eso se pide
  // al usuario colocar uno (clic en el terreno) para ver la propagación. La traza
  // se superpone en su estación igual que la señal real de un evento del catálogo.
  const [uploadedStation, setUploadedStation] = useState<string | null>(null);
  useEffect(() => {
    if (!mseedLoad) return;
    const code = mseedLoad.station.toUpperCase();
    const wd = mseedLoad.waveData;
    // Convertir waveData {time,north,east,vertical} al formato WaveformResult.
    const wf: WaveformResult = {
      event_id: 'mseed-subido',
      station: code,
      t: wd.time,
      canales: { Z: wd.vertical, N: wd.north, E: wd.east },
      fs: wd.time.length > 1 ? 1 / (wd.time[1] - wd.time[0]) : 100,
      starttime_utc: '',
      filtro: { freqmin: 1, freqmax: 10 },
    };
    setSourceType(mseedLoad.sourceType);
    if (mseedLoad.sourceType === 'volcanic') { setVp(3.0); setVs(1.7); setDensity(2500); }
    setRealWave(w => ({ ...w, [code]: wf }));
    setRealAvailable(a => ({ ...a, [code]: true }));
    setShowReal(s => ({ ...s, [code]: true }));
    setSelectedStation(code);
    setUploadedStation(code);
    setMessage(`Registro cargado en ${code}. Coloca un epicentro en el terreno para ver la propagación.`);
    onMseedLoadUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mseedLoad?.nonce]);

  // ── Reloj de animación ──
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    lastTsRef.current = performance.now();
    const tick = (ts: number) => {
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setElapsed(prev => {
        const next = prev + dt * speed;
        if (next >= maxTime) { setPlaying(false); return maxTime; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, maxTime]);

  // ── Handlers ──
  const resetRealState = () => {
    setRealAvailable({}); setShowReal({}); setRealWave({}); setShowTriaxial(false);
  };

  const applyEpicenter = (lat: number, lon: number) => {
    setLoadingTT(true); // mostrar el loader de inmediato (evita el parpadeo del estado vacío)
    setEpicenter({ lat, lon, depthKm });
    setCurrentEventId(null); // epicentro manual: sin registro real asociado
    setPlacingEpicenter(false); // ya se colocó: salir del modo "colocar"
    resetRealState();
    setElapsed(0);
    setPlaying(false);
  };

  const applyEvent = (ev: CatalogEvent) => {
    setSourceType(ev.sourceType);
    setMagnitude(ev.magnitude);
    setDepthKm(ev.depthKm);
    if (ev.sourceType === 'volcanic') { setVp(3.0); setVs(1.7); setDensity(2500); }
    setLoadingTT(true); // loader inmediato (evita el parpadeo del estado vacío)
    setEpicenter({ lat: ev.lat, lon: ev.lon, depthKm: ev.depthKm });
    setCurrentEventId(ev.id);
    setPlacingEpicenter(false);
    resetRealState();
    setElapsed(0);
    setPlaying(false);
    setShowEventList(false);
    setMessage(`Evento cargado: ${ev.label}`);
    setView('fit'); // transición de cámara suave al encuadre
  };

  // Wrappers públicos: si hay una generación en curso, piden confirmación antes
  // de reemplazarla; si no, aplican de inmediato. `calculatingNow` se evalúa en
  // el momento del clic (no al crear el componente).
  const loadEvent = (ev: CatalogEvent) => {
    if (isCalculating) {
      setShowEventList(false);
      setPendingRequest({ kind: 'event', ev });
      return;
    }
    applyEvent(ev);
  };

  // Un clic en el terreno NO coloca el epicentro de inmediato: abre una
  // confirmación con las coordenadas para que el usuario decida (sí/no).
  const placeEpicenter = (lat: number, lon: number) => {
    setEpicenterPrompt({ lat, lon });
  };

  // Confirma el epicentro propuesto por el clic. Si hay una generación en curso,
  // se encola como pendingRequest (misma lógica que cargar un evento).
  const confirmEpicenter = () => {
    const p = epicenterPrompt;
    setEpicenterPrompt(null);
    if (!p) return;
    if (isCalculating) {
      setPendingRequest({ kind: 'epicenter', lat: p.lat, lon: p.lon });
      return;
    }
    applyEpicenter(p.lat, p.lon);
  };

  // Confirmar el reemplazo: aplica la solicitud pendiente y arranca la nueva
  // generación (el runId de loadSynthetics descarta la carga anterior).
  const confirmPending = () => {
    const req = pendingRequest;
    setPendingRequest(null);
    if (!req) return;
    if (req.kind === 'event') applyEvent(req.ev);
    else applyEpicenter(req.lat, req.lon);
  };

  const selectStation = (code: string) => {
    setSelectedStation(code);
    setStationDetail(traces[code] ?? null);
    // Traer la trayectoria del rayo para el corte (según el modelo activo).
    if (epicenter) {
      getRayPath({ lat: epicenter.lat, lon: epicenter.lon, depth_km: epicenter.depthKm, station: code, model })
        .then(setRayPath)
        .catch(() => setRayPath(null));
    }
  };

  const toggleReal = async (code: string) => {
    // Si ya lo mostramos, volver a sintético.
    if (showReal[code]) { setShowReal(s => ({ ...s, [code]: false })); return; }
    if (!currentEventId) { setRealAvailable(a => ({ ...a, [code]: false })); return; }
    // Pedir waveform real si no lo tenemos aún.
    if (realWave[code] === undefined) {
      try {
        const wf = await getWaveform(currentEventId, code, { freqmin: 1, freqmax: 10 });
        setRealWave(w => ({ ...w, [code]: wf }));
        setRealAvailable(a => ({ ...a, [code]: true }));
        setShowReal(s => ({ ...s, [code]: true }));
      } catch (e) {
        const err = e as ApiError;
        setRealAvailable(a => ({ ...a, [code]: false }));
        setRealWave(w => ({ ...w, [code]: null }));
        if (err.status === 404) {
          setMessage('Esta estación no tiene señal real archivada para este evento.');
        } else {
          setMessage(friendlyError(e, 'No se pudo cargar la señal real'));
        }
      }
    } else if (realWave[code]) {
      setShowReal(s => ({ ...s, [code]: true }));
    } else {
      setRealAvailable(a => ({ ...a, [code]: false }));
    }
  };

  const reset = () => { setElapsed(0); setPlaying(false); };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  // ── Reporte del Mapa 3D ──
  /** Arma los datos del reporte con el estado actual (epicentro, tiempos, etc.). */
  const buildReportData = useCallback((): Map3dReportData | null => {
    if (!epicenter) return null;
    const ev = events.find(e => e.id === currentEventId) ?? null;
    const fecha = new Date().toISOString().slice(0, 10);
    const title = ev
      ? `Mapa 3D · ${ev.label}`
      : `Mapa 3D · ${epicenter.lat.toFixed(2)}, ${epicenter.lon.toFixed(2)} · ${fecha}`;

    // Sismograma de la estación seleccionada (si hay y se pidió esa sección).
    const syn = selectedStation ? traces[selectedStation] : null;
    const seismogram = syn && selectedStation
      ? {
          station: selectedStation,
          t: syn.t, north: syn.north, east: syn.east, vertical: syn.vertical,
          tP: syn.tP_detectado, tS: syn.tS_detectado,
        }
      : null;

    return {
      title,
      author: user?.full_name || user?.email,
      createdAt: new Date().toISOString(),
      eventLabel: ev?.label ?? null,
      epicenter,
      magnitude,
      sourceType,
      model,
      medium: { vp, vs, density },
      stations: travelTimes.map(t => ({
        code: t.code, name: t.name, approx: t.approx,
        latitude: t.latitude, longitude: t.longitude,
        distancia_epicentral_km: t.distancia_epicentral_km,
        distancia_hipocentral_km: t.distancia_hipocentral_km,
        distancia_grados: t.distancia_grados,
        azimut: t.azimut, tP: t.tP, tS: t.tS, tS_menos_tP: t.tS_menos_tP,
      })),
      seismogram,
      selectedStation,
      // Captura de la escena 3D en el momento de generar el reporte.
      sceneImage: captureScene(),
      // Silueta del departamento para el mapa de vista superior.
      outline: narinoRingRef.current,
      // Trazas de todas las estaciones con señal (componente vertical) para el
      // registro sísmico multi-estación. La distancia sirve para ordenarlas.
      traces: travelTimes
        .map(tt => {
          const s = traces[tt.code];
          if (!s) return null;
          return {
            code: tt.code,
            dist: tt.distancia_epicentral_km,
            t: s.t,
            values: s.vertical,
            tP: s.tP_detectado,
            tS: s.tS_detectado,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    };
  }, [epicenter, events, currentEventId, selectedStation, traces, user, magnitude, sourceType, model, vp, vs, density, travelTimes, captureScene]);

  /** Descarga el reporte en el formato elegido (PDF o CSV). */
  const handleDownloadReport = () => {
    const data = buildReportData();
    if (!data) return;
    if (reportFormat === 'pdf') downloadMap3dPdf(data, reportOpts);
    else downloadMap3dCsv(data, reportOpts);
  };

  /** Guarda el reporte en "Mis Reportes" (Supabase) para regenerarlo luego. */
  const handleSaveReport = async () => {
    const data = buildReportData();
    if (!data || !supabase || !user) return;
    setSavingReport(true);
    setReportMsg(null);
    // Se guarda con report_type='map3d' + los datos y opciones para regenerar.
    // La captura de la escena 3D (sceneImage) NO se persiste: es una imagen
    // pesada que solo tiene sentido en la descarga inmediata; al regenerar
    // desde "Mis Reportes" no hay escena en pantalla que capturar.
    const dataToStore = { ...data, sceneImage: null };
    const { error } = await supabase.from('simulation_reports').insert({
      user_id: user.id,
      title: data.title,
      params: { sourceType, magnitude, depth: epicenter?.depthKm, model, vp, vs, density },
      results: { report_type: 'map3d', map3d: dataToStore, options: reportOpts },
    });
    if (error) {
      setReportMsg('No se pudo guardar. Inténtalo de nuevo.');
      console.error('Guardar reporte Mapa 3D:', error.message);
    } else {
      setReportMsg('¡Guardado! Ya puedes descargar el CSV o el PDF, y verlo en "Mis Reportes".');
      setReportSaved(true); // habilita la descarga
    }
    setSavingReport(false);
  };

  // Nº de estaciones con señal (sintético o real) para el título.
  const stationsWithSignal = travelTimes.filter(tt => traces[tt.code]).length;

  // ¿Sigue calculando? True mientras se resuelven tiempos de viaje o mientras
  // queda alguna traza sintética por generar. Con esto bloqueamos "Reproducir"
  // y mostramos un aviso de carga, para que no se reproduzca sin ondas.
  const isCalculating = loadingTT || loadingTraces.size > 0;
  const canPlay = !!epicenter && !isCalculating && stationsWithSignal > 0;

  // ── Progreso legible de la generación (para el overlay a pantalla completa) ──
  const genTotal = travelTimes.length;
  const genDone = stationsWithSignal;
  const genPercent = genTotal > 0 ? Math.round((genDone / genTotal) * 100) : 0;
  // Paso actual: primero los tiempos de viaje; luego la estación más cercana que
  // aún está en cola (loadingTraces conserva las pendientes en orden de distancia).
  const nextPending = travelTimes.find(tt => loadingTraces.has(tt.code));
  const genStepLabel = loadingTT
    ? 'Calculando tiempos de viaje…'
    : nextPending
      ? `Generando estación ${nextPending.code}${nextPending.name ? `, ${nextPending.name}` : ''}…`
      : 'Preparando la reproducción…';

  // Al terminar de generar, arrancar la reproducción automáticamente desde el
  // inicio (autoplay) y dejar un mensaje final para no dejar "Generando…" pegado.
  const wasCalcRef = useRef(false);
  useEffect(() => {
    if (isCalculating) {
      wasCalcRef.current = true;
      return;
    }
    // Terminó de generar (venía de calcular y ahora ya se puede reproducir).
    if (wasCalcRef.current && canPlay) {
      wasCalcRef.current = false;
      setMessage(`Listo, ${stationsWithSignal} ${stationsWithSignal === 1 ? 'estación' : 'estaciones'} con señal`);
      // Autoplay: arrancar la reproducción desde el inicio en cuanto está lista.
      setElapsed(0);
      const play = setTimeout(() => setPlaying(true), 600);
      return () => clearTimeout(play);
    }
  }, [isCalculating, canPlay, stationsWithSignal]);

  // Rotar el dato curioso del overlay cada ~4.5 s mientras se está generando.
  // Al empezar una carga arranca desde un dato aleatorio para variar.
  useEffect(() => {
    if (!isCalculating) return;
    setFactIndex(randomFactIndex());
    const id = setInterval(() => {
      setFactIndex(prev => (prev + 1) % LOADER_FACTS.length);
    }, 4500);
    return () => clearInterval(id);
  }, [isCalculating]);

  // ¿El mensaje de estado es un error? (para mostrar el ícono de alerta).
  const isErrorMessage = /no se pudo|no se pudieron|problema|demasiadas|inválid|no es válido/i.test(message);

  const loadedEvent = events.find(e => e.id === currentEventId) ?? null;
  const magType = sourceType === 'volcanic' ? 'MD' : 'ML';
  // Descripción del evento sin puntos medios (se separan los campos con comas).
  const eventWhere = loadedEvent
    ? loadedEvent.label.split(' · ').slice(1).join(', ')
    : `${epicenter?.lat.toFixed(2)}°, ${epicenter?.lon.toFixed(2)}°`;
  const currentEventTitle = epicenter
    ? [
        eventWhere,
        `${magType} ${magnitude.toFixed(1)}`,
        `Prof. ${epicenter.depthKm} km`,
        `${stationsWithSignal}/${travelTimes.length} estaciones con señal`,
      ].join(', ')
    : 'Sin evento seleccionado';

  return (
    <div className="min-h-screen bg-[#0a0e1a] pt-16 text-stone-200">
      {/* Overlay de generación a pantalla completa: se mantiene durante TODA la
          generación (no solo hasta la primera traza) para que el usuario espere
          en la pantalla principal. Muestra el volcán, el paso actual, la barra
          de progreso y un dato curioso rotativo. Al terminar desaparece y la
          animación arranca sola. */}
      {isCalculating && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#0a0e1a]/85 backdrop-blur-sm px-6">
          <div className="w-full max-w-md flex flex-col items-center text-center">
            <VolcanoLoader size={72} dark label="" />
            <h3 className="mt-5 text-xl font-bold text-stone-100">Generando sismogramas…</h3>
            <p className="mt-1 text-[12px] text-[#D4A853] min-h-[18px]">{genStepLabel}</p>
            {genTotal > 0 && (
              <div className="mt-5 w-full max-w-sm">
                <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1.5">
                  <span><span className="font-mono">{genDone}/{genTotal}</span> estaciones</span>
                  <span className="font-mono">{genPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#C4553A] to-[#D4A853] transition-all duration-300 ease-out"
                    style={{ width: `${genPercent}%` }}
                  />
                </div>
              </div>
            )}
            {/* Dato curioso rotativo mientras carga (se entretiene la espera). */}
            <div className="mt-7 w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] font-semibold text-[#C4553A] mb-1">¿Sabías que…?</p>
              <p key={factIndex} className="text-[12px] leading-snug text-stone-300 animate-fade-in">
                {LOADER_FACTS[factIndex]}
              </p>
            </div>
            <p className="mt-5 text-[10px] text-stone-500">Se reproducirá automáticamente al terminar</p>
          </div>
        </div>
      )}

      {/* Barra superior */}
      <div className="border-b border-white/10 px-4 py-2.5">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <h1 className="text-sm font-bold text-stone-100 flex items-center gap-2">
            <span className="text-[#C4553A]">◉</span> Mapa 3D de propagación de ondas en Nariño
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-stone-400 hidden md:inline">{currentEventTitle}</span>
            {/* Botón de ayuda: repite el tour guiado cuando el usuario quiera. */}
            <Tooltip content="Ver guía" hoverOnly>
              <button
                type="button"
                onClick={launchTour}
                aria-label="Ver guía"
                className={`flex items-center justify-center w-6 h-6 rounded-full border border-white/10 text-stone-400 hover:text-[#C4553A] hover:border-[#C4553A]/40 transition-colors ${user && !user.tours_vistos?.mapa3d ? 'help-pulse' : ''}`}
              >
                <HelpCircle size={14} />
              </button>
            </Tooltip>
            <button
              onClick={() => setPanelsCollapsed(c => !c)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-stone-300"
              title="Mostrar u ocultar los paneles laterales"
            >
              {panelsCollapsed ? 'Mostrar paneles' : 'Ocultar paneles'}
            </button>
          </div>
        </div>
      </div>

      <div className={`max-w-[1600px] mx-auto grid grid-cols-1 gap-3 p-3 ${
        panelsCollapsed
          ? 'lg:grid-cols-1'
          : travelTimes.length === 0
            // Sin datos: panel de sismogramas más angosto para dar más mapa.
            ? 'lg:grid-cols-[220px_1fr_300px]'
            : 'lg:grid-cols-[320px_1fr_300px]'
      }`}>
        {/* ── IZQUIERDA: Sismogramas ── */}
        {/* Columna flex para que la sección de registros ocupe TODA la altura
            disponible del panel (misma altura que el mapa y los controles). */}
        <div data-tour="m3d-sismogramas" className={`bg-black/30 rounded-xl border border-white/10 p-3 flex flex-col ${panelsCollapsed ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <Radio size={13} className="text-[#C4553A]" />
            <h2 className="text-xs font-bold text-stone-200">Sismogramas</h2>
            {travelTimes.length > 0 && (
              <span className="text-[10px] text-stone-500 ml-auto">ordenados por distancia</span>
            )}
          </div>
          {/* Barra de progreso de la generación (estaciones listas / total). */}
          {isCalculating && travelTimes.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-[9px] text-[#eab308] mb-1">
                <span className="flex items-center gap-1"><Loader size={9} className="animate-spin" /> Generando sismogramas…</span>
                <span className="font-mono">{stationsWithSignal}/{travelTimes.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#C4553A] to-[#D4A853] transition-all duration-300 ease-out"
                  style={{ width: `${Math.round((stationsWithSignal / travelTimes.length) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {travelTimes.length === 0 ? (
            // Estado vacío: esqueleto atenuado de fondo + tarjeta centrada.
            // Al llegar datos, ambos desaparecen (la condición cambia a la rama
            // de abajo); la tarjeta usa animate-fade-in para una entrada suave.
            <div className="relative flex-1 min-h-0">
              {/* Fondo: boceto de la sección de registros (no son datos reales). */}
              <div className="absolute inset-0">
                <RecordSection
                  skeleton
                  stations={[]}
                  traces={{}}
                  elapsed={0}
                  maxTime={30}
                  selectedStation={null}
                />
              </div>
              {/* Tarjeta centrada con el mensaje y las dos acciones. */}
              <div className="absolute inset-0 flex items-center justify-center p-3">
                {loadingTT ? (
                  <VolcanoLoader size={40} dark label="Calculando tiempos de viaje…" />
                ) : (
                  <div className="w-full max-w-[240px] rounded-2xl border border-white/15 bg-[#0f1420]/85 backdrop-blur-sm px-4 py-5 text-center shadow-xl animate-fade-in">
                    <div className="flex justify-center mb-3">
                      <div className="w-11 h-11 rounded-full bg-[#C4553A]/15 flex items-center justify-center">
                        <Radio size={20} className="text-[#C4553A]" />
                      </div>
                    </div>
                    <p className="text-[13px] text-stone-100 font-semibold mb-1">Aún no hay sismogramas</p>
                    <p className="text-[11px] text-stone-400 leading-snug mb-4">
                      Carga un evento del catálogo o coloca un epicentro en el mapa.
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setShowEventList(true)}
                        className="w-full flex items-center justify-center gap-1.5 bg-[#C4553A] text-white text-[12px] font-bold py-2.5 rounded-lg"
                      >
                        <List size={14} /> Cargar un evento
                      </button>
                      <button
                        onClick={() => { setPlacingEpicenter(true); setView('top'); }}
                        className={`w-full flex items-center justify-center gap-1.5 text-[12px] font-bold py-2.5 rounded-lg border transition-colors ${
                          placingEpicenter
                            ? 'bg-[#2D6A4F]/20 border-[#2D6A4F] text-[#8fd3b4]'
                            : 'bg-white/5 border-white/15 text-stone-200'
                        }`}
                      >
                        <MapPin size={14} /> Colocar epicentro en el mapa
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // flex-1 + min-h-0 permite que el SVG (altura 100%) se estire al
            // alto real del panel; el ResizeObserver de RecordSection reacciona.
            <div className="relative flex-1 min-h-0">
              <RecordSection
                stations={travelTimes}
                traces={traces}
                loadingTraces={loadingTraces}
                elapsed={elapsed}
                maxTime={maxTime}
                selectedStation={selectedStation}
                onSelectStation={selectStation}
              />
            </div>
          )}
        </div>

        {/* ── CENTRO: Escena 3D ── */}
        <div
          ref={sceneContainerRef}
          data-tour="m3d-escena"
          className={`relative bg-black/30 rounded-xl overflow-hidden min-h-[560px] lg:min-h-[640px] transition-all ${
            placingEpicenter ? 'border-2 border-[#2D6A4F] ring-2 ring-[#2D6A4F]/40' : 'border border-white/10'
          }`}
        >
          <Scene3D
            stations={stations}
            epicenter={epicenter}
            travelTimes={travelTimes}
            vpKmS={vp}
            vsKmS={vs}
            elapsed={elapsed}
            selectedStation={selectedStation}
            rayPath={rayPath}
            viewCommand={viewCommand}
            sceneGeometry={sceneGeometry}
            hypocenters={hypocenters}
            model={model}
            onSelectStation={selectStation}
            onPlaceEpicenter={placeEpicenter}
          />
          <Legend scaleBar={sceneGeometry?.scale_bar ?? null} domainWidthKm={sceneGeometry?.domain_width_km ?? null} depthRamp={depthRamp} />
          <div data-tour="m3d-hint" className={`absolute top-2 left-2 z-10 text-[10px] rounded px-2 py-1 transition-colors ${
            placingEpicenter ? 'text-white bg-[#2D6A4F]/80 font-semibold' : 'text-stone-400 bg-black/40'
          }`}>
            {placingEpicenter
              ? 'Haz clic en el terreno para colocar el epicentro'
              : 'Clic en el terreno para colocar el epicentro, clic en ▲ para seleccionar una estación'}
          </div>
          {/* Aviso cuando hay un MiniSEED subido asociado a una estación: su traza
              es dato real, pero el epicentro es un supuesto del usuario. */}
          {uploadedStation && (
            <div className="absolute top-2 right-2 z-10 max-w-[260px] text-[10px] text-stone-200 bg-[#C4553A]/80 rounded px-2.5 py-1.5 leading-snug">
              Registro cargado por ti en <b>{uploadedStation}</b>. Su traza es real; el
              <b> epicentro que coloques es un supuesto</b> para ver la propagación.
            </div>
          )}
          {/* Botones de vista de cámara */}
          <div data-tour="m3d-vistas" className="absolute bottom-3 left-3 z-10 flex gap-1.5">
            {([
              ['north', 'Norte', 'Mira el bloque de frente, desde el norte (ves la superficie y la profundidad).'],
              ['cut', 'Corte', 'Corte vertical hacia la estación seleccionada: muestra cómo baja la onda con la profundidad.'],
              ['top', 'Superior', 'Vista desde arriba, como un mapa: ubica el epicentro y las estaciones.'],
            ] as const).map(([v, label, help]) => (
              <Tooltip key={v} content={help} hoverOnly>
                <button
                  onClick={() => setView(v)}
                  className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/15 text-stone-200 hover:bg-black/70"
                >
                  {label}
                </button>
              </Tooltip>
            ))}
          </div>

          {/* Panel triaxial desplegable (N/E/Z con tP/tS) */}
          {showTriaxial && selectedStation && (
            <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/70 backdrop-blur-sm border-t border-white/10 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-stone-200">
                  Panel triaxial, {selectedStation}, {showReal[selectedStation] ? 'señal real (1 a 10 Hz)' : 'sintético FDM'}
                </span>
                <button onClick={() => setShowTriaxial(false)} aria-label="Cerrar panel triaxial" title="Cerrar" className="text-stone-400"><X size={14} /></button>
              </div>
              <TriaxialTraces
                syn={traces[selectedStation] ?? null}
                real={showReal[selectedStation] ? realWave[selectedStation] ?? null : null}
              />
            </div>
          )}
        </div>

        {/* ── DERECHA: Controles ── */}
        <div data-tour="m3d-controles" className={`bg-black/30 rounded-xl border border-white/10 p-3 space-y-3 ${panelsCollapsed ? 'hidden' : ''}`}>
          {/* Transporte: botón Reproducir a ANCHO COMPLETO (su texto nunca se
              corta) y, al lado, el botón de reiniciar como ícono. */}
          <div data-tour="m3d-transporte">
            <h2 className="text-xs font-bold text-stone-200 mb-2">Controles</h2>
            <div className="flex items-stretch gap-2">
              <Tooltip
                content={
                  isCalculating
                    ? 'Espera a que terminen de generarse los sismogramas.'
                    : 'Coloca un epicentro o carga un evento primero.'
                }
                hoverOnly
                disabled={canPlay}
                className="flex-1 min-w-0"
                block
              >
                <button
                  onClick={() => setPlaying(p => !p)}
                  disabled={!canPlay}
                  className={`w-full flex items-center justify-center gap-1.5 whitespace-nowrap bg-[#C4553A] text-white text-xs font-bold py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${canPlay && !playing ? 'ready-glow' : ''}`}
                >
                  {isCalculating ? (
                    <><Loader size={13} className="animate-spin" /> Generando…</>
                  ) : (
                    <>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? 'Pausar' : 'Reproducir'}</>
                  )}
                </button>
              </Tooltip>
              <button onClick={reset} aria-label="Reiniciar la reproducción" title="Volver al inicio de la reproducción" className="shrink-0 px-3 rounded-lg bg-white/5 border border-white/10 text-stone-300">
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {/* Estado actual, en una línea natural (sin etiqueta "MESSAGE"). */}
          <div className="bg-black/40 rounded-lg px-2.5 py-2 border border-white/10">
            <div className="text-[11px] text-stone-300 flex items-start gap-1.5">
              {loadingTT && <Loader size={11} className="animate-spin flex-shrink-0 mt-0.5" />}
              {isErrorMessage && <AlertCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />}
              <span className="leading-snug">{message}</span>
            </div>
          </div>

          {/* Tiempo transcurrido (la velocidad ya la indican los botones ×). */}
          <div className="bg-black/40 rounded-lg px-2.5 py-2 border border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-stone-400">Tiempo transcurrido</span>
            <span className="font-mono text-sm text-[#eab308] font-bold">{fmtTime(elapsed)}</span>
          </div>
          <div data-tour="m3d-velocidad">
            <div className="text-[11px] text-stone-400 mb-1">Velocidad de reproducción</div>
            <div className="flex gap-1.5">
            {[1, 2, 5, 10, 20].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border ${
                  speed === s ? 'bg-[#C4553A] text-white border-[#C4553A]' : 'bg-white/5 text-stone-400 border-white/10'
                }`}
              >
                {s}×
              </button>
            ))}
            </div>
          </div>

          {/* Modelo de velocidades */}
          <div data-tour="m3d-modelo">
            <div className="text-[11px] font-semibold text-stone-300 mb-1.5">Modelo de velocidades</div>
            <div className="flex gap-1.5">
              {([
                ['homogeneous', 'Velocidad constante'],
                ['iasp91', 'IASP91'],
              ] as [TravelModel, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border whitespace-nowrap ${
                    model === m ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white/5 text-stone-400 border-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-stone-500">
              {model === 'homogeneous'
                ? 'Las ondas viajan en línea recta con la Vp y la Vs que elijas.'
                : 'Modelo terrestre: la velocidad cambia con la profundidad según el modelo de referencia mundial IASP91 (Kennett y Engdahl, 1991).'}
            </p>
          </div>

          {/* Cargar evento */}
          <button
            data-tour="m3d-evento"
            onClick={() => setShowEventList(s => !s)}
            className="w-full flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 text-stone-200 text-xs font-bold py-2 rounded-lg"
          >
            <List size={13} /> Cargar evento ({events.length})
          </button>

          {/* Parámetros del medio */}
          <div className="border-t border-white/10 pt-2 space-y-2">
            <div className="text-[11px] font-semibold text-stone-300">Parámetros del medio</div>
            {/* Vp/Vs se muestran en m/s (igual que el Simulador). El estado
                interno sigue en km/s, por eso se multiplica/divide por 1000. */}
            <ParamSlider label="Vp" value={Math.round(vp * 1000)} min={1000} max={8000} step={50} unit="m/s" disabled={model === 'iasp91'} onChange={(v) => setVp(v / 1000)} />
            <ParamSlider label="Vs" value={Math.round(vs * 1000)} min={500} max={5000} step={50} unit="m/s" disabled={model === 'iasp91'} onChange={(v) => setVs(v / 1000)} />
            {model === 'iasp91' && (
              <p className="text-[10px] leading-snug text-stone-500">
                IASP91 usa sus propias velocidades por capa.
              </p>
            )}
            <ParamSlider label="ρ" value={density} min={1800} max={3300} step={50} unit="kg/m³" onChange={setDensity} />
            <ParamSlider label="Prof." value={depthKm} min={0} max={200} step={1} unit="km" onChange={(v) => { setDepthKm(v); if (epicenter) setEpicenter({ ...epicenter, depthKm: v }); }} />
            <Tooltip
              content="Coloca un epicentro o carga un evento primero."
              hoverOnly
              disabled={!!epicenter}
              className="w-full"
              block
            >
              <button
                onClick={() => epicenter && recomputeTravelTimes(epicenter)}
                disabled={!epicenter}
                className="w-full text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 text-stone-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Recalcular con estos valores
              </button>
            </Tooltip>
            {/* Generar reporte del Mapa 3D (PDF/CSV, con opciones). */}
            <Tooltip
              content="Coloca un epicentro o carga un evento primero."
              hoverOnly
              disabled={!!epicenter && travelTimes.length > 0}
              className="w-full"
              block
            >
              <button
                onClick={() => { setReportMsg(null); setReportSaved(false); setShowReport(true); }}
                disabled={!epicenter || travelTimes.length === 0}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-lg bg-[#2D6A4F] text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileDown size={12} /> Generar reporte
              </button>
            </Tooltip>
          </div>

          {/* Detalle de estación seleccionada */}
          {selectedStation && stationDetail && (
            <div className="border-t border-white/10 pt-2 space-y-2">
              <div className="text-[11px] font-semibold text-stone-300">Estación {selectedStation}</div>
              <div className="text-[11px] text-stone-300 space-y-0.5">
                <div>tP: <span className="font-mono">{stationDetail.tP_detectado.toFixed(2)}</span> s, tS: <span className="font-mono">{stationDetail.tS_detectado.toFixed(2)}</span> s</div>
                <div className="text-stone-500">Malla <span className="font-mono">{stationDetail.nx}×{stationDetail.nz}</span>, <span className="font-mono">{stationDetail.tiempo_computo_ms.toFixed(0)}</span> ms, CFL {stationDetail.cfl_ok ? 'ok' : 'ajustado'}</div>
              </div>
              {/* Botón real / sintético */}
              <button
                onClick={() => toggleReal(selectedStation)}
                disabled={realAvailable[selectedStation] === false}
                title={realAvailable[selectedStation] === false ? 'Sin registro para este evento' : 'Alternar señal real o sintética'}
                className={`w-full text-[11px] font-bold py-2 rounded-lg border ${
                  realAvailable[selectedStation] === false
                    ? 'bg-white/5 text-stone-600 border-white/10 cursor-not-allowed'
                    : showReal[selectedStation]
                      ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]'
                      : 'bg-white/5 text-stone-300 border-white/10'
                }`}
              >
                {showReal[selectedStation] ? 'Mostrando señal real' : 'Mostrar señal real'}
              </button>
              <button
                onClick={() => setShowTriaxial(v => !v)}
                className="w-full text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/10 text-stone-300"
              >
                {showTriaxial ? 'Ocultar panel triaxial' : 'Ver panel triaxial (N/E/Z)'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación del epicentro: al hacer clic en el terreno se
          pregunta antes de colocarlo (no se aplica de inmediato). */}
      {epicenterPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setEpicenterPrompt(null)}>
          <div className="bg-[#0f1420] rounded-xl border border-white/10 w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2 flex items-start gap-3">
              <div className="mt-0.5 text-[#C4553A]"><MapPin size={20} /></div>
              <div>
                <h3 className="text-sm font-bold text-stone-100 mb-1">¿Seleccionar este epicentro?</h3>
                <p className="text-[12px] leading-snug text-stone-300">
                  Colocarás el epicentro en{' '}
                  <span className="font-semibold text-stone-100 whitespace-nowrap">
                    {epicenterPrompt.lat.toFixed(3)}°, {epicenterPrompt.lon.toFixed(3)}°
                  </span>{' '}
                  (profundidad {depthKm} km) y se calcularán los tiempos de viaje a cada estación.
                </p>
              </div>
            </div>
            <div className="px-5 py-4 flex gap-2">
              <button
                onClick={() => setEpicenterPrompt(null)}
                className="flex-1 text-xs font-bold py-2 rounded-lg bg-white/5 border border-white/10 text-stone-300"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEpicenter}
                className="flex-1 text-xs font-bold py-2 rounded-lg bg-[#C4553A] text-white"
              >
                Sí, colocar aquí
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación: hay una generación en curso y el usuario pidió
          cargar otro evento/epicentro. Puede reemplazarla o seguir con la actual. */}
      {pendingRequest && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setPendingRequest(null)}>
          <div className="bg-[#0f1420] rounded-xl border border-white/10 w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2 flex items-start gap-3">
              <div className="mt-0.5 text-[#D4A853]"><AlertCircle size={20} /></div>
              <div>
                <h3 className="text-sm font-bold text-stone-100 mb-1">Generación en curso</h3>
                <p className="text-[12px] leading-snug text-stone-300">
                  Se están generando los sismogramas del evento actual.
                  ¿Quieres reemplazarlos por{' '}
                  <span className="font-semibold text-stone-100">
                    {pendingRequest.kind === 'event' ? pendingRequest.ev.label : 'el nuevo epicentro'}
                  </span>?
                </p>
              </div>
            </div>
            <div className="px-5 py-4 flex gap-2">
              <button
                onClick={() => setPendingRequest(null)}
                className="flex-1 text-xs font-bold py-2 rounded-lg bg-white/5 border border-white/10 text-stone-300"
              >
                Seguir con el actual
              </button>
              <button
                onClick={confirmPending}
                className="flex-1 text-xs font-bold py-2 rounded-lg bg-[#C4553A] text-white"
              >
                Cargar el nuevo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal lista de eventos */}
      {showEventList && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowEventList(false)}>
          <div className="bg-[#0f1420] rounded-xl border border-white/10 w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-stone-100">
                Eventos <span className="text-stone-400 font-normal">({filteredRows.length} de {catalogRows.length})</span>
              </h3>
              <button onClick={() => setShowEventList(false)} aria-label="Cerrar lista de eventos" title="Cerrar" className="text-stone-400"><X size={16} /></button>
            </div>
            {/* Filtros (misma lógica que el Explorador) */}
            <div className="px-4 py-2.5 border-b border-white/10 space-y-2">
              <input
                type="text" placeholder="Buscar por fecha, región o id…" value={evFilters.search ?? ''}
                onChange={e => setEvFilters(f => ({ ...f, search: e.target.value }))}
                className="w-full text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
              />
              <div className="grid grid-cols-2 gap-2">
                {/* Región */}
                <select
                  value={evFilters.region ?? 'all'}
                  onChange={e => setEvFilters(f => ({ ...f, region: e.target.value }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                >
                  <option value="all">Región: todas</option>
                  <option value="Colombia">Colombia</option>
                  <option value="Ecuador">Ecuador</option>
                </select>
                {/* Tipo */}
                <select
                  value={evFilters.type ?? 'all'}
                  onChange={e => setEvFilters(f => ({ ...f, type: e.target.value as EventFilters['type'] }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                >
                  <option value="all">Tipo: todos</option>
                  <option value="tectonic">Tectónico</option>
                  <option value="volcanic">Volcánico</option>
                </select>
                {/* Magnitud mín / máx */}
                <input
                  type="number" step="0.1" placeholder="Mag. mín." value={evFilters.minMag ?? ''}
                  onChange={e => setEvFilters(f => ({ ...f, minMag: e.target.value === '' ? null : Number(e.target.value) }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                />
                <input
                  type="number" step="0.1" placeholder="Mag. máx." value={evFilters.maxMag ?? ''}
                  onChange={e => setEvFilters(f => ({ ...f, maxMag: e.target.value === '' ? null : Number(e.target.value) }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                />
                {/* Profundidad (rangos de la leyenda) */}
                <select
                  value={evFilters.depthRange ?? 'all'}
                  onChange={e => setEvFilters(f => ({ ...f, depthRange: e.target.value as DepthRangeId }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                  title="La profundidad usa el valor asumido por la escena (el catálogo no trae profundidad real)"
                >
                  {DEPTH_RANGES.map(d => (
                    <option key={d.id} value={d.id}>{d.id === 'all' ? 'Profundidad: todas' : d.label}</option>
                  ))}
                </select>
                {/* Nº mínimo de estaciones */}
                <input
                  type="number" min="1" placeholder="Mín. estaciones" value={evFilters.minStations ?? ''}
                  onChange={e => setEvFilters(f => ({ ...f, minStations: e.target.value === '' ? null : Number(e.target.value) }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                />
                {/* Rango de fechas */}
                <input
                  type="date" value={evFilters.dateFrom ?? ''}
                  onChange={e => setEvFilters(f => ({ ...f, dateFrom: e.target.value }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                  title="Desde"
                />
                <input
                  type="date" value={evFilters.dateTo ?? ''}
                  onChange={e => setEvFilters(f => ({ ...f, dateTo: e.target.value }))}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-stone-200"
                  title="Hasta"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-stone-500">Ordenar:</span>
                {(['date', 'magnitude'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setEvSort(s)}
                    className={`text-[10px] font-bold px-2 py-1 rounded ${evSort === s ? 'bg-[#2D6A4F] text-white' : 'bg-white/5 text-stone-400'}`}
                  >
                    {s === 'date' ? 'Fecha' : 'Magnitud'}
                  </button>
                ))}
                {hasActiveFilters(evFilters) && (
                  <button
                    onClick={() => setEvFilters(EMPTY_FILTERS)}
                    className="ml-auto text-[10px] font-bold px-2 py-1 rounded bg-white/5 text-[#D4A853] hover:bg-white/10"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto divide-y divide-white/5">
              {filteredRows.map(row => {
                const ev = eventById.get(row.event_id);
                // Campos de la fila SIN puntos medios (separados por comas):
                // magnitud con su tipo, fecha, región y profundidad asumida.
                const parts = [
                  magnitudeLabel(row),
                  row.event_date,
                  row.region ?? '',
                  `Prof. ${assumedDepthKm(row)} km`,
                ].filter(Boolean);
                return (
                  <button
                    key={row.event_id}
                    onClick={() => ev && loadEvent(ev)}
                    disabled={!ev}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 flex items-center gap-2 disabled:opacity-50"
                  >
                    <MapPin size={12} className={row.event_type === 'volcanic' ? 'text-[#C4553A]' : 'text-[#2D6A4F]'} />
                    <span className="text-[11px] text-stone-300 flex-1">{parts.join(', ')}</span>
                    <span className="text-[10px] text-stone-500 whitespace-nowrap">
                      {row.station_count} {row.station_count === 1 ? 'estación' : 'estaciones'}
                    </span>
                  </button>
                );
              })}
              {filteredRows.length === 0 && (
                <div className="px-4 py-6 text-center text-[11px] text-stone-500">Ningún evento coincide con los filtros.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: generar reporte del Mapa 3D */}
      {showReport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowReport(false)}>
          <div className="bg-[#0f1420] rounded-xl border border-white/10 w-full max-w-md overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                <FileDown size={15} className="text-[#2D6A4F]" /> Generar reporte del Mapa 3D
              </h3>
              <button onClick={() => setShowReport(false)} aria-label="Cerrar reporte" title="Cerrar" className="text-stone-400"><X size={16} /></button>
            </div>

            <div className="px-4 py-3 space-y-4">
              {/* Qué incluir */}
              <div>
                <div className="text-[11px] font-semibold text-stone-300 mb-2">¿Qué incluir?</div>
                <div className="space-y-2">
                  {([
                    ['epicentro', 'Epicentro y fuente'],
                    ['parametros', 'Parámetros del medio (Vp, Vs, ρ)'],
                    ['vista3d', 'Vista 3D de la propagación (captura)'],
                    ['mapa', 'Mapa de estaciones (vista superior)'],
                    ['tiemposViaje', 'Tabla de tiempos de viaje por estación'],
                    ['registro', 'Registro sísmico por estación'],
                    ['sismograma', `Sismograma triaxial de la estación${selectedStation ? ` (${selectedStation})` : ' seleccionada'}`],
                  ] as [keyof Map3dReportOptions, string][]).map(([key, label]) => {
                    const disabled = key === 'sismograma' && (!selectedStation || !traces[selectedStation]);
                    return (
                      <label key={key} className={`flex items-center gap-2 text-[11px] ${disabled ? 'text-stone-600' : 'text-stone-300 cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={reportOpts[key] && !disabled}
                          disabled={disabled}
                          onChange={e => { setReportOpts(o => ({ ...o, [key]: e.target.checked })); setReportSaved(false); }}
                          className="accent-[#2D6A4F]"
                        />
                        {label}
                        {disabled && <span className="text-[9px] text-stone-600">(elige una estación)</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Formato */}
              <div>
                <div className="text-[11px] font-semibold text-stone-300 mb-1">Formato</div>
                <div className="flex gap-1.5">
                  {(['pdf', 'csv'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setReportFormat(f)}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border ${
                        reportFormat === f ? 'bg-[#C4553A] text-white border-[#C4553A]' : 'bg-white/5 text-stone-400 border-white/10'
                      }`}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {reportMsg && (
                <div className="text-[10px] text-[#2D6A4F] bg-[#2D6A4F]/10 rounded-lg px-2.5 py-1.5 border border-[#2D6A4F]/20">
                  {reportMsg}
                </div>
              )}

              {/* Acciones: PRIMERO guardar; la descarga (CSV/PDF) se habilita
                  solo DESPUÉS de guardar. Si no hay sesión no se puede guardar,
                  así que se permite descargar directo (con un aviso). */}
              {user ? (
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleSaveReport}
                    disabled={savingReport || reportSaved}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#2D6A4F] text-white text-[12px] font-bold py-2.5 rounded-lg disabled:opacity-60"
                  >
                    {reportSaved ? <Check size={14} /> : <Save size={14} />}
                    {savingReport ? 'Guardando…' : reportSaved ? 'Guardado' : '1. Guardar en Mis Reportes'}
                  </button>
                  <button
                    onClick={handleDownloadReport}
                    disabled={!reportSaved}
                    title={!reportSaved ? 'Primero guarda el reporte' : undefined}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#C4553A] text-white text-[12px] font-bold py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FileDown size={13} /> 2. Descargar {reportFormat.toUpperCase()}
                  </button>
                  {!reportSaved && (
                    <p className="text-[10px] text-stone-500 text-center">Guarda el reporte para habilitar la descarga.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleDownloadReport}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#C4553A] text-white text-[12px] font-bold py-2.5 rounded-lg"
                  >
                    <FileDown size={13} /> Descargar {reportFormat.toUpperCase()}
                  </button>
                  <p className="text-[10px] text-stone-500 text-center">Inicia sesión para guardar el reporte en "Mis Reportes".</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Panel de las 3 componentes N/E/Z con marcas tP y tS. */
function TriaxialTraces({ syn, real }: { syn: SyntheticResult | null; real: WaveformResult | null }) {
  const comps: { label: string; color: string; data: number[]; t: number[] }[] = [];
  if (real) {
    comps.push({ label: 'N', color: '#2D6A4F', data: real.canales.N ?? [], t: real.t });
    comps.push({ label: 'E', color: '#C4553A', data: real.canales.E ?? [], t: real.t });
    comps.push({ label: 'Z', color: '#D4A853', data: real.canales.Z ?? [], t: real.t });
  } else if (syn) {
    comps.push({ label: 'N', color: '#2D6A4F', data: syn.north, t: syn.t });
    comps.push({ label: 'E', color: '#C4553A', data: syn.east, t: syn.t });
    comps.push({ label: 'Z', color: '#D4A853', data: syn.vertical, t: syn.t });
  }
  if (comps.length === 0) return <div className="text-[10px] text-stone-500">Sin datos.</div>;

  const tP = syn?.tP_detectado ?? null;
  const tS = syn?.tS_detectado ?? null;
  const w = 900, h = 54;
  const tMax = comps[0].t[comps[0].t.length - 1] || 1;

  const path = (data: number[], t: number[]) => {
    let maxAbs = 1e-9;
    for (const v of data) maxAbs = Math.max(maxAbs, Math.abs(v));
    const pts: string[] = [];
    const step = Math.max(1, Math.floor(data.length / w));
    for (let i = 0; i < data.length; i += step) {
      const x = (t[i] / tMax) * w;
      const y = h / 2 - (data[i] / maxAbs) * (h / 2 - 3);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.length > 1 ? `M ${pts.join(' L ')}` : '';
  };

  return (
    <div className="space-y-1">
      {comps.map(c => (
        <div key={c.label} className="flex items-center gap-2">
          <span className="text-[11px] font-semibold w-3" style={{ color: c.color }}>{c.label}</span>
          <svg viewBox={`0 0 ${w} ${h}`} className="flex-1 h-[54px] bg-black/30 rounded" preserveAspectRatio="none">
            <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#334155" strokeWidth={0.5} />
            {/* Marca P y S (solo si tenemos tiempos del sintético) */}
            {tP != null && !real && <line x1={(tP / tMax) * w} y1={0} x2={(tP / tMax) * w} y2={h} stroke="#E07A5F" strokeWidth={1} />}
            {tS != null && !real && <line x1={(tS / tMax) * w} y1={0} x2={(tS / tMax) * w} y2={h} stroke="#3DA06F" strokeWidth={1} />}
            <path d={path(c.data, c.t)} fill="none" stroke={c.color} strokeWidth={0.8} />
          </svg>
        </div>
      ))}
      {!real && tP != null && (
        <div className="flex gap-3 text-[11px]">
          <span className="text-[#E07A5F]">P <span className="font-mono">{tP.toFixed(2)}</span> s</span>
          <span className="text-[#3DA06F]">S <span className="font-mono">{tS?.toFixed(2)}</span> s</span>
        </div>
      )}
    </div>
  );
}

/** Slider compacto con estética oscura para el panel de parámetros. */
function ParamSlider({ label, value, min, max, step, unit, onChange, disabled = false }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-stone-400">{label}</span>
        <span className="text-stone-200"><span className="font-mono">{value}</span> <span className="text-stone-500">{unit}</span></span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))} className="w-full disabled:cursor-not-allowed" />
    </div>
  );
}
